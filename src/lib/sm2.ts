// 改进版 SM-2 间隔重复调度引擎（纯函数，便于测试与调优）
import { SRS_CONFIG } from './config';
import { displayPriority } from './priority';
import type { Grade, MemoryRecord, WordEntry } from './types';

const MIN = 60_000;

export function createRecord(userId: string, wordId: string, now: number): MemoryRecord {
  return {
    user_id: userId,
    word_id: wordId,
    ef: SRS_CONFIG.ef_init,
    reps: 0,
    lapses: 0,
    interval_min: 0,
    next_review_at: now + SRS_CONFIG.steps_min[0] * MIN, // 新词 10 分钟后第一次回顾
    last_grade: 2,
    status: 'learning',
    wrong_count: 0,
    starred: false,
    slain: false,
    created_at: now,
    updated_at: now,
  };
}

function ladderIndex(intervalMin: number): number {
  const steps = SRS_CONFIG.steps_min;
  let idx = 0;
  for (let i = 0; i < steps.length; i++) if (intervalMin >= steps[i]) idx = i;
  return idx;
}

/**
 * 核心调度：根据三档自评更新记忆记录（原地修改并返回）。
 * grade: 0 忘记 / 1 模糊 / 2 认识
 */
export function schedule(rec: MemoryRecord, grade: Grade, now: number): MemoryRecord {
  const C = SRS_CONFIG;
  rec.last_grade = grade;
  rec.updated_at = now;

  if (grade === 0) {
    // 忘记：重置强度，10 分钟后回到重学队列
    rec.ef = Math.max(C.ef_min, rec.ef - C.penalty_again);
    rec.reps = 0;
    rec.lapses += 1;
    rec.interval_min = C.relearn_min;
    rec.status = 'learning';
  } else if (grade === 1) {
    // 模糊：间隔缩短一档，当次会话内再次出现（由会话层处理）
    rec.ef = Math.max(C.ef_min, rec.ef - C.penalty_hard);
    const idx = ladderIndex(rec.interval_min);
    rec.interval_min = C.steps_min[Math.max(0, idx - C.hard_step_back)];
    rec.status = rec.interval_min >= C.master_interval_min ? 'mastered' : 'learning';
  } else {
    // 认识：阶梯递增，阶梯走完后按 ef 扩展
    rec.ef = rec.ef + C.bonus_good;
    const base = rec.reps < C.steps_min.length
      ? C.steps_min[rec.reps]
      : rec.interval_min * rec.ef;
    rec.interval_min = Math.round(base);
    rec.reps += 1;
    rec.status = rec.interval_min >= C.master_interval_min ? 'mastered' : 'review';
  }
  rec.next_review_at = now + rec.interval_min * MIN;
  return rec;
}

export function isDue(rec: MemoryRecord, now: number): boolean {
  return !rec.slain && rec.status !== 'new' && rec.next_review_at <= now;
}

/** 到期复习词：按过期程度降序（最久没复习的优先） */
export function dueWords(records: Record<string, MemoryRecord>, now: number): string[] {
  return Object.values(records)
    .filter((r) => isDue(r, now))
    .sort((a, b) => a.next_review_at - b.next_review_at)
    .map((r) => r.word_id);
}

/** 每日确定性扰动（0–1）：让排序键随日期轮换，打破固定顺序但不破坏优先级主序 */
function dayJitter(id: string, day: number): number {
  const s = id + ':' + day;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * 新词挑选（重点词加权，不修改 SM-2 调度）：
 * 1. 阅读标记生词（starred ∧ status=new）置顶，按标记时间先后
 * 2. 约 70% 名额按展示优先级（热频分×大纲×遗忘风险）取 → 四级重点词(S/A)高频出现
 * 3. 约 30% 名额从分层轮换池补足 → 非重点词按合理频率持续出现（每日轮换起点）
 */
export function pickNewWords(
  words: WordEntry[],
  records: Record<string, MemoryRecord>,
  dailyNew: number,
  now: number,
): string[] {
  const pool = words.filter((w) => {
    const r = records[w.id];
    return (!r || r.status === 'new') && !r?.slain;
  });
  const starredNew: string[] = [];
  const rest: WordEntry[] = [];
  for (const w of pool) {
    const r = records[w.id];
    if (r && r.starred) starredNew.push(w.id);
    else rest.push(w);
  }
  starredNew.sort((a, b) => records[a].created_at - records[b].created_at);
  if (starredNew.length >= dailyNew) return starredNew.slice(0, dailyNew);

  const day = Math.floor(now / 86400_000);
  const quotaHot = Math.round(dailyNew * 0.7);
  const picked: string[] = [];
  const seen = new Set<string>();

  // 70% 名额：按展示优先级（重点词天然靠前）+ 每日扰动
  const byPriority = [...rest].sort((a, b) => {
    const pa = displayPriority(a, records[a.id], now) + 0.1 * dayJitter(a.id, day);
    const pb = displayPriority(b, records[b.id], now) + 0.1 * dayJitter(b.id, day);
    return pb - pa;
  });
  for (const w of byPriority) {
    if (picked.length >= quotaHot) break;
    if (!seen.has(w.id)) { seen.add(w.id); picked.push(w.id); }
  }

  // 30% 名额：三层大纲轮流取样（tier 0/1/2 各自按字母序，起点随日期轮换）
  const tierLists: WordEntry[][] = [[], [], []];
  for (const w of rest) tierLists[w.tier].push(w);
  for (const list of tierLists) list.sort((a, b) => a.word.localeCompare(b.word));
  const interleaved: WordEntry[] = [];
  const cursors = [0, 0, 0];
  const total = rest.length;
  for (let pass = 0; pass < Math.max(1, total); pass++) {
    let progressed = false;
    for (let t = 0; t < 3; t++) {
      const tier = (day + t) % 3;
      if (cursors[tier] < tierLists[tier].length) {
        interleaved.push(tierLists[tier][cursors[tier]++]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  const rot = day % Math.max(1, interleaved.length);
  const rotated = [...interleaved.slice(rot), ...interleaved.slice(0, rot)];
  for (const w of rotated) {
    if (picked.length >= dailyNew) break;
    if (!seen.has(w.id)) { seen.add(w.id); picked.push(w.id); }
  }

  return [...starredNew.slice(0, dailyNew), ...picked].slice(0, dailyNew);
}

/**
 * 今日任务 = 到期复习（始终优先）+ 适量新词（防复习雪崩）
 * 返回 { due, news, paused } — paused=true 表示因复习量过大暂停新词
 */
export function buildTodayQueue(
  words: WordEntry[],
  records: Record<string, MemoryRecord>,
  dailyNew: number,
  now: number,
): { due: string[]; news: string[]; paused: boolean } {
  const due = dueWords(records, now);
  const paused = due.length > dailyNew * SRS_CONFIG.avalanche_ratio;
  let news: string[] = [];
  if (!paused) {
    news = pickNewWords(words, records, dailyNew, now);
  }
  return { due, news, paused };
}

/** 今天是否还需要「当天结束回顾」（新词学过且 10 分钟回顾已完成） */
export function needsEveningReview(rec: MemoryRecord, now: number): boolean {
  if (!SRS_CONFIG.same_day_review) return false;
  const createdDay = new Date(rec.created_at).toDateString();
  const today = new Date(now).toDateString();
  return createdDay === today && rec.reps >= 1 && rec.next_review_at <= now;
}

// 内容优先级引擎（纯函数）：热频分 + 遗忘风险 → 展示/调度优先级
// fs 由构建脚本写入（scripts/add-frequency-score.py），此处不修改任何 SM-2 调度逻辑
import type { HeatGrade, MemoryRecord, WordEntry } from './types';

/** 大纲层级权重：真题高频 1.0 / 核心 0.8 / 大纲 0.6 */
const SYLLABUS_W: Record<number, number> = { 0: 1, 1: 0.8, 2: 0.6 };

/** 热度档位：S 真题高频 / A 核心必考 / B 常考 / C 一般 / D 低频 */
export function heatGrade(fs: number | undefined, tier?: number): HeatGrade {
  const score = fs ?? (tier !== undefined ? [100, 70, 40][tier] : 0);
  return score >= 90 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : 'D';
}

export function isHot(g: HeatGrade): boolean {
  return g === 'S' || g === 'A';
}

/**
 * 遗忘风险 0.05–1：距上次评分的流逝时间 ÷ 记忆稳定度（间隔×ef 缩放），lapses 加成。
 * 无记录（未学）→ 0.9（高频新词最值得投入）；已斩词 → 0.05。
 */
export function forgettingRisk(rec: MemoryRecord | undefined, now: number): number {
  if (!rec) return 0.9;
  if (rec.slain) return 0.05;
  const stability = Math.max(rec.interval_min, 10) * (rec.ef / 2.5);
  const elapsed = Math.max(0, now - rec.updated_at);
  const raw = (elapsed / stability) * (1 + 0.1 * rec.lapses);
  return Math.min(1, Math.max(0.05, raw));
}

/** 展示优先级 = 热频分 × 大纲权重 × 遗忘风险（0–1，越大越应优先呈现） */
export function displayPriority(word: WordEntry, rec: MemoryRecord | undefined, now: number): number {
  const fs = word.fs ?? (word.tier !== undefined ? [100, 70, 40][word.tier] : 0);
  return (fs / 100) * (SYLLABUS_W[word.tier] ?? 0.6) * forgettingRisk(rec, now);
}

/** 每日重点词：未掌握 ∧ 非斩词，按展示优先级降序取前 n */
export function topFocusWords(
  words: WordEntry[],
  records: Record<string, MemoryRecord>,
  now: number,
  n = 8,
): WordEntry[] {
  return words
    .filter((w) => {
      const r = records[w.id];
      return !r || (!r.slain && r.status !== 'mastered');
    })
    .map((w) => ({ w, p: displayPriority(w, records[w.id], now) }))
    .sort((a, b) => b.p - a.p || a.w.tier - b.w.tier)
    .slice(0, n)
    .map(({ w }) => w);
}

/** 高频冲刺词池：热度 S/A ∧ 未掌握 ∧ 非斩词 */
export function sprintWords(
  words: WordEntry[],
  records: Record<string, MemoryRecord>,
): WordEntry[] {
  return words.filter((w) => {
    const r = records[w.id];
    if (r && (r.slain || r.status === 'mastered')) return false;
    return isHot(heatGrade(w.fs, w.tier));
  });
}

/** 复习队列重排：错词本 ∧ 热度 S/A 的到期词置顶（保持原有过期程度排序的相对顺序） */
export function prioritizeDue(
  dueIds: string[],
  records: Record<string, MemoryRecord>,
  wordMap: Map<string, WordEntry>,
): string[] {
  const hotWrong: string[] = [];
  const rest: string[] = [];
  for (const id of dueIds) {
    const r = records[id];
    const w = wordMap.get(id);
    if (r && r.wrong_count > 0 && w && isHot(heatGrade(w.fs, w.tier))) hotWrong.push(id);
    else rest.push(id);
  }
  return [...hotWrong, ...rest];
}

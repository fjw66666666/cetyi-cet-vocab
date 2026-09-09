// 游戏化：成就徽章定义与检查、连胜、词汇量测试选题
import type { AppState, WordEntry } from './types';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string; // lucide 图标名（在页面映射）
  test: (s: AppState) => boolean;
}

function totalDays(s: AppState): number {
  return Object.values(s.days).filter((d) => d.newLearned + d.reviewed > 0).length;
}

export function masteredCount(s: AppState): number {
  return Object.values(s.records).filter((r) => r.status === 'mastered' || r.slain).length;
}

export function learnedCount(s: AppState): number {
  return Object.values(s.records).filter((r) => r.status !== 'new').length;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-step', name: '初来乍到', desc: '完成第 1 个单词的学习', icon: 'Footprints', test: (s) => learnedCount(s) >= 1 },
  { id: 'word-100', name: '百词斩将', desc: '累计学习 100 词', icon: 'BookOpen', test: (s) => learnedCount(s) >= 100 },
  { id: 'master-100', name: '小有所成', desc: '累计掌握 100 词', icon: 'Sprout', test: (s) => masteredCount(s) >= 100 },
  { id: 'master-1000', name: '千词大关', desc: '累计掌握 1000 词', icon: 'Trophy', test: (s) => masteredCount(s) >= 1000 },
  { id: 'streak-3', name: '三日之约', desc: '连续学习 3 天', icon: 'Flame', test: (s) => s.streak.best >= 3 },
  { id: 'streak-7', name: '连续 7 天', desc: '连续学习 7 天', icon: 'Flame', test: (s) => s.streak.best >= 7 },
  { id: 'streak-30', name: '月度铁人', desc: '连续学习 30 天', icon: 'Crown', test: (s) => s.streak.best >= 30 },
  { id: 'perfect-day', name: '百发百中', desc: '单日测验 20 题以上且全对', icon: 'Target', test: (s) => Object.values(s.days).some((d) => d.correct >= 20 && d.wrong === 0) },
  { id: 'early-bird', name: '早起的鸟', desc: '在 8 点前完成学习', icon: 'Sunrise', test: (s) => Object.keys(s.days).some((k) => s.days[k].newLearned + s.days[k].reviewed > 0 && new Date(k + 'T08:00:00').getTime() > 0 && earlyCheck(s)) },
  { id: 'night-owl', name: '深夜书房', desc: '在 23 点后仍在学习', icon: 'Moon', test: (s) => lateCheck(s) },
  { id: 'vocab-test', name: '知己知彼', desc: '完成一次词汇量小测', icon: 'Ruler', test: (s) => s.vocabTests.length >= 1 },
  { id: 'week-active', name: '七日全勤', desc: '累计 7 天有学习记录', icon: 'CalendarCheck', test: (s) => totalDays(s) >= 7 },
];

// 早晚打卡需要时间维度，简化实现：以当日日志存在且 localStorage 中记录的首次时间戳判断
// 这里用近似：只要当天产生过学习行为，就按当前小时在写入时判断（在 grade 中由 checkAchievements 间接触发）
function earlyCheck(s: AppState): boolean {
  return Boolean((s as unknown as { __early?: boolean }).__early);
}
function lateCheck(s: AppState): boolean {
  return Boolean((s as unknown as { __late?: boolean }).__late);
}

export function markHourFlags(s: AppState, hour: number) {
  const anyS = s as unknown as { __early?: boolean; __late?: boolean };
  if (hour < 8) anyS.__early = true;
  if (hour >= 23) anyS.__late = true;
}

export function checkAchievements(s: AppState): string[] {
  const unlocked = new Set(s.achievements);
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.test(s)) unlocked.add(a.id);
  }
  return [...unlocked];
}

/** 词汇量小测选题：按 tier 分层抽样，覆盖高/中/低频 */
export function pickVocabTest(words: WordEntry[], n = 24): WordEntry[] {
  const tiers: WordEntry[][] = [[], [], []];
  words.forEach((w) => tiers[w.tier]?.push(w));
  const quota = [Math.round(n * 0.3), Math.round(n * 0.4), n - Math.round(n * 0.3) - Math.round(n * 0.4)];
  const picked: WordEntry[] = [];
  tiers.forEach((list, i) => {
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    picked.push(...shuffled.slice(0, quota[i]));
  });
  return picked.sort(() => Math.random() - 0.5);
}

/** 词汇量估算：认识比例 × 当前词书总量（粗略但稳定的相对指标） */
export function estimateVocab(known: number, total: number, bankSize: number): number {
  if (total === 0) return 0;
  return Math.round((known / total) * bankSize / 10) * 10;
}

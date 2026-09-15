// 出题素材工具（纯函数，无副作用、不读 store）
// T3：从 Review.tsx 抽出 shuffle / pickDistractors，并新增 buildMeaningChoice（供 Learn 即时检验复用）
import type { WordEntry } from './types';

/** 选择题选项 */
export interface Choice {
  key: string;
  text: string;
  correct: boolean;
}

/** Fisher–Yates 之外更简洁的随机洗牌（保持既有实现语义） */
export function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

/** 同 tier 优先、跨 tier 兜底，取 n 个干扰项（保持 Review.tsx 原语义） */
export function pickDistractors(word: WordEntry, pool: WordEntry[], n: number): WordEntry[] {
  const sameTier = pool.filter((w) => w.id !== word.id && w.tier === word.tier);
  const rest = pool.filter((w) => w.id !== word.id && w.tier !== word.tier);
  return shuffle([...sameTier, ...rest]).slice(0, n);
}

/** 中文释义 4 选 1（正确项 = word，干扰项来自 pool）；选项文案与 Review 的 en2zh 保持一致 */
export function buildMeaningChoice(word: WordEntry, pool: WordEntry[], n = 4): Choice[] {
  const distractors = pickDistractors(word, pool, n - 1);
  return shuffle([word, ...distractors]).map((w) => ({
    key: w.id,
    text: `${w.pos ?? ''} ${w.meanings[0]}`.trim(),
    correct: w.id === word.id,
  }));
}

// 词战长空 · 干扰项生成（纯逻辑，可单测）
// 5 级降级链：confusables(0.39%) → 同tier同pos(主路径) → 同tier → 任意tier → 降级接受。
// 每级都必须叠加「语义重叠过滤」，排序用 isHot(heatGrade) 口径，禁用 S 档单筛。
import type { WordEntry } from '@/lib/types';
import { heatGrade, isHot } from '@/lib/priority';
import { DIFFICULTY } from './constants';
import { isValidGameWord } from './wordPool';
import type { DistractorSource, GameOption, Question, WaveQuizType } from './types';

/** 提取字符串中所有长度 ≥2 的连续中文子串 */
const CJK_RE = /[\u4e00-\u9fa5]{2,}/g;

/** 从一组义项中收集中文词素集合 */
function collectCjk(meanings: readonly string[]): Set<string> {
  const grams = new Set<string>();
  for (const m of meanings) {
    const matched = m.match(CJK_RE);
    if (!matched) continue;
    for (const g of matched) grams.add(g);
  }
  return grams;
}

/**
 * 两个词是否存在中文语义重叠（严禁两个选项都能算对）。
 * 规则①：长度 ≥2 连续中文子串匹配（含互相包含）
 * 规则②：首义项包含校验（选项只展示 meanings[0]）
 */
export function hasSemanticOverlap(a: WordEntry, b: WordEntry): boolean {
  const gramsA = collectCjk(a.meanings);
  for (const m of b.meanings) {
    const matched = m.match(CJK_RE);
    if (!matched) continue;
    for (const g of matched) {
      if (gramsA.has(g)) return true;
      for (const ga of gramsA) {
        if (ga.includes(g) || g.includes(ga)) return true;
      }
    }
  }
  const t0 = a.meanings[0] ?? '';
  const c0 = b.meanings[0] ?? '';
  return t0.length > 0 && c0.length > 0 && (t0 === c0 || t0.includes(c0) || c0.includes(t0));
}

/**
 * 解析 confusables 字段 → 命中词池的词（未命中静默跳过）。
 * 字段形如 "abundant adj. 丰富的"，取 split(/[\s（(]/)[0].toLowerCase() 回查 Map。
 */
export function parseConfusables(entry: WordEntry, map: Map<string, WordEntry>): WordEntry[] {
  if (!entry.confusables || entry.confusables.length === 0) return [];
  const out: WordEntry[] = [];
  const seen = new Set<string>();
  for (const raw of entry.confusables) {
    const token = raw.split(/[\s（(]/)[0].toLowerCase();
    if (!token || token === entry.id || seen.has(token)) continue;
    const w = map.get(token);
    if (!w) continue; // 未命中 → 静默跳过
    if (!isValidGameWord(w)) continue;
    seen.add(token);
    out.push(w);
  }
  return out;
}

/** pos 三级匹配：0 = 精确相等，1 = 主词性（'/'前第一段）相同，2 = 忽略 pos */
function posMatchLevel(a: string | undefined, b: string | undefined, level: number): boolean {
  if (level >= 2) return true;
  if (level === 0) return !!a && a === b;
  // level 1：主词性相同
  const fa = a ? a.split('/')[0].trim() : '';
  const fb = b ? b.split('/')[0].trim() : '';
  return fa.length > 0 && fa === fb;
}

/**
 * 对候选集做语义过滤 + 排序，取前 n 个。
 * 排序：isHot 优先 → heatGrade 档位高者优先 → fs 降序 → rand 打破并列。
 */
function rankAndFilter(
  candidates: WordEntry[],
  target: WordEntry,
  n: number,
  rand: () => number,
): WordEntry[] {
  const tierRank: Record<string, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
  const filtered = candidates.filter(
    (w) => w.id !== target.id && !hasSemanticOverlap(target, w),
  );
  const decorated = filtered.map((w) => {
    const g = heatGrade(w.fs, w.tier);
    return {
      w,
      hot: isHot(g) ? 1 : 0,
      rank: tierRank[g] ?? 0,
      fs: w.fs ?? 0,
      r: rand(),
    };
  });
  decorated.sort((x, y) => {
    if (x.hot !== y.hot) return y.hot - x.hot;
    if (x.rank !== y.rank) return y.rank - x.rank;
    if (x.fs !== y.fs) return y.fs - x.fs;
    return x.r - y.r;
  });
  return decorated.slice(0, n).map((d) => d.w);
}

/**
 * §4.4 五级降级链：返回干扰项数组（可能 1..3 个）与来源分级。
 * 步骤1 confusables → 步骤2 同tier同pos → 步骤3a 同tier → 步骤3b 任意tier → 步骤4 降级接受。
 */
export function buildDistractors(
  target: WordEntry,
  pool: WordEntry[],
  map: Map<string, WordEntry>,
  rand: () => number,
): { items: WordEntry[]; source: DistractorSource } {
  const need = DIFFICULTY.optionsCount; // 3
  const picked: WordEntry[] = [];
  const pickedIds = new Set<string>([target.id]);

  const pushUnique = (list: WordEntry[], limit: number): number => {
    let added = 0;
    for (const w of list) {
      if (picked.length >= limit) break;
      if (pickedIds.has(w.id)) continue;
      pickedIds.add(w.id);
      picked.push(w);
      added += 1;
    }
    return added;
  };

  // ---- 步骤1：confusables（锦上添花，命中率 <1%）----
  const conf = rankAndFilter(parseConfusables(target, map), target, need, rand);
  if (conf.length >= need) {
    return { items: conf.slice(0, need), source: 'confusable' };
  }
  pushUnique(conf, need);
  if (picked.length >= need) {
    return { items: picked.slice(0, need), source: 'confusable' };
  }

  // ---- 步骤2（主路径）：同 tier + 同 pos（pos 三级匹配）----
  let level2: WordEntry[] = [];
  for (let lvl = 0; lvl <= 2; lvl += 1) {
    const cands = pool.filter(
      (w) =>
        w.id !== target.id &&
        w.tier === target.tier &&
        posMatchLevel(w.pos, target.pos, lvl),
    );
    level2 = rankAndFilter(cands, target, need, rand);
    if (level2.length >= need) break;
  }
  pushUnique(level2, need);
  if (picked.length >= need) {
    return { items: picked.slice(0, need), source: 'same-tier-pos' };
  }

  // ---- 步骤3a：同 tier 任意 pos ----
  const sameTier = rankAndFilter(
    pool.filter((w) => w.id !== target.id && w.tier === target.tier),
    target,
    need,
    rand,
  );
  pushUnique(sameTier, need);
  if (picked.length >= need) {
    return { items: picked.slice(0, need), source: 'same-tier' };
  }

  // ---- 步骤3b：任意 tier 任意 pos ----
  const anyTier = rankAndFilter(
    pool.filter((w) => w.id !== target.id),
    target,
    need,
    rand,
  );
  pushUnique(anyTier, need);
  if (picked.length >= need) {
    return { items: picked.slice(0, need), source: 'any-tier' };
  }

  // ---- 步骤4：降级接受（≥1 即可出题，调用方负责 warn / 换词）----
  return { items: picked.slice(0, need), source: 'partial' };
}

/**
 * 组装完整题（含选项文案、shuffle、正确位去重）。
 * en2zh 选项文案 = 候选词 meanings[0]；zh2en / listen 选项文案 = 候选词 word。
 * 保证 correctIndex !== lastCorrectIndex（同一单词正确位不连续重复）。
 * 干扰项为 0 个时返回 null，由调用方换词重选。
 */
export function buildQuestion(
  target: WordEntry,
  pool: WordEntry[],
  map: Map<string, WordEntry>,
  quizType: WaveQuizType,
  lastCorrectIndex: number | undefined,
  rand: () => number,
): Question | null {
  const { items, source } = buildDistractors(target, pool, map, rand);
  if (items.length < 1) return null;

  const optionText = (w: WordEntry): string => {
    if (quizType === 'en2zh') {
      const meaning = w.meanings[0] ?? '';
      return w.pos ? `${w.pos} ${meaning}`.trim() : meaning;
    }
    return w.word;
  };

  const correct: GameOption = {
    key: target.id,
    text: optionText(target),
    correct: true,
  };
  const wrong: GameOption[] = items.map((w) => ({
    key: w.id,
    text: optionText(w),
    correct: false,
  }));

  // Fisher–Yates 洗牌（比 sort(() => Math.random()-0.5) 更均匀）
  const all: GameOption[] = [correct, ...wrong];
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }

  let correctIndex = all.findIndex((o) => o.correct);
  // 保证正确位不与上次相同：若相同则与另一个位置交换
  if (
    all.length >= 2 &&
    lastCorrectIndex !== undefined &&
    correctIndex === lastCorrectIndex
  ) {
    const swapWith = (correctIndex + 1) % all.length;
    const tmp = all[correctIndex];
    all[correctIndex] = all[swapWith];
    all[swapWith] = tmp;
    correctIndex = swapWith;
  }

  return {
    wordId: target.id,
    entry: target,
    quizType,
    options: all,
    correctIndex,
    source,
  };
}

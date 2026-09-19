// 词战长空 · 词池过滤与选词（纯逻辑，可单测）
// 过滤规则严格对照 PRD §4.1：功能词性 / 显式黑名单 / len≤2 兜底，且 len≥3 一律保留。
import type { Tier, WordEntry } from '@/lib/types';
import { heatGrade, isHot } from '@/lib/priority';
import { FUNC_POS, POOL_MIN, SHORT_BLACKLIST } from './constants';

/**
 * 判断词性是否为功能词性（冠词/代词/介词/连词/助动词/限定词/感叹词/数词）。
 * 复合词性取 `/` 前第一段：'adj./n.' → 'adj.'；同时兼容前缀命中（'prep./adv.' → 'prep.'）。
 * @param pos 原始 pos 字符串，可能为 undefined（全库有 36 条空 pos）
 */
function isFuncPos(pos: string | undefined): boolean {
  if (!pos) return false;
  const first = pos.split('/')[0].trim();
  return FUNC_POS.some((p) => first === p || pos.startsWith(p));
}

/**
 * 单个词是否可进入游戏词池（PRD §4.1 三级判据 + 反误杀保护）。
 * ① pos 功能词性 → 剔除
 * ② 显式短词黑名单 → 剔除
 * ③ word.length <= 2 → 剔除
 * 保护：len >= 3 一律保留（防误杀 aim / jam / jet / new / old）
 */
export function isValidGameWord(w: WordEntry): boolean {
  if (isFuncPos(w.pos)) return false;
  if (SHORT_BLACKLIST.has(w.id)) return false;
  if (w.word.length <= 2) return false;
  return true;
}

/**
 * useWords() 的 Map → 过滤后词池数组（**只读遍历，不改动入参**）。
 * 若过滤后规模 < POOL_MIN（20），放弃过滤返回全量，保可玩性优先。
 */
export function buildGamePool(map: Map<string, WordEntry>): WordEntry[] {
  const out: WordEntry[] = [];
  for (const w of map.values()) {
    if (isValidGameWord(w)) out.push(w);
  }
  if (out.length < POOL_MIN) return [...map.values()];
  return out;
}

/**
 * 按波次给出允许的 tier 集合（难度渐进）。
 * 前 2 波仅 tier0；3–6 波放开 tier1；7 波起全放开。
 */
export function tierBandForWave(wave: number): Tier[] {
  if (wave <= 2) return [0];
  if (wave <= 6) return [0, 1];
  return [0, 1, 2];
}

/** tier 基础权重：tier 越大越靠后，基础权重越低；随波次再叠加修正 */
const TIER_BASE_W: Record<Tier, number> = { 0: 1.0, 1: 0.7, 2: 0.45 };

/**
 * 从池中选一道题的目标词（不重复优先 + 热度/难度加权）。
 * 权重 = base(tier) × hotBonus × unseenBonus；未被本局选过的词 unseenBonus 更高。
 * 若候选为空返回 null（调用方换词/结束）。
 * @param pool 过滤后的词池
 * @param wave 当前波次（从 1 起）
 * @param seenIds 本局已出现过的词 id 集合
 * @param rand 随机源（0..1），注入以便测试
 */
export function pickQuestionEntry(
  pool: WordEntry[],
  wave: number,
  seenIds: ReadonlySet<string>,
  rand: () => number,
): WordEntry | null {
  if (pool.length === 0) return null;
  const band = tierBandForWave(wave);
  // 候选：优先限定在允许的 tier 区间内；若为空则全池兜底
  let candidates = pool.filter((w) => band.includes(w.tier));
  if (candidates.length === 0) candidates = pool;

  // 计算权重
  const weights: number[] = new Array(candidates.length);
  let total = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const w = candidates[i];
    const base = TIER_BASE_W[w.tier] ?? 0.5;
    const hot = isHot(heatGrade(w.fs, w.tier)) ? 1.6 : 1.0;
    const unseen = seenIds.has(w.id) ? 0.15 : 1.0;
    const weight = base * hot * unseen;
    weights[i] = weight;
    total += weight;
  }
  if (total <= 0) {
    // 极端兜底：均权随机
    const idx = Math.min(candidates.length - 1, Math.floor(rand() * candidates.length));
    return candidates[idx];
  }
  // 加权轮盘
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

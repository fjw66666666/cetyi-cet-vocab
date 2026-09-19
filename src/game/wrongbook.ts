// 词战长空 · 游戏错词本（唯一触碰 localStorage 的模块）
// 只新增 cetyi.game.wrongbook.v1 键；对 cetyi.v1 全程只读，绝不调用 store.grade()。
import type { WordEntry } from '@/lib/types';
import { GAME_WRONG_PASS_STREAK, WRONGBOOK_KEY } from './constants';
import type { WrongBook, WrongWordEntry } from './types';

/**
 * 读取游戏错词本。JSON 损坏 / 结构非法 → 返回 {}，不抛错、不清空其它键。
 */
export function loadWrongBook(): WrongBook {
  try {
    const raw = localStorage.getItem(WRONGBOOK_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: WrongBook = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const e = v as Record<string, unknown>;
      if (typeof e.word !== 'string' || typeof e.wrongCount !== 'number') continue;
      out[k] = {
        word: e.word,
        wrongCount: e.wrongCount,
        lastWrongAt: typeof e.lastWrongAt === 'number' ? e.lastWrongAt : 0,
        correctStreak: typeof e.correctStreak === 'number' ? e.correctStreak : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** 持久化游戏错词本；存储满 / 不可用时静默失败 */
export function saveWrongBook(book: WrongBook): void {
  try {
    localStorage.setItem(WRONGBOOK_KEY, JSON.stringify(book));
  } catch {
    /* 静默失败 */
  }
}

/**
 * 记录一次答错/超时。返回新对象（不原地改入参）。
 * wrongCount += 1，correctStreak = 0，lastWrongAt = now。
 */
export function recordWrong(book: WrongBook, id: string, word: string, now: number): WrongBook {
  const prev = book[id];
  const entry: WrongWordEntry = {
    word,
    wrongCount: (prev?.wrongCount ?? 0) + 1,
    lastWrongAt: now,
    correctStreak: 0,
  };
  return { ...book, [id]: entry };
}

/**
 * 记录一次答对（仅当该词已在错词本中时才有意义）。
 * correctStreak += 1；达到 GAME_WRONG_PASS_STREAK（2）→ 删除该 key。返回新对象。
 * 若该词不在错词本，原样返回（浅拷贝，保持不可变语义）。
 */
export function recordCorrect(book: WrongBook, id: string): WrongBook {
  const prev = book[id];
  if (!prev) return { ...book };
  const nextStreak = prev.correctStreak + 1;
  if (nextStreak >= GAME_WRONG_PASS_STREAK) {
    const next = { ...book };
    delete next[id];
    return next;
  }
  return {
    ...book,
    [id]: { ...prev, correctStreak: nextStreak },
  };
}

/** 该词是否在错词本中 */
export function isInWrongBook(book: WrongBook, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(book, id);
}

/**
 * 错词本现存词 → WordEntry[]（用于「专攻错词」）。
 * 说明：本模块不 import wordPool，以保持 §3.3 的模块依赖边界（wrongbook 只依赖 types/constants）。
 * 词池过滤由调用方（useGameWords）执行，并对过滤后为空的情形回退到未过滤结果以防空局。
 */
export function wrongPoolEntries(book: WrongBook, map: Map<string, WordEntry>): WordEntry[] {
  const raw: WordEntry[] = [];
  for (const id of Object.keys(book)) {
    const w = map.get(id);
    if (w) raw.push(w);
  }
  return raw;
}

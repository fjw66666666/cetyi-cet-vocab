// 词战长空 · 词池派生 Hook（纯 useMemo 派生，不加载）
// 词库已由全局 WordsProvider 加载；本 Hook 仅做筛选与错词池派生。
import { useMemo } from 'react';
import { useWords } from '@/hooks/useWords';
import type { WordEntry } from '@/lib/types';
import { buildGamePool, isValidGameWord } from './wordPool';
import { wrongPoolEntries } from './wrongbook';
import type { WrongBook } from './types';

export interface GamePoolResult {
  /** 全量过滤后词池（普通模式的题目来源；也是所有模式的干扰项来源） */
  pool: WordEntry[];
  /** 错词池（仅专攻错词模式使用；同样经过词池过滤） */
  wrongPool: WordEntry[];
  /** 原始全局 Map（distractors 需要用于 confusables 回查） */
  map: Map<string, WordEntry>;
  /** 有效题目池规模（普通模式 = pool.length；专攻错词 = wrongPool.length） */
  size: number;
}

/**
 * 派生游戏词池。
 * @param mode 局内玩法模式
 * @param wrongbook 游戏错词本快照
 */
export function useGameWords(mode: 'normal' | 'wrongbook', wrongbook: WrongBook): GamePoolResult {
  const map = useWords();
  const normalPool = useMemo(() => buildGamePool(map), [map]);
  const wrongPool = useMemo(() => {
    const raw = wrongPoolEntries(wrongbook, map);
    const filtered = raw.filter(isValidGameWord);
    // 历史错词若全被过滤（罕见），回退未过滤结果，避免空局
    return filtered.length > 0 ? filtered : raw;
  }, [wrongbook, map]);

  return useMemo(
    () => ({
      pool: normalPool,
      wrongPool,
      map,
      size: mode === 'wrongbook' ? wrongPool.length : normalPool.length,
    }),
    [mode, normalPool, wrongPool, map],
  );
}

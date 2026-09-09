// 今日任务队列 Hook：到期复习优先 + 高频优先新词 + 防雪崩
import { useMemo } from 'react';
import { buildTodayQueue } from '@/lib/sm2';
import { useAppState } from '@/lib/store';
import { wordsOfBook } from '@/lib/wordbank';
import { useWords } from './useWords';

export function useTodayQueue() {
  const all = useWords();
  const state = useAppState();
  return useMemo(() => {
    const bookWords = wordsOfBook(all, state.activeBook);
    const q = buildTodayQueue(bookWords, state.records, state.settings.dailyNew, Date.now());
    return { ...q, bookWords, total: bookWords.length };
  }, [all, state.activeBook, state.records, state.settings.dailyNew]);
}

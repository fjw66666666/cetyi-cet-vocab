// 今日任务队列 Hook：到期复习优先（含每日上限与当天回顾）+ 高频优先新词 + 防雪崩
import { useMemo } from 'react';
import { buildEveningQueue, buildTodayQueue, dueWords } from '@/lib/sm2';
import { useAppState } from '@/lib/store';
import { wordsOfBook } from '@/lib/wordbank';
import { SRS_CONFIG } from '@/lib/config';
import { useWords } from './useWords';

export function useTodayQueue() {
  const all = useWords();
  const state = useAppState();
  return useMemo(() => {
    const bookWords = wordsOfBook(all, state.activeBook);
    const now = Date.now();
    const cap = state.settings.dailyReviewCap ?? SRS_CONFIG.daily_review_cap;
    const q = buildTodayQueue(bookWords, state.records, state.settings.dailyNew, now, cap);
    // 全量到期集（含被每日上限顺延的词）：供随身听等消费方使用，避免顺延词当天凭空消失
    const dueAll = dueWords(state.records, now);
    // 当天回顾（不并入 due，避免破坏每日上限语义）
    const evening = buildEveningQueue(state.records, state.learnedAt, now);
    return { ...q, dueAll, bookWords, total: bookWords.length, evening };
  }, [
    all,
    state.activeBook,
    state.records,
    state.settings.dailyNew,
    state.settings.dailyReviewCap,
    state.learnedAt,
  ]);
}

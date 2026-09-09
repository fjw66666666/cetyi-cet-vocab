// 词库全局加载（Context 注入，分片按需缓存）
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadAllWords } from '@/lib/wordbank';
import type { WordEntry } from '@/lib/types';

const WordsContext = createContext<Map<string, WordEntry> | null>(null);

export function WordsProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<Map<string, WordEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllWords()
      .then(setWords)
      .catch((e) => setError(e instanceof Error ? e.message : '词库加载失败'));
  }, []);

  if (error) {
    return <div className="flex min-h-screen items-center justify-center p-8 text-center text-muted-foreground">{error}</div>;
  }
  if (!words) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">词库加载中…</span>
        </div>
      </div>
    );
  }
  return <WordsContext.Provider value={words}>{children}</WordsContext.Provider>;
}

export function useWords(): Map<string, WordEntry> {
  const ctx = useContext(WordsContext);
  if (!ctx) throw new Error('useWords 必须在 WordsProvider 内使用');
  return ctx;
}

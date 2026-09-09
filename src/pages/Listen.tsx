import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useTodayQueue } from '@/hooks/useQueue';
import { useWords } from '@/hooks/useWords';
import { dateKey, useAppState } from '@/lib/store';
import { speak, speechSupported, stopSpeak } from '@/lib/speech';
import { cn } from '@/lib/utils';
import type { WordEntry } from '@/lib/types';

/** 随身听：顺序播放今日单词发音 + 释义（通勤/睡前碎片模式） */
export default function ListenPage() {
  const all = useWords();
  const state = useAppState();
  const { due, news, bookWords } = useTodayQueue();

  const playlist = useMemo<WordEntry[]>(() => {
    const todayLearned = Object.entries(state.learnedAt)
      .filter(([, ts]) => dateKey(ts) === dateKey())
      .map(([id]) => id);
    const ids = [...new Set([...due, ...news, ...todayLearned])];
    const list = ids.map((id) => all.get(id)).filter(Boolean) as WordEntry[];
    return list.length > 0 ? list : bookWords.slice(0, 30);
  }, [all, due, news, state.learnedAt, bookWords]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const word = playlist[idx];

  const playCurrent = (i: number) => {
    const w = playlist[i];
    if (!w || !speechSupported) return;
    const voice = state.settings.voice;
    speak(w.word, voice);
    // 单词发音后接释义（粗略按词数估计时长）
    const wordMs = 600 + w.word.length * 120;
    timerRef.current = setTimeout(() => {
      speak(w.meanings.join('，'), 'zh-CN' as never, 1);
      const meanMs = 1200 + w.meanings.join('，').length * 200;
      timerRef.current = setTimeout(() => {
        setIdx((cur) => {
          const next = cur + 1;
          if (next < playlist.length) playCurrent(next);
          else setPlaying(false);
          return next < playlist.length ? next : cur;
        });
      }, meanMs);
    }, wordMs);
  };

  useEffect(() => {
    if (playing) playCurrent(idx);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopSpeak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => () => stopSpeak(), []);

  if (!word) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">今日暂无可播放单词</div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="rounded-full p-2 text-muted-foreground hover:bg-secondary"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="text-sm text-muted-foreground">随身听 · {Math.min(idx + 1, playlist.length)}/{playlist.length}</div>
        <div className="w-9" />
      </div>

      {/* 当前词 */}
      <div className="mt-10 rounded-3xl border bg-card p-10 text-center">
        <div className={cn('font-word text-5xl font-bold tracking-tight', playing && 'animate-pop')} key={word.id}>
          {word.word}
        </div>
        <div className="mt-3 text-sm text-muted-foreground">{word.uk}</div>
        <div className="mt-6 space-y-1">
          {word.meanings.map((m, i) => (
            <p key={i} className="text-base">{word.pos} {m}</p>
          ))}
        </div>
      </div>

      {/* 控制条 */}
      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          onClick={() => { stopSpeak(); setIdx((i) => Math.max(0, i - 1)); }}
          className="rounded-full p-3 text-muted-foreground hover:bg-secondary"
          aria-label="上一个"
        >
          <SkipBack className="h-6 w-6" />
        </button>
        <button
          onClick={() => setPlaying((p) => { if (p) stopSpeak(); return !p; })}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
        </button>
        <button
          onClick={() => { stopSpeak(); setIdx((i) => Math.min(playlist.length - 1, i + 1)); }}
          className="rounded-full p-3 text-muted-foreground hover:bg-secondary"
          aria-label="下一个"
        >
          <SkipForward className="h-6 w-6" />
        </button>
      </div>

      {!speechSupported && (
        <p className="mt-6 text-center text-xs text-destructive">当前浏览器不支持 Web Speech API，无法播放发音。</p>
      )}

      {/* 播放列表 */}
      <div className="mt-8 flex-1 space-y-1 overflow-y-auto pb-8">
        {playlist.map((w, i) => (
          <button
            key={w.id}
            onClick={() => { stopSpeak(); setIdx(i); }}
            className={cn(
              'flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition-colors',
              i === idx ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-secondary',
            )}
          >
            <span className="font-word">{w.word}</span>
            <span className="truncate pl-4 text-xs">{w.meanings[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

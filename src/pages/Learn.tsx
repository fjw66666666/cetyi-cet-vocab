import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle2, RotateCw, Zap } from 'lucide-react';
import { GradeButtons, SpeakerButton } from '@/components/ui-bits';
import { HeatBadge } from '@/components/HeatBadge';
import { HighlightSentence } from '@/components/HighlightSentence';
import { useTodayQueue } from '@/hooks/useQueue';
import { useWords } from '@/hooks/useWords';
import { store, useAppState } from '@/lib/store';
import { sprintWords } from '@/lib/priority';
import { XP_RULES } from '@/lib/config';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';
import type { Grade, WordEntry } from '@/lib/types';

type LearnMode = 'normal' | 'sprint';

export default function LearnPage() {
  const all = useWords();
  const state = useAppState();
  const navigate = useNavigate();
  const { news, bookWords } = useTodayQueue();

  // 模式：常规（今日新词队列）/ 高频冲刺（热度 S/A 词池）
  const [mode, setMode] = useState<LearnMode>('normal');
  const sprintPool = useMemo(() => sprintWords(bookWords, state.records), [bookWords, state.records]);
  const sourceList: WordEntry[] = mode === 'sprint' ? sprintPool : news.map((id) => all.get(id)).filter(Boolean) as WordEntry[];

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [graded, setGraded] = useState<number[]>([]);
  const [start] = useState(Date.now());

  const queue = sourceList;
  const switchMode = (m: LearnMode) => {
    if (m === mode) return;
    setMode(m);
    setIdx(0);
    setGraded([]);
    setFlipped(false);
  };

  // 学习用时统计（离开页面时记录）
  useEffect(() => {
    return () => {
      const sec = Math.round((Date.now() - start) / 1000);
      if (sec > 3) store.addSeconds(sec);
    };
  }, [start]);

  const word = queue[idx];
  const done = idx >= queue.length;

  const grade = (g: Grade) => {
    if (!word) return;
    store.grade(word.id, g, { isNew: true, xpBase: XP_RULES.learn });
    setGraded((p) => [...p, g]);
    setFlipped(false);
    setIdx((i) => i + 1);
  };

  // 自动发音
  useEffect(() => {
    if (word) speak(word.word, state.settings.voice);
  }, [word, state.settings.voice]);

  if (queue.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">今天没有新词任务（可能因复习量较大已自动暂停）。</p>
        <Link to="/" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">返回首页</Link>
      </div>
    );
  }

  if (done) {
    const known = graded.filter((g) => g === 2).length;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
        <CheckCircle2 className="h-16 w-16 animate-pop text-primary" />
        <h1 className="text-2xl font-semibold">完成 {queue.length} 个新词！</h1>
        <p className="text-sm text-muted-foreground">
          一遍认识 {known} 个 · 10 分钟后它们会出现在复习队列里
        </p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/review')} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
            去复习
          </button>
          <button onClick={() => navigate('/')} className="rounded-xl border px-6 py-2.5 text-sm">
            回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-32 pt-4">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <Link to="/" className="rounded-full p-2 text-muted-foreground hover:bg-secondary"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="text-sm text-muted-foreground">
          {mode === 'sprint' ? '高频冲刺' : '新词学习'} {idx + 1}/{queue.length}
        </div>
        <div className="w-9" />
      </div>

      {/* 模式切换：常规 / 高频冲刺 */}
      <div className="mt-3 flex justify-center">
        <div className="flex rounded-full border bg-card p-1 text-xs">
          <button
            onClick={() => switchMode('normal')}
            className={cn('rounded-full px-4 py-1.5 transition-colors', mode === 'normal' ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground')}
          >
            常规
          </button>
          <button
            onClick={() => switchMode('sprint')}
            className={cn('flex items-center gap-1 rounded-full px-4 py-1.5 transition-colors', mode === 'sprint' ? 'bg-aurora-grad font-medium text-white' : 'text-muted-foreground')}
          >
            <Zap className="h-3 w-3" /> 高频冲刺
          </button>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      {/* 翻卡 */}
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="relative w-full">
          {/* 热度徽章：悬浮于翻卡之上，不随 3D 旋转 */}
          <div className="absolute right-3 top-3 z-10">
            <HeatBadge fs={word?.fs} tier={word?.tier} />
          </div>
          <div
            className="perspective-800 h-80 w-full cursor-pointer select-none"
            onClick={() => setFlipped((f) => !f)}
          >
          <div className={cn('preserve-3d relative h-full w-full transition-transform duration-300', flipped && 'rotate-y-180')}>
            {/* 正面：单词 + 音标 + 发音 */}
            <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-8">
              <div className="font-word text-5xl font-bold tracking-tight">{word.word}</div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {word.uk && <span>英 {word.uk}</span>}
                {word.us && <span>美 {word.us}</span>}
                <SpeakerButton text={word.word} />
              </div>
              {word.pos && <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{word.pos}</span>}
              <div className="absolute bottom-5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCw className="h-3.5 w-3.5" /> 点击卡片查看释义与例句
              </div>
            </div>
            {/* 背面：释义 + 例句 + 助记 */}
            <div className="backface-hidden rotate-y-180 absolute inset-0 overflow-y-auto rounded-3xl border bg-card p-6">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">释义</div>
                  <ul className="mt-1 space-y-1">
                    {word.meanings.map((m, i) => (
                      <li key={i} className="text-base font-medium">{i + 1}. {m}</li>
                    ))}
                  </ul>
                </div>
                {word.example && (
                  <div>
                    <div className="text-xs text-muted-foreground">真题风格例句</div>
                    <HighlightSentence
                      className="mt-1 text-sm"
                      en={word.example.en}
                      zh={word.example.zh}
                      words={all}
                      currentId={word.id}
                    />
                  </div>
                )}
                {word.mnemonic && (
                  <div>
                    <div className="text-xs text-muted-foreground">词根助记</div>
                    <p className="mt-1 text-sm text-muted-foreground">{word.mnemonic}</p>
                  </div>
                )}
                {word.collocations && word.collocations.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground">固定搭配</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {word.collocations.map((c) => (
                        <span key={c} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(word.derivatives?.length || word.confusables?.length) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {word.derivatives?.length ? <p>派生：{word.derivatives.join('；')}</p> : null}
                    {word.confusables?.length ? <p>形近辨析：{word.confusables.join('；')}</p> : null}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <p className="pb-2 text-center text-xs text-muted-foreground">根据第一印象诚实自评，这决定了下次复习时间</p>
      <GradeButtons onGrade={grade} />
    </div>
  );
}

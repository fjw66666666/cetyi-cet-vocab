import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle2, RotateCw } from 'lucide-react';
import { GradeButtons, SpeakerButton } from '@/components/ui-bits';
import { useTodayQueue } from '@/hooks/useQueue';
import { useWords } from '@/hooks/useWords';
import { store, useAppState } from '@/lib/store';
import { XP_RULES } from '@/lib/config';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';
import type { Grade, WordEntry } from '@/lib/types';

export default function LearnPage() {
  const all = useWords();
  const state = useAppState();
  const navigate = useNavigate();
  const { news } = useTodayQueue();
  const queue = useMemo(() => news.map((id) => all.get(id)).filter(Boolean) as WordEntry[], [news, all]);

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [graded, setGraded] = useState<number[]>([]);
  const [start] = useState(Date.now());

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
        <div className="text-sm text-muted-foreground">新词学习 {idx + 1}/{queue.length}</div>
        <div className="w-9" />
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      {/* 翻卡 */}
      <div className="flex flex-1 items-center justify-center py-8">
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
                    <p className="mt-1 text-sm leading-relaxed">{word.example.en}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{word.example.zh}</p>
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

      <p className="pb-2 text-center text-xs text-muted-foreground">根据第一印象诚实自评，这决定了下次复习时间</p>
      <GradeButtons onGrade={grade} />
    </div>
  );
}

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
import { buildMeaningChoice } from '@/lib/quiz';
import { XP_RULES } from '@/lib/config';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';
import type { Grade, WordEntry } from '@/lib/types';

type LearnMode = 'normal' | 'sprint';
/** T3 显式学习状态机：先测（自判是否认识）→ 揭示 → 即时检验 → 自评 */
type Stage = 'pretest' | 'revealed' | 'check' | 'grade';

export default function LearnPage() {
  const all = useWords();
  const state = useAppState();
  const navigate = useNavigate();
  const { news, bookWords } = useTodayQueue();

  // 模式：常规（今日新词队列）/ 高频冲刺（热度 S/A 词池）
  const [mode, setMode] = useState<LearnMode>('normal');
  const sprintPool = useMemo(() => sprintWords(bookWords, state.records), [bookWords, state.records]);
  const sourceList: WordEntry[] = mode === 'sprint' ? sprintPool : news.map((id) => all.get(id)).filter(Boolean) as WordEntry[];

  // 会话队列快照：records 变化（自评后 words 出队）不再重算队列，保证当次会话稳定
  const [queue, setQueue] = useState<WordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<Map<string, Grade>>(new Map());
  const [reinserted, setReinserted] = useState<Set<string>>(new Set());
  const [start] = useState(Date.now());

  // T3 状态机
  const [stage, setStage] = useState<Stage>('pretest');
  const [pretestKnown, setPretestKnown] = useState<boolean | null>(null); // 预判：认识 / 不认识
  const [checkCorrect, setCheckCorrect] = useState<boolean | null>(null); // 即时检验对错
  const [quizResults, setQuizResults] = useState<Map<string, boolean>>(new Map()); // 完成页统计（即时检验全对）

  // 模式切换 / 词库就绪时重建会话（重置进度与统计）
  useEffect(() => {
    setQueue(sourceList);
    setIdx(0);
    setAnswered(new Map());
    setReinserted(new Set());
    setStage('pretest');
    setPretestKnown(null);
    setCheckCorrect(null);
    setQuizResults(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在模式与词库变化时重建
  }, [mode, all]);

  const switchMode = (m: LearnMode) => {
    if (m === mode) return;
    setMode(m);
  };

  // 学习用时统计（离开页面时记录）
  useEffect(() => {
    return () => {
      const sec = Math.round((Date.now() - start) / 1000);
      if (sec > 3) store.addSeconds(sec);
    };
  }, [start]);

  const word = queue[idx];
  const done = queue.length > 0 && idx >= queue.length;
  // 翻卡：pretest 显示正面，其余阶段显示背面（保留既有 3D 视觉资产）
  const showBack = stage !== 'pretest';

  // 即时检验：中文释义 4 选 1（干扰项优先同 tier）
  const choice = useMemo(
    () => (word ? buildMeaningChoice(word, [...all.values()], 4) : null),
    [word, all],
  );

  const grade = (g: Grade) => {
    if (!word) return;
    store.grade(word.id, g, { isNew: true, xpBase: XP_RULES.learn, quizCorrect: checkCorrect ?? undefined });
    setAnswered((m) => {
      const n = new Map(m);
      n.set(word.id, g);
      return n;
    });
    // 模糊 / 忘记：当次会话稍后再现一次（每词每会话上限 1 次）
    if ((g === 0 || g === 1) && !reinserted.has(word.id)) {
      setReinserted((s) => new Set(s).add(word.id));
      setQueue((q) => {
        const next = [...q];
        next.splice(idx + 1, 0, word);
        return next;
      });
    }
    setIdx((i) => i + 1);
    // 复位状态机
    setStage('pretest');
    setPretestKnown(null);
    setCheckCorrect(null);
  };

  // 自动发音（依赖保持 [word, voice]，切换阶段不重播）
  useEffect(() => {
    if (word) speak(word.word, state.settings.voice);
  }, [word, state.settings.voice]);

  // 桌面键盘快捷键：Space 不认识 / 进检验，Enter 继续，1/2/3 自评
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!word) return;
      if (stage === 'pretest' && e.code === 'Space') {
        e.preventDefault();
        setPretestKnown(false);
        setStage('revealed');
      } else if (stage === 'revealed' && e.code === 'Space') {
        e.preventDefault();
        setStage('check');
      } else if (stage === 'check' && e.key === 'Enter' && checkCorrect !== null) {
        setStage('grade');
      } else if (stage === 'grade' && (e.key === '1' || e.key === '2' || e.key === '3')) {
        const map: Record<string, Grade> = { '1': 0, '2': 1, '3': 2 };
        grade(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grade 每次渲染重建；其输入（word/checkCorrect/idx）变化时 stage 必随之变化，故此处不会产生过期闭包
  }, [stage, checkCorrect, word]);

  if (queue.length === 0 && (mode === 'normal' ? news.length > 0 : sprintPool.length > 0)) {
    return null; // 队列快照尚未建立，等待 effect 填充
  }
  if (queue.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">今天没有新词任务（可能因复习量较大已自动暂停）。</p>
        <Link to="/" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">返回首页</Link>
      </div>
    );
  }

  if (done) {
    const checkPass = [...quizResults.values()].filter(Boolean).length;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
        <CheckCircle2 className="h-16 w-16 animate-pop text-primary" />
        <h1 className="text-2xl font-semibold">完成 {answered.size} 个新词！</h1>
        <p className="text-sm text-muted-foreground">
          即时检验全对 {checkPass} 个 · 10 分钟后它们会出现在复习队列里
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
          <div className="perspective-800 h-80 w-full select-none">
          <div className={cn('preserve-3d relative h-full w-full transition-transform duration-300', showBack && 'rotate-y-180')}>
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
                <RotateCw className="h-3.5 w-3.5" /> 选择后翻面查看释义与例句
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

      {/* 底部操作区：随状态机切换（移动端拇指热区 ≥52px） */}
      {stage === 'pretest' && (
        <>
          <p className="pb-2 text-center text-xs text-muted-foreground">先判断你是否认识这个词，再揭晓答案</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setPretestKnown(false); setStage('revealed'); }}
              className="rounded-xl border border-destructive/40 bg-destructive/10 py-3.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 active:scale-[0.98]"
            >
              不认识
            </button>
            <button
              onClick={() => { setPretestKnown(true); setStage('revealed'); }}
              className="rounded-xl border border-primary/40 bg-primary/10 py-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
            >
              认识
            </button>
          </div>
        </>
      )}

      {stage === 'revealed' && (
        <button
          onClick={() => setStage('check')}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          我记好了，检验一下
        </button>
      )}

      {stage === 'check' && choice && (
        <div className="space-y-2.5">
          <p className="text-center text-xs text-muted-foreground">选出正确的中文释义</p>
          <div className="grid gap-2.5">
            {choice.map((opt) => {
              const show = checkCorrect !== null;
              return (
                <button
                  key={opt.key}
                  disabled={show}
                  onClick={() => {
                    setCheckCorrect(opt.correct);
                    setQuizResults((m) => new Map(m).set(word.id, opt.correct));
                  }}
                  className={cn(
                    'rounded-2xl border bg-card px-5 py-3.5 text-left text-sm transition-all active:scale-[0.99]',
                    !show && 'hover:border-primary/50 hover:bg-secondary/60',
                    show && opt.correct && 'animate-pop border-primary bg-primary/10 font-medium text-primary',
                    show && !opt.correct && 'opacity-50',
                  )}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
          {checkCorrect !== null && (
            <>
              <p className={cn('text-center text-sm font-medium', checkCorrect ? 'text-primary' : 'text-destructive')}>
                {checkCorrect ? '✅ 回答正确' : '❌ 回答错误'}
              </p>
              <button
                onClick={() => setStage('grade')}
                className="w-full rounded-xl bg-primary py-3.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                继续自评
              </button>
            </>
          )}
        </div>
      )}

      {stage === 'grade' && (
        <>
          <p className="pb-2 text-center text-xs text-muted-foreground">根据记忆程度诚实自评，这决定了下次复习时间</p>
          <GradeButtons onGrade={grade} highlight={pretestKnown === true && checkCorrect === true ? 2 : undefined} />
        </>
      )}
    </div>
  );
}

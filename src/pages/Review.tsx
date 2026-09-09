import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, CheckCircle2, Ear, Pencil, Type } from 'lucide-react';
import { GradeButtons, SpeakerButton } from '@/components/ui-bits';
import { useTodayQueue } from '@/hooks/useQueue';
import { useWords } from '@/hooks/useWords';
import { store, useAppState } from '@/lib/store';
import { speak } from '@/lib/speech';
import { WRONG_PASS_STREAK, XP_RULES } from '@/lib/config';
import { cn } from '@/lib/utils';
import type { Grade, WordEntry } from '@/lib/types';

type QType = 'en2zh' | 'zh2en' | 'listen' | 'spell' | 'cloze';

interface Question {
  type: QType;
  word: WordEntry;
  options?: { key: string; text: string; correct: boolean }[];
  promptMeaning?: string;
  cloze?: { before: string; after: string; zh: string };
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pickDistractors(word: WordEntry, pool: WordEntry[], n: number): WordEntry[] {
  const sameTier = pool.filter((w) => w.id !== word.id && w.tier === word.tier);
  const rest = pool.filter((w) => w.id !== word.id && w.tier !== word.tier);
  return shuffle([...sameTier, ...rest]).slice(0, n);
}

function makeQuestion(word: WordEntry, pool: WordEntry[]): Question {
  const types: QType[] = ['en2zh', 'zh2en', 'listen', 'spell'];
  if (word.example) types.push('cloze');
  const type = types[Math.floor(Math.random() * types.length)];
  const distractors = pickDistractors(word, pool, 3);

  if (type === 'zh2en') {
    return {
      type,
      word,
      promptMeaning: word.meanings.join('；'),
      options: shuffle([word, ...distractors]).map((w) => ({ key: w.id, text: w.word, correct: w.id === word.id })),
    };
  }
  if (type === 'spell') {
    return { type, word, promptMeaning: word.meanings.join('；') };
  }
  if (type === 'cloze' && word.example) {
    const re = new RegExp(`\\b${word.word}\\w*\\b`, 'i');
    const m = word.example.en.match(re);
    const hit = m?.[0] ?? word.word;
    const [before, after] = word.example.en.split(hit);
    return {
      type,
      word,
      cloze: { before, after, zh: word.example.zh },
      options: shuffle([word, ...distractors]).map((w) => ({ key: w.id, text: w.word, correct: w.id === word.id })),
    };
  }
  // en2zh / listen 共用中文选项
  return {
    type,
    word,
    options: shuffle([word, ...distractors]).map((w) => ({
      key: w.id,
      text: `${w.pos ?? ''} ${w.meanings[0]}`,
      correct: w.id === word.id,
    })),
  };
}

const TYPE_LABEL: Record<QType, string> = {
  en2zh: '看英选中',
  zh2en: '看中选英',
  listen: '听音辨义',
  spell: '拼写默写',
  cloze: '例句填空',
};

export default function ReviewPage() {
  const all = useWords();
  const state = useAppState();
  const navigate = useNavigate();
  const { due, bookWords } = useTodayQueue();

  // 会话队列：due + 中途追加的「模糊/忘记」重测
  const [queue, setQueue] = useState<string[]>(due);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'answering' | 'revealed'>('answering');
  const [picked, setPicked] = useState<string | null>(null);
  const [spellInput, setSpellInput] = useState('');
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [wrongPass, setWrongPass] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ done: 0, correct: 0 });
  const [start] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const word = queue[idx] ? all.get(queue[idx]) : undefined;
  const question = useMemo(() => (word ? makeQuestion(word, bookWords) : null), [word, bookWords]);

  useEffect(() => {
    return () => {
      const sec = Math.round((Date.now() - start) / 1000);
      if (sec > 3) store.addSeconds(sec);
    };
  }, [start]);

  // 听音辨义自动播放；拼写聚焦
  useEffect(() => {
    if (!question) return;
    if (question.type === 'listen') {
      const t = setTimeout(() => speak(question.word.word, store.get().settings.voice), 350);
      return () => clearTimeout(t);
    }
    if (question.type === 'spell') inputRef.current?.focus();
  }, [question]);

  if (due.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <p className="text-muted-foreground">现在没有到期的复习任务。</p>
        <Link to="/" className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">返回首页</Link>
      </div>
    );
  }

  if (!question || !word) {
    const passCount = Object.values(wrongPass).filter((c) => c >= WRONG_PASS_STREAK).length;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
        <CheckCircle2 className="h-16 w-16 animate-pop text-primary" />
        <h1 className="text-2xl font-semibold">复习完成！</h1>
        <p className="text-sm text-muted-foreground">
          共 {stats.done} 题 · 首答正确率 {stats.done ? Math.round((stats.correct / stats.done) * 100) : 0}%
          {Object.keys(wrongPass).length > 0 && ` · 错词通过 ${passCount}/${Object.keys(wrongPass).length}`}
        </p>
        <button onClick={() => navigate('/')} className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground">
          回首页
        </button>
      </div>
    );
  }

  const reveal = (correct: boolean, pickedKey?: string) => {
    if (phase !== 'answering') return;
    setQuizCorrect(correct);
    if (pickedKey) setPicked(pickedKey);
    setPhase('revealed');
    setStats((s) => ({ done: s.done + 1, correct: s.correct + (correct ? 1 : 0) }));
    // 错词本：连续答对计数
    setWrongPass((p) => ({
      ...p,
      [word.id]: correct ? (p[word.id] ?? (store.get().records[word.id]?.wrong_count ? 0 : WRONG_PASS_STREAK)) + 1 : 0,
    }));
    if (question.type !== 'listen') speak(word.word, state.settings.voice);
  };

  const grade = (g: Grade) => {
    const isWrong = quizCorrect === false;
    const xpBase = g === 2 ? XP_RULES.review_good : g === 1 ? XP_RULES.review_hard : XP_RULES.review_again;
    store.grade(word.id, g, { isNew: false, quizCorrect: quizCorrect ?? undefined, xpBase });
    // 「模糊/忘记」当次会话末尾重测；答错词重测直至连续答对
    if (g !== 2 || (isWrong && (wrongPass[word.id] ?? 0) < WRONG_PASS_STREAK)) {
      setQueue((q) => [...q, word.id]);
    }
    setPhase('answering');
    setPicked(null);
    setSpellInput('');
    setQuizCorrect(null);
    setIdx((i) => i + 1);
  };

  const submitSpell = () => {
    const ok = spellInput.trim().toLowerCase() === word.word.toLowerCase();
    reveal(ok, spellInput.trim());
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-36 pt-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="rounded-full p-2 text-muted-foreground hover:bg-secondary"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{TYPE_LABEL[question.type]}</span>
          {idx + 1}/{queue.length}
        </div>
        <div className="w-9" />
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>

      {/* 题干：先回忆，答案不可见 */}
      <div className="mt-8 flex flex-1 flex-col gap-6">
        <div className="rounded-3xl border bg-card p-8 text-center">
          {question.type === 'en2zh' && (
            <div className="space-y-3">
              <div className="font-word text-4xl font-bold tracking-tight">{word.word}</div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {word.uk} <SpeakerButton text={word.word} size="sm" />
              </div>
              <p className="text-xs text-muted-foreground">回忆它的中文释义，然后选择</p>
            </div>
          )}
          {question.type === 'zh2en' && (
            <div className="space-y-3">
              <div className="text-xl font-medium leading-relaxed">{question.promptMeaning}</div>
              <p className="text-xs text-muted-foreground">回忆对应的英文单词，然后选择</p>
            </div>
          )}
          {question.type === 'listen' && (
            <div className="space-y-4">
              <button
                onClick={() => speak(word.word, state.settings.voice)}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform active:scale-95"
              >
                <Ear className="h-9 w-9" />
              </button>
              <p className="text-xs text-muted-foreground">点击重听，选出你听到的词义</p>
            </div>
          )}
          {question.type === 'spell' && (
            <div className="space-y-4">
              <div className="text-xl font-medium leading-relaxed">{question.promptMeaning}</div>
              <p className="text-xs text-muted-foreground">拼写出这个单词（首字母 {word.word[0].toUpperCase()}）</p>
              <div className="mx-auto flex max-w-xs items-center gap-2">
                <Type className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={spellInput}
                  onChange={(e) => setSpellInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && phase === 'answering' && spellInput.trim() && submitSpell()}
                  disabled={phase === 'revealed'}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(
                    'w-full rounded-xl border bg-background px-4 py-3 text-center font-word text-lg outline-none focus:ring-2 focus:ring-ring',
                    phase === 'revealed' && (quizCorrect ? 'border-primary text-primary' : 'border-destructive text-destructive'),
                  )}
                  placeholder="输入英文单词"
                />
              </div>
              {phase === 'answering' && (
                <button
                  onClick={submitSpell}
                  disabled={!spellInput.trim()}
                  className="mx-auto flex items-center gap-1.5 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
                >
                  <Pencil className="h-4 w-4" /> 核对
                </button>
              )}
            </div>
          )}
          {question.type === 'cloze' && question.cloze && (
            <div className="space-y-3 text-left">
              <p className="text-base leading-relaxed">
                {question.cloze.before}
                <span className={cn(
                  'mx-1 inline-block min-w-16 rounded border-b-2 px-1 text-center font-word font-bold',
                  phase === 'revealed' ? (quizCorrect ? 'border-primary text-primary' : 'border-destructive text-destructive') : 'border-primary/60 text-transparent',
                )}>
                  {phase === 'revealed' ? word.word : word.word}
                </span>
                {question.cloze.after}
              </p>
              <p className="text-sm text-muted-foreground">{question.cloze.zh}</p>
              <p className="text-xs text-muted-foreground">选出空格中应填的词</p>
            </div>
          )}
        </div>

        {/* 选项 */}
        {question.options && (
          <div className="grid gap-2.5">
            {question.options.map((opt) => {
              const isPicked = picked === opt.key;
              const show = phase === 'revealed';
              return (
                <button
                  key={opt.key}
                  disabled={show}
                  onClick={() => reveal(opt.correct, opt.key)}
                  className={cn(
                    'rounded-2xl border bg-card px-5 py-3.5 text-left text-sm transition-all active:scale-[0.99]',
                    !show && 'hover:border-primary/50 hover:bg-secondary/60',
                    show && opt.correct && 'animate-pop border-primary bg-primary/10 font-medium text-primary',
                    show && isPicked && !opt.correct && 'animate-shake border-destructive bg-destructive/10 text-destructive',
                    show && !opt.correct && !isPicked && 'opacity-50',
                  )}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}

        {/* 核对后的答案解析 */}
        {phase === 'revealed' && (
          <div className="animate-pop rounded-2xl border bg-card p-5 text-sm">
            <div className={cn('mb-2 font-medium', quizCorrect ? 'text-primary' : 'text-destructive')}>
              {quizCorrect ? '回答正确 ✓' : `正确答案：${word.word} — ${word.meanings[0]}`}
            </div>
            <div className="space-y-1.5 text-muted-foreground">
              <p><span className="text-foreground font-medium">{word.word}</span> {word.uk} {word.pos}</p>
              {word.example && <p className="leading-relaxed">{word.example.en}<br />{word.example.zh}</p>}
              {word.mnemonic && <p>助记：{word.mnemonic}</p>}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">现在诚实自评这道题的记忆程度：</p>
          </div>
        )}
      </div>

      {phase === 'revealed' && <GradeButtons onGrade={grade} />}
    </div>
  );
}

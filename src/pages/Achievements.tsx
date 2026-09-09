import { useMemo, useState } from 'react';
import {
  Award, BookOpen, CalendarCheck, Crown, Flame, Footprints, Moon, Ruler, Sprout, Sunrise, Target, Trophy, X,
  type LucideIcon,
} from 'lucide-react';
import { ACHIEVEMENTS, estimateVocab, pickVocabTest } from '@/lib/gamification';
import { levelFromXp, XP_RULES } from '@/lib/config';
import { dateKey, store, useAppState } from '@/lib/store';
import { useWords } from '@/hooks/useWords';
import { wordsOfBook } from '@/lib/wordbank';
import { cn } from '@/lib/utils';
import type { WordEntry } from '@/lib/types';

const ICON_MAP: Record<string, LucideIcon> = {
  Award, BookOpen, CalendarCheck, Crown, Flame, Footprints, Moon, Ruler, Sprout, Sunrise, Target, Trophy,
};

function IconByName({ name, className }: { name: string; className?: string }) {
  const Cmp = ICON_MAP[name] ?? Award;
  return <Cmp className={className} />;
}

/** 打卡日历热力图：近 12 周 */
function Heatmap({ days }: { days: Record<string, { newLearned: number; reviewed: number }> }) {
  const cells = useMemo(() => {
    const out: { key: string; count: number; future: boolean }[] = [];
    const today = new Date();
    const start = new Date(today.getTime() - 83 * 86400_000);
    // 对齐到周一
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    for (let d = new Date(start); d <= today || out.length % 7 !== 0; d = new Date(d.getTime() + 86400_000)) {
      const key = dateKey(d);
      const log = days[key];
      out.push({ key, count: (log?.newLearned ?? 0) + (log?.reviewed ?? 0), future: d > today });
      if (out.length >= 84) break;
    }
    return out;
  }, [days]);

  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
      {cells.map((c) => (
        <div
          key={c.key}
          title={`${c.key}：${c.count} 词`}
          className={cn(
            'h-3 w-3 rounded-[3px]',
            c.future ? 'bg-transparent' : c.count === 0 ? 'bg-secondary' : c.count < 20 ? 'bg-primary/40' : c.count < 50 ? 'bg-primary/70' : 'bg-primary',
          )}
        />
      ))}
    </div>
  );
}

/** 2 分钟词汇量小测 */
function VocabTest({ words, onClose }: { words: WordEntry[]; onClose: () => void }) {
  const state = useAppState();
  const bankSize = wordsOfBook(useWords(), state.activeBook).length;
  const [testWords] = useState(() => pickVocabTest(words));
  const [idx, setIdx] = useState(0);
  const [known, setKnown] = useState(0);
  const [result, setResult] = useState<number | null>(null);

  const answer = (know: boolean) => {
    const k = known + (know ? 1 : 0);
    if (idx + 1 >= testWords.length) {
      const size = estimateVocab(k, testWords.length, bankSize);
      setResult(size);
      store.addVocabTest({ date: dateKey(), size });
      store.addXp(XP_RULES.vocab_test);
    } else {
      setKnown(k);
      setIdx(idx + 1);
    }
  };

  const w = testWords[idx];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {result === null ? (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold">词汇量小测</h3>
              <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-6 text-xs text-muted-foreground">
              诚实选择「认识」或「不认识」，不要猜 —— {idx + 1}/{testWords.length}
            </p>
            <div className="rounded-2xl border bg-background p-8 text-center">
              <span className="font-word text-4xl font-bold">{w.word}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => answer(true)} className="rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground active:scale-[0.98]">认识</button>
              <button onClick={() => answer(false)} className="rounded-xl border py-3 text-sm font-medium active:scale-[0.98]">不认识</button>
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="text-sm text-muted-foreground">你的估算词汇量（{state.activeBook}）</div>
            <div className="mt-2 text-5xl font-bold text-primary">{result}</div>
            <p className="mt-3 text-xs text-muted-foreground">已记录到成长曲线 · +{XP_RULES.vocab_test} XP</p>
            <button onClick={onClose} className="mt-6 rounded-xl bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground">完成</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const state = useAppState();
  const all = useWords();
  const bookWords = useMemo(() => wordsOfBook(all, state.activeBook), [all, state.activeBook]);
  const [showTest, setShowTest] = useState(false);
  const { level, cur, need } = levelFromXp(state.xp);
  const unlocked = new Set(state.achievements);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">成就与成长</h1>

      {/* XP 等级 + 连胜 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">等级 Lv.{level}</div>
            <div className="text-xs text-muted-foreground">{cur}/{need} XP</div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(cur / need) * 100}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">累计 {state.xp} XP · 每级需 {100 * level} XP</div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
            <Flame className="h-7 w-7 text-orange-500" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{state.streak.current} 天</div>
            <div className="text-xs text-muted-foreground">连续学习 · 最长 {state.streak.best} 天</div>
          </div>
        </div>
      </section>

      {/* 打卡热力图 */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-medium">打卡日历（近 12 周）</h2>
        <Heatmap days={state.days} />
        <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          少 <span className="h-3 w-3 rounded-[3px] bg-secondary" /> <span className="h-3 w-3 rounded-[3px] bg-primary/40" /> <span className="h-3 w-3 rounded-[3px] bg-primary/70" /> <span className="h-3 w-3 rounded-[3px] bg-primary" /> 多
        </div>
      </section>

      {/* 徽章墙 */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-medium">成就徽章 {unlocked.size}/{ACHIEVEMENTS.length}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const has = unlocked.has(a.id);
            return (
              <div
                key={a.id}
                className={cn(
                  'rounded-2xl border p-4 text-center transition-all',
                  has ? 'bg-primary/5 border-primary/30' : 'opacity-45 grayscale',
                )}
              >
                <div className={cn('mx-auto flex h-11 w-11 items-center justify-center rounded-full', has ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground')}>
                  <IconByName name={a.icon} className="h-5 w-5" />
                </div>
                <div className="mt-2 text-sm font-medium">{a.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{a.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 词汇量成长曲线 */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">词汇量成长曲线</h2>
          <button onClick={() => setShowTest(true)} className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
            2 分钟小测
          </button>
        </div>
        {state.vocabTests.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">还没有记录。完成一次 2 分钟小测，开始追踪你的词汇量增长。</p>
        ) : (
          <div className="mt-4 space-y-2">
            {state.vocabTests.slice(-8).map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{t.date}</span>
                <span className="font-semibold">{t.size} 词</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {showTest && <VocabTest words={bookWords} onClose={() => setShowTest(false)} />}
    </div>
  );
}

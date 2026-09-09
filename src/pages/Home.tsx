import { Link } from 'react-router';
import { Flame, Headphones, Play, Sparkles } from 'lucide-react';
import { ProgressRing, StatCard } from '@/components/ui-bits';
import { useTodayQueue } from '@/hooks/useQueue';
import { dateKey, useAppState } from '@/lib/store';
import { learnedCount, masteredCount } from '@/lib/gamification';
import { SRS_CONFIG } from '@/lib/config';

export default function HomePage() {
  const state = useAppState();
  const { due, news, paused, total } = useTodayQueue();
  const today = state.days[dateKey()] ?? { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 };
  const goal = state.settings.dailyNew;
  const doneNew = today.newLearned;
  const doneReview = today.reviewed;
  const target = goal + Math.max(due.length, doneReview);
  const finished = doneNew + doneReview;
  const progress = target > 0 ? Math.min(1, finished / target) : 0;
  const nothingToDo = due.length === 0 && news.length === 0;

  return (
    <div className="space-y-6">
      {/* 今日任务主卡 */}
      <section className="rounded-3xl border bg-card p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-5">
            <ProgressRing value={progress} size={124}>
              <div className="text-2xl font-semibold">{Math.round(progress * 100)}<span className="text-sm">%</span></div>
              <div className="text-[11px] text-muted-foreground">今日进度</div>
            </ProgressRing>
            <div>
              <div className="text-sm text-muted-foreground">
                {state.activeBook} · 高频词 {SRS_CONFIG.daily_new_default === goal ? '优先' : ''}
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                今日待复习 <span className="text-primary">{due.length}</span> 词
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {paused
                  ? `复习量较大，新词已自动暂停（防雪崩）`
                  : `新词 ${Math.max(0, goal - doneNew)} / ${goal} · 复习 ${doneReview}/${due.length}`}
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-48">
            {due.length > 0 ? (
              <Link to="/review" className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-transform hover:opacity-95 active:scale-[0.98]">
                <Play className="h-4 w-4" /> 先复习 {due.length} 词
              </Link>
            ) : (
              <Link to="/review" className="flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium text-muted-foreground">
                暂无到期复习
              </Link>
            )}
            {news.length > 0 && (
              <Link to="/learn" className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-medium text-primary transition-transform active:scale-[0.98]">
                <Sparkles className="h-4 w-4" /> 学新词 {news.length} 个
              </Link>
            )}
            {nothingToDo && (
              <div className="rounded-xl bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">
                今日任务已完成，明天见！
              </div>
            )}
            <Link to="/listen" className="flex items-center justify-center gap-2 rounded-xl border py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Headphones className="h-4 w-4" /> 随身听
            </Link>
          </div>
        </div>
      </section>

      {/* 连胜 + 概览 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 flex items-center gap-4 rounded-2xl border bg-card p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10">
            <Flame className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <div className="text-2xl font-semibold">{state.streak.current} <span className="text-sm font-normal text-muted-foreground">天连续学习</span></div>
            <div className="text-xs text-muted-foreground">最长纪录 {state.streak.best} 天 · 今天{today.newLearned + today.reviewed > 0 ? '已打卡' : '未打卡'}</div>
          </div>
        </div>
        <StatCard label="已学单词" value={learnedCount(state)} sub={`词书共 ${total} 词`} />
        <StatCard label="已掌握" value={masteredCount(state)} sub="间隔 ≥ 30 天或已斩" />
      </section>

      {/* 今日明细 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="今日新学" value={today.newLearned} />
        <StatCard label="今日复习" value={today.reviewed} />
        <StatCard
          label="今日正确率"
          value={today.correct + today.wrong > 0 ? `${Math.round((today.correct / (today.correct + today.wrong)) * 100)}%` : '—'}
        />
        <StatCard label="今日用时" value={`${Math.floor(today.seconds / 60)} 分钟`} />
      </section>
    </div>
  );
}

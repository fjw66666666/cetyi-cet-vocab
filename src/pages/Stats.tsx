import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '@/components/ui-bits';
import { dateKey, useAppState } from '@/lib/store';
import { useTodayQueue } from '@/hooks/useQueue';

const STATUS_META = [
  { key: 'new', name: '未学', color: '#a8b5ad' },
  { key: 'learning', name: '学习中', color: '#e3b34c' },
  { key: 'review', name: '待复习', color: '#5b93d1' },
  { key: 'mastered', name: '已掌握', color: '#3d8f6a' },
] as const;

export default function StatsPage() {
  const state = useAppState();
  const { total, due } = useTodayQueue();

  const today = state.days[dateKey()] ?? { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 };

  // 记忆状态分布
  const dist = useMemo(() => {
    const counts = { new: 0, learning: 0, review: 0, mastered: 0 } as Record<string, number>;
    const started = Object.keys(state.records).length;
    counts.new = Math.max(0, total - started);
    for (const r of Object.values(state.records)) {
      if (r.slain || r.status === 'mastered') counts.mastered += 1;
      else if (r.next_review_at <= Date.now()) counts.review += 1;
      else counts.learning += 1;
    }
    return STATUS_META.map((m) => ({ ...m, value: counts[m.key] })).filter((d) => d.value > 0);
  }, [state.records, total]);

  // 近 7 天学习报表
  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400_000);
      const log = state.days[dateKey(d)];
      return {
        day: `${d.getMonth() + 1}/${d.getDate()}`,
        新词: log?.newLearned ?? 0,
        复习: log?.reviewed ?? 0,
      };
    });
  }, [state.days]);

  // 个人遗忘曲线：R = e^(-t/S)，S = 平均间隔(天) 随 ef 缩放
  const curve = useMemo(() => {
    const recs = Object.values(state.records).filter((r) => r.status !== 'new');
    const avgIntervalDays = recs.length
      ? recs.reduce((s, r) => s + Math.max(r.interval_min, 10), 0) / recs.length / 1440
      : 1 / 6; // 未学时按 4 小时
    const S = Math.max(avgIntervalDays, 0.1);
    return Array.from({ length: 31 }, (_, t) => ({ day: t, 记忆保持率: Math.round(Math.exp(-t / S) * 100) }));
  }, [state.records]);

  const month = useMemo(() => {
    const days = Object.entries(state.days)
      .filter(([k]) => k >= dateKey(Date.now() - 30 * 86400_000))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const sum = days.reduce(
      (acc, [, d]) => ({
        newLearned: acc.newLearned + d.newLearned,
        reviewed: acc.reviewed + d.reviewed,
        correct: acc.correct + d.correct,
        wrong: acc.wrong + d.wrong,
        seconds: acc.seconds + d.seconds,
        xp: acc.xp + d.xp,
      }),
      { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 },
    );
    return { days: days.length, ...sum };
  }, [state.days]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">学习统计</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="今日新词" value={today.newLearned} />
        <StatCard label="今日复习" value={today.reviewed} sub={`待复习 ${due.length}`} />
        <StatCard
          label="今日正确率"
          value={today.correct + today.wrong > 0 ? `${Math.round((today.correct / (today.correct + today.wrong)) * 100)}%` : '—'}
        />
        <StatCard label="今日用时" value={`${Math.floor(today.seconds / 60)} 分钟`} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 记忆状态分布 */}
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-medium">记忆状态分布</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                  {dist.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            {dist.map((d) => (
              <span key={d.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name} {d.value}
              </span>
            ))}
          </div>
        </section>

        {/* 近 7 天 */}
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-medium">近 7 天学习量</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer>
              <BarChart data={week}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Bar dataKey="新词" fill="#3d8f6a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="复习" fill="#a8b5ad" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* 个人遗忘曲线 */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">个人遗忘曲线</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          基于你所有单词的平均记忆间隔推算 —— 坚持复习，曲线会越来越平缓
        </p>
        <div className="mt-2 h-52">
          <ResponsiveContainer>
            <LineChart data={curve}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="天" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${v}%`, '记忆保持率']} labelFormatter={(d) => `${d} 天后`} />
              <Line type="monotone" dataKey="记忆保持率" stroke="#3d8f6a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 30 天月报 */}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">近 30 天月报</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center md:grid-cols-6">
          {[
            ['活跃天数', `${month.days} 天`],
            ['新词', month.newLearned],
            ['复习', month.reviewed],
            ['正确率', month.correct + month.wrong > 0 ? `${Math.round((month.correct / (month.correct + month.wrong)) * 100)}%` : '—'],
            ['总用时', `${Math.floor(month.seconds / 60)} 分`],
            ['获得 XP', month.xp],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-xl bg-secondary/60 p-3">
              <div className="text-lg font-semibold">{v}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

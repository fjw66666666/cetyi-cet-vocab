import { useMemo, useState } from 'react';
import { Bookmark, ChevronDown, Search, Slash } from 'lucide-react';
import { SpeakerButton } from '@/components/ui-bits';
import { HeatBadge } from '@/components/HeatBadge';
import { useWords } from '@/hooks/useWords';
import { store, useAppState } from '@/lib/store';
import { searchWords, wordsOfBook } from '@/lib/wordbank';
import { heatGrade, isHot } from '@/lib/priority';
import { cn } from '@/lib/utils';
import type { Book, WordEntry } from '@/lib/types';

type Filter = 'all' | 'hot' | 'starred' | 'wrong' | 'slain' | 'learning';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'hot', label: '热度 S/A' },
  { key: 'starred', label: '生词本' },
  { key: 'wrong', label: '错词本' },
  { key: 'learning', label: '学习中' },
  { key: 'slain', label: '已斩词' },
];

const TIER_LABEL = ['高频', '核心', '大纲'];

export default function LibraryPage() {
  const all = useWords();
  const state = useAppState();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [visible, setVisible] = useState(80);

  const list = useMemo(() => {
    const base: WordEntry[] = query.trim()
      ? searchWords(all, query, state.activeBook)
      : wordsOfBook(all, state.activeBook);
    return base.filter((w) => {
      const r = state.records[w.id];
      switch (filter) {
        case 'starred': return r?.starred;
        case 'wrong': return (r?.wrong_count ?? 0) > 0 && !r?.slain;
        case 'slain': return r?.slain;
        case 'learning': return r && !r.slain && r.status !== 'new' && r.status !== 'mastered';
        case 'hot': return isHot(heatGrade(w.fs, w.tier));
        default: return true;
      }
    });
  }, [all, query, state.activeBook, state.records, filter]);

  // 筛选/搜索/切换词书时重置分页
  const visibleList = list.slice(0, visible);
  const resetKey = `${query}|${filter}|${state.activeBook}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setVisible(80);
  }

  const counts = useMemo(() => ({
    starred: Object.values(state.records).filter((r) => r.starred).length,
    wrong: Object.values(state.records).filter((r) => r.wrong_count > 0 && !r.slain).length,
    slain: Object.values(state.records).filter((r) => r.slain).length,
  }), [state.records]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">词库</h1>

      {/* 词书切换 + 搜索 */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex rounded-xl border bg-card p-1">
          {(['CET4', 'CET6'] as Book[]).map((b) => (
            <button
              key={b}
              onClick={() => store.setActiveBook(b)}
              className={cn(
                'flex-1 rounded-lg px-4 py-1.5 text-sm transition-colors',
                state.activeBook === b ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {b === 'CET4' ? '四级' : '六级'}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索单词或释义…"
            className="w-full rounded-xl border bg-card py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors',
              filter === f.key ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            {f.label}
            {f.key === 'starred' && counts.starred > 0 && ` ${counts.starred}`}
            {f.key === 'wrong' && counts.wrong > 0 && ` ${counts.wrong}`}
            {f.key === 'slain' && counts.slain > 0 && ` ${counts.slain}`}
          </button>
        ))}
      </div>

      {/* 单词列表（分页渲染，避免大词库卡顿） */}
      <div className="space-y-2">
        {list.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的单词</p>
        )}
        {visibleList.map((w) => {
          const r = state.records[w.id];
          const open = openId === w.id;
          return (
            <div key={w.id} className="overflow-hidden rounded-2xl border bg-card">
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
                onClick={() => setOpenId(open ? null : w.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-word text-base font-semibold">{w.word}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{w.uk}</span>
                    <HeatBadge fs={w.fs} tier={w.tier} size="sm" />
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px]',
                      w.tier === 0 ? 'bg-primary/10 text-primary' : w.tier === 1 ? 'bg-secondary text-muted-foreground' : 'bg-secondary/60 text-muted-foreground',
                    )}>
                      {TIER_LABEL[w.tier]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{w.pos} {w.meanings[0]}</p>
                </div>
                <SpeakerButton text={w.word} size="sm" />
                <button
                  aria-label="加入生词本"
                  onClick={(e) => { e.stopPropagation(); store.toggleStar(w.id); }}
                  className={cn('rounded-full p-2', r?.starred ? 'text-amber-500' : 'text-muted-foreground hover:bg-secondary')}
                >
                  <Bookmark className={cn('h-4 w-4', r?.starred && 'fill-current')} />
                </button>
                <button
                  aria-label={r?.slain ? '取消斩词' : '斩词（已掌握）'}
                  onClick={(e) => { e.stopPropagation(); store.toggleSlain(w.id); }}
                  className={cn('rounded-full p-2', r?.slain ? 'text-destructive' : 'text-muted-foreground hover:bg-secondary')}
                >
                  <Slash className="h-4 w-4" />
                </button>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
              </div>

              {open && (
                <div className="space-y-3 border-t px-4 py-4 text-sm">
                  <ul className="space-y-1">
                    {w.meanings.map((m, i) => <li key={i} className="font-medium">{i + 1}. {m}</li>)}
                  </ul>
                  {w.example && (
                    <div className="rounded-xl bg-secondary/60 p-3 leading-relaxed">
                      <p>{w.example.en}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{w.example.zh}</p>
                    </div>
                  )}
                  {w.mnemonic && <p className="text-xs text-muted-foreground">助记：{w.mnemonic}</p>}
                  {w.collocations?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {w.collocations.map((c) => <span key={c} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{c}</span>)}
                    </div>
                  ) : null}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {w.derivatives?.length ? <p>派生：{w.derivatives.join('；')}</p> : null}
                    {w.confusables?.length ? <p>形近辨析：{w.confusables.join('；')}</p> : null}
                    {r && r.status !== 'new' && (
                      <p>
                        记忆状态：{r.slain ? '已斩' : { learning: '学习中', review: '待复习', mastered: '已掌握', new: '未学' }[r.status]}
                        {' · 间隔 '}{r.interval_min >= 1440 ? `${Math.round(r.interval_min / 1440)} 天` : `${r.interval_min} 分钟`}
                        {' · 强度 '}{r.ef.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {list.length > visible && (
        <button
          onClick={() => setVisible((v) => v + 100)}
          className="w-full rounded-xl border py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          显示更多（{visible}/{list.length}）
        </button>
      )}
      {list.length > 0 && list.length <= visible && (
        <p className="py-2 text-center text-xs text-muted-foreground">共 {list.length} 词</p>
      )}
    </div>
  );
}

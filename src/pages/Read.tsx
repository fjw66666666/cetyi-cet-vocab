// 阅读页：文章列表 ⇄ 详情（单路由内视图切换），点词查词 + 滚动/时长进度记录
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, ExternalLink } from 'lucide-react';
import { ArticleText } from '@/components/ArticleText';
import { DownloadProgressBar } from '@/components/DownloadProgress';
import { WeChatGuide } from '@/components/WeChatGuide';
import { GlassCard } from '@/components/GlassCard';
import { WordPopover } from '@/components/WordPopover';
import { useWords } from '@/hooks/useWords';
import { useDownload } from '@/hooks/useDownload';
import { loadArticle, loadArticleIndex, loadChangelog } from '@/lib/articles';
import type { ChangelogEntry } from '@/lib/articles';
import { store, useAppState } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Article, ArticleCategory, ArticleMeta, WordEntry } from '@/lib/types';

interface AnchorLike {
  getBoundingClientRect(): DOMRect;
}

const CATEGORIES: ArticleCategory[] = ['教育', '科技', '健康', '文化', '环境', '新闻', '其他'];
const TABS: (ArticleCategory | '全部')[] = ['全部', ...CATEGORIES];

const LEVEL_STYLE: Record<number, string> = {
  1: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  2: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  3: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  4: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
  5: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
};

function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function ArticleCard({
  meta,
  progress,
  onOpen,
}: {
  meta: ArticleMeta;
  progress: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-card hover-lift w-full rounded-2xl p-4 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-word text-base font-semibold leading-snug">{meta.title}</h3>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            LEVEL_STYLE[meta.level],
          )}
        >
          难度 {meta.level}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{meta.category}</span>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
          重点词 {Math.round(meta.hotCoverage)}%
        </span>
        <span className="text-muted-foreground">{meta.wordCount} 词</span>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full w-full origin-left bg-primary" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">来源：{meta.source}</p>
    </button>
  );
}

export default function ReadPage() {
  const words = useWords();
  const state = useAppState();

  const [index, setIndex] = useState<ArticleMeta[] | null>(null);
  const [changelogList, setChangelogList] = useState<ChangelogEntry[] | null>(null);
  const [category, setCategory] = useState<ArticleCategory | '全部'>('全部');
  const [changelogOpen, setChangelogOpen] = useState(false);

  const [slug, setSlug] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  const anchorRef = useRef<AnchorLike | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const enterTimeRef = useRef<number | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadArticleIndex(), loadChangelog()])
      .then(([idx, cl]) => {
        if (cancelled) return;
        setIndex(idx.articles);
        setChangelogList(cl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      setArticle(null);
      setArticleLoading(false);
      return;
    }
    let cancelled = false;
    setArticle(null);
    setArticleLoading(true);
    loadArticle(slug)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setArticleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 首次打开计 readCount+1、lastReadAt；进入/离开累计阅读时长
  useEffect(() => {
    if (!article) return;
    const id = article.id;
    if (!openedRef.current) {
      openedRef.current = true;
      const prev = store.get().reading.articles[id];
      store.saveReadingProgress(id, {
        readCount: (prev?.readCount ?? 0) + 1,
        lastReadAt: Date.now(),
      });
    }
    enterTimeRef.current = Date.now();
    return () => {
      openedRef.current = false;
      const t0 = enterTimeRef.current;
      enterTimeRef.current = null;
      if (!t0) return;
      const elapsed = Date.now() - t0;
      const prevMs = store.get().reading.articles[id]?.timeMs ?? 0;
      store.saveReadingProgress(id, { timeMs: prevMs + elapsed });
    };
  }, [article]);

  // 滚动节流 300ms 保存阅读进度
  useEffect(() => {
    if (!article) return;
    const id = article.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        store.saveReadingProgress(id, { progress });
      }, 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [article]);

  const handleWordClick = useCallback(
    (w: string, el?: HTMLElement) => {
      const entry = words.get(w);
      if (!entry) return;
      anchorRef.current = el ? { getBoundingClientRect: () => el.getBoundingClientRect() } : null;
      setSelectedWord(entry);
      setPopoverOpen(true);
    },
    [words],
  );

  const filtered = useMemo(() => {
    if (!index) return [];
    if (category === '全部') return index;
    return index.filter((m) => m.category === category);
  }, [index, category]);

  const handleMark = useCallback(() => {
    if (article && selectedWord) store.markReadingUnknown(article.id, selectedWord.id);
  }, [article, selectedWord]);

  const { status, progress, filename, showWeChatGuide, setShowWeChatGuide, saveText, reset } = useDownload();

  // 下载本文为 Markdown 或纯文本
  const downloadArticle = useCallback(
    (fmt: 'md' | 'txt') => {
      if (!article) return;
      const ext = fmt === 'md' ? 'md' : 'txt';
      const mime = fmt === 'md' ? 'text/markdown' : 'text/plain';
      const lines: string[] = [];
      lines.push(`# ${article.title}`);
      lines.push('');
      lines.push(`> 难度 ${article.level} · ${article.category} · ${article.wordCount} 词 · 重点词覆盖率 ${Math.round(article.hotCoverage)}%`);
      lines.push('');
      if (article.summary) {
        lines.push(`**摘要**：${article.summary}`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
      for (const p of article.paragraphs) {
        lines.push(p);
        lines.push('');
      }
      if (article.hotWords.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push(`**本文重点词（${article.hotWords.length}）**：`);
        lines.push(article.hotWords.join('、'));
        lines.push('');
      }
      lines.push(`---\n\n来源：${article.source}${article.sourceUrl ? `（${article.sourceUrl}）` : ''}`);
      const content = fmt === 'md' ? lines.join('\n') : lines.map((l) => l.replace(/[#>*_`-]/g, '')).join('\n');
      saveText(content, `${article.slug}.${ext}`, mime);
    },
    [article, saveText],
  );

  // ------- 详情视图 -------
  if (slug) {
    return (
      <div className="space-y-4 pb-24">
        <button
          type="button"
          onClick={() => setSlug(null)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          返回列表
        </button>

        {articleLoading && <Spinner />}

        {article && (
          <>
            <header className="space-y-3">
              <h1 className="font-word text-2xl font-semibold leading-tight">{article.title}</h1>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={cn('rounded-full border px-2 py-0.5 font-medium', LEVEL_STYLE[article.level])}>
                  难度 {article.level}
                </span>
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{article.category}</span>
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{article.wordCount} 词</span>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                  重点词 {Math.round(article.hotCoverage)}%
                </span>
                <span className="text-muted-foreground">来源：{article.source}</span>
                {article.sourceUrl && (
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary transition-opacity hover:opacity-80"
                  >
                    原文
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => downloadArticle('md')}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/20"
                >
                  <Download className="h-3 w-3" /> 下载本文
                </button>
              </div>

              {article.hotWords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">本文学什么：</span>
                  {article.hotWords.slice(0, 8).map((w) => (
                    <span key={w} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </header>

            <GlassCard className="space-y-4 p-5 leading-relaxed md:p-8">
              {article.summary && (
                <p className="text-sm italic text-muted-foreground">摘要：{article.summary}</p>
              )}
              {article.paragraphs.map((p, i) => (
                <ArticleText key={i} text={p} words={words} onWordClick={handleWordClick} className="text-[17px]" />
              ))}
            </GlassCard>
          </>
        )}

        <WordPopover
          word={selectedWord ?? undefined}
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          onMark={handleMark}
          anchorRef={anchorRef}
        />

        <DownloadProgressBar status={status} progress={progress} filename={filename} onClose={reset} />
        {showWeChatGuide && <WeChatGuide onClose={() => setShowWeChatGuide(false)} />}
      </div>
    );
  }

  // ------- 列表视图 -------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">英语阅读</h1>

      {changelogList && changelogList.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <button
            type="button"
            onClick={() => setChangelogOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            更新日志
            <ChevronDown className={cn('h-4 w-4 transition-transform', changelogOpen && 'rotate-180')} />
          </button>
          {changelogOpen && (
            <ul className="space-y-2 border-t px-4 py-3">
              {changelogList.slice(0, 10).map((c, i) => (
                <li key={`${c.slug}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5">
                    {c.action === 'added' ? '新增' : '更新'}
                  </span>
                  <span className="shrink-0">{c.date}</span>
                  <button
                    type="button"
                    onClick={() => setSlug(c.slug)}
                    className="truncate text-left transition-colors hover:text-foreground"
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setCategory(t)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors',
              category === t
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {!index ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">该分类暂无文章</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((m) => (
            <ArticleCard
              key={m.id}
              meta={m}
              progress={state.reading.articles[m.id]?.progress ?? 0}
              onOpen={() => setSlug(m.slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
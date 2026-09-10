// 文章加载：同源 fetch + 内存缓存 + 并发去重（仿 wordbank.ts）
import type { Article, ArticleMeta } from '@/lib/types';

export type ChangelogEntry = {
  date: string;
  action: 'added' | 'updated';
  title: string;
  slug: string;
};

export interface ArticleIndex {
  updatedAt: string;
  articles: ArticleMeta[];
}

let indexCache: ArticleIndex | null = null;
let indexPromise: Promise<ArticleIndex> | null = null;
const articleCache = new Map<string, Article>();
const articlePromise = new Map<string, Promise<Article>>();
let changelogCache: ChangelogEntry[] | null = null;
let changelogPromise: Promise<ChangelogEntry[]> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败: ${url}`);
  return res.json() as Promise<T>;
}

const base = `${import.meta.env.BASE_URL}data/articles/`;

export async function loadArticleIndex(): Promise<ArticleIndex> {
  if (!indexCache) {
    if (!indexPromise) indexPromise = fetchJson<ArticleIndex>(`${base}index.json`);
    indexCache = await indexPromise;
  }
  return indexCache;
}

export async function loadArticle(slug: string): Promise<Article> {
  if (!articleCache.has(slug)) {
    if (!articlePromise.has(slug)) articlePromise.set(slug, fetchJson<Article>(`${base}${slug}.json`));
    articleCache.set(slug, await articlePromise.get(slug)!);
  }
  return articleCache.get(slug)!;
}

export async function loadChangelog(): Promise<ChangelogEntry[]> {
  if (!changelogCache) {
    if (!changelogPromise) changelogPromise = fetchJson<ChangelogEntry[]>(`${base}changelog.json`);
    changelogCache = await changelogPromise;
  }
  return changelogCache;
}
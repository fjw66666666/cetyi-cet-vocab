// 词库加载：分片按需 fetch + 跨词书去重合并 + 搜索
import type { Book, WordEntry } from './types';

interface RawWord {
  id: string;
  word: string;
  uk?: string;
  us?: string;
  pos?: string;
  tier: 0 | 1 | 2;
  fs?: number;
  meanings: string[];
  example?: { en: string; zh: string };
  mnemonic?: string;
  collocations?: string[];
  derivatives?: string[];
  confusables?: string[];
}

interface BankIndex {
  books: Record<Book, { shards: string[]; count: number }>;
}

let indexCache: BankIndex | null = null;
const shardCache = new Map<string, RawWord[]>();
let mergedCache: Map<string, WordEntry> | null = null; // key = spelling
let loadingPromise: Promise<Map<string, WordEntry>> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载词库失败: ${url}`);
  return res.json() as Promise<T>;
}

export async function loadIndex(): Promise<BankIndex> {
  if (!indexCache) indexCache = await fetchJson<BankIndex>(`${import.meta.env.BASE_URL}data/index.json`);
  return indexCache;
}

async function loadShard(name: string): Promise<RawWord[]> {
  if (!shardCache.has(name)) {
    shardCache.set(name, await fetchJson<RawWord[]>(`${import.meta.env.BASE_URL}data/${name}`));
  }
  return shardCache.get(name)!;
}

/** 加载全部词库并合并：四六级重叠词去重，books 字段记录所属词书 */
export async function loadAllWords(): Promise<Map<string, WordEntry>> {
  if (mergedCache) return mergedCache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const idx = await loadIndex();
    const merged = new Map<string, WordEntry>();
    for (const book of ['CET4', 'CET6'] as Book[]) {
      for (const shard of idx.books[book].shards) {
        const list = await loadShard(shard);
        for (const raw of list) {
          const key = raw.id.toLowerCase();
          const exist = merged.get(key);
          if (exist) {
            if (!exist.books.includes(book)) exist.books.push(book);
            // 六级词条信息更全时补充字段
            if (!exist.mnemonic && raw.mnemonic) exist.mnemonic = raw.mnemonic;
            if (!exist.example && raw.example) exist.example = raw.example;
          } else {
            merged.set(key, { ...raw, id: key, books: [book] });
          }
        }
      }
    }
    mergedCache = merged;
    return merged;
  })();
  return loadingPromise;
}

/** 某词书的单词列表，默认高频优先（tier 0→1→2），同层按字母 */
export function wordsOfBook(all: Map<string, WordEntry>, book: Book): WordEntry[] {
  return [...all.values()]
    .filter((w) => w.books.includes(book))
    .sort((a, b) => a.tier - b.tier || a.word.localeCompare(b.word));
}

export function searchWords(all: Map<string, WordEntry>, query: string, book?: Book): WordEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [...all.values()]
    .filter((w) => (book ? w.books.includes(book) : true))
    .filter((w) => w.word.includes(q) || w.meanings.some((m) => m.includes(query.trim())))
    .sort((a, b) => a.tier - b.tier || a.word.localeCompare(b.word))
    .slice(0, 50);
}

export function bookSize(all: Map<string, WordEntry>, book: Book): number {
  return wordsOfBook(all, book).length;
}

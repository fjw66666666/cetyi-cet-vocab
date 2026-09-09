// 全局类型定义

export type Book = 'CET4' | 'CET6';
/** 词汇层级：0 真题高频 / 1 核心 / 2 大纲 */
export type Tier = 0 | 1 | 2;

export interface WordEntry {
  id: string; // 单词拼写（跨词书去重键）
  word: string;
  uk?: string; // 英音音标
  us?: string; // 美音音标
  pos?: string; // 词性
  tier: Tier;
  meanings: string[]; // 多义项分列
  example?: { en: string; zh: string };
  mnemonic?: string; // 词根词缀/助记
  collocations?: string[]; // 固定搭配
  derivatives?: string[]; // 派生词
  confusables?: string[]; // 形近词辨析
  books: Book[]; // 所属词书（重叠词为 ['CET4','CET6']）
}

/** 三档自评：0 忘记 / 1 模糊 / 2 认识 */
export type Grade = 0 | 1 | 2;

export type MemoryStatus = 'new' | 'learning' | 'review' | 'mastered';

export interface MemoryRecord {
  user_id: string; // 预留云端同步
  word_id: string; // = 单词拼写
  ef: number; // 记忆强度系数
  reps: number; // 连续「认识」次数
  lapses: number; // 「忘记」次数
  interval_min: number; // 当前间隔（分钟）
  next_review_at: number; // 下次复习时间戳（ms）
  last_grade: Grade;
  status: MemoryStatus;
  wrong_count: number; // 测验答错次数（错词本）
  starred: boolean; // 生词本
  slain: boolean; // 斩词（熟词，不再调度）
  created_at: number;
  updated_at: number;
}

export interface DayLog {
  newLearned: number;
  reviewed: number;
  correct: number;
  wrong: number;
  seconds: number;
  xp: number;
}

export interface Settings {
  dailyNew: number; // 10–50，默认 20
  voice: 'en-GB' | 'en-US';
  dark: 'light' | 'dark' | 'auto';
  notify: boolean;
  notifyHour: number; // 提醒小时（本地时间）
}

export interface VocabTest {
  date: string; // yyyy-mm-dd
  size: number; // 估算词汇量
}

export interface AppState {
  user_id: string;
  activeBook: Book;
  settings: Settings;
  records: Record<string, MemoryRecord>; // key = word spelling
  days: Record<string, DayLog>; // key = yyyy-mm-dd
  xp: number;
  streak: { current: number; best: number; lastDay: string };
  achievements: string[]; // 已解锁徽章 id
  vocabTests: VocabTest[];
  learnedAt: Record<string, number>; // word -> 首次学习时间（用于当天结束回顾）
}

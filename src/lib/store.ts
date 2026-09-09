// 本地持久化存储 + 可订阅状态（localStorage 实现，结构预留 user_id 便于云端扩展）
import { useSyncExternalStore } from 'react';
import { SRS_CONFIG } from './config';
import type { AppState, DayLog, Grade, Settings, VocabTest } from './types';
import { createRecord, schedule } from './sm2';
import { checkAchievements, markHourFlags } from './gamification';

const KEY = 'cetyi.v1';

export function dateKey(d: Date | number = Date.now()): string {
  const t = typeof d === 'number' ? new Date(d) : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function defaultState(): AppState {
  return {
    user_id: 'local-' + Math.random().toString(36).slice(2, 10),
    activeBook: 'CET4',
    settings: {
      dailyNew: SRS_CONFIG.daily_new_default,
      voice: 'en-GB',
      dark: 'auto',
      notify: false,
      notifyHour: 20,
    },
    records: {},
    days: {},
    xp: 0,
    streak: { current: 0, best: 0, lastDay: '' },
    achievements: [],
    vocabTests: [],
    learnedAt: {},
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } };
  } catch {
    return defaultState();
  }
}

type Listener = () => void;

class AppStore {
  private state: AppState = load();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  get = (): AppState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(next: AppState) {
    this.state = next;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch {
        /* 存储满时静默失败 */
      }
    }, 120);
    this.listeners.forEach((fn) => fn());
  }

  update(mut: (s: AppState) => void) {
    const draft: AppState = JSON.parse(JSON.stringify(this.state));
    mut(draft);
    this.commit(draft);
  }

  /** 记录一次作答（学习或复习），完成 SM-2 调度 + XP + 当日统计 + 连胜 + 徽章 */
  grade(wordId: string, grade: Grade, opts: { isNew: boolean; quizCorrect?: boolean; xpBase: number }) {
    const now = Date.now();
    this.update((s) => {
      const rec = s.records[wordId] ?? createRecord(s.user_id, wordId, now);
      schedule(rec, grade, now);
      if (opts.isNew && !s.learnedAt[wordId]) s.learnedAt[wordId] = now;
      if (opts.quizCorrect === false) rec.wrong_count += 1;
      s.records[wordId] = rec;

      const dk = dateKey(now);
      markHourFlags(s, new Date(now).getHours());
      const day: DayLog = s.days[dk] ?? { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 };
      if (opts.isNew) day.newLearned += 1;
      else day.reviewed += 1;
      if (opts.quizCorrect === true) day.correct += 1;
      if (opts.quizCorrect === false) day.wrong += 1;
      const gained = opts.xpBase + (opts.quizCorrect ? 3 : 0);
      day.xp += gained;
      s.xp += gained;
      s.days[dk] = day;

      // 连胜：今天第一次有学习行为时结算
      const today = dk;
      const yesterday = dateKey(now - 86400_000);
      if (s.streak.lastDay !== today) {
        s.streak.current = s.streak.lastDay === yesterday ? s.streak.current + 1 : 1;
        s.streak.best = Math.max(s.streak.best, s.streak.current);
        s.streak.lastDay = today;
      }

      s.achievements = checkAchievements(s);
    });
  }

  addSeconds(sec: number) {
    this.update((s) => {
      const dk = dateKey();
      const day = s.days[dk] ?? { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 };
      day.seconds += sec;
      s.days[dk] = day;
    });
  }

  addXp(xp: number) {
    this.update((s) => {
      s.xp += xp;
      const dk = dateKey();
      const day = s.days[dk] ?? { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0 };
      day.xp += xp;
      s.days[dk] = day;
      s.achievements = checkAchievements(s);
    });
  }

  toggleStar(wordId: string) {
    const now = Date.now();
    this.update((s) => {
      const rec = s.records[wordId] ?? createRecord(s.user_id, wordId, now);
      rec.starred = !rec.starred;
      rec.updated_at = now;
      // 未学词仅标记生词，不改变调度
      if (!s.records[wordId]) rec.next_review_at = Number.MAX_SAFE_INTEGER;
      s.records[wordId] = rec;
    });
  }

  toggleSlain(wordId: string) {
    const now = Date.now();
    this.update((s) => {
      const rec = s.records[wordId] ?? createRecord(s.user_id, wordId, now);
      rec.slain = !rec.slain;
      rec.updated_at = now;
      if (rec.slain) rec.status = 'mastered';
      s.records[wordId] = rec;
      s.achievements = checkAchievements(s);
    });
  }

  setSettings(patch: Partial<Settings>) {
    this.update((s) => {
      s.settings = { ...s.settings, ...patch };
    });
  }

  setActiveBook(book: AppState['activeBook']) {
    this.update((s) => {
      s.activeBook = book;
    });
  }

  addVocabTest(t: VocabTest) {
    this.update((s) => {
      s.vocabTests.push(t);
      s.achievements = checkAchievements(s);
    });
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.user_id || !parsed.settings) return false;
      this.commit({ ...defaultState(), ...parsed });
      return true;
    } catch {
      return false;
    }
  }

  reset() {
    this.commit(defaultState());
  }
}

export const store = new AppStore();

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get);
}

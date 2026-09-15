// T6 断言脚本：成就「早起的鸟 / 深夜书房」时间维度判定
// 运行：node scripts/check-achievements.ts（cwd 必须在仓库根）
// 说明：gamification.ts 只含 import type，可被 Node 原生 TS 直接导入；失败直接 throw。
import { ACHIEVEMENTS } from '../src/lib/gamification.ts';
import type { AppState } from '../src/lib/types.ts';

const base = (days: AppState['days']): AppState => ({
  user_id: 't',
  activeBook: 'CET4',
  settings: { dailyNew: 20, voice: 'en-GB', dark: 'dark', notify: false, notifyHour: 20 },
  records: {},
  days,
  xp: 0,
  streak: { current: 0, best: 0, lastDay: '' },
  achievements: [],
  vocabTests: [],
  learnedAt: {},
  reading: { articles: {} },
});

const test = (id: string, s: AppState): boolean => {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) throw new Error('FAIL: 未找到成就 ' + id);
  return a.test(s);
};
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error('FAIL: ' + m);
};

assert(
  test('early-bird', base({ '2026-09-14': { newLearned: 5, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0, firstHour: 7, lastHour: 9 } })) === true,
  'early 7点应 true',
);
assert(
  test('night-owl', base({ '2026-09-14': { newLearned: 5, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0, firstHour: 7, lastHour: 9 } })) === false,
  'night 9点应 false',
);
assert(
  test('night-owl', base({ '2026-09-14': { newLearned: 5, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0, firstHour: 14, lastHour: 23 } })) === true,
  'night 23点应 true',
);
assert(
  test('early-bird', base({ '2026-09-14': { newLearned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0, xp: 0, firstHour: 7, lastHour: 9 } })) === false,
  '无学习行为不计数',
);

console.log('check-achievements: all passed');

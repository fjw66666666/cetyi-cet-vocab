// T4 断言脚本：记忆持久度算法边界校验
// 运行：node scripts/check-memory.ts（cwd 必须在仓库根）
// 说明：Node v22 原生支持 TS 类型擦除；必须用带 .ts 扩展名的相对导入。
//       eslint 对本文件注入浏览器 globals，故不得使用 process / __dirname；失败直接 throw。
import { memoryStrength } from '../src/lib/memory.ts';
import type { MemoryRecord } from '../src/lib/types.ts';

const rec = (p: Partial<MemoryRecord>): MemoryRecord => ({
  user_id: 't',
  word_id: 'w',
  ef: 2.5,
  reps: 0,
  lapses: 0,
  interval_min: 0,
  next_review_at: 0,
  last_grade: 2,
  status: 'learning',
  wrong_count: 0,
  starred: false,
  slain: false,
  created_at: 0,
  updated_at: 0,
  ...p,
});

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error('FAIL: ' + m);
};

const a = memoryStrength(rec({ interval_min: 0 }));
assert(a < 15, `interval0 应<15 实为 ${a}`);

const b = memoryStrength(rec({ interval_min: 43200 }));
assert(b >= 90, `interval43200 应≥90 实为 ${b}`);

const c = memoryStrength(rec({ interval_min: 43200, lapses: 5 }));
assert(b - c >= 20, `lapses5 应下降≥20 实为 ${b - c}`);

for (const iv of [0, 1, 1440, 43200, 999999]) {
  const v = memoryStrength(rec({ interval_min: iv, ef: 1.3, lapses: 99 }));
  assert(v >= 5 && v <= 100, `边界 ${v}`);
}

console.log('check-memory: all passed');

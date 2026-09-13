// zod 请求参数校验：全量校验 + strict 拒绝未知字段 + 长度上限防 localStorage 膨胀
import { z } from 'zod';
import type { OpName } from './types';

const wordId = z.string().trim().toLowerCase().min(1).max(48); // wordId = 单词小写拼写
const articleId = z.string().trim().min(1).max(64);

const schemas = {
  'system.ping': z.object({}).strict(),
  'word.query': z.object({ wordId }).strict(),
  'stats.snapshot': z.object({}).strict(),
  'word.setStar': z.object({ wordId, value: z.boolean() }).strict(),
  'word.setSlain': z.object({ wordId, value: z.boolean() }).strict(),
  'word.addToPlan': z.object({ wordId }).strict(),
  'learn.grade': z
    .object({ wordId, grade: z.union([z.literal(0), z.literal(1), z.literal(2)]) })
    .strict(), // 不接受 isNew/xpBase/quizCorrect —— XP 由服务端推导，防刷
  'settings.update': z
    .object({
      dailyNew: z.number().int().min(10).max(50).optional(),
      voice: z.enum(['en-GB', 'en-US']).optional(),
      notify: z.boolean().optional(),
      notifyHour: z.number().int().min(0).max(23).optional(),
    })
    .strict(),
  'reading.progress': z
    .object({
      articleId,
      progress: z.number().min(0).max(1).optional(), // 0-1 滚动进度
      timeMs: z.number().int().min(0).optional(), // 累计阅读时长
    })
    .strict(),
  'reading.markUnknown': z.object({ articleId, wordId }).strict(),
} satisfies Record<OpName, z.ZodType>;

export type SchemaOf<O extends OpName> = z.infer<(typeof schemas)[O]>;

export function validatePayload(op: OpName, payload: unknown): { ok: true; data: unknown } | { ok: false; issues: string[] } {
  const r = schemas[op].safeParse(payload ?? {});
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`) };
}
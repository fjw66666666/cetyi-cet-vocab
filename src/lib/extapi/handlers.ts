// 操作路由：scope → zod → 词库校验 → store action（业务规则由 store 保证）→ 审计
import { XP_RULES, SRS_CONFIG } from '../config';
import { ensureNotifyPermission } from '../notify';
import { store } from '../store';
import { loadAllWords } from '../wordbank';
import type { Grade } from '../types';
import { logAudit } from './audit';
import { makeErr, makeOk } from './errors';
import { scopeForOp } from './scopes';
import { validatePayload, type SchemaOf } from './schema';
import type { ClientEntry, ExtResponse, OpName } from './types';

async function ensureWordExists(wordId: string): Promise<boolean> {
  const all = await loadAllWords();
  return all.has(wordId.toLowerCase());
}

export async function handleOp(id: string, op: OpName, payload: unknown, client: ClientEntry): Promise<ExtResponse> {
  const scope = scopeForOp(op);
  if (!scope) return makeErr(id, 'E_INVALID_PAYLOAD', [`未知操作: ${op}`]);

  // 权限范围校验
  if (!client.scopes.includes(scope)) return makeErr(id, 'E_SCOPE_DENIED', { required: scope });

  // 参数校验
  const v = validatePayload(op, payload);
  if (!v.ok) return makeErr(id, 'E_INVALID_PAYLOAD', v.issues);

  const data = v.data;
  let response: ExtResponse | null = null;

  switch (op) {
    case 'system.ping':
      response = makeOk(id, { pong: true, api: 'cetyi-ext/v1' });
      break;

    case 'word.query': {
      const { wordId } = data as SchemaOf<'word.query'>;
      const all = await loadAllWords();
      const entry = all.get(wordId);
      if (!entry) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      const rec = store.get().records[wordId];
      response = makeOk(id, {
        entry: {
          id: entry.id,
          word: entry.word,
          uk: entry.uk,
          us: entry.us,
          pos: entry.pos,
          tier: entry.tier,
          fs: entry.fs,
          meanings: entry.meanings,
          books: entry.books,
        },
        record: rec
          ? {
              status: rec.status,
              starred: rec.starred,
              slain: rec.slain,
              ef: rec.ef,
              interval_min: rec.interval_min,
              wrong_count: rec.wrong_count,
            }
          : null,
      });
      break;
    }

    case 'stats.snapshot': {
      const s = store.get();
      const recs = Object.values(s.records);
      response = makeOk(id, {
        user_id: s.user_id,
        activeBook: s.activeBook,
        settings: { ...s.settings },
        xp: s.xp,
        streak: s.streak,
        today: s.days[new Date().toISOString().slice(0, 10)] ?? null,
        counts: {
          total: recs.length,
          learning: recs.filter((r) => r.status === 'learning').length,
          review: recs.filter((r) => r.status === 'review').length,
          mastered: recs.filter((r) => r.status === 'mastered' || r.slain).length,
          starred: recs.filter((r) => r.starred).length,
        },
      });
      break;
    }

    case 'word.setStar': {
      const { wordId, value } = data as SchemaOf<'word.setStar'>;
      if (!(await ensureWordExists(wordId))) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      const cur = store.get().records[wordId]?.starred ?? false;
      if (cur !== value) store.toggleStar(wordId);
      response = makeOk(id, { wordId, starred: value });
      break;
    }

    case 'word.setSlain': {
      const { wordId, value } = data as SchemaOf<'word.setSlain'>;
      if (!(await ensureWordExists(wordId))) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      const cur = store.get().records[wordId]?.slain ?? false;
      if (cur !== value) store.toggleSlain(wordId);
      response = makeOk(id, { wordId, slain: value });
      break;
    }

    case 'word.addToPlan': {
      const { wordId } = data as SchemaOf<'word.addToPlan'>;
      if (!(await ensureWordExists(wordId))) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      store.markFromReading(wordId);
      response = makeOk(id, { wordId, inPlan: true });
      break;
    }

    case 'learn.grade': {
      const { wordId, grade } = data as SchemaOf<'learn.grade'>;
      if (!(await ensureWordExists(wordId))) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      // XP/新词判定由服务端推导，外部无法刷 XP 或污染统计
      const rec = store.get().records[wordId];
      const isNew = !rec || rec.status === 'new';
      const xpBase = isNew
        ? XP_RULES.learn
        : grade === 2
          ? XP_RULES.review_good
          : grade === 1
            ? XP_RULES.review_hard
            : XP_RULES.review_again;
      store.grade(wordId, grade as Grade, { isNew, xpBase });
      const after = store.get().records[wordId];
      response = makeOk(id, {
        wordId,
        isNew,
        status: after?.status,
        interval_min: after?.interval_min,
        ef: after?.ef,
      });
      break;
    }

    case 'settings.update': {
      const patch = data as SchemaOf<'settings.update'>;
      // 业务规则：开启通知需先获得系统通知权限
      if (patch.notify === true && !(await ensureNotifyPermission())) {
        return makeErr(id, 'E_BUSINESS_RULE', { field: 'notify', reason: 'NOTIFICATION_PERMISSION_DENIED' });
      }
      if (patch.dailyNew !== undefined && (patch.dailyNew < 10 || patch.dailyNew > SRS_CONFIG.daily_new_max)) {
        return makeErr(id, 'E_BUSINESS_RULE', { field: 'dailyNew', reason: 'OUT_OF_RANGE' });
      }
      store.setSettings(patch);
      response = makeOk(id, { settings: store.get().settings });
      break;
    }

    case 'reading.progress': {
      const { articleId, progress, timeMs } = data as SchemaOf<'reading.progress'>;
      const patch: { progress?: number; timeMs?: number } = {};
      if (progress !== undefined) patch.progress = progress;
      if (timeMs !== undefined) patch.timeMs = timeMs;
      store.saveReadingProgress(articleId, patch);
      response = makeOk(id, { articleId, saved: true });
      break;
    }

    case 'reading.markUnknown': {
      const { articleId, wordId } = data as SchemaOf<'reading.markUnknown'>;
      if (!(await ensureWordExists(wordId))) return makeErr(id, 'E_WORD_UNKNOWN', { wordId });
      store.markReadingUnknown(articleId, wordId);
      response = makeOk(id, { articleId, wordId, marked: true });
      break;
    }

    default:
      response = makeErr(id, 'E_INVALID_PAYLOAD', [`未支持的操作: ${op}`]);
  }

  // 写操作审计（只读 op 不记账，仅在限速触发时记）
  if (scope !== 'read' && response) {
    logAudit({ clientId: client.id, op, target: extractTarget(op, data), code: response.ok ? 'OK' : ((response.error?.code ?? 'E_INTERNAL') as never) });
  }
  return response;
}

function extractTarget(op: OpName, data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.wordId === 'string') return d.wordId;
    if (typeof d.articleId === 'string') return d.articleId;
  }
  return op;
}
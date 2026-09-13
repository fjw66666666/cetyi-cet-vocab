// Ext API 总线：postMessage 跨域通道 + window.CetyiExt 同源桥，统一 dispatch
import { logAudit } from './audit';
import { makeErr } from './errors';
import { handleOp } from './handlers';
import { findClientByToken, loadOrigins, touchLastUsed } from './permissions';
import { KNOWN_OPS, scopeForOp } from './scopes';
import type { Envelope, ExtResponse, OpName } from './types';

const ENABLED_KEY = 'cetyi.extapi.enabled.v1';
const TS_WINDOW = 60_000; // 信封时间戳有效期
const RATE_WINDOW = 60_000; // 限速窗口
const RATE_HARD = 60; // 窗口内硬上限
const RATE_WARN = 30; // 超过该值记审计
const DEDUP_CAP = 200;

let initialized = false;
let msgHandler: ((e: MessageEvent) => void) | null = null;

const rateMap = new Map<string, number[]>(); // clientId -> 事件时间戳队列
const seenIds = new Map<string, number>(); // `${clientId}:${id}` -> ts（LRU 去重）

export function isExtApiEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExtApiEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** 校验 origin 白名单：本域恒允许；跨域需用户手动全匹配录入 */
export function isOriginAllowed(origin: string): boolean {
  if (origin === window.location.origin) return true;
  if (!origin || origin === 'null') return false;
  return loadOrigins().includes(origin);
}

function checkRate(clientId: string): { ok: boolean; warn: boolean } {
  const now = Date.now();
  const q = (rateMap.get(clientId) ?? []).filter((t) => now - t < RATE_WINDOW);
  if (q.length >= RATE_HARD) {
    rateMap.set(clientId, q);
    return { ok: false, warn: q.length >= RATE_WARN };
  }
  q.push(now);
  rateMap.set(clientId, q);
  return { ok: true, warn: q.length >= RATE_WARN };
}

function checkReplay(clientId: string, id: string, ts: number): boolean {
  const now = Date.now();
  if (typeof ts !== 'number' || !isFinite(ts) || now - ts > TS_WINDOW || ts - now > TS_WINDOW) return false;
  const key = `${clientId}:${id}`;
  if (seenIds.has(key)) return false;
  seenIds.set(key, now);
  if (seenIds.size > DEDUP_CAP) {
    const first = seenIds.keys().next().value;
    if (first !== undefined) seenIds.delete(first);
  }
  return true;
}

/** 统一分发入口：校验信封 → 路由 handler → 返回响应 */
async function dispatch(env: Envelope, origin: string): Promise<ExtResponse> {
  const id = String(env?.id ?? '');
  const fail = (code: Parameters<typeof makeErr>[1], details?: unknown) => makeErr(id, code, details);

  if (!isExtApiEnabled()) return fail('E_DISABLED');
  if (!isOriginAllowed(origin)) return fail('E_ORIGIN_DENIED', { origin });

  const client = findClientByToken(env?.token);
  if (!client) return fail('E_TOKEN_INVALID');

  // 重放检测
  if (!checkReplay(client.id, id, Number(env?.ts))) return fail('E_REPLAY');

  // 限速
  const rate = checkRate(client.id);
  if (!rate.ok) {
    logAudit({ clientId: client.id, op: (env.op as OpName) || 'system.ping', target: 'RATE_LIMITED', code: 'E_RATE_LIMITED' });
    return fail('E_RATE_LIMITED');
  }
  if (rate.warn) {
    logAudit({ clientId: client.id, op: (env.op as OpName) || 'system.ping', target: 'RATE_WARN', code: 'E_RATE_LIMITED' });
  }

  // 未知 op
  if (!KNOWN_OPS.includes(env.op as OpName)) return fail('E_INVALID_PAYLOAD', [`未知操作: ${String(env.op)}`]);

  touchLastUsed(client.id);
  // scope 校验前置（handler 内还有一次深度校验）
  if (!client.scopes.includes(scopeForOp(env.op) as never)) return fail('E_SCOPE_DENIED', { required: scopeForOp(env.op) });

  return handleOp(id, env.op as OpName, env.payload, client);
}

/** 初始化：幂等，防 StrictMode 双挂载 */
export function initExtApi(): void {
  if (initialized) return;
  initialized = true;

  // 通道 1：postMessage（跨域 iframe / 父窗口）
  msgHandler = (event: MessageEvent) => {
    const env = event.data as Envelope;
    if (!env || typeof env !== 'object' || typeof env.op !== 'string' || typeof env.token !== 'string') return;
    void dispatch(env, event.origin).then((reply) => {
      const target = event.source as WindowProxy | null;
      try {
        if (target && typeof target.postMessage === 'function') {
          target.postMessage(reply, event.origin);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(reply, event.origin);
        }
      } catch {
        /* 跨域回发失败时静默 */
      }
    });
  };
  window.addEventListener('message', msgHandler);

  // 通道 2：同源桥 window.CetyiExt（脚本 / 浏览器扩展 / DevTools）
  const bridge = {
    async call(token: string, op: OpName, payload?: unknown): Promise<ExtResponse> {
      return dispatch({ id: genId(), token, op, payload, ts: Date.now() }, window.location.origin);
    },
    async ping(token: string): Promise<ExtResponse> {
      return bridge.call(token, 'system.ping');
    },
  };
  (window as unknown as { CetyiExt: typeof bridge }).CetyiExt = bridge;
}

let seq = 0;
function genId(): string {
  seq = (seq + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${seq.toString(36)}`;
}
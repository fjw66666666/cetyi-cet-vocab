// 审计日志：环形上限 500 条摘要，独立 localStorage key
import type { AuditEntry, ErrorCode, OpName } from './types';

const KEY = 'cetyi.extapi.audit.v1';
const CAP = 500;

export function logAudit(entry: Omit<AuditEntry, 'ts' | 'ms'> & { ms?: number }): void {
  const e: AuditEntry = {
    ts: Date.now(),
    ms: entry.ms ?? 0,
    clientId: entry.clientId,
    op: entry.op,
    target: String(entry.target).slice(0, 20),
    code: entry.code,
  };
  try {
    const list = listAudit();
    list.unshift(e);
    if (list.length > CAP) list.length = CAP;
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function listAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function exportAudit(): string {
  return JSON.stringify(listAudit(), null, 2);
}

export function clearAudit(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export type AuditCode = ErrorCode | 'OK';
export type { OpName };
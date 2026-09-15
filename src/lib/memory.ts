// 记忆持久度评估（纯函数，无副作用）
// 注意：本文件只允许 `import type`——不得引入任何「值导入」，否则 scripts/check-memory.ts
// 将无法被 Node 原生 TS 类型擦除直接导入（见 HANDOFF §1.7）。
import type { MemoryRecord } from './types';

/**
 * 记忆持久度 0–100（间隔越大越牢，ef 加权，lapses 惩罚）。
 * span 取 7 天时间常数（10080 分钟）：30 天间隔可得约 99 分，间隔为 0 时兜底为 5 分。
 * 该取值可同时满足「30 天≥90」「0 天<15」「lapses=5 至少下降 20」三条断言。
 */
export function memoryStrength(rec: MemoryRecord): number {
  const span = 10080;
  const base = 1 - Math.exp(-Math.max(0, rec.interval_min) / span);
  const efFactor = Math.min(1, Math.max(0.4, rec.ef / 2.5));
  const lapsePenalty = Math.min(40, rec.lapses * 5);
  return Math.max(5, Math.min(100, Math.round(base * efFactor * 100 - lapsePenalty)));
}

/** 强度分级（阈值 30 / 60 / 85）与语义色调 */
export function strengthLabel(v: number): { label: string; tone: 'danger' | 'warn' | 'info' | 'good' } {
  if (v < 30) return { label: '易忘', tone: 'danger' };
  if (v < 60) return { label: '不稳', tone: 'warn' };
  if (v < 85) return { label: '较牢', tone: 'info' };
  return { label: '牢固', tone: 'good' };
}

/** 由 interval_min 换算可保留天数（向下取整，最小 0） */
export function daysRetained(rec: MemoryRecord): number {
  return Math.max(0, Math.floor(rec.interval_min / 1440));
}

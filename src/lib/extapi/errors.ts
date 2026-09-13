// 响应信封构造器
import { ERROR_CODES, type ErrorCode, type ExtResponse } from './types';

export function makeOk(id: string, data?: unknown): ExtResponse {
  return { id, ok: true, data };
}

export function makeErr(id: string, code: ErrorCode, details?: unknown): ExtResponse {
  return { id, ok: false, error: { code, message: ERROR_CODES[code], details } };
}

export { ERROR_CODES };
export type { ErrorCode };
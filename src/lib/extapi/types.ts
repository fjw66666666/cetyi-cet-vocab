// 外部扩展接口（Ext API）类型定义

/** 统一错误码：非法/不支持的修改操作时对外稳定返回 */
export type ErrorCode =
  | 'E_DISABLED' // 扩展接口未启用
  | 'E_ORIGIN_DENIED' // 消息来源不在白名单
  | 'E_TOKEN_INVALID' // 令牌无效/已吊销
  | 'E_SCOPE_DENIED' // 客户端未授权所需范围
  | 'E_INVALID_PAYLOAD' // 参数非法（附带 zod issues）
  | 'E_WORD_UNKNOWN' // 单词不在词库
  | 'E_RATE_LIMITED' // 触发限速
  | 'E_REPLAY' // 疑似重放（ts 超窗 / 请求 id 重复）
  | 'E_BUSINESS_RULE' // 违反业务规则（如通知权限被拒）
  | 'E_INTERNAL'; // 内部错误

export const ERROR_CODES: Record<ErrorCode, string> = {
  E_DISABLED: '扩展接口未启用',
  E_ORIGIN_DENIED: '消息来源不在白名单',
  E_TOKEN_INVALID: '令牌无效或已吊销',
  E_SCOPE_DENIED: '未授权该操作所需权限范围',
  E_INVALID_PAYLOAD: '请求参数非法',
  E_WORD_UNKNOWN: '单词不在词库中',
  E_RATE_LIMITED: '请求过于频繁，请稍后再试',
  E_REPLAY: '请求已过期或重复',
  E_BUSINESS_RULE: '操作不符合应用业务规则',
  E_INTERNAL: '服务内部错误',
};

/** 支持的操作名 */
export type OpName =
  | 'system.ping'
  | 'word.query'
  | 'stats.snapshot'
  | 'word.setStar'
  | 'word.setSlain'
  | 'word.addToPlan'
  | 'learn.grade'
  | 'settings.update'
  | 'reading.progress'
  | 'reading.markUnknown';

/** 权限范围 */
export type Scope =
  | 'read' // 只读查询
  | 'words.write' // 单词操作（生词本/斩词/加入计划）
  | 'grade.write' // 学习评分
  | 'settings.write' // 设置子集
  | 'reading.write'; // 阅读进度与阅读生词

/** 外部请求信封 */
export interface Envelope {
  id: string; // 请求 id，响应原样回传，用于关联
  token: string; // 能力令牌
  op: OpName;
  payload?: unknown;
  ts: number; // 时间戳（ms），60s 内有效
}

/** 统一响应信封 */
export interface ExtResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: ErrorCode; message: string; details?: unknown };
}

/** 已授权客户端 */
export interface ClientEntry {
  id: string; // 客户端 id（c + 随机）
  name: string; // 用户可读名称
  token: string; // 能力令牌 cetyi_ext_xxxx
  scopes: Scope[];
  createdAt: number;
  lastUsedAt: number;
}

/** 审计日志条目（只存摘要） */
export interface AuditEntry {
  ts: number;
  clientId: string;
  op: OpName;
  target: string; // 操作对象（截断 20 字）
  code: ErrorCode | 'OK';
  ms: number;
}
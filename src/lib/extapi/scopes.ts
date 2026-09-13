// 权限范围定义与 op → scope 映射
import type { OpName, Scope } from './types';

export const ALL_SCOPES: Scope[] = ['read', 'words.write', 'grade.write', 'settings.write', 'reading.write'];

export const SCOPE_META: Record<Scope, { label: string; desc: string }> = {
  read: { label: '只读查询', desc: '查询单词信息与学习统计快照' },
  'words.write': { label: '单词操作', desc: '标记生词、斩词、把词加入学习计划' },
  'grade.write': { label: '学习评分', desc: '提交三档自评（0/1/2），走 SM-2 调度' },
  'settings.write': { label: '设置修改', desc: '修改每日新词量/发音/提醒等设置子集' },
  'reading.write': { label: '阅读进度', desc: '写入文章阅读进度、标记阅读生词' },
};

const OP_SCOPE: Record<OpName, Scope> = {
  'system.ping': 'read',
  'word.query': 'read',
  'stats.snapshot': 'read',
  'word.setStar': 'words.write',
  'word.setSlain': 'words.write',
  'word.addToPlan': 'words.write',
  'learn.grade': 'grade.write',
  'settings.update': 'settings.write',
  'reading.progress': 'reading.write',
  'reading.markUnknown': 'reading.write',
};

export function scopeForOp(op: string): Scope | null {
  return (OP_SCOPE as Record<string, Scope>)[op] ?? null;
}

export const KNOWN_OPS: OpName[] = Object.keys(OP_SCOPE) as OpName[];
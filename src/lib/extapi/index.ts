// 外部扩展接口统一出口
export { initExtApi, isExtApiEnabled, setExtApiEnabled, isOriginAllowed } from './bus';
export {
  loadClients,
  saveClients,
  createClient,
  revokeClient,
  rotateToken,
  updateScopes,
  loadOrigins,
  saveOrigins,
  isValidOrigin,
} from './permissions';
export { listAudit, exportAudit, clearAudit } from './audit';
export { ALL_SCOPES, SCOPE_META } from './scopes';
export { ERROR_CODES } from './errors';
export type { Envelope, ExtResponse, ClientEntry, AuditEntry, OpName, Scope, ErrorCode } from './types';
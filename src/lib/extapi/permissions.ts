// 客户端授权管理：localStorage 持久化（同源策略保护令牌不被第三方页面读取）
import type { ClientEntry, Scope } from './types';

const KEY = 'cetyi.extauth.v1';

function rand(prefix: string): string {
  const seed = new Uint8Array(16);
  crypto.getRandomValues(seed);
  return prefix + Array.from(seed, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadClients(): ClientEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ClientEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveClients(clients: ClientEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clients));
  } catch {
    /* 存储满时静默失败 */
  }
}

export function createClient(name: string, scopes: Scope[]): ClientEntry {
  const entry: ClientEntry = {
    id: rand('c'),
    name: name.trim().slice(0, 24) || '未命名应用',
    token: rand('cetyi_ext_'),
    scopes: [...new Set(scopes)],
    createdAt: Date.now(),
    lastUsedAt: 0,
  };
  saveClients([...loadClients(), entry]);
  return entry;
}

export function revokeClient(id: string): void {
  saveClients(loadClients().filter((c) => c.id !== id));
}

export function rotateToken(id: string): ClientEntry | null {
  const clients = loadClients();
  const c = clients.find((x) => x.id === id);
  if (!c) return null;
  c.token = rand('cetyi_ext_');
  saveClients(clients);
  return c;
}

export function updateScopes(id: string, scopes: Scope[]): ClientEntry | null {
  const clients = loadClients();
  const c = clients.find((x) => x.id === id);
  if (!c) return null;
  c.scopes = [...new Set(scopes)];
  saveClients(clients);
  return c;
}

export function findClientByToken(token: string): ClientEntry | null {
  const t = String(token || '').trim();
  if (!t) return null;
  return loadClients().find((c) => c.token === t) ?? null;
}

export function touchLastUsed(id: string): void {
  const clients = loadClients();
  const c = clients.find((x) => x.id === id);
  if (!c) return;
  c.lastUsedAt = Date.now();
  saveClients(clients);
}

// ---------------- origin 白名单 ----------------

const ORIGIN_KEY = 'cetyi.extapi.origins.v1';

export function loadOrigins(): string[] {
  try {
    const raw = localStorage.getItem(ORIGIN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveOrigins(origins: string[]): void {
  try {
    localStorage.setItem(ORIGIN_KEY, JSON.stringify(origins));
  } catch {
    /* ignore */
  }
}

/** 严格校验 origin 形态：scheme://host[:port]，禁通配符 */
export function isValidOrigin(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === v && !v.includes('*');
  } catch {
    return false;
  }
}
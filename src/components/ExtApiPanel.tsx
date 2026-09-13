// 扩展接口管理面板：启用开关、客户端授权（令牌/范围）、origin 白名单、审计日志
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Aperture,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_SCOPES,
  SCOPE_META,
  clearAudit,
  createClient,
  exportAudit,
  isExtApiEnabled,
  isValidOrigin,
  listAudit,
  loadClients,
  loadOrigins,
  revokeClient,
  rotateToken,
  saveOrigins,
  setExtApiEnabled,
  updateScopes,
  type AuditEntry,
  type ClientEntry,
  type Scope,
} from '@/lib/extapi';
import { downloadText } from '@/lib/download';
import { cn } from '@/lib/utils';

const AUDIT_PAGE = 20;

function copyText(text: string, label: string) {
  const done = () => toast.success(`${label}已复制`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(done)
      .catch(() => {
        /* fallback */
        legacyCopy(text) && done();
      });
  } else {
    legacyCopy(text) && done();
  }
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_SCOPES.map((s) => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary/40',
            )}
          >
            {on && <Check className="mr-1 inline h-3 w-3" />}
            {SCOPE_META[s].label}
          </button>
        );
      })}
    </div>
  );
}

function ClientCard({ c, onChanged }: { c: ClientEntry; onChanged: () => void }) {
  const [showToken, setShowToken] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border bg-secondary/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{c.name}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.lastUsedAt ? `最近使用 ${new Date(c.lastUsedAt).toLocaleString()}` : '尚未使用'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              rotateToken(c.id);
              onChanged();
              toast.success('令牌已轮换，旧令牌立即失效');
            }}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary"
            title="重新生成令牌"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              revokeClient(c.id);
              onChanged();
              toast.success('已吊销该应用');
            }}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="吊销授权"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">授权范围</div>
        <ScopePicker
          value={c.scopes}
          onChange={(scopes) => {
            updateScopes(c.id, scopes);
            onChanged();
          }}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2">
        <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {showToken ? c.token : '••••••••••••••••••••••••'}
        </code>
        <button
          onClick={() => setShowToken((v) => !v)}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          title={showToken ? '隐藏令牌' : '显示令牌'}
        >
          {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => copyText(c.token, '令牌')}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          title="复制令牌"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ExtApiPanel() {
  const [enabled, setEnabled] = useState(isExtApiEnabled());
  const [clients, setClients] = useState<ClientEntry[]>(loadClients());
  const [origins, setOrigins] = useState<string[]>(loadOrigins());
  const [originInput, setOriginInput] = useState('');
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<Scope[]>(['read']);
  const [audit, setAudit] = useState<AuditEntry[]>(() => listAudit());
  const [auditPage, setAuditPage] = useState(1);
  const [showAudit, setShowAudit] = useState(false);

  const refreshClients = () => setClients(loadClients());
  const refreshAudit = () => setAudit(listAudit());

  const auditSlice = useMemo(
    () => audit.slice(0, auditPage * AUDIT_PAGE),
    [audit, auditPage],
  );
  const hasMore = audit.length > auditSlice.length;

  const toggleEnabled = (on: boolean) => {
    setEnabled(on);
    setExtApiEnabled(on);
    toast.success(on ? '扩展接口已启用' : '扩展接口已关闭', {
      description: on ? '外部应用需持有令牌且通过来源白名单校验才能调用' : '所有外部调用将返回 E_DISABLED',
    });
  };

  const addClient = () => {
    if (newScopes.length === 0) return toast.error('请至少勾选一个授权范围');
    createClient(newName || '未命名应用', newScopes);
    setNewName('');
    refreshClients();
    toast.success('应用已创建，请复制令牌交给外部应用');
  };

  const addOrigin = () => {
    const v = originInput.trim();
    if (!v) return;
    if (!isValidOrigin(v)) return toast.error('格式须为 http(s)://域名[:端口]，不支持通配符');
    if (origins.includes(v)) return toast.error('该来源已存在');
    const next = [...origins, v];
    setOrigins(next);
    saveOrigins(next);
    setOriginInput('');
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Aperture className="h-4 w-4 text-primary" /> 扩展接口
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            允许外部应用（同页脚本、嵌入页面）通过令牌安全地读取数据或提交修改，所有操作均有审计记录。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => toggleEnabled(!enabled)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            enabled ? 'bg-primary' : 'bg-secondary',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all',
              enabled ? 'left-[22px]' : 'left-0.5',
            )}
          />
        </button>
      </div>

      {!enabled && <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">接口当前已关闭。开启后可创建授权应用。</p>}

      {enabled && (
        <>
          {/* 新建应用 */}
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="应用名称（如：阅读伴侣）"
                maxLength={24}
                className="min-w-0 flex-1 rounded-lg border bg-background/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={addClient}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> 创建
              </button>
            </div>
            <ScopePicker value={newScopes} onChange={setNewScopes} />
          </div>

          {/* 客户端列表 */}
          {clients.length > 0 && (
            <div className="space-y-2">
              {clients.map((c) => (
                <ClientCard key={c.id} c={c} onChanged={refreshClients} />
              ))}
            </div>
          )}

          {/* origin 白名单 */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              跨域来源白名单（本域 <code className="font-mono">{window.location.origin}</code> 恒允许；iframe 嵌入场景需添加对方页面来源）
            </div>
            <div className="flex gap-2">
              <input
                value={originInput}
                onChange={(e) => setOriginInput(e.target.value)}
                placeholder="https://example.com"
                className="min-w-0 flex-1 rounded-lg border bg-background/60 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={addOrigin}
                className="shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-secondary"
              >
                添加
              </button>
            </div>
            {origins.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {origins.map((o) => (
                  <span key={o} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px]">
                    {o}
                    <button
                      onClick={() => {
                        const next = origins.filter((x) => x !== o);
                        setOrigins(next);
                        saveOrigins(next);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`移除 ${o}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 审计日志 */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setShowAudit((v) => !v);
                  if (!showAudit) refreshAudit();
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ScrollText className="h-3.5 w-3.5" />
                审计日志（{audit.length} 条）
              </button>
              {audit.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadText(exportAudit(), `cetyi-ext-audit-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')}
                    className="rounded-lg border px-2.5 py-1 text-[11px] transition-colors hover:bg-secondary"
                  >
                    导出
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('确定清空全部审计日志？')) {
                        clearAudit();
                        refreshAudit();
                      }
                    }}
                    className="rounded-lg border px-2.5 py-1 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
                  >
                    清空
                  </button>
                </div>
              )}
            </div>

            {showAudit && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-background/60 p-2">
                {auditSlice.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">暂无记录</p>}
                {auditSlice.map((a, i) => (
                  <div key={`${a.ts}-${i}`} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px] hover:bg-secondary/50">
                    <span className="truncate font-mono">
                      {new Date(a.ts).toLocaleString()} · {a.op} · {a.target}
                    </span>
                    <span className={cn('shrink-0 font-mono', a.code === 'OK' ? 'text-emerald-500' : 'text-destructive')}>{a.code}</span>
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setAuditPage((p) => p + 1)}
                    className="w-full py-1 text-center text-[11px] text-primary"
                  >
                    显示更多
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            安全说明：令牌存储于本机浏览器；写操作全部经过应用业务规则校验并记入审计；接口规范见{' '}
            <span className="font-mono">docs/EXT_API.md</span>。
          </p>
        </>
      )}
    </section>
  );
}
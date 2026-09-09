import { useRef, useState } from 'react';
import { Bell, Download, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { SRS_CONFIG } from '@/lib/config';
import { ensureNotifyPermission } from '@/lib/notify';
import { store, useAppState } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const state = useAppState();
  const s = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">设置</h1>

      {msg && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs text-background shadow-lg">
          {msg}
        </div>
      )}

      {/* 学习计划 */}
      <section className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">学习计划</h2>
        <div>
          <div className="flex items-center justify-between text-sm">
            <span>每日新词量</span>
            <span className="font-medium text-primary">{s.dailyNew} 词/天</span>
          </div>
          <input
            type="range"
            min={SRS_CONFIG.daily_new_min}
            max={SRS_CONFIG.daily_new_max}
            step={5}
            value={s.dailyNew}
            onChange={(e) => store.setSettings({ dailyNew: Number(e.target.value) })}
            className="mt-3 w-full accent-[#3d8f6a]"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{SRS_CONFIG.daily_new_min}</span>
            <span>到期复习超过 {s.dailyNew * SRS_CONFIG.avalanche_ratio} 词时自动暂停新词</span>
            <span>{SRS_CONFIG.daily_new_max}</span>
          </div>
        </div>
      </section>

      {/* 发音偏好 */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">发音偏好</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['en-GB', 'en-US'] as const).map((v) => (
            <button
              key={v}
              onClick={() => store.setSettings({ voice: v })}
              className={cn(
                'rounded-xl border py-2.5 text-sm transition-colors',
                s.voice === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              {v === 'en-GB' ? '英音 (British)' : '美音 (American)'}
            </button>
          ))}
        </div>
      </section>

      {/* 外观 */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">外观</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['light', '浅色', Sun],
            ['dark', '深色', Moon],
            ['auto', '跟随系统', Sun],
          ] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => store.setSettings({ dark: v })}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm transition-colors',
                s.dark === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* 提醒 */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">每日复习提醒</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">浏览器通知，页面打开期间生效</p>
          </div>
          <button
            onClick={async () => {
              if (!s.notify) {
                const ok = await ensureNotifyPermission();
                if (!ok) return flash('通知权限被拒绝，请在浏览器设置中开启');
              }
              store.setSettings({ notify: !s.notify });
            }}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors',
              s.notify ? 'bg-primary' : 'bg-secondary',
            )}
            aria-label="切换通知"
          >
            <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', s.notify ? 'left-[22px]' : 'left-0.5')} />
          </button>
        </div>
        {s.notify && (
          <div className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">提醒时间</span>
            <select
              value={s.notifyHour}
              onChange={(e) => store.setSettings({ notifyHour: Number(e.target.value) })}
              className="rounded-lg border bg-background px-2 py-1 text-sm"
            >
              {[7, 8, 12, 18, 19, 20, 21, 22].map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
        )}
      </section>

      {/* 数据管理 */}
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-medium">数据管理</h2>
        <p className="text-xs text-muted-foreground">数据保存在本机浏览器（含 user_id，支持后续云同步扩展）。</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const blob = new Blob([store.exportJson()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `cetyi-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              flash('已导出备份文件');
            }}
            className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm"
          >
            <Download className="h-4 w-4" /> 导出备份
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm"
          >
            <Upload className="h-4 w-4" /> 导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const ok = store.importJson(await file.text());
              flash(ok ? '导入成功' : '文件格式不正确');
              e.target.value = '';
            }}
          />
          <button
            onClick={() => {
              if (window.confirm('确定清空所有学习数据？此操作不可恢复。')) {
                store.reset();
                flash('已重置，重新开始吧');
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-destructive/40 px-4 py-2 text-sm text-destructive"
          >
            <Trash2 className="h-4 w-4" /> 重置数据
          </button>
        </div>
      </section>
    </div>
  );
}

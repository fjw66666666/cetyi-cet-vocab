// 共享 UI 小组件
import type { ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { speak } from '@/lib/speech';
import { store } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { Grade } from '@/lib/types';

/** 进度环（SVG） */
export function ProgressRing({ value, size = 120, stroke = 10, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="stroke-primary transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** 发音按钮 */
export function SpeakerButton({ text, size = 'md', className }: { text: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <button
      type="button"
      aria-label="播放发音"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, store.get().settings.voice);
      }}
      className={cn('inline-flex items-center justify-center rounded-full p-2 text-primary transition-colors hover:bg-secondary', className)}
    >
      <Volume2 className={s} />
    </button>
  );
}

/** 三档自评按钮（固定于移动端拇指热区） */
export function GradeButtons({ onGrade, disabled }: { onGrade: (g: Grade) => void; disabled?: boolean }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-3 p-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onGrade(0)}
          className="rounded-xl border border-destructive/40 bg-destructive/10 py-3.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 active:scale-[0.98] disabled:opacity-40"
        >
          忘记
          <span className="mt-0.5 block text-[11px] opacity-70">10 分钟后重学</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onGrade(1)}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 py-3.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/20 active:scale-[0.98] disabled:opacity-40 dark:text-amber-400"
        >
          模糊
          <span className="mt-0.5 block text-[11px] opacity-70">间隔降一档</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onGrade(2)}
          className="rounded-xl border border-primary/40 bg-primary/10 py-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 active:scale-[0.98] disabled:opacity-40"
        >
          认识
          <span className="mt-0.5 block text-[11px] opacity-70">间隔升级</span>
        </button>
      </div>
    </div>
  );
}

/** 小型统计卡 */
export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

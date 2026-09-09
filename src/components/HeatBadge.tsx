// 热度徽章：由 fs 映射的 S/A/B/C/D 档位展示
import { cn } from '@/lib/utils';
import { heatGrade } from '@/lib/priority';
import type { HeatGrade } from '@/lib/types';

const META: Record<HeatGrade, { label: string; className: string; showLabel: boolean }> = {
  S: {
    label: '真题高频',
    className: 'bg-aurora-grad text-white glow-ring border-transparent',
    showLabel: true,
  },
  A: {
    label: '核心必考',
    className: 'border-primary/50 bg-primary/15 text-primary',
    showLabel: true,
  },
  B: { label: '常考', className: 'border-secondary bg-secondary/70 text-secondary-foreground', showLabel: false },
  C: { label: '一般', className: 'border-secondary bg-secondary/50 text-muted-foreground', showLabel: false },
  D: { label: '低频', className: 'border-transparent bg-transparent text-muted-foreground/70', showLabel: false },
};

export function HeatBadge({
  fs,
  tier,
  size = 'md',
  withLabel,
  className,
}: {
  fs?: number;
  tier?: number;
  size?: 'sm' | 'md';
  withLabel?: boolean;
  className?: string;
}) {
  const g = heatGrade(fs, tier);
  const meta = META[g];
  const showLabel = withLabel ?? meta.showLabel;
  return (
    <span
      title={`热频分 ${fs ?? '—'} · ${meta.label}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-display font-semibold tracking-wide',
        size === 'sm' ? 'px-1.5 py-0 text-[10px] leading-4' : 'px-2 py-0.5 text-[11px]',
        meta.className,
        className,
      )}
    >
      <span className="font-mono">{g}</span>
      {showLabel && size === 'md' && <span className="font-sans font-medium">{meta.label}{g === 'S' && ' 🔥'}</span>}
    </span>
  );
}

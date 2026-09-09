// 玻璃拟态容器：半透明 + 背景模糊 + 1px 渐变描边（移动端自动降模糊）
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function GlassCard({ className, hover = false, ...props }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn('glass-card rounded-3xl border border-transparent', hover && 'hover-lift', className)}
      {...props}
    />
  );
}

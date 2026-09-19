// 词战长空 · 主题取色（DOM 适配层，唯一碰 getComputedStyle 的模块）
// Canvas 不解析 CSS 变量，必须在绘制前读取真实色值并缓存；仅在 <html>.dark 变化时刷新。
import type { ThemeColors } from './types';

let cache: ThemeColors | null = null;
let observer: MutationObserver | null = null;
const listeners = new Set<(c: ThemeColors) => void>();

/** 读取一次当前主题的真实色值（一次 getComputedStyle） */
export function readThemeColors(el?: HTMLElement): ThemeColors {
  const root = el ?? document.documentElement;
  const cs = getComputedStyle(root);
  // ⚠️ 关键：getPropertyValue 返回的是 "200 98% 32%" 这样的裸分量，必须自己包 hsl()
  const v = (name: string, fallback: string): string => {
    const raw = cs.getPropertyValue(name).trim();
    return raw ? `hsl(${raw})` : fallback;
  };
  return {
    background: v('--background', 'hsl(225 44% 7%)'),
    card: v('--card', 'hsl(223 34% 10%)'),
    primary: v('--primary', 'hsl(198.6 93.2% 59.8%)'),
    destructive: v('--destructive', 'hsl(6 55% 55%)'),
    foreground: v('--foreground', 'hsl(213 30% 95%)'),
    muted: v('--muted-foreground', 'hsl(215 18% 70%)'),
    border: v('--border', 'hsl(220 26% 18%)'),
    gradA: v('--grad-a', 'hsl(198.6 93.2% 59.8%)'),
    gradB: v('--grad-b', 'hsl(258.3 89.7% 66.3%)'),
    gradC: v('--grad-c', 'hsl(172.5 66.1% 50.4%)'),
  };
}

/** 取缓存（首次自动读取）；供 rAF 内高频调用，避免重复 getComputedStyle */
export function getCachedColors(): ThemeColors {
  if (!cache) cache = readThemeColors();
  return cache;
}

/** 惰性创建单例 observer（引用计数在 subscribeTheme 内控制） */
function ensureObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    cache = readThemeColors();
    const c = cache;
    listeners.forEach((fn) => fn(c));
  });
  // 只监听 class 属性，避免无关 DOM 变更触发
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * 订阅 <html> class 变化（.dark 增删），返回 unsubscribe。
 * 单例 observer 采用引用计数：首个订阅创建，全部取消则 disconnect。
 */
export function subscribeTheme(listener: (c: ThemeColors) => void): () => void {
  listeners.add(listener);
  ensureObserver();
  // 立即回推一次当前色值，避免初始不一致
  listener(getCachedColors());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

/** 组件卸载时释放单例 observer */
export function disposeTheme(): void {
  observer?.disconnect();
  observer = null;
  listeners.clear();
  cache = null;
}

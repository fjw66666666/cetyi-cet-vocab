// 深色模式：跟随设置 / 跟随系统
import { useEffect } from 'react';
import { useAppState } from '@/lib/store';

export function useTheme() {
  const dark = useAppState().settings.dark;
  useEffect(() => {
    const apply = () => {
      const isDark =
        dark === 'dark' ||
        (dark === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    if (dark === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [dark]);
}

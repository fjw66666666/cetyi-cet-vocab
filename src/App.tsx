import { Suspense, lazy, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router';
import { BarChart3, BookOpenText, Home, Settings as SettingsIcon, Trophy } from 'lucide-react';
import { WordsProvider } from '@/hooks/useWords';
import { useTheme } from '@/hooks/useTheme';
import { startNotifyLoop } from '@/lib/notify';
import HomePage from '@/pages/Home';
import { cn } from '@/lib/utils';

const LearnPage = lazy(() => import('@/pages/Learn'));
const ReviewPage = lazy(() => import('@/pages/Review'));
const ListenPage = lazy(() => import('@/pages/Listen'));
const StatsPage = lazy(() => import('@/pages/Stats'));
const AchievementsPage = lazy(() => import('@/pages/Achievements'));
const LibraryPage = lazy(() => import('@/pages/Library'));
const SettingsPage = lazy(() => import('@/pages/Settings'));

const NAV = [
  { to: '/', label: '今日', icon: Home },
  { to: '/library', label: '词库', icon: BookOpenText },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/achievements', label: '成就', icon: Trophy },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

function Shell() {
  useTheme();
  const location = useLocation();
  const immersive = ['/learn', '/review', '/listen'].some((p) => location.pathname.startsWith(p));

  useEffect(() => startNotifyLoop(), []);

  return (
    <div className="min-h-screen">
      {/* 桌面顶栏 */}
      {!immersive && (
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <NavLink to="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">词</span>
              <span className="font-semibold tracking-tight">词忆 CET</span>
            </NavLink>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'bg-secondary font-medium text-foreground',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
      )}

      <main className={immersive ? '' : 'mx-auto max-w-4xl px-4 pb-24 pt-6 md:pb-12'}>
        <Suspense fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        }>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/listen" element={<ListenPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </Suspense>
      </main>

      {/* 移动端底部标签栏 */}
      {!immersive && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur md:hidden">
          <div className="grid grid-cols-5">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
                    isActive && 'text-primary',
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <WordsProvider>
      <Shell />
    </WordsProvider>
  );
}

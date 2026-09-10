// 下载进度指示器：显示下载状态、进度条、速度、存储位置提示
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { detectPlatform, formatBytes, getStorageHint, type DownloadProgress, type DownloadStatus } from '@/lib/download';

export function DownloadProgressBar({
  status,
  progress,
  filename,
  onClose,
}: {
  status: DownloadStatus;
  progress: DownloadProgress | null;
  filename: string;
  onClose?: () => void;
}) {
  const [hint, setHint] = useState('');
  const platform = detectPlatform();

  useEffect(() => {
    if (status === 'done') setHint(getStorageHint());
  }, [status]);

  if (status === 'idle') return null;

  const percent = progress?.percent ?? 0;
  const showSpeed = status === 'fetching' && progress && progress.speed > 0;

  return (
    <div className="fixed inset-x-0 top-4 z-50 mx-auto w-[min(92vw,480px)]">
      <div className="rounded-2xl border bg-popover/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {status === 'fetching' || status === 'saving' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : status === 'error' ? (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              ) : null}
              <span className="truncate text-sm font-medium">{filename}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {status === 'fetching' && '正在下载…'}
              {status === 'saving' && '正在保存…'}
              {status === 'done' && '下载完成'}
              {status === 'error' && '下载失败'}
            </div>
          </div>
          {onClose && (status === 'done' || status === 'error') && (
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="关闭"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {(status === 'fetching' || status === 'saving') && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-all duration-300',
                  status === 'saving' && 'animate-pulse',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>
                {progress && progress.total > 0
                  ? `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
                  : progress
                    ? formatBytes(progress.loaded)
                    : '0 B'}
              </span>
              {showSpeed && <span>{formatBytes(progress!.speed)}/s</span>}
              <span>{percent}%</span>
            </div>
          </div>
        )}

        {status === 'done' && hint && (
          <div className="mt-3 rounded-lg bg-secondary/60 p-2.5 text-xs text-muted-foreground">
            {platform === 'ios' && '📱 '}
            {platform === 'android' && '🤖 '}
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

// 下载状态管理 Hook：统一管理下载进度、错误、完成回调
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  downloadRemote,
  downloadText,
  ensureStorageAvailable,
  getStorageHint,
  handleDownloadError,
  type DownloadProgress,
  type DownloadStatus,
} from '@/lib/download';

export interface UseDownloadOptions {
  /** 下载完成后的回调 */
  onComplete?: (filename: string) => void;
  /** 预估文件大小（字节），用于存储配额检查 */
  estimatedSize?: number;
}

export function useDownload(options: UseDownloadOptions = {}) {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [filename, setFilename] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(null);
    setFilename('');
  }, []);

  /** 下载远程文件（带进度） */
  const downloadFile = useCallback(
    async (url: string, name: string) => {
      setFilename(name);
      setStatus('fetching');
      setProgress({ loaded: 0, total: 0, percent: 0, speed: 0 });
      abortRef.current = new AbortController();

      try {
        if (options.estimatedSize) {
          await ensureStorageAvailable(options.estimatedSize);
        }
        await downloadRemote(url, name, (p) => setProgress(p));
        setStatus('done');
        toast.success('下载完成', { description: getStorageHint() });
        options.onComplete?.(name);
      } catch (err) {
        setStatus('error');
        handleDownloadError(err);
      }
    },
    [options],
  );

  /** 下载文本内容（小文件，无进度） */
  const saveText = useCallback(
    (content: string, name: string, mime?: string) => {
      setFilename(name);
      setStatus('saving');
      try {
        downloadText(content, name, mime);
        setStatus('done');
        toast.success('下载完成', { description: getStorageHint() });
        options.onComplete?.(name);
      } catch (err) {
        setStatus('error');
        handleDownloadError(err);
      }
    },
    [options],
  );

  return { status, progress, filename, downloadFile, saveText, reset };
}

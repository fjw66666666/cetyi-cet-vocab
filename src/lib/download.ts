// 跨平台文件下载工具：适配 iOS Safari / Android Chrome / 桌面浏览器
// - 小文件（Blob）：直接生成对象 URL 触发下载
// - 远程文件：fetch + ReadableStream 上报进度
// - iOS Safari：<a download> 行为受限，优先用 Web Share API 分享文件
// - 存储配额：navigator.storage.estimate() 检测剩余空间

import { toast } from 'sonner';

export type DownloadPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

export interface DownloadProgress {
  loaded: number;
  total: number;
  percent: number;
  speed: number; // bytes/s
}

export type DownloadStatus = 'idle' | 'fetching' | 'saving' | 'done' | 'error';

export interface DownloadError {
  type: 'network' | 'quota' | 'unsupported' | 'unknown';
  message: string;
}

/** 检测运行平台 */
export function detectPlatform(): DownloadPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** 检测是否支持通过 Web Share API 分享文件（iOS 优先用分享替代直接下载） */
export function canShareFiles(file?: File): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    if (file) return navigator.canShare({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** 检测剩余存储空间（字节），不可用时返回 null */
export async function getStorageQuota(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 格式化字节大小 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 触发浏览器下载一个 Blob，处理 iOS/Android 差异 */
export function triggerDownload(blob: Blob, filename: string): void {
  const platform = detectPlatform();
  const url = URL.createObjectURL(blob);

  // iOS Safari：优先用 Web Share API 分享文件，用户可选择「存储到文件」
  if (platform === 'ios') {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (canShareFiles(file)) {
      navigator
        .share({ files: [file], title: filename })
        .then(() => URL.revokeObjectURL(url))
        .catch(() => fallbackAnchorDownload(url, filename, platform));
      return;
    }
  }

  fallbackAnchorDownload(url, filename, platform);
}

function fallbackAnchorDownload(url: string, filename: string, platform: DownloadPlatform) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // iOS Safari 对 <a download> 支持有限，加 target=_blank 让其在新标签打开供长按保存
  if (platform === 'ios') a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放对象 URL，确保下载已触发
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 下载文本内容（JSON/CSV/Markdown 等小文件） */
export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  triggerDownload(blob, filename);
}

/** 下载远程文件并上报进度；适合较大资源 */
export async function downloadRemote(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw { type: 'network', message: '网络连接失败，请检查网络后重试' } satisfies DownloadError;
  }

  if (!response.ok) {
    throw { type: 'network', message: `下载失败（HTTP ${response.status}）` } satisfies DownloadError;
  }

  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: blob.size, percent: 100, speed: 0 });
    triggerDownload(blob, filename);
    return;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const startTime = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = elapsed > 0 ? loaded / elapsed : 0;
    onProgress?.({ loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0, speed });
  }

  const blob = new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') || 'application/octet-stream' });
  triggerDownload(blob, filename);
}

/** 下载前检查存储空间是否足够（预估大小） */
export async function ensureStorageAvailable(estimatedBytes: number): Promise<boolean> {
  const quota = await getStorageQuota();
  if (!quota || !quota.quota) return true;
  const remaining = quota.quota - quota.usage;
  if (remaining < estimatedBytes) {
    throw {
      type: 'quota',
      message: `存储空间不足，需要约 ${formatBytes(estimatedBytes)}，剩余 ${formatBytes(Math.max(0, remaining))}`,
    } satisfies DownloadError;
  }
  return true;
}

/** 统一错误处理 toast */
export function handleDownloadError(err: unknown): void {
  const e = err as DownloadError;
  const msg = e?.message || '下载失败，请重试';
  toast.error(msg);
}

/** 根据平台给出文件保存位置提示 */
export function getStorageHint(): string {
  const platform = detectPlatform();
  switch (platform) {
    case 'ios':
      return canShareFiles() ? '已唤起分享面板，选择「存储到文件」即可保存到 iCloud 或本机' : '请长按文件选择「存储到文件」';
    case 'android':
      return '文件已保存到「下载」文件夹，可在文件管理器中查看';
    default:
      return '文件已保存到浏览器默认下载目录';
  }
}

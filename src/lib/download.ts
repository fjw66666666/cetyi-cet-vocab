// 跨平台文件下载工具：深度适配 iOS Safari / Android Chrome / 微信X5 / UC / QQ / 百度 / 华为等移动端浏览器
// 策略链：
//   1. 微信内置浏览器 → 拦截，提示「在浏览器中打开」（微信禁止下载多数文件类型）
//   2. iOS Safari 15+ → navigator.share 文件分享 → 存储到文件
//   3. iOS < 15 / 分享失败 → Blob 转 data URL 用 location.href（文本类可预览+长按保存）
//   4. Android Chrome → <a download> + application/octet-stream 强制下载
//   5. 国产浏览器 → 多重降级：anchor → window.location.href → window.open
//
// 注意：navigator.share 必须在用户手势同步回调内调用，异步 fetch 后会丢失手势上下文。

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
  type: 'network' | 'quota' | 'unsupported' | 'wechat' | 'unknown';
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

/** 是否移动端 */
export function isMobile(): boolean {
  const p = detectPlatform();
  return p === 'ios' || p === 'android';
}

/** 是否微信内置浏览器（X5/TBS 内核） */
export function isWeChat(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MicroMessenger/i.test(navigator.userAgent || '');
}

/** 是否 QQ 浏览器 */
export function isQQBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MQQBrowser|QQ\//i.test(navigator.userAgent || '');
}

/** 是否 UC 浏览器 */
export function isUCBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /UCBrowser|UBrowser/i.test(navigator.userAgent || '');
}

/** 是否百度浏览器 */
export function isBaiduBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Baidu|BDBrowser/i.test(navigator.userAgent || '');
}

/** 是否华为浏览器 */
export function isHuaweiBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /HuaweiBrowser|HMSCore/i.test(navigator.userAgent || '');
}

/** 是否国产主流浏览器（UC/QQ/百度/华为等，这些浏览器对 blob 下载支持不一） */
export function isChineseBrowser(): boolean {
  return isQQBrowser() || isUCBrowser() || isBaiduBrowser() || isHuaweiBrowser();
}

/** 检测是否支持通过 Web Share API 分享文件（iOS 15+） */
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

/** Blob 转 data URL（iOS 旧版降级用） */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 触发浏览器下载一个 Blob，按平台与浏览器能力逐级降级
 * 必须在用户手势（click）的同步回调中调用，否则 iOS share 会失败
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const platform = detectPlatform();

  // 微信：禁止下载多数文件类型，交给调用方显示引导
  if (isWeChat()) {
    throw { type: 'wechat', message: '请在浏览器中打开后下载' } satisfies DownloadError;
  }

  // iOS Safari
  if (platform === 'ios') {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    // 1) iOS 15+ 支持分享文件
    if (canShareFiles(file)) {
      navigator
        .share({ files: [file], title: filename })
        .catch(() => iosDataURLFallback(blob, filename));
      return;
    }
    // 2) 降级到 data URL 预览（长按可保存）
    iosDataURLFallback(blob, filename);
    return;
  }

  // Android / 桌面：标准 anchor 下载，octet-stream 防止预览
  const blobForDownload = blob.type === 'application/octet-stream'
    ? blob
    : new Blob([blob], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blobForDownload);
  anchorDownload(url, filename, platform);
}

/** iOS data URL 降级：转 base64 后 location.href 打开，系统弹出预览/分享 */
async function iosDataURLFallback(blob: Blob, filename: string) {
  try {
    const dataUrl = await blobToDataURL(blob);
    // data URL 在 iOS Safari 会打开预览，用户可长按或分享保存
    window.location.href = dataUrl;
  } catch {
    // 最后兜底：创建 anchor
    const url = URL.createObjectURL(blob);
    anchorDownload(url, filename, 'ios');
  }
}

/** anchor 下载，带多重降级 */
function anchorDownload(url: string, filename: string, platform: DownloadPlatform) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    if (platform === 'ios') a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // anchor 失败时降级为 location.href / window.open
    try {
      window.location.href = url;
    } catch {
      window.open(url, '_blank');
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 下载文本内容（JSON/TXT/MD）—— 同步生成，可安全调用 navigator.share */
export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  triggerDownload(blob, filename);
}

/** 下载远程文件并上报进度（异步 fetch 后调用，iOS share 会丢失手势，降级 anchor） */
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
  if (e?.type === 'wechat') {
    toast.warning('请使用浏览器打开', { description: '点击右上角「···」选择「在浏览器中打开」后再下载' });
  } else {
    toast.error(msg);
  }
}

/** 根据平台给出文件保存位置提示 */
export function getStorageHint(): string {
  if (isWeChat()) return '请点击右上角「···」选择「在浏览器中打开」后下载';
  const platform = detectPlatform();
  switch (platform) {
    case 'ios':
      return canShareFiles() ? '已唤起分享面板，选择「存储到文件」即可保存到 iCloud 或本机' : '文件已打开预览，长按或点分享图标可保存';
    case 'android':
      return isChineseBrowser()
        ? '文件已通过浏览器下载管理器保存，可在通知栏或文件管理器查看'
        : '文件已保存到「下载」文件夹，可在文件管理器中查看';
    default:
      return '文件已保存到浏览器默认下载目录';
  }
}

/** 微信浏览器下显示引导浮层（由调用方决定是否展示） */
export function shouldShowWeChatGuide(): boolean {
  return isWeChat();
}

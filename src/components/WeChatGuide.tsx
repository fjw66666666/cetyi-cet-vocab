// 微信浏览器引导浮层：提示用户点击右上角「···」在浏览器中打开
// 微信内置浏览器禁止下载多数文件类型，必须引导到外部浏览器
import { X } from 'lucide-react';

export function WeChatGuide({ onClose }: { onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm">
      <div className="absolute right-4 top-4 text-right">
        {/* 指向右上角菜单的箭头 */}
        <svg
          className="ml-auto h-16 w-16 text-white animate-bounce"
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M40 8 L40 24" />
          <path d="M28 16 L40 24 L52 16" />
        </svg>
        <p className="mt-2 text-sm font-medium text-white">
          点击右上角
          <span className="mx-1 inline-flex items-center justify-center rounded bg-white/20 px-2 py-0.5 font-mono text-xs">···</span>
        </p>
        <p className="mt-1 text-sm text-white/80">选择「在浏览器中打开」</p>
      </div>

      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-popover p-6 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold">微信内无法下载文件</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              微信内置浏览器出于安全策略，禁止直接下载 JSON/TXT/MD 等文件。
              请按上方指引在系统浏览器中打开本页面，即可正常下载。
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
            <span className="text-sm">点击页面右上角的「···」菜单按钮</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
            <span className="text-sm">在弹出菜单中选择「在浏览器中打开」</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
            <span className="text-sm">在系统浏览器中重新点击下载按钮即可</span>
          </div>
        </div>
      </div>
    </div>
  );
}

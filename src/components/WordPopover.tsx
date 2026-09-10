// 点词查询弹层：桌面 Popover，移动端降级底部 Sheet
import type { RefObject } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { HeatBadge } from '@/components/HeatBadge';
import { SpeakerButton } from '@/components/ui-bits';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { store } from '@/lib/store';
import type { WordEntry } from '@/lib/types';

interface AnchorLike {
  getBoundingClientRect(): DOMRect;
}

export function WordPopover({
  word,
  open,
  onOpenChange,
  onMark,
  anchorRef,
}: {
  word: WordEntry | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMark?: () => void;
  anchorRef?: RefObject<AnchorLike | null>;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!word) return null;

  const handleMark = () => {
    store.markFromReading(word.id);
    onMark?.();
    toast.success(`已把「${word.word}」加入生词本`);
  };

  const details = (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-word text-lg font-semibold">{word.word}</span>
        <HeatBadge fs={word.fs} tier={word.tier} size="sm" />
        <SpeakerButton text={word.word} size="sm" />
      </div>
      {word.uk || word.us ? (
        <p className="text-xs text-muted-foreground">
          {word.uk ? `英 /${word.uk}/` : ''}
          {word.uk && word.us ? '  ' : ''}
          {word.us ? `美 /${word.us}/` : ''}
        </p>
      ) : null}
      {word.pos ? <p className="text-xs text-muted-foreground">{word.pos}</p> : null}
      <ul className="space-y-1 text-sm">
        {word.meanings.map((m, i) => (
          <li key={i} className="font-medium">
            {i + 1}. {m}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleMark}
          className="rounded-xl border border-primary/40 bg-primary/10 py-2 text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          标记生词
        </button>
        <button
          type="button"
          onClick={() => navigate(`/library?q=${encodeURIComponent(word.word)}`)}
          className="flex-1 rounded-xl border bg-secondary/60 py-2 text-sm text-foreground transition-opacity hover:opacity-80"
        >
          词库查看
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="px-5 pb-6">
          <SheetHeader>
            <SheetTitle>查词</SheetTitle>
          </SheetHeader>
          {details}
        </SheetContent>
      </Sheet>
    );
  }

  const el = anchorRef?.current ?? null;
  const virtualRef: RefObject<AnchorLike> | undefined = el ? { current: el } : undefined;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent align="center" side="bottom" className="w-80">
        {details}
      </PopoverContent>
    </Popover>
  );
}
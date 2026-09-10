// 文章段落分词渲染：S/A 重点词霓虹高亮，点词唤起查词弹层（仿 HighlightSentence）
import { heatGrade, isHot } from '@/lib/priority';
import type { WordEntry } from '@/lib/types';

export function ArticleText({
  text,
  words,
  onWordClick,
  className,
}: {
  text: string;
  words: Map<string, WordEntry>;
  onWordClick?: (word: string, el?: HTMLElement) => void;
  className?: string;
}) {
  const parts = text.split(/([A-Za-z']+)/);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        const isWord = /^[A-Za-z']+$/.test(part);
        if (!isWord) return <span key={i}>{part}</span>;
        const entry = words.get(part.toLowerCase());
        const hot = entry && isHot(heatGrade(entry.fs, entry.tier));
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => onWordClick?.(part.toLowerCase(), e.currentTarget)}
            className={
              hot
                ? 'neon-text font-semibold underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-75'
                : 'transition-opacity hover:opacity-70'
            }
            title={hot ? `${part} · 重点词，点击查看` : part}
          >
            {part}
          </button>
        );
      })}
    </p>
  );
}
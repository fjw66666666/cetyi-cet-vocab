// 例句热词高亮：fs≥78（S/A 档）的词渐变高亮，点击跳转词库定位
import { useNavigate } from 'react-router';
import { heatGrade, isHot } from '@/lib/priority';
import type { WordEntry } from '@/lib/types';

export function HighlightSentence({
  en,
  zh,
  words,
  currentId,
  className,
}: {
  en: string;
  zh?: string;
  words: Map<string, WordEntry>;
  currentId?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const parts = en.split(/([A-Za-z']+)/);

  return (
    <div className={className}>
      <p className="leading-relaxed">
        {parts.map((part, i) => {
          const isWord = /^[A-Za-z']+$/.test(part);
          if (!isWord) return <span key={i}>{part}</span>;
          const entry = words.get(part.toLowerCase());
          const hot = entry && isHot(heatGrade(entry.fs, entry.tier)) && entry.id !== currentId;
          if (!hot) return <span key={i}>{part}</span>;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/library?q=${encodeURIComponent(part.toLowerCase())}`);
              }}
              className="neon-text font-semibold underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-75"
              title={`${part} · 真题高频，点击查看`}
            >
              {part}
            </button>
          );
        })}
      </p>
      {zh && <p className="mt-0.5 text-sm text-muted-foreground">{zh}</p>}
    </div>
  );
}

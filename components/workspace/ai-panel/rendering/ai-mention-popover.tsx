'use client';

// @author refinex
// @mention 补全下拉框：fixed 定位到光标附近，列表项展示图标 + label + path。
// 键盘上下选择 + Enter 选中，鼠标 hover/click 选中。复刻 1code agents-file-mention。

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { MentionOption } from './ai-mention-serializer';

export interface AiMentionPopoverProps {
  options: MentionOption[];
  onSelect: (option: MentionOption) => void;
  onClose: () => void;
  /** 锚点矩形（光标位置），用于定位。 */
  anchorRect?: DOMRect | null;
}

const KIND_ICON: Record<string, string> = {
  file: '📄',
  folder: '📁',
  skill: '⚡',
  agent: '🤖',
  tool: '🔧',
};

export function AiMentionPopover({
  options,
  onSelect,
  onClose,
  anchorRect,
}: AiMentionPopoverProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 选项变化时重置选中
  useEffect(() => {
    setSelectedIndex(0);
  }, [options]);

  // 滚动选中项到可视区
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[selectedIndex];
      if (opt) onSelect(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (options.length === 0) return null;

  const style: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        left: Math.min(anchorRect.left, window.innerWidth - 320),
        top: anchorRect.bottom + 4,
        zIndex: 9999,
      }
    : { position: 'fixed', left: 16, bottom: 80, zIndex: 9999 };

  return (
    <div
      style={style}
      className="ai-mention-popover w-80 max-h-64 overflow-hidden rounded-md border bg-popover shadow-lg"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {options.map((opt, idx) => (
          <div
            key={opt.id}
            role="option"
            aria-selected={idx === selectedIndex}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => onSelect(opt)}
            className={
              'flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs ' +
              (idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50')
            }
          >
            <span className="flex-shrink-0 text-sm">{KIND_ICON[opt.type] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{opt.label}</div>
              {opt.path && opt.path !== opt.label && (
                <div className="truncate text-muted-foreground/60">{opt.path}</div>
              )}
            </div>
            <span className="flex-shrink-0 text-[10px] uppercase text-muted-foreground/40">
              {opt.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

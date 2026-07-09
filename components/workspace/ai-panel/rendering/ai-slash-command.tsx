'use client';

// @author refinex
// Slash 命令：/ 开头触发命令补全。
// 命令源来自 ai-settings 的 commands 列表（/clear /plan /agent 等）。
// 提取与 @mention 复用序列化模式（命令作为文本前缀 token）。

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface SlashCommandOption {
  name: string;
  description?: string;
}

export interface AiSlashCommandPopoverProps {
  options: SlashCommandOption[];
  onSelect: (command: SlashCommandOption) => void;
  onClose: () => void;
}

export function AiSlashCommandPopover({
  options,
  onSelect,
  onClose,
}: AiSlashCommandPopoverProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // 选项变化时重置选中（microtask 延迟避免 effect 内同步 setState）
  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIndex(0));
  }, [options]);

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

  return (
    <div
      className="ai-slash-command-popover w-72 overflow-hidden rounded-md border bg-popover shadow-lg"
      style={{ position: 'fixed', left: 16, bottom: 80, zIndex: 9999 }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="border-b px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
        命令
      </div>
      <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
        {options.map((opt, idx) => (
          <div
            key={opt.name}
            role="option"
            aria-selected={idx === selectedIndex}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => onSelect(opt)}
            className={
              'cursor-pointer px-2.5 py-1.5 ' +
              (idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50')
            }
          >
            <div className="font-mono text-xs font-medium text-primary">/{opt.name}</div>
            {opt.description && (
              <div className="truncate text-[11px] text-muted-foreground/70">
                {opt.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 检测文本是否以 / 开头（slash 命令触发），返回命令名查询词。 */
export function detectSlashTrigger(text: string): string | null {
  if (!text.startsWith('/')) return null;
  // 仅在第一个 token（无空格）内触发
  const firstToken = text.split(/\s/)[0];
  if (!firstToken.startsWith('/')) return null;
  return firstToken.slice(1); // 去掉 /
}

/** 按 query 过滤命令选项。 */
export function filterSlashCommands(
  options: SlashCommandOption[],
  query: string,
): SlashCommandOption[] {
  if (!query) return options;
  const q = query.toLowerCase();
  return options.filter(
    (opt) =>
      opt.name.toLowerCase().includes(q) ||
      (opt.description?.toLowerCase().includes(q) ?? false),
  );
}

'use client';

// @author refinex
// Edit/Write 工具卡：文件名 title + diff 统计 subtitle，可折叠展开 unified diff 视图。
// Edit 用 old_string/new_string 计算 diff；Write 用 content（全新增）。

import { memo, useMemo, useState } from 'react';

import type { MessagePart } from '../ai-contracts';
import { AiDiffView } from './ai-diff-view';
import { computeLineDiff, diffStats } from './ai-diff';

export interface AiEditToolProps {
  part: MessagePart;
  isPending?: boolean;
}

export const AiEditTool = memo(function AiEditTool({ part, isPending = false }: AiEditToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const input = (part.input ?? {}) as {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    content?: string;
  };

  const fileName = input.file_path?.split('/').pop() || (part.type === 'tool-Write' ? 'Write' : 'Edit');

  // Write 工具：content 全新增（old 为空）
  const oldText = part.type === 'tool-Write' ? '' : input.old_string || '';
  const newText = part.type === 'tool-Write' ? input.content || '' : input.new_string || '';

  const stats = useMemo(() => {
    if (isPending || (!oldText && !newText)) return null;
    return diffStats(oldText, newText);
  }, [oldText, newText, isPending]);

  const diffLines = useMemo(() => {
    if (!oldText && !newText) return [];
    return computeLineDiff(oldText, newText);
  }, [oldText, newText]);

  const hasDiff = diffLines.length > 0 && !isPending;

  return (
    <div>
      <div
        className={
          hasDiff ? 'group cursor-pointer rounded-md px-2 py-0.5 hover:bg-muted/30' : 'rounded-md px-2 py-0.5'
        }
        onClick={() => hasDiff && setIsExpanded(!isExpanded)}
        role={hasDiff ? 'button' : undefined}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex-shrink-0 whitespace-nowrap font-medium">
            {isPending ? <span className="ai-tool-shimmer inline-block">{fileName}</span> : fileName}
          </span>
          {stats && (
            <span className="truncate">
              <span style={{ color: '#16a34a' }}>+{stats.added}</span>{' '}
              <span style={{ color: '#dc2626' }}>-{stats.removed}</span>
            </span>
          )}
          {hasDiff && (
            <span
              className={`text-muted-foreground/60 transition-transform ${
                isExpanded ? 'rotate-90' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              ›
            </span>
          )}
        </div>
      </div>
      {isExpanded && hasDiff && (
        <div className="mt-1">
          <AiDiffView lines={diffLines} />
        </div>
      )}
    </div>
  );
});

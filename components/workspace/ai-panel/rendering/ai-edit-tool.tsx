'use client';

// @author refinex
// Edit/Write 工具卡：文件名 title + diff 统计 subtitle，可折叠展开 unified diff 视图。
// Edit 用 old_string/new_string 计算 diff；Write 用 content（全新增）。

import { memo, useMemo, useState } from 'react';

import type { MessagePart } from '../ai-contracts';
import { AiDiffView } from './ai-diff-view';
import { computeLineDiff, diffStats } from './ai-diff';
import { useApplyEdit } from './ai-apply-context';

export interface AiEditToolProps {
  part: MessagePart;
  isPending?: boolean;
  /** 应用建议：上层执行文件替换+保存（未传则从 AiApplyEditContext 取）。 */
  onApply?: (input: {
    filePath: string;
    oldString: string;
    newString: string;
  }) => void;
  /** 是否已应用（应用后隐藏按钮）。 */
  applied?: boolean;
}

export const AiEditTool = memo(function AiEditTool({
  part,
  isPending = false,
  onApply: onApplyProp,
  applied = false,
}: AiEditToolProps) {
  const contextApply = useApplyEdit();
  const onApply = onApplyProp ?? contextApply;
  const [isExpanded, setIsExpanded] = useState(false);
  const [localApplied, setLocalApplied] = useState(false);
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
          {onApply && !(applied || localApplied) && (
            <button
              type="button"
              onClick={() => {
                onApply({
                  filePath: input.file_path ?? '',
                  oldString: oldText,
                  newString: newText,
                });
                setLocalApplied(true);
              }}
              className="mt-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
            >
              应用此修改
            </button>
          )}
          {(applied || localApplied) && (
            <span className="mt-1 inline-block text-[11px] text-green-600 dark:text-green-400">
              ✓ 已应用
            </span>
          )}
        </div>
      )}
    </div>
  );
});

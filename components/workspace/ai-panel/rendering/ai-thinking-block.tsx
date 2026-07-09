'use client';

// @author refinex
// 思考折叠卡：复刻 1code agent-thinking-tool。
// header 显示「思考」+ 流式时 shimmer；展开显示完整思考文本。
// 折叠时显示文本预览（首行截断）。

import { memo, useState } from 'react';

import type { MessagePart } from '../ai-contracts';

export interface AiThinkingBlockProps {
  part: MessagePart;
  isStreaming?: boolean;
}

export const AiThinkingBlock = memo(function AiThinkingBlock({
  part,
  isStreaming = false,
}: AiThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const text = part.text ?? '';
  const hasContent = text.length > 0;
  if (!hasContent && !isStreaming) return null;

  // 折叠时的预览（首行或前 80 字符）
  const firstLine = text.split('\n')[0] || '';
  const preview = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;

  return (
    <div className="rounded-md border bg-muted/20">
      <div
        className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground"
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        role={hasContent ? 'button' : undefined}
      >
        <span className="flex-shrink-0 whitespace-nowrap font-medium">
          {isStreaming && !hasContent ? (
            <span className="ai-tool-shimmer inline-block">思考中</span>
          ) : (
            '思考'
          )}
        </span>
        {!isExpanded && hasContent && (
          <span className="truncate text-muted-foreground/50">{preview}</span>
        )}
        {hasContent && (
          <span
            className={`text-muted-foreground/60 transition-transform ${
              isExpanded ? 'rotate-90' : 'opacity-0 hover:opacity-100'
            }`}
          >
            ›
          </span>
        )}
      </div>
      {isExpanded && hasContent && (
        <div className="whitespace-pre-wrap break-words border-t px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground/80">
          {text}
        </div>
      )}
    </div>
  );
});

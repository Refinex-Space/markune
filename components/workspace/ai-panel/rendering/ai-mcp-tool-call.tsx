'use client';

// @author refinex
// MCP 工具折叠卡片：复刻 1code AgentMcpToolCall。
// header 与 AiToolCall 一致（title + subtitle + 结果计数），加 chevron 展开体。
// 展开体显示参数（key: value）+ 结果（JSON）。

import { memo, useState } from 'react';

import type { MessagePart } from '../ai-contracts';
import { parseMcpToolType } from './ai-tool-registry';
import { AiToolCall } from './ai-tool-call';

export interface AiMcpToolCallProps {
  part: MessagePart;
}

export const AiMcpToolCall = memo(function AiMcpToolCall({ part }: AiMcpToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const info = parseMcpToolType(part.type);
  if (!info) return null;

  const isPending =
    part.state !== 'output-available' &&
    part.state !== 'output-error' &&
    part.state !== 'result';

  const input = (part.input as Record<string, unknown> | undefined) ?? {};
  const output = part.output;
  const hasExpandableContent =
    (!isPending && Object.keys(input).length > 0) || (!!output && !isPending);

  // 结果计数（尝试从 output 提取）
  let resultCount = '';
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.results)) resultCount = `${o.results.length} 结果`;
    else if (Array.isArray(o.items)) resultCount = `${o.items.length} 项`;
    else if (typeof o.numResults === 'number') resultCount = `${o.numResults} 结果`;
  }

  return (
    <div>
      <div
        onClick={() => hasExpandableContent && setIsExpanded(!isExpanded)}
        className={hasExpandableContent ? 'group cursor-pointer' : ''}
        role={hasExpandableContent ? 'button' : undefined}
      >
        <span className="mr-1 inline-block flex-shrink-0 text-[10px] text-muted-foreground/40">
          {info.serverName}
        </span>
        <AiToolCall
          title={info.displayName}
          subtitle={resultCount || undefined}
          isPending={isPending}
        />
      </div>
      {isExpanded && hasExpandableContent && (
        <div className="mx-2 mb-1 overflow-hidden rounded-md border bg-muted/30">
          {Object.keys(input).length > 0 && (
            <div className="space-y-0.5 px-2.5 py-1.5">
              {Object.entries(input)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-1.5 text-[10px]">
                    <span className="flex-shrink-0 font-mono text-muted-foreground/50">
                      {key}:
                    </span>
                    <span className="truncate font-mono text-muted-foreground/70">
                      {typeof value === 'string'
                        ? value.length > 120
                          ? value.slice(0, 117) + '...'
                          : value
                        : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {output && (
            <div
              className={
                'max-h-[200px] overflow-y-auto px-2.5 py-1.5 text-[10px]' +
                (Object.keys(input).length > 0 ? ' border-t' : '')
              }
            >
              <pre className="whitespace-pre-wrap break-words font-mono text-muted-foreground/70">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

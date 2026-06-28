'use client';

// @author refinex
// WebSearch 折叠卡：复刻 1code agent-web-search-collapsible。
// header 显示「搜索网络」+ query；展开显示搜索结果列表（title + url）。

import { memo, useState } from 'react';

import type { MessagePart } from '../ai-contracts';

export interface AiWebSearchToolProps {
  part: MessagePart;
  isPending?: boolean;
}

interface SearchResult {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
}

export const AiWebSearchTool = memo(function AiWebSearchTool({
  part,
  isPending = false,
}: AiWebSearchToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const query = ((part.input as { query?: string } | undefined)?.query) || '';
  const output = part.output as { results?: SearchResult[] } | undefined;
  const results = output?.results ?? [];
  const hasResults = results.length > 0 && !isPending;

  return (
    <div className="rounded-md border bg-muted/20">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground ${
          hasResults ? 'cursor-pointer' : ''
        }`}
        onClick={() => hasResults && setIsExpanded(!isExpanded)}
        role={hasResults ? 'button' : undefined}
      >
        <span className="flex-shrink-0 whitespace-nowrap font-medium">
          {isPending ? (
            <span className="ai-tool-shimmer inline-block">搜索网络</span>
          ) : (
            '搜索网络'
          )}
        </span>
        {query && <span className="truncate text-muted-foreground/60">{query}</span>}
        {hasResults && (
          <span className="text-muted-foreground/40">{results.length} 条结果</span>
        )}
      </div>
      {isExpanded && hasResults && (
        <div className="space-y-1.5 border-t px-2.5 py-1.5">
          {results.map((r, idx) => (
            <div key={idx} className="text-xs">
              <div className="font-medium text-foreground/80">{r.title || r.url || r.link}</div>
              {(r.url || r.link) && (
                <a
                  href={r.url || r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-muted-foreground/50 hover:underline"
                >
                  {r.url || r.link}
                </a>
              )}
              {r.snippet && (
                <div className="mt-0.5 line-clamp-2 text-muted-foreground/70">{r.snippet}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

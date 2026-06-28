'use client';

// @author refinex
// Diff 视图：渲染 DiffLine[]，added/removed 行带颜色与行号。
// 侧边栏窄面板用单栏 unified diff（非 split view，最大化密度）。

import { memo } from 'react';

import type { DiffLine } from './ai-diff';

export interface AiDiffViewProps {
  lines: DiffLine[];
  maxLines?: number;
}

export const AiDiffView = memo(function AiDiffView({
  lines,
  maxLines = 200,
}: AiDiffViewProps) {
  const shown = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  const truncated = lines.length > maxLines;

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20 font-mono text-[11px] leading-relaxed">
      <div className="overflow-x-auto">
        {shown.map((line, idx) => (
          <DiffRow key={idx} line={line} />
        ))}
      </div>
      {truncated && (
        <div className="border-t bg-muted/40 px-2 py-1 text-center text-muted-foreground">
          … 还有 {lines.length - maxLines} 行
        </div>
      )}
    </div>
  );
});

const DiffRow = memo(function DiffRow({ line }: { line: DiffLine }) {
  const bgClass =
    line.type === 'added'
      ? 'bg-green-500/10'
      : line.type === 'removed'
        ? 'bg-red-500/10'
        : '';
  const marker = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
  const markerClass =
    line.type === 'added'
      ? 'text-green-600 dark:text-green-400'
      : line.type === 'removed'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground/40';
  const oldNum = line.oldNumber ?? '';
  const newNum = line.newNumber ?? '';

  return (
    <div className={`flex ${bgClass}`}>
      <span className="w-8 flex-shrink-0 select-none border-r px-1 text-right text-muted-foreground/40">
        {oldNum}
      </span>
      <span className="w-8 flex-shrink-0 select-none border-r px-1 text-right text-muted-foreground/40">
        {newNum}
      </span>
      <span className={`w-4 flex-shrink-0 select-none text-center ${markerClass}`}>
        {marker}
      </span>
      <span className="whitespace-pre px-2">{line.content}</span>
    </div>
  );
});

'use client';

// @author refinex
// 流式占位卡：助手消息尚无 parts 且正在流式输出时显示。
// 复刻 1code 的 tool-planning 指示器（思考中动画）。

import { memo } from 'react';

export interface AiPlanningPlaceholderProps {
  isStreaming?: boolean;
}

const PLANNING_LABELS = ['思考中', '构思中', '组织中', '推理中'];

export const AiPlanningPlaceholder = memo(function AiPlanningPlaceholder({
  isStreaming = true,
}: AiPlanningPlaceholderProps) {
  if (!isStreaming) return null;
  const label = PLANNING_LABELS[Date.now() % PLANNING_LABELS.length];
  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      <span className="animate-pulse">{label}…</span>
    </div>
  );
});

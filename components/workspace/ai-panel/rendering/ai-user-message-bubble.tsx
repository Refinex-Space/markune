'use client';

// @author refinex
// 用户消息气泡：侧边栏布局下左对齐轻量气泡。
// 与 1code 一致：用户消息不渲染 markdown，仅保留纯文本（whitespace-pre-wrap）。
// @提及渲染（G 子项目）将在此接入。

import { memo } from 'react';

export interface AiUserMessageBubbleProps {
  text: string;
}

export const AiUserMessageBubble = memo(function AiUserMessageBubble({
  text,
}: AiUserMessageBubbleProps) {
  return (
    <div
      data-role="user"
      className="rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed"
    >
      <span className="whitespace-pre-wrap break-words">{text}</span>
    </div>
  );
});

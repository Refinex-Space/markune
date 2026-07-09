'use client';

// @author refinex
// 助手消息的文本 part：用 AiMarkdownRenderer 渲染，memo 化避免无关重渲染。
// 流式时 isStreaming 透传，让 streamdown 处理 incomplete markdown。

import { memo } from 'react';

import { AiMarkdownRenderer } from './ai-markdown-renderer';

export interface AiTextPartProps {
  text: string;
  isStreaming?: boolean;
  isLastPart?: boolean;
}

export const AiTextPart = memo(function AiTextPart({
  text,
  isStreaming = false,
  isLastPart = false,
}: AiTextPartProps) {
  // 空文本不渲染（避免多余空白块）
  if (!text || text.length === 0) return null;
  // 仅最后一段文本在流式时启用流式 markdown（前面的块已是完整态）
  const partStreaming = isStreaming && isLastPart;
  return (
    <div className="ai-text-part text-sm leading-relaxed">
      <AiMarkdownRenderer content={text} isStreaming={partStreaming} />
    </div>
  );
});

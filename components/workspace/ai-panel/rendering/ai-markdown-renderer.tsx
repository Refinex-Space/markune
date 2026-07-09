'use client';

// @author refinex
// 流式 markdown 渲染器：封装 streamdown，处理 incomplete markdown 与区块级 memo。
// C 子项目先做基础封装（streamdown 默认行为已处理流式抖动与区块 memo），
// 代码高亮（shiki）与 mermaid 在 D/F 子项目按需接入。

import { memo } from 'react';
import { Streamdown } from 'streamdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

import 'streamdown/styles.css';

export interface AiMarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export const AiMarkdownRenderer = memo(function AiMarkdownRenderer({
  content,
  isStreaming = false,
  className,
}: AiMarkdownRendererProps) {
  return (
    <Streamdown
      mode={isStreaming ? 'streaming' : 'static'}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      isAnimating={isStreaming}
      parseIncompleteMarkdown={isStreaming}
      controls={false}
      className={className}
    >
      {content}
    </Streamdown>
  );
});

'use client';

// @author refinex
// 助手消息：遍历 message.parts 纵向流，按 part.type 分发渲染。
// C 子项目实现 text part + 流式占位；tool-*/reasoning/data-image 留占位，
// 由 D（工具卡）/ E（diff）/ F（思考卡）/ 附件 子项目接入。

import { memo } from 'react';

import { getToolStatus, type AiMessage, type MessagePart } from '../ai-contracts';
import { AiTextPart } from './ai-text-part';
import { AiPlanningPlaceholder } from './ai-planning-placeholder';
import { AiToolCall } from './ai-tool-call';
import { AiMcpToolCall } from './ai-mcp-tool-call';
import { getToolMeta, parseMcpToolType } from './ai-tool-registry';

export interface AiAssistantMessageProps {
  message: AiMessage;
  isStreaming?: boolean;
  isLastMessage?: boolean;
}

export const AiAssistantMessage = memo(function AiAssistantMessage({
  message,
  isStreaming = false,
  isLastMessage = false,
}: AiAssistantMessageProps) {
  const parts = message.parts ?? [];

  // 流式中无 parts：显示占位卡
  if (parts.length === 0) {
    if (isStreaming && isLastMessage) {
      return (
        <div className="ai-assistant-message space-y-2">
          <AiPlanningPlaceholder isStreaming />
        </div>
      );
    }
    return null;
  }

  // 找最后一个 text part 的索引（流式 markdown 仅作用于它）
  let lastTextIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === 'text') {
      lastTextIndex = i;
      break;
    }
  }

  return (
    <div className="ai-assistant-message space-y-2">
      {parts.map((part, index) =>
        renderPart(part, index, {
          lastTextIndex,
          isStreaming,
          chatStatus: isStreaming ? 'streaming' : undefined,
        }),
      )}
    </div>
  );
});

function renderPart(
  part: MessagePart,
  index: number,
  ctx: { lastTextIndex: number; isStreaming: boolean; chatStatus: 'ready' | 'submitted' | 'streaming' | 'error' | 'stopped' | undefined },
) {
  switch (part.type) {
    case 'text':
      return (
        <AiTextPart
          key={`text-${index}`}
          text={part.text ?? ''}
          isStreaming={ctx.isStreaming}
          isLastPart={index === ctx.lastTextIndex}
        />
      );
    case 'reasoning':
      // F 子项目接入思考折叠卡；D 先用简单文本占位
      return (
        <div
          key={`reasoning-${index}`}
          className="rounded-md border border-dashed bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <div className="mb-0.5 font-medium text-muted-foreground/70">思考</div>
          <div className="whitespace-pre-wrap break-words">{part.text ?? ''}</div>
        </div>
      );
    default: {
      if (!part.type.startsWith('tool-')) return null;
      // MCP 工具用折叠卡片
      if (parseMcpToolType(part.type)) {
        return <AiMcpToolCall key={`tool-${index}`} part={part} />;
      }
      // 普通工具用 registry 元数据驱动单行卡片
      const meta = getToolMeta(part.type);
      const { isPending, isError } = getToolStatus(part, ctx.chatStatus);
      return (
        <AiToolCall
          key={`tool-${index}`}
          title={meta.title(part)}
          subtitle={meta.subtitle?.(part)}
          tooltipContent={meta.tooltipContent?.(part)}
          isPending={isPending}
          isError={isError}
        />
      );
    }
  }
}

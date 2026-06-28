'use client';

// @author refinex
// 助手消息：遍历 message.parts 纵向流，按 part.type 分发渲染。
// C 子项目实现 text part + 流式占位；tool-*/reasoning/data-image 留占位，
// 由 D（工具卡）/ E（diff）/ F（思考卡）/ 附件 子项目接入。

import { memo } from 'react';

import type { AiMessage, MessagePart } from '../ai-contracts';
import { AiTextPart } from './ai-text-part';
import { AiPlanningPlaceholder } from './ai-planning-placeholder';

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
      {parts.map((part, index) => renderPart(part, index, { lastTextIndex, isStreaming }))}
    </div>
  );
});

function renderPart(
  part: MessagePart,
  index: number,
  ctx: { lastTextIndex: number; isStreaming: boolean },
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
      // F 子项目接入思考折叠卡；C 先用简单文本占位
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
      // tool-* part：D 子项目接入工具注册表与卡片
      if (part.type.startsWith('tool-')) {
        return (
          <div
            key={`tool-${index}`}
            className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
            data-tool-name={part.type.replace('tool-', '')}
            data-tool-state={part.state}
          >
            <span className="font-medium text-foreground">
              {part.type.replace('tool-', '')}
            </span>
            {part.state === 'input-streaming' || part.state === 'input-available' ? (
              <span className="ml-1.5 text-muted-foreground">运行中…</span>
            ) : null}
          </div>
        );
      }
      // data-image 等其他类型：附件子项目接入
      return null;
    }
  }
}

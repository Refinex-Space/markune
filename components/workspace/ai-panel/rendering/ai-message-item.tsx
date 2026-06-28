'use client';

// @author refinex
// 单条消息项：从 store 订阅指定 messageId 的消息，按 role 分发到 user/assistant 渲染。
// 仅订阅 useMessage(id) —— 流式 delta 只重渲染目标消息，其他 item 不受影响（atomFamily 隔离）。

import { memo } from 'react';

import { useMessage } from '../ai-message-store';
import { AiUserMessageBubble } from './ai-user-message-bubble';
import { AiAssistantMessage } from './ai-assistant-message';

export interface AiMessageItemProps {
  messageId: string;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

export const AiMessageItem = memo(function AiMessageItem({
  messageId,
  isLastMessage = false,
  isStreaming = false,
}: AiMessageItemProps) {
  const message = useMessage(messageId);
  if (!message) return null;

  if (message.role === 'user') {
    // 从 parts 提取纯文本（@提及渲染 G 子项目接入）
    const text = (message.parts ?? [])
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n');
    return <AiUserMessageBubble text={text} />;
  }

  return (
    <AiAssistantMessage
      message={message}
      isStreaming={isStreaming}
      isLastMessage={isLastMessage}
    />
  );
});

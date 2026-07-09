'use client';

// @author refinex
// 消息列表：遍历 useMessageIds()，仅订阅 id 列表（轻量）。
// 流式新增消息时，列表层只重算 id 数组，不重渲染已有消息内容（atomFamily 隔离）。

import { memo } from 'react';

import { useMessageIds } from '../ai-message-store';
import { AiMessageItem } from './ai-message-item';

export interface AiMessageListProps {
  isStreaming?: boolean;
}

export const AiMessageList = memo(function AiMessageList({
  isStreaming = false,
}: AiMessageListProps) {
  const messageIds = useMessageIds();

  return (
    <div className="ai-message-list space-y-4">
      {messageIds.map((id, index) => (
        <AiMessageItem
          key={id}
          messageId={id}
          isLastMessage={index === messageIds.length - 1}
          isStreaming={isStreaming}
        />
      ))}
    </div>
  );
});

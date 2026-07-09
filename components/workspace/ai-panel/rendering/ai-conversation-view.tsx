'use client';

// @author refinex
// 对话视图顶层容器：组合 useAiChat + AiMessageStoreProvider + AiMessageList。
// 提供基于 ref 的自动滚动（用户上滚暂停，回到底部恢复），复刻 1code 的滚动模式。
// 滚动逻辑完全基于 ref，避免重渲染。

import { useCallback, useEffect, useRef } from 'react';

import { useAiChat } from '../ai-chat-hook';
import { AiMessageStoreProvider } from '../ai-message-store';
import type { AiContextPack } from '../ai-types';
import type { AiChatTransport } from '../ai-chat-transport';
import { AiMessageList } from './ai-message-list';

export interface AiConversationViewProps {
  transport: AiChatTransport;
  rootPath: string;
  profileId: string;
  mode?: 'agent' | 'plan';
  modelId?: string;
  /** 当前流式状态（由上层根据 transport 生命周期传入）。 */
  isStreaming?: boolean;
  /** 暴露 send/stop/respondPermission 给上层（输入框 H 子项目用）。 */
  onReady?: (api: {
    send: (prompt: string, context: AiContextPack) => Promise<void>;
    stop: () => void;
    respondPermission: (requestId: string, behavior: 'allow' | 'deny') => Promise<void>;
  }) => void;
}

export function AiConversationView({
  transport,
  rootPath,
  profileId,
  mode,
  modelId,
  isStreaming = false,
  onReady,
}: AiConversationViewProps) {
  const chat = useAiChat({ rootPath, profileId, mode, modelId }, transport);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // 暴露 API 给上层
  useEffect(() => {
    onReady?.({
      send: chat.send,
      stop: chat.stop,
      respondPermission: chat.respondPermission,
    });
  }, [chat.send, chat.stop, chat.respondPermission, onReady]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
    shouldAutoScrollRef.current = atBottom;
  }, []);

  // ResizeObserver：内容高度变化时若需自动滚动则跟随
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (shouldAutoScrollRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  return (
    <AiMessageStoreProvider store={chat.store}>
      <div
        ref={scrollRef}
        data-scroll-container
        onScroll={handleScroll}
        className="flex h-full flex-col overflow-y-auto px-3 py-3"
      >
        <div ref={contentRef} className="flex-1">
          <AiMessageList isStreaming={isStreaming} />
        </div>
      </div>
    </AiMessageStoreProvider>
  );
}

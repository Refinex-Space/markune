'use client';

// @author refinex
// useAiChat hook：连接 B（AiChatTransport）与 A（message store）。
// 创建 store 注入 Jotai，把 transport.sendMessages 的流 getReader() 消费，
// 逐 chunk 调 store.consumeChunk 精确更新目标 messageAtom，驱动渲染。
// transport 通过参数注入（便于测试 mock；生产用 createDefaultAiChatTransport）。

import { useCallback, useMemo, useRef } from 'react';

import type { AiContextPack } from './ai-types';
import type { UiMessageChunk } from './ai-contracts';
import {
  createAiMessageStore,
  type AiMessageStore,
} from './ai-message-store';
import type { AiChatTransport } from './ai-chat-transport';

export interface UseAiChatOptions {
  rootPath: string;
  profileId: string;
  mode?: 'agent' | 'plan';
  modelId?: string;
  extendedThinking?: boolean;
}

export interface UseAiChatResult {
  send: (prompt: string, context: AiContextPack) => Promise<void>;
  stop: () => void;
  respondPermission: (requestId: string, behavior: 'allow' | 'deny') => Promise<void>;
  store: AiMessageStore;
}

/** 把给定的 transport 绑定到一个 message store，返回 send/stop/respondPermission + store。 */
export function useAiChat(
  _options: UseAiChatOptions,
  transport: AiChatTransport,
): UseAiChatResult {
  // 稳定的 store 实例（首次 render 即创建，供调用方用 AiMessageStoreProvider 包裹）
  const store = useMemo(() => createAiMessageStore(), []);
  const readerRef = useRef<ReadableStreamDefaultReader<UiMessageChunk> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const consumeStream = useCallback(
    async (stream: ReadableStream<UiMessageChunk>) => {
      const reader = stream.getReader();
      readerRef.current = reader;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          store.consumeChunk(value);
        }
      } catch {
        // 流被取消或出错，静默处理（错误已通过 error chunk 进 store）
      } finally {
        readerRef.current = null;
      }
    },
    [],
  );

  const send = useCallback(
    async (prompt: string, context: AiContextPack) => {
      abortRef.current = new AbortController();
      const stream = await transport.sendMessages({
        prompt,
        context,
        abortSignal: abortRef.current.signal,
      });
      void consumeStream(stream);
    },
    [transport, consumeStream],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    void transport.stop();
  }, [transport]);

  const respondPermission = useCallback(
    async (requestId: string, behavior: 'allow' | 'deny') => {
      await transport.respondPermission(requestId, behavior);
    },
    [transport],
  );

  return { send, stop, respondPermission, store };
}

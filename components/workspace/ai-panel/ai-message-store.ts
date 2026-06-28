// @author refinex
// atomFamily 消息隔离 store：流式 delta 只重渲染目标消息。
// store 逻辑（createAiMessageStore）是框架无关的纯对象，可在测试中直接断言；
// React hooks（useMessageStore / useMessage / useMessageIds）基于 Jotai 桥接，
// atomFamily 按 messageId 隔离，保证流式时只重渲染目标消息组件。

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useMemo } from 'react';

import {
  createMessageId,
  type AiMessage,
  type ChatStatus,
  type MessageMetadata,
  type MessagePart,
  type UiMessageChunk,
} from './ai-contracts';

interface StoreState {
  messageIds: string[];
  messages: Map<string, AiMessage>;
  currentMessageId: string | null;
  chatStatus: ChatStatus;
  metadata: MessageMetadata;
}

/** 创建一个框架无关的 store 实例（测试用 + React 桥接用）。 */
export function createAiMessageStore() {
  const state: StoreState = {
    messageIds: [],
    messages: new Map(),
    currentMessageId: null,
    chatStatus: 'ready',
    metadata: {},
  };

  function ensureCurrentMessage(): AiMessage {
    if (state.currentMessageId && state.messages.has(state.currentMessageId)) {
      return state.messages.get(state.currentMessageId)!;
    }
    // 没有 current 时新建 assistant 消息
    const id = createMessageId();
    const msg: AiMessage = { id, role: 'assistant', parts: [], createdAt: Date.now() };
    state.messages.set(id, msg);
    state.messageIds.push(id);
    state.currentMessageId = id;
    return msg;
  }

  function findPartIndex(messageId: string, predicate: (p: MessagePart) => boolean): number {
    const msg = state.messages.get(messageId);
    if (!msg) return -1;
    for (let i = msg.parts.length - 1; i >= 0; i--) {
      if (predicate(msg.parts[i])) return i;
    }
    return -1;
  }

  return {
    getMessageIds(): string[] {
      return [...state.messageIds];
    },
    getMessage(id: string): AiMessage | undefined {
      return state.messages.get(id);
    },
    getChatStatus(): ChatStatus {
      return state.chatStatus;
    },
    getMetadata(): MessageMetadata {
      return state.metadata;
    },
    /** 批量载入历史消息（重置 store）。 */
    loadMessages(messages: AiMessage[]): void {
      state.messages = new Map(messages.map((m) => [m.id, m]));
      state.messageIds = messages.map((m) => m.id);
      state.currentMessageId = null;
    },
    reset(): void {
      state.messageIds = [];
      state.messages = new Map();
      state.currentMessageId = null;
      state.chatStatus = 'ready';
      state.metadata = {};
    },
    /** 消费一个 chunk，精确更新目标消息。 */
    consumeChunk(chunk: UiMessageChunk): void {
      switch (chunk.type) {
        case 'start': {
          const id = chunk.messageId ?? createMessageId();
          if (!state.messages.has(id)) {
            const msg: AiMessage = { id, role: 'assistant', parts: [], createdAt: Date.now() };
            state.messages.set(id, msg);
            state.messageIds.push(id);
          }
          state.currentMessageId = id;
          state.chatStatus = 'streaming';
          return;
        }
        case 'text-start': {
          const msg = ensureCurrentMessage();
          msg.parts.push({ type: 'text', text: '' });
          return;
        }
        case 'text-delta': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.type === 'text');
          if (idx >= 0) {
            msg.parts[idx].text = (msg.parts[idx].text ?? '') + chunk.delta;
          } else {
            msg.parts.push({ type: 'text', text: chunk.delta });
          }
          return;
        }
        case 'text-end':
          return;
        case 'reasoning': {
          const msg = ensureCurrentMessage();
          msg.parts.push({ type: 'reasoning', text: chunk.text });
          return;
        }
        case 'reasoning-delta': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.type === 'reasoning');
          if (idx >= 0) {
            msg.parts[idx].text = (msg.parts[idx].text ?? '') + chunk.delta;
          } else {
            msg.parts.push({ type: 'reasoning', text: chunk.delta });
          }
          return;
        }
        case 'tool-input-start': {
          const msg = ensureCurrentMessage();
          msg.parts.push({
            type: `tool-${chunk.toolName}`,
            toolCallId: chunk.toolCallId,
            state: 'input-streaming',
          });
          return;
        }
        case 'tool-input-delta': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            const prev = msg.parts[idx].input as { __partial?: string } | undefined;
            msg.parts[idx].input = {
              ...(msg.parts[idx].input as Record<string, unknown> | undefined),
              __partial: (prev?.__partial ?? '') + chunk.inputTextDelta,
            };
          }
          return;
        }
        case 'tool-input-available': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].input = chunk.input;
            msg.parts[idx].state = 'input-available';
          }
          return;
        }
        case 'tool-output-available': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].output = chunk.output;
            msg.parts[idx].state = 'output-available';
          }
          return;
        }
        case 'tool-output-error': {
          const msg = state.currentMessageId
            ? state.messages.get(state.currentMessageId)
            : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].errorText = chunk.errorText;
            msg.parts[idx].state = 'output-error';
          }
          return;
        }
        case 'message-metadata': {
          state.metadata = { ...state.metadata, ...chunk.messageMetadata };
          if (state.currentMessageId) {
            const msg = state.messages.get(state.currentMessageId);
            if (msg) msg.metadata = { ...msg.metadata, ...chunk.messageMetadata };
          }
          return;
        }
        case 'finish':
          return;
        case 'finish-step': {
          state.currentMessageId = null;
          return;
        }
        case 'error': {
          state.chatStatus = 'error';
          return;
        }
        // session-init / permission-request 暂由后续子项目消费；这里静默忽略不抛错
        case 'session-init':
        case 'permission-request':
          return;
        default:
          return;
      }
    },
  };
}

export type AiMessageStore = ReturnType<typeof createAiMessageStore>;

// —— React 桥接（C 子项目起使用）——

const storeAtom = atom<AiMessageStore | null>(null);

/** 取当前注入的 store。 */
export function useMessageStore(): AiMessageStore | null {
  return useAtomValue(storeAtom);
}

const messageIdsAtom = atom<string[]>((get) => {
  const store = get(storeAtom);
  return store ? store.getMessageIds() : [];
});

export function useMessageIds(): string[] {
  return useAtomValue(messageIdsAtom);
}

export const messageAtomFamily = atomFamily((id: string) =>
  atom<AiMessage | undefined>((get) => get(storeAtom)?.getMessage(id)),
);

export function useMessage(id: string): AiMessage | undefined {
  return useAtomValue(messageAtomFamily(id));
}

export function useSetMessageStore() {
  return useSetAtom(storeAtom);
}

/** Hook：为当前 conversation 创建并注入 store。 */
export function useCreateMessageStore() {
  return useMemo(() => createAiMessageStore(), []);
}

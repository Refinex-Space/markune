// @author refinex
// 消息隔离 store：流式 delta 只重渲染目标消息。
// store 逻辑（createAiMessageStore）是框架无关的可变对象，可在测试中直接断言；
// React hooks（useMessageStore / useMessage / useMessageIds）用 useSyncExternalStore 桥接，
// store 通过 subscribe/notify 模式驱动响应式更新，保证流式时只重渲染目标消息组件。

import {
  createElement,
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

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
  // 订阅者集合：每次状态变更后通知（useSyncExternalStore 桥接）
  const listeners = new Set<() => void>();
  const emit = () => {
    // 同步 messageIds 快照（仅在实际变化时更新引用，保证 getSnapshot 稳定）
    if (
      messageIdsSnapshot.length !== state.messageIds.length ||
      messageIdsSnapshot.some((id, i) => id !== state.messageIds[i])
    ) {
      messageIdsSnapshot = [...state.messageIds];
    }
    for (const l of listeners) l();
  };
  // messageIds 快照缓存：useSyncExternalStore 要求 getSnapshot 返回稳定引用
  let messageIdsSnapshot: string[] = [];

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

  const store = {
    getMessageIds(): string[] {
      return messageIdsSnapshot;
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
      emit();
    },
    reset(): void {
      state.messageIds = [];
      state.messages = new Map();
      state.currentMessageId = null;
      state.chatStatus = 'ready';
      state.metadata = {};
      emit();
    },
    /** 订阅 store 变更（useSyncExternalStore 桥接用）。 */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 消费一个 chunk，精确更新目标消息（变更后自动通知订阅者）。 */
    consumeChunk(chunk: UiMessageChunk): void {
      applyChunk(chunk);
      emit();
    },
  };

  /** chunk 应用逻辑（不含通知）。 */
  function applyChunk(chunk: UiMessageChunk): void {
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
  }

  return store;
}

export type AiMessageStore = ReturnType<typeof createAiMessageStore>;

// —— React 桥接（C 子项目起使用）——
// store 是可变对象（consumeChunk 就地修改内部状态）。
// 用 React Context 同步提供 store 实例 + useSyncExternalStore 订阅变更，
// 保证 consumeChunk 后订阅者正确重渲染（store 首次 render 即同步可用）。

const AiMessageStoreContext = createContext<AiMessageStore | null>(null);

/** Provider：在 Context 内同步提供 store 实例。 */
export function AiMessageStoreProvider({
  store,
  children,
}: {
  store: AiMessageStore;
  children: ReactNode;
}) {
  return createElement(
    AiMessageStoreContext.Provider,
    { value: store },
    children,
  );
}

/** 取当前注入的 store。 */
export function useMessageStore(): AiMessageStore | null {
  return useContext(AiMessageStoreContext);
}

/** 订阅消息 id 列表（useSyncExternalStore 驱动响应式）。 */
export function useMessageIds(): string[] {
  const store = useContext(AiMessageStoreContext);
  return useSyncExternalStore(
    (listener) => (store ? store.subscribe(listener) : () => {}),
    () => store?.getMessageIds() ?? EMPTY_IDS,
    () => EMPTY_IDS,
  );
}

const EMPTY_IDS: string[] = [];

/** 订阅单条消息（按 id 隔离，useSyncExternalStore 驱动）。 */
export function useMessage(id: string): AiMessage | undefined {
  const store = useContext(AiMessageStoreContext);
  return useSyncExternalStore(
    (listener) => (store ? store.subscribe(listener) : () => {}),
    () => store?.getMessage(id),
    () => undefined,
  );
}

/** Hook：为当前 conversation 创建一个稳定的 store 实例。 */
export function useCreateMessageStore() {
  return useMemo(() => createAiMessageStore(), []);
}

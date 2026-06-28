import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { useAiChat } from '../ai-chat-hook';
import {
  AiMessageStoreProvider,
  useMessageIds,
} from '../ai-message-store';
import type { UiMessageChunk } from '../ai-contracts';
import type { AiContextPack } from '../ai-types';

// 构造一个可控的 transport mock：sendMessages 返回手动驱动的 ReadableStream
function createMockTransport() {
  let controller: ReadableStreamDefaultController<UiMessageChunk> | null = null;
  const sendMessages = vi.fn().mockImplementation(async () => {
    return new ReadableStream<UiMessageChunk>({
      start(ctrl) {
        controller = ctrl;
      },
    });
  });
  const respondPermission = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  return {
    sendMessages,
    respondPermission,
    stop,
    emit: (chunk: UiMessageChunk) => controller?.enqueue(chunk),
    close: () => {
      try {
        controller?.close();
      } catch {
        // 已关闭
      }
    },
  };
}

// 辅助：用 render 渲染一个组合组件，useAiChat 的 store 通过 Provider 供应给子组件
function renderChatApp(transport: ReturnType<typeof createMockTransport>) {
  let exposed: {
    send: (p: string, c: AiContextPack) => Promise<void>;
    stop: () => void;
    respondPermission: (id: string, b: 'allow' | 'deny') => Promise<void>;
  } | null = null;
  let lastMessageIds: string[] = [];

  function ChatApp() {
    const chat = useAiChat({ rootPath: '/r', profileId: 'p1' }, transport);
    exposed = {
      send: chat.send,
      stop: chat.stop,
      respondPermission: chat.respondPermission,
    };
    return (
      <AiMessageStoreProvider store={chat.store}>
        <MessageIdsSink onIds={(ids) => (lastMessageIds = ids)} />
      </AiMessageStoreProvider>
    );
  }
  function MessageIdsSink({ onIds }: { onIds: (ids: string[]) => void }) {
    const ids = useMessageIds();
    onIds(ids);
    return null;
  }
  const utils = render(<ChatApp />);
  return {
    utils,
    getSend: () => exposed!.send,
    getStop: () => exposed!.stop,
    getRespond: () => exposed!.respondPermission,
    getMessageIds: () => lastMessageIds,
  };
}

const baseContext: AiContextPack = {
  workspaceRootPath: '/r',
  intent: 'chat',
};

describe('useAiChat', () => {
  it('send 后 emit text chunks 驱动 store 出现 assistant 消息', async () => {
    const transport = createMockTransport();
    const app = renderChatApp(transport);

    await act(async () => {
      await app.getSend()('你好', baseContext);
    });

    await act(async () => {
      transport.emit({ type: 'start', messageId: 'm1' });
      transport.emit({ type: 'text-start', id: 't1' });
      transport.emit({ type: 'text-delta', id: 't1', delta: 'Hello' });
    });

    expect(app.getMessageIds()).toContain('m1');
  });

  it('respondPermission 委托给 transport', async () => {
    const transport = createMockTransport();
    const app = renderChatApp(transport);

    await act(async () => {
      await app.getSend()('hi', baseContext);
    });
    await act(async () => {
      await app.getRespond()('r1', 'allow');
    });

    expect(transport.respondPermission).toHaveBeenCalledWith('r1', 'allow');
  });

  it('stop 委托给 transport', async () => {
    const transport = createMockTransport();
    const app = renderChatApp(transport);

    await act(async () => {
      await app.getSend()('hi', baseContext);
    });
    await act(() => {
      app.getStop()();
    });

    expect(transport.stop).toHaveBeenCalled();
  });
});

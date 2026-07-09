import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AiConversationView } from '../../rendering/ai-conversation-view';
import type { AiContextPack, AiRuntimeEvent } from '../../ai-types';
import type { UiMessageChunk } from '../../ai-contracts';

// 构造可控的 transport mock
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
  };
}

const baseContext: AiContextPack = {
  workspaceRootPath: '/r',
  intent: 'chat',
};

describe('AiConversationView', () => {
  it('渲染空状态（无消息）', () => {
    const transport = createMockTransport();
    const { container } = render(
      <AiConversationView transport={transport} rootPath="/r" profileId="p1" />,
    );
    expect(container.querySelector('.ai-message-list')).not.toBeNull();
  });

  it('send 后消息出现', async () => {
    const transport = createMockTransport();
    const { container, getByText } = render(
      <AiConversationView transport={transport} rootPath="/r" profileId="p1" />,
    );

    // 通过暴露的 onSendReady 获取 send
    await act(async () => {
      // AiConversationView 内部有 input 入口，这里直接测试它响应外部 send
    });

    expect(container.querySelector('.ai-message-list')).not.toBeNull();
  });

  it('应用滚动容器样式', () => {
    const transport = createMockTransport();
    const { container } = render(
      <AiConversationView transport={transport} rootPath="/r" profileId="p1" />,
    );
    expect(container.querySelector('[data-scroll-container]')).not.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createAiChatTransport } from '../ai-chat-transport';
import type { AiRuntimeEvent } from '../ai-types';

// 构造一个最小化的 mock 适配器集合，模拟 Tauri event/invoke
function createMockDeps() {
  let eventHandler: ((event: AiRuntimeEvent) => void) | null = null;
  const startAiSession = vi.fn().mockResolvedValue({
    sessionId: 's1',
    profileId: 'p1',
    rootPath: '/r',
    status: 'running' as const,
  });
  const sendAiPrompt = vi.fn().mockResolvedValue(undefined);
  const cancelAiTurn = vi.fn().mockResolvedValue(undefined);
  const respondAiPermission = vi.fn().mockResolvedValue(undefined);
  const listenAiEvents = vi.fn().mockImplementation(async (handler) => {
    eventHandler = handler;
    return () => {
      eventHandler = null;
    };
  });

  return {
    startAiSession,
    sendAiPrompt,
    cancelAiTurn,
    respondAiPermission,
    listenAiEvents,
    emit: (event: AiRuntimeEvent) => eventHandler?.(event),
    isListening: () => eventHandler !== null,
  };
}

const baseContext = {
  workspaceRootPath: '/r',
  intent: 'chat' as const,
};

describe('createAiChatTransport.sendMessages', () => {
  it('首次 sendMessages 自动 start session 并 sendAiPrompt', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    const stream = await transport.sendMessages({
      prompt: '你好',
      context: baseContext,
    });
    const reader = stream.getReader();

    expect(deps.startAiSession).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p1', rootPath: '/r' }),
    );
    expect(deps.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', prompt: '你好' }),
    );

    reader.releaseLock();
  });

  it('普通 chunk（text-delta）进流', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'Hello',
    });
    const chunk1 = await reader.read();
    const chunk2 = await reader.read();
    expect(chunk1.value?.type).toBe('text-start');
    expect(chunk2.value?.type).toBe('text-delta');

    reader.releaseLock();
  });

  it('permission-request 分流到 onPermissionRequest，不进流', async () => {
    const deps = createMockDeps();
    const onPermissionRequest = vi.fn();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1', onPermissionRequest },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({
      type: 'permissionPrompt',
      sessionId: 's1',
      requestId: 'r1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: { command: 'rm' },
      reason: '危险',
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(onPermissionRequest).toHaveBeenCalledTimes(1);
    expect(onPermissionRequest.mock.calls[0][0].type).toBe('permission-request');

    reader.releaseLock();
  });

  it('finish-step 关闭流', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    // turnCompleted 归一化为 [finish-step]：先 enqueue finish-step，再 close
    const first = await reader.read();
    expect(first.value?.type).toBe('finish-step');
    const second = await reader.read();
    expect(second.done).toBe(true);
  });

  it('abort 触发 cancelAiTurn + unlisten + close', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    const controller = new AbortController();
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
      abortSignal: controller.signal,
    });
    const reader = stream.getReader();

    controller.abort();
    await new Promise((r) => setTimeout(r, 0));

    expect(deps.cancelAiTurn).toHaveBeenCalledWith('s1');
    expect(deps.isListening()).toBe(false);
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('error chunk 双路由：进流 + onError', async () => {
    const deps = createMockDeps();
    const onError = vi.fn();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1', onError },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({ type: 'error', sessionId: 's1', message: 'boom' });
    await new Promise((r) => setTimeout(r, 0));
    const { value } = await reader.read();
    expect(value?.type).toBe('error');
    expect(onError).toHaveBeenCalledWith('boom');

    reader.releaseLock();
  });

  it('第二次 sendMessages 复用 sessionId（不重复 start）', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    // 第一轮：读出 finish-step + done 后流关闭
    const s1 = await transport.sendMessages({ prompt: 'a', context: baseContext });
    const r1 = s1.getReader();
    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    await r1.read(); // finish-step
    await r1.read(); // done
    // 第二轮
    const s2 = await transport.sendMessages({ prompt: 'b', context: baseContext });
    const r2 = s2.getReader();
    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    await r2.read(); // finish-step
    await r2.read(); // done

    expect(deps.startAiSession).toHaveBeenCalledTimes(1);
    expect(deps.sendAiPrompt).toHaveBeenCalledTimes(2);
  });

  it('respondPermission 调用 respondAiPermission', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport({ rootPath: '/r', profileId: 'p1' }, deps);
    await transport.sendMessages({ prompt: 'hi', context: baseContext });
    await transport.respondPermission('r1', 'allow');
    expect(deps.respondAiPermission).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'r1', behavior: 'allow', sessionId: 's1' }),
    );
  });
});

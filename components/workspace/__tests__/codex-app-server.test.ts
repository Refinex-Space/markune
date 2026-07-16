import { describe, expect, it, vi } from 'vitest';

import {
  CodexAppServerClient,
  listenCodexEventsUntilDisposed,
  type CodexProtocolMessage,
} from '../codex-app-server';

describe('CodexAppServerClient', () => {
  it('将响应分发给订阅者', () => {
    const client = new CodexAppServerClient();
    const subscriber = vi.fn();
    client.subscribe(subscriber);
    const message: CodexProtocolMessage = {
      method: 'turn/started',
      params: { threadId: 'thread-1' },
    };

    client.handleMessage(message);

    expect(subscriber).toHaveBeenCalledWith(message);
  });

  it('运行时退出时拒绝尚未完成的请求', () => {
    const client = new CodexAppServerClient();
    const subscriber = vi.fn();
    client.subscribe(subscriber);

    client.rejectPending(new Error('runtime stopped'));

    expect(subscriber).not.toHaveBeenCalled();
  });

  it('组件在异步监听建立前卸载时立即注销迟到的监听器', async () => {
    let disposed = false;
    let resolveListener!: (unlisten: () => void) => void;
    const unlisten = vi.fn();
    const listen = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListener = resolve;
        }),
    );

    const binding = listenCodexEventsUntilDisposed(
      vi.fn(),
      () => disposed,
      listen,
    );
    disposed = true;
    resolveListener(unlisten);

    await expect(binding).resolves.toBeNull();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});

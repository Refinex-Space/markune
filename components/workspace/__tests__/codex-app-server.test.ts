import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import {
  CodexAppServerClient,
  listenCodexEventsUntilDisposed,
  probeCodexRuntime,
  respondToCodexUserInput,
  startCodexRuntime,
  threadTokenUsageUpdateFromMessage,
  type CodexProtocolMessage,
  type CodexRuntimeInfo,
} from '../codex-app-server';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('CodexAppServerClient', () => {
  it('解析当前线程的上下文用量，并保留累计用量与当前窗口的区别', () => {
    expect(
      threadTokenUsageUpdateFromMessage({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          tokenUsage: {
            total: {
              cachedInputTokens: 90_000,
              inputTokens: 180_000,
              outputTokens: 12_000,
              reasoningOutputTokens: 2_000,
              totalTokens: 300_000,
            },
            last: {
              cachedInputTokens: 40_000,
              inputTokens: 140_000,
              outputTokens: 9_000,
              reasoningOutputTokens: 2_000,
              totalTokens: 151_000,
            },
            modelContextWindow: 258_000,
          },
        },
      }),
    ).toEqual({
      threadId: 'thread-1',
      turnId: 'turn-1',
      tokenUsage: {
        total: expect.objectContaining({ totalTokens: 300_000 }),
        last: expect.objectContaining({ totalTokens: 151_000 }),
        modelContextWindow: 258_000,
      },
    });
  });

  it('拒绝不完整或非法的上下文用量通知', () => {
    for (const message of [
      { method: 'turn/started', params: {} },
      {
        method: 'thread/tokenUsage/updated',
        params: { threadId: '', turnId: 'turn-1', tokenUsage: {} },
      },
      {
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          tokenUsage: {
            total: {
              cachedInputTokens: 0,
              inputTokens: 1,
              outputTokens: 0,
              reasoningOutputTokens: 0,
              totalTokens: 1,
            },
            last: {
              cachedInputTokens: 0,
              inputTokens: 1,
              outputTokens: 0,
              reasoningOutputTokens: 0,
              totalTokens: -1,
            },
            modelContextWindow: 258_000,
          },
        },
      },
    ]) {
      expect(threadTokenUsageUpdateFromMessage(message)).toBeNull();
    }
  });

  it('保留共享 Codex Home 的运行时诊断契约', async () => {
    const runtime: CodexRuntimeInfo = {
      available: true,
      running: false,
      binarySource: 'bundled',
      version: 'codex-cli 0.144.4',
      storageMode: 'sharedCodexHome',
      storageRoot: '/Users/example/.codex',
      message: null,
    };
    vi.mocked(invoke).mockResolvedValue(runtime);

    await expect(probeCodexRuntime()).resolves.toEqual(runtime);
    expect(invoke).toHaveBeenCalledWith('codex_runtime_probe');

    await expect(startCodexRuntime('/workspace')).resolves.toEqual(runtime);
    expect(invoke).toHaveBeenCalledWith('codex_runtime_start', {
      rootPath: '/workspace',
    });
  });

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

  it('通过独立 Tauri 命令提交 opaque 用户问题答案', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await respondToCodexUserInput('request-1', [
      {
        note: '补充说明',
        optionId: 'option:0:1',
        questionId: 'question:0',
      },
    ]);

    expect(invoke).toHaveBeenCalledWith(
      'codex_app_server_respond_user_input',
      {
        requestId: 'request-1',
        answers: [
          {
            note: '补充说明',
            optionId: 'option:0:1',
            questionId: 'question:0',
          },
        ],
      },
    );
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

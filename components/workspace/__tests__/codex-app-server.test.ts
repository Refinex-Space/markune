import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import {
  CodexAppServerClient,
  clearCodexCustomProvider,
  getCodexCustomProvider,
  listenCodexEventsUntilDisposed,
  probeCodexRuntime,
  respondToCodexDynamicTool,
  respondToCodexUserInput,
  setCodexAuthMode,
  setCodexCustomProvider,
  startCodexRuntime,
  threadGoalUpdateFromMessage,
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

  it('解析 Goal 更新与清除通知', () => {
    const goal = {
      createdAt: 100,
      objective: '持续修复问题直到全部测试通过',
      status: 'active',
      threadId: 'thread-1',
      timeUsedSeconds: 12,
      tokenBudget: null,
      tokensUsed: 345,
      updatedAt: 110,
    };

    expect(
      threadGoalUpdateFromMessage({
        method: 'thread/goal/updated',
        params: { goal, threadId: 'thread-1', turnId: 'turn-1' },
      }),
    ).toEqual({
      goal,
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'updated',
    });
    expect(
      threadGoalUpdateFromMessage({
        method: 'thread/goal/cleared',
        params: { threadId: 'thread-1' },
      }),
    ).toEqual({ threadId: 'thread-1', type: 'cleared' });
  });

  it('拒绝 Goal 线程不一致、非法状态与伪造 turn id', () => {
    const goal = {
      createdAt: 100,
      objective: '目标',
      status: 'active',
      threadId: 'thread-1',
      timeUsedSeconds: 0,
      tokenBudget: null,
      tokensUsed: 0,
      updatedAt: 100,
    };
    for (const message of [
      {
        method: 'thread/goal/updated',
        params: { goal, threadId: 'thread-2', turnId: null },
      },
      {
        method: 'thread/goal/updated',
        params: {
          goal: { ...goal, status: 'unknown' },
          threadId: 'thread-1',
          turnId: null,
        },
      },
      {
        method: 'thread/goal/updated',
        params: { goal, threadId: 'thread-1', turnId: 42 },
      },
    ]) {
      expect(threadGoalUpdateFromMessage(message)).toBeNull();
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

  it('通过受控命令读写自定义 provider，且不回传明文 key', async () => {
    const provider = {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      hasApiKey: true,
      enabled: true,
      envKey: 'MADORA_CODEX_PROVIDER_API_KEY',
      providerId: 'madora_custom',
      wireApi: 'responses',
    };
    vi.mocked(invoke).mockResolvedValue(provider);

    await expect(
      setCodexCustomProvider({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5',
        apiKey: 'sk-test',
      }),
    ).resolves.toEqual(provider);
    expect(invoke).toHaveBeenCalledWith('codex_custom_provider_set', {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5',
      apiKey: 'sk-test',
    });
    expect(JSON.stringify(provider)).not.toContain('sk-test');

    await expect(getCodexCustomProvider()).resolves.toEqual(provider);
    expect(invoke).toHaveBeenCalledWith('codex_custom_provider_get');

    await expect(setCodexAuthMode('chatgpt')).resolves.toEqual(provider);
    expect(invoke).toHaveBeenCalledWith('codex_auth_mode_set', {
      mode: 'chatgpt',
    });

    await expect(clearCodexCustomProvider()).resolves.toEqual(provider);
    expect(invoke).toHaveBeenCalledWith('codex_custom_provider_clear');
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

  it('通过独立 Tauri 命令提交动态工具文本和预览图片', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const response = {
      imageDataUrl: 'data:image/webp;base64,UklGRgAAAABXRUJQ',
      success: true,
      text: '{"previewId":"preview-1"}',
    };

    await respondToCodexDynamicTool('tool-1', response);

    expect(invoke).toHaveBeenCalledWith(
      'codex_app_server_respond_dynamic_tool',
      { requestId: 'tool-1', response },
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

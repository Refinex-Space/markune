import { describe, expect, it } from 'vitest';

import { createInitialAiPanelState, reduceAiPanelState } from '../ai-reducer';
import type { AiAgentProfile, AiRuntimeEvent } from '../ai-types';

const profile: AiAgentProfile = {
  capabilities: {
    diff: false,
    models: false,
    readWorkspace: true,
    shell: false,
    slashCommands: false,
    writeWorkspace: false,
  },
  detection: { status: 'available' },
  id: 'fake-echo',
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
};

describe('reduceAiPanelState', () => {
  it('stores profiles and selects the first available profile', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      profiles: [profile],
      type: 'profilesLoaded',
    });

    expect(state.profiles).toEqual([profile]);
    expect(state.selectedProfileId).toBe('fake-echo');
  });

  it('keeps an explicit disabled profile selection from settings', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      profiles: [profile],
      selectedProfileId: null,
      type: 'profilesLoaded',
    });

    expect(state.profiles).toEqual([profile]);
    expect(state.selectedProfileId).toBeNull();
  });

  it('marks the panel connecting before a session starts', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      type: 'connectRequested',
    });

    expect(state.status).toBe('connecting');
    expect(state.error).toBeNull();
  });

  it('stores a started session', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      event: {
        session: {
          profileId: 'fake-echo',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
        type: 'sessionStarted',
      },
      type: 'runtimeEventReceived',
    });

    expect(state.status).toBe('idle');
    expect(state.session?.sessionId).toBe('ai-1');
  });

  it('adds the user message when a prompt is submitted', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      content: '总结此页面',
      id: 'user-1',
      images: [
        {
          base64Data: 'aW1hZ2U=',
          contentHash: 'fnv1a-image',
          filename: 'diagram.png',
          id: 'image-1',
          mediaType: 'image/png',
          size: 5,
        },
      ],
      references: [
        {
          contentHash: 'fnv1a-ref',
          markdown: '# 研究记录',
          modifiedAt: null,
          path: '/repo/notes/research.md',
          relativePath: 'notes/research.md',
          source: 'file',
          title: '研究记录',
        },
      ],
      selection: {
        documentPath: '/repo/guide.md',
        documentTitle: '指南',
        from: 2,
        markdown: '选区',
        to: 4,
      },
      type: 'userMessageSubmitted',
    });

    expect(state.status).toBe('streaming');
    expect(state.messages).toEqual([
      expect.objectContaining({
        content: '总结此页面',
        id: 'user-1',
        role: 'user',
      }),
    ]);
    expect(state.messages[0].references?.[0].title).toBe('研究记录');
    expect(state.messages[0].images?.[0].filename).toBe('diagram.png');
    expect(state.messages[0].selection?.markdown).toBe('选区');
  });

  it('appends assistant deltas and completes the message', () => {
    const started = createInitialAiPanelState();
    const event: AiRuntimeEvent = {
      delta: 'Echo: hello',
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageDelta',
    };
    const withDelta = reduceAiPanelState(started, {
      event,
      type: 'runtimeEventReceived',
    });
    const completed = reduceAiPanelState(withDelta, {
      event: {
        messageId: 'assistant-1',
        sessionId: 'ai-1',
        type: 'messageCompleted',
      },
      type: 'runtimeEventReceived',
    });

    expect(completed.messages).toEqual([
      {
        content: 'Echo: hello',
        id: 'assistant-1',
        role: 'assistant',
      },
    ]);
    expect(completed.status).toBe('idle');
  });

  it('stores runtime errors and leaves streaming state', () => {
    const state = reduceAiPanelState(createInitialAiPanelState(), {
      event: {
        message: '会话不存在',
        sessionId: 'ai-1',
        type: 'error',
      },
      type: 'runtimeEventReceived',
    });

    expect(state.status).toBe('error');
    expect(state.error).toBe('会话不存在');
  });

  it('tracks structured tool calls and permission prompts', () => {
    const started = reduceAiPanelState(createInitialAiPanelState(), {
      event: {
        input: { command: 'pnpm test' },
        sessionId: 'ai-1',
        toolCallId: 'tool-1',
        toolName: 'Bash',
        type: 'toolStarted',
      },
      type: 'runtimeEventReceived',
    });
    const withPermission = reduceAiPanelState(started, {
      event: {
        reason: '需要确认 shell 命令',
        requestId: 'perm-1',
        sessionId: 'ai-1',
        toolCallId: 'tool-1',
        toolInput: { command: 'pnpm test' },
        toolName: 'Bash',
        type: 'permissionPrompt',
      },
      type: 'runtimeEventReceived',
    });
    const completed = reduceAiPanelState(withPermission, {
      event: {
        durationMs: 1200,
        output: { stdout: 'ok' },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-1',
        toolName: 'Bash',
        type: 'toolCompleted',
      },
      type: 'runtimeEventReceived',
    });

    expect(completed.tools).toEqual([
      {
        durationMs: 1200,
        id: 'tool-1',
        input: { command: 'pnpm test' },
        name: 'Bash',
        output: { stdout: 'ok' },
        permissionRequestId: 'perm-1',
        status: 'success',
      },
    ]);
    expect(completed.permissions).toEqual([
      {
        reason: '需要确认 shell 命令',
        requestId: 'perm-1',
        toolCallId: 'tool-1',
        toolInput: { command: 'pnpm test' },
        toolName: 'Bash',
      },
    ]);
  });

  it('stores usage updates and run state transitions', () => {
    const running = reduceAiPanelState(createInitialAiPanelState(), {
      event: {
        sessionId: 'ai-1',
        state: 'running',
        type: 'runState',
      },
      type: 'runtimeEventReceived',
    });
    const withUsage = reduceAiPanelState(running, {
      event: {
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
        inputTokens: 10,
        model: 'gpt-5.5',
        outputTokens: 20,
        sessionId: 'ai-1',
        totalCostUsd: 0,
        type: 'usageUpdated',
      },
      type: 'runtimeEventReceived',
    });
    const completed = reduceAiPanelState(withUsage, {
      event: {
        sessionId: 'ai-1',
        state: 'completed',
        type: 'runState',
      },
      type: 'runtimeEventReceived',
    });

    expect(completed.status).toBe('idle');
    expect(completed.runState).toEqual({ state: 'completed' });
    expect(completed.usage).toEqual({
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      inputTokens: 10,
      model: 'gpt-5.5',
      outputTokens: 20,
      totalCostUsd: 0,
    });
  });

  it('clears session and messages', () => {
    const state = reduceAiPanelState(
      {
        ...createInitialAiPanelState(),
        messages: [{ content: 'x', id: 'm1', role: 'assistant' }],
        runState: { state: 'running' },
        session: {
          profileId: 'fake-echo',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
        tools: [
          {
            id: 'tool-1',
            input: {},
            name: 'Read',
            status: 'running',
          },
        ],
      },
      { type: 'cleared' },
    );

    expect(state.messages).toEqual([]);
    expect(state.session).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.tools).toEqual([]);
    expect(state.runState).toBeNull();
  });
});

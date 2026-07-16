import { describe, expect, it } from 'vitest';

import {
  conversationFromThread,
  createMentionTextElements,
  createThreadTitle,
  createEmptyConversation,
  reduceCodexProtocolMessage,
  threadNameUpdateFromMessage,
} from '../ai-panel-state';

describe('AI panel event reducer', () => {
  it('合并流式助手消息', () => {
    const first = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-1', delta: '你好' },
    });
    const second = reduceCodexProtocolMessage(first, {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-1', delta: '，Madora' },
    });

    expect(second.entries).toEqual([
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        text: '你好，Madora',
      },
    ]);
  });

  it('按消息和工具事件的真实到达顺序组织会话', () => {
    const preamble = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-1', delta: '我先检查工作区。' },
    });
    const toolStarted = reduceCodexProtocolMessage(preamble, {
      method: 'item/started',
      params: {
        item: {
          id: 'tool-1',
          type: 'commandExecution',
          command: 'rg --files',
        },
      },
    });
    const toolCompleted = reduceCodexProtocolMessage(toolStarted, {
      method: 'item/completed',
      params: {
        item: {
          id: 'tool-1',
          type: 'commandExecution',
          command: 'rg --files',
        },
      },
    });
    const finalMessage = reduceCodexProtocolMessage(toolCompleted, {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-2', delta: '检查完成。' },
    });

    expect(finalMessage.entries.map((entry) => entry.id)).toEqual([
      'message-1',
      'tool-1',
      'message-2',
    ]);
    expect(finalMessage.entries[1]).toMatchObject({
      type: 'timeline',
      status: 'completed',
    });
  });

  it('恢复历史任务时保留消息与工具的原始顺序', () => {
    const state = conversationFromThread({
      id: 'thread-1',
      name: '检查工作区',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          items: [
            { id: 'message-1', type: 'agentMessage', text: '我先检查。' },
            {
              id: 'tool-1',
              type: 'commandExecution',
              command: 'rg --files',
            },
            { id: 'message-2', type: 'agentMessage', text: '检查完成。' },
          ],
        },
      ],
    });

    expect(state.entries.map((entry) => entry.id)).toEqual([
      'message-1',
      'tool-1',
      'message-2',
    ]);
  });

  it('从历史用户消息恢复提及的精确文本区间和文件路径', () => {
    const text = '比较 README 与 README';
    const prefix = '比较 README 与 ';
    const start = new TextEncoder().encode(prefix).length;
    const end = new TextEncoder().encode(`${prefix}README`).length;
    const state = conversationFromThread({
      id: 'thread-mention',
      name: '比较文档',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-mention',
          status: 'completed',
          items: [
            {
              id: 'message-mention',
              clientId: 'client-mention',
              type: 'userMessage',
              content: [
                {
                  type: 'text',
                  text,
                  text_elements: [
                    {
                      byteRange: { start, end },
                      placeholder: 'README',
                    },
                  ],
                },
                {
                  type: 'mention',
                  name: 'README',
                  path: '/workspace/README.md',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({
      type: 'message',
      id: 'client-mention',
      text,
      mentions: [
        {
          start: prefix.length,
          end: `${prefix}README`.length,
          label: 'README',
          path: '/workspace/README.md',
        },
      ],
    });
  });

  it('按 UTF-8 字节范围生成 Codex 文本元素', () => {
    const text = '总结一下 Spring AI 基本介绍';
    const prefix = '总结一下 ';

    expect(
      createMentionTextElements(text, [
        {
          start: prefix.length,
          end: text.length,
          label: 'Spring AI 基本介绍',
          path: '/workspace/spring-ai.md',
        },
      ]),
    ).toEqual([
      {
        byteRange: {
          start: new TextEncoder().encode(prefix).length,
          end: new TextEncoder().encode(text).length,
        },
        placeholder: 'Spring AI 基本介绍',
      },
    ]);
  });

  it('把工具调用映射为低噪声时间线', () => {
    const next = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          id: 'tool-1',
          type: 'mcpToolCall',
          server: 'docs',
          tool: 'search',
        },
      },
    });

    expect(next.entries[0]).toMatchObject({
      type: 'timeline',
      id: 'tool-1',
      kind: 'mcp',
      label: '正在调用 MCP 工具',
      status: 'inProgress',
    });
  });

  it('忽略实时和历史任务中的内部 reasoning 摘要', () => {
    const started = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/started',
      params: {
        item: {
          id: 'reasoning-1',
          type: 'reasoning',
          summary: ['Preparing brief Chinese reply'],
        },
      },
    });
    const completed = reduceCodexProtocolMessage(started, {
      method: 'item/completed',
      params: {
        item: {
          id: 'reasoning-1',
          type: 'reasoning',
          summary: ['Preparing brief Chinese reply'],
        },
      },
    });
    const historical = conversationFromThread({
      id: 'thread-1',
      name: null,
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          items: [
            {
              id: 'reasoning-2',
              type: 'reasoning',
              summary: ['Preparing brief Chinese reply'],
            },
          ],
        },
      ],
    });

    expect(completed.entries).toEqual([]);
    expect(historical.entries).toEqual([]);
  });

  it('从首条消息生成标题并解析服务端标题更新', () => {
    expect(createThreadTitle('  总结当前文档\n并指出信息缺口  ')).toBe(
      '总结当前文档 并指出信息缺口',
    );
    expect(
      threadNameUpdateFromMessage({
        method: 'thread/name/updated',
        params: {
          threadId: 'thread-1',
          threadName: '当前文档信息缺口',
        },
      }),
    ).toEqual({ threadId: 'thread-1', name: '当前文档信息缺口' });
  });

  it('保留命令审批请求供用户决定', () => {
    const next = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'approval-1',
      method: 'item/commandExecution/requestApproval',
      params: { command: 'pnpm test:run' },
    });

    expect(next.approvals).toEqual([
      expect.objectContaining({
        id: 'approval-1',
        title: '请求执行工具命令',
        detail: 'pnpm test:run',
      }),
    ]);
  });
});

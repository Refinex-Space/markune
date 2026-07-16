import { describe, expect, it } from 'vitest';

import {
  buildConversationBlocks,
  conversationFromThread,
  createOutputPreview,
  createDocumentAwareUserInput,
  createMentionTextElements,
  createThreadTitle,
  createEmptyConversation,
  getOutputPreviewLines,
  reduceCodexProtocolMessage,
  stripShellWrapper,
  summarizeActivityGroup,
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

  it('把文档标题替换为带引号的工作区相对路径并保留显示标题', () => {
    const text = '总结一下 2026 半年度计划';
    const prefix = '总结一下 ';
    const result = createDocumentAwareUserInput(text, [
      {
        start: prefix.length,
        end: text.length,
        label: '2026 半年度计划',
        path: '/workspace/Planning/2026 半年度计划.md',
        relativePath: 'Planning/2026 半年度计划.md',
      },
    ]);

    expect(result).toEqual({
      text: '总结一下 "Planning/2026 半年度计划.md"',
      textElements: [
        {
          byteRange: {
            start: new TextEncoder().encode(prefix).length,
            end: new TextEncoder().encode(
              '总结一下 "Planning/2026 半年度计划.md"',
            ).length,
          },
          placeholder: '2026 半年度计划',
        },
      ],
    });
  });

  it('按文本顺序转换多个文档并忽略无效或重叠区间', () => {
    const text = '比较 Alpha 和 Beta';
    const result = createDocumentAwareUserInput(text, [
      {
        start: text.indexOf('Beta'),
        end: text.length,
        label: 'Beta',
        path: '/workspace/Beta.md',
        relativePath: 'Docs/Beta.md',
      },
      {
        start: text.indexOf('Alpha'),
        end: text.indexOf('Alpha') + 'Alpha'.length,
        label: 'Alpha',
        path: '/workspace/Alpha.md',
        relativePath: 'Docs/Alpha.md',
      },
      {
        start: text.indexOf('Alpha') + 1,
        end: text.indexOf('Alpha') + 'Alpha'.length,
        label: '重叠',
        path: '/workspace/Overlap.md',
        relativePath: 'Docs/Overlap.md',
      },
      {
        start: -1,
        end: 2,
        label: '无效',
        path: '/workspace/Invalid.md',
        relativePath: '../Invalid.md',
      },
    ]);

    expect(result.text).toBe('比较 "Docs/Alpha.md" 和 "Docs/Beta.md"');
    expect(result.textElements.map((element) => element.placeholder)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('从新格式历史消息恢复标题链接和工作区绝对路径', () => {
    const prefix = '总结 ';
    const reference = '"Planning/2026 半年度计划.md"';
    const text = `${prefix}${reference}`;
    const state = conversationFromThread({
      id: 'thread-document-reference',
      name: '总结计划',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-document-reference',
          status: 'completed',
          items: [
            {
              id: 'message-document-reference',
              type: 'userMessage',
              content: [
                {
                  type: 'text',
                  text,
                  text_elements: [
                    {
                      byteRange: {
                        start: new TextEncoder().encode(prefix).length,
                        end: new TextEncoder().encode(text).length,
                      },
                      placeholder: '2026 半年度计划',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({
      type: 'message',
      text,
      mentions: [
        {
          start: prefix.length,
          end: text.length,
          label: '2026 半年度计划',
          path: '/workspace/Planning/2026 半年度计划.md',
        },
      ],
    });
  });

  it('拒绝从历史文本元素恢复绝对路径或父目录路径', () => {
    const text = '读取 "/etc/passwd" 和 "../secret.md"';
    const firstStart = '读取 '.length;
    const firstEnd = firstStart + '"/etc/passwd"'.length;
    const secondStart = text.indexOf('"../secret.md"');
    const state = conversationFromThread({
      id: 'thread-invalid-reference',
      name: '无效引用',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-invalid-reference',
          status: 'completed',
          items: [
            {
              id: 'message-invalid-reference',
              type: 'userMessage',
              content: [
                {
                  type: 'text',
                  text,
                  text_elements: [
                    {
                      byteRange: {
                        start: new TextEncoder().encode(
                          text.slice(0, firstStart),
                        ).length,
                        end: new TextEncoder().encode(
                          text.slice(0, firstEnd),
                        ).length,
                      },
                      placeholder: '系统文件',
                    },
                    {
                      byteRange: {
                        start: new TextEncoder().encode(
                          text.slice(0, secondStart),
                        ).length,
                        end: new TextEncoder().encode(text).length,
                      },
                      placeholder: '父目录文件',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({ mentions: [] });
  });

  it('从实时用户消息按当前工作区恢复文档链接', () => {
    const prefix = '读取 ';
    const text = `${prefix}"Docs/note.md"`;
    const state = reduceCodexProtocolMessage(
      createEmptyConversation(),
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'message-live-reference',
            type: 'userMessage',
            content: [
              {
                type: 'text',
                text,
                text_elements: [
                  {
                    byteRange: {
                      start: new TextEncoder().encode(prefix).length,
                      end: new TextEncoder().encode(text).length,
                    },
                    placeholder: '工作笔记',
                  },
                ],
              },
            ],
          },
        },
      },
      '/active-workspace',
    );

    expect(state.entries[0]).toMatchObject({
      mentions: [
        {
          label: '工作笔记',
          path: '/active-workspace/Docs/note.md',
        },
      ],
    });
  });

  it('把工具调用映射为语义化时间线', () => {
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
      label: '调用 docs · search',
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
        itemId: null,
        title: '请求执行工具命令',
        detail: 'pnpm test:run',
      }),
    ]);
  });

  it('保留命令语义、实时输出、退出码和耗时，并生成五行首尾预览', () => {
    const started = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        startedAtMs: 1_000,
        item: {
          id: 'command-1',
          type: 'commandExecution',
          command: '/bin/zsh -lc "sed -n \'1,20p\' README.md"',
          cwd: '/workspace',
          status: 'inProgress',
          commandActions: [
            {
              type: 'read',
              command: "sed -n '1,20p' README.md",
              name: 'README.md',
              path: '/workspace/README.md',
            },
          ],
        },
      },
    });
    const streamed = reduceCodexProtocolMessage(started, {
      method: 'item/commandExecution/outputDelta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'command-1',
        delta: '1\n2\n3\n4\n5\n6\n7\n8',
      },
    });
    const completed = reduceCodexProtocolMessage(streamed, {
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        completedAtMs: 2_250,
        item: {
          id: 'command-1',
          type: 'commandExecution',
          command: '/bin/zsh -lc "sed -n \'1,20p\' README.md"',
          cwd: '/workspace',
          status: 'completed',
          commandActions: [
            {
              type: 'read',
              command: "sed -n '1,20p' README.md",
              name: 'README.md',
              path: '/workspace/README.md',
            },
          ],
          exitCode: 0,
          durationMs: 1_250,
        },
      },
    });

    expect(completed.entries[0]).toMatchObject({
      type: 'timeline',
      id: 'command-1',
      turnId: 'turn-1',
      kind: 'command',
      label: '读取 README.md',
      status: 'completed',
      exitCode: 0,
      durationMs: 1_250,
      startedAtMs: 1_000,
    });
    const activity = completed.entries[0];
    if (activity.type !== 'timeline' || activity.kind !== 'command') {
      throw new Error('expected command activity');
    }
    expect(getOutputPreviewLines(activity.output)).toEqual({
      head: ['1', '2'],
      omittedLines: 4,
      tail: ['7', '8'],
    });
  });

  it('隐藏常见 shell 包装并为多活动摘要保留中文数字间距', () => {
    expect(stripShellWrapper('/bin/zsh -c "rg --files -g \'*.md\'"')).toBe(
      "rg --files -g '*.md'",
    );
    expect(
      summarizeActivityGroup([
        commandActivity('command-1'),
        commandActivity('command-2'),
      ]),
    ).toBe('运行了 2 个命令');
  });

  it('按 commentary 和 final_answer 建立独立处理过程', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'inProgress',
          startedAt: 10,
          completedAt: null,
          durationMs: null,
          items: [],
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'commentary-1',
          type: 'agentMessage',
          text: '',
          phase: 'commentary',
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/agentMessage/delta',
      params: {
        turnId: 'turn-1',
        itemId: 'commentary-1',
        delta: '我先读取文件。',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'command-1',
          type: 'commandExecution',
          command: 'rg --files',
          commandActions: [{ type: 'listFiles', command: 'rg --files', path: null }],
          status: 'completed',
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'final-1',
          type: 'agentMessage',
          text: '',
          phase: 'final_answer',
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/agentMessage/delta',
      params: {
        turnId: 'turn-1',
        itemId: 'final-1',
        delta: '读取完成。',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          id: 'turn-1',
          status: 'completed',
          startedAt: 10,
          completedAt: 12,
          durationMs: 2_000,
          items: [],
        },
      },
    });

    const blocks = buildConversationBlocks(state);
    expect(blocks.map((block) => block.type)).toEqual(['trace', 'message']);
    expect(blocks[0]).toMatchObject({
      type: 'trace',
      turnId: 'turn-1',
      durationMs: 2_000,
      historical: false,
      segments: [
        { type: 'commentary', message: { text: '我先读取文件。' } },
        { type: 'group', activities: [{ id: 'command-1' }] },
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: 'message',
      role: 'assistant',
      phase: 'final_answer',
      text: '读取完成。',
    });
  });

  it('归并文件补丁、MCP 进度和上下文压缩事件', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/started',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'file-1',
          type: 'fileChange',
          status: 'inProgress',
          changes: [],
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/fileChange/patchUpdated',
      params: {
        turnId: 'turn-1',
        itemId: 'file-1',
        changes: [
          {
            path: 'README.md',
            kind: { type: 'update', move_path: null },
            diff: '+hello\n-old',
          },
        ],
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'mcp-1',
          type: 'mcpToolCall',
          server: 'context7',
          tool: 'query-docs',
          status: 'inProgress',
          arguments: { topic: 'Codex' },
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/mcpToolCall/progress',
      params: {
        turnId: 'turn-1',
        itemId: 'mcp-1',
        message: '正在查询官方文档',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'file-1',
          type: 'fileChange',
          status: 'completed',
          changes: [],
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'mcp-1',
          type: 'mcpToolCall',
          server: 'context7',
          tool: 'query-docs',
          status: 'completed',
          result: { ok: true },
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'thread/compacted',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'context-item-1',
          type: 'contextCompaction',
        },
      },
    });

    expect(state.entries).toEqual([
      expect.objectContaining({
        id: 'file-1',
        kind: 'file',
        changes: [expect.objectContaining({ path: 'README.md', additions: 1, deletions: 1 })],
      }),
      expect.objectContaining({
        id: 'mcp-1',
        kind: 'mcp',
        status: 'completed',
        progress: '正在查询官方文档',
      }),
      expect.objectContaining({
        id: 'context-turn-1',
        kind: 'context',
      }),
    ]);
  });

  it('为混合活动生成 Codex 式中文摘要', () => {
    expect(
      summarizeActivityGroup([
        {
          type: 'timeline',
          id: 'file-1',
          turnId: 'turn-1',
          kind: 'file',
          label: '编辑 README.md',
          status: 'completed',
          changes: [],
          durationMs: null,
          startedAtMs: null,
          completedAtMs: null,
        },
        {
          type: 'timeline',
          id: 'command-1',
          turnId: 'turn-1',
          kind: 'command',
          label: '运行 pnpm test:run',
          status: 'completed',
          actions: [],
          command: 'pnpm test:run',
          cwd: '/workspace',
          output: createOutputPreview(''),
          exitCode: 0,
          durationMs: 100,
          startedAtMs: null,
          completedAtMs: null,
          terminalInputs: [],
        },
      ]),
    ).toBe('编辑了文件并运行了命令');
  });

  it('把审批关联到具体 turn 和 item，并只保留 bridge 支持的决定', () => {
    const next = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'approval-2',
      method: 'item/commandExecution/requestApproval',
      params: {
        turnId: 'turn-1',
        itemId: 'command-1',
        command: 'pnpm test:run',
        availableDecisions: [
          'accept',
          'acceptForSession',
          { acceptWithExecpolicyAmendment: {} },
          'decline',
        ],
      },
    });

    expect(next.approvals[0]).toMatchObject({
      turnId: 'turn-1',
      itemId: 'command-1',
      decisions: ['accept', 'acceptForSession', 'decline'],
    });

    const unsupported = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'approval-3',
      method: 'item/commandExecution/requestApproval',
      params: {
        availableDecisions: [{ acceptWithExecpolicyAmendment: {} }],
      },
    });
    expect(unsupported.approvals[0].decisions).toEqual([]);
  });
});

function commandActivity(id: string) {
  return {
    type: 'timeline' as const,
    id,
    turnId: 'turn-1',
    kind: 'command' as const,
    label: '运行命令',
    status: 'completed' as const,
    actions: [],
    command: 'pnpm test:run',
    cwd: '/workspace',
    output: createOutputPreview(''),
    exitCode: 0,
    durationMs: 100,
    startedAtMs: null,
    completedAtMs: null,
    terminalInputs: [],
  };
}

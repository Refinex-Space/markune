import { describe, expect, it } from 'vitest';

import {
  buildConversationBlocks,
  conversationFromThread,
  createComposerAwareUserInput,
  createDrawingMentionPath,
  createOutputPreview,
  createDocumentAwareUserInput,
  createMentionTextElements,
  createThreadTitle,
  createEmptyConversation,
  getOutputPreviewLines,
  isPaginatedThreadsUnsupportedError,
  paginatedThreadUnsupportedMessage,
  reduceCodexProtocolMessage,
  selectActiveTaskProgress,
  stripShellWrapper,
  summarizeActivityGroup,
  threadNameUpdateFromMessage,
  workspaceChangeEventFromProtocolMessage,
} from '../ai-panel-state';

describe('AI panel event reducer', () => {
  it('在活动 turn 尚无 item 时立即生成等待响应的处理轨迹', () => {
    const state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: {
        turn: { id: 'turn-waiting', status: 'inProgress', startedAt: 10 },
      },
    });

    expect(buildConversationBlocks(state)).toContainEqual(
      expect.objectContaining({
        id: 'trace-turn-waiting',
        segments: [],
        status: 'inProgress',
        turnId: 'turn-waiting',
        type: 'trace',
      }),
    );
  });

  it('投影 Codex 自动重试通知，并在恢复响应或最终失败时更新状态', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-error', status: 'inProgress' },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'error',
      params: {
        error: {
          additionalDetails: 'upstream unavailable',
          codexErrorInfo: 'serverOverloaded',
          message: 'server is overloaded',
        },
        threadId: 'thread-1',
        turnId: 'turn-error',
        willRetry: true,
      },
    });

    expect(state.turns['turn-error'].error).toEqual({
      additionalDetails: 'upstream unavailable',
      codexErrorInfo: 'serverOverloaded',
      message: 'server is overloaded',
      willRetry: true,
    });
    expect(buildConversationBlocks(state)).toContainEqual(
      expect.objectContaining({
        status: 'retrying',
        turnId: 'turn-error',
        type: 'turnError',
      }),
    );

    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        item: { id: 'message-recovered', text: '', type: 'agentMessage' },
        turnId: 'turn-error',
      },
    });
    expect(state.turns['turn-error'].error).toBeNull();

    state = reduceCodexProtocolMessage(state, {
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: {
          error: {
            additionalDetails: null,
            codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } },
            message: 'stream disconnected',
          },
          id: 'turn-error',
          status: 'failed',
        },
      },
    });

    expect(state.turns['turn-error']).toMatchObject({
      error: {
        message: 'stream disconnected',
        willRetry: false,
      },
      status: 'failed',
    });
    expect(buildConversationBlocks(state)).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        turnId: 'turn-error',
        type: 'turnError',
      }),
    );
  });

  it('恢复历史失败 turn 的错误，并为缺少详情的失败提供兜底', () => {
    const withError = conversationFromThread({
      createdAt: 0,
      cwd: '/workspace',
      id: 'thread-error',
      name: '失败任务',
      preview: '',
      status: 'idle',
      turns: [
        {
          error: {
            additionalDetails: 'request id: req-1',
            codexErrorInfo: 'usageLimitExceeded',
            message: 'usage limit exceeded',
          },
          id: 'turn-history-error',
          items: [],
          status: 'failed',
        },
      ],
      updatedAt: 0,
    });
    const withoutError = conversationFromThread({
      createdAt: 0,
      cwd: '/workspace',
      id: 'thread-fallback',
      name: '旧任务',
      preview: '',
      status: 'idle',
      turns: [{ id: 'turn-no-error', items: [], status: 'failed' }],
      updatedAt: 0,
    });

    expect(buildConversationBlocks(withError)).toContainEqual(
      expect.objectContaining({
        message: 'usage limit exceeded',
        status: 'failed',
        type: 'turnError',
      }),
    );
    expect(buildConversationBlocks(withoutError)).toContainEqual(
      expect.objectContaining({
        message: 'Codex 未能完成本次响应。',
        status: 'failed',
        type: 'turnError',
      }),
    );
  });

  it('合并流式助手消息', () => {
    const first = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-1', delta: '你好' },
    });
    const second = reduceCodexProtocolMessage(first, {
      method: 'item/agentMessage/delta',
      params: { itemId: 'message-1', delta: '，Markune' },
    });

    expect(second.entries).toEqual([
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        text: '你好，Markune',
      },
    ]);
  });

  it('记录用户发送与助手完成事件的消息时间', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/completed',
      params: {
        completedAtMs: 1_000,
        item: {
          content: [{ type: 'text', text: '请检查工作区' }],
          id: 'user-message',
          type: 'userMessage',
        },
        turnId: 'turn-1',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        item: { id: 'assistant-message', text: '', type: 'agentMessage' },
        startedAtMs: 1_100,
        turnId: 'turn-1',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        completedAtMs: 1_500,
        item: {
          id: 'assistant-message',
          text: '检查完成',
          type: 'agentMessage',
        },
        turnId: 'turn-1',
      },
    });

    expect(state.entries).toEqual([
      expect.objectContaining({
        createdAtMs: 1_000,
        id: 'user-message',
        role: 'user',
      }),
      expect.objectContaining({
        createdAtMs: 1_500,
        id: 'assistant-message',
        role: 'assistant',
      }),
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

  it('将正式计划作为独立结果流式展示并以 completed 内容为准', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: { turn: { id: 'turn-plan', status: 'inProgress' } },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        turnId: 'turn-plan',
        item: { id: 'proposal-1', type: 'plan', text: '' },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/plan/delta',
      params: {
        turnId: 'turn-plan',
        itemId: 'proposal-1',
        delta: '# 初稿',
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-plan',
        item: { id: 'proposal-1', type: 'plan', text: '# 权威计划\n\n1. 实施' },
      },
    });

    expect(state.entries).toContainEqual({
      type: 'proposedPlan',
      historical: false,
      id: 'proposal-1',
      status: 'completed',
      text: '# 权威计划\n\n1. 实施',
      turnId: 'turn-plan',
    });
    expect(buildConversationBlocks(state)).toContainEqual(
      expect.objectContaining({ type: 'proposedPlan', id: 'proposal-1' }),
    );
  });

  it('恢复历史任务时保留正式计划但不把它混入执行清单', () => {
    const state = conversationFromThread({
      id: 'thread-plan',
      name: '计划',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [{
        id: 'turn-plan',
        status: 'completed',
        items: [{ id: 'proposal-1', type: 'plan', text: '历史计划' }],
      }],
    });

    expect(state.entries).toEqual([{
      type: 'proposedPlan',
      historical: true,
      id: 'proposal-1',
      status: 'completed',
      text: '历史计划',
      turnId: 'turn-plan',
    }]);
  });

  it('从活跃 turn 的执行清单和聚合 diff 派生任务进度', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: { turn: { id: 'turn-task', status: 'inProgress' } },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/plan/updated',
      params: {
        turnId: 'turn-task',
        explanation: '先完成状态投影，再实现交互。',
        plan: [
          { step: '核对协议事件', status: 'completed' },
          { step: '实现状态选择器', status: 'inProgress' },
          { step: '补充交互测试', status: 'pending' },
        ],
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/diff/updated',
      params: {
        turnId: 'turn-task',
        diff: [
          'diff --git a/components/a.tsx b/components/a.tsx',
          '--- a/components/a.tsx',
          '+++ b/components/a.tsx',
          '@@ -1 +1,2 @@',
          '-旧内容',
          '+新内容',
          '+补充内容',
          'diff --git a/components/b.ts b/components/b.ts',
          '--- /dev/null',
          '+++ b/components/b.ts',
          '@@ -0,0 +1 @@',
          '+新增文件',
        ].join('\n'),
      },
    });

    expect(selectActiveTaskProgress(state, '/workspace')).toEqual({
      additions: 3,
      completedSteps: 1,
      currentStepNumber: 2,
      deletions: 1,
      explanation: '先完成状态投影，再实现交互。',
      fileCount: 2,
      steps: [
        { step: '核对协议事件', status: 'completed' },
        { step: '实现状态选择器', status: 'inProgress' },
        { step: '补充交互测试', status: 'pending' },
      ],
      totalSteps: 3,
      turnId: 'turn-task',
    });
  });

  it('执行清单使用最新完整快照，并在 turn 结束后停止展示', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: { turn: { id: 'turn-task', status: 'inProgress' } },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/plan/updated',
      params: {
        turnId: 'turn-task',
        plan: [
          { step: '旧步骤', status: 'inProgress' },
          { step: '旧待办', status: 'pending' },
        ],
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/plan/updated',
      params: {
        turnId: 'turn-task',
        plan: [
          { step: '新步骤一', status: 'completed' },
          { step: '新步骤二', status: 'completed' },
        ],
      },
    });

    expect(selectActiveTaskProgress(state)).toMatchObject({
      completedSteps: 2,
      currentStepNumber: 2,
      steps: [
        { step: '新步骤一', status: 'completed' },
        { step: '新步骤二', status: 'completed' },
      ],
      totalSteps: 2,
    });

    state = reduceCodexProtocolMessage(state, {
      method: 'turn/completed',
      params: { turn: { id: 'turn-task', status: 'completed' } },
    });

    expect(selectActiveTaskProgress(state)).toBeNull();
  });

  it('接收安全化用户问题并在服务端确认后清理', () => {
    const pending = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'input-1',
      method: 'item/tool/requestUserInput',
      params: {
        turnId: 'turn-plan',
        itemId: 'call-1',
        markuneUserInput: {
          autoResolutionMs: 60000,
          questions: [{
            id: 'question:0',
            header: '范围',
            question: '请选择实现范围',
            isSecret: false,
            options: [
              { id: 'option:0:0', label: '完整', description: '实现全部能力', isOther: false },
              { id: 'option:0:1', label: '精简', description: '仅实现核心能力', isOther: false },
            ],
          }],
        },
      },
    });
    expect(pending.userInputRequests).toEqual([
      expect.objectContaining({
        id: 'input-1',
        itemId: 'call-1',
        turnId: 'turn-plan',
      }),
    ]);

    const resolved = reduceCodexProtocolMessage(pending, {
      method: 'serverRequest/resolved',
      params: { requestId: 'input-1' },
    });
    expect(resolved.userInputRequests).toEqual([]);
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

  it('同时编码文档与插件提及并保留原生插件令牌', () => {
    const text = '用 2026 计划 配合 OpenAI Docs 检查';
    const documentStart = text.indexOf('2026 计划');
    const pluginStart = text.indexOf('OpenAI Docs');
    const result = createComposerAwareUserInput(
      text,
      [
        {
          start: documentStart,
          end: documentStart + '2026 计划'.length,
          label: '2026 计划',
          path: '/workspace/Planning/2026.md',
          relativePath: 'Planning/2026.md',
        },
      ],
      [
        {
          start: pluginStart,
          end: pluginStart + 'OpenAI Docs'.length,
          label: 'OpenAI Docs',
          name: 'OpenAI Docs',
          path: 'plugin://openai-docs',
        },
      ],
    );

    expect(result.text).toBe(
      '用 "Planning/2026.md" 配合 @OpenAI Docs 检查',
    );
    expect(result.textElements.map((element) => element.placeholder)).toEqual([
      '2026 计划',
      'OpenAI Docs',
    ]);
  });

  it('把 Skill 展示标签编码为原生 $Skill 令牌', () => {
    const text = '使用 Design QA 检查页面';
    const skillStart = text.indexOf('Design QA');
    const result = createComposerAwareUserInput(
      text,
      [],
      [],
      [
        {
          start: skillStart,
          end: skillStart + 'Design QA'.length,
          kind: 'skill',
          label: 'Design QA',
          name: 'design-qa',
          path: '/Users/example/.codex/skills/design-qa/SKILL.md',
        },
      ],
    );

    expect(result).toEqual({
      text: '使用 $design-qa 检查页面',
      textElements: [
        {
          byteRange: {
            start: new TextEncoder().encode('使用 ').length,
            end: new TextEncoder().encode('使用 $design-qa').length,
          },
          placeholder: 'Design QA',
        },
      ],
    });
  });

  it('把图稿提及编码为稳定 Drawing URI 并保留显示标题', () => {
    const drawingId = '11111111-1111-4111-8111-111111111111';
    const text = '分析 Spring Cloud 架构 的连线';
    const start = text.indexOf('Spring Cloud 架构');
    const path = createDrawingMentionPath(drawingId);
    const result = createComposerAwareUserInput(text, [], [], [], [
      {
        drawingId,
        end: start + 'Spring Cloud 架构'.length,
        kind: 'drawing',
        label: 'Spring Cloud 架构',
        path,
        start,
      },
    ]);

    expect(result.text).toBe(`分析 ${path} 的连线`);
    expect(result.textElements).toEqual([
      {
        byteRange: {
          start: new TextEncoder().encode('分析 ').length,
          end: new TextEncoder().encode(`分析 ${path}`).length,
        },
        placeholder: 'Spring Cloud 架构',
      },
    ]);
  });

  it('从历史消息隐藏原生附件头并恢复附件和插件提及', () => {
    const prefix =
      '# Files mentioned by the user:\n\n' +
      '## notes.txt: /outside/notes.txt\n\n' +
      '## My request for Codex:\n';
    const request = '请用 @OpenAI Docs 总结';
    const pluginStart = request.indexOf('@OpenAI Docs');
    const state = conversationFromThread({
      id: 'thread-attachments',
      name: '附件测试',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-attachments',
          status: 'completed',
          items: [
            {
              id: 'message-attachments',
              type: 'userMessage',
              content: [
                {
                  type: 'text',
                  text: `${prefix}${request}`,
                  text_elements: [
                    {
                      byteRange: { start: 0, end: 1 },
                      placeholder: 'markune:attachment:file:notes.txt',
                    },
                    {
                      byteRange: {
                        start:
                          new TextEncoder().encode(prefix).length +
                          new TextEncoder().encode(
                            request.slice(0, pluginStart),
                          ).length,
                        end:
                          new TextEncoder().encode(prefix).length +
                          new TextEncoder().encode(
                            request.slice(
                              0,
                              pluginStart + '@OpenAI Docs'.length,
                            ),
                          ).length,
                      },
                      placeholder: '@OpenAI Docs',
                    },
                  ],
                },
                {
                  type: 'mention',
                  name: 'OpenAI Docs',
                  path: 'plugin://openai-docs',
                },
                { type: 'localImage', path: '/outside/diagram.png' },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({
      attachments: [
        { kind: 'image', name: 'diagram.png' },
        { kind: 'file', name: 'notes.txt' },
      ],
      text: request,
      mentions: [
        {
          kind: 'plugin',
          label: '@OpenAI Docs',
          path: 'plugin://openai-docs',
        },
      ],
    });
  });

  it('从历史消息恢复内联图片预览并安全降级旧 localImage', () => {
    const imageUrl = 'data:image/png;base64,aW1hZ2U=';
    const state = conversationFromThread({
      id: 'thread-images',
      name: '图片附件',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-images',
          status: 'completed',
          items: [
            {
              id: 'message-images',
              type: 'userMessage',
              content: [
                { type: 'image', url: imageUrl },
                { type: 'localImage', path: '/private/legacy.webp' },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({
      attachments: [
        {
          kind: 'image',
          mediaType: 'image/png',
          name: '图片 1',
          previewUrl: imageUrl,
        },
        {
          kind: 'image',
          name: 'legacy.webp',
          previewUrl: null,
        },
      ],
    });
  });

  it('从历史用户消息恢复 Skill 展示标签和原生路径', () => {
    const text = '使用 $design-qa 检查页面';
    const skillStart = text.indexOf('$design-qa');
    const state = conversationFromThread({
      id: 'thread-skill',
      name: 'Skill 测试',
      preview: '',
      createdAt: 0,
      updatedAt: 0,
      cwd: '/workspace',
      status: {},
      turns: [
        {
          id: 'turn-skill',
          status: 'completed',
          items: [
            {
              id: 'message-skill',
              type: 'userMessage',
              content: [
                {
                  type: 'text',
                  text,
                  text_elements: [
                    {
                      byteRange: {
                        start: new TextEncoder().encode(text.slice(0, skillStart)).length,
                        end: new TextEncoder().encode(
                          text.slice(0, skillStart + '$design-qa'.length),
                        ).length,
                      },
                      placeholder: 'Design QA',
                    },
                  ],
                },
                {
                  type: 'skill',
                  name: 'design-qa',
                  path: '/Users/example/.codex/skills/design-qa/SKILL.md',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(state.entries[0]).toMatchObject({
      text,
      mentions: [
        {
          kind: 'skill',
          label: 'Design QA',
          path: '/Users/example/.codex/skills/design-qa/SKILL.md',
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
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        id: 'context-turn-1',
        kind: 'context',
        label: '上下文已压缩',
        status: 'completed',
      }),
    );
    state = reduceCodexProtocolMessage(state, {
      method: 'item/started',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'context-item-1',
          type: 'contextCompaction',
        },
      },
    });
    expect(state.entries).toContainEqual(
      expect.objectContaining({
        id: 'context-turn-1',
        kind: 'context',
        label: '正在压缩上下文',
        status: 'inProgress',
      }),
    );
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
        label: '上下文已压缩',
        status: 'completed',
      }),
    ]);
  });

  it('只把成功完成的文件修改投影为工作区刷新事件', () => {
    expect(
      workspaceChangeEventFromProtocolMessage(
        {
          method: 'item/completed',
          params: {
            turnId: 'turn-1',
            item: {
              id: 'file-1',
              type: 'fileChange',
              status: 'completed',
              changes: [
                {
                  path: 'docs/README.md',
                  kind: { type: 'update', move_path: null },
                  diff: '+new\n-old',
                },
              ],
            },
          },
        },
        '/workspace',
      ),
    ).toEqual({
      type: 'fileChangesCompleted',
      turnId: 'turn-1',
      changes: [
        expect.objectContaining({
          absolutePath: '/workspace/docs/README.md',
          additions: 1,
          deletions: 1,
          path: 'docs/README.md',
        }),
      ],
    });

    expect(
      workspaceChangeEventFromProtocolMessage(
        {
          method: 'item/completed',
          params: {
            turnId: 'turn-1',
            item: {
              id: 'file-2',
              type: 'fileChange',
              status: 'failed',
              changes: [{ path: 'README.md', kind: { type: 'update' } }],
            },
          },
        },
        '/workspace',
      ),
    ).toBeNull();

    expect(
      workspaceChangeEventFromProtocolMessage({
        method: 'turn/completed',
        params: { turn: { id: 'turn-1', status: 'completed' } },
      }),
    ).toEqual({ type: 'turnCompleted', turnId: 'turn-1' });
  });

  it('完成 turn 后保留聚合 diff 并在最终回答后生成净文件变更摘要', () => {
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: {
        turn: { id: 'turn-1', status: 'inProgress', startedAt: 10 },
      },
    });
    state = reduceCodexProtocolMessage(
      state,
      {
        method: 'item/completed',
        params: {
          turnId: 'turn-1',
          item: {
            id: 'file-1',
            type: 'fileChange',
            status: 'completed',
            changes: [
              {
                path: 'docs/计划.md',
                kind: { type: 'update', move_path: null },
                diff: '+intermediate',
              },
            ],
          },
        },
      },
      '/workspace',
    );
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/diff/updated',
      params: {
        turnId: 'turn-1',
        diff: [
          'diff --git a/docs/计划.md b/docs/计划.md',
          '--- a/docs/计划.md',
          '+++ b/docs/计划.md',
          '@@ -1,2 +1,3 @@',
          '-旧内容',
          '+新内容',
          '+补充内容',
        ].join('\n'),
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'final-1',
          type: 'agentMessage',
          phase: 'final_answer',
          text: '已完成修改。',
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/completed',
      params: {
        turn: {
          id: 'turn-1',
          status: 'completed',
          startedAt: 10,
          completedAt: 12,
          durationMs: 2_000,
        },
      },
    });

    expect(state.turns['turn-1'].diff).toContain('docs/计划.md');
    expect(buildConversationBlocks(state)).toEqual([
      expect.objectContaining({ type: 'trace', turnId: 'turn-1' }),
      expect.objectContaining({
        type: 'message',
        id: 'final-1',
        text: '已完成修改。',
      }),
      expect.objectContaining({
        type: 'changes',
        turnId: 'turn-1',
        additions: 2,
        deletions: 1,
        changes: [
          expect.objectContaining({
            absolutePath: '/workspace/docs/计划.md',
            additions: 2,
            deletions: 1,
            path: 'docs/计划.md',
          }),
        ],
      }),
    ]);
  });

  it('把同一工作区文件的绝对路径与相对路径合并为一条变更摘要', () => {
    const workspaceRoot = '/Users/refinex/develop/refinex-vault';
    const absolutePath = `${workspaceRoot}/软件合集/Octarine.md`;
    let state = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'turn/started',
      params: {
        turn: { id: 'turn-1', status: 'inProgress', startedAt: 10 },
      },
    });
    state = reduceCodexProtocolMessage(
      state,
      {
        method: 'item/completed',
        params: {
          turnId: 'turn-1',
          item: {
            id: 'file-1',
            type: 'fileChange',
            status: 'completed',
            changes: [
              {
                path: absolutePath,
                kind: { type: 'update', move_path: null },
                diff: '-官方网址：\n+官网地址：',
              },
            ],
          },
        },
      },
      workspaceRoot,
    );
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/diff/updated',
      params: {
        turnId: 'turn-1',
        diff: [
          'diff --git a/软件合集/Octarine.md b/软件合集/Octarine.md',
          '--- a/软件合集/Octarine.md',
          '+++ b/软件合集/Octarine.md',
          '@@ -1 +1 @@',
          '-官方网址：',
          '+官网地址：',
        ].join('\n'),
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'item/completed',
      params: {
        turnId: 'turn-1',
        item: {
          id: 'final-1',
          type: 'agentMessage',
          phase: 'final_answer',
          text: '已完成修改。',
        },
      },
    });
    state = reduceCodexProtocolMessage(state, {
      method: 'turn/completed',
      params: {
        turn: {
          id: 'turn-1',
          status: 'completed',
          startedAt: 10,
          completedAt: 12,
          durationMs: 2_000,
        },
      },
    });

    const changesBlock = buildConversationBlocks(state).find(
      (block) => block.type === 'changes',
    );

    expect(changesBlock).toEqual(
      expect.objectContaining({
        additions: 1,
        deletions: 1,
        changes: [
          expect.objectContaining({
            absolutePath,
            additions: 1,
            deletions: 1,
            path: '软件合集/Octarine.md',
          }),
        ],
      }),
    );
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

  it('把审批关联到具体 turn 和 item，并保留拒绝与结构化服务端决定', () => {
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
    });
    expect(next.approvals[0].choices.map((choice) => choice.kind)).toEqual([
      'accept',
      'acceptForSession',
      'acceptWithExecpolicyAmendment',
      'decline',
    ]);

    const structured = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'approval-3',
      method: 'item/commandExecution/requestApproval',
      params: {
        availableDecisions: [{ acceptWithExecpolicyAmendment: {} }],
      },
    });
    expect(structured.approvals[0].choices).toEqual([
      expect.objectContaining({
        id: 'candidate:0',
        kind: 'acceptWithExecpolicyAmendment',
      }),
    ]);
  });

  it('使用 bridge 提供的不透明权限审批选项并展示请求范围', () => {
    const next = reduceCodexProtocolMessage(createEmptyConversation(), {
      id: 'permission-1',
      method: 'item/permissions/requestApproval',
      params: {
        itemId: 'permission-item',
        turnId: 'turn-1',
        permissions: {
          network: { enabled: true },
          fileSystem: {
            entries: [{ access: 'write', path: { type: 'path', path: '/tmp' } }],
          },
        },
        markuneApprovalChoices: [
          {
            id: 'permissions:turn',
            kind: 'grantPermissionsForTurn',
            label: '允许本次操作',
            description: '仅授予当前 turn',
          },
          {
            id: 'permissions:deny',
            kind: 'denyPermissions',
            label: '拒绝',
            description: '不授予额外权限',
          },
        ],
      },
    });

    expect(next.approvals[0]).toMatchObject({
      title: '请求扩展操作权限',
      detail: expect.stringContaining('访问互联网'),
      choices: [
        expect.objectContaining({ id: 'permissions:turn' }),
        expect.objectContaining({ id: 'permissions:deny' }),
      ],
    });
  });

  it('把自动审批审查的风险与结果放入处理时间线', () => {
    const started = reduceCodexProtocolMessage(createEmptyConversation(), {
      method: 'item/autoApprovalReview/started',
      params: {
        reviewId: 'review-1',
        turnId: 'turn-1',
        startedAtMs: 1_000,
        review: { status: 'inProgress', riskLevel: 'medium' },
      },
    });
    const completed = reduceCodexProtocolMessage(started, {
      method: 'item/autoApprovalReview/completed',
      params: {
        reviewId: 'review-1',
        turnId: 'turn-1',
        startedAtMs: 1_000,
        completedAtMs: 2_500,
        review: {
          status: 'denied',
          riskLevel: 'high',
          rationale: '目标路径超出工作区',
        },
      },
    });

    expect(completed.entries).toContainEqual(
      expect.objectContaining({
        id: 'auto-review-review-1',
        label: '自动审查已拒绝操作',
        status: 'declined',
        durationMs: 1_500,
        detail: '风险：高 · 目标路径超出工作区',
      }),
    );
  });

  it('识别分页历史尚未支持的 App Server 错误', () => {
    expect(
      isPaginatedThreadsUnsupportedError(
        new Error('paginated_threads is not supported yet'),
      ),
    ).toBe(true);
    expect(isPaginatedThreadsUnsupportedError(new Error('thread missing'))).toBe(
      false,
    );
    expect(paginatedThreadUnsupportedMessage()).toContain('分页历史');
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

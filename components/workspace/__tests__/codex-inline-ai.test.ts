import type {
  MarkweaveAiEditController,
  MarkweaveAiEditContext,
  MarkweaveAskAiRequest,
} from '@markweave/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  CodexProtocolMessage,
  CodexReasoningEffort,
} from '../codex-app-server';
import {
  buildCodexInlineAiPrompt,
  CodexInlineAiRunner,
  isCodexInlineAiProtocolMessage,
  isCodexInlineAiThread,
  shouldRouteCodexMessageToVisibleThread,
  streamCodexInlineAiProposal,
} from '../codex-inline-ai';

class FakeCodexClient {
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  private subscribers = new Set<(message: CodexProtocolMessage) => void>();
  turnStarted?: () => void;
  turnStartError?: Error;

  request = vi.fn(
    async <T>(method: string, params: Record<string, unknown> = {}) => {
      this.calls.push({ method, params });
      if (method === 'thread/start') {
        return {
          thread: {
            createdAt: 1,
            cwd: '/vault',
            id: 'inline-thread',
            name: null,
            preview: '',
            status: {},
            turns: [],
            updatedAt: 1,
          },
        } as T;
      }
      if (method === 'turn/start') {
        if (this.turnStartError) throw this.turnStartError;
        setTimeout(() => this.turnStarted?.(), 0);
        return { turn: { id: 'inline-turn' } } as T;
      }
      return undefined as T;
    },
  );

  subscribe(subscriber: (message: CodexProtocolMessage) => void) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  emit(message: CodexProtocolMessage) {
    for (const subscriber of this.subscribers) subscriber(message);
  }
}

function createRunner(client: FakeCodexClient) {
  return new CodexInlineAiRunner({
    client,
    getRuntime: () => ({
      effort: 'high' as CodexReasoningEffort,
      model: 'gpt-test',
      workspaceRootPath: '/vault',
    }),
  });
}

function textRequest(signal = new AbortController().signal): MarkweaveAskAiRequest {
  return {
    id: 'request-1',
    lang: 'zh',
    outputFormat: 'markdown',
    prompt: '改写得更清楚',
    selection: {
      from: 12,
      html: '<p>原文</p>',
      text: '原文',
      to: 14,
    },
    signal,
    target: { kind: 'text' },
  };
}

async function collect(iterable: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

async function* chunks(...values: string[]) {
  for (const value of values) yield value;
}

describe('CodexInlineAiRunner', () => {
  it('向 Markweave 提交累计流式 Markdown 并以 complete 结束', async () => {
    const updateProposal = vi.fn(() => ({
      ok: true as const,
      value: { context: null, error: null, phase: 'streaming', proposal: null },
    }));
    const controller = { updateProposal } as unknown as MarkweaveAiEditController;
    const context: MarkweaveAiEditContext = {
      id: 'proposal-1',
      lang: 'zh',
      selection: {
        from: 1,
        html: '<p>原文</p>',
        markdown: '原文',
        text: '原文',
        to: 3,
      },
      signal: new AbortController().signal,
    };

    await streamCodexInlineAiProposal(
      controller,
      context,
      chunks('改写', '结果'),
    );

    expect(updateProposal.mock.calls).toEqual([
      [
        {
          contextId: 'proposal-1',
          markdown: '改写',
          status: 'streaming',
        },
      ],
      [
        {
          contextId: 'proposal-1',
          markdown: '改写结果',
          status: 'streaming',
        },
      ],
      [
        {
          contextId: 'proposal-1',
          markdown: '改写结果',
          status: 'complete',
        },
      ],
    ]);
  });

  it('Markweave 报告目标冲突后停止消费后续提案', async () => {
    const updateProposal = vi.fn(() => ({
      code: 'conflict' as const,
      message: 'selection changed',
      ok: false as const,
    }));
    const controller = { updateProposal } as unknown as MarkweaveAiEditController;
    const context: MarkweaveAiEditContext = {
      id: 'proposal-conflict',
      lang: 'zh',
      selection: {
        from: 1,
        html: '<p>原文</p>',
        markdown: '原文',
        text: '原文',
        to: 3,
      },
      signal: new AbortController().signal,
    };

    await expect(
      streamCodexInlineAiProposal(
        controller,
        context,
        chunks('第一个', '第二个'),
      ),
    ).resolves.toMatchObject({ code: 'conflict', ok: false });
    expect(updateProposal).toHaveBeenCalledOnce();
  });

  it('只向只读 ephemeral 线程发送目标并仅转发 final_answer', async () => {
    const client = new FakeCodexClient();
    const runner = createRunner(client);
    client.turnStarted = () => {
      expect(isCodexInlineAiThread('inline-thread')).toBe(true);
      client.emit({
        method: 'item/started',
        params: {
          item: { id: 'commentary', phase: 'commentary', type: 'agentMessage' },
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'item/agentMessage/delta',
        params: {
          delta: '分析过程',
          itemId: 'commentary',
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'item/started',
        params: {
          item: { id: 'final', phase: 'final_answer', type: 'agentMessage' },
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'item/agentMessage/delta',
        params: {
          delta: '改写',
          itemId: 'final',
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'item/agentMessage/delta',
        params: {
          delta: '结果',
          itemId: 'final',
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'item/completed',
        params: {
          item: {
            id: 'final',
            phase: 'final_answer',
            text: '改写结果',
            type: 'agentMessage',
          },
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'turn/completed',
        params: {
          threadId: 'inline-thread',
          turn: { id: 'inline-turn', status: 'completed' },
        },
      });
    };

    await expect(collect(runner.runAskAi(textRequest()))).resolves.toEqual([
      '改写',
      '结果',
    ]);

    const start = client.calls.find((call) => call.method === 'thread/start');
    expect(start?.params).toMatchObject({
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      config: { web_search: 'disabled' },
      environments: [],
      ephemeral: true,
      model: 'gpt-test',
      permissions: ':read-only',
      runtimeWorkspaceRoots: ['/vault'],
    });
    expect(start?.params).not.toHaveProperty('dynamicTools');
    const turn = client.calls.find((call) => call.method === 'turn/start');
    expect(turn?.params).not.toHaveProperty('madoraDocumentReferences');
    expect(turn?.params).not.toHaveProperty('madoraDrawingReferences');
    expect(turn?.params).not.toHaveProperty('madoraFileAttachments');
    expect(client.calls.at(-1)).toEqual({
      method: 'thread/delete',
      params: { threadId: 'inline-thread' },
    });
    expect(isCodexInlineAiThread('inline-thread')).toBe(false);
  });

  it('表格 Prompt 只保留目标结构并移除编辑器位置快照', () => {
    for (const [scope, resultShape] of [
      ['cell', 'fragment'],
      ['row', 'table'],
      ['column', 'table'],
      ['selection', 'table'],
      ['table', 'table'],
    ] as const) {
      const prompt = buildCodexInlineAiPrompt({
        id: `table-${scope}`,
        instruction: '翻译为英文',
        lang: 'zh',
        signal: new AbortController().signal,
        target: {
          axisIndex: scope === 'row' || scope === 'column' ? 1 : null,
          cells: [
            {
              column: 0,
              columnSpan: 1,
              html: '<p>甲</p>',
              row: 0,
              rowSpan: 1,
              text: '甲',
            },
          ],
          columns: 2,
          html: '<table></table>',
          kind: 'table',
          markdown: '| A | B |\n| - | - |\n| 甲 | 乙 |',
          resultShape,
          rows: 1,
          scope,
          text: '甲\t乙',
        },
      });

      expect(prompt).toContain(`"scope":"${scope}"`);
      expect(prompt).toContain(`"resultShape":"${resultShape}"`);
      expect(prompt).toContain('"rows":1');
      expect(prompt).toContain('"columns":2');
      expect(prompt).not.toContain('tablePos');
      expect(prompt).not.toContain('cellPositions');
      expect(prompt).not.toContain('"position"');
    }
  });

  it('仅在 turn/start 成功后报告请求已启动', async () => {
    const client = new FakeCodexClient();
    const onStarted = vi.fn();
    const runner = createRunner(client);
    client.turnStarted = () => {
      client.emit({
        method: 'item/completed',
        params: {
          item: {
            id: 'final',
            phase: 'final_answer',
            text: '结果',
            type: 'agentMessage',
          },
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
      client.emit({
        method: 'turn/completed',
        params: {
          threadId: 'inline-thread',
          turn: { id: 'inline-turn', status: 'completed' },
        },
      });
    };
    const context = {
      id: 'selection-1',
      lang: 'zh' as const,
      selection: {
        from: 1,
        html: '<p>原文</p>',
        markdown: '原文',
        text: '原文',
        to: 3,
      },
      signal: new AbortController().signal,
    };

    await expect(
      collect(runner.runSelection(context, '改写', { onStarted })),
    ).resolves.toEqual(['结果']);
    expect(onStarted).toHaveBeenCalledOnce();

    const failedClient = new FakeCodexClient();
    failedClient.turnStartError = new Error('turn start failed');
    const failedStarted = vi.fn();
    await expect(
      collect(
        createRunner(failedClient).runSelection(context, '改写', {
          onStarted: failedStarted,
        }),
      ),
    ).rejects.toThrow('turn start failed');
    expect(failedStarted).not.toHaveBeenCalled();
  });

  it('目标中止后 interrupt turn 并清理 ephemeral 线程', async () => {
    const client = new FakeCodexClient();
    const runner = createRunner(client);
    const abortController = new AbortController();
    client.turnStarted = () => abortController.abort();

    await expect(
      collect(runner.runAskAi(textRequest(abortController.signal))),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(client.calls).toContainEqual({
      method: 'turn/interrupt',
      params: { threadId: 'inline-thread', turnId: 'inline-turn' },
    });
    expect(client.calls.at(-1)).toEqual({
      method: 'thread/delete',
      params: { threadId: 'inline-thread' },
    });
  });

  it('检测到只读工具调用时中断线程并拒绝结果', async () => {
    const client = new FakeCodexClient();
    const runner = createRunner(client);
    client.turnStarted = () => {
      client.emit({
        method: 'item/started',
        params: {
          item: {
            command: 'pwd',
            id: 'command-1',
            type: 'commandExecution',
          },
          threadId: 'inline-thread',
          turnId: 'inline-turn',
        },
      });
    };

    await expect(collect(runner.runAskAi(textRequest()))).rejects.toThrow(
      '内联预编辑禁止调用工具或修改文件',
    );
    expect(client.calls).toContainEqual({
      method: 'turn/interrupt',
      params: { threadId: 'inline-thread', turnId: 'inline-turn' },
    });
  });

  it('按登记线程或 ephemeral thread/start 识别后台协议消息', () => {
    expect(
      isCodexInlineAiProtocolMessage({
        method: 'thread/started',
        params: { thread: { ephemeral: true, id: 'starting-thread' } },
      }),
    ).toBe(true);
    expect(
      isCodexInlineAiProtocolMessage({
        method: 'item/started',
        params: { threadId: 'normal-thread' },
      }),
    ).toBe(false);
    expect(
      shouldRouteCodexMessageToVisibleThread(
        {
          method: 'item/started',
          params: { threadId: 'background-thread' },
        },
        'visible-thread',
      ),
    ).toBe(false);
    expect(
      shouldRouteCodexMessageToVisibleThread(
        {
          method: 'item/started',
          params: { threadId: 'visible-thread' },
        },
        'visible-thread',
      ),
    ).toBe(true);
  });

  it('同一 runner 同时只允许一个预编辑任务', async () => {
    const client = new FakeCodexClient();
    const runner = createRunner(client);
    const firstAbort = new AbortController();
    client.turnStarted = () => undefined;
    const first = collect(runner.runAskAi(textRequest(firstAbort.signal)));

    await expect(collect(runner.runAskAi(textRequest()))).rejects.toThrow(
      '已有 AI 预编辑任务正在运行',
    );
    firstAbort.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });
});

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AiComposer,
  AiConversationViewport,
  AiMessageContent,
  AiPanelHeader,
  ConversationEntryRow,
  ProcessingTrace,
  UserMessageContent,
} from '../ai-panel';
import {
  createOutputPreview,
  type AiTraceBlock,
} from '../ai-panel-state';

const mentionedDocument = {
  absolutePath: '/workspace/README.md',
  id: 'readme',
  name: 'README.md',
  relativePath: 'README.md',
  title: 'README',
};

describe('AI message rendering', () => {
  it('用户消息按内容宽度收缩并保留长消息最大宽度', () => {
    render(
      <ConversationEntryRow
        entry={{
          id: 'user-message',
          role: 'user',
          text: '你好啊',
          type: 'message',
        }}
        previous={null}
        onOpenDocument={vi.fn()}
      />,
    );

    const content = screen.getByText('你好啊');
    const row = content.closest('article');
    const bubble = content.parentElement;

    expect(row?.className).toContain('flex');
    expect(row?.className).toContain('justify-end');
    expect(bubble?.className).toContain('w-max');
    expect(bubble?.className).toContain('max-w-[88%]');
    expect(bubble?.className).toContain('break-words');
  });

  it('把 GFM 列表、行内代码和链接渲染为语义化内容', () => {
    render(
      <AiMessageContent
        markdown={'主要信息：\n\n- 第一项\n- 使用 `pnpm test`\n\n[OpenAI](https://openai.com)\n\n![远程图片](https://example.com/tracker.png)'}
      />,
    );

    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.getByText('pnpm test').tagName).toBe('CODE');
    expect(
      screen.getByRole('link', { name: 'OpenAI' }).getAttribute('href'),
    ).toBe('https://openai.com');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('图片：远程图片')).toBeTruthy();
  });

  it('不在面板头部重复提供折叠按钮', () => {
    render(
      <AiPanelHeader
        activeThread={null}
        view="chat"
        onHistory={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '折叠 AI 面板' }),
    ).toBeNull();
  });

  it('把文档提及插入光标位置并允许点击打开文档', async () => {
    const user = userEvent.setup();
    const onOpenMention = vi.fn();

    render(<ComposerHarness onOpenMention={onOpenMention} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '请阅读 @READ');
    await user.click(screen.getByRole('button', { name: /README/ }));

    const mention = screen.getByRole('link', { name: 'README' });
    expect(editor.contains(mention)).toBe(true);
    expect(screen.getByTestId('selected-mention-count').textContent).toBe('1');

    await user.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith('/workspace/README.md');
  });

  it('在已发送消息中只把明确提及的文本区间渲染为文档链接', async () => {
    const user = userEvent.setup();
    const onOpenMention = vi.fn();
    const text = '比较 README 与 README';
    const start = '比较 README 与 '.length;

    render(
      <UserMessageContent
        mentions={[
          {
            start,
            end: start + 'README'.length,
            label: 'README',
            path: '/workspace/README.md',
          },
        ]}
        text={text}
        onOpenMention={onOpenMention}
      />,
    );

    const mention = screen.getByRole('link', { name: 'README' });
    expect(mention.textContent).toBe('README');
    expect(screen.getByText('比较 README 与')).toBeTruthy();

    await user.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith('/workspace/README.md');
  });

  it('已发送消息隐藏模型使用的相对路径并显示文档标题', async () => {
    const user = userEvent.setup();
    const onOpenMention = vi.fn();
    const prefix = '总结 ';
    const path = '"Planning/2026 半年度计划.md"';

    render(
      <UserMessageContent
        mentions={[
          {
            start: prefix.length,
            end: `${prefix}${path}`.length,
            label: '2026 半年度计划',
            path: '/workspace/Planning/2026 半年度计划.md',
          },
        ]}
        text={`${prefix}${path}`}
        onOpenMention={onOpenMention}
      />,
    );

    const mention = screen.getByRole('link', { name: '2026 半年度计划' });
    expect(mention.textContent).toBe('2026 半年度计划');
    expect(screen.queryByText(path)).toBeNull();

    await user.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith(
      '/workspace/Planning/2026 半年度计划.md',
    );
  });

  it('把内联提及作为原子节点删除', async () => {
    const user = userEvent.setup();

    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@READ');
    await user.click(screen.getByRole('button', { name: /README/ }));

    expect(screen.getByRole('link', { name: 'README' })).toBeTruthy();
    await user.keyboard('{Backspace}');

    expect(screen.queryByRole('link', { name: 'README' })).toBeNull();
    expect(screen.getByTestId('selected-mention-count').textContent).toBe('0');
  });

  it('中文输入法组合输入时不会提交消息', () => {
    const onSend = vi.fn();
    render(<ComposerHarness onOpenMention={vi.fn()} onSend={onSend} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    editor.textContent = '正在输入';
    fireEvent.input(editor);
    fireEvent.keyDown(editor, { isComposing: true, key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('输入区从紧凑高度开始并在合理高度后内部滚动', () => {
    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    expect(editor.className).toContain('min-h-14');
    expect(editor.className).toContain('max-h-40');
    expect(editor.className).toContain('overflow-y-auto');
  });

  it('离开消息底部后显示回到最新消息按钮并支持平滑返回', async () => {
    const user = userEvent.setup();
    render(
      <AiConversationViewport followLatestRequest={0}>
        <div>消息内容</div>
      </AiConversationViewport>,
    );
    const viewport = screen.getByTestId('ai-conversation-viewport');
    let scrollTop = 500;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollTop = Number(options.top ?? scrollTop);
    });

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollTo: { configurable: true, value: scrollTo },
    });

    fireEvent.scroll(viewport);
    await user.click(screen.getByRole('button', { name: '回到最新消息' }));

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 1_000 });
  });

  it('用户上滚后内容更新不抢走阅读位置，发送新消息才恢复跟随', () => {
    const { rerender } = render(
      <AiConversationViewport followLatestRequest={0}>
        <div>第一段消息</div>
      </AiConversationViewport>,
    );
    const viewport = screen.getByTestId('ai-conversation-viewport');
    let scrollTop = 500;
    const scrollTo = vi.fn((options: ScrollToOptions) => {
      scrollTop = Number(options.top ?? scrollTop);
    });

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollTo: { configurable: true, value: scrollTo },
    });
    fireEvent.scroll(viewport);

    rerender(
      <AiConversationViewport followLatestRequest={0}>
        <div>第一段消息</div>
        <div>流式追加内容</div>
      </AiConversationViewport>,
    );
    expect(scrollTop).toBe(500);
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(
      <AiConversationViewport followLatestRequest={1}>
        <div>新的用户消息</div>
      </AiConversationViewport>,
    );
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 1_000 });
  });

  it('历史处理过程默认折叠，并可逐级展开工具详情', async () => {
    const user = userEvent.setup();
    render(
      <ProcessingTrace
        trace={createTrace({ historical: true, status: 'completed' })}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    const traceTrigger = screen.getByRole('button', {
      name: '已处理，展开处理过程',
    });
    expect(traceTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('读取 README.md')).toBeNull();

    await user.click(traceTrigger);
    const groupTrigger = screen.getByRole('button', {
      name: '读取了文件，展开工具活动',
    });
    expect(groupTrigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(groupTrigger);
    const activityTrigger = screen.getByRole('button', {
      name: '读取 README.md，展开详情',
    });
    await user.click(activityTrigger);
    expect(screen.getByText('/bin/zsh -lc "sed README.md"')).toBeTruthy();
    expect(screen.getByText('输出').parentElement?.textContent).toContain(
      '… 省略 4 行',
    );
    expect(screen.getByText(/退出码/).textContent).toContain('退出码 0');
  });

  it('运行中处理过程保持可见，但工具活动与技术详情默认折叠', async () => {
    const user = userEvent.setup();
    render(
      <ProcessingTrace
        trace={createTrace({ historical: false, status: 'inProgress' })}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '正在处理，收起处理过程' }),
    ).toBeTruthy();
    const commentary = screen.getByText('我先读取文件。');
    const group = screen.getByRole('button', {
      name: '读取了文件，展开工具活动',
    });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(
      commentary.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(group);
    const activity = screen.getByRole('button', {
      name: '读取 README.md，展开详情',
    });
    expect(activity.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('/bin/zsh -lc "sed README.md"')).toBeNull();
  });

  it('用户手动展开工具组后，完成状态不会重置其选择', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProcessingTrace
        trace={createTrace({ historical: false, status: 'inProgress' })}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: '读取了文件，展开工具活动' }),
    );

    rerender(
      <ProcessingTrace
        trace={createTrace({ historical: false, status: 'completed' })}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: '读取了文件，收起工具活动' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('文件修改详情只允许点击经过验证的工作区路径', async () => {
    const user = userEvent.setup();
    const onOpenDocument = vi.fn();
    const trace = createTrace({ historical: false, status: 'failed' });
    trace.segments = [
      {
        type: 'group',
        id: 'group-files',
        status: 'failed',
        summary: '编辑了文件',
        durationMs: 500,
        activities: [
          {
            type: 'timeline',
            id: 'file-1',
            turnId: 'turn-1',
            kind: 'file',
            label: '修改 README.md',
            status: 'failed',
            startedAtMs: 1_000,
            completedAtMs: 1_500,
            durationMs: 500,
            changes: [
              {
                absolutePath: '/workspace/README.md',
                additions: 1,
                deletions: 1,
                diff: '+new\n-old',
                kind: 'update',
                movePath: null,
                path: 'README.md',
              },
              {
                absolutePath: null,
                additions: 0,
                deletions: 0,
                diff: '',
                kind: 'update',
                movePath: null,
                path: '/etc/passwd',
              },
            ],
          },
        ],
      },
    ];

    render(
      <ProcessingTrace
        trace={trace}
        onApprove={vi.fn()}
        onOpenDocument={onOpenDocument}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'README.md' }));
    expect(onOpenDocument).toHaveBeenCalledWith('/workspace/README.md');
    expect(
      screen.queryByRole('button', { name: '/etc/passwd' }),
    ).toBeNull();
  });

  it('审批显示在对应工具下，并遵循服务端允许的决定集合', () => {
    const trace = createTrace({ historical: false, status: 'waitingApproval' });
    trace.approvals = [
      {
        id: 'approval-1',
        itemId: 'command-1',
        turnId: 'turn-1',
        method: 'item/commandExecution/requestApproval',
        title: '请求执行工具命令',
        detail: 'pnpm test:run',
        decisions: ['accept', 'decline'],
      },
    ];

    render(
      <ProcessingTrace
        trace={trace}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(screen.getByText('请求执行工具命令')).toBeTruthy();
    expect(screen.getByRole('button', { name: '允许' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: '本次任务允许' }),
    ).toBeNull();
  });

  it('服务端只提供 bridge 不支持的审批决定时不伪造允许按钮', () => {
    const trace = createTrace({ historical: false, status: 'waitingApproval' });
    trace.approvals = [
      {
        id: 'approval-unsupported',
        itemId: 'command-1',
        turnId: 'turn-1',
        method: 'item/commandExecution/requestApproval',
        title: '请求执行工具命令',
        detail: 'pnpm test:run',
        decisions: [],
      },
    ];

    render(
      <ProcessingTrace
        trace={trace}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(
      screen.getByText('当前客户端不支持服务端要求的审批方式。'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '允许' })).toBeNull();
  });
});

function createTrace({
  historical,
  status,
}: {
  historical: boolean;
  status: AiTraceBlock['status'];
}): AiTraceBlock {
  return {
    type: 'trace',
    id: 'trace-turn-1',
    turnId: 'turn-1',
    status,
    startedAtMs: status === 'inProgress' ? Date.now() - 2_000 : 1_000,
    durationMs: status === 'inProgress' ? null : 2_000,
    historical,
    approvals: [],
    segments: [
      {
        type: 'commentary',
        message: {
          type: 'message',
          id: 'commentary-1',
          role: 'assistant',
          phase: 'commentary',
          turnId: 'turn-1',
          text: '我先读取文件。',
        },
      },
      {
        type: 'group',
        id: 'group-command-1',
        status: status === 'waitingApproval' ? 'waitingApproval' : status === 'inProgress' ? 'inProgress' : 'completed',
        summary: '读取了文件',
        durationMs: 1_000,
        activities: [
          {
            type: 'timeline',
            id: 'command-1',
            turnId: 'turn-1',
            kind: 'command',
            label: '读取 README.md',
            status: status === 'inProgress' ? 'inProgress' : 'completed',
            startedAtMs: 1_000,
            completedAtMs: 2_000,
            durationMs: 1_000,
            actions: [
              {
                type: 'read',
                command: 'sed README.md',
                name: 'README.md',
                path: '/workspace/README.md',
                documentPath: '/workspace/README.md',
              },
            ],
            command: '/bin/zsh -lc "sed README.md"',
            cwd: '/workspace',
            output: createOutputPreview('1\n2\n3\n4\n5\n6\n7\n8'),
            exitCode: 0,
            terminalInputs: [],
          },
        ],
      },
    ],
  };
}

function ComposerHarness({
  onOpenMention,
  onSend = vi.fn(),
}: {
  onOpenMention: (path: string) => void;
  onSend?: () => void;
}) {
  const [value, setValue] = React.useState('');
  const [mentions, setMentions] = React.useState<typeof mentionedDocument[]>([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);

  return (
    <>
      <AiComposer
        active={false}
        currentDocument={null}
        effort="medium"
        mentionDocuments={[mentionedDocument]}
        mentionQuery={mentionQuery}
        mcpServerCount={0}
        models={[]}
        runtimeStatus="ready"
        selectedModel=""
        selectedModelInfo={null}
        submitting={false}
        value={value}
        version={null}
        onEffortChange={vi.fn()}
        onInterrupt={vi.fn()}
        onMentionQueryChange={setMentionQuery}
        onMentionsChange={setMentions}
        onModelChange={vi.fn()}
        onOpenMention={onOpenMention}
        onSend={onSend}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          const match = nextValue.match(/@([^\s@]*)$/);
          setMentionQuery(match ? match[1] : null);
        }}
      />
      <output data-testid="selected-mention-count">{mentions.length}</output>
    </>
  );
}

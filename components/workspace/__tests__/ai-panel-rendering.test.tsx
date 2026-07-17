import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AiComposer,
  AiConversationViewport,
  AiMessageContent,
  AiPanelHeader,
  ChangeSummaryCard,
  ConversationEntryRow,
  ProcessingTrace,
  UserMessageContent,
} from '../ai-panel';
import {
  createOutputPreview,
  type AiChangeSummaryBlock,
  type AiTraceBlock,
} from '../ai-panel-state';

const mentionedDocument = {
  absolutePath: '/workspace/README.md',
  id: 'readme',
  name: 'README.md',
  relativePath: 'README.md',
  title: 'README',
};

const releaseNotesDocument = {
  absolutePath: '/workspace/Docs/Release Notes.md',
  id: 'release-notes',
  name: 'Release Notes.md',
  relativePath: 'Docs/Release Notes.md',
  title: 'Release Notes',
};

const roadmapDocument = {
  absolutePath: '/workspace/Planning/Roadmap.md',
  id: 'roadmap',
  name: 'Roadmap.md',
  relativePath: 'Planning/Roadmap.md',
  title: 'Roadmap',
};

function change(
  path: string,
  absolutePath: string | null,
  additions: number,
  deletions: number,
  diff = '',
) {
  return {
    absolutePath,
    additions,
    deletions,
    diff,
    kind: 'update' as const,
    movePath: null,
    path,
  };
}

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
    await user.click(screen.getByRole('option', { name: /README/ }));

    const mention = screen.getByRole('link', { name: 'README' });
    expect(editor.contains(mention)).toBe(true);
    expect(screen.getByTestId('selected-mention-count').textContent).toBe('1');

    await user.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith('/workspace/README.md');
  });

  it('提及候选无上浮阴影并提供标准列表语义', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@READ');

    const listbox = screen.getByRole('listbox', { name: '提及工作区文档' });
    const menu = listbox.closest('[data-mention-menu]');
    expect(menu?.className).not.toContain('shadow-xl');
    expect(menu?.className).toContain('shadow-none');
    expect(editor.getAttribute('aria-controls')).toBe(listbox.id);
    expect(
      screen.getByRole('option', { name: /README/ }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('支持上下键循环选择、选中项自适应滚动和回车插入', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <ComposerHarness
          mentionDocuments={[
            mentionedDocument,
            releaseNotesDocument,
            roadmapDocument,
          ]}
          onOpenMention={vi.fn()}
        />,
      );

      const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
      await user.click(editor);
      await user.type(editor, '@');
      await user.keyboard('{ArrowDown}');

      expect(
        screen
          .getByRole('option', { name: /Release Notes/ })
          .getAttribute('aria-selected'),
      ).toBe('true');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

      await user.keyboard('{Enter}');
      expect(screen.getByRole('link', { name: 'Release Notes' })).toBeTruthy();
      expect(screen.queryByRole('listbox')).toBeNull();
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('上键从第一项循环到末项，Escape 只关闭候选不删除输入', async () => {
    const user = userEvent.setup();
    render(
      <ComposerHarness
        mentionDocuments={[
          mentionedDocument,
          releaseNotesDocument,
          roadmapDocument,
        ]}
        onOpenMention={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@');
    await user.keyboard('{ArrowUp}');
    expect(
      screen
        .getByRole('option', { name: /Roadmap/ })
        .getAttribute('aria-selected'),
    ).toBe('true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor.textContent).toBe('@');
  });

  it('不会把邮箱中的 @ 识别为文档提及', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, 'foo@example.com');

    expect(screen.queryByRole('listbox')).toBeNull();
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
    await user.click(screen.getByRole('option', { name: /README/ }));

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

  it('连接准备期间允许输入并保留显式发送意图', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(
      <AiComposer
        active={false}
        approvalPolicyAvailability={{ never: true, onRequest: true }}
        autoReviewAvailable={false}
        currentDocument={null}
        effort="medium"
        mentionDocuments={[]}
        mentionQuery={null}
        mcpServerCount={0}
        models={[]}
        permissionMode="ask"
        permissionProfiles={[]}
        permissionSwitchDisabled={false}
        runtimeStatus="loading"
        selectedModel=""
        selectedModelInfo={null}
        submitting={false}
        value="总结当前文档"
        version={null}
        onEffortChange={vi.fn()}
        onInterrupt={vi.fn()}
        onMentionQueryChange={vi.fn()}
        onMentionsChange={vi.fn()}
        onModelChange={vi.fn()}
        onOpenMention={vi.fn()}
        onPermissionModeChange={vi.fn()}
        onSend={onSend}
        onValueChange={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    expect(editor.getAttribute('contenteditable')).toBe('true');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledOnce();
    expect(screen.getByText('正在准备')).toBeTruthy();
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

  it('以紧凑摘要展示净文件修改并按需展开其余文件', async () => {
    const user = userEvent.setup();
    const onOpenDocument = vi.fn();
    const summary: AiChangeSummaryBlock = {
      additions: 12,
      changes: [
        change(
          'README.md',
          '/workspace/README.md',
          5,
          1,
          [
            'diff --git a/README.md b/README.md',
            '--- a/README.md',
            '+++ b/README.md',
            '@@ -8,2 +8,2 @@',
            '-旧内容',
            '+新内容',
            ' 保留内容',
          ].join('\n'),
        ),
        change('docs/api.md', '/workspace/docs/api.md', 4, 2),
        change('docs/security.md', '/workspace/docs/security.md', 3, 1),
        change('package.json', null, 0, 0),
      ],
      deletions: 4,
      id: 'changes-turn-1',
      turnId: 'turn-1',
      type: 'changes',
    };

    render(
      <ChangeSummaryCard
        summary={summary}
        onOpenDocument={onOpenDocument}
      />,
    );

    expect(screen.getByText('已编辑 4 个文件')).toBeTruthy();
    expect(screen.getByText('+12')).toBeTruthy();
    expect(screen.getByText('-4')).toBeTruthy();
    expect(screen.queryByText('package.json')).toBeNull();

    const readmeRow = screen.getByRole('button', { name: 'README.md' });
    await user.hover(readmeRow);
    const preview = await screen.findByRole('region', {
      name: 'README.md 变更预览',
    });
    expect(within(preview).getByText('旧内容')).toBeTruthy();
    expect(within(preview).getByText('新内容')).toBeTruthy();
    expect(within(preview).getByText('+5')).toBeTruthy();
    expect(within(preview).getByText('-1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '再显示 1 个文件' }));
    expect(screen.getByText('package.json')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'package.json' })).toBeNull();

    await user.click(readmeRow);
    expect(onOpenDocument).toHaveBeenCalledWith('/workspace/README.md');
  });

  it('限制长文件变更预览的渲染行数', async () => {
    const user = userEvent.setup();
    const diff = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,260 +1,260 @@',
      ...Array.from({ length: 260 }, (_, index) => `+新增内容 ${index + 1}`),
    ].join('\n');

    render(
      <ChangeSummaryCard
        summary={{
          additions: 260,
          changes: [change('README.md', '/workspace/README.md', 260, 0, diff)],
          deletions: 0,
          id: 'changes-turn-1',
          turnId: 'turn-1',
          type: 'changes',
        }}
        onOpenDocument={vi.fn()}
      />,
    );

    await user.hover(screen.getByRole('button', { name: 'README.md' }));
    const preview = await screen.findByRole('region', {
      name: 'README.md 变更预览',
    });
    expect(within(preview).getByText('已省略 21 行')).toBeTruthy();
  });

  it('审批显示在对应工具下，并遵循服务端允许的决定集合', () => {
    const onApprove = vi.fn();
    const trace = createTrace({ historical: false, status: 'waitingApproval' });
    trace.approvals = [
      {
        id: 'approval-1',
        itemId: 'command-1',
        turnId: 'turn-1',
        method: 'item/commandExecution/requestApproval',
        title: '请求执行工具命令',
        detail: 'pnpm test:run',
        choices: [
          {
            id: 'decline',
            kind: 'decline',
            label: '拒绝并继续',
            description: '允许 Codex 尝试其他方案',
          },
          {
            id: 'cancel',
            kind: 'cancel',
            label: '拒绝并停止',
            description: '中断当前任务',
          },
          {
            id: 'accept',
            kind: 'accept',
            label: '允许一次',
            description: null,
          },
        ],
      },
    ];

    render(
      <ProcessingTrace
        trace={trace}
        onApprove={onApprove}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(screen.getByText('请求执行工具命令')).toBeTruthy();
    expect(screen.getByRole('button', { name: '允许一次' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒绝并继续' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒绝并停止' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: '本次任务允许' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '拒绝并停止' }));
    expect(onApprove).toHaveBeenCalledWith(trace.approvals[0], 'cancel');
  });

  it('权限入口展示标准模式、自定义配置和服务端禁用状态', async () => {
    const user = userEvent.setup();
    const onPermissionModeChange = vi.fn();

    render(
      <AiComposer
        active={false}
        approvalPolicyAvailability={{ never: true, onRequest: true }}
        autoReviewAvailable={false}
        currentDocument={null}
        effort="medium"
        mentionDocuments={[]}
        mentionQuery={null}
        mcpServerCount={0}
        models={[]}
        permissionMode="ask"
        permissionProfiles={[
          {
            id: 'team-safe',
            allowed: true,
            description: '团队安全配置',
          },
          {
            id: 'blocked-profile',
            allowed: false,
            description: null,
          },
        ]}
        permissionSwitchDisabled={false}
        runtimeStatus="ready"
        selectedModel=""
        selectedModelInfo={null}
        submitting={false}
        value=""
        version={null}
        onEffortChange={vi.fn()}
        onInterrupt={vi.fn()}
        onMentionQueryChange={vi.fn()}
        onMentionsChange={vi.fn()}
        onModelChange={vi.fn()}
        onOpenMention={vi.fn()}
        onPermissionModeChange={onPermissionModeChange}
        onSend={vi.fn()}
        onValueChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '权限模式：请求审批' }));
    expect(
      screen
        .getByText('替我审批')
        .closest('[role="menuitemradio"]')
        ?.getAttribute('data-disabled'),
    ).toBe('');
    expect(
      screen
        .getByText('blocked-profile')
        .closest('[role="menuitemradio"]')
        ?.getAttribute('data-disabled'),
    ).toBe('');
    await user.click(screen.getByText('team-safe'));
    expect(onPermissionModeChange).toHaveBeenCalledWith('profile:team-safe');
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
        choices: [],
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
  mentionDocuments = [mentionedDocument],
  onOpenMention,
  onSend = vi.fn(),
}: {
  mentionDocuments?: Array<typeof mentionedDocument>;
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
        approvalPolicyAvailability={{ never: true, onRequest: true }}
        autoReviewAvailable
        currentDocument={null}
        effort="medium"
        mentionDocuments={mentionDocuments}
        mentionQuery={mentionQuery}
        mcpServerCount={0}
        models={[]}
        permissionMode="ask"
        permissionProfiles={[]}
        permissionSwitchDisabled={false}
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
        onPermissionModeChange={vi.fn()}
        onOpenMention={onOpenMention}
        onSend={onSend}
        onValueChange={setValue}
      />
      <output data-testid="selected-mention-count">{mentions.length}</output>
    </>
  );
}

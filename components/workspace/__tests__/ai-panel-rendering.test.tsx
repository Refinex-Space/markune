import * as React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AiComposer,
  AiConversationViewport,
  AiMessageContent,
  AiPanelHeader,
  ChangeSummaryCard,
  ConversationEntryRow,
  GoalStatusBar,
  PanelContent,
  PlanImplementationCard,
  ProcessingTrace,
  ProposedPlanCard,
  TaskProgressIndicator,
  UserInputDecisionCard,
  UserMessageContent,
} from '../ai-panel';
import {
  createEmptyConversation,
  createOutputPreview,
  type AiChangeSummaryBlock,
  type AiTaskProgress,
  type AiTraceBlock,
} from '../ai-panel-state';
import type {
  CodexContextAttachment,
  CodexThreadGoal,
  CodexThreadTokenUsage,
} from '../codex-app-server';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverMock {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
});

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

const currentWorkspaceDocument = {
  absolutePath: '/workspace/Test.md',
  id: 'Test.md',
  kind: 'document' as const,
  name: 'Test.md',
  relativePath: 'Test.md',
  title: 'Spring Boot 介绍',
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
  it('任务进度支持 Hover 预览、点击固定和 Escape 关闭', async () => {
    const user = userEvent.setup();
    const progress: AiTaskProgress = {
      additions: 12,
      completedSteps: 1,
      currentStepNumber: 2,
      deletions: 3,
      explanation: null,
      fileCount: 2,
      steps: [
        { step: '核对协议事件', status: 'completed' },
        { step: '实现状态选择器', status: 'inProgress' },
        { step: '补充交互测试', status: 'pending' },
      ],
      totalSteps: 3,
      turnId: 'turn-task',
    };

    render(<TaskProgressIndicator progress={progress} />);

    const trigger = screen.getByRole('button', {
      name: '第 2 / 3 步，2 个文件已更改，新增 12 行，删除 3 行',
    });
    expect(screen.getByTestId('task-progress').className).toContain('pb-1');
    expect(trigger.className).toContain('h-8');
    expect(trigger.className).toContain('gap-1.5');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.pointerEnter(trigger);
    const preview = await screen.findByRole('region', { name: '任务列表' });
    expect(preview.className).toContain('p-1.5');
    expect(preview.className).toContain('w-[min(400px,calc(100vw-2rem))]');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(preview).getByRole('list', { name: '任务步骤' })).toBeTruthy();
    expect(within(preview).getByText('核对协议事件').className).toContain(
      'line-through',
    );
    expect(
      within(preview).getByText('实现状态选择器').closest('[aria-current="step"]'),
    ).toBeTruthy();
    expect(
      within(preview).getByText('实现状态选择器').closest('li')?.className,
    ).toContain('min-h-8');

    fireEvent.pointerLeave(trigger);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '任务列表' })).toBeNull();
    });

    await user.click(trigger);
    expect(await screen.findByRole('region', { name: '任务列表' })).toBeTruthy();
    fireEvent.pointerLeave(trigger);
    expect(screen.getByRole('region', { name: '任务列表' })).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '任务列表' })).toBeNull();
    });
  });

  it('正式计划展示渐隐摘要，并支持复制与打开完整预览', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const plan = {
      historical: false,
      id: 'plan-1',
      status: 'completed' as const,
      text: '# 实施计划\n\n1. 完成协议桥接',
      turnId: 'turn-1',
    };
    render(
      <ProposedPlanCard
        plan={plan}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole('heading', { name: '实施计划' })).toBeTruthy();
    expect(screen.getByText('完成协议桥接')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看完整计划' }).className).toContain(
      'max-h-56',
    );

    await user.click(screen.getByRole('button', { name: '复制计划' }));
    await user.click(screen.getByRole('button', { name: '在编辑器中查看完整计划' }));

    expect(writeText).toHaveBeenCalledWith(plan.text);
    expect(onOpen).toHaveBeenCalledWith(plan);
  });

  it('用户决策不会因协议建议时间到期而自动消失', () => {
    vi.useFakeTimers();
    try {
      render(
        <UserInputDecisionCard
          request={{
            autoResolutionMs: 60_000,
            id: 'request-persistent',
            itemId: 'item-persistent',
            questions: [{
              header: '范围',
              id: 'question-persistent',
              isSecret: false,
              options: [
                { description: '选择 A', id: 'a', isOther: false, label: 'A' },
                { description: '选择 B', id: 'b', isOther: false, label: 'B' },
              ],
              question: '请选择',
            }],
            turnId: 'turn-1',
          }}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /选择 A/ }));
      vi.advanceTimersByTime(5 * 60_000);

      expect(screen.getByText('请选择')).toBeTruthy();
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: '提交回答' })
          .disabled,
      ).toBe(false);
      expect(screen.queryByText(/默认判断继续/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('用户决策卡支持多问题、其他答案和秘密输入', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <UserInputDecisionCard
        request={{
          autoResolutionMs: 120_000,
          id: 'request-1',
          itemId: 'item-1',
          questions: [
            {
              header: '范围',
              id: 'question-1',
              isSecret: false,
              options: [
                {
                  description: '仅修改当前模块',
                  id: 'option-1',
                  isOther: false,
                  label: '最小改动',
                },
                {
                  description: '覆盖所有相关模块',
                  id: 'option-2',
                  isOther: false,
                  label: '完整实现',
                },
              ],
              question: '选择实施范围',
            },
            {
              header: '凭据',
              id: 'question-2',
              isSecret: true,
              options: [
                {
                  description: '输入自定义值',
                  id: 'option-other',
                  isOther: true,
                  label: '其他',
                },
              ],
              question: '提供临时值',
            },
          ],
          turnId: 'turn-1',
        }}
        onSubmit={onSubmit}
      />,
    );

    const minimalOption = screen.getByRole('button', { name: /最小改动/ });
    minimalOption.focus();
    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('button', { name: /完整实现/ }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
    await user.click(minimalOption);
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.click(screen.getByRole('button', { name: /其他/ }));
    const secretInput = screen.getByLabelText('其他答案');
    expect(secretInput.getAttribute('type')).toBe('password');
    await user.type(secretInput, 'masked-value');
    await user.click(screen.getByRole('button', { name: '提交回答' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { note: null, optionId: 'option-1', questionId: 'question-1' },
      {
        note: 'masked-value',
        optionId: 'option-other',
        questionId: 'question-2',
      },
    ]);
  });

  it('用户决策卡支持无预设选项的自由输入', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <UserInputDecisionCard
        request={{
          autoResolutionMs: null,
          id: 'request-freeform',
          itemId: 'item-freeform',
          questions: [
            {
              header: '说明',
              id: 'question-freeform',
              isSecret: false,
              options: [],
              question: '请补充约束',
            },
          ],
          turnId: 'turn-1',
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '回答' }), '保持兼容');
    await user.click(screen.getByRole('button', { name: '提交回答' }));

    expect(onSubmit).toHaveBeenCalledWith([
      {
        note: '保持兼容',
        optionId: null,
        questionId: 'question-freeform',
      },
    ]);
  });

  it('计划完成卡提供三种实施选择', async () => {
    const user = userEvent.setup();
    const onFreshContext = vi.fn();
    const onImplement = vi.fn();
    const onStay = vi.fn();
    render(
      <PlanImplementationCard
        plan={{
          historical: false,
          id: 'plan-1',
          status: 'completed',
          text: '实施计划正文',
          turnId: 'turn-1',
        }}
        submitting={false}
        onFreshContext={onFreshContext}
        onImplement={onImplement}
        onStay={onStay}
      />,
    );

    await user.click(screen.getByRole('button', { name: '实施此计划' }));
    await user.click(
      screen.getByRole('button', { name: '清空上下文后实施' }),
    );
    await user.click(screen.getByRole('button', { name: '留在计划模式' }));

    expect(onImplement).toHaveBeenCalledTimes(1);
    expect(onFreshContext).toHaveBeenCalledTimes(1);
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it('用户消息按内容宽度收缩，并在悬浮区右侧展示时间与复制操作', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const createdAtMs = new Date(2026, 6, 19, 18, 12).getTime();
    render(
      <ConversationEntryRow
        entry={{
          createdAtMs,
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
    const bubble = content.closest('div.w-max');
    const wrapper = bubble?.parentElement;

    expect(row?.className).toContain('flex');
    expect(row?.className).toContain('justify-end');
    expect(row?.getAttribute('tabindex')).toBe('0');
    expect(bubble?.className).toContain('w-max');
    expect(bubble?.className).toContain('max-w-full');
    expect(wrapper?.className).toContain('max-w-[96%]');
    expect(bubble?.className).toContain('break-words');
    const metadata = screen.getByTestId('user-message-metadata');
    expect(row?.className).toContain('ai-message-entry');
    expect(metadata.className).toContain('ai-message-metadata');
    expect(metadata.textContent).toContain('18:12');
    expect(metadata.firstElementChild?.tagName).toBe('TIME');
    expect(screen.queryByRole('button', { name: '设为目标' })).toBeNull();

    const copy = screen.getByRole('button', { name: '复制消息' });
    expect(metadata.lastElementChild?.contains(copy)).toBe(true);
    await user.hover(copy);
    expect((await screen.findByRole('tooltip')).textContent).toContain('复制');
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith('你好啊');
  });

  it('已发送附件独立显示在文字气泡上方并保持消息态样式', async () => {
    const user = userEvent.setup();
    render(
      <ConversationEntryRow
        entry={{
          attachments: [
            {
              kind: 'image',
              mediaType: 'image/png',
              name: 'diagram.png',
              previewUrl: 'data:image/png;base64,aW1hZ2U=',
            },
            {
              kind: 'file',
              name: 'AGENTS.md',
              previewUrl: null,
            },
          ],
          createdAtMs: new Date(2026, 6, 19, 18, 20).getTime(),
          id: 'user-message-with-attachments',
          role: 'user',
          text: '这个文件有什么',
          type: 'message',
        }}
        previous={null}
        onOpenDocument={vi.fn()}
      />,
    );

    const attachmentShelf = screen.getByTestId('user-message-attachments');
    const bubble = screen.getByTestId('user-message-bubble');
    const image = screen.getByRole('button', {
      name: '预览图片 diagram.png',
    });
    const fileCard = screen
      .getByText('AGENTS.md')
      .closest('[data-attachment-kind]');

    expect(attachmentShelf.parentElement).toBe(bubble.parentElement);
    expect(bubble.contains(image)).toBe(false);
    expect(
      attachmentShelf.compareDocumentPosition(bubble) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fileCard?.getAttribute('data-attachment-variant')).toBe('message');
    expect(fileCard?.className).toContain('h-9');
    expect(fileCard?.className).toContain('rounded-full');

    await user.click(image);
    expect(
      within(screen.getByRole('dialog')).getByAltText('diagram.png'),
    ).toBeTruthy();
  });

  it('纯附件消息不渲染空气泡并保留时间', () => {
    render(
      <ConversationEntryRow
        entry={{
          attachments: [
            {
              kind: 'file',
              name: 'AGENTS.md',
              previewUrl: null,
            },
          ],
          createdAtMs: new Date(2026, 6, 19, 18, 24).getTime(),
          id: 'user-message-attachment-only',
          role: 'user',
          text: '',
          type: 'message',
        }}
        previous={null}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(screen.getByTestId('user-message-attachments')).toBeTruthy();
    expect(screen.queryByTestId('user-message-bubble')).toBeNull();
    expect(screen.getByTestId('user-message-metadata').textContent).toContain(
      '18:24',
    );
    expect(screen.queryByRole('button', { name: '复制消息' })).toBeNull();
  });

  it('AI 回答在悬浮区左侧按复制、时间的顺序展示元信息', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const createdAtMs = new Date(2026, 6, 19, 18, 16).getTime();
    render(
      <ConversationEntryRow
        entry={{
          createdAtMs,
          id: 'assistant-message',
          role: 'assistant',
          text: '已经完成处理。',
          type: 'message',
        }}
        previous={null}
        onOpenDocument={vi.fn()}
      />,
    );

    const metadata = screen.getByTestId('assistant-message-metadata');
    const copy = screen.getByRole('button', { name: '复制消息' });
    expect(metadata.className).toContain('ai-message-metadata');
    expect(metadata.firstElementChild?.contains(copy)).toBe(true);
    expect(metadata.lastElementChild?.tagName).toBe('TIME');
    expect(metadata.textContent).toContain('18:16');

    await user.hover(copy);
    expect((await screen.findByRole('tooltip')).textContent).toContain('复制');
    await user.click(copy);
    expect(writeText).toHaveBeenCalledWith('已经完成处理。');
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

  it('两种展示模式的标题栏均隐藏分割线', () => {
    const { rerender } = render(
      <AiPanelHeader
        activeThread={null}
        presentation="workspace"
        view="chat"
        onHistory={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    const header = screen.getByRole('banner');
    const actions = screen.getByTestId('ai-header-actions');
    expect(header.className).toContain('-mt-1');
    expect(header.className).toContain('h-9');
    expect(header.className).not.toContain('border-b');
    expect(actions.className).toContain('gap-0.5');
    expect(
      screen.queryByRole('button', { name: '折叠 AI 面板' }),
    ).toBeNull();

    rerender(
      <AiPanelHeader
        activeThread={null}
        presentation="panel"
        view="chat"
        onHistory={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    const panelHeader = screen.getByRole('banner');
    expect(panelHeader.className).toContain(
      'h-[var(--workspace-main-header-height)]',
    );
    expect(
      screen.getByRole('button', { name: '新任务' }).className,
    ).toContain('size-7');
    expect(panelHeader.className).not.toContain('border-b');
  });

  it('为标题栏动作展示一致的悬停提示', async () => {
    const user = userEvent.setup();

    for (const label of ['AI 画图', '新任务', '历史记录']) {
      const { unmount } = render(
        <AiPanelHeader
          activeThread={null}
          presentation="panel"
          view="chat"
          onHistory={vi.fn()}
          onNewChat={vi.fn()}
          onNewDiagram={vi.fn()}
        />,
      );
      const button = screen.getByRole('button', { name: label });
      await user.hover(button);
      expect((await screen.findByRole('tooltip')).textContent).toContain(label);
      unmount();
    }
  });

  it('大屏消息区与输入框使用同一宽度和水平内边距', () => {
    const conversation = createEmptyConversation();
    conversation.entries.push({
      id: 'assistant-message',
      role: 'assistant',
      text: '已经完成处理。',
      type: 'message',
    });

    render(
      <PanelContent
        account={null}
        authRequired={false}
        conversation={conversation}
        currentDocument={null}
        presentation="workspace"
        runtimeError={null}
        runtimeStatus="ready"
        signingIn={false}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
        onOpenPlanPreview={vi.fn()}
        onPrompt={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );

    const content = screen.getByTestId('ai-conversation-content');
    expect(content.className).toContain('max-w-[920px]');
    expect(content.className).toContain('px-3');
  });

  it('加号菜单只展示附件、占位能力和插件入口', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const surface = screen.getByRole('textbox', { name: '向 Codex 提问' })
      .parentElement;
    vi.spyOn(surface!, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 180,
      left: 0,
      right: 520,
      top: 120,
      width: 520,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });
    const trigger = screen.getByRole('button', { name: '添加上下文与工具' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      bottom: 290,
      height: 28,
      left: 8,
      right: 36,
      top: 262,
      width: 28,
      x: 8,
      y: 262,
      toJSON: () => ({}),
    });

    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: '添加上下文与工具' });
    expect(menu.getAttribute('style')).toContain('width: 520px');
    expect(menu.getAttribute('data-composer-clearance')).toBe('150');
    expect(menu.className).toContain('p-1');
    expect(screen.getByText('添加')).toBeTruthy();
    expect(
      screen.getByText('文件和文件夹').closest('[role="menuitem"]')?.className,
    ).toContain('min-h-9');
    expect(screen.getByText('目标')).toBeTruthy();
    expect(screen.getByText('设置要持续追求的目标')).toBeTruthy();
    expect(screen.getByText('计划模式')).toBeTruthy();
    expect(screen.getByText('当前模型不可用')).toBeTruthy();
    expect(screen.getByText('插件')).toBeTruthy();
    expect(screen.getByText('正在加载插件…')).toBeTruthy();
    expect(screen.queryByText('检测安装的插件')).toBeNull();
    expect(screen.queryByText('联网搜索已启用')).toBeNull();
    expect(screen.queryByText(/MCP Server/)).toBeNull();
    expect(screen.queryByText('提及工作区文档')).toBeNull();
    expect(screen.getByText('目标').closest('[role="menuitem"]')?.getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByText('计划模式').closest('[role="menuitem"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('目标模式可从加号与斜杠命令进入，并切换目标输入提示', async () => {
    const user = userEvent.setup();
    const onGoalModeChange = vi.fn();
    const { rerender } = render(
      <ComposerHarness
        onGoalModeChange={onGoalModeChange}
        onOpenMention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('目标'));
    expect(onGoalModeChange).toHaveBeenCalledWith(true);

    rerender(
      <ComposerHarness
        goalDraftMode
        onGoalModeChange={onGoalModeChange}
        onOpenMention={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole('textbox', { name: '向 Codex 提问' })
        .getAttribute('data-placeholder'),
    ).toBe('描述你的目标，定义可衡量的成果，以获得最佳效果');
    expect(screen.getByRole('button', { name: '退出目标模式' })).toBeTruthy();

    rerender(
      <ComposerHarness
        onGoalModeChange={onGoalModeChange}
        onOpenMention={vi.fn()}
      />,
    );
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '/');
    await user.click(
      within(
        screen.getByRole('listbox', { name: '选择命令或 Skill' }),
      ).getByRole('option', { name: '目标' }),
    );
    expect(onGoalModeChange).toHaveBeenLastCalledWith(true);
    expect(editor.textContent).toBe('');
  });

  it('目标状态条支持暂停、编辑、恢复和清除', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onSave = vi.fn().mockResolvedValue(true);
    const onStatusChange = vi.fn();
    const goal: CodexThreadGoal = {
      createdAt: 100,
      objective: '持续优化当前项目直到测试全部通过',
      status: 'active',
      threadId: 'thread-1',
      timeUsedSeconds: 6,
      tokenBudget: null,
      tokensUsed: 120,
      updatedAt: 100,
    };
    const { rerender } = render(
      <GoalStatusBar
        goal={goal}
        observedAt={Date.now()}
        updating={false}
        onClear={onClear}
        onSave={onSave}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText('进行中的目标')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '暂停目标' }));
    expect(onStatusChange).toHaveBeenCalledWith('paused');

    await user.click(screen.getByRole('button', { name: '编辑目标' }));
    const editor = screen.getByRole('textbox', { name: '目标内容' });
    await user.clear(editor);
    await user.type(editor, '更新后的目标');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('更新后的目标'));

    rerender(
      <GoalStatusBar
        goal={{ ...goal, status: 'paused' }}
        observedAt={Date.now()}
        updating={false}
        onClear={onClear}
        onSave={onSave}
        onStatusChange={onStatusChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '恢复目标' }));
    expect(onStatusChange).toHaveBeenCalledWith('active');
    await user.click(screen.getByRole('button', { name: '清除目标' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('计划模式可用时允许切换并在输入框底栏显示状态', async () => {
    const user = userEvent.setup();
    const onCollaborationModeChange = vi.fn();
    const { rerender } = render(
      <ComposerHarness
        collaborationMode="default"
        onCollaborationModeChange={onCollaborationModeChange}
        onOpenMention={vi.fn()}
        planModeAvailable
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('计划模式'));
    expect(onCollaborationModeChange).toHaveBeenCalledWith('plan');

    rerender(
      <ComposerHarness
        collaborationMode="plan"
        onCollaborationModeChange={onCollaborationModeChange}
        onOpenMention={vi.fn()}
        planModeAvailable
      />,
    );
    expect(screen.getByRole('button', { name: '退出计划模式' })).toBeTruthy();
  });

  it('文件子菜单区分文件与文件夹选择', async () => {
    const user = userEvent.setup();
    const onAttachmentSelect = vi.fn();
    render(
      <ComposerHarness
        onAttachmentSelect={onAttachmentSelect}
        onOpenMention={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.hover(screen.getByText('文件和文件夹'));
    fireEvent.click(await screen.findByText('选择文件'));
    expect(onAttachmentSelect).toHaveBeenCalledWith('file');
  });

  it('检测到的插件使用真实图标插入原生插件提及且不作为文档链接', async () => {
    const user = userEvent.setup();
    render(
      <ComposerHarness
        onOpenMention={vi.fn()}
        pluginOptions={[
          {
            description: '查阅 OpenAI 官方文档',
            darkIconUrl: 'https://example.com/openai-docs-dark.png',
            displayName: 'OpenAI Docs',
            id: 'openai-docs',
            iconUrl: 'https://example.com/openai-docs.png',
            mentionPath: 'plugin://openai-docs',
          },
        ]}
        pluginStatus="ready"
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    expect(screen.queryByText('重新检测安装的插件')).toBeNull();
    const pluginItem = screen.getByText('OpenAI Docs').closest('[role="menuitem"]');
    const pluginImages = pluginItem?.querySelectorAll('img');
    expect(pluginImages).toHaveLength(2);
    expect(pluginImages?.[0]?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(pluginImages?.[0]?.className).toContain('dark:hidden');
    expect(pluginImages?.[1]?.className).toContain('dark:block');
    fireEvent.error(pluginImages?.[0] as HTMLImageElement);
    fireEvent.error(pluginImages?.[1] as HTMLImageElement);
    expect(pluginItem?.querySelectorAll('[data-plugin-icon-fallback]')).toHaveLength(2);
    await user.click(screen.getByText('OpenAI Docs'));

    expect(editor.textContent).toContain('OpenAI Docs');
    const mention = screen.getByRole('note', { name: 'OpenAI Docs' });
    const mentionImages = mention.querySelectorAll('img');
    expect(mentionImages).toHaveLength(2);
    expect(mentionImages[0]?.getAttribute('src')).toBe(
      'https://example.com/openai-docs.png',
    );
    expect(mentionImages[1]?.getAttribute('src')).toBe(
      'https://example.com/openai-docs-dark.png',
    );
    expect(screen.queryByRole('link', { name: 'OpenAI Docs' })).toBeNull();
    expect(screen.getByTestId('selected-mention-count').textContent).toBe('1');
  });

  it('输入 / 展示技能面板并插入统一图标的 Skill mention', async () => {
    const user = userEvent.setup();
    render(
      <ComposerHarness
        onOpenMention={vi.fn()}
        skillOptions={[
          {
            description: 'Internal prototype QA comparison against a visual source',
            displayName: 'Design QA',
            name: 'design-qa',
            path: '/Users/example/.codex/skills/design-qa/SKILL.md',
            scope: 'user',
          },
          {
            description: 'Create and edit Word and Google Docs files',
            displayName: 'Documents',
            name: 'documents',
            path: '/Users/example/.codex/skills/documents/SKILL.md',
            scope: 'user',
          },
        ]}
        skillStatus="ready"
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '/Design');

    const listbox = screen.getByRole('listbox', { name: '选择命令或 Skill' });
    expect(
      within(listbox).getByRole('option', { name: /Design QA/ }),
    ).toBeTruthy();
    expect(within(listbox).getByText(/Internal prototype QA/)).toBeTruthy();
    expect(within(listbox).getByText('个人')).toBeTruthy();
    expect(screen.getByText('技能')).toBeTruthy();

    await user.click(within(listbox).getByRole('option', { name: /Design QA/ }));

    expect(editor.textContent).toContain('Design QA');
    const mention = screen.getByRole('note', { name: 'Design QA' });
    expect(mention.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/mentions/box.svg',
    );
    expect(
      screen.queryByRole('listbox', { name: '选择命令或 Skill' }),
    ).toBeNull();
    expect(screen.getByTestId('selected-mention-count').textContent).toBe('1');
  });

  it('展示当前上下文窗口，并从 / 菜单手动触发压缩', async () => {
    const user = userEvent.setup();
    const onCompact = vi.fn();
    const contextUsage: CodexThreadTokenUsage = {
      last: {
        cachedInputTokens: 40_000,
        inputTokens: 140_000,
        outputTokens: 9_000,
        reasoningOutputTokens: 2_000,
        totalTokens: 151_000,
      },
      modelContextWindow: 258_000,
      total: {
        cachedInputTokens: 90_000,
        inputTokens: 180_000,
        outputTokens: 12_000,
        reasoningOutputTokens: 2_000,
        totalTokens: 300_000,
      },
    };

    const { rerender } = render(
      <ComposerHarness
        contextUsage={contextUsage}
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );

    const usageTrigger = screen.getByRole('button', {
      name: '背景信息窗口：58% 已用',
    });
    const initialArcStyle = within(usageTrigger)
      .getByTestId('context-usage-progress-arc')
      .getAttribute('style');
    expect(
      within(usageTrigger)
        .getByTestId('context-usage-progress')
        .getAttribute('data-context-percent'),
    ).toBe('58');
    await user.hover(usageTrigger);
    const usage = await screen.findByRole('status', { name: '上下文用量' });
    expect(usage.closest('[data-slot="hover-card-content"]')?.className).toContain(
      'min-w-[190px]',
    );
    expect(within(usage).getByText('背景信息窗口：')).toBeTruthy();
    expect(within(usage).getByText('58% 已用（剩余 42%）')).toBeTruthy();
    expect(within(usage).getByText('已用 151k 标记，共 258k')).toBeTruthy();

    const updatedUsage: CodexThreadTokenUsage = {
      ...contextUsage,
      last: { ...contextUsage.last, totalTokens: 200_000 },
    };
    rerender(
      <ComposerHarness
        contextUsage={updatedUsage}
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );
    expect(
      screen
        .getByTestId('context-usage-progress')
        .getAttribute('data-context-percent'),
    ).toBe('77');
    expect(
      screen.getByTestId('context-usage-progress-arc').getAttribute('style'),
    ).not.toBe(initialArcStyle);

    rerender(
      <ComposerHarness
        contextUsage={{
          ...updatedUsage,
          last: { ...updatedUsage.last, totalTokens: 300_000 },
        }}
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );
    expect(
      screen
        .getByTestId('context-usage-progress')
        .getAttribute('data-context-percent'),
    ).toBe('100');
    expect(
      screen.getByRole('button', { name: '背景信息窗口：100% 已用' }),
    ).toBeTruthy();

    rerender(
      <ComposerHarness
        compacting
        contextUsage={updatedUsage}
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );
    const compactingTrigger = screen.getByRole('button', {
      name: '背景信息窗口：正在压缩',
    });
    expect(
      within(compactingTrigger)
        .getByTestId('context-usage-progress')
        .querySelector('.animate-spin'),
    ).toBeTruthy();
    expect(
      within(compactingTrigger).queryByTestId('context-usage-progress-arc'),
    ).toBeNull();

    rerender(
      <ComposerHarness
        contextUsage={updatedUsage}
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '/');
    const listbox = screen.getByRole('listbox', { name: '选择命令或 Skill' });
    const compact = within(listbox).getByRole('option', { name: /压缩/ });
    expect(within(compact).getByText('压缩此任务的上下文（已占用 77%）')).toBeTruthy();
    await user.click(compact);

    expect(onCompact).toHaveBeenCalledOnce();
    expect(editor.textContent).toBe('');
    expect(
      screen.queryByRole('listbox', { name: '选择命令或 Skill' }),
    ).toBeNull();
  });

  it('首条消息前展示空进度环并解释用量尚未产生', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness onOpenMention={vi.fn()} />);

    const usageTrigger = screen.getByRole('button', {
      name: '背景信息窗口：发送首条消息后显示',
    });
    expect(
      within(usageTrigger)
        .getByTestId('context-usage-progress')
        .getAttribute('data-context-percent'),
    ).toBe('0');

    await user.hover(usageTrigger);
    expect(
      await screen.findByText('发送首条消息后显示'),
    ).toBeTruthy();
  });

  it('任务运行中禁用 / 压缩命令并解释原因', async () => {
    const user = userEvent.setup();
    const onCompact = vi.fn();
    render(
      <ComposerHarness
        active
        compactUnavailableReason="当前任务运行中"
        onCompact={onCompact}
        onOpenMention={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '/');
    const compact = within(
      screen.getByRole('listbox', { name: '选择命令或 Skill' }),
    ).getByRole('option', { name: /压缩/ });
    expect(compact.getAttribute('aria-disabled')).toBe('true');
    expect(within(compact).getByText('当前任务运行中')).toBeTruthy();
    await user.click(compact);
    expect(onCompact).not.toHaveBeenCalled();
  });

  it('插件自动加载失败时才提供重试入口', async () => {
    const user = userEvent.setup();
    const onDetectPlugins = vi.fn();
    render(
      <ComposerHarness
        onDetectPlugins={onDetectPlugins}
        onOpenMention={vi.fn()}
        pluginStatus="error"
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('插件加载失败，重试'));

    expect(onDetectPlugins).toHaveBeenCalledOnce();
  });

  it('展示已选附件并支持移除', async () => {
    const user = userEvent.setup();
    const onAttachmentRemove = vi.fn();
    render(
      <ComposerHarness
        attachments={[
          {
            attachmentId: 'attachment-1',
            isImage: false,
            kind: 'folder',
            mediaType: null,
            name: '资料',
            previewAvailable: false,
            previewMediaType: null,
            sizeBytes: null,
          },
        ]}
        onAttachmentRemove={onAttachmentRemove}
        onOpenMention={vi.fn()}
      />,
    );

    const composerAttachment = screen
      .getByText('资料')
      .closest('[data-attachment-kind]');
    expect(composerAttachment?.getAttribute('data-attachment-variant')).toBe(
      'composer',
    );
    expect(composerAttachment?.className).toContain('h-16');
    await user.click(screen.getByRole('button', { name: '移除 资料' }));
    expect(onAttachmentRemove).toHaveBeenCalledWith('attachment-1');
  });

  it('粘贴未产生原生附件时保留纯文本和光标语义', async () => {
    const onAttachmentPaste = vi.fn().mockResolvedValue(false);
    render(
      <ComposerHarness
        onAttachmentPaste={onAttachmentPaste}
        onOpenMention={vi.fn()}
      />,
    );
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    fireEvent.paste(editor, {
      clipboardData: { getData: () => '粘贴文本' },
    });

    await waitFor(() => {
      expect(onAttachmentPaste).toHaveBeenCalledOnce();
      expect(editor.textContent).toBe('粘贴文本');
    });
  });

  it('粘贴产生原生附件时不把剪贴板占位文本插入编辑器', async () => {
    const onAttachmentPaste = vi.fn().mockResolvedValue(true);
    render(
      <ComposerHarness
        onAttachmentPaste={onAttachmentPaste}
        onOpenMention={vi.fn()}
      />,
    );
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    fireEvent.paste(editor, {
      clipboardData: { getData: () => '/Users/refinex/Desktop/image.png' },
    });

    await waitFor(() => expect(onAttachmentPaste).toHaveBeenCalledOnce());
    expect(editor.textContent).toBe('');
    expect(document.activeElement).toBe(editor);
  });

  it('图片附件支持大图预览、键盘关闭与纯附件发送', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <ComposerHarness
        attachments={[
          {
            attachmentId: 'image-1',
            isImage: true,
            kind: 'file',
            mediaType: 'image/png',
            name: 'diagram.png',
            previewAvailable: true,
            previewMediaType: 'image/png',
            sizeBytes: 1024,
          },
        ]}
        attachmentPreviewUrls={{
          'image-1': 'data:image/png;base64,aW1hZ2U=',
        }}
        onOpenMention={vi.fn()}
        onSend={onSend}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: '预览图片 diagram.png' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByAltText('diagram.png').getAttribute('src')).toBe(
      'data:image/png;base64,aW1hZ2U=',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const send = screen.getByRole('button', { name: '发送' });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    await user.click(send);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('把文档提及插入光标位置并允许点击打开文档', async () => {
    const user = userEvent.setup();
    const onOpenMention = vi.fn();

    render(<ComposerHarness onOpenMention={onOpenMention} />);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '请阅读 @READ');
    await user.click(screen.getByRole('option', { name: /README/ }));

    const mention = screen.getByRole('link', { name: 'README.md' });
    expect(editor.contains(mention)).toBe(true);
    expect(mention.getAttribute('title')).toBe('README · README.md');
    expect(mention.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/mentions/file-text.svg',
    );
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

    const listbox = screen.getByRole('listbox', {
      name: '提及工作区文档或图稿',
    });
    const menu = listbox.closest('[data-mention-menu]');
    expect(menu?.className).not.toContain('shadow-xl');
    expect(menu?.className).toContain('shadow-none');
    expect(editor.getAttribute('aria-controls')).toBe(listbox.id);
    expect(
      screen.getByRole('option', { name: /README/ }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('在提及候选中标记当前文档并保留实际路径', async () => {
    const user = userEvent.setup();
    render(
      <ComposerHarness
        currentDocument={currentWorkspaceDocument}
        mentionDocuments={[currentWorkspaceDocument]}
        onOpenMention={vi.fn()}
      />,
    );

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@SpringB');

    const option = screen.getByRole('option', {
      name: '提及 Spring Boot 介绍，当前文档',
    });
    expect(within(option).getByText('当前文档')).toBeTruthy();
    expect(within(option).getByText('Test.md')).toBeTruthy();
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
      expect(
        screen.getByRole('link', { name: 'Docs/Release Notes.md' }),
      ).toBeTruthy();
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
    expect(mention.tagName).toBe('A');
    expect(mention.getAttribute('href')).toBe('/workspace/README.md');
    expect(mention.className.split(/\s+/)).toContain('inline');
    expect(mention.className.split(/\s+/)).not.toContain('inline-flex');
    expect(mention.className).toContain('[font:inherit]');
    expect(mention.className).toContain('leading-[inherit]');
    expect(mention.className).toContain('text-left');
    expect(mention.parentElement?.className).not.toContain('text-pretty');
    expect(mention.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/mentions/file-text.svg',
    );
    expect(mention.firstElementChild?.className).toContain('align-[-0.125em]');
    expect(screen.getByText('比较 README 与')).toBeTruthy();

    await user.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith('/workspace/README.md');
  });

  it('已发送消息保留插件真实图标和 Skill 统一图标', () => {
    const text = '使用 OpenAI Docs 和 Design QA';
    const pluginStart = text.indexOf('OpenAI Docs');
    const skillStart = text.indexOf('Design QA');

    render(
      <UserMessageContent
        mentions={[
          {
            end: pluginStart + 'OpenAI Docs'.length,
            kind: 'plugin',
            label: 'OpenAI Docs',
            path: 'plugin://openai-docs',
            start: pluginStart,
          },
          {
            end: skillStart + 'Design QA'.length,
            kind: 'skill',
            label: 'Design QA',
            path: '/Users/example/.codex/skills/design-qa/SKILL.md',
            start: skillStart,
          },
        ]}
        pluginOptions={[
          {
            darkIconUrl: '/icons/plugins/openai-docs-dark.png',
            description: 'OpenAI 官方文档',
            displayName: 'OpenAI Docs',
            iconUrl: '/icons/plugins/openai-docs-light.png',
            id: 'openai-docs',
            mentionPath: 'plugin://openai-docs',
          },
        ]}
        text={text}
        onOpenMention={vi.fn()}
      />,
    );

    const plugin = screen.getByRole('note', { name: 'OpenAI Docs' });
    const pluginImages = plugin.querySelectorAll('img');
    expect(plugin.className.split(/\s+/)).toContain('inline');
    expect(plugin.className).toContain('[font:inherit]');
    expect(plugin.firstElementChild?.className).toContain('align-[-0.125em]');
    expect(pluginImages).toHaveLength(2);
    expect(pluginImages[0]?.getAttribute('src')).toBe(
      '/icons/plugins/openai-docs-light.png',
    );
    expect(pluginImages[1]?.getAttribute('src')).toBe(
      '/icons/plugins/openai-docs-dark.png',
    );

    const skill = screen.getByRole('note', { name: 'Design QA' });
    expect(skill.querySelector('img')?.getAttribute('src')).toBe(
      '/icons/mentions/box.svg',
    );
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

    expect(screen.getByRole('link', { name: 'README.md' })).toBeTruthy();
    await user.keyboard('{Backspace}');

    expect(screen.queryByRole('link', { name: 'README.md' })).toBeNull();
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
        models={[]}
        permissionMode="ask"
        permissionProfiles={[]}
        permissionSwitchDisabled={false}
        runtimeStatus="loading"
        selectedModel=""
        selectedModelInfo={null}
        submitting={false}
        value="总结当前文档"
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

  it('失败的工具组和技术详情保持默认折叠', async () => {
    const user = userEvent.setup();
    const trace = createTrace({ historical: false, status: 'failed' });
    const failedGroup = trace.segments.find(
      (segment) => segment.type === 'group',
    );
    if (!failedGroup || failedGroup.type !== 'group') {
      throw new Error('缺少工具组测试数据');
    }
    failedGroup.status = 'failed';
    failedGroup.activities[0].status = 'failed';

    render(
      <ProcessingTrace
        trace={trace}
        onApprove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    const group = screen.getByRole('button', {
      name: '读取了文件，展开工具活动',
    });
    expect(group.getAttribute('aria-expanded')).toBe('false');

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

    await user.click(
      screen.getByRole('button', {
        name: '编辑了文件，展开工具活动',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: '修改 README.md，展开详情',
      }),
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
    expect(preview.querySelector('.madora-thin-scrollarea')).toBeTruthy();

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
  active = false,
  attachments = [],
  attachmentPreviewUrls = {},
  compacting = false,
  compactUnavailableReason = null,
  collaborationMode = 'default',
  contextUsage = null,
  currentDocument = null,
  goalActive = false,
  goalDraftMode = false,
  goalUnavailableReason = null,
  mentionDocuments = [mentionedDocument],
  onAttachmentRemove = vi.fn(),
  onAttachmentPaste = vi.fn().mockResolvedValue(false),
  onAttachmentSelect = vi.fn(),
  onDetectPlugins = vi.fn(),
  onCollaborationModeChange = vi.fn(),
  onCompact = vi.fn(),
  onGoalModeChange = vi.fn(),
  onOpenMention,
  onSend = vi.fn(),
  pluginOptions = [],
  pluginStatus = 'idle',
  planModeAvailable = false,
  skillOptions = [],
  skillStatus = 'idle',
}: {
  active?: boolean;
  attachments?: CodexContextAttachment[];
  attachmentPreviewUrls?: Record<string, string>;
  compacting?: boolean;
  compactUnavailableReason?: string | null;
  collaborationMode?: 'default' | 'plan';
  contextUsage?: CodexThreadTokenUsage | null;
  currentDocument?: typeof currentWorkspaceDocument | null;
  goalActive?: boolean;
  goalDraftMode?: boolean;
  goalUnavailableReason?: string | null;
  mentionDocuments?: Array<typeof mentionedDocument>;
  onAttachmentRemove?: (attachmentId: string) => void;
  onAttachmentPaste?: () => Promise<boolean>;
  onAttachmentSelect?: (kind: 'file' | 'folder') => void;
  onDetectPlugins?: () => void;
  onCollaborationModeChange?: (mode: 'default' | 'plan') => void;
  onCompact?: () => void;
  onGoalModeChange?: (enabled: boolean) => void;
  onOpenMention: (path: string) => void;
  onSend?: () => void;
  pluginOptions?: Array<{
    description: string | null;
    darkIconUrl?: string | null;
    displayName: string;
    id: string;
    iconUrl?: string | null;
    mentionPath: string;
  }>;
  pluginStatus?: 'error' | 'idle' | 'loading' | 'ready';
  planModeAvailable?: boolean;
  skillOptions?: Array<{
    description: string;
    displayName: string;
    name: string;
    path: string;
    scope: 'admin' | 'repo' | 'system' | 'user';
  }>;
  skillStatus?: 'error' | 'idle' | 'loading' | 'ready';
}) {
  const [value, setValue] = React.useState('');
  const [mentionCount, setMentionCount] = React.useState(0);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);

  return (
    <>
      <AiComposer
        active={active}
        approvalPolicyAvailability={{ never: true, onRequest: true }}
        attachments={attachments}
        attachmentPreviewUrls={attachmentPreviewUrls}
        autoReviewAvailable
        collaborationMode={collaborationMode}
        compacting={compacting}
        compactUnavailableReason={compactUnavailableReason}
        contextUsage={contextUsage}
        currentDocument={currentDocument}
        effort="medium"
        goalActive={goalActive}
        goalDraftMode={goalDraftMode}
        goalUnavailableReason={goalUnavailableReason}
        mentionDocuments={mentionDocuments}
        mentionQuery={mentionQuery}
        models={[]}
        permissionMode="ask"
        permissionProfiles={[]}
        permissionSwitchDisabled={false}
        planModeAvailable={planModeAvailable}
        pluginOptions={pluginOptions}
        pluginStatus={pluginStatus}
        runtimeStatus="ready"
        selectedModel=""
        selectedModelInfo={null}
        skillOptions={skillOptions}
        skillStatus={skillStatus}
        submitting={false}
        value={value}
        onAttachmentRemove={onAttachmentRemove}
        onAttachmentPaste={onAttachmentPaste}
        onAttachmentSelect={onAttachmentSelect}
        onDetectPlugins={onDetectPlugins}
        onCollaborationModeChange={onCollaborationModeChange}
        onCompact={onCompact}
        onEffortChange={vi.fn()}
        onGoalModeChange={onGoalModeChange}
        onInterrupt={vi.fn()}
        onMentionQueryChange={setMentionQuery}
        onMentionsChange={(mentions) => setMentionCount(mentions.length)}
        onModelChange={vi.fn()}
        onPermissionModeChange={vi.fn()}
        onOpenMention={onOpenMention}
        onSend={onSend}
        onValueChange={setValue}
      />
      <output data-testid="selected-mention-count">{mentionCount}</output>
    </>
  );
}

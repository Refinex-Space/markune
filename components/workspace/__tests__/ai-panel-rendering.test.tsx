import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AiComposer,
  AiMessageContent,
  AiPanelHeader,
  UserMessageContent,
} from '../ai-panel';

const mentionedDocument = {
  absolutePath: '/workspace/README.md',
  id: 'readme',
  name: 'README.md',
  relativePath: 'README.md',
  title: 'README',
};

describe('AI message rendering', () => {
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
});

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

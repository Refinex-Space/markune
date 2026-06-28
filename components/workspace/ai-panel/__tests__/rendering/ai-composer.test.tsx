import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { AiComposer } from '../../rendering/ai-composer';
import type { MentionOption } from '../../rendering/ai-mention-serializer';

describe('AiComposer', () => {
  it('渲染编辑器与发送按钮（初始禁用）', () => {
    const { container, getByText } = render(
      <AiComposer onSend={() => {}} onStop={() => {}} isStreaming={false} mentionOptions={[]} />,
    );
    expect(container.querySelector('[role="textbox"]')).not.toBeNull();
    expect(getByText('发送')).toBeTruthy();
  });

  it('流式中显示停止按钮', () => {
    const { getByText, queryByText } = render(
      <AiComposer onSend={() => {}} onStop={() => {}} isStreaming mentionOptions={[]} />,
    );
    expect(getByText('停止')).toBeTruthy();
    expect(queryByText('发送')).toBeNull();
  });

  it('点击停止触发 onStop', () => {
    const onStop = vi.fn();
    const { getByText } = render(
      <AiComposer onSend={() => {}} onStop={onStop} isStreaming mentionOptions={[]} />,
    );
    getByText('停止').click();
    expect(onStop).toHaveBeenCalled();
  });

  it('上下文附加指示在 contextAttached 时显示', () => {
    const { getByText, queryByText } = render(
      <AiComposer
        onSend={() => {}}
        onStop={() => {}}
        isStreaming={false}
        mentionOptions={[]}
        contextAttached
      />,
    );
    expect(getByText('已附加当前文档上下文')).toBeTruthy();
  });

  it('无上下文附加时不显示指示', () => {
    const { queryByText } = render(
      <AiComposer onSend={() => {}} onStop={() => {}} isStreaming={false} mentionOptions={[]} />,
    );
    expect(queryByText('已附加当前文档上下文')).toBeNull();
  });

  it('@提示与快捷键提示可见', () => {
    const { getByText } = render(
      <AiComposer onSend={() => {}} onStop={() => {}} isStreaming={false} mentionOptions={[]} />,
    );
    expect(getByText('@ 提及')).toBeTruthy();
    expect(getByText('Enter 发送 · Shift+Enter 换行')).toBeTruthy();
  });

  it('mentionOptions 传入但不触发时不显示下拉', () => {
    const options: MentionOption[] = [
      { id: 'file:a.md', label: 'a.md', type: 'file', path: 'a.md' },
    ];
    const { container } = render(
      <AiComposer
        onSend={() => {}}
        onStop={() => {}}
        isStreaming={false}
        mentionOptions={options}
      />,
    );
    expect(container.querySelector('.ai-mention-popover')).toBeNull();
  });
});

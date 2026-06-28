import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef } from 'react';

import {
  AiMentionsEditor,
  type AiMentionsEditorHandle,
} from '../../rendering/ai-mentions-editor';
import { AiMentionPopover } from '../../rendering/ai-mention-popover';
import type { MentionOption } from '../../rendering/ai-mention-serializer';

// jsdom 的 Selection/Range 支持有限，但基本的 insertMention/getValue/clear 可测
function renderEditor(props?: Parameters<typeof AiMentionsEditor>[1] & { ref?: React.Ref<AiMentionsEditorHandle> }) {
  let handle: AiMentionsEditorHandle | null = null;
  function Harness() {
    const ref = useRef<AiMentionsEditorHandle>(null);
    return (
      <AiMentionsEditor
        ref={(h) => {
          handle = h;
          if (props?.ref) {
            (props.ref as React.MutableRefObject<AiMentionsEditorHandle | null>).current = h;
          }
        }}
        placeholder="输入消息…"
        {...props}
      />
    );
  }
  const utils = render(<Harness />);
  return { ...utils, getHandle: () => handle };
}

describe('AiMentionsEditor ref API', () => {
  it('focus 不抛错', () => {
    const { getHandle } = renderEditor();
    expect(() => getHandle()?.focus()).not.toThrow();
  });

  it('clear 清空编辑器', () => {
    const { getHandle, container } = renderEditor();
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    editor.textContent = '一些内容';
    act(() => {
      getHandle()?.clear();
    });
    expect(editor.textContent).toBe('');
  });

  it('getValue 返回序列化文本（含 chip token）', () => {
    const { getHandle, container } = renderEditor();
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    // 直接构造含 chip 的 DOM（模拟已插入 mention）
    editor.innerHTML =
      '帮我读 <span contenteditable="false" data-mention-id="file:readme.md" data-mention-type="file"><span>📄</span><span>readme.md</span></span> 文件';
    const value = getHandle()?.getValue() ?? '';
    expect(value).toContain('帮我读');
    expect(value).toContain('@[file:readme.md]');
  });

  it('getValue 纯文本无 mention 原样返回', () => {
    const { getHandle, container } = renderEditor();
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    editor.textContent = '普通文本';
    expect(getHandle()?.getValue()).toBe('普通文本');
  });

  it('onChange 在输入时触发', () => {
    const onChange = vi.fn();
    const { container } = renderEditor({ onChange });
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    editor.textContent = 'x';
    act(() => {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('AiMentionPopover', () => {
  const options: MentionOption[] = [
    { id: 'file:a.md', label: 'a.md', type: 'file', path: 'docs/a.md' },
    { id: 'skill:write', label: 'write', type: 'skill', path: '写作' },
  ];

  it('渲染选项列表', () => {
    const { getByText } = render(
      <AiMentionPopover options={options} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(getByText('a.md')).toBeTruthy();
    expect(getByText('write')).toBeTruthy();
  });

  it('点击选项触发 onSelect', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <AiMentionPopover options={options} onSelect={onSelect} onClose={() => {}} />,
    );
    getByText('a.md').click();
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('空选项不渲染', () => {
    const { container } = render(
      <AiMentionPopover options={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelector('.ai-mention-popover')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react';

import { AiEditTool } from '../../rendering/ai-edit-tool';
import { AiDiffView } from '../../rendering/ai-diff-view';
import { AiAssistantMessage } from '../../rendering/ai-assistant-message';
import { computeLineDiff } from '../../rendering/ai-diff';
import type { AiMessage, MessagePart } from '../../ai-contracts';

describe('AiDiffView', () => {
  it('渲染 added/removed/context 行', () => {
    const lines = computeLineDiff('old', 'new');
    const { container } = render(<AiDiffView lines={lines} />);
    expect(container.textContent).toContain('old');
    expect(container.textContent).toContain('new');
  });

  it('超过 maxLines 截断', () => {
    const lines = computeLineDiff('', Array.from({ length: 300 }, (_, i) => `line${i}`).join('\n'));
    const { container } = render(<AiDiffView lines={lines} maxLines={10} />);
    expect(container.textContent).toContain('还有');
  });
});

describe('AiEditTool', () => {
  it('Edit 工具显示文件名 + diff 统计', () => {
    const part: MessagePart = {
      type: 'tool-Edit',
      toolCallId: 'e1',
      state: 'output-available',
      input: { file_path: '/app/src/a.ts', old_string: 'x', new_string: 'y\nz' },
      output: {},
    };
    const { container } = render(<AiEditTool part={part} />);
    expect(container.textContent).toContain('a.ts');
    expect(container.textContent).toContain('+');
    expect(container.textContent).toContain('-');
  });

  it('Write 工具用 content 计算 diff', () => {
    const part: MessagePart = {
      type: 'tool-Write',
      toolCallId: 'w1',
      state: 'output-available',
      input: { file_path: '/app/new.ts', content: 'a\nb' },
      output: {},
    };
    const { container } = render(<AiEditTool part={part} />);
    expect(container.textContent).toContain('new.ts');
    // 全新增：+2
    expect(container.textContent).toContain('+');
  });

  it('点击展开显示 diff 视图', () => {
    const part: MessagePart = {
      type: 'tool-Edit',
      toolCallId: 'e2',
      state: 'output-available',
      input: { file_path: '/a.ts', old_string: 'old line', new_string: 'new line' },
      output: {},
    };
    const { container, getByRole } = render(<AiEditTool part={part} />);
    // 初始未展开，diff 行不可见
    expect(container.textContent).not.toContain('old line');
    act(() => {
      getByRole('button').click();
    });
    expect(container.textContent).toContain('old line');
    expect(container.textContent).toContain('new line');
  });

  it('pending 时不显示 diff 统计', () => {
    const part: MessagePart = {
      type: 'tool-Edit',
      toolCallId: 'e3',
      state: 'input-available',
      input: { file_path: '/a.ts', old_string: 'x', new_string: 'y' },
    };
    const { container } = render(<AiEditTool part={part} isPending />);
    expect(container.querySelector('.ai-tool-shimmer')).not.toBeNull();
  });
});

describe('AiAssistantMessage Edit/Write 分发', () => {
  it('Edit 工具用 AiEditTool 渲染', () => {
    const message: AiMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-Edit',
          toolCallId: 'e1',
          state: 'output-available',
          input: { file_path: '/app/config.ts', old_string: 'a', new_string: 'b' },
          output: {},
        },
      ],
      createdAt: 1,
    };
    const { container } = render(<AiAssistantMessage message={message} />);
    expect(container.textContent).toContain('config.ts');
  });
});

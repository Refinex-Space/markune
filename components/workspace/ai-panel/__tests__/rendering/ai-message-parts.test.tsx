import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AiUserMessageBubble } from '../../rendering/ai-user-message-bubble';
import { AiAssistantMessage } from '../../rendering/ai-assistant-message';
import type { AiMessage } from '../../ai-contracts';

describe('AiUserMessageBubble', () => {
  it('渲染用户文本（保留换行）', () => {
    const { container } = render(<AiUserMessageBubble text={'第一行\n第二行'} />);
    expect(container.textContent).toContain('第一行');
    expect(container.textContent).toContain('第二行');
  });

  it('应用轻量气泡样式（侧边栏左对齐）', () => {
    const { container } = render(<AiUserMessageBubble text="hi" />);
    expect(container.querySelector('[data-role="user"]')).not.toBeNull();
  });
});

describe('AiAssistantMessage', () => {
  it('渲染单个 text part', () => {
    const message: AiMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: '你好' }],
      createdAt: 1,
    };
    const { container } = render(<AiAssistantMessage message={message} />);
    expect(container.textContent).toContain('你好');
  });

  it('多个 text part 全部渲染', () => {
    const message: AiMessage = {
      id: 'a2',
      role: 'assistant',
      parts: [
        { type: 'text', text: '前段' },
        { type: 'text', text: '后段' },
      ],
      createdAt: 1,
    };
    const { container } = render(<AiAssistantMessage message={message} />);
    expect(container.textContent).toContain('前段');
    expect(container.textContent).toContain('后段');
  });

  it('流式中无 parts 时显示占位卡', () => {
    const message: AiMessage = {
      id: 'a3',
      role: 'assistant',
      parts: [],
      createdAt: 1,
    };
    const { container } = render(
      <AiAssistantMessage message={message} isStreaming isLastMessage />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('tool-* part 用 registry 元数据渲染（D 子项目已接入工具卡）', () => {
    const message: AiMessage = {
      id: 'a4',
      role: 'assistant',
      parts: [
        { type: 'tool-Bash', toolCallId: 't1', state: 'output-available', input: { command: 'ls' }, output: { stdout: 'a' } },
      ],
      createdAt: 1,
    };
    const { container } = render(<AiAssistantMessage message={message} />);
    // registry title: output-available → 'Ran command'；subtitle: 'ls'
    expect(container.textContent).toContain('Ran command');
    expect(container.textContent).toContain('ls');
  });

  it('reasoning part 渲染占位（F 子项目接入思考卡）', () => {
    const message: AiMessage = {
      id: 'a5',
      role: 'assistant',
      parts: [{ type: 'reasoning', text: '我在思考' }],
      createdAt: 1,
    };
    const { container } = render(<AiAssistantMessage message={message} />);
    expect(container.textContent).toContain('我在思考');
  });
});

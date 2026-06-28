import { describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react';

import { AiToolCall } from '../../rendering/ai-tool-call';
import { AiMcpToolCall } from '../../rendering/ai-mcp-tool-call';
import { AiAssistantMessage } from '../../rendering/ai-assistant-message';
import type { AiMessage, MessagePart } from '../../ai-contracts';

describe('AiToolCall', () => {
  it('渲染 title + subtitle', () => {
    const { getByText } = render(
      <AiToolCall title="Ran command" subtitle="ls -la" />,
    );
    expect(getByText('Ran command')).toBeTruthy();
    expect(getByText('ls -la')).toBeTruthy();
  });

  it('pending 时应用 shimmer 类', () => {
    const { container } = render(<AiToolCall title="Running" isPending />);
    expect(container.querySelector('.ai-tool-shimmer')).not.toBeNull();
  });

  it('非 pending 不应用 shimmer', () => {
    const { container } = render(<AiToolCall title="Done" />);
    expect(container.querySelector('.ai-tool-shimmer')).toBeNull();
  });

  it('subtitle HTML 渲染（diff 统计）', () => {
    const { container } = render(
      <AiToolCall title="edit.ts" subtitle={'<span>+2</span>'} />,
    );
    expect(container.querySelector('span span')?.innerHTML).toContain('+2');
  });
});

describe('AiMcpToolCall', () => {
  it('解析 MCP 工具并显示 displayName', () => {
    const part: MessagePart = {
      type: 'tool-mcp__github__search_issues',
      toolCallId: 'm1',
      state: 'output-available',
      input: { query: 'bug' },
      output: { results: [{ id: 1 }, { id: 2 }] },
    };
    const { getByText } = render(<AiMcpToolCall part={part} />);
    expect(getByText('Search Issues')).toBeTruthy();
    expect(getByText('2 结果')).toBeTruthy();
  });

  it('点击展开显示参数', () => {
    const part: MessagePart = {
      type: 'tool-mcp__github__get_issue',
      toolCallId: 'm2',
      state: 'output-available',
      input: { number: 42 },
      output: { title: 'Bug' },
    };
    const { container, getByRole } = render(<AiMcpToolCall part={part} />);
    // 初始未展开，参数不可见
    expect(container.textContent).not.toContain('42');
    // 点击展开（act 包裹触发状态更新）
    act(() => {
      getByRole('button').click();
    });
    expect(container.textContent).toContain('42');
  });
});

describe('AiAssistantMessage 工具分发', () => {
  it('Bash 工具用 registry 元数据渲染', () => {
    const message: AiMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-Bash',
          toolCallId: 't1',
          state: 'output-available',
          input: { command: 'echo hi' },
          output: { stdout: 'hi' },
        },
      ],
      createdAt: 1,
    };
    const { getByText } = render(<AiAssistantMessage message={message} />);
    // registry title: Ran command
    expect(getByText('Ran command')).toBeTruthy();
  });

  it('MCP 工具用折叠卡片', () => {
    const message: AiMessage = {
      id: 'a2',
      role: 'assistant',
      parts: [
        {
          type: 'tool-mcp__slack__send_message',
          toolCallId: 'm1',
          state: 'output-available',
          input: { channel: 'general' },
          output: { ok: true },
        },
      ],
      createdAt: 1,
    };
    const { getByText } = render(<AiAssistantMessage message={message} />);
    expect(getByText('Send Message')).toBeTruthy();
  });
});

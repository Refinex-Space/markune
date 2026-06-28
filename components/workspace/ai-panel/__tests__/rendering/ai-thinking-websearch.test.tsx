import { describe, expect, it } from 'vitest';
import { render, act } from '@testing-library/react';

import { AiThinkingBlock } from '../../rendering/ai-thinking-block';
import { AiWebSearchTool } from '../../rendering/ai-web-search-tool';
import type { MessagePart } from '../../ai-contracts';

describe('AiThinkingBlock', () => {
  it('有内容时显示思考 header + 预览', () => {
    const part: MessagePart = { type: 'reasoning', text: '我在思考这个问题的解决方案' };
    const { container, getByText } = render(<AiThinkingBlock part={part} />);
    expect(getByText('思考')).toBeTruthy();
    expect(container.textContent).toContain('我在思考');
  });

  it('流式无内容时显示思考中 shimmer', () => {
    const part: MessagePart = { type: 'reasoning', text: '' };
    const { container } = render(<AiThinkingBlock part={part} isStreaming />);
    expect(container.querySelector('.ai-tool-shimmer')).not.toBeNull();
  });

  it('点击展开显示完整思考', () => {
    const part: MessagePart = {
      type: 'reasoning',
      text: '第一行\n第二行详细内容',
    };
    const { container, getByRole } = render(<AiThinkingBlock part={part} />);
    // 折叠时只显示首行预览，第二行不可见
    expect(container.textContent).not.toContain('第二行详细内容');
    act(() => {
      getByRole('button').click();
    });
    expect(container.textContent).toContain('第二行详细内容');
  });
});

describe('AiWebSearchTool', () => {
  it('显示 query 与结果数', () => {
    const part: MessagePart = {
      type: 'tool-WebSearch',
      toolCallId: 'w1',
      state: 'output-available',
      input: { query: 'Next.js 15' },
      output: {
        results: [
          { title: 'Next.js', url: 'https://nextjs.org', snippet: 'The React framework' },
          { title: 'Docs', url: 'https://nextjs.org/docs' },
        ],
      },
    };
    const { getByText } = render(<AiWebSearchTool part={part} />);
    expect(getByText('Next.js 15')).toBeTruthy();
    expect(getByText('2 条结果')).toBeTruthy();
  });

  it('pending 时显示 shimmer', () => {
    const part: MessagePart = {
      type: 'tool-WebSearch',
      toolCallId: 'w2',
      state: 'input-available',
      input: { query: 'test' },
    };
    const { container } = render(<AiWebSearchTool part={part} isPending />);
    expect(container.querySelector('.ai-tool-shimmer')).not.toBeNull();
  });

  it('展开显示搜索结果列表', () => {
    const part: MessagePart = {
      type: 'tool-WebSearch',
      toolCallId: 'w3',
      state: 'output-available',
      input: { query: 'q' },
      output: {
        results: [{ title: '结果 A', url: 'https://a.com', snippet: '摘要 A' }],
      },
    };
    const { container, getByRole } = render(<AiWebSearchTool part={part} />);
    expect(container.textContent).not.toContain('结果 A');
    act(() => {
      getByRole('button').click();
    });
    expect(container.textContent).toContain('结果 A');
    expect(container.textContent).toContain('摘要 A');
  });
});

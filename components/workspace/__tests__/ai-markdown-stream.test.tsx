import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { splitAiMarkdownStream } from '../ai-markdown-stream';
import { AiMessageContent } from '../ai-message-content';
describe('AI rich content', () => {
  it('holds incomplete fenced content together and preserves exact text', () => {
    const text = '完成段落\n\n```ts\nconst a = 1;\n\n';
    const parts = splitAiMarkdownStream(text);
    expect(parts.stable).toBe('完成段落\n\n');
    expect(parts.stable + parts.tail).toBe(text);
    expect(splitAiMarkdownStream(text + '```\n\n尾部')).toEqual({
      stable: text + '```\n\n',
      tail: '尾部',
    });
  });
  it('renders math and keeps incomplete tails as text', () => {
    const { container } = render(
      <AiMessageContent markdown={'公式 $x^2$\n\n未完成 **粗'} streaming />,
    );
    expect(container.querySelector('.katex')).toBeTruthy();
    expect(container.querySelector('[data-streaming-tail]')?.textContent).toBe(
      '未完成 **粗',
    );
  });
  it('keeps remote image loading explicit', () => {
    const { container } = render(
      <AiMessageContent markdown="![结果](https://example.com/result.png)" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('button', { name: '加载网络图片：结果' }),
    ).toBeTruthy();
  });
});

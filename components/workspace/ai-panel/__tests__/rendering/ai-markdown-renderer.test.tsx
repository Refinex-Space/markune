import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AiMarkdownRenderer } from '../../rendering/ai-markdown-renderer';

describe('AiMarkdownRenderer', () => {
  it('渲染普通文本段落', () => {
    const { container } = render(<AiMarkdownRenderer content="你好世界" />);
    expect(container.textContent).toContain('你好世界');
  });

  it('渲染 markdown 加粗与列表', () => {
    const { container } = render(
      <AiMarkdownRenderer content={'- **加粗**\n- 普通'} />,
    );
    // streamdown 用带 data-streamdown="strong" 的 span 表达加粗
    expect(container.querySelectorAll('[data-streamdown="strong"]').length).toBe(1);
    expect(container.querySelectorAll('li').length).toBe(2);
  });

  it('渲染行内代码', () => {
    const { container } = render(<AiMarkdownRenderer content="用 `code` 标记" />);
    expect(container.querySelectorAll('code').length).toBeGreaterThan(0);
  });

  it('流式模式（isStreaming）不报错', () => {
    const { container } = render(
      <AiMarkdownRenderer content="未完成的代码块 \`\`\`" isStreaming />,
    );
    expect(container.textContent).toContain('未完成的代码块');
  });
});

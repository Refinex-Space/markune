import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { AiTextPart } from '../../rendering/ai-text-part';
import { AiPlanningPlaceholder } from '../../rendering/ai-planning-placeholder';

describe('AiTextPart', () => {
  it('渲染非空文本', () => {
    const { container } = render(<AiTextPart text="Hello AI" />);
    expect(container.textContent).toContain('Hello AI');
  });

  it('空文本不渲染', () => {
    const { container } = render(<AiTextPart text="" />);
    expect(container.querySelector('.ai-text-part')).toBeNull();
  });

  it('isLastPart + isStreaming 不报错', () => {
    const { container } = render(
      <AiTextPart text="流式文本" isStreaming isLastPart />,
    );
    expect(container.textContent).toContain('流式文本');
  });
});

describe('AiPlanningPlaceholder', () => {
  it('isStreaming 渲染占位卡', () => {
    const { container } = render(<AiPlanningPlaceholder isStreaming />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).toContain('…');
  });

  it('非 streaming 不渲染', () => {
    const { container } = render(<AiPlanningPlaceholder isStreaming={false} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';

import { AiQuickActions, QUICK_ACTIONS } from '../../rendering/ai-quick-actions';

describe('AiQuickActions', () => {
  it('初始未展开，点击 Sparkles 展开', () => {
    const { container, getByLabelText } = render(
      <AiQuickActions onAction={() => {}} />,
    );
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    act(() => {
      getByLabelText('快捷动作').click();
    });
    expect(container.querySelector('.fixed.inset-0')).not.toBeNull();
  });

  it('展开后显示所有快捷动作', () => {
    const { getByLabelText, getByText } = render(
      <AiQuickActions onAction={() => {}} />,
    );
    act(() => {
      getByLabelText('快捷动作').click();
    });
    for (const action of QUICK_ACTIONS) {
      expect(getByText(action.label)).toBeTruthy();
    }
  });

  it('点击动作触发 onAction 并关闭菜单', () => {
    const onAction = vi.fn();
    const { getByLabelText, getByText, container } = render(
      <AiQuickActions onAction={onAction} />,
    );
    act(() => {
      getByLabelText('快捷动作').click();
    });
    act(() => {
      getByText('总结全文').click();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0].id).toBe('summarize');
    // 菜单关闭
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('disabled 时不响应点击', () => {
    const { getByLabelText, container } = render(
      <AiQuickActions onAction={() => {}} disabled />,
    );
    act(() => {
      getByLabelText('快捷动作').click();
    });
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('QUICK_ACTIONS 包含核心写作动作', () => {
    const ids = QUICK_ACTIONS.map((a) => a.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('outline');
    expect(ids).toContain('rewrite');
    expect(ids).toContain('expand');
  });

  it('点击外部遮罩关闭菜单', () => {
    const { getByLabelText, container } = render(
      <AiQuickActions onAction={() => {}} />,
    );
    act(() => {
      getByLabelText('快捷动作').click();
    });
    const overlay = container.querySelector('.fixed.inset-0') as HTMLElement;
    act(() => {
      overlay.click();
    });
    expect(container.querySelector('.fixed.inset-0')).toBeNull();
  });
});

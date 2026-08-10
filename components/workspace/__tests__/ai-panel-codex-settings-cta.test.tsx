import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PanelContent } from '../ai-panel';
import { createEmptyConversation } from '../ai-panel-state';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { alt = '', ...rest } = props;
    return <img alt={String(alt)} {...rest} />;
  },
}));

describe('AiPanel Codex settings CTA', () => {
  it('运行时错误空态提供打开 Codex 设置入口', () => {
    const onOpenCodexSettings = vi.fn();

    render(
      <PanelContent
        account={null}
        authRequired={false}
        conversation={createEmptyConversation()}
        currentDocument={null}
        runtimeError="sidecar missing"
        runtimeStatus="error"
        signingIn={false}
        onApprove={vi.fn()}
        onOpenCodexSettings={onOpenCodexSettings}
        onOpenDocument={vi.fn()}
        onOpenPlanPreview={vi.fn()}
        onPrompt={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );

    expect(screen.getByText('无法连接 Codex')).toBeTruthy();
    fireEvent.click(screen.getByTestId('open-codex-settings-from-error'));
    expect(onOpenCodexSettings).toHaveBeenCalledTimes(1);
  });

  it('未登录空态提供配置自定义 API 入口', () => {
    const onOpenCodexSettings = vi.fn();

    render(
      <PanelContent
        account={null}
        authRequired
        conversation={createEmptyConversation()}
        currentDocument={null}
        runtimeError={null}
        runtimeStatus="ready"
        signingIn={false}
        onApprove={vi.fn()}
        onOpenCodexSettings={onOpenCodexSettings}
        onOpenDocument={vi.fn()}
        onOpenPlanPreview={vi.fn()}
        onPrompt={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );

    expect(screen.getByText('连接你的 ChatGPT 账户')).toBeTruthy();
    fireEvent.click(screen.getByTestId('open-codex-settings-from-auth'));
    expect(onOpenCodexSettings).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TerminalPanel } from '../terminal-panel';

describe('TerminalPanel', () => {
  it('renders a compact tab-only header without a title divider', () => {
    render(
      <TerminalPanel
        activeTabId="term-1"
        error={null}
        height={360}
        isTauriRuntime
        rootPath="/repo"
        tabs={[
          {
            cwd: '/repo',
            id: 'term-1',
            status: 'running',
            title: '本地',
          },
        ]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />
    );

    const terminalPanel = screen.getByTestId('terminal-panel');
    const header = terminalPanel.querySelector('header');

    expect(screen.queryByText('终端')).toBeNull();
    expect(header?.className).not.toContain('border-b');
    expect(screen.queryByText('repo')).toBeNull();
    expect(screen.getByRole('tab', { name: /本地/ })).toBeTruthy();
  });

  it('creates, selects, and closes tabs', async () => {
    const user = userEvent.setup();
    const onNewTab = vi.fn();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <TerminalPanel
        activeTabId="term-1"
        error={null}
        height={360}
        isTauriRuntime
        rootPath="/repo"
        tabs={[
          { cwd: '/repo', id: 'term-1', status: 'running', title: '本地' },
          { cwd: '/repo', id: 'term-2', status: 'running', title: '本地 2' },
        ]}
        onClose={vi.fn()}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        onSelectTab={onSelectTab}
      />
    );

    await user.click(screen.getByRole('button', { name: '新建终端标签页' }));
    await user.click(screen.getByRole('tab', { name: /本地 2/ }));
    await user.click(
      screen.getByRole('button', { name: '关闭终端标签页 本地 2' }),
    );

    expect(onNewTab).toHaveBeenCalledTimes(1);
    expect(onSelectTab).toHaveBeenCalledWith('term-2');
    expect(onCloseTab).toHaveBeenCalledWith('term-2');
  });

  it('renders empty and unavailable states', () => {
    const { rerender } = render(
      <TerminalPanel
        activeTabId={null}
        error={null}
        height={360}
        isTauriRuntime
        rootPath={null}
        tabs={[]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByText('打开工作区后可以启动终端。')).toBeTruthy();

    rerender(
      <TerminalPanel
        activeTabId={null}
        error={null}
        height={360}
        isTauriRuntime={false}
        rootPath="/repo"
        tabs={[]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByText('终端仅在桌面应用中可用。')).toBeTruthy();
  });

  it('shows the exit code and can start another terminal', async () => {
    const user = userEvent.setup();
    const onNewTab = vi.fn();

    render(
      <TerminalPanel
        activeTabId="term-1"
        error={null}
        height={360}
        isTauriRuntime
        rootPath="/repo"
        tabs={[
          {
            cwd: '/repo',
            exitCode: 7,
            id: 'term-1',
            status: 'exited',
            title: '本地',
          },
        ]}
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={onNewTab}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByText('进程已退出（7）')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '新建终端' }));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });
});

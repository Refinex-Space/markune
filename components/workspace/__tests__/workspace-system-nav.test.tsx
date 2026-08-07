import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSystemNav } from '../workspace-system-nav';

describe('WorkspaceSystemNav', () => {
  it('renders seven vertical labeled entries by default', () => {
    render(<WorkspaceSystemNav />);

    for (const name of ['笔记', '日程', 'Inbox', '画板', '视图', '图谱', 'Codex']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByTestId('system-nav-hitbox')).toBeNull();
  });

  it('hides entries when collapsed and keeps a compact hover chip without a divider line', () => {
    render(<WorkspaceSystemNav collapsed />);

    expect(screen.queryByRole('button', { name: '笔记' })).toBeNull();
    expect(screen.getByTestId('system-nav-hitbox')).toBeTruthy();
    expect(screen.getByTestId('workspace-system-nav').className).toContain(
      'h-5',
    );
    expect(screen.getByTestId('workspace-system-nav').className).not.toContain(
      'border-y',
    );
    expect(screen.getByTestId('system-nav-hitbox').className).not.toContain(
      'h-px',
    );
    expect(screen.getByTestId('system-nav-hitbox').className).not.toMatch(
      /bg-sidebar-border/,
    );
  });

  it('centers an up/down collapse control instead of a left/right chevron', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceSystemNav />);

    await user.hover(screen.getByTestId('workspace-system-nav'));
    const collapseExpanded = screen.getByTestId('system-nav-collapse-button');
    expect(collapseExpanded.className).toContain('left-1/2');
    expect(collapseExpanded.querySelector('svg')).toBeTruthy();

    rerender(<WorkspaceSystemNav collapsed />);
    await user.hover(screen.getByTestId('workspace-system-nav'));
    const expandCollapsed = screen.getByTestId('system-nav-collapse-button');
    expect(expandCollapsed.className).toContain('bg-sidebar-accent');
    expect(expandCollapsed.getAttribute('aria-label')).toBe('展开系统入口');
  });

  it('reveals collapse and options controls on hover', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSystemNav />);

    await user.hover(screen.getByTestId('workspace-system-nav'));

    expect(
      screen.getByRole('button', { name: '收起系统入口' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '系统入口选项' }),
    ).toBeTruthy();
  });

  it('toggles collapsed state from the collapse control', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(<WorkspaceSystemNav onCollapsedChange={onCollapsedChange} />);

    await user.hover(screen.getByTestId('workspace-system-nav'));
    await user.click(screen.getByRole('button', { name: '收起系统入口' }));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('switches layout from the options menu', async () => {
    const user = userEvent.setup();
    const onLayoutChange = vi.fn();
    render(<WorkspaceSystemNav onLayoutChange={onLayoutChange} />);

    await user.hover(screen.getByTestId('workspace-system-nav'));
    await user.click(screen.getByRole('button', { name: '系统入口选项' }));
    await user.click(screen.getByRole('menuitemradio', { name: '横向排列' }));

    expect(onLayoutChange).toHaveBeenCalledWith('horizontal');
  });

  it('renders icon-only horizontal entries with inbox badge', () => {
    render(
      <WorkspaceSystemNav inboxActiveCount={4} layout="horizontal" />,
    );

    const notes = screen.getByRole('button', { name: '笔记' });
    expect(notes.textContent).not.toContain('笔记');
    expect(notes.getAttribute('aria-label')).toBe('笔记');
    expect(notes.className).toContain('justify-start');
    expect(notes.parentElement?.className).toContain('pl-[11px]');

    const inbox = screen.getByRole('button', { name: 'Inbox · 4' });
    expect(inbox.getAttribute('aria-label')).toBe('Inbox · 4');
    expect(screen.getByTestId('inbox-entry-badge').textContent).toBe('4');
  });
});

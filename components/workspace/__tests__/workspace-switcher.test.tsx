import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSwitcher } from '../workspace-switcher';

describe('WorkspaceSwitcher', () => {
  it('keeps the first-run menu compact and action-focused', async () => {
    const user = userEvent.setup();
    const onOpenWorkspace = vi.fn();

    render(
      <WorkspaceSwitcher
        compact
        currentWorkspace={null}
        history={[]}
        isLoading={false}
        onChooseWorkspaceParent={vi.fn(async () => null)}
        onCreateWorkspace={vi.fn(async () => undefined)}
        onOpenWorkspace={onOpenWorkspace}
        onRemoveWorkspace={vi.fn()}
        onSwitchWorkspace={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    const menu = screen.getByTestId('workspace-switcher-menu');
    const trigger = screen.getByRole('button', { name: '打开工作区菜单' });
    expect(menu.className).toContain('rounded-md');
    expect(menu.className).toContain('shadow-none');
    expect(menu.className).not.toContain('rounded-lg');
    expect(menu.className).not.toContain('shadow-lg');
    expect(trigger.className).toContain('px-1.5');
    expect(screen.queryByText('还没有打开过的工作区')).toBeNull();
    expect(
      screen.queryByText('选择一个工作区目录，后续可在这里快速切换。'),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '打开已有工作区' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建工作区' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开已有工作区' }));

    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
  });

  it('keeps root document creation out of the workspace menu', async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSwitcher
        compact
        currentWorkspace={{
          nodes: [],
          rootName: 'Vault',
          rootPath: '/repo',
        }}
        history={[]}
        isLoading={false}
        onChooseWorkspaceParent={vi.fn(async () => null)}
        onCreateWorkspace={vi.fn(async () => undefined)}
        onOpenWorkspace={vi.fn()}
        onRemoveWorkspace={vi.fn()}
        onSwitchWorkspace={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.queryByRole('button', { name: '新建文档' })).toBeNull();
    expect(screen.queryByRole('button', { name: '新建目录' })).toBeNull();
    expect(screen.getByRole('button', { name: '选择工作区' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建工作区' })).toBeTruthy();
  });

  it('hides workspace paths from recent workspace items', async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceSwitcher
        compact
        currentWorkspace={{
          nodes: [],
          rootName: 'Vault',
          rootPath: '/repo/vault',
        }}
        history={[
          {
            lastOpenedAt: 1,
            rootName: 'Vault',
            rootPath: '/repo/vault',
          },
        ]}
        isLoading={false}
        onChooseWorkspaceParent={vi.fn(async () => null)}
        onCreateWorkspace={vi.fn(async () => undefined)}
        onOpenWorkspace={vi.fn()}
        onRemoveWorkspace={vi.fn()}
        onSwitchWorkspace={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    const recentHeading = screen.getByText('最近工作区');
    const removeButton = screen.getByRole('button', {
      name: '移除工作区 Vault',
    });

    expect(recentHeading.className).toContain('pb-1');
    expect(recentHeading.className).toContain('pt-0.5');
    expect(removeButton.parentElement?.className).toContain('h-8');
    expect(removeButton.className).toContain('size-6');
    expect(removeButton.className).toContain('hover:bg-destructive/10');
    expect(removeButton.className).toContain('hover:text-destructive');
    expect(screen.queryByText('/repo/vault')).toBeNull();
  });
});

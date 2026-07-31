import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSidebar } from '../workspace-sidebar';
import type { useWorkspace } from '../use-workspace';

function createWorkspaceStub() {
  return {
    chooseWorkspaceParentDirectory: vi.fn(),
    createDirectory: vi.fn(),
    createDocument: vi.fn(),
    createWorkspace: vi.fn(),
    currentDirectory: null,
    currentDocument: null,
    deleteNode: vi.fn(),
    error: null,
    isLoading: false,
    isSidebarCollapsed: false,
    moveNode: vi.fn(),
    openDocument: vi.fn(),
    openWorkspace: vi.fn(),
    pendingRenameNodePath: null,
    removeWorkspace: vi.fn(),
    renameNode: vi.fn(),
    selectDirectory: vi.fn(),
    snapshot: null,
    switchWorkspace: vi.fn(),
    workspaceHistory: [],
  } as unknown as ReturnType<typeof useWorkspace>;
}

function createOpenWorkspaceStub() {
  const workspace = createWorkspaceStub();
  workspace.snapshot = {
    nodes: [],
    rootName: 'refinex-vault',
    rootPath: '/workspace',
  };
  return workspace;
}

describe('WorkspaceSidebar update entry', () => {
  it('uses the measured macOS chrome content inset before workspace controls', () => {
    render(
      <WorkspaceSidebar
        macChromeContentTop={46}
        width={280}
        workspace={createWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    const spacer = screen.getByTestId('workspace-sidebar-titlebar-spacer');
    expect(spacer.style.height).toBe('46px');
    expect(spacer.className).not.toContain('h-10');
  });

  it('shows a blue update action and opens the version settings section', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(
      <WorkspaceSidebar
        appUpdateAvailable
        width={280}
        workspace={createWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );

    const updateButton = screen.getByRole('button', { name: '打开版本更新' });
    await user.click(updateButton);

    expect(onOpenSettings).toHaveBeenCalledWith('version');
    expect(updateButton.className).toContain('text-primary-foreground');
  });

  it('keeps the update action hidden when no newer version exists', () => {
    render(
      <WorkspaceSidebar
        appUpdateAvailable={false}
        width={280}
        workspace={createWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '打开版本更新' })).toBeNull();
  });

  it('keeps system entries as compact and subdued as document tree rows', () => {
    render(
      <WorkspaceSidebar
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    for (const name of ['日程', 'Inbox', '画板', '视图', 'Codex']) {
      const entry = screen.getByRole('button', { name });
      expect(entry.className).toContain('h-7');
      expect(entry.className).toContain('gap-1.5');
      expect(entry.className).toContain('px-[11px]');
      expect(entry.className).toContain('text-[13px]');
      expect(entry.className).toContain('text-sidebar-foreground/80');
    }

    expect(screen.getByRole('button', { name: 'Inbox' }).className).toContain(
      'mt-0.5',
    );
  });
});

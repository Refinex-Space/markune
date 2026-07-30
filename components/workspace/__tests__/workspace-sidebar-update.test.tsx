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

describe('WorkspaceSidebar update entry', () => {
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
});

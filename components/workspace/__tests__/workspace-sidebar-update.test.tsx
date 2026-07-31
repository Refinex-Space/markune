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
  it('uses the expanded document-tree folder icon for the notes entry', () => {
    render(
      <WorkspaceSidebar
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '笔记' }).querySelector('svg path'),
    ).toBeTruthy();
  });

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

    for (const name of ['笔记', '日程', 'Inbox', '画板', '视图', 'Codex']) {
      const entry = screen.getByRole('button', { name });
      expect(entry.className).toContain('h-7');
      expect(entry.className).toContain('gap-1.5');
      expect(entry.className).toContain('px-[11px]');
      expect(entry.className).toContain('text-[13px]');
      if (name !== '笔记') {
        expect(entry.className).toContain('text-sidebar-foreground/80');
      }
    }

    expect(screen.getByRole('button', { name: 'Inbox' }).className).not.toContain(
      'mt-0.5',
    );
    expect(screen.getByRole('button', { name: '笔记' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: '笔记' }).parentElement?.className).toContain(
      'space-y-0.5',
    );
  });

  it('provides a notes entry that returns from system pages to the document tree', async () => {
    const user = userEvent.setup();
    const onOpenNotes = vi.fn();

    render(
      <WorkspaceSidebar
        systemPage="drawings"
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
        onOpenNotes={onOpenNotes}
      />,
    );

    const notesEntry = screen.getByRole('button', { name: '笔记' });
    expect(notesEntry.getAttribute('aria-current')).toBeNull();

    await user.click(notesEntry);
    expect(onOpenNotes).toHaveBeenCalledTimes(1);
  });

  it('opens the Daily overview as an active system page', async () => {
    const user = userEvent.setup();
    const onOpenDailyNotes = vi.fn();

    render(
      <WorkspaceSidebar
        systemPage="daily"
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenDailyNotes={onOpenDailyNotes}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    const dailyEntry = screen.getByRole('button', { name: '日程' });
    expect(dailyEntry.getAttribute('aria-current')).toBe('page');

    await user.click(dailyEntry);
    expect(onOpenDailyNotes).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { WorkspaceSidebar } from '../workspace-sidebar';
import type { useWorkspace } from '../use-workspace';

const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  });
});

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
    expect(spacer.style.height).toBe('38px');
    expect(spacer.className).not.toContain('h-10');
  });

  it('renders the sidebar content as an inset rounded panel', () => {
    render(
      <WorkspaceSidebar
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    const sidebar = screen.getByTestId('workspace-sidebar');
    const content = screen.getByTestId('workspace-sidebar-content');

    expect(sidebar.style.width).toBe('280px');
    expect(sidebar.className).toContain('bg-transparent');
    expect(content.className).toContain('rounded-xl');
    expect(content.className).toContain('border-border/70');
    expect(content.className).toContain('bg-background');
    expect(content.style.height).toBe('calc(100% - 16px)');
    expect(content.style.margin).toBe('8px 0px 8px 8px');
    expect(content.style.width).toBe('272px');
  });

  it('collapses the rounded sidebar panel without retaining layout width', () => {
    const workspace = createOpenWorkspaceStub();
    workspace.isSidebarCollapsed = true;

    render(
      <WorkspaceSidebar
        width={280}
        workspace={workspace}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('0px');
    expect(screen.getByTestId('workspace-sidebar-content').className).toContain(
      'pointer-events-none',
    );
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

    for (const name of ['笔记', '日程', 'Inbox', '画板', '视图', '图谱', 'Codex']) {
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

  it('hides system entries when the system nav is collapsed', () => {
    render(
      <WorkspaceSidebar
        systemNavCollapsed
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '笔记' })).toBeNull();
    expect(screen.getByTestId('system-nav-hitbox')).toBeTruthy();
  });

  it('does not show a sidebar load-error footer when workspace reading fails', () => {
    const workspace = createWorkspaceStub();
    workspace.error = {
      message: '无法读取工作区，请重新选择文件夹。',
      recoverable: true,
    };

    render(
      <WorkspaceSidebar
        width={280}
        workspace={workspace}
        onOpenGlobalSearch={vi.fn()}
      />,
    );

    expect(screen.queryByText('无法读取工作区，请重新选择文件夹。')).toBeNull();
    expect(screen.queryByRole('button', { name: '重新选择' })).toBeNull();
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

  it('opens and highlights the workspace folder overview from the tree heading', async () => {
    const user = userEvent.setup();
    const onOpenWorkspaceOverview = vi.fn();
    const workspace = createOpenWorkspaceStub();
    workspace.snapshot!.nodes = [
      {
        id: 'projects',
        name: '项目',
        kind: 'directory',
        relativePath: '项目',
        absolutePath: '/workspace/项目',
        children: [],
      },
    ];

    render(
      <WorkspaceSidebar
        systemPage="folders"
        width={280}
        workspace={workspace}
        onOpenGlobalSearch={vi.fn()}
        onOpenWorkspaceOverview={onOpenWorkspaceOverview}
      />,
    );

    const overviewEntry = screen.getByRole('button', {
      name: '打开工作区文件夹总览',
    });

    expect(overviewEntry.getAttribute('aria-current')).toBe('page');
    expect(overviewEntry.parentElement?.className).toContain('bg-sidebar-accent');
    expect(
      screen.getByTestId('tree-node-projects').parentElement?.className,
    ).toContain('mt-1');

    await user.click(overviewEntry);
    expect(onOpenWorkspaceOverview).toHaveBeenCalledTimes(1);
  });

  it('shows pinned items above folders as a collapsed interactive section', async () => {
    const user = userEvent.setup();
    const onOpenPinnedNode = vi.fn();
    const onOpenPinnedOverview = vi.fn();
    const onUnpinNode = vi.fn();
    const workspace = createOpenWorkspaceStub();
    const pinnedDocument = {
      id: 'pinned-note',
      name: 'pinned.md',
      kind: 'document' as const,
      relativePath: '项目/pinned.md',
      absolutePath: '/workspace/项目/pinned.md',
      title: '置顶文档',
      pinned: true,
    };
    const hiddenPinnedDocument = {
      id: 'hidden-pinned-note',
      name: 'private.md',
      kind: 'document' as const,
      relativePath: '.attachments/private.md',
      absolutePath: '/workspace/.attachments/private.md',
      title: '隐藏置顶文档',
      pinned: true,
    };
    const pinnedDirectory = {
      id: 'projects',
      name: '项目',
      kind: 'directory' as const,
      relativePath: '项目',
      absolutePath: '/workspace/项目',
      children: [pinnedDocument],
      pinned: true,
    };
    workspace.snapshot!.nodes = [
      pinnedDirectory,
      {
        id: 'attachments',
        name: '.attachments',
        kind: 'directory',
        relativePath: '.attachments',
        absolutePath: '/workspace/.attachments',
        children: [hiddenPinnedDocument],
      },
    ];
    workspace.currentDocument = pinnedDocument;

    render(
      <WorkspaceSidebar
        pinnedNodes={[pinnedDirectory, pinnedDocument, hiddenPinnedDocument]}
        systemPage="pinned"
        width={280}
        workspace={workspace}
        onOpenGlobalSearch={vi.fn()}
        onOpenPinnedNode={onOpenPinnedNode}
        onOpenPinnedOverview={onOpenPinnedOverview}
        onUnpinNode={onUnpinNode}
      />,
    );

    const overviewEntry = screen.getByRole('button', {
      name: '打开置顶内容总览',
    });
    const toggle = screen.getByRole('button', { name: '展开置顶内容' });
    const folderOverview = screen.getByRole('button', {
      name: '打开工作区文件夹总览',
    });

    expect(overviewEntry.getAttribute('aria-current')).toBe('page');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('pinned-sidebar-count').textContent).toBe('2');
    expect(screen.getByTestId('pinned-sidebar-count').className).toContain(
      'group-hover:opacity-0',
    );
    expect(toggle.className).toContain('group-hover:opacity-100');
    expect(
      screen.queryByRole('button', { name: '打开文档 置顶文档' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: '打开置顶内容' })).toBeNull();
    expect(
      screen.getByTestId('pinned-sidebar-section').nextElementSibling?.contains(
        folderOverview,
      ),
    ).toBe(true);

    await user.click(overviewEntry);
    expect(onOpenPinnedOverview).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: '打开文档 置顶文档' }),
    ).toBeNull();

    await user.click(toggle);

    expect(
      screen.getByRole('button', { name: '折叠置顶内容' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
    expect(screen.queryByText('隐藏置顶文档')).toBeNull();
    expect(
      screen.getByTestId('pinned-folder-icon-projects').getAttribute('class'),
    ).toContain('size-[13px]');
    expect(
      screen.getByRole('button', { name: '打开目录 项目' }).className,
    ).toContain('pl-[11px]');
    expect(
      screen
        .getByRole('button', { name: '打开文档 置顶文档' })
        .getAttribute('aria-current'),
    ).toBe('page');

    await user.click(
      screen.getByRole('button', { name: '打开文档 置顶文档' }),
    );
    expect(onOpenPinnedNode).toHaveBeenCalledWith(pinnedDocument);

    const unpinButton = screen.getByRole('button', {
      name: '取消置顶 置顶文档',
    });
    await user.hover(unpinButton);
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      '取消置顶',
    );
    await user.click(unpinButton);
    expect(onUnpinNode).toHaveBeenCalledWith(pinnedDocument);
  });

  it('does not show a zero count for an empty pinned section', () => {
    render(
      <WorkspaceSidebar
        pinnedNodes={[]}
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
        onOpenPinnedNode={vi.fn()}
        onOpenPinnedOverview={vi.fn()}
        onUnpinNode={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '展开置顶内容' })).toBeTruthy();
    expect(screen.queryByTestId('pinned-sidebar-count')).toBeNull();
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

  it('opens the graph from the upper workspace navigation', async () => {
    const user = userEvent.setup();
    const onOpenGraph = vi.fn();

    render(
      <WorkspaceSidebar
        systemPage="graph"
        width={280}
        workspace={createOpenWorkspaceStub()}
        onOpenGlobalSearch={vi.fn()}
        onOpenGraph={onOpenGraph}
      />,
    );

    const graphEntry = screen.getByRole('button', { name: '图谱' });
    expect(graphEntry.getAttribute('aria-current')).toBe('page');
    await user.click(graphEntry);
    expect(onOpenGraph).toHaveBeenCalledTimes(1);
  });
});

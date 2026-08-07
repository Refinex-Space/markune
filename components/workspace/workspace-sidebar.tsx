import {
  Search,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import { PinnedChromeMenu } from './pinned-chrome-menu';
import { WorkspaceSystemNav } from './workspace-system-nav';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSwitcher } from './workspace-switcher';
import type {
  SystemNavLayout,
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceNode,
} from './workspace-types';

interface WorkspaceSidebarProps {
  appUpdateAvailable?: boolean;
  dailyCalendar?: ReactNode;
  drawingContent?: ReactNode;
  inboxContent?: ReactNode;
  macChromeContentTop?: number;
  width: number;
  windowsChromeInset?: boolean;
  workspace: ReturnType<typeof useWorkspace>;
  onCreateDocument?: (parentPath: string) => Promise<WorkspaceNode | null> | void;
  onDeleteNode?: (node: WorkspaceNode) => Promise<void> | void;
  onExportNode?: (
    node: WorkspaceNode,
    format: WorkspaceExportFormat,
  ) => Promise<void> | void;
  onImportDocuments?: (
    targetDir: string,
    format: WorkspaceImportFormat,
  ) => Promise<void> | void;
  onOpenDailyNotes?: () => void;
  onOpenNotes?: () => void;
  onOpenCodex?: () => void;
  onOpenDrawings?: () => void;
  onOpenGlobalSearch: () => void;
  onOpenGraph?: () => void;
  onOpenPinnedNode?: (node: WorkspaceNode) => void;
  onOpenInbox?: () => void;
  onOpenInFileManager?: (node: WorkspaceNode) => void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => void;
  onOpenViews?: () => void;
  onRefreshWorkspaceTree?: () => Promise<unknown> | void;
  onOpenSettings?: (sectionId?: 'appearance' | 'version') => void;
  onRemoveWorkspace?: (rootPath: string) => void;
  onRenameNode?: (
    node: WorkspaceNode,
    newName: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  preferredEditorLabel?: string;
  revealNodePath?: string | null;
  revealNodeRequestId?: number;
  onSelectDirectory?: (node: WorkspaceNode) => Promise<void> | void;
  onSelectDocument?: (node: WorkspaceNode) => void;
  onTogglePinned?: (node: WorkspaceNode) => void;
  onUnpinNode?: (node: WorkspaceNode) => void;
  pinnedNodes?: WorkspaceNode[];
  inboxActiveCount?: number;
  systemNavCollapsed?: boolean;
  systemNavLayout?: SystemNavLayout;
  systemPage?: 'codex' | 'daily' | 'drawings' | 'graph' | 'inbox' | 'views' | null;
  onSystemNavCollapsedChange?: (collapsed: boolean) => void;
  onSystemNavLayoutChange?: (layout: SystemNavLayout) => void;
}

export function WorkspaceSidebar({
  appUpdateAvailable = false,
  dailyCalendar,
  drawingContent,
  inboxContent,
  macChromeContentTop,
  width,
  workspace,
  onCreateDocument,
  onDeleteNode,
  onExportNode,
  onImportDocuments,
  onOpenDailyNotes,
  onOpenNotes,
  onOpenCodex,
  onOpenDrawings,
  onOpenGlobalSearch,
  onOpenGraph,
  onOpenPinnedNode,
  onOpenInbox,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onOpenViews,
  onRefreshWorkspaceTree,
  onOpenSettings,
  onRemoveWorkspace,
  onRenameNode,
  preferredEditorLabel,
  revealNodePath,
  revealNodeRequestId,
  onSelectDirectory,
  onSelectDocument,
  onTogglePinned,
  onUnpinNode,
  pinnedNodes = [],
  inboxActiveCount = 0,
  systemNavCollapsed = false,
  systemNavLayout = 'vertical',
  systemPage = null,
  windowsChromeInset = false,
  onSystemNavCollapsedChange,
  onSystemNavLayoutChange,
}: WorkspaceSidebarProps) {
  const createDocument = onCreateDocument ?? workspace.createDocument;
  const deleteNode = onDeleteNode ?? workspace.deleteNode;
  const renameNode = onRenameNode ?? workspace.renameNode;
  const selectDirectory = onSelectDirectory ?? workspace.selectDirectory;
  const selectDocument = onSelectDocument ?? workspace.openDocument;
  const regularNodes = useMemo(
    () => filterRegularWorkspaceNodes(workspace.snapshot?.nodes ?? []),
    [workspace.snapshot?.nodes],
  );
  const isDailyActive =
    systemPage === 'daily' ||
    isDailyDocumentPath(workspace.currentDocument?.relativePath ?? null);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        workspace.isSidebarCollapsed ? 'opacity-0' : 'opacity-100',
      )}
      data-chrome="workspace-sidebar"
      data-testid="workspace-sidebar"
      style={{ width: workspace.isSidebarCollapsed ? 0 : width }}
    >
      <div
        aria-hidden={workspace.isSidebarCollapsed}
        className={cn(
          'flex h-full flex-col transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          workspace.isSidebarCollapsed
            ? 'pointer-events-none -translate-x-2 opacity-0'
            : 'translate-x-0 opacity-100',
        )}
        data-testid="workspace-sidebar-content"
        style={{ width }}
      >
        <header
          className={cn(
            'shrink-0',
            windowsChromeInset
              ? 'h-2'
              : macChromeContentTop === undefined
                ? 'h-10'
                : undefined,
          )}
          data-tauri-drag-region="deep"
          data-testid="workspace-sidebar-titlebar-spacer"
          style={
            !windowsChromeInset && macChromeContentTop !== undefined
              ? { height: macChromeContentTop }
              : undefined
          }
        />

        <WorkspaceSidebarHeader
          workspace={workspace}
          onOpenGlobalSearch={onOpenGlobalSearch}
          pinnedNodes={pinnedNodes}
          onOpenPinnedNode={onOpenPinnedNode}
          onRemoveWorkspace={onRemoveWorkspace}
          onUnpinNode={onUnpinNode}
        />

        {workspace.snapshot ? (
          <WorkspaceSystemNav
            collapsed={systemNavCollapsed}
            inboxActiveCount={inboxActiveCount}
            isDailyActive={isDailyActive}
            layout={systemNavLayout}
            systemPage={systemPage}
            onCollapsedChange={onSystemNavCollapsedChange}
            onLayoutChange={onSystemNavLayoutChange}
            onOpenCodex={onOpenCodex}
            onOpenDailyNotes={onOpenDailyNotes}
            onOpenDrawings={onOpenDrawings}
            onOpenGraph={onOpenGraph}
            onOpenInbox={onOpenInbox}
            onOpenNotes={onOpenNotes}
            onOpenViews={onOpenViews}
          />
        ) : null}

        <div
          className={cn(
            'workspace-tree-scrollarea min-h-0 flex-1',
            systemPage === 'inbox' || systemPage === 'drawings'
              ? 'overflow-hidden'
              : 'overflow-y-auto px-2 pb-3',
          )}
          data-workspace-tree-scroll-container="true"
        >
          {workspace.snapshot && systemPage === 'inbox' ? (
            inboxContent
          ) : workspace.snapshot && systemPage === 'drawings' ? (
            drawingContent
          ) : workspace.snapshot ? (
            <DocumentTree
              currentDirectoryPath={
                workspace.currentDirectory?.absolutePath ?? null
              }
              currentDocumentPath={workspace.currentDocument?.absolutePath ?? null}
              nodes={regularNodes}
              pendingRenameNodePath={workspace.pendingRenameNodePath}
              searchQuery=""
              onCreateDirectory={workspace.createDirectory}
              onCreateDocument={createDocument}
              onDeleteNode={deleteNode}
              onExportNode={onExportNode}
              onImportDocuments={onImportDocuments}
              onImportMarkdown={(targetDir) =>
                void onImportDocuments?.(targetDir, 'markdown')
              }
              onMoveNode={workspace.moveNode}
              onOpenInFileManager={onOpenInFileManager}
              onOpenInPreferredEditor={onOpenInPreferredEditor}
              onPendingRenameConsumed={workspace.clearPendingRenameNode}
              onRefresh={onRefreshWorkspaceTree}
              preferredEditorLabel={preferredEditorLabel}
              revealNodePath={revealNodePath}
              revealNodeRequestId={revealNodeRequestId}
              onRenameNode={renameNode}
              onSelectDirectory={selectDirectory}
              onSelectDocument={selectDocument}
              onTogglePinned={onTogglePinned}
            />
          ) : null}
        </div>

        {systemPage === 'inbox' || systemPage === 'drawings'
          ? null
          : dailyCalendar}

        {onOpenSettings ? (
          <footer className="shrink-0 px-2 py-2">
            <div className="flex w-[calc(100%-0.75rem)] items-center gap-1">
              <button
                aria-label="打开设置"
                className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                type="button"
                onClick={() => onOpenSettings()}
              >
                <Settings size={16} strokeWidth={1.75} />
                <span>设置</span>
              </button>
              {appUpdateAvailable ? (
                <button
                  aria-label="打开版本更新"
                  className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  type="button"
                  onClick={() => onOpenSettings('version')}
                >
                  <span>更新</span>
                </button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

function WorkspaceSidebarHeader({
  workspace,
  onOpenGlobalSearch,
  onOpenPinnedNode,
  onRemoveWorkspace,
  onUnpinNode,
  pinnedNodes,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  onOpenGlobalSearch: () => void;
  onOpenPinnedNode?: (node: WorkspaceNode) => void;
  onRemoveWorkspace?: (rootPath: string) => void;
  onUnpinNode?: (node: WorkspaceNode) => void;
  pinnedNodes: WorkspaceNode[];
}) {
  return (
    <div className="px-3 pb-2">
      <div className="relative flex h-9 items-center gap-1.5">
        <WorkspaceSwitcher
          compact
          currentWorkspace={workspace.snapshot}
          history={workspace.workspaceHistory}
          isLoading={workspace.isLoading}
          onChooseWorkspaceParent={workspace.chooseWorkspaceParentDirectory}
          onCreateWorkspace={workspace.createWorkspace}
          onOpenWorkspace={workspace.openWorkspace}
          onRemoveWorkspace={onRemoveWorkspace ?? workspace.removeWorkspace}
          onSwitchWorkspace={workspace.switchWorkspace}
        />

        <button
          aria-label="全局搜索"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="全局搜索（Ctrl/Cmd + Shift + F）"
          type="button"
          onClick={onOpenGlobalSearch}
        >
          <Search size={17} strokeWidth={1.8} />
        </button>
        {onOpenPinnedNode && onUnpinNode ? (
          <PinnedChromeMenu
            nodes={pinnedNodes}
            onOpenNode={onOpenPinnedNode}
            onUnpinNode={onUnpinNode}
          />
        ) : null}
      </div>
    </div>
  );
}

function filterRegularWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes
    .filter((node) => !isDailyRootDirectory(node) && !isDotPrefixedDirectory(node))
    .map((node) => {
      if (node.kind !== 'directory') {
        return node;
      }

      return {
        ...node,
        children: filterRegularWorkspaceNodes(node.children ?? []),
      };
    });
}

function isDailyRootDirectory(node: WorkspaceNode) {
  return (
    node.kind === 'directory' &&
    node.name === 'Daily' &&
    node.relativePath === 'Daily'
  );
}

function isDotPrefixedDirectory(node: WorkspaceNode) {
  return node.kind === 'directory' && node.name.startsWith('.');
}

function isDailyDocumentPath(relativePath: string | null) {
  return relativePath?.startsWith('Daily/') ?? false;
}

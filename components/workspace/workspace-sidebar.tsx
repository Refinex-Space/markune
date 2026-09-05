import {
  Search,
  Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { isDailyDocumentPath } from './daily-notes';
import { DocumentTree } from './document-tree';
import { PinnedSidebarSection } from './pinned-sidebar-section';
import { WorkspaceSystemNav } from './workspace-system-nav';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSwitcher } from './workspace-switcher';
import type {
  SystemNavLayout,
  TreeIconPickerSettings,
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceNode,
} from './workspace-types';

const DEFAULT_PANEL_MARGIN = 8;
const DEFAULT_TITLEBAR_SPACER = 40;

interface WorkspaceSidebarProps {
  appUpdateAvailable?: boolean;
  dailyCalendar?: ReactNode;
  drawingContent?: ReactNode;
  inboxContent?: ReactNode;
  macChromeContentTop?: number;
  panelMargin?: number;
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
  onOpenPinnedOverview?: () => void;
  onOpenInbox?: () => void;
  onOpenInFileManager?: (node: WorkspaceNode) => void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => void;
  onOpenWorkspaceOverview?: () => void;
  onOpenViews?: () => void;
  onRefreshWorkspaceTree?: () => Promise<unknown> | void;
  onRefreshWorkspaceNode?: (node: WorkspaceNode) => Promise<unknown> | void;
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
  treeIconPickerSettings?: TreeIconPickerSettings;
  systemPage?:
    | 'codex'
    | 'daily'
    | 'drawings'
    | 'folders'
    | 'graph'
    | 'inbox'
    | 'pinned'
    | 'views'
    | null;
  onSystemNavCollapsedChange?: (collapsed: boolean) => void;
  onSystemNavLayoutChange?: (layout: SystemNavLayout) => void;
  onTreeIconPickerSettingsChange?: (
    settings: TreeIconPickerSettings,
  ) => Promise<void> | void;
}

export function WorkspaceSidebar({
  appUpdateAvailable = false,
  dailyCalendar,
  drawingContent,
  inboxContent,
  macChromeContentTop,
  panelMargin = DEFAULT_PANEL_MARGIN,
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
  onOpenPinnedOverview,
  onOpenInbox,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onOpenWorkspaceOverview,
  onOpenViews,
  onRefreshWorkspaceTree,
  onRefreshWorkspaceNode,
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
  treeIconPickerSettings,
  systemPage = null,
  windowsChromeInset = false,
  onSystemNavCollapsedChange,
  onSystemNavLayoutChange,
  onTreeIconPickerSettingsChange,
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
  const visiblePinnedNodes = useMemo(
    () => pinnedNodes.filter((node) => !isInsideDotPrefixedDirectory(node)),
    [pinnedNodes],
  );
  const isDailyActive =
    systemPage === 'daily' ||
    isDailyDocumentPath(workspace.currentDocument?.relativePath ?? null);
  const titlebarSpacerHeight = windowsChromeInset
    ? null
    : Math.max(
        0,
        (macChromeContentTop ?? DEFAULT_TITLEBAR_SPACER) - panelMargin,
      );

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden bg-transparent text-sidebar-foreground transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        workspace.isSidebarCollapsed ? 'opacity-0' : 'opacity-100',
      )}
      data-chrome="workspace-sidebar"
      data-testid="workspace-sidebar"
      style={{ width: workspace.isSidebarCollapsed ? 0 : width }}
    >
      <div
        aria-hidden={workspace.isSidebarCollapsed}
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          workspace.isSidebarCollapsed
            ? 'pointer-events-none -translate-x-2 opacity-0'
            : 'translate-x-0 opacity-100',
        )}
        data-testid="workspace-sidebar-content"
        style={{
          height: `calc(100% - ${panelMargin * 2}px)`,
          margin: `${panelMargin}px 0 ${panelMargin}px ${panelMargin}px`,
          width: Math.max(0, width - panelMargin),
        }}
      >
        <header
          className={cn('shrink-0', windowsChromeInset && 'h-2')}
          data-tauri-drag-region="deep"
          data-testid="workspace-sidebar-titlebar-spacer"
          style={
            titlebarSpacerHeight === null
              ? undefined
              : { height: titlebarSpacerHeight }
          }
        />

        <WorkspaceSidebarHeader
          workspace={workspace}
          onOpenGlobalSearch={onOpenGlobalSearch}
          onRemoveWorkspace={onRemoveWorkspace}
        />

        {workspace.snapshot ? (
          <WorkspaceSystemNav
            collapsed={systemNavCollapsed}
            inboxActiveCount={inboxActiveCount}
            isDailyActive={isDailyActive}
            layout={systemNavLayout}
            systemPage={
              systemPage === 'folders' || systemPage === 'pinned'
                ? null
                : systemPage
            }
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
              : 'overflow-y-auto',
          )}
          data-workspace-tree-scroll-container="true"
        >
          {workspace.snapshot && systemPage === 'inbox' ? (
            inboxContent
          ) : workspace.snapshot && systemPage === 'drawings' ? (
            drawingContent
          ) : workspace.snapshot ? (
            <div className="flex min-h-full flex-col">
              <DocumentTree
                header={
                  onOpenPinnedNode && onOpenPinnedOverview && onUnpinNode ? (
                    <PinnedSidebarSection
                      active={systemPage === 'pinned'}
                      currentDirectoryPath={
                        workspace.currentDirectory?.absolutePath ?? null
                      }
                      currentDocumentPath={
                        workspace.currentDocument?.absolutePath ?? null
                      }
                      key={workspace.snapshot.rootPath}
                      nodes={visiblePinnedNodes}
                      rootPath={workspace.snapshot.rootPath}
                      onOpenNode={onOpenPinnedNode}
                      onOpenOverview={onOpenPinnedOverview}
                      onUnpinNode={onUnpinNode}
                    />
                  ) : null
                }
                currentDirectoryPath={
                  workspace.currentDirectory?.absolutePath ?? null
                }
                currentDocumentPath={
                  workspace.currentDocument?.absolutePath ?? null
                }
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
                onUpdateNodeAppearance={workspace.updateTreeNodeAppearance}
                onTreeIconPickerSettingsChange={
                  onTreeIconPickerSettingsChange
                }
                onOpenInFileManager={onOpenInFileManager}
                onOpenInPreferredEditor={onOpenInPreferredEditor}
                onOpenWorkspaceOverview={onOpenWorkspaceOverview}
                onPendingRenameConsumed={workspace.clearPendingRenameNode}
                onRefresh={onRefreshWorkspaceTree}
                onRefreshNode={onRefreshWorkspaceNode}
                preferredEditorLabel={preferredEditorLabel}
                revealNodePath={revealNodePath}
                revealNodeRequestId={revealNodeRequestId}
                onRenameNode={renameNode}
                onSelectDirectory={selectDirectory}
                onSelectDocument={selectDocument}
                onTogglePinned={onTogglePinned}
                rootPath={workspace.snapshot.rootPath}
                treeIconPickerSettings={treeIconPickerSettings}
                workspaceOverviewActive={systemPage === 'folders'}
              />
            </div>
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
  onRemoveWorkspace,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  onOpenGlobalSearch: () => void;
  onRemoveWorkspace?: (rootPath: string) => void;
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

function isInsideDotPrefixedDirectory(node: WorkspaceNode) {
  const segments = node.relativePath.split(/[\\/]/).filter(Boolean);
  const directorySegments =
    node.kind === 'directory' ? segments : segments.slice(0, -1);

  return directorySegments.some((segment) => segment.startsWith('.'));
}

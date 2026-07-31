import {
  CalendarDays,
  Inbox,
  Paintbrush,
  RefreshCw,
  Search,
  Settings,
  Sheet,
} from 'lucide-react';
import { Openai } from '@thesvg/react';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSwitcher } from './workspace-switcher';
import type {
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
  onOpenDailyNote?: () => void;
  onOpenCodex?: () => void;
  onOpenDrawings?: () => void;
  onOpenGlobalSearch: () => void;
  onOpenInbox?: () => void;
  onOpenInFileManager?: (node: WorkspaceNode) => void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => void;
  onOpenViews?: () => void;
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
  inboxActiveCount?: number;
  systemPage?: 'codex' | 'drawings' | 'inbox' | 'views' | null;
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
  onOpenDailyNote,
  onOpenCodex,
  onOpenDrawings,
  onOpenGlobalSearch,
  onOpenInbox,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onOpenViews,
  onOpenSettings,
  onRemoveWorkspace,
  onRenameNode,
  preferredEditorLabel,
  revealNodePath,
  revealNodeRequestId,
  onSelectDirectory,
  onSelectDocument,
  onTogglePinned,
  inboxActiveCount = 0,
  systemPage = null,
  windowsChromeInset = false,
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
  const isDailyActive = isDailyDocumentPath(
    workspace.currentDocument?.relativePath ?? null,
  );

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
          onRemoveWorkspace={onRemoveWorkspace}
        />

        {workspace.snapshot ? (
          <div className="border-y border-sidebar-border/45 px-2 py-1">
            <button
              aria-current={isDailyActive ? 'page' : undefined}
              className={getSystemEntryClassName(isDailyActive)}
              data-testid="daily-note-entry"
              type="button"
              onClick={onOpenDailyNote}
            >
              <CalendarDays size={13} strokeWidth={1.75} />
              <span className="truncate">日程</span>
            </button>
            <button
              aria-current={systemPage === 'inbox' ? 'page' : undefined}
              className={cn(
                'mt-0.5',
                getSystemEntryClassName(systemPage === 'inbox'),
              )}
              data-testid="inbox-entry"
              type="button"
              onClick={onOpenInbox}
            >
              <Inbox size={13} strokeWidth={1.75} />
              <span className="truncate">Inbox</span>
              {inboxActiveCount > 0 ? (
                <span className="ml-auto min-w-5 px-1.5 text-center text-[10px] font-medium leading-4 text-sidebar-foreground/55 tabular-nums">
                  {inboxActiveCount > 99 ? '99+' : inboxActiveCount}
                </span>
              ) : null}
            </button>
            <button
              aria-current={systemPage === 'drawings' ? 'page' : undefined}
              className={cn(
                'mt-0.5',
                getSystemEntryClassName(systemPage === 'drawings'),
              )}
              data-testid="drawing-entry"
              type="button"
              onClick={onOpenDrawings}
            >
              <Paintbrush size={13} strokeWidth={1.75} />
              <span className="truncate">画板</span>
            </button>
            <button
              aria-current={systemPage === 'views' ? 'page' : undefined}
              className={cn(
                'mt-0.5',
                getSystemEntryClassName(systemPage === 'views'),
              )}
              data-testid="workspace-views-entry"
              type="button"
              onClick={onOpenViews}
            >
              <Sheet size={13} strokeWidth={1.75} />
              <span className="truncate">视图</span>
            </button>
            <button
              aria-current={systemPage === 'codex' ? 'page' : undefined}
              className={cn(
                'mt-0.5',
                getSystemEntryClassName(systemPage === 'codex'),
              )}
              data-testid="codex-workspace-entry"
              type="button"
              onClick={onOpenCodex}
            >
              <Openai className="size-[13px]" variant="light" />
              <span className="truncate">Codex</span>
            </button>
          </div>
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

        {workspace.error ? (
          <footer className="border-t p-3 text-xs text-destructive">
            <p>{workspace.error.message}</p>
            <Button
              className="mt-2 h-7 px-2 text-xs"
              type="button"
              variant="outline"
              onClick={workspace.openWorkspace}
            >
              <RefreshCw size={13} />
              重新选择
            </Button>
          </footer>
        ) : null}

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

function getSystemEntryClassName(active: boolean) {
  return cn(
    'flex h-7 w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md px-[11px] text-[13px] transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
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

import { CalendarDays, RefreshCw, Search, Settings, Sheet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { DocumentTree } from './document-tree';
import type { useWorkspace } from './use-workspace';
import { WorkspaceSwitcher } from './workspace-switcher';
import type { WorkspaceNode } from './workspace-types';

interface WorkspaceSidebarProps {
  dailyCalendar?: ReactNode;
  width: number;
  workspace: ReturnType<typeof useWorkspace>;
  onCreateDocument?: (parentPath: string) => Promise<WorkspaceNode | null> | void;
  onOpenDailyNote?: () => void;
  onOpenInFileManager?: (node: WorkspaceNode) => void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => void;
  onOpenViews?: () => void;
  onOpenSettings?: () => void;
  onRemoveWorkspace?: (rootPath: string) => void;
  preferredEditorLabel?: string;
  revealDirectoryPath?: string | null;
  onSelectDirectory?: (node: WorkspaceNode) => Promise<void> | void;
  onSelectDocument?: (node: WorkspaceNode) => void;
  onTogglePinned?: (node: WorkspaceNode) => void;
  systemPage?: 'views' | null;
}

export function WorkspaceSidebar({
  dailyCalendar,
  width,
  workspace,
  onCreateDocument,
  onOpenDailyNote,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onOpenViews,
  onOpenSettings,
  onRemoveWorkspace,
  preferredEditorLabel,
  revealDirectoryPath,
  onSelectDirectory,
  onSelectDocument,
  onTogglePinned,
  systemPage = null,
}: WorkspaceSidebarProps) {
  const createDocument = onCreateDocument ?? workspace.createDocument;
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
      data-chrome="codex-sidebar"
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
        <header className="h-10 shrink-0" data-tauri-drag-region="deep" />

        <WorkspaceSidebarHeader
          workspace={workspace}
          onCreateDirectory={() => void workspace.createDirectory('')}
          onCreateDocument={() => void createDocument('')}
          onRemoveWorkspace={onRemoveWorkspace}
        />

        {workspace.snapshot ? (
          <div className="border-y border-sidebar-border/45 px-2 py-2">
            <button
              aria-current={isDailyActive ? 'page' : undefined}
              className={cn(
                'flex h-8 w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                isDailyActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
              )}
              data-testid="daily-note-entry"
              type="button"
              onClick={onOpenDailyNote}
            >
              <CalendarDays size={15} strokeWidth={1.75} />
              <span className="truncate">日程</span>
            </button>
            <button
              aria-current={systemPage === 'views' ? 'page' : undefined}
              className={cn(
                'mt-1 flex h-8 w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                systemPage === 'views'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
              )}
              data-testid="workspace-views-entry"
              type="button"
              onClick={onOpenViews}
            >
              <Sheet size={15} strokeWidth={1.75} />
              <span className="truncate">视图</span>
            </button>
          </div>
        ) : null}

        <div
          className="workspace-tree-scrollarea min-h-0 flex-1 overflow-y-auto px-2 pb-3"
          data-workspace-tree-scroll-container="true"
        >
          {workspace.snapshot ? (
            <DocumentTree
              currentDirectoryPath={
                workspace.currentDirectory?.absolutePath ?? null
              }
              currentDocumentPath={workspace.currentDocument?.absolutePath ?? null}
              nodes={regularNodes}
              pendingRenameNodePath={workspace.pendingRenameNodePath}
              searchQuery={workspace.searchQuery}
              onCreateDirectory={workspace.createDirectory}
              onCreateDocument={createDocument}
              onDeleteNode={workspace.deleteNode}
              onImportMarkdown={workspace.importMarkdownDocuments}
              onMoveNode={workspace.moveNode}
              onOpenInFileManager={onOpenInFileManager}
              onOpenInPreferredEditor={onOpenInPreferredEditor}
              onPendingRenameConsumed={workspace.clearPendingRenameNode}
              preferredEditorLabel={preferredEditorLabel}
              revealDirectoryPath={revealDirectoryPath}
              onRenameNode={workspace.renameNode}
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

        {dailyCalendar}

        {onOpenSettings ? (
          <footer className="shrink-0 px-2 py-2">
            <button
              aria-label="打开设置"
              className="flex h-8 w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              type="button"
              onClick={onOpenSettings}
            >
              <Settings size={16} strokeWidth={1.75} />
              <span>设置</span>
            </button>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

function WorkspaceSidebarHeader({
  workspace,
  onCreateDirectory,
  onCreateDocument,
  onRemoveWorkspace,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  onCreateDirectory: () => void;
  onCreateDocument: () => void;
  onRemoveWorkspace?: (rootPath: string) => void;
}) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchExpanded) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!searchRootRef.current?.contains(target)) {
        setSearchExpanded(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [searchExpanded]);

  function expandSearch() {
    setSearchExpanded(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return (
    <div className="px-3 pb-2">
      <div className="relative flex h-9 items-center gap-1.5">
        <WorkspaceSwitcher
          compact
          currentWorkspace={workspace.snapshot}
          history={workspace.workspaceHistory}
          isLoading={workspace.isLoading}
          onChooseWorkspaceParent={workspace.chooseWorkspaceParentDirectory}
          onCreateDirectory={onCreateDirectory}
          onCreateDocument={onCreateDocument}
          onCreateWorkspace={workspace.createWorkspace}
          onOpenWorkspace={workspace.openWorkspace}
          onRemoveWorkspace={onRemoveWorkspace ?? workspace.removeWorkspace}
          onSwitchWorkspace={workspace.switchWorkspace}
        />

        <button
          aria-label="展开侧边栏搜索"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            workspace.searchQuery.trim().length > 0 &&
              'bg-sidebar-accent/80 text-sidebar-accent-foreground',
            searchExpanded && 'opacity-0',
          )}
          type="button"
          onClick={expandSearch}
        >
          <Search size={17} strokeWidth={1.8} />
        </button>

        <div
          ref={searchRootRef}
          aria-hidden={!searchExpanded}
          className={cn(
            'absolute right-0 top-0 z-20 h-9 overflow-hidden rounded-md transition-[width,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            searchExpanded
              ? 'w-full translate-x-0 opacity-100'
              : 'pointer-events-none w-8 translate-x-1 opacity-0',
          )}
          data-testid="workspace-sidebar-search-panel"
        >
          <label className="flex h-9 w-full items-center gap-2 rounded-md border border-sidebar-border/70 bg-background/95 px-2.5 text-sm shadow-[0_8px_22px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(15,23,42,0.03)]">
            <Search
              className="shrink-0 text-muted-foreground"
              size={14}
              strokeWidth={1.75}
            />
            <input
              ref={searchInputRef}
              aria-label="搜索"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="搜索"
              role="searchbox"
              value={workspace.searchQuery}
              onChange={(event) => workspace.setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setSearchExpanded(false);
                }
              }}
            />
          </label>
        </div>
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

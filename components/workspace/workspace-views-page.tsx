import * as React from 'react';
import { ChevronsUpDown, RefreshCw, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

type WorkspaceViewSortKey =
  | 'createdAt'
  | 'locked'
  | 'name'
  | 'pinned'
  | 'relativePath'
  | 'updatedAt';
type WorkspaceViewSortDirection = 'asc' | 'desc';

interface WorkspaceViewsPageProps {
  sidebarHeaderOffset?: number;
  nodes: WorkspaceNode[];
  onOpenNode: (node: WorkspaceNode) => void;
  onRefresh: () => void;
  onToggleLocked: (node: WorkspaceNode) => void;
  onTogglePinned: (node: WorkspaceNode) => void;
}

export function WorkspaceViewsPage({
  sidebarHeaderOffset,
  nodes,
  onOpenNode,
  onRefresh,
  onToggleLocked,
  onTogglePinned,
}: WorkspaceViewsPageProps) {
  const alignWithMacSidebar = sidebarHeaderOffset !== undefined;
  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<WorkspaceViewSortKey>('pinned');
  const [sortDirection, setSortDirection] =
    React.useState<WorkspaceViewSortDirection>('desc');
  const refreshTimerRef = React.useRef<number | null>(null);
  const rows = React.useMemo(
    () =>
      flattenWorkspaceViewRows(nodes)
        .filter((node) => {
          const normalizedQuery = query.trim().toLowerCase();

          if (!normalizedQuery) {
            return true;
          }

          return `${getNodeTitle(node)}\n${node.relativePath}`
            .toLowerCase()
            .includes(normalizedQuery);
        })
        .sort((left, right) =>
          compareWorkspaceViewRows(left, right, sortKey, sortDirection),
        ),
    [nodes, query, sortDirection, sortKey],
  );

  function toggleSort(key: WorkspaceViewSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'name' || key === 'relativePath' ? 'asc' : 'desc');
  }

  function handleRefresh() {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = window.setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 520);
  }

  React.useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="workspace-views-page"
    >
      <header
        className={cn(
          'flex shrink-0 gap-3 px-3',
          alignWithMacSidebar ? 'items-start pb-2' : 'h-12 items-center',
        )}
        style={
          alignWithMacSidebar
            ? { height: 44, marginTop: sidebarHeaderOffset }
            : undefined
        }
      >
        <div
          className={cn(
            'min-w-0 flex-1',
            alignWithMacSidebar && 'flex h-9 items-center',
          )}
        >
          <h1 className="text-sm font-medium tracking-normal">视图</h1>
        </div>

        <div
          className={cn(
            'ml-auto flex items-center gap-0.5',
            alignWithMacSidebar && 'h-9',
          )}
          data-align="right-rail"
        >
          <div
            className={cn(
              'grid h-7 items-center overflow-hidden transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              searchOpen ? 'w-56 opacity-100' : 'w-0 opacity-0',
            )}
          >
            <label className="flex h-7 min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 text-xs">
              <Search className="shrink-0 text-muted-foreground" size={13} />
              <input
                aria-label="搜索视图"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                placeholder="搜索名称或位置"
                role="searchbox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchOpen(false);
                    setQuery('');
                  }
                }}
              />
            </label>
          </div>
          <button
            aria-label="搜索视图"
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              (searchOpen || query) && 'bg-accent text-foreground',
            )}
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search size={15} />
          </button>
          <button
            aria-label="刷新视图"
            data-align="right-rail"
            data-refreshing={isRefreshing ? 'true' : 'false'}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            type="button"
            onClick={handleRefresh}
          >
            <RefreshCw
              className={cn(
                'transition-transform duration-500 ease-out',
                isRefreshing && 'animate-spin',
              )}
              size={15}
            />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[860px] table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <tr className="text-left text-xs text-muted-foreground">
              <WorkspaceViewsHeader
                active={sortKey === 'name'}
                direction={sortDirection}
                label="名称"
                sortKey="name"
                onClick={() => toggleSort('name')}
              />
              <WorkspaceViewsHeader
                active={sortKey === 'relativePath'}
                direction={sortDirection}
                label="位置"
                sortKey="relativePath"
                onClick={() => toggleSort('relativePath')}
              />
              <WorkspaceViewsHeader
                active={sortKey === 'createdAt'}
                direction={sortDirection}
                label="创建时间"
                sortKey="createdAt"
                onClick={() => toggleSort('createdAt')}
              />
              <WorkspaceViewsHeader
                active={sortKey === 'updatedAt'}
                direction={sortDirection}
                label="更新时间"
                sortKey="updatedAt"
                onClick={() => toggleSort('updatedAt')}
              />
              <WorkspaceViewsHeader
                active={sortKey === 'pinned'}
                direction={sortDirection}
                label="置顶"
                sortKey="pinned"
                onClick={() => toggleSort('pinned')}
              />
              <WorkspaceViewsHeader
                active={sortKey === 'locked'}
                direction={sortDirection}
                label="锁定"
                sortKey="locked"
                onClick={() => toggleSort('locked')}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((node) => (
              <tr
                className="group border-0 text-foreground/85 transition-colors hover:bg-accent/35"
                key={node.absolutePath}
              >
                <td className="border-t border-border/45 px-5 py-2.5">
                  <button
                    className="max-w-full truncate text-left text-sm font-medium text-[#3574f0] underline-offset-4 transition-colors hover:text-[#255ec7] hover:underline dark:text-[#7aa2ff] dark:hover:text-[#a9c1ff]"
                    data-variant="link"
                    type="button"
                    onClick={() => onOpenNode(node)}
                  >
                    {getNodeTitle(node)}
                  </button>
                </td>
                <td className="border-t border-border/45 px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="block truncate">
                    {getNodeLocation(node)}
                  </span>
                </td>
                <td className="border-t border-border/45 px-4 py-2.5 text-xs text-muted-foreground">
                  {formatNodeTime(node.createdAt)}
                </td>
                <td className="border-t border-border/45 px-4 py-2.5 text-xs text-muted-foreground">
                  {formatNodeTime(node.updatedAt)}
                </td>
                <td className="border-t border-border/45 px-4 py-2.5 text-left">
                  <button
                    aria-label={node.pinned ? '取消置顶' : '置顶'}
                    aria-pressed={Boolean(node.pinned)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full border p-0.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] transition-colors',
                      node.pinned
                        ? 'border-primary/25 bg-primary/15 hover:bg-primary/20'
                        : 'border-border/70 bg-muted/55 hover:bg-muted',
                    )}
                    data-variant="pill"
                    type="button"
                    onClick={() => onTogglePinned(node)}
                  >
                    <span className="sr-only">{node.pinned ? '已置顶' : '置顶'}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'block size-5 rounded-full bg-background shadow-[0_1px_2px_rgba(15,23,42,0.18)] ring-1 ring-border/60 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        node.pinned && 'translate-x-5 bg-primary ring-primary/20',
                      )}
                    />
                  </button>
                </td>
                <td className="border-t border-border/45 px-4 py-2.5 text-left">
                  <button
                    aria-label={node.locked ? '切换为编辑' : '切换为只读'}
                    aria-pressed={Boolean(node.locked)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full border p-0.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] transition-colors',
                      node.locked
                        ? 'border-primary/25 bg-primary/15 hover:bg-primary/20'
                        : 'border-border/70 bg-muted/55 hover:bg-muted',
                    )}
                    data-variant="pill"
                    type="button"
                    onClick={() => onToggleLocked(node)}
                  >
                    <span className="sr-only">{node.locked ? '只读' : '编辑'}</span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'block size-5 rounded-full bg-background shadow-[0_1px_2px_rgba(15,23,42,0.18)] ring-1 ring-border/60 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        node.locked && 'translate-x-5 bg-primary ring-primary/20',
                      )}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkspaceViewsHeader({
  active,
  direction,
  sortKey,
  label,
  onClick,
}: {
  active: boolean;
  direction: WorkspaceViewSortDirection;
  sortKey: WorkspaceViewSortKey;
  label: string;
  onClick: () => void;
}) {
  return (
    <th className="border-t border-border/40 px-4 py-0 font-normal" scope="col">
      <button
        className="flex h-9 w-full items-center gap-2 rounded-sm text-left transition-colors hover:text-foreground"
        type="button"
        onClick={onClick}
      >
        <span className="truncate">{label}</span>
        <span
          aria-hidden="true"
          data-testid={`workspace-view-sort-icon-${sortKey}`}
          className={cn(
            'ml-auto inline-flex size-4 items-center justify-center text-muted-foreground/55 transition-colors',
            active && 'text-foreground',
          )}
        >
          <ChevronsUpDown
            className={cn(active && direction === 'desc' && 'rotate-180')}
            size={13}
            strokeWidth={1.9}
          />
        </span>
      </button>
    </th>
  );
}

function flattenWorkspaceViewRows(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'document'
      ? [node]
      : flattenWorkspaceViewRows(node.children ?? []),
  );
}

function compareWorkspaceViewRows(
  left: WorkspaceNode,
  right: WorkspaceNode,
  sortKey: WorkspaceViewSortKey,
  direction: WorkspaceViewSortDirection,
) {
  const directionFactor = direction === 'asc' ? 1 : -1;
  const pinnedCompare = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));

  if (sortKey !== 'pinned' && pinnedCompare !== 0) {
    return pinnedCompare;
  }

  const result = compareBySortKey(left, right, sortKey);

  return result === 0
    ? getNodeTitle(left).localeCompare(getNodeTitle(right), 'zh-CN')
    : result * directionFactor;
}

function compareBySortKey(
  left: WorkspaceNode,
  right: WorkspaceNode,
  sortKey: WorkspaceViewSortKey,
) {
  switch (sortKey) {
    case 'createdAt':
      return (left.createdAt ?? 0) - (right.createdAt ?? 0);
    case 'updatedAt':
      return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
    case 'pinned':
      return Number(Boolean(left.pinned)) - Number(Boolean(right.pinned));
    case 'locked':
      return Number(Boolean(left.locked)) - Number(Boolean(right.locked));
    case 'relativePath':
      return left.relativePath.localeCompare(right.relativePath, 'zh-CN');
    case 'name':
      return getNodeTitle(left).localeCompare(getNodeTitle(right), 'zh-CN');
  }
}

function getNodeTitle(node: WorkspaceNode) {
  const raw = node.title || node.name.replace(/\.(md|mdx)$/i, '');

  return raw.replaceAll('**', '').trim();
}

function getNodeLocation(node: WorkspaceNode) {
  const index = node.relativePath.lastIndexOf('/');

  return index >= 0 ? node.relativePath.slice(0, index) : '根目录';
}

function formatNodeTime(value?: number) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

'use client';

import * as React from 'react';
import {
  FileText,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  DocumentPreviewCard,
  useDocumentPreviews,
  type DocumentPreview,
} from './document-preview';
import { WorkspaceTreeFolderIcon } from './workspace-tree-folder-icon';
import type { WorkspaceNode } from './workspace-types';

type DirectoryViewMode = 'grid' | 'list';
type DirectoryPageVariant =
  | 'directory'
  | 'pinned-overview'
  | 'workspace-overview';

interface DirectoryPageProps {
  directory: WorkspaceNode;
  workspaceRootPath: string;
  variant?: DirectoryPageVariant;
  onOpenDocument: (node: WorkspaceNode) => void;
  onSelectDirectory: (node: WorkspaceNode) => void;
}

export function DirectoryPage({
  directory,
  workspaceRootPath,
  variant = 'directory',
  onOpenDocument,
  onSelectDirectory,
}: DirectoryPageProps) {
  const [query, setQuery] = React.useState('');
  const [viewMode, setViewMode] = React.useState<DirectoryViewMode>('grid');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const isPinnedOverview = variant === 'pinned-overview';
  const isWorkspaceOverview = variant === 'workspace-overview';
  const usesOverviewCards = isPinnedOverview || isWorkspaceOverview;
  const childDirectories = React.useMemo(
    () => getChildDirectories(directory),
    [directory],
  );
  const directDocuments = React.useMemo(
    () => getDirectDocuments(directory),
    [directory],
  );
  const recursiveDocuments = React.useMemo(
    () => collectDocuments(directory),
    [directory],
  );
  const previewDocuments = React.useMemo(
    () =>
      normalizedQuery
        ? recursiveDocuments.map(({ node }) => node)
        : directDocuments,
    [directDocuments, normalizedQuery, recursiveDocuments],
  );
  const previews = useDocumentPreviews(previewDocuments, workspaceRootPath);
  const visibleDocuments = normalizedQuery
    ? recursiveDocuments.filter(({ node }) =>
        isDocumentMatch(
          node,
          normalizedQuery,
          previews[node.absolutePath]?.text,
        ),
      )
    : directDocuments.map((node) => ({ depth: 0, node }));

  return (
    <div className="directory-page-scrollarea h-full overflow-auto bg-muted/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-8 py-12 md:px-12 md:py-16">
        <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {directory.name}
          </h1>

          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-64">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60"
              />
              <Input
                aria-label={
                  isPinnedOverview
                    ? '搜索置顶内容'
                    : isWorkspaceOverview
                      ? '搜索工作区文档'
                      : '搜索当前目录下的文档'
                }
                className="h-9 rounded-lg border-transparent bg-muted/50 pl-9 text-sm transition-all hover:bg-muted/70 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/20"
                placeholder="搜索..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          </div>
        </header>

        {!normalizedQuery && childDirectories.length > 0 ? (
          <section>
            <SectionHeading
              title={
                isPinnedOverview
                  ? '置顶目录'
                  : isWorkspaceOverview
                    ? '工作区'
                    : '子目录'
              }
            />
            <div
              className={cn(
                'grid gap-4',
                usesOverviewCards
                  ? 'grid-cols-[repeat(auto-fill,minmax(180px,220px))]'
                  : 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))]',
              )}
            >
              {childDirectories.map((child) => (
                <DirectoryCard
                  key={child.absolutePath}
                  directory={child}
                  workspaceOverview={usesOverviewCards}
                  onSelectDirectory={onSelectDirectory}
                />
              ))}
            </div>
          </section>
        ) : null}

        {visibleDocuments.length > 0 || normalizedQuery ? (
          <section>
            <SectionHeading
              title={
                normalizedQuery
                  ? '搜索结果'
                  : isPinnedOverview
                    ? '置顶文档'
                    : '文档'
              }
            />

            {visibleDocuments.length > 0 ? (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6'
                    : 'flex flex-col gap-1'
                }
              >
                {viewMode === 'list' ? <DocumentListHeader /> : null}
                {visibleDocuments.map(({ node }) => (
                  <DocumentCard
                    key={node.absolutePath}
                    document={node}
                    directory={directory}
                    preview={previews[node.absolutePath]}
                    showPath={Boolean(normalizedQuery)}
                    viewMode={viewMode}
                    onOpenDocument={onOpenDocument}
                  />
                ))}
              </div>
            ) : (
              <EmptyDirectoryState query={query} />
            )}
          </section>
        ) : null}

        {isPinnedOverview &&
        !normalizedQuery &&
        childDirectories.length === 0 &&
        directDocuments.length === 0 ? (
          <PinnedOverviewEmptyState />
        ) : null}
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground/80 uppercase">
      {title}
    </h2>
  );
}

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: DirectoryViewMode;
  onChange: (mode: DirectoryViewMode) => void;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center rounded-lg bg-muted/40 p-1">
      <button
        aria-pressed={value === 'grid'}
        aria-label="网格视图"
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-200',
          value === 'grid'
            ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
            : 'hover:text-foreground',
        )}
        type="button"
        onClick={() => onChange('grid')}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        aria-pressed={value === 'list'}
        aria-label="列表视图"
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-200',
          value === 'list'
            ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
            : 'hover:text-foreground',
        )}
        type="button"
        onClick={() => onChange('list')}
      >
        <List size={14} />
      </button>
    </div>
  );
}

function DirectoryCard({
  directory,
  workspaceOverview,
  onSelectDirectory,
}: {
  directory: WorkspaceNode;
  workspaceOverview: boolean;
  onSelectDirectory: (node: WorkspaceNode) => void;
}) {
  const stats = getDirectoryStats(directory);

  return (
    <button
      aria-label={`打开目录 ${directory.name}`}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-muted/30 p-6 text-center transition-all duration-200',
        workspaceOverview && 'min-h-44',
        'hover:-translate-y-0.5 hover:bg-muted/50 hover:shadow-sm',
        'dark:border dark:border-muted-foreground/25 dark:bg-muted/15 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_1px_2px_rgba(0,0,0,0.2)] dark:hover:border-muted-foreground/45 dark:hover:bg-muted/30 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_24px_-18px_rgba(0,0,0,0.9)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      title={directory.name}
      type="button"
      onClick={() => onSelectDirectory(directory)}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl text-muted-foreground/70 transition-transform duration-200 group-hover:scale-110 group-hover:text-foreground/80">
        <WorkspaceTreeFolderIcon expanded className="size-8" />
      </div>
      <div className="space-y-1">
        <h3 className="truncate text-sm font-medium text-foreground">
          {directory.name}
        </h3>
        <p className="truncate text-xs text-muted-foreground/70">
          {stats.totalDocuments} 个项目
        </p>
      </div>
    </button>
  );
}

function DocumentCard({
  directory,
  document,
  preview,
  showPath,
  viewMode,
  onOpenDocument,
}: {
  directory: WorkspaceNode;
  document: WorkspaceNode;
  preview?: DocumentPreview;
  showPath: boolean;
  viewMode: DirectoryViewMode;
  onOpenDocument: (node: WorkspaceNode) => void;
}) {
  const title = getNodeTitle(document);
  const path = getRelativeLabel(directory, document);
  const articlePreview =
    preview === undefined
      ? '正在提取文档摘要...'
      : preview.text || '这个文档暂时没有正文内容。';
  const updatedAt =
    preview === undefined
      ? '读取中'
      : formatDocumentDate(
          preview.modifiedAt ?? preview.updatedAt ?? preview.createdAt ?? null,
        );

  if (viewMode === 'list') {
    return (
      <button
        aria-label={`打开文档 ${title}`}
        className={cn(
          'group flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-muted/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
        title={title}
        type="button"
        onClick={() => onOpenDocument(document)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
            <p className="truncate text-xs text-muted-foreground/70">
              {showPath ? `${path} · ` : null}{articlePreview.slice(0, 50)}...
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-6 text-xs text-muted-foreground/70 md:flex">
          <span className="w-24 text-right">{updatedAt}</span>
        </div>
      </button>
    );
  }

  return (
    <DocumentPreviewCard
      title={title}
      preview={preview}
      onOpen={() => onOpenDocument(document)}
    />
  );
}

function DocumentListHeader() {
  return null;
}

function EmptyDirectoryState({ query }: { query: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/10 px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50">
        <Search className="size-6 text-muted-foreground/50" />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-medium text-foreground">没有找到“{query.trim()}”</p>
        <p className="text-xs text-muted-foreground/80">
          换一个关键词，或在左侧树中进入更具体的子目录。
        </p>
      </div>
    </div>
  );
}

function PinnedOverviewEmptyState() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/10 px-6 text-center">
      <p className="text-sm font-medium text-foreground">暂无置顶内容</p>
      <p className="mt-1 text-xs text-muted-foreground/80">
        可以从目录树的项目菜单中添加置顶内容。
      </p>
    </div>
  );
}

function getChildDirectories(directory: WorkspaceNode) {
  return (directory.children ?? []).filter(
    (child) => child.kind === 'directory' && !isHiddenDirectory(child),
  );
}

function getDirectDocuments(directory: WorkspaceNode) {
  return (directory.children ?? []).filter((child) => child.kind === 'document');
}

function collectDocuments(directory: WorkspaceNode) {
  const documents: Array<{ depth: number; node: WorkspaceNode }> = [];
  const seenPaths = new Set<string>();

  function visit(node: WorkspaceNode, depth: number) {
    for (const child of node.children ?? []) {
      if (child.kind === 'document') {
        if (!seenPaths.has(child.absolutePath)) {
          seenPaths.add(child.absolutePath);
          documents.push({ depth, node: child });
        }
        continue;
      }

      if (isHiddenDirectory(child)) {
        continue;
      }

      visit(child, depth + 1);
    }
  }

  visit(directory, 0);

  return documents;
}

function getDirectoryStats(directory: WorkspaceNode) {
  let totalDocuments = 0;
  let totalDirectories = 0;
  let maxDepth = 0;

  function visit(node: WorkspaceNode, depth: number) {
    maxDepth = Math.max(maxDepth, depth);

    for (const child of node.children ?? []) {
      if (child.kind === 'document') {
        totalDocuments += 1;
      } else {
        if (isHiddenDirectory(child)) {
          continue;
        }

        totalDirectories += 1;
        visit(child, depth + 1);
      }
    }
  }

  visit(directory, 0);

  return {
    maxDepth: Math.max(1, maxDepth + 1),
    totalDirectories,
    totalDocuments,
  };
}

function isHiddenDirectory(node: WorkspaceNode) {
  return node.kind === 'directory' && node.name.startsWith('.');
}

function isDocumentMatch(
  document: WorkspaceNode,
  normalizedQuery: string,
  preview = '',
) {
  return `${getNodeTitle(document)} ${document.name} ${document.relativePath} ${preview}`
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function getNodeTitle(node: WorkspaceNode) {
  return node.title || getDocumentFileName(node);
}

function getDocumentFileName(node: WorkspaceNode) {
  return node.name.replace(/\.plate\.json$/i, '');
}

function getRelativeLabel(directory: WorkspaceNode, document: WorkspaceNode) {
  const prefix = directory.relativePath
    ? `${directory.relativePath.replace(/\/$/u, '')}/`
    : '';

  return document.relativePath.startsWith(prefix)
    ? document.relativePath.slice(prefix.length)
    : document.relativePath;
}

function formatDocumentDate(value: number | string | null) {
  if (value === null) {
    return '未读取';
  }

  const date = parseDocumentDate(value);

  if (Number.isNaN(date.getTime())) {
    return '未读取';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs >= 0 && diffMs < minute) {
    return '刚刚';
  }

  if (diffMs >= 0 && diffMs < hour) {
    return `${Math.floor(diffMs / minute)} 分钟前`;
  }

  if (diffMs >= 0 && diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时前`;
  }

  if (diffMs >= 0 && diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)} 天前`;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function parseDocumentDate(value: number | string) {
  if (typeof value === 'number') {
    return new Date(value);
  }

  const normalized = value.trim();
  const legacyEpochMillis = normalized.match(/^(\d+)Z?$/u);

  if (legacyEpochMillis) {
    return new Date(Number(legacyEpochMillis[1]));
  }

  return new Date(normalized);
}

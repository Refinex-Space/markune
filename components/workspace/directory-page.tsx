'use client';

import * as React from 'react';
import {
  ArrowRight,
  Folder,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';

import { parseMarkdownMetadata } from '@/components/editor/markdown-frontmatter';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { readMarkdownDocument } from './workspace-api';
import type { WorkspaceNode } from './workspace-types';

type DirectoryViewMode = 'grid' | 'list';

const DIRECTORY_PREVIEW_BATCH_SIZE = 24;
const DIRECTORY_PREVIEW_READ_CONCURRENCY = 4;

interface DocumentPreview {
  createdAt: number | string | null;
  modifiedAt: number | null;
  text: string;
  updatedAt: number | string | null;
}

interface DirectoryPageProps {
  directory: WorkspaceNode;
  workspaceRootPath: string;
  onOpenDocument: (node: WorkspaceNode) => void;
  onSelectDirectory: (node: WorkspaceNode) => void;
}

export function DirectoryPage({
  directory,
  workspaceRootPath,
  onOpenDocument,
  onSelectDirectory,
}: DirectoryPageProps) {
  const [query, setQuery] = React.useState('');
  const [viewMode, setViewMode] = React.useState<DirectoryViewMode>('grid');
  const [previews, setPreviews] = React.useState<
    Record<string, DocumentPreview>
  >({});
  const normalizedQuery = query.trim().toLocaleLowerCase();
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
  const visibleDocuments = normalizedQuery
    ? recursiveDocuments.filter(({ node }) =>
        isDocumentMatch(
          node,
          normalizedQuery,
          previews[node.absolutePath]?.text,
        ),
      )
    : directDocuments.map((node) => ({ depth: 0, node }));
  React.useEffect(() => {
    let cancelled = false;
    const documentsToLoad = previewDocuments
      .filter((node) => previews[node.absolutePath] === undefined)
      .slice(0, DIRECTORY_PREVIEW_BATCH_SIZE);

    if (documentsToLoad.length === 0) {
      return;
    }

    async function loadPreviews() {
      const loadedEntries: Array<readonly [string, DocumentPreview]> = [];
      let cursor = 0;

      async function readNextPreview() {
        while (cursor < documentsToLoad.length) {
          const node = documentsToLoad[cursor];
          cursor += 1;

          try {
            const content = await readMarkdownDocument(
              workspaceRootPath,
              node.absolutePath,
            );
            const parsed = parseMarkdownMetadata(content.content, node.name);

            loadedEntries.push([
              node.absolutePath,
              await createDocumentPreview(parsed.body, {
                createdAt: parsed.metadata.createdAt ?? content.modifiedAt,
                modifiedAt: content.modifiedAt,
                updatedAt: parsed.metadata.updatedAt ?? content.modifiedAt,
              }),
            ]);
          } catch {
            loadedEntries.push([
              node.absolutePath,
              {
                createdAt: null,
                modifiedAt: null,
                text: '',
                updatedAt: null,
              },
            ]);
          }
        }
      }

      await Promise.all(
        Array.from(
          {
            length: Math.min(
              DIRECTORY_PREVIEW_READ_CONCURRENCY,
              documentsToLoad.length,
            ),
          },
          () => readNextPreview(),
        ),
      );

      if (!cancelled) {
        setPreviews((current) => ({
          ...current,
          ...Object.fromEntries(loadedEntries),
        }));
      }
    }

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [previewDocuments, previews, workspaceRootPath]);

  return (
    <div className="directory-page-scrollarea h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        <header className="space-y-3 pb-0.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {directory.name}
          </h1>

          <div className="flex w-full items-center justify-between gap-3">
            <div className="relative min-w-0 max-w-lg flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="搜索当前目录下的文档"
                className="h-9 bg-background pl-9 text-sm"
                placeholder="搜索当前目录下的文档"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          </div>
        </header>

        {!normalizedQuery && childDirectories.length > 0 ? (
          <section className="space-y-2.5">
            <SectionHeading title="子目录" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
              {childDirectories.map((child) => (
                <DirectoryCard
                  key={child.absolutePath}
                  directory={child}
                  onSelectDirectory={onSelectDirectory}
                />
              ))}
            </div>
          </section>
        ) : null}

        {visibleDocuments.length > 0 || normalizedQuery ? (
          <section className="space-y-2.5">
            <SectionHeading title={normalizedQuery ? '搜索结果' : '文档'} />

            {visibleDocuments.length > 0 ? (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'overflow-hidden rounded-lg'
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
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
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
    <div className="flex h-8 shrink-0 items-center rounded-md bg-muted/50 p-0.5 ring-1 ring-border/60">
      <button
        aria-pressed={value === 'grid'}
        aria-label="网格视图"
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
          value === 'grid' &&
            'bg-background text-foreground ring-1 ring-border/70',
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
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
          value === 'list' &&
            'bg-background text-foreground ring-1 ring-border/70',
        )}
        type="button"
        onClick={() => onChange('list')}
      >
        <List size={15} />
      </button>
    </div>
  );
}

function DirectoryCard({
  directory,
  onSelectDirectory,
}: {
  directory: WorkspaceNode;
  onSelectDirectory: (node: WorkspaceNode) => void;
}) {
  const stats = getDirectoryStats(directory);

  return (
    <button
      aria-label={`打开目录 ${directory.name}`}
      className={cn(
        'group relative flex min-h-[72px] min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-lg border border-border/70 bg-background p-3 text-left transition-colors duration-150',
        'hover:border-[#3574f0]/35 hover:bg-muted/25',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      title={directory.name}
      type="button"
      onClick={() => onSelectDirectory(directory)}
    >
      <Folder className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 pr-5">
        <h3 className="truncate text-sm font-medium leading-5">
          {directory.name}
        </h3>
        <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
          {stats.totalDocuments} 篇文档 · {stats.totalDirectories} 个子目录
        </p>
      </div>
      <ArrowRight className="absolute right-3 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
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
  const createdAt =
    preview === undefined
      ? '读取中'
      : formatDocumentDate(
          preview.createdAt ?? preview.updatedAt ?? preview.modifiedAt ?? null,
        );

  if (viewMode === 'list') {
    return (
      <button
        aria-label={`打开文档 ${title}`}
        className={cn(
          'group grid w-full grid-cols-[minmax(0,1fr)] items-center gap-4 border-b border-border/50 px-0 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/25',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          'md:grid-cols-[minmax(360px,1fr)_120px_120px]',
        )}
        title={title}
        type="button"
        onClick={() => onOpenDocument(document)}
      >
        <div className="min-w-0 space-y-1 px-1 md:px-0">
          <h3 className="truncate text-sm font-semibold leading-5">{title}</h3>
          <p className="truncate text-xs leading-5 text-foreground/60">
            {articlePreview}
          </p>
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">
          {updatedAt}
        </div>
        <div className="hidden text-xs text-muted-foreground md:block">
          {createdAt}
        </div>
      </button>
    );
  }

  return (
    <button
      aria-label={`打开文档 ${title}`}
      className={cn(
        'group relative flex min-h-[112px] min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background p-4 text-left transition-colors duration-150 dark:bg-card',
        'hover:border-[#3574f0]/35 hover:bg-muted/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      title={title}
      type="button"
      onClick={() => onOpenDocument(document)}
    >
      <div className="min-w-0 space-y-1 pr-5">
        <h3 className="line-clamp-1 text-sm font-semibold leading-5">
          {title}
        </h3>
        <p className="truncate text-xs leading-4 text-muted-foreground">
          {showPath ? `${path} · ` : null}更新于 {updatedAt}
        </p>
      </div>

      <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-foreground/60">
        {articlePreview}
      </p>

      <ArrowRight className="absolute right-4 top-4 size-3.5 text-[#3574f0] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

function DocumentListHeader() {
  return (
    <div
      className={cn(
        'hidden grid-cols-[minmax(360px,1fr)_120px_120px] gap-4 border-b border-border/70 pb-2 text-xs text-muted-foreground md:grid',
      )}
    >
      <div>名称</div>
      <div>修改时间</div>
      <div>创建时间</div>
    </div>
  );
}

function EmptyDirectoryState({ query }: { query: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed bg-muted/10 px-6 text-center">
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-medium">没有找到“{query.trim()}”</p>
        <p className="text-xs text-muted-foreground">
          换一个关键词，或在左侧树中进入更具体的子目录。
        </p>
      </div>
    </div>
  );
}

function getChildDirectories(directory: WorkspaceNode) {
  return (directory.children ?? []).filter(
    (child) => child.kind === 'directory',
  );
}

function getDirectDocuments(directory: WorkspaceNode) {
  return (directory.children ?? []).filter((child) => child.kind === 'document');
}

function collectDocuments(directory: WorkspaceNode) {
  const documents: Array<{ depth: number; node: WorkspaceNode }> = [];

  function visit(node: WorkspaceNode, depth: number) {
    for (const child of node.children ?? []) {
      if (child.kind === 'document') {
        documents.push({ depth, node: child });
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

async function createDocumentPreview(
  body: string,
  meta: Pick<DocumentPreview, 'createdAt' | 'modifiedAt' | 'updatedAt'>,
): Promise<DocumentPreview> {
  return {
    ...meta,
    text: trimPreviewText(extractPlainText(body)),
  };
}

function extractPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimPreviewText(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 180)}...`;
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

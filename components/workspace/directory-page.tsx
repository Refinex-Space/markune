'use client';

import * as React from 'react';
import {
  ArrowRight,
  FileText,
  Folder,
  LayoutGrid,
  Layers3,
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
  const stats = React.useMemo(
    () => getDirectoryStats(directory),
    [directory],
  );
  const directoryPreviewTitles = React.useMemo(
    () => getDirectoryPreviewTitles(childDirectories),
    [childDirectories],
  );

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-8 py-8">
        <header className="space-y-5 pb-3">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="truncate text-sm text-muted-foreground">
                {getParentLabel(directory)}
              </div>
              <div className="space-y-2">
                <h1 className="truncate text-3xl font-semibold tracking-normal">
                  {directory.name}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  浏览这个目录下的文档和子目录。搜索会覆盖当前目录的全部层级。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 text-sm">
              <DirectoryStat
                icon={<FileText size={16} />}
                label="文档"
                value={stats.totalDocuments}
              />
              <DirectoryStat
                icon={<Folder size={16} />}
                label="子目录"
                value={stats.totalDirectories}
              />
              <DirectoryStat
                icon={<Layers3 size={16} />}
                label="层级"
                value={stats.maxDepth}
              />
            </div>
          </div>

          <div className="relative max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="h-10 bg-background pl-9"
              placeholder="搜索当前目录下的文档"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </header>

        {!normalizedQuery && childDirectories.length > 0 ? (
          <section className="space-y-3">
            <SectionHeading
              count={childDirectories.length}
              title="子目录"
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {childDirectories.map((child) => (
                <DirectoryCard
                  key={child.absolutePath}
                  directory={child}
                  previewTitles={directoryPreviewTitles[child.absolutePath] ?? []}
                  onSelectDirectory={onSelectDirectory}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading
              count={visibleDocuments.length}
              title={normalizedQuery ? '搜索结果' : '文档'}
            />
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          </div>

          {visibleDocuments.length > 0 ? (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-5'
                  : 'overflow-hidden rounded-lg'
              }
            >
              {viewMode === 'list' ? <DocumentListHeader /> : null}
              {visibleDocuments.map(({ depth, node }) => (
                <DocumentCard
                  key={node.absolutePath}
                  depth={depth}
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
            <EmptyDirectoryState
              hasQuery={Boolean(normalizedQuery)}
              query={query}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function DirectoryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-20">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function SectionHeading({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="text-xs text-muted-foreground">{count} 项</span>
    </div>
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
    <div className="flex h-8 items-center rounded-lg bg-muted/60 p-0.5 ring-1 ring-border/60">
      <button
        aria-pressed={value === 'grid'}
        aria-label="网格视图"
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
          value === 'grid' && 'bg-background text-foreground shadow-sm',
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
          value === 'list' && 'bg-background text-foreground shadow-sm',
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
  previewTitles,
  onSelectDirectory,
}: {
  directory: WorkspaceNode;
  previewTitles: string[];
  onSelectDirectory: (node: WorkspaceNode) => void;
}) {
  const stats = getDirectoryStats(directory);

  return (
    <button
      className={cn(
        'group relative grid min-h-40 grid-rows-[52px_minmax(68px,1fr)] rounded-lg border bg-background p-4 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-[#3574f0]/45 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      type="button"
      onClick={() => onSelectDirectory(directory)}
    >
      <ArrowRight className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="min-w-0 self-end pb-3 pr-6">
        <h3 className="truncate text-base font-semibold leading-5">
          {directory.name}
        </h3>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          {stats.totalDocuments} 篇文档 / {stats.totalDirectories} 个子目录
        </p>
      </div>
      <div className="space-y-1.5 border-t pt-3">
        {previewTitles.length > 0 ? (
          previewTitles.slice(0, 3).map((title) => (
            <p
              key={title}
              className="truncate text-xs leading-5 text-muted-foreground"
            >
              {title}
            </p>
          ))
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            进入目录查看内部内容。
          </p>
        )}
      </div>
    </button>
  );
}

function DocumentCard({
  depth,
  directory,
  document,
  preview,
  showPath,
  viewMode,
  onOpenDocument,
}: {
  depth: number;
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
        className={cn(
          'group grid w-full grid-cols-[minmax(0,1fr)] items-center gap-4 border-b border-border/50 px-0 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/25',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'md:grid-cols-[minmax(360px,1fr)_120px_120px]',
        )}
        type="button"
        onClick={() => onOpenDocument(document)}
      >
        <div className="flex min-w-0 items-center gap-4 px-1 md:px-0">
          <DocumentThumbnail
            className="h-[70px] w-[50px] shrink-0 rounded-sm"
            preview={preview}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-sm font-semibold leading-5">
              {title}
            </h3>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {articlePreview}
            </p>
          </div>
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
      className={cn(
        'group overflow-hidden rounded-2xl bg-background text-left transition-all duration-200 dark:bg-card',
        'shadow-[0_1px_2px_rgba(16,24,40,0.06),0_10px_28px_rgba(16,24,40,0.06)] ring-1 ring-black/[0.06] dark:ring-white/[0.11]',
        'dark:shadow-[0_1px_2px_rgba(0,0,0,0.45),0_16px_36px_rgba(0,0,0,0.32)]',
        'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.08),0_18px_40px_rgba(16,24,40,0.10)] hover:ring-black/[0.09]',
        'dark:hover:shadow-[0_2px_5px_rgba(0,0,0,0.55),0_20px_44px_rgba(0,0,0,0.42)] dark:hover:ring-white/[0.18]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      type="button"
      onClick={() => onOpenDocument(document)}
    >
      <div className="space-y-1.5 px-5 pb-2.5 pt-4">
        <h3 className="line-clamp-1 text-base font-semibold leading-5">
          {title}
        </h3>
        <p className="truncate text-[11px] leading-4 text-muted-foreground">
          {showPath ? path : '当前目录'} · 更新 {updatedAt}
        </p>
      </div>

      <DocumentThumbnail className="mx-5 h-52" preview={preview} />

      <div className="flex items-center justify-between px-5 pb-4 pt-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {depth > 0 ? `${depth} 层内` : getDocumentFileName(document)}
        </span>
        <span className="flex items-center gap-1 text-[#3574f0] opacity-0 transition-opacity group-hover:opacity-100">
          打开
          <ArrowRight size={13} />
        </span>
      </div>
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

function DocumentThumbnail({
  className,
  preview: previewData,
}: {
  className?: string;
  preview?: DocumentPreview;
}) {
  const text = previewData?.text ?? '';
  const lines = text ? splitPreviewLines(text) : [];

  return (
    <div
      className={cn(
        'overflow-hidden bg-background text-foreground',
        '[--background:#ffffff] [--border:#e5e5e5] [--foreground:#171717] [--muted:#f5f5f5] [--muted-foreground:#737373]',
        'dark:bg-card dark:[--background:var(--card)] dark:[--border:color-mix(in_oklab,var(--card-foreground)_12%,transparent)] dark:[--foreground:var(--card-foreground)] dark:[--muted:color-mix(in_oklab,var(--card-foreground)_7%,var(--card))] dark:[--muted-foreground:var(--muted-foreground)]',
        className,
      )}
    >
      {lines.length > 0 ? (
        <div className="h-full space-y-3 px-5 py-4">
          <div className="space-y-1.5">
            <div className="h-2 w-2/3 rounded bg-foreground/25" />
            <div className="h-2 w-full rounded bg-muted-foreground/20" />
          </div>
          <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
            {lines.map((line, index) => (
              <p className="line-clamp-2" key={`${line}-${index}`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-full space-y-2 px-5 py-4">
          <div className="h-2 w-2/3 rounded bg-muted/80" />
          <div className="h-2 w-full rounded bg-muted/60" />
          <div className="h-2 w-5/6 rounded bg-muted/60" />
          <div className="mt-4 h-12 rounded-sm bg-muted/35" />
        </div>
      )}
    </div>
  );
}

function EmptyDirectoryState({
  hasQuery,
  query,
}: {
  hasQuery: boolean;
  query: string;
}) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed bg-muted/10 px-6 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-medium">
          {hasQuery ? `没有找到“${query.trim()}”` : '这个目录还没有文档'}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasQuery
            ? '换一个关键词，或在左侧树中进入更具体的子目录。'
            : '可以从左侧目录菜单中新建或导入文档。'}
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

function getDirectoryPreviewTitles(directories: WorkspaceNode[]) {
  return Object.fromEntries(
    directories.map((directory) => [
      directory.absolutePath,
      collectDocuments(directory)
        .slice(0, 3)
        .map(({ node }) => getNodeTitle(node)),
    ]),
  );
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

function getParentLabel(directory: WorkspaceNode) {
  const parent = directory.relativePath.split('/').slice(0, -1).join('/');

  return parent || '工作区根目录';
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

function splitPreviewLines(text: string) {
  return text
    .split(/[。！？.!?]\s*/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
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

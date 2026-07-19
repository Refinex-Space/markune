'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  Download,
  FileImage,
  Grid2X2,
  List,
  MoreHorizontal,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { DrawingEditorDynamic } from './drawing-editor-dynamic';
import type {
  DrawingEditorActions,
  DrawingExportFormat,
} from './drawing-editor-types';
import { readDrawingPreview, selectDrawingExportTarget, writeDrawingExport } from './workspace-api';
import type { DrawingController } from './use-drawing-controller';
import type {
  DrawingIssue,
  DrawingSummary,
  DrawingTrashedAlbumSummary,
} from './workspace-types';

type GalleryViewMode = 'grid' | 'list';
type GallerySort = 'created' | 'name' | 'updated';

export function DrawingWorkspacePage({
  controller,
  rootPath,
  theme,
}: {
  controller: DrawingController;
  rootPath: string;
  theme: 'dark' | 'light';
}) {
  if (
    controller.selection.kind === 'drawing' &&
    controller.descriptor &&
    controller.scene
  ) {
    return (
      <DrawingEditorSurface
        controller={controller}
        theme={theme}
      />
    );
  }

  if (controller.selection.kind === 'drawing' && controller.descriptor) {
    return <DrawingRecoverySurface controller={controller} />;
  }

  return <DrawingGallery controller={controller} rootPath={rootPath} />;
}

function DrawingRecoverySurface({
  controller,
}: {
  controller: DrawingController;
}) {
  const descriptor = controller.descriptor!;
  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <Button
          aria-label="返回图集"
          size="icon-sm"
          variant="ghost"
          onClick={() => void controller.selectCollection('all')}
        >
          <ArrowLeft />
        </Button>
        <h1 className="truncate text-sm font-medium">{descriptor.meta.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <AlertTriangle className="mb-4 text-amber-600" size={28} />
          <h2 className="text-base font-semibold">主场景无法打开</h2>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            {controller.error || '图稿文件可能已损坏，可以尝试加载上一份有效备份。'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              disabled={!descriptor.hasBackup || controller.loading}
              onClick={() => void controller.openBackup()}
            >
              <RefreshCw /> 从备份恢复
            </Button>
            <Button
              variant="outline"
              onClick={() => void controller.importFiles(descriptor.albumPath)}
            >
              重新导入
            </Button>
            <Button
              variant="ghost"
              onClick={() => void controller.moveToTrash(descriptor.meta.id)}
            >
              <Trash2 /> 移到回收站
            </Button>
          </div>
          {descriptor.hasBackup ? (
            <p className="mt-3 text-xs text-muted-foreground">
              备份加载后会标记为未保存；请检查内容并手动保存。若磁盘版本已变化，仍需明确选择覆盖。
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              当前 bundle 没有可用备份，请重新导入原始 .excalidraw 文件。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function DrawingGallery({
  controller,
  rootPath,
}: {
  controller: DrawingController;
  rootPath: string;
}) {
  const [viewMode, setViewMode] = React.useState<GalleryViewMode>('grid');
  const [sort, setSort] = React.useState<GallerySort>('updated');
  const drawings = React.useMemo(
    () => sortDrawings(controller.visibleDrawings, sort),
    [controller.visibleDrawings, sort],
  );
  const trash =
    controller.selection.kind === 'collection' &&
    controller.selection.collection === 'trash';
  const trashAlbums = trash ? controller.snapshot.trashAlbums : [];
  const title = galleryTitle(controller);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="text-[11px] text-muted-foreground">
            {drawings.length} 幅图稿
            {trashAlbums.length > 0 ? ` · ${trashAlbums.length} 个图集` : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label="图稿排序"
            className="h-7 rounded-md border bg-background px-2 text-xs outline-none"
            value={sort}
            onChange={(event) => setSort(event.target.value as GallerySort)}
          >
            <option value="updated">最近更新</option>
            <option value="created">创建时间</option>
            <option value="name">名称</option>
          </select>
          <Button
            aria-label="缩略图视图"
            size="icon-sm"
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('grid')}
          >
            <Grid2X2 />
          </Button>
          <Button
            aria-label="列表视图"
            size="icon-sm"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('list')}
          >
            <List />
          </Button>
          <Button
            aria-label="刷新图集"
            size="icon-sm"
            variant="ghost"
            onClick={() => void controller.refresh()}
          >
            <RefreshCw />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {controller.error ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span>{controller.error}</span>
          </div>
        ) : null}
        {controller.snapshot.issues.length > 0 ? (
          <div className="mb-4 space-y-2">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {controller.snapshot.issues.length} 个图稿 bundle 需要检查；其余图稿仍可正常使用。
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {controller.snapshot.issues.map((issue, index) => (
                <DrawingIssueCard
                  controller={controller}
                  issue={issue}
                  key={`${issue.albumPath}:${issue.drawingId ?? index}`}
                />
              ))}
            </div>
          </div>
        ) : null}
        {controller.loading && drawings.length === 0 && trashAlbums.length === 0 ? (
          <EmptyState label="正在读取图集…" />
        ) : drawings.length === 0 && trashAlbums.length === 0 ? (
          <EmptyState
            label={
              controller.query.trim()
                ? '没有匹配的图稿'
                : trash
                  ? '回收站为空'
                  : '这里还没有图稿'
            }
            action={
              trash
                ? undefined
                : () =>
                    void controller.createNewDrawing(
                      '未命名图稿',
                      selectedAlbum(controller),
                    )
            }
          />
        ) : (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4'
                : 'space-y-1',
            )}
            data-testid="drawing-gallery"
          >
            {trashAlbums.map((album) => (
              <TrashedAlbumCard
                album={album}
                controller={controller}
                key={album.trashId}
                viewMode={viewMode}
              />
            ))}
            {drawings.map((drawing) => (
              <DrawingCard
                controller={controller}
                drawing={drawing}
                key={drawing.id}
                rootPath={rootPath}
                trash={trash}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrashedAlbumCard({
  album,
  controller,
  viewMode,
}: {
  album: DrawingTrashedAlbumSummary;
  controller: DrawingController;
  viewMode: GalleryViewMode;
}) {
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card',
        viewMode === 'list' && 'flex h-16 items-center rounded-lg',
      )}
      data-testid="trashed-album-card"
    >
      <div
        className={cn(
          'flex items-center justify-center bg-muted/45',
          viewMode === 'grid'
            ? 'aspect-[4/3] w-full border-b'
            : 'ml-2 size-12 rounded-md border',
        )}
      >
        <FileImage className="text-muted-foreground/45" size={30} />
      </div>
      <div className={cn('min-w-0 p-3', viewMode === 'list' && 'flex-1 py-2')}>
        <h2 className="truncate text-sm font-medium">{album.name}</h2>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          图集 · {album.drawingCount} 幅图稿 · {formatDrawingTime(album.trashedAt)}
        </p>
        {viewMode === 'grid' ? (
          <p className="mt-2 truncate text-[10px] text-muted-foreground">
            原位置：{album.originalPath}
          </p>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`${album.name} 更多操作`}
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border bg-background/90 opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100"
            type="button"
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => void controller.restoreAlbum(album.trashId)}>
            <RefreshCw /> 恢复图集
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (window.confirm(`永久删除图集“${album.name}”及其中所有图稿？此操作不可撤销。`)) {
                void controller.permanentlyDeleteAlbum(album.trashId);
              }
            }}
          >
            <Trash2 /> 永久删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function DrawingIssueCard({
  controller,
  issue,
}: {
  controller: DrawingController;
  issue: DrawingIssue;
}) {
  return (
    <article className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={14} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {issue.albumPath || issue.drawingId || '未知图稿 bundle'}
          </p>
          <p className="mt-1 break-words text-muted-foreground">{issue.message}</p>
          <div className="mt-2 flex gap-2">
            {issue.drawingId ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => void controller.openDrawing(issue.drawingId!)}
              >
                尝试打开
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => void controller.importFiles(issue.albumPath)}
            >
              重新导入
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function DrawingCard({
  controller,
  drawing,
  rootPath,
  trash,
  viewMode,
}: {
  controller: DrawingController;
  drawing: DrawingSummary;
  rootPath: string;
  trash: boolean;
  viewMode: GalleryViewMode;
}) {
  const { objectUrl, ref } = useDrawingPreview(
    rootPath,
    drawing.id,
    drawing.hasPreview,
    trash,
  );
  const open = () => {
    if (!trash) void controller.openDrawing(drawing.id);
  };

  return (
    <article
      ref={ref}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow,transform] hover:border-foreground/20 hover:shadow-sm',
        viewMode === 'list' && 'flex h-16 items-center rounded-lg',
      )}
      data-testid="drawing-card"
    >
      <button
        aria-label={`${trash ? '选择' : '打开'}图稿 ${drawing.title}`}
        className={cn(
          'text-left',
          viewMode === 'grid' ? 'block w-full' : 'flex min-w-0 flex-1 items-center',
        )}
        type="button"
        onClick={open}
      >
        <div
          className={cn(
            'flex items-center justify-center overflow-hidden bg-muted/45',
            viewMode === 'grid' ? 'aspect-[4/3] w-full border-b' : 'ml-2 size-12 rounded-md border',
          )}
        >
          {objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${drawing.title} 预览`}
              className="h-full w-full object-contain p-2"
              loading="lazy"
              src={objectUrl}
            />
          ) : (
            <FileImage className="text-muted-foreground/45" size={28} />
          )}
        </div>
        <div className={cn('min-w-0 p-3', viewMode === 'list' && 'flex-1 py-2')}>
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-medium">{drawing.title}</h2>
            {drawing.favorite ? (
              <Star className="shrink-0 fill-amber-400 text-amber-500" size={12} />
            ) : null}
            {drawing.issue ? (
              <AlertTriangle className="shrink-0 text-amber-500" size={12} />
            ) : null}
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {drawing.albumPath || '未归类'} · {formatDrawingTime(drawing.updatedAt)}
          </p>
          {viewMode === 'grid' && drawing.tags.length > 0 ? (
            <div className="mt-2 flex gap-1 overflow-hidden">
              {drawing.tags.slice(0, 3).map((tag) => (
                <span
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`${drawing.title} 更多操作`}
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border bg-background/90 opacity-0 shadow-sm backdrop-blur group-hover:opacity-100 focus:opacity-100"
            type="button"
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {trash ? (
            <>
              <DropdownMenuItem onSelect={() => void controller.restore(drawing.id)}>
                <RefreshCw /> 恢复
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (window.confirm(`永久删除“${drawing.title}”？此操作不可撤销。`)) {
                    void controller.permanentlyDelete(drawing.id);
                  }
                }}
              >
                <Trash2 /> 永久删除
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => void controller.duplicate(drawing.id)}>
                <Copy /> 创建副本
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void controller.moveToTrash(drawing.id)}
              >
                <Trash2 /> 移到回收站
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  );
}

function DrawingEditorSurface({
  controller,
  theme,
}: {
  controller: DrawingController;
  theme: 'dark' | 'light';
}) {
  const descriptor = controller.descriptor!;
  const [title, setTitle] = React.useState(descriptor.meta.title);
  const [tagsText, setTagsText] = React.useState(descriptor.meta.tags.join(', '));
  const [favorite, setFavorite] = React.useState(descriptor.meta.favorite);
  const actionsRef = React.useRef<DrawingEditorActions | null>(null);

  const tags = React.useMemo(
    () =>
      tagsText
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10),
    [tagsText],
  );

  const flushMetadata = () => {
    controller.markDirty();
    window.requestAnimationFrame(() => void actionsRef.current?.flush(true, false));
  };

  const exportDrawing = async (format: DrawingExportFormat) => {
    const actions = actionsRef.current;
    if (!actions) return;
    try {
      const grant = await selectDrawingExportTarget(title, format);
      if (!grant) return;
      const bytes = await actions.exportBytes(format);
      await writeDrawingExport(grant.grantId, bytes);
    } catch (error) {
      controller.setError(error instanceof Error ? error.message : String(error));
    }
  };

  const copyMarkdown = async () => {
    const preview = await actionsRef.current?.createPreview();
    if (!preview) {
      controller.setError('空画布暂时无法创建 Markdown 预览。');
      return;
    }
    const markdown = await controller.createMarkdownReference(preview);
    if (markdown) await navigator.clipboard.writeText(markdown);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <Button
          aria-label="返回图集"
          size="icon-sm"
          variant="ghost"
          onClick={() => void controller.selectCollection('all')}
        >
          <ArrowLeft />
        </Button>
        <input
          aria-label="图稿标题"
          className="min-w-24 max-w-64 flex-1 rounded px-2 py-1 text-sm font-medium outline-none focus:bg-muted/60"
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={flushMetadata}
        />
        <input
          aria-label="图稿标签"
          className="hidden h-7 w-44 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring lg:block"
          placeholder="标签，以逗号分隔"
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          onBlur={flushMetadata}
        />
        <Button
          aria-label={favorite ? '取消星标' : '添加星标'}
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            setFavorite((current) => !current);
            flushMetadata();
          }}
        >
          <Star className={favorite ? 'fill-amber-400 text-amber-500' : ''} />
        </Button>
        <SaveStatus state={controller.saveState.status} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="图稿操作" size="icon-sm" variant="ghost">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => void copyMarkdown()}>
              <Copy /> 复制 Markdown 引用
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void exportDrawing('excalidraw')}>
              <Download /> 导出 .excalidraw
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportDrawing('png')}>
              <Download /> 导出 PNG
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportDrawing('svg')}>
              <Download /> 导出 SVG
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void controller.moveToTrash(descriptor.meta.id)}
            >
              <Trash2 /> 移到回收站
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {controller.saveState.status === 'conflict' ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle size={14} />
          <span className="min-w-0 flex-1 truncate">
            {controller.saveState.message}
          </span>
          <Button size="xs" variant="outline" onClick={() => void controller.reloadConflict()}>
            加载磁盘版本
          </Button>
          <Button size="xs" onClick={() => void actionsRef.current?.flush(true, true)}>
            用当前版本覆盖
          </Button>
        </div>
      ) : null}
      {controller.error ? (
        <div className="shrink-0 border-b border-destructive/25 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
          {controller.error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <DrawingEditorDynamic
          autoSaveBlocked={controller.saveState.status === 'conflict'}
          favorite={favorite}
          initialLibrary={controller.library}
          initialScene={controller.scene!}
          key={descriptor.meta.id}
          tags={tags}
          theme={theme}
          title={title.trim() || '未命名图稿'}
          viewport={controller.viewport}
          onDirty={controller.markDirty}
          onLibraryChange={controller.persistLibrary}
          onReady={(actions) => {
            actionsRef.current = actions;
            controller.registerFlush(actions ? () => actions.flush() : null);
          }}
          onSave={controller.save}
          onViewportChange={controller.recordViewport}
        />
      </div>
    </section>
  );
}

function SaveStatus({ state }: { state: string }) {
  const content = {
    conflict: ['冲突', AlertTriangle],
    dirty: ['未保存', Clock3],
    error: ['保存失败', AlertTriangle],
    saved: ['已保存', Check],
    saving: ['保存中', RefreshCw],
  }[state] ?? ['未保存', Clock3];
  const Icon = content[1] as typeof Check;
  return (
    <span
      className={cn(
        'hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex',
        (state === 'conflict' || state === 'error') && 'text-destructive',
      )}
    >
      <Icon className={state === 'saving' ? 'animate-spin' : ''} size={12} />
      {content[0] as string}
    </span>
  );
}

function useDrawingPreview(
  rootPath: string,
  drawingId: string,
  available: boolean,
  trashed: boolean,
) {
  const [visible, setVisible] = React.useState(false);
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const ref = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!visible || !available) return;
    let cancelled = false;
    let url: string | null = null;
    void readDrawingPreview(rootPath, drawingId, trashed)
      .then((bytes) => {
        if (cancelled) return;
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        url = URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }));
        setObjectUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [available, drawingId, rootPath, trashed, visible]);

  return { objectUrl, ref };
}

function galleryTitle(controller: DrawingController) {
  if (controller.selection.kind === 'album') return controller.selection.path;
  if (controller.selection.kind !== 'collection') return '全部图稿';
  return {
    all: '全部图稿',
    favorites: '星标',
    recent: '最近编辑',
    trash: '回收站',
  }[controller.selection.collection];
}

function selectedAlbum(controller: DrawingController) {
  return controller.selection.kind === 'album' ? controller.selection.path : '';
}

function sortDrawings(drawings: DrawingSummary[], sort: GallerySort) {
  return [...drawings].sort((left, right) => {
    if (sort === 'name') return left.title.localeCompare(right.title, 'zh-CN');
    if (sort === 'created') return right.createdAt.localeCompare(left.createdAt);
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function formatDrawingTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function EmptyState({
  action,
  label,
}: {
  action?: () => void;
  label: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
      <FileImage className="mb-3 opacity-40" size={34} />
      <p>{label}</p>
      {action ? (
        <Button className="mt-4" size="sm" variant="outline" onClick={action}>
          新建图稿
        </Button>
      ) : null}
    </div>
  );
}

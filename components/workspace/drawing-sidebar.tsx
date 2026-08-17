'use client';

import * as React from 'react';
import {
  BrainCircuit,
  Clock3,
  Copy,
  FileImage,
  FilePlus2,
  Folder,
  FolderPlus,
  Images,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  DrawingContextActions,
  DrawingDropdownActions,
} from './drawing-action-menu';
import type { DrawingController } from './use-drawing-controller';
import { WorkspaceTreeFolderIcon } from './workspace-tree-folder-icon';
import type {
  DrawingAlbumNode,
  DrawingKind,
  DrawingSummary,
} from './workspace-types';

interface DrawingTextRequest {
  allowEmpty?: boolean;
  description: string;
  initialValue: string;
  submitLabel: string;
  title: string;
  onSubmit: (value: string) => void;
}

export function DrawingSidebar({
  controller,
}: {
  controller: DrawingController;
}) {
  const [textRequest, setTextRequest] =
    React.useState<DrawingTextRequest | null>(null);
  const [textValue, setTextValue] = React.useState('');
  const [editingAlbumPath, setEditingAlbumPath] = React.useState<string | null>(
    null,
  );
  const [expandedAlbums, setExpandedAlbums] = React.useState<Set<string>>(
    () => new Set(),
  );
  const selectedAlbum =
    controller.selection.kind === 'album' ? controller.selection.path : null;
  const drawingSelection = controller.selection;
  const unfiledDrawings = React.useMemo(
    () => controller.snapshot.drawings.filter((drawing) => !drawing.albumPath),
    [controller.snapshot.drawings],
  );
  const drawingTreeEmpty =
    controller.snapshot.albums.length === 0 && unfiledDrawings.length === 0;
  const activeDrawingAlbumPath = React.useMemo(() => {
    if (drawingSelection.kind !== 'drawing') {
      return null;
    }

    return (
      controller.snapshot.drawings.find(
        (drawing) => drawing.id === drawingSelection.id,
      )?.albumPath ?? null
    );
  }, [controller.snapshot.drawings, drawingSelection]);

  const expandedDrawingAlbums = React.useMemo(() => {
    if (!activeDrawingAlbumPath) {
      return expandedAlbums;
    }

    const ancestorPaths = findAlbumAncestorPaths(
      controller.snapshot.albums,
      activeDrawingAlbumPath,
    );

    if (ancestorPaths.length === 0) {
      return expandedAlbums;
    }

    return new Set([...expandedAlbums, ...ancestorPaths]);
  }, [activeDrawingAlbumPath, controller.snapshot.albums, expandedAlbums]);

  const createDrawing = (
    albumPath = selectedAlbum ?? '',
    kind: DrawingKind = 'whiteboard',
  ) => {
    void controller.createNewDrawing(
      kind === 'mindmap' ? '未命名脑图' : '未命名白板',
      albumPath,
      kind,
    );
  };

  const createAiMindMap = (albumPath = selectedAlbum ?? '') => {
    window.sessionStorage.setItem('markune:pending-ai-mindmap', albumPath);
    window.dispatchEvent(
      new CustomEvent('markune:start-ai-mindmap', { detail: { albumPath } }),
    );
  };

  const createAlbum = async (parentPath = selectedAlbum ?? '') => {
    if (parentPath) {
      setExpandedAlbums((current) => {
        const next = new Set(current);
        next.add(parentPath);
        return next;
      });
    }
    const requestedPath = nextAlbumPath(controller.snapshot.albums, parentPath);
    const createdPath = await controller.createAlbum(requestedPath);
    if (createdPath) setEditingAlbumPath(createdPath);
  };

  const renameAlbum = async (album: DrawingAlbumNode, value: string) => {
    setEditingAlbumPath(null);
    const name = value.trim();
    if (!name || name === album.name) return;
    await controller.renameAlbum(album.path, name);
  };

  function requestText(request: DrawingTextRequest) {
    setTextValue(request.initialValue);
    setTextRequest(request);
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-2">
        <div className="flex h-9 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/60">
          <span>图集</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="新建或导入图稿"
                className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                type="button"
              >
                <Plus size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => createDrawing(selectedAlbum ?? '', 'whiteboard')}>
                <FilePlus2 /> 新建白板
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => createDrawing(selectedAlbum ?? '', 'mindmap')}>
                <BrainCircuit /> 新建脑图
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => createAiMindMap()}>
                <Sparkles /> AI 生成脑图
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void createAlbum()}>
                <FolderPlus /> 新建图集
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void controller.importFiles(selectedAlbum ?? '')}
              >
                <Upload /> 导入图稿或组件库
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <label className="mx-1 mb-2 flex h-8 shrink-0 items-center gap-2 rounded-md border border-sidebar-border/60 bg-background/70 px-2 text-xs text-muted-foreground transition-colors focus-within:border-ring focus-within:text-foreground">
          <Search className="shrink-0" size={13} strokeWidth={1.75} />
          <input
            aria-label="搜索图稿"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="搜索图稿"
            type="search"
            value={controller.query}
            onChange={(event) => controller.setQuery(event.currentTarget.value)}
          />
          {controller.query ? (
            <button
              aria-label="清除图稿搜索"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              type="button"
              onClick={() => controller.setQuery('')}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>

        <div className="drawing-tree-scrollarea min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-0.5">
            <CollectionRow
              active={isCollectionActive(controller, 'all')}
              count={controller.snapshot.drawings.length}
              icon={<Images size={14} />}
              label="全部图稿"
              onClick={() => void controller.selectCollection('all')}
            />
            <CollectionRow
              active={isCollectionActive(controller, 'recent')}
              icon={<Clock3 size={14} />}
              label="最近编辑"
              onClick={() => void controller.selectCollection('recent')}
            />
            <CollectionRow
              active={isCollectionActive(controller, 'favorites')}
              icon={<Star size={14} />}
              label="星标"
              onClick={() => void controller.selectCollection('favorites')}
            />
          </div>

          <div className="mt-3 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
            图集目录
          </div>
          <div className="mt-1 space-y-0.5">
            {unfiledDrawings.map((drawing) => (
              <DrawingLeaf
                controller={controller}
                depth={0}
                drawing={drawing}
                key={drawing.id}
                onRequestText={requestText}
              />
            ))}
            {controller.snapshot.albums.map((album) => (
              <AlbumRow
                album={album}
                controller={controller}
                editingAlbumPath={editingAlbumPath}
                expandedAlbums={expandedDrawingAlbums}
                key={album.path}
                onCreateAlbum={createAlbum}
                onCreateDrawing={createDrawing}
                onEditAlbum={setEditingAlbumPath}
                onExpandedAlbumsChange={setExpandedAlbums}
                onRenameAlbum={renameAlbum}
                onRequestText={requestText}
              />
            ))}
            {drawingTreeEmpty ? (
              <button
                className="w-full rounded-md px-2 py-4 text-center text-xs text-muted-foreground hover:bg-sidebar-accent/50"
                type="button"
                onClick={() => void createAlbum()}
              >
                新建第一个图集
              </button>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-sidebar-border/50 pt-1">
          <CollectionRow
            active={isCollectionActive(controller, 'trash')}
            count={
              controller.snapshot.trash.length +
              controller.snapshot.trashAlbums.length
            }
            icon={<Trash2 size={14} />}
            label="回收站"
            onClick={() => void controller.selectCollection('trash')}
          />
        </div>
      </div>

      <Dialog
        open={Boolean(textRequest)}
        onOpenChange={(open) => {
          if (!open) setTextRequest(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = textValue.trim();
              if (!textRequest || (!textRequest.allowEmpty && !value)) return;
              const submit = textRequest.onSubmit;
              setTextRequest(null);
              submit(value);
            }}
          >
            <DialogHeader>
              <DialogTitle>{textRequest?.title}</DialogTitle>
              <DialogDescription>{textRequest?.description}</DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              className="mt-4 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
            />
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTextRequest(null)}
              >
                取消
              </Button>
              <Button
                disabled={!textRequest?.allowEmpty && !textValue.trim()}
                type="submit"
              >
                {textRequest?.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AlbumRowProps {
  album: DrawingAlbumNode;
  controller: DrawingController;
  depth?: number;
  editingAlbumPath: string | null;
  expandedAlbums: Set<string>;
  onCreateAlbum: (parentPath?: string) => Promise<void>;
  onCreateDrawing: (albumPath?: string, kind?: DrawingKind) => void;
  onEditAlbum: (path: string | null) => void;
  onExpandedAlbumsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onRenameAlbum: (album: DrawingAlbumNode, value: string) => Promise<void>;
  onRequestText: (request: DrawingTextRequest) => void;
}

function AlbumRow({
  album,
  controller,
  depth = 0,
  editingAlbumPath,
  expandedAlbums,
  onCreateAlbum,
  onCreateDrawing,
  onEditAlbum,
  onExpandedAlbumsChange,
  onRenameAlbum,
  onRequestText,
}: AlbumRowProps) {
  const expanded = expandedAlbums.has(album.path);
  const active =
    controller.selection.kind === 'album' &&
    controller.selection.path === album.path;
  const hasChildren = album.children.length > 0 || album.drawings.length > 0;
  const editing = editingAlbumPath === album.path;
  const actions: AlbumActionProps = {
    album,
    controller,
    onCreateAlbum,
    onCreateDrawing,
    onEditAlbum,
    onRequestText,
  };

  const selectAlbum = () => {
    if (editing) return;
    onExpandedAlbumsChange((current) => {
      const next = new Set(current);
      if (next.has(album.path)) next.delete(album.path);
      else next.add(album.path);
      return next;
    });
    void controller.selectAlbum(album.path);
  };

  return (
    <div className="space-y-0.5" data-testid={`drawing-album-${album.path}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="group/album-row flex h-7 w-full items-center text-[13px]"
            data-testid={`drawing-album-row-${album.path}`}
            draggable={!editing}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-markune-album', album.path);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const drawingId = event.dataTransfer.getData(
                'application/x-markune-drawing',
              );
              if (drawingId) void controller.move(drawingId, album.path);
              const sourceAlbum = event.dataTransfer.getData(
                'application/x-markune-album',
              );
              if (sourceAlbum && sourceAlbum !== album.path) {
                void controller.moveAlbum(sourceAlbum, album.path);
              }
            }}
          >
            <div
              className={cn(
                'flex h-full min-w-0 flex-1 items-center rounded-md transition-colors group-hover/album-row:bg-sidebar-accent/70',
                active && 'bg-sidebar-accent text-sidebar-accent-foreground',
              )}
              style={{ marginLeft: depth * 20 }}
            >
              {editing ? (
                <div className="grid h-full min-w-0 flex-1 grid-cols-[13px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-2 text-left text-foreground/80">
                  <WorkspaceTreeFolderIcon
                    className="text-muted-foreground"
                    data-testid={
                      expanded
                        ? `drawing-folder-open-${album.path}`
                        : `drawing-folder-closed-${album.path}`
                    }
                    expanded={expanded}
                  />
                  <AlbumNameInput
                    initialValue={album.name}
                    onCancel={() => onEditAlbum(null)}
                    onSubmit={(value) => void onRenameAlbum(album, value)}
                  />
                </div>
              ) : (
                <button
                  className="grid h-full min-w-0 flex-1 grid-cols-[13px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-2 text-left text-foreground/80"
                  type="button"
                  onClick={selectAlbum}
                >
                  <WorkspaceTreeFolderIcon
                    className="text-muted-foreground"
                    data-testid={
                      expanded
                        ? `drawing-folder-open-${album.path}`
                        : `drawing-folder-closed-${album.path}`
                    }
                    expanded={expanded}
                  />
                  <span className="truncate">{album.name}</span>
                </button>
              )}
              <AlbumMenu {...actions} />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-48"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <AlbumContextActions {...actions} />
        </ContextMenuContent>
      </ContextMenu>

      {expanded && hasChildren ? (
        <div className="relative space-y-0.5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 bottom-0 w-px bg-sidebar-foreground/20"
            data-testid={`drawing-tree-guide-${album.path}`}
            style={{ left: 14.5 + depth * 20 }}
          />
          {album.children.map((child) => (
            <AlbumRow
              {...{
                controller,
                editingAlbumPath,
                expandedAlbums,
                onCreateAlbum,
                onCreateDrawing,
                onEditAlbum,
                onExpandedAlbumsChange,
                onRenameAlbum,
                onRequestText,
              }}
              album={child}
              depth={depth + 1}
              key={child.path}
            />
          ))}
          {album.drawings.map((drawing) => (
            <DrawingLeaf
              controller={controller}
              depth={depth + 1}
              drawing={drawing}
              key={drawing.id}
              onRequestText={onRequestText}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DrawingLeaf({
  controller,
  depth,
  drawing,
  onRequestText,
}: {
  controller: DrawingController;
  depth: number;
  drawing: DrawingSummary;
  onRequestText: (request: DrawingTextRequest) => void;
}) {
  const active =
    controller.selection.kind === 'drawing' &&
    controller.selection.id === drawing.id;
  const requestMove = () =>
    onRequestText({
      allowEmpty: true,
      description: '输入目标图集路径；留空表示移动到未归类。',
      initialValue: drawing.albumPath,
      onSubmit: (target) => void controller.move(drawing.id, target),
      submitLabel: '移动',
      title: `移动“${drawing.title}”`,
    });
  const actionProps = {
    controller,
    drawing,
    onMoveRequest: requestMove,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group/drawing-row flex h-7 w-full items-center text-[13px]"
          data-testid={`drawing-row-${drawing.id}`}
          draggable
          onDragStart={(event) =>
            event.dataTransfer.setData(
              'application/x-markune-drawing',
              drawing.id,
            )
          }
        >
          <div
            className={cn(
              'flex h-full min-w-0 flex-1 items-center rounded-md transition-colors group-hover/drawing-row:bg-sidebar-accent/70',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
            style={{ marginLeft: Math.max(0, depth - 1) * 20 }}
          >
            <button
              className="grid h-full min-w-0 flex-1 grid-cols-[13px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-2 text-left text-foreground/80"
              type="button"
              onClick={() => void controller.openDrawing(drawing.id)}
            >
              <DrawingKindIcon drawing={drawing} />
              <span className="truncate">{drawing.title}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`${drawing.title} 操作`}
                  className="mr-1 hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover/drawing-row:flex data-[state=open]:flex"
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DrawingDropdownActions {...actionProps} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DrawingContextActions {...actionProps} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface AlbumActionProps {
  album: DrawingAlbumNode;
  controller: DrawingController;
  onCreateAlbum: (parentPath?: string) => Promise<void>;
  onCreateDrawing: (albumPath?: string, kind?: DrawingKind) => void;
  onEditAlbum: (path: string | null) => void;
  onRequestText: (request: DrawingTextRequest) => void;
}

function AlbumMenu(props: AlbumActionProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${props.album.name} 操作`}
          className="mr-1 hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover/album-row:flex data-[state=open]:flex"
          type="button"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <AlbumDropdownActions {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlbumDropdownActions(props: AlbumActionProps) {
  return (
    <>
      <DropdownMenuItem
        onSelect={() => props.onCreateDrawing(props.album.path, 'whiteboard')}
      >
        <FilePlus2 /> 新建白板
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => props.onCreateDrawing(props.album.path, 'mindmap')}
      >
        <BrainCircuit /> 新建脑图
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void props.onCreateAlbum(props.album.path)}
      >
        <FolderPlus /> 新建子图集
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onEditAlbum(props.album.path)}>
        <Pencil /> 重命名
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => requestAlbumMove(props)}>
        <Folder /> 移动图集
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => void props.controller.duplicateAlbum(props.album.path)}
      >
        <Copy /> 创建图集副本
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => void props.controller.deleteAlbum(props.album.path)}
      >
        <Trash2 /> 删除空图集
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => trashAlbum(props)}
      >
        <Trash2 /> 图集移到回收站
      </DropdownMenuItem>
    </>
  );
}

function AlbumContextActions(props: AlbumActionProps) {
  return (
    <>
      <ContextMenuItem
        onSelect={() => props.onCreateDrawing(props.album.path, 'whiteboard')}
      >
        <FilePlus2 /> 新建白板
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => props.onCreateDrawing(props.album.path, 'mindmap')}
      >
        <BrainCircuit /> 新建脑图
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => void props.onCreateAlbum(props.album.path)}
      >
        <FolderPlus /> 新建子图集
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => props.onEditAlbum(props.album.path)}>
        <Pencil /> 重命名
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => requestAlbumMove(props)}>
        <Folder /> 移动图集
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => void props.controller.duplicateAlbum(props.album.path)}
      >
        <Copy /> 创建图集副本
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() => void props.controller.deleteAlbum(props.album.path)}
      >
        <Trash2 /> 删除空图集
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => trashAlbum(props)}
      >
        <Trash2 /> 图集移到回收站
      </ContextMenuItem>
    </>
  );
}

function DrawingKindIcon({ drawing }: { drawing: DrawingSummary }) {
  return (
    <span
      aria-label={drawing.kind === 'mindmap' ? '脑图' : '白板'}
      className="flex size-[13px] shrink-0 items-center justify-center text-muted-foreground"
      data-testid={`drawing-kind-icon-${drawing.id}`}
      title={drawing.kind === 'mindmap' ? '脑图' : '白板'}
    >
      {drawing.kind === 'mindmap' ? (
        <BrainCircuit aria-hidden="true" size={13} />
      ) : (
        <FileImage aria-hidden="true" size={13} />
      )}
    </span>
  );
}

function requestAlbumMove({ album, controller, onRequestText }: AlbumActionProps) {
  onRequestText({
    allowEmpty: true,
    description: '输入目标父图集路径；留空表示移动到图集根目录。',
    initialValue: '',
    onSubmit: (parent) => void controller.moveAlbum(album.path, parent),
    submitLabel: '移动',
    title: `移动图集“${album.name}”`,
  });
}

function trashAlbum({ album, controller }: AlbumActionProps) {
  if (window.confirm(`将图集“${album.name}”及其中所有图稿移到回收站？`)) {
    void controller.trashAlbum(album.path);
  }
}

function AlbumNameInput({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ignoreInitialBlurRef = React.useRef(true);
  const finishedRef = React.useRef(false);
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const timer = window.setTimeout(() => {
      ignoreInitialBlurRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const finish = (next: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onSubmit(next);
  };

  return (
    <Input
      ref={inputRef}
      aria-label={`重命名图集 ${initialValue}`}
      className="h-6 min-w-0 px-1.5 text-xs"
      value={value}
      onBlur={() => {
        if (!ignoreInitialBlurRef.current) finish(value);
      }}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(value);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finishedRef.current = true;
          onCancel();
        }
      }}
    />
  );
}

function nextAlbumPath(albums: DrawingAlbumNode[], parentPath: string) {
  const paths = new Set<string>();
  const visit = (nodes: DrawingAlbumNode[]) => {
    nodes.forEach((album) => {
      paths.add(album.path);
      visit(album.children);
    });
  };
  visit(albums);

  const prefix = parentPath ? `${parentPath}/` : '';
  let suffix = 1;
  let candidate = `${prefix}新建图集`;
  while (paths.has(candidate)) {
    suffix += 1;
    candidate = `${prefix}新建图集 ${suffix}`;
  }
  return candidate;
}

function CollectionRow({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/70',
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{label}</span>
      {typeof count === 'number' ? (
        <span
          className="ml-auto flex size-7 shrink-0 items-center justify-center text-[10px] tabular-nums text-muted-foreground"
          data-testid={`drawing-collection-count-${label}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function isCollectionActive(
  controller: DrawingController,
  collection: 'all' | 'recent' | 'favorites' | 'trash',
) {
  return (
    controller.selection.kind === 'collection' &&
    controller.selection.collection === collection
  );
}

function findAlbumAncestorPaths(
  albums: DrawingAlbumNode[],
  targetPath: string,
): string[] {
  for (const album of albums) {
    if (album.path === targetPath) {
      return [album.path];
    }

    const childPaths = findAlbumAncestorPaths(album.children, targetPath);
    if (childPaths.length > 0) {
      return [album.path, ...childPaths];
    }
  }

  return [];
}

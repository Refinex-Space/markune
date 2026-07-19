'use client';

import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  FilePlus2,
  Folder,
  FolderPlus,
  Images,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import type { DrawingController } from './use-drawing-controller';
import type { DrawingAlbumNode, DrawingSummary } from './workspace-types';

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
  const selectedAlbum =
    controller.selection.kind === 'album' ? controller.selection.path : null;

  const createDrawing = () => {
    const albumPath = selectedAlbum ?? '';
    void controller.createNewDrawing('未命名图稿', albumPath);
  };

  const createAlbum = () => {
    const parent = selectedAlbum ? `${selectedAlbum}/` : '';
    requestText({
      description: '可输入以 / 分隔的嵌套图集路径。',
      initialValue: `${parent}新建图集`,
      onSubmit: (path) => void controller.createAlbum(path),
      submitLabel: '创建',
      title: '新建图集',
    });
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
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={createDrawing}>
              <FilePlus2 /> 新建图稿
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={createAlbum}>
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
          {controller.snapshot.albums.length > 0 ? (
            controller.snapshot.albums.map((album) => (
              <AlbumRow
                album={album}
                controller={controller}
                key={album.path}
                onRequestText={requestText}
              />
            ))
          ) : (
            <button
              className="w-full rounded-md px-2 py-4 text-center text-xs text-muted-foreground hover:bg-sidebar-accent/50"
              type="button"
              onClick={createAlbum}
            >
              新建第一个图集
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-sidebar-border/50 pt-1">
        <CollectionRow
          active={isCollectionActive(controller, 'trash')}
          count={
            controller.snapshot.trash.length + controller.snapshot.trashAlbums.length
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
              <Button type="button" variant="outline" onClick={() => setTextRequest(null)}>
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

function AlbumRow({
  album,
  controller,
  depth = 0,
  onRequestText,
}: {
  album: DrawingAlbumNode;
  controller: DrawingController;
  depth?: number;
  onRequestText: (request: DrawingTextRequest) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const active =
    controller.selection.kind === 'album' &&
    controller.selection.path === album.path;
  const hasChildren = album.children.length > 0 || album.drawings.length > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex h-7 items-center rounded-md text-xs hover:bg-sidebar-accent/70',
          active && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )}
        draggable
        style={{ paddingLeft: 4 + depth * 12 }}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-madora-album', album.path);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const drawingId = event.dataTransfer.getData(
            'application/x-madora-drawing',
          );
          if (drawingId) void controller.move(drawingId, album.path);
          const sourceAlbum = event.dataTransfer.getData(
            'application/x-madora-album',
          );
          if (sourceAlbum && sourceAlbum !== album.path) {
            void controller.moveAlbum(sourceAlbum, album.path);
          }
        }}
      >
        <button
          aria-label={expanded ? '折叠图集' : '展开图集'}
          className="flex size-6 items-center justify-center text-muted-foreground"
          disabled={!hasChildren}
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : (
            <span className="size-3" />
          )}
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          type="button"
          onClick={() => void controller.selectAlbum(album.path)}
        >
          <Folder size={13} />
          <span className="truncate">{album.name}</span>
        </button>
        <AlbumMenu
          album={album}
          controller={controller}
          onRequestText={onRequestText}
        />
      </div>
      {expanded ? (
        <div className="mt-0.5 space-y-0.5">
          {album.children.map((child) => (
            <AlbumRow
              album={child}
              controller={controller}
              depth={depth + 1}
              key={child.path}
              onRequestText={onRequestText}
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
  return (
    <div
      className={cn(
        'group flex h-7 items-center rounded-md text-xs hover:bg-sidebar-accent/70',
        active && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      draggable
      style={{ paddingLeft: 28 + depth * 12 }}
      onDragStart={(event) =>
        event.dataTransfer.setData('application/x-madora-drawing', drawing.id)
      }
    >
      <button
        className="min-w-0 flex-1 truncate py-1 text-left"
        type="button"
        onClick={() => void controller.openDrawing(drawing.id)}
      >
        {drawing.title}
      </button>
      <DrawingMenu
        controller={controller}
        drawing={drawing}
        onRequestText={onRequestText}
      />
    </div>
  );
}

function DrawingMenu({
  controller,
  drawing,
  onRequestText,
}: {
  controller: DrawingController;
  drawing: DrawingSummary;
  onRequestText: (request: DrawingTextRequest) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${drawing.title} 操作`}
          className="mr-0.5 flex size-6 items-center justify-center rounded opacity-0 hover:bg-background/60 group-hover:opacity-100 focus:opacity-100"
          type="button"
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onSelect={() => void controller.duplicate(drawing.id)}
        >
          <Copy /> 创建副本
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onRequestText({
              allowEmpty: true,
              description: '输入目标图集路径；留空表示移动到未归类。',
              initialValue: drawing.albumPath,
              onSubmit: (target) => void controller.move(drawing.id, target),
              submitLabel: '移动',
              title: `移动“${drawing.title}”`,
            });
          }}
        >
          <Folder /> 移动到…
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void controller.moveToTrash(drawing.id)}
        >
          <Trash2 /> 移到回收站
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlbumMenu({
  album,
  controller,
  onRequestText,
}: {
  album: DrawingAlbumNode;
  controller: DrawingController;
  onRequestText: (request: DrawingTextRequest) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${album.name} 操作`}
          className="mr-0.5 flex size-6 items-center justify-center rounded opacity-0 hover:bg-background/60 group-hover:opacity-100 focus:opacity-100"
          type="button"
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem
          onSelect={() => {
            onRequestText({
              description: '新图集将创建在当前图集下。',
              initialValue: `${album.path}/新建图集`,
              onSubmit: (path) => void controller.createAlbum(path),
              submitLabel: '创建',
              title: '新建子图集',
            });
          }}
        >
          <FolderPlus /> 新建子图集
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onRequestText({
              description: '只修改当前图集名称，不影响图稿的稳定回链。',
              initialValue: album.name,
              onSubmit: (name) => {
                if (name !== album.name) void controller.renameAlbum(album.path, name);
              },
              submitLabel: '重命名',
              title: '重命名图集',
            });
          }}
        >
          <Folder /> 重命名图集
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onRequestText({
              allowEmpty: true,
              description: '输入目标父图集路径；留空表示移动到图集根目录。',
              initialValue: '',
              onSubmit: (parent) => void controller.moveAlbum(album.path, parent),
              submitLabel: '移动',
              title: `移动图集“${album.name}”`,
            });
          }}
        >
          <Folder /> 移动图集
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void controller.duplicateAlbum(album.path)}>
          <Copy /> 创建图集副本
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void controller.deleteAlbum(album.path)}
        >
          <Trash2 /> 删除空图集
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (window.confirm(`将图集“${album.name}”及其中所有图稿移到回收站？`)) {
              void controller.trashAlbum(album.path);
            }
          }}
        >
          <Trash2 /> 图集移到回收站
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
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

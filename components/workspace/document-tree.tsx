'use client';

import * as React from 'react';
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileInput,
  FileSearch2,
  FileText,
  FileType2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Shapes,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { isDescendantPath } from './workspace-paths';
import { hasTreeNodeAppearance, TreeNodeIconRenderer } from './tree-node-icon';
import { filterWorkspaceNodes } from './workspace-tree';
import type {
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceMoveRequest,
  WorkspaceNode,
  TreeIconPickerSettings,
  TreeNodeAppearance,
} from './workspace-types';

const TreeIconPicker = React.lazy(() => import('./tree-icon-picker'));

const DEFAULT_TREE_ICON_PICKER_SETTINGS: TreeIconPickerSettings = {
  lastTab: 'builtin',
  recentIcons: [],
};

interface DocumentTreeProps {
  nodes: WorkspaceNode[];
  searchQuery: string;
  currentDocumentPath: string | null;
  currentDirectoryPath?: string | null;
  pendingRenameNodePath?: string | null;
  onCreateDirectory: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onDeleteNode: (node: WorkspaceNode) => Promise<void> | void;
  onExportNode?: (
    node: WorkspaceNode,
    format: WorkspaceExportFormat,
  ) => Promise<void> | void;
  onImportDocuments?: (
    targetDir: string,
    format: WorkspaceImportFormat,
  ) => Promise<void> | void;
  onImportMarkdown: (targetDir: string) => void;
  onMoveNode?: (request: WorkspaceMoveRequest) => Promise<void> | void;
  onOpenInFileManager?: (node: WorkspaceNode) => Promise<void> | void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => Promise<void> | void;
  onOpenWorkspaceOverview?: () => void;
  preferredEditorLabel?: string;
  onPendingRenameConsumed?: () => void;
  revealNodePath?: string | null;
  revealNodeRequestId?: number;
  onSelectDirectory?: (node: WorkspaceNode) => Promise<void> | void;
  onRenameNode: (
    node: WorkspaceNode,
    newName: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onRefresh?: () => Promise<unknown> | void;
  onRefreshNode?: (node: WorkspaceNode) => Promise<unknown> | void;
  onSelectDocument: (node: WorkspaceNode) => void;
  onTogglePinned?: (node: WorkspaceNode) => void;
  onUpdateNodeAppearance?: (
    node: WorkspaceNode,
    appearance: TreeNodeAppearance | null,
  ) => Promise<unknown> | unknown;
  onTreeIconPickerSettingsChange?: (
    settings: TreeIconPickerSettings,
  ) => Promise<void> | void;
  rootPath?: string;
  treeIconPickerSettings?: TreeIconPickerSettings;
  workspaceOverviewActive?: boolean;
}

export function DocumentTree({
  nodes,
  searchQuery,
  currentDocumentPath,
  currentDirectoryPath,
  pendingRenameNodePath,
  onCreateDirectory,
  onCreateDocument,
  onDeleteNode,
  onExportNode,
  onImportDocuments,
  onImportMarkdown,
  onMoveNode,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onOpenWorkspaceOverview,
  preferredEditorLabel,
  onPendingRenameConsumed,
  revealNodePath,
  revealNodeRequestId,
  onSelectDirectory,
  onRenameNode,
  onRefresh,
  onRefreshNode,
  onSelectDocument,
  onTogglePinned,
  onUpdateNodeAppearance,
  onTreeIconPickerSettingsChange,
  rootPath = '',
  treeIconPickerSettings = DEFAULT_TREE_ICON_PICKER_SETTINGS,
  workspaceOverviewActive = false,
}: DocumentTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [isTreeCollapsed, setIsTreeCollapsed] = React.useState(false);
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkspaceNode | null>(
    null,
  );
  const [draggedNode, setDraggedNode] = React.useState<WorkspaceNode | null>(
    null,
  );
  const [dropPreview, setDropPreview] = React.useState<DropPreview | null>(
    null,
  );
  const [iconPickerTarget, setIconPickerTarget] = React.useState<{
    anchor: { left: number; top: number };
    nodePath: string;
  } | null>(null);
  const draggedNodeRef = React.useRef<WorkspaceNode | null>(null);
  const iconPickerOpenFrameRef = React.useRef<number | null>(null);
  const treeRootRef = React.useRef<HTMLDivElement>(null);
  const visibleNodes = React.useMemo(
    () => filterWorkspaceNodes(nodes, searchQuery),
    [nodes, searchQuery],
  );
  const directoryDocumentCounts = React.useMemo(
    () => countDirectoryDocuments(nodes),
    [nodes],
  );
  const forceExpanded = searchQuery.trim().length > 0;
  const dragDisabled = searchQuery.trim().length > 0 || !onMoveNode;
  const iconPickerNode = iconPickerTarget
    ? findNodeByAbsolutePath(nodes, iconPickerTarget.nodePath)
    : null;

  const openIconPicker = React.useCallback((node: WorkspaceNode) => {
    const row = Array.from(
      treeRootRef.current?.querySelectorAll<HTMLElement>(
        '[data-workspace-node-path]',
      ) ?? [],
    ).find((element) => element.dataset.workspaceNodePath === node.absolutePath);
    const bounds = row?.getBoundingClientRect();
    if (iconPickerOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(iconPickerOpenFrameRef.current);
    }
    iconPickerOpenFrameRef.current = window.requestAnimationFrame(() => {
      iconPickerOpenFrameRef.current = null;
      setIconPickerTarget({
        anchor: {
          left: bounds?.right ?? window.innerWidth / 2,
          top: bounds?.top ?? window.innerHeight / 2,
        },
        nodePath: node.absolutePath,
      });
    });
  }, []);

  React.useEffect(
    () => () => {
      if (iconPickerOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(iconPickerOpenFrameRef.current);
      }
    },
    [],
  );

  const resetNodeAppearance = React.useCallback(
    async (node: WorkspaceNode) => {
      try {
        await onUpdateNodeAppearance?.(node, null);
      } catch (error) {
        toast.error(getDocumentTreeErrorMessage(error, '无法恢复默认图标'));
      }
    },
    [onUpdateNodeAppearance],
  );

  React.useEffect(() => {
    if (!revealNodePath) {
      return;
    }

    const reveal = findNodeReveal(nodes, revealNodePath);

    if (!reveal) {
      return;
    }

    let animationFrame: number | null = null;
    const timer = window.setTimeout(() => {
      setExpanded((previous) => {
        const next = new Set(previous);

        for (const id of reveal.expandedIds) {
          next.add(id);
        }

        return next;
      });

      animationFrame = window.requestAnimationFrame(() => {
        const targetRow = Array.from(
          treeRootRef.current?.querySelectorAll<HTMLElement>(
            '[data-workspace-node-path]',
          ) ?? [],
        ).find(
          (row) => row.dataset.workspaceNodePath === revealNodePath,
        );

        targetRow?.scrollIntoView?.({ block: 'nearest' });
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);

      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [nodes, revealNodePath, revealNodeRequestId]);

  const startEditingNode = React.useCallback((node: WorkspaceNode) => {
    setEditingNodeId(node.id);
  }, []);

  const handleCreateDirectory = React.useCallback(
    async (parentPath: string) => {
      const created = await onCreateDirectory(parentPath);

      if (created) {
        setExpanded((previous) => {
          const next = new Set(previous);

          if (parentPath) {
            next.add(parentPath);
          }

          return next;
        });
        startEditingNode(created);
      }
    },
    [onCreateDirectory, startEditingNode],
  );

  const handleCreateDocument = React.useCallback(
    async (parentPath: string) => {
      const created = await onCreateDocument(parentPath);

      if (created) {
        setExpanded((previous) => {
          const next = new Set(previous);

          if (parentPath) {
            next.add(parentPath);
          }

          return next;
        });
        startEditingNode(created);
      }
    },
    [onCreateDocument, startEditingNode],
  );

  const handleRenameNode = React.useCallback(
    async (node: WorkspaceNode, nextName: string) => {
      const normalized = nextName.trim();

      setEditingNodeId(null);

      if (!normalized || isWorkspaceNodeRenameNoop(node, normalized)) {
        return;
      }

      await onRenameNode(node, normalized);
    },
    [onRenameNode],
  );
  const handleDragStart = React.useCallback((node: WorkspaceNode) => {
    draggedNodeRef.current = node;
    setDraggedNode(node);
  }, []);
  const handleDragEnd = React.useCallback(() => {
    draggedNodeRef.current = null;
    setDraggedNode(null);
    setDropPreview(null);
  }, []);
  const resolveDraggedNode = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (draggedNodeRef.current) {
        return draggedNodeRef.current;
      }

      const draggedPath = event.dataTransfer.getData('text/plain');

      return findNodeByAbsolutePath(nodes, draggedPath);
    },
    [nodes],
  );

  let treeContent: React.ReactNode;

  if (
    visibleNodes.length === 0 &&
    nodes.length === 0 &&
    searchQuery.trim().length === 0
  ) {
    treeContent = (
      <div className="flex min-h-[240px] flex-1 items-center px-2 py-5">
        <div className="w-full space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">这个工作区还没有文档</p>
            <p className="text-xs leading-5 text-muted-foreground">
              先创建第一个文档，或用目录组织之后的内容。
            </p>
          </div>
          <div className="grid gap-2">
            <Button
              className="w-full justify-start"
              size="sm"
              type="button"
              onClick={() => void handleCreateDocument('')}
            >
              <FilePlus2 size={14} />
              新建文档
            </Button>
            <Button
              className="w-full justify-start"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void handleCreateDirectory('')}
            >
              <FolderPlus size={14} />
              新建目录
            </Button>
            <Button
              className="w-full justify-start"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => onImportMarkdown('')}
            >
              <FileInput size={14} />
              导入 Markdown
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (visibleNodes.length === 0) {
    treeContent = (
      <p className="px-2 py-6 text-sm text-muted-foreground">
        没有匹配的文档
      </p>
    );
  } else {
    const showTree = !isTreeCollapsed || searchQuery.trim().length > 0;

    treeContent = (
      <div className="flex flex-col">
        <div
          className={cn(
            // Avoid focus-within rings here: Windows keeps button focus after
            // click, and the outer ring overlaps neighboring sidebar rows.
            // author: refinex
            'group mx-2 flex h-8 items-center justify-between rounded-md px-2 text-[13px] font-medium transition-colors',
            workspaceOverviewActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80',
          )}
        >
          <button
            aria-current={workspaceOverviewActive ? 'page' : undefined}
            aria-label="打开工作区文件夹总览"
            className="flex h-full min-w-0 flex-1 items-center rounded-md text-left outline-none focus-visible:outline-none"
            disabled={!onOpenWorkspaceOverview}
            type="button"
            onClick={onOpenWorkspaceOverview}
          >
            <span>文件夹</span>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="新建文件夹"
                    className="size-6 rounded-sm p-0 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    type="button"
                    variant="ghost"
                    onClick={() => void handleCreateDirectory('')}
                  >
                    <Plus size={14} strokeWidth={2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">新建文件夹</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              aria-label={isTreeCollapsed ? '展开文件夹' : '折叠文件夹'}
              className="size-6 rounded-sm p-0 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              type="button"
              variant="ghost"
              onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
            >
              <ChevronDown
                className={cn(
                  'transition-transform duration-200',
                  isTreeCollapsed && '-rotate-90',
                )}
                size={14}
                strokeWidth={2}
              />
            </Button>
          </div>
        </div>
        {showTree && (
          <div className="mt-1 space-y-0.5 px-2">
            {visibleNodes.map((node) => (
              <TreeNode
                key={node.id}
                currentDocumentPath={currentDocumentPath}
                currentDirectoryPath={currentDirectoryPath}
                directoryDocumentCounts={directoryDocumentCounts}
                dragDisabled={dragDisabled}
                draggedNode={draggedNode}
                dropPreview={dropPreview}
                editingNodeId={editingNodeId}
                expanded={expanded}
                forceExpanded={forceExpanded}
                level={0}
                node={node}
                pendingRenameNodePath={pendingRenameNodePath}
                onCreateDirectory={handleCreateDirectory}
                onCreateDocument={handleCreateDocument}
                onDeleteRequest={setDeleteTarget}
                onExportNode={onExportNode}
                onImportDocuments={onImportDocuments}
                onCustomizeIcon={
                  onUpdateNodeAppearance ? openIconPicker : undefined
                }
                onOpenInFileManager={onOpenInFileManager}
                onOpenInPreferredEditor={onOpenInPreferredEditor}
                onDropPreviewChange={setDropPreview}
                onExpandedChange={setExpanded}
                onMoveNode={onMoveNode}
                onPendingRenameConsumed={onPendingRenameConsumed}
                onRefreshNode={onRefreshNode}
                onResetIcon={
                  onUpdateNodeAppearance ? resetNodeAppearance : undefined
                }
                onRenameRequest={startEditingNode}
                onRenameSubmit={handleRenameNode}
                onResolveDraggedNode={resolveDraggedNode}
                onSelectDirectory={onSelectDirectory}
                onTogglePinned={onTogglePinned}
                onTreeDragEnd={handleDragEnd}
                onTreeDragStart={handleDragStart}
                onSelectDocument={onSelectDocument}
                preferredEditorLabel={preferredEditorLabel}
                rootPath={rootPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div ref={treeRootRef} className="flex min-h-full flex-col pb-1 pt-2">
        {treeContent}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="min-h-16 flex-1"
              data-testid="workspace-tree-root-creation-area"
            />
          </ContextMenuTrigger>
          <ContextMenuContent
            className="w-44"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {onRefresh ? (
              <>
                <ContextMenuItem onSelect={() => void onRefresh()}>
                  <RefreshCw />
                  刷新
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            ) : null}
            <ContextMenuItem
              onSelect={() => void handleCreateDocument('')}
            >
              <FilePlus2 />
              新建文档
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => void handleCreateDirectory('')}
            >
              <FolderPlus />
              新建目录
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <DeleteNodeDialog
        node={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }

          await onDeleteNode(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {iconPickerTarget && iconPickerNode?.kind === 'directory' ? (
        <React.Suspense fallback={null}>
          <TreeIconPicker
            anchor={iconPickerTarget.anchor}
            node={iconPickerNode}
            open
            preferences={treeIconPickerSettings}
            rootPath={rootPath}
            onAppearanceChange={async (appearance) => {
              await onUpdateNodeAppearance?.(iconPickerNode, appearance);
            }}
            onOpenChange={(open) => {
              if (!open) {
                setIconPickerTarget(null);
              }
            }}
            onPreferencesChange={async (settings) => {
              await onTreeIconPickerSettingsChange?.(settings);
            }}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}

function TreeNode({
  currentDocumentPath,
  currentDirectoryPath,
  directoryDocumentCounts,
  dragDisabled,
  draggedNode,
  dropPreview,
  editingNodeId,
  expanded,
  forceExpanded,
  level,
  node,
  pendingRenameNodePath,
  onCreateDirectory,
  onCreateDocument,
  onCustomizeIcon,
  onDeleteRequest,
  onExportNode,
  onImportDocuments,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  onDropPreviewChange,
  onExpandedChange,
  onMoveNode,
  onPendingRenameConsumed,
  onRefreshNode,
  onResetIcon,
  onSelectDirectory,
  onRenameRequest,
  onRenameSubmit,
  onResolveDraggedNode,
  onTogglePinned,
  onTreeDragEnd,
  onTreeDragStart,
  onSelectDocument,
  preferredEditorLabel,
  rootPath,
}: TreeNodeProps) {
  const isDirectory = node.kind === 'directory';
  const isExpanded =
    forceExpanded ||
    expanded.has(node.id) ||
    hasDescendantByAbsolutePath(node, pendingRenameNodePath);
  const isCurrent = node.absolutePath === currentDocumentPath;
  const isCurrentDirectory =
    isDirectory && node.absolutePath === currentDirectoryPath;
  const isPendingRename = pendingRenameNodePath === node.absolutePath;
  const isEditing = editingNodeId === node.id || isPendingRename;
  const displayName = getNodeDisplayName(node);
  const documentCount = directoryDocumentCounts.get(node.id) ?? 0;
  const showDocumentCount = isDirectory && documentCount > 0;
  const visualLevel = isDirectory ? level : Math.max(0, level - 1);
  const rowPaddingLeft = 11 + visualLevel * 20;
  const rowSurfaceLeft = visualLevel * 20;
  const isDragSource = draggedNode?.absolutePath === node.absolutePath;
  const previewPosition =
    dropPreview?.targetPath === node.absolutePath ? dropPreview.position : null;
  const activatePendingRename = React.useCallback(() => {
    onRenameRequest(node);
    onPendingRenameConsumed?.();
  }, [node, onPendingRenameConsumed, onRenameRequest]);

  const toggleOrSelect = React.useCallback(() => {
    if (isEditing) {
      return;
    }

    if (isDirectory) {
      void onSelectDirectory?.(node);
      onExpandedChange((previous) => {
        const next = new Set(previous);

        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }

        return next;
      });
    } else {
      onSelectDocument(node);
    }
  }, [
    isDirectory,
    isEditing,
    node,
    onExpandedChange,
    onSelectDirectory,
    onSelectDocument,
  ]);

  const updateDropPreview = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const activeDraggedNode = onResolveDraggedNode(event);

      if (!activeDraggedNode || !onMoveNode) {
        return;
      }

      const position = getDropPosition(event.currentTarget, event.clientY, node);

      if (!position || !canDropOnNode(activeDraggedNode, node, position)) {
        onDropPreviewChange(null);
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      scrollTreeContainer(event.currentTarget, event.clientY);
      onDropPreviewChange({ position, targetPath: node.absolutePath });
    },
    [node, onDropPreviewChange, onMoveNode, onResolveDraggedNode],
  );

  React.useEffect(() => {
    if (
      !isDirectory ||
      isExpanded ||
      previewPosition !== 'inside' ||
      dropPreview?.targetPath !== node.absolutePath
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      onExpandedChange((previous) => {
        const next = new Set(previous);

        next.add(node.id);
        return next;
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    dropPreview?.targetPath,
    isDirectory,
    isExpanded,
    node.absolutePath,
    node.id,
    onExpandedChange,
    previewPosition,
  ]);

  return (
    <div className="space-y-0.5" data-testid={`tree-node-${node.id}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'group/tree-row relative flex h-7 w-full items-center text-[13px]',
              isDragSource && 'opacity-45',
            )}
            data-testid={`tree-row-${node.id}`}
            data-workspace-node-path={node.absolutePath}
            draggable={!dragDisabled && !isEditing}
            role={isEditing ? undefined : 'button'}
            tabIndex={isEditing ? undefined : 0}
            onClick={(event) => {
              if (isTreeDragDisabledTarget(event.target)) {
                return;
              }

              toggleOrSelect();
            }}
            onDragEnd={onTreeDragEnd}
            onDragEnter={updateDropPreview}
            onDragOver={updateDropPreview}
            onDragStart={(event) => {
              if (
                dragDisabled ||
                isEditing ||
                isTreeDragDisabledTarget(event.target)
              ) {
                event.preventDefault();
                return;
              }

              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', node.absolutePath);
              onTreeDragStart(node);
            }}
            onDrop={(event) => {
              const activeDraggedNode = onResolveDraggedNode(event);

              if (!activeDraggedNode || !onMoveNode) {
                return;
              }

              const position = getDropPosition(
                event.currentTarget,
                event.clientY,
                node,
              );

              if (!position || !canDropOnNode(activeDraggedNode, node, position)) {
                onDropPreviewChange(null);
                return;
              }

              event.preventDefault();
              onDropPreviewChange(null);
              void onMoveNode({
                nodePath: activeDraggedNode.absolutePath,
                position,
                targetPath: node.absolutePath,
              });
            }}
            onKeyDown={(event) => {
              if (isEditing || isTreeDragDisabledTarget(event.target)) {
                return;
              }

              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleOrSelect();
              }
            }}
          >
            {previewPosition && previewPosition !== 'inside' ? (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute right-2 h-0.5 rounded-full bg-[#3574f0]',
                  previewPosition === 'before' ? 'top-0' : 'bottom-0',
                )}
                style={{ left: rowPaddingLeft + 19 }}
              />
            ) : null}

            <div
              className={cn(
                'relative isolate flex h-full min-w-0 flex-1 items-center rounded-md transition-colors',
                isDirectory
                  ? 'group-hover/tree-row:bg-sidebar-accent/70'
                  : "before:pointer-events-none before:absolute before:inset-y-0 before:left-5 before:right-0 before:z-0 before:rounded-md before:transition-colors before:content-[''] group-hover/tree-row:before:bg-sidebar-accent/70",
                isCurrentDirectory && 'bg-sidebar-accent',
                isCurrent &&
                  (isDirectory
                    ? 'bg-sidebar-accent'
                    : 'before:bg-sidebar-accent'),
                previewPosition === 'inside' &&
                  'bg-[#eef4ff] outline outline-1 outline-[#3574f0]/25',
              )}
              data-testid={`tree-row-surface-${node.id}`}
              style={{ marginLeft: rowSurfaceLeft }}
            >
              {isEditing ? (
                <div className="relative z-[1] flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-[11px] pr-9 text-left">
                  <DirectoryIcon
                    isDirectory={isDirectory}
                    isExpanded={isExpanded}
                    node={node}
                    rootPath={rootPath}
                  />
                  <RenameInput
                    initialValue={displayName}
                    label={`重命名 ${displayName}`}
                    onActivate={
                      isPendingRename ? activatePendingRename : undefined
                    }
                    onCancel={() => onRenameSubmit(node, displayName)}
                    onSubmit={(nextName) => onRenameSubmit(node, nextName)}
                  />
                  {showDocumentCount ? (
                    <DirectoryDocumentCount
                      count={documentCount}
                      nodeId={node.id}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="relative z-[1] flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-[11px] pr-9 text-left text-foreground/80">
                  <DirectoryIcon
                    isDirectory={isDirectory}
                    isExpanded={isExpanded}
                    node={node}
                    rootPath={rootPath}
                  />
                  <span className="truncate">{displayName}</span>
                  {showDocumentCount ? (
                    <DirectoryDocumentCount
                      count={documentCount}
                      nodeId={node.id}
                    />
                  ) : null}
                </div>
              )}

              <NodeActionDropdown
                node={node}
                onCreateDirectory={onCreateDirectory}
                onCreateDocument={onCreateDocument}
                onCustomizeIcon={onCustomizeIcon}
                onDeleteRequest={onDeleteRequest}
                onExportNode={onExportNode}
                onImportDocuments={onImportDocuments}
                onOpenInFileManager={onOpenInFileManager}
                onOpenInPreferredEditor={onOpenInPreferredEditor}
                preferredEditorLabel={preferredEditorLabel}
                onResetIcon={onResetIcon}
                onRenameRequest={onRenameRequest}
                onTogglePinned={onTogglePinned}
              />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-44"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <NodeContextActions
            node={node}
            onCreateDirectory={onCreateDirectory}
            onCreateDocument={onCreateDocument}
            onCustomizeIcon={onCustomizeIcon}
            onDeleteRequest={onDeleteRequest}
            onExportNode={onExportNode}
            onImportDocuments={onImportDocuments}
            onOpenInFileManager={onOpenInFileManager}
            onOpenInPreferredEditor={onOpenInPreferredEditor}
            preferredEditorLabel={preferredEditorLabel}
            onRefreshNode={onRefreshNode}
            onResetIcon={onResetIcon}
            onRenameRequest={onRenameRequest}
            onTogglePinned={onTogglePinned}
          />
        </ContextMenuContent>
      </ContextMenu>

      {isDirectory && isExpanded && node.children?.length ? (
        <div
          className="relative space-y-0.5"
          data-testid={`tree-children-${node.id}`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 bottom-0 w-px bg-sidebar-foreground/20"
            data-testid={`tree-guide-${node.id}`}
            style={{ left: rowPaddingLeft + 6.5 }}
          />

          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              currentDocumentPath={currentDocumentPath}
              currentDirectoryPath={currentDirectoryPath}
              directoryDocumentCounts={directoryDocumentCounts}
              dragDisabled={dragDisabled}
              draggedNode={draggedNode}
              dropPreview={dropPreview}
              editingNodeId={editingNodeId}
              expanded={expanded}
              forceExpanded={forceExpanded}
              level={level + 1}
              node={child}
              pendingRenameNodePath={pendingRenameNodePath}
              onCreateDirectory={onCreateDirectory}
              onCreateDocument={onCreateDocument}
              onCustomizeIcon={onCustomizeIcon}
              onDeleteRequest={onDeleteRequest}
              onExportNode={onExportNode}
              onImportDocuments={onImportDocuments}
              onOpenInFileManager={onOpenInFileManager}
              onOpenInPreferredEditor={onOpenInPreferredEditor}
              onDropPreviewChange={onDropPreviewChange}
              onExpandedChange={onExpandedChange}
              onMoveNode={onMoveNode}
              onPendingRenameConsumed={onPendingRenameConsumed}
              onRefreshNode={onRefreshNode}
              onResetIcon={onResetIcon}
              onRenameRequest={onRenameRequest}
              onRenameSubmit={onRenameSubmit}
              onResolveDraggedNode={onResolveDraggedNode}
              onSelectDirectory={onSelectDirectory}
              onTogglePinned={onTogglePinned}
              onTreeDragEnd={onTreeDragEnd}
              onTreeDragStart={onTreeDragStart}
              onSelectDocument={onSelectDocument}
              preferredEditorLabel={preferredEditorLabel}
              rootPath={rootPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface TreeNodeProps {
  currentDocumentPath: string | null;
  currentDirectoryPath?: string | null;
  directoryDocumentCounts: ReadonlyMap<string, number>;
  dragDisabled: boolean;
  draggedNode: WorkspaceNode | null;
  dropPreview: DropPreview | null;
  editingNodeId: string | null;
  expanded: Set<string>;
  forceExpanded: boolean;
  level: number;
  node: WorkspaceNode;
  pendingRenameNodePath?: string | null;
  onCreateDirectory: (parentPath: string) => Promise<void>;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onCustomizeIcon?: (node: WorkspaceNode) => void;
  onDeleteRequest: (node: WorkspaceNode) => void;
  onExportNode?: (
    node: WorkspaceNode,
    format: WorkspaceExportFormat,
  ) => Promise<void> | void;
  onImportDocuments?: (
    targetDir: string,
    format: WorkspaceImportFormat,
  ) => Promise<void> | void;
  onOpenInFileManager?: (node: WorkspaceNode) => Promise<void> | void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => Promise<void> | void;
  preferredEditorLabel?: string;
  onDropPreviewChange: (preview: DropPreview | null) => void;
  onExpandedChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  onMoveNode?: (request: WorkspaceMoveRequest) => Promise<void> | void;
  onPendingRenameConsumed?: () => void;
  onRefreshNode?: (node: WorkspaceNode) => Promise<unknown> | void;
  onResetIcon?: (node: WorkspaceNode) => Promise<void> | void;
  onSelectDirectory?: (node: WorkspaceNode) => Promise<void> | void;
  onRenameRequest: (node: WorkspaceNode) => void;
  onRenameSubmit: (node: WorkspaceNode, nextName: string) => Promise<void>;
  onResolveDraggedNode: (
    event: React.DragEvent<HTMLElement>,
  ) => WorkspaceNode | null;
  onTogglePinned?: (node: WorkspaceNode) => void;
  onTreeDragEnd: () => void;
  onTreeDragStart: (node: WorkspaceNode) => void;
  onSelectDocument: (node: WorkspaceNode) => void;
  rootPath: string;
}

interface DropPreview {
  targetPath: string;
  position: WorkspaceMoveRequest['position'];
}

function countDirectoryDocuments(nodes: WorkspaceNode[]) {
  const counts = new Map<string, number>();

  const countNodeDocuments = (node: WorkspaceNode): number => {
    if (node.kind === 'document') {
      return 1;
    }

    const count = (node.children ?? []).reduce(
      (total, child) => total + countNodeDocuments(child),
      0,
    );
    counts.set(node.id, count);
    return count;
  };

  for (const node of nodes) {
    countNodeDocuments(node);
  }

  return counts;
}

function DirectoryDocumentCount({
  count,
  nodeId,
}: {
  count: number;
  nodeId: string;
}) {
  return (
    <span
      className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-center text-[10px] font-medium leading-4 text-sidebar-foreground/55 tabular-nums transition-opacity group-hover/tree-row:opacity-0"
      data-testid={`directory-document-count-${nodeId}`}
    >
      {count}
    </span>
  );
}

const EXPORT_ACTIONS: Array<{
  format: WorkspaceExportFormat;
  label: string;
}> = [
  { format: 'html', label: 'HTML' },
  { format: 'markdown', label: 'Markdown' },
  { format: 'pdf', label: 'PDF' },
  { format: 'word', label: 'Word' },
];

const IMPORT_ACTIONS: Array<{
  format: WorkspaceImportFormat;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { format: 'markdown', icon: FileText, label: '从 Markdown 导入' },
  { format: 'word', icon: FileType2, label: '从 Word 导入' },
  { format: 'pdf', icon: FileSearch2, label: '从 PDF 导入' },
  { format: 'html', icon: FileCode2, label: '从 HTML 导入' },
];

function DirectoryIcon({
  isDirectory,
  isExpanded,
  node,
  rootPath,
}: {
  isDirectory: boolean;
  isExpanded: boolean;
  node: WorkspaceNode;
  rootPath: string;
}) {
  if (!isDirectory) {
    return (
      <span
        aria-hidden="true"
        className="size-[13px] shrink-0"
        data-testid={`document-icon-placeholder-${node.id}`}
      />
    );
  }

  return (
    <TreeNodeIconRenderer
      expanded={isExpanded}
      node={node}
      rootPath={rootPath}
      testId={
        isExpanded
          ? `directory-folder-open-${node.id}`
          : `directory-folder-closed-${node.id}`
      }
    />
  );
}

function RenameInput({
  initialValue,
  label,
  onActivate,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  label: string;
  onActivate?: () => void;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ignoreInitialBlurRef = React.useRef(true);
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    onActivate?.();

    const timer = window.setTimeout(() => {
      ignoreInitialBlurRef.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [onActivate]);

  return (
    <Input
      ref={inputRef}
      aria-label={label}
      className="h-6 min-w-0 flex-1 px-1.5 text-sm"
      data-tree-drag-disabled="true"
      value={value}
      onBlur={() => {
        if (ignoreInitialBlurRef.current) {
          return;
        }

        onSubmit(value);
      }}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit(value);
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function NodeActionDropdown({
  node,
  onCreateDirectory,
  onCreateDocument,
  onCustomizeIcon,
  onDeleteRequest,
  onExportNode,
  onImportDocuments,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  preferredEditorLabel,
  onResetIcon,
  onRenameRequest,
  onTogglePinned,
}: NodeActionProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`打开 ${node.name} 操作菜单`}
          className="absolute right-2 top-0.5 z-[1] hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover/tree-row:flex data-[state=open]:flex"
          data-tree-drag-disabled="true"
          type="button"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <NodeDropdownActions
          node={node}
          onCreateDirectory={onCreateDirectory}
          onCreateDocument={onCreateDocument}
          onCustomizeIcon={onCustomizeIcon}
          onDeleteRequest={onDeleteRequest}
          onExportNode={onExportNode}
          onImportDocuments={onImportDocuments}
          onOpenInFileManager={onOpenInFileManager}
          onOpenInPreferredEditor={onOpenInPreferredEditor}
          preferredEditorLabel={preferredEditorLabel}
          onResetIcon={onResetIcon}
          onRenameRequest={onRenameRequest}
          onTogglePinned={onTogglePinned}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NodeActionProps {
  node: WorkspaceNode;
  onCreateDirectory: (parentPath: string) => Promise<void>;
  onCreateDocument: (
    parentPath: string,
  ) => Promise<WorkspaceNode | null | void> | WorkspaceNode | null | void;
  onCustomizeIcon?: (node: WorkspaceNode) => void;
  onDeleteRequest: (node: WorkspaceNode) => void;
  onExportNode?: (
    node: WorkspaceNode,
    format: WorkspaceExportFormat,
  ) => Promise<void> | void;
  onImportDocuments?: (
    targetDir: string,
    format: WorkspaceImportFormat,
  ) => Promise<void> | void;
  onOpenInFileManager?: (node: WorkspaceNode) => Promise<void> | void;
  onOpenInPreferredEditor?: (node: WorkspaceNode) => Promise<void> | void;
  preferredEditorLabel?: string;
  onRefreshNode?: (node: WorkspaceNode) => Promise<unknown> | void;
  onResetIcon?: (node: WorkspaceNode) => Promise<void> | void;
  onRenameRequest: (node: WorkspaceNode) => void;
  onTogglePinned?: (node: WorkspaceNode) => void;
}

function NodeDropdownActions({
  node,
  onCreateDirectory,
  onCreateDocument,
  onCustomizeIcon,
  onDeleteRequest,
  onExportNode,
  onImportDocuments,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  preferredEditorLabel,
  onResetIcon,
  onRenameRequest,
  onTogglePinned,
}: NodeActionProps) {
  if (node.kind === 'directory') {
    return (
      <>
        {onTogglePinned ? (
          <DropdownMenuItem onSelect={() => onTogglePinned(node)}>
            <Pin />
            {node.pinned ? '取消置顶' : '置顶'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => void onCreateDocument(node.relativePath)}
        >
          <FilePlus2 />
          新建文档
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void onCreateDirectory(node.relativePath)}
        >
          <FolderPlus />
          新建目录
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRenameRequest(node)}>
          <Pencil />
          重命名
        </DropdownMenuItem>
        {onCustomizeIcon ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onCustomizeIcon(node)}>
              <Shapes />
              更换图标...
            </DropdownMenuItem>
            {hasTreeNodeAppearance(node.appearance) && onResetIcon ? (
              <DropdownMenuItem onSelect={() => void onResetIcon(node)}>
                <RotateCcw />
                恢复默认图标
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {onOpenInFileManager ? (
          <DropdownMenuItem
            onSelect={() => void onOpenInFileManager(node)}
          >
            <FolderOpen />
            在文件夹中打开
          </DropdownMenuItem>
        ) : null}
        {onOpenInPreferredEditor && preferredEditorLabel ? (
          <DropdownMenuItem
            onSelect={() => void onOpenInPreferredEditor(node)}
          >
            <ExternalLink />
            在 {preferredEditorLabel} 中打开
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDeleteRequest(node)}
        >
          <Trash2 />
          删除目录
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!onImportDocuments}>
            <FileInput />
            导入
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {IMPORT_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.format}
                onSelect={() =>
                  void onImportDocuments?.(node.relativePath, action.format)
                }
              >
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    );
  }

  return (
    <>
      {onTogglePinned ? (
        <DropdownMenuItem onSelect={() => onTogglePinned(node)}>
          <Pin />
          {node.pinned ? '取消置顶' : '置顶'}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => onRenameRequest(node)}>
        <Pencil />
        重命名
      </DropdownMenuItem>
      {onOpenInFileManager ? (
        <DropdownMenuItem
          onSelect={() => void onOpenInFileManager(node)}
        >
          <FolderOpen />
          在文件夹中打开
        </DropdownMenuItem>
      ) : null}
      {onOpenInPreferredEditor && preferredEditorLabel ? (
        <DropdownMenuItem
          onSelect={() => void onOpenInPreferredEditor(node)}
        >
          <ExternalLink />
          在 {preferredEditorLabel} 中打开
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => onDeleteRequest(node)}
      >
        <Trash2 />
        删除文档
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={!onExportNode}>
          <Download />
          导出
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40">
          {EXPORT_ACTIONS.map((action) => (
            <DropdownMenuItem
              key={action.format}
              onSelect={() => void onExportNode?.(node, action.format)}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

function NodeContextActions({
  node,
  onCreateDirectory,
  onCreateDocument,
  onCustomizeIcon,
  onDeleteRequest,
  onExportNode,
  onImportDocuments,
  onOpenInFileManager,
  onOpenInPreferredEditor,
  preferredEditorLabel,
  onRefreshNode,
  onResetIcon,
  onRenameRequest,
  onTogglePinned,
}: NodeActionProps) {
  if (node.kind === 'directory') {
    return (
      <>
        {onRefreshNode ? (
          <ContextMenuItem onSelect={() => void onRefreshNode(node)}>
            <RefreshCw />
            刷新
          </ContextMenuItem>
        ) : null}
        {onTogglePinned ? (
          <ContextMenuItem onSelect={() => onTogglePinned(node)}>
            <Pin />
            {node.pinned ? '取消置顶' : '置顶'}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={() => void onCreateDocument(node.relativePath)}
        >
          <FilePlus2 />
          新建文档
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => void onCreateDirectory(node.relativePath)}
        >
          <FolderPlus />
          新建目录
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onRenameRequest(node)}>
          <Pencil />
          重命名
        </ContextMenuItem>
        {onCustomizeIcon ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onCustomizeIcon(node)}>
              <Shapes />
              更换图标...
            </ContextMenuItem>
            {hasTreeNodeAppearance(node.appearance) && onResetIcon ? (
              <ContextMenuItem onSelect={() => void onResetIcon(node)}>
                <RotateCcw />
                恢复默认图标
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
          </>
        ) : null}
        <CopyPathContextMenu node={node} />
        {onOpenInFileManager ? (
          <ContextMenuItem
            onSelect={() => void onOpenInFileManager(node)}
          >
            <FolderOpen />
            在文件夹中打开
          </ContextMenuItem>
        ) : null}
        {onOpenInPreferredEditor && preferredEditorLabel ? (
          <ContextMenuItem
            onSelect={() => void onOpenInPreferredEditor(node)}
          >
            <ExternalLink />
            在 {preferredEditorLabel} 中打开
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDeleteRequest(node)}
        >
          <Trash2 />
          删除目录
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!onImportDocuments}>
            <FileInput />
            导入
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {IMPORT_ACTIONS.map((action) => (
              <ContextMenuItem
                key={action.format}
                onSelect={() =>
                  void onImportDocuments?.(node.relativePath, action.format)
                }
              >
                <action.icon />
                {action.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </>
    );
  }

  return (
    <>
      {onRefreshNode ? (
        <ContextMenuItem onSelect={() => void onRefreshNode(node)}>
          <RefreshCw />
          刷新
        </ContextMenuItem>
      ) : null}
      {onTogglePinned ? (
        <ContextMenuItem onSelect={() => onTogglePinned(node)}>
          <Pin />
          {node.pinned ? '取消置顶' : '置顶'}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem onSelect={() => onRenameRequest(node)}>
        <Pencil />
        重命名
      </ContextMenuItem>
      <CopyPathContextMenu node={node} />
      {onOpenInFileManager ? (
        <ContextMenuItem
          onSelect={() => void onOpenInFileManager(node)}
        >
          <FolderOpen />
          在文件夹中打开
        </ContextMenuItem>
      ) : null}
      {onOpenInPreferredEditor && preferredEditorLabel ? (
        <ContextMenuItem
          onSelect={() => void onOpenInPreferredEditor(node)}
        >
          <ExternalLink />
          在 {preferredEditorLabel} 中打开
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        variant="destructive"
        onSelect={() => onDeleteRequest(node)}
      >
        <Trash2 />
        删除文档
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!onExportNode}>
          <Download />
          导出
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-40">
          {EXPORT_ACTIONS.map((action) => (
            <ContextMenuItem
              key={action.format}
              onSelect={() => void onExportNode?.(node, action.format)}
            >
              {action.label}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    </>
  );
}

function CopyPathContextMenu({ node }: { node: WorkspaceNode }) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Copy />
        复制路径
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-32">
        <ContextMenuItem
          onSelect={() => void copyNodePath(node.relativePath)}
        >
          相对路径
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => void copyNodePath(node.absolutePath)}
        >
          绝对路径
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

async function copyNodePath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    toast.error('复制路径失败');
  }
}

function DeleteNodeDialog({
  node,
  onConfirm,
  onOpenChange,
}: {
  node: WorkspaceNode | null;
  onConfirm: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const isDirectory = node?.kind === 'directory';
  const actionLabel = isDirectory ? '删除目录' : '删除文档';

  return (
    <AlertDialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <AlertDialogContent
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        size="sm"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {node ? `${actionLabel} ${getNodeDisplayName(node)}？` : actionLabel}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDirectory
              ? '此操作会同时删除目录下的所有文档，删除后无法撤销。'
              : '删除后无法撤销。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t-0 bg-transparent">
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void onConfirm()}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getNodeDisplayName(node: WorkspaceNode) {
  if (node.kind === 'directory') {
    return node.name;
  }

  return node.title?.trim() || node.name.replace(/\.md$/i, '');
}

function isWorkspaceNodeRenameNoop(node: WorkspaceNode, nextName: string) {
  if (node.kind === 'directory') {
    return nextName === node.name;
  }

  const physicalName = node.name.replace(/\.md$/i, '');
  const documentTitle = node.title?.trim() || physicalName;

  return nextName === physicalName && nextName === documentTitle;
}

function hasDescendantByAbsolutePath(
  node: WorkspaceNode,
  absolutePath?: string | null,
): boolean {
  if (!absolutePath || !node.children) {
    return false;
  }

  return node.children.some(
    (child) =>
      child.absolutePath === absolutePath ||
      hasDescendantByAbsolutePath(child, absolutePath),
  );
}

function findNodeReveal(
  nodes: WorkspaceNode[],
  absolutePath: string,
): { expandedIds: string[] } | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath) {
      return {
        expandedIds: node.kind === 'directory' ? [node.id] : [],
      };
    }

    if (node.kind !== 'directory') {
      continue;
    }

    const childReveal = findNodeReveal(node.children ?? [], absolutePath);

    if (childReveal) {
      return {
        expandedIds: [node.id, ...childReveal.expandedIds],
      };
    }
  }

  return null;
}

function findNodeByAbsolutePath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  if (!absolutePath) {
    return null;
  }

  for (const node of nodes) {
    if (node.absolutePath === absolutePath) {
      return node;
    }

    const child = node.children
      ? findNodeByAbsolutePath(node.children, absolutePath)
      : null;

    if (child) {
      return child;
    }
  }

  return null;
}

function getDropPosition(
  row: HTMLElement,
  clientY: number,
  target: WorkspaceNode,
): WorkspaceMoveRequest['position'] | null {
  const rect = row.getBoundingClientRect();
  const rowTop = rect.top;
  const rowHeight = rect.height > 0 ? rect.height : 32;
  const offset = clientY - rowTop;
  const topZone = rowHeight * 0.28;
  const bottomZone = rowHeight * 0.72;

  if (offset <= topZone) {
    return 'before';
  }

  if (offset >= bottomZone) {
    return 'after';
  }

  return target.kind === 'directory' ? 'inside' : null;
}

function canDropOnNode(
  dragged: WorkspaceNode,
  target: WorkspaceNode,
  position: WorkspaceMoveRequest['position'],
) {
  if (dragged.absolutePath === target.absolutePath) {
    return false;
  }

  if (
    dragged.kind === 'directory' &&
    isDescendantPath(target.absolutePath, dragged.absolutePath)
  ) {
    return false;
  }

  if (position === 'inside' && target.kind !== 'directory') {
    return false;
  }

  return true;
}

function isTreeDragDisabledTarget(target: EventTarget) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('[data-tree-drag-disabled="true"]'))
  );
}

function scrollTreeContainer(row: HTMLElement, clientY: number) {
  const container = row.closest('[data-workspace-tree-scroll-container="true"]');

  if (!(container instanceof HTMLElement)) {
    return;
  }

  const rect = container.getBoundingClientRect();
  const edgeSize = 36;

  if (clientY - rect.top < edgeSize) {
    container.scrollTop -= 12;
    return;
  }

  if (rect.bottom - clientY < edgeSize) {
    container.scrollTop += 12;
  }
}

function getDocumentTreeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

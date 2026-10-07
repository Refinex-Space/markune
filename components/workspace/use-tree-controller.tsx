'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  getBaseName,
  getParentPath,
  isDescendantPath,
} from './workspace-paths';
import {
  flattenTree,
  remapTreePath,
  topLevelSelection,
  validateTreeMove,
} from './workspace-tree-move';
import {
  resolveTreeDrop,
  visibleTreeRows,
  type TreeDropPreview,
} from './tree-drop-target';
import { getTreeSortPolicy } from './workspace-tree-sort';
import type {
  TreeSortPolicy,
  TreeSortPreferences,
  WorkspaceMoveRequest,
  WorkspaceNode,
  WorkspaceTreeMoveResult,
} from './workspace-types';

interface Options {
  nodes: WorkspaceNode[];
  rootPath: string;
  preferences?: TreeSortPreferences;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  treeRef: React.RefObject<HTMLDivElement | null>;
  forceExpanded: boolean;
  disabled: boolean;
  onMove?: (
    request: WorkspaceMoveRequest,
  ) => Promise<WorkspaceTreeMoveResult | void> | void;
  onUndo?: (token: string) => Promise<WorkspaceTreeMoveResult>;
  onSort?: (parent: string, policy: TreeSortPolicy | null) => Promise<void>;
}

export function useTreeController(options: Options) {
  const { nodes, rootPath, expanded, setExpanded, treeRef, forceExpanded } =
    options;
  const [selection, setSelection] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [focused, setFocused] = React.useState<string | null>(null);
  const [dragNodes, setDragNodes] = React.useState<WorkspaceNode[] | null>(
    null,
  );
  const [dragCount, setDragCount] = React.useState(0);
  const [draggedNode, setDraggedNode] = React.useState<WorkspaceNode | null>(
    null,
  );
  const [dropPreview, setDropPreview] = React.useState<TreeDropPreview | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState('');
  const [moveDialogPaths, setMoveDialogPaths] = React.useState<string[] | null>(
    null,
  );
  const [undoToken, setUndoToken] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);
  const previewRef = React.useRef<TreeDropPreview | null>(null);
  const dragPathsRef = React.useRef<string[]>([]);
  const dragNodeRef = React.useRef<WorkspaceNode | null>(null);
  const cancelled = React.useRef(false);
  const pointer = React.useRef<{ x: number; y: number } | null>(null);
  const anchor = React.useRef<string | null>(null);
  const typeahead = React.useRef({ value: '', time: 0 });
  const mounted = React.useRef(true);
  const latest = React.useRef(options);
  React.useLayoutEffect(() => {
    latest.current = options;
  }, [options]);
  const renderedNodes = dragNodes ?? nodes;
  const all = React.useMemo(() => flattenTree(renderedNodes), [renderedNodes]);
  const rows = React.useMemo(
    () => visibleTreeRows(renderedNodes, expanded, forceExpanded),
    [renderedNodes, expanded, forceExpanded],
  );
  const nodeIndex = React.useMemo(
    () => new Map(all.map((node) => [node.absolutePath, node])),
    [all],
  );
  const nodeIndexRef = React.useRef(nodeIndex);
  React.useLayoutEffect(() => {
    nodeIndexRef.current = nodeIndex;
  }, [nodeIndex]);
  const rowsRef = React.useRef(rows);
  React.useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const toastRef = React.useRef<string | number | undefined>(undefined);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      toast.dismiss(toastRef.current);
    };
  }, []);

  const preview = React.useCallback((next: TreeDropPreview | null) => {
    const previous = previewRef.current;
    previewRef.current = next;
    if (
      previous?.targetPath === next?.targetPath &&
      previous?.position === next?.position &&
      previous?.indicatorPath === next?.indicatorPath &&
      previous?.edge === next?.edge
    )
      return;
    setDropPreview(next);
  }, []);
  const endDrag = React.useCallback(() => {
    dragNodeRef.current = null;
    dragPathsRef.current = [];
    pointer.current = null;
    setDraggedNode(null);
    setDragNodes(null);
    setDragCount(0);
    preview(null);
  }, [preview]);
  const focusRow = React.useCallback(
    (path: string) => {
      setFocused(path);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!mounted.current) return;
          const element = Array.from(
            treeRef.current?.querySelectorAll<HTMLElement>(
              '[data-workspace-node-path]',
            ) ?? [],
          ).find((row) => row.dataset.workspaceNodePath === path);
          element?.focus({ preventScroll: true });
          const container = element?.closest<HTMLElement>(
            '[data-workspace-tree-scroll-container="true"]',
          );
          if (container && element) {
            const bounds = element.getBoundingClientRect(),
              viewport = container.getBoundingClientRect();
            if (bounds.top < viewport.top)
              container.scrollTop += bounds.top - viewport.top;
            else if (bounds.bottom > viewport.bottom)
              container.scrollTop += bounds.bottom - viewport.bottom;
          }
        }),
      );
    },
    [treeRef],
  );
  const applyResult = React.useCallback(
    (result: WorkspaceTreeMoveResult, originalNodes: WorkspaceNode[]) => {
      if (!mounted.current || result.changes.length === 0) return;
      const updated = flattenTree(result.snapshot.nodes);
      const previous = flattenTree(originalNodes);
      setExpanded((current) => {
        const next = new Set<string>();
        for (const id of current) {
          const old = previous.find((node) => node.id === id);
          const mapped =
            old &&
            updated.find(
              (node) =>
                node.absolutePath ===
                remapTreePath(old.absolutePath, result.changes),
            );
          if (mapped) next.add(mapped.id);
        }
        for (const change of result.changes)
          for (const node of updated) {
            if (
              node.kind === 'directory' &&
              isDescendantPath(change.newPath, node.absolutePath)
            )
              next.add(node.id);
          }
        return next;
      });
      setSelection(new Set(result.changes.map((change) => change.newPath)));
      if (result.changes[0]) focusRow(result.changes[0].newPath);
    },
    [focusRow, setExpanded],
  );
  const undo = React.useCallback(
    async (token: string) => {
      if (busyRef.current || !latest.current.onUndo || !mounted.current) return;
      const originalNodes = latest.current.nodes;
      busyRef.current = true;
      setBusy(true);
      endDrag();
      try {
        const result = await latest.current.onUndo(token);
        applyResult(result, originalNodes);
        setUndoToken(null);
        const message = result.error ?? '已撤销移动';
        setAnnouncement(message);
        if (result.error) toast.error(message);
        else toast.success(message);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [applyResult, endDrag],
  );
  const move = React.useCallback(
    async (request: WorkspaceMoveRequest): Promise<boolean> => {
      if (busyRef.current || !latest.current.onMove) return false;
      const error = validateTreeMove(latest.current.nodes, request);
      if (error) {
        setAnnouncement(error);
        toast.error(error);
        endDrag();
        return false;
      }
      const originalNodes = latest.current.nodes;
      busyRef.current = true;
      setBusy(true);
      endDrag();
      setAnnouncement('正在移动…');
      try {
        const result = await latest.current.onMove(request);
        if (!mounted.current) return false;
        if (result) {
          applyResult(result, originalNodes);
          setUndoToken(result.undoToken);
          const message = result.error
            ? `已完成 ${result.changes.length} 项：${result.error}`
            : `已移动 ${result.changes.length} 个项目`;
          setAnnouncement(message);
          toastRef.current = (result.error ? toast.error : toast.success)(
            message,
            {
              duration: 6000,
              action: result.undoToken
                ? { label: '撤销', onClick: () => void undo(result.undoToken!) }
                : undefined,
            },
          );
          return !result.error;
        }
        setAnnouncement('已移动');
        return true;
      } catch (error) {
        const message = errorMessage(error);
        setAnnouncement(message);
        toast.error(message);
        return false;
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [applyResult, endDrag, undo],
  );
  const sort = React.useCallback(
    async (parent: string, policy: TreeSortPolicy | null) => {
      if (busyRef.current || !latest.current.onSort) return;
      busyRef.current = true;
      setBusy(true);
      endDrag();
      try {
        await latest.current.onSort(parent, policy);
        setUndoToken(null);
        setAnnouncement('排序方式已更新');
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [endDrag],
  );

  const pathsForNode = React.useCallback(
    (node: WorkspaceNode) =>
      topLevelSelection(
        nodes,
        selection.has(node.absolutePath)
          ? selection
          : new Set([node.absolutePath]),
      ).map((item) => item.absolutePath),
    [nodes, selection],
  );
  const startDrag = React.useCallback(
    (node: WorkspaceNode) => {
      if (busyRef.current || latest.current.disabled) return;
      cancelled.current = false;
      const paths = pathsForNode(node);
      dragPathsRef.current = paths;
      dragNodeRef.current = node;
      setSelection(new Set(paths));
      setDragNodes(latest.current.nodes);
      setDragCount(paths.length);
      setDraggedNode(node);
      setAnnouncement(`正在拖动 ${paths.length} 个项目`);
    },
    [pathsForNode],
  );
  const resolveDraggedNode = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (cancelled.current) return null;
      if (dragNodeRef.current) return dragNodeRef.current;
      const path = event.dataTransfer.getData('text/plain');
      return nodeIndexRef.current.get(path) ?? null;
    },
    [],
  );
  const calculate = React.useCallback(
    (element: HTMLElement, node: WorkspaceNode, x: number, y: number) => {
      const bounds = element.getBoundingClientRect();
      const current = latest.current;
      const next = resolveTreeDrop({
        node,
        left: bounds.left,
        top: bounds.top,
        height: bounds.height,
        x,
        y,
        expanded: current.forceExpanded || current.expanded.has(node.id),
        rows: rowsRef.current,
        preferences: current.preferences,
        previous: previewRef.current,
      });
      const source = dragNodeRef.current;
      if (!source) return null;
      const paths = dragPathsRef.current.length
        ? dragPathsRef.current
        : [source.absolutePath];
      const request = {
        ...next,
        nodePath: source.absolutePath,
        nodePaths: paths,
      };
      if (validateTreeMove(current.nodes, request)) return null;
      const targetFolder = nodeIndexRef.current.get(next.targetPath);
      if (
        next.position === 'inside' &&
        getTreeSortPolicy(current.preferences, targetFolder?.relativePath)
          .mode !== 'manual' &&
        paths.every((path) => getParentPath(path) === next.targetPath)
      )
        return null;
      return next;
    },
    [],
  );
  const over = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>, node: WorkspaceNode) => {
      event.stopPropagation();
      if (busyRef.current || latest.current.disabled) return;
      const source = resolveDraggedNode(event);
      if (!source) return;
      if (!dragNodeRef.current) {
        dragNodeRef.current = source;
        dragPathsRef.current = [source.absolutePath];
      }
      pointer.current = { x: event.clientX, y: event.clientY };
      const next = calculate(
        event.currentTarget,
        node,
        event.clientX,
        event.clientY,
      );
      preview(next);
      event.dataTransfer.dropEffect = next ? 'move' : 'none';
      if (next) event.preventDefault();
    },
    [calculate, preview, resolveDraggedNode],
  );
  const overContainer = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (busyRef.current || latest.current.disabled || !dragNodeRef.current)
        return;
      pointer.current = { x: event.clientX, y: event.clientY };
      const row = Array.from(
        treeRef.current?.querySelectorAll<HTMLElement>(
          '[data-workspace-node-path]',
        ) ?? [],
      ).find((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          event.clientY >= bounds.top - 2 && event.clientY <= bounds.bottom + 2
        );
      });
      const node =
        row && nodeIndexRef.current.get(row.dataset.workspaceNodePath ?? '');
      const next =
        row && node ? calculate(row, node, event.clientX, event.clientY) : null;
      preview(next);
      event.dataTransfer.dropEffect = next ? 'move' : 'none';
      if (next) event.preventDefault();
    },
    [calculate, preview, treeRef],
  );

  const overRoot = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.stopPropagation();
      const source = resolveDraggedNode(event);
      if (!source || busyRef.current || latest.current.disabled) return;
      if (!dragNodeRef.current) {
        dragNodeRef.current = source;
        dragPathsRef.current = [source.absolutePath];
      }
      pointer.current = { x: event.clientX, y: event.clientY };
      const next: TreeDropPreview = {
        targetPath: rootPath,
        position: 'inside',
        indicatorPath: rootPath,
        edge: 'inside',
      };
      if (
        validateTreeMove(latest.current.nodes, {
          ...next,
          nodePath: source.absolutePath,
          nodePaths: dragPathsRef.current,
        }) ||
        (getTreeSortPolicy(latest.current.preferences).mode !== 'manual' &&
          dragPathsRef.current.every(
            (path) => getParentPath(path) === rootPath,
          ))
      ) {
        preview(null);
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      preview(next);
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [preview, resolveDraggedNode, rootPath],
  );
  const drop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const destination = previewRef.current,
        source = resolveDraggedNode(event);
      if (cancelled.current || !destination || !source) {
        endDrag();
        return;
      }
      const request: WorkspaceMoveRequest = {
        nodePath: source.absolutePath,
        targetPath: destination.targetPath,
        position: destination.position,
      };
      if (dragPathsRef.current.length > 1)
        request.nodePaths = [...dragPathsRef.current];
      void move(request);
    },
    [endDrag, move, resolveDraggedNode],
  );
  const leave = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      )
        return;
      pointer.current = null;
      preview(null);
    },
    [preview],
  );

  React.useEffect(() => {
    if (!draggedNode) return;
    let frame = 0,
      previousTime = 0;
    const tick = (time: number) => {
      const point = pointer.current;
      const container = treeRef.current?.closest<HTMLElement>(
        '[data-workspace-tree-scroll-container="true"]',
      );
      if (point && container) {
        const bounds = container.getBoundingClientRect();
        if (
          point.x >= bounds.left &&
          point.x <= bounds.right &&
          point.y >= bounds.top &&
          point.y <= bounds.bottom
        ) {
          const top = Math.max(0, 1 - (point.y - bounds.top) / 48),
            bottom = Math.max(0, 1 - (bounds.bottom - point.y) / 48);
          const velocity = (bottom * bottom - top * top) * 720;
          if (velocity) {
            container.scrollTop +=
              (velocity *
                Math.min(32, previousTime ? time - previousTime : 16)) /
              1000;
            const row = document
              .elementFromPoint?.(point.x, point.y)
              ?.closest<HTMLElement>('[data-workspace-node-path]');
            const node =
              row &&
              rowsRef.current.find(
                (item) =>
                  item.node.absolutePath === row.dataset.workspaceNodePath,
              )?.node;
            if (row && node) preview(calculate(row, node, point.x, point.y));
          }
        }
      }
      previousTime = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calculate, draggedNode, preview, treeRef]);

  const select = React.useCallback(
    (event: React.MouseEvent, node: WorkspaceNode) => {
      setFocused(node.absolutePath);
      if (event.shiftKey && anchor.current) {
        const from = rows.findIndex(
            (row) => row.node.absolutePath === anchor.current,
          ),
          to = rows.findIndex(
            (row) => row.node.absolutePath === node.absolutePath,
          );
        if (from >= 0 && to >= 0)
          setSelection(
            new Set(
              rows
                .slice(Math.min(from, to), Math.max(from, to) + 1)
                .map((row) => row.node.absolutePath),
            ),
          );
        return true;
      }
      anchor.current = node.absolutePath;
      if (event.metaKey || event.ctrlKey) {
        setSelection((current) => {
          const next = new Set(current);
          if (next.has(node.absolutePath)) next.delete(node.absolutePath);
          else next.add(node.absolutePath);
          return next;
        });
        return true;
      }
      setSelection(new Set([node.absolutePath]));
      return false;
    },
    [rows],
  );
  const moveStep = React.useCallback(
    (node: WorkspaceNode, direction: -1 | 1) => {
      const parent = getParentPath(node.absolutePath);
      const siblings =
        parent === rootPath
          ? nodes
          : (all.find((item) => item.absolutePath === parent)?.children ?? []);
      const paths = pathsForNode(node);
      if (paths.some((path) => getParentPath(path) !== parent)) {
        setAnnouncement('上移和下移需要选择同一文件夹内的项目');
        return;
      }
      const indices = siblings
        .map((item, index) => (paths.includes(item.absolutePath) ? index : -1))
        .filter((index) => index >= 0);
      const target =
        siblings[
          direction < 0 ? Math.min(...indices) - 1 : Math.max(...indices) + 1
        ];
      if (target)
        void move({
          nodePath: paths[0],
          nodePaths: paths,
          targetPath: target.absolutePath,
          position: direction < 0 ? 'before' : 'after',
        });
    },
    [all, move, nodes, pathsForNode, rootPath],
  );
  const keyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>, node: WorkspaceNode) => {
      if (busyRef.current) return;
      const index = rows.findIndex(
        (row) => row.node.absolutePath === node.absolutePath,
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(new Set(rows.map((row) => row.node.absolutePath)));
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        undoToken
      ) {
        event.preventDefault();
        event.stopPropagation();
        void undo(undoToken);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelled.current = true;
        endDrag();
        setSelection(new Set());
        setAnnouncement('已取消');
        return;
      }
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        event.currentTarget
          .querySelector<HTMLButtonElement>('[data-tree-actions]')
          ?.click();
        return;
      }
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const parent = node.relativePath.split('/').slice(0, -1).join('/');
        if (
          getTreeSortPolicy(latest.current.preferences, parent).mode ===
          'manual'
        )
          moveStep(node, event.key === 'ArrowUp' ? -1 : 1);
        else setAnnouncement('请先切换为手动排序');
        return;
      }
      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setSelection((current) => {
          const next = new Set(current);
          if (next.has(node.absolutePath)) next.delete(node.absolutePath);
          else next.add(node.absolutePath);
          return next;
        });
        return;
      }
      if (
        event.key.length === 1 &&
        event.key !== ' ' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.nativeEvent.isComposing
      ) {
        const time = Date.now();
        const value =
          (time - typeahead.current.time < 700 ? typeahead.current.value : '') +
          event.key.toLocaleLowerCase();
        typeahead.current = { value, time };
        const candidates = [
          ...rows.slice(index + 1),
          ...rows.slice(0, index + 1),
        ];
        const found = candidates.find((row) =>
          row.node.name.toLocaleLowerCase().startsWith(value),
        );
        if (found) {
          event.preventDefault();
          focusRow(found.node.absolutePath);
        }
        return;
      }
      let next: WorkspaceNode | undefined;
      if (event.key === 'ArrowDown')
        next = rows[Math.min(rows.length - 1, index + 1)]?.node;
      if (event.key === 'ArrowUp') next = rows[Math.max(0, index - 1)]?.node;
      if (event.key === 'Home') next = rows[0]?.node;
      if (event.key === 'End') next = rows.at(-1)?.node;
      if (event.key === 'ArrowRight' && node.kind === 'directory') {
        if (!expanded.has(node.id))
          setExpanded((current) => new Set(current).add(node.id));
        else next = node.children?.[0];
      }
      if (event.key === 'ArrowLeft') {
        if (expanded.has(node.id))
          setExpanded((current) => {
            const copy = new Set(current);
            copy.delete(node.id);
            return copy;
          });
        else
          next = all.find(
            (item) => item.absolutePath === getParentPath(node.absolutePath),
          );
      }
      if (
        [
          'ArrowDown',
          'ArrowUp',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
        ].includes(event.key)
      ) {
        event.preventDefault();
        if (next) {
          if (event.shiftKey) {
            const anchorIndex = rows.findIndex(
              (row) =>
                row.node.absolutePath === (anchor.current ?? node.absolutePath),
            );
            anchor.current ??= node.absolutePath;
            const end = rows.findIndex(
              (row) => row.node.absolutePath === next!.absolutePath,
            );
            setSelection(
              new Set(
                rows
                  .slice(
                    Math.min(anchorIndex, end),
                    Math.max(anchorIndex, end) + 1,
                  )
                  .map((row) => row.node.absolutePath),
              ),
            );
          } else {
            setSelection(new Set([next.absolutePath]));
            anchor.current = next.absolutePath;
          }
          focusRow(next.absolutePath);
        }
      }
    },
    [
      all,
      endDrag,
      expanded,
      focusRow,
      moveStep,
      rows,
      setExpanded,
      undo,
      undoToken,
    ],
  );

  return {
    renderedNodes,
    all,
    rows,
    selection,
    focused: rows.some((row) => row.node.absolutePath === focused)
      ? focused
      : rows[0]?.node.absolutePath,
    setFocused,
    busy,
    announcement,
    draggedNode,
    dropPreview,
    preview,
    endDrag,
    startDrag,
    resolveDraggedNode,
    over,
    overRoot,
    overContainer,
    drop,
    leave,
    select,
    keyDown,
    move,
    moveStep,
    sort,
    undo,
    undoToken,
    moveDialogPaths,
    closeMoveDialog: () => setMoveDialogPaths(null),
    openMoveDialog: (node: WorkspaceNode) =>
      setMoveDialogPaths(pathsForNode(node)),
    dragCount,
    dragMessage: dropPreview
      ? `${dropPreview.position === 'inside' ? '移至' : dropPreview.position === 'before' ? '放在之前：' : '放在之后：'}${dropPreview.targetPath === rootPath ? '工作区根目录' : getBaseName(dropPreview.targetPath)}`
      : draggedNode
        ? '选择目标位置'
        : '',
    rootPath,
    preferences: options.preferences,
    canSort: Boolean(options.onSort),
    canMove: Boolean(options.onMove),
  };
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '操作失败，请刷新目录树后重试';
}
export type TreeController = ReturnType<typeof useTreeController>;
export const TreeControllerContext = React.createContext<TreeController | null>(
  null,
);
export function useTreeControllerContext() {
  const controller = React.useContext(TreeControllerContext);
  if (!controller) throw new Error('TreeController is unavailable');
  return controller;
}

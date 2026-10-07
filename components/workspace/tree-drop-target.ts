import { getParentPath } from './workspace-paths';
import { getTreeSortPolicy } from './workspace-tree-sort';
import type {
  TreeSortPreferences,
  WorkspaceMoveRequest,
  WorkspaceNode,
} from './workspace-types';

export interface TreeDropPreview {
  targetPath: string;
  position: WorkspaceMoveRequest['position'];
  indicatorPath: string;
  edge: 'before' | 'after' | 'inside' | 'subtree-after';
}
export interface VisibleTreeNode {
  node: WorkspaceNode;
  level: number;
}
export function visibleTreeRows(
  nodes: WorkspaceNode[],
  expanded: ReadonlySet<string>,
  forceExpanded = false,
  level = 0,
): VisibleTreeNode[] {
  return nodes.flatMap((node) => [
    { node, level },
    ...(node.children && (forceExpanded || expanded.has(node.id))
      ? visibleTreeRows(node.children, expanded, forceExpanded, level + 1)
      : []),
  ]);
}

export function resolveTreeDrop({
  node,
  top,
  height,
  left,
  x,
  y,
  expanded,
  rows,
  preferences,
  previous,
}: {
  node: WorkspaceNode;
  top: number;
  height: number;
  left: number;
  x: number;
  y: number;
  expanded: boolean;
  rows: VisibleTreeNode[];
  preferences?: TreeSortPreferences;
  previous: TreeDropPreview | null;
}): TreeDropPreview {
  const offset = y - top;
  const size = height || 28;
  const parentRelative = node.relativePath.includes('/')
    ? node.relativePath.slice(0, node.relativePath.lastIndexOf('/'))
    : '';
  const parentManual =
    getTreeSortPolicy(preferences, parentRelative).mode === 'manual';
  let position: WorkspaceMoveRequest['position'];
  if (node.kind === 'document') {
    position = offset < size / 2 ? 'before' : 'after';
    if (
      previous?.indicatorPath === node.absolutePath &&
      previous.position !== 'inside' &&
      Math.abs(offset - size / 2) < 3
    )
      position = previous.position;
  } else {
    const edge = Math.min(7, size / 4);
    position =
      offset < edge ? 'before' : offset > size - edge ? 'after' : 'inside';
    if (expanded && position === 'after') {
      const first = node.children?.[0];
      if (
        first &&
        getTreeSortPolicy(preferences, node.relativePath).mode === 'manual'
      )
        return {
          targetPath: first.absolutePath,
          position: 'before',
          indicatorPath: first.absolutePath,
          edge: 'before',
        };
      position = 'inside';
    }
  }
  // A shallower insertion is only offered at the end of that visible subtree. author: refinex
  const row = rows.find((item) => item.node.absolutePath === node.absolutePath);
  if (
    position === 'after' &&
    offset >= size - 7 &&
    row &&
    row.level > 0 &&
    x >= left
  ) {
    const depth = Math.max(0, Math.floor((x - left - 19) / 20));
    if (depth < row.level) {
      const index = rows.indexOf(row);
      for (let i = index - 1; i >= 0; i--) {
        const candidate = rows[i];
        if (candidate.level > depth || candidate.node.kind !== 'directory')
          continue;
        const next = rows[index + 1];
        if (!next || next.level <= candidate.level) {
          const parent = candidate.node.relativePath
            .split('/')
            .slice(0, -1)
            .join('/');
          if (getTreeSortPolicy(preferences, parent).mode === 'manual')
            return {
              targetPath: candidate.node.absolutePath,
              position: 'after',
              indicatorPath: candidate.node.absolutePath,
              edge: 'subtree-after',
            };
        }
        break;
      }
    }
  }
  if (position !== 'inside' && !parentManual)
    return {
      targetPath: getParentPath(node.absolutePath),
      position: 'inside',
      indicatorPath: getParentPath(node.absolutePath),
      edge: 'inside',
    };
  return {
    targetPath: node.absolutePath,
    position,
    indicatorPath: node.absolutePath,
    edge: position,
  };
}

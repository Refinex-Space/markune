import {
  getBaseName,
  getParentPath,
  isDescendantPath,
  joinPath,
} from './workspace-paths';
import type {
  TreePathChange,
  WorkspaceMoveRequest,
  WorkspaceNode,
} from './workspace-types';

export function remapTreePath(path: string, changes: TreePathChange[]) {
  const match = changes.find(
    (change) =>
      path === change.oldPath || isDescendantPath(path, change.oldPath),
  );
  return match ? match.newPath + path.slice(match.oldPath.length) : path;
}

export function flattenTree(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children ?? [])]);
}

export function topLevelSelection(
  nodes: WorkspaceNode[],
  selected: ReadonlySet<string>,
) {
  const ordered = flattenTree(nodes).filter((node) =>
    selected.has(node.absolutePath),
  );
  return ordered.filter(
    (node) =>
      !ordered.some(
        (parent) =>
          parent.kind === 'directory' &&
          isDescendantPath(node.absolutePath, parent.absolutePath),
      ),
  );
}

export function validateTreeMove(
  nodes: WorkspaceNode[],
  request: WorkspaceMoveRequest,
): string | null {
  const paths = request.nodePaths ?? [request.nodePath];
  if (paths.length > 100) return '每次最多移动 100 个项目';
  const parent =
    request.position === 'inside'
      ? request.targetPath
      : getParentPath(request.targetPath);
  const all = flattenTree(nodes);
  const names = new Set<string>();
  for (const path of paths) {
    if (
      path === request.targetPath ||
      isDescendantPath(parent, path) ||
      parent === path
    )
      return '不能移入自身或子文件夹';
    const name = getBaseName(path);
    const destination = joinPath(parent, name);
    if (
      names.has(name) ||
      all.some(
        (node) =>
          node.absolutePath === destination && node.absolutePath !== path,
      )
    )
      return '目标文件夹中存在同名项目';
    names.add(name);
  }
  return null;
}

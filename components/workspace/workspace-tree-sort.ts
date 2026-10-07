import type {
  TreeSortPolicy,
  TreeSortPreferences,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

export const DEFAULT_TREE_SORT: TreeSortPreferences = {
  default: { mode: 'manual', foldersFirst: true },
  folders: {},
};
export const TREE_SORT_OPTIONS = [
  ['manual', '手动排序'],
  ['name-asc', '名称（升序）'],
  ['name-desc', '名称（降序）'],
  ['created-desc', '创建时间（从新到旧）'],
  ['created-asc', '创建时间（从旧到新）'],
  ['modified-desc', '修改时间（从新到旧）'],
  ['modified-asc', '修改时间（从旧到新）'],
] as const;
const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

export function getTreeSortPolicy(
  preferences: TreeSortPreferences = DEFAULT_TREE_SORT,
  parent = '',
): TreeSortPolicy {
  let scope = parent;
  while (scope) {
    if (preferences.folders[scope]) return preferences.folders[scope];
    const separator = scope.lastIndexOf('/');
    scope = separator < 0 ? '' : scope.slice(0, separator);
  }
  return preferences.default;
}

export function sortWorkspaceNodes(
  nodes: WorkspaceNode[],
  preferences = DEFAULT_TREE_SORT,
  parent = '',
): WorkspaceNode[] {
  const policy = getTreeSortPolicy(preferences, parent);
  const sorted = nodes.map((node) =>
    node.children
      ? {
          ...node,
          children: sortWorkspaceNodes(
            node.children,
            preferences,
            node.relativePath,
          ),
        }
      : node,
  );
  sorted.sort((a, b) => {
    if (policy.mode === 'manual')
      return (a.manualOrder ?? Infinity) - (b.manualOrder ?? Infinity) || 0;
    if (policy.foldersFirst && a.kind !== b.kind)
      return a.kind === 'directory' ? -1 : 1;
    const byName =
      collator.compare(a.name, b.name) ||
      (a.relativePath < b.relativePath
        ? -1
        : a.relativePath > b.relativePath
          ? 1
          : 0);
    const direction = policy.mode.endsWith('desc') ? -1 : 1;
    if (policy.mode.startsWith('name')) return direction * byName;
    const left = policy.mode.startsWith('created')
      ? a.fileCreatedAt
      : a.fileModifiedAt;
    const right = policy.mode.startsWith('created')
      ? b.fileCreatedAt
      : b.fileModifiedAt;
    if (left == null || right == null)
      return left == null && right == null ? byName : left == null ? 1 : -1;
    return direction * (left - right) || byName;
  });
  return sorted;
}

export function projectWorkspaceSnapshot(
  snapshot: WorkspaceSnapshot,
): WorkspaceSnapshot {
  return {
    ...snapshot,
    nodes: sortWorkspaceNodes(snapshot.nodes, snapshot.treeSort),
  };
}

export function collectVisibleOrders(
  nodes: WorkspaceNode[],
  parentPath: string,
  rootPath: string,
): string[][] {
  const orders: string[][] = [];
  function visit(children: WorkspaceNode[], scope: string) {
    if (
      scope === parentPath ||
      parentPath === rootPath ||
      scope.startsWith(`${parentPath}/`) ||
      scope.startsWith(`${parentPath}\\`)
    ) {
      orders.push(children.map((node) => node.absolutePath));
    }
    for (const child of children)
      if (child.children) visit(child.children, child.absolutePath);
  }
  visit(nodes, rootPath);
  return orders;
}

export function remapTreeSortPreferences(
  preferences: TreeSortPreferences | undefined,
  oldPath: string,
  newPath: string | null,
): TreeSortPreferences | undefined {
  if (!preferences) return preferences;
  return {
    ...preferences,
    folders: Object.fromEntries(
      Object.entries(preferences.folders).flatMap(([path, policy]) => {
        if (path !== oldPath && !path.startsWith(`${oldPath}/`))
          return [[path, policy]];
        return newPath === null
          ? []
          : [[newPath + path.slice(oldPath.length), policy]];
      }),
    ),
  };
}

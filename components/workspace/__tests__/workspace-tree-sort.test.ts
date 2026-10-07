import { describe, expect, it } from 'vitest';
import {
  collectVisibleOrders,
  getTreeSortPolicy,
  sortWorkspaceNodes,
} from '../workspace-tree-sort';
import { resolveTreeDrop, visibleTreeRows } from '../tree-drop-target';
import {
  remapTreePath,
  topLevelSelection,
  validateTreeMove,
} from '../workspace-tree-move';
import type { TreeSortPreferences, WorkspaceNode } from '../workspace-types';

const doc = (
  name: string,
  fields: Partial<WorkspaceNode> = {},
): WorkspaceNode => ({
  id: name,
  name,
  relativePath: name,
  absolutePath: `/repo/${name}`,
  kind: 'document',
  ...fields,
});
const folder = (name: string, children: WorkspaceNode[] = []): WorkspaceNode =>
  doc(name, { kind: 'directory', children });
const preferences = (
  mode: TreeSortPreferences['default']['mode'],
  foldersFirst = false,
): TreeSortPreferences => ({ default: { mode, foldersFirst }, folders: {} });

describe('workspace tree sorting contract', () => {
  it('naturally sorts real filenames and keeps folders first in both directions', () => {
    const nodes = [
      doc('10.md', { title: 'AAA' }),
      doc('2.md', { title: 'ZZZ' }),
      folder('z'),
    ];
    expect(
      sortWorkspaceNodes(nodes, preferences('name-asc', true)).map(
        (n) => n.name,
      ),
    ).toEqual(['z', '2.md', '10.md']);
    expect(
      sortWorkspaceNodes(nodes, preferences('name-desc', true)).map(
        (n) => n.name,
      ),
    ).toEqual(['z', '10.md', '2.md']);
  });
  it('uses filesystem timestamps and always puts unknown times last', () => {
    const nodes = [
      doc('unknown.md', { createdAt: 999999 }),
      doc('new.md', { createdAt: 1, fileCreatedAt: 20 }),
      doc('old.md', { fileCreatedAt: 10 }),
    ];
    expect(
      sortWorkspaceNodes(nodes, preferences('created-desc')).map((n) => n.name),
    ).toEqual(['new.md', 'old.md', 'unknown.md']);
    expect(
      sortWorkspaceNodes(nodes, preferences('created-asc')).map((n) => n.name),
    ).toEqual(['old.md', 'new.md', 'unknown.md']);
  });
  it('restores manual order after a sorted projection and appends new nodes', () => {
    const nodes = [
      doc('z.md', { manualOrder: 0 }),
      folder('a'),
      doc('b.md', { manualOrder: 1 }),
    ];
    const sorted = sortWorkspaceNodes(nodes, preferences('name-asc'));
    expect(
      sortWorkspaceNodes(sorted, preferences('manual', true)).map(
        (n) => n.name,
      ),
    ).toEqual(['z.md', 'b.md', 'a']);
  });
  it('inherits the closest folder policy without affecting sibling scopes', () => {
    const setting = preferences('name-asc');
    setting.folders['notes'] = { mode: 'modified-desc', foldersFirst: true };
    setting.folders['notes/code'] = { mode: 'manual', foldersFirst: false };
    expect(getTreeSortPolicy(setting, 'notes/code/deep').mode).toBe('manual');
    expect(getTreeSortPolicy(setting, 'notes/other').mode).toBe(
      'modified-desc',
    );
    expect(getTreeSortPolicy(setting, 'notes2').mode).toBe('name-asc');
  });
  it('collects only the selected scope for first manual-order capture', () => {
    const a = folder('a', [doc('a/1.md')]),
      b = folder('b', [doc('b/2.md')]);
    expect(collectVisibleOrders([a, b], '/repo/a', '/repo')).toEqual([
      ['/repo/a/1.md'],
    ]);
  });
});

describe('tree drop geometry', () => {
  const node = doc('a.md');
  function resolve(
    y: number,
    extra: Partial<Parameters<typeof resolveTreeDrop>[0]> = {},
  ) {
    return resolveTreeDrop({
      node,
      top: 100,
      left: 0,
      height: 28,
      x: 100,
      y,
      expanded: false,
      rows: [{ node, level: 0 }],
      previous: null,
      ...extra,
    });
  }
  it('covers the entire document row without a central dead zone', () => {
    for (let y = 100; y < 128; y++)
      expect(['before', 'after']).toContain(resolve(y).position);
    expect(resolve(113).position).toBe('before');
    expect(resolve(115).position).toBe('after');
  });
  it('stabilizes the previous destination around the midpoint', () => {
    expect(resolve(115, { previous: resolve(110) }).position).toBe('before');
    expect(resolve(119, { previous: resolve(110) }).position).toBe('after');
  });
  it('treats the gap below an expanded folder as before its first child', () => {
    const child = doc('folder/child.md'),
      parent = folder('folder', [child]);
    const result = resolve(127, { node: parent, expanded: true });
    expect(result).toMatchObject({
      targetPath: child.absolutePath,
      position: 'before',
      indicatorPath: child.absolutePath,
    });
  });
  it('places the after-folder indicator after the complete subtree when outdenting at its end', () => {
    const child = doc('folder/child.md'),
      parent = folder('folder', [child]);
    expect(
      resolve(127, {
        node: child,
        x: 5,
        rows: [
          { node: parent, level: 0 },
          { node: child, level: 1 },
        ],
      }),
    ).toMatchObject({
      targetPath: parent.absolutePath,
      position: 'after',
      edge: 'subtree-after',
    });
  });
  it('does not outdent in the middle of a subtree', () => {
    const child = doc('folder/child.md'),
      other = doc('folder/other.md'),
      parent = folder('folder', [child, other]);
    expect(
      resolve(127, {
        node: child,
        x: 5,
        rows: [
          { node: parent, level: 0 },
          { node: child, level: 1 },
          { node: other, level: 1 },
        ],
      }).targetPath,
    ).toBe(child.absolutePath);
  });
  it('automatic sorting only offers a destination folder, never an arbitrary position', () => {
    expect(
      resolve(101, { preferences: preferences('name-asc') }),
    ).toMatchObject({ targetPath: '/repo', position: 'inside' });
  });
  it('builds visible rows without traversing collapsed subtrees', () => {
    const child = doc('folder/a.md'),
      parent = folder('folder', [child]);
    expect(visibleTreeRows([parent], new Set())).toHaveLength(1);
    expect(
      visibleTreeRows([parent], new Set(['folder'])).map((r) => r.level),
    ).toEqual([0, 1]);
  });
});

describe('tree move selection and paths', () => {
  it('moves selected ancestors only, preserving their displayed order', () => {
    const child = doc('folder/a.md'),
      parent = folder('folder', [child]);
    expect(
      topLevelSelection(
        [parent, node],
        new Set([child.absolutePath, node.absolutePath, parent.absolutePath]),
      ),
    ).toEqual([parent, node]);
  });
  const node = doc('b.md');
  it('rejects descendants and duplicate target names before submission', () => {
    const parent = folder('folder', [doc('folder/a.md')]);
    expect(
      validateTreeMove([parent], {
        nodePath: parent.absolutePath,
        targetPath: '/repo/folder/sub',
        position: 'inside',
      }),
    ).toBeTruthy();
    expect(
      validateTreeMove([parent, doc('a.md')], {
        nodePath: '/repo/a.md',
        targetPath: '/repo/folder',
        position: 'inside',
      }),
    ).toContain('同名');
  });
  it('maps an entire moved subtree without matching a similar prefix', () => {
    const changes = [
      { oldPath: '/repo/folder', newPath: '/repo/other/folder' },
    ];
    expect(remapTreePath('/repo/folder/a.md', changes)).toBe(
      '/repo/other/folder/a.md',
    );
    expect(remapTreePath('/repo/folder2/a.md', changes)).toBe(
      '/repo/folder2/a.md',
    );
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => false),
  takeExternalOpenRequest: vi.fn(async () => null),
  subscribeToExternalOpen: vi.fn(async () => () => undefined),
  createMarkdownDocument: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  createWorkspaceRoot: vi.fn(),
  deleteWorkspaceNode: vi.fn(),
  ensureWorkspace: vi.fn(async () => ({ recentDocumentPaths: [] })),
  getRecentWorkspacePath: vi.fn(() => null as string | null),
  getWorkspaceHistory: vi.fn(() => []),
  inspectWorkspaceBrand: vi.fn(async () => ({ state: 'current' })),
  loadWorkspaceTree: vi.fn(),
  migrateLegacyWorkspaceBrand: vi.fn(),
  moveWorkspaceNode: vi.fn(),
  moveWorkspaceNodes: vi.fn(),
  undoWorkspaceTreeMove: vi.fn(),
  setWorkspaceTreeSort: vi.fn(),
  refreshWorkspaceNode: vi.fn(),
  readMarkdownDocument: vi.fn(),
  recordWorkspaceHistory: vi.fn(
    (snapshot: { rootPath: string; rootName: string }) => [
      {
        lastOpenedAt: Date.now(),
        rootName: snapshot.rootName,
        rootPath: snapshot.rootPath,
      },
    ],
  ),
  removeWorkspaceHistory: vi.fn((rootPath: string) => {
    return api
      .getWorkspaceHistory()
      .filter((item: { rootPath: string }) => item.rootPath !== rootPath);
  }),
  renameWorkspaceNode: vi.fn(),
  saveMarkdownDocument: vi.fn(),
  saveRecentWorkspacePath: vi.fn(),
  selectWorkspaceParentDirectory: vi.fn(),
  selectWorkspaceRoot: vi.fn(),
  setWorkspaceNodeState: vi.fn(),
}));

vi.mock('../workspace-api', () => api);

import { useWorkspace } from '../use-workspace';

import type {
  WorkspaceNode,
  WorkspaceSnapshot,
  WorkspaceTreeMoveResult,
} from '../workspace-types';
const a: WorkspaceNode = {
  id: 'a.md',
  name: 'a.md',
  relativePath: 'a.md',
  absolutePath: '/repo/a.md',
  kind: 'document',
  manualOrder: 0,
};
const b: WorkspaceNode = {
  ...a,
  id: 'b.md',
  name: 'b.md',
  relativePath: 'b.md',
  absolutePath: '/repo/b.md',
  manualOrder: 1,
};
const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [a, b],
  treeSort: { default: { mode: 'manual', foldersFirst: true }, folders: {} },
};
const moved: WorkspaceTreeMoveResult = {
  snapshot: {
    ...snapshot,
    nodes: [
      { ...b, manualOrder: 0 },
      { ...a, manualOrder: 1 },
    ],
  },
  changes: [{ oldPath: a.absolutePath, newPath: a.absolutePath }],
  undoToken: 'receipt',
  error: null,
};
const request = {
  nodePath: a.absolutePath,
  targetPath: b.absolutePath,
  position: 'after' as const,
};

describe('workspace tree mutation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRecentWorkspacePath.mockReturnValue(null);
    api.moveWorkspaceNodes.mockResolvedValue(moved);
    api.loadWorkspaceTree.mockResolvedValue(snapshot);
  });
  it('projects explicit sorting for every snapshot consumer', () => {
    const { result } = renderHook(() =>
      useWorkspace({
        ...snapshot,
        treeSort: {
          default: { mode: 'name-desc', foldersFirst: true },
          folders: {},
        },
      }),
    );
    expect(result.current.snapshot?.nodes.map((node) => node.name)).toEqual([
      'b.md',
      'a.md',
    ]);
  });
  it('applies the authoritative batch order and returns its undo receipt', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    let receipt: WorkspaceTreeMoveResult | undefined;
    await act(async () => {
      receipt = await result.current.moveTreeNodes(request);
    });
    expect(api.moveWorkspaceNodes).toHaveBeenCalledWith('/repo', request);
    expect(result.current.snapshot?.nodes.map((node) => node.name)).toEqual([
      'b.md',
      'a.md',
    ]);
    expect(receipt?.undoToken).toBe('receipt');
  });
  it('discards a refresh started before the completed move', async () => {
    let resolveRefresh!: (snapshot: WorkspaceSnapshot) => void;
    api.loadWorkspaceTree.mockReturnValue(
      new Promise<WorkspaceSnapshot>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const { result } = renderHook(() => useWorkspace(snapshot));
    let refresh!: Promise<WorkspaceSnapshot | null>;
    act(() => {
      refresh = result.current.refreshWorkspaceTree();
    });
    await act(async () => {
      await result.current.moveTreeNodes(request);
    });
    await act(async () => {
      resolveRefresh(snapshot);
      await refresh;
    });
    expect(result.current.snapshot?.nodes.map((node) => node.name)).toEqual([
      'b.md',
      'a.md',
    ]);
  });
  it('does not apply an old workspace move after switching workspaces', async () => {
    let resolveMove!: (result: WorkspaceTreeMoveResult) => void;
    api.moveWorkspaceNodes.mockReturnValue(
      new Promise<WorkspaceTreeMoveResult>((resolve) => {
        resolveMove = resolve;
      }),
    );
    const { result } = renderHook(() => useWorkspace(snapshot));
    let outcome!: Promise<string | WorkspaceTreeMoveResult>;
    await act(async () => {
      outcome = result.current
        .moveTreeNodes(request)
        .catch((error: Error) => error.message);
      await Promise.resolve();
    });
    api.selectWorkspaceRoot.mockResolvedValue('/other');
    api.loadWorkspaceTree.mockResolvedValue({
      rootPath: '/other',
      rootName: 'other',
      nodes: [],
    });
    await act(async () => {
      await result.current.openWorkspace();
    });
    let message: string | WorkspaceTreeMoveResult = '';
    await act(async () => {
      resolveMove(moved);
      message = await outcome;
    });
    expect(message).toContain('工作区已切换');
    expect(result.current.snapshot?.rootPath).toBe('/other');
  });
  it('keeps a manual slot when a single node refresh has no rank', async () => {
    api.refreshWorkspaceNode.mockResolvedValue({
      ...a,
      manualOrder: null,
      fileModifiedAt: 12,
    });
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(async () => {
      await result.current.refreshWorkspaceNode(a);
    });
    expect(result.current.snapshot?.nodes.map((node) => node.name)).toEqual([
      'a.md',
      'b.md',
    ]);
  });
});

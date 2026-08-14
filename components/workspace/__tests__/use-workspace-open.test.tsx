import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
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
  readMarkdownDocument: vi.fn(),
  recordWorkspaceHistory: vi.fn((snapshot: { rootPath: string; rootName: string }) => [
    {
      lastOpenedAt: Date.now(),
      rootName: snapshot.rootName,
      rootPath: snapshot.rootPath,
    },
  ]),
  removeWorkspaceHistory: vi.fn((rootPath: string) => {
    return api.getWorkspaceHistory().filter(
      (item: { rootPath: string }) => item.rootPath !== rootPath,
    );
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

function snapshotFor(rootPath: string) {
  return {
    nodes: [],
    rootName: rootPath.split('/').pop() ?? rootPath,
    rootPath,
  };
}

describe('useWorkspace open workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRecentWorkspacePath.mockReturnValue(null);
    api.getWorkspaceHistory.mockReturnValue([]);
    api.ensureWorkspace.mockResolvedValue({ recentDocumentPaths: [] });
    api.inspectWorkspaceBrand.mockResolvedValue({ state: 'current' });
  });

  it('does not let a stale auto-restore failure clear a newer successful open', async () => {
    let resolveStale: ((value: ReturnType<typeof snapshotFor>) => void) | null =
      null;
    const stalePromise = new Promise<ReturnType<typeof snapshotFor>>((resolve) => {
      resolveStale = resolve;
    });

    api.getRecentWorkspacePath.mockReturnValue('/workspace/stale');
    api.loadWorkspaceTree.mockImplementation(async (rootPath: string) => {
      if (rootPath === '/workspace/stale') {
        return stalePromise;
      }

      return snapshotFor(rootPath);
    });

    const { result } = renderHook(() => useWorkspace(null));

    await act(async () => {
      await Promise.resolve();
    });

    api.selectWorkspaceRoot.mockResolvedValue('/workspace/fresh');

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/fresh');

    await act(async () => {
      resolveStale?.(snapshotFor('/workspace/stale'));
      await waitFor(() => {
        expect(api.loadWorkspaceTree).toHaveBeenCalledWith('/workspace/stale');
      });
      await Promise.resolve();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/fresh');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a stale auto-restore failure after the user opened another workspace', async () => {
    let rejectStale: ((reason?: unknown) => void) | null = null;
    const stalePromise = new Promise<ReturnType<typeof snapshotFor>>(
      (_resolve, reject) => {
        rejectStale = reject;
      },
    );

    api.getRecentWorkspacePath.mockReturnValue('/workspace/stale');
    api.loadWorkspaceTree.mockImplementation(async (rootPath: string) => {
      if (rootPath === '/workspace/stale') {
        return stalePromise;
      }

      return snapshotFor(rootPath);
    });

    const { result } = renderHook(() => useWorkspace(null));

    await act(async () => {
      await Promise.resolve();
    });

    api.selectWorkspaceRoot.mockResolvedValue('/workspace/fresh');

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/fresh');

    await act(async () => {
      rejectStale?.(new Error('stale workspace unreadable'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/fresh');
    expect(result.current.error).toBeNull();
  });

  it('surfaces folder picker failures without leaving a stale loading state', async () => {
    api.selectWorkspaceRoot.mockRejectedValue(new Error('dialog unavailable'));

    const { result } = renderHook(() => useWorkspace(null));

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toContain('dialog unavailable');
  });

  it('only auto-restores the recent workspace once while empty', async () => {
    api.getRecentWorkspacePath.mockReturnValue('/workspace/missing');
    api.loadWorkspaceTree.mockRejectedValue(new Error('missing'));

    const { result } = renderHook(() => useWorkspace(null));

    await waitFor(() => {
      expect(api.loadWorkspaceTree).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.snapshot).toBeNull();
      expect(result.current.error).toBeNull();
    });

    expect(api.removeWorkspaceHistory).toHaveBeenCalledWith('/workspace/missing');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.loadWorkspaceTree).toHaveBeenCalledTimes(1);
  });

  it('surfaces the real load error after the user selects a folder', async () => {
    api.loadWorkspaceTree.mockRejectedValue(new Error('工作区路径不存在'));
    api.selectWorkspaceRoot.mockResolvedValue('/workspace/gone');

    const { result } = renderHook(() => useWorkspace(null));

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toBe('工作区路径不存在');
    expect(api.removeWorkspaceHistory).not.toHaveBeenCalled();
  });

  it('blocks a legacy workspace until the user confirms safe migration', async () => {
    api.inspectWorkspaceBrand.mockResolvedValue({ state: 'legacy' });
    api.selectWorkspaceRoot.mockResolvedValue('/workspace/legacy');

    const { result } = renderHook(() => useWorkspace(null));

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.pendingBrandMigration).toEqual({
      rootPath: '/workspace/legacy',
      state: 'legacy',
    });
    expect(result.current.snapshot).toBeNull();
    expect(api.loadWorkspaceTree).not.toHaveBeenCalled();
  });

  it('migrates a confirmed legacy workspace and opens it without reinspection', async () => {
    api.inspectWorkspaceBrand.mockResolvedValue({ state: 'legacy' });
    api.selectWorkspaceRoot.mockResolvedValue('/workspace/legacy');
    api.migrateLegacyWorkspaceBrand.mockResolvedValue({
      appSettingsMigrated: true,
      backupPath: '.markune/migrations/brand-rename/test',
      codexProviderMigrated: false,
      credentialMigrated: false,
      migratedFiles: 2,
      warnings: [],
    });
    api.loadWorkspaceTree.mockResolvedValue(snapshotFor('/workspace/legacy'));

    const { result } = renderHook(() => useWorkspace(null));
    await act(async () => {
      await result.current.openWorkspace();
    });
    await act(async () => {
      await result.current.migratePendingBrandWorkspace();
    });

    expect(api.migrateLegacyWorkspaceBrand).toHaveBeenCalledWith(
      '/workspace/legacy',
    );
    expect(api.inspectWorkspaceBrand).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot?.rootPath).toBe('/workspace/legacy');
    expect(result.current.pendingBrandMigration).toBeNull();
    expect(result.current.brandMigrationReport?.migratedFiles).toBe(2);
  });

  it('keeps the current workspace open when migration of another workspace is cancelled', async () => {
    api.inspectWorkspaceBrand.mockResolvedValue({ state: 'legacy' });
    api.selectWorkspaceRoot.mockResolvedValue('/workspace/legacy');

    const { result } = renderHook(() =>
      useWorkspace(snapshotFor('/workspace/current')),
    );
    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/current');
    expect(result.current.pendingBrandMigration?.rootPath).toBe(
      '/workspace/legacy',
    );

    act(() => {
      result.current.cancelBrandMigration();
    });

    expect(result.current.snapshot?.rootPath).toBe('/workspace/current');
    expect(result.current.pendingBrandMigration).toBeNull();
  });
});

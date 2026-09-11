import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceRefreshQueue } from '../use-workspace-refresh';
import { reconcileWorkspaceDocuments } from '../workspace-refresh';

describe('workspace refresh coordination', () => {
  it('coalesces events arriving during a slow refresh and performs the final rescan', async () => {
    let release!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const queue = createWorkspaceRefreshQueue(run);
    const complete = queue.request({ paths: ['/root/a.md'] });
    await Promise.resolve();
    for (let i = 0; i < 100; i++) void queue.request({ paths: ['/root/b.md'] });
    void queue.request({ full: true });
    release();
    await complete;
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toEqual({ full: true, paths: [], nodes: [] });
  });

  it('a failed refresh does not poison subsequent attempts, and cancellation drops queued work', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(undefined);
    const queue = createWorkspaceRefreshQueue(run);
    await expect(queue.request()).rejects.toThrow('unavailable');
    await queue.request();
    queue.cancel();
    await queue.request();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('captures the latest draft after reads and refreshes background tabs without overwriting an active conflict', async () => {
    const operations: string[] = [];
    const applySessions = vi.fn();
    const synchronizeActive = vi.fn(() => {
      operations.push('compare');
      return 'conflict';
    });
    const failures = await reconcileWorkspaceDocuments({
      paths: [
        '/root/current.md',
        '/root/deep/background.md',
        '/root/missing.md',
      ],
      read: async (path) => {
        operations.push('read');
        if (path.endsWith('missing.md')) throw new Error('gone');
        return { path, content: 'external', modifiedAt: 2 };
      },
      captureDraft: async () => {
        operations.push('capture');
        return true;
      },
      getActivePath: () => '/root/current.md',
      synchronizeActive,
      applySessions,
      isCurrent: () => true,
    });
    expect(operations).toEqual(['read', 'read', 'read', 'capture', 'compare']);
    expect(applySessions).toHaveBeenCalledWith([
      { path: '/root/deep/background.md', content: 'external', modifiedAt: 2 },
    ]);
    expect(failures).toEqual(['/root/missing.md']);
  });

  it('ignores reads that finish after a workspace switch', async () => {
    const applySessions = vi.fn();
    const captureDraft = vi.fn(async () => true);
    let current = true;
    await reconcileWorkspaceDocuments({
      paths: ['/old/note.md'],
      read: async (path) => {
        current = false;
        return { path, content: 'stale', modifiedAt: 1 };
      },
      captureDraft,
      getActivePath: () => '/new/note.md',
      synchronizeActive: vi.fn(),
      applySessions,
      isCurrent: () => current,
    });
    expect(captureDraft).not.toHaveBeenCalled();
    expect(applySessions).not.toHaveBeenCalled();
  });
  it('refreshing an unrelated tab does not consume the active editor autosave timer', async () => {
    const captureDraft = vi.fn(async () => true);
    await reconcileWorkspaceDocuments({
      paths: ['/root/other.md'],
      read: async (path) => ({ path, content: 'external', modifiedAt: 2 }),
      captureDraft,
      getActivePath: () => '/root/current.md',
      synchronizeActive: vi.fn(),
      applySessions: vi.fn(),
      isCurrent: () => true,
    });
    expect(captureDraft).not.toHaveBeenCalled();
  });

});

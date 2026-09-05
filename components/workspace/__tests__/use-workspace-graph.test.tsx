import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspaceGraph } from '../workspace-api';
import { useWorkspaceGraph } from '../use-workspace-graph';
import type { WorkspaceGraphSnapshot } from '../workspace-types';

vi.mock('../workspace-api', () => ({ loadWorkspaceGraph: vi.fn() }));
const snapshot = (fingerprint: string): WorkspaceGraphSnapshot => ({ fingerprint, documentCount: 0, nodes: [], edges: [], warnings: [] });
function deferred() {
  let resolve!: (snapshot: WorkspaceGraphSnapshot) => void;
  const promise = new Promise<WorkspaceGraphSnapshot>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('useWorkspaceGraph', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(loadWorkspaceGraph).mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('coalesces file changes, serializes requests, and rejects an outdated in-flight result', async () => {
    const first = deferred();
    vi.mocked(loadWorkspaceGraph).mockReturnValueOnce(first.promise).mockResolvedValue(snapshot('latest'));
    const { result, rerender } = renderHook(({ revision }) => useWorkspaceGraph('/root', revision), { initialProps: { revision: 0 } });
    rerender({ revision: 1 });
    rerender({ revision: 2 });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(loadWorkspaceGraph).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(snapshot('stale')); await first.promise; });
    expect(loadWorkspaceGraph).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot?.fingerprint).toBe('latest');
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the same snapshot for unchanged relationships and retains it on errors', async () => {
    vi.mocked(loadWorkspaceGraph).mockResolvedValue(snapshot('same'));
    const { result } = renderHook(() => useWorkspaceGraph('/root', 0));
    await act(async () => {});
    const previous = result.current.snapshot;
    await act(async () => result.current.refresh());
    expect(result.current.snapshot).toBe(previous);
    vi.mocked(loadWorkspaceGraph).mockRejectedValueOnce(new Error('read failed'));
    await act(async () => result.current.refresh());
    expect(result.current.snapshot).toBe(previous);
    expect(result.current.error).toBe('read failed');
    await act(async () => result.current.refresh());
    expect(result.current.error).toBeNull();
  });

  it('discards a previous workspace result after switching roots', async () => {
    const old = deferred();
    vi.mocked(loadWorkspaceGraph).mockReturnValueOnce(old.promise).mockResolvedValue(snapshot('new'));
    const { result, rerender } = renderHook(({ root }) => useWorkspaceGraph(root, 0), { initialProps: { root: '/old' } });
    rerender({ root: '/new' });
    await act(async () => {});
    await act(async () => { old.resolve(snapshot('old')); await old.promise; });
    expect(result.current.snapshot?.fingerprint).toBe('new');
  });
});

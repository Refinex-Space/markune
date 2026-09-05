import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceRefresh } from '../use-workspace-refresh';
import type { WorkspaceFileChange } from '../workspace-api';

const api = vi.hoisted(() => ({ watchWorkspace: vi.fn() }));
vi.mock('../workspace-api', () => api);

describe('workspace refresh lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconciles after subscribing, reacts to native events/focus and releases the watcher', async () => {
    const stop = vi.fn(async () => undefined);
    let change!: (event: WorkspaceFileChange) => void;
    api.watchWorkspace.mockImplementation(async (_root, handler) => {
      change = handler;
      return stop;
    });
    const synchronize = vi.fn(async () => undefined);
    const hook = renderHook(() =>
      useWorkspaceRefresh({ rootPath: '/root', enabled: true, synchronize }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(synchronize.mock.calls[0][0]).toMatchObject({ full: true });
    await act(async () => {
      change({
        rootPath: '/root',
        paths: ['/root/deep/note.md'],
        rescan: false,
      });
    });
    expect(synchronize.mock.calls.at(-1)?.[0]).toMatchObject({
      paths: ['/root/deep/note.md'],
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(synchronize.mock.calls.at(-1)?.[0]).toMatchObject({ full: true });
    hook.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('keeps polling and reports degradation when native watching fails', async () => {
    api.watchWorkspace.mockRejectedValue(new Error('no watcher'));
    const synchronize = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useWorkspaceRefresh({ rootPath: '/root', enabled: true, synchronize }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('每 3 秒');
    expect(api.watchWorkspace).toHaveBeenCalledTimes(1);
  });

  it('disposes a late subscription and ignores events from the previous workspace', async () => {
    let complete!: (stop: () => Promise<void>) => void;
    let oldChange!: (event: WorkspaceFileChange) => void;
    const stop = vi.fn(async () => undefined);
    api.watchWorkspace
      .mockImplementationOnce((_root, handler) => {
        oldChange = handler;
        return new Promise((resolve) => {
          complete = resolve;
        });
      })
      .mockResolvedValue(stop);
    const synchronize = vi.fn(async () => undefined);
    const { rerender } = renderHook(
      ({ root }) =>
        useWorkspaceRefresh({ rootPath: root, enabled: true, synchronize }),
      { initialProps: { root: '/old' } },
    );
    rerender({ root: '/new' });
    await act(async () => {
      complete(stop);
    });
    synchronize.mockClear();
    await act(async () => {
      oldChange({ rootPath: '/old', paths: ['/old/note.md'], rescan: false });
    });
    expect(synchronize).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('a lost native watch enters polling and is restarted after the retry interval', async () => {
    const stop = vi.fn(async () => undefined);
    let change!: (event: WorkspaceFileChange) => void;
    api.watchWorkspace.mockImplementation(async (_root, handler) => { change = handler; return stop; });
    const synchronize = vi.fn(async () => undefined);
    const { result } = renderHook(() => useWorkspaceRefresh({ rootPath: '/root', enabled: true, synchronize }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { change({ rootPath: '/root', paths: [], rescan: true, watchError: true }); });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('每 3 秒');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.watchWorkspace).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

});

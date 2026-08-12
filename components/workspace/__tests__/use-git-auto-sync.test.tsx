import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useGitAutoSync,
  type GitAutoSyncReason,
  type UseGitAutoSyncOptions,
} from '../use-git-auto-sync';

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useGitAutoSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('syncs once immediately when it becomes enabled', async () => {
    const runSync = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useGitAutoSync({
        activationKey: 'root',
        enabled: true,
        intervalMs: 0,
        runSync,
      }),
    );
    await flushMicrotasks();

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runSync).toHaveBeenCalledWith<[GitAutoSyncReason]>('activate');
  });

  it('does not sync while disabled', async () => {
    const runSync = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useGitAutoSync({
        activationKey: 'root',
        enabled: false,
        intervalMs: 1_000,
        runSync,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();

    expect(runSync).not.toHaveBeenCalled();
  });

  it('keeps the interval running even when runSync identity churns every render', async () => {
    // Regression guard for the original bug: the scheduler effect depended on
    // the (per-render) sync callback, so any re-render cleared and re-armed the
    // timeout, and it practically never fired during active use.
    const calls: GitAutoSyncReason[] = [];
    const makeRunSync = () =>
      vi.fn(async (reason: GitAutoSyncReason) => {
        calls.push(reason);
      });

    const { rerender } = renderHook(
      (props: UseGitAutoSyncOptions) => useGitAutoSync(props),
      {
        initialProps: {
          activationKey: 'root',
          enabled: true,
          intervalMs: 1_000,
          runSync: makeRunSync(),
          syncOnActivate: false,
        } satisfies UseGitAutoSyncOptions,
      },
    );

    // Re-render five times with a brand-new runSync each time, advancing well
    // under the interval between renders. A reset-on-render scheduler would
    // never reach 1_000ms.
    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      rerender({
        activationKey: 'root',
        enabled: true,
        intervalMs: 1_000,
        runSync: makeRunSync(),
        syncOnActivate: false,
      });
    }

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await flushMicrotasks();

    expect(calls).toEqual(['interval']);
  });

  it('serializes triggers behind an in-flight guard', async () => {
    let resolveActive: (() => void) | null = null;
    const runSync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveActive = resolve;
        }),
    );

    renderHook(() =>
      useGitAutoSync({
        activationKey: 'root',
        enabled: true,
        focusDebounceMs: 0,
        intervalMs: 1_000,
        runSync,
      }),
    );
    await flushMicrotasks();

    // activate started and is still pending; interval + focus must be ignored.
    expect(runSync).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();
    expect(runSync).toHaveBeenCalledTimes(1);

    // Once the active run settles, later triggers are allowed again.
    await act(async () => {
      resolveActive?.();
      await Promise.resolve();
    });
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  it('debounces refocus syncs', async () => {
    const runSync = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useGitAutoSync({
        activationKey: 'root',
        enabled: true,
        focusDebounceMs: 1_000,
        intervalMs: 0,
        runSync,
      }),
    );
    await flushMicrotasks();
    expect(runSync).toHaveBeenCalledTimes(1); // activate at t=0

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();
    expect(runSync).toHaveBeenCalledTimes(1); // within debounce window

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();
    expect(runSync).toHaveBeenCalledTimes(2);
    expect(runSync).toHaveBeenLastCalledWith<[GitAutoSyncReason]>('visible');
  });
});

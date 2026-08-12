import { describe, expect, it, vi } from 'vitest';

import { waitForDocumentPathLoaded } from '../document-open-ready';
import type { DocumentLoadState } from '../workspace-types';

describe('waitForDocumentPathLoaded', () => {
  it('在加载完成后返回 true', async () => {
    const pathRef = { current: '/workspace/Test.md' as string | null };
    const loadStateRef = {
      current: 'loading' as DocumentLoadState,
    };

    vi.useFakeTimers();
    const pending = waitForDocumentPathLoaded(
      pathRef,
      loadStateRef,
      '/workspace/Test.md',
      1_000,
    );

    await vi.advanceTimersByTimeAsync(32);
    loadStateRef.current = 'loaded';
    await vi.advanceTimersByTimeAsync(32);

    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('路径中途被切换时返回 false', async () => {
    const pathRef = { current: '/workspace/Test.md' as string | null };
    const loadStateRef = {
      current: 'loading' as DocumentLoadState,
    };

    vi.useFakeTimers();
    const pending = waitForDocumentPathLoaded(
      pathRef,
      loadStateRef,
      '/workspace/Test.md',
      1_000,
    );

    await vi.advanceTimersByTimeAsync(32);
    pathRef.current = '/workspace/Other.md';
    await vi.advanceTimersByTimeAsync(32);

    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('加载失败时返回 false', async () => {
    const pathRef = { current: '/workspace/Test.md' as string | null };
    const loadStateRef = {
      current: 'loading' as DocumentLoadState,
    };

    vi.useFakeTimers();
    const pending = waitForDocumentPathLoaded(
      pathRef,
      loadStateRef,
      '/workspace/Test.md',
      1_000,
    );

    await vi.advanceTimersByTimeAsync(32);
    loadStateRef.current = 'error';
    await vi.advanceTimersByTimeAsync(32);

    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});

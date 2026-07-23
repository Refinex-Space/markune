import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdate } from '../use-app-update';

const workspaceApiState = vi.hoisted(() => ({
  checkAppUpdate: vi.fn(),
  getMadoraVersion: vi.fn(),
  installAppUpdate: vi.fn(),
  isTauriRuntime: vi.fn(),
  restartAppAfterUpdate: vi.fn(),
}));

vi.mock('../workspace-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workspace-api')>()),
  checkAppUpdate: workspaceApiState.checkAppUpdate,
  getMadoraVersion: workspaceApiState.getMadoraVersion,
  installAppUpdate: workspaceApiState.installAppUpdate,
  isTauriRuntime: workspaceApiState.isTauriRuntime,
  restartAppAfterUpdate: workspaceApiState.restartAppAfterUpdate,
}));

const availableUpdate = {
  body: '修复稳定性问题。',
  currentVersion: '0.1.6',
  date: Date.UTC(2026, 6, 23, 8),
  version: '0.1.7',
};

describe('useAppUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceApiState.isTauriRuntime.mockReturnValue(true);
    workspaceApiState.getMadoraVersion.mockResolvedValue('0.1.6');
    workspaceApiState.checkAppUpdate.mockResolvedValue({
      currentVersion: '0.1.6',
      update: availableUpdate,
    });
    workspaceApiState.installAppUpdate.mockResolvedValue(undefined);
    workspaceApiState.restartAppAfterUpdate.mockResolvedValue(undefined);
  });

  it('checks manually and exposes the available release metadata', async () => {
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: null }),
    );

    await act(async () => result.current.check());

    expect(result.current.phase).toBe('available');
    expect(result.current.currentVersion).toBe('0.1.6');
    expect(result.current.update).toEqual(availableUpdate);
    expect(workspaceApiState.checkAppUpdate).toHaveBeenCalledTimes(1);
  });

  it('reports an up-to-date result without leaving stale update metadata', async () => {
    workspaceApiState.checkAppUpdate.mockResolvedValueOnce({
      currentVersion: '0.1.6',
      update: null,
    });
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: null }),
    );

    await act(async () => result.current.check());

    expect(result.current.phase).toBe('up-to-date');
    expect(result.current.update).toBeNull();
  });

  it('clears a stale pending release when a later check fails', async () => {
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: null }),
    );
    await act(async () => result.current.check());
    workspaceApiState.checkAppUpdate.mockRejectedValueOnce(
      new Error('无法连接更新服务，请检查网络后重试。'),
    );

    await act(async () => result.current.check());

    expect(result.current.phase).toBe('error');
    expect(result.current.update).toBeNull();
  });

  it('streams download progress and waits for an explicit restart', async () => {
    workspaceApiState.installAppUpdate.mockImplementationOnce(
      async (onEvent: (event: unknown) => void) => {
        onEvent({ event: 'started', data: { contentLength: 100 } });
        onEvent({ event: 'progress', data: { chunkLength: 40 } });
        onEvent({ event: 'progress', data: { chunkLength: 60 } });
        onEvent({ event: 'finished' });
      },
    );
    const onBeforeInstall = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: null, onBeforeInstall }),
    );

    await act(async () => result.current.check());
    await act(async () => result.current.install());

    expect(onBeforeInstall).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('ready-to-restart');
    expect(result.current.downloadedBytes).toBe(100);
    expect(result.current.totalBytes).toBe(100);
  });

  it('does not start downloading when the pre-install save is cancelled', async () => {
    const onBeforeInstall = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: null, onBeforeInstall }),
    );

    await act(async () => result.current.check());
    await act(async () => result.current.install());

    expect(result.current.phase).toBe('available');
    expect(workspaceApiState.installAppUpdate).not.toHaveBeenCalled();
  });

  it('checks automatically after the configured startup delay', async () => {
    const { result } = renderHook(() =>
      useAppUpdate({ autoCheckDelayMs: 0, recheckIntervalMs: null }),
    );

    await waitFor(() => expect(result.current.phase).toBe('available'));

    expect(workspaceApiState.checkAppUpdate).toHaveBeenCalledTimes(1);
  });
});

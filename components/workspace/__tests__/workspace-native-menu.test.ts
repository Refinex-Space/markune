import { describe, expect, it, vi } from 'vitest';

import {
  CHECK_UPDATE_EVENT,
  OPEN_SETTINGS_EVENT,
  subscribeToNativeSettingsOpen,
  subscribeToNativeUpdateCheck,
} from '../workspace-native-menu';

describe('native settings menu subscription', () => {
  it('opens settings when the native menu event arrives', async () => {
    let handler: (() => void) | null = null;
    const unlisten = vi.fn();
    const listen = vi.fn(async (event: string, nextHandler: () => void) => {
      expect(event).toBe(OPEN_SETTINGS_EVENT);
      handler = nextHandler;
      return unlisten;
    });
    const onOpenSettings = vi.fn();

    const dispose = subscribeToNativeSettingsOpen(listen, onOpenSettings, vi.fn());
    await vi.waitFor(() => expect(handler).not.toBeNull());
    handler?.();

    expect(onOpenSettings).toHaveBeenCalledOnce();
    dispose();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('unsubscribes when registration finishes after disposal', async () => {
    let resolveListener: ((unlisten: () => void) => void) | null = null;
    const unlisten = vi.fn();
    const listen = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListener = resolve;
        }),
    );

    const dispose = subscribeToNativeSettingsOpen(listen, vi.fn(), vi.fn());
    dispose();
    resolveListener?.(unlisten);

    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  });

  it('checks for updates when the native menu event arrives', async () => {
    let handler: (() => void) | null = null;
    const listen = vi.fn(async (event: string, nextHandler: () => void) => {
      expect(event).toBe(CHECK_UPDATE_EVENT);
      handler = nextHandler;
      return vi.fn();
    });
    const onCheckUpdate = vi.fn();

    subscribeToNativeUpdateCheck(listen, onCheckUpdate, vi.fn());
    await vi.waitFor(() => expect(handler).not.toBeNull());
    handler?.();

    expect(onCheckUpdate).toHaveBeenCalledOnce();
  });
});

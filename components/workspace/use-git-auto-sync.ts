'use client';

import * as React from 'react';

export type GitAutoSyncReason = 'activate' | 'interval' | 'visible';

export interface UseGitAutoSyncOptions {
  /**
   * Whether auto-sync should run at all. Compose upstream from
   * `settings.enabled && hasRemote && isTauriRuntime && workspaceRoot`.
   */
  enabled: boolean;
  /** Periodic cadence in milliseconds. `<= 0` disables the interval trigger. */
  intervalMs: number;
  /**
   * Performs one sync. Its identity is allowed to change on every render; the
   * hook always calls the latest version through a ref, so an unstable callback
   * never re-arms the timers (the old effect reset its timeout on every render
   * and therefore practically never fired during active use). author: liyao
   */
  runSync: (reason: GitAutoSyncReason) => Promise<void>;
  /**
   * Ignore focus/visibility triggers that arrive within this window after the
   * previous run started, so tabbing in and out does not spam git. Defaults to
   * 30s.
   */
  focusDebounceMs?: number;
  /** Run once immediately when the hook becomes enabled. Defaults to true. */
  syncOnActivate?: boolean;
  /**
   * Identity of the sync target (e.g. workspace root). Changing it while enabled
   * re-arms the activation sync so switching workspaces pulls immediately.
   */
  activationKey?: string | null;
}

const DEFAULT_FOCUS_DEBOUNCE_MS = 30_000;

/**
 * Owns the Git auto-sync triggers (startup, periodic, and refocus) behind a
 * single in-flight guard so overlapping timers or focus events never spawn
 * concurrent git processes. Every git call itself runs off the main thread in
 * the Rust backend; this hook only schedules them. author: liyao
 */
export function useGitAutoSync({
  enabled,
  intervalMs,
  runSync,
  focusDebounceMs = DEFAULT_FOCUS_DEBOUNCE_MS,
  syncOnActivate = true,
  activationKey = null,
}: UseGitAutoSyncOptions): void {
  const runSyncRef = React.useRef(runSync);
  const runningRef = React.useRef(false);
  const lastRunAtRef = React.useRef(0);

  // Keep the ref pointing at the latest callback without re-arming the timers.
  React.useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  const run = React.useCallback(async (reason: GitAutoSyncReason) => {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;
    lastRunAtRef.current = Date.now();

    try {
      await runSyncRef.current(reason);
    } finally {
      runningRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let disposed = false;
    const trigger = (reason: GitAutoSyncReason) => {
      if (disposed) {
        return;
      }
      void run(reason);
    };

    if (syncOnActivate) {
      trigger('activate');
    }

    const intervalId =
      intervalMs > 0
        ? window.setInterval(() => trigger('interval'), intervalMs)
        : null;

    const maybeSyncOnFocus = () => {
      if (Date.now() - lastRunAtRef.current >= focusDebounceMs) {
        trigger('visible');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeSyncOnFocus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', maybeSyncOnFocus);

    return () => {
      disposed = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', maybeSyncOnFocus);
    };
  }, [
    enabled,
    intervalMs,
    focusDebounceMs,
    syncOnActivate,
    activationKey,
    run,
  ]);
}

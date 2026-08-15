'use client';

import * as React from 'react';

import {
  checkAppUpdate,
  getMarkuneVersion,
  installAppUpdate,
  isTauriRuntime,
  restartAppAfterUpdate,
} from './workspace-api';
import type {
  AppUpdateDownloadEvent,
  AppUpdateRelease,
} from './workspace-types';

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'ready-to-restart'
  | 'error';

export interface AppUpdateController {
  available: boolean;
  check: () => Promise<void>;
  currentVersion: string | null;
  downloadedBytes: number;
  error: string | null;
  install: () => Promise<void>;
  lastCheckedAt: number | null;
  phase: AppUpdatePhase;
  restart: () => Promise<void>;
  totalBytes: number | null;
  update: AppUpdateRelease | null;
}

interface UseAppUpdateOptions {
  autoCheckDelayMs?: number | null;
  onBeforeInstall?: () => Promise<boolean>;
  recheckIntervalMs?: number | null;
}

interface AppUpdateState {
  currentVersion: string | null;
  downloadedBytes: number;
  error: string | null;
  lastCheckedAt: number | null;
  phase: AppUpdatePhase;
  totalBytes: number | null;
  update: AppUpdateRelease | null;
}

const DEFAULT_AUTO_CHECK_DELAY_MS = 5_000;
const DEFAULT_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

const INITIAL_STATE: AppUpdateState = {
  currentVersion: null,
  downloadedBytes: 0,
  error: null,
  lastCheckedAt: null,
  phase: 'idle',
  totalBytes: null,
  update: null,
};

export function useAppUpdate({
  autoCheckDelayMs = DEFAULT_AUTO_CHECK_DELAY_MS,
  onBeforeInstall,
  recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
}: UseAppUpdateOptions = {}): AppUpdateController {
  const [state, setState] = React.useState<AppUpdateState>(INITIAL_STATE);
  const stateRef = React.useRef(state);
  const checkInFlightRef = React.useRef<Promise<void> | null>(null);
  const installInFlightRef = React.useRef<Promise<void> | null>(null);

  const updateState = React.useCallback(
    (update: (current: AppUpdateState) => AppUpdateState) => {
      setState((current) => {
        const next = update(current);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    void getMarkuneVersion()
      .then((version) => {
        if (cancelled) return;
        updateState((current) => ({ ...current, currentVersion: version }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [updateState]);

  const check = React.useCallback(() => {
    if (!isTauriRuntime()) return Promise.resolve();
    if (checkInFlightRef.current) return checkInFlightRef.current;

    updateState((current) => ({
      ...current,
      error: null,
      phase: 'checking',
    }));

    const request = checkAppUpdate()
      .then((result) => {
        updateState((current) => ({
          ...current,
          currentVersion: result.currentVersion,
          downloadedBytes: 0,
          error: null,
          lastCheckedAt: Date.now(),
          phase: result.update ? 'available' : 'up-to-date',
          totalBytes: null,
          update: result.update,
        }));
      })
      .catch((reason) => {
        updateState((current) => ({
          ...current,
          error:
            reason instanceof Error ? reason.message : '检查更新失败，请稍后重试。',
          lastCheckedAt: Date.now(),
          phase: 'error',
          update: null,
        }));
      })
      .finally(() => {
        checkInFlightRef.current = null;
      });

    checkInFlightRef.current = request;
    return request;
  }, [updateState]);

  React.useEffect(() => {
    if (!isTauriRuntime() || autoCheckDelayMs === null) return;

    const timeout = window.setTimeout(() => void check(), autoCheckDelayMs);
    const interval =
      recheckIntervalMs === null
        ? null
        : window.setInterval(() => void check(), recheckIntervalMs);

    return () => {
      window.clearTimeout(timeout);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [autoCheckDelayMs, check, recheckIntervalMs]);

  const handleDownloadEvent = React.useCallback(
    (event: AppUpdateDownloadEvent) => {
      updateState((current) => {
        if (event.event === 'started') {
          return {
            ...current,
            downloadedBytes: 0,
            phase: 'downloading',
            totalBytes: event.data.contentLength,
          };
        }
        if (event.event === 'progress') {
          return {
            ...current,
            downloadedBytes:
              current.downloadedBytes + event.data.chunkLength,
            phase: 'downloading',
          };
        }
        return { ...current, phase: 'installing' };
      });
    },
    [updateState],
  );

  const install = React.useCallback(() => {
    if (installInFlightRef.current) return installInFlightRef.current;
    if (!stateRef.current.update) return Promise.resolve();

    const request = (async () => {
      try {
        if (onBeforeInstall && !(await onBeforeInstall())) return;

        updateState((current) => ({
          ...current,
          downloadedBytes: 0,
          error: null,
          phase: 'downloading',
          totalBytes: null,
        }));

        await installAppUpdate(handleDownloadEvent);
        updateState((current) => ({
          ...current,
          error: null,
          phase: 'ready-to-restart',
        }));
      } catch (reason) {
        updateState((current) => ({
          ...current,
          error:
            reason instanceof Error
              ? reason.message
              : '保存、下载或安装更新失败，请重新检查后再试。',
          phase: current.update ? 'available' : 'error',
        }));
      }
    })().finally(() => {
      installInFlightRef.current = null;
    });

    installInFlightRef.current = request;
    return request;
  }, [handleDownloadEvent, onBeforeInstall, updateState]);

  const restart = React.useCallback(async () => {
    if (stateRef.current.phase !== 'ready-to-restart') return;
    await restartAppAfterUpdate();
  }, []);

  return {
    ...state,
    available: state.update !== null,
    check,
    install,
    restart,
  };
}

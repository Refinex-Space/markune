'use client';

import * as React from 'react';
import { watchWorkspace } from './workspace-api';
import type { WorkspaceNode } from './workspace-types';

export interface WorkspaceRefreshRequest {
  full: boolean;
  paths: string[];
  nodes: WorkspaceNode[];
}

// Coalesce bursts while one disk reconciliation is in flight. author: refinex
export function createWorkspaceRefreshQueue(
  run: (request: WorkspaceRefreshRequest) => Promise<void>,
) {
  let pending: WorkspaceRefreshRequest | null = null;
  let running: Promise<void> | null = null;
  let cancelled = false;
  function request(
    input: Partial<WorkspaceRefreshRequest> = { full: true },
  ): Promise<void> {
    if (cancelled) return Promise.resolve();
    const paths = [
      ...new Set([...(pending?.paths ?? []), ...(input.paths ?? [])]),
    ];
    const nodes = [
      ...new Map(
        [...(pending?.nodes ?? []), ...(input.nodes ?? [])].map((node) => [
          node.absolutePath,
          node,
        ]),
      ).values(),
    ];
    const full = Boolean(
      pending?.full || input.full || paths.length + nodes.length > 512,
    );
    pending = { full, paths: full ? [] : paths, nodes: full ? [] : nodes };
    if (!running) {
      running = Promise.resolve()
        .then(async () => {
          let failure: unknown;
          while (pending && !cancelled) {
            const next = pending;
            pending = null;
            try {
              await run(next);
            } catch (error) {
              failure = error;
            }
          }
          if (failure) throw failure;
        })
        .finally(() => {
          running = null;
        });
    }
    return running;
  }
  return {
    request,
    cancel: () => {
      cancelled = true;
      pending = null;
    },
  };
}

export function useWorkspaceRefresh({
  rootPath,
  enabled,
  synchronize,
}: {
  rootPath: string | null;
  enabled: boolean;
  synchronize: (
    request: WorkspaceRefreshRequest,
    isCurrent: () => boolean,
  ) => Promise<void>;
}) {
  const synchronizeRef = React.useRef(synchronize);
  const [error, setError] = React.useState<string | null>(null);
  const queueRef = React.useRef<ReturnType<
    typeof createWorkspaceRefreshQueue
  > | null>(null);
  React.useLayoutEffect(() => {
    synchronizeRef.current = synchronize;
  }, [synchronize]);

  React.useEffect(() => {
    if (!rootPath) return;
    let disposed = false;
    let stop: (() => Promise<void>) | undefined;
    let watchHealthy = false;
    let starting = false;
    let lastFullCheck = Date.now();
    let lastStart = 0;
    const isCurrent = () => !disposed;
    const queue = createWorkspaceRefreshQueue(async (request) => {
      try {
        await synchronizeRef.current(request, isCurrent);
        if (!disposed)
          setError(
            enabled && !watchHealthy
              ? '实时监听暂不可用，正在每 3 秒复核工作区'
              : null,
          );
      } catch (failure) {
        if (!disposed)
          setError(
            failure instanceof Error
              ? failure.message
              : '工作区刷新失败，请重试',
          );
        throw failure;
      }
    });
    queueRef.current = queue;
    const refresh = () => {
      void queue.request().catch(() => undefined);
    };
    const start = async () => {
      if (disposed || starting || watchHealthy) return;
      starting = true;
      lastStart = Date.now();
      let failedDuringStart = false;
      try {
        const unwatch = await watchWorkspace(rootPath, (event) => {
          if (disposed || event.rootPath !== rootPath) return;
          if (event.watchError) {
            failedDuringStart = true;
            watchHealthy = false;
            void stop?.().catch(() => undefined);
            stop = undefined;
            setError('实时监听暂不可用，正在每 3 秒复核工作区');
          }
          void queue
            .request({ full: event.rescan, paths: event.paths })
            .catch(() => undefined);
        });
        if (disposed || failedDuringStart) {
          await unwatch();
          return;
        }
        stop = unwatch;
        watchHealthy = true;
        refresh();
      } catch {
        if (!disposed) setError('实时监听暂不可用，正在每 3 秒复核工作区');
      } finally {
        starting = false;
      }
    };
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    if (enabled) {
      void start();
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
      timer = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        if (!watchHealthy || Date.now() - lastFullCheck >= 30_000) {
          lastFullCheck = Date.now();
          refresh();
        }
        if (!watchHealthy && Date.now() - lastStart >= 30_000) void start();
      }, 3_000);
    }
    return () => {
      disposed = true;
      queue.cancel();
      if (queueRef.current === queue) queueRef.current = null;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void stop?.().catch(() => undefined);
    };
  }, [enabled, rootPath]);

  return {
    error,
    refreshPaths: React.useCallback(
      (paths: string[]) =>
        queueRef.current?.request({ paths }) ?? Promise.resolve(),
      [],
    ),
    refresh: React.useCallback(
      (node?: WorkspaceNode) =>
        queueRef.current?.request(node ? { nodes: [node] } : { full: true }) ??
        Promise.resolve(),
      [],
    ),
  };
}

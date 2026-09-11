'use client';

import * as React from 'react';
import { loadWorkspaceGraph } from './workspace-api';
import type { WorkspaceGraphSnapshot } from './workspace-types';

export function useWorkspaceGraph(rootPath: string, revision: number) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceGraphSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const requestRef = React.useRef<() => void>(() => undefined);
  const [lastRoot, setLastRoot] = React.useState(rootPath);
  if (lastRoot !== rootPath) {
    setLastRoot(rootPath);
    setSnapshot(null);
    setError(null);
    setIsLoading(true);
    setIsRefreshing(false);
  }

  React.useEffect(() => {
    let active = true;
    let running = false;
    let pending = false;
    let loaded = false;
    async function request() {
      pending = true;
      if (running) return;
      running = true;
      setIsLoading(!loaded);
      setIsRefreshing(loaded);
      while (active && pending) {
        pending = false;
        try {
          const next = await loadWorkspaceGraph(rootPath);
          if (!active || pending) continue;
          setSnapshot((current) => current?.fingerprint && current.fingerprint === next.fingerprint ? current : next);
          setError(null);
          loaded = true;
        } catch (cause) {
          if (active && !pending) setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
      running = false;
      if (active) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
    requestRef.current = () => void request();
    void request();
    return () => { active = false; requestRef.current = () => undefined; };
  }, [rootPath]);

  const lastRevision = React.useRef(revision);
  React.useEffect(() => {
    if (lastRevision.current === revision) return;
    const timer = window.setTimeout(() => {
      lastRevision.current = revision;
      requestRef.current();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [revision, rootPath]);

  const refresh = React.useCallback(() => requestRef.current(), []);
  return { snapshot, error, isLoading, isRefreshing, refresh };
}

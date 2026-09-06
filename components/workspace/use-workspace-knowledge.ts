'use client';
import * as React from 'react';
import { loadDrawingLibrary, loadWorkspaceIndex } from './workspace-api';
import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  updateWorkspaceSearchIndex,
  type WorkspaceGlobalSearchResult,
  type WorkspaceSearchDocument,
} from './workspace-global-search';
import type {
  KnowledgeDocument,
  KnowledgeDocumentSummary,
} from './workspace-knowledge-types';

interface KnowledgeState {
  rootPath: string | null;
  revision: number;
  documents: KnowledgeDocumentSummary[];
  warnings: string[];
  status: 'idle' | 'indexing' | 'ready' | 'error';
  error: string | null;
  indexed: number;
  total: number;
}

export function useWorkspaceKnowledge(
  rootPath: string | null,
  changeRevision: number,
  enabled: boolean,
) {
  const [state, setState] = React.useState<KnowledgeState>({
    rootPath: null,
    revision: 0,
    documents: [],
    warnings: [],
    status: 'idle',
    error: null,
    indexed: 0,
    total: 0,
  });
  const workerRef = React.useRef<Worker | null>(null);
  const fallbackRef = React.useRef(buildWorkspaceSearchIndex([]));
  const requestRef = React.useRef(0);
  const pendingSearches = React.useRef(
    new Map<
      number,
      {
        resolve: (results: WorkspaceGlobalSearchResult[]) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const refreshRef = React.useRef<(force?: boolean) => Promise<void>>(
    async () => {},
  );
  const previousRevision = React.useRef(changeRevision);
  const runningRef = React.useRef<Promise<void> | null>(null);
  const readyRootRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !rootPath) return;
    readyRootRef.current = null;
    let active = true;
    let revision = 0;
    let summaries = new Map<string, KnowledgeDocumentSummary>();
    let running: Promise<void> | null = null;
    let queued = false;
    let forceQueued = false;
    let failedIndex = false;
    let drawingIds = new Set<string>();
    let worker: Worker | null = null;
    try {
      if (typeof Worker !== 'undefined')
        worker = new Worker(
          new URL('./workspace-search-worker.ts', import.meta.url),
        );
    } catch {
      /* The same index can run locally if a Worker is unavailable. author: refinex */
    }
    workerRef.current = worker;
    fallbackRef.current = buildWorkspaceSearchIndex([]);
    if (worker)
      worker.onmessage = (
        event: MessageEvent<{
          type: string;
          rootPath: string;
          requestId: number;
          results: WorkspaceGlobalSearchResult[];
          revision?: number;
          limitedCount?: number;
        }>,
      ) => {
        if (!active || event.data.rootPath !== rootPath) return;
        if (event.data.type === 'indexed') {
          if (event.data.limitedCount)
            setState((current) =>
              current.revision === event.data.revision
                ? {
                    ...current,
                    warnings: [
                      ...current.warnings,
                      searchBudgetWarning(event.data.limitedCount!),
                    ],
                  }
                : current,
            );
          return;
        }
        if (event.data.type !== 'results') return;
        const pending = pendingSearches.current.get(event.data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingSearches.current.delete(event.data.requestId);
          pending.resolve(event.data.results);
        }
      };
    const upsert = (
      documents: WorkspaceSearchDocument[],
      removed: string[],
    ) => {
      if (worker)
        worker.postMessage({ type: 'upsert', rootPath, documents, removed });
      else updateWorkspaceSearchIndex(fallbackRef.current, documents, removed);
    };
    const request = (force = false): Promise<void> => {
      queued = true;
      forceQueued ||= force;
      if (running) return running;
      running = Promise.resolve()
        .then(async () => {
          while (active && queued) {
            queued = false;
            const force = forceQueued;
            forceQueued = false;
            setState((current) => ({
              ...current,
              ...(current.rootPath !== rootPath
                ? { documents: [], warnings: [], revision: 0, total: 0 }
                : {}),
              rootPath,
              status: 'indexing',
              error: null,
              indexed: 0,
            }));
            try {
              readyRootRef.current = null;
              const since = revision && !failedIndex ? revision : undefined;
              let cursor: number | undefined;
              let snapshotRevision: number | undefined;
              let next = new Map(summaries);
              let indexed = 0;
              let warnings: string[] = [];
              do {
                const page = await loadWorkspaceIndex(rootPath, {
                  sinceRevision: since,
                  cursor,
                  snapshotRevision,
                  force: cursor === undefined && force,
                });
                if (!active) return;
                if (cursor === undefined) {
                  if (page.reset) {
                    next = new Map();
                    drawingIds = new Set();
                  }
                  if (worker)
                    worker.postMessage({
                      type: 'begin',
                      rootPath,
                      reset: page.reset,
                    });
                  else if (page.reset)
                    fallbackRef.current = buildWorkspaceSearchIndex([]);
                }
                upsert(
                  page.documents.map((document) =>
                    toSearchDocument(rootPath, document),
                  ),
                  page.removed,
                );
                for (const path of page.removed) next.delete(path);
                for (const document of page.documents) {
                  const { content: _content, ...summary } = document;
                  void _content;
                  next.set(summary.relativePath, summary);
                }
                indexed += page.documents.length;
                warnings = page.warnings;
                setState((current) => ({
                  ...current,
                  indexed,
                  total: page.total,
                }));
                snapshotRevision = page.revision;
                cursor = page.nextCursor ?? undefined;
              } while (cursor !== undefined);
              try {
                const library = await loadDrawingLibrary(rootPath);
                if (!active) return;
                const drawings: WorkspaceSearchDocument[] =
                  library.drawings.map((drawing) => ({
                    id: `drawing:${drawing.id}`,
                    drawingId: drawing.id,
                    kind: 'drawing',
                    name: drawing.title,
                    title: drawing.title,
                    relativePath: drawing.albumPath || '未归类',
                    absolutePath: '',
                    content: drawing.searchText,
                  }));
                const ids = new Set(drawings.map((drawing) => drawing.id));
                upsert(
                  drawings,
                  [...drawingIds].filter((id) => !ids.has(id)),
                );
                drawingIds = ids;
              } catch {
                /* A drawing failure does not discard the document index. author: refinex */
              }
              if (!active) return;
              if (!worker && fallbackRef.current.limited.size)
                warnings.push(
                  searchBudgetWarning(fallbackRef.current.limited.size),
                );
              revision = snapshotRevision ?? revision;
              summaries = next;
              failedIndex = false;
              readyRootRef.current = rootPath;
              if (worker)
                worker.postMessage({ type: 'commit', rootPath, revision });
              setState({
                rootPath,
                revision,
                documents: [...summaries.values()],
                warnings,
                status: 'ready',
                error: null,
                indexed: summaries.size,
                total: summaries.size,
              });
            } catch (error) {
              failedIndex = true;
              if (active) {
                if (worker)
                  worker.postMessage({ type: 'commit', rootPath, revision });
                setState((current) => ({
                  ...current,
                  rootPath,
                  status: 'error',
                  error: error instanceof Error ? error.message : String(error),
                }));
              }
            }
          }
        })
        .finally(() => {
          if (runningRef.current === running) runningRef.current = null;
          running = null;
        });
      runningRef.current = running;
      return running;
    };
    refreshRef.current = request;
    if (worker)
      worker.onerror = () => {
        if (!active) return;
        worker?.terminate();
        worker = null;
        workerRef.current = null;
        failedIndex = true;
        revision = 0;
        readyRootRef.current = null;
        fallbackRef.current = buildWorkspaceSearchIndex([]);
        void request(true);
      };
    void request();
    const pending = pendingSearches.current;
    return () => {
      active = false;
      worker?.terminate();
      readyRootRef.current = null;
      if (runningRef.current === running) runningRef.current = null;
      if (workerRef.current === worker) workerRef.current = null;
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve([]);
      }
      pending.clear();
      refreshRef.current = async () => {};
    };
  }, [enabled, rootPath]);

  React.useEffect(() => {
    if (previousRevision.current === changeRevision) return;
    const timer = setTimeout(() => {
      previousRevision.current = changeRevision;
      void refreshRef.current();
    }, 200);
    return () => clearTimeout(timer);
  }, [changeRevision]);

  const refresh = React.useCallback(
    (force = false) => refreshRef.current(force),
    [],
  );
  const search = React.useCallback(
    async (
      query: string,
      limit = 20,
    ): Promise<WorkspaceGlobalSearchResult[]> => {
      if (!rootPath) return [];
      if (runningRef.current) await runningRef.current;
      if (readyRootRef.current !== rootPath) return [];
      const worker = workerRef.current;
      if (!worker)
        return searchWorkspaceIndex(fallbackRef.current, query, limit).map(
          (result) => ({
            ...result,
            document: { ...result.document, content: '' },
          }),
        );
      const requestId = ++requestRef.current;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingSearches.current.delete(requestId);
          resolve([]);
        }, 20_000);
        pendingSearches.current.set(requestId, { resolve, timer });
        worker.postMessage({
          type: 'search',
          rootPath,
          requestId,
          query,
          limit,
        });
      });
    },
    [rootPath],
  );
  return {
    ...state,
    documents: state.rootPath === rootPath ? state.documents : [],
    status: state.rootPath === rootPath ? state.status : ('idle' as const),
    refresh,
    search,
  };
}

function toSearchDocument(
  root: string,
  document: KnowledgeDocument,
): WorkspaceSearchDocument {
  return {
    ...document,
    id: document.relativePath,
    kind: 'document',
    absolutePath: `${root.replace(/[\\/]$/, '')}/${document.relativePath}`,
  };
}

export type WorkspaceKnowledge = ReturnType<typeof useWorkspaceKnowledge>;

function searchBudgetWarning(count: number) {
  return `${count} 篇笔记超过正文检索预算，当前仅检索其标题、路径与属性；减少工作区内容后可重新刷新索引。`;
}

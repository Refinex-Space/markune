'use client';

import * as React from 'react';

import {
  beginDrawingSave,
  cancelDrawingSave,
  commitDrawingSave,
  createDrawing,
  createDrawingAlbum,
  createDrawingMarkdownSnapshot,
  deleteDrawingAlbum,
  duplicateDrawing,
  duplicateDrawingAlbum,
  importDrawingFromGrant,
  importDrawingLibraryFromGrant,
  isTauriRuntime,
  loadDrawingLibrary,
  moveDrawing,
  moveDrawingAlbum,
  permanentlyDeleteDrawing,
  permanentlyDeleteDrawingAlbum,
  readDrawingLibrary,
  readDrawingMeta,
  readDrawingScene,
  readDrawingUiState,
  releaseDrawingImportGrant,
  renameDrawing,
  renameDrawingAlbum,
  restoreDrawing,
  restoreDrawingAlbum,
  selectDrawingImportSources,
  stageDrawingPreview,
  stageDrawingScene,
  trashDrawing,
  trashDrawingAlbum,
  writeDrawingLibrary,
  writeDrawingUiState,
} from './workspace-api';
import type {
  DrawingCollection,
  DrawingDocumentDescriptor,
  DrawingLibrarySnapshot,
  DrawingSaveManifest,
  DrawingSaveState,
  DrawingSummary,
  DrawingUiState,
  DrawingViewport,
} from './workspace-types';

export type DrawingSelection =
  | { kind: 'collection'; collection: DrawingCollection }
  | { kind: 'album'; path: string }
  | { kind: 'drawing'; id: string };

export interface DrawingSavePayload {
  manifest: DrawingSaveManifest;
  preview: Uint8Array | null;
  scene: Uint8Array;
}

export type DrawingActionCommand =
  | { kind: 'copy-markdown' }
  | { format: 'excalidraw' | 'png' | 'svg'; kind: 'export' };

export type DrawingActionRequest = DrawingActionCommand & {
  drawingId: string;
  requestId: number;
};

const EMPTY_LIBRARY: DrawingLibrarySnapshot = {
  albums: [],
  drawings: [],
  issues: [],
  trash: [],
  trashAlbums: [],
};
const EMPTY_UI_STATE: DrawingUiState = {
  recentDrawingIds: [],
  schemaVersion: 1,
  viewports: {},
};

export function useDrawingController({
  active,
  rootPath,
}: {
  active: boolean;
  rootPath: string | null;
}) {
  const [snapshot, setSnapshot] = React.useState(EMPTY_LIBRARY);
  const [selection, setSelection] = React.useState<DrawingSelection>({
    collection: 'all',
    kind: 'collection',
  });
  const [query, setQuery] = React.useState('');
  const [requestedAction, setRequestedAction] =
    React.useState<DrawingActionRequest | null>(null);
  const [descriptor, setDescriptor] =
    React.useState<DrawingDocumentDescriptor | null>(null);
  const [scene, setScene] = React.useState<string | null>(null);
  const [library, setLibrary] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<DrawingSaveState>({
    revision: 0,
    status: 'saved',
  });
  const [uiState, setUiState] = React.useState<DrawingUiState>(EMPTY_UI_STATE);
  const loadRequestRef = React.useRef(0);
  const saveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const descriptorRef = React.useRef<DrawingDocumentDescriptor | null>(
    descriptor,
  );
  const flushRef = React.useRef<(() => Promise<void>) | null>(null);
  const uiStateRef = React.useRef(uiState);
  const uiStateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const actionRequestRef = React.useRef(0);

  React.useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  React.useEffect(() => {
    descriptorRef.current = descriptor;
  }, [descriptor]);

  const refresh = React.useCallback(async () => {
    if (!rootPath || !isTauriRuntime()) {
      setSnapshot(EMPTY_LIBRARY);
      return EMPTY_LIBRARY;
    }
    const next = await loadDrawingLibrary(rootPath);
    setSnapshot(next);
    return next;
  }, [rootPath]);

  React.useEffect(() => {
    if (!active || !rootPath) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        refresh(),
        isTauriRuntime() ? readDrawingUiState(rootPath) : EMPTY_UI_STATE,
      ])
        .then(([, nextUiState]) => setUiState(nextUiState))
        .catch((nextError) => setError(formatError(nextError)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, refresh, rootPath]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelection({ collection: 'all', kind: 'collection' });
      descriptorRef.current = null;
      setDescriptor(null);
      setScene(null);
      setLibrary(null);
      setRequestedAction(null);
      setUiState(EMPTY_UI_STATE);
      setError(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rootPath]);

  React.useEffect(
    () => () => {
      if (uiStateTimerRef.current) clearTimeout(uiStateTimerRef.current);
    },
    [],
  );

  const persistUiState = React.useCallback(
    (next: DrawingUiState) => {
      if (!rootPath || !isTauriRuntime()) return;
      if (uiStateTimerRef.current) clearTimeout(uiStateTimerRef.current);
      uiStateTimerRef.current = setTimeout(() => {
        void writeDrawingUiState(rootPath, next).catch(() => undefined);
      }, 500);
    },
    [rootPath],
  );

  const updateUiState = React.useCallback(
    (next: DrawingUiState) => {
      uiStateRef.current = next;
      setUiState(next);
      persistUiState(next);
    },
    [persistUiState],
  );

  const openDrawing = React.useCallback(
    async (drawingId: string) => {
      if (!rootPath) return false;
      await flushRef.current?.();
      const requestId = ++loadRequestRef.current;
      setLoading(true);
      setError(null);
      setScene(null);
      try {
        const nextDescriptor = await readDrawingMeta(rootPath, drawingId);
        if (requestId !== loadRequestRef.current) return false;
        descriptorRef.current = nextDescriptor;
        setDescriptor(nextDescriptor);
        setSelection({ id: drawingId, kind: 'drawing' });
        updateUiState({
          ...uiStateRef.current,
          recentDrawingIds: [
            drawingId,
            ...uiStateRef.current.recentDrawingIds.filter(
              (candidate) => candidate !== drawingId,
            ),
          ].slice(0, 50),
        });
        setSaveState({
          revision: nextDescriptor.meta.revision,
          status: 'saved',
        });

        const [sceneResult, libraryResult] = await Promise.allSettled([
          readDrawingScene(rootPath, drawingId),
          readDrawingLibrary(rootPath),
        ]);
        if (requestId !== loadRequestRef.current) return false;
        if (libraryResult.status === 'fulfilled') {
          setLibrary(new TextDecoder().decode(libraryResult.value));
        } else {
          setLibrary(null);
        }
        if (sceneResult.status === 'rejected') throw sceneResult.reason;
        setScene(new TextDecoder().decode(sceneResult.value));
        if (libraryResult.status === 'rejected') {
          setError(`组件库读取失败：${formatError(libraryResult.reason)}`);
        }
        return true;
      } catch (nextError) {
        if (requestId === loadRequestRef.current) {
          setError(formatError(nextError));
        }
        return false;
      } finally {
        if (requestId === loadRequestRef.current) setLoading(false);
      }
    },
    [rootPath, updateUiState],
  );

  const completeDrawingAction = React.useCallback((requestId: number) => {
    setRequestedAction((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);

  const requestDrawingAction = React.useCallback(
    async (drawingId: string, action: DrawingActionCommand) => {
      const requestId = ++actionRequestRef.current;
      setRequestedAction({ ...action, drawingId, requestId });
      if (descriptorRef.current?.meta.id === drawingId) return;
      const opened = await openDrawing(drawingId);
      if (!opened) completeDrawingAction(requestId);
    },
    [completeDrawingAction, openDrawing],
  );

  const openBackup = React.useCallback(async () => {
    if (!rootPath || !descriptor) return;
    setLoading(true);
    setError(null);
    try {
      const bytes = await readDrawingScene(rootPath, descriptor.meta.id, true);
      setScene(new TextDecoder().decode(bytes));
      setSaveState({
        revision: descriptor.meta.revision,
        status: 'dirty',
      });
    } catch (nextError) {
      setError(formatError(nextError));
    } finally {
      setLoading(false);
    }
  }, [descriptor, rootPath]);

  const selectCollection = React.useCallback(
    async (collection: DrawingCollection) => {
      await flushRef.current?.();
      setSelection({ collection, kind: 'collection' });
      descriptorRef.current = null;
      setDescriptor(null);
      setScene(null);
    },
    [],
  );

  const selectAlbum = React.useCallback(async (path: string) => {
    await flushRef.current?.();
    setSelection({ kind: 'album', path });
    descriptorRef.current = null;
    setDescriptor(null);
    setScene(null);
  }, []);

  const createNewDrawing = React.useCallback(
    async (title: string, albumPath = '') => {
      if (!rootPath) return null;
      setError(null);
      try {
        const created = await createDrawing(rootPath, albumPath, title);
        await refresh();
        await openDrawing(created.meta.id);
        return created;
      } catch (nextError) {
        setError(formatError(nextError));
        return null;
      }
    },
    [openDrawing, refresh, rootPath],
  );

  const createAlbum = React.useCallback(
    async (path: string) => {
      if (!rootPath) return null;
      try {
        const created = await createDrawingAlbum(rootPath, path);
        await refresh();
        setSelection({ kind: 'album', path: created });
        return created;
      } catch (nextError) {
        setError(formatError(nextError));
        return null;
      }
    },
    [refresh, rootPath],
  );

  const save = React.useCallback(
    (payload: DrawingSavePayload, force = false) => {
      if (!rootPath || !descriptorRef.current) return Promise.resolve();
      const run = async () => {
        const currentDescriptor = descriptorRef.current;
        if (!currentDescriptor) return;
        setSaveState({
          revision: currentDescriptor.meta.revision,
          status: 'saving',
        });
        let sessionId: string | null = null;
        try {
          const session = await beginDrawingSave(
            rootPath,
            currentDescriptor.meta.id,
            currentDescriptor.meta.revision,
            payload.manifest,
            force,
          );
          sessionId = session.sessionId;
          await stageDrawingScene(session.sessionId, payload.scene);
          if (payload.preview) {
            try {
              await stageDrawingPreview(session.sessionId, payload.preview);
            } catch {
              // Preview generation and staging are best-effort by contract.
            }
          }
          const committed = await commitDrawingSave(session.sessionId);
          sessionId = null;
          descriptorRef.current = committed;
          setDescriptor(committed);
          setSaveState({
            revision: committed.meta.revision,
            status: 'saved',
          });
          await refresh();
        } catch (nextError) {
          if (sessionId) void cancelDrawingSave(sessionId);
          const message = formatError(nextError);
          setSaveState({
            message,
            revision: currentDescriptor.meta.revision,
            status: message.includes('DRAWING_CONFLICT') ? 'conflict' : 'error',
          });
          throw nextError;
        }
      };
      const queued = saveQueueRef.current.then(run, run);
      saveQueueRef.current = queued.catch(() => undefined);
      return queued.then(() => undefined);
    },
    [refresh, rootPath],
  );

  const reloadConflict = React.useCallback(async () => {
    if (descriptor) await openDrawing(descriptor.meta.id);
  }, [descriptor, openDrawing]);

  const markDirty = React.useCallback(() => {
    setSaveState((current) =>
      current.status === 'conflict' || current.status === 'dirty'
        ? current
        : { revision: current.revision, status: 'dirty' },
    );
  }, []);

  const rename = React.useCallback(
    async (title: string) => {
      if (!rootPath || !descriptor) return;
      try {
        const renamed = await renameDrawing(
          rootPath,
          descriptor.meta.id,
          descriptor.meta.revision,
          title,
        );
        descriptorRef.current = renamed;
        setDescriptor(renamed);
        setSaveState({ revision: renamed.meta.revision, status: 'saved' });
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [descriptor, refresh, rootPath],
  );

  const move = React.useCallback(
    async (drawingId: string, albumPath: string) => {
      if (!rootPath) return;
      try {
        const moved = await moveDrawing(rootPath, drawingId, albumPath);
        if (descriptorRef.current?.meta.id === drawingId) {
          descriptorRef.current = moved;
          setDescriptor(moved);
        }
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [refresh, rootPath],
  );

  const duplicate = React.useCallback(
    async (drawingId: string) => {
      if (!rootPath) return;
      try {
        const created = await duplicateDrawing(rootPath, drawingId);
        await refresh();
        await openDrawing(created.meta.id);
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [openDrawing, refresh, rootPath],
  );

  const moveToTrash = React.useCallback(
    async (drawingId: string) => {
      if (!rootPath) return;
      await flushRef.current?.();
      try {
        await trashDrawing(rootPath, drawingId);
        if (descriptorRef.current?.meta.id === drawingId) {
          descriptorRef.current = null;
          setDescriptor(null);
          setScene(null);
          setSelection({ collection: 'trash', kind: 'collection' });
        }
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [refresh, rootPath],
  );

  const restore = React.useCallback(
    async (drawingId: string) => {
      if (!rootPath) return;
      try {
        const restored = await restoreDrawing(rootPath, drawingId);
        await refresh();
        await openDrawing(restored.meta.id);
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [openDrawing, refresh, rootPath],
  );

  const permanentlyDelete = React.useCallback(
    async (drawingId: string) => {
      if (!rootPath) return;
      try {
        await permanentlyDeleteDrawing(rootPath, drawingId);
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    [refresh, rootPath],
  );

  const importFiles = React.useCallback(
    async (albumPath = '') => {
      if (!rootPath) return;
      const grant = await selectDrawingImportSources();
      if (!grant) return;
      try {
        let lastDrawingId: string | null = null;
        for (const source of grant.sources) {
          if (source.kind === 'drawing') {
            const imported = await importDrawingFromGrant(
              rootPath,
              albumPath,
              grant.grantId,
              source.sourceId,
            );
            lastDrawingId = imported.meta.id;
          } else {
            await importDrawingLibraryFromGrant(
              rootPath,
              grant.grantId,
              source.sourceId,
            );
          }
        }
        await refresh();
        if (lastDrawingId) await openDrawing(lastDrawingId);
      } catch (nextError) {
        setError(formatError(nextError));
      } finally {
        void releaseDrawingImportGrant(grant.grantId);
      }
    },
    [openDrawing, refresh, rootPath],
  );

  const persistLibrary = React.useCallback(
    async (nextLibrary: string) => {
      if (!rootPath) return;
      await writeDrawingLibrary(rootPath, new TextEncoder().encode(nextLibrary));
      setLibrary(nextLibrary);
    },
    [rootPath],
  );

  const createMarkdownReference = React.useCallback(
    async (preview: Uint8Array) => {
      if (!rootPath || !descriptor) return null;
      const asset = await createDrawingMarkdownSnapshot(
        rootPath,
        descriptor.meta.id,
        descriptor.meta.title,
        preview,
      );
      const escapedTitle = descriptor.meta.title.replace(/[[\]]/g, '\\$&');
      return `[![${escapedTitle}](${asset.url})](madora-drawing://${descriptor.meta.id})`;
    },
    [descriptor, rootPath],
  );

  const registerFlush = React.useCallback((flush: (() => Promise<void>) | null) => {
    flushRef.current = flush;
  }, []);

  const recordViewport = React.useCallback(
    (viewport: DrawingViewport) => {
      if (!descriptor) return;
      const next = {
        ...uiStateRef.current,
        viewports: {
          ...uiStateRef.current.viewports,
          [descriptor.meta.id]: viewport,
        },
      };
      uiStateRef.current = next;
      if (uiStateTimerRef.current) clearTimeout(uiStateTimerRef.current);
      uiStateTimerRef.current = setTimeout(() => {
        setUiState(uiStateRef.current);
        if (rootPath && isTauriRuntime()) {
          void writeDrawingUiState(rootPath, uiStateRef.current).catch(
            () => undefined,
          );
        }
      }, 500);
    },
    [descriptor, rootPath],
  );

  const visibleDrawings = React.useMemo(
    () =>
      selectVisibleDrawings(
        snapshot,
        selection,
        query,
        uiState.recentDrawingIds,
      ),
    [query, selection, snapshot, uiState.recentDrawingIds],
  );

  return {
    completeDrawingAction,
    createAlbum,
    createMarkdownReference,
    createNewDrawing,
    deleteAlbum: async (path: string) => {
      if (!rootPath) return;
      try {
        await deleteDrawingAlbum(rootPath, path);
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    descriptor,
    duplicate,
    error,
    importFiles,
    library,
    loading,
    markDirty,
    move,
    moveToTrash,
    openBackup,
    openDrawing,
    permanentlyDelete,
    persistLibrary,
    query,
    requestedAction,
    requestDrawingAction,
    recordViewport,
    refresh,
    registerFlush,
    reloadConflict,
    rename,
    renameAlbum: async (path: string, newName: string) => {
      if (!rootPath) return;
      try {
        const renamedPath = await renameDrawingAlbum(rootPath, path, newName);
        await refresh();
        setSelection({ kind: 'album', path: renamedPath });
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    moveAlbum: async (path: string, parentPath: string) => {
      if (!rootPath) return;
      try {
        const movedPath = await moveDrawingAlbum(rootPath, path, parentPath);
        await refresh();
        setSelection({ kind: 'album', path: movedPath });
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    duplicateAlbum: async (path: string) => {
      if (!rootPath) return;
      try {
        const duplicatedPath = await duplicateDrawingAlbum(rootPath, path);
        await refresh();
        setSelection({ kind: 'album', path: duplicatedPath });
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    trashAlbum: async (path: string) => {
      if (!rootPath) return;
      await flushRef.current?.();
      try {
        await trashDrawingAlbum(rootPath, path);
        descriptorRef.current = null;
        setDescriptor(null);
        setScene(null);
        setSelection({ collection: 'trash', kind: 'collection' });
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    restoreAlbum: async (trashId: string) => {
      if (!rootPath) return;
      try {
        const restoredPath = await restoreDrawingAlbum(rootPath, trashId);
        await refresh();
        setSelection({ kind: 'album', path: restoredPath });
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    permanentlyDeleteAlbum: async (trashId: string) => {
      if (!rootPath) return;
      try {
        await permanentlyDeleteDrawingAlbum(rootPath, trashId);
        await refresh();
      } catch (nextError) {
        setError(formatError(nextError));
      }
    },
    restore,
    save,
    saveState,
    scene,
    selectAlbum,
    selectCollection,
    selection,
    setError,
    setQuery,
    snapshot,
    uiState,
    viewport: descriptor ? uiState.viewports[descriptor.meta.id] ?? null : null,
    visibleDrawings,
  };
}

export type DrawingController = ReturnType<typeof useDrawingController>;

export function selectVisibleDrawings(
  snapshot: DrawingLibrarySnapshot,
  selection: DrawingSelection,
  query: string,
  recentDrawingIds: string[] = [],
) {
  let drawings: DrawingSummary[];
  if (selection.kind === 'album') {
    drawings = snapshot.drawings.filter(
      (drawing) =>
        drawing.albumPath === selection.path ||
        drawing.albumPath.startsWith(`${selection.path}/`),
    );
  } else if (selection.kind === 'drawing') {
    drawings = snapshot.drawings;
  } else {
    switch (selection.collection) {
      case 'favorites':
        drawings = snapshot.drawings.filter((drawing) => drawing.favorite);
        break;
      case 'recent':
        drawings = recentDrawingIds.length
          ? recentDrawingIds
              .map((id) => snapshot.drawings.find((drawing) => drawing.id === id))
              .filter((drawing): drawing is DrawingSummary => Boolean(drawing))
          : snapshot.drawings.slice(0, 30);
        break;
      case 'trash':
        drawings = snapshot.trash;
        break;
      default:
        drawings = snapshot.drawings;
    }
  }
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return drawings;
  return drawings.filter((drawing) =>
    [
      drawing.title,
      drawing.albumPath,
      drawing.searchText,
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery),
  );
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

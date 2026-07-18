'use client';

import * as React from 'react';

import { useDebounce } from '@/hooks/use-debounce';

import {
  appendInboxCaptureToDaily,
  createInboxCapture,
  deleteInboxCapture,
  listInboxCaptures,
  promoteInboxCapture,
  readInboxCapture,
  updateInboxCapture,
} from './workspace-api';
import { isInboxCaptureActive } from './inbox-utils';
import type {
  InboxCapture,
  InboxCaptureListResult,
  InboxCaptureListView,
  InboxCapturePriority,
  InboxCaptureStatus,
} from './workspace-types';

interface UseInboxControllerOptions {
  rootPath: string | null;
}

export type InboxSaveState =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'error';

export function useInboxController({ rootPath }: UseInboxControllerOptions) {
  const [view, setViewState] = React.useState<InboxCaptureListView>('active');
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 180);
  const [captures, setCaptures] = React.useState<
    InboxCaptureListResult['captures']
  >([]);
  const [activeCount, setActiveCount] = React.useState(0);
  const [issues, setIssues] = React.useState<InboxCaptureListResult['issues']>(
    [],
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [capture, setCapture] = React.useState<InboxCapture | null>(null);
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingCapture, setLoadingCapture] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveState, setSaveState] = React.useState<InboxSaveState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [newCaptureActive, setNewCaptureActive] = React.useState(false);
  const [newCaptureBody, setNewCaptureBody] = React.useState('');
  const [newCaptureVersion, setNewCaptureVersion] = React.useState(0);
  const captureRef = React.useRef<InboxCapture | null>(null);
  const dirtyRef = React.useRef(false);
  const newCaptureActiveRef = React.useRef(false);
  const newCaptureBodyRef = React.useRef('');
  const newCaptureRevisionRef = React.useRef(0);
  const listRequestIdRef = React.useRef(0);
  const listQueryRef = React.useRef(debouncedQuery);
  const listViewRef = React.useRef(view);
  const saveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const saveTimerRef = React.useRef<number | null>(null);
  const newCaptureSaveTimerRef = React.useRef<number | null>(null);
  const newCaptureCreateRef = React.useRef<Promise<InboxCapture | null> | null>(
    null,
  );

  React.useEffect(() => {
    listQueryRef.current = debouncedQuery;
    listViewRef.current = view;
  }, [debouncedQuery, view]);

  const applyListResult = React.useCallback(
    (result: InboxCaptureListResult, preferredId?: string | null) => {
      setCaptures(result.captures);
      setActiveCount(result.activeCount);
      setIssues(result.issues);
      setSelectedId((current) => {
        if (newCaptureActiveRef.current) return null;
        const preferred = preferredId ?? current;
        if (
          preferred &&
          result.captures.some((item) => item.id === preferred)
        ) {
          return preferred;
        }
        return result.captures[0]?.id ?? null;
      });
      setError(null);
      return result.captures;
    },
    [],
  );

  const loadList = React.useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    if (!rootPath) {
      setCaptures([]);
      setActiveCount(0);
      setIssues([]);
      setSelectedId(null);
      return [];
    }

    setLoadingList(true);
    try {
      const result = await listInboxCaptures(
        rootPath,
        listViewRef.current,
        listQueryRef.current,
      );
      if (requestId === listRequestIdRef.current) applyListResult(result);
      return result.captures;
    } catch (nextError) {
      if (requestId === listRequestIdRef.current) {
        setError(getErrorMessage(nextError));
        setCaptures([]);
      }
      return [];
    } finally {
      if (requestId === listRequestIdRef.current) setLoadingList(false);
    }
  }, [applyListResult, rootPath]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, loadList, view]);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!rootPath || !selectedId) {
        setCapture(null);
        captureRef.current = null;
        dirtyRef.current = false;
        if (!newCaptureActiveRef.current) setSaveState('idle');
        return;
      }
      if (captureRef.current?.id === selectedId) {
        setLoadingCapture(false);
        return;
      }

      setLoadingCapture(true);
      void readInboxCapture(rootPath, selectedId)
        .then((nextCapture) => {
          if (cancelled) return;
          setCapture(nextCapture);
          captureRef.current = nextCapture;
          dirtyRef.current = false;
          setSaveState('saved');
          setError(null);
        })
        .catch((nextError) => {
          if (!cancelled) setError(getErrorMessage(nextError));
        })
        .finally(() => {
          if (!cancelled) setLoadingCapture(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rootPath, selectedId]);

  React.useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (newCaptureSaveTimerRef.current !== null) {
        window.clearTimeout(newCaptureSaveTimerRef.current);
      }
    },
    [],
  );

  const persistCapture = React.useCallback(
    (draft: InboxCapture, advance = false) => {
      const runSave = async () => {
        if (!rootPath) throw new Error('未打开工作区');
        if (
          captureRef.current?.id === draft.id &&
          saveTimerRef.current !== null
        ) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        const candidate =
          captureRef.current?.id === draft.id ? captureRef.current : draft;
        const tracksEditor = captureRef.current?.id === candidate.id;
        setSaving(true);
        if (tracksEditor) setSaveState('saving');
        try {
          const saved = await updateInboxCapture(
            rootPath,
            candidate.id,
            {
              body: candidate.body,
              priority: candidate.priority,
              snoozedUntil: candidate.snoozedUntil,
              status: candidate.status,
              tags: candidate.tags,
            },
            candidate.modifiedAt,
          );
          if (captureRef.current?.id === saved.id) {
            if (captureRef.current === candidate) {
              setCapture(saved);
              captureRef.current = saved;
              dirtyRef.current = false;
              setSaveState('saved');
            } else {
              const rebased = {
                ...captureRef.current,
                modifiedAt: saved.modifiedAt,
                updatedAt: saved.updatedAt,
              };
              setCapture(rebased);
              captureRef.current = rebased;
              dirtyRef.current = true;
              setSaveState('dirty');
            }
          }
          const nextItems = await loadList();
          if (advance) {
            const next = nextItems.find((item) => item.id !== saved.id) ?? null;
            setSelectedId(next?.id ?? null);
          }
          setError(null);
          return saved;
        } catch (nextError) {
          setError(getErrorMessage(nextError));
          if (tracksEditor) setSaveState('error');
          throw nextError;
        } finally {
          setSaving(false);
        }
      };
      const queued = saveQueueRef.current.then(runSave, runSave);
      saveQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [loadList, rootPath],
  );

  const resetNewCapture = React.useCallback(() => {
    if (newCaptureSaveTimerRef.current !== null) {
      window.clearTimeout(newCaptureSaveTimerRef.current);
      newCaptureSaveTimerRef.current = null;
    }
    newCaptureActiveRef.current = false;
    newCaptureBodyRef.current = '';
    newCaptureRevisionRef.current += 1;
    setNewCaptureActive(false);
    setNewCaptureBody('');
  }, []);

  const persistNewCapture = React.useCallback(async () => {
    if (!rootPath) throw new Error('未打开工作区');
    if (!newCaptureActiveRef.current) return null;

    const body = newCaptureBodyRef.current;
    if (!body.trim()) return null;
    if (newCaptureCreateRef.current) return newCaptureCreateRef.current;

    if (newCaptureSaveTimerRef.current !== null) {
      window.clearTimeout(newCaptureSaveTimerRef.current);
      newCaptureSaveTimerRef.current = null;
    }

    const revision = newCaptureRevisionRef.current;
    const operation = (async () => {
      setSaving(true);
      setSaveState('saving');
      try {
        const created = await createInboxCapture(
          rootPath,
          body,
          [],
          'quick-capture',
        );
        const latestBody = newCaptureBodyRef.current;
        const changedWhileCreating =
          newCaptureRevisionRef.current !== revision;

        if (changedWhileCreating && !latestBody.trim()) {
          await deleteInboxCapture(rootPath, created.id, created.modifiedAt);
          setSaveState('dirty');
          return null;
        }

        newCaptureActiveRef.current = false;
        setNewCaptureActive(false);
        setNewCaptureBody('');
        newCaptureBodyRef.current = '';
        setViewState('active');
        setQuery('');
        setSelectedId(created.id);

        let savedCapture = created;
        if (changedWhileCreating && latestBody !== body) {
          const rebased = { ...created, body: latestBody };
          setCapture(rebased);
          captureRef.current = rebased;
          dirtyRef.current = true;
          savedCapture = await persistCapture(rebased);
        } else {
          setCapture(created);
          captureRef.current = created;
          dirtyRef.current = false;
          setSaveState('saved');
          const requestId = ++listRequestIdRef.current;
          const result = await listInboxCaptures(rootPath, 'active', '');
          if (requestId === listRequestIdRef.current) {
            applyListResult(result, created.id);
          }
        }
        setError(null);
        return savedCapture;
      } catch (nextError) {
        setError(getErrorMessage(nextError));
        setSaveState('error');
        throw nextError;
      } finally {
        setSaving(false);
        newCaptureCreateRef.current = null;
      }
    })();

    newCaptureCreateRef.current = operation;
    return operation;
  }, [applyListResult, persistCapture, rootPath]);

  const getCaptureForAction = React.useCallback(
    async (captureId: string) => {
      if (!rootPath) throw new Error('未打开工作区');
      if (captureRef.current?.id === captureId) return captureRef.current;
      return readInboxCapture(rootPath, captureId);
    },
    [rootPath],
  );

  const updateById = React.useCallback(
    async (
      captureId: string,
      updater: (current: InboxCapture) => InboxCapture,
      advance = false,
    ) => {
      const current = await getCaptureForAction(captureId);
      const draft = updater(current);
      if (captureRef.current?.id === captureId) {
        setCapture(draft);
        captureRef.current = draft;
        dirtyRef.current = true;
        setSaveState('dirty');
      }
      return persistCapture(draft, advance);
    },
    [getCaptureForAction, persistCapture],
  );

  const saveSelectedCapture = React.useCallback(async () => {
    const current = captureRef.current;
    if (!current) throw new Error('未选择 Capture');
    if (!dirtyRef.current) return current;
    return persistCapture(current);
  }, [persistCapture]);

  const saveCurrent = React.useCallback(async () => {
    if (newCaptureActiveRef.current) return persistNewCapture();
    return saveSelectedCapture();
  }, [persistNewCapture, saveSelectedCapture]);

  const flushNewCapture = React.useCallback(async () => {
    if (!newCaptureActiveRef.current) return true;
    if (!newCaptureBodyRef.current.trim()) {
      resetNewCapture();
      return true;
    }
    try {
      await persistNewCapture();
      return true;
    } catch {
      return false;
    }
  }, [persistNewCapture, resetNewCapture]);

  const startNewCapture = React.useCallback(async () => {
    if (newCaptureActiveRef.current && !newCaptureBodyRef.current.trim()) {
      setNewCaptureVersion((current) => current + 1);
      return true;
    }
    if (!(await flushNewCapture())) return false;
    if (dirtyRef.current && captureRef.current) {
      try {
        await persistCapture(captureRef.current);
      } catch {
        return false;
      }
    }

    newCaptureActiveRef.current = true;
    newCaptureBodyRef.current = '';
    newCaptureRevisionRef.current += 1;
    setNewCaptureActive(true);
    setNewCaptureBody('');
    setNewCaptureVersion((current) => current + 1);
    setSelectedId(null);
    setCapture(null);
    captureRef.current = null;
    dirtyRef.current = false;
    setViewState('active');
    setQuery('');
    setSaveState('dirty');
    setError(null);
    return true;
  }, [flushNewCapture, persistCapture]);

  const selectCapture = React.useCallback(
    async (captureId: string) => {
      if (!(await flushNewCapture())) return false;
      if (captureId === selectedId) return true;
      if (dirtyRef.current && captureRef.current) {
        try {
          await persistCapture(captureRef.current);
        } catch {
          return false;
        }
      }
      setSaveState('idle');
      setSelectedId(captureId);
      return true;
    },
    [flushNewCapture, persistCapture, selectedId],
  );

  const updateBody = React.useCallback(
    (body: string) => {
      setCapture((current) => {
        if (!current) return current;
        const next = { ...current, body };
        captureRef.current = next;
        dirtyRef.current = true;
        setSaveState('dirty');
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = window.setTimeout(() => {
          void persistCapture(next).catch(() => undefined);
        }, 700);
        return next;
      });
    },
    [persistCapture],
  );

  const updateNewCaptureBody = React.useCallback(
    (body: string) => {
      if (!newCaptureActiveRef.current) return;
      newCaptureBodyRef.current = body;
      newCaptureRevisionRef.current += 1;
      setNewCaptureBody(body);
      setSaveState('dirty');
      if (newCaptureSaveTimerRef.current !== null) {
        window.clearTimeout(newCaptureSaveTimerRef.current);
        newCaptureSaveTimerRef.current = null;
      }
      if (body.trim()) {
        newCaptureSaveTimerRef.current = window.setTimeout(() => {
          void persistNewCapture().catch(() => undefined);
        }, 700);
      }
    },
    [persistNewCapture],
  );

  const changeView = React.useCallback(
    async (nextView: InboxCaptureListView) => {
      if (!(await flushNewCapture())) return false;
      if (dirtyRef.current && captureRef.current) {
        try {
          await persistCapture(captureRef.current);
        } catch {
          return false;
        }
      }
      setViewState(nextView);
      return true;
    },
    [flushNewCapture, persistCapture],
  );
  const setStatus = React.useCallback(
    (captureId: string, status: InboxCaptureStatus) =>
      updateById(
        captureId,
        (current) => ({
          ...current,
          snoozedUntil: isInboxCaptureActive(status)
            ? current.snoozedUntil
            : null,
          status,
        }),
        status === 'done' || status === 'archived',
      ),
    [updateById],
  );

  const setPriority = React.useCallback(
    (captureId: string, priority: InboxCapturePriority) =>
      updateById(captureId, (current) => ({ ...current, priority })),
    [updateById],
  );

  const wake = React.useCallback(
    (captureId: string) =>
      updateById(captureId, (current) => ({
        ...current,
        snoozedUntil: null,
      })),
    [updateById],
  );

  const promote = React.useCallback(
    async (captureId: string, targetDir: string, title: string) => {
      if (!rootPath) throw new Error('未打开工作区');
      const current =
        captureRef.current?.id === captureId
          ? await saveSelectedCapture()
          : await getCaptureForAction(captureId);
      const result = await promoteInboxCapture(
        rootPath,
        captureId,
        targetDir,
        title,
        current.modifiedAt,
      );
      await loadList();
      return result;
    },
    [getCaptureForAction, loadList, rootPath, saveSelectedCapture],
  );

  const appendToDaily = React.useCallback(
    async (captureId: string, date: string, localTime: string) => {
      if (!rootPath) throw new Error('未打开工作区');
      const current =
        captureRef.current?.id === captureId
          ? await saveSelectedCapture()
          : await getCaptureForAction(captureId);
      const result = await appendInboxCaptureToDaily(
        rootPath,
        captureId,
        date,
        localTime,
        current.modifiedAt,
      );
      await loadList();
      return result;
    },
    [getCaptureForAction, loadList, rootPath, saveSelectedCapture],
  );

  const remove = React.useCallback(
    async (captureId: string) => {
      if (!rootPath) throw new Error('未打开工作区');
      const current = await getCaptureForAction(captureId);
      if (
        captureRef.current?.id === captureId &&
        saveTimerRef.current !== null
      ) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await deleteInboxCapture(rootPath, captureId, current.modifiedAt);
      if (captureRef.current?.id === captureId) {
        setCapture(null);
        captureRef.current = null;
        dirtyRef.current = false;
        setSaveState('idle');
      }
      setSelectedId(null);
      await loadList();
    },
    [getCaptureForAction, loadList, rootPath],
  );

  return {
    activeCount,
    appendToDaily,
    capture,
    captures,
    error,
    issues,
    loadList,
    loadingCapture,
    loadingList,
    newCaptureActive,
    newCaptureBody,
    newCaptureVersion,
    promote,
    query,
    remove,
    rootPath,
    saveCurrent,
    saveState,
    saving,
    selectedId,
    selectCapture,
    setPriority,
    setQuery,
    setStatus,
    setView: changeView,
    startNewCapture,
    updateBody,
    updateNewCaptureBody,
    view,
    wake,
  };
}

export type InboxController = ReturnType<typeof useInboxController>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

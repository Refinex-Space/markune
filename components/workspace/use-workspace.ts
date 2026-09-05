'use client';

import * as React from 'react';

import {
  createMarkdownDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  ensureWorkspace,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  inspectWorkspaceBrand,
  loadWorkspaceTree,
  migrateLegacyWorkspaceBrand,
  moveWorkspaceNode,
  recordWorkspaceHistory,
  refreshWorkspaceNode as refreshWorkspaceNodeApi,
  removeWorkspaceHistory,
  readMarkdownDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
  setWorkspaceNodeState,
  setTreeNodeAppearance,
} from './workspace-api';
import { migrateLegacyBrowserStorage } from './brand-migration';
import {
  extractH1FromMarkdown,
  parseMarkdownMetadata,
  sanitizeTitleForFileName,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import {
  getBaseName,
  getParentPath,
  isDescendantPath,
  joinPath,
} from './workspace-paths';
import { createSourceMarkdownDraft } from './workspace-source-markdown';
import { searchWorkspace } from './workspace-tree';
import type {
  DocumentLoadState,
  DocumentSaveState,
  MarkdownDocumentContent,
  MarkdownDraft,
  RightPanelMode,
  WorkspaceLoadError,
  WorkspaceHistoryItem,
  WorkspaceBrandMigrationReport,
  WorkspaceMoveRequest,
  WorkspaceNode,
  WorkspaceSnapshot,
  TreeNodeAppearance,
} from './workspace-types';

const FRONTMATTER_OPENING_PATTERN = /^---\r?\n/;

export interface ExternalDocumentConflict {
  externalDocument: MarkdownDocumentContent;
  path: string;
}

export interface PendingWorkspaceBrandMigration {
  rootPath: string;
  state: 'legacy' | 'conflict';
}

export function useWorkspace(initialSnapshot?: WorkspaceSnapshot | null) {
  const [snapshot, setSnapshotState] = React.useState<WorkspaceSnapshot | null>(
    initialSnapshot ?? null,
  );
  const snapshotRef = React.useRef<WorkspaceSnapshot | null>(snapshot);
  const setSnapshot = React.useCallback((next: WorkspaceSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  const treeRefreshIdRef = React.useRef(0);
  const [currentDocument, setCurrentDocument] =
    React.useState<WorkspaceNode | null>(null);
  const [currentDirectoryPath, setCurrentDirectoryPath] = React.useState<
    string | null
  >(null);
  const [documentContent, setDocumentContent] =
    React.useState<MarkdownDocumentContent | null>(null);
  const documentContentRef = React.useRef<MarkdownDocumentContent | null>(
    documentContent,
  );
  const [draftDocument, setDraftDocument] =
    React.useState<MarkdownDraft | null>(null);
  const draftDocumentRef = React.useRef<MarkdownDraft | null>(draftDocument);
  const [documentLoadState, setDocumentLoadState] =
    React.useState<DocumentLoadState>('idle');
  const [documentLoadError, setDocumentLoadError] = React.useState<
    string | null
  >(null);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [saveState, setSaveState] = React.useState<DocumentSaveState>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [externalDocumentConflict, setExternalDocumentConflict] =
    React.useState<ExternalDocumentConflict | null>(null);
  const conflictRef = React.useRef(externalDocumentConflict);
  const currentDocumentRef = React.useRef(currentDocument);
  React.useLayoutEffect(() => {
    conflictRef.current = externalDocumentConflict;
    currentDocumentRef.current = currentDocument;
  }, [currentDocument, externalDocumentConflict]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [pendingRenameNodePath, setPendingRenameNodePath] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [rightPanelMode, setRightPanelMode] = React.useState<RightPanelMode>(null);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => {
    migrateLegacyBrowserStorage();
    return getWorkspaceHistory();
  });
  const [pendingBrandMigration, setPendingBrandMigration] = React.useState<
    PendingWorkspaceBrandMigration | null
  >(null);
  const [brandMigrationReport, setBrandMigrationReport] = React.useState<
    WorkspaceBrandMigrationReport | null
  >(null);
  const [initialRecentDocumentPaths, setInitialRecentDocumentPaths] =
    React.useState<string[]>([]);

  const suppressNextAutoRestoreRef = React.useRef(false);
  const loadWorkspaceRequestIdRef = React.useRef(0);
  const documentOpenRequestIdRef = React.useRef(0);
  const autoRestoreAttemptedRef = React.useRef(false);
  const currentDirectory = React.useMemo(() => {
    if (!snapshot || !currentDirectoryPath) {
      return null;
    }

    const node = findNodeByAbsolutePath(snapshot.nodes, currentDirectoryPath);

    return node?.kind === 'directory' ? node : null;
  }, [currentDirectoryPath, snapshot]);

  const lastSavedMarkdownRef = React.useRef('');
  const pendingSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingRenameTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isRenamingRef = React.useRef(false);
  const saveInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const aiTurnDocumentBaselinesRef = React.useRef<Map<string, string> | null>(
    null,
  );

  React.useEffect(() => {
    draftDocumentRef.current = draftDocument;
  }, [draftDocument]);

  React.useEffect(() => {
    documentContentRef.current = documentContent;
  }, [documentContent]);

  React.useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const clearPendingSave = React.useCallback(() => {
    if (pendingSaveTimerRef.current) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
  }, []);

  const clearPendingRename = React.useCallback(() => {
    if (pendingRenameTimerRef.current) {
      clearTimeout(pendingRenameTimerRef.current);
      pendingRenameTimerRef.current = null;
    }
  }, []);

  const resetDocumentState = React.useCallback(() => {
    documentOpenRequestIdRef.current += 1;
    clearPendingSave();
    clearPendingRename();
    isRenamingRef.current = false;
    setCurrentDocument(null);
    setCurrentDirectoryPath(null);
    setDocumentContent(null);
    setDraftDocument(null);
    setDocumentLoadState('idle');
    setDocumentLoadError(null);
    setDocumentVersion(0);
    setSaveState('idle');
    setSaveError(null);
    setLastSavedAt(null);
    conflictRef.current = null;
    currentDocumentRef.current = null;
    documentContentRef.current = null;
    draftDocumentRef.current = null;
    setExternalDocumentConflict(null);
    setPendingRenameNodePath(null);
    lastSavedMarkdownRef.current = '';
    aiTurnDocumentBaselinesRef.current = null;
  }, [clearPendingSave, clearPendingRename]);

  const refreshWorkspaceTree = React.useCallback(async () => {
    const base = snapshotRef.current;
    if (!base) return null;
    const requestId = ++treeRefreshIdRef.current;
    const generation = loadWorkspaceRequestIdRef.current;
    const nextSnapshot = await loadWorkspaceTree(base.rootPath);
    if (
      snapshotRef.current?.rootPath !== base.rootPath ||
      generation !== loadWorkspaceRequestIdRef.current ||
      requestId !== treeRefreshIdRef.current
    )
      return snapshotRef.current;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [setSnapshot]);

  // Incrementally refresh only the workspace directories affected by a set of
  // changed entry paths (used by CRUD/AI auto-refresh). Falls back to a full
  // rescan when a top-level entry changes, since the tree root itself has no
  // single node to rebuild. Never reads document contents. author: liyao

  const refreshWorkspaceNodes = React.useCallback(
    async (entryPaths: string[]) => {
      const base = snapshotRef.current;

      if (!base) {
        return null;
      }

      const rootPath = base.rootPath;
      const generation = loadWorkspaceRequestIdRef.current;
      const requestId = ++treeRefreshIdRef.current;
      const targets = new Set<string>();

      for (const entryPath of entryPaths) {
        const target = resolveExistingDirectoryTarget(base, entryPath, rootPath);

        if (target === null) {
          return refreshWorkspaceTree();
        }

        targets.add(target);
      }

      const mergeTargets = dropNestedPaths([...targets]);

      if (mergeTargets.length === 0) {
        return base;
      }

      const results = await Promise.all(
        mergeTargets.map(async (path) => {
          try {
            const node = await refreshWorkspaceNodeApi(rootPath, path);
            return { path, node, ok: true as const };
          } catch {
            return { path, node: null, ok: false as const };
          }
        }),
      );

      const latest = snapshotRef.current;

      if (!latest || latest.rootPath !== rootPath || generation !== loadWorkspaceRequestIdRef.current || requestId !== treeRefreshIdRef.current) {
        return latest;
      }

      let nextNodes = latest.nodes;

      if (results.some((result) => !result.ok)) {
        throw new Error('部分目录刷新失败，请重试');
      }
      for (const result of results) {

        nextNodes = result.node
          ? replaceWorkspaceNodeInList(nextNodes, result.path, result.node)
          : removeWorkspaceNodeFromList(nextNodes, result.path);
      }

      if (nextNodes === latest.nodes) {
        return latest;
      }

      const nextSnapshot = { ...latest, nodes: nextNodes };
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    [refreshWorkspaceTree, setSnapshot],
  );

  const loadWorkspace = React.useCallback(
    async (
      rootPath: string,
      options?: {
        reason?: 'auto-restore' | 'user';
        skipBrandInspection?: boolean;
      },
    ) => {
      const requestId = ++loadWorkspaceRequestIdRef.current;
      const reason = options?.reason ?? 'user';
      treeRefreshIdRef.current += 1;
      setIsLoading(true);
      setError(null);

      try {
        if (!options?.skipBrandInspection) {
          const inspection = await inspectWorkspaceBrand(rootPath);
          if (
            inspection.state === 'legacy' ||
            inspection.state === 'conflict'
          ) {
            if (requestId !== loadWorkspaceRequestIdRef.current) {
              return;
            }
            setPendingBrandMigration({
              rootPath,
              state: inspection.state,
            });
            return;
          }
        }

        const [nextSnapshot, metadata] = await Promise.all([
          loadWorkspaceTree(rootPath),
          ensureWorkspace(rootPath).catch(() => null),
        ]);

        if (requestId !== loadWorkspaceRequestIdRef.current) {
          return;
        }

        setSnapshot(nextSnapshot);
        setPendingBrandMigration(null);
        setInitialRecentDocumentPaths(
          metadata?.recentDocumentPaths ?? [],
        );
        resetDocumentState();
        saveRecentWorkspacePath(nextSnapshot.rootPath);
        setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
      } catch (loadError) {
        if (requestId !== loadWorkspaceRequestIdRef.current) {
          return;
        }

        setSnapshot(null);
        resetDocumentState();

        // Auto-restore of a stale/missing recent path should not block the empty
        // state with a hard error; forget the bad entry and let the user pick.
        // author: refinex
        if (reason === 'auto-restore') {
          setStoredWorkspaceHistory(removeWorkspaceHistory(rootPath));
          setError(null);
        } else {
          setError({
            message: getWorkspaceErrorMessage(
              loadError,
              '无法读取工作区，请重新选择文件夹。',
            ),
            recoverable: true,
          });
        }
      } finally {
        if (requestId === loadWorkspaceRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [resetDocumentState, setSnapshot],
  );

  const saveCurrentDocumentNow = React.useCallback(
    async (draftOverride?: MarkdownDraft | null) => {
      if (saveInFlightRef.current) {
        const saved = await saveInFlightRef.current;
        if (!saved) return false;
      }
      const snapshot = snapshotRef.current;
      const currentDocument = currentDocumentRef.current;
      if (!snapshot || !currentDocument || currentDocument.kind !== 'document') {
        return true;
      }

      const draft = draftOverride ?? draftDocumentRef.current;

      if (!draft) {
        return true;
      }
      if (draft.path !== currentDocument.absolutePath) return false;

      clearPendingSave();

      if (draft.markdown === lastSavedMarkdownRef.current) {
        setSaveState('saved');
        return true;
      }
      if (conflictRef.current?.path === currentDocument.absolutePath) {
        return false;
      }

      setSaveState('saving');
      setSaveError(null);

      const savePromise = (async () => {
        try {
          const meta = await saveMarkdownDocument(
            snapshot.rootPath,
            currentDocument.absolutePath,
            draft.markdown,
            documentContentRef.current?.modifiedAt ?? null,
            documentContentRef.current?.content,
          );
          if (
            snapshotRef.current?.rootPath !== snapshot.rootPath ||
            currentDocumentRef.current?.absolutePath !==
              currentDocument.absolutePath
          )
            return true;

          lastSavedMarkdownRef.current = draft.markdown;
          const nextContent = {
            content: draft.markdown,
            modifiedAt: meta.modifiedAt,
            path: meta.path,
          };
          const nextDraft = {
            ...draft,
            modifiedAt: meta.modifiedAt,
            path: meta.path,
          };
          documentContentRef.current = nextContent;
          const latestDraft = draftDocumentRef.current;
          const hasNewerDraft =
            latestDraft && latestDraft.markdown !== draft.markdown;
          const retainedDraft = hasNewerDraft
            ? { ...latestDraft, modifiedAt: meta.modifiedAt }
            : nextDraft;
          draftDocumentRef.current = retainedDraft;
          setDocumentContent(nextContent);
          setDraftDocument(retainedDraft);
          setLastSavedAt(meta.modifiedAt);
          setSaveState(hasNewerDraft ? 'dirty' : 'saved');
          return true;
        } catch (saveDocumentError) {
          if (
            snapshotRef.current?.rootPath !== snapshot.rootPath ||
            currentDocumentRef.current?.absolutePath !==
              currentDocument.absolutePath
          )
            return false;
          setSaveState('error');
          setSaveError(
            saveDocumentError instanceof Error
              ? saveDocumentError.message
              : getWorkspaceErrorMessage(
                  saveDocumentError,
                  '无法保存 Markdown 文档内容',
                ),
          );
          return false;
        }
      })();
      saveInFlightRef.current = savePromise;
      try {
        return await savePromise;
      } finally {
        if (saveInFlightRef.current === savePromise) {
          saveInFlightRef.current = null;
        }
      }
    },
    [clearPendingSave],
  );

  const openDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'document') {
        return;
      }

      if (conflictRef.current) return null;
      if (!(await saveCurrentDocumentNow())) return null;
      if (snapshotRef.current?.rootPath !== snapshot.rootPath) return null;
      const requestId = ++documentOpenRequestIdRef.current;

      clearPendingSave();
      clearPendingRename();
      setCurrentDirectoryPath(null);
      currentDocumentRef.current = node;
      documentContentRef.current = null;
      draftDocumentRef.current = null;
      setCurrentDocument(node);
      setDocumentContent(null);
      setDraftDocument(null);
      setDocumentLoadState('loading');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);
      setExternalDocumentConflict(null);

      try {
        const rawContent = await readMarkdownDocument(
          snapshot.rootPath,
          node.absolutePath,
        );
        if (
          requestId !== documentOpenRequestIdRef.current ||
          snapshotRef.current?.rootPath !== snapshot.rootPath
        )
          return null;
        const rawDraft = createMarkdownDraft(rawContent, node.name);

        const { draft, content } = await compensateMarkdownDocument(
          snapshot.rootPath,
          node,
          rawContent,
          rawDraft,
        );
        if (
          requestId !== documentOpenRequestIdRef.current ||
          snapshotRef.current?.rootPath !== snapshot.rootPath
        )
          return null;

        documentContentRef.current = content;
        draftDocumentRef.current = draft;
        setDocumentContent(content);
        setDraftDocument(draft);
        lastSavedMarkdownRef.current = content.content;
        if (aiTurnDocumentBaselinesRef.current) {
          aiTurnDocumentBaselinesRef.current.set(
            node.absolutePath,
            content.content,
          );
        }
        setDocumentVersion((version) => version + 1);
        setDocumentLoadState('loaded');
        setSaveState('saved');
        setLastSavedAt(content.modifiedAt);
        return draft;
      } catch (documentError) {
        if (
          requestId !== documentOpenRequestIdRef.current ||
          snapshotRef.current?.rootPath !== snapshot.rootPath
        )
          return null;
        setDocumentContent(null);
        setDraftDocument(null);
        lastSavedMarkdownRef.current = '';
        setDocumentLoadState('error');
        setDocumentLoadError(
          documentError instanceof Error
            ? documentError.message
            : '无法读取文档内容',
        );
        return null;
      }
    },
    [clearPendingSave, clearPendingRename, saveCurrentDocumentNow, snapshot],
  );

  const prepareCurrentDocumentForAi = React.useCallback(async () => {
    const saved = await saveCurrentDocumentNow();
    if (!saved) return false;
    aiTurnDocumentBaselinesRef.current = new Map(
      currentDocument
        ? [[currentDocument.absolutePath, lastSavedMarkdownRef.current]]
        : [],
    );
    return true;
  }, [currentDocument, saveCurrentDocumentNow]);

  const finishAiDocumentSync = React.useCallback(() => {
    aiTurnDocumentBaselinesRef.current = null;
  }, []);

  const retryCurrentDocument = React.useCallback(() => {
    if (currentDocument) {
      void openDocument(currentDocument);
    }
  }, [currentDocument, openDocument]);

  const syncAppliedMarkdownDocument = React.useCallback(
    async (document: {
      content: string;
      modifiedAt: number | null;
      path: string;
    }) => {
      if (currentDocument?.absolutePath === document.path) {
        const modifiedAt = document.modifiedAt ?? Date.now();
        const content: MarkdownDocumentContent = {
          content: document.content,
          modifiedAt,
          path: document.path,
        };

        setDocumentContent(content);
        setDraftDocument(createMarkdownDraft(content, currentDocument.name));
        lastSavedMarkdownRef.current = document.content;
        setDocumentVersion((version) => version + 1);
        setSaveState('saved');
        setSaveError(null);
        setLastSavedAt(modifiedAt);
        clearPendingSave();
      }

      await refreshWorkspaceTree();
    },
    [clearPendingSave, currentDocument, refreshWorkspaceTree],
  );

  const syncExternalMarkdownDocument = React.useCallback(
    (document: MarkdownDocumentContent) => {
      const node = currentDocumentRef.current;
      const draft = draftDocumentRef.current;
      if (node?.absolutePath !== document.path || !draft)
        return 'ignored' as const;
      // A watcher is an invalidation signal; unchanged disk bytes are not a conflict.
      // Preserve dirty drafts and EditorViews on self-save/focus echoes. author: refinex
      if (
        document.content === lastSavedMarkdownRef.current &&
        !conflictRef.current
      ) {
        const baseline = { ...document };
        documentContentRef.current = baseline;
        setDocumentContent(baseline);
        return 'unchanged' as const;
      }
      const aiBaseline = aiTurnDocumentBaselinesRef.current?.get(document.path);
      if (
        (conflictRef.current?.path === document.path ||
          draft.markdown !== lastSavedMarkdownRef.current ||
          (aiBaseline !== undefined && draft.markdown !== aiBaseline)) &&
        draft.markdown !== document.content
      ) {
        clearPendingSave();
        clearPendingRename();
        const conflict = { externalDocument: document, path: document.path };
        conflictRef.current = conflict;
        setExternalDocumentConflict(conflict);
        setSaveState('error');
        setSaveError('文档已在外部修改，请选择保留本地草稿或加载磁盘版本。');
        return 'conflict' as const;
      }
      const nextDraft = createMarkdownDraft(document, node.name);
      const changed = draft.markdown !== document.content;
      documentContentRef.current = document;
      draftDocumentRef.current = nextDraft;
      setDocumentContent(document);
      setDraftDocument(nextDraft);
      lastSavedMarkdownRef.current = document.content;
      if (changed) setDocumentVersion((version) => version + 1);
      setSaveState('saved');
      setSaveError(null);
      setLastSavedAt(document.modifiedAt);
      conflictRef.current = null;
      setExternalDocumentConflict(null);
      clearPendingSave();
      return changed ? ('reloaded' as const) : ('unchanged' as const);
    },
    [clearPendingSave, clearPendingRename],
  );

  // Manual node-scoped refresh (right-click a directory or document). Rebuilds
  // just that subtree/node and, for the currently open document, re-aligns its
  // on-screen content with disk through the conflict-safe external sync path.
  // author: liyao

  const refreshWorkspaceNode = React.useCallback(
    async (node: WorkspaceNode, options?: { reloadDocument?: boolean }) => {
      const base = snapshotRef.current;

      if (!base) {
        return null;
      }

      const rootPath = base.rootPath;
      const targetPath = node.absolutePath;
      const generation = loadWorkspaceRequestIdRef.current;
      const requestId = ++treeRefreshIdRef.current;
      const refreshed = await refreshWorkspaceNodeApi(rootPath, targetPath);
      const latest = snapshotRef.current;

      if (
        !latest ||
        latest.rootPath !== rootPath ||
        generation !== loadWorkspaceRequestIdRef.current ||
        requestId !== treeRefreshIdRef.current
      )
        return null;
      if (latest) {
        const nextNodes = refreshed
          ? replaceWorkspaceNodeInList(latest.nodes, targetPath, refreshed)
          : removeWorkspaceNodeFromList(latest.nodes, targetPath);

        if (nextNodes !== latest.nodes) {
          setSnapshot({ ...latest, nodes: nextNodes });
        }
      }

      const activePath = currentDocumentRef.current?.absolutePath;
      if (
        options?.reloadDocument !== false &&
        activePath &&
        (activePath === targetPath ||
          (node.kind === 'directory' && isDescendantPath(activePath, targetPath)))
      ) {
        const freshContent = await readMarkdownDocument(rootPath, activePath);
        if (
          snapshotRef.current?.rootPath === rootPath &&
          generation === loadWorkspaceRequestIdRef.current
        ) {
          syncExternalMarkdownDocument(freshContent);
        }
      }

      return refreshed;
    },
    [setSnapshot, syncExternalMarkdownDocument],
  );

  const waitForPendingSave = React.useCallback(async () => {
    while (saveInFlightRef.current) await saveInFlightRef.current;
  }, []);
  const readExternalMarkdownDocument = React.useCallback(
    async (root: string, path: string) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitForPendingSave();
        const baseline = documentContentRef.current;
        const content = await readMarkdownDocument(root, path);
        if (
          currentDocumentRef.current?.absolutePath !== path ||
          (!saveInFlightRef.current && baseline === documentContentRef.current)
        )
          return content;
      }
      throw new Error('文档正在保存，请稍后重试刷新');
    },
    [waitForPendingSave],
  );

  const markExternalDocumentUnavailable = React.useCallback(() => {
    clearPendingSave();
    clearPendingRename();
    setSaveState('error');
    setSaveError('无法读取磁盘文档，已保留当前内容，请重试刷新或复制草稿。');
  }, [clearPendingSave, clearPendingRename]);

  const resolveExternalDocumentConflict = React.useCallback(
    async (resolution: 'external' | 'local') => {
      const conflict = conflictRef.current;
      const draftDocument = draftDocumentRef.current;
      if (!conflict || !snapshot || !currentDocument || !draftDocument) {
        return false;
      }

      try {
        if (resolution === 'external') {
          const normalized = await readMarkdownDocument(
            snapshot.rootPath,
            conflict.path,
          );
          if (
            snapshotRef.current?.rootPath !== snapshot.rootPath ||
            currentDocumentRef.current?.absolutePath !== conflict.path
          )
            return false;
          if (draftDocumentRef.current?.markdown !== draftDocument.markdown) {
            setSaveError('确认后草稿又有新的编辑，请重新选择要保留的版本。');
            return false;
          }
          const modifiedAt = normalized.modifiedAt;
          documentContentRef.current = normalized;
          draftDocumentRef.current = createMarkdownDraft(
            normalized,
            currentDocument.name,
          );
          conflictRef.current = null;
          setDocumentContent(normalized);
          setDraftDocument(createMarkdownDraft(normalized, currentDocument.name));
          lastSavedMarkdownRef.current = normalized.content;
          setDocumentVersion((version) => version + 1);
          setSaveState('saved');
          setSaveError(null);
          setLastSavedAt(modifiedAt);
          setExternalDocumentConflict(null);
          return true;
        }

        const meta = await saveMarkdownDocument(
          snapshot.rootPath,
          currentDocument.absolutePath,
          draftDocument.markdown,
          conflict.externalDocument.modifiedAt,
          conflict.externalDocument.content,
        );
        if (
          snapshotRef.current?.rootPath !== snapshot.rootPath ||
          currentDocumentRef.current?.absolutePath !== conflict.path
        )
          return false;
        const content = {
          content: draftDocument.markdown,
          modifiedAt: meta.modifiedAt,
          path: meta.path,
        };
        documentContentRef.current = content;
        const latestDraft = draftDocumentRef.current ?? draftDocument;
        const hasNewerDraft = latestDraft.markdown !== draftDocument.markdown;
        draftDocumentRef.current = {
          ...latestDraft,
          modifiedAt: meta.modifiedAt,
        };
        conflictRef.current = null;
        setDocumentContent(content);
        setDraftDocument(draftDocumentRef.current);
        lastSavedMarkdownRef.current = draftDocument.markdown;
        setDocumentVersion((version) => version + 1);
        setSaveState(hasNewerDraft ? 'dirty' : 'saved');
        setSaveError(null);
        setLastSavedAt(meta.modifiedAt);
        setExternalDocumentConflict(null);
        return true;
      } catch (error) {
        setSaveState('error');
        setSaveError(getWorkspaceErrorMessage(error, '无法覆盖外部修改后的文档'));
        return false;
      }
    },
    [currentDocument, snapshot],
  );

  const selectDirectory = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'directory') {
        return;
      }

      if (conflictRef.current || !(await saveCurrentDocumentNow())) return;

      resetDocumentState();
      setCurrentDirectoryPath(node.absolutePath);
    },
    [resetDocumentState, saveCurrentDocumentNow, snapshot],
  );

  const renameNode = React.useCallback(
    async (
      node: WorkspaceNode,
      newName: string,
      draftOverride?: MarkdownDraft,
    ) => {
      if (!snapshot) {
        return null;
      }

      const activeDraft = draftOverride ?? draftDocument;
      if (conflictRef.current?.path === node.absolutePath) return null;

      if (
        currentDocument?.absolutePath === node.absolutePath &&
        (saveState === 'dirty' || saveState === 'saving')
      ) {
        if (!(await saveCurrentDocumentNow(activeDraft))) return null;
      }

      const renamed = await renameWorkspaceNode(
        snapshot.rootPath,
        node.absolutePath,
        newName,
      );

      // Incremental update: swap the renamed subtree in place. Rename keeps the
      // node's timestamps (and drops any manual rank, matching a full rescan),
      // so ordering stays consistent without a whole-tree reload. author: liyao
      const baseSnapshot = snapshotRef.current;
      if (baseSnapshot) {
        const nextNodes = replaceWorkspaceNodeInList(
          baseSnapshot.nodes,
          node.absolutePath,
          renamed,
        );

        if (nextNodes !== baseSnapshot.nodes) {
          setSnapshot({ ...baseSnapshot, nodes: nextNodes });
        }
      }

      if (currentDocument?.absolutePath === node.absolutePath) {
        if (renamed.kind === 'document') {
          setCurrentDocument(renamed);

          if (isRenamingRef.current && activeDraft) {
            // H1 同步：保持内存 draft（保留原始 H1），保存到新路径覆盖 Rust 规范化内容
            const saveMeta = await saveMarkdownDocument(
              snapshot.rootPath,
              renamed.absolutePath,
              activeDraft.markdown,
              null,
            );
            setDocumentContent({
              content: activeDraft.markdown,
              modifiedAt: saveMeta.modifiedAt,
              path: saveMeta.path,
            });
            setDraftDocument((prev) =>
              prev
                ? { ...prev, modifiedAt: saveMeta.modifiedAt, path: saveMeta.path }
                : null,
            );
            lastSavedMarkdownRef.current = activeDraft.markdown;
            setLastSavedAt(saveMeta.modifiedAt);
            setSaveState('saved');
          } else if (draftDocument) {
            // 文件树重命名：从磁盘读取 Rust 更新后的内容，平滑更新编辑器
            const freshContent = await readMarkdownDocument(
              snapshot.rootPath,
              renamed.absolutePath,
            );
            const freshDraft = createMarkdownDraft(freshContent, renamed.name);
            setDocumentContent(freshContent);
            setDraftDocument(freshDraft);
            lastSavedMarkdownRef.current = freshContent.content;
            setLastSavedAt(freshContent.modifiedAt);
            setSaveState('saved');
          }
        } else {
          resetDocumentState();
        }
      }

      if (currentDirectoryPath === node.absolutePath) {
        if (renamed.kind === 'directory') {
          setCurrentDirectoryPath(renamed.absolutePath);
        } else {
          setCurrentDirectoryPath(null);
        }
      }

      return renamed;
    },
    [snapshot, draftDocument, currentDocument?.absolutePath, saveState, currentDirectoryPath, saveCurrentDocumentNow, setSnapshot, resetDocumentState],
  );

  const updateMarkdown = React.useCallback(
    (
      nextMarkdown: string,
      options?: {
        readonly preserveSource?: boolean;
        readonly saveImmediately?: boolean;
        readonly deferSave?: boolean;
      },
    ) => {
      const currentDraft = draftDocumentRef.current;

      if (!currentDraft) {
        return;
      }
      if (nextMarkdown === currentDraft.markdown) {
        if (options?.saveImmediately) {
          return saveCurrentDocumentNow(currentDraft);
        }
        return;
      }

      const nextDraft = options?.preserveSource
        ? createSourceMarkdownDraft(
            currentDraft,
            nextMarkdown,
            currentDocument?.name ?? '',
          )
        : withUpdatedMarkdown(currentDraft, nextMarkdown);
      const titleChanged =
        nextDraft.metadata.title !== currentDraft.metadata.title;
      const shouldDebounceSourceRename = options?.preserveSource === true;

      draftDocumentRef.current = nextDraft;
      setDraftDocument(nextDraft);

      if (shouldDebounceSourceRename) {
        clearPendingRename();
      }

      if (nextDraft.markdown === lastSavedMarkdownRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      if (options?.deferSave || conflictRef.current?.path === currentDocument?.absolutePath) {
        clearPendingRename();
        return;
      }

      if (options?.saveImmediately) {
        return saveCurrentDocumentNow(nextDraft);
      } else {
        pendingSaveTimerRef.current = setTimeout(() => {
          void saveCurrentDocumentNow(nextDraft);
        }, 800);
      }

      if (
        (titleChanged || shouldDebounceSourceRename) &&
        !isRenamingRef.current &&
        currentDocument
      ) {
        const newFileName = sanitizeTitleForFileName(nextDraft.metadata.title);
        const currentFileName = currentDocument.name.replace(/\.md$/i, '');

        if (newFileName !== currentFileName) {
          if (!shouldDebounceSourceRename) {
            clearPendingRename();
          }
          const targetNode = currentDocument;

          pendingRenameTimerRef.current = setTimeout(() => {
            isRenamingRef.current = true;
            void renameNode(targetNode, newFileName, nextDraft).finally(() => {
              isRenamingRef.current = false;
            });
          }, 300);
        }
      }
    },
    [clearPendingSave, clearPendingRename, currentDocument, renameNode, saveCurrentDocumentNow],
  );

  const createDocument = React.useCallback(
    async (parentPath = '') => {
      if (!snapshot) {
        return null;
      }

      const created = await createMarkdownDocument(
        snapshot.rootPath,
        parentPath,
        '未命名文档',
      );
      setPendingRenameNodePath(created.node.absolutePath);
      const nextSnapshot = insertWorkspaceNode(
        snapshot,
        parentPath,
        created.node,
      );

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      } else {
        await refreshWorkspaceTree();
      }
      await openDocument(created.node);

      return created.node;
    },
    [openDocument, refreshWorkspaceTree, setSnapshot, snapshot],
  );

  const createDirectory = React.useCallback(
    async (parentPath = '') => {
      if (!snapshot) {
        return null;
      }

      const created = await createWorkspaceDirectory(
        snapshot.rootPath,
        parentPath,
        '未命名目录',
      );
      setPendingRenameNodePath(created.absolutePath);
      const nextSnapshot = insertWorkspaceNode(snapshot, parentPath, created);

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      } else {
        await refreshWorkspaceTree();
      }

      return created;
    },
    [refreshWorkspaceTree, setSnapshot, snapshot],
  );
  const currentDocumentPath = currentDocument?.absolutePath ?? null;

  const searchResults = React.useMemo(
    () => (snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : []),
    [snapshot, searchQuery],
  );

  const deleteNode = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot) {
        return;
      }

      await deleteWorkspaceNode(snapshot.rootPath, node.absolutePath);

      const baseSnapshot = snapshotRef.current;
      if (baseSnapshot) {
        const nextNodes = removeWorkspaceNodeFromList(
          baseSnapshot.nodes,
          node.absolutePath,
        );

        if (nextNodes !== baseSnapshot.nodes) {
          setSnapshot({ ...baseSnapshot, nodes: nextNodes });
        }
      }

      if (
        currentDocumentPath === node.absolutePath ||
        (node.kind === 'directory' &&
          currentDocumentPath &&
          isDescendantPath(currentDocumentPath, node.absolutePath))
      ) {
        resetDocumentState();
      }

      if (
        currentDirectoryPath === node.absolutePath ||
        (node.kind === 'directory' &&
          currentDirectoryPath &&
          isDescendantPath(currentDirectoryPath, node.absolutePath))
      ) {
        setCurrentDirectoryPath(null);
      }
    },
    [snapshot, currentDocumentPath, currentDirectoryPath, setSnapshot, resetDocumentState],
  );

  const moveNode = React.useCallback(
    async (request: WorkspaceMoveRequest) => {
      if (!snapshot) {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      const movedSnapshot = await moveWorkspaceNode(snapshot.rootPath, request);
      setSnapshot(movedSnapshot);

      if (currentDirectoryPath) {
        const movedDirectoryPath = getMovedNodePath(
          currentDirectoryPath,
          request,
        );
        const movedDirectory = findNodeByAbsolutePath(
          movedSnapshot.nodes,
          movedDirectoryPath,
        );

        setCurrentDirectoryPath(
          movedDirectory?.kind === 'directory'
            ? movedDirectory.absolutePath
            : null,
        );
      }

      if (!currentDocument) {
        return;
      }

      const movedDocumentPath = getMovedNodePath(
        currentDocument.absolutePath,
        request,
      );
      const movedDocument = findNodeByAbsolutePath(
        movedSnapshot.nodes,
        movedDocumentPath,
      );

      if (movedDocument?.kind === 'document') {
        setCurrentDocument(movedDocument);
        return;
      }

      if (!findNodeByAbsolutePath(movedSnapshot.nodes, currentDocument.absolutePath)) {
        resetDocumentState();
      }
    },
    [snapshot, saveState, setSnapshot, currentDirectoryPath, currentDocument, saveCurrentDocumentNow, draftDocument, resetDocumentState],
  );

  const updateNodeState = React.useCallback(
    async (
      node: WorkspaceNode,
      state: { locked?: boolean; pinned?: boolean },
    ) => {
      if (!snapshot) {
        return null;
      }

      const nextSnapshot = await setWorkspaceNodeState(
        snapshot.rootPath,
        node.absolutePath,
        state,
      );

      setSnapshot(nextSnapshot);

      const nextNode = findNodeByAbsolutePath(
        nextSnapshot.nodes,
        node.absolutePath,
      );

      if (
        nextNode?.kind === 'document' &&
        currentDocument?.absolutePath === node.absolutePath
      ) {
        setCurrentDocument(nextNode);
      }

      if (
        nextNode?.kind === 'directory' &&
        currentDirectoryPath === node.absolutePath
      ) {
        setCurrentDirectoryPath(nextNode.absolutePath);
      }

      return nextNode;
    },
    [currentDirectoryPath, currentDocument?.absolutePath, setSnapshot, snapshot],
  );

  const updateTreeNodeAppearance = React.useCallback(
    async (node: WorkspaceNode, appearance: TreeNodeAppearance | null) => {
      if (!snapshot || node.kind !== 'directory') {
        return null;
      }

      const nextSnapshot = await setTreeNodeAppearance(
        snapshot.rootPath,
        node.absolutePath,
        appearance,
      );
      setSnapshot(nextSnapshot);

      return findNodeByAbsolutePath(nextSnapshot.nodes, node.absolutePath);
    },
    [setSnapshot, snapshot],
  );

  const workspaceHistory = React.useMemo(() => {
    return storedWorkspaceHistory;
  }, [storedWorkspaceHistory]);

  const removeWorkspace = React.useCallback(
    (rootPath: string) => {
      setStoredWorkspaceHistory(removeWorkspaceHistory(rootPath));

      if (snapshot?.rootPath === rootPath) {
        suppressNextAutoRestoreRef.current = true;
        setSnapshot(null);
        resetDocumentState();
        setSearchQuery('');
        setError(null);
      }
    },
    [resetDocumentState, setSnapshot, snapshot?.rootPath],
  );

  const openWorkspace = React.useCallback(async () => {
    // Invalidate any in-flight auto-restore before the folder dialog blocks.
    loadWorkspaceRequestIdRef.current += 1;
    setIsLoading(false);
    setError(null);

    try {
      const selected = await selectWorkspaceRoot();

      if (!selected) {
        return;
      }

      await loadWorkspace(selected);
    } catch (openWorkspaceError) {
      setError({
        message: getWorkspaceErrorMessage(
          openWorkspaceError,
          '无法打开工作区，请重新选择文件夹。',
        ),
        recoverable: true,
      });
      setIsLoading(false);
    }
  }, [loadWorkspace]);

  const createWorkspace = React.useCallback(
    async (parentPath: string, workspaceName: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const nextSnapshot = await createWorkspaceRoot(parentPath, workspaceName);
        const metadata = await ensureWorkspace(nextSnapshot.rootPath).catch(
          () => null,
        );

        setSnapshot(nextSnapshot);
        setInitialRecentDocumentPaths(metadata?.recentDocumentPaths ?? []);
        resetDocumentState();
        saveRecentWorkspacePath(nextSnapshot.rootPath);
        setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
      } catch (createWorkspaceError) {
        setError({
          message:
            getWorkspaceErrorMessage(
              createWorkspaceError,
              '无法创建工作区，请检查名称和所在目录。',
            ),
          recoverable: true,
        });
        throw createWorkspaceError;
      } finally {
        setIsLoading(false);
      }
    },
    [resetDocumentState, setSnapshot],
  );

  const chooseWorkspaceParentDirectory = React.useCallback(async () => {
    return selectWorkspaceParentDirectory();
  }, []);

  const cancelBrandMigration = React.useCallback(() => {
    suppressNextAutoRestoreRef.current = true;
    setPendingBrandMigration(null);
  }, []);

  const migratePendingBrandWorkspace = React.useCallback(async () => {
    const pending = pendingBrandMigration;
    if (!pending || pending.state !== 'legacy') {
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const report = await migrateLegacyWorkspaceBrand(pending.rootPath);
      setBrandMigrationReport(report);
      setPendingBrandMigration(null);
      await loadWorkspace(pending.rootPath, { skipBrandInspection: true });
      return report;
    } catch (migrationError) {
      setIsLoading(false);
      throw migrationError;
    }
  }, [loadWorkspace, pendingBrandMigration]);

  const clearBrandMigrationReport = React.useCallback(() => {
    setBrandMigrationReport(null);
  }, []);

  const clearPendingRenameNode = React.useCallback(() => {
    setPendingRenameNodePath(null);
  }, []);

  React.useEffect(() => {
    if (pendingBrandMigration) {
      return;
    }

    if (snapshot) {
      autoRestoreAttemptedRef.current = false;
      return;
    }

    if (suppressNextAutoRestoreRef.current) {
      suppressNextAutoRestoreRef.current = false;
      return;
    }

    if (autoRestoreAttemptedRef.current) {
      return;
    }

    const recentPath = getRecentWorkspacePath();

    if (recentPath) {
      autoRestoreAttemptedRef.current = true;
      queueMicrotask(() => {
        void loadWorkspace(recentPath, { reason: 'auto-restore' });
      });
    }
  }, [loadWorkspace, pendingBrandMigration, snapshot]);

  React.useEffect(() => {
    return () => {
      clearPendingSave();
      clearPendingRename();
    };
  }, [clearPendingSave, clearPendingRename]);

  return {
    readExternalMarkdownDocument,
    waitForPendingSave,
    markExternalDocumentUnavailable,
    brandMigrationReport,
    cancelBrandMigration,
    chooseWorkspaceParentDirectory,
    clearBrandMigrationReport,
    clearCurrentDocument: resetDocumentState,
    createDirectory,
    createDocument,
    createWorkspace,
    currentDirectory,
    currentDocument,
    documentContent,
    documentLoadError,
    documentLoadState,
    documentVersion,
    draftDocument,
    externalDocumentConflict,
    finishAiDocumentSync,
    deleteNode,
    error,
    initialRecentDocumentPaths,
    isLoading,
    isSidebarCollapsed,
    lastSavedAt,
    migratePendingBrandWorkspace,
    moveNode,
    openDocument,
    selectDirectory,
    openWorkspace,
    pendingBrandMigration,
    pendingRenameNodePath,
    prepareCurrentDocumentForAi,
    refreshWorkspaceNode,
    refreshWorkspaceNodes,
    refreshWorkspaceTree,
    resolveExternalDocumentConflict,
    retryCurrentDocument,
    renameNode,
    rightPanelMode,
    saveCurrentDocumentNow,
    saveError,
    saveState,
    searchQuery,
    searchResults,
    setCurrentDocument,
    setRightPanelMode,
    setSearchQuery,
    setSidebarCollapsed,
    syncAppliedMarkdownDocument,
    syncExternalMarkdownDocument,
    clearPendingRenameNode,
    snapshot,
    switchWorkspace: loadWorkspace,
    updateMarkdown,
    updateNodeState,
    updateTreeNodeAppearance,
    workspaceHistory,
    removeWorkspace,
  };
}

function getWorkspaceErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string') {
    return error || fallback;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function createMarkdownDraft(
  content: MarkdownDocumentContent,
  fileName: string,
): MarkdownDraft {
  const parsed = parseMarkdownMetadata(content.content, fileName);

  return {
    markdown: content.content,
    metadata: parsed.metadata,
    modifiedAt: content.modifiedAt,
    path: content.path,
  };
}

function withUpdatedMarkdown(
  draft: MarkdownDraft,
  markdown: string,
): MarkdownDraft {
  const parsed = parseMarkdownMetadata(markdown, '');
  const h1Text = extractH1FromMarkdown(parsed.body);
  const metadata = {
    ...draft.metadata,
    updatedAt: new Date().toISOString(),
    ...(h1Text !== null && h1Text !== '' ? { title: h1Text } : {}),
  };

  const nextMarkdown = serializeFrontmatter({ body: parsed.body, metadata });

  return {
    ...draft,
    markdown: nextMarkdown,
    metadata,
  };
}

async function compensateMarkdownDocument(
  rootPath: string,
  node: WorkspaceNode,
  content: MarkdownDocumentContent,
  draft: MarkdownDraft,
): Promise<{ draft: MarkdownDraft; content: MarkdownDocumentContent }> {
  const fileStem = node.name.replace(/\.md$/i, '');
  const parsed = parseMarkdownMetadata(content.content, node.name);
  const needsFrontmatter = !FRONTMATTER_OPENING_PATTERN.test(content.content);
  const hasH1InBody = /^#{1}\s+\S/m.test(parsed.body);
  const needsH1 = !hasH1InBody;

  if (!needsH1 && !needsFrontmatter) {
    return { draft, content };
  }

  const title = draft.metadata.title || fileStem;
  const h1Prefix = needsH1 ? `# ${title}\n\n` : '';
  const body = needsH1 ? `${h1Prefix}${parsed.body}` : parsed.body;
  const metadata = {
    ...draft.metadata,
    title,
    createdAt: draft.metadata.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const markdown = serializeFrontmatter({ body, metadata });

  const meta = await saveMarkdownDocument(
    rootPath,
    node.absolutePath,
    markdown,
    content.modifiedAt,
    content.content,
  );

  const compensatedContent: MarkdownDocumentContent = {
    content: markdown,
    modifiedAt: meta.modifiedAt,
    path: meta.path,
  };

  return {
    content: compensatedContent,
    draft: createMarkdownDraft(compensatedContent, node.name),
  };
}

function findNodeByAbsolutePath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath) {
      return node;
    }

    const child = node.children
      ? findNodeByAbsolutePath(node.children, absolutePath)
      : null;

    if (child) {
      return child;
    }
  }

  return null;
}

function findDirectoryNodeByAbsolutePath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  const node = findNodeByAbsolutePath(nodes, absolutePath);

  return node?.kind === 'directory' ? node : null;
}

function stripTrailingSeparators(path: string) {
  return path.replace(/[/\\]+$/, '');
}

// Walk up from an entry's parent directory to the nearest ancestor that already
// exists in the tree, so a rebuilt subtree has a valid merge point even when the
// change introduced brand-new intermediate directories. Returns `null` when the
// affected directory is the workspace root (caller must do a full rescan).
// author: liyao
function resolveExistingDirectoryTarget(
  snapshot: WorkspaceSnapshot,
  entryPath: string,
  rootPath: string,
): string | null {
  const normalizedRoot = stripTrailingSeparators(rootPath);
  let directory = getParentPath(entryPath);
  let guard = 0;

  while (
    directory &&
    stripTrailingSeparators(directory) !== normalizedRoot &&
    guard < 512
  ) {
    if (findDirectoryNodeByAbsolutePath(snapshot.nodes, directory)) {
      return directory;
    }

    const parent = getParentPath(directory);

    if (parent === directory) {
      break;
    }

    directory = parent;
    guard += 1;
  }

  return null;
}

function dropNestedPaths(paths: string[]): string[] {
  return paths.filter(
    (path) =>
      !paths.some((other) => other !== path && isDescendantPath(path, other)),
  );
}

function replaceWorkspaceNodeInList(
  nodes: WorkspaceNode[],
  targetPath: string,
  replacement: WorkspaceNode,
): WorkspaceNode[] {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (node.absolutePath === targetPath) {
      changed = true;
      return replacement;
    }

    if (node.children && node.children.length > 0) {
      const nextChildren = replaceWorkspaceNodeInList(
        node.children,
        targetPath,
        replacement,
      );

      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
    }

    return node;
  });

  return changed ? nextNodes : nodes;
}

function removeWorkspaceNodeFromList(
  nodes: WorkspaceNode[],
  targetPath: string,
): WorkspaceNode[] {
  let changed = false;
  const nextNodes: WorkspaceNode[] = [];

  for (const node of nodes) {
    if (node.absolutePath === targetPath) {
      changed = true;
      continue;
    }

    if (node.children && node.children.length > 0) {
      const nextChildren = removeWorkspaceNodeFromList(node.children, targetPath);

      if (nextChildren !== node.children) {
        changed = true;
        nextNodes.push({ ...node, children: nextChildren });
        continue;
      }
    }

    nextNodes.push(node);
  }

  return changed ? nextNodes : nodes;
}

function insertWorkspaceNode(
  snapshot: WorkspaceSnapshot,
  parentPath: string,
  node: WorkspaceNode,
): WorkspaceSnapshot | null {
  if (!parentPath) {
    return {
      ...snapshot,
      nodes: [...snapshot.nodes, node],
    };
  }

  const nextNodes = insertWorkspaceNodeIntoChildren(
    snapshot.nodes,
    parentPath,
    node,
  );

  if (!nextNodes) {
    return null;
  }

  return {
    ...snapshot,
    nodes: nextNodes,
  };
}

function insertWorkspaceNodeIntoChildren(
  nodes: WorkspaceNode[],
  parentPath: string,
  node: WorkspaceNode,
): WorkspaceNode[] | null {
  let inserted = false;
  const nextNodes = nodes.map((currentNode) => {
    if (
      currentNode.kind === 'directory' &&
      (currentNode.relativePath === parentPath ||
        currentNode.absolutePath === parentPath)
    ) {
      inserted = true;

      return {
        ...currentNode,
        children: [...(currentNode.children ?? []), node],
      };
    }

    if (currentNode.kind !== 'directory' || !currentNode.children) {
      return currentNode;
    }

    const nextChildren = insertWorkspaceNodeIntoChildren(
      currentNode.children,
      parentPath,
      node,
    );

    if (!nextChildren) {
      return currentNode;
    }

    inserted = true;

    return {
      ...currentNode,
      children: nextChildren,
    };
  });

  return inserted ? nextNodes : null;
}

function getMovedNodePath(
  currentPath: string,
  request: WorkspaceMoveRequest,
) {
  if (
    currentPath !== request.nodePath &&
    !isDescendantPath(currentPath, request.nodePath)
  ) {
    return currentPath;
  }

  const targetParentPath =
    request.position === 'inside'
      ? request.targetPath
      : getParentPath(request.targetPath);
  const movedNodeName = getBaseName(request.nodePath);
  const descendantSuffix = currentPath.slice(request.nodePath.length);

  return joinPath(targetParentPath, `${movedNodeName}${descendantSuffix}`);
}

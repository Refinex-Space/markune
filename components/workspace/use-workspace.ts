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
  loadWorkspaceTree,
  moveWorkspaceNode,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  readMarkdownSourceFiles,
  readMarkdownDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
  setWorkspaceNodeState,
} from './workspace-api';
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
import { searchWorkspace } from './workspace-tree';
import type {
  DocumentLoadState,
  DocumentSaveState,
  MarkdownDocumentContent,
  MarkdownDraft,
  RightPanelMode,
  WorkspaceLoadError,
  WorkspaceHistoryItem,
  WorkspaceMoveRequest,
  WorkspaceNode,
  WorkspaceSnapshot,
} from './workspace-types';

const FRONTMATTER_OPENING_PATTERN = /^---\r?\n/;

export function useWorkspace(initialSnapshot?: WorkspaceSnapshot | null) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [currentDocument, setCurrentDocument] =
    React.useState<WorkspaceNode | null>(null);
  const [currentDirectoryPath, setCurrentDirectoryPath] = React.useState<
    string | null
  >(null);
  const [documentContent, setDocumentContent] =
    React.useState<MarkdownDocumentContent | null>(null);
  const [draftDocument, setDraftDocument] =
    React.useState<MarkdownDraft | null>(null);
  const [documentLoadState, setDocumentLoadState] =
    React.useState<DocumentLoadState>('idle');
  const [documentLoadError, setDocumentLoadError] = React.useState<
    string | null
  >(null);
  const [documentVersion, setDocumentVersion] = React.useState(0);
  const [saveState, setSaveState] = React.useState<DocumentSaveState>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [pendingRenameNodePath, setPendingRenameNodePath] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<WorkspaceLoadError | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [rightPanelMode, setRightPanelMode] =
    React.useState<RightPanelMode>(null);
  const [storedWorkspaceHistory, setStoredWorkspaceHistory] = React.useState<
    WorkspaceHistoryItem[]
  >(() => getWorkspaceHistory());
  const [initialRecentDocumentPaths, setInitialRecentDocumentPaths] =
    React.useState<string[]>([]);

  const suppressNextAutoRestoreRef = React.useRef(false);
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
    setPendingRenameNodePath(null);
    lastSavedMarkdownRef.current = '';
  }, [clearPendingSave, clearPendingRename]);

  const refreshWorkspaceTree = React.useCallback(async () => {
    if (!snapshot) {
      return null;
    }

    const nextSnapshot = await loadWorkspaceTree(snapshot.rootPath);
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [snapshot]);

  const loadWorkspace = React.useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextSnapshot, metadata] = await Promise.all([
        loadWorkspaceTree(rootPath),
        ensureWorkspace(rootPath).catch(() => null),
      ]);
      setSnapshot(nextSnapshot);
      setInitialRecentDocumentPaths(
        metadata?.recentDocumentPaths ?? [],
      );
      resetDocumentState();
      saveRecentWorkspacePath(nextSnapshot.rootPath);
      setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
    } catch {
      setError({
        message: '无法读取工作区，请重新选择文件夹。',
        recoverable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [resetDocumentState]);

  const saveCurrentDocumentNow = React.useCallback(
    async (draftOverride?: MarkdownDraft | null) => {
      if (!snapshot || !currentDocument || currentDocument.kind !== 'document') {
        return;
      }

      const draft = draftOverride ?? draftDocument;

      if (!draft) {
        return;
      }

      clearPendingSave();

      if (draft.markdown === lastSavedMarkdownRef.current) {
        setSaveState('saved');
        return;
      }

      setSaveState('saving');
      setSaveError(null);

      try {
        const meta = await saveMarkdownDocument(
          snapshot.rootPath,
          currentDocument.absolutePath,
          draft.markdown,
          documentContent?.modifiedAt ?? null,
        );

        lastSavedMarkdownRef.current = draft.markdown;
        setDocumentContent({
          content: draft.markdown,
          modifiedAt: meta.modifiedAt,
          path: meta.path,
        });
        setDraftDocument({
          ...draft,
          modifiedAt: meta.modifiedAt,
          path: meta.path,
        });
        setLastSavedAt(meta.modifiedAt);
        setSaveState('saved');
      } catch (saveDocumentError) {
        setSaveState('error');
        setSaveError(
          saveDocumentError instanceof Error
            ? saveDocumentError.message
            : '无法保存 Markdown 文档内容',
        );
      }
    },
    [clearPendingSave, currentDocument, documentContent, draftDocument, snapshot],
  );

  const openDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'document') {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      clearPendingSave();
      clearPendingRename();
      setCurrentDirectoryPath(null);
      setCurrentDocument(node);
      setDocumentContent(null);
      setDraftDocument(null);
      setDocumentLoadState('loading');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);

      try {
        const rawContent = await readMarkdownDocument(
          snapshot.rootPath,
          node.absolutePath,
        );
        const rawDraft = createMarkdownDraft(rawContent, node.name);

        const { draft, content } = await compensateMarkdownDocument(
          snapshot.rootPath,
          node,
          rawContent,
          rawDraft,
        );

        setDocumentContent(content);
        setDraftDocument(draft);
        lastSavedMarkdownRef.current = content.content;
        setDocumentVersion((version) => version + 1);
        setDocumentLoadState('loaded');
        setSaveState('saved');
        setLastSavedAt(content.modifiedAt);
        return draft;
      } catch (documentError) {
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
    [
      clearPendingSave,
      clearPendingRename,
      draftDocument,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

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
        const content: MarkdownDocumentContent = {
          content: document.content,
          modifiedAt: document.modifiedAt,
          path: document.path,
        };

        setDocumentContent(content);
        setDraftDocument(createMarkdownDraft(content, currentDocument.name));
        lastSavedMarkdownRef.current = document.content;
        setDocumentVersion((version) => version + 1);
        setSaveState('saved');
        setSaveError(null);
        setLastSavedAt(document.modifiedAt);
        clearPendingSave();
      }

      await refreshWorkspaceTree();
    },
    [clearPendingSave, currentDocument, refreshWorkspaceTree],
  );

  const selectDirectory = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot || node.kind !== 'directory') {
        return;
      }

      if (saveState === 'dirty' || saveState === 'saving') {
        await saveCurrentDocumentNow(draftDocument);
      }

      clearPendingSave();
      setCurrentDocument(null);
      setCurrentDirectoryPath(node.absolutePath);
      setDocumentContent(null);
      setDraftDocument(null);
      setDocumentLoadState('idle');
      setDocumentLoadError(null);
      setSaveState('idle');
      setSaveError(null);
      setLastSavedAt(null);
      lastSavedMarkdownRef.current = '';
    },
    [
      clearPendingSave,
      draftDocument,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const renameNode = React.useCallback(
    async (node: WorkspaceNode, newName: string) => {
      if (!snapshot) {
        return null;
      }

      if (
        currentDocument?.absolutePath === node.absolutePath &&
        (saveState === 'dirty' || saveState === 'saving')
      ) {
        await saveCurrentDocumentNow(draftDocument);
      }

      const renamed = await renameWorkspaceNode(
        snapshot.rootPath,
        node.absolutePath,
        newName,
      );
      await refreshWorkspaceTree();

      if (currentDocument?.absolutePath === node.absolutePath) {
        if (renamed.kind === 'document') {
          setCurrentDocument(renamed);

          if (isRenamingRef.current && draftDocument) {
            // H1 同步：保持内存 draft（保留原始 H1），保存到新路径覆盖 Rust 规范化内容
            const saveMeta = await saveMarkdownDocument(
              snapshot.rootPath,
              renamed.absolutePath,
              draftDocument.markdown,
              null,
            );
            setDocumentContent({
              content: draftDocument.markdown,
              modifiedAt: saveMeta.modifiedAt,
              path: saveMeta.path,
            });
            setDraftDocument((prev) =>
              prev
                ? { ...prev, modifiedAt: saveMeta.modifiedAt, path: saveMeta.path }
                : null,
            );
            lastSavedMarkdownRef.current = draftDocument.markdown;
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
    [
      currentDocument?.absolutePath,
      currentDirectoryPath,
      draftDocument,
      refreshWorkspaceTree,
      resetDocumentState,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const updateMarkdown = React.useCallback(
    (nextMarkdown: string) => {
      if (!draftDocument) {
        return;
      }

      const nextDraft = withUpdatedMarkdown(draftDocument, nextMarkdown);
      const titleChanged =
        nextDraft.metadata.title !== draftDocument.metadata.title;

      setDraftDocument(nextDraft);

      if (nextDraft.markdown === lastSavedMarkdownRef.current) {
        clearPendingSave();
        setSaveState('saved');
        setSaveError(null);
        return;
      }

      setSaveState('dirty');
      setSaveError(null);
      clearPendingSave();
      pendingSaveTimerRef.current = setTimeout(() => {
        void saveCurrentDocumentNow(nextDraft);
      }, 800);

      if (titleChanged && !isRenamingRef.current && currentDocument) {
        const newFileName = sanitizeTitleForFileName(nextDraft.metadata.title);
        const currentFileName = currentDocument.name.replace(/\.md$/i, '');

        if (newFileName !== currentFileName) {
          clearPendingRename();
          const targetNode = currentDocument;

          pendingRenameTimerRef.current = setTimeout(() => {
            isRenamingRef.current = true;
            void renameNode(targetNode, newFileName).finally(() => {
              isRenamingRef.current = false;
            });
          }, 300);
        }
      }
    },
    [
      clearPendingSave,
      clearPendingRename,
      currentDocument,
      draftDocument,
      renameNode,
      saveCurrentDocumentNow,
    ],
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
    [openDocument, refreshWorkspaceTree, snapshot],
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
    [refreshWorkspaceTree, snapshot],
  );
  const currentDocumentPath = currentDocument?.absolutePath ?? null;

  const deleteNode = React.useCallback(
    async (node: WorkspaceNode) => {
      if (!snapshot) {
        return;
      }

      await deleteWorkspaceNode(snapshot.rootPath, node.absolutePath);
      await refreshWorkspaceTree();

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
    [
      currentDocumentPath,
      currentDirectoryPath,
      refreshWorkspaceTree,
      resetDocumentState,
      snapshot,
    ],
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
    [
      currentDocument,
      currentDirectoryPath,
      draftDocument,
      resetDocumentState,
      saveCurrentDocumentNow,
      saveState,
      snapshot,
    ],
  );

  const importMarkdownDocuments = React.useCallback(
    async (targetDir = '') => {
      if (!snapshot) {
        return;
      }

      const selected = await selectMarkdownSourceFiles();

      if (selected.length === 0) {
        return;
      }

      const sourceFiles = await readMarkdownSourceFiles(selected);
      const createdNodes: WorkspaceNode[] = [];

      for (const source of sourceFiles) {
        const title = parseMarkdownMetadata(source.content, source.fileName)
          .metadata.title;
        const created = await createMarkdownDocument(
          snapshot.rootPath,
          targetDir,
          title,
        );

        await saveMarkdownDocument(
          snapshot.rootPath,
          created.node.absolutePath,
          source.content,
          created.content.modifiedAt,
        );
        createdNodes.push(created.node);
      }

      await refreshWorkspaceTree();

      if (createdNodes[0]) {
        await openDocument(createdNodes[0]);
      }
    },
    [openDocument, refreshWorkspaceTree, snapshot],
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
    [currentDirectoryPath, currentDocument?.absolutePath, snapshot],
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
    [resetDocumentState, snapshot?.rootPath],
  );

  const openWorkspace = React.useCallback(async () => {
    const selected = await selectWorkspaceRoot();

    if (!selected) {
      return;
    }

    await loadWorkspace(selected);
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
    [resetDocumentState],
  );

  const chooseWorkspaceParentDirectory = React.useCallback(async () => {
    return selectWorkspaceParentDirectory();
  }, []);

  const clearPendingRenameNode = React.useCallback(() => {
    setPendingRenameNodePath(null);
  }, []);

  React.useEffect(() => {
    if (snapshot) {
      return;
    }

    if (suppressNextAutoRestoreRef.current) {
      suppressNextAutoRestoreRef.current = false;
      return;
    }

    const recentPath = getRecentWorkspacePath();

    if (recentPath) {
      queueMicrotask(() => {
        void loadWorkspace(recentPath);
      });
    }
  }, [loadWorkspace, snapshot]);

  React.useEffect(() => {
    return () => {
      clearPendingSave();
      clearPendingRename();
    };
  }, [clearPendingSave, clearPendingRename]);

  return {
    chooseWorkspaceParentDirectory,
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
    deleteNode,
    error,
    importMarkdownDocuments,
    initialRecentDocumentPaths,
    isLoading,
    isSidebarCollapsed,
    lastSavedAt,
    moveNode,
    openDocument,
    selectDirectory,
    openWorkspace,
    pendingRenameNodePath,
    refreshWorkspaceTree,
    retryCurrentDocument,
    renameNode,
    rightPanelMode,
    saveCurrentDocumentNow,
    saveError,
    saveState,
    searchQuery,
    searchResults: snapshot ? searchWorkspace(snapshot.nodes, searchQuery) : [],
    setCurrentDocument,
    setRightPanelMode,
    setSearchQuery,
    setSidebarCollapsed,
    syncAppliedMarkdownDocument,
    clearPendingRenameNode,
    snapshot,
    switchWorkspace: loadWorkspace,
    updateMarkdown,
    updateNodeState,
    workspaceHistory,
    removeWorkspace,
  };
}

function getWorkspaceErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
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

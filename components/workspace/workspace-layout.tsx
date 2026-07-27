'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Airplay,
  AlertTriangle,
  Check,
  GitBranch,
  GitGraph,
  Minus,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  SquareTerminal,
  Square,
  X,
} from 'lucide-react';

import {
  MarkdownEditor,
  type MarkdownEditorChangeOrigin,
  type MarkdownEditorFlushReason,
  type MarkdownEditorHandle,
} from '@/components/editor/markdown-editor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ConfirmationDialog,
  useConfirmationDialog,
} from '@/components/ui/confirmation-dialog';
import { cn } from '@/lib/utils';

import {
  RightSidePanel,
  RightToolRail,
} from './right-side-panel';
import { AiDocumentPreview } from './ai-document-preview';
import { DirectoryPage } from './directory-page';
import { DailyNoteCalendar } from './daily-note-calendar';
import {
  createDateFromDailyDate,
  formatDailyDate,
  formatDailyMonth,
  getDailyContentDates,
} from './daily-notes';
import { DocumentTabBar } from './document-tab-bar';
import { DrawingSidebar } from './drawing-sidebar';
import { DrawingWorkspacePage } from './drawing-workspace-page';
import { resolveDocumentExportMarkdown } from './document-export-core';
import {
  closeAllDocumentTabs,
  closeDocumentTab,
  closeDocumentTabsToLeft,
  closeDocumentTabsToRight,
  closeOtherDocumentTabs,
  createInitialEditorLayout,
  getActiveDocumentPath,
  getActiveTab,
  openDocumentTab,
  openPlanPreviewTab,
  renameDocumentTab,
  selectDocumentTab,
  type DocumentEditorLayout,
  updateDocumentEditorWarmPaths,
} from './document-tabs';
import { EditorPane, type RecentWorkspaceDocument } from './editor-pane';
import { GitDiffView } from './git-diff-view';
import { GitLogDrawer } from './git-log-drawer';
import { GitPanel } from './git-panel';
import { InboxPage } from './inbox-page';
import { InboxSidebar } from './inbox-sidebar';
import { PinnedChromeMenu } from './pinned-chrome-menu';
import { TerminalPanel, type TerminalTab } from './terminal-panel';
import type {
  AiFileChange,
  AiProposedPlan,
  AiWorkspaceChangeEvent,
} from './ai-panel-state';
import { useWorkspace } from './use-workspace';
import { useAiDrawingTools } from './use-ai-drawing-tools';
import { drawingReferenceFromDescriptor } from './ai-drawing-inspector';
import { useDrawingController } from './use-drawing-controller';
import { useInboxController } from './use-inbox-controller';
import { useAppUpdate } from './use-app-update';
import { WorkspaceGlobalSearchDialog } from './workspace-global-search-dialog';
import { useDocumentExport } from './use-document-export';
import { useDocumentImport } from './use-document-import';
import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  type WorkspaceGlobalSearchResult,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIndex,
} from './workspace-global-search';
import {
  gitBranches,
  gitCommit,
  gitCommitFileDiff,
  gitCommitFiles,
  gitDeleteFile,
  gitDiff,
  ensureWorkspace,
  gitInit,
  gitLog,
  gitProbe,
  gitRemoteInfo,
  gitPush,
  gitRevertFile,
  gitStage,
  gitStatus,
  gitSyncNow,
  gitUnstage,
  listDailyNotesForMonth,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  loadDrawingLibrary,
  closeAppWindow,
  readAppSettings,
  recordRecentDocument,
  readMarkdownDocument,
  saveWorkspaceGitSyncSettings,
  minimizeAppWindow,
  openDailyNote,
  openPathInFileManager,
  setAppWindowTitle,
  toggleMaximizeAppWindow,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
} from './workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from './workspace-settings';
import {
  observeWorkspaceLongTasks,
  startWorkspacePerformanceMeasure,
} from './workspace-performance';
import {
  WorkspaceSettingsPage,
  type SettingsSectionId,
} from './workspace-settings-page';
import { createWorkspaceSettingsSessionCache } from './workspace-settings-cache';
import { createTerminalOutputStore } from './terminal-output-store';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import { WorkspaceSidebar } from './workspace-sidebar';
import { WorkspaceViewsPage } from './workspace-views-page';
import {
  countMarkdownCharacters,
  countMarkdownLines,
} from './workspace-document-insights';
import { createDocumentPanelData } from './workspace-document-panel-data';
import { flattenDocuments } from './workspace-tree';
import { XtermTerminal } from './xterm-terminal';
import type {
  AppSettings,
  AppearanceFontSettings,
  DocumentLoadState,
  DocumentSaveState,
  DailyNoteDocument,
  DailyNoteEntry,
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
  GitDiff,
  GitProbe,
  GitSyncConflictResolution,
  GitStatus,
  MarkdownDraft,
  PageWidthMode,
  RightPanelMode,
  WorkspaceNode,
  WorkspaceExportFormat,
  WorkspaceGitSyncSettings,
  WorkspaceSnapshot,
} from './workspace-types';

interface WorkspaceLayoutProps {
  initialSnapshot?: WorkspaceSnapshot | null;
}

type LeftPanelMode = 'workspace' | 'git';
type BottomPanelMode = 'git-log' | 'terminal' | null;
type GlobalSearchIndexStatus = 'error' | 'idle' | 'indexing' | 'ready';
type ThemeMode = 'dark' | 'light' | 'system';
type WorkspaceSystemPage =
  | 'codex'
  | 'drawings'
  | 'inbox'
  | 'settings'
  | 'views'
  | null;

interface GlobalSearchState {
  index: WorkspaceSearchIndex | null;
  results: WorkspaceGlobalSearchResult[];
  rootPath: string | null;
  status: GlobalSearchIndexStatus;
}

interface DocumentEditorSession {
  documentVersion: number;
  markdown: string;
}

const LEFT_PANEL_WIDTH = {
  defaultValue: 280,
  max: 420,
  min: 280,
};

const META_PANEL_WIDTH = {
  defaultValue: 340,
  max: 520,
  min: 340,
};

const AI_PANEL_WIDTH = {
  defaultValue: 420,
  max: 640,
  min: 360,
};

const AI_WORKSPACE_PREVIEW_WIDTH = {
  defaultValue: 720,
  max: 960,
  min: 520,
};

const GIT_LOG_DETAIL_WIDTH = {
  defaultValue: 360,
  max: 520,
  min: 280,
};

const GIT_LOG_BRANCH_WIDTH = {
  defaultValue: 260,
  max: 420,
  min: 220,
};

const GIT_LOG_HEIGHT = {
  defaultValue: 420,
  max: 680,
  min: 280,
};

const GIT_LOG_DETAIL_HEIGHT = {
  defaultValue: 220,
  max: 340,
  min: 140,
};

const WORKSPACE_PANEL_WIDTH_STORAGE_KEYS = {
  gitLogBranchWidth: 'madora:workspace:git-log-branch-width',
  gitLogDetailHeight: 'madora:workspace:git-log-detail-height',
  gitLogDetailWidth: 'madora:workspace:git-log-detail-width',
  gitLogHeight: 'madora:workspace:git-log-height',
  left: 'madora:workspace:left-sidebar-width',
  ai: 'madora:workspace:ai-panel-width',
  aiWorkspacePreview: 'madora:workspace:ai-workspace-preview-width:v2',
  meta: 'madora:workspace:right-panel-width',
  terminalHeight: 'madora:workspace:terminal-height',
};

const GLOBAL_SEARCH_READ_CONCURRENCY = 6;
const RECENT_DOCUMENT_LIMIT = 5;
const UI_FONT_FALLBACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const DOCUMENT_FONT_FALLBACK =
  "ui-serif, Georgia, 'Times New Roman', 'Songti SC', serif";
const CODE_FONT_FALLBACK =
  "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
const DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS: WorkspaceGitSyncSettings = {
  conflictResolution: 'abort',
  enabled: true,
  intervalMinutes: 10,
  lastSyncedAt: null,
};

function toRecentDocument(node: WorkspaceNode): RecentWorkspaceDocument {
  return {
    absolutePath: node.absolutePath,
    relativePath: node.relativePath || node.name,
    title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
  };
}

export function WorkspaceLayout({
  initialSnapshot = null,
}: WorkspaceLayoutProps) {
  const {
    confirm: confirmAction,
    request: confirmationRequest,
    resolve: resolveConfirmation,
  } = useConfirmationDialog();
  const workspace = useWorkspace(initialSnapshot);
  const refreshWorkspaceTree = workspace.refreshWorkspaceTree;
  const [leftSidebarWidth, setLeftSidebarWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.left,
    LEFT_PANEL_WIDTH.defaultValue,
    LEFT_PANEL_WIDTH.min,
    LEFT_PANEL_WIDTH.max,
  );
  const [metaPanelWidth, setMetaPanelWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.meta,
    META_PANEL_WIDTH.defaultValue,
    META_PANEL_WIDTH.min,
    META_PANEL_WIDTH.max,
  );
  const [aiPanelWidth, setAiPanelWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.ai,
    AI_PANEL_WIDTH.defaultValue,
    AI_PANEL_WIDTH.min,
    AI_PANEL_WIDTH.max,
  );
  const [aiWorkspacePreviewWidth, setAiWorkspacePreviewWidth] =
    useStoredPanelWidth(
      WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.aiWorkspacePreview,
      AI_WORKSPACE_PREVIEW_WIDTH.defaultValue,
      AI_WORKSPACE_PREVIEW_WIDTH.min,
      AI_WORKSPACE_PREVIEW_WIDTH.max,
    );
  const [settingsInitialSectionId, setSettingsInitialSectionId] =
    React.useState<SettingsSectionId>('appearance');
  const [settingsVersion, setSettingsVersion] = React.useState(0);
  const [gitLogDetailWidth, setGitLogDetailWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogDetailWidth,
    GIT_LOG_DETAIL_WIDTH.defaultValue,
    GIT_LOG_DETAIL_WIDTH.min,
    GIT_LOG_DETAIL_WIDTH.max,
  );
  const [gitLogBranchWidth, setGitLogBranchWidth] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogBranchWidth,
    GIT_LOG_BRANCH_WIDTH.defaultValue,
    GIT_LOG_BRANCH_WIDTH.min,
    GIT_LOG_BRANCH_WIDTH.max,
  );
  const [gitLogHeight, setGitLogHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogHeight,
    GIT_LOG_HEIGHT.defaultValue,
    GIT_LOG_HEIGHT.min,
    GIT_LOG_HEIGHT.max,
  );
  const [terminalHeight, setTerminalHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.terminalHeight,
    GIT_LOG_HEIGHT.defaultValue,
    GIT_LOG_HEIGHT.min,
    GIT_LOG_HEIGHT.max,
  );
  const [gitLogDetailHeight, setGitLogDetailHeight] = useStoredPanelWidth(
    WORKSPACE_PANEL_WIDTH_STORAGE_KEYS.gitLogDetailHeight,
    GIT_LOG_DETAIL_HEIGHT.defaultValue,
    GIT_LOG_DETAIL_HEIGHT.min,
    GIT_LOG_DETAIL_HEIGHT.max,
  );
  const [editorSessions, setEditorSessions] = React.useState<
    Record<string, DocumentEditorSession>
  >({});
  const pendingAiWorkspaceChangesRef = React.useRef(
    new Map<string, AiFileChange>(),
  );
  const aiWorkspaceRefreshTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const aiWorkspaceRefreshQueueRef = React.useRef<Promise<void>>(
    Promise.resolve(),
  );
  const [documentEditorLayout, setDocumentEditorLayout] =
    React.useState<DocumentEditorLayout>(() => createInitialEditorLayout());
  const [warmDocumentPaths, setWarmDocumentPaths] = React.useState<
    readonly string[]
  >([]);
  const [recentDocuments, setRecentDocuments] = React.useState<
    RecentWorkspaceDocument[]
  >([]);
  const [globalSearchOpen, setGlobalSearchOpen] = React.useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = React.useState('');
  const [globalSearchState, setGlobalSearchState] =
    React.useState<GlobalSearchState>({
      index: null,
      results: [],
      rootPath: null,
      status: 'idle',
    });
  const globalSearchWorkerRef = React.useRef<Worker | null>(null);
  const globalSearchRequestIdRef = React.useRef(0);
  const [dailyCalendarMonth, setDailyCalendarMonth] = React.useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDailyDate, setSelectedDailyDate] = React.useState(() =>
    formatDailyDate(new Date()),
  );
  const [dailyNoteEntries, setDailyNoteEntries] = React.useState<
    DailyNoteEntry[]
  >([]);
  const [dailyNotesLoading, setDailyNotesLoading] = React.useState(false);
  const documentTitle =
    workspace.currentDocument?.title || workspace.currentDocument?.name;
  const pageTitle = documentTitle ?? workspace.currentDirectory?.name;
  const currentDocumentPath = workspace.currentDocument?.absolutePath ?? null;
  const workspaceRootPath = workspace.snapshot?.rootPath ?? null;
  const inbox = useInboxController({ rootPath: workspaceRootPath });
  const loadInbox = inbox.loadList;
  const startInboxCapture = inbox.startNewCapture;
  const clearCurrentDocument = workspace.clearCurrentDocument;
  const showWorkspaceSidebar = workspace.setSidebarCollapsed;
  const currentDocumentPathRef = React.useRef(currentDocumentPath);
  const documentEditorLayoutRef = React.useRef(documentEditorLayout);
  const syncExternalMarkdownDocumentRef = React.useRef(
    workspace.syncExternalMarkdownDocument,
  );
  const workspaceRootPathRef = React.useRef(workspaceRootPath);
  const editorWorkspaceRootPathRef = React.useRef(workspaceRootPath);
  const activeMarkdownEditorRef = React.useRef<MarkdownEditorHandle | null>(
    null,
  );
  const appWindowExitPendingRef = React.useRef(false);

  React.useEffect(() => {
    currentDocumentPathRef.current = currentDocumentPath;
    documentEditorLayoutRef.current = documentEditorLayout;
    syncExternalMarkdownDocumentRef.current =
      workspace.syncExternalMarkdownDocument;
    workspaceRootPathRef.current = workspaceRootPath;
  }, [
    currentDocumentPath,
    documentEditorLayout,
    workspace.syncExternalMarkdownDocument,
    workspaceRootPath,
  ]);
  const rightPanelWidth =
    workspace.rightPanelMode === 'ai' ? aiPanelWidth : metaPanelWidth;
  const rightPanelWidthLimits =
    workspace.rightPanelMode === 'ai' ? AI_PANEL_WIDTH : META_PANEL_WIDTH;
  const setActiveRightPanelWidth =
    workspace.rightPanelMode === 'ai' ? setAiPanelWidth : setMetaPanelWidth;
  const flushActiveMarkdownEditor = React.useCallback(
    (reason: MarkdownEditorFlushReason) =>
      activeMarkdownEditorRef.current?.flushDraft(reason) ??
      Promise.resolve(true),
    [],
  );
  const saveCurrentDocumentNow = React.useCallback(async () => {
    if (!(await flushActiveMarkdownEditor('manual-save'))) {
      return false;
    }

    return workspace.saveCurrentDocumentNow();
  }, [flushActiveMarkdownEditor, workspace]);
  const activeEditorTab = getActiveTab(documentEditorLayout);
  const activePanelDocumentPath = getActiveDocumentPath(documentEditorLayout);
  const activePanelDocument =
    activePanelDocumentPath && workspace.snapshot
      ? findWorkspaceDocumentByPath(
          workspace.snapshot.nodes,
          activePanelDocumentPath,
        )
      : null;
  const hasOpenDocumentTabs = documentEditorLayout.tabs.length > 0;
  const dailyContentDates = React.useMemo(
    () => getDailyContentDates(dailyNoteEntries),
    [dailyNoteEntries],
  );
  const visibleRecentDocuments = React.useMemo(
    () =>
      recentDocuments.filter((document) =>
        findWorkspaceDocumentByPath(
          workspace.snapshot?.nodes ?? [],
          document.absolutePath,
        ),
      ),
    [recentDocuments, workspace.snapshot?.nodes],
  );
  React.useEffect(() => {
    if (
      !workspace.initialRecentDocumentPaths.length ||
      !workspace.snapshot
    ) {
      return;
    }

    const docs = workspace.initialRecentDocumentPaths
      .map((path) =>
        findWorkspaceDocumentByPath(workspace.snapshot!.nodes, path),
      )
      .filter((node): node is WorkspaceNode => node?.kind === 'document')
      .map(toRecentDocument);

    if (docs.length === 0) {
      return;
    }

    // 用微任务延迟 setState，避免 effect 内同步触发级联渲染
    // author: refinex
    const timer = window.setTimeout(() => {
      setRecentDocuments((current) => {
        // 合并：初始列表在前，补充本次会话内新打开但未持久化的条目
        const seen = new Set(docs.map((doc) => doc.absolutePath));
        const extras = current.filter((doc) => !seen.has(doc.absolutePath));

        return [...docs, ...extras].slice(0, RECENT_DOCUMENT_LIMIT);
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [workspace.initialRecentDocumentPaths, workspace.snapshot]);
  const isWorkspaceEmpty =
    workspace.snapshot !== null && workspace.snapshot.nodes.length === 0;
  const deferredDocumentMarkdown = React.useDeferredValue(
    workspace.draftDocument?.markdown,
  );
  const documentCharacterCount = React.useMemo(
    () => countMarkdownCharacters(deferredDocumentMarkdown),
    [deferredDocumentMarkdown],
  );
  const documentLineCount = React.useMemo(
    () => countMarkdownLines(deferredDocumentMarkdown),
    [deferredDocumentMarkdown],
  );
  const activeGlobalSearchIndex =
    globalSearchState.rootPath === workspaceRootPath
      ? globalSearchState.index
      : null;
  const activeGlobalSearchStatus =
    globalSearchState.rootPath === workspaceRootPath
      ? globalSearchState.status
      : 'idle';
  const globalSearchResults = React.useMemo(
    () => {
      if (globalSearchState.rootPath !== workspaceRootPath) {
        return [];
      }

      return activeGlobalSearchIndex
        ? searchWorkspaceIndex(activeGlobalSearchIndex, globalSearchQuery)
        : globalSearchState.results;
    },
    [
      activeGlobalSearchIndex,
      globalSearchQuery,
      globalSearchState.results,
      globalSearchState.rootPath,
      workspaceRootPath,
    ],
  );
  const documentPanelData = React.useMemo(
    () => createDocumentPanelData(workspace.draftDocument, workspace.rightPanelMode),
    [workspace.draftDocument, workspace.rightPanelMode],
  );
  const isTauriRuntime = useIsTauriRuntime();
  const isMacRuntime = useIsMacRuntime();
  const isWindowsRuntime = useIsWindowsRuntime();

  React.useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (disposed) {
        return;
      }
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        if (appWindowExitPendingRef.current) {
          return;
        }

        appWindowExitPendingRef.current = true;
        try {
          if (!(await flushActiveMarkdownEditor('app-exit'))) {
            appWindowExitPendingRef.current = false;
            return;
          }

          const { exit } = await import('@tauri-apps/plugin-process');
          await exit(0);
        } catch (error) {
          appWindowExitPendingRef.current = false;
          console.error('关闭应用窗口失败', error);
        }
      });

      if (disposed) {
        unlisten();
        unlisten = null;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushActiveMarkdownEditor, isTauriRuntime]);
  const { resolvedTheme } = useTheme();
  const terminalThemeMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const [pageWidthMode, setPageWidthMode] = React.useState<PageWidthMode>(
    DEFAULT_APP_SETTINGS.appearance.pageWidthMode,
  );
  const [appearanceFonts, setAppearanceFonts] =
    React.useState<AppearanceFontSettings>(
      DEFAULT_APP_SETTINGS.appearance.fonts,
    );
  const [appSettings, setAppSettings] =
    React.useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsSessionCache] = React.useState(
    createWorkspaceSettingsSessionCache(),
  );
  const documentExport = useDocumentExport({
    pageWidthMode,
    rootPath: workspaceRootPath,
    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
  });
  const [leftPanelMode, setLeftPanelMode] =
    React.useState<LeftPanelMode>('workspace');
  const [systemPage, setSystemPage] = React.useState<WorkspaceSystemPage>(null);
  const showDocumentTabs =
    leftPanelMode === 'workspace' &&
    systemPage === null &&
    (activeEditorTab?.kind === 'plan' ||
      Boolean(workspace.currentDocument) ||
      (!workspace.currentDirectory && hasOpenDocumentTabs));
  const [aiPreviewDocumentPath, setAiPreviewDocumentPath] =
    React.useState<string | null>(null);
  const aiPreviewDocument = React.useMemo(
    () =>
      aiPreviewDocumentPath
        ? findWorkspaceDocumentByPath(
            workspace.snapshot?.nodes ?? [],
            aiPreviewDocumentPath,
          )
        : null,
    [aiPreviewDocumentPath, workspace.snapshot?.nodes],
  );
  const aiPreviewMarkdownOverride = React.useMemo(() => {
    if (!aiPreviewDocumentPath) {
      return null;
    }

    if (
      aiPreviewDocumentPath === currentDocumentPath &&
      workspace.draftDocument
    ) {
      return workspace.draftDocument.markdown;
    }

    return editorSessions[aiPreviewDocumentPath]?.markdown ?? null;
  }, [
    aiPreviewDocumentPath,
    currentDocumentPath,
    editorSessions,
    workspace.draftDocument,
  ]);
  const effectiveRightPanelMode: RightPanelMode =
    systemPage === 'codex' ? 'ai' : workspace.rightPanelMode;

  const drawings = useDrawingController({
    active: systemPage === 'drawings' || effectiveRightPanelMode === 'ai',
    rootPath: workspaceRootPath,
  });
  const flushActiveDrawing = drawings.flush;
  const prepareForAppUpdateInstall = React.useCallback(async () => {
    const confirmed = await confirmAction({
      cancelLabel: '稍后更新',
      confirmLabel: '保存并安装',
      description:
        'Madora 会先保存当前文档和图稿，再下载并验证更新包。Windows 安装时应用可能自动退出；macOS 安装完成后会提示重启。',
      title: '安装 Madora 更新？',
    });
    if (!confirmed) return false;

    if (!(await flushActiveMarkdownEditor('app-exit'))) {
      throw new Error('当前文档未能安全保存，更新已取消。');
    }

    try {
      await flushActiveDrawing();
    } catch {
      throw new Error('当前图稿未能安全保存，更新已取消。');
    }

    return true;
  }, [confirmAction, flushActiveDrawing, flushActiveMarkdownEditor]);
  const appUpdate = useAppUpdate({
    onBeforeInstall: prepareForAppUpdateInstall,
  });
  const openDrawingFromLibrary = drawings.openDrawing;
  const handleAiDrawingCreated = React.useCallback(
    async (drawing: { meta: { id: string } }) => {
      setLeftPanelMode('workspace');
      setSystemPage('drawings');
      showWorkspaceSidebar(false);
      clearCurrentDocument();
      await drawings.refresh();
      await drawings.openDrawing(drawing.meta.id);
    },
    [clearCurrentDocument, drawings, showWorkspaceSidebar],
  );
  const handleAiDrawingToolCall = useAiDrawingTools({
    controller: drawings,
    onCreated: handleAiDrawingCreated,
    workspaceRootPath,
  });
  const activeAiDrawing = React.useMemo(
    () =>
      systemPage === 'drawings' && drawings.descriptor
        ? drawingReferenceFromDescriptor(drawings.descriptor)
        : null,
    [drawings.descriptor, systemPage],
  );
  const aiDrawingReferences = React.useMemo(
    () =>
      drawings.snapshot.drawings.map((drawing) => ({
        albumPath: drawing.albumPath,
        elementCount: drawing.elementCount,
        hasPreview: drawing.hasPreview,
        id: drawing.id,
        revision: drawing.revision,
        title: drawing.title,
      })),
    [drawings.snapshot.drawings],
  );

  React.useEffect(() => {
    const handleOpenDrawing = (event: Event) => {
      const drawingId = (event as CustomEvent<{ drawingId?: string }>).detail
        ?.drawingId;
      if (!drawingId) return;
      setLeftPanelMode('workspace');
      setSystemPage('drawings');
      showWorkspaceSidebar(false);
      clearCurrentDocument();
      void openDrawingFromLibrary(drawingId);
    };
    window.addEventListener('madora:open-drawing', handleOpenDrawing);
    return () => window.removeEventListener('madora:open-drawing', handleOpenDrawing);
  }, [clearCurrentDocument, openDrawingFromLibrary, showWorkspaceSidebar]);
  const [treeRevealRequest, setTreeRevealRequest] = React.useState<{
    absolutePath: string;
    requestId: number;
  } | null>(null);
  const [bottomPanelMode, setBottomPanelMode] =
    React.useState<BottomPanelMode>(null);
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(
    null,
  );
  const [gitStatusState, setGitStatusState] = React.useState<GitStatus | null>(
    null,
  );
  const [gitDiffState, setGitDiffState] = React.useState<GitDiff | null>(null);
  const [gitDiffLabel, setGitDiffLabel] = React.useState<string | undefined>();
  const [gitSelectedPath, setGitSelectedPath] = React.useState<string | null>(
    null,
  );
  const [gitSelectedPaths, setGitSelectedPaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [gitError, setGitError] = React.useState<string | null>(null);
  const [gitLoading, setGitLoading] = React.useState(false);
  const [gitLogBranches, setGitLogBranches] = React.useState<GitBranchItem[]>(
    [],
  );
  const [gitLogCommits, setGitLogCommits] = React.useState<GitCommitEntry[]>(
    [],
  );
  const [gitLogFiles, setGitLogFiles] = React.useState<GitCommitFile[]>([]);
  const [gitLogSelectedHash, setGitLogSelectedHash] = React.useState<string | null>(
    null,
  );
  const [gitLogError, setGitLogError] = React.useState<string | null>(null);
  const [gitLogLoading, setGitLogLoading] = React.useState(false);
  const [terminalTabs, setTerminalTabs] = React.useState<TerminalTab[]>([]);
  const [terminalActiveTabId, setTerminalActiveTabId] =
    React.useState<string | null>(null);
  const [terminalError, setTerminalError] = React.useState<string | null>(null);
  const terminalTabsRef = React.useRef<TerminalTab[]>([]);
  const [terminalOutputStore] = React.useState(createTerminalOutputStore());
  const terminalSpawnInFlightRef = React.useRef(false);
  const pendingDocumentOpenTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const gitLogOpen = bottomPanelMode === 'git-log';
  const terminalOpen = bottomPanelMode === 'terminal';

  const openSettingsPage = React.useCallback(
    (sectionId: SettingsSectionId = 'appearance') => {
      setSettingsInitialSectionId(sectionId);
      setSystemPage('settings');
    },
    [],
  );
  const shouldRenderTerminalPanel = terminalOpen || terminalTabs.length > 0;

  React.useEffect(() => observeWorkspaceLongTasks(), []);

  React.useEffect(() => {
    if (typeof Worker === 'undefined') {
      return;
    }

    const worker = new Worker(
      new URL('./workspace-search-worker.ts', import.meta.url),
    );
    globalSearchWorkerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<
        | { rootPath: string; type: 'indexed' }
        | {
            requestId: number;
            results: WorkspaceGlobalSearchResult[];
            rootPath: string;
            type: 'results';
          }
      >,
    ) => {
      const message = event.data;

      if (message.type === 'indexed') {
        setGlobalSearchState((current) =>
          current.rootPath === message.rootPath
            ? { ...current, index: null, results: [], status: 'ready' }
            : current,
        );
        return;
      }

      if (message.requestId !== globalSearchRequestIdRef.current) {
        return;
      }

      setGlobalSearchState((current) =>
        current.rootPath === message.rootPath
          ? { ...current, results: message.results }
          : current,
      );
    };

    return () => {
      worker.terminate();
      if (globalSearchWorkerRef.current === worker) {
        globalSearchWorkerRef.current = null;
      }
    };
  }, []);
  const openGlobalSearch = React.useCallback(() => {
    setGlobalSearchOpen(true);
    if (globalSearchState.rootPath !== workspaceRootPath) {
      setGlobalSearchQuery('');
    }
    setGlobalSearchState((current) => {
      if (!workspaceRootPath) {
        return current;
      }

      if (
        current.rootPath === workspaceRootPath &&
        current.status !== 'idle'
      ) {
        return current;
      }

      return {
        index: null,
        results: [],
        rootPath: workspaceRootPath,
        status: 'indexing',
      };
    });
  }, [globalSearchState.rootPath, workspaceRootPath]);
  const loadDailyNotesForMonth = React.useCallback(
    async (month: Date) => {
      if (!workspaceRootPath) {
        setDailyNoteEntries([]);
        return;
      }

      setDailyNotesLoading(true);

      try {
        const result = await listDailyNotesForMonth(
          workspaceRootPath,
          formatDailyMonth(month),
        );
        setDailyNoteEntries(result.entries);
      } catch {
        setDailyNoteEntries([]);
      } finally {
        setDailyNotesLoading(false);
      }
    },
    [workspaceRootPath],
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDailyNotesForMonth(dailyCalendarMonth);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [dailyCalendarMonth, loadDailyNotesForMonth]);

  React.useEffect(() => {
    if (isTauriRuntime && isMacRuntime) {
      return;
    }

    void setAppWindowTitle(pageTitle ?? 'Madora');
  }, [isMacRuntime, isTauriRuntime, pageTitle]);

  React.useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  React.useEffect(() => {
    return () => {
      if (pendingDocumentOpenTimerRef.current) {
        clearTimeout(pendingDocumentOpenTimerRef.current);
        pendingDocumentOpenTimerRef.current = null;
      }
      terminalTabsRef.current.forEach((tab) => {
        void terminalKill(tab.id);
      });
    };
  }, []);

  React.useEffect(() => {
    if (
      !globalSearchOpen ||
      !isTauriRuntime ||
      !workspace.snapshot ||
      activeGlobalSearchStatus !== 'indexing'
    ) {
      return;
    }

    const snapshot = workspace.snapshot;
    let cancelled = false;

    const perf = startWorkspacePerformanceMeasure('workspace.global_search.index');

    void readWorkspaceSearchDocuments(snapshot)
      .then((documents) => {
        if (cancelled) {
          return;
        }

        const worker = globalSearchWorkerRef.current;

        if (worker) {
          worker.postMessage({
            documents,
            rootPath: snapshot.rootPath,
            type: 'index',
          });
          perf.finish({
            documents: documents.length,
            execution: 'worker',
            rootDocuments: flattenDocuments(snapshot.nodes).length,
          });
          return;
        }

        setGlobalSearchState({
          index: buildWorkspaceSearchIndex(documents),
          results: [],
          rootPath: snapshot.rootPath,
          status: 'ready',
        });
        perf.finish({
          documents: documents.length,
          rootDocuments: flattenDocuments(snapshot.nodes).length,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setGlobalSearchState({
          index: null,
          results: [],
          rootPath: snapshot.rootPath,
          status: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeGlobalSearchStatus,
    globalSearchOpen,
    isTauriRuntime,
    workspace.snapshot,
  ]);

  React.useEffect(() => {
    const worker = globalSearchWorkerRef.current;

    if (
      !worker ||
      activeGlobalSearchStatus !== 'ready' ||
      !workspaceRootPath ||
      globalSearchState.rootPath !== workspaceRootPath
    ) {
      return;
    }

    const requestId = globalSearchRequestIdRef.current + 1;
    globalSearchRequestIdRef.current = requestId;
    worker.postMessage({
      query: globalSearchQuery,
      requestId,
      rootPath: workspaceRootPath,
      type: 'search',
    });
  }, [
    activeGlobalSearchStatus,
    globalSearchQuery,
    globalSearchState.rootPath,
    workspaceRootPath,
  ]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && globalSearchOpen) {
        setGlobalSearchOpen(false);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === 'k' ||
          (event.shiftKey && event.key.toLowerCase() === 'f'))
      ) {
        event.preventDefault();
        openGlobalSearch();
        return;
      }

      if (
        workspaceRootPath &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'i'
      ) {
        event.preventDefault();
        setLeftPanelMode('workspace');
        setSystemPage('inbox');
        showWorkspaceSidebar(false);
        clearCurrentDocument();
        void startInboxCapture();
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    globalSearchOpen,
    clearCurrentDocument,
    openGlobalSearch,
    showWorkspaceSidebar,
    startInboxCapture,
    workspaceRootPath,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!isTauriRuntime) {
        setAppSettings(DEFAULT_APP_SETTINGS);
        setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
        setAppearanceFonts(DEFAULT_APP_SETTINGS.appearance.fonts);
        return;
      }

      try {
        const settings = await readAppSettings();

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(settings);

          setPageWidthMode(normalizedSettings.appearance.pageWidthMode);
          setAppearanceFonts(normalizedSettings.appearance.fonts);
          setAppSettings(normalizedSettings);
        }
      } catch {
        if (!cancelled) {
          setAppSettings(DEFAULT_APP_SETTINGS);
          setPageWidthMode(DEFAULT_APP_SETTINGS.appearance.pageWidthMode);
          setAppearanceFonts(DEFAULT_APP_SETTINGS.appearance.fonts);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [isTauriRuntime]);

  React.useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty(
      '--madora-ui-font',
      buildFontStack(appearanceFonts.ui, UI_FONT_FALLBACK),
    );
    root.style.setProperty(
      '--madora-document-font',
      buildFontStack(appearanceFonts.document, DOCUMENT_FONT_FALLBACK),
    );
    root.style.setProperty(
      '--madora-code-font',
      buildFontStack(appearanceFonts.code, CODE_FONT_FALLBACK),
    );
  }, [appearanceFonts]);

  const handleLeftSidebarResize = React.useCallback((nextWidth: number) => {
    setLeftSidebarWidth(nextWidth);
  }, [setLeftSidebarWidth]);

  const handleRightPanelResize = React.useCallback((nextWidth: number) => {
    setActiveRightPanelWidth(nextWidth);
  }, [setActiveRightPanelWidth]);
  const refreshGitStatus = React.useCallback(async () => {
    if (!workspaceRootPath) {
      setGitProbeState(null);
      setGitStatusState(null);
      setGitSelectedPaths(new Set());
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      const probe = await gitProbe(workspaceRootPath);
      setGitProbeState(probe);

      if (probe.isRepository) {
        const status = await gitStatus(workspaceRootPath);
        setGitStatusState(status);
        setGitSelectedPaths(new Set(status.changes.map((change) => change.path)));
      } else {
        setGitStatusState(null);
        setGitSelectedPaths(new Set());
        setGitSelectedPath(null);
        setGitDiffState(null);
        setGitDiffLabel(undefined);
      }
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [workspaceRootPath]);

  const handleGitInit = React.useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      const probe = await gitInit(workspaceRootPath);
      setGitProbeState(probe);
      await refreshGitStatus();
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [refreshGitStatus, workspaceRootPath]);

  const handleGitSelectFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitSelectedPath(path);
      setGitLoading(true);
      setGitError(null);

      try {
        setGitDiffState(await gitDiff(workspaceRootPath, path, false));
        setGitDiffLabel(undefined);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const handleGitLogSelectFile = React.useCallback(
    async (file: GitCommitFile) => {
      if (!workspaceRootPath || !gitLogSelectedHash) {
        return;
      }

      setLeftPanelMode('git');
      workspace.setSidebarCollapsed(false);
      setGitSelectedPath(file.path);
      setGitLoading(true);
      setGitError(null);

      try {
        setGitDiffState(
          await gitCommitFileDiff(workspaceRootPath, gitLogSelectedHash, file.path),
        );
        setGitDiffLabel('提交差异');
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [gitLogSelectedHash, workspace, workspaceRootPath],
  );

  const handleGitSelectChange = React.useCallback(
    (path: string, checked: boolean) => {
      setGitSelectedPaths((current) => {
        const next = new Set(current);

        if (checked) {
          next.add(path);
        } else {
          next.delete(path);
        }

        return next;
      });
    },
    [],
  );

  const selectedGitPaths = React.useMemo(
    () => Array.from(gitSelectedPaths),
    [gitSelectedPaths],
  );

  const handleGitStageSelected = React.useCallback(async () => {
    if (!workspaceRootPath || selectedGitPaths.length === 0) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      setGitStatusState(await gitStage(workspaceRootPath, selectedGitPaths));
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [selectedGitPaths, workspaceRootPath]);

  const handleGitStageFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitStage(workspaceRootPath, [path]));
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const handleGitUnstageSelected = React.useCallback(async () => {
    if (!workspaceRootPath || selectedGitPaths.length === 0) {
      return;
    }

    setGitLoading(true);
    setGitError(null);

    try {
      setGitStatusState(await gitUnstage(workspaceRootPath, selectedGitPaths));
    } catch (error) {
      setGitError(formatUnknownError(error));
    } finally {
      setGitLoading(false);
    }
  }, [selectedGitPaths, workspaceRootPath]);

  const handleGitCommitSingleFile = React.useCallback((path: string) => {
    setGitSelectedPaths(new Set([path]));
  }, []);

  const handleGitUnstageFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitUnstage(workspaceRootPath, [path]));
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [workspaceRootPath],
  );

  const clearGitFileSelection = React.useCallback((path: string) => {
    setGitSelectedPath((current) => (current === path ? null : current));
    setGitSelectedPaths((current) => {
      const next = new Set(current);

      next.delete(path);

      return next;
    });
    setGitDiffState((current) => (current?.path === path ? null : current));
    setGitDiffLabel(undefined);
  }, []);

  const handleGitRevertFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitRevertFile(workspaceRootPath, path));
        clearGitFileSelection(path);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [clearGitFileSelection, workspaceRootPath],
  );

  const handleGitDeleteFile = React.useCallback(
    async (path: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        setGitStatusState(await gitDeleteFile(workspaceRootPath, path));
        clearGitFileSelection(path);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [clearGitFileSelection, workspaceRootPath],
  );

  const handleGitCommit = React.useCallback(
    async (message: string) => {
      if (!workspaceRootPath || selectedGitPaths.length === 0) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        await saveCurrentDocumentNow();
        setGitStatusState(
          await gitCommit(workspaceRootPath, message, selectedGitPaths),
        );
        setGitDiffState(null);
        setGitDiffLabel(undefined);
        setGitSelectedPath(null);
        setGitSelectedPaths(new Set());
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [saveCurrentDocumentNow, selectedGitPaths, workspaceRootPath],
  );

  const handleGitCommitAndPush = React.useCallback(
    async (message: string) => {
      if (!workspaceRootPath || selectedGitPaths.length === 0) {
        return;
      }

      setGitLoading(true);
      setGitError(null);

      try {
        await saveCurrentDocumentNow();
        await gitCommit(workspaceRootPath, message, selectedGitPaths);
        setGitStatusState(await gitPush(workspaceRootPath));
        setGitDiffState(null);
        setGitDiffLabel(undefined);
        setGitSelectedPath(null);
        setGitSelectedPaths(new Set());
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        setGitLoading(false);
      }
    },
    [saveCurrentDocumentNow, selectedGitPaths, workspaceRootPath],
  );

  const loadGitLogCommitFiles = React.useCallback(
    async (hash: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setGitLogSelectedHash(hash);

      try {
        setGitLogFiles(await gitCommitFiles(workspaceRootPath, hash));
      } catch (error) {
        setGitLogError(formatUnknownError(error));
        setGitLogFiles([]);
      }
    },
    [workspaceRootPath],
  );

  const refreshGitLog = React.useCallback(async () => {
    if (!workspaceRootPath) {
      setGitLogBranches([]);
      setGitLogCommits([]);
      setGitLogFiles([]);
      setGitLogSelectedHash(null);
      return;
    }

    setGitLogLoading(true);
    setGitLogError(null);

    try {
      const [branches, commits] = await Promise.all([
        gitBranches(workspaceRootPath),
        gitLog(workspaceRootPath),
      ]);
      const selectedHash = commits[0]?.hash ?? null;

      setGitLogBranches(branches);
      setGitLogCommits(commits);
      setGitLogSelectedHash(selectedHash);

      if (selectedHash) {
        setGitLogFiles(await gitCommitFiles(workspaceRootPath, selectedHash));
      } else {
        setGitLogFiles([]);
      }
    } catch (error) {
      setGitLogError(formatUnknownError(error));
    } finally {
      setGitLogLoading(false);
    }
  }, [workspaceRootPath]);

  React.useEffect(() => {
    if (!isTauriRuntime || !workspaceRootPath) {
      return;
    }

    let disposed = false;
    let timeoutId: number | null = null;

    async function scheduleNextGitSync() {
      try {
        const metadata = await ensureWorkspace(workspaceRootPath!);
        const settings = withDefaultWorkspaceGitSyncSettings(metadata.gitSync);

        if (!settings.enabled || disposed) {
          return;
        }

        const remoteInfo = await gitRemoteInfo(workspaceRootPath!).catch(
          () => null,
        );

        if (!remoteInfo?.remoteUrl || disposed) {
          return;
        }

        timeoutId = window.setTimeout(() => {
          void runScheduledGitSync(settings);
        }, settings.intervalMinutes * 60_000);
      } catch (error) {
        setGitError(formatUnknownError(error));
      }
    }

    async function runScheduledGitSync(settings: WorkspaceGitSyncSettings) {
      if (disposed || !workspaceRootPath) {
        return;
      }

      try {
        await saveCurrentDocumentNow();
        const result = await gitSyncNow(
          workspaceRootPath,
          settings.conflictResolution,
        );
        await saveWorkspaceGitSyncSettings(workspaceRootPath, {
          ...settings,
          lastSyncedAt: result.lastSyncedAt,
        });
        setGitStatusState(result.status);
        setGitError(null);
      } catch (error) {
        setGitError(formatUnknownError(error));
      } finally {
        if (!disposed) {
          void scheduleNextGitSync();
        }
      }
    }

    void scheduleNextGitSync();

    return () => {
      disposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    isTauriRuntime,
    saveCurrentDocumentNow,
    settingsVersion,
    workspaceRootPath,
  ]);

  const createTerminalTab = React.useCallback(async () => {
    if (
      !workspaceRootPath ||
      !isTauriRuntime ||
      terminalSpawnInFlightRef.current
    ) {
      return;
    }

    setTerminalError(null);
    terminalSpawnInFlightRef.current = true;

    try {
      const info = await terminalSpawn(workspaceRootPath, 120, 32);

      setTerminalTabs((current) => [
        ...current,
        {
          cwd: info.cwd,
          id: info.id,
          status: 'running',
          title: current.length === 0 ? '本地' : `本地 ${current.length + 1}`,
        },
      ]);
      setTerminalActiveTabId(info.id);
    } catch (error) {
      setTerminalError(formatUnknownError(error));
    } finally {
      terminalSpawnInFlightRef.current = false;
    }
  }, [isTauriRuntime, workspaceRootPath]);

  const handleTerminalCloseTab = React.useCallback(
    (tabId: string) => {
      void terminalKill(tabId).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
      setTerminalTabs((current) => current.filter((tab) => tab.id !== tabId));
      terminalOutputStore.clear(tabId);
      setTerminalActiveTabId((current) => {
        if (current !== tabId) {
          return current;
        }

        const nextTab = terminalTabs.find((tab) => tab.id !== tabId);

        return nextTab?.id ?? null;
      });
    },
    [terminalOutputStore, terminalTabs],
  );

  const handleTerminalData = React.useCallback(
    (sessionId: string, data: string) => {
      void terminalWrite(sessionId, data).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
    },
    [],
  );

  const handleTerminalResize = React.useCallback(
    (sessionId: string, cols: number, rows: number) => {
      void terminalResize(sessionId, cols, rows).catch((error) =>
        setTerminalError(formatUnknownError(error)),
      );
    },
    [],
  );

  React.useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listenTerminalData(({ sessionId, data }) => {
      terminalOutputStore.append(sessionId, data);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    void listenTerminalExit(({ sessionId }) => {
      setTerminalTabs((current) =>
        current.map((tab) =>
          tab.id === sessionId ? { ...tab, status: 'exited' } : tab,
        ),
      );
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    void listenTerminalError(({ message }) => {
      setTerminalError(message);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
      }
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [isTauriRuntime, terminalOutputStore]);

  React.useEffect(() => {
    if (
      !terminalOpen ||
      terminalTabs.length > 0 ||
      !workspaceRootPath ||
      !isTauriRuntime
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void createTerminalTab();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    createTerminalTab,
    isTauriRuntime,
    terminalOpen,
    terminalTabs.length,
    workspaceRootPath,
  ]);

  const rememberRecentDocument = React.useCallback(
    (node: WorkspaceNode) => {
      if (node.kind !== 'document') {
        return;
      }

      const entry = toRecentDocument(node);

      setRecentDocuments((current) => [
        entry,
        ...current.filter((item) => item.absolutePath !== entry.absolutePath),
      ].slice(0, RECENT_DOCUMENT_LIMIT));

      if (isTauriRuntime && workspaceRootPath) {
        void recordRecentDocument(workspaceRootPath, node.absolutePath).catch(
          (error) => {
            // 持久化失败不阻断打开流程，仅记录
            // author: refinex
            console.warn('记录最近文档失败', error);
          },
        );
      }
    },
    [isTauriRuntime, workspaceRootPath],
  );

  const rememberRecentDocumentByPath = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (node) {
        rememberRecentDocument(node);
      }
    },
    [rememberRecentDocument, workspace.snapshot?.nodes],
  );

  const cacheEditorSession = React.useCallback(
    (documentPath: string, draft: MarkdownDraft) => {
      setEditorSessions((current) => ({
        ...current,
        [documentPath]: {
          documentVersion: draft.modifiedAt,
          markdown: draft.markdown,
        },
      }));
    },
    [],
  );

  const clearPendingDocumentOpen = React.useCallback(() => {
    if (!pendingDocumentOpenTimerRef.current) {
      return;
    }

    clearTimeout(pendingDocumentOpenTimerRef.current);
    pendingDocumentOpenTimerRef.current = null;
  }, []);

  React.useEffect(() => {
    const previousRootPath = editorWorkspaceRootPathRef.current;
    editorWorkspaceRootPathRef.current = workspaceRootPath;
    if (previousRootPath === workspaceRootPath) {
      return;
    }

    clearPendingDocumentOpen();
    const timer = window.setTimeout(() => {
      setDocumentEditorLayout(closeAllDocumentTabs());
      setEditorSessions({});
      if (!workspaceRootPath) {
        setRecentDocuments([]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clearPendingDocumentOpen, workspaceRootPath]);

  const openDocumentByPath = React.useCallback(
    async (documentPath: string) => {
      if (documentPath === currentDocumentPath) {
        return;
      }

      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (!node) {
        return;
      }

      rememberRecentDocument(node);
      const draft = await workspace.openDocument(node);

      if (draft) {
        cacheEditorSession(node.absolutePath, draft);
      }
    },
    [cacheEditorSession, currentDocumentPath, rememberRecentDocument, workspace],
  );

  const scheduleDocumentOpen = React.useCallback(
    (documentPath: string) => {
      clearPendingDocumentOpen();

      if (documentPath === currentDocumentPath) {
        return;
      }

      pendingDocumentOpenTimerRef.current = setTimeout(() => {
        pendingDocumentOpenTimerRef.current = null;
        void openDocumentByPath(documentPath);
      }, 0);
    },
    [clearPendingDocumentOpen, currentDocumentPath, openDocumentByPath],
  );

  const openDocumentNode = React.useCallback(
    async (node: WorkspaceNode) => {
      if (node.kind !== 'document') {
        return;
      }

      if (!(await flushActiveMarkdownEditor('document-switch'))) {
        return;
      }

      setSystemPage(null);
      clearPendingDocumentOpen();
      setDocumentEditorLayout((current) => openDocumentTab(current, node));
      rememberRecentDocument(node);
      const draft = await workspace.openDocument(node);

      if (draft) {
        cacheEditorSession(node.absolutePath, draft);
      }
    },
    [
      cacheEditorSession,
      clearPendingDocumentOpen,
      flushActiveMarkdownEditor,
      rememberRecentDocument,
      workspace,
    ],
  );

  const handleOpenNodeInFileManager = React.useCallback(
    (node: WorkspaceNode) => {
      void Promise.resolve(openPathInFileManager(node.absolutePath)).catch(
        (error: unknown) => {
          console.error('Failed to open workspace node in file manager', error);
        },
      );
    },
    [],
  );

  const handleExportDocument = React.useCallback(
    async (node: WorkspaceNode, format: WorkspaceExportFormat) => {
      if (
        node.absolutePath === currentDocumentPath &&
        !(await flushActiveMarkdownEditor('export'))
      ) {
        return;
      }

      return documentExport.exportDocument(
        {
          node,
          loadMarkdown: () =>
            resolveDocumentExportMarkdown({
              cachedMarkdown: editorSessions[node.absolutePath]?.markdown,
              currentDocumentPath,
              documentPath: node.absolutePath,
              draftMarkdown: workspace.draftDocument?.markdown,
              readDisk: async () => {
                if (!workspaceRootPath) {
                  throw new Error('未打开工作区，无法读取导出文档。');
                }

                return (
                  await readMarkdownDocument(workspaceRootPath, node.absolutePath)
                ).content;
              },
            }),
        },
        format,
      );
    },
    [
      currentDocumentPath,
      documentExport,
      editorSessions,
      flushActiveMarkdownEditor,
      workspace.draftDocument,
      workspaceRootPath,
    ],
  );

  const revealNodeInWorkspaceTree = React.useCallback(
    (absolutePath: string) => {
      setLeftPanelMode('workspace');
      workspace.setSearchQuery('');
      setTreeRevealRequest((current) => ({
        absolutePath,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    },
    [workspace],
  );

  const handleOpenImportedDocument = React.useCallback(
    async (node: WorkspaceNode) => {
      revealNodeInWorkspaceTree(node.absolutePath);
      await openDocumentNode(node);
    },
    [openDocumentNode, revealNodeInWorkspaceTree],
  );
  const documentImport = useDocumentImport({
    openDocument: handleOpenImportedDocument,
    refreshWorkspaceTree: workspace.refreshWorkspaceTree,
    rootPath: workspaceRootPath,
  });

  const handleOpenRecentDocument = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (!node) {
        return;
      }

      revealNodeInWorkspaceTree(node.absolutePath);
      void openDocumentNode(node);
    },
    [openDocumentNode, revealNodeInWorkspaceTree, workspace.snapshot?.nodes],
  );

  const handleOpenAiDocument = React.useCallback(
    (documentPath: string) => {
      if (systemPage === 'codex') {
        const document = findWorkspaceDocumentByPath(
          workspace.snapshot?.nodes ?? [],
          documentPath,
        );

        if (document) {
          setAiPreviewDocumentPath(document.absolutePath);
        }
        return;
      }

      handleOpenRecentDocument(documentPath);
    },
    [handleOpenRecentDocument, systemPage, workspace.snapshot?.nodes],
  );

  const handleOpenAiPreviewInEditor = React.useCallback(() => {
    if (!aiPreviewDocument) {
      return;
    }

    setAiPreviewDocumentPath(null);
    revealNodeInWorkspaceTree(aiPreviewDocument.absolutePath);
    void openDocumentNode(aiPreviewDocument);
  }, [aiPreviewDocument, openDocumentNode, revealNodeInWorkspaceTree]);

  const handleSelectGlobalSearchResult = React.useCallback(
    (result: WorkspaceGlobalSearchResult) => {
      if (result.document.kind === 'drawing' && result.document.drawingId) {
        setGlobalSearchOpen(false);
        setGlobalSearchQuery('');
        setLeftPanelMode('workspace');
        setSystemPage('drawings');
        showWorkspaceSidebar(false);
        clearCurrentDocument();
        void openDrawingFromLibrary(result.document.drawingId);
        return;
      }
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        result.document.absolutePath,
      );

      if (!node) {
        return;
      }

      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      revealNodeInWorkspaceTree(node.absolutePath);
      void openDocumentNode(node);
    },
    [
      clearCurrentDocument,
      openDrawingFromLibrary,
      openDocumentNode,
      revealNodeInWorkspaceTree,
      showWorkspaceSidebar,
      workspace.snapshot?.nodes,
    ],
  );

  const handleCreateDocument = React.useCallback(
    async (parentPath = '') => {
      const created = await workspace.createDocument(parentPath);

      if (created) {
        setDocumentEditorLayout((current) => openDocumentTab(current, created));
        rememberRecentDocument(created);
      }

      return created;
    },
    [rememberRecentDocument, workspace],
  );

  const handleRenameWorkspaceNode = React.useCallback(
    async (node: WorkspaceNode, newName: string) => {
      const renamed = await workspace.renameNode(node, newName);

      if (!renamed || node.kind !== 'document' || renamed.kind !== 'document') {
        return renamed;
      }

      setDocumentEditorLayout((current) =>
        renameDocumentTab(current, node.absolutePath, renamed),
      );
      setEditorSessions((current) => {
        const session = current[node.absolutePath];

        if (!session || node.absolutePath === renamed.absolutePath) {
          return current;
        }

        const next = { ...current };
        delete next[node.absolutePath];
        next[renamed.absolutePath] = session;
        return next;
      });
      setRecentDocuments((current) =>
        current.map((document) =>
          document.absolutePath === node.absolutePath
            ? toRecentDocument(renamed)
            : document,
        ),
      );

      return renamed;
    },
    [workspace],
  );

  const handleOpenDailyNote = React.useCallback(
    async (date: string) => {
      if (!workspaceRootPath) {
        return;
      }

      setSystemPage(null);
      const nextMonth = createDateFromDailyDate(date);

      setSelectedDailyDate(date);
      setDailyCalendarMonth(
        new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1),
      );

      const opened = await openDailyNote(workspaceRootPath, date);

      await workspace.refreshWorkspaceTree();
      await openDocumentNode(opened.node);
      void loadDailyNotesForMonth(nextMonth);
    },
    [loadDailyNotesForMonth, openDocumentNode, workspace, workspaceRootPath],
  );

  const handleOpenViewsPage = React.useCallback(() => {
    setSystemPage('views');
    workspace.clearCurrentDocument();
  }, [workspace]);

  const handleOpenCodexPage = React.useCallback(() => {
    setLeftPanelMode('workspace');
    setSystemPage('codex');
    showWorkspaceSidebar(false);
  }, [showWorkspaceSidebar]);

  const handleRightPanelModeChange = React.useCallback(
    (mode: RightPanelMode) => {
      if (systemPage === 'codex') {
        setSystemPage(null);
      }
      workspace.setRightPanelMode(mode);
    },
    [systemPage, workspace],
  );

  const handleOpenDrawingsPage = React.useCallback(() => {
    setLeftPanelMode('workspace');
    setSystemPage('drawings');
    showWorkspaceSidebar(false);
    clearCurrentDocument();
  }, [clearCurrentDocument, showWorkspaceSidebar]);

  const handleOpenInboxPage = React.useCallback(() => {
    setLeftPanelMode('workspace');
    setSystemPage('inbox');
    showWorkspaceSidebar(false);
    clearCurrentDocument();
    void loadInbox();
  }, [clearCurrentDocument, loadInbox, showWorkspaceSidebar]);

  const handleInboxPromoted = React.useCallback(
    async (node: WorkspaceNode) => {
      await workspace.refreshWorkspaceTree();
      await openDocumentNode(node);
    },
    [openDocumentNode, workspace],
  );

  const handleInboxDailyUpdated = React.useCallback(
    (daily: DailyNoteDocument) => {
      const today = new Date();
      setSelectedDailyDate(formatDailyDate(today));
      setDailyCalendarMonth(
        new Date(today.getFullYear(), today.getMonth(), 1),
      );
      const syncResult = workspace.syncExternalMarkdownDocument(daily.content);
      setEditorSessions((current) => {
        if (!(daily.content.path in current)) return current;
        if (
          daily.content.path === currentDocumentPath &&
          syncResult !== 'reloaded'
        ) {
          return current;
        }
        return {
          ...current,
          [daily.content.path]: {
            documentVersion: daily.content.modifiedAt,
            markdown: daily.content.content,
          },
        };
      });
      void workspace.refreshWorkspaceTree();
      void loadDailyNotesForMonth(today);
    },
    [
      currentDocumentPath,
      loadDailyNotesForMonth,
      workspace,
    ],
  );

  const handleOpenInboxDaily = React.useCallback(
    async (daily: DailyNoteDocument) => {
      await workspace.refreshWorkspaceTree();
      await openDocumentNode(daily.node);
    },
    [openDocumentNode, workspace],
  );

  const handleToggleNodePinned = React.useCallback(
    (node: WorkspaceNode) => {
      void workspace.updateNodeState(node, { pinned: !node.pinned });
    },
    [workspace],
  );

  const handleUnpinNode = React.useCallback(
    (node: WorkspaceNode) => {
      void workspace.updateNodeState(node, { pinned: false });
    },
    [workspace],
  );

  const handleToggleNodeLocked = React.useCallback(
    (node: WorkspaceNode) => {
      void workspace.updateNodeState(node, { locked: !node.locked });
    },
    [workspace],
  );

  const handleOpenWorkspaceViewNode = React.useCallback(
    (node: WorkspaceNode) => {
      setSystemPage(null);
      revealNodeInWorkspaceTree(node.absolutePath);

      if (node.kind === 'directory') {
        void workspace.selectDirectory(node);
        return;
      }

      void openDocumentNode(node);
    },
    [openDocumentNode, revealNodeInWorkspaceTree, workspace],
  );

  const handleSelectWorkspaceDirectory = React.useCallback(
    (node: WorkspaceNode) => {
      setSystemPage(null);
      void workspace.selectDirectory(node);
    },
    [workspace],
  );

  const getDocumentReadOnly = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      return Boolean(node?.locked);
    },
    [workspace.snapshot?.nodes],
  );

  const handleToggleDocumentReadOnly = React.useCallback(
    (documentPath: string) => {
      const node = findWorkspaceDocumentByPath(
        workspace.snapshot?.nodes ?? [],
        documentPath,
      );

      if (!node) {
        return;
      }

      void workspace.updateNodeState(node, { locked: !node.locked });
    },
    [workspace],
  );

  const openActiveDocumentForLayout = React.useCallback(
    (layout: DocumentEditorLayout) => {
      const activeTab = getActiveTab(layout);

      if (!activeTab) {
        clearPendingDocumentOpen();
        workspace.clearCurrentDocument();
        return;
      }

      if (activeTab.kind === 'plan') {
        clearPendingDocumentOpen();
        return;
      }

      rememberRecentDocumentByPath(activeTab.absolutePath);
      scheduleDocumentOpen(activeTab.absolutePath);
    },
    [
      clearPendingDocumentOpen,
      rememberRecentDocumentByPath,
      scheduleDocumentOpen,
      workspace,
    ],
  );

  const handleEditorMarkdownChange = React.useCallback(
    (
      documentPath: string,
      markdown: string,
      origin?: MarkdownEditorChangeOrigin,
      reason?: MarkdownEditorFlushReason,
    ) => {
      const perf = startWorkspacePerformanceMeasure('workspace.editor.markdown_change');

      setEditorSessions((current) => {
        const currentSession = current[documentPath];

        return {
          ...current,
          [documentPath]: {
            documentVersion: currentSession?.documentVersion ?? 0,
            markdown,
          },
        };
      });

      let saveResult: boolean | Promise<boolean> = true;

      if (documentPath === currentDocumentPath) {
        rememberRecentDocumentByPath(documentPath);
        saveResult = workspace.updateMarkdown(markdown, {
          preserveSource: origin === 'source',
          saveImmediately: reason !== undefined,
        }) ?? true;
      }

      perf.finish({
        characters: markdown.length,
      });
      perf.finishNextFrame({
        characters: markdown.length,
      });

      return saveResult;
    },
    [currentDocumentPath, rememberRecentDocumentByPath, workspace],
  );

  const applyDocumentEditorLayout = React.useCallback(
    async (nextLayout: DocumentEditorLayout) => {
      if (!(await flushActiveMarkdownEditor('document-switch'))) {
        return false;
      }

      setWarmDocumentPaths((current) =>
        updateDocumentEditorWarmPaths(current, nextLayout),
      );
      setDocumentEditorLayout(nextLayout);
      openActiveDocumentForLayout(nextLayout);
      return true;
    },
    [flushActiveMarkdownEditor, openActiveDocumentForLayout],
  );

  const flushAiWorkspaceChanges = React.useCallback(
    async (includeOpenTabs: boolean) => {
      if (!workspaceRootPath) return;
      const refreshRootPath = workspaceRootPath;
      const changes = [...pendingAiWorkspaceChangesRef.current.values()];
      pendingAiWorkspaceChangesRef.current.clear();

      const removedPaths = new Set(
        changes.flatMap((change) =>
          change.absolutePath &&
          (change.kind === 'delete' || Boolean(change.movePath))
            ? [change.absolutePath]
            : [],
        ),
      );
      const reloadPaths = new Set(
        changes.flatMap((change) =>
          change.absolutePath &&
          change.kind !== 'delete' &&
          !change.movePath &&
          change.absolutePath.toLocaleLowerCase().endsWith('.md')
            ? [change.absolutePath]
            : [],
        ),
      );
      if (includeOpenTabs) {
        for (const tab of documentEditorLayoutRef.current.tabs) {
          if (tab.kind !== 'document') continue;
          if (!removedPaths.has(tab.absolutePath)) {
            reloadPaths.add(tab.absolutePath);
          }
        }
      }

      let failedReads = 0;
      const documents = (
        await Promise.all(
          [...reloadPaths].map(async (documentPath) => {
            try {
              return await readMarkdownDocument(workspaceRootPath, documentPath);
            } catch {
              failedReads += 1;
              return null;
            }
          }),
        )
      ).filter((document): document is NonNullable<typeof document> => Boolean(document));
      if (workspaceRootPathRef.current !== refreshRootPath) return;
      if (failedReads > 0) {
        console.warn('重新读取 Codex 修改的文档失败', { count: failedReads });
      }

      const refreshedSessions = new Map<string, DocumentEditorSession>();
      const activeDocumentPath = currentDocumentPathRef.current;
      for (const document of documents) {
        const syncResult = syncExternalMarkdownDocumentRef.current(document);
        if (
          document.path !== activeDocumentPath ||
          syncResult === 'reloaded'
        ) {
          refreshedSessions.set(document.path, {
            documentVersion: document.modifiedAt,
            markdown: document.content,
          });
        }
      }

      setEditorSessions((current) => {
        const next = { ...current };
        for (const path of removedPaths) delete next[path];
        for (const [path, session] of refreshedSessions) {
          if (path in current || path === activeDocumentPath) {
            next[path] = session;
          }
        }
        return next;
      });

      const nextSnapshot = await refreshWorkspaceTree();
      if (!nextSnapshot || workspaceRootPathRef.current !== refreshRootPath) return;
      const latestLayout = documentEditorLayoutRef.current;
      const unavailablePaths = new Set(removedPaths);
      for (const tab of latestLayout.tabs) {
        if (tab.kind !== 'document') continue;
        if (!findWorkspaceDocumentByPath(nextSnapshot.nodes, tab.absolutePath)) {
          unavailablePaths.add(tab.absolutePath);
        }
      }
      if (unavailablePaths.size > 0) {
        let nextLayout = latestLayout;
        for (const path of unavailablePaths) {
          nextLayout = closeDocumentTab(nextLayout, path);
        }
        if (nextLayout !== latestLayout) {
          documentEditorLayoutRef.current = nextLayout;
          applyDocumentEditorLayout(nextLayout);
        }
      }
    },
    [
      applyDocumentEditorLayout,
      refreshWorkspaceTree,
      workspaceRootPath,
    ],
  );

  const queueAiWorkspaceRefresh = React.useCallback(
    (includeOpenTabs: boolean) => {
      const refresh = aiWorkspaceRefreshQueueRef.current.then(() =>
        flushAiWorkspaceChanges(includeOpenTabs),
      );
      aiWorkspaceRefreshQueueRef.current = refresh.catch((error) => {
        console.error('刷新 Codex 修改后的工作区失败', error);
      });
      return aiWorkspaceRefreshQueueRef.current;
    },
    [flushAiWorkspaceChanges],
  );

  const handleAiWorkspaceChanged = React.useCallback(
    (event: AiWorkspaceChangeEvent) => {
      if (event.type === 'fileChangesCompleted') {
        for (const change of event.changes) {
          const key = `${change.absolutePath ?? change.path}:${change.movePath ?? ''}`;
          pendingAiWorkspaceChangesRef.current.set(key, change);
        }
        if (aiWorkspaceRefreshTimerRef.current) {
          clearTimeout(aiWorkspaceRefreshTimerRef.current);
        }
        aiWorkspaceRefreshTimerRef.current = setTimeout(() => {
          aiWorkspaceRefreshTimerRef.current = null;
          queueAiWorkspaceRefresh(false);
        }, 120);
        return;
      }

      if (aiWorkspaceRefreshTimerRef.current) {
        clearTimeout(aiWorkspaceRefreshTimerRef.current);
        aiWorkspaceRefreshTimerRef.current = null;
      }
      void queueAiWorkspaceRefresh(true).finally(() => {
        workspace.finishAiDocumentSync();
      });
    },
    [queueAiWorkspaceRefresh, workspace],
  );

  const handleBeforeAiTurnStart = React.useCallback(
    async (
      expectedDocumentPath: string | null,
      expectedDrawingId: string | null,
    ) => {
      if (expectedDocumentPath) {
        if (currentDocumentPathRef.current !== expectedDocumentPath) {
          throw new Error(
            '当前标签页尚未完成加载，无法安全发送给 Codex。请稍后重试。',
          );
        }
        if (!(await flushActiveMarkdownEditor('ai-send'))) return false;
        if (!(await workspace.prepareCurrentDocumentForAi())) return false;
      }

      if (expectedDrawingId) {
        if (
          systemPage !== 'drawings' ||
          drawings.descriptor?.meta.id !== expectedDrawingId
        ) {
          throw new Error(
            '当前图稿尚未完成加载，无法安全发送给 Codex。请稍后重试。',
          );
        }
        await drawings.flush();
      }
      return true;
    },
    [drawings, flushActiveMarkdownEditor, systemPage, workspace],
  );

  const handleResolveAiDocumentConflict = React.useCallback(
    async (resolution: 'external' | 'local') => {
      const conflict = workspace.externalDocumentConflict;
      const localDraft = workspace.draftDocument;
      if (!conflict) return;
      const confirmed = await confirmAction({
        confirmLabel:
          resolution === 'external' ? '加载 AI 版本' : '覆盖 AI 版本',
        description:
          resolution === 'external'
            ? '加载 Codex 写入的磁盘版本会丢弃当前未保存草稿。'
            : '当前草稿将覆盖 Codex 写入的磁盘版本。',
        title:
          resolution === 'external' ? '放弃当前草稿？' : '覆盖 AI 版本？',
        variant: 'destructive',
      });
      if (!confirmed) return;
      const resolved = await workspace.resolveExternalDocumentConflict(resolution);
      if (!resolved) return;
      const content =
        resolution === 'external'
          ? conflict.externalDocument.content
          : localDraft?.markdown;
      if (content === undefined) return;
      setEditorSessions((current) => ({
        ...current,
        [conflict.path]: {
          documentVersion:
            resolution === 'external'
              ? conflict.externalDocument.modifiedAt
              : Date.now(),
          markdown: content,
        },
      }));
    },
    [confirmAction, workspace],
  );

  React.useEffect(
    () => () => {
      if (aiWorkspaceRefreshTimerRef.current) {
        clearTimeout(aiWorkspaceRefreshTimerRef.current);
      }
    },
    [],
  );

  const handleDeleteWorkspaceNode = React.useCallback(
    async (node: WorkspaceNode) => {
      await workspace.deleteNode(node);

      if (node.kind !== 'document') {
        return;
      }

      setEditorSessions((current) => {
        if (!(node.absolutePath in current)) {
          return current;
        }

        const next = { ...current };
        delete next[node.absolutePath];
        return next;
      });
      setRecentDocuments((current) =>
        current.filter(
          (document) => document.absolutePath !== node.absolutePath,
        ),
      );

      const nextLayout = closeDocumentTab(
        documentEditorLayout,
        node.absolutePath,
      );

      if (nextLayout !== documentEditorLayout) {
        applyDocumentEditorLayout(nextLayout);
      }
    },
    [applyDocumentEditorLayout, documentEditorLayout, workspace],
  );

  const handleSelectDocumentTab = React.useCallback(
    (tabId: string) => {
      applyDocumentEditorLayout(selectDocumentTab(documentEditorLayout, tabId));
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlTabOnly =
        event.ctrlKey && event.key === 'Tab' && !event.altKey && !event.metaKey;
      if (!isCtrlTabOnly) {
        return;
      }

      event.preventDefault();

      if (documentEditorLayout.tabs.length < 2) {
        return;
      }

      const activeIndex = documentEditorLayout.tabs.findIndex(
        (tab) => tab.id === documentEditorLayout.activeTabId,
      );
      const currentIndex = activeIndex === -1 ? 0 : activeIndex;
      const offset = event.shiftKey ? -1 : 1;
      const nextIndex =
        (currentIndex + offset + documentEditorLayout.tabs.length) %
        documentEditorLayout.tabs.length;
      const nextTab = documentEditorLayout.tabs[nextIndex];

      if (nextTab) {
        applyDocumentEditorLayout(
          selectDocumentTab(documentEditorLayout, nextTab.id),
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    applyDocumentEditorLayout,
    documentEditorLayout,
  ]);

  const handleRemoveWorkspace = React.useCallback(
    (rootPath: string) => {
      const isRemovingCurrent = workspace.snapshot?.rootPath === rootPath;
      const history = workspace.workspaceHistory;
      const currentIndex = history.findIndex(
        (item) => item.rootPath === rootPath,
      );
      const canAutoAdvance = isRemovingCurrent && currentIndex >= 0;
      const nextWorkspacePath = canAutoAdvance
        ? history[currentIndex + 1]?.rootPath
        : null;

      workspace.removeWorkspace(rootPath);

      if (nextWorkspacePath) {
        void workspace.switchWorkspace(nextWorkspacePath);
      }
    },
    [workspace],
  );

  const handleCloseDocumentTab = React.useCallback(
    (tabId: string) => {
      applyDocumentEditorLayout(closeDocumentTab(documentEditorLayout, tabId));
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseOtherDocumentTabs = React.useCallback(
    (tabId: string) => {
      applyDocumentEditorLayout(
        closeOtherDocumentTabs(documentEditorLayout, tabId),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseAllDocumentTabs = React.useCallback(
    () => {
      applyDocumentEditorLayout(closeAllDocumentTabs());
    },
    [applyDocumentEditorLayout],
  );

  const handleCloseDocumentTabsToLeft = React.useCallback(
    (tabId: string) => {
      applyDocumentEditorLayout(
        closeDocumentTabsToLeft(documentEditorLayout, tabId),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleCloseDocumentTabsToRight = React.useCallback(
    (tabId: string) => {
      applyDocumentEditorLayout(
        closeDocumentTabsToRight(documentEditorLayout, tabId),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const handleOpenPlanPreview = React.useCallback(
    (plan: AiProposedPlan, threadId: string) => {
      setSystemPage(null);
      setLeftPanelMode('workspace');
      applyDocumentEditorLayout(
        openPlanPreviewTab(documentEditorLayout, {
          id: plan.id,
          text: plan.text,
          threadId,
        }),
      );
    },
    [applyDocumentEditorLayout, documentEditorLayout],
  );

  const openGitPanel = React.useCallback(() => {
    setSystemPage(null);

    if (leftPanelMode === 'git') {
      setLeftPanelMode('workspace');
      workspace.setSidebarCollapsed(false);
      return;
    }

    setLeftPanelMode('git');
    workspace.setSidebarCollapsed(false);
    void refreshGitStatus();
  }, [leftPanelMode, refreshGitStatus, workspace]);

  const toggleGitLogDrawer = React.useCallback(() => {
    setBottomPanelMode((current) => {
      const next: BottomPanelMode = current === 'git-log' ? null : 'git-log';

      if (next === 'git-log') {
        void refreshGitLog();
      }

      return next;
    });
  }, [refreshGitLog]);

  const toggleTerminalPanel = React.useCallback(() => {
    setBottomPanelMode((current) => {
      return current === 'terminal' ? null : 'terminal';
    });
  }, []);

  const toggleLeftSidebar = React.useCallback(() => {
    workspace.setSidebarCollapsed(!workspace.isSidebarCollapsed);
  }, [workspace]);
  const pinnedNodes = React.useMemo(
    () => flattenWorkspaceNodes(workspace.snapshot?.nodes ?? []).filter(
      (node) => node.pinned,
    ),
    [workspace.snapshot?.nodes],
  );
  const [isRefreshingWorkspaceTree, setIsRefreshingWorkspaceTree] =
    React.useState(false);
  const refreshWorkspaceTreeFromChrome = React.useCallback(() => {
    if (isRefreshingWorkspaceTree) {
      return;
    }

    setIsRefreshingWorkspaceTree(true);
    void workspace
      .refreshWorkspaceTree()
      .catch(() => null)
      .finally(() => {
        setIsRefreshingWorkspaceTree(false);
      });
  }, [isRefreshingWorkspaceTree, workspace]);

  return (
    <main
      className="relative flex h-screen w-full overflow-hidden bg-sidebar text-foreground antialiased"
      data-chrome="workspace"
      data-testid="workspace-shell"
    >
      {isTauriRuntime && isWindowsRuntime ? (
        <div
          className="absolute inset-x-0 top-0 z-40 flex h-8 items-stretch border-b border-sidebar-border/60 bg-sidebar"
          data-tauri-drag-region="deep"
          data-testid="workspace-titlebar-drag-region"
        >
          <WindowsTitlebarControls />
        </div>
      ) : null}

      {systemPage === 'settings' ? null : (
        <SidebarChromeToggle
          collapsed={workspace.isSidebarCollapsed}
          macChromeOffset={isTauriRuntime && isMacRuntime}
          refreshing={isRefreshingWorkspaceTree}
          windowsChromeInset={isTauriRuntime && isWindowsRuntime}
          pinnedNodes={pinnedNodes}
          onToggle={toggleLeftSidebar}
          onOpenPinnedNode={handleOpenWorkspaceViewNode}
          onRefresh={refreshWorkspaceTreeFromChrome}
          onUnpinNode={handleUnpinNode}
        />
      )}

      <WorkspaceGlobalSearchDialog
        indexStatus={activeGlobalSearchStatus}
        open={globalSearchOpen}
        query={globalSearchQuery}
        results={globalSearchResults}
        onOpenChange={setGlobalSearchOpen}
        onQueryChange={setGlobalSearchQuery}
        onSelectResult={handleSelectGlobalSearchResult}
      />

      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 overflow-hidden',
          isTauriRuntime && isWindowsRuntime && 'pt-8',
        )}
        data-testid="workspace-main-blocks"
      >
        {systemPage === 'settings' ? (
          <WorkspaceSettingsPage
            appUpdate={appUpdate}
            header={
              <header
                className="h-11 shrink-0"
                data-tauri-drag-region="deep"
                data-testid="workspace-settings-header"
              />
            }
            initialSettings={appSettings}
            initialSectionId={settingsInitialSectionId}
            sidebarResize={{
              max: LEFT_PANEL_WIDTH.max,
              min: LEFT_PANEL_WIDTH.min,
              onResize: handleLeftSidebarResize,
            }}
            sidebarWidth={leftSidebarWidth}
            sessionCache={settingsSessionCache}
            windowsChromeInset={isTauriRuntime && isWindowsRuntime}
            workspaceRootPath={workspace.snapshot?.rootPath ?? null}
            onBack={() => setSystemPage(null)}
            onSettingsSaved={(settings) => {
              setAppSettings(settings);
              setPageWidthMode(settings.appearance.pageWidthMode);
              setAppearanceFonts(settings.appearance.fonts);
              setSettingsVersion((current) => current + 1);
            }}
          />
        ) : (
        <div className="flex min-w-0 flex-1 overflow-hidden">
            {leftPanelMode === 'workspace' ? (
              <WorkspaceSidebar
                appUpdateAvailable={appUpdate.available}
                dailyCalendar={
                  workspace.snapshot ? (
                    <DailyNoteCalendar
                      contentDates={dailyContentDates}
                      isLoading={dailyNotesLoading}
                      month={dailyCalendarMonth}
                      selectedDate={selectedDailyDate}
                      onMonthChange={(month) =>
                        setDailyCalendarMonth(
                          new Date(month.getFullYear(), month.getMonth(), 1),
                        )
                      }
                      onSelectDate={(date) => void handleOpenDailyNote(date)}
                    />
                  ) : null
                }
                inboxContent={
                  workspace.snapshot ? (
                    <InboxSidebar
                      controller={inbox}
                      nodes={workspace.snapshot.nodes}
                      onDailyUpdated={handleInboxDailyUpdated}
                      onOpenDaily={(daily) => void handleOpenInboxDaily(daily)}
                      onPromoted={(node) => void handleInboxPromoted(node)}
                    />
                  ) : null
                }
                drawingContent={
                  workspace.snapshot ? (
                    <DrawingSidebar controller={drawings} />
                  ) : null
                }
                width={leftSidebarWidth}
                workspace={workspace}
                onCreateDocument={handleCreateDocument}
                onExportNode={
                  documentExport.available ? handleExportDocument : undefined
                }
                onImportDocuments={
                  documentImport.available
                    ? documentImport.importDocuments
                    : undefined
                }
                onOpenDailyNote={() =>
                  void handleOpenDailyNote(formatDailyDate(new Date()))
                }
                onOpenCodex={handleOpenCodexPage}
                onOpenInbox={handleOpenInboxPage}
                onOpenDrawings={handleOpenDrawingsPage}
                onOpenGlobalSearch={openGlobalSearch}
                onOpenViews={handleOpenViewsPage}
                onOpenInFileManager={handleOpenNodeInFileManager}
                onOpenSettings={openSettingsPage}
                onRemoveWorkspace={handleRemoveWorkspace}
                onDeleteNode={handleDeleteWorkspaceNode}
                onRenameNode={handleRenameWorkspaceNode}
                revealNodePath={treeRevealRequest?.absolutePath ?? null}
                revealNodeRequestId={treeRevealRequest?.requestId}
                onSelectDirectory={handleSelectWorkspaceDirectory}
                onSelectDocument={openDocumentNode}
                onTogglePinned={handleToggleNodePinned}
                inboxActiveCount={inbox.activeCount}
                systemPage={
                  systemPage === 'drawings' ||
                  systemPage === 'codex' ||
                  systemPage === 'inbox' ||
                  systemPage === 'views'
                    ? systemPage
                    : null
                }
                windowsChromeInset={isTauriRuntime && isWindowsRuntime}
              />
            ) : workspace.isSidebarCollapsed ? null : (
              <div
                className={cn(
                  'min-h-0 shrink-0',
                  isTauriRuntime && isMacRuntime
                    ? 'mt-10 [&>aside]:rounded-none [&>aside]:border-0 [&>aside]:bg-transparent'
                    : 'my-2 ml-2',
                )}
                data-testid="workspace-git-panel-column"
                style={{ width: leftSidebarWidth }}
              >
                <GitPanel
                  error={gitError}
                  isLoading={gitLoading}
                  probe={gitProbeState}
                  selectedPath={gitSelectedPath}
                  selectedPaths={gitSelectedPaths}
                  status={gitStatusState}
                  onCommit={handleGitCommit}
                  onCommitAndPush={handleGitCommitAndPush}
                  onCommitSingleFile={handleGitCommitSingleFile}
                  onDeleteFile={handleGitDeleteFile}
                  onInitRepository={handleGitInit}
                  onRefresh={refreshGitStatus}
                  onRevertFile={handleGitRevertFile}
                  onSelectChange={handleGitSelectChange}
                  onSelectFile={handleGitSelectFile}
                  onStageFile={handleGitStageFile}
                  onStageSelected={handleGitStageSelected}
                  onUnstageFile={handleGitUnstageFile}
                  onUnstageSelected={handleGitUnstageSelected}
                />
              </div>
            )}

            {leftPanelMode === 'workspace' || !workspace.isSidebarCollapsed ? (
              <WorkspaceResizeHandle
                aria-label="调整左侧目录宽度"
                className={cn(
                  '-mr-2 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  workspace.isSidebarCollapsed
                    ? 'pointer-events-none opacity-0'
                    : 'opacity-100',
                )}
                direction="left"
                max={LEFT_PANEL_WIDTH.max}
                min={LEFT_PANEL_WIDTH.min}
                value={leftSidebarWidth}
                onResize={handleLeftSidebarResize}
              />
            ) : null}

            <div
              className="relative m-2 flex min-h-0 min-w-0 max-w-full flex-1 gap-2 overflow-hidden bg-sidebar"
              data-testid="workspace-panel-group"
              style={
                {
                  '--workspace-main-header-height':
                    isTauriRuntime && isWindowsRuntime ? '2rem' : '2.75rem',
                } as React.CSSProperties
              }
            >
              <div
                className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background"
                data-testid="workspace-editor-column"
              >
              <section
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
                data-chrome="workspace-main-surface"
                data-testid="workspace-editor-block"
              >
                <WorkspaceMainHeader
                  documentTabs={
                    showDocumentTabs ? (
                      <DocumentTabBar
                        activeTabId={documentEditorLayout.activeTabId}
                        tabs={documentEditorLayout.tabs}
                        onCloseAllTabs={handleCloseAllDocumentTabs}
                        onCloseOtherTabs={handleCloseOtherDocumentTabs}
                        onCloseTab={handleCloseDocumentTab}
                        onCloseTabsToLeft={handleCloseDocumentTabsToLeft}
                        onCloseTabsToRight={handleCloseDocumentTabsToRight}
                        onSelectTab={handleSelectDocumentTab}
                      />
                    ) : null
                  }
                  gitLogOpen={gitLogOpen}
                  leftPanelMode={leftPanelMode}
                  macChromeInset={
                    isTauriRuntime &&
                    isMacRuntime &&
                    workspace.isSidebarCollapsed
                  }
                  terminalOpen={terminalOpen}
                  windowsChromeInset={isTauriRuntime && isWindowsRuntime}
                  onOpenGitPanel={openGitPanel}
                  onToggleGitLog={toggleGitLogDrawer}
                  onToggleTerminal={toggleTerminalPanel}
                >
                  <RightToolRail
                    mode={effectiveRightPanelMode}
                    orientation="header"
                    showSettingsButton={false}
                    onModeChange={handleRightPanelModeChange}
                    onOpenSettings={() => openSettingsPage('appearance')}
                  />
                </WorkspaceMainHeader>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <div
                    className={cn(
                      'min-h-0 min-w-0 flex-1 overflow-hidden',
                      systemPage === 'codex' && 'hidden',
                    )}
                  >
                    {systemPage === 'drawings' && workspace.snapshot ? (
                      <DrawingWorkspacePage
                        controller={drawings}
                        rootPath={workspace.snapshot.rootPath}
                        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                      />
                    ) : systemPage === 'inbox' && workspace.snapshot ? (
                      <InboxPage
                        controller={inbox}
                        pageWidthMode={pageWidthMode}
                        rootPath={workspace.snapshot.rootPath}
                      />
                    ) : systemPage === 'views' && workspace.snapshot ? (
                      <WorkspaceViewsPage
                        nodes={filterRegularWorkspaceNodes(
                          workspace.snapshot.nodes,
                        )}
                        onOpenNode={handleOpenWorkspaceViewNode}
                        onRefresh={() => void workspace.refreshWorkspaceTree()}
                        onToggleLocked={handleToggleNodeLocked}
                        onTogglePinned={handleToggleNodePinned}
                      />
                    ) : leftPanelMode === 'git' ? (
                      <GitDiffView
                        diff={gitDiffState}
                        error={gitError}
                        isLoading={gitLoading && Boolean(gitSelectedPath)}
                        label={gitDiffLabel}
                      />
                    ) : activeEditorTab?.kind === 'plan' ||
                      workspace.currentDocument ||
                      (!workspace.currentDirectory && hasOpenDocumentTabs) ? (
                      <DocumentEditorSurface
                        activeDocumentPath={activePanelDocumentPath}
                        activeEditorRef={activeMarkdownEditorRef}
                        currentDocumentPath={currentDocumentPath}
                        documentEditorLayout={documentEditorLayout}
                        documentLoadError={workspace.documentLoadError}
                        documentLoadState={workspace.documentLoadState}
                        documentVersion={workspace.documentVersion}
                        draftMarkdown={workspace.draftDocument?.markdown ?? null}
                        editorSessions={editorSessions}
                        pageWidthMode={pageWidthMode}
                        warmDocumentPaths={warmDocumentPaths}
                        workspaceRootPath={workspace.snapshot?.rootPath ?? null}
                        getDocumentReadOnly={getDocumentReadOnly}
                        onMarkdownChange={handleEditorMarkdownChange}
                        onRetryDocument={workspace.retryCurrentDocument}
                        onSaveRequested={() =>
                          void saveCurrentDocumentNow()
                        }
                        onSelectTab={handleSelectDocumentTab}
                      />
                    ) : (
                      <EditorPane
                        currentDirectory={workspace.currentDirectory}
                        currentDocument={workspace.currentDocument}
                        directoryContent={
                          workspace.currentDirectory ? (
                            <DirectoryPage
                              key={workspace.currentDirectory.absolutePath}
                              directory={workspace.currentDirectory}
                              workspaceRootPath={
                                workspace.snapshot?.rootPath ?? ''
                              }
                              onOpenDocument={openDocumentNode}
                              onSelectDirectory={(node) =>
                                void workspace.selectDirectory(node)
                              }
                            />
                          ) : null
                        }
                        documentLoadError={workspace.documentLoadError}
                        documentLoadState={workspace.documentLoadState}
                        hasWorkspace={workspace.snapshot !== null}
                        isWorkspaceEmpty={isWorkspaceEmpty}
                        onCreateDirectory={() => void workspace.createDirectory('')}
                        onCreateDocument={() => void handleCreateDocument('')}
                        onImportMarkdown={() =>
                          void documentImport.importDocuments('', 'markdown')
                        }
                        onOpenRecentDocument={handleOpenRecentDocument}
                        onOpenWorkspace={workspace.openWorkspace}
                        onRetryDocument={workspace.retryCurrentDocument}
                        recentDocuments={visibleRecentDocuments}
                      >
                        {null}
                      </EditorPane>
                    )}
                  </div>

                </div>

                {workspace.externalDocumentConflict ? (
                  <ExternalDocumentConflictBanner
                    onKeepLocal={() =>
                      void handleResolveAiDocumentConflict('local')
                    }
                    onLoadExternal={() =>
                      void handleResolveAiDocumentConflict('external')
                    }
                  />
                ) : null}

                <WorkspaceStatusBar
                  characterCount={documentCharacterCount}
                  lineCount={documentLineCount}
                  saveError={workspace.saveError}
                  saveState={workspace.saveState}
                  visible={
                    systemPage !== 'codex' &&
                    activeEditorTab?.kind !== 'plan' &&
                    Boolean(workspace.currentDocument) &&
                    workspace.documentLoadState === 'loaded'
                  }
                />
              </section>
              {gitLogOpen ? (
                <WorkspaceHorizontalResizeHandle
                  aria-label="调整 Git 日志高度"
                  max={GIT_LOG_HEIGHT.max}
                  min={GIT_LOG_HEIGHT.min}
                  value={gitLogHeight}
                  onResize={setGitLogHeight}
                />
              ) : null}
              {terminalOpen ? (
                <WorkspaceHorizontalResizeHandle
                  aria-label="调整终端高度"
                  max={GIT_LOG_HEIGHT.max}
                  min={GIT_LOG_HEIGHT.min}
                  value={terminalHeight}
                  onResize={setTerminalHeight}
                />
              ) : null}
              <GitLogDrawer
                branches={gitLogBranches}
                branchWidth={gitLogBranchWidth}
                commits={gitLogCommits}
                detailsHeight={gitLogDetailHeight}
                detailsWidth={gitLogDetailWidth}
                error={gitLogError}
                files={gitLogFiles}
                height={gitLogHeight}
                isLoading={gitLogLoading}
                open={gitLogOpen}
                selectedCommitHash={gitLogSelectedHash}
                onClose={() => setBottomPanelMode(null)}
                onRefresh={refreshGitLog}
                onResizeBranchWidth={setGitLogBranchWidth}
                onResizeDetailsHeight={setGitLogDetailHeight}
                onResizeDetailsWidth={setGitLogDetailWidth}
                onSelectCommit={(hash) => void loadGitLogCommitFiles(hash)}
                onSelectFile={(file) => void handleGitLogSelectFile(file)}
              />
              {shouldRenderTerminalPanel ? (
                <div
                  className={cn(
                    'min-h-0 w-full min-w-0 max-w-full shrink-0 overflow-hidden',
                    !terminalOpen && 'hidden',
                  )}
                >
                  <TerminalPanel
                    activeTabId={terminalActiveTabId}
                    error={terminalError}
                    height={terminalHeight}
                    isTauriRuntime={isTauriRuntime}
                    rootPath={workspaceRootPath}
                    tabs={terminalTabs}
                    onClose={() => setBottomPanelMode(null)}
                    onCloseTab={handleTerminalCloseTab}
                    onNewTab={() => void createTerminalTab()}
                    onSelectTab={setTerminalActiveTabId}
                  >
                    {terminalTabs.map((tab) => (
                      <div
                        className={cn(
                          'h-full min-h-0',
                          tab.id !== terminalActiveTabId && 'hidden',
                        )}
                        key={tab.id}
                      >
                        <XtermTerminal
                          isActive={terminalOpen && tab.id === terminalActiveTabId}
                          outputStore={terminalOutputStore}
                          sessionId={tab.id}
                          themeMode={terminalThemeMode}
                          onData={handleTerminalData}
                          onResize={handleTerminalResize}
                        />
                      </div>
                    ))}
                  </TerminalPanel>
                </div>
              ) : null}
              </div>

              {systemPage !== 'codex' && workspace.rightPanelMode ? (
                <WorkspaceResizeHandle
                  aria-label="调整右侧面板宽度"
                  className="-mx-2 bg-sidebar"
                  direction="right"
                  max={rightPanelWidthLimits.max}
                  min={rightPanelWidthLimits.min}
                  value={rightPanelWidth}
                  onResize={handleRightPanelResize}
                />
              ) : null}

              <RightSidePanel
                activeDrawing={activeAiDrawing}
                aiPresentation={
                  systemPage === 'codex' ? 'workspace' : 'panel'
                }
                aiWorkspacePreview={
                  systemPage === 'codex' && aiPreviewDocument ? (
                    <AiDocumentPreview
                      document={aiPreviewDocument}
                      markdownOverride={aiPreviewMarkdownOverride}
                      pageWidthMode={pageWidthMode}
                      workspaceRootPath={workspaceRootPath}
                      onClose={() => setAiPreviewDocumentPath(null)}
                      onOpenInEditor={handleOpenAiPreviewInEditor}
                    />
                  ) : null
                }
                aiWorkspacePreviewWidth={aiWorkspacePreviewWidth}
                currentDocument={activePanelDocument}
                currentDocumentPath={activePanelDocumentPath}
                documentPanelData={documentPanelData}
                documents={
                  workspace.snapshot
                    ? flattenDocuments(workspace.snapshot.nodes)
                    : []
                }
                drawings={aiDrawingReferences}
                documentReadOnly={
                  activePanelDocument
                    ? getDocumentReadOnly(activePanelDocument.absolutePath)
                    : false
                }
                mode={effectiveRightPanelMode}
                width={rightPanelWidth}
                workspaceRootPath={workspaceRootPath}
                onBeforeTurnStart={handleBeforeAiTurnStart}
                onDrawingToolCall={handleAiDrawingToolCall}
                onAiWorkspacePreviewResize={setAiWorkspacePreviewWidth}
                onOpenDocument={handleOpenAiDocument}
                onOpenPlanPreview={handleOpenPlanPreview}
                onWorkspaceChanged={handleAiWorkspaceChanged}
                onToggleDocumentReadOnly={
                  activePanelDocument
                    ? () =>
                        handleToggleDocumentReadOnly(
                          activePanelDocument.absolutePath,
                        )
                    : undefined
                }
              />
            </div>
        </div>
        )}
      </div>
      {documentExport.renderer}
      {documentImport.reportDialog}
      <ConfirmationDialog
        request={confirmationRequest}
        onResolve={resolveConfirmation}
      />
    </main>
  );
}

function useIsTauriRuntime() {
  return React.useSyncExternalStore(
    subscribeToStaticRuntimeSnapshot,
    getTauriRuntimeSnapshot,
    getServerTauriRuntimeSnapshot,
  );
}

function SidebarChromeToggle({
  collapsed,
  macChromeOffset,
  refreshing,
  windowsChromeInset,
  pinnedNodes,
  onToggle,
  onOpenPinnedNode,
  onRefresh,
  onUnpinNode,
}: {
  collapsed: boolean;
  macChromeOffset: boolean;
  refreshing: boolean;
  windowsChromeInset: boolean;
  pinnedNodes: WorkspaceNode[];
  onToggle: () => void;
  onOpenPinnedNode: (node: WorkspaceNode) => void;
  onRefresh: () => void;
  onUnpinNode: (node: WorkspaceNode) => void;
}) {
  const label = collapsed ? '展开侧边栏' : '折叠侧边栏';

  return (
    <div
      className={cn(
        'absolute z-50 flex h-8 items-center gap-1',
        macChromeOffset ? 'top-3.5' : 'top-0',
        windowsChromeInset ? 'left-2' : 'left-[80px]',
      )}
      data-testid="sidebar-chrome-toggle"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={label}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-sidebar-toggle-state={collapsed ? 'collapsed' : 'expanded'}
              type="button"
              onClick={onToggle}
            >
              {collapsed ? <SidebarCollapsedIcon /> : <SidebarExpandedIcon />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PinnedChromeMenu
        nodes={pinnedNodes}
        onOpenNode={onOpenPinnedNode}
        onUnpinNode={onUnpinNode}
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="刷新工作区"
              className="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-refreshing={refreshing ? 'true' : 'false'}
              type="button"
              onClick={onRefresh}
            >
              <RefreshCw
                className={cn('size-4', refreshing && 'animate-spin')}
                strokeWidth={1.85}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            刷新工作区
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function SidebarExpandedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-[35px] shrink-0"
      fill="none"
      viewBox="0 0 70 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="22"
        rx="5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        width="24"
        x="20"
        y="21"
      />
      <path
        d="M26 27V37"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SidebarCollapsedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[25px] w-[34px] shrink-0"
      fill="none"
      viewBox="0 0 68 50"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="26"
        rx="5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        width="28"
        x="24"
        y="11"
      />
      <path
        d="M45 18V30"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function subscribeToStaticRuntimeSnapshot() {
  return () => {};
}

function getTauriRuntimeSnapshot() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getServerTauriRuntimeSnapshot() {
  return false;
}

function useIsMacRuntime() {
  return React.useSyncExternalStore(
    subscribeToStaticRuntimeSnapshot,
    getMacRuntimeSnapshot,
    getServerMacRuntimeSnapshot,
  );
}

function getMacRuntimeSnapshot() {
  if (typeof window === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navigatorWithUserAgentData.userAgentData?.platform ??
    navigator.platform ??
    '';

  return (
    /mac/i.test(platform) || /macintosh|mac os x/i.test(navigator.userAgent)
  );
}

function getServerMacRuntimeSnapshot() {
  return false;
}

function useIsWindowsRuntime() {
  return React.useSyncExternalStore(
    subscribeToStaticRuntimeSnapshot,
    getWindowsRuntimeSnapshot,
    getServerWindowsRuntimeSnapshot,
  );
}

function getWindowsRuntimeSnapshot() {
  if (typeof window === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform =
    navigatorWithUserAgentData.userAgentData?.platform ??
    navigator.platform ??
    '';

  return /win/i.test(platform) || /windows/i.test(navigator.userAgent);
}

function getServerWindowsRuntimeSnapshot() {
  return false;
}

function WindowsTitlebarControls() {
  return (
    <div
      className="ml-auto flex h-full items-stretch"
      data-testid="windows-titlebar-controls"
    >
      <button
        aria-label="最小化窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        type="button"
        onClick={() => void minimizeAppWindow()}
      >
        <Minus size={14} strokeWidth={1.8} />
      </button>
      <button
        aria-label="最大化或还原窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        type="button"
        onClick={() => void toggleMaximizeAppWindow()}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        aria-label="关闭窗口"
        className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        type="button"
        onClick={() => void closeAppWindow()}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function WorkspaceMainHeader({
  children,
  documentTabs,
  gitLogOpen,
  leftPanelMode,
  macChromeInset,
  terminalOpen,
  windowsChromeInset,
  onOpenGitPanel,
  onToggleGitLog,
  onToggleTerminal,
}: {
  children: React.ReactNode;
  documentTabs?: React.ReactNode;
  gitLogOpen: boolean;
  leftPanelMode: LeftPanelMode;
  macChromeInset: boolean;
  terminalOpen: boolean;
  windowsChromeInset: boolean;
  onOpenGitPanel: () => void;
  onToggleGitLog: () => void;
  onToggleTerminal: () => void;
}) {
  return (
    <header
      className={cn(
        'relative flex shrink-0 items-center gap-1 pr-3',
        windowsChromeInset ? 'h-8' : 'h-11',
        macChromeInset ? 'pl-44' : 'pl-3',
      )}
      data-tauri-drag-region="deep"
      data-testid="workspace-main-header"
    >
      <div className="min-w-0 flex-1">{documentTabs}</div>
      <TooltipProvider>
        <div
          className="z-10 ml-auto flex items-center gap-0.5"
          data-testid="right-header-tools"
        >
          <ThemeQuickMenu />
          <HeaderToolTooltip label="打开 Git 面板">
            <button
              aria-label="打开 Git 面板"
              className={headerToolButtonClassName(leftPanelMode === 'git')}
              type="button"
              onClick={onOpenGitPanel}
            >
              <GitBranch size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          <HeaderToolTooltip label={terminalOpen ? '关闭终端' : '打开终端'}>
            <button
              aria-label={terminalOpen ? '关闭终端' : '打开终端'}
              className={headerToolButtonClassName(terminalOpen)}
              type="button"
              onClick={onToggleTerminal}
            >
              <SquareTerminal size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          <HeaderToolTooltip label={gitLogOpen ? '关闭 Git 日志' : '打开 Git 日志'}>
            <button
              aria-label={gitLogOpen ? '关闭 Git 日志' : '打开 Git 日志'}
              className={headerToolButtonClassName(gitLogOpen)}
              type="button"
              onClick={onToggleGitLog}
            >
              <GitGraph size={16} strokeWidth={1.75} />
            </button>
          </HeaderToolTooltip>
          {children}
        </div>
      </TooltipProvider>
    </header>
  );
}

function HeaderToolTooltip({
  children,
  label,
}: {
  children: React.ReactElement;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeQuickMenu() {
  const { setTheme, theme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const selectedTheme = isThemeMode(theme) ? theme : 'system';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              aria-label="切换主题"
              className={headerToolButtonClassName(open)}
              type="button"
            >
              <Palette size={16} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          切换主题
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={selectedTheme}
          onValueChange={(value) => {
            if (!isThemeMode(value)) {
              return;
            }

            setTheme(value);
            setOpen(false);
          }}
        >
          <ThemeQuickMenuItem icon={<Airplay size={14} />} label="跟随系统" value="system" />
          <ThemeQuickMenuItem icon={<Sun size={14} />} label="亮色" value="light" />
          <ThemeQuickMenuItem icon={<Moon size={14} />} label="暗色" value="dark" />
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeQuickMenuItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: ThemeMode;
}) {
  return (
    <DropdownMenuRadioItem value={value}>
      {icon}
      <span>{label}</span>
    </DropdownMenuRadioItem>
  );
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

function buildFontStack(primaryFont: string, fallbackStack: string) {
  const sanitizedFont = primaryFont.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const font = sanitizedFont || 'inherit';

  return `${quoteCssFontFamily(font)}, ${fallbackStack}`;
}

function quoteCssFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function headerToolButtonClassName(active: boolean) {
  return cn(
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
    active && 'bg-accent text-foreground',
  );
}

export function DocumentEditorSurface({
  activeDocumentPath,
  activeEditorRef,
  currentDocumentPath,
  documentEditorLayout,
  documentLoadError,
  documentLoadState,
  documentVersion,
  draftMarkdown,
  editorSessions,
  pageWidthMode,
  warmDocumentPaths,
  workspaceRootPath,
  getDocumentReadOnly,
  onMarkdownChange,
  onRetryDocument,
  onSaveRequested,
  onSelectTab,
}: {
  activeDocumentPath: string | null;
  activeEditorRef: React.RefObject<MarkdownEditorHandle | null>;
  currentDocumentPath: string | null;
  documentEditorLayout: DocumentEditorLayout;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  documentVersion: number;
  draftMarkdown: string | null;
  editorSessions: Record<string, DocumentEditorSession>;
  pageWidthMode: PageWidthMode;
  warmDocumentPaths: readonly string[];
  workspaceRootPath: string | null;
  getDocumentReadOnly: (documentPath: string) => boolean;
  onMarkdownChange: (
    documentPath: string,
    markdown: string,
    origin?: MarkdownEditorChangeOrigin,
    reason?: MarkdownEditorFlushReason,
  ) => boolean | void | Promise<boolean | void>;
  onRetryDocument: () => void;
  onSaveRequested: () => void;
  onSelectTab: (tabPath: string) => void;
}) {
  const activeTab = getActiveTab(documentEditorLayout);
  const activeTabPath =
    activeTab?.kind === 'document' ? activeTab.absolutePath : null;
  const cachedSession = activeTabPath
    ? editorSessions[activeTabPath] ?? null
    : null;
  const liveSession =
    activeTabPath === currentDocumentPath && draftMarkdown !== null
      ? {
          documentVersion:
            cachedSession?.documentVersion ?? documentVersion,
          markdown: draftMarkdown,
        }
      : null;
  const editorSession = liveSession ?? cachedSession;
  const renderedDocumentPaths = updateDocumentEditorWarmPaths(
    warmDocumentPaths,
    documentEditorLayout,
  );

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="document-editor-surface"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {renderedDocumentPaths.map((documentPath) => {
          const isActive = activeTabPath === documentPath;
          const cachedDocumentSession =
            editorSessions[documentPath] ?? null;
          const liveDocumentSession =
            documentPath === currentDocumentPath && draftMarkdown !== null
              ? {
                  documentVersion:
                    cachedDocumentSession?.documentVersion ?? documentVersion,
                  markdown: draftMarkdown,
                }
              : null;
          const documentSession =
            liveDocumentSession ?? cachedDocumentSession;

          if (!documentSession) {
            return null;
          }

          return (
            <div
              aria-hidden={!isActive}
              className={cn(
                'absolute inset-0 min-h-0',
                isActive
                  ? 'visible z-10'
                  : 'invisible z-0 pointer-events-none',
              )}
              data-active={isActive ? 'true' : 'false'}
              data-document-editor-path={documentPath}
              key={documentPath}
            >
              <DocumentEditorInstance
                activeEditorRef={isActive ? activeEditorRef : undefined}
                documentPath={documentPath}
                editorSession={documentSession}
                pageWidthMode={pageWidthMode}
                readOnly={getDocumentReadOnly(documentPath)}
                workspaceRootPath={workspaceRootPath}
                onMarkdownChange={onMarkdownChange}
                onSaveRequested={onSaveRequested}
              />
            </div>
          );
        })}
        {renderDocumentEditorContent({
          activeDocumentPath,
          activeTab,
          currentDocumentPath,
          documentLoadError,
          documentLoadState,
          editorSession,
          pageWidthMode,
          workspaceRootPath,
          onRetryDocument,
          onSelectTab,
        })}
      </div>
    </div>
  );
}

function renderDocumentEditorContent({
  activeDocumentPath,
  activeTab,
  currentDocumentPath,
  documentLoadError,
  documentLoadState,
  editorSession,
  pageWidthMode,
  workspaceRootPath,
  onRetryDocument,
  onSelectTab,
}: {
  activeDocumentPath: string | null;
  activeTab: ReturnType<typeof getActiveTab>;
  currentDocumentPath: string | null;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  editorSession: DocumentEditorSession | null;
  pageWidthMode: PageWidthMode;
  workspaceRootPath: string | null;
  onRetryDocument: () => void;
  onSelectTab: (tabPath: string) => void;
}) {
  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        没有打开的标签页
      </div>
    );
  }

  if (activeTab.kind === 'plan') {
    return (
      <div className="relative h-full min-h-0" data-testid="plan-preview-editor">
        <MarkdownEditor
          documentKey={activeTab.id}
          markdown={activeTab.markdown}
          pageWidthMode={pageWidthMode}
          readOnly
          workspaceRootPath={workspaceRootPath}
        />
      </div>
    );
  }

  if (
    activeTab.absolutePath === activeDocumentPath &&
    activeTab.absolutePath === currentDocumentPath &&
    documentLoadState === 'loading' &&
    !editorSession
  ) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在打开文档...
      </div>
    );
  }

  if (
    activeTab.absolutePath === activeDocumentPath &&
    activeTab.absolutePath === currentDocumentPath &&
    documentLoadState === 'error' &&
    !editorSession
  ) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">无法打开文档</h1>
          <p className="text-sm text-muted-foreground">
            {documentLoadError ?? '无法读取文档内容'}
          </p>
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            type="button"
            onClick={onRetryDocument}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!editorSession) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <button
          className="max-w-xs truncate rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          type="button"
          onClick={() => onSelectTab(activeTab.absolutePath)}
        >
          打开 {activeTab.title}
        </button>
      </div>
    );
  }

  return null;
}

function DocumentEditorInstance({
  activeEditorRef,
  documentPath,
  editorSession,
  pageWidthMode,
  readOnly,
  workspaceRootPath,
  onMarkdownChange,
  onSaveRequested,
}: {
  activeEditorRef?: React.RefObject<MarkdownEditorHandle | null>;
  documentPath: string;
  editorSession: DocumentEditorSession;
  pageWidthMode: PageWidthMode;
  readOnly: boolean;
  workspaceRootPath: string | null;
  onMarkdownChange: (
    documentPath: string,
    markdown: string,
    origin?: MarkdownEditorChangeOrigin,
    reason?: MarkdownEditorFlushReason,
  ) => boolean | void | Promise<boolean | void>;
  onSaveRequested: () => void;
}) {
  const handleMarkdownChange = React.useCallback(
    (
      markdown: string,
      origin?: MarkdownEditorChangeOrigin,
      reason?: MarkdownEditorFlushReason,
    ) => onMarkdownChange(documentPath, markdown, origin, reason),
    [documentPath, onMarkdownChange],
  );
  return (
    <div className="relative h-full min-h-0">
      <MarkdownEditor
        documentKey={`${documentPath}:${editorSession.documentVersion}:${pageWidthMode}:${readOnly ? 'view' : 'live'}`}
        markdown={editorSession.markdown}
        pageWidthMode={pageWidthMode}
        readOnly={readOnly}
        ref={activeEditorRef}
        workspaceRootPath={workspaceRootPath}
        onMarkdownChange={handleMarkdownChange}
        onSaveRequested={onSaveRequested}
      />
    </div>
  );
}

function WorkspaceHorizontalResizeHandle({
  'aria-label': ariaLabel,
  max,
  min,
  value,
  onResize,
}: {
  'aria-label': string;
  max: number;
  min: number;
  value: number;
  onResize: (height: number) => void;
}) {
  const dragStateRef = React.useRef<{
    startHeight: number;
    startPointerY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;

      if (!dragState) {
        return;
      }

      onResize(
        clampPanelWidth(
          dragState.startHeight + dragState.startPointerY - event.clientY,
          min,
          max,
        ),
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, max, min, onResize]);

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center outline-none"
      data-dragging={isDragging ? 'true' : 'false'}
      role="separator"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        dragStateRef.current = {
          startHeight: value,
          startPointerY: event.clientY,
        };
        setIsDragging(true);
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-px w-12 rounded-full bg-border/0 transition-[background-color,height] duration-150',
          'group-hover:h-0.5 group-hover:bg-[#3574f0]/60',
          'group-focus-visible:h-0.5 group-focus-visible:bg-[#3574f0]/70',
          isDragging && 'h-0.5 bg-[#3574f0]/80',
        )}
      />
    </div>
  );
}

function useStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => subscribeStoredPanelWidth(key, onStoreChange),
    [key],
  );
  const getSnapshot = React.useCallback(
    () => readStoredPanelWidth(key, fallback, min, max),
    [fallback, key, max, min],
  );
  const getServerSnapshot = React.useCallback(() => fallback, [fallback]);
  const width = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setWidth = React.useCallback(
    (nextWidth: number) => {
      const clampedWidth = clampPanelWidth(nextWidth, min, max);

      writeStoredPanelWidth(key, clampedWidth);
      emitStoredPanelWidthChange(key);
    },
    [key, max, min],
  );

  return [width, setWidth] as const;
}

function subscribeStoredPanelWidth(
  key: string,
  onStoreChange: () => void,
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const eventName = getStoredPanelWidthEventName(key);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) {
      onStoreChange();
    }
  };

  window.addEventListener(eventName, onStoreChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(eventName, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function readWorkspaceSearchDocuments(
  snapshot: WorkspaceSnapshot,
): Promise<WorkspaceSearchDocument[]> {
  const documents = flattenDocuments(snapshot.nodes);
  const results: WorkspaceSearchDocument[] = [];
  let cursor = 0;

  async function readNextDocument() {
    while (cursor < documents.length) {
      const index = cursor;
      cursor += 1;
      const document = documents[index];

      try {
        const content = await readMarkdownDocument(
          snapshot.rootPath,
          document.absolutePath,
        );

        results[index] = {
          ...document,
          content: content.content,
          kind: 'document',
        };
      } catch {
        results[index] = {
          ...document,
          content: '',
          kind: 'document',
        };
      }
    }
  }

  await Promise.all(
    Array.from({
      length: Math.min(GLOBAL_SEARCH_READ_CONCURRENCY, documents.length),
    }).map(() => readNextDocument()),
  );

  let drawingDocuments: WorkspaceSearchDocument[] = [];
  try {
    const drawingLibrary = await loadDrawingLibrary(snapshot.rootPath);
    drawingDocuments = drawingLibrary.drawings.map((drawing) => ({
      absolutePath: '',
      content: drawing.searchText,
      drawingId: drawing.id,
      id: drawing.id,
      kind: 'drawing',
      name: drawing.title,
      relativePath: drawing.albumPath || '未归类',
      title: drawing.title,
    }));
  } catch {
    // A drawing index failure must not prevent Markdown search.
  }

  return [...results.filter(Boolean), ...drawingDocuments];
}

function findWorkspaceDocumentByPath(
  nodes: WorkspaceNode[],
  absolutePath: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.absolutePath === absolutePath && node.kind === 'document') {
      return node;
    }

    if (node.kind === 'directory') {
      const child = findWorkspaceDocumentByPath(
        node.children ?? [],
        absolutePath,
      );

      if (child) {
        return child;
      }
    }
  }

  return null;
}

function flattenWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenWorkspaceNodes(node.children ?? []),
  ]);
}

function filterRegularWorkspaceNodes(nodes: WorkspaceNode[]) {
  return nodes.filter((node) => !isDailyRootDirectory(node));
}

function isDailyRootDirectory(node: WorkspaceNode) {
  return (
    node.kind === 'directory' &&
    node.name === 'Daily' &&
    node.relativePath === 'Daily'
  );
}

function readStoredPanelWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const parsed = Number(window.localStorage.getItem(key));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampPanelWidth(parsed, min, max);
}

function writeStoredPanelWidth(key: string, value: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, String(value));
}

function emitStoredPanelWidthChange(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(getStoredPanelWidthEventName(key)));
}

function getStoredPanelWidthEventName(key: string) {
  return `madora:panel-width:${key}`;
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withDefaultWorkspaceGitSyncSettings(
  settings?: Partial<WorkspaceGitSyncSettings> | null,
): WorkspaceGitSyncSettings {
  const interval =
    settings?.intervalMinutes ??
    DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS.intervalMinutes;
  const conflictResolution =
    settings?.conflictResolution ??
    DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS.conflictResolution;

  return {
    conflictResolution: isWorkspaceGitSyncConflictResolution(
      conflictResolution,
    )
      ? conflictResolution
      : DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS.conflictResolution,
    enabled: settings?.enabled ?? DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS.enabled,
    intervalMinutes: [1, 2, 3, 5, 10, 15, 30, 60].includes(interval)
      ? interval
      : DEFAULT_WORKSPACE_GIT_SYNC_SETTINGS.intervalMinutes,
    lastSyncedAt: settings?.lastSyncedAt ?? null,
  };
}

function isWorkspaceGitSyncConflictResolution(
  value: string,
): value is GitSyncConflictResolution {
  return value === 'abort' || value === 'local' || value === 'remote';
}

function ExternalDocumentConflictBanner({
  onKeepLocal,
  onLoadExternal,
}: {
  onKeepLocal: () => void;
  onLoadExternal: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-amber-500/30 bg-amber-500/8 px-4 py-2 text-xs">
      <AlertTriangle className="shrink-0 text-amber-600" size={15} />
      <span className="min-w-0 flex-1 text-foreground/80">
        当前草稿与 Codex 写入的磁盘版本发生冲突，Madora 已暂停自动保存。
      </span>
      <button
        className="shrink-0 rounded-md px-2 py-1 text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        type="button"
        onClick={onLoadExternal}
      >
        加载 AI 版本
      </button>
      <button
        className="shrink-0 rounded-md border border-amber-500/35 bg-background px-2 py-1 font-medium outline-none hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring/30"
        type="button"
        onClick={onKeepLocal}
      >
        用我的版本覆盖
      </button>
    </div>
  );
}

function WorkspaceStatusBar({
  characterCount,
  lineCount,
  saveError,
  saveState,
  visible,
}: {
  characterCount: number;
  lineCount: number;
  saveError: string | null;
  saveState: DocumentSaveState;
  visible: boolean;
}) {
  return (
    <div
      className="flex h-7 shrink-0 items-center justify-end gap-4 px-4 text-[12px] text-muted-foreground"
      data-testid="workspace-status-bar"
    >
      {visible ? (
        <>
          <span className="flex items-center gap-1">
            <Check
              className={cn(
                'size-3',
                saveState === 'error'
                  ? 'text-destructive'
                  : saveState === 'dirty'
                    ? 'text-amber-600'
                    : 'text-emerald-600',
              )}
              strokeWidth={2}
            />
            {saveState === 'dirty' ? '有未保存更改' : null}
            {saveState === 'saving' ? '保存中...' : null}
            {saveState === 'saved' ? '已保存' : null}
            {saveState === 'error' ? (
              <span className="text-destructive">
                {saveError ?? '保存失败'}
              </span>
            ) : null}
          </span>
          <span>词数 {characterCount}</span>
          <span>行数 {lineCount}</span>
          <span>字符 {characterCount}</span>
          <span>UTF-8 · Markdown</span>
        </>
      ) : null}
    </div>
  );
}

import type {
  AppUpdateCheckResult,
  AppUpdateDownloadEvent,
  CreatedMarkdownDocument,
  AppSettings,
  DailyNoteDocument,
  DailyNoteMonth,
  DeletedWorkspaceNode,
  DocumentExportFile,
  DocumentExportResult,
  DocumentExportRuntimeInfo,
  DocumentImportGrant,
  DocumentImportManifest,
  DrawingDocumentDescriptor,
  DrawingExportGrant,
  DrawingImportGrant,
  DrawingLibrarySnapshot,
  DrawingRawSession,
  DrawingSaveManifest,
  DrawingSaveSession,
  DrawingTrashedAlbumSummary,
  DrawingUiState,
  DocumentContentMeta,
  ExportDirectoryGrant,
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
  GitDiff,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  GitSyncResult,
  GitStatus,
  LinkPreviewMetadata,
  MarkdownDocumentContent,
  ImportCommitSession,
  ImportedDocumentResult,
  ImportedTreeIconAsset,
  InboxCapture,
  InboxCaptureListResult,
  InboxCaptureListView,
  InboxCaptureSource,
  InboxCaptureUpdate,
  InboxDailyAppendResult,
  InboxPromotionResult,
  ResolvedWorkspaceAsset,
  TerminalDataEvent,
  TerminalErrorEvent,
  TerminalExitEvent,
  TerminalSessionInfo,
  UploadedWorkspaceAsset,
  UploadWorkspaceAssetInput,
  WorkspaceAssetData,
  WorkspaceAssetBatchResolution,
  WorkspaceExportFormat,
  WorkspaceImportFormat,
  WorkspaceGitSyncSettings,
  WorkspaceGraphSnapshot,
  WorkspaceMoveRequest,
  WorkspaceHistoryItem,
  WorkspaceMetadata,
  WorkspaceNode,
  WorkspaceSnapshot,
  TreeNodeAppearance,
  SystemFontOptions,
} from './workspace-types';
import { getParentPath } from './workspace-paths';

import type { UnlistenFn } from '@tauri-apps/api/event';

const RECENT_WORKSPACE_KEY = 'madora:recent-workspace-path';
const WORKSPACE_HISTORY_KEY = 'madora:workspace-history';
const MAX_WORKSPACE_HISTORY = 8;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface MacosTitlebarMetrics {
  trafficLightCenterY: number;
}

export async function getMacosTitlebarMetrics() {
  if (!isTauriRuntime()) {
    return null;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MacosTitlebarMetrics | null>('get_macos_titlebar_metrics');
}

export async function getMadoraVersion() {
  if (!isTauriRuntime()) {
    return null;
  }

  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function checkAppUpdate() {
  if (!isTauriRuntime()) {
    throw new Error('当前环境不支持应用更新。');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<AppUpdateCheckResult>('app_update_check');
}

export async function installAppUpdate(
  onEvent: (event: AppUpdateDownloadEvent) => void,
) {
  if (!isTauriRuntime()) {
    throw new Error('当前环境不支持应用更新。');
  }

  const { Channel, invoke } = await import('@tauri-apps/api/core');
  const channel = new Channel<AppUpdateDownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<void>('app_update_install', { onEvent: channel });
}

export async function restartAppAfterUpdate() {
  if (!isTauriRuntime()) {
    throw new Error('当前环境不支持应用更新。');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('app_update_restart');
}

export function getRecentWorkspacePath() {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    getWorkspaceHistory()[0]?.rootPath ??
    window.localStorage.getItem(RECENT_WORKSPACE_KEY)
  );
}

export function saveRecentWorkspacePath(rootPath: string) {
  window.localStorage.setItem(RECENT_WORKSPACE_KEY, rootPath);
}

export function getWorkspaceHistory(): WorkspaceHistoryItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawHistory = window.localStorage.getItem(WORKSPACE_HISTORY_KEY);

  if (!rawHistory) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawHistory);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isWorkspaceHistoryItem);
  } catch {
    return [];
  }
}

export function recordWorkspaceHistory(snapshot: WorkspaceSnapshot) {
  const nextItem: WorkspaceHistoryItem = {
    rootName: snapshot.rootName,
    rootPath: snapshot.rootPath,
    lastOpenedAt: Date.now(),
  };
  const nextHistory = [
    nextItem,
    ...getWorkspaceHistory().filter(
      (item) => item.rootPath !== snapshot.rootPath,
    ),
  ].slice(0, MAX_WORKSPACE_HISTORY);

  saveWorkspaceHistory(nextHistory);
  saveRecentWorkspacePath(snapshot.rootPath);

  return nextHistory;
}

export function removeWorkspaceHistory(rootPath: string) {
  const nextHistory = getWorkspaceHistory().filter(
    (item) => item.rootPath !== rootPath,
  );

  saveWorkspaceHistory(nextHistory);

  if (nextHistory.length > 0) {
    saveRecentWorkspacePath(nextHistory[0].rootPath);
  } else {
    window.localStorage.removeItem(RECENT_WORKSPACE_KEY);
  }

  return nextHistory;
}

function saveWorkspaceHistory(history: WorkspaceHistoryItem[]) {
  window.localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(history));
}

function isWorkspaceHistoryItem(value: unknown): value is WorkspaceHistoryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<WorkspaceHistoryItem>;

  return (
    typeof item.rootName === 'string' &&
    typeof item.rootPath === 'string' &&
    typeof item.lastOpenedAt === 'number'
  );
}

export async function selectWorkspaceRoot() {
  if (!isTauriRuntime()) {
    return null;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const selected = await invoke<string | null>('select_workspace_directory');

  if (typeof selected === 'string' && selected.length > 0) {
    return selected;
  }

  return null;
}

export async function selectWorkspaceParentDirectory() {
  return selectWorkspaceRoot();
}

export async function loadWorkspaceTree(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('load_workspace_tree', { rootPath });
}

export async function loadWorkspaceGraph(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceGraphSnapshot>('load_workspace_graph', { rootPath });
}

export async function listSystemFonts() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<SystemFontOptions>('list_system_fonts');
}

export async function resolveLinkPreview(title: string, url: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<LinkPreviewMetadata>('resolve_link_preview', { title, url });
}

export async function createWorkspaceRoot(
  parentPath: string,
  workspaceName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('create_workspace_root', {
    parentPath,
    workspaceName,
  });
}

export async function ensureWorkspace(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceMetadata>('ensure_workspace', { rootPath });
}

export async function recordRecentDocument(
  rootPath: string,
  documentPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string[]>('record_recent_document', {
    rootPath,
    documentPath,
  });
}

export async function setWorkspaceNodeState(
  rootPath: string,
  nodePath: string,
  state: { locked?: boolean; pinned?: boolean },
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('set_workspace_node_state', {
    rootPath,
    nodePath,
    locked: state.locked ?? null,
    pinned: state.pinned ?? null,
  });
}

export async function openDailyNote(rootPath: string, date: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DailyNoteDocument>('open_daily_note', { rootPath, date });
}

export async function listDailyNotesForMonth(rootPath: string, month: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DailyNoteMonth>('list_daily_notes_for_month', {
    rootPath,
    month,
  });
}

export async function listInboxCaptures(
  rootPath: string,
  view: InboxCaptureListView,
  query = '',
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxCaptureListResult>('list_inbox_captures', {
    rootPath,
    view,
    query,
  });
}

export async function readInboxCapture(rootPath: string, captureId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxCapture>('read_inbox_capture', { rootPath, captureId });
}

export async function loadDrawingLibrary(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingLibrarySnapshot>('load_drawing_library', { rootPath });
}

export async function readDrawingMeta(rootPath: string, drawingId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('read_drawing_meta', {
    rootPath,
    drawingId,
  });
}

export async function readDrawingScene(
  rootPath: string,
  drawingId: string,
  backup = false,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>('read_drawing_scene', {
    rootPath,
    drawingId,
    backup,
  });

  return toUint8Array(result);
}

export async function readDrawingPreview(
  rootPath: string,
  drawingId: string,
  trashed = false,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>('read_drawing_preview', {
    rootPath,
    drawingId,
    trashed,
  });

  return toUint8Array(result);
}

export async function readDrawingLibrary(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>('read_drawing_library', {
    rootPath,
  });

  return toUint8Array(result);
}

export async function readDrawingUiState(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingUiState>('read_drawing_ui_state', { rootPath });
}

export async function writeDrawingUiState(
  rootPath: string,
  uiState: DrawingUiState,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingUiState>('write_drawing_ui_state', {
    rootPath,
    uiState,
  });
}

export async function createDrawing(
  rootPath: string,
  albumPath: string,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('create_drawing', {
    rootPath,
    albumPath,
    title,
  });
}

export async function beginDrawingSave(
  rootPath: string,
  drawingId: string,
  expectedRevision: number,
  manifest: DrawingSaveManifest,
  force = false,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingSaveSession>('begin_drawing_save', {
    rootPath,
    drawingId,
    expectedRevision,
    manifest,
    force,
  });
}

export async function beginGeneratedDrawingCreate(
  rootPath: string,
  albumPath: string,
  manifest: DrawingSaveManifest,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingRawSession>('begin_generated_drawing_create', {
    rootPath,
    albumPath,
    manifest,
  });
}

export async function stageDrawingScene(
  sessionId: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stage_drawing_scene', bytes, {
    headers: { 'x-madora-drawing-session': sessionId },
  });
}

export async function stageDrawingPreview(
  sessionId: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stage_drawing_preview', bytes, {
    headers: { 'x-madora-drawing-session': sessionId },
  });
}

export async function commitDrawingSave(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('commit_drawing_save', {
    sessionId,
  });
}

export async function cancelDrawingSave(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('cancel_drawing_save', { sessionId });
}

export async function commitGeneratedDrawingCreate(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>(
    'commit_generated_drawing_create',
    { sessionId },
  );
}

export async function cancelGeneratedDrawingCreate(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('cancel_generated_drawing_create', { sessionId });
}

export async function renameDrawing(
  rootPath: string,
  drawingId: string,
  expectedRevision: number,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('rename_drawing', {
    rootPath,
    drawingId,
    expectedRevision,
    title,
  });
}

export async function moveDrawing(
  rootPath: string,
  drawingId: string,
  albumPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('move_drawing', {
    rootPath,
    drawingId,
    albumPath,
  });
}

export async function duplicateDrawing(
  rootPath: string,
  drawingId: string,
  albumPath?: string | null,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('duplicate_drawing', {
    rootPath,
    drawingId,
    albumPath: albumPath ?? null,
  });
}

export async function trashDrawing(rootPath: string, drawingId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('trash_drawing', { rootPath, drawingId });
}

export async function restoreDrawing(
  rootPath: string,
  drawingId: string,
  albumPath?: string | null,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('restore_drawing', {
    rootPath,
    drawingId,
    albumPath: albumPath ?? null,
  });
}

export async function permanentlyDeleteDrawing(
  rootPath: string,
  drawingId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('permanently_delete_drawing', { rootPath, drawingId });
}

export async function createDrawingAlbum(rootPath: string, albumPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('create_drawing_album', { rootPath, albumPath });
}

export async function renameDrawingAlbum(
  rootPath: string,
  albumPath: string,
  newName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('rename_drawing_album', {
    rootPath,
    albumPath,
    newName,
  });
}

export async function moveDrawingAlbum(
  rootPath: string,
  albumPath: string,
  parentAlbumPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('move_drawing_album', {
    rootPath,
    albumPath,
    parentAlbumPath,
  });
}

export async function deleteDrawingAlbum(rootPath: string, albumPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_drawing_album', { rootPath, albumPath });
}

export async function duplicateDrawingAlbum(
  rootPath: string,
  albumPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('duplicate_drawing_album', { rootPath, albumPath });
}

export async function trashDrawingAlbum(rootPath: string, albumPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingTrashedAlbumSummary>('trash_drawing_album', {
    rootPath,
    albumPath,
  });
}

export async function restoreDrawingAlbum(rootPath: string, trashId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('restore_drawing_album', { rootPath, trashId });
}

export async function permanentlyDeleteDrawingAlbum(
  rootPath: string,
  trashId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('permanently_delete_drawing_album', {
    rootPath,
    trashId,
  });
}

export async function writeDrawingLibrary(
  rootPath: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const session = await invoke<Pick<DrawingSaveSession, 'sessionId'>>(
    'begin_drawing_library_write',
    { rootPath },
  );

  return invoke<void>('write_drawing_library', bytes, {
    headers: { 'x-madora-drawing-session': session.sessionId },
  });
}

export async function selectDrawingImportSources() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingImportGrant | null>('select_drawing_import_sources');
}

export async function readDrawingImportSource(
  grantId: string,
  sourceId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>(
    'read_drawing_import_source',
    { grantId, sourceId },
  );

  return toUint8Array(result);
}

export async function importDrawingFromGrant(
  rootPath: string,
  albumPath: string,
  grantId: string,
  sourceId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingDocumentDescriptor>('import_drawing_from_grant', {
    rootPath,
    albumPath,
    grantId,
    sourceId,
  });
}

export async function importDrawingLibraryFromGrant(
  rootPath: string,
  grantId: string,
  sourceId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('import_drawing_library_from_grant', {
    rootPath,
    grantId,
    sourceId,
  });
}

export async function releaseDrawingImportGrant(grantId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('release_drawing_import_grant', { grantId });
}

export async function selectDrawingExportTarget(
  fileName: string,
  format: 'excalidraw' | 'excalidrawlib' | 'png' | 'svg',
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DrawingExportGrant | null>('select_drawing_export_target', {
    fileName,
    format,
  });
}

export async function writeDrawingExport(
  grantId: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('write_drawing_export', bytes, {
    headers: { 'x-madora-drawing-export': grantId },
  });
}

export async function createDrawingMarkdownSnapshot(
  rootPath: string,
  drawingId: string,
  title: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const session = await invoke<Pick<DrawingSaveSession, 'sessionId'>>(
    'begin_drawing_markdown_snapshot',
    { rootPath, drawingId, title },
  );

  return invoke<UploadedWorkspaceAsset>(
    'create_drawing_markdown_snapshot',
    bytes,
    { headers: { 'x-madora-drawing-session': session.sessionId } },
  );
}

export async function createInboxCapture(
  rootPath: string,
  body: string,
  tags: string[],
  source: InboxCaptureSource,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxCapture>('create_inbox_capture', {
    rootPath,
    body,
    tags,
    source,
  });
}

export async function updateInboxCapture(
  rootPath: string,
  captureId: string,
  update: InboxCaptureUpdate,
  expectedModifiedAt: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxCapture>('update_inbox_capture', {
    rootPath,
    captureId,
    update,
    expectedModifiedAt,
  });
}

export async function deleteInboxCapture(
  rootPath: string,
  captureId: string,
  expectedModifiedAt: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('delete_inbox_capture', {
    rootPath,
    captureId,
    expectedModifiedAt,
  });
}

export async function promoteInboxCapture(
  rootPath: string,
  captureId: string,
  targetDir: string,
  title: string,
  expectedModifiedAt: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxPromotionResult>('promote_inbox_capture', {
    rootPath,
    captureId,
    targetDir,
    title,
    expectedModifiedAt,
  });
}

export async function appendInboxCaptureToDaily(
  rootPath: string,
  captureId: string,
  date: string,
  localTime: string,
  expectedModifiedAt: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<InboxDailyAppendResult>('append_inbox_capture_to_daily', {
    rootPath,
    captureId,
    date,
    localTime,
    expectedModifiedAt,
  });
}

export async function readMarkdownDocument(
  rootPath: string,
  documentPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<MarkdownDocumentContent>('read_markdown_document', {
    rootPath,
    documentPath,
  });
}

export async function saveMarkdownDocument(
  rootPath: string,
  documentPath: string,
  content: string,
  expectedModifiedAt: number | null,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentContentMeta>('save_markdown_document', {
    rootPath,
    documentPath,
    content,
    expectedModifiedAt,
  });
}

export async function createMarkdownDocument(
  rootPath: string,
  parentPath: string,
  title: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CreatedMarkdownDocument>('create_markdown_document', {
    rootPath,
    parentPath,
    title,
  });
}

export async function createWorkspaceDirectory(
  rootPath: string,
  parentPath: string,
  name: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceNode>('create_workspace_directory', {
    rootPath,
    parentPath,
    name,
  });
}

export async function renameWorkspaceNode(
  rootPath: string,
  nodePath: string,
  newName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceNode>('rename_workspace_node', {
    rootPath,
    nodePath,
    newName,
  });
}

export async function setTreeNodeAppearance(
  rootPath: string,
  nodePath: string,
  appearance: TreeNodeAppearance | null,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('set_tree_node_appearance', {
    rootPath,
    nodePath,
    appearance,
  });
}

export async function deleteWorkspaceNode(rootPath: string, nodePath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DeletedWorkspaceNode>('delete_workspace_node', {
    rootPath,
    nodePath,
  });
}

export async function moveWorkspaceNode(
  rootPath: string,
  request: WorkspaceMoveRequest,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('move_workspace_node', {
    rootPath,
    nodePath: request.nodePath,
    targetParentPath:
      request.position === 'inside'
        ? request.targetPath
        : getParentPath(request.targetPath),
    beforePath: request.position === 'before' ? request.targetPath : null,
    afterPath: request.position === 'after' ? request.targetPath : null,
  });
}

export async function selectDocumentImportSources(
  format: WorkspaceImportFormat,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentImportGrant | null>('select_document_import_sources', {
    format,
  });
}

export async function readDocumentImportSource(
  grantId: string,
  sourceId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>(
    'read_document_import_source',
    { grantId, sourceId },
  );

  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function beginDocumentImportCommit(
  rootPath: string,
  targetDir: string,
  manifest: DocumentImportManifest,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ImportCommitSession>('begin_document_import_commit', {
    rootPath,
    targetDir,
    manifest,
  });
}

export async function stageDocumentImportAsset(
  sessionId: string,
  assetToken: string,
  bytes: Uint8Array,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stage_document_import_asset', bytes, {
    headers: {
      'x-madora-import-asset': assetToken,
      'x-madora-import-session': sessionId,
    },
  });
}

export async function stageDocumentImportSourceAsset(
  sessionId: string,
  assetToken: string,
  grantId: string,
  sourceId: string,
  reference: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stage_document_import_source_asset', {
    sessionId,
    assetToken,
    grantId,
    sourceId,
    reference,
  });
}

export async function commitDocumentImport(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ImportedDocumentResult>('commit_document_import', {
    sessionId,
  });
}

export async function cancelDocumentImport(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('cancel_document_import', { sessionId });
}

export async function releaseDocumentImportGrant(grantId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('release_document_import_grant', { grantId });
}

export async function writeExportFile(targetPath: string, base64Data: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('write_export_file', {
    targetPath,
    base64Data,
  });
}

export async function openPathInFileManager(path: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');

  await revealItemInDir(path);
}

export async function selectDocumentExportDirectory() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ExportDirectoryGrant | null>(
    'select_document_export_directory',
  );
}

export async function getDocumentExportRuntimeInfo() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentExportRuntimeInfo>('document_export_runtime_info');
}

export async function convertDocumentExport(
  grantId: string,
  format: Extract<WorkspaceExportFormat, 'pdf' | 'word'>,
  fileStem: string,
  markdown: string,
  files: DocumentExportFile[],
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentExportResult>('convert_document_export', {
    grantId,
    format,
    fileStem,
    markdown,
    files,
  });
}

export async function writeDocumentExportBundle(
  grantId: string,
  format: Exclude<WorkspaceExportFormat, 'pdf'>,
  fileStem: string,
  files: DocumentExportFile[],
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentExportResult>('write_document_export_bundle', {
    grantId,
    format,
    fileStem,
    files,
  });
}

export async function printDocumentPdf(
  grantId: string,
  fileStem: string,
  html: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DocumentExportResult>('print_document_pdf', {
    grantId,
    fileStem,
    html,
  });
}

export async function openUrlInDefaultBrowser(url: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const { openUrl } = await import('@tauri-apps/plugin-opener');

  await openUrl(url);
}

export async function openPathInPreferredEditor(
  path: string,
  app: string,
) {
  if (!isTauriRuntime()) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');

  await invoke<void>('open_path_in_preferred_editor', { app, path });
}

export async function readAppSettings() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AppSettings>('read_app_settings');
}

export async function saveAppSettings(settings: AppSettings) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AppSettings>('save_app_settings', { settings });
}

export async function setAppWindowOpacity(opacity: number) {
  if (!isTauriRuntime()) return;

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('set_app_window_opacity', { opacity });
}

export async function saveWorkspaceGitSyncSettings(
  rootPath: string,
  settings: WorkspaceGitSyncSettings,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceGitSyncSettings>('save_workspace_git_sync_settings', {
    rootPath,
    settings,
  });
}

export async function uploadWorkspaceAsset(
  rootPath: string,
  input: UploadWorkspaceAssetInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<UploadedWorkspaceAsset>('upload_workspace_asset', {
    rootPath,
    input,
  });
}

export async function resolveWorkspaceAsset(rootPath: string, assetId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ResolvedWorkspaceAsset>('resolve_workspace_asset', {
    rootPath,
    assetId,
  });
}

export async function resolveWorkspaceAssets(
  rootPath: string,
  assetIds: string[],
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceAssetBatchResolution>('resolve_workspace_assets', {
    rootPath,
    assetIds,
  });
}

export async function readWorkspaceAssetData(rootPath: string, assetId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceAssetData>('read_workspace_asset_data', {
    rootPath,
    assetId,
  });
}

export async function selectTreeIconAsset(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<ImportedTreeIconAsset | null>('select_tree_icon_asset', {
    rootPath,
  });
}

export async function discardUnreferencedTreeIconAsset(
  rootPath: string,
  assetId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('discard_unreferenced_tree_icon_asset', {
    rootPath,
    assetId,
  });
}

export async function gitProbe(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitProbe>('git_probe', { rootPath });
}

export async function gitInit(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitProbe>('git_init', { rootPath });
}

export async function gitStatus(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_status', { rootPath });
}

export async function gitRemoteInfo(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitRemoteInfo>('git_remote_info', { rootPath });
}

export async function gitDiff(
  rootPath: string,
  path: string,
  staged: boolean,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitDiff>('git_diff', { rootPath, path, staged });
}

export async function gitCommitFileDiff(
  rootPath: string,
  hash: string,
  path: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitDiff>('git_commit_file_diff', { rootPath, hash, path });
}

export async function gitBranches(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitBranchItem[]>('git_branches', { rootPath });
}

export async function gitLog(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitCommitEntry[]>('git_log', { rootPath });
}

export async function gitCommitFiles(rootPath: string, hash: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitCommitFile[]>('git_commit_files', { rootPath, hash });
}

export async function gitStage(rootPath: string, paths: string[]) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_stage', { rootPath, paths });
}

export async function gitUnstage(rootPath: string, paths: string[]) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_unstage', { rootPath, paths });
}

export async function gitCommit(
  rootPath: string,
  message: string,
  paths: string[],
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_commit', { rootPath, message, paths });
}

export async function gitPush(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_push', { rootPath });
}

export async function gitSyncNow(
  rootPath: string,
  conflictResolution: GitSyncConflictResolution,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitSyncResult>('git_sync_now', {
    rootPath,
    conflictResolution,
  });
}

export async function gitRevertFile(rootPath: string, path: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_revert_file', { rootPath, path });
}

export async function gitDeleteFile(rootPath: string, path: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<GitStatus>('git_delete_file', { rootPath, path });
}

export async function terminalSpawn(
  rootPath: string,
  cols: number,
  rows: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<TerminalSessionInfo>('terminal_spawn', {
    rootPath,
    cols,
    rows,
  });
}

export async function terminalWrite(sessionId: string, data: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_write', { sessionId, data });
}

export async function terminalResize(
  sessionId: string,
  cols: number,
  rows: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_resize', { sessionId, cols, rows });
}

export async function terminalKill(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('terminal_kill', { sessionId });
}

export async function listenTerminalData(
  handler: (event: TerminalDataEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalDataEvent>('terminal:data', (event) =>
    handler(event.payload),
  );
}

export async function listenTerminalExit(
  handler: (event: TerminalExitEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalExitEvent>('terminal:exit', (event) =>
    handler(event.payload),
  );
}

export async function listenTerminalError(
  handler: (event: TerminalErrorEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<TerminalErrorEvent>('terminal:error', (event) =>
    handler(event.payload),
  );
}

export async function selectWorkspaceAssetDownloadPath(
  defaultPath: string,
  mediaType: string,
) {
  if (!isTauriRuntime()) {
    return defaultPath;
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const extension = getDownloadFileExtension(defaultPath);

  return save({
    defaultPath,
    filters: extension
      ? [
          {
            extensions: [extension],
            name: getDownloadDialogFilterName(mediaType),
          },
        ]
      : undefined,
  });
}

function getDownloadFileExtension(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dotIndex = name.lastIndexOf('.');

  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

function getDownloadDialogFilterName(mediaType: string) {
  if (mediaType.startsWith('image/')) {
    return 'Image';
  }

  if (mediaType.startsWith('audio/')) {
    return 'Audio';
  }

  if (mediaType.startsWith('video/')) {
    return 'Video';
  }

  if (
    mediaType === 'application/zip' ||
    mediaType === 'application/x-zip-compressed'
  ) {
    return 'Archive';
  }

  return 'Resource';
}

function toUint8Array(value: ArrayBuffer | Uint8Array) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function setAppWindowTitle(title: string) {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().setTitle(title);
}

export async function minimizeAppWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().minimize();
}

export async function toggleMaximizeAppWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().toggleMaximize();
}

export async function closeAppWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  await getCurrentWindow().close();
}

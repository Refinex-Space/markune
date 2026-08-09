export type WorkspaceNodeKind = 'directory' | 'document';

export type WorkspaceExportFormat = 'html' | 'markdown' | 'pdf' | 'word';

export type WorkspaceImportFormat = 'html' | 'markdown' | 'pdf' | 'word';

export type DrawingCollection = 'all' | 'recent' | 'favorites' | 'trash';

export interface DrawingMeta {
  schemaVersion: 1;
  id: string;
  title: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  sceneSha256: string;
  elementCount: number;
  searchText: string;
  previewRevision: number | null;
}

export interface DrawingIssue {
  drawingId: string | null;
  albumPath: string;
  message: string;
}

export interface DrawingSummary extends DrawingMeta {
  albumPath: string;
  hasBackup: boolean;
  hasPreview: boolean;
  trashed: boolean;
  issue?: string | null;
}

export interface DrawingAlbumNode {
  name: string;
  path: string;
  children: DrawingAlbumNode[];
  drawings: DrawingSummary[];
}

export interface DrawingTrashedAlbumSummary {
  trashId: string;
  name: string;
  originalPath: string;
  trashedAt: string;
  drawingCount: number;
}

export interface DrawingLibrarySnapshot {
  albums: DrawingAlbumNode[];
  drawings: DrawingSummary[];
  trash: DrawingSummary[];
  trashAlbums: DrawingTrashedAlbumSummary[];
  issues: DrawingIssue[];
}

export interface DrawingViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export interface DrawingUiState {
  schemaVersion: 1;
  recentDrawingIds: string[];
  viewports: Record<string, DrawingViewport>;
}

export interface DrawingDocumentDescriptor {
  meta: DrawingMeta;
  albumPath: string;
  hasBackup: boolean;
  hasPreview: boolean;
}

export interface AiDrawingReference {
  albumPath: string;
  elementCount: number;
  hasPreview: boolean;
  id: string;
  revision: number;
  title: string;
}

export interface DrawingSaveSession {
  sessionId: string;
  nextRevision: number;
}

export interface DrawingRawSession {
  sessionId: string;
}

export type DrawingSaveState =
  | { status: 'saved'; revision: number }
  | { status: 'dirty'; revision: number }
  | { status: 'saving'; revision: number }
  | { status: 'conflict'; revision: number; message: string }
  | { status: 'error'; revision: number; message: string };

export interface DrawingSaveManifest {
  title: string;
  tags: string[];
  favorite: boolean;
  elementCount: number;
  searchText: string;
}

export interface DrawingImportSource {
  fileName: string;
  kind: 'drawing' | 'library';
  size: number;
  sourceId: string;
}

export interface DrawingImportGrant {
  grantId: string;
  sources: DrawingImportSource[];
}

export interface DrawingExportGrant {
  grantId: string;
  fileName: string;
}

export interface ExportDirectoryGrant {
  grantId: string;
  displayPath: string;
}

export interface DocumentExportFile {
  base64Data: string;
  relativePath: string;
  role: 'asset' | 'primary';
}

export interface DocumentExportResult {
  primaryPath: string;
  createdPaths: string[];
  warnings: string[];
}

export interface DocumentExportRuntimeInfo {
  engine: 'legacy' | 'pandoc';
  pandocVersion: string | null;
  professionalPdf: boolean;
  professionalWord: boolean;
  typstVersion: string | null;
}

export interface DocumentImportSource {
  fileName: string;
  format: WorkspaceImportFormat;
  size: number;
  sourceId: string;
}

export interface DocumentImportGrant {
  grantId: string;
  sources: DocumentImportSource[];
}

export interface DocumentImportAssetManifest {
  fileName: string;
  mediaType: string;
  size: number;
  token: string;
}

export interface DocumentImportManifest {
  assets: DocumentImportAssetManifest[];
  markdown: string;
  title: string;
}

export interface ImportCommitSession {
  sessionId: string;
}

export interface ImportedDocumentResult {
  node: WorkspaceNode;
  warnings: string[];
}

export type RightPanelMode = 'ai' | 'meta' | null;

export interface WorkspaceNode {
  id: string;
  name: string;
  kind: WorkspaceNodeKind;
  relativePath: string;
  absolutePath: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
  locked?: boolean;
  appearance?: TreeNodeAppearance;
  children?: WorkspaceNode[];
}

export type TreeNodeIcon =
  | { type: 'builtin'; name: string }
  | { type: 'emoji'; value: string }
  | { type: 'local'; assetId: string };

export type TreeNodeIconColor =
  | { type: 'preset'; value: TreeNodeIconColorPreset }
  | { type: 'custom'; value: string };

export type TreeNodeIconColorPreset =
  | 'slate'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'pink'
  | 'rose';

export interface TreeNodeAppearance {
  icon?: TreeNodeIcon;
  color?: TreeNodeIconColor;
}

export interface WorkspaceSnapshot {
  rootPath: string;
  rootName: string;
  nodes: WorkspaceNode[];
}

export type WorkspaceGraphNodeKind =
  | 'daily'
  | 'note'
  | 'property'
  | 'tag'
  | 'weekly';

export type WorkspaceGraphEdgeKind = 'link' | 'property' | 'tag';

export interface WorkspaceGraphNode {
  id: string;
  label: string;
  kind: WorkspaceGraphNodeKind;
  relativePath: string | null;
  degree: number;
}

export interface WorkspaceGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: WorkspaceGraphEdgeKind;
  weight: number;
}

export interface WorkspaceGraphSnapshot {
  nodes: WorkspaceGraphNode[];
  edges: WorkspaceGraphEdge[];
  documentCount: number;
  warnings: string[];
}

export interface WorkspaceHistoryItem {
  rootPath: string;
  rootName: string;
  lastOpenedAt: number;
}

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  title: string;
  relativePath: string;
  absolutePath: string;
}

export interface WorkspaceLoadError {
  message: string;
  recoverable: boolean;
}

export interface WorkspaceMetadata {
  schemaVersion: 1;
  recentDocumentPaths: string[];
  expandedPaths: string[];
  sortOrder: Record<string, unknown>;
  gitSync: WorkspaceGitSyncSettings;
  dailyNotes?: WorkspaceDailyNotes;
  nodeState?: Record<string, WorkspaceNodeState>;
}

export type GitSyncConflictResolution = 'abort' | 'local' | 'remote';

export interface WorkspaceGitSyncSettings {
  enabled: boolean;
  intervalMinutes: number;
  conflictResolution: GitSyncConflictResolution;
  lastSyncedAt: string | null;
}

export interface WorkspaceNodeState {
  pinned: boolean;
  locked: boolean;
  appearance?: TreeNodeAppearance;
}

export interface WorkspaceDailyNotes {
  selectedDate?: string | null;
  entries: Record<string, WorkspaceDailyNoteEntry>;
}

export interface WorkspaceDailyNoteEntry {
  documentPath: string;
  hasContent: boolean;
  updatedAt: number;
}

export type PageWidthMode = 'standard' | 'wide';

export type SystemNavLayout = 'vertical' | 'horizontal';

export type CalendarWeekStartsOn = 'monday' | 'sunday';

export interface CalendarSettings {
  expanded: boolean;
  weekStartsOn: CalendarWeekStartsOn;
}

export interface AppearanceFontSettings {
  code: string;
  document: string;
  ui: string;
}

export interface AppearanceSettings {
  fonts: AppearanceFontSettings;
  pageWidthMode: PageWidthMode;
  showGitLogEntry: boolean;
  showGitPanelEntry: boolean;
  systemNavCollapsed: boolean;
  systemNavLayout: SystemNavLayout;
  treeIconPicker: TreeIconPickerSettings;
  windowOpacity: number;
}

export type TreeIconPickerTab = 'builtin' | 'emoji' | 'local';

export interface TreeIconPickerSettings {
  lastTab: TreeIconPickerTab;
  recentIcons: TreeNodeIcon[];
}

export interface SystemFontOptions {
  code: string[];
  document: string[];
  recommendations: AppearanceFontSettings;
  ui: string[];
}

export interface LinkPreviewMetadata {
  kind: 'link';
  url: string;
  title: string;
  domain?: string;
  description?: string;
  image?: string;
  error?: 'blocked_url' | 'invalid_url';
}

export interface AppSettings {
  schemaVersion: 1;
  calendar: CalendarSettings;
  storage: {
    defaultProvider: 'local';
  };
  appearance: AppearanceSettings;
}

export interface UploadWorkspaceAssetInput {
  fileName: string;
  mediaType: string;
  base64Data: string;
}

export interface UploadedWorkspaceAsset {
  id: string;
  url: string;
  relativePath: string;
  name: string;
  mediaType: string;
  size: number;
  absolutePath: string;
}

export interface ImportedTreeIconAsset {
  assetId: string;
  mediaType: 'image/png' | 'image/svg+xml' | 'image/webp';
  name: string;
}

export interface ResolvedWorkspaceAsset {
  id: string;
  absolutePath: string;
  mediaType: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

export interface WorkspaceAssetBatchResolutionItem {
  id: string;
  status: 'resolved' | 'missing' | 'unreadable';
  asset?: ResolvedWorkspaceAsset;
}

export interface WorkspaceAssetBatchResolution {
  items: WorkspaceAssetBatchResolutionItem[];
}

export interface WorkspaceAssetData {
  id: string;
  mediaType: string;
  name: string;
  base64Data: string;
}

export interface MarkdownDocumentContent {
  path: string;
  content: string;
  modifiedAt: number;
}

export interface MarkdownDraft {
  markdown: string;
  metadata: {
    title: string;
    createdAt: string | null;
    updatedAt: string | null;
    refinexDialect: number;
  };
  modifiedAt: number;
  path: string;
}

export interface DocumentContentMeta {
  path: string;
  modifiedAt: number;
}

export interface DeletedWorkspaceNode {
  path: string;
}

export type WorkspaceMovePosition = 'before' | 'after' | 'inside';

export interface WorkspaceMoveRequest {
  nodePath: string;
  targetPath: string;
  position: WorkspaceMovePosition;
}

export interface CreatedMarkdownDocument {
  node: WorkspaceNode;
  content: MarkdownDocumentContent;
}

export interface DailyNoteEntry {
  date: string;
  documentPath: string;
  excerpt: string | null;
  hasContent: boolean;
  taskCompleted: number;
  taskPreview: DailyNoteTaskPreview[];
  taskTotal: number;
  title: string | null;
  updatedAt: number;
}

export interface DailyNoteTaskPreview {
  completed: boolean;
  text: string;
}

export interface DailyNoteMonth {
  month: string;
  entries: DailyNoteEntry[];
}

export interface DailyNoteDocument {
  node: WorkspaceNode;
  content: MarkdownDocumentContent;
}

export type InboxCaptureStatus = 'open' | 'processing' | 'done' | 'archived';

export type InboxCapturePriority = 'low' | 'normal' | 'high';

export type InboxCaptureSource = 'quick-capture' | 'inbox';

export type InboxCaptureListView = 'active' | 'done' | 'archived' | 'all';

export interface InboxCapture {
  id: string;
  body: string;
  status: InboxCaptureStatus;
  priority: InboxCapturePriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source: InboxCaptureSource;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  promotedTo: string | null;
  appendedTo: string | null;
  modifiedAt: number;
}

export interface InboxCaptureSummary extends Omit<InboxCapture, 'body'> {
  title: string;
  summary: string;
}

export interface InboxCaptureIssue {
  fileName: string;
  message: string;
}

export interface InboxCaptureListResult {
  captures: InboxCaptureSummary[];
  activeCount: number;
  issues: InboxCaptureIssue[];
}

export interface InboxCaptureUpdate {
  body: string;
  status: InboxCaptureStatus;
  priority: InboxCapturePriority;
  tags: string[];
  snoozedUntil: string | null;
}

export interface InboxPromotionResult {
  capture: InboxCapture;
  document: CreatedMarkdownDocument;
}

export interface InboxDailyAppendResult {
  capture: InboxCapture;
  dailyNote: DailyNoteDocument;
}

export type DocumentLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export type DocumentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface GitProbe {
  gitAvailable: boolean;
  isRepository: boolean;
  rootPath: string;
  branch: string | null;
}

export interface GitStatus {
  rootPath: string;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: GitChange[];
}

export interface GitRemoteInfo {
  remoteUrl: string | null;
  webUrl: string | null;
}

export interface GitSyncResult {
  lastSyncedAt: string;
  status: GitStatus;
}

export interface GitChange {
  path: string;
  oldPath: string | null;
  changeType: GitChangeType;
  indexStatus: string;
  workingTreeStatus: string;
  staged: boolean;
}

export type GitChangeType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unknown';

export interface GitDiff {
  path: string;
  staged: boolean;
  binary: boolean;
  truncated: boolean;
  content: string;
}

export interface GitBranchItem {
  name: string;
  fullName: string;
  kind: GitBranchKind;
  current: boolean;
  upstream: string | null;
  commit: string;
}

export type GitBranchKind = 'local' | 'remote';

export interface GitCommitEntry {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  refs: string[];
}

export interface GitCommitFile {
  path: string;
  oldPath: string | null;
  status: string;
  changeType: Exclude<GitChangeType, 'untracked'>;
}

export interface TerminalSessionInfo {
  id: string;
  cwd: string;
  shell: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  code: number | null;
}

export interface TerminalErrorEvent {
  sessionId: string;
  message: string;
}

export interface AppUpdateRelease {
  body: string | null;
  currentVersion: string;
  date: number | null;
  version: string;
}

export interface AppUpdateCheckResult {
  currentVersion: string;
  update: AppUpdateRelease | null;
}

export type AppUpdateDownloadEvent =
  | {
      event: 'started';
      data: { contentLength: number | null };
    }
  | {
      event: 'progress';
      data: { chunkLength: number };
    }
  | { event: 'finished' };

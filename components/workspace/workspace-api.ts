import type {
  AiAssistantAccount,
  CodexIntegrationStatus,
  CodexLoginCancelResult,
  CodexLoginOpenUrlResult,
  CodexLoginSession,
  CodexLogoutResult,
  AiAgentProfile,
  AiDetectedModel,
  AiConversationRecord,
  AiConversationSummary,
  AiRuntimeEvent,
  AiSessionInfo,
  RespondAiPermissionInput,
  SendAiPromptInput,
  StartAiSessionInput,
} from './ai-panel/ai-types';
import type {
  AiPreferredEditor,
  CreatedMarkdownDocument,
  AppSettings,
  DailyNoteDocument,
  DailyNoteMonth,
  DeletedWorkspaceNode,
  DocumentContentMeta,
  GitBranchItem,
  GitCommitEntry,
  GitCommitFile,
  GitDiff,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  GitSyncResult,
  GitStatus,
  MarkdownDocumentContent,
  MarkdownSourceFile,
  ResolvedWorkspaceAsset,
  TerminalDataEvent,
  TerminalErrorEvent,
  TerminalExitEvent,
  TerminalSessionInfo,
  UploadedWorkspaceAsset,
  UploadWorkspaceAssetInput,
  WorkspaceAssetData,
  WorkspaceGitSyncSettings,
  WorkspaceMoveRequest,
  WorkspaceHistoryItem,
  WorkspaceMetadata,
  WorkspaceNode,
  WorkspaceSnapshot,
  SystemFontOptions,
} from './workspace-types';
import type { AiProviderJsonRequest } from './ai-provider/provider-requests';
import type {
  AiCommandDeleteInput,
  AiCommandItem,
  AiCommandWriteInput,
  AiAnthropicAccountItem,
  AiAnthropicAccountImportInput,
  AiClaudeCodeAuthCodeInput,
  AiClaudeCodeAuthStartResult,
  AiClaudeCodeAuthStatus,
  AiClaudeCodeAuthStatusInput,
  AiClaudeCodeAuthSuccessResult,
  AiCustomAgentDeleteInput,
  AiCustomAgentItem,
  AiCustomAgentWriteInput,
  AiMcpServerItem,
  AiMcpServerAuthInput,
  AiMcpServerDeleteInput,
  AiMcpServerToggleInput,
  AiMcpServerUpdateInput,
  AiMcpServerWriteInput,
  AiPluginItem,
  AiSkillDeleteInput,
  AiSkillItem,
  AiSkillWriteInput,
} from './ai-settings/ai-settings-types';
import { getParentPath } from './workspace-paths';

import type { UnlistenFn } from '@tauri-apps/api/event';

const RECENT_WORKSPACE_KEY = 'madora:recent-workspace-path';
const WORKSPACE_HISTORY_KEY = 'madora:workspace-history';
const MAX_WORKSPACE_HISTORY = 8;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: true,
    multiple: false,
  });

  return typeof selected === 'string' ? selected : null;
}

export async function selectWorkspaceParentDirectory() {
  return selectWorkspaceRoot();
}

export async function loadWorkspaceTree(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceSnapshot>('load_workspace_tree', { rootPath });
}

export async function listSystemFonts() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<SystemFontOptions>('list_system_fonts');
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

export async function readMarkdownSourceFiles(sourcePaths: string[]) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<MarkdownSourceFile[]>('read_markdown_source_files', {
    sourcePaths,
  });
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

export async function openPathInPreferredEditor(
  path: string,
  app: AiPreferredEditor,
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

export async function readWorkspaceAssetData(rootPath: string, assetId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<WorkspaceAssetData>('read_workspace_asset_data', {
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

export async function listAiAgentProfiles(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiAgentProfile[]>('list_ai_agent_profiles', { rootPath });
}

export async function detectAiAccounts() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiAssistantAccount[]>('detect_ai_accounts');
}

export async function logoutCodexAccount() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexLogoutResult>('logout_codex_account');
}

export async function getCodexIntegration() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexIntegrationStatus>('get_codex_integration');
}

export async function startCodexLogin() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexLoginSession>('start_codex_login');
}

export async function getCodexLoginSession(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexLoginSession>('get_codex_login_session', { sessionId });
}

export async function cancelCodexLogin(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexLoginCancelResult>('cancel_codex_login', { sessionId });
}

export async function openCodexLoginUrl(url: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<CodexLoginOpenUrlResult>('open_codex_login_url', { url });
}

export async function listAiAgentModels(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiDetectedModel[]>('list_ai_agent_models', { rootPath });
}

export async function listAiAnthropicAccounts() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiAnthropicAccountItem[]>('list_ai_anthropic_accounts');
}

export async function importAiAnthropicAccountToken(
  input: AiAnthropicAccountImportInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiAnthropicAccountItem>('import_ai_anthropic_account_token', {
    displayName: input.displayName ?? null,
    email: input.email ?? null,
    token: input.token,
  });
}

export async function setAiAnthropicAccountActive(accountId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_anthropic_account_active', { accountId });
}

export async function renameAiAnthropicAccount(
  accountId: string,
  displayName: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('rename_ai_anthropic_account', { accountId, displayName });
}

export async function deleteAiAnthropicAccount(accountId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_ai_anthropic_account', { accountId });
}

export async function startAiClaudeCodeAuth() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiClaudeCodeAuthStartResult>('start_ai_claude_code_auth');
}

export async function pollAiClaudeCodeAuthStatus(
  input: AiClaudeCodeAuthStatusInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiClaudeCodeAuthStatus>('poll_ai_claude_code_auth_status', {
    sandboxUrl: input.sandboxUrl,
    sessionId: input.sessionId,
  });
}

export async function submitAiClaudeCodeAuthCode(
  input: AiClaudeCodeAuthCodeInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiClaudeCodeAuthSuccessResult>('submit_ai_claude_code_auth_code', {
    code: input.code,
    sandboxUrl: input.sandboxUrl,
    sessionId: input.sessionId,
  });
}

export async function openAiClaudeCodeOAuthUrl(url: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiClaudeCodeAuthSuccessResult>('open_ai_claude_code_oauth_url', {
    url,
  });
}

export async function listAiSkills(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiSkillItem[]>('list_ai_skills', { rootPath });
}

export async function listAiCommands(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiCommandItem[]>('list_ai_commands', { rootPath });
}

export async function createAiSkill(rootPath: string, input: AiSkillWriteInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('create_ai_skill', { rootPath, ...input });
}

export async function updateAiSkill(rootPath: string, input: AiSkillWriteInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('update_ai_skill', { rootPath, ...input });
}

export async function deleteAiSkill(
  rootPath: string,
  input: AiSkillDeleteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_ai_skill', { rootPath, ...input });
}

export async function createAiCommand(
  rootPath: string,
  input: AiCommandWriteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('create_ai_command', { rootPath, ...input });
}

export async function updateAiCommand(
  rootPath: string,
  input: AiCommandWriteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('update_ai_command', { rootPath, ...input });
}

export async function deleteAiCommand(
  rootPath: string,
  input: AiCommandDeleteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_ai_command', { rootPath, ...input });
}

export async function listAiCustomAgents(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiCustomAgentItem[]>('list_ai_custom_agents', { rootPath });
}

export async function createAiCustomAgent(
  rootPath: string,
  input: AiCustomAgentWriteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('create_ai_custom_agent', { rootPath, ...input });
}

export async function updateAiCustomAgent(
  rootPath: string,
  input: AiCustomAgentWriteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('update_ai_custom_agent', { rootPath, ...input });
}

export async function deleteAiCustomAgent(
  rootPath: string,
  input: AiCustomAgentDeleteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_ai_custom_agent', { rootPath, ...input });
}

export async function listAiMcpServers(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiMcpServerItem[]>('list_ai_mcp_servers', { rootPath });
}

export async function createAiMcpServer(
  rootPath: string,
  input: AiMcpServerWriteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('create_ai_mcp_server', { rootPath, ...input });
}

export async function setAiMcpServerEnabled(
  rootPath: string,
  input: AiMcpServerToggleInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_mcp_server_enabled', { rootPath, ...input });
}

export async function updateAiMcpServer(
  rootPath: string,
  input: AiMcpServerUpdateInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string>('update_ai_mcp_server', { rootPath, ...input });
}

export async function deleteAiMcpServer(
  rootPath: string,
  input: AiMcpServerDeleteInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('delete_ai_mcp_server', { rootPath, ...input });
}

export async function authenticateAiMcpServer(
  rootPath: string,
  input: AiMcpServerAuthInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('authenticate_ai_mcp_server', { rootPath, ...input });
}

export async function logoutAiMcpServer(
  rootPath: string,
  input: AiMcpServerAuthInput,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('logout_ai_mcp_server', { rootPath, ...input });
}

export async function listAiPlugins() {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiPluginItem[]>('list_ai_plugins');
}

export async function setAiClaudeIncludeCoAuthoredBy(enabled: boolean) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_claude_include_co_authored_by', { enabled });
}

export async function setAiPluginEnabled(source: string, enabled: boolean) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_plugin_enabled', { source, enabled });
}

export async function setAiPluginMcpServerApproved(
  pluginSource: string,
  serverName: string,
  approved: boolean,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_plugin_mcp_server_approved', {
    pluginSource,
    serverName,
    approved,
  });
}

export async function setAiPluginMcpServersApproved(
  pluginSource: string,
  serverNames: string[],
  approved: boolean,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('set_ai_plugin_mcp_servers_approved', {
    pluginSource,
    serverNames,
    approved,
  });
}

export async function listAiConversations(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiConversationSummary[]>('list_ai_conversations', {
    rootPath,
  });
}

export async function readAiConversation(
  rootPath: string,
  conversationId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiConversationRecord>('read_ai_conversation', {
    conversationId,
    rootPath,
  });
}

export async function saveAiConversation(
  rootPath: string,
  record: AiConversationRecord,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiConversationSummary>('save_ai_conversation', {
    record,
    rootPath,
  });
}

// v2 会话存储（parts 纵向流）。@author refinex
// 与 v1 物理隔离（.v2.json 后缀），用于 B-J 子项目的 parts 纵向流渲染。
export async function readAiConversationV2(
  rootPath: string,
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<Record<string, unknown> | null>('read_ai_conversation_v2', {
    conversationId,
    rootPath,
  });
}

export async function saveAiConversationV2(
  rootPath: string,
  record: Record<string, unknown>,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');

  await invoke<void>('save_ai_conversation_v2', { record, rootPath });
}

export async function listAiConversationsV2(
  rootPath: string,
): Promise<Array<Record<string, unknown>>> {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<Array<Record<string, unknown>>>('list_ai_conversations_v2', {
    rootPath,
  });
}

export interface AiProviderSecretStatus {
  status: 'configured' | 'missing';
}

export async function getAiProviderSecretStatus(providerId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('get_ai_provider_secret_status', {
    providerId,
  });
}

export async function saveAiProviderSecret(providerId: string, secret: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('save_ai_provider_secret', {
    providerId,
    secret,
  });
}

export async function deleteAiProviderSecret(providerId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderSecretStatus>('delete_ai_provider_secret', {
    providerId,
  });
}

export interface AiProviderJsonResponse {
  status: number;
  body: unknown;
}

export interface AiChatRequest {
  body: string;
  headers: Record<string, string>;
  providerId: string;
  url: string;
}

export async function requestAiProviderJson(request: AiProviderJsonRequest) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderJsonResponse>('request_ai_provider_json', {
    request,
  });
}

export async function requestAiChat(request: AiChatRequest) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiProviderJsonResponse>('request_ai_chat', {
    request,
  });
}

export async function startAiSession(input: StartAiSessionInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<AiSessionInfo>('start_ai_session', { input });
}

export async function sendAiPrompt(input: SendAiPromptInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('send_ai_prompt', { input });
}

export async function cancelAiTurn(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('cancel_ai_turn', { sessionId });
}

export async function respondAiPermission(input: RespondAiPermissionInput) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('respond_ai_permission', { input });
}

export async function stopAiSession(sessionId: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<void>('stop_ai_session', { sessionId });
}

export async function listenAiEvents(
  handler: (event: AiRuntimeEvent) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');

  return listen<AiRuntimeEvent>('ai:event', (event) => handler(event.payload));
}

export async function selectMarkdownSourceFiles() {
  if (!isTauriRuntime()) {
    return [];
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    directory: false,
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'mdx'],
      },
    ],
    multiple: true,
  });

  if (Array.isArray(selected)) {
    return selected.filter((item): item is string => typeof item === 'string');
  }

  return typeof selected === 'string' ? [selected] : [];
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

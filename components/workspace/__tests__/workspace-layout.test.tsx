import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMarkdownDocument,
  deleteAiAnthropicAccount,
  deleteAiProviderSecret,
  openAiClaudeCodeOAuthUrl,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  detectAiAccounts,
  ensureWorkspace,
  getAiProviderSecretStatus,
  getCodexIntegration,
  gitBranches,
  gitCommit,
  gitCommitFileDiff,
  gitCommitFiles,
  gitDeleteFile,
  gitDiff,
  gitInit,
  gitLog,
  gitProbe,
  gitRemoteInfo,
  gitPush,
  gitRevertFile,
  gitSyncNow,
  gitStage,
  gitStatus,
  gitUnstage,
  listAiCommands,
  listDailyNotesForMonth,
  listAiAgentModels,
  listAiAgentProfiles,
  listAiAnthropicAccounts,
  listAiCustomAgents,
  listAiMcpServers,
  listAiPlugins,
  logoutCodexAccount,
  listAiSkills,
  listSystemFonts,
  listenAiEvents,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  loadWorkspaceTree,
  openDailyNote,
  openCodexLoginUrl,
  openPathInFileManager,
  openPathInPreferredEditor,
  readAppSettings,
  readMarkdownDocument,
  readWorkspaceAssetData,
  recordRecentDocument,
  recordWorkspaceHistory,
  resolveWorkspaceAsset,
  saveAiProviderSecret,
  cancelCodexLogin,
  getCodexLoginSession,
  importAiAnthropicAccountToken,
  pollAiClaudeCodeAuthStatus,
  renameAiAnthropicAccount,
  setAiAnthropicAccountActive,
  saveAppSettings,
  saveWorkspaceGitSyncSettings,
  startAiClaudeCodeAuth,
  startCodexLogin,
  selectWorkspaceAssetDownloadPath,
  selectWorkspaceParentDirectory,
  setAiClaudeIncludeCoAuthoredBy,
  setAiPluginEnabled,
  setAiPluginMcpServerApproved,
  setAiPluginMcpServersApproved,
  setAiMcpServerEnabled,
  setWorkspaceNodeState,
  closeAppWindow,
  cancelAiTurn,
  createAiCommand,
  createAiCustomAgent,
  createAiMcpServer,
  authenticateAiMcpServer,
  createAiSkill,
  minimizeAppWindow,
  deleteAiCommand,
  deleteAiCustomAgent,
  deleteAiMcpServer,
  deleteAiSkill,
  logoutAiMcpServer,
  sendAiPrompt,
  startAiSession,
  stopAiSession,
  toggleMaximizeAppWindow,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
  submitAiClaudeCodeAuthCode,
  updateAiCommand,
  updateAiCustomAgent,
  updateAiMcpServer,
  updateAiSkill,
  writeExportFile,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_APP_SETTINGS,
} from '../workspace-settings';
import type { WorkspaceSnapshot } from '../workspace-types';

const { setThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
}));

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
  writable: true,
});

Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: vi.fn(() => false),
});

Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: setThemeMock,
    theme: 'light',
  }),
}));

vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({
    documentKey,
    markdown,
    onMarkdownChange,
    pageWidthMode,
    readOnly,
  }: {
    documentKey?: string;
    markdown?: string;
    onMarkdownChange?: (markdown: string) => void;
    pageWidthMode?: string;
    readOnly?: boolean;
  }) => (
    <div>
      <button
        data-document-key={documentKey}
        data-page-width-mode={pageWidthMode}
        data-markdown={markdown}
        data-read-only={String(Boolean(readOnly))}
        data-testid="markdown-editor"
        type="button"
      >
        editor
      </button>
      <button
        type="button"
        onClick={() => onMarkdownChange?.(`${markdown ?? ''}\n编辑`)}
      >
        模拟编辑器输入
      </button>
    </div>
  ),
}));


vi.mock('../xterm-terminal', () => ({
  XtermTerminal: ({
    output,
    sessionId,
  }: {
    output: string;
    sessionId: string;
  }) => <div data-testid={`mock-xterm-${sessionId}`}>{output}</div>,
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    createMarkdownDocument: vi.fn(),
    deleteAiAnthropicAccount: vi.fn(),
    deleteAiProviderSecret: vi.fn(),
    openAiClaudeCodeOAuthUrl: vi.fn(),
    createAiCommand: vi.fn(),
    createAiCustomAgent: vi.fn(),
    createAiMcpServer: vi.fn(),
    authenticateAiMcpServer: vi.fn(),
    createAiSkill: vi.fn(),
    createWorkspaceDirectory: vi.fn(),
    createWorkspaceRoot: vi.fn(),
    deleteAiCommand: vi.fn(),
    deleteAiCustomAgent: vi.fn(),
    deleteAiMcpServer: vi.fn(),
    deleteAiSkill: vi.fn(),
    logoutAiMcpServer: vi.fn(),
    logoutCodexAccount: vi.fn(),
    detectAiAccounts: vi.fn(),
    ensureWorkspace: vi.fn(),
    getAiProviderSecretStatus: vi.fn(),
    getCodexIntegration: vi.fn(),
    importAiAnthropicAccountToken: vi.fn(),
    pollAiClaudeCodeAuthStatus: vi.fn(),
    gitBranches: vi.fn(),
    gitCommit: vi.fn(),
    gitCommitFileDiff: vi.fn(),
    gitCommitFiles: vi.fn(),
    gitDeleteFile: vi.fn(),
    gitDiff: vi.fn(),
    gitInit: vi.fn(),
    gitLog: vi.fn(),
    gitProbe: vi.fn(),
    gitRemoteInfo: vi.fn(),
    gitPush: vi.fn(),
    gitRevertFile: vi.fn(),
    gitSyncNow: vi.fn(),
    gitStage: vi.fn(),
    gitStatus: vi.fn(),
    gitUnstage: vi.fn(),
    listAiCommands: vi.fn(),
    listDailyNotesForMonth: vi.fn(),
    listAiAgentModels: vi.fn(),
    listAiAgentProfiles: vi.fn(),
    listAiAnthropicAccounts: vi.fn(),
    listAiCustomAgents: vi.fn(),
    listAiMcpServers: vi.fn(),
    listAiPlugins: vi.fn(),
    listAiSkills: vi.fn(),
    listSystemFonts: vi.fn(),
    listenAiEvents: vi.fn(),
    listenTerminalData: vi.fn(),
    listenTerminalError: vi.fn(),
    listenTerminalExit: vi.fn(),
    loadWorkspaceTree: vi.fn(),
    openDailyNote: vi.fn(),
    openCodexLoginUrl: vi.fn(),
    openPathInFileManager: vi.fn(),
    openPathInPreferredEditor: vi.fn(),
    readMarkdownDocument: vi.fn(),
    readWorkspaceAssetData: vi.fn(),
    recordRecentDocument: vi.fn(),
    resolveWorkspaceAsset: vi.fn(),
    readAppSettings: vi.fn(),
    cancelCodexLogin: vi.fn(),
    getCodexLoginSession: vi.fn(),
    saveAiProviderSecret: vi.fn(),
    renameAiAnthropicAccount: vi.fn(),
    setAiAnthropicAccountActive: vi.fn(),
    saveAppSettings: vi.fn(),
    saveWorkspaceGitSyncSettings: vi.fn(),
    selectWorkspaceAssetDownloadPath: vi.fn(),
    selectWorkspaceParentDirectory: vi.fn(),
    startAiClaudeCodeAuth: vi.fn(),
    startCodexLogin: vi.fn(),
    setAiClaudeIncludeCoAuthoredBy: vi.fn(),
    setAiPluginEnabled: vi.fn(),
    setAiPluginMcpServerApproved: vi.fn(),
    setAiPluginMcpServersApproved: vi.fn(),
    setAiMcpServerEnabled: vi.fn(),
    setWorkspaceNodeState: vi.fn(),
    setAppWindowTitle: vi.fn(),
    closeAppWindow: vi.fn(),
    cancelAiTurn: vi.fn(),
    minimizeAppWindow: vi.fn(),
    sendAiPrompt: vi.fn(),
    startAiSession: vi.fn(),
    stopAiSession: vi.fn(),
    toggleMaximizeAppWindow: vi.fn(),
    terminalKill: vi.fn(),
    terminalResize: vi.fn(),
    terminalSpawn: vi.fn(),
    terminalWrite: vi.fn(),
    submitAiClaudeCodeAuthCode: vi.fn(),
    updateAiCommand: vi.fn(),
    updateAiCustomAgent: vi.fn(),
    updateAiMcpServer: vi.fn(),
    updateAiSkill: vi.fn(),
    writeExportFile: vi.fn(),
  };
});

const createMarkdownDocumentMock = vi.mocked(createMarkdownDocument);
const deleteAiAnthropicAccountMock = vi.mocked(deleteAiAnthropicAccount);
const openAiClaudeCodeOAuthUrlMock = vi.mocked(openAiClaudeCodeOAuthUrl);
const createAiCommandMock = vi.mocked(createAiCommand);
const createAiCustomAgentMock = vi.mocked(createAiCustomAgent);
const createAiMcpServerMock = vi.mocked(createAiMcpServer);
const authenticateAiMcpServerMock = vi.mocked(authenticateAiMcpServer);
const createAiSkillMock = vi.mocked(createAiSkill);
const createWorkspaceDirectoryMock = vi.mocked(createWorkspaceDirectory);
const createWorkspaceRootMock = vi.mocked(createWorkspaceRoot);
const deleteAiCommandMock = vi.mocked(deleteAiCommand);
const deleteAiCustomAgentMock = vi.mocked(deleteAiCustomAgent);
const deleteAiMcpServerMock = vi.mocked(deleteAiMcpServer);
const deleteAiProviderSecretMock = vi.mocked(deleteAiProviderSecret);
const deleteAiSkillMock = vi.mocked(deleteAiSkill);
const logoutAiMcpServerMock = vi.mocked(logoutAiMcpServer);
const logoutCodexAccountMock = vi.mocked(logoutCodexAccount);
const detectAiAccountsMock = vi.mocked(detectAiAccounts);
const ensureWorkspaceMock = vi.mocked(ensureWorkspace);
const getAiProviderSecretStatusMock = vi.mocked(getAiProviderSecretStatus);
const getCodexIntegrationMock = vi.mocked(getCodexIntegration);
const importAiAnthropicAccountTokenMock = vi.mocked(importAiAnthropicAccountToken);
const pollAiClaudeCodeAuthStatusMock = vi.mocked(pollAiClaudeCodeAuthStatus);
const gitBranchesMock = vi.mocked(gitBranches);
const gitCommitMock = vi.mocked(gitCommit);
const gitCommitFileDiffMock = vi.mocked(gitCommitFileDiff);
const gitCommitFilesMock = vi.mocked(gitCommitFiles);
const gitDeleteFileMock = vi.mocked(gitDeleteFile);
const gitDiffMock = vi.mocked(gitDiff);
const gitInitMock = vi.mocked(gitInit);
const gitLogMock = vi.mocked(gitLog);
const gitProbeMock = vi.mocked(gitProbe);
const gitRemoteInfoMock = vi.mocked(gitRemoteInfo);
const gitPushMock = vi.mocked(gitPush);
const gitRevertFileMock = vi.mocked(gitRevertFile);
const gitSyncNowMock = vi.mocked(gitSyncNow);
const gitStageMock = vi.mocked(gitStage);
const gitStatusMock = vi.mocked(gitStatus);
const gitUnstageMock = vi.mocked(gitUnstage);
const listAiCommandsMock = vi.mocked(listAiCommands);
const listDailyNotesForMonthMock = vi.mocked(listDailyNotesForMonth);
const listAiAgentModelsMock = vi.mocked(listAiAgentModels);
const listAiAgentProfilesMock = vi.mocked(listAiAgentProfiles);
const listAiAnthropicAccountsMock = vi.mocked(listAiAnthropicAccounts);
const listAiCustomAgentsMock = vi.mocked(listAiCustomAgents);
const listAiMcpServersMock = vi.mocked(listAiMcpServers);
const listAiPluginsMock = vi.mocked(listAiPlugins);
const listAiSkillsMock = vi.mocked(listAiSkills);
const listSystemFontsMock = vi.mocked(listSystemFonts);
const listenAiEventsMock = vi.mocked(listenAiEvents);
const listenTerminalDataMock = vi.mocked(listenTerminalData);
const listenTerminalErrorMock = vi.mocked(listenTerminalError);
const listenTerminalExitMock = vi.mocked(listenTerminalExit);
const loadWorkspaceTreeMock = vi.mocked(loadWorkspaceTree);
const openDailyNoteMock = vi.mocked(openDailyNote);
const openCodexLoginUrlMock = vi.mocked(openCodexLoginUrl);
const openPathInFileManagerMock = vi.mocked(openPathInFileManager);
const openPathInPreferredEditorMock = vi.mocked(openPathInPreferredEditor);
const readAppSettingsMock = vi.mocked(readAppSettings);
const readMarkdownDocumentMock = vi.mocked(readMarkdownDocument);
const readWorkspaceAssetDataMock = vi.mocked(readWorkspaceAssetData);
const recordRecentDocumentMock = vi.mocked(recordRecentDocument);
const resolveWorkspaceAssetMock = vi.mocked(resolveWorkspaceAsset);
const saveAiProviderSecretMock = vi.mocked(saveAiProviderSecret);
const cancelCodexLoginMock = vi.mocked(cancelCodexLogin);
const getCodexLoginSessionMock = vi.mocked(getCodexLoginSession);
const renameAiAnthropicAccountMock = vi.mocked(renameAiAnthropicAccount);
const setAiAnthropicAccountActiveMock = vi.mocked(setAiAnthropicAccountActive);
const saveAppSettingsMock = vi.mocked(saveAppSettings);
const saveWorkspaceGitSyncSettingsMock = vi.mocked(
  saveWorkspaceGitSyncSettings,
);
const selectWorkspaceAssetDownloadPathMock = vi.mocked(
  selectWorkspaceAssetDownloadPath,
);
const selectWorkspaceParentDirectoryMock = vi.mocked(
  selectWorkspaceParentDirectory,
);
const startAiClaudeCodeAuthMock = vi.mocked(startAiClaudeCodeAuth);
const startCodexLoginMock = vi.mocked(startCodexLogin);
const setAiClaudeIncludeCoAuthoredByMock = vi.mocked(
  setAiClaudeIncludeCoAuthoredBy,
);
const setAiPluginEnabledMock = vi.mocked(setAiPluginEnabled);
const setAiPluginMcpServerApprovedMock = vi.mocked(
  setAiPluginMcpServerApproved,
);
const setAiPluginMcpServersApprovedMock = vi.mocked(
  setAiPluginMcpServersApproved,
);
const setAiMcpServerEnabledMock = vi.mocked(setAiMcpServerEnabled);
const setWorkspaceNodeStateMock = vi.mocked(setWorkspaceNodeState);
const closeAppWindowMock = vi.mocked(closeAppWindow);
const cancelAiTurnMock = vi.mocked(cancelAiTurn);
const minimizeAppWindowMock = vi.mocked(minimizeAppWindow);
const sendAiPromptMock = vi.mocked(sendAiPrompt);
const startAiSessionMock = vi.mocked(startAiSession);
const stopAiSessionMock = vi.mocked(stopAiSession);
const toggleMaximizeAppWindowMock = vi.mocked(toggleMaximizeAppWindow);
const terminalKillMock = vi.mocked(terminalKill);
const terminalResizeMock = vi.mocked(terminalResize);
const terminalSpawnMock = vi.mocked(terminalSpawn);
const terminalWriteMock = vi.mocked(terminalWrite);
const submitAiClaudeCodeAuthCodeMock = vi.mocked(submitAiClaudeCodeAuthCode);
const updateAiCommandMock = vi.mocked(updateAiCommand);
const updateAiCustomAgentMock = vi.mocked(updateAiCustomAgent);
const updateAiMcpServerMock = vi.mocked(updateAiMcpServer);
const updateAiSkillMock = vi.mocked(updateAiSkill);
const writeExportFileMock = vi.mocked(writeExportFile);

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'readme',
      name: 'README.md',
      kind: 'document',
      relativePath: 'README.md',
      absolutePath: '/repo/README.md',
      title: '项目说明',
    },
  ],
};

const dailyDirectorySnapshot: WorkspaceSnapshot = {
  ...snapshot,
  nodes: [
    {
      id: 'Daily',
      name: 'Daily',
      kind: 'directory',
      relativePath: 'Daily',
      absolutePath: '/repo/Daily',
      children: [
        {
          id: 'Daily/2026',
          name: '2026',
          kind: 'directory',
          relativePath: 'Daily/2026',
          absolutePath: '/repo/Daily/2026',
          children: [],
        },
      ],
    },
    ...snapshot.nodes,
  ],
};

function formatTestDailyDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const multiDocumentSnapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'a',
      name: 'a.md',
      kind: 'document',
      relativePath: 'a.md',
      absolutePath: '/repo/a.md',
      title: '文档 A',
    },
    {
      id: 'b',
      name: 'b.md',
      kind: 'document',
      relativePath: 'b.md',
      absolutePath: '/repo/b.md',
      title: '文档 B',
    },
  ],
};

const manyDocumentSnapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;

    return {
      id: `doc-${number}`,
      name: `doc-${number}.md`,
      kind: 'document' as const,
      relativePath: `doc-${number}.md`,
      absolutePath: `/repo/doc-${number}.md`,
      title: `文档 ${number}`,
    };
  }),
};

const directorySnapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'guides',
      name: 'Guides',
      kind: 'directory',
      relativePath: 'Guides',
      absolutePath: '/repo/Guides',
      children: [
        {
          id: 'intro',
          name: 'intro.md',
          kind: 'document',
          relativePath: 'Guides/intro.md',
          absolutePath: '/repo/Guides/intro.md',
          title: '入门指南',
        },
        {
          id: 'advanced',
          name: 'Advanced',
          kind: 'directory',
          relativePath: 'Guides/Advanced',
          absolutePath: '/repo/Guides/Advanced',
          children: [
            {
              id: 'deploy',
              name: 'deploy.md',
              kind: 'document',
              relativePath: 'Guides/Advanced/deploy.md',
              absolutePath: '/repo/Guides/Advanced/deploy.md',
              title: '部署说明',
            },
          ],
        },
      ],
    },
  ],
};

const fakeEchoProfile = {
  capabilities: {
    diff: false,
    models: false,
    readWorkspace: true,
    shell: false,
    slashCommands: false,
    writeWorkspace: false,
  },
  detection: { status: 'available' },
  id: 'fake-echo',
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
};

const defaultAiSettings = DEFAULT_AI_SETTINGS;

const defaultAppSettings = DEFAULT_APP_SETTINGS;

function getSettingsCreateButton() {
  const buttons = screen.getAllByRole('button', { name: 'Create' });
  const button = buttons.at(-1);

  if (!button) {
    throw new Error('Create button not found');
  }

  return button as HTMLButtonElement;
}

function markdownDocument({
  body = '正文',
  modifiedAt = 1,
  path = '/repo/README.md',
  title = '项目说明',
}: {
  body?: string;
  modifiedAt?: number;
  path?: string;
  title?: string;
}) {
  return {
    content: `---\ntitle: ${title}\ncreatedAt: 2026-06-01T00:00:00.000Z\nupdatedAt: 2026-06-02T11:30:00.000Z\nrefinexDialect: 1\n---\n\n# ${title}\n\n${body}\n`,
    modifiedAt,
    path,
  };
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    createMarkdownDocumentMock.mockReset();
    deleteAiAnthropicAccountMock.mockReset();
    openAiClaudeCodeOAuthUrlMock.mockReset();
    createAiCommandMock.mockReset();
    createAiCustomAgentMock.mockReset();
    createAiMcpServerMock.mockReset();
    authenticateAiMcpServerMock.mockReset();
    createAiSkillMock.mockReset();
    createWorkspaceDirectoryMock.mockReset();
    createWorkspaceRootMock.mockReset();
    deleteAiCommandMock.mockReset();
    deleteAiCustomAgentMock.mockReset();
    deleteAiMcpServerMock.mockReset();
    deleteAiProviderSecretMock.mockReset();
    deleteAiSkillMock.mockReset();
    logoutAiMcpServerMock.mockReset();
    detectAiAccountsMock.mockReset();
    ensureWorkspaceMock.mockReset();
    getAiProviderSecretStatusMock.mockReset();
    getCodexIntegrationMock.mockReset();
    importAiAnthropicAccountTokenMock.mockReset();
    pollAiClaudeCodeAuthStatusMock.mockReset();
    gitBranchesMock.mockReset();
    gitCommitMock.mockReset();
    gitCommitFileDiffMock.mockReset();
    gitCommitFilesMock.mockReset();
    gitDeleteFileMock.mockReset();
    gitDiffMock.mockReset();
    gitInitMock.mockReset();
    gitLogMock.mockReset();
    gitProbeMock.mockReset();
    gitRemoteInfoMock.mockReset();
    gitPushMock.mockReset();
    gitRevertFileMock.mockReset();
    gitSyncNowMock.mockReset();
    gitStageMock.mockReset();
    gitStatusMock.mockReset();
    gitUnstageMock.mockReset();
    listAiCommandsMock.mockReset();
    listDailyNotesForMonthMock.mockReset();
    listAiAgentModelsMock.mockReset();
    listAiAgentProfilesMock.mockReset();
    listAiAnthropicAccountsMock.mockReset();
    listAiCustomAgentsMock.mockReset();
    listAiMcpServersMock.mockReset();
    listAiPluginsMock.mockReset();
    listAiSkillsMock.mockReset();
    listSystemFontsMock.mockReset();
    listenAiEventsMock.mockReset();
    listenTerminalDataMock.mockReset();
    listenTerminalErrorMock.mockReset();
    listenTerminalExitMock.mockReset();
    loadWorkspaceTreeMock.mockReset();
    openDailyNoteMock.mockReset();
    openCodexLoginUrlMock.mockReset();
    openPathInFileManagerMock.mockReset();
    openPathInPreferredEditorMock.mockReset();
    readAppSettingsMock.mockReset();
    readMarkdownDocumentMock.mockReset();
    readWorkspaceAssetDataMock.mockReset();
    recordRecentDocumentMock.mockReset();
    resolveWorkspaceAssetMock.mockReset();
    saveAiProviderSecretMock.mockReset();
    cancelCodexLoginMock.mockReset();
    getCodexLoginSessionMock.mockReset();
    renameAiAnthropicAccountMock.mockReset();
    setAiAnthropicAccountActiveMock.mockReset();
    saveAppSettingsMock.mockReset();
    saveWorkspaceGitSyncSettingsMock.mockReset();
    selectWorkspaceAssetDownloadPathMock.mockReset();
    selectWorkspaceParentDirectoryMock.mockReset();
    startAiClaudeCodeAuthMock.mockReset();
    startCodexLoginMock.mockReset();
    setAiClaudeIncludeCoAuthoredByMock.mockReset();
    setAiPluginEnabledMock.mockReset();
    setAiPluginMcpServerApprovedMock.mockReset();
    setAiPluginMcpServersApprovedMock.mockReset();
    setAiMcpServerEnabledMock.mockReset();
    setWorkspaceNodeStateMock.mockReset();
    closeAppWindowMock.mockReset();
    cancelAiTurnMock.mockReset();
    minimizeAppWindowMock.mockReset();
    sendAiPromptMock.mockReset();
    startAiSessionMock.mockReset();
    stopAiSessionMock.mockReset();
    toggleMaximizeAppWindowMock.mockReset();
    terminalKillMock.mockReset();
    terminalResizeMock.mockReset();
    terminalSpawnMock.mockReset();
    terminalWriteMock.mockReset();
    submitAiClaudeCodeAuthCodeMock.mockReset();
    updateAiCommandMock.mockReset();
    updateAiCustomAgentMock.mockReset();
    updateAiMcpServerMock.mockReset();
    updateAiSkillMock.mockReset();
    writeExportFileMock.mockReset();
    setThemeMock.mockReset();
    closeAppWindowMock.mockResolvedValue(undefined);
    cancelAiTurnMock.mockResolvedValue(undefined);
    sendAiPromptMock.mockResolvedValue(undefined);
    startAiSessionMock.mockResolvedValue({
      profileId: 'fake-echo',
      rootPath: '/repo',
      sessionId: 'ai-1',
      status: 'running',
    });
    stopAiSessionMock.mockResolvedValue(undefined);
    minimizeAppWindowMock.mockResolvedValue(undefined);
    toggleMaximizeAppWindowMock.mockResolvedValue(undefined);
    listenTerminalDataMock.mockResolvedValue(vi.fn());
    listenTerminalErrorMock.mockResolvedValue(vi.fn());
    listenTerminalExitMock.mockResolvedValue(vi.fn());
    listenAiEventsMock.mockResolvedValue(vi.fn());
    listAiAgentProfilesMock.mockResolvedValue([fakeEchoProfile]);
    listAiAgentModelsMock.mockResolvedValue([]);
    listAiAnthropicAccountsMock.mockResolvedValue([]);
    listAiCommandsMock.mockResolvedValue([]);
    listAiCustomAgentsMock.mockResolvedValue([]);
    listAiMcpServersMock.mockResolvedValue([]);
    listAiPluginsMock.mockResolvedValue([]);
    listAiSkillsMock.mockResolvedValue([]);
    updateAiMcpServerMock.mockResolvedValue('/repo/.mcp.json');
    listSystemFontsMock.mockResolvedValue({
      code: ['JetBrains Mono', 'SF Mono', 'Menlo'],
      document: ['Songti SC', 'PingFang SC'],
      recommendations: {
        code: 'JetBrains Mono',
        document: 'Songti SC',
        ui: 'SF Pro Text',
      },
      ui: ['SF Pro Text', 'PingFang SC', 'Geist'],
    });
    detectAiAccountsMock.mockResolvedValue([]);
    setAiClaudeIncludeCoAuthoredByMock.mockResolvedValue(undefined);
    setAiPluginEnabledMock.mockResolvedValue(undefined);
    setAiPluginMcpServerApprovedMock.mockResolvedValue(undefined);
    setAiPluginMcpServersApprovedMock.mockResolvedValue(undefined);
    setAiMcpServerEnabledMock.mockResolvedValue(undefined);
    terminalKillMock.mockResolvedValue(undefined);
    terminalResizeMock.mockResolvedValue(undefined);
    terminalSpawnMock.mockResolvedValue({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });
    terminalWriteMock.mockResolvedValue(undefined);
    createAiCommandMock.mockResolvedValue('/repo/.claude/commands/git/commit.md');
    createAiCustomAgentMock.mockResolvedValue('/repo/.claude/agents/reviewer.md');
    createAiMcpServerMock.mockResolvedValue('/repo/.mcp.json');
    authenticateAiMcpServerMock.mockResolvedValue(undefined);
    createAiSkillMock.mockResolvedValue('/repo/.claude/skills/doc/SKILL.md');
    deleteAiCommandMock.mockResolvedValue(undefined);
    deleteAiCustomAgentMock.mockResolvedValue(undefined);
    deleteAiMcpServerMock.mockResolvedValue(undefined);
    deleteAiProviderSecretMock.mockResolvedValue({ status: 'missing' });
    deleteAiSkillMock.mockResolvedValue(undefined);
    logoutAiMcpServerMock.mockResolvedValue(undefined);
    logoutCodexAccountMock.mockResolvedValue({
      isConnected: false,
      logoutExitCode: 0,
      logoutOutput: 'logged out',
      state: 'not_logged_in',
      statusOutput: 'not logged in',
      success: true,
    });
    getCodexIntegrationMock.mockResolvedValue({
      exitCode: 0,
      isConnected: false,
      rawOutput: 'not logged in',
      state: 'not_logged_in',
    });
    getAiProviderSecretStatusMock.mockResolvedValue({ status: 'missing' });
    importAiAnthropicAccountTokenMock.mockResolvedValue({
      connectedAt: '2026-06-24T12:30:00.000Z',
      displayName: 'Imported Claude',
      email: 'imported@example.com',
      id: 'acct-imported',
      isActive: true,
      lastUsedAt: '2026-06-24T12:30:00.000Z',
    });
    openAiClaudeCodeOAuthUrlMock.mockResolvedValue({ success: true });
    openCodexLoginUrlMock.mockResolvedValue({ success: true });
    cancelCodexLoginMock.mockResolvedValue({ found: true, success: true });
    getCodexLoginSessionMock.mockResolvedValue({
      error: null,
      exitCode: null,
      output: 'Open https://chatgpt.com/auth',
      sessionId: 'codex-login-1',
      state: 'running',
      url: 'https://chatgpt.com/auth',
    });
    pollAiClaudeCodeAuthStatusMock.mockResolvedValue({
      error: null,
      oauthUrl: 'https://claude.ai/oauth',
      state: 'has_url',
    });
    startAiClaudeCodeAuthMock.mockResolvedValue({
      sandboxId: 'sandbox-1',
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    startCodexLoginMock.mockResolvedValue({
      error: null,
      exitCode: null,
      output: 'Open https://chatgpt.com/auth',
      sessionId: 'codex-login-1',
      state: 'running',
      url: 'https://chatgpt.com/auth',
    });
    submitAiClaudeCodeAuthCodeMock.mockResolvedValue({ success: true });
    saveAiProviderSecretMock.mockResolvedValue({ status: 'configured' });
    deleteAiAnthropicAccountMock.mockResolvedValue(undefined);
    renameAiAnthropicAccountMock.mockResolvedValue(undefined);
    setAiAnthropicAccountActiveMock.mockResolvedValue(undefined);
    updateAiCommandMock.mockResolvedValue('/repo/.claude/commands/git/commit.md');
    updateAiCustomAgentMock.mockResolvedValue('/repo/.claude/agents/reviewer.md');
    updateAiSkillMock.mockResolvedValue('/repo/.claude/skills/doc/SKILL.md');
    readAppSettingsMock.mockResolvedValue(defaultAppSettings);
    saveAppSettingsMock.mockResolvedValue(defaultAppSettings);
    gitProbeMock.mockResolvedValue({
      branch: null,
      gitAvailable: true,
      isRepository: false,
      rootPath: '/repo',
    });
    gitRemoteInfoMock.mockResolvedValue({
      remoteUrl: null,
      webUrl: null,
    });
    gitSyncNowMock.mockResolvedValue({
      lastSyncedAt: '2026-06-21T15:30:00.000Z',
      status: {
        rootPath: '/repo',
        branch: 'main',
        upstream: 'origin/main',
        ahead: 0,
        behind: 0,
        changes: [],
      },
    });
    ensureWorkspaceMock.mockResolvedValue({
      schemaVersion: 1,
      recentDocumentPaths: [],
      expandedPaths: [],
      sortOrder: {},
      gitSync: {
        conflictResolution: 'abort',
        enabled: true,
        intervalMinutes: 10,
        lastSyncedAt: null,
      },
      dailyNotes: {
        selectedDate: null,
        entries: {},
      },
    });
    recordRecentDocumentMock.mockResolvedValue([]);
    listDailyNotesForMonthMock.mockResolvedValue({
      month: '2026-06',
      entries: [],
    });
  });

  it('shows empty workspace action before selecting folder', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(
      screen.getAllByRole('button', { name: '选择文件夹' }).length,
    ).toBeGreaterThan(0);
  });

  it('does not duplicate the empty workspace action in the sidebar document area', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(
      screen.queryByText('选择一个包含 Markdown 文档的文件夹。'),
    ).toBeNull();
  });

  it('filters documents by title', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开侧边栏搜索' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索' }), '项目');

    expect(screen.getByText('项目说明')).toBeTruthy();
  });

  it('expands and restores the sidebar search field naturally', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByRole('searchbox', { name: '搜索' })).toBeNull();
    expect(screen.getByTestId('workspace-sidebar-search-panel').className).toContain(
      'opacity-0',
    );

    await user.click(screen.getByRole('button', { name: '展开侧边栏搜索' }));

    expect(await screen.findByRole('searchbox', { name: '搜索' })).toBeTruthy();
    expect(screen.getByTestId('workspace-sidebar-search-panel').className).toContain(
      'opacity-100',
    );

    await user.click(document.body);

    expect(screen.queryByRole('searchbox', { name: '搜索' })).toBeNull();
    expect(screen.getByTestId('workspace-sidebar-search-panel').className).toContain(
      'opacity-0',
    );
  });

  it('opens a daily note from the sidebar calendar', async () => {
    const user = userEvent.setup();
    const dailyNode = {
      id: 'Daily/2026/06/2026-06-20.md',
      name: '2026-06-20.md',
      kind: 'document' as const,
      relativePath: 'Daily/2026/06/2026-06-20.md',
      absolutePath: '/repo/Daily/2026/06/2026-06-20.md',
      title: '2026-06-20',
    };

    listDailyNotesForMonthMock.mockResolvedValue({
      month: '2026-06',
      entries: [
        {
          date: '2026-06-20',
          documentPath: '/repo/Daily/2026/06/2026-06-20.md',
          hasContent: true,
          updatedAt: 1,
        },
      ],
    });
    openDailyNoteMock.mockResolvedValue({
      node: dailyNode,
      content: markdownDocument({
        path: '/repo/Daily/2026/06/2026-06-20.md',
        title: '2026-06-20',
      }),
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/Daily/2026/06/2026-06-20.md',
      title: '2026-06-20',
    }));
    loadWorkspaceTreeMock.mockResolvedValue({
      ...snapshot,
      nodes: [...snapshot.nodes, dailyNode],
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(await screen.findByTestId('daily-note-marker-2026-06-20')).toBeTruthy();
    await user.click(screen.getByTestId('daily-note-day-2026-06-20'));

    await waitFor(() => {
      expect(openDailyNoteMock).toHaveBeenCalledWith('/repo', '2026-06-20');
    });
    expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/Daily/2026/06/2026-06-20.md',
    );
    expect(await screen.findByRole('tab', { name: /2026-06-20/ })).toBeTruthy();
  });

  it('keeps sidebar system entry hover backgrounds inset from the divider', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('daily-note-entry').className).toContain(
      'w-[calc(100%-0.75rem)]',
    );
    expect(screen.getByTestId('workspace-views-entry').className).toContain(
      'w-[calc(100%-0.75rem)]',
    );
    expect(screen.getByRole('button', { name: '打开设置' }).className).toContain(
      'w-[calc(100%-0.75rem)]',
    );
  });

  it('opens a sidebar document in the file manager from the context menu', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('项目说明'),
    });
    await user.click(screen.getByRole('menuitem', { name: '在文件夹中打开' }));

    expect(openPathInFileManagerMock).toHaveBeenCalledWith('/repo/README.md');
  });

  it('opens a sidebar document in the preferred editor from the context menu', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('项目说明'),
    });
    await user.click(screen.getByRole('menuitem', { name: '在 Cursor 中打开' }));

    expect(openPathInPreferredEditorMock).toHaveBeenCalledWith(
      '/repo/README.md',
      'cursor',
    );
  });

  it('renders the selected daily calendar day without a square today backing', () => {
    const today = formatTestDailyDate(new Date());

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const selectedDay = screen.getByTestId(`daily-note-day-${today}`);
    const selectedCell = selectedDay.closest('[data-selected]');

    expect(selectedDay.className).toContain(
      'data-[selected-single=true]:bg-primary/10',
    );
    expect(selectedCell?.className).not.toContain('bg-muted');
    expect(selectedCell?.className).toContain('bg-transparent');
  });

  it('collapses and restores the sidebar calendar from the compact summary', async () => {
    const user = userEvent.setup();

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const toggle = screen.getByTestId('daily-note-calendar-toggle');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);

    expect(
      screen.getByRole('button', { name: '展开日历' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
    expect(
      window.localStorage.getItem('madora:workspace:daily-calendar-collapsed'),
    ).toBe('true');
    expect(screen.getByText(formatTestDailyDate(new Date()))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '展开日历' }));

    expect(
      screen.getByRole('button', { name: '收起日历' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
    expect(
      window.localStorage.getItem('madora:workspace:daily-calendar-collapsed'),
    ).toBe('false');
  });

  it('restores the collapsed sidebar calendar preference', () => {
    window.localStorage.setItem(
      'madora:workspace:daily-calendar-collapsed',
      'true',
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(
      screen.getByTestId('daily-note-calendar-toggle').getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
    expect(screen.getByRole('button', { name: '展开日历' })).toBeTruthy();
  });

  it('opens today from the pinned schedule entry and hides the Daily system folder', async () => {
    const user = userEvent.setup();
    const today = formatTestDailyDate(new Date());
    const dailyNode = {
      id: `Daily/${today}.md`,
      name: `${today}.md`,
      kind: 'document' as const,
      relativePath: `Daily/${today}.md`,
      absolutePath: `/repo/Daily/${today}.md`,
      title: today,
    };

    openDailyNoteMock.mockResolvedValue({
      node: dailyNode,
      content: markdownDocument({
        path: dailyNode.absolutePath,
        title: today,
      }),
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: dailyNode.absolutePath,
      title: today,
    }));
    loadWorkspaceTreeMock.mockResolvedValue({
      ...dailyDirectorySnapshot,
      nodes: [...dailyDirectorySnapshot.nodes, dailyNode],
    });

    render(<WorkspaceLayout initialSnapshot={dailyDirectorySnapshot} />);

    expect(screen.getByTestId('daily-note-entry').textContent).toContain('日程');
    expect(screen.queryByTestId('tree-node-Daily')).toBeNull();
    expect(screen.getByText('项目说明')).toBeTruthy();

    await user.click(screen.getByTestId('daily-note-entry'));

    await waitFor(() => {
      expect(openDailyNoteMock).toHaveBeenCalledWith('/repo', today);
    });
    expect(await screen.findByRole('tab', { name: new RegExp(today) })).toBeTruthy();
  });

  it('hides dot-prefixed directories from the sidebar tree', async () => {
    const dotDirectorySnapshot: WorkspaceSnapshot = {
      ...directorySnapshot,
      nodes: [
        {
          id: '.madora',
          name: '.madora',
          kind: 'directory',
          relativePath: '.madora',
          absolutePath: '/repo/.madora',
          children: [
            {
              id: 'hidden-settings',
              name: 'settings.md',
              kind: 'document',
              relativePath: '.madora/settings.md',
              absolutePath: '/repo/.madora/settings.md',
              title: '隐藏设置',
            },
          ],
        },
        {
          ...directorySnapshot.nodes[0],
          children: [
            ...(directorySnapshot.nodes[0].children ?? []),
            {
              id: '.drafts',
              name: '.drafts',
              kind: 'directory',
              relativePath: 'Guides/.drafts',
              absolutePath: '/repo/Guides/.drafts',
              children: [
                {
                  id: 'hidden-draft',
                  name: 'draft.md',
                  kind: 'document',
                  relativePath: 'Guides/.drafts/draft.md',
                  absolutePath: '/repo/Guides/.drafts/draft.md',
                  title: '隐藏草稿',
                },
              ],
            },
          ],
        },
        ...snapshot.nodes,
      ],
    };

    render(<WorkspaceLayout initialSnapshot={dotDirectorySnapshot} />);

    expect(screen.queryByTestId('tree-node-.madora')).toBeNull();
    expect(screen.queryByTestId('tree-node-.drafts')).toBeNull();
    expect(screen.queryByText('隐藏设置')).toBeNull();
    expect(screen.queryByText('隐藏草稿')).toBeNull();
    expect(screen.getByTestId('tree-node-guides')).toBeTruthy();
    expect(screen.getByText('项目说明')).toBeTruthy();
  });

  it('opens the workspace views page from the sidebar system entry', async () => {
    const user = userEvent.setup();
    const viewsSnapshot = {
      ...multiDocumentSnapshot,
      nodes: multiDocumentSnapshot.nodes.map((node, index) => ({
        ...node,
        createdAt: index === 0 ? 10 : 20,
        updatedAt: index === 0 ? 30 : 40,
        pinned: index === 1,
        locked: index === 0,
      })),
    } as WorkspaceSnapshot;
    loadWorkspaceTreeMock.mockResolvedValue(viewsSnapshot);

    render(<WorkspaceLayout initialSnapshot={viewsSnapshot} />);

    await user.click(screen.getByTestId('workspace-views-entry'));

    expect(screen.getByRole('heading', { name: '视图' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /名称/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /位置/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /创建时间/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /更新时间/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /置顶/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /锁定/ })).toBeTruthy();
    expect(screen.getByTestId('workspace-view-sort-icon-name')).toBeTruthy();
    expect(screen.getByTestId('workspace-view-sort-icon-pinned')).toBeTruthy();

    const viewsPage = screen.getByTestId('workspace-views-page');
    const documentLink = within(viewsPage).getByRole('button', { name: '文档 A' });

    expect(documentLink.getAttribute('data-variant')).toBe('link');
    expect(within(viewsPage).getByText('已置顶').closest('button')?.getAttribute('data-variant'))
      .toBe('pill');
    expect(within(viewsPage).getByText('只读').closest('button')?.getAttribute('data-variant'))
      .toBe('pill');

    const refreshButton = screen.getByRole('button', { name: '刷新视图' });

    expect(refreshButton.getAttribute('data-align')).toBe('right-rail');
    await user.click(refreshButton);
    expect(refreshButton.getAttribute('data-refreshing')).toBe('true');

    await user.click(screen.getByRole('button', { name: '搜索视图' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索视图' }), '文档 B');

    expect(within(viewsPage).getByText('文档 B')).toBeTruthy();
    expect(within(viewsPage).queryByText('文档 A')).toBeNull();
  });

  it('opens pinned items from the macOS chrome and unpins them inline', async () => {
    const user = userEvent.setup();
    const pinnedSnapshot = {
      ...directorySnapshot,
      nodes: [
        {
          ...directorySnapshot.nodes[0],
          children: directorySnapshot.nodes[0].children?.map((child) =>
            child.id === 'advanced' ? { ...child, pinned: true } : child,
          ),
        },
        {
          id: 'readme',
          name: 'README.md',
          kind: 'document',
          relativePath: 'README.md',
          absolutePath: '/repo/README.md',
          title: '项目说明',
          pinned: true,
        },
      ],
    } as WorkspaceSnapshot;
    setWorkspaceNodeStateMock.mockResolvedValueOnce({
      ...pinnedSnapshot,
      nodes: pinnedSnapshot.nodes.map((node) =>
        node.id === 'readme' ? { ...node, pinned: false } : node,
      ),
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/README.md',
      title: '项目说明',
    }));

    render(<WorkspaceLayout initialSnapshot={pinnedSnapshot} />);

    expect(screen.queryByTestId('tree-row-advanced')).toBeNull();

    await user.click(screen.getByRole('button', { name: '打开置顶内容' }));

    const pinnedMenu = screen.getByTestId('pinned-chrome-menu');

    expect(within(pinnedMenu).getByText('置顶')).toBeTruthy();
    expect(within(pinnedMenu).getByRole('button', { name: '打开目录 Advanced' }))
      .toBeTruthy();

    await user.click(within(pinnedMenu).getByRole('button', {
      name: '打开文档 项目说明',
    }));

    expect(await screen.findByRole('tab', { name: '项目说明' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开置顶内容' }));
    await user.click(within(screen.getByTestId('pinned-chrome-menu')).getByRole(
      'button',
      { name: '打开目录 Advanced' },
    ));

    expect(await screen.findByTestId('tree-row-advanced')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开置顶内容' }));
    const item = within(screen.getByTestId('pinned-chrome-menu')).getByRole(
      'button',
      { name: '打开文档 项目说明' },
    );

    await user.hover(item);
    await user.click(within(screen.getByTestId('pinned-chrome-menu')).getByRole(
      'button',
      { name: '取消置顶 项目说明' },
    ));

    expect(setWorkspaceNodeStateMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/README.md',
      { pinned: false },
    );
  });

  it('opens locked documents in read-only editor mode and switches back from metadata status', async () => {
    const user = userEvent.setup();
    const lockedSnapshot = {
      ...snapshot,
      nodes: [
        {
          ...snapshot.nodes[0],
          locked: true,
        },
      ],
    } as WorkspaceSnapshot;

    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/README.md',
      title: '项目说明',
    }));
    setWorkspaceNodeStateMock.mockResolvedValueOnce({
      ...lockedSnapshot,
      nodes: [
        {
          ...snapshot.nodes[0],
          locked: false,
        },
      ],
    });

    render(<WorkspaceLayout initialSnapshot={lockedSnapshot} />);

    await user.click(screen.getByText('项目说明'));

    expect(
      (await screen.findByTestId('markdown-editor')).getAttribute(
        'data-read-only',
      ),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    const metaPanel = await screen.findByTestId('document-meta-panel');

    expect(within(metaPanel).getByText('模式')).toBeTruthy();
    const metaPanelText = metaPanel.textContent ?? '';

    expect(metaPanelText.indexOf('编码')).toBeLessThan(
      metaPanelText.indexOf('模式'),
    );

    await user.click(within(metaPanel).getByRole('button', {
      name: '切换为编辑模式',
    }));

    expect(screen.getByTestId('markdown-editor').getAttribute('data-read-only'))
      .toBe('false');
  });

  it('does not reopen the active preview document when clicking inside it', async () => {
    const user = userEvent.setup();
    const lockedSnapshot = {
      ...snapshot,
      nodes: [
        {
          ...snapshot.nodes[0],
          locked: true,
        },
      ],
    } as WorkspaceSnapshot;

    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/README.md',
      title: '项目说明',
    }));

    render(<WorkspaceLayout initialSnapshot={lockedSnapshot} />);

    await user.click(screen.getByText('项目说明'));

    const editor = await screen.findByTestId('markdown-editor');
    expect(editor.getAttribute('data-read-only')).toBe('true');
    expect(readMarkdownDocumentMock).toHaveBeenCalledTimes(1);

    await user.click(editor);

    expect(readMarkdownDocumentMock).toHaveBeenCalledTimes(1);
  });

  it('opens documents in tabs and switches from the tab bar', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));

    expect(await screen.findByRole('tab', { name: /文档 A/ })).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /文档 B/ }).getAttribute('aria-selected'),
    ).toBe('true');

    await user.click(screen.getByRole('tab', { name: /文档 A/ }));

    expect(readMarkdownDocumentMock).toHaveBeenLastCalledWith(
      '/repo',
      '/repo/a.md',
    );
  });

  it('uses the 1Code Quick Switch preference to swap Ctrl+Tab targets', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        ctrlTabTarget: 'agents',
      },
    });
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }));
    const user = userEvent.setup();

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);
    await waitFor(() => expect(readAppSettingsMock).toHaveBeenCalled());

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    expect(
      screen.getByRole('tab', { name: /文档 B/ }).getAttribute('aria-selected'),
    ).toBe('true');

    fireEvent.keyDown(window, { ctrlKey: true, key: 'Tab' });
    expect(await screen.findByTestId('ai-panel-island')).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /文档 B/ }).getAttribute('aria-selected'),
    ).toBe('true');

    fireEvent.keyDown(window, { altKey: true, ctrlKey: true, key: 'Tab' });
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /文档 A/ }).getAttribute('aria-selected'),
      ).toBe('true');
    });
  });

  it('uses the 1Code Quick Switch default to keep Ctrl+Tab on workspace tabs', async () => {
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockResolvedValueOnce(markdownDocument({
        path: '/repo/a.md',
        title: '文档 A',
      }));
    const user = userEvent.setup();

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    expect(
      screen.getByRole('tab', { name: /文档 B/ }).getAttribute('aria-selected'),
    ).toBe('true');

    fireEvent.keyDown(window, { ctrlKey: true, key: 'Tab' });
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /文档 A/ }).getAttribute('aria-selected'),
      ).toBe('true');
    });
    expect(screen.queryByTestId('ai-panel-island')).toBeNull();

    fireEvent.keyDown(window, { altKey: true, ctrlKey: true, key: 'Tab' });
    expect(await screen.findByTestId('ai-panel-island')).toBeTruthy();
  });

  it('does not show split actions in the tab context menu', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/a.md',
      title: '文档 A',
    }));

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));

    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('tab', { name: /文档 A/ }),
    });

    expect(await screen.findByRole('menuitem', { name: '关闭' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '向右拆分' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '向下拆分' })).toBeNull();
  });

  it('keeps cached editor visible while reactivating an already opened tab', async () => {
    const user = userEvent.setup();
    let resolveReloadA:
      | ((value: ReturnType<typeof markdownDocument>) => void)
      | null = null;
    const reloadA = new Promise<ReturnType<typeof markdownDocument>>((resolve) => {
      resolveReloadA = resolve;
    });
    readMarkdownDocumentMock
      .mockResolvedValueOnce(markdownDocument({
        body: 'A body',
        path: '/repo/a.md',
        title: '文档 A',
      }))
      .mockResolvedValueOnce(markdownDocument({
        body: 'B body',
        path: '/repo/b.md',
        title: '文档 B',
      }))
      .mockReturnValueOnce(reloadA);

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    await user.click(screen.getByRole('tab', { name: /文档 A/ }));

    expect(screen.queryByText('正在打开文档...')).toBeNull();
    expect(screen.getByTestId('markdown-editor').getAttribute('data-markdown'))
      .toEqual(expect.stringContaining('文档 A'));

    resolveReloadA?.(markdownDocument({
      body: 'A body',
      path: '/repo/a.md',
      title: '文档 A',
    }));
  });

  it('keeps the editor key stable while editing active content', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockImplementation(async (_rootPath, documentPath) =>
      markdownDocument({
        body: documentPath === '/repo/a.md' ? 'A body' : 'B body',
        path: documentPath,
        title: documentPath === '/repo/a.md' ? '文档 A' : '文档 B',
      }),
    );

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByText('文档 A'));
    await user.click(screen.getByText('文档 B'));
    const editor = await screen.findByTestId('markdown-editor');
    const initialKey = editor.getAttribute('data-document-key');

    await user.click(screen.getByText('模拟编辑器输入'));

    expect(screen.getByTestId('markdown-editor').getAttribute('data-document-key'))
      .toBe(initialKey);
  });

  it('shows a polished directory page and opens document cards', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '正文',
      path: '/repo/Guides/intro.md',
      title: '入门指南',
    }));

    render(<WorkspaceLayout initialSnapshot={directorySnapshot} />);

    await user.click(screen.getByText('Guides'));

    const editorPane = within(screen.getByTestId('editor-pane-content'));

    expect(screen.getByRole('heading', { name: 'Guides' })).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索当前目录下的文档')).toBeTruthy();
    expect(editorPane.getByRole('button', { name: /入门指南/ })).toBeTruthy();
    expect(editorPane.getByRole('button', { name: /Advanced/ })).toBeTruthy();

    await user.click(editorPane.getByRole('button', { name: '列表视图' }));

    expect(
      editorPane
        .getByRole('button', { name: '列表视图' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    await user.type(screen.getByPlaceholderText('搜索当前目录下的文档'), '部署');

    expect(editorPane.getByRole('button', { name: /部署说明/ })).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索当前目录下的文档'));
    await user.click(editorPane.getByRole('button', { name: /入门指南/ }));

    expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/Guides/intro.md',
    );
  });

  it('switches from directory panel to Git panel and loads diff', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.md',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitDiffMock.mockResolvedValue({
      binary: false,
      content: '@@ -1 +1 @@\n-old\n+new',
      path: 'README.md',
      staged: false,
      truncated: false,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
    await user.click(
      await screen.findByRole('button', { name: /README.md/ }),
    );

    expect(screen.getByText('-old')).toBeTruthy();
    expect(screen.getByText('+new')).toBeTruthy();
  });

  it('reverts a changed file from the Git context menu', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.md',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitRevertFileMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: null,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));

    const changeRow = await screen.findByRole('button', {
      name: /README.md/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '回滚' }));
    await user.click(await screen.findByRole('button', { name: '确认回滚' }));

    expect(gitRevertFileMock).toHaveBeenCalledWith('/repo', 'README.md');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /README.md/ }),
      ).toBeNull();
    });
  });

  it('stages a changed file from the Git context menu', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.md',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });
    gitStageMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: 'M',
          oldPath: null,
          path: 'README.md',
          staged: true,
          workingTreeStatus: '',
        },
      ],
      rootPath: '/repo',
      upstream: null,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));

    const changeRow = await screen.findByRole('button', {
      name: /README.md/,
    });

    await user.pointer({
      keys: '[MouseRight]',
      target: changeRow,
    });
    await user.click(await screen.findByRole('menuitem', { name: '暂存' }));

    expect(gitStageMock).toHaveBeenCalledWith('/repo', ['README.md']);
  });

  it('commits and pushes selected Git files', async () => {
    const user = userEvent.setup();
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitStatusMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [
        {
          changeType: 'modified',
          indexStatus: '',
          oldPath: null,
          path: 'README.md',
          staged: false,
          workingTreeStatus: 'M',
        },
      ],
      rootPath: '/repo',
      upstream: 'origin/main',
    });
    gitCommitMock.mockResolvedValue({
      ahead: 1,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: 'origin/main',
    });
    gitPushMock.mockResolvedValue({
      ahead: 0,
      behind: 0,
      branch: 'main',
      changes: [],
      rootPath: '/repo',
      upstream: 'origin/main',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 面板' }));
    await user.type(await screen.findByLabelText('提交信息'), 'docs: update readme');
    await user.click(screen.getByRole('button', { name: '提交并推送' }));

    expect(gitCommitMock).toHaveBeenCalledWith('/repo', 'docs: update readme', [
      'README.md',
    ]);
    expect(gitPushMock).toHaveBeenCalledWith('/repo');
  });

  it('opens the bottom Git log drawer from the left rail', async () => {
    const user = userEvent.setup();
    gitBranchesMock.mockResolvedValue([
      {
        commit: 'abc123',
        current: true,
        fullName: 'refs/heads/main',
        kind: 'local',
        name: 'main',
        upstream: 'origin/main',
      },
    ]);
    gitLogMock.mockResolvedValue([
      {
        authorEmail: 'refinex@example.com',
        authorName: 'refinex',
        authoredAt: '2026-06-02T19:00:00Z',
        body: '提交详情',
        hash: 'abc123abc123',
        refs: ['HEAD -> main'],
        shortHash: 'abc123',
        subject: 'feat: git log drawer',
      },
    ]);
    gitCommitFilesMock.mockResolvedValue([
      {
        changeType: 'modified',
        oldPath: null,
        path: 'components/workspace/git-log-drawer.tsx',
        status: 'M',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 日志' }));

    const gitLogDrawer = await screen.findByTestId('git-log-drawer');

    expect(gitLogDrawer).toBeTruthy();
    expect(gitLogDrawer.className).not.toContain('rounded-lg');
    expect(gitLogDrawer.className).not.toContain('shadow-sm');
    expect(gitLogDrawer.className).toContain('border-t');
    expect(screen.getAllByText('feat: git log drawer').length).toBeGreaterThan(1);
    expect(screen.getByText('git-log-drawer.tsx')).toBeTruthy();
    expect(gitBranchesMock).toHaveBeenCalledWith('/repo');
    expect(gitLogMock).toHaveBeenCalledWith('/repo');
    expect(gitCommitFilesMock).toHaveBeenCalledWith('/repo', 'abc123abc123');

    const heightHandle = screen.getByRole('separator', {
      name: '调整 Git 日志高度',
    });
    expect(
      within(gitLogDrawer).queryByRole('separator', {
        name: '调整 Git 日志高度',
      }),
    ).toBeNull();
    fireEvent.pointerDown(heightHandle, { clientY: 700, pointerId: 1 });
    await waitFor(() =>
      expect(heightHandle.getAttribute('data-dragging')).toBe('true'),
    );
    fireEvent.pointerMove(document, { clientY: 580, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    const storedHeight = window.localStorage.getItem(
      'madora:workspace:git-log-height',
    );

    expect(storedHeight).not.toBeNull();
    expect(screen.getByTestId('git-log-drawer').style.height).toBe(
      `${storedHeight}px`,
    );
  });

  it('opens commit file diff from the Git log drawer in the editor block', async () => {
    const user = userEvent.setup();
    gitBranchesMock.mockResolvedValue([
      {
        commit: 'abc123',
        current: true,
        fullName: 'refs/heads/main',
        kind: 'local',
        name: 'main',
        upstream: 'origin/main',
      },
    ]);
    gitLogMock.mockResolvedValue([
      {
        authorEmail: 'refinex@example.com',
        authorName: 'refinex',
        authoredAt: '2026-06-02T19:00:00Z',
        body: '',
        hash: 'abc123abc123',
        refs: ['HEAD -> main'],
        shortHash: 'abc123',
        subject: 'feat: git log drawer',
      },
    ]);
    gitCommitFilesMock.mockResolvedValue([
      {
        changeType: 'modified',
        oldPath: null,
        path: 'components/workspace/git-log-drawer.tsx',
        status: 'M',
      },
    ]);
    gitCommitFileDiffMock.mockResolvedValue({
      binary: false,
      content: 'diff --git a/components/workspace/git-log-drawer.tsx b/components/workspace/git-log-drawer.tsx',
      path: 'components/workspace/git-log-drawer.tsx',
      staged: false,
      truncated: false,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开 Git 日志' }));
    await user.click(
      await screen.findByRole('button', { name: /git-log-drawer.tsx/ }),
    );

    expect(gitCommitFileDiffMock).toHaveBeenCalledWith(
      '/repo',
      'abc123abc123',
      'components/workspace/git-log-drawer.tsx',
    );
    expect(await screen.findByText('提交差异')).toBeTruthy();
  });

  it('opens the AI panel from the right tool rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('right-tool-rail')).toBeTruthy();
    expect(screen.getByTestId('ai-panel-icon')).toBeTruthy();
    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
    expect(screen.queryByRole('button', { name: '快捷动作' })).toBeNull();

    const aiButton = screen.getByRole('button', { name: '展开 AI 面板' });
    expect(aiButton.getAttribute('disabled')).toBeNull();

    await user.click(aiButton);

    expect(await screen.findByTestId('ai-panel-island')).toBeTruthy();
    expect(screen.getByRole('button', { name: '快捷动作' })).toBeTruthy();
  });

  it('toggles the AI panel from the right rail', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByTestId('ai-panel-icon-button'));
    expect(await screen.findByTestId('ai-panel-island')).toBeTruthy();
    await user.click(screen.getByTestId('ai-panel-icon-button'));

    expect(screen.queryByTestId('ai-panel-island')).toBeNull();
  });

  it('shows document metadata, resources, and downloads a resource from the right rail', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: [
        '你好 世界',
        '',
        '![cover](madora-asset://asset-img)',
        '![Octarine](https://octarine.app/img/og/base.png)',
      ].join('\n'),
    }));
    resolveWorkspaceAssetMock.mockResolvedValue({
      absolutePath: '/repo/.madora/assets/files/as/asset-img.png',
      id: 'asset-img',
      mediaType: 'image/png',
      name: 'cover.png',
      size: 2048,
    });
    readWorkspaceAssetDataMock.mockResolvedValue({
      base64Data: 'cG5n',
      id: 'asset-img',
      mediaType: 'image/png',
      name: 'cover.png',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    selectWorkspaceAssetDownloadPathMock
      .mockResolvedValueOnce('/Downloads/cover.png')
      .mockResolvedValueOnce('/Downloads/base.png');
    writeExportFileMock.mockResolvedValue('/Downloads/cover.png');

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    const metaPanel = await screen.findByTestId('document-meta-panel');

    expect(metaPanel).toBeTruthy();
    expect(within(metaPanel).queryByText('文档信息')).toBeNull();
    expect(within(metaPanel).getByRole('button', { name: '元信息' })).toBeTruthy();
    expect(
      within(metaPanel).getByRole('button', { name: '元信息' }).parentElement
        ?.parentElement?.className,
    ).toContain('py-1');
    expect(
      within(metaPanel).getByRole('button', { name: '元信息' }).className,
    ).toContain('h-6');
    expect(within(metaPanel).getAllByText('项目说明').length).toBeGreaterThan(
      0,
    );
    expect(within(metaPanel).getByText('词数')).toBeTruthy();
    expect(within(metaPanel).getByText('行数')).toBeTruthy();
    expect(within(metaPanel).getByText('字符')).toBeTruthy();
    expect(within(metaPanel).getByText('编码')).toBeTruthy();
    expect(within(metaPanel).getByText('UTF-8')).toBeTruthy();
    expect(within(metaPanel).getByText('2 个')).toBeTruthy();
    const metaPanelText = metaPanel.textContent ?? '';
    expect(metaPanelText.indexOf('资源数')).toBeLessThan(
      metaPanelText.indexOf('词数'),
    );
    expect(metaPanelText.indexOf('编码')).toBeLessThan(
      metaPanelText.indexOf('Frontmatter'),
    );
    expect(
      metaPanel.querySelector('.grid.grid-cols-2.gap-2.rounded-xl'),
    ).toBeNull();
    expect(within(metaPanel).getByText('Frontmatter')).toBeTruthy();
    expect(within(metaPanel).getByText('createdAt')).toBeTruthy();
    expect(
      within(metaPanel).getByText('2026-06-01T00:00:00.000Z'),
    ).toBeTruthy();
    expect(within(metaPanel).getByText('updatedAt')).toBeTruthy();
    expect(within(metaPanel).getByText('refinexDialect')).toBeTruthy();
    expect(within(metaPanel).getByText('title')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '资源 2' }));

    expect(await screen.findByText('cover.png')).toBeTruthy();
    expect(await screen.findByText('base.png')).toBeTruthy();

    await user.hover(screen.getByText('cover.png'));
    await user.click(screen.getByRole('button', { name: '查看资源 cover.png' }));

    const previewDialog = await screen.findByRole('dialog', {
      name: '查看资源 cover.png',
    });

    expect(within(previewDialog).getByRole('img', { name: 'cover.png' }))
      .toBeTruthy();
    await user.click(within(previewDialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: '查看资源 cover.png' }),
      ).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: '下载资源 cover.png' }));

    await waitFor(() => {
      expect(selectWorkspaceAssetDownloadPathMock).toHaveBeenCalledWith(
        'cover.png',
        'image/png',
      );
      expect(writeExportFileMock).toHaveBeenCalledWith(
        '/Downloads/cover.png',
        'cG5n',
      );
    });

    await user.click(screen.getByRole('button', { name: '下载资源 base.png' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://octarine.app/img/og/base.png');
      expect(selectWorkspaceAssetDownloadPathMock).toHaveBeenCalledWith(
        'base.png',
        'image/png',
      );
      expect(writeExportFileMock).toHaveBeenCalledWith(
        '/Downloads/base.png',
        'AQID',
      );
    });
  });

  it('does not keep the active right tool visually highlighted', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    expect(screen.getByTestId('ai-panel-icon-button').className).not.toContain(
      'bg-[#3574f0]',
    );
    expect(
      screen.getByTestId('document-meta-panel-icon-button').className,
    ).not.toContain('bg-[#3574f0]');
  });

  it('keeps settings out of the top-right tools and opens settings from the sidebar', async () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const rail = screen.getByTestId('right-tool-rail');

    expect(rail.className).toContain('h-11');
    expect(
      screen.queryByRole('button', { name: '打开设置菜单' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy();
  });

  it('switches app theme from the top-right quick menu', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '切换主题' }));

    expect(screen.getByRole('menuitemradio', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: '亮色' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: '暗色' })).toBeTruthy();

    await user.click(screen.getByRole('menuitemradio', { name: '暗色' }));

    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('opens appearance settings from the settings menu by default', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    expect(await screen.findByTestId('workspace-settings-page')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '设置' })).toBeNull();
    expect(screen.queryByTestId('workspace-sidebar')).toBeNull();
    expect(screen.getByTestId('workspace-settings-sidebar')).toBeTruthy();
    expect(screen.getByTestId('workspace-editor-column')).toBeTruthy();
    expect(screen.queryByTestId('workspace-editor-block')).toBeNull();
    expect(screen.getByTestId('workspace-settings-header')).toBeTruthy();
    expect(screen.queryByTestId('workspace-main-header')).toBeNull();
    expect(screen.queryByTestId('right-tool-rail')).toBeNull();
    expect(screen.queryByRole('button', { name: '搜索文档' })).toBeNull();
    expect(screen.queryByRole('button', { name: '切换主题' })).toBeNull();
    expect(screen.queryByTestId('sidebar-chrome-toggle')).toBeNull();
    expect(screen.getByRole('button', { name: '返回应用' })).toBeTruthy();
    const settingsSidebar = screen.getByTestId('workspace-settings-sidebar');
    expect(within(settingsSidebar).getByText('个人')).toBeTruthy();
    expect(within(settingsSidebar).getByText('集成')).toBeTruthy();
    expect(within(settingsSidebar).getByText('编码')).toBeTruthy();
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.queryByText('AI Assistant')).toBeNull();
    expect(screen.getByRole('button', { name: 'Models' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom Agents' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MCP Servers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'AI Account' })).toBeNull();
    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '亮色' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '暗色' })).toBeTruthy();
    expect(screen.getByTestId('theme-preview-system')).toBeTruthy();
    expect(screen.getByTestId('theme-preview-light')).toBeTruthy();
    expect(screen.getByTestId('theme-preview-dark')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '标准' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
    expect(screen.getByTestId('page-width-preview-standard')).toBeTruthy();
    expect(screen.getByTestId('page-width-preview-wide')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'UI 字体' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '文档字体' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '代码块字体' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回应用' }));

    expect(screen.queryByTestId('workspace-settings-page')).toBeNull();
    expect(screen.getByTestId('workspace-sidebar')).toBeTruthy();
    expect(screen.getByTestId('right-tool-rail')).toBeTruthy();
    expect(screen.getByTestId('workspace-editor-block')).toBeTruthy();
  });

  it('adds hover feedback to theme and page width preview cards', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const systemThemeCard = await screen.findByTestId('theme-preview-system');
    const lightThemeCard = screen.getByTestId('theme-preview-light');
    const standardWidthCard = screen.getByTestId('page-width-preview-standard');
    const wideWidthCard = screen.getByTestId('page-width-preview-wide');

    for (const card of [
      systemThemeCard,
      lightThemeCard,
      standardWidthCard,
      wideWidthCard,
    ]) {
      expect(card.className).toContain('hover:border-[#3574f0]/60');
      expect(card.className).not.toContain('hover:-translate-y-0.5');
      expect(card.className).not.toContain('hover:shadow');
      expect(card.className).not.toContain('hover:bg-[#3574f0]/5');
    }
  });

  it('uses the wide integrated settings surface for appearance and storage pages', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const appearanceShell = await screen.findByTestId(
      'appearance-settings-shell',
    );
    expect(appearanceShell.className).toContain('max-w-[1120px]');
    expect(appearanceShell.className).toContain('mx-auto');
    expect(screen.getByTestId('appearance-fonts-card').className).toContain(
      'bg-muted/30',
    );

    await user.click(screen.getByRole('button', { name: '存储' }));

    const storageShell = await screen.findByTestId('storage-settings-shell');
    expect(storageShell.className).toContain('max-w-[1120px]');
    expect(storageShell.className).toContain('mx-auto');
    expect(screen.getByTestId('storage-provider-card').className).toContain(
      'bg-muted/30',
    );
    expect(screen.getByTestId('storage-local-card').className).toContain(
      'bg-muted/30',
    );
  });

  it('opens storage settings from the settings menu', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: '存储' }));

    expect(await screen.findByTestId('workspace-settings-page')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '设置' })).toBeNull();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.getByText('本地存储配置')).toBeTruthy();
    expect(screen.getByDisplayValue('/repo/.madora/assets')).toBeTruthy();
    expect(
      screen.getByDisplayValue('madora-asset://{assetId}'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith({
      ai: defaultAiSettings,
      schemaVersion: 1,
      storage: { defaultProvider: 'local' },
      appearance: defaultAppSettings.appearance,
    });
  });

  it('opens Git Sync settings with detected remote information', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitRemoteInfoMock.mockResolvedValue({
      remoteUrl: 'git@github.com:Refinex-Space/refinex-vault.git',
      webUrl: 'https://github.com/Refinex-Space/refinex-vault',
    });
    ensureWorkspaceMock.mockResolvedValue({
      schemaVersion: 1,
      recentDocumentPaths: [],
      expandedPaths: [],
      sortOrder: {},
      gitSync: {
        conflictResolution: 'remote',
        enabled: true,
        intervalMinutes: 10,
        lastSyncedAt: '2026-06-21T15:20:00.000Z',
      },
      dailyNotes: {
        selectedDate: null,
        entries: {},
      },
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Git Sync' }));

    expect(screen.getByRole('heading', { name: 'Git Sync' })).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: '启用 Git 同步' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByTestId('git-sync-settings-shell').className).toContain(
      'max-w-[1120px]',
    );
    expect(screen.getByTestId('git-sync-settings-shell').className).toContain(
      'space-y-6',
    );
    expect(screen.getByTestId('git-sync-enable-card').className).not.toContain(
      'shadow',
    );
    expect(screen.getByTestId('git-sync-enable-card').className).not.toContain(
      'border border',
    );
    expect(screen.getByTestId('git-sync-repository-card').className).toContain(
      'bg-muted/30',
    );
    expect(
      screen.getByTestId('git-sync-repository-card').className,
    ).not.toContain('shadow');
    expect(
      screen.getByTestId('git-sync-repository-card').className,
    ).not.toContain('border border');
    expect(
      screen.getByTestId('git-sync-remote-url').textContent,
    ).toBe('git@github.com:Refinex-Space/refinex-vault.git');
    expect(screen.getByTestId('git-sync-remote-url').className).toContain(
      'break-all',
    );
    expect(screen.getByTestId('git-sync-remote-url').className).not.toContain(
      'border',
    );
    expect(
      screen.queryByDisplayValue(
        'git@github.com:Refinex-Space/refinex-vault.git',
      ),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: '打开远程仓库' }).getAttribute('href'),
    ).toBe('https://github.com/Refinex-Space/refinex-vault');
    await user.click(screen.getByRole('combobox', { name: '同步频率' }));
    expect(
      (await screen.findByTestId('git-sync-interval-content')).getAttribute(
        'data-side',
      ),
    ).toBe('bottom');
    expect(
      screen.getByRole('option', { name: '10 分钟' }).getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('git-sync-interval-content')).toBeNull();
    });
    expect(
      screen.getByRole('combobox', { name: '差异处理策略' }).textContent,
    ).toContain('远程仓库');
    expect(screen.getByTestId('git-sync-last-synced').textContent).toBe(
      '2026/06/21 23:20',
    );
    expect(screen.getByTestId('git-sync-preferences-card').className).toContain(
      'divide-y',
    );
    expect(
      screen.getByTestId('git-sync-preferences-card').className,
    ).not.toContain('shadow');
    expect(
      screen.getByTestId('git-sync-preferences-card').className,
    ).not.toContain('border border');
    expect(screen.getByTestId('git-sync-danger-zone').className).toContain(
      'bg-destructive/5',
    );
    expect(screen.getByTestId('git-sync-danger-zone').className).not.toContain(
      'shadow',
    );
  });

  it('saves Git Sync preferences and runs immediate sync from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    gitProbeMock.mockResolvedValue({
      branch: 'main',
      gitAvailable: true,
      isRepository: true,
      rootPath: '/repo',
    });
    gitRemoteInfoMock.mockResolvedValue({
      remoteUrl: 'https://github.com/Refinex-Space/refinex-vault.git',
      webUrl: 'https://github.com/Refinex-Space/refinex-vault',
    });
    saveWorkspaceGitSyncSettingsMock.mockResolvedValue({
      conflictResolution: 'local',
      enabled: true,
      intervalMinutes: 15,
      lastSyncedAt: null,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Git Sync' }));
    let finishSync!: (value: Awaited<ReturnType<typeof gitSyncNow>>) => void;
    gitSyncNowMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSync = resolve;
      }),
    );

    await user.click(screen.getByRole('combobox', { name: '同步频率' }));
    await user.click(await screen.findByRole('option', { name: '15 分钟' }));
    await user.click(screen.getByRole('combobox', { name: '差异处理策略' }));
    await user.click(await screen.findByRole('option', { name: '本地仓库' }));
    await user.click(screen.getByRole('button', { name: '立即同步' }));

    const syncButton = await screen.findByRole('button', { name: '同步中' });
    expect(syncButton.getAttribute('disabled')).not.toBeNull();
    expect(
      screen.getByTestId('git-sync-now-icon').getAttribute('class'),
    ).toContain(
      'animate-spin',
    );
    expect(
      screen
        .getByRole('combobox', { name: '同步频率' })
        .getAttribute('disabled'),
    ).toBeNull();
    expect(saveWorkspaceGitSyncSettingsMock).toHaveBeenCalledWith('/repo', {
      conflictResolution: 'local',
      enabled: true,
      intervalMinutes: 15,
      lastSyncedAt: null,
    });
    expect(gitSyncNowMock).toHaveBeenCalledWith('/repo', 'local');
    finishSync({
      lastSyncedAt: '2026-06-21T15:30:00.000Z',
      status: {
        rootPath: '/repo',
        branch: 'main',
        upstream: 'origin/main',
        ahead: 0,
        behind: 0,
        changes: [],
      },
    });
    expect(
      await screen.findByText('同步完成：2026/06/21 23:30'),
    ).toBeTruthy();
  });

  it('shows 1Code-style AI Assistant models settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    detectAiAccountsMock.mockResolvedValue([
      {
        commandPath: '/usr/local/bin/codex',
        id: 'codex',
        label: 'Codex',
        message: 'Codex app-server 可用。',
        models: [
          {
            available: true,
            id: 'codex-default',
            label: 'Codex',
            profileId: 'codex:local',
            providerId: 'codex',
            providerLabel: 'Codex',
          },
        ],
        providerId: 'codex',
        providerLabel: 'Codex',
        status: 'connected',
        transport: 'app-server',
        version: 'codex-cli 0.130.0',
      },
      {
        commandPath: '/usr/local/bin/claude',
        id: 'claude',
        label: 'Claude Code',
        message: 'Claude Code stream-json 可用。',
        models: [
          {
            available: true,
            id: 'claude-code',
            label: 'Claude Code',
            profileId: 'claude:local',
            providerId: 'claude',
            providerLabel: 'Claude',
          },
        ],
        providerId: 'claude',
        providerLabel: 'Claude',
        status: 'connected',
        transport: 'stream-json',
        version: '2.1.161 (Claude Code)',
      },
    ]);
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use this skill for Java docs.',
        description: 'AgentScope Java expert skill',
        name: 'agentscope-java-expert',
        path: '~/.claude/skills/agentscope-java-expert/SKILL.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([
      {
        argumentHint: '<message>',
        content: 'Create a commit message.',
        description: 'Commit workflow command',
        name: 'git:commit',
        path: '~/.claude/commands/git/commit.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'Reviews code changes',
        disallowedTools: ['Bash'],
        model: 'sonnet',
        name: 'reviewer',
        path: '~/.claude/agents/reviewer.md',
        pluginName: null,
        prompt: 'Review carefully.',
        source: 'user',
        tools: ['Read', 'Grep'],
      },
    ]);
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@z_ai/mcp-server'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: ['Z_AI_API_KEY'],
        groupName: 'Global',
        name: 'zai-mcp-server',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'configured',
        url: null,
      },
    ]);
    listAiPluginsMock.mockResolvedValue([
      {
        category: null,
        components: {
          agents: [{ description: 'Review code', name: 'reviewer' }],
          commands: [{ description: 'Commit workflow', name: 'commit' }],
          mcpServers: ['context7'],
          skills: [{ description: 'Document processing suite', name: 'docx' }],
        },
        description: 'Collection of document processing suite',
        homepage: null,
        isDisabled: false,
        marketplace: 'anthropic-agent-skills',
        name: 'document-skills',
        path: '~/.claude/plugins/marketplaces/anthropic/document-skills',
        source: 'anthropic-agent-skills:document-skills',
        tags: [],
        version: '0.0.0',
      },
    ]);
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    expect(await screen.findByTestId('workspace-settings-page')).toBeTruthy();
    const settingsSidebar = screen.getByTestId('workspace-settings-sidebar');
    expect(within(settingsSidebar).getByText('个人')).toBeTruthy();
    expect(within(settingsSidebar).getByText('集成')).toBeTruthy();
    expect(within(settingsSidebar).getByText('编码')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preferences' })).toBeTruthy();
    expect(screen.queryByText('AI Assistant')).toBeNull();
    expect(screen.getByRole('button', { name: 'Models' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom Agents' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'MCP Servers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'AI Account' })).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: '搜索设置' }), 'AI');

    expect(within(settingsSidebar).getByText('集成')).toBeTruthy();
    expect(within(settingsSidebar).getByText('编码')).toBeTruthy();
    expect(screen.queryByText('AI Assistant')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Models' }));

    expect(await screen.findByRole('heading', { name: 'Models' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Add or search model')).toBeTruthy();
    expect(screen.getByTestId('ai-models-settings-shell').className).toContain(
      'space-y-6',
    );
    expect(screen.getByTestId('ai-model-search-container').className).toContain(
      'px-1.5',
    );
    expect(screen.getByTestId('ai-model-search-field').className).toContain(
      'h-7',
    );
    expect(screen.getByTestId('ai-model-row-opus').className).toContain('py-3');
    expect(screen.getByTestId('ai-model-row-opus').className).not.toContain(
      'min-h-16',
    );
    expect(screen.getByTestId('ai-model-label-opus').className).toContain(
      'font-medium',
    );
    expect(screen.getByTestId('ai-model-label-opus').className).not.toContain(
      'font-semibold',
    );
    expect(screen.getByText('Opus 4.6')).toBeTruthy();
    expect(screen.getByText('Sonnet 4.6')).toBeTruthy();
    expect(screen.getByText('Haiku 4.5')).toBeTruthy();
    expect(screen.getByText('Codex 5.3')).toBeTruthy();
    expect(screen.getByText('Codex 5.2')).toBeTruthy();
    expect(screen.getByText('Codex 5.1 Max')).toBeTruthy();
    expect(screen.getByText('Anthropic Accounts')).toBeTruthy();
    expect(screen.getByText('Codex Account')).toBeTruthy();
    expect(screen.getByText('Codex Subscription')).toBeTruthy();
    expect(screen.getByText('API Keys')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByText('本地 AI 助手')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Skills' }));
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeTruthy();
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-skills-settings-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-skills-settings-shell').className).not.toContain(
      'mx-auto',
    );
    expect(screen.getByTestId('ai-skills-settings-sidebar').className).toContain(
      'bg-background',
    );
    expect(screen.getByTestId('ai-skills-search-row').className).toContain(
      'px-2',
    );
    expect(screen.getByTestId('ai-skills-search-input').className).toContain(
      'h-7',
    );
    expect(screen.getByTestId('ai-skills-search-input').className).not.toContain(
      'h-9',
    );
    expect(screen.getAllByText('agentscope-java-expert').length).toBeGreaterThan(0);
    expect(screen.getAllByText('git:commit').length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('button', { name: /agentscope-java-expert/ }))
        .getByText('@'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('button', { name: /git:commit/ })).getByText('/'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    expect(
      await screen.findByRole('heading', { name: 'Custom Agents' }),
    ).toBeTruthy();
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-agents-settings-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-agents-settings-shell').className).not.toContain(
      'mx-auto',
    );
    expect(screen.getByTestId('ai-agents-search-row').className).toContain(
      'px-2',
    );
    expect(screen.getByTestId('ai-agents-search-input').className).toContain(
      'h-7',
    );
    expect(screen.getAllByText('reviewer').length).toBeGreaterThan(0);
    expect(screen.getByText('Reviews code changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Only Selected' })).toBeTruthy();
    expect(screen.getByText('Read File')).toBeTruthy();
    expect(screen.getByText('Search Content')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'MCP Servers' }));
    expect(
      await screen.findByRole('heading', { name: 'MCP Servers' }),
    ).toBeTruthy();
    expect(screen.getAllByText('zai-mcp-server').length).toBeGreaterThan(0);
    expect(screen.getByText('stdio')).toBeTruthy();
    expect(screen.getByText('Z_AI_API_KEY')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Plugins' }));
    expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeTruthy();
    expect(screen.getAllByText('Document Skills').length).toBeGreaterThan(0);
    expect(screen.getByText('anthropic-agent-skills:document-skills')).toBeTruthy();
    expect(screen.getByText('Skills (1)')).toBeTruthy();
    expect(screen.getByText('MCP Servers (1)')).toBeTruthy();
  });

  it('shows 1Code-style Anthropic account rows with actions', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    detectAiAccountsMock.mockResolvedValue([
      {
        commandPath: '/usr/local/bin/claude',
        id: 'claude-work',
        label: 'Work Claude',
        message: 'work@example.com',
        models: [],
        providerId: 'claude',
        providerLabel: 'Claude',
        status: 'connected',
        transport: 'stream-json',
        version: '2.1.161',
      },
      {
        commandPath: '/usr/local/bin/claude',
        id: 'claude-personal',
        label: 'Personal Claude',
        message: 'personal@example.com',
        models: [],
        providerId: 'claude',
        providerLabel: 'Claude',
        status: 'detected',
        transport: 'stream-json',
        version: '2.1.161',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));

    expect(await screen.findByText('Work Claude')).toBeTruthy();
    expect(screen.getByText('work@example.com')).toBeTruthy();
    expect(screen.getByText('Personal Claude')).toBeTruthy();
    expect(screen.getByText('personal@example.com')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Switch' })).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Account actions for Work Claude' }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeTruthy();
  });

  it('switches renames and removes 1Code-style Anthropic accounts', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiAnthropicAccountsMock
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T10:00:00.000Z',
          displayName: 'Work Claude',
          email: 'work@example.com',
          id: 'acct-work',
          isActive: true,
          lastUsedAt: null,
        },
        {
          connectedAt: '2026-06-24T11:00:00.000Z',
          displayName: 'Personal Claude',
          email: 'personal@example.com',
          id: 'acct-personal',
          isActive: false,
          lastUsedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T10:00:00.000Z',
          displayName: 'Work Claude',
          email: 'work@example.com',
          id: 'acct-work',
          isActive: false,
          lastUsedAt: null,
        },
        {
          connectedAt: '2026-06-24T11:00:00.000Z',
          displayName: 'Personal Claude',
          email: 'personal@example.com',
          id: 'acct-personal',
          isActive: true,
          lastUsedAt: '2026-06-24T12:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T10:00:00.000Z',
          displayName: 'Work Claude',
          email: 'work@example.com',
          id: 'acct-work',
          isActive: false,
          lastUsedAt: null,
        },
        {
          connectedAt: '2026-06-24T11:00:00.000Z',
          displayName: 'Personal Renamed',
          email: 'personal@example.com',
          id: 'acct-personal',
          isActive: true,
          lastUsedAt: '2026-06-24T12:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T10:00:00.000Z',
          displayName: 'Work Claude',
          email: 'work@example.com',
          id: 'acct-work',
          isActive: true,
          lastUsedAt: null,
        },
      ]);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Personal Renamed');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));

    expect(await screen.findByText('Personal Claude')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Switch' }));

    await waitFor(() => {
      expect(setAiAnthropicAccountActiveMock).toHaveBeenCalledWith('acct-personal');
    });

    await user.click(
      screen.getByRole('button', { name: 'Account actions for Personal Claude' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    await waitFor(() => {
      expect(renameAiAnthropicAccountMock).toHaveBeenCalledWith(
        'acct-personal',
        'Personal Renamed',
      );
    });

    await user.click(
      screen.getByRole('button', { name: 'Account actions for Personal Renamed' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));

    await waitFor(() => {
      expect(deleteAiAnthropicAccountMock).toHaveBeenCalledWith('acct-personal');
    });
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to remove "Personal Renamed"? You will need to re-authenticate to use it again.',
    );
  });

  it('imports a 1Code-style Anthropic account from the Models Add flow', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiAnthropicAccountsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T12:30:00.000Z',
          displayName: 'Imported Claude',
          email: 'imported@example.com',
          id: 'acct-imported',
          isActive: true,
          lastUsedAt: '2026-06-24T12:30:00.000Z',
        },
      ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(await screen.findByRole('button', { name: 'Connect' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Import token manually' }));
    await user.type(screen.getByLabelText('Display name'), 'Imported Claude');
    await user.type(screen.getByLabelText('Email'), 'imported@example.com');
    await user.type(screen.getByLabelText('OAuth token'), 'oauth-token');
    await user.click(screen.getByRole('button', { name: 'Import account' }));

    await waitFor(() => {
      expect(importAiAnthropicAccountTokenMock).toHaveBeenCalledWith({
        displayName: 'Imported Claude',
        email: 'imported@example.com',
        token: 'oauth-token',
      });
    });
    expect(await screen.findByText('Imported Claude')).toBeTruthy();
    expect(screen.getByText('imported@example.com')).toBeTruthy();
  });

  it('connects Claude Code accounts with the 1Code-style OAuth modal', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiAnthropicAccountsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T12:40:00.000Z',
          displayName: 'Anthropic Account',
          email: null,
          id: 'acct-oauth',
          isActive: true,
          lastUsedAt: '2026-06-24T12:40:00.000Z',
        },
      ]);
    pollAiClaudeCodeAuthStatusMock.mockResolvedValueOnce({
      error: null,
      oauthUrl: 'https://claude.ai/oauth',
      state: 'has_url',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(await screen.findByRole('button', { name: 'Connect' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Claude Code' })).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startAiClaudeCodeAuthMock).toHaveBeenCalledTimes(1);
    });
    expect(pollAiClaudeCodeAuthStatusMock).toHaveBeenCalledWith({
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    expect(openAiClaudeCodeOAuthUrlMock).toHaveBeenCalledWith(
      'https://claude.ai/oauth',
    );

    await user.type(
      within(dialog).getByLabelText('Authentication code'),
      'oauth#code',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(submitAiClaudeCodeAuthCodeMock).toHaveBeenCalledWith({
        code: 'oauth#code',
        sandboxUrl: 'https://sandbox.example',
        sessionId: 'session-1',
      });
    });
    expect(await screen.findByText('Anthropic Account')).toBeTruthy();
  });

  it('shows and saves 1Code-style AI preferences', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Preferences' }));

    expect(
      await screen.findByRole('heading', { name: 'Preferences' }),
    ).toBeTruthy();
    expect(screen.getByTestId('ai-preferences-settings-shell').className).toContain(
      'p-6',
    );
    expect(
      screen.getByTestId('ai-preferences-settings-title').className,
    ).toContain('text-sm');
    expect(
      screen.getByTestId('ai-preferences-settings-description').className,
    ).toContain('text-xs');
    expect(screen.getByTestId('ai-preferences-row-extended-thinking').className)
      .toContain('flex');
    expect(screen.getByTestId('ai-preferences-row-extended-thinking').className)
      .toContain('justify-between');
    expect(
      screen.getByText("Configure Claude's behavior and features"),
    ).toBeTruthy();
    expect(screen.getByText('Extended Thinking')).toBeTruthy();
    expect(
      screen.getByText(
        'Enable deeper reasoning with more thinking tokens (uses more credits). Disables response streaming.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Default Mode')).toBeTruthy();
    expect(
      screen.getByText('Mode for new agents (Plan = read-only, Agent = can edit)'),
    ).toBeTruthy();
    expect(screen.getByText('Include Co-Authored-By')).toBeTruthy();
    expect(
      screen.getByText('Add "Co-authored-by: Claude" to git commits made by Claude'),
    ).toBeTruthy();
    expect(screen.getByText('Default Model')).toBeTruthy();
    expect(screen.queryByText('Default Codex Model')).toBeNull();
    expect(screen.getByText('Codex Thinking')).toBeTruthy();
    expect(screen.getByText('Desktop Notifications')).toBeTruthy();
    expect(
      screen.getByText(
        'Show system notifications when agent needs input or completes work',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Sound Notifications')).toBeTruthy();
    expect(
      screen.getByText("Play a sound when agent completes work while you're away"),
    ).toBeTruthy();
    expect(screen.getByText('Notify When Focused')).toBeTruthy();
    expect(
      screen.getByText('Show notifications even when the app window is active'),
    ).toBeTruthy();
    expect(screen.getByText('Quick Switch')).toBeTruthy();
    expect(
      screen.getByText((_, node) => node?.textContent === 'What ⌃Tab switches between'),
    ).toBeTruthy();
    expect(screen.getByText('Auto-advance')).toBeTruthy();
    expect(screen.getByText('Where to go after archiving a workspace')).toBeTruthy();
    expect(screen.getByText('Preferred Editor')).toBeTruthy();
    expect(screen.getByText('Default app for opening workspaces')).toBeTruthy();
    expect(screen.getByText('Share Usage Analytics')).toBeTruthy();
    expect(
      screen.getByText(
        'Help us improve Agents by sharing anonymous usage data. We only track feature usage and app performance–never your code, prompts, or messages. No AI training on your data.',
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('switch', { name: 'Extended Thinking' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Include Co-Authored-By' }),
    );
    expect(setAiClaudeIncludeCoAuthoredByMock).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole('combobox', { name: 'Default Mode' }));
    await user.click(await screen.findByRole('option', { name: 'Plan' }));
    await user.click(screen.getByRole('button', { name: 'Extra High' }));
    await user.click(
      screen.getByRole('switch', { name: 'Desktop Notifications' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Sound Notifications' }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Quick Switch' }));
    await user.click(await screen.findByRole('option', { name: 'Agents' }));
    await user.click(screen.getByRole('combobox', { name: 'Auto-advance' }));
    await user.click(
      await screen.findByRole('option', { name: 'Close workspace' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Preferred Editor: Cursor' }),
    );
    expect(screen.getAllByTestId('preferred-editor-icon-cursor').length).toBeGreaterThan(0);
    expect(await screen.findByTestId('preferred-editor-icon-warp')).toBeTruthy();
    await user.click(await screen.findByRole('menuitem', { name: 'Warp' }));
    expect(screen.getByTestId('preferred-editor-icon-warp')).toBeTruthy();
    await user.click(
      screen.getByRole('switch', { name: 'Share Usage Analytics' }),
    );
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: expect.objectContaining({
          analyticsOptOut: true,
          autoAdvanceTarget: 'close',
          ctrlTabTarget: 'agents',
          defaultAgentMode: 'plan',
          desktopNotificationsEnabled: false,
          extendedThinkingEnabled: false,
          includeCoAuthoredBy: false,
          lastSelectedCodexThinking: 'xhigh',
          preferredEditor: 'warp',
          soundNotificationsEnabled: false,
        }),
      }),
    );
  });

  it('shows and saves 1Code-style model API key and override settings without persisting secrets', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(screen.getByRole('button', { name: 'API Keys' }));

    expect(screen.getByText('Codex API Key')).toBeTruthy();
    expect(screen.getByText('Takes priority over subscription')).toBeTruthy();
    expect(screen.getByText('OpenAI API Key')).toBeTruthy();
    expect(
      screen.getByText('Required for voice transcription (Whisper API)'),
    ).toBeTruthy();
    expect(screen.getByText('Override Model')).toBeTruthy();
    expect(screen.getByText('Model name')).toBeTruthy();
    expect(screen.getByText('Model identifier to use for requests')).toBeTruthy();
    expect(screen.getByText('API token')).toBeTruthy();
    expect(screen.getByText('ANTHROPIC_AUTH_TOKEN env')).toBeTruthy();
    expect(screen.getByText('Base URL')).toBeTruthy();
    expect(screen.getByText('ANTHROPIC_BASE_URL env')).toBeTruthy();

    const codexInput = screen.getByLabelText('Codex API Key');
    await user.type(codexInput, 'sk-codex-test');
    fireEvent.blur(codexInput);
    await waitFor(() => {
      expect(saveAiProviderSecretMock).toHaveBeenCalledWith(
        'codex',
        'sk-codex-test',
      );
    });

    const openAiInput = screen.getByLabelText('OpenAI API Key');
    await user.type(openAiInput, 'sk-openai-test');
    fireEvent.blur(openAiInput);
    await waitFor(() => {
      expect(saveAiProviderSecretMock).toHaveBeenCalledWith(
        'openai',
        'sk-openai-test',
      );
    });

    await user.type(screen.getByLabelText('Model name'), 'claude-opus-test');
    await user.type(screen.getByLabelText('Base URL'), 'https://anthropic.test');
    const tokenInput = screen.getByLabelText('API token');
    await user.type(tokenInput, 'sk-ant-test');
    fireEvent.blur(tokenInput);

    await waitFor(() => {
      expect(saveAiProviderSecretMock).toHaveBeenCalledWith(
        'anthropic-override',
        'sk-ant-test',
      );
    });

    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: expect.objectContaining({
          customClaudeConfig: {
            baseUrl: 'https://anthropic.test',
            model: 'claude-opus-test',
          },
        }),
      }),
    );
    expect(JSON.stringify(saveAppSettingsMock.mock.calls.at(-1)?.[0])).not.toContain(
      'sk-ant-test',
    );
  });

  it('connects Codex subscription with the 1Code-style login modal', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    getCodexIntegrationMock
      .mockResolvedValueOnce({
        exitCode: 0,
        isConnected: false,
        rawOutput: 'not logged in',
        state: 'not_logged_in',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        isConnected: false,
        rawOutput: 'not logged in',
        state: 'not_logged_in',
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        isConnected: true,
        rawOutput: 'logged in using ChatGPT',
        state: 'connected_chatgpt',
      });
    getCodexLoginSessionMock.mockResolvedValueOnce({
      error: null,
      exitCode: 0,
      output: 'Logged in',
      sessionId: 'codex-login-1',
      state: 'success',
      url: 'https://chatgpt.com/auth',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));

    expect(await screen.findByText('Not connected')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Connect Codex' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Connect OpenAI Codex' }),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startCodexLoginMock).toHaveBeenCalledTimes(1);
    });
    expect(openCodexLoginUrlMock).toHaveBeenCalledWith('https://chatgpt.com/auth');

    await waitFor(() => {
      expect(getCodexLoginSessionMock).toHaveBeenCalledWith('codex-login-1');
    });
    await waitFor(() => {
      expect(getCodexIntegrationMock).toHaveBeenCalledTimes(3);
    });
  });

  it('shows 1Code-style Codex API key status when no subscription is connected', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    getCodexIntegrationMock.mockResolvedValue({
      exitCode: 0,
      isConnected: true,
      rawOutput: 'logged in using api key',
      state: 'connected_api_key',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));

    expect(await screen.findByText('Not connected to subscription')).toBeTruthy();
  });

  it('logs out Codex subscription from the Models account section', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    getCodexIntegrationMock.mockResolvedValue({
      exitCode: 0,
      isConnected: true,
      rawOutput: 'logged in using ChatGPT',
      state: 'connected_chatgpt',
    });
    detectAiAccountsMock
      .mockResolvedValueOnce([
        {
          commandPath: '/usr/local/bin/codex',
          id: 'codex',
          label: 'Codex',
          message: 'connected',
          models: [],
          providerId: 'codex',
          providerLabel: 'Codex',
          status: 'connected',
          transport: 'app-server',
          version: 'codex-cli 0.130.0',
        },
      ])
      .mockResolvedValueOnce([
        {
          commandPath: '/usr/local/bin/codex',
          id: 'codex',
          label: 'Codex',
          message: 'not logged in',
          models: [],
          providerId: 'codex',
          providerLabel: 'Codex',
          status: 'missing',
          transport: null,
          version: 'codex-cli 0.130.0',
        },
      ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(logoutCodexAccountMock).toHaveBeenCalledTimes(1);
    });
    expect(confirmSpy).toHaveBeenCalledWith('Log out from Codex on this device?');
    expect(detectAiAccountsMock).toHaveBeenCalledTimes(2);

    confirmSpy.mockRestore();
  });

  it('validates 1Code-style model API keys before saving secrets', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(screen.getByRole('button', { name: 'API Keys' }));

    const codexInput = screen.getByLabelText('Codex API Key');
    await user.type(codexInput, 'codex-token');
    fireEvent.blur(codexInput);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Invalid Codex API key format. Key should start with 'sk-'",
        ),
      ).toBeTruthy();
    });
    expect(saveAiProviderSecretMock).not.toHaveBeenCalled();
    expect((codexInput as HTMLInputElement).value).toBe('');

    const openAiInput = screen.getByLabelText('OpenAI API Key');
    await user.type(openAiInput, 'openai-token');
    fireEvent.blur(openAiInput);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Invalid OpenAI API key format. Key should start with 'sk-'",
        ),
      ).toBeTruthy();
    });
    expect(saveAiProviderSecretMock).not.toHaveBeenCalled();
  });

  it('does not persist incomplete 1Code-style override model settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Models' }));
    await user.click(screen.getByRole('button', { name: 'API Keys' }));

    await user.type(screen.getByLabelText('Model name'), 'claude-opus-test');
    await user.type(screen.getByLabelText('Base URL'), 'https://anthropic.test');
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAiProviderSecretMock).not.toHaveBeenCalledWith(
      'anthropic-override',
      expect.any(String),
    );
    expect(saveAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: expect.objectContaining({
          customClaudeConfig: {
            baseUrl: '',
            model: '',
          },
        }),
      }),
    );
  });

  it('creates updates and deletes AI skills and commands from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const docSkill = {
      content: '### Use docs\n\n- Read carefully.',
      description: 'Write docs',
      name: 'doc',
      path: '~/.claude/skills/doc/SKILL.md',
      pluginName: null,
      source: 'user' as const,
    };
    const descriptionUpdatedSkill = {
      ...docSkill,
      description: 'Write updated docs',
    };
    const updatedSkill = {
      ...descriptionUpdatedSkill,
      content: 'Use updated docs.',
    };
    const gitCommand = {
      argumentHint: '<message>',
      content: 'Commit changes.',
      description: 'Commit',
      name: 'git:commit',
      path: '.claude/commands/git/commit.md',
      pluginName: null,
      source: 'project' as const,
    };
    const updatedCommand = {
      ...gitCommand,
      argumentHint: null,
      description: 'Commit updated',
    };
    const contentUpdatedCommand = {
      ...updatedCommand,
      content: 'Commit updated changes.',
    };

    listAiSkillsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([docSkill])
      .mockResolvedValueOnce([descriptionUpdatedSkill])
      .mockResolvedValueOnce([updatedSkill])
      .mockResolvedValueOnce([updatedSkill])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    listAiCommandsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([gitCommand])
      .mockResolvedValueOnce([updatedCommand])
      .mockResolvedValueOnce([contentUpdatedCommand])
      .mockResolvedValueOnce([contentUpdatedCommand])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.type(screen.getByLabelText('Name'), 'doc');
    await user.type(screen.getByLabelText('Description'), 'Write docs');
    await user.type(screen.getByLabelText('Instructions'), 'Use docs.');
    await user.click(getSettingsCreateButton());

    expect(createAiSkillMock).toHaveBeenCalledWith('/repo', {
      content: 'Use docs.',
      description: 'Write docs',
      name: 'doc',
      source: 'user',
    });
    await waitFor(() => {
      expect(screen.getAllByText('doc').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Write updated docs');
    await user.click(screen.getByRole('button', { name: 'Edit markdown' }));
    const skillEditor = await screen.findByLabelText('Instructions');
    await user.clear(skillEditor);
    await user.type(skillEditor, 'Use updated docs.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateAiSkillMock).toHaveBeenCalledWith('/repo', {
      content: 'Use updated docs.',
      description: 'Write updated docs',
      name: 'doc',
      source: 'user',
    });

    expect(screen.getByTestId('ai-skills-delete-row').className).toContain(
      'border-t',
    );
    await user.click(screen.getByRole('button', { name: 'Delete skill' }));
    expect(deleteAiSkillMock).not.toHaveBeenCalled();
    let deleteDialog = await screen.findByRole('alertdialog');
    expect(within(deleteDialog).getByText(/Are you sure you want to delete/)).toBeTruthy();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAiSkillMock).toHaveBeenCalledWith('/repo', {
      name: 'doc',
      source: 'user',
    });

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Command (triggered via /slash)',
      }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Project: repo (.claude/commands/)',
      }),
    );
    await user.type(screen.getByLabelText('Name'), 'git/commit');
    await user.type(screen.getByLabelText('Description'), 'Commit');
    await user.type(screen.getByLabelText('Argument hint'), '<message>');
    await user.type(screen.getByLabelText('Instructions'), 'Commit changes.');
    await user.click(getSettingsCreateButton());

    expect(createAiCommandMock).toHaveBeenCalledWith('/repo', {
      argumentHint: '<message>',
      content: 'Commit changes.',
      description: 'Commit',
      name: 'git/commit',
      source: 'project',
    });
    await waitFor(() => {
      expect(screen.getAllByText('git:commit').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await user.clear(screen.getByLabelText('Argument hint'));
    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Commit updated');
    await user.click(screen.getByRole('button', { name: 'Edit markdown' }));
    const commandEditor = await screen.findByLabelText('Instructions');
    await user.clear(commandEditor);
    await user.type(commandEditor, 'Commit updated changes.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateAiCommandMock).toHaveBeenCalledWith('/repo', {
      argumentHint: null,
      content: 'Commit updated changes.',
      description: 'Commit updated',
      name: 'git:commit',
      source: 'project',
    });

    await user.click(screen.getByRole('button', { name: 'Delete command' }));
    expect(deleteAiCommandMock).not.toHaveBeenCalled();
    deleteDialog = await screen.findByRole('alertdialog');
    expect(within(deleteDialog).getByText(/Are you sure you want to delete/)).toBeTruthy();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAiCommandMock).toHaveBeenCalledWith('/repo', {
      name: 'git:commit',
      source: 'project',
    });
  });

  it('matches 1Code skill detail preview edit toggle and blur autosave', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const docSkill = {
      content: '### Use docs\n\n- Read carefully.',
      description: 'Write docs',
      name: 'doc',
      path: '~/.claude/skills/doc/SKILL.md',
      pluginName: null,
      source: 'user' as const,
    };

    listAiSkillsMock.mockResolvedValue([docSkill]);
    listAiCommandsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(await screen.findByText('Usage')).toBeTruthy();
    expect(screen.getAllByText('@doc').length).toBeGreaterThan(0);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Use docs' }),
    ).toBeTruthy();
    expect(screen.queryByText('### Use docs')).toBeNull();
    expect(screen.queryByLabelText('Instructions')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit markdown' }));
    const editor = await screen.findByLabelText('Instructions');
    expect((editor as HTMLTextAreaElement).rows).toBe(16);
    await user.clear(editor);
    await user.type(editor, 'Use updated docs.');
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(updateAiSkillMock).toHaveBeenCalledWith('/repo', {
        content: 'Use updated docs.',
        description: 'Write docs',
        name: 'doc',
        source: 'user',
      });
    });
  });

  it('matches 1Code-style skills create form placeholders and project labels', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([]);
    listAiCommandsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));
    await user.click(screen.getByTitle('Create new skill or command'));

    expect(await screen.findByRole('heading', { name: 'New Skill' })).toBeTruthy();
    expect(screen.getByPlaceholderText('my-skill')).toBeTruthy();
    expect(
      screen.getByText(
        'Will be converted to kebab-case (lowercase letters, numbers, hyphens)',
      ),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('What this skill does...')).toBeTruthy();
    const skillInstructions = screen.getByPlaceholderText(
      'Skill instructions (markdown)...',
    ) as HTMLTextAreaElement;
    expect(skillInstructions).toBeTruthy();
    expect(skillInstructions.rows).toBe(12);

    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(
      await screen.findByRole('option', {
        name: 'Project: repo (.claude/skills/)',
      }),
    ).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Command (triggered via /slash)',
      }),
    );

    expect(screen.getByPlaceholderText('my-command')).toBeTruthy();
    expect(
      screen.getByPlaceholderText('What this command does...'),
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText('Command prompt (markdown)...'),
    ).toBeTruthy();
    expect(
      (
        screen.getByPlaceholderText(
          'Command prompt (markdown)...',
        ) as HTMLTextAreaElement
      ).rows,
    ).toBe(12);

    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(
      await screen.findByRole('option', {
        name: 'Project: repo (.claude/commands/)',
      }),
    ).toBeTruthy();
  });

  it('creates updates and deletes custom agents from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const reviewerAgent = {
      description: 'Review code',
      disallowedTools: ['Bash'],
      model: 'sonnet' as const,
      name: 'reviewer',
      path: '.claude/agents/reviewer.md',
      pluginName: null,
      prompt: 'Review carefully.',
      source: 'project' as const,
      tools: ['Read', 'Grep'],
    };
    const updatedAgent = {
      ...reviewerAgent,
      description: 'Review code deeply',
      disallowedTools: [],
      model: null,
      prompt: 'Review more carefully.',
      tools: ['Read'],
    };

    listAiCustomAgentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reviewerAgent])
      .mockResolvedValueOnce([updatedAgent])
      .mockResolvedValueOnce([updatedAgent])
      .mockResolvedValueOnce([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'Custom Agents' }),
    );

    await user.click(screen.getByRole('button', { name: 'Create agent' }));
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Project (.claude/agents/)',
      }),
    );
    await user.type(screen.getByLabelText('Name'), 'reviewer');
    await user.type(screen.getByLabelText('Description'), 'Review code');
    expect(screen.queryByLabelText('Allowed tools')).toBeNull();
    expect(screen.queryByLabelText('Disallowed tools')).toBeNull();
    await user.type(screen.getByLabelText('System Prompt'), 'Review carefully.');
    await user.click(getSettingsCreateButton());

    expect(createAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      description: 'Review code',
      disallowedTools: [],
      model: 'inherit',
      name: 'reviewer',
      prompt: 'Review carefully.',
      source: 'project',
      tools: [],
    });
    await waitFor(() => {
      expect(screen.getAllByText('reviewer').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Only Selected' })).toBeTruthy();
    expect(screen.getByText('Read File')).toBeTruthy();
    expect(screen.getByText('Search Content')).toBeTruthy();
    expect(screen.getByText('Bash Commands')).toBeTruthy();
    expect(screen.queryByLabelText('Allowed tools')).toBeNull();
    expect(screen.queryByLabelText('Disallowed tools')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await user.clear(screen.getByLabelText('Description'));
    await user.type(screen.getByLabelText('Description'), 'Review code deeply');
    await user.clear(screen.getByLabelText('System Prompt'));
    await user.type(
      screen.getByLabelText('System Prompt'),
      'Review more carefully.',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      description: 'Review code deeply',
      disallowedTools: ['Bash'],
      model: 'sonnet',
      name: 'reviewer',
      prompt: 'Review more carefully.',
      source: 'project',
      tools: ['Read', 'Grep'],
    });

    await user.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(deleteAiCustomAgentMock).not.toHaveBeenCalled();
    const deleteDialog = await screen.findByRole('alertdialog');
    expect(within(deleteDialog).getByText(/Are you sure you want to delete/)).toBeTruthy();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      name: 'reviewer',
      source: 'project',
    });
  });

  it('shows 1Code-style empty state for custom agents', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiCustomAgentsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'Custom Agents' }),
    );

    expect(await screen.findByText('No agents')).toBeTruthy();
    expect(screen.getByTestId('agents-empty-sidebar-icon')).toBeTruthy();
    expect(screen.getByText('No custom agents found')).toBeTruthy();
    expect(screen.getByTestId('agents-empty-detail-icon')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create your first agent' }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Description')).toBeNull();
  });

  it('matches 1Code-style custom agents sidebar and create form', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'Review code',
        disallowedTools: ['Bash'],
        model: 'sonnet',
        name: 'reviewer',
        path: '.claude/agents/reviewer.md',
        pluginName: null,
        prompt: 'Review carefully.',
        source: 'project',
        tools: ['Read', 'Grep'],
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'Custom Agents' }),
    );

    const reviewerButton = await screen.findByRole('button', {
      name: /reviewer/,
    });
    expect(within(reviewerButton).getByText('sonnet')).toBeTruthy();
    expect(within(reviewerButton).queryByText(/\.claude\/agents/)).toBeNull();
    expect(within(reviewerButton).queryByText(/Read, Grep/)).toBeNull();

    await user.click(screen.getByTitle('Create new agent'));

    expect(
      await screen.findByRole('heading', { name: 'New Agent' }),
    ).toBeTruthy();
    expect(screen.getByTestId('ai-agents-detail-inner').className).toContain(
      'max-w-2xl',
    );
    expect(screen.getByTestId('ai-agents-detail-inner').className).toContain(
      'p-6',
    );
    expect(screen.getByRole('heading', { name: 'New Agent' }).className).toContain(
      'text-sm',
    );
    expect(
      screen.getByRole('heading', { name: 'New Agent' }).className,
    ).not.toContain('text-[18px]');
    expect(
      (screen.getByLabelText('System Prompt') as HTMLTextAreaElement).rows,
    ).toBe(12);
    expect(screen.getByPlaceholderText('my-agent')).toBeTruthy();
    expect(
      screen.getByText('Lowercase letters, numbers, and hyphens'),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText('What this agent does...')).toBeTruthy();
    expect(
      screen.getByPlaceholderText('You are a specialized agent that...'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(
      getSettingsCreateButton().disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText('Name'), 'reviewer-lite');
    expect(
      getSettingsCreateButton().disabled,
    ).toBe(false);
  });

  it('matches 1Code-style custom agent tool access selector on create and edit', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const reviewerAgent = {
      description: 'Review code',
      disallowedTools: [],
      model: 'inherit' as const,
      name: 'reviewer',
      path: '.claude/agents/reviewer.md',
      pluginName: null,
      prompt: 'Review carefully.',
      source: 'project' as const,
      tools: ['Read', 'Grep'],
    };
    const editedAgent = {
      ...reviewerAgent,
      tools: ['Read'],
    };

    listAiCustomAgentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reviewerAgent])
      .mockResolvedValueOnce([editedAgent]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'Custom Agents' }),
    );

    await user.click(screen.getByRole('button', { name: 'Create agent' }));
    expect(await screen.findByText('Tools')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All Tools' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Only Selected' }));

    expect(await screen.findByText('File Operations')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(
      screen.getByText('Agent will ONLY have access to selected tools'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Read File/ }));
    await user.click(screen.getByRole('button', { name: /Bash Commands/ }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Project (.claude/agents/)',
      }),
    );
    await user.type(screen.getByLabelText('Name'), 'reviewer');
    await user.type(screen.getByLabelText('Description'), 'Review code');
    await user.type(screen.getByLabelText('System Prompt'), 'Review carefully.');
    await user.click(getSettingsCreateButton());

    expect(createAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      description: 'Review code',
      disallowedTools: [],
      model: 'inherit',
      name: 'reviewer',
      prompt: 'Review carefully.',
      source: 'project',
      tools: ['Read', 'Bash'],
    });

    await waitFor(() => {
      expect(screen.getAllByText('reviewer').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: 'Only Selected' })).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Search Content/ }));
    expect(screen.getByText('1 selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      description: 'Review code',
      disallowedTools: [],
      model: 'inherit',
      name: 'reviewer',
      prompt: 'Review carefully.',
      source: 'project',
      tools: ['Read'],
    });
  });

  it('hides project scope controls in 1Code-style create forms without a workspace', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });

    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));
    await user.click(screen.getByTitle('Create new skill or command'));

    expect(await screen.findByRole('heading', { name: 'New Skill' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Project' })).toBeNull();
    expect(screen.queryByText('Project (.claude/skills/)')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    await user.click(screen.getByRole('button', { name: 'Create agent' }));

    expect(await screen.findByRole('heading', { name: 'New Agent' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Project' })).toBeNull();
    expect(screen.queryByText('Project (.claude/agents/)')).toBeNull();
  });

  it('shows 1Code-style empty state for skills and commands', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([]);
    listAiCommandsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(await screen.findByText('No skills or commands')).toBeTruthy();
    expect(screen.getByTestId('skills-empty-sidebar-icon')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    expect(screen.getByText('No skills or commands found')).toBeTruthy();
    expect(screen.getByTestId('skills-empty-detail-icon')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create your first skill or command' }),
    ).toBeTruthy();
  });

  it('creates user skills commands and agents without a workspace like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const globalRoot = '__global__';

    listAiSkillsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          content: '',
          description: '',
          name: 'global-skill',
          path: '~/.claude/skills/global-skill/SKILL.md',
          pluginName: null,
          source: 'user',
        },
      ])
      .mockResolvedValue([
        {
          content: '',
          description: '',
          name: 'global-skill',
          path: '~/.claude/skills/global-skill/SKILL.md',
          pluginName: null,
          source: 'user',
        },
      ]);
    listAiCommandsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          argumentHint: null,
          content: '',
          description: '',
          name: 'global-command',
          path: '~/.claude/commands/global-command.md',
          pluginName: null,
          source: 'user',
        },
      ]);
    listAiCustomAgentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          description: '',
          disallowedTools: [],
          model: null,
          name: 'global-agent',
          path: '~/.claude/agents/global-agent.md',
          pluginName: null,
          prompt: '',
          source: 'user',
          tools: [],
        },
      ])
      .mockResolvedValue([
        {
          description: '',
          disallowedTools: [],
          model: null,
          name: 'global-agent',
          path: '~/.claude/agents/global-agent.md',
          pluginName: null,
          prompt: '',
          source: 'user',
          tools: [],
        },
      ]);

    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.type(screen.getByLabelText('Name'), 'global-skill');
    expect(
      getSettingsCreateButton().disabled,
    ).toBe(false);
    await user.click(getSettingsCreateButton());
    expect(createAiSkillMock).toHaveBeenCalledWith(globalRoot, {
      content: '',
      description: '',
      name: 'global-skill',
      source: 'user',
    });

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Command (triggered via /slash)',
      }),
    );
    await user.type(screen.getByLabelText('Name'), 'global-command');
    await user.click(getSettingsCreateButton());
    expect(createAiCommandMock).toHaveBeenCalledWith(globalRoot, {
      argumentHint: null,
      content: '',
      description: '',
      name: 'global-command',
      source: 'user',
    });

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    await user.click(screen.getByRole('button', { name: 'Create agent' }));
    await user.type(screen.getByLabelText('Name'), 'global-agent');
    expect(
      getSettingsCreateButton().disabled,
    ).toBe(false);
    await user.click(getSettingsCreateButton());
    expect(createAiCustomAgentMock).toHaveBeenCalledWith(globalRoot, {
      description: '',
      disallowedTools: [],
      model: 'inherit',
      name: 'global-agent',
      prompt: '',
      source: 'user',
      tools: [],
    });
  });

  it('uses 1Code-style Scope selects only while creating skills and agents', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use docs.',
        description: 'Write docs',
        name: 'doc',
        path: '~/.claude/skills/doc/SKILL.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'Review code',
        disallowedTools: [],
        model: 'sonnet',
        name: 'reviewer',
        path: '.claude/agents/reviewer.md',
        pluginName: null,
        prompt: 'Review carefully.',
        source: 'project',
        tools: [],
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(await screen.findByText('Use docs.')).toBeTruthy();
    expect(screen.queryByText('Source')).toBeNull();
    await user.click(screen.getByTitle('Create new skill or command'));
    expect(await screen.findByRole('combobox', { name: 'Scope' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Project' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(
      await screen.findByRole('option', {
        name: 'Project: repo (.claude/skills/)',
      }),
    ).toBeTruthy();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));

    expect(await screen.findByLabelText('System Prompt')).toBeTruthy();
    expect(screen.queryByText('Source')).toBeNull();
    await user.click(screen.getByTitle('Create new agent'));
    expect(await screen.findByRole('combobox', { name: 'Scope' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Project' })).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    expect(
      await screen.findByRole('option', {
        name: 'Project (.claude/agents/)',
      }),
    ).toBeTruthy();
  });

  it('autosaves custom agent detail edits on blur like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const reviewerAgent = {
      description: 'Review code',
      disallowedTools: ['Bash'],
      model: 'sonnet' as const,
      name: 'reviewer',
      path: '.claude/agents/reviewer.md',
      pluginName: null,
      prompt: 'Review carefully.',
      source: 'project' as const,
      tools: ['Read', 'Grep'],
    };
    const descriptionUpdatedAgent = {
      ...reviewerAgent,
      description: 'Review code deeply',
    };
    const promptUpdatedAgent = {
      ...descriptionUpdatedAgent,
      prompt: 'Review more carefully.',
    };

    listAiCustomAgentsMock
      .mockResolvedValueOnce([reviewerAgent])
      .mockResolvedValueOnce([descriptionUpdatedAgent])
      .mockResolvedValueOnce([promptUpdatedAgent]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'Custom Agents' }),
    );

    const description = await screen.findByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'Review code deeply');
    fireEvent.blur(description);

    await waitFor(() => {
      expect(updateAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
        description: 'Review code deeply',
        disallowedTools: ['Bash'],
        model: 'sonnet',
        name: 'reviewer',
        prompt: 'Review carefully.',
        source: 'project',
        tools: ['Read', 'Grep'],
      });
    });

    const prompt = await screen.findByLabelText('System Prompt');
    expect((prompt as HTMLTextAreaElement).rows).toBe(16);
    await user.clear(prompt);
    await user.type(prompt, 'Review more carefully.');
    fireEvent.blur(prompt);

    await waitFor(() => {
      expect(updateAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
        description: 'Review code deeply',
        disallowedTools: ['Bash'],
        model: 'sonnet',
        name: 'reviewer',
        prompt: 'Review more carefully.',
        source: 'project',
        tools: ['Read', 'Grep'],
      });
    });
  });

  it('creates 1Code-style skills commands and agents when only name is provided', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const minimalSkill = {
      content: '',
      description: '',
      name: 'minimal-skill',
      path: '~/.claude/skills/minimal-skill/SKILL.md',
      pluginName: null,
      source: 'user' as const,
    };
    const minimalCommand = {
      argumentHint: null,
      content: '',
      description: '',
      name: 'minimal-command',
      path: '~/.claude/commands/minimal-command.md',
      pluginName: null,
      source: 'user' as const,
    };
    const minimalAgent = {
      description: '',
      disallowedTools: [],
      model: null,
      name: 'minimal-agent',
      path: '~/.claude/agents/minimal-agent.md',
      pluginName: null,
      prompt: '',
      source: 'user' as const,
      tools: [],
    };

    listAiSkillsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([minimalSkill])
      .mockResolvedValue([minimalSkill]);
    listAiCommandsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([minimalCommand]);
    listAiCustomAgentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([minimalAgent])
      .mockResolvedValue([minimalAgent]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.type(screen.getByLabelText('Name'), 'minimal-skill');
    await user.click(getSettingsCreateButton());
    expect(createAiSkillMock).toHaveBeenCalledWith('/repo', {
      content: '',
      description: '',
      name: 'minimal-skill',
      source: 'user',
    });

    await user.click(screen.getByTitle('Create new skill or command'));
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Command (triggered via /slash)',
      }),
    );
    await user.type(screen.getByLabelText('Name'), 'minimal-command');
    await user.click(getSettingsCreateButton());
    expect(createAiCommandMock).toHaveBeenCalledWith('/repo', {
      argumentHint: null,
      content: '',
      description: '',
      name: 'minimal-command',
      source: 'user',
    });

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    await user.click(screen.getByRole('button', { name: 'Create agent' }));
    await user.type(screen.getByLabelText('Name'), 'minimal-agent');
    await user.click(getSettingsCreateButton());
    expect(createAiCustomAgentMock).toHaveBeenCalledWith('/repo', {
      description: '',
      disallowedTools: [],
      model: 'inherit',
      name: 'minimal-agent',
      prompt: '',
      source: 'user',
      tools: [],
    });
  });

  it('groups AI skills commands and custom agents by source like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'User instructions.',
        description: 'User skill',
        name: 'user-skill',
        path: '~/.claude/skills/user-skill/SKILL.md',
        pluginName: null,
        source: 'user',
      },
      {
        content: 'Plugin instructions.',
        description: 'Plugin skill',
        name: 'plugin-skill',
        path: '~/.claude/plugins/marketplaces/market/plugin/skills/plugin-skill/SKILL.md',
        pluginName: 'market:plugin',
        source: 'plugin',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([
      {
        argumentHint: null,
        content: 'Project command.',
        description: 'Project command',
        name: 'project-command',
        path: '.claude/commands/project-command.md',
        pluginName: null,
        source: 'project',
      },
    ]);
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'User agent',
        disallowedTools: [],
        model: null,
        name: 'user-agent',
        path: '~/.claude/agents/user-agent.md',
        pluginName: null,
        prompt: 'User prompt.',
        source: 'user',
        tools: [],
      },
      {
        description: 'Project agent',
        disallowedTools: [],
        model: 'sonnet',
        name: 'project-agent',
        path: '.claude/agents/project-agent.md',
        pluginName: null,
        prompt: 'Project prompt.',
        source: 'project',
        tools: [],
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(await screen.findByText('Plugin')).toBeTruthy();
    expect(screen.getByText('plugin-skill')).toBeTruthy();
    expect(screen.getByText('project-command')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /plugin-skill/ }));
    const readonlyDescription = await screen.findByTestId(
      'ai-skills-readonly-description',
    );
    expect(readonlyDescription.textContent).toBe('Plugin skill');
    expect(readonlyDescription.className).toContain('bg-muted/50');
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit markdown' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete skill' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    expect(await screen.findByText('project-agent')).toBeTruthy();
    expect(screen.getAllByText('Project').length).toBeGreaterThan(0);
    expect(screen.queryByText('Source')).toBeNull();
  });

  it('supports 1Code-style keyboard navigation in Skills Agents and MCP lists', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use docs.',
        description: 'User skill',
        name: 'alpha-skill',
        path: '~/.claude/skills/alpha-skill/SKILL.md',
        pluginName: null,
        source: 'user',
      },
      {
        content: 'Use tests.',
        description: 'Project skill',
        name: 'beta-skill',
        path: '.claude/skills/beta-skill/SKILL.md',
        pluginName: null,
        source: 'project',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([]);
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'User agent',
        disallowedTools: [],
        model: null,
        name: 'alpha-agent',
        path: '~/.claude/agents/alpha-agent.md',
        pluginName: null,
        prompt: 'User prompt.',
        source: 'user',
        tools: [],
      },
      {
        description: 'Project agent',
        disallowedTools: [],
        model: 'sonnet',
        name: 'beta-agent',
        path: '.claude/agents/beta-agent.md',
        pluginName: null,
        prompt: 'Project prompt.',
        source: 'project',
        tools: [],
      },
    ]);
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        name: 'alpha-server',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'connected',
        tools: [],
        url: null,
      },
      {
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        name: 'beta-server',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'connected',
        tools: [],
        url: null,
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    await user.click(await screen.findByRole('button', { name: 'Skills' }));
    const skillsSearch = await screen.findByRole('searchbox', {
      name: 'Search skills and commands',
    });
    skillsSearch.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      const betaSkill = screen.getByRole('button', { name: /beta-skill/ });
      expect(betaSkill.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(betaSkill);
    });

    await user.click(screen.getByRole('button', { name: 'Custom Agents' }));
    const agentsSearch = await screen.findByRole('searchbox', {
      name: 'Search agents',
    });
    agentsSearch.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      const betaAgent = screen.getByRole('button', { name: /beta-agent/ });
      expect(betaAgent.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(betaAgent);
    });

    await user.click(screen.getByRole('button', { name: 'MCP Servers' }));
    const serversSearch = await screen.findByRole('searchbox', {
      name: 'Search servers',
    });
    serversSearch.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      const betaServer = screen.getByRole('button', { name: /beta-server/ });
      expect(betaServer.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(betaServer);
    });
  });

  it('resizes 1Code-style AI settings list sidebars and persists widths', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use docs.',
        description: 'User skill',
        name: 'alpha-skill',
        path: '~/.claude/skills/alpha-skill/SKILL.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    const handle = await screen.findByRole('separator', {
      name: 'Resize Skills settings list',
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('240');

    fireEvent.pointerDown(handle, { clientX: 240, pointerId: 1 });
    await waitFor(() =>
      expect(handle.getAttribute('data-dragging')).toBe('true'),
    );
    fireEvent.pointerMove(document, { clientX: 280, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe('280'));
    await user.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => {
      expect(saveAppSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ai: expect.objectContaining({
            settingsSidebarWidths: expect.objectContaining({
              skills: 280,
            }),
          }),
        }),
      );
    });
  });

  it('matches 1Code-style skills command sidebar and unified create form', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use docs.',
        description: 'Write docs',
        name: 'docx',
        path: '~/.claude/skills/docx/SKILL.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([
      {
        argumentHint: '<message>',
        content: 'Commit changes.',
        description: 'Commit',
        name: 'git:commit',
        path: '.claude/commands/git/commit.md',
        pluginName: null,
        source: 'project',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Skills' }));

    expect(screen.queryByRole('button', { name: 'New skill' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New command' })).toBeNull();

    const skillButton = await screen.findByRole('button', { name: /docx/ });
    expect(within(skillButton).getByText('@')).toBeTruthy();
    expect(within(skillButton).queryByText('Skill')).toBeNull();
    expect(within(skillButton).queryByText(/~\/\.claude\/skills/)).toBeNull();

    const commandButton = screen.getByRole('button', { name: /git:commit/ });
    expect(within(commandButton).getByText('/')).toBeTruthy();
    expect(within(commandButton).queryByText('Command')).toBeNull();
    expect(within(commandButton).queryByText(/\.claude\/commands/)).toBeNull();

    await user.click(screen.getByTitle('Create new skill or command'));

    expect(await screen.findByRole('heading', { name: 'New Skill' })).toBeTruthy();
    expect(screen.getByTestId('ai-skills-detail-inner').className).toContain(
      'max-w-2xl',
    );
    expect(screen.getByTestId('ai-skills-detail-inner').className).toContain(
      'p-6',
    );
    expect(screen.getByRole('heading', { name: 'New Skill' }).className).toContain(
      'text-sm',
    );
    expect(
      screen.getByRole('heading', { name: 'New Skill' }).className,
    ).not.toContain('text-[18px]');
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeTruthy();
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(
      await screen.findByRole('option', {
        name: 'Command (triggered via /slash)',
      }),
    );
    expect(screen.getByRole('heading', { name: 'New Command' })).toBeTruthy();
  });

  it('toggles AI plugins from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const enabledPlugin = {
      category: null,
	      components: {
	        agents: [],
	        commands: [],
	        mcpServers: ['context7', 'browser'],
	        skills: [],
	      },
      description: 'Plugin enabled',
      homepage: null,
      isDisabled: false,
      marketplace: 'market',
      name: 'plugin-one',
      path: '~/.claude/plugins/marketplaces/market/plugin-one',
      source: 'market:plugin-one',
      tags: [],
      version: '1.0.0',
    };
    const disabledPlugin = {
      ...enabledPlugin,
      isDisabled: true,
    };

    listAiPluginsMock
      .mockResolvedValueOnce([enabledPlugin])
      .mockResolvedValueOnce([disabledPlugin]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));
    await user.click(
      await screen.findByRole('switch', { name: 'Toggle plugin-one' }),
    );

	    expect(setAiPluginEnabledMock).toHaveBeenCalledWith(
	      'market:plugin-one',
	      false,
	    );
	    expect(setAiPluginMcpServersApprovedMock).toHaveBeenCalledWith(
	      'market:plugin-one',
	      ['context7', 'browser'],
	      false,
	    );
	    expect(await screen.findByText('Disabled')).toBeTruthy();

	    listAiPluginsMock.mockResolvedValueOnce([enabledPlugin]);
	    await user.click(
	      await screen.findByRole('switch', { name: 'Toggle plugin-one' }),
	    );
	    expect(setAiPluginEnabledMock).toHaveBeenLastCalledWith(
	      'market:plugin-one',
	      true,
	    );
	    expect(setAiPluginMcpServersApprovedMock).toHaveBeenLastCalledWith(
	      'market:plugin-one',
	      ['context7', 'browser'],
	      true,
	    );
	  });

  it('shows the 1Code-style plugins empty state with install guidance', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiPluginsMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(await screen.findByTestId('plugins-empty-sidebar-icon')).toBeTruthy();
    expect(screen.getByTestId('plugins-empty-detail-icon')).toBeTruthy();
    expect(await screen.findAllByText('No plugins')).toHaveLength(1);
    expect(screen.getByText('No plugins installed')).toBeTruthy();
    expect(screen.getByText('Install plugins to ~/.claude/plugins/')).toBeTruthy();
    expect(
      screen.getByText('Install plugins to ~/.claude/plugins/marketplaces/'),
    ).toBeTruthy();
  });

  it('refreshes plugin MCP server status after plugin approval changes', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const disabledPlugin = {
      category: 'tools',
      components: {
        agents: [],
        commands: [],
        mcpServers: ['context7'],
        skills: [],
      },
      description: 'Context7 MCP integration',
      homepage: null,
      isDisabled: true,
      marketplace: 'claude-plugins-official',
      name: 'context7',
      path: '~/.claude/plugins/marketplaces/claude-plugins-official/context7',
      source: 'claude-plugins-official:context7',
      tags: [],
      version: '1.0.0',
    };
    const enabledPlugin = {
      ...disabledPlugin,
      isDisabled: false,
    };
    const pendingPluginServer = {
      args: ['-y', '@upstash/context7-mcp'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: [],
      groupName: 'Plugin: claude-plugins-official:context7',
      name: 'context7',
      needsAuth: false,
      pluginName: 'claude-plugins-official:context7',
      projectPath: null,
      provider: 'claude-code',
      source: 'plugin',
      status: 'pending-approval',
      tools: [],
      url: null,
    };
    const connectedPluginServer = {
      ...pendingPluginServer,
      status: 'connected',
    };

    listAiPluginsMock
      .mockResolvedValueOnce([disabledPlugin])
      .mockResolvedValue([enabledPlugin]);
    listAiMcpServersMock
      .mockResolvedValueOnce([pendingPluginServer])
      .mockResolvedValue([connectedPluginServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(await screen.findByText('pending-approval')).toBeTruthy();
    await user.click(
      await screen.findByRole('switch', { name: 'Toggle context7' }),
    );

    expect(setAiPluginEnabledMock).toHaveBeenCalledWith(
      'claude-plugins-official:context7',
      true,
    );
    expect(setAiPluginMcpServersApprovedMock).toHaveBeenCalledWith(
      'claude-plugins-official:context7',
      ['context7'],
      true,
    );
    await waitFor(() => {
      expect(listAiMcpServersMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Connected')).toBeTruthy();
  });

  it('shows 1Code-style plugin list detail layout and navigates component rows', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const enabledPlugin = {
      category: 'productivity',
      components: {
        agents: [{ description: 'Review code changes', name: 'reviewer' }],
        commands: [{ description: 'Commit workflow', name: 'commit' }],
        mcpServers: ['context7'],
        skills: [{ description: 'Write documents', name: 'docx' }],
      },
      description: 'Collection of document processing suite',
      homepage: 'https://example.com/document-skills',
      isDisabled: false,
      marketplace: 'anthropic-agent-skills',
      name: 'document-skills',
      path: '~/.claude/plugins/marketplaces/anthropic/document-skills',
      source: 'anthropic-agent-skills:document-skills',
      tags: ['docs'],
      version: '0.0.0',
    };
    const disabledPlugin = {
      ...enabledPlugin,
      category: 'tools',
      components: {
        agents: [],
        commands: [],
        mcpServers: [],
        skills: [{ description: 'Search docs', name: 'context7' }],
      },
      description: 'Context7 MCP integration',
      homepage: null,
      isDisabled: true,
      marketplace: 'claude-plugins-official',
      name: 'context7',
      source: 'claude-plugins-official:context7',
      tags: [],
      version: '1.0.0',
    };

    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7-mcp'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Plugin: anthropic-agent-skills:document-skills',
        name: 'context7',
        needsAuth: true,
        pluginName: 'anthropic-agent-skills:document-skills',
        provider: 'claude',
        source: 'plugin',
        status: 'needs-auth',
        tools: [],
      },
    ]);
    listAiPluginsMock.mockResolvedValue([enabledPlugin, disabledPlugin]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(
      await screen.findByRole('searchbox', { name: 'Search plugins' }),
    ).toBeTruthy();
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-plugins-settings-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-plugins-settings-shell').className).not.toContain(
      'mx-auto',
    );
    expect(screen.getByTestId('ai-plugins-settings-sidebar').className).toContain(
      'bg-background',
    );
    expect(screen.getByTestId('ai-plugins-search-row').className).toContain(
      'px-2',
    );
    expect(screen.getByTestId('ai-plugins-search-input').className).toContain(
      'h-7',
    );
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('claude-plugins-official')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /Document Skills/ })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('heading', { name: 'Document Skills' }),
    ).toBeTruthy();
    expect(screen.getByTestId('ai-plugin-detail-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-plugin-detail-scroll').className).toContain(
      'overflow-y-auto',
    );
    expect(screen.getByTestId('ai-plugin-detail-inner').className).toContain(
      'max-w-2xl',
    );
    expect(screen.getByTestId('ai-plugin-detail-inner').className).toContain(
      'p-6',
    );
    expect(screen.getByTestId('ai-plugin-detail-title').className).toContain(
      'text-sm',
    );
    expect(screen.getByTestId('ai-plugin-detail-title').className).not.toContain(
      'text-[18px]',
    );
    expect(screen.getByText('productivity')).toBeTruthy();
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Tags')).toBeTruthy();
    expect(screen.getByText('Commands (1)')).toBeTruthy();
    expect(screen.getByText('/commit')).toBeTruthy();
    expect(screen.getByText('/commit').className).toContain('text-xs');
    expect(screen.getByText('Commit workflow').className).toContain('text-[11px]');
    expect(screen.getByText('Skills (1)')).toBeTruthy();
    expect(screen.getByTestId('plugin-skill-icon-docx')).toBeTruthy();
    expect(screen.getByText('Agents (1)')).toBeTruthy();
    expect(screen.getByTestId('plugin-agent-icon-reviewer')).toBeTruthy();
    expect(screen.getByText('MCP Servers (1)')).toBeTruthy();
    expect(screen.getByTestId('plugin-mcp-icon-context7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'context7',
      projectPath: null,
      provider: 'claude',
    });

    await user.type(screen.getByRole('searchbox', { name: 'Search plugins' }), 'Search docs');
    expect(screen.queryByRole('button', { name: /Document Skills/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Context7/ })).toBeTruthy();

    await user.clear(screen.getByRole('searchbox', { name: 'Search plugins' }));
    await user.click(screen.getByRole('button', { name: /Document Skills/ }));
    await user.click(screen.getByRole('button', { name: /docx/ }));
    expect(
      (await screen.findAllByRole('heading', { name: 'Skills' })).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Plugins' }));
    await user.click(await screen.findByRole('button', { name: /Document Skills/ }));
    await user.click(screen.getByRole('button', { name: /reviewer/ }));
    expect(
      (await screen.findAllByRole('heading', { name: 'Custom Agents' })).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Plugins' }));
    await user.click(await screen.findByRole('button', { name: /Document Skills/ }));
    await user.click(screen.getByRole('button', { name: /context7/ }));
    expect(
      (await screen.findAllByRole('heading', { name: 'MCP Servers' })).length,
    ).toBeGreaterThan(0);
  });

  it('shows a spinner while authenticating plugin MCP servers like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const plugin = {
      category: 'productivity',
      components: {
        agents: [],
        commands: [],
        mcpServers: ['context7'],
        skills: [],
      },
      description: 'Context7 integration',
      homepage: null,
      isDisabled: false,
      marketplace: 'claude-plugins-official',
      name: 'context7',
      path: '~/.claude/plugins/marketplaces/context7',
      source: 'claude-plugins-official:context7',
      tags: [],
      version: '1.0.0',
    };
    listAiPluginsMock.mockResolvedValue([plugin]);
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7-mcp'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Plugin: claude-plugins-official:context7',
        name: 'context7',
        needsAuth: true,
        pluginName: 'claude-plugins-official:context7',
        projectPath: null,
        provider: 'claude-code',
        source: 'plugin',
        status: 'needs-auth',
        tools: [],
        url: null,
      },
    ]);
    let resolveAuth: (() => void) | null = null;
    authenticateAiMcpServerMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAuth = resolve;
      }),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(screen.getByTestId('plugin-mcp-auth-spinner-context7')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();

    resolveAuth?.();
    await waitFor(() => expect(authenticateAiMcpServerMock).toHaveBeenCalled());
  });

  it('authenticates plugin MCP servers globally without a workspace like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7-mcp'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Plugin: anthropic-agent-skills:document-skills',
        name: 'context7',
        needsAuth: true,
        pluginName: 'anthropic-agent-skills:document-skills',
        provider: 'claude-code',
        source: 'plugin',
        status: 'needs-auth',
        tools: [],
      },
    ]);
    listAiPluginsMock.mockResolvedValue([
      {
        category: 'productivity',
        components: {
          agents: [],
          commands: [],
          mcpServers: ['context7'],
          skills: [],
        },
        description: 'Collection of document processing skills.',
        homepage: null,
        isDisabled: false,
        marketplace: 'anthropic-agent-skills',
        name: 'document-skills',
        path: '~/.claude/plugins/marketplaces/anthropic/document-skills',
        source: 'anthropic-agent-skills:document-skills',
        tags: [],
        version: '0.0.0',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    expect(listAiMcpServersMock).toHaveBeenCalledWith('__global__');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('__global__', {
      name: 'context7',
      projectPath: '__global__',
      provider: 'claude-code',
    });
  });

  it('supports 1Code-style keyboard navigation in the Plugins list', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const enabledPlugin = {
      category: 'productivity',
      components: {
        agents: [],
        commands: [],
        mcpServers: [],
        skills: [],
      },
      description: 'Collection of document processing suite',
      homepage: null,
      isDisabled: false,
      marketplace: 'anthropic-agent-skills',
      name: 'document-skills',
      path: '~/.claude/plugins/document-skills',
      source: 'anthropic-agent-skills:document-skills',
      tags: [],
      version: '0.0.0',
    };
    const disabledPlugin = {
      ...enabledPlugin,
      description: 'Context7 MCP integration',
      isDisabled: true,
      marketplace: 'claude-plugins-official',
      name: 'context7',
      source: 'claude-plugins-official:context7',
      version: '1.0.0',
    };

    listAiPluginsMock.mockResolvedValue([enabledPlugin, disabledPlugin]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('button', { name: 'Plugins' }));

    const search = await screen.findByRole('searchbox', {
      name: 'Search plugins',
    });
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: /Document Skills/ })
          .getAttribute('aria-current'),
      ).toBe('true');
    });

    search.focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => {
      const context7Button = screen.getByRole('button', { name: /Context7/ });
      expect(context7Button.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(context7Button);
    });

    await user.keyboard('{ArrowUp}');

    await waitFor(() => {
      const documentSkillsButton = screen.getByRole('button', {
        name: /Document Skills/,
      });
      expect(documentSkillsButton.getAttribute('aria-current')).toBe('true');
      expect(document.activeElement).toBe(documentSkillsButton);
    });
  });

  it('focuses 1Code-style AI settings search fields with slash', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiSkillsMock.mockResolvedValue([
      {
        content: 'Use docs.',
        description: 'User skill',
        name: 'alpha-skill',
        path: '~/.claude/skills/alpha-skill/SKILL.md',
        pluginName: null,
        source: 'user',
      },
    ]);
    listAiCommandsMock.mockResolvedValue([]);
    listAiCustomAgentsMock.mockResolvedValue([
      {
        description: 'User agent',
        disallowedTools: [],
        model: null,
        name: 'alpha-agent',
        path: '~/.claude/agents/alpha-agent.md',
        pluginName: null,
        prompt: 'User prompt.',
        source: 'user',
        tools: [],
      },
    ]);
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        name: 'alpha-server',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'connected',
        tools: [],
        url: null,
      },
    ]);
    listAiPluginsMock.mockResolvedValue([
      {
        category: 'productivity',
        components: {
          agents: [],
          commands: [],
          mcpServers: [],
          skills: [],
        },
        description: 'Example plugin',
        homepage: null,
        isDisabled: false,
        marketplace: 'claude-plugins-official',
        name: 'example-plugin',
        path: '~/.claude/plugins/example-plugin',
        source: 'claude-plugins-official:example-plugin',
        tags: [],
        version: '0.0.0',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const cases = [
      ['Skills', 'Search skills and commands'],
      ['Custom Agents', 'Search agents'],
      ['MCP Servers', 'Search servers'],
      ['Plugins', 'Search plugins'],
    ] as const;

    for (const [tabName, searchName] of cases) {
      await user.click(await screen.findByRole('button', { name: tabName }));
      screen.getByRole('button', { name: '应用' }).focus();
      await user.keyboard('/');

      const search = await screen.findByRole('searchbox', { name: searchName });
      expect(document.activeElement).toBe(search);

      await user.keyboard('/');
      expect((search as HTMLInputElement).value).toBe('/');
      await user.clear(search);
    }
  });

  it('creates toggles and deletes MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const enabledServer = {
      args: ['-y', '@upstash/context7'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: [],
      groupName: 'repo',
      name: 'context7',
      pluginName: null,
      projectPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      status: 'configured',
      url: null,
    };
    const disabledServer = {
      ...enabledServer,
      enabled: false,
      status: 'disabled',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([enabledServer])
      .mockResolvedValueOnce([disabledServer])
      .mockResolvedValueOnce([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add your first server' }));
    await user.type(screen.getByLabelText('Name'), 'context7');
    await user.type(screen.getByLabelText('Command'), 'npx');
    await user.type(screen.getByLabelText('Arguments'), '-y @upstash/context7');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      args: ['-y', '@upstash/context7'],
      authType: null,
      bearerToken: null,
      command: 'npx',
      connectionType: 'stdio',
      env: {},
      name: 'context7',
      provider: 'claude-code',
      source: 'global',
      url: null,
    });
    await waitFor(() => {
      expect(screen.getAllByText('context7').length).toBeGreaterThan(0);
    });

    await user.click(
      screen.getByRole('switch', { name: 'Toggle MCP context7' }),
    );
    expect(setAiMcpServerEnabledMock).toHaveBeenCalledWith('/repo', {
      enabled: false,
      name: 'context7',
      provider: 'claude-code',
      source: 'project',
    });
    expect((await screen.findAllByText('Disabled')).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Delete server' }));
    expect(deleteAiMcpServerMock).not.toHaveBeenCalled();
    const deleteDialog = await screen.findByRole('alertdialog');
    expect(
      within(deleteDialog).getByRole('heading', { name: 'Delete MCP Server' }),
    ).toBeTruthy();
    expect(within(deleteDialog).getByText(/delete/)).toBeTruthy();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'context7',
      provider: 'claude-code',
      source: 'project',
    });
  });

  it('shows 1Code-style MCP create form select controls', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add your first server' }));

    expect(screen.getByRole('combobox', { name: 'Provider' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Transport' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Scope' })).toBeTruthy();
    expect(screen.getByPlaceholderText('my-server')).toBeTruthy();
    expect(screen.getByPlaceholderText('npx, python, node...')).toBeTruthy();
    expect(screen.getByLabelText('Arguments')).toBeTruthy();
    expect(screen.queryByLabelText('Args')).toBeNull();
    expect(screen.getByPlaceholderText('-m mcp_server --port 3000')).toBeTruthy();
    expect(screen.getByText('Space-separated arguments')).toBeTruthy();

    await user.click(screen.getByRole('combobox', { name: 'Transport' }));
    expect(
      await screen.findByRole('option', { name: 'stdio (local command)' }),
    ).toBeTruthy();
    expect(screen.getByRole('option', { name: 'HTTP (SSE)' })).toBeTruthy();
    await user.click(screen.getByRole('option', { name: 'HTTP (SSE)' }));
    expect(screen.getByPlaceholderText('http://localhost:3000/sse')).toBeTruthy();
  });

  it('matches 1Code-style MCP create form actions and validation', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Add your first server' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add MCP server' }));

    expect(
      await screen.findByRole('heading', { name: 'New MCP Server' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save server' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.type(screen.getByLabelText('Name'), 'context7');
    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.type(screen.getByLabelText('Command'), 'npx');
    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('hides Claude MCP project scope in create form without a workspace like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add MCP server' }));

    expect(
      await screen.findByRole('heading', { name: 'New MCP Server' }),
    ).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Scope' })).toBeNull();
    expect(screen.queryByText('Global (~/.claude.json)')).toBeNull();
    expect(screen.queryByText('Project')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Provider' }));
    await user.click(await screen.findByRole('option', { name: 'OpenAI Codex' }));

    expect(await screen.findByRole('combobox', { name: 'Scope' })).toBeTruthy();
    expect(screen.getByText('Global (~/.codex/config.toml)')).toBeTruthy();
  });

  it('creates global Claude MCP servers without a workspace like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const globalRoot = '__global__';
    const globalServer = {
      args: ['-y', '@upstash/context7'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'context7',
      pluginName: null,
      projectPath: null,
      provider: 'claude-code',
      source: 'global',
      status: 'configured',
      tools: [],
      url: null,
    };
    const disabledGlobalServer = {
      ...globalServer,
      enabled: false,
      status: 'disabled',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([globalServer])
      .mockResolvedValueOnce([disabledGlobalServer])
      .mockResolvedValueOnce([]);

    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add MCP server' }));
    await user.type(screen.getByLabelText('Name'), 'context7');
    await user.type(screen.getByLabelText('Command'), 'npx');
    await user.type(screen.getByLabelText('Arguments'), '-y @upstash/context7');

    expect(
      (screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createAiMcpServerMock).toHaveBeenCalledWith(globalRoot, {
      args: ['-y', '@upstash/context7'],
      authType: null,
      bearerToken: null,
      command: 'npx',
      connectionType: 'stdio',
      env: {},
      name: 'context7',
      provider: 'claude-code',
      source: 'global',
      url: null,
    });
    expect(await screen.findByRole('heading', { name: 'context7' })).toBeTruthy();

    await user.click(
      screen.getByRole('switch', { name: 'Toggle MCP context7' }),
    );
    expect(setAiMcpServerEnabledMock).toHaveBeenCalledWith(globalRoot, {
      enabled: false,
      name: 'context7',
      provider: 'claude-code',
      source: 'global',
    });
    expect((await screen.findAllByText('Disabled')).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Delete server' }));
    const deleteDialog = await screen.findByRole('alertdialog');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    expect(deleteAiMcpServerMock).toHaveBeenCalledWith(globalRoot, {
      name: 'context7',
      provider: 'claude-code',
      source: 'global',
    });
  });

  it('sorts MCP servers by 1Code status priority and selects connected first', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const failedServer = {
      args: [],
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'failed-server',
      pluginName: null,
      projectPath: null,
      provider: 'claude-code',
      source: 'global',
      status: 'failed',
      tools: [],
      url: 'https://failed.example.com/mcp',
    };
    const needsAuthServer = {
      ...failedServer,
      name: 'needs-auth-server',
      needsAuth: true,
      status: 'needs-auth',
      url: 'https://auth.example.com/mcp',
    };
    const connectedServer = {
      ...failedServer,
      name: 'connected-server',
      needsAuth: false,
      status: 'connected',
      tools: [{ description: 'Read docs', name: 'read_docs' }],
      url: 'https://connected.example.com/mcp',
    };

    listAiMcpServersMock.mockResolvedValue([
      failedServer,
      needsAuthServer,
      connectedServer,
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    const connectedButton = await screen.findByRole('button', {
      name: /connected-server/,
    });
    const needsAuthButton = screen.getByRole('button', {
      name: /needs-auth-server/,
    });
    const failedButton = screen.getByRole('button', { name: /failed-server/ });
    expect(
      connectedButton.compareDocumentPosition(needsAuthButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      needsAuthButton.compareDocumentPosition(failedButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'connected-server' }),
    ).toBeTruthy();
    expect(screen.getByText('read_docs')).toBeTruthy();
  });

  it('renders pending MCP servers with a loading indicator like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        name: 'pending-server',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'pending',
        tools: [],
        url: null,
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    const pendingButton = await screen.findByRole('button', {
      name: /pending-server/,
    });
    expect(within(pendingButton).getByTestId('mcp-status-loading-dot')).toBeTruthy();
    expect(within(pendingButton).queryByText('pending')).toBeNull();
  });

  it('edits writable MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const stdioServer = {
      args: ['-y', '@upstash/context7'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: ['CONTEXT7_API_KEY'],
      groupName: 'repo',
      name: 'context7',
      pluginName: null,
      projectPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      status: 'configured',
      url: null,
    };
    const httpServer = {
      ...stdioServer,
      args: [],
      command: null,
      connectionType: 'http',
      envKeys: [],
      url: 'https://mcp.example.com',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([stdioServer])
      .mockResolvedValueOnce([httpServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Edit server' }));
    await user.click(screen.getByRole('combobox', { name: 'Transport' }));
    await user.click(await screen.findByRole('option', { name: 'HTTP (SSE)' }));
    await user.clear(screen.getByLabelText('URL'));
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example.com');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      args: [],
      authType: 'none',
      bearerToken: null,
      command: null,
      connectionType: 'http',
      env: {},
      name: 'context7',
      provider: 'claude-code',
      source: 'project',
      url: 'https://mcp.example.com',
    });
    expect(await screen.findByText('https://mcp.example.com')).toBeTruthy();
  });

  it('creates HTTP bearer MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const httpServer = {
      args: [],
      authType: 'bearer',
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'repo',
      hasAuthHeader: true,
      name: 'search-prime',
      pluginName: null,
      projectPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      status: 'needs-auth',
      tools: [],
      url: 'https://mcp.example.com',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([httpServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add your first server' }));
    await user.click(screen.getByRole('combobox', { name: 'Scope' }));
    await user.click(await screen.findByRole('option', { name: 'Project: repo' }));
    await user.click(screen.getByRole('combobox', { name: 'Transport' }));
    await user.click(await screen.findByRole('option', { name: 'HTTP (SSE)' }));
    await user.type(screen.getByLabelText('Name'), 'search-prime');
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example.com');
    await user.click(screen.getByRole('button', { name: 'Bearer Token' }));
    await user.type(screen.getByLabelText('Bearer token'), 'mcp-token');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      args: [],
      authType: 'bearer',
      bearerToken: 'mcp-token',
      command: null,
      connectionType: 'http',
      env: {},
      name: 'search-prime',
      provider: 'claude-code',
      source: 'project',
      url: 'https://mcp.example.com',
    });
    expect(await screen.findByText('Authorization configured')).toBeTruthy();
  });

  it('creates Codex MCP servers with global scope from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const codexServer = {
      args: [],
      authStatus: 'not_logged_in',
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'codex-http',
      needsAuth: true,
      pluginName: null,
      projectPath: null,
      provider: 'codex',
      source: 'global',
      status: 'needs-auth',
      tools: [],
      url: 'https://mcp.example.com',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([codexServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add your first server' }));
    await user.click(screen.getByRole('combobox', { name: 'Provider' }));
    await user.click(
      await screen.findByRole('option', { name: 'OpenAI Codex' }),
    );
    await user.click(screen.getByRole('combobox', { name: 'Transport' }));
    await user.click(await screen.findByRole('option', { name: 'HTTP (SSE)' }));
    await user.type(screen.getByLabelText('Name'), 'codex-http');
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example.com');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(createAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      args: [],
      authType: null,
      bearerToken: null,
      command: null,
      connectionType: 'http',
      env: {},
      name: 'codex-http',
      provider: 'codex',
      source: 'global',
      url: 'https://mcp.example.com',
    });
    expect(await screen.findByText('CODEX')).toBeTruthy();
  });

  it('authenticates and logs out Codex MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const unauthenticatedServer = {
      args: [],
      authStatus: 'not_logged_in',
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'codex-http',
      needsAuth: true,
      pluginName: null,
      projectPath: null,
      provider: 'codex',
      source: 'global',
      status: 'needs-auth',
      tools: [],
      url: 'https://mcp.example.com',
    };
    const authenticatedServer = {
      ...unauthenticatedServer,
      authStatus: 'o_auth',
      needsAuth: false,
      status: 'connected',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([unauthenticatedServer])
      .mockResolvedValueOnce([authenticatedServer])
      .mockResolvedValueOnce([unauthenticatedServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Authenticate' }));

    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'codex-http',
      projectPath: null,
      provider: 'codex',
    });
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(logoutAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'codex-http',
      projectPath: null,
      provider: 'codex',
    });
  });

  it('only shows Codex MCP logout for OAuth or bearer-token auth status like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([
      {
        args: [],
        authStatus: 'not_logged_in',
        authType: 'bearer',
        command: null,
        connectionType: 'http',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        hasAuthHeader: true,
        name: 'codex-http',
        needsAuth: false,
        pluginName: null,
        projectPath: null,
        provider: 'codex',
        source: 'global',
        status: 'connected',
        tools: [],
        url: 'https://mcp.example.com',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    expect(await screen.findByRole('heading', { name: 'codex-http' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
  });

  it('authenticates and logs out Claude HTTP MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const unauthenticatedServer = {
      args: [],
      authType: 'oauth',
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'repo',
      hasAuthHeader: false,
      name: 'figma',
      needsAuth: true,
      pluginName: null,
      projectPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      status: 'needs-auth',
      tools: [],
      url: 'https://mcp.example.com/mcp',
    };
    const authenticatedServer = {
      ...unauthenticatedServer,
      hasAuthHeader: true,
      needsAuth: false,
      status: 'connected',
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([unauthenticatedServer])
      .mockResolvedValueOnce([authenticatedServer])
      .mockResolvedValueOnce([unauthenticatedServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Authenticate' }));

    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'figma',
      projectPath: '/repo',
      provider: 'claude-code',
    });
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(logoutAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'figma',
      projectPath: '/repo',
      provider: 'claude-code',
    });
  });

  it('shows Reconnect for connected MCP servers that still need auth like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([
      {
        args: [],
        authType: 'oauth',
        command: null,
        connectionType: 'http',
        enabled: true,
        envKeys: [],
        groupName: 'repo',
        hasAuthHeader: true,
        name: 'figma',
        needsAuth: true,
        pluginName: null,
        projectPath: '/repo',
        provider: 'claude-code',
        source: 'project',
        status: 'connected',
        tools: [],
        url: 'https://mcp.example.com/mcp',
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Reconnect' }));

    expect(screen.queryByRole('button', { name: 'Authenticate' })).toBeNull();
    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'figma',
      projectPath: '/repo',
      provider: 'claude-code',
    });
  });

  it('keeps the promoted global MCP server selected after plugin authentication like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const pluginServer = {
      args: [],
      authType: 'oauth',
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'Plugin: market:plugin-one',
      hasAuthHeader: false,
      name: 'figma',
      needsAuth: true,
      pluginName: 'market:plugin-one',
      projectPath: null,
      provider: 'claude-code',
      source: 'plugin',
      status: 'needs-auth',
      tools: [],
      url: 'https://mcp.example.com/mcp',
    };
    const unrelatedServer = {
      ...pluginServer,
      groupName: 'Global',
      hasAuthHeader: true,
      name: 'alpha',
      needsAuth: false,
      pluginName: null,
      source: 'global',
      status: 'connected',
    };
    const promotedServer = {
      ...pluginServer,
      groupName: 'Global',
      hasAuthHeader: true,
      needsAuth: false,
      pluginName: null,
      source: 'global',
      status: 'connected',
      tools: [{ description: 'Open Figma files', name: 'open_file' }],
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([pluginServer])
      .mockResolvedValueOnce([unrelatedServer, promotedServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Authenticate' }));

    expect(authenticateAiMcpServerMock).toHaveBeenCalledWith('/repo', {
      name: 'figma',
      projectPath: null,
      provider: 'claude-code',
    });
    expect(await screen.findByRole('heading', { name: 'figma' })).toBeTruthy();
    expect(screen.getByText('open_file')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /figma/ })
        .getAttribute('aria-current'),
    ).toBe('true');
  });

  it('approves pending plugin MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const pendingPluginServer = {
      args: ['-y', '@upstash/context7'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: ['CONTEXT7_API_KEY'],
      groupName: 'Plugin: market:plugin-one',
      name: 'context7',
      pluginName: 'market:plugin-one',
      projectPath: null,
      provider: 'claude-code',
      source: 'plugin',
      status: 'pending-approval',
      tools: [],
      url: null,
    };
    const approvedPluginServer = {
      ...pendingPluginServer,
      status: 'connected',
      tools: [{ description: 'Resolve docs', name: 'resolve-library-id' }],
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([pendingPluginServer])
      .mockResolvedValueOnce([approvedPluginServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    expect((await screen.findAllByText('pending-approval')).length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', { name: 'Approve plugin MCP server' }),
    );

    expect(setAiPluginMcpServerApprovedMock).toHaveBeenCalledWith(
      'market:plugin-one',
      'context7',
      true,
    );
    expect(await screen.findByText('resolve-library-id')).toBeTruthy();
  });

  it('revokes approved plugin MCP servers from settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const approvedPluginServer = {
      args: ['-y', '@upstash/context7'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: [],
      groupName: 'Plugin: market:plugin-one',
      name: 'context7',
      pluginName: 'market:plugin-one',
      projectPath: null,
      provider: 'claude-code',
      source: 'plugin',
      status: 'connected',
      tools: [{ description: 'Resolve docs', name: 'resolve-library-id' }],
      url: null,
    };
    const pendingPluginServer = {
      ...approvedPluginServer,
      status: 'pending-approval',
      tools: [],
    };

    listAiMcpServersMock
      .mockResolvedValueOnce([approvedPluginServer])
      .mockResolvedValueOnce([pendingPluginServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );
    expect(await screen.findByText('resolve-library-id')).toBeTruthy();
    await user.click(
      screen.getByRole('button', {
        name: 'Revoke plugin MCP server approval',
      }),
    );

    expect(setAiPluginMcpServerApprovedMock).toHaveBeenCalledWith(
      'market:plugin-one',
      'context7',
      false,
    );
    expect((await screen.findAllByText('pending-approval')).length).toBeGreaterThan(
      0,
    );
  });

  it('shows 1Code-style empty state for MCP servers', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    expect(await screen.findByTestId('mcp-empty-sidebar-icon')).toBeTruthy();
    expect(screen.getByTestId('mcp-empty-detail-icon')).toBeTruthy();
    expect(screen.getByText('No servers')).toBeTruthy();
    expect(screen.getByText('No MCP servers configured')).toBeTruthy();
  });

  it('shows No tools for connected Claude MCP servers without tools like 1Code', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    listAiMcpServersMock.mockResolvedValue([
      {
        args: ['-y', '@upstash/context7'],
        command: 'npx',
        connectionType: 'stdio',
        enabled: true,
        envKeys: [],
        groupName: 'Global',
        name: 'context7',
        pluginName: null,
        projectPath: null,
        provider: 'claude-code',
        source: 'global',
        status: 'connected',
        tools: [],
        url: null,
      },
    ]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    const serverButton = await screen.findByRole('button', { name: /context7/ });
    expect(within(serverButton).getByText('No tools')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'context7' })).toBeTruthy();
    expect(screen.getAllByText('No tools').length).toBeGreaterThanOrEqual(2);
    expect(within(serverButton).queryByText('connected')).toBeNull();
  });

  it('shows 1Code-style MCP server list detail layout and filters servers', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const claudeServer = {
      args: ['-y', '@z_ai/mcp-server'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: ['Z_AI_API_KEY'],
      error: 'MCP initialize failed: missing Z_AI_API_KEY',
      groupName: 'Global',
      name: 'zai-mcp-server',
      pluginName: null,
      projectPath: null,
      provider: 'claude-code',
      source: 'global',
      status: 'connected',
      tools: [
        {
          description: 'Convert UI screenshots into artifacts',
          name: 'ui_to_artifact',
        },
        {
          description: 'Extract text from screenshots',
          name: 'extract_text_from_screenshot',
        },
      ],
      url: null,
    };
    const codexServer = {
      args: [],
      command: null,
      connectionType: 'http',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'context7',
      pluginName: null,
      projectPath: null,
      provider: 'codex',
      source: 'global',
      status: 'connected',
      tools: [{ description: 'Resolve docs', name: 'resolve-library-id' }],
      url: 'https://mcp.context7.com/sse',
    };

    listAiMcpServersMock.mockResolvedValue([claudeServer, codexServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    expect(
      await screen.findByRole('searchbox', { name: 'Search servers' }),
    ).toBeTruthy();
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-mcp-settings-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-mcp-settings-shell').className).not.toContain(
      'mx-auto',
    );
    expect(screen.getByTestId('ai-mcp-settings-sidebar').className).toContain(
      'bg-background',
    );
    expect(screen.getByTestId('ai-mcp-search-row').className).toContain('px-2');
    expect(screen.getByTestId('ai-mcp-search-input').className).toContain('h-7');
    expect(screen.getByTestId('ai-mcp-search-input').className).not.toContain(
      'h-9',
    );
    expect(screen.getByText('CLAUDE CODE')).toBeTruthy();
    expect(screen.getByText('CODEX')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /zai-mcp-server/ })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('heading', { name: 'zai-mcp-server' }),
    ).toBeTruthy();
    expect(screen.getByTestId('ai-mcp-detail-shell').className).toContain(
      'h-full',
    );
    expect(screen.getByTestId('ai-mcp-detail-shell').className).toContain(
      'overflow-y-auto',
    );
    expect(screen.getByTestId('ai-mcp-detail-inner').className).toContain(
      'max-w-2xl',
    );
    expect(screen.getByTestId('ai-mcp-detail-inner').className).toContain(
      'p-6',
    );
    expect(screen.getByTestId('ai-mcp-detail-title').className).toContain(
      'text-sm',
    );
    expect(screen.getByTestId('ai-mcp-detail-title').className).not.toContain(
      'text-[18px]',
    );
    expect(screen.getAllByText('2 tools').length).toBeGreaterThan(0);
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('Connection')).toBeTruthy();
    expect(screen.getByText('Connection').className).toContain('text-xs');
    expect(screen.getByText('Tools (2)')).toBeTruthy();
    expect(screen.getByText('ui_to_artifact')).toBeTruthy();
    expect(screen.getByText('ui_to_artifact').className).toContain('text-[13px]');
    expect(
      screen.getByText('Convert UI screenshots into artifacts').className,
    ).toContain('text-xs');
    expect(screen.getByText('Z_AI_API_KEY')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(
      screen.getByText('MCP initialize failed: missing Z_AI_API_KEY'),
    ).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: 'Search servers' }), 'context');
    expect(screen.queryByRole('button', { name: /zai-mcp-server/ })).toBeNull();
    const codexServerButton = screen.getByRole('button', { name: /context7/ });
    expect(within(codexServerButton).getByText('Connected')).toBeTruthy();
    expect(within(codexServerButton).queryByText('1 tool')).toBeNull();
    await user.click(codexServerButton);
    expect(screen.getByText('https://mcp.context7.com/sse')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tools (1)' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add MCP server' }));
    expect(screen.getByRole('heading', { name: 'New MCP Server' })).toBeTruthy();
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
  });

  it('keeps Claude and Codex MCP servers with the same name selectable independently', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const claudeServer = {
      args: ['-y', '@upstash/context7-mcp'],
      command: 'npx',
      connectionType: 'stdio',
      enabled: true,
      envKeys: [],
      groupName: 'Global',
      name: 'context7',
      pluginName: null,
      projectPath: null,
      provider: 'claude-code',
      source: 'global',
      status: 'connected',
      tools: [{ description: 'Resolve docs via Claude', name: 'resolve' }],
      url: null,
    };
    const codexServer = {
      ...claudeServer,
      args: [],
      command: null,
      connectionType: 'http',
      provider: 'codex',
      tools: [{ description: 'Resolve docs via Codex', name: 'resolve' }],
      url: 'https://mcp.context7.com/sse',
    };

    listAiMcpServersMock.mockResolvedValue([claudeServer, codexServer]);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(
      await screen.findByRole('button', { name: 'MCP Servers' }),
    );

    const serverButtons = await screen.findAllByRole('button', {
      name: /context7/,
    });
    expect(serverButtons).toHaveLength(2);
    expect(serverButtons[0].getAttribute('aria-current')).toBe('true');
    expect(serverButtons[1].getAttribute('aria-current')).toBe(null);

    await user.click(serverButtons[1]);

    expect(serverButtons[0].getAttribute('aria-current')).toBe(null);
    expect(serverButtons[1].getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('https://mcp.context7.com/sse')).toBeTruthy();
    expect(screen.queryByText('npx')).toBeNull();
  });

  it('filters appearance settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const searchInput = await screen.findByRole('searchbox', {
      name: '搜索设置',
    });

    await user.type(searchInput, '主题');

    expect(screen.getByText('主题')).toBeTruthy();
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.queryByText('本地存储配置')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, '全宽');

    expect(screen.getByText('页面宽度')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '全宽' })).toBeTruthy();
  });

  it('switches app theme from appearance settings', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '暗色' }));

    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('passes default wide page width mode to the workspace editor', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce(defaultAppSettings);
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));

    expect(
      (await screen.findByTestId('markdown-editor')).getAttribute(
        'data-page-width-mode',
      ),
    ).toBe('wide');
  });

  it('updates workspace editor page width after settings are applied', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    const standardAppSettings = {
      ...defaultAppSettings,
      appearance: { pageWidthMode: 'standard' as const },
    };
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));
    saveAppSettingsMock.mockResolvedValueOnce(standardAppSettings);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    const initialEditor = await screen.findByTestId('markdown-editor');
    expect(initialEditor.getAttribute('data-page-width-mode')).toBe('wide');
    expect(initialEditor.getAttribute('data-document-key')).toContain(':wide:');

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '标准' }));
    await user.click(screen.getByRole('button', { name: '应用' }));
    await user.click(screen.getByRole('button', { name: '返回应用' }));

    const updatedEditor = await screen.findByTestId('markdown-editor');
    expect(updatedEditor.getAttribute('data-page-width-mode')).toBe('standard');
    expect(updatedEditor.getAttribute('data-document-key')).toContain(
      ':standard:',
    );
  });

  it('shows saved feedback when applying appearance settings', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    await user.click(await screen.findByRole('radio', { name: '全宽' }));
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(screen.getByText('设置已保存。')).toBeTruthy();
  });

  it('saves appearance font settings with the rest of appearance settings', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));
    expect(await screen.findByRole('combobox', { name: '文档字体' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '应用' }));

    expect(saveAppSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          fonts: {
            code: 'JetBrains Mono',
            document: 'Songti SC',
            ui: 'SF Pro Text',
          },
        }),
      }),
    );
  });

  it('keeps font selects hoverable and internally scrollable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const documentFontSelect = await screen.findByRole('combobox', {
      name: '文档字体',
    });
    expect(documentFontSelect.className).toContain('hover:bg-accent/60');
    expect(documentFontSelect.className).toContain('data-[state=open]:bg-accent');

    await user.click(documentFontSelect);

    const fontSelectContent = await screen.findByTestId(
      'font-select-content-文档字体',
    );
    expect(fontSelectContent.className).toContain(
      'max-h-[min(22rem,var(--radix-select-content-available-height))]',
    );
    expect(fontSelectContent.className).toContain('overflow-y-auto');
    expect(fontSelectContent.className).toContain('overscroll-contain');
  });

  it('applies persisted appearance fonts to workspace CSS variables', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      ...defaultAppSettings,
      appearance: {
        fonts: {
          code: 'SF Mono',
          document: 'Songti SC',
          ui: 'PingFang SC',
        },
        pageWidthMode: 'wide',
      },
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await waitFor(() => {
      expect(
        document.documentElement.style
          .getPropertyValue('--madora-ui-font')
          .includes("'PingFang SC'"),
      ).toBe(true);
      expect(
        document.documentElement.style
          .getPropertyValue('--madora-document-font')
          .includes("'Songti SC'"),
      ).toBe(true);
      expect(
        document.documentElement.style
          .getPropertyValue('--madora-code-font')
          .includes("'SF Mono'"),
      ).toBe(true);
    });
  });

  it('filters storage settings with the settings search input', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开设置' }));

    const searchInput = await screen.findByRole('searchbox', {
      name: '搜索设置',
    });

    await user.type(searchInput, '引用');

    expect(screen.getByDisplayValue('madora-asset://{assetId}')).toBeTruthy();
    expect(screen.queryByText('资源目录')).toBeNull();
    expect(screen.queryByText('清理策略')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, '上传');

    expect(screen.getByText('本地存储配置')).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, '不存在的设置');

    expect(screen.getByText('未找到设置')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '存储' })).toBeNull();
  });

  it('renders save state in the workspace bottom background area', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '# 项目说明\n\n正文 加粗',
    }));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('项目说明'));
    await screen.findByTestId('markdown-editor');

    const blocks = screen.getByTestId('workspace-main-blocks');
    const editorBlock = screen.getByTestId('workspace-editor-block');
    const statusBar = screen.getByTestId('workspace-status-bar');

    expect(blocks.className).toContain('flex-1');
    expect(editorBlock.dataset.chrome).toBe('codex-main-surface');
    expect(statusBar.textContent).toMatch(/^已保存词数 \d+行数 \d+字符 \d+UTF-8 · Markdown$/);
    expect(statusBar.className).toContain('shrink-0');
    expect(statusBar.className).toContain('justify-end');
    expect(statusBar.className).not.toContain('border-t');
    expect(statusBar.className).not.toContain('absolute');
    expect(
      editorBlock.compareDocumentPosition(statusBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId('editor-status-bar')).toBeNull();
  });

  it('uses the Codex-inspired workspace chrome around the sidebar and editor', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const shell = screen.getByTestId('workspace-shell');
    const sidebar = screen.getByTestId('workspace-sidebar');
    const editorColumn = screen.getByTestId('workspace-editor-column');
    const editorBlock = screen.getByTestId('workspace-editor-block');
    const editorPaneContent = screen.getByTestId('editor-pane-content');

    expect(shell.dataset.chrome).toBe('codex-workspace');
    expect(sidebar.dataset.chrome).toBe('codex-sidebar');
    expect(sidebar.className).not.toContain('shadow-sm');
    expect(sidebar.className).not.toContain('rounded-lg');
    expect(
      Array.from(sidebar.querySelectorAll('span')).some((element) =>
        ['bg-[#ff5f57]', 'bg-[#febc2e]', 'bg-[#28c840]'].some((className) =>
          element.className.includes(className),
        ),
      ),
    ).toBe(false);
    expect(screen.queryByText('项目')).toBeNull();
    expect(editorColumn.className).toContain('rounded-xl');
    expect(editorColumn.className).toContain('shadow-[');
    expect(editorBlock.className).not.toContain('rounded-xl');
    expect(editorBlock.className).not.toContain('shadow-[');
    expect(editorBlock.className).not.toContain('my-2');
    expect(editorBlock.className).not.toContain('mr-2');
    expect(editorPaneContent.className).toContain(
      'workspace-editor-scrollarea',
    );
  });

  it('keeps the top header free of the placeholder document tab', () => {
    render(<WorkspaceLayout initialSnapshot={null} />);

    expect(screen.queryByText('Madora')).toBeNull();
    expect(screen.getByRole('button', { name: '搜索文档' })).toBeTruthy();
    expect(screen.getByTestId('right-header-tools')).toBeTruthy();
  });

  it('shows a quiet Madora empty state before a workspace document is selected', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const emptyState = screen.getByTestId('workspace-document-empty-state');

    expect(
      within(emptyState)
        .getAllByAltText('')
        .map((image) => image.getAttribute('src')),
    ).toEqual(
      expect.arrayContaining([
        '/brand/madora-logo-dark.svg',
        '/brand/madora-logo-light.svg',
      ]),
    );
    expect(
      within(emptyState).getByRole('heading', {
        name: '先让它存在，再把它做好',
      }),
    ).toBeTruthy();
    expect(
      within(emptyState).getByText('Make it exist first. Make it good later.'),
    ).toBeTruthy();
    expect(screen.queryByText('选择左侧文档开始编辑')).toBeNull();
    expect(screen.queryByText('Madora 会展示工作区中的文档。')).toBeNull();
  });

  it('shows a capped recent document list in the empty state and reopens an item', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockImplementation((_rootPath, documentPath) => {
      const node = manyDocumentSnapshot.nodes.find(
        (item) => item.absolutePath === documentPath,
      );

      return Promise.resolve(markdownDocument({
        path: documentPath,
        title: node?.title ?? '文档',
      }));
    });

    render(<WorkspaceLayout initialSnapshot={manyDocumentSnapshot} />);

    for (const node of manyDocumentSnapshot.nodes) {
      await user.click(screen.getByText(node.title ?? node.name));
    }

    for (const number of [1, 2, 3, 4, 5, 6]) {
      await user.click(
        await screen.findByRole('button', {
          name: new RegExp(`关闭标签页 文档 ${number}`),
        }),
      );
    }

    const recentList = await screen.findByTestId(
      'workspace-recent-documents-list',
    );
    const recentItems = within(recentList).getAllByRole('button');

    expect(recentItems).toHaveLength(5);
    expect(within(recentList).queryByText('文档 1')).toBeNull();
    expect(within(recentList).getByText('文档 6')).toBeTruthy();

    await user.click(within(recentList).getByRole('button', { name: /文档 6/ }));

    expect(readMarkdownDocumentMock).toHaveBeenLastCalledWith(
      '/repo',
      '/repo/doc-6.md',
    );
    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();
  });

  it('restores recent documents from persisted metadata on cold start', async () => {
    // getRecentWorkspacePath 优先读 workspace history（而非裸 localStorage key）
    recordWorkspaceHistory(manyDocumentSnapshot);
    loadWorkspaceTreeMock.mockResolvedValue(manyDocumentSnapshot);
    ensureWorkspaceMock.mockResolvedValue({
      schemaVersion: 1,
      recentDocumentPaths: ['/repo/doc-6.md', '/repo/doc-5.md'],
      expandedPaths: [],
      sortOrder: {},
    });

    render(<WorkspaceLayout initialSnapshot={null} />);

    const recentList = await screen.findByTestId(
      'workspace-recent-documents-list',
    );

    // metadata 的 doc-6、doc-5 被解析展示，验证初始加载 effect 生效
    expect(within(recentList).getByText('文档 6')).toBeTruthy();
    expect(within(recentList).getByText('文档 5')).toBeTruthy();
  });

  it('shows workspace guide in the top workspace entry when there is no history', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('还没有打开过的工作区')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建工作区' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择其他目录' })).toBeTruthy();
  });

  it('creates a workspace from the top workspace entry', async () => {
    const user = userEvent.setup();
    createWorkspaceRootMock.mockResolvedValueOnce({
      rootPath: '/Users/refinex/知识库',
      rootName: '知识库',
      nodes: [],
    });
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建工作区' }));
    await user.type(screen.getByLabelText('工作区名称'), '知识库');
    await user.type(screen.getByLabelText('所在目录'), '/Users/refinex');
    await user.click(screen.getByRole('button', { name: '创建并打开' }));

    expect(createWorkspaceRootMock).toHaveBeenCalledWith(
      '/Users/refinex',
      '知识库',
    );
    expect((await screen.findAllByText('知识库')).length).toBeGreaterThan(0);
    expect(screen.queryByText('/Users/refinex/知识库')).toBeNull();
  });

  it('fills workspace parent path from directory picker', async () => {
    const user = userEvent.setup();
    selectWorkspaceParentDirectoryMock.mockResolvedValueOnce('/Users/refinex');
    render(<WorkspaceLayout initialSnapshot={null} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建工作区' }));
    await user.click(screen.getByRole('button', { name: '选择所在目录' }));

    expect((screen.getByLabelText('所在目录') as HTMLInputElement).value).toBe(
      '/Users/refinex',
    );
  });

  it('shows first-content actions in an empty workspace', () => {
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    expect(screen.getByText('开始创建你的第一个文档')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '新建文档' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '新建目录' }).length).toBeGreaterThan(0);
    expect(screen.getByText('这个工作区还没有文档')).toBeTruthy();
  });

  it('creates and opens the first document from the editor empty state', async () => {
    const user = userEvent.setup();
    const createdNode = {
      id: 'untitled',
      name: '未命名文档.md',
      kind: 'document' as const,
      relativePath: '未命名文档.md',
      absolutePath: '/repo/未命名文档.md',
      title: '未命名文档',
    };
    createMarkdownDocumentMock.mockResolvedValueOnce({
      content: markdownDocument({
        body: '',
        path: createdNode.absolutePath,
        title: '未命名文档',
      }),
      node: createdNode,
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '',
      path: createdNode.absolutePath,
      title: '未命名文档',
    }));
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    await user.click(screen.getAllByRole('button', { name: '新建文档' })[0]);

    expect(createMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名文档',
    );
    expect(loadWorkspaceTreeMock).not.toHaveBeenCalled();
    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();
  });

  it('creates a first directory from the sidebar empty state', async () => {
    const user = userEvent.setup();
    createWorkspaceDirectoryMock.mockResolvedValueOnce({
      id: '未命名目录',
      name: '未命名目录',
      kind: 'directory',
      relativePath: '未命名目录',
      absolutePath: '/repo/未命名目录',
      children: [],
    });
    render(<WorkspaceLayout initialSnapshot={{ ...snapshot, nodes: [] }} />);

    await user.click(screen.getAllByRole('button', { name: '新建目录' })[1]);

    expect(createWorkspaceDirectoryMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名目录',
    );
    expect(loadWorkspaceTreeMock).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('未命名目录')).toBeTruthy();
  });

  it('shows current workspace in the top entry for quick switching', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('最近工作区')).toBeTruthy();
    expect(screen.getAllByText('repo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/repo').length).toBeGreaterThan(0);
  });

  it('creates root documents and directories from the top workspace entry', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    createMarkdownDocumentMock.mockResolvedValueOnce({
      content: markdownDocument({
        body: '',
        path: '/repo/未命名文档.md',
        title: '未命名文档',
      }),
      node: {
        id: 'untitled',
        name: '未命名文档.md',
        kind: 'document',
        relativePath: '未命名文档.md',
        absolutePath: '/repo/未命名文档.md',
        title: '未命名文档',
      },
    });
    createWorkspaceDirectoryMock.mockResolvedValueOnce({
      id: '未命名目录',
      name: '未命名目录',
      kind: 'directory',
      relativePath: '未命名目录',
      absolutePath: '/repo/未命名目录',
      children: [],
    });
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      body: '',
      path: '/repo/未命名文档.md',
      title: '未命名文档',
    }));
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建文档' }));
    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '新建目录' }));

    expect(createMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名文档',
    );
    expect(createWorkspaceDirectoryMock).toHaveBeenCalledWith(
      '/repo',
      '',
      '未命名目录',
    );
    expect(loadWorkspaceTreeMock).not.toHaveBeenCalled();
  });

  it('does not render the duplicated bottom workspace switcher', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('workspace-switcher-footer')).toBeNull();
  });

  it('uses a glow status dot instead of a folder icon for the workspace entry', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-status-dot')).toBeTruthy();
    expect(screen.queryByTestId('workspace-root-folder-icon')).toBeNull();
  });

  it('closes the workspace menu when clicking outside the switcher card', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));

    expect(screen.getByText('最近工作区')).toBeTruthy();

    await user.click(document.body);

    expect(screen.queryByText('最近工作区')).toBeNull();
  });

  it('removes a workspace from recent workspace menu', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({
      path: '/repo/README.md',
      title: '项目说明',
    }));
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 1,
        },
      ]),
    );
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByTestId('tree-row-readme'));

    expect(await screen.findByRole('tab', { name: '项目说明' })).toBeTruthy();
    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '移除工作区 repo' }));

    expect(
      screen.queryByRole('button', { name: '移除工作区 repo' }),
    ).toBeNull();
    await waitFor(() => {
      expect(screen.getByText('还没有打开过的工作区')).toBeTruthy();
      expect(screen.queryByText('项目说明')).toBeNull();
      expect(screen.queryByRole('tab', { name: '项目说明' })).toBeNull();
      expect(screen.queryByTestId('markdown-editor')).toBeNull();
    });
    expect(screen.queryByText('/repo')).toBeNull();
    expect(screen.getByText('打开一个工作区')).toBeTruthy();
  });

  it('auto-advances to the next workspace when removing the current workspace', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        autoAdvanceTarget: 'next',
      },
    });
    const user = userEvent.setup();
    const docsSnapshot: WorkspaceSnapshot = {
      rootName: 'docs',
      rootPath: '/docs',
      nodes: [],
    };

    loadWorkspaceTreeMock.mockResolvedValueOnce(docsSnapshot);
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 3,
        },
        {
          rootName: 'docs',
          rootPath: '/docs',
          lastOpenedAt: 2,
        },
      ]),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    await waitFor(() => expect(readAppSettingsMock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '移除工作区 repo' }));

    await waitFor(() => {
      expect(loadWorkspaceTreeMock).toHaveBeenCalledWith('/docs');
      expect(screen.getAllByText('docs').length).toBeGreaterThan(0);
      expect(screen.getAllByText('/docs').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('打开一个工作区')).toBeNull();
  });

  it('auto-advances to the previous workspace when removing the current workspace', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        autoAdvanceTarget: 'previous',
      },
    });
    const user = userEvent.setup();
    const notesSnapshot: WorkspaceSnapshot = {
      rootName: 'notes',
      rootPath: '/notes',
      nodes: [],
    };

    loadWorkspaceTreeMock.mockResolvedValueOnce(notesSnapshot);
    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'notes',
          rootPath: '/notes',
          lastOpenedAt: 4,
        },
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 3,
        },
        {
          rootName: 'docs',
          rootPath: '/docs',
          lastOpenedAt: 2,
        },
      ]),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    await waitFor(() => expect(readAppSettingsMock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '移除工作区 repo' }));

    await waitFor(() => {
      expect(loadWorkspaceTreeMock).toHaveBeenCalledWith('/notes');
      expect(screen.getAllByText('notes').length).toBeGreaterThan(0);
      expect(screen.getAllByText('/notes').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('打开一个工作区')).toBeNull();
  });

  it('keeps the workspace closed when auto-advance is set to close', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    readAppSettingsMock.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        autoAdvanceTarget: 'close',
      },
    });
    const user = userEvent.setup();

    window.localStorage.setItem(
      'madora:workspace-history',
      JSON.stringify([
        {
          rootName: 'repo',
          rootPath: '/repo',
          lastOpenedAt: 3,
        },
        {
          rootName: 'docs',
          rootPath: '/docs',
          lastOpenedAt: 2,
        },
      ]),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    await waitFor(() => expect(readAppSettingsMock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '打开工作区菜单' }));
    await user.click(screen.getByRole('button', { name: '移除工作区 repo' }));

    await waitFor(() => {
      expect(screen.getByText('打开一个工作区')).toBeTruthy();
    });
    expect(loadWorkspaceTreeMock).not.toHaveBeenCalled();
    expect(screen.queryByText('/repo')).toBeNull();
  });

  it('removes duplicated workspace display above search box', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByRole('button', { name: '切换工作区' })).toBeNull();
    expect(screen.getByRole('button', { name: '展开侧边栏搜索' })).toBeTruthy();
    expect(
      screen
        .getByTestId('workspace-sidebar')
        .querySelector('[data-workspace-tree-scroll-container="true"]')
        ?.className,
    ).toContain('workspace-tree-scrollarea');
  });

  it('does not reserve an extra app title row in the web layout', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('workspace-titlebar')).toBeNull();
    expect(screen.queryByTestId('windows-titlebar-controls')).toBeNull();
    expect(screen.getByTestId('workspace-main-header').className).not.toContain(
      'border-b',
    );
    expect(screen.queryByText('未选择文档')).toBeNull();
    expect(screen.getByRole('button', { name: '展开侧边栏搜索' })).toBeTruthy();
  });

  it('renders compact Windows titlebar controls in the Tauri Windows runtime', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-titlebar-drag-region')).toBeTruthy();
    expect(
      screen.getByTestId('workspace-titlebar-drag-region').className,
    ).not.toContain('border-b');
    expect(screen.getByTestId('windows-titlebar-controls')).toBeTruthy();
    expect(screen.getByTestId('sidebar-chrome-toggle').className).toContain(
      'left-2',
    );
    expect(screen.getByTestId('workspace-main-header').className).toContain(
      'h-8',
    );
    expect(screen.getByTestId('workspace-main-header').className).toContain(
      'items-center',
    );
    expect(screen.getByTestId('workspace-main-header').className).not.toContain(
      'h-11',
    );
    expect(screen.getByTestId('workspace-main-header').className).not.toContain(
      'h-[76px]',
    );
    expect(screen.getByTestId('right-header-tools').className).toContain(
      'mr-[150px]',
    );
    expect(screen.getByTestId('right-header-tools').className).not.toContain(
      'self-end',
    );

    await user.click(screen.getByRole('button', { name: '最小化窗口' }));
    await user.click(screen.getByRole('button', { name: '最大化或还原窗口' }));
    await user.click(screen.getByRole('button', { name: '关闭窗口' }));

    expect(minimizeAppWindowMock).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeAppWindowMock).toHaveBeenCalledTimes(1);
    expect(closeAppWindowMock).toHaveBeenCalledTimes(1);
  });

  it('opens global search from the titlebar and opens a full-text result', async () => {
    const user = userEvent.setup();
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    readMarkdownDocumentMock.mockImplementation(async (_rootPath, documentPath) =>
      markdownDocument({
        body:
          documentPath === '/repo/a.md'
            ? '这里包含审计追踪和运维治理的正文内容。'
            : '这里讨论普通的日常笔记。',
        path: documentPath,
        title: documentPath === '/repo/a.md' ? '文档 A' : '文档 B',
      }),
    );

    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByRole('button', { name: '搜索文档' }));
    await user.type(await screen.findByRole('searchbox', { name: '搜索文档' }), '审计追踪');

    const result = await screen.findByRole('button', {
      name: /打开文档 文档 A/u,
    });
    expect(result.textContent).toContain('审计追踪');

    await user.click(result);

    await waitFor(() => {
      expect(readMarkdownDocumentMock).toHaveBeenLastCalledWith(
        '/repo',
        '/repo/a.md',
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps global search inside the viewport on narrow windows', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={multiDocumentSnapshot} />);

    await user.click(screen.getByRole('button', { name: '搜索文档' }));

    const dialogContent = document.querySelector('[data-slot="dialog-content"]');
    const searchbox = await screen.findByRole('searchbox', { name: '搜索文档' });
    const searchHeader = searchbox.closest('[data-global-search-header]');
    const results = document.querySelector('[data-global-search-results]');

    expect(dialogContent?.className).toContain('w-[min(calc(100vw-1.5rem),48rem)]');
    expect(dialogContent?.className).toContain('max-h-[calc(100vh-2rem)]');
    expect(dialogContent?.className).toContain('translate-y-0');
    expect(searchHeader?.className).toContain('min-w-0');
    expect(searchbox.className).toContain('min-w-0');
    expect(searchbox.className).toContain('flex-1');
    expect(results?.className).toContain('max-h-[calc(100vh-5rem)]');
  });

  it('opens global search from keyboard shortcuts', async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    readMarkdownDocumentMock.mockResolvedValue(markdownDocument({}));

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: 'Shift' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('keeps the active document title out of the editor body chrome', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce(markdownDocument({}));
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.queryByTestId('editor-document-path')).toBeNull();

    await user.click(screen.getByText('项目说明'));

    expect(await screen.findByTestId('markdown-editor')).toBeTruthy();
    expect(screen.queryByTestId('editor-document-path')).toBeNull();
  });

  it('resizes the left sidebar by dragging within configured bounds', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 520, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');
    expect(
      window.localStorage.getItem(
        'madora:workspace:left-sidebar-width',
      ),
    ).toBe('420');
  });

  it('resizes the right panel by dragging within configured bounds', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    const handle = screen.getByRole('separator', {
      name: '调整右侧面板宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 600, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.getByTestId('document-meta-panel').style.width).toBe('520px');
    expect(
      window.localStorage.getItem('madora:workspace:right-panel-width'),
    ).toBe('520');
  });

  it('supports keyboard resizing from the separator handles', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    handle.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Home}{End}');

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');
  });

  it('only shows the right resize handle when the related panel is visible', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(
      screen.getByRole('separator', { name: '调整左侧目录宽度' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('separator', { name: '调整右侧面板宽度' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    expect(
      screen.getByRole('separator', { name: '调整右侧面板宽度' }),
    ).toBeTruthy();
  });

  it('keeps resize handles inside the existing block gap', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const leftHandle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    expect(leftHandle.className).toContain('w-2');
    expect(leftHandle.className).toContain('-mx-2');
    expect(leftHandle.className).toContain('z-10');
    expect(screen.getByTestId('workspace-sidebar').className).not.toContain(
      'transition-[width]',
    );

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    const rightHandle = screen.getByRole('separator', {
      name: '调整右侧面板宽度',
    });

    expect(rightHandle.className).toContain('w-2');
    expect(rightHandle.className).toContain('-mx-2');
    expect(rightHandle.className).toContain('z-10');
  });

  it('keeps the resized left sidebar width', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const handle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 360, pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('360px');
  });

  it('toggles the left sidebar from the macOS chrome area', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const collapseButton = screen.getByRole('button', { name: '折叠侧边栏' });
    const toggleContainer = screen.getByTestId('sidebar-chrome-toggle');

    expect(toggleContainer.className).toContain('left-[80px]');
    expect(toggleContainer.className).toContain('top-0');
    expect(collapseButton.dataset.sidebarToggleState).toBe('expanded');
    expect(screen.getByTestId('workspace-sidebar')).toBeTruthy();
    expect(
      screen.getByRole('separator', { name: '调整左侧目录宽度' }),
    ).toBeTruthy();

    await user.click(collapseButton);

    const expandButton = screen.getByRole('button', { name: '展开侧边栏' });
    const collapsedSidebar = screen.getByTestId('workspace-sidebar');
    const collapsedHandle = screen.getByRole('separator', {
      name: '调整左侧目录宽度',
    });

    expect(screen.getByTestId('sidebar-chrome-toggle')).toBe(toggleContainer);
    expect(expandButton.dataset.sidebarToggleState).toBe('collapsed');
    expect(collapsedSidebar.classList).not.toContain('hidden');
    expect(collapsedSidebar.className).toContain('transition-[width,opacity]');
    expect(collapsedSidebar.style.width).toBe('0px');
    expect(
      screen
        .getByTestId('workspace-sidebar-content')
        .getAttribute('aria-hidden'),
    ).toBe('true');
    expect(collapsedHandle.className).toContain('opacity-0');
    expect(collapsedHandle.className).toContain('pointer-events-none');

    await user.click(expandButton);

    expect(screen.getByRole('button', { name: '折叠侧边栏' })).toBeTruthy();
    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('280px');
    expect(
      screen
        .getByTestId('workspace-sidebar-content')
        .getAttribute('aria-hidden'),
    ).toBe('false');
  });

  it('refreshes the workspace tree from the sidebar chrome without blocking the shell', async () => {
    const user = userEvent.setup();
    let resolveRefresh: (snapshot: WorkspaceSnapshot) => void = () => {};
    const refreshPromise = new Promise<WorkspaceSnapshot>((resolve) => {
      resolveRefresh = resolve;
    });
    loadWorkspaceTreeMock.mockReturnValueOnce(refreshPromise);

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const refreshButton = screen.getByRole('button', { name: '刷新工作区' });

    expect(refreshButton.parentElement).toBe(
      screen.getByTestId('sidebar-chrome-toggle'),
    );
    expect(refreshButton.getAttribute('data-refreshing')).toBe('false');

    await user.click(refreshButton);

    expect(loadWorkspaceTreeMock).toHaveBeenCalledWith('/repo');
    expect(refreshButton.getAttribute('data-refreshing')).toBe('true');
    expect(refreshButton.querySelector('svg')?.className.baseVal).toContain(
      'animate-spin',
    );
    expect(
      screen
        .getByRole('button', { name: '折叠侧边栏' })
        .hasAttribute('disabled'),
    ).toBe(false);

    resolveRefresh({
      ...snapshot,
      nodes: [
        ...snapshot.nodes,
        {
          id: 'external',
          name: 'external.md',
          kind: 'document',
          relativePath: 'external.md',
          absolutePath: '/repo/external.md',
          title: '外部文档',
        },
      ],
    });

    expect(await screen.findByText('外部文档')).toBeTruthy();
    expect(refreshButton.getAttribute('data-refreshing')).toBe('false');
  });

  it('uses default widths for the resizable workspace panels', async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const sidebar = screen.getByTestId('workspace-sidebar');

    expect(sidebar.style.width).toBe('280px');

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    expect(screen.getByTestId('document-meta-panel').style.width).toBe('340px');
  });

  it('loads persisted panel widths and clamps invalid stored values', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'madora:workspace:left-sidebar-width',
      '999',
    );
    window.localStorage.setItem(
      'madora:workspace:right-panel-width',
      '120',
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    expect(screen.getByTestId('workspace-sidebar').style.width).toBe('420px');

    await user.click(screen.getByRole('button', { name: '展开元信息面板' }));

    expect(screen.getByTestId('document-meta-panel').style.width).toBe('340px');
  });

  it('removes the left directory toggle and keeps global search centered in the header', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const headerSearch = screen.getByRole('button', { name: '搜索文档' });

    expect(screen.queryByTestId('left-tool-rail')).toBeNull();
    expect(screen.queryByRole('button', { name: '折叠目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '展开目录' })).toBeNull();
    expect(headerSearch.dataset.chrome).toBe('codex-centered-search');
    expect(headerSearch.className).toContain('left-1/2');
    expect(screen.queryByTestId('workspace-titlebar')).toBeNull();
  });

  it('opens the terminal bottom panel from the right header tools', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));

    const terminalPanel = await screen.findByTestId('terminal-panel');
    const mainBlocks = screen.getByTestId('workspace-main-blocks');
    const editorColumn = screen.getByTestId('workspace-editor-column');
    const editorBlock = screen.getByTestId('workspace-editor-block');

    expect(terminalPanel).toBeTruthy();
    expect(mainBlocks.className).toContain('min-w-0');
    expect(mainBlocks.className).toContain('overflow-hidden');
    expect(editorColumn.contains(editorBlock)).toBe(true);
    expect(editorColumn.contains(terminalPanel)).toBe(true);
    expect(
      editorBlock.compareDocumentPosition(terminalPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(terminalPanel.className).toContain('w-full');
    expect(terminalPanel.className).toContain('min-w-0');
    expect(terminalPanel.className).toContain('max-w-full');
    expect(terminalPanel.className).not.toContain('rounded-lg');
    expect(terminalPanel.className).not.toContain('shadow-sm');
    expect(terminalPanel.className).toContain('border-t');
    expect(editorColumn.className).toContain('rounded-xl');
    expect(editorColumn.className).toContain('shadow-[');
    expect(within(terminalPanel).queryByText('终端')).toBeNull();
    expect(within(terminalPanel).queryByText('repo')).toBeNull();
    expect(await screen.findByRole('tab', { name: /本地/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /本地 2/ })).toBeNull();
    expect(terminalSpawnMock).toHaveBeenCalledTimes(1);
    expect(terminalSpawnMock).toHaveBeenCalledWith('/repo', 120, 32);
  });

  it('places Git and terminal tools in the right header tool group', () => {
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const rightHeaderTools = screen.getByTestId('right-header-tools');
    const terminalButton = screen.getByRole('button', { name: '打开终端' });
    const gitLogButton = screen.getByRole('button', { name: '打开 Git 日志' });
    const gitButton = screen.getByRole('button', { name: '打开 Git 面板' });

    expect(rightHeaderTools.contains(gitButton)).toBe(true);
    expect(rightHeaderTools.contains(terminalButton)).toBe(true);
    expect(rightHeaderTools.contains(gitLogButton)).toBe(true);
  });

  it('shows hover tooltips for the right header tools', async () => {
    const assertTooltip = async (label: string) => {
      const user = userEvent.setup();
      const { unmount } = render(<WorkspaceLayout initialSnapshot={snapshot} />);

      const button = screen.getByRole('button', { name: label });
      await user.hover(button);

      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);

      unmount();
    };

    await assertTooltip('切换主题');
    await assertTooltip('打开 Git 面板');
    await assertTooltip('打开终端');
    await assertTooltip('打开 Git 日志');
  });

  it('updates the terminal tooltip when the bottom terminal is open', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    const openTerminalButton = screen.getByRole('button', { name: '打开终端' });
    await user.click(openTerminalButton);
    await screen.findByTestId('terminal-panel');
    await user.unhover(openTerminalButton);

    const closeTerminalButton = screen.getByRole('button', { name: '关闭终端' });
    await user.hover(closeTerminalButton);

    expect((await screen.findAllByText('关闭终端')).length).toBeGreaterThan(0);
  });

  it('keeps terminal tab instances mounted when switching tabs', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    terminalSpawnMock
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-1',
        shell: '/bin/zsh',
      })
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-2',
        shell: '/bin/zsh',
      });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));
    await screen.findByRole('tab', { name: /^本地$/ });
    await user.click(screen.getByRole('button', { name: '新建终端标签页' }));
    await screen.findByRole('tab', { name: /本地 2/ });
    await user.click(screen.getByRole('tab', { name: /^本地$/ }));

    expect(screen.getByTestId('mock-xterm-term-1')).toBeTruthy();
    expect(screen.getByTestId('mock-xterm-term-2')).toBeTruthy();
  });

  it('keeps terminal instance mounted when closing and reopening the terminal panel', async () => {
    const user = userEvent.setup();

    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
    terminalSpawnMock.mockResolvedValueOnce({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByRole('button', { name: '打开终端' }));
    await screen.findByRole('tab', { name: /^本地$/ });

    const terminalInstance = screen.getByTestId('mock-xterm-term-1');

    await user.click(screen.getByRole('button', { name: '关闭终端' }));

    expect(screen.getByRole('button', { name: '打开终端' })).toBeTruthy();
    expect(screen.getByTestId('mock-xterm-term-1')).toBe(terminalInstance);

    await user.click(screen.getByRole('button', { name: '打开终端' }));

    expect(screen.getByTestId('mock-xterm-term-1')).toBe(terminalInstance);
    expect(terminalSpawnMock).toHaveBeenCalledTimes(1);
  });
});

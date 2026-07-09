import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelAiTurn,
  createAiCommand,
  createAiCustomAgent,
  createAiMcpServer,
  authenticateAiMcpServer,
  createAiSkill,
  deleteAiAnthropicAccount,
  openAiClaudeCodeOAuthUrl,
  createWorkspaceDirectory,
  createWorkspaceRoot,
  deleteAiCommand,
  deleteAiCustomAgent,
  deleteAiMcpServer,
  logoutAiMcpServer,
  deleteAiSkill,
  deleteAiProviderSecret,
  deleteWorkspaceNode,
  detectAiAccounts,
  ensureWorkspace,
  getAiProviderSecretStatus,
  getRecentWorkspacePath,
  getWorkspaceHistory,
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
  gitPush,
  gitRevertFile,
  gitStage,
  gitStatus,
  gitUnstage,
  listAiCommands,
  listAiAgentProfiles,
  listAiAnthropicAccounts,
  listAiConversations,
  listAiCustomAgents,
  listAiMcpServers,
  listAiPlugins,
  logoutCodexAccount,
  listAiSkills,
  listenAiEvents,
  listenTerminalData,
  listenTerminalError,
  listenTerminalExit,
  listDailyNotesForMonth,
  moveWorkspaceNode,
  openDailyNote,
  openPathInFileManager,
  openPathInPreferredEditor,
  readMarkdownSourceFiles,
  readAppSettings,
  readAiConversation,
  readWorkspaceAssetData,
  recordRecentDocument,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  renameWorkspaceNode,
  respondAiPermission,
  requestAiChat,
  requestAiProviderJson,
  saveAppSettings,
  saveAiConversation,
  saveAiProviderSecret,
  sendAiPrompt,
  startAiClaudeCodeAuth,
  startCodexLogin,
  getCodexLoginSession,
  cancelCodexLogin,
  openCodexLoginUrl,
  importAiAnthropicAccountToken,
  pollAiClaudeCodeAuthStatus,
  renameAiAnthropicAccount,
  setAiAnthropicAccountActive,
  setAiPluginEnabled,
  setAiPluginMcpServerApproved,
  setAiPluginMcpServersApproved,
  setAiMcpServerEnabled,
  submitAiClaudeCodeAuthCode,
  startAiSession,
  stopAiSession,
  terminalKill,
  terminalResize,
  terminalSpawn,
  terminalWrite,
  updateAiCommand,
  updateAiCustomAgent,
  updateAiMcpServer,
  updateAiSkill,
  uploadWorkspaceAsset,
} from '../workspace-api';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  revealItemInDir: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);
const revealItemInDirMock = vi.mocked(revealItemInDir);

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [],
};

describe('workspace-api history', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records opened workspaces as most recent first', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/docs',
      rootName: 'docs',
      nodes: [],
    });

    expect(getWorkspaceHistory()).toEqual([
      expect.objectContaining({ rootName: 'docs', rootPath: '/docs' }),
      expect.objectContaining({ rootName: 'repo', rootPath: '/repo' }),
    ]);
    expect(getRecentWorkspacePath()).toBe('/docs');
  });

  it('deduplicates an existing workspace path', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/repo',
      rootName: 'repo-renamed',
      nodes: [],
    });

    expect(getWorkspaceHistory()).toHaveLength(1);
    expect(getWorkspaceHistory()[0]).toEqual(
      expect.objectContaining({ rootName: 'repo-renamed', rootPath: '/repo' }),
    );
  });

  it('removes a workspace from history without deleting other entries', () => {
    recordWorkspaceHistory(snapshot);
    recordWorkspaceHistory({
      rootPath: '/docs',
      rootName: 'docs',
      nodes: [],
    });

    expect(removeWorkspaceHistory('/docs')).toEqual([
      expect.objectContaining({ rootName: 'repo', rootPath: '/repo' }),
    ]);
    expect(getRecentWorkspacePath()).toBe('/repo');
  });

});

describe('workspace-api file manager opener', () => {
  beforeEach(() => {
    revealItemInDirMock.mockReset();
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reveals a path in the native file manager when running in Tauri', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });

    await openPathInFileManager('/repo/README.md');

    expect(revealItemInDirMock).toHaveBeenCalledWith('/repo/README.md');
  });

  it('does nothing outside the Tauri runtime', async () => {
    await openPathInFileManager('/repo/README.md');

    expect(revealItemInDirMock).not.toHaveBeenCalled();
  });

  it('opens a path in the configured preferred editor through Tauri', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });

    await openPathInPreferredEditor('/repo/README.md', 'cursor');

    expect(invokeMock).toHaveBeenCalledWith('open_path_in_preferred_editor', {
      app: 'cursor',
      path: '/repo/README.md',
    });
  });
});

describe('workspace-api node moves', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('keeps Windows parent paths intact when moving before a sibling', async () => {
    invokeMock.mockResolvedValueOnce(snapshot);

    await moveWorkspaceNode(String.raw`\\?\D:\vault`, {
      nodePath: String.raw`\\?\D:\vault\Docs\B.md`,
      position: 'before',
      targetPath: String.raw`\\?\D:\vault\Docs\A.md`,
    });

    expect(invokeMock).toHaveBeenCalledWith('move_workspace_node', {
      rootPath: String.raw`\\?\D:\vault`,
      nodePath: String.raw`\\?\D:\vault\Docs\B.md`,
      targetParentPath: String.raw`\\?\D:\vault\Docs`,
      beforePath: String.raw`\\?\D:\vault\Docs\A.md`,
      afterPath: null,
    });
  });

  it('keeps Windows directory targets intact when moving inside a directory', async () => {
    invokeMock.mockResolvedValueOnce(snapshot);

    await moveWorkspaceNode(String.raw`D:\vault`, {
      nodePath: String.raw`D:\vault\README.md`,
      position: 'inside',
      targetPath: String.raw`D:\vault\Guides`,
    });

    expect(invokeMock).toHaveBeenCalledWith('move_workspace_node', {
      rootPath: String.raw`D:\vault`,
      nodePath: String.raw`D:\vault\README.md`,
      targetParentPath: String.raw`D:\vault\Guides`,
      beforePath: null,
      afterPath: null,
    });
  });
});

describe('workspace-api native Git commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('wraps native Git commands through Tauri', async () => {
    invokeMock
      .mockResolvedValueOnce({
        branch: null,
        gitAvailable: true,
        isRepository: false,
        rootPath: '/repo',
      })
      .mockResolvedValueOnce({
        branch: 'main',
        gitAvailable: true,
        isRepository: true,
        rootPath: '/repo',
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        binary: false,
        content: 'diff --git a/a.md b/a.md',
        path: 'a.md',
        staged: false,
        truncated: false,
      })
      .mockResolvedValueOnce([
        {
          commit: 'abc123',
          current: true,
          fullName: 'refs/heads/main',
          kind: 'local',
          name: 'main',
          upstream: 'origin/main',
        },
      ])
      .mockResolvedValueOnce([
        {
          authorEmail: 'refinex@example.com',
          authorName: 'refinex',
          authoredAt: '2026-06-02T00:00:00Z',
          body: '',
          hash: 'abc123',
          refs: ['HEAD -> main'],
          shortHash: 'abc123',
          subject: 'docs: update a',
        },
      ])
      .mockResolvedValueOnce([
        {
          changeType: 'modified',
          oldPath: null,
          path: 'a.md',
          status: 'M',
        },
      ])
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      })
      .mockResolvedValueOnce({
        ahead: 0,
        behind: 0,
        branch: 'main',
        changes: [],
        rootPath: '/repo',
        upstream: null,
      });

    await gitProbe('/repo');
    await gitInit('/repo');
    await gitStatus('/repo');
    await gitDiff('/repo', 'a.md', false);
    await gitCommitFileDiff('/repo', 'abc123', 'a.md');
    await gitBranches('/repo');
    await gitLog('/repo');
    await gitCommitFiles('/repo', 'abc123');
    await gitStage('/repo', ['a.md']);
    await gitUnstage('/repo', ['a.md']);
    await gitCommit('/repo', 'docs: update a', ['a.md']);
    await gitPush('/repo');
    await gitRevertFile('/repo', 'a.md');
    await gitDeleteFile('/repo', 'a.md');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'git_probe', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'git_init', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'git_status', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'git_diff', {
      rootPath: '/repo',
      path: 'a.md',
      staged: false,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'git_commit_file_diff', {
      rootPath: '/repo',
      hash: 'abc123',
      path: 'a.md',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'git_branches', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'git_log', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'git_commit_files', {
      rootPath: '/repo',
      hash: 'abc123',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'git_stage', {
      rootPath: '/repo',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'git_unstage', {
      rootPath: '/repo',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'git_commit', {
      rootPath: '/repo',
      message: 'docs: update a',
      paths: ['a.md'],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(12, 'git_push', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(13, 'git_revert_file', {
      rootPath: '/repo',
      path: 'a.md',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(14, 'git_delete_file', {
      rootPath: '/repo',
      path: 'a.md',
    });
  });
});

describe('workspace-api terminal commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it('wraps terminal Tauri commands', async () => {
    invokeMock
      .mockResolvedValueOnce({
        cwd: '/repo',
        id: 'term-1',
        shell: '/bin/zsh',
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ status: 'missing' })
      .mockResolvedValueOnce({ status: 'configured' })
      .mockResolvedValueOnce({ status: 'missing' })
      .mockResolvedValueOnce({ status: 200, body: { data: [] } })
      .mockResolvedValueOnce({ status: 200, body: { text: 'ok' } });

    await expect(terminalSpawn('/repo', 120, 32)).resolves.toEqual({
      cwd: '/repo',
      id: 'term-1',
      shell: '/bin/zsh',
    });
    await terminalWrite('term-1', 'git status\r');
    await terminalResize('term-1', 100, 24);
    await terminalKill('term-1');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'terminal_spawn', {
      rootPath: '/repo',
      cols: 120,
      rows: 32,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'terminal_write', {
      sessionId: 'term-1',
      data: 'git status\r',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'terminal_resize', {
      sessionId: 'term-1',
      cols: 100,
      rows: 24,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'terminal_kill', {
      sessionId: 'term-1',
    });
  });

  it('wraps terminal event listeners', async () => {
    const onData = vi.fn();
    const onError = vi.fn();
    const onExit = vi.fn();
    const unlisten = vi.fn();

    listenMock
      .mockResolvedValueOnce(unlisten)
      .mockResolvedValueOnce(unlisten)
      .mockResolvedValueOnce(unlisten);

    await listenTerminalData(onData);
    await listenTerminalExit(onExit);
    await listenTerminalError(onError);

    expect(listenMock).toHaveBeenNthCalledWith(
      1,
      'terminal:data',
      expect.any(Function),
    );
    expect(listenMock).toHaveBeenNthCalledWith(
      2,
      'terminal:exit',
      expect.any(Function),
    );
    expect(listenMock).toHaveBeenNthCalledWith(
      3,
      'terminal:error',
      expect.any(Function),
    );
  });
});

describe('workspace-api AI runtime commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it('wraps AI runtime Tauri commands', async () => {
    const context = {
      intent: 'chat' as const,
      workspaceRootPath: '/repo',
    };

    invokeMock
      .mockResolvedValueOnce([
        {
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
        },
      ])
      .mockResolvedValueOnce([
        {
          commandPath: '/usr/local/bin/codex',
          id: 'codex',
          label: 'Codex',
          message: 'Local Codex app-server detected.',
          models: [],
          providerId: 'openai',
          providerLabel: 'OpenAI',
          status: 'connected',
          transport: 'app-server',
          version: 'codex-cli 0.130.0',
        },
      ])
      .mockResolvedValueOnce({
        profileId: 'fake-echo',
        rootPath: '/repo',
        sessionId: 'ai-1',
        status: 'running',
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await listAiAgentProfiles('/repo');
    await detectAiAccounts();
    await startAiSession({
      context,
      profileId: 'fake-echo',
      rootPath: '/repo',
    });
    await sendAiPrompt({
      context,
      prompt: 'hello',
      sessionId: 'ai-1',
    });
    await listAiConversations('/repo');
    await readAiConversation('/repo', 'conversation-1');
    await saveAiConversation('/repo', {
      createdAt: 1,
      documentPath: 'guide.md',
      documentTitle: 'Guide',
      id: 'conversation-1',
      messages: [{ content: 'hello', id: 'm1', role: 'user' }],
      permissions: [],
      profileId: 'fake-echo',
      profileLabel: 'Fake Echo',
      providerId: 'local',
      providerLabel: 'Local',
      title: 'hello',
      tools: [],
      updatedAt: 2,
    });
    await cancelAiTurn('ai-1');
    await respondAiPermission({
      behavior: 'allow',
      requestId: 'req-1',
      sessionId: 'ai-1',
      updatedInput: { command: 'pwd' },
    });
    await stopAiSession('ai-1');
    await getAiProviderSecretStatus('openai');
    await saveAiProviderSecret('openai', 'sk-test');
    await deleteAiProviderSecret('openai');
    await logoutCodexAccount();
    await requestAiProviderJson({
      headers: {},
      method: 'GET',
      providerId: 'openai',
      url: 'https://api.openai.com/v1/models',
    });
    await requestAiChat({
      body: '{"model":"gpt-5.4","input":"hello"}',
      headers: { 'OpenAI-Beta': 'responses=v1' },
      providerId: 'openai',
      url: 'https://api.openai.com/v1/responses',
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_ai_agent_profiles', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'detect_ai_accounts');
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'start_ai_session', {
      input: {
        context,
        profileId: 'fake-echo',
        rootPath: '/repo',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'send_ai_prompt', {
      input: {
        context,
        prompt: 'hello',
        sessionId: 'ai-1',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'list_ai_conversations', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'read_ai_conversation', {
      conversationId: 'conversation-1',
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'save_ai_conversation', {
      record: {
        createdAt: 1,
        documentPath: 'guide.md',
        documentTitle: 'Guide',
        id: 'conversation-1',
        messages: [{ content: 'hello', id: 'm1', role: 'user' }],
        permissions: [],
        profileId: 'fake-echo',
        profileLabel: 'Fake Echo',
        providerId: 'local',
        providerLabel: 'Local',
        title: 'hello',
        tools: [],
        updatedAt: 2,
      },
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'cancel_ai_turn', {
      sessionId: 'ai-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'respond_ai_permission', {
      input: {
        behavior: 'allow',
        requestId: 'req-1',
        sessionId: 'ai-1',
        updatedInput: { command: 'pwd' },
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'stop_ai_session', {
      sessionId: 'ai-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'get_ai_provider_secret_status', {
      providerId: 'openai',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(12, 'save_ai_provider_secret', {
      providerId: 'openai',
      secret: 'sk-test',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(13, 'delete_ai_provider_secret', {
      providerId: 'openai',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(14, 'logout_codex_account');
    expect(invokeMock).toHaveBeenNthCalledWith(15, 'request_ai_provider_json', {
      request: {
        headers: {},
        method: 'GET',
        providerId: 'openai',
        url: 'https://api.openai.com/v1/models',
      },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(16, 'request_ai_chat', {
      request: {
        body: '{"model":"gpt-5.4","input":"hello"}',
        headers: { 'OpenAI-Beta': 'responses=v1' },
        providerId: 'openai',
        url: 'https://api.openai.com/v1/responses',
      },
    });
  });

  it('wraps AI runtime event listener', async () => {
    const onEvent = vi.fn();
    const unlisten = vi.fn();

    listenMock.mockResolvedValueOnce(unlisten);

    await listenAiEvents(onEvent);

    expect(listenMock).toHaveBeenCalledWith('ai:event', expect.any(Function));
  });

  it('wraps AI settings inventory commands', async () => {
    invokeMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await listAiSkills('/repo');
    await listAiCommands('/repo');
    await listAiCustomAgents('/repo');
    await listAiMcpServers('/repo');
    await listAiPlugins();

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_ai_skills', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_ai_commands', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'list_ai_custom_agents', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'list_ai_mcp_servers', {
      rootPath: '/repo',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'list_ai_plugins');
  });

  it('wraps AI skills and commands write commands', async () => {
    invokeMock
      .mockResolvedValueOnce('/home/.claude/skills/doc/SKILL.md')
      .mockResolvedValueOnce('/home/.claude/skills/doc/SKILL.md')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('/repo/.claude/commands/git/commit.md')
      .mockResolvedValueOnce('/repo/.claude/commands/git/commit.md')
      .mockResolvedValueOnce(undefined);

    await createAiSkill('/repo', {
      source: 'user',
      name: 'doc',
      description: 'Write docs',
      content: 'Use docs.',
    });
    await updateAiSkill('/repo', {
      source: 'user',
      name: 'doc',
      description: 'Update docs',
      content: 'Use updated docs.',
    });
    await deleteAiSkill('/repo', { source: 'user', name: 'doc' });
    await createAiCommand('/repo', {
      source: 'project',
      name: 'git/commit',
      description: 'Commit',
      content: 'Commit changes.',
      argumentHint: '<message>',
    });
    await updateAiCommand('/repo', {
      source: 'project',
      name: 'git/commit',
      description: 'Commit updated',
      content: 'Commit updated changes.',
      argumentHint: null,
    });
    await deleteAiCommand('/repo', { source: 'project', name: 'git/commit' });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_ai_skill', {
      rootPath: '/repo',
      source: 'user',
      name: 'doc',
      description: 'Write docs',
      content: 'Use docs.',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'update_ai_skill', {
      rootPath: '/repo',
      source: 'user',
      name: 'doc',
      description: 'Update docs',
      content: 'Use updated docs.',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'delete_ai_skill', {
      rootPath: '/repo',
      source: 'user',
      name: 'doc',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'create_ai_command', {
      rootPath: '/repo',
      source: 'project',
      name: 'git/commit',
      description: 'Commit',
      content: 'Commit changes.',
      argumentHint: '<message>',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'update_ai_command', {
      rootPath: '/repo',
      source: 'project',
      name: 'git/commit',
      description: 'Commit updated',
      content: 'Commit updated changes.',
      argumentHint: null,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'delete_ai_command', {
      rootPath: '/repo',
      source: 'project',
      name: 'git/commit',
    });
  });

  it('wraps AI custom agents write commands', async () => {
    invokeMock
      .mockResolvedValueOnce('/repo/.claude/agents/reviewer.md')
      .mockResolvedValueOnce('/repo/.claude/agents/reviewer.md')
      .mockResolvedValueOnce(undefined);

    await createAiCustomAgent('/repo', {
      source: 'project',
      name: 'reviewer',
      description: 'Review code',
      prompt: 'Review carefully.',
      tools: ['Read', 'Grep'],
      disallowedTools: ['Bash'],
      model: 'sonnet',
    });
    await updateAiCustomAgent('/repo', {
      source: 'project',
      name: 'reviewer',
      description: 'Review code deeply',
      prompt: 'Review more carefully.',
      tools: ['Read'],
      disallowedTools: [],
      model: null,
    });
    await deleteAiCustomAgent('/repo', {
      source: 'project',
      name: 'reviewer',
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_ai_custom_agent', {
      rootPath: '/repo',
      source: 'project',
      name: 'reviewer',
      description: 'Review code',
      prompt: 'Review carefully.',
      tools: ['Read', 'Grep'],
      disallowedTools: ['Bash'],
      model: 'sonnet',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'update_ai_custom_agent', {
      rootPath: '/repo',
      source: 'project',
      name: 'reviewer',
      description: 'Review code deeply',
      prompt: 'Review more carefully.',
      tools: ['Read'],
      disallowedTools: [],
      model: null,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'delete_ai_custom_agent', {
      rootPath: '/repo',
      source: 'project',
      name: 'reviewer',
    });
  });

  it('wraps AI plugin enablement command', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setAiPluginEnabled('market:plugin', false);

    expect(invokeMock).toHaveBeenCalledWith('set_ai_plugin_enabled', {
      source: 'market:plugin',
      enabled: false,
    });
  });

  it('wraps AI plugin MCP approval command', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setAiPluginMcpServerApproved('market:plugin', 'context7', true);

    expect(invokeMock).toHaveBeenCalledWith(
      'set_ai_plugin_mcp_server_approved',
      {
        pluginSource: 'market:plugin',
        serverName: 'context7',
        approved: true,
      },
    );
  });

  it('wraps AI plugin MCP batch approval command', async () => {
    invokeMock.mockResolvedValueOnce(undefined);

    await setAiPluginMcpServersApproved('market:plugin', ['context7', 'browser'], false);

    expect(invokeMock).toHaveBeenCalledWith(
      'set_ai_plugin_mcp_servers_approved',
      {
        pluginSource: 'market:plugin',
        serverNames: ['context7', 'browser'],
        approved: false,
      },
    );
  });

  it('wraps 1Code-style Anthropic account management commands', async () => {
    invokeMock
      .mockResolvedValueOnce([
        {
          connectedAt: '2026-06-24T12:00:00.000Z',
          displayName: 'Work Claude',
          email: 'work@example.com',
          id: 'acct-work',
          isActive: true,
          lastUsedAt: null,
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        connectedAt: '2026-06-24T12:30:00.000Z',
        displayName: 'Imported Claude',
        email: 'imported@example.com',
        id: 'acct-imported',
        isActive: true,
        lastUsedAt: '2026-06-24T12:30:00.000Z',
      })
      .mockResolvedValueOnce(undefined);

    await listAiAnthropicAccounts();
    await setAiAnthropicAccountActive('acct-personal');
    await renameAiAnthropicAccount('acct-personal', 'Personal Claude');
    await importAiAnthropicAccountToken({
      displayName: 'Imported Claude',
      email: 'imported@example.com',
      token: 'oauth-token',
    });
    await deleteAiAnthropicAccount('acct-personal');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_ai_anthropic_accounts');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_ai_anthropic_account_active', {
      accountId: 'acct-personal',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'rename_ai_anthropic_account', {
      accountId: 'acct-personal',
      displayName: 'Personal Claude',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'import_ai_anthropic_account_token', {
      displayName: 'Imported Claude',
      email: 'imported@example.com',
      token: 'oauth-token',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'delete_ai_anthropic_account', {
      accountId: 'acct-personal',
    });
  });

  it('wraps 1Code-style Claude Code OAuth flow commands', async () => {
    invokeMock
      .mockResolvedValueOnce({
        sandboxId: 'sandbox-1',
        sandboxUrl: 'https://sandbox.example',
        sessionId: 'session-1',
      })
      .mockResolvedValueOnce({
        error: null,
        oauthUrl: 'https://claude.ai/oauth',
        state: 'has_url',
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });

    await startAiClaudeCodeAuth();
    await pollAiClaudeCodeAuthStatus({
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    await submitAiClaudeCodeAuthCode({
      code: 'auth#code',
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    await openAiClaudeCodeOAuthUrl('https://claude.ai/oauth');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'start_ai_claude_code_auth');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'poll_ai_claude_code_auth_status', {
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'submit_ai_claude_code_auth_code', {
      code: 'auth#code',
      sandboxUrl: 'https://sandbox.example',
      sessionId: 'session-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'open_ai_claude_code_oauth_url', {
      url: 'https://claude.ai/oauth',
    });
  });

  it('wraps 1Code-style Codex login session commands', async () => {
    invokeMock
      .mockResolvedValueOnce({
        error: null,
        exitCode: null,
        output: 'Open https://chatgpt.com/auth',
        sessionId: 'codex-login-1',
        state: 'running',
        url: 'https://chatgpt.com/auth',
      })
      .mockResolvedValueOnce({
        error: null,
        exitCode: 0,
        output: 'Logged in',
        sessionId: 'codex-login-1',
        state: 'success',
        url: 'https://chatgpt.com/auth',
      })
      .mockResolvedValueOnce({ found: true, success: true })
      .mockResolvedValueOnce({ success: true });

    await startCodexLogin();
    await getCodexLoginSession('codex-login-1');
    await cancelCodexLogin('codex-login-1');
    await openCodexLoginUrl('https://chatgpt.com/auth');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'start_codex_login');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_codex_login_session', {
      sessionId: 'codex-login-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'cancel_codex_login', {
      sessionId: 'codex-login-1',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'open_codex_login_url', {
      url: 'https://chatgpt.com/auth',
    });
  });

  it('wraps 1Code-style Codex integration status command', async () => {
    invokeMock.mockResolvedValueOnce({
      exitCode: 0,
      isConnected: true,
      rawOutput: 'Logged in using ChatGPT',
      state: 'connected_chatgpt',
    });

    await getCodexIntegration();

    expect(invokeMock).toHaveBeenCalledWith('get_codex_integration');
  });

  it('wraps AI MCP server write commands', async () => {
    invokeMock
      .mockResolvedValueOnce('/repo/.mcp.json')
      .mockResolvedValueOnce('/repo/.mcp.json')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await createAiMcpServer('/repo', {
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
      connectionType: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7'],
      url: null,
      env: {},
    });
    await setAiMcpServerEnabled('/repo', {
      source: 'project',
      name: 'context7',
      enabled: false,
    });
    await updateAiMcpServer('/repo', {
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
      connectionType: 'http',
      authType: 'bearer',
      bearerToken: 'mcp-token',
      command: null,
      args: [],
      url: 'https://mcp.example.com',
      env: {},
    });
    await deleteAiMcpServer('/repo', {
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
    });
    await createAiMcpServer('/repo', {
      provider: 'codex',
      source: 'global',
      name: 'codex-http',
      connectionType: 'http',
      command: null,
      args: [],
      url: 'https://mcp.example.com',
      env: {},
    });
    await authenticateAiMcpServer('/repo', {
      provider: 'codex',
      name: 'codex-http',
      projectPath: null,
    });
    await logoutAiMcpServer('/repo', {
      provider: 'codex',
      name: 'codex-http',
      projectPath: null,
    });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
      connectionType: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7'],
      url: null,
      env: {},
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'set_ai_mcp_server_enabled', {
      rootPath: '/repo',
      source: 'project',
      name: 'context7',
      enabled: false,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'update_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
      connectionType: 'http',
      authType: 'bearer',
      bearerToken: 'mcp-token',
      command: null,
      args: [],
      url: 'https://mcp.example.com',
      env: {},
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'delete_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'claude-code',
      source: 'project',
      name: 'context7',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'create_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'codex',
      source: 'global',
      name: 'codex-http',
      connectionType: 'http',
      command: null,
      args: [],
      url: 'https://mcp.example.com',
      env: {},
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'authenticate_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'codex',
      name: 'codex-http',
      projectPath: null,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'logout_ai_mcp_server', {
      rootPath: '/repo',
      provider: 'codex',
      name: 'codex-http',
      projectPath: null,
    });
  });
});

describe('workspace-api recent documents', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes record_recent_document with root and document path', async () => {
    invokeMock.mockResolvedValueOnce(['/repo/a.md']);

    const paths = await recordRecentDocument('/repo', '/repo/a.md');

    expect(paths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('record_recent_document', {
      rootPath: '/repo',
      documentPath: '/repo/a.md',
    });
  });

  it('invokes ensure_workspace with root path', async () => {
    invokeMock.mockResolvedValueOnce({
      schemaVersion: 1,
      recentDocumentPaths: ['/repo/a.md'],
      expandedPaths: [],
      sortOrder: {},
    });

    const metadata = await ensureWorkspace('/repo');

    expect(metadata.recentDocumentPaths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('ensure_workspace', {
      rootPath: '/repo',
    });
  });

  it('invokes Daily Note commands with root and date arguments', async () => {
    invokeMock
      .mockResolvedValueOnce({
        node: {
          id: 'Daily/2026/06/2026-06-20.md',
          name: '2026-06-20.md',
          kind: 'document',
          relativePath: 'Daily/2026/06/2026-06-20.md',
          absolutePath: '/repo/Daily/2026/06/2026-06-20.md',
          title: '2026-06-20',
        },
        content: {
          path: '/repo/Daily/2026/06/2026-06-20.md',
          content: '# 2026-06-20\n',
          modifiedAt: 1,
        },
      })
      .mockResolvedValueOnce({
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

    await openDailyNote('/repo', '2026-06-20');
    await listDailyNotesForMonth('/repo', '2026-06');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'open_daily_note', {
      rootPath: '/repo',
      date: '2026-06-20',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_daily_notes_for_month', {
      rootPath: '/repo',
      month: '2026-06',
    });
  });
});

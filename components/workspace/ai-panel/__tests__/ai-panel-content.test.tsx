import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';

import { AiPanelContent } from '../ai-panel-content';
import type { AiRuntimeEvent } from '../ai-types';

const mocks = vi.hoisted(() => ({
  aiHandlers: [] as Array<(event: AiRuntimeEvent) => void>,
  cancelAiTurn: vi.fn(),
  isTauriRuntime: vi.fn(),
  listAiAgentModels: vi.fn(),
  listAiAgentProfiles: vi.fn(),
  listAiCommands: vi.fn(),
  listAiConversations: vi.fn(),
  listAiCustomAgents: vi.fn(),
  listAiMcpServers: vi.fn(),
  listAiSkills: vi.fn(),
  loadWorkspaceTree: vi.fn(),
  readAppSettings: vi.fn(),
  readMarkdownDocument: vi.fn(),
  readAiConversation: vi.fn(),
  requestAiChat: vi.fn(),
  respondAiPermission: vi.fn(),
  saveAiConversation: vi.fn(),
  sendAiPrompt: vi.fn(),
  startAiSession: vi.fn(),
  stopAiSession: vi.fn(),
}));

vi.mock('@/components/workspace/workspace-api', () => ({
  cancelAiTurn: (...args: unknown[]) => mocks.cancelAiTurn(...args),
  isTauriRuntime: () => mocks.isTauriRuntime(),
  listAiAgentProfiles: (...args: unknown[]) =>
    mocks.listAiAgentProfiles(...args),
  listAiCommands: (...args: unknown[]) => mocks.listAiCommands(...args),
  listAiAgentModels: (...args: unknown[]) => mocks.listAiAgentModels(...args),
  listAiConversations: (...args: unknown[]) =>
    mocks.listAiConversations(...args),
  listAiCustomAgents: (...args: unknown[]) =>
    mocks.listAiCustomAgents(...args),
  listAiMcpServers: (...args: unknown[]) => mocks.listAiMcpServers(...args),
  listAiSkills: (...args: unknown[]) => mocks.listAiSkills(...args),
  loadWorkspaceTree: (...args: unknown[]) => mocks.loadWorkspaceTree(...args),
  listenAiEvents: (handler: (event: AiRuntimeEvent) => void) => {
    mocks.aiHandlers.push(handler);

    return Promise.resolve(() => {
      const index = mocks.aiHandlers.indexOf(handler);

      if (index >= 0) {
        mocks.aiHandlers.splice(index, 1);
      }
    });
  },
  readAppSettings: (...args: unknown[]) => mocks.readAppSettings(...args),
  readMarkdownDocument: (...args: unknown[]) =>
    mocks.readMarkdownDocument(...args),
  readAiConversation: (...args: unknown[]) => mocks.readAiConversation(...args),
  requestAiChat: (...args: unknown[]) => mocks.requestAiChat(...args),
  respondAiPermission: (...args: unknown[]) =>
    mocks.respondAiPermission(...args),
  saveAiConversation: (...args: unknown[]) => mocks.saveAiConversation(...args),
  sendAiPrompt: (...args: unknown[]) => mocks.sendAiPrompt(...args),
  startAiSession: (...args: unknown[]) => mocks.startAiSession(...args),
  stopAiSession: (...args: unknown[]) => mocks.stopAiSession(...args),
}));

const documentPanelData: DocumentPanelData = {
  frontmatter: {},
  markdown: '# 指南\n\n正文',
  metadata: {
    createdAt: '2026-06-19T00:00:00Z',
    title: '指南',
    updatedAt: '2026-06-19T01:00:00Z',
  },
};

const currentDocument = {
  absolutePath: '/repo/guide.md',
  id: '/repo/guide.md',
  kind: 'document' as const,
  name: 'guide.md',
  relativePath: 'guide.md',
  title: '指南',
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

const codexProfile = {
  capabilities: {
    diff: true,
    models: true,
    readWorkspace: true,
    shell: false,
    slashCommands: true,
    writeWorkspace: true,
  },
  detection: { status: 'available' },
  id: 'codex:local',
  isTestRuntime: false,
  kind: 'codex_app_server',
  label: 'Codex',
  modelId: 'codex:local',
  modelLabel: 'Codex',
  providerId: 'codex',
  providerLabel: 'Codex',
};

const claudeProfile = {
  capabilities: {
    diff: true,
    models: true,
    readWorkspace: true,
    shell: false,
    slashCommands: true,
    writeWorkspace: true,
  },
  detection: { status: 'available' },
  id: 'claude:local',
  isTestRuntime: false,
  kind: 'claude_cli',
  label: 'Claude Code',
  modelId: 'claude:local',
  modelLabel: 'Claude Code',
  providerId: 'claude',
  providerLabel: 'Claude',
};

const defaultAppSettings = {
  ai: {
    enabledProfileId: 'fake-echo',
    profiles: [
      {
        enabled: true,
        id: 'fake-echo',
        isTestRuntime: true,
        kind: 'fake',
        label: 'Fake Echo',
        modelId: 'fake-echo',
        modelLabel: 'fake-echo',
        providerId: 'local',
        providerLabel: 'Local',
      },
    ],
  },
  appearance: { pageWidthMode: 'wide' },
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
};

describe('AiPanelContent', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    mocks.aiHandlers.splice(0, mocks.aiHandlers.length);
    mocks.listAiAgentProfiles.mockReset();
    mocks.listAiCommands.mockReset();
    mocks.listAiAgentModels.mockReset();
    mocks.listAiConversations.mockReset();
    mocks.listAiCustomAgents.mockReset();
    mocks.listAiMcpServers.mockReset();
    mocks.listAiSkills.mockReset();
    mocks.loadWorkspaceTree.mockReset();
    mocks.isTauriRuntime.mockReset();
    mocks.readAppSettings.mockReset();
    mocks.readMarkdownDocument.mockReset();
    mocks.readAiConversation.mockReset();
    mocks.requestAiChat.mockReset();
    mocks.respondAiPermission.mockReset();
    mocks.saveAiConversation.mockReset();
    mocks.startAiSession.mockReset();
    mocks.sendAiPrompt.mockReset();
    mocks.cancelAiTurn.mockReset();
    mocks.stopAiSession.mockReset();

    mocks.listAiAgentProfiles.mockResolvedValue([fakeEchoProfile]);
    mocks.listAiAgentModels.mockResolvedValue([
      {
        available: true,
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        profileId: 'codex:local',
        providerId: 'codex',
        providerLabel: 'Codex',
      },
      {
        available: true,
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        profileId: 'codex:local',
        providerId: 'codex',
        providerLabel: 'Codex',
      },
    ]);
    mocks.listAiCommands.mockResolvedValue([
      {
        argumentHint: 'topic',
        content: 'Write a technical article.',
        description: 'Write docs',
        name: 'write-docs',
        path: '/repo/.claude/commands/write-docs.md',
        source: 'project',
      },
    ]);
    mocks.listAiConversations.mockResolvedValue([]);
    mocks.listAiCustomAgents.mockResolvedValue([
      {
        description: 'Reviews code changes',
        disallowedTools: [],
        model: 'sonnet',
        name: 'reviewer',
        path: '/repo/.claude/agents/reviewer.md',
        prompt: 'Review code for correctness.',
        source: 'project',
        tools: ['Read', 'Grep'],
      },
    ]);
    mocks.listAiMcpServers.mockResolvedValue([
      {
        args: [],
        authStatus: null,
        authType: 'none',
        command: null,
        connectionType: 'http',
        enabled: true,
        envKeys: [],
        groupName: 'Codex',
        name: 'context7',
        provider: 'codex',
        source: 'global',
        status: 'connected',
        tools: [
          {
            description: 'Resolve library ids',
            name: 'resolve-library-id',
          },
        ],
        url: 'https://mcp.context7.com/sse',
      },
    ]);
    mocks.listAiSkills.mockResolvedValue([
      {
        content: 'Use canonical project docs.',
        description: 'Project documentation conventions',
        name: 'docs',
        path: '/repo/.claude/skills/docs/SKILL.md',
        source: 'project',
      },
    ]);
    mocks.loadWorkspaceTree.mockResolvedValue({
      nodes: [
        currentDocument,
        {
          absolutePath: '/repo/notes/research.md',
          id: '/repo/notes/research.md',
          kind: 'document',
          name: 'research.md',
          relativePath: 'notes/research.md',
          title: '研究记录',
        },
        {
          absolutePath: '/repo/assets',
          children: [],
          id: '/repo/assets',
          kind: 'directory',
          name: 'assets',
          relativePath: 'assets',
        },
      ],
      rootName: 'repo',
      rootPath: '/repo',
    });
    mocks.isTauriRuntime.mockReturnValue(true);
    mocks.readMarkdownDocument.mockResolvedValue({
      content: '# 研究记录\n\n引用内容',
      modifiedAt: 10,
      path: 'notes/research.md',
    });
    mocks.readAppSettings.mockResolvedValue(defaultAppSettings);
    mocks.requestAiChat.mockResolvedValue({
      body: { output_text: 'Provider response' },
      status: 200,
    });
    mocks.respondAiPermission.mockResolvedValue(undefined);
    mocks.readAiConversation.mockResolvedValue({
      createdAt: 1,
      documentPath: 'guide.md',
      documentTitle: '指南',
      id: 'conversation-1',
      messages: [
        { content: '之前的问题', id: 'm1', role: 'user' },
        { content: '之前的回答', id: 'm2', role: 'assistant' },
      ],
      permissions: [],
      profileId: 'fake-echo',
      profileLabel: 'Fake Echo',
      providerId: 'local',
      providerLabel: 'Local',
      thinking: [{ content: '之前的思考', id: 'thinking-old' }],
      title: '真实会话',
      tools: [],
      updatedAt: 2,
      usage: null,
    });
    mocks.saveAiConversation.mockResolvedValue({
      createdAt: 1,
      documentPath: 'guide.md',
      documentTitle: '指南',
      id: 'session-1',
      messageCount: 1,
      profileId: 'fake-echo',
      profileLabel: 'Fake Echo',
      providerId: 'local',
      providerLabel: 'Local',
      title: '总结此页面',
      updatedAt: 2,
    });
    mocks.startAiSession.mockResolvedValue({
      profileId: 'fake-echo',
      rootPath: '/repo',
      sessionId: 'ai-1',
      status: 'running',
    });
    mocks.sendAiPrompt.mockResolvedValue(undefined);
    mocks.cancelAiTurn.mockResolvedValue(undefined);
    mocks.stopAiSession.mockResolvedValue(undefined);
  });

  it('loads agent profiles for the workspace', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() =>
      expect(mocks.listAiAgentProfiles).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByText('Fake Echo')).toBeTruthy();
  });

  it('does not subscribe to Tauri AI events outside the desktop runtime', () => {
    mocks.isTauriRuntime.mockReturnValue(false);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath={null}
      />,
    );

    expect(mocks.aiHandlers).toHaveLength(0);
  });

  it('shows the selected assistant in the compact model control', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findByText('Fake Echo')).toBeTruthy();
    expect(screen.queryByText('Local')).toBeNull();
    expect(screen.queryByText('测试运行时')).toBeNull();
  });

  it('prefers a connected local assistant over the persisted fake echo profile', async () => {
    mocks.listAiAgentProfiles.mockResolvedValueOnce([
      fakeEchoProfile,
      codexProfile,
    ]);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findByText('gpt-5.3-codex')).toBeTruthy();
    expect(screen.queryByText('Fake Echo')).toBeNull();
  });

  it('loads selectable models from the runtime model command when the picker opens', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '选择模型' }));

    await waitFor(() =>
      expect(mocks.listAiAgentModels).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByPlaceholderText('Search models...')).toBeTruthy();
    expect(screen.getByText('Codex Models')).toBeTruthy();
    expect(screen.getAllByText('GPT-5.4').length).toBeGreaterThan(0);
    expect(screen.getByText('GPT-5.5')).toBeTruthy();
    expect(screen.queryByText('fake-echo')).toBeNull();
    expect(screen.getByTestId('ai-model-popover').className).toContain(
      'max-w-[calc(100vw-2rem)]',
    );
  });

  it('hides models disabled from AI settings in the picker', async () => {
    const user = userEvent.setup();

    mocks.listAiAgentProfiles.mockResolvedValueOnce([
      fakeEchoProfile,
      codexProfile,
    ]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        enabledProfileId: 'codex:local',
        hiddenModelIds: ['gpt-5.5'],
        lastSelectedCodexModelId: 'gpt-5.4',
        profiles: [
          defaultAppSettings.ai.profiles[0],
          {
            ...codexProfile,
            enabled: true,
          },
        ],
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '选择模型' }));

    await waitFor(() =>
      expect(mocks.listAiAgentModels).toHaveBeenCalledWith('/repo'),
    );
    expect(screen.getAllByText('GPT-5.4').length).toBeGreaterThan(0);
    expect(screen.queryByText('GPT-5.5')).toBeNull();
  });

  it('starts Codex sessions with configured default model, thinking, and mode', async () => {
    const user = userEvent.setup();

    mocks.listAiAgentProfiles.mockResolvedValueOnce([
      fakeEchoProfile,
      codexProfile,
    ]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        defaultAgentMode: 'plan',
        enabledProfileId: 'codex:local',
        extendedThinkingEnabled: true,
        hiddenModelIds: ['gpt-5.5'],
        lastSelectedCodexModelId: 'gpt-5.4',
        lastSelectedCodexThinking: 'xhigh',
        profiles: [
          defaultAppSettings.ai.profiles[0],
          {
            ...codexProfile,
            enabled: true,
          },
        ],
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '总结此页面',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    expect(mocks.startAiSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: 'plan',
        codexThinking: 'xhigh',
        extendedThinking: true,
        modelId: 'gpt-5.4',
        profileId: 'codex:local',
        rootPath: '/repo',
      }),
    );
  });

  it('falls back to detected local assistants when runtime model list is empty', async () => {
    const user = userEvent.setup();

    mocks.listAiAgentProfiles.mockResolvedValueOnce([
      fakeEchoProfile,
      claudeProfile,
    ]);
    mocks.listAiAgentModels.mockResolvedValueOnce([]);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '选择模型' }));

    expect(await screen.findByText('Claude Models')).toBeTruthy();
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('当前本地助手没有返回可选择模型。'),
    ).toBeNull();
  });

  it('places model controls and send action inside the composer footer', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    const composer = screen.getByTestId('ai-composer');
    const footer = screen.getByTestId('ai-composer-footer');

    expect(composer.contains(footer)).toBe(true);
    expect(footer.contains(screen.getByRole('button', { name: '选择模型' }))).toBe(
      true,
    );
    expect(footer.contains(screen.getByRole('button', { name: '发送' }))).toBe(
      true,
    );
  });

  it('offers quick actions, new sessions, and searchable session history from the panel toolbar', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '快捷动作' }));
    expect(await screen.findByRole('button', { name: 'Generate Title' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '历史会话' }));
    expect(await screen.findByPlaceholderText('Search...')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '新会话' }));
    expect(screen.getByText('New session')).toBeTruthy();
  });

  it('loads real conversation history and restores a selected conversation', async () => {
    const user = userEvent.setup();

    mocks.listAiConversations.mockResolvedValueOnce([
      {
        createdAt: 1,
        documentPath: 'guide.md',
        documentTitle: '指南',
        id: 'conversation-1',
        messageCount: 2,
        profileId: 'fake-echo',
        profileLabel: 'Fake Echo',
        providerId: 'local',
        providerLabel: 'Local',
        title: '真实会话',
        updatedAt: 2,
      },
    ]);

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.click(await screen.findByRole('button', { name: '历史会话' }));

    await waitFor(() =>
      expect(mocks.listAiConversations).toHaveBeenCalledWith('/repo'),
    );
    expect(await screen.findByText('真实会话')).toBeTruthy();
    expect(screen.queryByText('权限上下文代码注释补充')).toBeNull();

    await user.click(screen.getByRole('button', { name: '恢复会话 真实会话' }));

    expect(mocks.readAiConversation).toHaveBeenCalledWith(
      '/repo',
      'conversation-1',
    );
    expect(await screen.findByText('之前的问题')).toBeTruthy();
    expect(screen.getByText('之前的回答')).toBeTruthy();
    expect(screen.getByText('之前的思考')).toBeTruthy();
  });

  it('blocks prompts when no local AI profile is available', async () => {
    const openSettings = vi.fn();

    mocks.listAiAgentProfiles.mockResolvedValueOnce([]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        enabledProfileId: null,
        profiles: [
          {
            ...defaultAppSettings.ai.profiles[0],
            enabled: false,
          },
        ],
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
        onOpenSettings={openSettings}
      />,
    );

    expect(await screen.findAllByText('未启用 AI 模型')).not.toHaveLength(0);
    const settingsButtons = screen.getAllByRole('button', {
      name: '打开 AI 设置',
    });

    await userEvent.click(settingsButtons[settingsButtons.length - 1]);

    expect(openSettings).toHaveBeenCalled();
    expect(
      (
        screen.getByPlaceholderText(
          '向 AI 询问当前工作区...',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
  });

  it('submits a prompt with current Markdown context', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '总结此页面',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          document: expect.objectContaining({
            markdown: '# 指南\n\n正文',
            path: '/repo/guide.md',
            title: '指南',
          }),
          intent: 'chat',
          workspaceRootPath: '/repo',
        }),
        prompt: '总结此页面',
        sessionId: 'ai-1',
      }),
    );
    expect(screen.getAllByText('总结此页面')).toHaveLength(1);
    await waitFor(() =>
      expect(mocks.saveAiConversation).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          documentPath: 'guide.md',
          documentTitle: '指南',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: '总结此页面',
              role: 'user',
            }),
          ]),
          title: '总结此页面',
        }),
      ),
    );
  });

  it('adds mentioned workspace files as structured references for a new chat', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '@research',
    );

    await waitFor(() =>
      expect(mocks.loadWorkspaceTree).toHaveBeenCalledWith('/repo'),
    );
    await user.click(await screen.findByRole('option', { name: /研究记录/ }));

    expect(screen.getByText('研究记录')).toBeTruthy();

    await user.type(
      screen.getByPlaceholderText('向 AI 询问当前工作区...'),
      ' 结合这份资料改写',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.readMarkdownDocument).toHaveBeenCalled());
    expect(mocks.readMarkdownDocument).toHaveBeenCalledWith(
      '/repo',
      'notes/research.md',
    );
    expect(mocks.startAiSession).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          document: expect.objectContaining({
            path: '/repo/guide.md',
            title: '指南',
          }),
          references: [
            expect.objectContaining({
              markdown: '# 研究记录\n\n引用内容',
              path: '/repo/notes/research.md',
              relativePath: 'notes/research.md',
              title: '研究记录',
            }),
          ],
          workspaceRootPath: '/repo',
        }),
      }),
    );
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          references: [
            expect.objectContaining({
              markdown: '# 研究记录\n\n引用内容',
              relativePath: 'notes/research.md',
            }),
          ],
        }),
        prompt: '结合这份资料改写',
      }),
    );
  });

  it('adds pasted long text as a removable context attachment for the next chat', async () => {
    const user = userEvent.setup();
    const pastedText = [
      '# 访谈记录',
      '',
      '用户希望把写作助手做成持续协作的侧边面板。',
      '需要保留当前文档上下文，也要能显式附加长文本资料。',
      '发送时不要把整段粘贴内容混入用户输入框。',
    ].join('\n');

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    const input = await screen.findByPlaceholderText('向 AI 询问当前工作区...');
    fireEvent.paste(input, {
      clipboardData: {
        getData: vi.fn(() => pastedText),
      },
    });

    expect(screen.getByText('Pasted text')).toBeTruthy();
    expect(screen.getByText('+1 referenced')).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe('');

    await user.type(input, '结合附件整理写作建议');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.sendAiPrompt).toHaveBeenCalled());
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          references: [
            expect.objectContaining({
              markdown: pastedText,
              relativePath: expect.stringMatching(/^pasted-text\//),
              source: 'pasted-text',
              title: 'Pasted text',
            }),
          ],
        }),
        prompt: '结合附件整理写作建议',
      }),
    );
    await waitFor(() =>
      expect(mocks.saveAiConversation).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          references: [
            expect.objectContaining({
              markdown: pastedText,
              source: 'pasted-text',
            }),
          ],
        }),
      ),
    );
  });

  it('sends selected editor text as structured selection context', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        selectedTextContext={{
          documentPath: '/repo/guide.md',
          documentTitle: '指南',
          from: 2,
          markdown: '指南选中的段落',
          to: 9,
        }}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findByText(/Selection/)).toBeTruthy();
    expect(screen.getAllByText(/指南/).length).toBeGreaterThan(0);

    await user.type(
      screen.getByPlaceholderText('向 AI 询问当前工作区...'),
      '基于选区扩写',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.sendAiPrompt).toHaveBeenCalled());
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          selection: {
            documentPath: '/repo/guide.md',
            documentTitle: '指南',
            from: 2,
            markdown: '指南选中的段落',
            to: 9,
          },
        }),
        prompt: '基于选区扩写',
      }),
    );
  });

  it('removes selected editor text context before sending', async () => {
    const user = userEvent.setup();
    function SelectionContextHarness() {
      const [selection, setSelection] = React.useState<{
        documentPath: string;
        documentTitle: string;
        from: number;
        markdown: string;
        to: number;
      } | null>({
        documentPath: '/repo/guide.md',
        documentTitle: '指南',
        from: 2,
        markdown: '不应发送的选区',
        to: 9,
      });

      return (
        <AiPanelContent
          currentDocument={currentDocument}
          documentPanelData={documentPanelData}
          selectedTextContext={selection}
          workspaceRootPath="/repo"
          onClearSelectedTextContext={() => setSelection(null)}
        />
      );
    }

    render(<SelectionContextHarness />);

    await user.click(await screen.findByRole('button', { name: '移除选中文本上下文' }));
    await user.type(
      screen.getByPlaceholderText('向 AI 询问当前工作区...'),
      '只处理当前文档',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.sendAiPrompt).toHaveBeenCalled());
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.not.objectContaining({
          selection: expect.anything(),
        }),
      }),
    );
  });

  it('adds mentioned skills agents and MCP tools as structured references', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '@reviewer',
    );

    await waitFor(() =>
      expect(mocks.listAiCustomAgents).toHaveBeenCalledWith('/repo'),
    );
    expect(mocks.listAiSkills).toHaveBeenCalledWith('/repo');
    expect(mocks.listAiMcpServers).toHaveBeenCalledWith('/repo');
    await user.click(await screen.findByRole('option', { name: /reviewer/ }));

    await user.type(
      screen.getByPlaceholderText('向 AI 询问当前工作区...'),
      ' 帮我审查',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    expect(mocks.readMarkdownDocument).not.toHaveBeenCalled();
    expect(mocks.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          references: [
            expect.objectContaining({
              markdown: expect.stringContaining('Review code for correctness.'),
              relativePath: 'agent:reviewer',
              source: 'agent',
              title: 'reviewer',
            }),
          ],
        }),
        prompt: '帮我审查',
      }),
    );
  });

  it('does not submit prompts through configured provider runtime', async () => {
    mocks.listAiAgentProfiles.mockResolvedValueOnce([]);
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        enabledProfileId: null,
        profiles: [
          {
            ...defaultAppSettings.ai.profiles[0],
            enabled: false,
          },
        ],
        providers: {
          agentDefaultModelId: 'gpt-5.4',
          agentDefaultProviderId: 'openai',
          defaultModelId: null,
          defaultProviderId: null,
          inlineDefaultModelId: null,
          inlineDefaultProviderId: null,
          providers: [
            {
              apiStyle: 'openai-responses',
              baseUrl: 'https://api.openai.com/v1',
              defaultModelId: 'gpt-5.4',
              enabled: true,
              id: 'openai',
              models: [
                {
                  capabilities: ['text'],
                  enabled: true,
                  id: 'gpt-5.4',
                  name: 'GPT-5.4',
                },
              ],
              name: 'OpenAI',
              secretStatus: 'configured',
              type: 'openai',
            },
          ],
        },
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    expect(await screen.findAllByText('未启用 AI 模型')).not.toHaveLength(0);
    expect(
      (
        screen.getByPlaceholderText(
          '向 AI 询问当前工作区...',
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(mocks.startAiSession).not.toHaveBeenCalled();
    expect(mocks.requestAiChat).not.toHaveBeenCalled();
  });

  it('renders runtime assistant events', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      'hello',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    mocks.aiHandlers[0]({
      delta: 'Echo: hello',
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageDelta',
    });
    mocks.aiHandlers[0]({
      messageId: 'assistant-1',
      sessionId: 'ai-1',
      type: 'messageCompleted',
    });

    expect(await screen.findByText('Echo: hello')).toBeTruthy();
  });

  it('renders thinking deltas separately from assistant messages and saves them', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      '分析当前文档',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        delta: '正在读取标题和正文结构',
        messageId: 'thinking-1',
        sessionId: 'ai-1',
        type: 'thinkingDelta',
      });
      mocks.aiHandlers[0]({
        delta: '最终回答',
        messageId: 'assistant-1',
        sessionId: 'ai-1',
        type: 'messageDelta',
      });
    });

    expect(await screen.findByText('思考中')).toBeTruthy();
    const thinkingText = screen.getByText('正在读取标题和正文结构');
    expect(thinkingText.closest('[data-testid="ai-thinking-card"]')).toBeTruthy();
    expect(screen.getByText('最终回答').textContent).toBe('最终回答');
    expect(screen.queryByText('正在读取标题和正文结构最终回答')).toBeNull();

    await waitFor(() =>
      expect(mocks.saveAiConversation).toHaveBeenCalledWith(
        '/repo',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: '最终回答',
              role: 'assistant',
            }),
          ]),
          thinking: [
            expect.objectContaining({
              content: '正在读取标题和正文结构',
              id: 'thinking-1',
            }),
          ],
        }),
      ),
    );
  });

  it('renders tool, permission, usage, and run state cards from runtime events', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        session: {
          profileId: 'claude:local',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
        type: 'sessionStarted',
      });
      mocks.aiHandlers[0]({
        error: undefined,
        sessionId: 'ai-1',
        state: 'running',
        type: 'runState',
      });
      mocks.aiHandlers[0]({
        input: { command: 'pnpm test' },
        sessionId: 'ai-1',
        toolCallId: 'tool-1',
        toolName: 'Bash',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        reason: 'needs approval',
        requestId: 'req-1',
        sessionId: 'ai-1',
        toolCallId: 'tool-1',
        toolInput: { command: 'pnpm test' },
        toolName: 'Bash',
        type: 'permissionPrompt',
      });
      mocks.aiHandlers[0]({
        cacheReadTokens: 3,
        inputTokens: 10,
        model: 'claude-sonnet',
        outputTokens: 12,
        sessionId: 'ai-1',
        totalCostUsd: 0.01,
        type: 'usageUpdated',
      });
      mocks.aiHandlers[0]({
        input: { changes: [{ diff: '--- README.md\n+++ README.md' }] },
        sessionId: 'ai-1',
        toolCallId: 'tool-2',
        toolName: 'Edit',
        type: 'toolStarted',
      });
    });

    expect(await screen.findByText('Bash')).toBeTruthy();
    expect(screen.getAllByText(/pnpm test/).length).toBeGreaterThan(0);
    expect(screen.getByText('Diff')).toBeTruthy();
    expect(screen.getAllByText(/README.md/).length).toBeGreaterThan(0);
    expect(screen.getByText('needs approval')).toBeTruthy();
    expect(screen.getByText(/claude-sonnet/)).toBeTruthy();
    expect(screen.getAllByText(/Running/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '允许 Bash' }));

    expect(mocks.respondAiPermission).toHaveBeenCalledWith({
      behavior: 'allow',
      requestId: 'req-1',
      sessionId: 'ai-1',
      updatedInput: { command: 'pnpm test' },
    });
  });

  it('groups exploration, web, and edit tool activity for the side panel', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        input: { file_path: '/repo/guide.md' },
        sessionId: 'ai-1',
        toolCallId: 'tool-read',
        toolName: 'Read',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        durationMs: 15,
        output: { content: '# 指南' },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-read',
        toolName: 'Read',
        type: 'toolCompleted',
      });
      mocks.aiHandlers[0]({
        input: { query: 'Madora markdown workspace AI' },
        sessionId: 'ai-1',
        toolCallId: 'tool-web',
        toolName: 'WebSearch',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: {
          results: [
            { title: 'Madora docs', url: 'https://example.com/madora' },
          ],
        },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-web',
        toolName: 'WebSearch',
        type: 'toolCompleted',
      });
      mocks.aiHandlers[0]({
        input: {
          file_path: '/repo/guide.md',
          new_string: '# 指南\n新增段落',
          old_string: '# 旧指南',
        },
        sessionId: 'ai-1',
        toolCallId: 'tool-edit',
        toolName: 'Edit',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: {
          diff: '--- guide.md\n+++ guide.md\n@@\n-# 旧指南\n+# 指南\n+新增段落',
        },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-edit',
        toolName: 'Edit',
        type: 'toolCompleted',
      });
    });

    expect(await screen.findByText('已探索')).toBeTruthy();
    expect(screen.getByText('已联网')).toBeTruthy();
    expect(screen.getByText('已编辑')).toBeTruthy();
    expect(screen.getAllByText('guide.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Madora markdown workspace AI/)).toBeTruthy();
    expect(
      screen
        .getAllByTestId('ai-diff-line-added')
        .map((line) => line.textContent)
        .join('\n'),
    ).toContain('新增段落');
    expect(
      screen
        .getAllByTestId('ai-diff-line-removed')
        .map((line) => line.textContent)
        .join('\n'),
    ).toContain('# 旧指南');
  });

  it('renders multi-file edit changes as file-specific previews', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        input: {},
        sessionId: 'ai-1',
        toolCallId: 'tool-edit-many',
        toolName: 'Edit',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: {
          changes: [
            {
              diff: '--- docs/a.md\n+++ docs/a.md\n@@\n-old a\n+new a',
              path: '/repo/docs/a.md',
            },
            {
              diff: '--- docs/b.md\n+++ docs/b.md\n@@\n+new b',
              path: '/repo/docs/b.md',
            },
          ],
        },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-edit-many',
        toolName: 'Edit',
        type: 'toolCompleted',
      });
    });

    expect(await screen.findByText('已编辑')).toBeTruthy();
    expect(screen.getByText('2 files')).toBeTruthy();
    expect(screen.getAllByText('docs/a.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('docs/b.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-1').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByTestId('ai-diff-line-added')
        .map((line) => line.textContent)
        .join('\n'),
    ).toContain('new b');
  });

  it('renders web search results and fetched page content as expandable previews', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        input: { query: 'Madora AI workspace' },
        sessionId: 'ai-1',
        toolCallId: 'tool-web-search',
        toolName: 'WebSearch',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: {
          results: [
            {
              content: [
                {
                  title: 'Madora AI Panel Notes',
                  url: 'https://example.com/ai-panel',
                },
              ],
            },
          ],
        },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-web-search',
        toolName: 'WebSearch',
        type: 'toolCompleted',
      });
      mocks.aiHandlers[0]({
        input: { url: 'https://example.com/ai-panel' },
        sessionId: 'ai-1',
        toolCallId: 'tool-web-fetch',
        toolName: 'WebFetch',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: {
          bytes: 2048,
          code: 200,
          result: 'Fetched markdown content for the AI panel.',
        },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-web-fetch',
        toolName: 'WebFetch',
        type: 'toolCompleted',
      });
    });

    expect(await screen.findByText('已联网')).toBeTruthy();
    expect(screen.getByText(/Madora AI workspace/)).toBeTruthy();
    expect(screen.queryByText('Madora AI Panel Notes')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开 WebSearch 结果' }));
    expect(
      screen
        .getByRole('link', { name: /Madora AI Panel Notes/ })
        .getAttribute('href'),
    ).toBe('https://example.com/ai-panel');

    await user.click(screen.getByRole('button', { name: '展开 WebFetch 内容' }));
    expect(screen.getByText('Fetched markdown content for the AI panel.')).toBeTruthy();
    expect(screen.queryByText('"result"')).toBeNull();
  });

  it('renders planning and MCP tools as dedicated activity groups', async () => {
    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        input: {
          todos: [
            { content: '梳理资料', status: 'completed' },
            { content: '改写正文', status: 'in_progress' },
          ],
        },
        sessionId: 'ai-1',
        toolCallId: 'tool-todo',
        toolName: 'TodoWrite',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: { ok: true },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-todo',
        toolName: 'TodoWrite',
        type: 'toolCompleted',
      });
      mocks.aiHandlers[0]({
        input: {
          plan: {
            steps: [
              { status: 'completed' },
              { status: 'pending' },
            ],
            title: '写作协作升级',
          },
        },
        sessionId: 'ai-1',
        toolCallId: 'tool-plan',
        toolName: 'PlanWrite',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        input: { library: 'react' },
        sessionId: 'ai-1',
        toolCallId: 'tool-mcp',
        toolName: 'context7.resolve-library-id',
        type: 'toolStarted',
      });
      mocks.aiHandlers[0]({
        output: { result: 'react docs id' },
        sessionId: 'ai-1',
        status: 'success',
        toolCallId: 'tool-mcp',
        toolName: 'context7.resolve-library-id',
        type: 'toolCompleted',
      });
    });

    expect(await screen.findByText('正在规划')).toBeTruthy();
    expect(screen.getByText('已调用 MCP')).toBeTruthy();
    expect(screen.getByText('TodoWrite')).toBeTruthy();
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getByText('写作协作升级 (1/2)')).toBeTruthy();
    expect(screen.getByText('context7')).toBeTruthy();
    expect(screen.getByText('Resolve Library Id')).toBeTruthy();
  });

  it('uses 1Code-style notification preferences for permission prompts and completion', async () => {
    const notificationSpy = vi.fn();
    class MockNotification {
      static permission = 'granted';
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy(title, options);
      }
    }
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: MockNotification,
    });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });
    mocks.readAppSettings.mockResolvedValueOnce({
      ...defaultAppSettings,
      ai: {
        ...defaultAppSettings.ai,
        desktopNotificationsEnabled: true,
        notifyWhenFocused: false,
        soundNotificationsEnabled: false,
      },
    });

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await waitFor(() => expect(mocks.aiHandlers).toHaveLength(1));
    act(() => {
      mocks.aiHandlers[0]({
        session: {
          profileId: 'claude:local',
          rootPath: '/repo',
          sessionId: 'ai-1',
          status: 'running',
        },
        type: 'sessionStarted',
      });
      mocks.aiHandlers[0]({
        reason: 'needs approval',
        requestId: 'req-1',
        sessionId: 'ai-1',
        toolCallId: 'tool-1',
        toolInput: { command: 'pnpm test' },
        toolName: 'Bash',
        type: 'permissionPrompt',
      });
      mocks.aiHandlers[0]({
        error: undefined,
        sessionId: 'ai-1',
        state: 'completed',
        type: 'runState',
      });
    });

    await waitFor(() => expect(notificationSpy).toHaveBeenCalledTimes(2));
    expect(notificationSpy).toHaveBeenNthCalledWith(
      1,
      'AI Assistant needs input',
      expect.objectContaining({ body: 'Bash needs approval' }),
    );
    expect(notificationSpy).toHaveBeenNthCalledWith(
      2,
      'AI Assistant completed',
      expect.objectContaining({ body: 'Fake Echo completed the task' }),
    );

    notificationSpy.mockClear();
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
    act(() => {
      mocks.aiHandlers[0]({
        reason: 'needs approval',
        requestId: 'req-2',
        sessionId: 'ai-1',
        toolCallId: 'tool-2',
        toolInput: { command: 'pnpm lint' },
        toolName: 'Bash',
        type: 'permissionPrompt',
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText(/pnpm lint/).length).toBeGreaterThan(0);
    });
    expect(notificationSpy).not.toHaveBeenCalled();
  });

  it('cancels the current turn', async () => {
    const user = userEvent.setup();

    render(
      <AiPanelContent
        currentDocument={currentDocument}
        documentPanelData={documentPanelData}
        workspaceRootPath="/repo"
      />,
    );

    await user.type(
      await screen.findByPlaceholderText('向 AI 询问当前工作区...'),
      'hello',
    );
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '发送' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(mocks.startAiSession).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '停止' }));

    expect(mocks.cancelAiTurn).toHaveBeenCalledWith('ai-1');
  });
});

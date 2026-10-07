import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  catalog: {
    agents: [
      {
        id: 'cursor',
        name: 'Cursor',
        version: '1',
        description: 'Cursor agent',
        distribution: { npx: { package: 'fixture@1' } },
      },
      {
        id: 'codex-acp',
        name: 'Codex',
        version: '1',
        description: 'Codex agent',
        distribution: { npx: { package: 'fixture@1' } },
      },
    ],
    profiles: [] as AgentProfile[],
    localAgents: [],
    defaultProfileId: null,
    platform: 'darwin-aarch64',
    digest: 'test',
  },
  history: [] as unknown[],
  readSession: vi.fn(),
  progress: null as null | { agentId: string; phase: string },
  invoke: vi.fn(),
  runtime: null as unknown,
}));
vi.mock('../workspace-api', () => ({
  isTauriRuntime: () => true,
  openUrlInDefaultBrowser: vi.fn(),
}));
vi.mock('../agent-api', () => ({
  loadAgentCatalog: async () => state.catalog,
  agentInvoke: (command: string, args: unknown) => {
    state.invoke(command, args);
    if (command === 'agent_history') return Promise.resolve(state.history);
    if (command === 'agent_read_session') return state.readSession(args);
    return Promise.resolve(
      command === 'agent_install_status' ? state.progress : {},
    );
  },
  agentError: (error: unknown) => String(error),
  installAgent: vi.fn(),
  attachLocalAgent: vi.fn(),
  saveAgentProfile: vi.fn(),
  uninstallAgent: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('../agent-runtime', () => ({
  activeAgentRuntimes: () => [state.runtime],
  findAgentRuntime: (id: string) => {
    const runtime = state.runtime as {
      getSnapshot: () => { record: { id: string } };
    };
    return runtime.getSnapshot().record.id === id ? runtime : undefined;
  },
  AgentRuntime: vi.fn(),
}));
vi.mock('../ai-message-content', () => ({
  AiMessageContent: ({ markdown }: { markdown: string }) => (
    <div>{markdown}</div>
  ),
}));
import { AgentRuntime } from '../agent-runtime';
import type { AgentProfile } from '../agent-api';
import { AgentPanel } from '../agent-panel';
import { AgentSettings } from '../agent-settings';
import type { AgentView } from '../agent-session';
import type { WorkspaceNode, AiDrawingReference } from '../workspace-types';

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.invoke.mockClear();
  state.progress = null;
  state.history = [];
  state.catalog.profiles = [];
  state.readSession.mockReset();
  const view = {
    record: {
      id: 'session',
      rootPath: '/workspace',
      title: 'New',
      agentId: 'cursor',
      agentName: 'Cursor',
      updatedAt: 100,
      messages: [],
    },
    phase: 'ready',
    error: null,
    configOptions: [],
    modes: null,
    authMethods: [],
    interactions: [],
    commands: [
      { name: 'first', description: 'First command' },
      { name: 'second', description: 'Second command' },
    ],
    capabilities: {},
    usage: null,
  };
  state.runtime = {
    profile: { agentId: 'cursor', id: 'cursor-profile', name: 'Cursor' },
    getSnapshot: () => view,
    subscribe: () => () => {},
    setCallbacks: () => () => {},
    disconnect: vi.fn(async () => {}),
    connect: async () => {},
    prompt: vi.fn(),
    configure: vi.fn(),
    mode: vi.fn(),
  };
});
const props = {
  workspaceRootPath: '/workspace',
  currentDocument: null,
  currentDocumentPath: null,
  documents: [],
  onBeforeTurnStart: async () => true,
  onWorkspaceChanged: () => {},
  onOpenDocument: () => {},
  onOpenPlanPreview: () => {},
};
describe('agent layout interactions', () => {
  it('keeps progress and cancellation inside the corresponding agent card', async () => {
    state.progress = { agentId: 'cursor', phase: '正在下载平台安装包…' };
    render(<AgentSettings scrollable />);
    const status = await screen.findByRole('status');
    expect(
      status.closest('[data-agent-id]')?.getAttribute('data-agent-id'),
    ).toBe('cursor');
    const row = status.closest('[data-agent-id]') as HTMLElement;
    await userEvent.click(
      within(row).getByRole('button', { name: '取消安装 Cursor' }),
    );
    expect(state.invoke).toHaveBeenCalledWith('agent_cancel_install', {
      agentId: 'cursor',
    });
    expect(
      document
        .querySelector('[data-agent-id="codex-acp"]')
        ?.querySelector('[role="status"]'),
    ).toBeNull();
  });
  it('places command suggestions outside the composer and selects with the keyboard without sending', async () => {
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    const input = screen.getByLabelText('发送给智能体的任务');
    await user.type(input, '/');
    const menu = screen.getByRole('listbox', { name: '智能体命令' });
    expect(screen.getByTestId('agent-composer').contains(menu)).toBe(false);
    await user.keyboard('{ArrowDown}{Enter}');
    expect((input as HTMLTextAreaElement).value).toBe('/second ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(
      (state.runtime as { prompt: ReturnType<typeof vi.fn> }).prompt,
    ).not.toHaveBeenCalled();
  });
  it('dismisses command suggestions and omits an empty popup for unmatched input', async () => {
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    const input = screen.getByLabelText('发送给智能体的任务');
    await user.type(input, '/');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.type(input, 'unknown');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('keeps search outside the agent list scroll region in the manager dialog', async () => {
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    await user.click(screen.getByRole('button', { name: '智能体设置' }));
    const dialog = screen.getByTestId('agent-manager-dialog');
    const region = within(dialog).getByRole('region', {
      name: '智能体列表',
    });
    expect(region.contains(within(dialog).getByLabelText('搜索智能体'))).toBe(
      false,
    );
    await waitFor(() =>
      expect(
        within(region).getByText('Codex', {
          selector: 'span.font-medium',
        }),
      ).toBeTruthy(),
    );
  });
  it('uses the shared Select and preserves grouped model IDs including an empty default', async () => {
    const runtime = state.runtime as {
      getSnapshot: () => AgentView;
      configure: ReturnType<typeof vi.fn>;
    };
    runtime.getSnapshot().configOptions = [
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        category: 'model',
        currentValue: '',
        options: [
          {
            group: 'available',
            name: '可用模型',
            options: [
              { value: '', name: 'Auto' },
              { value: 'engine:2', name: '模型 B' },
            ],
          },
        ],
      },
    ];
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    const trigger = screen.getByRole('combobox', { name: 'Model' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('data-slot')).toBe('select-trigger');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: '模型 B' }));
    expect(runtime.configure).toHaveBeenCalledWith('model', 'engine:2');
  });
  it('uses the same styled selector for legacy modes and disables it during a turn', async () => {
    const runtime = state.runtime as {
      getSnapshot: () => AgentView;
      mode: ReturnType<typeof vi.fn>;
    };
    runtime.getSnapshot().modes = {
      currentModeId: 'agent',
      availableModes: [
        { id: 'agent', name: 'Agent' },
        { id: 'planning', name: 'Plan' },
      ],
    };
    const user = userEvent.setup();
    const { rerender } = render(<AgentPanel {...props} />);
    await user.click(screen.getByRole('combobox', { name: '会话模式' }));
    await user.click(screen.getByRole('option', { name: 'Plan' }));
    expect(runtime.mode).toHaveBeenCalledWith('planning');
    runtime.getSnapshot().phase = 'running';
    rerender(<AgentPanel {...props} />);
    expect(
      (
        screen.getByRole('combobox', {
          name: '会话模式',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it('removes hidden document context when moving to a drawing, including the flush and prompt payload', async () => {
    const document: WorkspaceNode = {
      id: 'old',
      kind: 'document',
      name: '旧文档.md',
      title: '旧文档',
      absolutePath: '/workspace/old.md',
      relativePath: 'old.md',
    };
    const drawing: AiDrawingReference = {
      id: 'drawing-b',
      title: '当前图稿 B',
      drawingKind: 'whiteboard',
      revision: 1,
      albumPath: '',
      itemCount: 1,
      hasPreview: false,
    };
    const before = vi.fn(async () => true);
    const user = userEvent.setup();
    const { rerender } = render(
      <AgentPanel
        {...props}
        currentDocument={document}
        currentDocumentPath={document.absolutePath}
        onBeforeTurnStart={before}
      />,
    );
    expect(screen.getByText('当前文档：旧文档')).toBeTruthy();
    rerender(
      <AgentPanel
        {...props}
        currentDocument={document}
        currentDocumentPath={document.absolutePath}
        activeDrawing={drawing}
        onBeforeTurnStart={before}
      />,
    );
    expect(screen.queryByText('当前文档：旧文档')).toBeNull();
    expect(screen.queryByText(/旧文档/)).toBeNull();
    expect(screen.getByText('当前图稿：当前图稿 B')).toBeTruthy();
    await user.type(
      screen.getByLabelText('发送给智能体的任务'),
      '优化当前图稿',
    );
    await user.click(screen.getByRole('button', { name: '发送任务' }));
    await waitFor(() =>
      expect(before).toHaveBeenCalledWith(null, 'drawing-b'),
    );
    expect(
      (state.runtime as { prompt: ReturnType<typeof vi.fn> }).prompt,
    ).toHaveBeenCalledWith('优化当前图稿', [], {
      documents: [],
      drawings: [{ drawingId: 'drawing-b', role: 'active' }],
    });
    rerender(
      <AgentPanel
        {...props}
        currentDocument={document}
        currentDocumentPath={document.absolutePath}
      />,
    );
    expect(screen.getByText('当前文档：旧文档')).toBeTruthy();
    expect(screen.queryByText('当前：当前图稿 B')).toBeNull();
  });
});

describe('inline session history', () => {
  const historical = {
    id: 'older',
    profileId: 'removed',
    agentId: 'codex-acp',
    agentName: 'Codex',
    title: '分析知识结构',
    updatedAt: 50,
    createdAt: 20,
    rootPath: '/workspace',
    messages: [{ id: 'message', role: 'assistant', text: '已有的会话内容' }],
  };
  it('searches by title and agent in the panel and returns without losing the draft', async () => {
    state.history = [historical];
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    const composer = screen.getByRole('textbox');
    await user.type(composer, '尚未发送的草稿');
    await user.click(
      screen.getByRole('button', { name: '会话历史', exact: true }),
    );
    const history = await screen.findByRole('region', {
      name: '会话历史',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      history.querySelector('[data-agent-icon="codex-acp"]'),
    ).not.toBeNull();
    const search = within(history).getByRole('textbox', {
      name: '搜索会话',
    });
    await user.type(search, 'cursor');
    expect(within(history).getByText('没有找到匹配的会话')).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'CODEX');
    expect(within(history).getByText('分析知识结构')).toBeTruthy();
    await user.click(
      within(history).getByRole('button', { name: '返回聊天' }),
    );
    expect(screen.getByRole('textbox')).toBe(composer);
    expect((composer as HTMLTextAreaElement).value).toBe('尚未发送的草稿');
    expect(
      (state.runtime as { disconnect: unknown }).disconnect,
    ).not.toHaveBeenCalled();
  });
  it('returns to the running current session without reconnecting and blocks other sessions', async () => {
    const runtime = state.runtime as {
      getSnapshot: () => AgentView;
      disconnect: unknown;
    };
    runtime.getSnapshot().phase = 'running';
    runtime.getSnapshot().record.messages = [
      { id: 'msg', role: 'user', text: '任务' },
    ];
    state.history = [historical];
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    await user.click(
      screen.getByRole('button', { name: '会话历史', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: /分析知识结构/ }),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      '请先停止当前任务',
    );
    await user.click(screen.getByRole('button', { name: /New.*当前会话/ }));
    expect(screen.queryByRole('region', { name: '会话历史' })).toBeNull();
    expect(runtime.disconnect).not.toHaveBeenCalled();
  });
  it('retains the current conversation when reading fails and opens removed-agent history read-only', async () => {
    state.history = [historical];
    state.readSession
      .mockRejectedValueOnce(new Error('读取失败'))
      .mockResolvedValueOnce(historical);
    const runtime = state.runtime as { disconnect: unknown };
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    await user.click(
      screen.getByRole('button', { name: '会话历史', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: /分析知识结构/ }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      '读取失败',
    );
    expect(runtime.disconnect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /分析知识结构/ }));
    expect(await screen.findByText('已有的会话内容')).toBeTruthy();
    expect(state.readSession).toHaveBeenCalledWith({
      rootPath: '/workspace',
      id: 'older',
    });
    expect(runtime.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: '会话历史' })).toBeNull();
  });
  it('restores the selected record with its own profile and reconnects without submitting a prompt', async () => {
    state.history = [historical];
    state.readSession.mockResolvedValue(historical);
    const profile = {
      id: 'removed',
      agentId: 'codex-acp',
      name: 'Codex',
      enabled: true,
    } as AgentProfile;
    state.catalog.profiles = [profile];
    const previous = state.runtime as AgentRuntime;
    const nextView = { ...previous.getSnapshot(), record: historical };
    const next = {
      ...previous,
      profile,
      getSnapshot: () => nextView,
      connect: vi.fn(async () => {}),
      prompt: vi.fn(),
    };
    vi.mocked(AgentRuntime).mockImplementation(function () {
      return next as unknown as AgentRuntime;
    });
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    await user.click(
      screen.getByRole('button', { name: '会话历史', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: /分析知识结构/ }),
    );
    await waitFor(() => expect(next.connect).toHaveBeenCalledTimes(1));
    expect(AgentRuntime).toHaveBeenCalledWith(
      profile,
      '/workspace',
      historical,
    );
    expect(next.prompt).not.toHaveBeenCalled();
    expect(screen.getByText('已有的会话内容')).toBeTruthy();
  });
  it('ignores a delayed session read after returning to chat', async () => {
    state.history = [historical];
    let resolve!: (record: unknown) => void;
    state.readSession.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const previous = state.runtime as AgentRuntime;
    const user = userEvent.setup();
    render(<AgentPanel {...props} />);
    await user.click(
      screen.getByRole('button', { name: '会话历史', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: /分析知识结构/ }),
    );
    await user.click(screen.getByRole('button', { name: '返回聊天' }));
    resolve(historical);
    await waitFor(() => expect(screen.getByRole('textbox')).toBeTruthy());
    expect(previous.disconnect).not.toHaveBeenCalled();
    expect(screen.queryByText('已有的会话内容')).toBeNull();
  });
});

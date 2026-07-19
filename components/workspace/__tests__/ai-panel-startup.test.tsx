import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  listen: vi.fn(),
  readPluginIcon: vi.fn(),
  rejectPending: vi.fn(),
  request: vi.fn(),
  start: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../codex-app-server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../codex-app-server')>();
  return {
    ...actual,
    codexAppServerClient: {
      rejectPending: bridge.rejectPending,
      request: bridge.request,
      subscribe: bridge.subscribe,
    },
    listenCodexEventsUntilDisposed: bridge.listen,
    readCodexPluginIcon: bridge.readPluginIcon,
    startCodexRuntime: bridge.start,
  };
});

vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();
  return {
    ...actual,
    isTauriRuntime: () => true,
    openUrlInDefaultBrowser: vi.fn(),
  };
});

import { AiPanel } from '../ai-panel';
import type { CodexProtocolMessage } from '../codex-app-server';

const activeDocument = {
  absolutePath: '/workspace/Test.md',
  id: 'spring-boot-intro',
  kind: 'document' as const,
  name: 'Test.md',
  relativePath: 'Test.md',
  title: 'Spring Boot 介绍',
};

const runtime = {
  available: true,
  running: true,
  binarySource: 'bundled',
  version: 'codex-cli 0.144.4',
  storageMode: 'sharedCodexHome' as const,
  storageRoot: '/Users/example/.codex',
  message: null,
};

let protocolSubscriber: ((message: CodexProtocolMessage) => void) | null = null;

function planCapableModelResponse() {
  return {
    data: [
      {
        defaultReasoningEffort: 'high',
        description: '测试模型',
        displayName: 'GPT Test',
        hidden: false,
        id: 'gpt-test',
        isDefault: true,
        model: 'gpt-test',
        supportedReasoningEfforts: [
          { description: '中等', reasoningEffort: 'medium' },
          { description: '高', reasoningEffort: 'high' },
        ],
      },
    ],
    nextCursor: null,
  };
}

function defaultResponse(method: string) {
  if (method === 'account/read') {
    return {
      account: { type: 'chatgpt', email: null, planType: 'plus' },
      requiresOpenaiAuth: false,
    };
  }
  if (method === 'model/list') {
    return { data: [], nextCursor: null };
  }
  if (method === 'collaborationMode/list') {
    return {
      data: [
        { name: 'Plan', mode: 'plan', model: null, reasoning_effort: 'medium' },
        { name: 'Default', mode: 'default', model: null, reasoning_effort: null },
      ],
    };
  }
  if (method === 'thread/list') {
    return { data: [], nextCursor: null };
  }
  if (method === 'mcpServerStatus/list') {
    return { data: [] };
  }
  if (method === 'permissionProfile/list') {
    return { data: [], nextCursor: null };
  }
  if (method === 'configRequirements/read') {
    return { requirements: null };
  }
  if (method === 'experimentalFeature/list') {
    return { data: [], nextCursor: null };
  }
  if (method === 'plugin/installed') {
    return {
      marketplaces: [],
      marketplaceLoadErrors: [],
    };
  }
  if (method === 'skills/list') {
    return {
      data: [
        {
          cwd: '/workspace',
          errors: [],
          skills: [],
        },
      ],
    };
  }
  if (method === 'thread/start') {
    return {
      activePermissionProfile: { extends: null, id: ':workspace' },
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
      thread: {
        id: 'thread-1',
        name: null,
        preview: '',
        createdAt: 1,
        updatedAt: 1,
        cwd: '/workspace',
        status: 'idle',
        turns: [],
      },
    };
  }
  if (method === 'turn/start') {
    return { turn: { id: 'turn-1' } };
  }
  return {};
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderPanel(
  onBeforeTurnStart = vi.fn().mockResolvedValue(true),
  currentDocument = null as typeof activeDocument | null,
  currentDocumentPath = currentDocument?.absolutePath ?? null,
) {
  return render(
    <AiPanel
      currentDocument={currentDocument}
      currentDocumentPath={currentDocumentPath}
      documents={[]}
      workspaceRootPath="/workspace"
      onBeforeTurnStart={onBeforeTurnStart}
      onOpenDocument={vi.fn()}
      onOpenPlanPreview={vi.fn()}
      onWorkspaceChanged={vi.fn()}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
  bridge.listen.mockReset().mockResolvedValue(vi.fn());
  bridge.readPluginIcon.mockReset();
  bridge.rejectPending.mockReset();
  bridge.start.mockReset().mockResolvedValue(runtime);
  protocolSubscriber = null;
  bridge.subscribe.mockReset().mockImplementation((subscriber) => {
    protocolSubscriber = subscriber;
    return vi.fn();
  });
  bridge.request.mockReset().mockImplementation((method: string) =>
    Promise.resolve(defaultResponse(method)),
  );
});

describe('AI panel startup lifecycle', () => {
  it('后台完成核心握手、自动加载插件与 Skill 且不预取 MCP 状态', async () => {
    renderPanel();

    await waitFor(() => expect(bridge.start).toHaveBeenCalledWith('/workspace'));
    await waitFor(() =>
      expect(screen.queryByText('正在准备')).toBeNull(),
    );
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('plugin/installed', {
        cwds: ['/workspace'],
        installSuggestionPluginNames: [],
      }),
    );
    expect(
      bridge.request.mock.calls.filter(
        ([method]) => method === 'plugin/installed',
      ),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('skills/list', {
        cwds: ['/workspace'],
        forceReload: false,
      }),
    );
    expect(bridge.request).not.toHaveBeenCalledWith(
      'mcpServerStatus/list',
      expect.anything(),
    );
    expect(screen.queryByText('正在连接 Codex')).toBeNull();
    expect(screen.getByRole('textbox', { name: '向 Codex 提问' })).toBeTruthy();
  });

  it('收到 skills/changed 后强制刷新当前工作区技能', async () => {
    renderPanel();

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('skills/list', {
        cwds: ['/workspace'],
        forceReload: false,
      }),
    );
    protocolSubscriber?.({ method: 'skills/changed' });

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('skills/list', {
        cwds: ['/workspace'],
        forceReload: true,
      }),
    );
  });

  it('从斜杠面板选择 Skill 后发送协议要求的文本令牌和原生输入', async () => {
    const user = userEvent.setup();
    bridge.request.mockImplementation((method: string) =>
      Promise.resolve(
        method === 'skills/list'
          ? {
              data: [
                {
                  cwd: '/workspace',
                  errors: [],
                  skills: [
                    {
                      description: 'Internal prototype QA comparison',
                      enabled: true,
                      interface: {
                        displayName: 'Design QA',
                        shortDescription: 'Compare implementation against a visual source',
                      },
                      name: 'design-qa',
                      path: '/Users/example/.codex/skills/design-qa/SKILL.md',
                      scope: 'user',
                      shortDescription: null,
                    },
                  ],
                },
              ],
            }
          : defaultResponse(method),
      ),
    );
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '/Design');
    await user.click(
      await screen.findByRole('option', { name: /Design QA/ }),
    );
    await user.type(editor, '检查页面');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          input: [
            expect.objectContaining({
              type: 'text',
              text: '$design-qa 检查页面',
            }),
            {
              type: 'skill',
              name: 'design-qa',
              path: '/Users/example/.codex/skills/design-qa/SKILL.md',
            },
          ],
        }),
      ),
    );
  });

  it('读取 App Server 授权的本地图标并保留明暗主题资源', async () => {
    const user = userEvent.setup();
    bridge.readPluginIcon.mockImplementation((path: string) =>
      Promise.resolve({
        base64Data: path.endsWith('dark.png') ? 'ZGFyaw==' : 'bGlnaHQ=',
        mediaType: 'image/png',
      }),
    );
    bridge.request.mockImplementation((method: string) =>
      Promise.resolve(
        method === 'plugin/installed'
          ? {
              marketplaces: [
                {
                  name: 'OpenAI',
                  plugins: [
                    {
                      availability: 'AVAILABLE',
                      enabled: true,
                      id: 'documents',
                      installed: true,
                      interface: {
                        brandColor: '#3574f0',
                        composerIcon: null,
                        composerIconUrl: null,
                        displayName: 'Documents',
                        logo: '/icons/documents.png',
                        logoDark: '/icons/documents-dark.png',
                        logoUrl: null,
                        logoUrlDark: null,
                        shortDescription: 'Create and edit documents',
                      },
                      name: 'documents',
                    },
                  ],
                },
              ],
              marketplaceLoadErrors: [],
            }
          : defaultResponse(method),
      ),
    );
    renderPanel();

    await waitFor(() => expect(bridge.readPluginIcon).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));

    const item = screen.getByText('Documents').closest('[role="menuitem"]');
    const images = item?.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images?.[0]?.getAttribute('src')).toBe('data:image/png;base64,bGlnaHQ=');
    expect(images?.[1]?.getAttribute('src')).toBe('data:image/png;base64,ZGFyaw==');
  });

  it('单个本地图标读取失败时继续展示插件并降级到安全的 HTTPS 图标', async () => {
    const user = userEvent.setup();
    bridge.readPluginIcon.mockRejectedValue(new Error('icon unavailable'));
    bridge.request.mockImplementation((method: string) =>
      Promise.resolve(
        method === 'plugin/installed'
          ? {
              marketplaces: [
                {
                  name: 'OpenAI',
                  plugins: [
                    {
                      availability: 'AVAILABLE',
                      enabled: true,
                      id: 'browser',
                      installed: true,
                      interface: {
                        composerIcon: '/icons/browser.png',
                        composerIconUrl: 'https://example.com/browser.png',
                        displayName: 'Browser',
                        shortDescription: 'Control the browser',
                      },
                      name: 'browser',
                    },
                    {
                      availability: 'AVAILABLE',
                      enabled: true,
                      id: 'unsafe-icon',
                      installed: true,
                      interface: {
                        composerIcon: null,
                        composerIconUrl: 'http://example.com/unsafe.png',
                        displayName: 'Unsafe Icon',
                        shortDescription: null,
                      },
                      name: 'unsafe-icon',
                    },
                  ],
                },
              ],
              marketplaceLoadErrors: [],
            }
          : defaultResponse(method),
      ),
    );
    renderPanel();

    await waitFor(() => expect(bridge.readPluginIcon).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));

    const browserItem = screen.getByText('Browser').closest('[role="menuitem"]');
    expect(browserItem?.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/browser.png',
    );
    expect(screen.getByText('Unsafe Icon')).toBeTruthy();
    expect(
      screen.getByText('Unsafe Icon').closest('[role="menuitem"]')?.querySelector('img'),
    ).toBeNull();
  });

  it('用户在核心初始化完成前发送时等待就绪并继续提交', async () => {
    const user = userEvent.setup();
    const account = deferred<ReturnType<typeof defaultResponse>>();
    const onBeforeTurnStart = vi.fn().mockResolvedValue(true);
    bridge.request.mockImplementation((method: string) =>
      method === 'account/read'
        ? account.promise
        : Promise.resolve(defaultResponse(method)),
    );
    renderPanel(onBeforeTurnStart);

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '总结当前文档');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(onBeforeTurnStart).not.toHaveBeenCalled();

    account.resolve(defaultResponse('account/read'));

    await waitFor(() => expect(onBeforeTurnStart).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'thread/start',
        expect.objectContaining({ cwd: '/workspace' }),
      ),
    );
  });

  it('模型目录和历史未完成时使用服务端默认模型发送', async () => {
    const user = userEvent.setup();
    const models = deferred<ReturnType<typeof defaultResponse>>();
    const history = deferred<ReturnType<typeof defaultResponse>>();
    bridge.request.mockImplementation((method: string) => {
      if (method === 'model/list') return models.promise;
      if (method === 'thread/list') return history.promise;
      return Promise.resolve(defaultResponse(method));
    });
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '快速回答');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ threadId: 'thread-1' }),
      ),
    );
    const threadStartParams = bridge.request.mock.calls.find(
      ([method]) => method === 'thread/start',
    )?.[1];
    const turnStartParams = bridge.request.mock.calls.find(
      ([method]) => method === 'turn/start',
    )?.[1];
    expect(threadStartParams).not.toHaveProperty('model');
    expect(turnStartParams).not.toHaveProperty('model');
    expect(turnStartParams).not.toHaveProperty('effort');

    models.resolve(defaultResponse('model/list'));
    history.resolve(defaultResponse('thread/list'));
  });

  it('计划模式通过 collaborationMode 固定 medium 且不发送竞争字段', async () => {
    const user = userEvent.setup();
    bridge.request.mockImplementation((method: string) =>
      Promise.resolve(
        method === 'model/list'
          ? planCapableModelResponse()
          : defaultResponse(method),
      ),
    );
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('计划模式'));
    expect(screen.getByRole('button', { name: '退出计划模式' })).toBeTruthy();

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '设计实施方案');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          collaborationMode: {
            mode: 'plan',
            settings: {
              developer_instructions: null,
              model: 'gpt-test',
              reasoning_effort: 'medium',
            },
          },
        }),
      ),
    );
    const turnStartParams = bridge.request.mock.calls.find(
      ([method]) => method === 'turn/start',
    )?.[1];
    expect(turnStartParams).not.toHaveProperty('model');
    expect(turnStartParams).not.toHaveProperty('effort');
  });

  it('正式计划完成后可在原任务切回 Default 并发送固定实施消息', async () => {
    const user = userEvent.setup();
    let turnCount = 0;
    bridge.request.mockImplementation((method: string) => {
      if (method === 'model/list') {
        return Promise.resolve(planCapableModelResponse());
      }
      if (method === 'turn/start') {
        turnCount += 1;
        return Promise.resolve({ turn: { id: `turn-${turnCount}` } });
      }
      return Promise.resolve(defaultResponse(method));
    });
    renderPanel(vi.fn().mockResolvedValue(true), activeDocument);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('计划模式'));
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.type(editor, '设计实施方案');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(turnCount).toBe(1));

    act(() => {
      protocolSubscriber?.({
        method: 'item/completed',
        params: {
          turnId: 'turn-1',
          item: { id: 'plan-1', type: 'plan', text: '# 计划\n\n1. 实施' },
        },
      });
      protocolSubscriber?.({
        method: 'turn/completed',
        params: { turn: { id: 'turn-1', status: 'completed', items: [] } },
      });
    });

    await user.click(
      await screen.findByRole('button', { name: '实施此计划' }),
    );
    await waitFor(() => expect(turnCount).toBe(2));
    const implementationParams = bridge.request.mock.calls.filter(
      ([method]) => method === 'turn/start',
    )[1]?.[1];
    expect(implementationParams).toMatchObject({
      collaborationMode: {
        mode: 'default',
        settings: {
          developer_instructions: null,
          model: 'gpt-test',
          reasoning_effort: 'high',
        },
      },
      input: [expect.objectContaining({ text: 'Implement the plan.' })],
      madoraDocumentReferences: [
        {
          path: '/workspace/Test.md',
          role: 'active',
        },
      ],
      threadId: 'thread-1',
    });
  });

  it('正式计划可作为完整首条消息在新 Default 任务实施', async () => {
    const user = userEvent.setup();
    let turnCount = 0;
    bridge.request.mockImplementation((method: string) => {
      if (method === 'model/list') {
        return Promise.resolve(planCapableModelResponse());
      }
      if (method === 'turn/start') {
        turnCount += 1;
        return Promise.resolve({ turn: { id: `turn-${turnCount}` } });
      }
      return Promise.resolve(defaultResponse(method));
    });
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('计划模式'));
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.type(editor, '设计实施方案');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(turnCount).toBe(1));

    act(() => {
      protocolSubscriber?.({
        method: 'item/completed',
        params: {
          turnId: 'turn-1',
          item: { id: 'plan-1', type: 'plan', text: '# 计划\n\n1. 新任务实施' },
        },
      });
      protocolSubscriber?.({
        method: 'turn/completed',
        params: { turn: { id: 'turn-1', status: 'completed', items: [] } },
      });
    });

    await user.click(
      await screen.findByRole('button', { name: '清空上下文后实施' }),
    );
    await waitFor(() => expect(turnCount).toBe(2));
    expect(
      bridge.request.mock.calls.filter(([method]) => method === 'thread/start'),
    ).toHaveLength(2);
    const implementationParams = bridge.request.mock.calls.filter(
      ([method]) => method === 'turn/start',
    )[1]?.[1];
    expect(implementationParams).toMatchObject({
      collaborationMode: {
        mode: 'default',
        settings: { reasoning_effort: 'high' },
      },
      input: [
        expect.objectContaining({
          text: expect.stringContaining('# 计划\n\n1. 新任务实施'),
        }),
      ],
      threadId: 'thread-1',
    });
  });

  it('每个 turn 把编辑器活跃文档标记为独立上下文角色', async () => {
    const user = userEvent.setup();
    const onBeforeTurnStart = vi.fn().mockResolvedValue(true);
    renderPanel(onBeforeTurnStart, activeDocument);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    expect(screen.getAllByText('Test.md').length).toBeGreaterThan(0);
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '当前文档是什么？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          input: [
            expect.objectContaining({ text: '当前文档是什么？' }),
          ],
          madoraDocumentReferences: [
            {
              path: '/workspace/Test.md',
              role: 'active',
            },
          ],
        }),
      ),
    );
    expect(onBeforeTurnStart).toHaveBeenCalledWith('/workspace/Test.md');
  });

  it('活动标签路径与已加载文档不一致时阻止发送', async () => {
    const user = userEvent.setup();
    const onBeforeTurnStart = vi.fn().mockResolvedValue(true);
    renderPanel(onBeforeTurnStart, null, '/workspace/Test.md');

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '修改当前文档');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(
      await screen.findByText(
        '当前标签页尚未完成加载，无法安全发送给 Codex。请稍后重试。',
      ),
    ).toBeTruthy();
    expect(onBeforeTurnStart).not.toHaveBeenCalled();
    expect(
      bridge.request.mock.calls.filter(([method]) => method === 'turn/start'),
    ).toHaveLength(0);
  });

  it('切换工作区后忽略旧工作区晚到的后台历史响应', async () => {
    const user = userEvent.setup();
    const oldHistory = deferred<{ data: Array<Record<string, unknown>>; nextCursor: null }>();
    bridge.request.mockImplementation(
      (method: string, params?: Record<string, unknown>) => {
        if (method === 'thread/list' && params?.cwd === '/workspace') {
          return oldHistory.promise;
        }
        if (method === 'thread/list' && params?.cwd === '/workspace-2') {
          return Promise.resolve({
            data: [
              {
                id: 'new-thread',
                name: '新工作区任务',
                preview: 'new',
                createdAt: 2,
                updatedAt: 2,
                cwd: '/workspace-2',
                status: 'idle',
                turns: [],
              },
            ],
            nextCursor: null,
          });
        }
        return Promise.resolve(defaultResponse(method));
      },
    );
    const view = renderPanel();

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'thread/list',
        expect.objectContaining({ cwd: '/workspace' }),
      ),
    );
    view.rerender(
      <AiPanel
        currentDocument={null}
        currentDocumentPath={null}
        documents={[]}
        workspaceRootPath="/workspace-2"
        onBeforeTurnStart={vi.fn().mockResolvedValue(true)}
        onOpenDocument={vi.fn()}
        onOpenPlanPreview={vi.fn()}
        onWorkspaceChanged={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'thread/list',
        expect.objectContaining({ cwd: '/workspace-2' }),
      ),
    );
    oldHistory.resolve({
      data: [
        {
          id: 'old-thread',
          name: '旧工作区任务',
          preview: 'old',
          createdAt: 1,
          updatedAt: 1,
          cwd: '/workspace',
          status: 'idle',
          turns: [],
        },
      ],
      nextCursor: null,
    });

    await user.click(screen.getByRole('button', { name: '历史记录' }));
    await waitFor(() => expect(screen.getByText('新工作区任务')).toBeTruthy());
    expect(screen.queryByText('旧工作区任务')).toBeNull();
  });
});

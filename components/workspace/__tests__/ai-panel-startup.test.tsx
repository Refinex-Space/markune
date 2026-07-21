import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  listen: vi.fn(),
  pasteAttachments: vi.fn(),
  readAttachmentPreview: vi.fn(),
  readPluginIcon: vi.fn(),
  releaseAttachments: vi.fn(),
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
    pasteCodexContextAttachments: bridge.pasteAttachments,
    readCodexContextAttachmentPreview: bridge.readAttachmentPreview,
    readCodexPluginIcon: bridge.readPluginIcon,
    releaseCodexContextAttachments: bridge.releaseAttachments,
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

const activeDrawing = {
  albumPath: '架构',
  elementCount: 24,
  hasPreview: true,
  id: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  title: 'Spring Cloud 微服务架构',
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
    return {
      data: [{ enabled: true, name: 'goals', stage: 'stable' }],
      nextCursor: null,
    };
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
  documents: Array<Omit<typeof activeDocument, 'kind'>> = [],
  drawing = null as typeof activeDrawing | null,
  drawings: Array<typeof activeDrawing> = [],
) {
  return render(
    <AiPanel
      activeDrawing={drawing}
      currentDocument={currentDocument}
      currentDocumentPath={currentDocumentPath}
      documents={documents}
      drawings={drawings}
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
  bridge.pasteAttachments.mockReset().mockResolvedValue(null);
  bridge.readAttachmentPreview.mockReset();
  bridge.readPluginIcon.mockReset();
  bridge.releaseAttachments.mockReset().mockResolvedValue(undefined);
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
  it('图片粘贴进入附件栏，turn 接受前保留并在成功后释放授权', async () => {
    const user = userEvent.setup();
    const turnStart = deferred<{ turn: { id: string } }>();
    bridge.pasteAttachments.mockResolvedValue([
      {
        attachmentId: 'image-grant-1',
        isImage: true,
        kind: 'file',
        mediaType: 'image/png',
        name: '粘贴图片.png',
        previewAvailable: true,
        previewMediaType: 'image/png',
        sizeBytes: 8,
      },
    ]);
    bridge.readAttachmentPreview.mockResolvedValue(
      new Uint8Array([137, 80, 78, 71]),
    );
    bridge.request.mockImplementation((method: string) =>
      method === 'turn/start'
        ? turnStart.promise
        : Promise.resolve(defaultResponse(method)),
    );
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    fireEvent.paste(editor, { clipboardData: { getData: () => '' } });
    await screen.findByRole('button', { name: '预览图片 粘贴图片.png' });
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({ madoraFileAttachments: ['image-grant-1'] }),
      ),
    );
    expect(screen.getAllByText('粘贴图片.png').length).toBeGreaterThan(0);
    expect(bridge.releaseAttachments).not.toHaveBeenCalledWith(['image-grant-1']);

    turnStart.resolve({ turn: { id: 'turn-image' } });
    await waitFor(() =>
      expect(bridge.releaseAttachments).toHaveBeenCalledWith(['image-grant-1']),
    );
  });

  it('turn/start 失败时删除本次空任务并完整保留文字和附件', async () => {
    const user = userEvent.setup();
    bridge.pasteAttachments.mockResolvedValue([
      {
        attachmentId: 'file-grant-1',
        isImage: false,
        kind: 'file',
        mediaType: null,
        name: 'CONTRIBUTING.md',
        previewAvailable: false,
        previewMediaType: null,
        sizeBytes: 1200,
      },
    ]);
    bridge.request.mockImplementation((method: string) =>
      method === 'turn/start'
        ? Promise.reject(new Error('turn failed'))
        : Promise.resolve(defaultResponse(method)),
    );
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.type(editor, '请审阅附件');
    fireEvent.paste(editor, { clipboardData: { getData: () => '' } });
    await screen.findByText('CONTRIBUTING.md');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await screen.findByText('turn failed');
    expect(editor.textContent).toBe('请审阅附件');
    expect(screen.getByText('CONTRIBUTING.md')).toBeTruthy();
    expect(bridge.releaseAttachments).not.toHaveBeenCalledWith(['file-grant-1']);
    expect(bridge.request).toHaveBeenCalledWith('thread/delete', {
      threadId: 'thread-1',
    });
  });

  it('模型显式不支持 image 时阻止发送并保留附件', async () => {
    const user = userEvent.setup();
    bridge.pasteAttachments.mockResolvedValue([
      {
        attachmentId: 'image-grant-unsupported',
        isImage: true,
        kind: 'file',
        mediaType: 'image/png',
        name: '截图.png',
        previewAvailable: false,
        previewMediaType: null,
        sizeBytes: 12,
      },
    ]);
    bridge.request.mockImplementation((method: string) => {
      if (method === 'model/list') {
        const response = planCapableModelResponse();
        return Promise.resolve({
          ...response,
          data: response.data.map((model) => ({
            ...model,
            inputModalities: ['text'] as const,
          })),
        });
      }
      return Promise.resolve(defaultResponse(method));
    });
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    fireEvent.paste(editor, { clipboardData: { getData: () => '' } });
    await screen.findByRole('button', { name: '图片 截图.png 暂无安全预览' });
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(
      await screen.findByText('当前模型不支持图片输入；附件和草稿已保留。'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '图片 截图.png 暂无安全预览' }),
    ).toBeTruthy();
    expect(
      bridge.request.mock.calls.some(([method]) => method === 'turn/start'),
    ).toBe(false);
  });

  it('每个 turn 感知当前活跃图稿并在发送前刷新保存', async () => {
    const user = userEvent.setup();
    const onBeforeTurnStart = vi.fn().mockResolvedValue(true);
    renderPanel(onBeforeTurnStart, null, null, [], activeDrawing, [activeDrawing]);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    expect(screen.getAllByText(activeDrawing.title).length).toBeGreaterThan(0);
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '分析当前图稿的连线');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          madoraDrawingReferences: [
            { drawingId: activeDrawing.id, role: 'active' },
          ],
        }),
      ),
    );
    expect(onBeforeTurnStart).toHaveBeenCalledWith(null, activeDrawing.id);
  });

  it('通过 @ 搜索并提及图稿，发送稳定 Drawing URI 和结构化引用', async () => {
    const user = userEvent.setup();
    const openDrawing = vi.fn();
    window.addEventListener('madora:open-drawing', openDrawing, { once: true });
    renderPanel(vi.fn().mockResolvedValue(true), null, null, [], null, [activeDrawing]);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@SpringCloud');
    const option = screen.getByRole('option', {
      name: `提及 ${activeDrawing.title}`,
    });
    expect(within(option).getByText('架构')).toBeTruthy();
    await user.click(option);
    await user.type(editor, '检查连线');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          input: [
            expect.objectContaining({
              text: `madora-drawing://${activeDrawing.id} 检查连线`,
            }),
          ],
          madoraDrawingReferences: [
            { drawingId: activeDrawing.id, role: 'mention' },
          ],
        }),
      ),
    );
    await user.click(
      screen.getByRole('link', { name: activeDrawing.title }),
    );
    expect(openDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { drawingId: activeDrawing.id },
      }),
    );
  });

  it('当前文档会进入 @ 候选并在同等匹配中优先', async () => {
    const user = userEvent.setup();
    const competingDocument = {
      absolutePath: '/workspace/Guides/Spring Boot Advanced.md',
      id: 'spring-boot-advanced',
      name: 'Spring Boot Advanced.md',
      relativePath: 'Guides/Spring Boot Advanced.md',
      title: 'Spring Boot 进阶',
    };
    const currentReference = {
      absolutePath: activeDocument.absolutePath,
      id: activeDocument.id,
      name: activeDocument.name,
      relativePath: activeDocument.relativePath,
      title: activeDocument.title,
    };

    renderPanel(
      vi.fn().mockResolvedValue(true),
      activeDocument,
      activeDocument.absolutePath,
      [competingDocument, currentReference],
    );

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '@SpringB');

    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-label')).toBe(
      '提及 Spring Boot 介绍，当前文档',
    );
    expect(within(options[0]).getByText('Test.md')).toBeTruthy();
  });

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
      expect(bridge.request).toHaveBeenCalledWith('skills/extraRoots/set', {}),
    );
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('skills/list', {
        cwds: ['/workspace'],
        forceReload: false,
      }),
    );
    const extraRootsCall = bridge.request.mock.calls.findIndex(
      ([method]) => method === 'skills/extraRoots/set',
    );
    const skillsListCall = bridge.request.mock.calls.findIndex(
      ([method]) => method === 'skills/list',
    );
    expect(extraRootsCall).toBeGreaterThanOrEqual(0);
    expect(skillsListCall).toBeGreaterThan(extraRootsCall);
    expect(bridge.request).not.toHaveBeenCalledWith(
      'mcpServerStatus/list',
      expect.anything(),
    );
    expect(screen.queryByText('正在连接 Codex')).toBeNull();
    expect(screen.getByRole('textbox', { name: '向 Codex 提问' })).toBeTruthy();
  });

  it('新会话在没有活动文档时展示工作区任务入口', async () => {
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    expect(
      screen.getByRole('heading', { name: '今天想在工作区里做什么？' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '了解工作区' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '起草新文档' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '整理知识结构' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查找内容问题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI 画图' })).toBeTruthy();
  });

  it('新会话使用活动文档物理路径生成任务入口并可直接发送', async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn().mockResolvedValue(true), activeDocument);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    expect(
      screen.getByRole('heading', { name: '想如何处理「Test.md」？' }),
    ).toBeTruthy();
    expect(screen.queryByText('Spring Boot 介绍')).toBeNull();

    await user.click(screen.getByRole('button', { name: '阅读并理解' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          input: [
            expect.objectContaining({
              text: '总结当前文档并指出信息缺口',
            }),
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

  it('注册内置 Skill 触发 skills/changed 时不会形成重复注册循环', async () => {
    const user = userEvent.setup();
    let extraRootsCalls = 0;
    bridge.request.mockImplementation((method: string) => {
      if (method === 'skills/extraRoots/set') {
        extraRootsCalls += 1;
        if (extraRootsCalls <= 3) {
          queueMicrotask(() => protocolSubscriber?.({ method: 'skills/changed' }));
        }
        return Promise.resolve({});
      }
      if (method === 'skills/list') {
        return Promise.resolve({
          data: [
            {
              cwd: '/workspace',
              errors: [],
              skills: [
                {
                  description: 'Create editable Madora technical diagrams',
                  enabled: true,
                  interface: {
                    displayName: 'Madora AI 画图',
                    shortDescription: '创建可编辑技术图稿',
                  },
                  name: 'madora-diagram',
                  path: '/Applications/Madora.app/skills/madora-diagram/SKILL.md',
                  scope: 'user',
                  shortDescription: null,
                },
              ],
            },
          ],
        });
      }
      return Promise.resolve(defaultResponse(method));
    });

    renderPanel();

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('skills/list', {
        cwds: ['/workspace'],
        forceReload: true,
      }),
    );
    expect(
      bridge.request.mock.calls.filter(
        ([method]) => method === 'skills/extraRoots/set',
      ),
    ).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'AI 画图' }));
    const diagramSkillMention = await screen.findByRole('note', {
      name: 'Madora AI 画图',
    });
    expect(diagramSkillMention.classList.contains('inline-flex')).toBe(true);
    expect(diagramSkillMention.classList.contains('whitespace-nowrap')).toBe(true);
    expect(
      screen.queryByText('AI 画图 Skill 加载失败，请重试或重启 Madora。'),
    ).toBeNull();

    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    await user.click(editor);
    await user.type(editor, '画 Spring Cloud 架构');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith(
        'turn/start',
        expect.objectContaining({
          input: [
            expect.objectContaining({
              type: 'text',
              text: '$madora-diagram 画 Spring Cloud 架构',
            }),
            {
              type: 'skill',
              name: 'madora-diagram',
              path: '/Applications/Madora.app/skills/madora-diagram/SKILL.md',
            },
          ],
        }),
      ),
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

  it('目标模式发送首条消息后建立线程 Goal 并展示原生状态', async () => {
    const user = userEvent.setup();
    bridge.request.mockImplementation(
      (method: string, params?: Record<string, unknown>) => {
        if (method === 'thread/goal/set') {
          return Promise.resolve({
            goal: {
              createdAt: 100,
              objective: params?.objective ?? '持续目标',
              status: params?.status ?? 'active',
              threadId: params?.threadId ?? 'thread-1',
              timeUsedSeconds: 0,
              tokenBudget: null,
              tokensUsed: 0,
              updatedAt: 100,
            },
          });
        }
        return Promise.resolve(defaultResponse(method));
      },
    );
    renderPanel();

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
    await user.click(screen.getByRole('button', { name: '添加上下文与工具' }));
    await user.click(screen.getByText('目标'));
    const editor = screen.getByRole('textbox', { name: '向 Codex 提问' });
    expect(editor.getAttribute('data-placeholder')).toBe(
      '描述你的目标，定义可衡量的成果，以获得最佳效果',
    );
    await user.click(editor);
    await user.type(editor, '持续修复问题直到全部测试通过');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(bridge.request).toHaveBeenCalledWith('thread/goal/set', {
        objective: '持续修复问题直到全部测试通过',
        status: 'active',
        threadId: 'thread-1',
      }),
    );
    const turnStartIndex = bridge.request.mock.calls.findIndex(
      ([method]) => method === 'turn/start',
    );
    const goalSetIndex = bridge.request.mock.calls.findIndex(
      ([method]) => method === 'thread/goal/set',
    );
    expect(turnStartIndex).toBeGreaterThanOrEqual(0);
    expect(goalSetIndex).toBeGreaterThan(turnStartIndex);
    expect(await screen.findByText('进行中的目标')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: '目标状态' })).getByText(
        '持续修复问题直到全部测试通过',
      ),
    ).toBeTruthy();
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
    expect(onBeforeTurnStart).toHaveBeenCalledWith('/workspace/Test.md', null);
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

import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  listen: vi.fn(),
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

const activeDocument = {
  absolutePath: '/workspace/Guides/Spring Boot 介绍.md',
  id: 'spring-boot-intro',
  kind: 'document' as const,
  name: 'Spring Boot 介绍.md',
  relativePath: 'Guides/Spring Boot 介绍.md',
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
) {
  return render(
    <AiPanel
      currentDocument={currentDocument}
      documents={[]}
      workspaceRootPath="/workspace"
      onBeforeTurnStart={onBeforeTurnStart}
      onOpenDocument={vi.fn()}
      onWorkspaceChanged={vi.fn()}
    />,
  );
}

beforeEach(() => {
  bridge.listen.mockReset().mockResolvedValue(vi.fn());
  bridge.rejectPending.mockReset();
  bridge.start.mockReset().mockResolvedValue(runtime);
  bridge.subscribe.mockReset().mockReturnValue(vi.fn());
  bridge.request.mockReset().mockImplementation((method: string) =>
    Promise.resolve(defaultResponse(method)),
  );
});

describe('AI panel startup lifecycle', () => {
  it('后台完成核心握手且不再预取 MCP 状态', async () => {
    renderPanel();

    await waitFor(() => expect(bridge.start).toHaveBeenCalledWith('/workspace'));
    await waitFor(() =>
      expect(screen.queryByText('正在准备')).toBeNull(),
    );
    expect(bridge.request).not.toHaveBeenCalledWith(
      'mcpServerStatus/list',
      expect.anything(),
    );
    expect(screen.queryByText('正在连接 Codex')).toBeNull();
    expect(screen.getByRole('textbox', { name: '向 Codex 提问' })).toBeTruthy();
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

  it('每个 turn 把编辑器活跃文档标记为独立上下文角色', async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn().mockResolvedValue(true), activeDocument);

    await waitFor(() => expect(screen.queryByText('正在准备')).toBeNull());
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
              path: '/workspace/Guides/Spring Boot 介绍.md',
              role: 'active',
            },
          ],
        }),
      ),
    );
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
        documents={[]}
        workspaceRootPath="/workspace-2"
        onBeforeTurnStart={vi.fn().mockResolvedValue(true)}
        onOpenDocument={vi.fn()}
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

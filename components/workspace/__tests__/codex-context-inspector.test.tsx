import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  request: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));
vi.mock('../codex-app-server', async (original) => ({
  ...(await original<typeof import('../codex-app-server')>()),
  codexAppServerClient: {
    request: bridge.request,
    subscribe: bridge.subscribe,
  },
}));
import { CodexContextInspector } from '../codex-context-inspector';
import type { CodexProtocolMessage } from '../codex-app-server';
const props = {
  root: '/vault',
  model: 'test-model',
  mode: '写作与研究',
  permission: ':read-only',
  documents: ['/vault/notes/中文 文档.md', '/vault/notes/中文 文档.md'],
  skills: [
    { name: 'user-skill', path: '/skills/user-skill/SKILL.md' },
  ],
  threadId: 'active',
  runtimeVersion: 'codex-cli 0.153.4',
};
beforeEach(() => {
  bridge.invoke.mockReset().mockResolvedValue([]);
  bridge.request.mockReset().mockResolvedValue({ data: [] });
  bridge.subscribe.mockReset().mockReturnValue(vi.fn());
});
it('groups and deduplicates context, labels disabled hooks and shows meaningful empty states', async () => {
  bridge.request.mockResolvedValue({
    data: [{ hooks: [{ eventName: 'sessionStart' }] }],
  });
  render(<CodexContextInspector {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '上下文检查' }));
  const dialog = screen.getByRole('dialog', { name: '上下文与执行范围' });
  expect(within(dialog).getAllByText('notes/中文 文档.md')).toHaveLength(1);
  expect(within(dialog).getByText('本模式已停用')).toBeTruthy();
  expect(await within(dialog).findByText('sessionStart')).toBeTruthy();
  expect(within(dialog).getByText('未发现指令文件')).toBeTruthy();
  expect(within(dialog).getByText('user-skill')).toBeTruthy();
});
it('does not display another workspace instruction list while loading a new root', async () => {
  bridge.invoke.mockResolvedValue([
    { path: '/vault/AGENTS.md', fingerprint: 'a'.repeat(64), bytes: 12 },
  ]);
  const view = render(<CodexContextInspector {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '上下文检查' }));
  expect(await screen.findByText('/vault/AGENTS.md')).toBeTruthy();
  let finish!: (files: unknown[]) => void;
  bridge.invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view.rerender(
    <CodexContextInspector {...props} root="/next-vault" documents={[]} />,
  );
  expect(screen.queryByText('/vault/AGENTS.md')).toBeNull();
  expect(screen.getByText('正在读取指令清单…')).toBeTruthy();
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => finish([]));
  expect(screen.getByText('未发现指令文件')).toBeTruthy();
});
it('only shows compaction from the active task and releases its subscription', async () => {
  const release = vi.fn();
  let subscriber!: (message: CodexProtocolMessage) => void;
  bridge.subscribe.mockImplementation((callback) => {
    subscriber = callback;
    return release;
  });
  const view = render(<CodexContextInspector {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '上下文检查' }));
  await act(async () =>
    subscriber({
      method: 'thread/compacted',
      params: { threadId: 'background' },
    }),
  );
  expect(screen.getByText('当前任务尚未观察到上下文压缩。')).toBeTruthy();
  await act(async () =>
    subscriber({ method: 'thread/compacted', params: { threadId: 'active' } }),
  );
  expect(screen.getByText(/最近压缩：/)).toBeTruthy();
  view.rerender(<CodexContextInspector {...props} threadId="next" />);
  expect(screen.getByText('当前任务尚未观察到上下文压缩。')).toBeTruthy();
  view.unmount();
  expect(release).toHaveBeenCalledTimes(2);
});

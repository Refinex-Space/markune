import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace } from '../use-workspace';

const api = vi.hoisted(() => ({
  getRecentWorkspacePath: vi.fn(() => null),
  getWorkspaceHistory: vi.fn(() => []),
  readMarkdownDocument: vi.fn(),
  saveMarkdownDocument: vi.fn(),
}));

vi.mock('../workspace-api', () => api);

const node = {
  absolutePath: '/workspace/README.md',
  id: 'readme',
  kind: 'document' as const,
  name: 'README.md',
  relativePath: 'README.md',
  title: 'README',
};
const snapshot = {
  nodes: [node],
  rootName: 'workspace',
  rootPath: '/workspace',
};
const original = markdown('原始内容');
const external = markdown('Codex 修改');

describe('useWorkspace AI 文件同步', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getRecentWorkspacePath.mockReturnValue(null);
    api.getWorkspaceHistory.mockReturnValue([]);
    api.readMarkdownDocument.mockResolvedValue({
      content: original,
      modifiedAt: 1,
      path: node.absolutePath,
    });
    api.saveMarkdownDocument.mockResolvedValue({
      modifiedAt: 2,
      path: node.absolutePath,
    });
  });

  it('发送 AI turn 前会立即保存当前草稿并返回真实结果', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));

    act(() => result.current.updateMarkdown(markdown('本地草稿')));
    let saved = false;
    await act(async () => {
      saved = await result.current.prepareCurrentDocumentForAi();
    });

    expect(saved).toBe(true);
    expect(api.saveMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      node.absolutePath,
      expect.stringContaining('本地草稿'),
      1,
    );
    expect(result.current.saveState).toBe('saved');
  });

  it('flush 边界只保存一次最新草稿，不会用旧闭包内容回写', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    const nextMarkdown = markdown('flush 后的新内容');

    let saved: boolean | void = false;
    await act(async () => {
      saved = await result.current.updateMarkdown(nextMarkdown, {
        saveImmediately: true,
      });
    });

    expect(saved).toBe(true);
    expect(api.saveMarkdownDocument).toHaveBeenCalledTimes(1);
    expect(api.saveMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      node.absolutePath,
      expect.stringContaining('flush 后的新内容'),
      1,
    );
    expect(api.saveMarkdownDocument.mock.calls[0]?.[2]).not.toContain(
      '原始内容',
    );
  });

  it('flush 后立即准备 AI 不会再次写回旧闭包草稿', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    const nextMarkdown = markdown('准备发送给 AI 的最新内容');

    await act(async () => {
      await result.current.updateMarkdown(nextMarkdown, {
        saveImmediately: true,
      });
      await result.current.prepareCurrentDocumentForAi();
    });

    expect(api.saveMarkdownDocument).toHaveBeenCalledTimes(1);
    expect(api.saveMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      node.absolutePath,
      expect.stringContaining('准备发送给 AI 的最新内容'),
      1,
    );
  });

  it('连续 flush 串行保存时使用上一轮返回的 modifiedAt', async () => {
    let resolveFirstSave!: (value: {
      modifiedAt: number;
      path: string;
    }) => void;
    api.saveMarkdownDocument
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce({
        modifiedAt: 3,
        path: node.absolutePath,
      });
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    let firstSave!: Promise<boolean | void>;
    let secondSave!: Promise<boolean | void>;

    act(() => {
      firstSave = Promise.resolve(
        result.current.updateMarkdown(markdown('第一轮 flush'), {
          saveImmediately: true,
        }),
      );
      secondSave = Promise.resolve(
        result.current.updateMarkdown(markdown('第二轮 flush'), {
          saveImmediately: true,
        }),
      );
    });
    await act(async () => {
      resolveFirstSave({ modifiedAt: 2, path: node.absolutePath });
      await Promise.all([firstSave, secondSave]);
    });

    expect(api.saveMarkdownDocument).toHaveBeenCalledTimes(2);
    expect(api.saveMarkdownDocument.mock.calls[0]?.[3]).toBe(1);
    expect(api.saveMarkdownDocument.mock.calls[1]?.[2]).toContain(
      '第二轮 flush',
    );
    expect(api.saveMarkdownDocument.mock.calls[1]?.[3]).toBe(2);
  });

  it('本地草稿未保存时不覆盖 Codex 磁盘版本，并可显式加载外部版本', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    act(() => result.current.updateMarkdown(markdown('本地草稿')));

    act(() => {
      result.current.syncExternalMarkdownDocument({
        content: external,
        modifiedAt: 3,
        path: node.absolutePath,
      });
    });

    expect(result.current.externalDocumentConflict).toMatchObject({
      path: node.absolutePath,
      externalDocument: { modifiedAt: 3 },
    });
    expect(result.current.draftDocument?.markdown).toContain('本地草稿');
    expect(api.saveMarkdownDocument).not.toHaveBeenCalled();

    await act(() => result.current.resolveExternalDocumentConflict('external'));
    await waitFor(() =>
      expect(result.current.draftDocument?.markdown).toContain('Codex 修改'),
    );
    expect(result.current.externalDocumentConflict).toBeNull();
  });

  it('AI 运行期间已经自动保存的用户编辑仍按并发冲突处理', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    await act(() => result.current.prepareCurrentDocumentForAi());
    act(() => result.current.updateMarkdown(markdown('AI 运行期间的用户编辑')));
    await act(() => result.current.saveCurrentDocumentNow());
    expect(result.current.saveState).toBe('saved');

    act(() => {
      result.current.syncExternalMarkdownDocument({
        content: external,
        modifiedAt: 3,
        path: node.absolutePath,
      });
    });

    expect(result.current.externalDocumentConflict?.path).toBe(node.absolutePath);
    expect(result.current.draftDocument?.markdown).toContain(
      'AI 运行期间的用户编辑',
    );
  });

  it('AI 重载后的同内容编辑器回声不会被误判为本地并发编辑', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    await act(() => result.current.prepareCurrentDocumentForAi());

    act(() => {
      result.current.syncExternalMarkdownDocument({
        content: external,
        modifiedAt: 3,
        path: node.absolutePath,
      });
    });
    expect(result.current.saveState).toBe('saved');

    act(() => result.current.updateMarkdown(external));
    expect(result.current.saveState).toBe('saved');
    expect(result.current.draftDocument?.markdown).toBe(external);

    act(() => {
      result.current.syncExternalMarkdownDocument({
        content: external,
        modifiedAt: 3,
        path: node.absolutePath,
      });
    });

    expect(result.current.externalDocumentConflict).toBeNull();
    expect(api.saveMarkdownDocument).not.toHaveBeenCalled();
  });
});

function markdown(body: string) {
  return [
    '---',
    'title: README',
    'createdAt: 2026-07-17T00:00:00.000Z',
    'updatedAt: 2026-07-17T00:00:00.000Z',
    'refinexDialect: 1',
    '---',
    '# README',
    '',
    body,
  ].join('\n');
}

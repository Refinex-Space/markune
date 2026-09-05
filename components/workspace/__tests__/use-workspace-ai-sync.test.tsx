import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace } from '../use-workspace';

const api = vi.hoisted(() => ({
  getRecentWorkspacePath: vi.fn(() => null),
  getWorkspaceHistory: vi.fn(() => []),
  readMarkdownDocument: vi.fn(),
  refreshWorkspaceNode: vi.fn(),
  loadWorkspaceTree: vi.fn(),
  renameWorkspaceNode: vi.fn(),
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
    api.refreshWorkspaceNode.mockResolvedValue(node);
    api.loadWorkspaceTree.mockResolvedValue(snapshot);
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
      original,
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
      original,
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
      original,
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

    api.readMarkdownDocument.mockResolvedValue({ content: external, modifiedAt: 3, path: node.absolutePath });
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
  it('重复刷新未变化的磁盘正文时保留 dirty 草稿且不重建编辑器', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    const version = result.current.documentVersion;
    act(() => result.current.updateMarkdown(markdown('本地草稿')));
    act(() => result.current.syncExternalMarkdownDocument({ content: original, modifiedAt: 2, path: node.absolutePath }));
    expect(result.current.externalDocumentConflict).toBeNull();
    expect(result.current.draftDocument?.markdown).toContain('本地草稿');
    expect(result.current.documentVersion).toBe(version);
    expect(result.current.saveState).toBe('dirty');
  });

  it('已进入冲突后，重复和后续外部事件都不能覆盖本地草稿', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    act(() => result.current.updateMarkdown(markdown('必须保留的草稿')));
    for (const content of [external, external, markdown('外部再次修改')]) {
      act(() => result.current.syncExternalMarkdownDocument({ content, modifiedAt: 4, path: node.absolutePath }));
    }
    expect(result.current.draftDocument?.markdown).toContain('必须保留的草稿');
    expect(result.current.externalDocumentConflict?.externalDocument.content).toContain('外部再次修改');
    let saved = true;
    await act(async () => { saved = await result.current.saveCurrentDocumentNow(); });
    expect(saved).toBe(false);
    expect(api.saveMarkdownDocument).not.toHaveBeenCalled();
  });

  it('没有渲染间隔的草稿捕获也参与冲突判定，并且不会写盘', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    act(() => {
      result.current.updateMarkdown(markdown('刚输入的内容'), { deferSave: true });
      result.current.syncExternalMarkdownDocument({ content: external, modifiedAt: 3, path: node.absolutePath });
    });
    expect(result.current.draftDocument?.markdown).toContain('刚输入的内容');
    expect(result.current.externalDocumentConflict).not.toBeNull();
    expect(api.saveMarkdownDocument).not.toHaveBeenCalled();
  });

  it('保存失败后的草稿仍受保护，冲突时不能通过打开其他文档丢弃草稿', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    api.saveMarkdownDocument.mockRejectedValueOnce(new Error('disk conflict'));
    await act(async () => { await result.current.updateMarkdown(markdown('保存失败的草稿'), { saveImmediately: true }); });
    act(() => result.current.syncExternalMarkdownDocument({ content: external, modifiedAt: 3, path: node.absolutePath }));
    await act(() => result.current.openDocument({ ...node, absolutePath: '/workspace/other.md' }));
    expect(result.current.currentDocument?.absolutePath).toBe(node.absolutePath);
    expect(result.current.draftDocument?.markdown).toContain('保存失败的草稿');
  });

  it('刷新目录会重读深层当前文档，内容相同的再次刷新不增加版本', async () => {
    const directory = { ...node, kind: 'directory' as const, absolutePath: '/workspace/notes', children: [] };
    const document = { ...node, absolutePath: '/workspace/notes/deep/README.md' };
    const { result } = renderHook(() => useWorkspace({ ...snapshot, nodes: [directory] }));
    api.readMarkdownDocument.mockResolvedValueOnce({ content: original, modifiedAt: 1, path: document.absolutePath });
    await act(() => result.current.openDocument(document));
    api.refreshWorkspaceNode.mockResolvedValue(directory);
    api.readMarkdownDocument.mockResolvedValue({ content: external, modifiedAt: 5, path: document.absolutePath });
    await act(() => result.current.refreshWorkspaceNode(directory));
    expect(result.current.draftDocument?.markdown).toBe(external);
    const version = result.current.documentVersion;
    await act(() => result.current.refreshWorkspaceNode(directory));
    expect(result.current.documentVersion).toBe(version);
  });

  it('删除当前文档的刷新失败不会清空草稿', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    act(() => result.current.updateMarkdown(markdown('删除前的草稿'), { deferSave: true }));
    api.refreshWorkspaceNode.mockResolvedValue(null);
    api.readMarkdownDocument.mockRejectedValue(new Error('missing'));
    await act(async () => { await expect(result.current.refreshWorkspaceNode(node)).rejects.toThrow('missing'); });
    expect(result.current.draftDocument?.markdown).toContain('删除前的草稿');
    expect(result.current.currentDocument?.absolutePath).toBe(node.absolutePath);
  });

  it('同内容的自保存回声不清空保存期间的新输入', async () => {
    let complete!: (value: { modifiedAt: number; path: string }) => void;
    api.saveMarkdownDocument.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    let saving!: Promise<unknown>;
    act(() => { saving = Promise.resolve(result.current.updateMarkdown(markdown('第一稿'), { saveImmediately: true })); });
    act(() => result.current.updateMarkdown(markdown('继续输入的第二稿'), { deferSave: true }));
    await act(async () => { complete({ path: node.absolutePath, modifiedAt: 2 }); await saving; });
    const savedContent = api.saveMarkdownDocument.mock.calls[0][2];
    act(() => result.current.syncExternalMarkdownDocument({ content: savedContent, modifiedAt: 2, path: node.absolutePath }));
    expect(result.current.draftDocument?.markdown).toContain('继续输入的第二稿');
    expect(result.current.externalDocumentConflict).toBeNull();
  });

  it('旧的保存回调在切换文档后只保存当前文档，不把新草稿写入旧路径', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    const oldSaveCallback = result.current.saveCurrentDocumentNow;
    const other = { ...node, absolutePath: '/workspace/other.md', name: 'other.md' };
    api.readMarkdownDocument.mockResolvedValue({ content: original, modifiedAt: 2, path: other.absolutePath });
    await act(() => result.current.openDocument(other));
    act(() => result.current.updateMarkdown(markdown('第二篇的草稿'), { deferSave: true }));
    api.saveMarkdownDocument.mockResolvedValue({ path: other.absolutePath, modifiedAt: 3 });
    await act(() => oldSaveCallback());
    expect(api.saveMarkdownDocument.mock.calls.at(-1)?.[1]).toBe(other.absolutePath);
  });

  it('较早的树刷新结果不能覆盖较新的结果', async () => {
    let complete!: (value: typeof snapshot) => void;
    api.loadWorkspaceTree.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { result } = renderHook(() => useWorkspace(snapshot));
    let stale!: Promise<unknown>;
    act(() => { stale = result.current.refreshWorkspaceTree(); });
    api.loadWorkspaceTree.mockResolvedValue({ ...snapshot, nodes: [] });
    await act(() => result.current.refreshWorkspaceTree());
    await act(async () => { complete(snapshot); await stale; });
    expect(result.current.snapshot?.nodes).toEqual([]);
  });

  it('外部读取遇到自身保存完成时重新读取，避免加载保存前的旧结果', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    let complete!: (value: { content: string; modifiedAt: number; path: string }) => void;
    api.readMarkdownDocument.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    let reading!: Promise<unknown>;
    await act(async () => { reading = result.current.readExternalMarkdownDocument('/workspace', node.absolutePath); await Promise.resolve(); });
    await act(async () => { await result.current.updateMarkdown(markdown('已保存的新稿'), { saveImmediately: true }); });
    const content = api.saveMarkdownDocument.mock.calls.at(-1)?.[2] as string;
    api.readMarkdownDocument.mockResolvedValue({ content, modifiedAt: 2, path: node.absolutePath });
    let readResult: unknown;
    await act(async () => { complete({ content: original, modifiedAt: 1, path: node.absolutePath }); readResult = await reading; });
    expect(readResult).toMatchObject({ content, modifiedAt: 2 });
  });

  it('冲突期间的标题重命名不会绕过保存保护', async () => {
    const { result } = renderHook(() => useWorkspace(snapshot));
    await act(() => result.current.openDocument(node));
    act(() => result.current.updateMarkdown(markdown('本地输入'), { deferSave: true }));
    act(() => result.current.syncExternalMarkdownDocument({ content: external, modifiedAt: 3, path: node.absolutePath }));
    await act(() => result.current.renameNode(node, 'new-name'));
    expect(api.renameWorkspaceNode).not.toHaveBeenCalled();
    expect(result.current.draftDocument?.markdown).toContain('本地输入');
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

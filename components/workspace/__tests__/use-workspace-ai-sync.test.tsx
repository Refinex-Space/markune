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

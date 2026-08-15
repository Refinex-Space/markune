import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentImport } from '../use-document-import';

const api = vi.hoisted(() => ({
  beginDocumentImportCommit: vi.fn(),
  cancelDocumentImport: vi.fn(),
  commitDocumentImport: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
  readDocumentImportSource: vi.fn(),
  releaseDocumentImportGrant: vi.fn(),
  selectDocumentImportSources: vi.fn(),
  stageDocumentImportAsset: vi.fn(),
  stageDocumentImportSourceAsset: vi.fn(),
}));
const converters = vi.hoisted(() => ({
  decodeTextSource: vi.fn(),
  prepareHtmlImport: vi.fn(),
  prepareMarkdownImport: vi.fn(),
  preparePdfImport: vi.fn(),
  prepareWordImport: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(() => 'import-toast'),
  success: vi.fn(),
}));

vi.mock('../workspace-api', () => api);
vi.mock('../document-import-core', () => ({
  decodeTextSource: converters.decodeTextSource,
  prepareHtmlImport: converters.prepareHtmlImport,
  prepareMarkdownImport: converters.prepareMarkdownImport,
}));
vi.mock('../document-import-pdf', () => ({
  preparePdfImport: converters.preparePdfImport,
}));
vi.mock('../document-import-word', () => ({
  prepareWordImport: converters.prepareWordImport,
}));
vi.mock('sonner', () => ({ toast }));

const source = {
  fileName: 'note.md',
  format: 'markdown' as const,
  size: 42,
  sourceId: 'source-1',
};
const importedNode = {
  absolutePath: '/repo/target/note.md',
  id: 'note',
  kind: 'document' as const,
  name: 'note.md',
  relativePath: 'target/note.md',
  title: 'Note',
};

describe('useDocumentImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isTauriRuntime.mockReturnValue(true);
    api.selectDocumentImportSources.mockResolvedValue({
      grantId: 'grant-1',
      sources: [source],
    });
    api.readDocumentImportSource.mockResolvedValue(new Uint8Array([1]));
    api.beginDocumentImportCommit.mockResolvedValue({ sessionId: 'session-1' });
    api.stageDocumentImportAsset.mockResolvedValue(undefined);
    api.stageDocumentImportSourceAsset.mockResolvedValue(undefined);
    api.commitDocumentImport.mockResolvedValue({
      node: importedNode,
      warnings: [],
    });
    api.releaseDocumentImportGrant.mockResolvedValue(undefined);
    converters.prepareMarkdownImport.mockResolvedValue({
      assets: [
        {
          data: new Uint8Array([1, 2, 3]),
          fileName: 'image.png',
          kind: 'inline',
          mediaType: 'image/png',
          size: 3,
          token: 'asset-1',
        },
      ],
      markdown: '# Note\n\n![](markune-import://asset/asset-1)',
      source,
      title: 'Note',
      warnings: [],
    });
  });

  it('commits one file atomically, refreshes the tree, and opens the first success', async () => {
    const refreshWorkspaceTree = vi.fn().mockResolvedValue(undefined);
    const openDocument = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDocumentImport({
        openDocument,
        refreshWorkspaceTree,
        rootPath: '/repo',
      }),
    );

    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() => result.current.importDocuments('target', 'markdown'));

    expect(api.selectDocumentImportSources).toHaveBeenCalledWith('markdown');
    expect(api.readDocumentImportSource).toHaveBeenCalledWith('grant-1', 'source-1');
    expect(api.beginDocumentImportCommit).toHaveBeenCalledWith(
      '/repo',
      'target',
      expect.objectContaining({ title: 'Note' }),
    );
    expect(api.stageDocumentImportAsset).toHaveBeenCalledWith(
      'session-1',
      'asset-1',
      new Uint8Array([1, 2, 3]),
    );
    expect(api.commitDocumentImport).toHaveBeenCalledWith('session-1');
    expect(refreshWorkspaceTree).toHaveBeenCalledOnce();
    expect(openDocument).toHaveBeenCalledWith(importedNode);
    expect(api.releaseDocumentImportGrant).toHaveBeenCalledWith('grant-1');
    expect(toast.success).toHaveBeenCalledWith(
      '文档导入完成',
      expect.objectContaining({ id: 'import-toast' }),
    );
  });

  it('keeps earlier successes when a later file fails and releases the grant', async () => {
    const secondSource = { ...source, fileName: 'broken.md', sourceId: 'source-2' };
    api.selectDocumentImportSources.mockResolvedValueOnce({
      grantId: 'grant-2',
      sources: [source, secondSource],
    });
    api.readDocumentImportSource
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockRejectedValueOnce(new Error('无法读取损坏文件'));
    converters.prepareMarkdownImport.mockResolvedValueOnce({
      assets: [],
      markdown: '# Note',
      source,
      title: 'Note',
      warnings: [],
    });
    const refreshWorkspaceTree = vi.fn().mockResolvedValue(undefined);
    const openDocument = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDocumentImport({
        openDocument,
        refreshWorkspaceTree,
        rootPath: '/repo',
      }),
    );

    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() => result.current.importDocuments('', 'markdown'));

    expect(api.commitDocumentImport).toHaveBeenCalledOnce();
    expect(openDocument).toHaveBeenCalledWith(importedNode);
    expect(api.releaseDocumentImportGrant).toHaveBeenCalledWith('grant-2');
    expect(toast.success).toHaveBeenCalledWith(
      '文档导入完成',
      expect.objectContaining({
        description: '成功 1 个，失败 1 个，警告 0 条',
      }),
    );
  });
});

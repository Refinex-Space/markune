import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentExport } from '../use-document-export';

const api = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  openPathInFileManager: vi.fn(),
  printDocumentPdf: vi.fn(),
  readWorkspaceAssetData: vi.fn(),
  selectDocumentExportDirectory: vi.fn(),
  writeDocumentExportBundle: vi.fn(),
}));

vi.mock('../workspace-api', () => api);
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
  },
}));

describe('useDocumentExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isTauriRuntime.mockReturnValue(true);
  });

  it('stops silently when the native directory picker is cancelled', async () => {
    api.selectDocumentExportDirectory.mockResolvedValueOnce(null);
    const loadMarkdown = vi.fn().mockResolvedValue('# draft');
    const { result } = renderHook(() =>
      useDocumentExport({
        pageWidthMode: 'wide',
        rootPath: '/repo',
        theme: 'light',
      }),
    );

    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() =>
      result.current.exportDocument(
        {
          loadMarkdown,
          node: {
            id: 'note',
            name: 'note.md',
            kind: 'document',
            relativePath: 'note.md',
            absolutePath: '/repo/note.md',
          },
        },
        'markdown',
      ),
    );

    expect(loadMarkdown).not.toHaveBeenCalled();
    expect(api.writeDocumentExportBundle).not.toHaveBeenCalled();
  });

  it('opens the picker before reading and writes a portable Markdown bundle', async () => {
    const order: string[] = [];
    api.selectDocumentExportDirectory.mockImplementationOnce(async () => {
      order.push('select');
      return { grantId: 'grant', displayPath: 'Downloads' };
    });
    api.writeDocumentExportBundle.mockImplementationOnce(async () => {
      order.push('write');
      return {
        primaryPath: 'Downloads/标题.md',
        createdPaths: ['Downloads/标题.md'],
        warnings: [],
      };
    });
    const loadMarkdown = vi.fn().mockImplementation(async () => {
      order.push('read');
      return '# draft';
    });
    const { result } = renderHook(() =>
      useDocumentExport({
        pageWidthMode: 'wide',
        rootPath: '/repo',
        theme: 'dark',
      }),
    );

    await waitFor(() => expect(result.current.available).toBe(true));
    await act(() =>
      result.current.exportDocument(
        {
          loadMarkdown,
          node: {
            id: 'note',
            name: 'note.md',
            title: '标题',
            kind: 'document',
            relativePath: 'note.md',
            absolutePath: '/repo/note.md',
          },
        },
        'markdown',
      ),
    );

    expect(order).toEqual(['select', 'read', 'write']);
    expect(api.writeDocumentExportBundle).toHaveBeenCalledWith(
      'grant',
      'markdown',
      '标题',
      [
        expect.objectContaining({
          relativePath: '标题.md',
          role: 'primary',
        }),
      ],
    );
  });
});

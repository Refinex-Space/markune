import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDocumentExport } from '../use-document-export';

const api = vi.hoisted(() => ({
  convertDocumentExport: vi.fn(),
  getDocumentExportRuntimeInfo: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
  openPathInFileManager: vi.fn(),
  printDocumentPdf: vi.fn(),
  readWorkspaceAssetData: vi.fn(),
  selectDocumentExportDirectory: vi.fn(),
  writeDocumentExportBundle: vi.fn(),
}));

vi.mock('../workspace-api', () => api);
vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: () => (
    <section
      className="madora-markweave-editor"
      data-testid="mock-export-editor"
    >
      <div className="markweave-editor-surface">
        <p>正文</p>
      </div>
    </section>
  ),
}));
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
    api.getDocumentExportRuntimeInfo.mockResolvedValue({
      engine: 'pandoc',
      pandocVersion: '3.10.1',
      professionalPdf: true,
      professionalWord: true,
      typstVersion: '0.15.1',
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('renders HTML inside the viewport and preserves the wide page mode', async () => {
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    api.writeDocumentExportBundle.mockResolvedValueOnce({
      primaryPath: 'Downloads/标题.html',
      createdPaths: ['Downloads/标题.html'],
      warnings: [],
    });
    const loadMarkdown = vi.fn().mockResolvedValue('# 标题');

    function ExportHarness() {
      const documentExport = useDocumentExport({
        pageWidthMode: 'wide',
        rootPath: '/repo',
        theme: 'light',
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              void documentExport.exportDocument(
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
                'html',
              )
            }
          >
            导出 HTML
          </button>
          {documentExport.renderer}
        </>
      );
    }

    render(<ExportHarness />);
    fireEvent.click(screen.getByRole('button', { name: '导出 HTML' }));

    const editor = await screen.findByTestId('mock-export-editor');
    const rendererContainer = editor.parentElement?.parentElement;

    expect(rendererContainer?.style.left).toBe('0px');
    expect(rendererContainer?.style.opacity).toBe('0');
    await waitFor(() => expect(api.writeDocumentExportBundle).toHaveBeenCalled());

    const files = api.writeDocumentExportBundle.mock.calls[0][3];
    const html = window.atob(files[0].base64Data);

    expect(html).toContain('data-page-width-mode="wide"');
  });

  it('uses the controlled Pandoc converter for professional Word export', async () => {
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    api.convertDocumentExport.mockResolvedValueOnce({
      primaryPath: 'Downloads/标题.docx',
      createdPaths: ['Downloads/标题.docx'],
      warnings: [],
    });
    const loadMarkdown = vi.fn().mockResolvedValue('# 标题\n\n正文');

    function ExportHarness() {
      const documentExport = useDocumentExport({
        pageWidthMode: 'standard',
        rootPath: '/repo',
        theme: 'dark',
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              void documentExport.exportDocument(
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
                'word',
              )
            }
          >
            导出 Word
          </button>
          {documentExport.renderer}
        </>
      );
    }

    render(<ExportHarness />);
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await waitFor(() => expect(api.convertDocumentExport).toHaveBeenCalled());
    expect(api.getDocumentExportRuntimeInfo).toHaveBeenCalledOnce();
    expect(api.convertDocumentExport).toHaveBeenCalledWith(
      'grant',
      'word',
      '标题',
      '# 标题\n\n正文',
      [],
    );
    expect(api.writeDocumentExportBundle).not.toHaveBeenCalled();
  });
});

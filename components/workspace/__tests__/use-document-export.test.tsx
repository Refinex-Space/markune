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

const markweave = vi.hoisted(() => ({
  autoReady: true,
  loadListener: null as
    | ((state: {
        error: string | null;
        phase:
          | 'idle'
          | 'parsing'
          | 'mounting'
          | 'finalizing'
          | 'ready'
          | 'error'
          | 'cancelled';
        profile: null;
        progress: number | null;
        tier: 'standard';
      }) => void)
    | null,
  prepareForOutput: vi.fn(),
}));

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
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(() => 'toast-id'),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../workspace-api', () => api);
vi.mock('@/components/editor/markdown-editor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef<unknown, Record<string, unknown>>(
      function MockMarkdownEditor(props, ref) {
        const onDocumentLoadStateChange = props.onDocumentLoadStateChange as
          | typeof markweave.loadListener
          | undefined;

        React.useImperativeHandle(
          ref,
          () => ({
            flushDraft: vi.fn().mockResolvedValue(true),
            getAiEditController: vi.fn(() => null),
            prepareForOutput: markweave.prepareForOutput,
          }),
          [],
        );
        React.useEffect(() => {
          markweave.loadListener = onDocumentLoadStateChange ?? null;
          if (markweave.autoReady) {
            onDocumentLoadStateChange?.({
              error: null,
              phase: 'ready',
              profile: null,
              progress: 1,
              tier: 'standard',
            });
          }

          return () => {
            if (markweave.loadListener === onDocumentLoadStateChange) {
              markweave.loadListener = null;
            }
          };
        }, [onDocumentLoadStateChange]);

        return (
          <section
            className="markune-markweave-editor"
            data-testid="mock-export-editor"
          >
            <div className="markweave-editor-surface">
              <p>正文</p>
            </div>
          </section>
        );
      },
    ),
  };
});
vi.mock('sonner', () => ({ toast }));

function OutputBarrierHarness({
  format,
  loadMarkdown,
}: {
  format: 'html' | 'pdf' | 'word';
  loadMarkdown: () => Promise<string>;
}) {
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
            format,
          )
        }
      >
        导出 {format}
      </button>
      {documentExport.renderer}
    </>
  );
}

function emitLoadState(
  phase:
    | 'parsing'
    | 'mounting'
    | 'finalizing'
    | 'ready'
    | 'error'
    | 'cancelled',
  error: string | null = null,
) {
  markweave.loadListener?.({
    error,
    phase,
    profile: null,
    progress: phase === 'ready' ? 1 : null,
    tier: 'standard',
  });
}

describe('useDocumentExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markweave.autoReady = true;
    markweave.loadListener = null;
    markweave.prepareForOutput.mockResolvedValue({
      durationMs: 1,
      kind: 'dom-snapshot',
      missing: 0,
      resolved: 0,
      status: 'ready',
      timedOut: 0,
      unreadable: 0,
    });
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
    expect(markweave.prepareForOutput).not.toHaveBeenCalled();
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

    expect(markweave.prepareForOutput).toHaveBeenCalledOnce();
    expect(markweave.prepareForOutput).toHaveBeenCalledWith({
      kind: 'dom-snapshot',
      signal: expect.any(AbortSignal),
      timeoutMs: expect.any(Number),
    });
    const outputOptions = markweave.prepareForOutput.mock.calls[0][0];
    expect(outputOptions.timeoutMs).toBeGreaterThan(0);
    expect(outputOptions.timeoutMs).toBeLessThanOrEqual(15_000);

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
    expect(markweave.prepareForOutput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dom-snapshot' }),
    );
  });

  it('waits through all loading phases and runs the output barrier exactly once after ready', async () => {
    markweave.autoReady = false;
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    api.writeDocumentExportBundle.mockResolvedValueOnce({
      primaryPath: 'Downloads/标题.html',
      createdPaths: ['Downloads/标题.html'],
      warnings: [],
    });

    render(
      <OutputBarrierHarness
        format="html"
        loadMarkdown={vi.fn().mockResolvedValue('# 标题')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 html' }));
    await screen.findByTestId('mock-export-editor');
    await waitFor(() => expect(markweave.loadListener).not.toBeNull());

    act(() => emitLoadState('parsing'));
    act(() => emitLoadState('mounting'));
    act(() => emitLoadState('finalizing'));
    expect(markweave.prepareForOutput).not.toHaveBeenCalled();
    expect(api.writeDocumentExportBundle).not.toHaveBeenCalled();

    act(() => emitLoadState('ready'));
    act(() => emitLoadState('ready'));

    await waitFor(() => expect(api.writeDocumentExportBundle).toHaveBeenCalled());
    expect(markweave.prepareForOutput).toHaveBeenCalledOnce();
  });

  it.each([
    ['error', '解析失败', 'Markweave 文档加载失败：解析失败'],
    ['cancelled', null, 'Markweave 文档加载已取消'],
  ] as const)(
    'fails export when the Markweave load phase becomes %s',
    async (phase, error, expectedMessage) => {
      markweave.autoReady = false;
      api.selectDocumentExportDirectory.mockResolvedValueOnce({
        grantId: 'grant',
        displayPath: 'Downloads',
      });

      render(
        <OutputBarrierHarness
          format="html"
          loadMarkdown={vi.fn().mockResolvedValue('# 标题')}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '导出 html' }));
      await screen.findByTestId('mock-export-editor');
      await waitFor(() => expect(markweave.loadListener).not.toBeNull());

      act(() => emitLoadState(phase, error));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(toast.error.mock.calls[0][1].description).toContain(expectedMessage);
      expect(markweave.prepareForOutput).not.toHaveBeenCalled();
      expect(api.writeDocumentExportBundle).not.toHaveBeenCalled();
    },
  );

  it('uses the print barrier for PDF and shares the remaining 15 second budget', async () => {
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    api.convertDocumentExport.mockResolvedValueOnce({
      primaryPath: 'Downloads/标题.pdf',
      createdPaths: ['Downloads/标题.pdf'],
      warnings: [],
    });

    render(
      <OutputBarrierHarness
        format="pdf"
        loadMarkdown={vi.fn().mockResolvedValue('# 标题')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 pdf' }));

    await waitFor(() => expect(markweave.prepareForOutput).toHaveBeenCalled());
    const options = markweave.prepareForOutput.mock.calls[0][0];

    expect(options.kind).toBe('print');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeoutMs).toBeGreaterThan(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(15_000);
    await waitFor(() => expect(api.convertDocumentExport).toHaveBeenCalled());
  });

  it('aborts pending output work on renderer unmount and ignores its stale result', async () => {
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    let outputSignal: AbortSignal | null = null;
    markweave.prepareForOutput.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) => {
        outputSignal = signal;
        return new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () =>
              resolve({
                durationMs: 1,
                kind: 'dom-snapshot',
                missing: 0,
                resolved: 0,
                status: 'cancelled',
                timedOut: 0,
                unreadable: 0,
              }),
            { once: true },
          );
        });
      },
    );

    const rendered = render(
      <OutputBarrierHarness
        format="html"
        loadMarkdown={vi.fn().mockResolvedValue('# 标题')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 html' }));
    await waitFor(() => expect(markweave.prepareForOutput).toHaveBeenCalled());

    rendered.unmount();

    expect(outputSignal?.aborted).toBe(true);
    await act(async () => Promise.resolve());
    expect(api.writeDocumentExportBundle).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports exact timeout, missing, and unreadable visual resource warnings', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    markweave.prepareForOutput.mockResolvedValueOnce({
      durationMs: 15_000,
      kind: 'dom-snapshot',
      missing: 2,
      resolved: 7,
      status: 'timed-out',
      timedOut: 4,
      unreadable: 3,
    });
    api.selectDocumentExportDirectory.mockResolvedValueOnce({
      grantId: 'grant',
      displayPath: 'Downloads',
    });
    api.writeDocumentExportBundle.mockResolvedValueOnce({
      primaryPath: 'Downloads/标题.html',
      createdPaths: ['Downloads/标题.html'],
      warnings: [],
    });

    render(
      <OutputBarrierHarness
        format="html"
        loadMarkdown={vi.fn().mockResolvedValue('# 标题')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 html' }));

    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    const description = toast.warning.mock.calls[0][1].description;

    expect(description).toContain('4 个视觉资源未在 15 秒输出准备预算内完成');
    expect(description).toContain('2 个视觉资源缺失');
    expect(description).toContain('3 个视觉资源不可读');
    consoleWarn.mockRestore();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const {
  cancelAnimationFrameMock,
  markweaveEditorMock,
  payloadFieldReadMock,
  requestAnimationFrameMock,
  scrollToMock,
  toStorageMarkdownMock,
  uploadHandlerMock,
  useWorkspaceAssetUploaderMock,
} = vi.hoisted(() => ({
  cancelAnimationFrameMock: vi.fn(),
  markweaveEditorMock: vi.fn(),
  payloadFieldReadMock: vi.fn(),
  requestAnimationFrameMock: vi.fn((callback: FrameRequestCallback) => {
    callback(1000);
    return 1;
  }),
  scrollToMock: vi.fn(),
  toStorageMarkdownMock: vi.fn((markdown: string) => markdown),
  uploadHandlerMock: vi.fn(),
  useWorkspaceAssetUploaderMock: vi.fn(
    (_rootPath: string | null, markdown: string) => ({
      editorMarkdown: markdown,
      onSlashCommandUpload: uploadHandlerMock,
      toStorageMarkdown: toStorageMarkdownMock,
    }),
  ),
}));

vi.mock('@markweave/react', async () => {
  const React = await import('react');

  return {
    MarkweaveEditor: vi.fn((props: Record<string, unknown>) => {
      markweaveEditorMock(props);

      return (
        <div
          data-editable={String(props.editable)}
          data-inner-toc={String(props.innerToc)}
          data-inner-toc-placement={String(props.innerTocPlacement)}
          data-mode={String(props.mode)}
          data-testid="markweave-editor"
        >
          <textarea
            aria-label={String(props.ariaLabel)}
            data-testid="markweave-textarea"
            readOnly={props.mode === 'view'}
            value={String(props.content ?? '')}
            onChange={(event) => {
              const markdown = event.currentTarget.value;
              const payload = {
                get html() {
                  payloadFieldReadMock('html');
                  return '<p>HTML</p>';
                },
                get json() {
                  payloadFieldReadMock('json');
                  return {};
                },
                get markdown() {
                  payloadFieldReadMock('markdown');
                  return markdown;
                },
                get text() {
                  payloadFieldReadMock('text');
                  return 'Text';
                },
              };

              (props.onUpdate as ((payload: typeof payload) => void) | undefined)?.(
                payload,
              );
            }}
          />
          <span data-testid="markweave-selectable-text">
            {String(props.content ?? '')}
          </span>
        </div>
      );
    }),
  };
});

vi.mock('@/components/editor/use-workspace-asset-uploader', () => ({
  useWorkspaceAssetUploader: useWorkspaceAssetUploaderMock,
}));

describe('MarkdownEditor', () => {
  beforeEach(() => {
    cancelAnimationFrameMock.mockClear();
    markweaveEditorMock.mockClear();
    payloadFieldReadMock.mockClear();
    requestAnimationFrameMock.mockClear();
    requestAnimationFrameMock.mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(1000);
        return 1;
      },
    );
    scrollToMock.mockClear();
    toStorageMarkdownMock.mockClear();
    toStorageMarkdownMock.mockImplementation((markdown: string) => markdown);
    uploadHandlerMock.mockClear();
    useWorkspaceAssetUploaderMock.mockClear();
    useWorkspaceAssetUploaderMock.mockImplementation(
      (_rootPath: string | null, markdown: string) => ({
        editorMarkdown: markdown,
        onSlashCommandUpload: uploadHandlerMock,
        toStorageMarkdown: toStorageMarkdownMock,
      }),
    );
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  });

  it('渲染 Markweave 受控 Markdown 编辑器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题"
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.getByTestId('markdown-editor-root')).toBeTruthy();
    expect(
      screen.getByTestId('markweave-editor').getAttribute('data-mode'),
    ).toBe('live');
    expect(
      screen.getByTestId('markweave-editor').getAttribute('data-inner-toc'),
    ).toBe('true');
    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe('# 标题');
    expect(markweaveEditorMock.mock.calls.at(-1)?.[0]).toMatchObject({
      content: '# 标题',
      contentFormat: 'markdown',
      editable: true,
      innerToc: true,
      innerTocPlacement: 'container',
      lang: 'zh',
      mode: 'live',
    });
  });

  it('只读时使用 Markweave view 模式', () => {
    render(
      <MarkdownEditor
        markdown="# 只读"
        onMarkdownChange={() => {}}
        readOnly
      />,
    );

    expect(
      screen.getByTestId('markweave-editor').getAttribute('data-mode'),
    ).toBe('view');
    expect(
      screen.getByTestId('markweave-editor').getAttribute('data-editable'),
    ).toBe('false');
  });

  it('保护 frontmatter，只把正文传给 Markweave，保存时再序列化完整 Markdown', () => {
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        markdown={'---\ntitle: 文档\n---\n# 原文'}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe('# 原文');

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: 文档\n---\n\n# 新正文\n',
    );
  });

  it('保存前把 Markweave display URL 还原成工作区存储引用', () => {
    const onMarkdownChange = vi.fn();
    toStorageMarkdownMock.mockImplementation((markdown: string) =>
      markdown.replace(
        'asset://localhost/ws/.madora/assets/files/aa/hash.png',
        '.madora/assets/files/aa/hash.png',
      ),
    );

    render(
      <MarkdownEditor markdown="# 原文" onMarkdownChange={onMarkdownChange} />,
    );

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: {
        value:
          '![图](asset://localhost/ws/.madora/assets/files/aa/hash.png)',
      },
    });

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '![图](.madora/assets/files/aa/hash.png)',
    );
  });

  it('保存时只读取 Markweave 延迟序列化的 Markdown 字段', () => {
    render(<MarkdownEditor markdown="# 原文" onMarkdownChange={() => {}} />);

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(payloadFieldReadMock).toHaveBeenCalledTimes(1);
    expect(payloadFieldReadMock).toHaveBeenCalledWith('markdown');
  });

  it('拦截 Cmd/Ctrl+S 并触发保存请求', () => {
    const onSaveRequested = vi.fn();

    render(
      <MarkdownEditor markdown="# 标题" onSaveRequested={onSaveRequested} />,
    );

    fireEvent.keyDown(screen.getByTestId('markdown-editor-root'), {
      key: 's',
      metaKey: true,
    });

    expect(onSaveRequested).toHaveBeenCalledTimes(1);
  });

  it('保留页面宽度模式标记和 Markweave surface CSS', () => {
    render(<MarkdownEditor markdown="# 标题" pageWidthMode="standard" />);

    expect(
      screen
        .getByTestId('markdown-editor-root')
        .getAttribute('data-page-width-mode'),
    ).toBe('standard');
    expect(screen.getByTestId('markdown-editor-root').className).toContain(
      'workspace-editor-page-standard',
    );

    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    expect(globalsCss).toContain(
      '.workspace-editor-shell.workspace-editor-page-standard .markweave-editor-surface',
    );
    expect(globalsCss).toContain(
      '.workspace-editor-shell.workspace-editor-page-wide .markweave-editor-surface',
    );
    expect(globalsCss).toContain('--madora-markweave-toc-gutter: 2rem');
    expect(globalsCss).toContain(
      "--markweave-inner-toc-gutter: var(--madora-markweave-toc-gutter)",
    );
    expect(globalsCss).toContain(
      ':root:has(.workspace-editor-shell .markweave-editor-frame)',
    );
    expect(globalsCss).toContain('scrollbar-gutter: auto');
    expect(globalsCss).not.toContain(['cm', 'mar', 'dora'].join('-'));
    expect(globalsCss).not.toContain(['mar', 'dora-preview'].join(''));
  });

  it('通过 Markweave runtime selection 和 DOM selection 派生右侧 AI 面板选区上下文', () => {
    const onSelectionChange = vi.fn();

    render(
      <MarkdownEditor
        markdown="Hello world"
        onSelectionChange={onSelectionChange}
      />,
    );

    const textNode = screen.getByTestId('markweave-selectable-text')
      .firstChild;

    if (!textNode) {
      throw new Error('missing selectable text');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const lastProps = markweaveEditorMock.mock.calls.at(-1)?.[0] as {
      onRuntimeStateChange?: (snapshot: unknown) => void;
    };

    act(() => {
      lastProps.onRuntimeStateChange?.({
        selection: {
          activeMarks: [],
          ancestorNodes: [],
          currentNode: null,
          empty: false,
          floatingToolbarVariant: 'default',
          from: 2,
          inTable: false,
          kind: 'range',
          surface: 'text-range',
          to: 7,
        },
      });
    });

    fireEvent.mouseUp(screen.getByTestId('markdown-editor-scrollarea'));

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      from: 2,
      markdown: 'Hello',
      to: 7,
    });
  });

  it('回到顶部滚动 Markweave 外层 scrollarea', () => {
    render(<MarkdownEditor markdown="# 标题" />);
    const scrollArea = screen.getByTestId('markdown-editor-scrollarea');
    let scrollTop = 300;
    requestAnimationFrameMock.mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(performance.now() + 1000);
        return 1;
      },
    );
    scrollToMock.mockImplementation((options?: ScrollToOptions) => {
      scrollTop = options?.top ?? 0;
    });
    Object.defineProperty(scrollArea, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    });
    Object.defineProperty(scrollArea, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
    });

    fireEvent.scroll(scrollArea);
    fireEvent.click(screen.getByLabelText('回到顶部'));

    expect(scrollToMock).toHaveBeenCalledWith({ top: expect.any(Number) });
  });

  it('不向 Markweave 传入 AI 回调', () => {
    render(<MarkdownEditor markdown="# 标题" />);

    const props = markweaveEditorMock.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;

    expect(props.onEditWithAi).toBeUndefined();
    expect(props.onRewriteSelection).toBeUndefined();
    expect(props.onExtractToNote).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const {
  addScrollListenerMock,
  dispatchMock,
  editorScrollState,
  focusMock,
  extractPreviewTocFromMarkdownMock,
  generateCSSMock,
  mardoraMock,
  previewMock,
  removeScrollListenerMock,
  scrollToMock,
} = vi.hoisted(() => ({
  addScrollListenerMock: vi.fn(),
  dispatchMock: vi.fn(),
  editorScrollState: {
    listeners: new Set<() => void>(),
    top: 0,
  },
  extractPreviewTocFromMarkdownMock: vi.fn(() => [
    {
      active: false,
      from: 1,
      id: 'read-mode',
      level: 2,
      text: '阅读模式',
      to: 10,
    },
  ]),
  focusMock: vi.fn(),
  generateCSSMock: vi.fn(() => '.mardora-preview { color: inherit; }'),
  mardoraMock: vi.fn(() => []),
  previewMock: vi.fn(async () => '<article class="mardora-preview"><h2 id="read-mode">阅读模式</h2></article>'),
  removeScrollListenerMock: vi.fn(),
  scrollToMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@uiw/react-codemirror', async () => {
  const React = await import('react');

  return {
    default: React.forwardRef<
      unknown,
      {
        className?: string;
        value: string;
        onChange?: (value: string) => void;
      }
    >(function MockCodeMirror({ className, value, onChange }, ref) {
      React.useImperativeHandle(ref, () => ({
        view: {
          dispatch: dispatchMock,
          focus: focusMock,
          scrollDOM: {
            addEventListener: (
              type: string,
              listener: EventListenerOrEventListenerObject,
            ) => {
              addScrollListenerMock(type, listener);

              if (type === 'scroll' && typeof listener === 'function') {
                editorScrollState.listeners.add(listener as () => void);
              }
            },
            get scrollTop() {
              return editorScrollState.top;
            },
            removeEventListener: removeScrollListenerMock,
            scrollTo: scrollToMock,
          },
        },
      }));
      const editorView = {
        dispatch: dispatchMock,
        focus: focusMock,
        scrollDOM: {
          addEventListener: (
            type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            addScrollListenerMock(type, listener);

            if (type === 'scroll' && typeof listener === 'function') {
              editorScrollState.listeners.add(listener as () => void);
            }
          },
          get scrollTop() {
            return editorScrollState.top;
          },
          removeEventListener: removeScrollListenerMock,
          scrollTo: scrollToMock,
        },
      };
      const runMardoraDomEventHandlers = (type: string, target: Element) =>
        mardoraMock
          .mock.calls.at(-1)?.[0]
          ?.extensions?.some((extension: unknown) => {
            const maybeHandlers = extension as {
              domEventHandlers?: Record<
                string,
                (event: Event, view: unknown) => boolean
              >;
            };
            const handler = maybeHandlers.domEventHandlers?.[type];

            if (!handler) {
              return false;
            }

            const event = new MouseEvent(type, { bubbles: true });
            Object.defineProperty(event, 'target', {
              configurable: true,
              value: target,
            });

            return handler(event, editorView);
          }) ?? false;
      const previewTarget = document.createElement('figure');
      previewTarget.className =
        'cm-mardora-image-figure cm-mardora-media-preview';
      const resizeHandleTarget = document.createElement('span');
      resizeHandleTarget.className =
        'cm-mardora-image-resize-handle cm-mardora-image-resize-handle-right';
      previewTarget.appendChild(resizeHandleTarget);
      const handledPreviewMouseDown =
        runMardoraDomEventHandlers('mousedown', previewTarget);
      const handledResizeHandleMouseDown =
        runMardoraDomEventHandlers('mousedown', resizeHandleTarget);
      const handledResizeHandlePointerDown =
        runMardoraDomEventHandlers('pointerdown', resizeHandleTarget);

      return (
        <div>
          <textarea
            aria-label="Markdown 正文"
            className={`cm-editor ${className ?? ''}`}
            value={value}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          />
          <div data-testid="mardora-preview-mousedown-handled">
            {String(handledPreviewMouseDown)}
          </div>
          <div data-testid="mardora-resize-mousedown-handled">
            {String(handledResizeHandleMouseDown)}
          </div>
          <div data-testid="mardora-resize-pointerdown-handled">
            {String(handledResizeHandlePointerDown)}
          </div>
        </div>
      );
    }),
  };
});

vi.mock('mardora/editor', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('mardora/editor')>();

  return {
    ...actual,
    mardora: mardoraMock,
  };
});

vi.mock('mardora/preview', () => ({
  extractPreviewTocFromMarkdown: extractPreviewTocFromMarkdownMock,
  generateCSS: generateCSSMock,
  preview: previewMock,
}));

describe('MarkdownEditor', () => {
  beforeEach(() => {
    addScrollListenerMock.mockClear();
    dispatchMock.mockClear();
    editorScrollState.listeners.clear();
    editorScrollState.top = 0;
    extractPreviewTocFromMarkdownMock.mockClear();
    focusMock.mockClear();
    generateCSSMock.mockClear();
    mardoraMock.mockClear();
    previewMock.mockClear();
    removeScrollListenerMock.mockClear();
    scrollToMock.mockImplementation((options?: ScrollToOptions) => {
      editorScrollState.top = options?.top ?? 0;
      editorScrollState.listeners.forEach((listener) => listener());
    });
  });

  it('渲染编辑器容器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题"
        onMarkdownChange={() => {}}
      />,
    );
    expect(screen.getByTestId('markdown-editor-root')).toBeTruthy();
    expect(document.querySelector('.cm-editor')).toBeTruthy();
  });

  it('CodeMirror 使用剩余高度而不是挤占元数据区域高度', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题"
        onMarkdownChange={() => {}}
      />,
    );

    const editor = screen.getByLabelText('Markdown 正文');

    expect(editor.className).toContain('min-h-0');
    expect(editor.className).toContain('flex-1');
    expect(editor.className).not.toContain('h-full');
  });

  it('Cmd+S 触发 onSaveRequested', () => {
    const onSave = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onSaveRequested={onSave}
        onMarkdownChange={() => {}}
      />,
    );
    const root = screen.getByTestId('markdown-editor-root');
    fireEvent.keyDown(root, { key: 's', metaKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('Ctrl+S 触发 onSaveRequested', () => {
    const onSave = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onSaveRequested={onSave}
        onMarkdownChange={() => {}}
      />,
    );
    const root = screen.getByTestId('markdown-editor-root');
    fireEvent.keyDown(root, { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
  });

  it('documentKey 变化不抛错', () => {
    const { rerender } = render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# a"
        onMarkdownChange={() => {}}
      />,
    );
    expect(() =>
      rerender(
        <MarkdownEditor
          documentKey="doc-2"
          markdown="# b"
          onMarkdownChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });

  it('默认使用 wide 页宽模式', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      screen
        .getByTestId('markdown-editor-root')
        .getAttribute('data-page-width-mode'),
    ).toBe('wide');
  });

  it('渲染 wide 页宽模式不再添加外层限宽容器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );
    // 重构后限宽下沉到 mardora 内容层，外层不再有 max-w-* wrapper。
    expect(document.querySelector('.max-w-\\[88rem\\]')).toBeNull();
    expect(
      screen.getByTestId('markdown-editor-root').className,
    ).toContain('workspace-editor-page-wide');
  });

  it('编辑器外壳不再使用外层滚动容器与限宽内层', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    // 重构后 CodeMirror 自身负责滚动，外层 scrollarea + mx-auto 限宽层已移除。
    expect(
      document.querySelector('.workspace-editor-scrollarea'),
    ).toBeNull();
  });

  it('渲染 wide 页宽模式标记 mardora 内容层可全宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.getByTestId('markdown-editor-root').className).toContain(
      'workspace-editor-shell',
    );
    expect(screen.getByTestId('markdown-editor-root').className).toContain(
      'workspace-editor-page-wide',
    );
  });

  it('wide 页宽模式使用 Mardora TOC 数据并关闭内置面板', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];
    expect(config.toc.enabled).toBe(false);
    expect(config.toc.onTocChange).toEqual(expect.any(Function));
    expect(config.extensions).toHaveLength(2);
  });

  it('wide 页宽模式通过 Mardora 内容层限宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];

    expect(config.contentWidth).toEqual({
      maxWidth: 'min(88rem, 75%)',
    });
  });

  it('编辑模式 wide 页宽不限制 CodeMirror 外层宽度', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const editor = screen.getByLabelText('Markdown 正文');
    const config = mardoraMock.mock.calls.at(-1)?.[0];

    expect(editor.className).toContain('w-full');
    expect(editor.className).toContain('flex-1');
    expect(editor.className).not.toContain('mx-auto');
    expect(editor.className).not.toContain('max-w-[min(88rem,75%)]');
    expect(config.contentWidth).toEqual({
      maxWidth: 'min(88rem, 75%)',
    });
  });

  it('渲染 Notion 风格目录横条和 hover 面板', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];
    act(() => {
      config.toc.onTocChange([
        {
          active: false,
          from: 4,
          id: 'intro',
          level: 2,
          text: '一句话结论',
          to: 12,
        },
        {
          active: true,
          from: 24,
          id: 'dry-run',
          level: 3,
          text: '构建并做 dry-run',
          to: 42,
        },
      ]);
    });

    expect(screen.getByTestId('mardora-toc-overlay')).toBeTruthy();
    expect(screen.getByTestId('mardora-toc-rail')).toBeTruthy();
    expect(screen.getByTestId('mardora-toc-hover-bridge')).toBeTruthy();
    expect(screen.getByTestId('mardora-toc-panel')).toBeTruthy();
    expect(screen.getByTestId('mardora-toc-panel').className).toContain(
      'mardora-toc-panel-scrollarea',
    );
    expect(screen.getByTestId('mardora-toc-bar-intro').className).toContain(
      'w-6',
    );
    expect(screen.getByTestId('mardora-toc-bar-dry-run').className).toContain(
      'bg-foreground',
    );
    expect(screen.getByRole('button', { name: '跳转到 构建并做 dry-run' }))
      .toBeTruthy();
  });

  it('阅读模式复用 Mardora preview TOC 并保留侧边目录', async () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'---\ntitle: x\n---\n\n# 标题\n\n## 阅读模式'}
        pageWidthMode="wide"
        readOnly
        onMarkdownChange={() => {}}
      />,
    );

    expect(extractPreviewTocFromMarkdownMock).toHaveBeenCalledWith(
      '# 标题\n\n## 阅读模式',
    );
    expect(await screen.findByTestId('mardora-toc-overlay')).toBeTruthy();
    expect(screen.getByTestId('markdown-editor-preview').className).toContain(
      'markdown-editor-preview-scrollarea',
    );
    expect(screen.getByTestId('markdown-editor-preview').className).toContain(
      '[&_.mardora-preview]:max-w-[min(88rem,75%)]',
    );
    expect(screen.getByTestId('mardora-toc-bar-read-mode')).toBeTruthy();
    expect(screen.getByRole('button', { name: '跳转到 阅读模式' })).toBeTruthy();
  });

  it('拦截 Mardora 预览 DOM 的鼠标选择避免 CodeMirror scanTile 崩溃', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="![cover](madora-asset://asset-img)"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.getByTestId('mardora-preview-mousedown-handled').textContent)
      .toBe('true');
    expect(screen.getByTestId('mardora-resize-mousedown-handled').textContent)
      .toBe('true');
    expect(screen.getByTestId('mardora-resize-pointerdown-handled').textContent)
      .toBe('true');
  });

  it('点击自定义目录项跳转到对应标题', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];
    act(() => {
      config.toc.onTocChange([
        {
          active: true,
          from: 24,
          id: 'dry-run',
          level: 2,
          text: '构建并做 dry-run',
          to: 42,
        },
      ]);
    });

    fireEvent.click(
      screen.getByRole('button', { name: '跳转到 构建并做 dry-run' }),
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.anything(),
        selection: expect.anything(),
      }),
    );
    expect(focusMock).toHaveBeenCalled();
  });

  it('将编辑器选中的 Markdown 范围上报给工作区', () => {
    const onSelectionChange = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 标题\n\n选中的段落"
        onMarkdownChange={() => {}}
        onSelectionChange={onSelectionChange}
      />,
    );

    const updateListener = mardoraMock
      .mock.calls.at(-1)?.[0]
      ?.extensions?.find(
        (extension: unknown) =>
          typeof (extension as { value?: unknown }).value === 'function',
      ) as { value: (update: unknown) => void } | undefined;

    expect(updateListener).toBeTruthy();

    act(() => {
      updateListener?.value({
        docChanged: false,
        selectionSet: true,
        state: {
          selection: {
            main: {
              empty: false,
              from: 6,
              to: 11,
            },
          },
          sliceDoc: vi.fn(() => '选中的段落'),
        },
      });
    });

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      from: 6,
      markdown: '选中的段落',
      to: 11,
    });

    act(() => {
      updateListener?.value({
        docChanged: false,
        selectionSet: true,
        state: {
          selection: {
            main: {
              empty: true,
              from: 11,
              to: 11,
            },
          },
          sliceDoc: vi.fn(),
        },
      });
    });

    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it('编辑模式回到顶部按钮避开滚动条并使用分段缓动滚动', async () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="wide"
        onMarkdownChange={() => {}}
      />,
    );

    act(() => {
      editorScrollState.top = 640;
      editorScrollState.listeners.forEach((listener) => listener());
    });

    const backToTopButton = screen.getByRole('button', { name: '回到顶部' });
    expect(backToTopButton.className).toContain('right-10');
    expect(backToTopButton.className).not.toContain('right-4');

    fireEvent.click(backToTopButton);

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(scrollToMock).toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
    expect(scrollToMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        top: expect.any(Number),
      }),
    );
  });

  it('阅读模式滚动后显示回到顶部按钮', async () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'# 标题\n\n## 阅读模式'}
        pageWidthMode="wide"
        readOnly
        onMarkdownChange={() => {}}
      />,
    );

    const preview = await screen.findByTestId('markdown-editor-preview');

    Object.defineProperty(preview, 'scrollTop', {
      configurable: true,
      value: 520,
      writable: true,
    });
    fireEvent.scroll(preview);

    const backToTopButton = screen.getByRole('button', { name: '回到顶部' });
    expect(backToTopButton.className).toContain('right-10');
  });

  it('目录弹层和文档滚动条使用轻量滚动样式', () => {
    const globalsCssSource = readFileSync(globalsCssPath, 'utf8');

    expect(globalsCssSource).toContain(
      '.mardora-toc-panel-scrollarea::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain('scrollbar-width: none;');
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell .cm-scroller::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain('margin-right: 12px;');
    expect(globalsCssSource).toContain(
      '.markdown-editor-preview-scrollarea::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain(
      '.markdown-editor-preview-scrollarea::-webkit-scrollbar-thumb',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-scrollarea::-webkit-scrollbar',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-scrollarea::-webkit-scrollbar-track-piece',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell .cm-mardora .cm-content',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell.workspace-editor-page-standard .cm-mardora .cm-content',
    );
    expect(globalsCssSource).toContain(
      '.workspace-editor-shell.workspace-editor-page-wide .cm-mardora .cm-content',
    );
    expect(globalsCssSource).toContain('max-width: 48rem;');
    expect(globalsCssSource).toContain('max-width: min(88rem, 75%);');
    expect(globalsCssSource).toContain('margin-inline: auto;');
    expect(globalsCssSource).toContain('padding-bottom: 8rem;');
    expect(globalsCssSource).toContain('width: 4px;');
    expect(globalsCssSource).toContain('background: transparent;');
  });

  it('通过 Mardora fonts API 接入文档、代码和 UI 字体', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];

    expect(config.fonts).toEqual({
      code: expect.stringContaining('--madora-code-font'),
      document: expect.stringContaining('--madora-document-font'),
      ui: expect.stringContaining('--madora-ui-font'),
    });
  });

  it('阅读模式通过 Mardora preview CSS 接入文档、代码和 UI 字体', async () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        readOnly
        onMarkdownChange={() => {}}
      />,
    );

    await screen.findByTestId('markdown-editor-preview');

    expect(generateCSSMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fonts: {
          code: expect.stringContaining('--madora-code-font'),
          document: expect.stringContaining('--madora-document-font'),
          ui: expect.stringContaining('--madora-ui-font'),
        },
        syntaxTheme: expect.anything(),
      }),
    );
    expect(previewMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        syntaxTheme: expect.anything(),
      }),
    );
  });

  it('不再通过 app 全局 CSS 覆盖 Mardora 内部字体节点', () => {
    const globalsCssSource = readFileSync(globalsCssPath, 'utf8');

    expect(globalsCssSource).not.toContain(
      '.workspace-editor-shell .cm-mardora :is(.cm-mardora-h1, .cm-mardora-h2',
    );
    expect(globalsCssSource).not.toContain(
      '.markdown-editor-preview-scrollarea .mardora-preview :is(h1, h2',
    );
    expect(globalsCssSource).not.toContain(
      'font-family: var(--madora-code-font);',
    );
  });

  it('standard 页宽模式通过 Mardora 内容层限宽', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="standard"
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      document.querySelector('.max-w-\\[48rem\\]'),
    ).toBeNull();
    const config = mardoraMock.mock.calls.at(-1)?.[0];
    const editor = screen.getByLabelText('Markdown 正文');

    expect(editor.className).toContain('w-full');
    expect(editor.className).toContain('flex-1');
    expect(editor.className).not.toContain('mx-auto');
    expect(editor.className).not.toContain('max-w-[48rem]');
    expect(config.contentWidth).toEqual({
      maxWidth: '48rem',
    });
  });

  it('standard 页宽模式仍保留鼠标选择保护扩展', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# x"
        pageWidthMode="standard"
        onMarkdownChange={() => {}}
      />,
    );

    expect(mardoraMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentWidth: {
          maxWidth: '48rem',
        },
        extensions: [expect.anything(), expect.anything()],
      }),
    );
  });

  it('启用 Mardora 链接卡片解析器', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="https://example.com"
        onMarkdownChange={() => {}}
      />,
    );

    const config = mardoraMock.mock.calls.at(-1)?.[0];

    expect(config.linkPreview).toEqual({
      enabled: true,
      resolve: expect.any(Function),
    });
  });

  it('不再把文档顶部 frontmatter 展示在编辑器顶部', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={[
          '---',
          'createdAt: 2026-06-18T11:35:15.383Z',
          'refinexDialect: 1',
          'title: Octarine',
          'customKey: 自定义值',
          '---',
          '',
          '# Octarine',
        ].join('\n')}
        onMarkdownChange={() => {}}
      />,
    );

    expect(screen.queryByTestId('markdown-frontmatter-panel')).toBeNull();
    expect(screen.queryByText('文档元数据')).toBeNull();
    expect(screen.queryByText('createdAt')).toBeNull();
    expect(screen.queryByText('refinexDialect')).toBeNull();
    expect(screen.queryByText('customKey')).toBeNull();
    expect(screen.queryByText('创建时间')).toBeNull();
    expect(screen.queryByText('方言版本')).toBeNull();
    expect(screen.queryByText('标题')).toBeNull();
  });

  it('编辑区只显示正文，不显示原始 frontmatter 文本', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'---\ntitle: Octarine\n---\n\n# Octarine'}
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe('# Octarine');
    expect(screen.queryByDisplayValue(/title: Octarine/u)).toBeNull();
  });

  it('编辑区不显示 Windows CRLF frontmatter 文本', () => {
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={[
          '---',
          'title: Octarine',
          'createdAt: 2026-06-22T02:12:54.498Z',
          '---',
          '',
          '# Octarine',
        ].join('\r\n')}
        onMarkdownChange={() => {}}
      />,
    );

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe('# Octarine');
    expect(screen.queryByDisplayValue(/createdAt:/u)).toBeNull();
    expect(screen.queryByDisplayValue(/title: Octarine/u)).toBeNull();
  });

  it('编辑带 frontmatter 的正文时保留原始 metadata 字段', () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown={'---\ntitle: Octarine\ncustomKey: keep\n---\n\n# Octarine'}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(onMarkdownChange).toHaveBeenCalledWith(
      '---\ntitle: Octarine\ncustomKey: keep\n---\n\n# 新正文\n',
    );
  });

  it('没有 frontmatter 时编辑回调保持普通 Markdown', () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownEditor
        documentKey="doc-1"
        markdown="# 原正文"
        onMarkdownChange={onMarkdownChange}
      />,
    );

    expect(screen.queryByTestId('markdown-frontmatter-panel')).toBeNull();

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文' },
    });

    expect(onMarkdownChange).toHaveBeenCalledWith('# 新正文');
  });
});

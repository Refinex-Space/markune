import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

const { resolvedThemeMock } = vi.hoisted(() => ({
  resolvedThemeMock: vi.fn(),
}));

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const {
  cancelAnimationFrameMock,
  markweaveEditorMock,
  markweaveUnmountMock,
  payloadFieldReadMock,
  requestAnimationFrameMock,
  scrollToMock,
  toStorageMarkdownMock,
  uploadHandlerMock,
  useWorkspaceAssetUploaderMock,
  searchControllerMock,
  searchListeners,
  searchState,
} = vi.hoisted(() => ({
  cancelAnimationFrameMock: vi.fn(),
  markweaveEditorMock: vi.fn(),
  markweaveUnmountMock: vi.fn(),
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
  searchState: {
    activeMatchIndex: -1,
    error: null as string | null,
    matchCount: 0,
    options: {
      caseSensitive: false,
      regex: false,
      wholeWord: false,
    },
    query: '',
  },
  searchControllerMock: {
    clear: vi.fn(),
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => true),
    getState: vi.fn(),
    replaceAll: vi.fn(() => 2),
    replaceCurrent: vi.fn(() => true),
    setOptions: vi.fn(),
    setQuery: vi.fn(),
    subscribe: vi.fn(),
  },
  searchListeners: new Set<(state: unknown) => void>(),
}));

vi.mock('@markweave/react', async () => {
  const React = await import('react');

  return {
    MarkweaveEditor: vi.fn((props: Record<string, unknown>) => {
      markweaveEditorMock(props);
      React.useEffect(() => {
        (
          props.onSearchControllerChange as
            | ((controller: typeof searchControllerMock | null) => void)
            | undefined
        )?.(searchControllerMock);

        return () => {
          (
            props.onSearchControllerChange as
              | ((controller: typeof searchControllerMock | null) => void)
              | undefined
          )?.(null);
          markweaveUnmountMock();
        };
      }, [props.onSearchControllerChange]);

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

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: resolvedThemeMock() }),
}));

describe('MarkdownEditor', () => {
  beforeEach(() => {
    cancelAnimationFrameMock.mockClear();
    markweaveEditorMock.mockClear();
    markweaveUnmountMock.mockClear();
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
    resolvedThemeMock.mockReturnValue('light');
    toStorageMarkdownMock.mockImplementation((markdown: string) => markdown);
    uploadHandlerMock.mockClear();
    useWorkspaceAssetUploaderMock.mockClear();
    Object.assign(searchState, {
      activeMatchIndex: -1,
      error: null,
      matchCount: 0,
      options: {
        caseSensitive: false,
        regex: false,
        wholeWord: false,
      },
      query: '',
    });
    searchListeners.clear();
    Object.values(searchControllerMock).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        value.mockClear();
      }
    });
    searchControllerMock.getState.mockImplementation(() => searchState);
    searchControllerMock.subscribe.mockImplementation((listener) => {
      listener(searchState);
      searchListeners.add(listener);
      return () => searchListeners.delete(listener);
    });
    searchControllerMock.setQuery.mockImplementation((query, options) => {
      Object.assign(searchState, {
        activeMatchIndex: query ? 0 : -1,
        matchCount: query ? 2 : 0,
        options,
        query,
      });
      searchListeners.forEach((listener) => listener(searchState));
    });
    searchControllerMock.clear.mockImplementation(() => {
      Object.assign(searchState, {
        activeMatchIndex: -1,
        matchCount: 0,
        query: '',
      });
      searchListeners.forEach((listener) => listener(searchState));
    });
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
      canvasColor: 'var(--background)',
      content: '# 标题',
      contentFormat: 'markdown',
      editable: true,
      innerToc: true,
      innerTocPlacement: 'container',
      lang: 'zh',
      onSlashCommandUpload: uploadHandlerMock,
      theme: 'light',
      mode: 'live',
    });
    expect(markweaveEditorMock.mock.calls.at(-1)?.[0]).toMatchObject({
      linkCardResolver: expect.any(Function),
    });
  });

  it('将应用有效暗色主题同步给 Markweave', () => {
    resolvedThemeMock.mockReturnValue('dark');

    render(<MarkdownEditor markdown="# 标题" />);

    expect(markweaveEditorMock.mock.calls.at(-1)?.[0]).toMatchObject({
      canvasColor: 'var(--background)',
      theme: 'dark',
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

  it('保存带 frontmatter 的空任务项时保留末尾语法空格', () => {
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        markdown={'---\ntitle: 文档\n---\n# 原文'}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: '# 新正文\n\n- [ ] ' },
    });

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: 文档\n---\n\n# 新正文\n\n- [ ] \n',
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

  it('通过 Ctrl/Cmd+F 打开专业查找栏并驱动 Markweave 搜索与替换', () => {
    render(<MarkdownEditor markdown="# Alpha alpha" onMarkdownChange={() => {}} />);
    const editorRoot = screen.getByTestId('markdown-editor-root');

    fireEvent.keyDown(editorRoot, { key: 'f', metaKey: true });

    const searchInput = screen.getByRole('searchbox', { name: '查找内容' });
    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByTestId('document-find-bar').className).toContain(
      'shadow-sm',
    );
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    expect(searchControllerMock.setQuery).toHaveBeenLastCalledWith('alpha', {
      caseSensitive: false,
      regex: false,
      wholeWord: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '区分大小写' }));
    fireEvent.click(screen.getByRole('button', { name: '完整词匹配' }));
    fireEvent.click(screen.getByRole('button', { name: '使用正则表达式' }));
    expect(searchControllerMock.setQuery).toHaveBeenLastCalledWith('alpha', {
      caseSensitive: true,
      regex: true,
      wholeWord: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '下一个匹配' }));
    fireEvent.click(screen.getByRole('button', { name: '上一个匹配' }));
    fireEvent.keyDown(window, { key: 'F3' });
    fireEvent.keyDown(window, { key: 'F3', shiftKey: true });
    expect(searchControllerMock.findNext).toHaveBeenCalledTimes(2);
    expect(searchControllerMock.findPrevious).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '展开替换' }));
    fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
      target: { value: 'beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: '替换当前匹配' }));
    fireEvent.click(screen.getByRole('button', { name: '替换全部匹配' }));
    expect(searchControllerMock.replaceCurrent).toHaveBeenCalledWith('beta');
    expect(searchControllerMock.replaceAll).toHaveBeenCalledWith('beta');

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(screen.queryByRole('searchbox', { name: '查找内容' })).toBeNull();
    expect(searchControllerMock.clear).toHaveBeenCalled();

    fireEvent.keyDown(editorRoot, { altKey: true, key: 'f', metaKey: true });
    expect(screen.getByRole('textbox', { name: '替换为' })).toBeTruthy();
  });

  it('源码模式中查找并替换原始 Markdown', () => {
    const onMarkdownChange = vi.fn();
    render(
      <MarkdownEditor
        markdown={'---\ntitle: Alpha\n---\n\n# Alpha'}
        onMarkdownChange={onMarkdownChange}
      />,
    );
    const editorRoot = screen.getByTestId('markdown-editor-root');

    fireEvent.keyDown(editorRoot, { code: 'Slash', ctrlKey: true, key: '/' });
    fireEvent.keyDown(editorRoot, { ctrlKey: true, key: 'f' });
    fireEvent.change(screen.getByRole('searchbox', { name: '查找内容' }), {
      target: { value: 'Alpha' },
    });
    fireEvent.click(screen.getByRole('button', { name: '展开替换' }));
    fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), {
      target: { value: 'Beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: '替换当前匹配' }));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: Beta\n---\n\n# Alpha',
      'source',
    );
  });

  it('锁定文档允许查找但禁用替换', () => {
    render(<MarkdownEditor markdown="# Alpha" readOnly />);
    const editorRoot = screen.getByTestId('markdown-editor-root');

    fireEvent.keyDown(editorRoot, { ctrlKey: true, key: 'h' });
    fireEvent.change(screen.getByRole('searchbox', { name: '查找内容' }), {
      target: { value: 'Alpha' },
    });

    expect(
      (screen.getByRole('button', {
        name: '替换当前匹配',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', {
        name: '替换全部匹配',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('通过 Ctrl/Cmd+/ 切换完整可写源码且不卸载 Markweave', () => {
    const markdown =
      '---\ntitle: 源码文档\nupdatedAt: 2026-07-14\n---\n\n# 正文\n\n- [ ] 任务\n';
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        documentKey="source-doc"
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    const editorRoot = screen.getByTestId('markdown-editor-root');

    fireEvent.keyDown(editorRoot, {
      code: 'Slash',
      ctrlKey: true,
      key: '/',
    });

    const source = screen.getByLabelText(
      'Markdown 文档源码',
    ) as HTMLTextAreaElement;

    expect(editorRoot.getAttribute('data-editor-mode')).toBe('source');
    expect(source.value).toBe(markdown);
    expect(source.readOnly).toBe(false);
    expect(document.activeElement).toBe(source);
    expect(screen.getByText('Markdown 源码')).toBeTruthy();
    expect(screen.getByText('可编辑 · Ctrl / Cmd + / 返回')).toBeTruthy();
    expect(screen.getByTestId('markweave-editor')).toBeTruthy();
    expect(screen.getByTestId('markweave-editor-mode').className).toContain(
      'hidden',
    );
    expect(markweaveUnmountMock).not.toHaveBeenCalled();

    const nextMarkdown = `${markdown}\n<!-- 源码编辑 -->\n`;
    fireEvent.change(source, { target: { value: nextMarkdown } });
    expect(onMarkdownChange).toHaveBeenLastCalledWith(nextMarkdown, 'source');

    fireEvent.keyDown(source, {
      code: 'Slash',
      key: '/',
      metaKey: true,
    });

    expect(screen.queryByLabelText('Markdown 文档源码')).toBeNull();
    expect(editorRoot.getAttribute('data-editor-mode')).toBe('live');
    expect(screen.getByTestId('markweave-editor-mode').className).not.toContain(
      'hidden',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Markdown 正文'));
    expect(markweaveUnmountMock).not.toHaveBeenCalled();
  });

  it('锁定文档的源码模式保持只读', () => {
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        markdown="# 锁定文档"
        onMarkdownChange={onMarkdownChange}
        readOnly
      />,
    );

    fireEvent.keyDown(screen.getByTestId('markdown-editor-root'), {
      code: 'Slash',
      ctrlKey: true,
      key: '/',
    });

    const source = screen.getByLabelText(
      'Markdown 文档源码',
    ) as HTMLTextAreaElement;

    expect(source.readOnly).toBe(true);
    expect(screen.getByText('只读 · Ctrl / Cmd + / 返回')).toBeTruthy();
    fireEvent.change(source, { target: { value: '# 不应写入' } });
    expect(onMarkdownChange).not.toHaveBeenCalled();
  });

  it('源码模式下仍支持 Cmd/Ctrl+S 保存快捷键', () => {
    const onSaveRequested = vi.fn();

    render(
      <MarkdownEditor
        markdown="# 标题"
        onSaveRequested={onSaveRequested}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('markdown-editor-root'), {
      code: 'Slash',
      ctrlKey: true,
      key: '/',
    });
    fireEvent.keyDown(screen.getByLabelText('Markdown 文档源码'), {
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

  it('不覆盖 Markweave 原生表格直角样式', () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const tableRule = globalsCss.match(
      /\.workspace-editor-shell table\s*\{([\s\S]*?)\}/,
    )?.[1];

    expect(tableRule).toBeDefined();
    expect(tableRule).toContain('border-color:');
    expect(tableRule).not.toContain('border-radius:');
    expect(tableRule).not.toContain('overflow:');
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

});

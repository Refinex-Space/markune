import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MarkweaveDocumentLoadState } from '@markweave/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/editor/markdown-editor';

const { resolvedThemeMock } = vi.hoisted(() => ({
  resolvedThemeMock: vi.fn(),
}));

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const {
  aiEditControllerMock,
  cancelAnimationFrameMock,
  markweaveEditorMock,
  markweaveUnmountMock,
  prepareMarkweaveEditorForOutputMock,
  payloadFieldReadMock,
  requestAnimationFrameMock,
  scrollToMock,
  toStorageMarkdownMock,
  uploadHandlerMock,
  useWorkspaceAssetUploaderMock,
  searchControllerMock,
  searchListeners,
  searchState,
  viewportCoordinatorForElementMock,
} = vi.hoisted(() => ({
  aiEditControllerMock: {
    discard: vi.fn(),
    getState: vi.fn<
      () => { context: { id: string } | null; phase: string }
    >(() => ({ context: null, phase: 'idle' })),
  },
  cancelAnimationFrameMock: vi.fn(),
  markweaveEditorMock: vi.fn(),
  markweaveUnmountMock: vi.fn(),
  prepareMarkweaveEditorForOutputMock: vi.fn(),
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
      onAttachmentDownload: vi.fn(),
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
  viewportCoordinatorForElementMock: vi.fn(),
}));

vi.mock('@markweave/react', async () => {
  const React = await import('react');

  return {
    prepareMarkweaveEditorForOutput: prepareMarkweaveEditorForOutputMock,
    MarkweaveEditor: vi.fn((props: Record<string, unknown>) => {
      const [content, setContent] = React.useState(() =>
        String(props.defaultContent ?? props.content ?? ''),
      );
      markweaveEditorMock(props);
      const onAiEditControllerChange = props.onAiEditControllerChange as
        | ((controller: typeof aiEditControllerMock | null) => void)
        | undefined;
      const onSearchControllerChange = props.onSearchControllerChange as
        | ((controller: typeof searchControllerMock | null) => void)
        | undefined;
      React.useEffect(() => {
        onAiEditControllerChange?.(aiEditControllerMock);
        onSearchControllerChange?.(searchControllerMock);

        return () => {
          onAiEditControllerChange?.(null);
          onSearchControllerChange?.(null);
          markweaveUnmountMock();
        };
      }, [onAiEditControllerChange, onSearchControllerChange]);

      return (
        <div
          className="markweave-editor-surface"
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
            value={content}
            onChange={(event) => {
              const markdown = event.currentTarget.value;
              setContent(markdown);
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
            {content}
          </span>
        </div>
      );
    }),
  };
});

vi.mock('markweave', () => ({
  getMarkweaveDocumentViewportCoordinatorForElement:
    viewportCoordinatorForElementMock,
}));

vi.mock('next/dynamic', async () => {
  const React = await import('react');

  return {
    default: () =>
      function MockMarkdownSourceEditor(props: {
        editorRef: React.RefObject<{
          focus: () => void;
          getSelectedText: () => string;
          selectRange: (from: number, to: number) => void;
          setValue: (value: string) => void;
        } | null>;
        initialValue: string;
        onChange?: (value: string) => void;
        readOnly: boolean;
      }) {
        const [value, setValue] = React.useState(props.initialValue);
        const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

        React.useEffect(() => {
          props.editorRef.current = {
            focus: () => textareaRef.current?.focus(),
            getSelectedText: () => {
              const textarea = textareaRef.current;
              return textarea
                ? textarea.value.slice(
                    textarea.selectionStart,
                    textarea.selectionEnd,
                  )
                : '';
            },
            selectRange: (from, to) =>
              textareaRef.current?.setSelectionRange(from, to),
            setValue: (nextValue) => {
              setValue(nextValue);
              props.onChange?.(nextValue);
            },
          };
          return () => {
            props.editorRef.current = null;
          };
        }, [props.editorRef, props.onChange]);

        return (
          <textarea
            aria-label="Markdown 文档源码"
            readOnly={props.readOnly}
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              props.onChange?.(event.currentTarget.value);
            }}
          />
        );
      },
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
    vi.useFakeTimers();
    cancelAnimationFrameMock.mockClear();
    aiEditControllerMock.discard.mockClear();
    aiEditControllerMock.getState.mockClear();
    aiEditControllerMock.getState.mockReturnValue({
      context: null,
      phase: 'idle',
    });
    markweaveEditorMock.mockClear();
    markweaveUnmountMock.mockClear();
    prepareMarkweaveEditorForOutputMock.mockReset();
    viewportCoordinatorForElementMock.mockReset();
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
        onAttachmentDownload: vi.fn(),
        onSlashCommandUpload: uploadHandlerMock,
        toStorageMarkdown: toStorageMarkdownMock,
      }),
    );
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('渲染 Markweave 非受控 Markdown 编辑器', () => {
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
      defaultContent: '# 标题',
      defaultContentFormat: 'markdown',
      editable: true,
      innerToc: true,
      innerTocPlacement: 'container',
      lang: 'zh',
      onAttachmentDownload: expect.any(Function),
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

  it('透传加载状态并仅通过受限 handle 调用官方输出屏障', async () => {
    const ref = React.createRef<MarkdownEditorHandle>();
    const onDocumentLoadStateChange = vi.fn();
    const editor = { id: 'private-editor' };
    const signal = new AbortController().signal;
    const report = {
      durationMs: 12,
      kind: 'dom-snapshot' as const,
      missing: 0,
      resolved: 1,
      status: 'ready' as const,
      timedOut: 0,
      unreadable: 0,
    };
    viewportCoordinatorForElementMock.mockReturnValue({ editor });
    prepareMarkweaveEditorForOutputMock.mockResolvedValue(report);

    render(
      <MarkdownEditor
        markdown="# 输出"
        onDocumentLoadStateChange={onDocumentLoadStateChange}
        readOnly
        ref={ref}
      />,
    );

    const loadState = {
      error: null,
      phase: 'ready' as const,
      profile: null,
      progress: 1,
      tier: 'standard' as const,
    };
    const markweaveProps = markweaveEditorMock.mock.calls.at(-1)?.[0] as {
      onDocumentLoadStateChange?: (state: typeof loadState) => void;
    };
    act(() => markweaveProps.onDocumentLoadStateChange?.(loadState));
    expect(onDocumentLoadStateChange).toHaveBeenCalledWith(loadState);

    let resolvedReport: typeof report | null = null;
    await act(async () => {
      resolvedReport = await ref.current!.prepareForOutput({
        kind: 'dom-snapshot',
        signal,
        timeoutMs: 1_000,
      });
    });

    expect(viewportCoordinatorForElementMock).toHaveBeenCalledWith(
      screen.getByTestId('markweave-editor'),
    );
    expect(prepareMarkweaveEditorForOutputMock).toHaveBeenCalledWith(
      editor,
      {
        kind: 'dom-snapshot',
        signal,
        timeoutMs: expect.any(Number),
      },
    );
    expect(resolvedReport).toEqual(report);
    expect(ref.current).not.toHaveProperty('editor');
  });

  it('加载失败时显示可诊断兜底并支持重新加载与源码恢复', () => {
    const onDocumentLoadStateChange = vi.fn();

    render(
      <MarkdownEditor
        documentKey="large-document.md"
        markdown="# 原始正文"
        onDocumentLoadStateChange={onDocumentLoadStateChange}
        onMarkdownChange={() => {}}
      />,
    );

    const emitLoadState = (state: MarkweaveDocumentLoadState) => {
      const markweaveProps = markweaveEditorMock.mock.calls.at(-1)?.[0] as {
        onDocumentLoadStateChange?: (
          nextState: MarkweaveDocumentLoadState,
        ) => void;
      };
      act(() => {
        markweaveProps.onDocumentLoadStateChange?.(state);
      });
    };

    emitLoadState({
      error: null,
      phase: 'parsing',
      profile: null,
      progress: null,
      tier: 'large',
    });
    expect(screen.getByRole('status').textContent).toContain('正在解析文档');

    emitLoadState({
      error: null,
      phase: 'mounting',
      profile: null,
      progress: 0.42,
      tier: 'large',
    });
    expect(screen.getByRole('status').textContent).toContain('42%');

    emitLoadState({
      error: `Invalid document ${'content '.repeat(80)}`,
      phase: 'error',
      profile: null,
      progress: null,
      tier: 'large',
    });

    expect(screen.getByRole('alert').textContent).toContain(
      '文档编辑器加载失败',
    );
    expect(
      screen.getByTestId('markweave-document-load-error-detail').textContent
        ?.length,
    ).toBeLessThanOrEqual(320);
    expect(onDocumentLoadStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'error', tier: 'large' }),
    );

    const renderCountBeforeRetry = markweaveEditorMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(
      screen.queryByTestId('markweave-document-load-error'),
    ).toBeNull();
    expect(markweaveEditorMock.mock.calls.length).toBeGreaterThan(
      renderCountBeforeRetry,
    );

    emitLoadState({
      error: 'Invalid content for node paragraph',
      phase: 'error',
      profile: null,
      progress: null,
      tier: 'large',
    });
    fireEvent.click(screen.getByRole('button', { name: '使用源码模式' }));

    expect(screen.getByTestId('markdown-source-mode')).toBeTruthy();
    expect(screen.getByLabelText('Markdown 文档源码')).toHaveProperty(
      'value',
      '# 原始正文',
    );
  });

  it('普通点击段落内工作区文档链接时阻止浏览器导航并交给 Markweave 编辑', () => {
    render(
      <MarkdownEditor
        documentPath="/vault/plans/2026.md"
        markdown="[技术团队](../技术团队.md)"
        workspaceRootPath="/vault"
      />,
    );

    const link = document.createElement('a');
    link.href = '../%E6%8A%80%E6%9C%AF%E5%9B%A2%E9%98%9F.md';
    screen.getByTestId('markweave-editor').append(link);
    const targetClick = vi.fn();
    link.addEventListener('click', targetClick);
    const openDocument = vi.fn();
    window.addEventListener('markune:open-document', openDocument);

    const dispatched = fireEvent.click(link);

    expect(dispatched).toBe(false);
    expect(targetClick).toHaveBeenCalledTimes(1);
    expect(openDocument).not.toHaveBeenCalled();
    window.removeEventListener('markune:open-document', openDocument);
  });

  it('Ctrl/Cmd 点击段落内工作区文档链接时由 Markune 打开目标文档', () => {
    render(
      <MarkdownEditor
        documentPath="/vault/plans/2026.md"
        markdown="[技术团队](../技术团队.md)"
        workspaceRootPath="/vault"
      />,
    );

    const link = document.createElement('a');
    link.href = '../%E6%8A%80%E6%9C%AF%E5%9B%A2%E9%98%9F.md#实践';
    screen.getByTestId('markweave-editor').append(link);
    const targetClick = vi.fn();
    link.addEventListener('click', targetClick);
    const openDocument = vi.fn();
    window.addEventListener('markune:open-document', openDocument);

    const dispatched = fireEvent.click(link, { metaKey: true });

    expect(dispatched).toBe(false);
    expect(targetClick).not.toHaveBeenCalled();
    expect(openDocument).toHaveBeenCalledTimes(1);
    expect((openDocument.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      hash: '实践',
      relativePath: '技术团队.md',
    });
    window.removeEventListener('markune:open-document', openDocument);
  });

  it('缺少路径上下文时仍阻止 Markdown 文档链接落入浏览器', () => {
    render(<MarkdownEditor markdown="[缺失文档](missing.md)" />);

    const link = document.createElement('a');
    link.href = 'missing.md';
    screen.getByTestId('markweave-editor').append(link);

    expect(fireEvent.click(link)).toBe(false);
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(false);
  });

  it('阻止外部链接原生导航但保留 Markweave 事件和普通附件链接', () => {
    render(
      <MarkdownEditor
        documentPath="/vault/plans/2026.md"
        markdown="links"
        workspaceRootPath="/vault"
      />,
    );

    const editor = screen.getByTestId('markweave-editor');
    const externalLink = document.createElement('a');
    externalLink.href = 'https://www.superdoc.dev/';
    editor.append(externalLink);
    const externalClick = vi.fn();
    externalLink.addEventListener('click', externalClick);
    const attachmentLink = document.createElement('a');
    attachmentLink.href = '../assets/guide.pdf';
    editor.append(attachmentLink);

    expect(fireEvent.click(externalLink)).toBe(false);
    expect(fireEvent.click(externalLink, { metaKey: true })).toBe(false);
    expect(externalClick).toHaveBeenCalledTimes(2);
    expect(fireEvent.click(attachmentLink)).toBe(true);
  });

  it('仅在可编辑 Live 文档发布 Ask AI handler 和 controller', () => {
    const askAiHandler = vi.fn();
    const ref = React.createRef<MarkdownEditorHandle>();
    const { rerender } = render(
      <MarkdownEditor
        aiEnabled
        askAiHandler={askAiHandler}
        markdown="# AI"
        ref={ref}
      />,
    );

    expect(markweaveEditorMock.mock.calls.at(-1)?.[0]).toMatchObject({
      askAi: { enabled: true, handler: askAiHandler },
    });
    expect(ref.current?.getAiEditController()).toBe(aiEditControllerMock);

    rerender(
      <MarkdownEditor
        aiEnabled
        askAiHandler={askAiHandler}
        markdown="# AI"
        readOnly
        ref={ref}
      />,
    );

    expect(markweaveEditorMock.mock.calls.at(-1)?.[0].askAi).toBeUndefined();
    expect(ref.current?.getAiEditController()).toBeNull();
  });

  it('离开 Live 模式时舍弃活动的 AI 预编辑上下文', () => {
    aiEditControllerMock.getState.mockReturnValue({
      context: { id: 'ai-context' },
      phase: 'streaming',
    });
    const { rerender } = render(
      <MarkdownEditor aiEnabled askAiHandler={vi.fn()} markdown="# AI" />,
    );

    rerender(
      <MarkdownEditor
        aiEnabled={false}
        askAiHandler={vi.fn()}
        markdown="# AI"
      />,
    );

    expect(aiEditControllerMock.discard).toHaveBeenCalledWith('ai-context');
  });

  it('切换到 Source 模式后不再暴露 AI controller', () => {
    const ref = React.createRef<MarkdownEditorHandle>();
    render(
      <MarkdownEditor
        aiEnabled
        askAiHandler={vi.fn()}
        markdown="# AI"
        ref={ref}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('markdown-editor-root'), {
      code: 'Slash',
      ctrlKey: true,
      key: '/',
    });

    expect(ref.current?.getAiEditController()).toBeNull();
    expect(markweaveEditorMock.mock.calls.at(-1)?.[0].askAi).toBeUndefined();
  });

  it('保护 frontmatter，只把正文传给 Markweave，idle 时再序列化完整 Markdown', () => {
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

    expect(onMarkdownChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: 文档\n---\n\n# 新正文\n',
      undefined,
      'idle',
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

    act(() => vi.advanceTimersByTime(500));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: 文档\n---\n\n# 新正文\n\n- [ ] \n',
      undefined,
      'idle',
    );
  });

  it('保存前把 Markweave display URL 还原成工作区存储引用', () => {
    const onMarkdownChange = vi.fn();
    toStorageMarkdownMock.mockImplementation((markdown: string) =>
      markdown.replace(
        'asset://localhost/ws/.markune/assets/files/aa/hash.png',
        'markune-asset://hash',
      ),
    );

    render(
      <MarkdownEditor markdown="# 原文" onMarkdownChange={onMarkdownChange} />,
    );

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: {
        value:
          '![图](asset://localhost/ws/.markune/assets/files/aa/hash.png)',
      },
    });

    act(() => vi.advanceTimersByTime(500));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '![图](markune-asset://hash)',
      undefined,
      'idle',
    );
  });

  it('在 Markweave 内投影图稿回链并在保存时恢复标准 Markdown', () => {
    const onMarkdownChange = vi.fn();
    const assetId = 'a'.repeat(64);
    const drawingId = '11111111-1111-4111-8111-111111111111';
    const canonical =
      `[![架构图](markune-asset://${assetId})](markune-drawing://${drawingId})`;
    const projected =
      `![架构图](markune-asset://${assetId} "markune-drawing://${drawingId}")`;

    render(
      <MarkdownEditor
        markdown={canonical}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe(projected);

    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: `${projected}\n` },
    });

    act(() => vi.advanceTimersByTime(500));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      `${canonical}\n`,
      undefined,
      'idle',
    );
  });

  it('连续输入期间不读取 Markdown，idle 后只序列化一次', () => {
    render(<MarkdownEditor markdown="# 原文" onMarkdownChange={() => {}} />);

    for (let index = 1; index <= 100; index += 1) {
      fireEvent.change(screen.getByLabelText('Markdown 正文'), {
        target: { value: `# 新正文 ${index}` },
      });
    }

    expect(payloadFieldReadMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(499));
    expect(payloadFieldReadMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(payloadFieldReadMock).toHaveBeenCalledTimes(1);
    expect(payloadFieldReadMock).toHaveBeenCalledWith('markdown');
  });

  it('拦截 Cmd/Ctrl+S，立即序列化一次并触发保存请求', () => {
    const onSaveRequested = vi.fn();

    render(
      <MarkdownEditor markdown="# 标题" onSaveRequested={onSaveRequested} />,
    );

    fireEvent.keyDown(screen.getByTestId('markdown-editor-root'), {
      key: 's',
      metaKey: true,
    });

    expect(onSaveRequested).toHaveBeenCalledTimes(1);
    expect(payloadFieldReadMock).not.toHaveBeenCalled();
  });

  it('通过 Ctrl/Cmd+F 打开专业查找栏并驱动 Markweave 搜索与替换', () => {
    render(<MarkdownEditor markdown="# Alpha alpha" onMarkdownChange={() => {}} />);
    const editorRoot = screen.getByTestId('markdown-editor-root');

    fireEvent.keyDown(editorRoot, { key: 'f', metaKey: true });

    const searchInput = screen.getByRole('searchbox', { name: '查找内容' });
    expect(document.activeElement).toBe(searchInput);
    const findBar = screen.getByTestId('document-find-bar');
    expect(findBar.className).toContain('shadow-xs');
    expect(findBar.className).toContain('rounded-md');
    expect(findBar.className).toContain('w-[min(480px,calc(100%-1.5rem))]');
    expect(findBar.firstElementChild?.className).toContain('h-9');
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

    act(() => vi.advanceTimersByTime(500));

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      '---\ntitle: Beta\n---\n\n# Alpha',
      'source',
      'idle',
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

  it('通过 Ctrl/Cmd+/ 切换完整可写源码，返回时只重建一次 Markweave', async () => {
    const markdown =
      '---\ntitle: 源码文档\nupdatedAt: 2026-07-14\n---\n\n# 正文\n\n- [ ] 任务\n';
    const onMarkdownChange = vi.fn();
    const onSourceModeChange = vi.fn();

    render(
      <MarkdownEditor
        documentKey="source-doc"
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
        onSourceModeChange={onSourceModeChange}
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
    expect(screen.queryByText('Markdown 源码')).toBeNull();
    expect(screen.queryByText('可编辑 · Ctrl / Cmd + / 返回')).toBeNull();
    expect(screen.queryByText('Ctrl / Cmd + / 返回')).toBeNull();
    expect(onSourceModeChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('markweave-editor')).toBeTruthy();
    expect(screen.getByTestId('markweave-editor-mode').className).toContain(
      'hidden',
    );
    expect(markweaveUnmountMock).not.toHaveBeenCalled();

    const nextMarkdown = `${markdown}\n<!-- 源码编辑 -->\n`;
    fireEvent.change(source, { target: { value: nextMarkdown } });
    expect(onMarkdownChange).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      nextMarkdown,
      'source',
      'idle',
    );

    await act(async () => {
      fireEvent.keyDown(source, {
        code: 'Slash',
        key: '/',
        metaKey: true,
      });
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('Markdown 文档源码')).toBeNull();
    expect(editorRoot.getAttribute('data-editor-mode')).toBe('live');
    expect(screen.getByTestId('markweave-editor-mode').className).not.toContain(
      'hidden',
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Markdown 正文'));
    expect(markweaveUnmountMock).toHaveBeenCalledTimes(1);
    expect(onSourceModeChange).toHaveBeenLastCalledWith(false);
  });

  it('Live 编辑后往返源码模式时保留最新内容', async () => {
    const markdown = '# 原始内容\n';
    const nextMarkdown = '# 已输入的最新内容\n';
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        documentKey="live-source-roundtrip"
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    const editorRoot = screen.getByTestId('markdown-editor-root');
    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: nextMarkdown },
    });

    await act(async () => {
      fireEvent.keyDown(editorRoot, {
        code: 'Slash',
        ctrlKey: true,
        key: '/',
      });
      await Promise.resolve();
    });

    const source = screen.getByLabelText(
      'Markdown 文档源码',
    ) as HTMLTextAreaElement;
    expect(source.value).toBe(nextMarkdown);

    await act(async () => {
      fireEvent.keyDown(source, {
        code: 'Slash',
        ctrlKey: true,
        key: '/',
      });
      await Promise.resolve();
    });

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe(nextMarkdown);
    expect(onMarkdownChange).toHaveBeenCalledWith(
      nextMarkdown,
      undefined,
      'source-toggle',
    );
  });

  it('自动保存后往返源码模式时保留最新内容', async () => {
    const markdown = '# 原始内容\n';
    const nextMarkdown = '# 自动保存后的最新内容\n';
    const onMarkdownChange = vi.fn();

    render(
      <MarkdownEditor
        documentKey="saved-live-source-roundtrip"
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
      />,
    );

    const editorRoot = screen.getByTestId('markdown-editor-root');
    fireEvent.change(screen.getByLabelText('Markdown 正文'), {
      target: { value: nextMarkdown },
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      nextMarkdown,
      undefined,
      'idle',
    );

    await act(async () => {
      fireEvent.keyDown(editorRoot, {
        code: 'Slash',
        ctrlKey: true,
        key: '/',
      });
      await Promise.resolve();
    });

    const source = screen.getByLabelText(
      'Markdown 文档源码',
    ) as HTMLTextAreaElement;
    expect(source.value).toBe(nextMarkdown);

    await act(async () => {
      fireEvent.keyDown(source, {
        code: 'Slash',
        ctrlKey: true,
        key: '/',
      });
      await Promise.resolve();
    });

    expect(
      (screen.getByLabelText('Markdown 正文') as HTMLTextAreaElement).value,
    ).toBe(nextMarkdown);
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
    expect(screen.queryByText('Ctrl / Cmd + / 返回')).toBeNull();
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
    expect(globalsCss).toContain('--markune-markweave-toc-gutter: 2rem');
    expect(globalsCss).toContain(
      "--markweave-inner-toc-gutter: var(--markune-markweave-toc-gutter)",
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

  it('只拦截稳定的 markune-drawing 内链并派发打开事件', () => {
    const onOpenDrawing = vi.fn();
    window.addEventListener('markune:open-drawing', onOpenDrawing);
    render(<MarkdownEditor markdown="# 图稿" />);
    const root = screen.getByTestId('markdown-editor-root');
    const drawingLink = document.createElement('a');
    drawingLink.href =
      'markune-drawing://11111111-1111-4111-8111-111111111111';
    root.append(drawingLink);

    fireEvent.click(drawingLink);

    expect(onOpenDrawing).toHaveBeenCalledTimes(1);
    expect((onOpenDrawing.mock.calls[0][0] as CustomEvent).detail).toEqual({
      drawingId: '11111111-1111-4111-8111-111111111111',
    });

    const drawingImage = document.createElement('img');
    drawingImage.title =
      'markune-drawing://22222222-2222-4222-8222-222222222222';
    root.append(drawingImage);
    fireEvent.click(drawingImage);
    expect(onOpenDrawing).toHaveBeenCalledTimes(2);
    expect((onOpenDrawing.mock.calls[1][0] as CustomEvent).detail).toEqual({
      drawingId: '22222222-2222-4222-8222-222222222222',
    });

    const httpLink = document.createElement('a');
    httpLink.href = 'https://example.com';
    httpLink.addEventListener('click', (event) => event.preventDefault());
    root.append(httpLink);
    fireEvent.click(httpLink);
    expect(onOpenDrawing).toHaveBeenCalledTimes(2);

    const invalidDrawingLink = document.createElement('img');
    invalidDrawingLink.title =
      'markune-drawing://33333333-3333-0333-8333-333333333333';
    root.append(invalidDrawingLink);
    fireEvent.click(invalidDrawingLink);
    expect(onOpenDrawing).toHaveBeenCalledTimes(2);
    window.removeEventListener('markune:open-drawing', onOpenDrawing);
  });

});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ForwardedRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesPage } from '../daily-notes-page';
import type { DailyNoteEntry } from '../workspace-types';

const mocks = vi.hoisted(() => ({
  openDailyNote: vi.fn(),
  readMarkdownDocument: vi.fn(),
  saveMarkdownDocument: vi.fn(),
}));

vi.mock('../workspace-api', () => ({
  openDailyNote: mocks.openDailyNote,
  readMarkdownDocument: mocks.readMarkdownDocument,
  saveMarkdownDocument: mocks.saveMarkdownDocument,
}));

vi.mock('@/components/editor/markdown-editor', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');

  return {
    MarkdownEditor: ReactModule.forwardRef(function MockMarkdownEditor(
      {
        documentKey,
        markdown,
        onMarkdownChange,
        pageWidthMode,
        readOnly = false,
        workspaceRootPath,
      }: {
        documentKey?: string;
        markdown: string;
        onMarkdownChange?: (
          markdown: string,
          origin?: string,
          reason?: string,
        ) => boolean | void | Promise<boolean | void>;
        pageWidthMode: string;
        readOnly?: boolean;
        workspaceRootPath: string;
      },
      ref: ForwardedRef<{
        flushDraft: (reason: string) => Promise<boolean>;
        getAiEditController: () => null;
      }>,
    ) {
      const [value, setValue] = ReactModule.useState(markdown);

      ReactModule.useEffect(() => {
        setValue(markdown);
      }, [documentKey, markdown]);

      ReactModule.useImperativeHandle(
        ref,
        () => ({
          flushDraft: async (reason: string) => {
            const result = await onMarkdownChange?.(value, undefined, reason);
            return result !== false;
          },
          getAiEditController: () => null,
        }),
        [onMarkdownChange, value],
      );

      return readOnly ? (
        <article
          data-page-width={pageWidthMode}
          data-read-only="true"
          data-root-path={workspaceRootPath}
          data-testid="daily-markdown-preview"
        >
          {markdown}
        </article>
      ) : (
        <textarea
          aria-label="Markdown 正文"
          data-page-width={pageWidthMode}
          data-root-path={workspaceRootPath}
          data-testid="daily-markdown-editor"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }),
  };
});

const entry: DailyNoteEntry = {
  date: '2026-07-31',
  documentPath: '/workspace/Daily/2026/07/2026-07-31.md',
  excerpt: '完成验收与上线准备，更新文档与发布说明。',
  hasContent: true,
  taskCompleted: 2,
  taskPreview: [
    { completed: true, text: '验收通过' },
    { completed: false, text: '监控与回滚方案' },
  ],
  taskTotal: 3,
  title: '发布 v0.6.0',
  updatedAt: new Date(2026, 6, 31, 9, 24).getTime(),
};

function renderPage(overrides: Partial<React.ComponentProps<typeof DailyNotesPage>> = {}) {
  const props: React.ComponentProps<typeof DailyNotesPage> = {
    entries: [entry],
    error: null,
    inspectorWidth: 420,
    isLoading: false,
    month: new Date(2026, 6, 1),
    pageWidthMode: 'wide',
    rootPath: '/workspace',
    selectedDate: '2026-07-31',
    viewMode: 'month',
    onCreateDaily: vi.fn(),
    onInspectorResize: vi.fn(),
    onMonthChange: vi.fn(),
    onOpenDaily: vi.fn(),
    onRefresh: vi.fn(),
    onSelectDate: vi.fn(),
    onViewModeChange: vi.fn(),
    ...overrides,
  };

  return { props, ...render(<DailyNotesPage {...props} />) };
}

describe('DailyNotesPage', () => {
  beforeEach(() => {
    mocks.openDailyNote.mockReset();
    mocks.readMarkdownDocument.mockReset();
    mocks.saveMarkdownDocument.mockReset();
    mocks.readMarkdownDocument.mockResolvedValue({
      content:
        '# 2026-07-31\n\n## 发布 v0.6.0\n\n完成验收与上线准备。\n\n- [x] 验收通过',
      modifiedAt: entry.updatedAt,
      path: entry.documentPath,
    });
    mocks.openDailyNote.mockResolvedValue({
      content: {
        content:
          '---\ntitle: 2026-07-30\ncreatedAt: 2026-07-30T00:00:00Z\nupdatedAt: 2026-07-30T00:00:00Z\nrefinexDialect: 1\ndailyDate: 2026-07-30\n---\n\n# 2026-07-30\n',
        modifiedAt: 100,
        path: '/workspace/Daily/2026/07/2026-07-30.md',
      },
      node: {},
    });
    mocks.saveMarkdownDocument.mockResolvedValue({
      modifiedAt: entry.updatedAt + 1,
      path: entry.documentPath,
    });
  });

  it('renders the complete selected Daily Markdown and opens it explicitly', async () => {
    const user = userEvent.setup();
    const { props } = renderPage();

    const preview = await screen.findByTestId('daily-markdown-preview');
    expect(preview.textContent).toContain('完成验收与上线准备');
    expect(preview.dataset.readOnly).toBe('true');
    expect(preview.dataset.pageWidth).toBe('wide');
    expect(preview.dataset.rootPath).toBe('/workspace');
    expect(mocks.readMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      entry.documentPath,
    );
    expect(screen.queryByText('最后更新')).toBeNull();
    expect(screen.queryByText('2/3 完成')).toBeNull();
    expect(screen.queryByRole('button', { name: '导出' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '打开详情' }));
    expect(props.onOpenDaily).toHaveBeenCalledWith(entry);
    expect(props.onCreateDaily).not.toHaveBeenCalled();
  });

  it('exports the selected Daily note from the inspector when available', async () => {
    const user = userEvent.setup();
    const onExportDaily = vi.fn();
    renderPage({ onExportDaily });

    await screen.findByTestId('daily-markdown-preview');
    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(await screen.findByRole('menuitem', { name: 'PDF' }));

    expect(onExportDaily).toHaveBeenCalledWith(entry, 'pdf');
  });

  it('previews indexed content in the month cell and opens quick edit from the preview', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    renderPage({ onSelectDate });

    expect(screen.getByText('发布 v0.6.0')).toBeTruthy();
    expect(screen.getByText('完成验收与上线准备，更新文档与发布说明。')).toBeTruthy();
    expect(screen.getByText('监控与回滚方案')).toBeTruthy();

    const previewAction = screen.getByRole('button', {
      name: '快速编辑 2026-07-31 日程',
    });
    expect(previewAction.className).toContain(
      'daily-notes-calendar-cell-preview-fade',
    );
    expect(previewAction.className).toContain('mt-0.5');
    expect(previewAction.className).toContain('justify-start');
    expect(previewAction.textContent).not.toContain('2/3 完成');

    await user.click(previewAction);

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-31');
    const dialog = await screen.findByRole('dialog', { name: '编辑日程' });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('m-auto');
    expect(dialog.className).toContain('translate-none');
    expect(dialog.className).not.toContain('-translate-x-1/2');
    expect(dialog.className).not.toContain('-translate-y-1/2');
    expect(dialog.textContent).not.toContain('Daily/2026/07/2026-07-31.md');
    expect(dialog.textContent).not.toContain('7月31日 周五');
    expect(await screen.findByTestId('daily-markdown-editor')).toBeTruthy();
  });

  it('opens the same quick editor from the inspector preview area', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId('daily-markdown-preview');
    await user.click(
      screen.getByRole('button', {
        name: '从详情预览编辑 2026-07-31 日程',
      }),
    );

    expect(
      await screen.findByRole('dialog', { name: '编辑日程' }),
    ).toBeTruthy();
    expect(await screen.findByTestId('daily-markdown-editor')).toBeTruthy();
  });

  it('saves an existing Daily document from the core editor', async () => {
    const user = userEvent.setup();
    const onDailyContentSaved = vi.fn();
    renderPage({ onDailyContentSaved });

    await user.click(
      screen.getByRole('button', {
        name: '快速编辑 2026-07-31 日程',
      }),
    );
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown 正文',
    });
    await user.clear(editor);
    await user.type(editor, '# 2026-07-31\n\n更新后的日程内容');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.saveMarkdownDocument).toHaveBeenCalledWith(
        '/workspace',
        entry.documentPath,
        '# 2026-07-31\n\n更新后的日程内容',
        entry.updatedAt,
      );
    });
    expect(onDailyContentSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '# 2026-07-31\n\n更新后的日程内容',
        path: entry.documentPath,
      }),
      '2026-07-31',
    );
  });

  it('creates an empty date only when saving and preserves the native frontmatter', async () => {
    const user = userEvent.setup();
    const onDailyContentSaved = vi.fn();
    mocks.saveMarkdownDocument.mockResolvedValueOnce({
      modifiedAt: 101,
      path: '/workspace/Daily/2026/07/2026-07-30.md',
    });
    renderPage({
      onDailyContentSaved,
      selectedDate: '2026-07-30',
    });

    await user.click(
      screen.getByRole('button', { name: '编辑 2026-07-30 日程' }),
    );
    expect(mocks.openDailyNote).not.toHaveBeenCalled();

    const editor = await screen.findByRole('textbox', {
      name: 'Markdown 正文',
    });
    expect((editor as HTMLTextAreaElement).value).toBe('# 2026-07-30\n');
    await user.clear(editor);
    await user.type(editor, '# 2026-07-30\n\n第一条记录');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.openDailyNote).toHaveBeenCalledWith(
        '/workspace',
        '2026-07-30',
      );
    });
    expect(mocks.saveMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      '/workspace/Daily/2026/07/2026-07-30.md',
      expect.stringContaining('dailyDate: 2026-07-30'),
      100,
    );
    expect(mocks.saveMarkdownDocument.mock.calls[0]?.[2]).toContain(
      '第一条记录',
    );
    expect(onDailyContentSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/workspace/Daily/2026/07/2026-07-30.md',
      }),
      '2026-07-30',
    );
  });

  it('saves pending edits before opening the full Daily detail', async () => {
    const user = userEvent.setup();
    const onCreateDaily = vi.fn();
    renderPage({ onCreateDaily });

    await user.click(
      screen.getByRole('button', {
        name: '快速编辑 2026-07-31 日程',
      }),
    );
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown 正文',
    });
    await user.clear(editor);
    await user.type(editor, '# 2026-07-31\n\n打开详情前保存');
    await user.click(
      screen.getByRole('button', { name: '打开日程详情' }),
    );

    await waitFor(() => {
      expect(mocks.saveMarkdownDocument).toHaveBeenCalledTimes(1);
      expect(onCreateDaily).toHaveBeenCalledWith('2026-07-31');
    });
  });

  it('protects an unsaved quick-edit draft before closing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', {
        name: '快速编辑 2026-07-31 日程',
      }),
    );
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown 正文',
    });
    await user.clear(editor);
    await user.type(editor, '# 尚未保存');
    await user.click(
      screen.getByRole('button', { name: '关闭日程编辑器' }),
    );

    expect(await screen.findByText('放弃尚未保存的修改？')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑日程' })).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: '关闭日程编辑器' }),
    );
    await user.click(screen.getByRole('button', { name: '放弃修改' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '编辑日程' })).toBeNull();
    });
  });

  it('keeps the quick-edit draft available when saving fails', async () => {
    const user = userEvent.setup();
    mocks.saveMarkdownDocument.mockRejectedValueOnce(new Error('版本冲突'));
    renderPage();

    await user.click(
      screen.getByRole('button', {
        name: '快速编辑 2026-07-31 日程',
      }),
    );
    const editor = await screen.findByRole('textbox', {
      name: 'Markdown 正文',
    });
    await user.clear(editor);
    await user.type(editor, '# 2026-07-31\n\n保留这次修改');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect((await screen.findByRole('alert')).textContent).toContain('版本冲突');
    expect((editor as HTMLTextAreaElement).value).toContain('保留这次修改');
    expect(screen.getByRole('dialog', { name: '编辑日程' })).toBeTruthy();
  });

  it('keeps the date at the card top-left and exposes an adjustable preview width', async () => {
    const user = userEvent.setup();
    const onInspectorResize = vi.fn();
    renderPage({ onInspectorResize });

    const dateCell = screen.getByRole('button', {
      name: '2026-07-31 每日笔记',
    });
    expect(dateCell.parentElement?.className).toContain('items-start');
    expect(dateCell.parentElement?.className).toContain('justify-start');
    const regularDateBadge = screen
      .getByRole('button', { name: '2026-07-30 每日笔记' })
      .parentElement?.querySelector('span');
    expect(regularDateBadge?.className).toContain('bg-muted');

    const detailAction = screen.getByRole('button', {
      name: '打开详情',
    }).parentElement;
    expect(detailAction?.className).toContain('border-b');
    expect(detailAction?.className).not.toContain('border-t');
    expect(
      screen
        .getByTestId('daily-notes-content-grid')
        .style.getPropertyValue('--daily-notes-inspector-width'),
    ).toBe('420px');

    const resizeHandle = screen.getByRole('separator', {
      name: '调整每日笔记预览宽度',
    });
    expect(resizeHandle.getAttribute('aria-valuemin')).toBe('360');
    expect(resizeHandle.getAttribute('aria-valuemax')).toBe('640');
    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('420');

    resizeHandle.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onInspectorResize).toHaveBeenLastCalledWith(436);
    await user.keyboard('{Home}');
    expect(onInspectorResize).toHaveBeenLastCalledWith(360);
    await user.keyboard('{End}');
    expect(onInspectorResize).toHaveBeenLastCalledWith(640);
  });

  it('keeps empty dates quiet, strengthens dark dividers, and contains the macOS tool row', () => {
    const emptyEntry: DailyNoteEntry = {
      ...entry,
      date: '2026-07-30',
      documentPath: '/workspace/Daily/2026/07/2026-07-30.md',
      excerpt: null,
      hasContent: true,
      taskCompleted: 0,
      taskPreview: [],
      taskTotal: 0,
      title: null,
    };
    renderPage({
      entries: [entry, emptyEntry],
      sidebarHeaderOffset: -6,
    });

    expect(screen.queryByText('空白每日笔记')).toBeNull();

    const emptyDateCell = screen.getByRole('button', {
      name: '2026-07-30 每日笔记',
    });
    expect(emptyDateCell.parentElement?.className).toContain(
      'dark:border-muted-foreground/25',
    );

    const page = screen.getByTestId('daily-notes-page');
    expect(page.querySelector('header')?.style.marginTop).toBe('0px');
    expect(page.querySelector('aside')?.className).toContain(
      'dark:border-muted-foreground/25',
    );
  });

  it('contains an unexpectedly high macOS tool row inside the panel chrome', () => {
    renderPage({ sidebarHeaderOffset: -20 });

    const page = screen.getByTestId('daily-notes-page');
    expect(page.querySelector('header')?.style.marginTop).toBe('0px');
  });

  it('selects an empty date without creating a file and requires an explicit create action', async () => {
    const user = userEvent.setup();
    const onSelectDate = vi.fn();
    const onCreateDaily = vi.fn();
    const { rerender, props } = renderPage({ onCreateDaily, onSelectDate });

    await user.click(
      screen.getByRole('button', { name: '2026-07-30 每日笔记' }),
    );
    expect(onSelectDate).toHaveBeenCalledWith('2026-07-30');
    expect(onCreateDaily).not.toHaveBeenCalled();

    rerender(
      <DailyNotesPage
        {...props}
        onCreateDaily={onCreateDaily}
        onSelectDate={onSelectDate}
        selectedDate="2026-07-30"
      />,
    );
    await user.click(screen.getByRole('button', { name: '创建每日笔记' }));
    expect(onCreateDaily).toHaveBeenCalledWith('2026-07-30');
    await waitFor(() => {
      expect(screen.queryByTestId('daily-markdown-preview')).toBeNull();
    });
  });

  it('exposes retry when the complete Markdown preview cannot be read', async () => {
    const user = userEvent.setup();
    mocks.readMarkdownDocument.mockRejectedValueOnce(new Error('读取失败'));
    renderPage();

    expect(await screen.findByText('读取失败')).toBeTruthy();
    mocks.readMarkdownDocument.mockResolvedValueOnce({
      content: '# 重试成功',
      modifiedAt: entry.updatedAt,
      path: entry.documentPath,
    });
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('# 重试成功')).toBeTruthy();
    expect(mocks.readMarkdownDocument).toHaveBeenCalledTimes(2);
  });

  it('switches to the list view and exposes retry when loading fails', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const onRefresh = vi.fn();
    const { rerender, props } = renderPage({ onRefresh, onViewModeChange });

    await user.click(screen.getByRole('button', { name: '列表视图' }));
    expect(onViewModeChange).toHaveBeenCalledWith('list');

    rerender(
      <DailyNotesPage
        {...props}
        entries={[]}
        error="无法读取每日笔记"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText('无法读取每日笔记')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

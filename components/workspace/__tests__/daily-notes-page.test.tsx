import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesPage } from '../daily-notes-page';
import type { DailyNoteEntry } from '../workspace-types';

const mocks = vi.hoisted(() => ({
  readMarkdownDocument: vi.fn(),
}));

vi.mock('../workspace-api', () => ({
  readMarkdownDocument: mocks.readMarkdownDocument,
}));

vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({
    markdown,
    pageWidthMode,
    readOnly,
    workspaceRootPath,
  }: {
    markdown: string;
    pageWidthMode: string;
    readOnly: boolean;
    workspaceRootPath: string;
  }) => (
    <article
      data-page-width={pageWidthMode}
      data-read-only={readOnly}
      data-root-path={workspaceRootPath}
      data-testid="daily-markdown-preview"
    >
      {markdown}
    </article>
  ),
}));

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
    mocks.readMarkdownDocument.mockReset();
    mocks.readMarkdownDocument.mockResolvedValue({
      content:
        '# 2026-07-31\n\n## 发布 v0.6.0\n\n完成验收与上线准备。\n\n- [x] 验收通过',
      modifiedAt: entry.updatedAt,
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

  it('keeps the date at the card top-left and exposes an adjustable preview width', async () => {
    const user = userEvent.setup();
    const onInspectorResize = vi.fn();
    renderPage({ onInspectorResize });

    const dateCell = screen.getByRole('button', {
      name: '2026-07-31 每日笔记',
    });
    expect(dateCell.className).toContain('items-start');
    expect(dateCell.className).toContain('justify-start');
    const regularDateBadge = screen
      .getByRole('button', { name: '2026-07-30 每日笔记' })
      .querySelector('span');
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
    expect(emptyDateCell.className).toContain('dark:border-muted-foreground/25');

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

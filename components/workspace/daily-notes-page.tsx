'use client';

import * as React from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePenLine,
  List,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/editor/markdown-editor';
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import {
  createDailyMarkdownTemplate,
  createDateFromDailyDate,
  formatDailyDate,
} from './daily-notes';
import {
  openDailyNote,
  readMarkdownDocument,
  saveMarkdownDocument,
} from './workspace-api';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import type {
  DailyNoteEntry,
  MarkdownDocumentContent,
  PageWidthMode,
  WorkspaceExportFormat,
} from './workspace-types';

export type DailyNotesViewMode = 'list' | 'month';

export const DAILY_NOTES_INSPECTOR_WIDTH = {
  defaultValue: 420,
  max: 640,
  min: 360,
} as const;

const DAILY_EXPORT_ACTIONS: Array<{
  format: WorkspaceExportFormat;
  label: string;
}> = [
  { format: 'html', label: 'HTML' },
  { format: 'markdown', label: 'Markdown' },
  { format: 'pdf', label: 'PDF' },
  { format: 'word', label: 'Word' },
];

interface DailyNotesPageProps {
  entries: DailyNoteEntry[];
  error: string | null;
  inspectorWidth: number;
  isLoading: boolean;
  month: Date;
  pageWidthMode: PageWidthMode;
  rootPath: string;
  selectedDate: string;
  sidebarHeaderOffset?: number;
  viewMode: DailyNotesViewMode;
  onCreateDaily: (date: string) => void;
  onDailyContentSaved?: (
    content: MarkdownDocumentContent,
    date: string,
  ) => void;
  onExportDaily?: (
    entry: DailyNoteEntry,
    format: WorkspaceExportFormat,
  ) => void;
  onInspectorResize: (width: number) => void;
  onMonthChange: (month: Date) => void;
  onOpenDaily: (entry: DailyNoteEntry) => void;
  onRefresh: () => void;
  onSelectDate: (date: string) => void;
  onViewModeChange: (mode: DailyNotesViewMode) => void;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
const WEEKDAY_LONG_LABELS = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
] as const;

export function DailyNotesPage({
  entries,
  error,
  inspectorWidth,
  isLoading,
  month,
  pageWidthMode,
  rootPath,
  selectedDate,
  sidebarHeaderOffset,
  viewMode,
  onCreateDaily,
  onDailyContentSaved,
  onExportDaily,
  onInspectorResize,
  onMonthChange,
  onOpenDaily,
  onRefresh,
  onSelectDate,
  onViewModeChange,
}: DailyNotesPageProps) {
  const alignWithMacSidebar = sidebarHeaderOffset !== undefined;
  const safeSidebarHeaderOffset = Math.max(sidebarHeaderOffset ?? 0, 0);
  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [quickEditorTarget, setQuickEditorTarget] =
    React.useState<DailyQuickEditorTarget | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const entriesByDate = React.useMemo(
    () => new Map(entries.map((entry) => [entry.date, entry])),
    [entries],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const filteredEntries = React.useMemo(() => {
    if (!normalizedQuery) {
      return entries;
    }

    return entries.filter((entry) =>
      [
        entry.date,
        entry.title,
        entry.excerpt,
        ...entry.taskPreview.map((task) => task.text),
      ]
        .filter(Boolean)
        .join('\n')
        .toLocaleLowerCase('zh-CN')
        .includes(normalizedQuery),
    );
  }, [entries, normalizedQuery]);
  const filteredEntryDates = React.useMemo(
    () => new Set(filteredEntries.map((entry) => entry.date)),
    [filteredEntries],
  );
  const selectedEntry = entriesByDate.get(selectedDate) ?? null;
  const dailyPreview = useDailyNotePreview(rootPath, selectedEntry);
  const monthCells = React.useMemo(() => createDailyMonthCells(month), [month]);

  React.useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  function moveMonth(offset: number) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  function goToToday() {
    const today = new Date();
    onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelectDate(formatDailyDate(today));
  }

  function openQuickEditor(date: string) {
    onSelectDate(date);
    setQuickEditorTarget({
      date,
      entry: entriesByDate.get(date) ?? null,
    });
  }

  return (
    <div
      className="daily-notes-page flex h-full min-h-0 flex-col bg-background"
      data-testid="daily-notes-page"
    >
      <header
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-border/55 px-3 dark:border-muted-foreground/25',
          alignWithMacSidebar ? 'pb-2' : 'h-12',
        )}
        style={
          alignWithMacSidebar
            ? { height: 44, marginTop: safeSidebarHeaderOffset }
            : undefined
        }
      >
        <h1 className="mr-2 shrink-0 text-sm font-medium tracking-normal">
          日程
        </h1>
        <div className="flex items-center gap-0.5">
          <ToolbarButton label="上个月" onClick={() => moveMonth(-1)}>
            <ChevronLeft size={15} />
          </ToolbarButton>
          <ToolbarButton label="下个月" onClick={() => moveMonth(1)}>
            <ChevronRight size={15} />
          </ToolbarButton>
        </div>
        <button
          className="h-7 rounded-md border border-border/70 bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          type="button"
          onClick={goToToday}
        >
          今天
        </button>
        <span className="ml-1 min-w-24 text-sm font-medium tabular-nums">
          {formatDailyMonthLabel(month)}
        </span>

        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          <div
            className={cn(
              'grid h-7 items-center overflow-hidden transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              searchOpen ? 'w-56 opacity-100' : 'w-0 opacity-0',
            )}
          >
            <label className="flex h-7 min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 text-xs">
              <Search className="shrink-0 text-muted-foreground" size={13} />
              <input
                ref={searchInputRef}
                aria-label="搜索日程"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                placeholder="搜索本月记录"
                role="searchbox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setQuery('');
                    setSearchOpen(false);
                  }
                }}
              />
            </label>
          </div>
          <div
            aria-label="日程视图"
            className="mr-1 flex h-7 items-center rounded-md border border-border/65 bg-muted/35 p-0.5"
            role="group"
          >
            <ViewModeButton
              active={viewMode === 'month'}
              label="月视图"
              onClick={() => onViewModeChange('month')}
            >
              月
            </ViewModeButton>
            <ViewModeButton
              active={viewMode === 'list'}
              label="列表视图"
              onClick={() => onViewModeChange('list')}
            >
              列表
            </ViewModeButton>
          </div>
          <ToolbarButton
            active={searchOpen || Boolean(query)}
            label={searchOpen ? '关闭日程搜索' : '搜索日程'}
            onClick={() => {
              if (searchOpen && query) {
                setQuery('');
              }
              setSearchOpen((current) => !current);
            }}
          >
            {searchOpen ? <X size={15} /> : <Search size={15} />}
          </ToolbarButton>
          <ToolbarButton label="刷新日程" onClick={onRefresh}>
            <RefreshCw className={cn(isLoading && 'animate-spin')} size={15} />
          </ToolbarButton>
        </div>
      </header>

      <div
        className="daily-notes-content-grid relative grid min-h-0 flex-1"
        data-testid="daily-notes-content-grid"
        style={
          {
            '--daily-notes-inspector-width': `${inspectorWidth}px`,
          } as React.CSSProperties
        }
      >
        <main className="min-h-0 min-w-0 overflow-hidden">
          {error ? (
            <DailyNotesError error={error} onRetry={onRefresh} />
          ) : viewMode === 'month' ? (
            <DailyMonthView
              entriesByDate={entriesByDate}
              filteredEntryDates={filteredEntryDates}
              isLoading={isLoading}
              monthCells={monthCells}
              queryActive={Boolean(normalizedQuery)}
              selectedDate={selectedDate}
              onEditDate={openQuickEditor}
              onSelectDate={onSelectDate}
            />
          ) : (
            <DailyListView
              entries={filteredEntries}
              isLoading={isLoading}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
            />
          )}
        </main>

        <aside className="daily-notes-inline-inspector relative min-h-0 border-l border-border/55 bg-background dark:border-muted-foreground/25">
          <WorkspaceResizeHandle
            aria-label="调整每日笔记预览宽度"
            className="absolute! inset-y-0 -left-1 h-auto!"
            direction="right"
            max={DAILY_NOTES_INSPECTOR_WIDTH.max}
            min={DAILY_NOTES_INSPECTOR_WIDTH.min}
            value={inspectorWidth}
            onResize={onInspectorResize}
          />
          <DailyInspector
            createDisabled={isLoading || Boolean(error)}
            entry={selectedEntry}
            pageWidthMode={pageWidthMode}
            preview={dailyPreview.loadState}
            previewRevision={dailyPreview.retryRevision}
            rootPath={rootPath}
            selectedDate={selectedDate}
            onCreateDaily={onCreateDaily}
            onEditDaily={openQuickEditor}
            onExportDaily={onExportDaily}
            onOpenDaily={onOpenDaily}
            onRetryPreview={dailyPreview.retry}
          />
        </aside>

        <button
          aria-label="查看所选日期"
          className="daily-notes-drawer-trigger absolute right-4 bottom-4 z-10 h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          type="button"
          onClick={() => setInspectorOpen(true)}
        >
          <List size={14} />
          查看 {formatDailyShortDate(selectedDate)}
        </button>
      </div>

      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent
          aria-describedby="daily-notes-drawer-description"
          className="daily-notes-drawer fixed top-0 right-0 left-auto h-full max-h-none w-[min(360px,calc(100%-1rem))] max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-l border-border/70 bg-background p-0 sm:max-w-none"
          overlayClassName="bg-black/15"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {formatDailyInspectorDate(selectedDate)}
          </DialogTitle>
          <DialogDescription
            className="sr-only"
            id="daily-notes-drawer-description"
          >
            查看所选日期的每日笔记摘要与操作。
          </DialogDescription>
          <DialogClose asChild>
            <button
              aria-label="关闭日期详情"
              className="absolute top-2.5 right-2.5 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              type="button"
            >
              <X size={15} />
            </button>
          </DialogClose>
          <DailyInspector
            createDisabled={isLoading || Boolean(error)}
            entry={selectedEntry}
            pageWidthMode={pageWidthMode}
            preview={dailyPreview.loadState}
            previewRevision={dailyPreview.retryRevision}
            rootPath={rootPath}
            selectedDate={selectedDate}
            onCreateDaily={onCreateDaily}
            onEditDaily={openQuickEditor}
            onExportDaily={onExportDaily}
            onOpenDaily={onOpenDaily}
            onRetryPreview={dailyPreview.retry}
          />
        </DialogContent>
      </Dialog>

      {quickEditorTarget ? (
        <DailyQuickEditorDialog
          key={`${quickEditorTarget.date}\u0000${quickEditorTarget.entry?.documentPath ?? ''}\u0000${quickEditorTarget.entry?.updatedAt ?? ''}`}
          pageWidthMode={pageWidthMode}
          rootPath={rootPath}
          target={quickEditorTarget}
          onClose={() => setQuickEditorTarget(null)}
          onContentSaved={(content, date) => {
            dailyPreview.retry();
            onDailyContentSaved?.(content, date);
          }}
          onOpenDetails={(date) => {
            setQuickEditorTarget(null);
            onCreateDaily(date);
          }}
        />
      ) : null}
    </div>
  );
}

function DailyMonthView({
  entriesByDate,
  filteredEntryDates,
  isLoading,
  monthCells,
  queryActive,
  selectedDate,
  onEditDate,
  onSelectDate,
}: {
  entriesByDate: Map<string, DailyNoteEntry>;
  filteredEntryDates: Set<string>;
  isLoading: boolean;
  monthCells: Array<{ date: string; day: number } | null>;
  queryActive: boolean;
  selectedDate: string;
  onEditDate: (date: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const rowCount = monthCells.length / 7;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto" data-testid="daily-month-view">
      <div className="grid min-w-[760px] grid-cols-7 border-b border-border/55 text-xs text-muted-foreground dark:border-muted-foreground/25">
        {WEEKDAY_LABELS.map((label) => (
          <div className="flex h-10 items-center justify-center" key={label}>
            {label}
          </div>
        ))}
      </div>
      <div
        aria-label="月历"
        aria-busy={isLoading}
        className={cn(
          'grid min-h-[520px] min-w-[760px] flex-1 grid-cols-7 transition-opacity',
          isLoading && 'opacity-65',
        )}
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(96px, 1fr))` }}
      >
        {monthCells.map((cell, index) => {
          if (!cell) {
            return (
              <div
                aria-hidden="true"
                className="border-r border-b border-border/45 bg-muted/[0.06] dark:border-muted-foreground/25"
                key={`empty-${index}`}
              />
            );
          }

          const entry = entriesByDate.get(cell.date);
          const selected = selectedDate === cell.date;
          const queryMatch = !queryActive || filteredEntryDates.has(cell.date);

          return (
            <div
              className={cn(
                'group relative flex min-h-24 flex-col items-start justify-start overflow-hidden border-r border-b border-border/45 p-2.5 text-left transition-[background-color,box-shadow] dark:border-muted-foreground/25',
                selected &&
                  'z-[1] bg-brand/[0.035] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_72%,transparent)]',
              )}
              key={cell.date}
            >
              <button
                aria-label={`${cell.date} 每日笔记`}
                aria-pressed={selected}
                className="absolute inset-0 z-0 outline-none transition-colors hover:bg-accent/25 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45"
                type="button"
                onClick={() => onSelectDate(cell.date)}
              />
              <span
                className={cn(
                  'pointer-events-none relative z-10 inline-flex size-6 items-center justify-center rounded-full bg-muted text-sm text-foreground/85 tabular-nums transition-colors',
                  selected && 'bg-brand text-white',
                )}
              >
                {cell.day}
              </span>
              {entry?.hasContent && queryMatch ? (
                <button
                  aria-label={`快速编辑 ${cell.date} 日程`}
                  className="daily-notes-calendar-cell-preview-fade relative z-10 mt-0.5 flex w-full min-w-0 flex-1 cursor-text flex-col items-stretch justify-start overflow-hidden pb-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  type="button"
                  onClick={() => onEditDate(cell.date)}
                >
                  {entry.title ? (
                    <p className="truncate text-[13px] leading-5 font-medium text-foreground">
                      {entry.title}
                    </p>
                  ) : null}
                  {entry.excerpt ? (
                    <p className="daily-notes-calendar-cell-excerpt text-xs leading-[1.125rem] text-muted-foreground">
                      {entry.excerpt}
                    </p>
                  ) : null}
                  {entry.taskPreview.slice(0, 2).map((task, taskIndex) => (
                    <span
                      className="mt-1 flex min-w-0 items-start gap-1 text-[11px] leading-4 text-muted-foreground"
                      key={`${task.text}-${taskIndex}`}
                    >
                      <TaskSquare completed={task.completed} />
                      <span className="truncate">{task.text}</span>
                    </span>
                  ))}
                </button>
              ) : entry?.hasContent && queryActive ? (
                <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-10 size-1.5 rounded-full bg-muted-foreground/25" />
              ) : null}
              <button
                aria-label={`编辑 ${cell.date} 日程`}
                className="absolute bottom-2 left-2.5 z-20 flex h-6 items-center gap-1 rounded-md border border-border/55 bg-background/95 px-2 text-[11px] font-medium text-foreground opacity-0 shadow-xs transition-[opacity,background-color] hover:bg-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 group-hover:opacity-100 group-focus-within:opacity-100"
                type="button"
                onClick={() => onEditDate(cell.date)}
              >
                <FilePenLine size={12} />
                编辑日程
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyListView({
  entries,
  isLoading,
  selectedDate,
  onSelectDate,
}: {
  entries: DailyNoteEntry[];
  isLoading: boolean;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const sortedEntries = React.useMemo(
    () => [...entries].sort((left, right) => right.date.localeCompare(left.date)),
    [entries],
  );

  if (!isLoading && sortedEntries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
        本月没有匹配的每日笔记。
      </div>
    );
  }

  return (
    <div
      aria-busy={isLoading}
      className={cn('h-full overflow-auto px-4 py-2 transition-opacity', isLoading && 'opacity-65')}
      data-testid="daily-list-view"
    >
      {sortedEntries.map((entry) => (
        <button
          aria-label={`${entry.date} ${entry.title ?? '每日笔记'}`}
          aria-pressed={entry.date === selectedDate}
          className={cn(
            'grid w-full grid-cols-[7.5rem_minmax(0,1fr)_auto] gap-4 border-b border-border/50 px-2 py-3 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 dark:border-muted-foreground/25',
            entry.date === selectedDate && 'bg-brand/[0.035]',
          )}
          key={entry.date}
          type="button"
          onClick={() => onSelectDate(entry.date)}
        >
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {formatDailyInspectorDate(entry.date)}
          </span>
          <span className="min-w-0">
            {entry.title ? (
              <span className="block truncate text-sm font-medium">
                {entry.title}
              </span>
            ) : null}
            {entry.excerpt ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {entry.excerpt}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {entry.taskTotal > 0
              ? `${entry.taskCompleted}/${entry.taskTotal}`
              : formatUpdatedTime(entry.updatedAt)}
          </span>
        </button>
      ))}
    </div>
  );
}

function DailyInspector({
  createDisabled,
  entry,
  pageWidthMode,
  preview,
  previewRevision,
  rootPath,
  selectedDate,
  onCreateDaily,
  onEditDaily,
  onExportDaily,
  onOpenDaily,
  onRetryPreview,
}: {
  createDisabled: boolean;
  entry: DailyNoteEntry | null;
  pageWidthMode: PageWidthMode;
  preview: DailyPreviewLoadState;
  previewRevision: number;
  rootPath: string;
  selectedDate: string;
  onCreateDaily: (date: string) => void;
  onEditDaily: (date: string) => void;
  onExportDaily?: (
    entry: DailyNoteEntry,
    format: WorkspaceExportFormat,
  ) => void;
  onOpenDaily: (entry: DailyNoteEntry) => void;
  onRetryPreview: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {entry ? (
        <>
          <div className="daily-notes-rendered-preview min-h-0 flex-1 overflow-hidden">
            {preview.status === 'loading' ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                正在渲染每日笔记…
              </div>
            ) : preview.status === 'error' ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-xs">
                  <p className="text-sm font-medium">无法预览每日笔记</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {preview.message}
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={onRetryPreview}
                  >
                    重试
                  </Button>
                </div>
              </div>
            ) : preview.status === 'ready' ? (
              <div
                className="group/inspector relative h-full"
                data-testid="daily-inspector-preview"
              >
                <MarkdownEditor
                  documentKey={`daily-preview:${entry.documentPath}:${entry.updatedAt}:${previewRevision}`}
                  markdown={preview.markdown}
                  pageWidthMode={pageWidthMode}
                  readOnly
                  workspaceRootPath={rootPath}
                />
                <button
                  aria-label={`从详情预览编辑 ${entry.date} 日程`}
                  className="absolute inset-0 z-10 cursor-text rounded-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                  title="点击快速编辑日程"
                  type="button"
                  onClick={() => onEditDaily(entry.date)}
                >
                  <span className="absolute top-3 right-3 flex h-7 items-center gap-1 rounded-md border border-border/55 bg-background/95 px-2 text-[11px] font-medium text-foreground opacity-0 shadow-xs transition-opacity group-hover/inspector:opacity-100 group-focus-within/inspector:opacity-100">
                    <FilePenLine size={12} />
                    编辑日程
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2 border-b border-border/55 p-3 dark:border-muted-foreground/25">
            {onExportDaily ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="flex-1" type="button" variant="outline">
                    <Download data-icon="inline-start" />
                    导出
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {DAILY_EXPORT_ACTIONS.map((action) => (
                    <DropdownMenuItem
                      key={action.format}
                      onSelect={() => onExportDaily(entry, action.format)}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              className="flex-1"
              type="button"
              variant="outline"
              onClick={() => onOpenDaily(entry)}
            >
              打开详情
            </Button>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-5 py-4">
          <p className="border-b border-border/55 pb-3 text-sm font-medium tabular-nums dark:border-muted-foreground/25">
            {formatDailyInspectorDate(selectedDate)}
          </p>
          <div className="pt-4">
            <h2 className="text-base font-semibold">尚未创建每日笔记</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {createDisabled
                ? '正在确认这一天的状态，加载完成后才可创建。'
                : '浏览日期不会写入文件。确认需要记录时再创建这一天的 Markdown。'}
            </p>
          </div>
          <Button
            className="mt-auto w-full"
            disabled={createDisabled}
            type="button"
            onClick={() => onCreateDaily(selectedDate)}
          >
            创建每日笔记
          </Button>
        </div>
      )}
    </div>
  );
}

interface DailyQuickEditorTarget {
  date: string;
  entry: DailyNoteEntry | null;
}

type DailyQuickEditorLoadState =
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | { document: DailyQuickEditorDocument; status: 'ready' };

interface DailyQuickEditorDocument {
  content: string;
  modifiedAt: number | null;
  path: string | null;
}

function DailyQuickEditorDialog({
  pageWidthMode,
  rootPath,
  target,
  onClose,
  onContentSaved,
  onOpenDetails,
}: {
  pageWidthMode: PageWidthMode;
  rootPath: string;
  target: DailyQuickEditorTarget;
  onClose: () => void;
  onContentSaved: (content: MarkdownDocumentContent, date: string) => void;
  onOpenDetails: (date: string) => void;
}) {
  const initialDocument = target.entry
    ? null
    : ({
        content: createDailyMarkdownTemplate(target.date),
        modifiedAt: null,
        path: null,
      } satisfies DailyQuickEditorDocument);
  const editorRef = React.useRef<MarkdownEditorHandle | null>(null);
  const documentRef = React.useRef<DailyQuickEditorDocument | null>(
    initialDocument,
  );
  const draftMarkdownRef = React.useRef(initialDocument?.content ?? '');
  const savePromiseRef = React.useRef<Promise<MarkdownDocumentContent | null> | null>(
    null,
  );
  const [loadState, setLoadState] = React.useState<DailyQuickEditorLoadState>(
    initialDocument
      ? { document: initialDocument, status: 'ready' }
      : { status: 'loading' },
  );
  const [discardPromptVisible, setDiscardPromptVisible] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const targetKey = `${target.date}\u0000${target.entry?.documentPath ?? ''}\u0000${target.entry?.updatedAt ?? ''}`;

  React.useEffect(() => {
    if (!target.entry) return;
    const entry = target.entry;

    let cancelled = false;
    void readMarkdownDocument(rootPath, entry.documentPath)
      .then((content) => {
        if (cancelled) return;
        const document = {
          content: content.content,
          modifiedAt: content.modifiedAt,
          path: content.path,
        } satisfies DailyQuickEditorDocument;
        documentRef.current = document;
        draftMarkdownRef.current = document.content;
        setLoadState({ document, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState({
          message: formatDailyQuickEditorError(error, '无法读取日程内容。'),
          status: 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [rootPath, target.entry]);

  const captureMarkdown = React.useCallback((markdown: string) => {
    draftMarkdownRef.current = markdown;
    setSaveError(null);
    return true;
  }, []);

  const persistDraft = React.useCallback(
    async (
      reason: 'document-switch' | 'manual-save',
    ): Promise<MarkdownDocumentContent | null> => {
      if (loadState.status !== 'ready') return null;
      if (savePromiseRef.current) return savePromiseRef.current;

      const savePromise = (async () => {
        const flushed = (await editorRef.current?.flushDraft(reason)) ?? true;
        if (!flushed) return null;

        const currentDocument = documentRef.current;
        if (!currentDocument) return null;
        const draftMarkdown = draftMarkdownRef.current;

        if (currentDocument.path && draftMarkdown === currentDocument.content) {
          return {
            content: currentDocument.content,
            modifiedAt: currentDocument.modifiedAt ?? 0,
            path: currentDocument.path,
          };
        }

        setIsSaving(true);
        setSaveError(null);

        try {
          let documentPath = currentDocument.path;
          let expectedModifiedAt = currentDocument.modifiedAt;
          let contentToSave = draftMarkdown;

          if (!documentPath) {
            const opened = await openDailyNote(rootPath, target.date);
            const nativeTemplate = parseFrontmatter(opened.content.content);
            const editedDraft = parseFrontmatter(draftMarkdown);
            contentToSave = serializeFrontmatter({
              body: editedDraft.body,
              metadata: {
                ...nativeTemplate.metadata,
                ...editedDraft.metadata,
              },
            });
            documentPath = opened.content.path;
            expectedModifiedAt = opened.content.modifiedAt;

            if (contentToSave === opened.content.content) {
              const savedDocument = opened.content;
              const nextDocument = {
                content: savedDocument.content,
                modifiedAt: savedDocument.modifiedAt,
                path: savedDocument.path,
              } satisfies DailyQuickEditorDocument;
              documentRef.current = nextDocument;
              draftMarkdownRef.current = savedDocument.content;
              setLoadState({ document: nextDocument, status: 'ready' });
              onContentSaved(savedDocument, target.date);
              return savedDocument;
            }
          }

          const savedMeta = await saveMarkdownDocument(
            rootPath,
            documentPath,
            contentToSave,
            expectedModifiedAt,
          );
          const savedDocument = {
            content: contentToSave,
            modifiedAt: savedMeta.modifiedAt,
            path: savedMeta.path,
          } satisfies MarkdownDocumentContent;
          const nextDocument = {
            content: savedDocument.content,
            modifiedAt: savedDocument.modifiedAt,
            path: savedDocument.path,
          } satisfies DailyQuickEditorDocument;
          documentRef.current = nextDocument;
          draftMarkdownRef.current = savedDocument.content;
          setLoadState({ document: nextDocument, status: 'ready' });
          onContentSaved(savedDocument, target.date);
          return savedDocument;
        } catch (error: unknown) {
          setSaveError(
            formatDailyQuickEditorError(error, '无法保存日程，请稍后重试。'),
          );
          return null;
        } finally {
          setIsSaving(false);
        }
      })();

      savePromiseRef.current = savePromise;
      try {
        return await savePromise;
      } finally {
        savePromiseRef.current = null;
      }
    },
    [loadState.status, onContentSaved, rootPath, target],
  );

  const requestClose = React.useCallback(async () => {
    if (isSaving) return;
    const flushed =
      loadState.status === 'ready'
        ? ((await editorRef.current?.flushDraft('document-switch')) ?? true)
        : true;
    if (!flushed) return;
    const hasUnsavedChanges =
      draftMarkdownRef.current !== documentRef.current?.content;
    if (hasUnsavedChanges) {
      setDiscardPromptVisible(true);
      return;
    }
    onClose();
  }, [isSaving, loadState.status, onClose]);

  const handleOpenDetails = React.useCallback(async () => {
    const saved = await persistDraft('document-switch');
    if (!saved) return;
    onOpenDetails(target.date);
  }, [onOpenDetails, persistDraft, target]);

  const canSave = loadState.status === 'ready' && !isSaving;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <DialogContent
        className="daily-notes-quick-editor inset-0 m-auto flex h-[min(760px,calc(100vh-3rem))] w-[min(980px,calc(100vw-3rem))] max-w-none translate-none flex-col gap-0 overflow-hidden rounded-2xl border-border/70 bg-background p-0 shadow-2xl sm:max-w-none"
        overlayClassName="bg-black/18 backdrop-blur-[2px]"
        showCloseButton={false}
      >
        <header className="flex h-12 shrink-0 items-center border-b border-border/55 px-5 dark:border-muted-foreground/25">
          <DialogTitle className="text-sm font-semibold">编辑日程</DialogTitle>
          <DialogDescription className="sr-only">
            快速编辑每日 Markdown 内容
          </DialogDescription>
          <button
            aria-label="关闭日程编辑器"
            className="ml-auto flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            disabled={isSaving}
            type="button"
            onClick={() => void requestClose()}
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-background">
          {loadState.status === 'loading' ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="animate-spin" size={16} />
              正在加载日程…
            </div>
          ) : loadState.status === 'error' ? (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div className="max-w-sm">
                <p className="text-sm font-medium">无法打开日程编辑器</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {loadState.message}
                </p>
              </div>
            </div>
          ) : loadState.status === 'ready' ? (
            <MarkdownEditor
              ref={editorRef}
              documentKey={`daily-quick-editor:${targetKey}:${loadState.document.path ?? 'new'}:${loadState.document.modifiedAt ?? 'draft'}`}
              markdown={loadState.document.content}
              pageWidthMode={pageWidthMode}
              workspaceRootPath={rootPath}
              onMarkdownChange={captureMarkdown}
              onSaveRequested={() => void persistDraft('manual-save')}
            />
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border/55 bg-background px-4 py-3 dark:border-muted-foreground/25">
          {saveError ? (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {saveError}
            </p>
          ) : null}
          {discardPromptVisible ? (
            <div className="flex items-center gap-3">
              <p className="mr-auto text-xs text-muted-foreground">
                放弃尚未保存的修改？
              </p>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setDiscardPromptVisible(false)}
              >
                继续编辑
              </Button>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                onClick={onClose}
              >
                放弃修改
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="mr-auto hidden text-[11px] text-muted-foreground sm:block">
                Cmd/Ctrl + S 保存
              </p>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => void requestClose()}
              >
                取消
              </Button>
              <Button
                disabled={loadState.status !== 'ready' || isSaving}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void handleOpenDetails()}
              >
                打开日程详情
              </Button>
              <Button
                disabled={!canSave}
                size="sm"
                type="button"
                onClick={() => void persistDraft('manual-save')}
              >
                {isSaving ? <LoaderCircle className="animate-spin" /> : null}
                保存
              </Button>
            </div>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function formatDailyQuickEditorError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type DailyPreviewLoadState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | { markdown: string; status: 'ready' };

interface DailyPreviewRequestState {
  requestKey: string;
  value: Exclude<DailyPreviewLoadState, { status: 'empty' }>;
}

function useDailyNotePreview(
  rootPath: string,
  entry: DailyNoteEntry | null,
) {
  const [retryRevision, setRetryRevision] = React.useState(0);
  const [requestState, setRequestState] =
    React.useState<DailyPreviewRequestState>({
      requestKey: '',
      value: { status: 'loading' },
    });
  const requestKey = entry
    ? `${rootPath}\u0000${entry.documentPath}\u0000${entry.updatedAt}\u0000${retryRevision}`
    : '';
  const loadState: DailyPreviewLoadState = !entry
    ? { status: 'empty' }
    : requestState.requestKey === requestKey
      ? requestState.value
      : { status: 'loading' };

  React.useEffect(() => {
    if (!entry) {
      return;
    }

    let cancelled = false;

    void readMarkdownDocument(rootPath, entry.documentPath)
      .then((content) => {
        if (!cancelled) {
          setRequestState({
            requestKey,
            value: { markdown: content.content, status: 'ready' },
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRequestState({
            requestKey,
            value: {
              message:
                error instanceof Error ? error.message : '无法读取文档内容。',
              status: 'error',
            },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entry, requestKey, rootPath]);

  return {
    loadState,
    retry: () => setRetryRevision((current) => current + 1),
    retryRevision,
  };
}

function DailyNotesError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-sm font-medium">无法加载日程</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">{error}</p>
      <Button size="sm" type="button" variant="outline" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

function ToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        active && 'bg-accent text-foreground',
      )}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ViewModeButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-6 items-center rounded-[5px] px-2 text-xs text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        active && 'bg-background text-foreground shadow-xs',
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TaskSquare({ completed }: { completed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-muted-foreground/45 text-primary-foreground',
        completed && 'border-brand/75 bg-brand/75',
      )}
    >
      {completed ? <Check size={10} strokeWidth={2.5} /> : null}
    </span>
  );
}

function createDailyMonthCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leadingDays = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leadingDays + 1;

    if (day < 1 || day > daysInMonth) {
      return null;
    }

    return {
      date: formatDailyDate(new Date(year, monthIndex, day)),
      day,
    };
  });
}

function formatDailyMonthLabel(month: Date) {
  return `${month.getFullYear()}年${month.getMonth() + 1}月`;
}

function formatDailyInspectorDate(date: string) {
  const value = createDateFromDailyDate(date);
  return `${value.getMonth() + 1}月${value.getDate()}日 ${WEEKDAY_LONG_LABELS[value.getDay()]}`;
}

function formatDailyShortDate(date: string) {
  const value = createDateFromDailyDate(date);
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

function formatUpdatedTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

'use client';

import * as React from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import { MarkdownEditor } from '@/components/editor/markdown-editor';
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
  createDateFromDailyDate,
  formatDailyDate,
} from './daily-notes';
import { readMarkdownDocument } from './workspace-api';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import type {
  DailyNoteEntry,
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
            onExportDaily={onExportDaily}
            onOpenDaily={onOpenDaily}
            onRetryPreview={dailyPreview.retry}
          />
        </DialogContent>
      </Dialog>
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
  onSelectDate,
}: {
  entriesByDate: Map<string, DailyNoteEntry>;
  filteredEntryDates: Set<string>;
  isLoading: boolean;
  monthCells: Array<{ date: string; day: number } | null>;
  queryActive: boolean;
  selectedDate: string;
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
            <button
              aria-label={`${cell.date} 每日笔记`}
              aria-pressed={selected}
              className={cn(
                'group relative flex min-h-24 flex-col items-start justify-start overflow-hidden border-r border-b border-border/45 p-2.5 text-left outline-none transition-[background-color,box-shadow] hover:bg-accent/35 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 dark:border-muted-foreground/25',
                selected &&
                  'z-[1] bg-brand/[0.035] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_72%,transparent)]',
              )}
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
            >
              <span
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full bg-muted text-sm text-foreground/85 tabular-nums transition-colors',
                  selected && 'bg-brand text-white',
                )}
              >
                {cell.day}
              </span>
              {entry?.hasContent && queryMatch ? (
                <div className="mt-1.5 w-full min-w-0">
                  {entry.title ? (
                    <p className="truncate text-[13px] leading-5 font-medium text-foreground">
                      {entry.title}
                    </p>
                  ) : null}
                  {entry.excerpt ? (
                    <p className="daily-notes-calendar-cell-excerpt daily-notes-calendar-cell-preview-fade text-xs leading-[1.125rem] text-muted-foreground">
                      {entry.excerpt}
                    </p>
                  ) : null}
                  {entry.taskTotal > 0 ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                      <TaskSquare completed={entry.taskCompleted === entry.taskTotal} />
                      {entry.taskCompleted}/{entry.taskTotal}
                    </p>
                  ) : null}
                </div>
              ) : entry?.hasContent && queryActive ? (
                <span className="absolute right-2.5 bottom-2.5 size-1.5 rounded-full bg-muted-foreground/25" />
              ) : null}
            </button>
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
              <MarkdownEditor
                documentKey={`daily-preview:${entry.documentPath}:${entry.updatedAt}:${previewRevision}`}
                markdown={preview.markdown}
                pageWidthMode={pageWidthMode}
                readOnly
                workspaceRootPath={rootPath}
              />
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

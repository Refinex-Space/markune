'use client';

import * as React from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  ChevronRight,
  Clock3,
  FileUp,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { InboxDirectoryPicker } from './inbox-directory-picker';
import {
  formatInboxDateTime,
  formatInboxLocalDate,
  formatInboxLocalTime,
  getInboxActiveLane,
  type InboxActiveLane,
} from './inbox-utils';
import type { InboxController } from './use-inbox-controller';
import type {
  DailyNoteDocument,
  InboxCaptureListView,
  InboxCapturePriority,
  InboxCaptureStatus,
  InboxCaptureSummary,
  WorkspaceNode,
} from './workspace-types';

interface InboxSidebarProps {
  controller: InboxController;
  nodes: WorkspaceNode[];
  onDailyUpdated: (daily: DailyNoteDocument) => void;
  onOpenDaily: (daily: DailyNoteDocument) => void;
  onPromoted: (node: WorkspaceNode) => void;
}

const VIEW_OPTIONS: Array<{ id: InboxCaptureListView; label: string }> = [
  { id: 'active', label: '待处理' },
  { id: 'done', label: '已处理' },
  { id: 'archived', label: '已归档' },
];

const STATUS_LABELS: Record<InboxCaptureStatus, string> = {
  open: '未处理',
  processing: '处理中',
  done: '已处理',
  archived: '已归档',
};

const PRIORITY_LABELS: Record<InboxCapturePriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
};

const ACTIVE_LANES: Array<{ id: InboxActiveLane; label: string }> = [
  { id: 'open', label: '未处理' },
  { id: 'processing', label: '处理中' },
  { id: 'later', label: '稍后' },
];

function getPriorityDotClass(priority: InboxCapturePriority) {
  switch (priority) {
    case 'high':
      return 'bg-red-500';
    case 'normal':
      return 'bg-sky-500';
    case 'low':
      return 'bg-muted-foreground/35';
  }
}

export function InboxSidebar({
  controller,
  nodes,
  onDailyUpdated,
  onOpenDaily,
  onPromoted,
}: InboxSidebarProps) {
  const [now, setNow] = React.useState(() => Date.now());
  const [promoteItem, setPromoteItem] =
    React.useState<InboxCaptureSummary | null>(null);
  const [promoteTitle, setPromoteTitle] = React.useState('');
  const [promoteTarget, setPromoteTarget] = React.useState('');
  const [deleteItem, setDeleteItem] =
    React.useState<InboxCaptureSummary | null>(null);
  const lanes = React.useMemo(
    () =>
      buildLanes(
        controller.captures,
        controller.view,
        now,
        Boolean(controller.query.trim()),
      ),
    [controller.captures, controller.query, controller.view, now],
  );

  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function runAction(
    action: () => Promise<unknown>,
    successMessage?: string,
  ) {
    try {
      await action();
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error('操作失败', { description: getErrorMessage(error) });
    }
  }

  async function appendToDaily(item: InboxCaptureSummary) {
    try {
      const currentDate = new Date();
      const result = await controller.appendToDaily(
        item.id,
        formatInboxLocalDate(currentDate),
        formatInboxLocalTime(currentDate),
      );
      onDailyUpdated(result.dailyNote);
      toast.success('已追加到今日记录', {
        action: {
          label: '打开今日',
          onClick: () => onOpenDaily(result.dailyNote),
        },
      });
    } catch (error) {
      toast.error('追加到今日失败', { description: getErrorMessage(error) });
    }
  }

  async function promoteCapture() {
    if (!promoteItem || !promoteTitle.trim()) return;
    try {
      const result = await controller.promote(
        promoteItem.id,
        promoteTarget,
        promoteTitle.trim(),
      );
      setPromoteItem(null);
      toast.success('已提升为正式笔记');
      onPromoted(result.document.node);
    } catch (error) {
      toast.error('提升为笔记失败', { description: getErrorMessage(error) });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="inbox-sidebar">
      <div className="shrink-0 px-2 pb-2 pt-1.5">
        <div className="flex items-center gap-1">
          <nav
            aria-label="Inbox 状态"
            className="grid min-w-0 flex-1 grid-cols-3 rounded-md bg-sidebar-accent/55 p-0.5"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                aria-current={
                  controller.view === option.id ? 'page' : undefined
                }
                className={cn(
                  'h-6 rounded-[5px] px-1 text-[11px] transition-colors',
                  controller.view === option.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                type="button"
                onClick={() => void controller.setView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <Button
            aria-label="新建 Capture"
            className="size-7 shrink-0 text-muted-foreground"
            data-testid="inbox-new-capture-trigger"
            size="icon-sm"
            title="新建 Capture（⇧⌘I）"
            type="button"
            variant="ghost"
            onClick={() => {
              void controller.startNewCapture().catch((error) => {
                toast.error('无法新建 Capture', {
                  description: getErrorMessage(error),
                });
              });
            }}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {controller.loadingList && controller.captures.length === 0 ? (
          <SidebarEmpty
            icon={<LoaderCircle className="animate-spin" />}
            text="正在读取 Inbox"
          />
        ) : controller.error && controller.captures.length === 0 ? (
          <SidebarEmpty icon={<Inbox />} text={controller.error} />
        ) : controller.captures.length === 0 ? (
          <SidebarEmpty
            icon={<Inbox />}
            text={
              controller.query
                ? '没有匹配的 Capture'
                : controller.view === 'active'
                  ? 'Inbox 已经整理干净'
                  : '这里还没有内容'
            }
          />
        ) : (
          lanes.map((lane) => (
            <section key={lane.id} className="mb-1.5">
              <h2 className="flex h-6 items-center px-2 text-[10px] font-medium text-muted-foreground">
                {lane.label}
                <span className="ml-auto tabular-nums">{lane.items.length}</span>
              </h2>
              <div>
                {lane.items.map((item) => (
                  <CaptureRow
                    key={item.id}
                    active={controller.selectedId === item.id}
                    capture={item}
                    now={now}
                    onAppend={() => void appendToDaily(item)}
                    onArchive={() =>
                      void runAction(
                        () => controller.setStatus(item.id, 'archived'),
                        '已归档',
                      )
                    }
                    onUnarchive={() =>
                      void runAction(
                        () => controller.setStatus(item.id, 'open'),
                        '已取消归档',
                      )
                    }
                    onDelete={() => setDeleteItem(item)}
                    onPriorityChange={(priority) =>
                      void runAction(() => controller.setPriority(item.id, priority))
                    }
                    onPromote={() => {
                      setPromoteTitle(item.title);
                      setPromoteTarget('');
                      setPromoteItem(item);
                    }}
                    onSelect={() => void controller.selectCapture(item.id)}
                    onStatusChange={(status) =>
                      void runAction(() => controller.setStatus(item.id, status))
                    }
                    onWake={() =>
                      void runAction(() => controller.wake(item.id), '已恢复到待处理')
                    }
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {controller.issues.length > 0 ? (
          <p className="mx-2 mt-2 text-[10px] leading-4 text-destructive" role="alert">
            有 {controller.issues.length} 个 Capture 无法读取：
            {controller.issues[0]?.fileName}
          </p>
        ) : null}
      </div>

      <Dialog open={Boolean(promoteItem)} onOpenChange={(open) => !open && setPromoteItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>提升为正式笔记</DialogTitle>
            <DialogDescription>
              Capture 会保留在“已处理”中，并记录新笔记的位置。
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            笔记标题
            <Input
              autoFocus
              value={promoteTitle}
              onChange={(event) => setPromoteTitle(event.currentTarget.value)}
            />
          </label>
          <div className="grid gap-1.5 text-xs text-muted-foreground">
            <span>保存位置</span>
            <InboxDirectoryPicker
              nodes={nodes}
              value={promoteTarget}
              onValueChange={setPromoteTarget}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteItem(null)}>取消</Button>
            <Button
              disabled={!promoteTitle.trim() || controller.saving}
              onClick={() => void promoteCapture()}
            >
              提升为笔记
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除这条 Capture？</AlertDialogTitle>
            <AlertDialogDescription>
              只会删除 Inbox 源文件，不会删除已经生成的笔记或 Daily 内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteItem) return;
                const item = deleteItem;
                setDeleteItem(null);
                void runAction(() => controller.remove(item.id), '已永久删除');
              }}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CaptureRow({
  active,
  capture,
  now,
  onAppend,
  onArchive,
  onDelete,
  onPriorityChange,
  onPromote,
  onSelect,
  onStatusChange,
  onUnarchive,
  onWake,
}: {
  active: boolean;
  capture: InboxCaptureSummary;
  now: number;
  onAppend: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPriorityChange: (priority: InboxCapturePriority) => void;
  onPromote: () => void;
  onSelect: () => void;
  onStatusChange: (status: InboxCaptureStatus) => void;
  onUnarchive: () => void;
  onWake: () => void;
}) {
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const lane = getInboxActiveLane(capture, now);
  const snoozed = lane === 'later';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={triggerRef}
          className={cn(
            'group relative flex h-10 items-center rounded-md transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/70',
          )}
          data-testid="inbox-capture-row"
        >
          <button
            className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left"
            type="button"
            onClick={onSelect}
          >
            <span
              aria-label={`${PRIORITY_LABELS[capture.priority]}优先级`}
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                getPriorityDotClass(capture.priority),
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {capture.title}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                {snoozed && capture.snoozedUntil ? (
                  <>
                    <Clock3 className="size-2.5" />
                    {formatInboxDateTime(capture.snoozedUntil)}
                  </>
                ) : (
                  formatInboxDateTime(capture.updatedAt)
                )}
              </span>
            </span>
          </button>
          <button
            aria-label={`整理 ${capture.title}`}
            className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              triggerRef.current?.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  clientX: event.clientX,
                  clientY: event.clientY,
                }),
              );
            }}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <RefreshCw />状态
            <span className="ml-auto mr-1 text-[10px] text-muted-foreground">
              {STATUS_LABELS[capture.status]}
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={capture.status}
              onValueChange={(value) => onStatusChange(value as InboxCaptureStatus)}
            >
              <ContextMenuRadioItem value="open">未处理</ContextMenuRadioItem>
              <ContextMenuRadioItem value="processing">处理中</ContextMenuRadioItem>
              <ContextMenuRadioItem value="done">已处理</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="flex size-4 items-center justify-center">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  getPriorityDotClass(capture.priority),
                )}
              />
            </span>
            优先级
            <span className="ml-auto mr-1 text-[10px] text-muted-foreground">
              {PRIORITY_LABELS[capture.priority]}
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={capture.priority}
              onValueChange={(value) =>
                onPriorityChange(value as InboxCapturePriority)
              }
            >
              <ContextMenuRadioItem value="high">高</ContextMenuRadioItem>
              <ContextMenuRadioItem value="normal">普通</ContextMenuRadioItem>
              <ContextMenuRadioItem value="low">低</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {snoozed ? (
          <ContextMenuItem onSelect={onWake}>
            <Clock3 />恢复待处理
          </ContextMenuItem>
        ) : null}

        {capture.status === 'open' || capture.status === 'processing' ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger><ChevronRight />流转</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                <ContextMenuItem onSelect={onPromote}><FileUp />提升为笔记</ContextMenuItem>
                <ContextMenuItem onSelect={onAppend}><CalendarPlus />追加到今日</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        ) : null}
        {capture.status === 'archived' ? (
          <ContextMenuItem onSelect={onUnarchive}>
            <ArchiveRestore />取消归档
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={onArchive}><Archive />归档</ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />永久删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SidebarEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
      <span className="[&_svg]:size-4">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function buildLanes(
  captures: InboxCaptureSummary[],
  view: InboxCaptureListView,
  now: number,
  searching: boolean,
) {
  if (searching) {
    return [{ id: 'search', label: '搜索结果', items: captures }];
  }
  if (view !== 'active') {
    return [{ id: view, label: view === 'done' ? '已处理' : '已归档', items: captures }];
  }
  return ACTIVE_LANES.map((lane) => ({
    ...lane,
    items: captures.filter((item) => getInboxActiveLane(item, now) === lane.id),
  })).filter((lane) => lane.items.length > 0);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

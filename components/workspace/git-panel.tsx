'use client';

import * as React from 'react';
import {
  Check,
  FileDiff,
  GitBranch,
  GitCommit,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { GitChange, GitProbe, GitStatus } from './workspace-types';

interface GitPanelProps {
  error: string | null;
  isLoading: boolean;
  probe: GitProbe | null;
  selectedPath: string | null;
  selectedPaths: Set<string>;
  status: GitStatus | null;
  onCommit: (message: string) => void;
  onCommitAndPush: (message: string) => void;
  onCommitSingleFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onInitRepository: () => void;
  onRefresh: () => void;
  onRevertFile: (path: string) => void;
  onSelectChange: (path: string, checked: boolean) => void;
  onSelectFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onStageSelected: () => void;
  onUnstageFile: (path: string) => void;
  onUnstageSelected: () => void;
}

export function GitPanel({
  error,
  isLoading,
  probe,
  selectedPath,
  selectedPaths,
  status,
  onCommit,
  onCommitAndPush,
  onCommitSingleFile,
  onDeleteFile,
  onInitRepository,
  onRefresh,
  onRevertFile,
  onSelectChange,
  onSelectFile,
  onStageFile,
  onStageSelected,
  onUnstageFile,
  onUnstageSelected,
}: GitPanelProps) {
  const [message, setMessage] = React.useState('');
  const [pendingDeletePath, setPendingDeletePath] = React.useState<string | null>(null);
  const [pendingRevertPath, setPendingRevertPath] = React.useState<string | null>(null);
  const commitMessageRef = React.useRef<HTMLTextAreaElement>(null);
  const focusCommitMessageAfterMenuCloseRef = React.useRef(false);
  const selectedCount = selectedPaths.size;
  const canCommit = message.trim().length > 0 && selectedCount > 0;

  if (!probe) {
    return <PanelShell title="Git">正在检测 Git 状态</PanelShell>;
  }

  if (!probe.gitAvailable) {
    return (
      <PanelShell title="Git">
        <p className="text-sm text-muted-foreground">未检测到本机 Git 命令。</p>
      </PanelShell>
    );
  }

  if (!probe.isRepository) {
    return (
      <PanelShell title="Git">
        <div className="rounded-lg border border-dashed p-4">
          <h3 className="text-sm font-semibold">当前工作区还不是 Git 仓库</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            初始化后可以在这里查看变更、选择文件并提交。
          </p>
          <button
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 hover:shadow-md active:translate-y-px active:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            type="button"
            onClick={onInitRepository}
          >
            初始化 Git 仓库
          </button>
        </div>
      </PanelShell>
    );
  }

  const changes = status?.changes ?? [];
  const stagedChanges = changes.filter(hasStagedChange);
  const unstagedChanges = changes.filter(hasUnstagedChange);

  return (
    <>
      <PanelShell
        action={
          <GitPanelToolbar
            isLoading={isLoading}
            selectedCount={selectedCount}
            onRefresh={onRefresh}
            onStageSelected={onStageSelected}
            onUnstageSelected={onUnstageSelected}
          />
        }
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch size={14} />
          <span className="truncate">{status?.branch ?? probe.branch ?? 'HEAD'}</span>
          {status && status.ahead > 0 ? <span>领先 {status.ahead}</span> : null}
          {status && status.behind > 0 ? <span>落后 {status.behind}</span> : null}
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="git-panel-scroll min-h-0 flex-1 overflow-auto pr-1">
          {changes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">没有本地变更</p>
          ) : (
            <div className="space-y-4">
              <GitChangeGroup
                changes={stagedChanges}
                focusCommitMessageAfterMenuCloseRef={focusCommitMessageAfterMenuCloseRef}
                kind="staged"
                selectedPath={selectedPath}
                selectedPaths={selectedPaths}
                title="已暂存"
                onCommitSingleFile={onCommitSingleFile}
                onDeleteFile={setPendingDeletePath}
                onRevertFile={setPendingRevertPath}
                onSelectChange={onSelectChange}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onCloseAutoFocusCommitMessage={() => {
                  commitMessageRef.current?.focus();
                }}
              />
              <GitChangeGroup
                changes={unstagedChanges}
                focusCommitMessageAfterMenuCloseRef={focusCommitMessageAfterMenuCloseRef}
                kind="unstaged"
                selectedPath={selectedPath}
                selectedPaths={selectedPaths}
                title="未暂存"
                onCommitSingleFile={onCommitSingleFile}
                onDeleteFile={setPendingDeletePath}
                onRevertFile={setPendingRevertPath}
                onSelectChange={onSelectChange}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onCloseAutoFocusCommitMessage={() => {
                  commitMessageRef.current?.focus();
                }}
              />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <label className="block text-xs text-muted-foreground" htmlFor="git-commit-message">
            提交信息
          </label>
          <textarea
            ref={commitMessageRef}
            className="min-h-28 w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            id="git-commit-message"
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              className="flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-150 hover:bg-muted active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={!canCommit || isLoading}
              type="button"
              onClick={() => onCommit(message)}
            >
              <GitCommit size={15} />
              提交
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 hover:shadow-md active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary disabled:hover:shadow-sm disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={!canCommit || isLoading}
              type="button"
              onClick={() => onCommitAndPush(message)}
            >
              <GitBranch size={15} />
              提交并推送
            </button>
          </div>
        </div>
      </PanelShell>
      <ConfirmGitFileActionDialog
        actionLabel="确认回滚"
        description={
          pendingRevertPath
            ? `这会放弃 ${pendingRevertPath} 的本地修改，无法从当前界面撤销。`
            : ''
        }
        open={pendingRevertPath !== null}
        title="回滚此文件？"
        onConfirm={() => {
          if (pendingRevertPath) {
            onRevertFile(pendingRevertPath);
          }
          setPendingRevertPath(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRevertPath(null);
          }
        }}
      />
      <ConfirmGitFileActionDialog
        actionLabel="确认删除"
        destructive
        description={
          pendingDeletePath
            ? `这会删除 ${pendingDeletePath}，未提交内容会丢失。`
            : ''
        }
        open={pendingDeletePath !== null}
        title="删除此文件？"
        onConfirm={() => {
          if (pendingDeletePath) {
            onDeleteFile(pendingDeletePath);
          }
          setPendingDeletePath(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletePath(null);
          }
        }}
      />
    </>
  );
}

function GitPanelToolbar({
  isLoading,
  selectedCount,
  onRefresh,
  onStageSelected,
  onUnstageSelected,
}: {
  isLoading: boolean;
  selectedCount: number;
  onRefresh: () => void;
  onStageSelected: () => void;
  onUnstageSelected: () => void;
}) {
  const disabled = selectedCount === 0 || isLoading;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <GitPanelToolbarButton
          ariaLabel="暂存已选文件"
          disabled={disabled}
          tooltip="暂存已选文件"
          onClick={onStageSelected}
        >
          <Plus size={15} />
        </GitPanelToolbarButton>
        <GitPanelToolbarButton
          ariaLabel="取消暂存已选文件"
          disabled={disabled}
          tooltip="取消暂存已选文件"
          onClick={onUnstageSelected}
        >
          <Minus size={15} />
        </GitPanelToolbarButton>
        <GitPanelToolbarButton
          ariaLabel="刷新 Git 状态"
          disabled={isLoading}
          tooltip="刷新 Git 状态"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
        </GitPanelToolbarButton>
      </div>
    </TooltipProvider>
  );
}

function GitPanelToolbarButton({
  ariaLabel,
  children,
  disabled,
  tooltip,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={ariaLabel}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          disabled={disabled}
          type="button"
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function GitChangeGroup({
  changes,
  focusCommitMessageAfterMenuCloseRef,
  kind,
  selectedPath,
  selectedPaths,
  title,
  onCloseAutoFocusCommitMessage,
  onCommitSingleFile,
  onDeleteFile,
  onRevertFile,
  onSelectChange,
  onSelectFile,
  onStageFile,
  onUnstageFile,
}: {
  changes: GitChange[];
  focusCommitMessageAfterMenuCloseRef: React.MutableRefObject<boolean>;
  kind: 'staged' | 'unstaged';
  selectedPath: string | null;
  selectedPaths: Set<string>;
  title: string;
  onCloseAutoFocusCommitMessage: () => void;
  onCommitSingleFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRevertFile: (path: string) => void;
  onSelectChange: (path: string, checked: boolean) => void;
  onSelectFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
}) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>{title}</span>
        <span>{changes.length}</span>
      </div>
      <ul className="space-y-0.5">
        {changes.map((change) => (
          <GitChangeRow
            key={`${kind}-${change.path}`}
            change={change}
            focusCommitMessageAfterMenuCloseRef={focusCommitMessageAfterMenuCloseRef}
            groupKind={kind}
            isSelected={selectedPath === change.path}
            isChecked={selectedPaths.has(change.path)}
            onCloseAutoFocusCommitMessage={onCloseAutoFocusCommitMessage}
            onCommitSingleFile={onCommitSingleFile}
            onDeleteFile={onDeleteFile}
            onRevertFile={onRevertFile}
            onSelectChange={onSelectChange}
            onSelectFile={onSelectFile}
            onStageFile={onStageFile}
            onUnstageFile={onUnstageFile}
          />
        ))}
      </ul>
    </section>
  );
}

function GitChangeRow({
  change,
  focusCommitMessageAfterMenuCloseRef,
  groupKind,
  isChecked,
  isSelected,
  onCloseAutoFocusCommitMessage,
  onCommitSingleFile,
  onDeleteFile,
  onRevertFile,
  onSelectChange,
  onSelectFile,
  onStageFile,
  onUnstageFile,
}: {
  change: GitChange;
  focusCommitMessageAfterMenuCloseRef: React.MutableRefObject<boolean>;
  groupKind: 'staged' | 'unstaged';
  isChecked: boolean;
  isSelected: boolean;
  onCloseAutoFocusCommitMessage: () => void;
  onCommitSingleFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRevertFile: (path: string) => void;
  onSelectChange: (path: string, checked: boolean) => void;
  onSelectFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
}) {
  const fileInfo = getGitFileInfo(change.path);

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
              isSelected && 'bg-muted text-foreground',
            )}
            role="button"
            tabIndex={0}
            onClick={() => onSelectFile(change.path)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectFile(change.path);
              }
            }}
          >
            <input
              aria-label={`选择 ${change.path}`}
              checked={isChecked}
              type="checkbox"
              onChange={(event) =>
                onSelectChange(change.path, event.currentTarget.checked)
              }
              onClick={(event) => event.stopPropagation()}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm leading-5">{fileInfo.name}</span>
              <span className="block truncate text-xs leading-4 text-muted-foreground">
                {fileInfo.directory || './'}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {renderChangeBadge(change)}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-44"
          onCloseAutoFocus={(event) => {
            if (focusCommitMessageAfterMenuCloseRef.current) {
              event.preventDefault();
              focusCommitMessageAfterMenuCloseRef.current = false;
              onCloseAutoFocusCommitMessage();
            }
          }}
        >
          <ContextMenuItem
            onSelect={() => {
              focusCommitMessageAfterMenuCloseRef.current = true;
              onCommitSingleFile(change.path);
            }}
          >
            <GitCommit />
            提交
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onSelectFile(change.path)}>
            <FileDiff />
            显示差异
          </ContextMenuItem>
          {groupKind === 'staged' ? (
            <ContextMenuItem onSelect={() => onUnstageFile(change.path)}>
              <Minus />
              取消暂存
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => onStageFile(change.path)}>
              <Plus />
              暂存
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onRevertFile(change.path)}>
            <RotateCcw />
            回滚
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onDeleteFile(change.path)}
          >
            <Trash2 />
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

function PanelShell({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <aside className="flex h-full flex-col gap-3 rounded-lg border bg-background p-3">
      <header className="flex items-center justify-between border-b pb-3">
        {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
        {action}
      </header>
      {children}
    </aside>
  );
}

function ConfirmGitFileActionDialog({
  actionLabel,
  description,
  destructive = false,
  open,
  title,
  onConfirm,
  onOpenChange,
}: {
  actionLabel: string;
  description: string;
  destructive?: boolean;
  open: boolean;
  title: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isChangeStaged(change: GitChange) {
  return change.staged || (change.indexStatus.length > 0 && change.indexStatus !== '?');
}

function hasStagedChange(change: GitChange) {
  return isChangeStaged(change);
}

function hasUnstagedChange(change: GitChange) {
  return (
    change.changeType === 'untracked' ||
    change.workingTreeStatus.length > 0 ||
    (!hasStagedChange(change) && change.indexStatus === '?')
  );
}

function getGitFileInfo(path: string) {
  const parts = path.split('/').filter(Boolean);
  const name = parts.at(-1) ?? path;
  const directory = parts.slice(0, -1).join('/');

  return { directory, name };
}

function renderChangeBadge(change: GitChange) {
  if (change.changeType === 'untracked') {
    return '新增';
  }

  if (change.staged) {
    return <Check size={13} />;
  }

  return change.workingTreeStatus || change.indexStatus || '改';
}

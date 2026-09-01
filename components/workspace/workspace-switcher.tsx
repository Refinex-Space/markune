'use client';

import * as React from 'react';
import {
  ChevronDown,
  Clock3,
  FolderOpen,
  FolderPlus,
  Loader2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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

import { toUserAbsolutePath } from './workspace-paths';
import type { WorkspaceHistoryItem, WorkspaceSnapshot } from './workspace-types';

interface WorkspaceSwitcherProps {
  compact?: boolean;
  currentWorkspace: WorkspaceSnapshot | null;
  history: WorkspaceHistoryItem[];
  isLoading: boolean;
  onChooseWorkspaceParent: () => Promise<string | null>;
  onCreateWorkspace: (
    parentPath: string,
    workspaceName: string,
  ) => Promise<void>;
  onOpenWorkspace: () => void;
  onRemoveWorkspace: (rootPath: string) => void;
  onSwitchWorkspace: (rootPath: string) => void;
}

export function WorkspaceSwitcher({
  compact = false,
  currentWorkspace,
  history,
  isLoading,
  onChooseWorkspaceParent,
  onCreateWorkspace,
  onOpenWorkspace,
  onRemoveWorkspace,
  onSwitchWorkspace,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [parentPath, setParentPath] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const workspaceNameId = React.useId();
  const parentPathId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const title = currentWorkspace?.rootName ?? '打开工作区';
  const subtitle = currentWorkspace
    ? toUserAbsolutePath(currentWorkspace.rootPath)
    : '选择目录开始';

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const canCreateWorkspace =
    workspaceName.trim().length > 0 && parentPath.trim().length > 0;

  async function handleChooseParent() {
    const selected = await onChooseWorkspaceParent();

    if (selected) {
      setParentPath(toUserAbsolutePath(selected));
      setCreateError(null);
    }
  }

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateWorkspace) {
      setCreateError('请填写工作区名称和所在目录。');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await onCreateWorkspace(parentPath.trim(), workspaceName.trim());
      setWorkspaceName('');
      setParentPath('');
      setIsCreateOpen(false);
    } catch (error) {
      setCreateError(getErrorMessage(error, '无法创建工作区，请稍后重试。'));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative', compact ? 'min-w-0 flex-1' : 'px-3 pb-2')}
    >
      {isOpen ? (
        <div
          data-testid="workspace-switcher-menu"
          className={cn(
            'absolute top-[calc(100%+4px)] z-30 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-none',
            compact ? 'left-0 right-0' : 'left-3 right-3',
          )}
        >
          <div className="p-1.5">
            {history.length > 0 ? (
              <>
                <div className="flex items-center gap-2 px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
                  <Clock3 size={13} />
                  最近工作区
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.rootPath}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted',
                        item.rootPath === currentWorkspace?.rootPath && 'bg-muted',
                      )}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onSwitchWorkspace(item.rootPath);
                        }}
                      >
                        <span className="block truncate font-medium">
                          {item.rootName}
                        </span>
                      </button>
                      <button
                        aria-label={`移除工作区 ${item.rootName}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        type="button"
                        onClick={() => onRemoveWorkspace(item.rootPath)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            <div
              className={cn(
                'grid gap-0.5',
                history.length > 0 && 'mt-1 border-t pt-1',
              )}
            >
              <Button
                className="w-full justify-start"
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  onOpenWorkspace();
                }}
              >
                <FolderOpen size={15} />
                {currentWorkspace ? '选择工作区' : '打开已有工作区'}
              </Button>
              <Button
                className="w-full justify-start"
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsOpen(false);
                  setIsCreateOpen(true);
                }}
              >
                <FolderPlus size={15} />
                新建工作区
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        aria-expanded={isOpen}
        aria-label="打开工作区菜单"
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md text-left transition-colors hover:bg-sidebar-accent',
          compact ? 'h-9 px-1.5 py-1' : 'min-h-10 px-2 py-1.5',
        )}
        disabled={isLoading}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {compact ? null : (
            <span className="block truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180',
          )}
          size={15}
        />
      </button>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={handleCreateWorkspace}>
            <DialogHeader>
              <DialogTitle>新建工作区</DialogTitle>
              <DialogDescription>
                在指定目录下创建一个新的 Markune 工作区。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <label
                className="text-sm font-medium"
                htmlFor={workspaceNameId}
              >
                工作区名称
              </label>
              <Input
                id={workspaceNameId}
                autoFocus
                value={workspaceName}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  setCreateError(null);
                }}
              />
              <label className="text-sm font-medium" htmlFor={parentPathId}>
                所在目录
              </label>
              <div className="flex gap-2">
                <Input
                  id={parentPathId}
                  value={parentPath}
                  onChange={(event) => {
                    setParentPath(event.target.value);
                    setCreateError(null);
                  }}
                />
                <Button
                  className="shrink-0"
                  type="button"
                  variant="outline"
                  onClick={() => void handleChooseParent()}
                >
                  <FolderOpen size={14} />
                  选择所在目录
                </Button>
              </div>
              {createError ? (
                <p className="text-xs text-destructive">{createError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                disabled={isCreating}
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                取消
              </Button>
              <Button disabled={!canCreateWorkspace || isCreating} type="submit">
                {isCreating ? <Loader2 className="animate-spin" size={14} /> : null}
                创建并打开
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

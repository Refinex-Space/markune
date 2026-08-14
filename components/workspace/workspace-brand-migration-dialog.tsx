'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { PendingWorkspaceBrandMigration } from './use-workspace';

interface WorkspaceBrandMigrationDialogProps {
  migration: PendingWorkspaceBrandMigration | null;
  onCancel: () => void;
  onMigrate: () => Promise<unknown>;
}

export function WorkspaceBrandMigrationDialog({
  migration,
  onCancel,
  onMigrate,
}: WorkspaceBrandMigrationDialogProps) {
  const [isMigrating, setIsMigrating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!migration) {
    return null;
  }

  const isConflict = migration.state === 'conflict';

  async function handleMigrate() {
    setIsMigrating(true);
    setError(null);
    try {
      await onMigrate();
    } catch (migrationError) {
      setError(getErrorMessage(migrationError));
      setIsMigrating(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isMigrating) {
          onCancel();
        }
      }}
    >
      <DialogContent
        aria-describedby="workspace-brand-migration-description"
        className="sm:max-w-md"
        data-testid="workspace-brand-migration-dialog"
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
      >
        <DialogHeader>
          <DialogTitle>
            {isConflict ? '工作区数据目录存在冲突' : '迁移工作区数据'}
          </DialogTitle>
          <DialogDescription id="workspace-brand-migration-description">
            {isConflict ? (
              '检测到新旧数据目录同时存在，请先确认目录归属。备份后仅保留其中一个目录再重新打开。Markune 不会自动删除、合并或覆盖数据。'
            ) : (
              <span aria-label="数据目录从 .madora 迁移为 .markune">
                此工作区仍使用{' '}
                <span className="font-mono text-foreground">.madora</span>
                {' '}格式。迁移为{' '}
                <span className="font-mono text-foreground">.markune</span>
                {' '}后即可打开；会创建 SHA-256 备份，失败可自动恢复，且仅更新应用链接。
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <p
          className="break-all font-mono text-xs text-muted-foreground"
          title={migration.rootPath}
        >
          {migration.rootPath}
        </p>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="border-t-0 bg-transparent">
          <Button disabled={isMigrating} variant="outline" onClick={onCancel}>
            {isConflict ? '关闭' : '稍后处理'}
          </Button>
          {isConflict ? null : (
            <Button disabled={isMigrating} onClick={() => void handleMigrate()}>
              {isMigrating ? <Loader2 className="animate-spin" size={14} /> : null}
              {isMigrating ? '正在迁移…' : '迁移并打开'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return '迁移失败，工作区未打开。请检查备份提示后重试。';
}

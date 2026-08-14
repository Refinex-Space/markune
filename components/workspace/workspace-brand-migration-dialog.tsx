'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

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
        data-testid="workspace-brand-migration-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {isConflict ? '工作区数据目录存在冲突' : 'Madora 已更名为 Markune'}
          </DialogTitle>
          <DialogDescription id="workspace-brand-migration-description">
            {isConflict
              ? '当前工作区同时存在 .madora 和 .markune。为避免覆盖数据，Markune 不会自动合并这两个目录。'
              : '此工作区仍使用旧版数据格式。迁移会将 .madora 安全转换为 .markune，并更新由应用生成的资源和图稿链接。'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm text-muted-foreground">
          <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
            {migration.rootPath}
          </p>
          {isConflict ? (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <p>
                请先手动备份并确认两个目录的归属，再保留其中一个。Markune
                不会在无法判断所有权时删除或覆盖数据。
              </p>
            </div>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              <li>迁移前创建带 SHA-256 清单的原文备份。</li>
              <li>失败时自动恢复旧目录和已修改文档。</li>
              <li>不会替换用户正文中普通的 Madora 品牌文字。</li>
              <li>Git 工作区会正常显示目录和链接迁移产生的变更。</li>
            </ul>
          )}
          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={isMigrating} variant="outline" onClick={onCancel}>
            {isConflict ? '关闭' : '暂不迁移'}
          </Button>
          {isConflict ? null : (
            <Button disabled={isMigrating} onClick={() => void handleMigrate()}>
              {isMigrating ? <Loader2 className="animate-spin" size={14} /> : null}
              {isMigrating ? '正在安全迁移…' : '安全迁移并打开'}
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

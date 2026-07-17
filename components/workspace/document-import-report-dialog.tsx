'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface DocumentImportReportItem {
  fileName: string;
  message?: string;
  status: 'failed' | 'success';
  warnings: string[];
}

export function DocumentImportReportDialog({
  items,
  open,
  onOpenChange,
}: {
  items: DocumentImportReportItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const successCount = items.filter((item) => item.status === 'success').length;
  const failedCount = items.length - successCount;
  const warningCount = items.reduce(
    (count, item) => count + item.warnings.length,
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(720px,calc(100vh-40px))] w-[min(680px,calc(100vw-40px))] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>文档导入报告</DialogTitle>
          <DialogDescription>
            成功 {successCount} 个，失败 {failedCount} 个，警告 {warningCount} 条
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto px-5 pb-5">
          {items.map((item, index) => {
            const hasWarnings = item.warnings.length > 0;
            const Icon =
              item.status === 'failed'
                ? XCircle
                : hasWarnings
                  ? AlertTriangle
                  : CheckCircle2;

            return (
              <section
                key={`${item.fileName}:${index}`}
                className="rounded-lg border bg-muted/20 p-3"
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      item.status === 'failed'
                        ? 'text-destructive'
                        : hasWarnings
                          ? 'text-amber-600'
                          : 'text-emerald-600',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.fileName}</p>
                    {item.message ? (
                      <p className="mt-1 text-sm text-destructive">{item.message}</p>
                    ) : null}
                    {item.warnings.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                        {item.warnings.map((warning, warningIndex) => (
                          <li key={`${warning}:${warningIndex}`}>• {warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

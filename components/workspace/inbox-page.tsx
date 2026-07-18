'use client';

import * as React from 'react';
import { Inbox, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

import type {
  InboxController,
  InboxSaveState,
} from './use-inbox-controller';
import type { PageWidthMode } from './workspace-types';

interface InboxPageProps {
  controller: InboxController;
  pageWidthMode: PageWidthMode;
  rootPath: string;
}

const SAVE_STATE_LABELS: Record<InboxSaveState, string> = {
  dirty: '未保存',
  error: '保存失败',
  idle: '已保存',
  saved: '已保存',
  saving: '保存中…',
};

export function InboxPage({
  controller,
  pageWidthMode,
  rootPath,
}: InboxPageProps) {
  const editorRegionRef = React.useRef<HTMLDivElement>(null);
  const capture = controller.capture;
  const editingNewCapture = controller.newCaptureActive;
  const hasEditor = editingNewCapture || Boolean(capture);

  React.useEffect(() => {
    if (!editingNewCapture) return;
    const frame = window.requestAnimationFrame(() => {
      editorRegionRef.current
        ?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [controller.newCaptureVersion, editingNewCapture]);

  return (
    <section
      className="relative h-full min-h-0 overflow-hidden bg-background"
      data-testid="inbox-page"
    >
      {hasEditor ? (
        <>
          <div ref={editorRegionRef} className="h-full min-h-0">
            {!editingNewCapture && controller.loadingCapture ? (
              <EmptyState
                icon={<LoaderCircle className="animate-spin" />}
                text="正在读取 Capture"
              />
            ) : (
              <MarkdownEditor
                documentKey={
                  editingNewCapture
                    ? `inbox:new:${controller.newCaptureVersion}`
                    : `inbox:${capture?.id ?? 'empty'}`
                }
                markdown={
                  editingNewCapture
                    ? controller.newCaptureBody
                    : (capture?.body ?? '')
                }
                pageWidthMode={pageWidthMode}
                workspaceRootPath={rootPath}
                onMarkdownChange={
                  editingNewCapture
                    ? controller.updateNewCaptureBody
                    : controller.updateBody
                }
                onSaveRequested={() => {
                  void controller.saveCurrent().catch((error) => {
                    toast.error('保存失败', {
                      description: getErrorMessage(error),
                    });
                  });
                }}
              />
            )}
          </div>
          <span
            aria-live="polite"
            className="pointer-events-none absolute bottom-3 right-4 z-10 rounded bg-background/85 px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm"
            data-testid="inbox-save-status"
          >
            {SAVE_STATE_LABELS[controller.saveState]}
          </span>
        </>
      ) : (
        <EmptyState
          icon={
            controller.loadingList || controller.loadingCapture ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Inbox />
            )
          }
          text={
            controller.loadingList || controller.loadingCapture
              ? '正在读取 Inbox'
              : controller.captures.length > 0
                ? '从左侧选择一条 Capture'
                : '点击左侧 + 记下一个想法'
          }
        />
      )}
    </section>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <span className="[&_svg]:size-5">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

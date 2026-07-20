'use client';

import * as React from 'react';
import { ExternalLink, FileText, RotateCcw, X } from 'lucide-react';

import { MarkdownEditor } from '@/components/editor/markdown-editor';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { readMarkdownDocument } from './workspace-api';
import type { PageWidthMode, WorkspaceNode } from './workspace-types';

type PreviewLoadState =
  | { status: 'loading' }
  | { message: string; status: 'error' }
  | { markdown: string; status: 'ready' };

interface PreviewRequestState {
  requestKey: string;
  value: PreviewLoadState;
}

interface AiDocumentPreviewProps {
  document: WorkspaceNode;
  markdownOverride: string | null;
  pageWidthMode: PageWidthMode;
  workspaceRootPath: string | null;
  onClose: () => void;
  onOpenInEditor: () => void;
}

export function AiDocumentPreview({
  document,
  markdownOverride,
  pageWidthMode,
  workspaceRootPath,
  onClose,
  onOpenInEditor,
}: AiDocumentPreviewProps) {
  const [retryRevision, setRetryRevision] = React.useState(0);
  const [requestState, setRequestState] = React.useState<PreviewRequestState>({
    requestKey: '',
    value: { status: 'loading' },
  });
  const requestKey = `${workspaceRootPath ?? ''}\u0000${document.absolutePath}\u0000${retryRevision}`;
  const loadState: PreviewLoadState =
    markdownOverride !== null
      ? { markdown: markdownOverride, status: 'ready' }
      : !workspaceRootPath
        ? { message: '当前工作区不可用。', status: 'error' }
        : requestState.requestKey === requestKey
          ? requestState.value
          : { status: 'loading' };

  React.useEffect(() => {
    if (markdownOverride !== null || !workspaceRootPath) {
      return;
    }

    let cancelled = false;

    void readMarkdownDocument(workspaceRootPath, document.absolutePath)
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
  }, [document.absolutePath, markdownOverride, requestKey, workspaceRootPath]);

  const title = document.title || document.name.replace(/\.(md|mdx)$/i, '');

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      data-state={loadState.status}
      data-testid="ai-document-preview"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <FileText className="shrink-0 text-muted-foreground" size={15} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium" title={title}>
            {title}
          </div>
          <div
            className="truncate text-[10px] text-muted-foreground"
            title={document.relativePath}
          >
            {document.relativePath}
          </div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="在编辑器中打开"
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                type="button"
                onClick={onOpenInEditor}
              >
                <ExternalLink size={13} />
                <span>在编辑器中打开</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={7}>
              切换到正式文档标签页
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="关闭文档预览"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                type="button"
                onClick={onClose}
              >
                <X size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={7}>
              关闭预览
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loadState.status === 'loading' ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            正在打开文档…
          </div>
        ) : loadState.status === 'error' ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-xs">
              <p className="text-sm font-medium">无法打开文档</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {loadState.message}
              </p>
              <button
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-xs transition-colors hover:bg-accent"
                type="button"
                onClick={() => setRetryRevision((current) => current + 1)}
              >
                <RotateCcw size={13} />
                重试
              </button>
            </div>
          </div>
        ) : (
          <div className="relative h-full min-h-0">
            <MarkdownEditor
              documentKey={`ai-preview:${document.absolutePath}`}
              markdown={loadState.markdown}
              pageWidthMode={pageWidthMode}
              readOnly
              workspaceRootPath={workspaceRootPath}
            />
          </div>
        )}
      </div>
    </section>
  );
}

'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  PREVIEW_WORKSPACE_DOCUMENT_EVENT,
  type PreviewWorkspaceDocumentDetail,
} from '@/components/editor/workspace-document-link';

import { createWorkspaceDocumentIndex } from '@/components/editor/workspace-document-index';

import { AiDocumentPreview } from './ai-document-preview';
import styles from './document-reference-drawer.module.css';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import type { PageWidthMode, WorkspaceNode } from './workspace-types';

export function documentReferenceWidth(containerWidth: number, ratio: number) {
  const max = Math.min(960, Math.max(0, containerWidth - 32), containerWidth * 0.75);
  const min = Math.min(320, max);
  return { min, max, width: Math.min(max, Math.max(min, containerWidth * ratio)) };
}

interface DocumentReferenceDrawerProps {
  nodes: WorkspaceNode[];
  workspaceRootPath: string;
  pageWidthMode: PageWidthMode;
  getDraft: (documentPath: string) => string | null;
  onOpenDocument: (location: PreviewWorkspaceDocumentDetail) => Promise<boolean>;
}

export function DocumentReferenceDrawer({
  nodes,
  workspaceRootPath,
  pageWidthMode,
  getDraft,
  onOpenDocument,
}: DocumentReferenceDrawerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const [request, setRequest] =
    React.useState<PreviewWorkspaceDocumentDetail | null>(null);
  const requestRef = React.useRef(request);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [ratio, setRatio] = React.useState(1 / 3);
  const [opening, setOpening] = React.useState(false);
  const [openError, setOpenError] = React.useState(false);
  const index = React.useMemo(() => createWorkspaceDocumentIndex(nodes), [nodes]);
  const reference =
    request?.workspaceRootPath === workspaceRootPath
      ? index.resolveByRelativePath(request.relativePath)
      : null;
  const document: WorkspaceNode | null = reference
    ? { ...reference, kind: 'document' }
    : null;
  const location = React.useMemo(() => ({ hash: request?.hash }), [request?.hash]);
  const { min, max, width } = documentReferenceWidth(containerWidth, ratio);

  React.useLayoutEffect(() => {
    requestRef.current = request;
  }, [request]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setContainerWidth(container.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const preview = (event: Event) => {
      const detail = (event as CustomEvent<PreviewWorkspaceDocumentDetail>).detail;
      if (
        detail?.workspaceRootPath !== workspaceRootPath ||
        typeof detail.relativePath !== 'string' ||
        !detail.relativePath
      ) return;
      if (!index.resolveByRelativePath(detail.relativePath)) {
        toast.warning('引用文档已移动或删除，请刷新后重试');
        return;
      }
      if (!panelRef.current?.contains(window.document.activeElement)) {
        returnFocusRef.current = window.document.activeElement as HTMLElement | null;
      }
      setRequest({ ...detail });
      setOpenError(false);
    };
    window.addEventListener(PREVIEW_WORKSPACE_DOCUMENT_EVENT, preview);
    return () =>
      window.removeEventListener(PREVIEW_WORKSPACE_DOCUMENT_EVENT, preview);
  }, [index, workspaceRootPath]);

  React.useEffect(() => {
    if (request) panelRef.current?.focus({ preventScroll: true });
  }, [request]);

  const close = () => {
    setRequest(null);
    const target = returnFocusRef.current;
    if (target?.isConnected && !target.closest('[aria-hidden="true"], [inert]')) {
      target.focus({ preventScroll: true });
    }
  };
  const open = async () => {
    if (!request || opening) return;
    const pending = request;
    setOpening(true);
    setOpenError(false);
    try {
      const opened = await onOpenDocument(pending);
      if (requestRef.current !== pending) return;
      if (opened) setRequest(null);
      else setOpenError(true);
    } catch {
      if (requestRef.current === pending) setOpenError(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 top-[var(--workspace-main-header-height,0px)] z-30 overflow-hidden"
      data-testid="document-reference-layer"
      ref={containerRef}
    >
      {request && document ? (
        <aside
          aria-label="引用文档预览"
          className={`${styles.drawer} pointer-events-auto absolute inset-y-0 right-0 flex animate-in flex-col border-l border-border/70 bg-background shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.3)] outline-none duration-200 slide-in-from-right-4 motion-reduce:animate-none`}
          data-testid="document-reference-drawer"
          ref={panelRef}
          style={{ width }}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <WorkspaceResizeHandle
            aria-label="调整引用文档预览宽度"
            className="absolute! inset-y-0 left-0 z-50 h-auto! touch-none"
            direction="right"
            min={min}
            max={max}
            value={width}
            onResize={(nextWidth) =>
              setRatio(nextWidth / Math.max(1, containerWidth))
            }
          />
          {openError ? (
            <p role="alert" className="px-4 py-2 text-xs text-destructive">
              未能切换文档，请检查当前文档保存状态后重试。
            </p>
          ) : null}
          <div className="min-h-0 flex-1" aria-busy={opening}>
            <AiDocumentPreview
              key={document.absolutePath}
              document={document}
              location={location}
              markdownOverride={getDraft(document.absolutePath)}
              pageWidthMode={pageWidthMode}
              workspaceRootPath={workspaceRootPath}
              onClose={close}
              onOpenInEditor={() => void open()}
            />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

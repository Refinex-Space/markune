'use client';

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import {
  MarkweaveEditor,
  type MarkweaveEditorRuntimeSnapshot,
  type MarkweaveEditorUpdatePayload,
} from '@markweave/react';

import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import type { PageWidthMode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
  documentKey?: string;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onMarkdownChange?: (markdown: string) => void;
  onSelectionChange?: (
    selection: { markdown: string; from: number; to: number } | null,
  ) => void;
  readOnly?: boolean;
  workspaceRootPath?: string | null;
}

const BACK_TO_TOP_VISIBLE_OFFSET = 240;
const BACK_TO_TOP_MIN_DURATION_MS = 360;
const BACK_TO_TOP_MAX_DURATION_MS = 760;

export function MarkdownEditor({
  documentKey,
  markdown,
  pageWidthMode = 'wide',
  onSaveRequested,
  onMarkdownChange,
  onSelectionChange,
  readOnly = false,
  workspaceRootPath = null,
}: MarkdownEditorProps) {
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const runtimeSelectionRef =
    React.useRef<MarkweaveEditorRuntimeSnapshot['selection']>(null);
  const cancelBackToTopAnimationRef = React.useRef<(() => void) | null>(
    null,
  );
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);

  const frontmatterView = React.useMemo(() => {
    const parsed = parseFrontmatter(markdown);
    const hasFrontmatter = Object.keys(parsed.metadata).length > 0;

    if (!hasFrontmatter) {
      return {
        body: markdown,
        hasFrontmatter: false,
        metadata: parsed.metadata,
      };
    }

    return {
      body: parsed.body,
      hasFrontmatter: true,
      metadata: parsed.metadata,
    };
  }, [markdown]);
  const {
    editorMarkdown,
    onSlashCommandUpload,
    toStorageMarkdown,
  } = useWorkspaceAssetUploader(
    workspaceRootPath ?? null,
    frontmatterView.body,
  );

  const serializeBody = React.useCallback(
    (body: string) => {
      if (!frontmatterView.hasFrontmatter) {
        return body;
      }

      return serializeFrontmatter({
        body,
        metadata: frontmatterView.metadata,
      });
    },
    [frontmatterView],
  );

  const handleEditorUpdate = React.useCallback(
    (payload: MarkweaveEditorUpdatePayload) => {
      if (readOnly || !onMarkdownChange) {
        return;
      }

      onMarkdownChange(serializeBody(toStorageMarkdown(payload.markdown)));
    },
    [onMarkdownChange, readOnly, serializeBody, toStorageMarkdown],
  );

  const syncSelectionContext = React.useCallback(() => {
    if (!onSelectionChange) {
      return;
    }

    const selection = runtimeSelectionRef.current;
    const selectedText = getDomSelectionText(scrollAreaRef.current);

    if (!selection || selection.empty || !selectedText.trim()) {
      onSelectionChange(null);
      return;
    }

    onSelectionChange({
      from: Math.min(selection.from, selection.to),
      markdown: selectedText,
      to: Math.max(selection.from, selection.to),
    });
  }, [onSelectionChange]);

  const handleRuntimeStateChange = React.useCallback(
    (snapshot: MarkweaveEditorRuntimeSnapshot) => {
      runtimeSelectionRef.current = snapshot.selection;

      window.requestAnimationFrame(syncSelectionContext);
    },
    [syncSelectionContext],
  );

  const handleTocChange = React.useCallback(() => {
    // Markweave owns the visible inner TOC; this callback keeps the runtime
    // bridge explicit for future workspace integrations.
  }, []);

  React.useEffect(() => {
    const scroller = scrollAreaRef.current;

    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      setBackToTopVisible(scroller.scrollTop > BACK_TO_TOP_VISIBLE_OFFSET);
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
    };
  }, [documentKey]);

  React.useEffect(
    () => () => {
      cancelBackToTopAnimationRef.current?.();
    },
    [],
  );

  const handleBackToTop = React.useCallback(() => {
    const scroller = scrollAreaRef.current;

    if (!scroller) {
      return;
    }

    cancelBackToTopAnimationRef.current?.();

    cancelBackToTopAnimationRef.current = animateScrollToTop(scroller, () => {
      cancelBackToTopAnimationRef.current = null;
      setBackToTopVisible(false);
    });
  }, []);

  return (
    <div
      className={cn(
        'workspace-editor-shell relative flex h-full min-h-0 flex-col',
        `workspace-editor-page-${pageWidthMode}`,
      )}
      data-page-width-mode={pageWidthMode}
      data-testid="markdown-editor-root"
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          onSaveRequested?.();
        }
      }}
    >
      <div
        className="markdown-editor-scrollarea min-h-0 flex-1 overflow-auto"
        data-testid="markdown-editor-scrollarea"
        onKeyUp={syncSelectionContext}
        onMouseUp={syncSelectionContext}
        ref={scrollAreaRef}
      >
        <MarkweaveEditor
          ariaLabel="Markdown 正文"
          className="madora-markweave-editor"
          content={editorMarkdown}
          contentFormat="markdown"
          editable={!readOnly}
          innerToc
          innerTocPlacement="container"
          key={documentKey}
          lang="zh"
          mode={readOnly ? 'view' : 'live'}
          onRuntimeStateChange={handleRuntimeStateChange}
          onSlashCommandUpload={onSlashCommandUpload}
          onTocChange={handleTocChange}
          onUpdate={handleEditorUpdate}
        />
      </div>

      {backToTopVisible ? (
        <button
          aria-label="回到顶部"
          className="absolute right-10 bottom-4 z-40 flex size-8 items-center justify-center rounded-md border bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
          type="button"
          onClick={handleBackToTop}
        >
          <ArrowUp size={15} />
        </button>
      ) : null}
    </div>
  );
}

function getDomSelectionText(root: HTMLElement | null) {
  if (!root || typeof window === 'undefined') {
    return '';
  }

  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return '';
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  if (
    (anchorNode && root.contains(anchorNode)) ||
    (focusNode && root.contains(focusNode))
  ) {
    return selection.toString();
  }

  return '';
}

function animateScrollToTop(scroller: HTMLElement, onComplete: () => void) {
  const startTop = scroller.scrollTop;

  if (startTop <= 0) {
    onComplete();
    return () => {};
  }

  const duration = Math.min(
    BACK_TO_TOP_MAX_DURATION_MS,
    Math.max(BACK_TO_TOP_MIN_DURATION_MS, startTop * 0.35),
  );
  const startTime = performance.now();
  let frameId: number | null = null;
  let cancelled = false;

  const step = (now: number) => {
    if (cancelled) {
      return;
    }

    const progress = Math.min(1, (now - startTime) / duration);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const nextTop = Math.round(startTop * (1 - easedProgress));

    scroller.scrollTo({ top: nextTop });

    if (progress < 1 && scroller.scrollTop > 0) {
      frameId = requestAnimationFrame(step);
      return;
    }

    scroller.scrollTo({ top: 0 });
    onComplete();
  };

  frameId = requestAnimationFrame(step);

  return () => {
    cancelled = true;

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
  };
}

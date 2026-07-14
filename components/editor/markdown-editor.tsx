'use client';

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
} from '@markweave/react';
import { useTheme } from 'next-themes';

import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { resolveMarkweaveLinkCard } from '@/components/editor/markweave-link-card-resolver';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import type { PageWidthMode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
  documentKey?: string;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onMarkdownChange?: (markdown: string) => void;
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
  readOnly = false,
  workspaceRootPath = null,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const markweaveModeRef = React.useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const sourceModeToggledRef = React.useRef(false);
  const sourceTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const cancelBackToTopAnimationRef = React.useRef<(() => void) | null>(
    null,
  );
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);
  const [sourceMode, setSourceMode] = React.useState(false);

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

  React.useEffect(() => {
    if (!sourceModeToggledRef.current) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const focusTarget = sourceMode
        ? sourceTextareaRef.current
        : markweaveModeRef.current?.querySelector<HTMLElement>(
            '.ProseMirror, [contenteditable], textarea',
          ) ?? editorRootRef.current;

      focusTarget?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frameId);
  }, [sourceMode]);

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
      data-editor-mode={sourceMode ? 'source' : readOnly ? 'view' : 'live'}
      data-page-width-mode={pageWidthMode}
      data-testid="markdown-editor-root"
      ref={editorRootRef}
      tabIndex={-1}
      onKeyDownCapture={(event) => {
        const primaryModifier = event.metaKey || event.ctrlKey;
        const sourceModeShortcut =
          primaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          !event.repeat &&
          (event.key === '/' || event.code === 'Slash');

        if (sourceModeShortcut) {
          event.preventDefault();
          event.stopPropagation();
          sourceModeToggledRef.current = true;
          setSourceMode((current) => !current);
          return;
        }

        if (
          primaryModifier && event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          onSaveRequested?.();
        }
      }}
    >
      <div
        className="markdown-editor-scrollarea flex min-h-0 flex-1 flex-col overflow-auto"
        data-testid="markdown-editor-scrollarea"
        ref={scrollAreaRef}
      >
        <div
          aria-hidden={sourceMode}
          className={cn('min-h-full w-full flex-1', sourceMode && 'hidden')}
          data-testid="markweave-editor-mode"
          ref={markweaveModeRef}
        >
          <MarkweaveEditor
            ariaLabel="Markdown 正文"
            canvasColor="var(--background)"
            className="madora-markweave-editor"
            content={editorMarkdown}
            contentFormat="markdown"
            editable={!readOnly}
            innerToc
            innerTocPlacement="container"
            key={documentKey}
            lang="zh"
            mode={readOnly ? 'view' : 'live'}
            onSlashCommandUpload={onSlashCommandUpload}
            onTocChange={handleTocChange}
            onUpdate={handleEditorUpdate}
            linkCardResolver={resolveMarkweaveLinkCard}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          />
        </div>

        {sourceMode ? (
          <section
            className="flex min-h-0 w-full flex-1 flex-col bg-background"
            data-testid="markdown-source-mode"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/30 px-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Markdown 源码
              </span>
              <span>只读 · Ctrl / Cmd + / 返回</span>
            </div>
            <textarea
              aria-label="Markdown 文档源码（只读）"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-0 flex-1 resize-none overflow-auto border-0 bg-transparent px-6 py-5 font-mono text-sm leading-6 text-foreground outline-none selection:bg-primary/20"
              readOnly
              ref={sourceTextareaRef}
              spellCheck={false}
              value={markdown}
              wrap="off"
            />
          </section>
        ) : null}
      </div>

      {!sourceMode && backToTopVisible ? (
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

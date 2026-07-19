'use client';

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import {
  MarkweaveEditor,
  type MarkweaveEditorUpdatePayload,
  type MarkweaveSearchController,
} from '@markweave/react';
import { useTheme } from 'next-themes';

import {
  DocumentFindBar,
  type DocumentFindRequest,
} from '@/components/editor/document-find-bar';
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { resolveMarkweaveLinkCard } from '@/components/editor/markweave-link-card-resolver';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import type { PageWidthMode } from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

export type MarkdownEditorChangeOrigin = 'source';

interface MarkdownEditorProps {
  documentKey?: string;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onMarkdownChange?: (
    markdown: string,
    origin?: MarkdownEditorChangeOrigin,
  ) => void;
  readOnly?: boolean;
  themeOverride?: 'dark' | 'light';
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
  themeOverride,
  workspaceRootPath = null,
}: MarkdownEditorProps) {
  const { resolvedTheme } = useTheme();
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const markweaveModeRef = React.useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const findRequestRevisionRef = React.useRef(0);
  const sourceModeToggledRef = React.useRef(false);
  const sourceTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const cancelBackToTopAnimationRef = React.useRef<(() => void) | null>(
    null,
  );
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);
  const [findRequest, setFindRequest] =
    React.useState<DocumentFindRequest | null>(null);
  const [searchController, setSearchController] =
    React.useState<MarkweaveSearchController | null>(null);
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

  const handleSearchControllerChange = React.useCallback(
    (controller: MarkweaveSearchController | null) => {
      setSearchController(controller);
    },
    [],
  );

  const getSelectedText = React.useCallback(() => {
    if (sourceMode) {
      const textarea = sourceTextareaRef.current;

      if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
        return '';
      }

      return textarea.value.slice(
        textarea.selectionStart,
        textarea.selectionEnd,
      );
    }

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;

    if (
      !selection ||
      selection.isCollapsed ||
      !anchorNode ||
      !markweaveModeRef.current?.contains(anchorNode)
    ) {
      return '';
    }

    return selection.toString();
  }, [sourceMode]);

  const openFind = React.useCallback(
    (expandReplace: boolean) => {
      findRequestRevisionRef.current += 1;
      setFindRequest({
        documentKey,
        expandReplace,
        initialQuery: normalizeFindSeed(getSelectedText()),
        revision: findRequestRevisionRef.current,
      });
    },
    [documentKey, getSelectedText],
  );

  const closeFind = React.useCallback(() => {
    setFindRequest(null);

    requestAnimationFrame(() => {
      const focusTarget = sourceMode
        ? sourceTextareaRef.current
        : markweaveModeRef.current?.querySelector<HTMLElement>(
            '.ProseMirror, [contenteditable], textarea',
          ) ?? editorRootRef.current;

      focusTarget?.focus({ preventScroll: true });
    });
  }, [sourceMode]);

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
      onClickCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest<HTMLAnchorElement>('a[href]');
        const href = link?.getAttribute('href') ?? '';
        const match = /^madora-drawing:\/\/([0-9a-f-]{36})$/i.exec(href);
        if (!match) return;
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(
          new CustomEvent('madora:open-drawing', {
            detail: { drawingId: match[1].toLowerCase() },
          }),
        );
      }}
      onKeyDownCapture={(event) => {
        const primaryModifier = event.metaKey || event.ctrlKey;
        const key = event.key.toLowerCase();
        const findShortcut =
          primaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          !event.repeat &&
          key === 'f';
        const replaceShortcut =
          !event.repeat &&
          !event.shiftKey &&
          ((event.ctrlKey && !event.metaKey && !event.altKey && key === 'h') ||
            (event.metaKey && !event.ctrlKey && event.altKey && key === 'f'));

        if (findShortcut || replaceShortcut) {
          event.preventDefault();
          event.stopPropagation();
          openFind(replaceShortcut);
          return;
        }

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

        if (primaryModifier && key === 's') {
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
            onSearchControllerChange={handleSearchControllerChange}
            onTocChange={handleTocChange}
            onUpdate={handleEditorUpdate}
            linkCardResolver={resolveMarkweaveLinkCard}
            theme={themeOverride ?? (resolvedTheme === 'dark' ? 'dark' : 'light')}
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
              <span>
                {readOnly ? '只读' : '可编辑'} · Ctrl / Cmd + / 返回
              </span>
            </div>
            <textarea
              aria-label="Markdown 文档源码"
              autoCapitalize="off"
              autoCorrect="off"
              className="min-h-0 flex-1 resize-none overflow-auto border-0 bg-transparent px-6 py-5 font-mono text-sm leading-6 text-foreground outline-none selection:bg-primary/20"
              readOnly={readOnly}
              ref={sourceTextareaRef}
              spellCheck={false}
              value={markdown}
              wrap="off"
              onChange={
                readOnly || !onMarkdownChange
                  ? undefined
                  : (event) =>
                      onMarkdownChange(event.currentTarget.value, 'source')
              }
            />
          </section>
        ) : null}
      </div>

      {findRequest && findRequest.documentKey === documentKey ? (
        <DocumentFindBar
          controller={searchController}
          key={findRequest.revision}
          onClose={closeFind}
          onSourceChange={
            readOnly || !onMarkdownChange
              ? undefined
              : (nextMarkdown) => onMarkdownChange(nextMarkdown, 'source')
          }
          readOnly={readOnly}
          request={findRequest}
          sourceMode={sourceMode}
          sourceText={markdown}
          sourceTextareaRef={sourceTextareaRef}
        />
      ) : null}

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

function normalizeFindSeed(selection: string) {
  const normalized = selection.replace(/\s+/g, ' ').trim();

  return normalized.length <= 200 ? normalized : '';
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

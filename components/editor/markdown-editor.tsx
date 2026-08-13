'use client';

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  MarkweaveEditor,
  type MarkweaveAiEditController,
  type MarkweaveAskAiHandler,
  type MarkweaveEditorUpdatePayload,
  type MarkweaveSearchController,
} from '@markweave/react';
import type {
  MarkweaveInternalLinkCardConfig,
  MarkweaveReferenceSuggestionConfig,
} from 'markweave';
import { useTheme } from 'next-themes';

import {
  DocumentFindBar,
  type DocumentFindRequest,
} from '@/components/editor/document-find-bar';
import {
  normalizeDrawingMarkdownReferences,
  parseDrawingMarkdownUrl,
  projectDrawingMarkdownReferencesForEditor,
  restoreDrawingMarkdownReferencesFromEditor,
} from '@/components/editor/drawing-markdown-reference';
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { resolveMarkweaveLinkCard } from '@/components/editor/markweave-link-card-resolver';
import type { MarkdownSourceEditorHandle } from '@/components/editor/markdown-source-editor';
import {
  buildWorkspaceDocumentHref,
  OPEN_WORKSPACE_DOCUMENT_EVENT,
  parseInternalDocumentHref,
  resolveWorkspaceDocumentTarget,
  toWorkspaceRootRelativePath,
} from '@/components/editor/workspace-document-link';
import { useWorkspaceDocumentIndex } from '@/components/editor/workspace-document-index';
import { extractDocumentPreviewText } from '@/components/editor/workspace-document-preview';
import {
  createWorkspaceReferenceRenderer,
  type WorkspaceReferenceItem,
} from '@/components/editor/workspace-reference-suggestion';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import { readMarkdownDocument } from '@/components/workspace/workspace-api';
import type { PageWidthMode } from '@/components/workspace/workspace-types';
import {
  incrementWorkspacePerformanceCounter,
  startWorkspacePerformanceMeasure,
} from '@/components/workspace/workspace-performance';
import { cn } from '@/lib/utils';

export type MarkdownEditorChangeOrigin = 'source';

export type MarkdownEditorFlushReason =
  | 'ai-send'
  | 'app-exit'
  | 'document-switch'
  | 'export'
  | 'idle'
  | 'manual-save'
  | 'source-toggle';

export interface MarkdownEditorHandle {
  flushDraft: (reason: MarkdownEditorFlushReason) => Promise<boolean>;
  getAiEditController: () => MarkweaveAiEditController | null;
}

interface MarkdownEditorProps {
  aiEnabled?: boolean;
  askAiHandler?: MarkweaveAskAiHandler | null;
  documentKey?: string;
  documentPath?: string | null;
  markdown: string;
  pageWidthMode?: PageWidthMode;
  onSaveRequested?: () => void;
  onMarkdownChange?: (
    markdown: string,
    origin?: MarkdownEditorChangeOrigin,
    reason?: MarkdownEditorFlushReason,
  ) => boolean | void | Promise<boolean | void>;
  onSourceModeChange?: (sourceMode: boolean) => void;
  readOnly?: boolean;
  themeOverride?: 'dark' | 'light';
  workspaceRootPath?: string | null;
}

const BACK_TO_TOP_VISIBLE_OFFSET = 240;
const BACK_TO_TOP_MIN_DURATION_MS = 360;
const BACK_TO_TOP_MAX_DURATION_MS = 760;
const LIVE_DRAFT_IDLE_MS = 500;
const MarkdownSourceEditor = dynamic(
  () =>
    import('@/components/editor/markdown-source-editor').then(
      (module) => module.MarkdownSourceEditor,
    ),
  {
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        正在加载源码编辑器...
      </div>
    ),
    ssr: false,
  },
);

export const MarkdownEditor = React.forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor({
  aiEnabled = false,
  askAiHandler = null,
  documentKey,
  documentPath = null,
  markdown,
  pageWidthMode = 'wide',
  onSaveRequested,
  onMarkdownChange,
  onSourceModeChange,
  readOnly = false,
  themeOverride,
  workspaceRootPath = null,
}: MarkdownEditorProps, forwardedRef) {
  const { resolvedTheme } = useTheme();
  const editorRootRef = React.useRef<HTMLDivElement | null>(null);
  const markweaveModeRef = React.useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const findRequestRevisionRef = React.useRef(0);
  const sourceModeToggledRef = React.useRef(false);
  const liveEditorRevisionRef = React.useRef(0);
  const sourceEditorRef = React.useRef<MarkdownSourceEditorHandle | null>(null);
  const aiEditControllerRef = React.useRef<MarkweaveAiEditController | null>(
    null,
  );
  const sourceDraftMarkdownRef = React.useRef(markdown);
  const pendingSourceMarkdownRef = React.useRef<string | null>(null);
  const pendingPayloadRef = React.useRef<MarkweaveEditorUpdatePayload | null>(
    null,
  );
  const activeEditorRef = React.useRef<
    MarkweaveEditorUpdatePayload['editor'] | null
  >(null);
  const pendingUpdateRevisionRef = React.useRef(0);
  const pendingFlushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const flushInFlightRef = React.useRef<Promise<boolean> | null>(null);
  const cancelBackToTopAnimationRef = React.useRef<(() => void) | null>(
    null,
  );
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);
  const [findRequest, setFindRequest] =
    React.useState<DocumentFindRequest | null>(null);
  const [searchController, setSearchController] =
    React.useState<MarkweaveSearchController | null>(null);
  const [sourceMode, setSourceMode] = React.useState(false);
  const [sourceFindText, setSourceFindText] = React.useState(markdown);
  const loadedDocumentRef = React.useRef({ documentKey, markdown });

  if (loadedDocumentRef.current.documentKey !== documentKey) {
    loadedDocumentRef.current = { documentKey, markdown };
  }

  const loadedMarkdown = loadedDocumentRef.current.markdown;

  const normalizedMarkdown = React.useMemo(
    () => normalizeDrawingMarkdownReferences(loadedMarkdown),
    [loadedMarkdown],
  );
  const askAiConfig = React.useMemo(
    () =>
      aiEnabled && askAiHandler && !readOnly && !sourceMode
        ? { enabled: true as const, handler: askAiHandler }
        : undefined,
    [aiEnabled, askAiHandler, readOnly, sourceMode],
  );
  const frontmatterView = React.useMemo(() => {
    const parsed = parseFrontmatter(normalizedMarkdown);
    const hasFrontmatter = Object.keys(parsed.metadata).length > 0;

    if (!hasFrontmatter) {
      return {
        body: normalizedMarkdown,
        hasFrontmatter: false,
        metadata: parsed.metadata,
      };
    }

    return {
      body: parsed.body,
      hasFrontmatter: true,
      metadata: parsed.metadata,
    };
  }, [normalizedMarkdown]);
  const projectedEditorBody = React.useMemo(
    () => projectDrawingMarkdownReferencesForEditor(frontmatterView.body),
    [frontmatterView.body],
  );
  const {
    editorMarkdown,
    onAttachmentDownload,
    onSlashCommandUpload,
    resolveMediaSource,
    toStorageMarkdown,
  } = useWorkspaceAssetUploader(
    workspaceRootPath ?? null,
    projectedEditorBody,
  );

  const workspaceDocumentIndex = useWorkspaceDocumentIndex();
  const currentDocumentRelativePath = React.useMemo(
    () =>
      documentPath && workspaceRootPath
        ? toWorkspaceRootRelativePath(documentPath, workspaceRootPath)
        : null,
    [documentPath, workspaceRootPath],
  );

  const referenceSuggestion =
    React.useMemo<MarkweaveReferenceSuggestionConfig | null>(() => {
      if (readOnly || !workspaceDocumentIndex || !workspaceRootPath) {
        return null;
      }

      return {
        items: ({ query }) =>
          workspaceDocumentIndex
            .search(query)
            .filter((document) => document.absolutePath !== documentPath)
            .map<WorkspaceReferenceItem>((document) => ({
              href: buildWorkspaceDocumentHref({
                fromDocumentRelativePath: currentDocumentRelativePath,
                targetRelativePath: document.relativePath,
              }),
              label: document.title,
              title: document.title,
              subtitle: relativePathParent(document.relativePath),
            }))
            .filter((item) => item.href.length > 0),
        render: () => createWorkspaceReferenceRenderer(),
      };
    }, [
      currentDocumentRelativePath,
      documentPath,
      readOnly,
      workspaceDocumentIndex,
      workspaceRootPath,
    ]);

  const resolveWorkspaceDocumentLink = React.useCallback(
    (href: string) => {
      const parsed = parseInternalDocumentHref(href);
      if (!parsed) {
        return { isWorkspaceDocument: false, target: null };
      }

      const target = resolveWorkspaceDocumentTarget({
        href,
        documentAbsolutePath: documentPath,
        workspaceRootPath,
      });
      const isWorkspaceDocument =
        /\.mdx?$/i.test(parsed.target) ||
        (target !== null &&
          workspaceDocumentIndex !== null &&
          workspaceDocumentIndex.resolveByRelativePath(
            target.relativePath,
          ) !== null);

      return { isWorkspaceDocument, target };
    },
    [documentPath, workspaceDocumentIndex, workspaceRootPath],
  );

  const internalLinkCard =
    React.useMemo<MarkweaveInternalLinkCardConfig | null>(() => {
      if (!workspaceDocumentIndex || !documentPath || !workspaceRootPath) {
        return null;
      }

      return {
        isInternalLink: (href) =>
          resolveWorkspaceDocumentLink(href).isWorkspaceDocument,
        resolve: async ({ href, signal }) => {
          const { target } = resolveWorkspaceDocumentLink(href);

          if (!target) {
            return { exists: false };
          }

          const document = workspaceDocumentIndex.resolveByRelativePath(
            target.relativePath,
          );

          if (!document) {
            return {
              subtitle: target.relativePath,
              exists: false,
            };
          }

          let description: string | undefined;
          try {
            const content = await readMarkdownDocument(
              workspaceRootPath,
              document.absolutePath,
            );
            if (signal.aborted) {
              return null;
            }
            description =
              extractDocumentPreviewText(content.content) || undefined;
          } catch {
            description = undefined;
          }

          return {
            title: document.title,
            description,
            subtitle: document.relativePath,
            exists: true,
          };
        },
      };
    }, [
      documentPath,
      resolveWorkspaceDocumentLink,
      workspaceDocumentIndex,
      workspaceRootPath,
    ]);

  React.useEffect(() => {
    if (pendingFlushTimerRef.current) {
      clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    pendingPayloadRef.current = null;
    pendingSourceMarkdownRef.current = null;
    activeEditorRef.current = null;
    sourceDraftMarkdownRef.current = normalizedMarkdown;
    setSourceFindText(normalizedMarkdown);
    setFindRequest(null);
    setSourceMode(false);
  }, [documentKey, normalizedMarkdown]);

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

  const performDraftFlush = React.useCallback(
    async (reason: MarkdownEditorFlushReason) => {
      if (pendingFlushTimerRef.current) {
        clearTimeout(pendingFlushTimerRef.current);
        pendingFlushTimerRef.current = null;
      }

      const sourceMarkdown = pendingSourceMarkdownRef.current;
      const payload = pendingPayloadRef.current;

      if (
        (!payload && sourceMarkdown === null) ||
        readOnly ||
        !onMarkdownChange
      ) {
        return true;
      }

      const revision = pendingUpdateRevisionRef.current;
      const perf = startWorkspacePerformanceMeasure(
        'workspace.editor.flush_draft',
      );
      incrementWorkspacePerformanceCounter('workspace.editor.flush_count');
      if (sourceMarkdown === null) {
        incrementWorkspacePerformanceCounter(
          'workspace.editor.serialize_count',
        );
      }

      try {
        const markdown =
          sourceMarkdown ??
          serializeBody(
            restoreDrawingMarkdownReferencesFromEditor(
              toStorageMarkdown(payload!.markdown),
            ),
          );
        const origin = sourceMarkdown === null ? undefined : 'source';
        const result = await onMarkdownChange(markdown, origin, reason);

        if (result === false) {
          return false;
        }

        if (pendingUpdateRevisionRef.current === revision) {
          pendingPayloadRef.current = null;
          pendingSourceMarkdownRef.current = null;
        }

        sourceDraftMarkdownRef.current = markdown;
        perf.finish({
          characters: markdown.length,
          origin: origin ?? 'live',
          reason,
          status: 'saved',
        });

        return true;
      } catch {
        perf.finish({ reason, status: 'failed' });
        return false;
      }
    },
    [onMarkdownChange, readOnly, serializeBody, toStorageMarkdown],
  );

  const flushDraft = React.useCallback(
    (reason: MarkdownEditorFlushReason): Promise<boolean> => {
      if (flushInFlightRef.current) {
        return flushInFlightRef.current.then((flushed) => {
          if (
            flushed &&
            (pendingPayloadRef.current ||
              pendingSourceMarkdownRef.current !== null)
          ) {
            return flushDraft(reason);
          }

          return flushed;
        });
      }

      const promise = performDraftFlush(reason).finally(() => {
        if (flushInFlightRef.current === promise) {
          flushInFlightRef.current = null;
        }
      });
      flushInFlightRef.current = promise;
      return promise;
    },
    [performDraftFlush],
  );

  const handleEditorUpdate = React.useCallback(
    (payload: MarkweaveEditorUpdatePayload) => {
      activeEditorRef.current = payload.editor;

      if (readOnly || !onMarkdownChange) {
        return;
      }

      pendingPayloadRef.current = payload;
      pendingUpdateRevisionRef.current += 1;

      if (pendingFlushTimerRef.current) {
        clearTimeout(pendingFlushTimerRef.current);
      }

      pendingFlushTimerRef.current = setTimeout(() => {
        pendingFlushTimerRef.current = null;
        void flushDraft('idle');
      }, LIVE_DRAFT_IDLE_MS);
    },
    [flushDraft, onMarkdownChange, readOnly],
  );

  const handleSourceUpdate = React.useCallback(
    (nextMarkdown: string) => {
      if (readOnly || !onMarkdownChange) {
        return;
      }

      sourceDraftMarkdownRef.current = nextMarkdown;
      pendingSourceMarkdownRef.current = nextMarkdown;
      pendingPayloadRef.current = null;
      pendingUpdateRevisionRef.current += 1;

      if (findRequest) {
        setSourceFindText(nextMarkdown);
      }

      if (pendingFlushTimerRef.current) {
        clearTimeout(pendingFlushTimerRef.current);
      }

      pendingFlushTimerRef.current = setTimeout(() => {
        pendingFlushTimerRef.current = null;
        void flushDraft('idle');
      }, LIVE_DRAFT_IDLE_MS);
    },
    [findRequest, flushDraft, onMarkdownChange, readOnly],
  );
  const handleAiEditControllerChange = React.useCallback(
    (controller: MarkweaveAiEditController | null) => {
      aiEditControllerRef.current = controller;
    },
    [],
  );

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      flushDraft,
      getAiEditController: () =>
        aiEnabled && !readOnly && !sourceMode
          ? aiEditControllerRef.current
          : null,
    }),
    [aiEnabled, flushDraft, readOnly, sourceMode],
  );

  React.useEffect(() => {
    if (aiEnabled && !readOnly && !sourceMode) return;
    const controller = aiEditControllerRef.current;
    const contextId = controller?.getState().context?.id;
    if (controller && contextId) controller.discard(contextId);
  }, [aiEnabled, readOnly, sourceMode]);

  React.useEffect(
    () => () => {
      if (pendingFlushTimerRef.current) {
        clearTimeout(pendingFlushTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!sourceMode && !pendingPayloadRef.current) {
      sourceDraftMarkdownRef.current = normalizedMarkdown;
      setSourceFindText(normalizedMarkdown);
    }
  }, [normalizedMarkdown, sourceMode]);

  React.useEffect(() => {
    onSourceModeChange?.(sourceMode);

    return () => {
      onSourceModeChange?.(false);
    };
  }, [onSourceModeChange, sourceMode]);

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
      return sourceEditorRef.current?.getSelectedText() ?? '';
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
      if (sourceMode) {
        setSourceFindText(sourceDraftMarkdownRef.current);
      }
    },
    [documentKey, getSelectedText, sourceMode],
  );

  const closeFind = React.useCallback(() => {
    setFindRequest(null);

    requestAnimationFrame(() => {
      if (sourceMode) {
        sourceEditorRef.current?.focus();
      } else {
        const focusTarget =
          markweaveModeRef.current?.querySelector<HTMLElement>(
            '.ProseMirror, [contenteditable], textarea',
          ) ?? editorRootRef.current;
        focusTarget?.focus({ preventScroll: true });
      }
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
      if (sourceMode) {
        sourceEditorRef.current?.focus();
      } else {
        const focusTarget =
          markweaveModeRef.current?.querySelector<HTMLElement>(
            '.ProseMirror, [contenteditable], textarea',
          ) ?? editorRootRef.current;
        focusTarget?.focus({ preventScroll: true });
      }
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
        const drawingImage = target.closest<HTMLImageElement>(
          'img[title^="madora-drawing://"]',
        );
        const linkHref = link?.getAttribute('href') ?? '';
        const href = linkHref || drawingImage?.getAttribute('title') || '';
        const drawingId = parseDrawingMarkdownUrl(href);
        if (drawingId) {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(
            new CustomEvent('madora:open-drawing', {
              detail: { drawingId },
            }),
          );
          return;
        }

        // Open workspace document links as tabs.
        // - Document reference cards: always open in Madora (never the browser).
        // - Inline []() links: Ctrl/Cmd-click in live mode; plain click in view.
        // author: liyao
        const internalCard = target.closest<HTMLElement>(
          '[data-markweave-internal-link-card="true"], .markweave-internal-link-card',
        );
        const cardHref = internalCard?.getAttribute('href') ?? '';
        const effectiveHref = cardHref || linkHref;
        if (!effectiveHref) return;

        const { isWorkspaceDocument, target: documentTarget } =
          resolveWorkspaceDocumentLink(effectiveHref);
        if (!isWorkspaceDocument) return;

        // Workspace Markdown links must never fall through to WebView/browser
        // navigation. In Live mode, an ordinary inline click still bubbles to
        // Markweave so the link remains editable; navigation is explicit.
        event.preventDefault();

        const primaryModifier = event.metaKey || event.ctrlKey;
        if (!internalCard && !readOnly && !primaryModifier) {
          return;
        }

        event.stopPropagation();
        if (!documentTarget) return;

        window.dispatchEvent(
          new CustomEvent(OPEN_WORKSPACE_DOCUMENT_EVENT, {
            detail: documentTarget,
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

          if (sourceMode) {
            void flushDraft('source-toggle').then((flushed) => {
              if (flushed) {
                loadedDocumentRef.current = {
                  documentKey,
                  markdown: sourceDraftMarkdownRef.current,
                };
                liveEditorRevisionRef.current += 1;
                setSourceMode(false);
              }
            });
          } else if (pendingPayloadRef.current) {
            void flushDraft('source-toggle').then((flushed) => {
              if (flushed) {
                setSourceFindText(sourceDraftMarkdownRef.current);
                setSourceMode(true);
              }
            });
          } else {
            setSourceFindText(sourceDraftMarkdownRef.current);
            setSourceMode(true);
          }
          return;
        }

        if (primaryModifier && key === 's') {
          event.preventDefault();
          if (
            !pendingPayloadRef.current &&
            pendingSourceMarkdownRef.current === null
          ) {
            onSaveRequested?.();
          } else {
            void flushDraft('manual-save').then((flushed) => {
              if (flushed) {
                onSaveRequested?.();
              }
            });
          }
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
            askAi={askAiConfig}
            canvasColor="var(--background)"
            className="madora-markweave-editor"
            defaultContent={editorMarkdown}
            defaultContentFormat="markdown"
            editable={!readOnly}
            innerToc
            innerTocPlacement="container"
            key={`${documentKey ?? 'document'}:${liveEditorRevisionRef.current}`}
            lang="zh"
            mode={readOnly ? 'view' : 'live'}
            onAiEditControllerChange={handleAiEditControllerChange}
            onAttachmentDownload={onAttachmentDownload}
            onSlashCommandUpload={onSlashCommandUpload}
            {...{ resolveMediaSource }}
            onSearchControllerChange={handleSearchControllerChange}
            onTocChange={handleTocChange}
            onUpdate={handleEditorUpdate}
            linkCardResolver={resolveMarkweaveLinkCard}
            referenceSuggestion={referenceSuggestion}
            internalLinkCard={internalLinkCard}
            theme={
              themeOverride ?? (resolvedTheme === 'dark' ? 'dark' : 'light')
            }
          />
        </div>

        {sourceMode ? (
          <section
            className="flex min-h-0 w-full flex-1 flex-col bg-background"
            data-testid="markdown-source-mode"
          >
            <MarkdownSourceEditor
              editorRef={sourceEditorRef}
              initialValue={sourceDraftMarkdownRef.current}
              readOnly={readOnly}
              onChange={
                readOnly || !onMarkdownChange
                  ? undefined
                  : handleSourceUpdate
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
              : (nextMarkdown) =>
                  sourceEditorRef.current?.setValue(nextMarkdown)
          }
          readOnly={readOnly}
          request={findRequest}
          sourceMode={sourceMode}
          sourceEditorRef={sourceEditorRef}
          sourceText={sourceFindText}
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
});

function relativePathParent(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');

  return index === -1 ? '' : relativePath.slice(0, index);
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

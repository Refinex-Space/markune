'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { ArrowUp } from 'lucide-react';
import CodeMirror, {
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import {
  EditorSelection,
  mardora,
  ThemeEnum,
  type MardoraContentWidth,
  type MardoraTocItem,
} from 'mardora/editor';
import { allPlugins } from 'mardora/plugins';
import {
  extractPreviewTocFromMarkdown,
  generateCSS,
  preview,
} from 'mardora/preview';

import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import { useWorkspaceAssetUploader } from '@/components/editor/use-workspace-asset-uploader';
import { resolveLinkPreview } from '@/components/editor/link-preview-resolver';
import { WorkspaceAssetProvider } from '@/components/editor/workspace-asset-context';
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

type MardoraEditorConfig = NonNullable<Parameters<typeof mardora>[0]>;
type MardoraFontConfig = NonNullable<MardoraEditorConfig['fonts']>;

const STANDARD_PAGE_WIDTH = '48rem';
const WIDE_PAGE_WIDTH = 'min(88rem, 75%)';
const BACK_TO_TOP_VISIBLE_OFFSET = 240;
const BACK_TO_TOP_MIN_DURATION_MS = 360;
const BACK_TO_TOP_MAX_DURATION_MS = 760;
const MARDORA_FONTS: MardoraFontConfig = {
  code: "var(--madora-code-font, var(--font-jetbrains-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace))",
  document: "var(--madora-document-font, var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif))",
  ui: "var(--madora-ui-font, var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif))",
};

const MARDORA_MOUSE_SELECTION_GUARD_SELECTOR = [
  '.cm-mardora-media-preview',
  '.cm-mardora-media-preview-button',
  '.cm-mardora-image-toolbar',
  '.cm-mardora-image-tool-button',
  '.cm-mardora-image-resize-handle',
].join(',');

function guardMardoraMouseSelection(event: MouseEvent | PointerEvent) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  if (!target.closest(MARDORA_MOUSE_SELECTION_GUARD_SELECTOR)) {
    return false;
  }

  event.preventDefault();
  return true;
}

const mardoraMouseSelectionGuard = EditorView.domEventHandlers({
  mousedown(event) {
    return guardMardoraMouseSelection(event);
  },
  pointerdown(event) {
    return guardMardoraMouseSelection(event);
  },
});

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
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const previewScrollRef = React.useRef<HTMLDivElement | null>(null);
  const activeTocItemRef = React.useRef<HTMLButtonElement | null>(null);
  const cancelBackToTopAnimationRef = React.useRef<(() => void) | null>(null);
  const [backToTopVisible, setBackToTopVisible] = React.useState(false);
  const [tocItems, setTocItems] = React.useState<MardoraTocItem[]>([]);
  const [previewState, setPreviewState] = React.useState<{
    css: string;
    html: string;
  }>({ css: '', html: '' });

  const isDark = resolvedTheme === 'dark';
  const cmTheme = isDark ? githubDark : githubLight;
  const mardoraTheme = isDark ? ThemeEnum.DARK : ThemeEnum.LIGHT;
  const uploader = useWorkspaceAssetUploader(workspaceRootPath ?? null);
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
  const contentWidth = React.useMemo<MardoraContentWidth>(
    () => ({
      maxWidth:
        pageWidthMode === 'wide' ? WIDE_PAGE_WIDTH : STANDARD_PAGE_WIDTH,
    }),
    [pageWidthMode],
  );
  const previewPageWidthClassName =
    pageWidthMode === 'wide'
      ? '[&_.mardora-preview]:mx-auto [&_.mardora-preview]:max-w-[min(88rem,75%)]'
      : '[&_.mardora-preview]:mx-auto [&_.mardora-preview]:max-w-[48rem]';
  const previewTocItems = React.useMemo(
    () =>
      readOnly ? extractPreviewTocFromMarkdown(frontmatterView.body) : [],
    [frontmatterView.body, readOnly],
  );

  const handleMarkdownChange = React.useCallback(
    (value: string) => {
      if (!onMarkdownChange) {
        return;
      }

      if (!frontmatterView.hasFrontmatter) {
        onMarkdownChange(value);
        return;
      }

      onMarkdownChange(
        serializeFrontmatter({
          body: value,
          metadata: frontmatterView.metadata,
        }),
      );
    },
    [frontmatterView, onMarkdownChange],
  );

  const handleTocChange = React.useCallback((items: MardoraTocItem[]) => {
    setTocItems(items);
  }, []);

  const handleSelectTocItem = React.useCallback((item: MardoraTocItem) => {
    if (typeof item.from !== 'number') {
      return;
    }

    const view = editorRef.current?.view ?? null;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: EditorView.scrollIntoView(item.from, { y: 'start' }),
      selection: EditorSelection.cursor(item.from),
    });
    view.focus();
    setTocItems((current) =>
      current.map((tocItem) => ({
        ...tocItem,
        active: tocItem.id === item.id,
      })),
    );
  }, []);

  const handleSelectPreviewTocItem = React.useCallback(
    (item: MardoraTocItem) => {
      const previewRoot = previewScrollRef.current;

      if (!previewRoot) {
        return;
      }

      const target = previewRoot.querySelector(
        `[id="${escapeCssAttributeValue(item.id)}"]`,
      );

      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'start' });
      }
    },
    [],
  );

  const handleEditorUpdate = React.useCallback(
    (update: ViewUpdate) => {
      if (!onSelectionChange || (!update.selectionSet && !update.docChanged)) {
        return;
      }

      const range = update.state.selection.main;

      if (range.empty) {
        onSelectionChange(null);
        return;
      }

      const from = Math.min(range.from, range.to);
      const to = Math.max(range.from, range.to);
      const selectedMarkdown = update.state.sliceDoc(from, to);

      onSelectionChange(
        selectedMarkdown.trim()
          ? {
              from,
              markdown: selectedMarkdown,
              to,
            }
          : null,
      );
    },
    [onSelectionChange],
  );
  React.useEffect(() => {
    activeTocItemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [tocItems]);

  React.useEffect(() => {
    let frame = 0;
    let cleanup: (() => void) | null = null;
    let attempts = 0;

    const attach = () => {
      const scroller = readOnly
        ? previewScrollRef.current
        : editorRef.current?.view?.scrollDOM ?? null;

      if (scroller) {
        const handleScroll = () => {
          setBackToTopVisible(scroller.scrollTop > BACK_TO_TOP_VISIBLE_OFFSET);
        };
        scroller.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        cleanup = () => scroller.removeEventListener('scroll', handleScroll);
        return;
      }

      if (attempts++ < 30) {
        frame = requestAnimationFrame(attach);
      }
    };

    attach();

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      cleanup?.();
    };
  }, [readOnly]);

  React.useEffect(
    () => () => {
      cancelBackToTopAnimationRef.current?.();
    },
    [],
  );

  const handleBackToTop = React.useCallback(() => {
    const scroller = readOnly
      ? previewScrollRef.current
      : editorRef.current?.view?.scrollDOM ?? null;

    if (!scroller) {
      return;
    }

    cancelBackToTopAnimationRef.current?.();

    cancelBackToTopAnimationRef.current = animateScrollToTop(scroller, () => {
      cancelBackToTopAnimationRef.current = null;
      setBackToTopVisible(false);
    });
  }, [readOnly]);

  React.useEffect(() => {
    if (!readOnly) {
      return;
    }

    let cancelled = false;
    const config = {
      fonts: MARDORA_FONTS,
      plugins: allPlugins,
      syntaxTheme: cmTheme,
      theme: mardoraTheme,
      wrapperClass: 'mardora-preview',
    };

    const css = generateCSS({
      ...config,
      includeBase: true,
    });

    void preview(frontmatterView.body, config)
      .then((html) => {
        if (cancelled) {
          return;
        }

        setPreviewState({ css, html });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPreviewState({
          css,
          html: '<article class="mardora-preview"><p>预览渲染失败</p></article>',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cmTheme, frontmatterView.body, mardoraTheme, readOnly]);

  const extensions = React.useMemo(
    () => {
      const config: MardoraEditorConfig = {
        theme: mardoraTheme,
        locale: 'zh-CN',
        baseStyles: true,
        contentWidth,
        fonts: MARDORA_FONTS,
        plugins: allPlugins,
        extensions: [
          mardoraMouseSelectionGuard,
          EditorView.updateListener.of(handleEditorUpdate),
        ],
        disableViewPlugin: false,
        defaultKeybindings: true,
        history: true,
        indentWithTab: true,
        lineWrapping: true,
        slashCommands: { enabled: true },
        selectionToolbar: { enabled: true },
        linkPreview: {
          enabled: true,
          resolve: resolveLinkPreview,
        },
        attachments: {
          enabled: true,
          uploader,
          enablePaste: true,
          enableDrop: true,
          accept: {
            image: ['image/*'],
            video: ['video/*'],
            audio: ['audio/*'],
            file: ['*/*'],
          },
        },
        toc: {
          enabled: false,
          onTocChange: handleTocChange,
        },
      };

      return mardora(config);
    },
    [contentWidth, handleEditorUpdate, handleTocChange, mardoraTheme, uploader],
  );

  return (
    <WorkspaceAssetProvider
      mode="workspace"
      rootPath={workspaceRootPath ?? null}
    >
      <div
        className={`workspace-editor-shell workspace-editor-page-${pageWidthMode} relative flex h-full min-h-0 flex-col`}
        data-page-width-mode={pageWidthMode}
        data-testid="markdown-editor-root"
        key={documentKey}
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
        {readOnly ? (
          <>
            <div
              className={cn(
                'markdown-editor-preview-scrollarea min-h-0 flex-1 overflow-auto px-8 py-8',
                previewPageWidthClassName,
              )}
              data-testid="markdown-editor-preview"
              ref={previewScrollRef}
            >
              <style>{previewState.css}</style>
              <div
                dangerouslySetInnerHTML={{ __html: previewState.html }}
              />
            </div>
            <MardoraTocOverlay
              activeItemRef={activeTocItemRef}
              items={previewTocItems}
              onSelectItem={handleSelectPreviewTocItem}
            />
          </>
        ) : (
          <>
            <CodeMirror
              className="min-h-0 w-full flex-1"
              height="100%"
              ref={editorRef}
              value={frontmatterView.body}
              theme={cmTheme}
              extensions={extensions}
              basicSetup={false}
              onChange={handleMarkdownChange}
            />

            <MardoraTocOverlay
              activeItemRef={activeTocItemRef}
              items={tocItems}
              onSelectItem={handleSelectTocItem}
            />
          </>
        )}

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
    </WorkspaceAssetProvider>
  );
}

function escapeCssAttributeValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

function MardoraTocOverlay({
  activeItemRef,
  items,
  onSelectItem,
}: {
  activeItemRef: React.RefObject<HTMLButtonElement | null>;
  items: MardoraTocItem[];
  onSelectItem: (item: MardoraTocItem) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="group/toc absolute top-1/2 right-9 z-30 flex -translate-y-1/2 items-center"
      data-testid="mardora-toc-overlay"
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 right-0 h-[64vh] w-16 -translate-y-1/2"
        data-testid="mardora-toc-hover-bridge"
      />
      <div
        aria-hidden="true"
        className="relative flex flex-col items-end gap-1.5 py-2"
        data-testid="mardora-toc-rail"
      >
        {items.map((item) => (
          <span
            className={cn(
              'block h-0.5 rounded-full bg-muted-foreground/25 transition-colors',
              getTocRailWidthClassName(item.level),
              item.active && 'bg-foreground',
            )}
            data-testid={`mardora-toc-bar-${item.id}`}
            key={item.id}
          />
        ))}
      </div>

      <nav
        aria-label="文档目录"
        className="mardora-toc-panel-scrollarea pointer-events-none absolute top-1/2 right-10 max-h-[58vh] w-72 -translate-y-1/2 overflow-y-auto rounded-lg border border-border/80 bg-background/95 p-4 text-sm opacity-0 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.45),0_2px_8px_rgba(15,23,42,0.08)] backdrop-blur transition-opacity duration-150 group-hover/toc:pointer-events-auto group-hover/toc:opacity-100 group-focus-within/toc:pointer-events-auto group-focus-within/toc:opacity-100"
        data-testid="mardora-toc-panel"
      >
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <button
              aria-label={`跳转到 ${item.text}`}
              className={cn(
                'min-w-0 truncate rounded-md py-1 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                getTocPanelIndentClassName(item.level),
                item.active && 'font-medium text-foreground',
              )}
              key={item.id}
              ref={item.active ? activeItemRef : undefined}
              type="button"
              onClick={() => onSelectItem(item)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function getTocRailWidthClassName(level: MardoraTocItem['level']) {
  switch (level) {
    case 2:
      return 'w-6';
    case 3:
      return 'w-5';
    case 4:
      return 'w-4';
    case 5:
      return 'w-3';
    case 6:
      return 'w-2';
  }
}

function getTocPanelIndentClassName(level: MardoraTocItem['level']) {
  switch (level) {
    case 2:
      return 'pl-2';
    case 3:
      return 'pl-5';
    case 4:
      return 'pl-8';
    case 5:
      return 'pl-11';
    case 6:
      return 'pl-14';
  }
}

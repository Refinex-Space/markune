'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { parseMarkdownMetadata } from '@/components/editor/markdown-frontmatter';
import { cn } from '@/lib/utils';

import { readMarkdownDocument } from './workspace-api';

const DOCUMENT_PREVIEW_BATCH_SIZE = 24;
const DOCUMENT_PREVIEW_READ_CONCURRENCY = 4;
const DOCUMENT_PREVIEW_MARKDOWN_MAX_CHARS = 520;
const DOCUMENT_PREVIEW_MARKDOWN_MAX_LINES = 12;

const PREVIEW_MARKDOWN_COMPONENTS: Components = {
  a: ({ children }) => <span>{children}</span>,
  blockquote: ({ children }) => (
    <blockquote className="mb-1.5 border-l-2 border-border/70 pl-2">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className="block overflow-hidden font-mono text-[10px] leading-4">
        {children}
      </code>
    ) : (
      <code className="rounded bg-muted/70 px-0.5 font-mono text-[10px]">
        {children}
      </code>
    ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  h2: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  h4: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  h5: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  h6: ({ children }) => (
    <p className="mb-1.5 font-semibold text-foreground">{children}</p>
  ),
  hr: () => null,
  img: () => null,
  input: ({ checked }) => (
    <span aria-hidden="true">{checked ? '☑ ' : '☐ '}</span>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  ol: ({ children }) => (
    <ol className="mb-1.5 ml-3.5 list-decimal space-y-0.5">{children}</ol>
  ),
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  pre: ({ children }) => (
    <pre className="mb-1.5 overflow-hidden font-mono text-[10px] leading-4">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  table: () => null,
  ul: ({ children }) => (
    <ul className="mb-1.5 ml-3.5 list-disc space-y-0.5">{children}</ul>
  ),
};

export interface DocumentPreview {
  createdAt: number | string | null;
  markdown: string;
  modifiedAt: number | null;
  text: string;
  updatedAt: number | string | null;
}

/** Minimal shape the preview loader needs from a workspace document. */
export interface DocumentPreviewTarget {
  absolutePath: string;
  name: string;
}

/**
 * Loads bounded Markdown excerpts for the given documents off the main
 * thread, batched and with limited concurrency so opening a folder (or the home
 * board) never stalls the UI while reading Markdown bodies. author: liyao
 */
export function useDocumentPreviews(
  documents: ReadonlyArray<DocumentPreviewTarget>,
  workspaceRootPath: string,
): Record<string, DocumentPreview> {
  const [previews, setPreviews] = React.useState<
    Record<string, DocumentPreview>
  >({});

  React.useEffect(() => {
    let cancelled = false;
    const documentsToLoad = documents
      .filter((node) => !hasRenderedPreview(previews[node.absolutePath]))
      .slice(0, DOCUMENT_PREVIEW_BATCH_SIZE);

    if (documentsToLoad.length === 0) {
      return;
    }

    async function loadPreviews() {
      const loadedEntries: Array<readonly [string, DocumentPreview]> = [];
      let cursor = 0;

      async function readNextPreview() {
        while (cursor < documentsToLoad.length) {
          const node = documentsToLoad[cursor];
          cursor += 1;

          try {
            const content = await readMarkdownDocument(
              workspaceRootPath,
              node.absolutePath,
            );
            const parsed = parseMarkdownMetadata(content.content, node.name);

            loadedEntries.push([
              node.absolutePath,
              createDocumentPreview(parsed.body, {
                createdAt: parsed.metadata.createdAt ?? content.modifiedAt,
                modifiedAt: content.modifiedAt,
                updatedAt: parsed.metadata.updatedAt ?? content.modifiedAt,
              }),
            ]);
          } catch {
            loadedEntries.push([
              node.absolutePath,
              {
                createdAt: null,
                markdown: '',
                modifiedAt: null,
                text: '',
                updatedAt: null,
              },
            ]);
          }
        }
      }

      await Promise.all(
        Array.from(
          {
            length: Math.min(
              DOCUMENT_PREVIEW_READ_CONCURRENCY,
              documentsToLoad.length,
            ),
          },
          () => readNextPreview(),
        ),
      );

      if (!cancelled) {
        setPreviews((current) => ({
          ...current,
          ...Object.fromEntries(loadedEntries),
        }));
      }
    }

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [documents, previews, workspaceRootPath]);

  return previews;
}

/**
 * The shared "article card" used by both the directory grid and the home recent
 * board: bold title over a masked rendered excerpt with a hover lift. Keeping
 * one component guarantees the two surfaces never drift apart. author: liyao
 */
export function DocumentPreviewCard({
  title,
  preview,
  onOpen,
}: {
  title: string;
  preview?: DocumentPreview;
  onOpen: () => void;
}) {
  const loading = !hasRenderedPreview(preview);
  const excerpt = preview?.markdown?.trim() ?? '';
  const hasBody = Boolean(excerpt);

  return (
    <button
      aria-label={`打开文档 ${title}`}
      className={cn(
        'group relative flex aspect-[3/4] max-h-[280px] min-h-[240px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background text-left shadow-sm transition-all duration-300',
        'hover:-translate-y-1 hover:border-border/80 hover:shadow-md',
        'dark:border-muted-foreground/25 dark:bg-card/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_2px_8px_-6px_rgba(0,0,0,0.8)] dark:hover:border-muted-foreground/45 dark:hover:bg-card/75 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_30px_-20px_rgba(0,0,0,0.95)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      title={title}
      type="button"
      onClick={onOpen}
    >
      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-4 line-clamp-2 text-base font-bold tracking-tight text-foreground">
          {title}
        </h3>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="markune-document-preview-excerpt h-full text-xs leading-relaxed text-muted-foreground/80 break-words"
            data-testid="document-preview-excerpt"
          >
            {loading ? (
              '正在提取文档摘要...'
            ) : !hasBody ? (
              '这个文档暂时没有正文内容。'
            ) : (
              <div
                className="pointer-events-none"
                data-testid="document-preview-markdown"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={PREVIEW_MARKDOWN_COMPONENTS}
                >
                  {excerpt}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
      {!loading && hasBody ? (
        <div
          aria-hidden="true"
          className="markune-document-preview-fade"
          data-testid="document-preview-fade"
        />
      ) : null}
    </button>
  );
}

export function createDocumentPreview(
  body: string,
  meta: Pick<DocumentPreview, 'createdAt' | 'modifiedAt' | 'updatedAt'>,
): DocumentPreview {
  const markdown = extractPreviewMarkdown(body);

  return {
    ...meta,
    markdown,
    text: trimPreviewText(extractPlainText(markdown || body)),
  };
}

export function extractPreviewMarkdown(body: string): string {
  const collected: string[] = [];
  let fence: 'skip' | null = null;
  let skippedLeadingHeading = false;
  let seenContent = false;
  let chars = 0;
  let filledLines = 0;

  for (const rawLine of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.replace(/[ \t]+$/u, '');
    const trimmed = line.trim();

    if (fence) {
      if (/^(`{3,}|~{3,})/.test(trimmed)) {
        fence = null;
      }
      continue;
    }

    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      fence = 'skip';
      continue;
    }

    if (trimmed.startsWith(':::')) {
      continue;
    }

    if (!trimmed) {
      if (seenContent && collected[collected.length - 1] !== '') {
        collected.push('');
      }
      continue;
    }

    if (!skippedLeadingHeading && /^#{1,6}\s+\S/.test(trimmed)) {
      skippedLeadingHeading = true;
      continue;
    }

    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(trimmed)) {
      skippedLeadingHeading = true;
      continue;
    }

    skippedLeadingHeading = true;
    seenContent = true;
    collected.push(line);
    chars += line.length + 1;
    filledLines += 1;

    if (
      filledLines >= DOCUMENT_PREVIEW_MARKDOWN_MAX_LINES ||
      chars >= DOCUMENT_PREVIEW_MARKDOWN_MAX_CHARS
    ) {
      break;
    }
  }

  return collected.join('\n').replace(/^\n+|\n+$/g, '');
}

export function extractPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRenderedPreview(
  preview?: Pick<DocumentPreview, 'markdown'> | null,
): preview is Pick<DocumentPreview, 'markdown'> {
  return typeof preview?.markdown === 'string';
}

export function trimPreviewText(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 180)}...`;
}

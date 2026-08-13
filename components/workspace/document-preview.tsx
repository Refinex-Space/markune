'use client';

import * as React from 'react';

import { parseMarkdownMetadata } from '@/components/editor/markdown-frontmatter';
import { cn } from '@/lib/utils';

import { readMarkdownDocument } from './workspace-api';

const DOCUMENT_PREVIEW_BATCH_SIZE = 24;
const DOCUMENT_PREVIEW_READ_CONCURRENCY = 4;
const DOCUMENT_PREVIEW_MASK_STYLE: React.CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
  maskImage: 'linear-gradient(to bottom, #000 68%, transparent 100%)',
};

export interface DocumentPreview {
  createdAt: number | string | null;
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
 * Loads bounded plain-text summaries for the given documents off the main
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
      .filter((node) => previews[node.absolutePath] === undefined)
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
 * board: bold title over a masked plain-text excerpt with a hover lift. Keeping
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
  const articlePreview =
    preview === undefined
      ? '正在提取文档摘要...'
      : preview.text || '这个文档暂时没有正文内容。';

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

        <div className="relative flex-1 overflow-hidden">
          <div
            className="h-full text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words"
            style={DOCUMENT_PREVIEW_MASK_STYLE}
          >
            {articlePreview}
          </div>
        </div>
      </div>
    </button>
  );
}

export function createDocumentPreview(
  body: string,
  meta: Pick<DocumentPreview, 'createdAt' | 'modifiedAt' | 'updatedAt'>,
): DocumentPreview {
  return {
    ...meta,
    text: trimPreviewText(extractPlainText(body)),
  };
}

export function extractPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trimPreviewText(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 180)}...`;
}

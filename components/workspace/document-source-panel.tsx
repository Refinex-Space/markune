'use client';
import { openUrlInDefaultBrowser } from './workspace-api';
import type { MetadataValue } from '@/components/editor/markdown-frontmatter';

export function DocumentSourcePanel({
  source,
  documentPath,
}: {
  source: MetadataValue | undefined;
  documentPath: string;
}) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return (
      <p className="text-xs text-muted-foreground">
        当前笔记没有结构化来源信息。
      </p>
    );
  const text = (key: string) =>
    typeof source[key] === 'string' ? (source[key] as string) : '';
  const reference = text('reference');
  const href = /^\[[^\]]*\]\((.*)\)$/.exec(reference)?.[1];
  const page = typeof source.page === 'number' ? source.page : undefined;
  return (
    <div className="space-y-3 text-xs">
      <dl className="grid grid-cols-[56px_1fr] gap-2">
        <dt className="text-muted-foreground">来源</dt>
        <dd className="break-words">{text('title')}</dd>
        {page ? (
          <>
            <dt className="text-muted-foreground">页码</dt>
            <dd>{page}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">摘录时间</dt>
        <dd>
          {text('capturedAt')
            ? new Date(text('capturedAt')).toLocaleString()
            : '—'}
        </dd>
      </dl>
      {text('quote') ? (
        <blockquote className="whitespace-pre-wrap border-l-2 border-border pl-3 leading-relaxed">
          {text('quote')}
        </blockquote>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1.5"
          onClick={() => void navigator.clipboard.writeText(text('quote'))}
        >
          复制原文
        </button>
        {text('type') === 'pdf' && href ? (
          <button
            type="button"
            className="rounded border px-2 py-1.5"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('markune:read-pdf', {
                  detail: {
                    documentPath,
                    source: href,
                    name: text('title'),
                    page,
                    fingerprint: text('fingerprint'),
                  },
                }),
              )
            }
          >
            返回 PDF 原页
          </button>
        ) : /^https?:\/\//i.test(text('url')) ? (
          <button
            type="button"
            className="rounded border px-2 py-1.5"
            onClick={() => void openUrlInDefaultBrowser(text('url'))}
          >
            打开来源网页
          </button>
        ) : null}
      </div>
    </div>
  );
}

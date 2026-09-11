/* eslint-disable @next/next/no-img-element -- Native and explicit remote previews bypass the server image optimizer. author: refinex */
'use client';
import * as React from 'react';
import { useAiContentContext } from './ai-content-context';
import { resolveAiReference } from './ai-citation-router';
export function AiMessageImage({ src, alt }: { src?: string; alt?: string }) {
  const context = useAiContentContext();
  const [remote, setRemote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const web = /^https?:\/\//i.test(src ?? '');
  return (
    <span className="my-2 inline-flex max-w-full flex-col gap-1 rounded-lg border p-2 text-xs">
      <button
        type="button"
        className="text-left underline underline-offset-2"
        onClick={() =>
          void (async () => {
            try {
              const reference = resolveAiReference(
                src ?? '',
                context.root,
                context.sourceDocument,
              );
              if (reference.kind === 'web') setRemote(reference.url);
              else if (
                (reference.kind === 'resource' ||
                  reference.kind === 'managed') &&
                context.openResource
              )
                await context.openResource(reference);
              else throw new Error('无法预览此图片来源');
            } catch (error) {
              setError(String(error));
            }
          })()
        }
      >
        {web ? '加载网络图片' : '预览图片'}
        {alt ? `：${alt}` : ''}
      </button>
      {remote ? (
        <img
          src={remote}
          alt={alt ?? '网络图片'}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="max-h-96 max-w-full rounded object-contain"
          onError={() => setError('图片加载失败；来源链接可能已失效')}
        />
      ) : null}
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

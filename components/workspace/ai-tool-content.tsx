/* eslint-disable @next/next/no-img-element -- Native and explicit remote previews bypass the server image optimizer. author: refinex */
'use client';
import * as React from 'react';
import { AiMessageContent } from './ai-message-content';
export function AiToolContent({ result }: { result: unknown }) {
  const record =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : null;
  const content = Array.isArray(record?.content) ? record.content : [];
  return (
    <div className="space-y-2">
      {content.slice(0, 32).map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const block = item as Record<string, unknown>;
        if (block.type === 'text' && typeof block.text === 'string')
          return (
            <AiMessageContent
              key={index}
              markdown={block.text.slice(0, 32000)}
            />
          );
        if (block.type === 'image' && typeof block.data === 'string')
          return <ToolImage key={index} data={block.data} />;
        if (block.type === 'resource_link' && typeof block.uri === 'string')
          return (
            <AiMessageContent
              key={index}
              markdown={`[${String(block.name ?? '工具产物').replace(/[\[\]]/g, '')}](<${block.uri.replace(/[<>\r\n]/g, encodeURIComponent)}>)`}
            />
          );
        return null;
      })}
    </div>
  );
}
export function ToolImage({
  data,
  maxBase64Bytes = 3 * 1024 * 1024,
}: {
  data: string;
  maxBase64Bytes?: number;
}) {
  const [image, setImage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  return (
    <div>
      {image ? (
        <img
          src={image}
          alt="工具返回的图片"
          className="max-h-80 max-w-full rounded border object-contain"
        />
      ) : (
        <button
          type="button"
          disabled={loading || data.length > maxBase64Bytes}
          className="rounded border px-2 py-1"
          onClick={() => {
            setLoading(true);
            void import('@tauri-apps/api/core')
              .then(({ invoke }) =>
                invoke<string>('preview_codex_tool_image', {
                  base64Data: data,
                }),
              )
              .then(setImage)
              .catch((error) => setError(String(error)))
              .finally(() => setLoading(false));
          }}
        >
          {loading ? '正在检查图片…' : '预览工具图片'}
        </button>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

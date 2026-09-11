/* eslint-disable @next/next/no-img-element -- Native and explicit remote previews bypass the server image optimizer. author: refinex */
'use client';
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { createWorkspaceDocumentFromContent } from './workspace-api';
import type { WorkspaceNode } from './workspace-types';
import { PdfResearchReader } from './pdf-research-reader';
import type { AiReference } from './ai-citation-router';
import { researchSourceReference } from './research-notes';
export type AiResourceReference = Extract<
  AiReference,
  { kind: 'resource' | 'managed' }
>;
interface Preview {
  name: string;
  kind: 'pdf' | 'text' | 'image' | 'file' | 'audio' | 'video';
  mediaType: string;
  size: number;
  fingerprint: string;
  text: string | null;
  base64: string | null;
}
export async function readAiArtifact(
  root: string,
  reference: AiResourceReference,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<Preview>('read_codex_artifact', {
    rootPath: root,
    ...(reference.kind === 'managed'
      ? { assetId: reference.assetId }
      : { relativePath: reference.relativePath }),
  });
}
export function AiArtifactViewer({
  root,
  reference,
  onClose,
  onDraft,
  onCreated,
}: {
  root: string;
  reference: AiResourceReference;
  onClose: () => void;
  onDraft?: (text: string) => void;
  onCreated?: (node: WorkspaceNode) => Promise<void> | void;
}) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<WorkspaceNode | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void readAiArtifact(root, reference)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [root, reference]);
  const bytes = React.useMemo(
    () =>
      preview?.kind === 'pdf' && preview.base64
        ? Uint8Array.from(atob(preview.base64), (c) => c.charCodeAt(0))
        : null,
    [preview],
  );
  const href =
    reference.kind === 'managed'
      ? `markune-asset://${reference.assetId}`
      : reference.relativePath;
  const versionedHref =
    reference.kind === 'resource' &&
    (preview?.fingerprint || reference.fingerprint)
      ? `${href}?v=${preview?.fingerprint || reference.fingerprint}`
      : href;
  const quote = (text: string, page?: number) => {
    onDraft?.(
      `${text
        .split('\n')
        .map((line) => '> ' + line)
        .join(
          '\n',
        )}\n\n${researchSourceReference(versionedHref, page)}\n来源版本：${preview?.fingerprint}\n\n`,
    );
    onClose();
  };
  async function createSourceNote() {
    if (!preview || creating) return;
    setCreating(true);
    try {
      if (created) {
        await onCreated?.(created);
        onClose();
        return;
      }
      const title = preview.name.replace(/\.[^.]+$/, '') + ' 阅读笔记';
      const excerpt =
        preview.kind === 'text'
          ? preview.text
              ?.slice(0, 2000)
              .split('\n')
              .map((line) => '> ' + line.replace(/[\\`*_[\]<>]/g, '\\$&'))
              .join('\n')
          : '';
      const content = `# ${title}\n\n来源：${researchSourceReference(versionedHref, reference.page)}\n${preview.fingerprint ? `\n内容指纹：${preview.fingerprint}\n` : ''}\n${excerpt ? `## 摘录\n\n${excerpt}\n\n` : ''}## 我的笔记\n\n`;
      const result = await createWorkspaceDocumentFromContent(
        root,
        '',
        title,
        content,
      );
      setCreated(result.node);
      await onCreated?.(result.node);
      onClose();
    } catch (error) {
      setError(String(error));
    } finally {
      setCreating(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[85dvh] max-h-[900px] w-[95vw] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">
            {preview?.name ?? '来源预览'}
          </DialogTitle>
          <DialogDescription>
            只读预览 ·{' '}
            {preview
              ? `${Math.ceil(preview.size / 1024)} KB · 当前文件版本`
              : '正在读取来源…'}
          </DialogDescription>
        </DialogHeader>
        {reference.kind === 'resource' &&
        reference.fingerprint &&
        preview?.fingerprint &&
        reference.fingerprint !== preview.fingerprint ? (
          <p role="alert" className="text-xs text-amber-600">
            来源已变化，当前内容可能不再支持原结论，请重新核对。
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {preview?.kind === 'pdf' && bytes ? (
          <PdfResearchReader
            bytes={bytes}
            initialPage={reference.page}
            onQuote={({ text, page }) => quote(text, page)}
          />
        ) : null}
        {preview?.kind === 'image' && preview.base64 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <img
              alt={preview.name}
              className="mx-auto max-h-full max-w-full object-contain"
              src={`data:image/png;base64,${preview.base64}`}
            />
          </div>
        ) : null}
        {preview?.kind === 'audio' && preview.base64 ? (
          <audio
            controls
            preload="metadata"
            className="w-full"
            src={`data:${preview.mediaType};base64,${preview.base64}`}
            onError={() => setError('此音频编码暂不支持播放')}
          />
        ) : null}
        {preview?.kind === 'video' && preview.base64 ? (
          <video
            controls
            preload="metadata"
            className="min-h-0 w-full flex-1"
            src={`data:${preview.mediaType};base64,${preview.base64}`}
            onError={() => setError('此视频编码暂不支持播放')}
          />
        ) : null}
        {preview?.kind === 'text' ? (
          <pre
            className="min-h-0 flex-1 overflow-auto rounded-md border p-3 text-xs leading-6"
            tabIndex={0}
          >
            {preview.text}
          </pre>
        ) : null}
        {preview?.kind === 'file' ? (
          <p className="text-sm text-muted-foreground">
            此文件类型暂不支持内嵌预览。可以复制当前版本链接，在工作区中使用对应应用打开。
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs">
          {onCreated && preview ? (
            <button
              type="button"
              disabled={creating}
              className="rounded border px-3 py-2"
              onClick={() => void createSourceNote()}
            >
              {creating
                ? '正在创建…'
                : created
                  ? '打开已创建的笔记'
                  : '新建来源笔记'}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded border px-3 py-2"
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  researchSourceReference(versionedHref, reference.page),
                )
                .catch(() => setError('无法写入剪贴板'))
            }
          >
            复制当前版本链接
          </button>
          {onDraft ? (
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => quote('', reference.page)}
            >
              添加来源到输入框
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

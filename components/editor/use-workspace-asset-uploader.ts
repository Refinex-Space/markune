'use client';

import * as React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type {
  MarkweaveSlashCommandUploadHandler,
  MarkweaveUploadResult,
} from '@markweave/react';

import {
  resolveWorkspaceAsset,
  uploadWorkspaceAsset,
} from '@/components/workspace/workspace-api';
import {
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
} from '@/components/workspace/workspace-local-assets';

export interface WorkspaceAssetUploadBridge {
  editorMarkdown: string;
  onSlashCommandUpload: MarkweaveSlashCommandUploadHandler;
  toStorageMarkdown: (markdown: string) => string;
}

export function useWorkspaceAssetUploader(
  rootPath: string | null,
  storageMarkdown: string,
): WorkspaceAssetUploadBridge {
  const [editorMarkdown, setEditorMarkdown] =
    React.useState(storageMarkdown);
  const displayToStorageRef = React.useRef(new Map<string, string>());
  const storageToDisplayRef = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    displayToStorageRef.current.clear();
    storageToDisplayRef.current.clear();
  }, [rootPath]);

  React.useEffect(() => {
    let cancelled = false;

    async function resolveStorageMarkdown() {
      if (!rootPath) {
        setEditorMarkdown(storageMarkdown);
        return;
      }

      const references = extractWorkspaceAssetReferences(storageMarkdown);

      if (references.length === 0) {
        setEditorMarkdown(storageMarkdown);
        return;
      }

      const replacements = new Map<string, string>();

      await Promise.all(
        references.map(async (reference) => {
          const assetId = getWorkspaceAssetIdFromReference(reference);

          if (!assetId) {
            return;
          }

          try {
            const asset = await resolveWorkspaceAsset(rootPath, assetId);
            const displayUrl = convertFileSrc(asset.absolutePath);

            replacements.set(reference, displayUrl);
            storageToDisplayRef.current.set(reference, displayUrl);
            displayToStorageRef.current.set(displayUrl, reference);
          } catch (error) {
            console.warn('Failed to resolve workspace asset.', error);
          }
        }),
      );

      if (!cancelled) {
        setEditorMarkdown(replaceMappedValues(storageMarkdown, replacements));
      }
    }

    void resolveStorageMarkdown();

    return () => {
      cancelled = true;
    };
  }, [rootPath, storageMarkdown]);

  const toStorageMarkdown = React.useCallback((markdown: string) => {
    return replaceMappedValues(markdown, displayToStorageRef.current);
  }, []);

  const onSlashCommandUpload = React.useCallback<MarkweaveSlashCommandUploadHandler>(
    async (request) => {
      if (request.source.type !== 'file') {
        return createDirectUploadResult(request.source.value, request.source.mimeType);
      }

      const file = request.source.file;

      if (!file) {
        throw new Error('未选择上传文件。');
      }

      if (!rootPath) {
        throw new Error('未打开工作区，无法上传附件。');
      }

      const uploaded = await uploadWorkspaceAsset(rootPath, {
        fileName: file.name,
        mediaType: file.type || 'application/octet-stream',
        base64Data: await fileToBase64(file),
      });
      const displayUrl = convertFileSrc(uploaded.absolutePath);
      const storageReference = uploaded.relativePath || uploaded.url;

      displayToStorageRef.current.set(displayUrl, storageReference);
      storageToDisplayRef.current.set(storageReference, displayUrl);

      return {
        src: displayUrl,
        name: uploaded.name,
        mimeType: uploaded.mediaType,
        size: uploaded.size,
      };
    },
    [rootPath],
  );

  return {
    editorMarkdown,
    onSlashCommandUpload,
    toStorageMarkdown,
  };
}

function createDirectUploadResult(
  value: string | undefined,
  mimeType: string | undefined,
): MarkweaveUploadResult {
  const src = value ?? '';

  return {
    src,
    name: src.split('/').filter(Boolean).at(-1),
    mimeType,
  };
}

function replaceMappedValues(
  markdown: string,
  replacements: ReadonlyMap<string, string>,
) {
  let next = markdown;

  for (const [from, to] of Array.from(replacements.entries()).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    next = next.split(from).join(to);
  }

  return next;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('无法读取文件内容。'));
        return;
      }

      const commaIndex = result.indexOf(',');

      if (commaIndex === -1) {
        reject(new Error('文件 base64 编码失败。'));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });
}

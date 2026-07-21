'use client';

import * as React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type {
  MarkweaveSlashCommandUploadHandler,
  MarkweaveUploadResult,
} from '@markweave/react';

import {
  resolveWorkspaceAssets,
  uploadWorkspaceAsset,
} from '@/components/workspace/workspace-api';
import {
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
  LOCAL_ASSET_URL_PREFIX,
} from '@/components/workspace/workspace-local-assets';
import {
  incrementWorkspacePerformanceCounter,
  startWorkspacePerformanceMeasure,
} from '@/components/workspace/workspace-performance';

export interface WorkspaceAssetUploadBridge {
  editorMarkdown: string | null;
  onSlashCommandUpload: MarkweaveSlashCommandUploadHandler;
  resolveMediaSource: WorkspaceMediaSourceResolver;
  toStorageMarkdown: (markdown: string) => string;
}

export interface WorkspaceMediaSourceRequest {
  kind: 'attachment' | 'image' | 'video';
  priority: 'background' | 'nearby' | 'visible';
  signal: AbortSignal;
  src: string;
}

export interface WorkspaceMediaSourceResult {
  height?: number;
  src: string;
  width?: number;
}

export type WorkspaceMediaSourceResolver = (
  request: WorkspaceMediaSourceRequest,
) =>
  | WorkspaceMediaSourceResult
  | null
  | Promise<WorkspaceMediaSourceResult | null>;

export function useWorkspaceAssetUploader(
  rootPath: string | null,
  storageMarkdown: string,
): WorkspaceAssetUploadBridge {
  const displayToStorageRef = React.useRef(new Map<string, string>());
  const mediaSourceCacheRef = React.useRef(
    new Map<string, WorkspaceMediaSourceResult | null>(),
  );
  const pendingMediaSourceRef = React.useRef(
    new Map<string, Promise<WorkspaceMediaSourceResult | null>>(),
  );
  const attemptedAssetIdsRef = React.useRef(new Set<string>());
  const cacheRootPathRef = React.useRef(rootPath);
  const assetReferences = React.useMemo(
    () => extractWorkspaceAssetReferences(storageMarkdown),
    [storageMarkdown],
  );
  const assetIds = React.useMemo(
    () =>
      assetReferences
        .map(getWorkspaceAssetIdFromReference)
        .filter((assetId): assetId is string => Boolean(assetId)),
    [assetReferences],
  );
  const [initialEditorProjection, setInitialEditorProjection] = React.useState(
    () => ({
      rootPath,
      storageMarkdown,
      value: rootPath && assetIds.length > 0 ? null : storageMarkdown,
    }),
  );
  const initialEditorMarkdown =
    initialEditorProjection.rootPath === rootPath &&
    initialEditorProjection.storageMarkdown === storageMarkdown
      ? initialEditorProjection.value
      : rootPath && assetIds.length > 0
        ? null
        : storageMarkdown;

  React.useEffect(() => {
    if (cacheRootPathRef.current === rootPath) {
      return;
    }

    cacheRootPathRef.current = rootPath;
    displayToStorageRef.current.clear();
    mediaSourceCacheRef.current.clear();
    pendingMediaSourceRef.current.clear();
    attemptedAssetIdsRef.current.clear();
  }, [rootPath]);

  const resolveAssetIds = React.useCallback(
    (assetIds: readonly string[]) => {
      if (!rootPath) {
        return Promise.resolve(
          new Map<string, WorkspaceMediaSourceResult | null>(),
        );
      }

      const pendingAssetIds = Array.from(new Set(assetIds)).filter(
        (assetId) => !attemptedAssetIdsRef.current.has(assetId),
      );

      if (pendingAssetIds.length === 0) {
        return Promise.resolve(
          new Map<string, WorkspaceMediaSourceResult | null>(),
        );
      }

      for (const assetId of pendingAssetIds) {
        attemptedAssetIdsRef.current.add(assetId);
      }

      const perf = startWorkspacePerformanceMeasure(
        'workspace.assets.resolve_batch',
      );
      incrementWorkspacePerformanceCounter('workspace.assets.ipc_count');
      const batchPromise = resolveWorkspaceAssets(rootPath, pendingAssetIds)
        .then((result) => {
          const resolved = new Map<
            string,
            WorkspaceMediaSourceResult | null
          >();
          let unreadableCount = 0;

          for (const item of result.items) {
            const storageReference = `${LOCAL_ASSET_URL_PREFIX}${item.id}`;

            if (item.status !== 'resolved' || !item.asset) {
              resolved.set(item.id, null);
              mediaSourceCacheRef.current.set(storageReference, null);
              if (item.status === 'unreadable') {
                unreadableCount += 1;
              }
              continue;
            }

            const mediaSource = {
              height: item.asset.height,
              src: convertFileSrc(item.asset.absolutePath),
              width: item.asset.width,
            };

            resolved.set(item.id, mediaSource);
            mediaSourceCacheRef.current.set(storageReference, mediaSource);
            displayToStorageRef.current.set(
              mediaSource.src,
              storageReference,
            );
          }

          if (unreadableCount > 0) {
            console.warn('部分工作区资产无法读取。', {
              count: unreadableCount,
            });
          }

          perf.finish({
            missing: result.items.filter((item) => item.status === 'missing')
              .length,
            requested: pendingAssetIds.length,
            resolved: result.items.filter((item) => item.status === 'resolved')
              .length,
            unreadable: unreadableCount,
          });

          return resolved;
        })
        .catch((error) => {
          for (const assetId of pendingAssetIds) {
            attemptedAssetIdsRef.current.delete(assetId);
          }
          perf.finish({ requested: pendingAssetIds.length, status: 'failed' });
          throw error;
        });

      for (const assetId of pendingAssetIds) {
        const pending = batchPromise
          .then((resolved) => resolved.get(assetId) ?? null)
          .finally(() => {
            if (pendingMediaSourceRef.current.get(assetId) === pending) {
              pendingMediaSourceRef.current.delete(assetId);
            }
          });
        pendingMediaSourceRef.current.set(assetId, pending);
      }

      return batchPromise;
    },
    [rootPath],
  );

  React.useEffect(() => {
    if (!rootPath || assetIds.length === 0) {
      return;
    }

    let cancelled = false;
    void resolveAssetIds(assetIds)
      .then(() => {
        if (cancelled) {
          return;
        }
        const replacements = new Map<string, string>();
        for (const reference of assetReferences) {
          const assetId = getWorkspaceAssetIdFromReference(reference);
          const resolved = assetId
            ? mediaSourceCacheRef.current.get(
                `${LOCAL_ASSET_URL_PREFIX}${assetId}`,
              )
            : null;
          if (resolved) {
            replacements.set(reference, resolved.src);
          }
        }
        setInitialEditorProjection({
          rootPath,
          storageMarkdown,
          value: replaceMappedValues(storageMarkdown, replacements),
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('批量解析工作区资产失败。', error);
          setInitialEditorProjection({
            rootPath,
            storageMarkdown,
            value: storageMarkdown,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetIds, assetReferences, resolveAssetIds, rootPath, storageMarkdown]);

  const resolveMediaSource = React.useCallback<WorkspaceMediaSourceResolver>(
    async (request) => {
      if (request.signal.aborted) {
        return null;
      }

      const projectedStorageReference =
        displayToStorageRef.current.get(request.src);
      const assetId = getWorkspaceAssetIdFromReference(
        projectedStorageReference ?? request.src,
      );

      if (!assetId) {
        return { src: request.src };
      }

      const storageReference = `${LOCAL_ASSET_URL_PREFIX}${assetId}`;
      const cached = mediaSourceCacheRef.current.get(storageReference);

      if (
        cached !== undefined ||
        mediaSourceCacheRef.current.has(storageReference)
      ) {
        return cached ?? null;
      }

      await Promise.resolve();

      const prefetched = mediaSourceCacheRef.current.get(storageReference);
      if (
        prefetched !== undefined ||
        mediaSourceCacheRef.current.has(storageReference)
      ) {
        return request.signal.aborted ? null : prefetched ?? null;
      }

      const pending =
        pendingMediaSourceRef.current.get(assetId) ??
        resolveAssetIds([assetId]).then(
          (resolved) => resolved.get(assetId) ?? null,
        );
      const result = await pending;

      return request.signal.aborted ? null : result;
    },
    [resolveAssetIds],
  );

  const toStorageMarkdown = React.useCallback((markdown: string) => {
    const displayRestored = replaceMappedValues(
      markdown,
      displayToStorageRef.current,
    );
    const legacyReplacements = new Map<string, string>();

    for (const reference of extractWorkspaceAssetReferences(displayRestored)) {
      const assetId = getWorkspaceAssetIdFromReference(reference);

      if (!assetId || reference.startsWith(LOCAL_ASSET_URL_PREFIX)) {
        continue;
      }

      const storageReference = `${LOCAL_ASSET_URL_PREFIX}${assetId}`;
      if (mediaSourceCacheRef.current.get(storageReference)) {
        legacyReplacements.set(reference, storageReference);
      }
    }

    return replaceMappedValues(displayRestored, legacyReplacements);
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
        fileName: getUploadFileName(file),
        mediaType: file.type || 'application/octet-stream',
        base64Data: await fileToBase64(file),
      });
      const displayUrl = convertFileSrc(uploaded.absolutePath);
      const storageReference = uploaded.url;

      displayToStorageRef.current.set(displayUrl, storageReference);
      mediaSourceCacheRef.current.set(storageReference, { src: displayUrl });
      attemptedAssetIdsRef.current.add(uploaded.id);

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
    editorMarkdown: initialEditorMarkdown,
    onSlashCommandUpload,
    resolveMediaSource,
    toStorageMarkdown,
  };
}

const clipboardFileExtensionByMediaType: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/vnd.microsoft.icon': 'ico',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
};

function getUploadFileName(file: File) {
  const fileName = file.name.trim();

  if (fileName) {
    return fileName;
  }

  const mediaType = file.type.trim().toLowerCase();
  const extension = clipboardFileExtensionByMediaType[mediaType] ?? 'bin';
  const baseName = mediaType.startsWith('image/')
    ? 'clipboard-image'
    : 'clipboard-file';

  return `${baseName}.${extension}`;
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
  if (replacements.size === 0) {
    return markdown;
  }

  const pattern = Array.from(replacements.keys())
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');

  return markdown.replace(new RegExp(pattern, 'gu'), (value) =>
    replacements.get(value) ?? value,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

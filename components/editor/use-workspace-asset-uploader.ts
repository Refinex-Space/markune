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
  editorMarkdown: string;
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

interface WorkspaceAssetResolverCache {
  pending: Map<string, Promise<WorkspaceMediaSourceResult | null>>;
  results: Map<string, WorkspaceMediaSourceResult | null>;
}

const WORKSPACE_ASSET_CACHE_ROOT_LIMIT = 8;
const WORKSPACE_ASSET_CACHE_ENTRY_LIMIT = 8_192;
const workspaceAssetResolverCaches = new Map<
  string,
  WorkspaceAssetResolverCache
>();

export function clearWorkspaceAssetResolverCache(rootPath?: string) {
  if (rootPath) {
    workspaceAssetResolverCaches.delete(rootPath);
    return;
  }

  workspaceAssetResolverCaches.clear();
}

function getWorkspaceAssetResolverCache(rootPath: string) {
  const existing = workspaceAssetResolverCaches.get(rootPath);

  if (existing) {
    workspaceAssetResolverCaches.delete(rootPath);
    workspaceAssetResolverCaches.set(rootPath, existing);
    return existing;
  }

  const cache: WorkspaceAssetResolverCache = {
    pending: new Map(),
    results: new Map(),
  };
  workspaceAssetResolverCaches.set(rootPath, cache);

  while (workspaceAssetResolverCaches.size > WORKSPACE_ASSET_CACHE_ROOT_LIMIT) {
    const oldestRootPath = workspaceAssetResolverCaches.keys().next().value;

    if (typeof oldestRootPath !== 'string') {
      break;
    }

    workspaceAssetResolverCaches.delete(oldestRootPath);
  }

  return cache;
}

function setWorkspaceAssetResolverResult(
  cache: WorkspaceAssetResolverCache,
  assetId: string,
  result: WorkspaceMediaSourceResult | null,
) {
  cache.results.delete(assetId);
  cache.results.set(assetId, result);

  while (cache.results.size > WORKSPACE_ASSET_CACHE_ENTRY_LIMIT) {
    const oldestAssetId = cache.results.keys().next().value;

    if (typeof oldestAssetId !== 'string') {
      break;
    }

    cache.results.delete(oldestAssetId);
  }
}

async function resolveWorkspaceAssetIds(
  rootPath: string,
  assetIds: readonly string[],
) {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  const cache = getWorkspaceAssetResolverCache(rootPath);
  const unresolvedAssetIds = uniqueAssetIds.filter(
    (assetId) =>
      !cache.results.has(assetId) && !cache.pending.has(assetId),
  );

  if (unresolvedAssetIds.length > 0) {
    const requestedAssetIds = new Set(unresolvedAssetIds);
    const perf = startWorkspacePerformanceMeasure(
      'workspace.assets.resolve_batch',
    );
    incrementWorkspacePerformanceCounter('workspace.assets.ipc_count');
    const batchPromise = resolveWorkspaceAssets(rootPath, unresolvedAssetIds)
      .then((result) => {
        let missingCount = 0;
        let resolvedCount = 0;
        let unreadableCount = 0;

        for (const assetId of unresolvedAssetIds) {
          if (!cache.results.has(assetId)) {
            setWorkspaceAssetResolverResult(cache, assetId, null);
          }
        }

        for (const item of result.items) {
          if (!requestedAssetIds.has(item.id)) {
            continue;
          }

          if (item.status === 'missing') {
            missingCount += 1;
          } else if (item.status === 'unreadable') {
            unreadableCount += 1;
          }

          if (item.status !== 'resolved' || !item.asset) {
            continue;
          }

          resolvedCount += 1;
          setWorkspaceAssetResolverResult(cache, item.id, {
            height: item.asset.height,
            src: convertFileSrc(item.asset.absolutePath),
            width: item.asset.width,
          });
        }

        if (unreadableCount > 0) {
          console.warn('部分工作区资产无法读取。', {
            count: unreadableCount,
          });
        }

        perf.finish({
          missing: missingCount,
          requested: unresolvedAssetIds.length,
          resolved: resolvedCount,
          unreadable: unreadableCount,
        });
      })
      .catch((error) => {
        perf.finish({
          requested: unresolvedAssetIds.length,
          status: 'failed',
        });
        throw error;
      });

    for (const assetId of unresolvedAssetIds) {
      const pending = batchPromise
        .then(() => cache.results.get(assetId) ?? null)
        .finally(() => {
          if (cache.pending.get(assetId) === pending) {
            cache.pending.delete(assetId);
          }
        });
      cache.pending.set(assetId, pending);
    }
  }

  const resolved = new Map<string, WorkspaceMediaSourceResult | null>();
  await Promise.all(
    uniqueAssetIds.map(async (assetId) => {
      if (!cache.results.has(assetId)) {
        await cache.pending.get(assetId);
      }
      resolved.set(assetId, cache.results.get(assetId) ?? null);
    }),
  );

  return resolved;
}

export function useWorkspaceAssetUploader(
  rootPath: string | null,
  storageMarkdown: string,
): WorkspaceAssetUploadBridge {
  const displayToStorageRef = React.useRef(new Map<string, string>());
  const cacheRootPathRef = React.useRef(rootPath);

  React.useEffect(() => {
    if (cacheRootPathRef.current === rootPath) {
      return;
    }

    cacheRootPathRef.current = rootPath;
    displayToStorageRef.current.clear();
  }, [rootPath]);

  const assetReferences = React.useMemo(
    () => extractWorkspaceAssetReferences(storageMarkdown),
    [storageMarkdown],
  );
  const assetIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          assetReferences
            .map(getWorkspaceAssetIdFromReference)
            .filter((assetId): assetId is string => Boolean(assetId)),
        ),
      ),
    [assetReferences],
  );
  const assetIdSet = React.useMemo(() => new Set(assetIds), [assetIds]);
  const documentResolutionKey = React.useMemo(
    () => `${rootPath ?? ''}\u0000${assetIds.join('\u0000')}`,
    [assetIds, rootPath],
  );
  const documentResolutionRef = React.useRef<{
    key: string;
    promise: Promise<Map<string, WorkspaceMediaSourceResult | null>>;
  } | null>(null);
  const ensureDocumentAssetsResolved = React.useCallback(() => {
    if (!rootPath || assetIds.length === 0) {
      return Promise.resolve(
        new Map<string, WorkspaceMediaSourceResult | null>(),
      );
    }

    if (documentResolutionRef.current?.key === documentResolutionKey) {
      return documentResolutionRef.current.promise;
    }

    const request = resolveWorkspaceAssetIds(rootPath, assetIds);
    const promise = request.catch((error) => {
      if (
        documentResolutionRef.current?.key === documentResolutionKey &&
        documentResolutionRef.current.promise === promise
      ) {
        documentResolutionRef.current = null;
      }
      throw error;
    });
    documentResolutionRef.current = {
      key: documentResolutionKey,
      promise,
    };
    return promise;
  }, [assetIds, documentResolutionKey, rootPath]);

  React.useEffect(() => {
    if (!rootPath || assetIds.length === 0) {
      return;
    }

    void ensureDocumentAssetsResolved().catch((error) => {
      console.warn('批量解析工作区资产失败。', error);
    });
  }, [assetIds.length, ensureDocumentAssetsResolved, rootPath]);

  const resolveMediaSource = React.useCallback<WorkspaceMediaSourceResolver>(
    async (request) => {
      if (request.signal.aborted) {
        return null;
      }

      const projectedStorageReference =
        cacheRootPathRef.current === rootPath
          ? displayToStorageRef.current.get(request.src)
          : undefined;
      const assetId = getWorkspaceAssetIdFromReference(
        projectedStorageReference ?? request.src,
      );

      if (!assetId) {
        return { src: request.src };
      }

      if (!rootPath) {
        return null;
      }

      const cache = getWorkspaceAssetResolverCache(rootPath);

      if (cache.results.has(assetId)) {
        const cached = cache.results.get(assetId) ?? null;

        if (cached && cacheRootPathRef.current === rootPath) {
          displayToStorageRef.current.set(
            cached.src,
            `${LOCAL_ASSET_URL_PREFIX}${assetId}`,
          );
        }

        return cached;
      }

      const resolved = assetIdSet.has(assetId)
        ? await ensureDocumentAssetsResolved()
        : await resolveWorkspaceAssetIds(rootPath, [assetId]);
      const result = resolved.get(assetId) ?? null;

      if (result && cacheRootPathRef.current === rootPath) {
        displayToStorageRef.current.set(
          result.src,
          `${LOCAL_ASSET_URL_PREFIX}${assetId}`,
        );
      }

      return request.signal.aborted ? null : result;
    },
    [assetIdSet, ensureDocumentAssetsResolved, rootPath],
  );

  const toStorageMarkdown = React.useCallback(
    (markdown: string) => {
      const displayRestored = replaceMappedValues(
        markdown,
        cacheRootPathRef.current === rootPath
          ? displayToStorageRef.current
          : new Map(),
      );
      const legacyReplacements = new Map<string, string>();
      const cache = rootPath
        ? getWorkspaceAssetResolverCache(rootPath)
        : null;

      for (const reference of extractWorkspaceAssetReferences(displayRestored)) {
        const assetId = getWorkspaceAssetIdFromReference(reference);

        if (!assetId || reference.startsWith(LOCAL_ASSET_URL_PREFIX)) {
          continue;
        }

        if (cache?.results.get(assetId)) {
          legacyReplacements.set(
            reference,
            `${LOCAL_ASSET_URL_PREFIX}${assetId}`,
          );
        }
      }

      return replaceMappedValues(displayRestored, legacyReplacements);
    },
    [rootPath],
  );

  const onSlashCommandUpload = React.useCallback<MarkweaveSlashCommandUploadHandler>(
    async (request) => {
      if (request.source.type !== 'file') {
        return createDirectUploadResult(
          request.source.value,
          request.source.mimeType,
        );
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

      if (cacheRootPathRef.current === rootPath) {
        displayToStorageRef.current.set(displayUrl, storageReference);
      }
      setWorkspaceAssetResolverResult(
        getWorkspaceAssetResolverCache(rootPath),
        uploaded.id,
        { src: displayUrl },
      );

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
    editorMarkdown: storageMarkdown,
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

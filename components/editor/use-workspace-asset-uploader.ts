'use client';

import * as React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type {
  MarkweaveAttachmentDownloadHandler,
  MarkweaveSlashCommandUploadHandler,
  MarkweaveUploadResult,
} from '@markweave/react';

import {
  isTauriRuntime,
  readWorkspaceAssetData,
  resolveWorkspaceAssets,
  selectWorkspaceAssetDownloadPath,
  uploadWorkspaceAsset,
  writeExportFile,
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
import {
  getDrawingClipboardAssetReference,
  normalizeDrawingClipboardAssetReferences,
} from '@/components/editor/drawing-markdown-reference';

export interface WorkspaceAssetUploadBridge {
  editorMarkdown: string;
  onAttachmentDownload: MarkweaveAttachmentDownloadHandler;
  onSlashCommandUpload: MarkweaveSlashCommandUploadHandler;
  resolveMediaSource: WorkspaceMediaSourceResolver;
  toStorageMarkdown: (markdown: string) => string;
}

export interface WorkspaceMediaSourceRequest {
  attempt?: number;
  kind: 'attachment' | 'image' | 'video';
  priority: 'background' | 'nearby' | 'visible';
  reason?: 'image-error' | 'initial' | 'output' | 'retry' | 'viewport';
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

interface WorkspaceAssetResolverCacheEntry {
  expiresAt: number | null;
  result: WorkspaceMediaSourceResult | null;
  status: 'missing' | 'resolved' | 'unreadable';
}

interface WorkspaceAssetResolverPendingEntry {
  forceRefresh: boolean;
  promise: Promise<WorkspaceMediaSourceResult | null>;
  token: object;
}

interface WorkspaceAssetResolverCache {
  pending: Map<string, WorkspaceAssetResolverPendingEntry>;
  results: Map<string, WorkspaceAssetResolverCacheEntry>;
}

const WORKSPACE_ASSET_CACHE_ROOT_LIMIT = 8;
const WORKSPACE_ASSET_CACHE_ENTRY_LIMIT = 8_192;
const WORKSPACE_ASSET_NEGATIVE_CACHE_TTL_MS = 5_000;
const WORKSPACE_ASSET_RESOLVE_BATCH_LIMIT = 2_048;
const DOCUMENT_RECOVERY_COALESCE_MS = 750;
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
  status: WorkspaceAssetResolverCacheEntry['status'] = result
    ? 'resolved'
    : 'missing',
) {
  const entry: WorkspaceAssetResolverCacheEntry = {
    expiresAt:
      status === 'resolved'
        ? null
        : Date.now() + WORKSPACE_ASSET_NEGATIVE_CACHE_TTL_MS,
    result,
    status,
  };
  cache.results.delete(assetId);
  cache.results.set(assetId, entry);

  while (cache.results.size > WORKSPACE_ASSET_CACHE_ENTRY_LIMIT) {
    const oldestAssetId = cache.results.keys().next().value;

    if (typeof oldestAssetId !== 'string') {
      break;
    }

    cache.results.delete(oldestAssetId);
  }
}

function getWorkspaceAssetResolverResult(
  cache: WorkspaceAssetResolverCache,
  assetId: string,
) {
  const entry = cache.results.get(assetId);

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    cache.results.delete(assetId);
    return undefined;
  }

  cache.results.delete(assetId);
  cache.results.set(assetId, entry);
  return entry;
}

function startWorkspaceAssetResolutionBatch(
  cache: WorkspaceAssetResolverCache,
  rootPath: string,
  assetIds: readonly string[],
  forceRefresh: boolean,
) {
  const token = {};
  const requestedAssetIds = new Set(assetIds);
  const perf = startWorkspacePerformanceMeasure(
    'workspace.assets.resolve_batch',
  );
  incrementWorkspacePerformanceCounter('workspace.assets.ipc_count');

  const batchPromise = Promise.resolve(
    resolveWorkspaceAssets(rootPath, [...assetIds]),
  )
    .then((resolution) => {
      let missingCount = 0;
      let resolvedCount = 0;
      let unreadableCount = 0;
      const batchResults = new Map<
        string,
        WorkspaceMediaSourceResult | null
      >();
      const itemById = new Map(
        resolution.items
          .filter((item) => requestedAssetIds.has(item.id))
          .map((item) => [item.id, item] as const),
      );

      for (const assetId of assetIds) {
        if (cache.pending.get(assetId)?.token !== token) {
          continue;
        }

        const item = itemById.get(assetId);

        if (item?.status === 'resolved' && item.asset) {
          resolvedCount += 1;
          const result = {
            height: item.asset.height,
            src: convertFileSrc(item.asset.absolutePath),
            width: item.asset.width,
          };
          batchResults.set(assetId, result);
          setWorkspaceAssetResolverResult(cache, assetId, result);
          continue;
        }

        const status = item?.status === 'unreadable'
          ? 'unreadable'
          : 'missing';

        if (status === 'unreadable') {
          unreadableCount += 1;
        } else {
          missingCount += 1;
        }
        batchResults.set(assetId, null);
        setWorkspaceAssetResolverResult(cache, assetId, null, status);
      }

      if (unreadableCount > 0) {
        console.warn('部分工作区资产无法读取。', {
          count: unreadableCount,
        });
      }

      perf.finish({
        missing: missingCount,
        requested: assetIds.length,
        resolved: resolvedCount,
        unreadable: unreadableCount,
      });
      return batchResults;
    })
    .catch((error) => {
      perf.finish({
        requested: assetIds.length,
        status: 'failed',
      });
      throw error;
    });

  for (const assetId of assetIds) {
    const entry: WorkspaceAssetResolverPendingEntry = {
      forceRefresh,
      promise: Promise.resolve(null),
      token,
    };
    entry.promise = batchPromise
      .then((batchResults) => batchResults.get(assetId) ?? null)
      .finally(() => {
        if (cache.pending.get(assetId) === entry) {
          cache.pending.delete(assetId);
        }
      });
    cache.pending.set(assetId, entry);
  }
}

async function resolveWorkspaceAssetIds(
  rootPath: string,
  assetIds: readonly string[],
  options: {
    forceRefresh?: boolean;
  } = {},
) {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  const cache = getWorkspaceAssetResolverCache(rootPath);
  const forceRefresh = options.forceRefresh === true;

  if (forceRefresh) {
    const ordinaryPending = uniqueAssetIds
      .map((assetId) => cache.pending.get(assetId))
      .filter(
        (entry): entry is WorkspaceAssetResolverPendingEntry =>
          Boolean(entry && !entry.forceRefresh),
      );

    if (ordinaryPending.length > 0) {
      await Promise.allSettled(ordinaryPending.map((entry) => entry.promise));
      return resolveWorkspaceAssetIds(rootPath, uniqueAssetIds, {
        forceRefresh: true,
      });
    }
  }

  const unresolvedAssetIds = uniqueAssetIds.filter((assetId) => {
    if (cache.pending.has(assetId)) {
      return false;
    }

    return forceRefresh || !getWorkspaceAssetResolverResult(cache, assetId);
  });

  for (
    let offset = 0;
    offset < unresolvedAssetIds.length;
    offset += WORKSPACE_ASSET_RESOLVE_BATCH_LIMIT
  ) {
    startWorkspaceAssetResolutionBatch(
      cache,
      rootPath,
      unresolvedAssetIds.slice(
        offset,
        offset + WORKSPACE_ASSET_RESOLVE_BATCH_LIMIT,
      ),
      forceRefresh,
    );
  }

  const resolved = new Map<string, WorkspaceMediaSourceResult | null>();
  await Promise.all(
    uniqueAssetIds.map(async (assetId) => {
      const pending = cache.pending.get(assetId);

      if (pending) {
        resolved.set(assetId, await pending.promise);
        return;
      }
      resolved.set(
        assetId,
        getWorkspaceAssetResolverResult(cache, assetId)?.result ?? null,
      );
    }),
  );

  return resolved;
}

function waitForMediaResolutionOrAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return Promise.resolve<T | null>(null);
  }

  return new Promise<T | null>((resolve, reject) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', aborted);
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', aborted);
      reject(error);
    };
    const aborted = () => finish(null);

    signal.addEventListener('abort', aborted, { once: true });
    void promise.then(finish, fail);
    if (signal.aborted) {
      aborted();
    }
  });
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
    forceRefresh: boolean;
    key: string;
    promise: Promise<Map<string, WorkspaceMediaSourceResult | null>>;
    settledAt: number | null;
  } | null>(null);
  const ensureDocumentAssetsResolved = React.useCallback((
    forceRefresh = false,
  ) => {
    if (!rootPath || assetIds.length === 0) {
      return Promise.resolve(
        new Map<string, WorkspaceMediaSourceResult | null>(),
      );
    }

    const current = documentResolutionRef.current;

    if (current?.key === documentResolutionKey) {
      if (current.settledAt === null) {
        if (!forceRefresh || current.forceRefresh) {
          return current.promise;
        }

        const request = current.promise
          .catch(() => undefined)
          .then(() =>
            resolveWorkspaceAssetIds(rootPath, assetIds, {
              forceRefresh: true,
            }),
          );
        return storeDocumentResolution(request, true);
      }

      if (
        current.forceRefresh &&
        Date.now() - current.settledAt <= DOCUMENT_RECOVERY_COALESCE_MS
      ) {
        return current.promise;
      }
    }

    return storeDocumentResolution(
      resolveWorkspaceAssetIds(rootPath, assetIds, { forceRefresh }),
      forceRefresh,
    );

    function storeDocumentResolution(
      request: Promise<Map<string, WorkspaceMediaSourceResult | null>>,
      isForced: boolean,
    ) {
      const entry = {
        forceRefresh: isForced,
        key: documentResolutionKey,
        promise: Promise.resolve(
          new Map<string, WorkspaceMediaSourceResult | null>(),
        ),
        settledAt: null as number | null,
      };
      const promise = request.then(
        (resolved) => {
          entry.settledAt = Date.now();
          if (
            !entry.forceRefresh &&
            documentResolutionRef.current === entry
          ) {
            documentResolutionRef.current = null;
          }
          return resolved;
        },
        (error) => {
          if (documentResolutionRef.current === entry) {
            documentResolutionRef.current = null;
          }
          throw error;
        },
      );
      entry.promise = promise;
      documentResolutionRef.current = entry;
      return promise;
    }
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
        projectedStorageReference ??
          getDrawingClipboardAssetReference(request.src) ??
          request.src,
      );

      if (!assetId) {
        return { src: request.src };
      }

      if (!rootPath) {
        return null;
      }

      const cache = getWorkspaceAssetResolverCache(rootPath);
      const forceRefresh =
        (request.attempt ?? 1) > 1 ||
        request.reason === 'image-error' ||
        request.reason === 'output' ||
        request.reason === 'retry';
      const cached = forceRefresh
        ? undefined
        : getWorkspaceAssetResolverResult(cache, assetId);

      if (cached) {
        if (cached.result && cacheRootPathRef.current === rootPath) {
          displayToStorageRef.current.set(
            cached.result.src,
            `${LOCAL_ASSET_URL_PREFIX}${assetId}`,
          );
        }

        return cached.result;
      }

      const resolution = assetIdSet.has(assetId)
        ? ensureDocumentAssetsResolved(forceRefresh)
        : resolveWorkspaceAssetIds(rootPath, [assetId], { forceRefresh });
      const resolved = await waitForMediaResolutionOrAbort(
        resolution,
        request.signal,
      );

      if (
        !resolved ||
        cacheRootPathRef.current !== rootPath ||
        getWorkspaceAssetResolverCache(rootPath) !== cache
      ) {
        return null;
      }

      const result = resolved.get(assetId) ?? null;

      if (result) {
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
      const displayRestored = normalizeDrawingClipboardAssetReferences(
        replaceMappedValues(
          markdown,
          cacheRootPathRef.current === rootPath
            ? displayToStorageRef.current
            : new Map(),
        ),
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

        if (cache && getWorkspaceAssetResolverResult(cache, assetId)?.result) {
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

      const total = Number.isFinite(file.size) ? file.size : null;
      request.onProgress?.({ loaded: 0, total });

      const base64Data = await fileToBase64(file, (loaded) => {
        request.onProgress?.({ loaded, total });
      });

      request.onProgress?.({
        loaded: total ?? file.size,
        total,
      });

      const uploaded = await uploadWorkspaceAsset(rootPath, {
        fileName: getUploadFileName(file),
        mediaType: file.type || 'application/octet-stream',
        base64Data,
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

      // 附件按宿主协议持久化不透明定位符；图片/视频继续返回可显示 URL。
      if (request.kind === 'attachment') {
        return {
          src: storageReference,
          name: uploaded.name,
          mimeType: uploaded.mediaType,
          size: uploaded.size,
        };
      }

      return {
        src: displayUrl,
        name: uploaded.name,
        mimeType: uploaded.mediaType,
        size: uploaded.size,
      };
    },
    [rootPath],
  );

  const onAttachmentDownload = React.useCallback<MarkweaveAttachmentDownloadHandler>(
    async (attachment) => {
      if (!rootPath) {
        throw new Error('未打开工作区，无法下载附件。');
      }

      const projectedStorageReference =
        cacheRootPathRef.current === rootPath
          ? displayToStorageRef.current.get(attachment.src)
          : undefined;
      const assetId = getWorkspaceAssetIdFromReference(
        projectedStorageReference ?? attachment.src,
      );

      if (!assetId) {
        throw new Error('无法识别附件资源定位符。');
      }

      const data = await readWorkspaceAssetData(rootPath, assetId);
      const fileName = attachment.name?.trim() || data.name;
      const targetPath = await selectWorkspaceAssetDownloadPath(
        fileName,
        attachment.mimeType ?? data.mediaType,
      );

      if (!targetPath) {
        return;
      }

      if (isTauriRuntime()) {
        await writeExportFile(targetPath, data.base64Data);
        return;
      }

      triggerBrowserAttachmentDownload(
        fileName,
        attachment.mimeType ?? data.mediaType,
        data.base64Data,
      );
    },
    [rootPath],
  );

  return {
    editorMarkdown: storageMarkdown,
    onAttachmentDownload,
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

function fileToBase64(
  file: File,
  onProgress?: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };

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

      onProgress?.(file.size);
      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });
}

function triggerBrowserAttachmentDownload(
  fileName: string,
  mediaType: string,
  base64Data: string,
) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const objectUrl = URL.createObjectURL(
    new Blob([bytes], { type: mediaType || 'application/octet-stream' }),
  );
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'attachment';
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

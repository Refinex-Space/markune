'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  decodeTextSource,
  prepareHtmlImport,
  prepareMarkdownImport,
} from './document-import-core';
import { preparePdfImport } from './document-import-pdf';
import { DocumentImportReportDialog } from './document-import-report-dialog';
import { prepareWordImport } from './document-import-word';
import {
  beginDocumentImportCommit,
  cancelDocumentImport,
  commitDocumentImport,
  isTauriRuntime,
  readDocumentImportSource,
  releaseDocumentImportGrant,
  selectDocumentImportSources,
  stageDocumentImportAsset,
  stageDocumentImportSourceAsset,
} from './workspace-api';

import type { PreparedImportDocument } from './document-import-core';
import type { DocumentImportReportItem } from './document-import-report-dialog';
import type {
  WorkspaceImportFormat,
  WorkspaceNode,
} from './workspace-types';

interface UseDocumentImportOptions {
  openDocument: (node: WorkspaceNode) => Promise<void> | void;
  refreshWorkspaceTree: () => Promise<unknown>;
  rootPath: string | null;
}

const FORMAT_LABEL: Record<WorkspaceImportFormat, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  pdf: 'PDF',
  word: 'Word',
};

const FILE_TIMEOUT_MS = 15 * 60 * 1_000;

export function useDocumentImport({
  openDocument,
  refreshWorkspaceTree,
  rootPath,
}: UseDocumentImportOptions) {
  const available = React.useSyncExternalStore(
    subscribeToDocumentImportRuntime,
    isTauriRuntime,
    getServerDocumentImportRuntime,
  );
  const importingRef = React.useRef(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const activeSessionIdRef = React.useRef<string | null>(null);
  const [reportItems, setReportItems] = React.useState<
    DocumentImportReportItem[]
  >([]);
  const [reportOpen, setReportOpen] = React.useState(false);

  const cancelImport = React.useCallback(() => {
    abortControllerRef.current?.abort();
    const sessionId = activeSessionIdRef.current;
    if (sessionId) {
      void cancelDocumentImport(sessionId).catch(() => undefined);
    }
  }, []);

  React.useEffect(() => cancelImport, [cancelImport]);

  const importDocuments = React.useCallback(
    async (targetDir: string, format: WorkspaceImportFormat) => {
      if (!available || !rootPath) {
        return;
      }
      if (importingRef.current) {
        toast.info('已有文档正在导入，请稍候。');
        return;
      }

      let grant;
      try {
        grant = await selectDocumentImportSources(format);
      } catch (error) {
        toast.error(`${FORMAT_LABEL[format]} 文件选择失败`, {
          description: errorMessage(error),
        });
        return;
      }
      if (!grant || grant.sources.length === 0) {
        return;
      }

      importingRef.current = true;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const report: DocumentImportReportItem[] = [];
      const createdNodes: WorkspaceNode[] = [];
      const toastId = toast.loading(`正在导入 ${FORMAT_LABEL[format]}…`, {
        description: `共 ${grant.sources.length} 个文件`,
        action: { label: '取消', onClick: cancelImport },
      });

      try {
        for (let index = 0; index < grant.sources.length; index += 1) {
          if (controller.signal.aborted) {
            break;
          }
          const source = grant.sources[index];
          const fileController = new AbortController();
          const abortFile = () => fileController.abort();
          controller.signal.addEventListener('abort', abortFile, { once: true });
          let sessionId: string | null = null;
          try {
            updateImportToast(
              toastId,
              `正在读取 ${source.fileName}`,
              `${index + 1}/${grant.sources.length}`,
              cancelImport,
            );
            const bytes = await readDocumentImportSource(
              grant.grantId,
              source.sourceId,
            );
            const prepared = await withImportTimeout(
              prepareSourceDocument(source, bytes, {
                onProgress(message) {
                  updateImportToast(
                    toastId,
                    message,
                    `${index + 1}/${grant.sources.length}`,
                    cancelImport,
                  );
                },
                requestPassword: async (attempt) =>
                  window.prompt(`请输入 PDF 密码（第 ${attempt}/3 次）：`) || null,
                signal: fileController.signal,
              }),
              fileController.signal,
              () => fileController.abort(),
            );
            throwIfAborted(controller.signal);

            updateImportToast(
              toastId,
              `正在写入 ${prepared.title}`,
              `${index + 1}/${grant.sources.length}`,
              cancelImport,
            );
            const commitSession = await beginDocumentImportCommit(
              rootPath,
              targetDir,
              {
                assets: prepared.assets.map((asset) => ({
                  fileName: asset.fileName,
                  mediaType: asset.mediaType,
                  size: asset.size,
                  token: asset.token,
                })),
                markdown: prepared.markdown,
                title: prepared.title,
              },
            );
            sessionId = commitSession.sessionId;
            activeSessionIdRef.current = sessionId;

            for (const asset of prepared.assets) {
              throwIfAborted(controller.signal);
              if (asset.kind === 'inline' && asset.data) {
                await stageDocumentImportAsset(sessionId, asset.token, asset.data);
              } else if (asset.kind === 'source' && asset.reference) {
                await stageDocumentImportSourceAsset(
                  sessionId,
                  asset.token,
                  grant.grantId,
                  source.sourceId,
                  asset.reference,
                );
              } else {
                throw new Error(`导入图片缺少内容：${asset.fileName}`);
              }
            }

            const committed = await commitDocumentImport(sessionId);
            activeSessionIdRef.current = null;
            sessionId = null;
            createdNodes.push(committed.node);
            report.push({
              fileName: source.fileName,
              status: 'success',
              warnings: [...prepared.warnings, ...committed.warnings],
            });
          } catch (error) {
            if (sessionId) {
              await cancelDocumentImport(sessionId).catch(() => undefined);
            }
            activeSessionIdRef.current = null;
            if (controller.signal.aborted || isAbortError(error)) {
              break;
            }
            report.push({
              fileName: source.fileName,
              message: errorMessage(error),
              status: 'failed',
              warnings: [],
            });
          } finally {
            controller.signal.removeEventListener('abort', abortFile);
          }
        }

        if (createdNodes.length > 0) {
          await refreshWorkspaceTree();
          await openDocument(createdNodes[0]);
        }

        const failedCount = report.filter((item) => item.status === 'failed').length;
        const warningCount = report.reduce(
          (count, item) => count + item.warnings.length,
          0,
        );
        setReportItems(report);
        if (failedCount > 0 || warningCount > 0) {
          setReportOpen(true);
        }

        if (controller.signal.aborted) {
          toast.info('文档导入已取消', {
            id: toastId,
            description: `已完成 ${createdNodes.length} 个文件`,
          });
        } else if (createdNodes.length === 0) {
          toast.error('文档导入失败', {
            id: toastId,
            description: `${failedCount} 个文件未能导入`,
            action: { label: '查看详情', onClick: () => setReportOpen(true) },
          });
        } else {
          toast.success('文档导入完成', {
            id: toastId,
            description: `成功 ${createdNodes.length} 个，失败 ${failedCount} 个，警告 ${warningCount} 条`,
            duration: 10_000,
            action:
              failedCount > 0 || warningCount > 0
                ? { label: '查看详情', onClick: () => setReportOpen(true) }
                : undefined,
          });
        }
      } finally {
        await releaseDocumentImportGrant(grant.grantId).catch(() => undefined);
        activeSessionIdRef.current = null;
        abortControllerRef.current = null;
        importingRef.current = false;
      }
    },
    [available, cancelImport, openDocument, refreshWorkspaceTree, rootPath],
  );

  return {
    available,
    importDocuments,
    reportDialog: (
      <DocumentImportReportDialog
        items={reportItems}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    ),
  };
}

async function prepareSourceDocument(
  source: Parameters<typeof prepareMarkdownImport>[0],
  bytes: Uint8Array,
  options: {
    onProgress: (message: string) => void;
    requestPassword: (attempt: number) => Promise<string | null>;
    signal: AbortSignal;
  },
): Promise<PreparedImportDocument> {
  switch (source.format) {
    case 'markdown':
      options.onProgress(`正在解析 Markdown：${source.fileName}`);
      return prepareMarkdownImport(source, bytes);
    case 'html': {
      options.onProgress(`正在清洗 HTML：${source.fileName}`);
      const decoded = decodeTextSource(bytes, 'html');
      return prepareHtmlImport({
        html: decoded.text,
        source,
        warnings: decoded.warnings,
      });
    }
    case 'word':
      options.onProgress(`正在转换 Word：${source.fileName}`);
      return prepareWordImport(source, bytes);
    case 'pdf':
      return preparePdfImport(source, bytes, {
        onProgress: (progress) => options.onProgress(progress.message),
        requestPassword: options.requestPassword,
        signal: options.signal,
      });
  }
}

function updateImportToast(
  id: string | number,
  message: string,
  description: string,
  onCancel: () => void,
) {
  toast.loading(message, {
    id,
    description,
    action: { label: '取消', onClick: onCancel },
  });
}

function withImportTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onTimeout: () => void,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('单个文件转换超过 15 分钟限制。'));
      onTimeout();
    }, FILE_TIMEOUT_MS);
    const onAbort = () => reject(new DOMException('导入已取消。', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('导入已取消。', 'AbortError');
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function subscribeToDocumentImportRuntime() {
  return () => {};
}

function getServerDocumentImportRuntime() {
  return false;
}

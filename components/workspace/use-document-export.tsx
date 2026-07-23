'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/editor/markdown-editor';

import {
  createPrimaryExportFile,
  createStaticExportHtml,
  prepareDocumentAssets,
  sanitizeExportFileStem,
  sanitizeMarkweaveSnapshot,
  waitForExportRender,
} from './document-export-core';
import {
  buildWordSemanticDocument,
  packWordDocument,
} from './document-export-word';
import {
  isTauriRuntime,
  openPathInFileManager,
  printDocumentPdf,
  selectDocumentExportDirectory,
  writeDocumentExportBundle,
} from './workspace-api';
import type {
  PageWidthMode,
  DocumentExportResult,
  WorkspaceExportFormat,
  WorkspaceNode,
} from './workspace-types';

interface UseDocumentExportOptions {
  pageWidthMode: PageWidthMode;
  rootPath: string | null;
  theme: 'dark' | 'light';
}

interface ExportDocumentRequest {
  loadMarkdown: () => Promise<string>;
  node: WorkspaceNode;
}

interface RenderRequest {
  id: number;
  markdown: string;
  pageWidthMode: PageWidthMode;
  theme: 'dark' | 'light';
}

interface PendingRender {
  reject: (error: Error) => void;
  resolve: (root: HTMLElement) => void;
}

const FORMAT_LABEL: Record<WorkspaceExportFormat, string> = {
  html: 'HTML',
  markdown: 'Markdown',
  pdf: 'PDF',
  word: 'Word',
};

export function useDocumentExport({
  pageWidthMode,
  rootPath,
  theme,
}: UseDocumentExportOptions) {
  const available = React.useSyncExternalStore(
    subscribeToDocumentExportRuntime,
    isTauriRuntime,
    getServerDocumentExportRuntime,
  );
  const [renderRequest, setRenderRequest] =
    React.useState<RenderRequest | null>(null);
  const pendingRenderRef = React.useRef<PendingRender | null>(null);
  const renderRequestIdRef = React.useRef(0);
  const exportingRef = React.useRef(false);

  React.useEffect(
    () => () => {
      pendingRenderRef.current?.reject(new Error('导出渲染器已销毁。'));
      pendingRenderRef.current = null;
    },
    [],
  );

  const renderMarkdown = React.useCallback(
    (markdown: string, renderTheme: 'dark' | 'light') => {
      pendingRenderRef.current?.reject(new Error('已有导出渲染任务被替换。'));
      renderRequestIdRef.current += 1;

      return new Promise<HTMLElement>((resolve, reject) => {
        pendingRenderRef.current = { resolve, reject };
        setRenderRequest({
          id: renderRequestIdRef.current,
          markdown,
          pageWidthMode,
          theme: renderTheme,
        });
      });
    },
    [pageWidthMode],
  );

  const clearRenderer = React.useCallback(() => {
    pendingRenderRef.current = null;
    setRenderRequest(null);
  }, []);

  const onRendererReady = React.useCallback(
    (id: number, root: HTMLElement) => {
      if (id !== renderRequestIdRef.current || !pendingRenderRef.current) {
        return;
      }

      pendingRenderRef.current.resolve(root);
      pendingRenderRef.current = null;
    },
    [],
  );

  const onRendererError = React.useCallback((id: number, error: Error) => {
    if (id !== renderRequestIdRef.current || !pendingRenderRef.current) {
      return;
    }

    pendingRenderRef.current.reject(error);
    pendingRenderRef.current = null;
  }, []);

  const exportDocument = React.useCallback(
    async (
      request: ExportDocumentRequest,
      format: WorkspaceExportFormat,
    ) => {
      if (!available || !rootPath || request.node.kind !== 'document') {
        return;
      }

      if (exportingRef.current) {
        toast.info('已有文档正在导出，请稍候。');
        return;
      }

      const grant = await selectDocumentExportDirectory();
      if (!grant) {
        return;
      }

      exportingRef.current = true;
      let phase = '读取文档';
      const toastId = toast.loading(`正在导出 ${FORMAT_LABEL[format]}…`, {
        description: `目标文件夹：${grant.displayPath}`,
      });

      try {
        const markdown = await request.loadMarkdown();
        const title =
          request.node.title?.trim() ||
          request.node.name.replace(/\.md$/iu, '') ||
          request.node.name;
        const fileStem = sanitizeExportFileStem(title, request.node.name);

        phase = '解析本地资源';
        const prepared = await prepareDocumentAssets(rootPath, markdown);
        const warnings = [...prepared.warnings];
        let result: DocumentExportResult;

        if (format === 'markdown') {
          phase = '写入 Markdown 文件包';
          result = await writeDocumentExportBundle(
            grant.grantId,
            format,
            fileStem,
            [
              createPrimaryExportFile(
                `${fileStem}.md`,
                prepared.portableMarkdown,
              ),
              ...prepared.allAssetFiles,
            ],
          );
        } else {
          phase = '等待 Markweave 高保真渲染';
          const renderRoot = await renderMarkdown(
            prepared.renderMarkdown,
            format === 'html' ? theme : 'light',
          );
          const timedOut = renderRoot.dataset.exportTimedOut === 'true';
          const snapshot = sanitizeMarkweaveSnapshot(renderRoot);

          if (timedOut) {
            warnings.push('渲染稳定等待超过 15 秒，已按当前可见内容继续导出。');
          }

          if (format === 'word') {
            phase = '构建语义 Word 文档';
            const semantic = buildWordSemanticDocument(snapshot);
            const packed = await packWordDocument(semantic, title);

            warnings.push(...packed.warnings);
            phase = '写入 Word 文件';
            result = await writeDocumentExportBundle(
              grant.grantId,
              format,
              fileStem,
              [createPrimaryExportFile(`${fileStem}.docx`, packed.bytes)],
            );
          } else {
            phase = format === 'pdf' ? '构建打印页面' : '构建静态 HTML';
            const staticPage = await createStaticExportHtml({
              content: snapshot,
              forPrint: format === 'pdf',
              pageWidthMode,
              theme: format === 'pdf' ? 'light' : theme,
              title,
            });

            warnings.push(...staticPage.warnings);
            if (format === 'pdf') {
              phase = '调用系统原生 PDF 打印';
              result = await printDocumentPdf(
                grant.grantId,
                fileStem,
                staticPage.html,
              );
            } else {
              phase = '写入 HTML 文件包';
              result = await writeDocumentExportBundle(
                grant.grantId,
                format,
                fileStem,
                [
                  createPrimaryExportFile(`${fileStem}.html`, staticPage.html),
                  ...prepared.htmlAssetFiles,
                ],
              );
            }
          }
        }

        const allWarnings = [...warnings, ...result.warnings];
        toast.success(`${FORMAT_LABEL[format]} 导出完成`, {
          id: toastId,
          description:
            allWarnings.length > 0
              ? `${result.primaryPath}（${allWarnings.length} 条警告）`
              : result.primaryPath,
          duration: 10_000,
          action: {
            label: '在文件夹中显示',
            onClick: () => void openPathInFileManager(result.primaryPath),
          },
        });

        if (allWarnings.length > 0) {
          console.warn('Document export warnings:', allWarnings);
          toast.warning(`导出完成，但有 ${allWarnings.length} 条警告`, {
            description: [
              ...allWarnings.slice(0, 3),
              ...(allWarnings.length > 3
                ? [`另有 ${allWarnings.length - 3} 条警告`] : []),
            ].join('；'),
            duration: 12_000,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        toast.error(`${FORMAT_LABEL[format]} 导出失败`, {
          id: toastId,
          description: `${phase}：${message}`,
          duration: 12_000,
        });
      } finally {
        exportingRef.current = false;
        clearRenderer();
      }
    },
    [available, clearRenderer, pageWidthMode, renderMarkdown, rootPath, theme],
  );

  return {
    available,
    exportDocument,
    renderer: renderRequest ? (
      <DocumentExportRenderer
        key={renderRequest.id}
        request={renderRequest}
        onError={onRendererError}
        onReady={onRendererReady}
      />
    ) : null,
  };
}

function subscribeToDocumentExportRuntime() {
  return () => {};
}

function getServerDocumentExportRuntime() {
  return false;
}

function DocumentExportRenderer({
  request,
  onError,
  onReady,
}: {
  request: RenderRequest;
  onError: (id: number, error: Error) => void;
  onReady: (id: number, root: HTMLElement) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function prepareSnapshot() {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      const root = hostRef.current?.querySelector<HTMLElement>(
        '.madora-markweave-editor',
      );

      if (!root) {
        throw new Error('未找到 Markweave 导出渲染结果。');
      }

      const timedOut = await waitForExportRender(root);
      if (!cancelled) {
        root.dataset.exportTimedOut = String(timedOut);
        onReady(request.id, root);
      }
    }

    prepareSnapshot().catch((error) => {
      if (!cancelled) {
        onError(
          request.id,
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onError, onReady, request.id]);

  return (
    <div
      aria-hidden="true"
      ref={hostRef}
      style={{
        contain: 'layout paint style',
        height: 1123,
        left: 0,
        opacity: 0,
        pointerEvents: 'none',
        position: 'fixed',
        top: 0,
        width: request.pageWidthMode === 'wide' ? 1120 : 860,
        zIndex: -1,
      }}
    >
      <div className={request.theme === 'dark' ? 'dark' : undefined}>
        <MarkdownEditor
          documentKey={`export:${request.id}`}
          markdown={request.markdown}
          pageWidthMode={request.pageWidthMode}
          readOnly
          themeOverride={request.theme}
          workspaceRootPath={null}
        />
      </div>
    </div>
  );
}

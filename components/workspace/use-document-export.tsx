'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type {
  MarkweaveDocumentLoadState,
  MarkweaveOutputKind,
  MarkweaveOutputPreparationReport,
} from '@markweave/react';

import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from '@/components/editor/markdown-editor';

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
import { prepareProfessionalDocument } from './document-export-professional';
import {
  convertDocumentExport,
  getDocumentExportRuntimeInfo,
  isTauriRuntime,
  openPathInFileManager,
  printDocumentPdf,
  selectDocumentExportDirectory,
  writeDocumentExportBundle,
} from './workspace-api';
import type {
  PageWidthMode,
  DocumentExportResult,
  DocumentExportRuntimeInfo,
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
  outputKind: MarkweaveOutputKind;
  pageWidthMode: PageWidthMode;
  theme: 'dark' | 'light';
}

interface PreparedRender {
  outputReport: MarkweaveOutputPreparationReport;
  postBarrierTimedOut: boolean;
  root: HTMLElement;
}

interface PendingRender {
  reject: (error: Error) => void;
  resolve: (render: PreparedRender) => void;
}

const EXPORT_RENDER_TIMEOUT_MS = 15_000;

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
    (
      markdown: string,
      renderTheme: 'dark' | 'light',
      outputKind: MarkweaveOutputKind,
    ) => {
      pendingRenderRef.current?.reject(new Error('已有导出渲染任务被替换。'));
      renderRequestIdRef.current += 1;

      return new Promise<PreparedRender>((resolve, reject) => {
        pendingRenderRef.current = { resolve, reject };
        setRenderRequest({
          id: renderRequestIdRef.current,
          markdown,
          outputKind,
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
    (id: number, render: PreparedRender) => {
      if (id !== renderRequestIdRef.current || !pendingRenderRef.current) {
        return;
      }

      pendingRenderRef.current.resolve(render);
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
        let professionalRuntime: DocumentExportRuntimeInfo | null = null;
        if (format === 'pdf' || format === 'word') {
          phase = '检查专业导出运行时';
          professionalRuntime = await getDocumentExportRuntimeInfo();
        }

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
          const render = await renderMarkdown(
            prepared.renderMarkdown,
            format === 'html' ? theme : 'light',
            format === 'pdf' ? 'print' : 'dom-snapshot',
          );
          const snapshot = sanitizeMarkweaveSnapshot(render.root);
          warnings.push(...getMarkweaveOutputWarnings(render));

          if (format === 'word') {
            if (professionalRuntime?.professionalWord) {
              phase = '规范化专业 Word 文档';
              const professional = await prepareProfessionalDocument({
                markdown: prepared.portableMarkdown,
                reservedRelativePaths: prepared.allAssetFiles.map(
                  (file) => file.relativePath,
                ),
                snapshot,
              });

              warnings.push(...professional.warnings);
              phase = '调用 Pandoc 生成 Word';
              result = await convertDocumentExport(
                grant.grantId,
                format,
                fileStem,
                professional.markdown,
                [...prepared.allAssetFiles, ...professional.files],
              );
            } else {
              warnings.push(
                '专业 Word 运行时不可用，已使用兼容导出引擎。',
              );
              phase = '构建兼容 Word 文档';
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
            }
          } else if (
            format === 'pdf' &&
            professionalRuntime?.professionalPdf
          ) {
            phase = '规范化专业 PDF 文档';
            const professional = await prepareProfessionalDocument({
              markdown: prepared.portableMarkdown,
              reservedRelativePaths: prepared.allAssetFiles.map(
                (file) => file.relativePath,
              ),
              snapshot,
            });

            warnings.push(...professional.warnings);
            phase = '调用 Pandoc 与 Typst 生成 PDF';
            result = await convertDocumentExport(
              grant.grantId,
              format,
              fileStem,
              professional.markdown,
              [...prepared.allAssetFiles, ...professional.files],
            );
          } else {
            if (format === 'pdf') {
              warnings.push(
                '专业 PDF 运行时不可用，已使用系统兼容打印引擎。',
              );
            }
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
  onReady: (id: number, render: PreparedRender) => void;
}) {
  const editorRef = React.useRef<MarkdownEditorHandle | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const startedAtRef = React.useRef<number | null>(null);
  const [loadOutcome, setLoadOutcome] =
    React.useState<MarkweaveDocumentLoadState | null>(null);

  const handleDocumentLoadStateChange = React.useCallback(
    (state: MarkweaveDocumentLoadState) => {
      if (
        state.phase === 'ready' ||
        state.phase === 'error' ||
        state.phase === 'cancelled'
      ) {
        setLoadOutcome((current) => current ?? state);
      }
    },
    [],
  );

  React.useEffect(() => {
    startedAtRef.current = performance.now();
  }, []);

  React.useEffect(() => {
    if (loadOutcome) {
      return;
    }

    const startedAt = startedAtRef.current ?? performance.now();
    const timeout = window.setTimeout(() => {
      onError(
        request.id,
        new Error('Markweave 文档加载未在 15 秒内完成。'),
      );
    }, Math.max(0, startedAt + EXPORT_RENDER_TIMEOUT_MS - performance.now()));

    return () => window.clearTimeout(timeout);
  }, [loadOutcome, onError, request.id]);

  React.useEffect(() => {
    if (!loadOutcome) {
      return;
    }

    if (loadOutcome.phase === 'error') {
      onError(
        request.id,
        new Error(
          `Markweave 文档加载失败${
            loadOutcome.error ? `：${loadOutcome.error}` : '。'
          }`,
        ),
      );
      return;
    }
    if (loadOutcome.phase === 'cancelled') {
      onError(request.id, new Error('Markweave 文档加载已取消。'));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function prepareSnapshot() {
      const deadline =
        (startedAtRef.current ?? performance.now()) + EXPORT_RENDER_TIMEOUT_MS;

      const root = hostRef.current?.querySelector<HTMLElement>(
        '.markune-markweave-editor',
      );

      if (!root) {
        throw new Error('未找到 Markweave 导出渲染结果。');
      }

      const editor = editorRef.current;
      if (!editor) {
        throw new Error('Markweave 导出控制器尚未就绪。');
      }

      const barrierRemainingMs = Math.max(0, deadline - performance.now());
      if (barrierRemainingMs === 0) {
        throw new Error('Markweave 文档加载耗尽了 15 秒输出准备预算。');
      }

      const outputReport = await editor.prepareForOutput({
        kind: request.outputKind,
        signal: controller.signal,
        timeoutMs: barrierRemainingMs,
      });

      if (cancelled || controller.signal.aborted) {
        return;
      }
      if (outputReport.status === 'cancelled') {
        throw new Error('Markweave 输出准备已取消。');
      }

      const postBarrierTimedOut = await waitForExportRender(
        root,
        Math.max(0, deadline - performance.now()),
      );
      if (!cancelled) {
        onReady(request.id, {
          outputReport,
          postBarrierTimedOut,
          root,
        });
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
      controller.abort();
    };
  }, [loadOutcome, onError, onReady, request.id, request.outputKind]);

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
          onDocumentLoadStateChange={handleDocumentLoadStateChange}
          pageWidthMode={request.pageWidthMode}
          readOnly
          ref={editorRef}
          themeOverride={request.theme}
          workspaceRootPath={null}
        />
      </div>
    </div>
  );
}

function getMarkweaveOutputWarnings(render: PreparedRender) {
  const warnings: string[] = [];
  const report = render.outputReport;

  if (
    report.status === 'timed-out' ||
    report.timedOut > 0 ||
    render.postBarrierTimedOut
  ) {
    warnings.push(
      report.timedOut > 0
        ? `${report.timedOut} 个视觉资源未在 15 秒输出准备预算内完成，已按当前稳定结果继续导出。`
        : '图片解码或布局稳定检查未在 15 秒输出准备预算内完成，已按当前稳定结果继续导出。',
    );
  }
  if (report.missing > 0) {
    warnings.push(`${report.missing} 个视觉资源缺失，已保留可识别的占位或原始引用。`);
  }
  if (report.unreadable > 0) {
    warnings.push(`${report.unreadable} 个视觉资源不可读，已保留可识别的占位或原始引用。`);
  }

  return warnings;
}

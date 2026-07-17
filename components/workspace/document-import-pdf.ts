import { extractH1FromMarkdown } from '@/components/editor/markdown-frontmatter';

import {
  createCanonicalImportMarkdown,
  createInlineImportAsset,
  IMPORT_ASSET_PREFIX,
  normalizeImportTitle,
  sourceFileStem,
} from './document-import-core';

import type {
  PreparedImportAsset,
  PreparedImportDocument,
} from './document-import-core';
import type { DocumentImportSource } from './workspace-types';

interface PdfImportProgress {
  current: number;
  message: string;
  total: number;
}

interface PreparePdfImportOptions {
  onProgress?: (progress: PdfImportProgress) => void;
  requestPassword?: (attempt: number) => Promise<string | null>;
  signal?: AbortSignal;
}

interface PdfTextItem {
  height?: number;
  str: string;
  transform: number[];
  width?: number;
}

interface PdfLine {
  fontSize: number;
  markdown: string;
  text: string;
  y: number;
}

interface PdfPageExtraction {
  height: number;
  lines: PdfLine[];
  markdown: string;
}

interface PdfStructContent {
  id: string;
  type: string;
}

interface PdfStructNode {
  children: Array<PdfStructNode | PdfStructContent>;
  role: string;
}

const MAX_PDF_PAGES = 300;
const PDF_OCR_CHARACTER_THRESHOLD = 20;
const LOW_OCR_CONFIDENCE = 65;

export async function preparePdfImport(
  source: DocumentImportSource,
  bytes: Uint8Array,
  options: PreparePdfImportOptions = {},
): Promise<PreparedImportDocument> {
  if (typeof document === 'undefined') {
    throw new Error('当前运行环境不支持 PDF 导入。');
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = importRuntimeUrl('pdf.worker.min.mjs');
  const pdf = await openPdfDocument(pdfjs, bytes, options);
  if (pdf.numPages > MAX_PDF_PAGES) {
    await pdf.loadingTask.destroy();
    throw new Error(`PDF 超过 ${MAX_PDF_PAGES} 页限制。`);
  }

  const assets: PreparedImportAsset[] = [];
  const warnings: string[] = [];
  const pages: PdfPageExtraction[] = [];
  const ocrPages: Array<{ confidence: number; pageNumber: number }> = [];
  let ocrWorker: Awaited<ReturnType<typeof createOcrWorker>> | null = null;
  let metadataTitle: string | null = null;

  try {
    const metadata = await pdf.getMetadata().catch(() => null);
    const sourceMetadataTitle = readPdfMetadataTitle(metadata);
    if (sourceMetadataTitle) {
      metadataTitle = normalizeImportTitle(sourceMetadataTitle);
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted(options.signal);
      options.onProgress?.({
        current: pageNumber,
        message: `解析 PDF 第 ${pageNumber}/${pdf.numPages} 页`,
        total: pdf.numPages,
      });
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const [textContent, structTree, annotations] = await Promise.all([
        page.getTextContent({ includeMarkedContent: true }),
        page.getStructTree().catch(() => null),
        page.getAnnotations({ intent: 'display' }).catch(() => []),
      ]);
      const textItems = textContent.items.filter(isPdfTextItem) as PdfTextItem[];
      const lines = reconstructPdfLines(textItems, viewport.width);
      const structuredMarkdown = structTree
        ? reconstructStructuredPdfMarkdown(
            textContent.items,
            structTree as PdfStructNode,
            viewport.width,
          )
        : '';
      let pageMarkdown =
        structuredMarkdown || lines.map((line) => line.markdown).join('\n\n');
      const characterCount = lines
        .map((line) => line.text)
        .join('')
        .replace(/\s/gu, '').length;

      if (!structTree && characterCount > 0) {
        warnings.push(`PDF 第 ${pageNumber} 页没有结构树，已按坐标恢复阅读顺序。`);
      } else if (structTree && !structuredMarkdown && characterCount > 0) {
        warnings.push(`PDF 第 ${pageNumber} 页结构树无法映射文本，已按坐标恢复阅读顺序。`);
      }

      if (characterCount < PDF_OCR_CHARACTER_THRESHOLD) {
        options.onProgress?.({
          current: pageNumber,
          message: `OCR 识别 PDF 第 ${pageNumber}/${pdf.numPages} 页`,
          total: pdf.numPages,
        });
        const rendered = await renderPdfPage(page);
        ocrWorker ??= await createOcrWorker(options.onProgress, options.signal);
        const recognition = await withTimeout(
          ocrWorker.recognize(rendered.canvas),
          60_000,
          `PDF 第 ${pageNumber} 页 OCR 超时。`,
          options.signal,
        );
        const ocrText = recognition.data.text.trim();
        ocrPages.push({
          confidence: recognition.data.confidence,
          pageNumber,
        });
        if (ocrText) {
          pageMarkdown = normalizeOcrText(ocrText);
        }
        if (!ocrText || recognition.data.confidence < LOW_OCR_CONFIDENCE) {
          const asset = createInlineImportAsset(
            rendered.png,
            'image/png',
            `pdf-page-${pageNumber}.png`,
          );
          assets.push(asset);
          pageMarkdown = [
            pageMarkdown,
            `![PDF 第 ${pageNumber} 页原始图像](${IMPORT_ASSET_PREFIX}${asset.token})`,
          ]
            .filter(Boolean)
            .join('\n\n');
          warnings.push(
            `PDF 第 ${pageNumber} 页 OCR 置信度 ${Math.round(recognition.data.confidence)}，已保留原始页图像。`,
          );
        }
      } else {
        const extractedImages = await extractPdfRasterImages(
          page,
          pdfjs.OPS,
          pageNumber,
          warnings,
        );
        for (const asset of extractedImages.assets) {
          assets.push(asset);
          pageMarkdown = `${pageMarkdown}\n\n![PDF 第 ${pageNumber} 页图片](${IMPORT_ASSET_PREFIX}${asset.token})`.trim();
        }
        if (extractedImages.hasComplexVectorGraphics) {
          warnings.push(
            `PDF 第 ${pageNumber} 页包含复杂矢量图形，Markdown 仅保留可识别的文本和栅格图片。`,
          );
        }
      }

      const links = annotations
        .map((annotation: { url?: unknown }) => annotation.url)
        .filter((url): url is string => typeof url === 'string' && /^https?:\/\//iu.test(url));
      if (links.length > 0) {
        const uniqueLinks = Array.from(new Set(links));
        pageMarkdown = `${pageMarkdown}\n\n${uniqueLinks
          .map((url: string) => `[相关链接](${url})`)
          .join('\n')}`.trim();
      }

      pages.push({
        height: viewport.height,
        lines,
        markdown: pageMarkdown,
      });
      page.cleanup();
    }

    const body = removeRepeatedPdfMargins(pages)
      .map((page) => page.markdown.trim())
      .filter(Boolean)
      .join('\n\n');
    if (!body) {
      throw new Error('PDF 中没有可导入的文本或图像。');
    }
    const title = normalizeImportTitle(
      metadataTitle ?? extractH1FromMarkdown(body) ?? sourceFileStem(source.fileName),
    );

    return {
      assets,
      markdown: createCanonicalImportMarkdown({ body, metadata: {}, title }),
      pdf: { ocrPages, pageCount: pdf.numPages },
      source,
      title,
      warnings: Array.from(new Set(warnings)),
    };
  } finally {
    await ocrWorker?.terminate().catch(() => undefined);
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}

export function reconstructPdfLines(
  items: PdfTextItem[],
  pageWidth: number,
): PdfLine[] {
  const normalized = items
    .filter((item) => item.str.trim())
    .map((item) => ({
      fontSize: Math.max(
        1,
        Math.abs(item.transform[3] ?? 0),
        Math.abs(item.height ?? 0),
      ),
      text: item.str,
      width: Math.max(0, item.width ?? 0),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
    }));
  if (normalized.length === 0) {
    return [];
  }

  const midpoint = pageWidth / 2;
  const left = normalized.filter((item) => item.x + item.width <= midpoint * 0.98);
  const right = normalized.filter((item) => item.x >= midpoint * 1.02);
  const crossing = normalized.length - left.length - right.length;
  const isTwoColumn =
    left.length >= 6 && right.length >= 6 && crossing <= normalized.length * 0.12;
  const groups = isTwoColumn ? [left, right] : [normalized];
  const medianFontSize = median(normalized.map((item) => item.fontSize));

  return groups.flatMap((group) => {
    const sorted = [...group].sort((first, second) => {
      if (Math.abs(first.y - second.y) > Math.max(first.fontSize, second.fontSize) * 0.35) {
        return second.y - first.y;
      }
      return first.x - second.x;
    });
    const lines: Array<typeof normalized> = [];
    for (const item of sorted) {
      const line = lines.find(
        (candidate) =>
          Math.abs((candidate[0]?.y ?? item.y) - item.y) <=
          Math.max(candidate[0]?.fontSize ?? 1, item.fontSize) * 0.4,
      );
      if (line) {
        line.push(item);
      } else {
        lines.push([item]);
      }
    }

    return lines.map((line) => {
      const ordered = [...line].sort((first, second) => first.x - second.x);
      const text = ordered.reduce(
        (current, item) => `${current}${needsPdfWordSpace(current, item.text) ? ' ' : ''}${item.text}`,
        '',
      );
      const fontSize = Math.max(...ordered.map((item) => item.fontSize));
      const trimmed = text.trim();
      const markdown =
        fontSize >= medianFontSize * 1.8
          ? `## ${trimmed}`
          : fontSize >= medianFontSize * 1.4
            ? `### ${trimmed}`
            : trimmed;
      return {
        fontSize,
        markdown,
        text: trimmed,
        y: ordered[0]?.y ?? 0,
      };
    });
  });
}

export function reconstructStructuredPdfMarkdown(
  items: unknown[],
  tree: PdfStructNode,
  pageWidth: number,
) {
  const contentItems = mapPdfMarkedContent(items);
  return renderPdfStructNode(tree, contentItems, pageWidth).trim();
}

function mapPdfMarkedContent(items: unknown[]) {
  const groups = new Map<string, PdfTextItem[]>();
  const stack: Array<string | null> = [];
  for (const item of items) {
    if (isPdfTextItem(item)) {
      const id = [...stack].reverse().find((value): value is string => Boolean(value));
      if (id) {
        const group = groups.get(id) ?? [];
        group.push(item);
        groups.set(id, group);
      }
      continue;
    }
    if (!item || typeof item !== 'object') {
      continue;
    }
    const marker = item as { id?: unknown; type?: unknown };
    if (marker.type === 'beginMarkedContentProps') {
      stack.push(typeof marker.id === 'string' ? marker.id : null);
    } else if (marker.type === 'beginMarkedContent') {
      stack.push(null);
    } else if (marker.type === 'endMarkedContent') {
      stack.pop();
    }
  }
  return groups;
}

function renderPdfStructNode(
  node: PdfStructNode | PdfStructContent,
  contentItems: Map<string, PdfTextItem[]>,
  pageWidth: number,
): string {
  if (isPdfStructContent(node)) {
    return pdfStructContentText(node, contentItems, pageWidth);
  }
  const role = node.role.toLowerCase();
  const plainText = pdfStructPlainText(node, contentItems, pageWidth);
  const heading = /^h([1-6])$/u.exec(role);
  if (heading && plainText) {
    return `${'#'.repeat(Number(heading[1]))} ${plainText}`;
  }
  if (role === 'l') {
    return node.children
      .map((child) => renderPdfStructNode(child, contentItems, pageWidth))
      .filter(Boolean)
      .map((value) => value.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u, '').trim())
      .map((value) => `- ${value.replace(/\n+/gu, '\n  ')}`)
      .join('\n');
  }
  if (role === 'li' || role === 'lbody' || role === 'lbl') {
    return plainText;
  }
  if (role === 'blockquote' && plainText) {
    return plainText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  }
  if (role === 'code' && plainText) {
    return `\`\`\`\n${plainText}\n\`\`\``;
  }
  if (role === 'table') {
    return renderPdfStructTable(node, contentItems, pageWidth);
  }
  if (['p', 'span', 'title'].includes(role)) {
    return plainText;
  }
  return node.children
    .map((child) => renderPdfStructNode(child, contentItems, pageWidth))
    .filter(Boolean)
    .join('\n\n');
}

function renderPdfStructTable(
  table: PdfStructNode,
  contentItems: Map<string, PdfTextItem[]>,
  pageWidth: number,
) {
  const rows = collectPdfStructNodes(table, 'tr')
    .map((row) =>
      row.children
        .filter(
          (child): child is PdfStructNode =>
            !isPdfStructContent(child) && ['th', 'td'].includes(child.role.toLowerCase()),
        )
        .map((cell) => escapePdfTableCell(pdfStructPlainText(cell, contentItems, pageWidth))),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) {
    return pdfStructPlainText(table, contentItems, pageWidth);
  }
  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ''),
  ]);
  const header = normalizedRows[0];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function collectPdfStructNodes(node: PdfStructNode, role: string): PdfStructNode[] {
  const matches: PdfStructNode[] = [];
  for (const child of node.children) {
    if (isPdfStructContent(child)) {
      continue;
    }
    if (child.role.toLowerCase() === role) {
      matches.push(child);
    } else {
      matches.push(...collectPdfStructNodes(child, role));
    }
  }
  return matches;
}

function pdfStructPlainText(
  node: PdfStructNode,
  contentItems: Map<string, PdfTextItem[]>,
  pageWidth: number,
) {
  return collectPdfStructContent(node)
    .map((content) => pdfStructContentText(content, contentItems, pageWidth))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function collectPdfStructContent(
  node: PdfStructNode,
): PdfStructContent[] {
  return node.children.flatMap((child) =>
    isPdfStructContent(child) ? [child] : collectPdfStructContent(child),
  );
}

function pdfStructContentText(
  content: PdfStructContent,
  contentItems: Map<string, PdfTextItem[]>,
  pageWidth: number,
) {
  return reconstructPdfLines(contentItems.get(content.id) ?? [], pageWidth)
    .map((line) => line.text)
    .join(' ')
    .trim();
}

function isPdfStructContent(
  value: PdfStructNode | PdfStructContent,
): value is PdfStructContent {
  return 'id' in value && typeof value.id === 'string';
}

function escapePdfTableCell(value: string) {
  return value.replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, '<br>');
}

function removeRepeatedPdfMargins(pages: PdfPageExtraction[]) {
  if (pages.length < 3) {
    return pages;
  }
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of page.lines.filter(
      (line) => line.y >= page.height * 0.9 || line.y <= page.height * 0.1,
    )) {
      const key = normalizeMarginText(line.text);
      if (key) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const repeated = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([text]) => text),
  );
  if (repeated.size === 0) {
    return pages;
  }

  return pages.map((page) => {
    let markdown = page.markdown;
    for (const line of page.lines) {
      if (repeated.has(normalizeMarginText(line.text))) {
        markdown = markdown.replace(line.markdown, '').replace(/\n{3,}/gu, '\n\n');
      }
    }
    return { ...page, markdown };
  });
}

async function openPdfDocument(
  pdfjs: typeof import('pdfjs-dist'),
  bytes: Uint8Array,
  options: PreparePdfImportOptions,
) {
  let password: string | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      return await pdfjs
        .getDocument({
          data: bytes.slice(),
          cMapPacked: true,
          cMapUrl: importRuntimeUrl('cmaps/'),
          disableAutoFetch: true,
          password,
          standardFontDataUrl: importRuntimeUrl('standard_fonts/'),
          useWorkerFetch: true,
          wasmUrl: importRuntimeUrl('pdfjs-wasm/'),
        })
        .promise;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : '';
      if (errorName !== 'PasswordException' || attempt >= 3) {
        throw error;
      }
      password = await options.requestPassword?.(attempt + 1) ?? undefined;
      if (!password) {
        throw new Error('已取消加密 PDF 导入。');
      }
    }
  }
  throw new Error('PDF 密码验证失败。');
}

async function renderPdfPage(page: import('pdfjs-dist').PDFPageProxy) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(200 / 72, 3_000 / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('无法创建 PDF 页面渲染画布。');
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return { canvas, png: await canvasToPng(canvas) };
}

async function createOcrWorker(
  onProgress: PreparePdfImportOptions['onProgress'],
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker('eng+chi_sim', OEM.LSTM_ONLY, {
    cacheMethod: 'none',
    corePath: importRuntimeUrl('tesseract-core'),
    langPath: importRuntimeUrl('lang'),
    logger(message) {
      if (message.status === 'recognizing text') {
        onProgress?.({
          current: Math.round((message.progress ?? 0) * 100),
          message: `OCR 识别中 ${Math.round((message.progress ?? 0) * 100)}%`,
          total: 100,
        });
      }
    },
    workerBlobURL: false,
    workerPath: importRuntimeUrl('worker.min.js'),
  });
}

async function extractPdfRasterImages(
  page: {
    getOperatorList: () => Promise<{ argsArray: unknown[][]; fnArray: number[] }>;
    objs: { get: (name: string, callback?: (value: unknown) => void) => unknown };
  },
  operations: Record<string, number>,
  pageNumber: number,
  warnings: string[],
) {
  const operatorList = await page.getOperatorList();
  const assets: PreparedImportAsset[] = [];
  let imageIndex = 0;
  let vectorOperations = 0;
  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const operation = operatorList.fnArray[index];
    vectorOperations += operation === operations.constructPath ? 1 : 0;
    if (
      operation !== operations.paintImageXObject &&
      operation !== operations.paintInlineImageXObject
    ) {
      continue;
    }
    try {
      const argument = operatorList.argsArray[index]?.[0];
      const image =
        typeof argument === 'string'
          ? await readPdfObject(page.objs, argument)
          : argument;
      const png = await pdfImageObjectToPng(image);
      if (!png) {
        continue;
      }
      imageIndex += 1;
      assets.push(
        createInlineImportAsset(
          png,
          'image/png',
          `pdf-${pageNumber}-image-${imageIndex}.png`,
        ),
      );
    } catch {
      warnings.push(`PDF 第 ${pageNumber} 页有一张栅格图片无法解码。`);
    }
  }
  return { assets, hasComplexVectorGraphics: vectorOperations > 20 };
}

function readPdfObject(
  objects: { get: (name: string, callback?: (value: unknown) => void) => unknown },
  name: string,
) {
  return new Promise<unknown>((resolve, reject) => {
    try {
      const immediate = objects.get(name, resolve);
      if (immediate) {
        resolve(immediate);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function pdfImageObjectToPng(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const image = value as {
    data?: Uint8Array | Uint8ClampedArray;
    height?: number;
    width?: number;
  };
  const width = image.width ?? 0;
  const height = image.height ?? 0;
  if (!image.data || width < 32 || height < 32 || width * height > 30_000_000) {
    return null;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (image.data.length === width * height * 4) {
    rgba.set(image.data);
  } else if (image.data.length === width * height * 3) {
    for (let source = 0, target = 0; source < image.data.length; source += 3, target += 4) {
      rgba[target] = image.data[source];
      rgba[target + 1] = image.data[source + 1];
      rgba[target + 2] = image.data[source + 2];
      rgba[target + 3] = 255;
    }
  } else {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvasToPng(canvas);
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('无法编码 PDF 页面图像。'));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<PdfTextItem>;
  return typeof item.str === 'string' && Array.isArray(item.transform);
}

function needsPdfWordSpace(current: string, next: string) {
  return /[\p{L}\p{N}]$/u.test(current) && /^[\p{L}\p{N}]/u.test(next) &&
    !/[\u3400-\u9fff]$/u.test(current) && !/^[\u3400-\u9fff]/u.test(next);
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\r\n?/gu, '\n')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/[ \t]+\n/gu, '\n').trim())
    .filter(Boolean)
    .join('\n\n');
}

function normalizeMarginText(value: string) {
  return value.toLowerCase().replace(/\d+/gu, '#').replace(/\s+/gu, ' ').trim();
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 1);
}

function readPdfMetadataTitle(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const info = (metadata as { info?: unknown }).info;
  if (!info || typeof info !== 'object') {
    return null;
  }
  const title = (info as { Title?: unknown }).Title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

function importRuntimeUrl(relativePath: string) {
  const base = new URL('/', document.baseURI);
  return new URL(`import-runtime/${relativePath}`, base).toString();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('导入已取消。', 'AbortError');
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    const onAbort = () => reject(new DOMException('导入已取消。', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

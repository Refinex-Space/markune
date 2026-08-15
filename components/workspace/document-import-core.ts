import {
  extractH1FromMarkdown,
  parseFrontmatter,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import rehypeSanitize, {
  defaultSchema,
  type Options as RehypeSanitizeSchema,
} from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import type {
  DocumentImportSource,
  WorkspaceImportFormat,
} from './workspace-types';

export const IMPORT_ASSET_PREFIX = 'markune-import://asset/';

export interface PreparedImportAsset {
  data?: Uint8Array;
  fileName: string;
  kind: 'inline' | 'source';
  mediaType: string;
  reference?: string;
  size: number;
  token: string;
}

export interface PreparedImportDocument {
  assets: PreparedImportAsset[];
  markdown: string;
  pdf?: {
    ocrPages: Array<{ confidence: number; pageNumber: number }>;
    pageCount: number;
  };
  source: DocumentImportSource;
  title: string;
  warnings: string[];
}

interface PrepareHtmlImportInput {
  embeddedAssets?: PreparedImportAsset[];
  html: string;
  source: DocumentImportSource;
  warnings?: string[];
}

interface AstNode {
  children?: AstNode[];
  type?: string;
  url?: string;
}

const HTML_IMPORT_SCHEMA: RehypeSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]],
    img: [...(defaultSchema.attributes?.img ?? []), 'alt', 'src', 'title'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [
      ...(defaultSchema.protocols?.src ?? []),
      'data',
      'http',
      'https',
      'markune-asset',
      'markune-import',
    ],
  },
};

const IMAGE_MEDIA_TYPES = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);

export async function prepareMarkdownImport(
  source: DocumentImportSource,
  bytes: Uint8Array,
): Promise<PreparedImportDocument> {
  const decoded = decodeTextSource(bytes, 'markdown');
  const parsed = parseFrontmatter(decoded.text);
  const warnings = [...decoded.warnings];
  const assets: PreparedImportAsset[] = [];
  const resolveImage = createImportImageResolver(assets, warnings);
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .parse(parsed.body) as AstNode;

  visitAst(tree, (node) => {
    if (node.type === 'image' && typeof node.url === 'string') {
      node.url = resolveImage(node.url);
    }
  });

  const body = stringifyMarkdownTree(tree);
  const title = normalizeImportTitle(
    readMetadataTitle(parsed.metadata.title) ??
      extractH1FromMarkdown(body) ??
      sourceFileStem(source.fileName),
  );

  return {
    assets,
    markdown: createCanonicalImportMarkdown({
      body,
      metadata: parsed.metadata,
      title,
    }),
    source,
    title,
    warnings,
  };
}

export async function prepareHtmlImport({
  embeddedAssets = [],
  html,
  source,
  warnings: initialWarnings = [],
}: PrepareHtmlImportInput): Promise<PreparedImportDocument> {
  if (typeof DOMParser === 'undefined') {
    throw new Error('当前运行环境不支持 HTML 导入。');
  }

  const warnings = [...initialWarnings];
  const assets = [...embeddedAssets];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const sourceTitle = normalizeImportTitle(
    document.querySelector('title')?.textContent?.trim() ||
      document.querySelector('h1')?.textContent?.trim() ||
      sourceFileStem(source.fileName),
  );

  document
    .querySelectorAll(
      'script, style, iframe, frame, object, embed, form, input, button, select, textarea, nav, noscript',
    )
    .forEach((node) => node.remove());
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) {
        element.removeAttribute(attribute.name);
      }
    }
  });

  const resolveImage = createImportImageResolver(assets, warnings);
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const sourceUrl = image.getAttribute('src')?.trim() ?? '';
    if (!sourceUrl) {
      image.remove();
      warnings.push('发现没有 src 的图片，已从导入结果中移除。');
      return;
    }

    const resolved = resolveImage(sourceUrl);
    if (!resolved) {
      image.remove();
      return;
    }
    image.setAttribute('src', resolved);
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.removeAttribute('loading');
  });

  const markdown = String(
    await unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeSanitize, HTML_IMPORT_SCHEMA)
      .use(rehypeRemark)
      .use(remarkGfm)
      .use(remarkStringify, markdownStringifyOptions())
      .process(document.body.innerHTML),
  );

  return {
    assets,
    markdown: createCanonicalImportMarkdown({
      body: markdown,
      metadata: {},
      title: sourceTitle,
    }),
    source,
    title: sourceTitle,
    warnings,
  };
}

export function decodeTextSource(
  bytes: Uint8Array,
  format: Extract<WorkspaceImportFormat, 'html' | 'markdown'>,
) {
  const warnings: string[] = [];

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      warnings,
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      warnings,
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = bytes.subarray(2).slice();
    for (let index = 0; index + 1 < swapped.length; index += 2) {
      [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    }
    return { text: new TextDecoder('utf-16le').decode(swapped), warnings };
  }

  if (format === 'html') {
    const header = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
    const declaredEncoding =
      /<meta[^>]+charset\s*=\s*["']?\s*([^\s"'/>]+)/iu.exec(header)?.[1] ??
      /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';]+)/iu.exec(header)?.[1];
    if (declaredEncoding) {
      try {
        return {
          text: new TextDecoder(declaredEncoding).decode(bytes),
          warnings,
        };
      } catch {
        warnings.push(`HTML 声明了不支持的字符编码 ${declaredEncoding}，已按 UTF-8 读取。`);
      }
    }
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      warnings,
    };
  } catch {
    if (format === 'html') {
      warnings.push('HTML 不是有效 UTF-8，已尝试按 GB18030 读取。');
      return { text: new TextDecoder('gb18030').decode(bytes), warnings };
    }
    throw new Error('Markdown 不是有效 UTF-8/UTF-16 文本。');
  }
}

export function createCanonicalImportMarkdown({
  body,
  metadata,
  title,
}: {
  body: string;
  metadata: Record<string, string>;
  title: string;
}) {
  const normalizedTitle = normalizeImportTitle(title);
  const normalizedBody = body.replace(/\r\n?/g, '\n').trim();
  const firstHeading = extractH1FromMarkdown(normalizedBody);
  const bodyWithTitle =
    firstHeading === normalizedTitle
      ? normalizedBody
      : `# ${normalizedTitle}${normalizedBody ? `\n\n${normalizedBody}` : ''}`;
  const now = new Date().toISOString();

  return serializeFrontmatter({
    body: bodyWithTitle,
    metadata: {
      ...metadata,
      title: normalizedTitle,
      createdAt: metadata.createdAt || now,
      updatedAt: metadata.updatedAt || now,
      refinexDialect: metadata.refinexDialect || 1,
    },
  });
}

export function sourceFileStem(fileName: string) {
  return (
    fileName.replace(/\.(?:docx|html?|markdown|mdx?|pdf)$/iu, '').trim() ||
    '未命名文档'
  );
}

export function createInlineImportAsset(
  data: Uint8Array,
  mediaType: string,
  fileName?: string,
): PreparedImportAsset {
  const normalizedMediaType = normalizeImageMediaType(mediaType);
  if (!IMAGE_MEDIA_TYPES.has(normalizedMediaType)) {
    throw new Error(`不支持的导入图片类型：${mediaType || 'unknown'}`);
  }
  const token = createAssetToken();
  return {
    data,
    fileName: sanitizeImportAssetFileName(
      fileName || `image-${token}.${extensionForMediaType(normalizedMediaType)}`,
    ),
    kind: 'inline',
    mediaType: normalizedMediaType,
    size: data.byteLength,
    token,
  };
}

function createImportImageResolver(
  assets: PreparedImportAsset[],
  warnings: string[],
) {
  const byReference = new Map<string, PreparedImportAsset>();
  for (const asset of assets) {
    byReference.set(`${IMPORT_ASSET_PREFIX}${asset.token}`, asset);
  }

  return (rawReference: string) => {
    const reference = rawReference.trim();
    if (!reference) {
      return '';
    }
    if (reference.startsWith(IMPORT_ASSET_PREFIX)) {
      return byReference.has(reference) ? reference : '';
    }
    if (/^https?:\/\//iu.test(reference)) {
      warnings.push(`远程图片未本地化，已保留原链接：${reference}`);
      return reference;
    }
    if (/^(?:javascript|vbscript):/iu.test(reference)) {
      warnings.push('发现危险图片 URL，已从导入结果中移除。');
      return '';
    }
    if (reference.startsWith('data:')) {
      try {
        const parsed = parseImageDataUri(reference);
        const key = `data:${parsed.mediaType}:${reference}`;
        let asset = byReference.get(key);
        if (!asset) {
          asset = createInlineImportAsset(parsed.data, parsed.mediaType);
          assets.push(asset);
          byReference.set(key, asset);
        }
        return `${IMPORT_ASSET_PREFIX}${asset.token}`;
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : '无法解析 data URI 图片。');
        return '';
      }
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(reference) && !reference.startsWith('markune-asset://')) {
      warnings.push(`不支持的图片协议，已移除：${reference.split(':')[0]}`);
      return '';
    }

    let asset = byReference.get(reference);
    if (!asset) {
      const fileName = sanitizeImportAssetFileName(referenceFileName(reference));
      asset = {
        fileName,
        kind: 'source',
        mediaType: mediaTypeForFileName(fileName),
        reference,
        size: 0,
        token: createAssetToken(),
      };
      assets.push(asset);
      byReference.set(reference, asset);
    }
    return `${IMPORT_ASSET_PREFIX}${asset.token}`;
  };
}

function parseImageDataUri(value: string) {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/iu.exec(value);
  if (!match) {
    throw new Error('图片 data URI 格式无效。');
  }
  const mediaType = normalizeImageMediaType(match[1]);
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new Error(`不支持的 data URI 图片类型：${mediaType}`);
  }
  const data = match[2]
    ? Uint8Array.from(globalThis.atob(match[3]), (value) => value.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[3]));
  if (data.byteLength === 0 || data.byteLength > 100 * 1024 * 1024) {
    throw new Error('data URI 图片为空或超过 100 MB 限制。');
  }
  return { data, mediaType };
}

function stringifyMarkdownTree(tree: AstNode) {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkStringify, markdownStringifyOptions())
    .stringify(tree as never);
}

function markdownStringifyOptions() {
  return {
    bullet: '-' as const,
    emphasis: '_' as const,
    fences: true,
    listItemIndent: 'one' as const,
    rule: '-' as const,
  };
}

function visitAst(node: AstNode, visitor: (node: AstNode) => void) {
  visitor(node);
  node.children?.forEach((child) => visitAst(child, visitor));
}

function readMetadataTitle(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeImportTitle(value: string) {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(normalized || '未命名文档').slice(0, 200).join('');
}

function referenceFileName(reference: string) {
  if (reference.startsWith('markune-asset://')) {
    return 'imported-image';
  }
  const withoutSuffix = reference.split(/[?#]/u)[0].replace(/\\/g, '/');
  const name = withoutSuffix.slice(withoutSuffix.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name) || 'imported-image';
  } catch {
    return name || 'imported-image';
  }
}

function sanitizeImportAssetFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/^\.+|\.+$/gu, '')
    .trim();
  return sanitized || 'imported-image';
}

function normalizeImageMediaType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') {
    return 'image/jpeg';
  }
  if (normalized === 'image/x-png') {
    return 'image/png';
  }
  return normalized;
}

function mediaTypeForFileName(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'bmp':
      return 'image/bmp';
    case 'gif':
      return 'image/gif';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/unknown';
  }
}

function extensionForMediaType(mediaType: string) {
  switch (mediaType) {
    case 'image/bmp':
      return 'bmp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

let fallbackAssetSequence = 0;

function createAssetToken() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/gu, '');
  }
  fallbackAssetSequence += 1;
  return `asset${Date.now().toString(36)}${fallbackAssetSequence.toString(36)}`;
}

import {
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
  LOCAL_ASSET_RELATIVE_PREFIX,
  LOCAL_ASSET_URL_PREFIX,
} from './workspace-local-assets';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';

interface ResourceAst { type: string; url?: string; identifier?: string; value?: string; children?: ResourceAst[]; position?: { start: { offset?: number }; end: { offset?: number } } }
const resourceParser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);

export interface DocumentResourceReference {
  id: string;
  nodeType: string;
  source: 'local' | 'remote';
  url: string;
}

const ASSET_URL_PATTERN = buildAssetUrlPattern();
const HTML_LOCAL_MEDIA_PATTERN =
  /<(img|video|audio)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const REMOTE_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const REMOTE_HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const LINK_PREVIEW_PATTERN = /<!--\s*octarine-link-preview:([\s\S]*?)-->/g;

export function countMarkdownCharacters(
  markdown: string | undefined,
): number {
  if (!markdown) {
    return 0;
  }

  return Array.from(markdown.replace(/\s+/g, '')).length;
}

// Mixed CJK/Latin word count: each Han/kana/Hangul character is one word;
// contiguous Latin/digit runs (with optional internal '’-_) count as one word.
// author: refinex
const MARKDOWN_WORD_PATTERN =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[\p{Script=Latin}\p{Nd}]+(?:['’_-][\p{Script=Latin}\p{Nd}]+)*/gu;

export function countMarkdownWords(markdown: string | undefined): number {
  if (!markdown) {
    return 0;
  }

  return markdown.match(MARKDOWN_WORD_PATTERN)?.length ?? 0;
}

export function countMarkdownLines(markdown: string | undefined): number {
  if (!markdown) {
    return 0;
  }

  return markdown.split(/\r\n|\r|\n/).length;
}

export function extractResourceReferencesFromMarkdown(
  markdown: string | undefined,
): DocumentResourceReference[] {
  if (!markdown) {
    return [];
  }

  let tree = resourceParser.parse(markdown) as ResourceAst;
  if (markdown.includes('%%')) {
    const protectedRanges: Array<[number, number]> = [];
    const protect = (node: ResourceAst) => {
      if (['code', 'inlineCode', 'yaml', 'html', 'link', 'image'].includes(node.type)) {
        const start = node.position?.start.offset; const end = node.position?.end.offset;
        if (start !== undefined && end !== undefined) protectedRanges.push([start, end]);
      } else node.children?.forEach(protect);
    };
    protect(tree);
    let cursor = 0; const parts: string[] = [];
    while (cursor < markdown.length) {
      const start = markdown.indexOf('%%', cursor);
      if (start < 0) break;
      if (markdown[start - 1] === '\\' || protectedRanges.some(([from, to]) => start >= from && start < to)) { parts.push(markdown.slice(cursor, start + 2)); cursor = start + 2; continue; }
      const close = markdown.indexOf('%%', start + 2); const end = close < 0 ? markdown.length : close + 2;
      parts.push(markdown.slice(cursor, start), markdown.slice(start, end).replace(/[^\r\n]/g, ' ')); cursor = end;
    }
    parts.push(markdown.slice(cursor)); markdown = parts.join(''); tree = resourceParser.parse(markdown) as ResourceAst;
  }
  const nodes: ResourceAst[] = [];
  const excluded: Array<[number, number]> = [];
  let htmlCodeDepth = 0;
  const visit = (node: ResourceAst) => {
    const wasHtmlCode = htmlCodeDepth > 0;
    const codeTags = node.type === 'html' ? [...(node.value ?? '').matchAll(/<\/?(?:pre|code|script|style)\b[^>]*>/gi)] : [];
    for (const [tag] of codeTags) htmlCodeDepth = tag.startsWith('</') ? Math.max(0, htmlCodeDepth - 1) : tag.endsWith('/>') ? htmlCodeDepth : htmlCodeDepth + 1;
    if (wasHtmlCode || codeTags.length > 0 || ['code', 'inlineCode', 'yaml'].includes(node.type) || node.type === 'html' && /^<!--/.test(node.value ?? '') && !/octarine-link-preview:/.test(node.value ?? '')) {
      const start = node.position?.start.offset; const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) excluded.push([start, end]);
      return;
    }
    nodes.push(node); for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  const parts: string[] = []; let cursor = 0;
  for (const [start, end] of excluded.sort((a, b) => a[0] - b[0])) { parts.push(markdown.slice(cursor, start), ' '.repeat(end - start)); cursor = end; }
  parts.push(markdown.slice(cursor)); markdown = parts.join('');

  const references = new Map<string, DocumentResourceReference>();

  for (const match of markdown.matchAll(ASSET_URL_PATTERN)) {
    const isImage = match[1] !== undefined;
    const url = match[1] ?? match[2];

    if (!url) {
      continue;
    }

    const id = getWorkspaceAssetIdFromReference(url);

    if (!id || references.has(id)) {
      continue;
    }

    references.set(id, {
      id,
      nodeType: isImage ? 'image' : 'file',
      source: 'local',
      url,
    });
  }

  for (const match of markdown.matchAll(HTML_LOCAL_MEDIA_PATTERN)) {
    const nodeType = match[1] ?? 'file';
    const url = match[2];
    const id = getWorkspaceAssetIdFromReference(url);

    if (!id || references.has(id)) {
      continue;
    }

    references.set(id, {
      id,
      nodeType,
      source: 'local',
      url,
    });
  }

  for (const url of extractWorkspaceAssetReferences(markdown)) {
    const id = getWorkspaceAssetIdFromReference(url);

    if (!id || references.has(id)) {
      continue;
    }

    references.set(id, {
      id,
      nodeType: 'file',
      source: 'local',
      url,
    });
  }

  for (const url of extractRemoteImageUrls(markdown)) {
    if (references.has(url)) {
      continue;
    }

    references.set(url, {
      id: url,
      nodeType: 'image',
      source: 'remote',
      url,
    });
  }

  const definitions = new Map(nodes.filter((node) => node.type === 'definition').map((node) => [node.identifier, node.url]));
  for (const node of nodes) {
    if (!['image', 'link', 'imageReference', 'linkReference'].includes(node.type)) continue;
    const url = node.url ?? definitions.get(node.identifier);
    if (!url || getWorkspaceAssetIdFromReference(url) || /^\.markune\//.test(url) || /\.mdx?(?:[?#]|$)/i.test(url)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?:|file:)/i.test(url)) continue;
    const remote = /^https?:/i.test(url); const image = node.type.startsWith('image');
    if (remote && !image && !/\.(pdf|png|jpe?g|gif|webp|svg|mp4|mp3|docx?|xlsx?|zip)(?:[?#]|$)/i.test(url)) continue;
    if (!references.has(url)) references.set(url, { id: url, nodeType: image ? 'image' : 'file', source: remote ? 'remote' : 'local', url });
  }

  return Array.from(references.values());
}

function buildAssetUrlPattern(): RegExp {
  const legacyPrefix = escapeRegExp(LOCAL_ASSET_URL_PREFIX);
  const relativePrefix = escapeRegExp(LOCAL_ASSET_RELATIVE_PREFIX);
  const reference = `(?:${legacyPrefix}[A-Za-z0-9._-]+|${relativePrefix}[^)\\s"']+)`;

  return new RegExp(
    `!\\[[^\\]]*\\]\\((${reference})\\)|` +
      `\\[[^\\]]*\\]\\((${reference})\\)`,
    'g',
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractRemoteImageUrls(markdown: string): string[] {
  const urls: string[] = [];

  for (const match of markdown.matchAll(REMOTE_MARKDOWN_IMAGE_PATTERN)) {
    pushRemoteImageUrl(urls, match[1]);
  }

  for (const match of markdown.matchAll(REMOTE_HTML_IMAGE_PATTERN)) {
    pushRemoteImageUrl(urls, match[1]);
  }

  for (const match of markdown.matchAll(LINK_PREVIEW_PATTERN)) {
    pushRemoteImageUrl(urls, extractLinkPreviewImageUrl(match[1]));
  }

  return urls;
}

function pushRemoteImageUrl(
  urls: string[],
  rawUrl: string | undefined | null,
) {
  const url = normalizeRemoteUrl(rawUrl);

  if (!url || urls.includes(url)) {
    return;
  }

  urls.push(url);
}

function normalizeRemoteUrl(rawUrl: string | undefined | null) {
  const url = rawUrl?.trim();

  if (!url || !/^https?:\/\//iu.test(url)) {
    return null;
  }

  return url;
}

function extractLinkPreviewImageUrl(rawPayload: string | undefined) {
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload.trim()) as { image?: unknown };

    return typeof parsed.image === 'string' ? parsed.image : null;
  } catch {
    const imageMatch = rawPayload.match(/"image"\s*:\s*"([^"]+)"/u);

    return imageMatch?.[1] ?? null;
  }
}

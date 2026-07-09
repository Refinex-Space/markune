import {
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
  LOCAL_ASSET_RELATIVE_PREFIX,
  LOCAL_ASSET_URL_PREFIX,
} from './workspace-local-assets';

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

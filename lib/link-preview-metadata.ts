import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkPreviewMetadata {
  kind: 'link';
  url: string;
  title: string;
  domain?: string;
  description?: string;
  image?: string;
  error?: 'blocked_url' | 'invalid_url';
}

interface LookupAddress {
  address: string;
  family: 4 | 6;
}

interface LinkPreviewResponse extends Response {
  url: string;
}

interface ResolveLinkPreviewMetadataOptions {
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<LookupAddress[]>;
  title?: string;
  url: string;
}

const MAX_PREVIEW_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTNAMES = new Set(['localhost']);

export function normalizeLinkPreviewSourceUrl(value: string) {
  try {
    const input = value.trim();
    const url = new URL(input.startsWith('www.') ? `https://${input}` : input);

    if (
      !ALLOWED_PROTOCOLS.has(url.protocol) ||
      url.username ||
      url.password ||
      isBlockedHostname(url.hostname) ||
      isBlockedIpAddress(url.hostname)
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export async function resolveLinkPreviewMetadata({
  fetchImpl = fetch,
  lookupImpl = lookupPublicAddresses,
  title,
  url: source,
}: ResolveLinkPreviewMetadataOptions): Promise<LinkPreviewMetadata> {
  const url = normalizeLinkPreviewSourceUrl(source);

  if (!url) {
    return {
      kind: 'link',
      url: source,
      title: title || source,
      error: 'invalid_url',
    };
  }

  const allowed = await ensurePublicUrl(url, lookupImpl);

  if (!allowed) {
    return {
      ...fallbackMetadata(url, title),
      error: 'blocked_url',
    };
  }

  try {
    const response = await fetchPreviewResponse(url, fetchImpl, lookupImpl);
    const responseUrl = normalizeLinkPreviewSourceUrl(response.url) ?? url;
    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok || !contentType.toLowerCase().includes('text/html')) {
      return fallbackMetadata(responseUrl, title);
    }

    const html = await readPreviewHtml(response);

    return parseLinkPreviewHtml(html, responseUrl, title);
  } catch {
    return fallbackMetadata(url, title);
  }
}

async function fetchPreviewResponse(
  startUrl: URL,
  fetchImpl: typeof fetch,
  lookupImpl: (hostname: string) => Promise<LookupAddress[]>,
) {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!(await ensurePublicUrl(currentUrl, lookupImpl))) {
      throw new Error('blocked_url');
    }

    const response = await fetchImpl(currentUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'MarkuneLinkPreview/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!isRedirectStatus(response.status)) {
      return response as LinkPreviewResponse;
    }

    const location = response.headers.get('location');

    if (!location) {
      return response as LinkPreviewResponse;
    }

    const nextUrl = normalizeLinkPreviewSourceUrl(
      new URL(location, currentUrl.href).href,
    );

    if (!nextUrl) {
      throw new Error('blocked_url');
    }

    currentUrl = nextUrl;
  }

  throw new Error('too_many_redirects');
}

async function lookupPublicAddresses(hostname: string) {
  const addresses = await dnsLookup(hostname, { all: true });

  return addresses.map((address) => ({
    address: address.address,
    family: address.family as 4 | 6,
  }));
}

async function ensurePublicUrl(
  url: URL,
  lookupImpl: (hostname: string) => Promise<LookupAddress[]>,
) {
  if (isBlockedHostname(url.hostname) || isBlockedIpAddress(url.hostname)) {
    return false;
  }

  const addresses = await lookupImpl(url.hostname);

  return addresses.length > 0 && addresses.every((item) => !isBlockedIpAddress(item.address));
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, '');

  return BLOCKED_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

function isBlockedIpAddress(value: string) {
  const normalized = value.replace(/^\[/u, '').replace(/\]$/u, '');
  const version = isIP(normalized);

  if (version === 4) {
    return isBlockedIpv4Address(normalized);
  }

  if (version === 6) {
    return isBlockedIpv6Address(normalized);
  }

  return false;
}

function isBlockedIpv4Address(value: string) {
  const octets = value.split('.').map((part) => Number.parseInt(part, 10));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = octets;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6Address(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function fallbackMetadata(url: URL, title?: string): LinkPreviewMetadata {
  return {
    kind: 'link',
    url: url.href,
    title: title || url.href,
    domain: url.hostname.replace(/^www\./u, ''),
  };
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
}

function compactText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}

function findMetaContent(html: string, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/giu) ?? [];

  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();

    if (wanted.has(key) && attrs.content) {
      return compactText(attrs.content);
    }
  }

  return undefined;
}

function findTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);

  return match?.[1] ? compactText(match[1]) : undefined;
}

function parseLinkPreviewHtml(
  html: string,
  url: URL,
  fallbackTitle?: string,
): LinkPreviewMetadata {
  const title =
    findMetaContent(html, ['og:title', 'twitter:title', 'title']) ||
    findTitle(html) ||
    fallbackTitle ||
    url.href;
  const description = findMetaContent(html, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  const imageSource = findMetaContent(html, [
    'og:image:secure_url',
    'og:image',
    'twitter:image',
    'twitter:image:src',
  ]);
  const image = imageSource ? new URL(imageSource, url.href).href : undefined;

  return {
    kind: 'link',
    url: url.href,
    title,
    domain: url.hostname.replace(/^www\./u, ''),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
  };
}

async function readPreviewHtml(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();

    return text.slice(0, MAX_PREVIEW_BYTES);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_PREVIEW_BYTES) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    chunks.push(value);
    total += value.byteLength;
  }

  await reader.cancel().catch(() => undefined);

  const output = new Uint8Array(Math.min(total, MAX_PREVIEW_BYTES));
  let offset = 0;

  for (const chunk of chunks) {
    const next = chunk.slice(0, Math.max(0, output.length - offset));
    output.set(next, offset);
    offset += next.byteLength;

    if (offset >= output.length) {
      break;
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(output);
}

/**
 * 纯字符串 Markdown 文档工具：frontmatter 解析/序列化、H1 提取、title 规范化。
 * 不依赖 React、编辑器或 Plate，可被 workspace 层与编辑器层共享复用。
 */

import { joinFrontmatterSource, patchFrontmatterSource, readFrontmatterSource, type FrontmatterSource, type MetadataValue } from './markdown-frontmatter-source';
export type { FrontmatterSource, MetadataValue } from './markdown-frontmatter-source';

export interface MarkdownDocumentMetadata {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  refinexDialect: number;
}

export interface ParsedMarkdownDocument {
  source?: FrontmatterSource;
  body: string;
  metadata: MarkdownDocumentMetadata;
}

export interface ParsedFrontmatter {
  source?: FrontmatterSource;
  properties: Record<string, MetadataValue>;
  errors: string[];
  metadata: Record<string, string>;
  body: string;
}

export interface SerializeFrontmatterInput {
  source?: FrontmatterSource;
  body: string;
  metadata: Record<string, string | number | null | undefined>;
}

const FRONTMATTER_DELIMITER = '---';
const MARKDOWN_WORD_CHAR_PATTERN = /[\p{L}\p{N}]/u;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const { source, body } = readFrontmatterSource(raw);
  return { source, body, metadata: source?.values ?? {}, properties: source?.properties ?? {}, errors: source?.errors ?? [] };
}

export function serializeFrontmatter(
  input: SerializeFrontmatterInput,
): string {
  if (input.source) {
    const updates: Record<string, MetadataValue> = {};
    for (const [key, value] of Object.entries(input.metadata)) {
      if (value !== undefined && value !== null && String(value) !== input.source.values[key]) updates[key] = value;
    }
    const block = input.source.errors.length ? input.source.block : patchFrontmatterSource(input.source, updates);
    return joinFrontmatterSource(input.source, block, input.body);
  }
  const entries = Object.entries(input.metadata).filter(
    ([, value]) => value !== '' && value !== null && value !== undefined,
  );
  const body = trimTrailingBlankLines(input.body);

  if (entries.length === 0) {
    return `${body}\n`;
  }

  const lines = [
    FRONTMATTER_DELIMITER,
    ...entries.map(([key, value]) => `${key}: ${key === 'title' && typeof value === 'string' ? encodeFrontmatterString(value) : value}`),
    FRONTMATTER_DELIMITER,
  ];

  return `${lines.join('\n')}\n\n${body}\n`;
}

function trimTrailingBlankLines(body: string) {
  if (!body.trim()) {
    return '';
  }

  return body.replace(/(?:\r?\n[\t ]*)+$/u, '');
}

export function parseMarkdownMetadata(
  markdown: string,
  fileName: string,
): ParsedMarkdownDocument {
  const { body, metadata: frontmatter, source } = parseFrontmatter(markdown);
  const title =
    collapseIntraWordEscapedUnderscores(
      readString(frontmatter.title) ??
        extractH1FromMarkdown(body) ??
        fileStem(fileName),
    );

  return {
    source,
    body,
    metadata: {
      createdAt: readString(frontmatter.createdAt),
      refinexDialect: readNumber(frontmatter.refinexDialect) ?? 1,
      title,
      updatedAt: readString(frontmatter.updatedAt),
    },
  };
}

/**
 * 从 Markdown 正文提取第一个 ATX 风格 H1 文本，跳过代码块。
 * Setext（下划线）风格标题不识别。
 */
export function extractH1FromMarkdown(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = /^#\s+(.+?)\s*$/u.exec(line);

    if (match) {
      return collapseIntraWordEscapedUnderscores(match[1].trim());
    }
  }

  return null;
}

export function sanitizeTitleForFileName(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .trim();

  return sanitized || '未命名文档';
}

function collapseIntraWordEscapedUnderscores(text: string) {
  return text.replace(/\\+_/g, (match, offset: number) => {
    const previous = text[offset - 1];
    const next = text[offset + match.length];
    return isMarkdownWordChar(previous) && isMarkdownWordChar(next)
      ? '_'
      : match;
  });
}

function isMarkdownWordChar(value: string | undefined) {
  return value != null && MARKDOWN_WORD_CHAR_PATTERN.test(value);
}

function fileStem(fileName: string) {
  return fileName.replace(/\.(md|mdx)$/i, '') || '未命名文档';
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

// Mirror native document_frontmatter so a title always remains a string. author: refinex
function encodeFrontmatterString(value: string) {
  const first = value[0] ?? '';
  const needsQuotes = !value || value.trim() !== value || /[:#\\"']/u.test(value)
    || [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
    })
    || /[0-9]/.test(first) || "!&*{}[],#|>@`\"'%?:+-.".includes(first)
    || /^(?:null|true|false|yes|no|on|off|~)$/i.test(value);
  if (!needsQuotes) return value;
  return [...JSON.stringify(value)].map((character) => {
    const code = character.charCodeAt(0);
    return (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029
      ? `\\u${code.toString(16).padStart(4, '0')}` : character;
  }).join('');
}

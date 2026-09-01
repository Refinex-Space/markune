/**
 * 纯字符串 Markdown 文档工具：frontmatter 解析/序列化、H1 提取、title 规范化。
 * 不依赖 React、编辑器或 Plate，可被 workspace 层与编辑器层共享复用。
 */

export interface MarkdownDocumentMetadata {
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  refinexDialect: number;
}

export interface ParsedMarkdownDocument {
  body: string;
  metadata: MarkdownDocumentMetadata;
}

export interface ParsedFrontmatter {
  metadata: Record<string, string>;
  body: string;
}

export interface SerializeFrontmatterInput {
  body: string;
  metadata: Record<string, string | number | null | undefined>;
}

const FRONTMATTER_DELIMITER = '---';
const FRONTMATTER_OPENING_PATTERN = /^---\r?\n/;
const FRONTMATTER_CLOSING_PATTERN = /\r?\n---(?:\r?\n|$)/;
const MARKDOWN_WORD_CHAR_PATTERN = /[\p{L}\p{N}]/u;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const openingMatch = FRONTMATTER_OPENING_PATTERN.exec(raw);

  if (!openingMatch) {
    return { metadata: {}, body: raw.trimStart() };
  }

  const frontmatterStart = openingMatch[0].length;
  const remaining = raw.slice(frontmatterStart);
  const closingMatch = FRONTMATTER_CLOSING_PATTERN.exec(remaining);

  if (!closingMatch || closingMatch.index === undefined) {
    return { metadata: {}, body: raw.trimStart() };
  }

  const rawFrontmatter = remaining.slice(0, closingMatch.index);
  const bodyStart =
    frontmatterStart + closingMatch.index + closingMatch[0].length;
  const body = raw.slice(bodyStart);
  const frontmatter = parseFrontmatterBlock(rawFrontmatter);

  return { metadata: frontmatter, body: body.trimStart() };
}

export function serializeFrontmatter(
  input: SerializeFrontmatterInput,
): string {
  const entries = Object.entries(input.metadata).filter(
    ([, value]) => value !== '' && value !== null && value !== undefined,
  );
  const body = trimTrailingBlankLines(input.body);

  if (entries.length === 0) {
    return `${body}\n`;
  }

  const lines = [
    FRONTMATTER_DELIMITER,
    ...entries.map(([key, value]) => `${key}: ${value}`),
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
  const { body, metadata: frontmatter } = parseFrontmatter(markdown);
  const title =
    collapseIntraWordEscapedUnderscores(
      readString(frontmatter.title) ??
        extractH1FromMarkdown(body) ??
        fileStem(fileName),
    );

  return {
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

function parseFrontmatterBlock(block: string): Record<string, string> {
  return Object.fromEntries(
    block
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], unquote(match[2].trim())]),
  );
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

function unquote(value: string) {
  return value.replace(/^["']|["']$/g, '');
}

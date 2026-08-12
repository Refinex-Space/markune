// Extracts a short plain-text preview from Markdown for document reference
// cards. Frontmatter is stripped first; headings / fences / rules are skipped
// so the preview reflects the first real body paragraph. author: liyao

import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';

const DEFAULT_MAX_CHARS = 160;

/**
 * Returns ~two lines of plain text from the first body paragraph of a Markdown
 * document. Frontmatter (`---` / formatter) is excluded.
 */
export function extractDocumentPreviewText(
  markdown: string,
  maxChars = DEFAULT_MAX_CHARS,
): string {
  const { body } = parseFrontmatter(markdown);
  if (!body.trim()) {
    return '';
  }

  const paragraphs: string[] = [];
  let current = '';

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      if (current) {
        paragraphs.push(current);
        current = '';
        if (paragraphs.length > 0) {
          break;
        }
      }
      continue;
    }

    if (
      /^#{1,6}\s/.test(line) ||
      /^```/.test(line) ||
      /^~~~/.test(line) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(line) ||
      /^>\s?$/.test(line)
    ) {
      if (current) {
        paragraphs.push(current);
        current = '';
        break;
      }
      continue;
    }

    const plain = line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#>]+/g, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plain) {
      continue;
    }

    current = current ? `${current} ${plain}` : plain;
  }

  if (current) {
    paragraphs.push(current);
  }

  const text = paragraphs[0] ?? '';
  if (!text) {
    return '';
  }

  // Soft visual fade is handled by card CSS; keep a hard character budget only.
  return text.length <= maxChars ? text : text.slice(0, maxChars).trimEnd();
}

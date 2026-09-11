import { unified } from 'unified';
import remarkParse from 'remark-parse';

const parser = unified().use(remarkParse);

export function relationDocumentName(path: string): string {
  const file = path.split(/[?#]/)[0].replace(/\\/g, '/').split('/').pop() ?? '';
  try {
    return decodeURIComponent(file).replace(/\.mdx?$/i, '') || '未命名笔记';
  } catch {
    return file.replace(/\.mdx?$/i, '') || '未命名笔记';
  }
}

export function relationExcerpt(context: string): string {
  // Native context can end inside an encoded Markdown destination. author: refinex
  const input = context.slice(0, 2048);
  let cleaned = '';
  let cursor = 0;
  const links = /!?\[([^\]\n]*)\]\(/g;
  let match: RegExpExecArray | null;
  while ((match = links.exec(input))) {
    cleaned += input.slice(cursor, match.index) + match[1];
    let end = links.lastIndex;
    let depth = 1;
    while (end < input.length && depth > 0) {
      const char = input[end++];
      if (char === '\\') end = Math.min(end + 1, input.length);
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    cursor = end;
    links.lastIndex = end;
  }
  cleaned += input.slice(cursor);
  cleaned = cleaned.replace(/\[\[([^\]\n]+)\]\]/g, (_match, value: string) => {
    const parts = value.split('|');
    return parts.length > 1 ? parts.at(-1)! : relationDocumentName(value);
  });
  const tree = parser.parse(cleaned);
  function text(node: PreviewNode): string {
    if (node.type === 'html' || node.type === 'definition') return '';
    if (
      node.type === 'text' ||
      node.type === 'inlineCode' ||
      node.type === 'code'
    )
      return node.value ?? '';
    return (node.children ?? [])
      .map((child) => text(child))
      .join(['root', 'list', 'listItem'].includes(node.type) ? ' ' : '');
  }
  return text(tree).replace(/\s+/g, ' ').trim();
}

interface PreviewNode {
  type: string;
  value?: string;
  children?: PreviewNode[];
}

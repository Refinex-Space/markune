import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml']);
interface ReferenceNode {
  type: string;
  url?: string;
  value?: string;
  identifier?: string;
  children?: ReferenceNode[];
}

export function extractMarkdownImageSources(markdown: string): string[] {
  const tree = parser.parse(markdown) as ReferenceNode;
  const definitions = new Map<string, string>();
  const sources = new Set<string>();
  function visit(node: ReferenceNode, callback: (node: ReferenceNode) => void) {
    callback(node);
    node.children?.forEach((child) => visit(child, callback));
  }
  visit(tree, (node) => {
    if (node.type === 'definition' && node.identifier && node.url)
      definitions.set(node.identifier.toLowerCase(), node.url);
  });
  visit(tree, (node) => {
    if (node.type === 'image' && node.url) sources.add(node.url);
    if (node.type === 'imageReference' && node.identifier) {
      const url = definitions.get(node.identifier.toLowerCase());
      if (url) sources.add(url);
    }
  });
  return [...sources];
}

export function isDocumentFileReference(source: string) {
  if (
    !source ||
    source.startsWith('//') ||
    source.startsWith('#') ||
    source.startsWith('markune-asset://') ||
    source.startsWith('.markune/')
  )
    return false;
  return (
    /^file:\/\//i.test(source) ||
    /^[a-z]:[/\\]/i.test(source) ||
    !/^[a-z][a-z\d+.-]*:/i.test(source)
  );
}

export function extractDocumentFileReferences(markdown: string): string[] {
  const sources = new Set<string>();
  function collect(node: ReferenceNode) {
    if (
      node.url &&
      isDocumentFileReference(node.url) &&
      (node.type === 'image' || !/\.mdx?(?:[?#]|$)/i.test(node.url))
    )
      sources.add(node.url);
    if (
      node.type === 'html' &&
      node.value &&
      typeof DOMParser !== 'undefined'
    ) {
      const parsed = new DOMParser().parseFromString(node.value, 'text/html');
      for (const element of parsed.querySelectorAll(
        'img[src],video[src],source[src],a[data-markweave-attachment][href]',
      )) {
        const src = element.getAttribute('src') ?? element.getAttribute('href');
        if (src && isDocumentFileReference(src)) sources.add(src);
      }
    }
    node.children?.forEach(collect);
  }
  collect(parser.parse(markdown) as ReferenceNode);
  return [...sources];
}

export interface LiveRevealHeading {
  id?: string;
  text?: string;
  pos?: number;
}

export interface LiveRevealNode {
  isTextblock?: boolean;
  textContent?: string;
  type?: { name?: string };
}

export interface LiveRevealDocument {
  descendants?: (
    visitor: (node: LiveRevealNode, pos: number) => boolean | void,
  ) => void;
}

export function resolveRevealLine(options: {
  hash: string;
  line?: number;
  markdown: string;
}): number | undefined {
  const { hash, markdown } = options;
  let line = options.line;

  if (!line && /^L\d+(?:-L\d+)?$/i.test(hash)) {
    line = Number(/^L(\d+)/i.exec(hash)?.[1]);
  }

  if (!line && hash) {
    const index = markdown.split(/\r\n?|\n/).findIndex((candidate) =>
      hash.startsWith('^')
        ? candidate.trimEnd().endsWith(hash)
        : /^#{1,6}\s/.test(candidate) &&
          candidate.replace(/^#+\s*/, '').trim() === hash,
    );
    if (index >= 0) {
      line = index + 1;
    }
  }

  if (!line || !Number.isFinite(line) || line < 1) {
    return undefined;
  }

  return line;
}

export function visibleMarkdownLineText(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '---' || /^```/.test(trimmed)) {
    return '';
  }

  return trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function needlesForMarkdownLine(line: string): string[] {
  const needles: string[] = [];
  const visible = visibleMarkdownLineText(line);
  if (visible.length >= 2) {
    needles.push(visible);
  }

  const yamlValue = /^\s*[\w./-]+\s*:\s*(.+)$/.exec(line)?.[1];
  if (!yamlValue) {
    return needles;
  }

  const value = visibleMarkdownLineText(
    yamlValue.trim().replace(/^['"]|['"]$/g, ''),
  );
  if (value.length >= 2 && !needles.includes(value)) {
    needles.push(value);
  }

  return needles;
}

export function markdownLineIsFrontmatter(
  markdown: string,
  line: number,
): boolean {
  const lines = markdown.split(/\r\n?|\n/);
  if ((lines[0] ?? '').trim() !== '---') {
    return false;
  }

  const end = lines.findIndex(
    (candidate, index) => index > 0 && candidate.trim() === '---',
  );
  if (end < 0) {
    return false;
  }

  return line >= 1 && line <= end + 1;
}

export function findLivePositionForLocation(options: {
  doc: LiveRevealDocument;
  hash: string;
  headings: readonly LiveRevealHeading[];
  line?: number;
  markdown: string;
}): number | undefined {
  const { doc, hash, headings, markdown } = options;

  if (hash) {
    const headingPosition = findHeadingPosition(headings, hash);
    if (headingPosition !== undefined) {
      return headingPosition;
    }

    if (hash.startsWith('^')) {
      const footnotePosition = findTextblockPosition(doc, (node) => {
        if (node.type?.name === 'codeBlock') {
          return false;
        }
        return (node.textContent ?? '').trimEnd().endsWith(hash);
      });
      if (footnotePosition !== undefined) {
        return footnotePosition;
      }
    }
  }

  const line = options.line;
  if (line === undefined) {
    return undefined;
  }

  const needles = needlesForMarkdownLine(
    markdown.split(/\r\n?|\n/)[line - 1] ?? '',
  );
  for (const needle of needles) {
    const headingPosition = findHeadingPosition(headings, needle);
    if (headingPosition !== undefined) {
      return headingPosition;
    }

    const blockPosition = findTextblockPosition(doc, (node) =>
      textblockMatchesNeedle(node.textContent ?? '', needle),
    );
    if (blockPosition !== undefined) {
      return blockPosition;
    }
  }

  if (markdownLineIsFrontmatter(markdown, line)) {
    return headings[0]?.pos ?? findTextblockPosition(doc, () => true);
  }

  return undefined;
}

function findHeadingPosition(
  headings: readonly LiveRevealHeading[],
  hash: string,
): number | undefined {
  const normalizedHash = normalizeHeadingKey(hash);
  const heading = headings.find(
    (item) =>
      item.id === hash ||
      item.text === hash ||
      (item.text !== undefined &&
        normalizeHeadingKey(item.text) === normalizedHash),
  );
  return heading?.pos;
}

function normalizeHeadingKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function textblockMatchesNeedle(textContent: string, needle: string): boolean {
  const text = textContent.replace(/\s+/g, ' ').trim();
  if (!text) {
    return false;
  }
  if (text === needle || text.includes(needle)) {
    return true;
  }
  return needle.includes(text) && text.length >= Math.min(12, needle.length);
}

function findTextblockPosition(
  doc: LiveRevealDocument,
  matches: (node: LiveRevealNode) => boolean,
): number | undefined {
  let position: number | undefined;
  doc.descendants?.((node, pos) => {
    if (position !== undefined) {
      return false;
    }
    if (!node.isTextblock) {
      return true;
    }
    if (matches(node)) {
      position = pos;
      return false;
    }
    return true;
  });
  return position;
}

import {
  isAlias,
  isCollection,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type Node,
} from 'yaml';

export type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataValue[]
  | { [key: string]: MetadataValue };
export interface FrontmatterSource {
  opening: string;
  block: string;
  closing: string;
  separator: string;
  eol: string;
  values: Record<string, string>;
  properties: Record<string, MetadataValue>;
  errors: string[];
}

const MAX_BYTES = 64 * 1024;

export function readFrontmatterSource(raw: string): {
  source?: FrontmatterSource;
  body: string;
} {
  const opening = /^(?:\ufeff)?---[\t ]*\r?\n/.exec(raw)?.[0];
  if (!opening) return { body: raw };
  const remaining = raw.slice(opening.length);
  const match = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(remaining);
  if (!match) return { body: raw };
  const block = remaining.slice(0, match.index);
  const rest = remaining.slice(match.index + match[0].length);
  const separator = /^(?:[\t ]*\r?\n)*/.exec(rest)?.[0] ?? '';
  const { properties, errors } = readProperties(block);
  return {
    body: rest.slice(separator.length),
    source: {
      opening,
      block,
      closing: match[0],
      separator,
      eol: opening.endsWith('\r\n') ? '\r\n' : '\n',
      properties,
      errors,
      values: Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          projectValue(value),
        ]),
      ),
    },
  };
}

export function projectValue(value: MetadataValue): string {
  return value === null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
}

function parseMetadata(block: string) {
  let document = parseDocument(block, {
    keepSourceTokens: true,
    prettyErrors: false,
    uniqueKeys: true,
  });
  const titleNode = isMap(document.contents)
    ? document.get('title', true)
    : null;
  const invalidTitleAlias = isAlias(titleNode) && !titleNode.resolve(document);
  if (
    (document.errors.length || invalidTitleAlias) &&
    /^refinexDialect:\s*1\s*$/m.test(block)
  ) {
    const titles = [...block.matchAll(/^title:[\t ]*([^\r\n]*)/gm)];
    const title = titles.length === 1 ? titles[0] : null;
    if (title && title[1] && !/^["']/.test(title[1])) {
      const start = title.index! + title[0].length - title[1].length;
      const compatible =
        block.slice(0, start) +
        'x'.repeat(title[1].length) +
        block.slice(start + title[1].length);
      const parsed = parseDocument(compatible, {
        keepSourceTokens: true,
        prettyErrors: false,
        uniqueKeys: true,
      });
      if (!parsed.errors.length && isMap(parsed.contents)) {
        const node = parsed.get('title', true);
        if (isScalar(node)) node.value = title[1].trim();
        document = parsed;
      }
    }
  }
  return document;
}

function validateProjection(document: Document) {
  let count = 0;
  const walk = (node: unknown, depth: number) => {
    if (++count > 8192 || depth > 16) throw new Error('元数据超过解析上限');
    if (isCollection(node))
      for (const item of node.items) {
        if (isNode(item)) walk(item, depth + 1);
        else if (
          item &&
          typeof item === 'object' &&
          'key' in item &&
          'value' in item
        ) {
          walk(item.key, depth + 1);
          walk(item.value, depth + 1);
        }
      }
  };
  walk(document.contents, 0);
}

function readProperties(block: string): {
  properties: Record<string, MetadataValue>;
  errors: string[];
} {
  if (new TextEncoder().encode(block).length > MAX_BYTES)
    return { properties: {}, errors: ['元数据超过 64 KiB，已保留原文'] };
  try {
    const document = parseMetadata(block);
    if (document.errors.length)
      return {
        properties: {},
        errors: document.errors
          .slice(0, 3)
          .map(
            (error) =>
              `元数据无法解析（字符位置 ${error.pos[0] + 1}），已保留原文`,
          ),
      };
    if (document.contents === null) return { properties: {}, errors: [] };
    if (!isMap(document.contents))
      return { properties: {}, errors: ['元数据应为字段映射，已保留原文'] };
    validateProjection(document);
    const properties = document.toJS({ maxAliasCount: 50 }) as Record<
      string,
      MetadataValue
    >;
    if (JSON.stringify(properties).length > 256 * 1024)
      throw new Error('元数据展开超过解析上限');
    return { properties, errors: [] };
  } catch {
    return {
      properties: {},
      errors: ['元数据展开或嵌套超过解析上限，已保留原文'],
    };
  }
}

function scalarText(value: MetadataValue, original?: Node | null): string {
  if (typeof value === 'string' && isScalar(original)) {
    if (original.type === 'QUOTE_SINGLE' && !/[\r\n]/.test(value))
      return `'${value.replace(/'/g, "''")}'`;
    if (original.type === 'PLAIN') {
      const plain = parseDocument(value, { prettyErrors: false });
      if (
        !plain.errors.length &&
        isScalar(plain.contents) &&
        plain.contents.value === value
      )
        return value;
    }
  }
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        sameValue(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  );
}

// Splice only changed value ranges; never stringify the surrounding YAML. author: refinex
export function patchFrontmatterSource(
  source: FrontmatterSource,
  updates: Record<string, MetadataValue>,
): string {
  if (source.errors.length) throw new Error(source.errors[0]);
  const document = parseMetadata(source.block);
  const root = document.contents;
  if (root !== null && !isMap(root)) throw new Error('元数据应为字段映射');
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const additions: string[] = [];
  const updateNode = (
    node: Node | null,
    previous: MetadataValue | undefined,
    value: MetadataValue,
    key: string,
  ) => {
    if (sameValue(previous, value)) return;
    if (!node?.range) throw new Error(`无法安全更新元数据字段：${key}`);
    if (
      isSeq(node) &&
      Array.isArray(previous) &&
      Array.isArray(value) &&
      node.items.length === value.length
    ) {
      node.items.forEach((item, index) =>
        updateNode(
          isNode(item) ? item : null,
          previous[index],
          value[index],
          key,
        ),
      );
      return;
    }
    if (
      isMap(node) &&
      previous &&
      value &&
      !Array.isArray(value) &&
      typeof value === 'object' &&
      node.items.length === Object.keys(value).length &&
      node.items.every(
        (pair) =>
          isScalar(pair.key) &&
          typeof pair.key.value === 'string' &&
          Object.hasOwn(value, pair.key.value),
      )
    ) {
      for (const pair of node.items) {
        const field = (pair.key as { value: string }).value;
        updateNode(
          isNode(pair.value) ? pair.value : null,
          (previous as Record<string, MetadataValue>)[field],
          value[field],
          key,
        );
      }
      return;
    }
    const [start, end] = node.range;
    let text = scalarText(value, node);
    if (isCollection(node)) {
      // A structural edit may change this collection's style; keep all of its comments. author: refinex
      const comments: string[] = [];
      const collect = (token: unknown) => {
        if (!token || typeof token !== 'object') return;
        if (
          'type' in token &&
          token.type === 'comment' &&
          'offset' in token &&
          typeof token.offset === 'number' &&
          token.offset >= start &&
          token.offset < end &&
          'source' in token
        )
          comments.push(String(token.source));
        else
          for (const child of Object.values(token)) {
            if (Array.isArray(child)) child.forEach(collect);
            else if (child && typeof child === 'object') collect(child);
          }
      };
      collect(node.srcToken);
      if (comments.length) {
        if (text.startsWith('[') || text.startsWith('{')) {
          const lineStart = source.block.lastIndexOf('\n', start - 1) + 1;
          const indent = `${/^[\t ]*/.exec(source.block.slice(lineStart))?.[0] ?? ''}  `;
          text = `${text[0]}${source.eol}${indent}${comments.join(source.eol + indent)}${source.eol}${indent}${text.slice(1)}`;
        } else
          throw new Error(`字段 ${key} 包含集合注释，请在源码中修改其类型`);
      }
    }
    if (
      isScalar(node) &&
      (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED')
    ) {
      const token = node.srcToken;
      const comment =
        token?.type === 'block-scalar'
          ? token.props
              .flatMap((part) => (part.type === 'comment' ? [part.source] : []))
              .join(' ')
          : '';
      text += `${comment ? ` ${comment}` : ''}${source.eol}`;
    } else if (isCollection(node) && !node.flow && end > start)
      text += source.eol;
    else if (start === end) text += ' ';
    if (isAlias(node) && end === start)
      throw new Error(`无法安全更新元数据引用：${key}`);
    edits.push({ start, end, text });
  };
  for (const [key, value] of Object.entries(updates)) {
    if (sameValue(source.properties[key], value)) continue;
    const pair = isMap(root)
      ? root.items.find((item) => isScalar(item.key) && item.key.value === key)
      : undefined;
    if (!pair) {
      additions.push(
        `${/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key)}: ${scalarText(value)}`,
      );
      continue;
    }
    updateNode(
      isNode(pair.value) ? pair.value : null,
      source.properties[key],
      value,
      key,
    );
  }
  if (additions.length) {
    if (isMap(root) && root.flow && root.range) {
      const at = root.range[1] - 1;
      const last = root.items.at(-1)?.value;
      const tail =
        isNode(last) && last.range
          ? source.block
              .slice(last.range[1], at)
              .replace(/#[^\r\n]*/g, '')
              .trim()
          : '';
      edits.push({
        start: at,
        end: at,
        text: `${root.items.length && !tail.includes(',') ? ', ' : ''}${additions.join(', ')}`,
      });
    } else {
      const prefix =
        source.block.length && !source.block.endsWith('\n') ? source.eol : '';
      edits.push({
        start: source.block.length,
        end: source.block.length,
        text: `${prefix}${additions.join(source.eol)}${source.eol}`,
      });
    }
  }
  let block = source.block;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    block = block.slice(0, edit.start) + edit.text + block.slice(edit.end);
  const checked = readProperties(block);
  if (checked.errors.length) throw new Error(checked.errors[0]);
  if (
    Object.entries(updates).some(
      ([key, value]) => !sameValue(checked.properties[key], value),
    )
  )
    throw new Error('元数据更新无法保真，请在源码中修改');
  return block;
}

export function joinFrontmatterSource(
  source: FrontmatterSource,
  block: string,
  body: string,
) {
  const closing =
    source.closing.endsWith('\n') || !body
      ? source.closing
      : source.closing + source.eol;
  return source.opening + block + closing + source.separator + body;
}

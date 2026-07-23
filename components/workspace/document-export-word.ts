import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type FileChild,
  type ParagraphChild,
} from 'docx';

export interface WordSemanticDocument {
  blocks: WordBlock[];
  warnings: string[];
}

export type WordBlock =
  | WordParagraphBlock
  | WordTableBlock
  | WordImageBlock
  | { type: 'page-break' };

export interface WordParagraphBlock {
  bookmark?: string;
  headingLevel?: number;
  list?: { kind: 'bullet' | 'ordered' | 'task'; level: number; checked?: boolean };
  quote?: boolean;
  runs: WordInline[];
  type: 'code' | 'paragraph';
}

export interface WordInline {
  bold?: boolean;
  code?: boolean;
  color?: string;
  italic?: boolean;
  link?: string;
  strike?: boolean;
  text: string;
  underline?: boolean;
}

export interface WordTableBlock {
  rows: Array<{
    cells: Array<{
      columnSpan: number;
      header: boolean;
      rowSpan: number;
      runs: WordInline[];
    }>;
  }>;
  type: 'table';
}

export interface WordImageBlock {
  alt: string;
  dataUrl?: string;
  height: number;
  link?: string;
  svg?: string;
  type: 'image';
  width: number;
}

export function buildWordSemanticDocument(root: HTMLElement): WordSemanticDocument {
  const warnings: string[] = [];
  const blocks: WordBlock[] = [];
  const semanticRoot =
    root.querySelector<HTMLElement>('.ProseMirror, article, [role="textbox"]') ??
    root;

  for (const child of Array.from(semanticRoot.children)) {
    appendBlock(child as HTMLElement, blocks, warnings, 0);
  }

  if (blocks.length === 0 && semanticRoot.textContent?.trim()) {
    blocks.push({
      type: 'paragraph',
      runs: [{ text: semanticRoot.textContent.trim() }],
    });
  }

  return { blocks, warnings };
}

export async function packWordDocument(
  semantic: WordSemanticDocument,
  title: string,
) {
  const warnings = [...semantic.warnings];
  const children: FileChild[] = [];

  for (const block of semantic.blocks) {
    if (block.type === 'table') {
      children.push(createWordTable(block));
    } else if (block.type === 'image') {
      children.push(...(await createImageParagraphs(block, warnings)));
    } else if (block.type === 'page-break') {
      children.push(new Paragraph({ pageBreakBefore: true, text: '' }));
    } else {
      children.push(createWordParagraph(block));
    }
  }

  const document = new Document({
    creator: 'Madora',
    description: '由 Madora 专业文档导出生成',
    title,
    features: { updateFields: true },
    numbering: {
      config: [
        {
          reference: 'madora-numbering',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: 720 + level * 360, hanging: 320 },
              },
            },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: 'Aptos',
              hAnsi: 'Aptos',
              eastAsia: 'Microsoft YaHei',
            },
            size: 21,
            color: '202124',
          },
          paragraph: {
            spacing: { after: 160, line: 330 },
          },
        },
        heading1: headingStyle(34, 360, 180),
        heading2: headingStyle(29, 300, 140),
        heading3: headingStyle(25, 240, 120),
        heading4: headingStyle(23, 220, 100),
        heading5: headingStyle(21, 200, 80),
        heading6: headingStyle(20, 180, 80),
        hyperlink: {
          run: {
            color: '155EAA',
            underline: { type: UnderlineType.SINGLE },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'MadoraCode',
          name: 'Madora Code',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            font: {
              ascii: 'Cascadia Mono',
              hAnsi: 'Cascadia Mono',
              eastAsia: 'Microsoft YaHei',
            },
            size: 18,
            color: '24292F',
          },
          paragraph: {
            border: {
              top: { style: BorderStyle.SINGLE, color: 'E5E7EB', size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: 'E5E7EB', size: 4 },
              left: { style: BorderStyle.SINGLE, color: 'E5E7EB', size: 4 },
              right: { style: BorderStyle.SINGLE, color: 'E5E7EB', size: 4 },
            },
            shading: { fill: 'F7F7F8', type: ShadingType.CLEAR },
            indent: { left: 240, right: 240 },
            spacing: { before: 120, after: 180, line: 285 },
            keepLines: true,
          },
        },
        {
          id: 'MadoraQuote',
          name: 'Madora Quote',
          basedOn: 'Normal',
          next: 'Normal',
          run: { color: '52525B', italics: true },
          paragraph: {
            border: {
              left: { style: BorderStyle.SINGLE, color: '94A3B8', size: 16 },
            },
            indent: { left: 360, right: 180 },
            spacing: { before: 100, after: 140 },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 1020,
              right: 1020,
              bottom: 1020,
              left: 1020,
              footer: 520,
              header: 520,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    color: '71717A',
                    size: 17,
                    children: [
                      '第 ',
                      PageNumber.CURRENT,
                      ' 页 / 共 ',
                      PageNumber.TOTAL_PAGES,
                      ' 页',
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return {
    bytes: new Uint8Array(await Packer.toArrayBuffer(document)),
    warnings,
  };
}

function appendBlock(
  element: HTMLElement,
  blocks: WordBlock[],
  warnings: string[],
  listLevel: number,
) {
  const tag = element.tagName.toLocaleLowerCase();

  if (
    element.matches('.madora-export-missing-resource') ||
    element.querySelector(':scope > .madora-export-missing-resource')
  ) {
    warnings.push('Word 中存在不可用图片，已输出可识别占位内容。');
  }

  if (/^h[1-6]$/u.test(tag)) {
    blocks.push({
      type: 'paragraph',
      bookmark: element.id || undefined,
      headingLevel: Number(tag.slice(1)),
      runs: collectInlineRuns(element),
    });
    return;
  }

  if (tag === 'p') {
    const images = element.querySelectorAll<HTMLImageElement>(':scope > img');
    const textWithoutImages = Array.from(element.childNodes)
      .filter(
        (node) =>
          !(node instanceof HTMLImageElement) &&
          !(node instanceof HTMLBRElement),
      )
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();

    if (images.length === 1 && !textWithoutImages) {
      blocks.push(createImageBlock(images[0]));
      return;
    }
  }

  if (tag === 'p') {
    blocks.push({ type: 'paragraph', runs: collectInlineRuns(element) });
    return;
  }

  if (tag === 'pre') {
    if (
      element.dataset.markweaveMermaidBlock === 'true' &&
      (element.dataset.mermaidPreviewMode === 'preview' ||
        element.nextElementSibling?.classList.contains(
          'markweave-mermaid-preview',
        ))
    ) {
      return;
    }

    blocks.push({
      type: 'code',
      runs: [{ code: true, text: element.textContent?.replace(/\n$/u, '') ?? '' }],
    });
    return;
  }

  if (tag === 'blockquote') {
    const paragraphs = Array.from(element.querySelectorAll(':scope > p'));

    if (paragraphs.length === 0) {
      blocks.push({
        type: 'paragraph',
        quote: true,
        runs: collectInlineRuns(element),
      });
    } else {
      for (const paragraph of paragraphs) {
        blocks.push({
          type: 'paragraph',
          quote: true,
          runs: collectInlineRuns(paragraph),
        });
      }
    }
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    for (const item of Array.from(element.children).filter(
      (child) => child.tagName.toLocaleLowerCase() === 'li',
    )) {
      const itemElement = item as HTMLElement;
      const checkbox = itemElement.querySelector<HTMLInputElement>(
        ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
      );
      const taskMarker = itemElement.querySelector<HTMLElement>(
        ':scope > .madora-export-task-marker, :scope > p > .madora-export-task-marker',
      );
      const inlineContainer =
        itemElement.querySelector<HTMLElement>(':scope > p') ?? itemElement;
      const runs = collectInlineRuns(inlineContainer).filter(
        (run) => run.text !== '☐' && run.text !== '☑',
      );
      if (taskMarker && runs[0]) {
        runs[0].text = runs[0].text.replace(/^[☐☑]\s*/u, '');
      }

      blocks.push({
        type: 'paragraph',
        list: checkbox || taskMarker
          ? {
              kind: 'task',
              level: listLevel,
              checked: checkbox?.checked ?? taskMarker?.textContent === '☑',
            }
          : { kind: tag === 'ol' ? 'ordered' : 'bullet', level: listLevel },
        runs,
      });

      for (const nested of Array.from(itemElement.children).filter((child) =>
        ['ul', 'ol'].includes(child.tagName.toLocaleLowerCase()),
      )) {
        appendBlock(nested as HTMLElement, blocks, warnings, listLevel + 1);
      }
    }
    return;
  }

  if (tag === 'table') {
    blocks.push(createSemanticTable(element));
    return;
  }

  if (tag === 'hr') {
    blocks.push({ type: 'page-break' });
    return;
  }

  if (
    element.matches(
      '.tiptap-mathematics-render[data-type="block-math"], .markweave-math-block-preview',
    )
  ) {
    blocks.push(createFormulaBlock(element));
    return;
  }

  if (/callout|admonition|link-card/iu.test(element.className)) {
    blocks.push({
      type: 'table',
      rows: [
        {
          cells: [
            {
              columnSpan: 1,
              header: false,
              rowSpan: 1,
              runs: collectInlineRuns(element),
            },
          ],
        },
      ],
    });
    return;
  }

  const isVisual = /mermaid|katex|math|diagram/iu.test(element.className);
  const svg = element.matches('svg')
    ? element
    : isVisual
      ? element.querySelector('svg')
      : null;

  if (svg instanceof SVGElement) {
    blocks.push(createSvgBlock(svg, element.textContent ?? '图表'));
    return;
  }

  const image = element.matches('img')
    ? (element as HTMLImageElement)
    : element.matches('figure')
      ? element.querySelector('img')
      : null;

  if (image) {
    blocks.push(createImageBlock(image));
    return;
  }

  const directBlocks = Array.from(element.children).filter((child) =>
    /^(?:h[1-6]|p|pre|blockquote|ul|ol|table|hr|figure|section|div|img|svg)$/u.test(
      child.tagName.toLocaleLowerCase(),
    ),
  );

  if (directBlocks.length > 0) {
    for (const child of directBlocks) {
      appendBlock(child as HTMLElement, blocks, warnings, listLevel);
    }
  } else if (element.textContent?.trim()) {
    blocks.push({ type: 'paragraph', runs: collectInlineRuns(element) });
  }
}

function collectInlineRuns(root: Element): WordInline[] {
  const runs: WordInline[] = [];

  visit(root, {});
  return mergeAdjacentRuns(runs);

  function visit(node: Node, inherited: Omit<WordInline, 'text'>) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        runs.push({ ...inherited, text: node.textContent });
      }
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const tag = node.tagName.toLocaleLowerCase();
    if (tag === 'br') {
      runs.push({ ...inherited, text: '\n' });
      return;
    }

    if (tag === 'input' && node.getAttribute('type') === 'checkbox') {
      return;
    }

    if (tag === 'img') {
      runs.push({ ...inherited, text: node.getAttribute('alt') || '[图片]' });
      return;
    }

    const style = node.getAttribute('style') ?? '';
    const color = /(?:^|;)\s*color\s*:\s*([^;]+)/iu.exec(style)?.[1];
    const next: Omit<WordInline, 'text'> = {
      ...inherited,
      bold: inherited.bold || tag === 'strong' || tag === 'b',
      code: inherited.code || tag === 'code',
      italic: inherited.italic || tag === 'em' || tag === 'i',
      strike: inherited.strike || tag === 's' || tag === 'del',
      underline: inherited.underline || tag === 'u',
      link: tag === 'a' ? node.getAttribute('href') ?? undefined : inherited.link,
      color: normalizeWordColor(color) ?? inherited.color,
    };

    for (const child of Array.from(node.childNodes)) {
      visit(child, next);
    }
  }
}

function mergeAdjacentRuns(runs: WordInline[]) {
  const merged: WordInline[] = [];

  for (const run of runs) {
    const previous = merged.at(-1);

    if (previous && haveSameInlineStyle(previous, run)) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }

  return merged;
}

function haveSameInlineStyle(left: WordInline, right: WordInline) {
  return (
    left.bold === right.bold &&
    left.code === right.code &&
    left.color === right.color &&
    left.italic === right.italic &&
    left.link === right.link &&
    left.strike === right.strike &&
    left.underline === right.underline
  );
}

function createSemanticTable(table: HTMLElement): WordTableBlock {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) => ({
    cells: Array.from(row.children)
      .filter((cell) => ['td', 'th'].includes(cell.tagName.toLocaleLowerCase()))
      .map((cell) => ({
        columnSpan: Math.max(1, Number(cell.getAttribute('colspan')) || 1),
        header: cell.tagName.toLocaleLowerCase() === 'th',
        rowSpan: Math.max(1, Number(cell.getAttribute('rowspan')) || 1),
        runs: collectInlineRuns(cell),
      })),
  }));

  return { type: 'table', rows };
}

function createImageBlock(image: HTMLImageElement): WordImageBlock {
  const width = image.naturalWidth || image.width || 560;
  const height = image.naturalHeight || image.height || 315;

  return {
    type: 'image',
    alt: image.alt || '文档图片',
    dataUrl: image.src.startsWith('data:') ? image.src : undefined,
    link: image.src.startsWith('data:') ? undefined : image.src,
    ...fitImage(width, height),
  };
}

function createSvgBlock(svg: SVGElement, alt: string): WordImageBlock {
  const viewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/u).map(Number);
  const width = Number(svg.getAttribute('width')) || viewBox?.[2] || 560;
  const height = Number(svg.getAttribute('height')) || viewBox?.[3] || 315;

  return {
    type: 'image',
    alt: alt.trim().slice(0, 160) || '图表',
    svg: new XMLSerializer().serializeToString(svg),
    ...fitImage(width, height),
  };
}

function createFormulaBlock(element: HTMLElement): WordImageBlock {
  const latex =
    element.dataset.latex ??
    element.querySelector('annotation')?.textContent ??
    element.textContent ??
    '公式';
  const serialized = new XMLSerializer()
    .serializeToString(element)
    .replaceAll('&nbsp;', '&#160;');
  const katexCss = collectKatexCss().replaceAll('&', '&amp;');
  const width = Math.max(240, Math.min(620, element.scrollWidth || 560));
  const height = Math.max(56, Math.min(240, element.scrollHeight || 96));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#171717;background:#fff"><style>${katexCss}</style>${serialized}</div></foreignObject></svg>`;

  return {
    type: 'image',
    alt: latex.trim().slice(0, 160) || '公式',
    svg,
    width,
    height,
  };
}

function collectKatexCss() {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (/katex|mathematics/iu.test(rule.cssText)) {
          chunks.push(rule.cssText);
        }
      }
    } catch {
      // Cross-origin style sheets are intentionally excluded from Word export.
    }
  }

  return chunks.join('\n');
}

function fitImage(width: number, height: number) {
  const scale = Math.min(1, 620 / width, 760 / height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createWordParagraph(block: WordParagraphBlock) {
  const children = block.runs.flatMap(createParagraphChildren);

  if (block.bookmark && children.length > 0) {
    const id = normalizeBookmark(block.bookmark);
    children.splice(0, children.length, new Bookmark({ id, children }));
  }

  if (block.list?.kind === 'task') {
    children.unshift(
      new TextRun({
        text: block.list.checked ? '☑ ' : '☐ ',
        color: block.list.checked ? '15803D' : '64748B',
      }),
    );
  }

  return new Paragraph({
    children,
    heading: block.headingLevel
      ? headingLevel(block.headingLevel)
      : undefined,
    keepNext: Boolean(block.headingLevel),
    style: block.type === 'code' ? 'MadoraCode' : block.quote ? 'MadoraQuote' : undefined,
    bullet:
      block.list?.kind === 'bullet'
        ? { level: Math.min(8, block.list.level) }
        : undefined,
    numbering:
      block.list?.kind === 'ordered'
        ? {
            reference: 'madora-numbering',
            level: Math.min(8, block.list.level),
          }
        : undefined,
    indent:
      block.list?.kind === 'task'
        ? { left: 720 + block.list.level * 360, hanging: 300 }
        : undefined,
  });
}

function createParagraphChildren(run: WordInline): ParagraphChild[] {
  const lines = run.text.split('\n');
  const children = lines.map(
    (line, index) =>
      new TextRun({
        text: line,
        break: index === 0 ? undefined : 1,
        bold: run.bold,
        color: run.color,
        font: run.code
          ? {
              ascii: 'Cascadia Mono',
              hAnsi: 'Cascadia Mono',
              eastAsia: 'Microsoft YaHei',
            }
          : undefined,
        italics: run.italic,
        shading: run.code
          ? { fill: 'F1F5F9', type: ShadingType.CLEAR }
          : undefined,
        strike: run.strike,
        underline: run.underline
          ? { type: UnderlineType.SINGLE }
          : undefined,
      }),
  );

  if (!run.link) {
    return children;
  }

  if (run.link.startsWith('#')) {
    return [
      new InternalHyperlink({
        anchor: normalizeBookmark(run.link.slice(1)),
        children,
      }),
    ];
  }

  if (/^https?:/iu.test(run.link)) {
    return [new ExternalHyperlink({ link: run.link, children })];
  }

  return children;
}

function createWordTable(block: WordTableBlock) {
  const border = { style: BorderStyle.SINGLE, color: 'D4D4D8', size: 4 };

  return new Table({
    layout: TableLayoutType.AUTOFIT,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: block.rows.map(
      (row, rowIndex) =>
        new TableRow({
          cantSplit: true,
          tableHeader: rowIndex === 0 && row.cells.every((cell) => cell.header),
          children: row.cells.map(
            (cell) =>
              new TableCell({
                columnSpan: cell.columnSpan,
                rowSpan: cell.rowSpan,
                shading: cell.header
                  ? { fill: 'F1F5F9', type: ShadingType.CLEAR }
                  : undefined,
                margins: { top: 90, bottom: 90, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    children: cell.runs.flatMap(createParagraphChildren),
                    keepLines: true,
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

async function createImageParagraphs(
  block: WordImageBlock,
  warnings: string[],
): Promise<Paragraph[]> {
  if (block.link && !block.dataUrl) {
    warnings.push(`远程图片无法安全嵌入 Word，已保留链接：${block.link}`);
    return [
      new Paragraph({
        children: [
          new TextRun({ text: `${block.alt}：` }),
          new ExternalHyperlink({
            link: block.link,
            children: [new TextRun({ text: block.link, style: 'Hyperlink' })],
          }),
        ],
      }),
    ];
  }

  try {
    const image = await createImageRun(block);

    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepLines: true,
        spacing: { before: 120, after: 160 },
        children: [image],
      }),
      ...(block.alt
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 160 },
              children: [
                new TextRun({ color: '71717A', italics: true, size: 18, text: block.alt }),
              ],
            }),
          ]
        : []),
    ];
  } catch (error) {
    warnings.push(
      `图片 ${block.alt} 无法写入 Word：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [new Paragraph({ text: `[图片不可用：${block.alt}]` })];
  }
}

async function createImageRun(block: WordImageBlock) {
  if (block.svg) {
    const fallback = await rasterizeSvgToPng(block.svg, block.width, block.height);

    return new ImageRun({
      type: 'svg',
      data: new TextEncoder().encode(block.svg),
      fallback: { type: 'png', data: fallback },
      transformation: { width: block.width, height: block.height },
    });
  }

  if (!block.dataUrl) {
    throw new Error('缺少图片数据。');
  }

  const parsed = parseDataUrl(block.dataUrl);
  if (parsed.type === 'svg') {
    const svg = new TextDecoder().decode(parsed.data);
    const fallback = await rasterizeSvgToPng(svg, block.width, block.height);

    return new ImageRun({
      type: 'svg',
      data: parsed.data,
      fallback: { type: 'png', data: fallback },
      transformation: { width: block.width, height: block.height },
    });
  }

  if (parsed.type === 'png' || parsed.type === 'jpg' || parsed.type === 'gif' || parsed.type === 'bmp') {
    return new ImageRun({
      type: parsed.type,
      data: parsed.data,
      transformation: { width: block.width, height: block.height },
    });
  }

  const png = await rasterizeDataUrl(block.dataUrl, block.width, block.height);
  return new ImageRun({
    type: 'png',
    data: png,
    transformation: { width: block.width, height: block.height },
  });
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/iu.exec(value);
  if (!match) {
    throw new Error('图片不是受支持的 base64 data URL。');
  }

  const binary = window.atob(match[2]);
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const typeByMedia: Record<string, string> = {
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
  };

  return { data, type: typeByMedia[match[1].toLocaleLowerCase()] ?? 'other' };
}

export async function rasterizeSvgToPng(
  svg: string,
  width: number,
  height: number,
) {
  return rasterizeDataUrl(
    `data:image/svg+xml;base64,${bytesToBase64(
      new TextEncoder().encode(svg),
    )}`,
    width,
    height,
  );
}

function bytesToBase64(value: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

function rasterizeDataUrl(source: string, width: number, height: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * 2));
      canvas.height = Math.max(1, Math.round(height * 2));
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('无法创建图片画布。'));
        return;
      }

      context.scale(2, 2);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('无法生成 PNG 回退图片。'));
          return;
        }

        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('无法解码图片。'));
    image.src = source;
  });
}

function headingStyle(size: number, before: number, after: number) {
  return {
    run: {
      bold: true,
      color: '111827',
      size,
      font: {
        ascii: 'Aptos Display',
        hAnsi: 'Aptos Display',
        eastAsia: 'Microsoft YaHei',
      },
    },
    paragraph: {
      keepNext: true,
      keepLines: true,
      spacing: { before, after },
    },
  };
}

function headingLevel(level: number) {
  return [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ][Math.min(5, Math.max(0, level - 1))];
}

function normalizeBookmark(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_]/gu, '_').slice(0, 36);
  return /^[A-Za-z_]/u.test(normalized) ? normalized : `madora_${normalized}`;
}

function normalizeWordColor(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const hex = /^#([0-9a-f]{6})$/iu.exec(value.trim());
  if (hex) {
    return hex[1].toLocaleUpperCase();
  }

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu.exec(value.trim());
  if (!rgb) {
    return undefined;
  }

  return rgb
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')
    .toLocaleUpperCase();
}

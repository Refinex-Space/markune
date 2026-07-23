import type { DocumentExportFile } from './workspace-types';
import { EXPORT_STEM_PLACEHOLDER } from './document-export-core';
import { rasterizeSvgToPng } from './document-export-word';

interface PrepareProfessionalDocumentOptions {
  markdown: string;
  rasterizeSvg?: (
    svg: string,
    width: number,
    height: number,
  ) => Promise<Uint8Array>;
  reservedRelativePaths?: Iterable<string>;
  snapshot: HTMLElement;
}

interface ProfessionalDocument {
  files: DocumentExportFile[];
  markdown: string;
  warnings: string[];
}

export async function prepareProfessionalDocument({
  markdown,
  rasterizeSvg = rasterizeSvgToPng,
  reservedRelativePaths = [],
  snapshot,
}: PrepareProfessionalDocumentOptions): Promise<ProfessionalDocument> {
  const previews = Array.from(
    snapshot.querySelectorAll<HTMLElement>('.markweave-mermaid-preview'),
  );
  const files: DocumentExportFile[] = [];
  const warnings: string[] = [];
  const lines = removeDuplicateFrontmatterTitle(markdown).split('\n');
  const output: string[] = [];
  let mermaidIndex = 0;
  let remoteImageCount = 0;
  const usedPaths = new Set(
    Array.from(reservedRelativePaths, (path) => path.toLocaleLowerCase()),
  );

  for (let index = 0; index < lines.length; index += 1) {
    const opening = parseFence(lines[index]);

    if (!opening) {
      const normalized = normalizeOutsideFence(lines[index]);
      output.push(normalized.value);
      remoteImageCount += normalized.remoteImageCount;
      continue;
    }

    const end = findFenceEnd(lines, index + 1, opening.marker);
    if (opening.language !== 'mermaid' || end === -1) {
      const last = end === -1 ? lines.length - 1 : end;
      output.push(...lines.slice(index, last + 1));
      index = last;
      continue;
    }

    mermaidIndex += 1;
    const preview = previews[mermaidIndex - 1];
    const previewSvg =
      preview &&
      !preview.matches(
        '.markweave-mermaid-preview--error, .markweave-mermaid-preview--empty',
      )
        ? preview.querySelector<SVGElement>('svg')
        : null;
    if (!previewSvg) {
      warnings.push(
        `第 ${mermaidIndex} 个 Mermaid 图表没有可用预览，已保留源代码。`,
      );
      output.push(...lines.slice(index, end + 1));
      index = end;
      continue;
    }

    try {
      const { height, width } = getSvgDimensions(previewSvg);
      const svg = new XMLSerializer().serializeToString(previewSvg);
      const bytes = await rasterizeSvg(svg, width, height);
      const relativePath = makeUniqueDiagramPath(mermaidIndex, usedPaths);

      files.push({
        base64Data: bytesToBase64(bytes),
        relativePath,
        role: 'asset',
      });
      output.push(
        `![Mermaid 图表 ${mermaidIndex}](./${EXPORT_STEM_PLACEHOLDER}.assets/${relativePath})`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      warnings.push(
        `第 ${mermaidIndex} 个 Mermaid 图表无法生成图片，已保留源代码：${reason}`,
      );
      output.push(...lines.slice(index, end + 1));
    }
    index = end;
  }

  if (remoteImageCount > 0) {
    warnings.unshift(
      `${remoteImageCount} 个远程图片未下载，已转换为可点击链接。`,
    );
  }

  return { files, markdown: output.join('\n'), warnings };
}

function makeUniqueDiagramPath(index: number, usedPaths: Set<string>) {
  const base = `madora-diagram-${index}`;
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = `${base}${suffix === 0 ? '' : `-${suffix}`}.png`;
    const normalized = candidate.toLocaleLowerCase();
    if (!usedPaths.has(normalized)) {
      usedPaths.add(normalized);
      return candidate;
    }
  }
  throw new Error('Mermaid 导出图片同名数量过多。');
}

function removeDuplicateFrontmatterTitle(markdown: string) {
  const lines = markdown.split('\n');
  if (lines[0]?.trim() !== '---') {
    return markdown;
  }

  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );
  if (closing === -1) {
    return markdown;
  }

  const titleIndex = lines.findIndex(
    (line, index) => index > 0 && index < closing && /^title\s*:/iu.test(line),
  );
  const headingIndex = lines.findIndex(
    (line, index) => index > closing && /^#\s+\S/u.test(line),
  );
  if (titleIndex === -1 || headingIndex === -1) {
    return markdown;
  }

  const title = stripYamlScalar(lines[titleIndex].replace(/^title\s*:/iu, ''));
  const heading = lines[headingIndex].replace(/^#\s+/u, '').trim();
  if (title !== heading) {
    return markdown;
  }

  lines.splice(titleIndex, 1);
  const remainingMetadata = lines
    .slice(1, closing - 1)
    .some((line) => line.trim() && !line.trim().startsWith('#'));
  if (!remainingMetadata) {
    lines.splice(0, closing);
  }
  return lines.join('\n');
}

function stripYamlScalar(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeOutsideFence(value: string) {
  let remoteImageCount = 0;
  let normalized = value.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/giu,
    (_match, alt: string, url: string) => {
      remoteImageCount += 1;
      return `[${alt.trim() || '远程图片'}](${url})`;
    },
  );

  normalized = normalized.replace(
    /(!)?\[\[([^\]\n]+)\]\]/gu,
    (_match, embedded: string | undefined, target: string) => {
      const [path, alias] = target.split('|', 2);
      const label =
        alias?.trim() ||
        path
          .split('#', 1)[0]
          .split('/')
          .filter(Boolean)
          .at(-1)
          ?.trim() ||
        target.trim();

      return embedded ? `[嵌入内容：${label}]` : label;
    },
  );

  return { remoteImageCount, value: normalized };
}

function parseFence(line: string) {
  const match = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/u.exec(line);
  if (!match) {
    return null;
  }
  return {
    language: match[2].trim().toLocaleLowerCase(),
    marker: match[1],
  };
}

function findFenceEnd(lines: string[], start: number, marker: string) {
  const markerCharacter = marker[0];
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (
      trimmed.length >= marker.length &&
      Array.from(trimmed).every(
        (character) => character === markerCharacter,
      )
    ) {
      return index;
    }
  }
  return -1;
}

function getSvgDimensions(svg: SVGElement) {
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/u);
  const viewBoxWidth = Number(viewBox?.[2]);
  const viewBoxHeight = Number(viewBox?.[3]);
  const width = finiteDimension(viewBoxWidth, svg.getAttribute('width'), 960);
  const height = finiteDimension(viewBoxHeight, svg.getAttribute('height'), 540);
  const scale = Math.min(1, 1600 / width, 1200 / height);

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function finiteDimension(
  viewBoxValue: number,
  attributeValue: string | null,
  fallback: number,
) {
  const attribute = Number.parseFloat(attributeValue ?? '');
  if (Number.isFinite(viewBoxValue) && viewBoxValue > 0) {
    return viewBoxValue;
  }
  return Number.isFinite(attribute) && attribute > 0 ? attribute : fallback;
}

function bytesToBase64(value: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

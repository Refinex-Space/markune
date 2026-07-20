import type {
  AiDrawingReference,
  DrawingDocumentDescriptor,
} from './workspace-types';

const MAX_PROJECTED_ELEMENTS = 80;
const MAX_INSPECTION_BYTES = 15 * 1024;
const MAX_TEXT_CHARS = 240;

interface DrawingInspection {
  drawing: AiDrawingReference;
  scene: {
    elementCounts: Record<string, number>;
    elements: Array<Record<string, unknown>>;
    totalElements: number;
  };
  warnings: string[];
}

export function inspectDrawingScene(
  descriptor: DrawingDocumentDescriptor,
  sceneText: string,
) {
  const scene = parseScene(sceneText);
  const sourceElements = scene.elements.filter(isRecord);
  const elementCounts = sourceElements.reduce<Record<string, number>>(
    (counts, element) => {
      const type = boundedString(element.type, 40) || 'unknown';
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const warnings: string[] = [];
  if (sourceElements.length > MAX_PROJECTED_ELEMENTS) {
    warnings.push(
      `场景包含 ${sourceElements.length} 个元素，仅返回前 ${MAX_PROJECTED_ELEMENTS} 个结构摘要。`,
    );
  }

  const projected = sourceElements
    .slice(0, MAX_PROJECTED_ELEMENTS)
    .map(projectElement);
  const inspection: DrawingInspection = {
    drawing: drawingReferenceFromDescriptor(descriptor),
    scene: {
      elementCounts,
      elements: projected,
      totalElements: sourceElements.length,
    },
    warnings,
  };

  let sizeLimited = false;
  while (
    inspection.scene.elements.length > 0 &&
    inspectionByteLength(inspection) > MAX_INSPECTION_BYTES
  ) {
    inspection.scene.elements.pop();
    sizeLimited = true;
  }
  if (sizeLimited) {
    inspection.warnings.push(
      `为满足 15 KiB 响应限制，结构摘要缩减为 ${inspection.scene.elements.length} 个元素。`,
    );
    while (
      inspection.scene.elements.length > 0 &&
      inspectionByteLength(inspection) > MAX_INSPECTION_BYTES
    ) {
      inspection.scene.elements.pop();
      inspection.warnings[inspection.warnings.length - 1] =
        `为满足 15 KiB 响应限制，结构摘要缩减为 ${inspection.scene.elements.length} 个元素。`;
    }
  }

  return JSON.stringify(inspection);
}

function inspectionByteLength(inspection: DrawingInspection) {
  return new TextEncoder().encode(JSON.stringify(inspection)).length;
}

export function drawingPreviewDataUrl(bytes: Uint8Array) {
  const mediaType = drawingPreviewMediaType(bytes);
  if (!mediaType) {
    throw new Error('图稿预览不是受支持的 PNG 或 WebP。');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

export function drawingReferenceFromDescriptor(
  descriptor: DrawingDocumentDescriptor,
): AiDrawingReference {
  return {
    albumPath: descriptor.albumPath,
    elementCount: descriptor.meta.elementCount,
    hasPreview: descriptor.hasPreview,
    id: descriptor.meta.id,
    revision: descriptor.meta.revision,
    title: descriptor.meta.title,
  };
}

function parseScene(sceneText: string) {
  let scene: unknown;
  try {
    scene = JSON.parse(sceneText);
  } catch {
    throw new Error('图稿场景 JSON 无法解析。');
  }
  if (!isRecord(scene) || !Array.isArray(scene.elements)) {
    throw new Error('图稿场景缺少 elements 数组。');
  }
  return scene as { elements: unknown[] };
}

function projectElement(element: Record<string, unknown>) {
  const projected: Record<string, unknown> = {
    id: boundedString(element.id, 80),
    type: boundedString(element.type, 40) || 'unknown',
  };
  assignFiniteNumber(projected, element, 'x');
  assignFiniteNumber(projected, element, 'y');
  assignFiniteNumber(projected, element, 'width');
  assignFiniteNumber(projected, element, 'height');

  const text = boundedString(element.text ?? element.originalText, MAX_TEXT_CHARS);
  if (text) projected.text = text;
  for (const field of ['containerId', 'frameId'] as const) {
    const value = boundedString(element[field], 80);
    if (value) projected[field] = value;
  }
  for (const field of ['startBinding', 'endBinding'] as const) {
    const binding = element[field];
    if (!isRecord(binding)) continue;
    const elementId = boundedString(binding.elementId, 80);
    if (elementId) projected[field] = { elementId };
  }
  if (Array.isArray(element.groupIds)) {
    const groupIds = element.groupIds
      .map((value) => boundedString(value, 80))
      .filter(Boolean)
      .slice(0, 20);
    if (groupIds.length > 0) projected.groupIds = groupIds;
  }
  if (Array.isArray(element.boundElements)) {
    const boundElements = element.boundElements
      .filter(isRecord)
      .map((binding) => ({
        id: boundedString(binding.id, 80),
        type: boundedString(binding.type, 40),
      }))
      .filter((binding) => binding.id)
      .slice(0, 20);
    if (boundElements.length > 0) projected.boundElements = boundElements;
  }
  return projected;
}

function assignFiniteNumber(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: 'height' | 'width' | 'x' | 'y',
) {
  const value = source[field];
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[field] = Math.round(value * 10) / 10;
  }
}

function boundedString(value: unknown, maxChars: number) {
  if (typeof value !== 'string') return '';
  const clean = value.replaceAll('\0', '').trim();
  return Array.from(clean).slice(0, maxChars).join('');
}

function drawingPreviewMediaType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

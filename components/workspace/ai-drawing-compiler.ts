import {
  evaluateAiDrawingQuality,
  type AiDrawingProfile,
  type AiDrawingQualityReport,
} from './ai-drawing-quality';

const MAX_DEFINITION_CHARS = 50_000;
const MAX_DRAWABLE_ELEMENTS = 400;
const MAX_EDGES = 500;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_CANVAS_SPAN = 50_000;

export { evaluateAiDrawingQuality } from './ai-drawing-quality';
export type {
  AiDrawingProfile,
  AiDrawingQualityGrade,
  AiDrawingQualityMetrics,
  AiDrawingQualityReport,
} from './ai-drawing-quality';

export type AiDiagramType =
  | 'class'
  | 'er'
  | 'flowchart'
  | 'sequence'
  | 'state';

export interface CompiledAiDrawing {
  contentBytes: Uint8Array;
  definition: string;
  diagramType: AiDiagramType;
  elementCount: number;
  itemCount: number;
  kind: 'whiteboard';
  previewBytes: Uint8Array;
  previewDataUrl: string;
  previewMediaType: 'image/png' | 'image/webp';
  profile: AiDrawingProfile;
  quality: AiDrawingQualityReport;
  sceneBytes: Uint8Array;
  title: string;
  warnings: string[];
}

function validateProfile(profile: unknown): asserts profile is AiDrawingProfile {
  if (!['architecture', 'default', 'flow'].includes(String(profile))) {
    throw new Error('图稿 profile 必须是 architecture、flow 或 default。');
  }
}

function detectDiagramType(definition: string): AiDiagramType {
  const meaningful = definition
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'));
  if (!meaningful) throw new Error('Mermaid 定义为空。');
  if (/^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/i.test(meaningful)) {
    return 'flowchart';
  }
  if (/^sequenceDiagram\b/i.test(meaningful)) return 'sequence';
  if (/^classDiagram\b/i.test(meaningful)) return 'class';
  if (/^erDiagram\b/i.test(meaningful)) return 'er';
  if (/^stateDiagram-v2\b/i.test(meaningful)) return 'state';
  throw new Error(
    '暂不支持该 Mermaid 图型。请使用 flowchart/graph、sequenceDiagram、classDiagram、erDiagram 或 stateDiagram-v2。',
  );
}

export function validateMermaidDrawingInput(title: string, definition: string) {
  const normalizedTitle = title.trim();
  if (
    !normalizedTitle ||
    Array.from(normalizedTitle).length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalizedTitle)
  ) {
    throw new Error('图稿标题必须为 1–120 个可见字符。');
  }
  if (!definition.trim() || Array.from(definition).length > MAX_DEFINITION_CHARS) {
    throw new Error('Mermaid 定义必须为 1–50,000 个字符。');
  }
  const forbidden: Array<[RegExp, string]> = [
    [/%%\s*\{/i, '初始化指令'],
    [/<\s*\/?\s*[a-z][a-z0-9-]*(?:\s|\/?>)/i, 'HTML'],
    [/\bclick\s+[\w-]+\b/i, 'click 指令'],
    [/\b(?:href|src)\s*=/i, '外链'],
    [/\b(?:javascript|data|https?|file):/i, '外部 URI'],
    [/\b(?:img|image)\s*:/i, '图片'],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(definition)) {
      throw new Error(`Mermaid 定义包含不允许的${label}。`);
    }
  }
  return { diagramType: detectDiagramType(definition), title: normalizedTitle };
}

function dataUrl(bytes: Uint8Array, mediaType: string) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function inspectElements(elements: readonly Record<string, unknown>[]) {
  const ids = new Set<string>();
  const warnings: string[] = [];
  let edgeCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const rectangles: Array<{ height: number; width: number; x: number; y: number }> = [];

  for (const element of elements) {
    if (element.isDeleted === true) continue;
    const id = typeof element.id === 'string' ? element.id : '';
    if (!id || ids.has(id)) throw new Error('Excalidraw 元素包含空 ID 或重复 ID。');
    ids.add(id);
    const type = typeof element.type === 'string' ? element.type : '';
    if (['image', 'embeddable', 'iframe'].includes(type)) {
      throw new Error(`生成结果包含不允许的 ${type} 元素。`);
    }
    if (type === 'arrow' || type === 'line') edgeCount += 1;
    const x = Number(element.x);
    const y = Number(element.y);
    const width = Number(element.width);
    const height = Number(element.height);
    if (![x, y, width, height].every(Number.isFinite)) {
      throw new Error('Excalidraw 元素包含非有限坐标。');
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    if (['rectangle', 'ellipse', 'diamond'].includes(type)) {
      rectangles.push({ height, width, x, y });
    }
    if (type === 'text') {
      const text = typeof element.text === 'string' ? element.text.trim() : '';
      if (!text) warnings.push('检测到空文本标签。');
      if (Number(element.fontSize) < 16) warnings.push('检测到小于 16px 的正文。');
    }
  }
  if (elements.length > MAX_DRAWABLE_ELEMENTS) {
    throw new Error(`生成结果超过 ${MAX_DRAWABLE_ELEMENTS} 个可绘制元素。`);
  }
  if (edgeCount > MAX_EDGES) throw new Error(`生成结果超过 ${MAX_EDGES} 条边。`);
  if (maxX - minX > MAX_CANVAS_SPAN || maxY - minY > MAX_CANVAS_SPAN) {
    throw new Error('生成结果画布边界异常，请缩小图稿复杂度。');
  }
  for (let left = 0; left < rectangles.length; left += 1) {
    for (let right = left + 1; right < rectangles.length; right += 1) {
      const a = rectangles[left];
      const b = rectangles[right];
      const overlapWidth = Math.max(
        0,
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
      );
      const overlap = overlapWidth * overlapHeight;
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      const smaller = Math.min(areaA, areaB);
      const areaRatio = smaller > 0 ? Math.max(areaA, areaB) / smaller : 0;
      if (smaller > 0 && areaRatio < 1.8 && overlap / smaller > 0.75) {
        warnings.push('检测到明显重叠的节点，请检查预览。');
        left = rectangles.length;
        break;
      }
    }
  }
  return [...new Set(warnings)];
}

function validateBindings(elements: readonly Record<string, unknown>[]) {
  const ids = new Set(
    elements
      .map((element) => element.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  for (const element of elements) {
    for (const key of ['startBinding', 'endBinding'] as const) {
      const binding = element[key];
      if (binding && typeof binding === 'object') {
        const elementId = (binding as { elementId?: unknown }).elementId;
        if (typeof elementId !== 'string' || !ids.has(elementId)) {
          throw new Error('箭头绑定指向不存在的元素。');
        }
      }
    }
  }
}

interface ExcalidrawNativeThemeOptions {
  adaptiveRadius: number;
  fontFamily: number;
  proportionalRadius: number;
}

const EXCALIDRAW_NATIVE_FONT_SIZE = 20;
const EXCALIDRAW_NATIVE_STROKE_COLOR = '#1e1e1e';

function resolveExcalidrawNativeRoundness(
  elementType: string,
  options: ExcalidrawNativeThemeOptions,
) {
  if (elementType === 'rectangle') return { type: options.adaptiveRadius };
  if (['arrow', 'diamond', 'line'].includes(elementType)) {
    return { type: options.proportionalRadius };
  }
  return null;
}

export function applyExcalidrawNativeTheme<T extends { type: string }>(
  element: T,
  options: ExcalidrawNativeThemeOptions,
): T {
  const record = element as T & {
    backgroundColor?: string;
    label?: Record<string, unknown>;
    strokeColor?: string;
  };
  const fontFamily = options.fontFamily;
  const label = record.label
    ? {
        ...record.label,
        fontFamily,
        fontSize: Math.max(
          EXCALIDRAW_NATIVE_FONT_SIZE,
          Number(record.label.fontSize) || EXCALIDRAW_NATIVE_FONT_SIZE,
        ),
        strokeColor: EXCALIDRAW_NATIVE_STROKE_COLOR,
      }
    : undefined;
  const base = {
    ...element,
    ...(label ? { label } : {}),
    fillStyle: 'solid',
    roughness: 1,
    strokeColor: EXCALIDRAW_NATIVE_STROKE_COLOR,
    strokeWidth: 2,
  };
  if (element.type === 'text') {
    return {
      ...base,
      fontFamily,
      fontSize: Math.max(
        EXCALIDRAW_NATIVE_FONT_SIZE,
        Number((element as T & { fontSize?: number }).fontSize) ||
          EXCALIDRAW_NATIVE_FONT_SIZE,
      ),
    } as T;
  }
  if (element.type === 'arrow' || element.type === 'line') {
    return {
      ...base,
      backgroundColor: 'transparent',
      roundness: resolveExcalidrawNativeRoundness(element.type, options),
    } as T;
  }
  if (record.label?.verticalAlign === 'top') {
    return {
      ...base,
      backgroundColor: 'transparent',
      roundness: resolveExcalidrawNativeRoundness(element.type, options),
    } as T;
  }
  const currentFill = (record.backgroundColor ?? '').toLocaleLowerCase();
  const hasCustomFill =
    currentFill &&
    !['#ececff', '#ffffde', 'transparent'].includes(currentFill);
  return {
    ...base,
    backgroundColor: hasCustomFill ? record.backgroundColor : 'transparent',
    roundness: resolveExcalidrawNativeRoundness(element.type, options),
  } as T;
}

export async function compileMermaidDrawing(
  titleInput: string,
  definition: string,
  profile: AiDrawingProfile,
): Promise<CompiledAiDrawing> {
  const { diagramType, title } = validateMermaidDrawingInput(
    titleInput,
    definition,
  );
  validateProfile(profile);
  if (profile !== 'default' && diagramType !== 'flowchart') {
    throw new Error(`${profile} profile 只适用于 flowchart/graph。`);
  }
  const [{ parseMermaidToExcalidraw }, excalidraw] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    import('@excalidraw/excalidraw'),
  ]);
  const parsed = await parseMermaidToExcalidraw(definition, {
    flowchart: { curve: 'linear' },
    maxEdges: MAX_EDGES,
    maxTextSize: MAX_DEFINITION_CHARS,
    startOnLoad: false,
    themeVariables: { fontSize: '18px' },
  });
  if (parsed.files && Object.keys(parsed.files).length > 0) {
    throw new Error('Mermaid 结果包含图片文件，首版仅支持可编辑矢量元素。');
  }
  const themeOptions = {
    adaptiveRadius: Number(excalidraw.ROUNDNESS.ADAPTIVE_RADIUS),
    fontFamily: Number(excalidraw.FONT_FAMILY.Excalifont),
    proportionalRadius: Number(excalidraw.ROUNDNESS.PROPORTIONAL_RADIUS),
  };
  const skeletons = parsed.elements.map((element) => {
    if (element.type === 'text') {
      return applyExcalidrawNativeTheme(
        {
          ...element,
          fontSize: Math.max(
            EXCALIDRAW_NATIVE_FONT_SIZE,
            element.fontSize ?? EXCALIDRAW_NATIVE_FONT_SIZE,
          ),
        },
        themeOptions,
      );
    }
    return applyExcalidrawNativeTheme(element, themeOptions);
  });
  const converted = excalidraw.convertToExcalidrawElements(skeletons, {
    regenerateIds: false,
  });
  const contentMinX = converted.length > 0
    ? Math.min(...converted.map((element) => element.x))
    : 0;
  const contentMinY = converted.length > 0
    ? Math.min(...converted.map((element) => element.y))
    : 0;
  const titleElements = excalidraw.convertToExcalidrawElements(
    [
      {
        fontSize: 24,
        fontFamily: themeOptions.fontFamily,
        roughness: 1,
        strokeColor: EXCALIDRAW_NATIVE_STROKE_COLOR,
        text: title,
        type: 'text',
        x: contentMinX,
        y: contentMinY - 64,
      },
    ],
    { regenerateIds: true },
  );
  const restored = excalidraw.restore(
    {
      appState: {
        exportBackground: true,
        viewBackgroundColor: '#ffffff',
      },
      elements: [...titleElements, ...converted],
      files: {},
    },
    null,
    null,
    { refreshDimensions: true, repairBindings: true },
  );
  const drawable = restored.elements.filter((element) => !element.isDeleted);
  const warnings = inspectElements(
    drawable as unknown as readonly Record<string, unknown>[],
  );
  validateBindings(drawable as unknown as readonly Record<string, unknown>[]);
  const quality = evaluateAiDrawingQuality(
    drawable as unknown as readonly Record<string, unknown>[],
    diagramType,
    profile,
    definition,
  );
  const scene = excalidraw.serializeAsJSON(
    restored.elements,
    restored.appState,
    restored.files,
    'local',
  );
  const sceneBytes = new TextEncoder().encode(scene);
  let previewMediaType: 'image/png' | 'image/webp' = 'image/webp';
  let blob = await excalidraw.exportToBlob({
    appState: {
      exportBackground: true,
      exportPadding: 32,
      viewBackgroundColor: '#ffffff',
    },
    elements: drawable,
    files: restored.files,
    maxWidthOrHeight: 1600,
    mimeType: previewMediaType,
    quality: 0.86,
  });
  if (blob.type !== previewMediaType) {
    previewMediaType = 'image/png';
    blob = await excalidraw.exportToBlob({
      appState: {
        exportBackground: true,
        exportPadding: 32,
        viewBackgroundColor: '#ffffff',
      },
      elements: drawable,
      files: restored.files,
      maxWidthOrHeight: 1600,
      mimeType: previewMediaType,
    });
  }
  const previewBytes = new Uint8Array(await blob.arrayBuffer());
  if (previewBytes.byteLength > MAX_PREVIEW_BYTES) {
    throw new Error('图稿预览超过 2 MiB，请减少节点或标签密度。');
  }
  return {
    contentBytes: sceneBytes,
    definition,
    diagramType,
    elementCount: drawable.length,
    itemCount: drawable.length,
    kind: 'whiteboard',
    previewBytes,
    previewDataUrl: dataUrl(previewBytes, previewMediaType),
    previewMediaType,
    profile,
    quality,
    sceneBytes,
    title,
    warnings: [...new Set([...warnings, ...quality.warnings])],
  };
}

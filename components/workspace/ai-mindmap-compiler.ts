import type { MindElixirData, NodeObj } from 'mind-elixir';

export interface AiMindMapNode {
  children?: AiMindMapNode[];
  topic: string;
}

export interface AiMindMapDraft {
  direction: 'both' | 'down' | 'right';
  root: AiMindMapNode;
  title: string;
}

export interface AiMindMapQualityReport {
  blockers: string[];
  creatable: boolean;
  grade: 'A' | 'B' | 'C' | 'D';
  metrics: {
    estimatedAspectRatio: number;
    maxChildren: number;
    maxDepth: number;
    nodeCount: number;
  };
  score: number;
  suggestions: string[];
  warnings: string[];
}

export interface CompiledAiMindMap {
  contentBytes: Uint8Array;
  direction: AiMindMapDraft['direction'];
  itemCount: number;
  kind: 'mindmap';
  previewBytes: Uint8Array;
  previewDataUrl: string;
  previewMediaType: 'image/png';
  quality: AiMindMapQualityReport;
  title: string;
  warnings: string[];
}

const MAX_AI_MINDMAP_NODES = 80;
const MAX_AI_MINDMAP_DEPTH = 6;
const MAX_AI_MINDMAP_CHILDREN = 8;
const MAX_AI_MINDMAP_TOPIC_CHARS = 48;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export async function compileAiMindMap(
  title: string,
  direction: AiMindMapDraft['direction'],
  root: AiMindMapNode,
): Promise<CompiledAiMindMap> {
  const draft = validateAiMindMapDraft({ direction, root, title });
  const data: MindElixirData = {
    arrows: [],
    compact: false,
    direction: directionValue(draft.direction),
    nodeData: compileNode(draft.root, 'root'),
    summaries: [],
  };
  const quality = evaluateAiMindMapQuality(draft);
  if (!quality.creatable) {
    return compileBlockedMindMap(draft, data, quality);
  }
  const previewBytes = await renderMindMapPreview(data);
  const document = {
    data,
    type: 'markune-mindmap',
    version: 1,
  } as const;
  const contentBytes = new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);
  return {
    contentBytes,
    direction: draft.direction,
    itemCount: quality.metrics.nodeCount,
    kind: 'mindmap',
    previewBytes,
    previewDataUrl: dataUrl(previewBytes, 'image/png'),
    previewMediaType: 'image/png',
    quality,
    title: draft.title,
    warnings: quality.warnings,
  };
}

export function validateAiMindMapDraft(draft: AiMindMapDraft): AiMindMapDraft {
  const title = validateText(draft.title, 120, '脑图标题');
  if (!['both', 'down', 'right'].includes(draft.direction)) {
    throw new Error('脑图 direction 必须是 right、both 或 down。');
  }
  if (!draft.root || typeof draft.root !== 'object' || Array.isArray(draft.root)) {
    throw new Error('脑图 root 必须是结构化节点。');
  }
  return {
    direction: draft.direction,
    root: normalizeDraftNode(draft.root),
    title,
  };
}

export function evaluateAiMindMapQuality(draft: AiMindMapDraft): AiMindMapQualityReport {
  const topics = new Map<string, number>();
  let maxChildren = 0;
  let maxDepth = 0;
  let nodeCount = 0;
  let leafCount = 0;
  const blockers: string[] = [];

  const visit = (node: AiMindMapNode, depth: number) => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    const children = node.children ?? [];
    maxChildren = Math.max(maxChildren, children.length);
    if (children.length === 0) leafCount += 1;
    const key = node.topic.trim().toLocaleLowerCase('zh-CN');
    topics.set(key, (topics.get(key) ?? 0) + 1);
    if (Array.from(node.topic).length > MAX_AI_MINDMAP_TOPIC_CHARS) {
      blockers.push(`节点“${node.topic.slice(0, 16)}…”超过 48 个字符。`);
    }
    if (children.length > MAX_AI_MINDMAP_CHILDREN) {
      blockers.push(`节点“${node.topic}”有 ${children.length} 个直接子节点，超过 8 个。`);
    }
    for (const child of children) visit(child, depth + 1);
  };
  visit(draft.root, 1);
  if (nodeCount > MAX_AI_MINDMAP_NODES) blockers.push(`节点数 ${nodeCount} 超过 80 个。`);
  if (maxDepth > MAX_AI_MINDMAP_DEPTH) blockers.push(`层级 ${maxDepth} 超过 6 层。`);
  const duplicates = [...topics.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    blockers.push(`存在重复节点内容：${duplicates.slice(0, 3).map(([topic]) => topic).join('、')}。`);
  }
  const estimatedAspectRatio = Math.max(1, leafCount / Math.max(1, maxDepth - 1));
  if (estimatedAspectRatio > 8) {
    blockers.push('分支过宽，预计预览会产生极端横向比例。');
  }
  const uniqueBlockers = [...new Set(blockers)];
  const score = Math.max(0, 100 - uniqueBlockers.length * 25);
  return {
    blockers: uniqueBlockers,
    creatable: uniqueBlockers.length === 0,
    grade: uniqueBlockers.length === 0 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : 'D',
    metrics: {
      estimatedAspectRatio: Math.round(estimatedAspectRatio * 100) / 100,
      maxChildren,
      maxDepth,
      nodeCount,
    },
    score,
    suggestions: uniqueBlockers.length
      ? ['合并同义节点，减少单层分支，并把长标题拆成更短的语义节点。']
      : [],
    warnings: [],
  };
}

function normalizeDraftNode(node: AiMindMapNode): AiMindMapNode {
  const keys = Object.keys(node);
  if (keys.some((key) => key !== 'topic' && key !== 'children')) {
    throw new Error('脑图节点只接受 topic 和 children。');
  }
  const topic = validateText(node.topic, 1_000, '脑图节点标题');
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(topic) || /\b(?:data|https?|file):\/\//i.test(topic)) {
    throw new Error('脑图节点标题包含不允许的 HTML 或 URI。');
  }
  if (node.children !== undefined && !Array.isArray(node.children)) {
    throw new Error('脑图节点 children 必须是数组。');
  }
  return {
    children: (node.children ?? []).map(normalizeDraftNode),
    topic,
  };
}

function validateText(value: unknown, maxChars: number, label: string) {
  if (typeof value !== 'string') throw new Error(`${label}必须是文本。`);
  const normalized = value.trim();
  if (
    !normalized ||
    Array.from(normalized).length > maxChars ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(`${label}无效。`);
  }
  return normalized;
}

function compileNode(node: AiMindMapNode, path: string): NodeObj {
  return {
    children: (node.children ?? []).map((child, index) =>
      compileNode(child, `${path}-${index + 1}`),
    ),
    expanded: true,
    id: `mindmap-${path}`,
    topic: node.topic,
  };
}

function directionValue(direction: AiMindMapDraft['direction']): 1 | 2 | 3 {
  if (direction === 'both') return 2;
  if (direction === 'down') return 3;
  return 1;
}

async function renderMindMapPreview(data: MindElixirData) {
  await import('mind-elixir/style.css');
  const { default: MindElixir } = await import('mind-elixir');
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-100000px;top:0;width:1400px;height:900px;overflow:hidden;background:#fff;';
  document.body.append(host);
  const mind = new MindElixir({
    allowUndo: false,
    contextMenu: false,
    direction: data.direction ?? MindElixir.RIGHT,
    editable: false,
    el: host,
    keypress: false,
    overflowHidden: true,
    toolBar: false,
  });
  try {
    const error = mind.init(data);
    if (error) throw error;
    mind.scaleFit();
    const blob = await mind.exportPng(true);
    if (!blob) throw new Error('脑图预览渲染失败。');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!isPng(bytes)) throw new Error('脑图预览不是有效 PNG。');
    if (bytes.byteLength > MAX_PREVIEW_BYTES) {
      throw new Error('脑图预览超过 2 MiB，请减少节点或分支。');
    }
    return bytes;
  } finally {
    mind.destroy();
    host.remove();
  }
}

async function compileBlockedMindMap(
  draft: AiMindMapDraft,
  data: MindElixirData,
  quality: AiMindMapQualityReport,
): Promise<CompiledAiMindMap> {
  const document = { data, type: 'markune-mindmap', version: 1 } as const;
  const emptyPreview = new Uint8Array();
  return {
    contentBytes: new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`),
    direction: draft.direction,
    itemCount: quality.metrics.nodeCount,
    kind: 'mindmap',
    previewBytes: emptyPreview,
    previewDataUrl: '',
    previewMediaType: 'image/png',
    quality,
    title: draft.title,
    warnings: quality.warnings,
  };
}

function dataUrl(bytes: Uint8Array, mediaType: string) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

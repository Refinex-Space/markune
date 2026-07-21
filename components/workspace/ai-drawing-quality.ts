import type { AiDiagramType } from './ai-drawing-compiler';

export type AiDrawingProfile = 'architecture' | 'default' | 'flow';
export type AiDrawingQualityGrade = 'A' | 'B' | 'C' | 'D';

export interface AiDrawingQualityMetrics {
  arrowCrossings: number;
  backwardEdgeRatio: number;
  canvasAspectRatio: number;
  dashedEdgeCount: number;
  edgeCount: number;
  edgeNodeIntersections: number;
  extraBends: number;
  groupCount: number;
  literalEscapedNewlineCount: number;
  maxFanIn: number;
  maxFanOut: number;
  maxPointsPerEdge: number;
  nodeCount: number;
  overlappingNodePairs: number;
  textOverflowCount: number;
  totalSegments: number;
}

export interface AiDrawingQualityReport {
  blockers: string[];
  creatable: boolean;
  grade: AiDrawingQualityGrade;
  metrics: AiDrawingQualityMetrics;
  score: number;
  suggestions: string[];
  warnings: string[];
}

type ElementRecord = Readonly<Record<string, unknown>>;

interface Point {
  x: number;
  y: number;
}

interface ShapeGeometry {
  bottom: number;
  id: string;
  isGroup: boolean;
  left: number;
  right: number;
  top: number;
}

interface EdgeGeometry {
  dashed: boolean;
  endId: string | null;
  id: string;
  points: Point[];
  startId: string | null;
}

const EPSILON = 0.001;

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function bindingId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const elementId = (value as { elementId?: unknown }).elementId;
  return typeof elementId === 'string' ? elementId : null;
}

function referenceId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function elementPoints(element: ElementRecord): Point[] {
  const x = finiteNumber(element.x);
  const y = finiteNumber(element.y);
  if (!Array.isArray(element.points)) return [];
  return element.points.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const pointX = Number(point[0]);
    const pointY = Number(point[1]);
    if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return [];
    return [{ x: x + pointX, y: y + pointY }];
  });
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointEquals(a: Point, b: Point) {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function between(value: number, start: number, end: number) {
  return value >= Math.min(start, end) - EPSILON && value <= Math.max(start, end) + EPSILON;
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  return (
    Math.abs(cross(start, end, point)) <= EPSILON &&
    between(point.x, start.x, end.x) &&
    between(point.y, start.y, end.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  if (
    pointEquals(a, c) ||
    pointEquals(a, d) ||
    pointEquals(b, c) ||
    pointEquals(b, d)
  ) {
    return false;
  }
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  );
}

function segmentIntersectsShape(start: Point, end: Point, shape: ShapeGeometry) {
  const inset = 3;
  const left = shape.left + inset;
  const right = shape.right - inset;
  const top = shape.top + inset;
  const bottom = shape.bottom - inset;
  if (left >= right || top >= bottom) return false;
  const inside = (point: Point) =>
    point.x > left && point.x < right && point.y > top && point.y < bottom;
  if (inside(start) || inside(end)) return true;
  const topLeft = { x: left, y: top };
  const topRight = { x: right, y: top };
  const bottomLeft = { x: left, y: bottom };
  const bottomRight = { x: right, y: bottom };
  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function overlapRatio(left: ShapeGeometry, right: ShapeGeometry) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  const leftArea = (left.right - left.left) * (left.bottom - left.top);
  const rightArea = (right.right - right.left) * (right.bottom - right.top);
  const smaller = Math.min(leftArea, rightArea);
  return smaller > 0 ? (width * height) / smaller : 0;
}

function flowDirection(definition: string) {
  return definition.match(/^(?:\s*%%[^\n]*\n)*\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i)?.[1]?.toUpperCase() ?? null;
}

function roundedRatio(value: number) {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function qualityGrade(score: number): AiDrawingQualityGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

export function evaluateAiDrawingQuality(
  elements: readonly ElementRecord[],
  diagramType: AiDiagramType,
  profile: AiDrawingProfile,
  definition: string,
): AiDrawingQualityReport {
  const active = elements.filter((element) => element.isDeleted !== true);
  const textByContainer = new Map<string, ElementRecord>();
  for (const element of active) {
    if (element.type !== 'text' || typeof element.containerId !== 'string') continue;
    textByContainer.set(element.containerId, element);
  }

  const shapes: ShapeGeometry[] = active.flatMap((element) => {
    if (!['diamond', 'ellipse', 'rectangle'].includes(String(element.type))) return [];
    const id = typeof element.id === 'string' ? element.id : '';
    if (!id) return [];
    const x = finiteNumber(element.x);
    const y = finiteNumber(element.y);
    const width = Math.abs(finiteNumber(element.width));
    const height = Math.abs(finiteNumber(element.height));
    const label = textByContainer.get(id);
    const skeletonLabel =
      element.label && typeof element.label === 'object'
        ? (element.label as Record<string, unknown>)
        : null;
    return [
      {
        bottom: y + height,
        id,
        isGroup:
          label?.verticalAlign === 'top' || skeletonLabel?.verticalAlign === 'top',
        left: x,
        right: x + width,
        top: y,
      },
    ];
  });
  const nodes = shapes.filter((shape) => !shape.isGroup);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: EdgeGeometry[] = active.flatMap((element) => {
    if (!['arrow', 'line'].includes(String(element.type))) return [];
    const id = typeof element.id === 'string' ? element.id : '';
    const points = elementPoints(element);
    if (!id || points.length < 2) return [];
    return [
      {
        dashed: element.strokeStyle === 'dashed' || element.strokeStyle === 'dotted',
        endId: bindingId(element.endBinding) ?? referenceId(element.end),
        id,
        points,
        startId: bindingId(element.startBinding) ?? referenceId(element.start),
      },
    ];
  });

  let arrowCrossings = 0;
  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      for (let leftPoint = 1; leftPoint < edges[left].points.length; leftPoint += 1) {
        for (let rightPoint = 1; rightPoint < edges[right].points.length; rightPoint += 1) {
          if (
            segmentsIntersect(
              edges[left].points[leftPoint - 1],
              edges[left].points[leftPoint],
              edges[right].points[rightPoint - 1],
              edges[right].points[rightPoint],
            )
          ) {
            arrowCrossings += 1;
          }
        }
      }
    }
  }

  let edgeNodeIntersections = 0;
  for (const edge of edges) {
    for (const node of nodes) {
      if (node.id === edge.startId || node.id === edge.endId) continue;
      const intersects = edge.points.slice(1).some((point, index) =>
        segmentIntersectsShape(edge.points[index], point, node),
      );
      if (intersects) edgeNodeIntersections += 1;
    }
  }

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of edges) {
    if (edge.startId) fanOut.set(edge.startId, (fanOut.get(edge.startId) ?? 0) + 1);
    if (edge.endId) fanIn.set(edge.endId, (fanIn.get(edge.endId) ?? 0) + 1);
  }
  const maxFanIn = Math.max(0, ...fanIn.values());
  const maxFanOut = Math.max(0, ...fanOut.values());

  const direction = flowDirection(definition);
  let directionalEdges = 0;
  let backwardEdges = 0;
  if (direction) {
    for (const edge of edges) {
      const start = edge.startId ? nodeById.get(edge.startId) : null;
      const end = edge.endId ? nodeById.get(edge.endId) : null;
      if (!start || !end) continue;
      const startX = (start.left + start.right) / 2;
      const startY = (start.top + start.bottom) / 2;
      const endX = (end.left + end.right) / 2;
      const endY = (end.top + end.bottom) / 2;
      directionalEdges += 1;
      if (
        ((direction === 'TB' || direction === 'TD') && endY < startY - 20) ||
        (direction === 'BT' && endY > startY + 20) ||
        (direction === 'LR' && endX < startX - 20) ||
        (direction === 'RL' && endX > startX + 20)
      ) {
        backwardEdges += 1;
      }
    }
  }

  let overlappingNodePairs = 0;
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      if (overlapRatio(nodes[left], nodes[right]) > 0.5) overlappingNodePairs += 1;
    }
  }

  let literalEscapedNewlineCount = 0;
  let textOverflowCount = 0;
  for (const element of active) {
    const nestedLabel =
      element.label && typeof element.label === 'object'
        ? (element.label as Record<string, unknown>)
        : null;
    const text = element.type === 'text' ? element.text : nestedLabel?.text;
    if (typeof text === 'string' && text.includes('\\n')) {
      literalEscapedNewlineCount += 1;
    }
    if (element.type !== 'text') continue;
    if (typeof element.containerId !== 'string') continue;
    const container = shapes.find((shape) => shape.id === element.containerId);
    if (!container) continue;
    if (
      finiteNumber(element.width) > container.right - container.left + 2 ||
      finiteNumber(element.height) > container.bottom - container.top + 2
    ) {
      textOverflowCount += 1;
    }
  }

  const drawableBounds = [...shapes.flatMap((shape) => [
    { x: shape.left, y: shape.top },
    { x: shape.right, y: shape.bottom },
  ]), ...edges.flatMap((edge) => edge.points)];
  const minX = drawableBounds.length > 0
    ? Math.min(...drawableBounds.map((point) => point.x))
    : 0;
  const minY = drawableBounds.length > 0
    ? Math.min(...drawableBounds.map((point) => point.y))
    : 0;
  const maxX = drawableBounds.length > 0
    ? Math.max(...drawableBounds.map((point) => point.x))
    : 0;
  const maxY = drawableBounds.length > 0
    ? Math.max(...drawableBounds.map((point) => point.y))
    : 0;
  const canvasWidth = Math.max(1, maxX - minX);
  const canvasHeight = Math.max(1, maxY - minY);
  const totalSegments = edges.reduce((total, edge) => total + edge.points.length - 1, 0);
  const extraBends = edges.reduce((total, edge) => total + Math.max(0, edge.points.length - 2), 0);
  const maxPointsPerEdge = Math.max(0, ...edges.map((edge) => edge.points.length));
  const metrics: AiDrawingQualityMetrics = {
    arrowCrossings,
    backwardEdgeRatio: directionalEdges > 0 ? roundedRatio(backwardEdges / directionalEdges) : 0,
    canvasAspectRatio: roundedRatio(canvasWidth / canvasHeight),
    dashedEdgeCount: edges.filter((edge) => edge.dashed).length,
    edgeCount: edges.length,
    edgeNodeIntersections,
    extraBends,
    groupCount: shapes.filter((shape) => shape.isGroup).length,
    literalEscapedNewlineCount,
    maxFanIn,
    maxFanOut,
    maxPointsPerEdge,
    nodeCount: nodes.length,
    overlappingNodePairs,
    textOverflowCount,
    totalSegments,
  };

  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  const isFlowchart = diagramType === 'flowchart';

  if (literalEscapedNewlineCount > 0) {
    blockers.push(
      '检测到 ' +
        literalEscapedNewlineCount +
        ' 个字面量 \\n，请改为单行短标签。',
    );
    suggestions.push('缩短节点名称；不要在 Mermaid 标签中写字面量 \\n。');
    score -= Math.min(30, literalEscapedNewlineCount * 15);
  }
  if (diagramType === 'flowchart' && overlappingNodePairs > 0) {
    blockers.push(`检测到 ${overlappingNodePairs} 组明显重叠的节点。`);
    suggestions.push('减少同层节点数量或拆分语义分组，给节点保留一致间距。');
    score -= Math.min(30, overlappingNodePairs * 12);
  }
  if (textOverflowCount > 0) {
    blockers.push(`检测到 ${textOverflowCount} 个可能被裁切的标签。`);
    suggestions.push('把节点标签改为更短的领域名称，避免把说明文字塞入节点。');
    score -= Math.min(30, textOverflowCount * 10);
  }

  if (isFlowchart) {
    if (arrowCrossings > 0) {
      blockers.push(`检测到 ${arrowCrossings} 处箭头交叉。`);
      suggestions.push('保持主路径单向且单调；删除次要跨层关系或拆成另一张图。');
      score -= Math.min(36, arrowCrossings * 8);
    }
    if (edgeNodeIntersections > 0) {
      blockers.push(`检测到 ${edgeNodeIntersections} 条连线穿越无关节点。`);
      suggestions.push('调整分层或聚合关系，使连线只在节点之间的留白区域经过。');
      score -= Math.min(36, edgeNodeIntersections * 10);
    }
    const averageExtraBends = edges.length > 0 ? extraBends / edges.length : 0;
    if (averageExtraBends > 4) {
      warnings.push(`平均每条关系有 ${roundedRatio(averageExtraBends)} 个额外转折点。`);
      suggestions.push('减少远距离跨层连接，并让共享依赖只连接到一个聚合节点。');
      score -= Math.min(12, Math.ceil(averageExtraBends - 4) * 3);
    }
    if (metrics.backwardEdgeRatio > 0.2) {
      warnings.push(`有 ${Math.round(metrics.backwardEdgeRatio * 100)}% 的关系逆着主阅读方向。`);
      suggestions.push('把反馈或控制关系改为虚线，必要时拆分为独立动态图。');
      score -= Math.min(12, Math.ceil(metrics.backwardEdgeRatio * 20));
    }
    if (maxPointsPerEdge > 15) {
      blockers.push(`最长连线包含 ${maxPointsPerEdge} 个路径点，超过硬上限 15。`);
      suggestions.push('缩短远距离关系；不要让一条线绕过多个分组。');
      score -= Math.min(18, (maxPointsPerEdge - 15) * 3);
    } else if (maxPointsPerEdge > 12) {
      warnings.push(`最长连线包含 ${maxPointsPerEdge} 个路径点。`);
      score -= maxPointsPerEdge - 12;
    }
  }

  if (profile === 'architecture') {
    if (edges.length > 18) {
      blockers.push(`架构图包含 ${edges.length} 条关系，超过硬上限 18 条。`);
    } else if (edges.length > 14) {
      warnings.push(`架构图包含 ${edges.length} 条关系，建议压缩到 14 条以内。`);
    }
    if (edges.length > 14 || maxFanOut > 5) {
      suggestions.push('聚合重复的服务到基础设施关系，避免逐服务连接注册、配置和可观测性节点。');
      score -= Math.min(20, Math.max(0, edges.length - 14) * 3);
    }
    if (maxFanOut > 6) {
      blockers.push(`单节点最大出度为 ${maxFanOut}，超过硬上限 6。`);
    } else if (maxFanOut > 5) {
      warnings.push(`单节点最大出度为 ${maxFanOut}，建议不超过 5。`);
    }
    if (maxFanOut > 5) score -= Math.min(16, (maxFanOut - 5) * 4);
    if (metrics.groupCount > 5) {
      blockers.push(`架构图包含 ${metrics.groupCount} 个分组，超过硬上限 5 个。`);
      suggestions.push('只保留业务层、平台层、数据层等必要边界，不要为每类组件单独套框。');
      score -= Math.min(15, (metrics.groupCount - 5) * 5);
    }
    if (metrics.nodeCount > 12) {
      warnings.push(`架构图包含 ${metrics.nodeCount} 个主要节点，建议控制在 6–12 个。`);
      suggestions.push('把同类微服务合并为一个集群节点，把细节放到下钻图。');
      score -= Math.min(16, (metrics.nodeCount - 12) * 2);
    }
    if (metrics.dashedEdgeCount > 6 && metrics.dashedEdgeCount / Math.max(1, edges.length) > 0.5) {
      warnings.push(`虚线关系达到 ${metrics.dashedEdgeCount} 条，横切信息过密。`);
      suggestions.push('只保留一种横切关系表达，把观测、注册或配置细节移到专题图。');
      score -= 6;
    }
  }

  if (metrics.canvasAspectRatio > 3.2 || metrics.canvasAspectRatio < 0.31) {
    warnings.push(`画布长宽比为 ${metrics.canvasAspectRatio}:1，面板内阅读可能困难。`);
    suggestions.push('调整 TB/LR 方向或拆图，使画布长宽比保持在约 1:1 到 3:1。');
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  const grade = qualityGrade(score);
  const creatable = blockers.length === 0 && grade === 'A';
  if (!creatable && blockers.length === 0) {
    warnings.push(`质量评分为 ${score}，创建要求达到 A 级（90 分）。`);
  }
  return {
    blockers: unique(blockers),
    creatable,
    grade,
    metrics,
    score,
    suggestions: unique(suggestions),
    warnings: unique(warnings),
  };
}

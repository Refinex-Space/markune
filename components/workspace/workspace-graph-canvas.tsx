'use client';

import * as React from 'react';
import { drag } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { quadtree } from 'd3-quadtree';
import { pointer, select } from 'd3-selection';
import {
  zoom,
  zoomIdentity,
  type ZoomTransform,
} from 'd3-zoom';

import type {
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
  WorkspaceGraphNodeKind,
} from './workspace-types';

export interface WorkspaceGraphPhysicsSettings {
  charge: number;
  edgeOpacity: number;
  labelThreshold: number;
  linkDistance: number;
  nodeScale: number;
}

export interface WorkspaceGraphCanvasHandle {
  fit: () => void;
  focusNode: (nodeId: string) => void;
}

interface WorkspaceGraphCanvasProps {
  edges: WorkspaceGraphEdge[];
  matches: Set<string>;
  nodes: WorkspaceGraphNode[];
  selectedNodeId: string | null;
  settings: WorkspaceGraphPhysicsSettings;
  onOpenNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
}

interface SimulationGraphNode extends WorkspaceGraphNode, SimulationNodeDatum {}

interface SimulationGraphEdge extends SimulationLinkDatum<SimulationGraphNode> {
  id: string;
  kind: WorkspaceGraphEdge['kind'];
  weight: number;
}

interface CanvasRuntime {
  fit: () => void;
  focusNode: (nodeId: string) => void;
  redraw: () => void;
}

const NODE_COLORS: Record<WorkspaceGraphNodeKind, string> = {
  daily: '#2563eb',
  note: '#3f3f46',
  property: '#b42318',
  tag: '#7c3aed',
  weekly: '#0891b2',
};

const EDGE_COLORS: Record<WorkspaceGraphEdge['kind'], string> = {
  link: '#71717a',
  property: '#dc6b5f',
  tag: '#9b87d7',
};

export const WorkspaceGraphCanvas = React.forwardRef<
  WorkspaceGraphCanvasHandle,
  WorkspaceGraphCanvasProps
>(function WorkspaceGraphCanvas(
  {
    edges,
    matches,
    nodes,
    selectedNodeId,
    settings,
    onOpenNode,
    onSelectNode,
  },
  forwardedRef,
) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const runtimeRef = React.useRef<CanvasRuntime | null>(null);
  const selectedNodeIdRef = React.useRef(selectedNodeId);
  const matchesRef = React.useRef(matches);
  const onOpenNodeRef = React.useRef(onOpenNode);
  const onSelectNodeRef = React.useRef(onSelectNode);
  const visualSettingsRef = React.useRef(settings);
  const charge = settings.charge;
  const linkDistance = settings.linkDistance;
  const nodeScale = settings.nodeScale;

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      fit: () => runtimeRef.current?.fit(),
      focusNode: (nodeId) => runtimeRef.current?.focusNode(nodeId),
    }),
    [],
  );

  React.useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    matchesRef.current = matches;
    runtimeRef.current?.redraw();
  }, [matches, selectedNodeId]);

  React.useEffect(() => {
    visualSettingsRef.current = settings;
    runtimeRef.current?.redraw();
  }, [settings]);

  React.useEffect(() => {
    onOpenNodeRef.current = onOpenNode;
    onSelectNodeRef.current = onSelectNode;
  }, [onOpenNode, onSelectNode]);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let width = Math.max(container.clientWidth, 1);
    let height = Math.max(container.clientHeight, 1);
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let transform = zoomIdentity;
    let animationFrame = 0;
    let tickCount = 0;
    let hasFit = false;
    let pointerDragged = false;
    const dragOffsets = new Map<string | number, [number, number]>();
    const simulationNodes = createSimulationNodes(nodes, width, height);
    const nodeById = new Map(simulationNodes.map((node) => [node.id, node]));
    const simulationEdges: SimulationGraphEdge[] = edges
      .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
      .map((edge) => ({ ...edge }));
    let spatialIndex = buildSpatialIndex(simulationNodes);

    const simulation = forceSimulation(simulationNodes)
      .alphaMin(0.001)
      .alphaDecay(0.04)
      .velocityDecay(0.4)
      .force(
        'link',
        forceLink<SimulationGraphNode, SimulationGraphEdge>(simulationEdges)
          .id((node) => node.id)
          .distance(linkDistance)
          .strength(0.7),
      )
      .force('charge', forceManyBody().strength(charge))
      .force(
        'collide',
        forceCollide<SimulationGraphNode>()
          .radius((node) => nodeRadius(node, nodeScale) + 4)
          .strength(0.85),
      )
      .force('radial', forceRadial(0, 0, 0).strength(0.018))
      .force('center', forceCenter(0, 0).strength(1));

    function resizeCanvas() {
      width = Math.max(container?.clientWidth ?? 1, 1);
      height = Math.max(container?.clientHeight ?? 1, 1);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * pixelRatio);
      canvas!.height = Math.round(height * pixelRatio);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      scheduleDraw();
      if (!hasFit && tickCount === 0 && simulationNodes.length > 0) {
        selection.call(
          zoomBehavior.transform,
          zoomIdentity.translate(width / 2, height / 2).scale(0.3),
        );
      }
    }

    function scheduleDraw() {
      if (animationFrame) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        drawGraph();
      });
    }

    function drawGraph() {
      context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context!.clearRect(0, 0, width, height);
      context!.save();
      context!.translate(transform.x, transform.y);
      context!.scale(transform.k, transform.k);

      const bounds = visibleWorldBounds(transform, width, height, 80);
      const selectedId = selectedNodeIdRef.current;
      const selectedNeighbors = selectedId
        ? getConnectedIds(simulationEdges, selectedId)
        : null;
      const visualSettings = visualSettingsRef.current;

      drawEdges(
        context!,
        simulationEdges,
        bounds,
        selectedId,
        selectedNeighbors,
        visualSettings.edgeOpacity,
      );
      drawNodes(
        context!,
        simulationNodes,
        bounds,
        selectedId,
        selectedNeighbors,
        matchesRef.current,
        visualSettings.nodeScale,
      );
      if (transform.k >= visualSettings.labelThreshold) {
        drawLabels(
          context!,
          simulationNodes,
          bounds,
          transform.k,
          selectedId,
          selectedNeighbors,
          matchesRef.current,
          visualSettings.nodeScale,
        );
      }
      context!.restore();
    }

    function findNode(screenX: number, screenY: number) {
      const [worldX, worldY] = transform.invert([screenX, screenY]);
      const candidate = spatialIndex.find(worldX, worldY, 22 / transform.k);
      if (!candidate) {
        return null;
      }
      const radius =
        nodeRadius(candidate, visualSettingsRef.current.nodeScale) + 5 / transform.k;
      return Math.hypot((candidate.x ?? 0) - worldX, (candidate.y ?? 0) - worldY) <=
        radius
        ? candidate
        : null;
    }

    const selection = select<HTMLCanvasElement, unknown>(canvas);
    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.05, 4])
      .filter((event) => {
        if (
          event.type === 'mousedown' &&
          findNode(event.offsetX as number, event.offsetY as number)
        ) {
          return false;
        }
        return (!event.ctrlKey || event.type === 'wheel') && !event.button;
      })
      .on('zoom', (event) => {
        transform = event.transform;
        scheduleDraw();
      });
    selection.call(zoomBehavior).on('dblclick.zoom', null);

    const dragBehavior = drag<HTMLCanvasElement, unknown, SimulationGraphNode>()
      .container(() => canvas)
      .subject((event) => {
        const [screenX, screenY] = pointer(event.sourceEvent, canvas);
        return findNode(screenX, screenY) as SimulationGraphNode;
      })
      .on('start', (event) => {
        pointerDragged = false;
        const [screenX, screenY] = pointer(event.sourceEvent, canvas);
        const [pointerX, pointerY] = graphDragPoint(
          transform,
          [screenX, screenY],
          [0, 0],
        );
        dragOffsets.set(event.identifier, [
          (event.subject.x ?? pointerX) - pointerX,
          (event.subject.y ?? pointerY) - pointerY,
        ]);
        if (!event.active) {
          simulation
            .alpha(Math.max(simulation.alpha(), 0.16))
            .alphaTarget(0.08)
            .restart();
        }
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', (event) => {
        pointerDragged = true;
        const [screenX, screenY] = pointer(event.sourceEvent, canvas);
        const [worldX, worldY] = graphDragPoint(
          transform,
          [screenX, screenY],
          dragOffsets.get(event.identifier) ?? [0, 0],
        );
        event.subject.fx = worldX;
        event.subject.fy = worldY;
        event.subject.x = worldX;
        event.subject.y = worldY;
        event.subject.vx = 0;
        event.subject.vy = 0;
        scheduleDraw();
      })
      .on('end', (event) => {
        dragOffsets.delete(event.identifier);
        if (!event.active) {
          simulation.alphaTarget(0);
        }
        event.subject.fx = null;
        event.subject.fy = null;
      });
    selection.call(dragBehavior);

    function fitGraph() {
      if (simulationNodes.length === 0) {
        return;
      }
      const extent = graphExtent(simulationNodes);
      const graphWidth = Math.max(extent.maxX - extent.minX, 1);
      const graphHeight = Math.max(extent.maxY - extent.minY, 1);
      const scale = Math.min(1.25, Math.max(0.05, 0.86 / Math.max(graphWidth / width, graphHeight / height)));
      const centerX = (extent.minX + extent.maxX) / 2;
      const centerY = (extent.minY + extent.maxY) / 2;
      const next = zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
      selection.call(zoomBehavior.transform, next);
      hasFit = true;
    }

    function focusNode(nodeId: string) {
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }
      const nextScale = Math.max(transform.k, 1.15);
      const next = zoomIdentity
        .translate(width / 2, height / 2)
        .scale(nextScale)
        .translate(-(node.x ?? 0), -(node.y ?? 0));
      selection.call(zoomBehavior.transform, next);
      hasFit = true;
    }

    function handleClick(event: MouseEvent) {
      if (pointerDragged) {
        pointerDragged = false;
        return;
      }
      const point = canvasPoint(canvas!, event);
      const node = findNode(point.x, point.y);
      onSelectNodeRef.current(node?.id ?? null);
    }

    function handleDoubleClick(event: MouseEvent) {
      const point = canvasPoint(canvas!, event);
      const node = findNode(point.x, point.y);
      if (node?.relativePath) {
        onOpenNodeRef.current(node.id);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const point = canvasPoint(canvas!, event);
      canvas!.style.cursor = findNode(point.x, point.y) ? 'pointer' : 'grab';
    }

    simulation.on('tick', () => {
      tickCount += 1;
      spatialIndex = buildSpatialIndex(simulationNodes);
      scheduleDraw();
      if (!hasFit && tickCount === 25) {
        fitGraph();
      }
    });
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('pointermove', handlePointerMove);
    resizeCanvas();

    runtimeRef.current = {
      fit: fitGraph,
      focusNode,
      redraw: scheduleDraw,
    };

    return () => {
      runtimeRef.current = null;
      resizeObserver.disconnect();
      simulation.stop();
      selection.on('.zoom', null).on('.drag', null);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('pointermove', handlePointerMove);
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [charge, edges, linkDistance, nodeScale, nodes]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full overflow-hidden bg-background"
      data-testid="workspace-graph-canvas"
    >
      <canvas
        ref={canvasRef}
        aria-label="工作区知识图谱"
        className="block size-full touch-none outline-none"
        role="img"
      />
    </div>
  );
});

function createSimulationNodes(
  nodes: WorkspaceGraphNode[],
  width: number,
  height: number,
): SimulationGraphNode[] {
  const radius = Math.max(120, Math.min(width, height) * 0.28);
  return nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    const lane = 0.45 + ((hashString(node.id) % 100) / 100) * 0.55;
    return {
      ...node,
      x: Math.cos(angle) * radius * lane,
      y: Math.sin(angle) * radius * lane,
    };
  });
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildSpatialIndex(nodes: SimulationGraphNode[]) {
  return quadtree<SimulationGraphNode>()
    .x((node) => node.x ?? 0)
    .y((node) => node.y ?? 0)
    .addAll(nodes);
}

function nodeRadius(node: WorkspaceGraphNode, nodeScale: number) {
  const base = node.kind === 'property' || node.kind === 'tag' ? 4.5 : 3.6;
  return (base + Math.min(12, Math.sqrt(Math.max(node.degree, 0)) * 1.3)) * nodeScale;
}

function graphExtent(nodes: SimulationGraphNode[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function visibleWorldBounds(
  transform: ZoomTransform,
  width: number,
  height: number,
  padding: number,
) {
  const [minX, minY] = transform.invert([-padding, -padding]);
  const [maxX, maxY] = transform.invert([width + padding, height + padding]);
  return { minX, minY, maxX, maxY };
}

function isVisible(
  node: SimulationGraphNode,
  bounds: ReturnType<typeof visibleWorldBounds>,
) {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function linkNode(value: SimulationGraphEdge['source'] | SimulationGraphEdge['target']) {
  return typeof value === 'object' && value !== null
    ? (value as SimulationGraphNode)
    : null;
}

function getConnectedIds(edges: SimulationGraphEdge[], nodeId: string) {
  const connected = new Set([nodeId]);
  for (const edge of edges) {
    const source = linkNode(edge.source)?.id ?? String(edge.source);
    const target = linkNode(edge.target)?.id ?? String(edge.target);
    if (source === nodeId) {
      connected.add(target);
    } else if (target === nodeId) {
      connected.add(source);
    }
  }
  return connected;
}

function drawEdges(
  context: CanvasRenderingContext2D,
  edges: SimulationGraphEdge[],
  bounds: ReturnType<typeof visibleWorldBounds>,
  selectedId: string | null,
  selectedNeighbors: Set<string> | null,
  opacity: number,
) {
  for (const kind of ['link', 'tag', 'property'] as const) {
    context.beginPath();
    for (const edge of edges) {
      if (edge.kind !== kind) {
        continue;
      }
      const source = linkNode(edge.source);
      const target = linkNode(edge.target);
      if (!source || !target || (!isVisible(source, bounds) && !isVisible(target, bounds))) {
        continue;
      }
      context.moveTo(source.x ?? 0, source.y ?? 0);
      context.lineTo(target.x ?? 0, target.y ?? 0);
    }
    context.strokeStyle = EDGE_COLORS[kind];
    context.globalAlpha = selectedId ? opacity * 0.22 : opacity;
    context.lineWidth = kind === 'link' ? 0.8 : 0.65;
    context.stroke();
  }

  if (selectedId && selectedNeighbors) {
    context.beginPath();
    for (const edge of edges) {
      const source = linkNode(edge.source);
      const target = linkNode(edge.target);
      if (!source || !target) {
        continue;
      }
      if (source.id === selectedId || target.id === selectedId) {
        context.moveTo(source.x ?? 0, source.y ?? 0);
        context.lineTo(target.x ?? 0, target.y ?? 0);
      }
    }
    context.strokeStyle = '#2563eb';
    context.globalAlpha = 0.92;
    context.lineWidth = 1.5;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawNodes(
  context: CanvasRenderingContext2D,
  nodes: SimulationGraphNode[],
  bounds: ReturnType<typeof visibleWorldBounds>,
  selectedId: string | null,
  selectedNeighbors: Set<string> | null,
  matches: Set<string>,
  nodeScale: number,
) {
  for (const kind of ['note', 'daily', 'weekly', 'tag', 'property'] as const) {
    context.beginPath();
    for (const node of nodes) {
      if (node.kind !== kind || !isVisible(node, bounds)) {
        continue;
      }
      context.moveTo((node.x ?? 0) + nodeRadius(node, nodeScale), node.y ?? 0);
      context.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node, nodeScale), 0, Math.PI * 2);
    }
    context.fillStyle = NODE_COLORS[kind];
    context.globalAlpha = selectedId ? 0.22 : 0.94;
    context.fill();
  }

  for (const node of nodes) {
    if (!isVisible(node, bounds)) {
      continue;
    }
    const isSelected = node.id === selectedId;
    const isNeighbor = Boolean(selectedNeighbors?.has(node.id));
    const isMatch = matches.has(node.id);
    if (!isSelected && !isNeighbor && !isMatch) {
      continue;
    }
    const radius = nodeRadius(node, nodeScale) + (isSelected ? 3 : 1.8);
    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
    context.fillStyle = NODE_COLORS[node.kind];
    context.globalAlpha = 1;
    context.fill();
    context.strokeStyle = isMatch ? '#f59e0b' : '#2563eb';
    context.lineWidth = isSelected ? 2.4 : 1.6;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawLabels(
  context: CanvasRenderingContext2D,
  nodes: SimulationGraphNode[],
  bounds: ReturnType<typeof visibleWorldBounds>,
  scale: number,
  selectedId: string | null,
  selectedNeighbors: Set<string> | null,
  matches: Set<string>,
  nodeScale: number,
) {
  const dark = document.documentElement.classList.contains('dark');
  context.font = `${Math.max(8.5, 11 / Math.sqrt(scale))}px ui-sans-serif, system-ui, sans-serif`;
  context.textBaseline = 'middle';
  for (const node of nodes) {
    if (!isVisible(node, bounds)) {
      continue;
    }
    const emphasized =
      node.id === selectedId ||
      Boolean(selectedNeighbors?.has(node.id)) ||
      matches.has(node.id);
    if (!emphasized && node.degree === 0 && scale < 1.25) {
      continue;
    }
    context.fillStyle = dark ? '#e4e4e7' : '#27272a';
    context.globalAlpha = selectedId && !emphasized ? 0.28 : 0.86;
    context.fillText(
      node.label,
      (node.x ?? 0) + nodeRadius(node, nodeScale) + 4 / scale,
      node.y ?? 0,
    );
  }
  context.globalAlpha = 1;
}

function canvasPoint(canvas: HTMLCanvasElement, event: MouseEvent | PointerEvent) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function graphDragPoint(
  transform: Pick<ZoomTransform, 'invert'>,
  screenPoint: readonly [number, number],
  grabOffset: readonly [number, number],
): [number, number] {
  const [worldX, worldY] = transform.invert([screenPoint[0], screenPoint[1]]);
  return [worldX + grabOffset[0], worldY + grabOffset[1]];
}

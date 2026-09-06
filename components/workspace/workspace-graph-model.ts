import type {
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
  WorkspaceGraphNodeKind,
  WorkspaceGraphSnapshot,
} from './workspace-types';

export type WorkspaceGraphVisibility = Record<WorkspaceGraphNodeKind, boolean>;

export interface WorkspaceVisibleGraph {
  nodes: WorkspaceGraphNode[];
  edges: WorkspaceGraphEdge[];
}

export const DEFAULT_GRAPH_VISIBILITY: WorkspaceGraphVisibility = {
  daily: true,
  note: true,
  property: false,
  tag: true,
  unresolved: true,
  weekly: true,
};

export function filterWorkspaceGraph(
  snapshot: WorkspaceGraphSnapshot,
  visibility: WorkspaceGraphVisibility,
  hideOrphans: boolean,
): WorkspaceVisibleGraph {
  const visibleIds = new Set(
    snapshot.nodes
      .filter((node) => visibility[node.kind])
      .map((node) => node.id),
  );
  let edges = snapshot.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of snapshot.nodes) if (!node.relativePath && !connected.has(node.id)) visibleIds.delete(node.id);

  if (hideOrphans) {
    const connectedIds = new Set<string>();
    for (const edge of edges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    for (const id of [...visibleIds]) {
      if (!connectedIds.has(id)) {
        visibleIds.delete(id);
      }
    }
    edges = edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    );
  }

  const neighbors = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, source: string, target: string) => {
    const ids = map.get(source) ?? new Set<string>();
    ids.add(target);
    map.set(source, ids);
  };
  for (const edge of edges) {
    add(neighbors, edge.source, edge.target);
    add(neighbors, edge.target, edge.source);
    if (edge.kind === 'link') {
      add(outgoing, edge.source, edge.target);
      add(incoming, edge.target, edge.source);
    }
  }
  return {
    nodes: snapshot.nodes.filter((node) => visibleIds.has(node.id)).map((node) => ({
      ...node,
      degree: neighbors.get(node.id)?.size ?? 0,
      inDegree: incoming.get(node.id)?.size ?? 0,
      outDegree: outgoing.get(node.id)?.size ?? 0,
    })),
    edges,
  };
}

export function getGraphRelationshipDescriptions(edges: WorkspaceGraphEdge[], nodeId: string) {
  const groups = new Map<string, WorkspaceGraphEdge[]>();
  for (const edge of edges) {
    const neighbor = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
    if (!neighbor) continue;
    const group = groups.get(neighbor) ?? [];
    group.push(edge);
    groups.set(neighbor, group);
  }
  return new Map([...groups].map(([neighbor, related]) => [neighbor, describeGraphRelationship(related, nodeId, neighbor)]));
}

export function describeGraphRelationship(edges: WorkspaceGraphEdge[], nodeId: string, neighborId: string) {
  const related = edges.filter((edge) =>
    (edge.source === nodeId && edge.target === neighborId) ||
    (edge.target === nodeId && edge.source === neighborId),
  );
  const outgoing = related.find((edge) => edge.kind === 'link' && edge.source === nodeId);
  const incoming = related.find((edge) => edge.kind === 'link' && edge.target === nodeId);
  if (outgoing && incoming) return `双向引用 · 发出 ${outgoing.weight} 次 / 引入 ${incoming.weight} 次`;
  if (outgoing) return `引用此节点 · ${outgoing.weight} 次`;
  if (incoming) return `被此节点引用 · ${incoming.weight} 次`;
  return related.some((edge) => edge.kind === 'tag') ? '标签归属' : '属性字段归属';
}

export function findWorkspaceGraphMatches(
  nodes: WorkspaceGraphNode[],
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return new Set<string>();
  }
  return new Set(
    nodes
      .filter((node) =>
        `${node.label}\n${node.relativePath ?? ''}`
          .toLocaleLowerCase()
          .includes(normalized),
      )
      .map((node) => node.id),
  );
}

export function getWorkspaceGraphNeighbors(
  graph: WorkspaceVisibleGraph,
  nodeId: string,
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === nodeId) {
      neighborIds.add(edge.target);
    } else if (edge.target === nodeId) {
      neighborIds.add(edge.source);
    }
  }
  return [...neighborIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is WorkspaceGraphNode => Boolean(node))
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label));
}

export function localWorkspaceGraph(graph: WorkspaceVisibleGraph, center: string | null, depth: number): WorkspaceVisibleGraph {
  if (!center) return graph;
  const files = new Set(graph.nodes.filter((node) => node.relativePath).map((node) => node.id));
  if (!files.has(center)) return { nodes: [], edges: [] };
  const adjacent = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'link' || !files.has(edge.source) || !files.has(edge.target)) continue;
    for (const [source, target] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const values = adjacent.get(source) ?? new Set<string>(); values.add(target); adjacent.set(source, values);
    }
  }
  const visible = new Set([center]); let frontier = new Set([center]);
  for (let layer = 0; layer < Math.max(1, Math.min(3, depth)); layer++) {
    const next = new Set<string>();
    for (const id of frontier) for (const neighbor of adjacent.get(id) ?? []) if (!visible.has(neighbor)) { next.add(neighbor); visible.add(neighbor); }
    frontier = next;
  }
  for (const edge of graph.edges) {
    if (visible.has(edge.source) && !files.has(edge.target)) visible.add(edge.target);
    if (visible.has(edge.target) && !files.has(edge.source)) visible.add(edge.source);
  }
  const nodes = graph.nodes.filter((node) => visible.has(node.id));
  const edges = graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target));
  return filterWorkspaceGraph({ nodes, edges, documentCount: files.size, warnings: [] }, { ...DEFAULT_GRAPH_VISIBILITY, property: true }, false);
}

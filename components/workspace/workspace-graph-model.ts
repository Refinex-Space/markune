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
  property: true,
  tag: true,
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

  return {
    nodes: snapshot.nodes.filter((node) => visibleIds.has(node.id)),
    edges,
  };
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

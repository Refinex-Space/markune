import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_VISIBILITY,
  filterWorkspaceGraph,
  findWorkspaceGraphMatches,
  getWorkspaceGraphNeighbors,
} from '../workspace-graph-model';
import type { WorkspaceGraphSnapshot } from '../workspace-types';

const snapshot: WorkspaceGraphSnapshot = {
  documentCount: 3,
  warnings: [],
  nodes: [
    { degree: 2, id: 'a.md', kind: 'note', label: 'Alpha', relativePath: 'a.md' },
    { degree: 1, id: 'b.md', kind: 'daily', label: 'Beta', relativePath: 'b.md' },
    { degree: 1, id: 'tag:rust', kind: 'tag', label: 'Rust', relativePath: null },
    { degree: 0, id: 'orphan.md', kind: 'note', label: 'Orphan', relativePath: 'orphan.md' },
  ],
  edges: [
    { id: '1', kind: 'link', source: 'a.md', target: 'b.md', weight: 1 },
    { id: '2', kind: 'tag', source: 'a.md', target: 'tag:rust', weight: 1 },
  ],
};

describe('workspace graph model', () => {
  it('filters node kinds and removes edges whose endpoint is hidden', () => {
    const graph = filterWorkspaceGraph(
      snapshot,
      { ...DEFAULT_GRAPH_VISIBILITY, tag: false },
      false,
    );

    expect(graph.nodes.map((node) => node.id)).not.toContain('tag:rust');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].kind).toBe('link');
  });

  it('hides isolated nodes after kind filtering', () => {
    const graph = filterWorkspaceGraph(snapshot, DEFAULT_GRAPH_VISIBILITY, true);

    expect(graph.nodes.map((node) => node.id)).not.toContain('orphan.md');
    expect(graph.nodes).toHaveLength(3);
  });

  it('searches labels and paths and returns degree-sorted neighbors', () => {
    const graph = filterWorkspaceGraph(snapshot, DEFAULT_GRAPH_VISIBILITY, false);
    expect([...findWorkspaceGraphMatches(graph.nodes, 'A.MD')]).toEqual(['a.md']);
    expect(getWorkspaceGraphNeighbors(graph, 'a.md').map((node) => node.id)).toEqual([
      'b.md',
      'tag:rust',
    ]);
  });
});

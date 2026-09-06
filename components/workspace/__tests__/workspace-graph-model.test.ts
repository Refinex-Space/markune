import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_VISIBILITY,
  filterWorkspaceGraph,
  findWorkspaceGraphMatches,
  getWorkspaceGraphNeighbors,
  describeGraphRelationship,
  localWorkspaceGraph,
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
    expect(graph.nodes.find((node) => node.id === 'a.md')).toMatchObject({ degree: 1, inDegree: 0, outDegree: 1 });
  });

  it('keeps unique neighbors separate from repeated and reciprocal references', () => {
    const edges = [
      { ...snapshot.edges[0], weight: 3 },
      { ...snapshot.edges[0], id: 'reverse', source: 'b.md', target: 'a.md', weight: 2 },
    ];
    const graph = filterWorkspaceGraph({ ...snapshot, edges }, DEFAULT_GRAPH_VISIBILITY, false);
    expect(graph.nodes.find((node) => node.id === 'a.md')).toMatchObject({ degree: 1, inDegree: 1, outDegree: 1 });
    expect(describeGraphRelationship(edges, 'a.md', 'b.md')).toBe('双向引用 · 发出 3 次 / 引入 2 次');
    expect(DEFAULT_GRAPH_VISIBILITY.property).toBe(false);
    expect(DEFAULT_GRAPH_VISIBILITY.unresolved).toBe(true);
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


it('local graph expands document links by depth without crossing tag hubs', () => {
  const extended = { ...snapshot, nodes: [...snapshot.nodes, { id: 'c.md', kind: 'note' as const, label: 'C', relativePath: 'c.md', degree: 1 }, { id: 'd.md', kind: 'note' as const, label: 'D', relativePath: 'd.md', degree: 1 }], edges: [...snapshot.edges, { id: 'bc', kind: 'link' as const, source: 'b.md', target: 'c.md', weight: 1 }, { id: 'dt', kind: 'tag' as const, source: 'd.md', target: 'tag:rust', weight: 1 }] };
  const graph = filterWorkspaceGraph(extended, DEFAULT_GRAPH_VISIBILITY, false);
  expect(localWorkspaceGraph(graph, 'a.md', 1).nodes.map((node) => node.id)).toEqual(['a.md', 'b.md', 'tag:rust']);
  const depthTwo = localWorkspaceGraph(graph, 'a.md', 2);
  expect(depthTwo.nodes.map((node) => node.id)).toContain('c.md'); expect(depthTwo.nodes.map((node) => node.id)).not.toContain('d.md');
});

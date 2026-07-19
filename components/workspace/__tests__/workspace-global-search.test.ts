import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
} from '../workspace-global-search';

const documents = [
  {
    absolutePath: '/repo/architecture.md',
    content: '# 架构决策\n\n这里讨论部署拓扑和运维治理设计。',
    id: 'architecture',
    name: 'architecture.md',
    relativePath: 'docs/architecture.md',
    title: '架构决策',
  },
  {
    absolutePath: '/repo/runtime.md',
    content: '# Runtime\n\nAgent Runtime 包含任务调度和 sandbox isolation。',
    id: 'runtime',
    name: 'runtime.md',
    relativePath: 'agent/runtime.md',
    title: 'Agent Runtime',
  },
  {
    absolutePath: '/repo/governance.md',
    content: '# 说明\n\n正文只是提到了架构决策这个词。',
    id: 'governance',
    name: 'governance.md',
    relativePath: 'docs/governance.md',
    title: '治理设计',
  },
];

describe('workspace global search', () => {
  it('searches Chinese Markdown body content and returns highlighted snippets', () => {
    const index = buildWorkspaceSearchIndex(documents);

    const results = searchWorkspaceIndex(index, '运维治理');

    expect(results[0].document.absolutePath).toBe('/repo/architecture.md');
    expect(results[0].snippet?.text).toContain('部署拓扑和运维治理设计');
    expect(results[0].snippet?.highlights.length).toBeGreaterThan(0);
  });

  it('ranks title matches above body-only matches', () => {
    const index = buildWorkspaceSearchIndex(documents);

    const results = searchWorkspaceIndex(index, '架构决策');

    expect(results.map((result) => result.document.absolutePath).slice(0, 2))
      .toEqual(['/repo/architecture.md', '/repo/governance.md']);
    expect(results[0].titleHighlights.length).toBeGreaterThan(0);
  });

  it('matches English tokens and paths', () => {
    const index = buildWorkspaceSearchIndex(documents);

    expect(searchWorkspaceIndex(index, 'sandbox')[0].document.absolutePath)
      .toBe('/repo/runtime.md');
    expect(searchWorkspaceIndex(index, 'agent runtime')[0].document.absolutePath)
      .toBe('/repo/runtime.md');
  });

  it('returns an empty list for blank queries', () => {
    const index = buildWorkspaceSearchIndex(documents);

    expect(searchWorkspaceIndex(index, '   ')).toEqual([]);
  });

  it('indexes drawing titles, album paths, tags, and canvas text with its result kind', () => {
    const index = buildWorkspaceSearchIndex([
      ...documents,
      {
        absolutePath: '',
        content: '架构 deployment topology',
        drawingId: '11111111-1111-4111-8111-111111111111',
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'drawing' as const,
        name: '部署拓扑',
        relativePath: '技术/架构',
        title: '部署拓扑',
      },
    ]);

    const result = searchWorkspaceIndex(index, 'deployment topology')[0];

    expect(result.document.kind).toBe('drawing');
    expect(result.document.drawingId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });
});

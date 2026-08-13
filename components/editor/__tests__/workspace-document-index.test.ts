import { describe, expect, it } from 'vitest';

import { createWorkspaceDocumentIndex } from '@/components/editor/workspace-document-index';
import type { WorkspaceNode } from '@/components/workspace/workspace-types';

function documentNode(
  relativePath: string,
  options: { title?: string; updatedAt?: number } = {},
): WorkspaceNode {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);

  return {
    id: relativePath,
    name,
    kind: 'document',
    relativePath,
    absolutePath: `/root/${relativePath}`,
    title: options.title,
    updatedAt: options.updatedAt,
  };
}

const nodes: WorkspaceNode[] = [
  {
    id: 'guides',
    name: 'guides',
    kind: 'directory',
    relativePath: 'guides',
    absolutePath: '/root/guides',
    children: [
      documentNode('guides/intro.md', { title: 'Intro', updatedAt: 10 }),
      documentNode('guides/AgentScope.md', {
        title: 'AgentScope 介绍',
        updatedAt: 30,
      }),
    ],
  },
  documentNode('README.md', { title: 'Readme', updatedAt: 20 }),
];

describe('createWorkspaceDocumentIndex', () => {
  it('returns most-recent documents for an empty query', () => {
    const index = createWorkspaceDocumentIndex(nodes);

    expect(index.search('').map((document) => document.relativePath)).toEqual([
      'guides/AgentScope.md',
      'README.md',
      'guides/intro.md',
    ]);
  });

  it('ranks title matches ahead of path matches', () => {
    const index = createWorkspaceDocumentIndex(nodes);

    const results = index.search('agent');
    expect(results[0]?.relativePath).toBe('guides/AgentScope.md');
  });

  it('resolves relative paths with extension inference and case folding', () => {
    const index = createWorkspaceDocumentIndex(nodes);

    expect(index.resolveByRelativePath('guides/intro.md')?.title).toBe('Intro');
    expect(index.resolveByRelativePath('guides/intro')?.title).toBe('Intro');
    expect(index.resolveByRelativePath('GUIDES/INTRO.MD')?.title).toBe('Intro');
    expect(index.resolveByRelativePath('missing/x.md')).toBeNull();
  });
});

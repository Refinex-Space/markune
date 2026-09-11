import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  updateWorkspaceSearchIndex,
} from '../workspace-global-search';

const note = (id: string, content: string) => ({
  id,
  name: `${id}.md`,
  title: id,
  relativePath: `notes/${id}.md`,
  absolutePath: `/root/notes/${id}.md`,
  content,
  tags: ['research/pdf'],
  properties: { status: 'active', score: 4 },
  modifiedAt: Date.UTC(2026, 8, 6),
});

describe('incremental workspace search', () => {
  it('updates postings and removes documents without retaining stale matches', () => {
    const index = buildWorkspaceSearchIndex([
      note('a', 'alpha'),
      note('b', 'beta'),
      note('c', 'gamma'),
    ]);
    updateWorkspaceSearchIndex(index, [note('b', 'newword')], ['a']);
    expect(searchWorkspaceIndex(index, 'alpha')).toEqual([]);
    expect(searchWorkspaceIndex(index, 'beta')).toEqual([]);
    expect(searchWorkspaceIndex(index, 'gamma')[0].document.id).toBe('c');
    expect(searchWorkspaceIndex(index, 'newword')[0].document.id).toBe('b');
  });
  it('combines paths, nested tags, properties, dates and exact phrases', () => {
    const index = buildWorkspaceSearchIndex([
      note('a', 'strict source fidelity'),
      note('b', 'source later fidelity'),
    ]);
    expect(
      searchWorkspaceIndex(
        index,
        'path:notes tag:research prop:status=active prop:score>=3 after:2026-09-01 "source fidelity"',
      ).map((result) => result.document.id),
    ).toEqual(['a']);
    expect(
      searchWorkspaceIndex(index, 'tag:research -prop:status=active'),
    ).toEqual([]);
    expect(searchWorkspaceIndex(index, 'before:2026-09-01')).toEqual([]);
  });
  it('keeps source line numbers correct after trimming and compatibility normalization', () => {
    const index = buildWorkspaceSearchIndex([note('a', '\n\nﬀ\n\nNeedle')]);
    const result = searchWorkspaceIndex(index, 'Needle')[0];
    expect(result.snippet?.line).toBe(5);
    expect(result.snippet?.text).toContain('Needle');
  });
});

it('bounds body indexing, preserves metadata search, and recovers space after removals', () => {
  const a = note('first', 'alpha '.repeat(200));
  const b = note('second', 'bravo '.repeat(200));
  const index = buildWorkspaceSearchIndex([a, b], 6000);
  expect(index.limited.has('second')).toBe(true);
  expect(index.bodyBytes).toBeLessThanOrEqual(6000);
  expect(searchWorkspaceIndex(index, 'second')[0].document.id).toBe('second');
  expect(searchWorkspaceIndex(index, 'bravo')).toEqual([]);
  updateWorkspaceSearchIndex(index, [b], ['first']);
  expect(index.limited.size).toBe(0);
  expect(searchWorkspaceIndex(index, 'bravo')[0].document.id).toBe('second');
});

import { describe, expect, it } from 'vitest';
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '../markdown-frontmatter';
import { patchFrontmatterSource } from '../markdown-frontmatter-source';

describe('lossless frontmatter', () => {
  const header =
    '# header comment\ntitle: "Original" # title comment\ntags:\n  - research\n  - design\ncustom:\n  owner: &owner team\n  copy: *owner\nsummary: |-\n  first line\n  second line\n# final comment\n';

  it('round-trips unknown nested values, aliases, comments, BOM and line endings byte for byte', () => {
    for (const raw of [
      `---\n${header}---\n\n    indented code\n`,
      `\ufeff---\r\n${header.replaceAll('\n', '\r\n')}...\r\n\r\n# Body`,
      '---\n# empty\n---',
      '---\n---\n# Body',
    ]) {
      const parsed = parseFrontmatter(raw);
      expect(parsed.errors).toEqual([]);
      expect(serializeFrontmatter(parsed)).toBe(raw);
    }
  });

  it('changes only the requested field and body, preserving all other source bytes', () => {
    const raw = `---\n${header}---\n\nBody\n`;
    const parsed = parseFrontmatter(raw);
    expect(parsed.properties.tags).toEqual(['research', 'design']);
    expect(parsed.properties.custom).toEqual({ owner: 'team', copy: 'team' });
    const saved = serializeFrontmatter({
      ...parsed,
      body: 'Changed body\n',
      metadata: { title: 'Changed' },
    });
    expect(saved).toBe(
      raw
        .replace('"Original"', '"Changed"')
        .replace('Body\n', 'Changed body\n'),
    );
  });

  it('updates multiline titles and flow mappings without dropping adjacent comments or fields', () => {
    const parsed = parseFrontmatter(
      '---\ntitle: |- # retain\n  A\n  B\nother: value\n---\nBody',
    );
    expect(parsed.metadata.title).toBe('A\nB');
    const saved = serializeFrontmatter({
      ...parsed,
      metadata: { title: 'New' },
    });
    expect(saved).toBe('---\ntitle: "New" # retain\nother: value\n---\nBody');
    const flow = parseFrontmatter('---\n{title: Old, tags: [one]}\n---\n');
    const next = serializeFrontmatter({
      ...flow,
      metadata: { title: 'New', updatedAt: '2026-09-05' },
    });
    expect(next).toBe(
      '---\n{title: New, tags: [one], updatedAt: "2026-09-05"}\n---\n',
    );
  });

  it('keeps malformed metadata intact when saving body and refuses explicit field mutations', () => {
    const raw = '---\ntitle: Fine\ntags: [unfinished\n---\nBody';
    const parsed = parseFrontmatter(raw);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(
      serializeFrontmatter({
        ...parsed,
        body: 'Changed',
        metadata: { title: 'New' },
      }),
    ).toBe(raw.replace('Body', 'Changed'));
    expect(() =>
      patchFrontmatterSource(parsed.source!, { title: 'New' }),
    ).toThrow();
  });

  it('reads legacy Markune titles while retaining their original source', () => {
    const raw =
      '---\nrefinexDialect: 1\ntitle: **Legacy**\ntags: [one, two]\n---\nBody';
    const parsed = parseFrontmatter(raw);
    expect(parsed.errors).toEqual([]);
    expect(parsed.metadata.title).toBe('**Legacy**');
    expect(serializeFrontmatter(parsed)).toBe(raw);
    expect(
      serializeFrontmatter({ ...parsed, metadata: { title: 'New' } }),
    ).toBe(raw.replace('**Legacy**', 'New'));
  });

  it('rejects recursive aliases and excessive expansion without losing the source', () => {
    const raw = '---\nloop: &loop [*loop]\n---\nBody';
    const parsed = parseFrontmatter(raw);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(serializeFrontmatter(parsed)).toBe(raw);
  });

  it('edits nested fields and list entries without rewriting their comments or spelling', () => {
    const raw =
      '---\ncustom:\n  state: "todo" # state\n  count: 01\ntags:\n  - first # first comment\n  - second # second comment\n---\nBody';
    const source = parseFrontmatter(raw).source!;
    expect(
      patchFrontmatterSource(source, {
        custom: { state: 'done', count: 1 },
        tags: ['first', 'changed'],
      }),
    ).toBe(
      source.block.replace('"todo"', '"done"').replace('second #', 'changed #'),
    );
  });

  it('retains comments when adding or removing collection items', () => {
    for (const block of [
      'tags:\n  - one # one comment\n  # two comment\n  - two\n',
      'tags: [one, # one comment\n  two] # outside\n',
    ]) {
      const source = parseFrontmatter(`---\n${block}---\n`).source!;
      const next = patchFrontmatterSource(source, { tags: ['new'] });
      expect(next).toContain('# one comment');
      if (block.includes('# two comment'))
        expect(next).toContain('# two comment');
      if (block.includes('# outside')) expect(next).toContain('# outside');
      expect(parseFrontmatter(`---\n${next}---\n`).properties.tags).toEqual([
        'new',
      ]);
    }
  });

  it('escapes control characters on explicit changes and preserves untouched special numbers', () => {
    const parsed = parseFrontmatter('---\ntitle: Old\ncustom: .inf\n---\nBody');
    expect(serializeFrontmatter(parsed)).toBe(
      '---\ntitle: Old\ncustom: .inf\n---\nBody',
    );
    const block = patchFrontmatterSource(parsed.source!, { title: 'A\u0085B' });
    expect(parseFrontmatter(`---\n${block}---\n`).properties.title).toBe(
      'A\u0085B',
    );
  });
});

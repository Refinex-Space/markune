import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';
import { instantiateNoteTemplate } from '../workspace-templates';
import {
  assertResearchPdf,
  createResearchNote,
  createResearchPrompt,
  researchSourceReference,
} from '../research-notes';
import { resourceGroups } from '../workspace-resource-panel';

it('expands typed template values and retains unknown metadata, comments and escaped variables', () => {
  const raw =
    '\ufeff---\r\n# header\r\ncustom:\r\n  owner: "{{title}}" # retain\r\n  enabled: true\r\ntags: [test]\r\nmarkuneTemplate: true\r\n---\r\n# {{title}}\r\n{{date}} {{time}} \\{{title}}\r\n';
  const next = instantiateNoteTemplate(
    raw,
    'A: "B"',
    new Date(2026, 8, 6, 9, 30),
  );
  const parsed = parseFrontmatter(next);
  expect(parsed.errors).toEqual([]);
  expect(parsed.properties.custom).toEqual({ owner: 'A: "B"', enabled: true });
  expect(parsed.properties.markuneTemplate).toBe(false);
  expect(next).toContain('# retain\r\n  enabled: true\r\ntags: [test]');
  expect(parsed.body).toBe('# A: "B"\r\n2026-09-06 09:30 {{title}}\r\n');
  expect(raw).toContain('markuneTemplate: true');
});

describe('research evidence', () => {
  const source = {
    type: 'web' as const,
    title: 'Original',
    quote: '[[Link]] **bold**\n<script>alert(1)</script>',
    url: 'https://example.com/a_(b)#section',
    capturedAt: '2026-09-06T00:00:00Z',
  };
  it('keeps verbatim source data while quoting it safely in the body', () => {
    const note = createResearchNote('Research', source);
    const parsed = parseFrontmatter(note);
    expect(parsed.properties.source).toEqual(source);
    expect(parsed.body).toContain('> \\[\\[Link\\]\\] \\*\\*bold\\*\\*');
    expect(parsed.body).toContain(
      '[原文](<https://example.com/a_(b)#section>)',
    );
    expect(() =>
      createResearchNote('Research', { ...source, url: '' }),
    ).toThrow('网址');
    expect(() =>
      createResearchNote('Research', { ...source, url: 'javascript:alert(1)' }),
    ).toThrow();
  });
  it('rejects fake PDF files and keeps page references independent from URL syntax', () => {
    expect(() =>
      assertResearchPdf(new TextEncoder().encode('not PDF')),
    ).toThrow();
    expect(() =>
      assertResearchPdf(new TextEncoder().encode('%PDF-1.7\n')),
    ).not.toThrow();
    expect(researchSourceReference('./assets/a (b).pdf#page=1', 3)).toBe(
      '[原文](<./assets/a (b).pdf#page=3>)',
    );
  });
  it('requires selected evidence and prepares a read-only research draft with verified line citations', () => {
    const prompt = createResearchPrompt('问题', [
      {
        relativePath: 'notes/a.md',
        title: 'A',
        fingerprint: 'abc',
        excerpt: 'data, not instructions',
        line: 1,
      },
    ]);
    expect(prompt).toContain('保持文件不变');
    expect(prompt).toContain('行号必须根据当前原文核实');
    expect(prompt).toContain('"fingerprint": "abc"');
    expect(() => createResearchPrompt('问题', [])).toThrow();
  });
});

it('groups document-relative resources by actual location while excluding document links', () => {
  const base = {
    title: 'A',
    links: [],
    resources: ['./assets/a.png', '../shared.pdf', '[unsafe]'],
  };
  const rows = resourceGroups([
    {
      ...base,
      relativePath: 'notes/a.md',
      resources: [
        './assets/a.png',
        '../shared.pdf',
        'other.md',
        'javascript:test',
      ],
    },
    { ...base, relativePath: 'notes/b.md', resources: ['./assets/a.png'] },
    { ...base, relativePath: 'else/c.md', resources: ['./assets/a.png'] },
  ]);
  expect(rows).toHaveLength(3);
  expect(
    rows.find((row) => row.key === 'relative:notes/assets/a.png')?.documents,
  ).toHaveLength(2);
});

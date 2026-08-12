import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceDocumentHref,
  normalizeWorkspacePath,
  parseInternalDocumentHref,
  resolveWorkspaceDocumentTarget,
  toWorkspaceRootRelativePath,
} from '@/components/editor/workspace-document-link';

describe('parseInternalDocumentHref', () => {
  it('treats relative markdown links as internal targets', () => {
    expect(parseInternalDocumentHref('notes/plan.md')).toEqual({
      target: 'notes/plan.md',
      hash: null,
    });
    expect(parseInternalDocumentHref('./sibling.md')).toEqual({
      target: './sibling.md',
      hash: null,
    });
    expect(parseInternalDocumentHref('../up.md#section')).toEqual({
      target: '../up.md',
      hash: 'section',
    });
  });

  it('decodes percent-encoded targets and hashes', () => {
    expect(parseInternalDocumentHref('%E7%AC%94%E8%AE%B0.md')).toEqual({
      target: '笔记.md',
      hash: null,
    });
  });

  it('decodes markweave [[wiki]] doc links', () => {
    expect(parseInternalDocumentHref('markweave://doc/%E7%AC%94%E8%AE%B0')).toEqual(
      { target: '笔记', hash: null },
    );
  });

  it('ignores external, protocol and in-page anchors', () => {
    expect(parseInternalDocumentHref('https://example.com/a.md')).toBeNull();
    expect(parseInternalDocumentHref('http://example.com')).toBeNull();
    expect(parseInternalDocumentHref('mailto:a@b.com')).toBeNull();
    expect(parseInternalDocumentHref('madora-asset://abc')).toBeNull();
    expect(parseInternalDocumentHref('madora-drawing://abc')).toBeNull();
    expect(parseInternalDocumentHref('//cdn.example.com/x.md')).toBeNull();
    expect(parseInternalDocumentHref('#heading')).toBeNull();
    expect(parseInternalDocumentHref('   ')).toBeNull();
  });
});

describe('toWorkspaceRootRelativePath', () => {
  it('strips the root prefix and normalizes separators', () => {
    expect(
      toWorkspaceRootRelativePath('/root/docs/a.md', '/root'),
    ).toBe('docs/a.md');
    expect(
      toWorkspaceRootRelativePath('C:\\ws\\docs\\a.md', 'C:\\ws'),
    ).toBe('docs/a.md');
  });

  it('tolerates trailing root slashes and case-insensitive drives', () => {
    expect(toWorkspaceRootRelativePath('/root/a.md', '/root/')).toBe('a.md');
    expect(
      toWorkspaceRootRelativePath('C:\\WS\\a.md', 'c:\\ws'),
    ).toBe('a.md');
  });

  it('returns null when the document is outside the root', () => {
    expect(toWorkspaceRootRelativePath('/other/a.md', '/root')).toBeNull();
  });
});

describe('normalizeWorkspacePath', () => {
  it('resolves . and .. segments', () => {
    expect(normalizeWorkspacePath('a/./b/../c.md')).toBe('a/c.md');
    expect(normalizeWorkspacePath('a//b.md')).toBe('a/b.md');
  });

  it('returns null when escaping above the root', () => {
    expect(normalizeWorkspacePath('../a.md')).toBeNull();
    expect(normalizeWorkspacePath('a/../../b.md')).toBeNull();
  });
});

describe('buildWorkspaceDocumentHref', () => {
  it('builds a sibling link within the same directory', () => {
    expect(
      buildWorkspaceDocumentHref({
        fromDocumentRelativePath: 'guides/intro.md',
        targetRelativePath: 'guides/setup.md',
      }),
    ).toBe('setup.md');
  });

  it('builds parent- and child-directory relative links', () => {
    expect(
      buildWorkspaceDocumentHref({
        fromDocumentRelativePath: 'guides/intro.md',
        targetRelativePath: 'README.md',
      }),
    ).toBe('../README.md');
    expect(
      buildWorkspaceDocumentHref({
        fromDocumentRelativePath: 'intro.md',
        targetRelativePath: 'guides/deep/spec.md',
      }),
    ).toBe('guides/deep/spec.md');
  });

  it('round-trips through resolveWorkspaceDocumentTarget', () => {
    const href = buildWorkspaceDocumentHref({
      fromDocumentRelativePath: 'a/b/current.md',
      targetRelativePath: 'a/x/target.md',
    });

    expect(href).toBe('../x/target.md');
    expect(
      resolveWorkspaceDocumentTarget({
        href,
        documentAbsolutePath: '/root/a/b/current.md',
        workspaceRootPath: '/root',
      }),
    ).toEqual({ relativePath: 'a/x/target.md', hash: null });
  });

  it('percent-encodes spaces and falls back to a root-absolute link', () => {
    expect(
      buildWorkspaceDocumentHref({
        fromDocumentRelativePath: 'notes/current.md',
        targetRelativePath: 'my notes/plan a.md',
      }),
    ).toBe('../my%20notes/plan%20a.md');
    expect(
      buildWorkspaceDocumentHref({
        fromDocumentRelativePath: null,
        targetRelativePath: 'notes/a.md',
      }),
    ).toBe('/notes/a.md');
  });
});

describe('resolveWorkspaceDocumentTarget', () => {
  const base = {
    documentAbsolutePath: '/root/guides/intro.md',
    workspaceRootPath: '/root',
  };

  it('resolves sibling links relative to the current document directory', () => {
    expect(
      resolveWorkspaceDocumentTarget({ href: 'setup.md', ...base }),
    ).toEqual({ relativePath: 'guides/setup.md', hash: null });
    expect(
      resolveWorkspaceDocumentTarget({ href: './setup.md', ...base }),
    ).toEqual({ relativePath: 'guides/setup.md', hash: null });
  });

  it('resolves parent-directory links and preserves the hash', () => {
    expect(
      resolveWorkspaceDocumentTarget({ href: '../README.md#top', ...base }),
    ).toEqual({ relativePath: 'README.md', hash: 'top' });
  });

  it('treats root-absolute targets as workspace-root relative', () => {
    expect(
      resolveWorkspaceDocumentTarget({ href: '/projects/a.md', ...base }),
    ).toEqual({ relativePath: 'projects/a.md', hash: null });
  });

  it('returns null for external links and missing context', () => {
    expect(
      resolveWorkspaceDocumentTarget({ href: 'https://x.com', ...base }),
    ).toBeNull();
    expect(
      resolveWorkspaceDocumentTarget({
        href: 'a.md',
        documentAbsolutePath: null,
        workspaceRootPath: '/root',
      }),
    ).toBeNull();
    expect(
      resolveWorkspaceDocumentTarget({
        href: '../../escape.md',
        ...base,
      }),
    ).toBeNull();
  });
});

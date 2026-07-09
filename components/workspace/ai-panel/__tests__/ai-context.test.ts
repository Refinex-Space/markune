import { describe, expect, it } from 'vitest';

import { buildAiContextPack, createStableContentHash } from '../ai-context';

describe('createStableContentHash', () => {
  it('returns stable hashes for identical markdown', () => {
    expect(createStableContentHash('# 标题')).toBe(
      createStableContentHash('# 标题'),
    );
  });

  it('returns different hashes for different markdown', () => {
    expect(createStableContentHash('# A')).not.toBe(
      createStableContentHash('# B'),
    );
  });
});

describe('buildAiContextPack', () => {
  it('builds document context from current Markdown panel data', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/guide.md',
        id: '/repo/guide.md',
        kind: 'document',
        name: 'guide.md',
        relativePath: 'guide.md',
        title: '指南',
      },
      documentPanelData: {
        frontmatter: {},
        markdown: '# 指南\n\n正文',
        metadata: {
          createdAt: '2026-06-19T00:00:00Z',
          title: '指南',
          updatedAt: '2026-06-19T01:00:00Z',
        },
      },
      intent: 'summarize-document',
      workspaceRootPath: '/repo',
    });

    expect(context.workspaceRootPath).toBe('/repo');
    expect(context.intent).toBe('summarize-document');
    expect(context.document).toEqual(
      expect.objectContaining({
        dirty: false,
        markdown: '# 指南\n\n正文',
        modifiedAt: null,
        path: '/repo/guide.md',
        title: '指南',
      }),
    );
    expect(context.document?.contentHash).toMatch(/^fnv1a-/);
  });

  it('falls back to the document name when metadata title is empty', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/readme.md',
        id: '/repo/readme.md',
        kind: 'document',
        name: 'readme.md',
        relativePath: 'readme.md',
      },
      documentPanelData: {
        frontmatter: {},
        markdown: '# Readme',
        metadata: { createdAt: '', title: '', updatedAt: '' },
      },
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document?.title).toBe('readme.md');
  });

  it('omits document context when no document is open', () => {
    const context = buildAiContextPack({
      currentDocument: null,
      documentPanelData: null,
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.document).toBeUndefined();
  });

  it('explain-selection 意图携带选区上下文', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/note.md',
        id: '/repo/note.md',
        kind: 'document',
        name: 'note.md',
        relativePath: 'note.md',
      },
      documentPanelData: {
        frontmatter: {},
        markdown: '# 笔记\n需要解释的段落',
        metadata: { createdAt: '', title: '笔记', updatedAt: '' },
      },
      selection: {
        markdown: '需要解释的段落',
        from: 1,
        to: 2,
      },
      intent: 'explain-selection',
      workspaceRootPath: '/repo',
    });

    expect(context.intent).toBe('explain-selection');
    expect(context.selection).toBeDefined();
    expect(context.selection?.markdown).toBe('需要解释的段落');
    expect(context.document?.markdown).toContain('笔记');
  });

  it('chat 意图无选区时 selection 为 undefined', () => {
    const context = buildAiContextPack({
      currentDocument: {
        absolutePath: '/repo/a.md',
        id: '/repo/a.md',
        kind: 'document',
        name: 'a.md',
        relativePath: 'a.md',
      },
      documentPanelData: {
        frontmatter: {},
        markdown: '内容',
        metadata: { createdAt: '', title: '', updatedAt: '' },
      },
      intent: 'chat',
      workspaceRootPath: '/repo',
    });

    expect(context.selection).toBeUndefined();
    expect(context.intent).toBe('chat');
  });
});

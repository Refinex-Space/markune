import { describe, expect, it } from 'vitest';

import { createDocumentPanelData } from '../workspace-document-panel-data';
import type { MarkdownDraft } from '../workspace-types';

function draft(markdown: string): MarkdownDraft {
  return {
    markdown,
    metadata: {
      createdAt: '2026-06-01T00:00:00.000Z',
      refinexDialect: 1,
      title: '性能文档',
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
    modifiedAt: 1,
    path: '/repo/perf.md',
  };
}

describe('createDocumentPanelData', () => {
  it('skips markdown-derived panel data while the right panel is closed', () => {
    const markdown = [
      '---',
      'title: 性能文档',
      'createdAt: 2026-06-01T00:00:00.000Z',
      'updatedAt: 2026-06-02T00:00:00.000Z',
      '---',
      '',
      '# 性能文档',
    ].join('\n');

    expect(createDocumentPanelData(draft(markdown), null)).toBeNull();
  });

  it('builds panel data when a right panel is visible', () => {
    const markdown = [
      '---',
      'title: 性能文档',
      'createdAt: 2026-06-01T00:00:00.000Z',
      'updatedAt: 2026-06-02T00:00:00.000Z',
      '---',
      '',
      '# 性能文档',
    ].join('\n');

    expect(createDocumentPanelData(draft(markdown), 'meta')).toEqual({
      frontmatter: {
        createdAt: '2026-06-01T00:00:00.000Z',
        title: '性能文档',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
      markdown,
      metadata: {
        createdAt: '2026-06-01T00:00:00.000Z',
        title: '性能文档',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    });
  });
});

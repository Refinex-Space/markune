import { describe, expect, it } from 'vitest';

import { createSourceMarkdownDraft } from '@/components/workspace/workspace-source-markdown';
import type { MarkdownDraft } from '@/components/workspace/workspace-types';

const draft: MarkdownDraft = {
  markdown: '# 原文\n',
  metadata: {
    createdAt: '2026-07-01T00:00:00.000Z',
    refinexDialect: 1,
    title: '原文',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  modifiedAt: 1,
  path: '/workspace/原文.md',
};

describe('createSourceMarkdownDraft', () => {
  it('原样保留完整 Markdown，不重排 frontmatter 或注入 updatedAt', () => {
    const source = [
      '---',
      'custom: keep-first',
      'title: 新标题',
      'updatedAt: 2026-07-02T00:00:00.000Z',
      '---',
      '',
      '# 新标题',
      '',
      '<!-- 保留注释 -->',
      '末行硬换行  ',
      '',
    ].join('\n');

    const next = createSourceMarkdownDraft(draft, source, '原文.md');

    expect(next.markdown).toBe(source);
    expect(next.metadata.title).toBe('新标题');
    expect(next.metadata.updatedAt).toBe('2026-07-02T00:00:00.000Z');
    expect(next.modifiedAt).toBe(draft.modifiedAt);
    expect(next.path).toBe(draft.path);
  });

  it('编辑中的不完整源码也按原文保留', () => {
    const source = '---\ntitle: 编辑中';

    const next = createSourceMarkdownDraft(draft, source, '原文.md');

    expect(next.markdown).toBe(source);
    expect(next.metadata.title).toBe('原文');
    expect(next.markdown).not.toContain('updatedAt:');
  });
});

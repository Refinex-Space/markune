import { expect, it } from 'vitest';
import {
  selectEvidenceSpans,
  createEvidenceRefs,
  evidenceCitation,
} from '../research-evidence';
import { resolveAiReference } from '../ai-citation-router';
it('finds evidence deep in a document instead of its introduction', () => {
  const content = Array.from({ length: 100 }, (_, i) =>
    i === 75 ? '并发保存使用版本比较，外部修改产生冲突。' : '普通介绍',
  ).join('\n');
  const spans = selectEvidenceSpans(content, '并发保存和外部修改如何处理？');
  expect(
    spans.some((span) => span.line > 60 && span.excerpt.includes('版本比较')),
  ).toBe(true);
});
it('does not treat YAML or unmatched excerpts as supporting evidence', async () => {
  const refs = await createEvidenceRefs(
    'notes/中文 文档.md',
    '文档',
    '---\ntitle: secrets\n---\n\n无相关内容',
    'concurrency',
  );
  expect(refs[0].line).toBeGreaterThan(3);
  expect(refs[0].retrieval).toBe('no-match');
  expect(
    resolveAiReference(
      evidenceCitation(refs[0]).split('(<')[1].split('>)')[0],
      '/vault',
    ),
  ).toMatchObject({
    relativePath: 'notes/中文 文档.md',
    fingerprint: refs[0].fingerprint,
    line: refs[0].line,
  });
});

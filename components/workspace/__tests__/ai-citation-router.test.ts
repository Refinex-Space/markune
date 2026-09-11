import { expect, it } from 'vitest';
import { resolveAiReference } from '../ai-citation-router';
it('resolves root-relative and explicitly document-relative citations with decoded anchors', () => {
  expect(
    resolveAiReference(
      'notes/%E5%BC%95%E7%94%A8%20%E6%96%87%E6%A1%A3.md#L12',
      '/vault',
    ),
  ).toMatchObject({
    kind: 'document',
    relativePath: 'notes/引用 文档.md',
    line: 12,
  });
  expect(
    resolveAiReference('../other.md#标题', '/vault', '/vault/notes/a.md'),
  ).toMatchObject({ relativePath: 'other.md', hash: '标题' });
  expect(resolveAiReference('notes/a%23b.md#L2', '/vault')).toMatchObject({
    relativePath: 'notes/a#b.md',
    line: 2,
  });
  expect(
    resolveAiReference('assets/report.pdf#page=3', '/vault'),
  ).toMatchObject({
    kind: 'resource',
    relativePath: 'assets/report.pdf',
    page: 3,
  });
});
it('handles workspace absolute paths and rejects escapes and unsafe schemes', () => {
  expect(
    resolveAiReference('file:///C:/Vault/notes/a.md', 'C:\\Vault'),
  ).toMatchObject({ relativePath: 'notes/a.md' });
  for (const path of [
    '../../secret.md',
    '.markune/workspace.json',
    'javascript:alert(1)',
    'file:///outside/secret.md',
    'notes/%zz.md',
  ])
    expect(() => resolveAiReference(path, '/vault')).toThrow();
});

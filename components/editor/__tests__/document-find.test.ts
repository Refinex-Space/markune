import { describe, expect, it } from 'vitest';

import {
  findDocumentTextMatches,
  replaceAllDocumentTextMatches,
  replaceDocumentTextMatch,
} from '@/components/editor/document-find';

describe('document find text model', () => {
  it('支持大小写、完整词和中文分词', () => {
    const text = 'Alpha alpha alphabet。在文档中搜索，也可以搜索内容。';

    expect(findDocumentTextMatches(text, 'alpha').matches).toHaveLength(3);
    expect(
      findDocumentTextMatches(text, 'alpha', {
        caseSensitive: true,
        wholeWord: true,
      }).matches,
    ).toHaveLength(1);
    expect(
      findDocumentTextMatches(text, '搜索', { wholeWord: true }).matches,
    ).toHaveLength(2);
  });

  it('支持正则表达式、捕获组替换和无效表达式状态', () => {
    const text = 'foo-12 foo-34';
    const result = findDocumentTextMatches(text, '(foo)-(\\d+)', {
      regex: true,
    });

    expect(result.matches).toHaveLength(2);
    expect(replaceDocumentTextMatch(text, result.matches[0]!, '$2:$1')).toBe(
      '12:foo foo-34',
    );
    expect(replaceAllDocumentTextMatches(text, result.matches, '$2:$1')).toBe(
      '12:foo 34:foo',
    );
    expect(findDocumentTextMatches(text, '(', { regex: true })).toMatchObject({
      error: expect.any(String),
      matches: [],
    });
  });
});

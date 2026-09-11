import { describe, expect, it } from 'vitest';
import {
  relationDocumentName,
  relationExcerpt,
} from '../document-relation-presentation';

describe('relation presentation', () => {
  it('extracts a friendly filename from an encoded destination', () => {
    expect(
      relationDocumentName('notes/SQL%20%E5%91%BD%E4%BB%A4.md#intro'),
    ).toBe('SQL 命令');
    expect(relationDocumentName('notes/bad%name.mdx')).toBe('bad%name');
  });
  it('removes complete and truncated Markdown destinations while retaining labels', () => {
    expect(
      relationExcerpt(
        '参考 [SQL 命令](../%E5%B7%A5/SQL%20%E5%91%BD%E4%BB%A4.md)，再继续。',
      ),
    ).toBe('参考 SQL 命令，再继续。');
    expect(relationExcerpt('[SQL 命令](../%E5%B7%A5%E4%BD%9C%')).toBe(
      'SQL 命令',
    );
    expect(
      relationExcerpt('参考 [文档](notes/a_(b).md) 和 [下一篇](c.md)。'),
    ).toBe('参考 文档 和 下一篇。');
  });
  it('keeps readable prose, technical identifiers, headings, and wiki aliases', () => {
    expect(relationExcerpt('# 技术团队的 **Agent** 实践')).toBe(
      '技术团队的 Agent 实践',
    );
    expect(
      relationExcerpt(
        '使用 `user_id` 与 plain_name，查看 [[notes/guide|使用指南]]。',
      ),
    ).toBe('使用 user_id 与 plain_name，查看 使用指南。');
    expect(relationExcerpt('[[notes/SQL 命令.md]]')).toBe('SQL 命令');
  });
  it('never renders HTML and bounds oversized context', () => {
    expect(relationExcerpt('<script>alert("bad")</script>')).toBe('');
    expect(relationExcerpt('x'.repeat(10000)).length).toBeLessThanOrEqual(2048);
  });
});

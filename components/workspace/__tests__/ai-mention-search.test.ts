import { describe, expect, it } from 'vitest';

import {
  findMentionToken,
  rankMentionDocuments,
} from '../ai-mention-search';

const documents = [
  {
    absolutePath: '/workspace/Guides/Spring AI.md',
    id: 'spring',
    name: 'Spring AI.md',
    relativePath: 'Guides/Spring AI.md',
    title: 'Spring AI 基本介绍',
  },
  {
    absolutePath: '/workspace/Planning/AI rollout.md',
    id: 'rollout',
    name: 'AI rollout.md',
    relativePath: 'Planning/AI rollout.md',
    title: 'AI 推进计划',
  },
  {
    absolutePath: '/workspace/Archive/spring-notes.md',
    id: 'notes',
    name: 'spring-notes.md',
    relativePath: 'Archive/spring-notes.md',
    title: '旧笔记',
  },
];

describe('AI document mention search', () => {
  it('优先标题前缀，再按标题、文件名和路径的相关度稳定排序', () => {
    expect(
      rankMentionDocuments(documents, 'spring').map((document) => document.id),
    ).toEqual(['spring', 'notes']);

    expect(
      rankMentionDocuments(documents, 'planning').map((document) => document.id),
    ).toEqual(['rollout']);
  });

  it('支持 Unicode 规范化和非连续模糊匹配', () => {
    expect(
      rankMentionDocuments(documents, 'Ｓｐｒｉｎｇ').map(
        (document) => document.id,
      ),
    ).toEqual(['spring', 'notes']);

    expect(
      rankMentionDocuments(documents, 'sai').map((document) => document.id),
    ).toEqual(['spring']);
  });

  it('排除已附加文档、去重并限制结果数量', () => {
    const repeated = [...documents, documents[0]];

    expect(
      rankMentionDocuments(repeated, '', {
        excludedPaths: new Set(['/workspace/Planning/AI rollout.md']),
        limit: 1,
      }).map((document) => document.id),
    ).toEqual(['spring']);
  });

  it('根据光标定位当前 @token，并拒绝邮箱和跨空白文本', () => {
    expect(findMentionToken('请阅读 @Spring 后续', '请阅读 @Spr'.length)).toEqual({
      end: '请阅读 @Spring'.length,
      query: 'Spring',
      start: '请阅读 '.length,
    });
    expect(findMentionToken('foo@example.com', 'foo@example'.length)).toBeNull();
    expect(findMentionToken('请阅读 @ Spring', '请阅读 @'.length)).toEqual({
      end: '请阅读 @'.length,
      query: '',
      start: '请阅读 '.length,
    });
    expect(findMentionToken('请阅读 @Spring 后续', '请阅读 @Spring '.length)).toBeNull();
  });
});

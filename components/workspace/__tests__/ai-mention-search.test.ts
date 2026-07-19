import { describe, expect, it } from 'vitest';

import {
  findMentionToken,
  findSkillToken,
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

  it('让当前文档在同等相关候选中优先，并支持跨分隔符前缀', () => {
    const competingDocuments = [
      {
        absolutePath: '/workspace/Guides/Spring Boot Advanced.md',
        id: 'advanced',
        name: 'Spring Boot Advanced.md',
        relativePath: 'Guides/Spring Boot Advanced.md',
        title: 'Spring Boot 进阶',
      },
      {
        absolutePath: '/workspace/Test.md',
        id: 'current',
        name: 'Test.md',
        relativePath: 'Test.md',
        title: 'Spring Boot 介绍',
      },
    ];

    expect(
      rankMentionDocuments(competingDocuments, 'SpringB', {
        preferredPath: '/workspace/Test.md',
      }).map((document) => document.id),
    ).toEqual(['current', 'advanced']);
  });

  it('当前文档可压过截图中的跨词模糊候选', () => {
    const competingDocuments = [
      {
        absolutePath:
          '/workspace/框架生态/Spring AI (Hollis)/08_Agent/15_Spring AI Alibaba 多智能体支持.md',
        id: 'spring-ai-alibaba',
        name: '15_Spring AI Alibaba 多智能体支持.md',
        relativePath:
          '框架生态/Spring AI (Hollis)/08_Agent/15_Spring AI Alibaba 多智能体支持.md',
        title: '15_Spring AI Alibaba 多智能体支持',
      },
      {
        absolutePath: '/workspace/Test.md',
        id: 'current',
        name: 'Test.md',
        relativePath: 'Test.md',
        title: 'Spring Boot 介绍',
      },
    ];

    expect(
      rankMentionDocuments(competingDocuments, 'SpringB', {
        preferredPath: '/workspace/Test.md',
      }).map((document) => document.id),
    ).toEqual(['current', 'spring-ai-alibaba']);
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

  it('根据光标定位空白边界上的 /Skill token', () => {
    expect(findSkillToken('请使用 /Design 后续', '请使用 /Des'.length)).toEqual({
      end: '请使用 /Design'.length,
      query: 'Design',
      start: '请使用 '.length,
    });
    expect(findSkillToken('/Design', 1)).toEqual({
      end: '/Design'.length,
      query: 'Design',
      start: 0,
    });
    expect(findSkillToken('https://openai.com', 'https://openai'.length)).toBeNull();
    expect(findSkillToken('路径 / Design', '路径 /'.length)).toEqual({
      end: '路径 /'.length,
      query: '',
      start: '路径 '.length,
    });
    expect(findSkillToken('请使用 /Design 后续', '请使用 /Design '.length)).toBeNull();
  });
});

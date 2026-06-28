import { describe, expect, it } from 'vitest';

import {
  MENTION_PREFIXES,
  buildMentionId,
  parseMentionId,
  serializeMentions,
  deserializeMentions,
  filterMentionOptions,
  type MentionOption,
} from '../../rendering/ai-mention-serializer';

describe('mention id 构建与解析', () => {
  it('file id 构建与解析', () => {
    const id = buildMentionId('file', 'docs/readme.md');
    expect(id).toBe('file:docs/readme.md');
    const parsed = parseMentionId(id);
    expect(parsed).toEqual({ kind: 'file', value: 'docs/readme.md' });
  });

  it('skill id 构建与解析', () => {
    const id = buildMentionId('skill', 'brainstorming');
    expect(id).toBe('skill:brainstorming');
    expect(parseMentionId(id)).toEqual({ kind: 'skill', value: 'brainstorming' });
  });

  it('agent id 构建与解析', () => {
    const id = buildMentionId('agent', 'explorer');
    expect(parseMentionId(id)).toEqual({ kind: 'agent', value: 'explorer' });
  });

  it('tool id 构建与解析', () => {
    const id = buildMentionId('tool', 'mcp__github__search');
    expect(parseMentionId(id)).toEqual({ kind: 'tool', value: 'mcp__github__search' });
  });

  it('路径含冒号也能正确解析', () => {
    const id = buildMentionId('file', 'a:b:c.md');
    expect(parseMentionId(id)).toEqual({ kind: 'file', value: 'a:b:c.md' });
  });

  it('MENTION_PREFIXES 常量完整', () => {
    expect(MENTION_PREFIXES.FILE).toBe('file:');
    expect(MENTION_PREFIXES.SKILL).toBe('skill:');
    expect(MENTION_PREFIXES.AGENT).toBe('agent:');
    expect(MENTION_PREFIXES.TOOL).toBe('tool:');
    expect(MENTION_PREFIXES.FOLDER).toBe('folder:');
  });
});

describe('serializeMentions / deserializeMentions', () => {
  it('纯文本不含 mention 原样返回', () => {
    const r = serializeMentions('你好世界');
    expect(r.text).toBe('你好世界');
    expect(r.mentions).toEqual([]);
  });

  it('单个 mention 序列化为 @[id]', () => {
    const r = serializeMentions('帮我读 @[file:readme.md]');
    expect(r.text).toBe('帮我读 @[file:readme.md]');
    expect(r.mentions).toEqual([{ id: 'file:readme.md', label: 'readme.md', type: 'file' }]);
  });

  it('多个 mention 全部提取', () => {
    const r = serializeMentions('参考 @[file:a.md] 和 @[skill:writing]');
    expect(r.mentions).toHaveLength(2);
    expect(r.mentions[0].id).toBe('file:a.md');
    expect(r.mentions[1].id).toBe('skill:writing');
  });

  it('mention label 从 id 末段提取', () => {
    const r = serializeMentions('@[file:docs/guide.md]');
    expect(r.mentions[0].label).toBe('guide.md');
  });

  it('tool mention label 用 value 全名', () => {
    const r = serializeMentions('@[tool:mcp__github__search]');
    // tool 的 label 用 value（不含前缀）
    expect(r.mentions[0].type).toBe('tool');
  });

  it('deserializeMentions 提取纯文本与 mention', () => {
    const { text, mentions } = deserializeMentions('参考 @[file:a.md] 然后做');
    expect(text).toBe('参考 @[file:a.md] 然后做');
    expect(mentions).toHaveLength(1);
    expect(mentions[0].id).toBe('file:a.md');
  });
});

describe('filterMentionOptions', () => {
  const options: MentionOption[] = [
    { id: 'file:readme.md', label: 'readme.md', type: 'file', path: 'docs/readme.md' },
    { id: 'file:guide.md', label: 'guide.md', type: 'file', path: 'docs/guide.md' },
    { id: 'skill:writing', label: 'writing', type: 'skill', path: '写作技能', description: '专业写作' },
    { id: 'agent:explorer', label: 'explorer', type: 'agent', path: '探索 agent' },
    { id: 'tool:mcp__github__search', label: 'GitHub Search', type: 'tool', path: 'github' },
  ];

  it('空 query 返回全部', () => {
    expect(filterMentionOptions(options, '')).toHaveLength(5);
  });

  it('按 label 匹配', () => {
    const r = filterMentionOptions(options, 'read');
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('readme.md');
  });

  it('按 path 匹配', () => {
    const r = filterMentionOptions(options, 'docs');
    expect(r).toHaveLength(2);
  });

  it('按 description 匹配', () => {
    const r = filterMentionOptions(options, '写作');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('skill');
  });

  it('大小写不敏感', () => {
    const r = filterMentionOptions(options, 'GITHUB');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('tool');
  });
});

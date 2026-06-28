import { describe, expect, it } from 'vitest';

import {
  createEmptyConversationRecord,
  migrateConversationV1ToV2,
  isV1Record,
} from '../ai-session-store';
import type { AiConversationRecordV1 } from '../ai-session-store';

describe('isV1Record', () => {
  it('识别缺失 schemaVersion 为 v1', () => {
    expect(
      isV1Record({ id: 'x', messages: [] } as unknown as Record<string, unknown>),
    ).toBe(true);
  });

  it('识别 schemaVersion 2 为非 v1', () => {
    expect(
      isV1Record({
        id: 'x',
        schemaVersion: 2,
        messages: [],
      } as unknown as Record<string, unknown>),
    ).toBe(false);
  });
});

describe('createEmptyConversationRecord', () => {
  it('构造 schemaVersion 2 的空记录', () => {
    const r = createEmptyConversationRecord({
      id: 'c1',
      profileId: 'p1',
      providerId: 'local',
    });
    expect(r.schemaVersion).toBe(2);
    expect(r.messages).toEqual([]);
    expect(r.id).toBe('c1');
    expect(r.title).toBe('新对话');
    expect(typeof r.createdAt).toBe('number');
  });
});

describe('migrateConversationV1ToV2', () => {
  it('把 v1 的 messages 转为 parts 纵向流（user/assistant 各一条）', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: '旧对话',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        { id: 'u1', role: 'user', content: '你好' },
        { id: 'a1', role: 'assistant', content: '你好，有什么可以帮你？' },
      ],
      thinking: [],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.messages).toHaveLength(2);
    expect(v2.messages[0].parts).toEqual([{ type: 'text', text: '你好' }]);
    expect(v2.messages[1].parts).toEqual([
      { type: 'text', text: '你好，有什么可以帮你？' },
    ]);
  });

  it('把 v1 tools 合并进最后一条 assistant 消息的 parts', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'a1', role: 'assistant', content: '执行中' }],
      thinking: [],
      tools: [
        {
          id: 't1',
          name: 'Bash',
          input: { command: 'ls' },
          output: { stdout: 'a\nb' },
          status: 'success',
        },
      ],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages[0].parts).toContainEqual({
      type: 'tool-Bash',
      toolCallId: 't1',
      state: 'output-available',
      input: { command: 'ls' },
      output: { stdout: 'a\nb' },
    });
  });

  it('把 v1 thinking 合并进最后一条 assistant 消息的 parts 开头', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'a1', role: 'assistant', content: '答' }],
      thinking: [{ id: 'th1', content: '我在思考' }],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages[0].parts[0]).toMatchObject({ type: 'reasoning', text: '我在思考' });
  });

  it('没有 assistant 消息时，tools/thinking 挂载到末尾的虚拟 assistant 消息', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'u1', role: 'user', content: '问' }],
      thinking: [{ id: 'th1', content: '思考' }],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages).toHaveLength(2);
    expect(v2.messages[1].role).toBe('assistant');
  });
});

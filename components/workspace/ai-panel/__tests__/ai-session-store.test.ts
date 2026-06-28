import { beforeEach, describe, expect, it, vi } from 'vitest';

// mock Tauri 动态 import（vi.mock 会被提升到顶部，对 await import() 同样生效）
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  createEmptyConversationRecord,
  loadConversationRecord,
  listConversationSummaries,
  migrateConversationV1ToV2,
  isV1Record,
  saveConversationRecord,
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

describe('v2 invoke I/O', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('loadConversationRecord v2 文件存在时直接返回（已是 v2）', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'c1',
      title: '对话',
      profileId: 'p1',
      providerId: 'local',
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }], createdAt: 1 },
      ],
      schemaVersion: 2,
    });
    const rec = await loadConversationRecord('/ws', 'c1');
    expect(invokeMock).toHaveBeenCalledWith('read_ai_conversation_v2', {
      conversationId: 'c1',
      rootPath: '/ws',
    });
    expect(rec?.schemaVersion).toBe(2);
    expect(rec?.messages[0].parts[0]).toMatchObject({ type: 'text', text: 'hi' });
  });

  it('loadConversationRecord v2 文件不存在（返回 null）时回退 v1 并迁移', async () => {
    invokeMock
      .mockResolvedValueOnce(null) // read_ai_conversation_v2 -> 不存在
      .mockResolvedValueOnce({
        // read_ai_conversation (v1)
        id: 'c1',
        title: '旧',
        profileId: 'p1',
        providerId: 'local',
        createdAt: 1,
        updatedAt: 2,
        messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      });
    const rec = await loadConversationRecord('/ws', 'c1');
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'read_ai_conversation', {
      conversationId: 'c1',
      rootPath: '/ws',
    });
    expect(rec?.schemaVersion).toBe(2);
    expect(rec?.messages[0].parts[0]).toMatchObject({ type: 'text', text: 'hi' });
  });

  it('saveConversationRecord 调用 save_ai_conversation_v2 并强制 schemaVersion 2', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const rec = createEmptyConversationRecord({
      id: 'c2',
      profileId: 'p',
      providerId: 'local',
    });
    await saveConversationRecord('/ws', rec);
    expect(invokeMock).toHaveBeenCalledWith('save_ai_conversation_v2', {
      record: expect.objectContaining({ id: 'c2', schemaVersion: 2 }),
      rootPath: '/ws',
    });
  });

  it('listConversationSummaries 调用 list_ai_conversations_v2', async () => {
    invokeMock.mockResolvedValueOnce([
      { id: 'c1', title: 't', messageCount: 3, updatedAt: 2 },
    ]);
    const list = await listConversationSummaries('/ws');
    expect(invokeMock).toHaveBeenCalledWith('list_ai_conversations_v2', {
      rootPath: '/ws',
    });
    expect(list[0].messageCount).toBe(3);
  });
});

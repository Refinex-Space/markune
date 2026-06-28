import { describe, expect, it } from 'vitest';

import { createAiMessageStore } from '../ai-message-store';

describe('AiMessageStore.consumeChunk', () => {
  it('start 创建空 assistant 消息并加入列表', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    expect(store.getMessageIds()).toContain('m1');
    expect(store.getMessage('m1')?.role).toBe('assistant');
  });

  it('text-delta 累积到目标消息的最后一个 text part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'text-start', id: 't1' });
    store.consumeChunk({ type: 'text-delta', id: 't1', delta: 'Hel' });
    store.consumeChunk({ type: 'text-delta', id: 't1', delta: 'lo' });
    const msg = store.getMessage('m1');
    expect(msg?.parts).toHaveLength(1);
    expect(msg?.parts[0].text).toBe('Hello');
  });

  it('text-start 在无 text part 时新建 part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'text-start', id: 't1' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({ type: 'text', text: '' });
  });

  it('reasoning-delta 累积到 reasoning part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'reasoning', id: 'r1', text: '思' });
    store.consumeChunk({ type: 'reasoning-delta', id: 'r1', delta: '考' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({ type: 'reasoning', text: '思考' });
  });

  it('tool-input-start 创建 tool-<Name> part，状态 input-streaming', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({
      type: 'tool-input-start',
      toolCallId: 't1',
      toolName: 'Bash',
    });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      type: 'tool-Bash',
      toolCallId: 't1',
      state: 'input-streaming',
    });
  });

  it('tool-input-available 更新 input 并置状态 input-available', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({
      type: 'tool-input-available',
      toolCallId: 't1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'input-available',
      input: { command: 'ls' },
    });
  });

  it('tool-output-available 置状态 output-available 并附 output', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({ type: 'tool-output-available', toolCallId: 't1', output: { ok: true } });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'output-available',
      output: { ok: true },
    });
  });

  it('tool-output-error 置状态 output-error 并附 errorText', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({ type: 'tool-output-error', toolCallId: 't1', errorText: '失败' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'output-error',
      errorText: '失败',
    });
  });

  it('message-metadata 聚合到当前 assistant 消息 metadata', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({
      type: 'message-metadata',
      messageMetadata: { inputTokens: 10, outputTokens: 20 },
    });
    expect(store.getMessage('m1')?.metadata?.inputTokens).toBe(10);
  });

  it('finish-step 重置当前消息游标，下一个 start 开新消息', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'finish-step' });
    store.consumeChunk({ type: 'start', messageId: 'm2' });
    expect(store.getMessageIds()).toEqual(['m1', 'm2']);
  });

  it('未知 chunk 类型不抛错（静默忽略）', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    expect(() =>
      store.consumeChunk({
        type: 'session-init',
        tools: [],
        mcpServers: [],
        plugins: [],
        skills: [],
      }),
    ).not.toThrow();
  });

  it('loadMessages 批量载入历史消息', () => {
    const store = createAiMessageStore();
    store.loadMessages([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '问' }], createdAt: 1 },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '答' }], createdAt: 2 },
    ]);
    expect(store.getMessageIds()).toEqual(['u1', 'a1']);
  });

  it('text-delta 在无 text-start 时自动创建 text part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'text-delta', id: 't1', delta: '直接来了' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({ type: 'text', text: '直接来了' });
  });
});

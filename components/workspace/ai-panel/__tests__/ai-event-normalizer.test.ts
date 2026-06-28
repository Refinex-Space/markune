import { beforeEach, describe, expect, it } from 'vitest';

import { AiEventNormalizer } from '../ai-event-normalizer';
import type { AiRuntimeEvent } from '../ai-types';

describe('AiEventNormalizer', () => {
  let n: AiEventNormalizer;

  beforeEach(() => {
    n = new AiEventNormalizer();
  });

  it('sessionStarted → start chunk', () => {
    const event: AiRuntimeEvent = {
      type: 'sessionStarted',
      session: { sessionId: 's1', profileId: 'p1', rootPath: '/r', status: 'running' },
    };
    const chunks = n.normalize(event);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('start');
  });

  it('messageDelta → text-delta；首次自动前置 text-start', () => {
    const chunks1 = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'Hello',
    });
    expect(chunks1.map((c) => c.type)).toEqual(['text-start', 'text-delta']);
    if (chunks1[0].type === 'text-start' && chunks1[1].type === 'text-delta') {
      expect(chunks1[1].delta).toBe('Hello');
    }
  });

  it('messageDelta 连续两次共用同一个 text part id', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'A' });
    const chunks2 = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'B',
    });
    expect(chunks2).toHaveLength(1);
    expect(chunks2[0].type).toBe('text-delta');
  });

  it('messageCompleted（有前置 text）→ text-end + finish', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'hi' });
    const chunks = n.normalize({
      type: 'messageCompleted',
      sessionId: 's1',
      messageId: 'm1',
    });
    expect(chunks.map((c) => c.type)).toEqual(['text-end', 'finish']);
  });

  it('messageCompleted（无前置 text）→ 仅 finish', () => {
    // 纯工具/纯思考回复没有 text 流，messageCompleted 不应产出 text-end
    const chunks = n.normalize({
      type: 'messageCompleted',
      sessionId: 's1',
      messageId: 'm1',
    });
    expect(chunks.map((c) => c.type)).toEqual(['finish']);
  });

  it('thinkingDelta → reasoning-delta；首个 reasoning 事件产出 reasoning chunk（含首段文本）', () => {
    const chunks1 = n.normalize({
      type: 'thinkingDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: '思考',
    });
    // 首个 reasoning 事件：reasoning chunk 含首段文本，不再额外发 reasoning-delta
    expect(chunks1.map((c) => c.type)).toEqual(['reasoning']);
    if (chunks1[0].type === 'reasoning') {
      expect(chunks1[0].text).toBe('思考');
    }
    const chunks2 = n.normalize({
      type: 'thinkingDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: '继续',
    });
    expect(chunks2.map((c) => c.type)).toEqual(['reasoning-delta']);
  });

  it('toolStarted → tool-input-start（input 完整时紧跟 tool-input-available）', () => {
    const chunks = n.normalize({
      type: 'toolStarted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    expect(chunks.map((c) => c.type)).toEqual(['tool-input-start', 'tool-input-available']);
    if (chunks[0].type === 'tool-input-start') {
      expect(chunks[0].toolName).toBe('Bash');
    }
  });

  it('toolStarted input 为空时只产出 tool-input-start', () => {
    const chunks = n.normalize({
      type: 'toolStarted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Read',
      input: {},
    });
    expect(chunks.map((c) => c.type)).toEqual(['tool-input-start']);
  });

  it('toolInputDelta → tool-input-delta', () => {
    const chunks = n.normalize({
      type: 'toolInputDelta',
      sessionId: 's1',
      toolCallId: 't1',
      partialJson: '{"a":1',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-input-delta');
    if (chunks[0].type === 'tool-input-delta') {
      expect(chunks[0].inputTextDelta).toBe('{"a":1');
    }
  });

  it('toolCompleted success → tool-output-available', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: { stdout: 'ok' },
      status: 'success',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-output-available');
  });

  it('toolCompleted error → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: { stderr: 'boom' },
      status: 'error',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('toolCompleted denied → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: {},
      status: 'denied',
    });
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('permissionPrompt → permission-request', () => {
    const chunks = n.normalize({
      type: 'permissionPrompt',
      sessionId: 's1',
      requestId: 'r1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: { command: 'rm' },
      reason: '危险命令',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('permission-request');
  });

  it('permissionDenied → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'permissionDenied',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: {},
    });
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('usageUpdated → message-metadata', () => {
    const chunks = n.normalize({
      type: 'usageUpdated',
      sessionId: 's1',
      inputTokens: 10,
      outputTokens: 20,
      totalCostUsd: 0.01,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('message-metadata');
    if (chunks[0].type === 'message-metadata') {
      expect(chunks[0].messageMetadata.inputTokens).toBe(10);
      expect(chunks[0].messageMetadata.outputTokens).toBe(20);
    }
  });

  it('turnCompleted → finish-step', () => {
    const chunks = n.normalize({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('finish-step');
  });

  it('runState / sessionExited 不产出 chunk（仅内部状态）', () => {
    expect(n.normalize({ type: 'runState', sessionId: 's1', state: 'stopped' })).toEqual([]);
    expect(n.normalize({ type: 'sessionExited', sessionId: 's1' })).toEqual([]);
  });

  it('error → error chunk', () => {
    const chunks = n.normalize({ type: 'error', sessionId: 's1', message: 'boom' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
  });

  it('messageCompleted 后再次 messageDelta 会开启新 text part', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'A' });
    n.normalize({ type: 'messageCompleted', sessionId: 's1', messageId: 'm1' });
    const chunks = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm2',
      delta: 'B',
    });
    expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta']);
  });

  it('reset 清空内部状态后 messageDelta 重新前置 text-start', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'A' });
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'B' });
    n.reset();
    const chunks = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'C',
    });
    expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta']);
  });
});

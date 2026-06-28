import { describe, expect, it } from 'vitest';

import { getToolStatus } from '../ai-contracts';
import type { MessagePart } from '../ai-contracts';

describe('getToolStatus', () => {
  it('returns isPending when streaming and state is input-streaming', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    expect(getToolStatus(part, 'streaming')).toEqual({
      isPending: true,
      isError: false,
      isSuccess: false,
      isInterrupted: false,
    });
  });

  it('returns isSuccess when output-available and output.success !== false', () => {
    const part: MessagePart = {
      type: 'tool-Bash',
      state: 'output-available',
      output: { success: true },
    };
    expect(getToolStatus(part, 'streaming').isSuccess).toBe(true);
  });

  it('returns isError when output.success === false', () => {
    const part: MessagePart = {
      type: 'tool-Bash',
      state: 'output-available',
      output: { success: false },
    };
    expect(getToolStatus(part, 'streaming').isError).toBe(true);
  });

  it('returns isError when state is output-error', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'output-error' };
    expect(getToolStatus(part, 'streaming').isError).toBe(true);
  });

  it('returns isInterrupted when pending and chat stopped', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    expect(getToolStatus(part, 'ready').isInterrupted).toBe(true);
  });

  it('treats historical messages (chatStatus undefined) as not pending/interrupted', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    const status = getToolStatus(part, undefined);
    expect(status.isPending).toBe(false);
    expect(status.isInterrupted).toBe(false);
  });

  it('treats state "result" as a neutral completed state (not pending/error/success)', () => {
    // 1code getToolStatus 语义：result 既不在 basePending（已完成），
    // 也非 output-available（不算 success），是一个中性完成态。
    const part: MessagePart = { type: 'tool-Bash', state: 'result', output: {} };
    const status = getToolStatus(part, 'streaming');
    expect(status.isPending).toBe(false);
    expect(status.isError).toBe(false);
    expect(status.isSuccess).toBe(false);
    expect(status.isInterrupted).toBe(false);
  });
});

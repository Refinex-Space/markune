import { afterEach, expect, it, vi } from 'vitest';
import { CodexEventBuffer } from '../codex-event-buffer';
afterEach(() => vi.useRealTimers());
const delta = (itemId: string, text: string) => ({
  method: 'item/agentMessage/delta',
  markuneSessionId: 'epoch',
  params: { threadId: 't', turnId: 'turn', itemId, delta: text },
});
it('combines adjacent deltas and flushes them before terminal and interactive messages', () => {
  vi.useFakeTimers();
  const deliver = vi.fn();
  const buffer = new CodexEventBuffer(deliver);
  buffer.push(delta('a', '前'));
  buffer.push(delta('a', '后'));
  buffer.push(delta('b', '另一个'));
  buffer.push({
    method: 'item/completed',
    params: { item: { id: 'a', text: '权威' } },
  });
  expect(
    deliver.mock.calls.map(
      ([message]) => message.params?.delta ?? message.method,
    ),
  ).toEqual(['前后', '另一个', 'item/completed']);
  vi.runAllTimers();
  expect(deliver).toHaveBeenCalledTimes(3);
});
it('bounds visible latency and never merges different sessions', () => {
  vi.useFakeTimers();
  const deliver = vi.fn();
  const buffer = new CodexEventBuffer(deliver);
  buffer.push(delta('a', 'one'));
  buffer.push({ ...delta('a', 'two'), markuneSessionId: 'other' });
  vi.advanceTimersByTime(16);
  expect(deliver).toHaveBeenCalledTimes(2);
});

import { expect, it } from 'vitest';
import {
  isEphemeralCodexProtocolMessage,
  shouldRouteCodexMessageToVisibleThread,
} from '../codex-thread-routing';
it('routes only the current task while retaining global runtime events', () => {
  const event = {
    method: 'item/agentMessage/delta',
    params: { threadId: 'A' },
  };
  expect(shouldRouteCodexMessageToVisibleThread(event, 'A')).toBe(true);
  expect(shouldRouteCodexMessageToVisibleThread(event, 'B')).toBe(false);
  expect(shouldRouteCodexMessageToVisibleThread(event, null)).toBe(false);
  expect(
    shouldRouteCodexMessageToVisibleThread(
      { method: 'markune/runtime/exited' },
      null,
    ),
  ).toBe(true);
});
it('keeps ephemeral tasks out of the normal conversation projection', () => {
  expect(
    isEphemeralCodexProtocolMessage({
      method: 'thread/started',
      params: { thread: { id: 'temporary', ephemeral: true } },
    }),
  ).toBe(true);
  expect(
    shouldRouteCodexMessageToVisibleThread(
      { method: 'turn/started', params: { threadId: 'temporary' } },
      'temporary',
    ),
  ).toBe(false);
  isEphemeralCodexProtocolMessage({ method: 'markune/runtime/exited' });
});

import { expect, it } from 'vitest';
import { CodexTaskStore } from '../codex-task-store';
import { shouldRouteCodexMessageToVisibleThread } from '../codex-thread-routing';
const delta = (threadId: string, text: string) => ({
  method: 'item/agentMessage/delta',
  params: {
    threadId,
    turnId: `${threadId}-turn`,
    itemId: `${threadId}-message`,
    delta: text,
  },
});
it('separates background streams from a blank new task and from another task', () => {
  const store = new CodexTaskStore();
  store.reset('/vault');
  store.accept(delta('A', '任务 A'), null);
  store.accept(delta('B', '任务 B'), 'B');
  expect(shouldRouteCodexMessageToVisibleThread(delta('A', 'late'), null)).toBe(
    false,
  );
  expect(store.get('A')?.entries).not.toEqual(store.get('B')?.entries);
  expect(store.getSnapshot().find((task) => task.id === 'A')?.unread).toBe(
    true,
  );
  store.read('A');
  expect(store.getSnapshot().find((task) => task.id === 'A')?.unread).toBe(
    false,
  );
  store.reset('/other');
  expect(store.getSnapshot()).toEqual([]);
});
it('preserves live items when hydrating history and clears ended task state', () => {
  const store = new CodexTaskStore();
  store.reset('/vault');
  store.accept(
    {
      method: 'turn/started',
      params: {
        threadId: 'A',
        turn: { id: 'turn', status: 'inProgress', items: [] },
      },
    },
    'B',
  );
  store.accept(delta('A', 'live'), 'B');
  expect(store.getSnapshot()[0].active).toBe(true);
  store.accept(
    {
      method: 'turn/completed',
      params: {
        threadId: 'A',
        turn: { id: 'turn', status: 'completed', items: [] },
      },
    },
    'B',
  );
  expect(store.getSnapshot()[0].active).toBe(false);
});
it('keeps a background approval and its epoch across other task updates', () => {
  const store = new CodexTaskStore();
  store.reset('/vault');
  store.accept(
    {
      id: 7,
      method: 'item/fileChange/requestApproval',
      markuneSessionId: 'epoch-1',
      params: { threadId: 'A', turnId: 'a', itemId: 'change' },
    },
    'B',
  );
  store.accept(delta('B', 'other'), 'B');
  expect(store.get('A')?.approvals[0]).toMatchObject({
    id: 7,
    sessionId: 'epoch-1',
  });
  expect(store.getSnapshot().find((task) => task.id === 'A')?.attention).toBe(
    1,
  );
  store.accept(
    { method: 'markune/runtime/exited', markuneSessionId: 'epoch-1' },
    'B',
  );
  expect(store.get('A')?.approvals).toEqual([]);
});

import { afterEach, expect, it, vi } from 'vitest';
import { CodexRuntimeSupervisor } from '../codex-runtime-supervisor';
const info = (id: string) => ({
  available: true,
  running: true,
  sessionId: id,
  binarySource: 'bundled',
  version: '0.144.4',
  storageMode: 'sharedCodexHome' as const,
  storageRoot: null,
  message: null,
});
afterEach(() => vi.useRealTimers());
it('shares startup, rejects stale generations and retries connections without any turn replay', async () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const session = vi.fn();
  const start = vi
    .fn()
    .mockResolvedValueOnce(info('one'))
    .mockResolvedValueOnce(info('two'));
  const supervisor = new CodexRuntimeSupervisor({
    connect: vi.fn(async () => {}),
    start,
    stop: vi.fn(async () => {}),
    emit,
    session,
  });
  await Promise.all([supervisor.start('/vault'), supervisor.start('/vault')]);
  expect(start).toHaveBeenCalledTimes(1);
  supervisor.receive({
    method: 'markune/runtime/exited',
    markuneSessionId: 'old',
  });
  expect(supervisor.getSnapshot().phase).toBe('ready');
  supervisor.receive({
    method: 'markune/runtime/exited',
    markuneSessionId: 'one',
  });
  expect(supervisor.getSnapshot().phase).toBe('reconnecting');
  const ready = supervisor.waitReady();
  await vi.advanceTimersByTimeAsync(500);
  await expect(ready).resolves.toMatchObject({ sessionId: 'two' });
  expect(start).toHaveBeenCalledTimes(2);
  expect(
    emit.mock.calls.every(([message]) => !message.method.startsWith('turn/')),
  ).toBe(true);
  await supervisor.stop();
  expect(supervisor.getSnapshot().phase).toBe('idle');
});
it('stops repeated reconnect failures at a bounded retry limit', async () => {
  vi.useFakeTimers();
  const start = vi
    .fn()
    .mockResolvedValueOnce(info('one'))
    .mockRejectedValue(new Error('failed'));
  const supervisor = new CodexRuntimeSupervisor({
    connect: async () => {},
    start,
    stop: async () => {},
    emit: vi.fn(),
    session: vi.fn(),
  });
  await supervisor.start('/vault');
  supervisor.receive({
    method: 'markune/runtime/exited',
    markuneSessionId: 'one',
  });
  await vi.advanceTimersByTimeAsync(8000);
  expect(supervisor.getSnapshot().phase).toBe('failed');
  expect(start).toHaveBeenCalledTimes(4);
  await supervisor.stop();
});
it('retains initialization interactions until the native epoch is adopted', async () => {
  let resolve!: (value: ReturnType<typeof info>) => void;
  const emit = vi.fn();
  const supervisor = new CodexRuntimeSupervisor({
    connect: async () => {},
    start: () =>
      new Promise((done) => {
        resolve = done;
      }),
    stop: async () => {},
    session: vi.fn(),
    emit,
  });
  const ready = supervisor.start('/vault');
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  supervisor.receive({
    method: 'mcpServer/elicitation/request',
    id: 1,
    markuneSessionId: 'new',
    params: { threadId: 't' },
  });
  expect(emit).not.toHaveBeenCalled();
  resolve(info('new'));
  await ready;
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  await supervisor.stop();
});

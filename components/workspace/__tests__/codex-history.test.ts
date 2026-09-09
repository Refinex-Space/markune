import { expect, it, vi } from 'vitest';
import {
  readCodexHistory,
  mergeCodexTurns,
  readCodexTurnPage,
} from '../codex-history';
import type { CodexThread, CodexTurn } from '../codex-app-server';
it('loads authoritative paginated items with stable chronological ordering', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ thread: { id: 't', historyMode: 'paginated' } })
    .mockResolvedValueOnce({
      data: [
        { id: 'new', items: [{ id: 'answer' }] },
        { id: 'old', items: [] },
      ],
      nextCursor: 'next',
    });
  const page = await readCodexHistory({ request }, 't');
  expect(page.thread.turns.map((turn) => turn.id)).toEqual(['old', 'new']);
  expect(page.nextCursor).toBe('next');
  expect(request).toHaveBeenLastCalledWith(
    'thread/turns/list',
    expect.objectContaining({
      itemsView: 'full',
      limit: 30,
      sortDirection: 'desc',
    }),
  );
});
it('keeps older legacy turns available instead of silently truncating them', async () => {
  const thread = {
    id: 't',
    turns: Array.from({ length: 70 }, (_, i) => ({ id: String(i), items: [] })),
  } as CodexThread;
  const request = vi.fn().mockResolvedValue({ thread });
  const page = await readCodexHistory({ request }, 't');
  expect(page.thread.turns).toHaveLength(30);
  expect(page.legacyRemaining).toHaveLength(40);
});
it('rejects an unsupported page and does not claim an empty history', async () => {
  await expect(
    readCodexTurnPage(
      { request: vi.fn().mockRejectedValue(new Error('unsupported')) },
      't',
    ),
  ).rejects.toThrow('unsupported');
});
it('deduplicates overlapping pages without losing the newest item snapshot', () => {
  expect(
    mergeCodexTurns(
      [
        { id: 'a', items: [] },
        { id: 'b', items: [] },
      ] as unknown as CodexTurn[],
      [{ id: 'b', items: [{ id: 'final' }] }] as unknown as CodexTurn[],
    ),
  ).toMatchObject([{ id: 'a' }, { id: 'b', items: [{ id: 'final' }] }]);
});

import { expect, it, vi } from 'vitest';
import { submitCodexTurn } from '../codex-turn-submission';
it('uses explicit steering without overwriting model settings or inventing a new turn', async () => {
  const request = vi.fn().mockResolvedValue({ turnId: 'active' });
  const result = await submitCodexTurn(
    { request },
    {
      threadId: 'thread',
      input: [{ type: 'text', text: '继续' }],
      model: 'other',
      cwd: '/vault',
      summary: 'concise',
      markuneDocumentReferences: [],
    },
    'active',
  );
  expect(request).toHaveBeenCalledWith('turn/steer', {
    threadId: 'thread',
    input: [{ type: 'text', text: '继续' }],
    markuneDocumentReferences: [],
    expectedTurnId: 'active',
  });
  expect(result.turn.id).toBe('active');
  request.mockResolvedValue({ turnId: 'different' });
  await expect(submitCodexTurn({ request }, {}, 'active')).rejects.toThrow(
    '已改变',
  );
});
it('starts a new turn only when idle', async () => {
  const request = vi.fn().mockResolvedValue({ turn: { id: 'new' } });
  await submitCodexTurn({ request }, { threadId: 't', input: [] }, null);
  expect(request).toHaveBeenCalledWith('turn/start', {
    threadId: 't',
    input: [],
  });
});

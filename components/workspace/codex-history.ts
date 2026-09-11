import type { CodexThread, CodexTurn } from './codex-app-server';
interface Client {
  request<T>(method: string, params: Record<string, unknown>): Promise<T>;
}
export interface ThreadHistoryPage {
  thread: CodexThread;
  nextCursor: string | null;
  legacyRemaining: CodexTurn[];
}
export async function readCodexHistory(
  client: Client,
  threadId: string,
): Promise<ThreadHistoryPage> {
  const { thread } = await client.request<{ thread: CodexThread }>(
    'thread/read',
    { threadId, includeTurns: false },
  );
  if (thread.historyMode === 'paginated') {
    const page = await readCodexTurnPage(client, threadId);
    return {
      thread: { ...thread, turns: page.turns },
      nextCursor: page.nextCursor,
      legacyRemaining: [],
    };
  }
  const response = await client.request<{ thread: CodexThread }>(
    'thread/read',
    { threadId, includeTurns: true },
  );
  return {
    thread: { ...response.thread, turns: response.thread.turns.slice(-30) },
    nextCursor: null,
    legacyRemaining: response.thread.turns.slice(0, -30),
  };
}
export async function readCodexTurnPage(
  client: Client,
  threadId: string,
  cursor?: string,
) {
  const response = await client.request<{
    data: CodexTurn[];
    nextCursor?: string | null;
  }>('thread/turns/list', {
    threadId,
    limit: 30,
    itemsView: 'full',
    sortDirection: 'desc',
    ...(cursor ? { cursor } : {}),
  });
  return {
    turns: [...response.data].reverse(),
    nextCursor: response.nextCursor ?? null,
  };
}
export function mergeCodexTurns(older: CodexTurn[], newer: CodexTurn[]) {
  const merged = new Map(older.map((turn) => [turn.id, turn]));
  for (const turn of newer) merged.set(turn.id, turn);
  return [...merged.values()];
}

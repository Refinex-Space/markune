import type { CodexAppServerClient } from './codex-app-server';
/** Active-turn input uses an explicit precondition, never a new submission ID. author: refinex */
export async function submitCodexTurn(
  client: Pick<CodexAppServerClient, 'request'>,
  params: Record<string, unknown>,
  activeTurnId: string | null,
) {
  if (!activeTurnId)
    return client.request<{ turn: { id: string } }>('turn/start', params);
  const allowed = [
    'threadId',
    'clientUserMessageId',
    'input',
    'markuneFileAttachments',
    'markuneDocumentReferences',
    'markuneDrawingReferences',
  ];
  const input = Object.fromEntries(
    allowed
      .filter((key) => params[key] !== undefined)
      .map((key) => [key, params[key]]),
  );
  const result = await client.request<{ turnId: string }>('turn/steer', {
    ...input,
    expectedTurnId: activeTurnId,
  });
  if (result.turnId !== activeTurnId)
    throw new Error('执行中的任务已改变，请核对后重试');
  return { turn: { id: result.turnId } };
}

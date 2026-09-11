import {
  codexProtocolThreadId,
  type CodexProtocolMessage,
} from './codex-app-server';

const ephemeralThreads = new Set<string>();
export function isEphemeralCodexProtocolMessage(message: CodexProtocolMessage) {
  if (message.method === 'markune/runtime/exited') ephemeralThreads.clear();
  const thread = message.params?.thread as
    | { id?: unknown; ephemeral?: unknown }
    | undefined;
  if (thread?.ephemeral === true && typeof thread.id === 'string') {
    ephemeralThreads.add(thread.id);
    if (ephemeralThreads.size > 256)
      ephemeralThreads.delete(ephemeralThreads.values().next().value!);
  }
  const id = codexProtocolThreadId(message);
  return thread?.ephemeral === true || Boolean(id && ephemeralThreads.has(id));
}
export function shouldRouteCodexMessageToVisibleThread(
  message: CodexProtocolMessage,
  visibleThreadId: string | null,
) {
  if (isEphemeralCodexProtocolMessage(message)) return false;
  const id = codexProtocolThreadId(message);
  return !id || id === visibleThreadId;
}

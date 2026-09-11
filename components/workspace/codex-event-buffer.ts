import type { CodexProtocolMessage } from './codex-app-server';
const DELTAS = new Set([
  'item/agentMessage/delta',
  'item/commandExecution/outputDelta',
  'item/plan/delta',
]);
/** Batch only adjacent deltas; responses, approvals and final snapshots remain ordered. author: refinex */
export class CodexEventBuffer {
  private queue: CodexProtocolMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private characters = 0;
  constructor(
    private readonly deliver: (message: CodexProtocolMessage) => void,
    private readonly delayMs = 16,
  ) {}
  push(message: CodexProtocolMessage) {
    if (
      !message.method ||
      !DELTAS.has(message.method) ||
      typeof message.params?.delta !== 'string'
    ) {
      this.flush();
      this.deliver(message);
      return;
    }
    const previous = this.queue.at(-1);
    const same =
      previous &&
      previous.method === message.method &&
      previous.markuneSessionId === message.markuneSessionId &&
      ['threadId', 'turnId', 'itemId'].every(
        (key) => previous.params?.[key] === message.params?.[key],
      );
    if (same)
      previous.params = {
        ...previous.params,
        delta: String(previous.params?.delta ?? '') + message.params.delta,
      };
    else this.queue.push({ ...message, params: { ...message.params } });
    this.characters += message.params.delta.length;
    if (this.characters >= 1024 * 1024 || this.queue.length >= 256)
      this.flush();
    else this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const messages = this.queue;
    this.queue = [];
    this.characters = 0;
    for (const message of messages) this.deliver(message);
  }
}

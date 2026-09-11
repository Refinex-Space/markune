import {
  createEmptyConversation,
  reduceCodexProtocolMessage,
  type AiConversationState,
} from './ai-panel-state';
import {
  codexProtocolThreadId,
  type CodexProtocolMessage,
  type CodexThread,
} from './codex-app-server';
import { isEphemeralCodexProtocolMessage } from './codex-thread-routing';

export interface CodexTaskSummary {
  id: string;
  title: string;
  active: boolean;
  attention: number;
  unread: boolean;
}
interface Task {
  state: AiConversationState;
  thread?: CodexThread;
  unread: boolean;
}
/** Transient UI projection; Codex remains the owner of durable conversation history. author: refinex */
export class CodexTaskStore {
  private root = '';
  private selected: string | null = null;
  private tasks = new Map<string, Task>();
  private listeners = new Set<() => void>();
  private snapshot: CodexTaskSummary[] = [];
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  reset(root: string) {
    if (root === this.root) return;
    this.root = root;
    this.selected = null;
    this.tasks.clear();
    this.publish();
  }
  get(id: string) {
    return this.tasks.get(id)?.state;
  }
  thread(id: string): CodexThread | undefined {
    const task = this.tasks.get(id);
    return task
      ? (task.thread ?? {
          id,
          name: null,
          preview: '',
          createdAt: 0,
          updatedAt: 0,
          cwd: this.root,
          status: null,
          turns: [],
        })
      : undefined;
  }
  select(id: string | null) {
    this.selected = id;
  }
  remember(thread: CodexThread) {
    const task = this.tasks.get(thread.id) ?? {
      state: createEmptyConversation(),
      unread: false,
    };
    task.thread = thread;
    this.tasks.set(thread.id, task);
    this.publish();
  }
  set(id: string, state: AiConversationState, unread = false) {
    const task = this.tasks.get(id);
    this.tasks.set(id, {
      ...task,
      state,
      unread: unread || task?.unread || false,
    });
    this.publish();
  }
  read(id: string) {
    this.selected = id;
    const task = this.tasks.get(id);
    if (task) {
      task.unread = false;
      this.publish();
    }
  }
  remove(id: string) {
    this.tasks.delete(id);
    this.publish();
  }
  accept(message: CodexProtocolMessage, visibleId: string | null) {
    if (isEphemeralCodexProtocolMessage(message)) return;
    const id = codexProtocolThreadId(message);
    if (!id) {
      if (message.method === 'markune/runtime/exited')
        for (const [key, task] of this.tasks)
          this.set(
            key,
            reduceCodexProtocolMessage(task.state, message, this.root),
            key !== visibleId,
          );
      return;
    }
    if (
      message.method === 'thread/deleted' ||
      message.method === 'thread/archived'
    ) {
      this.remove(id);
      return;
    }
    const current = this.tasks.get(id)?.state ?? createEmptyConversation();
    this.set(
      id,
      reduceCodexProtocolMessage(current, message, this.root),
      id !== visibleId,
    );
  }
  mergeHistory(id: string, history: AiConversationState) {
    const live = this.tasks.get(id)?.state;
    if (!live) return history;
    const entries = new Map(history.entries.map((entry) => [entry.id, entry]));
    const turns = { ...history.turns, ...live.turns };
    for (const [turnId, turn] of Object.entries(history.turns))
      if (turn.status !== 'inProgress') turns[turnId] = turn;
    for (const entry of live.entries) {
      const completed =
        entry.turnId &&
        history.turns[entry.turnId]?.status &&
        history.turns[entry.turnId].status !== 'inProgress';
      if (!completed || !entries.has(entry.id)) entries.set(entry.id, entry);
    }
    const activeTurnId =
      live.activeTurnId && turns[live.activeTurnId]?.status !== 'inProgress'
        ? null
        : live.activeTurnId;
    return {
      ...history,
      ...live,
      activeTurnId,
      entries: [...entries.values()],
      turns,
    };
  }
  private publish() {
    // Keep running/interactive tasks; idle projections can be restored from native history. author: refinex
    if (this.tasks.size > 32)
      for (const [id, task] of this.tasks) {
        if (this.tasks.size <= 32) break;
        if (
          id !== this.selected &&
          !task.state.activeTurnId &&
          !task.state.approvals.length &&
          !task.state.userInputRequests.length &&
          !task.unread
        )
          this.tasks.delete(id);
      }
    const next = [...this.tasks].map(([id, task]) => ({
      id,
      title:
        task.thread?.name || task.thread?.preview.slice(0, 40) || '后台任务',
      active: Boolean(task.state.activeTurnId),
      attention:
        task.state.approvals.length + task.state.userInputRequests.length,
      unread: task.unread,
    }));
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

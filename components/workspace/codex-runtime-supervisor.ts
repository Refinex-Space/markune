import { recordCodexDiagnostic } from './codex-diagnostics';
import type {
  CodexProtocolMessage,
  CodexRuntimeInfo,
} from './codex-app-server';
export interface CodexRuntimeSnapshot {
  phase: 'idle' | 'starting' | 'ready' | 'reconnecting' | 'failed' | 'stopping';
  root: string | null;
  info: CodexRuntimeInfo | null;
  attempt: number;
  error: string | null;
}
interface Dependencies {
  connect(): Promise<unknown>;
  start(root: string): Promise<CodexRuntimeInfo>;
  stop(): Promise<void>;
  session(id: string | null): void;
  emit(message: CodexProtocolMessage): void;
}

/** Supervise the connection, never replay model turns or tool writes. author: refinex */
export class CodexRuntimeSupervisor {
  private state: CodexRuntimeSnapshot = {
    phase: 'idle',
    root: null,
    info: null,
    attempt: 0,
    error: null,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private serial: Promise<unknown> = Promise.resolve();
  private earlyMessages: CodexProtocolMessage[] = [];
  private earlyOverflow = false;
  private pending: Promise<CodexRuntimeInfo> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly deps: Dependencies) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  private set(patch: Partial<CodexRuntimeSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  start(root: string): Promise<CodexRuntimeInfo> {
    if (
      this.state.root === root &&
      this.state.phase === 'ready' &&
      this.state.info
    )
      return Promise.resolve(this.state.info);
    if (this.state.root === root && this.pending) return this.pending;
    const generation = ++this.generation;
    this.clearTimers();
    this.earlyMessages = [];
    this.earlyOverflow = false;
    this.deps.session(null);
    this.set({ root, phase: 'starting', attempt: 0, error: null, info: null });
    return this.launch(root, generation);
  }
  private launch(root: string, generation: number): Promise<CodexRuntimeInfo> {
    this.earlyOverflow = false;
    const operation = this.serial
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation) throw new Error('工作区已改变');
        await this.deps.connect();
        if (generation !== this.generation) throw new Error('工作区已改变');
        const info = await this.deps.start(root);
        if (generation !== this.generation) throw new Error('工作区已改变');
        if (this.earlyOverflow) {
          this.earlyMessages = [];
          await this.deps.stop();
          throw new Error('启动通知过多，请检查连接器配置后重试');
        }
        this.deps.session(info.sessionId ?? null);
        this.set({ phase: 'ready', info, error: null });
        this.deps.emit({
          method: 'markune/runtime/ready',
          params: { root, version: info.version },
        });
        const early = this.earlyMessages;
        this.earlyMessages = [];
        for (const message of early) this.receive(message);
        this.stableTimer = setTimeout(() => {
          if (generation === this.generation) this.set({ attempt: 0 });
        }, 30_000);
        return info;
      });
    this.serial = operation;
    this.pending = operation;
    void operation.then(
      () => {
        if (this.pending === operation) this.pending = null;
      },
      (error) => {
        if (this.pending === operation) this.pending = null;
        if (generation === this.generation && this.state.phase === 'starting')
          this.set({ phase: 'failed', error: String(error) });
      },
    );
    return operation;
  }
  receive(message: CodexProtocolMessage) {
    if (
      (this.state.phase === 'starting' ||
        this.state.phase === 'reconnecting') &&
      message.markuneSessionId &&
      message.markuneSessionId !== this.state.info?.sessionId
    ) {
      if (this.earlyMessages.length >= 256) {
        this.earlyOverflow = true;
        recordCodexDiagnostic('startup-overflow');
      } else this.earlyMessages.push(message);
      return;
    }
    if (
      message.markuneSessionId &&
      message.markuneSessionId !== this.state.info?.sessionId
    )
      return;
    if (
      message.markuneSessionId &&
      ['reconnecting', 'stopping'].includes(this.state.phase)
    )
      return;
    this.deps.emit(message);
    if (
      message.method !== 'markune/runtime/exited' ||
      !this.state.root ||
      this.state.phase !== 'ready'
    )
      return;
    this.deps.session(null);
    this.recover(this.generation);
  }
  private recover(generation: number) {
    if (generation !== this.generation || !this.state.root) return;
    this.clearTimers();
    const attempt = this.state.attempt + 1;
    if (attempt > 3) {
      this.set({
        phase: 'failed',
        error: '运行时连续退出，请检查配置后重新连接',
      });
      this.deps.emit({ method: 'markune/runtime/recoveryFailed', params: {} });
      return;
    }
    const root = this.state.root;
    this.set({
      phase: 'reconnecting',
      attempt,
      error: '连接中断，正在重新连接；不会自动重发消息',
    });
    this.deps.emit({
      method: 'markune/runtime/reconnecting',
      params: { attempt },
    });
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = undefined;
        void this.launch(root, generation).catch(() =>
          this.recover(generation),
        );
      },
      [500, 1500, 4000][attempt - 1],
    );
  }
  async stop() {
    const generation = ++this.generation;
    this.clearTimers();
    this.deps.session(null);
    this.set({ phase: 'stopping', root: null });
    this.earlyMessages = [];
    this.earlyOverflow = false;
    this.deps.emit({
      method: 'markune/runtime/exited',
      params: { reason: 'stopped' },
    });
    const operation = this.serial.catch(() => {}).then(() => this.deps.stop());
    this.serial = operation;
    try {
      await operation;
    } finally {
      if (generation === this.generation) {
        this.pending = null;
        this.set({ phase: 'idle', info: null, attempt: 0, error: null });
      }
    }
  }
  waitReady(timeoutMs = 60_000): Promise<CodexRuntimeInfo> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('重新连接超时，请手动重试'));
      }, timeoutMs);
      const check = () => {
        if (this.state.phase === 'ready' && this.state.info) {
          clearTimeout(timer);
          unsubscribe();
          resolve(this.state.info);
        } else if (['failed', 'idle', 'stopping'].includes(this.state.phase)) {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error(this.state.error ?? '运行时已停止'));
        }
      };
      unsubscribe = this.subscribe(check);
      check();
    });
  }
  private clearTimers() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.stableTimer);
    this.retryTimer = undefined;
    this.stableTimer = undefined;
  }
}

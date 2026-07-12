const DEFAULT_TERMINAL_BUFFER_LIMIT = 1_000_000;

export interface TerminalOutputStore {
  append: (sessionId: string, data: string) => void;
  clear: (sessionId: string) => void;
  subscribe: (sessionId: string, listener: () => void) => () => void;
  take: (sessionId: string) => string;
}

export function createTerminalOutputStore(
  maxBufferedCharacters = DEFAULT_TERMINAL_BUFFER_LIMIT,
): TerminalOutputStore {
  const buffers = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();

  return {
    append(sessionId, data) {
      if (!data) {
        return;
      }

      const current = buffers.get(sessionId) ?? '';
      const next = `${current}${data}`;
      buffers.set(
        sessionId,
        next.length > maxBufferedCharacters
          ? next.slice(-maxBufferedCharacters)
          : next,
      );
      listeners.get(sessionId)?.forEach((listener) => listener());
    },
    clear(sessionId) {
      buffers.delete(sessionId);
      listeners.delete(sessionId);
    },
    subscribe(sessionId, listener) {
      const sessionListeners = listeners.get(sessionId) ?? new Set();
      sessionListeners.add(listener);
      listeners.set(sessionId, sessionListeners);

      return () => {
        sessionListeners.delete(listener);
        if (sessionListeners.size === 0) {
          listeners.delete(sessionId);
        }
      };
    },
    take(sessionId) {
      const output = buffers.get(sessionId) ?? '';
      buffers.delete(sessionId);
      return output;
    },
  };
}

import { describe, expect, it, vi } from 'vitest';

import { createTerminalOutputStore } from '../terminal-output-store';

describe('terminal output store', () => {
  it('only notifies the terminal session that received output', () => {
    const store = createTerminalOutputStore();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    store.subscribe('first', firstListener);
    store.subscribe('second', secondListener);

    store.append('first', 'hello');

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();
    expect(store.take('first')).toBe('hello');
    expect(store.take('first')).toBe('');
  });

  it('keeps only the newest buffered output when a terminal is not mounted', () => {
    const store = createTerminalOutputStore(5);

    store.append('first', 'hello');
    store.append('first', ' world');

    expect(store.take('first')).toBe('world');
  });
});

import { describe, expect, it } from 'vitest';

import {
  isClosedTerminalSessionError,
  retainTerminalTabs,
  shouldAutoCreateTerminal,
  splitTerminalInput,
} from '../terminal-session';

describe('terminal session helpers', () => {
  it('drops tabs from another workspace and keeps the current root', () => {
    const tabs = [
      { cwd: '/repo', id: 'current' },
      { cwd: '/other', id: 'stale' },
    ];

    expect(retainTerminalTabs(tabs, '/repo')).toEqual({
      kept: [{ cwd: '/repo', id: 'current' }],
      stale: [{ cwd: '/other', id: 'stale' }],
    });
    expect(retainTerminalTabs(tabs, null)).toEqual({
      kept: [],
      stale: tabs,
    });
  });

  it('auto-creates a terminal only when the open panel has no user-closed tab', () => {
    const ready = {
      isTauriRuntime: true,
      rootPath: '/repo',
      tabCount: 0,
      terminalOpen: true,
      userClosedLastTab: false,
    };

    expect(shouldAutoCreateTerminal(ready)).toBe(true);
    expect(
      shouldAutoCreateTerminal({ ...ready, userClosedLastTab: true }),
    ).toBe(false);
    expect(shouldAutoCreateTerminal({ ...ready, terminalOpen: false })).toBe(
      false,
    );
    expect(shouldAutoCreateTerminal({ ...ready, tabCount: 1 })).toBe(false);
  });

  it('splits terminal input on UTF-8 byte boundaries without breaking characters', () => {
    expect(splitTerminalInput('')).toEqual([]);
    expect(splitTerminalInput('pwd\r')).toEqual(['pwd\r']);

    const text = '中'.repeat(50);
    const chunks = splitTerminalInput(text, 20);

    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => !chunk.endsWith('\uD842'))).toBe(true);
    expect(
      chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 20),
    ).toBe(true);
    expect(splitTerminalInput('😀😀', 4)).toEqual(['😀', '😀']);
  });

  it('recognizes a closed terminal session error', () => {
    expect(isClosedTerminalSessionError('终端会话不存在')).toBe(true);
    expect(isClosedTerminalSessionError('写入终端失败')).toBe(false);
  });
});

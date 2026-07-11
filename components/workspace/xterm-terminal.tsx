'use client';

import * as React from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { TerminalOutputStore } from './terminal-output-store';

interface XtermTerminalProps {
  isActive: boolean;
  output?: string;
  outputStore?: TerminalOutputStore;
  sessionId: string;
  themeMode: 'dark' | 'light';
  onData: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
}

export function XtermTerminal({
  isActive,
  output = '',
  outputStore,
  sessionId,
  themeMode,
  onData,
  onResize,
}: XtermTerminalProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<Terminal | null>(null);
  const fitAddonRef = React.useRef<FitAddon | null>(null);
  const initialThemeModeRef = React.useRef(themeMode);
  const lastOutputRef = React.useRef('');

  React.useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 1,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      screenReaderMode: false,
      scrollback: 5000,
      theme: getTerminalTheme(initialThemeModeRef.current),
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);
    fitAddon.fit();
    onResize(sessionId, terminal.cols, terminal.rows);
    terminal.onData((data) => onData(sessionId, data));

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onResize, sessionId]);

  React.useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.options.theme = getTerminalTheme(themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal || !output) {
      return;
    }

    const previous = lastOutputRef.current;
    const nextChunk = output.startsWith(previous)
      ? output.slice(previous.length)
      : output;

    if (nextChunk) {
      terminal.write(nextChunk);
    }

    lastOutputRef.current = output;
  }, [output]);

  React.useEffect(() => {
    if (!outputStore) {
      return;
    }

    const flushOutput = () => {
      const terminal = terminalRef.current;
      const nextChunk = outputStore.take(sessionId);

      if (terminal && nextChunk) {
        terminal.write(nextChunk);
      }
    };

    flushOutput();
    return outputStore.subscribe(sessionId, flushOutput);
  }, [outputStore, sessionId]);

  React.useEffect(() => {
    if (!isActive || !containerRef.current) {
      return;
    }

    const fitTerminal = () => {
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;

      if (!terminal || !fitAddon) {
        return;
      }

      fitAddon.fit();
      onResize(sessionId, terminal.cols, terminal.rows);
    };

    fitTerminal();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(fitTerminal);

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [isActive, onResize, sessionId]);

  return (
    <div
      className="terminal-surface h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden bg-background px-3 py-2"
      data-testid={`xterm-terminal-${sessionId}`}
      ref={containerRef}
    />
  );
}

function getTerminalTheme(themeMode: 'dark' | 'light') {
  if (themeMode === 'dark') {
    return {
      background: '#0a0a0a',
      black: '#111111',
      blue: '#7aa2f7',
      brightBlack: '#4b5563',
      brightBlue: '#9db8ff',
      brightCyan: '#9be7ff',
      brightGreen: '#9be7a8',
      brightMagenta: '#d3b7ff',
      brightRed: '#ff8f8f',
      brightWhite: '#ffffff',
      brightYellow: '#ffe89a',
      cursor: '#ededed',
      cyan: '#7dcfff',
      foreground: '#ededed',
      green: '#7bd88f',
      magenta: '#bb9af7',
      red: '#ff6b6b',
      selectionBackground: '#2f4268',
      white: '#d7d7d7',
      yellow: '#f7d774',
    };
  }

  return {
    background: '#ffffff',
    black: '#171717',
    blue: '#1f63d8',
    brightBlack: '#6b7280',
    brightBlue: '#3b82f6',
    brightCyan: '#0891b2',
    brightGreen: '#16a34a',
    brightMagenta: '#9333ea',
    brightRed: '#dc2626',
    brightWhite: '#ffffff',
    brightYellow: '#ca8a04',
    cursor: '#171717',
    cyan: '#0d7282',
    foreground: '#171717',
    green: '#237a3b',
    magenta: '#7c3fb8',
    red: '#d12f2f',
    selectionBackground: '#cfe1ff',
    white: '#f8f8f8',
    yellow: '#8a6500',
  };
}

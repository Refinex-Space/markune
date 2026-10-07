'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentRuntime } from './agent-runtime';
import { agentError } from './agent-api';
import { createTerminalOutputStore } from './terminal-output-store';
import {
  listenTerminalData,
  listenTerminalExit,
  terminalKill,
  terminalResize,
  terminalWrite,
} from './workspace-api';
const Terminal = dynamic(
  () => import('./xterm-terminal').then((module) => module.XtermTerminal),
  { ssr: false },
);

export function AgentLogin({
  runtime,
  methodId,
  onClose,
}: {
  runtime: AgentRuntime;
  methodId: string;
  onClose: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const [session, setSession] = React.useState<string | null>(null);
  const [exitCode, setExitCode] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const [store] = React.useState(createTerminalOutputStore);
  React.useEffect(() => {
    let disposed = false,
      id: string | null = null;
    const stops: (() => void)[] = [],
      early: { sessionId: string; data?: string; code?: number | null }[] = [];
    void (async () => {
      stops.push(
        await listenTerminalData((event) => {
          if (id === event.sessionId) store.append(id, event.data);
          else if (!id && early.length < 100) early.push(event);
        }),
      );
      stops.push(
        await listenTerminalExit((event) => {
          if (id === event.sessionId) setExitCode(event.code);
          else if (!id && early.length < 100) early.push(event);
        }),
      );
      if (disposed) return;
      const result = await runtime.terminalAuth(methodId);
      id = result.id;
      if (disposed) {
        await terminalKill(id);
        return;
      }
      setSession(id);
      for (const event of early)
        if (event.sessionId === id) {
          if (event.data) store.append(id, event.data);
          if (typeof event.code === 'number') setExitCode(event.code);
        }
    })()
      .catch((error) => {
        if (!disposed) setError(agentError(error));
      })
      .finally(() => {
        if (disposed) stops.forEach((stop) => stop());
      });
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
      if (id) {
        void terminalKill(id).catch(() => undefined);
        store.clear(id);
      }
    };
  }, [methodId, runtime, store]);
  const data = React.useCallback((id: string, data: string) => {
    void terminalWrite(id, data).catch((error) => setError(agentError(error)));
  }, []);
  const resize = React.useCallback((id: string, cols: number, rows: number) => {
    void terminalResize(id, cols, rows).catch(() => undefined);
  }, []);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>登录 {runtime.profile.name}</DialogTitle>
          <DialogDescription>
            按照智能体的提示完成认证。登录信息由对应智能体管理。
          </DialogDescription>
        </DialogHeader>
        <div className="h-80 overflow-hidden rounded-lg border">
          {session && (
            <Terminal
              isActive
              sessionId={session}
              outputStore={store}
              themeMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
              writable={exitCode === null}
              onData={data}
              onResize={resize}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {exitCode !== null && (
          <p className="text-sm text-muted-foreground">
            {exitCode === 0
              ? '登录程序已结束，可以重新连接。'
              : `登录程序退出，状态码 ${exitCode}。`}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
          <Button
            onClick={() => {
              void runtime
                .reconnect()
                .catch((error) => setError(agentError(error)));
              onClose();
            }}
          >
            完成并重新连接
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

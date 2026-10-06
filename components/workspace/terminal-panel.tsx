'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type TerminalTabStatus = 'starting' | 'running' | 'exited' | 'error';

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  status: TerminalTabStatus;
  exitCode?: number | null;
}

interface TerminalPanelProps {
  activeTabId: string | null;
  error: string | null;
  height: number;
  isTauriRuntime: boolean;
  rootPath: string | null;
  tabs: TerminalTab[];
  children?: React.ReactNode;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onSelectTab: (tabId: string) => void;
}

export function TerminalPanel({
  activeTabId,
  error,
  height,
  isTauriRuntime,
  rootPath,
  tabs,
  children,
  onClose,
  onCloseTab,
  onNewTab,
  onSelectTab,
}: TerminalPanelProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <section
      className="flex w-full min-w-0 max-w-full shrink-0 flex-col overflow-hidden border-t bg-background"
      data-testid="terminal-panel"
      style={{ height }}
    >
      <header className="flex h-10 min-w-0 shrink-0 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1" role="tablist">
            {tabs.map((tab) => (
              <div
                aria-selected={tab.id === activeTabId}
                className={cn(
                  'group inline-flex h-7 max-w-48 cursor-default items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground',
                  tab.id === activeTabId && 'bg-muted text-foreground',
                )}
                key={tab.id}
                role="tab"
                tabIndex={0}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectTab(tab.id);
                  }
                }}
              >
                <span className="truncate">{tab.title}</span>
                {tab.status === 'exited' ? (
                  <span className="text-[10px] text-muted-foreground">
                    已退出
                  </span>
                ) : null}
                <button
                  aria-label={`关闭终端标签页 ${tab.title}`}
                  className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-background"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="新建终端标签页"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isTauriRuntime || !rootPath}
            type="button"
            onClick={onNewTab}
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="关闭终端面板"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {activeTab?.status === 'exited' ? (
        <div
          className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
          role="status"
        >
          <span>{formatTerminalExit(activeTab.exitCode)}</span>
          <button
            className="inline-flex h-6 items-center rounded-md px-2 text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isTauriRuntime || !rootPath}
            type="button"
            onClick={onNewTab}
          >
            新建终端
          </button>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {!isTauriRuntime ? (
          <TerminalEmptyState text="终端仅在桌面应用中可用。" />
        ) : !rootPath ? (
          <TerminalEmptyState text="打开工作区后可以启动终端。" />
        ) : activeTab ? (
          children
        ) : (
          <TerminalEmptyState text="点击加号新建一个本地终端。" />
        )}
      </div>
    </section>
  );
}

function formatTerminalExit(exitCode: number | null | undefined) {
  if (exitCode == null) {
    return '进程已退出';
  }

  return `进程已退出（${exitCode}）`;
}

function TerminalEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

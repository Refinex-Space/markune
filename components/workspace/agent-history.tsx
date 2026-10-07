'use client';

import * as React from 'react';
import {
  ArrowLeft,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AgentIcon } from './agent-icon';
import type { AgentSessionRecord } from './agent-session';

export function AgentHistory({
  records,
  loading,
  error,
  openingId,
  currentId,
  onBack,
  onRefresh,
  onSelect,
}: {
  records: AgentSessionRecord[];
  loading: boolean;
  error: string;
  openingId: string | null;
  currentId?: string;
  onBack: () => void;
  onRefresh: () => void;
  onSelect: (record: AgentSessionRecord) => void;
}) {
  const [query, setQuery] = React.useState('');
  const search = query.trim().toLocaleLowerCase();
  const visible = records.filter((record) =>
    `${record.title}\n${record.agentName}`
      .toLocaleLowerCase()
      .includes(search),
  );
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label="会话历史"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 px-2"
        >
          <ArrowLeft size={15} />
          返回聊天
        </Button>
        <h2 className="ml-auto text-sm font-medium">会话历史</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="刷新会话历史"
          disabled={loading || !!openingId}
          onClick={onRefresh}
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
        </Button>
      </header>
      <div className="shrink-0 space-y-2 p-3">
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            aria-label="搜索会话"
            placeholder="搜索标题或智能体…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">当前工作区的会话</p>
      </div>
      {error && (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3"
        aria-busy={loading}
        data-testid="agent-history-list"
      >
        {loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
          >
            <LoaderCircle size={16} className="animate-spin" />
            正在加载会话…
          </p>
        ) : visible.length ? (
          <ul className="space-y-1">
            {visible.map((record) => (
              <li key={record.id} className="min-w-0">
                <button
                  type="button"
                  className={cn(
                    'flex w-full min-w-0 items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    record.id === currentId && 'bg-accent/60',
                  )}
                  disabled={!!openingId}
                  aria-current={record.id === currentId ? 'true' : undefined}
                  onClick={() => onSelect(record)}
                >
                  <AgentIcon
                    agentId={record.agentId}
                    size={20}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm"
                      title={record.title}
                    >
                      {record.title || '新会话'}
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="truncate">{record.agentName}</span>
                      <time
                        dateTime={new Date(record.updatedAt).toISOString()}
                      >
                        {new Date(record.updatedAt).toLocaleString()}
                      </time>
                      {record.id === currentId && <span>当前会话</span>}
                    </span>
                  </span>
                  {record.id === openingId && (
                    <LoaderCircle
                      size={14}
                      aria-label="正在打开会话"
                      className="mt-1 shrink-0 animate-spin"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !error && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <History size={24} className="mx-auto mb-3 opacity-50" />
              {search ? '没有找到匹配的会话' : '还没有会话记录'}
            </div>
          )
        )}
      </div>
    </section>
  );
}

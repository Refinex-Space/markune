'use client';

// @author refinex
// 对话列表侧栏：搜索 + 新建 + 历史 conversation 项。
// 复用 useConversationManager 的状态。

import { memo } from 'react';

import type { AiConversationSummaryV2 } from '../ai-session-store';

export interface AiConversationListProps {
  summaries: AiConversationSummaryV2[];
  currentId: string | null;
  searchQuery: string;
  loading: boolean;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export const AiConversationList = memo(function AiConversationList({
  summaries,
  currentId,
  searchQuery,
  loading,
  onSearchChange,
  onSelect,
  onCreate,
}: AiConversationListProps) {
  return (
    <div className="ai-conversation-list flex h-full flex-col border-r bg-muted/20">
      {/* 搜索 + 新建 */}
      <div className="space-y-2 border-b p-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索对话…"
          className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          + 新建对话
        </button>
      </div>
      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && summaries.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">加载中…</div>
        ) : summaries.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            {searchQuery ? '无匹配对话' : '暂无对话'}
          </div>
        ) : (
          summaries.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={
                'block w-full border-l-2 px-2.5 py-1.5 text-left transition-colors ' +
                (s.id === currentId
                  ? 'border-primary bg-accent/50'
                  : 'border-transparent hover:bg-accent/30')
              }
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium">{s.title || '新对话'}</span>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">
                  {formatTime(s.updatedAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <span>{s.messageCount} 条消息</span>
                {s.documentTitle && (
                  <>
                    <span>·</span>
                    <span className="truncate">{s.documentTitle}</span>
                  </>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

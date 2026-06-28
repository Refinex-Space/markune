'use client';

// @author refinex
// 权限确认提示：agent 执行需授权工具（Bash/Edit/Write 等）时弹出，用户允许/拒绝。
// 缺失会导致工具调用无限等待，是解锁文件修改/工具调用能力的关键 UI。

import { memo } from 'react';

import type { PermissionRequestChunk, PermissionSuggestion } from '../ai-contracts';

export interface AiPermissionPromptProps {
  request: PermissionRequestChunk;
  onAllow: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

function formatToolInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 3);
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? (v.length > 60 ? v.slice(0, 57) + '...' : v) : JSON.stringify(v)}`)
    .join('  ·  ');
}

export const AiPermissionPrompt = memo(function AiPermissionPrompt({
  request,
  onAllow,
  onDeny,
}: AiPermissionPromptProps) {
  const inputSummary = formatToolInput(request.toolInput);
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="flex-shrink-0">🔐</span>
        <span className="font-medium text-foreground">
          请求授权：{request.toolName}
        </span>
      </div>
      {request.reason && (
        <div className="mt-1 text-muted-foreground">{request.reason}</div>
      )}
      {inputSummary && (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
          {inputSummary}
        </div>
      )}
      {request.suggestions && request.suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {request.suggestions.map((s: PermissionSuggestion) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAllow(request.requestId)}
              title={s.description}
              className="rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAllow(request.requestId)}
          className="rounded bg-primary px-2.5 py-0.5 font-medium text-primary-foreground hover:opacity-90"
        >
          允许
        </button>
        <button
          type="button"
          onClick={() => onDeny(request.requestId)}
          className="rounded border px-2.5 py-0.5 hover:bg-muted"
        >
          拒绝
        </button>
      </div>
    </div>
  );
});

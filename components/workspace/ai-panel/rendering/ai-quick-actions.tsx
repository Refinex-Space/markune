'use client';

// @author refinex
// 快捷写作动作（Sparkles）：Notion AI 式预设动作下拉菜单。
// 复刻旧面板的「快捷动作」能力，用新架构：点击动作 → 触发 onAction(intent, prompt)。
// 上层（整合组件）根据 intent 构建 contextPack 并发送。

import { memo, useState } from 'react';
import type { AiIntent } from '../ai-types';

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  intent: AiIntent;
  prompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'summarize',
    label: '总结全文',
    icon: '📝',
    description: '生成本文档的简明摘要',
    intent: 'summarize-document',
    prompt: '请总结这篇文档的核心内容，用简洁的要点呈现。',
  },
  {
    id: 'outline',
    label: '生成大纲',
    icon: '🗂',
    description: '基于现有内容生成结构化大纲',
    intent: 'generate-outline',
    prompt: '请基于这篇文档的内容，生成一个清晰的结构化大纲。',
  },
  {
    id: 'rewrite',
    label: '润色改写',
    icon: '✨',
    description: '优化语言表达与流畅度',
    intent: 'chat',
    prompt: '请润色改写这篇文档，提升语言表达的准确性、流畅度与专业感，保持原意。',
  },
  {
    id: 'expand',
    label: '扩写内容',
    icon: '📈',
    description: '丰富细节与论据',
    intent: 'chat',
    prompt: '请扩写这篇文档，补充必要的细节、论据与示例，使内容更充实。',
  },
];

export interface AiQuickActionsProps {
  onAction: (action: QuickAction) => void;
  disabled?: boolean;
}

export const AiQuickActions = memo(function AiQuickActions({
  onAction,
  disabled = false,
}: AiQuickActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title="快捷写作动作"
        className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        aria-label="快捷动作"
      >
        ✨
      </button>
      {open && (
        <>
          {/* 点击外部关闭 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-md border bg-popover shadow-lg">
            <div className="border-b px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
              快捷写作
            </div>
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  onAction(action);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
              >
                <span className="mt-0.5 flex-shrink-0 text-sm">{action.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-medium">{action.label}</div>
                  <div className="truncate text-[10px] text-muted-foreground/70">
                    {action.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

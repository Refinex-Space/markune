'use client';

// @author refinex
// 模式选择器：agent / plan 切换（复刻 1code Shift+Tab 循环）。
// plan 模式只读规划（限制写入工具），agent 模式完整执行。

import { memo } from 'react';

export type AiMode = 'agent' | 'plan';

export interface AiModeSelectorProps {
  mode: AiMode;
  onChange: (mode: AiMode) => void;
}

const MODES: { value: AiMode; label: string; icon: string; description: string }[] = [
  { value: 'agent', label: '执行', icon: '⚡', description: '完整执行（可读写文件）' },
  { value: 'plan', label: '规划', icon: '📋', description: '只读规划（不修改文件）' },
];

/** Shift+Tab 循环到下一个模式。 */
export function getNextMode(current: AiMode): AiMode {
  const idx = MODES.findIndex((m) => m.value === current);
  return MODES[(idx + 1) % MODES.length].value;
}

export const AiModeSelector = memo(function AiModeSelector({
  mode,
  onChange,
}: AiModeSelectorProps) {
  return (
    <div className="ai-mode-selector inline-flex items-center rounded-md border bg-muted/40 p-0.5 text-[11px]">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          title={m.description}
          className={
            'flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ' +
            (mode === m.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <span>{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
});

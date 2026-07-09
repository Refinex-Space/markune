'use client';

// @author refinex
// Edit 建议应用上下文：透传 onApplyEdit 回调，避免 props 多层穿透。
// AiEditTool 从此 Context 取 onApply；上层面板可在顶层 Provider 注入。

import { createContext, useContext } from 'react';

export interface ApplyEditInput {
  filePath: string;
  oldString: string;
  newString: string;
}

export type ApplyEditHandler = (input: ApplyEditInput) => void;

export const AiApplyEditContext = createContext<ApplyEditHandler | null>(null);

/** AiEditTool 消费：取 onApply 回调（未提供时返回 null，不显示应用按钮）。 */
export function useApplyEdit(): ApplyEditHandler | null {
  return useContext(AiApplyEditContext);
}

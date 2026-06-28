'use client';

// @author refinex
// 输入框组合（Composer）：组装 @mention 编辑器 + 补全下拉 + 发送/停止按钮 + 工具栏。
// 接收 send/stop/isStreaming（来自 useAiChat）+ mentionOptions（来自工作区/设置）。
// 管理编辑器内容、@触发状态、补全过滤。

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  filterMentionOptions,
  type MentionOption,
} from './ai-mention-serializer';
import {
  AiMentionsEditor,
  type AiMentionsEditorHandle,
} from './ai-mentions-editor';
import { AiMentionPopover } from './ai-mention-popover';

export interface AiComposerProps {
  /** 发送消息（编辑器序列化文本）。 */
  onSend: (text: string) => void;
  /** 停止当前流。 */
  onStop: () => void;
  isStreaming: boolean;
  /** mention 候选项（文件/技能/agent/tool）。 */
  mentionOptions: MentionOption[];
  /** 工作区上下文已附加指示（如已自动引用当前文档）。 */
  contextAttached?: boolean;
  placeholder?: string;
}

export function AiComposer({
  onSend,
  onStop,
  isStreaming,
  mentionOptions,
  contextAttached = false,
  placeholder = '输入消息，@ 提及文件…',
}: AiComposerProps) {
  const editorRef = useRef<AiMentionsEditorHandle>(null);
  const [hasContent, setHasContent] = useState(false);
  const [triggerQuery, setTriggerQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const filteredOptions = useMemo(() => {
    if (triggerQuery === null) return [];
    return filterMentionOptions(mentionOptions, triggerQuery).slice(0, 20);
  }, [triggerQuery, mentionOptions]);

  const handleTrigger = useCallback((searchText: string) => {
    setTriggerQuery(searchText);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setAnchorRect(rect.width === 0 && rect.height === 0 ? null : rect);
    }
  }, []);

  const handleCloseTrigger = useCallback(() => {
    setTriggerQuery(null);
    setAnchorRect(null);
  }, []);

  const handleSelectMention = useCallback(
    (option: MentionOption) => {
      editorRef.current?.insertMention(option);
      handleCloseTrigger();
    },
    [handleCloseTrigger],
  );

  const handleSubmit = useCallback(() => {
    const text = editorRef.current?.getValue() ?? '';
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    editorRef.current?.clear();
    setHasContent(false);
  }, [isStreaming, onSend]);

  const canSend = hasContent && !isStreaming;

  return (
    <div className="ai-composer border-t bg-background">
      {/* 上下文附加指示 */}
      {contextAttached && (
        <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
          <span>📎</span>
          <span>已附加当前文档上下文</span>
        </div>
      )}
      <div className="px-3 py-2">
        <AiMentionsEditor
          ref={editorRef}
          placeholder={placeholder}
          onTrigger={handleTrigger}
          onCloseTrigger={handleCloseTrigger}
          onChange={setHasContent}
          onSubmit={handleSubmit}
        />
      </div>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted/50 px-1.5 py-0.5">@ 提及</span>
          <span className="opacity-60">Enter 发送 · Shift+Enter 换行</span>
        </div>
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-md border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            发送
          </button>
        )}
      </div>
      {/* mention 补全下拉框 */}
      {triggerQuery !== null && (
        <AiMentionPopover
          options={filteredOptions}
          onSelect={handleSelectMention}
          onClose={handleCloseTrigger}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
}

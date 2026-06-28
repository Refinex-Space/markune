'use client';

// @author refinex
// @mention 富文本编辑器：contenteditable + @ 触发补全 + 不可编辑 chip。
// 复刻 1code agents-mentions-editor 的核心模式（简化版）：
// - 非受控（命令式 ref API：insertMention/getValue/clear/focus）
// - onInput 时用 TreeWalker 取光标前文本，lastIndexOf('@') 检测独立 @ 触发
// - chip = <span contenteditable=false data-mention-id>，插入时删除 @+搜索词
// - getValue 用 TreeWalker 序列化：文本累加 + br→\n + chip→@[id]

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from 'react';

import type { MentionOption } from './ai-mention-serializer';

export interface AiMentionsEditorHandle {
  focus: () => void;
  insertMention: (option: MentionOption) => void;
  getValue: () => string;
  clear: () => void;
}

export interface AiMentionsEditorProps {
  placeholder?: string;
  onTrigger?: (searchText: string) => void;
  onCloseTrigger?: () => void;
  onChange?: (hasContent: boolean) => void;
  onSubmit?: () => void;
  className?: string;
}

/** 创建 mention chip DOM 节点（不可编辑 span + data-mention-id）。 */
function createMentionNode(option: MentionOption): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-mention-id', option.id);
  span.setAttribute('data-mention-type', option.type);
  span.className =
    'inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-xs text-primary mx-0.5 align-baseline';
  const icon = document.createElement('span');
  icon.textContent = mentionIcon(option.type);
  icon.className = 'text-[10px] opacity-70';
  span.appendChild(icon);
  const label = document.createElement('span');
  label.textContent = option.label;
  span.appendChild(label);
  return span;
}

function mentionIcon(type: string): string {
  switch (type) {
    case 'file':
      return '📄';
    case 'folder':
      return '📁';
    case 'skill':
      return '⚡';
    case 'agent':
      return '🤖';
    case 'tool':
      return '🔧';
    default:
      return '•';
  }
}

/** 取光标前的文本（遍历光标之前的所有文本节点）。 */
function getTextBeforeCursor(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return serializeFragment(pre.cloneContents());
}

/** 序列化 DocumentFragment/Node 为文本（chip → @[id]）。 */
function serializeFragment(node: Node): string {
  let result = '';
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.currentNode;
  // 从第一个子节点开始
  current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      result += current.textContent || '';
    } else {
      const el = current as HTMLElement;
      if (el.tagName === 'BR') {
        result += '\n';
      } else if (el.hasAttribute && el.hasAttribute('data-mention-id')) {
        const id = el.getAttribute('data-mention-id') || '';
        result += `@[${id}]`;
      }
    }
    current = walker.nextNode();
  }
  return result;
}

export const AiMentionsEditor = forwardRef<
  AiMentionsEditorHandle,
  AiMentionsEditorProps
>(function AiMentionsEditor(
  { placeholder, onTrigger, onCloseTrigger, onChange, onSubmit, className },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const triggerActiveRef = useRef(false);

  const detectTrigger = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const textBefore = getTextBeforeCursor(editor);
    const atIdx = textBefore.lastIndexOf('@');
    if (atIdx !== -1) {
      // @ 必须独立：前导是空白/换行/起始
      const charBefore = atIdx > 0 ? textBefore.charAt(atIdx - 1) : null;
      const isStandalone = charBefore === null || /\s/.test(charBefore);
      const afterAt = textBefore.slice(atIdx + 1);
      const hasNewline = afterAt.includes('\n');
      const hasDoubleSpace = afterAt.includes('  ');
      if (isStandalone && !hasNewline && !hasDoubleSpace) {
        triggerActiveRef.current = true;
        onTrigger?.(afterAt);
        return;
      }
    }
    if (triggerActiveRef.current) {
      triggerActiveRef.current = false;
      onCloseTrigger?.();
    }
  }, [onTrigger, onCloseTrigger]);

  const handleInput = useCallback(() => {
    detectTrigger();
    const editor = editorRef.current;
    onChange?.(!!editor && (editor.textContent?.trim().length ?? 0) > 0);
  }, [detectTrigger, onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter 提交（Shift+Enter 换行）
        if (!triggerActiveRef.current) {
          e.preventDefault();
          onSubmit?.();
        }
      }
    },
    [onSubmit],
  );

  useImperativeHandle(
    ref,
    (): AiMentionsEditorHandle => ({
      focus: () => editorRef.current?.focus(),
      insertMention: (option: MentionOption) => {
        const editor = editorRef.current;
        if (!editor) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        // 若由 @ 触发，删除 @ + 搜索词（从 range 向前找到最近的 @）
        if (triggerActiveRef.current && range.startContainer.nodeType === Node.TEXT_NODE) {
          const node = range.startContainer as Text;
          const text = node.textContent || '';
          const offset = range.startOffset;
          const before = text.slice(0, offset);
          const atIdx = before.lastIndexOf('@');
          if (atIdx !== -1) {
            const after = text.slice(offset);
            node.textContent = before.slice(0, atIdx) + after;
            range.setStart(node, atIdx);
            range.collapse(true);
          }
        }

        const mentionNode = createMentionNode(option);
        range.insertNode(mentionNode);
        const space = document.createTextNode(' ');
        mentionNode.after(space);
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        triggerActiveRef.current = false;
        onCloseTrigger?.();
        onChange?.(true);
      },
      getValue: () => {
        const editor = editorRef.current;
        if (!editor) return '';
        return serializeFragment(editor);
      },
      clear: () => {
        const editor = editorRef.current;
        if (editor) {
          editor.textContent = '';
          onChange?.(false);
        }
      },
    }),
    [onChange, onCloseTrigger],
  );

  // 占位符（CSS :empty + data-placeholder）
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && placeholder) {
      editor.setAttribute('data-placeholder', placeholder);
    }
  }, [placeholder]);

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      className={
        'ai-mentions-editor min-h-[60px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm outline-none ' +
        (className ?? '')
      }
      role="textbox"
      aria-multiline="true"
    />
  );
});

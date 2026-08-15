'use client';

import * as React from 'react';
import { markdown } from '@codemirror/lang-markdown';
import { basicSetup, EditorView } from 'codemirror';

export interface MarkdownSourceEditorHandle {
  focus: () => void;
  getSelectedText: () => string;
  selectRange: (from: number, to: number) => void;
  setValue: (value: string) => void;
}

interface MarkdownSourceEditorProps {
  editorRef: React.RefObject<MarkdownSourceEditorHandle | null>;
  initialValue: string;
  onChange?: (value: string) => void;
  readOnly: boolean;
}

export function MarkdownSourceEditor({
  editorRef,
  initialValue,
  onChange,
  readOnly,
}: MarkdownSourceEditorProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const view = new EditorView({
      doc: initialValue,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': {
            fontFamily: 'var(--markune-code-font)',
            lineHeight: '1.5rem',
            overflow: 'auto',
          },
          '.cm-content': { padding: '1.25rem 1.5rem' },
          '.cm-gutters': {
            backgroundColor: 'var(--background)',
            borderRight: '1px solid var(--border)',
            color: 'var(--muted-foreground)',
          },
        }),
      ],
      parent: host,
    });

    editorRef.current = {
      focus: () => view.focus(),
      getSelectedText: () => {
        const selection = view.state.selection.main;
        return selection.empty
          ? ''
          : view.state.sliceDoc(selection.from, selection.to);
      },
      selectRange: (from, to) => {
        view.dispatch({
          selection: {
            anchor: Math.max(0, Math.min(from, view.state.doc.length)),
            head: Math.max(0, Math.min(to, view.state.doc.length)),
          },
          scrollIntoView: true,
        });
      },
      setValue: (value) => {
        const current = view.state.doc.toString();

        if (current === value) {
          return;
        }

        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
      },
    };

    return () => {
      editorRef.current = null;
      view.destroy();
    };
  }, [editorRef, initialValue, readOnly]);

  return (
    <div
      aria-label="Markdown 文档源码"
      className="min-h-0 flex-1 overflow-hidden text-sm text-foreground"
      data-read-only={readOnly ? 'true' : 'false'}
      data-testid="markdown-source-editor"
      ref={hostRef}
    />
  );
}

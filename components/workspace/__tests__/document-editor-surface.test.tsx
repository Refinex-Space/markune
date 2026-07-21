import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { editorMounts, editorUnmounts } = vi.hoisted(() => ({
  editorMounts: vi.fn(),
  editorUnmounts: vi.fn(),
}));

vi.mock('@/components/editor/markdown-editor', async () => {
  const React = await import('react');

  return {
    MarkdownEditor: React.forwardRef(function MockMarkdownEditor(
      props: { documentKey?: string; markdown: string },
      ref: React.ForwardedRef<{ flushDraft: () => Promise<boolean> }>,
    ) {
      const initialDocumentKey = React.useRef(props.documentKey);

      React.useImperativeHandle(
        ref,
        () => ({ flushDraft: async () => true }),
        [],
      );
      React.useEffect(() => {
        const documentKey = initialDocumentKey.current;

        editorMounts(documentKey);
        return () => editorUnmounts(documentKey);
      }, []);

      return (
        <div data-testid={`editor-${props.markdown}`}>{props.markdown}</div>
      );
    }),
  };
});

import { DocumentEditorSurface } from '../workspace-layout';
import {
  createInitialEditorLayout,
  openDocumentTab,
  selectDocumentTab,
} from '../document-tabs';
import type { WorkspaceNode } from '../workspace-types';

function doc(id: string): WorkspaceNode {
  return {
    absolutePath: `/repo/${id}.md`,
    id,
    kind: 'document',
    name: `${id}.md`,
    relativePath: `${id}.md`,
    title: id,
  };
}

function SurfaceHarness() {
  const [layout, setLayout] = React.useState(() => {
    let value = createInitialEditorLayout();
    value = openDocumentTab(value, doc('a'));
    value = openDocumentTab(value, doc('b'));
    return selectDocumentTab(value, '/repo/a.md');
  });
  const activePath = layout.activeTabId;

  return (
    <DocumentEditorSurface
      activeDocumentPath={activePath}
      activeEditorRef={{ current: null }}
      currentDocumentPath={activePath}
      documentEditorLayout={layout}
      documentLoadError={null}
      documentLoadState="ready"
      documentVersion={1}
      draftMarkdown={activePath === '/repo/a.md' ? 'A' : 'B'}
      editorSessions={{
        '/repo/a.md': { documentVersion: 10, markdown: 'A' },
        '/repo/b.md': { documentVersion: 20, markdown: 'B' },
      }}
      getDocumentReadOnly={() => false}
      pageWidthMode="wide"
      workspaceRootPath="/repo"
      onCloseAllTabs={() => {}}
      onCloseOtherTabs={() => {}}
      onCloseTab={() => {}}
      onCloseTabsToLeft={() => {}}
      onCloseTabsToRight={() => {}}
      onMarkdownChange={() => true}
      onRetryDocument={() => {}}
      onSaveRequested={() => {}}
      onSelectTab={(tabId) =>
        setLayout((current) => selectDocumentTab(current, tabId))
      }
    />
  );
}

describe('DocumentEditorSurface', () => {
  beforeEach(() => {
    editorMounts.mockClear();
    editorUnmounts.mockClear();
  });

  it('切换已打开 Tab 时保留两个编辑器实例', () => {
    render(<SurfaceHarness />);

    fireEvent.click(screen.getByRole('tab', { name: /b/iu }));
    fireEvent.click(screen.getByRole('tab', { name: /a/iu }));

    expect(editorMounts).toHaveBeenCalledTimes(2);
    expect(editorUnmounts).not.toHaveBeenCalled();
    expect(
      screen
        .getByTestId('editor-A')
        .closest('[data-active]')
        ?.getAttribute('data-active'),
    ).toBe('true');
  });
});

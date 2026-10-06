import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMarkweaveDocumentViewportCoordinatorForElement, insertMarkweaveReferenceLink } from 'markweave';

import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { PREVIEW_WORKSPACE_DOCUMENT_EVENT } from '@/components/editor/workspace-document-link';

vi.mock('@/components/editor/use-workspace-asset-uploader', () => ({
  useWorkspaceAssetUploader: (_root: string, markdown: string) => ({
    editorMarkdown: markdown,
    toStorageMarkdown: (value: string) => value,
    onAttachmentDownload: vi.fn(),
    onSlashCommandUpload: vi.fn(),
  }),
}));

describe('published Markweave local link integration', () => {
  it('keeps inserted references compact and edits addresses outside the document flow', async () => {
    let ready = false;
    render(
      <MarkdownEditor
        documentKey="reference-insertion-integration"
        documentPath="/vault/README.md"
        workspaceRootPath="/vault"
        markdown={'第一行：[[\n\n第二行：保持位置。'}
        onDocumentLoadStateChange={(state) => { ready = state.phase === 'ready'; }}
      />,
    );
    await waitFor(() => expect(ready).toBe(true));
    const surface = screen.getByTestId('markweave-editor-surface');
    const editor = getMarkweaveDocumentViewportCoordinatorForElement(surface)!.editor;
    await act(async () => {
      insertMarkweaveReferenceLink(editor, { from: 5, to: 7 }, {
        href: '01%20开始使用/建立第一个工作区.md', label: '建立第一个工作区',
      });
    });
    expect(editor.getText()).toContain('第一行：建立第一个工作区');
    expect(document.querySelector('.markweave-inline-link-source')).toBeNull();
    const before = editor.getMarkdown();
    const anchor = await screen.findByRole('link', { name: '建立第一个工作区' });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: anchor });
    await act(async () => {
      editor.view.someProp('handleClick', (handler) => handler(editor.view, 6, event));
    });
    expect(document.querySelector('.markweave-inline-link-source')?.parentElement).toBe(document.body);
    expect(surface.querySelector('.markweave-inline-link-source')).toBeNull();
    expect(editor.getMarkdown()).toBe(before);
    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(document.querySelector('.markweave-inline-link-source')).toBeNull();
  });

  it.each([false, true])(
    'renders local paths with spaces and routes explicit clicks to previews (readOnly=%s)',
    async (readOnly) => {
      render(
        <MarkdownEditor
          documentKey="local-link-integration"
          documentPath="/vault/README.md"
          workspaceRootPath="/vault"
          readOnly={readOnly}
          markdown={'# 使用指南\n\n1. 阅读[建立第一个工作区](01 开始使用/建立第一个工作区.md#目录)，了解文档。\n2. 查看[Inbox 与 Daily](02 捕获与写作/Inbox 与 Daily.md)。'}
        />,
      );
      const firstLink = await screen.findByRole('link', { name: '建立第一个工作区' });
      expect(firstLink.getAttribute('href')).toBe('01%20开始使用/建立第一个工作区.md#目录');
      expect((await screen.findByRole('link', { name: 'Inbox 与 Daily' })).getAttribute('href'))
        .toBe('02%20捕获与写作/Inbox%20与%20Daily.md');
      const preview = vi.fn();
      window.addEventListener(PREVIEW_WORKSPACE_DOCUMENT_EVENT, preview);
      try {
        fireEvent.click(firstLink, { metaKey: !readOnly });
        expect(preview).toHaveBeenCalledOnce();
        expect((preview.mock.calls[0][0] as CustomEvent).detail).toEqual({
          workspaceRootPath: '/vault',
          relativePath: '01 开始使用/建立第一个工作区.md',
          hash: '目录',
        });
      } finally {
        window.removeEventListener(PREVIEW_WORKSPACE_DOCUMENT_EVENT, preview);
      }
    },
  );
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PREVIEW_WORKSPACE_DOCUMENT_EVENT } from '@/components/editor/workspace-document-link';
import { DocumentReferenceDrawer, documentReferenceWidth } from '../document-reference-drawer';
import type { WorkspaceNode } from '../workspace-types';

vi.mock('../ai-document-preview', () => ({
  AiDocumentPreview: ({ document, markdownOverride, onClose, onOpenInEditor }: {
    document: WorkspaceNode; markdownOverride: string | null;
    onClose: () => void; onOpenInEditor: () => void;
  }) => <div>
    <p>{document.name}</p><p>{markdownOverride}</p>
    <button onClick={onClose}>关闭文档预览</button>
    <button onClick={onOpenInEditor}>在编辑器中打开</button>
  </div>,
}));

const nodes: WorkspaceNode[] = ['A', 'B'].map(name => ({
  id: name, name: `${name}.md`, relativePath: `${name}.md`,
  absolutePath: `/vault/${name}.md`, kind: 'document',
}));
function preview(relativePath = 'A.md', workspaceRootPath = '/vault') {
  act(() => window.dispatchEvent(new CustomEvent(PREVIEW_WORKSPACE_DOCUMENT_EVENT, {
    detail: { relativePath, hash: '目标标题', workspaceRootPath },
  })));
}
const props = {
  nodes, workspaceRootPath: '/vault', pageWidthMode: 'wide' as const,
  getDraft: (path: string) => `草稿 ${path}`,
};

describe('DocumentReferenceDrawer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {} disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700,
      x: 0, y: 0, toJSON() {},
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('only previews a reference, using the open draft, until the open button is clicked', async () => {
    const onOpenDocument = vi.fn().mockResolvedValue(true);
    render(<DocumentReferenceDrawer {...props} onOpenDocument={onOpenDocument} />);
    preview();
    expect(screen.getByText('草稿 /vault/A.md')).toBeTruthy();
    expect(screen.getByTestId('document-reference-drawer').style.width).toBe('400px');
    expect(onOpenDocument).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '在编辑器中打开' }));
    expect(onOpenDocument).toHaveBeenCalledWith({relativePath:'A.md', hash:'目标标题',workspaceRootPath:'/vault'});
    await waitFor(() => expect(screen.queryByTestId('document-reference-drawer')).toBeNull());
  });

  it('keeps the preview open if saving or opening fails', async () => {
    render(<DocumentReferenceDrawer {...props} onOpenDocument={vi.fn().mockResolvedValue(false)} />);
    preview();
    await userEvent.click(screen.getByRole('button', { name: '在编辑器中打开' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('A.md')).toBeTruthy();
  });

  it('does not close a newer preview when an earlier open finishes', async () => {
    let finish!: (opened: boolean) => void;
    render(<DocumentReferenceDrawer {...props} onOpenDocument={() => new Promise(resolve => { finish = resolve; })} />);
    preview();
    await userEvent.click(screen.getByRole('button', { name: '在编辑器中打开' }));
    preview('B.md');
    await act(async () => finish(true));
    expect(screen.getByText('B.md')).toBeTruthy();
  });

  it('rejects stale workspace events and closes with Escape without navigating', () => {
    const onOpenDocument = vi.fn();
    render(<DocumentReferenceDrawer {...props} onOpenDocument={onOpenDocument} />);
    preview('A.md', '/other');
    expect(screen.queryByTestId('document-reference-drawer')).toBeNull();
    preview();
    fireEvent.keyDown(screen.getByTestId('document-reference-drawer'), {key:'Escape'});
    expect(screen.queryByTestId('document-reference-drawer')).toBeNull();
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it('bounds resizing and restores pointer state after a cancelled drag', async () => {
    render(<DocumentReferenceDrawer {...props} onOpenDocument={vi.fn()} />);
    preview();
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'End' });
    expect(handle.getAttribute('aria-valuenow')).toBe('900');
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(handle.getAttribute('aria-valuenow')).toBe('320');
    fireEvent.pointerDown(handle, { button: 0, clientX: 880 });
    expect(document.body.style.cursor).toBe('col-resize');
    fireEvent.pointerCancel(document);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('adapts the minimum and maximum to narrow containers', () => {
    expect(documentReferenceWidth(1200, 1 / 3)).toEqual({min:320,max:900,width:400});
    expect(documentReferenceWidth(240, 1 / 3)).toEqual({min:180,max:180,width:180});
    expect(documentReferenceWidth(2000, 1)).toEqual({min:320,max:960,width:960});
  });
});

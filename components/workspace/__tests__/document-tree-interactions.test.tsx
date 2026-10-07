import * as React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentTree } from '../document-tree';
import type { WorkspaceNode } from '../workspace-types';

const doc = (name: string): WorkspaceNode => ({
  id: name,
  name,
  relativePath: name,
  absolutePath: `/repo/${name}`,
  kind: 'document',
});
const child = doc('Folder/child.md');
const folder: WorkspaceNode = {
  id: 'Folder',
  name: 'Folder',
  relativePath: 'Folder',
  absolutePath: '/repo/Folder',
  kind: 'directory',
  children: [child],
};
const a = doc('a.md'),
  b = doc('b.md');
const nodes = [folder, a, b];
const transfer = (path = a.absolutePath) => ({
  effectAllowed: 'move',
  dropEffect: 'move',
  setData: vi.fn(),
  getData: vi.fn(() => path),
});
function setup(extra: Partial<React.ComponentProps<typeof DocumentTree>> = {}) {
  const props = {
    nodes,
    rootPath: '/repo',
    currentDocumentPath: null,
    searchQuery: '',
    onCreateDirectory: vi.fn(),
    onCreateDocument: vi.fn(),
    onDeleteNode: vi.fn(),
    onImportMarkdown: vi.fn(),
    onRenameNode: vi.fn(),
    onSelectDocument: vi.fn(),
    onMoveNode: vi.fn(),
    onTreeSortChange: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn(),
    ...extra,
  };
  render(<DocumentTree {...props} />);
  return props;
}
afterEach(() => vi.useRealTimers());

describe('document tree interaction contract', () => {
  it('aligns the folder title without a leading disclosure button', () => {
    setup();
    expect(
      screen.queryByRole('button', { name: '折叠文件夹', exact: true }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: '打开工作区文件夹总览' }).parentElement
        ?.className,
    ).toContain('px-2');
  });

  it('keeps active and selected backgrounds inside the indented hover surface', () => {
    setup({
      currentDocumentPath: child.absolutePath,
      currentDirectoryPath: folder.absolutePath,
    });
    fireEvent.click(screen.getByTestId('tree-row-Folder'));
    fireEvent.click(screen.getByTestId('tree-row-Folder/child.md'));
    const directoryRow = screen.getByTestId('tree-row-Folder');
    const documentRow = screen.getByTestId('tree-row-Folder/child.md');
    expect(directoryRow.classList.contains('bg-sidebar-accent')).toBe(false);
    expect(documentRow.classList.contains('bg-sidebar-accent')).toBe(false);
    expect(
      screen
        .getByTestId('tree-row-surface-Folder')
        .classList.contains('bg-sidebar-accent'),
    ).toBe(true);
    expect(
      screen
        .getByTestId('tree-row-surface-Folder/child.md')
        .classList.contains('before:bg-sidebar-accent'),
    ).toBe(true);
    expect(screen.getByTestId('tree-guide-Folder')).toBeTruthy();
  });

  it('keeps the root actions accessible in an empty workspace', async () => {
    const user = userEvent.setup(),
      props = setup({ nodes: [] });
    await user.click(screen.getByRole('button', { name: '文件夹操作' }));
    await user.click(screen.getByRole('menuitem', { name: '新建文件夹' }));
    expect(props.onCreateDirectory).toHaveBeenCalledWith('');
  });
  it('persists an explicit sorting choice from the root menu', async () => {
    const user = userEvent.setup(),
      props = setup();
    await user.click(screen.getByRole('button', { name: '文件夹操作' }));
    await user.click(screen.getByRole('menuitem', { name: '排序方式' }));
    const choice = await screen.findByRole('menuitemradio', {
      name: '名称（升序）',
    });
    act(() => choice.focus());
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(props.onTreeSortChange).toHaveBeenCalledWith('/repo', {
        mode: 'name-asc',
        foldersFirst: true,
      }),
    );
  });
  it('collapses descendants while preserving the root list', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('tree-row-Folder'));
    expect(screen.getByTestId('tree-row-Folder/child.md')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '文件夹操作' }));
    await user.click(screen.getByRole('menuitem', { name: '折叠所有文件夹' }));
    expect(screen.queryByTestId('tree-row-Folder/child.md')).toBeNull();
    expect(screen.getByTestId('tree-row-Folder')).toBeTruthy();
  });
  it('commits the previewed document midpoint position without recalculating at drop', () => {
    const props = setup(),
      dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-b.md'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.drop(screen.getByTestId('tree-row-b.md'), {
      dataTransfer,
      clientY: 0,
    });
    expect(props.onMoveNode).toHaveBeenCalledWith({
      nodePath: a.absolutePath,
      targetPath: b.absolutePath,
      position: 'after',
    });
  });
  it('accepts a nested document in the root empty-space target', () => {
    const props = setup(),
      dataTransfer = transfer(child.absolutePath);
    fireEvent.click(screen.getByTestId('tree-row-Folder'));
    fireEvent.dragStart(screen.getByTestId('tree-row-Folder/child.md'), {
      dataTransfer,
    });
    const root = screen.getByTestId('workspace-tree-root-creation-area');
    fireEvent.dragOver(root, { dataTransfer });
    fireEvent.drop(root, { dataTransfer });
    expect(props.onMoveNode).toHaveBeenCalledWith({
      nodePath: child.absolutePath,
      targetPath: '/repo',
      position: 'inside',
    });
  });
  it('cancels spring expansion after the pointer leaves the tree', () => {
    vi.useFakeTimers();
    setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.dragLeave(screen.getByTestId('workspace-tree-context-area'), {
      relatedTarget: null,
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByTestId('tree-row-Folder/child.md')).toBeNull();
  });
  it('escape cancels the drag even if its browser payload is still available', () => {
    const props = setup(),
      dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.keyDown(screen.getByTestId('tree-row-a.md'), { key: 'Escape' });
    fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.drop(screen.getByTestId('tree-row-Folder'), { dataTransfer });
    expect(props.onMoveNode).not.toHaveBeenCalled();
  });
  it('submits selected siblings as one ordered batch', () => {
    const props = setup(),
      dataTransfer = transfer();
    fireEvent.click(screen.getByTestId('tree-row-b.md'));
    fireEvent.click(screen.getByTestId('tree-row-a.md'), { metaKey: true });
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.drop(screen.getByTestId('tree-row-Folder'), { dataTransfer });
    expect(props.onMoveNode).toHaveBeenCalledWith({
      nodePath: a.absolutePath,
      nodePaths: [a.absolutePath, b.absolutePath],
      targetPath: folder.absolutePath,
      position: 'inside',
    });
  });
  it('does not submit another move while a previous operation is pending', async () => {
    let complete!: () => void;
    const props = setup({
      onMoveNode: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      ),
    });
    const dataTransfer = transfer();
    for (let i = 0; i < 2; i++) {
      fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), {
        dataTransfer,
      });
      fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
        dataTransfer,
        clientY: 16,
      });
      fireEvent.drop(screen.getByTestId('tree-row-Folder'), { dataTransfer });
    }
    expect(props.onMoveNode).toHaveBeenCalledTimes(1);
    await act(async () => complete());
  });
  it('supports roving focus, expansion, and keyboard reorder without opening documents', async () => {
    const props = setup();
    const row = screen.getByTestId('tree-row-Folder');
    fireEvent.keyDown(row, { key: 'ArrowRight' });
    fireEvent.keyDown(row, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByTestId('tree-row-Folder/child.md'),
      ),
    );
    expect(props.onSelectDocument).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('tree-row-a.md'), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(props.onMoveNode).toHaveBeenCalledWith({
      nodePath: a.absolutePath,
      nodePaths: [a.absolutePath],
      targetPath: b.absolutePath,
      position: 'after',
    });
  });
  it('keeps file positions automatic until the user explicitly switches modes', () => {
    const props = setup({
        treeSort: {
          default: { mode: 'name-asc', foldersFirst: true },
          folders: {},
        },
      }),
      dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-b.md'), {
      dataTransfer,
      clientY: 2,
    });
    fireEvent.drop(screen.getByTestId('tree-row-b.md'), { dataTransfer });
    expect(props.onMoveNode).not.toHaveBeenCalled();
    expect(props.onTreeSortChange).not.toHaveBeenCalled();
  });
  it('offers a keyboard-accessible destination dialog', async () => {
    const user = userEvent.setup(),
      props = setup();
    await user.click(
      screen.getByRole('button', { name: '打开 a.md 操作菜单' }),
    );
    await user.click(screen.getByRole('menuitem', { name: '移动到…' }));
    await screen.findByRole('dialog');
    await user.click(
      screen.getByRole('button', { name: 'Folder', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: '移动', exact: true }));
    expect(props.onMoveNode).toHaveBeenCalledWith({
      nodePath: a.absolutePath,
      nodePaths: [a.absolutePath],
      targetPath: folder.absolutePath,
      position: 'inside',
    });
  });
  it('keeps undo available from the header after the toast disappears', async () => {
    const user = userEvent.setup();
    const result = {
      snapshot: { rootPath: '/repo', rootName: 'repo', nodes },
      changes: [{ oldPath: a.absolutePath, newPath: '/repo/Folder/a.md' }],
      undoToken: 'receipt',
      error: null,
    };
    const onUndoTreeMove = vi
      .fn()
      .mockResolvedValue({ ...result, changes: [], undoToken: null });
    setup({ onMoveNode: vi.fn().mockResolvedValue(result), onUndoTreeMove });
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByTestId('tree-row-a.md'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('tree-row-Folder'), {
      dataTransfer,
      clientY: 16,
    });
    fireEvent.drop(screen.getByTestId('tree-row-Folder'), { dataTransfer });
    await waitFor(() =>
      expect(screen.getByRole('tree').getAttribute('aria-busy')).toBe('false'),
    );
    await user.click(screen.getByRole('button', { name: '文件夹操作' }));
    await user.click(screen.getByRole('menuitem', { name: '撤销移动' }));
    expect(onUndoTreeMove).toHaveBeenCalledWith('receipt');
  });
});

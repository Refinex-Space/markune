import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DrawingSidebar } from '../drawing-sidebar';
import type { DrawingController } from '../use-drawing-controller';
import type {
  DrawingAlbumNode,
  DrawingLibrarySnapshot,
  DrawingSummary,
} from '../workspace-types';

const drawing: DrawingSummary = {
  albumPath: '产品',
  createdAt: '2026-07-01T00:00:00.000Z',
  elementCount: 1,
  favorite: false,
  hasBackup: true,
  hasPreview: true,
  id: '11111111-1111-4111-8111-111111111111',
  issue: null,
  previewRevision: 1,
  revision: 1,
  sceneSha256: 'a'.repeat(64),
  schemaVersion: 1,
  searchText: '流程',
  tags: ['旧标签'],
  title: '登录流程',
  trashed: false,
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const album: DrawingAlbumNode = {
  children: [],
  drawings: [drawing],
  name: '产品',
  path: '产品',
};

function snapshot(albums: DrawingAlbumNode[] = [album]): DrawingLibrarySnapshot {
  return {
    albums,
    drawings: [drawing],
    issues: [],
    trash: [],
    trashAlbums: [],
  };
}

function controller(overrides: Partial<DrawingController> = {}) {
  return {
    createAlbum: vi.fn().mockResolvedValue('新建图集'),
    createNewDrawing: vi.fn().mockResolvedValue(null),
    deleteAlbum: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue(undefined),
    duplicateAlbum: vi.fn().mockResolvedValue(undefined),
    importFiles: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    moveAlbum: vi.fn().mockResolvedValue(undefined),
    moveToTrash: vi.fn().mockResolvedValue(undefined),
    openDrawing: vi.fn().mockResolvedValue(undefined),
    query: '',
    renameAlbum: vi.fn().mockResolvedValue(undefined),
    requestDrawingAction: vi.fn().mockResolvedValue(undefined),
    selectAlbum: vi.fn().mockResolvedValue(undefined),
    selectCollection: vi.fn().mockResolvedValue(undefined),
    selection: { collection: 'all', kind: 'collection' } as const,
    setQuery: vi.fn(),
    snapshot: snapshot(),
    trashAlbum: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DrawingController;
}

describe('DrawingSidebar', () => {
  it('centers collection counts on the same slot as the create button', () => {
    render(<DrawingSidebar controller={controller()} />);

    const count = screen.getByTestId('drawing-collection-count-全部图稿');
    expect(count.className).toContain('size-7');
    expect(count.className).toContain('justify-center');
  });

  it('uses the document-tree folder states and guide line', async () => {
    const user = userEvent.setup();

    render(<DrawingSidebar controller={controller()} />);

    expect(screen.getByTestId('drawing-folder-closed-产品')).toBeTruthy();
    expect(screen.queryByTestId('drawing-tree-guide-产品')).toBeNull();

    await user.click(screen.getByText('产品'));

    expect(screen.getByTestId('drawing-folder-open-产品')).toBeTruthy();
    expect(screen.getByTestId('drawing-tree-guide-产品')).toBeTruthy();
  });

  it('opens the same album actions from right click and ellipsis', async () => {
    const user = userEvent.setup();
    const value = controller();

    render(<DrawingSidebar controller={value} />);

    fireEvent.contextMenu(screen.getByTestId('drawing-album-row-产品'));
    await user.click(screen.getByRole('menuitem', { name: '新建图稿' }));

    expect(value.createNewDrawing).toHaveBeenCalledWith('未命名图稿', '产品');

    await user.click(screen.getByLabelText('产品 操作'));
    expect(screen.getByRole('menuitem', { name: '新建图稿' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '新建子图集' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy();
  });

  it('creates an album first and then edits its name inline', async () => {
    const user = userEvent.setup();
    const value = controller({ snapshot: snapshot([]) });
    const view = render(<DrawingSidebar controller={value} />);

    await user.click(screen.getByLabelText('新建或导入图稿'));
    await user.click(screen.getByRole('menuitem', { name: '新建图集' }));

    expect(value.createAlbum).toHaveBeenCalledWith('新建图集');
    expect(screen.queryByRole('dialog')).toBeNull();

    value.snapshot = snapshot([
      { children: [], drawings: [], name: '新建图集', path: '新建图集' },
    ]);
    view.rerender(<DrawingSidebar controller={value} />);

    await waitFor(() =>
      expect(screen.getByLabelText('重命名图集 新建图集')).toBeTruthy(),
    );
  });

  it('exposes the full drawing menu from right click', async () => {
    const value = controller();

    render(<DrawingSidebar controller={value} />);

    fireEvent.click(screen.getByText('产品'));
    fireEvent.contextMenu(screen.getByTestId(`drawing-row-${drawing.id}`));

    expect(screen.getByRole('menuitem', { name: '复制 Markdown 引用' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '导出 .excalidraw' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '导出 PNG' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '导出 SVG' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '创建副本' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '移动到…' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '移到回收站' })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: '复制 Markdown 引用' }));
    expect(value.requestDrawingAction).toHaveBeenCalledWith(drawing.id, {
      kind: 'copy-markdown',
    });
  });
});

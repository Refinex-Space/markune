import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { selectVisibleDrawings } from '../use-drawing-controller';
import type { DrawingLibrarySnapshot } from '../workspace-types';

const workspaceRoot = process.cwd();
const snapshot: DrawingLibrarySnapshot = {
  albums: [],
  drawings: [
    {
      albumPath: '产品/流程',
      createdAt: '2026-07-01T00:00:00.000Z',
      elementCount: 2,
      favorite: true,
      hasBackup: true,
      hasPreview: true,
      id: '11111111-1111-4111-8111-111111111111',
      issue: null,
      previewRevision: 2,
      revision: 2,
      sceneSha256: 'a'.repeat(64),
      schemaVersion: 1,
      searchText: '登录 用户 流程',
      tags: ['产品'],
      title: '登录流程',
      trashed: false,
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
    {
      albumPath: '技术',
      createdAt: '2026-07-03T00:00:00.000Z',
      elementCount: 1,
      favorite: false,
      hasBackup: false,
      hasPreview: false,
      id: '22222222-2222-4222-8222-222222222222',
      issue: null,
      previewRevision: null,
      revision: 1,
      sceneSha256: 'b'.repeat(64),
      schemaVersion: 1,
      searchText: 'deployment topology',
      tags: ['架构'],
      title: '部署拓扑',
      trashed: false,
      updatedAt: '2026-07-03T00:00:00.000Z',
    },
  ],
  issues: [],
  trash: [],
  trashAlbums: [],
};

describe('drawing integration', () => {
  it('filters collections, nested albums, and canvas text without legacy tags', () => {
    expect(
      selectVisibleDrawings(
        snapshot,
        { collection: 'favorites', kind: 'collection' },
        '',
      ).map((drawing) => drawing.title),
    ).toEqual(['登录流程']);
    expect(
      selectVisibleDrawings(snapshot, { kind: 'album', path: '产品' }, '').map(
        (drawing) => drawing.title,
      ),
    ).toEqual(['登录流程']);
    expect(
      selectVisibleDrawings(
        snapshot,
        { collection: 'all', kind: 'collection' },
        'topology',
      ).map((drawing) => drawing.title),
    ).toEqual(['部署拓扑']);
    expect(
      selectVisibleDrawings(
        snapshot,
        { collection: 'all', kind: 'collection' },
        '架构',
      ),
    ).toEqual([]);
  });

  it('keeps Excalidraw behind a client-only dynamic boundary and stages fonts', () => {
    const dynamicSource = readFileSync(
      join(workspaceRoot, 'components/workspace/drawing-editor-dynamic.tsx'),
      'utf8',
    );
    const packageJson = readFileSync(join(workspaceRoot, 'package.json'), 'utf8');
    const gitignore = readFileSync(join(workspaceRoot, '.gitignore'), 'utf8');

    expect(dynamicSource).toContain("ssr: false");
    expect(dynamicSource).toContain("window.EXCALIDRAW_ASSET_PATH = '/excalidraw-runtime/'");
    expect(packageJson).toContain('"@excalidraw/excalidraw": "0.18.1"');
    expect(packageJson).toContain('"excalidraw:stage"');
    expect(gitignore).toContain('/public/excalidraw-runtime/');
  });

  it('wires gallery, editor, Raw IPC, and stable drawing links into the shell', () => {
    const layout = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const api = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-api.ts'),
      'utf8',
    );
    const editor = readFileSync(
      join(workspaceRoot, 'components/editor/markdown-editor.tsx'),
      'utf8',
    );
    const drawingReference = readFileSync(
      join(
        workspaceRoot,
        'components/editor/drawing-markdown-reference.ts',
      ),
      'utf8',
    );

    expect(layout).toContain('<DrawingSidebar');
    expect(layout).toContain('<DrawingWorkspacePage');
    expect(api).toContain("invoke<void>('stage_drawing_scene', bytes");
    expect(api).toContain("'x-madora-drawing-session'");
    expect(editor).toContain('parseDrawingMarkdownUrl(href)');
    expect(drawingReference).toContain(
      "'[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'",
    );
  });

  it('keeps move dialogs but creates and renames albums inline', () => {
    const sidebar = readFileSync(
      join(workspaceRoot, 'components/workspace/drawing-sidebar.tsx'),
      'utf8',
    );
    const gallery = readFileSync(
      join(workspaceRoot, 'components/workspace/drawing-workspace-page.tsx'),
      'utf8',
    );

    expect(sidebar).toContain('<Dialog');
    expect(sidebar).toContain("createNewDrawing('未命名图稿'");
    expect(sidebar).toContain('重命名图集');
    expect(sidebar).not.toContain('window.prompt');
    expect(gallery).not.toContain('window.prompt');
  });
});

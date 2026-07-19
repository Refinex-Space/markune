import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawingWorkspacePage } from '../drawing-workspace-page';
import type { DrawingController } from '../use-drawing-controller';
import type { DrawingSummary } from '../workspace-types';

const editorMocks = vi.hoisted(() => ({
  actions: {
    createPreview: vi.fn(),
    exportBytes: vi.fn(),
    flush: vi.fn(),
  },
}));

const apiMocks = vi.hoisted(() => ({
  readDrawingPreview: vi.fn(),
  selectDrawingExportTarget: vi.fn(),
  writeDrawingExport: vi.fn(),
}));

vi.mock('../drawing-editor-dynamic', () => ({
  DrawingEditorDynamic: ({ onReady }: { onReady: (actions: unknown) => void }) => {
    const onReadyRef = React.useRef(onReady);
    React.useEffect(() => {
      const handleReady = onReadyRef.current;
      handleReady(editorMocks.actions);
      return () => handleReady(null);
    }, []);
    return <div data-testid="drawing-editor" />;
  },
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../workspace-api')>();
  return {
    ...original,
    ...apiMocks,
  };
});

const drawing: DrawingSummary = {
  albumPath: '产品',
  createdAt: '2026-07-01T00:00:00.000Z',
  elementCount: 1,
  favorite: true,
  hasBackup: true,
  hasPreview: false,
  id: '11111111-1111-4111-8111-111111111111',
  issue: null,
  previewRevision: null,
  revision: 1,
  sceneSha256: 'a'.repeat(64),
  schemaVersion: 1,
  searchText: '登录 流程',
  tags: ['旧标签'],
  title: '登录流程',
  trashed: false,
  updatedAt: '2026-07-02T00:00:00.000Z',
};

function controller(overrides: Partial<DrawingController> = {}) {
  return {
    completeDrawingAction: vi.fn(),
    createMarkdownReference: vi.fn().mockResolvedValue('![登录流程](asset)'),
    descriptor: null,
    error: null,
    loading: false,
    markDirty: vi.fn(),
    move: vi.fn().mockResolvedValue(undefined),
    moveToTrash: vi.fn().mockResolvedValue(undefined),
    openDrawing: vi.fn().mockResolvedValue(undefined),
    persistLibrary: vi.fn().mockResolvedValue(undefined),
    recordViewport: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    registerFlush: vi.fn(),
    requestedAction: null,
    requestDrawingAction: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    saveState: { revision: 1, status: 'saved' } as const,
    scene: null,
    selectCollection: vi.fn().mockResolvedValue(undefined),
    selection: { collection: 'all', kind: 'collection' } as const,
    setError: vi.fn(),
    snapshot: {
      albums: [],
      drawings: [drawing],
      issues: [],
      trash: [],
      trashAlbums: [],
    },
    viewport: null,
    visibleDrawings: [drawing],
    ...overrides,
  } as unknown as DrawingController;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('DrawingWorkspacePage', () => {
  it('uses a compact title group without tags or a duplicate header menu', () => {
    const value = controller({
      descriptor: {
        albumPath: drawing.albumPath,
        hasBackup: drawing.hasBackup,
        hasPreview: drawing.hasPreview,
        meta: drawing,
      },
      scene: '{"type":"excalidraw","version":2,"elements":[]}',
      selection: { id: drawing.id, kind: 'drawing' },
    });

    render(
      <DrawingWorkspacePage
        controller={value}
        rootPath="/repo"
        theme="light"
      />,
    );

    expect(screen.queryByLabelText('图稿标签')).toBeNull();
    expect(screen.queryByLabelText('图稿操作')).toBeNull();
    expect(screen.getByTestId('drawing-editor-header').className).toContain('h-10');
    expect(screen.getByLabelText('图稿标题').className).toContain('bg-muted/45');
    expect(screen.getByLabelText('取消星标').querySelector('svg')?.className.baseVal)
      .toContain('fill-amber-300/40');
  });

  it('executes a queued export after the target editor becomes ready', async () => {
    editorMocks.actions.exportBytes.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    apiMocks.selectDrawingExportTarget.mockResolvedValue({
      fileName: '登录流程.png',
      grantId: 'grant-1',
    });
    apiMocks.writeDrawingExport.mockResolvedValue(undefined);
    const completeDrawingAction = vi.fn();
    const value = controller({
      completeDrawingAction,
      descriptor: {
        albumPath: drawing.albumPath,
        hasBackup: drawing.hasBackup,
        hasPreview: drawing.hasPreview,
        meta: drawing,
      },
      requestedAction: {
        drawingId: drawing.id,
        format: 'png',
        kind: 'export',
        requestId: 7,
      },
      scene: '{"type":"excalidraw","version":2,"elements":[]}',
      selection: { id: drawing.id, kind: 'drawing' },
    });

    render(
      <DrawingWorkspacePage
        controller={value}
        rootPath="/repo"
        theme="light"
      />,
    );

    await waitFor(() =>
      expect(apiMocks.writeDrawingExport).toHaveBeenCalledWith(
        'grant-1',
        Uint8Array.from([1, 2, 3]),
      ),
    );
    expect(completeDrawingAction).toHaveBeenCalledWith(7);
  });

  it('does not render legacy tags and opens drawing actions by right click', () => {
    const value = controller();

    render(
      <DrawingWorkspacePage
        controller={value}
        rootPath="/repo"
        theme="light"
      />,
    );

    expect(screen.queryByText('旧标签')).toBeNull();
    expect(screen.getByTestId('drawing-gallery-header').className).toContain('h-10');
    expect(screen.getByTestId('drawing-card').className).not.toContain('shadow');
    expect(screen.getByTestId('drawing-card').className).not.toContain('transform');

    fireEvent.contextMenu(screen.getByTestId('drawing-card'));

    expect(screen.getByRole('menuitem', { name: '复制 Markdown 引用' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '导出 PNG' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '移动到…' })).toBeTruthy();
  });

  it('renders a PNG fallback preview with the detected media type', async () => {
    const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      'createObjectURL',
    );
    const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
      URL,
      'revokeObjectURL',
    );
    const createObjectURL = vi.fn().mockReturnValue('blob:drawing-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    apiMocks.readDrawingPreview.mockResolvedValue(
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]),
    );

    try {
      render(
        <DrawingWorkspacePage
          controller={controller({
            visibleDrawings: [{ ...drawing, hasPreview: true }],
          })}
          rootPath="/repo"
          theme="light"
        />,
      );

      await waitFor(() =>
        expect(screen.getByAltText('登录流程 预览')).toBeTruthy(),
      );
      const previewBlob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(previewBlob.type).toBe('image/png');
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }
      if (originalRevokeObjectUrl) {
        Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
    }
  });
});

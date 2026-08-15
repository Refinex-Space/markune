import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DrawingWorkspacePage } from '../drawing-workspace-page';
import type { DrawingController } from '../use-drawing-controller';
import type { DrawingSummary } from '../workspace-types';

const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  });
});

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

const clipboardMocks = vi.hoisted(() => ({
  writeDrawingMarkdownReferenceToClipboard: vi.fn(),
}));

vi.mock('@/components/editor/drawing-markdown-reference', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/components/editor/drawing-markdown-reference')
  >();
  return {
    ...original,
    ...clipboardMocks,
  };
});

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

vi.mock('../mindmap-editor-dynamic', () => ({
  MindMapEditorDynamic: ({ onReady }: { onReady: (actions: unknown) => void }) => {
    const onReadyRef = React.useRef(onReady);
    React.useEffect(() => {
      const handleReady = onReadyRef.current;
      handleReady(editorMocks.actions);
      return () => handleReady(null);
    }, []);
    return <div data-testid="mindmap-editor" />;
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
  contentSha256: 'a'.repeat(64),
  favorite: true,
  hasBackup: true,
  hasPreview: false,
  id: '11111111-1111-4111-8111-111111111111',
  issue: null,
  previewRevision: null,
  revision: 1,
  itemCount: 1,
  kind: 'whiteboard',
  schemaVersion: 2,
  searchText: '登录 流程',
  tags: ['旧标签'],
  title: '登录流程',
  trashed: false,
  updatedAt: '2026-07-02T00:00:00.000Z',
};

const mindmapDrawing: DrawingSummary = {
  ...drawing,
  contentSha256: 'b'.repeat(64),
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'mindmap',
  searchText: '中心主题 分支',
  title: '产品脑图',
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
    content: null,
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
      content: '{"type":"excalidraw","version":2,"elements":[]}',
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
    expect(screen.getByTestId('drawing-editor-header').style.height).toBe('32px');
    expect(screen.getByLabelText('图稿标题').className).toContain('bg-muted/45');
    expect(screen.getByLabelText('取消星标').querySelector('svg')?.className.baseVal)
      .toContain('fill-amber-300/40');
  });

  it('accepts the workspace-calculated editor header height', () => {
    const value = controller({
      descriptor: {
        albumPath: drawing.albumPath,
        hasBackup: drawing.hasBackup,
        hasPreview: drawing.hasPreview,
        meta: drawing,
      },
      content: '{"type":"excalidraw","version":2,"elements":[]}',
      selection: { id: drawing.id, kind: 'drawing' },
    });

    render(
      <DrawingWorkspacePage
        controller={value}
        editorHeaderHeight={38}
        rootPath="/repo"
        theme="light"
      />,
    );

    expect(screen.getByTestId('drawing-editor-header').style.height).toBe('38px');
  });

  it('shows tooltips for every mindmap toolbar icon', async () => {
    const value = controller({
      descriptor: {
        albumPath: mindmapDrawing.albumPath,
        hasBackup: mindmapDrawing.hasBackup,
        hasPreview: mindmapDrawing.hasPreview,
        meta: mindmapDrawing,
      },
      content: JSON.stringify({
        data: {
          compact: false,
          direction: 1,
          nodeData: { children: [], id: 'root', topic: '中心主题' },
        },
        type: 'markune-mindmap',
        version: 1,
      }),
      selection: { id: mindmapDrawing.id, kind: 'drawing' },
    });

    render(
      <DrawingWorkspacePage
        controller={value}
        rootPath="/repo"
        theme="light"
      />,
    );

    const tooltips = [
      ['脑图左向布局', '左向布局'],
      ['脑图右向布局', '右向布局'],
      ['脑图双向布局', '双向布局'],
      ['脑图向下布局', '向下布局'],
      ['适应窗口', '适应窗口'],
      ['折叠脑图层级', '展开层级'],
    ] as const;
    for (const [accessibleName, tooltipText] of tooltips) {
      const button = screen.getByRole('button', { name: accessibleName });
      button.focus();
      await waitFor(() =>
        expect(
          [...document.querySelectorAll('[data-slot="tooltip-content"]')].some(
            (tooltip) => tooltip.textContent?.includes(tooltipText),
          ),
        ).toBe(true),
      );
      button.blur();
    }
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
      content: '{"type":"excalidraw","version":2,"elements":[]}',
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

  it('copies the canonical Markdown reference after creating a preview', async () => {
    const markdown =
      `[![登录流程](markune-asset://${'b'.repeat(64)})](markune-drawing://${drawing.id})`;
    editorMocks.actions.createPreview.mockResolvedValue(
      Uint8Array.from([1, 2, 3]),
    );
    clipboardMocks.writeDrawingMarkdownReferenceToClipboard.mockResolvedValue(
      undefined,
    );
    const completeDrawingAction = vi.fn();
    const createMarkdownReference = vi.fn().mockResolvedValue(markdown);
    const value = controller({
      completeDrawingAction,
      createMarkdownReference,
      descriptor: {
        albumPath: drawing.albumPath,
        hasBackup: drawing.hasBackup,
        hasPreview: drawing.hasPreview,
        meta: drawing,
      },
      requestedAction: {
        drawingId: drawing.id,
        kind: 'copy-markdown',
        requestId: 8,
      },
      content: '{"type":"excalidraw","version":2,"elements":[]}',
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
      expect(
        clipboardMocks.writeDrawingMarkdownReferenceToClipboard,
      ).toHaveBeenCalledWith(markdown),
    );
    expect(createMarkdownReference).toHaveBeenCalledWith(
      Uint8Array.from([1, 2, 3]),
    );
    expect(completeDrawingAction).toHaveBeenCalledWith(8);
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
    expect(screen.getByTestId('drawing-gallery-header').className).toContain('px-3');
    expect(screen.getByTestId('drawing-gallery-header').className).not.toContain(
      'border-b',
    );
    expect(screen.getByTestId('drawing-gallery-toolbar').className).toContain(
      'ml-auto',
    );
    expect(screen.queryByText('1 幅图稿')).toBeNull();
    expect(screen.getByTestId('drawing-card').className).not.toContain('shadow');
    expect(screen.getByTestId('drawing-card').className).not.toContain('transform');
    expect(screen.getByTestId('drawing-preview-surface').className)
      .toContain('bg-muted/45');

    fireEvent.contextMenu(screen.getByTestId('drawing-card'));

    expect(screen.getByRole('menuitem', { name: '复制 Markdown 引用' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '导出 PNG' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '移动到…' })).toBeTruthy();
  });

  it('uses the application dropdown menu for drawing sorting', async () => {
    const user = userEvent.setup();

    render(
      <DrawingWorkspacePage
        controller={controller()}
        rootPath="/repo"
        theme="light"
      />,
    );

    expect(screen.queryByRole('combobox', { name: '图稿排序' })).toBeNull();
    const trigger = screen.getByRole('button', { name: '图稿排序' });
    expect(trigger.textContent).toContain('最近更新');

    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: '名称' }));

    expect(trigger.textContent).toContain('名称');
  });

  it('renders a PNG fallback preview with the detected media type', async () => {
    const originalIntersectionObserver = Object.getOwnPropertyDescriptor(
      globalThis,
      'IntersectionObserver',
    );
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
    const observe = vi.fn();
    const disconnect = vi.fn();
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: class {
        disconnect = disconnect;
        observe = observe;
        unobserve = vi.fn();
      },
    });
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
      expect(observe).not.toHaveBeenCalled();
      expect(screen.getByTestId('drawing-preview-surface').className)
        .not.toContain('bg-muted/45');
    } finally {
      if (originalIntersectionObserver) {
        Object.defineProperty(
          globalThis,
          'IntersectionObserver',
          originalIntersectionObserver,
        );
      } else {
        Reflect.deleteProperty(globalThis, 'IntersectionObserver');
      }
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

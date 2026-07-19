import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDrawingController } from '../use-drawing-controller';
import type {
  DrawingDocumentDescriptor,
  DrawingLibrarySnapshot,
} from '../workspace-types';

const apiMocks = vi.hoisted(() => ({
  beginDrawingSave: vi.fn(),
  cancelDrawingSave: vi.fn(),
  commitDrawingSave: vi.fn(),
  createDrawingMarkdownSnapshot: vi.fn(),
  loadDrawingLibrary: vi.fn(),
  readDrawingLibrary: vi.fn(),
  readDrawingMeta: vi.fn(),
  readDrawingScene: vi.fn(),
  stageDrawingPreview: vi.fn(),
  stageDrawingScene: vi.fn(),
  writeDrawingUiState: vi.fn(),
}));

vi.mock('../workspace-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../workspace-api')>();
  return {
    ...original,
    ...apiMocks,
    isTauriRuntime: () => true,
  };
});

const emptySnapshot: DrawingLibrarySnapshot = {
  albums: [],
  drawings: [],
  issues: [],
  trash: [],
  trashAlbums: [],
};

function descriptor(revision: number): DrawingDocumentDescriptor {
  return {
    albumPath: '',
    hasBackup: revision > 1,
    hasPreview: false,
    meta: {
      createdAt: '2026-07-19T00:00:00.000Z',
      elementCount: 0,
      favorite: false,
      id: '11111111-1111-4111-8111-111111111111',
      previewRevision: null,
      revision,
      sceneSha256: String(revision).repeat(64).slice(0, 64),
      schemaVersion: 1,
      searchText: '',
      tags: [],
      title: '串行保存',
      updatedAt: `2026-07-19T00:00:0${revision}.000Z`,
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDrawingController', () => {
  it('keeps repeated dirty notifications idempotent', () => {
    const { result, unmount } = renderHook(() =>
      useDrawingController({ active: false, rootPath: null }),
    );

    act(() => result.current.markDirty());
    const dirtyState = result.current.saveState;
    act(() => result.current.markDirty());

    expect(result.current.saveState).toBe(dirtyState);
    unmount();
  });

  it('opens an inactive drawing and exposes one queued file action', async () => {
    apiMocks.readDrawingMeta.mockResolvedValue(descriptor(1));
    apiMocks.readDrawingScene.mockResolvedValue(
      new TextEncoder().encode('{"type":"excalidraw","version":2,"elements":[]}'),
    );
    apiMocks.readDrawingLibrary.mockResolvedValue(new Uint8Array());

    const { result, unmount } = renderHook(() =>
      useDrawingController({ active: false, rootPath: '/workspace' }),
    );

    await settleRootReset();
    await act(async () => {
      await result.current.requestDrawingAction(
        '11111111-1111-4111-8111-111111111111',
        { format: 'png', kind: 'export' },
      );
    });

    expect(result.current.selection).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'drawing',
    });
    expect(result.current.requestedAction).toMatchObject({
      drawingId: '11111111-1111-4111-8111-111111111111',
      format: 'png',
      kind: 'export',
    });

    act(() =>
      result.current.completeDrawingAction(
        result.current.requestedAction!.requestId,
      ),
    );

    expect(result.current.requestedAction).toBeNull();
    unmount();
  });

  it('starts queued saves with the latest committed revision', async () => {
    const expectedRevisions: number[] = [];
    let committedRevision = 1;
    apiMocks.loadDrawingLibrary.mockResolvedValue(emptySnapshot);
    apiMocks.readDrawingMeta.mockResolvedValue(descriptor(1));
    apiMocks.readDrawingScene.mockResolvedValue(
      new TextEncoder().encode('{"type":"excalidraw","version":2,"elements":[]}'),
    );
    apiMocks.readDrawingLibrary.mockResolvedValue(
      new TextEncoder().encode('{"type":"excalidrawlib","version":2,"libraryItems":[]}'),
    );
    apiMocks.beginDrawingSave.mockImplementation(
      async (_rootPath, _drawingId, expectedRevision: number) => {
        expectedRevisions.push(expectedRevision);
        return {
          nextRevision: expectedRevision + 1,
          sessionId: `session-${expectedRevision}`,
        };
      },
    );
    apiMocks.stageDrawingScene.mockResolvedValue(undefined);
    apiMocks.commitDrawingSave.mockImplementation(async () => {
      committedRevision += 1;
      return descriptor(committedRevision);
    });

    const { result, unmount } = renderHook(() =>
      useDrawingController({ active: false, rootPath: '/workspace' }),
    );

    await settleRootReset();
    await act(async () => {
      await result.current.openDrawing(
        '11111111-1111-4111-8111-111111111111',
      );
    });

    const payload = {
      manifest: {
        elementCount: 0,
        favorite: false,
        searchText: '',
        tags: [],
        title: '串行保存',
      },
      preview: null,
      scene: new TextEncoder().encode(
        '{"type":"excalidraw","version":2,"elements":[]}',
      ),
    };

    await act(async () => {
      await Promise.all([
        result.current.save(payload),
        result.current.save(payload),
      ]);
    });

    expect(expectedRevisions).toEqual([1, 2]);
    expect(apiMocks.commitDrawingSave).toHaveBeenCalledTimes(2);
    expect(apiMocks.stageDrawingScene).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('creates Markdown references from stable snapshot and drawing IDs', async () => {
    const assetId = 'd0f45cd65e487641a2bed39aaf81f718b7bc6969ac49520911230b69fe219156';
    apiMocks.readDrawingMeta.mockResolvedValue(descriptor(1));
    apiMocks.readDrawingScene.mockResolvedValue(
      new TextEncoder().encode('{"type":"excalidraw","version":2,"elements":[]}'),
    );
    apiMocks.readDrawingLibrary.mockResolvedValue(new Uint8Array());
    apiMocks.createDrawingMarkdownSnapshot.mockResolvedValue({
      id: assetId,
      mediaType: 'image/png',
      name: '串行保存.png',
      size: 100,
      url: 'asset://localhost/encoded-absolute-path.png',
    });

    const { result, unmount } = renderHook(() =>
      useDrawingController({ active: false, rootPath: '/workspace' }),
    );

    await settleRootReset();
    await act(async () => {
      await result.current.openDrawing(
        '11111111-1111-4111-8111-111111111111',
      );
    });

    let reference: string | null = null;
    await act(async () => {
      reference = await result.current.createMarkdownReference(
        Uint8Array.from([1, 2, 3]),
      );
    });

    expect(reference).toBe(
      `[![串行保存](madora-asset://${assetId})](madora-drawing://11111111-1111-4111-8111-111111111111)`,
    );
    expect(reference).not.toContain('asset://localhost');
    unmount();
  });
});

async function settleRootReset() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

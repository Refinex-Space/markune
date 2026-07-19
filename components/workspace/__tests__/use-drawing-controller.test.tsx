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
});

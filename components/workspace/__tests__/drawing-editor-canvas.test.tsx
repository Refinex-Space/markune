import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import { DrawingEditorCanvas } from '../drawing-editor-canvas';
import type { DrawingEditorActions } from '../drawing-editor-types';

const excalidrawMock = vi.hoisted(() => ({
  exportToBlob: vi.fn(),
  props: null as Record<string, unknown> | null,
}));

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    excalidrawMock.props = props;
    return null;
  },
  exportToBlob: excalidrawMock.exportToBlob,
  exportToSvg: vi.fn(),
  hashElementsVersion: (elements: Array<{ version?: number }>) =>
    elements.reduce((total, element) => total + (element.version ?? 0), 0),
  loadLibraryFromBlob: vi.fn().mockResolvedValue([]),
  serializeAsJSON: vi.fn().mockReturnValue('{}'),
  serializeLibraryAsJSON: vi.fn().mockReturnValue('{}'),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

afterEach(() => {
  excalidrawMock.props = null;
  vi.clearAllMocks();
});

describe('DrawingEditorCanvas', () => {
  it('notifies dirty only once for repeated callbacks with the same scene', () => {
    const onDirty = vi.fn();
    render(
      <DrawingEditorCanvas
        autoSaveBlocked
        favorite={false}
        initialLibrary={null}
        initialScene='{"type":"excalidraw","version":2,"elements":[]}'
        tags={[]}
        theme="light"
        title="重复回调"
        viewport={null}
        onDirty={onDirty}
        onLibraryChange={vi.fn().mockResolvedValue(undefined)}
        onReady={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onViewportChange={vi.fn()}
      />,
    );

    const onChange = excalidrawMock.props?.onChange as (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => void;
    const appState = {
      gridSize: null,
      gridStep: 5,
      viewBackgroundColor: '#ffffff',
    } as AppState;
    const changedElements = [
      { id: 'shape-1', isDeleted: false, version: 1 },
    ] as unknown as readonly ExcalidrawElement[];
    const updatedElements = [
      { id: 'shape-1', isDeleted: false, version: 2 },
    ] as unknown as readonly ExcalidrawElement[];

    act(() => onChange([], appState, {}));
    act(() => onChange(changedElements, appState, {}));
    act(() => onChange(changedElements, appState, {}));

    expect(onDirty).toHaveBeenCalledTimes(1);

    act(() => onChange(updatedElements, appState, {}));

    expect(onDirty).toHaveBeenCalledTimes(2);
  });

  it('exports from the imperative API before the first change callback', async () => {
    let actions: DrawingEditorActions | null = null;
    const appState = {
      gridSize: null,
      gridStep: 5,
      viewBackgroundColor: '#ffffff',
    } as AppState;
    const elements = [
      { id: 'shape-1', isDeleted: false, version: 1 },
    ] as unknown as readonly ExcalidrawElement[];
    excalidrawMock.exportToBlob.mockResolvedValue(
      new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }),
    );

    render(
      <DrawingEditorCanvas
        autoSaveBlocked
        favorite={false}
        initialLibrary={null}
        initialScene='{"type":"excalidraw","version":2,"elements":[]}'
        tags={[]}
        theme="light"
        title="立即导出"
        viewport={null}
        onDirty={vi.fn()}
        onLibraryChange={vi.fn().mockResolvedValue(undefined)}
        onReady={(nextActions) => {
          actions = nextActions;
        }}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onViewportChange={vi.fn()}
      />,
    );

    const setApi = excalidrawMock.props?.excalidrawAPI as (
      api: {
        getAppState: () => AppState;
        getFiles: () => BinaryFiles;
        getSceneElements: () => readonly ExcalidrawElement[];
      },
    ) => void;
    act(() =>
      setApi({
        getAppState: () => appState,
        getFiles: () => ({}),
        getSceneElements: () => elements,
      }),
    );

    const bytes = await actions!.exportBytes('png');

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(excalidrawMock.exportToBlob).toHaveBeenCalledWith(
      expect.objectContaining({ appState, elements }),
    );
  });

  it('keeps a PNG preview when the WebView cannot encode WebP', async () => {
    let actions: DrawingEditorActions | null = null;
    const pngBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    excalidrawMock.exportToBlob.mockResolvedValue(
      new Blob([pngBytes], {
        type: 'image/webp',
      }),
    );
    render(
      <DrawingEditorCanvas
        autoSaveBlocked
        favorite={false}
        initialLibrary={null}
        initialScene='{"type":"excalidraw","version":2,"elements":[]}'
        tags={[]}
        theme="light"
        title="预览格式"
        viewport={null}
        onDirty={vi.fn()}
        onLibraryChange={vi.fn().mockResolvedValue(undefined)}
        onReady={(nextActions) => {
          actions = nextActions;
        }}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onViewportChange={vi.fn()}
      />,
    );

    const onChange = excalidrawMock.props?.onChange as (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => void;
    const appState = {
      gridSize: null,
      gridStep: 5,
      viewBackgroundColor: '#ffffff',
    } as AppState;
    const elements = [
      { id: 'shape-1', isDeleted: false, version: 1 },
    ] as unknown as readonly ExcalidrawElement[];

    act(() => onChange(elements, appState, {}));
    const preview = await actions!.createPreview();

    expect(preview).toEqual(pngBytes);
  });
});

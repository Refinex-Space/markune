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

  it('drops a preview when the WebView returns non-WebP bytes', async () => {
    let actions: DrawingEditorActions | null = null;
    excalidrawMock.exportToBlob.mockResolvedValue(
      new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
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

    expect(preview).toBeNull();
  });
});

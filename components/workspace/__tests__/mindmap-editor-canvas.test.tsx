import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MindMapEditorCanvas } from '../mindmap-editor-canvas';
import type { DrawingEditorActions } from '../drawing-editor-types';

const mindElixirMock = vi.hoisted(() => ({
  instances: [] as Array<{
    bus: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
    changeTheme: ReturnType<typeof vi.fn>;
    data: Record<string, unknown>;
    destroy: ReturnType<typeof vi.fn>;
    exportPng: ReturnType<typeof vi.fn>;
    exportSvg: ReturnType<typeof vi.fn>;
    getData: ReturnType<typeof vi.fn>;
    init: ReturnType<typeof vi.fn>;
    initDown: ReturnType<typeof vi.fn>;
    initLeft: ReturnType<typeof vi.fn>;
    initRight: ReturnType<typeof vi.fn>;
    initSide: ReturnType<typeof vi.fn>;
    listeners: Map<string, (...args: never[]) => void>;
    move: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>;
    refresh: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    scaleFit: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('mind-elixir', () => {
  const MindElixir = vi.fn(function MindElixirMock(options: Record<string, unknown>) {
    const listeners = new Map<string, (...args: never[]) => void>();
    const instance = {
      bus: {
        addListener: vi.fn((event: string, listener: (...args: never[]) => void) => {
          listeners.set(event, listener);
        }),
        removeListener: vi.fn((event: string) => listeners.delete(event)),
      },
      changeTheme: vi.fn(),
      data: {},
      destroy: vi.fn(),
      exportPng: vi.fn().mockResolvedValue(null),
      exportSvg: vi.fn().mockReturnValue(new Blob()),
      getData: vi.fn(() => instance.data),
      init: vi.fn((data: Record<string, unknown>) => {
        instance.data = structuredClone(data);
        return undefined;
      }),
      initDown: vi.fn(),
      initLeft: vi.fn(),
      initRight: vi.fn(),
      initSide: vi.fn(),
      listeners,
      move: vi.fn(),
      options,
      refresh: vi.fn((data: Record<string, unknown>) => {
        instance.data = structuredClone(data);
      }),
      scale: vi.fn(),
      scaleFit: vi.fn(),
    };
    mindElixirMock.instances.push(instance);
    return instance;
  });
  Object.assign(MindElixir, { DOWN: 3, LEFT: 0, RIGHT: 1, SIDE: 2 });
  return { default: MindElixir };
});

vi.mock('mind-elixir/i18n', () => ({ zh_CN: {} }));

const initialContent = JSON.stringify({
  data: {
    arrows: [],
    compact: false,
    direction: 1,
    nodeData: {
      children: [{ children: [], id: 'child', topic: '子节点' }],
      id: 'root',
      topic: '根节点',
    },
    summaries: [],
  },
  type: 'markune-mindmap',
  version: 1,
});

afterEach(() => {
  mindElixirMock.instances.length = 0;
  vi.clearAllMocks();
});

describe('MindMapEditorCanvas', () => {
  it('initializes once, synchronizes the app theme and destroys listeners on unmount', () => {
    let actions: DrawingEditorActions | null = null;
    const props = {
      autoSaveBlocked: true,
      favorite: false,
      initialContent,
      onDirty: vi.fn(),
      onReady: (nextActions: DrawingEditorActions | null) => {
        actions = nextActions;
      },
      onSave: vi.fn().mockResolvedValue(undefined),
      onViewportChange: vi.fn(),
      tags: [] as string[],
      theme: 'light' as const,
      title: '测试脑图',
      viewport: null,
    };
    const view = render(<MindMapEditorCanvas {...props} />);
    const instance = mindElixirMock.instances[0];

    expect(instance.init).toHaveBeenCalledOnce();
    expect(instance.options).toEqual(
      expect.objectContaining({
        editable: true,
        keypress: true,
        overflowHidden: false,
      }),
    );
    expect(actions?.mindmap).toBeDefined();

    view.rerender(<MindMapEditorCanvas {...props} theme="dark" />);
    expect(mindElixirMock.instances).toHaveLength(1);
    expect(instance.changeTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'markune-dark', type: 'dark' }),
      true,
    );

    view.unmount();
    expect(instance.bus.removeListener).toHaveBeenCalledTimes(4);
    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(actions).toBeNull();
  });

  it('marks operations dirty and exposes layout and fold actions', () => {
    let actions: DrawingEditorActions | null = null;
    const onDirty = vi.fn();
    const view = render(
      <MindMapEditorCanvas
        autoSaveBlocked
        favorite={false}
        initialContent={initialContent}
        tags={[]}
        theme="light"
        title="测试脑图"
        viewport={null}
        onDirty={onDirty}
        onReady={(nextActions) => {
          actions = nextActions;
        }}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onViewportChange={vi.fn()}
      />,
    );
    const instance = mindElixirMock.instances[0];
    instance.data = {
      ...(instance.data as object),
      nodeData: {
        children: [],
        id: 'root',
        topic: '已修改',
      },
    };

    act(() => instance.listeners.get('operation')?.());
    expect(onDirty).toHaveBeenCalledOnce();

    act(() => actions?.mindmap?.setDirection('down'));
    expect(instance.initDown).toHaveBeenCalledOnce();

    act(() => actions?.mindmap?.collapseToLevel(1));
    expect(instance.refresh).toHaveBeenCalledOnce();

    instance.scaleFit.mockClear();
    act(() => actions?.mindmap?.fit());
    expect(instance.scaleFit).toHaveBeenCalledOnce();
    view.unmount();
  });
});

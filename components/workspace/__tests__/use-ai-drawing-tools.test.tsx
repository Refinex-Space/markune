import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiDrawingTools } from '../use-ai-drawing-tools';
import type { DrawingController } from '../use-drawing-controller';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  cancel: vi.fn(),
  commit: vi.fn(),
  compile: vi.fn(),
  readMeta: vi.fn(),
  readPreview: vi.fn(),
  readScene: vi.fn(),
  stagePreview: vi.fn(),
  stageScene: vi.fn(),
}));

vi.mock('../ai-drawing-compiler', () => ({
  compileMermaidDrawing: mocks.compile,
}));

vi.mock('../workspace-api', () => ({
  beginGeneratedDrawingCreate: mocks.begin,
  cancelGeneratedDrawingCreate: mocks.cancel,
  commitGeneratedDrawingCreate: mocks.commit,
  readDrawingMeta: mocks.readMeta,
  readDrawingPreview: mocks.readPreview,
  readDrawingScene: mocks.readScene,
  stageDrawingPreview: mocks.stagePreview,
  stageDrawingScene: mocks.stageScene,
}));

const compiled = {
  definition: 'flowchart TB\nA-->B',
  diagramType: 'flowchart',
  elementCount: 3,
  previewBytes: new Uint8Array([4, 5]),
  previewDataUrl: 'data:image/webp;base64,UklGRgAAAABXRUJQ',
  previewMediaType: 'image/webp',
  profile: 'architecture' as const,
  quality: {
    blockers: [],
    creatable: true,
    grade: 'A' as const,
    metrics: {
      arrowCrossings: 0,
      backwardEdgeRatio: 0,
      canvasAspectRatio: 1.5,
      dashedEdgeCount: 0,
      edgeCount: 1,
      edgeNodeIntersections: 0,
      extraBends: 0,
      groupCount: 0,
      literalEscapedNewlineCount: 0,
      maxFanIn: 1,
      maxFanOut: 1,
      maxPointsPerEdge: 2,
      nodeCount: 2,
      overlappingNodePairs: 0,
      textOverflowCount: 0,
      totalSegments: 1,
    },
    score: 100,
    suggestions: [],
    warnings: [],
  },
  sceneBytes: new Uint8Array([1, 2, 3]),
  title: 'Spring Cloud 架构',
  warnings: [],
};

const created = {
  albumPath: '架构',
  hasBackup: false,
  hasPreview: true,
  meta: {
    id: 'drawing-1',
    revision: 1,
    title: 'Spring Cloud 架构',
  },
};

function previewRequest() {
  return {
    arguments: {
      definition: compiled.definition,
      profile: compiled.profile,
      title: compiled.title,
    },
    callId: 'call-1',
    namespace: 'madora_drawing' as const,
    threadId: 'thread-1',
    tool: 'preview_mermaid' as const,
    turnId: 'turn-1',
  };
}

describe('useAiDrawingTools', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000001',
    });
    mocks.compile.mockResolvedValue(compiled);
    mocks.begin.mockResolvedValue({ sessionId: 'session-1' });
    mocks.commit.mockResolvedValue(created);
    mocks.stagePreview.mockResolvedValue(undefined);
    mocks.stageScene.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('limits one turn to initial preview plus two repairs and creates the exact cached bytes', async () => {
    const onCreated = vi.fn();
    const controller = {
      descriptor: null,
      selection: { kind: 'album', path: '架构' },
    } as unknown as DrawingController;
    const { result } = renderHook(() =>
      useAiDrawingTools({
        controller,
        onCreated,
        workspaceRootPath: '/workspace',
      }),
    );
    let previewId = '';
    await act(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await result.current(previewRequest());
        expect(response.success).toBe(true);
        previewId = JSON.parse(response.text).previewId;
      }
      const fourth = await result.current(previewRequest());
      expect(fourth.success).toBe(false);
      expect(fourth.text).toContain('3 次预览上限');

      const response = await result.current({
        ...previewRequest(),
        arguments: { previewId },
        tool: 'create_from_preview',
      });
      expect(response.success).toBe(true);
    });

    expect(mocks.begin).toHaveBeenCalledWith(
      '/workspace',
      '架构',
      expect.objectContaining({ elementCount: 3, title: compiled.title }),
    );
    expect(mocks.stageScene).toHaveBeenCalledWith(
      'session-1',
      compiled.sceneBytes,
    );
    expect(mocks.stagePreview).toHaveBeenCalledWith(
      'session-1',
      compiled.previewBytes,
    );
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(mocks.compile).toHaveBeenCalledWith(
      compiled.title,
      compiled.definition,
      compiled.profile,
    );
  });

  it('returns the quality report but refuses to create a blocked preview', async () => {
    mocks.compile.mockResolvedValueOnce({
      ...compiled,
      quality: {
        ...compiled.quality,
        blockers: ['检测到 4 处箭头交叉。'],
        creatable: false,
        grade: 'C',
        score: 64,
        suggestions: ['减少跨层关系。'],
      },
    });
    const controller = {
      descriptor: null,
      selection: { kind: 'album', path: '架构' },
    } as unknown as DrawingController;
    const { result } = renderHook(() =>
      useAiDrawingTools({
        controller,
        onCreated: vi.fn(),
        workspaceRootPath: '/workspace',
      }),
    );

    let previewId = '';
    await act(async () => {
      const preview = await result.current(previewRequest());
      expect(preview.success).toBe(true);
      const payload = JSON.parse(preview.text);
      previewId = payload.previewId;
      expect(payload.quality.creatable).toBe(false);

      const creation = await result.current({
        ...previewRequest(),
        arguments: { previewId },
        tool: 'create_from_preview',
      });
      expect(creation.success).toBe(false);
      expect(creation.text).toContain('质量门禁');
    });

    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('returns a bounded editable scene projection and preview for an inspected drawing', async () => {
    const descriptor = {
      ...created,
      meta: {
        ...created.meta,
        createdAt: '2026-07-20T00:00:00.000Z',
        elementCount: 2,
        favorite: false,
        previewRevision: 1,
        sceneSha256: '1'.repeat(64),
        schemaVersion: 1,
        searchText: '网关',
        tags: [],
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    };
    mocks.readMeta.mockResolvedValue(descriptor);
    mocks.readScene.mockResolvedValue(
      new TextEncoder().encode(
        JSON.stringify({
          type: 'excalidraw',
          elements: [{ id: 'gateway', type: 'text', text: 'API Gateway' }],
        }),
      ),
    );
    mocks.readPreview.mockResolvedValue(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const controller = {
      descriptor,
      selection: { kind: 'drawing', id: descriptor.meta.id },
    } as unknown as DrawingController;
    const { result } = renderHook(() =>
      useAiDrawingTools({
        controller,
        onCreated: vi.fn(),
        workspaceRootPath: '/workspace',
      }),
    );

    const response = await result.current({
      arguments: { drawingId: descriptor.meta.id },
      callId: 'call-inspect',
      namespace: 'madora_drawing',
      threadId: 'thread-1',
      tool: 'inspect_drawing',
      turnId: 'turn-1',
    });

    expect(response.success).toBe(true);
    expect(response.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.parse(response.text).scene.elements).toContainEqual(
      expect.objectContaining({ id: 'gateway', text: 'API Gateway' }),
    );
    expect(mocks.readScene).toHaveBeenCalledWith(
      '/workspace',
      descriptor.meta.id,
    );
  });
});

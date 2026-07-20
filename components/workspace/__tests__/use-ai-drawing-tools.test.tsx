import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAiDrawingTools } from '../use-ai-drawing-tools';
import type { DrawingController } from '../use-drawing-controller';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  cancel: vi.fn(),
  commit: vi.fn(),
  compile: vi.fn(),
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
  });
});

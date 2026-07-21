import { describe, expect, it, vi } from 'vitest';

import type { CompiledAiDrawing } from '../ai-drawing-compiler';
import { AiDrawingPreviewCache } from '../ai-drawing-preview-cache';

function drawing(title: string): CompiledAiDrawing {
  return {
    definition: 'flowchart TB\nA-->B',
    diagramType: 'flowchart',
    elementCount: 2,
    previewBytes: new Uint8Array(),
    previewDataUrl: 'data:image/png;base64,',
    previewMediaType: 'image/png',
    profile: 'architecture',
    quality: {
      blockers: [],
      creatable: true,
      grade: 'A',
      metrics: {
        arrowCrossings: 0,
        backwardEdgeRatio: 0,
        canvasAspectRatio: 1,
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
    sceneBytes: new Uint8Array(),
    title,
    warnings: [],
  };
}

describe('AiDrawingPreviewCache', () => {
  it('keeps at most three previews and rejects cross-workspace access', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn() });
    const randomUUID = vi.mocked(crypto.randomUUID);
    randomUUID
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000004');
    const cache = new AiDrawingPreviewCache();
    const first = cache.put(drawing('1'), '/workspace', 0);
    cache.put(drawing('2'), '/workspace', 1);
    cache.put(drawing('3'), '/workspace', 2);
    const latest = cache.put(drawing('4'), '/workspace', 3);

    expect(() => cache.get(first, '/workspace', 3)).toThrow();
    expect(cache.get(latest, '/workspace', 3).title).toBe('4');
    expect(() => cache.get(latest, '/other', 3)).toThrow('其他工作区');
    vi.unstubAllGlobals();
  });

  it('expires previews after ten minutes', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000005',
    });
    const cache = new AiDrawingPreviewCache();
    const previewId = cache.put(drawing('过期'), '/workspace', 100);
    expect(() => cache.get(previewId, '/workspace', 600_100)).toThrow('过期');
    vi.unstubAllGlobals();
  });

  it('keeps blocked previews inspectable but rejects them for creation', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000006',
    });
    const cache = new AiDrawingPreviewCache();
    const blocked = drawing('待修复');
    blocked.quality = {
      ...blocked.quality,
      blockers: ['检测到箭头交叉。'],
      creatable: false,
      grade: 'C',
      score: 60,
    };
    const previewId = cache.put(blocked, '/workspace', 100);

    expect(cache.get(previewId, '/workspace', 100).title).toBe('待修复');
    expect(() => cache.getForCreate(previewId, '/workspace', 100)).toThrow(
      '质量门禁',
    );
    vi.unstubAllGlobals();
  });
});

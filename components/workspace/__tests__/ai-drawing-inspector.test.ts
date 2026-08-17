import { describe, expect, it } from 'vitest';

import {
  drawingPreviewDataUrl,
  inspectDrawingScene,
} from '../ai-drawing-inspector';
import type { DrawingDocumentDescriptor } from '../workspace-types';

const descriptor: DrawingDocumentDescriptor = {
  albumPath: '架构',
  hasBackup: false,
  hasPreview: true,
  meta: {
    createdAt: '2026-07-20T00:00:00.000Z',
    contentSha256: '1'.repeat(64),
    favorite: false,
    id: '11111111-1111-4111-8111-111111111111',
    previewRevision: 2,
    revision: 2,
    itemCount: 3,
    kind: 'whiteboard',
    schemaVersion: 2,
    searchText: '网关 服务',
    tags: [],
    title: 'Spring Cloud 架构',
    updatedAt: '2026-07-20T00:00:01.000Z',
  },
};

describe('AI drawing inspector', () => {
  it('投影文本、分组和箭头绑定且不暴露 files', () => {
    const result = JSON.parse(
      inspectDrawingScene(
        descriptor,
        JSON.stringify({
          type: 'excalidraw',
          elements: [
            {
              id: 'gateway',
              type: 'rectangle',
              x: 10.24,
              y: 20,
              width: 120,
              height: 60,
              groupIds: ['platform'],
              boundElements: [{ id: 'label', type: 'text' }],
            },
            {
              id: 'label',
              type: 'text',
              text: 'API Gateway',
              containerId: 'gateway',
            },
            {
              id: 'edge',
              type: 'arrow',
              startBinding: { elementId: 'gateway', focus: 0 },
              endBinding: { elementId: 'service', focus: 0 },
            },
          ],
          files: { secret: { dataURL: 'data:image/png;base64,secret' } },
        }),
      ),
    );

    expect(result.drawing).toMatchObject({
      id: descriptor.meta.id,
      revision: 2,
      title: 'Spring Cloud 架构',
    });
    expect(result.scene.elements).toContainEqual(
      expect.objectContaining({
        containerId: 'gateway',
        id: 'label',
        text: 'API Gateway',
      }),
    );
    expect(result.scene.elements).toContainEqual(
      expect.objectContaining({
        endBinding: { elementId: 'service' },
        startBinding: { elementId: 'gateway' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('限制复杂场景响应大小并报告截断', () => {
    const elements = Array.from({ length: 200 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text',
      text: `节点 ${index} ${'详情'.repeat(100)}`,
    }));
    const result = inspectDrawingScene(
      descriptor,
      JSON.stringify({ type: 'excalidraw', elements }),
    );

    expect(new TextEncoder().encode(result).length).toBeLessThanOrEqual(15 * 1024);
    expect(JSON.parse(result).warnings.join(' ')).toContain('仅返回前 80 个');
  });

  it('只接受 PNG 或 WebP 预览签名', () => {
    expect(
      drawingPreviewDataUrl(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toMatch(/^data:image\/png;base64,/);
    expect(() => drawingPreviewDataUrl(Uint8Array.from([1, 2, 3]))).toThrow(
      '图稿预览不是受支持的 PNG 或 WebP',
    );
  });
});

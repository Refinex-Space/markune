import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateMermaidDrawingInput } from '../ai-drawing-compiler';

const originalGetBBox = SVGElement.prototype.getBBox;

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value() {
      const text = this.textContent ?? '';
      return {
        bottom: 24,
        height: 24,
        left: 0,
        right: Math.max(40, text.length * 9),
        toJSON: () => ({}),
        top: 0,
        width: Math.max(40, text.length * 9),
        x: 0,
        y: 0,
      };
    },
  });
});

afterAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: originalGetBBox,
  });
});

describe('validateMermaidDrawingInput', () => {
  it.each([
    ['flowchart TB\nA-->B', 'flowchart'],
    ['graph LR\nA-->B', 'flowchart'],
    ['sequenceDiagram\nA->>B: 调用', 'sequence'],
    ['classDiagram\nAnimal <|-- Duck', 'class'],
    ['erDiagram\nUSER ||--o{ ORDER : places', 'er'],
    ['stateDiagram-v2\n[*] --> Ready', 'state'],
  ] as const)('accepts supported diagram %s', (definition, diagramType) => {
    expect(validateMermaidDrawingInput('技术图', definition)).toEqual({
      diagramType,
      title: '技术图',
    });
  });

  it.each([
    'pie\ntitle Invalid',
    'flowchart TB\n%%{init: {"theme":"dark"}}%%\nA-->B',
    'flowchart TB\nA[<script>alert(1)</script>]',
    'flowchart TB\nA[<div>unsafe</div>]',
    'flowchart TB\nclick A "https://example.com"',
    'flowchart TB\nA[javascript:alert(1)]',
    'flowchart TB\nA@{ img: "/local.png" }',
  ])('rejects unsupported or active content', (definition) => {
    expect(() => validateMermaidDrawingInput('不安全图稿', definition)).toThrow();
  });

  it('enforces title and source limits', () => {
    expect(() => validateMermaidDrawingInput('', 'flowchart TB\nA-->B')).toThrow();
    expect(() =>
      validateMermaidDrawingInput('超限', `flowchart TB\n${'A'.repeat(50_001)}`),
    ).toThrow('50,000');
  });

  it.each([
    [
      'Spring Cloud',
      'flowchart TB\nsubgraph 接入层\nU[用户] --> G[API Gateway]\nend\nG --> A[认证服务]\nG --> O[订单服务]\nO --> D[(数据库)]',
    ],
    [
      'Kubernetes',
      'flowchart LR\nI[Ingress] --> S[Service]\nS --> P1[Pod A]\nS --> P2[Pod B]\nP1 -. 指标 .-> M[Prometheus]',
    ],
    ['时序图', 'sequenceDiagram\n用户->>网关: 请求\n网关->>服务: 调用\n服务-->>网关: 响应'],
    ['类图', 'classDiagram\nAnimal <|-- Duck\nAnimal: +move()\nDuck: +swim()'],
    ['ER 图', 'erDiagram\nUSER ||--o{ ORDER : places\nORDER ||--|{ ITEM : contains'],
    ['状态图', 'stateDiagram-v2\n[*] --> Ready\nReady --> Running\nRunning --> Ready'],
  ])('parses %s into editable element skeletons', async (_name, definition) => {
    const { parseMermaidToExcalidraw } = await import(
      '@excalidraw/mermaid-to-excalidraw'
    );
    const result = await parseMermaidToExcalidraw(definition, {
      maxEdges: 500,
      maxTextSize: 50_000,
    });
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.files ?? {}).toEqual({});
  });
});

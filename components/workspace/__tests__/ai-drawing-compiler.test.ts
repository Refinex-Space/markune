import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  evaluateAiDrawingQuality,
  validateMermaidDrawingInput,
} from '../ai-drawing-compiler';

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

function node(id: string, x: number, y: number, text = id) {
  return {
    height: 60,
    id,
    isDeleted: false,
    type: 'rectangle',
    width: 120,
    x,
    y,
    boundElements: [{ id: `${id}-label`, type: 'text' }],
    text,
  };
}

function label(id: string, containerId: string, text = containerId) {
  return {
    containerId,
    fontSize: 18,
    height: 24,
    id,
    isDeleted: false,
    text,
    type: 'text',
    width: 80,
    x: 20,
    y: 18,
  };
}

function arrow(
  id: string,
  startId: string,
  endId: string,
  x: number,
  y: number,
  points: Array<[number, number]>,
  strokeStyle: 'dashed' | 'solid' = 'solid',
) {
  const xs = points.map(([pointX]) => pointX);
  const ys = points.map(([, pointY]) => pointY);
  return {
    endBinding: { elementId: endId },
    height: Math.max(...ys) - Math.min(...ys),
    id,
    isDeleted: false,
    points,
    startBinding: { elementId: startId },
    strokeStyle,
    type: 'arrow',
    width: Math.max(...xs) - Math.min(...xs),
    x,
    y,
  };
}

describe('evaluateAiDrawingQuality', () => {
  it('accepts a compact monotonic architecture as grade A', () => {
    const elements = [
      node('client', 200, 0),
      label('client-label', 'client'),
      node('gateway', 200, 140),
      label('gateway-label', 'gateway'),
      node('services', 200, 280),
      label('services-label', 'services'),
      node('database', 0, 420),
      label('database-label', 'database'),
      node('cache', 200, 420),
      label('cache-label', 'cache'),
      node('message', 400, 420),
      label('message-label', 'message'),
      arrow('client-gateway', 'client', 'gateway', 260, 60, [
        [0, 0],
        [0, 80],
      ]),
      arrow('gateway-services', 'gateway', 'services', 260, 200, [
        [0, 0],
        [0, 80],
      ]),
      arrow('services-database', 'services', 'database', 260, 340, [
        [0, 0],
        [-200, 80],
      ]),
      arrow('services-cache', 'services', 'cache', 260, 340, [
        [0, 0],
        [0, 80],
      ]),
      arrow('services-message', 'services', 'message', 260, 340, [
        [0, 0],
        [200, 80],
      ], 'dashed'),
    ];

    const quality = evaluateAiDrawingQuality(
      elements,
      'flowchart',
      'architecture',
      'flowchart TB',
    );

    expect(quality.grade).toBe('A');
    expect(quality.creatable).toBe(true);
    expect(quality.blockers).toEqual([]);
    expect(quality.metrics.arrowCrossings).toBe(0);
    expect(quality.metrics.edgeNodeIntersections).toBe(0);
  });

  it('grades an aggregated Spring Cloud overview from real converter geometry', async () => {
    const definition = `flowchart TB
subgraph access["访问层"]
client["Web / 移动端"]
ops["运维管理端"]
end
gateway["Spring Cloud Gateway"]
auth["认证授权服务"]
services["业务服务集群"]
platform["平台治理"]
nacos["Nacos 注册与配置"]
observe["可观测性平台"]
database["业务数据库"]
cache["Redis 缓存"]
message["消息队列"]
client --> gateway
ops --> gateway
gateway --> auth
gateway --> services
services --> database
services --> cache
services -. 事件 .-> message
services -. 治理 .-> platform
platform --> nacos
platform --> observe`;
    const { parseMermaidToExcalidraw } = await import(
      '@excalidraw/mermaid-to-excalidraw'
    );
    const parsed = await parseMermaidToExcalidraw(definition, {
      flowchart: { curve: 'linear' },
      maxEdges: 500,
      maxTextSize: 50_000,
      themeVariables: { fontSize: '18px' },
    });
    const quality = evaluateAiDrawingQuality(
      parsed.elements as unknown as readonly Record<string, unknown>[],
      'flowchart',
      'architecture',
      definition,
    );

    expect(quality.metrics.edgeCount).toBe(10);
    expect(quality.metrics.maxFanOut).toBeLessThanOrEqual(5);
    expect(quality.metrics.literalEscapedNewlineCount).toBe(0);
    expect(quality.grade).toBe('A');
    expect(quality.creatable).toBe(true);
  });

  it('rejects a real full-mesh Spring Cloud overview before creation', async () => {
    const services = ['order', 'user', 'inventory', 'payment', 'report'];
    const platforms = ['nacos', 'config', 'metrics', 'logs'];
    const definition = [
      'flowchart TB',
      'gateway["API Gateway"]',
      ...services.map((service) => `${service}["${service} service"]`),
      ...platforms.map((platform) => `${platform}["${platform}"]`),
      ...services.map((service) => `gateway --> ${service}`),
      ...services.flatMap((service) =>
        platforms.map((platform) => `${service} -.-> ${platform}`),
      ),
    ].join('\n');
    const { parseMermaidToExcalidraw } = await import(
      '@excalidraw/mermaid-to-excalidraw'
    );
    const parsed = await parseMermaidToExcalidraw(definition, {
      flowchart: { curve: 'linear' },
      maxEdges: 500,
      maxTextSize: 50_000,
      themeVariables: { fontSize: '18px' },
    });

    const quality = evaluateAiDrawingQuality(
      parsed.elements as unknown as readonly Record<string, unknown>[],
      'flowchart',
      'architecture',
      definition,
    );

    expect(quality.metrics.edgeCount).toBe(25);
    expect(quality.creatable).toBe(false);
    expect(quality.blockers.join('\n')).toContain('超过硬上限 18 条');
    expect(quality.suggestions).toContain(
      '聚合重复的服务到基础设施关系，避免逐服务连接注册、配置和可观测性节点。',
    );
  });

  it.each([
    ['sequence', 'sequenceDiagram\n用户->>网关: 请求\n网关->>服务: 调用\n服务-->>用户: 响应'],
    ['class', 'classDiagram\nAnimal <|-- Duck\nAnimal: +move()\nDuck: +swim()'],
    ['er', 'erDiagram\nUSER ||--o{ ORDER : places\nORDER ||--|{ ITEM : contains'],
    ['state', 'stateDiagram-v2\n[*] --> Ready\nReady --> Running\nRunning --> Ready'],
  ] as const)('does not apply architecture blockers to a simple %s diagram', async (diagramType, definition) => {
    const { parseMermaidToExcalidraw } = await import(
      '@excalidraw/mermaid-to-excalidraw'
    );
    const parsed = await parseMermaidToExcalidraw(definition, {
      maxEdges: 500,
      maxTextSize: 50_000,
      themeVariables: { fontSize: '18px' },
    });

    const quality = evaluateAiDrawingQuality(
      parsed.elements as unknown as readonly Record<string, unknown>[],
      diagramType,
      'default',
      definition,
    );

    expect(quality.blockers).toEqual([]);
    expect(quality.grade).toBe('A');
    expect(quality.creatable).toBe(true);
  });

  it('blocks crossings, unrelated node traversal, excessive fan-out, and escaped newlines', () => {
    const elements = [
      node('leftTop', 0, 0),
      label('leftTop-label', 'leftTop', String.raw`访问层\n客户端`),
      node('rightTop', 400, 0),
      label('rightTop-label', 'rightTop'),
      node('leftBottom', 0, 300),
      label('leftBottom-label', 'leftBottom'),
      node('rightBottom', 400, 300),
      label('rightBottom-label', 'rightBottom'),
      node('middle', 200, 140),
      label('middle-label', 'middle'),
      arrow('cross-a', 'leftTop', 'rightBottom', 120, 60, [
        [0, 0],
        [340, 270],
      ]),
      arrow('cross-b', 'rightTop', 'leftBottom', 460, 60, [
        [0, 0],
        [-340, 270],
      ]),
      ...Array.from({ length: 17 }, (_, index) =>
        arrow(
          `fan-${index}`,
          'middle',
          index % 2 === 0 ? 'leftBottom' : 'rightBottom',
          260,
          200,
          [
            [0, 0],
            [index % 2 === 0 ? -200 : 200, 100 + index],
          ],
          index % 2 === 0 ? 'dashed' : 'solid',
        ),
      ),
    ];

    const quality = evaluateAiDrawingQuality(
      elements,
      'flowchart',
      'architecture',
      'flowchart TB',
    );

    expect(quality.creatable).toBe(false);
    expect(quality.metrics.arrowCrossings).toBeGreaterThan(0);
    expect(quality.metrics.edgeNodeIntersections).toBeGreaterThan(0);
    expect(quality.metrics.maxFanOut).toBeGreaterThan(6);
    expect(quality.metrics.edgeCount).toBeGreaterThan(18);
    expect(quality.metrics.literalEscapedNewlineCount).toBe(1);
    expect(quality.blockers.join('\n')).toMatch(/交叉|穿越|关系|出度|换行/);
    expect(quality.suggestions).toContain(
      '聚合重复的服务到基础设施关系，避免逐服务连接注册、配置和可观测性节点。',
    );
  });
});

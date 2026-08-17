import { describe, expect, it } from 'vitest';

import {
  evaluateAiMindMapQuality,
  validateAiMindMapDraft,
} from '../ai-mindmap-compiler';

describe('AI mind map compiler', () => {
  it('accepts a bounded pure tree and gives it an A gate', () => {
    const draft = validateAiMindMapDraft({
      direction: 'right',
      root: {
        children: [
          { children: [{ topic: '职责' }, { topic: '边界' }], topic: '架构' },
          { children: [{ topic: '单测' }, { topic: '验收' }], topic: '质量' },
        ],
        topic: 'Agent 工程实践',
      },
      title: 'Agent 工程实践',
    });

    expect(evaluateAiMindMapQuality(draft)).toMatchObject({
      creatable: true,
      grade: 'A',
      metrics: { maxChildren: 2, maxDepth: 3, nodeCount: 7 },
    });
  });

  it('rejects model-owned fields and dangerous topic content', () => {
    expect(() =>
      validateAiMindMapDraft({
        direction: 'both',
        root: { id: 'model-id', topic: 'Root' } as never,
        title: 'Unsafe',
      }),
    ).toThrow('只接受 topic 和 children');
    expect(() =>
      validateAiMindMapDraft({
        direction: 'right',
        root: { topic: '<img src="https://example.com/a.png">' },
        title: 'Unsafe',
      }),
    ).toThrow('HTML 或 URI');
  });

  it('blocks duplicate topics and branch budgets', () => {
    const quality = evaluateAiMindMapQuality({
      direction: 'down',
      root: {
        children: Array.from({ length: 9 }, (_, index) => ({
          topic: index < 2 ? '重复' : `节点 ${index}`,
        })),
        topic: 'Root',
      },
      title: 'Over budget',
    });

    expect(quality.creatable).toBe(false);
    expect(quality.blockers.join(' ')).toContain('超过 8 个');
    expect(quality.blockers.join(' ')).toContain('重复节点内容');
  });
});

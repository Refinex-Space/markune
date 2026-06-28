import { describe, expect, it } from 'vitest';

import { computeLineDiff } from '../../rendering/ai-diff';

describe('computeLineDiff', () => {
  it('相同内容无变更', () => {
    const result = computeLineDiff('a\nb\nc', 'a\nb\nc');
    expect(result.every((line) => line.type === 'context')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('新增行', () => {
    const result = computeLineDiff('a', 'a\nb');
    expect(result).toEqual([
      { type: 'context', oldNumber: 1, newNumber: 1, content: 'a' },
      { type: 'added', oldNumber: null, newNumber: 2, content: 'b' },
    ]);
  });

  it('删除行', () => {
    const result = computeLineDiff('a\nb', 'a');
    expect(result).toEqual([
      { type: 'context', oldNumber: 1, newNumber: 1, content: 'a' },
      { type: 'removed', oldNumber: 2, newNumber: null, content: 'b' },
    ]);
  });

  it('修改行（删除+新增）', () => {
    const result = computeLineDiff('old', 'new');
    expect(result).toContainEqual({
      type: 'removed',
      oldNumber: 1,
      newNumber: null,
      content: 'old',
    });
    expect(result).toContainEqual({
      type: 'added',
      oldNumber: null,
      newNumber: 1,
      content: 'new',
    });
  });

  it('多行混合变更', () => {
    const result = computeLineDiff('a\nb\nc\nd', 'a\nx\nc\nd');
    const types = result.map((l) => l.type);
    expect(types).toContain('removed');
    expect(types).toContain('added');
    // a c d 保持 context
    expect(result.filter((l) => l.type === 'context').map((l) => l.content)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });

  it('空字符串处理', () => {
    const result = computeLineDiff('', 'a');
    expect(result).toEqual([
      { type: 'added', oldNumber: null, newNumber: 1, content: 'a' },
    ]);
  });
});

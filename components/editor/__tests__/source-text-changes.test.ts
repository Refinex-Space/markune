import { describe, expect, it } from 'vitest';
import { applySourceChanges, sourceOffsetMap } from '../source-text-changes';

describe('source text edits', () => {
  it('preserves mixed line endings outside an edited range', () => {
    const raw = '---\r\ntitle: 文档 # keep\r\n---\r\n\nBody\nNext';
    const normalized = raw.replace(/\r\n?/g, '\n');
    const start = normalized.indexOf('Body');
    expect(
      applySourceChanges(raw, [
        { from: start, to: start + 4, insert: 'Changed' },
      ]),
    ).toBe(raw.replace('Body', 'Changed'));
    expect(sourceOffsetMap(raw).toRaw(start)).toBe(raw.indexOf('Body'));
    expect(sourceOffsetMap(raw).toEditor(raw.indexOf('Body'))).toBe(start);
  });
  it('uses surrounding line endings for inserted lines and applies multiple edits correctly', () => {
    expect(
      applySourceChanges('one\r\ntwo\r\nthree', [
        { from: 0, to: 3, insert: 'A\nB' },
        { from: 8, to: 13, insert: 'C' },
      ]),
    ).toBe('A\r\nB\r\ntwo\r\nC');
  });
});

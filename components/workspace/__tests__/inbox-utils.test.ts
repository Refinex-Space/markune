import { describe, expect, it } from 'vitest';

import {
  deriveInboxCaptureTitle,
  formatInboxLocalDate,
  formatInboxLocalTime,
  getInboxActiveLane,
  parseInboxTags,
} from '../inbox-utils';

describe('Inbox utilities', () => {
  it('normalizes tags and derives a title from the first non-empty line', () => {
    expect(parseInboxTags('#Markune, idea  IDEA，产品 设计')).toEqual([
      'markune',
      'idea',
      '产品',
      '设计',
    ]);
    expect(deriveInboxCaptureTitle('\n\n## 一个还没成型的想法\n正文')).toBe(
      '一个还没成型的想法',
    );
  });

  it('derives the later lane without changing the persisted status', () => {
    const now = Date.parse('2026-07-18T08:00:00.000Z');

    expect(
      getInboxActiveLane(
        { status: 'processing', snoozedUntil: '2026-07-18T09:00:00.000Z' },
        now,
      ),
    ).toBe('later');
    expect(
      getInboxActiveLane(
        { status: 'processing', snoozedUntil: '2026-07-18T07:00:00.000Z' },
        now,
      ),
    ).toBe('processing');
    expect(
      getInboxActiveLane({ status: 'done', snoozedUntil: null }, now),
    ).toBeNull();
  });

  it('formats local Daily values', () => {
    const now = new Date(2026, 6, 18, 10, 15, 42);

    expect(formatInboxLocalDate(now)).toBe('2026-07-18');
    expect(formatInboxLocalTime(now)).toBe('10:15');
  });
});

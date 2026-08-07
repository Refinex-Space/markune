import { describe, expect, it } from 'vitest';

import {
  isDailyDocumentPath,
  toDailyExportNode,
} from '../daily-notes';
import type { DailyNoteEntry } from '../workspace-types';

const entry: DailyNoteEntry = {
  date: '2026-07-31',
  documentPath: '/workspace/Daily/2026/07/2026-07-31.md',
  excerpt: '摘要',
  hasContent: true,
  taskCompleted: 1,
  taskPreview: [],
  taskTotal: 1,
  title: '发布日',
  updatedAt: 1_722_412_800_000,
};

describe('daily-notes export helpers', () => {
  it('detects Daily document paths for relative and absolute forms', () => {
    expect(isDailyDocumentPath('Daily/2026/07/2026-07-31.md')).toBe(true);
    expect(isDailyDocumentPath('/workspace/Daily/2026/07/2026-07-31.md')).toBe(
      true,
    );
    expect(isDailyDocumentPath('Notes/readme.md')).toBe(false);
    expect(isDailyDocumentPath(null)).toBe(false);
  });

  it('builds an export node that prefers the calendar date as the file stem', () => {
    expect(toDailyExportNode(entry, '/workspace')).toEqual({
      id: entry.documentPath,
      name: '2026-07-31.md',
      kind: 'document',
      relativePath: 'Daily/2026/07/2026-07-31.md',
      absolutePath: entry.documentPath,
      title: '2026-07-31',
      updatedAt: entry.updatedAt,
    });
  });

  it('falls back to the conventional Daily relative path when root does not match', () => {
    expect(toDailyExportNode(entry, '/other-root').relativePath).toBe(
      'Daily/2026/07/2026-07-31.md',
    );
  });
});

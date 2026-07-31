import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDailyNotes } from '../use-daily-notes';
import { listDailyNotesForMonth } from '../workspace-api';
import type { DailyNoteEntry, DailyNoteMonth } from '../workspace-types';

vi.mock('../workspace-api', () => ({
  listDailyNotesForMonth: vi.fn(),
}));

const mockedListDailyNotesForMonth = vi.mocked(listDailyNotesForMonth);

function createEntry(date: string): DailyNoteEntry {
  return {
    date,
    documentPath: `/workspace/Daily/${date}.md`,
    excerpt: null,
    hasContent: true,
    taskCompleted: 0,
    taskPreview: [],
    taskTotal: 0,
    title: date,
    updatedAt: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe('useDailyNotes', () => {
  beforeEach(() => {
    mockedListDailyNotesForMonth.mockReset();
  });

  it('ignores a stale month response that resolves after the latest request', async () => {
    const july = deferred<DailyNoteMonth>();
    const august = deferred<DailyNoteMonth>();
    mockedListDailyNotesForMonth
      .mockReturnValueOnce(july.promise)
      .mockReturnValueOnce(august.promise);
    const { result } = renderHook(() =>
      useDailyNotes({ rootPath: '/workspace' }),
    );

    let julyRequest!: Promise<void>;
    let augustRequest!: Promise<void>;
    act(() => {
      julyRequest = result.current.loadMonth(new Date(2026, 6, 1));
      augustRequest = result.current.loadMonth(new Date(2026, 7, 1));
    });

    await act(async () => {
      august.resolve({ month: '2026-08', entries: [createEntry('2026-08-01')] });
      await augustRequest;
    });
    await act(async () => {
      july.resolve({ month: '2026-07', entries: [createEntry('2026-07-31')] });
      await julyRequest;
    });

    expect(result.current.entries.map((entry) => entry.date)).toEqual([
      '2026-08-01',
    ]);
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the current entries visible and exposes a retryable error', async () => {
    mockedListDailyNotesForMonth
      .mockResolvedValueOnce({
        month: '2026-07',
        entries: [createEntry('2026-07-31')],
      })
      .mockRejectedValueOnce(new Error('无法读取每日笔记'));
    const { result } = renderHook(() =>
      useDailyNotes({ rootPath: '/workspace' }),
    );

    await act(async () => {
      await result.current.loadMonth(new Date(2026, 6, 1));
    });
    await act(async () => {
      await result.current.loadMonth(new Date(2026, 6, 1));
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.error).toBe('无法读取每日笔记');
    expect(result.current.isLoading).toBe(false);
  });

  it('clears entries when the workspace root changes', async () => {
    mockedListDailyNotesForMonth.mockResolvedValueOnce({
      month: '2026-07',
      entries: [createEntry('2026-07-31')],
    });
    const { result, rerender } = renderHook(
      ({ rootPath }: { rootPath: string | null }) =>
        useDailyNotes({ rootPath }),
      { initialProps: { rootPath: '/workspace-a' } },
    );

    await act(async () => {
      await result.current.loadMonth(new Date(2026, 6, 1));
    });

    expect(result.current.entries).toHaveLength(1);

    rerender({ rootPath: '/workspace-b' });

    expect(result.current.entries).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

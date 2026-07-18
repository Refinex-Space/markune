import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInboxController } from '../use-inbox-controller';
import type { InboxCapture, InboxCaptureSummary } from '../workspace-types';
import {
  createInboxCapture,
  listInboxCaptures,
  readInboxCapture,
  updateInboxCapture,
} from '../workspace-api';

vi.mock('../workspace-api', () => ({
  appendInboxCaptureToDaily: vi.fn(),
  createInboxCapture: vi.fn(),
  deleteInboxCapture: vi.fn(),
  listInboxCaptures: vi.fn(),
  promoteInboxCapture: vi.fn(),
  readInboxCapture: vi.fn(),
  updateInboxCapture: vi.fn(),
}));

const capture: InboxCapture = {
  appendedTo: null,
  body: '初始内容',
  createdAt: '2026-07-18T06:32:05.123Z',
  id: 'cap_20260718_143205_123_a1b2c3d4',
  modifiedAt: 1,
  priority: 'normal',
  promotedTo: null,
  resolvedAt: null,
  snoozedUntil: null,
  source: 'quick-capture',
  status: 'open',
  tags: [],
  updatedAt: '2026-07-18T06:32:05.123Z',
};

const summary: InboxCaptureSummary = {
  ...capture,
  summary: '初始内容',
  title: '初始内容',
};
delete (summary as Partial<InboxCapture>).body;

describe('useInboxController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listInboxCaptures).mockResolvedValue({
      activeCount: 1,
      captures: [summary],
      issues: [],
    });
    vi.mocked(readInboxCapture).mockResolvedValue(capture);
  });

  it('serializes overlapping saves and preserves the newest editor body', async () => {
    let resolveFirstSave: ((value: InboxCapture) => void) | null = null;
    vi.mocked(updateInboxCapture)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockImplementationOnce(async (_rootPath, _id, update) => ({
        ...capture,
        ...update,
        body: update.body,
        modifiedAt: 3,
        updatedAt: '2026-07-18T06:34:05.123Z',
      }));

    const { result } = renderHook(() =>
      useInboxController({ rootPath: '/workspace' }),
    );

    await waitFor(() => expect(result.current.capture?.id).toBe(capture.id));

    act(() => result.current.updateBody('第一版'));
    let firstSave: Promise<InboxCapture | null>;
    act(() => {
      firstSave = result.current.saveCurrent();
    });
    await waitFor(() => expect(updateInboxCapture).toHaveBeenCalledTimes(1));

    act(() => result.current.updateBody('第二版'));
    let secondSave: Promise<InboxCapture | null>;
    act(() => {
      secondSave = result.current.saveCurrent();
    });

    await act(async () => {
      resolveFirstSave?.({
        ...capture,
        body: '第一版',
        modifiedAt: 2,
        updatedAt: '2026-07-18T06:33:05.123Z',
      });
      await firstSave;
    });
    await waitFor(() => expect(updateInboxCapture).toHaveBeenCalledTimes(2));

    expect(vi.mocked(updateInboxCapture).mock.calls[1]?.[2].body).toBe('第二版');
    expect(vi.mocked(updateInboxCapture).mock.calls[1]?.[3]).toBe(2);

    await act(async () => {
      await secondSave;
    });
    expect(result.current.capture?.body).toBe('第二版');
    expect(result.current.capture?.modifiedAt).toBe(3);
  });

  it('persists selected capture priority and status without restoring stale metadata', async () => {
    let storedCapture = capture;
    const toSummary = (current: InboxCapture): InboxCaptureSummary => ({
      ...summary,
      modifiedAt: current.modifiedAt,
      priority: current.priority,
      status: current.status,
      updatedAt: current.updatedAt,
    });
    vi.mocked(readInboxCapture).mockImplementation(async () => storedCapture);
    vi.mocked(listInboxCaptures).mockImplementation(async () => {
      const active =
        storedCapture.status === 'open' ||
        storedCapture.status === 'processing';
      return {
        activeCount: active ? 1 : 0,
        captures: active ? [toSummary(storedCapture)] : [],
        issues: [],
      };
    });
    vi.mocked(updateInboxCapture).mockImplementation(
      async (_rootPath, _id, update) => {
        storedCapture = {
          ...storedCapture,
          ...update,
          modifiedAt: storedCapture.modifiedAt + 1,
          updatedAt: '2026-07-18T06:35:05.123Z',
        };
        return storedCapture;
      },
    );

    const { result } = renderHook(() =>
      useInboxController({ rootPath: '/workspace' }),
    );
    await waitFor(() => expect(result.current.capture?.id).toBe(capture.id));

    await act(async () => {
      await result.current.setPriority(capture.id, 'high');
    });
    expect(vi.mocked(updateInboxCapture).mock.calls[0]?.[2].priority).toBe(
      'high',
    );
    expect(result.current.capture?.priority).toBe('high');
    expect(result.current.captures[0]?.priority).toBe('high');

    await act(async () => {
      await result.current.setStatus(capture.id, 'processing');
    });
    expect(vi.mocked(updateInboxCapture).mock.calls[1]?.[2].status).toBe(
      'processing',
    );
    expect(result.current.capture?.status).toBe('processing');
    expect(result.current.captures[0]?.status).toBe('processing');

    await act(async () => {
      await result.current.setStatus(capture.id, 'done');
    });
    expect(result.current.captures).toEqual([]);
    expect(result.current.selectedId).toBeNull();
  });

  it('selects the next archived capture after restoring one to open', async () => {
    const secondCapture: InboxCapture = {
      ...capture,
      id: 'cap_20260718_143305_123_b2c3d4e5',
      status: 'archived',
    };
    let storedCaptures: InboxCapture[] = [
      { ...capture, status: 'archived' },
      secondCapture,
    ];
    const toSummary = (current: InboxCapture): InboxCaptureSummary => {
      const item = {
        ...current,
        summary: current.body,
        title: current.body,
      } as InboxCaptureSummary & { body?: string };
      delete item.body;
      return item;
    };
    vi.mocked(listInboxCaptures).mockImplementation(
      async (_rootPath, view) => ({
        activeCount: storedCaptures.filter(
          (item) => item.status === 'open' || item.status === 'processing',
        ).length,
        captures:
          view === 'archived'
            ? storedCaptures
                .filter((item) => item.status === 'archived')
                .map(toSummary)
            : [],
        issues: [],
      }),
    );
    vi.mocked(readInboxCapture).mockImplementation(async (_rootPath, id) => {
      const item = storedCaptures.find((current) => current.id === id);
      if (!item) throw new Error('Capture 不存在');
      return item;
    });
    vi.mocked(updateInboxCapture).mockImplementation(
      async (_rootPath, id, update) => {
        const index = storedCaptures.findIndex((item) => item.id === id);
        const saved = {
          ...storedCaptures[index],
          ...update,
          modifiedAt: (storedCaptures[index]?.modifiedAt ?? 0) + 1,
        } as InboxCapture;
        storedCaptures = storedCaptures.map((item) =>
          item.id === id ? saved : item,
        );
        return saved;
      },
    );

    const { result } = renderHook(() =>
      useInboxController({ rootPath: '/workspace' }),
    );
    await act(async () => {
      await result.current.setView('archived');
    });
    await waitFor(() =>
      expect(result.current.selectedId).toBe(storedCaptures[0]?.id),
    );

    await act(async () => {
      await result.current.setStatus(storedCaptures[0]!.id, 'open');
    });

    expect(result.current.captures.map((item) => item.id)).toEqual([
      secondCapture.id,
    ]);
    expect(result.current.selectedId).toBe(secondCapture.id);
  });

  it('creates a capture from the main editor only after the draft has content', async () => {
    const created: InboxCapture = {
      ...capture,
      body: '右侧编辑的新想法',
      id: 'cap_20260718_150000_123_e5f6a7b8',
      modifiedAt: 4,
    };
    const createdSummary: InboxCaptureSummary = {
      ...summary,
      id: created.id,
      summary: created.body,
      title: created.body,
    };
    vi.mocked(createInboxCapture).mockResolvedValue(created);

    const { result } = renderHook(() =>
      useInboxController({ rootPath: '/workspace' }),
    );

    await waitFor(() => expect(result.current.capture?.id).toBe(capture.id));

    await act(async () => {
      await result.current.startNewCapture();
    });
    expect(result.current.newCaptureActive).toBe(true);
    expect(result.current.capture).toBeNull();

    await act(async () => {
      await result.current.saveCurrent();
    });
    expect(createInboxCapture).not.toHaveBeenCalled();

    vi.mocked(listInboxCaptures).mockResolvedValue({
      activeCount: 2,
      captures: [createdSummary, summary],
      issues: [],
    });
    act(() => result.current.updateNewCaptureBody(created.body));
    await act(async () => {
      await result.current.saveCurrent();
    });

    expect(createInboxCapture).toHaveBeenCalledWith(
      '/workspace',
      created.body,
      [],
      'quick-capture',
    );
    expect(result.current.newCaptureActive).toBe(false);
    expect(result.current.capture?.id).toBe(created.id);
    expect(result.current.saveState).toBe('saved');
  });

  it('discards an empty main-editor draft when selecting an existing capture', async () => {
    const { result } = renderHook(() =>
      useInboxController({ rootPath: '/workspace' }),
    );

    await waitFor(() => expect(result.current.capture?.id).toBe(capture.id));
    await act(async () => {
      await result.current.startNewCapture();
    });
    await waitFor(() => expect(result.current.newCaptureActive).toBe(true));
    await act(async () => {
      await result.current.selectCapture(capture.id);
    });

    expect(createInboxCapture).not.toHaveBeenCalled();
    expect(result.current.newCaptureActive).toBe(false);
    await waitFor(() => expect(result.current.capture?.id).toBe(capture.id));
  });
});

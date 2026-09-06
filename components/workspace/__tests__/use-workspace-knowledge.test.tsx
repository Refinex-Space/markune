import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspaceKnowledge } from '../use-workspace-knowledge';
import { loadWorkspaceIndex, loadDrawingLibrary } from '../workspace-api';
vi.mock('../workspace-api', () => ({
  loadWorkspaceIndex: vi.fn(),
  loadDrawingLibrary: vi.fn(),
}));
const doc = (path: string, content: string) => ({
  relativePath: path,
  name: path,
  title: path,
  content,
  fingerprint: content,
  modifiedAt: 0,
  properties: {},
  tags: [],
  links: [],
  tasks: [],
  resources: [],
  errors: [],
});
const page = (
  documents = [doc('a.md', 'alpha')],
  extra: Record<string, unknown> = {},
) => ({
  revision: 1,
  reset: true,
  documents,
  removed: [],
  warnings: [],
  total: documents.length,
  nextCursor: null,
  ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadDrawingLibrary).mockResolvedValue({ drawings: [] } as never);
});

it('pages and applies deltas without dropping unchanged search content', async () => {
  vi.mocked(loadWorkspaceIndex)
    .mockResolvedValueOnce(
      page([doc('a.md', 'alpha')], { nextCursor: 1, total: 2 }),
    )
    .mockResolvedValueOnce(page([doc('b.md', 'beta')], { total: 2 }))
    .mockResolvedValueOnce(
      page([doc('b.md', 'updated')], {
        reset: false,
        revision: 2,
        removed: ['a.md'],
      }),
    );
  const { result } = renderHook(() => useWorkspaceKnowledge('/root', 0, true));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.documents).toHaveLength(2);
  expect(result.current.documents[0]).not.toHaveProperty('content');
  expect((await result.current.search('alpha'))[0].document.relativePath).toBe(
    'a.md',
  );
  await act(() => result.current.refresh());
  expect(
    result.current.documents.map((document) => document.relativePath),
  ).toEqual(['b.md']);
  expect(await result.current.search('alpha')).toEqual([]);
  expect(await result.current.search('beta')).toEqual([]);
  expect((await result.current.search('updated'))[0].document.content).toBe('');
  expect(loadWorkspaceIndex).toHaveBeenLastCalledWith(
    '/root',
    expect.objectContaining({ sinceRevision: 1 }),
  );
});

it('does not expose partially loaded search results and retries a failed page from a full snapshot', async () => {
  vi.mocked(loadWorkspaceIndex)
    .mockResolvedValueOnce(page())
    .mockResolvedValueOnce(
      page([doc('b.md', 'partial')], {
        reset: false,
        revision: 2,
        nextCursor: 1,
      }),
    )
    .mockRejectedValueOnce(new Error('page expired'))
    .mockResolvedValueOnce(page([doc('c.md', 'recovered')], { revision: 3 }));
  const { result } = renderHook(() => useWorkspaceKnowledge('/root', 0, true));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(() => result.current.refresh());
  expect(result.current.status).toBe('error');
  expect(result.current.documents[0].relativePath).toBe('a.md');
  expect(await result.current.search('partial')).toEqual([]);
  await act(() => result.current.refresh());
  expect(loadWorkspaceIndex).toHaveBeenLastCalledWith(
    '/root',
    expect.objectContaining({ sinceRevision: undefined }),
  );
  expect(result.current.status).toBe('ready');
  expect(
    (await result.current.search('recovered'))[0].document.relativePath,
  ).toBe('c.md');
});

it('discards late pages and search calls from a previous workspace', async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  vi.mocked(loadWorkspaceIndex)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce(page([doc('new.md', 'new workspace')]));
  const { result, rerender } = renderHook(
    ({ root }) => useWorkspaceKnowledge(root, 0, true),
    { initialProps: { root: '/old' } },
  );
  const oldSearch = result.current.search;
  await waitFor(() => expect(loadWorkspaceIndex).toHaveBeenCalledTimes(1));
  rerender({ root: '/new' });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => resolve(page([doc('old.md', 'old workspace')])));
  expect(
    result.current.documents.map((document) => document.relativePath),
  ).toEqual(['new.md']);
  expect(await oldSearch('new')).toEqual([]);
});

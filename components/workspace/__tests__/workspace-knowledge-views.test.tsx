import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceKnowledgeViews } from '../workspace-knowledge-views';
import type { WorkspaceKnowledge } from '../use-workspace-knowledge';
import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';
import { readMarkdownDocument, readWorkspaceViews, saveMarkdownDocument, saveWorkspaceViews } from '../workspace-api';
vi.mock('../workspace-api', () => ({ readMarkdownDocument: vi.fn(), readWorkspaceViews: vi.fn(), saveMarkdownDocument: vi.fn(), saveWorkspaceViews: vi.fn(), setWorkspaceTaskChecked: vi.fn() }));
const note = { relativePath: 'a.md', name: 'a.md', title: 'A', modifiedAt: 1, properties: { tags: ['one'] }, tags: ['one'], fingerprint: 'hash', links: [], tasks: [], resources: [], errors: [] };
const knowledge = { documents: [note], status: 'ready', warnings: [], error: null, revision: 1, refresh: vi.fn(async () => {}), search: vi.fn() } as unknown as WorkspaceKnowledge;
const show = (next = knowledge) => render(<WorkspaceKnowledgeViews rootPath="/root" knowledge={next} onOpen={vi.fn()} onRefresh={vi.fn()} isReadOnly={() => false} />);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(readWorkspaceViews).mockResolvedValue({ views: [], fingerprint: '' }); vi.mocked(saveMarkdownDocument).mockResolvedValue({ modifiedAt: 2 } as never); });

it('writes only the selected property, preserves collection comments and supplies expected original content', async () => {
  const original = '---\r\n# header\r\ntags:\r\n  - one # retain\r\ncustom: {owner: team}\r\n---\r\nBody\r\n';
  vi.mocked(readMarkdownDocument).mockResolvedValue({ content: original, modifiedAt: 1 }); show();
  fireEvent.click(screen.getByRole('button', { name: 'one', exact: true }));
  fireEvent.change(await screen.findByLabelText('属性值'), { target: { value: 'one\ntwo' } });
  fireEvent.click(screen.getByRole('button', { name: '保存属性' }));
  await waitFor(() => expect(saveMarkdownDocument).toHaveBeenCalledTimes(1));
  const args = vi.mocked(saveMarkdownDocument).mock.calls[0];
  expect(args[4]).toBe(original); expect(args[2]).toContain('# retain'); expect(args[2]).toContain('custom: {owner: team}\r\n');
  expect(parseFrontmatter(args[2]).properties.tags).toEqual(['one', 'two']);
});

it('an explicit property edit can add frontmatter without rewriting an existing body or BOM', async () => {
  const original = '\ufeff    code\r\nPlain\r\n';
  vi.mocked(readMarkdownDocument).mockResolvedValue({ content: original, modifiedAt: 1 });
  show({ ...knowledge, documents: [{ ...note, properties: {} }] } as WorkspaceKnowledge);
  fireEvent.click(screen.getByRole('button', { name: '—', exact: true }));
  fireEvent.change(await screen.findByLabelText('属性值'), { target: { value: 'test' } });
  fireEvent.click(screen.getByRole('button', { name: '保存属性' }));
  await waitFor(() => expect(saveMarkdownDocument).toHaveBeenCalledTimes(1));
  const saved = vi.mocked(saveMarkdownDocument).mock.calls[0][2]; expect(saved.startsWith('\ufeff---')).toBe(true); expect(parseFrontmatter(saved).body).toBe(original.slice(1));
});

it('removing a saved view sends only the updated view configuration', async () => {
  const view = { id: 'v1', name: 'Research', query: 'tag:research', columns: ['title'], sortBy: 'title', descending: false, groupBy: null };
  vi.mocked(readWorkspaceViews).mockResolvedValue({ views: [view], fingerprint: 'previous' }); vi.mocked(saveWorkspaceViews).mockResolvedValue({ views: [], fingerprint: 'next' }); show();
  await screen.findByRole('option', { name: 'Research' });
  fireEvent.change(screen.getByLabelText('已保存视图'), { target: { value: 'v1' } });
  fireEvent.click(screen.getByLabelText('删除当前保存视图'));
  await waitFor(() => expect(saveWorkspaceViews).toHaveBeenCalledWith('/root', [], 'previous'));
  expect(saveMarkdownDocument).not.toHaveBeenCalled();
});

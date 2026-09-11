import * as React from 'react';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentRelationsPanel } from '../document-relations-panel';
import { findWorkspaceMentions } from '../workspace-api';
import type { WorkspaceKnowledge } from '../use-workspace-knowledge';
import type { KnowledgeDocumentSummary } from '../workspace-knowledge-types';

vi.mock('../workspace-api', () => ({ findWorkspaceMentions: vi.fn() }));
const makeDocument = (
  relativePath: string,
  title: string,
): KnowledgeDocumentSummary => ({
  relativePath,
  title,
  name: relativePath.split('/').pop()!,
  fingerprint: 'sample',
  modifiedAt: 0,
  properties: {},
  tags: [],
  links: [],
  tasks: [],
  resources: [],
  errors: [],
});
const source = makeDocument('notes/practice.md', '技术团队的 Agent 实践');
const target = makeDocument('reference/SQL 命令.md', 'SQL 命令');
const link = {
  targetPath: target.relativePath,
  unresolved: null,
  href: '../reference/SQL%20%E5%91%BD%E4%BB%A4.md#intro',
  line: 12,
  context: '[SQL 命令](../reference/SQL%20%E5%91%BD%E4%BB%A4',
};
let knowledge: WorkspaceKnowledge;
beforeEach(() => {
  vi.resetAllMocks();
  knowledge = {
    rootPath: '/vault',
    revision: 1,
    documents: [{ ...source, links: [link] }, target],
    warnings: [],
    status: 'ready',
    error: null,
    indexed: 2,
    total: 2,
    refresh: vi.fn().mockResolvedValue(undefined),
    search: vi
      .fn()
      .mockResolvedValue([{ document: { ...target, kind: 'document' } }]),
  };
  vi.mocked(findWorkspaceMentions).mockResolvedValue([
    { relativePath: target.relativePath, line: 8, context: '# SQL 命令' },
  ]);
});
afterEach(cleanup);
const mount = (path = source.relativePath, onOpen = vi.fn()) =>
  render(
    <DocumentRelationsPanel
      path={path}
      rootPath="/vault"
      knowledge={knowledge}
      onOpen={onOpen}
    />,
  );

describe('document relations', () => {
  it('shows the target title without paths, encoded URLs, or duplicate excerpts and preserves the anchor', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(source.relativePath, onOpen);
    await user.click(screen.getByRole('tab', { name: '出链 1' }));
    const item = screen.getByRole('button', { name: 'SQL 命令' });
    expect(item.textContent).toBe('SQL 命令');
    expect(item.title).toContain(target.relativePath);
    expect(screen.queryByText(/%E5|reference\//)).toBeNull();
    await user.click(item);
    expect(onOpen).toHaveBeenCalledWith({
      relativePath: target.relativePath,
      hash: 'intro',
    });
  });
  it('keeps incoming context and source line navigation', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(target.relativePath, onOpen);
    await user.click(
      screen.getByRole('button', {
        name: /技术团队的 Agent 实践 SQL 命令 第 12 行/,
      }),
    );
    expect(onOpen).toHaveBeenCalledWith({
      relativePath: source.relativePath,
      line: 12,
    });
  });
  it('shows mention titles and removes the implementation explanation and heading markup', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(source.relativePath, onOpen);
    await user.click(screen.getByRole('tab', { name: '未链接提及' }));
    await user.click(
      await screen.findByRole('button', { name: 'SQL 命令 第 8 行' }),
    );
    expect(screen.queryByText(/按文件名|候选提及|reference\//)).toBeNull();
    expect(
      within(screen.getByRole('tablist').parentElement!).queryByRole('button'),
    ).toBeNull();
    expect(onOpen).toHaveBeenCalledWith({
      relativePath: target.relativePath,
      line: 8,
    });
  });
  it('qualifies duplicate titles with a folder name instead of a full path', async () => {
    knowledge.documents.push(makeDocument('archive/SQL 命令.md', 'SQL 命令'));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: '出链 1' }));
    expect(
      screen.getByRole('button', { name: 'SQL 命令 reference' }),
    ).toBeTruthy();
  });
  it('uses manual keyboard activation so moving focus does not start a search', async () => {
    const user = userEvent.setup();
    mount();
    screen.getByRole('tab', { name: '入链 0' }).focus();
    await user.keyboard('{End}');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('tab', { name: '未链接提及' }),
      ),
    );
    expect(knowledge.search).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: 'SQL 命令 第 8 行' });
    expect(knowledge.search).toHaveBeenCalledTimes(1);
  });
  it('keeps other tabs usable during a pending search and prevents duplicate requests', async () => {
    let finish!: (
      value: Awaited<ReturnType<WorkspaceKnowledge['search']>>,
    ) => void;
    vi.mocked(knowledge.search).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: '未链接提及' }));
    expect(screen.queryByRole('button', { name: '重新查找提及' })).toBeNull();
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true');
    await user.click(screen.getByRole('tab', { name: '出链 1' }));
    expect(screen.getByRole('button', { name: 'SQL 命令' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '未链接提及' }));
    expect(knowledge.search).toHaveBeenCalledTimes(1);
    await act(async () => finish([]));
    expect(screen.getByText('未发现未链接提及')).toBeTruthy();
  });
  it('offers retry without exposing raw errors or paths', async () => {
    vi.mocked(findWorkspaceMentions).mockRejectedValueOnce(
      new Error('/private/secret/path'),
    );
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: '未链接提及' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      '提及查找失败',
    );
    expect(
      screen
        .getByRole('button', { name: '重试查找提及' })
        .closest('.relations-toolbar'),
    ).toBeNull();
    expect(screen.queryByText(/private|secret/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '重试查找提及' }));
    await screen.findByRole('button', { name: 'SQL 命令 第 8 行' });
  });
  it('discards candidate work after switching documents', async () => {
    let finish!: (
      value: Awaited<ReturnType<WorkspaceKnowledge['search']>>,
    ) => void;
    vi.mocked(knowledge.search).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { rerender } = mount();
    await user.click(screen.getByRole('tab', { name: '未链接提及' }));
    rerender(
      <DocumentRelationsPanel
        path={target.relativePath}
        rootPath="/vault"
        knowledge={knowledge}
        onOpen={vi.fn()}
      />,
    );
    await act(async () =>
      finish([{ document: { ...source, kind: 'document' } }] as never),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole('tab', { name: '入链 1' })
          .getAttribute('aria-selected'),
      ).toBe('true'),
    );
    expect(findWorkspaceMentions).not.toHaveBeenCalled();
  });
  it('opens unresolved references at their source location', async () => {
    knowledge.documents[0] = {
      ...source,
      links: [
        {
          ...link,
          targetPath: null,
          href: 'notes/missing.md',
          context: '[失效笔记](notes/missing.md)',
        },
      ],
    };
    const user = userEvent.setup();
    const onOpen = vi.fn();
    mount(source.relativePath, onOpen);
    await user.click(screen.getByRole('tab', { name: '出链 1' }));
    await user.click(
      screen.getByRole('button', {
        name: /missing 失效笔记 未解析引用 第 12 行/,
      }),
    );
    expect(onOpen).toHaveBeenCalledWith({
      relativePath: source.relativePath,
      line: 12,
    });
  });
});

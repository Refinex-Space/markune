import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadWorkspaceGraph } from '../workspace-api';
import { WorkspaceGraphPage } from '../workspace-graph-page';
import type { WorkspaceNode } from '../workspace-types';

vi.mock('../workspace-api', () => ({
  loadWorkspaceGraph: vi.fn(),
}));

vi.mock('../workspace-graph-canvas', () => ({
  WorkspaceGraphCanvas: ({ onSelectNode }: { onSelectNode: (id: string) => void }) => (
    <button data-testid="workspace-graph-canvas" onClick={() => onSelectNode('alpha.md')}>
      canvas
    </button>
  ),
}));

const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  });
});

const documentNode: WorkspaceNode = {
  absolutePath: '/workspace/alpha.md',
  children: [],
  createdAt: 0,
  id: 'alpha.md',
  kind: 'document',
  name: 'alpha.md',
  relativePath: 'alpha.md',
  title: 'Alpha',
  updatedAt: 0,
};

describe('WorkspaceGraphPage', () => {
  it('opens daily documents and explains unresolved targets without offering a false open action', async () => {
    const daily: WorkspaceNode = { ...documentNode, id: 'Daily/today.md', name: 'today.md', title: 'Today', absolutePath: '/daily/Daily/today.md', relativePath: 'Daily/today.md' };
    vi.mocked(loadWorkspaceGraph).mockResolvedValue({
      documentCount: 1, warnings: [],
      nodes: [
        { id: 'file:Daily/today.md', label: 'Today', kind: 'daily', relativePath: 'Daily/today.md', degree: 1 },
        { id: 'unresolved:wiki:missing', label: 'Missing', kind: 'unresolved', relativePath: null, degree: 1 },
      ],
      edges: [{ id: 'link', kind: 'link', source: 'file:Daily/today.md', target: 'unresolved:wiki:missing', weight: 2 }],
    });
    const onOpenNode = vi.fn();
    const user = userEvent.setup();
    render(<WorkspaceGraphPage nodes={[daily]} rootPath="/daily" onOpenNode={onOpenNode} />);
    await screen.findByTestId('workspace-graph-canvas');
    await user.type(screen.getByRole('searchbox', { name: '搜索图谱' }), 'Today');
    await user.click(screen.getByRole('button', { name: /Today\s*Daily\/today.md/ }));
    await user.click(screen.getByRole('button', { name: '打开文档' }));
    expect(onOpenNode).toHaveBeenCalledWith(daily);
    await user.click(screen.getByRole('button', { name: /Missing.*引用此节点/ }));
    expect(screen.getByText('目标缺失、重名或尚未索引。请从相邻文档检查原始引用。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文档' })).toBeNull();
  });

  it('loads the graph, searches nodes, previews a node, and opens its document', async () => {
    vi.mocked(loadWorkspaceGraph).mockResolvedValue({
      documentCount: 1,
      warnings: [],
      nodes: [
        {
          degree: 1,
          id: 'alpha.md',
          kind: 'note',
          label: 'Alpha',
          relativePath: 'alpha.md',
        },
        {
          degree: 1,
          id: 'tag:rust',
          kind: 'tag',
          label: 'Rust',
          relativePath: null,
        },
      ],
      edges: [
        {
          id: 'edge:0',
          kind: 'tag',
          source: 'alpha.md',
          target: 'tag:rust',
          weight: 1,
        },
      ],
    });
    const onOpenNode = vi.fn();
    const user = userEvent.setup();

    render(
      <WorkspaceGraphPage
        nodes={[documentNode]}
        rootPath="/workspace"
        onOpenNode={onOpenNode}
      />,
    );

    await screen.findByTestId('workspace-graph-canvas');
    expect(screen.getByText('2 个节点 · 1 条关系')).toBeTruthy();

    for (const label of ['适应图谱视图', '图谱设置', '刷新图谱']) {
      const button = screen.getByRole('button', { name: label });
      button.focus();
      await waitFor(() =>
        expect(
          [...document.querySelectorAll('[data-slot="tooltip-content"]')].some(
            (tooltip) => tooltip.textContent?.includes(label),
          ),
        ).toBe(true),
      );
      button.blur();
    }

    await user.click(screen.getByRole('button', { name: '图谱设置' }));
    expect(
      screen.getByText('显示节点').closest('[data-slot="popover-content"]')?.className,
    ).toContain('shadow-none');
    await user.click(screen.getByRole('button', { name: '图谱设置' }));

    await user.type(screen.getByRole('searchbox', { name: '搜索图谱' }), 'rust');
    expect(screen.getByText('Rust')).toBeTruthy();

    await user.click(screen.getByTestId('workspace-graph-canvas'));
    expect(screen.getByText('alpha.md')).toBeTruthy();
    expect(screen.getByText('alpha.md').closest('aside')?.className).not.toContain(
      'shadow',
    );
    await user.click(screen.getByRole('button', { name: '打开文档' }));

    await waitFor(() => expect(onOpenNode).toHaveBeenCalledWith(documentNode));
  });
});

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

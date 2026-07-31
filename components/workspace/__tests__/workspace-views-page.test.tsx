import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceViewsPage } from '../workspace-views-page';
import type { WorkspaceNode } from '../workspace-types';

const documentNode: WorkspaceNode = {
  absolutePath: '/workspace/笔记.md',
  children: [],
  createdAt: 0,
  id: 'note-1',
  kind: 'document',
  name: '笔记.md',
  relativePath: '笔记.md',
  title: '笔记',
  updatedAt: 0,
};

describe('WorkspaceViewsPage', () => {
  it('在 macOS 下与侧边栏标题区共享工具行和底边基线', () => {
    render(
      <WorkspaceViewsPage
        nodes={[documentNode]}
        onOpenNode={vi.fn()}
        onRefresh={vi.fn()}
        sidebarHeaderOffset={-6}
        onToggleLocked={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    );

    const page = screen.getByTestId('workspace-views-page');
    const header = page.querySelector('header');
    const titleGroup = screen.getByRole('heading', { name: '视图' }).parentElement;
    const toolbar = screen.getByRole('button', { name: '刷新视图' }).parentElement;

    expect(header?.style.height).toBe('44px');
    expect(header?.style.marginTop).toBe('-6px');
    expect(header?.className).toContain('pb-2');
    expect(titleGroup?.className).toContain('h-9');
    expect(toolbar?.className).toContain('h-9');
  });
});

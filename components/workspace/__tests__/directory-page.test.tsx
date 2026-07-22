import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DirectoryPage } from '../directory-page';
import type { WorkspaceNode } from '../workspace-types';

describe('DirectoryPage', () => {
  it('renders child directories as compact navigation cards without document previews', () => {
    const longTitle =
      '编辑或新增 settings.json 文件并为不同平台配置很长很长的环境变量说明';
    const directory: WorkspaceNode = {
      id: 'root',
      name: 'Spring AI（Hollis）',
      kind: 'directory',
      relativePath: 'Spring AI（Hollis）',
      absolutePath: '/repo/Spring AI（Hollis）',
      children: [
        {
          id: 'skills',
          name: '13_Skills',
          kind: 'directory',
          relativePath: 'Spring AI（Hollis）/13_Skills',
          absolutePath: '/repo/Spring AI（Hollis）/13_Skills',
          children: [
            {
              id: 'settings',
              name: 'settings.md',
              kind: 'document',
              relativePath: 'Spring AI（Hollis）/13_Skills/settings.md',
              absolutePath: '/repo/Spring AI（Hollis）/13_Skills/settings.md',
              title: longTitle,
            },
          ],
        },
      ],
    };

    render(
      <DirectoryPage
        directory={directory}
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    const card = screen.getByRole('button', {
      name: '打开目录 13_Skills',
    });

    expect(card.className).toContain('min-h-[72px]');
    expect(card.className).toContain('min-w-0');
    expect(card.className).toContain('max-w-full');
    expect(card.className).toContain('overflow-hidden');
    expect(screen.queryByText(longTitle)).toBeNull();
    expect(screen.queryByRole('heading', { name: '文档' })).toBeNull();
  });

  it('renders direct documents as compact summary cards', () => {
    const directory: WorkspaceNode = {
      id: 'root',
      name: '01_大模型概述',
      kind: 'directory',
      relativePath: '01_大模型概述',
      absolutePath: '/repo/01_大模型概述',
      children: [
        {
          id: 'hello-world',
          name: 'hello-world.md',
          kind: 'document',
          relativePath: '01_大模型概述/hello-world.md',
          absolutePath: '/repo/01_大模型概述/hello-world.md',
          title: 'LLM HelloWorld',
        },
      ],
    };

    const { container } = render(
      <DirectoryPage
        directory={directory}
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    const card = screen.getByRole('button', {
      name: '打开文档 LLM HelloWorld',
    });
    const searchInput = screen.getByRole('textbox', {
      name: '搜索当前目录下的文档',
    });
    const gridViewButton = screen.getByRole('button', { name: '网格视图' });
    const controlRow = searchInput.parentElement?.parentElement;

    expect(card.className).toContain('min-h-[112px]');
    expect(card.className).toContain('rounded-lg');
    expect(card.className).not.toContain('rounded-2xl');
    expect(gridViewButton.className).not.toContain('shadow-sm');
    expect(searchInput.closest('header')?.contains(gridViewButton)).toBe(true);
    expect(controlRow?.className).toContain('w-full');
    expect(controlRow?.className).toContain('justify-between');
    expect(screen.queryByText(/当前目录 · 更新/u)).toBeNull();
    expect(container.querySelector('.max-w-6xl')).not.toBeNull();
    expect(container.querySelector('.max-w-7xl')).toBeNull();
    expect(container.querySelector('.xl\\:grid-cols-4')).not.toBeNull();
    expect(container.querySelector('.h-52')).toBeNull();
  });

  it('removes redundant directory metadata and the idle empty state', () => {
    const directory: WorkspaceNode = {
      id: 'empty-directory',
      name: 'Spring AI（Hollis）',
      kind: 'directory',
      relativePath: '框架生态/Spring AI（Hollis）',
      absolutePath: '/repo/框架生态/Spring AI（Hollis）',
      children: [],
    };

    const { container } = render(
      <DirectoryPage
        directory={directory}
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    expect(screen.queryByText('框架生态')).toBeNull();
    expect(screen.queryByText('层级')).toBeNull();
    expect(screen.queryByText(/\d+ 项/u)).toBeNull();
    expect(screen.queryByText('这个目录还没有文档')).toBeNull();
    expect(
      screen.queryByText('可以从左侧目录菜单中新建或导入文档。'),
    ).toBeNull();
    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('renders list rows without a document thumbnail column', () => {
    const directory: WorkspaceNode = {
      id: 'root',
      name: '01_大模型概述',
      kind: 'directory',
      relativePath: '01_大模型概述',
      absolutePath: '/repo/01_大模型概述',
      children: [
        {
          id: 'hello-world',
          name: 'hello-world.md',
          kind: 'document',
          relativePath: '01_大模型概述/hello-world.md',
          absolutePath: '/repo/01_大模型概述/hello-world.md',
          title: 'LLM HelloWorld',
        },
      ],
    };

    const { container } = render(
      <DirectoryPage
        directory={directory}
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '列表视图' }));

    expect(screen.getByText('名称')).not.toBeNull();
    expect(screen.getByText('LLM HelloWorld')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '打开文档 LLM HelloWorld' })
        .className,
    ).toContain('py-2.5');
    expect(container.querySelector('.w-\\[50px\\]')).toBeNull();

    fireEvent.change(
      screen.getByRole('textbox', { name: '搜索当前目录下的文档' }),
      { target: { value: '不存在' } },
    );

    expect(screen.getByText('没有找到“不存在”')).not.toBeNull();
    expect(screen.queryByText('没有找到“${query.trim()}”')).toBeNull();
  });
});

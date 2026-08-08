import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DirectoryPage } from '../directory-page';
import type { WorkspaceNode } from '../workspace-types';

describe('DirectoryPage', () => {
  it('renders the workspace overview as a Craft-inspired root folder grid', () => {
    const onSelectDirectory = vi.fn();
    const directory: WorkspaceNode = {
      id: 'workspace-root',
      name: '文件夹',
      kind: 'directory',
      relativePath: '',
      absolutePath: '/repo',
      children: [
        {
          id: 'projects',
          name: '项目合集',
          kind: 'directory',
          relativePath: '项目合集',
          absolutePath: '/repo/项目合集',
          children: [
            {
              id: 'project-note',
              name: 'overview.md',
              kind: 'document',
              relativePath: '项目合集/overview.md',
              absolutePath: '/repo/项目合集/overview.md',
            },
            {
              id: 'attachments',
              name: '.attachments',
              kind: 'directory',
              relativePath: '项目合集/.attachments',
              absolutePath: '/repo/项目合集/.attachments',
              children: [
                {
                  id: 'private-note',
                  name: 'private.md',
                  kind: 'document',
                  relativePath: '项目合集/.attachments/private.md',
                  absolutePath: '/repo/项目合集/.attachments/private.md',
                  title: '隐藏目录中的文档',
                },
              ],
            },
          ],
        },
        {
          id: 'octarine',
          name: '.octarine',
          kind: 'directory',
          relativePath: '.octarine',
          absolutePath: '/repo/.octarine',
          children: [],
        },
      ],
    };

    render(
      <DirectoryPage
        directory={directory}
        variant="workspace-overview"
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={onSelectDirectory}
      />,
    );

    const card = screen.getByRole('button', { name: '打开目录 项目合集' });

    expect(screen.getByRole('heading', { name: '文件夹' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '工作区' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '搜索工作区文档' })).toBeTruthy();
    expect(screen.getByText('1 个项目')).toBeTruthy();
    expect(screen.queryByText('.octarine')).toBeNull();
    expect(
      screen.queryByRole('button', { name: '打开目录 .octarine' }),
    ).toBeNull();
    expect(card.className).toContain('min-h-44');
    expect(
      screen.getByRole('heading', { name: '工作区' }).nextElementSibling
        ?.className,
    ).toContain('grid-cols-[repeat(auto-fill,minmax(180px,220px))]');

    fireEvent.click(card);
    expect(onSelectDirectory).toHaveBeenCalledWith(directory.children?.[0]);

    fireEvent.change(screen.getByRole('textbox', { name: '搜索工作区文档' }), {
      target: { value: '隐藏目录中的文档' },
    });

    expect(screen.queryByText('隐藏目录中的文档')).toBeNull();
    expect(screen.getByText('没有找到“隐藏目录中的文档”')).toBeTruthy();
  });

  it('renders pinned folders and documents without duplicate search results', () => {
    const pinnedDocument: WorkspaceNode = {
      id: 'pinned-note',
      name: 'pinned.md',
      kind: 'document',
      relativePath: '项目合集/pinned.md',
      absolutePath: '/repo/项目合集/pinned.md',
      title: '置顶文档',
      pinned: true,
    };
    const pinnedDirectory: WorkspaceNode = {
      id: 'pinned-directory',
      name: '项目合集',
      kind: 'directory',
      relativePath: '项目合集',
      absolutePath: '/repo/项目合集',
      children: [pinnedDocument],
      pinned: true,
    };
    const directory: WorkspaceNode = {
      id: 'pinned-root',
      name: '置顶',
      kind: 'directory',
      relativePath: '',
      absolutePath: '/repo',
      children: [pinnedDirectory, pinnedDocument],
    };

    render(
      <DirectoryPage
        directory={directory}
        variant="pinned-overview"
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '置顶' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '置顶目录' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: '置顶文档' }),
    ).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '搜索置顶内容' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '打开目录 项目合集' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '打开文档 置顶文档' }),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: '搜索置顶内容' }), {
      target: { value: '置顶文档' },
    });

    expect(
      screen.getAllByRole('button', { name: '打开文档 置顶文档' }),
    ).toHaveLength(1);
  });

  it('renders an empty state for a workspace without pinned content', () => {
    render(
      <DirectoryPage
        directory={{
          id: 'pinned-root',
          name: '置顶',
          kind: 'directory',
          relativePath: '',
          absolutePath: '/repo',
          children: [],
        }}
        variant="pinned-overview"
        workspaceRootPath="/repo"
        onOpenDocument={vi.fn()}
        onSelectDirectory={vi.fn()}
      />,
    );

    expect(screen.getByText('暂无置顶内容')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

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

    expect(card.className).toContain('rounded-2xl');
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

    expect(card.className).toContain('min-h-[240px]');
    expect(card.className).toContain('rounded-2xl');
    expect(gridViewButton.className).toContain('shadow-sm');
    expect(searchInput.closest('header')?.contains(gridViewButton)).toBe(true);
    expect(controlRow?.className).toContain('flex items-center gap-2');
    expect(screen.queryByText(/当前目录 · 更新/u)).toBeNull();
    expect(container.querySelector('.max-w-5xl')).not.toBeNull();
    expect(container.querySelector('.max-w-7xl')).toBeNull();
    expect(container.querySelector('.lg\\:grid-cols-3')).toBeNull();
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

    expect(screen.getByText('LLM HelloWorld')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: '打开文档 LLM HelloWorld' })
        .className,
    ).toContain('py-3');
    expect(container.querySelector('.w-\\[50px\\]')).toBeNull();

    fireEvent.change(
      screen.getByRole('textbox', { name: '搜索当前目录下的文档' }),
      { target: { value: '不存在' } },
    );

    expect(screen.getByText('没有找到“不存在”')).not.toBeNull();
    expect(screen.queryByText('没有找到“${query.trim()}”')).toBeNull();
  });
});

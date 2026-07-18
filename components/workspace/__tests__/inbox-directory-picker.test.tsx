import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import { InboxDirectoryPicker } from '../inbox-directory-picker';
import type { WorkspaceNode } from '../workspace-types';

const globalsCssPath = join(process.cwd(), 'app/globals.css');

const nodes: WorkspaceNode[] = [
  {
    absolutePath: '/workspace/技术随笔',
    children: [
      {
        absolutePath: '/workspace/技术随笔/Spring AI',
        children: [
          {
            absolutePath: '/workspace/技术随笔/Spring AI/Agent',
            children: [],
            id: 'agent',
            kind: 'directory',
            name: 'Agent',
            relativePath: '技术随笔/Spring AI/Agent',
          },
        ],
        id: 'spring-ai',
        kind: 'directory',
        name: 'Spring AI',
        relativePath: '技术随笔/Spring AI',
      },
    ],
    id: 'notes',
    kind: 'directory',
    name: '技术随笔',
    relativePath: '技术随笔',
  },
  {
    absolutePath: '/workspace/Daily',
    children: [],
    id: 'daily',
    kind: 'directory',
    name: 'Daily',
    relativePath: 'Daily',
  },
  {
    absolutePath: '/workspace/.private',
    children: [],
    id: 'private',
    kind: 'directory',
    name: '.private',
    relativePath: '.private',
  },
];

describe('InboxDirectoryPicker', () => {
  it('expands the directory hierarchy and selects a relative path', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <InboxDirectoryPicker
        nodes={nodes}
        value=""
        onValueChange={onValueChange}
      />,
    );
    await user.click(
      screen.getByRole('combobox', { name: '保存位置：工作区根目录' }),
    );

    const scrollArea = screen.getByTestId('inbox-directory-tree');
    expect(scrollArea.className).toContain('max-h-72');
    expect(scrollArea.className).toContain('inbox-directory-scrollarea');
    expect(
      screen.getByRole('tree', { name: '工作区目录' }).className,
    ).toContain('space-y-0.5');
    expect(screen.queryByText('Spring AI')).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开 技术随笔' }));
    expect(screen.getByRole('group').className).toContain('mt-0.5');
    expect(screen.getByRole('group').className).toContain('space-y-0.5');
    await user.click(
      screen.getByRole('button', { name: '选择目录 技术随笔/Spring AI' }),
    );

    expect(onValueChange).toHaveBeenCalledWith('技术随笔/Spring AI');
  });

  it('searches nested directories by full path and excludes private roots', async () => {
    const user = userEvent.setup();

    render(
      <InboxDirectoryPicker nodes={nodes} value="" onValueChange={vi.fn()} />,
    );
    await user.click(
      screen.getByRole('combobox', { name: '保存位置：工作区根目录' }),
    );
    await user.type(screen.getByRole('searchbox', { name: '搜索目录' }), 'agent');

    expect(
      screen.getByRole('button', {
        name: '选择目录 技术随笔/Spring AI/Agent',
      }),
    ).not.toBeNull();
    expect(screen.queryByText('Daily')).toBeNull();
    expect(screen.queryByText('.private')).toBeNull();
  });

  it('keeps the scroll container inside its parent modal dialog', async () => {
    const user = userEvent.setup();

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>提升为正式笔记</DialogTitle>
          <DialogDescription>选择新笔记的保存目录。</DialogDescription>
          <InboxDirectoryPicker
            nodes={nodes}
            value=""
            onValueChange={vi.fn()}
          />
        </DialogContent>
      </Dialog>,
    );
    await user.click(
      screen.getByRole('combobox', { name: '保存位置：工作区根目录' }),
    );

    const dialogContent = screen
      .getByText('提升为正式笔记')
      .closest('[data-slot="dialog-content"]');
    expect(dialogContent).not.toBeNull();
    expect(
      dialogContent?.contains(screen.getByTestId('inbox-directory-tree')),
    ).toBe(true);
  });

  it('uses the same thin scrollbar treatment as the document editor', () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const scrollbarRuleStart = globalsCss.indexOf(
      '.inbox-directory-scrollarea::-webkit-scrollbar {',
    );
    const thumbRuleStart = globalsCss.indexOf(
      '.inbox-directory-scrollarea::-webkit-scrollbar-thumb {',
    );

    expect(scrollbarRuleStart).toBeGreaterThan(-1);
    expect(
      globalsCss.slice(
        scrollbarRuleStart,
        globalsCss.indexOf('}', scrollbarRuleStart),
      ),
    ).toContain('width: 4px;');
    expect(thumbRuleStart).toBeGreaterThan(-1);
    expect(
      globalsCss.slice(
        thumbRuleStart,
        globalsCss.indexOf('}', thumbRuleStart),
      ),
    ).toContain('border-radius: 999px;');
  });
});

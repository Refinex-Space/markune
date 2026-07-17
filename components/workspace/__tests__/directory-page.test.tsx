import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DirectoryPage } from '../directory-page';
import type { WorkspaceNode } from '../workspace-types';

describe('DirectoryPage', () => {
  it('keeps long directory preview titles inside their grid card', () => {
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

    const card = screen.getByRole('button', { name: /13_Skills/ });
    const preview = screen.getByText(longTitle);
    const previewRegion = preview.parentElement?.parentElement;

    expect(card.className).toContain('min-w-0');
    expect(card.className).toContain('max-w-full');
    expect(card.className).toContain('overflow-hidden');
    expect(preview.className).toContain('truncate');
    expect(previewRegion?.className).toContain('min-w-0');
    expect(previewRegion?.className).toContain('overflow-hidden');
  });
});

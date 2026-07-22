import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Workspace empty state', () => {
  it('keeps one workspace instruction and one action', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/workspace/editor-pane.tsx'),
      'utf8',
    );

    expect(source).toContain('打开一个本地工作区，开始整理 Markdown 笔记。');
    expect(source).not.toMatch(/>\s*打开一个工作区\s*</u);
    expect(source).toContain('选择文件夹');
  });
});

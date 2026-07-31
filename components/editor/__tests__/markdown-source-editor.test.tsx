import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceEditorPath = join(
  process.cwd(),
  'components/editor/markdown-source-editor.tsx',
);

describe('MarkdownSourceEditor', () => {
  it('使行号栏复用文档画布的颜色令牌', () => {
    const source = readFileSync(sourceEditorPath, 'utf8');

    expect(source).toContain("'.cm-gutters': {");
    expect(source).toContain("backgroundColor: 'var(--background)'");
    expect(source).toContain(
      "borderRight: '1px solid var(--border)'",
    );
  });
});

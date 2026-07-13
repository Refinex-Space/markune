import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceLayoutPath = join(
  process.cwd(),
  'components/workspace/workspace-layout.tsx',
);

describe('Windows workspace titlebar', () => {
  it('places a Windows-only divider after the custom header tools', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toMatch(
      /\{children\}\s*\{windowsChromeInset \? \(\s*<span[\s\S]*?data-testid="windows-titlebar-tools-divider"/,
    );
    expect(workspaceLayoutSource).toContain(
      'className="mx-1 h-4 w-px shrink-0 bg-border/80"',
    );
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceLayoutPath = join(
  process.cwd(),
  'components/workspace/workspace-layout.tsx',
);
const workspaceSidebarPath = join(
  process.cwd(),
  'components/workspace/workspace-sidebar.tsx',
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
    expect(workspaceLayoutSource).toContain(
      "windowsChromeInset && 'mr-[136px]'",
    );
    expect(workspaceLayoutSource).not.toContain("windowsChromeInset && 'mr-[150px]'");
  });

  it('moves global search to the workspace sidebar and removes the centered trigger', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');
    const workspaceSidebarSource = readFileSync(workspaceSidebarPath, 'utf8');

    expect(workspaceLayoutSource).not.toContain('workspace-centered-search');
    expect(workspaceLayoutSource).toContain('onOpenGlobalSearch={openGlobalSearch}');
    expect(workspaceSidebarSource).toContain('aria-label="全局搜索"');
    expect(workspaceSidebarSource).not.toContain('workspace-sidebar-search-panel');
  });

  it('opens global search with Ctrl or Command plus Shift plus F without double Shift', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain(
      "event.shiftKey && event.key.toLowerCase() === 'f'",
    );
    expect(workspaceLayoutSource).not.toContain('DOUBLE_SHIFT_THRESHOLD_MS');
    expect(workspaceLayoutSource).not.toContain('lastShiftKeyTimeRef');
  });
});

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
const pinnedChromeMenuPath = join(
  process.cwd(),
  'components/workspace/pinned-chrome-menu.tsx',
);
const tauriConfigPath = join(process.cwd(), 'src-tauri/tauri.conf.json');

describe('Workspace titlebar', () => {
  it('keeps native controls in an outer titlebar above the workspace panel', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain(
      'absolute inset-x-0 top-0 z-40 flex h-8 items-stretch',
    );
    expect(workspaceLayoutSource).toContain(
      "isTauriRuntime && isWindowsRuntime && 'pt-8'",
    );
    expect(workspaceLayoutSource).not.toContain('windows-titlebar-tools-divider');
    expect(workspaceLayoutSource).not.toContain("windowsChromeInset && 'mr-[136px]'");
  });

  it('aligns the Windows workspace title and document tabs with the main header', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');
    const workspaceSidebarSource = readFileSync(workspaceSidebarPath, 'utf8');

    expect(workspaceSidebarSource).toContain("? 'h-2'");
    expect(workspaceSidebarSource).toContain(
      "macChromeContentTop === undefined",
    );
    expect(workspaceSidebarSource).toContain("? 'h-10'");
    expect(workspaceLayoutSource).toContain(
      'windowsChromeInset={isTauriRuntime && isWindowsRuntime}',
    );
    expect(workspaceLayoutSource).toContain('documentTabs={');
    expect(workspaceLayoutSource).toContain(
      '<div className="min-w-0 flex-1">{documentTabs}</div>',
    );
    expect(workspaceLayoutSource.match(/<DocumentTabBar/g)).toHaveLength(1);
  });

  it('aligns the drawing detail divider with the sidebar across native titlebars', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain("systemPage === 'drawings' && drawings.selection.kind === 'drawing'");
    expect(workspaceLayoutSource).toContain('const WORKSPACE_PANEL_MARGIN = 8');
    expect(workspaceLayoutSource).toContain('const WORKSPACE_SIDEBAR_HEADER_HEIGHT = 44');
    expect(workspaceLayoutSource).toContain('? macChromeContentTop');
    expect(workspaceLayoutSource).toContain('editorHeaderHeight={drawingEditorHeaderHeight}');
    expect(workspaceLayoutSource).toContain('overlayContent={');
    expect(workspaceLayoutSource).toMatch(
      /overlayContent\s*\? 'absolute inset-x-0 top-0 z-10 h-11'/,
    );
  });

  it('reserves the macOS left chrome area when the workspace sidebar is collapsed', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toMatch(
      /macChromeInset=\{\s*isTauriRuntime\s*&&\s*isMacRuntime\s*&&\s*workspace\.isSidebarCollapsed\s*\}/,
    );
    expect(workspaceLayoutSource).toContain(
      "macChromeInset ? 'pl-44' : 'pl-3'",
    );
  });

  it('aligns the macOS traffic lights, chrome tools, and sidebar content rhythm', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');
    const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8')) as {
      app: {
        windows: Array<{
          trafficLightPosition?: { x: number; y: number };
        }>;
      };
    };

    expect(tauriConfig.app.windows[0]?.trafficLightPosition).toEqual({
      x: 15,
      y: 26,
    });
    expect(workspaceLayoutSource).toMatch(
      /macChromeOffset=\{\s*isTauriRuntime\s*&&\s*isMacRuntime\s*\}/,
    );
    expect(workspaceLayoutSource).toContain(
      'macChromeControlsTop={macChromeControlsTop}',
    );
    expect(
      workspaceLayoutSource.match(/macChromeContentTop=\{/g),
    ).toHaveLength(2);
    expect(workspaceLayoutSource).toContain(
      "style={macChromeOffset ? { top: macChromeControlsTop } : undefined}",
    );
    expect(workspaceLayoutSource).not.toContain("'top-3.5'");
    expect(workspaceLayoutSource).toContain('SidebarExpandedIcon');
    expect(workspaceLayoutSource).toContain('SidebarCollapsedIcon');
    expect(workspaceLayoutSource).not.toContain('PanelLeftClose');
    expect(workspaceLayoutSource).not.toContain('PanelLeftOpen');
  });

  it('allocates separate non-overlapping rows for macOS chrome and system-page tools', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain(
      '? macChromeContentTop - WORKSPACE_PANEL_MARGIN',
    );
    expect(workspaceLayoutSource).toContain(
      'const macSidebarHeaderOffset =',
    );
    expect(workspaceLayoutSource).toContain(
      'headerHeight={workspaceMainHeaderHeight}',
    );
    expect(workspaceLayoutSource).toContain(
      "'--workspace-main-header-height': `${workspaceMainHeaderHeight}px`",
    );
    expect(
      workspaceLayoutSource.match(
        /sidebarHeaderOffset=\{macSidebarHeaderOffset\}/g,
      ),
    ).toHaveLength(3);
  });

  it('keeps 32px chrome hit targets while limiting hover backgrounds to 28px', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');
    const pinnedChromeMenuSource = readFileSync(pinnedChromeMenuPath, 'utf8');

    expect(
      workspaceLayoutSource.match(/data-chrome-hover-surface/g),
    ).toHaveLength(1);
    expect(workspaceLayoutSource).not.toContain('aria-label="刷新工作区"');
    expect(
      pinnedChromeMenuSource.match(/data-chrome-hover-surface/g),
    ).toHaveLength(1);
    expect(workspaceLayoutSource).toContain(
      'group inline-flex size-8 items-center justify-center',
    );
    expect(workspaceLayoutSource).toContain(
      'inline-flex size-7 items-center justify-center rounded-md',
    );
    expect(pinnedChromeMenuSource).toContain(
      'group-data-[state=open]:bg-accent',
    );
  });

  it('places pinned content beside workspace search instead of the window chrome', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');
    const workspaceSidebarSource = readFileSync(workspaceSidebarPath, 'utf8');
    const pinnedChromeMenuSource = readFileSync(pinnedChromeMenuPath, 'utf8');

    expect(workspaceLayoutSource).not.toContain('PinnedChromeMenu');
    expect(workspaceSidebarSource).toContain("import { PinnedChromeMenu }");
    expect(workspaceSidebarSource.indexOf('aria-label="全局搜索"')).toBeLessThan(
      workspaceSidebarSource.indexOf('<PinnedChromeMenu'),
    );
    expect(pinnedChromeMenuSource).toContain('shadow-none');
    expect(pinnedChromeMenuSource).toContain('ring-0');
    expect(pinnedChromeMenuSource).not.toContain('shadow-[0_18px_48px');
  });

  it('does not reset the macOS traffic light position when the document title changes', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toMatch(
      /if \(isTauriRuntime && isMacRuntime\) \{\s*return;\s*\}\s*void setAppWindowTitle\(pageTitle \?\? 'Madora'\)/,
    );
    expect(workspaceLayoutSource).toContain(
      '[isMacRuntime, isTauriRuntime, pageTitle]',
    );
  });

  it('renders the compact AI and metadata panels beside the rounded main panel', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain(
      'data-testid="workspace-panel-group"',
    );
    expect(workspaceLayoutSource).toContain(
      'relative m-2 flex min-h-0 min-w-0 max-w-full flex-1 gap-2 overflow-hidden bg-sidebar',
    );
    expect(workspaceLayoutSource).toContain(
      'className="-mx-2 bg-sidebar"',
    );
    const editorColumnClass = workspaceLayoutSource.match(
      /className="([^"]+)"\s+data-testid="workspace-editor-column"/,
    )?.[1];
    expect(editorColumnClass).not.toContain('shadow-[');
    expect(workspaceLayoutSource.indexOf('data-testid="workspace-editor-column"'))
      .toBeLessThan(workspaceLayoutSource.indexOf('<RightSidePanel'));
  });

  it('keeps the Git panel below macOS window controls without changing other runtimes', () => {
    const workspaceLayoutSource = readFileSync(workspaceLayoutPath, 'utf8');

    expect(workspaceLayoutSource).toContain(
      "'min-h-0 shrink-0'",
    );
    expect(workspaceLayoutSource).toContain(
      "'[&>aside]:rounded-none [&>aside]:border-0 [&>aside]:bg-transparent'",
    );
    expect(workspaceLayoutSource).toContain('marginTop:');
    expect(workspaceLayoutSource).toContain('? macChromeContentTop');
    expect(workspaceLayoutSource).toContain(
      ": 'my-2 ml-2'",
    );
    expect(workspaceLayoutSource).toContain(
      'data-testid="workspace-git-panel-column"',
    );
    expect(workspaceLayoutSource).not.toContain(
      "'mb-2 ml-2 min-h-0 shrink-0'",
    );
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

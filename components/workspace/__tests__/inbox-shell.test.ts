import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();

describe('Inbox workspace shell', () => {
  it('places Inbox directly below Daily and renders the active badge', () => {
    const source = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-sidebar.tsx'),
      'utf8',
    );
    const daily = source.indexOf('data-testid="daily-note-entry"');
    const inbox = source.indexOf('data-testid="inbox-entry"');
    const drawings = source.indexOf('data-testid="drawing-entry"');
    const views = source.indexOf('data-testid="workspace-views-entry"');

    expect(daily).toBeGreaterThan(-1);
    expect(inbox).toBeGreaterThan(daily);
    expect(drawings).toBeGreaterThan(inbox);
    expect(views).toBeGreaterThan(drawings);
    expect(source).toContain("inboxActiveCount > 99 ? '99+' : inboxActiveCount");
    expect(source).not.toContain('bg-sidebar-primary');
  });

  it('wires the shortcut and status-row plus button to the main editor draft', () => {
    const layout = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const sidebar = readFileSync(
      join(workspaceRoot, 'components/workspace/inbox-sidebar.tsx'),
      'utf8',
    );
    const page = readFileSync(
      join(workspaceRoot, 'components/workspace/inbox-page.tsx'),
      'utf8',
    );

    expect(layout).toMatch(
      /event\.shiftKey[\s\S]*event\.key\.toLowerCase\(\) === 'i'/,
    );
    expect(layout).toContain('void startInboxCapture()');
    expect(layout).toContain('<InboxSidebar');
    expect(layout).toContain('<InboxPage');
    expect(layout).not.toContain('<QuickCaptureDialog');
    expect(sidebar).toContain('data-testid="inbox-new-capture-trigger"');
    expect(sidebar).toContain('aria-label="新建 Capture"');
    expect(sidebar).not.toContain('inbox-inline-capture-trigger');
    expect(sidebar).toContain('data-testid="inbox-capture-row"');
    expect(page).toContain('data-testid="inbox-save-status"');
    expect(page).toContain('bottom-3 right-4');
    expect(page).not.toContain('<header');
    expect(page).not.toContain('管理 Capture 标签');
  });

  it('keeps Inbox local search in its own sidebar region', () => {
    const layout = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const sidebar = readFileSync(
      join(workspaceRoot, 'components/workspace/workspace-sidebar.tsx'),
      'utf8',
    );
    const inboxSidebar = readFileSync(
      join(workspaceRoot, 'components/workspace/inbox-sidebar.tsx'),
      'utf8',
    );

    expect(layout).toContain("systemPage === 'inbox'");
    expect(sidebar).toContain("workspace.snapshot && systemPage === 'inbox'");
    expect(sidebar).toContain("systemPage === 'inbox' || systemPage === 'drawings'");
    expect(layout).not.toContain("? '搜索 Inbox'");
    expect(inboxSidebar).toContain('aria-label="搜索 Inbox"');
  });
});

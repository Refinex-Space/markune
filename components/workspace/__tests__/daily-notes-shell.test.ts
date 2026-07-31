import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Daily notes workspace shell', () => {
  it('routes the top entry to the overview while keeping the mini calendar direct-open behavior', () => {
    const layout = readFileSync(
      join(process.cwd(), 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const sidebar = readFileSync(
      join(process.cwd(), 'components/workspace/workspace-sidebar.tsx'),
      'utf8',
    );

    expect(layout).toContain("setSystemPage('daily')");
    expect(layout).toContain('<DailyNotesPage');
    expect(layout).toContain('onOpenDailyNotes={handleOpenDailyNotesPage}');
    expect(layout).not.toContain(
      'onOpenDailyNote={() =>\n                  void handleOpenDailyNote(formatDailyDate(new Date()))',
    );
    expect(layout).toContain(
      'onSelectDate={(date) => void handleOpenDailyNote(date)}',
    );
    expect(sidebar).toContain("systemPage === 'daily'");
  });

  it('fades calendar excerpts and passes the workspace rendering context to the inspector', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    const layout = readFileSync(
      join(process.cwd(), 'components/workspace/workspace-layout.tsx'),
      'utf8',
    );
    const page = readFileSync(
      join(process.cwd(), 'components/workspace/daily-notes-page.tsx'),
      'utf8',
    );

    expect(css).toContain('.daily-notes-calendar-cell-preview-fade');
    expect(css).toContain('mask-image: linear-gradient');
    expect(css).toContain(
      '.daily-notes-rendered-preview .markweave-editor-surface',
    );
    expect(page).not.toContain('line-clamp-2');
    expect(page).toContain('<MarkdownEditor');
    expect(page).toContain('readMarkdownDocument(rootPath, entry.documentPath)');
    expect(layout).toContain('pageWidthMode={pageWidthMode}');
    expect(layout).toContain('rootPath={workspace.snapshot.rootPath}');
    expect(layout).toContain('inspectorWidth={dailyNotesInspectorWidth}');
    expect(layout).toContain(
      "dailyNotesInspector: 'madora:workspace:daily-notes-inspector-width:v2'",
    );
    expect(layout).toContain('if (storedValue === null)');
    expect(layout).toContain('onInspectorResize={setDailyNotesInspectorWidth}');
  });
});

import { describe, expect, it } from 'vitest';

import {
  closeAllDocumentTabs,
  closeDocumentTab,
  closeDocumentTabsToLeft,
  closeDocumentTabsToRight,
  closeOtherDocumentTabs,
  createInitialEditorLayout,
  openDocumentTab,
  renameDocumentTab,
  selectDocumentTab,
} from '../document-tabs';
import type { WorkspaceNode } from '../workspace-types';

function doc(id: string, title = id): WorkspaceNode {
  return {
    absolutePath: `/repo/${id}.md`,
    id,
    kind: 'document',
    name: `${id}.md`,
    relativePath: `${id}.md`,
    title,
  };
}

describe('document tabs model', () => {
  it('opens documents and selects existing tabs', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a', 'A'));
    layout = openDocumentTab(layout, doc('b', 'B'));
    layout = openDocumentTab(layout, doc('a', 'A updated'));

    expect(layout.tabs.map((tab) => tab.absolutePath)).toEqual([
      '/repo/a.md',
      '/repo/b.md',
    ]);
    expect(layout.tabs[0].title).toBe('A updated');
    expect(layout.activeTabPath).toBe('/repo/a.md');
  });

  it('closes active tabs and selects the nearest neighbor', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));
    layout = openDocumentTab(layout, doc('c'));

    layout = closeDocumentTab(layout, '/repo/b.md');

    expect(layout.tabs.map((tab) => tab.absolutePath)).toEqual([
      '/repo/a.md',
      '/repo/c.md',
    ]);
    expect(layout.activeTabPath).toBe('/repo/c.md');
  });

  it('clears the active tab when the last open document is closed', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));

    layout = closeDocumentTab(layout, '/repo/a.md');

    expect(layout).toEqual({ activeTabPath: null, tabs: [] });
  });

  it('selects a tab', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));

    layout = selectDocumentTab(layout, '/repo/a.md');

    expect(layout.activeTabPath).toBe('/repo/a.md');
  });

  it('updates the active tab path and title after renaming a document', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a', 'A'));
    layout = openDocumentTab(layout, doc('b', '未命名文档'));

    layout = renameDocumentTab(
      layout,
      '/repo/b.md',
      doc('renamed', '测试新增'),
    );

    expect(layout.activeTabPath).toBe('/repo/renamed.md');
    expect(layout.tabs).toEqual([
      { absolutePath: '/repo/a.md', name: 'a.md', title: 'A' },
      {
        absolutePath: '/repo/renamed.md',
        name: 'renamed.md',
        title: '测试新增',
      },
    ]);
  });

  it('returns the same layout when selecting the already active tab', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));

    const nextLayout = selectDocumentTab(layout, '/repo/a.md');

    expect(nextLayout).toBe(layout);
  });

  it('supports close other, close all, close left, and close right', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));
    layout = openDocumentTab(layout, doc('c'));
    layout = openDocumentTab(layout, doc('d'));

    expect(
      closeOtherDocumentTabs(layout, '/repo/c.md').tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/c.md']);

    expect(
      closeDocumentTabsToLeft(layout, '/repo/c.md').tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/c.md', '/repo/d.md']);

    expect(
      closeDocumentTabsToRight(layout, '/repo/b.md').tabs.map(
        (tab) => tab.absolutePath,
      ),
    ).toEqual(['/repo/a.md', '/repo/b.md']);

    expect(closeAllDocumentTabs()).toEqual({
      activeTabPath: null,
      tabs: [],
    });
  });
});

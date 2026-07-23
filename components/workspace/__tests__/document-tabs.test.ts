import { describe, expect, it } from 'vitest';

import {
  closeAllDocumentTabs,
  closeDocumentTab,
  closeDocumentTabsToLeft,
  closeDocumentTabsToRight,
  closeOtherDocumentTabs,
  createInitialEditorLayout,
  getActiveDocumentPath,
  openDocumentTab,
  openPlanPreviewTab,
  renameDocumentTab,
  selectDocumentTab,
  updateDocumentEditorWarmPaths,
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

    expect(layout.tabs.map((tab) => tab.id)).toEqual([
      '/repo/a.md',
      '/repo/b.md',
    ]);
    expect(layout.tabs[0].title).toBe('A updated');
    expect(layout.activeTabId).toBe('/repo/a.md');
  });

  it('closes active tabs and selects the nearest neighbor', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));
    layout = openDocumentTab(layout, doc('c'));

    layout = closeDocumentTab(layout, '/repo/b.md');

    expect(layout.tabs.map((tab) => tab.id)).toEqual([
      '/repo/a.md',
      '/repo/c.md',
    ]);
    expect(layout.activeTabId).toBe('/repo/c.md');
  });

  it('clears the active tab when the last open document is closed', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));

    layout = closeDocumentTab(layout, '/repo/a.md');

    expect(layout).toEqual({ activeTabId: null, tabs: [] });
  });

  it('selects a tab', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));

    layout = selectDocumentTab(layout, '/repo/a.md');

    expect(layout.activeTabId).toBe('/repo/a.md');
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

    expect(layout.activeTabId).toBe('/repo/renamed.md');
    expect(layout.tabs).toEqual([
      {
        absolutePath: '/repo/a.md',
        id: '/repo/a.md',
        kind: 'document',
        name: 'a.md',
        title: 'A',
      },
      {
        absolutePath: '/repo/renamed.md',
        id: '/repo/renamed.md',
        kind: 'document',
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
        (tab) => tab.id,
      ),
    ).toEqual(['/repo/c.md']);

    expect(
      closeDocumentTabsToLeft(layout, '/repo/c.md').tabs.map(
        (tab) => tab.id,
      ),
    ).toEqual(['/repo/c.md', '/repo/d.md']);

    expect(
      closeDocumentTabsToRight(layout, '/repo/b.md').tabs.map(
        (tab) => tab.id,
      ),
    ).toEqual(['/repo/a.md', '/repo/b.md']);

    expect(closeAllDocumentTabs()).toEqual({
      activeTabId: null,
      tabs: [],
    });
  });

  it('opens plan previews as reusable in-memory tabs', () => {
    let layout = openDocumentTab(createInitialEditorLayout(), doc('a'));
    layout = openPlanPreviewTab(layout, {
      id: 'plan-1',
      text: '# Madora 计划\n\n第一版',
      threadId: 'thread-1',
    });
    layout = openPlanPreviewTab(layout, {
      id: 'plan-1',
      text: '# Madora 计划\n\n更新后的完整正文',
      threadId: 'thread-1',
    });

    expect(layout.tabs).toHaveLength(2);
    expect(layout.activeTabId).toBe('plan:thread-1:plan-1');
    expect(layout.tabs[1]).toMatchObject({
      id: 'plan:thread-1:plan-1',
      kind: 'plan',
      markdown: '# Madora 计划\n\n更新后的完整正文',
      title: 'Madora 计划',
    });

    const closed = closeDocumentTab(layout, 'plan:thread-1:plan-1');
    expect(closed.activeTabId).toBe('/repo/a.md');
    expect(closed.tabs).toHaveLength(1);
  });

  it('uses the active document tab path as the AI document identity', () => {
    let layout = openDocumentTab(
      createInitialEditorLayout(),
      doc('Test', 'Spring Boot 介绍'),
    );
    layout = openDocumentTab(layout, doc('Other', '另一篇文档'));

    expect(getActiveDocumentPath(layout)).toBe('/repo/Other.md');

    layout = selectDocumentTab(layout, '/repo/Test.md');
    expect(getActiveDocumentPath(layout)).toBe('/repo/Test.md');

    layout = openPlanPreviewTab(layout, {
      id: 'plan-1',
      text: '# 计划',
      threadId: 'thread-1',
    });
    expect(getActiveDocumentPath(layout)).toBeNull();
    expect(getActiveDocumentPath(createInitialEditorLayout())).toBeNull();
  });

  it('keeps the three most recently selected document editors warm', () => {
    let layout = createInitialEditorLayout();
    let warmPaths: readonly string[] = [];

    for (const id of ['a', 'b', 'c', 'd']) {
      layout = openDocumentTab(layout, doc(id));
      warmPaths = updateDocumentEditorWarmPaths(warmPaths, layout);
    }

    expect(warmPaths).toEqual([
      '/repo/d.md',
      '/repo/c.md',
      '/repo/b.md',
    ]);

    layout = selectDocumentTab(layout, '/repo/c.md');
    warmPaths = updateDocumentEditorWarmPaths(warmPaths, layout);
    expect(warmPaths).toEqual([
      '/repo/c.md',
      '/repo/d.md',
      '/repo/b.md',
    ]);
  });

  it('removes closed documents from the warm editor set', () => {
    let layout = createInitialEditorLayout();
    layout = openDocumentTab(layout, doc('a'));
    layout = openDocumentTab(layout, doc('b'));
    let warmPaths = updateDocumentEditorWarmPaths([], layout);

    layout = closeDocumentTab(layout, '/repo/b.md');
    warmPaths = updateDocumentEditorWarmPaths(warmPaths, layout);

    expect(warmPaths).toEqual(['/repo/a.md']);
  });
});

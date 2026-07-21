import type { WorkspaceNode } from './workspace-types';

export interface DocumentEditorDocumentTab {
  absolutePath: string;
  id: string;
  kind: 'document';
  name: string;
  title: string;
}

export interface DocumentEditorPlanTab {
  id: string;
  kind: 'plan';
  markdown: string;
  planId: string;
  threadId: string;
  title: string;
}

export type DocumentEditorTab =
  | DocumentEditorDocumentTab
  | DocumentEditorPlanTab;

export interface PlanPreviewTabInput {
  id: string;
  text: string;
  threadId: string;
}

export interface DocumentEditorLayout {
  activeTabId: string | null;
  tabs: DocumentEditorTab[];
}

const DOCUMENT_EDITOR_KEEP_ALIVE_LIMIT = 3;

export function createInitialEditorLayout(): DocumentEditorLayout {
  return {
    activeTabId: null,
    tabs: [],
  };
}

export function openDocumentTab(
  layout: DocumentEditorLayout,
  document: WorkspaceNode,
): DocumentEditorLayout {
  if (document.kind !== 'document') {
    return layout;
  }

  const tab = createDocumentTab(document);
  const existingIndex = layout.tabs.findIndex((entry) => entry.id === tab.id);
  const tabs =
    existingIndex === -1
      ? [...layout.tabs, tab]
      : layout.tabs.map((entry, index) =>
          index === existingIndex ? tab : entry,
        );

  return {
    activeTabId: tab.id,
    tabs,
  };
}

export function openPlanPreviewTab(
  layout: DocumentEditorLayout,
  plan: PlanPreviewTabInput,
): DocumentEditorLayout {
  const tab = createPlanPreviewTab(plan);
  const existingIndex = layout.tabs.findIndex((entry) => entry.id === tab.id);
  const tabs =
    existingIndex === -1
      ? [...layout.tabs, tab]
      : layout.tabs.map((entry, index) =>
          index === existingIndex ? tab : entry,
        );

  return {
    activeTabId: tab.id,
    tabs,
  };
}

export function selectDocumentTab(
  layout: DocumentEditorLayout,
  tabId: string,
): DocumentEditorLayout {
  if (layout.activeTabId === tabId) {
    return layout;
  }

  const tab = layout.tabs.find((entry) => entry.id === tabId);
  return tab ? { ...layout, activeTabId: tab.id } : layout;
}

export function renameDocumentTab(
  layout: DocumentEditorLayout,
  previousPath: string,
  document: WorkspaceNode,
): DocumentEditorLayout {
  if (document.kind !== 'document') {
    return layout;
  }

  const tabIndex = layout.tabs.findIndex(
    (tab) => tab.kind === 'document' && tab.absolutePath === previousPath,
  );

  if (tabIndex === -1) {
    return layout;
  }

  const previousTab = layout.tabs[tabIndex];
  const renamedTab = createDocumentTab(document);
  const tabs = layout.tabs.map((tab, index) =>
    index === tabIndex ? renamedTab : tab,
  );

  return {
    activeTabId:
      layout.activeTabId === previousTab.id ? renamedTab.id : layout.activeTabId,
    tabs,
  };
}

export function closeDocumentTab(
  layout: DocumentEditorLayout,
  tabId: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.id === tabId);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.filter((tab) => tab.id !== tabId);
  const activeTabId =
    layout.activeTabId === tabId
      ? tabs[Math.min(tabIndex, tabs.length - 1)]?.id ?? null
      : layout.activeTabId;

  return { activeTabId, tabs };
}

export function closeOtherDocumentTabs(
  layout: DocumentEditorLayout,
  tabId: string,
): DocumentEditorLayout {
  const tab = layout.tabs.find((entry) => entry.id === tabId);

  return tab ? { activeTabId: tabId, tabs: [tab] } : layout;
}

export function closeAllDocumentTabs(): DocumentEditorLayout {
  return createInitialEditorLayout();
}

export function closeDocumentTabsToLeft(
  layout: DocumentEditorLayout,
  tabId: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.id === tabId);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.slice(tabIndex);
  return {
    activeTabId: tabs.some((tab) => tab.id === layout.activeTabId)
      ? layout.activeTabId
      : tabId,
    tabs,
  };
}

export function closeDocumentTabsToRight(
  layout: DocumentEditorLayout,
  tabId: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.id === tabId);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.slice(0, tabIndex + 1);
  return {
    activeTabId: tabs.some((tab) => tab.id === layout.activeTabId)
      ? layout.activeTabId
      : tabId,
    tabs,
  };
}

export function getActiveTab(layout: DocumentEditorLayout) {
  return layout.tabs.find((tab) => tab.id === layout.activeTabId) ?? null;
}

export function getActiveDocumentPath(layout: DocumentEditorLayout) {
  const activeTab = getActiveTab(layout);
  return activeTab?.kind === 'document' ? activeTab.absolutePath : null;
}

export function updateDocumentEditorWarmPaths(
  currentPaths: readonly string[],
  layout: DocumentEditorLayout,
) {
  const openDocumentPaths = new Set(
    layout.tabs.flatMap((tab) =>
      tab.kind === 'document' ? [tab.absolutePath] : [],
    ),
  );
  const activeDocumentPath = getActiveDocumentPath(layout);
  const nextPaths = Array.from(
    new Set([
      ...(activeDocumentPath ? [activeDocumentPath] : []),
      ...currentPaths,
    ]),
  )
    .filter((path) => openDocumentPaths.has(path))
    .slice(0, DOCUMENT_EDITOR_KEEP_ALIVE_LIMIT);

  return nextPaths.length === currentPaths.length &&
    nextPaths.every((path, index) => path === currentPaths[index])
    ? currentPaths
    : nextPaths;
}

function createDocumentTab(document: WorkspaceNode): DocumentEditorDocumentTab {
  return {
    absolutePath: document.absolutePath,
    id: document.absolutePath,
    kind: 'document',
    name: document.name,
    title: document.title || document.name,
  };
}

function createPlanPreviewTab(plan: PlanPreviewTabInput): DocumentEditorPlanTab {
  return {
    id: `plan:${encodeURIComponent(plan.threadId)}:${encodeURIComponent(plan.id)}`,
    kind: 'plan',
    markdown: plan.text,
    planId: plan.id,
    threadId: plan.threadId,
    title: getPlanPreviewTitle(plan.text),
  };
}

function getPlanPreviewTitle(markdown: string) {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim() ?? '')
    .find(Boolean);
  return heading?.slice(0, 80) || '计划';
}

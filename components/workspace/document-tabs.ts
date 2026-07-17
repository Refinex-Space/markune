import type { WorkspaceNode } from './workspace-types';

export interface DocumentEditorTab {
  absolutePath: string;
  name: string;
  title: string;
}

export interface DocumentEditorLayout {
  activeTabPath: string | null;
  tabs: DocumentEditorTab[];
}

export function createInitialEditorLayout(): DocumentEditorLayout {
  return {
    activeTabPath: null,
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
  const existingIndex = layout.tabs.findIndex(
    (entry) => entry.absolutePath === tab.absolutePath,
  );
  const tabs =
    existingIndex === -1
      ? [...layout.tabs, tab]
      : layout.tabs.map((entry, index) =>
          index === existingIndex ? { ...entry, ...tab } : entry,
        );

  return {
    activeTabPath: tab.absolutePath,
    tabs,
  };
}

export function selectDocumentTab(
  layout: DocumentEditorLayout,
  tabPath: string,
): DocumentEditorLayout {
  if (layout.activeTabPath === tabPath) {
    return layout;
  }

  const tab = layout.tabs.find((entry) => entry.absolutePath === tabPath);
  return tab ? { ...layout, activeTabPath: tab.absolutePath } : layout;
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
    (tab) => tab.absolutePath === previousPath,
  );

  if (tabIndex === -1) {
    return layout;
  }

  const renamedTab = createDocumentTab(document);
  const tabs = layout.tabs.map((tab, index) =>
    index === tabIndex ? renamedTab : tab,
  );

  return {
    activeTabPath:
      layout.activeTabPath === previousPath
        ? renamedTab.absolutePath
        : layout.activeTabPath,
    tabs,
  };
}

export function closeDocumentTab(
  layout: DocumentEditorLayout,
  tabPath: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.absolutePath === tabPath);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.filter((tab) => tab.absolutePath !== tabPath);
  const activeTabPath =
    layout.activeTabPath === tabPath
      ? tabs[Math.min(tabIndex, tabs.length - 1)]?.absolutePath ?? null
      : layout.activeTabPath;

  return { activeTabPath, tabs };
}

export function closeOtherDocumentTabs(
  layout: DocumentEditorLayout,
  tabPath: string,
): DocumentEditorLayout {
  const tab = layout.tabs.find((entry) => entry.absolutePath === tabPath);

  return tab ? { activeTabPath: tabPath, tabs: [tab] } : layout;
}

export function closeAllDocumentTabs(): DocumentEditorLayout {
  return createInitialEditorLayout();
}

export function closeDocumentTabsToLeft(
  layout: DocumentEditorLayout,
  tabPath: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.absolutePath === tabPath);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.slice(tabIndex);
  return {
    activeTabPath: tabs.some((tab) => tab.absolutePath === layout.activeTabPath)
      ? layout.activeTabPath
      : tabPath,
    tabs,
  };
}

export function closeDocumentTabsToRight(
  layout: DocumentEditorLayout,
  tabPath: string,
): DocumentEditorLayout {
  const tabIndex = layout.tabs.findIndex((tab) => tab.absolutePath === tabPath);

  if (tabIndex === -1) {
    return layout;
  }

  const tabs = layout.tabs.slice(0, tabIndex + 1);
  return {
    activeTabPath: tabs.some((tab) => tab.absolutePath === layout.activeTabPath)
      ? layout.activeTabPath
      : tabPath,
    tabs,
  };
}

export function getActiveTab(layout: DocumentEditorLayout) {
  return (
    layout.tabs.find((tab) => tab.absolutePath === layout.activeTabPath) ?? null
  );
}

function createDocumentTab(document: WorkspaceNode): DocumentEditorTab {
  return {
    absolutePath: document.absolutePath,
    name: document.name,
    title: document.title || document.name,
  };
}

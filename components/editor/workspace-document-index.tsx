'use client';

// Provides a lightweight, document-agnostic index of workspace documents to the
// Markdown editor so it can power `[[` reference suggestions and internal link
// cards without threading the workspace tree through every editor prop. The
// index is framework-light: a memoized flatten of the workspace nodes plus a
// ranked search and a relative-path lookup. author: liyao

import * as React from 'react';

import type { WorkspaceNode } from '@/components/workspace/workspace-types';

export interface WorkspaceDocumentReference {
  id: string;
  name: string;
  title: string;
  relativePath: string;
  absolutePath: string;
  updatedAt?: number;
}

export interface WorkspaceDocumentIndex {
  /**
   * Ranked document search. An empty query returns the most recently updated
   * documents so the popup shows useful defaults right after `[[`.
   */
  search: (query: string, limit?: number) => WorkspaceDocumentReference[];
  /** Resolves a workspace-root-relative path to a document, if it exists. */
  resolveByRelativePath: (
    relativePath: string,
  ) => WorkspaceDocumentReference | null;
}

const DEFAULT_SEARCH_LIMIT = 8;

const WorkspaceDocumentIndexContext =
  React.createContext<WorkspaceDocumentIndex | null>(null);

function flattenDocumentReferences(
  nodes: WorkspaceNode[],
): WorkspaceDocumentReference[] {
  return nodes.flatMap((node) => {
    if (node.kind === 'document') {
      return [
        {
          id: node.id,
          name: node.name,
          title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
          relativePath: node.relativePath,
          absolutePath: node.absolutePath,
          updatedAt: node.updatedAt,
        },
      ];
    }

    return flattenDocumentReferences(node.children ?? []);
  });
}

function scoreDocument(
  document: WorkspaceDocumentReference,
  query: string,
): number {
  const title = document.title.toLowerCase();
  const name = document.name.toLowerCase();
  const path = document.relativePath.toLowerCase();

  if (title === query || name === query) {
    return 100;
  }

  if (title.startsWith(query)) {
    return 80;
  }

  if (title.includes(query)) {
    return 60;
  }

  if (name.includes(query)) {
    return 40;
  }

  if (path.includes(query)) {
    return 20;
  }

  return -1;
}

export function createWorkspaceDocumentIndex(
  nodes: WorkspaceNode[],
): WorkspaceDocumentIndex {
  const documents = flattenDocumentReferences(nodes);
  const byRelativePath = new Map<string, WorkspaceDocumentReference>();
  const byRelativePathLower = new Map<string, WorkspaceDocumentReference>();

  for (const document of documents) {
    byRelativePath.set(document.relativePath, document);
    const lower = document.relativePath.toLowerCase();
    if (!byRelativePathLower.has(lower)) {
      byRelativePathLower.set(lower, document);
    }
  }

  const recentDocuments = [...documents].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );

  return {
    search(query, limit = DEFAULT_SEARCH_LIMIT) {
      const normalized = query.trim().toLowerCase();

      if (!normalized) {
        return recentDocuments.slice(0, limit);
      }

      return documents
        .map((document) => ({
          document,
          score: scoreDocument(document, normalized),
        }))
        .filter((entry) => entry.score >= 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.document.title.localeCompare(b.document.title),
        )
        .slice(0, limit)
        .map((entry) => entry.document);
    },
    resolveByRelativePath(relativePath) {
      const hasExtension = /\.[^./]+$/.test(relativePath);
      const candidates = hasExtension
        ? [relativePath]
        : [relativePath, `${relativePath}.md`, `${relativePath}.mdx`];

      for (const candidate of candidates) {
        const exact = byRelativePath.get(candidate);
        if (exact) {
          return exact;
        }
      }

      for (const candidate of candidates) {
        const insensitive = byRelativePathLower.get(candidate.toLowerCase());
        if (insensitive) {
          return insensitive;
        }
      }

      return null;
    },
  };
}

export function WorkspaceDocumentIndexProvider({
  nodes,
  children,
}: {
  nodes: WorkspaceNode[];
  children: React.ReactNode;
}) {
  const index = React.useMemo(
    () => createWorkspaceDocumentIndex(nodes),
    [nodes],
  );

  return (
    <WorkspaceDocumentIndexContext.Provider value={index}>
      {children}
    </WorkspaceDocumentIndexContext.Provider>
  );
}

export function useWorkspaceDocumentIndex(): WorkspaceDocumentIndex | null {
  return React.useContext(WorkspaceDocumentIndexContext);
}

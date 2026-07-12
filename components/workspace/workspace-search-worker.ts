/// <reference lib="webworker" />

import {
  buildWorkspaceSearchIndex,
  searchWorkspaceIndex,
  type WorkspaceGlobalSearchResult,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIndex,
} from './workspace-global-search';

type WorkerRequest =
  | {
      documents: WorkspaceSearchDocument[];
      rootPath: string;
      type: 'index';
    }
  | {
      query: string;
      requestId: number;
      rootPath: string;
      type: 'search';
    };

type WorkerResponse =
  | { rootPath: string; type: 'indexed' }
  | {
      requestId: number;
      results: WorkspaceGlobalSearchResult[];
      rootPath: string;
      type: 'results';
    };

let indexedRootPath: string | null = null;
let index: WorkspaceSearchIndex | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'index') {
    index = buildWorkspaceSearchIndex(request.documents);
    indexedRootPath = request.rootPath;
    self.postMessage({ rootPath: request.rootPath, type: 'indexed' } satisfies WorkerResponse);
    return;
  }

  const results =
    indexedRootPath === request.rootPath && index
      ? searchWorkspaceIndex(index, request.query)
      : [];
  self.postMessage({
    requestId: request.requestId,
    results,
    rootPath: request.rootPath,
    type: 'results',
  } satisfies WorkerResponse);
};

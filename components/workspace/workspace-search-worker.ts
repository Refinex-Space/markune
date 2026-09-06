/// <reference lib="webworker" />

import {
  buildWorkspaceSearchIndex, searchWorkspaceIndex, updateWorkspaceSearchIndex,
  type WorkspaceSearchDocument,
} from './workspace-global-search';

type WorkerRequest =
  | { type: 'begin'; rootPath: string; reset: boolean }
  | { type: 'upsert'; rootPath: string; documents: WorkspaceSearchDocument[]; removed: string[] }
  | { type: 'commit'; rootPath: string; revision: number }
  | { type: 'index'; rootPath: string; documents: WorkspaceSearchDocument[] }
  | { type: 'search'; rootPath: string; requestId: number; query: string; limit?: number };

let rootPath: string | null = null;
let index = buildWorkspaceSearchIndex([]);
let updating = false;
const waiting: Array<Extract<WorkerRequest, { type: 'search' }>> = [];

function search(request: Extract<WorkerRequest, { type: 'search' }>) {
  const results = rootPath === request.rootPath ? searchWorkspaceIndex(index, request.query, request.limit) : [];
  self.postMessage({ type: 'results', rootPath: request.rootPath, requestId: request.requestId,
    results: results.map((result) => ({ ...result, document: { ...result.document, content: '' } })) });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'index') {
    index = buildWorkspaceSearchIndex(request.documents); rootPath = request.rootPath; updating = false;
    self.postMessage({ type: 'indexed', rootPath }); return;
  }
  if (request.type === 'begin') {
    if (request.reset || rootPath !== request.rootPath) index = buildWorkspaceSearchIndex([]);
    rootPath = request.rootPath; updating = true; return;
  }
  if (request.type === 'upsert') {
    if (rootPath === request.rootPath) updateWorkspaceSearchIndex(index, request.documents, request.removed);
    return;
  }
  if (request.type === 'commit') {
    if (rootPath !== request.rootPath) return;
    updating = false; self.postMessage({ type: 'indexed', rootPath, revision: request.revision, limitedCount: index.limited.size });
    for (const request of waiting.splice(0)) search(request);
    return;
  }
  if (updating) {
    waiting.push(request);
    if (waiting.length > 64) {
      const dropped = waiting.shift()!;
      self.postMessage({ type: 'results', rootPath: dropped.rootPath, requestId: dropped.requestId, results: [] });
    }
  } else search(request);
};

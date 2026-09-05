import type { MarkdownDocumentContent } from './workspace-types';

export async function reconcileWorkspaceDocuments({
  paths,
  read,
  captureDraft,
  getActivePath,
  synchronizeActive,
  applySessions,
  isCurrent,
}: {
  paths: string[];
  read: (path: string) => Promise<MarkdownDocumentContent>;
  captureDraft: () => Promise<boolean>;
  getActivePath: () => string | null;
  synchronizeActive: (document: MarkdownDocumentContent) => string;
  applySessions: (documents: MarkdownDocumentContent[]) => void;
  isCurrent: () => boolean;
}) {
  const documents: MarkdownDocumentContent[] = [];
  const failedPaths: string[] = [];
  const remaining = [...new Set(paths)];
  await Promise.all(
    Array.from({ length: Math.min(4, remaining.length) }, async () => {
      while (remaining.length && isCurrent()) {
        const path = remaining.shift()!;
        try {
          documents.push(await read(path));
        } catch {
          failedPaths.push(path);
        }
      }
    }),
  );
  if (!isCurrent()) return [];
  // Capture pending Live/Source input after I/O, without writing it to disk.
  // The subsequent comparison must see edits made while reads were pending. author: refinex
  if (paths.includes(getActivePath() ?? '') && !(await captureDraft())) {
    throw new Error('无法读取编辑器的最新草稿，已保留当前内容，请重试刷新。');
  }
  if (!isCurrent()) return [];
  const sessions = documents.filter((document) => {
    if (document.path !== getActivePath()) return true;
    return synchronizeActive(document) === 'reloaded';
  });
  applySessions(sessions);
  return failedPaths;
}

import * as React from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import {
  FileInput,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  DocumentPreviewCard,
  useDocumentPreviews,
  type DocumentPreviewTarget,
} from './document-preview';
import type {
  DocumentLoadState,
  WorkspaceNode,
} from './workspace-types';

export interface RecentWorkspaceDocument {
  absolutePath: string;
  relativePath: string;
  title: string;
}

interface EditorPaneProps {
  children: ReactNode;
  directoryContent?: ReactNode;
  currentDirectory: WorkspaceNode | null;
  currentDocument: WorkspaceNode | null;
  documentLoadError: string | null;
  documentLoadState: DocumentLoadState;
  hasWorkspace: boolean;
  isWorkspaceEmpty: boolean;
  workspaceOpenError?: string | null;
  workspaceRootPath: string;
  onCreateDirectory: () => void;
  onCreateDocument: () => void;
  onImportMarkdown: () => void;
  onOpenWorkspace: () => void;
  onOpenRecentDocument: (absolutePath: string) => void;
  onRetryDocument: () => void;
  recentDocuments: RecentWorkspaceDocument[];
}

export function EditorPane({
  children,
  directoryContent,
  currentDirectory,
  currentDocument,
  documentLoadError,
  documentLoadState,
  hasWorkspace,
  isWorkspaceEmpty,
  workspaceOpenError = null,
  workspaceRootPath,
  onCreateDirectory,
  onCreateDocument,
  onImportMarkdown,
  onOpenWorkspace,
  onOpenRecentDocument,
  onRetryDocument,
  recentDocuments,
}: EditorPaneProps) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div
        className="workspace-editor-scrollarea min-h-0 flex-1 overflow-auto"
        data-testid="editor-pane-content"
      >
        {currentDocument && documentLoadState === 'loading' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            正在打开文档...
          </div>
        ) : currentDocument && documentLoadState === 'error' ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <h1 className="text-xl font-semibold">无法打开文档</h1>
              <p className="text-sm text-muted-foreground">
                {documentLoadError ?? '无法读取文档内容'}
              </p>
              <Button type="button" onClick={onRetryDocument}>
                <RefreshCw size={16} />
                重试
              </Button>
            </div>
          </div>
        ) : currentDocument ? (
          children
        ) : currentDirectory ? (
          directoryContent
        ) : hasWorkspace && isWorkspaceEmpty ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-md space-y-4">
              <div className="space-y-2">
                <h1 className="text-xl font-semibold">
                  开始创建你的第一个文档
                </h1>
                <p className="text-sm text-muted-foreground">
                  当前工作区还没有内容，可以先新建文档或创建目录。
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={onCreateDocument}>
                  <FilePlus2 size={16} />
                  新建文档
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCreateDirectory}
                >
                  <FolderPlus size={16} />
                  新建目录
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onImportMarkdown}
                >
                  <FileInput size={16} />
                  导入 Markdown
                </Button>
              </div>
            </div>
          </div>
        ) : hasWorkspace && recentDocuments.length > 0 ? (
          <RecentDocumentsBoard
            documents={recentDocuments}
            workspaceRootPath={workspaceRootPath}
            onOpenDocument={onOpenRecentDocument}
          />
        ) : (
          <DocumentEmptyState
            hasWorkspace={hasWorkspace}
            workspaceOpenError={workspaceOpenError}
            onOpenWorkspace={onOpenWorkspace}
          />
        )}
      </div>
    </div>
  );
}

function DocumentEmptyState({
  hasWorkspace,
  workspaceOpenError,
  onOpenWorkspace,
}: {
  hasWorkspace: boolean;
  workspaceOpenError?: string | null;
  onOpenWorkspace: () => void;
}) {
  return (
    <div
      className="flex min-h-full items-center justify-center px-6 py-16 text-center"
      data-testid="workspace-document-empty-state"
    >
      <div className="flex w-full max-w-[520px] flex-col items-center">
        <Image
          alt=""
          className="size-8 opacity-90 dark:hidden"
          height={32}
          src="/brand/markune-logo-dark.svg"
          width={32}
        />
        <Image
          alt=""
          className="hidden size-8 opacity-90 dark:block"
          height={32}
          src="/brand/markune-logo-light.svg"
          width={32}
        />
        <div className="mt-6 h-px w-24 overflow-hidden rounded-full bg-border">
          <span className="block h-px w-8 animate-[app-splash-line-flow_1800ms_cubic-bezier(0.45,0,0.25,1)_infinite] rounded-full bg-foreground/75" />
        </div>
        <p className="mt-7 max-w-sm text-sm leading-6 text-muted-foreground">
          {hasWorkspace
            ? '从左侧选择文档，或继续最近打开的内容。'
            : '打开一个本地工作区，开始整理 Markdown 笔记。'}
        </p>
        {!hasWorkspace && workspaceOpenError ? (
          <p
            className="mt-3 max-w-sm text-sm leading-6 text-destructive"
            data-testid="workspace-open-error"
          >
            {workspaceOpenError}
          </p>
        ) : null}
        {!hasWorkspace ? (
          <Button className="mt-5" type="button" onClick={onOpenWorkspace}>
            <FolderOpen size={16} />
            选择文件夹
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Home surface for a workspace with recent activity: the same article-card grid
 * used by the directory view, so continuing recent work feels identical to
 * browsing a folder. Card excerpts stream in off the main thread. author: liyao
 */
function RecentDocumentsBoard({
  documents,
  workspaceRootPath,
  onOpenDocument,
}: {
  documents: RecentWorkspaceDocument[];
  workspaceRootPath: string;
  onOpenDocument: (absolutePath: string) => void;
}) {
  const previewTargets = React.useMemo<DocumentPreviewTarget[]>(
    () =>
      documents.map((document) => ({
        absolutePath: document.absolutePath,
        name: document.title,
      })),
    [documents],
  );
  const previews = useDocumentPreviews(previewTargets, workspaceRootPath);

  return (
    <div
      className="min-h-full bg-muted/10"
      data-testid="workspace-recent-documents-board"
    >
      <div className="mx-auto w-full max-w-5xl px-8 py-12 md:px-12 md:py-16">
        <header className="mb-8 flex items-center gap-2.5">
          <Image
            alt=""
            className="size-7 shrink-0 opacity-90 dark:hidden"
            height={28}
            src="/brand/markune-logo-dark.svg"
            width={28}
          />
          <Image
            alt=""
            className="hidden size-7 shrink-0 opacity-90 dark:block"
            height={28}
            src="/brand/markune-logo-light.svg"
            width={28}
          />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            最近文档
          </h1>
        </header>

        <p className="mb-4 text-sm text-muted-foreground">
          从上次离开的地方继续。
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
          {documents.map((document) => (
            <DocumentPreviewCard
              key={document.absolutePath}
              title={document.title}
              preview={previews[document.absolutePath]}
              onOpen={() => onOpenDocument(document.absolutePath)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

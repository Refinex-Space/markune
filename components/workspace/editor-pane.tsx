import type { ReactNode } from 'react';
import Image from 'next/image';
import {
  FileInput,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  FileText,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

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
        ) : (
          <DocumentEmptyState
            hasWorkspace={hasWorkspace}
            recentDocuments={recentDocuments}
            onOpenRecentDocument={onOpenRecentDocument}
            onOpenWorkspace={onOpenWorkspace}
          />
        )}
      </div>
    </div>
  );
}

function DocumentEmptyState({
  hasWorkspace,
  recentDocuments,
  onOpenRecentDocument,
  onOpenWorkspace,
}: {
  hasWorkspace: boolean;
  recentDocuments: RecentWorkspaceDocument[];
  onOpenRecentDocument: (absolutePath: string) => void;
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
          src="/brand/madora-logo-dark.svg"
          width={32}
        />
        <Image
          alt=""
          className="hidden size-8 opacity-90 dark:block"
          height={32}
          src="/brand/madora-logo-light.svg"
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
        {hasWorkspace ? (
          <RecentDocumentsList
            documents={recentDocuments}
            onOpenDocument={onOpenRecentDocument}
          />
        ) : (
          <>
            <p className="mt-4 text-sm font-medium text-foreground">
              打开一个工作区
            </p>
            <Button className="mt-4" type="button" onClick={onOpenWorkspace}>
              <FolderOpen size={16} />
              选择文件夹
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RecentDocumentsList({
  documents,
  onOpenDocument,
}: {
  documents: RecentWorkspaceDocument[];
  onOpenDocument: (absolutePath: string) => void;
}) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-8 w-full max-w-sm text-left"
      data-testid="workspace-recent-documents-list"
    >
      <p className="mb-2 px-2 text-xs text-muted-foreground">最近文档</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <button
            key={document.absolutePath}
            className="group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
            type="button"
            onClick={() => onOpenDocument(document.absolutePath)}
          >
            <FileText
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground/75 transition-colors group-hover:text-foreground/75"
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">{document.title}</span>
            <span className="max-w-[42%] truncate text-xs text-muted-foreground/75">
              {document.relativePath}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

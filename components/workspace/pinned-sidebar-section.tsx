'use client';

import * as React from 'react';
import { ChevronDown, FileText, PinOff } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { TreeNodeIconRenderer } from './tree-node-icon';
import type { WorkspaceNode } from './workspace-types';

interface PinnedSidebarSectionProps {
  active: boolean;
  currentDirectoryPath: string | null;
  currentDocumentPath: string | null;
  nodes: WorkspaceNode[];
  onOpenNode: (node: WorkspaceNode) => void;
  onOpenOverview: () => void;
  onUnpinNode: (node: WorkspaceNode) => void;
  rootPath: string;
}

export function PinnedSidebarSection({
  active,
  currentDirectoryPath,
  currentDocumentPath,
  nodes,
  onOpenNode,
  onOpenOverview,
  onUnpinNode,
  rootPath,
}: PinnedSidebarSectionProps) {
  const [expanded, setExpanded] = React.useState(false);
  const contentId = React.useId();

  return (
    <TooltipProvider delayDuration={250}>
      <section className="mb-1" data-testid="pinned-sidebar-section">
        <div
          className={cn(
            'group mx-2 flex h-8 items-center justify-between rounded-md px-2 text-[13px] font-medium transition-colors focus-within:ring-2 focus-within:ring-ring/40',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80',
          )}
        >
          <button
            aria-current={active ? 'page' : undefined}
            aria-label="打开置顶内容总览"
            className="flex h-full min-w-0 flex-1 items-center text-left outline-none"
            type="button"
            onClick={onOpenOverview}
          >
            <span className="min-w-0 flex-1 truncate">置顶</span>
          </button>
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            {nodes.length > 0 ? (
              <span
                className="text-xs font-normal text-sidebar-foreground/40 tabular-nums transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                data-testid="pinned-sidebar-count"
              >
                {nodes.length}
              </span>
            ) : null}
            <button
              aria-controls={contentId}
              aria-expanded={expanded}
              aria-label={expanded ? '折叠置顶内容' : '展开置顶内容'}
              className="absolute flex size-6 items-center justify-center rounded-sm text-sidebar-foreground/50 opacity-0 transition-[background-color,color,opacity] hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
              type="button"
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform duration-200',
                  !expanded && '-rotate-90',
                )}
                data-testid="pinned-sidebar-chevron"
                strokeWidth={1.8}
              />
            </button>
          </span>
        </div>

        {expanded ? (
          <div className="mt-1 space-y-0.5 px-2" id={contentId}>
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <PinnedSidebarItem
                  active={
                    node.kind === 'directory'
                      ? node.absolutePath === currentDirectoryPath
                      : node.absolutePath === currentDocumentPath
                  }
                  key={node.absolutePath}
                  node={node}
                  rootPath={rootPath}
                  onOpen={() => onOpenNode(node)}
                  onUnpin={() => onUnpinNode(node)}
                />
              ))
            ) : (
              <p className="px-2 py-2 text-xs text-sidebar-foreground/45">
                暂无置顶内容
              </p>
            )}
          </div>
        ) : null}
      </section>
    </TooltipProvider>
  );
}

function PinnedSidebarItem({
  active,
  node,
  onOpen,
  onUnpin,
  rootPath,
}: {
  active: boolean;
  node: WorkspaceNode;
  onOpen: () => void;
  onUnpin: () => void;
  rootPath: string;
}) {
  const isDirectory = node.kind === 'directory';
  const label = getPinnedNodeLabel(node);

  return (
    <div className="group/pinned-item relative">
      <button
        aria-current={active ? 'page' : undefined}
        aria-label={`打开${isDirectory ? '目录' : '文档'} ${label}`}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-md pl-[11px] pr-9 text-left text-[13px] transition-colors',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        )}
        title={label}
        type="button"
        onClick={onOpen}
      >
        {isDirectory ? (
          <TreeNodeIconRenderer
            className="text-sidebar-foreground/55"
            expanded={false}
            node={node}
            rootPath={rootPath}
            testId={`pinned-folder-icon-${node.id}`}
          />
        ) : (
          <FileText
            className="size-[13px] shrink-0 text-sidebar-foreground/55"
            data-testid={`pinned-document-icon-${node.id}`}
            size={13}
            strokeWidth={1.8}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`取消置顶 ${label}`}
            className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/45 opacity-0 transition-[background-color,color,opacity,transform] hover:scale-105 hover:bg-background hover:text-sidebar-foreground active:scale-95 group-hover/pinned-item:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            type="button"
            onClick={onUnpin}
          >
            <PinOff aria-hidden="true" size={13} strokeWidth={1.9} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={6}>
          取消置顶
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function getPinnedNodeLabel(node: WorkspaceNode) {
  if (node.kind === 'document') {
    return node.title || node.name.replace(/\.(md|mdx)$/i, '');
  }

  return node.name;
}

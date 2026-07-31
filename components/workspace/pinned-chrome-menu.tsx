'use client';

import * as React from 'react';
import { FileText, FolderClosed, Pin, PinOff } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

interface PinnedChromeMenuProps {
  nodes: WorkspaceNode[];
  onOpenNode: (node: WorkspaceNode) => void;
  onUnpinNode: (node: WorkspaceNode) => void;
}

export function PinnedChromeMenu({
  nodes,
  onOpenNode,
  onUnpinNode,
}: PinnedChromeMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                aria-label="打开置顶内容"
                className={cn(
                  'group inline-flex size-8 items-center justify-center text-muted-foreground',
                )}
                type="button"
              >
                <span
                  className="inline-flex size-7 items-center justify-center rounded-md transition-colors group-hover:bg-accent group-hover:text-foreground group-data-[state=open]:bg-accent group-data-[state=open]:text-foreground"
                  data-chrome-hover-surface
                >
                  <Pin size={16} strokeWidth={1.9} />
                </span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            置顶内容
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="start"
        className="w-[320px] gap-1 rounded-lg border border-border/70 bg-background/98 p-1.5 shadow-none ring-0"
        data-testid="pinned-chrome-menu"
        side="bottom"
        sideOffset={8}
      >
        <div className="px-2 pb-1 pt-1.5 text-[13px] font-medium text-muted-foreground">
          置顶
        </div>

        {nodes.length > 0 ? (
          <div className="max-h-[320px] overflow-y-auto">
            {nodes.map((node) => (
              <PinnedChromeMenuItem
                key={node.absolutePath}
                node={node}
                onOpen={() => {
                  onOpenNode(node);
                  setOpen(false);
                }}
                onUnpin={(event) => {
                  event.stopPropagation();
                  onUnpinNode(node);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            暂无置顶内容
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PinnedChromeMenuItem({
  node,
  onOpen,
  onUnpin,
}: {
  node: WorkspaceNode;
  onOpen: () => void;
  onUnpin: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const isDirectory = node.kind === 'directory';
  const label = getPinnedNodeLabel(node);

  return (
    <div className="group/pinned-item relative">
      <button
        aria-label={`打开${isDirectory ? '目录' : '文档'} ${label}`}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md px-2 pr-9 text-left text-sm transition-colors',
          'text-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
        type="button"
        onClick={onOpen}
      >
        {isDirectory ? (
          <FolderClosed
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.8}
          />
        ) : (
          <FileText
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.8}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {node.updatedAt ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeAge(node.updatedAt)}
          </span>
        ) : null}
      </button>
      <button
        aria-label={`取消置顶 ${label}`}
        className={cn(
          'absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md',
          'text-muted-foreground opacity-0 transition-[background-color,color,opacity,transform]',
          'hover:scale-105 hover:bg-background hover:text-foreground hover:shadow-[0_1px_4px_rgba(15,23,42,0.10)] active:scale-95',
          'group-hover/pinned-item:opacity-100 focus-visible:opacity-100',
        )}
        type="button"
        onClick={onUnpin}
      >
        <PinOff size={14} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function getPinnedNodeLabel(node: WorkspaceNode) {
  if (node.kind === 'document') {
    return node.title || node.name.replace(/\.(md|mdx)$/i, '');
  }

  return node.name;
}

function formatRelativeAge(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.floor(diffMs / minuteMs))}m`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)}h`;
  }

  return `${Math.floor(diffMs / dayMs)}d`;
}

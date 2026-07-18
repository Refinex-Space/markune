'use client';

import * as React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FolderClosed,
  FolderOpen,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { WorkspaceNode } from './workspace-types';

interface InboxDirectoryPickerProps {
  nodes: WorkspaceNode[];
  value: string;
  onValueChange: (value: string) => void;
}

export function InboxDirectoryPicker({
  nodes,
  value,
  onValueChange,
}: InboxDirectoryPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const directories = React.useMemo(
    () => filterPromoteDirectories(nodes),
    [nodes],
  );
  const matches = React.useMemo(
    () => searchDirectories(directories, query),
    [directories, query],
  );

  function selectDirectory(path: string) {
    onValueChange(path);
    setQuery('');
    setOpen(false);
  }

  function toggleDirectory(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label={`保存位置：${value || '工作区根目录'}`}
          className="w-full justify-between font-normal"
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || '工作区根目录'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 gap-2 p-2"
        portalled={false}
      >
        <Input
          aria-label="搜索目录"
          autoFocus
          placeholder="搜索目录"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <div
          className="inbox-directory-scrollarea max-h-72 overflow-y-auto overscroll-contain pr-1"
          data-testid="inbox-directory-tree"
        >
          {query.trim() ? (
            matches.length > 0 ? (
              <div className="space-y-0.5">
                {matches.map((directory) => (
                  <DirectorySelectButton
                    key={directory.id}
                    fullPath
                    node={directory}
                    selected={value === directory.relativePath}
                    onSelect={() => selectDirectory(directory.relativePath)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                没有匹配的目录
              </p>
            )
          ) : (
            <div
              aria-label="工作区目录"
              className="space-y-0.5"
              role="tree"
            >
              <button
                aria-current={value === '' ? 'true' : undefined}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted',
                  value === '' && 'bg-muted',
                )}
                type="button"
                onClick={() => selectDirectory('')}
              >
                <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">工作区根目录</span>
                {value === '' ? <Check className="size-4 shrink-0" /> : null}
              </button>
              {directories.map((directory) => (
                <DirectoryTreeItem
                  expanded={expanded}
                  key={directory.id}
                  level={0}
                  node={directory}
                  selectedPath={value}
                  onSelect={selectDirectory}
                  onToggle={toggleDirectory}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DirectoryTreeItem({
  expanded,
  level,
  node,
  selectedPath,
  onSelect,
  onToggle,
}: {
  expanded: Set<string>;
  level: number;
  node: WorkspaceNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.relativePath);

  return (
    <div
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={selectedPath === node.relativePath}
      role="treeitem"
    >
      <div
        className="flex min-w-0 items-center"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        {hasChildren ? (
          <button
            aria-label={`${isExpanded ? '折叠' : '展开'} ${node.name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            type="button"
            onClick={() => onToggle(node.relativePath)}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}
        <DirectorySelectButton
          node={node}
          selected={selectedPath === node.relativePath}
          onSelect={() => onSelect(node.relativePath)}
        />
      </div>
      {hasChildren && isExpanded ? (
        <div className="mt-0.5 space-y-0.5" role="group">
          {children.map((child) => (
            <DirectoryTreeItem
              expanded={expanded}
              key={child.id}
              level={level + 1}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DirectorySelectButton({
  fullPath = false,
  node,
  selected,
  onSelect,
}: {
  fullPath?: boolean;
  node: WorkspaceNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = fullPath ? node.relativePath : node.name;

  return (
    <button
      aria-current={selected ? 'true' : undefined}
      aria-label={`选择目录 ${node.relativePath}`}
      className={cn(
        'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted',
        selected && 'bg-muted',
      )}
      type="button"
      onClick={onSelect}
    >
      {selected ? (
        <FolderOpen className="size-4 shrink-0 text-foreground" />
      ) : (
        <FolderClosed className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate" title={node.relativePath}>
        {label}
      </span>
      {selected ? <Check className="size-4 shrink-0" /> : null}
    </button>
  );
}

function filterPromoteDirectories(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => {
    if (
      node.kind !== 'directory' ||
      node.relativePath === 'Daily' ||
      node.name.startsWith('.')
    ) {
      return [];
    }
    return [
      {
        ...node,
        children: filterPromoteDirectories(node.children ?? []),
      },
    ];
  });
}

function searchDirectories(nodes: WorkspaceNode[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];

  const matches: WorkspaceNode[] = [];
  function visit(items: WorkspaceNode[]) {
    for (const item of items) {
      if (item.relativePath.toLocaleLowerCase().includes(normalized)) {
        matches.push(item);
      }
      visit(item.children ?? []);
    }
  }
  visit(nodes);
  return matches;
}

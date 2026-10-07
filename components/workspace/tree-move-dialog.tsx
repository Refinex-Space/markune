'use client';

import * as React from 'react';
import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getBaseName, isDescendantPath } from './workspace-paths';
import { flattenTree, validateTreeMove } from './workspace-tree-move';
import { getTreeSortPolicy, TREE_SORT_OPTIONS } from './workspace-tree-sort';
import type {
  TreeSortPreferences,
  WorkspaceMoveRequest,
  WorkspaceNode,
} from './workspace-types';

export function TreeMoveDialog({
  nodes,
  rootPath,
  paths,
  preferences,
  busy,
  onClose,
  onMove,
}: {
  nodes: WorkspaceNode[];
  rootPath: string;
  paths: string[] | null;
  preferences?: TreeSortPreferences;
  busy: boolean;
  onClose: () => void;
  onMove: (request: WorkspaceMoveRequest) => Promise<boolean>;
}) {
  const [query, setQuery] = React.useState('');
  const [target, setTarget] = React.useState(rootPath);
  const [placement, setPlacement] = React.useState('end');
  const all = React.useMemo(() => flattenTree(nodes), [nodes]);
  const directories = [
    {
      absolutePath: rootPath,
      relativePath: '',
      name: '工作区根目录',
      children: nodes,
    },
    ...all.filter((node) => node.kind === 'directory'),
  ].filter(
    (node) =>
      !(paths ?? []).some(
        (path) =>
          path === node.absolutePath ||
          isDescendantPath(node.absolutePath, path),
      ),
  );
  const folder = directories.find((node) => node.absolutePath === target);
  const children = (folder?.children ?? []).filter(
    (node) => !paths?.includes(node.absolutePath),
  );
  const policy = getTreeSortPolicy(preferences, folder?.relativePath);
  const filtered = directories.filter((node) =>
    `${node.name} ${node.relativePath}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const request: WorkspaceMoveRequest | null =
    paths?.length && folder
      ? {
          nodePath: paths[0],
          nodePaths: paths,
          position:
            policy.mode === 'manual' && placement !== 'end' && children.length
              ? 'before'
              : 'inside',
          targetPath:
            policy.mode === 'manual' && placement !== 'end' && children.length
              ? placement === 'start'
                ? children[0].absolutePath
                : placement
              : folder.absolutePath,
        }
      : null;
  const invalid = request
    ? validateTreeMove(nodes, request)
    : '请选择目标文件夹';
  return (
    <Dialog
      open={Boolean(paths)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={() => {
          setQuery('');
          setTarget(rootPath);
          setPlacement('end');
        }}
      >
        <DialogHeader>
          <DialogTitle>
            移动
            {paths?.length === 1
              ? `“${getBaseName(paths[0])}”`
              : ` ${paths?.length ?? 0} 个项目`}
          </DialogTitle>
          <DialogDescription>
            选择目标文件夹。原文件及其链接会一起更新。
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="查找目标文件夹"
          placeholder="查找文件夹…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div
          className="max-h-64 overflow-y-auto rounded-md border p-1"
          role="group"
          aria-label="目标文件夹"
        >
          {filtered.slice(0, 100).map((node) => (
            <button
              type="button"
              key={node.absolutePath}
              disabled={busy}
              aria-pressed={target === node.absolutePath}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent"
              onClick={() => {
                setTarget(node.absolutePath);
                setPlacement('end');
              }}
            >
              <Folder size={14} />
              <span className="min-w-0 truncate">
                {node.relativePath || node.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              没有匹配的文件夹
            </p>
          )}
          {filtered.length > 100 && (
            <p className="p-2 text-xs text-muted-foreground">
              显示前 100 项，请输入名称缩小范围
            </p>
          )}
        </div>
        {policy.mode === 'manual' ? (
          <Select
            value={placement}
            onValueChange={(value) => setPlacement(value ?? 'end')}
            disabled={busy}
          >
            <SelectTrigger aria-label="插入位置">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="end">放在最后</SelectItem>
              <SelectItem value="start">放在最前</SelectItem>
              {children.map((node) => (
                <SelectItem key={node.absolutePath} value={node.absolutePath}>
                  放在“{node.name}”之前
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            目标文件夹按
            {TREE_SORT_OPTIONS.find(([mode]) => mode === policy.mode)?.[1]}排列
          </p>
        )}
        {invalid && (
          <p role="status" className="text-xs text-muted-foreground">
            {invalid}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy || Boolean(invalid)}
            onClick={() => {
              if (request)
                void onMove(request).then((success) => {
                  if (success) onClose();
                });
            }}
          >
            {busy ? '正在移动…' : '移动'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

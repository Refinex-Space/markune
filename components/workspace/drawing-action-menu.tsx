'use client';

import * as React from 'react';
import { Copy, Download, Folder, RefreshCw, Trash2 } from 'lucide-react';

import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import type { DrawingController } from './use-drawing-controller';
import type { DrawingExportFormat } from './drawing-editor-types';
import type { DrawingSummary } from './workspace-types';

interface DrawingActionProps {
  controller: DrawingController;
  drawing: DrawingSummary;
  onMoveRequest: (drawing: DrawingSummary) => void;
  trash?: boolean;
}

export function DrawingDropdownActions(props: DrawingActionProps) {
  if (props.trash) {
    return (
      <>
        <DropdownMenuItem
          onSelect={() => void props.controller.restore(props.drawing.id)}
        >
          <RefreshCw /> 恢复
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => permanentlyDelete(props)}
        >
          <Trash2 /> 永久删除
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <>
      <DropdownMenuItem onSelect={() => requestMarkdown(props)}>
        <Copy /> 复制 Markdown 引用
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {props.drawing.kind === 'mindmap' ? (
        <DropdownMenuItem onSelect={() => requestExport(props, 'mindmap')}>
          <Download /> 导出 .markune-mindmap.json
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem onSelect={() => requestExport(props, 'excalidraw')}>
          <Download /> 导出 .excalidraw
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => requestExport(props, 'png')}>
        <Download /> 导出 PNG
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => requestExport(props, 'svg')}>
        <Download /> 导出 SVG
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => void props.controller.duplicate(props.drawing.id)}
      >
        <Copy /> 创建副本
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onMoveRequest(props.drawing)}>
        <Folder /> 移动到…
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => void props.controller.moveToTrash(props.drawing.id)}
      >
        <Trash2 /> 移到回收站
      </DropdownMenuItem>
    </>
  );
}

export function DrawingContextActions(props: DrawingActionProps) {
  if (props.trash) {
    return (
      <>
        <ContextMenuItem
          onSelect={() => void props.controller.restore(props.drawing.id)}
        >
          <RefreshCw /> 恢复
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => permanentlyDelete(props)}
        >
          <Trash2 /> 永久删除
        </ContextMenuItem>
      </>
    );
  }

  return (
    <>
      <ContextMenuItem onSelect={() => requestMarkdown(props)}>
        <Copy /> 复制 Markdown 引用
      </ContextMenuItem>
      <ContextMenuSeparator />
      {props.drawing.kind === 'mindmap' ? (
        <ContextMenuItem onSelect={() => requestExport(props, 'mindmap')}>
          <Download /> 导出 .markune-mindmap.json
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onSelect={() => requestExport(props, 'excalidraw')}>
          <Download /> 导出 .excalidraw
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => requestExport(props, 'png')}>
        <Download /> 导出 PNG
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => requestExport(props, 'svg')}>
        <Download /> 导出 SVG
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() => void props.controller.duplicate(props.drawing.id)}
      >
        <Copy /> 创建副本
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => props.onMoveRequest(props.drawing)}>
        <Folder /> 移动到…
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => void props.controller.moveToTrash(props.drawing.id)}
      >
        <Trash2 /> 移到回收站
      </ContextMenuItem>
    </>
  );
}

function requestMarkdown({ controller, drawing }: DrawingActionProps) {
  void controller.requestDrawingAction(drawing.id, { kind: 'copy-markdown' });
}

function requestExport(
  { controller, drawing }: DrawingActionProps,
  format: DrawingExportFormat,
) {
  void controller.requestDrawingAction(drawing.id, { format, kind: 'export' });
}

function permanentlyDelete({ controller, drawing }: DrawingActionProps) {
  if (window.confirm(`永久删除“${drawing.title}”？此操作不可撤销。`)) {
    void controller.permanentlyDelete(drawing.id);
  }
}

'use client';

import dynamic from 'next/dynamic';

import type { MindMapEditorCanvasProps } from './drawing-editor-types';

export const MindMapEditorDynamic = dynamic<MindMapEditorCanvasProps>(
  async () => {
    const editorModule = await import('./mindmap-editor-canvas');
    return editorModule.MindMapEditorCanvas;
  },
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载脑图…
      </div>
    ),
    ssr: false,
  },
);

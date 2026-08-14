'use client';

import dynamic from 'next/dynamic';

import type { DrawingEditorCanvasProps } from './drawing-editor-types';

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

export const DrawingEditorDynamic = dynamic<DrawingEditorCanvasProps>(
  async () => {
    window.EXCALIDRAW_ASSET_PATH = '/excalidraw-runtime/';
    await ensureExcalidrawStyles();
    const editorModule = await import('./drawing-editor-canvas');
    return editorModule.DrawingEditorCanvas;
  },
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载画板…
      </div>
    ),
    ssr: false,
  },
);

function ensureExcalidrawStyles() {
  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-markune-excalidraw-styles="true"]',
  );
  if (existing?.sheet) return Promise.resolve();
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Excalidraw 样式加载失败。')), {
        once: true,
      });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.dataset.markuneExcalidrawStyles = 'true';
    link.href = '/excalidraw-runtime/index.css';
    link.rel = 'stylesheet';
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error('Excalidraw 样式加载失败。')), {
      once: true,
    });
    document.head.append(link);
  });
}

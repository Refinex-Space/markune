import type { DrawingSavePayload } from './use-drawing-controller';
import type { DrawingKind, DrawingViewport } from './workspace-types';

export type DrawingExportFormat = 'excalidraw' | 'mindmap' | 'png' | 'svg';

export interface DrawingEditorActions {
  createPreview: () => Promise<Uint8Array | null>;
  exportBytes: (format: DrawingExportFormat) => Promise<Uint8Array>;
  flush: (forceSave?: boolean, overwriteConflict?: boolean) => Promise<void>;
  mindmap?: {
    collapseToLevel: (level: number) => void;
    fit: () => void;
    setDirection: (direction: 'both' | 'down' | 'left' | 'right') => void;
  };
}

export interface DrawingEditorCanvasProps {
  autoSaveBlocked: boolean;
  favorite: boolean;
  initialLibrary: string | null;
  initialScene: string;
  tags: string[];
  theme: 'dark' | 'light';
  title: string;
  viewport: DrawingViewport | null;
  onDirty: () => void;
  onLibraryChange: (library: string) => Promise<void>;
  onReady: (actions: DrawingEditorActions | null) => void;
  onSave: (payload: DrawingSavePayload, force?: boolean) => Promise<void>;
  onViewportChange: (viewport: DrawingViewport) => void;
}

export interface MindMapEditorCanvasProps {
  autoSaveBlocked: boolean;
  favorite: boolean;
  initialContent: string;
  tags: string[];
  theme: 'dark' | 'light';
  title: string;
  viewport: DrawingViewport | null;
  onDirty: () => void;
  onReady: (actions: DrawingEditorActions | null) => void;
  onSave: (payload: DrawingSavePayload, force?: boolean) => Promise<void>;
  onViewportChange: (viewport: DrawingViewport) => void;
}

export function drawingExportFormats(kind: DrawingKind): DrawingExportFormat[] {
  return kind === 'mindmap'
    ? ['mindmap', 'png', 'svg']
    : ['excalidraw', 'png', 'svg'];
}

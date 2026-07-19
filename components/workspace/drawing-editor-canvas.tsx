'use client';

import * as React from 'react';
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  hashElementsVersion,
  loadLibraryFromBlob,
  serializeAsJSON,
  serializeLibraryAsJSON,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { openUrl } from '@tauri-apps/plugin-opener';

import type {
  DrawingEditorActions,
  DrawingEditorCanvasProps,
  DrawingExportFormat,
} from './drawing-editor-types';

const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTOSAVE_MAX_WAIT_MS = 5_000;

export function DrawingEditorCanvas({
  autoSaveBlocked,
  favorite,
  initialLibrary,
  initialScene,
  tags,
  theme,
  title,
  viewport,
  onDirty,
  onLibraryChange,
  onReady,
  onSave,
  onViewportChange,
}: DrawingEditorCanvasProps) {
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = React.useRef<readonly ExcalidrawElement[]>([]);
  const appStateRef = React.useRef<AppState | null>(null);
  const filesRef = React.useRef<BinaryFiles>({});
  const initialSignatureRef = React.useRef<string | null>(null);
  const lastObservedSignatureRef = React.useRef<string | null>(null);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const lastSavedMetadataSignatureRef = React.useRef(
    drawingMetadataSignature({ favorite, tags, title }),
  );
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef<Promise<void> | null>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const maxWaitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const propsRef = React.useRef({ favorite, tags, title });
  const blockedRef = React.useRef(autoSaveBlocked);
  const onDirtyRef = React.useRef(onDirty);
  const onLibraryChangeRef = React.useRef(onLibraryChange);
  const onReadyRef = React.useRef(onReady);
  const onSaveRef = React.useRef(onSave);

  React.useEffect(() => {
    propsRef.current = { favorite, tags, title };
    blockedRef.current = autoSaveBlocked;
    onDirtyRef.current = onDirty;
    onLibraryChangeRef.current = onLibraryChange;
    onReadyRef.current = onReady;
    onSaveRef.current = onSave;
  }, [autoSaveBlocked, favorite, onDirty, onLibraryChange, onReady, onSave, tags, title]);

  const initialData = React.useMemo(
    () => async () => {
      const parsed = JSON.parse(initialScene) as {
        appState?: Partial<AppState>;
        elements?: readonly ExcalidrawElement[];
        files?: BinaryFiles;
      };
      const libraryItems = initialLibrary
        ? await loadLibraryFromBlob(
            new Blob([initialLibrary], {
              type: 'application/vnd.excalidrawlib+json',
            }),
          )
        : [];

      return {
        appState: {
          ...parsed.appState,
          ...(viewport
            ? {
                scrollX: viewport.scrollX,
                scrollY: viewport.scrollY,
                zoom: { value: viewport.zoom as AppState['zoom']['value'] },
              }
            : {}),
          theme,
        },
        elements: parsed.elements ?? [],
        files: parsed.files ?? {},
        libraryItems,
      };
    },
    [initialLibrary, initialScene, theme, viewport],
  );

  const clearTimers = React.useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    debounceTimerRef.current = null;
    maxWaitTimerRef.current = null;
  }, []);

  const createPreview = React.useCallback(async () => {
    const appState = appStateRef.current;
    const elements = elementsRef.current.filter((element) => !element.isDeleted);
    if (!appState || elements.length === 0) return null;
    try {
      const blob = await exportToBlob({
        appState: {
          ...appState,
          exportBackground: true,
          exportEmbedScene: false,
          exportScale: 1,
        },
        elements,
        exportPadding: 16,
        files: filesRef.current,
        maxWidthOrHeight: 640,
        mimeType: 'image/webp',
        quality: 0.82,
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return isWebp(bytes) ? bytes : null;
    } catch {
      return null;
    }
  }, []);

  const createSavePayload = React.useCallback(async () => {
    const appState = appStateRef.current;
    if (!appState) return null;
    const elements = elementsRef.current;
    const files = filesRef.current;
    const scene = serializeAsJSON(elements, appState, files, 'local');
    const elementCount = elements.filter((element) => !element.isDeleted).length;
    const searchText = elements
      .filter((element) => !element.isDeleted)
      .flatMap((element) => {
        const candidate = element as ExcalidrawElement & {
          link?: string | null;
          originalText?: string;
          text?: string;
        };
        return [candidate.text, candidate.originalText, candidate.link].filter(
          (value): value is string => Boolean(value),
        );
      })
      .join(' ');
    const current = propsRef.current;
    return {
      manifest: {
        elementCount,
        favorite: current.favorite,
        searchText,
        tags: current.tags,
        title: current.title,
      },
      preview: await createPreview(),
      scene: new TextEncoder().encode(scene),
    };
  }, [createPreview]);

  const flush = React.useCallback(
    async (forceSave = false, overwriteConflict = false) => {
      clearTimers();
      if (
        (!dirtyRef.current && !forceSave) ||
        (blockedRef.current && !overwriteConflict)
      )
        return;
      if (savingRef.current) {
        await savingRef.current;
        if (!dirtyRef.current || blockedRef.current) return;
      }
      const payload = await createSavePayload();
      if (!payload) return;
      const metadataSignatureAtStart = drawingMetadataSignature(propsRef.current);
      const signatureAtStart = sceneSignature(
        elementsRef.current,
        appStateRef.current,
        filesRef.current,
      );
      const saving = onSaveRef.current(payload, overwriteConflict)
        .then(() => {
          lastSavedSignatureRef.current = signatureAtStart;
          lastSavedMetadataSignatureRef.current = metadataSignatureAtStart;
          dirtyRef.current =
            sceneSignature(
              elementsRef.current,
              appStateRef.current,
              filesRef.current,
            ) !== signatureAtStart ||
            drawingMetadataSignature(propsRef.current) !== metadataSignatureAtStart;
        })
        .finally(() => {
          savingRef.current = null;
        });
      savingRef.current = saving;
      await saving;
    },
    [clearTimers, createSavePayload],
  );

  const scheduleSave = React.useCallback(() => {
    if (blockedRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    maxWaitTimerRef.current ??= setTimeout(
      () => void flush(),
      AUTOSAVE_MAX_WAIT_MS,
    );
  }, [flush]);

  React.useEffect(() => {
    const signature = drawingMetadataSignature({ favorite, tags, title });
    if (signature === lastSavedMetadataSignatureRef.current) return;
    dirtyRef.current = true;
    onDirtyRef.current();
    scheduleSave();
  }, [favorite, scheduleSave, tags, title]);

  const exportBytes = React.useCallback(
    async (format: DrawingExportFormat) => {
      const appState = appStateRef.current;
      if (!appState) throw new Error('画布尚未就绪。');
      const elements = elementsRef.current.filter((element) => !element.isDeleted);
      const files = filesRef.current;
      if (format === 'excalidraw') {
        return new TextEncoder().encode(
          serializeAsJSON(elementsRef.current, appState, files, 'local'),
        );
      }
      if (format === 'png') {
        const blob = await exportToBlob({
          appState,
          elements,
          exportPadding: 16,
          files,
          mimeType: 'image/png',
        });
        return new Uint8Array(await blob.arrayBuffer());
      }
      const svg = await exportToSvg({
        appState,
        elements,
        exportPadding: 16,
        files,
        renderEmbeddables: false,
      });
      return new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
    },
    [],
  );

  React.useEffect(() => {
    const actions: DrawingEditorActions = {
      createPreview,
      exportBytes,
      flush,
    };
    onReadyRef.current(actions);
    return () => {
      clearTimers();
      if (dirtyRef.current && !blockedRef.current) void flush();
      onReadyRef.current(null);
    };
  }, [clearTimers, createPreview, exportBytes, flush]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        void flush(true, false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [flush]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden" data-testid="drawing-canvas">
      <Excalidraw
        UIOptions={{
          canvasActions: {
            export: { saveFileToDisk: false },
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        aiEnabled={false}
        autoFocus
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={initialData}
        langCode="zh-CN"
        name={title}
        theme={theme}
        validateEmbeddable={false}
        onChange={(elements, appState, files) => {
          elementsRef.current = elements;
          appStateRef.current = appState;
          filesRef.current = files;
          const signature = sceneSignature(elements, appState, files);
          if (initialSignatureRef.current === null) {
            initialSignatureRef.current = signature;
            lastObservedSignatureRef.current = signature;
            lastSavedSignatureRef.current = signature;
            return;
          }
          if (signature === lastObservedSignatureRef.current) return;
          lastObservedSignatureRef.current = signature;
          if (signature === lastSavedSignatureRef.current) {
            dirtyRef.current =
              drawingMetadataSignature(propsRef.current) !==
              lastSavedMetadataSignatureRef.current;
            if (!dirtyRef.current) clearTimers();
            return;
          }
          dirtyRef.current = true;
          onDirtyRef.current();
          scheduleSave();
        }}
        onLibraryChange={(items: LibraryItems) =>
          onLibraryChangeRef.current(serializeLibraryAsJSON(items))
        }
        onLinkOpen={(element, event) => {
          event.preventDefault();
          const link = element.link?.trim();
          if (link && /^https?:\/\//i.test(link)) void openUrl(link);
        }}
        onScrollChange={(scrollX, scrollY, zoom) =>
          onViewportChange({ scrollX, scrollY, zoom: zoom.value })
        }
      />
    </div>
  );
}

function sceneSignature(
  elements: readonly ExcalidrawElement[],
  appState: AppState | null,
  files: BinaryFiles,
) {
  const fileSignature = Object.entries(files)
    .map(([id, file]) => `${id}:${file.created}:${file.lastRetrieved ?? ''}`)
    .sort()
    .join('|');
  return [
    hashElementsVersion(elements),
    fileSignature,
    appState?.viewBackgroundColor ?? '',
    appState?.gridSize ?? '',
    appState?.gridStep ?? '',
  ].join(':');
}

function drawingMetadataSignature({
  favorite,
  tags,
  title,
}: {
  favorite: boolean;
  tags: string[];
  title: string;
}) {
  return JSON.stringify([title, tags, favorite]);
}

function isWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

'use client';

import * as React from 'react';
import 'mind-elixir/style.css';
import MindElixir, {
  type MindElixirData,
  type MindElixirInstance,
  type NodeObj,
  type Theme,
} from 'mind-elixir';
import { zh_CN } from 'mind-elixir/i18n';

import type {
  DrawingEditorActions,
  DrawingExportFormat,
  MindMapEditorCanvasProps,
} from './drawing-editor-types';

const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTOSAVE_MAX_WAIT_MS = 5_000;

interface MarkuneMindMapDocument {
  data: MindElixirData;
  type: 'markune-mindmap';
  version: 1;
}

export function MindMapEditorCanvas({
  autoSaveBlocked,
  favorite,
  initialContent,
  tags,
  theme,
  title,
  viewport,
  onDirty,
  onReady,
  onSave,
  onViewportChange,
}: MindMapEditorCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mindRef = React.useRef<MindElixirInstance | null>(null);
  const dirtyRef = React.useRef(false);
  const blockedRef = React.useRef(autoSaveBlocked);
  const savingRef = React.useRef<Promise<void> | null>(null);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = React.useRef('');
  const lastMetadataSignatureRef = React.useRef(
    metadataSignature({ favorite, tags, title }),
  );
  const propsRef = React.useRef({ favorite, tags, title });
  const callbacksRef = React.useRef({ onDirty, onReady, onSave, onViewportChange });
  const initialThemeRef = React.useRef(theme);
  const initialViewportRef = React.useRef(viewport);
  const viewportRef = React.useRef({
    scrollX: viewport?.scrollX ?? 0,
    scrollY: viewport?.scrollY ?? 0,
    zoom: viewport?.zoom ?? 1,
  });

  React.useEffect(() => {
    blockedRef.current = autoSaveBlocked;
    propsRef.current = { favorite, tags, title };
    callbacksRef.current = { onDirty, onReady, onSave, onViewportChange };
  }, [autoSaveBlocked, favorite, onDirty, onReady, onSave, onViewportChange, tags, title]);

  const clearTimers = React.useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
    debounceTimerRef.current = null;
    maxWaitTimerRef.current = null;
  }, []);

  const createPreview = React.useCallback(async () => {
    const blob = await mindRef.current?.exportPng(true);
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return isPng(bytes) ? bytes : null;
  }, []);

  const createPayload = React.useCallback(async () => {
    const mind = mindRef.current;
    if (!mind) return null;
    const data = normalizeMindMapData(mind.getData());
    const document: MarkuneMindMapDocument = {
      data,
      type: 'markune-mindmap',
      version: 1,
    };
    const current = propsRef.current;
    return {
      content: new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`),
      manifest: {
        favorite: current.favorite,
        itemCount: countNodes(data.nodeData),
        kind: 'mindmap' as const,
        searchText: collectTopics(data.nodeData).join(' '),
        tags: current.tags,
        title: current.title,
      },
      preview: await createPreview(),
    };
  }, [createPreview]);

  const flush = React.useCallback(
    async (forceSave = false, overwriteConflict = false) => {
      clearTimers();
      if ((!dirtyRef.current && !forceSave) || (blockedRef.current && !overwriteConflict)) {
        return;
      }
      if (savingRef.current) await savingRef.current;
      const payload = await createPayload();
      const mind = mindRef.current;
      if (!payload || !mind) return;
      const signatureAtStart = contentSignature(mind.getData());
      const metadataAtStart = metadataSignature(propsRef.current);
      const saving = callbacksRef.current
        .onSave(payload, overwriteConflict)
        .then(() => {
          lastSavedSignatureRef.current = signatureAtStart;
          lastMetadataSignatureRef.current = metadataAtStart;
          dirtyRef.current =
            contentSignature(mind.getData()) !== signatureAtStart ||
            metadataSignature(propsRef.current) !== metadataAtStart;
        })
        .finally(() => {
          savingRef.current = null;
        });
      savingRef.current = saving;
      await saving;
    },
    [clearTimers, createPayload],
  );

  const scheduleSave = React.useCallback(() => {
    if (blockedRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    maxWaitTimerRef.current ??= setTimeout(() => void flush(), AUTOSAVE_MAX_WAIT_MS);
  }, [flush]);

  const markChanged = React.useCallback(() => {
    const mind = mindRef.current;
    if (!mind || contentSignature(mind.getData()) === lastSavedSignatureRef.current) return;
    dirtyRef.current = true;
    callbacksRef.current.onDirty();
    scheduleSave();
  }, [scheduleSave]);

  const exportBytes = React.useCallback(async (format: DrawingExportFormat) => {
    const mind = mindRef.current;
    if (!mind) throw new Error('脑图尚未就绪。');
    if (format === 'mindmap') {
      const document: MarkuneMindMapDocument = {
        data: normalizeMindMapData(mind.getData()),
        type: 'markune-mindmap',
        version: 1,
      };
      return new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);
    }
    if (format === 'png') {
      const blob = await mind.exportPng(true);
      if (!blob) throw new Error('脑图 PNG 导出失败。');
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (format === 'svg') {
      const blob = mind.exportSvg(true);
      return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('脑图不支持该导出格式。');
  }, []);

  React.useEffect(() => {
    const signature = metadataSignature({ favorite, tags, title });
    if (signature === lastMetadataSignatureRef.current) return;
    dirtyRef.current = true;
    callbacksRef.current.onDirty();
    scheduleSave();
  }, [favorite, scheduleSave, tags, title]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parsed = parseMindMapDocument(initialContent);
    const mind = new MindElixir({
      allowUndo: true,
      compact: Boolean(parsed.data.compact),
      contextMenu: { locale: zh_CN },
      direction: parsed.data.direction ?? MindElixir.RIGHT,
      editable: true,
      el: container,
      keypress: true,
      newTopicName: '新节点',
      // Mind Elixir 5.15.1 skips its pointer and keyboard listener setup when
      // overflowHidden is true. Markune's outer canvas already owns clipping.
      overflowHidden: false,
      theme: markuneMindMapTheme(initialThemeRef.current),
      toolBar: false,
    });
    const initializationError = mind.init(parsed.data);
    if (initializationError) throw initializationError;
    mindRef.current = mind;
    const initialViewport = initialViewportRef.current;
    if (initialViewport) {
      mind.scale(initialViewport.zoom);
      mind.move(initialViewport.scrollX, initialViewport.scrollY);
    } else {
      mind.scaleFit();
    }
    lastSavedSignatureRef.current = contentSignature(mind.getData());
    const handleOperation = () => markChanged();
    const handleDirection = () => markChanged();
    const handleScale = (zoom: number) => {
      viewportRef.current.zoom = zoom;
      callbacksRef.current.onViewportChange(viewportRef.current);
    };
    const handleMove = ({ dx, dy }: { dx: number; dy: number }) => {
      viewportRef.current.scrollX += dx;
      viewportRef.current.scrollY += dy;
      callbacksRef.current.onViewportChange(viewportRef.current);
    };
    mind.bus.addListener('operation', handleOperation);
    mind.bus.addListener('changeDirection', handleDirection);
    mind.bus.addListener('scale', handleScale);
    mind.bus.addListener('move', handleMove);

    const actions: DrawingEditorActions = {
      createPreview,
      exportBytes,
      flush,
      mindmap: {
        collapseToLevel(level) {
          const data = normalizeMindMapData(mind.getData());
          setExpansion(data.nodeData, 0, level);
          mind.refresh(data);
          markChanged();
        },
        fit() {
          mind.scaleFit();
        },
        setDirection(direction) {
          if (direction === 'left') mind.initLeft();
          else if (direction === 'right') mind.initRight();
          else if (direction === 'both') mind.initSide();
          else mind.initDown();
          markChanged();
        },
      },
    };
    callbacksRef.current.onReady(actions);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!container.contains(document.activeElement)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        void flush(true, false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      mind.bus.removeListener('operation', handleOperation);
      mind.bus.removeListener('changeDirection', handleDirection);
      mind.bus.removeListener('scale', handleScale);
      mind.bus.removeListener('move', handleMove);
      clearTimers();
      if (dirtyRef.current && !blockedRef.current) void flush();
      callbacksRef.current.onReady(null);
      mind.destroy();
      mindRef.current = null;
    };
  }, [clearTimers, createPreview, exportBytes, flush, initialContent, markChanged]);

  React.useEffect(() => {
    mindRef.current?.changeTheme(markuneMindMapTheme(theme), true);
  }, [theme]);

  return (
    <div
      className="markune-mindmap h-full min-h-0 w-full overflow-hidden bg-background"
      data-testid="mindmap-canvas"
      ref={containerRef}
      tabIndex={0}
    />
  );
}

export function parseMindMapDocument(content: string): MarkuneMindMapDocument {
  const parsed = JSON.parse(content) as Partial<MarkuneMindMapDocument>;
  if (parsed.type !== 'markune-mindmap' || parsed.version !== 1 || !parsed.data?.nodeData) {
    throw new Error('脑图内容格式无效。');
  }
  return parsed as MarkuneMindMapDocument;
}

export function normalizeMindMapData(data: MindElixirData): MindElixirData {
  return {
    arrows: (data.arrows ?? []).map((arrow) => ({
      bidirectional: arrow.bidirectional,
      delta1: arrow.delta1,
      delta2: arrow.delta2,
      from: arrow.from,
      id: arrow.id,
      label: arrow.label ?? '',
      to: arrow.to,
    })),
    compact: Boolean(data.compact),
    direction: data.direction ?? MindElixir.RIGHT,
    nodeData: normalizeNode(data.nodeData),
    summaries: (data.summaries ?? []).map((summary) => ({
      end: summary.end,
      id: summary.id,
      label: summary.label ?? '',
      parent: summary.parent,
      start: summary.start,
    })),
  };
}

function normalizeNode(node: NodeObj): NodeObj {
  return {
    children: (node.children ?? []).map(normalizeNode),
    direction: node.direction,
    expanded: node.expanded,
    id: String(node.id),
    note: typeof node.note === 'string' ? node.note : undefined,
    topic: String(node.topic).trim() || '未命名节点',
  };
}

function contentSignature(data: MindElixirData) {
  return JSON.stringify(normalizeMindMapData(data));
}

function metadataSignature({
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

function countNodes(node: NodeObj): number {
  return 1 + (node.children ?? []).reduce((count, child) => count + countNodes(child), 0);
}

function collectTopics(node: NodeObj): string[] {
  return [node.topic, ...(node.children ?? []).flatMap(collectTopics)];
}

function setExpansion(node: NodeObj, depth: number, level: number) {
  node.expanded = depth < level;
  for (const child of node.children ?? []) setExpansion(child, depth + 1, level);
}

function markuneMindMapTheme(mode: 'dark' | 'light'): Theme {
  const dark = mode === 'dark';
  return {
    cssVar: {
      '--accent-color': dark ? '#818cf8' : '#4f46e5',
      '--bgcolor': dark ? '#111827' : '#ffffff',
      '--color': dark ? '#e5e7eb' : '#1f2937',
      '--main-bgcolor': dark ? '#1f2937' : '#f8fafc',
      '--main-bgcolor-transparent': dark ? '#1f2937cc' : '#f8fafccc',
      '--main-color': dark ? '#c7d2fe' : '#3730a3',
      '--main-radius': '10px',
      '--panel-bgcolor': dark ? '#18181b' : '#ffffff',
      '--panel-border-color': dark ? '#3f3f46' : '#e2e8f0',
      '--panel-color': dark ? '#e4e4e7' : '#27272a',
      '--root-bgcolor': dark ? '#4338ca' : '#4f46e5',
      '--root-border-color': dark ? '#818cf8' : '#4338ca',
      '--root-color': '#ffffff',
      '--root-radius': '12px',
      '--selected': dark ? '#312e81' : '#e0e7ff',
      '--topic-padding': '7px 10px',
    },
    name: `markune-${mode}`,
    palette: dark
      ? ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#c084fc']
      : ['#4f46e5', '#0891b2', '#059669', '#d97706', '#e11d48', '#9333ea'],
    type: mode,
  };
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

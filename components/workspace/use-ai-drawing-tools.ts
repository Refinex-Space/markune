'use client';

import * as React from 'react';

import type {
  CodexDynamicToolRequest,
  CodexDynamicToolResponse,
} from './codex-app-server';
import { compileMermaidDrawing } from './ai-drawing-compiler';
import {
  compileAiMindMap,
  type AiMindMapNode,
} from './ai-mindmap-compiler';
import {
  drawingPreviewDataUrl,
  inspectDrawingScene,
  inspectMindMap,
} from './ai-drawing-inspector';
import { AiDrawingPreviewCache } from './ai-drawing-preview-cache';
import type { DrawingController } from './use-drawing-controller';
import {
  beginGeneratedDrawingCreate,
  cancelGeneratedDrawingCreate,
  commitGeneratedDrawingCreate,
  readDrawingMeta,
  readDrawingPreview,
  readDrawingScene,
  stageDrawingPreview,
  stageDrawingScene,
} from './workspace-api';
import type { DrawingDocumentDescriptor } from './workspace-types';

const MAX_PREVIEW_ATTEMPTS_PER_TURN = 3;
const AI_MINDMAP_TARGET_ALBUM_KEY = 'markune:ai-mindmap-target-album';

function selectedAlbumPath(controller: DrawingController) {
  if (controller.selection.kind === 'album') return controller.selection.path;
  if (
    controller.selection.kind === 'drawing' &&
    controller.descriptor?.meta.id === controller.selection.id
  ) {
    return controller.descriptor.albumPath;
  }
  return '';
}

export function useAiDrawingTools({
  controller,
  onCreated,
  workspaceRootPath,
}: {
  controller: DrawingController;
  onCreated: (drawing: DrawingDocumentDescriptor) => Promise<void> | void;
  workspaceRootPath: string | null;
}) {
  const cacheRef = React.useRef(new AiDrawingPreviewCache());
  const previewAttemptsRef = React.useRef(new Map<string, number>());
  const targetAlbumsRef = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    const cache = cacheRef.current;
    const attempts = previewAttemptsRef.current;
    const clear = () => {
      cache.clear();
      attempts.clear();
      targetAlbumsRef.current.clear();
      window.sessionStorage.removeItem(AI_MINDMAP_TARGET_ALBUM_KEY);
    };
    clear();
    window.addEventListener('markune:codex-runtime-stopped', clear);
    return () => {
      window.removeEventListener('markune:codex-runtime-stopped', clear);
      clear();
    };
  }, [workspaceRootPath]);

  return React.useCallback(
    async (
      request: CodexDynamicToolRequest,
    ): Promise<CodexDynamicToolResponse> => {
      if (!workspaceRootPath) {
        return { success: false, text: '请先打开一个 Markune 工作区。' };
      }
      if (request.namespace !== 'markune_drawing') {
        return { success: false, text: 'Markune 拒绝未知动态工具命名空间。' };
      }
      if (request.tool === 'inspect_drawing') {
        const drawingId = request.arguments.drawingId;
        if (typeof drawingId !== 'string') {
          return { success: false, text: 'inspect_drawing 参数无效。' };
        }
        try {
          const descriptor = await readDrawingMeta(workspaceRootPath, drawingId);
          const scene = await readDrawingScene(workspaceRootPath, drawingId);
          let text =
            descriptor.meta.kind === 'mindmap'
              ? inspectMindMap(descriptor, new TextDecoder().decode(scene))
              : inspectDrawingScene(descriptor, new TextDecoder().decode(scene));
          let imageDataUrl: string | undefined;
          if (descriptor.hasPreview) {
            try {
              imageDataUrl = drawingPreviewDataUrl(
                await readDrawingPreview(workspaceRootPath, drawingId),
              );
            } catch {
              const inspection = JSON.parse(text) as { warnings: string[] };
              inspection.warnings.push('图稿预览暂时无法读取，已返回场景结构摘要。');
              text = JSON.stringify(inspection);
            }
          }
          return { imageDataUrl, success: true, text };
        } catch (error) {
          return {
            success: false,
            text: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (request.tool === 'preview_mermaid') {
        const attempts = previewAttemptsRef.current.get(request.turnId) ?? 0;
        if (attempts >= MAX_PREVIEW_ATTEMPTS_PER_TURN) {
          return {
            success: false,
            text: '本次画图已达到 3 次预览上限（初稿加两次修复）。请说明仍存在的问题，不要继续重试。',
          };
        }
        previewAttemptsRef.current.set(request.turnId, attempts + 1);
        targetAlbumsRef.current.set(
          request.turnId,
          targetAlbumsRef.current.get(request.turnId) ?? selectedAlbumPath(controller),
        );
        const title = request.arguments.title;
        const definition = request.arguments.definition;
        const profile = request.arguments.profile;
        if (
          typeof title !== 'string' ||
          typeof definition !== 'string' ||
          !['architecture', 'default', 'flow'].includes(String(profile))
        ) {
          return { success: false, text: 'preview_mermaid 参数无效。' };
        }
        try {
          const drawing = await compileMermaidDrawing(
            title,
            definition,
            profile as 'architecture' | 'default' | 'flow',
          );
          const previewId = cacheRef.current.put(
            drawing,
            workspaceRootPath,
            request.turnId,
          );
          return {
            imageDataUrl: drawing.previewDataUrl,
            success: true,
            text: JSON.stringify({
              diagramType: drawing.diagramType,
              elementCount: drawing.elementCount,
              previewId,
              profile: drawing.profile,
              quality: drawing.quality,
              title: drawing.title,
              warnings: drawing.warnings,
            }),
          };
        } catch (error) {
          return {
            success: false,
            text: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (request.tool === 'preview_mindmap') {
        const attempts = previewAttemptsRef.current.get(request.turnId) ?? 0;
        if (attempts >= MAX_PREVIEW_ATTEMPTS_PER_TURN) {
          return {
            success: false,
            text: '本次脑图已达到 3 次预览上限。请说明仍存在的问题，不要继续重试。',
          };
        }
        previewAttemptsRef.current.set(request.turnId, attempts + 1);
        if (!targetAlbumsRef.current.has(request.turnId)) {
          const pendingTarget = window.sessionStorage.getItem(
            AI_MINDMAP_TARGET_ALBUM_KEY,
          );
          window.sessionStorage.removeItem(AI_MINDMAP_TARGET_ALBUM_KEY);
          targetAlbumsRef.current.set(
            request.turnId,
            pendingTarget ?? selectedAlbumPath(controller),
          );
        }
        const { direction, root, title } = request.arguments;
        if (
          typeof title !== 'string' ||
          !['both', 'down', 'right'].includes(String(direction)) ||
          !root ||
          typeof root !== 'object' ||
          Array.isArray(root)
        ) {
          return { success: false, text: 'preview_mindmap 参数无效。' };
        }
        try {
          const drawing = await compileAiMindMap(
            title,
            direction as 'both' | 'down' | 'right',
            root as AiMindMapNode,
          );
          const previewId = cacheRef.current.put(
            drawing,
            workspaceRootPath,
            request.turnId,
          );
          return {
            imageDataUrl: drawing.previewDataUrl || undefined,
            success: true,
            text: JSON.stringify({
              direction: drawing.direction,
              itemCount: drawing.itemCount,
              previewId,
              quality: drawing.quality,
              title: drawing.title,
              warnings: drawing.warnings,
            }),
          };
        } catch (error) {
          return {
            success: false,
            text: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (request.tool === 'apply_preview_to_active') {
        const { drawingId, expectedRevision, kind, previewId } =
          request.arguments;
        if (
          typeof previewId !== 'string' ||
          typeof drawingId !== 'string' ||
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision) ||
          !['mindmap', 'whiteboard'].includes(String(kind))
        ) {
          return {
            success: false,
            text: 'apply_preview_to_active 参数无效。',
          };
        }
        try {
          const drawing = cacheRef.current.getForCreate(
            previewId,
            workspaceRootPath,
            request.turnId,
          );
          if (drawing.kind !== kind) {
            return {
              success: false,
              text: 'AI 预览类型与活动图稿类型不一致，未应用。',
            };
          }
          const updated = await controller.applyAiPreview({
            content: drawing.contentBytes,
            drawingId,
            expectedRevision,
            itemCount: drawing.itemCount,
            kind: drawing.kind,
            preview: drawing.previewBytes,
            searchText: drawing.searchText,
            title: drawing.title,
          });
          cacheRef.current.clear();
          previewAttemptsRef.current.delete(request.turnId);
          targetAlbumsRef.current.delete(request.turnId);
          return {
            success: true,
            text: JSON.stringify({
              drawingId: updated.meta.id,
              kind: updated.meta.kind,
              revision: updated.meta.revision,
              title: updated.meta.title,
            }),
          };
        } catch (error) {
          return {
            success: false,
            text: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (request.tool !== 'create_from_preview') {
        return { success: false, text: 'Markune 拒绝未知动态工具。' };
      }
      const previewId = request.arguments.previewId;
      if (typeof previewId !== 'string') {
        return { success: false, text: 'create_from_preview 参数无效。' };
      }
      let sessionId: string | null = null;
      try {
        const drawing = cacheRef.current.getForCreate(
          previewId,
          workspaceRootPath,
          request.turnId,
        );
        const session = await beginGeneratedDrawingCreate(
          workspaceRootPath,
          targetAlbumsRef.current.get(request.turnId) ?? selectedAlbumPath(controller),
          {
            kind: drawing.kind,
            itemCount: drawing.itemCount,
            favorite: false,
            searchText: drawing.searchText,
            tags: [],
            title: drawing.title,
          },
        );
        sessionId = session.sessionId;
        await stageDrawingScene(session.sessionId, drawing.contentBytes);
        await stageDrawingPreview(session.sessionId, drawing.previewBytes);
        const created = await commitGeneratedDrawingCreate(session.sessionId);
        sessionId = null;
        cacheRef.current.clear();
        previewAttemptsRef.current.delete(request.turnId);
        targetAlbumsRef.current.delete(request.turnId);
        await onCreated(created);
        return {
          success: true,
          text: JSON.stringify({
            albumPath: created.albumPath,
            drawingId: created.meta.id,
            kind: created.meta.kind,
            revision: created.meta.revision,
            title: created.meta.title,
          }),
        };
      } catch (error) {
        if (sessionId) {
          await cancelGeneratedDrawingCreate(sessionId).catch(() => undefined);
        }
        return {
          success: false,
          text: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [controller, onCreated, workspaceRootPath],
  );
}

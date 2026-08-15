import type { CompiledAiDrawing } from './ai-drawing-compiler';
import type { CompiledAiMindMap } from './ai-mindmap-compiler';

export type CompiledAiDrawingPreview = CompiledAiDrawing | CompiledAiMindMap;

const MAX_PREVIEWS = 3;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface PreviewEntry {
  createdAt: number;
  drawing: CompiledAiDrawingPreview;
  turnId: string;
  workspaceRootPath: string;
}

export class AiDrawingPreviewCache {
  private readonly entries = new Map<string, PreviewEntry>();

  clear() {
    this.entries.clear();
  }

  delete(previewId: string) {
    this.entries.delete(previewId);
  }

  get(
    previewId: string,
    workspaceRootPath: string,
    turnId: string,
    now = Date.now(),
  ) {
    this.prune(now);
    const entry = this.entries.get(previewId);
    if (
      !entry ||
      entry.workspaceRootPath !== workspaceRootPath ||
      entry.turnId !== turnId
    ) {
      throw new Error('previewId 已过期、不存在，或不属于当前工作区与任务。');
    }
    return entry.drawing;
  }

  getForCreate(
    previewId: string,
    workspaceRootPath: string,
    turnId: string,
    now = Date.now(),
  ) {
    const drawing = this.get(previewId, workspaceRootPath, turnId, now);
    if (!drawing.quality.creatable) {
      const reason = drawing.quality.blockers[0] ?? `质量等级为 ${drawing.quality.grade}`;
      throw new Error(`该预览未通过质量门禁，不能应用或创建：${reason}`);
    }
    return drawing;
  }

  put(
    drawing: CompiledAiDrawingPreview,
    workspaceRootPath: string,
    turnId: string,
    now = Date.now(),
  ) {
    this.prune(now);
    while (this.entries.size >= MAX_PREVIEWS) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
    const previewId = crypto.randomUUID();
    this.entries.set(previewId, {
      createdAt: now,
      drawing,
      turnId,
      workspaceRootPath,
    });
    return previewId;
  }

  private prune(now: number) {
    for (const [previewId, entry] of this.entries) {
      if (entry.createdAt + PREVIEW_TTL_MS <= now) {
        this.entries.delete(previewId);
      }
    }
  }
}

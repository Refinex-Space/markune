import type { CompiledAiDrawing } from './ai-drawing-compiler';

const MAX_PREVIEWS = 3;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

interface PreviewEntry {
  createdAt: number;
  drawing: CompiledAiDrawing;
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

  get(previewId: string, workspaceRootPath: string, now = Date.now()) {
    this.prune(now);
    const entry = this.entries.get(previewId);
    if (!entry || entry.workspaceRootPath !== workspaceRootPath) {
      throw new Error('previewId 已过期、不存在或属于其他工作区。');
    }
    return entry.drawing;
  }

  put(drawing: CompiledAiDrawing, workspaceRootPath: string, now = Date.now()) {
    this.prune(now);
    while (this.entries.size >= MAX_PREVIEWS) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
    const previewId = crypto.randomUUID();
    this.entries.set(previewId, { createdAt: now, drawing, workspaceRootPath });
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

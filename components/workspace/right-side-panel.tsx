'use client';

import * as React from 'react';
import { Openai } from '@thesvg/react';
import { Info, Palette, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { DocumentMetaPanel } from './document-meta-panel';
import { AiPanel } from './ai-panel';
import type {
  CodexDynamicToolRequest,
  CodexDynamicToolResponse,
} from './codex-app-server';
import type {
  AiProposedPlan,
  AiWorkspaceChangeEvent,
} from './ai-panel-state';
import type {
  AiDrawingReference,
  RightPanelMode,
  WorkspaceNode,
  WorkspaceSearchResult,
} from './workspace-types';
import { WorkspaceResizeHandle } from './workspace-resize-handle';

export type AiPanelPresentation = 'panel' | 'workspace';

export interface DocumentPanelData {
  frontmatter: Record<string, string>;
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
}

interface RightSidePanelProps {
  activeDrawing?: AiDrawingReference | null;
  aiPresentation?: AiPanelPresentation;
  aiWorkspacePreview?: React.ReactNode;
  aiWorkspacePreviewWidth?: number;
  currentDocument: WorkspaceNode | null;
  currentDocumentPath: string | null;
  documentPanelData: DocumentPanelData | null;
  documents: WorkspaceSearchResult[];
  drawings?: AiDrawingReference[];
  documentReadOnly: boolean;
  mode: RightPanelMode;
  width: number;
  workspaceRootPath: string | null;
  onBeforeTurnStart: (
    documentPath: string | null,
    drawingId: string | null,
  ) => Promise<boolean>;
  onDrawingToolCall?: (
    request: CodexDynamicToolRequest,
  ) => Promise<CodexDynamicToolResponse>;
  onAiWorkspacePreviewResize?: (width: number) => void;
  onOpenDocument: (documentPath: string) => void;
  onOpenPlanPreview: (plan: AiProposedPlan, threadId: string) => void;
  onWorkspaceChanged: (
    event: AiWorkspaceChangeEvent,
  ) => void | Promise<void>;
  onToggleDocumentReadOnly?: () => void;
}

interface RightToolRailProps {
  mode: RightPanelMode;
  orientation?: 'header' | 'rail';
  showSettingsButton?: boolean;
  onModeChange: (mode: RightPanelMode) => void;
  onOpenSettings: () => void;
}

export function RightSidePanel({
  activeDrawing = null,
  aiPresentation = 'panel',
  aiWorkspacePreview,
  aiWorkspacePreviewWidth = 720,
  currentDocument,
  currentDocumentPath,
  documentPanelData,
  documents,
  drawings = [],
  documentReadOnly,
  mode,
  width,
  workspaceRootPath,
  onBeforeTurnStart,
  onDrawingToolCall,
  onAiWorkspacePreviewResize,
  onOpenDocument,
  onOpenPlanPreview,
  onWorkspaceChanged,
  onToggleDocumentReadOnly,
}: RightSidePanelProps) {
  const aiVisible = mode === 'ai';
  const workspacePresentation = aiPresentation === 'workspace';

  return (
    <>
      <aside
        aria-hidden={!aiVisible}
        className={cn(
          'h-full min-h-0 min-w-0 overflow-hidden bg-background',
          aiVisible ? 'flex' : 'hidden',
          workspacePresentation
            ? 'flex-1'
            : 'shrink-0 border-l border-border/70',
        )}
        data-presentation={aiPresentation}
        data-testid="ai-side-panel"
        hidden={!aiVisible}
        style={workspacePresentation ? undefined : { width }}
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <AiPanel
              activeDrawing={activeDrawing}
              currentDocument={currentDocument}
              currentDocumentPath={currentDocumentPath}
              documents={documents}
              drawings={drawings}
              presentation={aiPresentation}
              visible={aiVisible}
              workspaceRootPath={workspaceRootPath}
              onBeforeTurnStart={onBeforeTurnStart}
              onDrawingToolCall={onDrawingToolCall}
              onOpenDocument={onOpenDocument}
              onOpenPlanPreview={onOpenPlanPreview}
              onWorkspaceChanged={onWorkspaceChanged}
            />
          </div>

          {workspacePresentation && aiWorkspacePreview ? (
            <div
              aria-label="文档预览"
              className="absolute bottom-1 right-2 top-1 z-40 flex max-w-[calc(100%-320px)] shrink-0 animate-in overflow-hidden rounded-lg border border-border/60 bg-background shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] duration-200 fade-in-0 slide-in-from-right-4 motion-reduce:animate-none"
              data-testid="ai-workspace-preview-shell"
              role="complementary"
              style={{ width: aiWorkspacePreviewWidth }}
            >
              <WorkspaceResizeHandle
                aria-label="调整文档预览宽度"
                className="absolute! inset-y-0 left-0 h-auto! [&>span]:hidden"
                direction="right"
                max={960}
                min={520}
                value={aiWorkspacePreviewWidth}
                onResize={(nextWidth) =>
                  onAiWorkspacePreviewResize?.(nextWidth)
                }
              />
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {aiWorkspacePreview}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {mode === 'meta' ? (
        <aside
          className="flex h-full shrink-0 flex-col overflow-hidden border-l bg-background"
          data-testid="document-meta-panel"
          style={{ width }}
        >
          <DocumentMetaPanel
            currentDocument={currentDocument}
            documentPanelData={documentPanelData}
            readOnly={documentReadOnly}
            workspaceRootPath={workspaceRootPath}
            onToggleReadOnly={onToggleDocumentReadOnly}
          />
        </aside>
      ) : null}
    </>
  );
}

export function RightToolRail({
  mode,
  orientation = 'rail',
  showSettingsButton = true,
  onModeChange,
  onOpenSettings,
}: RightToolRailProps) {
  const { setTheme, theme } = useTheme();
  const nextMetaMode = mode === 'meta' ? null : 'meta';
  const nextAiMode = mode === 'ai' ? null : 'ai';

  return (
    <TooltipProvider>
      <nav
        className={cn(
          orientation === 'header'
            ? 'flex h-11 shrink-0 items-center gap-0.5'
            : 'flex h-full w-8 shrink-0 flex-col items-center gap-2 py-1',
        )}
        data-testid="right-tool-rail"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
              className={rightToolButtonClassName()}
              data-testid="ai-panel-icon-button"
              type="button"
              onClick={() => onModeChange(nextAiMode)}
            >
              <Openai className="size-[17px]" variant="light" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={orientation === 'header' ? 'bottom' : 'left'} sideOffset={8}>
            {mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={mode === 'meta' ? '折叠元信息面板' : '展开元信息面板'}
              className={rightToolButtonClassName()}
              data-testid="document-meta-panel-icon-button"
              type="button"
              onClick={() => onModeChange(nextMetaMode)}
            >
              <Info size={17} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={orientation === 'header' ? 'bottom' : 'left'} sideOffset={8}>
            {mode === 'meta' ? '折叠元信息面板' : '展开元信息面板'}
          </TooltipContent>
        </Tooltip>

        {showSettingsButton ? (
          <DropdownMenu>
            <Tooltip>
              <DropdownMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    aria-label="打开设置菜单"
                    className={cn(rightToolButtonClassName(), orientation === 'rail' && 'mt-auto')}
                    data-testid="settings-menu-button"
                    type="button"
                  >
                    <Settings size={17} />
                  </button>
                </TooltipTrigger>
              </DropdownMenuTrigger>
              <TooltipContent side={orientation === 'header' ? 'bottom' : 'left'} sideOffset={8}>
                打开设置菜单
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40" side="left">
              <DropdownMenuItem onSelect={onOpenSettings}>
                <Settings size={15} />
                <span>设置...</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette size={15} />
                  <span>主题</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-32">
                  <DropdownMenuRadioGroup value={theme ?? 'light'} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">亮色</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">暗色</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">跟随系统</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </nav>
    </TooltipProvider>
  );
}

function rightToolButtonClassName() {
  return cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
  );
}

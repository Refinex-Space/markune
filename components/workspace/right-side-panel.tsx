'use client';

import * as React from 'react';
import { Info, Palette, Settings, Sparkles } from 'lucide-react';
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
  AiProposedPlan,
  AiWorkspaceChangeEvent,
} from './ai-panel-state';
import type {
  RightPanelMode,
  WorkspaceNode,
  WorkspaceSearchResult,
} from './workspace-types';

export interface DocumentPanelData {
  frontmatter: Record<string, string>;
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
}

interface RightSidePanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  documents: WorkspaceSearchResult[];
  documentReadOnly: boolean;
  mode: RightPanelMode;
  width: number;
  workspaceRootPath: string | null;
  onBeforeTurnStart: () => Promise<boolean>;
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
  currentDocument,
  documentPanelData,
  documents,
  documentReadOnly,
  mode,
  width,
  workspaceRootPath,
  onBeforeTurnStart,
  onOpenDocument,
  onOpenPlanPreview,
  onWorkspaceChanged,
  onToggleDocumentReadOnly,
}: RightSidePanelProps) {
  return (
    <>
      <aside
        aria-hidden={mode !== 'ai'}
        className={cn(
          'h-full shrink-0 flex-col overflow-hidden border-l bg-background',
          mode === 'ai' ? 'flex' : 'hidden',
        )}
        data-testid="ai-side-panel"
        hidden={mode !== 'ai'}
        style={{ width }}
      >
        <AiPanel
          currentDocument={currentDocument}
          documents={documents}
          visible={mode === 'ai'}
          workspaceRootPath={workspaceRootPath}
          onBeforeTurnStart={onBeforeTurnStart}
          onOpenDocument={onOpenDocument}
          onOpenPlanPreview={onOpenPlanPreview}
          onWorkspaceChanged={onWorkspaceChanged}
        />
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
              className={cn(
                rightToolButtonClassName(),
                mode === 'ai' && 'bg-accent text-foreground',
              )}
              data-testid="ai-panel-icon-button"
              type="button"
              onClick={() => onModeChange(nextAiMode)}
            >
              <Sparkles size={17} />
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

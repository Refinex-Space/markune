'use client';

import * as React from 'react';
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
import { AiPanelContent } from './ai-panel/ai-panel-content';
import type { AiSelectionContext } from './ai-panel/ai-types';
import type {
  RightPanelMode,
  WorkspaceNode,
} from './workspace-types';

const AI_PANEL_AVAILABLE = true;

export interface DocumentPanelData {
  frontmatter: Record<string, string>;
  markdown: string;
  metadata: { title: string; createdAt: string; updatedAt: string };
}

interface RightSidePanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  documentReadOnly: boolean;
  mode: RightPanelMode;
  selectedTextContext?: AiSelectionContext | null;
  settingsVersion: number;
  width: number;
  workspaceRootPath: string | null;
  onToggleDocumentReadOnly?: () => void;
  onClearSelectedTextContext?: () => void;
  onMarkdownDocumentApplied?: (document: {
    content: string;
    modifiedAt: number | null;
    path: string;
  }) => void;
  onOpenSettings: () => void;
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
  documentReadOnly,
  mode,
  selectedTextContext = null,
  settingsVersion,
  width,
  workspaceRootPath,
  onToggleDocumentReadOnly,
  onClearSelectedTextContext,
  onMarkdownDocumentApplied,
  onOpenSettings,
}: RightSidePanelProps) {
  if (!mode) {
    return null;
  }

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden border-l bg-background"
      data-testid={getRightPanelTestId(mode)}
      style={{ width }}
    >
      {mode === 'ai' ? (
        <AiPanelContent
          currentDocument={currentDocument}
          documentPanelData={documentPanelData}
          selectedTextContext={selectedTextContext}
          settingsVersion={settingsVersion}
          workspaceRootPath={workspaceRootPath}
          onClearSelectedTextContext={onClearSelectedTextContext}
          onMarkdownDocumentApplied={onMarkdownDocumentApplied}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <DocumentMetaPanel
          currentDocument={currentDocument}
          documentPanelData={documentPanelData}
          readOnly={documentReadOnly}
          workspaceRootPath={workspaceRootPath}
          onToggleReadOnly={onToggleDocumentReadOnly}
        />
      )}
    </aside>
  );
}

export function RightToolRail({
  mode,
  orientation = 'rail',
  showSettingsButton = true,
  onModeChange,
  onOpenSettings,
}: RightToolRailProps) {
  const nextMode = (targetMode: Exclude<RightPanelMode, null>) =>
    mode === targetMode ? null : targetMode;
  const { setTheme, theme } = useTheme();

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
        <RightToolTooltip
          label={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
          orientation={orientation}
        >
          <button
            aria-label={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
            className={cn(
              rightToolButtonClassName(),
              !AI_PANEL_AVAILABLE &&
                'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground',
            )}
            data-testid="ai-panel-icon-button"
            disabled={!AI_PANEL_AVAILABLE}
            title={mode === 'ai' ? '折叠 AI 面板' : '展开 AI 面板'}
            type="button"
            onClick={() => onModeChange(nextMode('ai'))}
          >
            <span
              aria-hidden="true"
              className="size-[17px] bg-current"
              data-testid="ai-panel-icon"
              style={{
                WebkitMask:
                  "url('/icons/ai-panel.svg') center / contain no-repeat",
                mask: "url('/icons/ai-panel.svg') center / contain no-repeat",
              }}
            />
          </button>
        </RightToolTooltip>

        <RightToolTooltip
          label={mode === 'meta' ? '折叠元信息面板' : '展开元信息面板'}
          orientation={orientation}
        >
          <button
            aria-label={mode === 'meta' ? '折叠元信息面板' : '展开元信息面板'}
            className={rightToolButtonClassName()}
            data-testid="document-meta-panel-icon-button"
            type="button"
            onClick={() => onModeChange(nextMode('meta'))}
          >
            <Info size={17} />
          </button>
        </RightToolTooltip>

        {showSettingsButton ? (
          <DropdownMenu>
            <Tooltip>
              <DropdownMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    aria-label="打开设置菜单"
                    className={cn(
                      rightToolButtonClassName(),
                      orientation === 'rail' && 'mt-auto',
                    )}
                    data-testid="settings-menu-button"
                    type="button"
                  >
                    <Settings size={17} />
                  </button>
                </TooltipTrigger>
              </DropdownMenuTrigger>
              <TooltipContent
                side={orientation === 'header' ? 'bottom' : 'left'}
                sideOffset={8}
              >
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
                  <DropdownMenuRadioGroup
                    value={theme ?? 'light'}
                    onValueChange={(value) => setTheme(value)}
                  >
                    <DropdownMenuRadioItem value="light">
                      亮色
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      暗色
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      跟随系统
                    </DropdownMenuRadioItem>
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

function RightToolTooltip({
  children,
  label,
  orientation,
}: {
  children: React.ReactElement;
  label: string;
  orientation: 'header' | 'rail';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={orientation === 'header' ? 'bottom' : 'left'}
        sideOffset={8}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function getRightPanelTestId(mode: Exclude<RightPanelMode, null>) {
  switch (mode) {
    case 'ai':
      return 'ai-panel-island';
    case 'meta':
      return 'document-meta-panel';
  }
}

function rightToolButtonClassName() {
  return cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
  );
}

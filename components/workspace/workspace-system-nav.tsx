import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Inbox,
  MoreHorizontal,
  Network,
  Paintbrush,
  Sheet,
} from 'lucide-react';
import { Openai } from '@thesvg/react';
import { useState, type ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { WorkspaceTreeFolderIcon } from './workspace-tree-folder-icon';
import type { SystemNavLayout } from './workspace-types';

export interface WorkspaceSystemNavProps {
  collapsed?: boolean;
  inboxActiveCount?: number;
  isDailyActive?: boolean;
  layout?: SystemNavLayout;
  systemPage?: 'codex' | 'daily' | 'drawings' | 'graph' | 'inbox' | 'views' | null;
  onCollapsedChange?: (collapsed: boolean) => void;
  onLayoutChange?: (layout: SystemNavLayout) => void;
  onOpenCodex?: () => void;
  onOpenDailyNotes?: () => void;
  onOpenDrawings?: () => void;
  onOpenGraph?: () => void;
  onOpenInbox?: () => void;
  onOpenNotes?: () => void;
  onOpenViews?: () => void;
}

interface SystemNavEntry {
  id: string;
  label: string;
  testId: string;
  active: boolean;
  badgeCount?: number;
  icon: ReactNode;
  onClick?: () => void;
}

export function WorkspaceSystemNav({
  collapsed = false,
  inboxActiveCount = 0,
  isDailyActive = false,
  layout = 'vertical',
  systemPage = null,
  onCollapsedChange,
  onLayoutChange,
  onOpenCodex,
  onOpenDailyNotes,
  onOpenDrawings,
  onOpenGraph,
  onOpenInbox,
  onOpenNotes,
  onOpenViews,
}: WorkspaceSystemNavProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const showChrome = hovered || menuOpen;
  const horizontal = layout === 'horizontal';

  const entries: SystemNavEntry[] = [
    {
      id: 'notes',
      label: '笔记',
      testId: 'notes-entry',
      active: false,
      icon: <WorkspaceTreeFolderIcon expanded />,
      onClick: onOpenNotes,
    },
    {
      id: 'daily',
      label: '日程',
      testId: 'daily-note-entry',
      active: isDailyActive,
      icon: <CalendarDays size={13} strokeWidth={1.75} />,
      onClick: onOpenDailyNotes,
    },
    {
      id: 'inbox',
      label: 'Inbox',
      testId: 'inbox-entry',
      active: systemPage === 'inbox',
      badgeCount: inboxActiveCount,
      icon: <Inbox size={13} strokeWidth={1.75} />,
      onClick: onOpenInbox,
    },
    {
      id: 'drawings',
      label: '画板',
      testId: 'drawing-entry',
      active: systemPage === 'drawings',
      icon: <Paintbrush size={13} strokeWidth={1.75} />,
      onClick: onOpenDrawings,
    },
    {
      id: 'views',
      label: '视图',
      testId: 'workspace-views-entry',
      active: systemPage === 'views',
      icon: <Sheet size={13} strokeWidth={1.75} />,
      onClick: onOpenViews,
    },
    {
      id: 'graph',
      label: '图谱',
      testId: 'workspace-graph-entry',
      active: systemPage === 'graph',
      icon: <Network size={13} strokeWidth={1.75} />,
      onClick: onOpenGraph,
    },
    {
      id: 'codex',
      label: 'Codex',
      testId: 'codex-workspace-entry',
      active: systemPage === 'codex',
      icon: <Openai className="size-[13px]" variant="light" />,
      onClick: onOpenCodex,
    },
  ];

  if (collapsed) {
    return (
      <div
        className="relative flex h-5 items-center justify-center px-2"
        data-testid="workspace-system-nav"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          aria-hidden
          className="absolute inset-x-2 inset-y-0"
          data-testid="system-nav-hitbox"
        />
        <button
          aria-expanded={false}
          aria-label="展开系统入口"
          className={cn(
            'relative z-10 flex h-5 min-w-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-[opacity,background-color,color]',
            showChrome
              ? 'bg-sidebar-accent text-sidebar-accent-foreground opacity-100'
              : 'pointer-events-none opacity-0',
          )}
          data-testid="system-nav-collapse-button"
          type="button"
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronDown size={12} strokeWidth={2} />
        </button>
        <div
          className={cn(
            'absolute inset-y-0 right-2 z-10 flex items-center',
            showChrome ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <SystemNavOptionsMenu
            layout={layout}
            open={menuOpen}
            onLayoutChange={onLayoutChange}
            onOpenChange={setMenuOpen}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative border-y border-sidebar-border/45 px-2 py-1"
      data-testid="workspace-system-nav"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          'absolute inset-x-2 top-0 z-10 flex h-5 items-center',
          showChrome ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          aria-expanded
          aria-label="收起系统入口"
          className="absolute left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          data-testid="system-nav-collapse-button"
          type="button"
          onClick={() => onCollapsedChange?.(true)}
        >
          <ChevronUp size={12} strokeWidth={2} />
        </button>
        <div className="ml-auto">
          <SystemNavOptionsMenu
            layout={layout}
            open={menuOpen}
            onLayoutChange={onLayoutChange}
            onOpenChange={setMenuOpen}
          />
        </div>
      </div>

      <TooltipProvider delayDuration={250}>
        <div
          className={cn(
            horizontal
              ? 'flex items-center justify-between gap-0.5 pt-3 pl-[11px]'
              : 'space-y-0.5 pt-0',
            showChrome && !horizontal ? 'pt-3' : null,
          )}
        >
          {entries.map((entry) => (
            <SystemNavEntryButton
              key={entry.id}
              entry={entry}
              horizontal={horizontal}
            />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function SystemNavOptionsMenu({
  layout,
  open,
  onLayoutChange,
  onOpenChange,
}: {
  layout: SystemNavLayout;
  open: boolean;
  onLayoutChange?: (layout: SystemNavLayout) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="系统入口选项"
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          data-testid="system-nav-options-button"
          type="button"
        >
          <MoreHorizontal size={12} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={layout}
          onValueChange={(value) => {
            if (value === 'vertical' || value === 'horizontal') {
              onLayoutChange?.(value);
            }
          }}
        >
          <DropdownMenuRadioItem value="vertical">纵向排列</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="horizontal">
            横向排列
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SystemNavEntryButton({
  entry,
  horizontal,
}: {
  entry: SystemNavEntry;
  horizontal: boolean;
}) {
  const badgeLabel =
    entry.badgeCount && entry.badgeCount > 0
      ? entry.badgeCount > 99
        ? '99+'
        : String(entry.badgeCount)
      : null;
  const accessibleLabel =
    entry.id === 'inbox' && badgeLabel
      ? `${entry.label} · ${badgeLabel}`
      : entry.label;

  const button = (
    <button
      aria-current={entry.active ? 'page' : undefined}
      aria-label={horizontal ? accessibleLabel : undefined}
      className={
        horizontal
          ? getHorizontalEntryClassName(entry.active)
          : getSystemEntryClassName(entry.active)
      }
      data-testid={entry.testId}
      type="button"
      onClick={entry.onClick}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center">
        {entry.icon}
        {horizontal && badgeLabel ? (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium leading-none text-primary-foreground"
            data-testid="inbox-entry-badge"
          >
            {badgeLabel}
          </span>
        ) : null}
      </span>
      {horizontal ? null : (
        <>
          <span className="truncate">{entry.label}</span>
          {entry.id === 'inbox' && badgeLabel ? (
            <span className="ml-auto min-w-5 px-1.5 text-center text-[10px] font-medium leading-4 text-sidebar-foreground/55 tabular-nums">
              {badgeLabel}
            </span>
          ) : null}
        </>
      )}
    </button>
  );

  if (!horizontal) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {accessibleLabel}
      </TooltipContent>
    </Tooltip>
  );
}

function getSystemEntryClassName(active: boolean) {
  return cn(
    'flex h-7 w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md px-[11px] text-[13px] transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
  );
}

function getHorizontalEntryClassName(active: boolean) {
  return cn(
    'relative flex size-7 shrink-0 items-center justify-start rounded-md transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
  );
}

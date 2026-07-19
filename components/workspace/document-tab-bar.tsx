'use client';

import { ChevronDown, Lightbulb, X } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type {
  DocumentEditorTab,
} from './document-tabs';

interface DocumentTabBarProps {
  activeTabId: string | null;
  tabs: DocumentEditorTab[];
  visibleTabLimit?: number;
  onCloseAllTabs: () => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseTabsToLeft: (tabId: string) => void;
  onCloseTabsToRight: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
}

const DEFAULT_VISIBLE_TAB_LIMIT = 8;

export function DocumentTabBar({
  activeTabId,
  tabs,
  visibleTabLimit = DEFAULT_VISIBLE_TAB_LIMIT,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
}: DocumentTabBarProps) {
  const visibleTabs = tabs.slice(0, visibleTabLimit);
  const overflowTabs = tabs.slice(visibleTabLimit);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="flex h-9 shrink-0 items-center bg-background px-1.5"
      data-testid="document-tab-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {visibleTabs.map((tab) => (
          <DocumentTabItem
            activeTabId={activeTabId}
            key={tab.id}
            tab={tab}
            onCloseAllTabs={onCloseAllTabs}
            onCloseOtherTabs={onCloseOtherTabs}
            onCloseTab={onCloseTab}
            onCloseTabsToLeft={onCloseTabsToLeft}
            onCloseTabsToRight={onCloseTabsToRight}
            onSelectTab={onSelectTab}
          />
        ))}
      </div>

      {overflowTabs.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="显示更多打开的文档"
              className="ml-1 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              type="button"
            >
              <ChevronDown size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.id}
                onSelect={() => onSelectTab(tab.id)}
              >
                {tab.kind === 'plan' ? <Lightbulb size={14} /> : null}
                <span className="truncate">{tab.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

type DocumentTabItemProps = Omit<
  DocumentTabBarProps,
  'tabs' | 'visibleTabLimit'
> & {
  tab: DocumentEditorTab;
};

function DocumentTabItem({
  activeTabId,
  tab,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
}: DocumentTabItemProps) {
  const active = activeTabId === tab.id;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          aria-selected={active}
          className={cn(
            'group flex h-7 max-w-56 min-w-28 cursor-default items-center rounded-md pl-2.5 pr-1 text-sm outline-none transition-colors',
            active
              ? 'bg-muted/55 text-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
          role="tab"
          tabIndex={0}
          title={tab.title}
          onClick={() => onSelectTab(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectTab(tab.id);
            }
          }}
        >
          {tab.kind === 'plan' ? (
            <Lightbulb className="mr-1.5 shrink-0" size={13} />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{tab.title}</span>
          <button
            aria-label={`关闭标签页 ${tab.title}`}
            className={cn(
              'ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100',
              active && 'opacity-100',
            )}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => onCloseTab(tab.id)}>
          关闭
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseOtherTabs(tab.id)}>
          关闭其他标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseAllTabs()}>
          关闭所有标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseTabsToLeft(tab.id)}>
          关闭左侧标签页
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCloseTabsToRight(tab.id)}>
          关闭右侧标签页
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

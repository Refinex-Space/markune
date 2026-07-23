'use client';

import * as React from 'react';
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

const OVERFLOW_TRIGGER_WIDTH = 32;

export function calculateResponsiveVisibleTabCount(
  tabWidths: readonly number[],
  containerWidth: number,
  activeTabIndex: number,
) {
  if (tabWidths.length === 0) {
    return 0;
  }

  const totalWidth = tabWidths.reduce((total, width) => total + width, 0);
  if (totalWidth <= containerWidth) {
    return tabWidths.length;
  }

  const availableWidth = Math.max(0, containerWidth - OVERFLOW_TRIGGER_WIDTH);
  let visibleCount = 0;
  let visibleWidth = 0;

  for (const width of tabWidths) {
    if (visibleWidth + width > availableWidth) {
      break;
    }

    visibleWidth += width;
    visibleCount += 1;
  }

  visibleCount = Math.max(1, visibleCount);

  if (activeTabIndex >= visibleCount) {
    while (visibleCount > 1) {
      const leadingWidth = tabWidths
        .slice(0, visibleCount - 1)
        .reduce((total, width) => total + width, 0);
      if (leadingWidth + tabWidths[activeTabIndex] <= availableWidth) {
        break;
      }
      visibleCount -= 1;
    }
  }

  return visibleCount;
}

export function DocumentTabBar({
  activeTabId,
  tabs,
  visibleTabLimit,
  onCloseAllTabs,
  onCloseOtherTabs,
  onCloseTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onSelectTab,
}: DocumentTabBarProps) {
  const tabBarRef = React.useRef<HTMLDivElement>(null);
  const measurementRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [responsiveVisibleTabCount, setResponsiveVisibleTabCount] =
    React.useState(tabs.length);
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);

  const measureVisibleTabs = React.useCallback(() => {
    if (visibleTabLimit !== undefined) {
      return;
    }

    const tabBar = tabBarRef.current;
    if (!tabBar) {
      return;
    }

    const tabWidths = tabs.map(
      (tab) => measurementRefs.current.get(tab.id)?.getBoundingClientRect().width ?? 0,
    );
    if (tabWidths.some((width) => width <= 0)) {
      return;
    }

    setResponsiveVisibleTabCount(
      calculateResponsiveVisibleTabCount(
        tabWidths,
        tabBar.clientWidth,
        activeTabIndex,
      ),
    );
  }, [activeTabIndex, tabs, visibleTabLimit]);

  React.useLayoutEffect(() => {
    if (visibleTabLimit !== undefined) {
      return;
    }

    let animationFrame = window.requestAnimationFrame(measureVisibleTabs);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(measureVisibleTabs);
          });

    if (tabBarRef.current) {
      resizeObserver?.observe(tabBarRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [measureVisibleTabs, visibleTabLimit]);

  const visibleTabCount = Math.min(
    tabs.length,
    visibleTabLimit ?? responsiveVisibleTabCount,
  );
  const visibleTabs = resolveVisibleTabs(tabs, visibleTabCount, activeTabId);
  const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));
  const overflowTabs = tabs.filter((tab) => !visibleTabIds.has(tab.id));

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 items-center bg-background"
      data-testid="document-tab-bar"
      ref={tabBarRef}
    >
      <div className="flex min-w-0 flex-1 items-center overflow-hidden pl-1.5">
        {visibleTabs.map((tab, index) => (
          <div className="flex shrink-0 items-center" key={tab.id}>
            {index > 0 ? <DocumentTabSeparator /> : null}
            <DocumentTabItem
              activeTabId={activeTabId}
              tab={tab}
              onCloseAllTabs={onCloseAllTabs}
              onCloseOtherTabs={onCloseOtherTabs}
              onCloseTab={onCloseTab}
              onCloseTabsToLeft={onCloseTabsToLeft}
              onCloseTabsToRight={onCloseTabsToRight}
              onSelectTab={onSelectTab}
            />
          </div>
        ))}
      </div>

      {overflowTabs.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="显示更多打开的文档"
              className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              type="button"
            >
              <ChevronDown size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-72 w-64 overflow-y-auto"
          >
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

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 flex invisible"
      >
        {tabs.map((tab, index) => (
          <DocumentTabMeasurement
            key={tab.id}
            ref={(element) => {
              if (element) {
                measurementRefs.current.set(tab.id, element);
              } else {
                measurementRefs.current.delete(tab.id);
              }
            }}
            showSeparator={index > 0}
            tab={tab}
          />
        ))}
      </div>
    </div>
  );
}

function resolveVisibleTabs(
  tabs: DocumentEditorTab[],
  visibleTabCount: number,
  activeTabId: string | null,
) {
  const visibleTabs = tabs.slice(0, visibleTabCount);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (
    !activeTab ||
    visibleTabCount === 0 ||
    visibleTabs.some((tab) => tab.id === activeTab.id)
  ) {
    return visibleTabs;
  }

  return [...visibleTabs.slice(0, -1), activeTab];
}

function DocumentTabSeparator({ measurement = false }: { measurement?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-4 w-px shrink-0 bg-gradient-to-b from-transparent via-border/80 to-transparent"
      data-testid={measurement ? undefined : 'document-tab-separator'}
    />
  );
}

const DocumentTabMeasurement = React.forwardRef<
  HTMLDivElement,
  {
    showSeparator: boolean;
    tab: DocumentEditorTab;
  }
>(function DocumentTabMeasurement({ showSeparator, tab }, ref) {
  return (
    <div className="flex shrink-0 items-center" ref={ref}>
      {showSeparator ? <DocumentTabSeparator measurement /> : null}
      <div className="flex h-7 max-w-56 min-w-28 items-center pl-2.5 pr-1 text-sm">
        {tab.kind === 'plan' ? (
          <Lightbulb className="mr-1.5 shrink-0" size={13} />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
        <span className="ml-auto size-5 shrink-0" />
      </div>
    </div>
  );
});

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

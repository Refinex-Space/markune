import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateResponsiveVisibleTabCount,
  DocumentTabBar,
} from '../document-tab-bar';
import type { DocumentEditorTab } from '../document-tabs';

function tabs(): DocumentEditorTab[] {
  return [
    {
      absolutePath: '/repo/a.md',
      id: '/repo/a.md',
      kind: 'document',
      name: 'a.md',
      title: 'A',
    },
    {
      absolutePath: '/repo/b.md',
      id: '/repo/b.md',
      kind: 'document',
      name: 'b.md',
      title: 'B',
    },
    {
      absolutePath: '/repo/c.md',
      id: '/repo/c.md',
      kind: 'document',
      name: 'c.md',
      title: 'C',
    },
  ];
}

describe('DocumentTabBar', () => {
  it('renders integrated tabs with short fading separators', () => {
    render(
      <DocumentTabBar
        activeTabId="/repo/b.md"
        tabs={tabs()}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    const tabBar = screen.getByTestId('document-tab-bar');
    const activeTab = screen.getByRole('tab', { name: /B/ });
    const inactiveTab = screen.getByRole('tab', { name: /A/ });

    expect(tabBar.className).not.toContain('border-b');
    expect(tabBar.className).toContain('h-full');
    expect(screen.getAllByTestId('document-tab-separator')).toHaveLength(2);
    expect(activeTab.className).not.toContain('border-r');
    expect(inactiveTab.className).not.toContain('border-r');
    expect(activeTab.className).toContain('rounded-md');
    expect(activeTab.className).toContain('bg-muted/55');
    expect(inactiveTab.className).toContain('hover:bg-muted/40');
  });

  it('selects and closes tabs', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <DocumentTabBar
        activeTabId="/repo/b.md"
        tabs={tabs()}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={onCloseTab}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={onSelectTab}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /A/ }));
    await user.click(screen.getByRole('button', { name: '关闭标签页 B' }));

    expect(onSelectTab).toHaveBeenCalledWith('/repo/a.md');
    expect(onCloseTab).toHaveBeenCalledWith('/repo/b.md');
  });

  it('shows context menu actions without split actions', async () => {
    const user = userEvent.setup();
    const onCloseOtherTabs = vi.fn();

    render(
      <DocumentTabBar
        activeTabId="/repo/b.md"
        tabs={tabs()}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', { name: /B/ }),
    });
    expect(await screen.findByRole('menuitem', { name: '关闭其他标签页' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '向右拆分' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '向下拆分' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '导出' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: '关闭其他标签页' }));

    expect(onCloseOtherTabs).toHaveBeenCalledWith('/repo/b.md');
  });

  it('exports the active document tab from the context menu when available', async () => {
    const user = userEvent.setup();
    const onExportTab = vi.fn();
    const documentTabs = tabs();

    render(
      <DocumentTabBar
        activeTabId="/repo/b.md"
        tabs={documentTabs}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onExportTab={onExportTab}
        onSelectTab={vi.fn()}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', { name: /B/ }),
    });
    const exportTrigger = await screen.findByRole('menuitem', { name: '导出' });
    await user.click(exportTrigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Word' }));

    expect(onExportTab).toHaveBeenCalledWith(documentTabs[1], 'word');
  });

  it('hides export actions for plan preview tabs', async () => {
    const user = userEvent.setup();
    const onExportTab = vi.fn();

    render(
      <DocumentTabBar
        activeTabId="plan:thread:1"
        tabs={[
          {
            id: 'plan:thread:1',
            kind: 'plan',
            markdown: '# Plan',
            planId: '1',
            threadId: 'thread',
            title: 'Plan',
          },
        ]}
        visibleTabLimit={8}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onExportTab={onExportTab}
        onSelectTab={vi.fn()}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', { name: /Plan/ }),
    });
    expect(await screen.findByRole('menuitem', { name: '关闭' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '导出' })).toBeNull();
  });

  it('moves overflowed tabs into the more menu', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <DocumentTabBar
        activeTabId="/repo/b.md"
        tabs={tabs()}
        visibleTabLimit={2}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={onSelectTab}
      />,
    );

    expect(screen.queryByRole('tab', { name: /C/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '显示更多打开的文档' }));
    const overflowMenu = await screen.findByRole('menu');
    expect(overflowMenu.className).toContain('max-h-72');
    expect(overflowMenu.className).toContain('overflow-y-auto');
    await user.click(await screen.findByRole('menuitem', { name: 'C' }));

    expect(onSelectTab).toHaveBeenCalledWith('/repo/c.md');
  });

  it('keeps an active overflow tab visible and moves the displaced tab into the menu', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTabBar
        activeTabId="/repo/c.md"
        tabs={tabs()}
        visibleTabLimit={2}
        onCloseAllTabs={vi.fn()}
        onCloseOtherTabs={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseTabsToLeft={vi.fn()}
        onCloseTabsToRight={vi.fn()}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /A/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /C/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /B/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '显示更多打开的文档' }));
    expect(await screen.findByRole('menuitem', { name: 'B' })).toBeTruthy();
  });

  it('calculates a responsive limit while reserving the overflow trigger', () => {
    expect(calculateResponsiveVisibleTabCount([120, 120, 120], 300, 1)).toBe(2);
    expect(calculateResponsiveVisibleTabCount([120, 120, 120], 360, 1)).toBe(3);
    expect(calculateResponsiveVisibleTabCount([120, 200, 200], 300, 2)).toBe(1);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentTabBar } from '../document-tab-bar';
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
  it('renders integrated tabs without hard divider lines', () => {
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
    expect(tabBar.className).toContain('px-1.5');
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
    await user.click(await screen.findByRole('menuitem', { name: '关闭其他标签页' }));

    expect(onCloseOtherTabs).toHaveBeenCalledWith('/repo/b.md');
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
    await user.click(await screen.findByRole('menuitem', { name: 'C' }));

    expect(onSelectTab).toHaveBeenCalledWith('/repo/c.md');
  });
});

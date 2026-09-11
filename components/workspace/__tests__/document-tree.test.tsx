import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentTree } from '../document-tree';
import type { WorkspaceNode } from '../workspace-types';

const nodes: WorkspaceNode[] = [
  {
    id: 'guides',
    name: 'Guides',
    kind: 'directory',
    relativePath: 'Guides',
    absolutePath: '/repo/Guides',
    children: [
      {
        id: 'intro',
        name: 'intro.md',
        kind: 'document',
        relativePath: 'Guides/intro.md',
        absolutePath: '/repo/Guides/intro.md',
        title: '入门',
      },
    ],
  },
  {
    id: 'readme',
    name: 'README.md',
    kind: 'document',
    relativePath: 'README.md',
    absolutePath: '/repo/README.md',
    title: '项目说明',
  },
];

const countedNodes: WorkspaceNode[] = [
  {
    id: 'projects',
    name: 'Projects',
    kind: 'directory',
    relativePath: 'Projects',
    absolutePath: '/repo/Projects',
    children: [
      {
        id: 'project-overview',
        name: 'overview.md',
        kind: 'document',
        relativePath: 'Projects/overview.md',
        absolutePath: '/repo/Projects/overview.md',
        title: '项目概览',
      },
      {
        id: 'archive',
        name: 'Archive',
        kind: 'directory',
        relativePath: 'Projects/Archive',
        absolutePath: '/repo/Projects/Archive',
        children: [
          {
            id: 'project-notes',
            name: 'notes.md',
            kind: 'document',
            relativePath: 'Projects/Archive/notes.md',
            absolutePath: '/repo/Projects/Archive/notes.md',
            title: '项目记录',
          },
        ],
      },
    ],
  },
  {
    id: 'empty-directory',
    name: 'Empty',
    kind: 'directory',
    relativePath: 'Empty',
    absolutePath: '/repo/Empty',
    children: [],
  },
];

describe('DocumentTree', () => {
  it('keeps the icon picker open after launching it from the context menu', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        rootPath="/repo"
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
        onUpdateNodeAppearance={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('tree-row-guides'));
    await user.click(screen.getByRole('menuitem', { name: '更换图标...' }));

    await screen.findByRole('tablist', { name: '目录图标类型' });
    act(() => screen.getByTestId('tree-row-guides').focus());
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(
      screen.queryByRole('tablist', { name: '目录图标类型' }),
    ).not.toBeNull();
  });

  it('renders a customized emoji and restores the default appearance from the context menu', async () => {
    const user = userEvent.setup();
    const onUpdateNodeAppearance = vi.fn().mockResolvedValue(undefined);
    const customizedNodes: WorkspaceNode[] = [
      {
        ...nodes[0],
        appearance: { icon: { type: 'emoji', value: '📚' } },
      },
    ];

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={customizedNodes}
        rootPath="/repo"
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
        onUpdateNodeAppearance={onUpdateNodeAppearance}
      />,
    );

    expect(screen.getByTestId('directory-folder-closed-guides').textContent).toBe(
      '📚',
    );
    fireEvent.contextMenu(screen.getByTestId('tree-row-guides'));
    await user.click(screen.getByRole('menuitem', { name: '恢复默认图标' }));

    await waitFor(() =>
      expect(onUpdateNodeAppearance).toHaveBeenCalledWith(customizedNodes[0], null),
    );
  });

  it('shows recursive document counts in a stable right-side rail for directories', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={countedNodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.getByTestId('directory-document-count-projects').textContent).toBe('2');
    expect(
      screen.queryByTestId('directory-document-count-empty-directory'),
    ).toBeNull();

    await user.click(screen.getByText('Projects'));

    const archiveCount = screen.getByTestId('directory-document-count-archive');
    expect(archiveCount.textContent).toBe('1');
    expect(archiveCount.className).toContain('absolute right-2');
    expect(archiveCount.className).toContain('size-6');
    expect(archiveCount.className).toContain('tabular-nums');
    expect(archiveCount.className).toContain('group-hover/tree-row:opacity-0');
    expect(
      screen.getByRole('button', { name: '打开 Archive 操作菜单' }).className,
    ).toContain('absolute right-2 top-0.5');
  });

  it('creates documents and directories at the workspace root from the blank area menu', async () => {
    const user = userEvent.setup();
    const onCreateDocument = vi.fn();
    const onCreateDirectory = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={onCreateDirectory}
        onCreateDocument={onCreateDocument}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    const rootCreationArea = screen.getByTestId(
      'workspace-tree-root-creation-area',
    );

    fireEvent.contextMenu(rootCreationArea);
    await user.click(screen.getByRole('menuitem', { name: '新建文档' }));
    expect(onCreateDocument).toHaveBeenCalledWith('');

    fireEvent.contextMenu(rootCreationArea);
    await user.click(screen.getByRole('menuitem', { name: '新建目录' }));
    expect(onCreateDirectory).toHaveBeenCalledWith('');
  });

  it('refreshes the whole workspace from the blank-area menu only', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onRefreshNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRefresh={onRefresh}
        onRefreshNode={onRefreshNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    fireEvent.contextMenu(
      screen.getByTestId('workspace-tree-context-area'),
    );
    await user.click(screen.getByRole('menuitem', { name: '刷新' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefreshNode).not.toHaveBeenCalled();
  });

  it('refreshes only the targeted directory or document from node menus', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onRefreshNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRefresh={onRefresh}
        onRefreshNode={onRefreshNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('tree-row-guides'));
    await user.click(screen.getByRole('menuitem', { name: '刷新' }));

    expect(onRefreshNode).toHaveBeenCalledTimes(1);
    expect(onRefreshNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ absolutePath: '/repo/Guides' }),
    );

    fireEvent.contextMenu(screen.getByTestId('tree-row-readme'));
    await user.click(screen.getByRole('menuitem', { name: '刷新' }));

    expect(onRefreshNode).toHaveBeenCalledTimes(2);
    expect(onRefreshNode).toHaveBeenLastCalledWith(
      expect.objectContaining({ absolutePath: '/repo/README.md' }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('uses folder state icons for directories and no icons for documents', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('directory-chevron-guides')).toBeNull();
    expect(screen.getByTestId('directory-folder-closed-guides')).toBeTruthy();
    expect(screen.queryByTestId('directory-folder-open-guides')).toBeNull();
    expect(screen.queryByTestId('document-icon-readme')).toBeNull();
    expect(screen.getByTestId('document-icon-placeholder-readme')).toBeTruthy();

    await user.click(screen.getByText('Guides'));

    expect(screen.getByTestId('directory-folder-open-guides')).toBeTruthy();
    expect(screen.queryByTestId('directory-folder-closed-guides')).toBeNull();
    expect(screen.getByTestId('document-icon-placeholder-intro')).toBeTruthy();
  });

  it('aligns child document names with their parent folder names', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Guides'));

    expect(screen.getByTestId('tree-row-surface-intro').style.marginLeft).toBe(
      screen.getByTestId('tree-row-surface-guides').style.marginLeft,
    );
  });

  it('insets document hover and selected backgrounds from tree guides', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath="/repo/Guides/intro.md"
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Guides'));

    const directorySurface = screen.getByTestId('tree-row-surface-guides');
    const documentSurface = screen.getByTestId('tree-row-surface-intro');

    expect(directorySurface.className).toContain(
      'group-hover/tree-row:bg-sidebar-accent/70',
    );
    expect(documentSurface.className).toContain('before:left-5');
    expect(documentSurface.className).toContain('isolate');
    expect(documentSurface.className).toContain('before:z-0');
    expect(documentSurface.className).toContain(
      'group-hover/tree-row:before:bg-sidebar-accent/70',
    );
    expect(documentSurface.className).toContain('before:bg-sidebar-accent');
    expect(documentSurface.className).not.toContain(
      'group-hover/tree-row:bg-sidebar-accent/70',
    );
    expect(screen.getByText('入门').parentElement?.className).toContain(
      'z-[1]',
    );
  });

  it('keeps a subtle visual gap between parent and child row backgrounds', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Guides'));

    expect(screen.getByTestId('tree-node-guides').className).toContain(
      'space-y-0.5',
    );
    expect(screen.getByTestId('tree-row-guides').className).toContain('h-7');
    expect(screen.getByTestId('tree-row-guides').className).toContain(
      'text-[13px]',
    );
    expect(screen.getByText('Guides').parentElement?.className).toContain(
      'pl-[11px]',
    );
  });

  it('reveals and scrolls to a deeply nested document for repeated requests', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const nestedNodes: WorkspaceNode[] = [
      {
        id: 'parent',
        name: 'Parent',
        kind: 'directory',
        relativePath: 'Parent',
        absolutePath: '/repo/Parent',
        children: [
          {
            id: 'child',
            name: 'Child',
            kind: 'directory',
            relativePath: 'Parent/Child',
            absolutePath: '/repo/Parent/Child',
            children: [
              {
                id: 'leaf',
                name: 'leaf.md',
                kind: 'document',
                relativePath: 'Parent/Child/leaf.md',
                absolutePath: '/repo/Parent/Child/leaf.md',
                title: 'Leaf',
              },
            ],
          },
        ],
      },
    ];
    const props = {
      currentDocumentPath: '/repo/Parent/Child/leaf.md',
      nodes: nestedNodes,
      searchQuery: '',
      onCreateDirectory: vi.fn(),
      onCreateDocument: vi.fn(),
      onDeleteNode: vi.fn(),
      onImportMarkdown: vi.fn(),
      onRenameNode: vi.fn(),
      onSelectDocument: vi.fn(),
    };

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      const { rerender } = render(
        <DocumentTree
          {...props}
          revealNodePath="/repo/Parent/Child/leaf.md"
          revealNodeRequestId={1}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('tree-row-leaf')).toBeTruthy();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByTestId('directory-folder-open-parent')).toBeTruthy();
      expect(screen.getByTestId('directory-folder-open-child')).toBeTruthy();

      await user.click(screen.getByText('Parent'));
      expect(screen.queryByTestId('tree-row-leaf')).toBeNull();

      rerender(
        <DocumentTree
          {...props}
          revealNodePath="/repo/Parent/Child/leaf.md"
          revealNodeRequestId={2}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('tree-row-leaf')).toBeTruthy();
        expect(scrollIntoView).toHaveBeenCalledTimes(2);
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it('renders a guide for each expanded directory subtree', async () => {
    const user = userEvent.setup();
    const nestedNodes: WorkspaceNode[] = [
      {
        id: 'parent',
        name: 'Parent',
        kind: 'directory',
        relativePath: 'Parent',
        absolutePath: '/repo/Parent',
        children: [
          {
            id: 'child',
            name: 'Child',
            kind: 'directory',
            relativePath: 'Parent/Child',
            absolutePath: '/repo/Parent/Child',
            children: [
              {
                id: 'leaf',
                name: 'leaf.md',
                kind: 'document',
                relativePath: 'Parent/Child/leaf.md',
                absolutePath: '/repo/Parent/Child/leaf.md',
                title: 'Leaf',
              },
            ],
          },
        ],
      },
    ];

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nestedNodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('tree-guide-parent')).toBeNull();

    await user.click(screen.getByText('Parent'));

    expect(
      screen.getByTestId('tree-guide-parent').getAttribute('aria-hidden'),
    ).toBe('true');
    expect(screen.getByTestId('tree-guide-parent').className).toContain(
      'bg-sidebar-foreground/20',
    );
    expect(screen.getByTestId('tree-guide-parent').className).toContain(
      'bottom-0',
    );
    expect(screen.getByTestId('tree-guide-parent').style.left).toBe('17.5px');
    expect(screen.getByTestId('tree-row-surface-parent').style.marginLeft).toBe(
      '0px',
    );
    expect(screen.getByTestId('tree-row-surface-child').style.marginLeft).toBe(
      '20px',
    );
    expect(screen.queryByTestId('tree-guide-child')).toBeNull();

    await user.click(screen.getByText('Child'));

    expect(screen.getByTestId('tree-guide-child').style.left).toBe('37.5px');
    expect(screen.getByTestId('tree-row-surface-leaf').style.marginLeft).toBe(
      '20px',
    );

    await user.click(screen.getByText('Parent'));

    expect(screen.queryByTestId('tree-guide-parent')).toBeNull();
    expect(screen.queryByTestId('tree-guide-child')).toBeNull();
  });

  it('selects native documents and exposes folder menu actions', async () => {
    const user = userEvent.setup();
    const onSelectDocument = vi.fn();
    const onCreateDocument = vi.fn();
    const onCreateDirectory = vi.fn();
    const onImportMarkdown = vi.fn();
    const onRenameNode = vi.fn();
    const onDeleteNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={onCreateDirectory}
        onCreateDocument={onCreateDocument}
        onDeleteNode={onDeleteNode}
        onImportMarkdown={onImportMarkdown}
        onRenameNode={onRenameNode}
        onSelectDocument={onSelectDocument}
      />,
    );

    await user.click(screen.getByText('Guides'));
    await user.click(screen.getByText('入门'));

    expect(onSelectDocument).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'intro.md' }),
    );

    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    expect(screen.queryByRole('menuitem', { name: '导出' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: '新建文档' }));
    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '新建目录' }));

    expect(onCreateDocument).toHaveBeenCalledWith('Guides');
    expect(onCreateDirectory).toHaveBeenCalledWith('Guides');
    expect(onImportMarkdown).not.toHaveBeenCalled();
  });

  it('opens node action menu from ellipsis and exposes export choices', async () => {
    const user = userEvent.setup();
    const onExportNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onExportNode={onExportNode}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 README.md 操作菜单'));

    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '删除文档' })).toBeTruthy();
    const exportTrigger = screen.getByRole('menuitem', { name: '导出' });
    await user.click(exportTrigger);

    expect(screen.getByRole('menuitem', { name: 'HTML' })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Markdown' }),
    ).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'PDF' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Word' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Image' })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'HTML' }));
    expect(onExportNode).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'README.md' }),
      'html',
    );
  });

  it('exposes four professional import formats with their Lucide icons', async () => {
    const user = userEvent.setup();
    const onImportDocuments = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportDocuments={onImportDocuments}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '导入' }));

    const markdown = screen.getByRole('menuitem', { name: '从 Markdown 导入' });
    const word = screen.getByRole('menuitem', { name: '从 Word 导入' });
    const pdf = screen.getByRole('menuitem', { name: '从 PDF 导入' });
    const html = screen.getByRole('menuitem', { name: '从 HTML 导入' });
    expect(markdown.querySelector('.lucide-file-text')).toBeTruthy();
    expect(word.querySelector('.lucide-file-type-corner')).toBeTruthy();
    expect(pdf.querySelector('.lucide-file-search-corner')).toBeTruthy();
    expect(html.querySelector('.lucide-file-code-corner')).toBeTruthy();

    fireEvent.click(pdf);
    expect(onImportDocuments).toHaveBeenCalledWith('Guides', 'pdf');
  });

  it('opens a document from the node action menu in the file manager', async () => {
    const user = userEvent.setup();
    const onOpenInFileManager = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onOpenInFileManager={onOpenInFileManager}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 README.md 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '在文件夹中打开' }));

    expect(onOpenInFileManager).toHaveBeenCalledWith(
      expect.objectContaining({ absolutePath: '/repo/README.md' }),
    );
  });

  it('opens a directory from the context menu in the file manager', async () => {
    const user = userEvent.setup();
    const onOpenInFileManager = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onOpenInFileManager={onOpenInFileManager}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Guides'),
    });
    await user.click(screen.getByRole('menuitem', { name: '在文件夹中打开' }));

    expect(onOpenInFileManager).toHaveBeenCalledWith(
      expect.objectContaining({ absolutePath: '/repo/Guides' }),
    );
  });

  it('copies directory relative paths and document absolute paths from context menus', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <DocumentTree
          currentDocumentPath={null}
          nodes={nodes}
          searchQuery=""
          onCreateDirectory={vi.fn()}
          onCreateDocument={vi.fn()}
          onDeleteNode={vi.fn()}
          onImportMarkdown={vi.fn()}
          onRenameNode={vi.fn()}
          onSelectDocument={vi.fn()}
        />,
      );

      await user.pointer({
        keys: '[MouseRight]',
        target: screen.getByText('Guides'),
      });
      await user.click(screen.getByRole('menuitem', { name: '复制路径' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: '相对路径' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('Guides'));

      await user.pointer({
        keys: '[MouseRight]',
        target: screen.getByText('项目说明'),
      });
      await user.click(screen.getByRole('menuitem', { name: '复制路径' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: '绝对路径' }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith('/repo/README.md'),
      );
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    }
  });

  it('copies a Windows document absolute path without the extended-length prefix', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <DocumentTree
          currentDocumentPath={null}
          nodes={[
            {
              id: 'windows-readme',
              name: 'README.md',
              kind: 'document',
              relativePath: 'README.md',
              absolutePath: String.raw`\\?\D:\vault\README.md`,
              title: '项目说明',
            },
          ]}
          searchQuery=""
          onCreateDirectory={vi.fn()}
          onCreateDocument={vi.fn()}
          onDeleteNode={vi.fn()}
          onImportMarkdown={vi.fn()}
          onRenameNode={vi.fn()}
          onSelectDocument={vi.fn()}
        />,
      );

      await user.pointer({
        keys: '[MouseRight]',
        target: screen.getByText('项目说明'),
      });
      await user.click(screen.getByRole('menuitem', { name: '复制路径' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: '绝对路径' }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(String.raw`D:\vault\README.md`),
      );
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    }
  });

  it('starts inline rename after creating a directory', async () => {
    const user = userEvent.setup();
    const onCreateDirectory = vi.fn().mockResolvedValue({
      id: 'drafts',
      name: '未命名目录',
      kind: 'directory',
      relativePath: '未命名目录',
      absolutePath: '/repo/未命名目录',
      children: [],
    });

    function TestHarness() {
      const [treeNodes, setTreeNodes] = React.useState<WorkspaceNode[]>([]);

      return (
        <DocumentTree
          currentDocumentPath={null}
          nodes={treeNodes}
          searchQuery=""
          onCreateDirectory={async (parentPath) => {
            const created = await onCreateDirectory(parentPath);
            setTreeNodes([created]);
            return created;
          }}
          onCreateDocument={vi.fn()}
          onDeleteNode={vi.fn()}
          onImportMarkdown={vi.fn()}
          onRenameNode={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      );
    }

    render(<TestHarness />);

    await user.click(screen.getByRole('button', { name: '新建目录' }));

    expect(await screen.findByDisplayValue('未命名目录')).toBeTruthy();
  });

  it('starts inline rename after creating the first document from empty state', async () => {
    const user = userEvent.setup();
    const onCreateDocument = vi.fn().mockResolvedValue({
      id: 'draft',
      name: '未命名文档.md',
      kind: 'document',
      relativePath: '未命名文档.md',
      absolutePath: '/repo/未命名文档.md',
      title: '未命名文档',
    });

    function TestHarness() {
      const [treeNodes, setTreeNodes] = React.useState<WorkspaceNode[]>([]);

      return (
        <DocumentTree
          currentDocumentPath={null}
          nodes={treeNodes}
          searchQuery=""
          onCreateDirectory={vi.fn()}
          onCreateDocument={async (parentPath) => {
            const created = await onCreateDocument(parentPath);
            setTreeNodes([created]);
            return created;
          }}
          onDeleteNode={vi.fn()}
          onImportMarkdown={vi.fn()}
          onRenameNode={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      );
    }

    render(<TestHarness />);

    await user.click(screen.getByRole('button', { name: '新建文档' }));

    expect(await screen.findByDisplayValue('未命名文档')).toBeTruthy();
  });

  it('starts rename from action menu without waiting for a timer', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }));

    expect(
      screen.getByRole('textbox', { name: '重命名 Guides' }),
    ).toBeTruthy();
  });

  it('submits inline rename with Enter', async () => {
    const user = userEvent.setup();
    const onRenameNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={onRenameNode}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 README.md 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    await user.clear(await screen.findByDisplayValue('项目说明'));
    await user.type(screen.getByRole('textbox', { name: '重命名 项目说明' }), '新的说明{Enter}');

    expect(onRenameNode).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'README.md' }),
      '新的说明',
    );
  });

  it('submits rename when the displayed title already matches but the physical file name differs', async () => {
    const user = userEvent.setup();
    const onRenameNode = vi.fn();
    const mismatchedDocument: WorkspaceNode = {
      absolutePath: '/workspace/Test.md',
      id: 'Test.md',
      kind: 'document',
      name: 'Test.md',
      relativePath: 'Test.md',
      title: 'Spring Boot 介绍',
    };

    render(
      <DocumentTree
        currentDocumentPath={mismatchedDocument.absolutePath}
        nodes={[mismatchedDocument]}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={onRenameNode}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 Test.md 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    await user.type(
      screen.getByRole('textbox', { name: '重命名 Spring Boot 介绍' }),
      '{Enter}',
    );

    expect(onRenameNode).toHaveBeenCalledWith(
      mismatchedDocument,
      'Spring Boot 介绍',
    );
  });

  it('keeps rename as a no-op when the document title and physical file name already match', async () => {
    const user = userEvent.setup();
    const onRenameNode = vi.fn();
    const synchronizedDocument: WorkspaceNode = {
      absolutePath: '/workspace/Spring Boot 介绍.md',
      id: 'Spring Boot 介绍.md',
      kind: 'document',
      name: 'Spring Boot 介绍.md',
      relativePath: 'Spring Boot 介绍.md',
      title: 'Spring Boot 介绍',
    };

    render(
      <DocumentTree
        currentDocumentPath={synchronizedDocument.absolutePath}
        nodes={[synchronizedDocument]}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={onRenameNode}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(
      screen.getByLabelText('打开 Spring Boot 介绍.md 操作菜单'),
    );
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    await user.type(
      screen.getByRole('textbox', { name: '重命名 Spring Boot 介绍' }),
      '{Enter}',
    );

    expect(onRenameNode).not.toHaveBeenCalled();
  });

  it('renders directory rename input outside the row button', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));

    const renameInput = await screen.findByRole('textbox', {
      name: '重命名 Guides',
    });

    expect(renameInput.closest('button')).toBeNull();
  });

  it('renders tree row content without a nested native button', () => {
    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.getByText('Guides').closest('button')).toBeNull();
    expect(screen.getByText('Guides').closest('[role="button"]')).toBeTruthy();
  });

  it('confirms recursive directory deletion from the node menu', async () => {
    const user = userEvent.setup();
    const onDeleteNode = vi.fn();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={onDeleteNode}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 Guides 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '删除目录' }));

    expect(screen.getByText('删除目录 Guides？')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '删除目录' }));

    expect(onDeleteNode).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Guides' }),
    );
  });

  it('shows delete confirmation without visible page overlay or muted footer background', async () => {
    const user = userEvent.setup();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('打开 README.md 操作菜单'));
    await user.click(screen.getByRole('menuitem', { name: '删除文档' }));

    const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]');
    const footer = document.querySelector('[data-slot="alert-dialog-footer"]');

    expect(overlay?.className).not.toContain('bg-black/10');
    expect(overlay?.className).not.toContain('backdrop-blur-xs');
    expect(footer?.className).not.toContain('bg-muted/50');
  });

  it('disables drag sorting while search results are filtered', () => {
    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery="入门"
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={vi.fn()}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.getByTestId('tree-row-guides').getAttribute('draggable')).toBe(
      'false',
    );
  });

  it('calls onMoveNode with inside position when a document is dropped onto a directory center', () => {
    const onMoveNode = vi.fn();
    const dataTransfer = createDragDataTransfer();

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={onMoveNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    fireEvent.dragStart(screen.getByTestId('tree-row-readme'), {
      dataTransfer,
    });
    fireEvent.dragEnter(screen.getByTestId('tree-row-guides'), {
      clientY: 16,
      dataTransfer,
    });
    fireEvent.drop(screen.getByTestId('tree-row-guides'), {
      clientY: 16,
      dataTransfer,
    });

    expect(onMoveNode).toHaveBeenCalledWith({
      nodePath: '/repo/README.md',
      position: 'inside',
      targetPath: '/repo/Guides',
    });
  });

  it('uses drag payload when drop happens before dragged state renders', () => {
    const onMoveNode = vi.fn();
    const dataTransfer = createDragDataTransfer('/repo/README.md');

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={nodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={onMoveNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    fireEvent.dragOver(screen.getByTestId('tree-row-guides'), {
      clientY: 16,
      dataTransfer,
    });
    fireEvent.drop(screen.getByTestId('tree-row-guides'), {
      clientY: 16,
      dataTransfer,
    });

    expect(onMoveNode).toHaveBeenCalledWith({
      nodePath: '/repo/README.md',
      position: 'inside',
      targetPath: '/repo/Guides',
    });
  });

  it('moves a Windows document path into a directory', () => {
    const onMoveNode = vi.fn();
    const dataTransfer = createDragDataTransfer();
    const windowsNodes: WorkspaceNode[] = [
      {
        id: 'windows-guides',
        name: 'Guides',
        kind: 'directory',
        relativePath: 'Guides',
        absolutePath: String.raw`\\?\D:\vault\Guides`,
      },
      {
        id: 'windows-readme',
        name: 'README.md',
        kind: 'document',
        relativePath: 'README.md',
        absolutePath: String.raw`\\?\D:\vault\README.md`,
        title: '项目说明',
      },
    ];

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={windowsNodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={onMoveNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    fireEvent.dragStart(screen.getByTestId('tree-row-windows-readme'), {
      dataTransfer,
    });
    fireEvent.dragOver(screen.getByTestId('tree-row-windows-guides'), {
      clientY: 16,
      dataTransfer,
    });
    fireEvent.drop(screen.getByTestId('tree-row-windows-guides'), {
      clientY: 16,
      dataTransfer,
    });

    expect(onMoveNode).toHaveBeenCalledWith({
      nodePath: String.raw`\\?\D:\vault\README.md`,
      position: 'inside',
      targetPath: String.raw`\\?\D:\vault\Guides`,
    });
  });

  it('blocks moving a Windows directory into its descendant', async () => {
    const user = userEvent.setup();
    const onMoveNode = vi.fn();
    const dataTransfer = createDragDataTransfer();
    const windowsNodes: WorkspaceNode[] = [
      {
        id: 'windows-docs',
        name: 'Docs',
        kind: 'directory',
        relativePath: 'Docs',
        absolutePath: String.raw`\\?\D:\vault\Docs`,
        children: [
          {
            id: 'windows-child',
            name: 'Child',
            kind: 'directory',
            relativePath: 'Docs/Child',
            absolutePath: String.raw`\\?\D:\vault\Docs\Child`,
          },
        ],
      },
    ];

    render(
      <DocumentTree
        currentDocumentPath={null}
        nodes={windowsNodes}
        searchQuery=""
        onCreateDirectory={vi.fn()}
        onCreateDocument={vi.fn()}
        onDeleteNode={vi.fn()}
        onImportMarkdown={vi.fn()}
        onMoveNode={onMoveNode}
        onRenameNode={vi.fn()}
        onSelectDocument={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('tree-row-windows-docs'));

    fireEvent.dragStart(screen.getByTestId('tree-row-windows-docs'), {
      dataTransfer,
    });
    fireEvent.dragOver(screen.getByTestId('tree-row-windows-child'), {
      clientY: 16,
      dataTransfer,
    });
    fireEvent.drop(screen.getByTestId('tree-row-windows-child'), {
      clientY: 16,
      dataTransfer,
    });

    expect(onMoveNode).not.toHaveBeenCalled();
  });
});

function createDragDataTransfer(payload = '') {
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: vi.fn(() => payload),
    setData: vi.fn(),
  };
}

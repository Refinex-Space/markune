import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readMarkdownDocument,
  renameWorkspaceNode,
  saveMarkdownDocument,
} from '../workspace-api';
import { WorkspaceLayout } from '../workspace-layout';
import type { WorkspaceSnapshot } from '../workspace-types';

vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({
    documentKey,
    markdown,
    onMarkdownChange,
    onSaveRequested,
  }: {
    documentKey?: string;
    markdown?: string;
    onMarkdownChange?: (markdown: string) => void;
    onSaveRequested?: () => void;
  }) => (
    <div>
      <div data-document-key={documentKey} data-testid="markdown-editor">
        {markdown ?? ''}
      </div>
      <button
        type="button"
        onClick={() =>
          onMarkdownChange?.(
            '---\ntitle: 指南\n---\n\n# 指南\n\n更新正文\n',
          )
        }
      >
        模拟编辑
      </button>
      <button
        type="button"
        onClick={() =>
          onMarkdownChange?.('---\ntitle: 新标题\n---\n\n# 新标题\n\n正文\n')
        }
      >
        模拟H1修改
      </button>
      <button type="button" onClick={() => onSaveRequested?.()}>
        模拟快捷保存
      </button>
    </div>
  ),
}));

vi.mock('../ai-panel/ai-panel-content', () => ({
  AiPanelContent: ({
    onMarkdownDocumentApplied,
  }: {
    onMarkdownDocumentApplied?: (document: {
      content: string;
      modifiedAt: number | null;
      path: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onMarkdownDocumentApplied?.({
          content: '---\ntitle: 指南\n---\n\n# 指南\n\nAI 改写正文\n',
          modifiedAt: 9,
          path: '/repo/guide.md',
        })
      }
    >
      模拟 AI 应用
    </button>
  ),
}));


vi.mock('../workspace-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace-api')>();

  return {
    ...actual,
    loadWorkspaceTree: vi.fn().mockResolvedValue({
      rootPath: '/repo',
      rootName: 'repo',
      nodes: [
        {
          id: 'guide',
          name: '新标题.md',
          kind: 'document',
          relativePath: '新标题.md',
          absolutePath: '/repo/新标题.md',
          title: '新标题',
        },
        {
          id: 'notes',
          name: 'notes.md',
          kind: 'document',
          relativePath: 'notes.md',
          absolutePath: '/repo/notes.md',
          title: '笔记',
        },
      ],
    }),
    readMarkdownDocument: vi.fn(),
    renameWorkspaceNode: vi.fn(),
    saveMarkdownDocument: vi.fn(),
    setAppWindowTitle: vi.fn(),
  };
});

const readMarkdownDocumentMock = vi.mocked(readMarkdownDocument);
const renameWorkspaceNodeMock = vi.mocked(renameWorkspaceNode);
const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);

const guideMarkdown =
  '---\ntitle: 指南\ncreatedAt: 2026-05-30T00:00:00.000Z\nupdatedAt: 2026-05-30T00:00:00.000Z\nrefinexDialect: 1\n---\n\n# 指南\n\n正文\n';

const notesMarkdown =
  '---\ntitle: 笔记\ncreatedAt: 2026-05-30T00:00:00.000Z\nupdatedAt: 2026-05-30T00:00:00.000Z\nrefinexDialect: 1\n---\n\n# 笔记\n\n笔记正文\n';

const crlfGuideMarkdown = [
  '---',
  'title: 指南',
  'createdAt: 2026-05-30T00:00:00.000Z',
  'updatedAt: 2026-05-30T00:00:00.000Z',
  'refinexDialect: 1',
  '---',
  '',
  '# 指南',
  '',
  '正文',
  '',
].join('\r\n');

const snapshot: WorkspaceSnapshot = {
  rootPath: '/repo',
  rootName: 'repo',
  nodes: [
    {
      id: 'guide',
      name: 'guide.md',
      kind: 'document',
      relativePath: 'guide.md',
      absolutePath: '/repo/guide.md',
      title: '指南',
    },
    {
      id: 'notes',
      name: 'notes.md',
      kind: 'document',
      relativePath: 'notes.md',
      absolutePath: '/repo/notes.md',
      title: '笔记',
    },
  ],
};

describe('Workspace native document flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    readMarkdownDocumentMock.mockReset();
    renameWorkspaceNodeMock.mockReset();
    saveMarkdownDocumentMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the selected native document into the editor', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));

    await waitFor(() => {
      expect(screen.getByTestId('markdown-editor').textContent).toContain('正文');
    });

    expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
      '/repo',
      '/repo/guide.md',
    );
    expect(
      screen.getByTestId('markdown-editor').getAttribute('data-document-key'),
    ).toContain('/repo/guide.md');
  });

  it('does not compensate documents that already have CRLF frontmatter', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: crlfGuideMarkdown,
      modifiedAt: 1,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');

    expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  });

  it('auto saves edited native content after debounce', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 2,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟编辑'));

    expect(screen.getByText('有未保存更改')).toBeTruthy();

    vi.advanceTimersByTime(800);
    vi.useRealTimers();

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeTruthy();
    });
  });

  it('saves immediately when save is requested', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 3,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    await user.click(screen.getByText('模拟编辑'));
    await user.click(screen.getByText('模拟快捷保存'));

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
  });

  it('keeps edited content visible when save fails', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    saveMarkdownDocumentMock.mockRejectedValueOnce(
      new Error('无法保存 Markdown 文档内容'),
    );

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟编辑'));

    vi.advanceTimersByTime(800);
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText('无法保存 Markdown 文档内容')).toBeTruthy();
    });

    expect(screen.getByTestId('markdown-editor')).toBeTruthy();
  });

  it('saves dirty content before opening another document', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock
      .mockResolvedValueOnce({
        path: '/repo/guide.md',
        content: guideMarkdown,
        modifiedAt: 1,
      })
      .mockResolvedValueOnce({
        path: '/repo/notes.md',
        content: notesMarkdown,
        modifiedAt: 4,
      });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      modifiedAt: 3,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    await user.click(screen.getByText('模拟编辑'));
    await user.click(screen.getByText('笔记'));

    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.stringContaining('更新正文'),
        1,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('markdown-editor').textContent).toContain(
        '笔记正文',
      );
    });
  });

  it('syncs the open editor when AI applies a markdown document edit', async () => {
    const user = userEvent.setup();
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);

    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    await user.click(screen.getByLabelText('展开 AI 面板'));
    await user.click(screen.getByText('模拟 AI 应用'));

    await waitFor(() => {
      expect(screen.getByTestId('markdown-editor').textContent).toContain(
        'AI 改写正文',
      );
    });
  });

  it('renames document file when H1 title changes', async () => {
    readMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/guide.md',
      content: guideMarkdown,
      modifiedAt: 1,
    });
    renameWorkspaceNodeMock.mockResolvedValueOnce({
      id: 'guide',
      name: '新标题.md',
      kind: 'document' as const,
      relativePath: '新标题.md',
      absolutePath: '/repo/新标题.md',
      title: '新标题',
      children: [],
    });
    saveMarkdownDocumentMock.mockResolvedValueOnce({
      path: '/repo/新标题.md',
      modifiedAt: 2,
    });

    render(<WorkspaceLayout initialSnapshot={snapshot} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('指南'));
    await screen.findByTestId('markdown-editor');
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('模拟H1修改'));

    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    await waitFor(() => {
      expect(renameWorkspaceNodeMock).toHaveBeenCalledWith(
        '/repo',
        '/repo/guide.md',
        expect.any(String),
      );
    });
    await waitFor(() => {
      expect(saveMarkdownDocumentMock).toHaveBeenLastCalledWith(
        '/repo',
        '/repo/新标题.md',
        expect.any(String),
        null,
      );
    });
  });
});

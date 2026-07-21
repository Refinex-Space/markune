import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiDocumentPreview } from '../ai-document-preview';
import { readMarkdownDocument } from '../workspace-api';

vi.mock('../workspace-api', () => ({
  readMarkdownDocument: vi.fn(),
}));

vi.mock('@/components/editor/markdown-editor', () => ({
  MarkdownEditor: ({ markdown, readOnly }: { markdown: string; readOnly: boolean }) => (
    <div data-read-only={readOnly ? 'true' : 'false'}>{markdown}</div>
  ),
}));

const document = {
  absolutePath: '/workspace/docs/README.md',
  children: [],
  id: '/workspace/docs/README.md',
  kind: 'document' as const,
  name: 'README.md',
  relativePath: 'docs/README.md',
  title: 'README',
};

describe('AiDocumentPreview', () => {
  beforeEach(() => {
    vi.mocked(readMarkdownDocument).mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('不切换当前文档即可只读加载磁盘内容', async () => {
    vi.mocked(readMarkdownDocument).mockResolvedValue({
      content: '# README',
      modifiedAt: 1,
      path: document.absolutePath,
    });

    render(
      <AiDocumentPreview
        document={document}
        markdownOverride={null}
        pageWidthMode="wide"
        workspaceRootPath="/workspace"
        onClose={vi.fn()}
        onOpenInEditor={vi.fn()}
      />,
    );

    expect(screen.getByText('正在打开文档…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('# README')).toBeTruthy());
    expect(readMarkdownDocument).toHaveBeenCalledWith(
      '/workspace',
      document.absolutePath,
    );
    expect(screen.getByText('# README').getAttribute('data-read-only')).toBe(
      'true',
    );
  });

  it('优先展示打开标签中的内存草稿并支持关闭或提升为编辑器 Tab', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenInEditor = vi.fn();

    render(
      <AiDocumentPreview
        document={document}
        markdownOverride="# 未保存草稿"
        pageWidthMode="wide"
        workspaceRootPath="/workspace"
        onClose={onClose}
        onOpenInEditor={onOpenInEditor}
      />,
    );

    expect(screen.getByText('# 未保存草稿')).toBeTruthy();
    expect(readMarkdownDocument).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '在编辑器中打开' }));
    expect(onOpenInEditor).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '关闭文档预览' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocumentMetaPanel } from '../document-meta-panel';
import type { WorkspaceNode } from '../workspace-types';

const document: WorkspaceNode = {
  id: 'note', kind: 'document', name: 'note.md', title: '文档标题',
  absolutePath: '/workspace/note.md', relativePath: 'note.md',
};
const data = {
  markdown: '# 文档标题\n\n正文内容',
  metadata: { title: '文档标题', createdAt: '2026-10-03T09:26:05Z', updatedAt: '2026-10-06T11:23:54Z' },
  frontmatter: { title: '文档标题', updatedAt: '2026-10-06T11:23:54.649Z' },
};
const props = { currentDocument: document, documentPanelData: data, readOnly: false, workspaceRootPath: null };

describe('DocumentMetaPanel', () => {
  it('显式选择编辑和阅读模式，点击当前模式不重复切换', async () => {
    const user = userEvent.setup();
    const onToggleReadOnly = vi.fn();
    const { rerender } = render(<DocumentMetaPanel {...props} onToggleReadOnly={onToggleReadOnly} />);
    const edit = screen.getByRole('button', { name: '切换为编辑模式' });
    const read = screen.getByRole('button', { name: '切换为阅读模式' });
    expect(edit.getAttribute('aria-pressed')).toBe('true');
    await user.click(edit);
    expect(onToggleReadOnly).not.toHaveBeenCalled();
    await user.click(read);
    expect(onToggleReadOnly).toHaveBeenCalledTimes(1);
    rerender(<DocumentMetaPanel {...props} readOnly onToggleReadOnly={onToggleReadOnly} />);
    expect(read.getAttribute('aria-pressed')).toBe('true');
    await user.click(read);
    expect(onToggleReadOnly).toHaveBeenCalledTimes(1);
    await user.click(edit);
    expect(onToggleReadOnly).toHaveBeenCalledTimes(2);
  });

  it('标签页支持方向键导航，切换文档后回到元信息', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DocumentMetaPanel {...props} />);
    await user.click(screen.getByRole('tab', { name: '元信息' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '资源 0' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: '资源 0' })).toBeTruthy();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tabpanel', { name: '元信息' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '资源 0' }));
    rerender(<DocumentMetaPanel {...props} currentDocument={{ ...document, absolutePath: '/workspace/other.md' }} />);
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: '元信息' })).toBeTruthy());
    expect(screen.getByText(data.frontmatter.updatedAt)).toBeTruthy();
  });

  it('缺少模式切换回调时两个模式均禁用', () => {
    render(<DocumentMetaPanel {...props} />);
    expect(screen.getByRole('button', { name: '切换为编辑模式' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '切换为阅读模式' }).hasAttribute('disabled')).toBe(true);
  });
});

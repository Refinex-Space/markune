import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkspaceStatusBar } from '../workspace-layout';

describe('WorkspaceStatusBar', () => {
  it('源码模式将返回快捷键与右侧状态文字放入同一状态栏', () => {
    render(
      <WorkspaceStatusBar
        characterCount={1271}
        lineCount={54}
        saveError={null}
        saveState="saved"
        sourceMode
        visible
      />,
    );

    const statusBar = screen.getByTestId('workspace-status-bar');
    expect(screen.getByText('Ctrl / Cmd + / 返回')).toBeTruthy();
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(screen.getByText('UTF-8 · Markdown')).toBeTruthy();
    expect(statusBar.className).toContain('items-center');
  });

  it('非源码模式不显示返回快捷键', () => {
    render(
      <WorkspaceStatusBar
        characterCount={1271}
        lineCount={54}
        saveError={null}
        saveState="saved"
        sourceMode={false}
        visible
      />,
    );

    expect(screen.queryByText('Ctrl / Cmd + / 返回')).toBeNull();
  });
});

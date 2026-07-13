import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createWorkspaceSettingsSessionCache } from '../workspace-settings-cache';
import { WorkspaceSettingsPage } from '../workspace-settings-page';
import type { AppSettings } from '../workspace-types';

const themeState = vi.hoisted(() => ({ setTheme: vi.fn() }));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: themeState.setTheme, theme: 'light' }),
}));

const initialSettings: AppSettings = {
  appearance: {
    fonts: {
      code: 'JetBrains Mono',
      document: 'Songti SC',
      ui: 'SF Pro Text',
    },
    pageWidthMode: 'wide',
  },
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
};

function renderSettingsPage() {
  return render(
    <WorkspaceSettingsPage
      initialSettings={initialSettings}
      sessionCache={createWorkspaceSettingsSessionCache()}
      workspaceRootPath="D:/notes"
      onBack={vi.fn()}
    />,
  );
}

describe('WorkspaceSettingsPage', () => {
  it('restores the full-width non-AI settings shell and appearance previews', () => {
    renderSettingsPage();

    expect(screen.getByTestId('workspace-settings-page').className).toContain(
      'flex-1',
    );
    expect(screen.getByTestId('workspace-settings-page').className).toContain(
      'min-w-0',
    );
    expect(screen.getByTestId('workspace-editor-column')).toBeTruthy();
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'max-w-[1120px]',
    );
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Git Sync' })).toBeTruthy();
    expect(screen.queryByText(/^AI/)).toBeNull();
    expect(screen.getByTestId('theme-preview-system')).toBeTruthy();
    expect(screen.getByTestId('theme-preview-light')).toBeTruthy();
    expect(screen.getByTestId('theme-preview-dark')).toBeTruthy();
    expect(
      screen.getByTestId('theme-preview-system').querySelector('.border-l-2'),
    ).toBeNull();
    expect(
      screen.getByTestId('theme-preview-light').querySelector('.border-l-2'),
    ).toBeNull();
    expect(
      screen.getByTestId('theme-preview-dark').querySelector('.border-l-2'),
    ).toBeNull();
    expect(screen.getByTestId('page-width-preview-standard')).toBeTruthy();
    expect(screen.getByTestId('page-width-preview-wide')).toBeTruthy();
    expect(screen.getByText('Madora · 本地知识库')).toBeTruthy();
    expect(
      screen.getByText('这是一段用于预览文档字体的文本。'),
    ).toBeTruthy();
  });

  it('keeps storage and Git Sync information in structured cards', async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: '存储' }));

    expect(screen.getByTestId('storage-provider-card')).toBeTruthy();
    expect(screen.getByTestId('storage-local-card')).toBeTruthy();
    expect(screen.getByDisplayValue('D:/notes/.madora/assets/files')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Git Sync' }));

    expect(screen.getByTestId('git-sync-enable-card')).toBeTruthy();
    expect(screen.getByTestId('git-sync-repository-card')).toBeTruthy();
    expect(screen.getByTestId('git-sync-preferences-card')).toBeTruthy();
    expect(screen.getByTestId('git-sync-last-synced').textContent).toBe(
      '尚未同步',
    );
  });

  it('filters the non-AI navigation without changing the settings surface', async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    await user.type(screen.getByLabelText('搜索设置'), 'git');

    expect(screen.queryByRole('button', { name: '外观' })).toBeNull();
    expect(screen.queryByRole('button', { name: '存储' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Git Sync' })).toBeTruthy();
    expect(screen.getByTestId('git-sync-settings-shell')).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceSettingsSessionCache } from '../workspace-settings-cache';
import { WorkspaceSettingsPage } from '../workspace-settings-page';
import type { AppUpdateController } from '../use-app-update';
import type { AppSettings } from '../workspace-types';

const themeState = vi.hoisted(() => ({ setTheme: vi.fn() }));
const workspaceApiState = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => false),
  listSystemFonts: vi.fn(() =>
    Promise.resolve({
      code: ['JetBrains Mono'],
      document: ['Songti SC'],
      recommendations: {
        code: 'JetBrains Mono',
        document: 'Songti SC',
        ui: 'SF Pro Text',
      },
      ui: ['SF Pro Text'],
    }),
  ),
  openUrlInDefaultBrowser: vi.fn(() => Promise.resolve()),
  saveAppSettings: vi.fn((settings: AppSettings) => Promise.resolve(settings)),
  setAppWindowOpacity: vi.fn(() => Promise.resolve()),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: themeState.setTheme, theme: 'light' }),
}));

vi.mock('../workspace-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../workspace-api')>()),
  isTauriRuntime: workspaceApiState.isTauriRuntime,
  listSystemFonts: workspaceApiState.listSystemFonts,
  openUrlInDefaultBrowser: workspaceApiState.openUrlInDefaultBrowser,
  saveAppSettings: workspaceApiState.saveAppSettings,
  setAppWindowOpacity: workspaceApiState.setAppWindowOpacity,
}));

const initialSettings: AppSettings = {
  appearance: {
    fonts: {
      code: 'JetBrains Mono',
      document: 'Songti SC',
      ui: 'SF Pro Text',
    },
    pageWidthMode: 'wide',
    systemNavCollapsed: false,
    systemNavLayout: 'vertical',
    windowOpacity: 100,
  },
  calendar: {
    expanded: true,
    weekStartsOn: 'monday',
  },
  schemaVersion: 1,
  storage: { defaultProvider: 'local' },
};

const appUpdateController: AppUpdateController = {
  available: false,
  check: vi.fn(() => Promise.resolve()),
  currentVersion: '0.1.0',
  downloadedBytes: 0,
  error: null,
  install: vi.fn(() => Promise.resolve()),
  lastCheckedAt: null,
  phase: 'idle',
  restart: vi.fn(() => Promise.resolve()),
  totalBytes: null,
  update: null,
};

function renderSettingsPage() {
  return render(
    <WorkspaceSettingsPage
      appUpdate={appUpdateController}
      initialSettings={initialSettings}
      sessionCache={createWorkspaceSettingsSessionCache()}
      workspaceRootPath="D:/notes"
      onBack={vi.fn()}
    />,
  );
}

describe('WorkspaceSettingsPage', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        disconnect() {}

        observe() {}

        unobserve() {}
      },
    );
    Object.assign(appUpdateController, {
      available: false,
      check: vi.fn(() => Promise.resolve()),
      currentVersion: '0.1.0',
      downloadedBytes: 0,
      error: null,
      install: vi.fn(() => Promise.resolve()),
      lastCheckedAt: null,
      phase: 'idle',
      restart: vi.fn(() => Promise.resolve()),
      totalBytes: null,
      update: null,
    } satisfies AppUpdateController);
    workspaceApiState.isTauriRuntime.mockReturnValue(false);
    workspaceApiState.listSystemFonts.mockClear();
    workspaceApiState.openUrlInDefaultBrowser.mockClear();
    workspaceApiState.saveAppSettings.mockClear();
    workspaceApiState.setAppWindowOpacity.mockClear();
  });

  it('restores the full-width non-AI settings shell and appearance previews', () => {
    renderSettingsPage();

    expect(screen.getByTestId('workspace-settings-page').className).toContain(
      'flex-1',
    );
    expect(screen.getByTestId('workspace-settings-page').className).toContain(
      'min-w-0',
    );
    const editorColumn = screen.getByTestId('workspace-editor-column');
    expect(editorColumn.className).toContain('m-2');
    expect(editorColumn.className).not.toContain('shadow-[');
    expect(screen.getByTestId('workspace-settings-content').className).toContain(
      'max-w-[1120px]',
    );
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存储' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Git Sync' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '版本' })).toBeTruthy();
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
    expect(screen.getByTestId('system-nav-settings')).toBeTruthy();
    expect(screen.getByTestId('system-nav-layout-select')).toBeTruthy();
    expect(screen.getByTestId('system-nav-collapsed-switch')).toBeTruthy();
    expect(screen.getByTestId('window-opacity-settings')).toBeTruthy();
    expect(
      (screen.getByRole('slider', { name: '应用透明度' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Madora · 本地知识库')).toBeTruthy();
    expect(
      screen.getByText('这是一段用于预览文档字体的文本。'),
    ).toBeTruthy();
  });

  it('previews window opacity while dragging and persists it on commit', async () => {
    workspaceApiState.isTauriRuntime.mockReturnValue(true);
    const onSettingsSaved = vi.fn();

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath={null}
        onBack={vi.fn()}
        onSettingsSaved={onSettingsSaved}
      />,
    );

    const slider = screen.getByRole('slider', { name: '应用透明度' });
    expect((slider as HTMLInputElement).disabled).toBe(false);

    fireEvent.change(slider, { target: { value: '82' } });
    expect(screen.getByText('82%')).toBeTruthy();
    expect(workspaceApiState.setAppWindowOpacity).toHaveBeenLastCalledWith(82);
    expect(workspaceApiState.saveAppSettings).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    await waitFor(() =>
      expect(workspaceApiState.saveAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({ windowOpacity: 82 }),
        }),
      ),
    );
    expect(onSettingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({ windowOpacity: 82 }),
      }),
    );

    await userEvent.setup().click(
      screen.getByRole('button', { name: '恢复默认' }),
    );
    expect(workspaceApiState.setAppWindowOpacity).toHaveBeenLastCalledWith(100);
    await waitFor(() =>
      expect(workspaceApiState.saveAppSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({ windowOpacity: 100 }),
        }),
      ),
    );
  });

  it('searches the full font list without rendering every option at once', async () => {
    const user = userEvent.setup();
    const onSettingsSaved = vi.fn();
    const sessionCache = createWorkspaceSettingsSessionCache();
    sessionCache.systemFonts = {
      code: ['JetBrains Mono'],
      document: ['Songti SC'],
      recommendations: {
        code: 'JetBrains Mono',
        document: 'Songti SC',
        ui: 'SF Pro Text',
      },
      ui: [
        'SF Pro Text',
        ...Array.from(
          { length: 70 },
          (_, index) => `System Font ${String(index).padStart(2, '0')}`,
        ),
        'Fira Sans',
      ],
    };

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        sessionCache={sessionCache}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
        onSettingsSaved={onSettingsSaved}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'UI 字体' }));

    const searchInput = screen.getByLabelText('搜索UI 字体');
    expect(screen.getByText(/请继续输入以缩小范围/)).toBeTruthy();
    expect(screen.queryByText('Fira Sans')).toBeNull();

    await user.type(searchInput, 'fira');
    expect(screen.getByText('Fira Sans')).toBeTruthy();
    expect(screen.queryByText('System Font 00')).toBeNull();

    await user.clear(searchInput);
    await user.type(searchInput, 'missing font');
    expect(screen.getByText('未找到匹配的字体')).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, 'fira');
    await user.click(screen.getByText('Fira Sans'));

    await waitFor(() =>
      expect(onSettingsSaved).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({
            fonts: expect.objectContaining({ ui: 'Fira Sans' }),
          }),
        }),
      ),
    );
    expect(screen.queryByLabelText('搜索UI 字体')).toBeNull();
  });

  it('persists system nav layout and collapsed preference from appearance settings', async () => {
    const user = userEvent.setup();
    const onSettingsSaved = vi.fn();

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
        onSettingsSaved={onSettingsSaved}
      />,
    );

    await user.click(screen.getByTestId('system-nav-layout-select'));
    await user.click(screen.getByTestId('system-nav-layout-horizontal'));
    expect(onSettingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          systemNavLayout: 'horizontal',
          systemNavCollapsed: false,
        }),
      }),
    );

    await user.click(screen.getByTestId('system-nav-collapsed-switch'));
    expect(onSettingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          systemNavLayout: 'horizontal',
          systemNavCollapsed: true,
        }),
      }),
    );
  });

  it('persists calendar expansion and week start settings', async () => {
    const user = userEvent.setup();
    const onSettingsSaved = vi.fn();

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
        onSettingsSaved={onSettingsSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: '日历' }));
    expect(screen.getByTestId('calendar-settings-shell')).toBeTruthy();

    await user.click(screen.getByTestId('calendar-expanded-switch'));
    expect(onSettingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        calendar: { expanded: false, weekStartsOn: 'monday' },
      }),
    );

    await user.click(screen.getByTestId('calendar-week-start-select'));
    await user.click(screen.getByTestId('calendar-week-start-sunday'));
    expect(onSettingsSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        calendar: { expanded: false, weekStartsOn: 'sunday' },
      }),
    );
  });

  it('uses the compact sidebar top inset below Windows titlebar controls', () => {
    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        windowsChromeInset
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
      />,
    );

    const spacer = screen.getByTestId(
      'workspace-settings-sidebar-titlebar-spacer',
    );
    expect(spacer.className).toContain('h-2');
    expect(spacer.className).not.toContain('h-10');
  });

  it('uses the measured macOS chrome content inset before settings controls', () => {
    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSettings={initialSettings}
        macChromeContentTop={46}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="/notes"
        onBack={vi.fn()}
      />,
    );

    const spacer = screen.getByTestId(
      'workspace-settings-sidebar-titlebar-spacer',
    );
    expect(spacer.style.height).toBe('46px');
    expect(spacer.className).not.toContain('h-10');
  });

  it('shows the runtime Madora version from the last settings section', async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    const navigation = screen.getByRole('navigation', { name: '设置分类' });
    const sectionButtons = navigation.querySelectorAll('button');

    expect(sectionButtons.item(sectionButtons.length - 1).textContent).toContain(
      '版本',
    );

    await user.click(screen.getByRole('button', { name: '版本' }));

    expect(screen.getByRole('img', { name: 'Madora Logo' })).toBeTruthy();
    expect((await screen.findByTestId('madora-version')).textContent).toBe(
      '0.1.0',
    );
  });

  it('shows an unavailable state when the runtime version cannot be read', async () => {
    appUpdateController.currentVersion = null;

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSectionId="version"
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
      />,
    );

    expect((await screen.findByTestId('madora-version')).textContent).toBe(
      '版本信息不可用',
    );
  });

  it('shows release metadata and starts an explicitly selected update', async () => {
    const user = userEvent.setup();
    Object.assign(appUpdateController, {
      available: true,
      phase: 'available',
      update: {
        body: '修复导出稳定性问题。',
        currentVersion: '0.1.0',
        date: Date.UTC(2026, 6, 23, 8),
        version: '0.1.1',
      },
    });

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSectionId="version"
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('0.1.1')).toBeTruthy();
    expect(screen.getByText('修复导出稳定性问题。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '下载并安装' }));
    expect(appUpdateController.install).toHaveBeenCalledTimes(1);
  });

  it('keeps the installed update in the explicit restart state', async () => {
    const user = userEvent.setup();
    Object.assign(appUpdateController, {
      available: true,
      phase: 'ready-to-restart',
      update: {
        body: null,
        currentVersion: '0.1.0',
        date: null,
        version: '0.1.1',
      },
    });

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSectionId="version"
        initialSettings={initialSettings}
        sessionCache={createWorkspaceSettingsSessionCache()}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '检查更新' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: '重启并完成更新' }),
    );
    expect(appUpdateController.restart).toHaveBeenCalledTimes(1);
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

  it('opens the remote repository explicitly in the desktop default browser', async () => {
    const user = userEvent.setup();
    const sessionCache = createWorkspaceSettingsSessionCache();
    sessionCache.systemFonts = {
      code: [],
      document: [],
      recommendations: { code: '', document: '', ui: '' },
      ui: [],
    };
    sessionCache.entries.set('D:/notes', {
      gitProbe: {
        branch: 'main',
        gitAvailable: true,
        isRepository: true,
        rootPath: 'D:/notes',
      },
      gitRemote: {
        remoteUrl: 'git@github.com:refinex-space/madora.git',
        webUrl: 'https://github.com/refinex-space/madora',
      },
      gitSyncSettings: {
        conflictResolution: 'abort',
        enabled: true,
        intervalMinutes: 10,
        lastSyncedAt: null,
      },
      settings: initialSettings,
    });
    workspaceApiState.isTauriRuntime.mockReturnValue(true);

    render(
      <WorkspaceSettingsPage
        appUpdate={appUpdateController}
        initialSectionId="git-sync"
        initialSettings={initialSettings}
        sessionCache={sessionCache}
        workspaceRootPath="D:/notes"
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('link', { name: '打开远程仓库' }));

    expect(workspaceApiState.openUrlInDefaultBrowser).toHaveBeenCalledWith(
      'https://github.com/refinex-space/madora',
    );
  });
});

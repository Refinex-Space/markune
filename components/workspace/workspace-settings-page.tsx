'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  ExternalLink,
  FolderArchive,
  GitBranch,
  Info,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  ensureWorkspace,
  gitProbe,
  gitRemoteInfo,
  gitSyncNow,
  isTauriRuntime,
  listSystemFonts,
  openUrlInDefaultBrowser,
  saveAppSettings,
  saveWorkspaceGitSyncSettings,
  setAppWindowOpacity,
} from './workspace-api';
import {
  clearCodexCustomProvider,
  codexAppServerClient,
  getCodexConnectionStatus,
  getCodexCustomProvider,
  setCodexAuthMode,
  setCodexCustomProvider,
  startCodexRuntime,
  stopCodexRuntime,
  type CodexConnectionStatus,
  type CodexCustomProviderInfo,
} from './codex-app-server';
import type { AppUpdateController } from './use-app-update';
import type {
  WorkspaceSettingsCacheEntry,
  WorkspaceSettingsSessionCache,
} from './workspace-settings-cache';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import {
  MAX_WINDOW_OPACITY,
  MIN_WINDOW_OPACITY,
  withDefaultAppSettings,
} from './workspace-settings';
import type {
  AppearanceFontSettings,
  AppSettings,
  CalendarWeekStartsOn,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  PageWidthMode,
  SystemFontOptions,
  SystemNavLayout,
  WorkspaceGitSyncSettings,
} from './workspace-types';

export type SettingsSectionId =
  | 'appearance'
  | 'calendar'
  | 'codex'
  | 'storage'
  | 'git-sync'
  | 'version';
type GitActionState =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'syncing'
  | 'saved'
  | 'synced'
  | 'error';

interface WorkspaceSettingsPageProps {
  appUpdate: AppUpdateController;
  header?: React.ReactNode;
  initialSettings: AppSettings;
  initialSectionId?: SettingsSectionId;
  macChromeContentTop?: number;
  sessionCache: WorkspaceSettingsSessionCache;
  sidebarResize?: {
    max: number;
    min: number;
    onResize: (width: number) => void;
  };
  sidebarWidth?: number;
  windowsChromeInset?: boolean;
  workspaceRootPath: string | null;
  onBack: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

const DEFAULT_FONTS: SystemFontOptions = {
  code: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas'],
  document: ['Songti SC', 'PingFang SC', 'Noto Serif CJK SC'],
  recommendations: {
    code: 'JetBrains Mono',
    document: 'Songti SC',
    ui: 'SF Pro Text',
  },
  ui: ['SF Pro Text', 'PingFang SC', 'Segoe UI', 'Geist'],
};

const DEFAULT_GIT_SYNC: WorkspaceGitSyncSettings = {
  conflictResolution: 'abort',
  enabled: true,
  intervalMinutes: 10,
  lastSyncedAt: null,
};

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  searchTerms: string[];
}> = [
  {
    id: 'appearance',
    icon: Palette,
    label: '外观',
    searchTerms: [
      '外观',
      '主题',
      '亮色',
      '暗色',
      '页面宽度',
      '字体',
      '系统入口',
      '纵向',
      '横向',
      '收起系统入口',
    ],
  },
  {
    id: 'calendar',
    icon: CalendarDays,
    label: '日历',
    searchTerms: [
      '日历',
      '每日笔记',
      '展开',
      '每周起始日',
      '星期一',
      '星期日',
    ],
  },
  {
    id: 'codex',
    icon: Sparkles,
    label: 'Codex',
    searchTerms: [
      'codex',
      'ai',
      'chatgpt',
      'api',
      'key',
      'base url',
      '模型',
      '自定义',
      'responses',
    ],
  },
  {
    id: 'storage',
    icon: Database,
    label: '存储',
    searchTerms: ['存储', '资源', '上传', '本地目录'],
  },
  {
    id: 'git-sync',
    icon: GitBranch,
    label: 'Git Sync',
    searchTerms: ['git', 'sync', '同步', '远程仓库'],
  },
  {
    id: 'version',
    icon: Info,
    label: '版本',
    searchTerms: ['版本', '关于', 'madora', 'logo', '更新', '下载', '安装'],
  },
];

export function WorkspaceSettingsPage({
  appUpdate,
  header,
  initialSettings,
  initialSectionId = 'appearance',
  macChromeContentTop,
  sessionCache,
  sidebarResize,
  sidebarWidth = 280,
  windowsChromeInset = false,
  workspaceRootPath,
  onBack,
  onSettingsSaved,
}: WorkspaceSettingsPageProps) {
  const { setTheme, theme } = useTheme();
  const cacheEntry = getSettingsCacheEntry(sessionCache, workspaceRootPath);
  const [activeSection, setActiveSection] =
    React.useState<SettingsSectionId>(initialSectionId);
  const [sectionSourceId, setSectionSourceId] =
    React.useState<SettingsSectionId>(initialSectionId);
  if (initialSectionId !== sectionSourceId) {
    setSectionSourceId(initialSectionId);
    setActiveSection(initialSectionId);
  }
  const [searchQuery, setSearchQuery] = React.useState('');
  const [settings, setSettings] = React.useState(
    () => withDefaultAppSettings(cacheEntry.settings ?? initialSettings),
  );
  const settingsRef = React.useRef(settings);
  const [fontOptions, setFontOptions] = React.useState(
    () => sessionCache.systemFonts ?? DEFAULT_FONTS,
  );
  const [gitSettings, setGitSettings] = React.useState(
    () => cacheEntry.gitSyncSettings ?? DEFAULT_GIT_SYNC,
  );
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(
    cacheEntry.gitProbe ?? null,
  );
  const [gitRemote, setGitRemote] = React.useState<GitRemoteInfo>(
    cacheEntry.gitRemote ?? { remoteUrl: null, webUrl: null },
  );
  const [error, setError] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [gitActionState, setGitActionState] = React.useState<GitActionState>(
    () =>
      workspaceRootPath &&
      isTauriRuntime() &&
      !(
        cacheEntry.gitSyncSettings &&
        'gitProbe' in cacheEntry &&
        cacheEntry.gitRemote
      )
        ? 'loading'
        : 'idle',
  );
  const [gitMessage, setGitMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    if (sessionCache.systemFonts) return;
    if (!isTauriRuntime()) return;

    let cancelled = false;
    void listSystemFonts()
      .then((options) => {
        if (cancelled) return;
        const merged = mergeFontOptions(options);
        sessionCache.systemFonts = merged;
        setFontOptions(merged);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [sessionCache]);

  React.useEffect(() => {
    if (!workspaceRootPath || !isTauriRuntime()) return;

    const entry = getSettingsCacheEntry(sessionCache, workspaceRootPath);
    if (entry.gitSyncSettings && 'gitProbe' in entry && entry.gitRemote) {
      return;
    }

    let cancelled = false;
    void Promise.all([
      ensureWorkspace(workspaceRootPath),
      gitProbe(workspaceRootPath).catch(() => null),
      gitRemoteInfo(workspaceRootPath).catch(() => ({
        remoteUrl: null,
        webUrl: null,
      })),
    ])
      .then(([metadata, probe, remote]) => {
        if (cancelled) return;
        const nextGitSettings = withDefaultGitSyncSettings(metadata.gitSync);
        entry.gitSyncSettings = nextGitSettings;
        entry.gitProbe = probe;
        entry.gitRemote = remote;
        setGitSettings(nextGitSettings);
        setGitProbeState(probe);
        setGitRemote(remote);
        setGitActionState('idle');
      })
      .catch((reason) => {
        if (cancelled) return;
        setGitActionState('error');
        setGitMessage(
          reason instanceof Error ? reason.message : '无法读取 Git Sync 设置',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [sessionCache, workspaceRootPath]);

  const saveSettings = React.useCallback(
    async (next: AppSettings) => {
      const entry = getSettingsCacheEntry(sessionCache, workspaceRootPath);
      entry.settings = next;
      settingsRef.current = next;
      setSettings(next);
      onSettingsSaved?.(next);
      if (!isTauriRuntime()) return;

      setSaveState('saving');
      setError(null);
      try {
        const saved = await saveAppSettings(next);
        entry.settings = saved;
        settingsRef.current = saved;
        setSettings(saved);
        onSettingsSaved?.(saved);
        setSaveState('saved');
      } catch (reason) {
        setSaveState('error');
        setError(reason instanceof Error ? reason.message : '无法保存设置');
      }
    },
    [onSettingsSaved, sessionCache, workspaceRootPath],
  );

  const updateAppearance = (
    update: (
      appearance: AppSettings['appearance'],
    ) => AppSettings['appearance'],
  ) => {
    void saveSettings({
      ...settings,
      appearance: update(settings.appearance),
    });
  };

  const previewWindowOpacity = React.useCallback((windowOpacity: number) => {
    const current = settingsRef.current;
    const next = {
      ...current,
      appearance: { ...current.appearance, windowOpacity },
    };
    settingsRef.current = next;
    setSettings(next);

    if (!isTauriRuntime()) return;
    setError(null);
    void setAppWindowOpacity(windowOpacity).catch((reason) => {
      setError(
        reason instanceof Error
          ? reason.message
          : '无法预览应用透明度',
      );
    });
  }, []);

  const commitWindowOpacity = React.useCallback(() => {
    void saveSettings(settingsRef.current);
  }, [saveSettings]);

  const updateCalendar = (
    update: (calendar: AppSettings['calendar']) => AppSettings['calendar'],
  ) => {
    void saveSettings({
      ...settings,
      calendar: update(settings.calendar),
    });
  };

  const persistGitSettings = React.useCallback(
    async (next: WorkspaceGitSyncSettings) => {
      const normalized = withDefaultGitSyncSettings(next);
      const entry = getSettingsCacheEntry(sessionCache, workspaceRootPath);
      entry.gitSyncSettings = normalized;
      setGitSettings(normalized);
      if (!workspaceRootPath || !isTauriRuntime()) return normalized;

      const saved = withDefaultGitSyncSettings(
        await saveWorkspaceGitSyncSettings(workspaceRootPath, normalized),
      );
      entry.gitSyncSettings = saved;
      setGitSettings(saved);
      return saved;
    },
    [sessionCache, workspaceRootPath],
  );

  const updateGitSettings = (
    update: (
      current: WorkspaceGitSyncSettings,
    ) => WorkspaceGitSyncSettings,
  ) => {
    const next = withDefaultGitSyncSettings(update(gitSettings));
    setGitSettings(next);
    setGitActionState('saving');
    setGitMessage(null);
    void persistGitSettings(next)
      .then(() => setGitActionState('saved'))
      .catch((reason) => {
        setGitActionState('error');
        setGitMessage(
          reason instanceof Error
            ? reason.message
            : '无法保存 Git Sync 设置',
        );
      });
  };

  const syncNow = async () => {
    if (!workspaceRootPath || !isTauriRuntime()) return;
    setGitActionState('syncing');
    setGitMessage(null);
    try {
      const saved = await persistGitSettings(gitSettings);
      const result = await gitSyncNow(
        workspaceRootPath,
        saved.conflictResolution,
      );
      await persistGitSettings({
        ...saved,
        lastSyncedAt: result.lastSyncedAt,
      });
      setGitActionState('synced');
      setGitMessage(`同步完成：${formatGitSyncTimestamp(result.lastSyncedAt)}`);
    } catch (reason) {
      setGitActionState('error');
      setGitMessage(reason instanceof Error ? reason.message : 'Git Sync 失败');
    }
  };

  const openRemoteRepository = (
    event: React.MouseEvent<HTMLAnchorElement>,
    url: string,
  ) => {
    if (!isTauriRuntime()) return;

    event.preventDefault();
    void openUrlInDefaultBrowser(url).catch((reason) => {
      setGitActionState('error');
      setGitMessage(
        reason instanceof Error ? reason.message : '无法打开远程仓库',
      );
    });
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleSections = SETTINGS_SECTIONS.filter((section) =>
    section.searchTerms.some((term) =>
      term.toLowerCase().includes(normalizedSearch),
    ),
  );
  const effectiveSection = visibleSections.some(
    (section) => section.id === activeSection,
  )
    ? activeSection
    : visibleSections[0]?.id;
  const assetDirectory = workspaceRootPath
    ? `${workspaceRootPath.replace(/[\\/]+$/, '')}/.madora/assets/files`
    : '打开工作区后使用 .madora/assets/files';

  return (
    <section
      aria-label="设置"
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-sidebar"
      data-testid="workspace-settings-page"
    >
      <aside
        className="flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
        data-testid="workspace-settings-sidebar"
        style={{ width: sidebarWidth }}
      >
        <header
          className={cn(
            'shrink-0',
            windowsChromeInset
              ? 'h-2'
              : macChromeContentTop === undefined
                ? 'h-10'
                : undefined,
          )}
          data-tauri-drag-region="deep"
          data-testid="workspace-settings-sidebar-titlebar-spacer"
          style={
            !windowsChromeInset && macChromeContentTop !== undefined
              ? { height: macChromeContentTop }
              : undefined
          }
        />
        <div className="px-2 pb-2 pr-4">
          <button
            aria-label="返回应用"
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            <span>返回应用</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4 pr-4">
          <label className="flex h-8 items-center gap-2 rounded-md border border-sidebar-border/60 bg-background/70 px-2 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <Search size={14} />
            <input
              aria-label="搜索设置"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="搜索设置"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery ? (
              <button
                aria-label="清空设置搜索"
                className="text-muted-foreground transition-colors hover:text-foreground"
                type="button"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            ) : null}
          </label>

          <nav aria-label="设置分类" className="grid gap-1">
            <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">
              常规
            </p>
            {visibleSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    effectiveSection === section.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
                  )}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {sidebarResize ? (
        <WorkspaceResizeHandle
          aria-label="调整设置侧栏宽度"
          className="-mx-2"
          direction="left"
          max={sidebarResize.max}
          min={sidebarResize.min}
          value={sidebarWidth}
          onResize={sidebarResize.onResize}
        />
      ) : null}

      <div
        className="m-2 flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background"
        data-testid="workspace-editor-column"
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
          data-chrome="codex-main-surface"
          data-testid="workspace-settings-main-surface"
        >
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="mx-auto w-full max-w-[1120px] px-8 py-10 pb-24"
              data-testid="workspace-settings-content"
            >
              {effectiveSection === 'appearance' ? (
                <AppearanceSection
                  error={error}
                  fonts={fontOptions}
                  saveState={saveState}
                  settings={settings}
                  theme={theme ?? 'system'}
                  onFontChange={(key, value) =>
                    updateAppearance((current) => ({
                      ...current,
                      fonts: { ...current.fonts, [key]: value },
                    }))
                  }
                  onPageWidthChange={(pageWidthMode) =>
                    updateAppearance((current) => ({
                      ...current,
                      pageWidthMode,
                    }))
                  }
                  onWindowOpacityCommit={commitWindowOpacity}
                  onWindowOpacityPreview={previewWindowOpacity}
                  onSystemNavCollapsedChange={(systemNavCollapsed) =>
                    updateAppearance((current) => ({
                      ...current,
                      systemNavCollapsed,
                    }))
                  }
                  onSystemNavLayoutChange={(systemNavLayout) =>
                    updateAppearance((current) => ({
                      ...current,
                      systemNavLayout,
                    }))
                  }
                  onThemeChange={setTheme}
                />
              ) : null}
              {effectiveSection === 'calendar' ? (
                <CalendarSection
                  error={error}
                  saveState={saveState}
                  settings={settings}
                  onExpandedChange={(expanded) =>
                    updateCalendar((current) => ({ ...current, expanded }))
                  }
                  onWeekStartsOnChange={(weekStartsOn) =>
                    updateCalendar((current) => ({
                      ...current,
                      weekStartsOn,
                    }))
                  }
                />
              ) : null}
              {effectiveSection === 'codex' ? (
                <CodexSection workspaceRootPath={workspaceRootPath} />
              ) : null}
              {effectiveSection === 'storage' ? (
                <StorageSection
                  assetDirectory={assetDirectory}
                  error={error}
                  settings={settings}
                />
              ) : null}
              {effectiveSection === 'git-sync' ? (
                <GitSyncSection
                  actionMessage={gitMessage}
                  actionState={gitActionState}
                  probe={gitProbeState}
                  remote={gitRemote}
                  settings={gitSettings}
                  showGitLogEntry={settings.appearance.showGitLogEntry}
                  showGitPanelEntry={settings.appearance.showGitPanelEntry}
                  onOpenRemoteRepository={openRemoteRepository}
                  onShowGitLogEntryChange={(showGitLogEntry) =>
                    updateAppearance((current) => ({
                      ...current,
                      showGitLogEntry,
                    }))
                  }
                  onShowGitPanelEntryChange={(showGitPanelEntry) =>
                    updateAppearance((current) => ({
                      ...current,
                      showGitPanelEntry,
                    }))
                  }
                  onSettingsChange={updateGitSettings}
                  onSyncNow={() => void syncNow()}
                />
              ) : null}
              {effectiveSection === 'version' ? (
                <VersionSection appUpdate={appUpdate} />
              ) : null}
              {!effectiveSection ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Search className="mb-3 text-muted-foreground" size={26} />
                  <h2 className="text-sm font-medium">未找到设置</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    没有匹配“{searchQuery}”的设置分类。
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function AppearanceSection({
  fonts,
  settings,
  theme,
  error,
  saveState,
  onFontChange,
  onPageWidthChange,
  onWindowOpacityCommit,
  onWindowOpacityPreview,
  onSystemNavCollapsedChange,
  onSystemNavLayoutChange,
  onThemeChange,
}: {
  fonts: SystemFontOptions;
  settings: AppSettings;
  theme: string;
  error: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onFontChange: (key: keyof AppearanceFontSettings, value: string) => void;
  onPageWidthChange: (value: PageWidthMode) => void;
  onWindowOpacityCommit: () => void;
  onWindowOpacityPreview: (value: number) => void;
  onSystemNavCollapsedChange: (collapsed: boolean) => void;
  onSystemNavLayoutChange: (layout: SystemNavLayout) => void;
  onThemeChange: (theme: string) => void;
}) {
  return (
    <div className="space-y-6 pb-8" data-testid="appearance-settings-shell">
      <SettingsSectionHeader
        description="调整应用主题、窗口透明度、编辑器页面宽度、系统入口和阅读字体。"
        title="外观"
      />

      <section className="rounded-xl bg-muted/30 p-5">
        <h3 className="text-sm font-medium">主题</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          跟随系统会同步当前操作系统外观。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup">
          <ThemePreviewRadioButton
            checked={theme === 'system'}
            label="跟随系统"
            testId="theme-preview-system"
            variant="system"
            onClick={() => onThemeChange('system')}
          />
          <ThemePreviewRadioButton
            checked={theme === 'light'}
            label="亮色"
            testId="theme-preview-light"
            variant="light"
            onClick={() => onThemeChange('light')}
          />
          <ThemePreviewRadioButton
            checked={theme === 'dark'}
            label="暗色"
            testId="theme-preview-dark"
            variant="dark"
            onClick={() => onThemeChange('dark')}
          />
        </div>
      </section>

      <WindowOpacitySetting
        available={isTauriRuntime()}
        value={settings.appearance.windowOpacity}
        onCommit={onWindowOpacityCommit}
        onPreview={onWindowOpacityPreview}
      />

      <section className="rounded-xl bg-muted/30 p-5">
        <h3 className="text-sm font-medium">页面宽度</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          控制文档正文宽度，不改变左右侧栏宽度。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
          <PageWidthPreviewRadioButton
            checked={settings.appearance.pageWidthMode === 'standard'}
            label="标准"
            testId="page-width-preview-standard"
            variant="standard"
            onClick={() => onPageWidthChange('standard')}
          />
          <PageWidthPreviewRadioButton
            checked={settings.appearance.pageWidthMode === 'wide'}
            label="全宽"
            testId="page-width-preview-wide"
            variant="wide"
            onClick={() => onPageWidthChange('wide')}
          />
        </div>
      </section>

      <section data-testid="system-nav-settings">
        <h3 className="text-sm font-medium">系统入口</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          控制左侧顶部入口的排列与折叠。
        </p>
        <div className="mt-4 overflow-hidden rounded-xl bg-muted/30">
          <div className="grid gap-3 border-b border-border/60 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium">排列方式</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                左侧顶部入口按纵向列表或横向图标排布。
              </p>
            </div>
            <SystemNavLayoutPicker
              value={settings.appearance.systemNavLayout}
              onChange={onSystemNavLayoutChange}
            />
          </div>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium">收起系统入口</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {settings.appearance.systemNavLayout === 'horizontal'
                  ? '横向排列始终展示七个入口，仅通过省略号切换形态。'
                  : '收起后仅在悬停命中条时显示展开控件。'}
              </p>
            </div>
            <div className="flex justify-start sm:justify-end">
              <PillSwitch
                checked={
                  settings.appearance.systemNavLayout === 'vertical' &&
                  settings.appearance.systemNavCollapsed
                }
                disabled={settings.appearance.systemNavLayout === 'horizontal'}
                label="收起系统入口"
                testId="system-nav-collapsed-switch"
                onChange={onSystemNavCollapsedChange}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium">字体</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          分别控制系统界面、文档正文和代码块字体。
        </p>
        <div
          className="mt-4 overflow-hidden rounded-xl bg-muted/30"
          data-testid="appearance-fonts-card"
        >
          <FontSettingRow
            description="侧边栏、工具栏、设置面板等编辑器以外的界面文本。"
            label="UI 字体"
            options={fonts.ui}
            sample="Madora · 本地知识库"
            value={settings.appearance.fonts.ui}
            onChange={(value) => onFontChange('ui', value)}
          />
          <FontSettingRow
            description="编辑器和阅览模式中的文章正文。"
            label="文档字体"
            options={fonts.document}
            sample="这是一段用于预览文档字体的文本。"
            value={settings.appearance.fonts.document}
            onChange={(value) => onFontChange('document', value)}
          />
          <FontSettingRow
            description="代码块、行内代码、快捷键和等宽文本。"
            label="代码块字体"
            options={fonts.code}
            sample="const note = markdown;"
            value={settings.appearance.fonts.code}
            onChange={(value) => onFontChange('code', value)}
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          默认搭配优先使用系统原生 UI 字体、中文文章字体和专业等宽代码字体。
        </p>
      </section>

      <SettingsFeedback
        defaultMessage="更改会自动保存，并作为全局外观默认值。"
        error={error}
        state={saveState}
      />
    </div>
  );
}

function WindowOpacitySetting({
  available,
  value,
  onCommit,
  onPreview,
}: {
  available: boolean;
  value: number;
  onCommit: () => void;
  onPreview: (value: number) => void;
}) {
  const progress =
    ((value - MIN_WINDOW_OPACITY) /
      (MAX_WINDOW_OPACITY - MIN_WINDOW_OPACITY)) *
    100;
  const commitValue = () => onCommit();
  const restoreDefault = () => {
    onPreview(MAX_WINDOW_OPACITY);
    onCommit();
  };

  return (
    <section data-testid="window-opacity-settings">
      <h3 className="text-sm font-medium">窗口</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        调整整个应用窗口与桌面背景之间的通透程度。
      </p>
      <div className="mt-4 rounded-xl bg-muted/30 px-5 py-4">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_300px] sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">应用透明度</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              拖动时会即时预览。为保证文字清晰和窗口可找回，最低限制为 70%。
            </p>
            {!available ? (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                应用透明度仅在桌面客户端中可用。
              </p>
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="mb-3 flex h-7 items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">更通透</span>
              <div className="flex items-center gap-2">
                {value < MAX_WINDOW_OPACITY ? (
                  <button
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3574f0]/45 disabled:pointer-events-none disabled:opacity-50"
                    disabled={!available}
                    type="button"
                    onClick={restoreDefault}
                  >
                    恢复默认
                  </button>
                ) : null}
                <output
                  className="min-w-12 rounded-md bg-background px-2 py-1 text-center text-xs font-medium tabular-nums shadow-sm ring-1 ring-border/70"
                  htmlFor="app-window-opacity"
                >
                  {value}%
                </output>
              </div>
            </div>
            <input
              aria-label="应用透明度"
              className="h-5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-[#3574f0] [&::-moz-range-thumb]:shadow-sm [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-[#3574f0] [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent"
              disabled={!available}
              id="app-window-opacity"
              max={MAX_WINDOW_OPACITY}
              min={MIN_WINDOW_OPACITY}
              step={1}
              style={{
                background: `linear-gradient(to right, #3574f0 0%, #3574f0 ${progress}%, var(--border) ${progress}%, var(--border) 100%) center / 100% 6px no-repeat`,
                borderRadius: 9999,
              }}
              type="range"
              value={value}
              onBlur={commitValue}
              onChange={(event) => onPreview(Number(event.currentTarget.value))}
              onKeyUp={commitValue}
              onPointerCancel={commitValue}
              onPointerUp={commitValue}
            />
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>70%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CodexSection({
  workspaceRootPath,
}: {
  workspaceRootPath: string | null;
}) {
  const desktop = isTauriRuntime();
  const [status, setStatus] = React.useState<CodexConnectionStatus | null>(null);
  const [provider, setProvider] = React.useState<CodexCustomProviderInfo | null>(
    null,
  );
  const [editorMode, setEditorMode] = React.useState<'chatgpt' | 'custom'>(
    'chatgpt',
  );
  const [baseUrl, setBaseUrl] = React.useState('');
  const [model, setModel] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [switchingMode, setSwitchingMode] = React.useState<
    'chatgpt' | 'custom' | null
  >(null);
  const [signingIn, setSigningIn] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refreshGenerationRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!desktop) return;
    const generation = ++refreshGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      // Disk + session snapshot only. Never start App Server or account/read here:
      // that RPC hangs if the AI panel event listener is not attached.
      const [nextStatus, nextProvider] = await Promise.all([
        getCodexConnectionStatus(),
        getCodexCustomProvider(),
      ]);
      if (generation !== refreshGenerationRef.current) return;

      React.startTransition(() => {
        setStatus(nextStatus);
        setProvider(nextProvider);
        setEditorMode(nextStatus.authMode === 'custom' ? 'custom' : 'chatgpt');
        setBaseUrl(nextProvider.baseUrl ?? '');
        setModel(nextProvider.model ?? '');
        setApiKey('');
      });
    } catch (reason) {
      if (generation !== refreshGenerationRef.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (generation === refreshGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [desktop]);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void refresh();
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  const restartRuntime = React.useCallback(async () => {
    if (!workspaceRootPath) return;
    await stopCodexRuntime().catch(() => undefined);
    await startCodexRuntime(workspaceRootPath);
  }, [workspaceRootPath]);

  const saveCustomProvider = async () => {
    if (!desktop) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await setCodexCustomProvider({
        baseUrl,
        model,
        apiKey: apiKey.trim() ? apiKey : undefined,
      });
      setApiKey('');
      await restartRuntime();
      await refresh();
      setMessage('已启用自定义 API');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const clearCustomProvider = async () => {
    if (!desktop) return;
    setClearing(true);
    setMessage(null);
    setError(null);
    try {
      await clearCodexCustomProvider();
      setBaseUrl('');
      setModel('');
      setApiKey('');
      await restartRuntime();
      await refresh();
      setMessage('已清除自定义配置');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setClearing(false);
    }
  };

  const switchMode = async (mode: 'chatgpt' | 'custom') => {
    if (!desktop) return;
    setSwitchingMode(mode);
    setMessage(null);
    setError(null);
    try {
      await setCodexAuthMode(mode);
      await restartRuntime();
      await refresh();
      setMessage(mode === 'custom' ? '已切换到自定义 API' : '已切换到 ChatGPT');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSwitchingMode(null);
    }
  };

  const signInChatGpt = async () => {
    if (!desktop || !workspaceRootPath) return;
    setSigningIn(true);
    setMessage(null);
    setError(null);
    try {
      // Login intentionally starts runtime; status refresh does not.
      if (!status?.running) {
        await startCodexRuntime(workspaceRootPath);
      }
      const response = await codexAppServerClient.request<{
        authUrl?: string | null;
        verificationUrl?: string | null;
      }>('account/login/start', {
        type: 'chatgpt',
        codexStreamlinedLogin: true,
        useHostedLoginSuccessPage: true,
      });
      const authUrl = response.authUrl ?? response.verificationUrl;
      if (authUrl) {
        await openUrlInDefaultBrowser(authUrl);
      }
      setMessage('已打开登录页，完成后点刷新');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSigningIn(false);
    }
  };

  const activeMode: 'chatgpt' | 'custom' =
    status?.authMode === 'custom' ? 'custom' : 'chatgpt';
  const runtimeTone = !desktop
    ? 'muted'
    : status == null
      ? 'muted'
      : !status.runtime.available
        ? 'danger'
        : status.running
          ? 'success'
          : 'ready';
  const runtimeLabel = !desktop
    ? '仅桌面可用'
    : status == null
      ? '读取中'
      : !status.runtime.available
        ? '不可用'
        : status.running
          ? '运行中'
          : '就绪';
  const chatgptSignedIn =
    status?.signedIn === true && status.accountType !== 'apiKey';
  const accountLabel = chatgptSignedIn
    ? status?.accountEmail || '已登录'
    : status?.accountType === 'apiKey' && status.signedIn
      ? 'API Key 账户'
      : '未登录';
  const customHost = status?.baseUrl
    ? status.baseUrl.replace(/^https?:\/\//, '')
    : null;

  return (
    <div className="space-y-5 pb-8" data-testid="codex-settings-shell">
      <SettingsSectionHeader description="运行时与认证" title="Codex" />

      {!desktop ? (
        <p className="text-sm text-muted-foreground">仅桌面端可配置 Codex。</p>
      ) : null}

      <section
        className="rounded-xl border border-border/70 bg-muted/20 p-4"
        data-testid="codex-status"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  runtimeTone === 'success' &&
                    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                  runtimeTone === 'ready' &&
                    'bg-sky-500/10 text-sky-700 dark:text-sky-400',
                  runtimeTone === 'danger' &&
                    'bg-destructive/10 text-destructive',
                  runtimeTone === 'muted' &&
                    'bg-muted text-muted-foreground',
                )}
                data-testid="codex-runtime-badge"
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    runtimeTone === 'success' && 'bg-emerald-500',
                    runtimeTone === 'ready' && 'bg-sky-500',
                    runtimeTone === 'danger' && 'bg-destructive',
                    runtimeTone === 'muted' && 'bg-muted-foreground',
                  )}
                />
                {runtimeLabel}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                  activeMode === 'custom'
                    ? 'bg-foreground text-background'
                    : 'bg-background text-foreground ring-1 ring-border',
                )}
                data-testid="codex-auth-mode-badge"
              >
                {activeMode === 'custom' ? '自定义 API' : 'ChatGPT'}
              </span>
            </div>

            <div className="space-y-1 text-sm">
              {activeMode === 'chatgpt' ? (
                <p data-testid="codex-account-summary">
                  <span className="text-muted-foreground">账户 </span>
                  <span className="font-medium">{accountLabel}</span>
                </p>
              ) : (
                <p data-testid="codex-custom-summary">
                  <span className="text-muted-foreground">端点 </span>
                  <span className="break-all font-medium">
                    {customHost || '未配置'}
                  </span>
                  {provider?.hasApiKey ? (
                    <span className="text-muted-foreground"> · 密钥已保存</span>
                  ) : null}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">模型 </span>
                <span className="font-medium">
                  {status?.model || '未设置'}
                </span>
              </p>
            </div>
          </div>

          <Button
            disabled={!desktop || loading}
            size="icon"
            type="button"
            variant="ghost"
            aria-label="刷新"
            onClick={() => void refresh()}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        </div>

        {status?.error || status?.runtime.message ? (
          <p className="mt-3 text-xs text-destructive">
            {status.error || status.runtime.message}
          </p>
        ) : null}
      </section>

      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1"
        data-testid="codex-mode-tabs"
        role="tablist"
        aria-label="认证方式"
      >
        {(
          [
            { id: 'chatgpt', label: 'ChatGPT' },
            { id: 'custom', label: '自定义 API' },
          ] as const
        ).map((tab) => {
          const selected = editorMode === tab.id;
          const active = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              aria-selected={selected}
              className={cn(
                'relative rounded-md px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`codex-mode-tab-${tab.id}`}
              role="tab"
              type="button"
              onClick={() => setEditorMode(tab.id)}
            >
              {tab.label}
              {active ? (
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </button>
          );
        })}
      </div>

      {editorMode === 'chatgpt' ? (
        <section className="rounded-xl bg-muted/30 p-4" data-testid="codex-chatgpt-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">ChatGPT 账户</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {chatgptSignedIn
                  ? status?.accountEmail || '本机已登录'
                  : '登录后无需填写 API Key'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!chatgptSignedIn ? (
                <Button
                  disabled={!desktop || signingIn || !workspaceRootPath}
                  size="sm"
                  type="button"
                  onClick={() => void signInChatGpt()}
                >
                  {signingIn ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : null}
                  登录
                </Button>
              ) : null}
              {activeMode !== 'chatgpt' ? (
                <Button
                  disabled={!desktop || switchingMode !== null}
                  size="sm"
                  type="button"
                  variant={chatgptSignedIn ? 'default' : 'outline'}
                  onClick={() => void switchMode('chatgpt')}
                >
                  {switchingMode === 'chatgpt' ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : null}
                  启用此方式
                </Button>
              ) : (
                <span className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground">
                  当前使用中
                </span>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section
          className="space-y-4 rounded-xl bg-muted/30 p-4"
          data-testid="codex-custom-provider-form"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">自定义 API</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                需 OpenAI Responses 兼容；纯 Chat Completions 不可用
              </p>
            </div>
            {activeMode === 'custom' ? (
              <span className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground">
                当前使用中
              </span>
            ) : null}
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Base URL</span>
              <Input
                disabled={!desktop || saving}
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Model</span>
              <Input
                disabled={!desktop || saving}
                placeholder="gpt-5"
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">
                API Key{provider?.hasApiKey ? ' · 已保存' : ''}
              </span>
              <Input
                autoComplete="off"
                disabled={!desktop || saving}
                placeholder={provider?.hasApiKey ? '••••••••' : 'sk-...'}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.currentTarget.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!desktop || saving || !baseUrl.trim() || !model.trim()}
              size="sm"
              type="button"
              onClick={() => void saveCustomProvider()}
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : null}
              保存并启用
            </Button>
            {activeMode !== 'custom' && provider?.hasApiKey && provider.baseUrl ? (
              <Button
                disabled={!desktop || switchingMode !== null}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void switchMode('custom')}
              >
                {switchingMode === 'custom' ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : null}
                启用此方式
              </Button>
            ) : null}
            <Button
              disabled={!desktop || clearing || !provider?.baseUrl}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void clearCustomProvider()}
            >
              {clearing ? <Loader2 className="animate-spin" size={14} /> : null}
              清除
            </Button>
          </div>
        </section>
      )}

      {message ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function CalendarSection({
  error,
  saveState,
  settings,
  onExpandedChange,
  onWeekStartsOnChange,
}: {
  error: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  settings: AppSettings;
  onExpandedChange: (expanded: boolean) => void;
  onWeekStartsOnChange: (weekStartsOn: CalendarWeekStartsOn) => void;
}) {
  return (
    <div className="space-y-6 pb-8" data-testid="calendar-settings-shell">
      <SettingsSectionHeader
        description="调整左侧栏每日笔记日历的展示方式。"
        title="日历"
      />

      <section
        className="overflow-hidden rounded-xl bg-muted/30"
        data-testid="calendar-settings-card"
      >
        <div className="grid gap-3 border-b border-border/60 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">展开日历</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              在左侧栏展开每日笔记日历；关闭后保留紧凑入口。
            </p>
          </div>
          <div className="flex justify-start sm:justify-end">
            <PillSwitch
              checked={settings.calendar.expanded}
              label="展开日历"
              testId="calendar-expanded-switch"
              onChange={onExpandedChange}
            />
          </div>
        </div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">每周起始日</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              选择侧栏日历每一周从星期一或星期日开始。
            </p>
          </div>
          <Select
            value={settings.calendar.weekStartsOn}
            onValueChange={(value) => {
              if (value === 'monday' || value === 'sunday') {
                onWeekStartsOnChange(value);
              }
            }}
          >
            <SelectTrigger
              aria-label="每周起始日"
              className="h-9 w-full bg-background/70"
              data-testid="calendar-week-start-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" position="popper">
              <SelectItem
                data-testid="calendar-week-start-monday"
                value="monday"
              >
                星期一
              </SelectItem>
              <SelectItem
                data-testid="calendar-week-start-sunday"
                value="sunday"
              >
                星期日
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <SettingsFeedback
        defaultMessage="更改会自动保存，并作为全局日历设置。"
        error={error}
        state={saveState}
      />
    </div>
  );
}

function StorageSection({
  assetDirectory,
  settings,
  error,
}: {
  assetDirectory: string;
  settings: AppSettings;
  error: string | null;
}) {
  return (
    <div className="space-y-6 pb-8" data-testid="storage-settings-shell">
      <SettingsSectionHeader
        description="选择上传资源的默认存储方式。本期仅启用工作区本地存储。"
        title="存储"
      />

      <section
        className="rounded-xl bg-muted/30"
        data-testid="storage-provider-card"
      >
        <SettingRow
          control={
            <Select value={settings.storage.defaultProvider}>
              <SelectTrigger
                aria-label="全局存储方式"
                className="h-10 w-full min-w-[220px] rounded-lg border-border/80 bg-background/80 sm:w-[320px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">
                  <span className="flex items-center gap-2">
                    <FolderArchive size={15} />
                    本地存储
                  </span>
                </SelectItem>
                <SelectItem disabled value="oss">
                  <span className="flex items-center gap-2">
                    <Cloud size={15} />
                    OSS 存储
                  </span>
                </SelectItem>
                <SelectItem disabled value="api">
                  <span className="flex items-center gap-2">
                    <Server size={15} />
                    自定义 API
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          }
          description="设置上传资源的默认存储位置。当前版本仅启用工作区本地存储。"
          label="全局存储方式"
        />
      </section>

      <section>
        <h3 className="text-sm font-medium">本地存储配置</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          上传文件跟随当前工作区保存，文档中仅写入稳定的资源引用。
        </p>
        <div
          className="mt-4 overflow-hidden rounded-xl bg-muted/30"
          data-testid="storage-local-card"
        >
          <ReadonlyField label="本地资源目录" value={assetDirectory} />
        </div>
      </section>

      <SettingsFeedback
        defaultMessage="更改会自动保存，并作为全局上传默认值。"
        error={error}
        state="idle"
      />
    </div>
  );
}

function VersionSection({
  appUpdate,
}: {
  appUpdate: AppUpdateController;
}) {
  const busy =
    appUpdate.phase === 'checking' ||
    appUpdate.phase === 'downloading' ||
    appUpdate.phase === 'installing';
  const progress =
    appUpdate.totalBytes && appUpdate.totalBytes > 0
      ? Math.min(
          100,
          Math.round(
            (appUpdate.downloadedBytes / appUpdate.totalBytes) * 100,
          ),
        )
      : null;

  return (
    <div className="space-y-6 pb-8" data-testid="version-settings-shell">
      <SettingsSectionHeader
        description="检查、下载并安装经过签名验证的 Madora 桌面更新。"
        title="版本"
      />

      <section
        className="overflow-hidden rounded-xl bg-muted/30"
        data-testid="madora-version-card"
      >
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <div
            aria-label="Madora Logo"
            className="flex size-20 items-center justify-center rounded-2xl border border-border/60 bg-background/80 shadow-sm"
            role="img"
          >
            <Image
              alt=""
              className="size-12 opacity-90 dark:hidden"
              height={48}
              src="/brand/madora-logo-dark.svg"
              width={48}
            />
            <Image
              alt=""
              className="hidden size-12 opacity-90 dark:block"
              height={48}
              src="/brand/madora-logo-light.svg"
              width={48}
            />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Madora</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            以 Markdown 为核心的本地知识库桌面应用。
          </p>
        </div>

        <div className="grid gap-3 border-t border-border/60 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
          <span className="text-muted-foreground">当前版本</span>
          <code
            aria-live="polite"
            className="font-mono text-sm text-foreground sm:text-right"
            data-testid="madora-version"
          >
            {appUpdate.currentVersion ?? '版本信息不可用'}
          </code>
        </div>

        {appUpdate.update ? (
          <>
            <VersionMetadataRow
              label="最新版本"
              value={appUpdate.update.version}
            />
            <VersionMetadataRow
              label="发布日期"
              value={formatUpdateDate(appUpdate.update.date)}
            />
          </>
        ) : null}
      </section>

      <section className="rounded-xl bg-muted/30 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">应用更新</h3>
            <p
              aria-live="polite"
              className="mt-1 text-xs leading-5 text-muted-foreground"
            >
              {getAppUpdateStatus(appUpdate)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {appUpdate.phase !== 'ready-to-restart' ? (
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => void appUpdate.check()}
              >
                {appUpdate.phase === 'checking' ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                {appUpdate.phase === 'checking' ? '正在检查' : '检查更新'}
              </Button>
            ) : null}
            {appUpdate.update && appUpdate.phase !== 'ready-to-restart' ? (
              <Button
                disabled={busy}
                type="button"
                onClick={() => void appUpdate.install()}
              >
                {appUpdate.phase === 'downloading' ||
                appUpdate.phase === 'installing' ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : null}
                下载并安装
              </Button>
            ) : null}
            {appUpdate.phase === 'ready-to-restart' ? (
              <Button type="button" onClick={() => void appUpdate.restart()}>
                重启并完成更新
              </Button>
            ) : null}
          </div>
        </div>

        {appUpdate.phase === 'downloading' ? (
          <div className="mt-4" data-testid="app-update-progress">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{formatBytes(appUpdate.downloadedBytes)}</span>
              <span>
                {progress === null
                  ? '正在下载'
                  : `${progress}% · ${formatBytes(appUpdate.totalBytes ?? 0)}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
              <div
                className={cn(
                  'h-full rounded-full bg-[#3574f0] transition-[width]',
                  progress === null && 'w-1/3 animate-pulse',
                )}
                style={progress === null ? undefined : { width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {appUpdate.error ? (
          <p
            className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
            role="alert"
          >
            {appUpdate.error}
          </p>
        ) : null}
      </section>

      {appUpdate.update?.body ? (
        <section className="rounded-xl bg-muted/30 p-5">
          <h3 className="text-sm font-medium">更新说明</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {appUpdate.update.body}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function VersionMetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-3 border-t border-border/60 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
      <span className="text-muted-foreground">{label}</span>
      <code className="font-mono text-sm text-foreground sm:text-right">
        {value}
      </code>
    </div>
  );
}

function getAppUpdateStatus(appUpdate: AppUpdateController) {
  switch (appUpdate.phase) {
    case 'checking':
      return '正在连接 GitHub Releases 检查新版本…';
    case 'up-to-date':
      return '当前已是最新版本。';
    case 'available':
      return appUpdate.update
        ? `发现新版本 ${appUpdate.update.version}，安装前会先保存当前工作。`
        : '发现可用更新。';
    case 'downloading':
      return '正在下载并校验更新包，请保持应用运行。';
    case 'installing':
      return '更新包校验通过，正在安装。';
    case 'ready-to-restart':
      return '更新已安装，重启 Madora 后生效。';
    case 'error':
      return '检查更新失败，可稍后手动重试。';
    default:
      return 'Madora 会在启动后自动检查，也可立即手动检查。';
  }
}

function formatUpdateDate(value: number | null) {
  if (!value) return '未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function GitSyncSection({
  actionMessage,
  actionState,
  probe,
  remote,
  settings,
  showGitLogEntry,
  showGitPanelEntry,
  onOpenRemoteRepository,
  onShowGitLogEntryChange,
  onShowGitPanelEntryChange,
  onSettingsChange,
  onSyncNow,
}: {
  actionMessage: string | null;
  actionState: GitActionState;
  probe: GitProbe | null;
  remote: GitRemoteInfo;
  settings: WorkspaceGitSyncSettings;
  showGitLogEntry: boolean;
  showGitPanelEntry: boolean;
  onOpenRemoteRepository: (
    event: React.MouseEvent<HTMLAnchorElement>,
    url: string,
  ) => void;
  onShowGitLogEntryChange: (show: boolean) => void;
  onShowGitPanelEntryChange: (show: boolean) => void;
  onSettingsChange: (
    update: (
      current: WorkspaceGitSyncSettings,
    ) => WorkspaceGitSyncSettings,
  ) => void;
  onSyncNow: () => void;
}) {
  const available = probe?.gitAvailable ?? true;
  const isRepository = probe?.isRepository ?? false;
  const isBusy = actionState === 'loading' || actionState === 'syncing';
  const canSync =
    available &&
    isRepository &&
    Boolean(remote.remoteUrl) &&
    settings.enabled &&
    !isBusy;

  return (
    <div className="space-y-6 pb-8" data-testid="git-sync-settings-shell">
      <SettingsSectionHeader
        description="通过 Git 远程仓库同步当前工作区。"
        title="Git Sync"
      />

      {!available ? (
        <div className="rounded-xl bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          未检测到本机 Git 命令。安装 Git 后会默认启用 Git Sync。
        </div>
      ) : null}

      <section
        className="rounded-xl bg-muted/30"
        data-testid="git-sync-enable-card"
      >
        <SettingRow
          control={
            <PillSwitch
              checked={settings.enabled && available}
              disabled={!available}
              label="启用 Git 同步"
              onChange={(enabled) =>
                onSettingsChange((current) => ({ ...current, enabled }))
              }
            />
          }
          description="允许 Madora 提交、拉取和推送当前工作区。"
          label="启用 Git 同步"
        />
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground">仓库</h3>
        <div
          className="mt-2 overflow-hidden rounded-xl bg-muted/30"
          data-testid="git-sync-repository-card"
        >
          <div className="grid gap-3 border-b border-border/60 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
            <span className="text-muted-foreground">远程仓库地址</span>
            <div className="flex min-w-0 items-center gap-3 sm:justify-end">
              <code
                className="min-w-0 break-all font-mono text-sm leading-6 text-foreground sm:text-right"
                data-testid="git-sync-remote-url"
              >
                {remote.remoteUrl ?? '未检测到 origin remote'}
              </code>
              {remote.webUrl ? (
                <a
                  aria-label="打开远程仓库"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={remote.webUrl}
                  rel="noreferrer"
                  target="_blank"
                  onClick={(event) => {
                    if (remote.webUrl) {
                      onOpenRemoteRepository(event, remote.webUrl);
                    }
                  }}
                >
                  <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
            <span className="text-muted-foreground">上次同步时间</span>
            <span
              className="min-w-0 leading-6 text-foreground sm:text-right"
              data-testid="git-sync-last-synced"
            >
              {settings.lastSyncedAt
                ? formatGitSyncTimestamp(settings.lastSyncedAt)
                : '尚未同步'}
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground">界面入口</h3>
        <div
          className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/30"
          data-testid="git-entry-preferences-card"
        >
          <SettingRow
            control={
              <PillSwitch
                checked={showGitPanelEntry}
                label="显示 Git 面板入口"
                testId="git-panel-entry-switch"
                onChange={onShowGitPanelEntryChange}
              />
            }
            description="在工作区右上角显示 Git 面板入口。"
            label="显示 Git 面板入口"
          />
          <SettingRow
            control={
              <PillSwitch
                checked={showGitLogEntry}
                label="显示 Git 日志入口"
                testId="git-log-entry-switch"
                onChange={onShowGitLogEntryChange}
              />
            }
            description="在工作区右上角显示 Git 日志入口。"
            label="显示 Git 日志入口"
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          仅控制入口显示，不影响 Git Sync、自动同步或仓库数据。
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground">同步偏好</h3>
        <div
          className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/30"
          data-testid="git-sync-preferences-card"
        >
          <SettingRow
            control={
              <Select
                value={String(settings.intervalMinutes)}
                onValueChange={(value) =>
                  onSettingsChange((current) => ({
                    ...current,
                    intervalMinutes: Number(value),
                  }))
                }
              >
                <SelectTrigger
                  aria-label="同步频率"
                  className="h-10 w-full min-w-[180px] rounded-lg border-border/80 bg-background/80 sm:w-[180px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper" side="bottom">
                  {[1, 2, 3, 5, 10, 15, 30, 60].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} 分钟
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            description="自动同步当前工作区的时间间隔。"
            label="同步频率"
          />
          <SettingRow
            control={
              <Select
                value={settings.conflictResolution}
                onValueChange={(value) =>
                  onSettingsChange((current) => ({
                    ...current,
                    conflictResolution: value as GitSyncConflictResolution,
                  }))
                }
              >
                <SelectTrigger
                  aria-label="差异处理策略"
                  className="h-10 w-full min-w-[180px] rounded-lg border-border/80 bg-background/80 sm:w-[180px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" position="popper" side="bottom">
                  <SelectItem value="abort">放弃</SelectItem>
                  <SelectItem value="local">本地仓库</SelectItem>
                  <SelectItem value="remote">远程仓库</SelectItem>
                </SelectContent>
              </Select>
            }
            description="同步出现差异时选择保留哪一侧。"
            label="差异处理策略"
          />
          <SettingRow
            control={
              <Button
                className="h-9 rounded-lg"
                disabled={!canSync}
                size="sm"
                type="button"
                variant="outline"
                onClick={onSyncNow}
              >
                {actionState === 'syncing' ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                {actionState === 'syncing' ? '同步中' : '立即同步'}
              </Button>
            }
            description="立即提交、拉取并推送当前工作区变更。"
            label="立即同步"
          />
        </div>
        {!isRepository && available && actionState !== 'loading' ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            当前工作区还不是 Git 仓库，请先在 Git 面板初始化仓库。
          </p>
        ) : null}
        {isRepository && !remote.remoteUrl ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            当前仓库未配置 origin remote，配置后才能同步到远程。
          </p>
        ) : null}
      </section>

      <GitSyncFeedback message={actionMessage} state={actionState} />
    </div>
  );
}

function SettingsSectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <header>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function ThemePreviewRadioButton({
  checked,
  label,
  testId,
  variant,
  onClick,
}: {
  checked: boolean;
  label: string;
  testId: string;
  variant: 'dark' | 'light' | 'system';
  onClick: () => void;
}) {
  const Icon = variant === 'system' ? Monitor : variant === 'light' ? Sun : Moon;
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'group grid min-h-[156px] gap-2 rounded-lg border bg-background/80 p-2 text-left transition-[border-color,background-color,box-shadow] hover:border-[#3574f0]/60 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3574f0]/45',
        checked ? 'border-[#3574f0] shadow-sm' : 'border-border',
      )}
      data-testid={testId}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <div className="relative h-24 overflow-hidden rounded-md border border-border/70 bg-muted/30 transition-colors group-hover:border-[#3574f0]/35">
        <ThemeArticlePreview variant={variant} />
        {checked ? <SelectedBadge /> : null}
      </div>
      <span
        className={cn(
          'flex min-w-0 items-center justify-center gap-1.5 text-sm font-medium',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon size={15} strokeWidth={1.8} />
        {label}
      </span>
    </button>
  );
}

function ThemeArticlePreview({
  variant,
}: {
  variant: 'dark' | 'light' | 'system';
}) {
  if (variant === 'system') {
    return (
      <div className="grid h-full grid-cols-2">
        <ArticleMiniature mode="light" />
        <ArticleMiniature mode="dark" />
      </div>
    );
  }
  return <ArticleMiniature mode={variant} />;
}

function ArticleMiniature({ mode }: { mode: 'dark' | 'light' }) {
  const dark = mode === 'dark';
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden px-3 py-2',
        dark ? 'bg-[#181b20]' : 'bg-[#f8fafc]',
      )}
    >
      <div
        className={cn(
          'mx-auto h-full max-w-[112px] rounded-md border px-3 py-2 shadow-sm',
          dark ? 'border-white/10 bg-[#242932]' : 'border-slate-200 bg-white',
        )}
      >
        <div
          className={cn(
            'mb-1 h-1.5 w-10 rounded-full',
            dark ? 'bg-slate-500' : 'bg-slate-300',
          )}
        />
        <div
          className={cn(
            'mb-2 h-2 w-16 rounded-full',
            dark ? 'bg-slate-300' : 'bg-slate-700',
          )}
        />
        <div className="space-y-1">
          <PreviewLine mode={mode} width="w-full" />
          <PreviewLine mode={mode} width="w-4/5" />
          <PreviewLine mode={mode} width="w-11/12" />
        </div>
      </div>
    </div>
  );
}

function PageWidthPreviewRadioButton({
  checked,
  label,
  testId,
  variant,
  onClick,
}: {
  checked: boolean;
  label: string;
  testId: string;
  variant: PageWidthMode;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'group grid min-h-32 gap-2 rounded-lg border bg-background/80 p-2 text-left transition-[border-color,background-color,box-shadow] hover:border-[#3574f0]/60 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3574f0]/45',
        checked ? 'border-[#3574f0] shadow-sm' : 'border-border',
      )}
      data-testid={testId}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <div className="relative h-20 overflow-hidden rounded-md border border-border/70 bg-muted/20 px-3 py-2 transition-colors group-hover:border-[#3574f0]/35">
        <div
          className={cn(
            'mx-auto h-full rounded-md border bg-background px-3 py-2 shadow-sm',
            variant === 'standard' ? 'max-w-[104px]' : 'max-w-[172px]',
          )}
        >
          <div className="mb-2 h-2 w-14 rounded-full bg-foreground/50" />
          <div className="space-y-1">
            <PreviewLine mode="light" width="w-full" />
            <PreviewLine mode="light" width="w-11/12" />
            <PreviewLine mode="light" width="w-4/5" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <span className="h-2 rounded bg-[#3574f0]/20" />
            <span className="h-2 rounded bg-[#3574f0]/15" />
            <span className="h-2 rounded bg-[#3574f0]/10" />
          </div>
        </div>
        {checked ? <SelectedBadge /> : null}
      </div>
      <span
        className={cn(
          'text-center text-sm font-medium',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </button>
  );
}

function SelectedBadge() {
  return (
    <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#3574f0] text-white shadow-sm">
      <CheckCircle2 size={13} strokeWidth={2.2} />
    </span>
  );
}

function PreviewLine({
  mode,
  width,
}: {
  mode: 'dark' | 'light';
  width: string;
}) {
  return (
    <span
      className={cn(
        'block h-1 rounded-full',
        width,
        mode === 'dark' ? 'bg-slate-500/80' : 'bg-slate-200',
      )}
    />
  );
}

const SYSTEM_NAV_LAYOUT_OPTIONS: Array<{
  value: SystemNavLayout;
  label: string;
}> = [
  { value: 'vertical', label: '纵向' },
  { value: 'horizontal', label: '横向' },
];

function SystemNavLayoutPicker({
  value,
  onChange,
}: {
  value: SystemNavLayout;
  onChange: (layout: SystemNavLayout) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel =
    SYSTEM_NAV_LAYOUT_OPTIONS.find((option) => option.value === value)?.label ??
    '纵向';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          aria-label="系统入口排列方式"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/70 px-2.5 text-sm outline-none transition-[background-color,border-color,box-shadow] hover:border-ring/45 hover:bg-accent/60 hover:text-accent-foreground hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow-sm"
          data-testid="system-nav-layout-select"
          role="combobox"
          type="button"
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[240px] gap-0 overflow-hidden p-1">
        {SYSTEM_NAV_LAYOUT_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cn(
              'flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              option.value === value && 'bg-accent/70 font-medium',
            )}
            data-testid={`system-nav-layout-${option.value}`}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function FontSettingRow({
  description,
  label,
  options,
  sample,
  value,
  onChange,
}: {
  description: string;
  label: string;
  options: string[];
  sample: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalizedOptions = ensureFontOption(options, value);
  return (
    <div className="grid gap-3 border-b border-border/60 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
        <p
          className="mt-2 truncate text-sm text-foreground/85"
          style={{ fontFamily: buildPreviewFontStack(value) }}
        >
          {sample}
        </p>
      </div>
      <FontFamilyPicker
        label={label}
        options={normalizedOptions}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

const FONT_PICKER_RESULT_LIMIT = 48;

function FontFamilyPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const matchingOptions = React.useMemo(
    () => filterFontOptions(options, query),
    [options, query],
  );
  const visibleOptions = matchingOptions.slice(0, FONT_PICKER_RESULT_LIMIT);
  const hiddenResultCount = matchingOptions.length - visibleOptions.length;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={label}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/70 px-2.5 text-sm outline-none transition-[background-color,border-color,box-shadow] hover:border-ring/45 hover:bg-accent/60 hover:text-accent-foreground hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow-sm"
          role="combobox"
          type="button"
        >
          <span
            className="min-w-0 truncate"
            style={{ fontFamily: buildPreviewFontStack(value) }}
          >
            {value}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[22rem] gap-0 overflow-hidden p-0"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            aria-label={`搜索${label}`}
            placeholder="搜索字体"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList id={listboxId} className="max-h-[19rem] px-1 pt-1">
            <CommandEmpty>未找到匹配的字体</CommandEmpty>
            {visibleOptions.map((fontFamily) => (
              <CommandItem
                key={fontFamily}
                data-checked={fontFamily === value}
                value={fontFamily}
                onSelect={() => {
                  onChange(fontFamily);
                  setOpen(false);
                }}
              >
                <span
                  className="min-w-0 truncate"
                  style={{ fontFamily: buildPreviewFontStack(fontFamily) }}
                >
                  {fontFamily}
                </span>
              </CommandItem>
            ))}
          </CommandList>
          {hiddenResultCount > 0 ? (
            <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
              还有 {hiddenResultCount} 项，请继续输入以缩小范围
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SettingRow({
  control,
  description,
  label,
}: {
  control: React.ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,auto)] sm:items-center">
      <div className="min-w-0">
        <p className="text-base font-medium tracking-tight">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex justify-start sm:justify-end">{control}</div>
    </div>
  );
}

function PillSwitch({
  checked,
  disabled,
  label,
  testId,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  testId?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted',
      )}
      data-testid={testId}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="h-9 min-w-0 rounded-lg border-border/60 bg-background/70 font-mono text-xs"
        readOnly
        value={value}
      />
    </label>
  );
}

function SettingsFeedback({
  defaultMessage,
  error,
  state,
}: {
  defaultMessage: string;
  error: string | null;
  state: 'idle' | 'saving' | 'saved' | 'error';
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
        error
          ? 'border border-destructive/40 text-destructive'
          : 'text-muted-foreground',
      )}
    >
      {error ??
        (state === 'saving'
          ? '正在保存设置...'
          : state === 'saved'
            ? '设置已保存。'
            : defaultMessage)}
    </div>
  );
}

function GitSyncFeedback({
  message,
  state,
}: {
  message: string | null;
  state: GitActionState;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
        state === 'error'
          ? 'border border-destructive/40 text-destructive'
          : 'text-muted-foreground',
      )}
    >
      {message ??
        (state === 'loading'
          ? '正在读取 Git Sync 设置...'
          : state === 'saving'
            ? '正在保存 Git Sync 设置...'
            : state === 'syncing'
              ? '正在同步工作区...'
              : state === 'saved'
                ? 'Git Sync 设置已保存。'
                : 'Git Sync 配置保存在当前工作区。')}
    </div>
  );
}

function getSettingsCacheEntry(
  sessionCache: WorkspaceSettingsSessionCache,
  workspaceRootPath: string | null,
): WorkspaceSettingsCacheEntry {
  const key = workspaceRootPath ?? '__global__';
  const existing = sessionCache.entries.get(key);
  if (existing) return existing;

  const created: WorkspaceSettingsCacheEntry = {};
  sessionCache.entries.set(key, created);
  return created;
}

function withDefaultGitSyncSettings(
  settings?: Partial<WorkspaceGitSyncSettings> | null,
): WorkspaceGitSyncSettings {
  const intervalMinutes = settings?.intervalMinutes ?? DEFAULT_GIT_SYNC.intervalMinutes;
  const conflictResolution = settings?.conflictResolution ?? DEFAULT_GIT_SYNC.conflictResolution;
  return {
    conflictResolution: ['abort', 'local', 'remote'].includes(conflictResolution)
      ? (conflictResolution as GitSyncConflictResolution)
      : DEFAULT_GIT_SYNC.conflictResolution,
    enabled: settings?.enabled ?? DEFAULT_GIT_SYNC.enabled,
    intervalMinutes: [1, 2, 3, 5, 10, 15, 30, 60].includes(intervalMinutes)
      ? intervalMinutes
      : DEFAULT_GIT_SYNC.intervalMinutes,
    lastSyncedAt: settings?.lastSyncedAt ?? null,
  };
}

function formatGitSyncTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function mergeFontOptions(options: SystemFontOptions): SystemFontOptions {
  return {
    code: Array.from(new Set([...options.code, ...DEFAULT_FONTS.code])),
    document: Array.from(
      new Set([...options.document, ...DEFAULT_FONTS.document]),
    ),
    recommendations: {
      ...DEFAULT_FONTS.recommendations,
      ...options.recommendations,
    },
    ui: Array.from(new Set([...options.ui, ...DEFAULT_FONTS.ui])),
  };
}

function ensureFontOption(options: string[], value: string) {
  return Array.from(new Set([value, ...options].filter(Boolean)));
}

function filterFontOptions(options: string[], query: string) {
  const normalizedQuery = normalizeFontSearchText(query);
  if (!normalizedQuery) return options;

  const queryTokens = normalizedQuery.split(/\s+/);
  return options.filter((option) => {
    const normalizedOption = normalizeFontSearchText(option);
    const compactOption = normalizedOption.replace(/\s+/g, '');

    return queryTokens.every(
      (token) =>
        normalizedOption.includes(token) ||
        compactOption.includes(token.replace(/\s+/g, '')),
    );
  });
}

function normalizeFontSearchText(value: string) {
  return value.normalize('NFKC').trim().toLowerCase();
}

function buildPreviewFontStack(fontFamily: string) {
  return `${quoteCssFontFamily(fontFamily)}, var(--madora-ui-font)`;
}

function quoteCssFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

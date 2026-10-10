'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  GitBranch,
  Info,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Search,
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
  selectAttachmentDirectory,
  saveWorkspaceGitSyncSettings,
  setAppWindowOpacity,
} from './workspace-api';
import { AgentSettings } from './agent-settings';
import type { AppUpdateController } from './use-app-update';
import type {
  WorkspaceSettingsCacheEntry,
  WorkspaceSettingsSessionCache,
} from './workspace-settings-cache';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import { toUserAbsolutePath } from './workspace-paths';
import {
  UI_SCALE_OPTIONS,
  MAX_WINDOW_OPACITY,
  MIN_WINDOW_OPACITY,
  withDefaultAppSettings,
  normalizeAttachmentStorage,
  DEFAULT_ATTACHMENT_STORAGE,
} from './workspace-settings';
import type {
  AppearanceFontSettings,
  AppSettings,
  AttachmentStorageSettings,
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
const SETTINGS_PANEL_MARGIN = 0;

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
      '界面缩放',
      '紧凑',
      '比例',
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
    searchTerms: ['日历', '每日笔记', '展开', '每周起始日', '星期一', '星期日'],
  },
  {
    id: 'codex',
    icon: Sparkles,
    label: '智能体',
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
    searchTerms: ['版本', '关于', 'markune', 'logo', '更新', '下载', '安装'],
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
  const contentScrollRef = React.useRef<HTMLDivElement>(null);
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
      setError(reason instanceof Error ? reason.message : '无法预览应用透明度');
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
    update: (current: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings,
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
          reason instanceof Error ? reason.message : '无法保存 Git Sync 设置',
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
  React.useEffect(() => {
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
  }, [effectiveSection]);
  const assetDirectory = workspaceRootPath
    ? toUserAbsolutePath(
        `${workspaceRootPath.replace(/[\\/]+$/, '')}/.markune/assets/files`,
      )
    : '打开工作区后使用 .markune/assets/files';

  return (
    <section
      aria-label="设置"
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-sidebar"
      data-testid="workspace-settings-page"
    >
      <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 overflow-hidden bg-background">
      <aside
        className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border/50 bg-muted/20 text-sidebar-foreground"
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
              ? { height: macChromeContentTop - SETTINGS_PANEL_MARGIN }
              : undefined
          }
        />
        <div className="flex items-center justify-between px-4 pb-4 pt-2">
          <h1 className="text-base font-semibold tracking-tight">设置</h1>
          <button
            aria-label="返回应用"
            title="返回应用"
            className="inline-flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            <span className="sr-only">返回应用</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-transparent bg-muted/70 px-3 text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <Search size={14} />
            <input
              aria-label="搜索设置"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="搜索设置"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && searchQuery) {
                  event.preventDefault();
                  event.stopPropagation();
                  setSearchQuery('');
                }
              }}
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

          <nav aria-label="设置分类" className="space-y-5">
            {[
              { label: '偏好设置', ids: ['appearance', 'calendar'] },
              { label: '工作区', ids: ['storage', 'git-sync'] },
              { label: '连接与应用', ids: ['codex', 'version'] },
            ].map(group => {
              const sections = visibleSections.filter(section => group.ids.includes(section.id));
              if (!sections.length) return null;
              return (
                <div key={group.label} className="space-y-1">
                  <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                  {sections.map(section => {
                    const Icon = section.icon;
                    return (
                      <button
                        aria-current={effectiveSection === section.id ? 'page' : undefined}
                        className={cn(
                          'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          effectiveSection === section.id
                            ? 'bg-foreground/[0.06] font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                        )}
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                      >
                        <Icon size={16} strokeWidth={1.65} />
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {sidebarResize ? (
        <WorkspaceResizeHandle
          aria-label="调整设置侧栏宽度"
          className="-mr-2"
          direction="left"
          max={sidebarResize.max}
          min={sidebarResize.min}
          value={sidebarWidth}
          onResize={sidebarResize.onResize}
        />
      ) : null}

      <div
        className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background"
        data-testid="workspace-editor-column"
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
          data-chrome="codex-main-surface"
          data-testid="workspace-settings-main-surface"
        >
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto" ref={contentScrollRef} data-testid="settings-content-scrollarea">
            <div
              className="mx-auto w-full max-w-[840px] px-6 py-10 pb-20 lg:px-10"
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
                  onUiScaleChange={(uiScale) =>
                    updateAppearance((current) => ({ ...current, uiScale }))
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
                <AgentSettings />
              ) : null}
              {effectiveSection === 'storage' ? (
                <StorageSection
                  assetDirectory={assetDirectory}
                  error={error}
                  saveState={saveState}
                  settings={settings}
                  onChange={(attachments) => {
                    void saveSettings({
                      ...settingsRef.current,
                      storage: { ...settingsRef.current.storage, attachments },
                    });
                  }}
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
  onUiScaleChange,
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
  onUiScaleChange: (value: number) => void;
  onWindowOpacityCommit: () => void;
  onWindowOpacityPreview: (value: number) => void;
  onSystemNavCollapsedChange: (collapsed: boolean) => void;
  onSystemNavLayoutChange: (layout: SystemNavLayout) => void;
  onThemeChange: (theme: string) => void;
}) {
  return (
    <div className="space-y-6 pb-8" data-testid="appearance-settings-shell">
      <SettingsSectionHeader
        description="调整应用主题、界面缩放、窗口透明度、编辑器页面宽度、系统入口和阅读字体。"
        title="外观"
      />

      <section className="space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground">界面与阅读</h3>
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/65 bg-background">
          <SettingRow
            label="主题"
            description="选择外观，或自动跟随系统。"
            control={
              <SettingsRadioGroup label="主题">
                <ThemePreviewRadioButton checked={theme === 'system'} label="跟随系统" testId="theme-preview-system" variant="system" onClick={() => onThemeChange('system')} />
                <ThemePreviewRadioButton checked={theme === 'light'} label="亮色" testId="theme-preview-light" variant="light" onClick={() => onThemeChange('light')} />
                <ThemePreviewRadioButton checked={theme === 'dark'} label="暗色" testId="theme-preview-dark" variant="dark" onClick={() => onThemeChange('dark')} />
              </SettingsRadioGroup>
            }
          />
          <SettingRow
            label="界面缩放"
            description="缩小比例可显示更多内容，放大比例更易阅读。仅调整 Markune，100% 为默认。"
            control={
              <Select value={String(settings.appearance.uiScale)} onValueChange={(value) => onUiScaleChange(Number(value))}>
                <SelectTrigger aria-label="界面缩放" className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UI_SCALE_OPTIONS.map((scale) => (
                    <SelectItem key={scale} value={String(scale)}>
                      {scale}%{scale < 100 ? ' · 紧凑' : scale === 100 ? ' · 默认' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            label="页面宽度"
            description="调整正文的阅读宽度。"
            control={
              <SettingsRadioGroup label="页面宽度">
                <PageWidthPreviewRadioButton checked={settings.appearance.pageWidthMode === 'standard'} label="标准" testId="page-width-preview-standard" onClick={() => onPageWidthChange('standard')} />
                <PageWidthPreviewRadioButton checked={settings.appearance.pageWidthMode === 'wide'} label="全宽" testId="page-width-preview-wide" onClick={() => onPageWidthChange('wide')} />
              </SettingsRadioGroup>
            }
          />
        </div>
      </section>

      <WindowOpacitySetting
        available={isTauriRuntime()}
        value={settings.appearance.windowOpacity}
        onCommit={onWindowOpacityCommit}
        onPreview={onWindowOpacityPreview}
      />

      <section data-testid="system-nav-settings">
        <h3 className="text-xs font-medium text-muted-foreground">系统入口</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          控制左侧顶部入口的排列与折叠。
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border/65 bg-background">
          <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
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
          <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium">收起系统入口</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {settings.appearance.systemNavLayout === 'horizontal'
                  ? '横向排列时保持展开；切换为纵向后可收起。'
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
        <h3 className="text-xs font-medium text-muted-foreground">字体</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          分别控制系统界面、文档正文和代码块字体。
        </p>
        <div
          className="mt-3 overflow-hidden rounded-xl border border-border/65 bg-background"
          data-testid="appearance-fonts-card"
        >
          <FontSettingRow
            description="侧边栏、工具栏、设置面板等编辑器以外的界面文本。"
            label="UI 字体"
            options={fonts.ui}
            sample="Markune · 本地知识库"
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
    ((value - MIN_WINDOW_OPACITY) / (MAX_WINDOW_OPACITY - MIN_WINDOW_OPACITY)) *
    100;
  const commitValue = () => onCommit();
  const restoreDefault = () => {
    onPreview(MAX_WINDOW_OPACITY);
    onCommit();
  };

  return (
    <section data-testid="window-opacity-settings">
      <h3 className="text-xs font-medium text-muted-foreground">窗口</h3>
      <div className="mt-3 rounded-xl border border-border/65 bg-background px-4 py-3.5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">应用透明度</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              拖动即刻预览，松开后保存。最低为 70%。
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
        className="overflow-hidden rounded-xl border border-border/65 bg-background"
        data-testid="calendar-settings-card"
      >
        <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
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
        <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
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
  saveState,
  onChange,
}: {
  assetDirectory: string;
  settings: AppSettings;
  error: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (settings: AttachmentStorageSettings) => void;
}) {
  const policy = normalizeAttachmentStorage(settings.storage.attachments);
  const [customPath, setCustomPath] = React.useState(policy.customPath);
  const [pathError, setPathError] = React.useState<string | null>(null);
  const managed = policy.mode === 'managed';
  const policyRef = React.useRef(policy);
  React.useLayoutEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  const update = (patch: Partial<AttachmentStorageSettings>) => {
    policyRef.current = { ...policyRef.current, ...patch };
    onChange(policyRef.current);
  };
  const commitPath = () => {
    if (
      !customPath.trim() ||
      /[\u0000-\u001f]/u.test(customPath) ||
      customPath.replaceAll('${filename}', '').includes('${') ||
      customPath.trim().startsWith('~') ||
      (/^[a-z][a-z\d+.-]*:/i.test(customPath) &&
        !/^[a-z]:[/\\]/i.test(customPath))
    ) {
      setPathError('请输入本地目录；仅支持 ${filename} 变量，不支持网址或 ~ 路径。');
      return;
    }
    setPathError(null);
    update({ customPath: customPath.trim() });
  };
  const chooseFolder = async () => {
    try {
      const path = await selectAttachmentDirectory();
      if (path) {
        const displayPath = toUserAbsolutePath(path);
        setCustomPath(displayPath);
        setPathError(null);
        update({ customPath: displayPath });
      }
    } catch {
      setPathError('无法选择附件目录，请重试。');
    }
  };
  const modes = [
    ['managed', '内置资产库（默认）'],
    ['document', '当前文档所在目录 ./'],
    ['assets', './assets 文件夹'],
    ['filename-assets', './${filename}.assets 文件夹'],
    ['custom', '指定路径'],
  ] as const;
  return (
    <div className="space-y-6 pb-8" data-testid="storage-settings-shell">
      <div className="flex items-start justify-between gap-4">
        <SettingsSectionHeader
          title="存储"
          description="设置新插入附件的保存位置与图片处理规则。"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCustomPath(DEFAULT_ATTACHMENT_STORAGE.customPath);
            setPathError(null);
            policyRef.current = { ...DEFAULT_ATTACHMENT_STORAGE };
            onChange(policyRef.current);
          }}
        >
          恢复默认值
        </Button>
      </div>
      <section
        className="overflow-hidden rounded-xl border border-border/65 bg-background"
        data-testid="storage-provider-card"
      >
        <SettingRow
          labelClassName="text-sm font-normal tracking-normal"
          label="附件保存位置"
          description={
            managed
              ? '由 Markune 管理，跟随工作区保存。'
              : '图片、视频和文件附件保存为普通文件。'
          }
          control={
            <Select
              value={policy.mode}
              onValueChange={(mode) =>
                update({ mode: mode as AttachmentStorageSettings['mode'] })
              }
            >
              <SelectTrigger
                aria-label="附件保存位置"
                className="w-full min-w-[220px] bg-background sm:w-[320px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modes.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {policy.mode === 'custom' ? (
          <div className="space-y-2 px-5 pb-5">
            <label
              htmlFor="attachment-custom-path"
              className="text-sm font-normal"
            >
              目标目录
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="attachment-custom-path"
                className="min-w-0 flex-1 font-mono"
                value={customPath}
                placeholder="./assets 或绝对路径"
                onChange={(event) => setCustomPath(event.target.value)}
                onBlur={commitPath}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitPath();
                }}
              />
              <Button
                variant="outline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void chooseFolder()}
              >
                选择文件夹
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              相对路径以 Markdown 所在目录为基准；<code>{'${filename}'}</code>{' '}
              为不含扩展名的文档文件名。工作区外目录请使用“选择文件夹”授权。
            </p>
            {pathError ? (
              <p role="alert" className="text-xs text-destructive">
                {pathError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      {managed ? (
        <section
          className="overflow-hidden rounded-xl border border-border/65 bg-background"
          data-testid="storage-local-card"
        >
          <ReadonlyField label="本地资源目录" value={assetDirectory} />
          <p className="px-5 pb-4 text-xs text-muted-foreground">
            文档使用稳定的 markune-asset:// 引用，无需配置相对路径。
          </p>
        </section>
      ) : null}
      <section>
        <h3 className="mb-3 text-sm font-medium">插入图片时</h3>
        <div className="divide-y divide-border/50 rounded-xl border border-border/65 bg-background">
          <SettingRow
            labelClassName="text-sm font-normal tracking-normal"
            label="对本地图片应用规则"
            description="插入已有本地图片路径时，复制到所选位置。截图及没有来源路径的文件仍需保存。"
            control={
              <PillSwitch
                label="对本地图片应用规则"
                checked={policy.applyToLocalImages}
                onChange={(value) => update({ applyToLocalImages: value })}
              />
            }
          />
          <SettingRow
            labelClassName="text-sm font-normal tracking-normal"
            label="对网络图片应用规则"
            description="粘贴或插入网络图片时下载到所选位置。关闭时保留原网址。"
            control={
              <PillSwitch
                label="对网络图片应用规则"
                checked={policy.applyToRemoteImages}
                onChange={(value) => update({ applyToRemoteImages: value })}
              />
            }
          />
        </div>
      </section>
      {!managed ? (
        <section data-testid="storage-path-options">
          <h3 className="mb-3 text-sm font-medium">文档中的路径</h3>
          <div className="divide-y divide-border/50 rounded-xl border border-border/65 bg-background">
            <SettingRow
              labelClassName="text-sm font-normal tracking-normal"
              label="优先使用相对路径"
              description="以当前文档目录为基准；无法跨磁盘计算时使用绝对文件地址。"
              control={
                <PillSwitch
                  label="优先使用相对路径"
                  checked={policy.preferRelativePath}
                  onChange={(value) => update({ preferRelativePath: value })}
                />
              }
            />
            <SettingRow
              labelClassName="text-sm font-normal tracking-normal"
              label="为相对路径添加 ./"
              description="只影响当前目录及其子目录，不改写 ../ 开头的路径。"
              control={
                <PillSwitch
                  label="为相对路径添加 ./"
                  checked={policy.addDotSlash}
                  disabled={!policy.preferRelativePath}
                  onChange={(value) => update({ addDotSlash: value })}
                />
              }
            />
          </div>
        </section>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        更改只影响后续插入，不迁移已有附件。恢复默认值不会移动或删除文件。
      </p>
      <SettingsFeedback
        defaultMessage="更改会自动保存，并作为全局附件默认值。"
        error={error}
        state={saveState}
      />
    </div>
  );
}

function VersionSection({ appUpdate }: { appUpdate: AppUpdateController }) {
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
        description="检查、下载并安装经过签名验证的 Markune 桌面更新。"
        title="版本"
      />

      <section
        className="overflow-hidden rounded-xl border border-border/65 bg-background"
        data-testid="markune-version-card"
      >
        <div className="flex items-center gap-4 px-5 py-6">
          <div
            aria-label="Markune Logo"
            className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background shadow-sm"
            role="img"
          >
            <Image
              alt=""
              className="size-8 opacity-90 dark:hidden"
              height={48}
              src="/brand/markune-logo-dark.svg"
              width={48}
            />
            <Image
              alt=""
              className="hidden size-8 opacity-90 dark:block"
              height={48}
              src="/brand/markune-logo-light.svg"
              width={48}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Markune</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              以 Markdown 为核心的本地知识库桌面应用。
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/60 px-4 py-3.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
          <span className="text-muted-foreground">当前版本</span>
          <code
            aria-live="polite"
            className="font-mono text-sm text-foreground sm:text-right"
            data-testid="markune-version"
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

      <section className="rounded-xl border border-border/65 bg-background p-5">
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
        <section className="rounded-xl border border-border/65 bg-background p-5">
          <h3 className="text-sm font-medium">更新说明</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {appUpdate.update.body}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function VersionMetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-3 border-t border-border/60 px-4 py-3.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
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
      return '更新已安装，重启 Markune 后生效。';
    case 'error':
      return '检查更新失败，可稍后手动重试。';
    default:
      return 'Markune 会在启动后自动检查，也可立即手动检查。';
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
        className="rounded-xl border border-border/65 bg-background"
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
          description="允许 Markune 提交、拉取和推送当前工作区。"
          label="启用 Git 同步"
        />
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground">仓库</h3>
        <div
          className="mt-2 overflow-hidden rounded-xl border border-border/65 bg-background"
          data-testid="git-sync-repository-card"
        >
          <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
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
          <div className="grid gap-3 px-4 py-3.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
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
          className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/65 bg-background"
          data-testid="git-entry-preferences-card"
        >
          <SettingRow
            control={
              <PillSwitch
                checked={showGitPanelEntry}
                label="显示 Git 面板入口（Beta）"
                testId="git-panel-entry-switch"
                onChange={onShowGitPanelEntryChange}
              />
            }
            description="在工作区右上角显示 Git 面板入口。"
            label="显示 Git 面板入口（Beta）"
          />
          <SettingRow
            control={
              <PillSwitch
                checked={showGitLogEntry}
                label="显示 Git 日志入口（Beta）"
                testId="git-log-entry-switch"
                onChange={onShowGitLogEntryChange}
              />
            }
            description="在工作区右上角显示 Git 日志入口。"
            label="显示 Git 日志入口（Beta）"
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          仅控制入口显示，不影响 Git Sync、自动同步或仓库数据。
        </p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground">同步偏好</h3>
        <div
          className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/65 bg-background"
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
    <header className="pb-2">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function SettingsRadioGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      aria-label={label}
      className="inline-flex max-w-full items-center gap-0.5 rounded-lg bg-muted/60 p-1"
      role="radiogroup"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        if (current < 0 || !buttons.length) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
        buttons[next].click();
      }}
    >{children}</div>
  );
}

function ThemePreviewRadioButton({ checked, label, testId, variant, onClick }: {
  checked: boolean; label: string; testId: string;
  variant: 'dark' | 'light' | 'system'; onClick: () => void;
}) {
  const Icon = variant === 'system' ? Monitor : variant === 'light' ? Sun : Moon;
  return (
    <button aria-checked={checked} aria-label={label} data-testid={testId} role="radio" type="button"
      tabIndex={checked ? 0 : -1}
      className={cn('inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground')}
      onClick={onClick}>
      <Icon size={14} strokeWidth={1.7} />{label}
    </button>
  );
}

function PageWidthPreviewRadioButton({ checked, label, testId, onClick }: {
  checked: boolean; label: string; testId: string; onClick: () => void;
}) {
  return (
    <button aria-checked={checked} aria-label={label} data-testid={testId} role="radio" type="button"
      tabIndex={checked ? 0 : -1}
      className={cn('h-8 min-w-[76px] rounded-md px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground')}
      onClick={onClick}>{label}</button>
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
  return (
    <Select value={value} onValueChange={(next) => onChange(next as SystemNavLayout)}>
      <SelectTrigger aria-label="系统入口排列方式" data-testid="system-nav-layout-select" className="h-8 w-full rounded-lg text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SYSTEM_NAV_LAYOUT_OPTIONS.map(option => (
          <SelectItem key={option.value} value={option.value} data-testid={`system-nav-layout-${option.value}`}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
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
          className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/70 px-2.5 text-sm outline-none transition-[background-color,border-color,box-shadow] hover:border-ring/45 hover:bg-accent/60 hover:text-accent-foreground hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-ring/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow-sm"
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
                {fontFamily === value ? <CheckCircle2 size={14} className="ml-auto shrink-0 text-primary" /> : null}
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
  labelClassName,
}: {
  control: React.ReactNode;
  description: string;
  label: string;
  labelClassName?: string;
}) {
  return (
    <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className={cn('text-sm font-medium', labelClassName)}>
          {label}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
    <label className="grid gap-3 px-4 py-3.5 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
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
  return `${quoteCssFontFamily(fontFamily)}, var(--markune-ui-font)`;
}

function quoteCssFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

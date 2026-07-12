'use client';

import * as React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FolderArchive,
  GitBranch,
  Loader2,
  Moon,
  Palette,
  RefreshCw,
  Server,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  gitProbe,
  gitRemoteInfo,
  gitSyncNow,
  isTauriRuntime,
  listSystemFonts,
  saveAppSettings,
  saveWorkspaceGitSyncSettings,
} from './workspace-api';
import type { WorkspaceSettingsSessionCache } from './workspace-settings-cache';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import type {
  AppearanceFontSettings,
  AppSettings,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  PageWidthMode,
  SystemFontOptions,
  WorkspaceGitSyncSettings,
} from './workspace-types';

export type SettingsSectionId = 'appearance' | 'storage' | 'git-sync';

interface WorkspaceSettingsPageProps {
  header?: React.ReactNode;
  initialSettings: AppSettings;
  initialSectionId?: SettingsSectionId;
  sessionCache: WorkspaceSettingsSessionCache;
  sidebarResize?: { max: number; min: number; onResize: (width: number) => void };
  sidebarWidth?: number;
  workspaceRootPath: string | null;
  onBack: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

const DEFAULT_FONTS: SystemFontOptions = {
  code: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas'],
  document: ['Songti SC', 'PingFang SC', 'Noto Serif CJK SC'],
  recommendations: { code: 'JetBrains Mono', document: 'Songti SC', ui: 'SF Pro Text' },
  ui: ['SF Pro Text', 'PingFang SC', 'Segoe UI', 'Geist'],
};

const DEFAULT_GIT_SYNC: WorkspaceGitSyncSettings = {
  conflictResolution: 'abort',
  enabled: true,
  intervalMinutes: 10,
  lastSyncedAt: null,
};

export function WorkspaceSettingsPage({
  header,
  initialSettings,
  initialSectionId = 'appearance',
  sidebarResize,
  sidebarWidth,
  workspaceRootPath,
  onBack,
  onSettingsSaved,
}: WorkspaceSettingsPageProps) {
  const { setTheme, theme } = useTheme();
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>(initialSectionId);
  const [settings, setSettings] = React.useState(initialSettings);
  const [fontOptions, setFontOptions] = React.useState(DEFAULT_FONTS);
  const [gitSettings, setGitSettings] = React.useState(DEFAULT_GIT_SYNC);
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(null);
  const [gitRemote, setGitRemote] = React.useState<GitRemoteInfo>({ remoteUrl: null, webUrl: null });
  const [error, setError] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isSyncing, setIsSyncing] = React.useState(false);

  React.useEffect(() => {
    if (!isTauriRuntime()) return;
    void listSystemFonts().then((options) => setFontOptions(mergeFontOptions(options))).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!workspaceRootPath || !isTauriRuntime()) return;
    void Promise.all([gitProbe(workspaceRootPath), gitRemoteInfo(workspaceRootPath)])
      .then(([probe, remote]) => { setGitProbeState(probe); setGitRemote(remote); })
      .catch(() => undefined);
  }, [workspaceRootPath]);

  const saveSettings = React.useCallback(async (next: AppSettings) => {
    setSettings(next);
    onSettingsSaved?.(next);
    if (!isTauriRuntime()) return;
    setSaveState('saving');
    setError(null);
    try {
      const saved = await saveAppSettings(next);
      setSettings(saved);
      onSettingsSaved?.(saved);
      setSaveState('saved');
    } catch (reason) {
      setSaveState('error');
      setError(reason instanceof Error ? reason.message : '无法保存设置');
    }
  }, [onSettingsSaved]);

  const updateAppearance = (update: (appearance: AppSettings['appearance']) => AppSettings['appearance']) => {
    void saveSettings({ ...settings, appearance: update(settings.appearance) });
  };

  const updateGitSettings = (update: (current: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings) => {
    const next = update(gitSettings);
    setGitSettings(next);
    if (!workspaceRootPath || !isTauriRuntime()) return;
    setError(null);
    void saveWorkspaceGitSyncSettings(workspaceRootPath, next).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '无法保存 Git Sync 设置');
    });
  };

  const syncNow = async () => {
    if (!workspaceRootPath || !isTauriRuntime()) return;
    setIsSyncing(true);
    setError(null);
    try {
      const result = await gitSyncNow(workspaceRootPath, gitSettings.conflictResolution);
      setGitSettings((current) => ({ ...current, lastSyncedAt: result.lastSyncedAt }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Git Sync 失败');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-[280px] shrink-0 flex-col border-r bg-muted/20" style={{ width: sidebarWidth }}>
        {header}
        <div className="flex items-center gap-2 px-3 py-3">
          <Button aria-label="返回工作区" size="icon" variant="ghost" onClick={onBack}><ArrowLeft size={16} /></Button>
          <span className="text-sm font-semibold">设置</span>
        </div>
        <nav className="space-y-1 px-2">
          <SettingsNavItem active={activeSection === 'appearance'} icon={<Palette size={15} />} label="外观" onClick={() => setActiveSection('appearance')} />
          <SettingsNavItem active={activeSection === 'storage'} icon={<Database size={15} />} label="存储" onClick={() => setActiveSection('storage')} />
          <SettingsNavItem active={activeSection === 'git-sync'} icon={<GitBranch size={15} />} label="Git Sync" onClick={() => setActiveSection('git-sync')} />
        </nav>
      </aside>
      {sidebarResize ? <WorkspaceResizeHandle aria-label="调整设置侧栏宽度" direction="left" max={sidebarResize.max} min={sidebarResize.min} value={sidebarWidth ?? 280} onResize={sidebarResize.onResize} /> : null}
      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        {activeSection === 'appearance' ? <AppearanceSection fonts={fontOptions} settings={settings} theme={theme ?? 'system'} error={error} saveState={saveState} onFontChange={(key, value) => updateAppearance((current) => ({ ...current, fonts: { ...current.fonts, [key]: value } }))} onPageWidthChange={(pageWidthMode) => updateAppearance((current) => ({ ...current, pageWidthMode }))} onThemeChange={setTheme} /> : null}
        {activeSection === 'storage' ? <StorageSection settings={settings} error={error} /> : null}
        {activeSection === 'git-sync' ? <GitSyncSection settings={gitSettings} probe={gitProbeState} remote={gitRemote} error={error} syncing={isSyncing} onSettingsChange={updateGitSettings} onSyncNow={() => void syncNow()} /> : null}
      </main>
    </div>
  );
}

function SettingsNavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm', active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground')} type="button" onClick={onClick}>{icon}{label}</button>;
}

function AppearanceSection({ fonts, settings, theme, error, saveState, onFontChange, onPageWidthChange, onThemeChange }: { fonts: SystemFontOptions; settings: AppSettings; theme: string; error: string | null; saveState: string; onFontChange: (key: keyof AppearanceFontSettings, value: string) => void; onPageWidthChange: (value: PageWidthMode) => void; onThemeChange: (theme: string) => void }) {
  return <section className="mx-auto max-w-3xl space-y-6" data-testid="appearance-settings-shell">
    <header><h2 className="text-xl font-semibold">外观</h2><p className="mt-1 text-sm text-muted-foreground">调整主题、页面宽度和字体。</p></header>
    <SettingCard title="主题"><div className="grid gap-3 sm:grid-cols-3"><ThemeButton active={theme === 'system'} icon={<MonitorIcon />} label="跟随系统" onClick={() => onThemeChange('system')} /><ThemeButton active={theme === 'light'} icon={<Sun size={16} />} label="亮色" onClick={() => onThemeChange('light')} /><ThemeButton active={theme === 'dark'} icon={<Moon size={16} />} label="暗色" onClick={() => onThemeChange('dark')} /></div></SettingCard>
    <SettingCard title="页面宽度"><div className="grid gap-3 sm:grid-cols-2"><ThemeButton active={settings.appearance.pageWidthMode === 'standard'} label="标准" onClick={() => onPageWidthChange('standard')} /><ThemeButton active={settings.appearance.pageWidthMode === 'wide'} label="全宽" onClick={() => onPageWidthChange('wide')} /></div></SettingCard>
    <SettingCard title="字体"><div className="space-y-4"><FontRow label="UI 字体" options={fonts.ui} value={settings.appearance.fonts.ui} onChange={(value) => onFontChange('ui', value)} /><FontRow label="文档字体" options={fonts.document} value={settings.appearance.fonts.document} onChange={(value) => onFontChange('document', value)} /><FontRow label="代码块字体" options={fonts.code} value={settings.appearance.fonts.code} onChange={(value) => onFontChange('code', value)} /></div></SettingCard>
    <Feedback error={error} state={saveState} />
  </section>;
}

function StorageSection({ settings, error }: { settings: AppSettings; error: string | null }) {
  return <section className="mx-auto max-w-3xl space-y-6" data-testid="storage-settings-shell"><header><h2 className="text-xl font-semibold">存储</h2><p className="mt-1 text-sm text-muted-foreground">上传资源保存在当前工作区。</p></header><SettingCard title="全局存储方式"><Select value={settings.storage.defaultProvider}><SelectTrigger aria-label="全局存储方式" className="w-full sm:w-80"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="local"><span className="flex items-center gap-2"><FolderArchive size={15} />本地存储</span></SelectItem><SelectItem disabled value="oss">OSS 存储</SelectItem><SelectItem disabled value="api"><span className="flex items-center gap-2"><Server size={15} />自定义 API</span></SelectItem></SelectContent></Select></SettingCard><SettingCard title="本地资源目录"><Input readOnly value=".madora/assets/files" /></SettingCard><Feedback error={error} state="idle" /></section>;
}

function GitSyncSection({ settings, probe, remote, error, syncing, onSettingsChange, onSyncNow }: { settings: WorkspaceGitSyncSettings; probe: GitProbe | null; remote: GitRemoteInfo; error: string | null; syncing: boolean; onSettingsChange: (update: (current: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings) => void; onSyncNow: () => void }) {
  const available = probe?.gitAvailable ?? true;
  const canSync = available && Boolean(probe?.isRepository) && Boolean(remote.remoteUrl) && settings.enabled;
  return <section className="mx-auto max-w-3xl space-y-6" data-testid="git-sync-settings-shell"><header><h2 className="text-xl font-semibold">Git Sync</h2><p className="mt-1 text-sm text-muted-foreground">同步当前工作区的 Git 变更。</p></header><SettingCard title="启用 Git 同步"><Switch checked={settings.enabled} disabled={!available} label="启用 Git 同步" onChange={(enabled) => onSettingsChange((current) => ({ ...current, enabled }))} /></SettingCard><SettingCard title="同步偏好"><div className="space-y-4"><SelectRow label="同步频率" value={String(settings.intervalMinutes)} options={[1,2,3,5,10,15,30,60].map((value) => ({ label: `${value} 分钟`, value: String(value) }))} onChange={(value) => onSettingsChange((current) => ({ ...current, intervalMinutes: Number(value) }))} /><SelectRow label="差异处理策略" value={settings.conflictResolution} options={[{label:'放弃',value:'abort'},{label:'本地仓库',value:'local'},{label:'远程仓库',value:'remote'}]} onChange={(value) => onSettingsChange((current) => ({ ...current, conflictResolution: value as GitSyncConflictResolution }))} /><div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">远程仓库：{remote.remoteUrl ?? '未检测到 origin remote'}</span><Button disabled={!canSync || syncing} variant="outline" onClick={onSyncNow}>{syncing ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}立即同步</Button></div></div></SettingCard><Feedback error={error} state="idle" /></section>;
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl bg-muted/30 p-5"><h3 className="mb-4 text-sm font-medium">{title}</h3>{children}</section>; }
function ThemeButton({ active, icon, label, onClick }: { active: boolean; icon?: React.ReactNode; label: string; onClick: () => void }) { return <button aria-checked={active} className={cn('flex min-h-20 items-center justify-center gap-2 rounded-lg border text-sm', active ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-background text-muted-foreground')} role="radio" type="button" onClick={onClick}>{active ? <CheckCircle2 size={16} /> : icon}{label}</button>; }
function FontRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) { const values = Array.from(new Set([value, ...options])); return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{values.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>; }
function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) { return <div className="flex items-center justify-between gap-4"><span className="text-sm text-muted-foreground">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>; }
function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) { return <button aria-checked={checked} aria-label={label} className={cn('relative inline-flex h-6 w-11 items-center rounded-full', checked ? 'bg-primary' : 'bg-muted')} disabled={disabled} role="switch" type="button" onClick={() => onChange(!checked)}><span className={cn('size-5 rounded-full bg-background transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} /></button>; }
function Feedback({ error, state }: { error: string | null; state: string }) { return <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? (state === 'saving' ? '正在保存设置...' : state === 'saved' ? '设置已保存。' : '更改会自动保存。')}</p>; }
function MonitorIcon() { return <span aria-hidden="true">◐</span>; }
function mergeFontOptions(options: SystemFontOptions): SystemFontOptions { return { code: Array.from(new Set([...options.code, ...DEFAULT_FONTS.code])), document: Array.from(new Set([...options.document, ...DEFAULT_FONTS.document])), recommendations: { ...DEFAULT_FONTS.recommendations, ...options.recommendations }, ui: Array.from(new Set([...options.ui, ...DEFAULT_FONTS.ui])) }; }

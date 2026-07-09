'use client';

import * as React from 'react';
import { MarkweaveEditor } from '@markweave/react';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  FolderArchive,
  GitBranch,
  Loader2,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Sun,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { WorkspaceResizeHandle } from './workspace-resize-handle';
import {
  createAiCommand,
  createAiCustomAgent,
  createAiMcpServer,
  authenticateAiMcpServer,
  createAiSkill,
  deleteAiAnthropicAccount,
  deleteAiProviderSecret,
  deleteAiCommand,
  deleteAiCustomAgent,
  deleteAiMcpServer,
  deleteAiSkill,
  detectAiAccounts,
  ensureWorkspace,
  getAiProviderSecretStatus,
  getCodexIntegration,
  gitProbe,
  gitRemoteInfo,
  gitSyncNow,
  importAiAnthropicAccountToken,
  isTauriRuntime,
  listAiAgentProfiles,
  listAiAnthropicAccounts,
  listAiCommands,
  listAiCustomAgents,
  listAiMcpServers,
  listAiPlugins,
  listAiSkills,
  logoutCodexAccount,
  logoutAiMcpServer,
  listSystemFonts,
  cancelCodexLogin,
  getCodexLoginSession,
  openAiClaudeCodeOAuthUrl,
  openCodexLoginUrl,
  pollAiClaudeCodeAuthStatus,
  readAppSettings,
  renameAiAnthropicAccount,
  saveAppSettings,
  saveAiProviderSecret,
  saveWorkspaceGitSyncSettings,
  startAiClaudeCodeAuth,
  startCodexLogin,
  setAiClaudeIncludeCoAuthoredBy,
  setAiAnthropicAccountActive,
  setAiPluginEnabled,
  setAiPluginMcpServerApproved,
  setAiPluginMcpServersApproved,
  setAiMcpServerEnabled,
  submitAiClaudeCodeAuthCode,
  updateAiCommand,
  updateAiCustomAgent,
  updateAiMcpServer,
  updateAiSkill,
} from './workspace-api';
import {
  AI_PREFERRED_EDITOR_OPTIONS,
  DEFAULT_APP_SETTINGS,
  getAiPreferredEditorLabel,
  withDefaultAppSettings,
} from './workspace-settings';
import type {
  AiConfiguredProfile,
  AiPreferredEditor,
  AppearanceFontSettings,
  AppSettings,
  GitProbe,
  GitRemoteInfo,
  GitSyncConflictResolution,
  PageWidthMode,
  SystemFontOptions,
  WorkspaceGitSyncSettings,
} from './workspace-types';
import type {
  AiAgentProfile,
  AiAssistantAccount,
  CodexIntegrationStatus,
  CodexLoginSession,
} from './ai-panel/ai-types';
import type {
  AiAnthropicAccountItem,
  AiCommandItem,
  AiCustomAgentItem,
  AiMcpServerItem,
  AiPluginItem,
  AiSkillItem,
} from './ai-settings/ai-settings-types';

interface WorkspaceSettingsPageProps {
  header?: React.ReactNode;
  initialSectionId?: SettingsSectionId;
  sidebarResize?: {
    max: number;
    min: number;
    onResize: (width: number) => void;
  };
  sidebarWidth?: number;
  workspaceRootPath: string | null;
  onBack: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsSectionId =
  | 'preferences'
  | 'appearance'
  | 'storage'
  | 'git-sync'
  | 'ai'
  | 'ai-models'
  | 'ai-skills'
  | 'ai-agents'
  | 'ai-mcp'
  | 'ai-plugins';
type ConcreteSettingsSectionId = Exclude<SettingsSectionId, 'ai'>;
const AI_SETTINGS_AVAILABLE = true;
const AI_MCP_GLOBAL_PROJECT = '__global__';
const AI_PREFERRED_EDITOR_ICON_PATHS = {
  clion: '/icons/app-icons/clion.svg',
  cursor: '/icons/app-icons/cursor.svg',
  fleet: '/icons/app-icons/fleet.svg',
  ghostty: '/icons/app-icons/ghostty.svg',
  goland: '/icons/app-icons/goland.svg',
  intellij: '/icons/app-icons/intellij.svg',
  iterm: '/icons/app-icons/iterm.png',
  phpstorm: '/icons/app-icons/phpstorm.svg',
  pycharm: '/icons/app-icons/pycharm.svg',
  rider: '/icons/app-icons/rider.svg',
  rustrover: '/icons/app-icons/rustrover.svg',
  sublime: '/icons/app-icons/sublime.svg',
  terminal: '/icons/app-icons/terminal.png',
  trae: '/icons/app-icons/trae.svg',
  vscode: '/icons/app-icons/vscode.svg',
  'vscode-insiders': '/icons/app-icons/vscode-insiders.svg',
  warp: '/icons/app-icons/warp.png',
  webstorm: '/icons/app-icons/webstorm.svg',
  windsurf: '/icons/app-icons/windsurf.svg',
  xcode: '/icons/app-icons/xcode.svg',
  zed: '/icons/app-icons/zed.png',
} satisfies Record<AiPreferredEditor, string>;
const AI_PREFERRED_EDITOR_GROUP_ICON_PATHS = {
  jetbrains: '/icons/app-icons/jetbrains.svg',
  vscode: '/icons/app-icons/vscode.svg',
};

const APPEARANCE_SEARCH_TERMS = [
  '外观',
  '主题',
  '字体',
  'UI 字体',
  '文档字体',
  '代码块字体',
  'font',
  '亮色',
  '暗色',
  '系统',
  '跟随系统',
  '页面宽度',
  '文档宽度',
  '阅读宽度',
  '标准',
  '全宽',
  '75%',
];

const PREFERENCES_SEARCH_TERMS = [
  'Preferences',
  'preferences',
  '偏好',
  'AI',
  'ai',
  'Extended Thinking',
  'extended thinking',
  'Default Mode',
  'default mode',
  'Default Model',
  'default model',
  'Include Co-Authored-By',
  'Co-Authored-By',
  'Codex Thinking',
  'thinking',
];

const FALLBACK_SYSTEM_FONT_OPTIONS: SystemFontOptions = {
  code: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', 'Monaco'],
  document: [
    'Songti SC',
    'PingFang SC',
    'Microsoft YaHei',
    'Noto Serif CJK SC',
    'SimSun',
  ],
  recommendations: DEFAULT_APP_SETTINGS.appearance.fonts,
  ui: [
    'SF Pro Text',
    'PingFang SC',
    'Microsoft YaHei',
    'Segoe UI',
    'Geist',
  ],
};

const DEFAULT_GIT_SYNC_SETTINGS: WorkspaceGitSyncSettings = {
  conflictResolution: 'abort',
  enabled: true,
  intervalMinutes: 10,
  lastSyncedAt: null,
};

const DEFAULT_GIT_REMOTE_INFO: GitRemoteInfo = {
  remoteUrl: null,
  webUrl: null,
};

function normalizeAiSettingsSidebarWidth(value: number) {
  return Math.min(Math.max(Math.round(value), 200), 400);
}

const STORAGE_SEARCH_TERMS = [
  '存储',
  '上传',
  '附件',
  '图片',
  '视频',
  '音频',
  '文件',
  'asset',
  '本地存储',
  'oss',
  '自定义 api',
];

const GIT_SYNC_SEARCH_TERMS = [
  'git',
  'Git',
  'Git Sync',
  '同步',
  '远程仓库',
  'remote',
  'repository',
  '上次同步',
  '同步频率',
  '冲突',
  '差异',
  '立即同步',
  '移除',
];

const AI_SEARCH_TERMS = [
  'ai',
  'AI',
  'AI Assistant',
  'assistant',
  'agent',
  'models',
  'skills',
  'custom agents',
  'mcp',
  'mcp servers',
  'plugins',
  'preferences',
  'extended thinking',
  'default model',
  '账号',
  '账户',
  '模型',
  '技能',
  '自定义代理',
  'MCP',
  '插件',
  '偏好',
  '扩展思考',
  '默认模型',
  'Codex',
  'Claude',
  'Claude Code',
  'accounts',
  'app-server',
  'stream-json',
  'cli',
];

const SETTINGS_SECTIONS = [
  {
    id: 'preferences' as const,
    label: 'Preferences',
    terms: PREFERENCES_SEARCH_TERMS,
  },
  {
    id: 'appearance' as const,
    label: '外观',
    terms: APPEARANCE_SEARCH_TERMS,
  },
  {
    id: 'storage' as const,
    label: '存储',
    terms: STORAGE_SEARCH_TERMS,
  },
  {
    id: 'git-sync' as const,
    label: 'Git Sync',
    terms: GIT_SYNC_SEARCH_TERMS,
  },
  {
    id: 'ai-models' as const,
    label: 'Models',
    terms: [...AI_SEARCH_TERMS, 'Models', '模型', 'default model', 'API Keys'],
  },
  {
    id: 'ai-skills' as const,
    label: 'Skills',
    terms: [...AI_SEARCH_TERMS, 'Skills', '技能', 'commands', 'slash commands'],
  },
  {
    id: 'ai-agents' as const,
    label: 'Custom Agents',
    terms: [...AI_SEARCH_TERMS, 'Custom Agents', '自定义代理', 'subagents'],
  },
  {
    id: 'ai-mcp' as const,
    label: 'MCP Servers',
    terms: [...AI_SEARCH_TERMS, 'MCP Servers', 'MCP', 'tools'],
  },
  {
    id: 'ai-plugins' as const,
    label: 'Plugins',
    terms: [...AI_SEARCH_TERMS, 'Plugins', '插件', 'marketplace'],
  },
];

const SETTINGS_SECTION_GROUPS = [
  {
    id: 'personal',
    label: '个人',
    sectionIds: [
      'preferences',
      'appearance',
      'storage',
    ] satisfies ConcreteSettingsSectionId[],
  },
  {
    id: 'integrations',
    label: '集成',
    sectionIds: [
      'ai-models',
      'ai-mcp',
      'ai-plugins',
    ] satisfies ConcreteSettingsSectionId[],
  },
  {
    id: 'coding',
    label: '编码',
    sectionIds: [
      'ai-skills',
      'ai-agents',
      'git-sync',
    ] satisfies ConcreteSettingsSectionId[],
  },
];

const APPEARANCE_FIELD_DEFINITIONS = [
  {
    id: 'theme',
    label: '主题',
    terms: ['主题', '亮色', '暗色', '系统', '跟随系统', 'light', 'dark', 'system'],
  },
  {
    id: 'page-width',
    label: '页面宽度',
    terms: ['页面宽度', '文档宽度', '阅读宽度', '标准', '全宽', '75%'],
  },
  {
    id: 'ui-font',
    label: 'UI 字体',
    terms: ['字体', 'UI 字体', '界面字体', '侧边栏字体', '系统字体', 'font'],
  },
  {
    id: 'document-font',
    label: '文档字体',
    terms: ['字体', '文档字体', '编辑器字体', '正文字体', '阅读字体', 'font'],
  },
  {
    id: 'code-font',
    label: '代码块字体',
    terms: ['字体', '代码块字体', '等宽字体', 'monospace', 'code font', 'font'],
  },
];

const STORAGE_FIELD_DEFINITIONS = [
  {
    id: 'asset-directory',
    label: '资源目录',
    value: (assetDirectory: string) => assetDirectory,
    terms: ['资源目录', '目录', '路径', '本地', 'assets', '.madora'],
  },
  {
    id: 'asset-url',
    label: '引用格式',
    value: () => '.madora/assets/files/{shard}/{hash}.{ext}',
    terms: ['引用格式', '引用', '格式', 'url', 'assetid', 'madora-asset'],
  },
  {
    id: 'cleanup-policy',
    label: '清理策略',
    value: () => '保存或删除文档时清理未引用资源',
    terms: ['清理策略', '清理', '删除', '孤立资源'],
  },
];

const GIT_SYNC_FIELD_DEFINITIONS = [
  {
    id: 'enabled',
    label: '启用 Git 同步',
    terms: ['启用 Git 同步', '开关', 'Git Sync', 'manage git', 'auto sync'],
  },
  {
    id: 'remote-url',
    label: '远程仓库地址',
    terms: ['远程仓库地址', 'remote url', 'repository', '仓库地址', '跳转'],
  },
  {
    id: 'last-synced',
    label: '上次同步时间',
    terms: ['上次同步时间', 'last synced', '同步时间'],
  },
  {
    id: 'interval',
    label: '同步频率',
    terms: ['同步频率', 'backup interval', 'minutes', '分钟'],
  },
  {
    id: 'conflict-resolution',
    label: '差异处理策略',
    terms: ['差异处理策略', '冲突', '放弃', '本地仓库', '远程仓库'],
  },
  {
    id: 'sync-now',
    label: '立即同步',
    terms: ['立即同步', 'sync now', 'pull', 'push'],
  },
  {
    id: 'remove',
    label: '移除',
    terms: ['移除', 'remove', '关闭管理'],
  },
];

const AI_FIELD_DEFINITIONS = [
  {
    id: 'models',
    label: 'Models',
    terms: [
      'Models',
      '模型',
      '默认模型',
      'Extended Thinking',
      'API Keys',
      '账号',
      '账户',
      'Codex',
      'Claude',
      'Claude Code',
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    terms: ['Skills', '技能', 'commands', 'slash commands'],
  },
  {
    id: 'agents',
    label: 'Custom Agents',
    terms: ['Custom Agents', '自定义代理', 'subagents'],
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    terms: ['MCP Servers', 'MCP', 'tools', '服务器'],
  },
  {
    id: 'plugins',
    label: 'Plugins',
    terms: ['Plugins', '插件', 'marketplace'],
  },
];

const AI_MODEL_OPTIONS = [
  {
    id: 'opus',
    label: 'Opus 4.6',
    provider: 'anthropic' as const,
  },
  {
    id: 'sonnet',
    label: 'Sonnet 4.6',
    provider: 'anthropic' as const,
  },
  {
    extraLabel: 'Extra usage',
    id: 'sonnet-1m',
    label: 'Sonnet 1M 4.6',
    provider: 'anthropic' as const,
  },
  {
    id: 'haiku',
    label: 'Haiku 4.5',
    provider: 'anthropic' as const,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    provider: 'codex' as const,
  },
  {
    id: 'gpt-5.3-codex',
    label: 'Codex 5.3',
    provider: 'codex' as const,
  },
  {
    id: 'gpt-5.2-codex',
    label: 'Codex 5.2',
    provider: 'codex' as const,
  },
  {
    id: 'gpt-5.1-codex-max',
    label: 'Codex 5.1 Max',
    provider: 'codex' as const,
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'Codex 5.1 Mini',
    provider: 'codex' as const,
  },
];

export function WorkspaceSettingsPage({
  header,
  initialSectionId = 'appearance',
  sidebarResize,
  sidebarWidth = 280,
  workspaceRootPath,
  onBack,
  onSettingsSaved,
}: WorkspaceSettingsPageProps) {
  const { setTheme, theme } = useTheme();
  const [settings, setSettings] =
    React.useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeSectionId, setActiveSectionId] =
    React.useState<SettingsSectionId>('appearance');
  const [loadState, setLoadState] = React.useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');
  const [saveState, setSaveState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [detectedAccounts, setDetectedAccounts] = React.useState<
    AiAssistantAccount[]
  >([]);
  const [aiAnthropicAccounts, setAiAnthropicAccounts] = React.useState<
    AiAnthropicAccountItem[]
  >([]);
  const [aiSkills, setAiSkills] = React.useState<AiSkillItem[]>([]);
  const [aiCommands, setAiCommands] = React.useState<AiCommandItem[]>([]);
  const [aiCustomAgents, setAiCustomAgents] = React.useState<
    AiCustomAgentItem[]
  >([]);
  const [aiMcpServers, setAiMcpServers] = React.useState<AiMcpServerItem[]>([]);
  const [aiPlugins, setAiPlugins] = React.useState<AiPluginItem[]>([]);
  const [gitSyncSettings, setGitSyncSettings] =
    React.useState<WorkspaceGitSyncSettings>(DEFAULT_GIT_SYNC_SETTINGS);
  const [gitProbeState, setGitProbeState] = React.useState<GitProbe | null>(
    null,
  );
  const [gitRemoteState, setGitRemoteState] = React.useState<GitRemoteInfo>(
    DEFAULT_GIT_REMOTE_INFO,
  );
  const [gitSyncActionState, setGitSyncActionState] = React.useState<
    'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error'
  >('idle');
  const [gitSyncMessage, setGitSyncMessage] = React.useState<string | null>(
    null,
  );
  const [systemFonts, setSystemFonts] = React.useState<SystemFontOptions>(
    FALLBACK_SYSTEM_FONT_OPTIONS,
  );
  const [searchQuery, setSearchQuery] = React.useState('');
  const assetDirectory = workspaceRootPath
    ? `${workspaceRootPath}/.madora/assets`
    : '打开工作区后使用 .madora/assets';
  const normalizedSearchQuery = normalizeSearchTerm(searchQuery);
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const concreteInitialSectionId = normalizeSettingsSectionId(initialSectionId);
  const preferencesSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    PREFERENCES_SEARCH_TERMS,
  );
  const shouldShowPreferencesSection = !hasSearchQuery || preferencesSectionMatches;
  const appearanceSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    APPEARANCE_SEARCH_TERMS,
  );
  const matchingAppearanceFields = hasSearchQuery
    ? APPEARANCE_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : APPEARANCE_FIELD_DEFINITIONS;
  const shouldShowAppearanceSection =
    !hasSearchQuery ||
    appearanceSectionMatches ||
    matchingAppearanceFields.length > 0;
  const visibleAppearanceFields =
    hasSearchQuery &&
    matchingAppearanceFields.length > 0 &&
    !appearanceSectionMatches
      ? matchingAppearanceFields
      : APPEARANCE_FIELD_DEFINITIONS;
  const storageSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    STORAGE_SEARCH_TERMS,
  );
  const matchingStorageFields = hasSearchQuery
    ? STORAGE_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : STORAGE_FIELD_DEFINITIONS;
  const shouldShowStorageSection =
    !hasSearchQuery || storageSectionMatches || matchingStorageFields.length > 0;
  const visibleStorageFields =
    hasSearchQuery && matchingStorageFields.length > 0 && !storageSectionMatches
      ? matchingStorageFields
      : STORAGE_FIELD_DEFINITIONS;
  const gitSyncSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    GIT_SYNC_SEARCH_TERMS,
  );
  const matchingGitSyncFields = hasSearchQuery
    ? GIT_SYNC_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : GIT_SYNC_FIELD_DEFINITIONS;
  const shouldShowGitSyncSection =
    !hasSearchQuery ||
    gitSyncSectionMatches ||
    matchingGitSyncFields.length > 0;
  const visibleGitSyncFields =
    hasSearchQuery &&
    matchingGitSyncFields.length > 0 &&
    !gitSyncSectionMatches
      ? matchingGitSyncFields
      : GIT_SYNC_FIELD_DEFINITIONS;
  const aiSectionMatches = matchesSearchTerms(
    normalizedSearchQuery,
    AI_SEARCH_TERMS,
  );
  const matchingAiFields = hasSearchQuery
    ? AI_FIELD_DEFINITIONS.filter((field) =>
        matchesSearchTerms(normalizedSearchQuery, [field.label, ...field.terms]),
      )
    : AI_FIELD_DEFINITIONS;
  const shouldShowAiSection =
    !hasSearchQuery || aiSectionMatches || matchingAiFields.length > 0;
  const visibleSections = SETTINGS_SECTIONS.filter((section) => {
    if (isAiSettingsSectionId(section.id) && !AI_SETTINGS_AVAILABLE) {
      return false;
    }

    return section.id === 'appearance'
      ? shouldShowAppearanceSection
      : section.id === 'preferences'
        ? shouldShowPreferencesSection
        : section.id === 'storage'
          ? shouldShowStorageSection
          : section.id === 'git-sync'
            ? shouldShowGitSyncSection
            : shouldShowAiSection;
  });
  const visibleSectionGroups = SETTINGS_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: group.sectionIds
      .map((sectionId) =>
        visibleSections.find((section) => section.id === sectionId),
      )
      .filter((section): section is (typeof SETTINGS_SECTIONS)[number] =>
        Boolean(section),
      ),
  })).filter((group) => group.sections.length > 0);
  const normalizedActiveSectionId = normalizeSettingsSectionId(activeSectionId);
  const activeSection = visibleSections.some(
    (section) => section.id === normalizedActiveSectionId,
  )
    ? normalizedActiveSectionId
    : visibleSections[0]?.id;
  const isAiAuthoringSplitPane =
    activeSection === 'ai-skills' ||
    activeSection === 'ai-agents' ||
    activeSection === 'ai-mcp' ||
    activeSection === 'ai-plugins';

  React.useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setSearchQuery('');
      setActiveSectionId(
        concreteInitialSectionId === 'ai-models' && !AI_SETTINGS_AVAILABLE
          ? 'appearance'
          : concreteInitialSectionId,
      );
      setLoadState('loading');
      setSaveState('idle');
      setErrorMessage(null);

      if (!isTauriRuntime()) {
        setSettings(DEFAULT_APP_SETTINGS);
        setDetectedAccounts([]);
        setAiAnthropicAccounts([]);
        setAiSkills([]);
        setAiCommands([]);
        setAiCustomAgents([]);
        setAiMcpServers([]);
        setAiPlugins([]);
        setGitSyncSettings(DEFAULT_GIT_SYNC_SETTINGS);
        setGitProbeState(null);
        setGitRemoteState(DEFAULT_GIT_REMOTE_INFO);
        setGitSyncActionState('idle');
        setGitSyncMessage(null);
        setSystemFonts(FALLBACK_SYSTEM_FONT_OPTIONS);
        setLoadState('loaded');
        return;
      }

      try {
        const [
          nextSettings,
          workspaceMetadata,
          nextGitProbe,
          nextGitRemote,
          runtimeProfiles,
          nextDetectedAccounts,
          nextAiAnthropicAccounts,
          nextAiSkills,
          nextAiCommands,
          nextAiCustomAgents,
          nextAiMcpServers,
          nextAiPlugins,
          nextSystemFonts,
        ] =
          await Promise.all([
            readAppSettings(),
            workspaceRootPath
              ? ensureWorkspace(workspaceRootPath)
              : Promise.resolve(null),
            workspaceRootPath
              ? Promise.resolve(gitProbe(workspaceRootPath)).catch(() => null)
              : Promise.resolve(null),
            workspaceRootPath
              ? Promise.resolve(gitRemoteInfo(workspaceRootPath)).catch(
                  () => DEFAULT_GIT_REMOTE_INFO,
                )
              : Promise.resolve(DEFAULT_GIT_REMOTE_INFO),
            workspaceRootPath
              ? listAiAgentProfiles(workspaceRootPath)
              : Promise.resolve([]),
            detectAiAccounts(),
            listAiAnthropicAccounts().catch(() => []),
            listAiSkills(workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT).catch(
              () => [],
            ),
            listAiCommands(workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT).catch(
              () => [],
            ),
            listAiCustomAgents(workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT).catch(
              () => [],
            ),
            listAiMcpServers(workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT).catch(
              () => [],
            ),
            listAiPlugins().catch(() => []),
            listSystemFonts().catch(() => FALLBACK_SYSTEM_FONT_OPTIONS),
          ]);

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(nextSettings);

          setSettings(
            mergeRuntimeAiProfiles(normalizedSettings, runtimeProfiles),
          );
          setGitSyncSettings(
            withDefaultGitSyncSettings(workspaceMetadata?.gitSync),
          );
          setAiSkills(nextAiSkills);
          setAiCommands(nextAiCommands);
          setAiCustomAgents(nextAiCustomAgents);
          setAiMcpServers(nextAiMcpServers);
          setAiPlugins(nextAiPlugins);
          setGitProbeState(nextGitProbe);
          setGitRemoteState(nextGitRemote);
          setGitSyncActionState('idle');
          setGitSyncMessage(null);
          setDetectedAccounts(nextDetectedAccounts);
          setAiAnthropicAccounts(nextAiAnthropicAccounts);
          setSystemFonts(mergeSystemFontOptions(nextSystemFonts));
          setLoadState('loaded');
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState('error');
          setErrorMessage(
            error instanceof Error ? error.message : '无法读取应用设置',
          );
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [concreteInitialSectionId, workspaceRootPath]);

  function updatePageWidthMode(pageWidthMode: PageWidthMode) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        pageWidthMode,
      },
    }));
  }

  function updateAppearanceFont(
    fontKey: keyof AppearanceFontSettings,
    fontFamily: string,
  ) {
    setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        fonts: {
          ...current.appearance.fonts,
          [fontKey]: fontFamily,
        },
      },
    }));
  }

  function updateGitSyncSettings(
    updater: (settings: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings,
  ) {
    setGitSyncSettings((current) => withDefaultGitSyncSettings(updater(current)));
    setGitSyncActionState('idle');
    setGitSyncMessage(null);
  }

  function updateHiddenModelIds(modelId: string, enabled: boolean) {
    setSettings((current) => {
      const hiddenModelIds = new Set(current.ai.hiddenModelIds);

      if (enabled) {
        hiddenModelIds.delete(modelId);
      } else {
        hiddenModelIds.add(modelId);
      }

      return {
        ...current,
        ai: {
          ...current.ai,
          hiddenModelIds: Array.from(hiddenModelIds),
        },
      };
    });
  }

  function updateAiSettings(updater: (ai: AppSettings['ai']) => AppSettings['ai']) {
    setSettings((current) => ({
      ...current,
      ai: updater(current.ai),
    }));
  }

  async function refreshAiAuthoringInventory() {
    if (!isTauriRuntime()) {
      return {
        commands: aiCommands,
        skills: aiSkills,
      };
    }

    const rootPath = workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT;
    const [nextAiSkills, nextAiCommands] = await Promise.all([
      listAiSkills(rootPath),
      listAiCommands(rootPath),
    ]);

    setAiSkills(nextAiSkills);
    setAiCommands(nextAiCommands);

    return {
      commands: nextAiCommands,
      skills: nextAiSkills,
    };
  }

  async function refreshAiAnthropicAccounts() {
    if (!isTauriRuntime()) {
      return aiAnthropicAccounts;
    }

    const nextAiAnthropicAccounts = await listAiAnthropicAccounts();

    setAiAnthropicAccounts(nextAiAnthropicAccounts);

    return nextAiAnthropicAccounts;
  }

  async function refreshDetectedAiAccounts() {
    if (!isTauriRuntime()) {
      return detectedAccounts;
    }

    const nextDetectedAccounts = await detectAiAccounts();

    setDetectedAccounts(nextDetectedAccounts);

    return nextDetectedAccounts;
  }

  async function refreshAiCustomAgents() {
    if (!isTauriRuntime()) {
      return aiCustomAgents;
    }

    const nextAiCustomAgents = await listAiCustomAgents(
      workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT,
    );

    setAiCustomAgents(nextAiCustomAgents);

    return nextAiCustomAgents;
  }

  async function refreshAiPlugins() {
    if (!isTauriRuntime()) {
      return aiPlugins;
    }

    const nextAiPlugins = await listAiPlugins();

    setAiPlugins(nextAiPlugins);

    return nextAiPlugins;
  }

  async function refreshAiMcpServers() {
    if (!isTauriRuntime()) {
      return aiMcpServers;
    }

    const nextAiMcpServers = await listAiMcpServers(
      workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT,
    );

    setAiMcpServers(nextAiMcpServers);

    return nextAiMcpServers;
  }

  async function persistGitSyncSettings(
    nextSettings = gitSyncSettings,
  ): Promise<WorkspaceGitSyncSettings> {
    const normalized = withDefaultGitSyncSettings(nextSettings);

    if (!isTauriRuntime() || !workspaceRootPath) {
      setGitSyncSettings(normalized);
      return normalized;
    }

    const saved = await saveWorkspaceGitSyncSettings(
      workspaceRootPath,
      normalized,
    );

    setGitSyncSettings(withDefaultGitSyncSettings(saved));

    return withDefaultGitSyncSettings(saved);
  }

  async function handleGitSyncNow() {
    if (!workspaceRootPath) {
      return;
    }

    setGitSyncActionState('syncing');
    setGitSyncMessage(null);

    try {
      const saved = await persistGitSyncSettings(gitSyncSettings);
      const result = await gitSyncNow(workspaceRootPath, saved.conflictResolution);
      const nextSettings = {
        ...saved,
        lastSyncedAt: result.lastSyncedAt,
      };

      await persistGitSyncSettings(nextSettings);
      setGitSyncActionState('synced');
      setGitSyncMessage(`同步完成：${formatGitSyncTimestamp(result.lastSyncedAt)}`);
    } catch (error) {
      setGitSyncActionState('error');
      setGitSyncMessage(
        error instanceof Error ? error.message : 'Git Sync 同步失败',
      );
    }
  }

  async function handleGitSyncRemove() {
    const nextSettings = {
      ...gitSyncSettings,
      enabled: false,
    };

    setGitSyncActionState('saving');
    setGitSyncMessage(null);

    try {
      await persistGitSyncSettings(nextSettings);
      setGitSyncActionState('saved');
      setGitSyncMessage('已关闭 Git Sync 管理，仓库内容保持不变。');
    } catch (error) {
      setGitSyncActionState('error');
      setGitSyncMessage(
        error instanceof Error ? error.message : '无法关闭 Git Sync',
      );
    }
  }

  async function handleApply() {
    setSaveState('saving');
    setGitSyncActionState('saving');
    setErrorMessage(null);
    setGitSyncMessage(null);

    if (!isTauriRuntime()) {
      setSaveState('saved');
      setGitSyncActionState('saved');
      onSettingsSaved?.(settings);
      return;
    }

    try {
      const [savedSettings] = await Promise.all([
        saveAppSettings(settings),
        persistGitSyncSettings(gitSyncSettings),
      ]);

      setSettings(withDefaultAppSettings(savedSettings));
      onSettingsSaved?.(withDefaultAppSettings(savedSettings));
      setSaveState('saved');
      setGitSyncActionState('saved');
    } catch (error) {
      setSaveState('error');
      setGitSyncActionState('error');
      setErrorMessage(error instanceof Error ? error.message : '无法保存应用设置');
    }
  }

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
          className="h-10 shrink-0"
          data-tauri-drag-region="deep"
        />

        <div className="px-2 pb-2 pr-4">
          <button
            aria-label="返回应用"
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              placeholder="搜索设置"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery ? (
              <button
                aria-label="清空设置搜索"
                className="text-muted-foreground hover:text-foreground"
                type="button"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            ) : null}
          </label>

          <nav aria-label="设置分类" className="space-y-5">
            {visibleSectionGroups.map((group) => (
              <div className="grid gap-1" key={group.id}>
                <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">
                  {group.label}
                </p>
                {group.sections.map((section) => (
                  <button
                    key={section.id}
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
                      activeSection === section.id
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground',
                    )}
                    type="button"
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <SettingsSectionIcon sectionId={section.id} />
                    {section.label}
                  </button>
                ))}
              </div>
            ))}
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
        className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_3px_rgba(15,23,42,0.05),0_18px_42px_-28px_rgba(15,23,42,0.45)]"
        data-testid="workspace-editor-column"
      >
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
          data-chrome="codex-main-surface"
          data-testid="workspace-settings-main-surface"
        >
          {header}

          <div
            className={cn(
              'min-h-0 flex-1',
              isAiAuthoringSplitPane ? 'overflow-hidden' : 'overflow-y-auto',
            )}
          >
            <div
              className={cn(
                isAiAuthoringSplitPane
                  ? 'h-full w-full overflow-hidden'
                  : 'mx-auto w-full max-w-[1120px] px-8 py-10 pb-24',
              )}
              data-testid="workspace-settings-content"
            >
              {activeSection === 'preferences' ? (
                <AiPreferencesSettingsSection
                  settings={settings}
                  onSettingsChange={(nextAiSettings) =>
                    updateAiSettings(() => nextAiSettings)
                  }
                />
              ) : null}

              {activeSection === 'appearance' ? (
                <AppearanceSettingsSection
                  errorMessage={errorMessage}
                  fontOptions={systemFonts}
                  fontSettings={settings.appearance.fonts}
                  pageWidthMode={settings.appearance.pageWidthMode}
                  saveState={saveState}
                  theme={theme ?? 'system'}
                  visibleFields={visibleAppearanceFields.map(
                    (field) => field.id,
                  )}
                  onFontChange={updateAppearanceFont}
                  onPageWidthModeChange={updatePageWidthMode}
                  onThemeChange={setTheme}
                />
              ) : null}

              {activeSection === 'storage' ? (
                <StorageSettingsSection
                  assetDirectory={assetDirectory}
                  errorMessage={errorMessage}
                  saveState={saveState}
                  settings={settings}
                  visibleFields={visibleStorageFields}
                  onStorageProviderChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      schemaVersion: 1,
                      storage: { defaultProvider: value },
                    }))
                  }
                />
              ) : null}

              {activeSection === 'git-sync' ? (
                <GitSyncSettingsSection
                  actionMessage={gitSyncMessage}
                  actionState={gitSyncActionState}
                  gitProbe={gitProbeState}
                  remoteInfo={gitRemoteState}
                  settings={gitSyncSettings}
                  visibleFields={visibleGitSyncFields.map((field) => field.id)}
                  onRemove={() => void handleGitSyncRemove()}
                  onSettingsChange={updateGitSyncSettings}
                  onSyncNow={() => void handleGitSyncNow()}
                />
              ) : null}

              {activeSection === 'ai-models' ? (
                <AiModelsSettingsSection
                  key={`${settings.ai.customClaudeConfig.model}:${settings.ai.customClaudeConfig.baseUrl}`}
                  anthropicAccounts={aiAnthropicAccounts}
                  errorMessage={errorMessage}
                  saveState={saveState}
                  detectedAccounts={detectedAccounts}
                  settings={settings}
                  onAnthropicAccountsRefresh={refreshAiAnthropicAccounts}
                  onDetectedAccountsRefresh={refreshDetectedAiAccounts}
                  onModelVisibilityChange={updateHiddenModelIds}
                  onSettingsChange={(nextAiSettings) =>
                    updateAiSettings(() => nextAiSettings)
                  }
                />
              ) : null}

              {activeSection === 'ai-skills' ? (
                <AiSkillsSettingsSection
                  commands={aiCommands}
                  settingsSidebarWidth={settings.ai.settingsSidebarWidths.skills}
                  skills={aiSkills}
                  workspaceRootPath={workspaceRootPath}
                  onInventoryRefresh={refreshAiAuthoringInventory}
                  onSettingsSidebarWidthChange={(width) =>
                    updateAiSettings((current) => ({
                      ...current,
                      settingsSidebarWidths: {
                        ...current.settingsSidebarWidths,
                        skills: normalizeAiSettingsSidebarWidth(width),
                      },
                    }))
                  }
                />
              ) : null}

              {activeSection === 'ai-agents' ? (
                <AiCustomAgentsSettingsSection
                  agents={aiCustomAgents}
                  settingsSidebarWidth={settings.ai.settingsSidebarWidths.agents}
                  workspaceRootPath={workspaceRootPath}
                  onAgentsRefresh={refreshAiCustomAgents}
                  onSettingsSidebarWidthChange={(width) =>
                    updateAiSettings((current) => ({
                      ...current,
                      settingsSidebarWidths: {
                        ...current.settingsSidebarWidths,
                        agents: normalizeAiSettingsSidebarWidth(width),
                      },
                    }))
                  }
                />
              ) : null}

              {activeSection === 'ai-mcp' ? (
                <AiMcpServersSettingsSection
                  settingsSidebarWidth={settings.ai.settingsSidebarWidths.mcp}
                  servers={aiMcpServers}
                  workspaceRootPath={workspaceRootPath}
                  onServersRefresh={refreshAiMcpServers}
                  onSettingsSidebarWidthChange={(width) =>
                    updateAiSettings((current) => ({
                      ...current,
                      settingsSidebarWidths: {
                        ...current.settingsSidebarWidths,
                        mcp: normalizeAiSettingsSidebarWidth(width),
                      },
                    }))
                  }
                />
              ) : null}

              {activeSection === 'ai-plugins' ? (
                <AiPluginsSettingsSection
                  mcpServers={aiMcpServers}
                  plugins={aiPlugins}
                  settingsSidebarWidth={settings.ai.settingsSidebarWidths.plugins}
                  workspaceRootPath={workspaceRootPath}
                  onMcpServersRefresh={refreshAiMcpServers}
                  onPluginsRefresh={refreshAiPlugins}
                  onNavigateToSection={setActiveSectionId}
                  onSettingsSidebarWidthChange={(width) =>
                    updateAiSettings((current) => ({
                      ...current,
                      settingsSidebarWidths: {
                        ...current.settingsSidebarWidths,
                        plugins: normalizeAiSettingsSidebarWidth(width),
                      },
                    }))
                  }
                />
              ) : null}

              {!activeSection ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                  <Search className="mb-3 text-muted-foreground" size={26} />
                  <h2 className="text-sm font-medium">未找到设置</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    没有匹配“{searchQuery}”的设置项。
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="flex min-h-13 shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
            <Button size="sm" type="button" variant="outline" onClick={onBack}>
              取消
            </Button>
            <Button
              disabled={loadState === 'loading' || saveState === 'saving'}
              size="sm"
              type="button"
              onClick={() => void handleApply()}
            >
              应用
            </Button>
            <Button
              disabled={loadState === 'loading' || saveState === 'saving'}
              size="sm"
              type="button"
              onClick={async () => {
                await handleApply();
                onBack();
              }}
            >
              确定
            </Button>
          </footer>
        </section>
      </div>
    </section>
  );
}

function AppearanceSettingsSection({
  errorMessage,
  fontOptions,
  fontSettings,
  pageWidthMode,
  saveState,
  theme,
  visibleFields,
  onFontChange,
  onPageWidthModeChange,
  onThemeChange,
}: {
  errorMessage: string | null;
  fontOptions: SystemFontOptions;
  fontSettings: AppearanceFontSettings;
  pageWidthMode: PageWidthMode;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  theme: string;
  visibleFields: string[];
  onFontChange: (
    fontKey: keyof AppearanceFontSettings,
    fontFamily: string,
  ) => void;
  onPageWidthModeChange: (pageWidthMode: PageWidthMode) => void;
  onThemeChange: (theme: string) => void;
}) {
  const showTheme = visibleFields.includes('theme');
  const showPageWidth = visibleFields.includes('page-width');
  const showFonts = visibleFields.some((field) =>
    ['ui-font', 'document-font', 'code-font'].includes(field),
  );

  return (
    <div
      className="mx-auto max-w-[1120px] space-y-6 pb-8"
      data-testid="appearance-settings-shell"
    >
      <div>
        <h2 className="text-[15px] font-semibold">外观</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          调整应用主题和编辑器页面宽度。
        </p>
      </div>

      <div className="space-y-6">
        {showTheme ? (
          <section className="rounded-xl bg-muted/30 p-5">
            <h3 className="text-sm font-medium">主题</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              跟随系统会同步当前操作系统外观。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
        ) : null}

        {showPageWidth ? (
          <section className="rounded-xl bg-muted/30 p-5">
            <h3 className="text-sm font-medium">页面宽度</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              控制文档正文宽度，不改变左右侧栏宽度。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <PageWidthPreviewRadioButton
                checked={pageWidthMode === 'standard'}
                label="标准"
                testId="page-width-preview-standard"
                variant="standard"
                onClick={() => onPageWidthModeChange('standard')}
              />
              <PageWidthPreviewRadioButton
                checked={pageWidthMode === 'wide'}
                label="全宽"
                testId="page-width-preview-wide"
                variant="wide"
                onClick={() => onPageWidthModeChange('wide')}
              />
            </div>
          </section>
        ) : null}

        {showFonts ? (
          <section>
            <h3 className="text-sm font-medium">字体</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              分别控制系统界面、文档正文和代码块字体。
            </p>
            <div
              className="mt-4 overflow-hidden rounded-xl bg-muted/30"
              data-testid="appearance-fonts-card"
            >
              {visibleFields.includes('ui-font') ? (
                <FontSettingRow
                  description="侧边栏、工具栏、设置面板等编辑器以外的界面文本。"
                  label="UI 字体"
                  options={fontOptions.ui}
                  sample="Madora · 本地知识库"
                  value={fontSettings.ui}
                  onChange={(value) => onFontChange('ui', value)}
                />
              ) : null}
              {visibleFields.includes('document-font') ? (
                <FontSettingRow
                  description="编辑器和阅览模式中的文章正文。"
                  label="文档字体"
                  options={fontOptions.document}
                  sample="先让它存在，再把它做好。"
                  value={fontSettings.document}
                  onChange={(value) => onFontChange('document', value)}
                />
              ) : null}
              {visibleFields.includes('code-font') ? (
                <FontSettingRow
                  description="代码块、行内代码、快捷键和等宽文本。"
                  label="代码块字体"
                  options={fontOptions.code}
                  sample="const note = markdown;"
                  value={fontSettings.code}
                  onChange={(value) => onFontChange('code', value)}
                />
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              默认搭配优先使用系统原生 UI 字体、中文文章字体和专业等宽代码字体。
            </p>
          </section>
        ) : null}

        <SettingsFeedback
          defaultMessage="当前配置会作为全局外观默认值。"
          errorMessage={errorMessage}
          saveState={saveState}
        />
      </div>
    </div>
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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className="h-9 w-full bg-background/70 transition-[background-color,border-color,box-shadow] hover:border-ring/45 hover:bg-accent/60 hover:text-accent-foreground hover:shadow-sm data-[state=open]:border-ring/60 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:shadow-sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="end"
          className="max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[22rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-1"
          data-testid={`font-select-content-${label}`}
          position="popper"
        >
          {normalizedOptions.map((fontFamily) => (
            <SelectItem
              className="min-h-8 px-2 pr-8 text-sm transition-colors hover:bg-accent/70 hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              key={fontFamily}
              value={fontFamily}
            >
              <span style={{ fontFamily: buildPreviewFontStack(fontFamily) }}>
                {fontFamily}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StorageSettingsSection({
  assetDirectory,
  errorMessage,
  saveState,
  settings,
  visibleFields,
  onStorageProviderChange,
}: {
  assetDirectory: string;
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  settings: AppSettings;
  visibleFields: typeof STORAGE_FIELD_DEFINITIONS;
  onStorageProviderChange: (value: 'local') => void;
}) {
  return (
    <div
      className="mx-auto max-w-[1120px] space-y-6 pb-8"
      data-testid="storage-settings-shell"
    >
      <div>
        <h2 className="text-[15px] font-semibold">存储</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          选择上传资源的默认存储方式。本期仅启用工作区本地存储。
        </p>
      </div>

      <div className="space-y-6">
        <section
          className="rounded-xl bg-muted/30"
          data-testid="storage-provider-card"
        >
          <SettingRow
            description="设置上传资源的默认存储位置。当前版本仅启用工作区本地存储。"
            label="全局存储方式"
            control={
              <Select
                value={settings.storage.defaultProvider}
                onValueChange={(value) =>
                  onStorageProviderChange(value as 'local')
                }
              >
                <SelectTrigger
                  id="storage-provider"
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
                  <SelectItem value="oss" disabled>
                    <span className="flex items-center gap-2">
                      <Cloud size={15} />
                      OSS 存储
                    </span>
                  </SelectItem>
                  <SelectItem value="api" disabled>
                    <span className="flex items-center gap-2">
                      <Server size={15} />
                      自定义 API
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </section>

        <section>
          <div className="mb-2">
            <h3 className="text-sm font-medium">本地存储配置</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              上传文件跟随当前工作区保存，文档中仅写入稳定的资源引用。
            </p>
          </div>

          <div
            className="overflow-hidden rounded-xl bg-muted/30"
            data-testid="storage-local-card"
          >
            {visibleFields.map((field) => (
              <ReadonlyField
                key={field.id}
                label={field.label}
                value={field.value(assetDirectory)}
              />
            ))}
          </div>
        </section>

        <SettingsFeedback
          defaultMessage="当前配置会作为全局上传默认值。"
          errorMessage={errorMessage}
          saveState={saveState}
        />
      </div>
    </div>
  );
}

function GitSyncSettingsSection({
  actionMessage,
  actionState,
  gitProbe,
  remoteInfo,
  settings,
  visibleFields,
  onRemove,
  onSettingsChange,
  onSyncNow,
}: {
  actionMessage: string | null;
  actionState: 'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error';
  gitProbe: GitProbe | null;
  remoteInfo: GitRemoteInfo;
  settings: WorkspaceGitSyncSettings;
  visibleFields: string[];
  onRemove: () => void;
  onSettingsChange: (
    updater: (settings: WorkspaceGitSyncSettings) => WorkspaceGitSyncSettings,
  ) => void;
  onSyncNow: () => void;
}) {
  const gitAvailable = gitProbe?.gitAvailable ?? true;
  const isRepository = gitProbe?.isRepository ?? false;
  const enabled = settings.enabled && gitAvailable;
  const isSyncing = actionState === 'syncing';
  const canSync =
    enabled &&
    isRepository &&
    Boolean(remoteInfo.remoteUrl) &&
    !isSyncing &&
    actionState !== 'saving';
  const showEnabled = visibleFields.includes('enabled');
  const showRemoteUrl = visibleFields.includes('remote-url');
  const showLastSynced = visibleFields.includes('last-synced');
  const showInterval = visibleFields.includes('interval');
  const showConflictResolution = visibleFields.includes('conflict-resolution');
  const showSyncNow = visibleFields.includes('sync-now');
  const showRemove = visibleFields.includes('remove');

  return (
    <div
      className="max-w-[1120px] space-y-6 pb-8"
      data-testid="git-sync-settings-shell"
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Git Sync</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          通过 Git 远程仓库同步当前工作区。
        </p>
      </div>

      <div className="space-y-6">
        {!gitAvailable ? (
          <div className="rounded-xl bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            未检测到本机 Git 命令。安装 Git 后会默认启用 Git Sync。
          </div>
        ) : null}

        {showEnabled ? (
          <section
            className="rounded-xl bg-muted/30"
            data-testid="git-sync-enable-card"
          >
            <SettingRow
              description="显示 Git Sync 控制项，并允许 Madora 提交、拉取和推送这个工作区。"
              label="启用 Git 同步"
              control={
                <PillSwitch
                  checked={enabled}
                  disabled={!gitAvailable}
                  label="启用 Git 同步"
                  onChange={(checked) =>
                    onSettingsChange((current) => ({
                      ...current,
                      enabled: checked,
                    }))
                  }
                />
              }
            />
          </section>
        ) : null}

        {showRemoteUrl || showLastSynced ? (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground">仓库</h3>
            <div
              className="mt-2 overflow-hidden rounded-xl bg-muted/30"
              data-testid="git-sync-repository-card"
            >
              {showRemoteUrl ? (
                <div className="grid gap-3 border-b border-border/60 px-5 py-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                  <span className="text-muted-foreground">远程仓库地址</span>
                  <div className="flex min-w-0 items-center gap-3 sm:justify-end">
                    <code
                      className="min-w-0 break-all font-mono text-sm leading-6 text-foreground sm:text-right"
                      data-testid="git-sync-remote-url"
                    >
                      {remoteInfo.remoteUrl ?? '未检测到 origin remote'}
                    </code>
                    {remoteInfo.webUrl ? (
                      <a
                        aria-label="打开远程仓库"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        href={remoteInfo.webUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {showLastSynced ? (
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
              ) : null}
            </div>
          </section>
        ) : null}

        {showInterval || showConflictResolution || showSyncNow ? (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground">
              同步偏好
            </h3>
            <div
              className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/30"
              data-testid="git-sync-preferences-card"
            >
              {showInterval ? (
                <SettingRow
                  description="自动同步当前工作区的时间间隔。"
                  label="同步频率"
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
                      <SelectContent
                        align="end"
                        avoidCollisions={false}
                        data-testid="git-sync-interval-content"
                        position="popper"
                        side="bottom"
                        sideOffset={4}
                      >
                        {[1, 2, 3, 5, 10, 15, 30, 60].map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {minutes} 分钟
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
              ) : null}

              {showConflictResolution ? (
                <SettingRow
                  description="同步出现差异时选择保留哪一侧。"
                  label="差异处理策略"
                  control={
                    <Select
                      value={settings.conflictResolution}
                      onValueChange={(value) =>
                        onSettingsChange((current) => ({
                          ...current,
                          conflictResolution:
                            value as GitSyncConflictResolution,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label="差异处理策略"
                        className="h-10 w-full min-w-[180px] rounded-lg border-border/80 bg-background/80 sm:w-[180px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="end"
                        avoidCollisions={false}
                        position="popper"
                        side="bottom"
                        sideOffset={4}
                      >
                        <SelectItem value="abort">放弃</SelectItem>
                        <SelectItem value="local">本地仓库</SelectItem>
                        <SelectItem value="remote">远程仓库</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />
              ) : null}

              {showSyncNow ? (
                <SettingRow
                  description="立即提交、拉取并推送当前工作区变更。"
                  label="立即同步"
                  control={
                    <Button
                      className="h-9 rounded-lg"
                      disabled={!canSync}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={onSyncNow}
                    >
                      <RefreshCw
                        className={cn(isSyncing ? 'animate-spin' : null)}
                        data-testid="git-sync-now-icon"
                        size={14}
                      />
                      {isSyncing ? '同步中' : '立即同步'}
                    </Button>
                  }
                />
              ) : null}
            </div>
            {!isRepository && gitAvailable ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                当前工作区还不是 Git 仓库，请先在 Git 面板初始化仓库。
              </p>
            ) : null}
            {isRepository && !remoteInfo.remoteUrl ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                当前仓库未配置 origin remote，配置后才能同步到远程。
              </p>
            ) : null}
          </section>
        ) : null}

        {showRemove ? (
          <section
            className="rounded-xl bg-destructive/5 p-5"
            data-testid="git-sync-danger-zone"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-destructive">移除</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  关闭 Madora 对 Git Sync 的管理，不删除本地 .git 目录和提交历史。
                </p>
                <Button
                  className="mt-3 h-9 rounded-lg"
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={onRemove}
                >
                  <Trash2 size={14} />
                  移除 Git Sync
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <GitSyncFeedback message={actionMessage} state={actionState} />
      </div>
    </div>
  );
}

function mergeRuntimeAiProfiles(
  settings: AppSettings,
  runtimeProfiles: AiAgentProfile[],
): AppSettings {
  const existingProfileIds = new Set(
    settings.ai.profiles.map((profile) => profile.id),
  );
  const runtimeSettingsProfiles = runtimeProfiles
    .filter((profile) => !existingProfileIds.has(profile.id))
    .map((profile) => aiAgentProfileToSettingsProfile(profile));

  return {
    ...settings,
    ai: {
      ...settings.ai,
      profiles: [...settings.ai.profiles, ...runtimeSettingsProfiles],
    },
  };
}

function aiAgentProfileToSettingsProfile(
  profile: AiAgentProfile,
): AiConfiguredProfile {
  return {
    enabled: false,
    id: profile.id,
    isTestRuntime: profile.isTestRuntime,
    kind: profile.kind,
    label: profile.label,
    modelId: profile.modelId,
    modelLabel: profile.modelLabel,
    providerId: profile.providerId,
    providerLabel: profile.providerLabel,
  };
}

function AiPreferencesSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: AppSettings;
  onSettingsChange: (aiSettings: AppSettings['ai']) => void;
}) {
  const aiSettings = settings.ai;
  const [claudeSettingsMessage, setClaudeSettingsMessage] =
    React.useState<string | null>(null);
  const claudeModels = AI_MODEL_OPTIONS.filter(
    (model) => model.provider === 'anthropic',
  );
  const codexThinkingLevels = [
    { label: '低', value: 'low' as const },
    { label: '中', value: 'medium' as const },
    { label: '高', value: 'high' as const },
    { label: '极高', value: 'xhigh' as const },
  ];
  const quickSwitchTargets = [
    { label: 'Workspaces', value: 'workspaces' as const },
    { label: 'Agents', value: 'agents' as const },
  ];
  const autoAdvanceTargets = [
    { label: '前往下一个 workspace', value: 'next' as const },
    { label: '前往上一个 workspace', value: 'previous' as const },
    { label: '关闭 workspace', value: 'close' as const },
  ];
  const editorOptions = AI_PREFERRED_EDITOR_OPTIONS.filter((editor) =>
    ['cursor', 'zed', 'sublime', 'xcode', 'windsurf', 'trae'].includes(
      editor.value,
    ),
  );
  const terminalOptions = AI_PREFERRED_EDITOR_OPTIONS.filter((editor) =>
    ['iterm', 'warp', 'terminal', 'ghostty'].includes(editor.value),
  );
  const vscodeOptions = AI_PREFERRED_EDITOR_OPTIONS.filter((editor) =>
    ['vscode', 'vscode-insiders'].includes(editor.value),
  );
  const jetbrainsOptions = AI_PREFERRED_EDITOR_OPTIONS.filter((editor) =>
    [
      'intellij',
      'webstorm',
      'pycharm',
      'phpstorm',
      'goland',
      'clion',
      'rider',
      'fleet',
      'rustrover',
    ].includes(editor.value),
  );
  const preferredEditorLabel = getAiPreferredEditorLabel(
    aiSettings.preferredEditor,
  );

  function update(next: Partial<AppSettings['ai']>) {
    onSettingsChange({
      ...aiSettings,
      ...next,
    });
  }

  async function handleIncludeCoAuthoredByChange(checked: boolean) {
    update({ includeCoAuthoredBy: checked });
    setClaudeSettingsMessage(null);

    try {
      await setAiClaudeIncludeCoAuthoredBy(checked);
    } catch (error) {
      setClaudeSettingsMessage(
        error instanceof Error
          ? error.message
          : '无法同步 Claude Co-Authored-By 设置。',
      );
    }
  }

  return (
    <div className="space-y-6 p-6" data-testid="ai-preferences-settings-shell">
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <h2
          className="text-sm font-semibold text-foreground"
          data-testid="ai-preferences-settings-title"
        >
          偏好设置
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-preferences-settings-description"
        >
          配置 Claude 的行为和功能
        </p>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <PreferenceRow
          control={
            <PillSwitch
              checked={aiSettings.extendedThinkingEnabled}
              label="启用 Extended Thinking"
              onChange={(checked) => update({ extendedThinkingEnabled: checked })}
            />
          }
          description="使用更多 thinking tokens 进行更深入推理（会消耗更多 credits）。启用后将关闭响应流式输出。"
          label="启用 Extended Thinking"
          testId="ai-preferences-row-extended-thinking"
        />
        <PreferenceRow
          control={
            <Select
              value={aiSettings.defaultAgentMode}
              onValueChange={(value) =>
                update({
                  defaultAgentMode: value as AppSettings['ai']['defaultAgentMode'],
                })
              }
            >
              <SelectTrigger aria-label="默认 Agent 模式" className="w-auto px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="plan">Plan</SelectItem>
              </SelectContent>
            </Select>
          }
          description="新建 agent 使用的模式（Plan = 只读，Agent = 可编辑）"
          label="默认 Agent 模式"
        />
        <PreferenceRow
          control={
            <PillSwitch
              checked={aiSettings.includeCoAuthoredBy}
              label="包含 Co-Authored-By"
              onChange={(checked) => void handleIncludeCoAuthoredByChange(checked)}
            />
          }
          description='为 Claude 创建的 Git commit 添加 "Co-authored-by: Claude"'
          label="包含 Co-Authored-By"
        />
      </section>
      {claudeSettingsMessage ? (
        <p className="text-sm text-destructive">{claudeSettingsMessage}</p>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <PreferenceRow
          control={
            <div className="flex flex-wrap justify-end gap-2">
              {claudeModels.map((model) => (
                <PreferenceSegmentButton
                  active={aiSettings.lastSelectedModelId === model.id}
                  key={model.id}
                  label={model.label}
                  onClick={() => update({ lastSelectedModelId: model.id })}
                />
              ))}
            </div>
          }
          description="新 assistant session 默认使用的 Claude 模型。"
          label="默认 Claude 模型"
        />
        <PreferenceRow
          control={
            <div className="flex flex-wrap justify-end gap-2">
              {codexThinkingLevels.map((thinking) => (
                <PreferenceSegmentButton
                  active={aiSettings.lastSelectedCodexThinking === thinking.value}
                  key={thinking.value}
                  label={thinking.label}
                  onClick={() =>
                    update({ lastSelectedCodexThinking: thinking.value })
                  }
                />
              ))}
            </div>
          }
          description="支持 thinking levels 的模型默认使用的 Codex 推理强度。"
          label="Codex Thinking 强度"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <PreferenceRow
          control={
            <PillSwitch
              checked={aiSettings.desktopNotificationsEnabled}
              label="桌面通知"
              onChange={(checked) =>
                update({ desktopNotificationsEnabled: checked })
              }
            />
          }
          description="当 agent 需要输入或完成工作时显示系统通知"
          label="桌面通知"
        />
        <PreferenceRow
          control={
            <PillSwitch
              checked={aiSettings.soundNotificationsEnabled}
              label="声音通知"
              onChange={(checked) =>
                update({ soundNotificationsEnabled: checked })
              }
            />
          }
          description="当你离开期间 agent 完成工作时播放提示音"
          label="声音通知"
        />
        <PreferenceRow
          control={
            <PillSwitch
              checked={aiSettings.notifyWhenFocused}
              disabled={!aiSettings.desktopNotificationsEnabled}
              label="窗口聚焦时仍通知"
              onChange={(checked) => update({ notifyWhenFocused: checked })}
            />
          }
          description="即使应用窗口处于活动状态也显示通知"
          label="窗口聚焦时仍通知"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <PreferenceRow
          control={
            <Select
              value={aiSettings.ctrlTabTarget}
              onValueChange={(value) =>
                update({ ctrlTabTarget: value as AppSettings['ai']['ctrlTabTarget'] })
              }
            >
              <SelectTrigger aria-label="快速切换" className="w-auto px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quickSwitchTargets.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          description={
            <>
              设置 <InlineKbd>⌃Tab</InlineKbd> 在哪些目标之间切换
            </>
          }
          label="快速切换"
        />
        <PreferenceRow
          control={
            <Select
              value={aiSettings.autoAdvanceTarget}
              onValueChange={(value) =>
                update({
                  autoAdvanceTarget: value as AppSettings['ai']['autoAdvanceTarget'],
                })
              }
            >
              <SelectTrigger aria-label="归档后跳转" className="w-auto px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {autoAdvanceTargets.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          description="归档 workspace 后跳转到哪里"
          label="归档后跳转"
        />
        <PreferenceRow
          control={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`首选 Editor: ${preferredEditorLabel}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  type="button"
                >
                  <PreferredEditorIcon editor={aiSettings.preferredEditor} />
                  <span className="truncate">{preferredEditorLabel}</span>
                  <ChevronDown className="size-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {editorOptions.map((editor) => (
                  <DropdownMenuItem
                    className="flex items-center gap-2"
                    key={editor.value}
                    onClick={() => update({ preferredEditor: editor.value })}
                  >
                    <PreferredEditorIcon editor={editor.value} />
                    <span>{editor.label}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {terminalOptions.map((editor) => (
                  <DropdownMenuItem
                    className="flex items-center gap-2"
                    key={editor.value}
                    onClick={() => update({ preferredEditor: editor.value })}
                  >
                    <PreferredEditorIcon editor={editor.value} />
                    <span>{editor.label}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                    <PreferredEditorGroupIcon group="vscode" />
                    <span>VS Code</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48" sideOffset={6}>
                    {vscodeOptions.map((editor) => (
                      <DropdownMenuItem
                        className="flex items-center gap-2"
                        key={editor.value}
                        onClick={() => update({ preferredEditor: editor.value })}
                      >
                        <PreferredEditorIcon editor={editor.value} />
                        <span>{editor.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                    <PreferredEditorGroupIcon group="jetbrains" />
                    <span>JetBrains</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-[300px] w-48 overflow-y-auto"
                    sideOffset={6}
                  >
                    {jetbrainsOptions.map((editor) => (
                      <DropdownMenuItem
                        className="flex items-center gap-2"
                        key={editor.value}
                        onClick={() => update({ preferredEditor: editor.value })}
                      >
                        <PreferredEditorIcon editor={editor.value} />
                        <span>{editor.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          description="打开 workspace 时默认使用的应用"
          label="首选 Editor"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <PreferenceRow
          control={
            <PillSwitch
              checked={!aiSettings.analyticsOptOut}
              label="共享使用分析"
              onChange={(checked) => update({ analyticsOptOut: !checked })}
            />
          }
          description="共享匿名使用数据，帮助我们改进 Agents。我们只跟踪功能使用和应用性能，不会跟踪你的代码、prompts 或消息，也不会用你的数据训练 AI。"
          label="共享使用分析"
        />
      </section>
    </div>
  );
}

function PreferredEditorIcon({ editor }: { editor: AiPreferredEditor }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="size-4 shrink-0 object-contain"
      data-testid={`preferred-editor-icon-${editor}`}
      height={16}
      src={AI_PREFERRED_EDITOR_ICON_PATHS[editor]}
      unoptimized
      width={16}
    />
  );
}

function PreferredEditorGroupIcon({
  group,
}: {
  group: keyof typeof AI_PREFERRED_EDITOR_GROUP_ICON_PATHS;
}) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="size-4 shrink-0 object-contain"
      height={16}
      src={AI_PREFERRED_EDITOR_GROUP_ICON_PATHS[group]}
      unoptimized
      width={16}
    />
  );
}

function PreferenceRow({
  control,
  description,
  label,
  testId,
}: {
  control: React.ReactNode;
  description: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-6 border-b border-border p-4 last:border-b-0"
      data-testid={testId}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <p className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 justify-end">{control}</div>
    </div>
  );
}

function InlineKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

function PreferenceSegmentButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'h-8 rounded-md border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function AiModelsSettingsSection({
  anthropicAccounts,
  errorMessage,
  saveState,
  detectedAccounts,
  settings,
  onAnthropicAccountsRefresh,
  onDetectedAccountsRefresh,
  onModelVisibilityChange,
  onSettingsChange,
}: {
  anthropicAccounts: AiAnthropicAccountItem[];
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  detectedAccounts: AiAssistantAccount[];
  settings: AppSettings;
  onAnthropicAccountsRefresh: () => Promise<AiAnthropicAccountItem[]>;
  onDetectedAccountsRefresh: () => Promise<AiAssistantAccount[]>;
  onModelVisibilityChange: (modelId: string, enabled: boolean) => void;
  onSettingsChange: (aiSettings: AppSettings['ai']) => void;
}) {
  const [modelSearchQuery, setModelSearchQuery] = React.useState('');
  const [isApiKeysOpen, setIsApiKeysOpen] = React.useState(false);
  const [codexApiKey, setCodexApiKey] = React.useState('');
  const [openAiApiKey, setOpenAiApiKey] = React.useState('');
  const [overrideModel, setOverrideModel] = React.useState(
    settings.ai.customClaudeConfig.model,
  );
  const [overrideBaseUrl, setOverrideBaseUrl] = React.useState(
    settings.ai.customClaudeConfig.baseUrl,
  );
  const [overrideToken, setOverrideToken] = React.useState('');
  const [secretStatuses, setSecretStatuses] = React.useState<
    Record<'anthropic-override' | 'codex' | 'openai', 'configured' | 'missing'>
  >({
    'anthropic-override': 'missing',
    codex: 'missing',
    openai: 'missing',
  });
  const [secretMessage, setSecretMessage] = React.useState<string | null>(null);
  const [codexAccountMessage, setCodexAccountMessage] = React.useState<string | null>(
    null,
  );
  const [isCodexLoggingOut, setIsCodexLoggingOut] = React.useState(false);
  const [codexIntegration, setCodexIntegration] =
    React.useState<CodexIntegrationStatus | null>(null);
  const [isCodexLoginOpen, setIsCodexLoginOpen] = React.useState(false);
  const [codexLoginSession, setCodexLoginSession] =
    React.useState<CodexLoginSession | null>(null);
  const [codexLoginState, setCodexLoginState] = React.useState<
    'idle' | 'running' | 'success' | 'error' | 'cancelled'
  >('idle');
  const [codexLoginError, setCodexLoginError] = React.useState<string | null>(null);
  const [isOpeningCodexUrl, setIsOpeningCodexUrl] = React.useState(false);
  const openedCodexUrlRef = React.useRef<string | null>(null);
  const normalizedQuery = normalizeSearchTerm(modelSearchQuery);
  const hiddenModelIds = new Set(settings.ai.hiddenModelIds);
  const visibleModels = AI_MODEL_OPTIONS.filter((model) =>
    normalizeSearchTerm(model.label).includes(normalizedQuery),
  );
  const detectedAnthropicAccounts = detectedAccounts.filter((account) =>
    isAnthropicAccount(account),
  );
  const codexAccount = detectedAccounts.find((account) => account.id === 'codex');
  const customClaudeConfig = settings.ai.customClaudeConfig;

  React.useEffect(() => {
    let isMounted = true;

    async function refreshSecretStatuses() {
      const entries = await Promise.all(
        (['anthropic-override', 'codex', 'openai'] as const).map(
          async (providerId) => {
            try {
              const status = await getAiProviderSecretStatus(providerId);

              return [providerId, status.status] as const;
            } catch {
              return [providerId, 'missing'] as const;
            }
          },
        ),
      );

      if (!isMounted) {
        return;
      }

      setSecretStatuses(Object.fromEntries(entries) as typeof secretStatuses);
    }

    if (isApiKeysOpen) {
      void refreshSecretStatuses();
    }

    return () => {
      isMounted = false;
    };
  }, [isApiKeysOpen]);

  React.useEffect(() => {
    let isMounted = true;

    async function refresh() {
      try {
        const next = await getCodexIntegration();
        if (isMounted) {
          setCodexIntegration(next);
        }
      } catch {
        if (isMounted) {
          setCodexIntegration(null);
        }
      }
    }

    void refresh();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateCustomClaudeConfig(
    next: Partial<AppSettings['ai']['customClaudeConfig']>,
  ) {
    onSettingsChange({
      ...settings.ai,
      customClaudeConfig: {
        ...settings.ai.customClaudeConfig,
        ...next,
      },
    });
  }

  function persistCompleteCustomClaudeConfig(
    next?: Partial<AppSettings['ai']['customClaudeConfig']>,
  ) {
    const model = (next?.model ?? overrideModel).trim();
    const baseUrl = (next?.baseUrl ?? overrideBaseUrl).trim();

    if (!model || !baseUrl) {
      return;
    }

    updateCustomClaudeConfig({ baseUrl, model });
  }

  async function saveSecret(
    providerId: 'anthropic-override' | 'codex' | 'openai',
    secret: string,
    options?: { clearInput?: () => void },
  ) {
    const trimmed = secret.trim();

    if (!trimmed) {
      return;
    }

    if (providerId === 'codex' && !trimmed.startsWith('sk-')) {
      setSecretMessage("Codex API key 格式无效，key 应以 'sk-' 开头。");
      setCodexApiKey('');
      return;
    }

    if (providerId === 'openai' && !trimmed.startsWith('sk-')) {
      setSecretMessage("OpenAI API key 格式无效，key 应以 'sk-' 开头。");
      return;
    }

    try {
      const status = await saveAiProviderSecret(providerId, trimmed);
      setSecretStatuses((current) => ({
        ...current,
        [providerId]: status.status,
      }));
      options?.clearInput?.();
      if (providerId === 'anthropic-override') {
        persistCompleteCustomClaudeConfig();
      }
      setSecretMessage('API key 已保存。');
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : '无法保存 API key。');
    }
  }

  async function removeSecret(
    providerId: 'anthropic-override' | 'codex' | 'openai',
    options?: { clearInput?: () => void },
  ) {
    try {
      const status = await deleteAiProviderSecret(providerId);
      setSecretStatuses((current) => ({
        ...current,
        [providerId]: status.status,
      }));
      options?.clearInput?.();
      setSecretMessage('API key 已移除。');
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : '无法移除 API key。');
    }
  }

  const refreshCodexIntegrationStatus = React.useCallback(async () => {
    try {
      const next = await getCodexIntegration();
      setCodexIntegration(next);
      return next;
    } catch (error) {
      setCodexAccountMessage(
        error instanceof Error ? error.message : '无法读取 Codex 状态。',
      );
      return null;
    }
  }, []);

  const openCodexUrlOnce = React.useCallback(async (url: string) => {
    if (openedCodexUrlRef.current === url) {
      return;
    }

    openedCodexUrlRef.current = url;
    setIsOpeningCodexUrl(true);
    try {
      await openCodexLoginUrl(url);
    } catch (error) {
      setCodexLoginError(
        error instanceof Error ? error.message : '无法打开 Codex 登录 URL。',
      );
    } finally {
      setIsOpeningCodexUrl(false);
    }
  }, []);

  const handleCodexLoginSession = React.useCallback(async (next: CodexLoginSession) => {
    setCodexLoginSession(next);
    setCodexLoginState(
      next.state === 'success' ||
        next.state === 'error' ||
        next.state === 'cancelled'
        ? next.state
        : 'running',
    );
    setCodexLoginError(next.error || null);

    if (next.url) {
      await openCodexUrlOnce(next.url);
    }

    if (next.state === 'success') {
      const integration = await refreshCodexIntegrationStatus();
      await onDetectedAccountsRefresh();

      if (integration?.isConnected) {
        setCodexAccountMessage('Codex 已连接。');
        setIsCodexLoginOpen(false);
      } else {
        setCodexLoginState('error');
        setCodexLoginError(
          'Codex 登录已完成，但未检测到凭据。请重试。',
        );
      }
    }
  }, [onDetectedAccountsRefresh, openCodexUrlOnce, refreshCodexIntegrationStatus]);

  const refreshCodexLoginSession = React.useCallback(async (sessionId: string) => {
    try {
      const next = await getCodexLoginSession(sessionId);
      await handleCodexLoginSession(next);
    } catch (error) {
      setCodexLoginState('error');
      setCodexLoginError(
        error instanceof Error ? error.message : '无法刷新 Codex 登录状态。',
      );
    }
  }, [handleCodexLoginSession]);

  async function handleStartCodexLogin() {
    setCodexAccountMessage(null);
    setCodexLoginError(null);
    setCodexLoginState('running');
    openedCodexUrlRef.current = null;

    try {
      const integration = await getCodexIntegration();
      setCodexIntegration(integration);
      if (integration.isConnected) {
        setCodexLoginState('success');
        setCodexAccountMessage('Codex 已连接。');
        setIsCodexLoginOpen(false);
        return;
      }

      const session = await startCodexLogin();
      await handleCodexLoginSession(session);
      if (session.state !== 'success') {
        await refreshCodexLoginSession(session.sessionId);
      }
    } catch (error) {
      setCodexLoginState('error');
      setCodexLoginError(
        error instanceof Error
          ? error.message
          : '无法启动 Codex 登录，请重试。',
      );
    }
  }

  async function handleCodexLoginOpenChange(open: boolean) {
    if (!open && codexLoginSession?.sessionId && codexLoginState === 'running') {
      await cancelCodexLogin(codexLoginSession.sessionId).catch(() => undefined);
    }

    if (!open) {
      setCodexLoginSession(null);
      setCodexLoginState('idle');
      setCodexLoginError(null);
      openedCodexUrlRef.current = null;
    }

    setIsCodexLoginOpen(open);
  }

  React.useEffect(() => {
    if (
      !isCodexLoginOpen ||
      !codexLoginSession?.sessionId ||
      codexLoginState !== 'running'
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshCodexLoginSession(codexLoginSession.sessionId);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [
    codexLoginSession?.sessionId,
    codexLoginState,
    isCodexLoginOpen,
    refreshCodexLoginSession,
  ]);

  async function handleCodexLogout() {
    const confirmed = window.confirm('要在这台设备上退出 Codex 吗？');

    if (!confirmed) {
      return;
    }

    setIsCodexLoggingOut(true);
    setCodexAccountMessage(null);

    try {
      await logoutCodexAccount();
      await refreshCodexIntegrationStatus();
      await onDetectedAccountsRefresh();
      setCodexAccountMessage('Codex 已断开连接。');
    } catch (error) {
      setCodexAccountMessage(
        error instanceof Error ? error.message : '无法断开 Codex。',
      );
    } finally {
      setIsCodexLoggingOut(false);
    }
  }

  const isCodexSubscriptionConnected =
    codexIntegration?.state === 'connected_chatgpt';
  const codexSubscriptionStatusText =
    codexIntegration?.state === 'connected_chatgpt'
      ? '已通过 ChatGPT 连接'
      : codexIntegration?.state === 'connected_api_key'
        ? '未连接 subscription'
        : codexIntegration?.state === 'not_logged_in'
          ? '未连接'
          : '状态不可用';

  return (
    <div
      className="mx-auto max-w-[880px] space-y-6 pb-8"
      data-testid="ai-models-settings-shell"
    >
      <div>
        <h2 className="text-[18px] font-semibold">Models</h2>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-background">
        <div
          className="px-1.5 pb-0.5 pt-1.5"
          data-testid="ai-model-search-container"
        >
          <label
            className="flex h-7 items-center gap-1.5 rounded-md bg-muted/50 px-1.5 text-muted-foreground"
            data-testid="ai-model-search-field"
          >
            <Search className="size-4 shrink-0" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="添加或搜索 model"
              type="search"
              value={modelSearchQuery}
              onChange={(event) => setModelSearchQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="divide-y">
          {visibleModels.map((model) => {
            const enabled = !hiddenModelIds.has(model.id);

            return (
              <div
                className="flex items-center justify-between gap-4 px-4 py-3"
                data-testid={`ai-model-row-${model.id}`}
                key={model.id}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="truncate text-sm font-medium"
                    data-testid={`ai-model-label-${model.id}`}
                  >
                    {model.label}
                  </span>
                  {model.provider === 'anthropic' ? (
                    <AccountProviderIcon accountId="claude" />
                  ) : (
                    <AccountProviderIcon accountId="codex" />
                  )}
                  {model.extraLabel ? (
                    <span className="text-xs font-semibold text-amber-500">
                      {model.extraLabel}
                    </span>
                  ) : null}
                </div>
                <PillSwitch
                  checked={enabled}
                  label={`${model.label} 已启用`}
                  onChange={(checked) =>
                    onModelVisibilityChange(model.id, checked)
                  }
                />
              </div>
            );
          })}
          {visibleModels.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              未找到 models
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5">
        <AiModelAnthropicAccountsSection
          accounts={anthropicAccounts}
          detectedAccounts={detectedAnthropicAccounts}
          description="管理你的 Claude API accounts"
          label="Anthropic Accounts"
          onAccountsRefresh={onAnthropicAccountsRefresh}
        />
        <AiModelAccountRow
          account={codexAccount}
          description="管理你的 Codex account"
          label="Codex Account"
          providerId="codex"
        />
        <div className="rounded-md border bg-background px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Codex Subscription</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {codexSubscriptionStatusText}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {isCodexSubscriptionConnected ? (
                <>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                    活跃
                  </span>
                  <button
                    className="text-sm font-semibold hover:text-foreground/80"
                    disabled={isCodexLoggingOut}
                    type="button"
                    onClick={() => void handleCodexLogout()}
                  >
                    {isCodexLoggingOut ? '...' : '退出'}
                  </button>
                </>
              ) : (
                <Button
                  aria-label="连接 Codex"
                  className="h-9 rounded-md"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCodexLoginSession(null);
                    setCodexLoginState('idle');
                    setCodexLoginError(null);
                    openedCodexUrlRef.current = null;
                    setIsCodexLoginOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-3" />
                  连接
                </Button>
              )}
            </div>
          </div>
        </div>
        {isCodexLoginOpen ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
            role="dialog"
          >
            <div className="grid w-full max-w-sm gap-6 rounded-md border bg-background p-6 shadow-lg">
              <div className="grid gap-2 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground text-background">
                  <Terminal className="size-6" />
                </div>
                <h4 className="text-base font-semibold">连接 OpenAI Codex</h4>
                <p className="text-sm text-muted-foreground">
                  连接你的 Codex subscription
                </p>
                {codexLoginSession?.url ? (
                  <button
                    className="text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={isOpeningCodexUrl}
                    type="button"
                    onClick={() => void openCodexUrlOnce(codexLoginSession.url!)}
                  >
                    {isOpeningCodexUrl ? '正在打开...' : '没有打开？点击这里'}
                  </button>
                ) : null}
              </div>
              {codexLoginError ? (
                <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {codexLoginError}
                </p>
              ) : null}
              <Button
                disabled={codexLoginState === 'running'}
                type="button"
                onClick={() => void handleStartCodexLogin()}
              >
                {codexLoginState === 'running' ? '连接中...' : '连接'}
              </Button>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void handleCodexLoginOpenChange(false)}
                >
                  取消
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {codexAccountMessage ? (
          <p className="text-sm text-muted-foreground">{codexAccountMessage}</p>
        ) : null}
        <button
          aria-expanded={isApiKeysOpen}
        aria-label="API Keys"
          className="flex h-10 w-fit items-center gap-2 rounded-md px-1 text-left text-sm font-semibold hover:text-foreground/75"
          type="button"
          onClick={() => setIsApiKeysOpen((current) => !current)}
        >
          <ChevronRight
            className={cn(
              'size-4 transition-transform',
              isApiKeysOpen ? 'rotate-90' : '',
            )}
          />
          API Keys
        </button>
        {isApiKeysOpen ? (
          <div className="grid gap-4">
            <AiModelSecretRow
              description="优先级高于 subscription"
              inputLabel="Codex API Key"
              isConfigured={secretStatuses.codex === 'configured'}
              placeholder="sk-..."
              title="Codex API Key"
              value={codexApiKey}
              onBlur={() => void saveSecret('codex', codexApiKey)}
              onChange={setCodexApiKey}
              onRemove={() =>
                void removeSecret('codex', { clearInput: () => setCodexApiKey('') })
              }
            />
            <AiModelSecretRow
              description="语音转写需要使用（Whisper API）"
              inputLabel="OpenAI API Key"
              isConfigured={secretStatuses.openai === 'configured'}
              placeholder="sk-..."
              title="OpenAI API Key"
              value={openAiApiKey}
              onBlur={() => void saveSecret('openai', openAiApiKey)}
              onChange={setOpenAiApiKey}
              onRemove={() =>
                void removeSecret('openai', {
                  clearInput: () => setOpenAiApiKey(''),
                })
              }
            />
            <section className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold">Override Model</h3>
                {customClaudeConfig.model ||
                customClaudeConfig.baseUrl ||
                secretStatuses['anthropic-override'] === 'configured' ? (
                  <Button
                    className="h-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      updateCustomClaudeConfig({ baseUrl: '', model: '' });
                      setOverrideBaseUrl('');
                      setOverrideModel('');
                      setOverrideToken('');
                      void removeSecret('anthropic-override');
                    }}
                  >
                    重置
                  </Button>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-md border bg-background">
                <AiModelTextRow
                  description="请求时使用的 model identifier"
                  inputLabel="Model name"
                  placeholder="claude-3-7-sonnet-20250219"
                  title="Model name"
                  value={overrideModel}
                  onBlur={() => {
                    if (
                      secretStatuses['anthropic-override'] === 'configured'
                    ) {
                      persistCompleteCustomClaudeConfig();
                    }
                  }}
                  onChange={setOverrideModel}
                />
                <AiModelSecretRow
                  description="ANTHROPIC_AUTH_TOKEN env"
                  inputLabel="API token"
                  isConfigured={
                    secretStatuses['anthropic-override'] === 'configured'
                  }
                  placeholder="sk-ant-..."
                  title="API token"
                  value={overrideToken}
                  onBlur={() =>
                    void saveSecret('anthropic-override', overrideToken, {
                      clearInput: () => setOverrideToken(''),
                    })
                  }
                  onChange={setOverrideToken}
                  onRemove={() =>
                    void removeSecret('anthropic-override', {
                      clearInput: () => setOverrideToken(''),
                    })
                  }
                />
                <AiModelTextRow
                  description="ANTHROPIC_BASE_URL env"
                  inputLabel="Base URL"
                  placeholder="https://api.anthropic.com"
                  title="Base URL"
                  value={overrideBaseUrl}
                  onBlur={() => {
                    if (
                      secretStatuses['anthropic-override'] === 'configured'
                    ) {
                      persistCompleteCustomClaudeConfig();
                    }
                  }}
                  onChange={setOverrideBaseUrl}
                />
              </div>
            </section>
            {secretMessage ? (
              <p className="text-sm text-muted-foreground">{secretMessage}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <SettingsFeedback
        defaultMessage="Models 保存启用状态、默认偏好和非密钥 override 配置；API key 写入系统密钥存储。"
        errorMessage={errorMessage}
        saveState={saveState}
      />
    </div>
  );
}

function AiModelAccountRow({
  account,
  description,
  label,
  providerId,
}: {
  account: AiAssistantAccount | undefined;
  description: string;
  label: string;
  providerId: 'claude' | 'codex';
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{label}</h3>
          {providerId === 'codex' && account?.status === 'connected' ? (
            <AccountStatusBadge status={account.status} />
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {providerId === 'claude' && account?.status !== 'connected' ? (
        <Button className="h-9 rounded-md" size="sm" type="button" variant="outline">
          + 连接
        </Button>
      ) : null}
    </div>
  );
}

function AiModelAnthropicAccountsSection({
  accounts,
  detectedAccounts,
  description,
  label,
  onAccountsRefresh,
}: {
  accounts: AiAnthropicAccountItem[];
  detectedAccounts: AiAssistantAccount[];
  description: string;
  label: string;
  onAccountsRefresh: () => Promise<AiAnthropicAccountItem[]>;
}) {
  const [updatingAccountId, setUpdatingAccountId] = React.useState<string | null>(
    null,
  );
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importDisplayName, setImportDisplayName] = React.useState('');
  const [importEmail, setImportEmail] = React.useState('');
  const [importToken, setImportToken] = React.useState('');
  const [authCode, setAuthCode] = React.useState('');
  const [authFlow, setAuthFlow] = React.useState<
    | { step: 'idle' }
    | { step: 'starting' }
    | {
        step: 'waiting_url';
        sandboxId: string;
        sandboxUrl: string;
        sessionId: string;
      }
    | {
        step: 'has_url';
        oauthUrl: string;
        sandboxId: string;
        sandboxUrl: string;
        sessionId: string;
      }
    | { step: 'submitting'; sandboxUrl: string; sessionId: string }
    | { step: 'error'; message: string }
  >({ step: 'idle' });
  const [message, setMessage] = React.useState<string | null>(null);
  const hasManagedAccounts = accounts.length > 0;

  function resetClaudeAuthFlow() {
    setAuthCode('');
    setAuthFlow({ step: 'idle' });
  }

  async function pollClaudeAuthUrl(flow: {
    sandboxId: string;
    sandboxUrl: string;
    sessionId: string;
  }) {
    try {
      const status = await pollAiClaudeCodeAuthStatus({
        sandboxUrl: flow.sandboxUrl,
        sessionId: flow.sessionId,
      });

      if (status.oauthUrl) {
        setAuthFlow({
          step: 'has_url',
          oauthUrl: status.oauthUrl,
          sandboxId: flow.sandboxId,
          sandboxUrl: flow.sandboxUrl,
          sessionId: flow.sessionId,
        });
        await openAiClaudeCodeOAuthUrl(status.oauthUrl);
        return;
      }

      if (status.state === 'error') {
        setAuthFlow({
          step: 'error',
          message: status.error || '无法获取 OAuth URL',
        });
      }
    } catch (error) {
      setAuthFlow({
        step: 'error',
        message: error instanceof Error ? error.message : '无法获取 OAuth URL',
      });
    }
  }

  React.useEffect(() => {
    if (authFlow.step !== 'waiting_url') {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void pollClaudeAuthUrl(authFlow);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [authFlow]);

  async function handleClaudeConnect() {
    resetClaudeAuthFlow();
    setAuthFlow({ step: 'starting' });
    setMessage(null);

    try {
      const flow = await startAiClaudeCodeAuth();
      setAuthFlow({
        step: 'waiting_url',
        sandboxId: flow.sandboxId,
        sandboxUrl: flow.sandboxUrl,
        sessionId: flow.sessionId,
      });
      await pollClaudeAuthUrl(flow);
    } catch (error) {
      setAuthFlow({
        step: 'error',
        message:
          error instanceof Error
            ? error.message
            : '无法启动认证',
      });
    }
  }

  async function handleSubmitClaudeAuthCode() {
    if (!authCode.trim() || authFlow.step !== 'has_url') {
      return;
    }

    const { sandboxUrl, sessionId } = authFlow;
    setAuthFlow({ step: 'submitting', sandboxUrl, sessionId });
    setMessage(null);

    try {
      await submitAiClaudeCodeAuthCode({
        code: authCode.trim(),
        sandboxUrl,
        sessionId,
      });
      await onAccountsRefresh();
      setIsImportOpen(false);
      resetClaudeAuthFlow();
    } catch (error) {
      setAuthFlow({
        step: 'error',
        message: error instanceof Error ? error.message : '无法提交 authentication code',
      });
    }
  }

  async function handleImportAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = importToken.trim();

    if (!token) {
      setMessage('OAuth token 不能为空。');
      return;
    }

    setIsImporting(true);
    setMessage(null);

    try {
      await importAiAnthropicAccountToken({
        displayName: importDisplayName.trim() || null,
        email: importEmail.trim() || null,
        token,
      });
      await onAccountsRefresh();
      setImportDisplayName('');
      setImportEmail('');
      setImportToken('');
      setIsImportOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法导入 account。');
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSetActive(account: AiAnthropicAccountItem) {
    setUpdatingAccountId(account.id);
    setMessage(null);

    try {
      await setAiAnthropicAccountActive(account.id);
      await onAccountsRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法切换 account。');
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function handleRename(account: AiAnthropicAccountItem) {
    const currentName = account.displayName || 'Anthropic Account';
    const nextName = window.prompt('输入这个 account 的新名称：', currentName);

    if (!nextName?.trim()) {
      return;
    }

    setUpdatingAccountId(account.id);
    setMessage(null);

    try {
      await renameAiAnthropicAccount(account.id, nextName.trim());
      await onAccountsRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法重命名 account。');
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function handleRemove(account: AiAnthropicAccountItem) {
    const accountName = account.displayName || 'this account';
    const confirmed = window.confirm(
      `确定要移除 "${accountName}" 吗？再次使用前需要重新认证。`,
    );

    if (!confirmed) {
      return;
    }

    setUpdatingAccountId(account.id);
    setMessage(null);

    try {
      await deleteAiAnthropicAccount(account.id);
      await onAccountsRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法移除 account。');
    } finally {
      setUpdatingAccountId(null);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-12 items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          className="h-9 rounded-md"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            setMessage(null);
            resetClaudeAuthFlow();
            setIsImportOpen(true);
          }}
        >
          <Plus className="mr-1 size-3" />
          {hasManagedAccounts || detectedAccounts.length > 0 ? '添加' : '连接'}
        </Button>
      </div>
      {isImportOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
          role="dialog"
        >
          {authFlow.step !== 'error' || authFlow.message !== 'manual-import' ? (
            <div className="grid w-full max-w-sm gap-6 rounded-md border bg-background p-6 shadow-lg">
              <div className="grid gap-2 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="size-6" />
                </div>
                <h4 className="text-base font-semibold">Claude Code</h4>
                <p className="text-sm text-muted-foreground">
                  连接你的 Claude Code subscription
                </p>
              </div>
              {authFlow.step === 'has_url' || authFlow.step === 'submitting' ? (
                <div className="grid gap-4">
                  <label
                    className="grid gap-1 text-sm font-medium"
                    htmlFor="claude-code-auth-code"
                  >
                    Authentication code
                    <Input
                      autoFocus
                      className="font-mono text-center"
                      disabled={authFlow.step === 'submitting'}
                      id="claude-code-auth-code"
                      placeholder="粘贴 authentication code..."
                      value={authCode}
                      onChange={(event) => setAuthCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleSubmitClaudeAuthCode();
                        }
                      }}
                    />
                  </label>
                  <Button
                    disabled={!authCode.trim() || authFlow.step === 'submitting'}
                    type="button"
                    onClick={() => void handleSubmitClaudeAuthCode()}
                  >
                    {authFlow.step === 'submitting' ? '...' : '继续'}
                  </Button>
                  {authFlow.step === 'has_url' ? (
                    <p className="text-center text-xs text-muted-foreground">
                      已打开新标签页进行认证。{' '}
                      <button
                        className="underline underline-offset-4 hover:text-foreground"
                        type="button"
                        onClick={() => void openAiClaudeCodeOAuthUrl(authFlow.oauthUrl)}
                      >
                        没有打开？点击这里
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : (
                <Button
                  disabled={
                    authFlow.step === 'starting' || authFlow.step === 'waiting_url'
                  }
                  type="button"
                  onClick={() => void handleClaudeConnect()}
                >
                  {authFlow.step === 'starting' || authFlow.step === 'waiting_url'
                    ? '...'
                    : '连接'}
                </Button>
              )}
              {authFlow.step === 'error' ? (
                <div className="grid gap-3">
                  <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {authFlow.message}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleClaudeConnect()}
                  >
                    重试
                  </Button>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <button
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  type="button"
                  onClick={() => {
                    resetClaudeAuthFlow();
                    setAuthFlow({ step: 'error', message: 'manual-import' });
                  }}
                >
                  手动导入 token
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsImportOpen(false);
                    resetClaudeAuthFlow();
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : null}
          {authFlow.step === 'error' && authFlow.message === 'manual-import' ? (
            <form
              className="grid w-full max-w-md gap-4 rounded-md border bg-background p-5 shadow-lg"
              onSubmit={handleImportAccount}
            >
              <div className="grid gap-1">
                <h4 className="text-base font-semibold">导入 Anthropic Account</h4>
                <p className="text-sm text-muted-foreground">
                  将 OAuth token 存入系统密钥存储，并用于当前 Claude account。
                </p>
              </div>
              <label className="grid gap-1 text-sm font-medium" htmlFor="anthropic-display-name">
                显示名称
                <Input
                  id="anthropic-display-name"
                  placeholder="Work Claude"
                  value={importDisplayName}
                  onChange={(event) => setImportDisplayName(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="anthropic-email">
                Email
                <Input
                  id="anthropic-email"
                  placeholder="you@example.com"
                  type="email"
                  value={importEmail}
                  onChange={(event) => setImportEmail(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="anthropic-oauth-token">
                OAuth token
                <Input
                  autoFocus
                  id="anthropic-oauth-token"
                  type="password"
                  value={importToken}
                  onChange={(event) => setImportToken(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  disabled={isImporting}
                  type="button"
                  variant="ghost"
                  onClick={() => setIsImportOpen(false)}
                >
                  取消
                </Button>
                <Button disabled={isImporting} type="submit">
                  导入 account
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      {hasManagedAccounts ? (
        <div className="divide-y overflow-hidden rounded-md border bg-background">
          {accounts.map((account) => (
            <AiModelAnthropicAccountRow
              account={account}
              disabled={updatingAccountId === account.id}
              key={account.id}
              onRemove={() => void handleRemove(account)}
              onRename={() => void handleRename(account)}
              onSetActive={() => void handleSetActive(account)}
            />
          ))}
        </div>
      ) : detectedAccounts.length > 0 ? (
        <div className="divide-y overflow-hidden rounded-md border bg-background">
          {detectedAccounts.map((account, index) => (
            <AiModelDetectedAnthropicAccountRow
              account={account}
              isActive={index === 0}
              key={account.id}
            />
          ))}
        </div>
      ) : null}
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}

function AiModelAnthropicAccountRow({
  account,
  disabled,
  onRemove,
  onRename,
  onSetActive,
}: {
  account: AiAnthropicAccountItem;
  disabled: boolean;
  onRemove: () => void;
  onRename: () => void;
  onSetActive: () => void;
}) {
  const subtitle =
    account.email ||
    (account.connectedAt
      ? `已连接 ${new Date(account.connectedAt).toLocaleDateString()}`
      : null);
  const displayName = account.displayName || 'Anthropic Account';

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-muted/50">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {displayName}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {account.isActive ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            活跃
          </span>
        ) : (
          <Button
            className="h-7"
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
            onClick={onSetActive}
          >
            切换
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${displayName} 的 account 操作`}
              className="size-7"
              disabled={disabled}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>重命名</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>
              移除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AiModelDetectedAnthropicAccountRow({
  account,
  isActive,
}: {
  account: AiAssistantAccount;
  isActive: boolean;
}) {
  const subtitle =
    account.message || account.version || account.commandPath || account.providerLabel;

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-muted/50">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {account.label || 'Anthropic Account'}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isActive ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            活跃
          </span>
        ) : (
          <Button className="h-7" size="sm" type="button" variant="ghost">
            切换
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${account.label} 的 account 操作`}
              className="size-7"
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>重命名</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              移除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AiModelTextRow({
  description,
  inputLabel,
  onBlur,
  placeholder,
  title,
  value,
  onChange,
}: {
  description: string;
  inputLabel: string;
  onBlur?: () => void;
  placeholder: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <label className="text-sm font-medium" htmlFor={inputLabel}>
          {title}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Input
        aria-label={inputLabel}
        className="w-full font-mono sm:w-80"
        id={inputLabel}
        placeholder={placeholder}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function AiModelSecretRow({
  description,
  inputLabel,
  isConfigured,
  placeholder,
  title,
  value,
  onBlur,
  onChange,
  onRemove,
}: {
  description: string;
  inputLabel: string;
  isConfigured: boolean;
  placeholder: string;
  title: string;
  value: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" htmlFor={inputLabel}>
            {title}
          </label>
          {isConfigured ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              活跃
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-80">
        <Input
          aria-label={inputLabel}
          className="min-w-0 flex-1 font-mono"
          id={inputLabel}
          placeholder={placeholder}
          type="password"
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
        />
        {isConfigured ? (
          <button
            aria-label={`移除 ${inputLabel}`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            type="button"
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AiAuthoringKind = 'command' | 'skill';
type AiWritableSource = 'project' | 'user';

interface AiAuthoringListItem {
  argumentHint?: string | null;
  content: string;
  description: string;
  key: string;
  kind: AiAuthoringKind;
  name: string;
  path: string;
  source: 'plugin' | 'project' | 'user';
}

interface AiAuthoringDraft {
  argumentHint: string;
  content: string;
  description: string;
  kind: AiAuthoringKind;
  name: string;
  source: 'plugin' | 'project' | 'user';
}

function AiSkillsSettingsSection({
  commands,
  settingsSidebarWidth,
  skills,
  workspaceRootPath,
  onInventoryRefresh,
  onSettingsSidebarWidthChange,
}: {
  commands: AiCommandItem[];
  settingsSidebarWidth: number;
  skills: AiSkillItem[];
  workspaceRootPath: string | null;
  onInventoryRefresh: () => Promise<{
    commands: AiCommandItem[];
    skills: AiSkillItem[];
  }>;
  onSettingsSidebarWidthChange: (width: number) => void;
}) {
  const items = React.useMemo(
    () => [
      ...skills.map((skill) => aiAuthoringItemFromSkill(skill)),
      ...commands.map((command) => aiAuthoringItemFromCommand(command)),
    ],
    [commands, skills],
  );
  const [query, setQuery] = React.useState('');
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AiAuthoringDraft>(() =>
    createAiAuthoringDraft('skill'),
  );
  const [isCreating, setIsCreating] = React.useState(false);
  const [actionState, setActionState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [message, setMessage] = React.useState<string | null>(null);
  const [deletingItem, setDeletingItem] =
    React.useState<AiAuthoringListItem | null>(null);
  const [instructionsViewMode, setInstructionsViewMode] = React.useState<
    'editor' | 'preview'
  >('preview');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const selectedItem = items.find((item) => item.key === selectedKey) ?? null;
  const normalizedQuery = normalizeSearchTerm(query);
  const visibleItems = normalizedQuery
    ? items.filter((item) =>
        [
          item.name,
          item.description,
          item.path,
          item.source,
          item.kind,
          item.argumentHint ?? '',
        ]
          .map(normalizeSearchTerm)
          .some((value) => value.includes(normalizedQuery)),
            )
    : items;
  const groupedVisibleItems = groupAiAuthoringItemsBySource(visibleItems);
  const visibleItemKeys = groupedVisibleItems.flatMap((group) =>
    group.items.map((item) => item.key),
  );
  const hasProjectScope = Boolean(workspaceRootPath);
  const projectDisplayName = workspaceRootPath
    ? workspaceRootPath.split('/').filter(Boolean).pop() ?? 'Project'
    : 'Project';
  const aiAuthoringRootPath = workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT;
  const isWritable = draft.source === 'project' || draft.source === 'user';
  const canSave = isWritable && draft.name.trim().length > 0;
  const shouldShowSaveButton =
    isCreating ||
    Boolean(
      selectedItem && isWritable && hasAiAuthoringDraftChanges(draft, selectedItem),
    );

  useSlashFocusSearch(searchInputRef);

  React.useEffect(() => {
    if (isCreating || selectedKey) {
      return;
    }

    if (items[0]) {
      selectAiAuthoringItem(items[0]);
    }
  }, [isCreating, items, selectedKey]);

  function selectAiAuthoringItem(item: AiAuthoringListItem) {
    setSelectedKey(item.key);
    setDraft(aiAuthoringDraftFromItem(item));
    setIsCreating(false);
    setActionState('idle');
    setMessage(null);
    setDeletingItem(null);
    setInstructionsViewMode('preview');
  }

  const {
    containerRef: authoringListRef,
    onKeyDown: authoringListKeyDown,
  } = useSettingsListKeyboardNav({
    items: visibleItemKeys,
    selectedItem: selectedItem?.key ?? null,
    onSelect: (key) => {
      const item = visibleItems.find((candidate) => candidate.key === key);
      if (item) {
        selectAiAuthoringItem(item);
      }
    },
  });

  function startCreate(kind: AiAuthoringKind = 'skill') {
    setSelectedKey(null);
    setDraft(createAiAuthoringDraft(kind));
    setIsCreating(true);
    setActionState('idle');
    setMessage(null);
    setDeletingItem(null);
    setInstructionsViewMode('editor');
  }

  async function handleSave() {
    if (!isWritable || (!workspaceRootPath && draft.source === 'project')) {
      setActionState('error');
      setMessage('打开工作区后才能写入 project AI 设置。');
      return;
    }

    if (!draft.name.trim()) {
      setActionState('error');
      setMessage('Name 不能为空。');
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      const source = draft.source as AiWritableSource;
      if (draft.kind === 'skill') {
        const input = {
          content: draft.content,
          description: draft.description,
          name: draft.name,
          source,
        };

        if (isCreating) {
          await createAiSkill(aiAuthoringRootPath, input);
        } else {
          await updateAiSkill(aiAuthoringRootPath, input);
        }
      } else {
        const input = {
          argumentHint: draft.argumentHint.trim() || null,
          content: draft.content,
          description: draft.description,
          name: draft.name,
          source,
        };

        if (isCreating) {
          await createAiCommand(aiAuthoringRootPath, input);
        } else {
          await updateAiCommand(aiAuthoringRootPath, input);
        }
      }

      const refreshed = await onInventoryRefresh();
      const nextItem = findRefreshedAiAuthoringItem(refreshed, draft);

      if (nextItem) {
        selectAiAuthoringItem(nextItem);
      } else {
        setIsCreating(false);
      }
      setActionState('saved');
      setMessage('已保存。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法保存 AI 设置。');
    }
  }

  async function persistExistingAiAuthoringDraft() {
    if (
      !selectedItem ||
      !isWritable ||
      (!workspaceRootPath && draft.source === 'project')
    ) {
      return;
    }

    if (!draft.name.trim()) {
      setActionState('error');
      setMessage('Name 不能为空。');
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      const source = draft.source as AiWritableSource;
      if (draft.kind === 'skill') {
        await updateAiSkill(aiAuthoringRootPath, {
          content: draft.content,
          description: draft.description,
          name: draft.name,
          source,
        });
      } else {
        await updateAiCommand(aiAuthoringRootPath, {
          argumentHint: draft.argumentHint.trim() || null,
          content: draft.content,
          description: draft.description,
          name: draft.name,
          source,
        });
      }

      await onInventoryRefresh();
      setActionState('saved');
      setMessage('已保存。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法保存 AI 设置。');
    }
  }

  async function handleDelete() {
    if (
      !deletingItem ||
      (!workspaceRootPath && deletingItem.source === 'project')
    ) {
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      const source = deletingItem.source as AiWritableSource;
      if (deletingItem.kind === 'skill') {
        await deleteAiSkill(aiAuthoringRootPath, {
          name: deletingItem.name,
          source,
        });
      } else {
        await deleteAiCommand(aiAuthoringRootPath, {
          name: deletingItem.name,
          source,
        });
      }

      const refreshed = await onInventoryRefresh();
      const nextItems = [
        ...refreshed.skills.map((skill) => aiAuthoringItemFromSkill(skill)),
        ...refreshed.commands.map((command) =>
          aiAuthoringItemFromCommand(command),
        ),
      ];
      if (nextItems[0]) {
        selectAiAuthoringItem(nextItems[0]);
      } else {
        setSelectedKey(null);
        setDraft(createAiAuthoringDraft('skill'));
        setIsCreating(false);
      }
      setDeletingItem(null);
      setActionState('saved');
      setMessage('已删除。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法删除 AI 设置。');
    }
  }

  async function handleAutosave() {
    if (isCreating || !selectedItem || !isWritable || actionState === 'saving') {
      return;
    }

    if (!hasAiAuthoringDraftChanges(draft, selectedItem)) {
      return;
    }

    await persistExistingAiAuthoringDraft();
  }

  async function handleInstructionsViewModeToggle() {
    if (instructionsViewMode === 'editor') {
      await handleAutosave();
      setInstructionsViewMode('preview');
      return;
    }

    setInstructionsViewMode('editor');
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-background"
      data-testid="ai-skills-settings-shell"
    >
      <h2 className="sr-only">Skills</h2>
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r bg-background"
        data-testid="ai-skills-settings-sidebar"
        style={{ width: settingsSidebarWidth }}
      >
        <div
          className="flex shrink-0 items-center gap-1.5 px-2 pt-2"
          data-testid="ai-skills-search-row"
        >
          <label className="min-w-0 flex-1">
            <input
              aria-label="搜索 Skills 和 commands"
              className="h-7 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground/40"
              data-testid="ai-skills-search-input"
              placeholder="搜索 Skills 和 commands..."
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={authoringListKeyDown}
            />
          </label>
          <button
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            title="新建 Skill 或 command"
            type="button"
            onClick={() => startCreate()}
          >
            +
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2 outline-none"
          ref={authoringListRef}
          tabIndex={-1}
          onKeyDown={authoringListKeyDown}
        >
          {visibleItems.length > 0 ? (
            <div className="space-y-3">
              {groupedVisibleItems.map((group) => (
                <div key={group.source}>
                  <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {formatAiSourceGroupLabel(group.source)}
                  </p>
                  <div className="grid gap-1">
                    {group.items.map((item) => (
                      <button
                        aria-current={
                          selectedKey === item.key ? 'true' : undefined
                        }
                        className={cn(
                          'min-w-0 rounded-md px-2 py-1.5 text-left transition-colors',
                          selectedKey === item.key
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                        )}
                        data-item-id={item.key}
                        key={item.key}
                        type="button"
                        onClick={() => selectAiAuthoringItem(item)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'w-3 shrink-0 text-center text-[10px] font-medium',
                              item.kind === 'command'
                                ? 'text-orange-500/70'
                                : 'text-blue-500/70',
                            )}
                          >
                            {item.kind === 'skill' ? '@' : '/'}
                          </span>
                          <span className="truncate text-sm">{item.name}</span>
                        </div>
                        {item.description ? (
                          <p className="mt-0.5 truncate pl-[18px] text-[11px] text-muted-foreground/70">
                            {item.description}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <SkillIconFilled
                aria-hidden="true"
                className="mb-3 size-8 text-border"
                data-testid="skills-empty-sidebar-icon"
              />
              <p className="mb-2 text-sm text-muted-foreground">
                暂无 Skills 或 commands
              </p>
              <Button
                className="h-8"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => startCreate()}
              >
                <Plus className="mr-1.5 size-3.5" />
                新建
              </Button>
            </div>
          ) : (
            <EmptyInventory label="未找到结果" />
          )}
        </div>
      </aside>

      <WorkspaceResizeHandle
        aria-label="调整 Skills 设置列表宽度"
        className="-mx-1"
        direction="left"
        max={400}
        min={200}
        value={settingsSidebarWidth}
        onResize={onSettingsSidebarWidthChange}
      />

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {!isCreating && !selectedItem ? (
          <div className="flex min-h-[500px] flex-col items-center justify-center px-4 text-center">
            <SkillIconFilled
              aria-hidden="true"
              className="mb-4 size-12 text-border"
              data-testid="skills-empty-detail-icon"
            />
            <p className="text-sm text-muted-foreground">
              未找到 Skills 或 commands
            </p>
            <Button
              className="mt-3 h-8"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => startCreate()}
            >
              <Plus className="mr-1.5 size-3.5" />
              新建第一个 Skill 或 command
            </Button>
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto"
            data-testid="ai-skills-detail-shell"
          >
            <div
              className="mx-auto max-w-2xl space-y-5 p-6"
              data-testid="ai-skills-detail-inner"
            >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {isCreating
                      ? draft.kind === 'skill'
                        ? '新建 Skill'
                        : '新建 Command'
                      : draft.name || 'Skills'}
                  </h3>
                  {!isCreating ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {draft.kind === 'skill' ? 'Skill' : 'Command'}
                    </span>
                  ) : null}
                </div>
                {!isCreating ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {selectedItem?.path || '选择一项或新建一项。'}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4">
          {isCreating ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">类型</span>
              <Select
                value={draft.kind}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    kind: value as AiAuthoringKind,
                  }))
                }
              >
                <SelectTrigger aria-label="类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skill">
                    Skill（通过 @mention 引用）
                  </SelectItem>
                  <SelectItem value="command">
                    Command（通过 /slash 触发）
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : null}

          {isCreating && hasProjectScope ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">Scope</span>
              <Select
                value={draft.source}
                onValueChange={(source) =>
                  setDraft((current) => ({
                    ...current,
                    source: source as AiWritableSource,
                  }))
                }
              >
                <SelectTrigger aria-label="Scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    {draft.kind === 'skill'
                      ? 'User (~/.claude/skills/)'
                      : 'User (~/.claude/commands/)'}
                  </SelectItem>
                  <SelectItem value="project">
                    {draft.kind === 'skill'
                      ? `Project: ${projectDisplayName} (.claude/skills/)`
                      : `Project: ${projectDisplayName} (.claude/commands/)`}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Name</span>
            <Input
              aria-label="Name"
              disabled={!isCreating || !isWritable}
              placeholder={draft.kind === 'skill' ? 'my-skill' : 'my-command'}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            {isCreating ? (
              <span className="text-[11px] text-muted-foreground">
                会转换为 kebab-case（小写字母、数字和连字符）
              </span>
            ) : null}
          </label>

          {isWritable ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">描述</span>
              <Input
                aria-label="描述"
                placeholder={
                  draft.kind === 'skill'
                    ? '这个 Skill 的用途...'
                    : '这个 command 的用途...'
                }
                value={draft.description}
                onBlur={() => void handleAutosave()}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
          ) : (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">描述</span>
              <p
                className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
                data-testid="ai-skills-readonly-description"
              >
                {draft.description || (
                  <span className="text-muted-foreground">暂无描述</span>
                )}
              </p>
            </div>
          )}

          {draft.kind === 'command' ? (
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">参数提示</span>
              <Input
                aria-label="参数提示"
                disabled={!isWritable}
                placeholder="<message>"
                value={draft.argumentHint}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    argumentHint: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          {!isCreating ? (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">用法</span>
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <code className="text-sm">
                  {draft.kind === 'skill' ? `@${draft.name}` : `/${draft.name}`}
                </code>
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Instructions</span>
              {!isCreating && isWritable ? (
                <Button
                  aria-label={
                    instructionsViewMode === 'preview'
                      ? '编辑 markdown'
                      : '预览 markdown'
                  }
                  className="size-8 p-0"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void handleInstructionsViewModeToggle()}
                >
                  <Pencil size={14} />
                </Button>
              ) : null}
            </div>
            {!isCreating && instructionsViewMode === 'preview' ? (
              <div
                className={cn(
                  'min-h-[120px] rounded-lg border bg-background px-4 py-3 text-sm leading-6 transition-colors',
                  isWritable
                    ? 'cursor-pointer hover:border-foreground/20'
                    : 'cursor-default',
                )}
                role={isWritable ? 'button' : undefined}
                tabIndex={isWritable ? 0 : undefined}
                onClick={() => {
                  if (isWritable) {
                    setInstructionsViewMode('editor');
                  }
                }}
                onKeyDown={(event) => {
                  if (!isWritable) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setInstructionsViewMode('editor');
                  }
                }}
              >
                {draft.content ? (
                  <AiSettingsMarkdownPreview content={draft.content} />
                ) : (
                  <span className="text-muted-foreground">暂无 instructions</span>
                )}
              </div>
            ) : (
              <textarea
                aria-label="Instructions"
                className="min-h-[260px] resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isWritable}
                placeholder={
                  draft.kind === 'skill'
                    ? 'Skill instructions（markdown）...'
                    : 'Command prompt（markdown）...'
                }
                rows={isCreating ? 12 : 16}
                value={draft.content}
                onBlur={() => void handleAutosave()}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
              />
            )}
          </div>

          {selectedItem?.source === 'plugin' ? (
            <p className="text-sm text-muted-foreground">
              Plugin 提供的 Skills 和 commands 在这里为只读。
            </p>
          ) : null}

          {!isCreating && selectedItem && isWritable ? (
            <div
              className="border-t border-border pt-2"
              data-testid="ai-skills-delete-row"
            >
              <Button
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={actionState === 'saving'}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setDeletingItem(selectedItem)}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                {draft.kind === 'skill' ? '删除 Skill' : '删除 command'}
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <p
              className={cn(
                'text-sm',
                actionState === 'error'
                  ? 'text-destructive'
                  : 'text-muted-foreground',
              )}
            >
              {message ?? '更改会写入 Claude-compatible files。'}
            </p>
            {shouldShowSaveButton ? (
              <Button
                disabled={!canSave || actionState === 'saving'}
                type="button"
                onClick={() => void handleSave()}
              >
                {actionState === 'saving'
                  ? isCreating
                    ? '创建中...'
                    : '保存中...'
                  : isCreating
                    ? '新建'
                    : '保存'}
              </Button>
            ) : null}
          </div>
            </div>
          </div>
          </div>
        )}
      </section>
      <ConfirmAiSettingsDeleteDialog
        description={`确定要删除 ${deletingItem?.kind === 'skill' ? 'Skill' : 'command'} "${deletingItem?.name ?? ''}" 吗？此操作无法撤销。`}
        disabled={actionState === 'saving'}
        open={Boolean(deletingItem)}
        title={`删除 ${deletingItem?.kind === 'skill' ? 'Skill' : 'command'}`}
        onConfirm={() => void handleDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingItem(null);
          }
        }}
      />
    </div>
  );
}

function aiAuthoringItemFromSkill(skill: AiSkillItem): AiAuthoringListItem {
  return {
    content: skill.content,
    description: skill.description,
    key: `skill:${skill.source}:${skill.name}:${skill.path}`,
    kind: 'skill',
    name: skill.name,
    path: skill.path,
    source: skill.source,
  };
}

function aiAuthoringItemFromCommand(
  command: AiCommandItem,
): AiAuthoringListItem {
  return {
    argumentHint: command.argumentHint,
    content: command.content,
    description: command.description,
    key: `command:${command.source}:${command.name}:${command.path}`,
    kind: 'command',
    name: command.name,
    path: command.path,
    source: command.source,
  };
}

function createAiAuthoringDraft(kind: AiAuthoringKind): AiAuthoringDraft {
  return {
    argumentHint: '',
    content: '',
    description: '',
    kind,
    name: '',
    source: 'user',
  };
}

function aiAuthoringDraftFromItem(item: AiAuthoringListItem): AiAuthoringDraft {
  return {
    argumentHint: item.argumentHint ?? '',
    content: item.content,
    description: item.description,
    kind: item.kind,
    name: item.name,
    source: item.source,
  };
}

function AiSettingsMarkdownPreview({ content }: { content: string }) {
  return (
    <div
      className="ai-settings-markdown-preview"
      data-testid="ai-settings-markdown-preview"
    >
      <MarkweaveEditor
        ariaLabel="Markdown 预览"
        content={content}
        contentFormat="markdown"
        editable={false}
        innerToc={false}
        lang="zh"
        mode="view"
      />
    </div>
  );
}

function hasAiAuthoringDraftChanges(
  draft: AiAuthoringDraft,
  item: AiAuthoringListItem,
) {
  return (
    draft.content !== item.content ||
    draft.description !== item.description ||
    draft.argumentHint !== (item.argumentHint ?? '')
  );
}

function findRefreshedAiAuthoringItem(
  refreshed: {
    commands: AiCommandItem[];
    skills: AiSkillItem[];
  },
  draft: AiAuthoringDraft,
) {
  const normalizedName = normalizeAiAuthoringName(draft.name);

  if (draft.kind === 'skill') {
    return refreshed.skills
      .map((skill) => aiAuthoringItemFromSkill(skill))
      .find(
        (item) =>
          item.source === draft.source &&
          normalizeAiAuthoringName(item.name) === normalizedName,
      );
  }

  return refreshed.commands
    .map((command) => aiAuthoringItemFromCommand(command))
    .find(
      (item) =>
        item.source === draft.source &&
        normalizeAiAuthoringName(item.name) === normalizedName,
    );
}

function normalizeAiAuthoringName(name: string) {
  return name.trim().replace(/[\\/:]+/g, ':').toLowerCase();
}

function groupAiAuthoringItemsBySource(items: AiAuthoringListItem[]) {
  return groupAiSettingsItemsBySource(items, (item) => item.source);
}

function groupAiCustomAgentsBySource(items: AiCustomAgentItem[]) {
  return groupAiSettingsItemsBySource(items, (item) => item.source);
}

function groupAiSettingsItemsBySource<T>(
  items: T[],
  getSource: (item: T) => string,
) {
  return (['user', 'project', 'plugin'] as const)
    .map((source) => ({
      items: items.filter((item) => getSource(item) === source),
      source,
    }))
    .filter((group) => group.items.length > 0);
}

function formatAiSourceGroupLabel(source: 'plugin' | 'project' | 'user') {
  switch (source) {
    case 'plugin':
      return 'Plugin';
    case 'project':
      return 'Project';
    case 'user':
      return 'User';
  }
}

interface AiCustomAgentDraft {
  description: string;
  disallowedTools: string;
  model: 'haiku' | 'inherit' | 'opus' | 'sonnet';
  name: string;
  prompt: string;
  source: 'plugin' | 'project' | 'user';
  tools: string;
}

type AiCustomAgentToolMode = 'all' | 'allowlist' | 'denylist';

const AI_CUSTOM_AGENT_TOOL_CATEGORIES = [
  {
    id: 'file',
    name: '文件操作',
    tools: [
      { description: '读取文件内容', id: 'Read', name: '读取文件' },
      { description: '创建或覆盖文件', id: 'Write', name: '写入文件' },
      { description: '进行精确编辑', id: 'Edit', name: '编辑文件' },
      { description: '按 pattern 查找文件', id: 'Glob', name: 'Glob Pattern' },
      { description: '搜索文件内容', id: 'Grep', name: '搜索内容' },
      {
        description: '编辑 Jupyter notebooks',
        id: 'NotebookEdit',
        name: 'Notebook Edit',
      },
    ],
  },
  {
    id: 'system',
    name: 'System',
    tools: [
      { description: '执行 shell commands', id: 'Bash', name: 'Bash Commands' },
      { description: '启动专用 agents', id: 'Task', name: '启动 Subagent' },
    ],
  },
  {
    id: 'web',
    name: 'Web',
    tools: [
      { description: '搜索互联网', id: 'WebSearch', name: 'Web Search' },
      { description: '获取网页内容', id: 'WebFetch', name: 'Fetch URL' },
    ],
  },
  {
    id: 'planning',
    name: 'Planning',
    tools: [
      { description: '管理任务列表', id: 'TodoWrite', name: 'Todo List' },
      {
        description: '提出澄清问题',
        id: 'AskUserQuestion',
        name: 'Ask User',
      },
    ],
  },
] as const;

function AiCustomAgentsSettingsSection({
  agents,
  settingsSidebarWidth,
  workspaceRootPath,
  onAgentsRefresh,
  onSettingsSidebarWidthChange,
}: {
  agents: AiCustomAgentItem[];
  settingsSidebarWidth: number;
  workspaceRootPath: string | null;
  onAgentsRefresh: () => Promise<AiCustomAgentItem[]>;
  onSettingsSidebarWidthChange: (width: number) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<AiCustomAgentDraft>(() =>
    createCustomAgentDraft(),
  );
  const [toolMode, setToolMode] =
    React.useState<AiCustomAgentToolMode>('all');
  const [isCreating, setIsCreating] = React.useState(false);
  const [actionState, setActionState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [message, setMessage] = React.useState<string | null>(null);
  const [deletingAgent, setDeletingAgent] =
    React.useState<AiCustomAgentItem | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearchTerm(query);
  const visibleAgents = normalizedQuery
    ? agents.filter((agent) =>
        [
          agent.name,
          agent.description,
          agent.prompt,
          agent.path,
          agent.model ?? 'inherit',
          agent.source,
          agent.tools.join(', '),
          agent.disallowedTools.join(', '),
        ]
          .map(normalizeSearchTerm)
          .some((value) => value.includes(normalizedQuery)),
            )
    : agents;
  const groupedVisibleAgents = groupAiCustomAgentsBySource(visibleAgents);
  const visibleAgentKeys = groupedVisibleAgents.flatMap((group) =>
    group.items.map(customAgentKey),
  );
  const selectedAgent =
    agents.find((agent) => customAgentKey(agent) === selectedKey) ?? null;
  const hasProjectScope = Boolean(workspaceRootPath);
  const customAgentsRootPath = workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT;
  const isWritable = draft.source === 'project' || draft.source === 'user';
  const canSave =
    isWritable &&
    (!isCreating || draft.name.trim().length > 0);
  const shouldShowSaveButton =
    isCreating ||
    Boolean(
      selectedAgent && isWritable && hasCustomAgentDraftChanges(draft, selectedAgent),
    );

  useSlashFocusSearch(searchInputRef);

  React.useEffect(() => {
    if (isCreating || selectedKey) {
      return;
    }

    if (agents[0]) {
      selectAgent(agents[0]);
    }
  }, [agents, isCreating, selectedKey]);

  function selectAgent(agent: AiCustomAgentItem) {
    setSelectedKey(customAgentKey(agent));
    const nextDraft = customAgentDraftFromAgent(agent);
    setDraft(nextDraft);
    setToolMode(getCustomAgentToolMode(nextDraft));
    setIsCreating(false);
    setActionState('idle');
    setMessage(null);
    setDeletingAgent(null);
  }

  const {
    containerRef: agentsListRef,
    onKeyDown: agentsListKeyDown,
  } = useSettingsListKeyboardNav({
    items: visibleAgentKeys,
    selectedItem: selectedAgent ? customAgentKey(selectedAgent) : null,
    onSelect: (key) => {
      const agent = visibleAgents.find(
        (candidate) => customAgentKey(candidate) === key,
      );
      if (agent) {
        selectAgent(agent);
      }
    },
  });

  function startCreate() {
    setSelectedKey(null);
    setDraft(createCustomAgentDraft());
    setToolMode('all');
    setIsCreating(true);
    setActionState('idle');
    setMessage(null);
    setDeletingAgent(null);
  }

  async function handleSave() {
    if (!isWritable || (!workspaceRootPath && draft.source === 'project')) {
      setActionState('error');
      setMessage('打开工作区后才能写入 project custom agent。');
      return;
    }

    if (!draft.name.trim()) {
      setActionState('error');
      setMessage('Name 不能为空。');
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      const input = {
        description: draft.description,
        disallowedTools: parseCommaSeparatedList(draft.disallowedTools),
        model: draft.model,
        name: draft.name,
        prompt: draft.prompt,
        source: draft.source as AiWritableSource,
        tools: parseCommaSeparatedList(draft.tools),
      };

      if (isCreating) {
        await createAiCustomAgent(customAgentsRootPath, input);
      } else {
        await updateAiCustomAgent(customAgentsRootPath, input);
      }

      const refreshed = await onAgentsRefresh();
      const nextAgent = refreshed.find(
        (agent) =>
          agent.source === draft.source &&
          normalizeAiAuthoringName(agent.name) ===
            normalizeAiAuthoringName(draft.name),
      );

      if (nextAgent) {
        selectAgent(nextAgent);
      } else {
        setIsCreating(false);
      }
      setActionState('saved');
      setMessage('已保存。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法保存 custom agent。');
    }
  }

  async function persistExistingCustomAgentDraft(
    nextDraft: AiCustomAgentDraft = draft,
  ) {
    if (
      !selectedAgent ||
      !isWritable ||
      (!workspaceRootPath && nextDraft.source === 'project')
    ) {
      return;
    }

    if (!nextDraft.name.trim()) {
      setActionState('error');
      setMessage('Name 不能为空。');
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      await updateAiCustomAgent(customAgentsRootPath, {
        description: nextDraft.description,
        disallowedTools: parseCommaSeparatedList(nextDraft.disallowedTools),
        model: nextDraft.model,
        name: nextDraft.name,
        prompt: nextDraft.prompt,
        source: nextDraft.source as AiWritableSource,
        tools: parseCommaSeparatedList(nextDraft.tools),
      });
      await onAgentsRefresh();
      setActionState('saved');
      setMessage('已保存。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法保存 custom agent。');
    }
  }

  async function handleAutosave(nextDraft: AiCustomAgentDraft = draft) {
    if (
      isCreating ||
      !selectedAgent ||
      !isWritable ||
      actionState === 'saving'
    ) {
      return;
    }

    if (!hasCustomAgentDraftChanges(nextDraft, selectedAgent)) {
      return;
    }

    await persistExistingCustomAgentDraft(nextDraft);
  }

  async function handleDelete() {
    if (
      !deletingAgent ||
      (!workspaceRootPath && deletingAgent.source === 'project')
    ) {
      return;
    }

    setActionState('saving');
    setMessage(null);

    try {
      await deleteAiCustomAgent(customAgentsRootPath, {
        name: deletingAgent.name,
        source: deletingAgent.source as AiWritableSource,
      });
      const refreshed = await onAgentsRefresh();

      if (refreshed[0]) {
        selectAgent(refreshed[0]);
      } else {
        setSelectedKey(null);
        setDraft(createCustomAgentDraft());
        setToolMode('all');
        setIsCreating(false);
      }
      setDeletingAgent(null);
      setActionState('saved');
      setMessage('已删除。');
    } catch (error) {
      setActionState('error');
      setMessage(error instanceof Error ? error.message : '无法删除 custom agent。');
    }
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-background"
      data-testid="ai-agents-settings-shell"
    >
      <h2 className="sr-only">Custom Agents</h2>
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r bg-background"
        data-testid="ai-agents-settings-sidebar"
        style={{ width: settingsSidebarWidth }}
      >
        <div
          className="flex shrink-0 items-center gap-1.5 px-2 pt-2"
          data-testid="ai-agents-search-row"
        >
          <label className="min-w-0 flex-1">
            <input
              aria-label="搜索 Agents"
              className="h-7 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground/40"
              data-testid="ai-agents-search-input"
              placeholder="搜索 Agents..."
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={agentsListKeyDown}
            />
          </label>
          <button
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            title="新建 Agent"
            type="button"
            onClick={startCreate}
          >
            +
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2 outline-none"
          ref={agentsListRef}
          tabIndex={-1}
          onKeyDown={agentsListKeyDown}
        >
          {visibleAgents.length > 0 ? (
            <div className="space-y-3">
              {groupedVisibleAgents.map((group) => (
                <div key={group.source}>
                  <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {formatAiSourceGroupLabel(group.source)}
                  </p>
                  <div className="grid gap-1">
                    {group.items.map((agent) => (
                      <button
                        aria-current={
                          selectedKey === customAgentKey(agent)
                            ? 'true'
                            : undefined
                        }
                        className={cn(
                          'min-w-0 rounded-md px-2 py-1.5 text-left transition-colors',
                          selectedKey === customAgentKey(agent)
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                        )}
                        data-item-id={customAgentKey(agent)}
                        key={customAgentKey(agent)}
                        type="button"
                        onClick={() => selectAgent(agent)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {agent.name}
                          </span>
                          {agent.model && agent.model !== 'inherit' ? (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {agent.model}
                            </span>
                          ) : null}
                        </div>
                        {agent.description ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                            {agent.description}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <CustomAgentIconFilled
                aria-hidden="true"
                className="mb-3 size-8 text-border"
                data-testid="agents-empty-sidebar-icon"
              />
              <p className="mb-2 text-sm text-muted-foreground">暂无 Agents</p>
              <Button
                className="h-8"
                size="sm"
                type="button"
                variant="outline"
                onClick={startCreate}
              >
                <Plus className="mr-1.5 size-3.5" />
                新建 Agent
              </Button>
            </div>
          ) : (
            <EmptyInventory label="未找到结果" />
          )}
        </div>
      </aside>

      <WorkspaceResizeHandle
        aria-label="调整 Custom Agents 设置列表宽度"
        className="-mx-1"
        direction="left"
        max={400}
        min={200}
        value={settingsSidebarWidth}
        onResize={onSettingsSidebarWidthChange}
      />

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {!isCreating && !selectedAgent ? (
          <div className="flex min-h-[500px] flex-col items-center justify-center px-4 text-center">
            <CustomAgentIconFilled
              aria-hidden="true"
              className="mb-4 size-12 text-border"
              data-testid="agents-empty-detail-icon"
            />
            <p className="text-sm text-muted-foreground">
              未找到 Custom Agents
            </p>
            <Button
              className="mt-3 h-8"
              size="sm"
              type="button"
              variant="outline"
              onClick={startCreate}
            >
              <Plus className="mr-1.5 size-3.5" />
              新建第一个 Agent
            </Button>
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto"
            data-testid="ai-agents-detail-shell"
          >
            <div
              className="mx-auto max-w-2xl space-y-5 p-6"
              data-testid="ai-agents-detail-inner"
            >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {isCreating ? '新建 Agent' : draft.name || 'Custom Agents'}
                  </h3>
                  {!isCreating ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Agent
                    </span>
                  ) : null}
                </div>
                {!isCreating ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {selectedAgent?.path || '选择一个 Agent 或新建。'}
                  </p>
                ) : null}
              </div>
              {isCreating ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    disabled={actionState === 'saving'}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsCreating(false);
                      setDraft(createCustomAgentDraft());
                      setToolMode('all');
                      if (agents[0]) {
                        selectAgent(agents[0]);
                      }
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    disabled={!canSave || actionState === 'saving'}
                    size="sm"
                    type="button"
                    onClick={() => void handleSave()}
                  >
                    {actionState === 'saving' ? '创建中...' : '新建'}
                  </Button>
                </div>
              ) : selectedAgent && isWritable ? (
                <Button
                  className="h-8 text-destructive hover:text-destructive"
                  disabled={actionState === 'saving'}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setDeletingAgent(selectedAgent)}
                >
                  删除 Agent
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4">
              {isCreating && hasProjectScope ? (
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Scope</span>
                  <Select
                    value={draft.source}
                    onValueChange={(source) =>
                      setDraft((current) => ({
                        ...current,
                        source: source as AiWritableSource,
                      }))
                    }
                  >
                    <SelectTrigger aria-label="Scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">
                        User (~/.claude/agents/)
                      </SelectItem>
                      <SelectItem value="project">
                        Project (.claude/agents/)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Name</span>
            <Input
              aria-label="Name"
              disabled={!isCreating || !isWritable}
              placeholder="my-agent"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            {isCreating ? (
              <span className="text-[11px] text-muted-foreground">
                小写字母、数字和连字符
              </span>
            ) : null}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">描述</span>
            <Input
              aria-label="描述"
              disabled={!isWritable}
              placeholder={
                isCreating ? '这个 Agent 的用途...' : 'Agent 描述...'
              }
              value={draft.description}
              onBlur={() => void handleAutosave()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">Model</p>
            <Select
              disabled={!isWritable}
              value={draft.model}
              onValueChange={(model) => {
                const nextDraft = {
                  ...draft,
                  model: model as AiCustomAgentDraft['model'],
                };
                setDraft(nextDraft);
                void handleAutosave(nextDraft);
              }}
            >
              <SelectTrigger aria-label="Model" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['inherit', 'sonnet', 'opus', 'haiku'] as const).map(
                  (model) => (
                    <SelectItem key={model} value={model}>
                      {formatAgentModelLabel(model)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {isWritable ? (
            <CustomAgentToolsEditor
              disabled={!isWritable}
              draft={draft}
              mode={toolMode}
              onChange={setDraft}
              onModeChange={setToolMode}
            />
          ) : selectedAgent ? (
            <div className="grid gap-3 md:grid-cols-2">
              <CustomAgentToolBadges
                emptyLabel="未配置允许的 tools"
                label="允许的 Tools"
                tools={selectedAgent.tools}
              />
              <CustomAgentToolBadges
                emptyLabel="未配置禁用的 tools"
                label="禁用的 Tools"
                tools={selectedAgent.disallowedTools}
              />
            </div>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">System Prompt</span>
            <textarea
              aria-label="System Prompt"
              className="min-h-[240px] resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isWritable}
              placeholder={
                isCreating
                  ? '你是一个专用 agent，负责...'
                  : '这个 agent 的 system prompt...'
              }
              rows={isCreating ? 12 : 16}
              value={draft.prompt}
              onBlur={() => void handleAutosave()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  prompt: event.target.value,
                }))
              }
            />
          </label>

          {selectedAgent?.source === 'plugin' ? (
            <p className="text-sm text-muted-foreground">
              Plugin 提供的 Custom Agents 在这里为只读。
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <p
              className={cn(
                'text-sm',
                actionState === 'error'
                  ? 'text-destructive'
                  : 'text-muted-foreground',
              )}
            >
              {message ?? '更改会写入 Claude-compatible agent files。'}
            </p>
            {shouldShowSaveButton && !isCreating ? (
              <Button
                disabled={!canSave || actionState === 'saving'}
                type="button"
                onClick={() => void handleSave()}
              >
                {isCreating ? '新建' : '保存'}
              </Button>
            ) : null}
          </div>
        </div>
            </div>
          </div>
        )}
      </section>
      <ConfirmAiSettingsDeleteDialog
        description={`确定要删除 Agent "${deletingAgent?.name ?? ''}" 吗？此操作无法撤销。`}
        disabled={actionState === 'saving'}
        open={Boolean(deletingAgent)}
        title="删除 Agent"
        onConfirm={() => void handleDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingAgent(null);
          }
        }}
      />
    </div>
  );
}

function customAgentKey(agent: AiCustomAgentItem) {
  return `agent:${agent.source}:${agent.name}:${agent.path}`;
}

function createCustomAgentDraft(): AiCustomAgentDraft {
  return {
    description: '',
    disallowedTools: '',
    model: 'inherit',
    name: '',
    prompt: '',
    source: 'user',
    tools: '',
  };
}

function customAgentDraftFromAgent(agent: AiCustomAgentItem): AiCustomAgentDraft {
  return {
    description: agent.description,
    disallowedTools: agent.disallowedTools.join(', '),
    model: agent.model ?? 'inherit',
    name: agent.name,
    prompt: agent.prompt,
    source: agent.source,
    tools: agent.tools.join(', '),
  };
}

function hasCustomAgentDraftChanges(
  draft: AiCustomAgentDraft,
  agent: AiCustomAgentItem,
) {
  return (
    draft.description !== agent.description ||
    draft.prompt !== agent.prompt ||
    draft.model !== (agent.model ?? 'inherit') ||
    draft.tools !== agent.tools.join(', ') ||
    draft.disallowedTools !== agent.disallowedTools.join(', ')
  );
}

function CustomAgentToolsEditor({
  disabled,
  draft,
  mode,
  onChange,
  onModeChange,
}: {
  disabled: boolean;
  draft: AiCustomAgentDraft;
  mode: AiCustomAgentToolMode;
  onChange: React.Dispatch<React.SetStateAction<AiCustomAgentDraft>>;
  onModeChange: (mode: AiCustomAgentToolMode) => void;
}) {
  const selectedTools =
    mode === 'denylist'
      ? parseCommaSeparatedList(draft.disallowedTools)
      : parseCommaSeparatedList(draft.tools);

  function setMode(nextMode: AiCustomAgentToolMode) {
    onModeChange(nextMode);
    onChange((current) => {
      if (nextMode === 'all') {
        return {
          ...current,
          disallowedTools: '',
          tools: '',
        };
      }

      const currentMode = getCustomAgentToolMode(current);
      const currentTools =
        currentMode === 'denylist'
          ? parseCommaSeparatedList(current.disallowedTools)
          : parseCommaSeparatedList(current.tools);

      return setCustomAgentDraftTools(current, nextMode, currentTools);
    });
  }

  function setSelectedTools(nextTools: string[]) {
    onChange((current) => setCustomAgentDraftTools(current, mode, nextTools));
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Tools</p>
      <div className="flex flex-wrap gap-2">
        {(['all', 'allowlist', 'denylist'] as const).map((toolMode) => (
          <button
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              mode === toolMode
                ? 'border-foreground/30 bg-foreground/10 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground',
            )}
            disabled={disabled}
            key={toolMode}
            type="button"
            onClick={() => setMode(toolMode)}
          >
            {formatCustomAgentToolModeLabel(toolMode)}
          </button>
        ))}
      </div>
      {mode !== 'all' ? (
        <CustomAgentToolSelector
          disabled={disabled}
          mode={mode}
          selectedTools={selectedTools}
          onChange={setSelectedTools}
        />
      ) : null}
    </div>
  );
}

function CustomAgentToolSelector({
  disabled,
  mode,
  selectedTools,
  onChange,
}: {
  disabled: boolean;
  mode: Exclude<AiCustomAgentToolMode, 'all'>;
  selectedTools: string[];
  onChange: (tools: string[]) => void;
}) {
  const allToolIds = AI_CUSTOM_AGENT_TOOL_CATEGORIES.flatMap((category) =>
    category.tools.map((tool) => tool.id),
  );

  function toggleTool(toolId: string) {
    if (selectedTools.includes(toolId)) {
      onChange(selectedTools.filter((tool) => tool !== toolId));
      return;
    }

    onChange([...selectedTools, toolId]);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          type="button"
          onClick={() => onChange(allToolIds)}
        >
          全选
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          type="button"
          onClick={() => onChange([])}
        >
          清空
        </button>
        <span className="flex-1" />
        <span className="text-muted-foreground">
          已选择 {selectedTools.length} 个
        </span>
      </div>

      <div className="grid gap-4 rounded-md border bg-muted/20 p-3">
        {AI_CUSTOM_AGENT_TOOL_CATEGORIES.map((category) => (
          <div className="grid gap-2" key={category.id}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {category.name}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {category.tools.map((tool) => {
                const isSelected = selectedTools.includes(tool.id);

                return (
                  <button
                    className={cn(
                      'flex min-w-0 items-start gap-2 rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      isSelected
                        ? mode === 'allowlist'
                          ? 'border-emerald-500/30 bg-emerald-500/10'
                          : 'border-destructive/30 bg-destructive/10'
                        : 'border-transparent bg-background hover:bg-foreground/5',
                    )}
                    disabled={disabled}
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border',
                        isSelected
                          ? mode === 'allowlist'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-destructive bg-destructive text-white'
                          : 'border-muted-foreground/30',
                      )}
                    >
                      {isSelected ? <CheckCircle2 size={10} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {tool.name}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === 'allowlist'
          ? 'Agent 只能访问已选择的 tools'
          : 'Agent 可以访问除已选择项以外的所有 tools'}
      </p>
    </div>
  );
}

function getCustomAgentToolMode(
  draft: AiCustomAgentDraft,
): AiCustomAgentToolMode {
  if (parseCommaSeparatedList(draft.tools).length > 0) {
    return 'allowlist';
  }

  if (parseCommaSeparatedList(draft.disallowedTools).length > 0) {
    return 'denylist';
  }

  return 'all';
}

function setCustomAgentDraftTools(
  draft: AiCustomAgentDraft,
  mode: AiCustomAgentToolMode,
  selectedTools: string[],
): AiCustomAgentDraft {
  const value = selectedTools.join(', ');

  if (mode === 'allowlist') {
    return {
      ...draft,
      disallowedTools: '',
      tools: value,
    };
  }

  if (mode === 'denylist') {
    return {
      ...draft,
      disallowedTools: value,
      tools: '',
    };
  }

  return {
    ...draft,
    disallowedTools: '',
    tools: '',
  };
}

function formatCustomAgentToolModeLabel(mode: AiCustomAgentToolMode) {
  switch (mode) {
    case 'all':
      return '所有 Tools';
    case 'allowlist':
      return '仅已选择';
    case 'denylist':
      return '排除已选择';
  }
}

function parseCommaSeparatedList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function CustomAgentToolBadges({
  emptyLabel,
  label,
  tools,
}: {
  emptyLabel: string;
  label: string;
  tools: string[];
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="mb-2 text-sm font-medium">{label}</p>
      {tools.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <span
              className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground"
              key={tool}
            >
              {tool}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function formatAgentModelLabel(
  model: 'haiku' | 'inherit' | 'opus' | 'sonnet',
) {
  const labels = {
    haiku: 'Haiku 4.5',
    inherit: '继承 parent 设置',
    opus: 'Opus 4.6',
    sonnet: 'Sonnet 4.6',
  } satisfies Record<typeof model, string>;

  return labels[model];
}

interface AiMcpServerDraft {
  args: string;
  authType: 'bearer' | 'none' | 'oauth';
  bearerToken: string;
  command: string;
  connectionType: 'http' | 'stdio';
  env: string;
  name: string;
  provider: 'claude-code' | 'codex';
  source: 'global' | 'project';
  url: string;
}

function AiMcpServersSettingsSection({
  onServersRefresh,
  onSettingsSidebarWidthChange,
  settingsSidebarWidth,
  servers,
  workspaceRootPath,
}: {
  onServersRefresh: () => Promise<AiMcpServerItem[]>;
  onSettingsSidebarWidthChange: (width: number) => void;
  settingsSidebarWidth: number;
  servers: AiMcpServerItem[];
  workspaceRootPath: string | null;
}) {
  const [draft, setDraft] = React.useState<AiMcpServerDraft>(() =>
    createMcpServerDraft(),
  );
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [updatingKey, setUpdatingKey] = React.useState<string | null>(null);
  const [deletingServer, setDeletingServer] =
    React.useState<AiMcpServerItem | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isEditing = editingKey !== null;
  const isDraftVisible = isCreating || isEditing;
  const mcpAuthoringRootPath = workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT;
  const canWriteDraftScope =
    draft.provider === 'codex' ||
    draft.source === 'global' ||
    Boolean(workspaceRootPath);
  const canSaveDraft =
    canWriteDraftScope &&
    draft.name.trim().length > 0 &&
    ((draft.connectionType === 'stdio' && draft.command.trim().length > 0) ||
      (draft.connectionType === 'http' && draft.url.trim().length > 0));
  const normalizedQuery = normalizeSearchTerm(query);
  const filteredServers = normalizedQuery
    ? servers.filter((server) => mcpServerMatchesSearch(server, normalizedQuery))
    : servers;
  const groupedServers = groupMcpServersByProvider(filteredServers);
  const orderedFilteredServers = groupedServers.flatMap((group) => group.servers);
  const filteredServerKeys = groupedServers.flatMap((group) =>
    group.servers.map(mcpServerKey),
  );
  const selectedServer =
    orderedFilteredServers.find((server) => mcpServerKey(server) === selectedKey) ??
    orderedFilteredServers[0] ??
    servers[0] ??
    null;

  useSlashFocusSearch(searchInputRef);

  function selectMcpServerFromList(server: AiMcpServerItem) {
    setSelectedKey(mcpServerKey(server));
    setEditingKey(null);
    setIsCreating(false);
    setDraft(createMcpServerDraft());
    setDeletingServer(null);
    setMessage(null);
  }

  const {
    containerRef: mcpListRef,
    onKeyDown: mcpListKeyDown,
  } = useSettingsListKeyboardNav({
    items: filteredServerKeys,
    selectedItem: selectedServer ? mcpServerKey(selectedServer) : null,
    onSelect: (key) => {
      const server = filteredServers.find(
        (candidate) => mcpServerKey(candidate) === key,
      );
      if (server) {
        selectMcpServerFromList(server);
      }
    },
  });

  function handleStartCreate() {
    setDraft(createMcpServerDraft());
    setEditingKey(null);
    setIsCreating(true);
    setDeletingServer(null);
    setMessage(null);
  }

  function handleStartEdit(server: AiMcpServerItem) {
    if (!isWritableMcpSource(server.source)) {
      return;
    }

    setDraft(createMcpServerDraftFromServer(server));
    setSelectedKey(mcpServerKey(server));
    setEditingKey(mcpServerKey(server));
    setIsCreating(false);
    setDeletingServer(null);
    setMessage(null);
  }

  function handleCancelDraft() {
    setDraft(createMcpServerDraft());
    setEditingKey(null);
    setIsCreating(false);
    setMessage(null);
  }

  async function handleSaveDraft() {
    if (
      !workspaceRootPath &&
      draft.provider !== 'codex' &&
      draft.source === 'project'
    ) {
      setMessage('打开工作区后才能保存 MCP server。');
      return;
    }

    if (!canSaveDraft) {
      setMessage('打开工作区，并填写 Name 与连接信息后才能保存 MCP server。');
      return;
    }

    const savingKey = editingKey ?? 'new';

    setUpdatingKey(savingKey);
    setMessage(null);

    try {
      const payload = {
        args:
          draft.connectionType === 'stdio' ? parseShellLikeList(draft.args) : [],
        authType:
          draft.provider === 'claude-code' && draft.connectionType === 'http'
            ? draft.authType
            : null,
        bearerToken:
          draft.provider === 'claude-code' &&
          draft.connectionType === 'http' &&
          draft.authType === 'bearer'
            ? draft.bearerToken
            : null,
        command: draft.connectionType === 'stdio' ? draft.command : null,
        connectionType: draft.connectionType,
        env: draft.provider === 'claude-code' ? parseEnvLines(draft.env) : {},
        name: draft.name,
        provider: draft.provider,
        source: draft.provider === 'codex' ? 'global' : draft.source,
        url: draft.connectionType === 'http' ? draft.url : null,
      };

      if (isEditing) {
        await updateAiMcpServer(mcpAuthoringRootPath, payload);
      } else {
        await createAiMcpServer(mcpAuthoringRootPath, payload);
      }

      await onServersRefresh();
      setDraft(createMcpServerDraft());
      setEditingKey(null);
      setIsCreating(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法保存 MCP server。');
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleToggle(server: AiMcpServerItem, enabled: boolean) {
    if (
      !isWritableMcpSource(server.source) ||
      (!workspaceRootPath && server.source === 'project')
    ) {
      return;
    }

    setUpdatingKey(mcpServerKey(server));
    setMessage(null);

    try {
      await setAiMcpServerEnabled(mcpAuthoringRootPath, {
        enabled,
        name: server.name,
        provider: server.provider,
        source: server.source,
      });
      await onServersRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法更新 MCP server。');
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleDelete(server: AiMcpServerItem) {
    if (
      !isWritableMcpSource(server.source) ||
      (!workspaceRootPath && server.source === 'project')
    ) {
      return;
    }

    setUpdatingKey(mcpServerKey(server));
    setMessage(null);

    try {
      await deleteAiMcpServer(mcpAuthoringRootPath, {
        name: server.name,
        provider: server.provider,
        source: server.source,
      });
      await onServersRefresh();
      setDeletingServer(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法删除 MCP server。');
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handlePluginApproval(server: AiMcpServerItem, approved: boolean) {
    if (!server.pluginName) {
      setMessage('缺少 plugin MCP server 来源，无法更新批准状态。');
      return;
    }

    setUpdatingKey(mcpServerKey(server));
    setMessage(null);

    try {
      await setAiPluginMcpServerApproved(server.pluginName, server.name, approved);
      await onServersRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '无法更新 plugin MCP server 批准状态。',
      );
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleAuthenticate(server: AiMcpServerItem) {
    if (!workspaceRootPath) {
      return;
    }

    setUpdatingKey(mcpServerKey(server));
    setMessage(null);

    try {
      await authenticateAiMcpServer(workspaceRootPath, {
        name: server.name,
        projectPath: server.projectPath ?? null,
        provider: server.provider,
      });
      const refreshedServers = await onServersRefresh();
      const promotedServer = refreshedServers.find(
        (candidate) =>
          candidate.name === server.name &&
          candidate.provider === server.provider &&
          candidate.source === 'global' &&
          candidate.groupName === 'Global',
      );
      if (promotedServer) {
        setSelectedKey(mcpServerKey(promotedServer));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法认证 MCP server。');
    } finally {
      setUpdatingKey(null);
    }
  }

  async function handleLogout(server: AiMcpServerItem) {
    if (!workspaceRootPath) {
      return;
    }

    setUpdatingKey(mcpServerKey(server));
    setMessage(null);

    try {
      await logoutAiMcpServer(workspaceRootPath, {
        name: server.name,
        projectPath: server.projectPath ?? null,
        provider: server.provider,
      });
      await onServersRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法退出 MCP server。');
    } finally {
      setUpdatingKey(null);
    }
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-background"
      data-testid="ai-mcp-settings-shell"
    >
      <h2 className="sr-only">MCP Servers</h2>
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r bg-background"
        data-testid="ai-mcp-settings-sidebar"
        style={{ width: settingsSidebarWidth }}
      >
        <div
          className="flex shrink-0 items-center gap-1.5 px-2 pt-2"
          data-testid="ai-mcp-search-row"
        >
          <label className="min-w-0 flex-1">
            <input
              aria-label="搜索 MCP servers"
              className="h-7 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground/40"
              data-testid="ai-mcp-search-input"
              placeholder="搜索 MCP servers..."
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={mcpListKeyDown}
            />
          </label>
          <Button
            aria-label="添加 MCP server"
            className="size-7 shrink-0 rounded-lg text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            size="icon"
            title="添加 MCP server"
            type="button"
            variant="ghost"
            onClick={handleStartCreate}
          >
            <Plus size={16} />
          </Button>
          <Button
            aria-label="刷新 MCP servers"
            className="size-7 shrink-0 rounded-lg text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            size="icon"
            title="刷新 MCP servers"
            type="button"
            variant="ghost"
            onClick={() => void onServersRefresh()}
          >
            <RefreshCw size={15} />
          </Button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2 outline-none"
          ref={mcpListRef}
          tabIndex={-1}
          onKeyDown={mcpListKeyDown}
        >
          {servers.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <OriginalMcpIcon
                className="text-muted-foreground/30"
                data-testid="mcp-empty-sidebar-icon"
                height={34}
                width={34}
              />
              <p className="text-sm text-muted-foreground">暂无 MCP servers</p>
              <Button
                className="h-8"
                size="sm"
                type="button"
                variant="outline"
                onClick={handleStartCreate}
              >
                添加 server
              </Button>
            </div>
          ) : filteredServers.length === 0 ? (
            <EmptyInventory label="未找到结果" />
          ) : (
            <div className="space-y-3">
              {groupedServers.map((group) => (
                <div className="space-y-0.5" key={group.provider}>
                  <div className="px-2 pb-1 pt-1">
                    <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
                      {group.title}
                    </p>
                    <div className="mt-1 h-px bg-border" />
                  </div>
                  {group.servers.map((server) => (
                    <McpServerListItem
                      isSelected={
                        selectedServer
                          ? mcpServerKey(selectedServer) === mcpServerKey(server)
                          : false
                      }
                      key={mcpServerKey(server)}
                      server={server}
                      onSelect={() => selectMcpServerFromList(server)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <WorkspaceResizeHandle
        aria-label="调整 MCP Servers 设置列表宽度"
        className="-mx-1"
        direction="left"
        max={400}
        min={200}
        value={settingsSidebarWidth}
        onResize={onSettingsSidebarWidthChange}
      />

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {message ? (
          <p className="mb-4 text-sm text-destructive">{message}</p>
        ) : null}
        {isDraftVisible ? (
          <div className="mx-auto grid max-w-[720px] gap-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[18px] font-semibold">
              {isEditing ? '编辑 MCP Server' : '新建 MCP Server'}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                className="h-8"
                size="sm"
                type="button"
                variant="ghost"
                onClick={handleCancelDraft}
              >
                取消
              </Button>
              <Button
                className="h-8"
                disabled={!canSaveDraft || updatingKey === (editingKey ?? 'new')}
                size="sm"
                type="button"
                onClick={() => void handleSaveDraft()}
              >
                {updatingKey === (editingKey ?? 'new')
                  ? isEditing
                    ? '保存中...'
                    : '添加中...'
                  : isEditing
                    ? '保存更改'
                    : '添加'}
              </Button>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <p className="text-sm font-medium">Provider</p>
              <Select
                disabled={isEditing}
                value={draft.provider}
                onValueChange={(provider) =>
                  setDraft((current) => ({
                    ...current,
                    env: provider === 'codex' ? '' : current.env,
                    provider: provider as AiMcpServerDraft['provider'],
                    source: provider === 'codex' ? 'global' : current.source,
                  }))
                }
              >
                <SelectTrigger aria-label="Provider" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="codex">OpenAI Codex</SelectItem>
                  <SelectItem value="claude-code">Claude Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.provider === 'codex' || workspaceRootPath ? (
              <div className="grid gap-2">
              <p className="text-sm font-medium">Scope</p>
                <Select
                  disabled={isEditing || draft.provider === 'codex'}
                  value={draft.provider === 'codex' ? 'global' : draft.source}
                  onValueChange={(source) =>
                    setDraft((current) => ({
                      ...current,
                      source: source as AiMcpServerDraft['source'],
                    }))
                  }
                >
                  <SelectTrigger aria-label="Scope" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">
                      {draft.provider === 'codex'
                        ? 'Global (~/.codex/config.toml)'
                        : 'Global (~/.claude.json)'}
                    </SelectItem>
                    {draft.provider !== 'codex' ? (
                      <SelectItem value="project">
                        {workspaceRootPath
                          ? `Project: ${workspaceRootPath.split('/').filter(Boolean).pop() ?? 'Project'}`
                          : 'Project'}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <p className="text-sm font-medium">Transport</p>
              <Select
                value={draft.connectionType}
                onValueChange={(connectionType) =>
                  setDraft((current) => ({
                    ...current,
                    connectionType:
                      connectionType as AiMcpServerDraft['connectionType'],
                  }))
                }
              >
                <SelectTrigger aria-label="Transport" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio（本地 command）</SelectItem>
                  <SelectItem value="http">HTTP (SSE)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-medium">Name</span>
            <Input
              aria-label="Name"
              disabled={isEditing}
              placeholder="my-server"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          {draft.connectionType === 'stdio' ? (
            <>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Command</span>
                <Input
                  aria-label="Command"
                  placeholder="npx, python, node..."
                  value={draft.command}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      command: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">Arguments</span>
                <Input
                  aria-label="Arguments"
                  placeholder="-m mcp_server --port 3000"
                  value={draft.args}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      args: event.target.value,
                    }))
                  }
                />
                <span className="text-[11px] text-muted-foreground">
                  用空格分隔 arguments
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-2">
                <span className="text-sm font-medium">URL</span>
                <Input
                  aria-label="URL"
                  placeholder="http://localhost:3000/sse"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="grid gap-2">
                <p className="text-sm font-medium">Auth 类型</p>
                <div className="flex flex-wrap gap-2">
                  {(['none', 'oauth', 'bearer'] as const).map((authType) => (
                    <button
                      className={cn(
                        'h-8 rounded-md border px-3 text-sm font-medium',
                        draft.authType === authType
                          ? 'border-foreground bg-foreground text-background'
                          : 'bg-background text-muted-foreground',
                      )}
                      key={authType}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          authType,
                        }))
                      }
                    >
                      {formatMcpAuthTypeOption(authType)}
                    </button>
                  ))}
                </div>
              </div>
              {draft.authType === 'bearer' ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Bearer token</span>
                  <Input
                    aria-label="Bearer token"
                    type="password"
                    value={draft.bearerToken}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        bearerToken: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </>
          )}
          {draft.provider === 'claude-code' ? (
            <label className="grid gap-2">
              <span className="text-sm font-medium">Env</span>
              <textarea
                aria-label="Env"
                className="min-h-20 resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                placeholder="KEY=value"
                value={draft.env}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    env: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}
          </div>
        ) : selectedServer ? (
          <McpServerDetailPanel
            server={selectedServer}
            updatingKey={updatingKey}
            onDelete={(server) => setDeletingServer(server)}
            onEdit={handleStartEdit}
            onAuthenticate={handleAuthenticate}
            onLogout={handleLogout}
            onPluginApproval={handlePluginApproval}
            onToggle={handleToggle}
          />
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
            <OriginalMcpIcon
              className="text-muted-foreground/30"
              data-testid="mcp-empty-detail-icon"
              height={46}
              width={46}
            />
            <p className="text-sm text-muted-foreground">
              {servers.length > 0
                ? '选择一个 MCP server 查看详情'
                : '未配置 MCP servers'}
            </p>
            <Button
              className="h-8"
              size="sm"
              type="button"
              variant="outline"
              onClick={handleStartCreate}
            >
              添加第一个 server
            </Button>
          </div>
        )}
      </section>
      <ConfirmAiSettingsDeleteDialog
        description={`确定要删除 ${deletingServer?.name ?? ''} 吗？这会移除 server 配置，且无法撤销。`}
        disabled={
          deletingServer ? updatingKey === mcpServerKey(deletingServer) : false
        }
        open={Boolean(deletingServer)}
        title="删除 MCP Server"
        onConfirm={() => {
          if (deletingServer) {
            void handleDelete(deletingServer);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingServer(null);
          }
        }}
      />
    </div>
  );
}

function createMcpServerDraft(): AiMcpServerDraft {
  return {
    args: '',
    authType: 'none',
    bearerToken: '',
    command: '',
    connectionType: 'stdio',
    env: '',
    name: '',
    provider: 'claude-code',
    source: 'global',
    url: '',
  };
}

function McpServerListItem({
  isSelected,
  server,
  onSelect,
}: {
  isSelected: boolean;
  server: AiMcpServerItem;
  onSelect: () => void;
}) {
  const hideToolsCount = isCodexHttpMcpServer(server);
  const summary = formatMcpServerSummary(server, hideToolsCount);
  const isPending = server.status.toLowerCase() === 'pending';

  return (
    <button
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'w-full rounded-md px-2 py-1.5 text-left transition-colors',
        isSelected
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
      data-item-id={mcpServerKey(server)}
      type="button"
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm leading-tight',
                !server.enabled && 'opacity-55',
              )}
            >
              {server.name}
            </span>
            <McpStatusDot enabled={server.enabled} status={server.status} />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground/70">
            <span className="min-w-0 flex-1 truncate">{server.groupName}</span>
            {isPending ? null : <span className="shrink-0">{summary}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function McpServerDetailPanel({
  server,
  updatingKey,
  onAuthenticate,
  onDelete,
  onEdit,
  onLogout,
  onPluginApproval,
  onToggle,
}: {
  server: AiMcpServerItem;
  updatingKey: string | null;
  onAuthenticate: (server: AiMcpServerItem) => Promise<void>;
  onDelete: (server: AiMcpServerItem) => void;
  onEdit: (server: AiMcpServerItem) => void;
  onLogout: (server: AiMcpServerItem) => Promise<void>;
  onPluginApproval: (server: AiMcpServerItem, approved: boolean) => Promise<void>;
  onToggle: (server: AiMcpServerItem, enabled: boolean) => Promise<void>;
}) {
  const serverKey = mcpServerKey(server);
  const tools = server.tools ?? [];
  const isCodexMcp = server.provider === 'codex';
  const hideToolsCount = isCodexHttpMcpServer(server);
  const isClaudeHttpMcp =
    server.provider === 'claude-code' && server.connectionType === 'http';
  const hasMcpAuthConfig =
    server.authStatus === 'o_auth' ||
    server.authStatus === 'bearer_token' ||
    server.authType === 'oauth' ||
    server.authType === 'bearer' ||
    Boolean(server.hasAuthHeader);
  const canWrite = !isCodexMcp && isWritableMcpSource(server.source);
  const canDelete = isCodexMcp || canWrite;
  const isPluginMcp = server.source === 'plugin' && Boolean(server.pluginName);
  const isPendingApproval = server.status === 'pending-approval';
  const canAuthenticate =
    (isCodexMcp || isClaudeHttpMcp) &&
    (server.needsAuth || server.status === 'needs-auth');
  const normalizedAuthStatus = (server.authStatus ?? '').toLowerCase();
  const canCodexLogout =
    isCodexMcp &&
    (normalizedAuthStatus === 'o_auth' ||
      normalizedAuthStatus === 'bearer_token');
  const canClaudeLogout =
    isClaudeHttpMcp && !canAuthenticate && hasMcpAuthConfig;
  const canLogout = canCodexLogout || canClaudeLogout;

  return (
    <div
      className="h-full overflow-y-auto"
      data-testid="ai-mcp-detail-shell"
    >
      <div
        className="mx-auto max-w-2xl space-y-6 p-6"
        data-testid="ai-mcp-detail-inner"
      >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-semibold text-foreground"
            data-testid="ai-mcp-detail-title"
          >
            {server.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatMcpServerSummary(server, hideToolsCount)}
          </p>
        </div>
        {canAuthenticate ? (
          <Button
            className="h-8 shrink-0"
            disabled={updatingKey === serverKey}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => void onAuthenticate(server)}
          >
            {server.status === 'connected' ? '重新连接' : '认证'}
          </Button>
        ) : null}
        {canLogout ? (
          <Button
            className="h-8 shrink-0"
            disabled={updatingKey === serverKey}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void onLogout(server)}
          >
            退出
          </Button>
        ) : null}
        {canDelete ? (
          <div className="flex shrink-0 items-center gap-2">
            {canWrite ? (
              <Button
                aria-label="编辑 server"
                className="size-8"
                disabled={updatingKey === serverKey}
                size="icon"
                title="编辑 server"
                type="button"
                variant="ghost"
                onClick={() => onEdit(server)}
              >
                <Pencil size={14} />
              </Button>
            ) : null}
            <Button
              className="size-8 text-destructive hover:text-destructive"
              disabled={updatingKey === serverKey}
              size="icon"
              title="删除 server"
              type="button"
              variant="ghost"
              onClick={() => void onDelete(server)}
            >
              <Trash2 size={14} />
              <span className="sr-only">删除 server</span>
            </Button>
          </div>
        ) : null}
        {isPluginMcp ? (
          <Button
            aria-label={
              isPendingApproval
                ? '批准 plugin MCP server'
                : '撤销 plugin MCP server 批准'
            }
            className="h-8 shrink-0"
            disabled={updatingKey === serverKey}
            size="sm"
            type="button"
            variant={isPendingApproval ? 'default' : 'outline'}
            onClick={() => void onPluginApproval(server, isPendingApproval)}
          >
            {isPendingApproval ? '批准' : '撤销'}
          </Button>
        ) : null}
      </div>

      {canWrite ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-medium text-foreground">启用</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              关闭后将阻止这个 server 连接
            </p>
          </div>
          <PillSwitch
            checked={server.enabled}
            disabled={updatingKey === serverKey}
            label={`切换 MCP ${server.name}`}
            onChange={(checked) => void onToggle(server, checked)}
          />
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-xs font-medium text-foreground">连接</h4>
        <div className="overflow-hidden rounded-md border">
          <ReadonlyInfoRow label="类型" value={server.connectionType} />
          {server.command ? (
            <ReadonlyInfoRow label="Command" value={server.command} />
          ) : null}
          {server.args.length > 0 ? (
            <ReadonlyInfoRow label="Args" value={server.args.join(' ')} />
          ) : null}
          {server.url ? <ReadonlyInfoRow label="URL" value={server.url} /> : null}
          {server.connectionType === 'http' ? (
            <ReadonlyInfoRow
              label="Auth"
              value={formatMcpAuthTypeLabel(server.authType)}
            />
          ) : null}
          {server.hasAuthHeader ? (
            <ReadonlyInfoRow
              label="Authorization"
              value="Authorization 已配置"
            />
          ) : null}
          {server.envKeys.length > 0 ? (
            <ReadonlyInfoRow label="Env" value={server.envKeys.join(', ')} />
          ) : null}
        </div>
      </div>

      {server.error ? (
        <div>
          <h4 className="mb-2 text-xs font-medium text-destructive">错误</h4>
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="break-words font-mono text-xs text-destructive">
              {server.error}
            </p>
          </div>
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div>
          <h4 className="mb-3 text-xs font-medium text-foreground">
            {hideToolsCount ? 'Tools' : `Tools (${tools.length})`}
          </h4>
          <div className="grid gap-2">
            {tools.map((tool) => (
              <div className="rounded-lg border px-3.5 py-2.5" key={tool.name}>
                <p className="font-mono text-[13px] font-medium">
                  {tool.name}
                </p>
                {tool.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function McpStatusDot({
  enabled,
  status,
}: {
  enabled: boolean;
  status: string;
}) {
  const normalizedStatus = status.toLowerCase();

  if (!enabled) {
    return <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />;
  }

  if (normalizedStatus === 'pending') {
    return (
      <span
        aria-label="MCP server 正在连接"
        className="size-3 shrink-0 animate-pulse rounded-full bg-muted-foreground/50"
        data-testid="mcp-status-loading-dot"
      />
    );
  }

  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        normalizedStatus === 'connected' || normalizedStatus === 'configured'
          ? 'bg-emerald-500'
          : normalizedStatus === 'failed'
            ? 'bg-destructive'
            : normalizedStatus.includes('auth') ||
                normalizedStatus.includes('pending')
              ? 'bg-amber-500'
              : 'bg-muted-foreground/50',
      )}
    />
  );
}

function groupMcpServersByProvider(servers: AiMcpServerItem[]) {
  return ([
    ['claude-code', 'CLAUDE CODE'],
    ['codex', 'CODEX'],
  ] as const)
    .map(([provider, title]) => ({
      provider,
      title,
      servers: servers
        .filter((server) => server.provider === provider)
        .sort(
          (left, right) =>
            getMcpStatusPriority(left.status) -
            getMcpStatusPriority(right.status),
        ),
    }))
    .filter((group) => group.servers.length > 0);
}

function getMcpStatusPriority(status: string) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'connected' || normalizedStatus === 'configured') {
    return 0;
  }

  if (normalizedStatus === 'pending' || normalizedStatus === 'pending-approval') {
    return 1;
  }

  if (normalizedStatus === 'needs-auth') {
    return 2;
  }

  if (normalizedStatus === 'failed') {
    return 3;
  }

  return 3;
}

function mcpServerMatchesSearch(
  server: AiMcpServerItem,
  normalizedQuery: string,
) {
  return [
    server.name,
    server.provider,
    server.groupName,
    server.status,
    server.connectionType,
    server.command ?? '',
    server.url ?? '',
    ...server.args,
    ...server.envKeys,
    ...(server.tools ?? []).flatMap((tool) => [
      tool.name,
      tool.description ?? '',
    ]),
  ]
    .map(normalizeSearchTerm)
    .some((value) => value.includes(normalizedQuery));
}

function formatMcpStatusLabel(server: AiMcpServerItem) {
  if (!server.enabled) {
    return '已停用';
  }

  switch (server.status) {
    case 'connected':
      return '已连接';
    case 'failed':
      return '失败';
    case 'needs-auth':
      return '需要认证';
    case 'pending':
      return '连接中...';
    default:
      return server.status;
  }
}

function formatMcpServerSummary(
  server: AiMcpServerItem,
  hideToolsCount = false,
) {
  const toolsCount = server.tools?.length ?? 0;

  if (!server.enabled) {
    return '已停用';
  }

  if (server.status === 'connected') {
    if (hideToolsCount) {
      return '已连接';
    }

    return toolsCount > 0
      ? `${toolsCount} 个 tool`
      : '无 tools';
  }

  return formatMcpStatusLabel(server);
}

function isCodexHttpMcpServer(server: AiMcpServerItem) {
  return server.provider === 'codex' && (server.connectionType === 'http' || Boolean(server.url));
}

function createMcpServerDraftFromServer(
  server: AiMcpServerItem,
): AiMcpServerDraft {
  return {
    args: server.args.join(' '),
    authType: normalizeMcpAuthType(server.authType),
    bearerToken: '',
    command: server.command ?? '',
    connectionType:
      server.connectionType === 'http' || server.url ? 'http' : 'stdio',
    env: '',
    name: server.name,
    provider: server.provider === 'codex' ? 'codex' : 'claude-code',
    source: isWritableMcpSource(server.source) ? server.source : 'project',
    url: server.url ?? '',
  };
}

function normalizeMcpAuthType(
  authType: AiMcpServerItem['authType'],
): AiMcpServerDraft['authType'] {
  return authType === 'oauth' || authType === 'bearer' ? authType : 'none';
}

function formatMcpAuthTypeOption(authType: AiMcpServerDraft['authType']) {
  const labels = {
    bearer: 'Bearer Token',
    none: '无',
    oauth: 'OAuth',
  } satisfies Record<AiMcpServerDraft['authType'], string>;

  return labels[authType];
}

function formatMcpAuthTypeLabel(authType: AiMcpServerItem['authType']) {
  return formatMcpAuthTypeOption(normalizeMcpAuthType(authType));
}

function mcpServerKey(server: AiMcpServerItem) {
  return `${server.provider}:${server.groupName}:${server.name}`;
}

function isWritableMcpSource(
  source: string,
): source is 'global' | 'project' {
  return source === 'global' || source === 'project';
}

function parseShellLikeList(value: string) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((env, line) => {
      const [key, ...rest] = line.split('=');
      if (key) {
        env[key.trim()] = rest.join('=').trim();
      }
      return env;
    }, {});
}

function AiPluginsSettingsSection({
  mcpServers,
  onNavigateToSection,
  onMcpServersRefresh,
  onPluginsRefresh,
  onSettingsSidebarWidthChange,
  plugins,
  settingsSidebarWidth,
  workspaceRootPath,
}: {
  mcpServers: AiMcpServerItem[];
  onNavigateToSection: (sectionId: SettingsSectionId) => void;
  onMcpServersRefresh: () => Promise<AiMcpServerItem[]>;
  onPluginsRefresh: () => Promise<AiPluginItem[]>;
  onSettingsSidebarWidthChange: (width: number) => void;
  plugins: AiPluginItem[];
  settingsSidebarWidth: number;
  workspaceRootPath: string | null;
}) {
  const [query, setQuery] = React.useState('');
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const [updatingSource, setUpdatingSource] = React.useState<string | null>(null);
  const [authenticatingServerName, setAuthenticatingServerName] = React.useState<
    string | null
  >(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearchTerm(query);
  const filteredPlugins = normalizedQuery
    ? plugins.filter((plugin) => pluginMatchesSearch(plugin, normalizedQuery))
    : plugins;
  const enabledPlugins = filteredPlugins.filter((plugin) => !plugin.isDisabled);
  const disabledMarketplaceGroups = groupDisabledPluginsByMarketplace(
    filteredPlugins.filter((plugin) => plugin.isDisabled),
  );
  const pluginListItemSources = [
    ...enabledPlugins.map((plugin) => plugin.source),
    ...disabledMarketplaceGroups.flatMap((group) =>
      group.plugins.map((plugin) => plugin.source),
    ),
  ];
  const firstDisplayedPlugin =
    enabledPlugins[0] ?? disabledMarketplaceGroups[0]?.plugins[0] ?? plugins[0];
  const selectedPlugin =
    plugins.find((plugin) => plugin.source === selectedSource) ??
    firstDisplayedPlugin ??
    null;

  useSlashFocusSearch(searchInputRef);

  const {
    containerRef: pluginListRef,
    onKeyDown: pluginListKeyDown,
  } = useSettingsListKeyboardNav({
    items: pluginListItemSources,
    selectedItem: selectedPlugin?.source ?? null,
    onSelect: setSelectedSource,
  });

  async function handlePluginEnabledChange(plugin: AiPluginItem, enabled: boolean) {
    setUpdatingSource(plugin.source);
    setMessage(null);

    try {
      await setAiPluginEnabled(plugin.source, enabled);
      if (plugin.components.mcpServers.length > 0) {
        await setAiPluginMcpServersApproved(
          plugin.source,
          plugin.components.mcpServers,
          enabled,
        );
        await onMcpServersRefresh();
      }
      await onPluginsRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法更新 plugin 状态。');
    } finally {
      setUpdatingSource(null);
    }
  }

  async function handlePluginMcpAuth(server: AiMcpServerItem) {
    setAuthenticatingServerName(server.name);
    setMessage(null);

    try {
      const rootPath = workspaceRootPath ?? AI_MCP_GLOBAL_PROJECT;

      await authenticateAiMcpServer(rootPath, {
        name: server.name,
        projectPath:
          server.projectPath ?? (workspaceRootPath ? null : AI_MCP_GLOBAL_PROJECT),
        provider: server.provider,
      });
      await onMcpServersRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法认证 MCP server。');
    } finally {
      setAuthenticatingServerName(null);
    }
  }

  return (
    <div
      className="flex h-full overflow-hidden bg-background"
      data-testid="ai-plugins-settings-shell"
    >
      <h2 className="sr-only">Plugins</h2>
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r bg-background"
        data-testid="ai-plugins-settings-sidebar"
        style={{ width: settingsSidebarWidth }}
      >
        <div
          className="flex shrink-0 items-center gap-1.5 px-2 pt-2"
          data-testid="ai-plugins-search-row"
        >
          <label className="min-w-0 flex-1">
            <input
              aria-label="搜索 Plugins"
              className="h-7 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground/40"
              data-testid="ai-plugins-search-input"
              placeholder="搜索 Plugins..."
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={pluginListKeyDown}
            />
          </label>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2 outline-none"
          ref={pluginListRef}
          tabIndex={-1}
          onKeyDown={pluginListKeyDown}
        >
          {plugins.length === 0 ? (
            <PluginsSidebarEmptyState />
          ) : filteredPlugins.length === 0 ? (
            <EmptyInventory label="未找到结果" />
          ) : (
            <div className="space-y-4">
              {enabledPlugins.length > 0 ? (
                <PluginListGroup title="已启用">
                  {enabledPlugins.map((plugin) => (
                    <PluginListItem
                      isSelected={selectedPlugin?.source === plugin.source}
                      key={plugin.source}
                      plugin={plugin}
                      onSelect={setSelectedSource}
                    />
                  ))}
                </PluginListGroup>
              ) : null}
              {disabledMarketplaceGroups.map((group) => (
                <PluginListGroup key={group.marketplace} title={group.marketplace}>
                  {group.plugins.map((plugin) => (
                    <PluginListItem
                      isSelected={selectedPlugin?.source === plugin.source}
                      key={plugin.source}
                      plugin={plugin}
                      onSelect={setSelectedSource}
                    />
                  ))}
                </PluginListGroup>
              ))}
            </div>
          )}
        </div>
      </aside>

      <WorkspaceResizeHandle
        aria-label="调整 Plugins 设置列表宽度"
        className="-mx-1"
        direction="left"
        max={400}
        min={200}
        value={settingsSidebarWidth}
        onResize={onSettingsSidebarWidthChange}
      />

      <section className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {message ? (
          <p className="text-sm text-destructive">{message}</p>
        ) : null}
        {selectedPlugin ? (
          <PluginDetailPanel
            authenticatingServerName={authenticatingServerName}
            isTogglingEnabled={updatingSource === selectedPlugin.source}
            mcpServers={mcpServers}
            plugin={selectedPlugin}
            onNavigateToSection={onNavigateToSection}
            onMcpAuth={(server) => void handlePluginMcpAuth(server)}
            onToggleEnabled={(enabled) =>
              void handlePluginEnabledChange(selectedPlugin, enabled)
            }
          />
        ) : (
          plugins.length > 0 ? (
            <EmptyInventory label="选择一个 plugin 查看详情" />
          ) : (
            <PluginsDetailEmptyState />
          )
        )}
      </section>
    </div>
  );
}

function PluginsSidebarEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <PluginFilledIcon
        className="mb-3 size-8 text-border"
        data-testid="plugins-empty-sidebar-icon"
      />
      <p className="mb-1 text-sm text-muted-foreground">暂无 Plugins</p>
      <p className="text-[11px] text-muted-foreground/70">
        将 plugins 安装到 ~/.claude/plugins/
      </p>
    </div>
  );
}

function PluginsDetailEmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-4 text-center">
      <PluginFilledIcon
        className="mb-4 size-12 text-border"
        data-testid="plugins-empty-detail-icon"
      />
      <p className="text-sm text-muted-foreground">未安装 Plugins</p>
      <p className="mt-2 text-xs text-muted-foreground/70">
        将 plugins 安装到 ~/.claude/plugins/marketplaces/
      </p>
    </div>
  );
}

function PluginListGroup({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

function PluginListItem({
  isSelected,
  plugin,
  onSelect,
}: {
  isSelected: boolean;
  plugin: AiPluginItem;
  onSelect: (source: string) => void;
}) {
  return (
    <button
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'min-w-0 rounded-md px-2 py-1.5 text-left transition-colors',
        isSelected
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
      data-item-id={plugin.source}
      type="button"
      onClick={() => onSelect(plugin.source)}
    >
      <p className="truncate text-sm leading-tight">
        {formatPluginDisplayName(plugin.name)}
      </p>
      {plugin.description ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
          {plugin.description}
        </p>
      ) : null}
    </button>
  );
}

function PluginDetailPanel({
  authenticatingServerName,
  isTogglingEnabled,
  mcpServers,
  plugin,
  onMcpAuth,
  onNavigateToSection,
  onToggleEnabled,
}: {
  authenticatingServerName: string | null;
  isTogglingEnabled: boolean;
  mcpServers: AiMcpServerItem[];
  plugin: AiPluginItem;
  onMcpAuth: (server: AiMcpServerItem) => void;
  onNavigateToSection: (sectionId: SettingsSectionId) => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const pluginMcpServers = plugin.components.mcpServers.map((serverName) => ({
    name: serverName,
    server: mcpServers.find(
      (server) =>
        server.name === serverName &&
        (server.pluginName === plugin.source || server.source === 'plugin'),
    ),
  }));

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid="ai-plugin-detail-shell"
    >
      <div
        className="flex-1 overflow-y-auto"
        data-testid="ai-plugin-detail-scroll"
      >
        <div
          className="mx-auto max-w-2xl space-y-5 p-6"
          data-testid="ai-plugin-detail-inner"
        >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold text-foreground"
              data-testid="ai-plugin-detail-title"
            >
              {formatPluginDisplayName(plugin.name)}
            </h3>
            {plugin.category ? (
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {plugin.category}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'size-1.5 rounded-full',
                plugin.isDisabled ? 'bg-muted-foreground/40' : 'bg-emerald-500',
              )}
            />
            <span
              className={cn(
                'text-sm font-medium',
                plugin.isDisabled ? 'text-muted-foreground' : 'text-emerald-600',
              )}
            >
              {plugin.isDisabled ? '已停用' : '活跃'}
            </span>
            <PillSwitch
              checked={!plugin.isDisabled}
              disabled={isTogglingEnabled}
              label={`切换 ${plugin.name}`}
              onChange={onToggleEnabled}
            />
          </div>
        </div>
        {plugin.description ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {plugin.description}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4">
        <PluginDetailField label="Version" value={plugin.version} />
        <PluginDetailField label="Source" value={plugin.source} />
        {plugin.homepage ? (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Homepage</p>
            <a
              className="break-all font-mono text-sm text-blue-500 hover:underline"
              href={plugin.homepage}
              rel="noreferrer"
              target="_blank"
            >
              {plugin.homepage}
            </a>
          </div>
        ) : null}
        {plugin.tags.length > 0 ? (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Tags</p>
            <div className="flex flex-wrap gap-1">
              {plugin.tags.map((tag) => (
                <span
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        <PluginComponentSection
          components={plugin.components.commands}
          icon={<Terminal size={14} />}
          namePrefix="/"
          title="Commands"
          onNavigate={() => onNavigateToSection('ai-skills')}
        />
        <PluginComponentSection
          components={plugin.components.skills}
          icon={(name) => <PluginSkillComponentIcon name={name} />}
          title="Skills"
          onNavigate={() => onNavigateToSection('ai-skills')}
        />
        <PluginComponentSection
          components={plugin.components.agents}
          icon={(name) => <PluginAgentComponentIcon name={name} />}
          title="Agents"
          onNavigate={() => onNavigateToSection('ai-agents')}
        />
        {plugin.components.mcpServers.length > 0 ? (
          <PluginMcpServerSection
            authenticatingServerName={authenticatingServerName}
            icon={(name) => <PluginMcpComponentIcon name={name} />}
            items={pluginMcpServers}
            title="MCP Servers"
            onNavigate={() => onNavigateToSection('ai-mcp')}
            onMcpAuth={onMcpAuth}
          />
        ) : null}
      </div>
        </div>
      </div>
    </div>
  );
}

function PluginDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="break-all font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function EmptyInventory({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ConfirmAiSettingsDeleteDialog({
  description,
  disabled,
  open,
  title,
  onConfirm,
  onOpenChange,
}: {
  description: string;
  disabled: boolean;
  open: boolean;
  title: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={disabled} onClick={onConfirm}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReadonlyInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b px-3 py-2 last:border-b-0">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words font-mono text-xs text-foreground">
        {value}
      </span>
    </div>
  );
}

type PluginRowIcon =
  | React.ReactNode
  | ((componentName: string) => React.ReactNode);

function PluginSkillComponentIcon({ name }: { name: string }) {
  return (
    <SkillIconFilled
      aria-hidden="true"
      className="h-3.5 w-3.5"
      data-testid={`plugin-skill-icon-${name}`}
    />
  );
}

function PluginAgentComponentIcon({ name }: { name: string }) {
  return (
    <CustomAgentIconFilled
      aria-hidden="true"
      className="h-3.5 w-3.5"
      data-testid={`plugin-agent-icon-${name}`}
    />
  );
}

function PluginMcpComponentIcon({ name }: { name: string }) {
  return (
    <OriginalMcpIcon
      aria-hidden="true"
      className="h-3.5 w-3.5"
      data-testid={`plugin-mcp-icon-${name}`}
    />
  );
}

function PluginFilledIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M10 2C8.89543 2 8 2.89543 8 4V5H4C2.89543 5 2 5.89543 2 7V11C2 12.1046 2.89543 13 4 13H5V17C5 18.1046 5.89543 19 7 19H11V20C11 21.1046 11.8954 22 13 22H17C18.1046 22 19 21.1046 19 20V19H20C21.1046 19 22 18.1046 22 17V13C22 11.8954 21.1046 11 20 11H19V7C19 5.89543 18.1046 5 17 5H13V4C13 2.89543 12.1046 2 11 2H10ZM10 4H11V7H17V13H20V17H17V20H13V17H7V11H4V7H10V4Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function SkillIconFilled(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M11.0039 10V6.20156C11.0039 5.52035 10.7721 4.85942 10.3465 4.32748L9.09712 2.76574C8.70993 2.28175 8.12372 2 7.50391 2C6.88409 2 6.29788 2.28175 5.91069 2.76574L4.6613 4.32748C4.23575 4.85942 4.00391 5.52035 4.00391 6.20156V10H3C2.44772 10 2 10.4477 2 11V18C2 19.6569 3.34315 21 5 21H19C20.6569 21 22 19.6569 22 18V11C22 10.4477 21.5523 10 21 10H20V4C20 2.89543 19.1046 2 18 2H14C12.8954 2 12 2.89543 12 4V10H11.0039ZM7.50391 4C7.49166 4 7.48008 4.00557 7.47243 4.01513L6.22304 5.57687C6.08119 5.75418 6.00391 5.97449 6.00391 6.20156V10H9.00391V6.20156C9.00391 5.97449 8.92663 5.75418 8.78477 5.57687L7.53539 4.01513C7.52773 4.00557 7.51615 4 7.50391 4ZM14 10H18V4H14V6H15.0039C15.5562 6 16.0039 6.44772 16.0039 7C16.0039 7.55228 15.5562 8 15.0039 8H14V10Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function CustomAgentIconFilled(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M12 1C12.5523 1 13 1.44772 13 2V3H17C18.6569 3 20 4.34315 20 6V11C20 11.8885 19.6138 12.6868 19 13.2361V14.5858L20.7071 16.2929C21.0976 16.6834 21.0976 17.3166 20.7071 17.7071C20.3166 18.0976 19.6834 18.0976 19.2929 17.7071L18.681 17.0952C17.7905 19.9377 15.1361 22 12 22C8.8639 22 6.20948 19.9377 5.31897 17.0952L4.70711 17.7071C4.31658 18.0976 3.68342 18.0976 3.29289 17.7071C2.90237 17.3166 2.90237 16.6834 3.29289 16.2929L5 14.5858V13.2361C4.38625 12.6868 4 11.8885 4 11V6C4 4.34315 5.34315 3 7 3H11V2C11 1.44772 11.4477 1 12 1ZM7 5C6.44772 5 6 5.44772 6 6V11C6 11.5523 6.44772 12 7 12H17C17.5523 12 18 11.5523 18 11V6C18 5.44772 17.5523 5 17 5H7ZM9 7C9.55228 7 10 7.44772 10 8V9C10 9.55228 9.55228 10 9 10C8.44772 10 8 9.55228 8 9V8C8 7.44772 8.44772 7 9 7ZM15 7C15.5523 7 16 7.44772 16 8V9C16 9.55228 15.5523 10 15 10C14.4477 10 14 9.55228 14 9V8C14 7.44772 14.4477 7 15 7Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function OriginalMcpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M15.0915 3.8956C14.6865 3.50142 14.1437 3.28087 13.5785 3.28087C13.0133 3.28087 12.4705 3.50142 12.0655 3.8956L3.9966 11.8086C3.86157 11.9398 3.6807 12.0132 3.4924 12.0132C3.3041 12.0132 3.12322 11.9398 2.9882 11.8086C2.92209 11.7443 2.86955 11.6674 2.83366 11.5824C2.79778 11.4975 2.7793 11.4062 2.7793 11.314C2.7793 11.2218 2.79778 11.1305 2.83366 11.0456C2.86955 10.9606 2.92209 10.8837 2.9882 10.8194L11.0571 2.90647C11.732 2.24962 12.6367 1.8821 13.5785 1.8821C14.5203 1.8821 15.425 2.24962 16.0999 2.90647C16.4905 3.28628 16.7855 3.75318 16.961 4.26894C17.1364 4.7847 17.1872 5.33467 17.1092 5.87384C17.6555 5.79614 18.2124 5.84491 18.7369 6.0164C19.2614 6.18789 19.7395 6.47752 20.1344 6.86296L20.1763 6.90487C20.5068 7.22632 20.7695 7.61077 20.949 8.0355C21.1284 8.46023 21.2208 8.91661 21.2208 9.37768C21.2208 9.83874 21.1284 10.2951 20.949 10.7199C20.7695 11.1446 20.5068 11.529 20.1763 11.8505L12.8786 19.0065C12.8565 19.0279 12.839 19.0535 12.8271 19.0818C12.8151 19.1101 12.809 19.1405 12.809 19.1712C12.809 19.202 12.8151 19.2324 12.8271 19.2606C12.839 19.2889 12.8565 19.3145 12.8786 19.336L14.3773 20.8062C14.4435 20.8705 14.496 20.9474 14.5319 21.0323C14.5678 21.1173 14.5862 21.2086 14.5862 21.3008C14.5862 21.393 14.5678 21.4843 14.5319 21.5692C14.496 21.6542 14.4435 21.7311 14.3773 21.7953C14.2423 21.9266 14.0614 22 13.8731 22C13.6848 22 13.504 21.9266 13.3689 21.7953L11.8702 20.3259C11.7158 20.1759 11.5931 19.9965 11.5093 19.7982C11.4255 19.6 11.3823 19.3869 11.3823 19.1717C11.3823 18.9564 11.4255 18.7434 11.5093 18.5451C11.5931 18.3468 11.7158 18.1674 11.8702 18.0174L19.1679 10.8605C19.3661 10.6676 19.5236 10.4369 19.6312 10.1821C19.7388 9.92724 19.7942 9.65344 19.7942 9.37684C19.7942 9.10023 19.7388 8.82643 19.6312 8.5716C19.5236 8.31677 19.3661 8.08608 19.1679 7.89316L19.126 7.85208C18.7214 7.45833 18.1793 7.23779 17.6147 7.23732C17.0502 7.23685 16.5077 7.45648 16.1024 7.84957L10.0906 13.7457L10.0889 13.7474L10.0068 13.8287C9.87171 13.9602 9.69065 14.0338 9.50215 14.0338C9.31365 14.0338 9.1326 13.9602 8.99753 13.8287C8.93142 13.7644 8.87888 13.6875 8.843 13.6026C8.80712 13.5177 8.78863 13.4264 8.78863 13.3342C8.78863 13.2419 8.80712 13.1507 8.843 13.0657C8.87888 12.9808 8.93142 12.9039 8.99753 12.8396L15.094 6.86045C15.2917 6.66739 15.4487 6.43672 15.5559 6.18203C15.663 5.92735 15.7181 5.65379 15.7178 5.37749C15.7176 5.10119 15.6621 4.82773 15.5545 4.57322C15.4469 4.31872 15.2895 4.08832 15.0915 3.8956Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M14.0817 5.87383C14.1478 5.80954 14.2004 5.73265 14.2362 5.64771C14.2721 5.56276 14.2906 5.47148 14.2906 5.37927C14.2906 5.28706 14.2721 5.19578 14.2362 5.11084C14.2004 5.02589 14.1478 4.949 14.0817 4.88471C13.9467 4.75322 13.7656 4.67964 13.5771 4.67964C13.3886 4.67964 13.2075 4.75322 13.0725 4.88471L7.10506 10.7373C6.77452 11.0587 6.51179 11.4432 6.33239 11.8679C6.15298 12.2926 6.06055 12.749 6.06055 13.2101C6.06055 13.6712 6.15298 14.1275 6.33239 14.5523C6.51179 14.977 6.77452 15.3615 7.10506 15.6829C7.78012 16.3396 8.68472 16.7069 9.62648 16.7069C10.5682 16.7069 11.4728 16.3396 12.1479 15.6829L18.1162 9.83032C18.1823 9.76603 18.2348 9.68914 18.2707 9.60419C18.3066 9.51925 18.3251 9.42797 18.3251 9.33576C18.3251 9.24355 18.3066 9.15227 18.2707 9.06732C18.2348 8.98238 18.1823 8.90549 18.1162 8.8412C17.9811 8.70971 17.8 8.63613 17.6115 8.63613C17.423 8.63613 17.242 8.70971 17.1069 8.8412L11.1395 14.6938C10.7345 15.088 10.1916 15.3085 9.62648 15.3085C9.06132 15.3085 8.51847 15.088 8.11346 14.6938C7.91524 14.5009 7.75769 14.2702 7.65012 14.0153C7.54254 13.7605 7.48712 13.4867 7.48712 13.2101C7.48712 12.9335 7.54254 12.6597 7.65012 12.4049C7.75769 12.15 7.91524 11.9193 8.11346 11.7264L14.0817 5.87383Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function PluginComponentSection({
  components,
  icon,
  namePrefix = '',
  onNavigate,
  title,
}: {
  components: Array<{ description?: string | null; name: string }>;
  icon: PluginRowIcon;
  namePrefix?: string;
  onNavigate: () => void;
  title: string;
}) {
  if (components.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">
        {title} ({components.length})
      </h4>
      <div className="grid gap-1">
        {components.map((component) => (
          <button
            className="group flex w-full items-start gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
            key={component.name}
            type="button"
            onClick={onNavigate}
          >
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {typeof icon === 'function' ? icon(component.name) : icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs font-medium text-foreground">
                {namePrefix}
                {component.name}
              </span>
              {component.description ? (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/60">
                  {component.description}
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="mt-0.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
              size={13}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function PluginMcpServerSection({
  authenticatingServerName,
  icon,
  items,
  onMcpAuth,
  onNavigate,
  title,
}: {
  authenticatingServerName: string | null;
  icon: PluginRowIcon;
  items: Array<{ name: string; server?: AiMcpServerItem }>;
  onMcpAuth: (server: AiMcpServerItem) => void;
  onNavigate: () => void;
  title: string;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">
        {title} ({items.length})
      </h4>
      <div className="grid gap-1">
        {items.map(({ name, server }) => {
          const needsAuth =
            server ? server.needsAuth || server.status === 'needs-auth' : false;
          const isConnected = server?.status === 'connected';

          return (
            <div
              className="group flex w-full items-start gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
              key={name}
            >
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {typeof icon === 'function' ? icon(name) : icon}
              </span>
              <button
                className="min-w-0 flex-1 truncate text-left font-mono text-xs font-medium text-foreground hover:underline"
                type="button"
                onClick={onNavigate}
              >
                {name}
              </button>
              {needsAuth && server ? (
                <button
                  className="h-6 shrink-0 rounded-md border px-2 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  disabled={authenticatingServerName === server.name}
                  type="button"
                  onClick={() => onMcpAuth(server)}
                >
                  {authenticatingServerName === server.name ? (
                    <Loader2
                      className="size-3 animate-spin"
                      data-testid={`plugin-mcp-auth-spinner-${name}`}
                    />
                  ) : (
                    '登录'
                  )}
                </button>
              ) : isConnected ? (
                <span className="shrink-0 text-[11px] text-emerald-600">
                  已连接
                </span>
              ) : server?.status ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {server.status}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pluginMatchesSearch(plugin: AiPluginItem, normalizedQuery: string) {
  const searchableValues = [
    plugin.name,
    formatPluginDisplayName(plugin.name),
    plugin.source,
    plugin.marketplace,
    plugin.description ?? '',
    plugin.path,
    plugin.category ?? '',
    plugin.homepage ?? '',
    ...plugin.tags,
    ...plugin.components.commands.flatMap((component) => [
      component.name,
      component.description ?? '',
    ]),
    ...plugin.components.skills.flatMap((component) => [
      component.name,
      component.description ?? '',
    ]),
    ...plugin.components.agents.flatMap((component) => [
      component.name,
      component.description ?? '',
    ]),
    ...plugin.components.mcpServers,
  ];

  const queryWithDashes = normalizedQuery.replace(/\s+/g, '-');
  const queryWithoutDashes = normalizedQuery.replace(/-/g, ' ');

  return searchableValues
    .map(normalizeSearchTerm)
    .some(
      (value) =>
        value.includes(normalizedQuery) ||
        value.includes(queryWithDashes) ||
        value.includes(queryWithoutDashes),
    );
}

function groupDisabledPluginsByMarketplace(plugins: AiPluginItem[]) {
  const groups = new Map<string, AiPluginItem[]>();

  for (const plugin of plugins) {
    const current = groups.get(plugin.marketplace) ?? [];
    current.push(plugin);
    groups.set(plugin.marketplace, current);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([marketplace, groupPlugins]) => ({
      marketplace,
      plugins: groupPlugins,
    }));
}

function formatPluginDisplayName(name: string) {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function useSettingsListKeyboardNav<T extends string>({
  items,
  onSelect,
  selectedItem,
}: {
  items: T[];
  onSelect: (item: T) => void;
  selectedItem: T | null;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }
      if (items.length === 0) {
        return;
      }

      event.preventDefault();

      const currentIndex = selectedItem ? items.indexOf(selectedItem) : -1;
      const nextIndex =
        event.key === 'ArrowDown'
          ? currentIndex < items.length - 1
            ? currentIndex + 1
            : currentIndex
          : currentIndex > 0
            ? currentIndex - 1
            : 0;

      if (nextIndex === currentIndex && currentIndex !== -1) {
        return;
      }

      const nextItem = items[nextIndex];
      if (!nextItem) {
        return;
      }

      onSelect(nextItem);

      window.requestAnimationFrame(() => {
        const nextElement = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>('[data-item-id]') ??
            [],
        ).find((element) => element.dataset.itemId === nextItem);

        nextElement?.focus();
        nextElement?.scrollIntoView?.({ block: 'nearest' });
      });
    },
    [items, onSelect, selectedItem],
  );

  return { containerRef, onKeyDown };
}

function useSlashFocusSearch(inputRef: React.RefObject<HTMLInputElement | null>) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [inputRef]);
}

function SettingsFeedback({
  defaultMessage,
  errorMessage,
  saveState,
}: {
  defaultMessage: string;
  errorMessage: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
        errorMessage
          ? 'border border-destructive/40 text-destructive'
          : 'text-muted-foreground',
      )}
    >
      {errorMessage ??
        (saveState === 'saved'
          ? '设置已保存。'
          : saveState === 'saving'
            ? '正在保存设置...'
            : defaultMessage)}
    </div>
  );
}

function GitSyncFeedback({
  message,
  state,
}: {
  message: string | null;
  state: 'idle' | 'saving' | 'syncing' | 'saved' | 'synced' | 'error';
}) {
  const isError = state === 'error';

  return (
    <div
      aria-live="polite"
      className={cn(
        'min-h-8 rounded-md px-2.5 py-1.5 text-xs',
        isError ? 'border border-destructive/40 text-destructive' : 'text-muted-foreground',
      )}
    >
      {message ??
        (state === 'saving'
          ? '正在保存 Git Sync 设置...'
          : state === 'syncing'
            ? '正在同步工作区...'
            : state === 'saved'
              ? 'Git Sync 设置已保存。'
              : 'Git Sync 配置保存在当前工作区。')}
    </div>
  );
}

function SettingsSectionIcon({
  sectionId,
}: {
  sectionId: ConcreteSettingsSectionId;
}) {
  switch (sectionId) {
    case 'preferences':
      return <SlidersHorizontal size={15} />;
    case 'appearance':
      return <Palette size={15} />;
    case 'storage':
      return <Database size={15} />;
    case 'git-sync':
      return <GitBranch size={15} />;
    case 'ai-models':
      return <Bot size={15} />;
    case 'ai-skills':
      return <Boxes size={15} />;
    case 'ai-agents':
      return <BrainCircuit size={15} />;
    case 'ai-mcp':
      return <Plug size={15} />;
    case 'ai-plugins':
      return <Puzzle size={15} />;
  }
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
  const Icon =
    variant === 'system' ? Monitor : variant === 'light' ? Sun : Moon;

  return (
    <button
      aria-label={label}
      aria-checked={checked}
      className={cn(
        'group grid min-h-[156px] gap-2 rounded-lg border bg-background/80 p-2 text-left transition-colors hover:border-[#3574f0]/60 hover:bg-background',
        checked
          ? 'border-[#3574f0]'
          : 'border-border',
      )}
      data-testid={testId}
      role="radio"
      type="button"
      onClick={onClick}
    >
      <div className="relative h-24 overflow-hidden rounded-md border border-border/70 bg-muted/30 transition-colors group-hover:border-[#3574f0]/35">
        <ThemeArticlePreview variant={variant} />
        {checked ? (
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#3574f0] text-white shadow-sm">
            <CheckCircle2 size={13} strokeWidth={2.2} />
          </span>
        ) : null}
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
          dark
            ? 'border-white/10 bg-[#242932]'
            : 'border-slate-200 bg-white',
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
        <div
          className={cn(
            'mt-2 grid gap-1 rounded border-l-2 py-1 pl-2',
            dark
              ? 'border-[#60a5fa] bg-white/5'
              : 'border-[#3574f0] bg-[#eff6ff]',
          )}
        >
          <PreviewLine mode={mode} width="w-10/12" />
          <PreviewLine mode={mode} width="w-7/12" />
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
      aria-label={label}
      aria-checked={checked}
      className={cn(
        'group grid min-h-32 gap-2 rounded-lg border bg-background/80 p-2 text-left transition-colors hover:border-[#3574f0]/60 hover:bg-background',
        checked
          ? 'border-[#3574f0]'
          : 'border-border',
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
        {checked ? (
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-[#3574f0] text-white shadow-sm">
            <CheckCircle2 size={13} strokeWidth={2.2} />
          </span>
        ) : null}
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

function normalizeSearchTerm(term: string) {
  return term.trim().toLowerCase();
}

function normalizeSettingsSectionId(
  sectionId: SettingsSectionId,
): ConcreteSettingsSectionId {
  return sectionId === 'ai' ? 'ai-models' : sectionId;
}

function isAiSettingsSectionId(
  sectionId: ConcreteSettingsSectionId,
): sectionId is Extract<
  ConcreteSettingsSectionId,
  'ai-models' | 'ai-skills' | 'ai-agents' | 'ai-mcp' | 'ai-plugins'
> {
  return sectionId.startsWith('ai-');
}

function matchesSearchTerms(query: string, terms: string[]) {
  if (!query) {
    return true;
  }

  return terms.some((term) => normalizeSearchTerm(term).includes(query));
}

function withDefaultGitSyncSettings(
  settings?: Partial<WorkspaceGitSyncSettings> | null,
): WorkspaceGitSyncSettings {
  const interval =
    settings?.intervalMinutes ?? DEFAULT_GIT_SYNC_SETTINGS.intervalMinutes;
  const conflictResolution =
    settings?.conflictResolution ??
    DEFAULT_GIT_SYNC_SETTINGS.conflictResolution;

  return {
    conflictResolution: isGitSyncConflictResolution(conflictResolution)
      ? conflictResolution
      : DEFAULT_GIT_SYNC_SETTINGS.conflictResolution,
    enabled: settings?.enabled ?? DEFAULT_GIT_SYNC_SETTINGS.enabled,
    intervalMinutes: [1, 2, 3, 5, 10, 15, 30, 60].includes(interval)
      ? interval
      : DEFAULT_GIT_SYNC_SETTINGS.intervalMinutes,
    lastSyncedAt: settings?.lastSyncedAt ?? null,
  };
}

function isGitSyncConflictResolution(
  value: string,
): value is GitSyncConflictResolution {
  return value === 'abort' || value === 'local' || value === 'remote';
}

function formatGitSyncTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function mergeSystemFontOptions(options: SystemFontOptions): SystemFontOptions {
  return {
    code: ensureFontOptionList(options.code, [
      options.recommendations.code,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.code,
    ]),
    document: ensureFontOptionList(options.document, [
      options.recommendations.document,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.document,
    ]),
    recommendations: {
      ...FALLBACK_SYSTEM_FONT_OPTIONS.recommendations,
      ...options.recommendations,
    },
    ui: ensureFontOptionList(options.ui, [
      options.recommendations.ui,
      ...FALLBACK_SYSTEM_FONT_OPTIONS.ui,
    ]),
  };
}

function ensureFontOption(options: string[], value: string) {
  return ensureFontOptionList(options, [value]);
}

function ensureFontOptionList(options: string[], required: string[]) {
  const seen = new Set<string>();
  const nextOptions: string[] = [];

  for (const option of [...required, ...options]) {
    const normalized = option.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    nextOptions.push(normalized);
  }

  return nextOptions;
}

function buildPreviewFontStack(fontFamily: string) {
  return `${quoteCssFontFamily(fontFamily)}, var(--madora-ui-font)`;
}

function quoteCssFontFamily(fontFamily: string) {
  return `'${fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function AccountProviderIcon({ accountId }: { accountId: string }) {
  if (accountId === 'codex') {
    return (
      <svg
        aria-hidden="true"
        className="shrink-0 rounded-sm bg-black"
        height="16"
        viewBox="0 0 256 260"
        width="16"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
          fill="#fff"
        />
      </svg>
    );
  }

  if (accountId === 'claude') {
    return (
      <svg
        aria-hidden="true"
        className="shrink-0"
        fill="#D97757"
        height="16"
        viewBox="0 0 24 24"
        width="16"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
      </svg>
    );
  }

  return <Cpu className="shrink-0" size={15} />;
}

function AccountStatusBadge({
  status,
}: {
  status: AiAssistantAccount['status'];
}) {
  const connected = status === 'connected';
  const label = getAccountStatusLabel(status);

  return (
    <span
      className={cn(
        'flex h-6 items-center gap-1 rounded-md px-2 text-xs',
        connected
          ? 'bg-emerald-50 text-emerald-700'
          : status === 'missing'
            ? 'bg-muted text-muted-foreground'
            : 'bg-amber-50 text-amber-700',
      )}
    >
      {connected ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label}
    </span>
  );
}

function isAnthropicAccount(account: AiAssistantAccount) {
  const providerText = `${account.id} ${account.providerId} ${account.providerLabel}`.toLowerCase();

  return providerText.includes('claude') || providerText.includes('anthropic');
}

function getAccountStatusLabel(status: AiAssistantAccount['status']) {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'detected':
      return '已检测';
    case 'misconfigured':
      return '需要配置';
    case 'missing':
      return '缺失';
  }
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
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
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

function ReadonlyField({
  action,
  label,
  value,
}: {
  action?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <label className="grid gap-3 border-b border-border/60 px-5 py-4 text-sm last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <Input
          className="h-9 min-w-0 rounded-lg border-border/60 bg-background/70 font-mono text-xs"
          readOnly
          value={value}
        />
        {action}
      </span>
    </label>
  );
}

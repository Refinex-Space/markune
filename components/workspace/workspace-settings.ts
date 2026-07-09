import type {
  AiConfiguredProfile,
  AiPreferredEditor,
  AiSettings,
  AppearanceFontSettings,
  AppSettings,
} from './workspace-types';
import {
  createDefaultAiProviderSettings,
  normalizeAiProviderSettings,
} from './ai-provider/provider-settings';

export const DEFAULT_AI_PROFILE: AiConfiguredProfile = {
  enabled: true,
  id: 'fake-echo',
  isTestRuntime: true,
  kind: 'fake',
  label: 'Fake Echo',
  modelId: 'fake-echo',
  modelLabel: 'fake-echo',
  providerId: 'local',
  providerLabel: 'Local',
};

export const AI_PREFERRED_EDITOR_OPTIONS = [
  { label: 'Cursor', value: 'cursor' },
  { label: 'Zed', value: 'zed' },
  { label: 'Sublime Text', value: 'sublime' },
  { label: 'Xcode', value: 'xcode' },
  { label: 'Windsurf', value: 'windsurf' },
  { label: 'Trae', value: 'trae' },
  { label: 'iTerm', value: 'iterm' },
  { label: 'Warp', value: 'warp' },
  { label: 'Terminal', value: 'terminal' },
  { label: 'Ghostty', value: 'ghostty' },
  { label: 'VS Code', value: 'vscode' },
  { label: 'VS Code Insiders', value: 'vscode-insiders' },
  { label: 'IntelliJ IDEA', value: 'intellij' },
  { label: 'WebStorm', value: 'webstorm' },
  { label: 'PyCharm', value: 'pycharm' },
  { label: 'PhpStorm', value: 'phpstorm' },
  { label: 'GoLand', value: 'goland' },
  { label: 'CLion', value: 'clion' },
  { label: 'Rider', value: 'rider' },
  { label: 'Fleet', value: 'fleet' },
  { label: 'RustRover', value: 'rustrover' },
] satisfies Array<{ label: string; value: AiPreferredEditor }>;

export function getAiPreferredEditorLabel(editor: AiPreferredEditor) {
  return (
    AI_PREFERRED_EDITOR_OPTIONS.find((option) => option.value === editor)
      ?.label ?? 'Cursor'
  );
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  analyticsOptOut: false,
  autoAdvanceTarget: 'next',
  customClaudeConfig: {
    baseUrl: '',
    model: '',
  },
  ctrlTabTarget: 'workspaces',
  defaultAgentMode: 'agent',
  desktopNotificationsEnabled: true,
  enabledProfileId: DEFAULT_AI_PROFILE.id,
  extendedThinkingEnabled: true,
  hiddenModelIds: ['gpt-5.1-codex-max', 'gpt-5.1-codex-mini'],
  includeCoAuthoredBy: true,
  lastSelectedCodexModelId: 'gpt-5.3-codex',
  lastSelectedCodexThinking: 'high',
  lastSelectedModelId: 'opus',
  notifyWhenFocused: false,
  preferredEditor: 'cursor',
  profiles: [DEFAULT_AI_PROFILE],
  providers: createDefaultAiProviderSettings(),
  settingsSidebarWidths: {
    agents: 240,
    mcp: 240,
    plugins: 240,
    skills: 240,
  },
  soundNotificationsEnabled: true,
};

export const DEFAULT_APPEARANCE_FONTS: AppearanceFontSettings = {
  code: 'JetBrains Mono',
  document: 'Songti SC',
  ui: 'SF Pro Text',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ai: DEFAULT_AI_SETTINGS,
  appearance: {
    fonts: DEFAULT_APPEARANCE_FONTS,
    pageWidthMode: 'wide',
  },
  schemaVersion: 1,
  storage: {
    defaultProvider: 'local',
  },
};

export function withDefaultAppSettings(
  settings: Partial<AppSettings> & {
    appearance?: Partial<AppSettings['appearance']> & {
      fonts?: Partial<AppearanceFontSettings>;
    };
  },
): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    ai: withDefaultAiSettings(settings.ai),
    appearance: {
      ...DEFAULT_APP_SETTINGS.appearance,
      ...settings.appearance,
      fonts: {
        ...DEFAULT_APP_SETTINGS.appearance.fonts,
        ...settings.appearance?.fonts,
      },
    },
    storage: {
      ...DEFAULT_APP_SETTINGS.storage,
      ...settings.storage,
    },
  };
}

function withDefaultAiSettings(settings?: Partial<AiSettings>): AiSettings {
  const profiles =
    settings?.profiles && settings.profiles.length > 0
      ? settings.profiles.map(withDefaultAiProfile)
      : DEFAULT_AI_SETTINGS.profiles;
  const requestedEnabledProfileId =
    settings && 'enabledProfileId' in settings
      ? settings.enabledProfileId
      : DEFAULT_AI_SETTINGS.enabledProfileId;
  const selectedProfile = profiles.find(
    (profile) => profile.id === requestedEnabledProfileId && profile.enabled,
  );

  return {
    analyticsOptOut:
      settings?.analyticsOptOut ?? DEFAULT_AI_SETTINGS.analyticsOptOut,
    autoAdvanceTarget:
      settings?.autoAdvanceTarget === 'previous' ||
      settings?.autoAdvanceTarget === 'close'
        ? settings.autoAdvanceTarget
        : DEFAULT_AI_SETTINGS.autoAdvanceTarget,
    customClaudeConfig: {
      baseUrl:
        typeof settings?.customClaudeConfig?.baseUrl === 'string'
          ? settings.customClaudeConfig.baseUrl
          : DEFAULT_AI_SETTINGS.customClaudeConfig.baseUrl,
      model:
        typeof settings?.customClaudeConfig?.model === 'string'
          ? settings.customClaudeConfig.model
          : DEFAULT_AI_SETTINGS.customClaudeConfig.model,
    },
    ctrlTabTarget:
      settings?.ctrlTabTarget === 'agents'
        ? 'agents'
        : DEFAULT_AI_SETTINGS.ctrlTabTarget,
    defaultAgentMode:
      settings?.defaultAgentMode === 'plan' ? 'plan' : DEFAULT_AI_SETTINGS.defaultAgentMode,
    desktopNotificationsEnabled:
      settings?.desktopNotificationsEnabled ??
      DEFAULT_AI_SETTINGS.desktopNotificationsEnabled,
    enabledProfileId: selectedProfile?.id ?? null,
    extendedThinkingEnabled:
      settings?.extendedThinkingEnabled ?? DEFAULT_AI_SETTINGS.extendedThinkingEnabled,
    hiddenModelIds:
      settings?.hiddenModelIds && settings.hiddenModelIds.length > 0
        ? settings.hiddenModelIds
        : DEFAULT_AI_SETTINGS.hiddenModelIds,
    includeCoAuthoredBy:
      settings?.includeCoAuthoredBy ?? DEFAULT_AI_SETTINGS.includeCoAuthoredBy,
    lastSelectedCodexModelId:
      settings?.lastSelectedCodexModelId ??
      DEFAULT_AI_SETTINGS.lastSelectedCodexModelId,
    lastSelectedCodexThinking:
      settings?.lastSelectedCodexThinking ??
      DEFAULT_AI_SETTINGS.lastSelectedCodexThinking,
    lastSelectedModelId:
      settings?.lastSelectedModelId ?? DEFAULT_AI_SETTINGS.lastSelectedModelId,
    notifyWhenFocused:
      settings?.notifyWhenFocused ?? DEFAULT_AI_SETTINGS.notifyWhenFocused,
    preferredEditor: normalizePreferredEditor(settings?.preferredEditor),
    profiles,
    providers: normalizeAiProviderSettings(settings?.providers),
    settingsSidebarWidths: normalizeAiSettingsSidebarWidths(
      settings?.settingsSidebarWidths,
    ),
    soundNotificationsEnabled:
      settings?.soundNotificationsEnabled ??
      DEFAULT_AI_SETTINGS.soundNotificationsEnabled,
  };
}

function normalizeAiSettingsSidebarWidths(
  widths?: Partial<AiSettings['settingsSidebarWidths']>,
): AiSettings['settingsSidebarWidths'] {
  return {
    agents: normalizeAiSettingsSidebarWidth(widths?.agents),
    mcp: normalizeAiSettingsSidebarWidth(widths?.mcp),
    plugins: normalizeAiSettingsSidebarWidth(widths?.plugins),
    skills: normalizeAiSettingsSidebarWidth(widths?.skills),
  };
}

function normalizeAiSettingsSidebarWidth(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 240;
  }

  return Math.min(Math.max(Math.round(value), 200), 400);
}

function normalizePreferredEditor(value?: string): AiSettings['preferredEditor'] {
  const supportedEditors = new Set<AiSettings['preferredEditor']>(
    AI_PREFERRED_EDITOR_OPTIONS.map((option) => option.value),
  );

  return supportedEditors.has(value as AiSettings['preferredEditor'])
    ? (value as AiSettings['preferredEditor'])
    : DEFAULT_AI_SETTINGS.preferredEditor;
}

function withDefaultAiProfile(
  profile: Partial<AiConfiguredProfile>,
): AiConfiguredProfile {
  const base =
    profile.id === DEFAULT_AI_PROFILE.id ? DEFAULT_AI_PROFILE : undefined;

  return {
    enabled: profile.enabled ?? base?.enabled ?? false,
    id: profile.id ?? base?.id ?? '',
    isTestRuntime: profile.isTestRuntime ?? base?.isTestRuntime ?? false,
    kind: profile.kind ?? base?.kind ?? 'provider',
    label: profile.label ?? base?.label ?? '未命名模型',
    modelId: profile.modelId ?? base?.modelId ?? '',
    modelLabel: profile.modelLabel ?? base?.modelLabel ?? profile.modelId ?? '',
    providerId: profile.providerId ?? base?.providerId ?? '',
    providerLabel:
      profile.providerLabel ?? base?.providerLabel ?? profile.providerId ?? '',
  };
}

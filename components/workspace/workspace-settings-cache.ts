import type {
  AiAgentProfile,
  AiAssistantAccount,
} from './ai-panel/ai-types';
import type {
  AiAnthropicAccountItem,
  AiCommandItem,
  AiCustomAgentItem,
  AiMcpServerItem,
  AiPluginItem,
  AiSkillItem,
} from './ai-settings/ai-settings-types';
import type {
  AppSettings,
  GitProbe,
  GitRemoteInfo,
  SystemFontOptions,
  WorkspaceGitSyncSettings,
} from './workspace-types';

export interface WorkspaceSettingsCacheEntry {
  aiAnthropicAccounts?: AiAnthropicAccountItem[];
  aiCommands?: AiCommandItem[];
  aiCustomAgents?: AiCustomAgentItem[];
  aiMcpServers?: AiMcpServerItem[];
  aiPlugins?: AiPluginItem[];
  aiSkills?: AiSkillItem[];
  detectedAccounts?: AiAssistantAccount[];
  gitProbe?: GitProbe | null;
  gitRemote?: GitRemoteInfo;
  gitSyncSettings?: WorkspaceGitSyncSettings;
  runtimeProfiles?: AiAgentProfile[];
  settings?: AppSettings;
}

export interface WorkspaceSettingsSessionCache {
  entries: Map<string, WorkspaceSettingsCacheEntry>;
  inFlight: Map<string, Promise<void>>;
  systemFonts?: SystemFontOptions;
}

export function createWorkspaceSettingsSessionCache(): WorkspaceSettingsSessionCache {
  return { entries: new Map(), inFlight: new Map() };
}

export function loadWorkspaceSettingsResource(
  cache: WorkspaceSettingsSessionCache,
  resourceKey: string,
  loader: () => Promise<void>,
) {
  const current = cache.inFlight.get(resourceKey);

  if (current) {
    return current;
  }

  const next = loader().finally(() => {
    cache.inFlight.delete(resourceKey);
  });

  cache.inFlight.set(resourceKey, next);
  return next;
}

export function getWorkspaceSettingsCacheEntry(
  cache: WorkspaceSettingsSessionCache,
  workspaceRootPath: string | null,
) {
  const key = workspaceRootPath ?? '__global__';
  const existing = cache.entries.get(key);

  if (existing) {
    return existing;
  }

  const entry: WorkspaceSettingsCacheEntry = {};
  cache.entries.set(key, entry);
  return entry;
}

export function updateWorkspaceSettingsCacheEntry(
  cache: WorkspaceSettingsSessionCache,
  workspaceRootPath: string | null,
  update: (entry: WorkspaceSettingsCacheEntry) => void,
) {
  update(getWorkspaceSettingsCacheEntry(cache, workspaceRootPath));
}

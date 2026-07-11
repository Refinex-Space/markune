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
  systemFonts?: SystemFontOptions;
}

export function createWorkspaceSettingsSessionCache(): WorkspaceSettingsSessionCache {
  return { entries: new Map() };
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

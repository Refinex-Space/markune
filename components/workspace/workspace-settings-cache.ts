import type {
  AppSettings,
  GitProbe,
  GitRemoteInfo,
  SystemFontOptions,
  WorkspaceGitSyncSettings,
} from './workspace-types';

export interface WorkspaceSettingsCacheEntry {
  gitProbe?: GitProbe | null;
  gitRemote?: GitRemoteInfo;
  gitSyncSettings?: WorkspaceGitSyncSettings;
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

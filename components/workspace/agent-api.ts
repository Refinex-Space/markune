import type { McpServer } from '@agentclientprotocol/sdk';
import { isTauriRuntime } from './workspace-api';
import catalogSnapshot from '../../src-tauri/resources/agents/catalog.json';

export interface AgentProfile {
  id: string;
  agentId: string;
  name: string;
  executable: string;
  args: string[];
  env: Record<string, string>;
  secretKeys: string[];
  version: string | null;
  managedPath: string | null;
  mcpEnabled: boolean;
  enabled: boolean;
}
export interface AgentCatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  authors?: string[];
  website?: string;
  repository?: string;
  license?: string;
  license_url?: string;
  distribution: {
    npx?: { package: string; args?: string[] };
    binary?: Record<
      string,
      { archive: string; cmd: string; args?: string[]; sha256?: string }
    >;
  };
}
export interface AgentCatalog {
  agents: AgentCatalogEntry[];
  profiles: AgentProfile[];
  platform: string;
  digest: string;
  defaultProfileId: string | null;
  localAgents: { agentId: string; executable: string; args: string[] }[];
}
export interface AgentConnectionInfo {
  connectionId: string;
  profile: AgentProfile;
  rootPath: string;
  mcpServers: McpServer[];
}
export async function agentInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauriRuntime()) throw new Error('智能体进程仅在 Markune 桌面端运行');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
export async function loadAgentCatalog(refresh = false): Promise<AgentCatalog> {
  if (!isTauriRuntime())
    return {
      agents: catalogSnapshot.agents as AgentCatalogEntry[],
      profiles: [],
      platform: 'web',
      digest: '',
      defaultProfileId: null,
      localAgents: [],
    };
  return agentInvoke('agent_catalog', { refresh });
}
export async function installAgent(agentId: string, catalogDigest: string) {
  const profile = await agentInvoke<AgentProfile>('agent_install', {
    agentId,
    catalogDigest,
  });
  changed();
  return profile;
}
export async function attachLocalAgent(agentId: string) {
  const profile = await agentInvoke<AgentProfile>('agent_use_local', {
    agentId,
  });
  changed();
  return profile;
}
export async function saveAgentProfile(
  value: AgentProfile,
  programGrant: string | null = null,
) {
  const profile = await agentInvoke<AgentProfile>('agent_save_profile', {
    value,
    programGrant,
  });
  changed();
  return profile;
}
export async function uninstallAgent(profileId: string) {
  await agentInvoke('agent_uninstall', { profileId });
  changed();
}
function changed() {
  window.dispatchEvent(new Event('markune:agents-changed'));
}
export function agentError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '智能体操作失败';
  if (/active writer|already.*loaded|session.*in use/i.test(message))
    return '这个会话正在其他连接中使用。请关闭原连接后重试，或新建会话。';
  if (
    /auth.*required|not authenticated|unauthorized|login required/i.test(
      message,
    )
  )
    return '此智能体需要登录，请完成登录后重新连接。';
  return message;
}

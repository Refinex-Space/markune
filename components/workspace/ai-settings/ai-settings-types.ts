export type AiFileSource = 'plugin' | 'project' | 'user';

export interface AiSkillItem {
  name: string;
  description: string;
  source: AiFileSource;
  pluginName?: string | null;
  path: string;
  content: string;
}

export interface AiCommandItem {
  name: string;
  description: string;
  argumentHint?: string | null;
  source: AiFileSource;
  pluginName?: string | null;
  path: string;
  content: string;
}

export interface AiSkillWriteInput {
  source: 'project' | 'user';
  name: string;
  description: string;
  content: string;
}

export interface AiSkillDeleteInput {
  source: 'project' | 'user';
  name: string;
}

export interface AiCommandWriteInput {
  source: 'project' | 'user';
  name: string;
  description: string;
  content: string;
  argumentHint?: string | null;
}

export interface AiCommandDeleteInput {
  source: 'project' | 'user';
  name: string;
}

export interface AiCustomAgentItem {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  disallowedTools: string[];
  model?: 'haiku' | 'inherit' | 'opus' | 'sonnet' | null;
  source: AiFileSource;
  pluginName?: string | null;
  path: string;
}

export interface AiCustomAgentWriteInput {
  source: 'project' | 'user';
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  disallowedTools: string[];
  model?: 'haiku' | 'inherit' | 'opus' | 'sonnet' | null;
}

export interface AiCustomAgentDeleteInput {
  source: 'project' | 'user';
  name: string;
}

export interface AiPluginComponent {
  name: string;
  description?: string | null;
}

export interface AiPluginComponents {
  commands: AiPluginComponent[];
  skills: AiPluginComponent[];
  agents: AiPluginComponent[];
  mcpServers: string[];
}

export interface AiPluginItem {
  name: string;
  version: string;
  description?: string | null;
  path: string;
  source: string;
  marketplace: string;
  category?: string | null;
  homepage?: string | null;
  tags: string[];
  isDisabled: boolean;
  components: AiPluginComponents;
}

export interface AiMcpServerItem {
  name: string;
  provider: 'claude-code' | 'codex' | string;
  groupName: string;
  projectPath?: string | null;
  source: 'global' | 'plugin' | 'project' | string;
  status: string;
  enabled: boolean;
  connectionType: 'http' | 'stdio' | 'unknown' | string;
  command?: string | null;
  args: string[];
  url?: string | null;
  envKeys: string[];
  authType?: 'none' | 'oauth' | 'bearer' | string | null;
  authStatus?: string | null;
  hasAuthHeader?: boolean;
  needsAuth?: boolean;
  pluginName?: string | null;
  error?: string | null;
  tools?: Array<{
    name: string;
    description?: string | null;
  }>;
}

export interface AiMcpServerWriteInput {
  provider?: 'claude-code' | 'codex' | string;
  source: 'global' | 'project';
  name: string;
  connectionType: 'http' | 'stdio';
  command?: string | null;
  args: string[];
  url?: string | null;
  env: Record<string, string>;
  authType?: 'none' | 'oauth' | 'bearer' | string | null;
  bearerToken?: string | null;
}

export type AiMcpServerUpdateInput = AiMcpServerWriteInput;

export interface AiMcpServerToggleInput {
  provider?: 'claude-code' | 'codex' | string;
  source: 'global' | 'project';
  name: string;
  enabled: boolean;
}

export interface AiMcpServerDeleteInput {
  provider?: 'claude-code' | 'codex' | string;
  source: 'global' | 'project';
  name: string;
}

export interface AiMcpServerAuthInput {
  provider: 'claude-code' | 'codex' | string;
  name: string;
  projectPath?: string | null;
}

export interface AiAnthropicAccountItem {
  id: string;
  email?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
  lastUsedAt?: string | null;
  isActive: boolean;
}

export interface AiAnthropicAccountImportInput {
  token: string;
  email?: string | null;
  displayName?: string | null;
}

export interface AiClaudeCodeAuthStartResult {
  sandboxId: string;
  sandboxUrl: string;
  sessionId: string;
}

export interface AiClaudeCodeAuthStatusInput {
  sandboxUrl: string;
  sessionId: string;
}

export interface AiClaudeCodeAuthStatus {
  state: string;
  oauthUrl?: string | null;
  error?: string | null;
}

export interface AiClaudeCodeAuthCodeInput {
  sandboxUrl: string;
  sessionId: string;
  code: string;
}

export interface AiClaudeCodeAuthSuccessResult {
  success: boolean;
}

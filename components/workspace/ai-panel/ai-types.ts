import type { AiConfiguredProfileKind } from '@/components/workspace/workspace-types';

export type AiAgentProfileKind = AiConfiguredProfileKind;

export type AiDetectionStatus = 'available' | 'missing' | 'misconfigured';
export type AiAccountStatus =
  | 'connected'
  | 'detected'
  | 'missing'
  | 'misconfigured';

export type AiIntent =
  | 'chat'
  | 'summarize-document'
  | 'explain-selection'
  | 'generate-outline';

export interface AiAgentCapabilities {
  readWorkspace: boolean;
  writeWorkspace: boolean;
  shell: boolean;
  diff: boolean;
  models: boolean;
  slashCommands: boolean;
}

export interface AiAgentProfile {
  id: string;
  label: string;
  kind: AiAgentProfileKind;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  isTestRuntime: boolean;
  command?: string;
  args?: string[];
  envKeys?: string[];
  cwdMode?: 'workspaceRoot' | 'home' | 'fixed';
  capabilities: AiAgentCapabilities;
  detection: {
    status: AiDetectionStatus;
    message?: string;
  };
}

export interface AiDetectedModel {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  profileId: string;
  available: boolean;
}

export interface AiAssistantAccount {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  status: AiAccountStatus;
  commandPath?: string;
  version?: string;
  transport?: string;
  message?: string;
  models: AiDetectedModel[];
}

export interface CodexLogoutResult {
  success: boolean;
  state: string;
  isConnected: boolean;
  logoutExitCode?: number | null;
  logoutOutput: string;
  statusOutput: string;
}

export interface CodexIntegrationStatus {
  state: 'connected_chatgpt' | 'connected_api_key' | 'not_logged_in' | 'unknown' | string;
  isConnected: boolean;
  rawOutput: string;
  exitCode?: number | null;
}

export interface CodexLoginSession {
  sessionId: string;
  state: 'running' | 'success' | 'error' | 'cancelled' | string;
  url?: string | null;
  output: string;
  error?: string | null;
  exitCode?: number | null;
}

export interface CodexLoginCancelResult {
  success: boolean;
  found: boolean;
  session?: CodexLoginSession | null;
}

export interface CodexLoginOpenUrlResult {
  success: boolean;
}

export interface AiContextPack {
  workspaceRootPath: string;
  document?: {
    path: string;
    title: string;
    markdown: string;
    modifiedAt: number | null;
    contentHash: string;
    dirty: boolean;
  };
  references?: AiContextReference[];
  selection?: {
    markdown: string;
    from: number;
    to: number;
  };
  toc?: Array<{
    depth: number;
    text: string;
    line?: number;
  }>;
  intent: AiIntent;
}

export interface AiContextReference {
  path: string;
  relativePath: string;
  title: string;
  markdown: string;
  modifiedAt: number | null;
  contentHash: string;
  source:
    | 'agent'
    | 'attached-file'
    | 'command'
    | 'current-document'
    | 'file'
    | 'mcp-tool'
    | 'pasted-text'
    | 'skill';
}

export interface StartAiSessionInput {
  agentMode?: 'agent' | 'plan';
  codexThinking?: 'low' | 'medium' | 'high' | 'xhigh';
  context: AiContextPack;
  extendedThinking?: boolean;
  modelId?: string;
  profileId: string;
  rootPath: string;
}

export interface SendAiPromptInput {
  context: AiContextPack;
  prompt: string;
  sessionId: string;
}

export interface RespondAiPermissionInput {
  sessionId: string;
  requestId: string;
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  updatedPermissions?: Array<Record<string, unknown>>;
  denyMessage?: string;
  interrupt?: boolean;
}

export interface AiSessionInfo {
  profileId: string;
  rootPath: string;
  sessionId: string;
  status: 'running' | 'stopped';
}

export type AiRuntimeEvent =
  | {
      type: 'sessionStarted';
      session: AiSessionInfo;
    }
  | {
      type: 'messageDelta';
      sessionId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'messageCompleted';
      sessionId: string;
      messageId: string;
    }
  | {
      type: 'turnCompleted';
      sessionId: string;
      cancelled: boolean;
    }
  | {
      type: 'runState';
      sessionId: string;
      state: string;
      exitCode?: number;
      error?: string;
    }
  | {
      type: 'thinkingDelta';
      sessionId: string;
      messageId: string;
      delta: string;
      parentToolCallId?: string;
    }
  | {
      type: 'toolStarted';
      sessionId: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      parentToolCallId?: string;
    }
  | {
      type: 'toolInputDelta';
      sessionId: string;
      toolCallId: string;
      partialJson: string;
      parentToolCallId?: string;
    }
  | {
      type: 'toolCompleted';
      sessionId: string;
      toolCallId: string;
      toolName: string;
      output: Record<string, unknown>;
      status: AiPanelToolStatus;
      durationMs?: number;
      parentToolCallId?: string;
    }
  | {
      type: 'permissionPrompt';
      sessionId: string;
      requestId: string;
      toolCallId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      reason: string;
      parentToolCallId?: string;
      suggestions?: AiPanelPermissionSuggestion[];
    }
  | {
      type: 'permissionDenied';
      sessionId: string;
      toolCallId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  | {
      type: 'usageUpdated';
      sessionId: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      totalCostUsd?: number;
      model?: string;
    }
  | {
      type: 'sessionExited';
      sessionId: string;
    }
  | {
      type: 'error';
      sessionId?: string;
      message: string;
    };

export interface AiPanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export type AiPanelToolStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'denied'
  | 'permissionPrompt';

export interface AiPanelPermissionSuggestion {
  id: string;
  label: string;
  description?: string;
}

export interface AiPanelToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: AiPanelToolStatus;
  output?: Record<string, unknown>;
  durationMs?: number;
  parentToolCallId?: string;
  permissionRequestId?: string;
  partialJson?: string;
}

export interface AiPanelThinkingBlock {
  id: string;
  content: string;
  parentToolCallId?: string;
}

export interface AiPanelPermissionRequest {
  requestId: string;
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
  parentToolCallId?: string;
  suggestions?: AiPanelPermissionSuggestion[];
}

export interface AiPanelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCostUsd?: number;
  model?: string;
}

export interface AiPanelRunState {
  state: string;
  exitCode?: number;
  error?: string;
}

export interface AiConversationRecord {
  id: string;
  title: string;
  profileId: string;
  profileLabel: string;
  providerId: string;
  providerLabel: string;
  createdAt: number;
  updatedAt: number;
  documentPath?: string;
  documentTitle?: string;
  references?: AiContextReference[];
  messages: AiConversationMessage[];
  thinking?: AiPanelThinkingBlock[];
  tools: AiPanelToolCall[];
  permissions: AiPanelPermissionRequest[];
  usage?: AiPanelUsage | null;
  runState?: AiPanelRunState | null;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  profileId: string;
  profileLabel: string;
  providerId: string;
  providerLabel: string;
  createdAt: number;
  updatedAt: number;
  documentPath?: string;
  documentTitle?: string;
  messageCount: number;
}

export type AiPanelStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'error'
  | 'stopped';

export interface AiPanelState {
  error: string | null;
  messages: AiPanelMessage[];
  permissions: AiPanelPermissionRequest[];
  profiles: AiAgentProfile[];
  runState: AiPanelRunState | null;
  selectedProfileId: string | null;
  session: AiSessionInfo | null;
  status: AiPanelStatus;
  thinking: AiPanelThinkingBlock[];
  tools: AiPanelToolCall[];
  usage: AiPanelUsage | null;
}

export type AiPanelAction =
  | {
      type: 'profilesLoaded';
      profiles: AiAgentProfile[];
      selectedProfileId?: string | null;
    }
  | { type: 'profileSelected'; profileId: string }
  | { type: 'connectRequested' }
  | { type: 'userMessageSubmitted'; id: string; content: string }
  | { type: 'conversationRestored'; conversation: AiConversationRecord }
  | { type: 'runtimeEventReceived'; event: AiRuntimeEvent }
  | { type: 'errorRaised'; message: string }
  | { type: 'sessionCleared' }
  | { type: 'cleared' };

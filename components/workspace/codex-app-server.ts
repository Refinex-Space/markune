'use client';

import type { UnlistenFn } from '@tauri-apps/api/event';

export interface CodexRuntimeInfo {
  available: boolean;
  running: boolean;
  binarySource: string | null;
  version: string | null;
  storageMode: 'sharedCodexHome';
  storageRoot: string | null;
  message: string | null;
}

export type CodexRequestId = number | string;

export interface CodexProtocolMessage {
  id?: CodexRequestId;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export interface CodexDynamicToolRequest {
  arguments: Record<string, unknown>;
  callId: string;
  namespace: 'madora_drawing';
  threadId: string;
  tool: 'create_from_preview' | 'preview_mermaid';
  turnId: string;
}

export interface CodexDynamicToolResponse {
  imageDataUrl?: string;
  success: boolean;
  text: string;
}

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: Array<{
    reasoningEffort: CodexReasoningEffort;
    description: string;
  }>;
}

export type CodexReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra';

export interface CodexThread {
  id: string;
  name: string | null;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  status: unknown;
  turns: CodexTurn[];
}

export interface CodexTurn {
  id: string;
  status: string;
  items: CodexThreadItem[];
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

export interface CodexTokenUsageBreakdown {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CodexThreadTokenUsage {
  last: CodexTokenUsageBreakdown;
  modelContextWindow: number | null;
  total: CodexTokenUsageBreakdown;
}

export interface CodexThreadTokenUsageUpdate {
  threadId: string;
  tokenUsage: CodexThreadTokenUsage;
  turnId: string;
}

export type CodexThreadGoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'usageLimited'
  | 'budgetLimited'
  | 'complete';

export interface CodexThreadGoal {
  createdAt: number;
  objective: string;
  status: CodexThreadGoalStatus;
  threadId: string;
  timeUsedSeconds: number;
  tokenBudget: number | null;
  tokensUsed: number;
  updatedAt: number;
}

export interface CodexThreadGoalGetResponse {
  goal: CodexThreadGoal | null;
}

export interface CodexThreadGoalSetResponse {
  goal: CodexThreadGoal;
}

export interface CodexThreadGoalClearResponse {
  cleared: boolean;
}

export type CodexThreadGoalUpdate =
  | {
      goal: CodexThreadGoal;
      threadId: string;
      turnId: string | null;
      type: 'updated';
    }
  | {
      threadId: string;
      type: 'cleared';
    };

export type CodexThreadItem = Record<string, unknown> & {
  id?: string;
  type?: string;
};

export interface CodexAccountResponse {
  account:
    | { type: 'apiKey' }
    | { type: 'chatgpt'; email: string | null; planType: string }
    | { type: 'amazonBedrock'; credentialSource: unknown }
    | null;
  requiresOpenaiAuth: boolean;
}

export interface CodexModelListResponse {
  data: CodexModel[];
  nextCursor: string | null;
}

export type CodexCollaborationModeKind = 'default' | 'plan';

export interface CodexCollaborationModeMask {
  mode: CodexCollaborationModeKind | null;
  model: string | null;
  name: string;
  reasoning_effort: CodexReasoningEffort | null;
}

export interface CodexCollaborationModeListResponse {
  data: CodexCollaborationModeMask[];
}

export interface CodexCollaborationMode {
  mode: CodexCollaborationModeKind;
  settings: {
    developer_instructions: null;
    model: string;
    reasoning_effort: CodexReasoningEffort;
  };
}

export interface CodexUserInputOption {
  description: string;
  id: string;
  isOther: boolean;
  label: string;
}

export interface CodexUserInputQuestion {
  header: string;
  id: string;
  isSecret: boolean;
  options: CodexUserInputOption[];
  question: string;
}

export interface CodexUserInputRequest {
  autoResolutionMs: number | null;
  questions: CodexUserInputQuestion[];
}

export interface CodexUserInputAnswer {
  note: string | null;
  optionId: string | null;
  questionId: string;
}

export interface CodexThreadListResponse {
  data: CodexThread[];
  nextCursor: string | null;
}

export type CodexApprovalPolicy = 'never' | 'on-request' | 'untrusted';

export type CodexApprovalsReviewer =
  | 'auto_review'
  | 'guardian_subagent'
  | 'user';

export interface CodexActivePermissionProfile {
  extends: string | null;
  id: string;
}

export interface CodexThreadPermissionSettings {
  activePermissionProfile: CodexActivePermissionProfile | null;
  approvalPolicy: CodexApprovalPolicy;
  approvalsReviewer: CodexApprovalsReviewer;
}

export interface CodexPermissionProfileSummary {
  allowed: boolean;
  description: string | null;
  id: string;
}

export interface CodexPermissionProfileListResponse {
  data: CodexPermissionProfileSummary[];
  nextCursor: string | null;
}

export interface CodexConfigRequirementsResponse {
  requirements: {
    allowedApprovalPolicies?: unknown[] | null;
    allowedApprovalsReviewers?: CodexApprovalsReviewer[] | null;
    allowedPermissionProfiles?: Record<string, boolean> | null;
    defaultPermissions?: string | null;
  } | null;
}

export interface CodexExperimentalFeatureListResponse {
  data: Array<{
    defaultEnabled: boolean;
    enabled: boolean;
    name: string;
    stage: 'beta' | 'deprecated' | 'removed' | 'stable' | 'underDevelopment';
  }>;
  nextCursor: string | null;
}

export interface CodexContextAttachment {
  attachmentId: string;
  isImage: boolean;
  kind: 'file' | 'folder';
  name: string;
}

export interface CodexPluginSummary {
  availability: 'AVAILABLE' | 'DISABLED_BY_ADMIN';
  enabled: boolean;
  id: string;
  installed: boolean;
  interface: {
    brandColor?: string | null;
    composerIcon?: string | null;
    composerIconUrl?: string | null;
    displayName: string | null;
    logo?: string | null;
    logoDark?: string | null;
    logoUrl?: string | null;
    logoUrlDark?: string | null;
    shortDescription: string | null;
  } | null;
  name: string;
}

export interface CodexPluginIconData {
  base64Data: string;
  mediaType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/svg+xml' | 'image/webp';
}

export interface CodexPluginInstalledResponse {
  marketplaces: Array<{
    name: string;
    plugins: CodexPluginSummary[];
  }>;
  marketplaceLoadErrors: Array<{
    marketplacePath: string;
    message: string;
  }>;
}

export type CodexSkillScope = 'admin' | 'repo' | 'system' | 'user';

export interface CodexSkillMetadata {
  description: string;
  enabled: boolean;
  interface: {
    brandColor?: string | null;
    defaultPrompt?: string | null;
    displayName?: string | null;
    iconLarge?: string | null;
    iconSmall?: string | null;
    shortDescription?: string | null;
  } | null;
  name: string;
  path: string;
  scope: CodexSkillScope;
  shortDescription?: string | null;
}

export interface CodexSkillsListResponse {
  data: Array<{
    cwd: string;
    errors: Array<{ message: string; path: string }>;
    skills: CodexSkillMetadata[];
  }>;
}

type PendingRequest = {
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
};

type ProtocolSubscriber = (message: CodexProtocolMessage) => void;

export class CodexAppServerClient {
  private nextRequestId = 1000;
  private pending = new Map<CodexRequestId, PendingRequest>();
  private subscribers = new Set<ProtocolSubscriber>();

  subscribe(subscriber: ProtocolSubscriber) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  handleMessage(message: CodexProtocolMessage) {
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);

      if (pending) {
        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(message.error.message || 'Codex App Server 请求失败'),
          );
        } else {
          pending.resolve(message.result);
        }
      }
    }

    for (const subscriber of this.subscribers) {
      subscriber(message);
    }
  }

  async request<T>(method: string, params: Record<string, unknown> = {}) {
    const requestId = this.nextRequestId++;
    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        reject,
        resolve: (value) => resolve(value as T),
      });
    });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('codex_app_server_request', {
        requestId,
        method,
        params,
      });
    } catch (error) {
      this.pending.delete(requestId);
      throw error;
    }

    return response;
  }

  rejectPending(reason: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(reason);
    }
    this.pending.clear();
  }
}

export const codexAppServerClient = new CodexAppServerClient();

export function threadTokenUsageUpdateFromMessage(
  message: CodexProtocolMessage,
): CodexThreadTokenUsageUpdate | null {
  if (message.method !== 'thread/tokenUsage/updated') return null;

  const threadId = nonEmptyString(message.params?.threadId);
  const turnId = nonEmptyString(message.params?.turnId);
  const tokenUsage = asRecord(message.params?.tokenUsage);
  const total = tokenUsage && tokenUsageBreakdownFromValue(tokenUsage.total);
  const last = tokenUsage && tokenUsageBreakdownFromValue(tokenUsage.last);
  const modelContextWindow = tokenUsage?.modelContextWindow;

  if (
    !threadId ||
    !turnId ||
    !total ||
    !last ||
    !(
      modelContextWindow === null ||
      (isNonNegativeInteger(modelContextWindow) && modelContextWindow > 0)
    )
  ) {
    return null;
  }

  return {
    threadId,
    turnId,
    tokenUsage: { last, modelContextWindow, total },
  };
}

export function threadGoalUpdateFromMessage(
  message: CodexProtocolMessage,
): CodexThreadGoalUpdate | null {
  if (message.method === 'thread/goal/cleared') {
    const threadId = nonEmptyString(message.params?.threadId);
    return threadId ? { threadId, type: 'cleared' } : null;
  }
  if (message.method !== 'thread/goal/updated') return null;

  const threadId = nonEmptyString(message.params?.threadId);
  const goal = threadGoalFromValue(message.params?.goal);
  const turnIdValue = message.params?.turnId;
  const turnId =
    turnIdValue === null || turnIdValue === undefined
      ? null
      : nonEmptyString(turnIdValue);
  if (
    !threadId ||
    !goal ||
    goal.threadId !== threadId ||
    (turnIdValue !== null && turnIdValue !== undefined && !turnId)
  ) {
    return null;
  }
  return { goal, threadId, turnId, type: 'updated' };
}

export function threadGoalFromValue(value: unknown): CodexThreadGoal | null {
  const record = asRecord(value);
  if (!record) return null;

  const threadId = nonEmptyString(record.threadId);
  const objective = nonEmptyString(record.objective);
  const status = threadGoalStatusFromValue(record.status);
  const tokenBudget = record.tokenBudget;
  if (
    !threadId ||
    !objective ||
    !status ||
    !(tokenBudget === null || isNonNegativeInteger(tokenBudget)) ||
    !isNonNegativeInteger(record.tokensUsed) ||
    !isNonNegativeInteger(record.timeUsedSeconds) ||
    !isNonNegativeInteger(record.createdAt) ||
    !isNonNegativeInteger(record.updatedAt)
  ) {
    return null;
  }

  return {
    createdAt: record.createdAt,
    objective,
    status,
    threadId,
    timeUsedSeconds: record.timeUsedSeconds,
    tokenBudget,
    tokensUsed: record.tokensUsed,
    updatedAt: record.updatedAt,
  };
}

function threadGoalStatusFromValue(
  value: unknown,
): CodexThreadGoalStatus | null {
  return value === 'active' ||
    value === 'paused' ||
    value === 'blocked' ||
    value === 'usageLimited' ||
    value === 'budgetLimited' ||
    value === 'complete'
    ? value
    : null;
}

function tokenUsageBreakdownFromValue(
  value: unknown,
): CodexTokenUsageBreakdown | null {
  const record = asRecord(value);
  if (!record) return null;

  const fields = [
    'cachedInputTokens',
    'inputTokens',
    'outputTokens',
    'reasoningOutputTokens',
    'totalTokens',
  ] as const;
  if (fields.some((field) => !isNonNegativeInteger(record[field]))) {
    return null;
  }

  return {
    cachedInputTokens: record.cachedInputTokens as number,
    inputTokens: record.inputTokens as number,
    outputTokens: record.outputTokens as number,
    reasoningOutputTokens: record.reasoningOutputTokens as number,
    totalTokens: record.totalTokens as number,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

export async function probeCodexRuntime() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexRuntimeInfo>('codex_runtime_probe');
}

export async function startCodexRuntime(rootPath: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexRuntimeInfo>('codex_runtime_start', { rootPath });
}

export async function stopCodexRuntime() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_runtime_stop');
}

export async function readCodexPluginIcon(path: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexPluginIconData>('read_codex_plugin_icon', { path });
}

export async function selectCodexContextAttachments(
  kind: CodexContextAttachment['kind'],
  remaining: number,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexContextAttachment[] | null>(
    'select_codex_context_attachments',
    { kind, remaining },
  );
}

export async function releaseCodexContextAttachments(
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) return;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('release_codex_context_attachments', { attachmentIds });
}

export async function respondToCodexApproval(
  requestId: CodexRequestId,
  choiceId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond', {
    requestId,
    decision: choiceId,
  });
}

export async function respondToCodexUserInput(
  requestId: CodexRequestId,
  answers: CodexUserInputAnswer[],
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond_user_input', {
    requestId,
    answers,
  });
}

export async function respondToCodexDynamicTool(
  requestId: CodexRequestId,
  response: CodexDynamicToolResponse,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond_dynamic_tool', {
    requestId,
    response,
  });
}

export async function listenCodexEvents(
  handler: (message: CodexProtocolMessage) => void,
): Promise<UnlistenFn> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<CodexProtocolMessage>('codex:event', (event) =>
    handler(event.payload),
  );
}

export async function listenCodexEventsUntilDisposed(
  handler: (message: CodexProtocolMessage) => void,
  isDisposed: () => boolean,
  listener: typeof listenCodexEvents = listenCodexEvents,
): Promise<UnlistenFn | null> {
  const unlisten = await listener(handler);

  if (isDisposed()) {
    unlisten();
    return null;
  }

  return unlisten;
}

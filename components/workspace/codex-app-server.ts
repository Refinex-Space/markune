'use client';

import { recordCodexDiagnostic } from './codex-diagnostics';
import { CodexEventBuffer } from './codex-event-buffer';
import { CodexRuntimeSupervisor } from './codex-runtime-supervisor';

import type { UnlistenFn } from '@tauri-apps/api/event';

export interface CodexRuntimeInfo {
  sessionId?: string | null;
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
  markuneSessionId?: string;
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
  namespace: 'markune_drawing';
  threadId: string;
  tool:
    | 'apply_preview_to_active'
    | 'create_from_preview'
    | 'inspect_drawing'
    | 'preview_mermaid'
    | 'preview_mindmap';
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
  inputModalities?: Array<'image' | 'text'>;
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

export type CodexThreadHistoryMode = 'legacy' | 'paginated';

export interface CodexThread {
  id: string;
  name: string | null;
  preview: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  historyMode?: CodexThreadHistoryMode;
  status: unknown;
  turns: CodexTurn[];
}

export interface CodexTurn {
  error?: CodexTurnError | null;
  id: string;
  status: string;
  items: CodexThreadItem[];
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

export interface CodexTurnError {
  additionalDetails?: string | null;
  codexErrorInfo?: unknown;
  message: string;
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
  mediaType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp' | null;
  name: string;
  previewAvailable: boolean;
  previewMediaType: 'image/png' | null;
  sizeBytes: number | null;
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

export class CodexRpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
    public readonly method?: string,
  ) {
    super(message);
    this.name = 'CodexRpcError';
  }
}
export interface CodexRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
type PendingRequest = {
  method: string;
  threadId?: string;
  reject: (reason: Error) => void;
  resolve: (value: unknown) => void;
  dispose: () => void;
};
type ProtocolSubscriber = (message: CodexProtocolMessage) => void;

export class CodexAppServerClient {
  private nextRequestId = 1000;
  private pending = new Map<CodexRequestId, PendingRequest>();
  private subscribers = new Set<ProtocolSubscriber>();
  private sessionId: string | null = null;
  private loadedThreads = new Set<string>();
  isThreadLoaded(id: string) {
    return this.loadedThreads.has(id);
  }
  constructor(
    private readonly connect?: () => Promise<unknown>,
    private readonly onTransportFailure?: (session: string | null) => void,
  ) {}
  get pendingCount() {
    return this.pending.size;
  }
  get runtimeSessionId() {
    return this.sessionId;
  }
  setSession(id: string | null) {
    if (id !== this.sessionId) {
      this.loadedThreads.clear();
      this.rejectPending(
        new CodexRpcError('运行时会话已改变，请核对任务状态后重试', -32098),
      );
      this.sessionId = id;
    }
  }
  subscribe(subscriber: ProtocolSubscriber) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
  handleMessage(message: CodexProtocolMessage) {
    if (message.markuneSessionId && message.markuneSessionId !== this.sessionId)
      return;
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        pending.dispose();
        if (message.error)
          pending.reject(
            new CodexRpcError(
              message.error.message || 'Codex App Server 请求失败',
              message.error.code,
              message.error.data,
            ),
          );
        else {
          const thread = (
            message.result as { thread?: { id?: unknown } } | undefined
          )?.thread;
          if (
            ['thread/start', 'thread/resume', 'thread/fork'].includes(
              pending.method,
            ) &&
            typeof thread?.id === 'string'
          )
            this.loadedThreads.add(thread.id);
          if (
            ['thread/unsubscribe', 'thread/archive', 'thread/delete'].includes(
              pending.method,
            ) &&
            pending.threadId
          )
            this.loadedThreads.delete(pending.threadId);
          pending.resolve(message.result);
        }
      }
    }
    for (const subscriber of this.subscribers) {
      try {
        subscriber(message);
      } catch {
        recordCodexDiagnostic('subscriber-failure');
      }
    }
  }
  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    options: CodexRequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted)
      throw new DOMException('请求已取消', 'AbortError');
    if (this.connect) {
      const connection = this.connect();
      if (!options.signal) await connection;
      else
        await new Promise<void>((resolve, reject) => {
          const signal = options.signal!;
          const cancel = () => {
            signal.removeEventListener('abort', cancel);
            reject(new DOMException('请求已取消', 'AbortError'));
          };
          signal.addEventListener('abort', cancel, { once: true });
          void connection.then(
            () => {
              signal.removeEventListener('abort', cancel);
              resolve();
            },
            (error) => {
              signal.removeEventListener('abort', cancel);
              reject(error);
            },
          );
          if (signal.aborted) cancel();
        });
    }
    if (options.signal?.aborted)
      throw new DOMException('请求已取消', 'AbortError');
    if (this.pending.size >= 256)
      throw new CodexRpcError(
        '等待中的请求过多，请稍后重试',
        -32001,
        undefined,
        method,
      );
    const requestId = this.nextRequestId++;
    const session = this.sessionId;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs =
        options.timeoutMs ??
        (method === 'turn/start' || method === 'thread/resume'
          ? 30_000
          : 15_000);
      const remove = (error: Error) => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        pending.dispose();
        reject(error);
      };
      const onAbort = () =>
        remove(
          new DOMException(
            '请求已取消；已提交的任务不会自动重发',
            'AbortError',
          ),
        );
      const timer = setTimeout(
        () => {
          recordCodexDiagnostic('rpc-timeout');
          remove(
            new CodexRpcError(
              '请求超时，请核对任务状态后重试；不会自动重复提交',
              -32097,
              { timeoutMs },
              method,
            ),
          );
        },
        Math.max(1, timeoutMs),
      );
      const dispose = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      };
      this.pending.set(requestId, {
        method,
        threadId:
          typeof params.threadId === 'string' ? params.threadId : undefined,
        reject,
        resolve: (value) => resolve(value as T),
        dispose,
      });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => {
          if (!this.pending.has(requestId)) return;
          return invoke('codex_app_server_request', {
            requestId,
            method,
            params,
            ...(this.sessionId ? { sessionId: this.sessionId } : {}),
          });
        })
        .catch((error) => {
          remove(
            error instanceof Error
              ? error
              : new CodexRpcError(String(error), undefined, undefined, method),
          );
          if (String(error).includes('CODEX_TRANSPORT_FAILED:')) {
            recordCodexDiagnostic('transport-failure');
            this.onTransportFailure?.(session);
          }
        });
    });
  }
  rejectPending(reason: Error) {
    for (const pending of this.pending.values()) {
      pending.dispose();
      pending.reject(reason);
    }
    this.pending.clear();
  }
}

let messageBridge: Promise<UnlistenFn> | null = null;
/** One native listener for the application lifetime, independent of rendered pages. author: refinex */
export function ensureCodexMessageBridge() {
  if (messageBridge) return messageBridge;
  let live = true;
  let timer: ReturnType<typeof setTimeout>;
  const pending = listenCodexEvents((message) => {
    if (live) codexEventBuffer.push(message);
  });
  const connection = new Promise<UnlistenFn>((resolve, reject) => {
    timer = setTimeout(() => {
      live = false;
      reject(new Error('Codex 事件监听超时，请重新连接'));
    }, 8000);
    void pending.then(
      (unlisten) => {
        if (!live) {
          unlisten();
          return;
        }
        clearTimeout(timer);
        resolve(unlisten);
      },
      (error) => {
        live = false;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
  const guarded = connection.catch((error) => {
    if (messageBridge === guarded) messageBridge = null;
    throw error;
  });
  messageBridge = guarded;
  return guarded;
}

export const codexAppServerClient = new CodexAppServerClient(
  ensureCodexMessageBridge,
  (session) =>
    codexRuntimeSupervisor.receive({
      method: 'markune/runtime/exited',
      ...(session ? { markuneSessionId: session } : {}),
      params: { message: '运行时连接不可用' },
    }),
);
export const codexRuntimeSupervisor = new CodexRuntimeSupervisor({
  connect: ensureCodexMessageBridge,
  start: async (rootPath) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexRuntimeInfo>('codex_runtime_start', { rootPath });
},
  stop: async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('codex_runtime_stop');
  },
  session: (id) => codexAppServerClient.setSession(id),
  emit: (message) => codexAppServerClient.handleMessage(message),
});
const codexEventBuffer = new CodexEventBuffer((message) =>
  codexRuntimeSupervisor.receive(message),
);

export function codexProtocolThreadId(message: CodexProtocolMessage) {
  const direct = nonEmptyString(message.params?.threadId);
  if (direct) return direct;
  const thread = asRecord(message.params?.thread);
  return thread ? nonEmptyString(thread.id) : null;
}

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
  return codexRuntimeSupervisor.start(rootPath);
}
export async function stopCodexRuntime() {
  return codexRuntimeSupervisor.stop();
}

export interface CodexCustomProviderInfo {
  fingerprint: string;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  enabled: boolean;
  envKey: string;
  providerId: string;
  wireApi: string;
}

export interface CodexConnectionStatus {
  runtime: CodexRuntimeInfo;
  authMode: 'chatgpt' | 'custom' | string;
  customConfigured: boolean;
  hasApiKey: boolean;
  model: string | null;
  baseUrl: string | null;
  running: boolean;
  signedIn: boolean;
  accountType: 'chatgpt' | 'apiKey' | string | null;
  accountEmail: string | null;
  error: string | null;
}

export async function getCodexConnectionStatus() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexConnectionStatus>('codex_connection_status');
}

export async function getCodexCustomProvider() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexCustomProviderInfo>('codex_custom_provider_get');
}

export async function setCodexCustomProvider(input: {
  expectedFingerprint: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexCustomProviderInfo>('codex_custom_provider_set', {
    expectedFingerprint: input.expectedFingerprint,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: input.apiKey,
  });
}

export async function clearCodexCustomProvider(expectedFingerprint: string) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexCustomProviderInfo>('codex_custom_provider_clear', {
    expectedFingerprint,
  });
}

export async function setCodexAuthMode(
  mode: 'chatgpt' | 'custom',
  expectedFingerprint: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexCustomProviderInfo>('codex_auth_mode_set', {
    mode,
    expectedFingerprint,
  });
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

export async function pasteCodexContextAttachments(remaining: number) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CodexContextAttachment[] | null>(
    'paste_codex_context_attachments',
    { remaining },
  );
}

export async function readCodexContextAttachmentPreview(
  attachmentId: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<ArrayBuffer | Uint8Array>(
    'read_codex_context_attachment_preview',
    { attachmentId },
  );
  return result instanceof Uint8Array ? result : new Uint8Array(result);
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
  sessionId: string | null = codexAppServerClient.runtimeSessionId,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond', {
    requestId,
    ...(sessionId ? { sessionId } : {}),
    decision: choiceId,
  });
}

export async function respondToCodexUserInput(
  requestId: CodexRequestId,
  answers: CodexUserInputAnswer[],
  sessionId: string | null = codexAppServerClient.runtimeSessionId,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond_user_input', {
    requestId,
    ...(sessionId ? { sessionId } : {}),
    answers,
  });
}

export async function respondToCodexDynamicTool(
  requestId: CodexRequestId,
  response: CodexDynamicToolResponse,
  sessionId: string | null = codexAppServerClient.runtimeSessionId,
) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('codex_app_server_respond_dynamic_tool', {
    requestId,
    ...(sessionId ? { sessionId } : {}),
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

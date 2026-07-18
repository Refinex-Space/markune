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
  | 'xhigh';

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
    displayName: string | null;
    shortDescription: string | null;
  } | null;
  name: string;
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

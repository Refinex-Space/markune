// @author refinex
// 对话持久化（v2 parts 纵向流）+ v1→v2 迁移。
// Rust 端新增独立的 v2 命令（read/save/list_ai_conversation_v2，操作 .v2.json 后缀文件），
// 与既有 v1 命令物理隔离，用 serde_json::Value 容器避免 v1 的强类型 content 约束。

import type { AiMessage, MessagePart, MessageMetadata } from './ai-contracts';

/** v1 平铺四数组记录（与 Rust AiConversationRecord 对齐）。 */
export interface AiConversationRecordV1 {
  id: string;
  title: string;
  profileId: string;
  profileLabel?: string;
  providerId: string;
  providerLabel?: string;
  createdAt: number;
  updatedAt: number;
  documentPath?: string;
  documentTitle?: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    references?: unknown[];
    images?: unknown[];
    selection?: unknown;
  }>;
  thinking?: Array<{ id: string; content: string; parentToolCallId?: string }>;
  tools?: Array<{
    id: string;
    name: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    status?: string;
    durationMs?: number;
    parentToolCallId?: string;
  }>;
  permissions?: Array<Record<string, unknown>>;
  usage?: MessageMetadata | null;
}

/** v2 parts 纵向流记录。 */
export interface AiConversationRecordV2 {
  id: string;
  title: string;
  profileId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  documentPath?: string;
  documentTitle?: string;
  messages: AiMessage[];
  metadata?: Partial<MessageMetadata>;
  schemaVersion: 2;
}

/** 运行时使用的统一记录类型（总是 v2）。 */
export type AiConversationRecord = AiConversationRecordV2;

/** 判断原始 JSON 是否为 v1 格式（缺失 schemaVersion）。 */
export function isV1Record(raw: Record<string, unknown>): boolean {
  return raw.schemaVersion !== 2;
}

/** 构造一个空的 v2 记录。 */
export function createEmptyConversationRecord(input: {
  id: string;
  profileId: string;
  providerId: string;
  documentPath?: string;
  documentTitle?: string;
  title?: string;
}): AiConversationRecordV2 {
  const now = Date.now();
  return {
    id: input.id,
    title: input.title ?? '新对话',
    profileId: input.profileId,
    providerId: input.providerId,
    createdAt: now,
    updatedAt: now,
    documentPath: input.documentPath,
    documentTitle: input.documentTitle,
    messages: [],
    schemaVersion: 2,
  };
}

/** 把 v1 平铺四数组迁移为 v2 parts 纵向流。纯函数。 */
export function migrateConversationV1ToV2(v1: AiConversationRecordV1): AiConversationRecordV2 {
  const messages: AiMessage[] = v1.messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text: m.content }] as MessagePart[],
    createdAt: v1.createdAt,
  }));

  // 找最后一条 assistant 消息作为工具/思考的挂载点；没有则追加虚拟 assistant 消息
  let lastAssistant: AiMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i];
      break;
    }
  }
  const hasToolsOrThinking =
    (v1.thinking?.length ?? 0) > 0 || (v1.tools?.length ?? 0) > 0;
  if (!lastAssistant && hasToolsOrThinking) {
    lastAssistant = {
      id: `migrated-${v1.id}`,
      role: 'assistant',
      parts: [],
      createdAt: v1.updatedAt,
    };
    messages.push(lastAssistant);
  }

  if (lastAssistant) {
    // thinking 插到 parts 开头
    const reasoningParts: MessagePart[] = (v1.thinking ?? []).map((t) => ({
      type: 'reasoning',
      text: t.content,
    }));
    // tool 追加到 parts 末尾
    const toolParts: MessagePart[] = (v1.tools ?? []).map((t) => ({
      type: `tool-${t.name}`,
      toolCallId: t.id,
      state:
        t.status === 'success'
          ? 'output-available'
          : t.status === 'error' || t.status === 'denied'
            ? 'output-error'
            : 'input-available',
      input: t.input,
      output: t.output,
    }));
    lastAssistant.parts = [...reasoningParts, ...lastAssistant.parts, ...toolParts];
  }

  return {
    id: v1.id,
    title: v1.title,
    profileId: v1.profileId,
    providerId: v1.providerId,
    createdAt: v1.createdAt,
    updatedAt: v1.updatedAt,
    documentPath: v1.documentPath,
    documentTitle: v1.documentTitle,
    messages,
    metadata: v1.usage ?? undefined,
    schemaVersion: 2,
  };
}

/**
 * 把任意原始 JSON（v1 或 v2）归一化为 v2 记录。
 * 加载时调用：检测 schemaVersion，必要时迁移。
 */
export function normalizeRecord(raw: Record<string, unknown>): AiConversationRecordV2 {
  if (isV1Record(raw)) {
    return migrateConversationV1ToV2(raw as unknown as AiConversationRecordV1);
  }
  return raw as unknown as AiConversationRecordV2;
}

// —— Tauri I/O（接 v2 invoke 封装，v2 不存在时回退 v1 并迁移）——

import {
  listAiConversationsV2,
  readAiConversation,
  readAiConversationV2,
  saveAiConversationV2,
} from '../workspace-api';

const SCHEMA_VERSION = 2;

export interface AiConversationSummaryV2 {
  id: string;
  title: string;
  profileId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  documentPath?: string;
  documentTitle?: string;
  messageCount: number;
}

/**
 * 加载会话：优先 v2，v2 不存在时回退 v1 并迁移为 v2。
 * 调用方可选择在迁移后调用 saveConversationRecord 写回 v2。
 */
export async function loadConversationRecord(
  workspaceRoot: string,
  id: string,
): Promise<AiConversationRecordV2 | null> {
  const v2 = await readAiConversationV2(workspaceRoot, id);
  if (v2) {
    return v2 as unknown as AiConversationRecordV2;
  }
  // 回退 v1：复用既有 read_ai_conversation 命令
  const v1 = await readAiConversation(workspaceRoot, id);
  if (!v1) return null;
  return migrateConversationV1ToV2(v1 as unknown as AiConversationRecordV1);
}

/** 保存 v2 记录。 */
export async function saveConversationRecord(
  workspaceRoot: string,
  record: AiConversationRecordV2,
): Promise<void> {
  const toWrite: AiConversationRecordV2 = { ...record, schemaVersion: SCHEMA_VERSION };
  await saveAiConversationV2(workspaceRoot, toWrite as unknown as Record<string, unknown>);
}

/** 列出所有 v2 会话摘要（按 updatedAt 倒序）。 */
export async function listConversationSummaries(
  workspaceRoot: string,
): Promise<AiConversationSummaryV2[]> {
  const list = await listAiConversationsV2(workspaceRoot);
  return list as unknown as AiConversationSummaryV2[];
}

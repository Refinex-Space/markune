// @author refinex
// AI 面板核心数据契约 —— 整个 AI 面板的单一真相源。
// B-J 子项目（传输层 / 渲染层 / 输入交互 / 对话管理 / 模式扩展）全部消费本文件。
// 契约与 1code (src/main/lib/claude/types.ts + message-store.ts) 一一对齐，
// 保留 Madora 特有的结构化权限语义 (permission-request)。

/** 全局流状态，驱动 getToolStatus 的中断判定。 */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error' | 'stopped';

/** 对话级元数据：token 用量、成本、耗时、模型。附加在 message 与 finish chunk 上。 */
export interface MessageMetadata {
  sessionId?: string;
  inputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
  model?: string;
}

/** MCP 服务器信息，由 session-init chunk 推送给前端。 */
export interface McpServerInfo {
  name: string;
  status?: 'connected' | 'failed' | 'connecting' | string;
  tools?: string[];
  icon?: string;
}

/** MCP 插件信息。 */
export interface McpPluginInfo {
  name: string;
  path: string;
}

/** 权限确认建议项。 */
export interface PermissionSuggestion {
  id: string;
  label: string;
  description?: string;
}

/**
 * 统一 chunk 契约（传输层 ↔ store 的协议）。
 * 一比一复刻 1code UIMessageChunk，并保留 Madora 特有的 permission-request。
 * 由 ai-event-normalizer.ts 从 Tauri AiRuntimeEvent 归一化产出。
 */
export type UiMessageChunk =
  // 消息生命周期
  | { type: 'start'; messageId?: string }
  | { type: 'finish'; messageMetadata?: MessageMetadata }
  | { type: 'start-step' }
  | { type: 'finish-step' }
  // 文本流
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  // 推理 / 思考
  | { type: 'reasoning'; id: string; text: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  // 工具调用
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown }
  | { type: 'tool-output-error'; toolCallId: string; errorText: string }
  // 错误与元数据
  | { type: 'error'; errorText: string }
  | { type: 'message-metadata'; messageMetadata: MessageMetadata }
  // 会话初始化（MCP / 插件 / 技能清单推送）
  | {
      type: 'session-init';
      tools: string[];
      mcpServers: McpServerInfo[];
      plugins: McpPluginInfo[];
      skills: string[];
    }
  // 权限请求（Madora 特有；保留显式 allow/deny 语义）
  | {
      type: 'permission-request';
      requestId: string;
      toolCallId: string;
      toolName: string;
      toolInput: unknown;
      reason: string;
      suggestions?: PermissionSuggestion[];
    };

/**
 * 消息 part。type 区分符为字符串约定（与 1code 一致）：
 * 'text' | 'tool-<Name>' | 'reasoning' | 'data-image' | ...
 * 索引签名承载工具特定字段。
 */
export interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 一条消息：role + parts 纵向流 + 元数据。 */
export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  metadata?: MessageMetadata;
  createdAt: number;
}

/**
 * 工具状态推导（复刻 1code getToolStatus）。
 * 把每个工具 part 的静态 part.state 与全局 chatStatus 联合推导出四种 UI 状态。
 * 关键行为：流式中断时仍在运行的工具翻转为 isInterrupted，而非永久挂起；
 * 历史消息（chatStatus === undefined）只显示自身状态。
 */
export function getToolStatus(part: MessagePart, chatStatus?: ChatStatus) {
  const basePending =
    part.state !== 'output-available' &&
    part.state !== 'output-error' &&
    part.state !== 'result';
  const isError =
    part.state === 'output-error' ||
    (part.state === 'output-available' &&
      typeof part.output === 'object' &&
      part.output !== null &&
      (part.output as { success?: unknown }).success === false);
  const isSuccess = part.state === 'output-available' && !isError;
  const isActivelyStreaming = chatStatus === 'streaming' || chatStatus === 'submitted';
  const isPending = basePending && isActivelyStreaming;
  const isInterrupted = basePending && !isActivelyStreaming && chatStatus !== undefined;
  return { isPending, isError, isSuccess, isInterrupted };
}

/** 生成稳定的 part id（text/reasoning 流式增量去重用）。 */
export function createPartId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/** 生成稳定的 message id。 */
export function createMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

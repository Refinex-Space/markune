import type { UIMessage } from 'ai';

/**
 * AI 会话消息类型。
 *
 * 当前 AI 面板为占位状态，这里只保留最小类型定义供 app/api/ai/* 路由编译。
 * 后续正式接入 AI 时，这里会承载编辑器与 AI 后端之间的消息协议。
 */
export type ChatMessage = UIMessage;

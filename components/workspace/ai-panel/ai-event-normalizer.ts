// @author refinex
// 事件归一化适配器：把 Tauri 现有 AiRuntimeEvent 实时归一化为 UiMessageChunk 流。
// 这是保护 Rust agent 运行时零改动的关键边界 —— Rust 继续产出 AiRuntimeEvent，
// 前端通过本类转换为 1code 对齐的 chunk 契约。
// 有状态生成器：维护 text part id / reasoning id / tool 名映射，确保 chunk 序列正确。

import type { UiMessageChunk, MessageMetadata } from './ai-contracts';
import { createPartId } from './ai-contracts';
import type { AiRuntimeEvent, AiPanelToolStatus } from './ai-types';

export class AiEventNormalizer {
  private textPartId: string | undefined;
  private textPartMessageId: string | undefined;
  private reasoningId: string | undefined;
  private reasoningMessageId: string | undefined;
  private toolNames = new Map<string, string>();

  /** 单个 runtime event → 0..N 个 chunk（按序产出）。 */
  normalize(event: AiRuntimeEvent): UiMessageChunk[] {
    switch (event.type) {
      case 'sessionStarted':
        return [{ type: 'start' }];

      case 'messageDelta': {
        const chunks: UiMessageChunk[] = [];
        // 仅当当前 text part 不属于该 messageId 时，才开启新 text part
        const needsNewTextPart = this.textPartId === undefined || this.textPartMessageId !== event.messageId;
        if (needsNewTextPart) {
          this.textPartId = createPartId('text');
          this.textPartMessageId = event.messageId;
          chunks.push({ type: 'text-start', id: this.textPartId });
        }
        const textPartId = this.textPartId;
        if (!textPartId) {
          return chunks;
        }
        chunks.push({ type: 'text-delta', id: textPartId, delta: event.delta });
        return chunks;
      }

      case 'messageCompleted': {
        const chunks: UiMessageChunk[] = [];
        if (this.textPartId) {
          chunks.push({ type: 'text-end', id: this.textPartId });
          this.textPartId = undefined;
          this.textPartMessageId = undefined;
        }
        chunks.push({ type: 'finish' });
        return chunks;
      }

      case 'thinkingDelta': {
        const chunks: UiMessageChunk[] = [];
        const needsNewReasoning =
          this.reasoningId === undefined || this.reasoningMessageId !== event.messageId;
        if (needsNewReasoning) {
          this.reasoningId = createPartId('reasoning');
          this.reasoningMessageId = event.messageId;
          chunks.push({ type: 'reasoning', id: this.reasoningId, text: event.delta });
          return chunks;
        }
        const reasoningId = this.reasoningId;
        if (!reasoningId) {
          return chunks;
        }
        chunks.push({ type: 'reasoning-delta', id: reasoningId, delta: event.delta });
        return chunks;
      }

      case 'toolStarted': {
        this.toolNames.set(event.toolCallId, event.toolName);
        const chunks: UiMessageChunk[] = [
          { type: 'tool-input-start', toolCallId: event.toolCallId, toolName: event.toolName },
        ];
        // input 非空对象时立即发布 available
        if (event.input && Object.keys(event.input).length > 0) {
          chunks.push({
            type: 'tool-input-available',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          });
        }
        return chunks;
      }

      case 'toolInputDelta':
        return [
          {
            type: 'tool-input-delta',
            toolCallId: event.toolCallId,
            inputTextDelta: event.partialJson,
          },
        ];

      case 'toolCompleted':
        return [this.toolCompletedChunk(event.toolCallId, event.status, event.output)];

      case 'permissionPrompt':
        return [
          {
            type: 'permission-request',
            requestId: event.requestId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            toolInput: event.toolInput,
            reason: event.reason,
            suggestions: event.suggestions,
          },
        ];

      case 'permissionDenied':
        return [
          {
            type: 'tool-output-error',
            toolCallId: event.toolCallId,
            errorText: '权限被拒绝',
          },
        ];

      case 'usageUpdated': {
        const metadata: MessageMetadata = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadInputTokens: event.cacheReadTokens,
          cacheCreationInputTokens: event.cacheWriteTokens,
          totalCostUsd: event.totalCostUsd,
          model: event.model,
        };
        return [{ type: 'message-metadata', messageMetadata: metadata }];
      }

      case 'turnCompleted':
        return [{ type: 'finish-step' }];

      // 仅内部状态，不产出 chunk
      case 'runState':
      case 'sessionExited':
        return [];

      case 'error':
        return [{ type: 'error', errorText: event.message }];

      default: {
        // 未知事件不应中断流；记录并产出 error chunk
        console.warn(
          '[AiEventNormalizer] 未处理的事件类型',
          (event as { type: string }).type,
        );
        return [
          {
            type: 'error',
            errorText: `未处理的事件类型: ${(event as { type: string }).type}`,
          },
        ];
      }
    }
  }

  /** 重置内部状态，用于新对话/重连。 */
  reset(): void {
    this.textPartId = undefined;
    this.textPartMessageId = undefined;
    this.reasoningId = undefined;
    this.reasoningMessageId = undefined;
    this.toolNames.clear();
  }

  private toolCompletedChunk(
    toolCallId: string,
    status: AiPanelToolStatus,
    output: Record<string, unknown>,
  ): UiMessageChunk {
    if (status === 'error' || status === 'denied') {
      const errorText =
        status === 'denied'
          ? '权限被拒绝'
          : typeof output?.stderr === 'string'
            ? String(output.stderr)
            : '工具执行失败';
      return { type: 'tool-output-error', toolCallId, errorText };
    }
    return { type: 'tool-output-available', toolCallId, output };
  }
}

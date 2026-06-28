// @author refinex
// 统一传输层 AiChatTransport：把 Madora 的「event 回调 + invoke 触发」封装为
// 1code 对齐的 sendMessages → ReadableStream<UiMessageChunk> 流。
// 纯编排层，无 React 依赖。内部用 A 的 AiEventNormalizer 归一化 Tauri event，
// 实现 chunk 路由（permission/session-init 分流回调，普通进流，finish-step 关流）+ abort 取消。
// 依赖通过 AiChatTransportDeps 注入，便于测试 mock；默认实现转发到 workspace-api。

import type { UnlistenFn } from '@tauri-apps/api/event';

import type { UiMessageChunk } from './ai-contracts';
import { AiEventNormalizer } from './ai-event-normalizer';
import type {
  AiContextPack,
  AiRuntimeEvent,
  RespondAiPermissionInput,
  StartAiSessionInput,
} from './ai-types';
import {
  cancelAiTurn,
  listenAiEvents,
  respondAiPermission,
  sendAiPrompt,
  startAiSession,
} from '../workspace-api';

type SessionInitChunk = Extract<UiMessageChunk, { type: 'session-init' }>;
type PermissionRequestChunk = Extract<UiMessageChunk, { type: 'permission-request' }>;

export interface AiChatTransportConfig {
  rootPath: string;
  profileId: string;
  mode?: 'agent' | 'plan';
  modelId?: string;
  extendedThinking?: boolean;
  /** 特殊 chunk 的外部路由目标（由上层 UI 处理，不进消息流） */
  onPermissionRequest?: (chunk: PermissionRequestChunk) => void;
  onSessionInit?: (chunk: SessionInitChunk) => void;
  onError?: (errorText: string) => void;
}

/** 底层 API 适配器（依赖注入，便于测试 mock）。 */
export interface AiChatTransportDeps {
  startAiSession: (
    input: StartAiSessionInput,
  ) => Promise<{ sessionId: string }>;
  sendAiPrompt: (input: {
    context: AiContextPack;
    prompt: string;
    sessionId: string;
  }) => Promise<void>;
  cancelAiTurn: (sessionId: string) => Promise<void>;
  respondAiPermission: (input: RespondAiPermissionInput) => Promise<void>;
  listenAiEvents: (
    handler: (event: AiRuntimeEvent) => void,
  ) => Promise<UnlistenFn>;
}

export interface AiChatTransport {
  sendMessages(options: {
    prompt: string;
    context: AiContextPack;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<UiMessageChunk>>;
  respondPermission(requestId: string, behavior: 'allow' | 'deny'): Promise<void>;
  stop(): Promise<void>;
}

/** 创建一个 AiChatTransport 实例。 */
export function createAiChatTransport(
  config: AiChatTransportConfig,
  deps: AiChatTransportDeps,
): AiChatTransport {
  let sessionId: string | null = null;
  let unlisten: UnlistenFn | null = null;

  async function ensureSession(context: AiContextPack): Promise<string> {
    if (sessionId) return sessionId;
    const input: StartAiSessionInput = {
      context,
      profileId: config.profileId,
      rootPath: config.rootPath,
      ...(config.mode ? { agentMode: config.mode } : {}),
      ...(config.modelId ? { modelId: config.modelId } : {}),
      ...(config.extendedThinking !== undefined
        ? { extendedThinking: config.extendedThinking }
        : {}),
    };
    const info = await deps.startAiSession(input);
    sessionId = info.sessionId;
    return sessionId;
  }

  return {
    async sendMessages({ prompt, context, abortSignal }) {
      // 在创建流之前确保 session 就绪，使 sid 在 start 进入时已知，
      // 从而 abort 监听可在 start 同步阶段立即注册（避免竞态）。
      const sid = await ensureSession(context);
      // 若调用方在 await 期间已 abort，直接返回已关闭的空流
      if (abortSignal?.aborted) {
        void deps.cancelAiTurn(sid);
        return new ReadableStream<UiMessageChunk>({
          start(controller) {
            controller.close();
          },
        });
      }
      const normalizer = new AiEventNormalizer();
      const stream = new ReadableStream<UiMessageChunk>({
        async start(controller) {
          const cleanup = () => {
            if (unlisten) {
              unlisten();
              unlisten = null;
            }
          };

          // abort 监听：同步阶段立即注册，确保 start 内任何 await 期间的 abort 都能被捕获
          const onAbort = () => {
            void deps.cancelAiTurn(sid);
            cleanup();
            try {
              controller.close();
            } catch {
              // 已关闭
            }
          };
          abortSignal?.addEventListener('abort', onAbort);

          // 订阅 event，归一化并路由
          unlisten = await deps.listenAiEvents((event) => {
            const chunks = normalizer.normalize(event);
            for (const chunk of chunks) {
              if (chunk.type === 'permission-request') {
                config.onPermissionRequest?.(chunk);
                continue;
              }
              if (chunk.type === 'session-init') {
                config.onSessionInit?.(chunk);
                continue;
              }
              if (chunk.type === 'error') {
                config.onError?.(chunk.errorText);
              }
              try {
                controller.enqueue(chunk);
              } catch {
                // 流已关闭，忽略
              }
              if (chunk.type === 'finish-step') {
                cleanup();
                try {
                  controller.close();
                } catch {
                  // 已关闭
                }
              }
            }
          });

          // 发送 prompt
          await deps.sendAiPrompt({ context, prompt, sessionId: sid });
        },
        cancel() {
          abortSignal?.removeEventListener('abort', onAbort);
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
        },
      });
      return stream;
    },

    async respondPermission(requestId, behavior) {
      if (!sessionId) return;
      const input: RespondAiPermissionInput = {
        behavior,
        requestId,
        sessionId,
      };
      await deps.respondAiPermission(input);
    },

    async stop() {
      if (sessionId) {
        await deps.cancelAiTurn(sessionId);
      }
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    },
  };
}

/** 默认 deps：转发到 workspace-api（生产用）。 */
export const defaultAiChatTransportDeps: AiChatTransportDeps = {
  startAiSession,
  sendAiPrompt,
  cancelAiTurn,
  respondAiPermission,
  listenAiEvents,
};

/** 便捷工厂：用默认 deps 创建 transport。 */
export function createDefaultAiChatTransport(
  config: AiChatTransportConfig,
): AiChatTransport {
  return createAiChatTransport(config, defaultAiChatTransportDeps);
}

# AI 统一传输层 AiChatTransport 实现计划（B 子项目）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Markune AI 面板的统一传输层，把「event 回调 + invoke 触发」封装为 1code 对齐的 `sendMessages → ReadableStream<UiMessageChunk>` 流，接入 A 的归一化与路由 + abort 取消。

**Architecture:** 新增 `ai-chat-transport.ts`（接口 + `createAiChatTransport` 工厂）。transport 是纯编排层：在 `new ReadableStream({ start })` 内 `listenAiEvents` → `AiEventNormalizer.normalize` → chunk 路由（permission/session-init 分流回调，普通 enqueue，finish-step 关流）→ `sendAiPrompt`；abort 路径调 `cancelAiTurn` + unlisten + close。复用 A 子项目的 `AiEventNormalizer`/`UiMessageChunk`，复用既有 `startAiSession`/`sendAiPrompt`/`cancelAiTurn`/`respondAiPermission`/`listenAiEvents`，Rust 零改动。

**Tech Stack:** TypeScript、ReadableStream、Vitest

**Spec:** `docs/superpowers/specs/2026-06-28-ai-chat-transport-design.md`

---

## File Structure

```
components/workspace/ai-panel/
├─ ai-chat-transport.ts          【新增】接口 + 工厂（纯编排，无 React）
└─ __tests__/
   └─ ai-chat-transport.test.ts  【新增】流桥接 + 路由 + abort + session 复用（mock listenAiEvents/invoke）
```

单一职责：把 Markune 的 event/invoke 模型适配为流契约。所有依赖通过参数注入（`startAiSession`/`sendAiPrompt`/...），便于测试 mock。

---

## Task 1: ai-chat-transport.ts — 流桥接 + 路由 + 取消

**Files:**
- Create: `components/workspace/ai-panel/ai-chat-transport.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-chat-transport.test.ts`

### 依赖注入设计

transport 不直接 import workspace-api 的具名函数（否则测试难以 mock）。改为通过 config 注入底层 API 适配器，默认实现转发到 workspace-api。这样测试只需注入 mock 适配器。

- [ ] **Step 1: 写流桥接与路由的失败测试**

Create `components/workspace/ai-panel/__tests__/ai-chat-transport.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createAiChatTransport } from '../ai-chat-transport';
import type { AiRuntimeEvent } from '../ai-types';

// 构造一个最小化的 mock 适配器集合，模拟 Tauri event/invoke
function createMockDeps() {
  let eventHandler: ((event: AiRuntimeEvent) => void) | null = null;
  const startAiSession = vi.fn().mockResolvedValue({
    sessionId: 's1',
    profileId: 'p1',
    rootPath: '/r',
    status: 'running' as const,
  });
  const sendAiPrompt = vi.fn().mockResolvedValue(undefined);
  const cancelAiTurn = vi.fn().mockResolvedValue(undefined);
  const respondAiPermission = vi.fn().mockResolvedValue(undefined);
  const listenAiEvents = vi.fn().mockImplementation(async (handler) => {
    eventHandler = handler;
    return () => {
      eventHandler = null;
    };
  });

  return {
    startAiSession,
    sendAiPrompt,
    cancelAiTurn,
    respondAiPermission,
    listenAiEvents,
    emit: (event: AiRuntimeEvent) => eventHandler?.(event),
    isListening: () => eventHandler !== null,
  };
}

const baseContext = {
  workspaceRootPath: '/r',
  intent: 'chat' as const,
};

describe('createAiChatTransport.sendMessages', () => {
  it('首次 sendMessages 自动 start session 并 sendAiPrompt', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: '你好',
      context: baseContext,
    });
    const reader = stream.getReader();

    expect(deps.startAiSession).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p1', rootPath: '/r' }),
    );
    expect(deps.sendAiPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', prompt: '你好' }),
    );

    reader.releaseLock();
  });

  it('普通 chunk（text-delta）进流', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    // 触发 messageDelta 事件 → normalizer 产出 [text-start, text-delta]
    deps.emit({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'Hello',
    });
    const chunk1 = await reader.read();
    const chunk2 = await reader.read();
    expect(chunk1.value?.type).toBe('text-start');
    expect(chunk2.value?.type).toBe('text-delta');

    reader.releaseLock();
  });

  it('permission-request 分流到 onPermissionRequest，不进流', async () => {
    const deps = createMockDeps();
    const onPermissionRequest = vi.fn();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1', onPermissionRequest },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({
      type: 'permissionPrompt',
      sessionId: 's1',
      requestId: 'r1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: { command: 'rm' },
      reason: '危险',
    });

    // 给 microtask 一个周期让回调执行
    await new Promise((r) => setTimeout(r, 0));
    expect(onPermissionRequest).toHaveBeenCalledTimes(1);
    expect(onPermissionRequest.mock.calls[0][0].type).toBe('permission-request');

    reader.releaseLock();
  });

  it('finish-step 关闭流', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('abort 触发 cancelAiTurn + unlisten + close', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    const controller = new AbortController();
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
      abortSignal: controller.signal,
    });
    const reader = stream.getReader();

    controller.abort();
    await new Promise((r) => setTimeout(r, 0));

    expect(deps.cancelAiTurn).toHaveBeenCalledWith('s1');
    expect(deps.isListening()).toBe(false);
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('error chunk 双路由：进流 + onError', async () => {
    const deps = createMockDeps();
    const onError = vi.fn();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1', onError },
      deps,
    );
    const stream = await transport.sendMessages({
      prompt: 'hi',
      context: baseContext,
    });
    const reader = stream.getReader();

    deps.emit({ type: 'error', sessionId: 's1', message: 'boom' });
    await new Promise((r) => setTimeout(r, 0));
    const { value } = await reader.read();
    expect(value?.type).toBe('error');
    expect(onError).toHaveBeenCalledWith('boom');

    reader.releaseLock();
  });

  it('第二次 sendMessages 复用 sessionId（不重复 start）', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    // 第一轮
    const s1 = await transport.sendMessages({ prompt: 'a', context: baseContext });
    (await s1.getReader().read()).done; // 等 close（先 emit turnCompleted）
    // 第二轮
    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    const s2 = await transport.sendMessages({ prompt: 'b', context: baseContext });
    deps.emit({ type: 'turnCompleted', sessionId: 's1', cancelled: false });

    expect(deps.startAiSession).toHaveBeenCalledTimes(1);
    expect(deps.sendAiPrompt).toHaveBeenCalledTimes(2);
  });

  it('respondPermission 调用 respondAiPermission', async () => {
    const deps = createMockDeps();
    const transport = createAiChatTransport(
      { rootPath: '/r', profileId: 'p1' },
      deps,
    );
    await transport.sendMessages({ prompt: 'hi', context: baseContext });
    await transport.respondPermission('r1', 'allow');
    expect(deps.respondAiPermission).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'r1', behavior: 'allow', sessionId: 's1' }),
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-chat-transport
```
Expected: FAIL（`Cannot find module '../ai-chat-transport'`）。

- [ ] **Step 3: 实现 ai-chat-transport.ts**

Create `components/workspace/ai-panel/ai-chat-transport.ts`:

```ts
// @author refinex
// 统一传输层 AiChatTransport：把 Markune 的「event 回调 + invoke 触发」封装为
// 1code 对齐的 sendMessages → ReadableStream<UiMessageChunk> 流。
// 纯编排层，无 React 依赖。内部用 A 的 AiEventNormalizer 归一化 Tauri event，
// 实现 chunk 路由（permission/session-init 分流回调，普通进流，finish-step 关流）+ abort 取消。
// 依赖通过 AiChatTransportDeps 注入，便于测试 mock；默认实现转发到 workspace-api。

import type { UiMessageChunk } from './ai-contracts';
import { AiEventNormalizer } from './ai-event-normalizer';
import type {
  AiContextPack,
  AiRuntimeEvent,
  RespondAiPermissionInput,
  StartAiSessionInput,
} from './ai-types';
import type { UnlistenFn } from '@tauri-apps/api/event';

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
  startAiSession: (input: StartAiSessionInput) => Promise<{ sessionId: string }>;
  sendAiPrompt: (input: { context: AiContextPack; prompt: string; sessionId: string }) => Promise<void>;
  cancelAiTurn: (sessionId: string) => Promise<void>;
  respondAiPermission: (input: RespondAiPermissionInput) => Promise<void>;
  listenAiEvents: (handler: (event: AiRuntimeEvent) => void) => Promise<UnlistenFn>;
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
      const sid = await ensureSession(context);
      const normalizer = new AiEventNormalizer();
      const stream = new ReadableStream<UiMessageChunk>({
        async start(controller) {
          const cleanup = () => {
            if (unlisten) {
              unlisten();
              unlisten = null;
            }
          };

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

          // abort 路径
          abortSignal?.addEventListener('abort', () => {
            void deps.cancelAiTurn(sid);
            cleanup();
            try {
              controller.close();
            } catch {
              // 已关闭
            }
          });
        },
        cancel() {
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-chat-transport
```
Expected: PASS（流桥接 + 路由 + abort + session 复用全绿）。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/ai-panel/ai-chat-transport.ts components/workspace/ai-panel/__tests__/ai-chat-transport.test.ts
git commit -m "feat(ai): 引入统一传输层 AiChatTransport（流桥接 + 路由 + abort）"
```

---

## Task 2: 提供 workspace-api 默认依赖适配器

**Files:**
- Modify: `components/workspace/ai-panel/ai-chat-transport.ts`

为 C 子项目提供开箱即用的默认 deps（转发到 workspace-api），避免 C 重复装配。

- [ ] **Step 1: 在 ai-chat-transport.ts 末尾追加默认 deps**

在文件末尾追加：

```ts
import {
  cancelAiTurn,
  listenAiEvents,
  respondAiPermission,
  sendAiPrompt,
  startAiSession,
} from '../workspace-api';

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
```

- [ ] **Step 2: 运行测试确认无回归**

Run:
```bash
pnpm test:run -- ai-chat-transport
```
Expected: PASS（默认 deps 不影响注入 mock 的测试）。

- [ ] **Step 3: 提交**

```bash
git add components/workspace/ai-panel/ai-chat-transport.ts
git commit -m "feat(ai): 提供 AiChatTransport 默认 workspace-api 依赖适配器"
```

---

## Task 3: 全量验证

**Files:** 无新增，仅验证。

- [ ] **Step 1: 跑 B 子项目测试**

Run:
```bash
pnpm test:run -- ai-chat-transport
```
Expected: 全绿。

- [ ] **Step 2: 跑 A+B 全部测试，确认无回归**

Run:
```bash
pnpm test:run -- ai-panel
```
Expected: A 的 4 个文件 + B 的 1 个文件 + 既有 ai-reducer/ai-panel-content/ai-context 全绿。

- [ ] **Step 3: 跑 lint**

Run:
```bash
pnpm lint
```
Expected: 无新增 error。

- [ ] **Step 4: 确认未触及 Rust 与既有 reducer/面板**

Run:
```bash
git diff --name-only 15b6ea8 HEAD -- components/workspace/ai-panel/ai-reducer.ts components/workspace/ai-panel/ai-types.ts components/workspace/ai-panel/ai-panel-content.tsx src-tauri/
```
Expected: 空输出（B 不改 Rust/reducer/面板）。

- [ ] **Step 5: 收尾提交（若有未提交修正）**

```bash
git add -A && git commit -m "test(ai): B 子项目传输层全量验证通过" --allow-empty
```

---

## B 子项目完成定义（DoD）对照

| DoD | 验证任务 |
|---|---|
| createAiChatTransport 返回实例 | Task 1 |
| sendMessages 返回 ReadableStream，normalizer 接入 | Task 1 |
| permission/session-init 分流回调不进流 | Task 1 |
| error 双路由 | Task 1 |
| abort/stop 触发 cancelAiTurn + unlisten + close | Task 1 |
| 首次自动 start session，后续复用 | Task 1 |
| respondPermission 调用 respondAiPermission | Task 1 |
| 默认 deps 适配器 | Task 2 |
| test + lint 通过，不触及 Rust/reducer/面板 | Task 3 |

## 衔接

B 完成后，C 子项目创建 `useAiChat` hook，把 `transport.sendMessages` 的流 `getReader()` 消费，逐 chunk 调 A 的 `store.consumeChunk(chunk)`，渲染 parts 纵向流。D–F 子项目消费 store 的 message parts 渲染工具/diff/折叠卡。

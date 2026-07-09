# AI 面板统一传输层设计（B 子项目）

- 日期：2026-06-28
- 作者：refinex
- 子项目：B（整体重建路线图第 0 阶段传输层）
- 上游目标：将 `/Users/refinex/Downloads/1code-main` 聊天面板能力整体重建到 Madora AI 侧边面板
- 依赖：A 子项目（`ai-contracts.ts` 的 `UiMessageChunk`、`ai-event-normalizer.ts` 的归一化、`ai-message-store.ts` 的 store）
- 状态：已通过设计自审，待用户审阅

## 1. 背景与定位

A 子项目已建立 parts 纵向流契约（`UiMessageChunk`/`AiMessage`）、事件归一化适配器（`AiEventNormalizer`：`AiRuntimeEvent` → `UiMessageChunk`）、消息隔离 store（`createAiMessageStore` + `consumeChunk`）。B 子项目建立**连接 Rust agent 运行时与渲染层的统一传输枢纽**，把 Madora 现有的「event 回调 + invoke 触发」封装为 1code 对齐的流接口。

### 现状

Madora 当前在 `ai-panel-content.tsx`（4400 行单体）中：
- `listenAiEvents(callback)` 订阅 Tauri event → 直接喂给 `reduceAiPanelState`（旧平铺 reducer）
- `startAiSession` 启动会话、`sendAiPrompt` 发送、`cancelAiTurn` 取消、`respondAiPermission` 应答权限
- 事件流与 reducer 强耦合，无法被新的 parts 纵向流渲染层（C 子项目）复用

### 1code 参考契约

1code 的 `ChatTransport`（ai SDK v6）接口：
```ts
interface ChatTransport<UIMessage> {
  sendMessages(options: { messages; abortSignal? }): Promise<ReadableStream<UIMessageChunk>>
  reconnectToStream?(): Promise<ReadableStream | null>
}
```
实现模式（`ipc-chat-transport.ts`）：在 `new ReadableStream({ start })` 内启动订阅，`onData` 把 chunk 路由（特殊→全局 atom + return；普通→enqueue），`onError → controller.error`，`finish → controller.close`，`abortSignal.onabort → unsubscribe + close`。

## 2. 设计目标

- 封装 Madora 的 event/invoke 为统一 `AiChatTransport`，对上层暴露 `sendMessages → ReadableStream<UiMessageChunk>`
- 内部用 A 的 `AiEventNormalizer` 归一化 Tauri `AiRuntimeEvent`
- 实现 chunk 路由：permission/session-init 等特殊语义分流到外部回调，普通 chunk 进流
- 实现 abort 取消（`cancelAiTurn` + unlisten + close）
- 封装 session 生命周期：首次 send 自动 start session，后续复用 sessionId
- 保护 Rust 零改动（复用既有命令）

## 3. 核心接口

```ts
import type { UiMessageChunk } from './ai-contracts';
import type { AiContextPack } from './ai-types';

/** session-init chunk（从 UiMessageChunk 联合体抽取） */
type SessionInitChunk = Extract<UiMessageChunk, { type: 'session-init' }>;
/** permission-request chunk */
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

export interface AiChatTransport {
  /** 发起一次对话轮，返回 UiMessageChunk 的可读流。 */
  sendMessages(options: {
    prompt: string;
    context: AiContextPack;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<UiMessageChunk>>;
  /** 应答权限请求。 */
  respondPermission(requestId: string, behavior: 'allow' | 'deny'): Promise<void>;
  /** 显式停止当前会话。 */
  stop(): Promise<void>;
}
```

> **session 模型差异**：1code 每条 message 走流；Madora 是「start session → 多轮 send prompt」。transport 封装为「首次 sendMessages 自动 start session，后续复用 sessionId」，对上层呈现 1code 对齐的 per-turn 流语义。

## 4. 流桥接模式（复刻 1code）

```
sendMessages({ prompt, context, abortSignal })
  └─ new ReadableStream({ start: controller })
       ├─ 若无 sessionId：await startAiSession(...) → 缓存 sessionId
       ├─ normalizer = new AiEventNormalizer()
       ├─ unlisten = listenAiEvents((event) => {
       │    const chunks = normalizer.normalize(event)        // A 的归一化
       │    for (const chunk of chunks) {
       │      if (chunk.type === 'permission-request') { onPermissionRequest?.(chunk); continue }
       │      if (chunk.type === 'session-init')        { onSessionInit?.(chunk);        continue }
       │      if (chunk.type === 'error')               { onError?.(chunk.errorText) }
       │      controller.enqueue(chunk)                     // 普通 chunk 进流
       │      if (chunk.type === 'finish-step') controller.close()  // 轮结束关流
       │    }
       │  })
       ├─ await sendAiPrompt({ sessionId, prompt, context })
       └─ abortSignal?.addEventListener('abort', () => {
            cancelAiTurn(sessionId); unlisten(); try { controller.close() } catch {}
          })
```

### 关键语义

- **首次 start**：`sessionId` 为空时调 `startAiSession`（传 rootPath/profileId/mode/model/extendedThinking/context），成功后缓存。
- **轮结束**：`finish-step` chunk（由 `turnCompleted` 事件归一化而来）标志一轮完成，`controller.close()` 关流。调用方下一轮再 `sendMessages`。
- **error chunk 双路由**：既进流（让 store 记录 error 态），也触发 `onError` 回调（让 UI 弹 toast）。
- **finish chunk**：单条 assistant message 完成的归一化信号，进流但不关流（`finish-step` 才关流）。

## 5. chunk 路由表

| chunk.type | 进流？ | 外部回调 | 说明 |
|---|---|---|---|
| `permission-request` | ❌ | `onPermissionRequest` | 权限确认由上层 UI 处理（allow/deny） |
| `session-init` | ❌ | `onSessionInit` | MCP/工具/技能清单由上层缓存 |
| `error` | ✅ | `onError` | 双路由：store 记 error 态 + UI toast |
| `start`/`finish` | ✅ | — | 消息生命周期 |
| `text-*` | ✅ | — | 文本流 |
| `reasoning*` | ✅ | — | 思考流 |
| `tool-*` | ✅ | — | 工具调用 |
| `message-metadata` | ✅ | — | usage 聚合 |
| `finish-step` | ✅ | — | 轮结束，关流 |

## 6. 取消机制

两层协作（复刻 1code）：
- 上层调 `transport.stop()` 或触发 `abortSignal`
- transport 内：`cancelAiTurn(sessionId)`（通知 Rust 中断）+ `unlisten()`（移除 event 监听）+ `controller.close()`（关流）

`stop()` 保留为显式接口，便于上层无 AbortSignal 时直接停止。

## 7. 权限应答

`respondPermission(requestId, behavior)` 调用 `respondAiPermission({ sessionId, requestId, behavior })`。session 生命周期内复用 sessionId。

## 8. 文件落点

```
components/workspace/ai-panel/
├─ ai-chat-transport.ts          【新增】AiChatTransport 接口 + createAiChatTransport 工厂
└─ __tests__/
   └─ ai-chat-transport.test.ts  【新增】流桥接 + 路由 + abort + session 复用测试（mock listenAiEvents/invoke）
```

transport 是纯编排层，无 React 依赖，可在测试中直接断言流输出。C 子项目通过 `useAiChat` hook 把 transport 的流接到 message-store。

## 9. 完成定义（DoD）

1. `createAiChatTransport(config)` 返回 `AiChatTransport` 实例
2. `sendMessages` 返回 `ReadableStream<UiMessageChunk>`，A 的 `AiEventNormalizer` 正确接入
3. permission/session-init chunk 正确分流到回调，不进流
4. error chunk 双路由（进流 + onError）
5. abort/stop 触发 `cancelAiTurn` + unlisten + close
6. 首次自动 start session，后续复用 sessionId
7. `respondPermission` 正确调用 `respondAiPermission`
8. 全量测试通过，lint 0 error
9. 不接 UI（C 子项目消费）；既有 reducer/面板零触及
10. 阶段提交

## 10. 风险与回滚

- **风险**：event 监听泄漏（流关闭后未 unlisten）。缓解：在 `finish-step`/`abort`/`error` 三条关流路径都调用 unlisten；测试覆盖。
- **风险**：start session 失败导致流卡住。缓解：start 失败时 `controller.error(err)` 关流，不让调用方挂起。
- **回滚**：B 是新增文件，不改 Rust/reducer/既有面板。回滚只需删除新增文件 + revert 提交。

## 11. 后续衔接

- C 子项目（消息列表渲染）：创建 `useAiChat` hook，把 `transport.sendMessages` 的流消费到 A 的 `createAiMessageStore`，渲染 parts 纵向流
- D–F 子项目（工具/diff/折叠卡）：消费 store 的 message parts
- J 子项目（模式切换）：传 `mode` 给 transport config

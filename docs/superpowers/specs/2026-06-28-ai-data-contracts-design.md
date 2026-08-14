# AI 面板数据契约与存储层设计（A 子项目）

- 日期：2026-06-28
- 作者：refinex
- 子项目：A（整体重建路线图的第 0 阶段地基）
- 上游目标：将 `/Users/refinex/Downloads/1code-main` 的聊天面板能力整体重建到 Markune AI 侧边面板
- 状态：已通过设计自审，待用户审阅

## 1. 背景与定位

Markune 的 AI 面板经审计已实现 1code 写作相关能力的约 90%，但底层数据契约与 1code 存在**根本性哲学对立**：

| 维度 | Markune 现状 | 1code |
|---|---|---|
| 消息组织 | 平铺四数组：`messages[]` + `thinking[]` + `tools[]` + `permissions[]`，靠 `parentToolCallId` 重排 | parts 纵向流：每条消息含 `parts[]`，文本/工具/思考按发生顺序内联 |
| 事件协议 | 十余种 top-level 事件（messageDelta/thinkingDelta/toolStarted...） | 统一 `UIMessageChunk` 联合体 |
| 工具状态 | `AiPanelToolStatus` 单独存储 | 从 `part.state` × 全局 `chatStatus` 推导 |
| 渲染性能 | 整个 `AiPanelState` 单 reducer，每次 delta 全量重算 | atomFamily 按消息隔离，流式只重渲染目标消息 |

经用户确认，整体方向为**子系统整体重建**：首期聚焦把 AI 侧边面板做成完整强大的「写作协作问答」能力。A 子项目是契约地基，决定了后续 B（统一传输层）、C–F（渲染层）、G–H（输入交互）、I（对话管理）、J（模式与扩展）全部能否一比一复刻 1code 的渲染逻辑。

## 2. 方案选择

提出三方案：

1. **完整迁移到 parts 纵向流 + UIMessageChunk 契约（已选定）**
   - 事件协议与消息模型一比一对齐 1code，B–J 可直接复刻渲染逻辑
   - 通过事件归一化适配器保护 Rust agent 运行时零改动
   - 保留 JSON 文件存储，契合 markdown-first 身份
   - atomFamily 按消息隔离，根治全量重渲染性能瓶颈
2. 双轨保留 + 渐进迁移——双轨期间需双向同步，易产生状态不一致，且与「彻底放弃现有设计」冲突，否决
3. part 化但保留平铺事件协议——下游每个子项目都要重新发明 1code 已解决的问题，保真度大幅下降，否决

**选定方案一**：唯一能让 B–J 直接复刻 1code 渲染逻辑的路径，且风险通过适配器隔离在前端契约层。

## 3. 设计目标

- 把消息契约从「平铺四数组」整体迁移到 1code 的 `Message{role, parts[], metadata}` 纵向流
- 把事件协议从十余种 top-level 事件统一为 `UiMessageChunk` 联合体
- 保护 Rust agent 运行时零改动（通过事件归一化适配器）
- 保留 JSON 文件存储，内部结构迁移为 parts 纵向流，提供 v1→v2 自动迁移
- 用 atomFamily 按消息隔离，根治渲染性能瓶颈
- 固化工作区感知与「新对话自动加入当前文档作为引用」的数据契约

A 子项目只产契约 + store + 测试，**不接 UI**；UI 切换留给 C 子项目。

## 4. 核心数据契约（新增 `ai-contracts.ts`）

整个 AI 面板的单一真相源，B–J 全部消费。

### 4.1 统一 chunk 契约（传输层 ↔ store 的协议）

一比一复刻 1code `UIMessageChunk`，并保留 Markune 特有的结构化权限语义：

```ts
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
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
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
  // 权限请求（Markune 特有；1code 用 ask-user-question，我们保留显式 allow/deny 语义）
  | {
      type: 'permission-request';
      requestId: string;
      toolCallId: string;
      toolName: string;
      toolInput: unknown;
      reason: string;
      suggestions?: PermissionSuggestion[];
    };
```

> `permission-request` 是 Markune 特有 chunk。1code 用 `ask-user-question` 表达交互，但 Markune 的 agent 运行时（Codex/Claude CLI）有更结构化的权限确认 allow/deny + updatedInput + updatedPermissions，保留显式语义更安全。其余 chunk 一比一对齐 1code。

### 4.2 Message / MessagePart 模型

一比一复刻 1code `message-store.ts`：

```ts
export interface MessagePart {
  type: string; // 'text' | 'tool-<Name>' | 'reasoning' | 'data-image' | ...
  text?: string;
  toolCallId?: string;
  state?: string; // 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'result'
  input?: unknown;
  output?: unknown;
  errorText?: string;
  providerMetadata?: Record<string, unknown>;
  [key: string]: unknown; // 索引签名（与 1code 一致，承载工具特定字段）
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  metadata?: MessageMetadata;
  createdAt: number; // epoch ms
}

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
```

### 4.3 工具状态推导

复刻 1code `getToolStatus`，把每个工具 part 的静态 `part.state` 与全局 `chatStatus` 联合推导出四种 UI 状态：

```ts
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error' | 'stopped';

export function getToolStatus(part: MessagePart, chatStatus?: ChatStatus) {
  const basePending =
    part.state !== 'output-available' &&
    part.state !== 'output-error' &&
    part.state !== 'result';
  const isError =
    part.state === 'output-error' ||
    (part.state === 'output-available' && (part.output as any)?.success === false);
  const isSuccess = part.state === 'output-available' && !isError;
  const isActivelyStreaming = chatStatus === 'streaming' || chatStatus === 'submitted';
  const isPending = basePending && isActivelyStreaming;
  const isInterrupted = basePending && !isActivelyStreaming && chatStatus !== undefined;
  return { isPending, isError, isSuccess, isInterrupted };
}
```

关键行为：流式中断时，仍在运行的工具翻转为 `isInterrupted`（显示完成/停止）而非永久挂起；历史消息（`chatStatus === undefined`）只显示自身状态。

### 4.4 辅助契约

```ts
export interface McpServerInfo {
  name: string;
  status?: 'connected' | 'failed' | 'connecting' | string;
  tools?: string[];
  icon?: string;
}

export interface McpPluginInfo {
  name: string;
  path: string;
}

export interface PermissionSuggestion {
  id: string;
  label: string;
  description?: string;
}
```

## 5. 事件归一化适配器（新增 `ai-event-normalizer.ts`）

职责：把 Tauri 现有 `AiRuntimeEvent` 实时归一化为 `UiMessageChunk` 流。**这是保护 Rust 后端的关键边界——Rust 零改动。**

### 5.1 归一化映射表

| 现有 `AiRuntimeEvent` | 归一化为 `UiMessageChunk` |
|---|---|
| `sessionStarted` | `start`（messageId 由前端生成） |
| `messageDelta` | `text-delta` |
| `messageCompleted` | `text-end` + `finish` |
| `thinkingDelta` | `reasoning-delta` |
| `toolStarted` | `tool-input-start`，若 input 已完整则紧跟 `tool-input-available` |
| `toolInputDelta` | `tool-input-delta` |
| `toolCompleted` | `tool-output-available` 或 `tool-output-error` |
| `permissionPrompt` | `permission-request` |
| `permissionDenied` | `tool-output-error`（reason） |
| `usageUpdated` | `message-metadata` |
| `turnCompleted` | `finish-step` |
| `runState` / `sessionExited` | 内部状态，更新 chatStatus（不产出 chunk） |
| `error` | `error` |

### 5.2 适配器形态

有状态生成器：维护当前 step 内的 messageId 映射、text part id、toolCallId→toolName 映射、reasoning part id，确保 chunk 序列正确。**纯函数 + 可单测**，这是 A 子项目的测试重点。

```ts
export class AiEventNormalizer {
  private textPartId?: string;
  private reasoningId?: string;
  private toolNames = new Map<string, string>(); // toolCallId -> toolName

  /** 单个 runtime event → 0..N 个 chunk（按序产出） */
  normalize(event: AiRuntimeEvent): UiMessageChunk[];
}
```

对未知 / 异常事件，发 `error` chunk 并打 console.warn，保证流不中断。

## 6. 存储层（重构 `ai-session-store.ts`）

### 6.1 存储格式 v2

保留 JSON 文件（`{workspace}/.markune/ai-sessions/{id}.json`），内部结构从平铺四数组迁移为 parts 纵向流：

```ts
export interface AiConversationRecord {
  id: string;
  title: string;
  profileId: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
  // 工作区感知：记录对话与文档的关联
  documentPath?: string;
  documentTitle?: string;
  // 新：单一 messages 数组（parts 纵向流）
  messages: AiMessage[];
  // 对话级元数据（usage 等聚合）
  metadata?: Partial<MessageMetadata>;
  // schema 版本，用于迁移
  schemaVersion: 2; // v1 = 平铺四数组，v2 = parts 纵向流
}
```

### 6.2 v1 → v2 迁移

新增 `migrateConversationV1ToV2()`：把旧记录的 `thinking[]` / `tools[]` / `permissions[]` 按 `parentToolCallId` 与时间顺序合并进对应 assistant 消息的 `parts[]`。

合并规则：
- 工具调用 `tool-*`：插入到产生它的 assistant 消息的 parts 末尾（按 parentToolCallId 定位，或最后一条 assistant 消息）
- thinking `reasoning`：紧邻其所属工具调用之前，或消息 parts 开头
- permissions：转成 `permission-request` part 或保留为消息级元数据

**自动迁移**：加载旧记录时检测 `schemaVersion` 缺失即为 v1，惰性迁移后写回。迁移前自动备份 `{id}.json` → `{id}.json.v1.bak`。

提供 CLI 迁移命令 `pnpm ai:migrate-sessions`（dry-run / apply 两档）批量处理。

## 7. 状态架构（新增 `ai-message-store.ts`）

引入 Jotai（A 的前置依赖，需 `pnpm add jotai`），实现 atomFamily 按消息隔离。

```
AiConversationStore（每对话一个）
├─ messageIdsAtom: string[]                       // 有序 id 列表（轻量，变更少）
├─ messageAtomFamily: atomFamily<id, AiMessage>   // 每条消息独立原子
├─ chatStatusAtom: ChatStatus                     // 全局流状态
├─ metadataAtom: MessageMetadata                  // usage 等聚合
└─ consumeChunk(chunk): void                      // chunk → 精确更新目标 messageAtom
```

`consumeChunk(chunk)` 的更新粒度是性能核心：
- `text-delta` 只更新对应 messageId 的 messageAtom 的最后一个 `text` part，**其他消息的订阅者不重渲染**
- `tool-input-delta` 只更新对应 toolCallId 所在 part
- `reasoning-delta` 只更新对应 reasoning part

store 通过 React hook 暴露：`useMessage(messageId)`、`useMessageIds()`、`useChatStatus()`、`useConversationMetadata()`。

## 8. 工作区感知与自动引用

这两点在 A 子项目落地数据契约，G/H 子项目实现 UI。

### 8.1 工作区感知

`AiConversationRecord` 保留 `documentPath / documentTitle`。新建对话时由 `ai-context.ts` 的 `buildAiContextPack` 注入 `workspaceRootPath + document`，存入 record。@mention 的文件清单（G 子项目）由 `buildAiContextPack` 的 `references` 提供。

### 8.2 新对话自动加入当前文档作为引用

决策为**可配置默认开启**。新建对话时，若当前有打开文档，自动把文档作为 `references: [{ source: 'current-document', ... }]` 加入首条用户消息的 context pack。在设置中提供开关 `ai.autoAttachCurrentDocument`（默认 true）。这个语义已在 `ai-context.ts` 存在，A 子项目固化契约 + 默认值。

## 9. 文件落点

```
components/workspace/ai-panel/
├─ ai-contracts.ts          【新增】UiMessageChunk / AiMessage / MessagePart / getToolStatus / ChatStatus
├─ ai-event-normalizer.ts   【新增】AiRuntimeEvent → UiMessageChunk 归一化（纯函数，可单测）
├─ ai-message-store.ts      【新增】atomFamily 消息隔离 store + consumeChunk
├─ ai-session-store.ts      【重构】v2 record 读写 + v1→v2 迁移
├─ ai-types.ts              【迁移】旧平铺类型保留供旧 reducer 使用，新增导出从 ai-contracts.ts 转出
├─ ai-reducer.ts            【标记废弃】A 完成后由 message-store 取代，B/C 切换后删除
└─ __tests__/
   ├─ ai-event-normalizer.test.ts   【新增】事件归一化全表测试（重点）
   ├─ ai-message-store.test.ts      【新增】chunk 消费 → 精确更新测试
   └─ ai-session-store.test.ts      【新增】v2 读写 + v1→v2 迁移测试
```

## 10. 完成定义（DoD）

1. `ai-contracts.ts` 定义全部契约，类型导出可被 B–J 引用
2. `ai-event-normalizer.ts` 通过全表归一化测试（每个 `AiRuntimeEvent` 变体 → 正确 chunk）
3. `ai-message-store.ts` 通过 chunk 消费测试（验证只重渲染目标消息）
4. `ai-session-store.ts` 支持 v2 读写 + v1→v2 自动迁移，迁移测试通过
5. 工作区感知字段 + 自动引用默认值固化
6. 此时**不接 UI**——A 只产契约 + store + 测试；旧 reducer/面板继续工作（A 不改 reducer，双契约并存但互不干扰）
7. `pnpm test:run -- ai-panel` 全绿；`pnpm lint` 通过
8. 阶段提交：`feat(ai): 引入 parts 纵向流契约与 atomFamily 消息存储`

## 11. 风险与回滚

- **风险**：事件归一化适配器若遗漏某种 `AiRuntimeEvent` 变体，会导致 chunk 流不完整。
  - 缓解：全表测试覆盖所有变体；适配器对未知事件发 `error` chunk 并打日志。
- **风险**：v1→v2 迁移损坏历史对话。
  - 缓解：迁移前自动备份；迁移纯函数可单测；CLI 提供 dry-run。
- **回滚**：A 子项目不改 Rust、不改现有 reducer/面板，纯新增文件。回滚只需删除新增文件 + revert 提交，旧面板完全不受影响。

## 12. 后续衔接

- B 子项目（统一传输层 ChatTransport）：把 Tauri event 流封装为统一 transport 接口，调用 A 的归一化适配器产出 chunk 流
- C 子项目（消息列表 + 助手消息渲染）：消费 A 的 message store，渲染 parts 纵向流
- D–F 子项目（工具卡片 / diff / 折叠卡）：消费 A 的 `getToolStatus` 与 part 模型
- I 子项目（对话管理）：基于 A 的 v2 存储实现历史 / Fork / 归档 / 搜索

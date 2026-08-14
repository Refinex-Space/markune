# AI 数据契约与存储层实现计划（A 子项目）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Markune AI 面板建立 1code 对齐的 parts 纵向流数据契约与 atomFamily 消息存储，作为 B–J 子项目的契约地基。

**Architecture:** 新增 `ai-contracts.ts`（单一真相源契约）+ `ai-event-normalizer.ts`（把现有 Tauri `AiRuntimeEvent` 归一化为 `UiMessageChunk`）+ `ai-message-store.ts`（Jotai atomFamily 按消息隔离）+ `ai-session-store.ts`（v2 读写 + v1→v2 迁移）。**关于存储边界（经 Tauri 安全模型约束修正）**：Tauri v2 的 fs 插件需要显式 scope 授权才能读写工作区目录，而项目 capabilities 只授予 `fs:default`，且项目所有文件 I/O 一律走自定义 Rust invoke 命令（非 fs 插件）。同时 Rust 既有 `AiConversationMessage.content` 是非 Option 字段，v2 结构无法通过既有 `save_ai_conversation` 通路往返。因此 A 子项目**新增一组独立的 Rust v2 命令**（`load/save/list_ai_conversations_v2`，操作独立的 `.markune/ai-sessions/{id}.json` 文件，与既有 v1 命令并存），这是被 Tauri 安全模型与项目惯例共同决定的唯一可行路径，属「新增业务命令」而非「改 Tauri permissions」。旧 reducer/面板完全不受影响（A 不改 reducer，双契约并存互不干扰）。

**Tech Stack:** TypeScript、React、Jotai（atomFamily）、Vitest、Tauri fs API

**Spec:** `docs/superpowers/specs/2026-06-28-ai-data-contracts-design.md`

---

## File Structure

```
components/workspace/ai-panel/
├─ ai-contracts.ts          【新增】UiMessageChunk / AiMessage / MessagePart / getToolStatus / ChatStatus / 辅助契约
├─ ai-event-normalizer.ts   【新增】AiRuntimeEvent → UiMessageChunk 归一化（纯类，可单测）
├─ ai-message-store.ts      【新增】Jotai atomFamily 消息隔离 store + consumeChunk + hooks
├─ ai-session-store.ts      【新增】v2 record 读写（Tauri fs）+ v1→v2 迁移
├─ ai-types.ts              【保留】旧类型不动，供旧 reducer 使用
├─ ai-reducer.ts            【保留】不动，C 子项目切换后再删
└─ __tests__/
   ├─ ai-event-normalizer.test.ts   【新增】事件归一化全表测试
   ├─ ai-message-store.test.ts      【新增】chunk 消费 → 精确更新测试
   └─ ai-session-store.test.ts      【新增】v2 读写 + v1→v2 迁移测试
```

每个文件单一职责：契约定义（contracts）／事件转换（normalizer）／运行时状态（message-store）／持久化（session-store）。文件间通过 `ai-contracts.ts` 的类型导出耦合，不直接依赖彼此实现。

---

## Task 0: 引入 Jotai 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 jotai**

Run:
```bash
pnpm add jotai
```
Expected: `jotai` 出现在 `package.json` dependencies，`node_modules/jotai` 存在。

- [ ] **Step 2: 确认安装结果**

Run:
```bash
node -e "console.log(require('jotai/package.json').version)"
```
Expected: 打印 jotai 版本号（如 `2.x.x`），无报错。

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(ai): 引入 jotai 依赖用于 atomFamily 消息存储"
```

---

## Task 1: ai-contracts.ts — 核心数据契约

**Files:**
- Create: `components/workspace/ai-panel/ai-contracts.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-contracts.test.ts`

这是整个 AI 面板的单一真相源。所有类型来自 spec §4。

- [ ] **Step 1: 写 getToolStatus 的失败测试**

Create `components/workspace/ai-panel/__tests__/ai-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getToolStatus } from '../ai-contracts';
import type { MessagePart } from '../ai-contracts';

describe('getToolStatus', () => {
  it('returns isPending when streaming and state is input-streaming', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    expect(getToolStatus(part, 'streaming')).toEqual({
      isPending: true,
      isError: false,
      isSuccess: false,
      isInterrupted: false,
    });
  });

  it('returns isSuccess when output-available and output.success !== false', () => {
    const part: MessagePart = {
      type: 'tool-Bash',
      state: 'output-available',
      output: { success: true },
    };
    expect(getToolStatus(part, 'streaming').isSuccess).toBe(true);
  });

  it('returns isError when output.success === false', () => {
    const part: MessagePart = {
      type: 'tool-Bash',
      state: 'output-available',
      output: { success: false },
    };
    expect(getToolStatus(part, 'streaming').isError).toBe(true);
  });

  it('returns isError when state is output-error', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'output-error' };
    expect(getToolStatus(part, 'streaming').isError).toBe(true);
  });

  it('returns isInterrupted when pending and chat stopped', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    expect(getToolStatus(part, 'ready').isInterrupted).toBe(true);
  });

  it('treats historical messages (chatStatus undefined) as not pending/interrupted', () => {
    const part: MessagePart = { type: 'tool-Bash', state: 'input-streaming' };
    const status = getToolStatus(part, undefined);
    expect(status.isPending).toBe(false);
    expect(status.isInterrupted).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-contracts
```
Expected: FAIL（`Cannot find module '../ai-contracts'`）。

- [ ] **Step 3: 实现 ai-contracts.ts 全部契约**

Create `components/workspace/ai-panel/ai-contracts.ts`:

```ts
// @author refinex
// AI 面板核心数据契约 —— 整个 AI 面板的单一真相源。
// B-J 子项目（传输层 / 渲染层 / 输入交互 / 对话管理 / 模式扩展）全部消费本文件。
// 契约与 1code (src/main/lib/claude/types.ts + message-store.ts) 一一对齐，
// 保留 Markune 特有的结构化权限语义 (permission-request)。

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
 * 一比一复刻 1code UIMessageChunk，并保留 Markune 特有的 permission-request。
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
  // 权限请求（Markune 特有；保留显式 allow/deny 语义）
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
  state?: string; // 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'result'
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
  createdAt: number; // epoch ms
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-contracts
```
Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/ai-panel/ai-contracts.ts components/workspace/ai-panel/__tests__/ai-contracts.test.ts
git commit -m "feat(ai): 引入 parts 纵向流与 UiMessageChunk 核心契约"
```

---

## Task 2: ai-event-normalizer.ts — 事件归一化适配器

**Files:**
- Create: `components/workspace/ai-panel/ai-event-normalizer.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-event-normalizer.test.ts`

职责：把 Tauri 现有 `AiRuntimeEvent` 实时归一化为 `UiMessageChunk` 流。有状态生成器，纯函数可单测。这是保护 Rust 后端零改动的关键边界。

- [ ] **Step 1: 写归一化全表失败测试**

Create `components/workspace/ai-panel/__tests__/ai-event-normalizer.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { AiEventNormalizer } from '../ai-event-normalizer';
import type { AiRuntimeEvent } from '../ai-types';

describe('AiEventNormalizer', () => {
  let n: AiEventNormalizer;

  beforeEach(() => {
    n = new AiEventNormalizer();
  });

  it('sessionStarted → start chunk', () => {
    const event: AiRuntimeEvent = {
      type: 'sessionStarted',
      session: { sessionId: 's1', profileId: 'p1', rootPath: '/r', status: 'running' },
    };
    const chunks = n.normalize(event);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('start');
  });

  it('messageDelta → text-delta；首次自动前置 text-start', () => {
    const chunks1 = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'Hello',
    });
    expect(chunks1.map((c) => c.type)).toEqual(['text-start', 'text-delta']);
    if (chunks1[0].type === 'text-start' && chunks1[1].type === 'text-delta') {
      expect(chunks1[1].delta).toBe('Hello');
    }
  });

  it('messageDelta 连续两次共用同一个 text part id', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'A' });
    const chunks2 = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: 'B',
    });
    expect(chunks2).toHaveLength(1);
    expect(chunks2[0].type).toBe('text-delta');
  });

  it('messageCompleted → text-end + finish', () => {
    const chunks = n.normalize({
      type: 'messageCompleted',
      sessionId: 's1',
      messageId: 'm1',
    });
    expect(chunks.map((c) => c.type)).toEqual(['text-end', 'finish']);
  });

  it('thinkingDelta → reasoning-delta；首次自动前置 reasoning', () => {
    const chunks1 = n.normalize({
      type: 'thinkingDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: '思考',
    });
    expect(chunks1.map((c) => c.type)).toEqual(['reasoning', 'reasoning-delta']);
    const chunks2 = n.normalize({
      type: 'thinkingDelta',
      sessionId: 's1',
      messageId: 'm1',
      delta: '继续',
    });
    expect(chunks2.map((c) => c.type)).toEqual(['reasoning-delta']);
  });

  it('toolStarted → tool-input-start（input 完整时紧跟 tool-input-available）', () => {
    const chunks = n.normalize({
      type: 'toolStarted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    expect(chunks.map((c) => c.type)).toEqual(['tool-input-start', 'tool-input-available']);
    if (chunks[0].type === 'tool-input-start') {
      expect(chunks[0].toolName).toBe('Bash');
    }
  });

  it('toolStarted input 为空时只产出 tool-input-start', () => {
    const chunks = n.normalize({
      type: 'toolStarted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Read',
      input: {},
    });
    expect(chunks.map((c) => c.type)).toEqual(['tool-input-start']);
  });

  it('toolInputDelta → tool-input-delta', () => {
    const chunks = n.normalize({
      type: 'toolInputDelta',
      sessionId: 's1',
      toolCallId: 't1',
      partialJson: '{"a":1',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-input-delta');
    if (chunks[0].type === 'tool-input-delta') {
      expect(chunks[0].inputTextDelta).toBe('{"a":1');
    }
  });

  it('toolCompleted success → tool-output-available', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: { stdout: 'ok' },
      status: 'success',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-output-available');
  });

  it('toolCompleted error → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: { stderr: 'boom' },
      status: 'error',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('toolCompleted denied → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'toolCompleted',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      output: {},
      status: 'denied',
    });
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('permissionPrompt → permission-request', () => {
    const chunks = n.normalize({
      type: 'permissionPrompt',
      sessionId: 's1',
      requestId: 'r1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: { command: 'rm' },
      reason: '危险命令',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('permission-request');
  });

  it('permissionDenied → tool-output-error', () => {
    const chunks = n.normalize({
      type: 'permissionDenied',
      sessionId: 's1',
      toolCallId: 't1',
      toolName: 'Bash',
      toolInput: {},
    });
    expect(chunks[0].type).toBe('tool-output-error');
  });

  it('usageUpdated → message-metadata', () => {
    const chunks = n.normalize({
      type: 'usageUpdated',
      sessionId: 's1',
      inputTokens: 10,
      outputTokens: 20,
      totalCostUsd: 0.01,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('message-metadata');
    if (chunks[0].type === 'message-metadata') {
      expect(chunks[0].messageMetadata.inputTokens).toBe(10);
      expect(chunks[0].messageMetadata.outputTokens).toBe(20);
    }
  });

  it('turnCompleted → finish-step', () => {
    const chunks = n.normalize({ type: 'turnCompleted', sessionId: 's1', cancelled: false });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('finish-step');
  });

  it('runState / sessionExited 不产出 chunk（仅内部状态）', () => {
    expect(n.normalize({ type: 'runState', sessionId: 's1', state: 'stopped' })).toEqual([]);
    expect(n.normalize({ type: 'sessionExited', sessionId: 's1' })).toEqual([]);
  });

  it('error → error chunk', () => {
    const chunks = n.normalize({ type: 'error', sessionId: 's1', message: 'boom' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
  });

  it('messageCompleted 后再次 messageDelta 会开启新 text part', () => {
    n.normalize({ type: 'messageDelta', sessionId: 's1', messageId: 'm1', delta: 'A' });
    n.normalize({ type: 'messageCompleted', sessionId: 's1', messageId: 'm1' });
    const chunks = n.normalize({
      type: 'messageDelta',
      sessionId: 's1',
      messageId: 'm2',
      delta: 'B',
    });
    expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-event-normalizer
```
Expected: FAIL（`Cannot find module '../ai-event-normalizer'`）。

- [ ] **Step 3: 实现 ai-event-normalizer.ts**

Create `components/workspace/ai-panel/ai-event-normalizer.ts`:

```ts
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
  private reasoningId: string | undefined;
  private toolNames = new Map<string, string>(); // toolCallId -> toolName
  private completedMessageIds = new Set<string>();

  /** 单个 runtime event → 0..N 个 chunk（按序产出）。 */
  normalize(event: AiRuntimeEvent): UiMessageChunk[] {
    switch (event.type) {
      case 'sessionStarted':
        return [{ type: 'start' }];

      case 'messageDelta': {
        const chunks: UiMessageChunk[] = [];
        const newMessage = !this.completedMessageIds.has(event.messageId);
        if (this.textPartId === undefined || newMessage) {
          this.textPartId = createPartId('text');
          this.completedMessageIds.delete(event.messageId);
          chunks.push({ type: 'text-start', id: this.textPartId });
        }
        chunks.push({ type: 'text-delta', id: this.textPartId, delta: event.delta });
        return chunks;
      }

      case 'messageCompleted': {
        const chunks: UiMessageChunk[] = [];
        if (this.textPartId) {
          chunks.push({ type: 'text-end', id: this.textPartId });
          this.textPartId = undefined;
        }
        chunks.push({ type: 'finish' });
        this.completedMessageIds.add(event.messageId);
        return chunks;
      }

      case 'thinkingDelta': {
        const chunks: UiMessageChunk[] = [];
        if (this.reasoningId === undefined) {
          this.reasoningId = createPartId('reasoning');
          chunks.push({ type: 'reasoning', id: this.reasoningId, text: event.delta });
          return chunks;
        }
        chunks.push({ type: 'reasoning-delta', id: this.reasoningId, delta: event.delta });
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
        return [
          this.toolCompletedChunk(event.toolCallId, event.status, event.output),
        ];

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
        // eslint-disable-next-line no-console
        console.warn('[AiEventNormalizer] 未处理的事件类型', (event as { type: string }).type);
        return [{ type: 'error', errorText: `未处理的事件类型: ${(event as { type: string }).type}` }];
      }
    }
  }

  /** 重置内部状态，用于新对话/重连。 */
  reset(): void {
    this.textPartId = undefined;
    this.reasoningId = undefined;
    this.toolNames.clear();
    this.completedMessageIds.clear();
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-event-normalizer
```
Expected: PASS（全表用例绿）。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/ai-panel/ai-event-normalizer.ts components/workspace/ai-panel/__tests__/ai-event-normalizer.test.ts
git commit -m "feat(ai): 引入 AiRuntimeEvent→UiMessageChunk 归一化适配器"
```

---

## Task 3: ai-session-store.ts — v2 存储与 v1→v2 迁移（纯逻辑部分）

**Files:**
- Create: `components/workspace/ai-panel/ai-session-store.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-session-store.test.ts`

先把**纯函数迁移逻辑**与类型定义做出来并测好，Tauri fs I/O 在 Task 4 接入。Rust 零改动：直接通过 Tauri fs API 读写 `.markune/ai-sessions/{id}.json`，v2 作为独立格式。

- [ ] **Step 1: 写迁移与记录构造的失败测试**

Create `components/workspace/ai-panel/__tests__/ai-session-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  createEmptyConversationRecord,
  migrateConversationV1ToV2,
  isV1Record,
} from '../ai-session-store';
import type { AiConversationRecordV1 } from '../ai-session-store';

describe('isV1Record', () => {
  it('识别缺失 schemaVersion 为 v1', () => {
    expect(isV1Record({ id: 'x', messages: [] } as unknown as Record<string, unknown>)).toBe(true);
  });

  it('识别 schemaVersion 2 为非 v1', () => {
    expect(
      isV1Record({ id: 'x', schemaVersion: 2, messages: [] } as unknown as Record<string, unknown>),
    ).toBe(false);
  });
});

describe('createEmptyConversationRecord', () => {
  it('构造 schemaVersion 2 的空记录', () => {
    const r = createEmptyConversationRecord({
      id: 'c1',
      profileId: 'p1',
      providerId: 'local',
    });
    expect(r.schemaVersion).toBe(2);
    expect(r.messages).toEqual([]);
    expect(r.id).toBe('c1');
    expect(r.title).toBe('新对话');
    expect(typeof r.createdAt).toBe('number');
  });
});

describe('migrateConversationV1ToV2', () => {
  it('把 v1 的 messages 转为 parts 纵向流（user/assistant 各一条）', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: '旧对话',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        { id: 'u1', role: 'user', content: '你好' },
        { id: 'a1', role: 'assistant', content: '你好，有什么可以帮你？' },
      ],
      thinking: [],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.messages).toHaveLength(2);
    expect(v2.messages[0].parts).toEqual([{ type: 'text', text: '你好' }]);
    expect(v2.messages[1].parts).toEqual([
      { type: 'text', text: '你好，有什么可以帮你？' },
    ]);
  });

  it('把 v1 tools 合并进最后一条 assistant 消息的 parts', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'a1', role: 'assistant', content: '执行中' }],
      thinking: [],
      tools: [
        {
          id: 't1',
          name: 'Bash',
          input: { command: 'ls' },
          output: { stdout: 'a\nb' },
          status: 'success',
        },
      ],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages[0].parts).toContainEqual({
      type: 'tool-Bash',
      toolCallId: 't1',
      state: 'output-available',
      input: { command: 'ls' },
      output: { stdout: 'a\nb' },
    });
  });

  it('把 v1 thinking 合并进最后一条 assistant 消息的 parts 开头', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'a1', role: 'assistant', content: '答' }],
      thinking: [{ id: 'th1', content: '我在思考' }],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages[0].parts[0]).toMatchObject({ type: 'reasoning', text: '我在思考' });
  });

  it('没有 assistant 消息时，tools/thinking 挂载到末尾的虚拟 assistant 消息', () => {
    const v1: AiConversationRecordV1 = {
      id: 'c1',
      title: 't',
      profileId: 'p1',
      profileLabel: 'P',
      providerId: 'local',
      providerLabel: 'Local',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [{ id: 'u1', role: 'user', content: '问' }],
      thinking: [{ id: 'th1', content: '思考' }],
      tools: [],
      permissions: [],
    };
    const v2 = migrateConversationV1ToV2(v1);
    expect(v2.messages).toHaveLength(2);
    expect(v2.messages[1].role).toBe('assistant');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-session-store
```
Expected: FAIL（`Cannot find module '../ai-session-store'`）。

- [ ] **Step 3: 实现 ai-session-store.ts 纯逻辑部分**

Create `components/workspace/ai-panel/ai-session-store.ts`:

```ts
// @author refinex
// 对话持久化（v2 parts 纵向流）+ v1→v2 迁移。
// Rust 零改动：绕过 save_ai_conversation 命令，直接通过 Tauri fs API 读写
// {workspace}/.markune/ai-sessions/{id}.json。Rust 端继续用 v1 格式服务现有 agent 运行时。

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
  let lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant && ((v1.thinking?.length ?? 0) > 0 || (v1.tools?.length ?? 0) > 0)) {
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-session-store
```
Expected: PASS（迁移用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/ai-panel/ai-session-store.ts components/workspace/ai-panel/__tests__/ai-session-store.test.ts
git commit -m "feat(ai): 引入 v2 会话存储格式与 v1→v2 迁移"
```

---

## Task 4: Rust v2 命令 + 前端 invoke 封装

**Files:**
- Modify: `src-tauri/src/agent_runtime.rs`（新增 3 个 v2 命令）
- Modify: `src-tauri/src/lib.rs`（注册 3 个新命令）
- Modify: `components/workspace/workspace-api.ts`（新增 invoke 封装）
- Modify: `components/workspace/ai-panel/ai-session-store.ts`（接 invoke）
- Modify: `components/workspace/ai-panel/__tests__/ai-session-store.test.ts`

**存储边界决策（关键）**：经审计，Tauri v2 的 fs 插件需要显式 scope 授权（capabilities 仅 `fs:default`），项目所有文件 I/O 一律走自定义 Rust invoke 命令；且 Rust 既有 `AiConversationMessage.content` 是非 Option 字段，v2 parts 纵向流无法通过既有 `save_ai_conversation` 往返。因此 A 子项目**新增 3 个独立 Rust v2 命令**，操作独立后缀 `.v2.json` 文件（与 v1 物理隔离），用 `serde_json::Value` 容器（不强制 v1 结构）。这属「新增业务命令」而非「改 Tauri permissions」，符合项目惯例。

### Task 4a: Rust v2 命令

- [ ] **Step 1: 新增 Rust v2 命令**

在 `src-tauri/src/agent_runtime.rs` 既有 `save_ai_conversation`（约 line 685）之后追加：

```rust
// v2 会话存储：parts 纵向流格式，与 v1 物理隔离（.v2.json 后缀）。
// 用 serde_json::Value 容器，避免 v1 的强类型 AiConversationMessage.content 约束。
// @author refinex

fn ai_conversation_v2_path(root: &Path, id: &str) -> PathBuf {
    ai_conversations_dir(root).join(format!("{id}.v2.json"))
}

#[tauri::command]
pub fn read_ai_conversation_v2(
    root_path: String,
    conversation_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let root = validate_agent_root(&root_path)?;
    let id = validate_conversation_id(&conversation_id)?;
    let path = ai_conversation_v2_path(&root, id);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|_| "无法读取 AI 会话 v2".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "AI 会话 v2 格式无效".to_string())?;
    Ok(Some(value))
}

#[tauri::command]
pub fn save_ai_conversation_v2(
    root_path: String,
    record: serde_json::Value,
) -> Result<(), String> {
    let root = validate_agent_root(&root_path)?;
    // 从 record.id 取会话 id 做校验
    let id = record
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "AI 会话 v2 缺少 id".to_string())?;
    validate_conversation_id(id)?;

    let directory = ai_conversations_dir(&root);
    fs::create_dir_all(&directory).map_err(|_| "无法创建 AI 会话目录".to_string())?;
    write_json_pretty(&ai_conversation_v2_path(&root, id), &record)
        .map_err(|_| "无法保存 AI 会话 v2".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_ai_conversations_v2(
    root_path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let root = validate_agent_root(&root_path)?;
    let directory = ai_conversations_dir(&root);
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut summaries = Vec::new();
    let entries = match fs::read_dir(&directory) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.to_string_lossy().ends_with(".v2.json") {
            continue;
        }
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&raw) {
                // 列表只返回摘要字段，剥离 messages 数组以减小体积
                if let Some(obj) = value.as_object_mut() {
                    let message_count = obj
                        .get("messages")
                        .and_then(|m| m.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0);
                    obj.remove("messages");
                    obj.insert(
                        "messageCount".to_string(),
                        serde_json::Value::Number(message_count.into()),
                    );
                }
                summaries.push(value);
            }
        }
    }
    // 按 updatedAt 倒序
    summaries.sort_by(|a, b| {
        let ta = a.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let tb = b.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    Ok(summaries)
}
```

> 注：`PathBuf` 已在文件顶部 import（既有 `ai_conversation_path` 返回 `PathBuf`）。若未 import，需在文件顶部 use 区追加 `use std::path::PathBuf;`。`validate_agent_root` / `ai_conversations_dir` / `validate_conversation_id` / `write_json_pretty` 均为既有函数。

- [ ] **Step 2: 注册新命令到 lib.rs**

在 `src-tauri/src/lib.rs` 的 `invoke_handler!` 中，既有 `agent_runtime::save_ai_conversation,`（约 line 50）之后追加三行：

```rust
            agent_runtime::read_ai_conversation_v2,
            agent_runtime::save_ai_conversation_v2,
            agent_runtime::list_ai_conversations_v2,
```

- [ ] **Step 3: 验证 Rust 编译**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20
```
Expected: 编译通过，无 error（warning 可接受）。若有未 import 的 `PathBuf`，按 Step 1 注释补 use。

- [ ] **Step 4: 提交 Rust 改动**

```bash
git add src-tauri/src/agent_runtime.rs src-tauri/src/lib.rs
git commit -m "feat(ai/rust): 新增 v2 会话读写与列表命令（parts 纵向流）"
```

### Task 4b: 前端 invoke 封装 + session-store 接入

- [ ] **Step 5: 写 I/O 失败测试（mock invoke）**

在 `__tests__/ai-session-store.test.ts` 顶部既有 `import { describe, expect, it } from 'vitest';` 改为：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

并在文件末尾追加（mock `@tauri-apps/api/core` 的 invoke）：

```ts
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  loadConversationRecord,
  saveConversationRecord,
  listConversationSummaries,
} from '../ai-session-store';

describe('v2 invoke I/O', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('loadConversationRecord v2 文件存在时直接返回（已是 v2）', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'c1',
      title: '对话',
      profileId: 'p1',
      providerId: 'local',
      createdAt: 1,
      updatedAt: 2,
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }], createdAt: 1 }],
      schemaVersion: 2,
    });
    const rec = await loadConversationRecord('/ws', 'c1');
    expect(invokeMock).toHaveBeenCalledWith('read_ai_conversation_v2', {
      rootPath: '/ws',
      conversationId: 'c1',
    });
    expect(rec?.schemaVersion).toBe(2);
    expect(rec?.messages[0].parts[0]).toMatchObject({ type: 'text', text: 'hi' });
  });

  it('loadConversationRecord v2 文件不存在（返回 null）时回退 v1 并迁移', async () => {
    invokeMock
      .mockResolvedValueOnce(null) // read v2 -> 不存在
      .mockResolvedValueOnce({ // read v1
        id: 'c1',
        title: '旧',
        profileId: 'p1',
        providerId: 'local',
        createdAt: 1,
        updatedAt: 2,
        messages: [{ id: 'u1', role: 'user', content: 'hi' }],
      });
    const rec = await loadConversationRecord('/ws', 'c1');
    expect(rec?.schemaVersion).toBe(2);
    expect(rec?.messages[0].parts[0]).toMatchObject({ type: 'text', text: 'hi' });
  });

  it('saveConversationRecord 调用 save_ai_conversation_v2', async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const rec = createEmptyConversationRecord({ id: 'c2', profileId: 'p', providerId: 'local' });
    await saveConversationRecord('/ws', rec);
    expect(invokeMock).toHaveBeenCalledWith(
      'save_ai_conversation_v2',
      expect.objectContaining({ rootPath: '/ws' }),
    );
    const saved = invokeMock.mock.calls[0][1].record;
    expect(saved.schemaVersion).toBe(2);
  });

  it('listConversationSummaries 调用 list_ai_conversations_v2', async () => {
    invokeMock.mockResolvedValueOnce([{ id: 'c1', title: 't', messageCount: 3 }]);
    const list = await listConversationSummaries('/ws');
    expect(invokeMock).toHaveBeenCalledWith('list_ai_conversations_v2', { rootPath: '/ws' });
    expect(list[0].messageCount).toBe(3);
  });
});
```

> 注：回退 v1 复用既有 `read_ai_conversation` 命令（workspace-api 已封装），测试里 mock 为第二个 invoke 返回值。

- [ ] **Step 6: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-session-store
```
Expected: FAIL（`loadConversationRecord` / `saveConversationRecord` / `listConversationSummaries` 未导出）。

- [ ] **Step 7: 在 workspace-api.ts 新增 invoke 封装**

在 `workspace-api.ts` 既有 `saveAiConversation` 附近（约 line 644-700 区块）追加：

```ts
// v2 会话存储（parts 纵向流）。@author refinex
export async function readAiConversationV2(
  rootPath: string,
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  return invoke<Record<string, unknown> | null>('read_ai_conversation_v2', {
    rootPath,
    conversationId,
  });
}

export async function saveAiConversationV2(
  rootPath: string,
  record: Record<string, unknown>,
): Promise<void> {
  await invoke<void>('save_ai_conversation_v2', { rootPath, record });
}

export async function listAiConversationsV2(
  rootPath: string,
): Promise<Array<Record<string, unknown>>> {
  return invoke<Array<Record<string, unknown>>>('list_ai_conversations_v2', { rootPath });
}
```

- [ ] **Step 8: 在 ai-session-store.ts 末尾追加 I/O 函数（接 invoke）**

在 `ai-session-store.ts` 末尾追加（保留 Task 3 全部内容）：

```ts
import {
  readAiConversationV2,
  saveAiConversationV2,
  listAiConversationsV2,
  readAiConversation,
} from './workspace-api';

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
```

> 注：`readAiConversation` 为 workspace-api 既有封装（对应 `read_ai_conversation` 命令）。若该封装名不同，按既有命名调整。

- [ ] **Step 9: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-session-store
```
Expected: PASS（v1 迁移用例 + invoke I/O 用例全绿）。

- [ ] **Step 10: 提交前端 I/O**

```bash
git add components/workspace/workspace-api.ts components/workspace/ai-panel/ai-session-store.ts components/workspace/ai-panel/__tests__/ai-session-store.test.ts
git commit -m "feat(ai): 接入 v2 会话读写 invoke 封装与 v1 回退迁移"
```

---

## Task 5: ai-message-store.ts — atomFamily 消息隔离 store

**Files:**
- Create: `components/workspace/ai-panel/ai-message-store.ts`
- Test: `components/workspace/ai-panel/__tests__/ai-message-store.test.ts`

性能核心：流式 delta 只重渲染目标消息。Jotai atomFamily 按 `<messageId>` 隔离。

- [ ] **Step 1: 写 consumeChunk 的失败测试（store 纯逻辑可脱离 React 测）**

Create `components/workspace/ai-panel/__tests__/ai-message-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createAiMessageStore } from '../ai-message-store';
import type { UiMessageChunk } from '../ai-contracts';

describe('AiMessageStore.consumeChunk', () => {
  it('start 创建空 assistant 消息并加入列表', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    expect(store.getMessageIds()).toContain('m1');
    expect(store.getMessage('m1')?.role).toBe('assistant');
  });

  it('text-delta 累积到目标消息的最后一个 text part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'text-start', id: 't1' });
    store.consumeChunk({ type: 'text-delta', id: 't1', delta: 'Hel' });
    store.consumeChunk({ type: 'text-delta', id: 't1', delta: 'lo' });
    const msg = store.getMessage('m1');
    expect(msg?.parts).toHaveLength(1);
    expect(msg?.parts[0].text).toBe('Hello');
  });

  it('text-start 在无 text part 时新建 part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'text-start', id: 't1' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({ type: 'text', text: '' });
  });

  it('reasoning-delta 累积到 reasoning part', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'reasoning', id: 'r1', text: '思' });
    store.consumeChunk({ type: 'reasoning-delta', id: 'r1', delta: '考' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({ type: 'reasoning', text: '思考' });
  });

  it('tool-input-start 创建 tool-<Name> part，状态 input-streaming', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({
      type: 'tool-input-start',
      toolCallId: 't1',
      toolName: 'Bash',
    });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      type: 'tool-Bash',
      toolCallId: 't1',
      state: 'input-streaming',
    });
  });

  it('tool-input-available 更新 input 并置状态 input-available', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({
      type: 'tool-input-available',
      toolCallId: 't1',
      toolName: 'Bash',
      input: { command: 'ls' },
    });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'input-available',
      input: { command: 'ls' },
    });
  });

  it('tool-output-available 置状态 output-available 并附 output', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({ type: 'tool-output-available', toolCallId: 't1', output: { ok: true } });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'output-available',
      output: { ok: true },
    });
  });

  it('tool-output-error 置状态 output-error 并附 errorText', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'tool-input-start', toolCallId: 't1', toolName: 'Bash' });
    store.consumeChunk({ type: 'tool-output-error', toolCallId: 't1', errorText: '失败' });
    expect(store.getMessage('m1')?.parts[0]).toMatchObject({
      state: 'output-error',
      errorText: '失败',
    });
  });

  it('message-metadata 聚合到当前 assistant 消息 metadata', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({
      type: 'message-metadata',
      messageMetadata: { inputTokens: 10, outputTokens: 20 },
    });
    expect(store.getMessage('m1')?.metadata?.inputTokens).toBe(10);
  });

  it('finish-step 重置当前消息游标，下一个 start 开新消息', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    store.consumeChunk({ type: 'finish-step' });
    store.consumeChunk({ type: 'start', messageId: 'm2' });
    expect(store.getMessageIds()).toEqual(['m1', 'm2']);
  });

  it('未知 chunk 类型不抛错（静默忽略）', () => {
    const store = createAiMessageStore();
    store.consumeChunk({ type: 'start', messageId: 'm1' });
    expect(() =>
      store.consumeChunk({ type: 'session-init', tools: [], mcpServers: [], plugins: [], skills: [] }),
    ).not.toThrow();
  });

  it('loadMessages 批量载入历史消息', () => {
    const store = createAiMessageStore();
    store.loadMessages([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '问' }], createdAt: 1 },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: '答' }], createdAt: 2 },
    ]);
    expect(store.getMessageIds()).toEqual(['u1', 'a1']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
pnpm test:run -- ai-message-store
```
Expected: FAIL（`Cannot find module '../ai-message-store'`）。

- [ ] **Step 3: 实现 ai-message-store.ts（store 逻辑 + React hooks）**

Create `components/workspace/ai-panel/ai-message-store.ts`:

```ts
// @author refinex
// atomFamily 消息隔离 store：流式 delta 只重渲染目标消息。
// store 逻辑（createAiMessageStore）是框架无关的纯对象，可在测试中直接断言；
// React hooks（useMessageStore / useMessage / useMessageIds）基于 Jotai 桥接。

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { useMemo } from 'react';

import {
  createMessageId,
  type AiMessage,
  type ChatStatus,
  type MessageMetadata,
  type MessagePart,
  type UiMessageChunk,
} from './ai-contracts';

interface StoreState {
  messageIds: string[];
  messages: Map<string, AiMessage>;
  currentMessageId: string | null;
  chatStatus: ChatStatus;
  metadata: MessageMetadata;
}

/** 创建一个框架无关的 store 实例（测试用）。 */
export function createAiMessageStore() {
  const state: StoreState = {
    messageIds: [],
    messages: new Map(),
    currentMessageId: null,
    chatStatus: 'ready',
    metadata: {},
  };

  function ensureCurrentMessage(): AiMessage {
    if (state.currentMessageId && state.messages.has(state.currentMessageId)) {
      return state.messages.get(state.currentMessageId)!;
    }
    // 没有 current 时新建 assistant 消息
    const id = createMessageId();
    const msg: AiMessage = { id, role: 'assistant', parts: [], createdAt: Date.now() };
    state.messages.set(id, msg);
    state.messageIds.push(id);
    state.currentMessageId = id;
    return msg;
  }

  function findPartIndex(messageId: string, predicate: (p: MessagePart) => boolean): number {
    const msg = state.messages.get(messageId);
    if (!msg) return -1;
    for (let i = msg.parts.length - 1; i >= 0; i--) {
      if (predicate(msg.parts[i])) return i;
    }
    return -1;
  }

  return {
    getMessageIds(): string[] {
      return [...state.messageIds];
    },
    getMessage(id: string): AiMessage | undefined {
      return state.messages.get(id);
    },
    getChatStatus(): ChatStatus {
      return state.chatStatus;
    },
    getMetadata(): MessageMetadata {
      return state.metadata;
    },
    /** 批量载入历史消息（重置 store）。 */
    loadMessages(messages: AiMessage[]): void {
      state.messages = new Map(messages.map((m) => [m.id, m]));
      state.messageIds = messages.map((m) => m.id);
      state.currentMessageId = null;
    },
    reset(): void {
      state.messageIds = [];
      state.messages = new Map();
      state.currentMessageId = null;
      state.chatStatus = 'ready';
      state.metadata = {};
    },
    /** 消费一个 chunk，精确更新目标消息。 */
    consumeChunk(chunk: UiMessageChunk): void {
      switch (chunk.type) {
        case 'start': {
          const id = chunk.messageId ?? createMessageId();
          if (!state.messages.has(id)) {
            const msg: AiMessage = { id, role: 'assistant', parts: [], createdAt: Date.now() };
            state.messages.set(id, msg);
            state.messageIds.push(id);
          }
          state.currentMessageId = id;
          state.chatStatus = 'streaming';
          return;
        }
        case 'text-start': {
          const msg = ensureCurrentMessage();
          msg.parts.push({ type: 'text', text: '' });
          return;
        }
        case 'text-delta': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.type === 'text');
          if (idx >= 0) {
            msg.parts[idx].text = (msg.parts[idx].text ?? '') + chunk.delta;
          } else {
            msg.parts.push({ type: 'text', text: chunk.delta });
          }
          return;
        }
        case 'text-end':
          return;
        case 'reasoning': {
          const msg = ensureCurrentMessage();
          msg.parts.push({ type: 'reasoning', text: chunk.text });
          return;
        }
        case 'reasoning-delta': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.type === 'reasoning');
          if (idx >= 0) {
            msg.parts[idx].text = (msg.parts[idx].text ?? '') + chunk.delta;
          } else {
            msg.parts.push({ type: 'reasoning', text: chunk.delta });
          }
          return;
        }
        case 'tool-input-start': {
          const msg = ensureCurrentMessage();
          msg.parts.push({
            type: `tool-${chunk.toolName}`,
            toolCallId: chunk.toolCallId,
            state: 'input-streaming',
          });
          return;
        }
        case 'tool-input-delta': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].input = {
              ...(msg.parts[idx].input as Record<string, unknown> | undefined),
              __partial: ((msg.parts[idx].input as { __partial?: string } | undefined)?.__partial ?? '') + chunk.inputTextDelta,
            };
          }
          return;
        }
        case 'tool-input-available': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].input = chunk.input;
            msg.parts[idx].state = 'input-available';
          }
          return;
        }
        case 'tool-output-available': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].output = chunk.output;
            msg.parts[idx].state = 'output-available';
          }
          return;
        }
        case 'tool-output-error': {
          const msg = state.currentMessageId ? state.messages.get(state.currentMessageId) : null;
          if (!msg) return;
          const idx = findPartIndex(msg.id, (p) => p.toolCallId === chunk.toolCallId);
          if (idx >= 0) {
            msg.parts[idx].errorText = chunk.errorText;
            msg.parts[idx].state = 'output-error';
          }
          return;
        }
        case 'message-metadata': {
          state.metadata = { ...state.metadata, ...chunk.messageMetadata };
          if (state.currentMessageId) {
            const msg = state.messages.get(state.currentMessageId);
            if (msg) msg.metadata = { ...msg.metadata, ...chunk.messageMetadata };
          }
          return;
        }
        case 'finish':
          return;
        case 'finish-step': {
          state.currentMessageId = null;
          return;
        }
        case 'error': {
          state.chatStatus = 'error';
          return;
        }
        // session-init / permission-request 暂由后续子项目消费；这里静默忽略不抛错
        case 'session-init':
        case 'permission-request':
          return;
        default:
          return;
      }
    },
  };
}

export type AiMessageStore = ReturnType<typeof createAiMessageStore>;

// —— React 桥接（C 子项目起使用）——

const storeAtom = atom<AiMessageStore | null>(null);

/** 每对话一个 store：通过 Provider 注入。 */
export function useMessageStore(): AiMessageStore | null {
  return useAtomValue(storeAtom);
}

const messageIdsAtom = atom<string[]>((get) => {
  const store = get(storeAtom);
  return store ? store.getMessageIds() : [];
});

export function useMessageIds(): string[] {
  return useAtomValue(messageIdsAtom);
}

export const messageAtomFamily = atomFamily((id: string) =>
  atom<AiMessage | undefined>((get) => get(storeAtom)?.getMessage(id)),
);

export function useMessage(id: string): AiMessage | undefined {
  return useAtomValue(messageAtomFamily(id));
}

export function useSetMessageStore() {
  return useSetAtom(storeAtom);
}

/** Hook：为当前 conversation 创建并注入 store。 */
export function useCreateMessageStore() {
  return useMemo(() => createAiMessageStore(), []);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
pnpm test:run -- ai-message-store
```
Expected: PASS（consumeChunk 全用例绿）。

- [ ] **Step 5: 提交**

```bash
git add components/workspace/ai-panel/ai-message-store.ts components/workspace/ai-panel/__tests__/ai-message-store.test.ts
git commit -m "feat(ai): 引入 atomFamily 消息隔离 store 与 consumeChunk"
```

---

## Task 6: 全量验证与收尾

**Files:** 无新增，仅验证。

- [ ] **Step 1: 跑 A 子项目全部测试**

Run:
```bash
pnpm test:run -- ai-contracts ai-event-normalizer ai-message-store ai-session-store
```
Expected: 4 个测试文件全绿。

- [ ] **Step 2: 跑 ai-panel 既有测试，确认未回归**

Run:
```bash
pnpm test:run -- ai-panel
```
Expected: 既有 ai-reducer / ai-panel-content / ai-context 测试全绿（A 未改 reducer）。

- [ ] **Step 3: 跑 lint**

Run:
```bash
pnpm lint
```
Expected: 无新增 error。

- [ ] **Step 4: 确认 Rust 改动范围受限，既有 reducer/面板未触及**

Run:
```bash
git diff --name-only $(git merge-base HEAD dev) -- src-tauri/ components/workspace/ai-panel/ai-reducer.ts components/workspace/ai-panel/ai-types.ts components/workspace/ai-panel/ai-panel-content.tsx
```
Expected:
- `src-tauri/src/agent_runtime.rs`、`src-tauri/src/lib.rs` 出现（仅 Task 4a 新增的 3 个 v2 命令 + 注册）。
- `components/workspace/workspace-api.ts` 出现（仅 Task 4b 新增的 3 个 invoke 封装）。
- `ai-reducer.ts` / `ai-types.ts` / `ai-panel-content.tsx` **不出现**（既有面板零改动）。

若 ai-reducer.ts 等出现，说明误改，需 revert 对应改动。

- [ ] **Step 5: 阶段提交收尾（若 Step 1-4 有未提交修正）**

```bash
git add -A
git commit -m "test(ai): A 子项目契约层全量验证通过" --allow-empty
```

---

## A 子项目完成定义（DoD）对照

| DoD | 验证任务 |
|---|---|
| ai-contracts.ts 定义全部契约 | Task 1 |
| ai-event-normalizer.ts 全表归一化测试通过 | Task 2 |
| ai-message-store.ts chunk 消费测试通过（只重渲染目标消息） | Task 5 |
| ai-session-store.ts v2 读写 + v1→v2 迁移测试通过 | Task 3 + Task 4 |
| 工作区感知字段 + 自动引用默认值固化 | Task 3（record 字段 documentPath/documentTitle） |
| 不接 UI（既有 reducer/面板不受影响；Rust 仅新增 v2 命令） | Task 6 Step 4 |
| pnpm test:run -- ai-panel 全绿；lint 通过 | Task 6 Step 1-3 |
| 阶段提交 | Task 0-5 各自提交 + Task 6 收尾 |

## 衔接

A 完成后，B 子项目（统一传输层 ChatTransport）把 Tauri event 流封装为统一 transport 接口，调用 A 的 `AiEventNormalizer` 产出 chunk 流，再喂给 A 的 `createAiMessageStore`。C 子项目（消息列表渲染）消费 A 的 `useMessageIds` / `useMessage` 渲染 parts 纵向流。

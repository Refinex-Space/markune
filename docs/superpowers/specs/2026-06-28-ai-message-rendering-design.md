# AI 面板消息列表与渲染设计（C 子项目）

- 日期：2026-06-28
- 作者：refinex
- 子项目：C（整体重建路线图第 1 阶段渲染层起点）
- 依赖：A（`ai-message-store` 的 hooks）、B（`AiChatTransport`）
- 状态：已通过设计自审，待用户审阅

## 1. 背景与定位

A 子项目建立了 parts 纵向流契约与 atomFamily 消息隔离 store；B 子项目建立了统一传输层 `AiChatTransport`（`sendMessages → ReadableStream<UiMessageChunk>`）。C 子项目是**渲染层起点**：创建 `useAiChat` hook 把 transport 的流消费到 store，并渲染 parts 纵向流（user/assistant 消息、text part、markdown）。

### 现状

Madora 现有 AI 面板（`ai-panel-content.tsx` 4400 行单体）用 `whitespace-pre-wrap` 纯文本渲染消息，**无 markdown 渲染器**。C 子项目引入专业的流式 markdown 渲染。

### 1code 参考

1code 消息渲染核心：
- `MessagesList` 遍历 `messageIds`（仅订阅 id，不订阅内容）
- `AssistantMessageItem` 遍历 `message.parts`，按 `part.type` 分发（text→markdown，tool→工具卡，reasoning→思考卡）
- markdown 用 `streamdown`（流式感知的 react-markdown 替代）+ `remark-gfm`/`remark-breaks` + Shiki 代码高亮 + mermaid 懒加载
- **关键优化**：`parseMarkdownIntoBlocks` 区块级 memo，流式只重渲染最后区块
- **AI SDK 原地修改陷阱**：1code 用 AI SDK 的 useChat（parts 原地修改），需外部快照对比

### Madora 简化点

我们**不用 AI SDK 的 useChat**，而是自建 store（A 的 `consumeChunk` 每次 chunk 创建新对象引用）。因此**不存在原地修改问题**，标准 `React.memo` 即可正确触发流式更新。这是架构优势。

## 2. 设计目标

- 创建 `useAiChat` hook：把 `AiChatTransport` 的流 `getReader()` 消费，逐 chunk 调 `store.consumeChunk`，驱动渲染
- 渲染 parts 纵向流：user/assistant 消息分层，text part 用流式 markdown
- 侧边栏自适应布局：窄栏下最大化内容密度
- 流式指示器：助手尚无 parts 时显示 planning 占位
- 自动滚动到底（基于 ref，避免重渲染）
- 为 D-F 子项目预留工具/思考/MCP 卡片的分发位点（C 先用占位）

## 3. markdown 渲染依赖决策

**选定：`streamdown`**（`^2.5.0`）。

理由：
- 专为 AI 流式设计，处理 incomplete markdown 的解析抖动（react-markdown 在流式半截代码块/列表时抖动严重）
- 内置区块级 memo（`parseMarkdownIntoBlocks`），流式只重渲染最后区块——性能关键
- drop-in 替代 react-markdown，支持 remark/rehype 插件生态
- 1code 生产验证

配套依赖：
- `remark-gfm`（表格/任务列表/删除线）
- `remark-breaks`（软换行保留，符合聊天输入习惯）
- `shiki`（代码语法高亮，与 1code 一致）
- `mermaid`（懒加载，C 子项目先不接，F/J 子项目处理）

不引入 `react-markdown`（streamdown 已覆盖）。

## 4. 组件层次

```
<AiConversationView>                      【新增】顶层容器（注入 store + transport）
  └─ <AiMessageList>                      【新增】遍历 useMessageIds()，仅订阅 id 列表
       └─ <AiMessageItem messageId>       【新增】按 role 分发
            ├─ role=user → <AiUserMessageBubble>
            └─ role=assistant → <AiAssistantMessage>  【新增】遍历 parts
                 ├─ part.type=text → <AiTextPart>      【新增】streamdown markdown
                 ├─ part.type=reasoning → 占位（F 子项目实现思考卡）
                 ├─ part.type=tool-* → 占位（D 子项目实现工具卡）
                 ├─ part.type=data-image → 图片附件
                 └─ 无 parts 且 streaming → <AiPlanningPlaceholder>【新增】
```

每个组件订阅**仅自己需要的原子**（`useMessage(id)`），流式 delta 只重渲染目标消息的 `AiAssistantMessage`，其他消息组件不重渲染（atomFamily 隔离）。

## 5. 侧边栏自适应布局

Madora AI 是侧边面板（窄），1code 是全屏（宽）。布局决策：

| 元素 | 全屏（1code） | 侧边栏（Madora） |
|---|---|---|
| user 消息 | 右对齐气泡 + git 徽章 + 回滚 | **左对齐轻量气泡**（无 git 徽章，写作场景不需要） |
| assistant 消息 | 无气泡，markdown | **无气泡，markdown**（与 1code 一致） |
| 消息宽度 | 居中 max-width | **全宽**（窄栏最大化密度） |
| 工具卡密度 | 紧凑行 | **紧凑行**（与 1code 一致） |

核心：侧边栏下放弃居中 max-width，消息全宽；user 消息用浅色背景气泡区分类别，assistant 无气泡直出 markdown。

## 6. useAiChat hook

```ts
export interface UseAiChatOptions {
  rootPath: string;
  profileId: string;
  mode?: 'agent' | 'plan';
  // 特殊 chunk 路由（permission/session-init 由 UI 处理）
  onPermissionRequest?: (chunk) => void;
  onSessionInit?: (chunk) => void;
  onError?: (errorText: string) => void;
}

export function useAiChat(options: UseAiChatOptions) {
  const store = useCreateMessageStore();          // A 的 hook
  const transportRef = useRef<AiChatTransport>();
  const abortRef = useRef<AbortController>();

  // 注入 store 到 Jotai（供 useMessage/useMessageIds 订阅）
  const setStore = useSetMessageStore();
  useEffect(() => setStore(store), [store, setStore]);

  const send = useCallback(async (prompt, context) => {
    abortRef.current = new AbortController();
    const transport = transportRef.current ??= createDefaultAiChatTransport({...});
    const stream = await transport.sendMessages({ prompt, context, abortSignal: abortRef.current.signal });
    const reader = stream.getReader();
    // 后台消费流 → store.consumeChunk
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        store.consumeChunk(value);
      }
    })();
  }, [store]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const respondPermission = useCallback((id, behavior) => transportRef.current?.respondPermission(id, behavior), []);

  return { send, stop, respondPermission };
}
```

流消费在后台 IIFE 中，每个 chunk 调 `store.consumeChunk` 精确更新目标 messageAtom，触发该消息组件重渲染。

## 7. 自动滚动

基于 ref（避免重渲染），复刻 1code 模式：
- `shouldAutoScrollRef`：用户上滚时置 false，回到底部置 true
- `ResizeObserver` 监听内容高度：若 shouldAutoScroll，跟随设置 `scrollTop = scrollHeight`
- 流式期间 `requestAnimationFrame` 平滑跟随

## 8. 文件落点

```
components/workspace/ai-panel/
├─ ai-chat-hook.ts              【新增】useAiChat（transport 流 → store 消费）
├─ rendering/
│  ├─ ai-conversation-view.tsx  【新增】顶层容器（store + scroll）
│  ├─ ai-message-list.tsx       【新增】遍历 messageIds
│  ├─ ai-message-item.tsx       【新增】按 role 分发
│  ├─ ai-user-message-bubble.tsx【新增】user 气泡
│  ├─ ai-assistant-message.tsx  【新增】遍历 parts 分发
│  ├─ ai-text-part.tsx          【新增】streamdown markdown
│  ├─ ai-planning-placeholder.tsx【新增】流式 planning 占位
│  └─ ai-markdown-renderer.tsx  【新增】streamdown 封装（区块 memo）
└─ __tests__/
   └─ rendering/
      ├─ ai-message-item.test.tsx
      └─ ai-text-part.test.tsx
```

## 9. 完成定义（DoD）

1. `useAiChat` hook 把 transport 流消费到 store，驱动渲染
2. `AiMessageList` 遍历 messageIds 渲染消息（atomFamily 隔离验证）
3. user 消息轻量气泡，assistant 消息 markdown
4. `AiTextPart` 用 streamdown 渲染（区块 memo）
5. 流式 planning 占位（助手无 parts 时）
6. 自动滚动到底（ref 驱动）
7. 工具/思考/MCP 卡片留占位（D-F 实现）
8. 全量测试通过，lint 0 error
9. 不替换既有面板（C 是新增组件，旧面板继续工作；切换在 I/J 之后整体进行）
10. 阶段提交

## 10. 风险与回滚

- **风险**：streamdown 在 SSR（Next.js）下可能有问题。缓解：C 的组件仅用于客户端（AI 面板是 client component），用 `'use client'` 标注；测试在 jsdom 环境。
- **风险**：流式 markdown 半截语法抖动。缓解：streamdown 内置 `parseIncompleteMarkdown` 处理。
- **回滚**：C 是新增组件目录，不改 Rust/reducer/既有面板。回滚删除 `rendering/` 目录 + hook 文件。

## 11. 后续衔接

- D 子项目：在 `AiAssistantMessage` 的 `tool-*` 分发位点接入工具注册表与卡片
- E 子项目：在 Edit/Write 工具卡内接入 diff 视图
- F 子项目：在 reasoning 分发位点接入思考折叠卡，WebSearch/MCP 接入对应卡
- I 子项目：对话切换时 `store.loadMessages(record.messages)` 载入历史

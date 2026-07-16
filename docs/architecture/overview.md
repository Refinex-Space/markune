---
owner: refinex
updated: 2026-07-16
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Madora 是一个以本地 Markdown 文档为核心的桌面知识库，使用 Next.js App Router、React、TypeScript、Tauri v2 和 `@refinex/markora` 构建。

## Runtime Shape

- Web shell：Next.js App Router 与 React client components。
- Editor：`components/editor/markdown-editor.tsx` 以受控 Markdown 字符串包装 `@markweave/react` / `markweave`。
- Workspace shell：`components/workspace/workspace-layout.tsx` 管理文档树、编辑器标签、全文搜索、Git、终端、设置、文档元信息与 AI 侧栏。
- Native boundary：前端经 `components/workspace/workspace-api.ts` 调用 Tauri 命令；实现位于 `src-tauri/src`。
- Codex runtime：`components/workspace/codex-app-server.ts` 只消费协议消息；`src-tauri/src/codex.rs` 启动随应用打包的 Codex App Server sidecar，并通过 stdio JSONL 传递允许的方法、通知与审批请求。
- Local state：全局设置由 `src-tauri/src/settings.rs` 持久化；面板尺寸使用浏览器 local storage；AI 会话由 Codex App Server 存入用户级 Codex Home，不属于工作区状态。

## Main Modules

- `app/`：Next.js 页面与 API 路由。
- `components/editor/`：Markdown 编辑器、frontmatter、目录与工作区资源上传。
- `components/workspace/`：工作区壳层、文档树、标签、搜索、Git、终端、设置和 Tauri API bridge。
- `components/ui/`：共享 UI 原语。
- `src-tauri/src/`：资源、Git、设置、系统字体、终端与工作区文件系统命令。

## Codex AI Boundary

AI 面板是工作区级客户端，不在浏览器渲染器中运行 Node.js SDK，也不持有 OpenAI API key。Tauri 启动固定版本的 `codex app-server --listen stdio://`，账户登录、线程历史、模型目录、MCP、联网搜索、工具调用和文件变更由 App Server 提供。前端仅能调用 `src-tauri/src/codex.rs` 中的 allowlist 方法，并把消息、计划、命令、文件修改与 MCP 事件按协议到达顺序写入统一会话流；助手消息使用禁用原始 HTML 的 GFM 渲染。

会话渲染保留 App Server 的 `Turn -> Item` 层级。`agentMessage.phase=commentary`、工具活动、计划和上下文压缩组成可折叠的处理过程，`phase=final_answer` 保持为独立最终回答；未提供 phase 的旧消息按普通助手消息兼容。连续工具只在视图投影层分组，底层有序 item 不重排。命令输出增量、文件 patch、MCP progress、耗时、退出码和审批请求都更新原 item；历史恢复使用同一映射逻辑。内部 reasoning 不进入界面，命令输出只保留有界首尾预览，避免大输出占用无界内存。

历史恢复以 App Server 实际返回的 thread items 为上限。固定 sidecar `0.144.4` 的 `thread/read` 与 `thread/turns/list` 当前不会回放已完成 turn 的命令和其他工具 item，`thread/items/list` 也尚未实现；因此 Madora 可以恢复 commentary、最终回答和 App Server 返回的持久 item，但不能通过读取 Codex JSONL 或维护第二份日志补齐缺失的历史工具明细。升级 sidecar 后必须重新验证该投影能力。

线程以当前工作区根目录作为 `cwd`，默认使用 `workspace-write` sandbox 和 `on-request` 审批。渲染器不能调用 App Server 的通用 `fs/*`、`command/exec` 或 `thread/shellCommand` 接口；用户允许的命令和文件修改由 Codex turn 内部工具执行并逐项回到审批 UI。

文档提及采用路径上下文，不复制文档正文。前端把显式 `@` 文档在模型文本中编码为带引号的工作区相对路径，并用 `text_elements.placeholder` 保留标题链接；当前文档与显式提及文档的绝对路径只通过 Madora 私有字段提交给 Tauri。Rust canonicalize 并验证这些路径后，将相对路径列表写入实验性的 `turn/start.additionalContext`：固定读取策略使用 `application` 信任级别，路径 JSON 使用 `untrusted` 信任级别。Codex 仅在请求依赖文档内容时通过正常工作区工具读取，因此读取动作仍进入原生工具时间线。

Codex App Server 是 AI 会话持久化的唯一所有者。Madora 默认把 sidecar 绑定到共享的 `~/.codex`，允许的 `CODEX_HOME` 覆盖必须是工作区之外的既有绝对目录；该进程的 `sqlite_home` 固定为同一目录。Codex 管理 `sessions/**/*.jsonl` 会话记录、`session_index.jsonl` 追加索引和 SQLite 查询投影，Madora 只能通过 `thread/start`、`thread/resume`、`thread/list`、`thread/read`、`thread/name/set`、`thread/archive` 与 `thread/delete` 访问线程，禁止直接读写这些内部文件或数据库。

工作区 `.madora` 只保存工作区元数据和资产，不保存 AI 消息。历史 `.madora/ai-sessions` JSON 方案已经废弃，不得重新引入，也不得为 Codex 会话维护第二份本地镜像。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。

Markweave 只接收 frontmatter 解析后的正文；保存时必须重新序列化受保护的 frontmatter。新上传资源的物理文件写入工作区根目录下的 `.madora/assets/files/{shard}/{hash}.{ext}`，Markdown 持久化引用统一使用 `madora-asset://{assetId}`。编辑器展示前通过工作区资产索引解析为受控本地 URL；旧 `.madora/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。

## Desktop Build Boundary

`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。

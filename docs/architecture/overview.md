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
- Local state：全局设置由 `src-tauri/src/settings.rs` 持久化；面板尺寸使用浏览器 local storage。

## Main Modules

- `app/`：Next.js 页面与 API 路由。
- `components/editor/`：Markdown 编辑器、frontmatter、目录与工作区资源上传。
- `components/workspace/`：工作区壳层、文档树、标签、搜索、Git、终端、设置和 Tauri API bridge。
- `components/ui/`：共享 UI 原语。
- `src-tauri/src/`：资源、Git、设置、系统字体、终端与工作区文件系统命令。

## Codex AI Boundary

AI 面板是工作区级客户端，不在浏览器渲染器中运行 Node.js SDK，也不持有 OpenAI API key。Tauri 启动固定版本的 `codex app-server --listen stdio://`，账户登录、线程历史、模型目录、MCP、联网搜索、工具调用和文件变更由 App Server 提供。前端仅能调用 `src-tauri/src/codex.rs` 中的 allowlist 方法，并把消息、计划、命令、文件修改与 MCP 事件按协议到达顺序写入统一会话流；助手消息使用禁用原始 HTML 的 GFM 渲染，审批状态独立保留。

线程以当前工作区根目录作为 `cwd`，默认使用 `workspace-write` sandbox 和 `on-request` 审批。渲染器不能调用 App Server 的通用 `fs/*`、`command/exec` 或 `thread/shellCommand` 接口；用户允许的命令和文件修改由 Codex turn 内部工具执行并逐项回到审批 UI。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。

Markweave 只接收 frontmatter 解析后的正文；保存时必须重新序列化受保护的 frontmatter。新上传资源的物理文件写入工作区根目录下的 `.madora/assets/files/{shard}/{hash}.{ext}`，Markdown 持久化引用统一使用 `madora-asset://{assetId}`。编辑器展示前通过工作区资产索引解析为受控本地 URL；旧 `.madora/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。

## Desktop Build Boundary

`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。

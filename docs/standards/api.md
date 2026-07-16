---
owner: refinex
updated: 2026-07-16
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Next.js API Routes

- `app/api/link-preview/route.ts` 为 Web/dev 环境解析链接元数据，必须保留 SSRF 防护、重定向验证、超时和响应大小上限。
- `app/api/uploadthing/route.ts` 暴露由 `lib/uploadthing.ts` 配置的 UploadThing handler。
- 不记录用户本地路径、上传 URL 或文档内容，除非任务明确需要经过脱敏的诊断信息。

## Tauri Command Bridge

- 前端调用必须经 `components/workspace/workspace-api.ts`。
- 命令注册位于 `src-tauri/src/lib.rs`。
- Git 命令必须在阻塞任务中执行，不得占用 Tauri 原生主线程；本地命令超时为 60 秒，网络及提交等长操作超时为 180 秒，超时后必须终止对应进程树。Windows 启动 Git 子进程时必须使用无窗口标志，前端命令名称、参数和返回结构保持不变。
- `system_fonts.rs` 仅可返回字体家族名称与推荐元数据，不得暴露字体文件路径或内容。
- 桌面端网络功能应走 Tauri 命令；生产桌面构建使用静态导出，不包含 Next API routes。

## Codex App Server Bridge

- Codex 协议封装位于 `components/workspace/codex-app-server.ts` 与 `src-tauri/src/codex.rs`；不得从 React 组件直接启动进程或写入 stdio。
- 客户端请求必须由 Rust allowlist 限制。当前允许账户、模型、线程、turn、MCP inventory/OAuth、skills 与审批相关方法；禁止向渲染器暴露通用 App Server `fs/*`、`command/exec` 和 `thread/shellCommand`。
- App Server 的响应、通知与 server request 使用统一 `codex:event` 事件。前端必须按 JSON-RPC `id` 关联请求，并在运行时退出时拒绝所有 pending 请求。
- 消息与工具通知必须按首次到达顺序保存在同一会话流中；同一 item 的完成通知只更新原位置，不得把工具记录统一追加到回答末尾。`thread/name/updated` 必须同步当前标题与历史列表。
- Markdown 文档不得作为 Codex 原生 `mention` 输入发送；该类型只用于 `app://` 与 `plugin://` 目标。显式文档提及必须把带引号的工作区相对路径写入文本，并用 `text_elements.placeholder` 保存显示标题；`byteRange` 使用替换后文本的 UTF-8 字节偏移。
- 当前文档与显式提及文档只可通过顶层 `madoraDocumentReferences` 传给 Tauri。Rust 必须移除该私有字段、校验绝对路径与工作区边界，再生成 `madora_document_context_policy`（`application`）和 `madora_document_references`（`untrusted`）两项 `additionalContext`；渲染器直接提交原始 `additionalContext` 必须被拒绝。
- 会话历史恢复只能依据 `text_elements` 的精确区间解析受控的带引号相对路径，并用当前工作区根目录恢复可点击绝对路径；绝对路径、空路径和包含父目录段的标记必须被拒绝。旧版 `mention + text_elements` 仅保留读取兼容，不得继续生成。
- `turn/start.additionalContext` 是随固定 Codex sidecar 使用的实验协议。升级 Codex 时必须重新生成带 `--experimental` 的 App Server Schema，并运行前端与 Rust 契约测试。
- 命令与文件修改审批只能响应 App Server 已登记的 server request id，不能由前端构造任意响应。

## Local Files And Assets

工作区文档 API 必须保留 Markdown 源文件。`upload_workspace_asset` 返回的 `madora-asset://{assetId}` 是新资源唯一的 Markdown 持久化引用；`.madora/assets/files/...` 只描述索引中的物理文件位置。预览、引用扫描和清理必须兼容旧相对路径引用，成功解析后可在下一次文档保存时规范化为协议引用，解析失败时不得改写原文。

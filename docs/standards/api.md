---
owner: refinex
updated: 2026-07-17
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
- Windows 上的 Codex 版本探测与 App Server sidecar 必须复用无窗口命令构造入口，设置 `CREATE_NO_WINDOW`；不得让控制台子系统的 `codex.exe` 拉起独立终端窗口。
- 客户端请求必须由 Rust allowlist 限制。当前允许账户、模型、线程、turn、MCP inventory/OAuth、skills，以及只读的 `permissionProfile/list`、`configRequirements/read`、`experimentalFeature/list` 和受控的 `thread/settings/update`；禁止向渲染器暴露通用 App Server `fs/*`、`command/exec`、`thread/shellCommand`、`config/read` 或配置写入方法。
- App Server 的响应、通知与 server request 使用统一 `codex:event` 事件。前端必须按 JSON-RPC `id` 关联请求，并在运行时退出时拒绝所有 pending 请求。
- 消息与工具通知必须按首次到达顺序保存在同一会话流中；同一 item 的完成通知只更新原位置，不得把工具记录统一追加到回答末尾。`thread/name/updated` 必须同步当前标题与历史列表。
- 历史投影只能消费 App Server 返回的 thread items。固定 sidecar `0.144.4` 不得通过直接读取 Codex JSONL、SQLite 或维护第二份 Madora 会话日志来弥补 `thread/read` / `thread/turns/list` 缺失的工具 item；sidecar 升级后应以 `thread/items/list` 或等价官方接口补齐并重新运行契约测试。
- 前端必须保留 turn 的 `startedAt`、`completedAt`、`durationMs` 和 agent message phase。`commentary` 只进入处理过程，`final_answer` 独立展示；phase 缺失时不得推断或改写旧消息语义。
- `item/commandExecution/outputDelta`、`item/commandExecution/terminalInteraction`、`item/fileChange/patchUpdated`、`item/mcpToolCall/progress`、`turn/plan/updated` 与 `turn/diff/updated` 必须更新对应 turn/item，不得创建伪造工具记录。命令输出必须使用有界首尾缓冲并在界面标明省略行数。
- `item/fileChange/patchUpdated` 不得触发编辑器重载。只有状态成功的 `item/completed(fileChange)` 可以提交结构化路径刷新事件；失败或拒绝的修改不能刷新文档。`turn/completed` 必须执行最终目录树刷新并复核已打开 Markdown 标签。前端必须保留此前收到的 `turn/diff/updated`，不能在完成通知中把聚合 diff 重置为空。
- AI turn 发起前必须等待当前 Markdown 草稿保存成功；保存失败时保留输入内容并中止 `turn/start`。外部重读遇到本地 dirty/saving 草稿时不得静默覆盖，必须暂停自动保存并进入显式冲突解决流程。
- 完成 turn 的文件变更摘要只能从 App Server 的聚合 diff 与成功 fileChange item 确定性投影；相同路径必须去重，聚合 diff 优先作为净增删统计。不得为摘要额外调用模型、直接读取 Codex 会话 JSONL，或在没有 turn 级快照时伪造撤销能力。
- 工具摘要优先使用 App Server 的 `commandActions`，原始 shell 包装只可出现在展开详情。文件路径只有在规范化后仍位于当前工作区时才可作为可点击文档入口；其他路径仅显示为文本。
- 审批请求必须保存 `turnId`、`itemId` 和服务端原始候选，并尽量附着到对应工具 item。Rust 将字符串决定、execpolicy amendment、network policy amendment 与 permissions grant 投影为可展示的 opaque choice id；界面只能回传该 id，Rust 必须在对应 pending request 内重新映射，不能接受前端提交的任意结构化决定。
- 命令审批必须区分 `decline`（拒绝并继续 turn）与 `cancel`（拒绝并中断 turn），并按服务端候选显示一次允许、会话允许和规则授权。`item/permissions/requestApproval` 的允许响应只能复制服务端原始 permissions，可选择 turn、session 或 strict auto-review；拒绝固定返回空 permissions 和 turn scope。
- `thread/start` 使用命名 `permissions`、`approvalPolicy`、`approvalsReviewer` 与 `runtimeWorkspaceRoots` 建立权限状态，且不得同时发送 legacy `sandbox`。`thread/resume` 不覆盖权限，`turn/start` 不发送安全字段；切换模式只用 `thread/settings/update`，且不得同时发送 `sandboxPolicy`。界面以 `thread/settings/updated` 和 start/resume response 为真实状态来源。
- Markdown 文档不得作为 Codex 原生 `mention` 输入发送；该类型只用于 `app://` 与 `plugin://` 目标。显式文档提及必须把带引号的工作区相对路径写入文本，并用 `text_elements.placeholder` 保存显示标题；`byteRange` 使用替换后文本的 UTF-8 字节偏移。
- 当前文档与显式提及文档只可通过顶层 `madoraDocumentReferences` 传给 Tauri，每项分别标记 `role: "active" | "mention"`；缺少角色只按旧版 `mention` 兼容，每个 turn 最多一个 `active`。Rust 必须移除该私有字段、校验绝对路径与工作区边界，再生成 `madora_document_context_policy`（`application`）、`madora_active_document` 和 `madora_explicit_document_references`（后两者均为 `untrusted`）。即使当前无文档也必须写入 `null` 与空数组，以清除 App Server 上一 turn 的粘性上下文；渲染器直接提交原始 `additionalContext` 必须被拒绝。
- “当前文档”“本文”“这篇文档”“current document”与“active file”只能解析为当前 turn 的 `madora_active_document`；不得根据日期、最近文件、线程历史或工作区惯例猜测。只有请求依赖正文时才读取活跃文档，普通问候不得强制产生无意义工具调用。
- 会话历史恢复只能依据 `text_elements` 的精确区间解析受控的带引号相对路径，并用当前工作区根目录恢复可点击绝对路径；绝对路径、空路径和包含父目录段的标记必须被拒绝。旧版 `mention + text_elements` 仅保留读取兼容，不得继续生成。
- `turn/start.additionalContext` 是随固定 Codex sidecar 使用的实验协议。升级 Codex 时必须重新生成带 `--experimental` 的 App Server Schema，并运行前端与 Rust 契约测试。
- 命令、文件修改与权限升级审批只能响应 App Server 已登记的 server request id。未知 server request 必须由 Rust 返回 `-32601`，格式无效的已知请求返回 `-32602`，不能转发成可操作 UI 或留在 pending 状态。

## Local Files And Assets

工作区文档 API 必须保留 Markdown 源文件。`upload_workspace_asset` 返回的 `madora-asset://{assetId}` 是新资源唯一的 Markdown 持久化引用；`.madora/assets/files/...` 只描述索引中的平台无关物理文件相对位置。`upload_workspace_asset` 与 `resolve_workspace_asset` 只能在索引、canonicalize 和资源目录边界校验成功后，将最终解析出的单个文件加入当前进程的资源协议范围，以支持用户目录外、Windows 非系统盘和 macOS 外置卷上的工作区。预览、引用扫描和清理必须兼容旧相对路径引用，成功解析后可在下一次文档保存时规范化为协议引用，解析失败时不得改写原文。

## Document Export Commands

单文档导出固定使用以下桥接类型：

```ts
type WorkspaceExportFormat = 'html' | 'markdown' | 'pdf' | 'word';

interface ExportDirectoryGrant {
  grantId: string;
  displayPath: string;
}

interface DocumentExportResult {
  primaryPath: string;
  createdPaths: string[];
  warnings: string[];
}
```

- `select_document_export_directory() -> ExportDirectoryGrant | null`：由 Rust 打开原生文件夹选择器，默认 Downloads；取消返回 `null`。
- `write_document_export_bundle(grantId, format, fileStem, files) -> DocumentExportResult`：只接受 `html`、`markdown`、`word` 和相对文件包。
- `print_document_pdf(grantId, fileStem, html) -> DocumentExportResult`：通过隐藏平台 WebView 生成矢量 PDF。

目录授权只能使用一次且 15 分钟过期。命令返回最终实际路径；同名时由 Rust 生成 `标题 (n)`，调用方不得假设请求 stem 就是最终 stem。旧 `write_export_file` 仍只服务既有资源下载，不得接入文档导出流程。

## Document Import Commands

统一导入格式为 `type WorkspaceImportFormat = 'markdown' | 'word' | 'pdf' | 'html'`。前端转换结果必须使用 `PreparedImportDocument`，其中 Markdown 只能引用当前清单声明的 `madora-import://asset/{token}` 占位符；提交完成后不得残留占位符。

- `select_document_import_sources(format) -> DocumentImportGrant | null`：原生多选，最多 20 个文件，只返回 `grantId/sourceId/fileName/size/format`。
- `read_document_import_source(grantId, sourceId) -> RawBytes`：重新验证来源状态后通过 Raw IPC 返回内容。
- `begin_document_import_commit(rootPath, targetDir, manifest) -> ImportCommitSession`：校验目标目录、标题、Markdown、资产清单与占位符，并创建独立 staging。
- `stage_document_import_asset(sessionId, assetToken, RawBytes)`：只接受 Raw IPC 和受控 header，不接受 Base64 JSON。
- `stage_document_import_source_asset(sessionId, assetToken, grantId, sourceId, reference)`：仅解析已授权源目录内相对图片或经来源索引验证的 Madora 资产。
- `commit_document_import(sessionId) -> ImportedDocumentResult`：校验完整资产、散列去重、替换协议引用并唯一命名写入 Markdown。
- `cancel_document_import(sessionId)` 与 `release_document_import_grant(grantId)`：幂等清理当前 staging 或释放源授权。

源授权有效期 15 分钟，提交会话有效期 30 分钟；过期 staging 在后续导入启动时清理。旧 `read_markdown_source_files`、`read_import_source_files` 和 `create_imported_plate_documents` 不得重新注册。

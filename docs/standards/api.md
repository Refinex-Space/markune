---
owner: refinex
updated: 2026-09-01
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
- `set_app_window_opacity(opacity)` 只接受 `70`–`100` 的整数百分比，并调整当前原生应用窗口的整体合成透明度。macOS 使用 AppKit，Windows 使用分层窗口 alpha；前端拖动时可以高频预览，但设置文件仅在交互提交后写入。非桌面环境不得用 CSS 内容透明度伪造窗口效果。
- `get_macos_titlebar_metrics() -> { trafficLightCenterY } | null` 只读 AppKit 原生关闭按钮在当前 WKWebView 坐标系中的垂直中心，供左上角 Web 控件对齐；返回值只包含经过有限值与标题栏范围校验的逻辑像素，不暴露原生句柄、窗口内容或设备信息，非 macOS 返回 `null`。
- `select_workspace_directory() -> string | null` 通过原生文件夹选择器打开工作区根目录；取消返回 `null`，成功返回 canonicalize 后的本地目录绝对路径。打开/新建工作区不得再依赖前端 `@tauri-apps/plugin-dialog` 的 `open()`。
- `load_workspace_tree(rootPath)` / `ensure_workspace(rootPath)` / `create_workspace_root(parentPath, workspaceName)` 继续作为工作区树读取、元数据初始化与新建入口。
- `inspect_workspace_brand(rootPath) -> { state }` 是加载既有工作区前的只读品牌检查，`state` 只能为 `new | current | legacy | conflict`。前端在 `legacy` 或 `conflict` 状态不得继续调用工作区树读取和初始化命令。
- `migrate_legacy_workspace_brand(rootPath) -> WorkspaceBrandMigrationReport` 只能由用户在品牌迁移弹窗明确确认后调用。命令返回备份相对路径、改写文件数、设置/provider/凭据迁移状态和警告；目录并存、符号链接、路径逃逸、超限文件或事务失败必须返回错误，不能静默部分成功。
- Git 命令必须在阻塞任务中执行，不得占用 Tauri 原生主线程；本地命令超时为 60 秒，网络及提交等长操作超时为 180 秒，超时后必须终止对应进程树。Windows 启动 Git 子进程时必须使用无窗口标志，前端命令名称、参数和返回结构保持不变。
- `system_fonts.rs` 仅可返回字体家族名称与推荐元数据，不得暴露字体文件路径或内容。
- 桌面端网络功能应走 Tauri 命令；生产桌面构建使用静态导出，不包含 Next API routes。

### Daily Commands

- `open_daily_note(rootPath, date)` 只允许严格的 `YYYY-MM-DD`，并在用户显式打开已有 Daily 或确认创建空白日期时调用；日程总览的月份切换和日期选择不得隐式调用该命令。
- `list_daily_notes_for_month(rootPath, month)` 只允许严格的 `YYYY-MM`，在 canonical 工作区下扫描固定的 `Daily/YYYY/MM` 目录，一次返回当月条目。标题、摘要、任务计数和最多三条任务预览从本次读取的 UTF-8 Markdown 派生，不逐日追加 IPC，也不得把这些正文投影写入工作区元数据。
- 前端只能通过 `workspace-api.ts` 调用上述命令；月度请求必须忽略晚于新月份返回的过期响应，并把读取错误暴露为可重试状态，不能静默替换为空月份。

## Application Update Commands

- `app_update_check() -> AppUpdateCheckResult`：使用 Rust release 配置中的固定 endpoint 和公钥检查更新，返回当前版本及有界的版本、日期、纯文本说明；不得接受渲染器 URL、请求头、代理、target 或降级参数。
- `app_update_install(onEvent: Channel<AppUpdateDownloadEvent>)`：只消费 Rust 内存中最近一次检查得到的 pending update，串行下载、验签并安装；事件只包含开始时的可选总字节数、分块字节数和下载完成标记。
- `app_update_restart()`：只在前端已进入安装完成状态后调用 Tauri restart，不接受参数。

检查和安装不能并发。安装失败会消费 pending update，用户必须重新检查，防止复用状态不明的下载任务。前端 bridge 只能位于 `workspace-api.ts`，不得直接使用 `@tauri-apps/plugin-updater` 绕过 Rust 边界。

## Codex App Server Bridge

- Codex 协议封装位于 `components/workspace/codex-app-server.ts` 与 `src-tauri/src/codex.rs`；不得从 React 组件直接启动进程或写入 stdio。
- Windows 上的 Codex 版本探测与 App Server sidecar 必须复用无窗口命令构造入口，设置 `CREATE_NO_WINDOW`；不得让控制台子系统的 `codex.exe` 拉起独立终端窗口。
- 客户端请求必须由 Rust allowlist 限制。当前允许账户、模型、线程、turn、MCP inventory/OAuth、skills、按工作区受控的 `plugin/installed`，以及只读的 `collaborationMode/list`、`permissionProfile/list`、`configRequirements/read`、`experimentalFeature/list`、受控的 `thread/settings/update` 和 `thread/compact/start`；禁止向渲染器暴露通用 App Server `fs/*`、`command/exec`、`thread/shellCommand`、`config/read` 或配置写入方法。`thread/compact/start` 参数必须是仅含非空、无控制字符 `threadId` 的对象，不得接受额外配置或客户端压缩提示词。
- App Server 的响应、通知与 server request 使用统一 `codex:event` 事件。前端必须按 JSON-RPC `id` 关联请求，并在运行时退出时拒绝所有 pending 请求。
- `thread/tokenUsage/updated` 必须保留 `total`、`last` 与 `modelContextWindow` 的协议区别；当前上下文占比只使用 `last.totalTokens`。手动或自动压缩状态以 `contextCompaction` item 为权威，`thread/compacted` 只作旧协议完成兼容；不得通过累计 token 自行推断或触发压缩。
- 消息与工具通知必须按首次到达顺序保存在同一会话流中；同一 item 的完成通知只更新原位置，不得把工具记录统一追加到回答末尾。`thread/name/updated` 必须同步当前标题与历史列表。
- 历史投影只能消费 App Server 返回的 thread items。固定 sidecar `0.144.4` 不得通过直接读取 Codex JSONL、SQLite 或维护第二份 Markune 会话日志来弥补 `thread/read` / `thread/turns/list` 缺失的工具 item；sidecar 升级后应以 `thread/items/list` 或等价官方接口补齐并重新运行契约测试。
- 前端必须保留 turn 的 `startedAt`、`completedAt`、`durationMs` 和 agent message phase。`commentary` 只进入处理过程，`final_answer` 独立展示；phase 缺失时不得推断或改写旧消息语义。
- `item/commandExecution/outputDelta`、`item/commandExecution/terminalInteraction`、`item/fileChange/patchUpdated`、`item/mcpToolCall/progress`、`turn/plan/updated` 与 `turn/diff/updated` 必须更新对应 turn/item，不得创建伪造工具记录。`item/plan/delta` 必须按 item ID 累积，随后由 `item/completed(plan)` 的完整正文覆盖；正式 plan item 不得与 `turn/plan/updated` 的执行检查清单合并。命令输出必须使用有界首尾缓冲并在界面标明省略行数。
- `item/fileChange/patchUpdated` 不得触发编辑器重载。只有状态成功的 `item/completed(fileChange)` 可以提交结构化路径刷新事件；失败或拒绝的修改不能刷新文档。`turn/completed` 必须执行最终目录树刷新并复核已打开 Markdown 标签。前端必须保留此前收到的 `turn/diff/updated`，不能在完成通知中把聚合 diff 重置为空。
- AI turn 发起前必须等待当前 Markdown 草稿保存成功；保存失败时保留输入内容并中止 `turn/start`。外部重读遇到本地 dirty/saving 草稿时不得静默覆盖，必须暂停自动保存并进入显式冲突解决流程。
- 完成 turn 的文件变更摘要只能从 App Server 的聚合 diff 与成功 fileChange item 确定性投影；相同路径必须去重，聚合 diff 优先作为净增删统计。不得为摘要额外调用模型、直接读取 Codex 会话 JSONL，或在没有 turn 级快照时伪造撤销能力。
- 工具摘要优先使用 App Server 的 `commandActions`，原始 shell 包装只可出现在展开详情。文件路径只有在规范化后仍位于当前工作区时才可作为可点击文档入口；其他路径仅显示为文本。
- 审批请求必须保存 `turnId`、`itemId` 和服务端原始候选，并尽量附着到对应工具 item。Rust 将字符串决定、execpolicy amendment、network policy amendment 与 permissions grant 投影为可展示的 opaque choice id；界面只能回传该 id，Rust 必须在对应 pending request 内重新映射，不能接受前端提交的任意结构化决定。
- 命令审批必须区分 `decline`（拒绝并继续 turn）与 `cancel`（拒绝并中断 turn），并按服务端候选显示一次允许、会话允许和规则授权。`item/permissions/requestApproval` 的允许响应只能复制服务端原始 permissions，可选择 turn、session 或 strict auto-review；拒绝固定返回空 permissions 和 turn scope。
- `thread/start` 使用命名 `permissions`、`approvalPolicy`、`approvalsReviewer` 与 `runtimeWorkspaceRoots` 建立权限状态，且不得同时发送 legacy `sandbox`。`thread/resume` 不覆盖权限，`turn/start` 不发送安全字段；切换模式只用 `thread/settings/update`，且不得同时发送 `sandboxPolicy`。界面以 `thread/settings/updated` 和 start/resume response 为真实状态来源。
- `thread/read` 默认 `includeTurns: true`。若 App Server 返回 `paginated_threads is not supported yet`，必须立即重试 `includeTurns: false`，并将 `thread/resume` 降级为 `excludeTurns: true`。自动恢复优先选择非 paginated 线程；用户手动打开仍失败时只显示中文说明，不得升级为全局 runtime crash。
- Markweave AI 预编辑只使用 Markune 内部组件协议，不新增公开 HTTP API。编辑器内置 `askAi` 与 AI 面板取得的 `MarkweaveAiEditController` 复用同一窗口级 runner；controller 只可从当前活动、可编辑的 Live 正式文档取得，切换到 Source/View/只读、隐藏缓存编辑器或卸载时必须撤销或返回 `null`。
- 每次预编辑固定新建 `ephemeral: true` 的 `thread/start`，同时提交 `permissions: ":read-only"`、`approvalPolicy: "on-request"`、`approvalsReviewer: "user"`、`config.web_search: "disabled"`、空 `environments` 与唯一工作区根。`turn/start` 只包含固定开发者约束、用户指令和 Markweave 目标，不得携带 `markuneDocumentReferences`、`markuneDrawingReferences`、附件、原生 mention、Plugin、Skill、Goal、当前会话或 collaboration mode。
- 内联 runner 必须用 thread/turn ID 声明事件所有权，只转发 `agentMessage.phase=final_answer`，忽略 commentary。AI 面板不得归约 ephemeral 线程或其他非当前可见线程的 token、Goal、消息、工具、文件变更和工作区刷新事件。任何工具/文件 item、审批或用户追问都必须中断内联 turn 并判定失败；终态后调用 `thread/delete`，删除失败只显示脱敏诊断。
- AI 面板宿主预编辑先调用 `captureSelection({ controls: "default" })`，流式响应必须把累计完整 Markdown 交给 `updateProposal(..., status: "streaming")`，结束后再提交 `complete`。宿主 V1 对表格、代码块、媒体、NodeSelection、CellSelection 和空选区失败关闭；表格只能使用编辑器内置 `askAi` 的精确 scope/resultShape 协议。
- 协作模式必须先通过实验接口 `collaborationMode/list` 发现 Plan 与 Default 预设；缺少任一预设时降级到 Default。模式可用后，每个 `turn/start` 必须显式发送 `{ collaborationMode: { mode, settings: { model, reasoning_effort, developer_instructions: null } } }`，且不得同时发送顶层 `model`、`effort` 或开发者指令。Plan 的 `reasoning_effort` 固定为 `medium`；模式名、模型和推理强度均由 Rust 再校验。
- Markdown 文档不得作为 Codex 原生 `mention` 输入发送；该类型只用于 `app://` 与 `plugin://` 目标。显式文档提及必须把带引号的工作区相对路径写入文本，并用 `text_elements.placeholder` 保存显示标题；`byteRange` 使用替换后文本的 UTF-8 字节偏移。插件输入框节点可以只显示名称和真实图标，但模型文本必须恢复 `@Plugin` 与对应 `text_elements`，并额外发送名称和 `plugin://{id}` 原生 mention。
- Drawing 不得伪装为 Codex 原生 mention。显式图稿提及必须把规范 `markune-drawing://<uuid>` 写入文本、用 `text_elements.placeholder` 保留标题，并通过私有 `markuneDrawingReferences` 提交 active/mention 角色。`inspect_drawing({ drawingId })` 只能消费当前 turn 授权的 UUID，响应正文限制为 16 KiB，预览只允许 Markune 读取的 2 MiB 内 PNG/WebP Data URL。
- 核心运行时就绪后必须自动调用一次 `plugin/installed`，请求参数固定为当前工作区根目录的单元素 `cwds` 与空 `installSuggestionPluginNames`；同一运行时代际成功后不得重复请求，失败时允许用户从加号菜单重试。不得借加载安装建议或查询其他目录；结果只展示 installed、enabled 且 `availability` 非 `DISABLED_BY_ADMIN` 的插件。该接口在固定 sidecar `0.144.4` 中仍标记为开发中，升级时必须重新生成 schema 并验证降级行为。
- `read_codex_plugin_icon(path) -> { mediaType, base64Data }` 只服务最近一次成功关联的 `plugin/installed` 响应。Rust 必须先按客户端请求 ID 关联响应，只登记其中 `composerIcon`、`logo`、`logoDark` 声明且可 canonicalize 的普通文件；命令仅接受与登记结果完全相同的 canonical path，限制 1 MiB，并按内容签名识别 PNG、JPEG、GIF、WebP 或 SVG。重新请求插件清单时先清空旧授权，运行时重启、停止或工作区切换后不得沿用。
- 插件图标解析顺序固定为 `composerIcon` / `composerIconUrl`、当前主题 `logoDark` / `logo`、当前主题 `logoUrlDark` / `logoUrl`。本地资源读取失败后可以继续尝试下一候选；远程候选只接受 HTTPS，渲染时必须使用 `referrerPolicy="no-referrer"`，加载错误降级为通用插件图标且不得把整个插件清单标记为失败。
- 核心运行时就绪后必须调用 `skills/list`，参数固定为当前工作区根目录的单元素 `cwds` 与 `forceReload: false`；收到 `skills/changed` 后使用相同 `cwds` 和 `forceReload: true` 刷新。只展示 enabled Skill，名称优先使用 `interface.displayName`，描述优先使用 `interface.shortDescription`，来源由 `scope` 映射。输入框选择结果必须把模型文本编码为 `$skill-name` 并带 UTF-8 `text_elements`，同时追加精确的 `{ type: "skill", name, path }` 原生输入。
- `skills/extraRoots/set` 的客户端参数必须为空对象，由 Rust 替换为单个内置 Skill 根目录；`thread/start.dynamicTools` 同样只能由 Rust 注入固定的 `markune_drawing` namespace。`item/tool/call` 只接受 `inspect_drawing { drawingId }`、`preview_mermaid { title, definition, profile }`、`preview_mindmap { title, direction, root }`、`apply_preview_to_active { previewId }` 与 `create_from_preview { previewId }`。脑图 `root` 只允许递归 `topic/children`，不得接受模型节点 ID、HTML、样式、链接、图片、主题或路径。`apply_preview_to_active` 的 Drawing ID、kind 与 expectedRevision 只能由 Rust 根据本 turn 活动图稿授权注入；前端不得接受模型指定的目标。预览响应返回有界的质量 grade、creatable、metrics、blockers、warnings 与 suggestions；响应只允许最多 16 KiB 文本以及经过 PNG/WebP 签名校验、最多 2 MiB 的预览 Data URL。
- `select_codex_context_attachments(kind, remaining)` 通过原生选择器添加文件或目录；`paste_codex_context_attachments(remaining)` 只响应用户粘贴，优先返回系统剪贴板文件列表，否则把系统位图编码为内存 PNG。两者最多返回 20 个 opaque attachment ID，并携带名称、类型、媒体类型、大小和预览能力；`read_codex_context_attachment_preview(attachmentId)` 只接受有效 ID，并通过 Raw IPC 返回受限 PNG，`release_codex_context_attachments(ids)` 幂等释放未发送授权。前端只可在 `turn/start.markuneFileAttachments` 中提交 ID；Rust 必须移除私有字段、校验 15 分钟有效期、来源快照、图片签名、20 MiB 单图/40 MiB 单 turn/2500 万像素限制，再把图片转换为 App Server 原生内联 `image` Data URL，把其他文件或目录编码为 `# Files mentioned by the user` 文本头。直接提交 `image`、外部 URL、伪造 Data URL 或未授权 `localImage` 必须失败关闭。附件历史元数据只能放在受控 `text_elements.placeholder`，不得让渲染器提交原始绝对路径。
- 当前文档与显式提及文档只可通过顶层 `markuneDocumentReferences` 传给 Tauri，每项分别标记 `role: "active" | "mention"`；缺少角色只按旧版 `mention` 兼容，每个 turn 最多一个 `active`。Rust 必须移除该私有字段、校验绝对路径与工作区边界，再生成 `markune_document_context_policy`（`application`）、`markune_active_document` 和 `markune_explicit_document_references`（后两者均为 `untrusted`）。即使当前无文档也必须写入 `null` 与空数组，以清除 App Server 上一 turn 的粘性上下文；渲染器直接提交原始 `additionalContext` 必须被拒绝。
- “当前文档”“本文”“这篇文档”“current document”与“active file”只能解析为当前 turn 的 `markune_active_document`；不得根据日期、最近文件、线程历史或工作区惯例猜测。只有请求依赖正文时才读取活跃文档，普通问候不得强制产生无意义工具调用。
- 会话历史恢复只能依据 `text_elements` 的精确区间解析受控的带引号相对路径，并用当前工作区根目录恢复可点击绝对路径；绝对路径、空路径和包含父目录段的标记必须被拒绝。旧版 `mention + text_elements` 仅保留读取兼容，不得继续生成。
- `turn/start.additionalContext` 是随固定 Codex sidecar 使用的实验协议。升级 Codex 时必须重新生成带 `--experimental` 的 App Server Schema，并运行前端与 Rust 契约测试。
- 线程 Goal 只允许调用 `thread/goal/set`、`thread/goal/get` 与 `thread/goal/clear`。渲染器可提交的 `set` 字段仅为 `threadId`、不超过 4,000 字符的非空 `objective` 和用户生命周期状态 `active | paused`；不得提交 `tokenBudget`、自定义续跑提示或模型拥有的 `blocked | usageLimited | budgetLimited | complete` 状态。`thread/goal/updated` 与 `thread/goal/cleared` 必须按 `threadId` 校验后更新当前 UI，重新打开任务时通过 `thread/goal/get` 恢复。
- 命令、文件修改与权限升级审批只能响应 App Server 已登记的 server request id。未知 server request 必须由 Rust 返回 `-32601`，格式无效的已知请求返回 `-32602`，不能转发成可操作 UI 或留在 pending 状态。
- `item/tool/requestUserInput` 只接受 1–3 个问题、每题 2–3 个互斥选项或一个自由输入，并把协议 question/option 映射为 Rust 生成的 opaque ID。前端只能调用独立回答命令提交这些 ID 与可选补充文本；Rust 必须恢复原始 question ID 和 option label，按 `user_note:` 组合补充说明，并拒绝空答案、伪造 ID、缺题、重复回答和重复提交。`autoResolutionMs` 兼容值仍限制为 60–240 秒，但不得创建客户端定时器或发送空 answers；只有用户回答、turn 中断、App Server resolved 或运行时退出可以结束等待。

## Local Files And Assets

工作区文档 API 必须保留 Markdown 源文件。`upload_workspace_asset` 返回的 `markune-asset://{assetId}` 是新资源唯一的 Markdown 持久化引用；`.markune/assets/files/...` 只描述索引中的平台无关物理文件相对位置。`resolve_workspace_assets(rootPath, assetIds)` 单次最多接收 2,048 个合法资源 ID，只 canonicalize 工作区并读取一次索引，按输入唯一 ID 返回 `resolved | missing | unreadable`、既有资产信息和可读取图片的固有尺寸；旧 `resolve_workspace_asset` 保留一个兼容周期。前端必须对超过 2,048 个唯一 ID 的文档分片调用并合并，单片失败只能使该片保持可重试，不能把其他片结果降级为缺失，也不能提交超过原生上限的请求。

`resolveMediaSource` 遵循 Markweave 0.10.0 request：`attempt` 与 `reason` 均为可选，旧调用仍有效。普通请求可以复用有界正缓存；`missing` / `unreadable` 负结果最多保留 5 秒；`reason` 为 `retry | image-error | output` 或 `attempt > 1` 时必须重新调用受校验的资产解析，同一文档 750 ms 内共享恢复波。Abort 或工作区 generation 变化后，前端必须向调用方返回 `null` 并忽略晚到投影；底层共享 IPC 可以完成并写入仍有效的当前工作区缓存。resolver 返回 URL 只表示候选，真实图片/视频 load 才能提交视觉成功。

上传与单/批量解析都只能在索引、canonicalize 和资源目录边界校验成功后，将最终解析出的单个文件加入当前进程的资源协议范围，以支持用户目录外、Windows 非系统盘和 macOS 外置卷上的工作区。预览、引用扫描和清理必须兼容旧相对路径引用，成功解析后可在下一次文档保存时规范化为协议引用，解析失败时不得改写原文。本地视频桥接只在 DOM 上替换展示 `src` 并响应 Markweave output barrier，不新增 Tauri 命令、协议、持久化字段或权限。

## Inbox Commands

Inbox bridge 固定由 `workspace-api.ts` 调用以下命令：`list_inbox_captures`、`read_inbox_capture`、`create_inbox_capture`、`update_inbox_capture`、`delete_inbox_capture`、`promote_inbox_capture` 和 `append_inbox_capture_to_daily`。

- 列表和搜索返回 `InboxCaptureSummary`、`activeCount` 与逐文件读取问题；非空搜索必须覆盖所有状态，普通列表才按 `active | done | archived | all` 过滤。
- 创建和更新必须校验 256 KiB 正文上限、最多 5 个标签、单标签 32 字符、状态与 snooze 约束。`snoozedUntil` 继续保留在接口中以兼容已有 Capture，但当前 UI 只允许清除历史值，不再创建新的 snooze。读取和写入都返回可无损传给 JavaScript 的磁盘版本令牌 `modifiedAt`；Rust 侧固定使用不超过 JavaScript 安全整数范围的 `u64`，更新、删除、Promote 和 Append 必须带期望值并拒绝陈旧写入。
- Capture ID 是文件名身份；命令不得接受任意 Capture 路径。缺失的已知 frontmatter 字段按默认值恢复，未知字段在重写时保留。
- Promote 只接受普通工作区相对目录，不得写入隐藏目录或 Daily；新笔记唯一命名，复制正文、创建时间和标签，无 H1 时补标题。Append 只接受 `YYYY-MM-DD` 与 `HH:mm`，复用或创建 `## Inbox` 并写入 Capture 幂等标记。
- Promote/Append 的正式文档写入和 Capture 留痕属于同一组合操作；后半段失败时必须回滚本次新建笔记或 Daily 内容追加。删除只作用于 Capture 文件，不级联删除已生成内容。

## Drawing Commands

画板 bridge 固定集中在 `workspace-api.ts`，并使用 `DrawingMeta`、`DrawingSummary`、`DrawingAlbumNode`、`DrawingLibrarySnapshot`、`DrawingDocumentDescriptor`、`DrawingSaveSession`、`DrawingSaveState` 与 `DrawingUiState` 契约。

- 查询命令为 `load_drawing_library`、`read_drawing_meta`、`read_drawing_scene`、`read_drawing_preview`、`read_drawing_library`、`read_drawing_ui_state`；`read_drawing_scene` 是兼容命令名，按元数据 `kind` 返回白板 scene 或脑图 content。内容、预览和组件库返回 Raw IPC response，不得转成 JSON 数字数组或 base64。
- 保存固定使用 `begin_drawing_save`、Raw `stage_drawing_scene`、可选 Raw `stage_drawing_preview`、`commit_drawing_save` 和 `cancel_drawing_save`。begin 只接收 Drawing ID、期望 revision、受限元数据和显式冲突覆盖标记；commit 只接收 opaque session ID。
- AI 新建固定使用 `begin_generated_drawing_create`、既有 Raw scene/preview staging、`commit_generated_drawing_create` 与 `cancel_generated_drawing_create`。begin 的图集路径只能由宿主当前选择派生；commit 必须要求场景和有效预览同时存在，并原子创建 revision 1 bundle。
- AI 只读检查固定复用 `read_drawing_meta`、Raw `read_drawing_scene` 和 Raw `read_drawing_preview`，但只能由已通过 Rust 当前 turn 授权的 `markune_drawing.inspect_drawing` 调度。模型只取得有界场景投影，不取得 raw scene、files/blob 或 bundle 物理路径。
- 图稿与图集 create、rename、move、duplicate、trash、restore、permanent-delete 命令只接受 Drawing ID、图集回收站 ID 或受校验相对图集路径。删除图稿先移动整个 bundle 到 `.trash`；删除空图集不得递归，非空图集必须通过整图集回收事务移动到 `.trash/albums/<trash-id>`。复制图集必须为所有图稿生成新 Drawing ID；恢复冲突时生成唯一图集名，不得覆盖现有目录。
- 导入选择器返回限时 opaque grant/source ID；导出选择器返回一次性目录 grant，Raw 写入不接受绝对目标路径且不得覆盖现有文件。组件库和 Markdown 快照同样采用 begin-session 加 Raw body 的两步协议。
- `read_drawing_ui_state` / `write_drawing_ui_state` 只维护 schema v1 的最近 Drawing ID 与有限数值视口。该状态不得参与场景 revision、SHA 或 `updatedAt`。
- `create_drawing_markdown_snapshot` 必须先把 WebP 通过 Raw IPC 写入现有内容寻址资产存储，再返回稳定 `markune-asset://` URL；`markune-drawing://` 只作为前端内部回链，不开放任意协议处理器。

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

interface DocumentExportRuntimeInfo {
  engine: 'pandoc' | 'legacy';
  pandocVersion: string | null;
  professionalPdf: boolean;
  professionalWord: boolean;
  typstVersion: string | null;
}
```

- `select_document_export_directory() -> ExportDirectoryGrant | null`：由 Rust 打开原生文件夹选择器，默认 Downloads；取消返回 `null`。
- `document_export_runtime_info() -> DocumentExportRuntimeInfo`：只报告锁定 sidecar、模板与中文字体是否就绪，不暴露物理路径。
- `convert_document_export(grantId, format, fileStem, markdown, files) -> DocumentExportResult`：只接受 `pdf`/`word`、规范化 Markdown 和相对资产；固定模板和转换参数由 Rust 决定。
- `write_document_export_bundle(grantId, format, fileStem, files) -> DocumentExportResult`：只接受 `html`、`markdown`、`word` 和相对文件包。
- `print_document_pdf(grantId, fileStem, html) -> DocumentExportResult`：仅作为兼容回退，通过隐藏平台 WebView 生成矢量 PDF。

目录授权只能使用一次且 15 分钟过期。命令返回最终实际路径；同名时由 Rust 生成 `标题 (n)`，调用方不得假设请求 stem 就是最终 stem。旧 `write_export_file` 仍只服务既有资源下载，不得接入文档导出流程。

## Document Import Commands

统一导入格式为 `type WorkspaceImportFormat = 'markdown' | 'word' | 'pdf' | 'html'`。前端转换结果必须使用 `PreparedImportDocument`，其中 Markdown 只能引用当前清单声明的 `markune-import://asset/{token}` 占位符；提交完成后不得残留占位符。

- `select_document_import_sources(format) -> DocumentImportGrant | null`：原生多选，最多 20 个文件，只返回 `grantId/sourceId/fileName/size/format`。
- `read_document_import_source(grantId, sourceId) -> RawBytes`：重新验证来源状态后通过 Raw IPC 返回内容。
- `begin_document_import_commit(rootPath, targetDir, manifest) -> ImportCommitSession`：校验目标目录、标题、Markdown、资产清单与占位符，并创建独立 staging。
- `stage_document_import_asset(sessionId, assetToken, RawBytes)`：只接受 Raw IPC 和受控 header，不接受 Base64 JSON。
- `stage_document_import_source_asset(sessionId, assetToken, grantId, sourceId, reference)`：仅解析已授权源目录内相对图片或经来源索引验证的 Markune 资产。
- `commit_document_import(sessionId) -> ImportedDocumentResult`：校验完整资产、散列去重、替换协议引用并唯一命名写入 Markdown。
- `cancel_document_import(sessionId)` 与 `release_document_import_grant(grantId)`：幂等清理当前 staging 或释放源授权。

源授权有效期 15 分钟，提交会话有效期 30 分钟；过期 staging 在后续导入启动时清理。旧 `read_markdown_source_files`、`read_import_source_files` 和 `create_imported_plate_documents` 不得重新注册。

---
owner: refinex
updated: 2026-10-10
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Workspace Graph

`load_workspace_graph({ rootPath })` 返回只读图谱：`nodes`、`edges`、`documentCount`、有限 `warnings` 和内容投影 `fingerprint`。节点新增 `unresolved` 类型、`inDegree` / `outDegree`、`contentIndexed`；`relativePath` 仅文件节点有值。节点/边 ID 为稳定且带命名空间的不透明身份，渲染器不得把 ID 当文件路径。边 `source → target` 保留方向，`weight` 为同方向引用次数，`degree` 计唯一邻居，不等于权重和。标签与属性边是归属关系。

没有目标、目标歧义和未被扫描的引用统一标为未解析，不能仅据此断言磁盘文件不存在；文件存在但内容不可读/超限时保留节点并标记 `contentIndexed: false`。刷新失败不应清空上一快照；根目录切换后旧请求结果必须丢弃。同一指纹可复用现有投影和布局。

## Next.js API Routes

- `app/api/link-preview/route.ts` 为 Web/dev 环境解析链接元数据，必须保留 SSRF 防护、重定向验证、超时和响应大小上限。
- `app/api/uploadthing/route.ts` 暴露由 `lib/uploadthing.ts` 配置的 UploadThing handler。
- 不记录用户本地路径、上传 URL 或文档内容，除非任务明确需要经过脱敏的诊断信息。

## Tauri Command Bridge

- 前端调用必须经 `components/workspace/workspace-api.ts`。
- 命令注册位于 `src-tauri/src/lib.rs`。
- `set_app_ui_scale(scale)` 只接受整数 `80`、`90`、`100`、`110`、`125`、`150`，通过当前窗口的 WebView 原生缩放应用，不改变操作系统 DPI。持久化复用 `save_app_settings` 的 `appearance.uiScale`，不新增 capability。
- `set_app_window_opacity(opacity)` 只接受 `70`–`100` 的整数百分比，并调整当前原生应用窗口的整体合成透明度。macOS 使用 AppKit，Windows 使用分层窗口 alpha；前端拖动时可以高频预览，但设置文件仅在交互提交后写入。非桌面环境不得用 CSS 内容透明度伪造窗口效果。
- `get_macos_titlebar_metrics() -> { trafficLightCenterY } | null` 只读 AppKit 原生关闭按钮在当前 WKWebView 坐标系中的垂直中心，供左上角 Web 控件对齐；返回值只包含经过有限值与标题栏范围校验的逻辑像素，不暴露原生句柄、窗口内容或设备信息，非 macOS 返回 `null`。
- `select_workspace_directory() -> string | null` 通过原生文件夹选择器打开工作区根目录；取消返回 `null`，成功返回 canonicalize 后的本地目录绝对路径。打开/新建工作区不得再依赖前端 `@tauri-apps/plugin-dialog` 的 `open()`。
- `take_external_open_request() -> { id, workspaceRoot, documentPath } | null` 取出并清除最近一次系统“打开方式”请求。路径已由 Rust 解析为工作区根与 Markdown 文档；渲染器不得把任意路径提交给该命令。后续打开通过事件 `markune-external-open` 送达同一结构。
- `load_workspace_tree(rootPath)` / `ensure_workspace(rootPath)` / `create_workspace_root(parentPath, workspaceName)` 继续作为工作区树读取、元数据初始化与新建入口。
- `inspect_workspace_brand(rootPath) -> { state }` 是加载既有工作区前的只读品牌检查，`state` 只能为 `new | current | legacy | conflict`。前端在 `legacy` 或 `conflict` 状态不得继续调用工作区树读取和初始化命令。
- `migrate_legacy_workspace_brand(rootPath) -> WorkspaceBrandMigrationReport` 只能由用户在品牌迁移弹窗明确确认后调用。命令返回备份相对路径、改写文件数、设置/provider/凭据迁移状态和警告；目录并存、符号链接、路径逃逸、超限文件或事务失败必须返回错误，不能静默部分成功。
- Git 命令必须在阻塞任务中执行，不得占用 Tauri 原生主线程；本地命令超时为 60 秒，网络及提交等长操作超时为 180 秒，超时后必须终止对应进程树。Windows 启动 Git 子进程时必须使用无窗口标志，前端命令名称、参数和返回结构保持不变。
- 终端命令为 `terminal_spawn({ rootPath, cols, rows }) -> { id, cwd, shell }`、`terminal_write({ sessionId, data })`、`terminal_resize({ sessionId, cols, rows })` 和幂等的 `terminal_kill({ sessionId })`。单次写入最多 64 KiB；尺寸钳制为最大 300×120。事件为 `terminal:data`、`terminal:exit`（`code` 为进程退出码，等待失败时为 `null`）和 `terminal:error`。折叠面板不调用 kill；主窗口销毁由 Rust 清理仍在运行的会话。
- `system_fonts.rs` 仅可返回字体家族名称与推荐元数据，不得暴露字体文件路径或内容。
- 桌面端网络功能应走 Tauri 命令；生产桌面构建使用静态导出，不包含 Next API routes。

### Document Attachment Commands

- `store_document_asset(rootPath, documentPath, input)`：输入 `kind` 与 `sourceType/value/fileName/mediaType`，校验 Markdown/MDX 上下文并读取原生存储设置，返回持久化 `src/name/mimeType/size`。来源支持 File 的 Base64、Data URI、HTTP(S) URL、绝对和相对本地路径；不把普通文件伪装成托管资产 ID。
- `resolve_document_assets(rootPath, documentPath, sources)`：每批最多 2,048 个普通本地引用，仅返回校验通过的精确文件路径供媒体 resolver 显示；不执行复制或下载。
- `read_document_asset_data(rootPath, documentPath, source)`：下载/导出读取最多 100 MB 的授权文件，返回原有资源数据结构；拒绝目录、私有路径和未授权位置。
- `select_attachment_directory()`：原生目录选择建立用户级持久授权，取消不改变授权。授权与当前存储策略分离，恢复默认或切换策略不破坏历史附件可读性。
- `storage.attachments` 新字段具有 Serde 和前端默认值，旧配置无新字段时保留内置存储。保存设置与资产索引使用原子替换。

### Workspace Refresh Commands

- `watch_workspace(rootPath, onChange: Channel) -> watchId` 在后台校验 canonical 工作区并建立当前窗口的原生递归监听。事件为 `{ rootPath, paths, rescan, watchError }`，只包含有界失效路径；`unwatch_workspace(watchId)` 只能释放调用窗口匹配的会话，迟到的清理不能停止新监听。窗口销毁时原生层主动释放。
- `refresh_workspace_node(rootPath, nodePath)` 对目录返回递归子树，对文档返回最新树描述；缺失返回 `null`，权限或读取失败必须返回错误。前端协调器另行重读范围内已打开标签的完整正文。
- `save_markdown_document` 新增可选 `expectedContent`，编辑器保存与冲突覆盖均提交所读取的正文基线；即使修改时间相同，也必须拒绝覆盖不同的磁盘内容。该参数只用于内存比较，不写日志或额外持久化。
- `external-refresh` 是编辑器内部 flush 原因，必须只捕获输入，不触发磁盘保存或标题重命名；随后由外部版本比较决定重载、保持草稿或进入冲突。

### Directory Tree Commands

- `WorkspaceSnapshot.treeSort` 返回默认排序及目录覆盖；`WorkspaceNode.fileCreatedAt` / `fileModifiedAt` 是可空的文件系统时间，`manualOrder` 是当前父级的手动序号，不改变既有正文元数据时间含义。
- `set_workspace_tree_sort(rootPath, parentPath, policy, visibleOrders)` 保存当前目录的策略。根目录不可继承，子目录 `policy: null` 表示删除覆盖。首次手动排序的可见顺序必须与真实目录清单一致；最多 50,000 个节点，拒绝过期、重复、跨目录或越界节点。
- `move_workspace_nodes(rootPath, nodePaths, targetParentPath, beforePath, afterPath)` 接收 1–100 个源项。选中父子项时只移动父项；前后锚点互斥，须属于目标父级且不在选中项中。自动排序只允许移入目录。返回 `{ snapshot, changes: [{oldPath,newPath}], undoToken, error }`；`error` 非空时仍须先应用实际完成的 `changes`，不能把部分完成显示成完全失败或完全成功。
- `undo_workspace_tree_move(rootPath, token)` 只接受原生层生成且仍有效的最近收据，返回相同结果结构。前端不提供任意备份内容或恢复路径。树内 Cmd/Ctrl-Z 和“撤销移动”共用此命令，不接管编辑器正文撤销。
- 旧 `move_workspace_node` 保留单项兼容入口并共用修复后的邻居计算；前端目录树统一通过批量入口获得完成结果与撤销能力。移动、撤销和排序结果不得覆盖切换后的工作区，操作前开始的刷新结果必须失效。

### Daily Commands

- `open_daily_note(rootPath, date)` 只允许严格的 `YYYY-MM-DD`，并在用户显式打开已有 Daily 或确认创建空白日期时调用；日程总览的月份切换和日期选择不得隐式调用该命令。
- `list_daily_notes_for_month(rootPath, month)` 只允许严格的 `YYYY-MM`，在 canonical 工作区下扫描固定的 `Daily/YYYY/MM` 目录，一次返回当月条目。标题、摘要、任务计数和最多三条任务预览从本次读取的 UTF-8 Markdown 派生，不逐日追加 IPC，也不得把这些正文投影写入工作区元数据。
- 前端只能通过 `workspace-api.ts` 调用上述命令；月度请求必须忽略晚于新月份返回的过期响应，并把读取错误暴露为可重试状态，不能静默替换为空月份。

## Application Update Commands

- `app_update_check() -> AppUpdateCheckResult`：使用 Rust release 配置中的固定 endpoint 和公钥检查更新，返回当前版本及有界的版本、日期、纯文本说明；不得接受渲染器 URL、请求头、代理、target 或降级参数。
- `app_update_install(onEvent: Channel<AppUpdateDownloadEvent>)`：只消费 Rust 内存中最近一次检查得到的 pending update，串行下载、验签并安装；事件只包含开始时的可选总字节数、分块字节数和下载完成标记。
- `app_update_restart()`：只在前端已进入安装完成状态后调用 Tauri restart，不接受参数。

检查和安装不能并发。安装失败会消费 pending update，用户必须重新检查，防止复用状态不明的下载任务。前端 bridge 只能位于 `workspace-api.ts`，不得直接使用 `@tauri-apps/plugin-updater` 绕过 Rust 边界。

## ACP Agent Bridge

完整契约见 [ACP Agent Host](../architecture/agents.md)。`agent_catalog/install/install_status/cancel_install/use_local/select_program/save_profile/set_secret/uninstall` 管理 Agent；`agent_connect/send/disconnect/client_operation/context/auth_terminal` 管理窗口所属连接；`agent_history/read_session/save_session` 管理 Markune 自有历史。stdio 事件统一为 `markune:agent-event`，携带不透明 connectionId；不复用旧 App Server IPC。

- React 仅使用 `agent-api.ts` 和 `agent-runtime.ts`，不得直接启动进程、读取供应商凭据或历史文件。
- ACP 基线为 v1，初始化、Session、配置与权限使用官方 SDK 类型；模型、模式和选项 ID 不翻译、不猜测。
- 原生层校验 JSON-RPC 消息大小、方法、会话、窗口以及响应候选。文件/终端调用必须匹配未执行的 Agent 请求，不能变成任意 IPC 文件或 shell 入口。
- 新会话成功响应生成原生归属凭据；恢复只能引用匹配工作区/Profile 的凭据，独占租约禁止重复占用。未保存供应商 Session ID 的空会话不写历史。
- 取消、退出及窗口销毁撤销当前任务工具授权；未知扩展返回方法错误，不无限等待。连接断开不得重发有副作用的 prompt。
- Markune MCP 绘图参数复用当前图稿元数据、受限预览与原子提交规则；Agent 不能指定覆盖目标。MCP 文档写入先 flush 编辑器，再校验读取基线、文档锁定及外部冲突。

## Local Files And Assets

工作区文档 API 必须保留 Markdown 源文件。`upload_workspace_asset` 返回的 `markune-asset://{assetId}` 是新资源唯一的 Markdown 持久化引用；`.markune/assets/files/...` 只描述索引中的平台无关物理文件相对位置。`resolve_workspace_assets(rootPath, assetIds)` 单次最多接收 2,048 个合法资源 ID，只 canonicalize 工作区并读取一次索引，按输入唯一 ID 返回 `resolved | missing | unreadable`、既有资产信息和可读取图片的固有尺寸；旧 `resolve_workspace_asset` 保留一个兼容周期。前端必须对超过 2,048 个唯一 ID 的文档分片调用并合并，单片失败只能使该片保持可重试，不能把其他片结果降级为缺失，也不能提交超过原生上限的请求。

`resolveMediaSource` 遵循 Markweave 0.10.3 request：`attempt` 与 `reason` 均为可选，旧调用仍有效。普通请求可以复用有界正缓存；`missing` / `unreadable` 负结果最多保留 5 秒；`reason` 为 `retry | image-error | output` 或 `attempt > 1` 时必须重新调用受校验的资产解析，同一文档 750 ms 内共享恢复波。Abort 或工作区 generation 变化后，前端必须向调用方返回 `null` 并忽略晚到投影；底层共享 IPC 可以完成并写入仍有效的当前工作区缓存。resolver 返回 URL 只表示候选，真实图片/视频 load 才能提交视觉成功。

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


## Knowledge Index And Mutation Commands

- `load_workspace_index`：接收 rootPath、sinceRevision、cursor、snapshotRevision、changedPaths、force；返回 revision/reset、变更 documents、removed、warnings、nextCursor、total。游标必须与快照版本和 sinceRevision 一致，分页失败时丢弃本轮部分结果并请求完整快照。全文只在分页记录中，UI 摘要剥离 content。
- `find_workspace_mentions`：接收工作区目标相对路径和至多 64 篇候选，返回最多 200 个正文提及及行号/上下文，不执行改写。
- `rename_workspace_node`：统一事务改写明确入链/出链/附件和 workspace.json；`rename_workspace_document_path` 使用同样事务但保持正文标题。已有 move 命令复用相同逻辑。工作区快照可携带可选 warnings，包含待检查的中断移动。
- `create_workspace_document_from_content`：最多 4 MiB Markdown；可选 sourcePath 必须为当前工作区内既有文档，仅用于模板/来源副本的相对路径重定位。目标采用唯一文件名并原子创建，不覆盖已有文件。
- `set_workspace_task_checked`：documentPath、UTF-8 字节 offset、完整内容 fingerprint 与 checked；校验并只修改真实任务标记。行号为一基，不能用 JS UTF-16 偏移替代原生字节 offset。
- `read_workspace_views` / `save_workspace_views`：读写 `.markune/views.json` 的 views 与 fingerprint；最多 64 个视图、配置 256 KiB。删除视图即以原指纹保存删去该 ID 的列表，不删除笔记。

PDF 来源及网页来源采用普通 frontmatter 的 `source` 对象：type/title/quote/capturedAt，网页有 url，PDF 有 page/fingerprint/reference。reference 是标准 Markdown 来源链接。quote 不参加自动链接修复，已捕获证据保持原文。

新增内部命令：`read_codex_artifact(rootPath, relativePath?|assetId?)` 返回有界只读预览；`read_codex_instruction_manifest(rootPath)` 只返回指令文件路径、大小与指纹。`codex_app_server_respond_elicitation` 必须提供原 `sessionId`、requestId 和 accept/decline/cancel，Rust 校验原请求 schema。provider 的 set/clear/auth-mode 更新必须提供 `expectedFingerprint`。更详细的协议与预算见 [专项架构](../architecture/codex.md)。

---
owner: refinex
updated: 2026-07-19
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

## Inbox Capture Boundary

Inbox 是工作区级快速捕获与分拣入口，不属于正式文档树、全局文档搜索或任务系统。每条 Capture 以独立 Markdown 文件保存在 `.madora/inbox/{capture-id}.md`，正文继续复用 Markdown 编辑器和工作区资产能力；列表、搜索和未处理徽标直接从这些文件计算，不修改 `.madora/workspace.json` schema。

前端由 `use-inbox-controller.ts` 统一持有列表、选中项、新建草稿与保存状态，`inbox-sidebar.tsx` 复用左侧目录树区域承载紧凑列表、状态筛选、状态行右侧的新建入口和分拣菜单，`inbox-page.tsx` 只保留无标题栏的 Markdown 编辑器。新建时先在主编辑区建立临时草稿，空白草稿不写盘，首个非空正文通过自动保存创建 Capture。Capture 的历史标签仍按原样保留在 Markdown frontmatter 与接口中以保证兼容，但 Inbox v1 不提供标签交互。侧栏顶部搜索在 Inbox 激活时切换到独立查询，不覆盖普通文档树搜索。原生边界集中在 `src-tauri/src/inbox.rs`：通用 Markdown 命令继续拒绝 `.madora`，Inbox 命令只接受受格式约束的 Capture ID，并在 canonicalize 后访问 `.madora/inbox/<id>.md`。Promote 和 Append 作为 Rust 组合操作完成；Daily 追加使用 `<!-- madora-capture:<id> -->` 防止重复，并在 Capture 留痕保存失败时恢复本次追加。

Capture 的持久状态仅为 `open`、`processing`、`done`、`archived`。Inbox 不再提供新增 snooze 的交互；历史 Capture 中未来的 `snoozedUntil` 仍在读取后的视图层派生为“稍后”，并提供“恢复待处理”清除该字段，无需后台迁移。提升后的 Note 与追加后的 Daily 都是正式 Markdown 文档，Capture 本身保留为已处理记录。

## Multi-format Import Boundary

目录导入由 `components/workspace/use-document-import.tsx` 串行编排。Markdown、HTML、DOCX 和 PDF 都先转换为 `PreparedImportDocument`，再逐文件原子提交为 Markdown；批量任务允许部分成功，取消只回滚当前文件并保留已经提交的文档。Markdown/HTML 语义转换位于 `document-import-core.ts`，DOCX 先由 Mammoth 生成 HTML 后进入同一清洗管线，PDF 由 PDF.js 恢复结构和坐标阅读顺序，只对低文本页调用离线 Tesseract 中英文 OCR。PDF.js 解析和 Tesseract 识别使用各自本地 Worker，不依赖 CDN 或远程转换服务。

原生边界集中在 `src-tauri/src/import.rs`。文件选择器只返回 15 分钟有效的 opaque grant/source ID；源文件和内联资产通过 Raw IPC 读取或暂存，渲染器不取得绝对源路径。每个文档有独立 staging session，Rust 校验占位符、图片签名、路径边界和总量后散列去重资产，把 `madora-import://asset/{token}` 原子替换为 `madora-asset://{hash}`，最后写入唯一命名的 `.md`。失败时清理 staging、恢复本次新增且未被引用的资产；旧 Plate 导入命令不再属于运行时架构。

Markdown/HTML 相对图片只能从已授权源文档目录内读取；跨工作区 Madora 资产必须通过来源工作区索引重新解析、复制和散列。HTTP(S) 图片只保留链接并产生警告，不由导入器下载。

## Single-document Export Boundary

单文档导出由 `components/workspace/use-document-export.tsx` 统一编排，文档树右键菜单与省略号菜单只传入文档节点和格式。导出源按当前未保存草稿、已打开标签缓存、磁盘 Markdown 的顺序解析，继续保持 Markdown-first 边界。

`document-export-core.ts` 负责可移植 Markdown 资源包、只读 Markweave DOM 快照、静态 HTML 清理与打印 CSS；`document-export-word.ts` 将清理后的语义 DOM 映射为定制 DOCX。HTML 跟随当前主题，PDF 与 Word 固定使用浅色 A4 排版。HTML/PDF 复用同一 Markweave 快照，PDF 通过平台 WebView 原生打印，禁止整页截图。

原生边界集中在 `src-tauri/src/export.rs`。渲染器只能先取得一次性目录授权，再提交格式、文件 stem 和相对文件包；不能把任意目标绝对路径传给写入或打印命令。PDF 的隐藏 WebView 只访问一次性 `madora-export://` 会话，完成、失败或超时后销毁。

## Codex AI Boundary

AI 面板是工作区级客户端，不在浏览器渲染器中运行 Node.js SDK，也不持有 OpenAI API key。Tauri 启动固定版本的 `codex app-server --listen stdio://`，账户登录、线程历史、模型目录、MCP、联网搜索、工具调用和文件变更由 App Server 提供。前端仅能调用 `src-tauri/src/codex.rs` 中的 allowlist 方法，并把消息、计划、命令、文件修改与 MCP 事件按协议到达顺序写入统一会话流；助手消息使用禁用原始 HTML 的 GFM 渲染。

Codex 运行时在工作区根目录就绪后后台预热，关闭右侧 AI 面板只隐藏视图，不卸载会话组件或终止 App Server。启动采用分层加载：App Server、账户与权限约束构成可发送消息的核心就绪条件，模型目录、线程历史、当前工作区的已安装插件与 Skill 在核心就绪后后台加载。Madora 不为输入框菜单预取或展示 MCP inventory。模型、历史、插件或 Skill 加载慢或失败都不得退回全屏“正在连接”状态，也不得阻塞使用服务端默认模型发送消息。用户在核心握手期间可以编辑并提交，提交操作等待同一个启动 Promise，核心成功后继续执行，失败时保留草稿并显示错误。

会话渲染保留 App Server 的 `Turn -> Item` 层级。`agentMessage.phase=commentary`、工具活动、计划和上下文压缩组成可折叠的处理过程，`phase=final_answer` 保持为独立最终回答；未提供 phase 的旧消息按普通助手消息兼容。连续工具只在视图投影层分组，底层有序 item 不重排。命令输出增量、文件 patch、MCP progress、耗时、退出码和审批请求都更新原 item；历史恢复使用同一映射逻辑。内部 reasoning 不进入界面，命令输出只保留有界首尾预览，避免大输出占用无界内存。

AI 文件修改以 App Server 事件为刷新事实源。`item/fileChange/patchUpdated` 只更新处理中预览；成功的 `item/completed(fileChange)` 才按路径合并并触发短延迟重读，`turn/completed` 再刷新目录树并复核所有已打开 Markdown 标签，以覆盖通过 shell 直接写盘但未形成 fileChange item 的情况。发送 turn 前必须先完成当前草稿保存，避免 Codex 读取旧磁盘内容。磁盘重读继续使用受工作区边界保护的 `read_markdown_document`，不增加通用文件监听或 Tauri capability。

当 Codex 写盘期间用户又修改了同一当前文档，Madora 不自动选择任一版本，也不继续自动保存：编辑器保留本地草稿并进入显式冲突状态，用户只能确认“加载 AI 版本”或“用我的版本覆盖”。完成 turn 的聚合 diff 优先生成确定性的“已编辑 N 个文件”摘要、净增删行数和可展开文件列表；Markdown 路径只有在已解析到当前工作区时才可点击。摘要不发起第二次模型调用，也不提供缺少 turn 快照保障的一键撤销。

正常运行和成功的工具组及技术详情默认折叠，只保留语义摘要、状态与耗时；失败、拒绝和待审批活动自动展开，用户手动 disclosure 状态不会被后续增量或完成通知重置。消息视口只在用户位于底部时跟随流式更新，用户上滚后显示轻量“回到最新消息”按钮；发送新消息或显式点击后恢复跟随。输入编辑区从紧凑高度开始随内容增长，并在达到面板合理上限后改为内部滚动。

历史恢复以 App Server 实际返回的 thread items 为上限。固定 sidecar `0.144.4` 的 `thread/read` 与 `thread/turns/list` 当前不会回放已完成 turn 的命令和其他工具 item，`thread/items/list` 也尚未实现；因此 Madora 可以恢复 commentary、最终回答和 App Server 返回的持久 item，但不能通过读取 Codex JSONL 或维护第二份日志补齐缺失的历史工具明细。升级 sidecar 后必须重新验证该投影能力。

线程以当前工作区根目录作为 `cwd`，默认选择 Codex 命名权限配置 `:workspace`、`on-request` 审批策略和 `user` reviewer。用户可以切换为自动风险审查、`:danger-full-access`、`:read-only` 或 App Server 从 `config.toml` 返回的自定义 permission profile；模式切换统一走 `thread/settings/update`，后续 `turn/start` 不再重复覆盖线程权限。自动审查只改变审批 reviewer，不扩大 permission profile；完全访问必须经过显式风险确认，并固定为 `:danger-full-access + never + user`。

权限目录、企业要求和实验能力分别通过只读的 `permissionProfile/list`、`configRequirements/read` 与 `experimentalFeature/list` 发现。渲染器不能调用 App Server 的通用 `fs/*`、`command/exec`、`thread/shellCommand` 或通用配置读取/写入接口。命令、文件与权限升级 server request 由 Rust 保存服务端原始候选，前端只接收可展示的 opaque choice id；响应时 Rust 再映射回原候选，防止渲染器伪造 execpolicy、network policy、文件范围或权限对象。未知交互请求必须返回 JSON-RPC 错误并失败关闭，不能悬挂 turn。

文档上下文采用路径引用，不复制文档正文。活动文档身份只取自当前编辑器文档标签保存的物理绝对路径；frontmatter `title` 只作为可读元数据，不参与身份解析，输入框和欢迎提示展示工作区相对路径。发送前必须确认该标签路径已经成为工作区当前加载文档，否则阻止 turn，避免快速切换标签时保存或引用上一份文档。前端把显式 `@` 文档在模型文本中编码为带引号的工作区相对路径，并用 `text_elements.placeholder` 保留文档链接；同时把编辑器当前活跃文档标为 `active`、显式提及标为 `mention`，只通过 Madora 私有字段提交给 Tauri。Rust canonicalize 并验证路径后，将固定语义策略写入 `madora_document_context_policy`（`application`），将活跃文档写入 `madora_active_document`、其他显式引用写入 `madora_explicit_document_references`（均为 `untrusted`）。因此“当前文档/本文”只解析为该 turn 的活跃文档，不从 frontmatter 标题、日期、最近文件或会话历史猜测；没有活跃文档时显式发送 `null` 以清除 App Server 的粘性上下文。Codex 仅在请求依赖文档内容时通过正常工作区工具读取，因此读取动作仍进入原生工具时间线。

任意本地文件与文件夹上下文必须经过 Tauri 原生选择器。渲染器只取得 15 分钟有效的 opaque attachment ID、名称、类型和图片标记，单次最多保留 20 个，不取得所选绝对路径。发送 turn 时 Rust 重新校验授权与真实路径：受支持图片转换为 App Server `localImage`，其他文件和目录按官方 `# Files mentioned by the user` 文本头编码，并用私有 `text_elements.placeholder` 保存历史展示元数据。附件授权只允许把所选路径传入当前 turn，不扩大 Codex permission profile；工作区外文件或目录的实际读取仍由 App Server 工具权限和审批决定。

插件入口在核心运行时就绪后使用固定 sidecar 的 `plugin/installed` 按当前工作区自动加载，每个运行时代际最多发起一次成功请求，只展示已安装、已启用且未被管理员禁用的插件；加载失败时只在菜单内提供重试。App Server 返回的 `composerIcon`、`logo` 与 `logoDark` 本地文件由 Rust 按响应请求 ID 建立精确路径授权，前端只能通过 `read_codex_plugin_icon` 读取当前插件清单声明的单个受支持图片；远程图标只接受 HTTPS。菜单按 composer、主题 logo、通用占位图标的顺序降级，单个资源失败不影响插件清单。授权在重新检测、运行时停止或工作区切换时失效，不扩大资源协议 scope。

选择插件会在编辑器插入带真实图标、视觉上不显示触发符的原子节点；生成模型文本时恢复 `@Plugin`，并在 `turn/start` 同时发送 `plugin://{id}` 原生 mention。图标字节只存在于当前输入视图，不写入 mention、消息历史或工作区。历史恢复继续依赖该 mention 与对应 UTF-8 `text_elements` 区间。目标当前仍为不可操作的菜单占位。

计划模式通过实验接口 `collaborationMode/list` 发现固定 sidecar 的 `Plan` 与 `Default` 预设；不可用时只禁用入口，不阻塞普通对话。每个 `turn/start` 显式提交内置 collaboration mode，Plan 固定当前模型与 `medium` 推理强度，Default 使用恢复后的模型与强度，二者都不改变线程权限。Plan 是 Codex 的开发者指令约束，不是只读 sandbox；活跃 turn、审批或用户问题未完成时禁止切换。新建、恢复和重新打开线程均从 Default 开始，Madora 不为协作模式建立持久化镜像。

Plan turn 的 `item/plan/delta` 只用于流式展示，`item/completed` 的完整 `plan` item 是权威正文；`turn/plan/updated` 仍只表示执行检查清单。正式计划以渐隐摘要卡进入线程投影，并随 `thread/read` 恢复；卡片可复制完整 Markdown，或在主编辑区打开只读的内存 Plan 标签页。Plan 标签使用 `threadId + plan item id` 标识，只存在于当前工作区 UI，不调用文档读写 API、不进入最近文档，也不创建 Markdown 文件。仅实时完成且确实产出正式计划时显示客户端三选项：在原线程发送 `Implement the plan.`、把完整计划引导语作为新 Default 线程首条消息，或留在 Plan 继续补充；历史回放不自动弹出。计划正文仍由 App Server 写入共享 Codex Home，Madora 不创建计划文件或数据库副本。

`item/tool/requestUserInput` 是独立的 server request。Rust 将 1–3 个问题、自由输入或 2–3 个选项投影为 opaque ID，前端在输入框上方逐题收集答案，Rust 再映射回 App Server 原始 question ID 与 option label，使同一 turn 继续。兼容字段 `autoResolutionMs` 仍按固定 sidecar 的协议边界校验，但 Madora 不据此代替用户提交空答案；问题会持续等待用户选择。问题存在时普通发送被阻止但仍可中断 turn；`serverRequest/resolved`、interrupt 和运行时退出都会同时清理前端交互与 Rust pending 映射。

输入空白边界上的 `/` 会打开独立 Skill 面板。Skill 通过当前工作区单元素 `cwds` 的 `skills/list` 自动加载，只展示 enabled 项；`skills/changed` 作为失效信号触发强制刷新。选择项在输入框插入统一立方体图标和 display name，模型文本编码为 `$skill-name`，并额外发送 `{ type: "skill", name, path }` 原生输入。Rust 只授权最近一次关联 `skills/list` 响应中的精确名称与 canonical path，列表刷新、变更通知、运行时停止或工作区切换都会撤销旧授权。

提及候选只来自当前已加载的 Markdown 文档索引，并在前端按标题、文件名和工作区相对路径进行确定性的 Unicode 模糊排序；当前文档和已附加文档从候选中排除。编辑器基于真实光标位置识别空白分隔的 `@token`，候选列表支持方向键循环选择、选中项就近滚动、Enter/Tab 确认和 Escape 关闭。固定 sidecar 虽提供通用 `fuzzyFileSearch`，但 Madora 不向渲染器开放该文件系统枚举接口，避免绕过文档索引和工作区路径边界。

Codex App Server 是 AI 会话持久化的唯一所有者。Madora 默认把 sidecar 绑定到共享的 `~/.codex`，允许的 `CODEX_HOME` 覆盖必须是工作区之外的既有绝对目录；该进程的 `sqlite_home` 固定为同一目录。Codex 管理 `sessions/**/*.jsonl` 会话记录、`session_index.jsonl` 追加索引和 SQLite 查询投影，Madora 只能通过 `thread/start`、`thread/resume`、`thread/list`、`thread/read`、`thread/name/set`、`thread/archive` 与 `thread/delete` 访问线程，禁止直接读写这些内部文件或数据库。

工作区 `.madora` 只保存工作区元数据和资产，不保存 AI 消息。历史 `.madora/ai-sessions` JSON 方案已经废弃，不得重新引入，也不得为 Codex 会话维护第二份本地镜像。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。

Markweave 只接收 frontmatter 解析后的正文；保存时必须重新序列化受保护的 frontmatter。新上传资源的物理文件写入工作区根目录下的 `.madora/assets/files/{shard}/{hash}.{ext}`，Markdown 持久化引用统一使用 `madora-asset://{assetId}`。编辑器展示前通过工作区资产索引解析为受控本地 URL；旧 `.madora/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。资产存活扫描覆盖正式 Markdown 和 `.madora/inbox/*.md`，但不扫描 `.madora` 下其他私有 Markdown。

## Desktop Build Boundary

`scripts/stage-document-import-runtime.mjs` 在开发和构建前从锁定依赖复制 PDF Worker、CMap、标准字体、WASM、Tesseract Worker 与中英文模型到忽略版本控制的 `public/import-runtime`；任一源文件缺失都会使启动或构建失败。`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。

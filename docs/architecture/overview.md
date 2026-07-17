---
owner: refinex
updated: 2026-07-17
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

Codex 运行时在工作区根目录就绪后后台预热，关闭右侧 AI 面板只隐藏视图，不卸载会话组件或终止 App Server。启动采用分层加载：App Server、账户与权限约束构成可发送消息的核心就绪条件；模型目录和线程历史在核心就绪后后台加载；可能建立外部连接的 MCP 状态只在 AI 面板首次可见时发现。模型、历史或 MCP 加载慢或失败都不得退回全屏“正在连接”状态，也不得阻塞使用服务端默认模型发送消息。用户在核心握手期间可以编辑并提交，提交操作等待同一个启动 Promise，核心成功后继续执行，失败时保留草稿并显示错误。

会话渲染保留 App Server 的 `Turn -> Item` 层级。`agentMessage.phase=commentary`、工具活动、计划和上下文压缩组成可折叠的处理过程，`phase=final_answer` 保持为独立最终回答；未提供 phase 的旧消息按普通助手消息兼容。连续工具只在视图投影层分组，底层有序 item 不重排。命令输出增量、文件 patch、MCP progress、耗时、退出码和审批请求都更新原 item；历史恢复使用同一映射逻辑。内部 reasoning 不进入界面，命令输出只保留有界首尾预览，避免大输出占用无界内存。

AI 文件修改以 App Server 事件为刷新事实源。`item/fileChange/patchUpdated` 只更新处理中预览；成功的 `item/completed(fileChange)` 才按路径合并并触发短延迟重读，`turn/completed` 再刷新目录树并复核所有已打开 Markdown 标签，以覆盖通过 shell 直接写盘但未形成 fileChange item 的情况。发送 turn 前必须先完成当前草稿保存，避免 Codex 读取旧磁盘内容。磁盘重读继续使用受工作区边界保护的 `read_markdown_document`，不增加通用文件监听或 Tauri capability。

当 Codex 写盘期间用户又修改了同一当前文档，Madora 不自动选择任一版本，也不继续自动保存：编辑器保留本地草稿并进入显式冲突状态，用户只能确认“加载 AI 版本”或“用我的版本覆盖”。完成 turn 的聚合 diff 优先生成确定性的“已编辑 N 个文件”摘要、净增删行数和可展开文件列表；Markdown 路径只有在已解析到当前工作区时才可点击。摘要不发起第二次模型调用，也不提供缺少 turn 快照保障的一键撤销。

正常运行和成功的工具组及技术详情默认折叠，只保留语义摘要、状态与耗时；失败、拒绝和待审批活动自动展开，用户手动 disclosure 状态不会被后续增量或完成通知重置。消息视口只在用户位于底部时跟随流式更新，用户上滚后显示轻量“回到最新消息”按钮；发送新消息或显式点击后恢复跟随。输入编辑区从紧凑高度开始随内容增长，并在达到面板合理上限后改为内部滚动。

历史恢复以 App Server 实际返回的 thread items 为上限。固定 sidecar `0.144.4` 的 `thread/read` 与 `thread/turns/list` 当前不会回放已完成 turn 的命令和其他工具 item，`thread/items/list` 也尚未实现；因此 Madora 可以恢复 commentary、最终回答和 App Server 返回的持久 item，但不能通过读取 Codex JSONL 或维护第二份日志补齐缺失的历史工具明细。升级 sidecar 后必须重新验证该投影能力。

线程以当前工作区根目录作为 `cwd`，默认选择 Codex 命名权限配置 `:workspace`、`on-request` 审批策略和 `user` reviewer。用户可以切换为自动风险审查、`:danger-full-access`、`:read-only` 或 App Server 从 `config.toml` 返回的自定义 permission profile；模式切换统一走 `thread/settings/update`，后续 `turn/start` 不再重复覆盖线程权限。自动审查只改变审批 reviewer，不扩大 permission profile；完全访问必须经过显式风险确认，并固定为 `:danger-full-access + never + user`。

权限目录、企业要求和实验能力分别通过只读的 `permissionProfile/list`、`configRequirements/read` 与 `experimentalFeature/list` 发现。渲染器不能调用 App Server 的通用 `fs/*`、`command/exec`、`thread/shellCommand` 或通用配置读取/写入接口。命令、文件与权限升级 server request 由 Rust 保存服务端原始候选，前端只接收可展示的 opaque choice id；响应时 Rust 再映射回原候选，防止渲染器伪造 execpolicy、network policy、文件范围或权限对象。未知交互请求必须返回 JSON-RPC 错误并失败关闭，不能悬挂 turn。

文档上下文采用路径引用，不复制文档正文。前端把显式 `@` 文档在模型文本中编码为带引号的工作区相对路径，并用 `text_elements.placeholder` 保留标题链接；同时把编辑器当前活跃文档标为 `active`、显式提及标为 `mention`，只通过 Madora 私有字段提交给 Tauri。Rust canonicalize 并验证路径后，将固定语义策略写入 `madora_document_context_policy`（`application`），将活跃文档写入 `madora_active_document`、其他显式引用写入 `madora_explicit_document_references`（均为 `untrusted`）。因此“当前文档/本文”只解析为该 turn 的活跃文档，不从日期、最近文件或会话历史猜测；没有活跃文档时显式发送 `null` 以清除 App Server 的粘性上下文。Codex 仅在请求依赖文档内容时通过正常工作区工具读取，因此读取动作仍进入原生工具时间线。

提及候选只来自当前已加载的 Markdown 文档索引，并在前端按标题、文件名和工作区相对路径进行确定性的 Unicode 模糊排序；当前文档和已附加文档从候选中排除。编辑器基于真实光标位置识别空白分隔的 `@token`，候选列表支持方向键循环选择、选中项就近滚动、Enter/Tab 确认和 Escape 关闭。固定 sidecar 虽提供通用 `fuzzyFileSearch`，但 Madora 不向渲染器开放该文件系统枚举接口，避免绕过文档索引和工作区路径边界。

Codex App Server 是 AI 会话持久化的唯一所有者。Madora 默认把 sidecar 绑定到共享的 `~/.codex`，允许的 `CODEX_HOME` 覆盖必须是工作区之外的既有绝对目录；该进程的 `sqlite_home` 固定为同一目录。Codex 管理 `sessions/**/*.jsonl` 会话记录、`session_index.jsonl` 追加索引和 SQLite 查询投影，Madora 只能通过 `thread/start`、`thread/resume`、`thread/list`、`thread/read`、`thread/name/set`、`thread/archive` 与 `thread/delete` 访问线程，禁止直接读写这些内部文件或数据库。

工作区 `.madora` 只保存工作区元数据和资产，不保存 AI 消息。历史 `.madora/ai-sessions` JSON 方案已经废弃，不得重新引入，也不得为 Codex 会话维护第二份本地镜像。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。

Markweave 只接收 frontmatter 解析后的正文；保存时必须重新序列化受保护的 frontmatter。新上传资源的物理文件写入工作区根目录下的 `.madora/assets/files/{shard}/{hash}.{ext}`，Markdown 持久化引用统一使用 `madora-asset://{assetId}`。编辑器展示前通过工作区资产索引解析为受控本地 URL；旧 `.madora/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。

## Desktop Build Boundary

`scripts/stage-document-import-runtime.mjs` 在开发和构建前从锁定依赖复制 PDF Worker、CMap、标准字体、WASM、Tesseract Worker 与中英文模型到忽略版本控制的 `public/import-runtime`；任一源文件缺失都会使启动或构建失败。`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。

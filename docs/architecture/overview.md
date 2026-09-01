---
owner: refinex
updated: 2026-09-01
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Markune 是一个以本地 Markdown 文档为核心的桌面知识库，使用 Next.js App Router、React、TypeScript、Tauri v2 和 Markweave 构建。

## Runtime Shape

- Web shell：Next.js App Router 与 React client components。
- Editor：`components/editor/markdown-editor.tsx` 以非受控 `defaultContent` 包装 `@markweave/react@0.10.0` / `markweave@0.10.0`；Markweave 对正文执行一次 canonical whole-document parse，只有文本、选择、撤销、搜索与 TOC 完成 `ready` 后才开放编辑，视觉资源再按视口渐进补齐。编辑事务只保留惰性 payload 和 dirty 状态，完整 Markdown 字符串边界只位于 load/flush。源码模式动态加载 CodeMirror 6，Live/Source 切换只在边界互转一次。Slash 附件经 `onSlashCommandUpload` 写入工作区资产并以 `markune-asset://` 持久化，激活下载由 `onAttachmentDownload` 处理。
- Workspace shell：`components/workspace/workspace-layout.tsx` 管理文档树、编辑器标签、全文搜索、Git、终端、设置、文档元信息与 AI 侧栏。左侧顶部系统入口（笔记、日程、Inbox、画板、视图、图谱、Codex）由 `workspace-system-nav.tsx` 渲染，排列与折叠偏好写入全局 `appearance.systemNavLayout` / `appearance.systemNavCollapsed`；文档树“文件夹”标题切换到复用 `directory-page.tsx` 的工作区根级总览，根级文件夹卡片继续进入既有目录详情。
- Native boundary：前端经 `components/workspace/workspace-api.ts` 调用 Tauri 命令；实现位于 `src-tauri/src`。macOS 原生 `Markune` 菜单中的“设置…”（`⌘,`）与“检查更新…”只发出前端事件：前者复用现有设置页，后者打开“版本”并调用既有 updater 检查，不创建第二个设置窗口，也不自动安装更新。`window_chrome.rs` 只读取 macOS AppKit 红绿灯在 WKWebView 中的垂直中心数值，使 Web 标题栏控件不依赖构建 SDK 的固定偏移；`window_opacity.rs` 通过 macOS AppKit 或 Windows 分层窗口接口调整整个原生窗口的合成透明度，Web 页面不使用 CSS `opacity` 模拟该能力。
- Codex runtime：`components/workspace/codex-app-server.ts` 只消费协议消息；`src-tauri/src/codex.rs` 启动随应用打包的 Codex App Server sidecar，并通过 stdio JSONL 传递允许的方法、通知与审批请求。
- Local state：全局设置由 `src-tauri/src/settings.rs` 持久化；面板尺寸使用浏览器 local storage；AI 会话由 Codex App Server 存入用户级 Codex Home，不属于工作区状态。

## Brand Migration Boundary

当前品牌和持久化命名统一为 Markune：工作区私有目录为 `.markune/`，持久化协议使用 `markune-asset://`、`markune-drawing://`、`markune-import://` 与 `markune-export://`，应用标识为 `com.markune.app`，应用拥有的环境变量使用 `MARKUNE_*`。普通运行路径不再写入旧命名。

`src-tauri/src/brand_migration.rs` 是旧 Madora 数据的唯一兼容边界。`useWorkspace` 在加载工作区树和执行 `ensure_workspace` 前调用只读检查；发现仅有 `.madora/` 时展示阻断弹窗，用户明确确认后才调用迁移命令。迁移先拒绝符号链接和 `.madora/` / `.markune/` 并存冲突，为受控 Markdown、MDX、JSON 与 Excalidraw 文件创建原文备份和 SHA-256 清单，再把目录改名并只替换应用拥有的协议、标记和私有路径。逐文件原子替换失败时恢复已修改文件和旧目录。普通正文中的 Madora 品牌文字保持原样。

完成工作区事务后，迁移命令会以不覆盖 Markune 现有状态为前提，尝试复制旧应用设置、Codex provider 配置和 keyring 凭据；这些用户级附属迁移失败只产生警告。浏览器 local storage 使用相同的“目标不存在才复制”规则迁移 `madora:` key。成功备份保存在 `.markune/migrations/brand-rename/<migration-id>`；若备份目录移动失败，暂存目录仍保留并在报告中返回。

## Directory Tree Appearance Boundary

目录自定义外观只作用于目录节点，不改变文档图标、系统导航或文件系统名称。节点使用默认文件夹图标时不写显式外观；用户可选择离线打包的 Tabler 图标、单个 Emoji 或导入到当前工作区资产库的 SVG/PNG/WebP，并可独立设置语义预设色或六位 HEX。目录树与置顶区统一读取 `WorkspaceNode.appearance`，无效、缺失或仍在加载的图标回退到现有文件夹图标。

工作区级权威状态保存在 `.markune/workspace.json` 的 `nodeState[relativePath].appearance`，随目录重命名和移动一起重写相对路径，删除目录时清除对应前缀。全局 `appearance.treeIconPicker` 只保存选择器最后标签和最多 20 个最近使用项，不保存节点选择。本地图标继续使用内容寻址的 `.markune/assets` 存储；外观切换、恢复默认或目录删除后，只有不再被 Markdown、Inbox 或其他目录外观引用的旧资产才会清理。

## Main Modules

- `app/`：Next.js 页面与 API 路由。
- `components/editor/`：Markdown 编辑器、frontmatter、目录与工作区资源上传。
- `components/workspace/`：工作区壳层、文档树、标签、搜索、Git、终端、设置和 Tauri API bridge。
- `components/ui/`：共享 UI 原语。
- `src-tauri/src/`：资源、Git、设置、系统字体、终端与工作区文件系统命令。

## Inbox Capture Boundary

Inbox 是工作区级快速捕获与分拣入口，不属于正式文档树、全局文档搜索或任务系统。每条 Capture 以独立 Markdown 文件保存在 `.markune/inbox/{capture-id}.md`，正文继续复用 Markdown 编辑器和工作区资产能力；列表、搜索和未处理徽标直接从这些文件计算，不修改 `.markune/workspace.json` schema。

前端由 `use-inbox-controller.ts` 统一持有列表、选中项、新建草稿与保存状态，`inbox-sidebar.tsx` 复用左侧目录树区域承载紧凑列表、状态筛选、局部搜索、状态行右侧的新建入口和分拣菜单，`inbox-page.tsx` 只保留无标题栏的 Markdown 编辑器。新建时先在主编辑区建立临时草稿，空白草稿不写盘，首个非空正文通过自动保存创建 Capture。Capture 的历史标签仍按原样保留在 Markdown frontmatter 与接口中以保证兼容，但 Inbox v1 不提供标签交互。工作区头部搜索入口统一打开全局文档与图稿搜索，Inbox 查询只由其侧栏内部的局部搜索框控制。原生边界集中在 `src-tauri/src/inbox.rs`：通用 Markdown 命令继续拒绝 `.markune`，Inbox 命令只接受受格式约束的 Capture ID，并在 canonicalize 后访问 `.markune/inbox/<id>.md`。Promote 和 Append 作为 Rust 组合操作完成；Daily 追加使用 `<!-- markune-capture:<id> -->` 防止重复，并在 Capture 留痕保存失败时恢复本次追加。

Capture 的持久状态仅为 `open`、`processing`、`done`、`archived`。Inbox 不再提供新增 snooze 的交互；历史 Capture 中未来的 `snoozedUntil` 仍在读取后的视图层派生为“稍后”，并提供“恢复待处理”清除该字段，无需后台迁移。提升后的 Note 与追加后的 Daily 都是正式 Markdown 文档，Capture 本身保留为已处理记录。

## Daily Calendar Boundary

Daily 是工作区级日程总览，也是普通 Markdown 文档集合。顶部“日程”入口只切换到总览系统页，不创建或打开当天文件；左下角迷你日历继续作为具体日期的快捷入口，其展开状态与每周起始日由全局 `calendar` 设置统一控制，不保存到工作区。总览中的日期选择只更新选中状态，已有条目通过“打开详情”进入编辑器，空白日期必须显式选择“创建每日笔记”后才调用 `open_daily_note`。物理文件继续固定保存在 `Daily/YYYY/MM/YYYY-MM-DD.md`，不新增事件实体、数据库投影或会议日历语义。`Daily/` 根目录仍从普通文档树隐藏；单日导出不依赖树节点，而由日程检查器「导出」菜单与文档标签右键「导出」复用既有 `useDocumentExport` 管线（HTML / Markdown / PDF / Word），桌面端可用时才接线。

macOS 工作区壳层把全局 Chrome 工具与系统页工具分为两个不重叠的纵向区段：主标题栏高度由 `macChromeContentTop - WORKSPACE_PANEL_MARGIN` 计算，日程与视图页再以零偏移接续，因此它们的工具行可与侧边栏搜索入口共用水平中线，而不通过负外边距侵入全局按钮区域。工作区侧边栏保留原有外层宽度和折叠边界，内部内容以同一 `WORKSPACE_PANEL_MARGIN` 内缩为圆角、有边框的独立面板；macOS 顶部占位同步扣除该间距，使原生红绿灯与侧栏内容的绝对位置不变。置顶内容不占用顶部 Chrome，而是在目录树“文件夹”之前以默认折叠的内联区域呈现；标题切换到复用 `directory-page.tsx` 的置顶汇总页，右侧箭头单独控制展开，展开后可打开文档或目录并取消置顶。Windows 与 Web 继续使用原有固定标题栏高度。

Git Sync 由 `useGitAutoSync`（`components/workspace/use-git-auto-sync.ts`）统一调度：启动/切换工作区、周期定时、以及重新聚焦（去抖，默认 30s）三类触发都经过同一 in-flight 锁串行执行 `git_sync_now`，避免并发 git 进程；触发器只依赖稳定原语（enabled、intervalMs、activationKey），最新回调通过 ref 读取，因此频繁重渲染不会像旧实现那样反复清空并重排定时器导致自动同步在使用中几乎不触发。`git_sync_now`（`src-tauri/src/git.rs`）保持 fetch→提交本地→合并上游→push 的顺序并全程运行在 `spawn_blocking`，不占用 UI 线程；其返回值新增 `changedPaths`，只报告合并（pull）真正带入工作区的文件（排除刚提交的本地文件）。前端据此增量刷新受影响的树节点，并对命中变更的当前打开文档走冲突安全的外部重载路径，避免编辑器保留旧内存内容、被下一次自动保存回写而覆盖远端改动。默认冲突策略 `abort` 不自动改写数据，合并冲突时通过 toast 显著提示用户到 Git 面板处理。

`list_daily_notes_for_month` 在一次 Tauri 调用中扫描固定月份目录，并从当月 Markdown 正文派生有界标题、摘要、任务总数、完成数和最多三条任务预览；这些展示字段只存在于响应中，不写入 `.markune/workspace.json`。前端按请求序号忽略快速切月产生的过期响应，加载失败保留最近一次成功结果并提供显式重试。选中已有日期后，详情检查器通过既有 `read_markdown_document` 按需读取单篇正文并复用只读 Markdown 渲染器，不把整月正文带入月索引。检查器默认宽度为 420 px，可在 360–640 px 内通过鼠标或键盘调整并保存到浏览器 local storage；主内容宽度不足时检查器改为抽屉，不强制关闭已有 AI 或元信息面板。

## Knowledge Graph Boundary

图谱是工作区级只读 `systemPage`，入口位于左侧顶部导航。它不建立数据库、不修改 Markdown，也不把图布局写回工作区。`src-tauri/src/graph.rs` 在有界后台任务中一次扫描工作区 Markdown/MDX，跳过 `.markune`、`.git`、依赖和构建目录，只向渲染器返回相对文档路径、显示标题、节点类型、聚合边与有限警告；单篇文件、文档总数和关系总数都有硬上限。标准 Markdown `.md/.mdx` 链接与 `[[Wiki Link]]` 只在图谱读取层解析，后者不改变编辑器或持久化格式。节点包含普通笔记、`Daily/`、`Weekly/`、标签和 frontmatter 属性字段；`title`、`tags`、时间戳、`refinexDialect`、`aliases` 等系统字段不会生成属性中心节点。

`workspace-graph-page.tsx` 通过 `workspace-api.ts` 的单次 Tauri 调用取得快照，继续复用现有工作区树节点完成“打开文档”，不接受原生层返回的绝对路径或全文。`workspace-graph-canvas.tsx` 使用 D3 force/zoom/drag/quadtree 与单个高 DPI Canvas：物理模拟在数据或力参数改变时重启并自然停止，绘制由 `requestAnimationFrame` 合并，边按类型批量描画，标签只在缩放阈值以上且节点位于视口内时显示，命中检测使用四叉树。搜索只高亮并聚焦匹配节点；类型筛选和隐藏孤立节点只投影可见数组，不重新读取工作区。力参数、显示类型和标签阈值仅以工作区路径散列后的 key 保存在浏览器 local storage，不保存原始路径。

## Drawing Workspace Boundary

画板是独立于 Markdown 文档标签的工作区级 `systemPage`，“图稿”是 `whiteboard | mindmap` 的统一容器。入口固定在 Inbox 下方；激活后 `drawing-sidebar.tsx` 接管左侧目录区并展示系统集合、嵌套图集和图稿叶节点，`drawing-workspace-page.tsx` 在右侧切换图集总览、损坏恢复页、Excalidraw 白板或 Mind Elixir 脑图编辑器。图稿和图集的省略号菜单与右键菜单共用操作集合；图集创建和重命名使用与文档树一致的行内输入。现有 AI、终端和元信息面板保持用户原有开关状态，不因打开画板而强制关闭。

`use-drawing-controller.ts` 是图稿生命周期与串行保存的唯一前端控制器，内部只处理通用 `content`，`workspace-api.ts` 是唯一 Tauri bridge。Excalidraw 和精确锁定的 `mind-elixir@5.15.1` 分别通过 `next/dynamic` 按类型加载；普通 Markdown 与图库页面不加载编辑器运行时代码。Excalidraw 自托管样式与字体由 `scripts/stage-excalidraw-runtime.mjs` 复制到忽略版本控制的 `public/excalidraw-runtime`。脑图禁用第三方工具栏，保留节点编辑和受控右键菜单，由 Markune 显式同步明暗主题并在卸载时销毁实例。白板固定 `zh-CN`、禁用远程 embeddable，HTTP(S) 外链经 Tauri opener 打开；脑图不接受 HTML、链接、图片或任意节点样式。

权威图稿保存在 `.markune/drawings/albums/<album>/<drawing-id>` bundle。白板内容为 `scene.excalidraw` / `scene.backup.excalidraw`，脑图内容为 `mindmap.json` / `mindmap.backup.json`，两者共用 schema-v2 `meta.json`、元数据备份和可选预览；schema-v1 白板只读归一化为 `whiteboard`，下一次成功保存建立备份后惰性升级，不批量改写工作区。预览优先保存为 `preview.webp`，macOS WebView 无法编码 WebP 时兼容保存为 `preview.png`，同一 bundle 只保留当前格式。单幅图稿回收站位于 `.markune/drawings/.trash/<drawing-id>`，整图集回收记录位于 `.markune/drawings/.trash/albums/<trash-id>`。组件库与视口/最近图稿分别保存在 `library.excalidrawlib` 和 `ui-state.json`。图集路径由物理位置推导，稳定 Drawing UUID 是移动、重命名、搜索和 Markdown 回链的身份；复制整图集时所有图稿生成新 UUID。该目录不进入 `.markune/workspace.json`，也不会被伪装为 Markdown。

保存使用 800 ms debounce、最长 5 秒等待的串行事务：渲染器先取得 opaque save session，再通过 Raw IPC 暂存场景和可选 WebP/PNG 预览，Rust 在提交前重新校验 revision、场景结构和 SHA-256，并以原子替换保留上一份有效备份。预览失败不阻塞场景提交；冲突会暂停自动保存，只允许重新加载磁盘版本或显式覆盖。损坏 bundle 以独立异常卡展示，元数据仍可读时允许加载备份，不阻塞其余图稿。

全局搜索把图稿作为独立结果类型，索引标题、图集路径和 `meta.searchText`，不暴露绝对 bundle 路径。历史 `meta.tags` 字段只为存储兼容保留，不再提供编辑、展示或搜索入口。Markdown 引用使用内容寻址的静态 `markune-asset://<snapshot-id>` 预览与 `markune-drawing://<drawing-id>` 回链；复制时同时写入规范纯文本和只含受控资产图片的富文本。富剪贴板为适配编辑器图片解析，会临时使用保留的 `https://clipboard.markune.invalid/asset/<id>` 占位地址；宿主媒体 resolver 在本地解析它，并在任何保存前恢复为 `markune-asset://`，不会发起网络请求或持久化该占位地址。Markweave 编辑态把链接图片可逆投影为带回链 title 的图片节点，保存时恢复规范 Markdown，并兼容修复旧版 Live 粘贴产生的精确转义形式。编辑器只拦截经过 UUID 校验的图稿回链，保留 Markweave 既有 HTTP(S) 与 Ctrl/Cmd-click 语义。永久删除原图稿不删除已写入文档的静态快照。

## Multi-format Import Boundary

目录导入由 `components/workspace/use-document-import.tsx` 串行编排。Markdown、HTML、DOCX 和 PDF 都先转换为 `PreparedImportDocument`，再逐文件原子提交为 Markdown；批量任务允许部分成功，取消只回滚当前文件并保留已经提交的文档。Markdown/HTML 语义转换位于 `document-import-core.ts`，DOCX 先由 Mammoth 生成 HTML 后进入同一清洗管线，PDF 由 PDF.js 恢复结构和坐标阅读顺序，只对低文本页调用离线 Tesseract 中英文 OCR。PDF.js 解析和 Tesseract 识别使用各自本地 Worker，不依赖 CDN 或远程转换服务。

原生边界集中在 `src-tauri/src/import.rs`。文件选择器只返回 15 分钟有效的 opaque grant/source ID；源文件和内联资产通过 Raw IPC 读取或暂存，渲染器不取得绝对源路径。每个文档有独立 staging session，Rust 校验占位符、图片签名、路径边界和总量后散列去重资产，把 `markune-import://asset/{token}` 原子替换为 `markune-asset://{hash}`，最后写入唯一命名的 `.md`。失败时清理 staging、恢复本次新增且未被引用的资产；旧 Plate 导入命令不再属于运行时架构。

Markdown/HTML 相对图片只能从已授权源文档目录内读取；跨工作区 Markune 资产必须通过来源工作区索引重新解析、复制和散列。HTTP(S) 图片只保留链接并产生警告，不由导入器下载。

## Single-document Export Boundary

单文档导出由 `components/workspace/use-document-export.tsx` 统一编排。入口包括文档树右键/省略号菜单、日程检查器「导出」菜单，以及文档标签右键「导出」子菜单；上述入口只传入文档节点和格式。导出源按当前未保存草稿、已打开标签缓存、磁盘 Markdown 的顺序解析，继续保持 Markdown-first 边界。日程导出通过 `toDailyExportNode` 把 `DailyNoteEntry` 映射为最小 `WorkspaceNode`（文件名 stem 优先使用 `YYYY-MM-DD`），不因导出调用 `open_daily_note` 创建空文件，也不新增批量/整月导出协议。

`document-export-core.ts` 负责可移植 Markdown 资源包、只读 Markweave DOM 快照与静态 HTML 清理。DOM 快照必须先等待编辑器 `ready`，再调用 Markweave 0.10.0 官方 output barrier 强制 materialize 全文并等待图片、视频、Mermaid、数学、字体和稳定布局；barrier 报告的缺失、不可读与超时资源转为显式警告或占位，不能通过固定延时猜测完成。HTML 跟随当前主题并使用 64 rem 标准正文宽度；导出快照必须移除编辑器目录、工具栏、大文档 `content-visibility` 属性和其他运行时 UI，但保留正文语义与内联图片。`document-export-professional.ts` 是 Markune 方言到通用 Markdown 的受控适配层：本地资产只映射到 staging，相同的 frontmatter 标题/H1 去重，Wiki 链接转为可读文本，远程图片转为普通链接，已成功渲染的 Mermaid 预览转为静态 PNG。

Word 与 PDF 默认使用固定版本 sidecar：Pandoc 3.10.1 负责 Markdown AST、DOCX writer 和 Typst writer，Word 套用固定 `reference.docx`，PDF 再由 Typst 0.15.1 和固定 A4 模板排版。运行时缺失、平台没有可用中文字体或显式设置 legacy 开关时，Word 回退到 `document-export-word.ts` 的兼容 DOCX writer，PDF 回退到平台 WebView 原生打印；兼容链保留一个迁移周期，不作为继续堆叠专业排版能力的主线。HTML 不经过 Pandoc，文档导入仍维持 Mammoth/PDF.js 的现有安全与交互边界，避免在同一变更中重写成熟的批量导入提交协议。

原生边界集中在 `src-tauri/src/export.rs` 与 `document_converter.rs`。渲染器只能先取得一次性目录授权，再提交格式、文件 stem、规范化 Markdown 和相对资产；不能传入目标绝对路径、sidecar 路径、模板路径、过滤器或任意命令参数。专业转换在有界后台任务中执行，所有输入先写入随机 staging；Pandoc reader 先在 sandbox 中生成 AST，Rust 再把图片目标收敛为 staging 资产白名单，writer 才读取该安全 AST 和固定资源根。sidecar 只使用固定参数、内存上限与 45 秒超时，输出签名通过后再以 `create_new` 提交。兼容 PDF 的隐藏 WebView 只访问一次性 `markune-export://` 会话，完成、失败或超时后销毁。

## Codex AI Boundary

AI 面板是工作区级客户端，不在浏览器渲染器中运行 Node.js SDK，也不持有供应商 API key。Tauri 启动固定版本的 `codex app-server --listen stdio://`，账户登录、线程历史、模型目录、MCP、联网搜索、工具调用和文件变更由 App Server 提供。前端仅能调用 `src-tauri/src/codex.rs` 与受控的 `codex_provider.rs` 命令；通用 `config/read|write` 仍不在 allowlist。自定义 Responses 兼容端点由宿主写入 `CODEX_HOME/config.toml` 的固定 provider `markune_custom`，API Key 只进入 OS keyring，并在 sidecar 启动时注入进程环境变量 `MARKUNE_CODEX_PROVIDER_API_KEY`；渲染器、`settings.json`、localStorage 与日志不得保存明文 Key。ChatGPT OAuth 与自定义模式互斥，切换后需重启 App Server。会话消息、计划、命令、文件修改与 MCP 事件按协议到达顺序写入统一会话流；助手消息使用禁用原始 HTML 的 GFM 渲染。

Markweave 0.10.0 的 AI 预编辑由两条互补路径组成。可编辑的活动 Live 文档通过 `askAi` 启用编辑器内置入口，覆盖普通文本以及单元格、行、列、多单元格选区和整表；AI 面板通过活动 `MarkdownEditorHandle` 取得 `MarkweaveAiEditController`，仅对普通文本选区发起宿主驱动预编辑。Source、View、只读文档、Plan/AI 预览和隐藏缓存编辑器不发布可用 controller。两条路径都由 Markweave 持有临时差异、冲突检测、接受、舍弃、停止和一次 Undo；接受结果沿既有 `onUpdate`、500 ms 惰性 flush 与 Markdown 保存链路提交，不调用全量 `setContent`。

`components/workspace/codex-inline-ai.ts` 为每次预编辑创建独立的 Codex `ephemeral` 线程，使用当前模型和非 Plan 推理强度，固定 `:read-only + on-request + user`、禁用 Web Search 与 Environment。请求只包含用户指令和 Markweave 提供的目标 Markdown/表格结构，不附加当前会话、整篇文档、文档/图稿引用、附件、mention、Plugin、Skill 或 Goal。runner 只消费自己 thread/turn 的 `final_answer` 增量；AI 面板拒绝归约 ephemeral 或非当前可见线程事件。目标中止、冲突、文档/工作区切换和运行时退出会中断 turn，终态后 best-effort 删除线程；Rust 对 `ephemeral: true` 的 thread 不注入 Markune Drawing 动态工具。

AI 画图是宿主内的受控 Codex 能力，不接入远程 Excalidraw MCP UI。随应用打包的 `markune-diagram` Skill 负责检查当前或显式提及图稿、收敛单一视角、选择图型和质量 profile、编排 Mermaid，并根据预览最多修复两轮；Rust 在新线程中固定注入 `markune_drawing.inspect_drawing`、两类 preview 工具、`markune_drawing.apply_preview_to_active` 与 `markune_drawing.create_from_preview`，渲染器不能提供其他 dynamic tools。`inspect_drawing` 只接受当前 turn 已授权的 Drawing UUID，返回去除 files/blob 的有界元素结构和可选 PNG/WebP 预览。Mermaid 编译器只在工具调用时动态加载，成功结果必须是可编辑 Excalidraw 元素，SVG/image fallback 会作为失败返回；编译后按 `architecture | flow | default` profile 计算交叉、穿越节点、关系和分组预算、扇出、转折、逆向关系、重叠、标签裁切与画布比例，返回确定性的 grade、blockers 和 repair suggestions。预览按工作区和 turn 保存在前端内存中，最多 3 个且 10 分钟有效；未达 A 级或存在 blocker 的预览保留供模型检查，但应用和创建都必须失败关闭。模型只能提交 opaque `previewId`：活动图稿改写由 Rust 注入本 turn 绑定的 Drawing ID、kind 与 revision，前端再次校验后复用普通原子保存、备份和冲突机制；显式提及图稿始终只读。用户明确要求新建或副本、或没有活动图稿时才走 generated-create。

随应用打包的 `markune-mindmap` Skill 通过同一命名空间调用 `preview_mindmap { title, direction, root }`。`markune-diagram` 与 `markune-mindmap` 依靠互斥且有界的 description 参与 Codex 隐式 Skill 选择；AI 面板标题栏不固定插入任一绘图 Skill，用户仍可通过 `/` 显式选择。模型只提供递归 `topic/children`，编译器生成稳定节点 ID、Markune 主题和规范 Mind Elixir 数据；模型不能控制 ID、主题、样式、链接、图片、存储路径或目标图集。脑图 A 级门禁限制 80 个节点、6 层、每节点 8 个直接子节点和 48 字符标题，并拒绝重复内容与极端横向比例。每个 turn 与白板共用三次预览上限；活动脑图的改写应用到原图并重新载入编辑器，没有活动图稿或用户明确要求副本时才锁定宿主派生的目标图集并新建。

生成图稿继续复用 Drawing Raw IPC，但使用独立 generated-create session。场景与 PNG/WebP 预览完整暂存并通过 Rust 校验后，revision 1 bundle 才从 `.staging` 原子 rename 到当前普通图集或未归类根目录；任何失败都不创建空白 bundle。成功后前端刷新图稿库、切换到 Drawings system page 并打开结果，后续保存、备份、冲突和导出完全复用普通图稿流程。

Codex 运行时在工作区根目录就绪后后台预热，关闭右侧 AI 面板只隐藏视图，不卸载会话组件或终止 App Server。启动采用分层加载：App Server、账户与权限约束构成可发送消息的核心就绪条件，模型目录、线程历史、当前工作区的已安装插件与 Skill 在核心就绪后后台加载。Markune 不为输入框菜单预取或展示 MCP inventory。模型、历史、插件或 Skill 加载慢或失败都不得退回全屏“正在连接”状态，也不得阻塞使用服务端默认模型发送消息。用户在核心握手期间可以编辑并提交，提交操作等待同一个启动 Promise，核心成功后继续执行，失败时保留草稿并显示错误。

Codex 同时提供右侧紧凑面板和主工作区两种展示形态，但两者必须复用同一个持续挂载的 `AiPanel` 实例；从左侧固定的“Codex”入口进入主工作区时，只切换 presentation，不新建运行时、线程或消息状态，也不清空当前文档与已打开标签。主工作区中的文档动作先打开右侧只读预览检查器，不立即替换编辑器当前文档；预览优先使用当前未保存草稿或已缓存编辑器 session，否则通过既有 `readMarkdownDocument` 读取磁盘内容。用户只有显式选择“在编辑器中打开”时，才把该文档提升为普通编辑器标签。预览宽度只保存在浏览器 local storage，不属于工作区或 AI 会话状态。

会话渲染保留 App Server 的 `Turn -> Item` 层级。`agentMessage.phase=commentary`、工具活动、计划和上下文压缩组成可折叠的处理过程，`phase=final_answer` 保持为独立最终回答；未提供 phase 的旧消息按普通助手消息兼容。连续工具只在视图投影层分组，底层有序 item 不重排。命令输出增量、文件 patch、MCP progress、耗时、退出码和审批请求都更新原 item；历史恢复使用同一映射逻辑。内部 reasoning 不进入界面，命令输出只保留有界首尾预览，避免大输出占用无界内存。

用户提交采用本地乐观投递：通过同步输入校验后，前端立即把用户消息以 `sending` 状态写入当前会话投影、清空输入编辑区并恢复视口跟随，然后才等待核心运行时、当前文档或图稿 flush、`thread/start` 与 `turn/start`。消息快照包含原始文字、原子提及、附件元数据和预览；附件的 opaque 授权在 `turn/start` 被 App Server 接受前不能释放。预发送阶段任一步失败时，同一条消息转为 `failed`，错误显示在消息旁，并从快照恢复输入内容、提及和附件；不得回滚整段会话或把该错误重复写入全局 `runtimeError`。接受成功后消息关联真实 `turnId` 并转为 `sent`，此时才清理附件授权和预览。没有任何 item 的活动 turn 仍投影一个“正在处理，等待 Codex 响应”的空处理轨迹，首个 commentary、工具或流式回答到达后由同一 turn 轨迹自然接管，不创建第二个等待状态。

任务错误是会话协议状态而不是全局运行时错误。实时 `error` 通知按 `turnId` 保存结构化的 `message`、`additionalDetails`、`codexErrorInfo` 与 `willRetry`；`willRetry=true` 显示非终态的自动重试提示，后续 item、delta、plan 或 diff 进度会清除该提示。`turn/completed.status=failed` 以 `turn.error` 作为最终权威错误并显示红色卡片；`thread/read` 历史使用同一解析规则，旧失败 turn 缺少详情时使用统一兜底。界面只对已知错误类型提供中文摘要，原始字段保留在可展开、可复制的技术详情中。`runtimeError` 仅用于 App Server 启动、登录、线程控制和其他非消息投递操作，避免同一发送或 turn 错误在会话与面板底部重复展示。

上下文用量只消费 App Server 的 `thread/tokenUsage/updated`：输入框显示 `last.totalTokens / modelContextWindow`，累计的 `total.totalTokens` 不作为当前窗口占比。最新用量按 thread ID 保留在面板运行时内存中，用于线程恢复通知与界面切换，不写入 Markune 数据库、local storage 或会话副本。手动压缩只调用受控的 `thread/compact/start { threadId }`，并以 `contextCompaction` item 的 started/completed 生命周期展示状态；旧 `thread/compacted` 仅作完成兼容。自动压缩阈值及触发时机由 Codex Core 和 `model_auto_compact_token_limit` 配置所有，Markune 不创建第二套阈值、定时器或重试循环。

AI 文件修改以 App Server 事件为刷新事实源。`item/fileChange/patchUpdated` 只更新处理中预览；成功的 `item/completed(fileChange)` 才按路径合并并触发短延迟重读，`turn/completed` 再刷新目录树并复核所有已打开 Markdown 标签，以覆盖通过 shell 直接写盘但未形成 fileChange item 的情况。发送 turn 前必须先完成当前草稿保存，避免 Codex 读取旧磁盘内容。磁盘重读继续使用受工作区边界保护的 `read_markdown_document`，不增加通用文件监听或 Tauri capability。

当 Codex 写盘期间用户又修改了同一当前文档，Markune 不自动选择任一版本，也不继续自动保存：编辑器保留本地草稿并进入显式冲突状态，用户只能确认“加载 AI 版本”或“用我的版本覆盖”。完成 turn 的聚合 diff 优先生成确定性的“已编辑 N 个文件”摘要、净增删行数和可展开文件列表；Markdown 路径只有在已解析到当前工作区时才可点击。摘要不发起第二次模型调用，也不提供缺少 turn 快照保障的一键撤销。

工具组及技术详情默认折叠，只保留语义摘要、状态与耗时；执行失败不会自动展开详情，拒绝和待审批活动仍自动展开，用户手动 disclosure 状态不会被后续增量或完成通知重置。消息视口只在用户位于底部时跟随流式更新，用户上滚后显示轻量“回到最新消息”按钮；发送新消息或显式点击后恢复跟随。输入编辑区从紧凑高度开始随内容增长，并在达到面板合理上限后改为内部滚动。

历史恢复以 App Server 实际返回的 thread items 为上限。固定 sidecar `0.144.4` 的 `thread/read` 与 `thread/turns/list` 当前不会回放已完成 turn 的命令和其他工具 item，`thread/items/list` 也尚未实现；因此 Markune 可以恢复 commentary、最终回答和 App Server 返回的持久 item，但不能通过读取 Codex JSONL 或维护第二份日志补齐缺失的历史工具明细。升级 sidecar 后必须重新验证该投影能力。共享 `~/.codex` 中由更新版 Codex 写入的 `historyMode=paginated` 线程会让 sidecar 拒绝 `thread/read includeTurns=true` 和默认 `thread/resume`；前端必须降级为 `includeTurns=false` / `excludeTurns=true`，仍失败时自动恢复跳过该线程并显示中文说明，不得把 `paginated_threads is not supported yet` 变成未捕获运行时崩溃。

线程以当前工作区根目录作为 `cwd`，默认选择 Codex 命名权限配置 `:workspace`、`on-request` 审批策略和 `user` reviewer。用户可以切换为自动风险审查、`:danger-full-access`、`:read-only` 或 App Server 从 `config.toml` 返回的自定义 permission profile；模式切换统一走 `thread/settings/update`，后续 `turn/start` 不再重复覆盖线程权限。自动审查只改变审批 reviewer，不扩大 permission profile；完全访问必须经过显式风险确认，并固定为 `:danger-full-access + never + user`。

权限目录、企业要求和实验能力分别通过只读的 `permissionProfile/list`、`configRequirements/read` 与 `experimentalFeature/list` 发现。渲染器不能调用 App Server 的通用 `fs/*`、`command/exec`、`thread/shellCommand` 或通用配置读取/写入接口。命令、文件与权限升级 server request 由 Rust 保存服务端原始候选，前端只接收可展示的 opaque choice id；响应时 Rust 再映射回原候选，防止渲染器伪造 execpolicy、network policy、文件范围或权限对象。未知交互请求必须返回 JSON-RPC 错误并失败关闭，不能悬挂 turn。

文档上下文采用路径引用，不复制文档正文。活动文档身份只取自当前编辑器文档标签保存的物理绝对路径；frontmatter `title` 只作为可读元数据，不参与身份解析，输入框和欢迎提示展示工作区相对路径。发送前必须确认该标签路径已经成为工作区当前加载文档，否则阻止 turn，避免快速切换标签时保存或引用上一份文档。前端把显式 `@` 文档在模型文本中编码为带引号的工作区相对路径，并用 `text_elements.placeholder` 保留文档链接；同时把编辑器当前活跃文档标为 `active`、显式提及标为 `mention`，只通过 Markune 私有字段提交给 Tauri。Rust canonicalize 并验证路径后，将固定语义策略写入 `markune_document_context_policy`（`application`），将活跃文档写入 `markune_active_document`、其他显式引用写入 `markune_explicit_document_references`（均为 `untrusted`）。因此“当前文档/本文”只解析为该 turn 的活跃文档，不从 frontmatter 标题、日期、最近文件或会话历史猜测；没有活跃文档时显式发送 `null` 以清除 App Server 的粘性上下文。Codex 仅在请求依赖文档内容时通过正常工作区工具读取，因此读取动作仍进入原生工具时间线。

图稿上下文采用稳定 UUID，不复制原始 bundle。只有 Drawings system page 当前已加载的 descriptor 才能成为 `active`；发送 turn 前先 flush 画布，失败或 revision 冲突会阻止发送。`@` 菜单把图稿编码为 `markune-drawing://<uuid>` 文本并以 placeholder 保留标题，同时通过私有 `markuneDrawingReferences` 提交 active/mention 角色。Rust 从当前工作区重新解析非回收站 bundle，忽略前端标题和 revision，并将权威元数据分别写入 `markune_active_drawing` 与 `markune_explicit_drawing_references`（`untrusted`）。当前 turn 的 UUID 集合同时形成 `inspect_drawing` 临时授权；turn 完成、运行时退出、工作区切换或下一 turn 空引用都会清理。v1 只读理解来源图稿并创建新图稿，不增量覆盖当前场景。

文档树重命名以用户确认的新名称为统一显示身份：原生层移动物理 `.md` 文件并更新已有 frontmatter `title` 与首个 H1，前端随后刷新树节点、迁移已打开 Tab、编辑器 session 和最近文档路径。若展示标题已经等于目标名称、但物理文件 stem 仍不一致，仍必须执行重命名；只有物理 stem 与文档标题均已一致时才视为无操作。没有 frontmatter `title` 的外部 Markdown 不因重命名新增该字段。

任意本地文件、文件夹和剪贴板图片上下文必须经过 Tauri 原生附件入口。系统粘贴优先消费 Finder/Explorer 文件列表，否则读取系统位图并在 Rust 内存中编码为 PNG；现有选择器继续处理文件和文件夹，不启用窗口文件拖放。渲染器只取得 15 分钟有效的 opaque attachment ID、名称、类型、媒体类型、大小和预览标记，单次最多保留 20 个，不取得所选绝对路径。图片预览通过 Raw IPC 返回最长边 2048 px、最多 2 MiB 的重新编码 PNG；剪贴板位图不写工作区、临时目录、local storage 或资源协议。发送 turn 时 Rust 重新校验路径、修改时间、大小、内容签名、图片格式和像素预算：图片转换为 App Server 内联 `image` Data URL，使模型获得真实视觉输入；其他文件和目录按官方 `# Files mentioned by the user` 文本头编码，并用私有 `text_elements.placeholder` 保存历史展示元数据。历史投影可直接预览内联 `image`，旧 `localImage` 只显示无路径占位。附件授权不扩大 Codex permission profile；工作区外文件或目录的实际读取仍由 App Server 工具权限和审批决定。

插件入口在核心运行时就绪后使用固定 sidecar 的 `plugin/installed` 按当前工作区自动加载，每个运行时代际最多发起一次成功请求，只展示已安装、已启用且未被管理员禁用的插件；加载失败时只在菜单内提供重试。App Server 返回的 `composerIcon`、`logo` 与 `logoDark` 本地文件由 Rust 按响应请求 ID 建立精确路径授权，前端只能通过 `read_codex_plugin_icon` 读取当前插件清单声明的单个受支持图片；远程图标只接受 HTTPS。菜单按 composer、主题 logo、通用占位图标的顺序降级，单个资源失败不影响插件清单。授权在重新检测、运行时停止或工作区切换时失效，不扩大资源协议 scope。

选择插件会在编辑器插入带真实图标、视觉上不显示触发符的原子节点；生成模型文本时恢复 `@Plugin`，并在 `turn/start` 同时发送 `plugin://{id}` 原生 mention。图标字节只存在于当前输入视图，不写入 mention、消息历史或工作区。历史恢复继续依赖该 mention 与对应 UTF-8 `text_elements` 区间。

目标模式通过稳定功能发现结果中的 `goals` 开关启用，并完全复用 App Server 的线程 Goal：`thread/goal/set|get|clear` 负责创建、恢复、编辑、暂停、继续和清除，`thread/goal/updated|cleared` 是 UI 状态的权威来源。Markune 不复制 Goal 到工作区、local storage 或自建数据库，也不实现自动续跑循环；Codex Core 在目标处于 `active` 且线程满足空闲条件时负责继续，并在目标更新时把新 objective 注入运行中的 turn。首次创建目标仍先以普通用户消息启动 Default turn，再立即将同一文本登记为线程 Goal，因此附件、文档、插件和 Skill 输入沿用现有首轮消息协议，权限边界不变。目标状态条展示服务端 objective、生命周期和累计运行时间；编辑直接更新 objective，暂停、恢复和清除只调用对应线程接口。

计划模式通过实验接口 `collaborationMode/list` 发现固定 sidecar 的 `Plan` 与 `Default` 预设；不可用时只禁用入口，不阻塞普通对话。每个 `turn/start` 显式提交内置 collaboration mode，Plan 固定当前模型与 `medium` 推理强度，Default 使用恢复后的模型与强度，二者都不改变线程权限。Plan 是 Codex 的开发者指令约束，不是只读 sandbox；活跃 turn、审批或用户问题未完成时禁止切换。新建、恢复和重新打开线程均从 Default 开始，Markune 不为协作模式建立持久化镜像。

Plan turn 的 `item/plan/delta` 只用于流式展示，`item/completed` 的完整 `plan` item 是权威正文；`turn/plan/updated` 仍只表示执行检查清单。执行检查清单按 App Server 每次通知提供的完整快照覆盖，只在对应 turn 活跃时派生输入框上方的紧凑进度入口；Hover 临时展开、点击固定当前任务列表，turn 结束后入口立即消失，不写入历史或另建持久化状态。入口的当前步数来自 `pending`、`inProgress`、`completed` 状态，文件数与增删行仅聚合该活跃 turn 的 `turn/diff/updated` 和文件变更 item，不发起额外模型调用。

正式计划以渐隐摘要卡进入线程投影，并随 `thread/read` 恢复；卡片可复制完整 Markdown，或在主编辑区打开只读的内存 Plan 标签页。Plan 标签使用 `threadId + plan item id` 标识，只存在于当前工作区 UI，不调用文档读写 API、不进入最近文档，也不创建 Markdown 文件。仅实时完成且确实产出正式计划时显示客户端三选项：在原线程发送 `Implement the plan.`、把完整计划引导语作为新 Default 线程首条消息，或留在 Plan 继续补充；历史回放不自动弹出。计划正文仍由 App Server 写入共享 Codex Home，Markune 不创建计划文件或数据库副本。

`item/tool/requestUserInput` 是独立的 server request。Rust 将 1–3 个问题、自由输入或 2–3 个选项投影为 opaque ID，前端在输入框上方逐题收集答案，Rust 再映射回 App Server 原始 question ID 与 option label，使同一 turn 继续。兼容字段 `autoResolutionMs` 仍按固定 sidecar 的协议边界校验，但 Markune 不据此代替用户提交空答案；问题会持续等待用户选择。问题存在时普通发送被阻止但仍可中断 turn；`serverRequest/resolved`、interrupt 和运行时退出都会同时清理前端交互与 Rust pending 映射。

输入空白边界上的 `/` 会打开独立 Skill 面板。Skill 通过当前工作区单元素 `cwds` 的 `skills/list` 自动加载，只展示 enabled 项；`skills/changed` 作为失效信号触发强制刷新。选择项在输入框插入统一立方体图标和 display name，模型文本编码为 `$skill-name`，并额外发送 `{ type: "skill", name, path }` 原生输入。Rust 只授权最近一次关联 `skills/list` 响应中的精确名称与 canonical path，列表刷新、变更通知、运行时停止或工作区切换都会撤销旧授权。

提及候选只来自当前已加载的 Markdown 文档索引，并在前端按标题、文件名和工作区相对路径进行确定性的 Unicode 模糊排序。匹配同时识别忽略空格与常用路径分隔符的紧凑前缀；当前文档在真实命中后获得有限排序加权并显式标记，但不会压过更高等级的文本匹配；只有已显式插入输入框的文档从候选中排除。编辑器基于真实光标位置识别空白分隔的 `@token`，候选列表支持方向键循环选择、选中项就近滚动、Enter/Tab 确认和 Escape 关闭。固定 sidecar 虽提供通用 `fuzzyFileSearch`，但 Markune 不向渲染器开放该文件系统枚举接口，避免绕过文档索引和工作区路径边界。

Codex App Server 是 AI 会话持久化的唯一所有者。Markune 默认把 sidecar 绑定到共享的 `~/.codex`，允许的 `CODEX_HOME` 覆盖必须是工作区之外的既有绝对目录；该进程的 `sqlite_home` 固定为同一目录。Codex 管理 `sessions/**/*.jsonl` 会话记录、`session_index.jsonl` 追加索引和 SQLite 查询投影，Markune 只能通过 `thread/start`、`thread/resume`、`thread/list`、`thread/read`、`thread/name/set`、`thread/archive` 与 `thread/delete` 访问线程，禁止直接读写这些内部文件或数据库。

工作区 `.markune` 只保存工作区元数据和资产，不保存 AI 消息。历史 `.markune/ai-sessions` JSON 方案已经废弃，不得重新引入，也不得为 Codex 会话维护第二份本地镜像。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。

Markweave 只接收 frontmatter 解析后的正文；保存时必须重新序列化受保护的 frontmatter。停止输入 500 ms、手动保存、切换标签/模式、导出、AI 发送和应用退出统一调用 `flushDraft(reason)`；flush 才读取一次 `payload.markdown`、恢复图稿引用、更新 `updatedAt` 并进入原子保存，失败会中止后续动作并保留草稿。新上传资源的物理文件写入工作区根目录下的 `.markune/assets/files/{shard}/{hash}.{ext}`，Markdown 持久化引用统一使用 `markune-asset://{assetId}`。

正文 canonical 挂载不等待视觉资源解析。宿主按文档唯一资产 ID 发起解析波，每个 `resolve_workspace_assets` IPC 最多 2,048 项并合并全部分片；工作区级缓存最多保留 8 个 root、每个 8,192 个结果及共享中的请求。`resolved` 正结果有界复用，`missing` / `unreadable` 只负缓存 5 秒；Markweave 0.10.0 resolver request 的可选 `attempt` / `reason` 在 `retry`、`image-error`、`output` 或 `attempt > 1` 时强制重新校验，同一文档 750 ms 内的恢复请求合并，单个分片失败不污染其他分片或形成永久失败。

图片候选 URL 只有在真实 `<img load>` 后才算成功，resolver 返回本身不能提交成功缓存。图片仍由 Markweave NodeView 按视口调度；本地视频由 `markweave-video-media-bridge.ts` 在 DOM 层解析、超时、重试和响应 output barrier，只投影 `<video src>` 与 `data-media-state`，不修改 ProseMirror 文档、Markdown 或撤销历史。所有晚到结果都必须校验 Abort、工作区 generation 与当前持久化 source。旧 `.markune/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。资产存活扫描覆盖正式 Markdown 和 `.markune/inbox/*.md`，但不扫描 `.markune` 下其他私有 Markdown。

## Large-document Performance Boundary

Markune 的每次按键不得读取 `payload.markdown`、复制完整草稿到父级状态或产生资产 IPC。`?markunePerf=1` 开启脱敏诊断，`window.__MarkunePerformanceReport()` 返回仅含数量、耗时、原因和状态的 JSON；不得记录正文或路径。Markweave 0.10.0 以 canonical whole-document parse 保证完整 ProseMirror 语义，再通过复杂度分层、增量 TOC/搜索、视口协调、轻量媒体 NodeView、受控 `content-visibility` 和 output barrier 隔离结构就绪与视觉补齐；Markune 不恢复按 Markdown 文本块独立解析。工作区以 LRU 方式保留最近 3 个已打开文档的 EditorView；切换 Tab 只改变可见性和活动编辑器 ref，关闭或超过上限才销毁实例，文档版本键必须在 live draft 与缓存 session 之间保持稳定。依赖升级必须先核对 npm tarball、锁文件中的单运行时解析和 React/Vue 发布边界，再执行 Markune 的浏览器与真实桌面验收。

## Desktop Update Boundary

应用更新由 `components/workspace/use-app-update.ts` 统一持有状态：桌面启动 5 秒后自动检查，每 6 小时复查，并允许用户在设置页手动检查。检查到新版本只在左下角设置入口显示“更新”，不会自动下载；版本页以纯文本展示版本、日期和有界更新说明。用户明确选择安装后，工作区壳层先确认并 flush 当前 Markdown 与图稿，任一保存失败都取消安装。

`src-tauri/src/app_update.rs` 是唯一 updater 边界。固定 endpoint 和 minisign 公钥只由 release build 生成配置注入；渲染器不能提供 URL、公钥、请求头、代理、target、降级策略或安装参数。Rust 保存当前已检查的 `Update`，串行执行下载、验签和安装，并通过 Tauri Channel 返回有界进度。macOS 安装完成后由用户显式重启；Windows 使用 passive NSIS 流程。该能力不向 `capabilities/default.json` 增加 updater 权限。

`Refinex-Space/markune` 同时是源码、构建和 GitHub Releases 权威边界；GitHub Packages、`markune-site` 与 OSS 不参与桌面更新。`.github/workflows/release.yml` 在版本 Tag 上构建 macOS 两种原生架构和 Windows x64，以当前仓库内置 `GITHUB_TOKEN` 创建 Draft；维护者随后手工触发 `.github/workflows/publish-release.yml`，校验 Tag commit、9 个资产与 6 个 updater target 后才正式发布。客户端只读取当前仓库 latest Release 的 `latest.json`。当前 macOS 使用 ad-hoc 签名且不公证，Windows 不做 Authenticode；两者都不能替代强制的 updater minisign。生产发布与密钥操作遵循 `docs/guides/release-and-update.md`。

## Desktop Build Boundary

`scripts/stage-document-import-runtime.mjs` 在开发和构建前从锁定依赖复制 PDF Worker、CMap、标准字体、WASM、Tesseract Worker 与中英文模型到忽略版本控制的 `public/import-runtime`；任一源文件缺失都会使启动或构建失败。`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。

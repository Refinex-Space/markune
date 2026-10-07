---
owner: refinex
updated: 2026-10-07
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Markune 是一个以本地 Markdown 文档为核心的桌面知识库，使用 Next.js App Router、React、TypeScript、Tauri v2 和 Markweave 构建。

## Runtime Shape

- 应用外层 `html/body` 是固定视口，不承担滚动；正文、侧栏和浮层分别持有各自的滚动容器。`[[` 引用候选在挂到 `body` 之前必须设置初始绝对定位和零坐标，不能等 Floating UI 异步定位后才脱离文档流；键盘与鼠标选中候选时只调整候选容器的 `scrollTop`，不得对候选行使用会滚动祖先的 `scrollIntoView`。否则 WebKit 可在浮层挂载的短暂布局中滚动页面根节点，造成整个应用的视觉位置与后续点击发生偏移。
- Web shell：Next.js App Router 与 React client components。
- Editor：`components/editor/markdown-editor.tsx` 以非受控 `defaultContent` 包装 `@markweave/react@0.10.8` / `markweave@0.10.8`；Markweave 对正文执行一次 canonical whole-document parse，并在严格 Schema 校验前把混合 Markdown 段落中的块图片提升为有序兄弟节点，避免大文档因图片与相邻文本共处段落而加载失败。首次加载与后续 Markdown 更新共用同一规范化逻辑，图片开头的列表项保留必要首段落；无序列表与表格在需要时通过 HTML 回退保留块媒体结构。HTTP(S) 页面可以使用完整 Markdown lexer Worker，`tauri:` 等桌面自定义协议立即走同语义的主线程解析，避免 WKWebView 构造 Blob Worker 后静默等待超时。只有文本、选择、撤销、搜索与 TOC 完成 `ready` 后才开放编辑，视觉资源再按视口渐进补齐；`parsing`、`mounting` 与 `finalizing` 显示明确进度，加载失败时 Markune 保留本地正文并提供重新加载与源码模式恢复，不再显示无诊断白板。序列化遵循 GFM 词中下划线规则，标识符如 `doc_review_agent` 不再写成 `doc\_review\_agent`。编辑事务只保留惰性 payload 和 dirty 状态，完整 Markdown 字符串边界只位于 load/flush。源码模式动态加载 CodeMirror 6，Live/Source 切换只在边界互转一次。全局搜索、图谱和 AI 来源跳转通过 `revealLocation` 定位：Live 优先按标题锚点或正文行映射到视口，YAML `title` 命中映射到对应 H1；协调器未就绪或 `revealPosition` 尚未成功时由调用方重试，Live 下不得自动切源码。源码模式只保留用户已经处于源码时的行跳转。Slash 附件经 `onSlashCommandUpload` 写入工作区资产并以 `markune-asset://` 持久化，激活下载由 `onAttachmentDownload` 处理。
- Workspace shell：`components/workspace/workspace-layout.tsx` 管理文档树、编辑器标签、全文搜索、Git、终端、设置、文档元信息与 AI 侧栏。左侧顶部系统入口（笔记、日程、Inbox、画板、视图、图谱、Codex）由 `workspace-system-nav.tsx` 渲染，排列与折叠偏好写入全局 `appearance.systemNavLayout` / `appearance.systemNavCollapsed`；文档树“文件夹”标题切换到复用 `directory-page.tsx` 的工作区根级总览，根级文件夹卡片继续进入既有目录详情。
- Native boundary：前端经 `components/workspace/workspace-api.ts` 调用 Tauri 命令；实现位于 `src-tauri/src`。macOS 原生 `Markune` 菜单中的“设置…”（`⌘,`）与“检查更新…”只发出前端事件：前者复用现有设置页，后者打开“版本”并调用既有 updater 检查，不创建第二个设置窗口，也不自动安装更新。`window_chrome.rs` 只读取 macOS AppKit 红绿灯在 WKWebView 中的垂直中心数值，使 Web 标题栏控件不依赖构建 SDK 的固定偏移；`window_opacity.rs` 通过 macOS AppKit 或 Windows 分层窗口接口调整整个原生窗口的合成透明度，Web 页面不使用 CSS `opacity` 模拟该能力。安装后的桌面包通过 `bundle.fileAssociations` 把 `.md` / `.mdx` 登记为 `Alternate` 打开方式，不抢默认应用；`external_open.rs` 消费冷启动参数、macOS `RunEvent::Opened` 和 Windows 单实例转发，解析最近的 `.markune` / `.madora` 工作区后打开该文档，并压过“恢复最近工作区”。
- Codex runtime：`components/workspace/codex-app-server.ts` 只消费协议消息；`src-tauri/src/codex.rs` 启动随应用打包的 Codex App Server sidecar，并通过 stdio JSONL 传递允许的方法、通知与审批请求。
- 搜索/来源定位通过 `MarkdownEditor.revealLocation` 执行：Live 模式必须收到当前编辑器实例的 `ready` 才调用视口协调器，协调器存在本身不代表正文装载完成。文档版本、源码切换后的 Live 实例或加载重试更换时取消旧 reveal；忽略旧实例迟到的加载通知，并在异步定位返回时再次验证实例和请求归属，避免初次/分批装载覆盖搜索光标。未就绪返回 false，由现有有界重试继续等待，不以固定延迟猜测完成时间。定位后在 1.5 秒上限内等待协调器 idle、视觉任务清空和帧间稳定，核验目标是否仍处于可视区域；必要时仅校正滚动，不再次移动光标。用户 pointerdown/wheel/keydown 会中止定位并作为已处理返回，避免外层重试继续抢焦点。
- Local state：全局设置由 `src-tauri/src/settings.rs` 持久化；面板尺寸使用浏览器 local storage；AI 会话由 Codex App Server 存入用户级 Codex Home，不属于工作区状态。

## Terminal

桌面终端由 xterm.js 和 Rust `portable-pty` 组成，会话归原生进程所有。折叠面板只隐藏界面，不结束 shell；关闭标签、切换或移除工作区、销毁主窗口时结束对应进程组。输出按 UTF-8 流解码，避免读缓冲切开多字节字符。Shell 以交互参数启动，PowerShell 使用 `-NoLogo`，并在进入子进程前去掉凭据型环境变量。前端按最多 64 KiB 串行写入，非活动或已退出标签不接收键盘输入。进程自然退出后保留最后一屏并显示退出码，需要用户新建标签，不会自动重启。

## External Markdown Open Boundary

系统“打开方式”只覆盖 Markdown 文件，不注册目录、不注册任意文件类型、不把 Markune 设为默认处理器。`bundle.fileAssociations` 声明 `.md` / `.mdx`，`rank` 为 `Alternate`。Windows 由 NSIS 写入 OpenWithProgids；macOS 由生成的 `CFBundleDocumentTypes` 进入 Finder 打开方式。开发态 `tauri dev` 不会向系统登记关联，需安装包或显式把路径传给进程才能验收消费路径。

打开请求只来自操作系统：Windows/Linux 解析进程参数，macOS 额外监听 `RunEvent::Opened`。已运行实例通过 `tauri-plugin-single-instance` 聚焦主窗口并转发参数，不新开第二个工作区进程。渲染器只能 `take_external_open_request` 取出待处理请求，或监听 `markune-external-open`；不能提交任意路径让 Rust 打开。

解析在原生层完成：拒绝符号链接、非普通文件和非 Markdown 扩展名；向上查找最近的 `.markune/` 或旧 `.madora/` 作为工作区根；找不到则使用文件所在目录。位于工作区私有目录内的文件必须失败关闭。成功后前端复用现有 `loadWorkspace` / 文档标签打开流，品牌迁移阻断仍然有效。目录右键“用 Markune 打开”不属于当前边界。

## Brand Migration Boundary

当前品牌和持久化命名统一为 Markune：工作区私有目录为 `.markune/`，持久化协议使用 `markune-asset://`、`markune-drawing://`、`markune-import://` 与 `markune-export://`，应用标识为 `com.markune.app`，应用拥有的环境变量使用 `MARKUNE_*`。普通运行路径不再写入旧命名。

`src-tauri/src/brand_migration.rs` 是旧 Madora 数据的唯一兼容边界。`useWorkspace` 在加载工作区树和执行 `ensure_workspace` 前调用只读检查；发现仅有 `.madora/` 时展示阻断弹窗，用户明确确认后才调用迁移命令。迁移先拒绝符号链接和 `.madora/` / `.markune/` 并存冲突，为受控 Markdown、MDX、JSON 与 Excalidraw 文件创建原文备份和 SHA-256 清单，再把目录改名并只替换应用拥有的协议、标记和私有路径。逐文件原子替换失败时恢复已修改文件和旧目录。普通正文中的 Madora 品牌文字保持原样。

完成工作区事务后，迁移命令会以不覆盖 Markune 现有状态为前提，尝试复制旧应用设置、Codex provider 配置和 keyring 凭据；这些用户级附属迁移失败只产生警告。浏览器 local storage 使用相同的“目标不存在才复制”规则迁移 `madora:` key。成功备份保存在 `.markune/migrations/brand-rename/<migration-id>`；若备份目录移动失败，暂存目录仍保留并在报告中返回。

## Directory Tree Appearance Boundary

左侧目录树的文档名称只使用实际文件名去掉末尾 `.md` / `.mdx` 扩展名（大小写不敏感），保留 `01_` 等编号前缀，不采用 YAML frontmatter 的 `title` 或正文一级标题。目录树内的重命名初始值与删除确认沿用同一名称；文件名未改动或取消重命名不触发写入，即使文档内部标题不同。该规则只影响目录树展示与交互，不改变后端标题元数据及其他视图的标题来源。

目录定位请求按目标路径与请求序号消费一次，节点刷新不能再次展开或滚回旧目标。定位只调整 `data-workspace-tree-scroll-container` 的 `scrollTop`，不能用 `scrollIntoView` 滚动工作区外层或 WebView 根容器。

目录自定义外观只作用于目录节点，不改变文档图标、系统导航或文件系统名称。节点使用默认文件夹图标时不写显式外观；用户可选择离线打包的 Tabler 图标、单个 Emoji 或导入到当前工作区资产库的 SVG/PNG/WebP，并可独立设置语义预设色或六位 HEX。目录树与置顶区统一读取 `WorkspaceNode.appearance`，无效、缺失或仍在加载的图标回退到现有文件夹图标。

工作区级权威状态保存在 `.markune/workspace.json` 的 `nodeState[relativePath].appearance`，随目录重命名和移动一起重写相对路径，删除目录时清除对应前缀。全局 `appearance.treeIconPicker` 只保存选择器最后标签和最多 20 个最近使用项，不保存节点选择。本地图标继续使用内容寻址的 `.markune/assets` 存储；外观切换、恢复默认或目录删除后，只有不再被 Markdown、Inbox 或其他目录外观引用的旧资产才会清理。

## Directory Tree Sorting And Movement

目录树标题与“置顶”保持同一左边距，不显示前置折叠按钮。标题继续打开工作区总览；hover、键盘聚焦或菜单打开时显示更多按钮，提供根级新建、排序、刷新及“折叠所有文件夹”。后者收起各层子目录但保留根级列表。选中、当前项与 hover 共用缩进后的内容背景，不覆盖目录引导线；键盘焦点同样限制在内容区域。

排序偏好位于 `sortOrder.preferences`。缺失偏好的既有工作区保持手动顺序；新工作区采用名称升序、文件夹优先。每个目录可以覆盖上级规则；首次切换到手动时保存当前显示顺序，已有手动记录不会被自动排序覆盖。Rust 提供稳定的手动序号和独立文件系统时间，`workspace-tree-sort.ts` 是所有前端工作区视图的排序投影入口，按中文自然排序比较名称，不使用正文或 YAML 标题；未知时间始终排在后面。目录时间指其自身时间，不聚合后代文档。

`use-tree-controller.tsx` 统一鼠标、键盘和“移动到…”操作，拖动期间冻结显示节点并去重落点状态。文档行按上下半区插入，文件夹中央接收移入；展开目录下沿指向首个子项，子树末尾向左拖动才表达放到祖先目录之后。标题和底部空白接收根级放置，悬停 500 ms 展开，边缘滚动由动画帧驱动。自动排序目录不接收任意前后位置，不会隐式切换模式。多选采用 Cmd/Ctrl 点选、Shift 连选；方向键、Home/End、键入定位、F2、Shift-F10、Alt-上下移动及树内撤销提供键盘路径。

`workspace_tree.rs` 串行处理排序与移动，移除源节点后从实际兄弟列表解析插入两侧邻居，避免 rank 越位或碰撞。批量移动先检查整组选项的路径、同名冲突和锁定状态，再复用已有文档引用/附件事务逐项提交；外部变化导致中途失败时明确返回已完成项及错误，不声称跨文件批次原子性。节点、目录排序偏好和相对路径记录随应用内改名/移动同步，删除时清理。结果同步到打开标签、当前目录、近期文档与展开状态；迟到刷新不能覆盖移动后的快照。

撤销收据仅保存在当前进程内，并通过菜单与通知提供入口。同层排序撤销只恢复顺序，允许后续正文编辑；跨目录撤销检查移动内容的 SHA-256、目录清单、时间及原位置冲突，发现后续变化则拒绝覆盖。每个文件移动仍由已有移动日志保护；撤销不是正文历史或跨重启恢复机制。



设置页沿用独立侧栏与内容滚动容器，导航按“偏好设置 / 工作区 / 连接与应用”分组；内容列最大 840px，设置以细边框分组和左右对齐的紧凑行呈现。主题与正文宽度采用分段单选，支持方向键、Home/End 和可见焦点；当前分类通过 `aria-current` 标识。切换分类只复位设置内容容器的滚动位置，搜索框 Escape 只清空查询，不触发应用级快捷动作。

外观、日历、存储、Git Sync 和版本的原有设置值、缓存与保存边界保持不变；原 Codex 分区改为独立智能体安装与配置；透明度仍只在桌面端预览、提交时保存，字体列表继续支持搜索和当前值标记。浏览器预览不能代替原生透明度、系统字体枚举、登录和更新安装验收。

## Document Information Surface

文档元信息面板沿用设置页的细边框与紧凑行布局：直接展示文档信息、内容统计和 Frontmatter 分组，不重复展示文档标题块。字段值保持原样，较长键值在面板内换行。编辑／阅读使用显式选择按钮，点击当前模式不重复调用切换；未提供回调时均禁用。顶部元信息、资源、关联及可选来源使用 Radix Tabs，支持方向键与 Home/End；滚动限制在面板内容容器内，资源与关联继续复用原有组件与数据接口。

## Main Modules

- `app/`：Next.js 页面与 API 路由。
- `components/editor/`：Markdown 编辑器、frontmatter、目录与工作区资源上传。
- `components/workspace/`：工作区壳层、文档树、标签、搜索、Git、终端、设置和 Tauri API bridge。
- `components/ui/`：共享 UI 原语。
- `src-tauri/src/`：资源、Git、设置、系统字体、终端与工作区文件系统命令。

## Attachment Storage

全局 `storage.attachments` 决定新插入附件的保存位置：`managed` 默认保持 `.markune/assets/files` 与 `markune-asset://`；`document`、`assets`、`filename-assets` 和 `custom` 分别保存到文档目录、其 `assets/`、`${filename}.assets/` 或指定目录。普通图片、视频和文件上传使用同一位置策略；目录图标、图稿、Inbox 无正式文档上下文的附件及整篇文档导入仍使用内置资产事务。更改策略或恢复默认只改变后续行为，不迁移历史附件或重写正文。

`document_assets.rs` 接收已存在的 Markdown/MDX 文档路径，原生层从当前应用设置读取策略，不接受前端任意覆盖存储选项。普通文件通过 `create_new` 避免重名覆盖，Markdown 持久化为普通相对路径或 `file://` 地址，不加入内置 SHA 索引或无引用自动清理。已存在的内置资产继续使用原批量解析、稳定 ID 和清理规则；托管索引写入按工作区串行并原子提交，避免批量粘贴丢记录。

本地图片规则默认开启，网络图片规则默认关闭。已有本地路径可选择保留引用；剪贴板位图和无来源路径的 File 必须落盘。网络规则只作用于明确的粘贴/插入，不在文档打开或预览时批量下载。宿主补齐 Markweave 网络图片粘贴绕过上传回调的路径，只替换该次粘贴新插入且仍存在的图片节点；网络规则关闭时每次粘贴只读取一次设置，失败保留原 URL。图片和视频预览使用媒体 resolver，显示地址不写入 Markdown；普通文件解析按文档批量完成。

内置模式隐藏路径语法选项；指定目录输入只在 `custom` 下显示。相对路径默认开启，`./` 默认关闭；关闭相对路径后禁用 `./`，保留其选择但不生效。`${filename}` 使用真实文档文件名去扩展名，`./` 只添加在当前目录及其子目录引用前，跨 Windows 盘符回退绝对文件地址。

文档或目录移动时，以 `pulldown-cmark` 语法范围重算本地附件引用，保留代码示例、标题、引用定义和旧托管定位符，不移动共享附件。目录内资源随目录一起移动时映射到新位置；单篇文档改名保持旧资产目录与有效引用，后续上传使用新 `${filename}`。重写与普通保存共享文档锁，暂存提交前检查源内容，最终使用系统“不覆盖目标”的移动操作；失败仅恢复本次仍未被外部再次修改的内容。预览、附件下载与导出共用受授权的本地文件解析，导出将普通文件复制进原便携 sidecar/转换暂存流程。

## Workspace Refresh

目录右键刷新重建该目录及全部子目录的树描述，同时重读范围内已打开的 Markdown；文档右键刷新只复核该文档，树空白区域刷新复核全工作区及所有已打开标签。空白区域的菜单覆盖目录树剩余高度，提供刷新、新建文档、新建目录，两个创建动作以根目录为空父路径。折叠、搜索和行内重命名继续由现有树组件管理。

`workspace_watch.rs` 使用固定 `notify 8.2.0` 原生递归监听，由窗口持有会话，工作区切换和窗口销毁时释放。回调只累积失效路径，跳过树扫描排除的隐藏/依赖目录和自身暂存文件，不跟随符号链接；150 ms 静默窗口合并事件，最长等待 1 秒，最多 512 个路径，溢出或监听错误转为全量复核。监听不向渲染器提供文件正文，不扩大 Tauri capability。树扫描同样跳过符号链接，只有 `NotFound` 才解释为节点删除。

`use-workspace-refresh.ts` 合并原生、手动、AI、Git 拉取及 Daily 写入请求并串行运行，扫描期间到达的变化留待下一批；每批文档读取并发上限为 4。首次订阅后、窗口恢复可见/聚焦时补偿复核，可见期间每 30 秒复核一次，监听不可用时降级为每 3 秒复核、每 30 秒重试监听。切换工作区后丢弃迟到结果。目录扫描只读取文档头用于树描述，完整正文只读取已打开标签；不以 frontmatter 的 `updatedAt` 判断磁盘内容变化。

外部读取完成后，编辑器通过 `external-refresh` flush 把最新 Live/Source 输入移入内存草稿，该步骤不保存或重命名。磁盘正文等于已保存基线时保留本地输入、选区和 EditorView；正文变化才更新干净标签及其缓存。dirty、保存失败或已经冲突的草稿不会因重复刷新被覆盖。确认加载磁盘版本时重新读取当前文件，确认覆盖时仍校验展示给用户的外部基线。读取失败或文件删除只报告错误并保留编辑内容，不自动关闭标签。

保存同时校验 `expectedModifiedAt` 与可选 `expectedContent` 正文基线，同文档写入在原生层串行，提交前再次核对磁盘正文。原子写使用 `create_new` 随机暂存文件、保留权限并同步后替换，避免多个保存请求共用固定临时文件。普通文件 API 无法对不协作的外部写入者提供完全原子的版本比较与替换；网络文件系统、超大目录及各平台监听仍需真实环境验收。

## Inbox Capture Boundary

Inbox 是工作区级快速捕获与分拣入口，不属于正式文档树、全局文档搜索或任务系统。每条 Capture 以独立 Markdown 文件保存在 `.markune/inbox/{capture-id}.md`，正文继续复用 Markdown 编辑器和工作区资产能力；列表、搜索和未处理徽标直接从这些文件计算，不修改 `.markune/workspace.json` schema。

前端由 `use-inbox-controller.ts` 统一持有列表、选中项、新建草稿与保存状态，`inbox-sidebar.tsx` 复用左侧目录树区域承载紧凑列表、状态筛选、局部搜索、状态行右侧的新建入口和分拣菜单，`inbox-page.tsx` 只保留无标题栏的 Markdown 编辑器。新建时先在主编辑区建立临时草稿，空白草稿不写盘，首个非空正文通过自动保存创建 Capture。Capture 的历史标签仍按原样保留在 Markdown frontmatter 与接口中以保证兼容，但 Inbox v1 不提供标签交互。工作区系统入口中的全局搜索统一打开文档与图稿搜索，Inbox 查询只由其侧栏内部的局部搜索框控制。原生边界集中在 `src-tauri/src/inbox.rs`：通用 Markdown 命令继续拒绝 `.markune`，Inbox 命令只接受受格式约束的 Capture ID，并在 canonicalize 后访问 `.markune/inbox/<id>.md`。Promote 和 Append 作为 Rust 组合操作完成；Daily 追加使用 `<!-- markune-capture:<id> -->` 防止重复，并在 Capture 留痕保存失败时恢复本次追加。

Capture 的持久状态仅为 `open`、`processing`、`done`、`archived`。Inbox 不再提供新增 snooze 的交互；历史 Capture 中未来的 `snoozedUntil` 仍在读取后的视图层派生为“稍后”，并提供“恢复待处理”清除该字段，无需后台迁移。提升后的 Note 与追加后的 Daily 都是正式 Markdown 文档，Capture 本身保留为已处理记录。

## Daily Calendar Boundary

Daily 是工作区级日程总览，也是普通 Markdown 文档集合。顶部“日程”入口只切换到总览系统页，不创建或打开当天文件；左下角迷你日历继续作为具体日期的快捷入口，其展开状态与每周起始日由全局 `calendar` 设置统一控制，不保存到工作区。总览中的日期选择只更新选中状态，已有条目通过“打开详情”进入编辑器，空白日期必须显式选择“创建每日笔记”后才调用 `open_daily_note`。物理文件继续固定保存在 `Daily/YYYY/MM/YYYY-MM-DD.md`，不新增事件实体、数据库投影或会议日历语义。`Daily/` 根目录仍从普通文档树隐藏；单日导出不依赖树节点，而由日程检查器「导出」菜单与文档标签右键「导出」复用既有 `useDocumentExport` 管线（HTML / Markdown / PDF / Word），桌面端可用时才接线。

macOS 工作区壳层把全局 Chrome 工具与系统页工具分为两个不重叠的纵向区段：主标题栏高度由 `macChromeContentTop` 计算（`WORKSPACE_PANEL_MARGIN` 为 0，壳层贴齐窗口四边），日程与视图页再以零偏移接续，其工具行与侧栏标题区对齐，而不通过负外边距侵入全局按钮区域。工作区侧边栏保留原有外层宽度和折叠边界；侧栏、主编辑区和右侧面板共同放入同一外壳并贴齐窗口，面板之间用 1px 分隔线紧密衔接，不再各自作为独立卡片，也不再保留外壳内边距或外圆角。全局搜索是系统入口的第一项，位于笔记之前；工作区切换与设置共用侧栏底栏，设置只保留行尾图标，菜单向上展开，底栏、日历与系统入口之间不再用横线分隔，紧凑工作区切换也不再显示下拉箭头。左侧栏及左侧拖拽条位于 `workspace-content-region` 之外；该常驻的 `relative` 容器只包裹主编辑列、右侧拖拽条和右侧面板，使 Codex 全宽层的横向定位范围不包含侧栏。展开或折叠侧栏会重新分配主内容宽度，不重挂 AI 面板。主编辑列使用 `relative z-0` 形成独立层叠上下文，避免文档编辑器 `absolute inset-0 z-10` 实例盖住左侧宽度拖拽条；右侧拖拽条仍位于编辑列之后，不受影响。macOS 顶部占位等于 `macChromeContentTop`，使原生红绿灯与侧栏内容的绝对位置不变。置顶内容不占用顶部 Chrome，而是在目录树“文件夹”之前以默认折叠的内联区域呈现；标题切换到复用 `directory-page.tsx` 的置顶汇总页，右侧箭头单独控制展开，展开后可打开文档或目录并取消置顶。Windows 与 Web 继续使用原有固定标题栏高度。

Git Sync 由 `useGitAutoSync`（`components/workspace/use-git-auto-sync.ts`）统一调度：启动/切换工作区、周期定时、以及重新聚焦（去抖，默认 30s）三类触发都经过同一 in-flight 锁串行执行 `git_sync_now`，避免并发 git 进程；触发器只依赖稳定原语（enabled、intervalMs、activationKey），最新回调通过 ref 读取，因此频繁重渲染不会像旧实现那样反复清空并重排定时器导致自动同步在使用中几乎不触发。`git_sync_now`（`src-tauri/src/git.rs`）保持 fetch→提交本地→合并上游→push 的顺序并全程运行在 `spawn_blocking`，不占用 UI 线程；其返回值新增 `changedPaths`，只报告合并（pull）真正带入工作区的文件（排除刚提交的本地文件）。前端据此增量刷新受影响的树节点，并对命中变更的当前打开文档走冲突安全的外部重载路径，避免编辑器保留旧内存内容、被下一次自动保存回写而覆盖远端改动。默认冲突策略 `abort` 不自动改写数据，合并冲突时通过 toast 显著提示用户到 Git 面板处理。

`list_daily_notes_for_month` 在一次 Tauri 调用中扫描固定月份目录，并从当月 Markdown 正文派生有界标题、摘要、任务总数、完成数和最多三条任务预览；这些展示字段只存在于响应中，不写入 `.markune/workspace.json`。前端按请求序号忽略快速切月产生的过期响应，加载失败保留最近一次成功结果并提供显式重试。选中已有日期后，详情检查器通过既有 `read_markdown_document` 按需读取单篇正文并复用只读 Markdown 渲染器，不把整月正文带入月索引。检查器默认宽度为 420 px，可在 360–640 px 内通过鼠标或键盘调整并保存到浏览器 local storage；主内容宽度不足时检查器改为抽屉，不强制关闭已有 AI 或元信息面板。

## Knowledge Graph Boundary

图谱是工作区级只读 `systemPage`，不建立数据库、不修改 Markdown、不持久化布局。默认读取复用 `workspace_index.rs` 的增量关系投影；`graph.rs` 负责节点/边构建和图谱预算，`graph_parse.rs` 复用 pulldown-cmark 解析正文，`graph_metadata.rs` 在 YAML 展开成本检查后读取 frontmatter，`graph_resolve.rs` 负责文件身份解析。单篇 4 MiB、文档 50,000、目录条目 200,000、深度 64、关系 200,000、辅助节点 20,000、图谱关系投影 32 MiB。独立限额扫描还限制每次读取 128 MiB；默认共享索引的正文缓存为 32 MiB、属性/关系模型预算为 128 MiB。跳过隐藏目录/文件、依赖/构建目录、符号链接及非普通文件。不可读或超限文档保留文件节点并标为内容未完整索引，警告最多 20 条。

关系以文件为身份，`file:<relativePath>` 与 `tag:`、`property:`、`unresolved:` 分开。标准 Markdown 行内/引用式链接按文档目录解析，`/` 开头按工作区根解析；Wiki 带目录路径从根解析，显式 `./`、`../` 按当前目录解析，裸文件名先同目录再查全局唯一文件名。Markdown URL 严格百分号解码，Wiki 保留字面百分号；标题和别名只供显示，`[[文件|显示名]]` 的目标始终是文件部分。支持无扩展名、标题/块锚点、Wiki 文档嵌入及编辑器保存的 `markweave://doc/…` 相对引用。路径越界和附件/目录引用不生成文档关系，限定目录查找失败不回退同名文件；不确定目标保留为“未解析”，不会提供打开操作。Wiki 允许唯一的不区分大小写匹配，标准 Markdown 路径采用精确大小写。

图谱先执行严格 YAML 解析。仅在语法解析失败且文档明确含 `refinexDialect: 1` 时，允许在内存中为单个未加引号的 `title` 补上字符串引号，再重新执行全部解析与资源限制；不写回文件、不改写其他字段、不覆盖有效 YAML 别名语义。无法恢复的语法错误报告 frontmatter 行、列；递归与展开超限不能因兼容处理而绕过。

代码、数学内容、HTML 注释/块和 `%%` 注释不建立关系。正文标签与 YAML 标签合并并按大小写去重，保留 `topic/sub` 层级；YAML 标量标签继续兼容已有 Markune 数据。非系统 frontmatter 字段中的显式链接参与引用，属性辅助层仅聚合同名字段，不投影任意属性值；属性字段默认隐藏。普通笔记、`Daily/`、`Weekly/` 是文件节点分类。双向引用保留为两条有向边，`weight` 表示单方向出现次数；`degree` 是唯一邻居数，`inDegree` / `outDegree` 是文档引用的唯一来源/目标数，过滤后重新计算。

`workspace-graph-page.tsx` 复用完整工作区树打开文档（包含 Daily），不接受原生绝对路径或全文。工作区统一刷新队列完成树同步后更新图谱版本，当前图谱页合并 300 ms 内变化并串行读取；过期请求不覆盖新工作区，失败保留上次快照。原生 `fingerprint` 只反映图谱事实变化，相同快照不重启 Canvas。当前仍是有界全量扫描，不是常驻增量索引。

Canvas 继续使用 D3 force/zoom/drag/quadtree、高 DPI 与合并绘制；更新时复用存活节点坐标和缩放/平移，双向边共用一条物理约束。文档节点大小随唯一入链数变化，引用可显示方向箭头，暗色节点使用独立颜色。详情分批显示邻居并区分引用方向、次数和归属；筛选不读取磁盘。显示偏好仍按工作区路径散列后的 local storage key 保存，既有显式偏好保留，恢复默认关闭属性字段、启用未解析节点和方向箭头。

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

`document-export-core.ts` 负责可移植 Markdown 资源包、只读 Markweave DOM 快照与静态 HTML 清理。DOM 快照必须先等待编辑器 `ready`，再调用 Markweave 0.10.4 官方 output barrier 强制 materialize 全文并等待图片、视频、Mermaid、数学、字体和稳定布局；barrier 报告的缺失、不可读与超时资源转为显式警告或占位，不能通过固定延时猜测完成。HTML 跟随当前主题并使用 64 rem 标准正文宽度；导出快照必须移除编辑器目录、工具栏、大文档 `content-visibility` 属性和其他运行时 UI，但保留正文语义与内联图片。`document-export-professional.ts` 是 Markune 方言到通用 Markdown 的受控适配层：本地资产只映射到 staging，相同的 frontmatter 标题/H1 去重，Wiki 链接转为可读文本，远程图片转为普通链接，已成功渲染的 Mermaid 预览转为静态 PNG。

Word 与 PDF 默认使用固定版本 sidecar：Pandoc 3.10.1 负责 Markdown AST、DOCX writer 和 Typst writer，Word 套用固定 `reference.docx`，PDF 再由 Typst 0.15.1 和固定 A4 模板排版。运行时缺失、平台没有可用中文字体或显式设置 legacy 开关时，Word 回退到 `document-export-word.ts` 的兼容 DOCX writer，PDF 回退到平台 WebView 原生打印；兼容链保留一个迁移周期，不作为继续堆叠专业排版能力的主线。HTML 不经过 Pandoc，文档导入仍维持 Mammoth/PDF.js 的现有安全与交互边界，避免在同一变更中重写成熟的批量导入提交协议。

原生边界集中在 `src-tauri/src/export.rs` 与 `document_converter.rs`。渲染器只能先取得一次性目录授权，再提交格式、文件 stem、规范化 Markdown 和相对资产；不能传入目标绝对路径、sidecar 路径、模板路径、过滤器或任意命令参数。专业转换在有界后台任务中执行，所有输入先写入随机 staging；Pandoc reader 先在 sandbox 中生成 AST，Rust 再把图片目标收敛为 staging 资产白名单，writer 才读取该安全 AST 和固定资源根。sidecar 只使用固定参数、内存上限与 45 秒超时，输出签名通过后再以 `create_new` 提交。兼容 PDF 的隐藏 WebView 只访问一次性 `markune-export://` 会话，完成、失败或超时后销毁。

## ACP Agent Boundary

当前智能体架构见 [ACP Agent Host](agents.md) 与 [供应商支持矩阵](agents-support.md)。React 使用官方 ACP SDK，Tauri 管理独立安装版本、stdio、认证终端、窗口与会话归属、受限文件/终端及 Markune MCP。聊天侧栏和工作区全屏继续复用同一个面板实例，壳层侧边栏状态保持独立。

应用不再捆绑或默认启动固定 Codex App Server，不枚举或恢复旧 Codex 历史。Markune 新会话索引位于应用数据目录，只有原生登记的本应用会话可恢复；每个会话绑定供应商、安装版本和工作区。模型和模式按协议能力呈现，原有文件锁定、编辑器 flush、绘图质量与原子应用边界继续有效。供应商自己的系统权限和沙箱由其 CLI 管理，ACP 不是安全隔离层。

## Storage And Editor Boundary

持久化文档始终为 Markdown 文件。磁盘格式、内存草稿和编辑器输入/输出必须保持 Markdown 字符串边界，禁止重新引入富文本投影层。文档标题元数据来自文件头 frontmatter 或 H1，读取时收起词中 `\_`，与 Markweave 0.10.4 的 GFM 序列化规则对齐；左侧目录树另按实际文件名显示。

编辑器内引用卡片单击、Live 模式 Ctrl/Cmd 点击文档链接及 View 模式普通点击文档链接通过带工作区根的 `markune:preview-document` 事件打开右侧只读抽屉，不切换主文档或定位目录。`document-reference-drawer.tsx` 仅解析当前工作区索引中的目标，复用 `AiDocumentPreview`，优先显示已打开文档的内存草稿，保留锚点定位、加载失败重试与迟到响应隔离。预览中的引用继续在同一个抽屉显示；只有标题栏带 tooltip 的“在编辑器中打开”按钮才经过现有保存、打开和定位流程，失败保留抽屉并提示。

引用抽屉覆盖编辑区右侧，不使用模态遮罩、body 滚动锁或主界面 transform；默认宽度为编辑区的三分之一，常规最小 320px、最大不超过 960px 和编辑区的 75%，窄窗口同步收缩边界。宽度比例只保留在当前挂载会话内，支持拖拽、方向键及 Home/End；Escape 或关闭按钮退出预览。共享尺寸手柄在 pointercancel、窗口失焦或卸载后释放拖拽状态与 body 光标、文本选择样式。

受控 `title` 写入必须按 YAML 字符串转义，前端 `markdown-frontmatter.ts` 与原生 `document_frontmatter.rs` 保持同一规则；加粗标记、冒号、引号、反斜杠、换行、数字或布尔样式标题不能直接插值进 YAML。重新读取时解码 JSON 兼容双引号和 YAML 单引号，避免转义字符泄漏到树标题。普通标题保持原有简洁表示，未知字段不因标题修复被整体重写。

Markweave 只接收 frontmatter 解析后的正文；保存正文时必须复用 frontmatter 原文，只为明确改变的字段修改值区间。停止输入 500 ms、手动保存、切换标签/模式、导出、AI 发送和应用退出统一调用 `flushDraft(reason)`；flush 才读取一次 `payload.markdown`、恢复图稿引用、更新已有 `updatedAt` 并进入原子保存，失败会中止后续动作并保留草稿。默认内置存储把新资源写入 `.markune/assets/files/{shard}/{hash}.{ext}`，Markdown 使用 `markune-asset://{assetId}`；用户选择其他附件存储模式时使用既有普通文件引用与授权边界。

正文 canonical 挂载不等待视觉资源解析。宿主按文档唯一资产 ID 发起解析波，每个 `resolve_workspace_assets` IPC 最多 2,048 项并合并全部分片；工作区级缓存最多保留 8 个 root、每个 8,192 个结果及共享中的请求。`resolved` 正结果有界复用，`missing` / `unreadable` 只负缓存 5 秒；Markweave 0.10.4 resolver request 的可选 `attempt` / `reason` 在 `retry`、`image-error`、`output` 或 `attempt > 1` 时强制重新校验，同一文档 750 ms 内的恢复请求合并，单个分片失败不污染其他分片或形成永久失败。

图片候选 URL 只有在真实 `<img load>` 后才算成功，resolver 返回本身不能提交成功缓存。图片仍由 Markweave NodeView 按视口调度；本地视频由 `markweave-video-media-bridge.ts` 在 DOM 层解析、超时、重试和响应 output barrier，只投影 `<video src>` 与 `data-media-state`，不修改 ProseMirror 文档、Markdown 或撤销历史。所有晚到结果都必须校验 Abort、工作区 generation 与当前持久化 source。旧 `.markune/assets/files/...` 引用保持只读兼容，并在成功解析后的下一次保存中规范化为协议引用。资产存活扫描覆盖正式 Markdown 和 `.markune/inbox/*.md`，但不扫描 `.markune` 下其他私有 Markdown。

## Large-document Performance Boundary

Markune 的每次按键不得读取 `payload.markdown`、复制完整草稿到父级状态或产生资产 IPC。`?markunePerf=1` 开启脱敏诊断，`window.__MarkunePerformanceReport()` 返回仅含数量、耗时、原因和状态的 JSON；不得记录正文或路径。Markweave 0.10.4 以 canonical whole-document parse 保证完整 ProseMirror 语义，再通过复杂度分层、增量 TOC/搜索、视口协调、轻量媒体 NodeView、受控 `content-visibility` 和 output barrier 隔离结构就绪与视觉补齐；Markune 不恢复按 Markdown 文本块独立解析。工作区以 LRU 方式保留最近 3 个已打开文档的 EditorView；切换 Tab 只改变可见性和活动编辑器 ref，关闭或超过上限才销毁实例，文档版本键必须在 live draft 与缓存 session 之间保持稳定。依赖升级必须先核对 npm tarball、锁文件中的单运行时解析和 React/Vue 发布边界，再执行 Markune 的浏览器与真实桌面验收。

## Desktop Update Boundary

应用更新由 `components/workspace/use-app-update.ts` 统一持有状态：桌面启动 5 秒后自动检查，每 6 小时复查，并允许用户在设置页手动检查。检查到新版本只在左下角设置入口显示“更新”，不会自动下载；版本页以纯文本展示版本、日期和有界更新说明。用户明确选择安装后，工作区壳层先确认并 flush 当前 Markdown 与图稿，任一保存失败都取消安装。

`src-tauri/src/app_update.rs` 是唯一 updater 边界。固定 endpoint 和 minisign 公钥只由 release build 生成配置注入；渲染器不能提供 URL、公钥、请求头、代理、target、降级策略或安装参数。Rust 保存当前已检查的 `Update`，串行执行下载、验签和安装，并通过 Tauri Channel 返回有界进度。macOS 安装完成后由用户显式重启；Windows 使用 passive NSIS 流程。该能力不向 `capabilities/default.json` 增加 updater 权限。

`Refinex-Space/markune` 同时是源码、构建和 GitHub Releases 权威边界；GitHub Packages、`markune-site` 与 OSS 不参与桌面更新。`.github/workflows/release.yml` 在版本 Tag 上构建 macOS 两种原生架构和 Windows x64，以当前仓库内置 `GITHUB_TOKEN` 创建 Draft；维护者随后手工触发 `.github/workflows/publish-release.yml`，校验 Tag commit、9 个资产与 6 个 updater target 后才正式发布。客户端只读取当前仓库 latest Release 的 `latest.json`。当前 macOS 使用 ad-hoc 签名且不公证，Windows 不做 Authenticode；两者都不能替代强制的 updater minisign。生产发布与密钥操作遵循 `docs/guides/release-and-update.md`。

## Desktop Build Boundary

`scripts/stage-document-import-runtime.mjs` 在开发和构建前从锁定依赖复制 PDF Worker、CMap、标准字体、WASM、Tesseract Worker 与中英文模型到忽略版本控制的 `public/import-runtime`；任一源文件缺失都会使启动或构建失败。`scripts/build-tauri-web.mjs` 在 Tauri 静态导出时临时移出 `app/api`，设置 `NEXT_OUTPUT=export`，运行 Web build 后在 `finally` 中恢复。改动此流程时必须同时验证 Web build 与桌面静态导出。


## Metadata Fidelity And Document Moves

`markdown-frontmatter-source.ts` 用固定 YAML 解析器维护原文与类型化属性两个视图。未改字段、注释、顺序、别名、块字符串、BOM 和 CRLF 不因正文保存重写；同形嵌套属性递归修改值区间，显式增删集合项只重排该集合并保留注释。无效 YAML 仍可查看和保存正文，但拒绝结构化字段修改。打开普通 Markdown 不补写 frontmatter/H1；只有原文已有 `title` / `updatedAt` 时普通编辑才更新对应系统字段。Source 编辑器把 CodeMirror 的 LF 坐标映射回原始换行，只替换发生编辑的区间，保存不会重建撤销栈。

重命名/移动由 `document_links.rs` 统一解析当前工作区的明确文档引用，并以移动前后 Lookup 保护目标身份。支持 Markdown、引用定义、Wiki、嵌入、HTML 文档链接和 `markweave://doc/`，同时重算移动文档中的普通附件路径。代码、注释、未解析/歧义引用和附件卡片不作为普通文档链接改写。原生更新根层 title 与正文 H1，保留 MDX 扩展名，大小写改名先验证同一文件系统条目并同步引用拼写；自动文件名同步使用保留标题的独立命令。模板复制只重定位副本的出链和附件，不修改模板或其他笔记。

移动先持有操作锁和受影响文件保存锁，校验文件清单/内容、目标不存在及文档锁定状态，再提交内容与 workspace.json，最后执行不覆盖目标的路径移动。`document_move_journal.rs` 在 `.markune/moves/<uuid>/` 临时记录原文副本和 SHA-256；该目录自带 Git 忽略规则。打开工作区或再次移动时检查中断记录：尚未移动则只回退仍匹配本次写入指纹的文件；最终路径移动已完成则清理记录。外部改动、损坏副本或路径异常不被覆盖，工作区保留可读且展示警告，后续移动暂停至现场检查。它不是笔记历史或回收站。

## Shared Knowledge Index And Views

`workspace_index.rs` 以路径、文件状态和 SHA-256 维护一个活动工作区缓存，文件监听及应用保存使对应路径失效；未变文件复用解析投影，文件清单变化才重新解析引用目标。分页传输变更文档和删除路径，最多 64 篇 / 16 MiB；最多保留 4 组未完成快照，切换根目录不破坏已开始的分页。超出正文缓存的文件按页读取并核对指纹；失败保留上一份前端摘要，下次从完整快照恢复。读失败负缓存 5 秒；强制刷新会重建受限模型。

前端 `use-workspace-knowledge.ts` 将正文送入 Worker 搜索索引，UI 只保留属性/关联摘要；Worker 不可用时复用相同算法。索引增删只更新相应倒排项，正文与词项按估算 128 MiB 预算分配，超限笔记保留标题/路径/属性检索并明确提示。高级条件包括路径、嵌套标签、属性、修改日期、笔记类型和精确短语；搜索结果、任务与关联上下文可定位原文行。未链接提及先检索至多 64 篇候选，再原生排除 YAML、代码、注释和已链接位置，不自动建边。局部图谱以文档链接做 1–3 层扩展，标签等辅助节点仅作为叶节点。

关联面板以索引中的文档标题呈现入链、出链和未链接提及，完整路径只用于悬停提示，同名笔记补充所在文件夹。上下文经有界 Markdown 纯文本转换，截断的链接目标不进入可见摘录；标题单行、摘录最多两行。提及查询保留 16 个检索名称和 64 篇候选上限，重复请求合并，文档切换后丢弃旧结果；列表每批显示 100 项，打开文档、行号和锚点仍沿用现有导航回调。

视图页复用同一索引提供文档列表和附件页，包含列、排序、分组与属性筛选。顶栏只有「文档」和「附件」，不再提供跨笔记任务或研究入口。筛选工具、布尔属性与从模板新建使用共享 `Select` 原语，避免原生 HTML `<select>` 在桌面端弹出系统菜单。文档列表无论是否分组都共用一张表和固定列宽，组标题作为跨列行插入，避免每组独立排列表格。`.markune/views.json` 只保存用户命名的视图配置，以指纹防止多窗口覆盖；笔记属性仍写回原 Markdown。属性修改使用全文预期值。锁定/只读文档禁止这些写入。内置模板及 `Templates/`、`模板/`、`markuneTemplate: true` 文档支持 title/date/time 变量。

## Resources And Research Sources

附件页按托管资产身份或解析后的相对位置聚合引用，以缩略图、文件名、格式和已知大小呈现资源；完整路径仅通过复制路径或在文件夹中显示操作提供。图片支持大图预览、方向键切换、适应窗口和原始尺寸，关闭时恢复触发控件焦点。本地资源下载复用受控读取、原生保存对话框和导出写入，取消或工作区已切换时不继续写入。工具栏仅保留搜索，无法读取或预览的资源在对应条目内显示状态；网络图片仅在用户打开大图时加载，也可打开原图，列表不自动请求网络资源。外部目录仍受既有附件授权约束。PDF 阅读复用离线 PDF.js，限制 50 MiB / 300 页，Canvas 与可选文字层同步渲染。摘录保存原文、页码、采集时间和 PDF SHA-256；网页摘录保存用户提供的原文和 HTTP(S) 来源。原文 quote 作为资料数据保真保存，不参与文档关系改写；仅 `source.reference` 是可随移动更新的来源引用。来源面板可回到 PDF 页码或网页，并提示 PDF 指纹变化。

视图页不再挂载研究入口。AI 输入框仍可接收其他功能追加的草稿，但不会从视图页选择资料并生成研究草稿。

---
owner: refinex
updated: 2026-10-07
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Security Standards

## Secrets

- 不得提交真实 API key、上传凭据、签名凭据、token 或生产环境凭据。
- 在共享日志中应脱敏可能泄露个人信息的本地绝对路径。

## Desktop Permissions

- `src-tauri/capabilities/default.json`、Tauri 插件、shell/process 能力和资源协议范围均为安全敏感区域。
- 未经明确批准不得扩大文件系统、进程、shell、opener 或资源协议权限。
- Git 文件操作只可作用于已选择工作区根目录。终端的初始目录必须是 canonicalize 后的现有目录，由前端传入当前工作区根；交互式 shell 以当前系统用户运行，启动后可以离开该目录。spawn 时移除名称含凭据标记的环境变量，避免 API key、token 或 Codex provider 密钥进入用户 shell。关闭标签、切换或移除工作区以及主窗口销毁时必须结束对应进程组。
- 系统 Markdown 打开方式只登记 `.md` / `.mdx` 且 `rank` 为 `Alternate`，不得登记 `*`、目录或把 Markune 设为默认应用。外部打开路径只来自操作系统参数或 `Opened` 事件，必须 canonicalize、拒绝符号链接和工作区私有文件，再交给现有工作区命令；不得因此扩大 `fs` 插件、capability 或 `assetProtocol.scope`。`tauri-plugin-single-instance` 只在原生层转发第二次启动，不新增前端权限。

## Knowledge Graph Reading

图谱只扫描所选根目录内 Markdown/MDX，跳过隐藏/依赖/构建目录、符号链接与非普通文件，读取前重新验证 canonical 边界。Unix 文件打开使用 `O_NOFOLLOW | O_NONBLOCK`，打开后校验文件类型，避免 `.md` FIFO 阻塞；Windows 使用打开 reparse point 标志并校验类型。大小检查后仍以有界读取防止文件增长，UTF-8 失败的已读取字节也计入总预算。

必须在分配过程中限制文档、目录条目、层级、关系、辅助节点及投影大小，而不是构建完成后截断；原生图谱任务全局串行。YAML 在 loader 前检查输入、深度、事件数和别名展开成本，拒绝递归/爆炸式展开。元数据与链接只作为数据解析，不能执行表达式、访问网络或读取链接指定的文件；目标只能来自扫描索引。图谱命令仅返回相对路径和关系投影；共享知识索引命令按有界分页向所选工作区的渲染器返回正文与类型化属性，正文只进入搜索 Worker，不写浏览器持久存储。

历史 Markune 标题兼容只修复内存中的一个受控字段：严格解析失败后，检查 `refinexDialect: 1`，为未引用的 `title` 编码字符串，再重新执行同一 YAML 成本门禁。不得把资源超限当作兼容入口，不得忽略其他字段的语法/循环错误。标题写入通过转义处理换行与控制字符，不能生成额外 YAML 字段。

## Document Attachment Boundaries

普通本地附件仅可访问当前工作区或用户通过原生目录选择授权的位置；授权存放在用户级应用配置，不能信任 Markdown/frontmatter 或工作区元数据自行授予外部访问。每次解析重新 canonicalize，大小写不敏感地排除 `.markune`/`.git`，校验文件类型、大小和目录边界后仅动态放行单文件，不扩大静态资源协议 scope。

网络图片下载只接受无内嵌凭据的 HTTP(S)。每次重定向重新解析并验证全部 IP，禁止回环、内网与保留地址，将已验证地址固定给 HTTP 客户端，禁止自动代理、Cookie 或调用者请求头。域名解析与 HTTP 共用 20 秒预算；最多 4 次请求、20 MB 响应，校验图片签名或安全 SVG。失败保留文档中的原地址。

普通附件不参与托管资产自动删除。文件写入使用无覆盖创建；移动正文重写复用保存锁及提交前基线校验。macOS、Linux、Windows 的最终移动分别使用 `RENAME_EXCL`、`RENAME_NOREPLACE`、`MoveFileW`，不能退回可覆盖的 rename 来掩盖文件系统不支持。

## Workspace File Synchronization

- 目录扫描与原生递归监听均不得跟随符号链接；事件路径必须属于工作区且不含父级跳转或被排除的目录分量。删除事件无法 canonicalize，先检查词法边界，真正重读时仍经过现有 canonical 路径校验。
- 原生监听会话以窗口隔离，用不可预测 ID 清理；只发送有界路径与重新扫描标记，不提供通用文件读取权限，不修改 capability 或资源协议。
- 原子暂存必须使用随机名称与 `create_new`，失败只清理本次暂存文件。保存冲突、读取失败和删除事件都不能作为静默丢弃草稿的理由。

## Release And Update

- updater minisign 私钥及密码只能进入 GitHub Actions Secrets 或受控本机发布环境；公钥使用 Actions Variable。任何生成配置、构建日志、Release Notes 和前端状态都不得包含私钥。
- 生产 endpoint 只能是 `https://github.com/Refinex-Space/markune/releases/latest/download/latest.json`。渲染器不能提交 endpoint、公钥、headers、代理、target、降级比较器或安装参数，也不能恢复 `markune-site` 或 OSS 回退源。
- 工作流默认只保留 `contents: read`；仅 Tag 构建的 `publish` 与人工触发的 Draft 发布 job 可以使用当前仓库内置 `GITHUB_TOKEN` 的 `contents: write`。Tag 工作流不得自动发布，Draft 必须经独立 `workflow_dispatch` 再次校验后转为正式 Release。不得引入跨仓库 PAT 或把写 Token 传入应用构建参数、运行时环境、Release 资产和日志。
- Rust 必须在内存中保存经检查得到的 pending update，并使用 Tauri updater 完成下载和签名校验；前端只接收元数据和进度。更新说明按纯文本渲染且在 Rust 限制为 32 KiB。
- 检查、下载和安装必须串行。用户未确认、Markdown flush 失败或图稿 flush 失败时不得开始下载。自动检查不得演变为强制更新或静默安装。
- updater minisign、macOS Developer ID/公证和 Windows Authenticode 是三种独立安全控制。当前早期分发阶段明确采用 macOS ad-hoc、无公证和 Windows 无 Authenticode，必须记录 Gatekeeper/SmartScreen 限制并做人工放行验收；不得把这种状态描述为受信任发行者。updater minisign 仍然强制启用，不能用系统签名缺失作为关闭理由。
- 更新密钥轮换必须经过旧密钥签名的过渡版本；直接替换公钥会切断所有旧客户端。密钥泄露按安全事件处理，流程见 `docs/guides/release-and-update.md`。
- 应用更新不得扩大 `capabilities/default.json`、文件系统、shell/process、opener 或资源协议权限。

## Brand Migration

- 新工作区只能使用 `.markune/`、`markune-asset://`、`markune-drawing://` 等当前持久化标识。旧 `.madora/` 与 `madora-*://` 只允许出现在隔离的兼容迁移模块、迁移测试和迁移说明中，不能继续作为正常写入格式。
- 打开含旧数据的工作区时必须在任何工作区写操作前阻断并取得用户明确确认；`.madora/` 与 `.markune/` 同时存在时必须失败关闭，不能猜测合并、删除或覆盖。
- 迁移前必须拒绝旧私有目录及其内容中的符号链接，为所有待改写文件创建原文备份和 SHA-256 清单。目录重命名和逐文件替换任一步失败时必须恢复已修改文件与旧目录；备份必须保留并向用户返回相对位置。
- 只改写应用拥有的持久化协议、标记与私有目录路径，不能替换用户正文中的普通品牌文字。单文件读取应有明确大小上限，扫描必须跳过 Git、依赖、构建与迁移暂存目录。
- 旧应用设置只能在 Markune 目标不存在时复制。ACP 迁移不复制、删除或重写旧 Codex provider 配置与 keyring 凭据。非工作区附属状态迁移失败只返回警告，不能静默覆盖当前 Markune 配置。

## ACP Agent Runtime

- Agent 是以当前用户身份运行的第三方程序，安装界面必须说明来源与系统权限；ACP、工作区 cwd 和客户端 fs 根目录均不等同于系统沙箱。不得宣称所有 Agent 的 Ask/Plan 模式提供强制只读。
- 受管安装来源、重定向、npm 身份和精确版本由原生校验，解压拒绝越界路径并限制总量；校验通过的独立版本才可启用。旧版本不会在运行中被替换。没有发布者散列的下载不能标为发布者已校验。
- 子进程仅继承必要系统环境，Profile 凭据从系统 keyring 注入。不得把凭据返回 UI、写会话或日志；stderr 只消费不转发。安装探测使用隔离 HOME，不认证或发送 prompt。
- Profile 的程序路径必须来自原生选择器或受控安装；敏感环境变量使用凭据字段。聊天文本和 MCP 工具不能创建或改写 Profile。
- 连接绑定所属窗口、canonical 工作区与 Profile；协议、安装进度和认证终端事件使用 `emit_to` 定向到所属窗口，不使用全局广播；文件/终端操作必须匹配未处理的服务端请求。只允许恢复原生登记的 Markune 会话，独占租约随进程结束释放，不能因共享 HOME 中出现同目录线程而自动接管。
- 用户授权严格选择 Agent 提供的候选 optionId，默认等待用户，不自动代答。取消和断连撤销所有 pending 交互。终端认证只执行该 Agent 在 initialize 中声明的方法与附加参数。
- 标准文件 API 拒绝工作区外、隐藏路径、父目录与符号链接；现有文件必须先读，修改按 SHA-256 基线及文档锁做原子冲突保护。写前 flush 失败即拒绝。直接 Agent 工具不受此 API 的路径检查覆盖。
- 每轮引用由原生重读权威元数据，标记 untrusted。图稿检查仅限 active/mention 授权，原地修改仅限 active；模型只给 previewId，ID/kind/revision 由原生注入，既有预览质量与修订冲突校验不能跳过。
- Markune MCP 只监听随机回环地址，使用连接限定令牌和有界帧；代理的令牌通过环境传递，不放命令行。仅在当前用户任务中开放工具，完成、取消或退出后撤销。
- 用户显式选取的图片仅在 Agent 声明 image 能力后发送，每图 3 MiB、总编码量 6 MiB、最多 8 图；不写工作区资产。工具预览只接受签名有效的 2 MiB 内 PNG/WebP，作为 MCP image content 传递。
- 新会话投影保存在应用私有 Agent 目录并原子写入，限记录 16 MiB / 5000 项；运行时 8 MiB 内容上限。不得读取或改写旧 Codex 的 JSONL、SQLite、session_index、账号配置或凭据。用户输入和工具内容仍可能被供应商自身持久化。

## Uploads And Links

- 上传资源必须保留在工作区资源目录内，Markdown 新写入只存储 `markune-asset://{assetId}`，不得把绝对路径、Windows 盘符或文档层级相关路径作为资产身份。单次批量协议解析最多接受 2,048 个经格式校验并去重的 ID；宿主处理更大文档时只能按此上限分片并合并，不能放宽 Rust 校验。每次 IPC 只能复用一次工作区 canonicalize/索引读取；每个命中仍必须逐文件 canonicalize、拒绝符号链接/目录/边界逃逸，并且只有校验成功的单个物理文件可以动态加入当前进程的资源协议范围，不得授权整个工作区、磁盘或卷。`missing` / `unreadable` 只允许 5 秒有界负缓存，恢复请求可以重新校验但不得跳过路径、索引、签名或协议授权；缓存仍限制为 8 个工作区、每个 8,192 个结果。图片或视频 DOM bridge 只消费已经授权的候选 URL，不得扩大 capability、文件系统权限或 `assetProtocol.scope`，也不得把 display URL 写入 Markdown。旧 `.markune/assets/files/...` 引用只读兼容。
- 目录本地图标只能由原生文件选择器导入 SVG、PNG 或 WebP，单文件不超过 2 MiB，栅格边长不超过 4096 px，并拒绝 APNG/动画 WebP、签名与扩展名不一致的内容。SVG 必须是 UTF-8 单根静态文档，只允许受控图形元素和属性，拒绝脚本、事件处理器、CDATA、DOCTYPE、处理指令、外部 URL、Data URL 与非内部片段 `url()`。渲染器只取得资产 ID、媒体类型和显示名称，不取得源绝对路径；导入不扩大 capability 或资产协议 scope。
- 目录外观引用必须计入工作区资产回收扫描。更换图标、恢复默认或删除目录时，只能删除已经不被 Markdown、Inbox 或其他目录外观引用的候选资产；损坏或伪造的 `local` 资产 ID 必须在写入节点状态前失败关闭。
- 图稿引用的剪贴板兼容只允许 64 位十六进制 `markune-asset://{assetId}` 和合法 UUID `markune-drawing://{drawingId}` 的精确组合；富剪贴板中的 `https://clipboard.markune.invalid/asset/{assetId}` 只能作为编辑器瞬时桥接值，由本地 resolver 解析并在保存前恢复，禁止网络请求或持久化。这些规则不得扩大浏览器导航协议、Tauri capability 或 `assetProtocol.scope`。
- 链接卡片只能使用既有的受限预览 route 或 Tauri 命令；不得在渲染器直接请求任意 URL。

## Inbox Storage

- 通用工作区 Markdown API 必须继续拒绝整个 `.markune`。Inbox 是受限例外，只能由 `src-tauri/src/inbox.rs` 在 canonicalize 后访问当前工作区的 `.markune/inbox/<capture-id>.md`；Capture ID 只能包含受控 ASCII 字符，任何绝对路径、父目录段、其他扩展名和符号链接逃逸都必须拒绝。
- Promote 的目标目录必须是工作区内已存在的普通目录，禁止隐藏目录和 `Daily`；Append 只能通过受校验的日期映射到现有 `Daily/YYYY/MM/YYYY-MM-DD.md` 规则。
- Capture 更新、删除和流转必须做 `modifiedAt` 乐观并发校验。硬删除不得级联 Note 或 Daily；组合操作失败不得留下重复 Daily 块或无留痕的新笔记。
- 资产清理的引用扫描只额外包含 `.markune/inbox/*.md`，不得借此扫描 `.markune` 其他私有内容或扩大 Tauri capability、asset protocol scope 和通用文件权限。

## Drawing Storage

- 渲染器只能提交已选择工作区根、UUID Drawing ID、受校验的相对图集路径以及 opaque grant/session ID；不得提交 bundle、导入源或导出目标的任意绝对路径。
- AI 预览不得持久化到工作区或 local storage，且必须绑定工作区与 turn；切换工作区、运行时退出、成功应用或创建、或过期时必须清理。模型不能选择物理路径或覆盖目标；新建只能通过 generated-create staging 原子落盘，活动图稿改写只能复用带 expectedRevision 的普通 Drawing 保存事务、备份与冲突检测，不得直接写 `.markune/drawings`。
- Rust 必须拒绝绝对路径、父目录段、隐藏图集、UUID 图集名、超过 8 层的图集、符号链接路径和 canonicalize 后逃出 `.markune/drawings` 的访问。扫描到单个损坏 bundle 时返回独立 issue，不得阻塞其他图稿。
- 场景、预览和组件库分别限制为 100 MiB、2 MiB 和 20 MiB，并经 Raw IPC 传输；场景必须是受支持的 Excalidraw JSON 结构，预览优先使用 WebP，并只允许有 WebP 或 PNG 签名的 macOS WebView 兼容回退，组件库必须是 Excalidraw library JSON。
- 保存使用 `expectedRevision` 乐观并发和 SHA-256 双重检查。begin 与 commit 都必须重新检查磁盘 revision/scene hash；普通保存不得覆盖外部修改，显式覆盖也只能覆盖 begin 之后未再次变化的磁盘版本。失败时必须保持 dirty 并清理 staging；提交中断必须恢复原文件。
- 成功提交只保留一份上一有效场景和元数据备份。预览生成或暂存失败不得阻塞场景保存；恢复或回收站路径冲突必须生成唯一目标，不得覆盖现有 bundle。
- 导入/export grant 必须限时、不可猜测并在使用时重新校验源文件或目录；导出始终使用 `create_new` 语义。Markune 不改写用户 `.gitignore`，也不扩大 Tauri capability、文件系统插件权限或 `assetProtocol.scope`。
- Excalidraw 远程 iframe/embeddable 必须禁用。画布 HTTP(S) 外链只经现有 Tauri opener 打开；缩略图只能由受限 Raw IPC 读取为可撤销 Blob URL，不得把 `.markune/drawings` 加入资源协议范围。

## Document Export

- 原生文件夹选择器只返回一次性、限时的目录授权 ID；后续导出命令不得接受目标目录绝对路径。
- Rust 必须重新验证格式白名单、跨平台文件名、相对路径、目录 canonical path、符号链接与文件包大小；拒绝绝对路径、`..` 和覆盖已有文件。
- 多文件导出先写入所选目录内的随机临时目录，再以 `create_new` 语义提交。任一步失败必须清理临时内容和已经提交的本次资源目录。
- `markune-export://` 只提供一次性内存页面，响应必须带 `no-store` 和禁止脚本、连接、对象、表单的 CSP；隐藏 WebView 在完成、失败或 30 秒超时后关闭。
- 专业转换只能启动构建阶段校验并随包发布的 Pandoc/Typst 精确版本；运行时不得查询 PATH、接受 sidecar/模板/过滤器路径或拼接渲染器提供的命令参数。Windows 子进程必须禁用控制台窗口。
- Pandoc Markdown reader 必须启用 sandbox，关闭 raw HTML/raw TeX/raw attributes，并先输出 AST；Rust 必须递归检查 AST 中的图片目标，只允许 staging 资产白名单或有界 `data:image/`。DOCX/Typst writer 只接收过滤后的 AST，工作目录和 `resource-path` 固定为 staging；Typst root 同样固定为 staging。每个进程 45 秒超时，Pandoc RTS 内存上限 512 MB，诊断必须限长并脱敏 staging 路径，输出必须验证 DOCX/PDF 签名。
- 专业转换必须在后台阻塞池执行，不得阻塞 Tauri UI/main thread。Markdown 上限 20 MB，资产继续遵守单文件 200 MB、总量 500 MB；远程图片只能转为链接和警告，不得由 Markune、Pandoc 或 Typst 下载。
- 分发构建必须包含固定版本的 Pandoc GPL/COPYRIGHT 与 Typst Apache/NOTICE 文本；升级版本时同步更新下载 SHA-256、许可证资源和第三方通知。
- 文档导出不得修改 Tauri capability、文件系统插件权限或资产协议 scope。

## Document Import

- 原生选择器不得把导入源绝对路径交给渲染器；授权和 source ID 必须不可猜测、限时，并在每次读取时重新校验 canonical path、大小、修改时间和格式签名。
- Markdown/HTML 相对图片必须以已授权源文档的真实父目录为边界，拒绝绝对路径、`..`、Windows prefix、百分号编码逃逸和符号链接逃逸。跨工作区 `markune-asset://` 与旧资源路径必须先通过来源工作区索引或资产目录边界校验，再复制散列。
- HTTP(S) 图片只保留原 URL 和警告，导入器不得发起网络请求。HTML 必须移除脚本、样式、iframe、表单、事件属性和危险 URL；MDX 只按静态 Markdown 解析，不执行 JSX。
- DOCX 必须先检查 OOXML 关键条目、封闭 ZIP 路径、条目数、解压总量、压缩比和宏；PDF 必须检查 `%PDF-`。密码只可保留在当前前端任务内存，最多尝试三次。
- 单源文件 100 MB、PDF 300 页、单资产 100 MB、单文档资产总量 500 MB、Markdown 20 MB。资产必须使用 Raw IPC；清单媒体类型还要和文件签名一致。
- 文档提交必须使用独立 staging session。失败或取消必须清理 staging，并删除本次新建且仍未被任何 Markdown 引用的资产；不得覆盖已有文档或扩大 capability、通用文件协议及 `assetProtocol.scope`。


## Knowledge Edits And Recovery

元数据原文与类型化投影必须分开。前端 YAML 输入限制 64 KiB、深度 16、节点 8,192、别名成本 50、展开 JSON 256 K 字符；无效元数据不得因普通正文保存被删除或重写。显式结构化修改必须重新解析结果并核对目标值。

文档移动扫描限额为单篇 4 MiB、文档读取总量 128 MiB，移动前后的路径必须在同一 canonical 工作区内。路径、清单、原文与目标均重新验证，不覆盖外部新文件；发现不能可靠解析的潜在元数据链接则拒绝移动。临时恢复记录只在 `.markune/moves`，校验目录非符号链接、相对路径不可逃逸、备份指纹、数量和大小；发生外部修改时不据备份强行覆盖。Git 忽略文件先于恢复副本写入，正常完成后删除副本。

任务勾选不得用前端文本正则直接写回整篇文档。原生重新验证文件指纹、Markdown 任务标记偏移和锁定状态；属性写回同样携带预期全文。保存视图只允许有界、唯一 ID 与合法列定义，并拒绝私有目录符号链接和过期配置指纹。

目录树批量移动最多 100 项，先检查整组选项，继续复用文件系统路径授权、禁止同名覆盖和文档锁定校验。排序元数据使用原文比较后提交；原子文件移动与链接修正仍走现有事务。批次之间及排序操作串行，但不承诺外部编辑器配合锁定，也不承诺跨文件批次原子性；中途失败必须呈现已完成项。

撤销收据仅在进程内保存最近 20 次记录，切换到其他工作区的移动会清理旧工作区记录。跨目录内容指纹不跟随符号链接，最多遍历 100,000 项、64 层、读取 128 MiB。超限或无法建立指纹时，已完成的移动仍如实返回，并明确无法提供安全撤销。撤销前检查排序基线、内容指纹和原位置，不覆盖后来出现的文件或正文；同层排序不读取/回滚正文。目录重命名和删除同步维护排序记录及偏好，防止重用路径继承已删除目录的设置。

PDF 的来源回读继续通过已授权附件 API；本地新文件由用户选择并遵循当前存储策略。网络摘录不自动下载网页。引用文本与研究预览均为不可信资料，只以文本节点进入 AI 输入框，不能把资料中的指令作为应用命令执行；追加草稿不触发发送。

仅改变大小写的改名仍使用不覆盖目标的原生重命名操作。Unix 校验设备号/inode；Windows 通过 [GetFileInformationByHandleEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex) 的 FileIdInfo 比较卷号和完整 128 位文件身份，读取失败时不放宽同名冲突检查。恢复时核对真实目录项拼写，不能用大小写不敏感的 exists 判断是否已经提交。

产物预览、文档操作、版本化凭据和诊断的限制见 [Codex 专项架构](../architecture/codex.md)。网络图片不自动下载；HTML/SVG 文件以文本预览，Mermaid 只允许经检查的静态 SVG。配置日志与错误不得回显 TOML 原文、密钥或请求正文。普通文档回收站/本地历史、语音与远程控制不属于此次扩展。

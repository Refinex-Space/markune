---
owner: refinex
updated: 2026-07-19
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
- 终端和 Git 操作只可作用于已选择工作区根目录。

## Codex Runtime

- Codex App Server 必须由 Tauri 在本地通过 stdio 启动；不得监听 TCP，也不得把 API key、登录 Token 或认证响应传入 React state、local storage 或日志。
- 新线程默认使用 Codex 命名权限配置 `:workspace`、`on-request` 审批策略和 `user` reviewer，并把已 canonicalize 的当前工作区作为唯一 runtime workspace root。`turn/start` 不得携带权限覆盖；恢复线程不得隐式重置权限，后续切换只能走 `thread/settings/update`。
- 权限模式必须保持 profile 与 reviewer 分层：自动审查只可使用 `:workspace + on-request + auto_review`，不得扩大文件或网络边界；完全访问必须经过显式风险确认并固定为 `:danger-full-access + never + user`；只读模式使用 `:read-only + on-request + user`。运行中的 turn 或待审批请求存在时禁止切换。
- Codex collaboration mode 与权限模式必须保持分离。Plan 只能使用 `collaborationMode/list` 返回的内置预设、当前模型、`medium` 推理强度和显式空 `developer_instructions`；渲染器不得提交自定义开发者指令、未知模式或非法强度。Plan 依赖指令禁止实施，并不提供强制只读安全边界；不得因此绕过现有 permission profile、审批或审计。
- 自定义 permission profile 只能来自 App Server `permissionProfile/list`，并遵循其 `allowed` 标记与 `configRequirements/read` 的企业要求；Madora 不得开放通用 `config/read`、配置写入或实验功能写入。渲染器直接提交的 `localImage` 路径必须在工作区内；工作区外图片只允许由 Rust 从有效原生附件授权注入。Codex 原生 `mention` 只允许非空的 `app://` 或 `plugin://` 目标。
- Codex 文件与文件夹附件必须由 Tauri 原生选择器创建不可猜测、最多 15 分钟有效的授权，渲染器只可取得 ID、显示名称、类型与图片标记。Rust 在每次 `turn/start` 重新 canonicalize 并校验真实类型、去重且限制最多 20 个；未知、过期、伪造或已变化的授权必须失败关闭。发送完成、移除附件、切换线程或工作区时应幂等释放授权。
- 原生附件授权不等于扩大 Codex 文件系统权限。非图片附件只把所选路径作为不可信用户上下文交给 App Server，工作区外读取仍必须服从当前 permission profile 和审批；不得为附件修改 Tauri capability、资源协议 scope 或 runtime workspace roots。
- 插件本地图标不是通用文件读取入口。Rust 只能授权当前运行时最近一次 `plugin/installed` 响应中声明的 `composerIcon`、`logo`、`logoDark` 精确 canonical path，并在读取时重新 canonicalize、拒绝目录、符号链接改指、超过 1 MiB 或签名不属于 PNG/JPEG/GIF/WebP/SVG 的内容。重新检测、运行时停止或工作区切换必须撤销授权；不得为图标扩大 Tauri capability、文件系统插件权限或 asset protocol scope。
- 插件远程图标只允许 HTTPS，必须禁用 Referer。SVG 仅作为经 Rust 大小与类型检查后的 `<img>` 数据源使用，不得以内联 HTML、`dangerouslySetInnerHTML` 或脚本可执行 DOM 注入；图标数据不得写入 mention、消息历史、local storage 或工作区。
- Skill 路径不是渲染器可自由提交的文件路径。`skills/list` 只允许查询当前工作区根目录；Rust 必须按客户端请求 ID 关联响应，只登记 enabled Skill 的精确名称与 canonical 普通文件路径。`turn/start` 的 `skill` 输入必须同时匹配名称和路径授权；列表刷新、`skills/changed`、运行时停止或工作区切换必须撤销旧授权。Skill 输入框统一使用应用内置图标，不读取 Skill 自定义图标路径，也不得扩大 Tauri capability 或资源协议范围。
- Madora 文档引用必须由 Rust canonicalize，并验证为当前工作区内真实存在的 Markdown 文件；必须拒绝相对路径、目录、非 Markdown 文件、工作区外路径、符号链接逃逸、未知角色、多个活跃文档和超过 32 个引用。传给 Codex 的只是不可信工作区相对路径，不得由前端预读、上传或复制文档正文。
- 渲染器不得直接构造 `additionalContext` 或 developer 级上下文。固定读取策略只能由 Tauri 生成，活跃文档和显式引用路径必须分别使用 `untrusted` 信任级别；文件名、路径和文档内容均不得解释为指令。空活跃文档必须编码为 `null`，防止跨 turn 沿用旧文档。
- `on-request` 审批是默认策略。命令、文件修改和 `item/permissions/requestApproval` 在用户或 auto-reviewer 决定前不得继续；“拒绝并继续”与“拒绝并停止”必须保持不同语义，“本次任务允许”只作用于当前 App Server 会话。
- Rust 必须保存每个 server request 的原始允许候选，前端只能回传 opaque choice id。结构化 execpolicy/network amendment 与临时文件/网络权限必须由 Rust 从原始请求复制，渲染器不得构造或修改。未登记、已处理或未知的 server request 必须失败关闭并返回 JSON-RPC 错误，不得静默允许或让 turn 无限等待。
- 用户决策 request 必须同样使用 Rust 生成的 opaque question/option ID；前端不得回传原始协议 question ID 或自行构造 option label。秘密输入只能保留在交互组件的临时内存中，不得写入 Madora 日志、React 会话历史、local storage、工作区或应用设置；提交后仍会进入 Codex，并遵循 App Server 自身的会话持久化规则。Madora 不得根据 `autoResolutionMs` 自动代答；App Server resolved、interrupt、运行时退出或首次成功回答后必须撤销 pending 映射，后续回答一律拒绝。
- App Server stderr 必须被消费但不得原样转发到前端或共享日志，避免泄露绝对路径、命令输出和文档内容。
- 生产包只使用构建阶段从锁定版本 `@openai/codex` 平台包提取的 sidecar。`MADORA_CODEX_BIN` 仅是显式开发覆盖，不得作为默认生产分发方式。
- Codex 会话只能存入工作区之外的共享 Codex Home。启动前必须 canonicalize 存储目录并拒绝相对路径、工作区内部路径及最终落入工作区的符号链接；sidecar 的 SQLite 投影必须固定在同一用户级目录。
- Madora 不得直接读写 Codex 的会话 JSONL、`session_index.jsonl` 或 SQLite，也不得在 `.madora`、React state、local storage 或应用设置中复制完整会话。`storageRoot` 只可作为本机诊断信息返回，不得上传、写入共享日志或默认展示。

## Uploads And Links

- 上传资源必须保留在工作区资源目录内，Markdown 新写入只存储 `madora-asset://{assetId}`，不得把绝对路径、Windows 盘符或文档层级相关路径作为资产身份。协议解析必须经当前工作区资产索引，并继续对物理路径执行 canonicalize 与资源目录边界校验；只有校验成功的单个物理文件可以动态加入当前进程的资源协议范围，不得授权整个工作区、磁盘或卷。旧 `.madora/assets/files/...` 引用只读兼容。
- 链接卡片只能使用既有的受限预览 route 或 Tauri 命令；不得在渲染器直接请求任意 URL。

## Inbox Storage

- 通用工作区 Markdown API 必须继续拒绝整个 `.madora`。Inbox 是受限例外，只能由 `src-tauri/src/inbox.rs` 在 canonicalize 后访问当前工作区的 `.madora/inbox/<capture-id>.md`；Capture ID 只能包含受控 ASCII 字符，任何绝对路径、父目录段、其他扩展名和符号链接逃逸都必须拒绝。
- Promote 的目标目录必须是工作区内已存在的普通目录，禁止隐藏目录和 `Daily`；Append 只能通过受校验的日期映射到现有 `Daily/YYYY/MM/YYYY-MM-DD.md` 规则。
- Capture 更新、删除和流转必须做 `modifiedAt` 乐观并发校验。硬删除不得级联 Note 或 Daily；组合操作失败不得留下重复 Daily 块或无留痕的新笔记。
- 资产清理的引用扫描只额外包含 `.madora/inbox/*.md`，不得借此扫描 `.madora` 其他私有内容或扩大 Tauri capability、asset protocol scope 和通用文件权限。

## Document Export

- 原生文件夹选择器只返回一次性、限时的目录授权 ID；后续导出命令不得接受目标目录绝对路径。
- Rust 必须重新验证格式白名单、跨平台文件名、相对路径、目录 canonical path、符号链接与文件包大小；拒绝绝对路径、`..` 和覆盖已有文件。
- 多文件导出先写入所选目录内的随机临时目录，再以 `create_new` 语义提交。任一步失败必须清理临时内容和已经提交的本次资源目录。
- `madora-export://` 只提供一次性内存页面，响应必须带 `no-store` 和禁止脚本、连接、对象、表单的 CSP；隐藏 WebView 在完成、失败或 30 秒超时后关闭。
- HTML/PDF 可保留已渲染的远程资源 URL，但导出实现不得新增任意远程抓取。Word 无法安全取得远程图片字节时保留普通链接并返回警告。
- 文档导出不得修改 Tauri capability、文件系统插件权限或资产协议 scope。

## Document Import

- 原生选择器不得把导入源绝对路径交给渲染器；授权和 source ID 必须不可猜测、限时，并在每次读取时重新校验 canonical path、大小、修改时间和格式签名。
- Markdown/HTML 相对图片必须以已授权源文档的真实父目录为边界，拒绝绝对路径、`..`、Windows prefix、百分号编码逃逸和符号链接逃逸。跨工作区 `madora-asset://` 与旧资源路径必须先通过来源工作区索引或资产目录边界校验，再复制散列。
- HTTP(S) 图片只保留原 URL 和警告，导入器不得发起网络请求。HTML 必须移除脚本、样式、iframe、表单、事件属性和危险 URL；MDX 只按静态 Markdown 解析，不执行 JSX。
- DOCX 必须先检查 OOXML 关键条目、封闭 ZIP 路径、条目数、解压总量、压缩比和宏；PDF 必须检查 `%PDF-`。密码只可保留在当前前端任务内存，最多尝试三次。
- 单源文件 100 MB、PDF 300 页、单资产 100 MB、单文档资产总量 500 MB、Markdown 20 MB。资产必须使用 Raw IPC；清单媒体类型还要和文件签名一致。
- 文档提交必须使用独立 staging session。失败或取消必须清理 staging，并删除本次新建且仍未被任何 Markdown 引用的资产；不得覆盖已有文档或扩大 capability、通用文件协议及 `assetProtocol.scope`。

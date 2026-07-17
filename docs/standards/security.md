---
owner: refinex
updated: 2026-07-17
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
- 自定义 permission profile 只能来自 App Server `permissionProfile/list`，并遵循其 `allowed` 标记与 `configRequirements/read` 的企业要求；Madora 不得开放通用 `config/read`、配置写入或实验功能写入。`localImage` 路径必须在工作区内，Codex 原生 `mention` 只允许非空的 `app://` 或 `plugin://` 目标。
- Madora 文档引用必须由 Rust canonicalize，并验证为当前工作区内真实存在的 Markdown 文件；必须拒绝相对路径、目录、非 Markdown 文件、工作区外路径、符号链接逃逸和超过 32 个引用。传给 Codex 的只是不可信相对路径列表，不得由前端预读、上传或复制文档正文。
- 渲染器不得直接构造 `additionalContext` 或 developer 级上下文。固定读取策略只能由 Tauri 生成，引用路径必须使用 `untrusted` 信任级别；文件名、路径和文档内容均不得解释为指令。
- `on-request` 审批是默认策略。命令、文件修改和 `item/permissions/requestApproval` 在用户或 auto-reviewer 决定前不得继续；“拒绝并继续”与“拒绝并停止”必须保持不同语义，“本次任务允许”只作用于当前 App Server 会话。
- Rust 必须保存每个 server request 的原始允许候选，前端只能回传 opaque choice id。结构化 execpolicy/network amendment 与临时文件/网络权限必须由 Rust 从原始请求复制，渲染器不得构造或修改。未登记、已处理或未知的 server request 必须失败关闭并返回 JSON-RPC 错误，不得静默允许或让 turn 无限等待。
- App Server stderr 必须被消费但不得原样转发到前端或共享日志，避免泄露绝对路径、命令输出和文档内容。
- 生产包只使用构建阶段从锁定版本 `@openai/codex` 平台包提取的 sidecar。`MADORA_CODEX_BIN` 仅是显式开发覆盖，不得作为默认生产分发方式。
- Codex 会话只能存入工作区之外的共享 Codex Home。启动前必须 canonicalize 存储目录并拒绝相对路径、工作区内部路径及最终落入工作区的符号链接；sidecar 的 SQLite 投影必须固定在同一用户级目录。
- Madora 不得直接读写 Codex 的会话 JSONL、`session_index.jsonl` 或 SQLite，也不得在 `.madora`、React state、local storage 或应用设置中复制完整会话。`storageRoot` 只可作为本机诊断信息返回，不得上传、写入共享日志或默认展示。

## Uploads And Links

- 上传资源必须保留在工作区资源目录内，Markdown 新写入只存储 `madora-asset://{assetId}`，不得把绝对路径或文档层级相关路径作为资产身份。协议解析必须经工作区资产索引，并继续对物理路径执行 canonicalize 与资源目录边界校验；旧 `.madora/assets/files/...` 引用只读兼容。
- 链接卡片只能使用既有的受限预览 route 或 Tauri 命令；不得在渲染器直接请求任意 URL。

## Document Export

- 原生文件夹选择器只返回一次性、限时的目录授权 ID；后续导出命令不得接受目标目录绝对路径。
- Rust 必须重新验证格式白名单、跨平台文件名、相对路径、目录 canonical path、符号链接与文件包大小；拒绝绝对路径、`..` 和覆盖已有文件。
- 多文件导出先写入所选目录内的随机临时目录，再以 `create_new` 语义提交。任一步失败必须清理临时内容和已经提交的本次资源目录。
- `madora-export://` 只提供一次性内存页面，响应必须带 `no-store` 和禁止脚本、连接、对象、表单的 CSP；隐藏 WebView 在完成、失败或 30 秒超时后关闭。
- HTML/PDF 可保留已渲染的远程资源 URL，但导出实现不得新增任意远程抓取。Word 无法安全取得远程图片字节时保留普通链接并返回警告。
- 文档导出不得修改 Tauri capability、文件系统插件权限或资产协议 scope。

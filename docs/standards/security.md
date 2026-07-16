---
owner: refinex
updated: 2026-07-16
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
- 默认 turn 使用 `workspaceWrite`，唯一 writable root 是已 canonicalize 的当前工作区；`mention` 和 `localImage` 路径必须在工作区内。
- `on-request` 审批是默认策略。命令执行和文件修改在用户允许前不得继续；“本次任务允许”只作用于当前 App Server 会话。
- App Server stderr 必须被消费但不得原样转发到前端或共享日志，避免泄露绝对路径、命令输出和文档内容。
- 生产包只使用构建阶段从锁定版本 `@openai/codex` 平台包提取的 sidecar。`MADORA_CODEX_BIN` 仅是显式开发覆盖，不得作为默认生产分发方式。
- Codex 会话只能存入工作区之外的共享 Codex Home。启动前必须 canonicalize 存储目录并拒绝相对路径、工作区内部路径及最终落入工作区的符号链接；sidecar 的 SQLite 投影必须固定在同一用户级目录。
- Madora 不得直接读写 Codex 的会话 JSONL、`session_index.jsonl` 或 SQLite，也不得在 `.madora`、React state、local storage 或应用设置中复制完整会话。`storageRoot` 只可作为本机诊断信息返回，不得上传、写入共享日志或默认展示。

## Uploads And Links

- 上传资源必须保留在工作区资源目录内，Markdown 新写入只存储 `madora-asset://{assetId}`，不得把绝对路径或文档层级相关路径作为资产身份。协议解析必须经工作区资产索引，并继续对物理路径执行 canonicalize 与资源目录边界校验；旧 `.madora/assets/files/...` 引用只读兼容。
- 链接卡片只能使用既有的受限预览 route 或 Tauri 命令；不得在渲染器直接请求任意 URL。

---
owner: refinex
updated: 2026-07-12
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

## Uploads And Links

- 上传资源必须保留在工作区资源目录内，Markdown 仅存储相对 `.madora/assets/files/...` 路径或旧资源引用。
- 链接卡片只能使用既有的受限预览 route 或 Tauri 命令；不得在渲染器直接请求任意 URL。

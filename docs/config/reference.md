---
owner: refinex
updated: 2026-07-16
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Scripts

- `pnpm dev`：启动 Next.js 开发服务。
- `pnpm desktop:dev`：先在 Tauri 文件监听启动前准备 Codex sidecar，再启动 Tauri 开发模式。
- `pnpm codex:stage`：从固定版本 `@openai/codex` 平台包复制当前目标的原生 Codex sidecar，并执行版本探测。
- `pnpm test:run`：运行一次 Vitest。
- `pnpm lint`：运行 ESLint。
- `pnpm build`：运行 Next.js build。
- `pnpm build:desktop:web`：运行 Tauri 静态导出。
- `pnpm harness:check`：运行仓库治理检查。

## Environment Variables

- `NEXT_OUTPUT=export`：启用静态导出行为。
- `TAURI_DEV_HOST`：覆盖桌面开发模式的资源 host。
- `MADORA_CODEX_BIN`：仅用于本地诊断或开发，显式覆盖 Codex 可执行文件。配置路径必须通过 `codex --version` 探测；不得指向脚本包装器或不受信任文件。
- `CODEX_HOME`：可选的共享 Codex 用户状态目录。未设置时 Madora 使用 `~/.codex`；显式值必须是工作区之外的既有绝对目录。Madora 会把解析后的值显式传给 App Server sidecar，以共享 ChatGPT/Codex CLI 的认证、配置、技能、MCP 与线程历史。
- `CODEX_SQLITE_HOME`：不控制 Madora 启动的 sidecar。Madora 会从子进程环境移除此变量，并以 `-c sqlite_home="<CODEX_HOME>"` 固定 SQLite 投影目录，防止相对路径按工作区 `cwd` 解析或项目配置把运行时状态写入知识库。

## Tauri Config

- `src-tauri/tauri.conf.json` 的 `devUrl` 为 `http://localhost:3000`。
- `frontendDist` 为 `../out`，桌面构建依赖静态导出产物。
- 资源协议仅允许 `$HOME/**/.madora/assets/files/**/*` 下的工作区资源。
- opener 插件关闭了自动接管 `target="_blank"` 链接的全局点击脚本；桌面外链必须显式调用 `openUrl`，避免覆盖编辑器自身的链接交互规则。
- `bundle.externalBin` 包含 `binaries/codex`。`desktop:dev` 会在 Tauri 文件监听启动前运行幂等的 `pnpm codex:stage`，避免 staging 写入 `src-tauri` 时触发重复启动；桌面构建仍在 `beforeBuildCommand` 中 staging。生成的目标平台二进制位于 `src-tauri/binaries/codex-{target-triple}` 且被 Git 忽略。
- Codex 运行时优先使用应用随附 sidecar；开发诊断时才依次检查 `MADORA_CODEX_BIN`、PATH 和 macOS ChatGPT App 内置 Codex。

## App Settings

`src-tauri/src/settings.rs` 持久化全局设置。当前 schema version 为 `1`，包含 `storage.defaultProvider: local`、`appearance.pageWidthMode`（`standard` 或 `wide`）以及 `appearance.fonts.ui`、`appearance.fonts.document`、`appearance.fonts.code`。

旧设置文件中的未知字段读取时会忽略；用户保存设置后仅写回当前 schema 支持的字段。

## Workspace Metadata

每个工作区根目录下的 `.madora/workspace.json` 保存最近文档、目录展开状态、排序、每日笔记索引和 Git Sync 偏好。文档正文仍保存在工作区可见的 Markdown 文件中。

`.madora` 不保存 AI 消息或 Codex 线程副本。旧 `.madora/ai-sessions` 路径已经停用，应在知识库中忽略；AI 会话的新建、恢复、命名、归档和删除完全由用户级 Codex Home 与 App Server 管理。

右侧元信息宽度继续保存在 `madora:workspace:right-panel-width`；AI 面板使用独立的 `madora:workspace:ai-panel-width`，避免两个面板的尺寸互相覆盖。

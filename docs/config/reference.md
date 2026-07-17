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

## Tauri Config

- `src-tauri/tauri.conf.json` 的 `devUrl` 为 `http://localhost:3000`。
- `frontendDist` 为 `../out`，桌面构建依赖静态导出产物。
- 资源协议仅允许 `$HOME/**/.madora/assets/files/**/*` 下的工作区资源。
- opener 插件关闭了自动接管 `target="_blank"` 链接的全局点击脚本；桌面外链必须显式调用 `openUrl`，避免覆盖编辑器自身的链接交互规则。
- `bundle.externalBin` 包含 `binaries/codex`。`desktop:dev` 会在 Tauri 文件监听启动前运行幂等的 `pnpm codex:stage`，避免 staging 写入 `src-tauri` 时触发重复启动；桌面构建仍在 `beforeBuildCommand` 中 staging。生成的目标平台二进制位于 `src-tauri/binaries/codex-{target-triple}` 且被 Git 忽略。
- Codex 运行时优先使用应用随附 sidecar；开发诊断时才依次检查 `MADORA_CODEX_BIN`、PATH 和 macOS ChatGPT App 内置 Codex。
- 单文档 PDF 导出注册内部 `madora-export://` 协议，但不扩大 `capabilities/default.json` 或 `assetProtocol.scope`。该协议只提供一次性内存 HTML 会话，不读取工作区文件。
- Rust 侧 Tauri 依赖固定在 `2.11.x`，以约束 `with_webview` 平台类型；Windows 直接使用与当前 Wry 对齐的 `webview2-com 0.38.2`，macOS 使用 `objc2 0.6.4` 与 `objc2-*-kit 0.3.2`。Word 生成依赖精确锁定为 `docx 9.7.1`。

## App Settings

`src-tauri/src/settings.rs` 持久化全局设置。当前 schema version 为 `1`，包含 `storage.defaultProvider: local`、`appearance.pageWidthMode`（`standard` 或 `wide`）以及 `appearance.fonts.ui`、`appearance.fonts.document`、`appearance.fonts.code`。

旧设置文件中的未知字段读取时会忽略；用户保存设置后仅写回当前 schema 支持的字段。

## Workspace Metadata

每个工作区根目录下的 `.madora/workspace.json` 保存最近文档、目录展开状态、排序、每日笔记索引和 Git Sync 偏好。文档正文仍保存在工作区可见的 Markdown 文件中。

右侧元信息宽度继续保存在 `madora:workspace:right-panel-width`；AI 面板使用独立的 `madora:workspace:ai-panel-width`，避免两个面板的尺寸互相覆盖。

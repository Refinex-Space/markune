---
owner: refinex
updated: 2026-07-19
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Scripts

- `pnpm dev`：先执行 `pnpm runtime:stage`，再在固定的 `3000` 端口启动 Next.js 开发服务；端口已被占用时直接失败，不回退到其他端口。
- `pnpm desktop:dev`：先在 Tauri 文件监听启动前准备 Codex sidecar，再启动 Tauri 开发模式。
- `pnpm codex:stage`：从固定版本 `@openai/codex` 平台包复制当前目标的原生 Codex sidecar，并执行版本探测。
- `pnpm test:run`：运行一次 Vitest。
- `pnpm lint`：运行 ESLint。
- `pnpm build`：先执行 `pnpm runtime:stage`，再运行 Next.js build。
- `pnpm build:desktop:web`：运行 Tauri 静态导出。
- `pnpm import:stage`：从锁定依赖复制 PDF.js/Tesseract Worker、PDF CMap/字体/WASM 和 `eng+chi_sim` OCR 模型到 `public/import-runtime`。该目录不进入 Git，也不参与 ESLint；文件缺失时脚本立即失败。
- `pnpm excalidraw:stage`：从精确锁定的 `@excalidraw/excalidraw@0.18.1` 复制生产 CSS 和字体到 `public/excalidraw-runtime`。该目录不进入 Git；源文件缺失时脚本立即失败。
- `pnpm runtime:stage`：依次准备文档导入与 Excalidraw 离线运行时，是 Web 开发和构建的统一前置步骤。
- `pnpm harness:check`：运行仓库治理检查。

## Environment Variables

- `NEXT_OUTPUT=export`：启用静态导出行为。
- `TAURI_DEV_HOST`：覆盖桌面开发模式的资源 host。
- `MADORA_CODEX_BIN`：仅用于本地诊断或开发，显式覆盖 Codex 可执行文件。配置路径必须通过 `codex --version` 探测；不得指向脚本包装器或不受信任文件。
- `CODEX_HOME`：可选的共享 Codex 用户状态目录。未设置时 Madora 使用 `~/.codex`；显式值必须是工作区之外的既有绝对目录。Madora 会把解析后的值显式传给 App Server sidecar，以共享 ChatGPT/Codex CLI 的认证、配置、技能、MCP 与线程历史。
- `CODEX_SQLITE_HOME`：不控制 Madora 启动的 sidecar。Madora 会从子进程环境移除此变量，并以 `-c sqlite_home="<CODEX_HOME>"` 固定 SQLite 投影目录，防止相对路径按工作区 `cwd` 解析或项目配置把运行时状态写入知识库。

## Tauri Config

- `src-tauri/tauri.conf.json` 的 `devUrl` 为 `http://localhost:3000`。
- Next.js 开发产物写入 `.next-dev`，生产构建与桌面静态导出仍写入 `.next`；两者必须保持隔离，避免运行中的开发服务因并行构建清理产物而失效。
- `frontendDist` 为 `../out`，桌面构建依赖静态导出产物。
- 资源协议的静态范围仅允许 `$HOME/**/.madora/assets/files/**/*`。对于用户目录外、Windows 非系统盘或 macOS 外置卷上的工作区，Rust 仅在资产已经通过当前工作区索引、canonicalize 和 `.madora/assets/files` 边界校验后，向当前进程动态授权解析出的单个文件；不得授权整个工作区、磁盘或卷。
- opener 插件关闭了自动接管 `target="_blank"` 链接的全局点击脚本；桌面外链必须显式调用 `openUrl`，避免覆盖编辑器自身的链接交互规则。
- `bundle.externalBin` 包含 `binaries/codex`。`desktop:dev` 会在 Tauri 文件监听启动前运行幂等的 `pnpm codex:stage`，避免 staging 写入 `src-tauri` 时触发重复启动；桌面构建仍在 `beforeBuildCommand` 中 staging。生成的目标平台二进制位于 `src-tauri/binaries/codex-{target-triple}` 且被 Git 忽略。
- Codex 运行时优先使用应用随附 sidecar；开发诊断时才依次检查 `MADORA_CODEX_BIN`、PATH 和 macOS ChatGPT App 内置 Codex。
- 单文档 PDF 导出注册内部 `madora-export://` 协议，但不扩大 `capabilities/default.json` 或 `assetProtocol.scope`。该协议只提供一次性内存 HTML 会话，不读取工作区文件。
- 多格式导入不新增文件协议或 capability。源文件访问只通过 `src-tauri/src/import.rs` 的限时授权与 Raw IPC；`assetProtocol.scope` 保持不变。
- 画板不新增文件协议或 capability。图稿场景、预览和组件库只通过 `src-tauri/src/drawings.rs` 的受限 Raw IPC 传输；缩略图以可撤销 Blob URL 展示，`assetProtocol.scope` 保持不变。
- Rust 侧 Tauri 依赖固定在 `2.11.x`，以约束 `with_webview` 平台类型；Windows 直接使用与当前 Wry 对齐的 `webview2-com 0.38.2`，macOS 使用 `objc2 0.6.4` 与 `objc2-*-kit 0.3.2`。Word 生成依赖精确锁定为 `docx 9.7.1`。

## Document Import Dependencies

导入转换依赖精确锁定为 `mammoth 1.12.0`、`pdfjs-dist 6.1.200`、`tesseract.js 7.0.0`、`@tesseract.js-data/eng 1.0.0`、`@tesseract.js-data/chi_sim 1.0.0`、`unified 11.0.5`、`rehype-parse 9.0.1`、`rehype-sanitize 6.0.0`、`rehype-remark 10.0.1`、`remark-parse 11.0.0`、`remark-frontmatter 5.0.0` 和 `remark-stringify 11.0.0`。DOCX 原生预检使用兼容 Rust 1.77 的 `zip 2.4.2`，只启用 `deflate`。

## Editor Dependency Patches

`markweave@0.2.6` 通过 `pnpm.patchedDependencies` 应用仓库内版本锁定补丁。补丁只允许图片剪贴板解析受控 `madora-asset://` 地址，并识别严格匹配 64 位资产 ID 与 UUID Drawing ID 的规范图稿引用；不得借此接受 `asset://`、`file://` 或任意自定义协议。升级 Markweave 时必须重新核对补丁上下文并执行图稿富文本、纯文本粘贴回归测试。

## App Settings

`src-tauri/src/settings.rs` 持久化全局设置。当前 schema version 为 `1`，包含 `storage.defaultProvider: local`、`appearance.pageWidthMode`（`standard` 或 `wide`）以及 `appearance.fonts.ui`、`appearance.fonts.document`、`appearance.fonts.code`。

旧设置文件中的未知字段读取时会忽略；用户保存设置后仅写回当前 schema 支持的字段。

## Codex Permission Profiles

Madora 不在自身设置或 `.madora` 中复制 Codex 权限配置。权限目录由共享 `CODEX_HOME/config.toml` 管理，App Server 通过 `permissionProfile/list` 返回内置 `:workspace`、`:read-only`、`:danger-full-access` 及用户定义的 `[permissions.<id>]` profile；`allowed: false` 的 profile 在界面中保持可见但不可选。

默认模式为 `:workspace + on-request + user`。替我审批使用同一 `:workspace` profile，仅把 reviewer 切换为 `auto_review`；完全访问使用 `:danger-full-access + never + user`；只读访问使用 `:read-only + on-request + user`。企业级 `requirements.toml` / MDM 限制由 `configRequirements/read` 读取，Madora 不开放 `config/read`、`config/value/write`、`config/batchWrite` 或实验功能写入接口。

## Workspace Metadata

每个工作区根目录下的 `.madora/workspace.json` 保存最近文档、目录展开状态、排序、每日笔记索引和 Git Sync 偏好。文档正文仍保存在工作区可见的 Markdown 文件中。

Inbox Capture 独立保存在 `.madora/inbox/cap_YYYYMMDD_HHMMSS_SSS_<uuid8>.md`，不写入 `workspace.json`，也不需要配置项或 schema 迁移。是否被 Git 跟踪完全遵循用户工作区自己的 ignore 规则，Madora 不改写 `.gitignore`。

图稿独立保存在 `.madora/drawings`，不写入 `workspace.json`。场景上限为 100 MiB、预览 2 MiB、组件库 20 MiB；标题最多 120 字符，图集最多 8 层。历史 `meta.tags` 仅作存储兼容，仍按最多 10 个、每个 32 字符校验，但不提供产品入口。`ui-state.json` 只保存最近图稿和每图视口，缩放和平移不更新图稿内容时间。

`.madora` 不保存 AI 消息或 Codex 线程副本。旧 `.madora/ai-sessions` 路径已经停用，应在知识库中忽略；AI 会话的新建、恢复、命名、归档和删除完全由用户级 Codex Home 与 App Server 管理。

右侧元信息宽度继续保存在 `madora:workspace:right-panel-width`；AI 面板使用独立的 `madora:workspace:ai-panel-width`，避免两个面板的尺寸互相覆盖。

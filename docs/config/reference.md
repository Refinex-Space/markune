---
owner: refinex
updated: 2026-07-23
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Scripts

- `pnpm dev`：先执行 `pnpm runtime:stage`，再在固定的 `3000` 端口启动 Next.js 开发服务；端口已被占用时直接失败，不回退到其他端口。
- `pnpm desktop:dev`：先在 Tauri 文件监听启动前准备 Codex 与专业文档导出 sidecar，再启动 Tauri 开发模式。
- `pnpm codex:stage`：从固定版本 `@openai/codex` 平台包复制当前目标的原生 Codex sidecar，并执行版本探测。
- `pnpm document-export:stage`：下载并校验当前目标的 Pandoc 3.10.1、Typst 0.15.1 及对应许可证文本，生成被 Git 忽略的 Tauri sidecar；成功缓存后重复执行是幂等的。
- `pnpm test:run`：运行一次 Vitest。
- `pnpm lint`：运行 ESLint。
- `pnpm build`：先执行 `pnpm runtime:stage`，再运行 Next.js build。
- `pnpm build:desktop:web`：运行 Tauri 静态导出。
- `pnpm release:prepare`：校验 `package.json`、`tauri.conf.json` 与发布 Tag 版本一致，从 `MADORA_UPDATER_PUBLIC_KEY` 生成被 Git 忽略的 release-only Tauri updater 配置；不会读取或打印私钥。
- `pnpm import:stage`：从锁定依赖复制 PDF.js/Tesseract Worker、PDF CMap/字体/WASM 和 `eng+chi_sim` OCR 模型到 `public/import-runtime`。该目录不进入 Git，也不参与 ESLint；文件缺失时脚本立即失败。
- `pnpm excalidraw:stage`：从精确锁定的 `@excalidraw/excalidraw@0.18.1` 复制生产 CSS 和字体到 `public/excalidraw-runtime`。该目录不进入 Git；源文件缺失时脚本立即失败。

AI 画图直接依赖固定的 `@excalidraw/mermaid-to-excalidraw@2.2.2`。由于其 Mermaid DOM 解析器与 `mermaid@11.15.0` 会把 class、ER 和 state 图降级为 SVG image，`pnpm-workspace.yaml` 只对该依赖的内部 Mermaid 锁定为 `11.12.1`；应用自身的 `mermaid@11.15.0` 不降级。升级任一版本时必须在真实浏览器重新验证五类图型均返回零 files 的可编辑元素。
- `pnpm runtime:stage`：依次准备文档导入与 Excalidraw 离线运行时，是 Web 开发和构建的统一前置步骤。
- `pnpm harness:check`：运行仓库治理检查。

## Environment Variables

- `NEXT_OUTPUT=export`：启用静态导出行为。
- `TAURI_DEV_HOST`：覆盖桌面开发模式的资源 host。
- `MADORA_CODEX_BIN`：仅用于本地诊断或开发，显式覆盖 Codex 可执行文件。配置路径必须通过 `codex --version` 探测；不得指向脚本包装器或不受信任文件。
- `MADORA_PANDOC_BIN` / `MADORA_TYPST_BIN`：只供 `document-export:stage` 在离线构建环境复制精确锁定版本，不是应用运行时路径覆盖。版本探测不匹配时 staging 失败。
- `MADORA_DOCUMENT_EXPORT_ENGINE=legacy`：运行时诊断/紧急回滚开关，使 PDF 与 Word 使用原兼容引擎；默认值和其他值都优先使用专业引擎。
- `CODEX_HOME`：可选的共享 Codex 用户状态目录。未设置时 Madora 使用 `~/.codex`；显式值必须是工作区之外的既有绝对目录。Madora 会把解析后的值显式传给 App Server sidecar，以共享 ChatGPT/Codex CLI 的认证、配置、技能、MCP 与线程历史。
- `CODEX_SQLITE_HOME`：不控制 Madora 启动的 sidecar。Madora 会从子进程环境移除此变量，并以 `-c sqlite_home="<CODEX_HOME>"` 固定 SQLite 投影目录，防止相对路径按工作区 `cwd` 解析或项目配置把运行时状态写入知识库。
- `MADORA_UPDATER_PUBLIC_KEY`：只在发布构建时提供完整两行 minisign 公钥，由 `release:prepare` 写入 `.tauri-build/tauri.release.generated.json`。普通开发和 Web 构建不需要该变量。
- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：只允许存在于 GitHub Actions Secrets 或受控本机发布环境，用于生成 updater artifact 签名；不得写入仓库、生成配置或日志。
- `MADORA_RELEASES_TOKEN`：只允许存在于私有 `madora` 仓库的 GitHub Actions Secret；使用仅可写 `Refinex-Space/madora-site` Contents 的 fine-grained PAT，把私有源码构建产物上传到公开 Releases。它不是应用运行时环境变量，不得进入前端或安装包。

## Tauri Config

- `src-tauri/tauri.conf.json` 的 `devUrl` 为 `http://localhost:3000`。
- Next.js 开发产物写入 `.next-dev`，生产构建与桌面静态导出仍写入 `.next`；两者必须保持隔离，避免运行中的开发服务因并行构建清理产物而失效。
- 普通开发与 Web 构建使用 `tsconfig.json`，桌面静态导出在 `NEXT_OUTPUT=export` 时改用 `tsconfig.desktop.json`；桌面配置只检查 `.next` 类型并明确排除 `.next-dev`，避免临时移走 `app/api` 时读取开发服务生成的路由校验文件。
- `frontendDist` 为 `../out`，桌面构建依赖静态导出产物。
- 资源协议的静态范围仅允许 `$HOME/**/.madora/assets/files/**/*`。对于用户目录外、Windows 非系统盘或 macOS 外置卷上的工作区，Rust 仅在资产已经通过当前工作区索引、canonicalize 和 `.madora/assets/files` 边界校验后，向当前进程动态授权解析出的单个文件；不得授权整个工作区、磁盘或卷。
- opener 插件关闭了自动接管 `target="_blank"` 链接的全局点击脚本；桌面外链必须显式调用 `openUrl`，避免覆盖编辑器自身的链接交互规则。
- `bundle.externalBin` 包含 `binaries/codex`、`binaries/pandoc` 和 `binaries/typst`。`desktop:dev` 会在 Tauri 文件监听启动前运行幂等 staging，避免写入 `src-tauri` 时触发重复启动；桌面构建仍在 `beforeBuildCommand` 中 staging。生成的目标平台二进制位于 `src-tauri/binaries/*-{target-triple}` 且被 Git 忽略。
- Codex 运行时优先使用应用随附 sidecar；开发诊断时才依次检查 `MADORA_CODEX_BIN`、PATH 和 macOS ChatGPT App 内置 Codex。
- 专业 Word/PDF 模板和第三方通知位于 `src-tauri/resources/document-export`。PDF 启用前必须由 Typst 字体清单确认平台存在受支持的中文字体；否则只降级 PDF，不影响专业 Word。兼容 PDF 注册内部 `madora-export://` 协议，但不扩大 `capabilities/default.json` 或 `assetProtocol.scope`。
- 多格式导入不新增文件协议或 capability。源文件访问只通过 `src-tauri/src/import.rs` 的限时授权与 Raw IPC；`assetProtocol.scope` 保持不变。
- 画板不新增文件协议或 capability。图稿场景、预览和组件库只通过 `src-tauri/src/drawings.rs` 的受限 Raw IPC 传输；缩略图以可撤销 Blob URL 展示，`assetProtocol.scope` 保持不变。
- `src-tauri/resources/skills/` 作为只读 Tauri bundle resource 随应用发布。运行时只解析其中的 `madora-diagram/SKILL.md` 根目录，不读取渲染器提供的 Skill 物理路径。
- 基础 `src-tauri/tauri.conf.json` 不包含生产 updater endpoint 或公钥，避免本地开发构建误连生产更新服务。Tag 发布时 `scripts/prepare-release-updater-config.mjs` 生成 `.tauri-build/tauri.release.generated.json`，只注入 `Refinex-Space/madora-site` 的固定 GitHub Releases endpoint、公钥、updater artifacts、macOS ad-hoc identity `-` 和 Windows passive 模式。
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

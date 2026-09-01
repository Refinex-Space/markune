---
owner: refinex
updated: 2026-09-01
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
- `pnpm release:prepare`：校验 `package.json`、Tauri 应用版本与发布 Tag，从 `MARKUNE_UPDATER_PUBLIC_KEY` 生成被 Git 忽略的 release-only Tauri updater 配置；唯一 endpoint 固定为当前 `Refinex-Space/markune` 仓库的 `latest.json`，不读取或打印私钥。
- `pnpm import:stage`：从锁定依赖复制 PDF.js/Tesseract Worker、PDF CMap/字体/WASM 和 `eng+chi_sim` OCR 模型到 `public/import-runtime`。该目录不进入 Git，也不参与 ESLint；文件缺失时脚本立即失败。
- `pnpm excalidraw:stage`：从精确锁定的 `@excalidraw/excalidraw@0.18.1` 复制生产 CSS 和字体到 `public/excalidraw-runtime`。该目录不进入 Git；源文件缺失时脚本立即失败。

AI 画图直接依赖固定的 `@excalidraw/mermaid-to-excalidraw@2.2.2`。由于其 Mermaid DOM 解析器与 `mermaid@11.15.0` 会把 class、ER 和 state 图降级为 SVG image，`pnpm-workspace.yaml` 只对该依赖的内部 Mermaid 锁定为 `11.12.1`；应用自身的 `mermaid@11.15.0` 不降级。升级任一版本时必须在真实浏览器重新验证五类图型均返回零 files 的可编辑元素。
- `pnpm runtime:stage`：依次准备文档导入与 Excalidraw 离线运行时，是 Web 开发和构建的统一前置步骤。
- `pnpm harness:check`：运行仓库治理检查。

`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 只豁免 Markune 已完成源码、发布包和真实桌面验收的 Markweave 版本。升级 `markweave` 与 `@markweave/react` 时必须同步更新两个版本范围，并保持二者版本一致，避免刚发布的受控版本在全新安装中被 pnpm 发布年龄策略拒绝。

`.github/workflows/release.yml` 的 verify 和 publish job 固定使用 Node.js 24、pnpm 11.16.0 与当前锁定 Actions major。release 关键文件推送到 `dev` 时只运行 verify；`v*` Tag 在当前仓库生成 9 资产 GitHub Draft，不会自动转为正式 Release。维护者检查 Draft 后手工触发 `.github/workflows/publish-release.yml`，该工作流核对 9 个资产、6 个 updater target、当前 Tag commit、下载 URL 与签名内容，再正式发布 Draft。完整 Cargo 测试仍是本机 Tag 前门禁，不加入 Linux release verify。

## Environment Variables

- `NEXT_OUTPUT=export`：启用静态导出行为。
- `TAURI_DEV_HOST`：覆盖桌面开发模式的资源 host。
- `MARKUNE_CODEX_BIN`：仅用于本地诊断或开发，显式覆盖 Codex 可执行文件。配置路径必须通过 `codex --version` 探测；不得指向脚本包装器或不受信任文件。
- `MARKUNE_PANDOC_BIN` / `MARKUNE_TYPST_BIN`：只供 `document-export:stage` 在离线构建环境复制精确锁定版本，不是应用运行时路径覆盖。版本探测不匹配时 staging 失败。
- `MARKUNE_DOCUMENT_EXPORT_ENGINE=legacy`：运行时诊断/紧急回滚开关，使 PDF 与 Word 使用原兼容引擎；默认值和其他值都优先使用专业引擎。
- `CODEX_HOME`：可选的共享 Codex 用户状态目录。未设置时 Markune 使用 `~/.codex`；显式值必须是工作区之外的既有绝对目录。Markune 会把解析后的值显式传给 App Server sidecar，以共享 ChatGPT/Codex CLI 的认证、配置、技能、MCP 与线程历史。
- `CODEX_SQLITE_HOME`：不控制 Markune 启动的 sidecar。Markune 会从子进程环境移除此变量，并以 `-c sqlite_home="<CODEX_HOME>"` 固定 SQLite 投影目录，防止相对路径按工作区 `cwd` 解析或项目配置把运行时状态写入知识库。
- `MARKUNE_CODEX_PROVIDER_API_KEY`：仅由桌面宿主在启用 `markune_custom` provider 时注入到 Codex sidecar 进程环境；对应 `CODEX_HOME/config.toml` 中 `[model_providers.markune_custom].env_key`。用户不应手动配置该变量，明文 Key 只存放在 OS keyring。
- `MARKUNE_UPDATER_PUBLIC_KEY`：只在发布构建时提供 Tauri CLI 生成的 `.key.pub` 文件原始单行 Base64 内容，由 `release:prepare` 校验解码后的 minisign 结构并写入 `.tauri-build/tauri.release.generated.json`。脚本兼容完整两行 minisign 输入并自动规范化为 Base64；普通开发和 Web 构建不需要该变量。
- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：只允许存在于 GitHub Actions Secrets 或受控本机发布环境，用于生成 updater artifact 签名；不得写入仓库、生成配置或日志。

## Tauri Config

- `src-tauri/tauri.conf.json` 的 `devUrl` 为 `http://localhost:3000`。
- macOS 主窗口使用 `titleBarStyle: Overlay`、隐藏系统标题，并通过 `trafficLightPosition: { x: 15, y: 26 }` 将原生红绿灯放入 44px 工作区标题栏的上部控制区。前端左上角工具组启动时使用 `8px` 安全回退，随后通过只读 `get_macos_titlebar_metrics` 命令取得 AppKit 红色关闭按钮在 WKWebView 坐标系中的实际中心线，使 32px 按钮组动态居中；侧栏、设置和 Git 面板的内容起点统一由“工具组顶边 + 32px 控件高度 + 6px 间距”派生，避免窗口控制区与工作区导航挤在同一视觉层。窗口 resize、重新聚焦或重新可见时重新测量，避免不同 macOS SDK 的原生标题栏布局差异造成偏移。macOS 原生标题保持为 `Markune`，文档切换不调用 `setTitle`，避免系统重新布局红绿灯；文档标题继续由标签页展示。Windows 和 Linux 仍同步原生窗口标题，且不应用 macOS 偏移。
- Next.js 开发产物写入 `.next-dev`，生产构建与桌面静态导出仍写入 `.next`；两者必须保持隔离，避免运行中的开发服务因并行构建清理产物而失效。
- 普通开发与 Web 构建使用 `tsconfig.json`，桌面静态导出在 `NEXT_OUTPUT=export` 时改用 `tsconfig.desktop.json`；桌面配置只检查 `.next` 类型并明确排除 `.next-dev`，避免临时移走 `app/api` 时读取开发服务生成的路由校验文件。
- `frontendDist` 为 `../out`，桌面构建依赖静态导出产物。
- 资源协议的静态范围仅允许 `$HOME/**/.markune/assets/files/**/*`。对于用户目录外、Windows 非系统盘或 macOS 外置卷上的工作区，Rust 仅在资产已经通过当前工作区索引、canonicalize 和 `.markune/assets/files` 边界校验后，向当前进程动态授权解析出的单个文件；不得授权整个工作区、磁盘或卷。
- opener 插件关闭了自动接管 `target="_blank"` 链接的全局点击脚本；桌面外链必须显式调用 `openUrl`，避免覆盖编辑器自身的链接交互规则。
- `bundle.externalBin` 包含 `binaries/codex`、`binaries/pandoc` 和 `binaries/typst`。`desktop:dev` 会在 Tauri 文件监听启动前运行幂等 staging，避免写入 `src-tauri` 时触发重复启动；桌面构建仍在 `beforeBuildCommand` 中 staging。生成的目标平台二进制位于 `src-tauri/binaries/*-{target-triple}` 且被 Git 忽略。
- Codex 运行时优先使用应用随附 sidecar；开发诊断时才依次检查 `MARKUNE_CODEX_BIN`、PATH 和 macOS ChatGPT App 内置 Codex。
- 自定义 Responses 端点使用固定 provider ID `markune_custom`：设置页通过 `codex_custom_provider_*` / `codex_auth_mode_set` 写入受控 `config.toml` 键与 keyring，保存后重启 App Server；不开放任意 config 键。
- 专业 Word/PDF 模板和第三方通知位于 `src-tauri/resources/document-export`。PDF 启用前必须由 Typst 字体清单确认平台存在受支持的中文字体；否则只降级 PDF，不影响专业 Word。兼容 PDF 注册内部 `markune-export://` 协议，但不扩大 `capabilities/default.json` 或 `assetProtocol.scope`。
- 多格式导入不新增文件协议或 capability。源文件访问只通过 `src-tauri/src/import.rs` 的限时授权与 Raw IPC；`assetProtocol.scope` 保持不变。
- 画板不新增文件协议或 capability。图稿场景、预览和组件库只通过 `src-tauri/src/drawings.rs` 的受限 Raw IPC 传输；缩略图以可撤销 Blob URL 展示，`assetProtocol.scope` 保持不变。
- `src-tauri/resources/skills/` 作为只读 Tauri bundle resource 随应用发布。运行时只接受同时包含 `markune-diagram` 与 `markune-mindmap` 的完整内置 Skill 根目录，并要求两者同时具有 `SKILL.md` 与 `agents/openai.yaml`；开发态暂存资源不完整时回退到源码资源目录，不读取渲染器提供的 Skill 物理路径。
- 基础 `src-tauri/tauri.conf.json` 使用 `endpoints: []` 与空 `pubkey` 保留结构有效但不可用的 updater 配置。Tag 发布时生成的 release override 注入 `https://github.com/Refinex-Space/markune/releases/latest/download/latest.json`、公钥、updater artifacts、macOS ad-hoc identity `-` 和 Windows passive 模式。渲染器不能覆盖 endpoint。
- Rust 侧 Tauri 依赖固定在 `2.11.x`，以约束 `with_webview` 平台类型；Windows 直接使用与当前 Wry 对齐的 `webview2-com 0.38.2`，macOS 使用 `objc2 0.6.4` 与 `objc2-*-kit 0.3.2`。Word 生成依赖精确锁定为 `docx 9.7.1`。

## Document Import Dependencies

导入转换依赖精确锁定为 `mammoth 1.12.0`、`pdfjs-dist 6.1.200`、`tesseract.js 7.0.0`、`@tesseract.js-data/eng 1.0.0`、`@tesseract.js-data/chi_sim 1.0.0`、`unified 11.0.5`、`rehype-parse 9.0.1`、`rehype-sanitize 6.0.0`、`rehype-remark 10.0.1`、`remark-parse 11.0.0`、`remark-frontmatter 5.0.0` 和 `remark-stringify 11.0.0`。DOCX 原生预检使用兼容 Rust 1.77 的 `zip 2.4.2`，只启用 `deflate`。

## Editor Dependency Integration

Markweave 0.10.1 将所有 `@tiptap/*` 运行时固定为 `3.29.2`；`pnpm-workspace.yaml` 的 `@tiptap/markdown` override 必须同步为 `3.29.2`，不得把 Markdown 扩展降级到旧 minor 后再与新版 Core/PM 混装。

`markweave@0.10.1` 与 `@markweave/react@0.10.1` 必须保持同版本。0.10.1 对 Markdown 执行 canonical whole-document parse，并在文本、选择、撤销、搜索和 TOC 完整 `ready` 后开放编辑；序列化遵循 GFM 词中下划线规则，已写入磁盘的 `doc\_review\_agent` 会在重新保存时收成 `doc_review_agent`。DOM 导出必须在 `ready` 后调用官方 `prepareMarkweaveEditorForOutput`，不能以固定等待或直接克隆未补齐 DOM 代替。媒体 resolver request 新增可选 `attempt` / `reason`；Markune 以 5 秒负缓存、恢复原因强制刷新、750 ms 文档恢复波合并、每批最多 2,048 个资产和 8 root / 8,192 entry 缓存边界接入。resolver URL 只是候选，图片只有真实 `load` 才确认成功；本地视频的 DOM-only bridge 复用同一 resolver 和 output 事件，但不得修改 PM 文档或持久化 Markdown。

Markune 图片剪贴板桥接只解析受控 `markune-asset://` 地址，并识别严格匹配 64 位资产 ID 与 UUID Drawing ID 的规范图稿引用；不得借此接受 `asset://`、`file://` 或任意自定义协议。Slash 附件经统一 `onSlashCommandUpload`（`kind: "attachment"`）写入工作区资产，文档持久化为不透明 `markune-asset://` 定位符与 `name`/`mimeType`/`size`；激活下载走宿主 `onAttachmentDownload`，不依赖 `http(s)` fallback。Live 模式由 Markweave 核心统一处理链接点击：普通链接不渲染原生 `target="_blank"`，同一次鼠标手势只允许一次安全 opener，`Ctrl/Cmd + 点击` 不得同时打开整行链接 composer；View 模式仍直接打开安全链接。内置 `/details` 折叠块、`askAi` 文本/表格请求和宿主驱动 `MarkweaveAiEditController` 保持原契约，均不增加环境变量、持久化 schema、HTTP API 或 Tauri capability。Markune 不应用历史本地补丁。升级 Markweave 时必须核对 npm tarball 与上游源码一致，并执行 canonical parse、ready、output barrier、图片/视频失败恢复、链接点击、AI 文本/表格、图稿富文本、附件上传下载、折叠块往返和纯文本粘贴回归测试。

`MarkdownEditor` 根级 capture 只对 HTTP(S) anchor 提前执行 `preventDefault()`，用于阻止 WKWebView 在 Markweave 冒泡处理前启动原生导航；事件必须继续传播，浏览器打开、链接源码、整行 composer 与 View 模式仍由 Markweave 决定。

目录图标注册表使用固定版本 `@iconify-json/tabler@1.2.37`（Tabler Icons 3.45.0），只在首次打开内置图标标签时动态加载本地数据，不请求 CDN，也不维护手工全量图标清单。其 MIT 许可文本随 Web/桌面静态资源保存在 `public/licenses/tabler-icons.txt`。

## App Settings

`src-tauri/src/settings.rs` 持久化全局设置。当前 schema version 为 `1`，包含 `storage.defaultProvider: local`、`appearance.pageWidthMode`（`standard` 或 `wide`）、`appearance.windowOpacity`（整数百分比 `70`–`100`，默认 `100`）、`appearance.showGitPanelEntry` 与 `appearance.showGitLogEntry`（分别控制工作区右上角 Git 面板和 Git 日志入口，均默认 `false`，不影响 Git Sync 能力）、`appearance.systemNavLayout`（`vertical` 或 `horizontal`，默认 `vertical`）、`appearance.systemNavCollapsed`（默认 `false`）、`appearance.fonts.ui`、`appearance.fonts.document`、`appearance.fonts.code`、`appearance.treeIconPicker.lastTab`（`builtin`、`emoji` 或 `local`，默认 `builtin`）与最多 20 个 `appearance.treeIconPicker.recentIcons`，以及 `calendar.expanded`（默认 `true`）和 `calendar.weekStartsOn`（`monday` 或 `sunday`，默认 `monday`）。

旧设置文件中的未知字段读取时会忽略；用户保存设置后仅写回当前 schema 支持的字段。

品牌迁移命令会在用户确认迁移旧工作区后，尝试把旧应用标识 `com.madora.app` 的设置复制到 `com.markune.app` 配置目录；现有 Markune 设置永不被覆盖。旧 Codex provider 表与 OS keyring 凭据采用同样的“目标不存在才迁移”规则，失败只产生迁移警告，不回滚已安全完成的工作区文件迁移。

## Codex Permission Profiles

Markune 不在自身设置或 `.markune` 中复制 Codex 权限配置。权限目录由共享 `CODEX_HOME/config.toml` 管理，App Server 通过 `permissionProfile/list` 返回内置 `:workspace`、`:read-only`、`:danger-full-access` 及用户定义的 `[permissions.<id>]` profile；`allowed: false` 的 profile 在界面中保持可见但不可选。

默认模式为 `:workspace + on-request + user`。替我审批使用同一 `:workspace` profile，仅把 reviewer 切换为 `auto_review`；完全访问使用 `:danger-full-access + never + user`；只读访问使用 `:read-only + on-request + user`。企业级 `requirements.toml` / MDM 限制由 `configRequirements/read` 读取，Markune 不开放 `config/read`、`config/value/write`、`config/batchWrite` 或实验功能写入接口。

## Workspace Metadata

每个工作区根目录下的 `.markune/workspace.json` 保存最近文档、目录展开状态、排序、每日笔记索引、Git Sync 偏好和目录节点外观。目录外观位于 `nodeState[relativePath].appearance`，支持 `builtin`、`emoji`、`local` 图标及 `preset`、`custom` 颜色；默认外观不写入节点状态。文档正文仍保存在工作区可见的 Markdown 文件中。

Inbox Capture 独立保存在 `.markune/inbox/cap_YYYYMMDD_HHMMSS_SSS_<uuid8>.md`，不写入 `workspace.json`，也不需要配置项或 schema 迁移。是否被 Git 跟踪完全遵循用户工作区自己的 ignore 规则，Markune 不改写 `.gitignore`。

图稿独立保存在 `.markune/drawings`，不写入 `workspace.json`。白板场景上限为 100 MiB；脑图内容上限为 10 MiB、2,000 个节点和 32 层；预览上限为 2 MiB、组件库为 20 MiB；标题最多 120 字符，图集最多 8 层。脑图运行库精确锁定 `mind-elixir@5.15.1`，不使用 React 包装层。历史 `meta.tags` 仅作存储兼容，仍按最多 10 个、每个 32 字符校验，但不提供产品入口。`ui-state.json` 只保存最近图稿和每图视口，缩放和平移不更新图稿内容时间。

`.markune` 不保存 AI 消息或 Codex 线程副本。旧 `.markune/ai-sessions` 路径已经停用，应在知识库中忽略；AI 会话的新建、恢复、命名、归档和删除完全由用户级 Codex Home 与 App Server 管理。

右侧元信息宽度继续保存在 `markune:workspace:right-panel-width`；AI 面板使用独立的 `markune:workspace:ai-panel-width`，避免两个面板的尺寸互相覆盖。

---
owner: refinex
updated: 2026-07-21
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Runbook

## Local Startup

```bash
pnpm install
pnpm dev
```

For desktop development:

```bash
pnpm desktop:dev
```

`pnpm dev` 和 `pnpm desktop:dev` 都固定使用 `3000` 端口。不要在同一仓库同时启动二者；重复启动会直接报告端口占用。开发产物位于 `.next-dev`，因此运行开发服务时可以执行使用 `.next` 的生产构建验证，二者不会互相清理产物。

## Verification

Start with the narrowest relevant check, then broaden:

```bash
pnpm test:run -- <path-or-pattern>
pnpm test:run
pnpm lint
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Large-document Acceptance

聚焦自动化先执行：

```bash
pnpm exec vitest run components/editor/__tests__/markdown-editor.test.tsx components/editor/__tests__/use-workspace-asset-uploader.test.ts components/editor/__tests__/markweave-image-paste.test.tsx components/workspace/__tests__/use-workspace-ai-sync.test.tsx components/workspace/__tests__/workspace-performance.test.ts
cargo test --manifest-path src-tauri/Cargo.toml assets::tests
pnpm exec tsc --noEmit
```

使用 Markweave 共享的 250 KB 文本、250 KB 有效媒体、250 KB 缺失媒体和 1 MB 压力夹具；不要提交用户手册原文或真实资产。浏览器前置基准在 Markweave 仓库运行 `pnpm benchmark:large-document`。最终门禁必须在真实 macOS WKWebView 与 Windows WebView2 各执行至少五轮冷/热测试，记录首屏、可编辑、逐键/IME paint、长任务、滚动帧率、序列化、保存、IPC、DOM/轻量 NodeView 和内存，并与同机 Typora 相对比较。

在 Madora URL 加 `?madoraPerf=1` 后，可从开发者控制台调用 `window.__MadoraPerformanceReport()` 导出脱敏 JSON。验证 100 次连续输入期间序列化计数为 0，500 ms idle 后只增加 1；普通输入资产 IPC 为 0，打开含 421 个唯一资源的文档最多增加 1。另需人工覆盖中文 IME、撤销重做、列表回车、跨块/全选复制、搜索替换、TOC 跳转、快速滚动后编辑、Live/Source 往返、导出、AI 发送和应用关闭 flush。任何保存失败都必须阻止切换/发送/退出并保留草稿。

For single-document export changes, run the focused suites first:

```bash
pnpm test:run -- components/workspace/__tests__/document-export-core.test.ts components/workspace/__tests__/document-export-word.test.ts components/workspace/__tests__/use-document-export.test.tsx components/workspace/__tests__/document-tree.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml export::tests
```

Then use a Markdown acceptance document containing Chinese and English text, H1-H6, nested/task lists, quotes, callouts, highlighted code, merged tables, formulas, Mermaid, local/remote images, link cards and enough content for multiple A4 pages. Verify:

- HTML follows the active Markweave theme, contains no runtime script, and opens with local images and attachment sidecars intact.
- PDF is multi-page A4 with selectable text, 18 mm margins, print backgrounds, repeated table headers and no browser URL header/footer.
- DOCX opens in Microsoft Word with heading hierarchy, nested lists, table merges, code/quote styles, embedded images and page numbers. Formula and Mermaid SVGs use 2× PNG fallback and are not expected to remain editable.
- Existing names are never overwritten and produce `标题 (1)` together with a matching `标题 (1).assets` directory.

Windows native PDF must be exercised in a packaged or desktop-dev WebView2 runtime. The macOS WKWebView path is complete only after compiling and exporting on a real Mac; Windows or cross-target checks do not replace that acceptance step.

For multi-format document import changes, stage local runtime resources and run the focused suites first:

```bash
pnpm import:stage
pnpm test:run -- components/workspace/__tests__/document-import-core.test.ts components/workspace/__tests__/document-import-pdf.test.ts components/workspace/__tests__/use-document-import.test.tsx components/workspace/__tests__/document-tree.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml import::tests
pnpm exec tsc --noEmit
pnpm lint
cargo check --manifest-path src-tauri/Cargo.toml
pnpm build:desktop:web
```

## Drawing Acceptance

画板相关改动先执行聚焦检查：

```bash
pnpm exec vitest run components/workspace/__tests__/drawing-integration.test.ts components/workspace/__tests__/workspace-global-search.test.ts components/workspace/__tests__/inbox-shell.test.ts components/editor/__tests__/markdown-editor.test.tsx
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml drawings::tests
pnpm build:desktop:web
```

构建后确认 `public/excalidraw-runtime/index.css` 与 `fonts/` 已生成，普通 `out/index.html` 没有预加载包含 Excalidraw 实现的动态 JS chunk，也没有静态引用 Excalidraw CSS。随后在真实桌面运行时验收：

- 入口位于 Inbox 下方且不创建 Markdown 标签；切换图集、编辑器、AI 和终端面板不会重置其他面板状态。
- 创建图稿后绘制中文文本、箭头、自由线、图片与框架；重启后场景、组件库、图集位置、最近列表和视口都能恢复。
- 连续编辑显示未保存/保存中/已保存；`Cmd/Ctrl+S` 强制提交。外部修改 scene 或 meta 后自动保存进入冲突，只有“加载磁盘版本”或“用当前版本覆盖”能继续。
- 导入 `.excalidraw` 与 `.excalidrawlib`，导出 JSON/PNG/SVG；导出同名时不得覆盖已有文件。回收站恢复遇到路径冲突时创建唯一名称。
- 破坏单个 scene 或 meta 后，其余图稿仍能展示；元数据可读且存在 backup 时可进入恢复页加载上一有效场景。损坏预览只降级为占位图，不能阻塞保存。
- 复制 Markdown 引用后，纯文本必须是 `[![标题](madora-asset://<snapshot-id>)](madora-drawing://<drawing-id>)`，不得包含 `asset://localhost` 或绝对路径；分别用富文本和纯文本剪贴板粘贴到 Live 模式，预览都应显示且点击能打开原图稿。旧版产生的精确 `\[!\[...\]\(...\)\]\(...\)` 转义形式打开后应自动恢复显示，并在下一次编辑保存时规范化。移动/重命名不影响回链，永久删除原图稿后文档快照仍可显示。
- 验证 500 幅图稿的图集滚动只按可见区域读取预览，并用包含多张图片的大场景检查 100 MiB 场景边界、保存等待和内存占用。

macOS WKWebView 与 Windows WebView2 都必须分别进行真实桌面验收；当前平台通过不能替代另一平台。损坏恢复时优先复制整个 `.madora/drawings` 作为工作区级备份，再通过 UI 加载 bundle 内的单份有效备份；不要手工编辑 revision 或 SHA 字段。

真实桌面验收使用一组 Markdown、HTML、DOCX、原生文本 PDF、扫描中文 PDF、扫描英文 PDF、加密 PDF 和损坏文件，覆盖相对图片、Windows 反斜杠、Unicode 文件名、data URI、远程 URL、重复图片与另一 Madora 工作区的资产。确认批量任务可部分成功、取消保留已提交文件、错误报告可查看、目录刷新并展开到首个成功文档；重启后图片仍可显示。

跨平台验收必须在真实 Windows 与 macOS 上使用同一夹具互相导入，至少覆盖 Windows 非系统盘和 macOS 外置卷。DOCX/PDF 是语义恢复而非像素级复刻；复杂公式、合并单元格、浮动文本框、矢量图或异常阅读顺序必须保留内容或出现明确警告，不能静默丢失。Windows 检查不能代替 macOS 验收。

For Harness/control-plane changes:

```bash
pnpm harness:check
python3 ~/.codex/skills/harness-init/scripts/harness_audit.py /Users/refinex/develop/project/refinex-wiki
wc -l AGENTS.md
```

## Inbox Acceptance

先运行 Inbox 聚焦检查，再执行前端和 Rust 全量验证：

```bash
pnpm exec vitest run components/workspace/__tests__/inbox-utils.test.ts components/workspace/__tests__/inbox-shell.test.ts components/workspace/__tests__/inbox-sidebar.test.tsx components/workspace/__tests__/use-inbox-controller.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml inbox::tests
cargo test --manifest-path src-tauri/Cargo.toml assets::tests::includes_inbox_markdown_but_skips_other_private_markdown
pnpm exec tsc --noEmit
pnpm lint
```

桌面验收至少覆盖以下流程：

- 在工作区按 `Cmd/Ctrl+Shift+I` 或点击“已归档”右侧的 `+`，确认自动切换到 Inbox、展开左侧栏并聚焦右侧主编辑区；空白草稿不会创建文件，输入非空正文后自动保存，重启后 `.madora/inbox` 中的 Capture 仍可读取。
- 确认 Inbox 激活后左侧目录树与 Daily 日历被紧凑 Capture 列表替换；左上角搜索切换为 Inbox 全状态搜索，退出 Inbox 后原文档树搜索词仍保留。
- 确认主编辑区不显示 Inbox/Capture 标题栏和标签入口，保存状态固定显示在右下角。通过 Capture 右键菜单和行尾 `…` 完成状态、优先级、流转、归档、取消归档、重新打开和二次确认删除；切换状态后条目应立即重新分组，优先级圆点按高红、普通蓝、低灰显示。历史 `snoozedUntil` 尚未到期的 Capture 继续显示在“稍后”，右键可“恢复待处理”；当前 UI 不再提供新增 snooze。侧栏徽标始终统计所有 `open/processing`，包括历史 snoozed Capture。
- Promote 的保存位置应以限高、内部滚动的目录树展示，支持逐级展开与按完整相对路径搜索，并排除 `Daily` 和隐藏目录。分别提升到根目录和普通子目录，确认唯一命名、创建时间、标签与 H1；Append 两次同一 Capture，Daily 的 `## Inbox` 下只能存在一个 `madora-capture:<id>` 标记。
- 在 Daily 已打开且有未保存草稿时执行 Append，确认本地草稿不会被静默覆盖，并通过现有外部文档冲突入口显式选择版本。
- Capture 引用本地资源后保存、删除和提升，确认资源只有在正式笔记、Daily 与其他 Capture 都不再引用时才被清理。
- 在用户工作区执行 `git status --short -- .madora/inbox`，确认 Git 是否发现 Capture 完全遵循该工作区自身 ignore 规则；Madora 不改写 `.gitignore`。

## Codex Session Storage

Madora 默认复用 `~/.codex`。检查当前 Codex 解析出的用户级目录时，使用经过脱敏的 doctor 输出，不要打印认证文件或完整报告：

```bash
codex doctor --json | jq '.checks["config.load"].details | {"CODEX_HOME": .CODEX_HOME, "sqlite home": ."sqlite home"}'
```

验收 AI 存储边界时，在知识库根目录执行：

```bash
git ls-files '.madora/ai-sessions/**'
test ! -d .madora/ai-sessions
```

两条命令都不应发现旧会话。随后在 Madora 新建会话并重启应用，线程应能通过 App Server 恢复，且知识库中不得重新生成 `.madora/ai-sessions`。不要用 SQLite 或 JSONL 文件存在性替代 `thread/list`、`thread/read` 的功能验证。

## Codex Permission Acceptance

桌面端权限验收必须使用真实 App Server turn，至少覆盖：默认请求审批同时显示允许与“拒绝并停止”；`decline` 后 agent 可继续，`cancel` 后 turn 中断；替我审批出现自动审查进度与风险结论；只读模式拒绝文件修改；完全访问切换先显示风险确认；自定义 `config.toml` profile 可选且 requirements 禁止的 profile 保持禁用。运行中 turn 或待审批请求存在时不得切换模式，重启并恢复线程后入口必须显示 App Server 返回的实际 profile 与 reviewer。

升级固定 Codex sidecar 时，重新执行 `app-server generate-json-schema --experimental`，核对 `permissionProfile/list`、`thread/settings/update`、`item/permissions/requestApproval`、命令审批候选和 `item/autoApprovalReview/*`，再运行 Rust 与前端契约测试。不得只凭现有 UI 继续兼容未知协议。

## Codex Startup Acceptance

首次启动桌面端并打开工作区后，不先打开 AI 面板，确认 App Server 已在后台启动；随后首次展开 AI 面板时应直接显示正常的新任务界面，不出现占满会话区的“正在连接 Codex”。在核心握手尚未完成时，输入区仍可编辑，点击发送后应显示轻量准备状态，核心成功后自动继续发送；启动失败时必须保留输入内容并显示可诊断错误。

分别模拟慢速或失败的 `model/list`、`thread/list`、`plugin/installed` 与 `skills/list`，确认：核心就绪后可以使用 App Server 默认模型发送，历史页显示独立加载、重试或空状态，启动过程不会预取 `mcpServerStatus/list`，但会按当前工作区自动加载已安装插件和 enabled Skill。展开加号菜单应显示“文件和文件夹”、可用时的“目标”、计划模式和已加载插件；插件仍在加载时显示轻量状态，失败时才提供重试且不阻塞输入。菜单必须完整位于输入框上方并与输入框保持间距。输入空白边界上的 `/` 应打开命令与 Skill 面板，目标和压缩命令位于“技能”分组上方，Skill 显示统一立方体图标、名称、描述与来源。选择目标后输入框显示目标提示，首次发送应依次出现 `turn/start` 与 `thread/goal/set`；状态条必须可编辑、暂停、恢复和清除，重开任务通过 `thread/goal/get` 恢复，续跑只由 Codex Core 驱动。折叠 AI 面板、切换到元信息面板再返回时，正在运行的 turn、Goal、草稿与线程状态必须保留；切换工作区根目录时才允许重建对应的 Codex 运行时边界。

使用真实安装的 Documents、PDF、Spreadsheets、Presentations 等插件检查加号菜单：本地 `composerIcon` 优先，其次使用当前明暗主题 logo，远程资源只允许 HTTPS；图标保持 `16 × 16`、完整缩放且不挤压名称和描述。切换浅色/深色主题后应使用相应资源。临时移除一个图标文件、提供错误格式或让远程图片加载失败时，只有该项降级为通用插件图标，其他插件仍可见且可插入 `plugin://{id}` mention。重新检测插件、切换工作区或重启 App Server 后，旧本地图标路径必须不可再读取。

在输入框分别插入文档、插件与 Skill：三者都应显示 `16 × 16` 图标并与文字基线对齐，文档使用文件图标，插件沿用菜单中的真实明暗主题图标，Skill 使用统一立方体图标；视觉标签不显示 `@` 或 `$`。发送后检查 App Server 请求：文档仍编码为带引号相对路径，插件模型文本恢复 `@Plugin` 并带 `plugin://` mention，Skill 模型文本恢复 `$skill-name` 并带精确的原生 `skill` 输入。伪造名称、未列出的路径或收到 `skills/changed` 后沿用旧授权都必须被 Rust 拒绝。

前端回归至少执行：

```bash
pnpm test:run -- components/workspace/__tests__/ai-panel-startup.test.tsx components/workspace/__tests__/ai-panel-rendering.test.tsx components/workspace/__tests__/right-side-panel.test.tsx
pnpm exec tsc --noEmit
pnpm lint
pnpm build:desktop:web
```

## Codex File Change Acceptance

使用真实桌面 turn 验收 AI 文件刷新时，先打开一个 Markdown 文档并让 Codex 修改当前文件、新建另一个文件，再通过 shell 命令修改第二个已打开标签。确认：

- 发送前未保存草稿先写入磁盘，保存失败时消息不发送且输入仍保留；
- patch 流式更新期间编辑器不闪烁，fileChange 成功完成后当前文档自动显示新内容；
- turn 完成后所有已打开 Markdown 标签和目录树均与磁盘一致，新建文件可从树中打开；
- 用户在 Codex 运行期间继续编辑同一文档时，本地草稿不会被覆盖，自动保存暂停，并显示两个带确认的冲突处理动作；
- 最终回答后展示“已编辑 N 个文件”、净增删行数和前三个文件，展开后显示其余文件；工作区内现存 Markdown 可点击，删除项、非 Markdown 与工作区外路径不可点击；
- 失败或拒绝的 fileChange 不触发文档重载，简单问答不生成空的文件变更摘要。

前端验证至少执行：

```bash
pnpm test:run -- components/workspace/__tests__/ai-panel-state.test.ts components/workspace/__tests__/ai-panel-rendering.test.tsx components/workspace/__tests__/use-workspace-ai-sync.test.tsx
pnpm exec tsc --noEmit
pnpm lint
pnpm build:desktop:web
```

## Desktop Packaging

Build the Tauri web export first when debugging static export issues:

```bash
pnpm build:desktop:web
```

Then run the desktop build target required by the task, for example:

```bash
pnpm desktop:build -- --no-bundle
pnpm desktop:build -- --bundles dmg --no-sign
```

## Rollback

For source changes, prefer `git diff` inspection followed by targeted `git restore <path>` only for files intentionally changed in the current task. Do not revert unrelated user work.

回滚画板功能时，定向恢复本次前端、Rust、脚本、依赖与文档文件，并删除由 staging 生成且已被 Git 忽略的 `public/excalidraw-runtime`。不要删除用户工作区的 `.madora/drawings`；旧图稿 bundle 是可直接交给 Excalidraw 的用户数据，应保留到确认无需恢复后再另行处理。

旧 `.madora/ai-sessions` 若尚未提交删除，可在对应知识库仓库中定向 `git restore`。提交删除后旧内容仍存在于 Git 历史；彻底清除需要单独批准历史重写，不能作为常规回滚或清理步骤执行。

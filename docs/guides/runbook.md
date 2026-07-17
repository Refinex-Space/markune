---
owner: refinex
updated: 2026-07-17
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

## Verification

Start with the narrowest relevant check, then broaden:

```bash
pnpm test:run -- <path-or-pattern>
pnpm test:run
pnpm lint
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

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

真实桌面验收使用一组 Markdown、HTML、DOCX、原生文本 PDF、扫描中文 PDF、扫描英文 PDF、加密 PDF 和损坏文件，覆盖相对图片、Windows 反斜杠、Unicode 文件名、data URI、远程 URL、重复图片与另一 Madora 工作区的资产。确认批量任务可部分成功、取消保留已提交文件、错误报告可查看、目录刷新并展开到首个成功文档；重启后图片仍可显示。

跨平台验收必须在真实 Windows 与 macOS 上使用同一夹具互相导入，至少覆盖 Windows 非系统盘和 macOS 外置卷。DOCX/PDF 是语义恢复而非像素级复刻；复杂公式、合并单元格、浮动文本框、矢量图或异常阅读顺序必须保留内容或出现明确警告，不能静默丢失。Windows 检查不能代替 macOS 验收。

For Harness/control-plane changes:

```bash
pnpm harness:check
python3 ~/.codex/skills/harness-init/scripts/harness_audit.py /Users/refinex/develop/project/refinex-wiki
wc -l AGENTS.md
```

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

旧 `.madora/ai-sessions` 若尚未提交删除，可在对应知识库仓库中定向 `git restore`。提交删除后旧内容仍存在于 Git 历史；彻底清除需要单独批准历史重写，不能作为常规回滚或清理步骤执行。

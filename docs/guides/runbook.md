---
owner: refinex
updated: 2026-07-16
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

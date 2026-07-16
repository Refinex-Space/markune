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

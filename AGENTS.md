# AGENTS.md

## Project
Madora is a local knowledge-base desktop app built with Next.js App Router, React, TypeScript, Tauri v2, and a Markdown-first editor powered by `@refinex/markora`.

## Environment And Commands
- Install: `pnpm install`
- Web dev: `pnpm dev`
- Desktop dev: `pnpm desktop:dev`
- Frontend tests: `pnpm test:run`
- Focused Vitest: `pnpm test:run -- <path-or-pattern>`
- Lint: `pnpm lint`
- Web build: `pnpm build`
- Desktop web export: `pnpm build:desktop:web`
- Tauri/Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Harness check: `pnpm harness:check`

## Repository Boundaries
- Do not commit secrets or real API keys. UploadThing credentials must stay in local environment or secret storage.
- Do not change CI, signing, installer, Tauri permissions, asset protocol scope, or infrastructure manifests without calling that out separately.
- Preserve the Markdown-first storage model: persisted documents are `.md`; avoid reintroducing Plate/Slate document projections.
- Keep Tauri defaults and frontend mirrors aligned for user settings such as `appearance.pageWidthMode`.
- For multi-file changes, present a plan first and wait for confirmation.
- Run the smallest relevant test first, then broader checks.
- Answer in Chinese unless a generated artifact has a different established language.
- If adding code comments, mark author as `refinex`.

## Definition Of Done
- The narrowest relevant tests/checks have run, followed by the broader checks appropriate to the touched layer.
- Docs touched by architecture, config, API, security, or runbook changes are updated through the knowledge map.
- Delivery includes change summary, verification, risk, rollback, and next step.
- Unrelated dirty work is preserved.

## Knowledge Map
- Architecture and module boundaries -> read `docs/architecture/overview.md` before design, refactor, editor/workspace shell, or Tauri boundary changes.
- Config and environment -> read `docs/config/reference.md` before changing env vars, package scripts, Next/Tauri config, storage defaults, or desktop build behavior.
- Coding standards -> read `docs/standards/coding.md` before implementation or test changes.
- API standards -> read `docs/standards/api.md` before touching `app/api`, Tauri commands, UploadThing routes, workspace APIs, Git APIs, or terminal APIs.
- Security standards -> read `docs/standards/security.md` before secrets, permissions, filesystem, asset protocol, uploads, terminal, Git, or local data handling.
- Domain terms -> read `docs/domain/glossary.md` when naming workspace, document, asset, editor, or Git concepts.
- Runbook -> read `docs/guides/runbook.md` for local startup, package, verification, incident recovery, or rollback work.
- Release/update -> read `docs/guides/release-and-update.md` before changing application versions, updater behavior, signing, release workflows, installers, GitHub Releases, or download-site integration.
- Historical plans/specs -> read `docs/README.md` when comparing current code with older superpowers plans or implementation specs.

## Knowledge Maintenance
- Stable facts go into the routed docs file and update its `updated` date.
- Add a knowledge-map line only when future agents need a new "when to read" route.
- Do not put long architecture notes, stale plans, or unreferenced docs in this file.

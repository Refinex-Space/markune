---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Coding Standards

## General

- Follow the existing TypeScript, React, and Rust style in the touched files.
- Prefer existing workspace APIs and UI primitives before adding abstractions.
- Keep changes localized to the layer being changed: editor, workspace shell, API bridge, or Tauri command.
- Preserve unrelated dirty files and generated output.
- Use `refinex` in any new code comment that needs an author marker.

## Frontend

- Workspace UI is client-heavy and centered around `components/workspace/workspace-layout.tsx`.
- Use existing component tests under `components/**/__tests__` as the first verification target for UI behavior.
- Keep Markweave editor page-width behavior aligned across `settings.rs`, frontend default settings, editor wrapper classes, and settings UI.
- Keep `MarkdownEditor` as a Markdown string boundary: parse frontmatter before passing content to Markweave and serialize it back when saving.
- Avoid broad UI rewrites when a narrow component-level change is enough.

## Rust/Tauri

- Tauri commands are registered in `src-tauri/src/lib.rs`.
- Keep filesystem, terminal, Git, and settings behavior in their existing Rust modules.
- Run `cargo test --manifest-path src-tauri/Cargo.toml` when Rust command behavior changes.

## Testing

Run the smallest relevant test first, for example `pnpm test:run -- components/workspace/__tests__/workspace-global-search.test.ts`, then broaden to `pnpm test:run` and build/lint checks as appropriate.

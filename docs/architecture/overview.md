---
owner: refinex
updated: 2026-07-11
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Architecture Overview

Madora is a desktop-first local knowledge-base app. The default page renders `WorkspaceLayout` from `app/page.tsx`, and the workspace shell owns the document tree, editor tabs, search dialog, Git panels, terminal panel, settings dialog, and side panels under `components/workspace`.

## Runtime Shape

- Web shell: Next.js App Router with React client components.
- Editor: `components/editor/markdown-editor.tsx` wraps `@markweave/react` / `markweave` as a controlled Markdown editor. The app shell keeps frontmatter serialization, save shortcuts, page-width classes, workspace asset URL conversion, and selection context for the right AI panel.
- Desktop shell: Tauri v2 from `src-tauri`, with `src-tauri/tauri.conf.json` pointing production desktop builds at `../out`.
- Native boundary: React calls Tauri commands through `components/workspace/workspace-api.ts`; command implementations live in `src-tauri/src`.
- Local state: app settings are persisted by `src-tauri/src/settings.rs`; browser panel widths use local storage keys in `workspace-layout.tsx`; AI panel conversation history is persisted per workspace under `.madora/ai-sessions/`.
- AI settings boundary: `src-tauri/src/ai_settings.rs` scans and mutates Claude-compatible local configuration surfaces for models, skills, commands, custom agents, MCP servers, and plugins. It also stores Anthropic account metadata under `~/.madora/anthropic-accounts.json` while imported OAuth tokens stay in the system secret store. The right AI panel reads `AiSettings` defaults from app settings and passes selected `modelId`, Codex thinking, extended thinking, and agent mode through `start_ai_session`; `src-tauri/src/agent_runtime.rs` maps those session options to the local Codex or Claude command protocol and injects the active Anthropic account token into the Claude process environment when available.

## Main Modules

- `app/`: Next.js routes and API handlers.
- `components/editor/`: Markdown editor, front matter, TOC, and workspace asset upload helpers.
- `components/workspace/`: desktop workspace shell, tree, tabs, search, Git UI, terminal UI, and Tauri API bridge.
- `components/ui/`: shared UI primitives.
- `src-tauri/src/`: Rust commands for assets, Git, settings, terminal, AI settings, AI runtime sessions, and workspace filesystem behavior.
- `scripts/`: local build helpers, currently including the Tauri web export wrapper.

## Storage And Editor Boundary

Persisted knowledge documents are Markdown files. Keep the disk format, in-memory draft model, and editor input/output aligned around Markdown strings. Do not introduce a second rich-text projection layer unless a separate plan explicitly covers migration, compatibility, and rollback.

Markweave receives only the Markdown body after frontmatter parsing. Save paths must serialize the protected frontmatter back around `onUpdate.markdown`; the update payload is lazily serialized, so the host must read only the fields it needs. The controlled value echoes the emitted Markdown back to Markweave, avoiding redundant content comparisons during normal typing. Markweave emits standard Markdown where possible and uses supported HTML fallback only for formatting that Markdown cannot express; preserve that fallback as Markdown source rather than stripping or projecting it into another model. The app fixes the built-in TOC at `innerTocPlacement="container"` so its layout follows the editor frame rather than the browser viewport. New local uploads are written into Markdown as workspace-root relative paths under `.madora/assets/files/{shard}/{hash}.{ext}`. Existing `madora-asset://{assetId}` references are legacy read/preview compatible and should not be batch-migrated without a separate content migration plan.

## Desktop Build Boundary

`scripts/build-tauri-web.mjs` temporarily moves `app/api` out of the Next static export path, sets `NEXT_OUTPUT=export`, runs the web build, and restores the API directory in `finally`. Changes to this flow need both web build and desktop packaging verification.

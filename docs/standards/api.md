---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Next.js API Routes

- `app/api/ai/copilot/route.ts` accepts a request-provided `apiKey` or falls back to `AI_GATEWAY_API_KEY`.
- `app/api/link-preview/route.ts` resolves generic link metadata for Web/dev usage. It must keep SSRF protections: only `http`/`https`, no credentialed URLs, no localhost/private/link-local/multicast targets, redirect validation, timeout, and bounded response size.
- `app/api/uploadthing/route.ts` exposes the UploadThing route handler configured by `lib/uploadthing.ts`.
- Do not log prompts, uploaded file URLs, API keys, or user local paths unless a task explicitly requires a sanitized diagnostic.

## Tauri Command Bridge

- Frontend calls should flow through `components/workspace/workspace-api.ts`.
- Rust command registration belongs in `src-tauri/src/lib.rs`.
- Command implementation modules are split by domain: `assets.rs`, `git.rs`, `link_preview.rs`, `settings.rs`, `system_fonts.rs`, `terminal.rs`, and `workspace.rs`.
- `system_fonts.rs` should expose only system font family names and recommendation metadata; do not return font file paths, file contents, or user-local font directory details to the frontend.
- Desktop-only network features should use Tauri commands instead of depending on `app/api`, because desktop production builds statically export the frontend and remove Next API routes.
- Keep TypeScript request/response types aligned with Rust command payloads.
- AI panel conversation history uses Tauri commands in `agent_runtime.rs` and frontend wrappers in `workspace-api.ts`; persisted records stay inside the selected workspace at `.madora/ai-sessions/`.

## Local Files And Assets

Workspace document APIs should preserve Markdown source files. Asset APIs should stay within the configured Tauri asset protocol and local workspace asset conventions. `upload_workspace_asset` returns both the legacy `url` and the new `relativePath`; new Markdown writes should use `relativePath`, while cleanup and preview helpers must still understand legacy `madora-asset://{assetId}` references.

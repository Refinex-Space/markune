---
owner: refinex
updated: 2026-09-01
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
- Keep `MarkdownEditor` as a Markdown string boundary at load/flush, not at every transaction: parse frontmatter before initial Markweave content, let Markweave perform one canonical whole-document parse, and do not treat the editor as usable until its load state is `ready`. Keep `onUpdate` payloads lazy, and read `payload.markdown` only in the shared 500 ms/manual/navigation/AI/exit flush path. Preserve supported HTML fallback and abort the caller when flush/save fails.
- Large-document media resolution must use the editor-level `resolveMediaSource` bridge. Mount the canonical Markdown body before visual resources complete; de-duplicate unique IDs, split native calls into batches of at most 2,048, and merge all results. Share positive, finite negative and in-flight results across Tab remounts within the 8-root/8,192-entry bounds. `missing` / `unreadable` expire after 5 seconds; `retry`, `image-error`, `output` or `attempt > 1` must force recovery while requests from the same document are coalesced for 750 ms.
- A resolver return value is only a display candidate; media success requires the real element load event. Keep image resolution in Markweave and local-video resolution in the DOM-only bridge. Neither path may write display URLs to ProseMirror, Markdown, undo history or a whole-document string replacement, and stale work must be rejected by Abort, source and workspace-generation checks.
- DOM snapshot and print export must wait for Markweave `ready`, call the official output barrier, inspect its missing/unreadable/timed-out report, and only then clone or sanitize the DOM. Markdown serialization continues to read the complete PM document and does not wait for visual work.
- Keep only the three most recently selected document EditorViews mounted. Inactive instances must be non-interactive and hidden without changing the active editor ref; keep their document revision key stable when the same draft moves between the live workspace state and the tab session cache.
- Pass the effective `next-themes` value to every rendered `MarkweaveEditor` as `theme` and `canvasColor="var(--background)"`; do not rely on shell CSS alone for Markweave overlays, Mermaid, link cards or canvas background.
- Route Markweave link-card metadata only through `markweave-link-card-resolver.ts`. Keep its desktop and Web branches bounded and cancellation-aware; a failed lookup must return `null` so editing retains a normal Markdown link.
- Keep link interaction semantics in Markweave. The existing editor-root capture boundary may only call `preventDefault()` for HTTP(S) anchors to stop WKWebView native navigation before bubbling; it must not stop propagation, call an opener, or compete with selection, link-source, composer, View-mode, or Ctrl/Cmd-click behavior.
- Keep the workspace editor TOC on `innerTocPlacement="container"`; page-width behavior is owned by the editor frame, not browser-viewport positioning.
- Avoid broad UI rewrites when a narrow component-level change is enough.

## Rust/Tauri

- Tauri commands are registered in `src-tauri/src/lib.rs`.
- Keep filesystem, terminal, Git, and settings behavior in their existing Rust modules.
- Run `cargo test --manifest-path src-tauri/Cargo.toml` when Rust command behavior changes.

## Testing

Run the smallest relevant test first, for example `pnpm test:run -- components/workspace/__tests__/workspace-global-search.test.ts`, then broaden to `pnpm test:run` and build/lint checks as appropriate.

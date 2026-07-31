---
owner: refinex
updated: 2026-07-21
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Domain Glossary

- Workspace: a local root directory selected for knowledge-base work.
- Workspace node: a document or directory item in the workspace tree.
- Document: a Markdown file in the workspace.
- Markdown draft: the in-memory editable Markdown state for an opened document.
- Markweave: the Markdown-first editor package used by this app through `@markweave/react` and `markweave`.
- Page width mode: user-facing editor width setting, currently `standard` or `wide`.
- Workspace asset: a local file associated with workspace content and exposed through Tauri asset handling. Markdown uses the stable `madora-asset://{assetId}` identity, while `.madora/assets/index.json` maps that identity to a physical `.madora/assets/files/{shard}/{hash}.{ext}` file. Older relative-path references remain readable and normalize only after successful resolution.
- Export directory grant: a one-use, expiring Rust-side authorization for one user-selected local folder; renderer code only receives its opaque ID and display path.
- Document export bundle: one primary HTML, Markdown, or Word file plus optional `{stem}.assets` sidecar files committed without overwriting existing paths.
- Document import grant: a 15-minute Rust-side authorization for user-selected source files; the renderer receives only opaque grant/source IDs and source metadata, never absolute paths.
- Prepared import document: the normalized Markdown, title, asset manifest, warnings and PDF/OCR metadata produced before a document import commit.
- Import commit session: a per-document staging transaction that validates and de-duplicates assets, replaces `madora-import://asset/{token}` placeholders with `madora-asset://{hash}`, and writes one uniquely named Markdown document.
- Global search: client-side full-text Markdown search over workspace documents.
- Drawing: an Excalidraw scene with a stable UUID identity, stored outside the Markdown document tree and indexed as a separate global-search result type.
- Drawing album: a nested physical directory under `.madora/drawings/albums` used to organize drawings; it is derived from location rather than stored in `meta.json`.
- Drawing bundle: one drawing directory containing the authoritative `scene.excalidraw`, schema-v1 metadata, one valid backup pair and an optional WebP preview.
- Drawing save session: an opaque Rust-side staging transaction that receives scene and preview bytes through Raw IPC, validates revision and SHA-256, then atomically commits a new bundle revision.
- Drawing snapshot: a content-addressed static WebP workspace asset used by Markdown references; later edits to the source drawing do not mutate the snapshot.
- Drawing back-link: a stable `madora-drawing://{drawing-id}` link that opens the source drawing without depending on its title or album path.
- Drawing context reference: a turn-scoped active or explicit `@` reference identified only by a stable Drawing UUID; Rust resolves authoritative metadata and authorizes bounded `inspect_drawing` access without exposing the bundle path.
- Inbox: the workspace capture and triage center for Markdown fragments that are not yet formal notes, Daily entries, or tasks. Inbox search is separate from global document search.
- Daily: one ordinary Markdown document for a calendar date, stored at `Daily/YYYY/MM/YYYY-MM-DD.md`. The Daily overview selects and summarizes dates without creating files; creation remains an explicit action.
- Capture: one lightweight Markdown fragment stored under `.madora/inbox`, identified by its file name and carrying triage metadata in camelCase frontmatter.
- Triage: deciding whether a Capture should remain open, be processed, be promoted to a Note, be appended to Daily, be completed, archived, or deleted. Legacy snoozed Captures remain recoverable as open items.
- Promote: creating a normal uniquely named Markdown Note from a Capture while retaining the Capture as a resolved record linked through `promotedTo`.
- Append to Daily: adding a Capture under the current Daily note's `## Inbox` section with an idempotency marker, then linking the resolved Capture through `appendedTo`.
- Git panel: workspace UI for Git status, diff, staging, commit, branches, log, push, revert, and delete flows.
- Git Sync: workspace-level Git automation for committing local changes, pulling remote updates, pushing to the configured remote, and recording sync preferences in `.madora/workspace.json`.
- Terminal panel: workspace UI backed by Tauri terminal commands.
- Codex permission profile: a named App Server permission boundary such as `:workspace`, `:read-only`, `:danger-full-access`, or a user-defined `[permissions.<id>]` entry in shared `config.toml`; it controls what the agent can access, independently from who reviews approvals.
- Codex approval reviewer: `user` or `auto_review`, deciding who evaluates an escalation without changing the active permission profile itself.
- Codex Skill: an App Server-discovered capability identified by a canonical name and absolute `SKILL.md` path; Madora selects it from the `/` panel, sends `$skill-name` plus a native `skill` input, and never treats its path as a general renderer file grant.
- Codex context attachment: a 15-minute opaque native grant for a selected file/folder or an in-memory pasted bitmap; image grants become real App Server visual `image` inputs, while non-image grants remain permission-controlled local path context.
- Attachment preview: a bounded PNG derived by Rust and delivered through Raw IPC for UI display; it is not the original file, a filesystem grant, or a persisted Madora asset.

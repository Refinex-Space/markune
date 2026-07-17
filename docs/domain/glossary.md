---
owner: refinex
updated: 2026-07-16
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
- Global search: client-side full-text Markdown search over workspace documents.
- Git panel: workspace UI for Git status, diff, staging, commit, branches, log, push, revert, and delete flows.
- Git Sync: workspace-level Git automation for committing local changes, pulling remote updates, pushing to the configured remote, and recording sync preferences in `.madora/workspace.json`.
- Terminal panel: workspace UI backed by Tauri terminal commands.

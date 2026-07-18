---
owner: refinex
updated: 2026-07-18
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
- Inbox: the workspace capture and triage center for Markdown fragments that are not yet formal notes, Daily entries, or tasks. Inbox search is separate from global document search.
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

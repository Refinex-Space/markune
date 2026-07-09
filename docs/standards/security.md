---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Security Standards

## Secrets

- Never commit real API keys, UploadThing secrets, signing credentials, tokens, or production credentials.
- `AI_GATEWAY_API_KEY` may be named in docs and code, but real values must stay in local environment or secret storage.
- Redact local absolute paths from shared logs when they reveal private user data outside this repository.

## Desktop Permissions

- Treat `src-tauri/capabilities/default.json`, Tauri plugins, shell/process access, terminal support, and asset protocol scope as security-sensitive.
- Do not widen filesystem, process, shell, opener, or asset protocol permissions without explicit approval and focused verification.
- Terminal and Git features operate on local workspaces; avoid implicit operations outside the selected workspace root.
- Preferred Editor external opens must use fixed app-id allowlists and existing local file/directory paths only; never pass arbitrary user-provided command names to process execution.

## Uploads And AI

- UploadThing accepts broad file categories for editor uploads. Validate any expansion of upload behavior against user data exposure and storage expectations.
- Markweave local file uploads must stay inside the workspace asset directory and return display URLs through Tauri asset handling. Persisted Markdown should store only workspace-root relative `.madora/assets/files/...` paths or legacy `madora-asset://...` references already present in user documents; do not widen the Tauri asset protocol scope for editor uploads.
- AI route changes must preserve abort handling and must not expose keys or raw upstream errors to the client.
- AI conversation history may contain user prompts, assistant output, tool inputs, and local command/file references. Store it only inside the selected workspace metadata area and never include API keys, auth tokens, or provider secrets.
- AI Assistant Models > API Keys may collect Codex, OpenAI, or Anthropic Override tokens, but the UI must send them only to the Tauri secret-store commands. App settings may store non-secret model/base URL override metadata, never raw tokens.
- AI Assistant Anthropic account management may store account metadata in `~/.madora/anthropic-accounts.json`, including ids, display names, email addresses, active account id, and timestamps. This file must never include OAuth tokens, API keys, bearer tokens, or credential-like headers. Imported or Claude Code OAuth sandbox-returned Anthropic OAuth tokens must be stored only in the system secret store and removed when the corresponding account is deleted. Claude Code OAuth may send `MADORA_DESKTOP_AUTH_TOKEN` only as the outbound `x-desktop-token` header to the configured auth API; do not return it to frontend state, write it to app settings, log it, or place real values in tests/docs. Legacy fallback to the `anthropic-override` secret may expose only a metadata row such as `legacy-default`; the token value must not be returned to the frontend or written to app settings.
- AI Assistant MCP inventory must expose only env key names. If the settings UI writes MCP env values, write them only to the user's local Claude-compatible config files and never mirror them into app settings, tests, docs examples, or logs.
- AI Assistant plugin MCP servers must require explicit approval before discovery. Pending plugin MCP servers may be listed from installed plugin manifests, but must not execute stdio commands or connect to HTTP URLs until their identifier is approved in `.claude/settings.json`.
- AI Assistant MCP stdio tool discovery may execute user-configured local MCP commands. Keep discovery bounded by timeouts, pass only a minimal safe process environment plus the explicit MCP env config, and never log or serialize env values.
- AI Assistant MCP HTTP tool discovery may connect to user-configured MCP URLs and may use configured HTTP headers such as `Authorization` only for the outbound request. Do not return, log, or mirror MCP header values to frontend state or app settings. The settings UI may write bearer tokens into local Claude-compatible MCP config headers, but list/detail responses may expose only non-secret auth metadata such as `authType` and whether an authorization header exists.
- AI Assistant Claude Code MCP OAuth may open the user's browser and listen only on a loopback callback address for the authorization code. OAuth access and refresh tokens may be written to local Claude-compatible MCP config fields (`headers.Authorization` and `_oauth`) for Claude SDK/runtime compatibility, but they must never be returned in inventory responses, stored in app settings, logged, or mirrored into tests/docs as real values. Logout must remove local OAuth credential fields while preserving the non-secret server definition.
- AI Assistant Codex MCP integration may call the local `codex mcp` CLI for list/add/remove/login/logout and may probe enabled stdio/HTTP servers for tool metadata. Treat Codex CLI JSON output as potentially containing secret-bearing header or env references: resolved env/header values may be used only for the local MCP process or outbound MCP HTTP request. Return only server metadata, env key names, auth state, and tool names/descriptions; never return bearer token values or resolved header values.
- AI Assistant Codex subscription login may spawn the local `codex login` process and open the first non-loopback URL emitted by that process. Treat process output as transient login state: it may be returned to the active modal for user-visible progress, but it must not be written to app settings, docs examples, tests as real values, or persistent logs. Never accept or open localhost callback URLs from this output through the external opener.

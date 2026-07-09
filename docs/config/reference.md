---
owner: refinex
updated: 2026-07-09
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Config Reference

## Package Scripts

- `pnpm dev`: starts the Next.js development server.
- `pnpm desktop:dev`: starts Tauri development mode using `src-tauri/tauri.conf.json`.
- `pnpm test:run`: runs Vitest once.
- `pnpm lint`: runs ESLint.
- `pnpm build`: runs a normal Next.js build.
- `pnpm build:desktop:web`: runs `scripts/build-tauri-web.mjs` for Tauri static export.
- `pnpm desktop:build`: runs `tauri build`.
- `pnpm harness:check`: runs repo-local Harness governance checks.

## Environment Variables

- `NEXT_OUTPUT=export`: enables static export behavior in `next.config.ts`.
- `TAURI_DEV_HOST`: overrides the host used for non-production desktop asset prefix logic.
- `AI_GATEWAY_API_KEY`: optional server-side fallback key for `app/api/ai/copilot/route.ts`. Never document or commit real values.

## Tauri Config

- `src-tauri/tauri.conf.json` sets `devUrl` to `http://localhost:3000`.
- `frontendDist` is `../out`, so desktop builds depend on the static export output.
- `beforeDevCommand` is `npm run dev`; `beforeBuildCommand` is `npm run build:desktop:web`.
- The desktop asset protocol scope allows files under `$HOME/**/.madora/assets/files/**/*`.

## App Settings

`src-tauri/src/settings.rs` owns persisted app settings. The current schema is `schemaVersion: 1`, `storage.defaultProvider: local`, `appearance.pageWidthMode` as `standard` or `wide`, `appearance.fonts.ui`, `appearance.fonts.document`, `appearance.fonts.code`, and `ai` model/profile/preference metadata. Frontend defaults mirror this shape in workspace components.

`appearance.fonts.ui` controls application chrome such as sidebars, toolbars, and settings. `appearance.fonts.document` controls Markdown editor and reading-mode article text. `appearance.fonts.code` controls code blocks and inline code. The desktop settings page obtains available font family names through the Tauri `list_system_fonts` command and persists only the selected family names.

`ai.enabledProfileId` remains in the schema for backward compatibility, but the product UI no longer exposes an "enable profile" selector. The right AI panel auto-selects the first available local assistant profile detected from Codex or Claude Code. `ai.profiles[]` stores profile metadata such as `id`, `label`, `kind`, `providerId`, `providerLabel`, `modelId`, `modelLabel`, `enabled`, and `isTestRuntime`. Test fixtures may still use `fake-echo`.

The desktop AI Assistant settings area follows the 1Code-style information architecture: Models, Skills, Custom Agents, MCP Servers, and Plugins. `ai.defaultAgentMode`, `ai.extendedThinkingEnabled`, `ai.hiddenModelIds`, `ai.includeCoAuthoredBy`, `ai.lastSelectedCodexModelId`, `ai.lastSelectedCodexThinking`, and `ai.lastSelectedModelId` store model and run defaults for the AI panel and settings UI. `ai.desktopNotificationsEnabled`, `ai.soundNotificationsEnabled`, and `ai.notifyWhenFocused` control AI permission/completion notifications. `ai.ctrlTabTarget` follows 1Code's Quick Switch preference: when set to `workspaces`, Ctrl+Tab cycles workspace document tabs and Alt+Ctrl+Tab opens the AI panel; when set to `agents`, those targets are swapped. `ai.autoAdvanceTarget` follows 1Code's Auto-advance preference for the current workspace removal flow: `next` switches to the next recent workspace, `previous` switches to the previous recent workspace, and `close` leaves the workspace closed. `ai.preferredEditor` selects a fixed allowlisted macOS app id used by `open_path_in_preferred_editor` when opening workspace nodes from the sidebar menu. `ai.customClaudeConfig.model` and `ai.customClaudeConfig.baseUrl` store the non-secret Override Model fields shown in Models > API Keys. These fields must not store credentials.

The Models settings page can detect local assistant accounts through the Tauri `detect_ai_accounts` command. Detection checks `codex` and `claude` binaries, command paths, versions, Codex `app-server` plus `exec` support, and Claude Code `--print --output-format stream-json` support; it must not read token files or persist account credentials. Detected local profiles use metadata-only kinds such as `codex_app_server` or `claude_cli`. Codex subscription connection follows 1Code's CLI session flow through `get_codex_integration`, `start_codex_login`, `get_codex_login_session`, `cancel_codex_login`, and `open_codex_login_url`: the runtime checks `codex login status`, spawns a local `codex login` process, captures the first non-loopback login URL, opens it through Tauri, and polls the process result. Codex subscription logout uses `logout_codex_account`, which runs `codex logout`, verifies with `codex login status`, and reports an error if Codex still appears connected. Models settings also stores hidden model IDs and default model preferences; it may render 1Code-compatible model labels for settings parity, while runtime model discovery for the right AI panel still uses `list_ai_agent_models`. 1Code-style Anthropic account management uses `list_ai_anthropic_accounts`, `start_ai_claude_code_auth`, `poll_ai_claude_code_auth_status`, `open_ai_claude_code_oauth_url`, `submit_ai_claude_code_auth_code`, `import_ai_anthropic_account_token`, `set_ai_anthropic_account_active`, `rename_ai_anthropic_account`, and `delete_ai_anthropic_account`; these commands store only account metadata such as id, display name, email, active account id, and timestamps in `~/.madora/anthropic-accounts.json`. Claude Code OAuth start follows the 1Code sandbox protocol against `https://21st.dev/api/auth/claude-code/start` by default, can override the base URL with `MADORA_CLAUDE_CODE_AUTH_API_URL`, and requires a local desktop auth token in `MADORA_DESKTOP_AUTH_TOKEN` for the `x-desktop-token` header. OAuth tokens returned by the sandbox are stored through the system secret store and are read only when starting a Claude local assistant session. When no new multi-account metadata exists, `list_ai_anthropic_accounts` and Claude runtime token selection fall back to the legacy `anthropic-override` secret as a `legacy-default` account without exposing the secret value. Models > API Keys writes Codex, OpenAI, and Anthropic Override API tokens through `save_ai_provider_secret`; the AppSettings JSON only stores non-secret override model/base URL fields.

The Skills, Custom Agents, MCP Servers, and Plugins settings pages use Tauri inventory commands for local Claude-compatible and Codex configuration: `list_ai_skills`, `list_ai_commands`, `list_ai_custom_agents`, `list_ai_mcp_servers`, and `list_ai_plugins`. These commands scan user, project, and enabled plugin locations such as `.claude/skills`, `.claude/commands`, `.claude/agents`, `.mcp.json`, `.claude.json`, `.claude/settings.json`, and `.claude/plugins/marketplaces`. MCP env values must never be returned to the frontend; only env key names may be displayed. For enabled stdio MCP servers, `list_ai_mcp_servers` may briefly start the configured local command to perform MCP `initialize` and `tools/list` discovery. For enabled HTTP MCP servers, it may issue bounded JSON-RPC `initialize` and `tools/list` requests to the configured URL, using configured HTTP headers only for the outbound request. HTTP MCP create/update supports `authType` values `none`, `oauth`, and `bearer`; bearer tokens are written only into the local Claude-compatible `headers.Authorization` field and list responses expose only `authType` plus whether an authorization header exists. Claude Code MCP OAuth uses a loopback callback server for the browser authorization flow, then writes `headers.Authorization` and `_oauth` token metadata only to `.mcp.json` or `.claude.json`; logout clears those local credential fields without storing them in app settings. Codex MCP inventory uses `codex mcp list --json` and maps Codex global servers into the same MCP Servers settings page under the `CODEX` group; enabled Codex stdio and HTTP servers are probed for tools with resolved local env and HTTP header values, but responses expose only env key names, auth metadata, and tool names/descriptions. Codex create/delete/auth/logout actions call `codex mcp add`, `codex mcp remove`, `codex mcp login`, and `codex mcp logout`, with create currently forced to Codex global scope to match 1Code behavior. Plugin-provided MCP servers are listed as `pending-approval` until their `{pluginSource}:{serverName}` identifier is present in `.claude/settings.json` `approvedPluginMcpServers`; pending servers must not run tools discovery. This lets the settings panel show 1Code-style tool details and mark auth-required HTTP servers as `needs-auth`.

Writable AI Assistant settings are limited to user/project-owned configuration. `create_ai_skill`, `update_ai_skill`, `delete_ai_skill`, `create_ai_command`, `update_ai_command`, and `delete_ai_command` write Markdown files under `.claude/skills` and `.claude/commands`. `create_ai_custom_agent`, `update_ai_custom_agent`, and `delete_ai_custom_agent` write `.claude/agents/*.md`. For Claude Code MCP, `create_ai_mcp_server`, `set_ai_mcp_server_enabled`, `delete_ai_mcp_server`, `authenticate_ai_mcp_server`, and `logout_ai_mcp_server` write project `.mcp.json` or global `.claude.json`; plugin-provided MCP server definitions remain read-only in this UI. For Codex MCP, `create_ai_mcp_server`, `delete_ai_mcp_server`, `authenticate_ai_mcp_server`, and `logout_ai_mcp_server` delegate to the local Codex CLI and do not write app settings. `set_ai_plugin_enabled` only updates `.claude/settings.json` `enabledPlugins`. `set_ai_plugin_mcp_server_approved` updates `.claude/settings.json` `approvedPluginMcpServers` for 1Code-compatible plugin MCP approval and revocation.

`ai.providers` remains in the settings schema for backward compatibility with older provider-runtime experiments. Provider metadata must still not store API keys, bearer tokens, session tokens, or credential-like custom headers.

Do not persist API keys, access tokens, or session credentials in app settings. Real provider credentials must stay in environment variables or secret storage. The provider IDs currently used by the Models API Keys UI are `codex`, `openai`, and `anthropic-override`. `MADORA_DESKTOP_AUTH_TOKEN` is a local runtime secret for the Claude Code OAuth sandbox start request and must not be committed.

## Workspace Metadata

每个工作区根目录下的 `.madora/workspace.json` 存储工作区级元数据，字段：

- `schemaVersion`：固定为 `1`。
- `recentDocumentPaths`：最近打开文档的绝对路径列表，上限 5，最新在前；应用重启后用于恢复空状态的「最近文档」。
- `expandedPaths`：目录树展开状态（预留）。
- `sortOrder`：目录树拖拽排序记录。
- `dailyNotes`：每日笔记索引，包含最近选中日期 `selectedDate` 和 `entries` 日期映射。每日笔记正文仍保存在工作区可见 Markdown 文件 `Daily/YYYY/MM/YYYY-MM-DD.md`，`.madora/workspace.json` 只保存路径、是否有实际内容的标记和更新时间。
- `gitSync`：当前工作区的 Git Sync 偏好，包含是否启用 `enabled`、同步频率 `intervalMinutes`、差异处理策略 `conflictResolution` 和上次同步时间 `lastSyncedAt`。远程仓库地址从真实 Git remote 读取，不在工作区元数据中保存副本。

打开文档时通过 `record_recent_document` 命令即时落盘；已删除/重命名的路径在展示层用工作区快照过滤，不从文件清理。旧的 `recentDocumentPath`（单数）字段在读取时迁移进新列表后即淘汰，新写入的文件不再包含该字段。

本地资源文件存储在 `.madora/assets/files/{shard}/{hash}.{ext}` 下。新上传资源写入 Markdown 时使用工作区根相对路径，例如 `.madora/assets/files/ab/{hash}.png`。旧 `madora-asset://{assetId}` 仅作为 legacy 读取、预览和清理兼容格式保留，不作为新写入格式。

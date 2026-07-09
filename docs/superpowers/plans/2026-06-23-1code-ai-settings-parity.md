---
owner: refinex
updated: 2026-06-23
status: active
referenced_by: docs/README.md#historical-superpowers-plans
---

# 1Code AI Settings Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the AI-related settings capabilities from `/Users/refinex/Downloads/1code-main` into Madora so the settings panel exposes the same Models, Skills, Custom Agents, MCP Servers, Plugins, and AI Preferences behavior with Madora's Tauri/Next architecture.

**Architecture:** Keep Madora's Next.js + Tauri boundary. Port 1Code's Electron/tRPC backend behavior into Rust Tauri commands and TypeScript workspace API wrappers; port 1Code's settings layout into focused React components under `components/workspace/ai-settings`. Preserve current AI chat runtime while replacing the settings surface and adding the same persisted AI preferences used by model selection.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Tauri v2, Rust, serde/serde_json, std filesystem/process APIs, existing shadcn-style UI primitives.

---

## Source Of Truth

- 1Code reference UI:
  - `/Users/refinex/Downloads/1code-main/src/renderer/features/settings/settings-sidebar.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/features/settings/settings-content.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-preferences-tab.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-custom-agents-tab.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-mcp-tab.tsx`
  - `/Users/refinex/Downloads/1code-main/src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
- 1Code reference backend:
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/skills.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/commands.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/agents.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/agent-utils.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/plugins.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/plugins/index.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/trpc/routers/claude-settings.ts`
  - `/Users/refinex/Downloads/1code-main/src/main/lib/claude-config.ts`
- Madora targets:
  - `components/workspace/workspace-settings-page.tsx`
  - `components/workspace/workspace-settings.ts`
  - `components/workspace/workspace-types.ts`
  - `components/workspace/workspace-api.ts`
  - `components/workspace/ai-panel/ai-panel-content.tsx`
  - `src-tauri/src/settings.rs`
  - `src-tauri/src/agent_runtime.rs`
  - new `src-tauri/src/ai_settings.rs`
  - new `components/workspace/ai-settings/*`

## File Structure

- Create `src-tauri/src/ai_settings.rs`: filesystem scanners and safe mutators for 1Code-style skills, slash commands, custom agents, plugins, Claude settings, and MCP config snapshots.
- Modify `src-tauri/src/lib.rs`: register AI settings commands.
- Modify `src-tauri/src/settings.rs`: extend `AiSettings` with 1Code-style preferences: `hiddenModelIds`, `lastSelectedModelId`, `lastSelectedCodexModelId`, `lastSelectedCodexThinking`, `extendedThinkingEnabled`, `defaultAgentMode`, and `includeCoAuthoredBy` mirror state where appropriate.
- Modify `components/workspace/workspace-types.ts` and `components/workspace/workspace-settings.ts`: mirror Rust schema and defaults.
- Modify `components/workspace/workspace-api.ts`: add typed wrappers for AI settings commands.
- Create `components/workspace/ai-settings/ai-settings-types.ts`: shared React-side command result types.
- Create `components/workspace/ai-settings/ai-settings-models.tsx`: Models tab, model visibility, account sections, API key section shell.
- Create `components/workspace/ai-settings/ai-settings-preferences.tsx`: Extended Thinking, Default Mode, Include Co-Authored-By, and default model preference surfaces.
- Create `components/workspace/ai-settings/ai-settings-skills.tsx`: two-pane Skills and slash Commands list/detail/create/edit/delete.
- Create `components/workspace/ai-settings/ai-settings-agents.tsx`: two-pane custom agents list/detail/create/edit.
- Create `components/workspace/ai-settings/ai-settings-mcp.tsx`: two-pane MCP servers list/detail/add/delete/toggle refresh.
- Create `components/workspace/ai-settings/ai-settings-plugins.tsx`: two-pane plugins list/detail/toggle and component inventory.
- Create `components/workspace/ai-settings/ai-settings-common.tsx`: shared resizable two-pane shell, search row, empty states, safe badges, and keyboard navigation.
- Modify `components/workspace/workspace-settings-page.tsx`: replace the single AI section with the 1Code AI settings navigation group.
- Modify `components/workspace/ai-panel/ai-panel-content.tsx`: use persisted model visibility and default model choices from the new AI settings.
- Add/modify tests under `components/workspace/__tests__` and `src-tauri/src/ai_settings.rs` unit tests.
- Update `docs/config/reference.md`, `docs/architecture/overview.md`, and `docs/README.md` to document the new AI settings boundary.

## Security Rules

- Never persist API keys, bearer tokens, OAuth tokens, or credential-like headers in Madora app settings.
- Skill/command/agent write operations may only target `~/.claude/{skills,commands,agents}` or `<workspace>/.claude/{skills,commands,agents}`.
- Plugin operations may only read plugin manifests and component files under `~/.claude/plugins/marketplaces`.
- Plugin enable/disable writes only `enabledPlugins` in `~/.claude/settings.json`.
- Plugin MCP approval writes only `approvedPluginMcpServers` in `~/.claude/settings.json`.
- MCP create/update/delete for Claude writes only `~/.claude.json` global or selected project scope; Codex MCP support starts with safe read/list/add global config and must not widen Tauri permissions.
- Display environment variable names only, never values.

## Tasks

### Progress Notes

- 2026-06-24 second batch:
  - Added and verified 1Code-style Preferences fields for Desktop Notifications, Sound Notifications, Notify When Focused, Quick Switch, Auto-advance, Preferred Editor, and Share Usage Analytics.
  - Preferred Editor now exposes the full 1Code preferences editor list: Cursor, Zed, Sublime Text, Xcode, Windsurf, Trae, iTerm, Warp, Terminal, Ghostty, VS Code, VS Code Insiders, IntelliJ IDEA, WebStorm, PyCharm, PhpStorm, GoLand, CLion, Rider, Fleet, and RustRover.
  - Verified Skills/Commands and Custom Agents create/edit/delete coverage through React and Rust tests; detail autosave behavior matches the 1Code-style blur/model-change flow implemented in this batch.
  - Verified MCP server enable/disable, delete, OAuth auth/logout, plugin MCP approval/revoke, and plugin enable/disable paths through React and Rust tests.
  - Plugins detail now projects MCP server status from the MCP inventory and exposes 1Code-style `Sign in` when a plugin MCP server needs auth.
  - Stabilized the OAuth callback test path so default parallel `cargo test` passes instead of requiring serial execution.
  - Remaining before closing the plan: final requirement-by-requirement parity audit against every listed 1Code source file and screenshots; do not treat this plan as complete until that audit is done.

### Task 1: Baseline And AI Settings Schema

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-settings.ts`
- Modify: `src-tauri/src/settings.rs`
- Test: `components/workspace/__tests__/workspace-settings.test.ts`

- [ ] Add failing TypeScript tests that `withDefaultAppSettings` returns 1Code-style AI defaults:
  - `extendedThinkingEnabled: true`
  - `defaultAgentMode: "agent"`
  - `hiddenModelIds: ["gpt-5.1-codex-max", "gpt-5.1-codex-mini"]`
  - `lastSelectedModelId: "opus"`
  - `lastSelectedCodexModelId: "gpt-5.3-codex"`
  - `lastSelectedCodexThinking: "high"`
- [ ] Run `pnpm test:run -- components/workspace/__tests__/workspace-settings.test.ts` and verify the new test fails because fields are absent.
- [ ] Add matching TypeScript types/defaults.
- [ ] Add failing Rust settings tests for the same defaults and secret rejection preservation.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml settings::` and verify the new Rust test fails because fields are absent.
- [ ] Implement Rust schema/defaults and validation.
- [ ] Rerun both focused tests until green.

### Task 2: Tauri AI Settings Filesystem Service

**Files:**
- Create: `src-tauri/src/ai_settings.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `components/workspace/workspace-api.ts`
- Create: `components/workspace/ai-settings/ai-settings-types.ts`
- Test: Rust unit tests in `src-tauri/src/ai_settings.rs`
- Test: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] Add Rust tests using `tempfile` for parsing `SKILL.md`, command `.md`, agent `.md`, marketplace plugins, `.mcp.json`, `settings.json`, and `.claude.json`.
- [ ] Verify tests fail because commands/module do not exist.
- [ ] Implement safe scanners:
  - `list_ai_skills(root_path)`
  - `list_ai_commands(root_path)`
  - `list_ai_custom_agents(root_path)`
  - `list_ai_plugins()`
  - `list_ai_mcp_servers(root_path)`
- [ ] Implement safe mutators:
  - create/update/delete user/project skills
  - create/update/delete user/project commands
  - create/update user/project agents
  - set plugin enabled
  - approve/revoke plugin MCP servers
  - add/remove/toggle editable MCP servers
- [ ] Add TypeScript wrappers and tests proving invoke names/payloads match Rust commands.
- [ ] Rerun Rust and API focused tests.

### Task 3: Settings Navigation And Models/Preferences UI

**Files:**
- Modify: `components/workspace/workspace-settings-page.tsx`
- Create: `components/workspace/ai-settings/ai-settings-common.tsx`
- Create: `components/workspace/ai-settings/ai-settings-models.tsx`
- Create: `components/workspace/ai-settings/ai-settings-preferences.tsx`
- Test: `components/workspace/__tests__/workspace-settings.test.ts`
- Test: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] Add failing React tests for AI Assistant navigation items: Models, Skills, Custom Agents, MCP Servers, Plugins.
- [ ] Add failing React tests for Models tab search, model visibility toggles, Anthropic Accounts, Codex Account, API Keys collapsed section.
- [ ] Add failing React tests for Preferences Extended Thinking, Default Mode, Include Co-Authored-By, default model persistence behavior.
- [ ] Implement navigation and first two tabs matching 1Code layout.
- [ ] Rerun focused tests until green.

### Task 4: Skills And Custom Agents UI

**Files:**
- Create: `components/workspace/ai-settings/ai-settings-skills.tsx`
- Create: `components/workspace/ai-settings/ai-settings-agents.tsx`
- Modify: `components/workspace/workspace-settings-page.tsx`
- Test: `components/workspace/__tests__/workspace-settings.test.ts`

- [ ] Add failing tests for two-pane Skills and Commands list grouped by Project/User/Plugin.
- [ ] Add failing tests for read-only plugin item detail and editable user/project item detail.
- [ ] Add failing tests for create/edit/delete skill and command actions calling `workspace-api` wrappers.
- [ ] Add failing tests for custom agents grouped by Project/User, model select, prompt edit, and create action.
- [ ] Implement the tabs from 1Code behavior with Madora UI primitives.
- [ ] Rerun focused tests until green.

### Task 5: MCP Servers And Plugins UI

**Files:**
- Create: `components/workspace/ai-settings/ai-settings-mcp.tsx`
- Create: `components/workspace/ai-settings/ai-settings-plugins.tsx`
- Modify: `components/workspace/workspace-settings-page.tsx`
- Test: `components/workspace/__tests__/workspace-settings.test.ts`

- [ ] Add failing tests for MCP server grouped list, status dots, refresh, add form, delete action, enabled toggle, and tool list detail.
- [ ] Add failing tests for plugin grouped list, active/disabled toggle, version/source/tags, components, MCP auth/status display, and cross-tab navigation.
- [ ] Implement MCP and Plugins tabs from 1Code behavior with Madora wrappers.
- [ ] Rerun focused tests until green.

### Task 6: Right AI Panel Integration

**Files:**
- Modify: `components/workspace/ai-panel/ai-panel-content.tsx`
- Test: `components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`

- [ ] Add failing tests that hidden model IDs are excluded from selectors.
- [ ] Add failing tests that default Claude/Codex model and Codex thinking preference are respected for new sessions.
- [ ] Add failing tests that Extended Thinking preference is passed into Claude runtime dispatch where supported.
- [ ] Implement integration without breaking current conversation persistence and local assistant runtime.
- [ ] Rerun focused AI panel tests.

### Task 7: Documentation And Full Verification

**Files:**
- Modify: `docs/config/reference.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/README.md`

- [ ] Update config docs to replace local-assistant-first settings guidance with 1Code parity guidance.
- [ ] Update architecture docs with `ai_settings.rs` responsibility and local filesystem trust boundary.
- [ ] Run focused tests:
  - `pnpm test:run -- components/workspace/__tests__/workspace-settings.test.ts`
  - `pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts`
  - `pnpm test:run -- components/workspace/ai-panel/__tests__/ai-panel-content.test.tsx`
  - `cargo test --manifest-path src-tauri/Cargo.toml ai_settings::`
  - `cargo test --manifest-path src-tauri/Cargo.toml settings::`
- [ ] Run broad checks:
  - `pnpm test:run`
  - `pnpm lint`
  - `pnpm build`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] Do a final requirement-by-requirement parity audit against the 1Code source files and screenshots.

## Completion Criteria

- Settings sidebar exposes the same AI-related group as 1Code: Models, Skills, Custom Agents, MCP Servers, Plugins, plus AI-related Preferences.
- Models tab has search, visibility toggles, Anthropic Accounts, Codex Account, and API Keys section with secret-safe behavior.
- Skills tab includes both Skills and slash Commands from project, user, and enabled plugin sources.
- Custom Agents tab reads and writes Claude-compatible agent Markdown files.
- MCP Servers tab lists Claude Code and Codex server groups, shows connection/tool details, and supports safe add/remove/toggle.
- Plugins tab scans marketplaces, shows component inventory, supports enable/disable, and handles plugin MCP approval state.
- Preferences includes Extended Thinking, Default Mode, Include Co-Authored-By, and default model selection behavior equivalent to 1Code's persisted last-selected model atoms.
- Right AI panel uses the new settings for default/hidden model behavior without regressing existing session persistence.
- No API key, bearer token, OAuth token, or credential-like header is persisted to app settings or rendered in logs.

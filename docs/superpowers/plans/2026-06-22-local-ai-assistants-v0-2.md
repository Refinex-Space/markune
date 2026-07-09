# Local AI Assistants v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recenter the AI settings and runtime on local Codex and Claude Code assistants, removing custom provider UI from the settings panel and making local assistant detection plus invocation the primary shipped path.

**Architecture:** React settings only manages local assistant profiles. `workspace-api.ts` remains the frontend facade. `src-tauri/src/agent_runtime.rs` owns CLI discovery, capability probing, session lifecycle, process invocation, and streamed UI events. Provider settings stay in the persisted schema for backward compatibility but are no longer exposed or selected by the settings panel.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Tauri v2, Rust, serde, std process management.

---

## Scope

In scope:

- Remove Providers / API Key / Base URL controls from the AI settings panel.
- Show Codex and Claude Code as first-class local assistant cards with provider SVG icons.
- Detect Codex `app-server` support and Claude Code `stream-json` callable support.
- Stop the right AI panel from preferring provider-direct runtime.
- Make `codex_app_server` and `claude_cli` profiles available when their local capabilities are detected.
- Implement a conservative invocation bridge that emits `ai:event` deltas from local CLI output.
- Update config docs to describe the local-assistant-first boundary.

Out of scope:

- Removing provider schema or secret-store commands from the codebase.
- Adding custom provider UI.
- Broad permission changes, installer changes, signing changes, or CI changes.
- Granting local agents implicit file write/apply privileges from the UI.

## Tasks

- [ ] Update UI tests to assert the AI settings panel shows local assistants and no provider/API-key controls.
- [ ] Simplify `AiSettingsSection` around local assistant accounts, profile selection, runtime metadata, and SVG icons.
- [ ] Update AI search terms and visible fields so provider/secret fields no longer control settings UI.
- [ ] Remove provider-direct selection from `AiPanelContent`; select only enabled local runtime profiles.
- [ ] Extend `agent_runtime.rs` detection for Codex app-server and Claude Code stream-json callability.
- [ ] Implement session prompt dispatch for local assistants with bounded output and event emission.
- [ ] Update TypeScript/Rust tests and docs.
- [ ] Verify narrow tests first, then full frontend/Rust/build checks.

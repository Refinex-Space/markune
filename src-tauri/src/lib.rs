mod agent_runtime;
mod ai_http;
mod ai_secret;
mod ai_settings;
mod assets;
mod git;
mod link_preview;
mod settings;
mod system_fonts;
mod terminal;
mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(agent_runtime::AgentRuntimeState::default())
        .manage(terminal::TerminalState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            agent_runtime::list_ai_agent_profiles,
            agent_runtime::detect_ai_accounts,
            agent_runtime::logout_codex_account,
            agent_runtime::get_codex_integration,
            agent_runtime::start_codex_login,
            agent_runtime::get_codex_login_session,
            agent_runtime::cancel_codex_login,
            agent_runtime::open_codex_login_url,
            agent_runtime::list_ai_agent_models,
            agent_runtime::list_ai_conversations,
            agent_runtime::read_ai_conversation,
            agent_runtime::save_ai_conversation,
            agent_runtime::read_ai_conversation_v2,
            agent_runtime::save_ai_conversation_v2,
            agent_runtime::list_ai_conversations_v2,
            agent_runtime::start_ai_session,
            agent_runtime::send_ai_prompt,
            agent_runtime::cancel_ai_turn,
            agent_runtime::respond_ai_permission,
            agent_runtime::stop_ai_session,
            ai_http::request_ai_provider_json,
            ai_http::request_ai_chat,
            ai_http::request_ai_chat_stream,
            ai_settings::list_ai_skills,
            ai_settings::list_ai_commands,
            ai_settings::list_ai_custom_agents,
            ai_settings::list_ai_mcp_servers,
            ai_settings::list_ai_plugins,
            ai_settings::set_ai_claude_include_co_authored_by,
            ai_settings::list_ai_anthropic_accounts,
            ai_settings::set_ai_anthropic_account_active,
            ai_settings::rename_ai_anthropic_account,
            ai_settings::delete_ai_anthropic_account,
            ai_settings::start_ai_claude_code_auth,
            ai_settings::poll_ai_claude_code_auth_status,
            ai_settings::submit_ai_claude_code_auth_code,
            ai_settings::open_ai_claude_code_oauth_url,
            ai_settings::set_ai_plugin_enabled,
            ai_settings::set_ai_plugin_mcp_server_approved,
            ai_settings::set_ai_plugin_mcp_servers_approved,
            ai_settings::create_ai_skill,
            ai_settings::update_ai_skill,
            ai_settings::delete_ai_skill,
            ai_settings::create_ai_command,
            ai_settings::update_ai_command,
            ai_settings::delete_ai_command,
            ai_settings::create_ai_custom_agent,
            ai_settings::update_ai_custom_agent,
            ai_settings::delete_ai_custom_agent,
            ai_settings::create_ai_mcp_server,
            ai_settings::set_ai_mcp_server_enabled,
            ai_settings::update_ai_mcp_server,
            ai_settings::delete_ai_mcp_server,
            ai_settings::authenticate_ai_mcp_server,
            ai_settings::logout_ai_mcp_server,
            ai_settings::import_ai_anthropic_account_token,
            ai_secret::get_ai_provider_secret_status,
            ai_secret::save_ai_provider_secret,
            ai_secret::delete_ai_provider_secret,
            assets::upload_workspace_asset,
            assets::resolve_workspace_asset,
            assets::read_workspace_asset_data,
            git::git_probe,
            git::git_init,
            git::git_status,
            git::git_remote_info,
            git::git_diff,
            git::git_commit_file_diff,
            git::git_branches,
            git::git_log,
            git::git_commit_files,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_push,
            git::git_sync_now,
            git::git_revert_file,
            git::git_delete_file,
            link_preview::resolve_link_preview,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            settings::read_app_settings,
            settings::save_app_settings,
            system_fonts::list_system_fonts,
            workspace::ensure_workspace,
            workspace::open_path_in_preferred_editor,
            workspace::record_recent_document,
            workspace::set_workspace_node_state,
            workspace::save_workspace_git_sync_settings,
            workspace::open_daily_note,
            workspace::list_daily_notes_for_month,
            workspace::load_workspace_tree,
            workspace::create_workspace_root,
            workspace::read_markdown_document,
            workspace::save_markdown_document,
            workspace::create_markdown_document,
            workspace::migrate_plate_documents_to_markdown,
            workspace::read_plate_document,
            workspace::save_plate_document,
            workspace::create_plate_document,
            workspace::create_workspace_directory,
            workspace::rename_workspace_node,
            workspace::delete_workspace_node,
            workspace::move_workspace_node,
            workspace::read_markdown_source_files,
            workspace::read_import_source_files,
            workspace::create_imported_plate_documents,
            workspace::write_export_file,
        ])
        .setup(|app| {
            if cfg!(target_os = "windows") {
                if let Some(window) = app.get_webview_window("main") {
                    window.set_decorations(false)?;
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

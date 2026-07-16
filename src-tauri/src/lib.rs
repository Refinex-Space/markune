mod assets;
mod codex;
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
        .manage(terminal::TerminalState::default())
        .manage(codex::CodexState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            assets::upload_workspace_asset,
            assets::resolve_workspace_asset,
            assets::read_workspace_asset_data,
            codex::codex_runtime_probe,
            codex::codex_runtime_start,
            codex::codex_runtime_stop,
            codex::codex_app_server_request,
            codex::codex_app_server_respond,
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

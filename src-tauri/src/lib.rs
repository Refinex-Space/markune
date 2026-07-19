mod assets;
mod codex;
mod drawings;
mod export;
mod git;
mod import;
mod inbox;
mod link_preview;
mod settings;
mod system_fonts;
mod terminal;
mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let export_state = export::ExportState::default();
    let export_protocol_state = export_state.clone();

    tauri::Builder::default()
        .manage(terminal::TerminalState::default())
        .manage(codex::CodexState::default())
        .manage(drawings::DrawingState::default())
        .manage(export_state)
        .manage(import::ImportState::default())
        .register_uri_scheme_protocol("madora-export", move |_context, request| {
            export_protocol_state.protocol_response(&request)
        })
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
            codex::codex_app_server_respond_user_input,
            codex::read_codex_plugin_icon,
            codex::select_codex_context_attachments,
            codex::release_codex_context_attachments,
            drawings::load_drawing_library,
            drawings::read_drawing_meta,
            drawings::read_drawing_scene,
            drawings::read_drawing_preview,
            drawings::read_drawing_library,
            drawings::read_drawing_ui_state,
            drawings::write_drawing_ui_state,
            drawings::create_drawing,
            drawings::begin_drawing_save,
            drawings::stage_drawing_scene,
            drawings::stage_drawing_preview,
            drawings::commit_drawing_save,
            drawings::cancel_drawing_save,
            drawings::rename_drawing,
            drawings::move_drawing,
            drawings::duplicate_drawing,
            drawings::trash_drawing,
            drawings::restore_drawing,
            drawings::permanently_delete_drawing,
            drawings::create_drawing_album,
            drawings::rename_drawing_album,
            drawings::move_drawing_album,
            drawings::delete_drawing_album,
            drawings::duplicate_drawing_album,
            drawings::trash_drawing_album,
            drawings::restore_drawing_album,
            drawings::permanently_delete_drawing_album,
            drawings::begin_drawing_library_write,
            drawings::write_drawing_library,
            drawings::select_drawing_import_sources,
            drawings::read_drawing_import_source,
            drawings::import_drawing_from_grant,
            drawings::import_drawing_library_from_grant,
            drawings::release_drawing_import_grant,
            drawings::select_drawing_export_target,
            drawings::write_drawing_export,
            drawings::begin_drawing_markdown_snapshot,
            drawings::create_drawing_markdown_snapshot,
            export::select_document_export_directory,
            export::write_document_export_bundle,
            export::print_document_pdf,
            import::select_document_import_sources,
            import::read_document_import_source,
            import::begin_document_import_commit,
            import::stage_document_import_asset,
            import::stage_document_import_source_asset,
            import::commit_document_import,
            import::cancel_document_import,
            import::release_document_import_grant,
            inbox::list_inbox_captures,
            inbox::read_inbox_capture,
            inbox::create_inbox_capture,
            inbox::update_inbox_capture,
            inbox::delete_inbox_capture,
            inbox::promote_inbox_capture,
            inbox::append_inbox_capture_to_daily,
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

mod app_update;
mod assets;
mod codex;
mod codex_provider;
mod document_converter;
mod drawings;
mod export;
mod git;
mod graph;
mod import;
mod inbox;
mod link_preview;
mod settings;
mod system_fonts;
mod terminal;
mod window_chrome;
mod window_opacity;
mod workspace;

use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    Emitter,
};

#[cfg(target_os = "macos")]
const OPEN_SETTINGS_MENU_ITEM_ID: &str = "madora-open-settings";
#[cfg(target_os = "macos")]
const OPEN_SETTINGS_EVENT: &str = "madora-open-settings";
#[cfg(target_os = "macos")]
const CHECK_UPDATE_MENU_ITEM_ID: &str = "madora-check-update";
#[cfg(target_os = "macos")]
const CHECK_UPDATE_EVENT: &str = "madora-check-update";

#[cfg(target_os = "macos")]
fn build_macos_application_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let app_menu = menu
        .items()?
        .into_iter()
        .filter_map(|item| item.as_submenu().cloned())
        .find(|submenu| {
            submenu
                .text()
                .is_ok_and(|text| text == app.package_info().name)
        })
        .ok_or_else(|| tauri::Error::from(std::io::Error::other("缺少 macOS 应用菜单")))?;

    let open_settings = MenuItem::with_id(
        app,
        OPEN_SETTINGS_MENU_ITEM_ID,
        "设置…",
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let check_update = MenuItem::with_id(
        app,
        CHECK_UPDATE_MENU_ITEM_ID,
        "检查更新…",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    app_menu.insert_items(&[&open_settings, &check_update, &separator], 2)?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let export_state = export::ExportState::default();
    let export_protocol_state = export_state.clone();

    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(build_macos_application_menu)
        .on_menu_event(|app, event| {
            if event.id() == OPEN_SETTINGS_MENU_ITEM_ID {
                if let Err(error) = app.emit(OPEN_SETTINGS_EVENT, ()) {
                    log::error!("无法打开设置页面: {error}");
                }
            } else if event.id() == CHECK_UPDATE_MENU_ITEM_ID {
                if let Err(error) = app.emit(CHECK_UPDATE_EVENT, ()) {
                    log::error!("无法检查更新: {error}");
                }
            }
        });

    builder
        .manage(app_update::AppUpdateState::default())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_update::app_update_check,
            app_update::app_update_install,
            app_update::app_update_restart,
            assets::upload_workspace_asset,
            assets::resolve_workspace_asset,
            assets::resolve_workspace_assets,
            assets::read_workspace_asset_data,
            assets::select_tree_icon_asset,
            assets::discard_unreferenced_tree_icon_asset,
            codex::codex_runtime_probe,
            codex::codex_runtime_start,
            codex::codex_runtime_stop,
            codex_provider::codex_connection_status,
            codex_provider::codex_custom_provider_get,
            codex_provider::codex_custom_provider_set,
            codex_provider::codex_custom_provider_clear,
            codex_provider::codex_auth_mode_set,
            codex::codex_app_server_request,
            codex::codex_app_server_respond,
            codex::codex_app_server_respond_user_input,
            codex::codex_app_server_respond_dynamic_tool,
            codex::read_codex_plugin_icon,
            codex::select_codex_context_attachments,
            codex::paste_codex_context_attachments,
            codex::read_codex_context_attachment_preview,
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
            drawings::begin_generated_drawing_create,
            drawings::stage_drawing_scene,
            drawings::stage_drawing_preview,
            drawings::commit_drawing_save,
            drawings::cancel_drawing_save,
            drawings::commit_generated_drawing_create,
            drawings::cancel_generated_drawing_create,
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
            export::document_export_runtime_info,
            export::convert_document_export,
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
            graph::load_workspace_graph,
            link_preview::resolve_link_preview,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            settings::read_app_settings,
            settings::save_app_settings,
            system_fonts::list_system_fonts,
            window_chrome::get_macos_titlebar_metrics,
            window_opacity::set_app_window_opacity,
            workspace::ensure_workspace,
            workspace::select_workspace_directory,
            workspace::open_path_in_preferred_editor,
            workspace::record_recent_document,
            workspace::set_workspace_node_state,
            workspace::set_tree_node_appearance,
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

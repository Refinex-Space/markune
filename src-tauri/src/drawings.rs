use crate::assets::{self, UploadedWorkspaceAsset};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, State,
};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const DRAWING_SCHEMA_VERSION: u32 = 1;
const MAX_SCENE_BYTES: usize = 100 * 1024 * 1024;
const MAX_PREVIEW_BYTES: usize = 2 * 1024 * 1024;
const MAX_LIBRARY_BYTES: usize = 20 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 120;
const MAX_TAGS: usize = 10;
const MAX_TAG_CHARS: usize = 32;
const MAX_ALBUM_DEPTH: usize = 8;
const MAX_ALBUM_NAME_CHARS: usize = 80;
const PREVIEW_PNG_FILE: &str = "preview.png";
const PREVIEW_WEBP_FILE: &str = "preview.webp";
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const GRANT_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Clone, Default)]
pub struct DrawingState {
    inner: Arc<DrawingStateInner>,
}

#[derive(Default)]
struct DrawingStateInner {
    save_sessions: Mutex<HashMap<String, SaveSessionEntry>>,
    import_grants: Mutex<HashMap<String, ImportGrantEntry>>,
    export_grants: Mutex<HashMap<String, ExportGrantEntry>>,
    library_write_sessions: Mutex<HashMap<String, TimedRootEntry>>,
    snapshot_sessions: Mutex<HashMap<String, SnapshotSessionEntry>>,
}

#[derive(Clone)]
struct SaveSessionEntry {
    drawing_id: String,
    expected_scene_sha256: String,
    expected_revision: u64,
    expires_at: Instant,
    manifest: DrawingSaveManifest,
    root_path: String,
    staging_dir: PathBuf,
}

#[derive(Clone)]
struct ImportGrantEntry {
    expires_at: Instant,
    sources: HashMap<String, ImportSourceEntry>,
}

#[derive(Clone)]
struct ImportSourceEntry {
    file_name: String,
    kind: DrawingImportKind,
    path: PathBuf,
}

#[derive(Clone)]
struct ExportGrantEntry {
    expires_at: Instant,
    path: PathBuf,
}

#[derive(Clone)]
struct TimedRootEntry {
    expires_at: Instant,
    root_path: String,
}

#[derive(Clone)]
struct SnapshotSessionEntry {
    drawing_id: String,
    expires_at: Instant,
    root_path: String,
    title: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum DrawingImportKind {
    Drawing,
    Library,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DrawingPreviewFormat {
    Png,
    Webp,
}

impl DrawingPreviewFormat {
    fn file_name(self) -> &'static str {
        match self {
            Self::Png => PREVIEW_PNG_FILE,
            Self::Webp => PREVIEW_WEBP_FILE,
        }
    }

    fn media_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Webp => "image/webp",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Webp => "webp",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingMeta {
    schema_version: u32,
    id: String,
    title: String,
    tags: Vec<String>,
    favorite: bool,
    created_at: String,
    updated_at: String,
    revision: u64,
    scene_sha256: String,
    element_count: usize,
    search_text: String,
    preview_revision: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingSaveManifest {
    title: String,
    #[serde(default)]
    tags: Vec<String>,
    favorite: bool,
    element_count: usize,
    #[serde(default)]
    search_text: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingSummary {
    #[serde(flatten)]
    meta: DrawingMeta,
    album_path: String,
    has_backup: bool,
    has_preview: bool,
    trashed: bool,
    issue: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingIssue {
    drawing_id: Option<String>,
    album_path: String,
    message: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingAlbumNode {
    name: String,
    path: String,
    children: Vec<DrawingAlbumNode>,
    drawings: Vec<DrawingSummary>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct TrashedAlbumMeta {
    schema_version: u32,
    trash_id: String,
    name: String,
    original_path: String,
    trashed_at: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingTrashedAlbumSummary {
    trash_id: String,
    name: String,
    original_path: String,
    trashed_at: String,
    drawing_count: usize,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingLibrarySnapshot {
    albums: Vec<DrawingAlbumNode>,
    drawings: Vec<DrawingSummary>,
    trash: Vec<DrawingSummary>,
    trash_albums: Vec<DrawingTrashedAlbumSummary>,
    issues: Vec<DrawingIssue>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingViewport {
    scroll_x: f64,
    scroll_y: f64,
    zoom: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingUiState {
    schema_version: u32,
    #[serde(default)]
    recent_drawing_ids: Vec<String>,
    #[serde(default)]
    viewports: BTreeMap<String, DrawingViewport>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DrawingDocumentDescriptor {
    meta: DrawingMeta,
    album_path: String,
    has_backup: bool,
    has_preview: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingSaveSession {
    session_id: String,
    next_revision: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingRawSession {
    session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingImportSource {
    file_name: String,
    kind: DrawingImportKind,
    size: u64,
    source_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingImportGrant {
    grant_id: String,
    sources: Vec<DrawingImportSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingExportGrant {
    grant_id: String,
    file_name: String,
}

#[tauri::command]
pub fn load_drawing_library(root_path: String) -> Result<DrawingLibrarySnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    let drawings_root = ensure_drawings_root(&root)?;
    let albums_root = drawings_root.join("albums");
    let mut drawings = Vec::new();
    let mut issues = Vec::new();
    let albums = scan_album_root(&albums_root, &mut drawings, &mut issues)?;
    let trash_root = drawings_root.join(".trash");
    let trash = scan_trash(&trash_root, &mut issues)?;
    let trash_albums = scan_trashed_albums(&trash_root.join("albums"), &mut issues)?;

    drawings.sort_by(|left, right| right.meta.updated_at.cmp(&left.meta.updated_at));
    let mut trash = trash;
    trash.sort_by(|left, right| right.meta.updated_at.cmp(&left.meta.updated_at));

    Ok(DrawingLibrarySnapshot {
        albums,
        drawings,
        trash,
        trash_albums,
        issues,
    })
}

#[tauri::command]
pub fn read_drawing_meta(
    root_path: String,
    drawing_id: String,
) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&root_path)?;
    let bundle = locate_active_bundle(&root, &drawing_id)?;
    descriptor_for_bundle(&root, &bundle)
}

#[tauri::command]
pub fn read_drawing_scene(
    root_path: String,
    drawing_id: String,
    backup: Option<bool>,
) -> Result<Response, String> {
    let root = canonical_workspace_root(&root_path)?;
    let bundle = locate_active_bundle(&root, &drawing_id)?;
    let file_name = if backup.unwrap_or(false) {
        "scene.backup.excalidraw"
    } else {
        "scene.excalidraw"
    };
    let bytes = read_limited_file(&bundle.join(file_name), MAX_SCENE_BYTES, "图稿场景")?;
    validate_scene(&bytes)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_drawing_preview(
    root_path: String,
    drawing_id: String,
    trashed: Option<bool>,
) -> Result<Response, String> {
    let root = canonical_workspace_root(&root_path)?;
    let bundle = if trashed.unwrap_or(false) {
        trash_bundle(&root, &drawing_id)?
    } else {
        locate_active_bundle(&root, &drawing_id)?
    };
    let preview = drawing_preview_path(&bundle).ok_or_else(|| "图稿预览不存在。".to_string())?;
    let bytes = read_limited_file(&preview, MAX_PREVIEW_BYTES, "图稿预览")?;
    validate_preview_image(&bytes)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_drawing_library(root_path: String) -> Result<Response, String> {
    let root = canonical_workspace_root(&root_path)?;
    let drawings_root = ensure_drawings_root(&root)?;
    let path = drawings_root.join("library.excalidrawlib");
    if !path.exists() {
        return Ok(Response::new(default_library_bytes()));
    }
    let bytes = read_limited_file(&path, MAX_LIBRARY_BYTES, "组件库")?;
    validate_library(&bytes)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_drawing_ui_state(root_path: String) -> Result<DrawingUiState, String> {
    let root = canonical_workspace_root(&root_path)?;
    let path = ensure_drawings_root(&root)?.join("ui-state.json");
    if !path.exists() {
        return Ok(default_ui_state());
    }
    let bytes = read_limited_file(&path, 1024 * 1024, "图稿界面状态")?;
    let state: DrawingUiState =
        serde_json::from_slice(&bytes).map_err(|_| "图稿界面状态损坏。".to_string())?;
    validate_ui_state(&state)?;
    Ok(state)
}

#[tauri::command]
pub fn write_drawing_ui_state(
    root_path: String,
    ui_state: DrawingUiState,
) -> Result<DrawingUiState, String> {
    validate_ui_state(&ui_state)?;
    let root = canonical_workspace_root(&root_path)?;
    let path = ensure_drawings_root(&root)?.join("ui-state.json");
    let mut bytes =
        serde_json::to_vec_pretty(&ui_state).map_err(|_| "无法序列化图稿界面状态。".to_string())?;
    bytes.push(b'\n');
    write_bytes_atomic(&path, &bytes)?;
    Ok(ui_state)
}

#[tauri::command]
pub fn create_drawing(
    root_path: String,
    album_path: String,
    title: String,
) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&root_path)?;
    let scene = default_scene_bytes();
    create_drawing_from_scene(&root, &album_path, &title, &scene)
}

#[tauri::command]
pub fn begin_drawing_save(
    state: State<'_, DrawingState>,
    root_path: String,
    drawing_id: String,
    expected_revision: u64,
    manifest: DrawingSaveManifest,
    force: Option<bool>,
) -> Result<DrawingSaveSession, String> {
    validate_drawing_id(&drawing_id)?;
    validate_manifest(&manifest)?;
    let root = canonical_workspace_root(&root_path)?;
    let bundle = locate_active_bundle(&root, &drawing_id)?;
    let current = read_meta(&bundle)?;
    let force = force.unwrap_or(false);
    if !force && current.revision != expected_revision {
        return Err(format!(
            "DRAWING_CONFLICT:磁盘版本已更新（当前 revision {}，本地基于 {}）。",
            current.revision, expected_revision
        ));
    }
    let current_scene = read_limited_file(
        &bundle.join("scene.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿场景",
    )?;
    let current_scene_sha256 = hex::encode(Sha256::digest(&current_scene));
    if !force {
        validate_scene(&current_scene)?;
        if current_scene_sha256 != current.scene_sha256 {
            return Err("DRAWING_CONFLICT:磁盘场景已在 Madora 外部修改。".to_string());
        }
    }
    let next_revision = current.revision.saturating_add(1);
    let session_id = Uuid::new_v4().to_string();
    let staging_dir = ensure_drawings_root(&root)?
        .join(".staging")
        .join(&session_id);
    fs::create_dir_all(&staging_dir).map_err(|error| format!("无法创建图稿暂存目录：{error}"))?;
    let entry = SaveSessionEntry {
        drawing_id,
        expected_scene_sha256: current_scene_sha256,
        expected_revision: current.revision,
        expires_at: Instant::now() + SESSION_TTL,
        manifest,
        root_path,
        staging_dir,
    };
    let mut sessions = state
        .inner
        .save_sessions
        .lock()
        .map_err(|_| "图稿保存状态不可用。".to_string())?;
    cleanup_save_sessions(&mut sessions);
    sessions.insert(session_id.clone(), entry);
    Ok(DrawingSaveSession {
        session_id,
        next_revision,
    })
}

#[tauri::command]
pub fn stage_drawing_scene(
    state: State<'_, DrawingState>,
    request: Request<'_>,
) -> Result<(), String> {
    let session_id = read_header(&request, "x-madora-drawing-session")?;
    let session = get_save_session(&state, &session_id)?;
    let bytes = raw_body(&request, "图稿场景")?;
    if bytes.len() > MAX_SCENE_BYTES {
        return Err("图稿场景超过 100 MiB 限制。".to_string());
    }
    validate_scene(&bytes)?;
    fs::write(session.staging_dir.join("scene.excalidraw"), bytes)
        .map_err(|error| format!("无法暂存图稿场景：{error}"))
}

#[tauri::command]
pub fn stage_drawing_preview(
    state: State<'_, DrawingState>,
    request: Request<'_>,
) -> Result<(), String> {
    let session_id = read_header(&request, "x-madora-drawing-session")?;
    let session = get_save_session(&state, &session_id)?;
    let bytes = raw_body(&request, "图稿预览")?;
    if bytes.len() > MAX_PREVIEW_BYTES {
        return Err("图稿预览超过 2 MiB 限制。".to_string());
    }
    let format = validate_preview_image(&bytes)?;
    let stale_file = match format {
        DrawingPreviewFormat::Png => PREVIEW_WEBP_FILE,
        DrawingPreviewFormat::Webp => PREVIEW_PNG_FILE,
    };
    let _ = fs::remove_file(session.staging_dir.join(stale_file));
    fs::write(session.staging_dir.join(format.file_name()), bytes)
        .map_err(|error| format!("无法暂存图稿预览：{error}"))
}

#[tauri::command]
pub fn commit_drawing_save(
    state: State<'_, DrawingState>,
    session_id: String,
) -> Result<DrawingDocumentDescriptor, String> {
    validate_uuid(&session_id, "图稿保存会话 ID")?;
    let session = {
        let mut sessions = state
            .inner
            .save_sessions
            .lock()
            .map_err(|_| "图稿保存状态不可用。".to_string())?;
        cleanup_save_sessions(&mut sessions);
        sessions
            .remove(&session_id)
            .ok_or_else(|| "图稿保存会话已使用、过期或不存在。".to_string())?
    };
    let result = commit_save_session(&session);
    let _ = fs::remove_dir_all(&session.staging_dir);
    result
}

#[tauri::command]
pub fn cancel_drawing_save(
    state: State<'_, DrawingState>,
    session_id: String,
) -> Result<(), String> {
    validate_uuid(&session_id, "图稿保存会话 ID")?;
    let session = state
        .inner
        .save_sessions
        .lock()
        .map_err(|_| "图稿保存状态不可用。".to_string())?
        .remove(&session_id);
    if let Some(session) = session {
        let _ = fs::remove_dir_all(session.staging_dir);
    }
    Ok(())
}

#[tauri::command]
pub fn rename_drawing(
    root_path: String,
    drawing_id: String,
    expected_revision: u64,
    title: String,
) -> Result<DrawingDocumentDescriptor, String> {
    validate_title(&title)?;
    let root = canonical_workspace_root(&root_path)?;
    let bundle = locate_active_bundle(&root, &drawing_id)?;
    let mut meta = read_meta(&bundle)?;
    if meta.revision != expected_revision {
        return Err("DRAWING_CONFLICT:重命名前图稿已被其他进程修改。".to_string());
    }
    backup_bundle(&bundle)?;
    meta.title = title.trim().to_string();
    meta.updated_at = now_iso();
    meta.revision = meta.revision.saturating_add(1);
    meta.search_text = build_search_text(&meta.title, &meta.tags, &meta.search_text);
    write_meta_atomic(&bundle, &meta)?;
    descriptor_for_bundle(&root, &bundle)
}

#[tauri::command]
pub fn move_drawing(
    root_path: String,
    drawing_id: String,
    album_path: String,
) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = locate_active_bundle(&root, &drawing_id)?;
    let target_album = resolve_album_dir(&root, &album_path, true)?;
    let target = target_album.join(&drawing_id);
    if target.exists() {
        return Err("目标图集中已存在同 ID 图稿。".to_string());
    }
    fs::rename(&source, &target).map_err(|error| format!("无法移动图稿：{error}"))?;
    descriptor_for_bundle(&root, &target)
}

#[tauri::command]
pub fn duplicate_drawing(
    root_path: String,
    drawing_id: String,
    album_path: Option<String>,
) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = locate_active_bundle(&root, &drawing_id)?;
    let source_meta = read_meta(&source)?;
    let scene = read_limited_file(
        &source.join("scene.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿场景",
    )?;
    let target_album = album_path.unwrap_or_else(|| album_path_for_bundle(&root, &source));
    let descriptor = create_drawing_from_scene(
        &root,
        &target_album,
        &format!("{} 副本", source_meta.title),
        &scene,
    )?;
    if drawing_preview_path(&source).is_some() {
        let target = locate_active_bundle(&root, &descriptor.meta.id)?;
        let _ = copy_drawing_preview(&source, &target);
    }
    Ok(descriptor)
}

#[tauri::command]
pub fn trash_drawing(root_path: String, drawing_id: String) -> Result<(), String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = locate_active_bundle(&root, &drawing_id)?;
    let drawings_root = ensure_drawings_root(&root)?;
    let trash_root = drawings_root.join(".trash");
    fs::create_dir_all(&trash_root).map_err(|error| format!("无法创建回收站：{error}"))?;
    let target = trash_root.join(&drawing_id);
    if target.exists() {
        return Err("回收站中已存在同 ID 图稿。".to_string());
    }
    let origin = serde_json::json!({ "albumPath": album_path_for_bundle(&root, &source) });
    write_bytes_atomic(
        &source.join("trash.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&origin).unwrap_or_default()
        )
        .as_bytes(),
    )?;
    fs::rename(source, target).map_err(|error| format!("无法移动到回收站：{error}"))
}

#[tauri::command]
pub fn restore_drawing(
    root_path: String,
    drawing_id: String,
    album_path: Option<String>,
) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = trash_bundle(&root, &drawing_id)?;
    let original_album = read_trash_album_path(&source).unwrap_or_default();
    let target_album_path = album_path.unwrap_or(original_album);
    let target_album = resolve_album_dir(&root, &target_album_path, true)
        .or_else(|_| resolve_album_dir(&root, "已恢复", true))?;
    let target = target_album.join(&drawing_id);
    if target.exists() {
        return Err("恢复位置已有同 ID 图稿。".to_string());
    }
    let _ = fs::remove_file(source.join("trash.json"));
    fs::rename(&source, &target).map_err(|error| format!("无法恢复图稿：{error}"))?;
    descriptor_for_bundle(&root, &target)
}

#[tauri::command]
pub fn permanently_delete_drawing(root_path: String, drawing_id: String) -> Result<(), String> {
    let root = canonical_workspace_root(&root_path)?;
    let bundle = trash_bundle(&root, &drawing_id)?;
    fs::remove_dir_all(bundle).map_err(|error| format!("无法永久删除图稿：{error}"))
}

#[tauri::command]
pub fn create_drawing_album(root_path: String, album_path: String) -> Result<String, String> {
    let root = canonical_workspace_root(&root_path)?;
    let path = resolve_album_dir(&root, &album_path, true)?;
    Ok(album_path_for_dir(&root, &path))
}

#[tauri::command]
pub fn rename_drawing_album(
    root_path: String,
    album_path: String,
    new_name: String,
) -> Result<String, String> {
    validate_album_segment(&new_name)?;
    let root = canonical_workspace_root(&root_path)?;
    let source = resolve_album_dir(&root, &album_path, false)?;
    let parent = source
        .parent()
        .ok_or_else(|| "无法重命名图集根目录。".to_string())?;
    let target = parent.join(new_name.trim());
    if target.exists() {
        return Err("同级已存在同名图集。".to_string());
    }
    fs::rename(&source, &target).map_err(|error| format!("无法重命名图集：{error}"))?;
    Ok(album_path_for_dir(&root, &target))
}

#[tauri::command]
pub fn move_drawing_album(
    root_path: String,
    album_path: String,
    parent_album_path: String,
) -> Result<String, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = resolve_album_dir(&root, &album_path, false)?;
    let parent = resolve_album_dir(&root, &parent_album_path, true)?;
    if parent.starts_with(&source) {
        return Err("不能把图集移动到自身子目录。".to_string());
    }
    let name = source
        .file_name()
        .ok_or_else(|| "图集名称无效。".to_string())?;
    let target = parent.join(name);
    if target.exists() {
        return Err("目标位置已存在同名图集。".to_string());
    }
    fs::rename(&source, &target).map_err(|error| format!("无法移动图集：{error}"))?;
    Ok(album_path_for_dir(&root, &target))
}

#[tauri::command]
pub fn delete_drawing_album(root_path: String, album_path: String) -> Result<(), String> {
    let root = canonical_workspace_root(&root_path)?;
    let album = resolve_album_dir(&root, &album_path, false)?;
    if fs::read_dir(&album)
        .map_err(|error| format!("无法读取图集：{error}"))?
        .next()
        .is_some()
    {
        return Err("只能删除空图集；请先移动或删除其中的图稿。".to_string());
    }
    fs::remove_dir(album).map_err(|error| format!("无法删除图集：{error}"))
}

#[tauri::command]
pub fn duplicate_drawing_album(root_path: String, album_path: String) -> Result<String, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = resolve_album_dir(&root, &album_path, false)?;
    let parent = source
        .parent()
        .ok_or_else(|| "无法复制图集根目录。".to_string())?;
    let source_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?;
    let target_name = unique_album_name(parent, &format!("{source_name} 副本"));
    validate_album_segment(&target_name)?;
    let target = parent.join(&target_name);
    fs::create_dir(&target).map_err(|error| format!("无法创建图集副本：{error}"))?;
    let target_path = album_path_for_dir(&root, &target);
    let result = duplicate_album_contents(&root, &source, &target, &target_path);
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    Ok(target_path)
}

#[tauri::command]
pub fn trash_drawing_album(
    root_path: String,
    album_path: String,
) -> Result<DrawingTrashedAlbumSummary, String> {
    let root = canonical_workspace_root(&root_path)?;
    let source = resolve_album_dir(&root, &album_path, false)?;
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?
        .to_string();
    let trash_id = Uuid::new_v4().to_string();
    let trash_root = ensure_drawings_root(&root)?.join(".trash").join("albums");
    fs::create_dir_all(&trash_root).map_err(|error| format!("无法创建图集回收站：{error}"))?;
    reject_symlink_chain(&ensure_drawings_root(&root)?, &trash_root)?;
    let container = trash_root.join(&trash_id);
    fs::create_dir(&container).map_err(|error| format!("无法创建图集回收记录：{error}"))?;
    let meta = TrashedAlbumMeta {
        schema_version: DRAWING_SCHEMA_VERSION,
        trash_id: trash_id.clone(),
        name: name.clone(),
        original_path: album_path_for_dir(&root, &source),
        trashed_at: now_iso(),
    };
    if let Err(error) = write_trashed_album_meta(&container, &meta) {
        let _ = fs::remove_dir_all(&container);
        return Err(error);
    }
    if let Err(error) = fs::rename(&source, container.join("album")) {
        let _ = fs::remove_dir_all(&container);
        return Err(format!("无法把图集移到回收站：{error}"));
    }
    match trashed_album_summary(&container) {
        Ok(summary) => Ok(summary),
        Err(error) => {
            let restored = fs::rename(container.join("album"), &source).is_ok();
            let _ = fs::remove_dir_all(&container);
            Err(if restored {
                error
            } else {
                format!("{error}；且无法回滚图集移动，请保留回收站内容人工检查。")
            })
        }
    }
}

#[tauri::command]
pub fn restore_drawing_album(root_path: String, trash_id: String) -> Result<String, String> {
    validate_uuid(&trash_id, "图集回收站 ID")?;
    let root = canonical_workspace_root(&root_path)?;
    let container = trashed_album_container(&root, &trash_id)?;
    let meta = read_trashed_album_meta(&container)?;
    let original = validate_album_path(&meta.original_path)?;
    let original_name = original
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图集恢复路径无效。".to_string())?;
    let parent_path = original
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let parent = resolve_album_dir(&root, &parent_path, true)?;
    let target_name = unique_album_name(&parent, original_name);
    let target = parent.join(target_name);
    fs::rename(container.join("album"), &target)
        .map_err(|error| format!("无法恢复图集：{error}"))?;
    if let Err(error) = fs::remove_file(container.join("trash.json")) {
        let _ = fs::rename(&target, container.join("album"));
        return Err(format!("无法完成图集恢复：{error}"));
    }
    if let Err(error) = fs::remove_dir(&container) {
        let _ = fs::rename(&target, container.join("album"));
        let _ = write_trashed_album_meta(&container, &meta);
        return Err(format!("无法完成图集恢复：{error}"));
    }
    Ok(album_path_for_dir(&root, &target))
}

#[tauri::command]
pub fn permanently_delete_drawing_album(root_path: String, trash_id: String) -> Result<(), String> {
    validate_uuid(&trash_id, "图集回收站 ID")?;
    let root = canonical_workspace_root(&root_path)?;
    let container = trashed_album_container(&root, &trash_id)?;
    fs::remove_dir_all(container).map_err(|error| format!("无法永久删除图集：{error}"))
}

#[tauri::command]
pub fn begin_drawing_library_write(
    state: State<'_, DrawingState>,
    root_path: String,
) -> Result<DrawingRawSession, String> {
    canonical_workspace_root(&root_path)?;
    let session_id = Uuid::new_v4().to_string();
    let mut sessions = state
        .inner
        .library_write_sessions
        .lock()
        .map_err(|_| "组件库写入状态不可用。".to_string())?;
    sessions.retain(|_, session| session.expires_at > Instant::now());
    sessions.insert(
        session_id.clone(),
        TimedRootEntry {
            expires_at: Instant::now() + SESSION_TTL,
            root_path,
        },
    );
    Ok(DrawingRawSession { session_id })
}

#[tauri::command]
pub fn write_drawing_library(
    state: State<'_, DrawingState>,
    request: Request<'_>,
) -> Result<(), String> {
    let session_id = read_header(&request, "x-madora-drawing-session")?;
    validate_uuid(&session_id, "组件库写入会话 ID")?;
    let session = {
        let mut sessions = state
            .inner
            .library_write_sessions
            .lock()
            .map_err(|_| "组件库写入状态不可用。".to_string())?;
        sessions.retain(|_, session| session.expires_at > Instant::now());
        sessions
            .remove(&session_id)
            .ok_or_else(|| "组件库写入会话已使用、过期或不存在。".to_string())?
    };
    let bytes = raw_body(&request, "组件库")?;
    if bytes.len() > MAX_LIBRARY_BYTES {
        return Err("组件库超过 20 MiB 限制。".to_string());
    }
    validate_library(&bytes)?;
    let root = canonical_workspace_root(&session.root_path)?;
    let path = ensure_drawings_root(&root)?.join("library.excalidrawlib");
    write_bytes_atomic(&path, &bytes)
}

#[tauri::command]
pub fn select_drawing_import_sources(
    app: AppHandle,
    state: State<'_, DrawingState>,
) -> Result<Option<DrawingImportGrant>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Excalidraw", &["excalidraw", "excalidrawlib"])
        .blocking_pick_files();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let mut entries = HashMap::new();
    let mut descriptors = Vec::new();
    for selected in selected {
        let path = selected
            .into_path()
            .map_err(|_| "所选文件不是本地文件系统路径。".to_string())?
            .canonicalize()
            .map_err(|_| "所选文件不存在。".to_string())?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let kind = match extension.as_str() {
            "excalidraw" => DrawingImportKind::Drawing,
            "excalidrawlib" => DrawingImportKind::Library,
            _ => return Err("仅支持 .excalidraw 与 .excalidrawlib。".to_string()),
        };
        let metadata = fs::metadata(&path).map_err(|_| "无法读取导入文件。".to_string())?;
        let limit = if kind == DrawingImportKind::Drawing {
            MAX_SCENE_BYTES
        } else {
            MAX_LIBRARY_BYTES
        };
        if metadata.len() == 0 || metadata.len() > limit as u64 {
            return Err("导入文件为空或超过大小限制。".to_string());
        }
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "导入文件名不是有效 Unicode。".to_string())?
            .to_string();
        let source_id = Uuid::new_v4().to_string();
        entries.insert(
            source_id.clone(),
            ImportSourceEntry {
                file_name: file_name.clone(),
                kind,
                path,
            },
        );
        descriptors.push(DrawingImportSource {
            file_name,
            kind,
            size: metadata.len(),
            source_id,
        });
    }
    let grant_id = Uuid::new_v4().to_string();
    let mut grants = state
        .inner
        .import_grants
        .lock()
        .map_err(|_| "图稿导入授权状态不可用。".to_string())?;
    grants.retain(|_, grant| grant.expires_at > Instant::now());
    grants.insert(
        grant_id.clone(),
        ImportGrantEntry {
            expires_at: Instant::now() + GRANT_TTL,
            sources: entries,
        },
    );
    Ok(Some(DrawingImportGrant {
        grant_id,
        sources: descriptors,
    }))
}

#[tauri::command]
pub fn read_drawing_import_source(
    state: State<'_, DrawingState>,
    grant_id: String,
    source_id: String,
) -> Result<Response, String> {
    let source = get_import_source(&state, &grant_id, &source_id)?;
    let bytes = fs::read(source.path).map_err(|_| "无法读取导入文件。".to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn import_drawing_from_grant(
    state: State<'_, DrawingState>,
    root_path: String,
    album_path: String,
    grant_id: String,
    source_id: String,
) -> Result<DrawingDocumentDescriptor, String> {
    let source = get_import_source(&state, &grant_id, &source_id)?;
    if source.kind != DrawingImportKind::Drawing {
        return Err("所选文件不是图稿。".to_string());
    }
    let bytes = read_limited_file(&source.path, MAX_SCENE_BYTES, "导入图稿")?;
    validate_scene(&bytes)?;
    let title = Path::new(&source.file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名图稿");
    let root = canonical_workspace_root(&root_path)?;
    create_drawing_from_scene(&root, &album_path, title, &bytes)
}

#[tauri::command]
pub fn import_drawing_library_from_grant(
    state: State<'_, DrawingState>,
    root_path: String,
    grant_id: String,
    source_id: String,
) -> Result<(), String> {
    let source = get_import_source(&state, &grant_id, &source_id)?;
    if source.kind != DrawingImportKind::Library {
        return Err("所选文件不是组件库。".to_string());
    }
    let bytes = read_limited_file(&source.path, MAX_LIBRARY_BYTES, "导入组件库")?;
    validate_library(&bytes)?;
    let root = canonical_workspace_root(&root_path)?;
    write_bytes_atomic(
        &ensure_drawings_root(&root)?.join("library.excalidrawlib"),
        &bytes,
    )
}

#[tauri::command]
pub fn release_drawing_import_grant(
    state: State<'_, DrawingState>,
    grant_id: String,
) -> Result<(), String> {
    validate_uuid(&grant_id, "图稿导入授权 ID")?;
    state
        .inner
        .import_grants
        .lock()
        .map_err(|_| "图稿导入授权状态不可用。".to_string())?
        .remove(&grant_id);
    Ok(())
}

#[tauri::command]
pub fn select_drawing_export_target(
    app: AppHandle,
    state: State<'_, DrawingState>,
    file_name: String,
    format: String,
) -> Result<Option<DrawingExportGrant>, String> {
    let extension = validate_export_format(&format)?;
    let stem = validate_export_stem(&file_name)?;
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let directory = selected
        .into_path()
        .map_err(|_| "所选导出目录不是本地路径。".to_string())?
        .canonicalize()
        .map_err(|_| "所选导出目录不存在。".to_string())?;
    let path = choose_export_path(&directory, &stem, extension);
    let grant_id = Uuid::new_v4().to_string();
    let display_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("drawing")
        .to_string();
    let mut grants = state
        .inner
        .export_grants
        .lock()
        .map_err(|_| "图稿导出授权状态不可用。".to_string())?;
    grants.retain(|_, grant| grant.expires_at > Instant::now());
    grants.insert(
        grant_id.clone(),
        ExportGrantEntry {
            expires_at: Instant::now() + GRANT_TTL,
            path,
        },
    );
    Ok(Some(DrawingExportGrant {
        grant_id,
        file_name: display_name,
    }))
}

#[tauri::command]
pub fn write_drawing_export(
    state: State<'_, DrawingState>,
    request: Request<'_>,
) -> Result<String, String> {
    let grant_id = read_header(&request, "x-madora-drawing-export")?;
    validate_uuid(&grant_id, "图稿导出授权 ID")?;
    let grant = {
        let mut grants = state
            .inner
            .export_grants
            .lock()
            .map_err(|_| "图稿导出授权状态不可用。".to_string())?;
        grants.retain(|_, grant| grant.expires_at > Instant::now());
        grants
            .remove(&grant_id)
            .ok_or_else(|| "图稿导出授权已使用、过期或不存在。".to_string())?
    };
    let bytes = raw_body(&request, "图稿导出")?;
    if bytes.len() > MAX_SCENE_BYTES {
        return Err("导出文件超过 100 MiB 限制。".to_string());
    }
    if grant.path.exists() {
        return Err("导出目标已存在，拒绝覆盖。".to_string());
    }
    fs::write(&grant.path, bytes).map_err(|error| format!("无法写入导出文件：{error}"))?;
    Ok(grant.path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn begin_drawing_markdown_snapshot(
    state: State<'_, DrawingState>,
    root_path: String,
    drawing_id: String,
    title: String,
) -> Result<DrawingRawSession, String> {
    validate_drawing_id(&drawing_id)?;
    validate_title(&title)?;
    let root = canonical_workspace_root(&root_path)?;
    locate_active_bundle(&root, &drawing_id)?;
    let session_id = Uuid::new_v4().to_string();
    let mut sessions = state
        .inner
        .snapshot_sessions
        .lock()
        .map_err(|_| "Markdown 图稿快照状态不可用。".to_string())?;
    sessions.retain(|_, session| session.expires_at > Instant::now());
    sessions.insert(
        session_id.clone(),
        SnapshotSessionEntry {
            drawing_id,
            expires_at: Instant::now() + SESSION_TTL,
            root_path,
            title,
        },
    );
    Ok(DrawingRawSession { session_id })
}

#[tauri::command]
pub fn create_drawing_markdown_snapshot(
    state: State<'_, DrawingState>,
    request: Request<'_>,
) -> Result<UploadedWorkspaceAsset, String> {
    let session_id = read_header(&request, "x-madora-drawing-session")?;
    validate_uuid(&session_id, "Markdown 图稿快照会话 ID")?;
    let session = {
        let mut sessions = state
            .inner
            .snapshot_sessions
            .lock()
            .map_err(|_| "Markdown 图稿快照状态不可用。".to_string())?;
        sessions.retain(|_, session| session.expires_at > Instant::now());
        sessions
            .remove(&session_id)
            .ok_or_else(|| "Markdown 图稿快照会话已使用、过期或不存在。".to_string())?
    };
    let bytes = raw_body(&request, "Markdown 图稿快照")?;
    if bytes.len() > MAX_PREVIEW_BYTES {
        return Err("Markdown 图稿快照超过 2 MiB 限制。".to_string());
    }
    let format = validate_preview_image(&bytes)?;
    let root = canonical_workspace_root(&session.root_path)?;
    locate_active_bundle(&root, &session.drawing_id)?;
    assets::store_workspace_asset_bytes_impl(
        session.root_path,
        format!(
            "{}-{}.{}",
            safe_file_stem(&session.title),
            session.drawing_id,
            format.extension(),
        ),
        format.media_type().to_string(),
        bytes,
    )
    .map(|(uploaded, _)| uploaded)
}

fn commit_save_session(session: &SaveSessionEntry) -> Result<DrawingDocumentDescriptor, String> {
    let root = canonical_workspace_root(&session.root_path)?;
    let bundle = locate_active_bundle(&root, &session.drawing_id)?;
    let current = read_meta(&bundle)?;
    let current_scene = read_limited_file(
        &bundle.join("scene.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿场景",
    )?;
    let current_scene_sha256 = hex::encode(Sha256::digest(&current_scene));
    if current.revision != session.expected_revision
        || current_scene_sha256 != session.expected_scene_sha256
    {
        return Err(format!(
            "DRAWING_CONFLICT:提交前磁盘内容已变化（当前 revision {}）。",
            current.revision
        ));
    }
    let scene_path = session.staging_dir.join("scene.excalidraw");
    let scene = read_limited_file(&scene_path, MAX_SCENE_BYTES, "暂存图稿场景")?;
    let scene_value = validate_scene(&scene)?;
    let scene_sha256 = hex::encode(Sha256::digest(&scene));
    let scene_text = extract_scene_text(&scene_value);
    let actual_element_count = count_scene_elements(&scene_value);
    if session.manifest.element_count != actual_element_count {
        return Err("图稿元素数量与场景内容不一致。".to_string());
    }

    backup_bundle(&bundle)?;
    let next_revision = current.revision.saturating_add(1);
    let mut preview_revision = current.preview_revision;
    if let Some(staged_preview) = drawing_preview_path(&session.staging_dir) {
        if let Ok(preview) = read_limited_file(&staged_preview, MAX_PREVIEW_BYTES, "暂存图稿预览")
        {
            if let Ok(format) = validate_preview_image(&preview) {
                let target = bundle.join(format.file_name());
                if write_bytes_atomic(&target, &preview).is_ok() {
                    let stale_file = match format {
                        DrawingPreviewFormat::Png => PREVIEW_WEBP_FILE,
                        DrawingPreviewFormat::Webp => PREVIEW_PNG_FILE,
                    };
                    let _ = fs::remove_file(bundle.join(stale_file));
                    preview_revision = Some(next_revision);
                }
            }
        }
    }

    let meta = DrawingMeta {
        schema_version: DRAWING_SCHEMA_VERSION,
        id: current.id,
        title: session.manifest.title.trim().to_string(),
        tags: normalized_tags(&session.manifest.tags)?,
        favorite: session.manifest.favorite,
        created_at: current.created_at,
        updated_at: now_iso(),
        revision: next_revision,
        scene_sha256,
        element_count: actual_element_count,
        search_text: build_search_text(
            &session.manifest.title,
            &session.manifest.tags,
            &format!("{} {}", scene_text, session.manifest.search_text),
        ),
        preview_revision,
    };

    write_bytes_atomic(&bundle.join("scene.excalidraw"), &scene).map_err(|error| {
        let _ = restore_backup(&bundle);
        error
    })?;
    if let Err(error) = write_meta_atomic(&bundle, &meta) {
        let restored = restore_backup(&bundle).is_ok();
        return Err(if restored {
            error
        } else {
            format!("{error}；且无法从备份恢复，请保留 bundle 人工检查。")
        });
    }
    descriptor_for_bundle(&root, &bundle)
}

fn create_drawing_from_scene(
    root: &Path,
    album_path: &str,
    title: &str,
    scene: &[u8],
) -> Result<DrawingDocumentDescriptor, String> {
    validate_title(title)?;
    let scene_value = validate_scene(scene)?;
    let album = resolve_album_dir(root, album_path, true)?;
    let id = Uuid::new_v4().to_string();
    let bundle = album.join(&id);
    fs::create_dir(&bundle).map_err(|error| format!("无法创建图稿目录：{error}"))?;
    let timestamp = now_iso();
    let meta = DrawingMeta {
        schema_version: DRAWING_SCHEMA_VERSION,
        id,
        title: title.trim().to_string(),
        tags: Vec::new(),
        favorite: false,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        revision: 1,
        scene_sha256: hex::encode(Sha256::digest(scene)),
        element_count: count_scene_elements(&scene_value),
        search_text: build_search_text(title, &[], &extract_scene_text(&scene_value)),
        preview_revision: None,
    };
    let result = (|| {
        write_bytes_atomic(&bundle.join("scene.excalidraw"), scene)?;
        write_meta_atomic(&bundle, &meta)?;
        descriptor_for_bundle(root, &bundle)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&bundle);
    }
    result
}

fn scan_album_root(
    albums_root: &Path,
    drawings: &mut Vec<DrawingSummary>,
    issues: &mut Vec<DrawingIssue>,
) -> Result<Vec<DrawingAlbumNode>, String> {
    let mut albums = Vec::new();
    for entry in sorted_directories(albums_root)? {
        let name = entry
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?
            .to_string();
        if validate_drawing_id(&name).is_ok() {
            match summary_for_bundle(&entry, "", false) {
                Ok(summary) => drawings.push(summary),
                Err(message) => issues.push(DrawingIssue {
                    drawing_id: Some(name),
                    album_path: String::new(),
                    message,
                }),
            }
        } else {
            albums.push(scan_album(&entry, &name, drawings, issues, 1)?);
        }
    }
    Ok(albums)
}

fn scan_album(
    path: &Path,
    relative_path: &str,
    all_drawings: &mut Vec<DrawingSummary>,
    issues: &mut Vec<DrawingIssue>,
    depth: usize,
) -> Result<DrawingAlbumNode, String> {
    if depth > MAX_ALBUM_DEPTH {
        return Err("图集目录超过 8 层限制。".to_string());
    }
    reject_symlink(path)?;
    let mut children = Vec::new();
    let mut drawings = Vec::new();
    for entry in sorted_directories(path)? {
        let name = entry
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?
            .to_string();
        if validate_drawing_id(&name).is_ok() {
            match summary_for_bundle(&entry, relative_path, false) {
                Ok(summary) => {
                    drawings.push(summary.clone());
                    all_drawings.push(summary);
                }
                Err(message) => issues.push(DrawingIssue {
                    drawing_id: Some(name),
                    album_path: relative_path.to_string(),
                    message,
                }),
            }
        } else {
            let child_path = if relative_path.is_empty() {
                name.clone()
            } else {
                format!("{relative_path}/{name}")
            };
            children.push(scan_album(
                &entry,
                &child_path,
                all_drawings,
                issues,
                depth + 1,
            )?);
        }
    }
    Ok(DrawingAlbumNode {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        path: relative_path.to_string(),
        children,
        drawings,
    })
}

fn scan_trash(path: &Path, issues: &mut Vec<DrawingIssue>) -> Result<Vec<DrawingSummary>, String> {
    fs::create_dir_all(path).map_err(|error| format!("无法创建图稿回收站：{error}"))?;
    reject_symlink(path)?;
    let mut drawings = Vec::new();
    for entry in sorted_directories(path)? {
        let name = entry
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        if name == "albums" {
            continue;
        }
        if validate_drawing_id(&name).is_err() {
            issues.push(DrawingIssue {
                drawing_id: None,
                album_path: ".trash".to_string(),
                message: format!("回收站包含非法目录：{name}"),
            });
            continue;
        }
        match summary_for_bundle(
            &entry,
            &read_trash_album_path(&entry).unwrap_or_default(),
            true,
        ) {
            Ok(summary) => drawings.push(summary),
            Err(message) => issues.push(DrawingIssue {
                drawing_id: Some(name),
                album_path: ".trash".to_string(),
                message,
            }),
        }
    }
    Ok(drawings)
}

fn scan_trashed_albums(
    path: &Path,
    issues: &mut Vec<DrawingIssue>,
) -> Result<Vec<DrawingTrashedAlbumSummary>, String> {
    fs::create_dir_all(path).map_err(|error| format!("无法创建图集回收站：{error}"))?;
    reject_symlink(path)?;
    let mut albums = Vec::new();
    for entry in sorted_directories(path)? {
        let trash_id = entry
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        if validate_uuid(&trash_id, "图集回收站 ID").is_err() {
            issues.push(DrawingIssue {
                drawing_id: None,
                album_path: ".trash/albums".to_string(),
                message: format!("图集回收站包含非法目录：{trash_id}"),
            });
            continue;
        }
        match trashed_album_summary(&entry) {
            Ok(summary) => albums.push(summary),
            Err(message) => issues.push(DrawingIssue {
                drawing_id: None,
                album_path: format!(".trash/albums/{trash_id}"),
                message,
            }),
        }
    }
    albums.sort_by(|left, right| right.trashed_at.cmp(&left.trashed_at));
    Ok(albums)
}

fn trashed_album_summary(path: &Path) -> Result<DrawingTrashedAlbumSummary, String> {
    reject_symlink(path)?;
    let meta = read_trashed_album_meta(path)?;
    let album = path.join("album");
    reject_symlink(&album)?;
    Ok(DrawingTrashedAlbumSummary {
        trash_id: meta.trash_id,
        name: meta.name,
        original_path: meta.original_path,
        trashed_at: meta.trashed_at,
        drawing_count: count_drawing_bundles(&album, 1)?,
    })
}

fn count_drawing_bundles(path: &Path, depth: usize) -> Result<usize, String> {
    if depth > MAX_ALBUM_DEPTH {
        return Err("回收站图集超过 8 层限制。".to_string());
    }
    let mut count = 0;
    for entry in sorted_directories(path)? {
        let name = entry
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?;
        if validate_drawing_id(name).is_ok() {
            summary_for_bundle(&entry, "", true)?;
            count += 1;
        } else {
            validate_album_segment(name)?;
            count += count_drawing_bundles(&entry, depth + 1)?;
        }
    }
    Ok(count)
}

fn duplicate_album_contents(
    root: &Path,
    source: &Path,
    target: &Path,
    target_path: &str,
) -> Result<(), String> {
    for entry in sorted_directories(source)? {
        let name = entry
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "图集名称不是有效 Unicode。".to_string())?
            .to_string();
        if validate_drawing_id(&name).is_ok() {
            let source_meta = read_meta(&entry)?;
            let scene =
                read_limited_file(&entry.join("scene.excalidraw"), MAX_SCENE_BYTES, "图稿场景")?;
            let created = create_drawing_from_scene(root, target_path, &source_meta.title, &scene)?;
            let bundle = locate_active_bundle(root, &created.meta.id)?;
            let mut meta = read_meta(&bundle)?;
            meta.tags = source_meta.tags;
            meta.favorite = source_meta.favorite;
            meta.search_text = source_meta.search_text;
            write_meta_atomic(&bundle, &meta)?;
            copy_drawing_preview(&entry, &bundle)?;
        } else {
            validate_album_segment(&name)?;
            let child_target = target.join(&name);
            fs::create_dir(&child_target)
                .map_err(|error| format!("无法创建子图集副本：{error}"))?;
            let child_path = if target_path.is_empty() {
                name
            } else {
                format!("{target_path}/{name}")
            };
            duplicate_album_contents(root, &entry, &child_target, &child_path)?;
        }
    }
    Ok(())
}

fn summary_for_bundle(
    bundle: &Path,
    album_path: &str,
    trashed: bool,
) -> Result<DrawingSummary, String> {
    reject_symlink(bundle)?;
    let meta = read_meta(bundle)?;
    let scene = read_limited_file(
        &bundle.join("scene.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿场景",
    )?;
    validate_scene(&scene)?;
    let actual_hash = hex::encode(Sha256::digest(&scene));
    let issue =
        (actual_hash != meta.scene_sha256).then(|| "场景校验和与元数据不一致。".to_string());
    Ok(DrawingSummary {
        meta,
        album_path: album_path.to_string(),
        has_backup: bundle.join("scene.backup.excalidraw").is_file()
            && bundle.join("meta.backup.json").is_file(),
        has_preview: drawing_preview_path(bundle).is_some(),
        trashed,
        issue,
    })
}

fn descriptor_for_bundle(root: &Path, bundle: &Path) -> Result<DrawingDocumentDescriptor, String> {
    let meta = read_meta(bundle)?;
    Ok(DrawingDocumentDescriptor {
        meta,
        album_path: album_path_for_bundle(root, bundle),
        has_backup: bundle.join("scene.backup.excalidraw").is_file()
            && bundle.join("meta.backup.json").is_file(),
        has_preview: drawing_preview_path(bundle).is_some(),
    })
}

fn locate_active_bundle(root: &Path, drawing_id: &str) -> Result<PathBuf, String> {
    validate_drawing_id(drawing_id)?;
    let albums = ensure_drawings_root(root)?.join("albums");
    let mut matches = Vec::new();
    find_bundle_recursive(&albums, drawing_id, 0, &mut matches)?;
    match matches.len() {
        0 => Err("图稿不存在。".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("检测到重复 Drawing ID，请人工修复图稿目录。".to_string()),
    }
}

fn find_bundle_recursive(
    directory: &Path,
    drawing_id: &str,
    depth: usize,
    matches: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth > MAX_ALBUM_DEPTH + 1 {
        return Ok(());
    }
    for entry in sorted_directories(directory)? {
        reject_symlink(&entry)?;
        let name = entry
            .file_name()
            .map(|value| value.to_string_lossy())
            .unwrap_or_default();
        if name == drawing_id {
            matches.push(entry);
        } else if validate_drawing_id(&name).is_err() {
            find_bundle_recursive(&entry, drawing_id, depth + 1, matches)?;
        }
    }
    Ok(())
}

fn trash_bundle(root: &Path, drawing_id: &str) -> Result<PathBuf, String> {
    validate_drawing_id(drawing_id)?;
    let trash = ensure_drawings_root(root)?.join(".trash");
    let bundle = trash.join(drawing_id);
    if !bundle.is_dir() {
        return Err("回收站中不存在该图稿。".to_string());
    }
    reject_symlink(&bundle)?;
    Ok(bundle)
}

fn ensure_drawings_root(root: &Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "工作区路径不存在。".to_string())?;
    let drawings = root.join(".madora").join("drawings");
    fs::create_dir_all(drawings.join("albums"))
        .map_err(|error| format!("无法创建图稿存储目录：{error}"))?;
    fs::create_dir_all(drawings.join(".trash"))
        .map_err(|error| format!("无法创建图稿回收站：{error}"))?;
    let canonical = drawings
        .canonicalize()
        .map_err(|_| "无法解析图稿存储目录。".to_string())?;
    if !canonical.starts_with(&root) {
        return Err("图稿存储目录逃逸工作区。".to_string());
    }
    Ok(canonical)
}

fn resolve_album_dir(root: &Path, album_path: &str, create: bool) -> Result<PathBuf, String> {
    let relative = validate_album_path(album_path)?;
    let albums_root = ensure_drawings_root(root)?.join("albums");
    let target = albums_root.join(relative);
    if create {
        fs::create_dir_all(&target).map_err(|error| format!("无法创建图集：{error}"))?;
    }
    let canonical = target
        .canonicalize()
        .map_err(|_| "图集不存在。".to_string())?;
    let canonical_root = albums_root
        .canonicalize()
        .map_err(|_| "无法解析图集根目录。".to_string())?;
    if !canonical.starts_with(&canonical_root) || !canonical.is_dir() {
        return Err("图集路径逃逸存储边界。".to_string());
    }
    reject_symlink_chain(&canonical_root, &canonical)?;
    Ok(canonical)
}

fn validate_album_path(value: &str) -> Result<PathBuf, String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Ok(PathBuf::new());
    }
    let path = Path::new(&normalized);
    if path.is_absolute() {
        return Err("图集路径必须是相对路径。".to_string());
    }
    let components = path.components().collect::<Vec<_>>();
    if components.len() > MAX_ALBUM_DEPTH {
        return Err("图集目录最多 8 层。".to_string());
    }
    for component in &components {
        let Component::Normal(segment) = component else {
            return Err("图集路径包含非法片段。".to_string());
        };
        validate_album_segment(&segment.to_string_lossy())?;
    }
    Ok(path.to_path_buf())
}

fn validate_album_segment(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('.')
        || Uuid::parse_str(trimmed).is_ok()
        || trimmed.chars().count() > MAX_ALBUM_NAME_CHARS
        || trimmed.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
        })
    {
        return Err("图集名称无效。".to_string());
    }
    Ok(())
}

fn validate_title(value: &str) -> Result<(), String> {
    let title = value.trim();
    if title.is_empty()
        || title.chars().count() > MAX_TITLE_CHARS
        || title.chars().any(|character| character.is_control())
    {
        return Err("图稿标题必须为 1–120 个可见字符。".to_string());
    }
    Ok(())
}

fn validate_manifest(manifest: &DrawingSaveManifest) -> Result<(), String> {
    validate_title(&manifest.title)?;
    normalized_tags(&manifest.tags)?;
    if manifest.search_text.len() > MAX_SCENE_BYTES {
        return Err("图稿搜索文本超过限制。".to_string());
    }
    Ok(())
}

fn normalized_tags(tags: &[String]) -> Result<Vec<String>, String> {
    if tags.len() > MAX_TAGS {
        return Err("图稿最多包含 10 个标签。".to_string());
    }
    let mut normalized = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        if tag.is_empty()
            || tag.chars().count() > MAX_TAG_CHARS
            || tag.chars().any(|character| character.is_control())
        {
            return Err("标签必须为 1–32 个可见字符。".to_string());
        }
        if !normalized.iter().any(|existing| existing == tag) {
            normalized.push(tag.to_string());
        }
    }
    Ok(normalized)
}

fn validate_scene(bytes: &[u8]) -> Result<Value, String> {
    if bytes.is_empty() || bytes.len() > MAX_SCENE_BYTES {
        return Err("图稿场景为空或超过 100 MiB 限制。".to_string());
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| "图稿场景不是有效 JSON。".to_string())?;
    let object = value
        .as_object()
        .ok_or_else(|| "图稿场景根节点必须是对象。".to_string())?;
    if object.get("type").and_then(Value::as_str) != Some("excalidraw")
        || !object.get("elements").is_some_and(Value::is_array)
        || !object.get("appState").is_some_and(Value::is_object)
        || !object.get("files").is_some_and(Value::is_object)
    {
        return Err("图稿场景结构不符合 Excalidraw 格式。".to_string());
    }
    Ok(value)
}

fn validate_library(bytes: &[u8]) -> Result<Value, String> {
    if bytes.is_empty() || bytes.len() > MAX_LIBRARY_BYTES {
        return Err("组件库为空或超过 20 MiB 限制。".to_string());
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| "组件库不是有效 JSON。".to_string())?;
    if value.get("type").and_then(Value::as_str) != Some("excalidrawlib")
        || !value.get("libraryItems").is_some_and(Value::is_array)
    {
        return Err("组件库结构不符合 Excalidraw 格式。".to_string());
    }
    Ok(value)
}

fn validate_webp(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err("图稿预览不是有效 WebP。".to_string());
    }
    Ok(())
}

fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("图稿预览不是有效 PNG。".to_string());
    }
    Ok(())
}

fn validate_preview_image(bytes: &[u8]) -> Result<DrawingPreviewFormat, String> {
    if validate_webp(bytes).is_ok() {
        return Ok(DrawingPreviewFormat::Webp);
    }
    if validate_png(bytes).is_ok() {
        return Ok(DrawingPreviewFormat::Png);
    }
    Err("图稿预览必须是有效 WebP 或 PNG。".to_string())
}

fn drawing_preview_path(bundle: &Path) -> Option<PathBuf> {
    [PREVIEW_WEBP_FILE, PREVIEW_PNG_FILE]
        .into_iter()
        .filter_map(|file_name| {
            let path = bundle.join(file_name);
            let metadata = fs::symlink_metadata(&path).ok()?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return None;
            }
            let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn copy_drawing_preview(source_bundle: &Path, target_bundle: &Path) -> Result<(), String> {
    let Some(source) = drawing_preview_path(source_bundle) else {
        return Ok(());
    };
    let bytes = read_limited_file(&source, MAX_PREVIEW_BYTES, "图稿预览")?;
    let format = validate_preview_image(&bytes)?;
    write_bytes_atomic(&target_bundle.join(format.file_name()), &bytes)
        .map_err(|error| format!("无法复制图稿预览：{error}"))
}

fn validate_ui_state(state: &DrawingUiState) -> Result<(), String> {
    if state.schema_version != DRAWING_SCHEMA_VERSION {
        return Err("不支持的图稿界面状态版本。".to_string());
    }
    if state.recent_drawing_ids.len() > 50 || state.viewports.len() > 500 {
        return Err("图稿界面状态条目超过限制。".to_string());
    }
    for id in state
        .recent_drawing_ids
        .iter()
        .chain(state.viewports.keys())
    {
        validate_drawing_id(id)?;
    }
    for viewport in state.viewports.values() {
        if !viewport.scroll_x.is_finite()
            || !viewport.scroll_y.is_finite()
            || !viewport.zoom.is_finite()
            || !(0.01..=100.0).contains(&viewport.zoom)
        {
            return Err("图稿视口状态无效。".to_string());
        }
    }
    Ok(())
}

fn count_scene_elements(scene: &Value) -> usize {
    scene["elements"]
        .as_array()
        .map(|elements| {
            elements
                .iter()
                .filter(|element| {
                    !element
                        .get("isDeleted")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn extract_scene_text(scene: &Value) -> String {
    scene["elements"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|element| {
            !element
                .get("isDeleted")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .flat_map(|element| {
            ["text", "originalText", "link"]
                .into_iter()
                .filter_map(|key| element.get(key).and_then(Value::as_str))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_search_text(title: &str, tags: &[String], scene_text: &str) -> String {
    format!("{} {} {}", title.trim(), tags.join(" "), scene_text.trim())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn read_meta(bundle: &Path) -> Result<DrawingMeta, String> {
    let bytes = read_limited_file(&bundle.join("meta.json"), 1024 * 1024, "图稿元数据")?;
    let meta: DrawingMeta =
        serde_json::from_slice(&bytes).map_err(|_| "图稿元数据损坏。".to_string())?;
    validate_drawing_id(&meta.id)?;
    validate_title(&meta.title)?;
    normalized_tags(&meta.tags)?;
    if meta.schema_version != DRAWING_SCHEMA_VERSION {
        return Err(format!("不支持图稿 schema v{}。", meta.schema_version));
    }
    let directory_id = bundle
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if meta.id != directory_id {
        return Err("图稿 ID 与 bundle 目录不一致。".to_string());
    }
    Ok(meta)
}

fn write_meta_atomic(bundle: &Path, meta: &DrawingMeta) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(meta).map_err(|_| "无法序列化图稿元数据。".to_string())?;
    let mut bytes = json;
    bytes.push(b'\n');
    write_bytes_atomic(&bundle.join("meta.json"), &bytes)
}

fn backup_bundle(bundle: &Path) -> Result<(), String> {
    let scene = read_limited_file(
        &bundle.join("scene.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿场景",
    )?;
    let meta = read_limited_file(&bundle.join("meta.json"), 1024 * 1024, "图稿元数据")?;
    validate_scene(&scene)?;
    let _: DrawingMeta = serde_json::from_slice(&meta)
        .map_err(|_| "当前图稿元数据损坏，无法建立备份。".to_string())?;
    write_bytes_atomic(&bundle.join("scene.backup.excalidraw"), &scene)?;
    write_bytes_atomic(&bundle.join("meta.backup.json"), &meta)
}

fn restore_backup(bundle: &Path) -> Result<(), String> {
    let scene = read_limited_file(
        &bundle.join("scene.backup.excalidraw"),
        MAX_SCENE_BYTES,
        "图稿备份",
    )?;
    let meta = read_limited_file(
        &bundle.join("meta.backup.json"),
        1024 * 1024,
        "图稿备份元数据",
    )?;
    validate_scene(&scene)?;
    let _: DrawingMeta =
        serde_json::from_slice(&meta).map_err(|_| "图稿备份元数据损坏。".to_string())?;
    write_bytes_atomic(&bundle.join("scene.excalidraw"), &scene)?;
    write_bytes_atomic(&bundle.join("meta.json"), &meta)
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "目标路径缺少父目录。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建目标目录：{error}"))?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("drawing");
    let temporary = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4().simple()));
    fs::write(&temporary, bytes).map_err(|error| format!("无法写入临时文件：{error}"))?;
    let displaced = parent.join(format!(".{file_name}.{}.old", Uuid::new_v4().simple()));
    let had_existing = path.exists();
    if had_existing {
        fs::rename(path, &displaced).map_err(|error| format!("无法暂存旧文件：{error}"))?;
    }
    match fs::rename(&temporary, path) {
        Ok(()) => {
            if had_existing {
                let _ = fs::remove_file(displaced);
            }
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            if had_existing {
                let _ = fs::rename(&displaced, path);
            }
            Err(format!("无法提交文件：{error}"))
        }
    }
}

fn read_limited_file(path: &Path, limit: usize, label: &str) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| format!("{label}不存在。"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("{label}不是受支持的普通文件。"));
    }
    if metadata.len() > limit as u64 {
        return Err(format!("{label}超过大小限制。"));
    }
    fs::read(path).map_err(|error| format!("无法读取{label}：{error}"))
}

fn canonical_workspace_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在。".to_string())?;
    if !root.is_dir() {
        return Err("工作区路径不是目录。".to_string());
    }
    Ok(root)
}

fn validate_drawing_id(value: &str) -> Result<(), String> {
    let parsed = Uuid::parse_str(value).map_err(|_| "Drawing ID 无效。".to_string())?;
    if parsed.hyphenated().to_string() != value {
        return Err("Drawing ID 必须是规范小写 UUID。".to_string());
    }
    Ok(())
}

fn validate_uuid(value: &str, label: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("{label}无效。"))
}

fn sorted_directories(path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut directories = Vec::new();
    for entry in fs::read_dir(path).map_err(|error| format!("无法读取图集目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取图集条目：{error}"))?;
        let metadata =
            fs::symlink_metadata(entry.path()).map_err(|_| "无法读取图集条目属性。".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("图稿存储中不允许符号链接。".to_string());
        }
        if metadata.is_dir() {
            directories.push(entry.path());
        }
    }
    directories.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    Ok(directories)
}

fn reject_symlink(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "路径不存在。".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("图稿存储中不允许符号链接。".to_string());
    }
    Ok(())
}

fn reject_symlink_chain(root: &Path, target: &Path) -> Result<(), String> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| "图集路径逃逸存储边界。".to_string())?;
    let mut cursor = root.to_path_buf();
    reject_symlink(&cursor)?;
    for component in relative.components() {
        cursor.push(component);
        reject_symlink(&cursor)?;
    }
    Ok(())
}

fn album_path_for_bundle(root: &Path, bundle: &Path) -> String {
    bundle
        .parent()
        .map(|parent| album_path_for_dir(root, parent))
        .unwrap_or_default()
}

fn album_path_for_dir(root: &Path, directory: &Path) -> String {
    let albums = root.join(".madora").join("drawings").join("albums");
    directory
        .strip_prefix(albums)
        .ok()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn read_trash_album_path(bundle: &Path) -> Option<String> {
    let bytes = fs::read(bundle.join("trash.json")).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    value.get("albumPath")?.as_str().map(str::to_string)
}

fn write_trashed_album_meta(path: &Path, meta: &TrashedAlbumMeta) -> Result<(), String> {
    let mut bytes =
        serde_json::to_vec_pretty(meta).map_err(|_| "无法序列化图集回收记录。".to_string())?;
    bytes.push(b'\n');
    write_bytes_atomic(&path.join("trash.json"), &bytes)
}

fn read_trashed_album_meta(path: &Path) -> Result<TrashedAlbumMeta, String> {
    let bytes = read_limited_file(&path.join("trash.json"), 64 * 1024, "图集回收记录")?;
    let meta: TrashedAlbumMeta =
        serde_json::from_slice(&bytes).map_err(|_| "图集回收记录损坏。".to_string())?;
    if meta.schema_version != DRAWING_SCHEMA_VERSION {
        return Err("不支持的图集回收记录版本。".to_string());
    }
    validate_uuid(&meta.trash_id, "图集回收站 ID")?;
    let directory_id = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "图集回收站目录无效。".to_string())?;
    if directory_id != meta.trash_id {
        return Err("图集回收记录 ID 与目录不一致。".to_string());
    }
    validate_album_segment(&meta.name)?;
    let original = validate_album_path(&meta.original_path)?;
    if original.as_os_str().is_empty() || meta.trashed_at.trim().is_empty() {
        return Err("图集回收记录缺少必要字段。".to_string());
    }
    Ok(meta)
}

fn trashed_album_container(root: &Path, trash_id: &str) -> Result<PathBuf, String> {
    validate_uuid(trash_id, "图集回收站 ID")?;
    let drawings_root = ensure_drawings_root(root)?;
    let trash_root = drawings_root.join(".trash").join("albums");
    fs::create_dir_all(&trash_root).map_err(|error| format!("无法创建图集回收站：{error}"))?;
    reject_symlink_chain(&drawings_root, &trash_root)?;
    let container = trash_root.join(trash_id);
    if !container.is_dir() {
        return Err("图集回收记录不存在。".to_string());
    }
    reject_symlink(&container)?;
    Ok(container)
}

fn unique_album_name(parent: &Path, requested: &str) -> String {
    let base = requested
        .trim()
        .chars()
        .take(MAX_ALBUM_NAME_CHARS)
        .collect::<String>();
    if !parent.join(&base).exists() {
        return base;
    }
    for index in 2..10_000 {
        let suffix = format!(" ({index})");
        let keep = MAX_ALBUM_NAME_CHARS.saturating_sub(suffix.chars().count());
        let prefix = base.chars().take(keep).collect::<String>();
        let candidate = format!("{prefix}{suffix}");
        if !parent.join(&candidate).exists() {
            return candidate;
        }
    }
    format!("album-{}", Uuid::new_v4().simple())
}

fn default_scene_bytes() -> Vec<u8> {
    b"{\n  \"type\": \"excalidraw\",\n  \"version\": 2,\n  \"source\": \"https://excalidraw.com\",\n  \"elements\": [],\n  \"appState\": {},\n  \"files\": {}\n}\n".to_vec()
}

fn default_library_bytes() -> Vec<u8> {
    b"{\n  \"type\": \"excalidrawlib\",\n  \"version\": 2,\n  \"source\": \"madora\",\n  \"libraryItems\": []\n}\n".to_vec()
}

fn default_ui_state() -> DrawingUiState {
    DrawingUiState {
        schema_version: DRAWING_SCHEMA_VERSION,
        recent_drawing_ids: Vec::new(),
        viewports: BTreeMap::new(),
    }
}

fn now_iso() -> String {
    let now: chrono::DateTime<Utc> = SystemTime::now().into();
    now.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn read_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| format!("缺少 {name} 请求头。"))
}

fn raw_body(request: &Request<'_>, label: &str) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err(format!("{label}必须使用 Raw IPC。")),
    }
}

fn get_save_session(state: &DrawingState, session_id: &str) -> Result<SaveSessionEntry, String> {
    validate_uuid(session_id, "图稿保存会话 ID")?;
    let mut sessions = state
        .inner
        .save_sessions
        .lock()
        .map_err(|_| "图稿保存状态不可用。".to_string())?;
    cleanup_save_sessions(&mut sessions);
    sessions
        .get(session_id)
        .cloned()
        .ok_or_else(|| "图稿保存会话已过期或不存在。".to_string())
}

fn cleanup_save_sessions(sessions: &mut HashMap<String, SaveSessionEntry>) {
    let expired = sessions
        .iter()
        .filter(|(_, session)| session.expires_at <= Instant::now())
        .map(|(id, session)| (id.clone(), session.staging_dir.clone()))
        .collect::<Vec<_>>();
    for (id, directory) in expired {
        sessions.remove(&id);
        let _ = fs::remove_dir_all(directory);
    }
}

fn get_import_source(
    state: &DrawingState,
    grant_id: &str,
    source_id: &str,
) -> Result<ImportSourceEntry, String> {
    validate_uuid(grant_id, "图稿导入授权 ID")?;
    validate_uuid(source_id, "图稿导入源 ID")?;
    let mut grants = state
        .inner
        .import_grants
        .lock()
        .map_err(|_| "图稿导入授权状态不可用。".to_string())?;
    grants.retain(|_, grant| grant.expires_at > Instant::now());
    grants
        .get(grant_id)
        .and_then(|grant| grant.sources.get(source_id))
        .cloned()
        .ok_or_else(|| "图稿导入授权已过期或源文件不存在。".to_string())
}

fn validate_export_format(value: &str) -> Result<&'static str, String> {
    match value {
        "excalidraw" => Ok("excalidraw"),
        "png" => Ok("png"),
        "svg" => Ok("svg"),
        "excalidrawlib" => Ok("excalidrawlib"),
        _ => Err("不支持的图稿导出格式。".to_string()),
    }
}

fn validate_export_stem(value: &str) -> Result<String, String> {
    let stem = safe_file_stem(value);
    if stem.is_empty() || stem.chars().count() > MAX_TITLE_CHARS {
        return Err("导出文件名无效。".to_string());
    }
    Ok(stem)
}

fn safe_file_stem(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches(['.', ' '])
        .to_string()
}

fn choose_export_path(directory: &Path, stem: &str, extension: &str) -> PathBuf {
    let candidate = directory.join(format!("{stem}.{extension}"));
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..10_000 {
        let candidate = directory.join(format!("{stem} {index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{stem}-{}.{}", Uuid::new_v4().simple(), extension))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn workspace() -> tempfile::TempDir {
        let directory = tempdir().expect("创建临时工作区失败");
        fs::create_dir_all(directory.path().join(".madora")).expect("创建 .madora 失败");
        directory
    }

    #[test]
    fn creates_lists_and_moves_drawing_without_exposing_absolute_paths() {
        let root = workspace();
        let descriptor = create_drawing(
            root.path().to_string_lossy().into_owned(),
            "项目/架构".to_string(),
            "系统图".to_string(),
        )
        .expect("创建图稿失败");
        let snapshot =
            load_drawing_library(root.path().to_string_lossy().into_owned()).expect("读取图集失败");
        assert_eq!(snapshot.drawings.len(), 1);
        assert_eq!(snapshot.drawings[0].album_path, "项目/架构");

        let moved = move_drawing(
            root.path().to_string_lossy().into_owned(),
            descriptor.meta.id,
            "归档".to_string(),
        )
        .expect("移动图稿失败");
        assert_eq!(moved.album_path, "归档");
    }

    #[test]
    fn rejects_album_traversal_and_invalid_drawing_ids() {
        assert!(validate_album_path("../secret").is_err());
        assert!(validate_album_path("/tmp/secret").is_err());
        assert!(validate_album_path("a\\..\\secret").is_err());
        assert!(validate_drawing_id("not-an-id").is_err());
        assert!(validate_album_path(&vec!["a"; 9].join("/")).is_err());
    }

    #[test]
    fn validates_scene_library_and_preview_limits() {
        assert!(validate_scene(&default_scene_bytes()).is_ok());
        assert!(validate_scene(br#"{"type":"excalidraw","elements":[]}"#).is_err());
        assert!(validate_library(&default_library_bytes()).is_ok());
        assert!(validate_library(br#"{"type":"other","libraryItems":[]}"#).is_err());
        assert!(validate_webp(b"RIFF1234WEBP").is_ok());
        assert!(validate_webp(b"not-webp").is_err());
        assert_eq!(
            validate_preview_image(b"\x89PNG\r\n\x1a\n"),
            Ok(DrawingPreviewFormat::Png)
        );
        assert_eq!(
            validate_preview_image(b"RIFF1234WEBP"),
            Ok(DrawingPreviewFormat::Webp)
        );
        assert!(validate_preview_image(b"not-an-image").is_err());
        let mut ui_state = default_ui_state();
        ui_state.viewports.insert(
            "11111111-1111-4111-8111-111111111111".to_string(),
            DrawingViewport {
                scroll_x: 12.0,
                scroll_y: -4.0,
                zoom: 1.2,
            },
        );
        assert!(validate_ui_state(&ui_state).is_ok());
    }

    #[test]
    fn commits_png_preview_when_webp_encoding_is_unavailable() {
        let root = workspace();
        let descriptor = create_drawing(
            root.path().to_string_lossy().into_owned(),
            "兼容".to_string(),
            "PNG 预览".to_string(),
        )
        .expect("创建图稿失败");
        let staging_dir = ensure_drawings_root(root.path())
            .expect("读取图稿根目录失败")
            .join(".staging/test-png-preview");
        fs::create_dir_all(&staging_dir).expect("创建预览暂存目录失败");
        fs::write(staging_dir.join("scene.excalidraw"), default_scene_bytes())
            .expect("写入暂存场景失败");
        fs::write(staging_dir.join(PREVIEW_PNG_FILE), b"\x89PNG\r\n\x1a\n")
            .expect("写入 PNG 预览失败");
        let session = SaveSessionEntry {
            drawing_id: descriptor.meta.id.clone(),
            expected_scene_sha256: descriptor.meta.scene_sha256,
            expected_revision: descriptor.meta.revision,
            expires_at: Instant::now() + SESSION_TTL,
            manifest: DrawingSaveManifest {
                element_count: 0,
                favorite: false,
                search_text: String::new(),
                tags: Vec::new(),
                title: descriptor.meta.title,
            },
            root_path: root.path().to_string_lossy().into_owned(),
            staging_dir,
        };

        let committed = commit_save_session(&session).expect("提交 PNG 预览失败");
        let bundle =
            locate_active_bundle(root.path(), &descriptor.meta.id).expect("查找 PNG 预览图稿失败");
        assert!(committed.has_preview);
        assert_eq!(committed.meta.preview_revision, Some(2));
        assert!(bundle.join(PREVIEW_PNG_FILE).is_file());
        assert!(!bundle.join(PREVIEW_WEBP_FILE).exists());
    }

    #[test]
    fn keeps_one_valid_backup_and_detects_stale_revision() {
        let root = workspace();
        let descriptor = create_drawing(
            root.path().to_string_lossy().into_owned(),
            String::new(),
            "版本测试".to_string(),
        )
        .expect("创建图稿失败");
        let bundle = locate_active_bundle(root.path(), &descriptor.meta.id).expect("查找图稿失败");
        backup_bundle(&bundle).expect("创建备份失败");
        assert!(bundle.join("scene.backup.excalidraw").is_file());
        assert!(bundle.join("meta.backup.json").is_file());

        let staging_dir = ensure_drawings_root(root.path())
            .expect("读取图稿根目录失败")
            .join(".staging/test-stale");
        fs::create_dir_all(&staging_dir).expect("创建暂存目录失败");
        fs::write(staging_dir.join("scene.excalidraw"), default_scene_bytes())
            .expect("写入暂存场景失败");
        let mut changed = read_meta(&bundle).expect("读取元数据失败");
        changed.revision += 1;
        write_meta_atomic(&bundle, &changed).expect("模拟外部 revision 失败");
        let session = SaveSessionEntry {
            drawing_id: descriptor.meta.id,
            expected_scene_sha256: descriptor.meta.scene_sha256,
            expected_revision: 1,
            expires_at: Instant::now() + SESSION_TTL,
            manifest: DrawingSaveManifest {
                element_count: 0,
                favorite: false,
                search_text: String::new(),
                tags: Vec::new(),
                title: "版本测试".to_string(),
            },
            root_path: root.path().to_string_lossy().into_owned(),
            staging_dir,
        };
        assert!(commit_save_session(&session)
            .expect_err("陈旧 revision 应拒绝提交")
            .contains("DRAWING_CONFLICT"));
    }

    #[test]
    fn trash_restore_and_permanent_delete_are_scoped_to_drawing_id() {
        let root = workspace();
        let descriptor = create_drawing(
            root.path().to_string_lossy().into_owned(),
            "工作".to_string(),
            "待删除".to_string(),
        )
        .expect("创建图稿失败");
        let id = descriptor.meta.id;
        trash_drawing(root.path().to_string_lossy().into_owned(), id.clone())
            .expect("移入回收站失败");
        assert!(locate_active_bundle(root.path(), &id).is_err());
        restore_drawing(root.path().to_string_lossy().into_owned(), id.clone(), None)
            .expect("恢复失败");
        trash_drawing(root.path().to_string_lossy().into_owned(), id.clone())
            .expect("再次移入回收站失败");
        permanently_delete_drawing(root.path().to_string_lossy().into_owned(), id.clone())
            .expect("永久删除失败");
        assert!(trash_bundle(root.path(), &id).is_err());
    }

    #[test]
    fn duplicates_trashes_restores_and_deletes_album_as_one_unit() {
        let root = workspace();
        let descriptor = create_drawing(
            root.path().to_string_lossy().into_owned(),
            "项目/架构".to_string(),
            "系统图".to_string(),
        )
        .expect("创建图稿失败");
        let source_bundle =
            locate_active_bundle(root.path(), &descriptor.meta.id).expect("查找源图稿失败");
        fs::write(source_bundle.join(PREVIEW_PNG_FILE), b"\x89PNG\r\n\x1a\n")
            .expect("写入源 PNG 预览失败");

        let duplicated = duplicate_drawing_album(
            root.path().to_string_lossy().into_owned(),
            "项目".to_string(),
        )
        .expect("复制图集失败");
        assert_eq!(duplicated, "项目 副本");
        let snapshot =
            load_drawing_library(root.path().to_string_lossy().into_owned()).expect("读取图集失败");
        assert_eq!(snapshot.drawings.len(), 2);
        assert_ne!(snapshot.drawings[0].meta.id, snapshot.drawings[1].meta.id);
        assert!(snapshot.drawings.iter().all(|drawing| drawing.has_preview));

        let trashed = trash_drawing_album(
            root.path().to_string_lossy().into_owned(),
            "项目".to_string(),
        )
        .expect("图集移入回收站失败");
        assert_eq!(trashed.drawing_count, 1);
        let snapshot =
            load_drawing_library(root.path().to_string_lossy().into_owned()).expect("读取图集失败");
        assert_eq!(snapshot.drawings.len(), 1);
        assert_eq!(snapshot.trash_albums.len(), 1);

        let restored = restore_drawing_album(
            root.path().to_string_lossy().into_owned(),
            trashed.trash_id.clone(),
        )
        .expect("恢复图集失败");
        assert_eq!(restored, "项目");
        let trashed_again =
            trash_drawing_album(root.path().to_string_lossy().into_owned(), restored)
                .expect("再次移入回收站失败");
        permanently_delete_drawing_album(
            root.path().to_string_lossy().into_owned(),
            trashed_again.trash_id,
        )
        .expect("永久删除图集失败");
        let snapshot =
            load_drawing_library(root.path().to_string_lossy().into_owned()).expect("读取图集失败");
        assert!(snapshot.trash_albums.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape_inside_album_tree() {
        use std::os::unix::fs::symlink;

        let root = workspace();
        let outside = tempdir().expect("创建外部目录失败");
        let albums = ensure_drawings_root(root.path())
            .expect("创建图稿根目录失败")
            .join("albums");
        symlink(outside.path(), albums.join("escape")).expect("创建符号链接失败");
        assert!(load_drawing_library(root.path().to_string_lossy().into_owned()).is_err());
    }
}

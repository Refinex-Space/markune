use crate::assets::{cleanup_unreferenced_assets, extract_asset_ids};
use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, SecondsFormat, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const WORKSPACE_PRIVATE_DIR: &str = ".madora";
const PERFORMANCE_LOG_ENV: &str = "MADORA_PERF_LOG";

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root_path: String,
    pub root_name: String,
    pub nodes: Vec<WorkspaceNode>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub id: String,
    pub name: String,
    pub kind: WorkspaceNodeKind,
    pub relative_path: String,
    pub absolute_path: String,
    pub title: Option<String>,
    pub created_at: u128,
    pub updated_at: u128,
    pub pinned: bool,
    pub locked: bool,
    pub children: Option<Vec<WorkspaceNode>>,
}

#[derive(Copy, Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceNodeKind {
    Directory,
    Document,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMetadata {
    pub schema_version: u32,
    #[serde(default, skip_serializing)]
    pub recent_document_path: Option<String>,
    #[serde(default)]
    pub recent_document_paths: Vec<String>,
    pub expanded_paths: Vec<String>,
    pub sort_order: serde_json::Map<String, Value>,
    #[serde(default)]
    pub daily_notes: WorkspaceDailyNotes,
    #[serde(default)]
    pub node_state: BTreeMap<String, WorkspaceNodeState>,
    #[serde(default)]
    pub git_sync: WorkspaceGitSyncSettings,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNodeState {
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitSyncSettings {
    #[serde(default = "default_git_sync_enabled")]
    pub enabled: bool,
    #[serde(default = "default_git_sync_interval_minutes")]
    pub interval_minutes: u32,
    #[serde(default = "default_git_sync_conflict_resolution")]
    pub conflict_resolution: String,
    #[serde(default)]
    pub last_synced_at: Option<String>,
}

impl Default for WorkspaceGitSyncSettings {
    fn default() -> Self {
        Self {
            enabled: default_git_sync_enabled(),
            interval_minutes: default_git_sync_interval_minutes(),
            conflict_resolution: default_git_sync_conflict_resolution(),
            last_synced_at: None,
        }
    }
}

#[derive(Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDailyNotes {
    #[serde(default)]
    pub selected_date: Option<String>,
    #[serde(default)]
    pub entries: BTreeMap<String, DailyNoteEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteEntry {
    pub document_path: String,
    pub has_content: bool,
    pub updated_at: u128,
}

const SORT_ORDER_STEP: i64 = 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortOrder {
    version: u32,
    nodes: BTreeMap<String, WorkspaceSortRecord>,
}

impl Default for WorkspaceSortOrder {
    fn default() -> Self {
        Self {
            version: 1,
            nodes: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSortRecord {
    parent_path: String,
    rank: i64,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlateDocumentEnvelope {
    pub schema_version: u32,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub content: Value,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlateDocumentContent {
    pub path: String,
    pub envelope: PlateDocumentEnvelope,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentMeta {
    pub path: String,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeletedWorkspaceNode {
    pub path: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedPlateDocument {
    pub node: WorkspaceNode,
    pub envelope: PlateDocumentEnvelope,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocumentContent {
    pub path: String,
    pub content: String,
    pub modified_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedMarkdownDocument {
    pub node: WorkspaceNode,
    pub content: MarkdownDocumentContent,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteDocument {
    pub node: WorkspaceNode,
    pub content: MarkdownDocumentContent,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteMonth {
    pub month: String,
    pub entries: Vec<DailyNoteMonthEntry>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteMonthEntry {
    pub date: String,
    pub document_path: String,
    pub has_content: bool,
    pub updated_at: u128,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationReport {
    pub migrated: Vec<MarkdownMigrationItem>,
    pub failed: Vec<MarkdownMigrationFailure>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationItem {
    pub source_path: String,
    pub target_path: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownMigrationFailure {
    pub source_path: String,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSourceFile {
    pub path: String,
    pub file_name: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPlateDocumentInput {
    pub title: String,
    pub source_file_name: String,
    pub content: Value,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPlateDocumentResult {
    pub created: Vec<CreatedPlateDocument>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub source_file_name: String,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceFile {
    pub path: String,
    pub file_name: String,
    pub content: Option<String>,
    pub base64_data: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ImportSourceFormat {
    Html,
    Markdown,
    Word,
}

#[tauri::command]
pub fn ensure_workspace(root_path: String) -> Result<WorkspaceMetadata, String> {
    let root = canonical_workspace_root(&root_path)?;
    ensure_workspace_metadata(&root).map_err(|error| format!("初始化工作区失败：{error}"))
}

#[tauri::command]
pub fn record_recent_document(
    root_path: String,
    document_path: String,
) -> Result<Vec<String>, String> {
    let root = canonical_workspace_root(&root_path)?;
    let document = validate_existing_markdown_document_path(&root_path, &document_path)?;
    let absolute_path = document.to_string_lossy().to_string();

    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    normalize_recent_document_paths(&mut metadata);

    let mut paths = metadata.recent_document_paths;
    paths.retain(|path| path != &absolute_path);
    paths.insert(0, absolute_path);
    paths.truncate(5);
    metadata.recent_document_paths = paths;

    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存最近文档失败：{error}"))?;

    Ok(metadata.recent_document_paths)
}

#[tauri::command]
pub fn open_path_in_preferred_editor(path: String, app: String) -> Result<(), String> {
    let target = validate_existing_external_open_path(&path)?;
    let app_name = preferred_editor_macos_app_name(&app)
        .ok_or_else(|| format!("不支持的外部编辑器：{app}"))?;

    open_path_with_macos_app(&target, app_name)
}

#[tauri::command]
pub fn set_workspace_node_state(
    root_path: String,
    node_path: String,
    pinned: Option<bool>,
    locked: Option<bool>,
) -> Result<WorkspaceSnapshot, String> {
    let (root, node, _) = validate_workspace_node_path(&root_path, &node_path)?;
    let relative_path = to_relative_path(&root, &node);
    let mut metadata =
        ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;
    let entry = metadata
        .node_state
        .entry(relative_path.clone())
        .or_default();

    if let Some(next_pinned) = pinned {
        entry.pinned = next_pinned;
    }

    if let Some(next_locked) = locked {
        entry.locked = next_locked;
    }

    if !entry.pinned && !entry.locked {
        metadata.node_state.remove(&relative_path);
    }

    write_workspace_metadata(&root, &metadata).map_err(|_| "无法写入工作区元数据".to_string())?;
    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}

#[tauri::command]
pub fn save_workspace_git_sync_settings(
    root_path: String,
    settings: WorkspaceGitSyncSettings,
) -> Result<WorkspaceGitSyncSettings, String> {
    validate_workspace_git_sync_settings(&settings)?;
    let root = canonical_workspace_root(&root_path)?;
    let mut metadata =
        ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;

    metadata.git_sync = settings;
    write_workspace_metadata(&root, &metadata).map_err(|_| "无法写入工作区元数据".to_string())?;

    Ok(metadata.git_sync)
}

#[tauri::command]
pub fn open_daily_note(root_path: String, date: String) -> Result<DailyNoteDocument, String> {
    let root = canonical_workspace_root(&root_path)?;
    let day = parse_daily_date(&date)?;
    let date_key = day.format("%Y-%m-%d").to_string();
    let note_path = daily_note_path(&root, day);

    if let Some(parent) = note_path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建每日笔记目录".to_string())?;
    }

    if !note_path.exists() {
        write_text_atomic(&note_path, &daily_note_template(day))
            .map_err(|_| "无法创建每日笔记".to_string())?;
    }

    let content = fs::read_to_string(&note_path)
        .map_err(|_| "无法读取每日笔记内容，当前仅支持 UTF-8 文档".to_string())?;
    let modified_at = read_modified_at(&note_path)?;
    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;

    metadata.daily_notes.selected_date = Some(date_key.clone());
    metadata.daily_notes.entries.insert(
        date_key.clone(),
        DailyNoteEntry {
            document_path: note_path.to_string_lossy().to_string(),
            has_content: daily_note_has_content(&content, &date_key),
            updated_at: modified_at,
        },
    );
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存每日笔记索引失败：{error}"))?;

    let name = note_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("daily.md")
        .to_string();
    let node = build_document_node(&root, &note_path, name, &metadata.node_state)
        .map_err(|error| format!("读取每日笔记节点失败：{error}"))?;

    Ok(DailyNoteDocument {
        node,
        content: MarkdownDocumentContent {
            path: note_path.to_string_lossy().to_string(),
            content,
            modified_at,
        },
    })
}

#[tauri::command]
pub fn list_daily_notes_for_month(
    root_path: String,
    month: String,
) -> Result<DailyNoteMonth, String> {
    let root = canonical_workspace_root(&root_path)?;
    let (year, month_number) = parse_daily_month(&month)?;
    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    let mut month_entries: BTreeMap<String, DailyNoteEntry> = metadata
        .daily_notes
        .entries
        .iter()
        .filter(|(date, entry)| {
            date.starts_with(&month) && PathBuf::from(&entry.document_path).is_file()
        })
        .map(|(date, entry)| (date.clone(), entry.clone()))
        .collect();
    let month_dir = root
        .join("Daily")
        .join(format!("{year:04}"))
        .join(format!("{month_number:02}"));

    if month_dir.is_dir() {
        for entry in
            fs::read_dir(&month_dir).map_err(|error| format!("读取每日笔记目录失败：{error}"))?
        {
            let entry = entry.map_err(|error| format!("读取每日笔记目录失败：{error}"))?;
            let path = entry.path();

            if !is_markdown_document_file(&path) {
                continue;
            }

            let Some(date) = daily_date_from_path(&root, &path) else {
                continue;
            };

            if !date.starts_with(&month) {
                continue;
            }

            let content = fs::read_to_string(&path).unwrap_or_default();
            let updated_at = read_modified_at(&path)?;
            month_entries.insert(
                date.clone(),
                DailyNoteEntry {
                    document_path: path.to_string_lossy().to_string(),
                    has_content: daily_note_has_content(&content, &date),
                    updated_at,
                },
            );
        }
    }

    for (date, entry) in &month_entries {
        metadata
            .daily_notes
            .entries
            .insert(date.clone(), entry.clone());
    }
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存每日笔记索引失败：{error}"))?;

    Ok(DailyNoteMonth {
        month,
        entries: month_entries
            .into_iter()
            .map(|(date, entry)| DailyNoteMonthEntry {
                date,
                document_path: entry.document_path,
                has_content: entry.has_content,
                updated_at: entry.updated_at,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn load_workspace_tree(root_path: String) -> Result<WorkspaceSnapshot, String> {
    let timer = start_performance_timer();
    let result = (|| {
        let root = canonical_workspace_root(&root_path)?;
        ensure_workspace_metadata(&root).map_err(|error| format!("初始化工作区失败：{error}"))?;
        build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
    })();
    let details = match &result {
        Ok(snapshot) if timer.is_some() => {
            format!("nodes={}", count_workspace_nodes(&snapshot.nodes))
        }
        Ok(_) => String::new(),
        Err(_) => "error=true".to_string(),
    };
    finish_performance_timer("workspace.load_tree", timer, &details);

    result
}

#[tauri::command]
pub fn read_markdown_document(
    root_path: String,
    document_path: String,
) -> Result<MarkdownDocumentContent, String> {
    let document = validate_existing_markdown_document_path(&root_path, &document_path)?;
    let content = fs::read_to_string(&document)
        .map_err(|_| "无法读取 Markdown 文档内容，当前仅支持 UTF-8 文档".to_string())?;

    Ok(MarkdownDocumentContent {
        path: document.to_string_lossy().to_string(),
        content,
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn save_markdown_document(
    root_path: String,
    document_path: String,
    content: String,
    expected_modified_at: Option<u128>,
) -> Result<DocumentContentMeta, String> {
    let timer = start_performance_timer();
    let performance_enabled = timer.is_some();
    let content_bytes = content.len();
    let mut performance_details = SaveMarkdownPerformanceDetails {
        bytes: content_bytes,
        ..SaveMarkdownPerformanceDetails::default()
    };
    let result = (|| {
        let document = validate_existing_markdown_document_path(&root_path, &document_path)?;

        if let Some(expected) = expected_modified_at {
            let current = read_modified_at(&document)?;
            if current != expected {
                return Err("文档已在磁盘上更新，请重新加载后再保存".to_string());
            }
        }

        let root = canonical_workspace_root(&root_path)?;
        let old_asset_read_started_at = Instant::now();
        let old_asset_ids = fs::read_to_string(&document)
            .ok()
            .map(|raw| crate::assets::extract_asset_ids_from_markdown(&raw))
            .unwrap_or_default();
        performance_details.old_asset_read_ms =
            finish_performance_segment(old_asset_read_started_at, performance_enabled);
        let new_asset_ids = crate::assets::extract_asset_ids_from_markdown(&content);
        let cleanup_candidates = old_asset_ids
            .difference(&new_asset_ids)
            .cloned()
            .collect::<BTreeSet<_>>();

        let write_started_at = Instant::now();
        write_text_atomic(&document, &content)
            .map_err(|_| "无法保存 Markdown 文档内容".to_string())?;
        performance_details.write_ms =
            finish_performance_segment(write_started_at, performance_enabled);

        let asset_cleanup_started_at = Instant::now();
        if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
            log::warn!("本地资产清理失败：{error}");
        }
        performance_details.asset_cleanup_ms =
            finish_performance_segment(asset_cleanup_started_at, performance_enabled);

        let modified_at = read_modified_at(&document)?;
        let daily_note_index_started_at = Instant::now();
        refresh_daily_note_index_for_path(&root, &document, &content, modified_at)
            .map_err(|error| format!("保存每日笔记索引失败：{error}"))?;
        performance_details.daily_note_index_ms =
            finish_performance_segment(daily_note_index_started_at, performance_enabled);

        Ok(DocumentContentMeta {
            path: document.to_string_lossy().to_string(),
            modified_at,
        })
    })();
    performance_details.error = result.is_err();
    finish_performance_timer(
        "workspace.save_markdown",
        timer,
        &performance_details.to_log_details(),
    );

    result
}

#[tauri::command]
pub fn create_markdown_document(
    root_path: String,
    parent_path: String,
    title: String,
) -> Result<CreatedMarkdownDocument, String> {
    let timer = start_performance_timer();
    let result = (|| {
        let root = canonical_workspace_root(&root_path)?;
        let parent = validate_workspace_directory(&root, &parent_path)?;
        let safe_title = normalize_document_title(&title);
        let document_path = unique_markdown_document_path(&parent, &safe_title);
        let now = current_iso_timestamp();
        let content = format!(
            "---\ntitle: {safe_title}\ncreatedAt: {now}\nupdatedAt: {now}\nrefinexDialect: 1\n---\n\n# {safe_title}\n"
        );

        write_text_atomic(&document_path, &content)
            .map_err(|_| "无法创建 Markdown 文档".to_string())?;

        let file_name = document_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("untitled.md")
            .to_string();
        let node = build_document_node(&root, &document_path, file_name, &BTreeMap::new())
            .map_err(|_| "无法创建 Markdown 文档节点".to_string())?;
        let content = read_markdown_document(root_path, node.absolute_path.clone())?;

        Ok(CreatedMarkdownDocument { node, content })
    })();
    finish_performance_timer(
        "workspace.create_markdown",
        timer,
        if result.is_ok() { "" } else { "error=true" },
    );

    result
}

#[tauri::command]
pub fn migrate_plate_documents_to_markdown(
    root_path: String,
) -> Result<MarkdownMigrationReport, String> {
    let root = canonical_workspace_root(&root_path)?;
    let mut paths = Vec::new();
    collect_plate_document_paths(&root, &mut paths).map_err(|_| "无法扫描旧文档".to_string())?;

    let backup_dir = root
        .join(WORKSPACE_PRIVATE_DIR)
        .join("migrations")
        .join("backup");
    fs::create_dir_all(&backup_dir).map_err(|_| "无法创建迁移备份目录".to_string())?;

    let mut migrated = Vec::new();
    let mut failed = Vec::new();

    for source in paths {
        match migrate_one_plate_document(&backup_dir, &source) {
            Ok(item) => migrated.push(item),
            Err(message) => failed.push(MarkdownMigrationFailure {
                source_path: source.to_string_lossy().to_string(),
                message,
            }),
        }
    }

    Ok(MarkdownMigrationReport { migrated, failed })
}

#[tauri::command]
pub fn create_workspace_root(
    parent_path: String,
    workspace_name: String,
) -> Result<WorkspaceSnapshot, String> {
    let parent = canonical_parent_directory(&parent_path)?;
    let safe_name = validate_workspace_name(&workspace_name)?;
    let workspace_root = parent.join(&safe_name);

    if workspace_root.exists() {
        if !workspace_root.is_dir() {
            return Err("目标工作区路径不是文件夹".to_string());
        }

        if fs::read_dir(&workspace_root)
            .map_err(|_| "无法读取目标工作区目录".to_string())?
            .next()
            .is_some()
        {
            return Err("目标工作区目录已存在且不为空".to_string());
        }
    } else {
        fs::create_dir(&workspace_root).map_err(|_| "无法创建工作区目录".to_string())?;
    }

    ensure_workspace_metadata(&workspace_root)
        .map_err(|error| format!("初始化工作区失败：{error}"))?;
    build_workspace_snapshot(&workspace_root).map_err(|error| format!("读取工作区失败：{error}"))
}

#[tauri::command]
pub fn read_plate_document(
    root_path: String,
    document_path: String,
) -> Result<PlateDocumentContent, String> {
    let document = validate_existing_plate_document_path(&root_path, &document_path)?;
    let raw = fs::read_to_string(&document).map_err(|_| "无法读取文档内容".to_string())?;
    let mut envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw)
        .map_err(|_| "文档格式损坏".to_string())?;
    normalize_plate_envelope_timestamps(&mut envelope);
    validate_plate_envelope(&envelope)?;

    Ok(PlateDocumentContent {
        path: document.to_string_lossy().to_string(),
        envelope,
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn save_plate_document(
    root_path: String,
    document_path: String,
    mut envelope: PlateDocumentEnvelope,
) -> Result<DocumentContentMeta, String> {
    normalize_plate_envelope_timestamps(&mut envelope);
    validate_plate_envelope(&envelope)?;
    let root = canonical_workspace_root(&root_path)?;
    let document = validate_plate_document_path(&root_path, &document_path)?;
    let old_asset_ids = fs::read_to_string(&document)
        .ok()
        .and_then(|raw| serde_json::from_str::<PlateDocumentEnvelope>(&raw).ok())
        .map(|old| extract_asset_ids(&old.content))
        .unwrap_or_default();
    let new_asset_ids = extract_asset_ids(&envelope.content);
    let cleanup_candidates = old_asset_ids
        .difference(&new_asset_ids)
        .cloned()
        .collect::<BTreeSet<_>>();

    write_json_pretty(&document, &envelope).map_err(|_| "无法保存文档内容".to_string())?;
    if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
        log::warn!("本地资产清理失败：{error}");
    }

    let document = document
        .canonicalize()
        .map_err(|_| "无法读取文档信息".to_string())?;

    Ok(DocumentContentMeta {
        path: document.to_string_lossy().to_string(),
        modified_at: read_modified_at(&document)?,
    })
}

#[tauri::command]
pub fn create_plate_document(
    root_path: String,
    parent_path: String,
    title: String,
) -> Result<CreatedPlateDocument, String> {
    let root = canonical_workspace_root(&root_path)?;
    let parent = validate_workspace_directory(&root, &parent_path)?;
    let safe_title = normalize_document_title(&title);
    let document_path = unique_plate_document_path(&parent, &safe_title);
    let now = current_iso_timestamp();
    let envelope = PlateDocumentEnvelope {
        schema_version: 1,
        title: safe_title,
        created_at: now.clone(),
        updated_at: now,
        content: empty_plate_content(),
    };

    write_json_pretty(&document_path, &envelope).map_err(|_| "无法创建文档".to_string())?;

    let file_name = document_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled.plate.json")
        .to_string();

    Ok(CreatedPlateDocument {
        node: build_document_node(&root, &document_path, file_name, &BTreeMap::new())
            .map_err(|_| "无法创建文档节点".to_string())?,
        envelope,
    })
}

#[tauri::command]
pub fn create_workspace_directory(
    root_path: String,
    parent_path: String,
    name: String,
) -> Result<WorkspaceNode, String> {
    let root = canonical_workspace_root(&root_path)?;
    let parent = validate_workspace_directory(&root, &parent_path)?;
    let safe_name = normalize_directory_name(&name);
    let directory_path = unique_directory_path(&parent, &safe_name);

    fs::create_dir(&directory_path).map_err(|_| "无法创建目录".to_string())?;

    build_directory_node(
        &root,
        &directory_path,
        safe_name,
        Vec::new(),
        &BTreeMap::new(),
    )
    .map_err(|_| "无法创建目录节点".to_string())
}

#[tauri::command]
pub fn rename_workspace_node(
    root_path: String,
    node_path: String,
    new_name: String,
) -> Result<WorkspaceNode, String> {
    let (root, node, kind) = validate_workspace_node_path(&root_path, &node_path)?;
    let parent = node.parent().ok_or_else(|| "路径无效".to_string())?;
    let safe_name = validate_workspace_name(&new_name)?;
    let target = match kind {
        WorkspaceNodeKind::Directory => parent.join(&safe_name),
        WorkspaceNodeKind::Document => parent.join(format!("{safe_name}.md")),
    };

    if target.exists() && target != node {
        return Err("目标名称已存在".to_string());
    }

    match kind {
        WorkspaceNodeKind::Directory => {
            fs::rename(&node, &target).map_err(|_| "无法重命名目录".to_string())?;
            let mut metadata =
                ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;
            let sort_order = read_sort_order(&metadata);
            let old_relative_path = to_relative_path(&root, &node);
            let new_relative_path = to_relative_path(&root, &target);
            rewrite_node_state_path_prefix(
                &mut metadata.node_state,
                &old_relative_path,
                &new_relative_path,
            );
            write_workspace_metadata(&root, &metadata)
                .map_err(|_| "无法写入工作区元数据".to_string())?;
            build_directory_node(
                &root,
                &target,
                safe_name,
                read_children(&root, &target, &sort_order, &metadata.node_state)
                    .unwrap_or_default(),
                &metadata.node_state,
            )
            .map_err(|_| "无法读取重命名后的目录".to_string())
        }
        WorkspaceNodeKind::Document => {
            fs::rename(&node, &target).map_err(|_| "无法重命名文档".to_string())?;
            update_markdown_document_title(&target, &safe_name)
                .map_err(|_| "无法更新文档标题".to_string())?;
            let mut metadata =
                ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;
            let old_relative_path = to_relative_path(&root, &node);
            let new_relative_path = to_relative_path(&root, &target);
            rewrite_node_state_path_prefix(
                &mut metadata.node_state,
                &old_relative_path,
                &new_relative_path,
            );
            write_workspace_metadata(&root, &metadata)
                .map_err(|_| "无法写入工作区元数据".to_string())?;

            let file_name = target
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("renamed.md")
                .to_string();
            build_document_node(&root, &target, file_name, &metadata.node_state)
                .map_err(|_| "无法读取重命名后的文档".to_string())
        }
    }
}

#[tauri::command]
pub fn delete_workspace_node(
    root_path: String,
    node_path: String,
) -> Result<DeletedWorkspaceNode, String> {
    let (root, node, kind) = validate_workspace_node_path(&root_path, &node_path)?;
    let deleted_path = node.to_string_lossy().to_string();
    let cleanup_candidates = match kind {
        WorkspaceNodeKind::Directory => {
            let mut documents = Vec::new();
            collect_markdown_document_paths(&node, &mut documents)
                .map_err(|_| "无法扫描待删除目录".to_string())?;
            collect_asset_ids_from_markdown_paths(&documents)
        }
        WorkspaceNodeKind::Document => {
            collect_asset_ids_from_markdown_paths(std::slice::from_ref(&node))
        }
    };

    match kind {
        WorkspaceNodeKind::Directory => {
            fs::remove_dir_all(&node).map_err(|_| "无法删除目录".to_string())?;
        }
        WorkspaceNodeKind::Document => {
            fs::remove_file(&node).map_err(|_| "无法删除文档".to_string())?;
        }
    }

    if let Err(error) = cleanup_unreferenced_assets(&root, cleanup_candidates) {
        log::warn!("本地资产清理失败：{error}");
    }
    let mut metadata =
        ensure_workspace_metadata(&root).map_err(|_| "无法读取工作区元数据".to_string())?;
    let relative_path = to_relative_path(&root, &node);
    remove_node_state_path_prefix(&mut metadata.node_state, &relative_path);
    write_workspace_metadata(&root, &metadata).map_err(|_| "无法写入工作区元数据".to_string())?;

    Ok(DeletedWorkspaceNode { path: deleted_path })
}

#[tauri::command]
pub fn move_workspace_node(
    root_path: String,
    node_path: String,
    target_parent_path: String,
    before_path: Option<String>,
    after_path: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let root = canonical_workspace_root(&root_path)?;
    let (source, kind) = resolve_workspace_node_for_move(&root, &node_path)?;
    let target_parent = resolve_workspace_directory_for_move(&root, &target_parent_path)?;

    if kind == WorkspaceNodeKind::Directory && target_parent.starts_with(&source) {
        return Err("不能将目录移动到自身或其子目录内".to_string());
    }

    let before = resolve_optional_workspace_node_for_move(&root, before_path.as_deref())?;
    let after = resolve_optional_workspace_node_for_move(&root, after_path.as_deref())?;
    validate_move_sibling_parent(&target_parent, before.as_deref())?;
    validate_move_sibling_parent(&target_parent, after.as_deref())?;

    let file_name = source
        .file_name()
        .ok_or_else(|| "无法读取节点名称".to_string())?
        .to_os_string();
    let destination = target_parent.join(file_name);

    if destination.exists() {
        let existing = destination
            .canonicalize()
            .map_err(|_| "无法读取目标位置".to_string())?;

        if existing != source {
            return Err("目标位置已存在同名节点".to_string());
        }
    }

    let old_relative_path = to_relative_path(&root, &source);

    if destination != source {
        fs::rename(&source, &destination).map_err(|error| format!("移动节点失败：{error}"))?;
    }

    let destination = destination
        .canonicalize()
        .map_err(|_| "无法读取移动后的节点".to_string())?;
    let new_relative_path = to_relative_path(&root, &destination);
    let target_parent_relative_path = to_relative_path(&root, &target_parent);

    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    let mut sort_order = read_sort_order(&metadata);
    rewrite_sort_order_path_prefix(&mut sort_order, &old_relative_path, &new_relative_path);
    rewrite_node_state_path_prefix(
        &mut metadata.node_state,
        &old_relative_path,
        &new_relative_path,
    );
    ensure_parent_sort_records(&root, &target_parent, &mut sort_order)
        .map_err(|error| format!("初始化排序元数据失败：{error}"))?;

    let previous_relative_path = match after.as_ref() {
        Some(path) => Some(to_relative_path(&root, path)),
        None if before.is_none() => {
            find_last_sibling_relative_path(&root, &target_parent, &new_relative_path, &sort_order)
                .map_err(|error| format!("读取目标排序失败：{error}"))?
        }
        None => None,
    };
    let next_relative_path = before.as_ref().map(|path| to_relative_path(&root, path));

    assign_rank_with_rebalance(
        &mut sort_order,
        &new_relative_path,
        &target_parent_relative_path,
        previous_relative_path.as_deref(),
        next_relative_path.as_deref(),
    );
    write_sort_order(&mut metadata, &sort_order)
        .map_err(|error| format!("更新排序元数据失败：{error}"))?;
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存排序元数据失败：{error}"))?;

    build_workspace_snapshot(&root).map_err(|error| format!("读取工作区失败：{error}"))
}

#[tauri::command]
pub fn read_markdown_source_files(
    source_paths: Vec<String>,
) -> Result<Vec<MarkdownSourceFile>, String> {
    source_paths
        .into_iter()
        .map(|source_path| {
            let path = PathBuf::from(&source_path)
                .canonicalize()
                .map_err(|_| "Markdown 源文件不存在".to_string())?;

            if !is_markdown_source_file(&path) {
                return Err("仅支持导入 .md 或 .mdx 文件".to_string());
            }

            let content =
                fs::read_to_string(&path).map_err(|_| "无法读取 Markdown 源文件".to_string())?;
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("import.md")
                .to_string();

            Ok(MarkdownSourceFile {
                path: path.to_string_lossy().to_string(),
                file_name,
                content,
            })
        })
        .collect()
}

#[tauri::command]
pub fn read_import_source_files(
    source_paths: Vec<String>,
    format: ImportSourceFormat,
) -> Result<Vec<ImportSourceFile>, String> {
    source_paths
        .into_iter()
        .map(|source_path| {
            let path = PathBuf::from(&source_path)
                .canonicalize()
                .map_err(|_| "导入源文件不存在".to_string())?;

            if !is_import_source_file(&path, &format) {
                return Err(import_source_format_error(&format).to_string());
            }

            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("import")
                .to_string();

            match format {
                ImportSourceFormat::Html | ImportSourceFormat::Markdown => {
                    let content =
                        fs::read_to_string(&path).map_err(|_| "无法读取导入源文件".to_string())?;

                    Ok(ImportSourceFile {
                        path: path.to_string_lossy().to_string(),
                        file_name,
                        content: Some(content),
                        base64_data: None,
                    })
                }
                ImportSourceFormat::Word => {
                    let bytes = fs::read(&path).map_err(|_| "无法读取 Word 源文件".to_string())?;

                    Ok(ImportSourceFile {
                        path: path.to_string_lossy().to_string(),
                        file_name,
                        content: None,
                        base64_data: Some(general_purpose::STANDARD.encode(bytes)),
                    })
                }
            }
        })
        .collect()
}

#[tauri::command]
pub fn write_export_file(target_path: String, base64_data: String) -> Result<String, String> {
    let path = PathBuf::from(target_path);
    let bytes = decode_base64_export_data(&base64_data)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建导出目录".to_string())?;
    }

    fs::write(&path, bytes).map_err(|_| "无法写入导出文件".to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_imported_plate_documents(
    root_path: String,
    target_dir: String,
    documents: Vec<ImportedPlateDocumentInput>,
) -> Result<ImportedPlateDocumentResult, String> {
    let root = canonical_workspace_root(&root_path)?;
    let target = validate_workspace_directory(&root, &target_dir)?;
    let mut created = Vec::new();
    let mut failed = Vec::new();

    for document in documents {
        if !document.content.is_array() {
            failed.push(ImportFailure {
                source_file_name: document.source_file_name,
                message: "文档内容格式无效".to_string(),
            });
            continue;
        }

        let title = normalize_document_title(&document.title);
        let path = unique_plate_document_path(&target, &title);
        let now = current_iso_timestamp();
        let envelope = PlateDocumentEnvelope {
            schema_version: 1,
            title,
            created_at: now.clone(),
            updated_at: now,
            content: document.content,
        };

        match write_json_pretty(&path, &envelope) {
            Ok(()) => {
                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("import.plate.json")
                    .to_string();

                match build_document_node(&root, &path, file_name, &BTreeMap::new()) {
                    Ok(node) => created.push(CreatedPlateDocument { node, envelope }),
                    Err(_) => failed.push(ImportFailure {
                        source_file_name: document.source_file_name,
                        message: "无法创建导入文档节点".to_string(),
                    }),
                }
            }
            Err(_) => failed.push(ImportFailure {
                source_file_name: document.source_file_name,
                message: "无法写入导入文档".to_string(),
            }),
        }
    }

    Ok(ImportedPlateDocumentResult { created, failed })
}

pub fn build_workspace_snapshot(root: &Path) -> std::io::Result<WorkspaceSnapshot> {
    let root = root.canonicalize()?;
    let metadata = ensure_workspace_metadata(&root)?;
    let sort_order = read_sort_order(&metadata);
    let root_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Workspace")
        .to_string();

    Ok(WorkspaceSnapshot {
        root_path: root.to_string_lossy().to_string(),
        root_name,
        nodes: read_children(&root, &root, &sort_order, &metadata.node_state)?,
    })
}

fn read_children(
    root: &Path,
    dir: &Path,
    sort_order: &WorkspaceSortOrder,
    node_state: &BTreeMap<String, WorkspaceNodeState>,
) -> std::io::Result<Vec<WorkspaceNode>> {
    let mut nodes = Vec::new();

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip_entry(&file_name) {
            continue;
        }

        let sort_timestamp = read_sort_timestamp(&path)?;

        if path.is_dir() {
            let children = read_children(root, &path, sort_order, node_state)?;
            nodes.push((
                build_directory_node(root, &path, file_name, children, node_state)?,
                sort_timestamp,
            ));
        } else if is_markdown_document_file(&path) {
            nodes.push((
                build_document_node(root, &path, file_name, node_state)?,
                sort_timestamp,
            ));
        }
    }

    let parent_path = to_relative_path(root, dir);
    nodes.sort_by(|(left, left_timestamp), (right, right_timestamp)| {
        compare_workspace_nodes(
            &parent_path,
            left,
            *left_timestamp,
            right,
            *right_timestamp,
            sort_order,
        )
    });

    Ok(nodes.into_iter().map(|(node, _)| node).collect())
}

fn compare_workspace_nodes(
    parent_path: &str,
    left: &WorkspaceNode,
    left_timestamp: u128,
    right: &WorkspaceNode,
    right_timestamp: u128,
    sort_order: &WorkspaceSortOrder,
) -> std::cmp::Ordering {
    let left_rank = sort_order
        .nodes
        .get(&left.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);
    let right_rank = sort_order
        .nodes
        .get(&right.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);

    match (left_rank, right_rank) {
        (Some(left_rank), Some(right_rank)) => left_rank
            .cmp(&right_rank)
            .then_with(|| left_timestamp.cmp(&right_timestamp))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left_timestamp
            .cmp(&right_timestamp)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
    }
}

fn assign_rank_with_rebalance(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let previous_rank = previous_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });
    let next_rank = next_path.and_then(|path| {
        sort_order
            .nodes
            .get(path)
            .filter(|record| record.parent_path == parent_path)
            .map(|record| record.rank)
    });

    let candidate = match (previous_rank, next_rank) {
        (Some(previous), Some(next)) if next - previous > 1 => {
            Some(previous + ((next - previous) / 2))
        }
        (Some(previous), None) => Some(previous + SORT_ORDER_STEP),
        (None, Some(next)) if next > 1 => Some(next / 2),
        (None, None) => Some(SORT_ORDER_STEP),
        _ => None,
    };

    if let Some(rank) = candidate {
        sort_order.nodes.insert(
            moved_path.to_string(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
        return rank;
    }

    rebalance_parent_ranks(
        sort_order,
        moved_path,
        parent_path,
        previous_path,
        next_path,
    )
}

fn rebalance_parent_ranks(
    sort_order: &mut WorkspaceSortOrder,
    moved_path: &str,
    parent_path: &str,
    previous_path: Option<&str>,
    next_path: Option<&str>,
) -> i64 {
    let mut ordered_paths = sort_order
        .nodes
        .iter()
        .filter(|(path, record)| record.parent_path == parent_path && path.as_str() != moved_path)
        .map(|(path, record)| (path.clone(), record.rank))
        .collect::<Vec<_>>();

    ordered_paths.sort_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(&right.0)));

    let insert_index = if let Some(previous_path) = previous_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == previous_path)
            .map(|index| index + 1)
            .unwrap_or(ordered_paths.len())
    } else if let Some(next_path) = next_path {
        ordered_paths
            .iter()
            .position(|(path, _)| path == next_path)
            .unwrap_or(0)
    } else {
        ordered_paths.len()
    };

    ordered_paths.insert(insert_index, (moved_path.to_string(), 0));

    let mut moved_rank = SORT_ORDER_STEP;
    for (index, (path, _)) in ordered_paths.iter().enumerate() {
        let rank = ((index as i64) + 1) * SORT_ORDER_STEP;

        if path == moved_path {
            moved_rank = rank;
        }

        sort_order.nodes.insert(
            path.clone(),
            WorkspaceSortRecord {
                parent_path: parent_path.to_string(),
                rank,
            },
        );
    }

    moved_rank
}

#[derive(Debug)]
struct SortableChildEntry {
    relative_path: String,
    name: String,
    sort_timestamp: u128,
}

#[derive(Debug, PartialEq, Eq)]
struct MarkdownNodeMetadata {
    title: Option<String>,
    created_at: Option<u128>,
    updated_at: Option<u128>,
}

#[derive(Debug, Default, PartialEq)]
struct SaveMarkdownPerformanceDetails {
    asset_cleanup_ms: Option<f64>,
    bytes: usize,
    daily_note_index_ms: Option<f64>,
    error: bool,
    old_asset_read_ms: Option<f64>,
    write_ms: Option<f64>,
}

fn ensure_parent_sort_records(
    root: &Path,
    parent: &Path,
    sort_order: &mut WorkspaceSortOrder,
) -> std::io::Result<()> {
    let parent_path = to_relative_path(root, parent);
    let mut entries = read_sortable_child_entries(root, parent)?;

    entries.sort_by(|left, right| {
        compare_sortable_child_entries(&parent_path, left, right, sort_order)
    });

    let needs_rebalance = entries.iter().any(|entry| {
        sort_order
            .nodes
            .get(&entry.relative_path)
            .filter(|record| record.parent_path == parent_path)
            .is_none()
    });

    if !needs_rebalance {
        return Ok(());
    }

    for (index, entry) in entries.iter().enumerate() {
        sort_order.nodes.insert(
            entry.relative_path.clone(),
            WorkspaceSortRecord {
                parent_path: parent_path.clone(),
                rank: ((index as i64) + 1) * SORT_ORDER_STEP,
            },
        );
    }

    Ok(())
}

fn find_last_sibling_relative_path(
    root: &Path,
    parent: &Path,
    moved_path: &str,
    sort_order: &WorkspaceSortOrder,
) -> std::io::Result<Option<String>> {
    let parent_path = to_relative_path(root, parent);
    let mut entries = read_sortable_child_entries(root, parent)?;

    entries.sort_by(|left, right| {
        compare_sortable_child_entries(&parent_path, left, right, sort_order)
    });

    Ok(entries
        .into_iter()
        .filter(|entry| entry.relative_path != moved_path)
        .next_back()
        .map(|entry| entry.relative_path))
}

fn read_sortable_child_entries(
    root: &Path,
    parent: &Path,
) -> std::io::Result<Vec<SortableChildEntry>> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if should_skip_entry(&file_name) {
            continue;
        }

        if path.is_dir() || is_markdown_document_file(&path) {
            entries.push(SortableChildEntry {
                relative_path: to_relative_path(root, &path),
                name: file_name,
                sort_timestamp: read_sort_timestamp(&path)?,
            });
        }
    }

    Ok(entries)
}

fn compare_sortable_child_entries(
    parent_path: &str,
    left: &SortableChildEntry,
    right: &SortableChildEntry,
    sort_order: &WorkspaceSortOrder,
) -> std::cmp::Ordering {
    let left_rank = sort_order
        .nodes
        .get(&left.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);
    let right_rank = sort_order
        .nodes
        .get(&right.relative_path)
        .filter(|record| record.parent_path == parent_path)
        .map(|record| record.rank);

    match (left_rank, right_rank) {
        (Some(left_rank), Some(right_rank)) => left_rank
            .cmp(&right_rank)
            .then_with(|| left.sort_timestamp.cmp(&right.sort_timestamp))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => left
            .sort_timestamp
            .cmp(&right.sort_timestamp)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase())),
    }
}

fn rewrite_sort_order_path_prefix(
    sort_order: &mut WorkspaceSortOrder,
    old_prefix: &str,
    new_prefix: &str,
) {
    let affected = sort_order
        .nodes
        .iter()
        .filter_map(|(path, record)| {
            if path == old_prefix || path.starts_with(&format!("{old_prefix}/")) {
                Some((path.clone(), record.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for (path, _) in &affected {
        sort_order.nodes.remove(path);
    }

    for (path, mut record) in affected {
        let next_path = rewrite_relative_prefix(&path, old_prefix, new_prefix);
        record.parent_path = rewrite_relative_prefix(&record.parent_path, old_prefix, new_prefix);
        sort_order.nodes.insert(next_path, record);
    }
}

fn rewrite_node_state_path_prefix(
    node_state: &mut BTreeMap<String, WorkspaceNodeState>,
    old_prefix: &str,
    new_prefix: &str,
) {
    let affected = node_state
        .iter()
        .filter_map(|(path, state)| {
            if path == old_prefix || path.starts_with(&format!("{old_prefix}/")) {
                Some((path.clone(), state.clone()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for (path, _) in &affected {
        node_state.remove(path);
    }

    for (path, state) in affected {
        node_state.insert(
            rewrite_relative_prefix(&path, old_prefix, new_prefix),
            state,
        );
    }
}

fn remove_node_state_path_prefix(
    node_state: &mut BTreeMap<String, WorkspaceNodeState>,
    prefix: &str,
) {
    node_state.retain(|path, _| path != prefix && !path.starts_with(&format!("{prefix}/")));
}

fn rewrite_relative_prefix(value: &str, old_prefix: &str, new_prefix: &str) -> String {
    if value == old_prefix {
        return new_prefix.to_string();
    }

    if let Some(suffix) = value.strip_prefix(&format!("{old_prefix}/")) {
        return format!("{new_prefix}/{suffix}");
    }

    value.to_string()
}

fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        recent_document_paths: Vec::new(),
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
        daily_notes: WorkspaceDailyNotes::default(),
        node_state: BTreeMap::new(),
        git_sync: WorkspaceGitSyncSettings::default(),
    }
}

fn default_git_sync_enabled() -> bool {
    true
}

fn default_git_sync_interval_minutes() -> u32 {
    10
}

fn default_git_sync_conflict_resolution() -> String {
    "abort".to_string()
}

fn validate_workspace_git_sync_settings(settings: &WorkspaceGitSyncSettings) -> Result<(), String> {
    if !matches!(settings.interval_minutes, 1 | 2 | 3 | 5 | 10 | 15 | 30 | 60) {
        return Err("Git Sync 同步频率不支持".to_string());
    }

    if !matches!(
        settings.conflict_resolution.as_str(),
        "abort" | "local" | "remote"
    ) {
        return Err("Git Sync 差异处理策略不支持".to_string());
    }

    if let Some(last_synced_at) = &settings.last_synced_at {
        DateTime::parse_from_rfc3339(last_synced_at)
            .map_err(|_| "Git Sync 上次同步时间格式无效".to_string())?;
    }

    Ok(())
}

fn parse_daily_date(date: &str) -> Result<chrono::NaiveDate, String> {
    let bytes = date.as_bytes();
    let has_strict_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, value)| matches!(index, 4 | 7) || value.is_ascii_digit());

    if !has_strict_shape {
        return Err("日期格式无效，请使用 YYYY-MM-DD".to_string());
    }

    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "日期格式无效，请使用 YYYY-MM-DD".to_string())
}

fn parse_daily_month(month: &str) -> Result<(i32, u32), String> {
    let bytes = month.as_bytes();
    let has_strict_shape = bytes.len() == 7
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, value)| index == 4 || value.is_ascii_digit());

    if !has_strict_shape {
        return Err("月份格式无效，请使用 YYYY-MM".to_string());
    }

    let date = chrono::NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| "月份格式无效，请使用 YYYY-MM".to_string())?;
    let year = month[0..4]
        .parse::<i32>()
        .map_err(|_| "月份格式无效，请使用 YYYY-MM".to_string())?;
    let month_number = date
        .format("%m")
        .to_string()
        .parse::<u32>()
        .map_err(|_| "月份格式无效，请使用 YYYY-MM".to_string())?;

    Ok((year, month_number))
}

fn daily_note_path(root: &Path, day: chrono::NaiveDate) -> PathBuf {
    root.join("Daily")
        .join(day.format("%Y").to_string())
        .join(day.format("%m").to_string())
        .join(format!("{}.md", day.format("%Y-%m-%d")))
}

fn daily_note_template(day: chrono::NaiveDate) -> String {
    let date = day.format("%Y-%m-%d");
    let now = current_iso_timestamp();

    format!(
        "---\ntitle: {date}\ncreatedAt: {now}\nupdatedAt: {now}\nrefinexDialect: 1\ndailyDate: {date}\n---\n\n# {date}\n"
    )
}

fn daily_note_has_content(raw: &str, date: &str) -> bool {
    daily_note_body_without_scaffold(raw, date)
        .lines()
        .any(|line| !line.trim().is_empty())
}

fn daily_note_body_without_scaffold<'a>(raw: &'a str, date: &str) -> String {
    let mut body = raw;

    if raw.starts_with("---\n") || raw.starts_with("---\r\n") {
        if let Some(closing_start) = raw[3..].find("\n---") {
            let closing_start = closing_start + 3;
            let closing_end = closing_start + "\n---".len();
            let after = &raw[closing_end..];
            body = after
                .strip_prefix("\r\n")
                .or_else(|| after.strip_prefix('\n'))
                .unwrap_or(after);
        }
    }

    let mut removed_heading = false;
    body.lines()
        .filter(|line| {
            if removed_heading {
                return true;
            }

            let trimmed = line.trim();
            if trimmed == format!("# {date}") {
                removed_heading = true;
                return false;
            }

            true
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn daily_date_from_path(root: &Path, path: &Path) -> Option<String> {
    let relative_path = to_relative_path(root, path);
    let parts = relative_path.split('/').collect::<Vec<_>>();

    if parts.len() != 4 || parts[0] != "Daily" {
        return None;
    }

    let file_date = parts[3].strip_suffix(".md")?;

    if file_date.len() != 10 || parts[1] != &file_date[0..4] || parts[2] != &file_date[5..7] {
        return None;
    }

    parse_daily_date(file_date).ok()?;

    Some(file_date.to_string())
}

fn refresh_daily_note_index_for_path(
    root: &Path,
    document: &Path,
    content: &str,
    modified_at: u128,
) -> io::Result<()> {
    let Some(date) = daily_date_from_path(root, document) else {
        return Ok(());
    };
    let mut metadata = ensure_workspace_metadata(root)?;

    metadata.daily_notes.entries.insert(
        date.clone(),
        DailyNoteEntry {
            document_path: document.to_string_lossy().to_string(),
            has_content: daily_note_has_content(content, &date),
            updated_at: modified_at,
        },
    );
    write_workspace_metadata(root, &metadata)
}

fn read_sort_order(metadata: &WorkspaceMetadata) -> WorkspaceSortOrder {
    serde_json::from_value(Value::Object(metadata.sort_order.clone())).unwrap_or_default()
}

fn write_sort_order(
    metadata: &mut WorkspaceMetadata,
    sort_order: &WorkspaceSortOrder,
) -> io::Result<()> {
    let value = serde_json::to_value(sort_order)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

    metadata.sort_order = match value {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };

    Ok(())
}

fn ensure_workspace_metadata(root: &Path) -> io::Result<WorkspaceMetadata> {
    let metadata_dir = workspace_private_dir(root);
    let metadata_path = metadata_dir.join("workspace.json");
    fs::create_dir_all(&metadata_dir)?;

    if !metadata_path.exists() {
        let metadata = default_workspace_metadata();
        write_json_pretty(&metadata_path, &metadata)?;
        return Ok(metadata);
    }

    let raw = fs::read_to_string(&metadata_path)?;
    match serde_json::from_str::<WorkspaceMetadata>(&raw) {
        Ok(mut metadata) if metadata.schema_version == 1 => {
            normalize_recent_document_paths(&mut metadata);
            Ok(metadata)
        }
        _ => {
            let backup_path = metadata_dir.join(format!(
                "workspace.corrupt.{}.json",
                unix_timestamp_millis()
            ));
            fs::rename(&metadata_path, backup_path)?;
            let metadata = default_workspace_metadata();
            write_json_pretty(&metadata_path, &metadata)?;
            Ok(metadata)
        }
    }
}

/// 把旧的 `recentDocumentPath`（单数）迁移进新的 `recentDocumentPaths`（复数）。
/// 仅在内存规范化，不写盘——保持 `ensure_workspace` 只读语义。
// author: refinex
fn normalize_recent_document_paths(metadata: &mut WorkspaceMetadata) {
    if !metadata.recent_document_paths.is_empty() {
        return;
    }

    if let Some(single) = metadata.recent_document_path.take() {
        if !single.trim().is_empty() {
            metadata.recent_document_paths.push(single);
        }
    }
}

fn write_json_pretty<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(path, format!("{json}\n"))
}

fn write_text_atomic(path: &Path, content: &str) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.md");
    let temp_path = parent.join(format!(".{file_name}.tmp"));

    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)
}

fn write_workspace_metadata(root: &Path, metadata: &WorkspaceMetadata) -> io::Result<()> {
    write_json_pretty(
        &workspace_private_dir(root).join("workspace.json"),
        metadata,
    )
}

fn canonical_workspace_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;

    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }

    Ok(root)
}

fn canonical_parent_directory(parent_path: &str) -> Result<PathBuf, String> {
    let parent = PathBuf::from(parent_path)
        .canonicalize()
        .map_err(|_| "所在目录不存在".to_string())?;

    if !parent.is_dir() {
        return Err("所在目录不是文件夹".to_string());
    }

    Ok(parent)
}

fn validate_existing_external_open_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();

    if trimmed.is_empty() {
        return Err("打开路径不能为空".to_string());
    }

    let target = expand_tilde_path(trimmed)
        .canonicalize()
        .map_err(|_| "打开路径不存在".to_string())?;

    if !target.is_file() && !target.is_dir() {
        return Err("打开路径必须是文件或目录".to_string());
    }

    Ok(target)
}

fn expand_tilde_path(path: &str) -> PathBuf {
    if path == "~" {
        return env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(path));
    }

    if let Some(rest) = path.strip_prefix("~/") {
        return env::var("HOME")
            .map(|home| PathBuf::from(home).join(rest))
            .unwrap_or_else(|_| PathBuf::from(path));
    }

    PathBuf::from(path)
}

fn preferred_editor_macos_app_name(app: &str) -> Option<&'static str> {
    match app {
        "cursor" => Some("Cursor"),
        "zed" => Some("Zed"),
        "sublime" => Some("Sublime Text"),
        "xcode" => Some("Xcode"),
        "windsurf" => Some("Windsurf"),
        "trae" => Some("Trae"),
        "iterm" => Some("iTerm"),
        "warp" => Some("Warp"),
        "terminal" => Some("Terminal"),
        "ghostty" => Some("Ghostty"),
        "vscode" => Some("Visual Studio Code"),
        "vscode-insiders" => Some("Visual Studio Code - Insiders"),
        "intellij" => Some("IntelliJ IDEA"),
        "webstorm" => Some("WebStorm"),
        "pycharm" => Some("PyCharm"),
        "phpstorm" => Some("PhpStorm"),
        "goland" => Some("GoLand"),
        "clion" => Some("CLion"),
        "rider" => Some("Rider"),
        "fleet" => Some("Fleet"),
        "rustrover" => Some("RustRover"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn open_path_with_macos_app(path: &Path, app_name: &str) -> Result<(), String> {
    Command::new("open")
        .arg("-a")
        .arg(app_name)
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开外部编辑器失败：{error}"))?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn open_path_with_macos_app(_path: &Path, _app_name: &str) -> Result<(), String> {
    Err("Preferred Editor 目前仅支持 macOS".to_string())
}

fn should_skip_entry(file_name: &str) -> bool {
    file_name == WORKSPACE_PRIVATE_DIR
        || file_name == ".git"
        || matches!(file_name, "node_modules" | "target" | "dist" | "build")
}

fn workspace_private_dir(root: &Path) -> PathBuf {
    root.join(WORKSPACE_PRIVATE_DIR)
}

fn is_plate_document_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.ends_with(".plate.json"))
        .unwrap_or(false)
}

fn is_markdown_document_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn is_markdown_source_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn is_import_source_file(path: &Path, format: &ImportSourceFormat) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| match format {
            ImportSourceFormat::Html => {
                matches!(extension.to_ascii_lowercase().as_str(), "html" | "htm")
            }
            ImportSourceFormat::Markdown => {
                matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx")
            }
            ImportSourceFormat::Word => extension.eq_ignore_ascii_case("docx"),
        })
        .unwrap_or(false)
}

fn import_source_format_error(format: &ImportSourceFormat) -> &'static str {
    match format {
        ImportSourceFormat::Html => "仅支持导入 .html 或 .htm 文件",
        ImportSourceFormat::Markdown => "仅支持导入 .md 或 .mdx 文件",
        ImportSourceFormat::Word => "仅支持导入 .docx 文件",
    }
}

fn decode_base64_export_data(base64_data: &str) -> Result<Vec<u8>, String> {
    general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|_| "导出文件内容无效".to_string())
}

fn validate_plate_envelope(envelope: &PlateDocumentEnvelope) -> Result<(), String> {
    if envelope.schema_version != 1 {
        return Err("文档版本不兼容".to_string());
    }

    if !envelope.content.is_array() {
        return Err("文档内容格式无效".to_string());
    }

    if envelope.title.trim().is_empty() {
        return Err("文档标题不能为空".to_string());
    }

    Ok(())
}

fn validate_existing_plate_document_path(
    root_path: &str,
    document_path: &str,
) -> Result<PathBuf, String> {
    let document = validate_plate_document_path(root_path, document_path)?;

    if !document.is_file() {
        return Err("文档路径不是文件".to_string());
    }

    Ok(document)
}

fn validate_plate_document_path(root_path: &str, document_path: &str) -> Result<PathBuf, String> {
    let root = canonical_workspace_root(root_path)?;
    let document = PathBuf::from(document_path);
    let document = if document.exists() {
        document
            .canonicalize()
            .map_err(|_| "文档路径不存在".to_string())?
    } else {
        document
    };
    let parent = document
        .parent()
        .ok_or_else(|| "文档路径无效".to_string())?
        .canonicalize()
        .map_err(|_| "文档目录不存在".to_string())?;

    if !parent.starts_with(&root) {
        return Err("无法访问工作区外的文档".to_string());
    }

    if !is_plate_document_file(&document) {
        return Err("仅支持 Plate 原生文档".to_string());
    }

    Ok(document)
}

fn validate_existing_markdown_document_path(
    root_path: &str,
    document_path: &str,
) -> Result<PathBuf, String> {
    let document = validate_markdown_document_path(root_path, document_path)?;

    if !document.is_file() {
        return Err("文档路径不是文件".to_string());
    }

    Ok(document)
}

fn validate_markdown_document_path(
    root_path: &str,
    document_path: &str,
) -> Result<PathBuf, String> {
    let root = canonical_workspace_root(root_path)?;
    let document = PathBuf::from(document_path);
    let document = if document.exists() {
        document
            .canonicalize()
            .map_err(|_| "文档路径不存在".to_string())?
    } else {
        document
    };
    let parent = document
        .parent()
        .ok_or_else(|| "文档路径无效".to_string())?
        .canonicalize()
        .map_err(|_| "文档目录不存在".to_string())?;

    if !parent.starts_with(&root) {
        return Err("无法访问工作区外的文档".to_string());
    }

    if is_workspace_private_path(&root, &document) {
        return Err("不能操作工作区元数据".to_string());
    }

    if !is_markdown_document_file(&document) {
        return Err("仅支持 Markdown 文档".to_string());
    }

    Ok(document)
}

fn validate_workspace_directory(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let target = if relative_path.trim().is_empty() {
        root.to_path_buf()
    } else {
        let relative = Path::new(relative_path);

        if relative.is_absolute() {
            return Err("无法访问工作区外的目录".to_string());
        }

        root.join(relative)
    };

    let target = target
        .canonicalize()
        .map_err(|_| "目录路径不存在".to_string())?;

    if !target.starts_with(root) {
        return Err("无法访问工作区外的目录".to_string());
    }

    if !target.is_dir() {
        return Err("路径不是目录".to_string());
    }

    Ok(target)
}

fn validate_workspace_node_path(
    root_path: &str,
    node_path: &str,
) -> Result<(PathBuf, PathBuf, WorkspaceNodeKind), String> {
    let root = canonical_workspace_root(root_path)?;
    let node = PathBuf::from(node_path)
        .canonicalize()
        .map_err(|_| "路径不存在".to_string())?;

    if node == root {
        return Err("不能操作工作区根目录".to_string());
    }

    if !node.starts_with(&root) {
        return Err("无法访问工作区外的路径".to_string());
    }

    if is_workspace_private_path(&root, &node) {
        return Err("不能操作工作区元数据".to_string());
    }

    if node.is_dir() {
        return Ok((root, node, WorkspaceNodeKind::Directory));
    }

    if node.is_file() && is_markdown_document_file(&node) {
        return Ok((root, node, WorkspaceNodeKind::Document));
    }

    Err("仅支持工作区目录或 Markdown 文档".to_string())
}

fn resolve_workspace_path_for_move(root: &Path, path: &str) -> Result<PathBuf, String> {
    let candidate = if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else if path.trim().is_empty() {
        root.to_path_buf()
    } else {
        root.join(path)
    };
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "目标节点不存在".to_string())?;

    if !canonical.starts_with(root) {
        return Err("路径必须位于工作区内".to_string());
    }

    if is_workspace_private_path(root, &canonical) {
        return Err("不能操作工作区元数据".to_string());
    }

    Ok(canonical)
}

fn is_workspace_private_path(root: &Path, path: &Path) -> bool {
    path.starts_with(workspace_private_dir(root))
}

fn resolve_workspace_node_for_move(
    root: &Path,
    node_path: &str,
) -> Result<(PathBuf, WorkspaceNodeKind), String> {
    let node = resolve_workspace_path_for_move(root, node_path)?;

    if node == root {
        return Err("不能操作工作区根目录".to_string());
    }

    if node.is_dir() {
        return Ok((node, WorkspaceNodeKind::Directory));
    }

    if node.is_file() && is_markdown_document_file(&node) {
        return Ok((node, WorkspaceNodeKind::Document));
    }

    Err("仅支持工作区目录或 Markdown 文档".to_string())
}

fn resolve_workspace_directory_for_move(
    root: &Path,
    directory_path: &str,
) -> Result<PathBuf, String> {
    let directory = resolve_workspace_path_for_move(root, directory_path)?;

    if !directory.is_dir() {
        return Err("目标父级不是目录".to_string());
    }

    Ok(directory)
}

fn resolve_optional_workspace_node_for_move(
    root: &Path,
    path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    path.map(|value| resolve_workspace_node_for_move(root, value).map(|(node, _)| node))
        .transpose()
}

fn validate_move_sibling_parent(
    target_parent: &Path,
    sibling: Option<&Path>,
) -> Result<(), String> {
    if let Some(sibling) = sibling {
        if sibling.parent() != Some(target_parent) {
            return Err("排序相邻节点必须位于目标父级内".to_string());
        }
    }

    Ok(())
}

fn empty_plate_content() -> Value {
    serde_json::json!([{ "type": "p", "children": [{ "text": "" }] }])
}

fn normalize_document_title(title: &str) -> String {
    let normalized = sanitize_file_stem(title);

    if normalized.is_empty() {
        "未命名文档".to_string()
    } else {
        normalized
    }
}

fn normalize_directory_name(name: &str) -> String {
    let normalized = sanitize_file_stem(name);

    if normalized.is_empty() {
        "未命名目录".to_string()
    } else {
        normalized
    }
}

fn validate_workspace_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    if matches!(trimmed, "." | "..") {
        return Err("工作区名称无效".to_string());
    }

    if trimmed.chars().any(|character| {
        matches!(
            character,
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        )
    }) {
        return Err("工作区名称不能包含路径特殊字符".to_string());
    }

    Ok(trimmed.to_string())
}

fn sanitize_file_stem(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => character,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string()
}

fn unique_plate_document_path(parent: &Path, title: &str) -> PathBuf {
    unique_path(parent, title, ".plate.json")
}

fn unique_markdown_document_path(parent: &Path, title: &str) -> PathBuf {
    unique_path(parent, title, ".md")
}

fn unique_directory_path(parent: &Path, name: &str) -> PathBuf {
    unique_path(parent, name, "")
}

fn unique_path(parent: &Path, stem: &str, suffix: &str) -> PathBuf {
    let first_name = format!("{stem}{suffix}");
    let first_path = parent.join(&first_name);

    if !first_path.exists() {
        return first_path;
    }

    for index in 1.. {
        let candidate = parent.join(format!("{stem}-{index}{suffix}"));

        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("无限序列应始终找到可用路径")
}

fn migrate_one_plate_document(
    backup_dir: &Path,
    source: &Path,
) -> Result<MarkdownMigrationItem, String> {
    let raw = fs::read_to_string(source).map_err(|_| "无法读取旧文档".to_string())?;
    let envelope = serde_json::from_str::<PlateDocumentEnvelope>(&raw)
        .map_err(|_| "旧文档格式损坏".to_string())?;
    validate_plate_envelope(&envelope)?;

    let parent = source
        .parent()
        .ok_or_else(|| "旧文档路径无效".to_string())?;
    let target = unique_path(parent, &sanitize_file_stem(&envelope.title), ".md");
    let markdown = format!(
        "---\ntitle: {}\ncreatedAt: {}\nupdatedAt: {}\nrefinexDialect: 1\n---\n\n{}\n",
        envelope.title,
        envelope.created_at,
        envelope.updated_at,
        plate_value_to_basic_markdown(&envelope.content),
    );

    write_text_atomic(&target, &markdown).map_err(|_| "无法写入 Markdown 文档".to_string())?;

    let backup_path = backup_dir.join(
        source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("legacy.plate.json"),
    );
    fs::rename(source, &backup_path).map_err(|_| "无法备份旧文档".to_string())?;

    Ok(MarkdownMigrationItem {
        source_path: source.to_string_lossy().to_string(),
        target_path: target.to_string_lossy().to_string(),
    })
}

fn plate_value_to_basic_markdown(value: &Value) -> String {
    let Some(nodes) = value.as_array() else {
        return String::new();
    };

    nodes
        .iter()
        .map(plate_node_to_basic_markdown)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn plate_node_to_basic_markdown(node: &Value) -> String {
    let node_type = node.get("type").and_then(Value::as_str).unwrap_or("p");
    let text = plate_node_text(node);

    match node_type {
        "h1" => format!("# {text}"),
        "h2" => format!("## {text}"),
        "h3" => format!("### {text}"),
        "blockquote" => format!("> {text}"),
        _ => text,
    }
}

fn plate_node_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_string();
    }

    node.get("children")
        .and_then(Value::as_array)
        .map(|children| children.iter().map(plate_node_text).collect::<String>())
        .unwrap_or_default()
}

fn read_modified_at(path: &Path) -> Result<u128, String> {
    let metadata = fs::metadata(path).map_err(|_| "无法读取文档信息".to_string())?;
    let modified = metadata
        .modified()
        .map_err(|_| "无法读取文档修改时间".to_string())?;

    Ok(system_time_to_millis(modified))
}

fn read_sort_timestamp(path: &Path) -> std::io::Result<u128> {
    let metadata = fs::metadata(path)?;
    let timestamp = metadata.created().or_else(|_| metadata.modified())?;

    Ok(system_time_to_millis(timestamp))
}

fn read_node_timestamps(path: &Path) -> std::io::Result<(u128, u128)> {
    let metadata = fs::metadata(path)?;
    let created = metadata
        .created()
        .or_else(|_| metadata.modified())
        .map(system_time_to_millis)?;
    let updated = metadata.modified().map(system_time_to_millis)?;

    Ok((created, updated))
}

fn read_markdown_frontmatter(raw: &str) -> Option<&str> {
    let rest = raw.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;

    Some(&rest[..end])
}

fn read_frontmatter_timestamp(frontmatter: &str, key: &str) -> Option<u128> {
    let prefix = format!("{key}:");
    let value = frontmatter
        .lines()
        .find_map(|line| line.trim().strip_prefix(&prefix))
        .map(str::trim)?;
    let unquoted = value.trim_matches('"').trim_matches('\'');
    let parsed = DateTime::parse_from_rfc3339(unquoted).ok()?.to_utc();
    let millis = parsed.timestamp_millis();

    u128::try_from(millis).ok()
}

fn build_directory_node(
    root: &Path,
    path: &Path,
    name: String,
    children: Vec<WorkspaceNode>,
    node_state: &BTreeMap<String, WorkspaceNodeState>,
) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path);
    let state = node_state.get(&relative_path).cloned().unwrap_or_default();
    let (created_at, updated_at) = read_node_timestamps(path)?;

    Ok(WorkspaceNode {
        id: relative_path.clone(),
        name,
        kind: WorkspaceNodeKind::Directory,
        relative_path,
        absolute_path: path.to_string_lossy().to_string(),
        title: None,
        created_at,
        updated_at,
        pinned: state.pinned,
        locked: state.locked,
        children: Some(children),
    })
}

fn build_document_node(
    root: &Path,
    path: &Path,
    name: String,
    node_state: &BTreeMap<String, WorkspaceNodeState>,
) -> std::io::Result<WorkspaceNode> {
    let relative_path = to_relative_path(root, path);
    let state = node_state.get(&relative_path).cloned().unwrap_or_default();
    let markdown_metadata = fs::read_to_string(path)
        .ok()
        .map(|raw| parse_markdown_node_metadata(&raw));
    let (created_at, updated_at) = markdown_metadata
        .as_ref()
        .and_then(
            |metadata| match (metadata.created_at, metadata.updated_at) {
                (Some(created_at), Some(updated_at)) => Some((created_at, updated_at)),
                _ => None,
            },
        )
        .or_else(|| read_node_timestamps(path).ok())
        .unwrap_or((0, 0));
    let title = markdown_metadata
        .and_then(|metadata| metadata.title)
        .unwrap_or_else(|| document_title_from_path(path));

    Ok(WorkspaceNode {
        id: relative_path.clone(),
        name,
        kind: WorkspaceNodeKind::Document,
        relative_path,
        absolute_path: path.to_string_lossy().to_string(),
        title: Some(title),
        created_at,
        updated_at,
        pinned: state.pinned,
        locked: state.locked,
        children: None,
    })
}

fn to_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn parse_markdown_node_metadata(raw: &str) -> MarkdownNodeMetadata {
    let frontmatter = read_markdown_frontmatter(raw);
    let created_at = frontmatter.and_then(|value| read_frontmatter_timestamp(value, "createdAt"));
    let updated_at = frontmatter
        .and_then(|value| read_frontmatter_timestamp(value, "updatedAt"))
        .or(created_at);

    MarkdownNodeMetadata {
        title: parse_markdown_title_from_raw(raw),
        created_at,
        updated_at,
    }
}

fn parse_markdown_title_from_raw(raw: &str) -> Option<String> {
    if let Some(title) = read_frontmatter_title(&raw) {
        return Some(title);
    }

    raw.lines()
        .take(120)
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("# ")
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .map(ToString::to_string)
}

fn document_title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("未命名文档")
        .to_string()
}

fn start_performance_timer() -> Option<Instant> {
    performance_logging_enabled().then(Instant::now)
}

fn finish_performance_timer(label: &str, started_at: Option<Instant>, details: &str) {
    let Some(started_at) = started_at else {
        return;
    };

    let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;

    if details.is_empty() {
        log::debug!("[madora:perf] {label} {elapsed_ms:.1}ms");
    } else {
        log::debug!("[madora:perf] {label} {elapsed_ms:.1}ms {details}");
    }
}

impl SaveMarkdownPerformanceDetails {
    fn to_log_details(&self) -> String {
        let mut parts = vec![format!("bytes={}", self.bytes)];

        push_optional_elapsed(&mut parts, "oldAssetReadMs", self.old_asset_read_ms);
        push_optional_elapsed(&mut parts, "writeMs", self.write_ms);
        push_optional_elapsed(&mut parts, "assetCleanupMs", self.asset_cleanup_ms);
        push_optional_elapsed(&mut parts, "dailyNoteIndexMs", self.daily_note_index_ms);

        if self.error {
            parts.push("error=true".to_string());
        }

        parts.join(" ")
    }
}

fn push_optional_elapsed(parts: &mut Vec<String>, label: &str, elapsed_ms: Option<f64>) {
    if let Some(elapsed_ms) = elapsed_ms {
        parts.push(format!("{label}={elapsed_ms:.1}"));
    }
}

fn finish_performance_segment(started_at: Instant, enabled: bool) -> Option<f64> {
    enabled.then(|| started_at.elapsed().as_secs_f64() * 1000.0)
}

fn performance_logging_enabled() -> bool {
    performance_logging_enabled_from_value(env::var(PERFORMANCE_LOG_ENV).ok().as_deref())
}

fn performance_logging_enabled_from_value(value: Option<&str>) -> bool {
    value
        .map(str::trim)
        .map(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn count_workspace_nodes(nodes: &[WorkspaceNode]) -> usize {
    nodes
        .iter()
        .map(|node| {
            1 + node
                .children
                .as_deref()
                .map(count_workspace_nodes)
                .unwrap_or(0)
        })
        .sum()
}

fn read_frontmatter_title(raw: &str) -> Option<String> {
    let mut lines = raw.lines();
    if lines.next()? != "---" {
        return None;
    }

    for line in lines {
        if line == "---" {
            return None;
        }

        if let Some(value) = line.strip_prefix("title:") {
            let title = value.trim().trim_matches('"').trim_matches('\'').trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }

    None
}

fn update_markdown_document_title(path: &Path, title: &str) -> io::Result<()> {
    let raw = fs::read_to_string(path)?;
    let with_frontmatter = upsert_markdown_frontmatter_title(&raw, title);
    let updated = replace_first_h1(&with_frontmatter, title);

    write_text_atomic(path, &updated)
}

fn replace_first_h1(raw: &str, new_title: &str) -> String {
    let mut found = false;
    let result: Vec<String> = raw
        .split('\n')
        .map(|line| {
            if !found && line.trim_start().starts_with("# ") && line.trim().len() > 2 {
                found = true;
                let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
                format!("{indent}# {new_title}")
            } else {
                line.to_string()
            }
        })
        .collect();

    if found {
        result.join("\n")
    } else {
        insert_h1_at_body_start(raw, new_title)
    }
}

fn insert_h1_at_body_start(raw: &str, title: &str) -> String {
    let h1_line = format!("# {title}");

    if let Some(end) = raw.find("\n---") {
        if raw.starts_with("---\n") {
            let after_frontmatter = end + 4;
            let body_start = raw[after_frontmatter..]
                .find(|c: char| c != '\n' && c != '\r')
                .map(|i| after_frontmatter + i)
                .unwrap_or(raw.len());
            let body = raw[body_start..].trim_start();
            if body.is_empty() {
                format!("{}\n{h1_line}\n", &raw[..body_start])
            } else {
                format!("{}\n\n{h1_line}\n\n{body}", &raw[..body_start])
            }
        } else {
            format!("{h1_line}\n\n{raw}")
        }
    } else {
        format!("{h1_line}\n\n{raw}")
    }
}

fn upsert_markdown_frontmatter_title(raw: &str, title: &str) -> String {
    if !raw.starts_with("---\n") {
        return format!(
            "---\ntitle: {title}\nrefinexDialect: 1\n---\n\n{}",
            raw.trim_start()
        );
    }

    let Some(end_index) = raw[4..].find("\n---") else {
        return format!(
            "---\ntitle: {title}\nrefinexDialect: 1\n---\n\n{}",
            raw.trim_start()
        );
    };
    let end_index = end_index + 4;
    let frontmatter = &raw[4..end_index];
    let body = &raw[end_index + 4..];
    let mut title_replaced = false;
    let mut lines = Vec::new();

    for line in frontmatter.lines() {
        if line.trim_start().starts_with("title:") {
            lines.push(format!("title: {title}"));
            title_replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !title_replaced {
        lines.insert(0, format!("title: {title}"));
    }

    format!("---\n{}\n---{}", lines.join("\n"), body)
}

fn collect_plate_document_paths(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if should_skip_entry(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_plate_document_paths(&path, paths)?;
        } else if is_plate_document_file(&path) {
            paths.push(path);
        }
    }

    Ok(())
}

fn collect_markdown_document_paths(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if should_skip_entry(file_name) {
            continue;
        }

        if path.is_dir() {
            collect_markdown_document_paths(&path, paths)?;
        } else if is_markdown_document_file(&path) {
            paths.push(path);
        }
    }

    Ok(())
}

fn collect_asset_ids_from_markdown_paths(paths: &[PathBuf]) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();

    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            ids.extend(crate::assets::extract_asset_ids_from_markdown(&raw));
        }
    }

    ids
}

fn unix_timestamp_millis() -> u128 {
    system_time_to_millis(SystemTime::now())
}

fn system_time_to_millis(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn current_iso_timestamp() -> String {
    system_time_to_iso_timestamp(SystemTime::now())
}

fn system_time_to_iso_timestamp(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();

    datetime.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn normalize_plate_envelope_timestamps(envelope: &mut PlateDocumentEnvelope) {
    if let Some(created_at) = normalize_plate_timestamp(&envelope.created_at) {
        envelope.created_at = created_at;
    }

    if let Some(updated_at) = normalize_plate_timestamp(&envelope.updated_at) {
        envelope.updated_at = updated_at;
    }
}

fn normalize_plate_timestamp(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return None;
    }

    if let Ok(parsed) = DateTime::parse_from_rfc3339(trimmed) {
        return Some(
            parsed
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Millis, true),
        );
    }

    let millis_text = trimmed.strip_suffix('Z').unwrap_or(trimmed);

    if millis_text.chars().all(|value| value.is_ascii_digit()) {
        let millis = millis_text.parse::<i64>().ok()?;
        let datetime = Utc.timestamp_millis_opt(millis).single()?;

        return Some(datetime.to_rfc3339_opts(SecondsFormat::Millis, true));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn ensure_workspace_creates_metadata_file() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
            .expect("初始化工作区失败");

        assert_eq!(metadata.schema_version, 1);
        assert_eq!(metadata.recent_document_path, None);
        assert!(temp_dir.path().join(".madora/workspace.json").is_file());
    }

    #[test]
    fn ensure_workspace_adds_default_git_sync_settings() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
            .expect("初始化工作区失败");

        assert_eq!(metadata.git_sync.enabled, true);
        assert_eq!(metadata.git_sync.interval_minutes, 10);
        assert_eq!(metadata.git_sync.conflict_resolution, "abort");
        assert_eq!(metadata.git_sync.last_synced_at, None);
    }

    #[test]
    fn saves_workspace_git_sync_settings() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let settings = save_workspace_git_sync_settings(
            temp_dir.path().to_string_lossy().to_string(),
            WorkspaceGitSyncSettings {
                enabled: true,
                interval_minutes: 15,
                conflict_resolution: "local".to_string(),
                last_synced_at: Some("2026-06-21T15:30:00.000Z".to_string()),
            },
        )
        .expect("保存 Git Sync 设置失败");

        assert_eq!(settings.interval_minutes, 15);
        assert_eq!(settings.conflict_resolution, "local");

        let raw = fs::read_to_string(temp_dir.path().join(".madora/workspace.json"))
            .expect("读取 workspace.json 失败");
        let metadata: WorkspaceMetadata =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");

        assert_eq!(metadata.git_sync, settings);
    }

    #[test]
    fn rejects_unsupported_workspace_git_sync_interval() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let error = save_workspace_git_sync_settings(
            temp_dir.path().to_string_lossy().to_string(),
            WorkspaceGitSyncSettings {
                enabled: true,
                interval_minutes: 7,
                conflict_resolution: "abort".to_string(),
                last_synced_at: None,
            },
        )
        .unwrap_err();

        assert!(error.contains("同步频率"));
    }

    #[test]
    fn default_workspace_metadata_includes_empty_daily_notes() {
        let metadata = default_workspace_metadata();

        assert_eq!(metadata.daily_notes.selected_date, None);
        assert!(metadata.daily_notes.entries.is_empty());
        assert!(metadata.node_state.is_empty());
    }

    #[test]
    fn rejects_invalid_daily_note_date() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let error = open_daily_note(
            temp_dir.path().to_string_lossy().to_string(),
            "2026-6-2".to_string(),
        )
        .expect_err("非法日期应该失败");

        assert!(error.contains("日期格式无效"));
    }

    #[test]
    fn open_daily_note_creates_markdown_file_and_metadata_entry() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path().to_string_lossy().to_string();

        let opened =
            open_daily_note(root.clone(), "2026-06-20".to_string()).expect("打开每日笔记失败");

        assert_eq!(opened.node.relative_path, "Daily/2026/06/2026-06-20.md");
        assert!(opened.content.content.contains("dailyDate: 2026-06-20"));
        assert!(temp_dir
            .path()
            .join("Daily/2026/06/2026-06-20.md")
            .is_file());

        let raw = fs::read_to_string(temp_dir.path().join(".madora/workspace.json"))
            .expect("读取 workspace.json 失败");
        let metadata: WorkspaceMetadata =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");
        assert_eq!(
            metadata.daily_notes.selected_date.as_deref(),
            Some("2026-06-20")
        );
        assert!(metadata.daily_notes.entries.contains_key("2026-06-20"));
        assert!(!metadata.daily_notes.entries["2026-06-20"].has_content);
    }

    #[test]
    fn open_daily_note_preserves_existing_content() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root_path = temp_dir.path();
        let note_dir = root_path.join("Daily/2026/06");
        fs::create_dir_all(&note_dir).expect("创建每日笔记目录失败");
        fs::write(note_dir.join("2026-06-20.md"), "# 2026-06-20\n\n真实内容\n")
            .expect("写入每日笔记失败");

        let opened = open_daily_note(
            root_path.to_string_lossy().to_string(),
            "2026-06-20".to_string(),
        )
        .expect("打开已有每日笔记失败");

        assert!(opened.content.content.contains("真实内容"));
        assert!(opened.content.content.contains("# 2026-06-20"));
    }

    #[test]
    fn list_daily_notes_for_month_reports_only_real_content_markers() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path().to_string_lossy().to_string();
        let document_path = temp_dir
            .path()
            .join("Daily/2026/06/2026-06-20.md")
            .to_string_lossy()
            .to_string();

        open_daily_note(root.clone(), "2026-06-20".to_string()).expect("打开空每日笔记失败");
        save_markdown_document(
            root.clone(),
            document_path,
            "---\ntitle: 2026-06-20\nrefinexDialect: 1\ndailyDate: 2026-06-20\n---\n\n# 2026-06-20\n\n- [ ] 写计划\n"
                .to_string(),
            None,
        )
        .expect("保存每日笔记失败");

        let month =
            list_daily_notes_for_month(root, "2026-06".to_string()).expect("读取月索引失败");

        assert_eq!(month.month, "2026-06");
        assert_eq!(month.entries.len(), 1);
        assert_eq!(month.entries[0].date, "2026-06-20");
        assert!(month.entries[0].has_content);
    }

    #[test]
    fn daily_note_with_crlf_frontmatter_and_only_heading_has_no_content_marker() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root_path = temp_dir.path();
        let note_dir = root_path.join("Daily/2026/06");
        fs::create_dir_all(&note_dir).expect("创建每日笔记目录失败");
        fs::write(
            note_dir.join("2026-06-23.md"),
            "---\r\ntitle: 2026-06-23\r\nrefinexDialect: 1\r\ndailyDate: 2026-06-23\r\n---\r\n\r\n# 2026-06-23\r\n",
        )
        .expect("写入每日笔记失败");

        let month = list_daily_notes_for_month(
            root_path.to_string_lossy().to_string(),
            "2026-06".to_string(),
        )
        .expect("读取月索引失败");

        assert_eq!(month.entries.len(), 1);
        assert_eq!(month.entries[0].date, "2026-06-23");
        assert!(!month.entries[0].has_content);
    }

    #[test]
    fn daily_note_with_crlf_frontmatter_and_body_has_content_marker() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root_path = temp_dir.path();
        let note_dir = root_path.join("Daily/2026/06");
        fs::create_dir_all(&note_dir).expect("创建每日笔记目录失败");
        fs::write(
            note_dir.join("2026-06-24.md"),
            "---\r\ntitle: 2026-06-24\r\nrefinexDialect: 1\r\ndailyDate: 2026-06-24\r\n---\r\n\r\n# 2026-06-24\r\n\r\n真实内容\r\n",
        )
        .expect("写入每日笔记失败");

        let month = list_daily_notes_for_month(
            root_path.to_string_lossy().to_string(),
            "2026-06".to_string(),
        )
        .expect("读取月索引失败");

        assert_eq!(month.entries.len(), 1);
        assert_eq!(month.entries[0].date, "2026-06-24");
        assert!(month.entries[0].has_content);
    }

    #[test]
    fn record_recent_document_creates_list_for_new_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let doc = root.join("note.md");
        fs::write(&doc, "# Note\n").expect("写入文档失败");
        let canonical_doc = doc.canonicalize().unwrap().to_string_lossy().to_string();

        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            doc.to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths, vec![canonical_doc.clone()]);

        let raw = fs::read_to_string(root.join(".madora/workspace.json"))
            .expect("读取 workspace.json 失败");
        let value: serde_json::Value =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");

        assert_eq!(
            value["recentDocumentPaths"],
            serde_json::json!([canonical_doc])
        );
        assert!(value.get("recentDocumentPath").is_none());
    }

    #[test]
    fn record_recent_document_promotes_existing_and_truncates_to_five() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let docs: Vec<PathBuf> = (1..=6)
            .map(|index| root.join(format!("doc-{index}.md")))
            .collect();
        for doc in &docs {
            fs::write(
                doc,
                format!("# Doc {}\n", doc.file_name().unwrap().to_string_lossy()),
            )
            .expect("写入文档失败");
        }
        let canonical: Vec<String> = docs
            .iter()
            .map(|doc| doc.canonicalize().unwrap().to_string_lossy().to_string())
            .collect();

        // 先按 1..5 顺序记录，doc-5 最后（最新在前语义下 doc-5 在头部）
        for doc in &docs[0..5] {
            record_recent_document(
                root.to_string_lossy().to_string(),
                doc.to_string_lossy().to_string(),
            )
            .expect("记录最近文档失败");
        }

        // 再次记录 doc-1：应被置顶、去重，长度仍为 5
        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            docs[0].to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths.len(), 5);
        assert_eq!(paths[0], canonical[0]);
        assert_eq!(paths.iter().filter(|p| *p == &canonical[0]).count(), 1);

        // 记录第 6 个不同文档：截断为 5，最旧的 doc-2 被淘汰
        // 推演：初始 [5,4,3,2,1] → 记 doc-1 后 [1,5,4,3,2] → 记 doc-6 后 [6,1,5,4,3]
        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            docs[5].to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths.len(), 5);
        assert_eq!(paths[0], canonical[5]);
        assert!(!paths.contains(&canonical[1]));
    }

    #[test]
    fn ensure_workspace_ignores_refinex_metadata_directory() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let refinex_metadata_dir = root.join(".refinex");
        fs::create_dir(&refinex_metadata_dir).expect("创建旧元数据目录失败");
        fs::write(
            refinex_metadata_dir.join("workspace.json"),
            r#"{
  "schemaVersion": 1,
  "recentDocumentPath": "/repo/legacy.md",
  "expandedPaths": [],
  "sortOrder": {}
}"#,
        )
        .expect("写入旧元数据失败");

        let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
            .expect("读取工作区元数据失败");

        assert!(metadata.recent_document_paths.is_empty());
        assert_eq!(metadata.recent_document_path, None);
        assert!(root.join(".madora/workspace.json").is_file());
        assert!(refinex_metadata_dir.exists());
    }

    #[test]
    fn record_recent_document_rebuilds_corrupt_metadata() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let metadata_dir = root.join(".madora");
        fs::create_dir(&metadata_dir).expect("创建元数据目录失败");
        fs::write(metadata_dir.join("workspace.json"), "{ broken").expect("写入损坏元数据失败");
        let doc = root.join("note.md");
        fs::write(&doc, "# Note\n").expect("写入文档失败");
        let canonical_doc = doc.canonicalize().unwrap().to_string_lossy().to_string();

        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            doc.to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths, vec![canonical_doc]);
    }

    #[test]
    fn corrupt_workspace_metadata_is_backed_up_and_rebuilt() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let metadata_dir = temp_dir.path().join(".madora");
        fs::create_dir(&metadata_dir).expect("创建元数据目录失败");
        fs::write(metadata_dir.join("workspace.json"), "{ broken").expect("写入损坏元数据失败");

        let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
            .expect("重建工作区元数据失败");
        let backup_count = fs::read_dir(&metadata_dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("workspace.corrupt.")
            })
            .count();

        assert_eq!(metadata.schema_version, 1);
        assert_eq!(backup_count, 1);
    }

    #[test]
    fn creates_new_workspace_root_under_parent_directory() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let snapshot = create_workspace_root(
            temp_dir.path().to_string_lossy().to_string(),
            "知识库".to_string(),
        )
        .expect("创建新工作区失败");

        assert_eq!(snapshot.root_name, "知识库");
        assert!(temp_dir
            .path()
            .join("知识库/.madora/workspace.json")
            .is_file());
    }

    #[test]
    fn rejects_non_empty_existing_workspace_target() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let target = temp_dir.path().join("知识库");
        fs::create_dir(&target).expect("创建已有目录失败");
        fs::write(target.join("note.txt"), "content").expect("写入已有文件失败");

        let error = create_workspace_root(
            temp_dir.path().to_string_lossy().to_string(),
            "知识库".to_string(),
        )
        .expect_err("非空目录不应被当作新工作区初始化");

        assert_eq!(error, "目标工作区目录已存在且不为空");
    }

    #[test]
    fn builds_markdown_snapshot_with_document_titles() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let guide_dir = temp_dir.path().join("Guides");
        fs::create_dir(&guide_dir).expect("创建测试目录失败");
        fs::write(temp_dir.path().join("README.md"), "# 项目说明\n").unwrap();
        fs::write(guide_dir.join("intro.md"), "# 入门指南").unwrap();
        fs::write(guide_dir.join("draft.mdx"), "# 草稿").unwrap();
        fs::write(guide_dir.join("data.json"), "{}").unwrap();
        fs::write(
            guide_dir.join("legacy.plate.json"),
            r#"{"schemaVersion":1,"title":"项目说明","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .unwrap();

        let snapshot = build_workspace_snapshot(temp_dir.path()).unwrap();
        let debug = format!("{snapshot:?}");

        assert!(debug.contains("README.md"));
        assert!(debug.contains("intro.md"));
        assert!(debug.contains("draft.mdx"));
        assert!(debug.contains("项目说明"));
        assert!(debug.contains("入门指南"));
        assert!(debug.contains("草稿"));
        assert!(!debug.contains("legacy.plate.json"));
        assert!(!debug.contains("data.json"));
    }

    #[test]
    fn parses_markdown_node_metadata_from_one_raw_document() {
        let raw = "---\ntitle: 性能审计\ncreatedAt: 2026-06-01T00:00:00.000Z\nupdatedAt: 2026-06-02T11:30:00.000Z\nrefinexDialect: 1\n---\n\n# 正文标题\n\n内容\n";

        let metadata = parse_markdown_node_metadata(raw);

        assert_eq!(metadata.title.as_deref(), Some("性能审计"));
        assert!(metadata.created_at.is_some());
        assert!(metadata.updated_at.is_some());
        assert!(metadata.updated_at > metadata.created_at);
    }

    #[test]
    fn performance_logging_flag_accepts_explicit_truthy_values() {
        assert!(performance_logging_enabled_from_value(Some("1")));
        assert!(performance_logging_enabled_from_value(Some("true")));
        assert!(performance_logging_enabled_from_value(Some("TRUE")));
        assert!(!performance_logging_enabled_from_value(None));
        assert!(!performance_logging_enabled_from_value(Some("0")));
    }

    #[test]
    fn formats_save_markdown_performance_segments() {
        let details = SaveMarkdownPerformanceDetails {
            asset_cleanup_ms: Some(3.44),
            bytes: 128,
            daily_note_index_ms: Some(4.55),
            error: false,
            old_asset_read_ms: Some(1.22),
            write_ms: Some(2.33),
        };

        assert_eq!(
            details.to_log_details(),
            "bytes=128 oldAssetReadMs=1.2 writeMs=2.3 assetCleanupMs=3.4 dailyNoteIndexMs=4.5"
        );
    }

    #[test]
    fn workspace_tree_uses_markdown_documents_as_visible_documents() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::write(temp_dir.path().join("README.md"), "# 项目说明\n").expect("写入 Markdown 失败");
        fs::write(temp_dir.path().join("legacy.plate.json"), "{}").expect("写入旧文档失败");
        fs::write(temp_dir.path().join("notes.txt"), "text").expect("写入文本失败");

        let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");

        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.nodes[0].name, "README.md");
        assert_eq!(snapshot.nodes[0].kind, WorkspaceNodeKind::Document);
        assert_eq!(snapshot.nodes[0].title.as_deref(), Some("项目说明"));
    }

    #[test]
    fn set_workspace_node_state_persists_snapshot_flags_and_clears_empty_state() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let document_path = temp_dir.path().join("README.md");

        fs::write(&document_path, "# 项目说明\n").expect("写入 Markdown 失败");
        ensure_workspace(temp_dir.path().to_string_lossy().to_string()).expect("初始化工作区失败");

        let snapshot = set_workspace_node_state(
            temp_dir.path().to_string_lossy().to_string(),
            document_path.to_string_lossy().to_string(),
            Some(true),
            Some(true),
        )
        .expect("写入节点状态失败");

        assert_eq!(snapshot.nodes[0].relative_path, "README.md");
        assert!(snapshot.nodes[0].pinned);
        assert!(snapshot.nodes[0].locked);

        let raw = fs::read_to_string(temp_dir.path().join(".madora/workspace.json"))
            .expect("读取 workspace.json 失败");
        let metadata: WorkspaceMetadata =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");
        assert_eq!(
            metadata.node_state.get("README.md"),
            Some(&WorkspaceNodeState {
                pinned: true,
                locked: true,
            }),
        );

        set_workspace_node_state(
            temp_dir.path().to_string_lossy().to_string(),
            document_path.to_string_lossy().to_string(),
            Some(false),
            Some(false),
        )
        .expect("清理节点状态失败");

        let raw = fs::read_to_string(temp_dir.path().join(".madora/workspace.json"))
            .expect("读取 workspace.json 失败");
        let metadata: WorkspaceMetadata =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");
        assert!(metadata.node_state.is_empty());
    }

    #[test]
    fn reads_markdown_document_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let document_path = temp_dir.path().join("guide.md");
        fs::write(&document_path, "---\ntitle: 指南\n---\n\n# 指南\n").expect("写入 Markdown 失败");

        let document = read_markdown_document(
            temp_dir.path().to_string_lossy().to_string(),
            document_path.to_string_lossy().to_string(),
        )
        .expect("读取 Markdown 文档失败");

        assert_eq!(
            document.path,
            document_path.canonicalize().unwrap().to_string_lossy()
        );
        assert!(document.content.contains("title: 指南"));
        assert!(document.modified_at > 0);
    }

    #[test]
    fn saves_markdown_document_with_modified_at_guard() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let document_path = temp_dir.path().join("guide.md");
        fs::write(&document_path, "# 旧内容\n").expect("写入 Markdown 失败");
        let before = read_modified_at(&document_path).expect("读取修改时间失败");

        let saved = save_markdown_document(
            temp_dir.path().to_string_lossy().to_string(),
            document_path.to_string_lossy().to_string(),
            "# 新内容\n".to_string(),
            Some(before),
        )
        .expect("保存 Markdown 文档失败");

        assert!(saved.modified_at >= before);
        assert_eq!(fs::read_to_string(&document_path).unwrap(), "# 新内容\n");
    }

    #[test]
    fn refuses_to_overwrite_markdown_document_changed_on_disk() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let document_path = temp_dir.path().join("guide.md");
        fs::write(&document_path, "# 旧内容\n").expect("写入 Markdown 失败");
        let stale_modified_at = read_modified_at(&document_path).expect("读取修改时间失败");
        std::thread::sleep(std::time::Duration::from_millis(2));
        fs::write(&document_path, "# 外部修改\n").expect("写入外部修改失败");

        let error = save_markdown_document(
            temp_dir.path().to_string_lossy().to_string(),
            document_path.to_string_lossy().to_string(),
            "# 应被拒绝\n".to_string(),
            Some(stale_modified_at),
        )
        .expect_err("应拒绝覆盖磁盘更新");

        assert!(error.contains("文档已在磁盘上更新"));
        assert_eq!(fs::read_to_string(&document_path).unwrap(), "# 外部修改\n");
    }

    #[test]
    fn migrates_plate_json_documents_to_markdown_files() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let plate_path = temp_dir.path().join("Guide.plate.json");
        fs::write(
            &plate_path,
            r#"{
  "schemaVersion": 1,
  "title": "Guide",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "updatedAt": "2026-06-05T00:00:00.000Z",
  "content": [{"type":"h1","children":[{"text":"Guide"}]}]
}"#,
        )
        .expect("写入旧文档失败");

        let report =
            migrate_plate_documents_to_markdown(temp_dir.path().to_string_lossy().to_string())
                .expect("迁移失败");

        assert_eq!(report.migrated.len(), 1);
        assert!(report.failed.is_empty());
        assert!(temp_dir.path().join("Guide.md").is_file());
        assert!(temp_dir
            .path()
            .join(".madora/migrations/backup/Guide.plate.json")
            .is_file());
        assert!(fs::read_to_string(temp_dir.path().join("Guide.md"))
            .expect("读取迁移后 Markdown 失败")
            .contains("# Guide"));
    }

    #[test]
    fn orders_new_nodes_after_existing_siblings() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("ZFolder")).expect("创建已有目录失败");
        fs::write(temp_dir.path().join("A.md"), "# A\n").expect("写入已有文档失败");
        std::thread::sleep(std::time::Duration::from_millis(20));

        create_workspace_directory(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "未命名目录".to_string(),
        )
        .expect("创建新目录失败");
        std::thread::sleep(std::time::Duration::from_millis(20));
        create_markdown_document(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "未命名文档".to_string(),
        )
        .expect("创建新文档失败");

        let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");
        let relative_paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(relative_paths.len(), 4);
        assert_eq!(relative_paths[2], "未命名目录");
        assert_eq!(relative_paths[3], "未命名文档.md");
    }

    #[test]
    fn reads_valid_plate_document_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.plate.json");
        fs::write(
            &doc_path,
            r#"{"schemaVersion":1,"title":"指南","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":"正文"}]}]}"#,
        )
        .unwrap();

        let document = read_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .expect("读取原生文档失败");

        assert_eq!(document.envelope.title, "指南");
        assert!(document.envelope.content.is_array());
    }

    #[test]
    fn read_plate_document_normalizes_legacy_millis_timestamps() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.plate.json");
        fs::write(
            &doc_path,
            r#"{"schemaVersion":1,"title":"指南","createdAt":"1780163209231Z","updatedAt":"1780163209231Z","content":[{"type":"p","children":[{"text":"正文"}]}]}"#,
        )
        .unwrap();

        let document = read_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .expect("读取原生文档失败");

        assert_eq!(document.envelope.created_at, "2026-05-30T17:46:49.231Z");
        assert_eq!(document.envelope.updated_at, "2026-05-30T17:46:49.231Z");
    }

    #[test]
    fn current_iso_timestamp_uses_utc_rfc3339_millis() {
        let timestamp =
            system_time_to_iso_timestamp(UNIX_EPOCH + std::time::Duration::from_millis(123));

        assert_eq!(timestamp, "1970-01-01T00:00:00.123Z");
    }

    #[test]
    fn rejects_invalid_plate_document_envelope() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("broken.plate.json");
        fs::write(
            &doc_path,
            r#"{"schemaVersion":1,"title":"坏文档","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":{}}"#,
        )
        .unwrap();

        let error = read_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
        )
        .expect_err("损坏文档不应读取成功");

        assert_eq!(error, "文档内容格式无效");
    }

    #[test]
    fn saves_valid_plate_document_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.plate.json");
        let envelope = sample_envelope("指南", "正文");

        let meta = save_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
            envelope,
        )
        .expect("保存原生文档失败");

        assert_eq!(
            meta.path,
            doc_path.canonicalize().unwrap().to_string_lossy()
        );
        assert!(fs::read_to_string(&doc_path)
            .unwrap()
            .contains("\"title\": \"指南\""));
    }

    #[test]
    fn saving_document_removes_unreferenced_local_asset() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let uploaded = crate::assets::upload_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            crate::assets::UploadWorkspaceAssetInput {
                file_name: "cover.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: base64::engine::general_purpose::STANDARD.encode(b"asset"),
            },
        )
        .expect("上传资产失败");
        let doc_path = temp_dir.path().join("guide.plate.json");
        let old = PlateDocumentEnvelope {
            schema_version: 1,
            title: "Guide".to_string(),
            created_at: "2026-05-31T00:00:00.000Z".to_string(),
            updated_at: "2026-05-31T00:00:00.000Z".to_string(),
            content: serde_json::json!([
                {
                    "type": "img",
                    "url": uploaded.url,
                    "children": [{ "text": "" }]
                }
            ]),
        };
        write_json_pretty(&doc_path, &old).expect("写入旧文档失败");
        let asset_path = PathBuf::from(uploaded.absolute_path);

        save_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
            PlateDocumentEnvelope {
                content: serde_json::json!([
                    {
                        "type": "p",
                        "children": [{ "text": "no asset" }]
                    }
                ]),
                updated_at: "2026-05-31T00:00:01.000Z".to_string(),
                ..old
            },
        )
        .expect("保存文档失败");

        assert!(!asset_path.exists());
    }

    #[test]
    fn deleting_one_of_two_documents_keeps_shared_asset() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let uploaded = crate::assets::upload_workspace_asset(
            temp_dir.path().to_string_lossy().to_string(),
            crate::assets::UploadWorkspaceAssetInput {
                file_name: "cover.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: base64::engine::general_purpose::STANDARD.encode(b"shared"),
            },
        )
        .expect("上传资产失败");
        let asset_path = PathBuf::from(uploaded.absolute_path.clone());

        for name in ["a.md", "b.md"] {
            fs::write(
                temp_dir.path().join(name),
                format!("# {name}\n\n![cover]({})\n", uploaded.url),
            )
            .expect("写入文档失败");
        }

        delete_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("a.md").to_string_lossy().to_string(),
        )
        .expect("删除文档失败");

        assert!(asset_path.exists());
    }

    #[test]
    fn creates_unique_plate_document() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::write(temp_dir.path().join("未命名文档.plate.json"), "{}").unwrap();

        let created = create_plate_document(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "未命名文档".to_string(),
        )
        .expect("创建文档失败");

        assert!(created.node.name.ends_with("-1.plate.json"));
        assert_eq!(created.envelope.title, "未命名文档");
    }

    #[test]
    fn creates_workspace_directory_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let node = create_workspace_directory(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            "docs".to_string(),
        )
        .expect("创建目录失败");

        assert_eq!(node.kind, WorkspaceNodeKind::Directory);
        assert_eq!(node.relative_path, "docs");
        assert!(temp_dir.path().join("docs").is_dir());
    }

    #[test]
    fn reads_markdown_source_files_without_modifying_sources() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let markdown_path = temp_dir.path().join("source.md");
        fs::write(&markdown_path, "# 标题\n正文").unwrap();

        let files = read_markdown_source_files(vec![markdown_path.to_string_lossy().to_string()])
            .expect("读取 Markdown 源文件失败");

        assert_eq!(files[0].file_name, "source.md");
        assert_eq!(files[0].content, "# 标题\n正文");
        assert_eq!(fs::read_to_string(&markdown_path).unwrap(), "# 标题\n正文");
    }

    #[test]
    fn reads_import_source_files_by_format() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let html_path = temp_dir.path().join("source.html");
        let docx_path = temp_dir.path().join("source.docx");
        fs::write(&html_path, "<h1>标题</h1>").unwrap();
        fs::write(&docx_path, [1_u8, 2, 3]).unwrap();

        let html_files = read_import_source_files(
            vec![html_path.to_string_lossy().to_string()],
            ImportSourceFormat::Html,
        )
        .expect("读取 HTML 源文件失败");
        let word_files = read_import_source_files(
            vec![docx_path.to_string_lossy().to_string()],
            ImportSourceFormat::Word,
        )
        .expect("读取 Word 源文件失败");

        assert_eq!(html_files[0].file_name, "source.html");
        assert_eq!(html_files[0].content.as_deref(), Some("<h1>标题</h1>"));
        assert_eq!(html_files[0].base64_data, None);
        assert_eq!(word_files[0].file_name, "source.docx");
        assert_eq!(word_files[0].content, None);
        assert_eq!(word_files[0].base64_data.as_deref(), Some("AQID"));
    }

    #[test]
    fn writes_export_file() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let export_path = temp_dir.path().join("导出.md");

        write_export_file(
            export_path.to_string_lossy().to_string(),
            "5Lit5paH".to_string(),
        )
        .expect("写入导出文件失败");

        assert_eq!(fs::read_to_string(export_path).unwrap(), "中文");
    }

    #[test]
    fn imported_plate_documents_write_inside_workspace_only() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let docs = vec![ImportedPlateDocumentInput {
            title: "Spring AI".to_string(),
            source_file_name: "Spring AI.md".to_string(),
            content: serde_json::json!([{ "type": "p", "children": [{ "text": "正文" }] }]),
        }];

        let result = create_imported_plate_documents(
            temp_dir.path().to_string_lossy().to_string(),
            "".to_string(),
            docs,
        )
        .expect("导入文档失败");

        assert_eq!(result.created.len(), 1);
        assert!(temp_dir.path().join("Spring AI.plate.json").is_file());
    }

    #[test]
    fn renames_markdown_document_and_updates_title() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("old.md");
        fs::write(
            &doc_path,
            "---\ntitle: 旧标题\nrefinexDialect: 1\n---\n\n# 旧标题\n",
        )
        .unwrap();

        let node = rename_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            doc_path.to_string_lossy().to_string(),
            "新标题".to_string(),
        )
        .expect("重命名文档失败");

        assert_eq!(node.title.as_deref(), Some("新标题"));
        assert!(temp_dir.path().join("新标题.md").is_file());
        assert!(!doc_path.exists());
        assert!(fs::read_to_string(temp_dir.path().join("新标题.md"))
            .unwrap()
            .contains("title: 新标题"));
    }

    #[test]
    fn renames_workspace_directory_without_overwriting_existing_path() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).expect("创建目录失败");
        fs::create_dir(temp_dir.path().join("existing")).expect("创建已有目录失败");

        let error = rename_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            docs_path.to_string_lossy().to_string(),
            "existing".to_string(),
        )
        .expect_err("重名目录不应覆盖已有目录");

        assert_eq!(error, "目标名称已存在");
        assert!(docs_path.is_dir());
    }

    #[test]
    fn deletes_workspace_directory_recursively_inside_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).expect("创建目录失败");
        fs::write(docs_path.join("guide.plate.json"), "{}").expect("写入文档失败");

        delete_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            docs_path.to_string_lossy().to_string(),
        )
        .expect("删除目录失败");

        assert!(!docs_path.exists());
    }

    #[test]
    fn load_snapshot_uses_manual_sort_order_before_creation_time() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::write(temp_dir.path().join("A.md"), "# A\n").expect("写入 A 文档失败");
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(temp_dir.path().join("B.md"), "# B\n").expect("写入 B 文档失败");
        fs::create_dir_all(temp_dir.path().join(".madora")).expect("创建元数据目录失败");
        fs::write(
            temp_dir.path().join(".madora/workspace.json"),
            r#"{
  "schemaVersion": 1,
  "recentDocumentPath": null,
  "expandedPaths": [],
  "sortOrder": {
    "version": 1,
    "nodes": {
      "A.md": { "parentPath": "", "rank": 2048 },
      "B.md": { "parentPath": "", "rank": 1024 }
    }
  }
}"#,
        )
        .expect("写入排序元数据失败");

        let snapshot = build_workspace_snapshot(temp_dir.path()).expect("读取工作区失败");
        let paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["B.md", "A.md"]);
    }

    #[test]
    fn sparse_rank_rebalances_only_target_parent_when_gap_is_exhausted() {
        let mut sort_order = WorkspaceSortOrder::default();
        sort_order.nodes.insert(
            "docs/a.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "docs".to_string(),
                rank: 1024,
            },
        );
        sort_order.nodes.insert(
            "docs/b.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "docs".to_string(),
                rank: 1025,
            },
        );
        sort_order.nodes.insert(
            "other/c.plate.json".to_string(),
            WorkspaceSortRecord {
                parent_path: "other".to_string(),
                rank: 1024,
            },
        );

        let rank = assign_rank_with_rebalance(
            &mut sort_order,
            "docs/moved.plate.json",
            "docs",
            Some("docs/a.plate.json"),
            Some("docs/b.plate.json"),
        );

        assert_eq!(rank, 2048);
        assert_eq!(sort_order.nodes["docs/a.plate.json"].rank, 1024);
        assert_eq!(sort_order.nodes["docs/moved.plate.json"].rank, 2048);
        assert_eq!(sort_order.nodes["docs/b.plate.json"].rank, 3072);
        assert_eq!(sort_order.nodes["other/c.plate.json"].rank, 1024);
    }

    #[test]
    fn moves_document_into_directory_and_returns_sorted_snapshot() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("docs")).expect("创建目录失败");
        fs::write(temp_dir.path().join("guide.md"), "# 指南\n").expect("写入文档失败");

        let snapshot = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("guide.md")
                .to_string_lossy()
                .to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect("移动文档失败");

        assert!(temp_dir.path().join("docs/guide.md").is_file());
        assert!(!temp_dir.path().join("guide.md").exists());
        assert_eq!(
            snapshot.nodes[0].children.as_ref().unwrap()[0].relative_path,
            "docs/guide.md"
        );
    }

    #[test]
    fn moves_directory_with_children_and_rejects_descendant_target() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir_all(temp_dir.path().join("docs/child")).expect("创建子目录失败");
        fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
        fs::write(
            temp_dir.path().join("docs/child/a.plate.json"),
            r#"{"schemaVersion":1,"title":"A","createdAt":"2026-05-30T00:00:00.000Z","updatedAt":"2026-05-30T00:00:00.000Z","content":[{"type":"p","children":[{"text":""}]}]}"#,
        )
        .expect("写入文档失败");

        let error = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("docs/child")
                .to_string_lossy()
                .to_string(),
            None,
            None,
        )
        .expect_err("目录不应移动到自己的后代目录");

        assert_eq!(error, "不能将目录移动到自身或其子目录内");

        move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("docs").to_string_lossy().to_string(),
            temp_dir.path().join("target").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect("移动目录失败");

        assert!(temp_dir
            .path()
            .join("target/docs/child/a.plate.json")
            .is_file());
    }

    #[test]
    fn rejects_move_when_target_name_exists() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        fs::create_dir(temp_dir.path().join("target")).expect("创建目标目录失败");
        fs::write(temp_dir.path().join("guide.md"), "# 指南\n").expect("写入文档失败");
        fs::write(temp_dir.path().join("target/guide.md"), "# 已有\n").expect("写入已有文档失败");

        let error = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir
                .path()
                .join("guide.md")
                .to_string_lossy()
                .to_string(),
            temp_dir.path().join("target").to_string_lossy().to_string(),
            None,
            None,
        )
        .expect_err("同名文件不应被覆盖");

        assert_eq!(error, "目标位置已存在同名节点");
    }

    #[test]
    fn reorders_document_before_sibling_in_same_parent() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        for name in ["a", "b", "c"] {
            fs::write(
                temp_dir.path().join(format!("{name}.md")),
                format!("# {name}\n"),
            )
            .expect("写入文档失败");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let snapshot = move_workspace_node(
            temp_dir.path().to_string_lossy().to_string(),
            temp_dir.path().join("c.md").to_string_lossy().to_string(),
            temp_dir.path().to_string_lossy().to_string(),
            Some(temp_dir.path().join("a.md").to_string_lossy().to_string()),
            None,
        )
        .expect("同层排序失败");
        let paths = snapshot
            .nodes
            .iter()
            .map(|node| node.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["c.md", "a.md", "b.md"]);
    }

    #[test]
    fn update_markdown_document_title_updates_both_frontmatter_and_h1() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.md");
        fs::write(
            &doc_path,
            "---\ntitle: 旧标题\nrefinexDialect: 1\n---\n\n# 旧标题\n\n正文内容\n",
        )
        .expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新标题").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(
            updated.contains("title: 新标题"),
            "frontmatter title 应更新为 新标题，实际: {updated}"
        );
        assert!(
            updated.contains("# 新标题"),
            "正文 H1 应更新为 新标题，实际: {updated}"
        );
        assert!(
            updated.contains("正文内容"),
            "正文其他内容应保留，实际: {updated}"
        );
    }

    #[test]
    fn update_markdown_document_title_inserts_h1_when_missing() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("note.md");
        fs::write(&doc_path, "---\ntitle: 笔记\n---\n\n只有正文没有标题\n")
            .expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新笔记").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(updated.contains("title: 新笔记"));
        assert!(
            updated.contains("# 新笔记"),
            "无 H1 的文档应自动插入 H1，实际: {updated}"
        );
        assert!(
            updated.contains("只有正文没有标题"),
            "正文应保留，实际: {updated}"
        );
    }

    #[test]
    fn update_markdown_document_title_inserts_h1_in_document_without_frontmatter() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("bare.md");
        fs::write(&doc_path, "纯文本内容\n").expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "外部文件").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(updated.contains("title: 外部文件"));
        assert!(updated.contains("# 外部文件"));
        assert!(
            updated.contains("纯文本内容"),
            "正文应保留，实际: {updated}"
        );
    }

    #[test]
    fn update_markdown_document_title_only_replaces_first_h1() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.md");
        fs::write(
            &doc_path,
            "---\ntitle: 旧标题\n---\n\n# 旧标题\n\n## 子标题\n\n# 另一个H1\n",
        )
        .expect("写入 Markdown 失败");

        update_markdown_document_title(&doc_path, "新标题").expect("更新标题失败");

        let updated = fs::read_to_string(&doc_path).expect("读取文件失败");
        assert!(updated.contains("# 新标题\n"));
        assert!(
            updated.contains("# 另一个H1"),
            "第二个 H1 不应被修改，实际: {updated}"
        );
    }

    #[test]
    fn preferred_editor_mapping_matches_supported_app_ids() {
        assert_eq!(preferred_editor_macos_app_name("cursor"), Some("Cursor"));
        assert_eq!(
            preferred_editor_macos_app_name("vscode-insiders"),
            Some("Visual Studio Code - Insiders")
        );
        assert_eq!(preferred_editor_macos_app_name("rustrover"), Some("RustRover"));
        assert_eq!(preferred_editor_macos_app_name("unknown"), None);
    }

    #[test]
    fn validate_existing_external_open_path_accepts_files_and_directories() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let doc_path = temp_dir.path().join("guide.md");
        fs::write(&doc_path, "# Guide\n").expect("写入文档失败");

        assert_eq!(
            validate_existing_external_open_path(&doc_path.to_string_lossy())
                .expect("应接受文件路径"),
            doc_path.canonicalize().expect("规范化文件路径失败")
        );
        assert_eq!(
            validate_existing_external_open_path(&temp_dir.path().to_string_lossy())
                .expect("应接受目录路径"),
            temp_dir.path().canonicalize().expect("规范化目录路径失败")
        );
        assert!(validate_existing_external_open_path("").is_err());
        assert!(validate_existing_external_open_path(
            &temp_dir.path().join("missing.md").to_string_lossy()
        )
        .is_err());
    }

    fn sample_envelope(title: &str, text: &str) -> PlateDocumentEnvelope {
        PlateDocumentEnvelope {
            schema_version: 1,
            title: title.to_string(),
            created_at: "2026-05-30T00:00:00.000Z".to_string(),
            updated_at: "2026-05-30T00:00:00.000Z".to_string(),
            content: serde_json::json!([{ "type": "p", "children": [{ "text": text }] }]),
        }
    }
}

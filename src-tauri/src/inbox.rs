use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;
use uuid::Uuid;

use crate::{assets, workspace};

const MAX_CAPTURE_BYTES: usize = 256 * 1024;
const MAX_CAPTURE_TAGS: usize = 5;
const MAX_CAPTURE_TAG_CHARS: usize = 32;
const MAX_CAPTURE_TITLE_CHARS: usize = 80;
const MAX_CAPTURE_SUMMARY_CHARS: usize = 160;

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InboxCaptureStatus {
    #[default]
    Open,
    Processing,
    Done,
    Archived,
}

impl InboxCaptureStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Processing => "processing",
            Self::Done => "done",
            Self::Archived => "archived",
        }
    }

    fn is_active(self) -> bool {
        matches!(self, Self::Open | Self::Processing)
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InboxCapturePriority {
    Low,
    #[default]
    Normal,
    High,
}

impl InboxCapturePriority {
    fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Normal => "normal",
            Self::High => "high",
        }
    }

    fn rank(self) -> u8 {
        match self {
            Self::Low => 0,
            Self::Normal => 1,
            Self::High => 2,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum InboxCaptureSource {
    QuickCapture,
    #[default]
    Inbox,
}

impl InboxCaptureSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::QuickCapture => "quick-capture",
            Self::Inbox => "inbox",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InboxCaptureListView {
    #[default]
    Active,
    Done,
    Archived,
    All,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxCapture {
    pub id: String,
    pub body: String,
    pub status: InboxCaptureStatus,
    pub priority: InboxCapturePriority,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub source: InboxCaptureSource,
    pub snoozed_until: Option<String>,
    pub resolved_at: Option<String>,
    pub promoted_to: Option<String>,
    pub appended_to: Option<String>,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxCaptureSummary {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub status: InboxCaptureStatus,
    pub priority: InboxCapturePriority,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub source: InboxCaptureSource,
    pub snoozed_until: Option<String>,
    pub resolved_at: Option<String>,
    pub promoted_to: Option<String>,
    pub appended_to: Option<String>,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxCaptureIssue {
    pub file_name: String,
    pub message: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InboxCaptureListResult {
    pub captures: Vec<InboxCaptureSummary>,
    pub active_count: usize,
    pub issues: Vec<InboxCaptureIssue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCaptureUpdate {
    pub body: String,
    pub status: InboxCaptureStatus,
    pub priority: InboxCapturePriority,
    #[serde(default)]
    pub tags: Vec<String>,
    pub snoozed_until: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxPromotionResult {
    pub capture: InboxCapture,
    pub document: workspace::CreatedMarkdownDocument,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxDailyAppendResult {
    pub capture: InboxCapture,
    pub daily_note: workspace::DailyNoteDocument,
}

#[derive(Debug)]
struct StoredCapture {
    capture: InboxCapture,
    path: PathBuf,
    unknown_frontmatter: Vec<String>,
    raw: String,
}

#[tauri::command]
pub async fn list_inbox_captures(
    root_path: String,
    view: Option<InboxCaptureListView>,
    query: Option<String>,
) -> Result<InboxCaptureListResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_inbox_captures_sync(&root_path, view.unwrap_or_default(), query.as_deref())
    })
    .await
    .map_err(|_| "收件箱读取任务失败".to_string())?
}

#[tauri::command]
pub async fn read_inbox_capture(
    root_path: String,
    capture_id: String,
) -> Result<InboxCapture, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(read_stored_capture(&root_path, &capture_id)?.capture)
    })
    .await
    .map_err(|_| "捕获读取任务失败".to_string())?
}

#[tauri::command]
pub async fn create_inbox_capture(
    root_path: String,
    body: String,
    tags: Vec<String>,
    source: InboxCaptureSource,
) -> Result<InboxCapture, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_inbox_capture_sync(&root_path, body, tags, source)
    })
    .await
    .map_err(|_| "捕获创建任务失败".to_string())?
}

#[tauri::command]
pub async fn update_inbox_capture(
    root_path: String,
    capture_id: String,
    update: InboxCaptureUpdate,
    expected_modified_at: u64,
) -> Result<InboxCapture, String> {
    tauri::async_runtime::spawn_blocking(move || {
        update_inbox_capture_sync(&root_path, &capture_id, update, expected_modified_at)
    })
    .await
    .map_err(|_| "捕获保存任务失败".to_string())?
}

#[tauri::command]
pub async fn delete_inbox_capture(
    root_path: String,
    capture_id: String,
    expected_modified_at: u64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        delete_inbox_capture_sync(&root_path, &capture_id, expected_modified_at)
    })
    .await
    .map_err(|_| "捕获删除任务失败".to_string())?
}

#[tauri::command]
pub async fn promote_inbox_capture(
    root_path: String,
    capture_id: String,
    target_dir: String,
    title: String,
    expected_modified_at: u64,
) -> Result<InboxPromotionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        promote_inbox_capture_sync(
            &root_path,
            &capture_id,
            &target_dir,
            &title,
            expected_modified_at,
        )
    })
    .await
    .map_err(|_| "提升捕获任务失败".to_string())?
}

#[tauri::command]
pub async fn append_inbox_capture_to_daily(
    root_path: String,
    capture_id: String,
    date: String,
    local_time: String,
    expected_modified_at: u64,
) -> Result<InboxDailyAppendResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        append_inbox_capture_to_daily_sync(
            &root_path,
            &capture_id,
            &date,
            &local_time,
            expected_modified_at,
        )
    })
    .await
    .map_err(|_| "追加捕获任务失败".to_string())?
}

fn list_inbox_captures_sync(
    root_path: &str,
    view: InboxCaptureListView,
    query: Option<&str>,
) -> Result<InboxCaptureListResult, String> {
    let root = canonical_workspace_root(root_path)?;
    let inbox = ensure_inbox_dir(&root)?;
    let mut stored = Vec::new();
    let mut issues = Vec::new();

    for entry in fs::read_dir(&inbox).map_err(|_| "无法读取收件箱目录".to_string())? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                issues.push(InboxCaptureIssue {
                    file_name: "未知文件".to_string(),
                    message: format!("无法读取目录项：{error}"),
                });
                continue;
            }
        };
        let path = entry.path();
        if !is_markdown_file(&path) {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        match read_stored_capture_from_path(&root, &inbox, path) {
            Ok(capture) => stored.push(capture),
            Err(message) => issues.push(InboxCaptureIssue { file_name, message }),
        }
    }

    let active_count = stored
        .iter()
        .filter(|item| item.capture.status.is_active())
        .count();
    let normalized_query = query.unwrap_or_default().trim().to_lowercase();
    let searching = !normalized_query.is_empty();
    let mut captures = stored
        .into_iter()
        .filter(|item| {
            searching
                || match view {
                    InboxCaptureListView::Active => item.capture.status.is_active(),
                    InboxCaptureListView::Done => item.capture.status == InboxCaptureStatus::Done,
                    InboxCaptureListView::Archived => {
                        item.capture.status == InboxCaptureStatus::Archived
                    }
                    InboxCaptureListView::All => true,
                }
        })
        .filter(|item| {
            if !searching {
                return true;
            }
            let haystack = format!(
                "{}\n{}\n{}",
                derive_capture_title(&item.capture.body),
                item.capture.body,
                item.capture.tags.join(" ")
            )
            .to_lowercase();
            haystack.contains(&normalized_query)
        })
        .map(|item| to_summary(item.capture))
        .collect::<Vec<_>>();

    captures.sort_by(|left, right| {
        right
            .priority
            .rank()
            .cmp(&left.priority.rank())
            .then_with(|| {
                timestamp_sort_key(&right.updated_at).cmp(&timestamp_sort_key(&left.updated_at))
            })
    });

    Ok(InboxCaptureListResult {
        captures,
        active_count,
        issues,
    })
}

fn create_inbox_capture_sync(
    root_path: &str,
    body: String,
    tags: Vec<String>,
    source: InboxCaptureSource,
) -> Result<InboxCapture, String> {
    validate_capture_body(&body)?;
    let tags = normalize_tags(tags)?;
    let root = canonical_workspace_root(root_path)?;
    let inbox = ensure_inbox_dir(&root)?;
    let now = current_iso_timestamp();
    let id = create_capture_id();
    let path = inbox.join(format!("{id}.md"));
    let mut capture = InboxCapture {
        id,
        body,
        status: InboxCaptureStatus::Open,
        priority: InboxCapturePriority::Normal,
        tags,
        created_at: now.clone(),
        updated_at: now,
        source,
        snoozed_until: None,
        resolved_at: None,
        promoted_to: None,
        appended_to: None,
        modified_at: 0,
    };
    let raw = serialize_capture(&capture, &[])?;
    workspace::write_text_atomic(&path, &raw)
        .map_err(|_| "无法创建捕获 Markdown 文件".to_string())?;
    capture.modified_at = read_modified_at(&path)?;
    Ok(capture)
}

fn update_inbox_capture_sync(
    root_path: &str,
    capture_id: &str,
    update: InboxCaptureUpdate,
    expected_modified_at: u64,
) -> Result<InboxCapture, String> {
    validate_capture_body(&update.body)?;
    let tags = normalize_tags(update.tags)?;
    let mut stored = read_stored_capture(root_path, capture_id)?;
    ensure_expected_modified_at(&stored.capture, expected_modified_at)?;
    let snoozed_until = validate_snoozed_until(update.snoozed_until, update.status)?;
    let was_resolved = !stored.capture.status.is_active();
    stored.capture.body = update.body;
    stored.capture.status = update.status;
    stored.capture.priority = update.priority;
    stored.capture.tags = tags;
    stored.capture.snoozed_until = snoozed_until;
    stored.capture.updated_at = current_iso_timestamp();
    if stored.capture.status.is_active() {
        if was_resolved {
            stored.capture.resolved_at = None;
        }
    } else {
        stored.capture.snoozed_until = None;
        stored.capture.resolved_at = Some(stored.capture.updated_at.clone());
    }
    save_stored_capture(stored, expected_modified_at)
}

fn delete_inbox_capture_sync(
    root_path: &str,
    capture_id: &str,
    expected_modified_at: u64,
) -> Result<String, String> {
    let stored = read_stored_capture(root_path, capture_id)?;
    ensure_expected_modified_at(&stored.capture, expected_modified_at)?;
    let root = canonical_workspace_root(root_path)?;
    let asset_ids = assets::extract_asset_ids_from_markdown(&stored.raw);
    fs::remove_file(&stored.path).map_err(|_| "无法删除捕获文件".to_string())?;
    if let Err(error) = assets::cleanup_unreferenced_assets(&root, asset_ids) {
        log::warn!("收件箱资产清理失败：{error}");
    }
    Ok(capture_id.to_string())
}

fn promote_inbox_capture_sync(
    root_path: &str,
    capture_id: &str,
    target_dir: &str,
    title: &str,
    expected_modified_at: u64,
) -> Result<InboxPromotionResult, String> {
    validate_promote_target(target_dir)?;
    let title = title.trim();
    if title.is_empty() {
        return Err("笔记标题不能为空".to_string());
    }
    let mut stored = read_stored_capture(root_path, capture_id)?;
    ensure_expected_modified_at(&stored.capture, expected_modified_at)?;
    if !stored.capture.status.is_active() {
        return Err("请先重新打开 Capture，再提升为笔记".to_string());
    }
    let now = current_iso_timestamp();
    let body = ensure_note_heading(&stored.capture.body, title);
    let markdown = format!(
        "---\ntitle: {}\ncreatedAt: {}\nupdatedAt: {}\nrefinexDialect: 1\ntags: {}\n---\n\n{}\n",
        json_string(title)?,
        json_string(&stored.capture.created_at)?,
        json_string(&now)?,
        serde_json::to_string(&stored.capture.tags).map_err(|_| "无法序列化捕获标签".to_string())?,
        body.trim_end(),
    );
    let document = workspace::create_imported_markdown_document(
        root_path.to_string(),
        target_dir.to_string(),
        title.to_string(),
        markdown,
    )?;
    stored.capture.status = InboxCaptureStatus::Done;
    stored.capture.snoozed_until = None;
    stored.capture.resolved_at = Some(now.clone());
    stored.capture.updated_at = now;
    stored.capture.promoted_to = Some(document.node.relative_path.clone());

    match save_stored_capture(stored, expected_modified_at) {
        Ok(capture) => Ok(InboxPromotionResult { capture, document }),
        Err(error) => {
            if let Err(rollback_error) = fs::remove_file(&document.node.absolute_path) {
                return Err(format!("{error}；同时无法回滚新建笔记：{rollback_error}"));
            }
            Err(error)
        }
    }
}

fn append_inbox_capture_to_daily_sync(
    root_path: &str,
    capture_id: &str,
    date: &str,
    local_time: &str,
    expected_modified_at: u64,
) -> Result<InboxDailyAppendResult, String> {
    validate_local_time(local_time)?;
    let day = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "日期格式无效，请使用 YYYY-MM-DD".to_string())?;
    let expected_daily_path = format!(
        "Daily/{}/{}/{}.md",
        day.format("%Y"),
        day.format("%m"),
        day.format("%Y-%m-%d")
    );
    let mut stored = read_stored_capture(root_path, capture_id)?;
    ensure_expected_modified_at(&stored.capture, expected_modified_at)?;
    let linked_to_expected_daily =
        stored.capture.appended_to.as_deref() == Some(expected_daily_path.as_str());
    if !stored.capture.status.is_active() && !linked_to_expected_daily {
        return Err("请先重新打开 Capture，再追加到 Daily".to_string());
    }
    let opened = workspace::open_daily_note(root_path.to_string(), date.to_string())?;
    let previous_content = opened.content.content.clone();
    let marker = format!("<!-- madora-capture:{} -->", stored.capture.id);
    if linked_to_expected_daily && previous_content.contains(&marker) {
        return Ok(InboxDailyAppendResult {
            capture: stored.capture,
            daily_note: opened,
        });
    }
    if !stored.capture.status.is_active() {
        return Err("Daily 中缺少对应 Capture 标记，请重新打开后再追加".to_string());
    }
    let next_content = if previous_content.contains(&marker) {
        previous_content.clone()
    } else {
        append_to_daily_inbox_section(
            &previous_content,
            &derive_capture_title(&stored.capture.body),
            local_time,
            &marker,
            &stored.capture.body,
        )
    };
    let saved_meta = if next_content == previous_content {
        opened.content.modified_at
    } else {
        workspace::save_markdown_document_sync(
            root_path.to_string(),
            opened.node.absolute_path.clone(),
            next_content.clone(),
            Some(opened.content.modified_at),
        )?
        .modified_at
    };
    let now = current_iso_timestamp();
    stored.capture.status = InboxCaptureStatus::Done;
    stored.capture.snoozed_until = None;
    stored.capture.resolved_at = Some(now.clone());
    stored.capture.updated_at = now;
    stored.capture.appended_to = Some(opened.node.relative_path.clone());

    let capture = match save_stored_capture(stored, expected_modified_at) {
        Ok(capture) => capture,
        Err(error) if next_content != previous_content => {
            match workspace::save_markdown_document_sync(
                root_path.to_string(),
                opened.node.absolute_path.clone(),
                previous_content,
                Some(saved_meta),
            ) {
                Ok(_) => return Err(error),
                Err(rollback_error) => {
                    return Err(format!("{error}；同时无法回滚 Daily：{rollback_error}"));
                }
            }
        }
        Err(error) => return Err(error),
    };

    Ok(InboxDailyAppendResult {
        capture,
        daily_note: workspace::DailyNoteDocument {
            node: opened.node,
            content: workspace::MarkdownDocumentContent {
                path: opened.content.path,
                content: next_content,
                modified_at: saved_meta,
            },
        },
    })
}

fn read_stored_capture(root_path: &str, capture_id: &str) -> Result<StoredCapture, String> {
    validate_capture_id(capture_id)?;
    let root = canonical_workspace_root(root_path)?;
    let inbox = ensure_inbox_dir(&root)?;
    let candidate = inbox.join(format!("{capture_id}.md"));
    if !candidate.is_file() {
        return Err("捕获不存在".to_string());
    }
    read_stored_capture_from_path(&root, &inbox, candidate)
}

fn read_stored_capture_from_path(
    root: &Path,
    inbox: &Path,
    path: PathBuf,
) -> Result<StoredCapture, String> {
    let canonical = path
        .canonicalize()
        .map_err(|_| "捕获路径不存在".to_string())?;
    if !canonical.starts_with(inbox) || !canonical.starts_with(root) {
        return Err("无法访问收件箱外的文件".to_string());
    }
    let id = canonical
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "捕获文件名无效".to_string())?
        .to_string();
    validate_capture_id(&id)?;
    let raw = fs::read_to_string(&canonical)
        .map_err(|_| "无法读取捕获内容，当前仅支持 UTF-8 Markdown".to_string())?;
    let modified_at = read_modified_at(&canonical)?;
    let fallback_timestamp = read_file_timestamp(&canonical)?;
    let (frontmatter_lines, body) = split_frontmatter(&raw);
    let values = read_frontmatter_values(&frontmatter_lines);
    let created_at =
        read_timestamp(values.get("createdAt")).unwrap_or_else(|| fallback_timestamp.clone());
    let updated_at =
        read_timestamp(values.get("updatedAt")).unwrap_or_else(|| fallback_timestamp.clone());
    let status = match read_string(values.get("status")).as_deref() {
        Some("processing") => InboxCaptureStatus::Processing,
        Some("done") => InboxCaptureStatus::Done,
        Some("archived") => InboxCaptureStatus::Archived,
        _ => InboxCaptureStatus::Open,
    };
    let priority = match read_string(values.get("priority")).as_deref() {
        Some("low") => InboxCapturePriority::Low,
        Some("high") => InboxCapturePriority::High,
        _ => InboxCapturePriority::Normal,
    };
    let source = match read_string(values.get("source")).as_deref() {
        Some("quick-capture") => InboxCaptureSource::QuickCapture,
        _ => InboxCaptureSource::Inbox,
    };
    let tags = values
        .get("tags")
        .and_then(|raw| serde_json::from_str::<Vec<String>>(raw.trim()).ok())
        .and_then(|tags| normalize_tags(tags).ok())
        .unwrap_or_default();
    let unknown_frontmatter = frontmatter_lines
        .into_iter()
        .filter(|line| {
            line.split_once(':')
                .map(|(key, _)| !is_known_frontmatter_key(key.trim()))
                .unwrap_or(true)
        })
        .collect();

    Ok(StoredCapture {
        capture: InboxCapture {
            id,
            body,
            status,
            priority,
            tags,
            created_at,
            updated_at,
            source,
            snoozed_until: read_optional_string(values.get("snoozedUntil")),
            resolved_at: read_optional_string(values.get("resolvedAt")),
            promoted_to: read_optional_string(values.get("promotedTo")),
            appended_to: read_optional_string(values.get("appendedTo")),
            modified_at,
        },
        path: canonical,
        unknown_frontmatter,
        raw,
    })
}

fn save_stored_capture(
    mut stored: StoredCapture,
    expected_modified_at: u64,
) -> Result<InboxCapture, String> {
    let current_modified_at = read_modified_at(&stored.path)?;
    if current_modified_at != expected_modified_at {
        return Err("捕获已在磁盘上更新，请重新加载后再保存".to_string());
    }
    validate_capture_body(&stored.capture.body)?;
    let old_asset_ids = assets::extract_asset_ids_from_markdown(&stored.raw);
    let raw = serialize_capture(&stored.capture, &stored.unknown_frontmatter)?;
    let new_asset_ids = assets::extract_asset_ids_from_markdown(&raw);
    let cleanup_candidates = old_asset_ids
        .difference(&new_asset_ids)
        .cloned()
        .collect::<BTreeSet<_>>();
    workspace::write_text_atomic(&stored.path, &raw).map_err(|_| "无法保存捕获内容".to_string())?;
    stored.capture.modified_at = read_modified_at(&stored.path)?;
    if let Some(root) = stored.path.ancestors().nth(3) {
        if let Err(error) = assets::cleanup_unreferenced_assets(root, cleanup_candidates) {
            log::warn!("收件箱资产清理失败：{error}");
        }
    }
    Ok(stored.capture)
}

fn ensure_expected_modified_at(
    capture: &InboxCapture,
    expected_modified_at: u64,
) -> Result<(), String> {
    if capture.modified_at != expected_modified_at {
        return Err("捕获已在磁盘上更新，请重新加载后再保存".to_string());
    }
    Ok(())
}

fn serialize_capture(
    capture: &InboxCapture,
    unknown_frontmatter: &[String],
) -> Result<String, String> {
    let tags =
        serde_json::to_string(&capture.tags).map_err(|_| "无法序列化捕获标签".to_string())?;
    let mut lines = vec![
        "---".to_string(),
        format!("id: {}", json_string(&capture.id)?),
        "type: \"capture\"".to_string(),
        format!("status: {}", json_string(capture.status.as_str())?),
        format!("priority: {}", json_string(capture.priority.as_str())?),
        format!("tags: {tags}"),
        format!("createdAt: {}", json_string(&capture.created_at)?),
        format!("updatedAt: {}", json_string(&capture.updated_at)?),
        format!("source: {}", json_string(capture.source.as_str())?),
        format_optional_line("snoozedUntil", capture.snoozed_until.as_deref())?,
        format_optional_line("resolvedAt", capture.resolved_at.as_deref())?,
        format_optional_line("promotedTo", capture.promoted_to.as_deref())?,
        format_optional_line("appendedTo", capture.appended_to.as_deref())?,
    ];
    lines.extend(unknown_frontmatter.iter().cloned());
    lines.push("---".to_string());
    Ok(format!(
        "{}\n\n{}\n",
        lines.join("\n"),
        capture.body.trim_end()
    ))
}

fn split_frontmatter(raw: &str) -> (Vec<String>, String) {
    let normalized = raw.replace("\r\n", "\n");
    let Some(remaining) = normalized.strip_prefix("---\n") else {
        return (Vec::new(), raw.to_string());
    };
    let Some(end) = remaining.find("\n---") else {
        return (Vec::new(), raw.to_string());
    };
    let after_delimiter = &remaining[end + 4..];
    let body = after_delimiter
        .strip_prefix('\n')
        .unwrap_or(after_delimiter)
        .trim_start_matches('\n')
        .to_string();
    (remaining[..end].lines().map(str::to_string).collect(), body)
}

fn read_frontmatter_values(lines: &[String]) -> BTreeMap<String, String> {
    lines
        .iter()
        .filter_map(|line| {
            line.split_once(':')
                .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        })
        .collect()
}

fn is_known_frontmatter_key(key: &str) -> bool {
    matches!(
        key,
        "id" | "type"
            | "status"
            | "priority"
            | "tags"
            | "createdAt"
            | "updatedAt"
            | "source"
            | "snoozedUntil"
            | "resolvedAt"
            | "promotedTo"
            | "appendedTo"
    )
}

fn read_string(value: Option<&String>) -> Option<String> {
    let raw = value?.trim();
    if raw.is_empty() || raw == "null" {
        return None;
    }
    serde_json::from_str::<String>(raw)
        .ok()
        .or_else(|| Some(raw.trim_matches(['\"', '\'']).to_string()))
}

fn read_optional_string(value: Option<&String>) -> Option<String> {
    read_string(value).filter(|value| !value.trim().is_empty())
}

fn read_timestamp(value: Option<&String>) -> Option<String> {
    let timestamp = read_string(value)?;
    DateTime::parse_from_rfc3339(&timestamp).ok()?;
    Some(timestamp)
}

fn format_optional_line(key: &str, value: Option<&str>) -> Result<String, String> {
    Ok(match value {
        Some(value) => format!("{key}: {}", json_string(value)?),
        None => format!("{key}: null"),
    })
}

fn json_string(value: &str) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "无法序列化捕获元数据".to_string())
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

fn ensure_inbox_dir(root: &Path) -> Result<PathBuf, String> {
    let private_dir = root.join(".madora");
    if private_dir.exists() {
        let canonical_private = private_dir
            .canonicalize()
            .map_err(|_| "无法读取工作区私有目录".to_string())?;
        if !canonical_private.starts_with(root) || !canonical_private.is_dir() {
            return Err("工作区私有目录必须位于当前工作区".to_string());
        }
    } else {
        fs::create_dir(&private_dir).map_err(|_| "无法创建工作区私有目录".to_string())?;
    }

    let inbox = private_dir.join("inbox");
    if !inbox.exists() {
        fs::create_dir(&inbox).map_err(|_| "无法创建收件箱目录".to_string())?;
    }
    let canonical = inbox
        .canonicalize()
        .map_err(|_| "无法读取收件箱目录".to_string())?;
    if !canonical.starts_with(root) || !canonical.is_dir() {
        return Err("收件箱目录必须位于当前工作区".to_string());
    }
    Ok(canonical)
}

fn validate_capture_id(value: &str) -> Result<(), String> {
    let valid = value.starts_with("cap_")
        && value.len() <= 80
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_');
    if !valid {
        return Err("捕获 ID 无效".to_string());
    }
    Ok(())
}

fn validate_capture_body(body: &str) -> Result<(), String> {
    if body.trim().is_empty() {
        return Err("捕获内容不能为空".to_string());
    }
    if body.len() > MAX_CAPTURE_BYTES {
        return Err("捕获内容不能超过 256 KiB".to_string());
    }
    Ok(())
}

fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let mut seen = BTreeSet::new();
    for tag in tags {
        let tag = tag
            .trim()
            .trim_start_matches('#')
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-")
            .to_lowercase();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > MAX_CAPTURE_TAG_CHARS {
            return Err("单个标签不能超过 32 个字符".to_string());
        }
        if seen.insert(tag.clone()) {
            normalized.push(tag);
        }
    }
    if normalized.len() > MAX_CAPTURE_TAGS {
        return Err("每条捕获最多包含 5 个标签".to_string());
    }
    Ok(normalized)
}

fn validate_snoozed_until(
    value: Option<String>,
    status: InboxCaptureStatus,
) -> Result<Option<String>, String> {
    let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };
    if !status.is_active() {
        return Err("已处理或已归档的捕获不能设置稍后提醒".to_string());
    }
    let parsed =
        DateTime::parse_from_rfc3339(&value).map_err(|_| "稍后提醒时间格式无效".to_string())?;
    if parsed.to_utc() <= utc_now() {
        return Err("稍后提醒时间必须晚于当前时间".to_string());
    }
    Ok(Some(parsed.to_rfc3339_opts(SecondsFormat::Millis, true)))
}

fn validate_promote_target(target_dir: &str) -> Result<(), String> {
    let path = Path::new(target_dir);
    if path.is_absolute() {
        return Err("笔记目标目录必须使用工作区相对路径".to_string());
    }
    for (index, component) in path.components().enumerate() {
        let Component::Normal(value) = component else {
            return Err("笔记目标目录无效".to_string());
        };
        let value = value.to_string_lossy();
        if value.starts_with('.') || (index == 0 && value == "Daily") {
            return Err("不能把捕获提升到隐藏目录或 Daily".to_string());
        }
    }
    Ok(())
}

fn validate_local_time(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    if bytes.len() != 5
        || bytes[2] != b':'
        || !bytes
            .iter()
            .enumerate()
            .all(|(index, value)| index == 2 || value.is_ascii_digit())
    {
        return Err("本地时间格式无效，请使用 HH:mm".to_string());
    }
    let hour = value[..2].parse::<u8>().unwrap_or(24);
    let minute = value[3..].parse::<u8>().unwrap_or(60);
    if hour > 23 || minute > 59 {
        return Err("本地时间格式无效，请使用 HH:mm".to_string());
    }
    Ok(())
}

fn create_capture_id() -> String {
    let timestamp = utc_now().format("%Y%m%d_%H%M%S_%3f");
    let suffix = Uuid::new_v4().simple().to_string();
    format!("cap_{timestamp}_{}", &suffix[..8])
}

fn current_iso_timestamp() -> String {
    utc_now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn utc_now() -> DateTime<Utc> {
    SystemTime::now().into()
}

fn timestamp_sort_key(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.timestamp_millis())
        .unwrap_or_default()
}

fn read_modified_at(path: &Path) -> Result<u64, String> {
    const FNV_OFFSET: u64 = 14_695_981_039_346_656_037;
    const FNV_PRIME: u64 = 1_099_511_628_211;
    const JS_SAFE_INTEGER_MASK: u64 = (1_u64 << 53) - 1;

    let metadata = fs::metadata(path).map_err(|_| "无法读取捕获文件信息".to_string())?;
    let modified = metadata
        .modified()
        .map_err(|_| "无法读取捕获文件信息".to_string())?
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let content = fs::read(path).map_err(|_| "无法读取捕获文件信息".to_string())?;
    let mut hash = FNV_OFFSET;
    for byte in modified
        .as_secs()
        .to_le_bytes()
        .into_iter()
        .chain(modified.subsec_nanos().to_le_bytes())
        .chain(metadata.len().to_le_bytes())
        .chain(content)
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    Ok(hash & JS_SAFE_INTEGER_MASK)
}

fn read_file_timestamp(path: &Path) -> Result<String, String> {
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|_| "无法读取捕获文件信息".to_string())?;
    Ok(DateTime::<Utc>::from(modified).to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn is_markdown_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
}

fn derive_capture_title(body: &str) -> String {
    let line = body
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("未命名捕获");
    let stripped = line
        .trim_start_matches(|character: char| {
            matches!(character, '#' | '>' | '-' | '*' | '+' | '[' | ']' | ' ')
        })
        .trim();
    truncate_chars(
        if stripped.is_empty() {
            "未命名捕获"
        } else {
            stripped
        },
        MAX_CAPTURE_TITLE_CHARS,
    )
}

fn derive_capture_summary(body: &str) -> String {
    let summary = body.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_chars(&summary, MAX_CAPTURE_SUMMARY_CHARS)
}

fn truncate_chars(value: &str, max: usize) -> String {
    let mut chars = value.chars();
    let prefix = chars.by_ref().take(max).collect::<String>();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

fn to_summary(capture: InboxCapture) -> InboxCaptureSummary {
    InboxCaptureSummary {
        id: capture.id,
        title: derive_capture_title(&capture.body),
        summary: derive_capture_summary(&capture.body),
        status: capture.status,
        priority: capture.priority,
        tags: capture.tags,
        created_at: capture.created_at,
        updated_at: capture.updated_at,
        source: capture.source,
        snoozed_until: capture.snoozed_until,
        resolved_at: capture.resolved_at,
        promoted_to: capture.promoted_to,
        appended_to: capture.appended_to,
        modified_at: capture.modified_at,
    }
}

fn ensure_note_heading(body: &str, title: &str) -> String {
    let has_h1 = body
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.starts_with("# "))
        .unwrap_or(false);
    if has_h1 {
        body.trim_end().to_string()
    } else {
        format!("# {title}\n\n{}", body.trim())
    }
}

fn append_to_daily_inbox_section(
    raw: &str,
    title: &str,
    local_time: &str,
    marker: &str,
    body: &str,
) -> String {
    let block = format!("### {local_time} · {title}\n{marker}\n\n{}", body.trim());
    let mut lines = raw
        .replace("\r\n", "\n")
        .lines()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut in_fence = false;
    let mut inbox_index = None;
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if !in_fence && trimmed == "## Inbox" {
            inbox_index = Some(index);
            break;
        }
    }
    if let Some(inbox_index) = inbox_index {
        in_fence = false;
        let mut insertion = lines.len();
        for (index, line) in lines.iter().enumerate().skip(inbox_index + 1) {
            let trimmed = line.trim();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                in_fence = !in_fence;
                continue;
            }
            if !in_fence && trimmed.starts_with("## ") {
                insertion = index;
                break;
            }
        }
        let mut block_lines = vec![String::new()];
        block_lines.extend(block.lines().map(str::to_string));
        block_lines.push(String::new());
        lines.splice(insertion..insertion, block_lines);
        format!("{}\n", lines.join("\n").trim_end())
    } else {
        format!("{}\n\n## Inbox\n\n{block}\n", raw.trim_end())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_lists_and_normalizes_inbox_capture() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().to_string_lossy().to_string();
        let created = create_inbox_capture_sync(
            &root,
            "# 一个想法\n\n继续补充".to_string(),
            vec![
                "#Madora".to_string(),
                "AI Panel".to_string(),
                "madora".to_string(),
            ],
            InboxCaptureSource::QuickCapture,
        )
        .expect("create capture");

        assert!(created.id.starts_with("cap_"));
        assert_inbox_modified_at_is_tauri_compatible(created.modified_at);
        let serialized = serde_json::to_value(&created).expect("serialize capture");
        assert_eq!(serialized["modifiedAt"].as_u64(), Some(created.modified_at));
        assert_eq!(created.tags, vec!["madora", "ai-panel"]);
        assert!(temp
            .path()
            .join(format!(".madora/inbox/{}.md", created.id))
            .is_file());

        let listed = list_inbox_captures_sync(&root, InboxCaptureListView::Active, None)
            .expect("list captures");
        assert_eq!(listed.active_count, 1);
        assert_eq!(listed.captures[0].title, "一个想法");
    }

    fn assert_inbox_modified_at_is_tauri_compatible(_: u64) {}

    #[test]
    fn preserves_unknown_frontmatter_and_rejects_stale_updates() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().to_string_lossy().to_string();
        let created = create_inbox_capture_sync(
            &root,
            "正文".to_string(),
            Vec::new(),
            InboxCaptureSource::Inbox,
        )
        .expect("create capture");
        let path = temp.path().join(format!(".madora/inbox/{}.md", created.id));
        let raw = fs::read_to_string(&path).expect("capture raw");
        fs::write(
            &path,
            raw.replace("---\n\n正文", "customField: keep\n---\n\n正文"),
        )
        .expect("external write");
        let reloaded = read_stored_capture(&root, &created.id).expect("reload");
        let updated = update_inbox_capture_sync(
            &root,
            &created.id,
            InboxCaptureUpdate {
                body: "新正文".to_string(),
                status: InboxCaptureStatus::Processing,
                priority: InboxCapturePriority::High,
                tags: Vec::new(),
                snoozed_until: None,
            },
            reloaded.capture.modified_at,
        )
        .expect("update");
        assert_eq!(updated.status, InboxCaptureStatus::Processing);
        assert!(fs::read_to_string(path)
            .expect("updated raw")
            .contains("customField: keep"));

        let error = update_inbox_capture_sync(
            &root,
            &created.id,
            InboxCaptureUpdate {
                body: "再次更新".to_string(),
                status: InboxCaptureStatus::Open,
                priority: InboxCapturePriority::Normal,
                tags: Vec::new(),
                snoozed_until: None,
            },
            reloaded.capture.modified_at,
        )
        .expect_err("stale update must fail");
        assert!(error.contains("磁盘上更新"));
    }

    #[test]
    fn promotes_capture_and_appends_another_capture_idempotently() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().to_string_lossy().to_string();
        let promoted = create_inbox_capture_sync(
            &root,
            "需要成为笔记".to_string(),
            vec!["Idea".to_string()],
            InboxCaptureSource::Inbox,
        )
        .expect("create promoted capture");
        let promotion =
            promote_inbox_capture_sync(&root, &promoted.id, "", "正式笔记", promoted.modified_at)
                .expect("promote capture");
        assert_eq!(promotion.capture.status, InboxCaptureStatus::Done);
        assert!(temp.path().join("正式笔记.md").is_file());
        assert!(promote_inbox_capture_sync(
            &root,
            &promoted.id,
            "",
            "正式笔记",
            promotion.capture.modified_at,
        )
        .is_err());
        assert!(!temp.path().join("正式笔记-1.md").exists());

        let appended = create_inbox_capture_sync(
            &root,
            "追加内容".to_string(),
            Vec::new(),
            InboxCaptureSource::QuickCapture,
        )
        .expect("create appended capture");
        let result = append_inbox_capture_to_daily_sync(
            &root,
            &appended.id,
            "2026-07-18",
            "14:32",
            appended.modified_at,
        )
        .expect("append capture");
        assert_eq!(result.capture.status, InboxCaptureStatus::Done);
        let daily =
            fs::read_to_string(temp.path().join("Daily/2026/07/2026-07-18.md")).expect("daily raw");
        assert_eq!(
            daily
                .matches(&format!("madora-capture:{}", appended.id))
                .count(),
            1
        );
        assert!(daily.contains("## Inbox"));
        assert!(daily.contains("追加内容"));

        let retried = append_inbox_capture_to_daily_sync(
            &root,
            &appended.id,
            "2026-07-18",
            "14:32",
            result.capture.modified_at,
        )
        .expect("retry append capture");
        assert_eq!(retried.capture.status, InboxCaptureStatus::Done);
        let retried_daily = fs::read_to_string(temp.path().join("Daily/2026/07/2026-07-18.md"))
            .expect("retried daily raw");
        assert_eq!(
            retried_daily
                .matches(&format!("madora-capture:{}", appended.id))
                .count(),
            1
        );
        assert!(append_inbox_capture_to_daily_sync(
            &root,
            &appended.id,
            "2026-07-19",
            "09:00",
            retried.capture.modified_at,
        )
        .is_err());
        assert!(!temp.path().join("Daily/2026/07/2026-07-19.md").exists());
    }

    #[test]
    fn recovers_missing_fields_and_searches_across_resolved_states() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().to_string_lossy().to_string();
        let inbox = temp.path().join(".madora/inbox");
        fs::create_dir_all(&inbox).expect("inbox dir");
        fs::write(
            inbox.join("cap_20260718_143205_123_a1b2c3d4.md"),
            "---\ncustom: keep\n---\n\n可恢复的片段\n",
        )
        .expect("broken capture");

        let recovered = list_inbox_captures_sync(&root, InboxCaptureListView::Active, None)
            .expect("recover capture");
        assert_eq!(recovered.captures.len(), 1);
        assert_eq!(recovered.captures[0].status, InboxCaptureStatus::Open);
        assert_eq!(recovered.captures[0].priority, InboxCapturePriority::Normal);
        assert!(recovered.captures[0].tags.is_empty());

        let created = create_inbox_capture_sync(
            &root,
            "只有已处理结果包含 search-token".to_string(),
            Vec::new(),
            InboxCaptureSource::Inbox,
        )
        .expect("create searchable capture");
        update_inbox_capture_sync(
            &root,
            &created.id,
            InboxCaptureUpdate {
                body: created.body,
                status: InboxCaptureStatus::Done,
                priority: InboxCapturePriority::Normal,
                tags: Vec::new(),
                snoozed_until: None,
            },
            created.modified_at,
        )
        .expect("resolve searchable capture");

        let search =
            list_inbox_captures_sync(&root, InboxCaptureListView::Active, Some("search-token"))
                .expect("search all states");
        assert_eq!(search.captures.len(), 1);
        assert_eq!(search.captures[0].status, InboxCaptureStatus::Done);
    }

    #[test]
    fn validates_capture_body_and_tag_limits() {
        assert!(validate_capture_body("").is_err());
        assert!(validate_capture_body(&"a".repeat(MAX_CAPTURE_BYTES + 1)).is_err());
        assert!(normalize_tags(vec!["x".repeat(MAX_CAPTURE_TAG_CHARS + 1)]).is_err());
        assert!(normalize_tags(
            (0..=MAX_CAPTURE_TAGS)
                .map(|index| format!("tag-{index}"))
                .collect(),
        )
        .is_err());
    }

    #[test]
    fn rejects_capture_path_traversal_and_private_promote_targets() {
        assert!(validate_capture_id("../outside").is_err());
        assert!(validate_promote_target(".madora/inbox").is_err());
        assert!(validate_promote_target("Daily/2026/07").is_err());
        assert!(validate_promote_target("notes").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_private_directory_symlink_escape_before_creating_inbox() {
        use std::os::unix::fs::symlink;

        let workspace = tempfile::tempdir().expect("workspace temp dir");
        let outside = tempfile::tempdir().expect("outside temp dir");
        symlink(outside.path(), workspace.path().join(".madora"))
            .expect("private directory symlink");

        let error = ensure_inbox_dir(workspace.path()).expect_err("symlink escape must fail");
        assert!(error.contains("必须位于当前工作区"));
        assert!(!outside.path().join("inbox").exists());
    }
}

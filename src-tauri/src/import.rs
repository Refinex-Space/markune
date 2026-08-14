use crate::{
    assets::{
        cleanup_unreferenced_assets, resolve_workspace_asset_impl, store_workspace_asset_bytes_impl,
    },
    workspace::{create_imported_markdown_document, WorkspaceNode},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs::{self, File},
    io::Read,
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
use zip::ZipArchive;

const SOURCE_GRANT_TTL: Duration = Duration::from_secs(15 * 60);
const COMMIT_SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const MAX_SOURCE_FILES: usize = 20;
const MAX_SOURCE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_MARKDOWN_BYTES: usize = 20 * 1024 * 1024;
const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;
const MAX_DOCUMENT_ASSET_BYTES: u64 = 500 * 1024 * 1024;
const MAX_DOCUMENT_ASSETS: usize = 1_000;
const MAX_DOCX_ENTRIES: usize = 10_000;
const MAX_DOCX_UNCOMPRESSED_BYTES: u64 = 500 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO: u64 = 100;
const IMPORT_ASSET_PREFIX: &str = "markune-import://asset/";
const ASSET_URL_PREFIX: &str = "markune-asset://";
const LEGACY_ASSET_PREFIX: &str = ".markune/assets/files/";

#[derive(Clone, Default)]
pub struct ImportState {
    inner: Arc<ImportStateInner>,
}

#[derive(Default)]
struct ImportStateInner {
    source_grants: Mutex<HashMap<String, SourceGrant>>,
    commit_sessions: Mutex<HashMap<String, CommitSession>>,
}

#[derive(Clone)]
struct SourceGrant {
    expires_at: Instant,
    format: ImportSourceFormat,
    sources: HashMap<String, SourceEntry>,
}

#[derive(Clone)]
struct SourceEntry {
    file_name: String,
    modified_at: Option<SystemTime>,
    path: PathBuf,
    size: u64,
}

#[derive(Clone)]
struct CommitSession {
    assets: BTreeMap<String, ImportAssetManifest>,
    expires_at: Instant,
    markdown: String,
    root_path: String,
    staging_dir: PathBuf,
    target_dir: String,
    title: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ImportSourceFormat {
    Html,
    Markdown,
    Pdf,
    Word,
}

impl ImportSourceFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "html" => Ok(Self::Html),
            "markdown" => Ok(Self::Markdown),
            "pdf" => Ok(Self::Pdf),
            "word" => Ok(Self::Word),
            _ => Err("不支持的文档导入格式。".to_string()),
        }
    }

    fn picker_filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            Self::Html => ("HTML", &["html", "htm"]),
            Self::Markdown => ("Markdown", &["md", "markdown", "mdx"]),
            Self::Pdf => ("PDF", &["pdf"]),
            Self::Word => ("Word", &["docx"]),
        }
    }

    fn accepts_path(self, path: &Path) -> bool {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        match self {
            Self::Html => matches!(extension.as_str(), "html" | "htm"),
            Self::Markdown => matches!(extension.as_str(), "md" | "markdown" | "mdx"),
            Self::Pdf => extension == "pdf",
            Self::Word => extension == "docx",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImportGrant {
    grant_id: String,
    sources: Vec<DocumentImportSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentImportSource {
    file_name: String,
    format: String,
    size: u64,
    source_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAssetManifest {
    file_name: String,
    media_type: String,
    size: u64,
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentImportManifest {
    assets: Vec<ImportAssetManifest>,
    markdown: String,
    title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitSession {
    session_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocumentResult {
    node: WorkspaceNode,
    warnings: Vec<String>,
}

impl ImportState {
    fn issue_source_grant(
        &self,
        format: ImportSourceFormat,
        paths: Vec<PathBuf>,
    ) -> Result<DocumentImportGrant, String> {
        if paths.is_empty() {
            return Err("未选择导入文件。".to_string());
        }
        if paths.len() > MAX_SOURCE_FILES {
            return Err(format!("一次最多导入 {MAX_SOURCE_FILES} 个文件。"));
        }

        let mut sources = HashMap::new();
        let mut descriptors = Vec::with_capacity(paths.len());
        for path in paths {
            let path = path
                .canonicalize()
                .map_err(|_| "导入源文件不存在。".to_string())?;
            if !path.is_file() || !format.accepts_path(&path) {
                return Err("所选文件与导入格式不匹配。".to_string());
            }
            let metadata = fs::metadata(&path).map_err(|_| "无法读取导入源文件。".to_string())?;
            if metadata.len() == 0 {
                return Err("导入源文件为空。".to_string());
            }
            if metadata.len() > MAX_SOURCE_BYTES {
                return Err("导入源文件超过 100 MB 限制。".to_string());
            }
            validate_source_file(&path, format)?;

            let source_id = Uuid::new_v4().to_string();
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "导入源文件名不是有效 Unicode。".to_string())?
                .to_string();
            sources.insert(
                source_id.clone(),
                SourceEntry {
                    file_name: file_name.clone(),
                    modified_at: metadata.modified().ok(),
                    path,
                    size: metadata.len(),
                },
            );
            descriptors.push(DocumentImportSource {
                file_name,
                format: match format {
                    ImportSourceFormat::Html => "html",
                    ImportSourceFormat::Markdown => "markdown",
                    ImportSourceFormat::Pdf => "pdf",
                    ImportSourceFormat::Word => "word",
                }
                .to_string(),
                size: metadata.len(),
                source_id,
            });
        }

        let grant_id = Uuid::new_v4().to_string();
        let mut grants = self
            .inner
            .source_grants
            .lock()
            .map_err(|_| "导入源授权状态不可用。".to_string())?;
        grants.retain(|_, grant| grant.expires_at > Instant::now());
        grants.insert(
            grant_id.clone(),
            SourceGrant {
                expires_at: Instant::now() + SOURCE_GRANT_TTL,
                format,
                sources,
            },
        );

        Ok(DocumentImportGrant {
            grant_id,
            sources: descriptors,
        })
    }

    fn source_entry(&self, grant_id: &str, source_id: &str) -> Result<SourceEntry, String> {
        validate_uuid(grant_id, "导入源授权 ID")?;
        validate_uuid(source_id, "导入源文件 ID")?;
        let mut grants = self
            .inner
            .source_grants
            .lock()
            .map_err(|_| "导入源授权状态不可用。".to_string())?;
        grants.retain(|_, grant| grant.expires_at > Instant::now());
        let grant = grants
            .get(grant_id)
            .ok_or_else(|| "导入源授权已过期或不存在，请重新选择文件。".to_string())?;
        let source = grant
            .sources
            .get(source_id)
            .ok_or_else(|| "导入源文件不属于当前授权。".to_string())?
            .clone();
        revalidate_source(&source, grant.format)?;
        Ok(source)
    }

    fn begin_commit(
        &self,
        root_path: String,
        target_dir: String,
        manifest: DocumentImportManifest,
    ) -> Result<ImportCommitSession, String> {
        validate_manifest(&manifest)?;
        let root = canonical_workspace_root(&root_path)?;
        validate_target_directory(&root, &target_dir)?;
        cleanup_orphaned_staging_directories(&root)?;
        let session_id = Uuid::new_v4().to_string();
        let staging_dir = root
            .join(".markune")
            .join("import-staging")
            .join(&session_id);
        fs::create_dir_all(&staging_dir)
            .map_err(|error| format!("无法创建导入暂存目录：{error}"))?;
        let assets = manifest
            .assets
            .into_iter()
            .map(|asset| (asset.token.clone(), asset))
            .collect();
        let mut sessions = self
            .inner
            .commit_sessions
            .lock()
            .map_err(|_| "导入提交状态不可用。".to_string())?;
        cleanup_expired_sessions(&mut sessions);
        sessions.insert(
            session_id.clone(),
            CommitSession {
                assets,
                expires_at: Instant::now() + COMMIT_SESSION_TTL,
                markdown: manifest.markdown,
                root_path: root.to_string_lossy().to_string(),
                staging_dir,
                target_dir,
                title: manifest.title,
            },
        );

        Ok(ImportCommitSession { session_id })
    }

    fn session(&self, session_id: &str) -> Result<CommitSession, String> {
        validate_uuid(session_id, "导入提交会话 ID")?;
        let mut sessions = self
            .inner
            .commit_sessions
            .lock()
            .map_err(|_| "导入提交状态不可用。".to_string())?;
        cleanup_expired_sessions(&mut sessions);
        sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| "导入提交会话已过期或不存在。".to_string())
    }

    fn take_session(&self, session_id: &str) -> Result<CommitSession, String> {
        validate_uuid(session_id, "导入提交会话 ID")?;
        let mut sessions = self
            .inner
            .commit_sessions
            .lock()
            .map_err(|_| "导入提交状态不可用。".to_string())?;
        cleanup_expired_sessions(&mut sessions);
        sessions
            .remove(session_id)
            .ok_or_else(|| "导入提交会话已使用、过期或不存在。".to_string())
    }
}

#[tauri::command]
pub fn select_document_import_sources(
    app: AppHandle,
    state: State<'_, ImportState>,
    format: String,
) -> Result<Option<DocumentImportGrant>, String> {
    let format = ImportSourceFormat::parse(&format)?;
    let (label, extensions) = format.picker_filter();
    let selected = app
        .dialog()
        .file()
        .add_filter(label, extensions)
        .blocking_pick_files();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let paths = selected
        .into_iter()
        .map(|value| {
            value
                .into_path()
                .map_err(|_| "所选导入文件不是本地文件系统路径。".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;

    state.issue_source_grant(format, paths).map(Some)
}

#[tauri::command]
pub fn read_document_import_source(
    state: State<'_, ImportState>,
    grant_id: String,
    source_id: String,
) -> Result<Response, String> {
    let source = state.source_entry(&grant_id, &source_id)?;
    let bytes = fs::read(source.path).map_err(|_| "无法读取导入源文件。".to_string())?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn begin_document_import_commit(
    state: State<'_, ImportState>,
    root_path: String,
    target_dir: String,
    manifest: DocumentImportManifest,
) -> Result<ImportCommitSession, String> {
    state.begin_commit(root_path, target_dir, manifest)
}

#[tauri::command]
pub fn stage_document_import_asset(
    state: State<'_, ImportState>,
    request: Request<'_>,
) -> Result<(), String> {
    let session_id = read_header(&request, "x-markune-import-session")?;
    let asset_token = read_header(&request, "x-markune-import-asset")?;
    let session = state.session(&session_id)?;
    let manifest = session
        .assets
        .get(&asset_token)
        .ok_or_else(|| "导入资产不属于当前会话。".to_string())?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => return Err("导入资产必须使用二进制 IPC。".to_string()),
    };
    validate_staged_asset(manifest, &bytes)?;
    fs::write(session.staging_dir.join(&asset_token), bytes)
        .map_err(|error| format!("无法暂存导入资产：{error}"))
}

#[tauri::command]
pub fn stage_document_import_source_asset(
    state: State<'_, ImportState>,
    session_id: String,
    asset_token: String,
    grant_id: String,
    source_id: String,
    reference: String,
) -> Result<(), String> {
    let session = state.session(&session_id)?;
    let manifest = session
        .assets
        .get(&asset_token)
        .ok_or_else(|| "导入资产不属于当前会话。".to_string())?;
    let source = state.source_entry(&grant_id, &source_id)?;
    let asset_path = resolve_related_asset(&source, &reference)?;
    let bytes = fs::read(asset_path).map_err(|_| "无法读取关联图片。".to_string())?;
    validate_staged_asset(manifest, &bytes)?;
    fs::write(session.staging_dir.join(&asset_token), bytes)
        .map_err(|error| format!("无法暂存关联图片：{error}"))
}

#[tauri::command]
pub fn commit_document_import(
    state: State<'_, ImportState>,
    session_id: String,
) -> Result<ImportedDocumentResult, String> {
    let session = state.take_session(&session_id)?;
    let root = canonical_workspace_root(&session.root_path)?;
    validate_target_directory(&root, &session.target_dir)?;
    let mut markdown = session.markdown.clone();
    let mut newly_created_ids = BTreeSet::new();
    let mut staged_total = 0_u64;

    for (token, manifest) in &session.assets {
        let staged_path = session.staging_dir.join(token);
        let metadata = match fs::metadata(&staged_path) {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => {
                let _ = fs::remove_dir_all(&session.staging_dir);
                return Err(format!("导入资产未完整暂存：{}", manifest.file_name));
            }
        };
        staged_total = staged_total.saturating_add(metadata.len());
        if staged_total > MAX_DOCUMENT_ASSET_BYTES {
            let _ = fs::remove_dir_all(&session.staging_dir);
            return Err("导入文档图片总量超过 500 MB 限制。".to_string());
        }
    }

    for (token, manifest) in &session.assets {
        let staged_path = session.staging_dir.join(token);
        let bytes = match fs::read(&staged_path) {
            Ok(bytes) => bytes,
            Err(_) => {
                rollback_assets(&root, newly_created_ids);
                let _ = fs::remove_dir_all(&session.staging_dir);
                return Err(format!("导入资产未完整暂存：{}", manifest.file_name));
            }
        };
        if let Err(error) = validate_staged_asset(manifest, &bytes) {
            rollback_assets(&root, newly_created_ids);
            let _ = fs::remove_dir_all(&session.staging_dir);
            return Err(error);
        }
        let (uploaded, is_new) = match store_workspace_asset_bytes_impl(
            session.root_path.clone(),
            manifest.file_name.clone(),
            detect_image_media_type(&bytes)
                .unwrap_or(&manifest.media_type)
                .to_string(),
            bytes,
        ) {
            Ok(value) => value,
            Err(error) => {
                rollback_assets(&root, newly_created_ids);
                let _ = fs::remove_dir_all(&session.staging_dir);
                return Err(error);
            }
        };
        if is_new {
            newly_created_ids.insert(uploaded.id.clone());
        }
        markdown = markdown.replace(&format!("{IMPORT_ASSET_PREFIX}{token}"), &uploaded.url);
    }

    if markdown.contains(IMPORT_ASSET_PREFIX) {
        rollback_assets(&root, newly_created_ids);
        let _ = fs::remove_dir_all(&session.staging_dir);
        return Err("导入文档包含未声明的资产占位符。".to_string());
    }

    let created = create_imported_markdown_document(
        session.root_path.clone(),
        session.target_dir,
        session.title,
        markdown,
    );
    let _ = fs::remove_dir_all(&session.staging_dir);
    match created {
        Ok(created) => Ok(ImportedDocumentResult {
            node: created.node,
            warnings: Vec::new(),
        }),
        Err(error) => {
            rollback_assets(&root, newly_created_ids);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn cancel_document_import(
    state: State<'_, ImportState>,
    session_id: String,
) -> Result<(), String> {
    validate_uuid(&session_id, "导入提交会话 ID")?;
    let session = state
        .inner
        .commit_sessions
        .lock()
        .map_err(|_| "导入提交状态不可用。".to_string())?
        .remove(&session_id);
    if let Some(session) = session {
        fs::remove_dir_all(session.staging_dir)
            .map_err(|error| format!("无法清理导入暂存目录：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn release_document_import_grant(
    state: State<'_, ImportState>,
    grant_id: String,
) -> Result<(), String> {
    validate_uuid(&grant_id, "导入源授权 ID")?;
    state
        .inner
        .source_grants
        .lock()
        .map_err(|_| "导入源授权状态不可用。".to_string())?
        .remove(&grant_id);
    Ok(())
}

fn validate_source_file(path: &Path, format: ImportSourceFormat) -> Result<(), String> {
    match format {
        ImportSourceFormat::Pdf => {
            let mut file = File::open(path).map_err(|_| "无法读取 PDF 文件。".to_string())?;
            let mut signature = [0_u8; 5];
            file.read_exact(&mut signature)
                .map_err(|_| "PDF 文件头无效。".to_string())?;
            if &signature != b"%PDF-" {
                return Err("所选文件不是有效 PDF。".to_string());
            }
            Ok(())
        }
        ImportSourceFormat::Word => validate_docx(path),
        ImportSourceFormat::Html | ImportSourceFormat::Markdown => Ok(()),
    }
}

fn validate_docx(path: &Path) -> Result<(), String> {
    let file = File::open(path).map_err(|_| "无法读取 DOCX 文件。".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "所选文件不是有效 DOCX。".to_string())?;
    if archive.len() > MAX_DOCX_ENTRIES {
        return Err("DOCX 内部文件数量超过安全限制。".to_string());
    }
    let mut has_content_types = false;
    let mut has_document = false;
    let mut uncompressed_total = 0_u64;
    let mut compressed_total = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| "无法检查 DOCX 内部结构。".to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "DOCX 包含越界路径。".to_string())?;
        let name = enclosed.to_string_lossy().replace('\\', "/");
        has_content_types |= name == "[Content_Types].xml";
        has_document |= name == "word/document.xml";
        if name.eq_ignore_ascii_case("word/vbaProject.bin") {
            return Err("不支持包含宏的 Word 文档。".to_string());
        }
        uncompressed_total = uncompressed_total.saturating_add(entry.size());
        compressed_total = compressed_total.saturating_add(entry.compressed_size());
        if uncompressed_total > MAX_DOCX_UNCOMPRESSED_BYTES {
            return Err("DOCX 解压后内容超过安全限制。".to_string());
        }
    }
    if compressed_total > 0
        && uncompressed_total > compressed_total.saturating_mul(MAX_DOCX_COMPRESSION_RATIO)
    {
        return Err("DOCX 压缩比超过安全限制。".to_string());
    }
    if !has_content_types || !has_document {
        return Err("DOCX 缺少必要的 OOXML 文档结构。".to_string());
    }
    Ok(())
}

fn revalidate_source(source: &SourceEntry, format: ImportSourceFormat) -> Result<(), String> {
    let current = source
        .path
        .canonicalize()
        .map_err(|_| "导入源文件在授权后已不存在。".to_string())?;
    if current != source.path {
        return Err("导入源文件在授权后发生变化。".to_string());
    }
    let metadata = fs::metadata(&current).map_err(|_| "无法重新验证导入源文件。".to_string())?;
    if metadata.len() != source.size || metadata.modified().ok() != source.modified_at {
        return Err("导入源文件在授权后发生变化。".to_string());
    }
    validate_source_file(&current, format)
}

fn validate_manifest(manifest: &DocumentImportManifest) -> Result<(), String> {
    if manifest.title.trim().is_empty()
        || manifest.title.chars().count() > 200
        || manifest.title.chars().any(char::is_control)
    {
        return Err("导入文档标题为空、过长或包含控制字符。".to_string());
    }
    if manifest.markdown.is_empty() || manifest.markdown.len() > MAX_MARKDOWN_BYTES {
        return Err("导入 Markdown 为空或超过 20 MB 限制。".to_string());
    }
    if manifest.assets.len() > MAX_DOCUMENT_ASSETS {
        return Err("导入文档包含过多图片。".to_string());
    }
    let mut tokens = BTreeSet::new();
    let mut total = 0_u64;
    for asset in &manifest.assets {
        validate_asset_manifest(asset)?;
        if !tokens.insert(asset.token.as_str()) {
            return Err("导入资产 token 重复。".to_string());
        }
        if !manifest
            .markdown
            .contains(&format!("{IMPORT_ASSET_PREFIX}{}", asset.token))
        {
            return Err("导入资产未在 Markdown 中引用。".to_string());
        }
        total = total.saturating_add(asset.size);
    }
    if total > MAX_DOCUMENT_ASSET_BYTES {
        return Err("导入文档图片总量超过 500 MB 限制。".to_string());
    }
    for placeholder in collect_placeholders(&manifest.markdown) {
        if !tokens.contains(placeholder.as_str()) {
            return Err("Markdown 包含未声明的导入资产。".to_string());
        }
    }
    Ok(())
}

fn validate_asset_manifest(asset: &ImportAssetManifest) -> Result<(), String> {
    if asset.token.is_empty()
        || asset.token.len() > 64
        || !asset
            .token
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        return Err("导入资产 token 无效。".to_string());
    }
    let file_name = asset.file_name.trim();
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || matches!(file_name, "." | "..")
    {
        return Err("导入资产文件名无效。".to_string());
    }
    if !asset.media_type.starts_with("image/") {
        return Err("导入资产仅支持图片。".to_string());
    }
    if asset.size > MAX_ASSET_BYTES {
        return Err("导入图片超过 100 MB 限制。".to_string());
    }
    Ok(())
}

fn validate_staged_asset(manifest: &ImportAssetManifest, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("导入图片为空或超过 100 MB 限制。".to_string());
    }
    if manifest.size > 0 && manifest.size != bytes.len() as u64 {
        return Err("导入图片大小与清单不一致。".to_string());
    }
    let detected = detect_image_media_type(bytes)
        .ok_or_else(|| format!("无法识别图片格式：{}", manifest.file_name))?;
    if manifest.media_type != "image/unknown"
        && normalize_media_type(&manifest.media_type) != detected
    {
        return Err(format!("图片类型与内容不匹配：{}", manifest.file_name));
    }
    Ok(())
}

fn detect_image_media_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]);
    let text = text.trim_start_matches('\u{feff}').trim_start();
    if text.starts_with("<svg") || text.starts_with("<?xml") && text.contains("<svg") {
        return Some("image/svg+xml");
    }
    None
}

fn normalize_media_type(value: &str) -> &str {
    match value.to_ascii_lowercase().as_str() {
        "image/jpg" | "image/pjpeg" => "image/jpeg",
        "image/x-png" => "image/png",
        _ => value,
    }
}

fn resolve_related_asset(source: &SourceEntry, reference: &str) -> Result<PathBuf, String> {
    let reference = reference.trim().trim_matches(['<', '>']);
    if let Some(asset_id) = reference.strip_prefix(ASSET_URL_PREFIX) {
        let source_root = find_source_workspace_root(&source.path)
            .ok_or_else(|| "无法定位来源 Markune 工作区。".to_string())?;
        let resolved = resolve_workspace_asset_impl(
            source_root.to_string_lossy().to_string(),
            asset_id.to_string(),
        )?;
        return Ok(PathBuf::from(resolved.absolute_path));
    }

    let reference = reference
        .split(['?', '#'])
        .next()
        .unwrap_or(reference)
        .replace('\\', "/");
    let decoded = percent_decode(&reference)?;
    if decoded.starts_with(LEGACY_ASSET_PREFIX) {
        let source_root = find_source_workspace_root(&source.path)
            .ok_or_else(|| "无法定位旧资产所属工作区。".to_string())?;
        let path = source_root
            .join(&decoded)
            .canonicalize()
            .map_err(|_| "旧资产文件不存在。".to_string())?;
        let asset_root = source_root
            .join(".markune")
            .join("assets")
            .join("files")
            .canonicalize()
            .map_err(|_| "旧资产目录不存在。".to_string())?;
        if !path.starts_with(asset_root) || !path.is_file() {
            return Err("旧资产路径越界。".to_string());
        }
        return Ok(path);
    }
    if decoded.contains("://") || decoded.starts_with("data:") {
        return Err("远程或 data URI 图片不能按本地关联图片读取。".to_string());
    }
    let relative = Path::new(&decoded);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("关联图片路径越界。".to_string());
    }
    let parent = source
        .path
        .parent()
        .ok_or_else(|| "导入源文件目录无效。".to_string())?
        .canonicalize()
        .map_err(|_| "导入源文件目录不存在。".to_string())?;
    let path = parent
        .join(relative)
        .canonicalize()
        .map_err(|_| format!("关联图片不存在：{}", source.file_name))?;
    if !path.starts_with(&parent) || !path.is_file() {
        return Err("关联图片路径越界。".to_string());
    }
    Ok(path)
}

fn find_source_workspace_root(source: &Path) -> Option<PathBuf> {
    source.parent()?.ancestors().find_map(|ancestor| {
        ancestor
            .join(".markune")
            .join("assets")
            .join("index.json")
            .is_file()
            .then(|| ancestor.to_path_buf())
    })
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("图片路径包含无效百分号编码。".to_string());
            }
            let high = hex_value(bytes[index + 1])?;
            let low = hex_value(bytes[index + 2])?;
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| "图片路径不是有效 UTF-8。".to_string())
}

fn hex_value(value: u8) -> Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("图片路径包含无效百分号编码。".to_string()),
    }
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

fn validate_target_directory(root: &Path, target_dir: &str) -> Result<PathBuf, String> {
    let relative = Path::new(target_dir);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("导入目标目录越界。".to_string());
    }
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|_| "导入目标目录不存在。".to_string())?;
    if !target.starts_with(root) || !target.is_dir() {
        return Err("导入目标目录越界。".to_string());
    }
    Ok(target)
}

fn collect_placeholders(markdown: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut remaining = markdown;
    while let Some(index) = remaining.find(IMPORT_ASSET_PREFIX) {
        let after = &remaining[index + IMPORT_ASSET_PREFIX.len()..];
        let token = after
            .chars()
            .take_while(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
            .collect::<String>();
        if token.is_empty() {
            break;
        }
        tokens.push(token.clone());
        remaining = &after[token.len()..];
    }
    tokens
}

fn cleanup_expired_sessions(sessions: &mut HashMap<String, CommitSession>) {
    let expired = sessions
        .iter()
        .filter_map(|(id, session)| {
            (session.expires_at <= Instant::now())
                .then(|| (id.clone(), session.staging_dir.clone()))
        })
        .collect::<Vec<_>>();
    for (id, staging_dir) in expired {
        sessions.remove(&id);
        let _ = fs::remove_dir_all(staging_dir);
    }
}

fn cleanup_orphaned_staging_directories(root: &Path) -> Result<(), String> {
    let staging_root = root.join(".markune").join("import-staging");
    if !staging_root.exists() {
        return Ok(());
    }
    let now = SystemTime::now();
    let entries =
        fs::read_dir(&staging_root).map_err(|error| format!("无法检查导入暂存目录：{error}"))?;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let is_expired = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= COMMIT_SESSION_TTL);
        if metadata.is_dir() && is_expired {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
    Ok(())
}

fn rollback_assets(root: &Path, ids: BTreeSet<String>) {
    let _ = cleanup_unreferenced_assets(root, ids);
}

fn read_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| format!("缺少导入 IPC 头：{name}"))
}

fn validate_uuid(value: &str, label: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("{label} 无效。"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_manifest_placeholder() {
        let error = validate_manifest(&DocumentImportManifest {
            assets: Vec::new(),
            markdown: "![x](markune-import://asset/missing)".to_string(),
            title: "测试".to_string(),
        })
        .expect_err("未知占位符必须拒绝");

        assert_eq!(error, "Markdown 包含未声明的导入资产。");
    }

    #[test]
    fn detects_supported_image_signatures() {
        assert_eq!(
            detect_image_media_type(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(
            detect_image_media_type(b"\xff\xd8\xffrest"),
            Some("image/jpeg")
        );
        assert_eq!(
            detect_image_media_type(b"<svg xmlns='x'></svg>"),
            Some("image/svg+xml")
        );
        assert_eq!(detect_image_media_type(b"not-image"), None);
    }

    #[test]
    fn percent_decodes_relative_paths_without_accepting_invalid_sequences() {
        assert_eq!(
            percent_decode("images/%E5%9B%BE.png").unwrap(),
            "images/图.png"
        );
        assert!(percent_decode("images/%ZZ.png").is_err());
    }

    #[test]
    fn validates_pdf_signature() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("document.pdf");
        fs::write(&path, b"%PDF-1.7\n").unwrap();

        validate_source_file(&path, ImportSourceFormat::Pdf).unwrap();
        fs::write(&path, b"not-pdf").unwrap();
        assert!(validate_source_file(&path, ImportSourceFormat::Pdf).is_err());
    }

    #[test]
    fn rejects_forged_and_expired_source_grants() {
        let state = ImportState::default();
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("document.md");
        fs::write(&path, "# 测试").unwrap();
        let grant = state
            .issue_source_grant(ImportSourceFormat::Markdown, vec![path])
            .unwrap();
        let source_id = grant.sources[0].source_id.clone();

        assert!(state
            .source_entry(&Uuid::new_v4().to_string(), &source_id)
            .is_err());
        state
            .inner
            .source_grants
            .lock()
            .unwrap()
            .get_mut(&grant.grant_id)
            .unwrap()
            .expires_at = Instant::now() - Duration::from_secs(1);
        assert!(state.source_entry(&grant.grant_id, &source_id).is_err());
    }

    #[test]
    fn blocks_relative_asset_path_traversal_and_accepts_unicode_names() {
        let temp = tempfile::tempdir().unwrap();
        let source_dir = temp.path().join("source");
        fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("document.md");
        let image_path = source_dir.join("中文 图片.png");
        fs::write(&source_path, "# 测试").unwrap();
        fs::write(&image_path, b"\x89PNG\r\n\x1a\nrest").unwrap();
        let source = SourceEntry {
            file_name: "document.md".to_string(),
            modified_at: fs::metadata(&source_path).unwrap().modified().ok(),
            path: source_path.canonicalize().unwrap(),
            size: fs::metadata(&source_path).unwrap().len(),
        };

        assert_eq!(
            resolve_related_asset(&source, "%E4%B8%AD%E6%96%87%20%E5%9B%BE%E7%89%87.png").unwrap(),
            image_path.canonicalize().unwrap()
        );
        assert!(resolve_related_asset(&source, "../outside.png").is_err());
        assert!(resolve_related_asset(&source, "..\\outside.png").is_err());
    }

    #[test]
    fn rejects_unsafe_target_directories_and_title_control_characters() {
        let temp = tempfile::tempdir().unwrap();
        assert!(validate_target_directory(temp.path(), "../outside").is_err());
        let error = validate_manifest(&DocumentImportManifest {
            assets: Vec::new(),
            markdown: "# 测试".to_string(),
            title: "测试\n标题".to_string(),
        })
        .expect_err("控制字符标题必须拒绝");
        assert!(error.contains("控制字符"));
    }
}

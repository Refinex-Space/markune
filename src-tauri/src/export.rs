use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{
    http::{Request, Response, StatusCode},
    webview::PageLoadEvent,
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::document_converter::{self, DocumentExportRuntimeInfo, ProfessionalExportFormat};

const GRANT_TTL: Duration = Duration::from_secs(15 * 60);
const PDF_TIMEOUT: Duration = Duration::from_secs(30);
const EXPORT_STEM_PLACEHOLDER: &str = "__MARKUNE_EXPORT_STEM__";
const MAX_FILE_BYTES: usize = 200 * 1024 * 1024;
const MAX_BUNDLE_BYTES: usize = 500 * 1024 * 1024;
const MAX_PROFESSIONAL_MARKDOWN_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Default)]
pub struct ExportState {
    inner: Arc<ExportStateInner>,
}

#[derive(Default)]
struct ExportStateInner {
    grants: Mutex<HashMap<String, DirectoryGrant>>,
    pdf_sessions: Mutex<HashMap<String, String>>,
}

struct DirectoryGrant {
    directory: PathBuf,
    expires_at: Instant,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDirectoryGrant {
    grant_id: String,
    display_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentExportFile {
    base64_data: String,
    relative_path: String,
    role: ExportFileRole,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ExportFileRole {
    Asset,
    Primary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentExportResult {
    primary_path: String,
    created_paths: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BundleFormat {
    Html,
    Markdown,
    Word,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProfessionalBundleFormat {
    Pdf,
    Word,
}

impl ProfessionalBundleFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "pdf" => Ok(Self::Pdf),
            "word" => Ok(Self::Word),
            _ => Err("专业导出仅支持 PDF 或 Word。".to_string()),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Word => "docx",
        }
    }

    fn converter_format(self) -> ProfessionalExportFormat {
        match self {
            Self::Pdf => ProfessionalExportFormat::Pdf,
            Self::Word => ProfessionalExportFormat::Word,
        }
    }
}

impl BundleFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "html" => Ok(Self::Html),
            "markdown" => Ok(Self::Markdown),
            "word" => Ok(Self::Word),
            _ => Err("不支持的文档导出格式。".to_string()),
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Html => "html",
            Self::Markdown => "md",
            Self::Word => "docx",
        }
    }

    fn is_text(self) -> bool {
        matches!(self, Self::Html | Self::Markdown)
    }
}

impl ExportState {
    pub fn protocol_response(&self, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        let path_token = request
            .uri()
            .path()
            .trim_matches('/')
            .split('/')
            .next()
            .unwrap_or_default();
        let host_token = request.uri().host().unwrap_or_default();
        let (token, html) = self
            .inner
            .pdf_sessions
            .lock()
            .ok()
            .and_then(|mut sessions| {
                [path_token, host_token]
                    .into_iter()
                    .find_map(|candidate| sessions.remove(candidate).map(|html| (candidate, html)))
            })
            .unwrap_or_default();

        if html.is_empty() {
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("Content-Type", "text/plain; charset=utf-8")
                .header("Cache-Control", "no-store")
                .body(b"Export session not found.".to_vec())
                .expect("valid export protocol response")
        } else {
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "text/html; charset=utf-8")
                .header("Cache-Control", "no-store")
                .header(
                    "Content-Security-Policy",
                    format!("default-src 'none'; img-src data: https: http:; media-src data: https: http:; font-src data:; style-src 'unsafe-inline' 'nonce-{token}'; connect-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"),
                )
                .body(html.into_bytes())
                .expect("valid export protocol response")
        }
    }

    fn issue_grant(&self, directory: PathBuf) -> Result<ExportDirectoryGrant, String> {
        let directory = directory
            .canonicalize()
            .map_err(|error| format!("无法验证导出目录：{error}"))?;
        if !directory.is_dir() {
            return Err("选择的导出位置不是文件夹。".to_string());
        }

        let grant_id = Uuid::new_v4().to_string();
        let mut grants = self
            .inner
            .grants
            .lock()
            .map_err(|_| "导出目录授权状态不可用。".to_string())?;

        grants.retain(|_, grant| grant.expires_at > Instant::now());
        grants.insert(
            grant_id.clone(),
            DirectoryGrant {
                directory: directory.clone(),
                expires_at: Instant::now() + GRANT_TTL,
            },
        );

        Ok(ExportDirectoryGrant {
            grant_id,
            display_path: directory.to_string_lossy().into_owned(),
        })
    }

    fn take_grant(&self, grant_id: &str) -> Result<PathBuf, String> {
        if Uuid::parse_str(grant_id).is_err() {
            return Err("导出目录授权 ID 无效。".to_string());
        }

        let grant = self
            .inner
            .grants
            .lock()
            .map_err(|_| "导出目录授权状态不可用。".to_string())?
            .remove(grant_id)
            .ok_or_else(|| "导出目录授权已使用或不存在，请重新选择文件夹。".to_string())?;

        if grant.expires_at <= Instant::now() {
            return Err("导出目录授权已过期，请重新选择文件夹。".to_string());
        }

        let current = grant
            .directory
            .canonicalize()
            .map_err(|error| format!("无法重新验证导出目录：{error}"))?;
        if current != grant.directory || !current.is_dir() {
            return Err("导出目录在授权后发生变化，操作已拒绝。".to_string());
        }

        Ok(current)
    }

    fn add_pdf_session(&self, token: String, html: String) -> Result<(), String> {
        self.inner
            .pdf_sessions
            .lock()
            .map_err(|_| "PDF 会话状态不可用。".to_string())?
            .insert(token, html);
        Ok(())
    }

    fn remove_pdf_session(&self, token: &str) {
        if let Ok(mut sessions) = self.inner.pdf_sessions.lock() {
            sessions.remove(token);
        }
    }
}

#[tauri::command]
pub async fn select_document_export_directory(
    app: AppHandle,
    state: State<'_, ExportState>,
) -> Result<Option<ExportDirectoryGrant>, String> {
    let mut dialog = app.dialog().file();
    if let Ok(downloads) = app.path().download_dir() {
        if downloads.is_dir() {
            dialog = dialog.set_directory(downloads);
        }
    }

    let selected = dialog.blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|_| "所选导出目录不是本地文件系统路径。".to_string())?;

    state.issue_grant(selected).map(Some)
}

#[tauri::command]
pub async fn document_export_runtime_info(
    app: AppHandle,
) -> Result<DocumentExportRuntimeInfo, String> {
    tauri::async_runtime::spawn_blocking(move || document_converter::runtime_info(&app))
        .await
        .map_err(|error| format!("检查专业文档导出运行时失败：{error}"))
}

#[tauri::command]
pub async fn convert_document_export(
    app: AppHandle,
    state: State<'_, ExportState>,
    grant_id: String,
    format: String,
    file_stem: String,
    markdown: String,
    files: Vec<DocumentExportFile>,
) -> Result<DocumentExportResult, String> {
    let format = ProfessionalBundleFormat::parse(&format)?;
    let runtime =
        tauri::async_runtime::spawn_blocking(move || document_converter::resolve_runtime(&app))
            .await
            .map_err(|error| format!("检查专业文档导出运行时失败：{error}"))??;
    let directory = state.take_grant(&grant_id)?;

    tauri::async_runtime::spawn_blocking(move || {
        convert_professional_document(&directory, &runtime, format, &file_stem, &markdown, files)
    })
    .await
    .map_err(|error| format!("专业文档导出后台任务异常：{error}"))?
}

#[tauri::command]
pub fn write_document_export_bundle(
    state: State<'_, ExportState>,
    grant_id: String,
    format: String,
    file_stem: String,
    files: Vec<DocumentExportFile>,
) -> Result<DocumentExportResult, String> {
    let directory = state.take_grant(&grant_id)?;
    let format = BundleFormat::parse(&format)?;

    write_bundle(&directory, format, &file_stem, files)
}

#[tauri::command]
pub async fn print_document_pdf(
    app: AppHandle,
    state: State<'_, ExportState>,
    grant_id: String,
    file_stem: String,
    html: String,
) -> Result<DocumentExportResult, String> {
    let directory = state.take_grant(&grant_id)?;
    validate_file_stem(&file_stem)?;
    let actual_stem = choose_available_stem(&directory, &file_stem, "pdf", false)?;
    let staging = create_staging_directory(&directory)?;
    let staged_pdf = staging.join("document.pdf");
    let token = Uuid::new_v4().simple().to_string();
    let html = add_pdf_nonce(html, &token);

    state.add_pdf_session(token.clone(), html)?;
    let print_result = print_html_to_pdf(&app, &token, &staged_pdf).await;
    state.remove_pdf_session(&token);

    if let Err(error) = print_result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    let destination = directory.join(format!("{actual_stem}.pdf"));
    if let Err(error) = commit_staged_file(&staged_pdf, &destination) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&staging);

    Ok(DocumentExportResult {
        primary_path: destination.to_string_lossy().into_owned(),
        created_paths: vec![destination.to_string_lossy().into_owned()],
        warnings: Vec::new(),
    })
}

fn convert_professional_document(
    directory: &Path,
    runtime: &document_converter::DocumentConverterRuntime,
    format: ProfessionalBundleFormat,
    file_stem: &str,
    markdown: &str,
    files: Vec<DocumentExportFile>,
) -> Result<DocumentExportResult, String> {
    validate_file_stem(file_stem)?;
    validate_professional_input(markdown, &files)?;

    let actual_stem = choose_available_stem(directory, file_stem, format.extension(), false)?;
    let staging = create_staging_directory(directory)?;
    let source = staging.join("source.md");
    let output = staging.join(format!("document.{}", format.extension()));

    let result = (|| -> Result<Vec<String>, String> {
        let asset_root = staging.join("assets");
        fs::create_dir(&asset_root)
            .map_err(|error| format!("无法创建专业导出资源目录：{error}"))?;

        for file in files {
            let relative = validated_relative_path(&file.relative_path)?;
            let target = asset_root.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("无法创建专业导出资源子目录：{error}"))?;
            }
            ensure_parent_within(&staging, &target)?;
            let bytes = BASE64_STANDARD
                .decode(file.base64_data.as_bytes())
                .map_err(|error| format!("{} 的 base64 数据无效：{error}", file.relative_path))?;
            write_new_file(&target, &bytes)?;
        }

        let source_markdown = rewrite_professional_asset_paths(markdown);
        write_new_file(&source, source_markdown.as_bytes())?;
        document_converter::convert(
            runtime,
            format.converter_format(),
            &staging,
            &source,
            &output,
        )
    })();

    let warnings = match result {
        Ok(warnings) => warnings,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    let destination = directory.join(format!("{actual_stem}.{}", format.extension()));
    if let Err(error) = commit_staged_file(&output, &destination) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&staging);

    Ok(DocumentExportResult {
        primary_path: destination.to_string_lossy().into_owned(),
        created_paths: vec![destination.to_string_lossy().into_owned()],
        warnings,
    })
}

fn validate_professional_input(markdown: &str, files: &[DocumentExportFile]) -> Result<(), String> {
    if markdown.len() > MAX_PROFESSIONAL_MARKDOWN_BYTES {
        return Err("专业导出的 Markdown 超过 20 MB 限制。".to_string());
    }
    if markdown.contains('\0') {
        return Err("专业导出的 Markdown 包含无效空字符。".to_string());
    }

    files.iter().try_fold(0usize, |total, file| {
        if file.role != ExportFileRole::Asset {
            return Err("专业导出只接受资源文件，主文件由应用内部生成。".to_string());
        }
        validate_relative_path(&file.relative_path, file.role)?;
        let estimated = file.base64_data.len().saturating_mul(3) / 4;
        if estimated > MAX_FILE_BYTES {
            return Err(format!("导出文件过大：{}", file.relative_path));
        }
        total
            .checked_add(estimated)
            .filter(|value| *value <= MAX_BUNDLE_BYTES)
            .ok_or_else(|| "导出文件包超过 500 MB 限制。".to_string())
    })?;
    Ok(())
}

fn rewrite_professional_asset_paths(markdown: &str) -> String {
    markdown.replace(&format!("./{EXPORT_STEM_PLACEHOLDER}.assets/"), "assets/")
}

fn write_bundle(
    directory: &Path,
    format: BundleFormat,
    file_stem: &str,
    files: Vec<DocumentExportFile>,
) -> Result<DocumentExportResult, String> {
    validate_file_stem(file_stem)?;
    if files.is_empty() {
        return Err("导出文件包为空。".to_string());
    }

    let primary_count = files
        .iter()
        .filter(|file| file.role == ExportFileRole::Primary)
        .count();
    if primary_count != 1 {
        return Err("导出文件包必须且只能包含一个主文件。".to_string());
    }

    let total_encoded = files.iter().try_fold(0usize, |total, file| {
        validate_relative_path(&file.relative_path, file.role)?;
        let estimated = file.base64_data.len().saturating_mul(3) / 4;
        if estimated > MAX_FILE_BYTES {
            return Err(format!("导出文件过大：{}", file.relative_path));
        }
        total
            .checked_add(estimated)
            .filter(|value| *value <= MAX_BUNDLE_BYTES)
            .ok_or_else(|| "导出文件包超过 500 MB 限制。".to_string())
    })?;
    let _ = total_encoded;

    let has_assets = files.iter().any(|file| file.role == ExportFileRole::Asset);
    let actual_stem = choose_available_stem(directory, file_stem, format.extension(), has_assets)?;
    let staging = create_staging_directory(directory)?;
    let staged_primary = staging.join(format!("document.{}", format.extension()));
    let staged_assets = staging.join("assets");
    let encoded_stem = percent_encode_path_segment(&actual_stem);
    let mut staged_asset_paths = Vec::new();

    let stage_result = (|| -> Result<(), String> {
        for file in files {
            let mut bytes = BASE64_STANDARD
                .decode(file.base64_data.as_bytes())
                .map_err(|error| format!("{} 的 base64 数据无效：{error}", file.relative_path))?;

            if file.role == ExportFileRole::Primary {
                let extension = Path::new(&file.relative_path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                if !extension.eq_ignore_ascii_case(format.extension()) {
                    return Err("导出主文件扩展名与格式不匹配。".to_string());
                }

                if format.is_text() {
                    let text = String::from_utf8(bytes)
                        .map_err(|_| "HTML/Markdown 主文件必须是 UTF-8。".to_string())?;
                    bytes = text
                        .replace(EXPORT_STEM_PLACEHOLDER, &encoded_stem)
                        .into_bytes();
                }
                ensure_parent_within(&staging, &staged_primary)?;
                write_new_file(&staged_primary, &bytes)?;
            } else {
                let relative = validated_relative_path(&file.relative_path)?;
                let target = staged_assets.join(&relative);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("无法创建资源临时目录：{error}"))?;
                }
                ensure_parent_within(&staging, &target)?;
                write_new_file(&target, &bytes)?;
                staged_asset_paths.push(relative);
            }
        }
        Ok(())
    })();

    if let Err(error) = stage_result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    let destination_primary = directory.join(format!("{actual_stem}.{}", format.extension()));
    let destination_assets = directory.join(format!("{actual_stem}.assets"));
    let mut created_paths = Vec::new();
    let commit_result = (|| -> Result<(), String> {
        if has_assets {
            copy_directory_create_new(&staged_assets, &destination_assets)?;
            for relative in &staged_asset_paths {
                created_paths.push(
                    destination_assets
                        .join(relative)
                        .to_string_lossy()
                        .into_owned(),
                );
            }
        }

        if let Err(error) = commit_staged_file(&staged_primary, &destination_primary) {
            if has_assets {
                let _ = fs::remove_dir_all(&destination_assets);
            }
            return Err(error);
        }
        Ok(())
    })();

    let _ = fs::remove_dir_all(&staging);
    if let Err(error) = commit_result {
        return Err(error);
    }

    created_paths.insert(0, destination_primary.to_string_lossy().into_owned());
    Ok(DocumentExportResult {
        primary_path: destination_primary.to_string_lossy().into_owned(),
        created_paths,
        warnings: Vec::new(),
    })
}

fn validate_file_stem(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 120 {
        return Err("导出文件名为空或过长。".to_string());
    }
    if trimmed == "."
        || trimmed == ".."
        || trimmed.ends_with(['.', ' '])
        || trimmed
            .chars()
            .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err("导出文件名包含跨平台非法字符。".to_string());
    }

    let normalized = trimmed.to_ascii_lowercase();
    let device_name = normalized.split('.').next().unwrap_or_default();
    let numbered_device = device_name
        .strip_prefix("com")
        .or_else(|| device_name.strip_prefix("lpt"))
        .and_then(|suffix| suffix.parse::<u8>().ok())
        .is_some_and(|number| (1..=9).contains(&number));
    let reserved = matches!(device_name, "con" | "prn" | "aux" | "nul") || numbered_device;
    if reserved {
        return Err("导出文件名是 Windows 保留名称。".to_string());
    }
    Ok(())
}

fn validate_relative_path(value: &str, role: ExportFileRole) -> Result<(), String> {
    let path = validated_relative_path(value)?;
    if role == ExportFileRole::Primary && path.components().count() != 1 {
        return Err("导出主文件必须位于文件包根目录。".to_string());
    }
    Ok(())
}

fn validated_relative_path(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() {
        return Err("导出相对路径为空。".to_string());
    }

    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("导出相对路径不安全：{value}"));
    }

    for component in path.components() {
        let Component::Normal(name) = component else {
            return Err(format!("导出相对路径不安全：{value}"));
        };
        let name = name
            .to_str()
            .ok_or_else(|| format!("导出路径不是有效 Unicode：{value}"))?;
        validate_path_component(name)?;
    }
    Ok(path.to_path_buf())
}

fn validate_path_component(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.ends_with(['.', ' '])
        || value
            .chars()
            .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err(format!("导出路径包含跨平台非法文件名：{value}"));
    }

    let normalized = value.to_ascii_lowercase();
    let device_name = normalized.split('.').next().unwrap_or_default();
    let numbered_device = device_name
        .strip_prefix("com")
        .or_else(|| device_name.strip_prefix("lpt"))
        .and_then(|suffix| suffix.parse::<u8>().ok())
        .is_some_and(|number| (1..=9).contains(&number));
    if matches!(device_name, "con" | "prn" | "aux" | "nul") || numbered_device {
        return Err(format!("导出路径包含 Windows 保留文件名：{value}"));
    }
    Ok(())
}

fn choose_available_stem(
    directory: &Path,
    requested: &str,
    extension: &str,
    has_assets: bool,
) -> Result<String, String> {
    for suffix in 0..10_000 {
        let candidate = if suffix == 0 {
            requested.to_string()
        } else {
            format!("{requested} ({suffix})")
        };
        let primary = directory.join(format!("{candidate}.{extension}"));
        let assets = directory.join(format!("{candidate}.assets"));
        if !primary.exists() && (!has_assets || !assets.exists()) {
            return Ok(candidate);
        }
    }

    Err("同名导出文件过多，无法生成可用文件名。".to_string())
}

fn create_staging_directory(directory: &Path) -> Result<PathBuf, String> {
    let staging = directory.join(format!(".markune-export-{}", Uuid::new_v4().simple()));
    fs::create_dir(&staging).map_err(|error| format!("无法创建导出临时目录：{error}"))?;
    Ok(staging)
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("无法创建导出文件 {}：{error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("无法写入导出文件 {}：{error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("无法同步导出文件 {}：{error}", path.display()))
}

fn ensure_parent_within(root: &Path, target: &Path) -> Result<(), String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("无法验证导出临时目录：{error}"))?;
    let canonical_parent = target
        .parent()
        .ok_or_else(|| "导出目标缺少父目录。".to_string())?
        .canonicalize()
        .map_err(|error| format!("无法验证导出目标父目录：{error}"))?;

    if canonical_parent != canonical_root && !canonical_parent.starts_with(&canonical_root) {
        return Err("导出目标尝试通过符号链接逃逸临时目录。".to_string());
    }
    Ok(())
}

fn commit_staged_file(source: &Path, destination: &Path) -> Result<(), String> {
    let mut input = File::open(source).map_err(|error| format!("无法读取导出临时文件：{error}"))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format!("无法创建导出文件 {}：{error}", destination.display()))?;

    if let Err(error) = std::io::copy(&mut input, &mut output) {
        drop(output);
        let _ = fs::remove_file(destination);
        return Err(format!(
            "无法提交导出文件 {}：{error}",
            destination.display()
        ));
    }
    if let Err(error) = output.sync_all() {
        drop(output);
        let _ = fs::remove_file(destination);
        return Err(format!(
            "无法同步导出文件 {}：{error}",
            destination.display()
        ));
    }
    Ok(())
}

fn copy_directory_create_new(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir(destination)
        .map_err(|error| format!("无法创建导出资源目录 {}：{error}", destination.display()))?;

    let result = copy_directory_contents(source, destination);
    if result.is_err() {
        let _ = fs::remove_dir_all(destination);
    }
    result
}

fn copy_directory_contents(source: &Path, destination: &Path) -> Result<(), String> {
    for entry in
        fs::read_dir(source).map_err(|error| format!("无法读取导出资源临时目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取导出资源：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法验证导出资源类型：{error}"))?;
        let target = destination.join(entry.file_name());

        if file_type.is_symlink() {
            return Err("导出临时目录包含符号链接，操作已拒绝。".to_string());
        }
        if file_type.is_dir() {
            fs::create_dir(&target).map_err(|error| format!("无法创建导出资源子目录：{error}"))?;
            copy_directory_contents(&entry.path(), &target)?;
        } else if file_type.is_file() {
            commit_staged_file(&entry.path(), &target)?;
        } else {
            return Err("导出资源包含不支持的文件类型。".to_string());
        }
    }
    Ok(())
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn add_pdf_nonce(mut html: String, nonce: &str) -> String {
    html = html.replacen("<style>", &format!("<style nonce=\"{nonce}\">"), 1);
    html.replacen(
        "style-src 'unsafe-inline'",
        &format!("style-src 'unsafe-inline' 'nonce-{nonce}'"),
        1,
    )
}

async fn print_html_to_pdf(app: &AppHandle, token: &str, output: &Path) -> Result<(), String> {
    let label = format!("markune-export-{token}");
    let url = Url::parse(&format!("markune-export://localhost/{token}/document"))
        .map_err(|error| format!("无法创建 PDF 内部页面地址：{error}"))?;
    let (load_tx, load_rx) = std::sync::mpsc::sync_channel::<()>(1);
    let load_tx = Arc::new(Mutex::new(Some(load_tx)));
    let load_signal = load_tx.clone();
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::CustomProtocol(url))
        .title("Markune Export")
        .inner_size(794.0, 1123.0)
        .visible(false)
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                if let Ok(mut sender) = load_signal.lock() {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(());
                    }
                }
            }
        })
        .build()
        .map_err(|error| format!("无法创建 PDF 隐藏渲染窗口：{error}"))?;

    let loaded = tauri::async_runtime::spawn_blocking(move || load_rx.recv_timeout(PDF_TIMEOUT))
        .await
        .map_err(|error| format!("等待 PDF 页面时任务异常：{error}"))?;
    if loaded.is_err() {
        let _ = window.close();
        return Err("PDF 页面加载超时。".to_string());
    }

    let print_result = print_webview_pdf(&window, output).await;
    let _ = window.close();
    print_result
}

#[cfg(windows)]
async fn print_webview_pdf(window: &WebviewWindow, output: &Path) -> Result<(), String> {
    use webview2_com::{
        CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::*, PrintToPdfCompletedHandler,
    };
    use windows_core::Interface;

    let output = output.to_string_lossy().into_owned();
    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                let controller = webview.controller();
                let environment: ICoreWebView2Environment6 = webview
                    .environment()
                    .cast()
                    .map_err(|error| format!("WebView2 不支持打印设置：{error}"))?;
                let core: ICoreWebView2_7 = unsafe { controller.CoreWebView2() }
                    .and_then(|core| core.cast())
                    .map_err(|error| format!("WebView2 不支持静默 PDF：{error}"))?;
                let settings = unsafe { environment.CreatePrintSettings() }
                    .map_err(|error| format!("无法创建 WebView2 打印设置：{error}"))?;

                (|| -> windows_core::Result<()> {
                    unsafe {
                        settings.SetPageWidth(8.267_716_5)?;
                        settings.SetPageHeight(11.692_913)?;
                        settings.SetMarginTop(0.0)?;
                        settings.SetMarginBottom(0.0)?;
                        settings.SetMarginLeft(0.0)?;
                        settings.SetMarginRight(0.0)?;
                        settings.SetScaleFactor(1.0)?;
                        settings.SetShouldPrintBackgrounds(true)?;
                        settings.SetShouldPrintHeaderAndFooter(false)?;
                    }
                    Ok(())
                })()
                .map_err(|error| format!("无法配置 WebView2 打印设置：{error}"))?;

                let callback_tx = tx.clone();
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |error, success| {
                        let result = match (error, success) {
                            (Ok(()), true) => Ok(()),
                            (Ok(()), false) => Err("WebView2 未生成 PDF 文件。".to_string()),
                            (Err(error), _) => Err(format!("WebView2 PDF 打印失败：{error}")),
                        };
                        let _ = callback_tx.send(result);
                        Ok(())
                    }));
                let output_wide = CoTaskMemPWSTR::from(output.as_str());
                unsafe { core.PrintToPdf(*output_wide.as_ref().as_pcwstr(), &settings, &handler) }
                    .map_err(|error| format!("无法启动 WebView2 PDF 打印：{error}"))?;
                Ok(())
            })();

            if let Err(error) = result {
                let _ = tx.send(Err(error));
            }
        })
        .map_err(|error| format!("无法访问 WebView2 打印接口：{error}"))?;

    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(PDF_TIMEOUT))
        .await
        .map_err(|error| format!("等待 PDF 打印时任务异常：{error}"))?
        .map_err(|_| "PDF 打印超时。".to_string())?
}

#[cfg(target_os = "macos")]
mod macos_pdf_print {
    use std::{ffi::c_void, sync::mpsc::SyncSender};

    use objc2::{
        define_class, msg_send, rc::Retained, runtime::Bool, DefinedClass, MainThreadOnly,
    };
    use objc2_app_kit::NSPrintOperation;
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

    pub(super) struct PdfPrintDelegateIvars {
        sender: SyncSender<Result<(), String>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[ivars = PdfPrintDelegateIvars]
        pub(super) struct PdfPrintDelegate;

        impl PdfPrintDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn print_operation_did_run(
                &self,
                _operation: &NSPrintOperation,
                success: Bool,
                context_info: *mut c_void,
            ) {
                let result = if success.as_bool() {
                    Ok(())
                } else {
                    Err("WKWebView 未生成 PDF 文件。".to_string())
                };
                let _ = self.ivars().sender.send(result);

                if !context_info.is_null() {
                    // SAFETY: `context_info` comes from `Retained::into_raw` below and the
                    // print operation invokes this completion selector at most once.
                    drop(unsafe { Retained::<Self>::from_raw(context_info.cast()) });
                }
            }
        }

        unsafe impl NSObjectProtocol for PdfPrintDelegate {}
    );

    impl PdfPrintDelegate {
        pub(super) fn new(
            sender: SyncSender<Result<(), String>>,
            mtm: MainThreadMarker,
        ) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(PdfPrintDelegateIvars { sender });
            // SAFETY: `NSObject` implements `init` with this signature.
            unsafe { msg_send![super(this), init] }
        }
    }
}

#[cfg(target_os = "macos")]
async fn print_webview_pdf(window: &WebviewWindow, output: &Path) -> Result<(), String> {
    use macos_pdf_print::PdfPrintDelegate;
    use objc2::{msg_send, rc::Retained, runtime::AnyObject};
    use objc2_app_kit::{NSPrintHeaderAndFooter, NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
    use objc2_foundation::{MainThreadMarker, NSCopying, NSNumber, NSSize, NSString, NSURL};

    let output = output.to_string_lossy().into_owned();
    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                unsafe {
                    let view: &objc2_web_kit::WKWebView = &*webview.inner().cast();
                    let mtm = MainThreadMarker::new()
                        .ok_or_else(|| "WKWebView PDF 打印未运行在主线程。".to_string())?;
                    let print_info = NSPrintInfo::sharedPrintInfo().copy();
                    print_info.setPaperSize(NSSize::new(595.275_6, 841.889_8));
                    print_info.setTopMargin(0.0);
                    print_info.setBottomMargin(0.0);
                    print_info.setLeftMargin(0.0);
                    print_info.setRightMargin(0.0);
                    print_info.setJobDisposition(NSPrintSaveJob);
                    let dictionary = print_info.dictionary();
                    let path = NSString::from_str(&output);
                    let url = NSURL::fileURLWithPath(&path);
                    let hide_headers_and_footers = NSNumber::new_bool(false);

                    let _: () =
                        msg_send![&*dictionary, setObject: &*url, forKey: NSPrintJobSavingURL];
                    let _: () = msg_send![
                        &*dictionary,
                        setObject: &*hide_headers_and_footers,
                        forKey: NSPrintHeaderAndFooter
                    ];
                    let operation = view.printOperationWithPrintInfo(&print_info);
                    operation.setShowsPrintPanel(false);
                    operation.setShowsProgressPanel(false);
                    operation.setCanSpawnSeparateThread(true);

                    let window = view
                        .window()
                        .ok_or_else(|| "WKWebView PDF 打印窗口不可用。".to_string())?;
                    let delegate = PdfPrintDelegate::new(tx.clone(), mtm);
                    let delegate_ptr = Retained::into_raw(delegate);
                    let delegate_object = &*delegate_ptr.cast::<AnyObject>();
                    operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                        &window,
                        Some(delegate_object),
                        Some(objc2::sel!(printOperationDidRun:success:contextInfo:)),
                        delegate_ptr.cast(),
                    );
                    Ok(())
                }
            })();
            if let Err(error) = result {
                let _ = tx.send(Err(error));
            }
        })
        .map_err(|error| format!("无法访问 WKWebView 打印接口：{error}"))?;

    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(PDF_TIMEOUT))
        .await
        .map_err(|error| format!("等待 PDF 打印时任务异常：{error}"))?
        .map_err(|_| "PDF 打印超时。".to_string())?
}

#[cfg(not(any(windows, target_os = "macos")))]
async fn print_webview_pdf(_window: &WebviewWindow, _output: &Path) -> Result<(), String> {
    Err("当前平台暂不支持原生 PDF 导出。".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn primary(format: &str, content: &str) -> DocumentExportFile {
        DocumentExportFile {
            base64_data: BASE64_STANDARD.encode(content.as_bytes()),
            relative_path: format!("note.{format}"),
            role: ExportFileRole::Primary,
        }
    }

    #[test]
    fn rejects_path_traversal() {
        assert!(validated_relative_path("../secret.txt").is_err());
        assert!(validated_relative_path("/tmp/secret.txt").is_err());
        assert!(validated_relative_path("assets/bad:name.png").is_err());
        assert!(validated_relative_path("assets/CON.txt").is_err());
        assert!(validated_relative_path("assets/image.png").is_ok());
    }

    #[test]
    fn removes_staging_files_when_bundle_generation_fails() {
        let directory = tempdir().unwrap();
        let result = write_bundle(
            directory.path(),
            BundleFormat::Html,
            "document",
            vec![
                primary("html", "<p>content</p>"),
                DocumentExportFile {
                    base64_data: "not base64".to_string(),
                    relative_path: "broken.bin".to_string(),
                    role: ExportFileRole::Asset,
                },
            ],
        );

        assert!(result.is_err());
        assert!(fs::read_dir(directory.path()).unwrap().next().is_none());
    }

    #[test]
    fn generates_non_overwriting_suffix_and_rewrites_asset_stem() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("文档.md"), "existing").unwrap();
        let result = write_bundle(
            directory.path(),
            BundleFormat::Markdown,
            "文档",
            vec![
                primary("md", "![图](./__MARKUNE_EXPORT_STEM__.assets/image.png)"),
                DocumentExportFile {
                    base64_data: BASE64_STANDARD.encode(b"png"),
                    relative_path: "image.png".to_string(),
                    role: ExportFileRole::Asset,
                },
            ],
        )
        .unwrap();

        assert!(result.primary_path.ends_with("文档 (1).md"));
        assert_eq!(
            fs::read_to_string(directory.path().join("文档 (1).md")).unwrap(),
            "![图](./%E6%96%87%E6%A1%A3%20%281%29.assets/image.png)"
        );
        assert_eq!(
            fs::read(directory.path().join("文档 (1).assets/image.png")).unwrap(),
            b"png"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("文档.md")).unwrap(),
            "existing"
        );
    }

    #[test]
    fn grant_is_single_use_and_expires() {
        let directory = tempdir().unwrap();
        let state = ExportState::default();
        let issued = state.issue_grant(directory.path().to_path_buf()).unwrap();

        assert!(state.take_grant(&issued.grant_id).is_ok());
        assert!(state.take_grant(&issued.grant_id).is_err());

        let expired_id = Uuid::new_v4().to_string();
        state.inner.grants.lock().unwrap().insert(
            expired_id.clone(),
            DirectoryGrant {
                directory: directory.path().canonicalize().unwrap(),
                expires_at: Instant::now() - Duration::from_secs(1),
            },
        );
        assert!(state.take_grant(&expired_id).is_err());
    }

    #[test]
    fn rejects_unknown_bundle_format() {
        assert!(BundleFormat::parse("pdf").is_err());
        assert!(BundleFormat::parse("image").is_err());
        assert_eq!(
            ProfessionalBundleFormat::parse("pdf").unwrap(),
            ProfessionalBundleFormat::Pdf
        );
        assert_eq!(
            ProfessionalBundleFormat::parse("word").unwrap(),
            ProfessionalBundleFormat::Word
        );
        assert!(ProfessionalBundleFormat::parse("html").is_err());
    }

    #[test]
    fn professional_input_only_accepts_bounded_assets() {
        let asset = DocumentExportFile {
            base64_data: BASE64_STANDARD.encode(b"png"),
            relative_path: "diagram.png".to_string(),
            role: ExportFileRole::Asset,
        };
        assert!(validate_professional_input("# Document", &[asset]).is_ok());

        let primary = primary("md", "# Document");
        assert!(validate_professional_input("# Document", &[primary]).is_err());
        assert!(validate_professional_input("invalid\0markdown", &[]).is_err());
    }

    #[test]
    fn professional_export_rewrites_only_the_internal_asset_placeholder() {
        let markdown = concat!(
            "![local](./__MARKUNE_EXPORT_STEM__.assets/image.png)\n",
            "![other](./other.assets/image.png)"
        );
        assert_eq!(
            rewrite_professional_asset_paths(markdown),
            "![local](assets/image.png)\n![other](./other.assets/image.png)"
        );
    }

    #[test]
    fn pdf_session_is_one_time() {
        let state = ExportState::default();
        state
            .add_pdf_session("token".to_string(), "<html></html>".to_string())
            .unwrap();
        let request = Request::builder()
            .uri("markune-export://localhost/token/document")
            .body(Vec::new())
            .unwrap();

        assert_eq!(state.protocol_response(&request).status(), StatusCode::OK);
        assert_eq!(
            state.protocol_response(&request).status(),
            StatusCode::NOT_FOUND
        );
    }
}

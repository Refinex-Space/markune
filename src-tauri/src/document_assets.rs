use crate::{
    assets,
    settings::{read_app_settings, AttachmentStorageSettings},
    workspace,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::ToSocketAddrs,
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: usize = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentAssetInput {
    pub kind: String,
    pub source_type: String,
    pub value: Option<String>,
    pub file_name: Option<String>,
    pub media_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocumentAsset {
    pub src: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAssetResolution {
    pub src: String,
    pub absolute_path: Option<String>,
}

fn grant_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::settings::settings_path(app)?.with_file_name("attachment-folders.json"))
}

fn authorized_folders(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let path = grant_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_slice(&fs::read(path).map_err(|_| "无法读取附件目录授权".to_string())?)
        .map_err(|_| "附件目录授权格式损坏".into())
}

#[tauri::command]
pub async fn select_attachment_directory(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    app.dialog()
        .file()
        .set_title("选择附件目录")
        .pick_folder(move |path| {
            let _ = tx.try_send(path);
        });
    let Some(selected) = rx.recv().await.flatten() else {
        return Ok(None);
    };
    let folder = selected
        .into_path()
        .map_err(|_| "请选择本地目录".to_string())?
        .canonicalize()
        .map_err(|_| "无法读取所选目录".to_string())?;
    let mut folders = authorized_folders(&app)?;
    if !folders.contains(&folder) {
        folders.push(folder.clone());
    }
    if folders.len() > 128 {
        return Err("已授权附件目录过多".into());
    }
    let path = grant_path(&app)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|_| "无法保存目录授权".to_string())?;
    workspace::write_text_atomic(
        &path,
        &serde_json::to_string(&folders).map_err(|_| "无法保存目录授权".to_string())?,
    )
    .map_err(|_| "无法保存目录授权".to_string())?;
    Ok(Some(folder.to_string_lossy().into_owned()))
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                if !result.pop() {
                    return Err("附件路径超出目录边界".into());
                }
            }
            Component::CurDir => {}
            _ => result.push(part.as_os_str()),
        }
    }
    Ok(result)
}

fn is_private_path(path: &Path) -> bool {
    path.components().any(|part| matches!(part, Component::Normal(name)
        if name.to_string_lossy().eq_ignore_ascii_case(".markune") || name.to_string_lossy().eq_ignore_ascii_case(".git")))
}

fn authorized(path: &Path, root: &Path, grants: &[PathBuf]) -> bool {
    !is_private_path(path)
        && (path.starts_with(root) || grants.iter().any(|grant| path.starts_with(grant)))
}

fn safe_directory(path: &Path, root: &Path, grants: &[PathBuf]) -> Result<PathBuf, String> {
    let path = normalize_path(path)?;
    if is_private_path(&path) {
        return Err("不能将附件保存到应用私有目录".into());
    }
    let mut existing = path.clone();
    let mut missing = Vec::new();
    while !existing.exists() {
        missing.push(existing.file_name().ok_or("附件目录无效")?.to_os_string());
        if !existing.pop() {
            return Err("附件目录无效".into());
        }
    }
    let mut canonical = existing
        .canonicalize()
        .map_err(|_| "无法读取附件目录".to_string())?;
    if !authorized(&canonical, root, grants) {
        return Err("附件目录指向未授权位置".into());
    }
    for name in missing.iter().rev() {
        canonical.push(name);
        if !canonical.exists() {
            fs::create_dir(&canonical).map_err(|_| "无法创建附件目录".to_string())?;
        }
        let next = canonical
            .canonicalize()
            .map_err(|_| "无法读取附件目录".to_string())?;
        if next != canonical || !authorized(&next, root, grants) {
            return Err("附件目录包含不安全的符号链接".into());
        }
    }
    if !canonical.is_dir() {
        return Err("附件目标不是目录".into());
    }
    Ok(canonical)
}

pub(crate) fn reference_path(document: &Path, source: &str) -> Result<PathBuf, String> {
    if source
        .get(..5)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("file:"))
    {
        return reqwest::Url::parse(source)
            .ok()
            .and_then(|url| url.to_file_path().ok())
            .ok_or("本地文件地址无效".into());
    }
    let has_scheme = source.split_once(':').is_some_and(|(scheme, tail)| {
        scheme
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c))
            && !(scheme.len() == 1 && (tail.starts_with('/') || tail.starts_with('\\')))
    });
    if has_scheme || source.starts_with('#') || source.starts_with("//") || source.is_empty() {
        return Err("不是本地文件引用".into());
    }
    let decoded = percent_decode(source.split(['?', '#']).next().unwrap_or(source))?;
    let raw = PathBuf::from(decoded.replace('\\', "/"));
    normalize_path(&if raw.is_absolute() {
        raw
    } else {
        document.parent().ok_or("文档目录无效")?.join(raw)
    })
}

fn percent_decode(value: &str) -> Result<String, String> {
    let mut bytes = Vec::new();
    let raw = value.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' {
            if i + 2 >= raw.len() {
                return Err("文件路径编码无效".into());
            }
            let hex = std::str::from_utf8(&raw[i + 1..i + 3]).map_err(|_| "文件路径编码无效")?;
            bytes.push(u8::from_str_radix(hex, 16).map_err(|_| "文件路径编码无效")?);
            i += 3;
        } else {
            bytes.push(raw[i]);
            i += 1;
        }
    }
    String::from_utf8(bytes).map_err(|_| "文件路径编码无效".into())
}

pub(crate) fn path_reference(
    document: &Path,
    file: &Path,
    relative: bool,
    dot: bool,
) -> Result<String, String> {
    let parent = document.parent().ok_or("文档目录无效")?;
    if relative {
        let from: Vec<_> = parent.components().collect();
        let to: Vec<_> = file.components().collect();
        if from.first() == to.first() {
            let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
            let mut parts = vec!["..".to_string(); from.len() - common];
            parts.extend(
                to[common..]
                    .iter()
                    .map(|p| p.as_os_str().to_string_lossy().into_owned()),
            );
            let mut result = encode_path(&parts.join("/"));
            if dot && !result.starts_with("../") {
                result = format!("./{result}");
            }
            return Ok(result);
        }
    }
    reqwest::Url::from_file_path(file)
        .map(|url| url.to_string())
        .map_err(|_| "无法生成文件地址".into())
}

fn encode_path(value: &str) -> String {
    value
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

fn safe_name(name: &str) -> String {
    let name: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(120)
        .collect();
    let name = name.trim_matches([' ', '.']);
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() {
        "attachment.bin".into()
    } else if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len() == 4
    {
        format!("_{name}")
    } else {
        name.to_string()
    }
}

fn target_directory(
    document: &Path,
    settings: &AttachmentStorageSettings,
) -> Result<PathBuf, String> {
    let parent = document.parent().ok_or("文档目录无效")?;
    let filename = document
        .file_stem()
        .and_then(|n| n.to_str())
        .ok_or("文档名称无效")?;
    Ok(match settings.mode.as_str() {
        "document" => parent.to_path_buf(),
        "assets" => parent.join("assets"),
        "filename-assets" => parent.join(format!("{filename}.assets")),
        "custom" => {
            let value = settings.custom_path.replace("${filename}", filename);
            if value.contains("${") || value.trim().is_empty() {
                return Err("附件路径仅支持 ${filename} 变量".into());
            }
            #[cfg(not(windows))]
            if value.as_bytes().get(1) == Some(&b':')
                && value
                    .as_bytes()
                    .get(2)
                    .is_some_and(|c| *c == b'/' || *c == b'\\')
            {
                return Err("当前系统不支持该绝对路径，请重新选择目录".into());
            }
            let path = PathBuf::from(value);
            if path.is_absolute() {
                path
            } else {
                parent.join(path)
            }
        }
        _ => return Err("附件存储方式无效".into()),
    })
}

fn store_bytes(
    root: &Path,
    document: &Path,
    settings: &AttachmentStorageSettings,
    grants: &[PathBuf],
    name: String,
    mime: String,
    bytes: Vec<u8>,
) -> Result<StoredDocumentAsset, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("附件为空或超过 100 MB".into());
    }
    if settings.mode == "managed" {
        let (asset, _) = assets::store_workspace_asset_bytes_impl(
            root.to_string_lossy().into_owned(),
            name,
            mime,
            bytes,
        )?;
        return Ok(StoredDocumentAsset {
            src: asset.url,
            name: asset.name,
            mime_type: asset.media_type,
            size: asset.size,
        });
    }
    let folder = safe_directory(&target_directory(document, settings)?, root, grants)?;
    let name = safe_name(&name);
    let path = Path::new(&name);
    let stem = path
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("attachment");
    let extension = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|v| format!(".{v}"))
        .unwrap_or_default();
    for suffix in 0..10_000 {
        let candidate = folder.join(if suffix == 0 {
            name.clone()
        } else {
            format!("{stem}-{suffix}{extension}")
        });
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                let result = file.write_all(&bytes).and_then(|_| file.sync_all());
                drop(file);
                if result.is_err() {
                    let _ = fs::remove_file(&candidate);
                    return Err("附件写入失败".into());
                }
                return Ok(StoredDocumentAsset {
                    src: path_reference(
                        document,
                        &candidate,
                        settings.prefer_relative_path,
                        settings.add_dot_slash,
                    )?,
                    name: candidate
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                    mime_type: mime,
                    size: bytes.len() as u64,
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("无法写入附件目录".into()),
        }
    }
    Err("附件重名过多，请更换目录".into())
}

fn local_file(
    root: &Path,
    document: &Path,
    source: &str,
    grants: &[PathBuf],
) -> Result<PathBuf, String> {
    let path = reference_path(document, source)?
        .canonicalize()
        .map_err(|_| "本地附件不存在".to_string())?;
    if !authorized(&path, root, grants) {
        return Err("附件位于未授权目录，请在存储设置中选择该目录".into());
    }
    let meta = fs::metadata(&path).map_err(|_| "无法读取附件".to_string())?;
    if !meta.is_file() || meta.len() > MAX_BYTES as u64 {
        return Err("附件不是文件或超过 100 MB".into());
    }
    Ok(path)
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "无法读取附件")?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取附件")?;
    if bytes.len() > MAX_BYTES {
        return Err("附件超过 100 MB".into());
    }
    Ok(bytes)
}

fn mime_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tif" | "tiff" => "image/tiff",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
    .into()
}

async fn download_image(source: &str) -> Result<(Vec<u8>, String, String), String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut url = reqwest::Url::parse(source).map_err(|_| "图片地址无效")?;
    for _ in 0..4 {
        if !matches!(url.scheme(), "https" | "http")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("不支持该图片地址".into());
        }
        let host = url.host_str().ok_or("图片地址无效")?.to_string();
        let port = url.port_or_known_default().ok_or("图片端口无效")?;
        let dns_host = host.clone();
        let addresses = tokio::time::timeout(
            deadline.saturating_duration_since(Instant::now()),
            tauri::async_runtime::spawn_blocking(move || {
                (dns_host.as_str(), port)
                    .to_socket_addrs()
                    .map(|v| v.collect::<Vec<_>>())
            }),
        )
        .await
        .map_err(|_| "图片域名解析超时")?
        .map_err(|_| "无法解析图片地址")?
        .map_err(|_| "无法解析图片地址")?;
        if addresses.is_empty()
            || addresses
                .iter()
                .any(|a| crate::link_preview::is_blocked_ip_address(a.ip()))
        {
            return Err("不允许自动下载本机或内网图片".into());
        }
        let timeout = deadline
            .checked_duration_since(Instant::now())
            .ok_or("图片下载超时")?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(timeout)
            .resolve_to_addrs(&host, &addresses)
            .build()
            .map_err(|_| "无法创建图片下载任务")?;
        let mut response = client
            .get(url.clone())
            .header(reqwest::header::ACCEPT, "image/*")
            .send()
            .await
            .map_err(|_| "图片下载失败")?;
        if response.status().is_redirection() {
            url = url
                .join(
                    response
                        .headers()
                        .get(reqwest::header::LOCATION)
                        .and_then(|v| v.to_str().ok())
                        .ok_or("图片重定向无效")?,
                )
                .map_err(|_| "图片重定向无效")?;
            continue;
        }
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|n| n > MAX_IMAGE_BYTES as u64)
        {
            return Err("图片下载失败或超过 20 MB".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "图片下载中断")? {
            if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
                return Err("网络图片超过 20 MB".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let (mime, extension) = if let Ok(format) = image::guess_format(&bytes) {
            (
                format.to_mime_type().to_string(),
                format.extensions_str().first().copied().unwrap_or("png"),
            )
        } else {
            assets::validate_safe_svg(&bytes).map_err(|_| "下载内容不是受支持的图片")?;
            ("image/svg+xml".into(), "svg")
        };
        let original = url
            .path_segments()
            .and_then(|s| s.last())
            .filter(|s| !s.is_empty())
            .unwrap_or("image");
        let stem = Path::new(original)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
        return Ok((bytes, mime, format!("{stem}.{extension}")));
    }
    Err("图片重定向次数过多".into())
}

#[tauri::command]
pub async fn store_document_asset(
    app: AppHandle,
    root_path: String,
    document_path: String,
    input: DocumentAssetInput,
) -> Result<StoredDocumentAsset, String> {
    let root = workspace::canonical_workspace_root(&root_path)?;
    let document = workspace::validate_existing_markdown_document_path(&root_path, &document_path)?;
    let policy = read_app_settings(app.clone())?.storage.attachments;
    let grants = authorized_folders(&app)?;
    let source = input.value.as_deref().unwrap_or("");
    if !matches!(input.source_type.as_str(), "file" | "base64") && source.len() > 8192 {
        return Err("附件地址过长".into());
    }
    if source.starts_with("markune-asset://") {
        return Ok(StoredDocumentAsset {
            src: source.into(),
            name: String::new(),
            mime_type: String::new(),
            size: 0,
        });
    }
    if !matches!(input.kind.as_str(), "image" | "video" | "attachment") {
        return Err("附件类型无效".into());
    }
    if input.source_type == "url" && (input.kind != "image" || !policy.apply_to_remote_images) {
        return Ok(StoredDocumentAsset {
            src: source.into(),
            name: String::new(),
            mime_type: input.media_type.unwrap_or_default(),
            size: 0,
        });
    }
    let (bytes, mime, name) = match input.source_type.as_str() {
        "url" => download_image(source).await?,
        "file" | "base64" => {
            let (mime, value) = if source.starts_with("data:") {
                let (header, value) = source.split_once(',').ok_or("图片内容编码无效")?;
                if !header.ends_with(";base64") {
                    return Err("仅支持 base64 图片数据".into());
                }
                (
                    header
                        .trim_start_matches("data:")
                        .trim_end_matches(";base64")
                        .to_string(),
                    value,
                )
            } else {
                (
                    input
                        .media_type
                        .clone()
                        .unwrap_or("application/octet-stream".into()),
                    source,
                )
            };
            if value.len() > MAX_BYTES * 4 / 3 + 4 {
                return Err("附件超过 100 MB".into());
            }
            let bytes = STANDARD.decode(value).map_err(|_| "附件内容编码无效")?;
            (
                bytes,
                mime,
                input
                    .file_name
                    .clone()
                    .unwrap_or("clipboard-image.png".into()),
            )
        }
        "absolute-path" | "relative-path" => {
            let path = local_file(&root, &document, source, &grants)?;
            if input.kind == "image" && !policy.apply_to_local_images {
                return Ok(StoredDocumentAsset {
                    src: if policy.mode == "managed" {
                        source.to_string()
                    } else {
                        path_reference(
                            &document,
                            &path,
                            policy.prefer_relative_path,
                            policy.add_dot_slash,
                        )?
                    },
                    name: path.file_name().unwrap().to_string_lossy().into_owned(),
                    mime_type: mime_for_path(&path),
                    size: fs::metadata(&path).map_err(|_| "无法读取附件")?.len(),
                });
            }
            (
                read_bytes(&path)?,
                mime_for_path(&path),
                path.file_name().unwrap().to_string_lossy().into_owned(),
            )
        }
        _ => return Err("附件来源无效".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        store_bytes(&root, &document, &policy, &grants, name, mime, bytes)
    })
    .await
    .map_err(|_| "附件保存任务失败")?
}

#[tauri::command]
pub async fn resolve_document_assets(
    app: AppHandle,
    root_path: String,
    document_path: String,
    sources: Vec<String>,
) -> Result<Vec<DocumentAssetResolution>, String> {
    if sources.len() > 2048 {
        return Err("附件解析批次过大".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let root = workspace::canonical_workspace_root(&root_path)?;
        let document =
            workspace::validate_existing_markdown_document_path(&root_path, &document_path)?;
        let grants = authorized_folders(&app)?;
        Ok(sources
            .into_iter()
            .map(|src| {
                let path = local_file(&root, &document, &src, &grants)
                    .ok()
                    .filter(|path| assets::allow_asset_protocol_file(&app, path).is_ok());
                DocumentAssetResolution {
                    src,
                    absolute_path: path.map(|p| p.to_string_lossy().into_owned()),
                }
            })
            .collect())
    })
    .await
    .map_err(|_| "附件解析任务失败")?
}

#[tauri::command]
pub async fn read_document_asset_data(
    app: AppHandle,
    root_path: String,
    document_path: String,
    source: String,
) -> Result<assets::WorkspaceAssetData, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = workspace::canonical_workspace_root(&root_path)?;
        let document =
            workspace::validate_existing_markdown_document_path(&root_path, &document_path)?;
        let path = local_file(&root, &document, &source, &authorized_folders(&app)?)?;
        Ok(assets::WorkspaceAssetData {
            id: source,
            media_type: mime_for_path(&path),
            name: path.file_name().unwrap().to_string_lossy().into_owned(),
            base64_data: STANDARD.encode(read_bytes(&path)?),
        })
    })
    .await
    .map_err(|_| "附件读取任务失败")?
}

fn markdown_destinations(markdown: &str) -> Vec<(std::ops::Range<usize>, String)> {
    use pulldown_cmark::{Event, Options, Parser, Tag};
    let parser = Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS,
    );
    let mut result = Vec::new();
    for (_, definition) in parser.reference_definitions().iter() {
        if let Some(range) = destination_range(markdown, definition.span.clone(), true) {
            result.push((range, definition.dest.to_string()));
        }
    }
    for (event, range) in parser.into_offset_iter() {
        match event {
            Event::Start(Tag::Image { dest_url, .. })
            | Event::Start(Tag::Link { dest_url, .. }) => {
                if let Some(range) = destination_range(markdown, range, false) {
                    result.push((range, dest_url.to_string()));
                }
            }
            Event::Html(_) | Event::InlineHtml(_) => {
                let html = &markdown[range.clone()];
                let mut reader = quick_xml::Reader::from_str(html);
                reader.config_mut().check_end_names = false;
                loop {
                    use quick_xml::events::Event as XmlEvent;
                    match reader.read_event() {
                        Ok(XmlEvent::Start(element) | XmlEvent::Empty(element)) => {
                            let name = element.name().as_ref().to_ascii_lowercase();
                            if ![b"img".as_slice(), b"video", b"source", b"a"]
                                .contains(&name.as_slice())
                            {
                                continue;
                            }
                            let attributes: Vec<_> = element
                                .attributes()
                                .with_checks(false)
                                .filter_map(Result::ok)
                                .collect();
                            if name == b"a"
                                && !attributes.iter().any(|attr| {
                                    attr.key
                                        .as_ref()
                                        .eq_ignore_ascii_case(b"data-markweave-attachment")
                                })
                            {
                                continue;
                            }
                            for attr in attributes {
                                if !attr.key.as_ref().eq_ignore_ascii_case(b"src")
                                    && !attr.key.as_ref().eq_ignore_ascii_case(b"href")
                                {
                                    continue;
                                }
                                let start = attr.value.as_ptr() as usize;
                                let base = html.as_ptr() as usize;
                                if start < base || start + attr.value.len() > base + html.len() {
                                    continue;
                                }
                                if let Ok(value) = attr.decode_and_unescape_value(reader.decoder())
                                {
                                    let begin = range.start + start - base;
                                    result.push((
                                        begin..begin + attr.value.len(),
                                        value.into_owned(),
                                    ));
                                }
                            }
                        }
                        Ok(XmlEvent::Eof) | Err(_) => break,
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    result
}

fn destination_range(
    markdown: &str,
    range: std::ops::Range<usize>,
    definition: bool,
) -> Option<std::ops::Range<usize>> {
    let text = &markdown[range.clone()];
    let bytes = text.as_bytes();
    let mut cursor = usize::from(bytes.first() == Some(&b'!'));
    if bytes.get(cursor) != Some(&b'[') {
        return None;
    }
    cursor += 1;
    let mut nesting = 1;
    while cursor < bytes.len() && nesting > 0 {
        match bytes[cursor] {
            b'\\' => {
                cursor += 2;
                continue;
            }
            b'`' => {
                let count = bytes[cursor..].iter().take_while(|b| **b == b'`').count();
                let mut scan = cursor + count;
                while scan < bytes.len() {
                    if bytes[scan] == b'`' {
                        let end_count = bytes[scan..].iter().take_while(|b| **b == b'`').count();
                        if end_count == count {
                            cursor = scan + count;
                            break;
                        }
                        scan += end_count;
                    } else {
                        scan += 1;
                    }
                }
                if scan < bytes.len() {
                    continue;
                }
            }
            b'[' => nesting += 1,
            b']' => nesting -= 1,
            _ => {}
        }
        cursor += 1;
    }
    if nesting != 0 || bytes.get(cursor) != Some(&if definition { b':' } else { b'(' }) {
        return None;
    }
    let start = range.start + cursor + 1;
    let start = start + markdown[start..].len() - markdown[start..].trim_start().len();
    if markdown.as_bytes().get(start) == Some(&b'<') {
        let end = start + 1 + markdown[start + 1..].find('>')?;
        return Some(start + 1..end);
    }
    let mut depth = 0;
    let mut escaped = false;
    for (offset, c) in markdown[start..range.end].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' {
            escaped = true;
            continue;
        }
        if c == '(' {
            depth += 1;
        }
        if c == ')' {
            if depth == 0 {
                return Some(start..start + offset);
            }
            depth -= 1;
        }
        if c.is_whitespace() && depth == 0 {
            return Some(start..start + offset);
        }
    }
    Some(start..range.end)
}

fn rebase_document_assets(
    markdown: &str,
    old_document: &Path,
    new_document: &Path,
    source: &Path,
    destination: &Path,
) -> Result<String, String> {
    let mut edits = std::collections::BTreeMap::new();
    for (range, reference) in markdown_destinations(markdown) {
        if reference.starts_with("markune-")
            || reference.starts_with(".markune/assets/files/")
            || reference
                .split(['?', '#'])
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
                .ends_with(".md")
            || reference
                .split(['?', '#'])
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
                .ends_with(".mdx")
        {
            continue;
        }
        let Ok(old_target) = reference_path(old_document, &reference) else {
            continue;
        };
        let new_target = old_target
            .strip_prefix(source)
            .map(|suffix| destination.join(suffix))
            .unwrap_or(old_target);
        let relative = !reference.starts_with("file:")
            && !Path::new(&reference).is_absolute()
            && !reference.as_bytes().get(1).is_some_and(|c| *c == b':');
        let mut next = path_reference(
            new_document,
            &new_target,
            relative,
            reference.starts_with("./"),
        )?;
        if let Some(index) = reference.find(['?', '#']) {
            next.push_str(&reference[index..]);
        }
        if next != reference {
            edits.insert(range.start, (range.end, next));
        }
    }
    let mut output = markdown.to_string();
    for (start, (end, replacement)) in edits.into_iter().rev() {
        output.replace_range(start..end, &replacement);
    }
    Ok(output)
}

pub(crate) fn move_with_document_assets(source: &Path, destination: &Path) -> Result<(), String> {
    fn documents(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
        let meta = fs::symlink_metadata(path).map_err(|_| "无法扫描待移动文件")?;
        if meta.file_type().is_symlink() {
            return Ok(());
        }
        if meta.is_file() && workspace::is_markdown_document_file(path) {
            result.push(path.to_path_buf());
            if result.len() > 10_000 {
                return Err("移动文档数量超过单次校验上限".into());
            }
        } else if meta.is_dir() {
            for entry in fs::read_dir(path).map_err(|_| "无法扫描待移动目录")? {
                let entry = entry.map_err(|_| "无法扫描待移动目录")?;
                if !workspace::should_skip_entry(&entry.file_name().to_string_lossy()) {
                    documents(&entry.path(), result)?;
                }
            }
        }
        Ok(())
    }
    if source == destination {
        return Ok(());
    }
    let mut paths = Vec::new();
    documents(source, &mut paths)?;
    paths.sort();
    let locks: Vec<_> = paths
        .iter()
        .map(|path| workspace::document_save_lock(path))
        .collect();
    let _guards: Vec<_> = locks
        .iter()
        .map(|lock| lock.lock().map_err(|_| "文档保存状态不可用"))
        .collect::<Result<_, _>>()?;
    let mut changes = Vec::new();
    let mut total = 0;
    for path in paths {
        let old = fs::read_to_string(&path).map_err(|_| "无法读取待移动文档")?;
        total += old.len();
        if total > 100 * 1024 * 1024 {
            return Err("移动文档内容超过单次校验上限".into());
        }
        let next_path = if path == source {
            destination.to_path_buf()
        } else {
            destination.join(path.strip_prefix(source).map_err(|_| "移动路径无效")?)
        };
        let new = rebase_document_assets(&old, &path, &next_path, source, destination)?;
        if old != new {
            changes.push((path, old, new));
        }
    }
    let mut written = 0;
    let result = (|| {
        for (path, old, new) in &changes {
            if fs::read_to_string(path).map_err(|_| "无法复核文档")? != *old {
                return Err("文档在移动期间已改变，请重试".to_string());
            }
            workspace::write_text_atomic_guarded(path, new, || {
                if fs::read_to_string(path)? != *old {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::WouldBlock,
                        "document changed",
                    ));
                }
                Ok(())
            })
            .map_err(|_| "文档在移动期间已改变或无法写入，请重试")?;
            written += 1;
        }
        for (path, _, new) in &changes {
            if !fs::read_to_string(path).is_ok_and(|current| current == *new) {
                return Err("文档在移动期间已改变，请重试".into());
            }
        }
        move_path_no_replace(source, destination)
            .map_err(|_| "无法移动：目标可能已存在，或文件系统不支持安全移动".to_string())
    })();
    if result.is_err() {
        for (path, old, new) in changes[..written].iter().rev() {
            if fs::read_to_string(path).is_ok_and(|content| content == *new) {
                workspace::write_text_atomic_guarded(path, old, || {
                    if fs::read_to_string(path)? != *new {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::WouldBlock,
                            "document changed",
                        ));
                    }
                    Ok(())
                })
                .map_err(|_| "移动失败，且无法完整恢复附件引用")?;
            }
        }
    }
    result
}

fn move_path_no_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::os::unix::ffi::OsStrExt;
        let source = std::ffi::CString::new(source.as_os_str().as_bytes())?;
        let destination = std::ffi::CString::new(destination.as_os_str().as_bytes())?;
        // Both C strings remain alive for the synchronous no-replace syscall. author: refinex
        #[cfg(target_os = "macos")]
        let result =
            unsafe { libc::renamex_np(source.as_ptr(), destination.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(target_os = "linux")]
        let result = unsafe {
            libc::renameat2(
                libc::AT_FDCWD,
                source.as_ptr(),
                libc::AT_FDCWD,
                destination.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        if result != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" {
            fn MoveFileW(existing: *const u16, new: *const u16) -> i32;
        }
        let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let destination: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        // MoveFileW rejects existing targets; the UTF-16 buffers include terminators. author: refinex
        if unsafe { MoveFileW(source.as_ptr(), destination.as_ptr()) } == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    {
        let _ = (source, destination);
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "safe move unsupported",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        let document = root.join("notes/guide.md");
        fs::write(&document, "# guide").unwrap();
        (temp, root, document)
    }

    #[test]
    fn rebasing_preserves_uri_schemes_titles_html_attributes_and_legacy_assets() {
        let (_temp, root, old) = fixture();
        let new = root.join("guide.md");
        let markdown = r#"[mail](mailto:alice@example.com)
[tel](tel:123)
![image](a.png "title ](oops")
<img data-src="lazy.png" src = "actual.png">
![old](.markune/assets/files/ab/hash.png)
![cdn](//cdn.example/image.png)
"#;
        let result = rebase_document_assets(markdown, &old, &new, &old, &new).unwrap();
        assert!(result.contains("mailto:alice@example.com"));
        assert!(result.contains("tel:123"));
        assert!(result.contains(r#"![image](notes/a.png "title ](oops")"#));
        assert!(result.contains(r#"data-src="lazy.png" src = "notes/actual.png""#));
        assert!(result.contains("](.markune/assets/files/ab/hash.png)"));
        assert!(result.contains("](//cdn.example/image.png)"));
        let mdx = root.join("notes/sample.mdx");
        fs::write(&mdx, "![x](assets/a.png)").unwrap();
        let target = root.join("sample.mdx");
        move_with_document_assets(&mdx, &target).unwrap();
        assert_eq!(
            fs::read_to_string(target).unwrap(),
            "![x](notes/assets/a.png)"
        );
    }

    #[test]
    fn no_replace_move_preserves_existing_destination_and_restores_source_references() {
        let (_temp, root, document) = fixture();
        let original = "![x](assets/a.png)";
        fs::write(&document, original).unwrap();
        let target = root.join("guide.md");
        fs::write(&target, "external content").unwrap();
        assert!(move_with_document_assets(&document, &target).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "external content");
        assert_eq!(fs::read_to_string(&document).unwrap(), original);
    }

    #[test]
    fn private_directory_names_are_case_insensitive() {
        let (_temp, root, document) = fixture();
        for name in [".MARKUNE", ".GIT"] {
            fs::create_dir_all(root.join(name)).unwrap();
            fs::write(root.join(name).join("secret.png"), [1]).unwrap();
            assert!(safe_directory(&root.join(name), &root, &[root.clone()]).is_err());
            assert!(local_file(
                &root,
                &document,
                &format!("../{name}/secret.png"),
                &[root.clone()]
            )
            .is_err());
        }
    }

    #[test]
    fn network_image_rules_reject_local_and_credentialed_urls_before_fetch() {
        for url in [
            "http://127.0.0.1/p.png",
            "http://user:password@example.com/p.png",
            "file:///tmp/p.png",
        ] {
            assert!(tauri::async_runtime::block_on(download_image(url)).is_err());
        }
    }

    #[test]
    #[ignore = "requires public network access"]
    fn live_public_image_download_and_store() {
        let (_temp, root, document) = fixture();
        let (bytes, mime, name) = tauri::async_runtime::block_on(download_image(
            "https://octodex.github.com/images/yaktocat.png",
        ))
        .unwrap();
        assert_eq!(mime, "image/png");
        let policy = AttachmentStorageSettings {
            mode: "filename-assets".into(),
            ..Default::default()
        };
        let stored =
            store_bytes(&root, &document, &policy, &[], name, mime, bytes.clone()).unwrap();
        assert!(stored.src.starts_with("guide.assets/"));
        assert_eq!(
            read_bytes(&reference_path(&document, &stored.src).unwrap()).unwrap(),
            bytes
        );
    }

    #[test]
    fn modes_place_files_relative_to_the_real_document_and_never_overwrite() {
        let (_temp, root, document) = fixture();
        for (mode, prefix) in [
            ("document", "image.png"),
            ("assets", "assets/image.png"),
            ("filename-assets", "guide.assets/image.png"),
            ("custom", "../shared/image.png"),
        ] {
            let policy = AttachmentStorageSettings {
                mode: mode.into(),
                custom_path: "../shared".into(),
                ..Default::default()
            };
            let first = store_bytes(
                &root,
                &document,
                &policy,
                &[],
                "image.png".into(),
                "image/png".into(),
                vec![1, 2, 3],
            )
            .unwrap();
            assert_eq!(first.src, prefix);
            let second = store_bytes(
                &root,
                &document,
                &policy,
                &[],
                "image.png".into(),
                "image/png".into(),
                vec![4],
            )
            .unwrap();
            assert_ne!(first.src, second.src);
            assert_eq!(
                read_bytes(&reference_path(&document, &first.src).unwrap()).unwrap(),
                vec![1, 2, 3]
            );
        }
        let managed = store_bytes(
            &root,
            &document,
            &Default::default(),
            &[],
            "a.png".into(),
            "image/png".into(),
            vec![1],
        )
        .unwrap();
        assert!(managed.src.starts_with("markune-asset://"));
    }

    #[test]
    fn custom_targets_need_authorization_and_private_paths_are_never_targets() {
        let (_temp, root, document) = fixture();
        let outside = tempfile::tempdir().unwrap();
        let folder = outside.path().canonicalize().unwrap();
        let policy = AttachmentStorageSettings {
            mode: "custom".into(),
            custom_path: folder.to_string_lossy().into_owned(),
            ..Default::default()
        };
        assert!(store_bytes(
            &root,
            &document,
            &policy,
            &[],
            "a.png".into(),
            "image/png".into(),
            vec![1]
        )
        .is_err());
        let stored = store_bytes(
            &root,
            &document,
            &policy,
            &[folder.clone()],
            "a.png".into(),
            "image/png".into(),
            vec![1],
        )
        .unwrap();
        assert!(local_file(&root, &document, &stored.src, &[folder]).is_ok());
        assert!(safe_directory(&root.join(".markune/assets"), &root, &[root.clone()]).is_err());
        assert!(safe_directory(&root.join(".git/files"), &root, &[root.clone()]).is_err());
    }

    #[test]
    fn relative_prefix_filename_variable_and_unicode_roundtrip() {
        let (_temp, root, document) = fixture();
        let policy = AttachmentStorageSettings {
            mode: "custom".into(),
            custom_path: "./${filename}.assets".into(),
            add_dot_slash: true,
            ..Default::default()
        };
        let stored = store_bytes(
            &root,
            &document,
            &policy,
            &[],
            "中文 (图).png".into(),
            "image/png".into(),
            vec![1],
        )
        .unwrap();
        assert!(stored.src.starts_with("./guide.assets/"));
        assert!(reference_path(&document, &stored.src).unwrap().exists());
        assert_eq!(
            path_reference(&document, &root.join("shared/a.png"), true, true).unwrap(),
            "../shared/a.png"
        );
        assert!(path_reference(&document, &root.join("a.png"), false, true)
            .unwrap()
            .starts_with("file://"));
        assert_eq!(safe_name("CON.png"), "_CON.png");
    }

    #[test]
    fn rebasing_preserves_code_and_rewrites_inline_reference_and_html_images() {
        let (_temp, root, old) = fixture();
        let new = root.join("guide.md");
        let markdown = "![图](assets/a.png)\n![ref][image]\n\n[image]: assets/b.png \"title\"\n\n<img src=\"assets/c.png\">\n\n`![code](assets/d.png)`\n\n```md\n![code](assets/e.png)\n```\n";
        let result = rebase_document_assets(markdown, &old, &new, &old, &new).unwrap();
        assert!(result.contains("](notes/assets/a.png)"));
        assert!(result.contains("[image]: notes/assets/b.png"));
        assert!(result.contains("src=\"notes/assets/c.png\""));
        assert!(result.contains("`![code](assets/d.png)`"));
        assert!(result.contains("![code](assets/e.png)"));
    }

    #[test]
    fn moving_a_document_keeps_shared_assets_in_place() {
        let (_temp, root, document) = fixture();
        fs::create_dir(root.join("notes/assets")).unwrap();
        fs::write(root.join("notes/assets/a.png"), [1]).unwrap();
        fs::write(&document, "![a](assets/a.png)").unwrap();
        let target = root.join("guide.md");
        move_with_document_assets(&document, &target).unwrap();
        assert_eq!(
            fs::read_to_string(target).unwrap(),
            "![a](notes/assets/a.png)"
        );
        assert!(root.join("notes/assets/a.png").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_target_authorization() {
        let (_temp, root, _) = fixture();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join("escape")).unwrap();
        assert!(safe_directory(&root.join("escape/assets"), &root, &[]).is_err());
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};

const ASSET_SCHEMA_VERSION: u32 = 1;
const ASSET_URL_PREFIX: &str = "madora-asset://";
const ASSET_RELATIVE_PREFIX: &str = ".madora/assets/files/";
const WORKSPACE_PRIVATE_DIR: &str = ".madora";
const MAX_LOCAL_ASSET_BYTES: usize = 100 * 1024 * 1024;

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAssetIndex {
    pub schema_version: u32,
    pub assets: BTreeMap<String, WorkspaceAssetRecord>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAssetRecord {
    pub id: String,
    pub storage: String,
    pub relative_path: String,
    pub original_name: String,
    pub media_type: String,
    pub size: u64,
    pub created_at: String,
    pub sha256: String,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadWorkspaceAssetInput {
    pub file_name: String,
    pub media_type: String,
    pub base64_data: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadedWorkspaceAsset {
    pub id: String,
    pub url: String,
    pub relative_path: String,
    pub name: String,
    pub media_type: String,
    pub size: u64,
    pub absolute_path: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWorkspaceAsset {
    pub id: String,
    pub absolute_path: String,
    pub media_type: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAssetData {
    pub id: String,
    pub media_type: String,
    pub name: String,
    pub base64_data: String,
}

#[tauri::command]
pub fn upload_workspace_asset(
    app: AppHandle,
    root_path: String,
    input: UploadWorkspaceAssetInput,
) -> Result<UploadedWorkspaceAsset, String> {
    let uploaded = upload_workspace_asset_impl(root_path, input)?;
    allow_asset_protocol_file(&app, Path::new(&uploaded.absolute_path))?;
    Ok(uploaded)
}

pub(crate) fn upload_workspace_asset_impl(
    root_path: String,
    input: UploadWorkspaceAssetInput,
) -> Result<UploadedWorkspaceAsset, String> {
    let bytes = {
        use base64::Engine;

        base64::engine::general_purpose::STANDARD
            .decode(input.base64_data.as_bytes())
            .map_err(|_| "文件内容编码无效".to_string())?
    };

    store_workspace_asset_bytes_impl(root_path, input.file_name, input.media_type, bytes)
        .map(|(uploaded, _)| uploaded)
}

pub(crate) fn store_workspace_asset_bytes_impl(
    root_path: String,
    file_name: String,
    media_type: String,
    bytes: Vec<u8>,
) -> Result<(UploadedWorkspaceAsset, bool), String> {
    let root = canonical_workspace_root(&root_path)?;
    let original_name = validate_file_name(&file_name)?;

    if bytes.is_empty() {
        return Err("文件内容为空".to_string());
    }

    if bytes.len() > MAX_LOCAL_ASSET_BYTES {
        return Err("文件超过本地上传大小限制".to_string());
    }

    let sha256 = hex::encode(Sha256::digest(&bytes));
    let extension = safe_extension(&original_name, &media_type);
    let asset_id = sha256.clone();
    let shard = &asset_id[0..2];
    let asset_dir = asset_files_dir(&root).join(shard);
    fs::create_dir_all(&asset_dir).map_err(|_| "无法创建资产目录".to_string())?;
    let file_path = asset_dir.join(format!("{asset_id}{extension}"));

    if !file_path.exists() {
        fs::write(&file_path, &bytes).map_err(|_| "无法写入资产文件".to_string())?;
    }

    let mut index = read_asset_index(&root).map_err(|_| "无法读取资产索引".to_string())?;
    let is_new_asset = !index.assets.contains_key(&asset_id);
    let record = WorkspaceAssetRecord {
        id: asset_id.clone(),
        storage: "local".to_string(),
        relative_path: relative_to_root(&root, &file_path)?,
        original_name: original_name.clone(),
        media_type: normalize_media_type(&media_type),
        size: bytes.len() as u64,
        created_at: current_timestamp_millis(),
        sha256,
    };
    index.assets.insert(asset_id.clone(), record.clone());
    write_asset_index(&root, &index).map_err(|_| "无法写入资产索引".to_string())?;

    let absolute_path = validate_asset_file_path(&root, &record.relative_path)?;

    Ok((
        UploadedWorkspaceAsset {
            id: asset_id.clone(),
            url: format!("{ASSET_URL_PREFIX}{asset_id}"),
            relative_path: record.relative_path.clone(),
            name: original_name,
            media_type: record.media_type,
            size: record.size,
            absolute_path: absolute_path.to_string_lossy().to_string(),
        },
        is_new_asset,
    ))
}

#[tauri::command]
pub fn resolve_workspace_asset(
    app: AppHandle,
    root_path: String,
    asset_id: String,
) -> Result<ResolvedWorkspaceAsset, String> {
    let resolved = resolve_workspace_asset_impl(root_path, asset_id)?;
    allow_asset_protocol_file(&app, Path::new(&resolved.absolute_path))?;
    Ok(resolved)
}

pub(crate) fn resolve_workspace_asset_impl(
    root_path: String,
    asset_id: String,
) -> Result<ResolvedWorkspaceAsset, String> {
    let root = canonical_workspace_root(&root_path)?;
    let index = read_asset_index(&root).map_err(|_| "无法读取资产索引".to_string())?;
    let record = index
        .assets
        .get(&asset_id)
        .ok_or_else(|| "资产不存在".to_string())?;
    let absolute_path = validate_asset_file_path(&root, &record.relative_path)?;

    Ok(ResolvedWorkspaceAsset {
        id: record.id.clone(),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        media_type: record.media_type.clone(),
        name: record.original_name.clone(),
        size: record.size,
    })
}

fn allow_asset_protocol_file<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(|_| "无法授权资产文件访问".to_string())
}

#[tauri::command]
pub fn read_workspace_asset_data(
    root_path: String,
    asset_id: String,
) -> Result<WorkspaceAssetData, String> {
    let root = canonical_workspace_root(&root_path)?;
    let index = read_asset_index(&root).map_err(|_| "无法读取资产索引".to_string())?;
    let record = index
        .assets
        .get(&asset_id)
        .ok_or_else(|| "资产不存在".to_string())?;
    let absolute_path = validate_asset_file_path(&root, &record.relative_path)?;
    let bytes = fs::read(&absolute_path).map_err(|_| "无法读取资产文件".to_string())?;

    Ok(WorkspaceAssetData {
        id: record.id.clone(),
        media_type: record.media_type.clone(),
        name: record.original_name.clone(),
        base64_data: {
            use base64::Engine;

            base64::engine::general_purpose::STANDARD.encode(bytes)
        },
    })
}

pub fn extract_asset_ids(value: &Value) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    collect_asset_ids(value, &mut ids);
    ids
}

pub fn extract_asset_ids_from_markdown(markdown: &str) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    collect_asset_ids_from_markdown_prefix(markdown, ASSET_URL_PREFIX, &mut ids);
    collect_asset_ids_from_markdown_prefix(markdown, ASSET_RELATIVE_PREFIX, &mut ids);

    ids
}

fn collect_asset_ids_from_markdown_prefix(
    markdown: &str,
    prefix: &str,
    ids: &mut BTreeSet<String>,
) {
    let mut remaining = markdown;
    while let Some(index) = remaining.find(prefix) {
        let after_prefix = &remaining[index..];
        let reference = after_prefix
            .chars()
            .take_while(|character| !is_markdown_asset_reference_terminator(*character))
            .collect::<String>();

        if let Some(id) = extract_asset_id_from_reference(&reference) {
            ids.insert(id);
        }

        remaining = &after_prefix[prefix.len().min(after_prefix.len())..];
    }
}

pub fn cleanup_unreferenced_assets(
    root: &Path,
    candidate_ids: BTreeSet<String>,
) -> Result<(), String> {
    if candidate_ids.is_empty() {
        return Ok(());
    }

    let referenced = collect_workspace_asset_references(root)?;
    let mut index = read_asset_index(root).map_err(|_| "无法读取资产索引".to_string())?;

    for asset_id in candidate_ids {
        if referenced.contains(&asset_id) {
            continue;
        }

        if let Some(record) = index.assets.remove(&asset_id) {
            let path = validate_asset_file_path(root, &record.relative_path)?;
            fs::remove_file(path).map_err(|_| "无法删除资产文件".to_string())?;
        }
    }

    write_asset_index(root, &index).map_err(|_| "无法写入资产索引".to_string())
}

#[allow(dead_code)]
pub fn collect_asset_ids_from_documents(paths: &[PathBuf]) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();

    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                ids.extend(extract_asset_ids(&value));
            }
        }
    }

    ids
}

fn collect_asset_ids(value: &Value, ids: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(url)) = map.get("url") {
                if let Some(id) = extract_asset_id_from_reference(url) {
                    ids.insert(id);
                }
            }

            for child in map.values() {
                collect_asset_ids(child, ids);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_asset_ids(item, ids);
            }
        }
        _ => {}
    }
}

fn extract_asset_id_from_reference(reference: &str) -> Option<String> {
    if let Some(id) = reference.strip_prefix(ASSET_URL_PREFIX) {
        return is_valid_asset_id(id).then(|| id.to_string());
    }

    if !reference.starts_with(ASSET_RELATIVE_PREFIX) {
        return None;
    }

    let without_query = reference
        .split('?')
        .next()
        .unwrap_or(reference)
        .split('#')
        .next()
        .unwrap_or(reference);
    let file_name = without_query.rsplit('/').next().unwrap_or("");

    if file_name.is_empty() {
        return None;
    }

    let asset_id = file_name.split('.').next().unwrap_or("");

    is_valid_asset_id(asset_id).then(|| asset_id.to_string())
}

fn is_valid_asset_id(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn is_markdown_asset_reference_terminator(character: char) -> bool {
    character.is_whitespace()
        || matches!(
            character,
            '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | '\\'
        )
}

fn collect_workspace_asset_references(root: &Path) -> Result<BTreeSet<String>, String> {
    let mut paths = Vec::new();
    collect_markdown_documents(root, &mut paths).map_err(|_| "无法扫描工作区文档".to_string())?;
    let mut ids = BTreeSet::new();

    for path in paths {
        if let Ok(raw) = fs::read_to_string(path) {
            ids.extend(extract_asset_ids_from_markdown(&raw));
        }
    }

    Ok(ids)
}

fn collect_markdown_documents(dir: &Path, paths: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if matches!(
            file_name,
            ".madora" | ".git" | "node_modules" | "target" | "dist" | "build"
        ) {
            continue;
        }

        if path.is_dir() {
            collect_markdown_documents(&path, paths)?;
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
            .unwrap_or(false)
        {
            paths.push(path);
        }
    }

    Ok(())
}

fn read_asset_index(root: &Path) -> io::Result<WorkspaceAssetIndex> {
    let path = asset_index_path(root);

    if !path.exists() {
        return Ok(WorkspaceAssetIndex {
            schema_version: ASSET_SCHEMA_VERSION,
            assets: BTreeMap::new(),
        });
    }

    let raw = fs::read_to_string(path)?;
    serde_json::from_str::<WorkspaceAssetIndex>(&raw)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_asset_index(root: &Path, index: &WorkspaceAssetIndex) -> io::Result<()> {
    let dir = asset_dir(root);
    fs::create_dir_all(&dir)?;
    let json = serde_json::to_string_pretty(index)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(dir.join("index.json"), format!("{json}\n"))
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

fn validate_asset_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let asset_root = asset_files_dir(root);
    let path = root
        .join(relative_path)
        .canonicalize()
        .map_err(|_| "资产文件不存在".to_string())?;

    if !path.starts_with(asset_root) {
        return Err("资产路径越界".to_string());
    }

    Ok(path)
}

fn workspace_private_dir(root: &Path) -> PathBuf {
    root.join(WORKSPACE_PRIVATE_DIR)
}

fn asset_dir(root: &Path) -> PathBuf {
    workspace_private_dir(root).join("assets")
}

fn asset_files_dir(root: &Path) -> PathBuf {
    asset_dir(root).join("files")
}

fn asset_index_path(root: &Path) -> PathBuf {
    asset_dir(root).join("index.json")
}

fn validate_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();

    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed == "."
        || trimmed == ".."
    {
        return Err("文件名无效".to_string());
    }

    Ok(trimmed.to_string())
}

fn safe_extension(file_name: &str, media_type: &str) -> String {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();

    if !extension.is_empty() && extension.len() <= 12 {
        return format!(".{extension}");
    }

    match media_type {
        "image/png" => ".png".to_string(),
        "image/jpeg" => ".jpg".to_string(),
        "image/gif" => ".gif".to_string(),
        "image/webp" => ".webp".to_string(),
        "video/mp4" => ".mp4".to_string(),
        "audio/mpeg" => ".mp3".to_string(),
        "audio/wav" => ".wav".to_string(),
        "application/pdf" => ".pdf".to_string(),
        _ => ".bin".to_string(),
    }
}

fn normalize_media_type(media_type: &str) -> String {
    let trimmed = media_type.trim();

    if trimmed.is_empty() {
        "application/octet-stream".to_string()
    } else {
        trimmed.to_string()
    }
}

fn relative_to_root(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root)
        .map_err(|_| "资产路径越界".to_string())
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

fn current_timestamp_millis() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    millis.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn encoded(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn uploads_asset_under_madora_assets_and_writes_index() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");

        let uploaded = upload_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "cover.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: encoded(b"png bytes"),
            },
        )
        .expect("上传资产失败");

        assert_eq!(uploaded.name, "cover.png");
        assert_eq!(uploaded.media_type, "image/png");
        assert_eq!(uploaded.size, 9);
        assert!(uploaded.url.starts_with("madora-asset://"));
        assert_eq!(
            uploaded.relative_path,
            format!(
                ".madora/assets/files/{}/{}.png",
                &uploaded.id[0..2],
                uploaded.id
            )
        );
        assert!(!uploaded.relative_path.contains('\\'));
        assert!(Path::new(&uploaded.absolute_path).is_file());
        assert!(Path::new(&uploaded.absolute_path).ends_with(Path::new(&uploaded.relative_path)));
        assert!(temp_dir.path().join(".madora/assets/index.json").is_file());
    }

    #[test]
    fn resolves_only_indexed_assets() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let uploaded = upload_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "voice.mp3".to_string(),
                media_type: "audio/mpeg".to_string(),
                base64_data: encoded(b"audio"),
            },
        )
        .expect("上传音频失败");

        let resolved = resolve_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            uploaded.id.clone(),
        )
        .expect("解析资产失败");

        assert_eq!(resolved.id, uploaded.id);
        assert_eq!(resolved.name, "voice.mp3");
        assert_eq!(resolved.media_type, "audio/mpeg");

        let error = resolve_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            "missing".to_string(),
        )
        .expect_err("不存在的资产不应解析成功");

        assert_eq!(error, "资产不存在");
    }

    #[test]
    fn rejects_asset_index_under_refinex_directory() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let refinex_file_dir = root.join(".refinex/assets/files/ab");
        fs::create_dir_all(&refinex_file_dir).expect("创建旧资产目录失败");
        fs::write(refinex_file_dir.join("asset-a.png"), b"png").expect("写入旧资产失败");
        fs::write(
            root.join(".refinex/assets/index.json"),
            r#"{
  "schemaVersion": 1,
  "assets": {
    "asset-a": {
      "id": "asset-a",
      "storage": "local",
      "relativePath": ".refinex/assets/files/ab/asset-a.png",
      "originalName": "old.png",
      "mediaType": "image/png",
      "size": 3,
      "createdAt": "1",
      "sha256": "asset-a"
    }
  }
}"#,
        )
        .expect("写入旧资产索引失败");

        let error =
            resolve_workspace_asset_impl(root.to_string_lossy().to_string(), "asset-a".to_string())
                .expect_err("不应解析 .refinex 下的旧资产索引");

        assert_eq!(error, "资产不存在");
        assert!(root.join(".refinex/assets/index.json").is_file());
        assert!(!root.join(".madora/assets/index.json").is_file());
    }

    #[test]
    fn reads_workspace_asset_data_as_base64() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let uploaded = upload_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "cover.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: encoded(b"png bytes"),
            },
        )
        .expect("上传图片失败");

        let asset_data = read_workspace_asset_data(
            temp_dir.path().to_string_lossy().to_string(),
            uploaded.id.clone(),
        )
        .expect("读取资产内容失败");

        assert_eq!(asset_data.id, uploaded.id);
        assert_eq!(asset_data.name, "cover.png");
        assert_eq!(asset_data.media_type, "image/png");
        assert_eq!(asset_data.base64_data, encoded(b"png bytes"));
    }

    #[test]
    fn rejects_path_like_file_name() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let error = upload_workspace_asset_impl(
            temp_dir.path().to_string_lossy().to_string(),
            UploadWorkspaceAssetInput {
                file_name: "../escape.png".to_string(),
                media_type: "image/png".to_string(),
                base64_data: encoded(b"bad"),
            },
        )
        .expect_err("路径型文件名不应上传成功");

        assert_eq!(error, "文件名无效");
    }

    #[test]
    fn extracts_asset_ids_from_plate_json_value() {
        let value = serde_json::json!([
            { "type": "img", "url": "madora-asset://asset-a", "children": [{ "text": "" }] },
            { "type": "video", "url": "https://example.com/a.mp4", "children": [{ "text": "" }] },
            { "type": "img", "url": ".madora/assets/files/ab/asset-c.png", "children": [{ "text": "" }] },
            { "type": "file", "url": "madora-asset://asset-b", "children": [{ "text": "" }] },
            { "type": "file", "url": "refinex-asset://legacy", "children": [{ "text": "" }] }
        ]);

        assert_eq!(
            extract_asset_ids(&value),
            BTreeSet::from([
                "asset-a".to_string(),
                "asset-b".to_string(),
                "asset-c".to_string()
            ])
        );
    }

    #[test]
    fn extracts_asset_ids_from_markdown_text() {
        let markdown = r#"
![cover](refinex-asset://asset-a)

<refinex-file src="madora-asset://asset-b" />

<video src=".madora/assets/files/ab/asset-c.mp4"></video>

![new](.madora/assets/files/de/asset-d.png)

![remote](https://example.com/image.png)
"#;

        assert_eq!(
            extract_asset_ids_from_markdown(markdown),
            BTreeSet::from([
                "asset-b".to_string(),
                "asset-c".to_string(),
                "asset-d".to_string()
            ])
        );
    }
}

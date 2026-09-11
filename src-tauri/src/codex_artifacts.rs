use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read},
    path::{Component, Path},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactPreview {
    name: String,
    kind: &'static str,
    media_type: &'static str,
    size: u64,
    fingerprint: String,
    text: Option<String>,
    base64: Option<String>,
}

#[tauri::command]
pub async fn read_codex_artifact(
    root_path: String,
    relative_path: Option<String>,
    asset_id: Option<String>,
) -> Result<ArtifactPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        match (relative_path, asset_id) {
            (Some(relative), None) => read_artifact(&root, &relative),
            (None, Some(id)) if id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit()) => {
                let asset = crate::assets::resolve_workspace_asset_impl(root_path, id.clone())?;
                let mut preview = read_resolved_artifact(Path::new(&asset.absolute_path))?;
                if !preview.fingerprint.is_empty() && preview.fingerprint != id {
                    return Err("托管资产内容与引用指纹不一致".into());
                }
                preview.name = asset.name;
                Ok(preview)
            }
            _ => Err("产物引用无效".into()),
        }
    })
    .await
    .map_err(|_| "产物读取任务失败".to_string())?
}

fn read_artifact(root: &Path, relative: &str) -> Result<ArtifactPreview, String> {
    if relative.len() > 4096
        || relative.contains('\\')
        || relative.contains(':')
        || relative.is_empty()
    {
        return Err("产物路径无效".into());
    }
    let canonical = root
        .canonicalize()
        .map_err(|_| "工作区不可用".to_string())?;
    let root = canonical.as_path();
    let mut candidate = root.to_path_buf();
    for part in Path::new(relative).components() {
        let Component::Normal(name) = part else {
            return Err("产物路径超出工作区".into());
        };
        if name.to_string_lossy().starts_with('.') {
            return Err("不能读取私有目录".into());
        }
        candidate.push(name);
        if fs::symlink_metadata(&candidate)
            .map_err(|_| "来源已移动、删除或无法读取".to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("产物预览不跟随符号链接".into());
        }
    }
    let path = candidate
        .canonicalize()
        .map_err(|_| "来源不可用".to_string())?;
    if !path.starts_with(root) {
        return Err("产物超出工作区".into());
    }
    read_resolved_artifact(&path)
}

fn read_resolved_artifact(path: &Path) -> Result<ArtifactPreview, String> {
    let mut file = fs::File::open(path).map_err(|_| "无法读取产物".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "无法读取产物信息".to_string())?;
    if !metadata.is_file() {
        return Err("请选择普通文件".into());
    }
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let kind = match extension.as_str() {
        "pdf" => "pdf",
        "mp4" | "webm" => "video",
        "mp3" | "wav" | "m4a" | "ogg" => "audio",
        "png" | "jpg" | "jpeg" | "webp" | "gif" => "image",
        "txt" | "md" | "mdx" | "json" | "csv" | "tsv" | "yaml" | "yml" | "log" | "rs" | "ts"
        | "tsx" | "js" | "py" | "java" | "css" | "html" | "svg" | "xml" => "text",
        _ => "file",
    };
    let limit = match kind {
        "pdf" | "video" | "audio" => 50 * 1024 * 1024,
        "image" => 20 * 1024 * 1024,
        "text" => 2 * 1024 * 1024,
        _ => 0,
    };
    let mut preview = ArtifactPreview {
        name: path.file_name().unwrap().to_string_lossy().into_owned(),
        kind,
        media_type: "application/octet-stream",
        size: metadata.len(),
        fingerprint: String::new(),
        text: None,
        base64: None,
    };
    if kind == "file" {
        return Ok(preview);
    }
    if metadata.len() > limit {
        return Err("文件超过预览上限，请在外部应用中查看".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取产物".to_string())?;
    if bytes.len() as u64 > limit {
        return Err("文件在读取时超过预览上限".into());
    }
    preview.fingerprint = format!("{:x}", Sha256::digest(&bytes));
    match kind {
        "text" => {
            preview.media_type = "text/plain";
            preview.text =
                Some(String::from_utf8(bytes).map_err(|_| "此文本不是 UTF-8 编码".to_string())?);
        }
        "pdf" => {
            if !bytes.starts_with(b"%PDF-") {
                return Err("PDF 文件签名无效".into());
            }
            preview.media_type = "application/pdf";
            preview.base64 = Some(STANDARD.encode(bytes));
        }
        "audio" | "video" => {
            let format = match extension.as_str() {
                "mp4" if bytes.get(4..8) == Some(b"ftyp") => Some("video/mp4"),
                "m4a" if bytes.get(4..8) == Some(b"ftyp") => Some("audio/mp4"),
                "webm" if bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) => Some("video/webm"),
                "wav" if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") => {
                    Some("audio/wav")
                }
                "ogg" if bytes.starts_with(b"OggS") => Some("audio/ogg"),
                "mp3"
                    if bytes.starts_with(b"ID3")
                        || (bytes.len() > 1 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0) =>
                {
                    Some("audio/mpeg")
                }
                _ => None,
            }
            .ok_or("媒体签名与类型不匹配")?;
            preview.media_type = format;
            preview.base64 = Some(STANDARD.encode(bytes));
        }
        "image" => {
            preview.media_type = "image/png";
            preview.base64 = Some(STANDARD.encode(safe_png(&bytes)?));
        }
        _ => unreachable!(),
    }
    Ok(preview)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_plain_text_and_keeps_html_inert() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(
            temp.path().join("中文 文件.html"),
            "<script>alert(1)</script>",
        )
        .unwrap();
        let p = read_artifact(temp.path(), "中文 文件.html").unwrap();
        assert_eq!(p.kind, "text");
        assert_eq!(p.fingerprint.len(), 64);
        assert!(p.text.unwrap().contains("<script>"));
    }
    #[test]
    fn rejects_escape_private_signature_and_limit() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("bad.pdf"), "not a pdf").unwrap();
        for path in [
            "../x",
            "/etc/passwd",
            ".markune/workspace.json",
            "bad.pdf",
            "a\\b",
            "C:/x",
        ] {
            assert!(read_artifact(temp.path(), path).is_err());
        }
        let file = fs::File::create(temp.path().join("big.txt")).unwrap();
        file.set_len(3 * 1024 * 1024).unwrap();
        assert!(read_artifact(temp.path(), "big.txt").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_even_inside_workspace() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("a.txt"), "a").unwrap();
        std::os::unix::fs::symlink(temp.path().join("a.txt"), temp.path().join("b.txt")).unwrap();
        assert!(read_artifact(temp.path(), "b.txt").is_err());
    }
}

#[tauri::command]
pub async fn preview_codex_tool_image(base64_data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if base64_data.len() > 28 * 1024 * 1024 {
            return Err("工具图片超过预览上限".into());
        }
        let bytes = STANDARD
            .decode(base64_data)
            .map_err(|_| "工具图片编码无效")?;
        if bytes.len() > 20 * 1024 * 1024 {
            return Err("工具图片超过预览上限".into());
        }
        let png = safe_png(&bytes)?;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
    })
    .await
    .map_err(|_| "工具图片预览任务失败".to_string())?
}
fn safe_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    static IMAGE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = IMAGE_LOCK.lock().map_err(|_| "图片预览状态不可用")?;
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "无法识别图片")?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(64 * 1024 * 1024);
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    reader.limits(limits);
    let decoded = reader.decode().map_err(|_| "图片无法解码或超过资源上限")?;
    let mut png = Cursor::new(Vec::new());
    decoded
        .thumbnail(2048, 2048)
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|_| "无法生成图片预览")?;
    if png.get_ref().len() > 2 * 1024 * 1024 {
        return Err("图片预览超过 2 MB 上限".into());
    }
    Ok(png.into_inner())
}

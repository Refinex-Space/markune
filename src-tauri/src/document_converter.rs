use std::{
    collections::HashSet,
    env,
    fs::{self, File},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

const PANDOC_VERSION: &str = "3.10.1";
const TYPST_VERSION: &str = "0.15.1";
const PROCESS_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_WARNING_COUNT: usize = 8;
const MAX_WARNING_CHARS: usize = 500;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProfessionalExportFormat {
    Pdf,
    Word,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentExportRuntimeInfo {
    engine: &'static str,
    pandoc_version: Option<String>,
    professional_pdf: bool,
    professional_word: bool,
    typst_version: Option<String>,
}

pub struct DocumentConverterRuntime {
    main_font: Option<String>,
    pandoc: PathBuf,
    pandoc_version: String,
    reference_docx_base64: PathBuf,
    typst: Option<PathBuf>,
    typst_template: PathBuf,
    typst_version: Option<String>,
}

pub fn runtime_info(app: &AppHandle) -> DocumentExportRuntimeInfo {
    if env::var("MADORA_DOCUMENT_EXPORT_ENGINE")
        .is_ok_and(|value| value.eq_ignore_ascii_case("legacy"))
    {
        return DocumentExportRuntimeInfo {
            engine: "legacy",
            pandoc_version: None,
            professional_pdf: false,
            professional_word: false,
            typst_version: None,
        };
    }

    match resolve_runtime(app) {
        Ok(runtime) => DocumentExportRuntimeInfo {
            engine: "pandoc",
            pandoc_version: Some(runtime.pandoc_version),
            professional_pdf: runtime.typst.is_some(),
            professional_word: true,
            typst_version: runtime.typst_version,
        },
        Err(_) => DocumentExportRuntimeInfo {
            engine: "legacy",
            pandoc_version: None,
            professional_pdf: false,
            professional_word: false,
            typst_version: None,
        },
    }
}

pub fn resolve_runtime(app: &AppHandle) -> Result<DocumentConverterRuntime, String> {
    let (pandoc, pandoc_version) = resolve_bundled_binary(app, "pandoc", PANDOC_VERSION)?;
    let (typst, typst_version, main_font) =
        match resolve_bundled_binary(app, "typst", TYPST_VERSION) {
            Ok((path, version)) => match probe_main_font(&path) {
                Some(font) => (Some(path), Some(version), Some(font)),
                None => (None, None, None),
            },
            Err(_) => (None, None, None),
        };
    let resource_root = resolve_resource_root(app)?;
    let typst_template = resource_root.join("madora.typ");
    let reference_docx_base64 = resource_root.join("madora-reference.docx.base64");

    if !typst_template.is_file() || !reference_docx_base64.is_file() {
        return Err("专业文档导出模板缺失，请重新安装应用。".to_string());
    }
    Ok(DocumentConverterRuntime {
        main_font,
        pandoc,
        pandoc_version,
        reference_docx_base64,
        typst,
        typst_template,
        typst_version,
    })
}

pub fn convert(
    runtime: &DocumentConverterRuntime,
    format: ProfessionalExportFormat,
    staging: &Path,
    source: &Path,
    output: &Path,
) -> Result<Vec<String>, String> {
    let (safe_source, mut warnings) = prepare_safe_document_ast(runtime, staging, source)?;
    warnings.extend(match format {
        ProfessionalExportFormat::Word => convert_word(runtime, staging, &safe_source, output),
        ProfessionalExportFormat::Pdf => convert_pdf(runtime, staging, &safe_source, output),
    }?);
    Ok(warnings)
}

fn prepare_safe_document_ast(
    runtime: &DocumentConverterRuntime,
    staging: &Path,
    source: &Path,
) -> Result<(PathBuf, Vec<String>), String> {
    let parsed_source = staging.join("document.ast.json");
    let safe_source = staging.join("document.safe.json");
    let mut command = export_command(&runtime.pandoc);
    command.current_dir(staging).args([
        "--sandbox",
        "--from=markdown+yaml_metadata_block+footnotes+pipe_tables+task_lists+strikeout+tex_math_dollars-implicit_figures-raw_attribute-raw_html-raw_tex",
        "--to=json",
        "--wrap=none",
        source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "专业导出源文件名无效。".to_string())?,
        "--output=document.ast.json",
        "+RTS",
        "-M512M",
        "-RTS",
    ]);
    let mut warnings = run_command(command, staging, "pandoc-parse")?;
    let bytes =
        fs::read(&parsed_source).map_err(|error| format!("无法读取专业导出中间文档：{error}"))?;
    let mut document: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("专业导出中间文档无效：{error}"))?;
    let allowed_assets = collect_allowed_asset_urls(&staging.join("assets"))?;
    let ignored_images = sanitize_ast_images(&mut document, &allowed_assets);

    if ignored_images > 0 {
        warnings.push(format!(
            "专业导出已忽略 {ignored_images} 个不属于当前文档文件包的图片资源。"
        ));
    }
    let safe_bytes = serde_json::to_vec(&document)
        .map_err(|error| format!("无法序列化专业导出中间文档：{error}"))?;
    fs::write(&safe_source, safe_bytes)
        .map_err(|error| format!("无法写入专业导出中间文档：{error}"))?;
    Ok((safe_source, warnings))
}

fn collect_allowed_asset_urls(asset_root: &Path) -> Result<HashSet<String>, String> {
    let mut allowed = HashSet::new();
    collect_allowed_asset_urls_from(asset_root, asset_root, &mut allowed)?;
    Ok(allowed)
}

fn collect_allowed_asset_urls_from(
    asset_root: &Path,
    directory: &Path,
    allowed: &mut HashSet<String>,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in
        fs::read_dir(directory).map_err(|error| format!("无法检查专业导出资源目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法检查专业导出资源：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法检查专业导出资源类型：{error}"))?;
        if file_type.is_dir() {
            collect_allowed_asset_urls_from(asset_root, &entry.path(), allowed)?;
        } else if file_type.is_file() {
            let path = entry.path();
            let relative = path
                .strip_prefix(asset_root)
                .map_err(|_| "专业导出资源路径超出暂存目录。".to_string())?
                .components()
                .map(|component| {
                    percent_encode_path_segment(&component.as_os_str().to_string_lossy())
                })
                .collect::<Vec<_>>()
                .join("/");
            allowed.insert(format!("assets/{relative}"));
        }
    }
    Ok(())
}

fn sanitize_ast_images(value: &mut Value, allowed_assets: &HashSet<String>) -> usize {
    if value.get("t").and_then(Value::as_str) == Some("Image") {
        let target = value
            .pointer("/c/2/0")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !allowed_assets.contains(target) && !target.starts_with("data:image/") {
            *value = json!({
                "t": "Str",
                "c": "[图片资源未包含在当前文档文件包中]"
            });
            return 1;
        }
    }

    match value {
        Value::Array(values) => values
            .iter_mut()
            .map(|value| sanitize_ast_images(value, allowed_assets))
            .sum(),
        Value::Object(values) => values
            .values_mut()
            .map(|value| sanitize_ast_images(value, allowed_assets))
            .sum(),
        _ => 0,
    }
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

fn convert_word(
    runtime: &DocumentConverterRuntime,
    staging: &Path,
    source: &Path,
    output: &Path,
) -> Result<Vec<String>, String> {
    let reference_docx = staging.join("madora-reference.docx");
    let encoded = fs::read_to_string(&runtime.reference_docx_base64)
        .map_err(|error| format!("无法读取 Word 导出模板：{error}"))?;
    let bytes = BASE64_STANDARD
        .decode(encoded.split_whitespace().collect::<String>())
        .map_err(|_| "Word 导出模板数据无效。".to_string())?;
    fs::write(&reference_docx, bytes)
        .map_err(|error| format!("无法准备 Word 导出模板：{error}"))?;

    let mut command = export_command(&runtime.pandoc);
    command.current_dir(staging).args([
        "--from=json",
        "--to=docx",
        "--reference-doc=madora-reference.docx",
        "--resource-path=.",
        "--wrap=none",
        source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "专业导出源文件名无效。".to_string())?,
        "--output=document.docx",
        "+RTS",
        "-M512M",
        "-RTS",
    ]);

    let warnings = run_command(command, staging, "pandoc-word")?;
    validate_output(output, b"PK", "Word")?;
    Ok(warnings)
}

fn convert_pdf(
    runtime: &DocumentConverterRuntime,
    staging: &Path,
    source: &Path,
    output: &Path,
) -> Result<Vec<String>, String> {
    let typst = runtime
        .typst
        .as_ref()
        .ok_or_else(|| "专业 PDF 运行时缺少 Typst，请重新安装应用。".to_string())?;
    let main_font = runtime
        .main_font
        .as_ref()
        .ok_or_else(|| "专业 PDF 运行时缺少可用中文字体。".to_string())?;
    fs::copy(&runtime.typst_template, staging.join("madora.typ"))
        .map_err(|error| format!("无法准备 PDF 导出模板：{error}"))?;
    let code_font = platform_code_font();
    let mut pandoc = export_command(&runtime.pandoc);
    pandoc.current_dir(staging).args([
        "--from=json",
        "--to=typst",
        "--standalone",
        "--resource-path=.",
        "--variable=template:madora.typ",
        "--variable=papersize:a4",
        "--variable=page-numbering:1",
        &format!("--variable=mainfont:{main_font}"),
        &format!("--variable=codefont:{code_font}"),
        "--wrap=none",
        source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "专业导出源文件名无效。".to_string())?,
        "--output=document.typ",
        "+RTS",
        "-M512M",
        "-RTS",
    ]);
    let mut warnings = run_command(pandoc, staging, "pandoc-pdf")?;

    let mut typst_command = export_command(typst);
    typst_command.current_dir(staging).args([
        "compile",
        "--root=.",
        "--pdf-standard=1.7",
        "--diagnostic-format=short",
        "document.typ",
        "document.pdf",
    ]);
    warnings.extend(run_command(typst_command, staging, "typst-pdf")?);
    validate_output(output, b"%PDF-", "PDF")?;
    Ok(warnings)
}

fn run_command(mut command: Command, staging: &Path, label: &str) -> Result<Vec<String>, String> {
    let stdout_path = staging.join(format!("{label}.stdout"));
    let stderr_path = staging.join(format!("{label}.stderr"));
    let stdout =
        File::create(&stdout_path).map_err(|error| format!("无法创建专业导出日志：{error}"))?;
    let stderr =
        File::create(&stderr_path).map_err(|error| format!("无法创建专业导出日志：{error}"))?;
    let mut child = command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| format!("无法启动专业导出运行时：{error}"))?;
    let started_at = Instant::now();

    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("无法读取专业导出进程状态：{error}"))?
        {
            break status;
        }
        if started_at.elapsed() >= PROCESS_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("专业文档导出超过 45 秒，已终止转换。".to_string());
        }
        thread::sleep(Duration::from_millis(25));
    };

    let stderr = fs::read_to_string(&stderr_path).unwrap_or_default();
    if !status.success() {
        let detail = sanitize_diagnostic(&stderr, staging);
        return Err(if detail.is_empty() {
            "专业文档导出运行时返回失败状态。".to_string()
        } else {
            format!("专业文档导出失败：{detail}")
        });
    }

    Ok(warnings_from_stderr(&stderr, staging))
}

fn validate_output(path: &Path, signature: &[u8], label: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|error| format!("{label} 导出产物缺失：{error}"))?;
    if !bytes.starts_with(signature) {
        return Err(format!("{label} 导出产物签名无效。"));
    }
    Ok(())
}

fn warnings_from_stderr(value: &str, staging: &Path) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(MAX_WARNING_COUNT)
        .map(|line| {
            format!(
                "专业导出提示：{}",
                truncate_chars(&redact_staging_path(line, staging), MAX_WARNING_CHARS)
            )
        })
        .collect()
}

fn sanitize_diagnostic(value: &str, staging: &Path) -> String {
    let joined = value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(4)
        .collect::<Vec<_>>()
        .join("；");
    truncate_chars(&redact_staging_path(&joined, staging), MAX_WARNING_CHARS)
}

fn redact_staging_path(value: &str, staging: &Path) -> String {
    value.replace(&staging.to_string_lossy().to_string(), "<staging>")
}

fn truncate_chars(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let truncated = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn resolve_resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("document-export"));
        candidates.push(resource_dir.join("document-export"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("document-export"),
    );

    candidates
        .into_iter()
        .find(|candidate| candidate.is_dir())
        .ok_or_else(|| "专业文档导出资源缺失，请重新安装应用。".to_string())
}

fn resolve_bundled_binary(
    app: &AppHandle,
    name: &str,
    required_version: &str,
) -> Result<(PathBuf, String), String> {
    let executable_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&executable_name));
        candidates.push(resource_dir.join("binaries").join(&executable_name));
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(&executable_name));
        }
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(staged_binary_name(name)),
    );

    for candidate in candidates {
        if let Some(version) = probe_version(&candidate) {
            let required = format!("{name} {required_version}");
            if version.starts_with(&required) {
                return Ok((candidate, version));
            }
        }
    }

    Err(format!(
        "未找到锁定版本的 {name} {required_version} 专业导出运行时。"
    ))
}

fn probe_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let output = export_command(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string(),
    )
}

fn staged_binary_name(name: &str) -> String {
    let extension = if cfg!(windows) { ".exe" } else { "" };
    format!("{name}-{}{extension}", target_triple())
}

fn target_triple() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else {
        "unsupported"
    }
}

fn platform_main_font_candidates() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["Songti SC", "STSong"]
    } else if cfg!(target_os = "windows") {
        &["Microsoft YaHei", "SimSun"]
    } else {
        &["Noto Serif CJK SC", "Noto Sans CJK SC", "WenQuanYi Zen Hei"]
    }
}

fn platform_code_font() -> &'static str {
    if cfg!(target_os = "macos") {
        "Menlo"
    } else if cfg!(target_os = "windows") {
        "Consolas"
    } else {
        "DejaVu Sans Mono"
    }
}

fn probe_main_font(typst: &Path) -> Option<String> {
    let output = export_command(typst).arg("fonts").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let fonts = String::from_utf8_lossy(&output.stdout);
    platform_main_font_candidates()
        .iter()
        .find(|candidate| fonts.lines().any(|line| line.trim() == **candidate))
        .map(|font| (*font).to_string())
}

fn export_command(path: &Path) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = Command::new(path);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    #[cfg(not(target_os = "windows"))]
    Command::new(path)
}

#[cfg(test)]
mod tests {
    use super::{
        collect_allowed_asset_urls, convert, probe_version, redact_staging_path,
        sanitize_ast_images, staged_binary_name, truncate_chars, DocumentConverterRuntime,
        ProfessionalExportFormat,
    };
    use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
    use serde_json::json;
    use std::{collections::HashSet, fs, io::Read, path::Path, path::PathBuf};
    use tempfile::tempdir;
    use zip::ZipArchive;

    #[test]
    fn redacts_staging_paths_from_converter_diagnostics() {
        let staging = Path::new("/private/tmp/madora-export-123");
        assert_eq!(
            redact_staging_path(
                "/private/tmp/madora-export-123/document.typ:4:1 warning",
                staging,
            ),
            "<staging>/document.typ:4:1 warning"
        );
    }

    #[test]
    fn truncates_converter_diagnostics_by_characters() {
        assert_eq!(truncate_chars("中文diagnostic", 4), "中文di…");
        assert_eq!(truncate_chars("正常", 4), "正常");
    }

    #[test]
    fn staged_binary_name_matches_the_current_tauri_target() {
        let name = staged_binary_name("pandoc");
        assert!(name.starts_with("pandoc-"));
        assert_ne!(name, "pandoc-unsupported");
    }

    #[test]
    fn only_keeps_images_from_the_staged_asset_whitelist() {
        let mut document = json!({
            "blocks": [{
                "t": "Para",
                "c": [
                    {"t": "Image", "c": [["", [], []], [{"t": "Str", "c": "safe"}], ["assets/safe.png", ""]]},
                    {"t": "Space"},
                    {"t": "Image", "c": [["", [], []], [{"t": "Str", "c": "unsafe"}], ["/Users/example/private.png", ""]]},
                    {"t": "Space"},
                    {"t": "Image", "c": [["", [], []], [{"t": "Str", "c": "inline"}], ["data:image/png;base64,AQID", ""]]}
                ]
            }]
        });
        let allowed = HashSet::from(["assets/safe.png".to_string()]);

        assert_eq!(sanitize_ast_images(&mut document, &allowed), 1);
        assert_eq!(document.pointer("/blocks/0/c/0/t"), Some(&json!("Image")));
        assert_eq!(
            document.pointer("/blocks/0/c/2"),
            Some(&json!({
                "t": "Str",
                "c": "[图片资源未包含在当前文档文件包中]"
            }))
        );
        assert_eq!(document.pointer("/blocks/0/c/4/t"), Some(&json!("Image")));
    }

    #[test]
    fn builds_percent_encoded_asset_urls_from_staging_files() {
        let directory = tempdir().unwrap();
        let assets = directory.path().join("assets");
        fs::create_dir_all(assets.join("图表")).unwrap();
        fs::write(assets.join("图表").join("hello world.png"), b"png").unwrap();

        assert_eq!(
            collect_allowed_asset_urls(&assets).unwrap(),
            HashSet::from(["assets/%E5%9B%BE%E8%A1%A8/hello%20world.png".to_string()])
        );
    }

    #[test]
    #[ignore = "requires document-export:stage"]
    fn staged_runtime_generates_real_word_and_pdf_files() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let pandoc = manifest.join("binaries").join(staged_binary_name("pandoc"));
        let typst = manifest.join("binaries").join(staged_binary_name("typst"));
        let resource_root = manifest.join("resources").join("document-export");
        let directory = tempdir().unwrap();
        let source = directory.path().join("source.md");
        let assets = directory.path().join("assets");
        fs::create_dir(&assets).unwrap();
        fs::write(
            assets.join("sample.png"),
            BASE64_STANDARD
                .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
                .unwrap(),
        )
        .unwrap();
        fs::write(
            &source,
            "# 专业导出验收\n\n中文正文与 **强调**。\n\n![测试图片](assets/sample.png)\n\n| 项目 | 状态 |\n|---|---|\n| Word | 完成 |\n",
        )
        .unwrap();
        let runtime = DocumentConverterRuntime {
            main_font: Some("Songti SC".to_string()),
            pandoc: pandoc.clone(),
            pandoc_version: probe_version(&pandoc).unwrap(),
            reference_docx_base64: resource_root.join("madora-reference.docx.base64"),
            typst: Some(typst.clone()),
            typst_template: resource_root.join("madora.typ"),
            typst_version: Some(probe_version(&typst).unwrap()),
        };
        let word = directory.path().join("document.docx");
        convert(
            &runtime,
            ProfessionalExportFormat::Word,
            directory.path(),
            &source,
            &word,
        )
        .unwrap();
        assert!(fs::metadata(&word).unwrap().len() > 10_000);
        let mut archive = ZipArchive::new(fs::File::open(&word).unwrap()).unwrap();
        assert!((0..archive.len()).any(|index| {
            archive
                .by_index(index)
                .is_ok_and(|file| file.name().starts_with("word/media/"))
        }));
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();
        let page_size = document_xml
            .split("<w:pgSz")
            .nth(1)
            .and_then(|value| value.split("/>").next())
            .unwrap();
        assert!(page_size.contains(r#"w:w="11906""#));
        assert!(page_size.contains(r#"w:h="16838""#));

        let pdf = directory.path().join("document.pdf");
        convert(
            &runtime,
            ProfessionalExportFormat::Pdf,
            directory.path(),
            &source,
            &pdf,
        )
        .unwrap();
        assert!(fs::metadata(&pdf).unwrap().len() > 1_000);
    }
}

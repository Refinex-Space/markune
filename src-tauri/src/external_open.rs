use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, Url};

use crate::workspace::{is_markdown_document_file, WORKSPACE_PRIVATE_DIR};

pub const EXTERNAL_OPEN_EVENT: &str = "markune-external-open";
const LEGACY_PRIVATE_DIR: &str = ".madora";
const MAX_OPEN_PATHS: usize = 8;
const MAX_WORKSPACE_WALK_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalOpenRequest {
    pub id: u64,
    pub workspace_root: String,
    pub document_path: String,
}

#[derive(Debug, Default)]
pub struct ExternalOpenState {
    inner: Mutex<ExternalOpenInner>,
}

#[derive(Debug, Default)]
struct ExternalOpenInner {
    next_id: u64,
    pending: Option<ExternalOpenRequest>,
}

impl ExternalOpenState {
    fn publish(&self, workspace_root: String, document_path: String) -> ExternalOpenRequest {
        let mut inner = self.inner.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(pending) = inner.pending.as_ref() {
            if pending.workspace_root == workspace_root && pending.document_path == document_path {
                return pending.clone();
            }
        }

        inner.next_id = inner.next_id.saturating_add(1);
        let request = ExternalOpenRequest {
            id: inner.next_id,
            workspace_root,
            document_path,
        };
        inner.pending = Some(request.clone());
        request
    }

    fn take(&self) -> Option<ExternalOpenRequest> {
        self.inner
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .pending
            .take()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedMarkdownOpen {
    pub workspace_root: PathBuf,
    pub document_path: PathBuf,
}

#[tauri::command]
pub fn take_external_open_request(app: AppHandle) -> Option<ExternalOpenRequest> {
    app.state::<ExternalOpenState>().take()
}

pub fn ingest_process_args<R: Runtime>(app: &AppHandle<R>) {
    ingest_paths(app, collect_paths_from_args(std::env::args()), false);
}

pub fn handle_argv<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>) {
    focus_main_window(app);
    ingest_paths(app, collect_paths_from_args(argv), true);
}

pub fn handle_opened_urls<R: Runtime>(app: &AppHandle<R>, urls: Vec<Url>) {
    let paths = urls
        .into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .collect::<Vec<_>>();
    ingest_paths(app, paths, true);
}

fn ingest_paths<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>, focus: bool) {
    if paths.is_empty() {
        return;
    }

    match resolve_markdown_open_paths(&paths) {
        Ok(resolved) => {
            if focus {
                focus_main_window(app);
            }
            publish_request(
                app,
                path_to_string(&resolved.workspace_root),
                path_to_string(&resolved.document_path),
            );
        }
        Err(error) => {
            log::warn!("无法处理系统打开请求：{error}");
        }
    }
}

fn publish_request<R: Runtime>(app: &AppHandle<R>, workspace_root: String, document_path: String) {
    let request = app
        .state::<ExternalOpenState>()
        .publish(workspace_root, document_path);
    if let Err(error) = app.emit(EXTERNAL_OPEN_EVENT, &request) {
        log::warn!("无法广播系统打开请求：{error}");
    }
}

fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn collect_paths_from_args<I>(args: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = String>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|arg| parse_open_argument(&arg))
        .take(MAX_OPEN_PATHS)
        .collect()
}

pub fn parse_open_argument(arg: &str) -> Option<PathBuf> {
    let trimmed = arg.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }

    if trimmed.contains("://") {
        let url = Url::parse(trimmed).ok()?;
        if url.scheme() != "file" {
            return None;
        }
        return url.to_file_path().ok();
    }

    Some(PathBuf::from(trimmed))
}

pub fn resolve_markdown_open_paths(paths: &[PathBuf]) -> Result<ResolvedMarkdownOpen, String> {
    let mut last_error = None;

    for path in paths {
        match canonicalize_markdown_file(path) {
            Ok(document) => {
                let workspace_root = resolve_workspace_root_for_document(&document)?;
                return Ok(ResolvedMarkdownOpen {
                    workspace_root,
                    document_path: document,
                });
            }
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| "没有可打开的 Markdown 文档".to_string()))
}

fn canonicalize_markdown_file(path: &Path) -> Result<PathBuf, String> {
    reject_symlink(path)?;
    let canonical = path
        .canonicalize()
        .map_err(|_| "打开路径不存在".to_string())?;
    let metadata = fs::metadata(&canonical).map_err(|_| "打开路径不存在".to_string())?;

    if !metadata.is_file() {
        return Err("系统打开方式目前只支持 Markdown 文件".to_string());
    }

    if !is_markdown_document_file(&canonical) {
        return Err("仅支持 Markdown 文档".to_string());
    }

    Ok(canonical)
}

fn resolve_workspace_root_for_document(document: &Path) -> Result<PathBuf, String> {
    let mut current = document
        .parent()
        .ok_or_else(|| "文档路径无效".to_string())?
        .to_path_buf();

    for _ in 0..MAX_WORKSPACE_WALK_DEPTH {
        reject_symlink(&current)?;
        if let Some(private_dir) = existing_workspace_private_dir(&current)? {
            if document.starts_with(&private_dir) {
                return Err("不能从系统打开工作区私有文件".to_string());
            }
            return Ok(current);
        }

        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => break,
        }
    }

    let parent = document
        .parent()
        .ok_or_else(|| "文档路径无效".to_string())?;
    reject_symlink(parent)?;

    if parent.parent().is_none() {
        return Err("不能把磁盘根目录当作工作区".to_string());
    }

    Ok(parent.to_path_buf())
}

fn existing_workspace_private_dir(directory: &Path) -> Result<Option<PathBuf>, String> {
    for name in [WORKSPACE_PRIVATE_DIR, LEGACY_PRIVATE_DIR] {
        let private = directory.join(name);
        match fs::symlink_metadata(&private) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("工作区私有目录不能是符号链接".to_string());
            }
            Ok(metadata) if metadata.is_dir() => {
                return Ok(Some(
                    private
                        .canonicalize()
                        .map_err(|_| "无法读取工作区私有目录".to_string())?,
                ));
            }
            Ok(_) => continue,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(_) => return Err("无法读取工作区私有目录".to_string()),
        }
    }

    Ok(None)
}

fn reject_symlink(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "打开路径不存在".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("不能打开符号链接".to_string());
    }
    Ok(())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn parse_open_argument_skips_flags_and_non_file_urls() {
        assert!(parse_open_argument("").is_none());
        assert!(parse_open_argument("--dev").is_none());
        assert!(parse_open_argument("https://example.com/note.md").is_none());
        assert_eq!(
            parse_open_argument(" /tmp/note.md "),
            Some(PathBuf::from("/tmp/note.md"))
        );
    }

    #[test]
    fn collect_paths_from_args_skips_executable() {
        let paths = collect_paths_from_args([
            String::from("/Applications/Markune.app/Contents/MacOS/Markune"),
            String::from("--flag"),
            String::from("/tmp/a.md"),
        ]);
        assert_eq!(paths, vec![PathBuf::from("/tmp/a.md")]);
    }

    #[test]
    fn resolve_uses_nearest_markune_workspace() {
        let temp = tempfile::tempdir().expect("tempdir");
        let vault = temp.path().join("vault");
        let nested = vault.join("notes");
        fs::create_dir_all(&nested).expect("nested");
        fs::create_dir(vault.join(WORKSPACE_PRIVATE_DIR)).expect("private");
        let document = nested.join("guide.md");
        write_doc(&document);

        let resolved = resolve_markdown_open_paths(&[document.clone()]).expect("resolve");
        assert_eq!(
            resolved.workspace_root,
            vault.canonicalize().expect("vault")
        );
        assert_eq!(
            resolved.document_path,
            document.canonicalize().expect("document")
        );
    }

    #[test]
    fn resolve_uses_legacy_madora_workspace() {
        let temp = tempfile::tempdir().expect("tempdir");
        let vault = temp.path().join("legacy");
        fs::create_dir_all(&vault).expect("vault");
        fs::create_dir(vault.join(LEGACY_PRIVATE_DIR)).expect("legacy");
        let document = vault.join("note.md");
        write_doc(&document);

        let resolved = resolve_markdown_open_paths(&[document]).expect("resolve");
        assert_eq!(
            resolved.workspace_root,
            vault.canonicalize().expect("vault")
        );
    }

    #[test]
    fn resolve_falls_back_to_parent_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("inbox");
        fs::create_dir_all(&folder).expect("folder");
        let document = folder.join("scratch.mdx");
        write_doc(&document);

        let resolved = resolve_markdown_open_paths(&[document]).expect("resolve");
        assert_eq!(
            resolved.workspace_root,
            folder.canonicalize().expect("folder")
        );
    }

    #[test]
    fn resolve_skips_non_markdown_when_a_markdown_file_is_present() {
        let temp = tempfile::tempdir().expect("tempdir");
        let folder = temp.path().join("mixed");
        fs::create_dir_all(&folder).expect("folder");
        let text = folder.join("readme.txt");
        let document = folder.join("readme.md");
        write_doc(&text);
        write_doc(&document);

        let resolved =
            resolve_markdown_open_paths(&[text, document.clone()]).expect("resolve");
        assert_eq!(
            resolved.document_path,
            document.canonicalize().expect("document")
        );
    }

    #[test]
    fn resolve_rejects_workspace_private_files() {
        let temp = tempfile::tempdir().expect("tempdir");
        let vault = temp.path().join("vault");
        let private = vault.join(WORKSPACE_PRIVATE_DIR).join("inbox");
        fs::create_dir_all(&private).expect("private");
        let document = private.join("capture.md");
        write_doc(&document);

        let error = resolve_markdown_open_paths(&[document]).expect_err("private");
        assert!(error.contains("私有文件"));
    }

    #[test]
    fn resolve_rejects_missing_and_non_markdown_only_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let missing = temp.path().join("gone.md");
        assert!(resolve_markdown_open_paths(&[missing]).is_err());

        let text = temp.path().join("notes.txt");
        write_doc(&text);
        let error = resolve_markdown_open_paths(&[text]).expect_err("txt");
        assert!(error.contains("Markdown"));
    }

    #[cfg(unix)]
    #[test]
    fn resolve_rejects_symlinked_markdown_files() {
        let temp = tempfile::tempdir().expect("tempdir");
        let document = temp.path().join("real.md");
        let link = temp.path().join("alias.md");
        write_doc(&document);
        std::os::unix::fs::symlink(&document, &link).expect("symlink");
        let error = resolve_markdown_open_paths(&[link]).expect_err("symlink");
        assert!(error.contains("符号链接"));
    }

    #[test]
    fn pending_state_deduplicates_identical_requests_until_taken() {
        let state = ExternalOpenState::default();
        let first = state.publish("/vault".into(), "/vault/a.md".into());
        let second = state.publish("/vault".into(), "/vault/a.md".into());
        assert_eq!(first, second);
        assert_eq!(state.take(), Some(first.clone()));
        let third = state.publish("/vault".into(), "/vault/a.md".into());
        assert_ne!(third.id, first.id);
    }

    fn write_doc(path: &Path) {
        let mut file = fs::File::create(path).expect("create");
        file.write_all(b"# note\n").expect("write");
    }
}

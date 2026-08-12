use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const MAX_GIT_OUTPUT_BYTES: usize = 1024 * 1024;
const GIT_LOCAL_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);
const GIT_LONG_COMMAND_TIMEOUT: Duration = Duration::from_secs(180);
const GIT_PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(25);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const GIT_SYNC_COMMIT_MESSAGE: &str = "Updated from Madora";
const GIT_SYNC_CONFLICT_MESSAGE: &str = "远端和本地同时修改了同一文件，请在 Git 面板处理后重试。";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitProbe {
    pub git_available: bool,
    pub is_repository: bool,
    pub root_path: String,
    pub branch: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandOutput {
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub root_path: String,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInfo {
    pub remote_url: Option<String>,
    pub web_url: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResult {
    pub last_synced_at: String,
    pub status: GitStatus,
    /// Repository-relative paths that the pull (merge of the fetched upstream)
    /// brought into the working tree. Empty when the sync only pushed local
    /// commits or nothing changed. Lets the UI reload just those documents and
    /// tree nodes instead of a full rescan. author: liyao
    pub changed_paths: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub old_path: Option<String>,
    pub change_type: GitChangeType,
    pub index_status: String,
    pub working_tree_status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GitChangeType {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Untracked,
    Unknown,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub path: String,
    pub staged: bool,
    pub binary: bool,
    pub truncated: bool,
    pub content: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchItem {
    pub name: String,
    pub full_name: String,
    pub kind: GitBranchKind,
    pub current: bool,
    pub upstream: Option<String>,
    pub commit: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GitBranchKind {
    Local,
    Remote,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub body: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub change_type: GitChangeType,
}

#[tauri::command]
pub async fn git_probe(root_path: String) -> Result<GitProbe, String> {
    run_blocking_git_command(move || git_probe_sync(root_path)).await
}

#[tauri::command]
pub async fn git_init(root_path: String) -> Result<GitProbe, String> {
    run_blocking_git_command(move || git_init_sync(root_path)).await
}

#[tauri::command]
pub async fn git_status(root_path: String) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_status_sync(root_path)).await
}

#[tauri::command]
pub async fn git_remote_info(root_path: String) -> Result<GitRemoteInfo, String> {
    run_blocking_git_command(move || git_remote_info_sync(root_path)).await
}

#[tauri::command]
pub async fn git_diff(root_path: String, path: String, staged: bool) -> Result<GitDiff, String> {
    run_blocking_git_command(move || git_diff_sync(root_path, path, staged)).await
}

#[tauri::command]
pub async fn git_commit_file_diff(
    root_path: String,
    hash: String,
    path: String,
) -> Result<GitDiff, String> {
    run_blocking_git_command(move || git_commit_file_diff_sync(root_path, hash, path)).await
}

#[tauri::command]
pub async fn git_branches(root_path: String) -> Result<Vec<GitBranchItem>, String> {
    run_blocking_git_command(move || git_branches_sync(root_path)).await
}

#[tauri::command]
pub async fn git_log(root_path: String) -> Result<Vec<GitCommitEntry>, String> {
    run_blocking_git_command(move || git_log_sync(root_path)).await
}

#[tauri::command]
pub async fn git_commit_files(
    root_path: String,
    hash: String,
) -> Result<Vec<GitCommitFile>, String> {
    run_blocking_git_command(move || git_commit_files_sync(root_path, hash)).await
}

#[tauri::command]
pub async fn git_stage(root_path: String, paths: Vec<String>) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_stage_sync(root_path, paths)).await
}

#[tauri::command]
pub async fn git_unstage(root_path: String, paths: Vec<String>) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_unstage_sync(root_path, paths)).await
}

#[tauri::command]
pub async fn git_commit(
    root_path: String,
    message: String,
    paths: Vec<String>,
) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_commit_sync(root_path, message, paths)).await
}

#[tauri::command]
pub async fn git_push(root_path: String) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_push_sync(root_path)).await
}

#[tauri::command]
pub async fn git_sync_now(
    root_path: String,
    conflict_resolution: String,
) -> Result<GitSyncResult, String> {
    run_blocking_git_command(move || git_sync_now_sync(root_path, conflict_resolution)).await
}

#[tauri::command]
pub async fn git_revert_file(root_path: String, path: String) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_revert_file_sync(root_path, path)).await
}

#[tauri::command]
pub async fn git_delete_file(root_path: String, path: String) -> Result<GitStatus, String> {
    run_blocking_git_command(move || git_delete_file_sync(root_path, path)).await
}

async fn run_blocking_git_command<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Git 后台任务执行失败：{error}"))?
}

fn git_probe_sync(root_path: String) -> Result<GitProbe, String> {
    let root = canonical_root(&root_path)?;
    let git_available = run_git(&root, &["--version"]).is_ok();

    if !git_available {
        return Ok(GitProbe {
            git_available: false,
            is_repository: false,
            root_path: root.to_string_lossy().to_string(),
            branch: None,
        });
    }

    let is_repository = run_git(&root, &["rev-parse", "--is-inside-work-tree"])
        .map(|output| output.stdout.trim() == "true")
        .unwrap_or(false);
    let branch = if is_repository {
        run_git(&root, &["branch", "--show-current"])
            .ok()
            .map(|output| output.stdout.trim().to_string())
            .filter(|value| !value.is_empty())
    } else {
        None
    };

    Ok(GitProbe {
        git_available,
        is_repository,
        root_path: root.to_string_lossy().to_string(),
        branch,
    })
}

fn git_init_sync(root_path: String) -> Result<GitProbe, String> {
    let root = canonical_root(&root_path)?;
    run_git(&root, &["init"])?;
    git_probe_sync(root.to_string_lossy().to_string())
}

fn git_status_sync(root_path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let output = run_git(&root, &["status", "--porcelain=v2", "--branch", "-z"])?;

    Ok(parse_status(&root, &output.stdout))
}

fn git_remote_info_sync(root_path: String) -> Result<GitRemoteInfo, String> {
    let root = canonical_root(&root_path)?;
    let remote_url = run_git(&root, &["remote", "get-url", "origin"])
        .ok()
        .map(|output| sanitize_remote_url(output.stdout.trim()))
        .filter(|value| !value.is_empty());
    let web_url = remote_url.as_deref().and_then(remote_url_to_web_url);

    Ok(GitRemoteInfo {
        remote_url,
        web_url,
    })
}

fn git_diff_sync(root_path: String, path: String, staged: bool) -> Result<GitDiff, String> {
    let root = canonical_root(&root_path)?;
    validate_repo_relative_path(&root, &path)?;
    let args = if staged {
        vec!["diff", "--staged", "--", path.as_str()]
    } else {
        vec!["diff", "--", path.as_str()]
    };
    let output = run_git(&root, &args)?;
    let binary = output.content_contains_binary_marker();

    Ok(GitDiff {
        path,
        staged,
        binary,
        truncated: false,
        content: output.stdout,
    })
}

fn git_commit_file_diff_sync(
    root_path: String,
    hash: String,
    path: String,
) -> Result<GitDiff, String> {
    let root = canonical_root(&root_path)?;
    validate_commit_hash(&hash)?;
    validate_repo_relative_path(&root, &path)?;
    let output = run_git(
        &root,
        &[
            "show",
            "--format=",
            "--find-renames",
            hash.as_str(),
            "--",
            path.as_str(),
        ],
    )?;
    let binary = output.content_contains_binary_marker();

    Ok(GitDiff {
        path,
        staged: false,
        binary,
        truncated: false,
        content: output.stdout,
    })
}

fn git_branches_sync(root_path: String) -> Result<Vec<GitBranchItem>, String> {
    let root = canonical_root(&root_path)?;
    let output = run_git(
        &root,
        &[
            "for-each-ref",
            "--format=%(refname)%09%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(HEAD)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;

    Ok(parse_branches(&output.stdout))
}

fn git_log_sync(root_path: String) -> Result<Vec<GitCommitEntry>, String> {
    let root = canonical_root(&root_path)?;
    let output = run_git(
        &root,
        &[
            "log",
            "--all",
            "--max-count=100",
            "--date=iso-strict",
            "--decorate=short",
            "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%D%x1f%s%x1f%b%x1e",
        ],
    )?;

    Ok(parse_log(&output.stdout))
}

fn git_commit_files_sync(root_path: String, hash: String) -> Result<Vec<GitCommitFile>, String> {
    let root = canonical_root(&root_path)?;
    validate_commit_hash(&hash)?;
    let output = run_git(
        &root,
        &[
            "show",
            "--name-status",
            "--format=",
            "--find-renames",
            "-z",
            hash.as_str(),
        ],
    )?;

    Ok(parse_commit_files(&output.stdout))
}

fn git_stage_sync(root_path: String, paths: Vec<String>) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let safe_paths = validate_paths(&root, paths)?;
    let mut args = vec!["add", "--"];
    let path_refs = safe_paths.iter().map(String::as_str).collect::<Vec<_>>();
    args.extend(path_refs);
    run_git(&root, &args)?;
    git_status_sync(root.to_string_lossy().to_string())
}

fn git_unstage_sync(root_path: String, paths: Vec<String>) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let safe_paths = validate_paths(&root, paths)?;
    let path_refs = safe_paths.iter().map(String::as_str).collect::<Vec<_>>();
    let mut restore_args = vec!["restore", "--staged", "--"];
    restore_args.extend(path_refs.iter().copied());

    if let Err(error) = run_git(&root, &restore_args) {
        let mut rm_args = vec!["rm", "--cached", "-r", "--"];
        rm_args.extend(path_refs);
        run_git(&root, &rm_args).map_err(|_| error)?;
    }

    git_status_sync(root.to_string_lossy().to_string())
}

fn git_commit_sync(
    root_path: String,
    message: String,
    paths: Vec<String>,
) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let trimmed = message.trim();

    if trimmed.is_empty() {
        return Err("提交信息不能为空".to_string());
    }

    if paths.is_empty() {
        return Err("请选择要提交的文件".to_string());
    }

    git_stage_sync(root.to_string_lossy().to_string(), paths)?;
    run_git_long(&root, &["commit", "-m", trimmed])?;
    git_status_sync(root.to_string_lossy().to_string())
}

fn git_push_sync(root_path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    run_git_long(&root, &["push"])?;
    git_status_sync(root.to_string_lossy().to_string())
}

fn git_sync_now_sync(
    root_path: String,
    conflict_resolution: String,
) -> Result<GitSyncResult, String> {
    let root = canonical_root(&root_path)?;
    validate_sync_conflict_resolution(&conflict_resolution)?;
    ensure_git_repository(&root)?;
    let remote = git_remote_info_sync(root.to_string_lossy().to_string())?;

    if remote.remote_url.is_none() {
        return Err("未配置 Git 远程仓库".to_string());
    }

    run_git_long(&root, &["fetch", "origin"])?;
    let mut status = git_status_sync(root.to_string_lossy().to_string())?;
    let had_local_changes = !status.changes.is_empty();

    if had_local_changes {
        run_git(&root, &["add", "-A"])?;
        run_git_long(&root, &["commit", "-m", GIT_SYNC_COMMIT_MESSAGE])?;
        status = git_status_sync(root.to_string_lossy().to_string())?;
    }

    let mut changed_paths = Vec::new();

    if let Some(upstream) = status.upstream.as_deref() {
        // Capture HEAD before the merge so the pulled changes can be isolated
        // from the local commit we may have just created. author: liyao
        let before_merge_head = read_head_commit(&root);
        let mut merge_args = vec!["merge", "--no-edit"];
        match conflict_resolution.as_str() {
            "local" => merge_args.extend(["-X", "ours"]),
            "remote" => merge_args.extend(["-X", "theirs"]),
            _ => {}
        }
        merge_args.push(upstream);

        if run_git_long(&root, &merge_args).is_err() {
            let _ = run_git(&root, &["merge", "--abort"]);

            return Err(GIT_SYNC_CONFLICT_MESSAGE.to_string());
        }

        let after_merge_head = read_head_commit(&root);
        if let (Some(before), Some(after)) = (&before_merge_head, &after_merge_head) {
            if before != after {
                changed_paths = diff_changed_paths(&root, before, after);
            }
        }

        status = git_status_sync(root.to_string_lossy().to_string())?;

        if had_local_changes || status.ahead > 0 {
            run_git_long(&root, &["push"])?;
        }
    } else {
        let branch = status
            .branch
            .as_deref()
            .ok_or_else(|| "无法确定当前 Git 分支".to_string())?;
        run_git_long(&root, &["push", "-u", "origin", branch])?;
    }

    Ok(GitSyncResult {
        last_synced_at: DateTime::<Utc>::from(SystemTime::now())
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        status: git_status_sync(root.to_string_lossy().to_string())?,
        changed_paths,
    })
}

fn read_head_commit(root: &Path) -> Option<String> {
    run_git(root, &["rev-parse", "HEAD"])
        .ok()
        .map(|output| output.stdout.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn diff_changed_paths(root: &Path, before: &str, after: &str) -> Vec<String> {
    let range = format!("{before}..{after}");
    let Ok(output) = run_git(root, &["diff", "--name-only", "-z", range.as_str()]) else {
        return Vec::new();
    };

    output
        .stdout
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn git_revert_file_sync(root_path: String, path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let target = validate_existing_repo_file_path(&root, &path)?;

    if is_untracked(&root, &path)? {
        delete_file_inside_root(&root, &target)?;
        return git_status_sync(root.to_string_lossy().to_string());
    }

    let _ = git_unstage_sync(root.to_string_lossy().to_string(), vec![path.clone()]);
    run_git(&root, &["restore", "--worktree", "--", path.as_str()])?;
    git_status_sync(root.to_string_lossy().to_string())
}

fn git_delete_file_sync(root_path: String, path: String) -> Result<GitStatus, String> {
    let root = canonical_root(&root_path)?;
    let target = validate_existing_repo_file_path(&root, &path)?;

    if is_untracked(&root, &path)? {
        delete_file_inside_root(&root, &target)?;
    } else {
        run_git(&root, &["rm", "-f", "--", path.as_str()])?;
    }

    git_status_sync(root.to_string_lossy().to_string())
}

pub fn canonical_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;

    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }

    Ok(root)
}

pub fn validate_repo_relative_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径不安全：路径不能为空".to_string());
    }

    let relative = Path::new(path);

    if relative.is_absolute() {
        return Err("路径不安全：不允许绝对路径".to_string());
    }

    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    Ok(root.join(relative))
}

fn validate_paths(root: &Path, paths: Vec<String>) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err("请选择文件".to_string());
    }

    for path in &paths {
        validate_repo_relative_path(root, path)?;
    }

    Ok(paths)
}

fn validate_existing_repo_file_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    let target = validate_repo_relative_path(root, path)?;
    let canonical = target
        .canonicalize()
        .map_err(|_| "文件不存在".to_string())?;

    if !canonical.starts_with(root) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    if !canonical.is_file() {
        return Err("目标不是文件".to_string());
    }

    Ok(canonical)
}

fn validate_commit_hash(hash: &str) -> Result<(), String> {
    let trimmed = hash.trim();

    if !(4..=64).contains(&trimmed.len()) {
        return Err("提交编号不合法".to_string());
    }

    if !trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("提交编号不合法".to_string());
    }

    Ok(())
}

fn delete_file_inside_root(root: &Path, target: &Path) -> Result<(), String> {
    if !target.starts_with(root) {
        return Err("路径不安全：不允许跳出工作区".to_string());
    }

    std::fs::remove_file(target).map_err(|_| "无法删除文件".to_string())
}

fn is_untracked(root: &Path, path: &str) -> Result<bool, String> {
    let output = run_git(&root, &["status", "--porcelain=v2", "-z", "--", path])?;

    Ok(output
        .stdout
        .split('\0')
        .any(|entry| entry.strip_prefix("? ").is_some()))
}

fn ensure_git_repository(root: &Path) -> Result<(), String> {
    let output = run_git(root, &["rev-parse", "--is-inside-work-tree"])?;

    if output.stdout.trim() == "true" {
        Ok(())
    } else {
        Err("当前工作区不是 Git 仓库".to_string())
    }
}

fn validate_sync_conflict_resolution(value: &str) -> Result<(), String> {
    if matches!(value, "abort" | "local" | "remote") {
        Ok(())
    } else {
        Err("Git Sync 差异处理策略不支持".to_string())
    }
}

fn sanitize_remote_url(remote_url: &str) -> String {
    let trimmed = remote_url.trim();

    for scheme in ["https://", "http://"] {
        let Some(rest) = trimmed.strip_prefix(scheme) else {
            continue;
        };
        let host_start = match (rest.find('@'), rest.find('/')) {
            (Some(at_index), Some(slash_index)) if at_index < slash_index => at_index + 1,
            (Some(at_index), None) => at_index + 1,
            _ => return trimmed.to_string(),
        };

        return format!("{scheme}{}", &rest[host_start..]);
    }

    trimmed.to_string()
}

fn remote_url_to_web_url(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trim_git_suffix(trimmed).to_string());
    }

    if let Some(rest) = trimmed.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;

        return Some(format!("https://{}/{}", host, trim_git_suffix(path)));
    }

    if let Some(rest) = trimmed.strip_prefix("ssh://git@") {
        let (host, path) = rest.split_once('/')?;

        return Some(format!("https://{}/{}", host, trim_git_suffix(path)));
    }

    None
}

fn trim_git_suffix(value: &str) -> &str {
    value.strip_suffix(".git").unwrap_or(value)
}

fn parse_branches(raw: &str) -> Vec<GitBranchItem> {
    raw.lines()
        .filter_map(|line| {
            let fields = line.split('\t').collect::<Vec<_>>();

            if fields.len() < 5 {
                return None;
            }

            let full_name = fields[0];
            let name = fields[1];

            if full_name.ends_with("/HEAD") {
                return None;
            }

            let kind = if full_name.starts_with("refs/heads/") {
                GitBranchKind::Local
            } else {
                GitBranchKind::Remote
            };

            Some(GitBranchItem {
                name: name.to_string(),
                full_name: full_name.to_string(),
                kind,
                current: fields[4] == "*",
                upstream: (!fields[3].is_empty()).then(|| fields[3].to_string()),
                commit: fields[2].to_string(),
            })
        })
        .collect()
}

fn parse_log(raw: &str) -> Vec<GitCommitEntry> {
    raw.split('\x1e')
        .filter_map(|record| {
            let trimmed = record.trim_matches('\n');

            if trimmed.is_empty() {
                return None;
            }

            let fields = trimmed.splitn(8, '\x1f').collect::<Vec<_>>();

            if fields.len() < 8 {
                return None;
            }

            Some(GitCommitEntry {
                hash: fields[0].to_string(),
                short_hash: fields[1].to_string(),
                author_name: fields[2].to_string(),
                author_email: fields[3].to_string(),
                authored_at: fields[4].to_string(),
                refs: parse_refs(fields[5]),
                subject: fields[6].to_string(),
                body: fields[7].trim().to_string(),
            })
        })
        .collect()
}

fn parse_refs(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_start_matches("tag: ").to_string())
        .collect()
}

fn parse_commit_files(raw: &str) -> Vec<GitCommitFile> {
    let mut files = Vec::new();
    let mut entries = raw.split('\0').filter(|entry| !entry.is_empty());

    while let Some(status) = entries.next() {
        let Some(path) = entries.next() else {
            break;
        };
        let status_kind = status.chars().next().unwrap_or(' ');

        if matches!(status_kind, 'R' | 'C') {
            let Some(new_path) = entries.next() else {
                break;
            };

            files.push(GitCommitFile {
                path: new_path.to_string(),
                old_path: Some(path.to_string()),
                status: status.to_string(),
                change_type: commit_file_change_type(status_kind),
            });
        } else {
            files.push(GitCommitFile {
                path: path.to_string(),
                old_path: None,
                status: status.to_string(),
                change_type: commit_file_change_type(status_kind),
            });
        }
    }

    files
}

fn commit_file_change_type(status: char) -> GitChangeType {
    match status {
        'A' => GitChangeType::Added,
        'D' => GitChangeType::Deleted,
        'R' => GitChangeType::Renamed,
        'C' => GitChangeType::Copied,
        'M' => GitChangeType::Modified,
        _ => GitChangeType::Unknown,
    }
}

fn parse_status(root: &Path, raw: &str) -> GitStatus {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut changes = Vec::new();
    let mut entries = raw.split('\0').filter(|entry| !entry.is_empty());

    while let Some(entry) = entries.next() {
        if let Some(value) = entry.strip_prefix("# branch.head ") {
            if value != "(detached)" {
                branch = Some(value.to_string());
            }
            continue;
        }

        if let Some(value) = entry.strip_prefix("# branch.upstream ") {
            upstream = Some(value.to_string());
            continue;
        }

        if let Some(value) = entry.strip_prefix("# branch.ab ") {
            for part in value.split(' ') {
                if let Some(number) = part.strip_prefix('+') {
                    ahead = number.parse::<u32>().unwrap_or(0);
                }
                if let Some(number) = part.strip_prefix('-') {
                    behind = number.parse::<u32>().unwrap_or(0);
                }
            }
            continue;
        }

        if let Some(mut change) = parse_change_entry(entry) {
            if change.change_type == GitChangeType::Renamed {
                change.old_path = entries.next().map(ToString::to_string);
            }
            changes.push(change);
        }
    }

    GitStatus {
        root_path: root.to_string_lossy().to_string(),
        branch,
        upstream,
        ahead,
        behind,
        changes,
    }
}

fn parse_change_entry(entry: &str) -> Option<GitChange> {
    if let Some(path) = entry.strip_prefix("? ") {
        return Some(GitChange {
            path: path.to_string(),
            old_path: None,
            change_type: GitChangeType::Untracked,
            index_status: "?".to_string(),
            working_tree_status: "?".to_string(),
            staged: false,
        });
    }

    let fields = entry.splitn(9, ' ').collect::<Vec<_>>();
    if fields.len() < 9 {
        return None;
    }

    let record_type = fields[0];
    let status = fields[1];
    let path = fields[8].to_string();
    let index_status = status.chars().next().unwrap_or('.').to_string();
    let working_tree_status = status.chars().nth(1).unwrap_or('.').to_string();
    let change_type = match (record_type, index_status.as_str()) {
        ("2", _) | (_, "R") => GitChangeType::Renamed,
        (_, "A") => GitChangeType::Added,
        (_, "D") => GitChangeType::Deleted,
        (_, "C") => GitChangeType::Copied,
        (_, "M") | (_, ".") => {
            if working_tree_status == "D" {
                GitChangeType::Deleted
            } else {
                GitChangeType::Modified
            }
        }
        _ => GitChangeType::Unknown,
    };

    Some(GitChange {
        path,
        old_path: None,
        change_type,
        index_status: normalize_status(&index_status),
        working_tree_status: normalize_status(&working_tree_status),
        staged: index_status != ".",
    })
}

fn normalize_status(value: &str) -> String {
    if value == "." {
        String::new()
    } else {
        value.to_string()
    }
}

fn run_git(root: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    run_git_with_timeout(root, args, GIT_LOCAL_COMMAND_TIMEOUT)
}

fn run_git_long(root: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    run_git_with_timeout(root, args, GIT_LONG_COMMAND_TIMEOUT)
}

fn run_git_with_timeout(
    root: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<GitCommandOutput, String> {
    let mut command = git_command();
    let mut child = command
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "未检测到 Git 命令".to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Git 标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 Git 错误输出".to_string())?;
    let stdout_reader = read_process_output(stdout);
    let stderr_reader = read_process_output(stderr);
    let started_at = Instant::now();

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started_at.elapsed() < timeout => {
                thread::sleep(GIT_PROCESS_POLL_INTERVAL);
            }
            Ok(None) => {
                terminate_git_process_tree(&mut child);
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("Git 命令执行超时（{} 秒）", timeout.as_secs()));
            }
            Err(error) => {
                terminate_git_process_tree(&mut child);
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("无法等待 Git 命令结束：{error}"));
            }
        }
    };

    let stdout = limited_output(join_process_output(stdout_reader)?)?;
    let stderr = limited_output(join_process_output(stderr_reader)?)?;

    if !status.success() {
        return Err(format_git_error(&stderr));
    }

    Ok(GitCommandOutput { stdout, stderr })
}

fn git_command() -> Command {
    let mut command = Command::new("git");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    #[cfg(unix)]
    command.process_group(0);

    command
}

fn read_process_output<R>(reader: R) -> thread::JoinHandle<Result<Vec<u8>, io::Error>>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut bytes = Vec::new();
        reader
            .take((MAX_GIT_OUTPUT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        Ok(bytes)
    })
}

fn join_process_output(
    reader: thread::JoinHandle<Result<Vec<u8>, io::Error>>,
) -> Result<Vec<u8>, String> {
    reader
        .join()
        .map_err(|_| "Git 输出读取线程异常退出".to_string())?
        .map_err(|error| format!("无法读取 Git 输出：{error}"))
}

fn terminate_git_process_tree(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        let process_id = child.id().to_string();
        let mut command = Command::new("taskkill");
        command.creation_flags(CREATE_NO_WINDOW);
        let _ = command
            .args(["/PID", process_id.as_str(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    #[cfg(unix)]
    {
        let process_group = format!("-{}", child.id());
        let _ = Command::new("kill")
            .args(["-KILL", process_group.as_str()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    let _ = child.kill();
}

trait GitOutputExt {
    fn content_contains_binary_marker(&self) -> bool;
}

impl GitOutputExt for GitCommandOutput {
    fn content_contains_binary_marker(&self) -> bool {
        self.stdout.contains("Binary files ") || self.stdout.contains("GIT binary patch")
    }
}

fn limited_output(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > MAX_GIT_OUTPUT_BYTES {
        return Err("Git 输出过大".to_string());
    }

    String::from_utf8(bytes).map_err(|_| "Git 输出不是有效 UTF-8".to_string())
}

fn format_git_error(stderr: &str) -> String {
    let message = stderr.trim();

    if message.is_empty() {
        "Git 命令执行失败".to_string()
    } else {
        format!("Git 命令执行失败：{message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::{
        git_branches_sync as git_branches, git_commit_file_diff_sync as git_commit_file_diff,
        git_commit_files_sync as git_commit_files, git_commit_sync as git_commit,
        git_delete_file_sync as git_delete_file, git_log_sync as git_log,
        git_probe_sync as git_probe, git_push_sync as git_push,
        git_remote_info_sync as git_remote_info, git_revert_file_sync as git_revert_file,
        git_stage_sync as git_stage, git_status_sync as git_status,
        git_sync_now_sync as git_sync_now, git_unstage_sync as git_unstage,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn rejects_absolute_repo_relative_path() {
        let root = tempdir().expect("temp root");
        let error = validate_repo_relative_path(root.path(), "/tmp/file.txt").unwrap_err();

        assert!(error.contains("路径不安全"));
    }

    #[test]
    fn rejects_parent_traversal_path() {
        let root = tempdir().expect("temp root");
        let error = validate_repo_relative_path(root.path(), "../file.txt").unwrap_err();

        assert!(error.contains("路径不安全"));
    }

    #[test]
    fn allows_workspace_relative_path() {
        let root = tempdir().expect("temp root");
        let validated = validate_repo_relative_path(root.path(), "docs/a.md").unwrap();

        assert_eq!(validated, root.path().join("docs/a.md"));
    }

    #[test]
    fn times_out_and_terminates_git_process_tree() {
        let root = tempdir().expect("temp root");
        let started_at = Instant::now();
        let error = run_git_with_timeout(
            root.path(),
            &["-c", "alias.madora-wait=!sleep 5", "madora-wait"],
            Duration::from_millis(150),
        )
        .unwrap_err();

        assert!(error.contains("Git 命令执行超时"));
        assert!(started_at.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn probes_non_repository_workspace() {
        let root = tempdir().expect("temp root");
        fs::create_dir_all(root.path().join(".madora")).expect("metadata dir");

        let probe = git_probe(root.path().to_string_lossy().to_string()).unwrap();

        assert!(probe.git_available);
        assert!(!probe.is_repository);
        assert_eq!(
            probe.root_path,
            root.path().canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn reads_modified_and_untracked_status() {
        let root = init_repo();
        fs::write(root.path().join("tracked.md"), "old").expect("tracked file");
        run_git(root.path(), &["add", "tracked.md"]).expect("add tracked");
        run_git(root.path(), &["commit", "-m", "init"]).expect("initial commit");
        fs::write(root.path().join("tracked.md"), "new").expect("modify tracked");
        fs::write(root.path().join("new.md"), "new").expect("untracked file");

        let status = git_status(root.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(status.changes.len(), 2);
        assert!(status
            .changes
            .iter()
            .any(|change| change.path == "tracked.md" && change.working_tree_status == "M"));
        assert!(status.changes.iter().any(
            |change| change.path == "new.md" && change.change_type == GitChangeType::Untracked
        ));
    }

    #[test]
    fn stages_unstages_and_commits_selected_paths() {
        let root = init_repo();
        fs::write(root.path().join("note.md"), "hello").expect("note file");

        git_stage(
            root.path().to_string_lossy().to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();
        let staged = git_status(root.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(staged.changes[0].index_status, "A");

        git_unstage(
            root.path().to_string_lossy().to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();
        let unstaged = git_status(root.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(unstaged.changes[0].change_type, GitChangeType::Untracked);

        git_stage(
            root.path().to_string_lossy().to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();
        git_commit(
            root.path().to_string_lossy().to_string(),
            "docs: add note".to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();
        let clean = git_status(root.path().to_string_lossy().to_string()).unwrap();
        assert!(clean.changes.is_empty());
    }

    #[test]
    fn reads_branches_log_and_commit_files() {
        let root = init_repo();
        fs::create_dir_all(root.path().join("docs")).expect("docs dir");
        fs::write(root.path().join("docs/note.md"), "hello").expect("note file");
        git_commit(
            root.path().to_string_lossy().to_string(),
            "docs: add note".to_string(),
            vec!["docs/note.md".to_string()],
        )
        .unwrap();

        let branches = git_branches(root.path().to_string_lossy().to_string()).unwrap();
        let commits = git_log(root.path().to_string_lossy().to_string()).unwrap();
        let files = git_commit_files(
            root.path().to_string_lossy().to_string(),
            commits[0].hash.clone(),
        )
        .unwrap();
        let diff = git_commit_file_diff(
            root.path().to_string_lossy().to_string(),
            commits[0].hash.clone(),
            "docs/note.md".to_string(),
        )
        .unwrap();

        assert!(branches
            .iter()
            .any(|branch| branch.kind == GitBranchKind::Local && branch.current));
        assert_eq!(commits[0].subject, "docs: add note");
        assert_eq!(files[0].path, "docs/note.md");
        assert_eq!(files[0].change_type, GitChangeType::Added);
        assert!(diff.content.contains("diff --git"));
        assert!(diff.content.contains("+hello"));
    }

    #[test]
    fn pushes_commits_to_configured_remote() {
        let remote = tempdir().expect("remote root");
        run_git(remote.path(), &["init", "--bare"]).expect("init bare remote");

        let root = init_repo();
        let branch_output =
            run_git(root.path(), &["branch", "--show-current"]).expect("current branch");
        let branch = branch_output.stdout.trim();
        run_git(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .expect("add remote");
        fs::write(root.path().join("note.md"), "hello").expect("note file");
        git_commit(
            root.path().to_string_lossy().to_string(),
            "docs: add note".to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();
        run_git(root.path(), &["push", "-u", "origin", branch]).expect("configure upstream");
        fs::write(root.path().join("note.md"), "updated").expect("update note");
        git_commit(
            root.path().to_string_lossy().to_string(),
            "docs: update note".to_string(),
            vec!["note.md".to_string()],
        )
        .unwrap();

        let status = git_push(root.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(status.ahead, 0);
    }

    #[test]
    fn converts_common_remote_urls_to_web_urls() {
        assert_eq!(
            remote_url_to_web_url("git@github.com:Refinex-Space/refinex-vault.git").as_deref(),
            Some("https://github.com/Refinex-Space/refinex-vault")
        );
        assert_eq!(
            remote_url_to_web_url("https://gitlab.com/refinex/madora.git").as_deref(),
            Some("https://gitlab.com/refinex/madora")
        );
    }

    #[test]
    fn redacts_credentials_from_https_remote_url() {
        assert_eq!(
            sanitize_remote_url("https://token@example.com/refinex/madora.git"),
            "https://example.com/refinex/madora.git"
        );
    }

    #[test]
    fn reads_configured_remote_info() {
        let remote = tempdir().expect("remote root");
        run_git(remote.path(), &["init", "--bare"]).expect("init bare remote");
        let root = init_repo();

        run_git(
            root.path(),
            &[
                "remote",
                "add",
                "origin",
                "git@github.com:Refinex-Space/refinex-vault.git",
            ],
        )
        .expect("add remote");

        let info = git_remote_info(root.path().to_string_lossy().to_string()).unwrap();

        assert_eq!(
            info.remote_url.as_deref(),
            Some("git@github.com:Refinex-Space/refinex-vault.git")
        );
        assert_eq!(
            info.web_url.as_deref(),
            Some("https://github.com/Refinex-Space/refinex-vault")
        );
    }

    #[test]
    fn sync_now_commits_pulls_and_pushes_to_remote() {
        let remote = tempdir().expect("remote root");
        run_git(remote.path(), &["init", "--bare"]).expect("init bare remote");

        let root = init_repo();
        let branch_output =
            run_git(root.path(), &["branch", "--show-current"]).expect("current branch");
        let branch = branch_output.stdout.trim();
        run_git(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .expect("add remote");
        fs::write(root.path().join("note.md"), "hello").expect("note file");

        let synced = git_sync_now(
            root.path().to_string_lossy().to_string(),
            "abort".to_string(),
        )
        .expect("sync now");

        assert!(synced.last_synced_at.ends_with('Z'));
        assert!(synced.status.changes.is_empty());
        assert!(
            synced.changed_paths.is_empty(),
            "first push without remote history pulls nothing"
        );
        let log = run_git(root.path(), &["log", "-1", "--pretty=%s"]).expect("last subject");
        assert_eq!(log.stdout.trim(), "Updated from Madora");
        run_git(root.path(), &["ls-remote", "--exit-code", "origin", branch])
            .expect("remote branch exists");
    }

    #[test]
    fn sync_now_merges_fetched_remote_changes_after_local_commit() {
        let remote = tempdir().expect("remote root");
        run_git(remote.path(), &["init", "--bare"]).expect("init bare remote");

        let root = init_repo();
        let branch_output =
            run_git(root.path(), &["branch", "--show-current"]).expect("current branch");
        let branch = branch_output.stdout.trim();
        run_git(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .expect("add remote");
        fs::write(root.path().join("base.md"), "base\n").expect("base file");
        run_git(root.path(), &["add", "base.md"]).expect("add base");
        run_git(root.path(), &["commit", "-m", "init"]).expect("commit base");
        run_git(root.path(), &["push", "-u", "origin", branch]).expect("push base");

        let peer = tempdir().expect("peer root");
        run_git(
            peer.path(),
            &["clone", remote.path().to_str().unwrap(), "."],
        )
        .expect("clone remote");
        run_git(peer.path(), &["config", "user.email", "peer@example.com"])
            .expect("config peer email");
        run_git(peer.path(), &["config", "user.name", "Peer User"]).expect("config peer name");
        fs::write(peer.path().join("remote.md"), "remote\n").expect("remote file");
        run_git(peer.path(), &["add", "remote.md"]).expect("add remote file");
        run_git(peer.path(), &["commit", "-m", "remote update"]).expect("commit remote");
        run_git(peer.path(), &["push"]).expect("push remote");

        fs::write(root.path().join("local.md"), "local\n").expect("local file");

        let synced = git_sync_now(
            root.path().to_string_lossy().to_string(),
            "abort".to_string(),
        )
        .expect("sync now");

        assert!(synced.status.changes.is_empty());
        assert!(
            synced.changed_paths.contains(&"remote.md".to_string()),
            "pulled remote file is reported for targeted UI reload, got {:?}",
            synced.changed_paths
        );
        assert!(
            !synced.changed_paths.contains(&"local.md".to_string()),
            "locally committed file must not be reported as pulled, got {:?}",
            synced.changed_paths
        );
        assert_eq!(
            fs::read_to_string(root.path().join("local.md")).unwrap(),
            "local\n"
        );
        assert_eq!(
            fs::read_to_string(root.path().join("remote.md")).unwrap(),
            "remote\n"
        );
        run_git(root.path(), &["push", "--dry-run"]).expect("nothing left to push");
    }

    #[test]
    fn sync_now_aborts_conflicting_merge_with_short_message() {
        let remote = tempdir().expect("remote root");
        run_git(remote.path(), &["init", "--bare"]).expect("init bare remote");

        let root = init_repo();
        let branch_output =
            run_git(root.path(), &["branch", "--show-current"]).expect("current branch");
        let branch = branch_output.stdout.trim();
        run_git(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .expect("add remote");
        fs::write(root.path().join("note.md"), "base\n").expect("base file");
        run_git(root.path(), &["add", "note.md"]).expect("add base");
        run_git(root.path(), &["commit", "-m", "init"]).expect("commit base");
        run_git(root.path(), &["push", "-u", "origin", branch]).expect("push base");

        let peer = tempdir().expect("peer root");
        run_git(
            peer.path(),
            &["clone", remote.path().to_str().unwrap(), "."],
        )
        .expect("clone remote");
        run_git(peer.path(), &["config", "user.email", "peer@example.com"])
            .expect("config peer email");
        run_git(peer.path(), &["config", "user.name", "Peer User"]).expect("config peer name");
        fs::write(peer.path().join("note.md"), "remote\n").expect("remote change");
        run_git(peer.path(), &["add", "note.md"]).expect("add remote change");
        run_git(peer.path(), &["commit", "-m", "remote update"]).expect("commit remote");
        run_git(peer.path(), &["push"]).expect("push remote");

        fs::write(root.path().join("note.md"), "local\n").expect("local change");

        let error = git_sync_now(
            root.path().to_string_lossy().to_string(),
            "abort".to_string(),
        )
        .unwrap_err();

        assert!(error.contains("远端和本地同时修改"));
        assert_eq!(
            fs::read_to_string(root.path().join("note.md")).unwrap(),
            "local\n"
        );
        assert!(git_status(root.path().to_string_lossy().to_string())
            .unwrap()
            .changes
            .is_empty());
    }

    #[test]
    fn reverts_tracked_file_changes() {
        let root = init_repo();
        fs::write(root.path().join("note.md"), "old").expect("note file");
        run_git(root.path(), &["add", "note.md"]).expect("add note");
        run_git(root.path(), &["commit", "-m", "init"]).expect("commit note");
        fs::write(root.path().join("note.md"), "new").expect("modify note");

        let status = git_revert_file(
            root.path().to_string_lossy().to_string(),
            "note.md".to_string(),
        )
        .unwrap();

        assert!(status.changes.is_empty());
        assert_eq!(
            fs::read_to_string(root.path().join("note.md")).unwrap(),
            "old"
        );
    }

    #[test]
    fn reverts_untracked_file_by_deleting_it() {
        let root = init_repo();
        fs::write(root.path().join("draft.md"), "draft").expect("draft file");

        let status = git_revert_file(
            root.path().to_string_lossy().to_string(),
            "draft.md".to_string(),
        )
        .unwrap();

        assert!(status.changes.is_empty());
        assert!(!root.path().join("draft.md").exists());
    }

    #[test]
    fn deletes_tracked_file_with_git_rm() {
        let root = init_repo();
        fs::write(root.path().join("note.md"), "old").expect("note file");
        run_git(root.path(), &["add", "note.md"]).expect("add note");
        run_git(root.path(), &["commit", "-m", "init"]).expect("commit note");

        let status = git_delete_file(
            root.path().to_string_lossy().to_string(),
            "note.md".to_string(),
        )
        .unwrap();

        assert!(!root.path().join("note.md").exists());
        assert!(status
            .changes
            .iter()
            .any(|change| change.path == "note.md" && change.index_status == "D"));
    }

    #[test]
    fn deletes_untracked_file_from_disk() {
        let root = init_repo();
        fs::write(root.path().join("draft.md"), "draft").expect("draft file");

        let status = git_delete_file(
            root.path().to_string_lossy().to_string(),
            "draft.md".to_string(),
        )
        .unwrap();

        assert!(status.changes.is_empty());
        assert!(!root.path().join("draft.md").exists());
    }

    fn init_repo() -> tempfile::TempDir {
        let root = tempdir().expect("temp root");
        run_git(root.path(), &["init"]).expect("init repo");
        run_git(root.path(), &["config", "user.email", "test@example.com"]).expect("config email");
        run_git(root.path(), &["config", "user.name", "Test User"]).expect("config name");
        run_git(root.path(), &["config", "core.autocrlf", "false"])
            .expect("disable line ending conversion");
        root
    }
}

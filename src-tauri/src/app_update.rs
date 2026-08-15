use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

const MAX_RELEASE_NOTES_BYTES: usize = 32 * 1024;

#[derive(Default)]
pub struct AppUpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<Update>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateRelease {
    body: Option<String>,
    current_version: String,
    date: Option<i64>,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheckResult {
    current_version: String,
    update: Option<AppUpdateRelease>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum AppUpdateDownloadEvent {
    #[serde(rename = "started", rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename = "progress", rename_all = "camelCase")]
    Progress { chunk_length: usize },
    #[serde(rename = "finished")]
    Finished,
}

struct OperationGuard<'a>(&'a AtomicBool);

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl AppUpdateState {
    fn begin_operation(&self) -> Result<OperationGuard<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| OperationGuard(&self.busy))
            .map_err(|_| "另一项更新操作正在进行，请稍候。".to_string())
    }

    fn replace_pending(&self, update: Option<Update>) -> Result<(), String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "更新状态不可用，请重启 Markune 后重试。".to_string())?;
        *pending = update;
        Ok(())
    }

    fn take_pending(&self) -> Result<Update, String> {
        self.pending
            .lock()
            .map_err(|_| "更新状态不可用，请重启 Markune 后重试。".to_string())?
            .take()
            .ok_or_else(|| "没有可安装的更新，请先重新检查。".to_string())
    }
}

#[tauri::command]
pub async fn app_update_check(
    app: AppHandle,
    state: State<'_, AppUpdateState>,
) -> Result<AppUpdateCheckResult, String> {
    let _operation = state.begin_operation()?;
    state.replace_pending(None)?;
    let current_version = app.package_info().version.to_string();
    let updater = app.updater().map_err(map_check_error)?;
    let update = updater.check().await.map_err(map_check_error)?;

    let release = update.as_ref().map(|update| AppUpdateRelease {
        body: update
            .body
            .as_deref()
            .map(|body| truncate_release_notes(body, MAX_RELEASE_NOTES_BYTES)),
        current_version: update.current_version.clone(),
        date: update
            .date
            .map(|date| date.unix_timestamp().saturating_mul(1_000)),
        version: update.version.clone(),
    });

    state.replace_pending(update)?;

    Ok(AppUpdateCheckResult {
        current_version,
        update: release,
    })
}

#[tauri::command]
pub async fn app_update_install(
    state: State<'_, AppUpdateState>,
    on_event: Channel<AppUpdateDownloadEvent>,
) -> Result<(), String> {
    let _operation = state.begin_operation()?;
    let update = state.take_pending()?;
    let mut started = false;

    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = on_event.send(AppUpdateDownloadEvent::Started { content_length });
                }
                let _ = on_event.send(AppUpdateDownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(AppUpdateDownloadEvent::Finished);
            },
        )
        .await
        .map_err(map_install_error)
}

#[tauri::command]
pub fn app_update_restart(app: AppHandle) {
    app.restart();
}

fn map_check_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::EmptyEndpoints => "当前构建未配置更新服务。".to_string(),
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => {
            "最新版本没有适用于当前系统架构的安装包。".to_string()
        }
        _ => "无法连接更新服务，请检查网络后重试。".to_string(),
    }
}

fn map_install_error(error: UpdaterError) -> String {
    match error {
        UpdaterError::Minisign(_) | UpdaterError::Base64(_) | UpdaterError::SignatureUtf8(_) => {
            "更新包签名验证失败，已停止安装。".to_string()
        }
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_) => {
            "更新包与当前系统架构不兼容。".to_string()
        }
        UpdaterError::Reqwest(_) | UpdaterError::Network(_) => {
            "更新包下载失败，请检查网络后重新检查更新。".to_string()
        }
        _ => "更新包安装失败，请重新检查更新后再试。".to_string(),
    }
}

fn truncate_release_notes(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }

    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n\n…（更新说明已截断）", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::truncate_release_notes;

    #[test]
    fn release_notes_are_truncated_on_a_utf8_boundary() {
        let notes = "版本更新说明".repeat(10);
        let truncated = truncate_release_notes(&notes, 13);

        assert!(truncated.starts_with("版本更新"));
        assert!(truncated.ends_with("…（更新说明已截断）"));
    }

    #[test]
    fn short_release_notes_are_preserved() {
        assert_eq!(truncate_release_notes("修复导出问题", 1024), "修复导出问题");
    }
}

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{ipc::Channel, State, Window};

const MAX_PATHS: usize = 512;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    root_path: String,
    paths: Vec<String>,
    rescan: bool,
    watch_error: bool,
}

#[derive(Default)]
struct PendingChanges {
    paths: BTreeSet<String>,
    rescan: bool,
    watch_error: bool,
    first: Option<Instant>,
    last: Option<Instant>,
}

impl PendingChanges {
    fn record(&mut self, root: &Path, result: notify::Result<Event>) {
        match result {
            Ok(event) => {
                if matches!(event.kind, EventKind::Access(_)) {
                    return;
                }
                self.rescan |= event.need_rescan();
                for path in event.paths {
                    if visible_path(root, &path) {
                        if path == root {
                            self.rescan = true;
                            self.watch_error |= matches!(
                                event.kind,
                                EventKind::Remove(_)
                                    | EventKind::Modify(notify::event::ModifyKind::Name(_))
                            ) || !root.is_dir();
                        }
                        if !self.rescan {
                            self.paths.insert(path.to_string_lossy().into_owned());
                        }
                    }
                }
                if self.paths.len() > MAX_PATHS {
                    self.rescan = true;
                }
            }
            Err(_) => {
                self.rescan = true;
                self.watch_error = true;
            }
        }
        if self.rescan {
            self.paths.clear();
        }
        if self.rescan || !self.paths.is_empty() {
            let now = Instant::now();
            self.first.get_or_insert(now);
            self.last = Some(now);
        }
    }

    fn take(&mut self, root: &Path) -> Option<WorkspaceChange> {
        let now = Instant::now();
        if self.last.map_or(true, |last| {
            now.duration_since(last) < Duration::from_millis(150)
        }) && self.first.map_or(true, |first| {
            now.duration_since(first) < Duration::from_secs(1)
        }) {
            return None;
        }
        let pending = std::mem::take(self);
        Some(WorkspaceChange {
            root_path: root.to_string_lossy().into_owned(),
            paths: pending.paths.into_iter().collect(),
            rescan: pending.rescan,
            watch_error: pending.watch_error,
        })
    }
}

fn visible_path(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    relative.components().all(|part| match part {
        Component::Normal(name) => !crate::workspace::should_skip_entry(&name.to_string_lossy()),
        _ => false,
    })
}

struct WatchSession {
    id: String,
    cancelled: Arc<AtomicBool>,
}

impl Drop for WatchSession {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
    }
}

#[derive(Clone, Default)]
pub struct WorkspaceWatchState(Arc<Mutex<HashMap<String, WatchSession>>>);

impl WorkspaceWatchState {
    pub fn stop_window(&self, label: &str) {
        if let Ok(mut sessions) = self.0.lock() {
            sessions.remove(label);
        }
    }
}

fn start_watcher(
    root: PathBuf,
    cancelled: Arc<AtomicBool>,
    on_change: impl Fn(WorkspaceChange) -> bool + Send + 'static,
) -> Result<(), String> {
    if cancelled.load(Ordering::Acquire) {
        return Err("文件监听已取消".to_string());
    }
    let pending = Arc::new(Mutex::new(PendingChanges::default()));
    let event_pending = pending.clone();
    let event_root = root.clone();
    let mut watcher = RecommendedWatcher::new(
        move |event| {
            if let Ok(mut pending) = event_pending.lock() {
                pending.record(&event_root, event);
            }
        },
        Config::default().with_follow_symlinks(false),
    )
    .map_err(|_| "无法启动文件监听，将通过定期复核刷新".to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|_| "无法监听工作区，将通过定期复核刷新".to_string())?;
    let worker_cancelled = cancelled;
    std::thread::spawn(move || {
        let _watcher = watcher;
        while !worker_cancelled.load(Ordering::Acquire) {
            std::thread::sleep(Duration::from_millis(75));
            let change = pending
                .lock()
                .ok()
                .and_then(|mut pending| pending.take(&root));
            if let Some(change) = change {
                if !on_change(change) {
                    break;
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn watch_workspace(
    window: Window,
    state: State<'_, WorkspaceWatchState>,
    root_path: String,
    on_change: Channel<WorkspaceChange>,
) -> Result<String, String> {
    let state = state.inner().clone();
    let label = window.label().to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .0
        .lock()
        .map_err(|_| "文件监听状态不可用".to_string())?
        .insert(
            label.clone(),
            WatchSession {
                id: id.clone(),
                cancelled: cancelled.clone(),
            },
        );
    let result = tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        start_watcher(root, cancelled.clone(), move |change| {
            on_change.send(change).is_ok()
        })?;
        if cancelled.load(Ordering::Acquire) {
            return Err("文件监听已取消".to_string());
        }
        Ok(())
    })
    .await
    .map_err(|_| "文件监听启动失败".to_string())
    .and_then(|result| result);
    if result.is_err() {
        if let Ok(mut sessions) = state.0.lock() {
            if sessions.get(&label).is_some_and(|session| session.id == id) {
                sessions.remove(&label);
            }
        }
    }
    result.map(|_| id)
}

#[tauri::command]
pub fn unwatch_workspace(window: Window, state: State<'_, WorkspaceWatchState>, watch_id: String) {
    if let Ok(mut sessions) = state.0.lock() {
        if sessions
            .get(window.label())
            .is_some_and(|session| session.id == watch_id)
        {
            sessions.remove(window.label());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::ModifyKind;

    #[test]
    fn root_removal_invalidates_the_watch_and_window_close_cancels_pending_start() {
        let root = Path::new("/workspace");
        let mut pending = PendingChanges::default();
        pending.record(
            root,
            Ok(
                Event::new(EventKind::Remove(notify::event::RemoveKind::Folder))
                    .add_path(root.to_path_buf()),
            ),
        );
        assert!(pending.rescan && pending.watch_error);
        let state = WorkspaceWatchState::default();
        let cancelled = Arc::new(AtomicBool::new(false));
        state.0.lock().unwrap().insert(
            "window".to_string(),
            WatchSession {
                id: "pending".to_string(),
                cancelled: cancelled.clone(),
            },
        );
        state.stop_window("window");
        assert!(cancelled.load(Ordering::Acquire));
        assert!(start_watcher(root.to_path_buf(), cancelled, |_| true).is_err());
    }

    #[test]
    fn filters_private_and_outside_paths_and_bounds_bursts() {
        let root = Path::new("/workspace");
        assert!(!visible_path(
            root,
            Path::new("/workspace/.markune/workspace.json")
        ));
        assert!(!visible_path(root, Path::new("/workspace/.git/index")));
        assert!(!visible_path(root, Path::new("/workspace/../secret.md")));
        assert!(!visible_path(root, Path::new("/elsewhere/doc.md")));
        let mut pending = PendingChanges::default();
        for i in 0..=MAX_PATHS {
            pending.record(
                root,
                Ok(Event::new(EventKind::Modify(ModifyKind::Any))
                    .add_path(root.join(format!("{i}.md")))),
            );
        }
        assert!(pending.rescan);
        assert!(pending.paths.is_empty());
    }

    #[test]
    fn observes_nested_write_atomic_replace_create_rename_and_delete() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let nested = root.join("notes/nested");
        std::fs::create_dir_all(&nested).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let session = WatchSession {
            id: "test".to_string(),
            cancelled: Arc::new(AtomicBool::new(false)),
        };
        start_watcher(root.clone(), session.cancelled.clone(), move |event| {
            tx.send(event).is_ok()
        })
        .unwrap();
        let path = nested.join("note.md");
        for operation in 0..5 {
            match operation {
                0 => std::fs::write(&path, "created").unwrap(),
                1 => std::fs::write(&path, "changed").unwrap(),
                2 => crate::workspace::write_text_atomic(&path, "replaced").unwrap(),
                3 => std::fs::rename(&path, nested.join("renamed.md")).unwrap(),
                _ => std::fs::remove_file(nested.join("renamed.md")).unwrap(),
            }
            let deadline = Instant::now() + Duration::from_secs(8);
            loop {
                let event = rx
                    .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    .expect("missing filesystem event");
                if event.rescan || event.paths.iter().any(|entry| entry.ends_with(".md")) {
                    break;
                }
            }
        }
        drop(session);
    }
}

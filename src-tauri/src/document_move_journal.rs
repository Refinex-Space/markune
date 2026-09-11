use crate::document_links::FileChange;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    path: String,
    old_hash: String,
    new_hash: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u8,
    source: String,
    destination: String,
    files: Vec<Record>,
}

pub(crate) struct MoveJournal {
    directory: PathBuf,
}
fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    fs::File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|_| "无法同步移动事务目录")?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}
fn journal_parent(root: &Path, create: bool) -> Result<Option<PathBuf>, String> {
    let mut path = root.to_path_buf();
    for part in [".markune", "moves"] {
        path.push(part);
        if fs::symlink_metadata(&path).is_ok() {
            if path.canonicalize().map_err(|_| "移动事务目录不可读")? != path || !path.is_dir()
            {
                return Err("移动事务目录无效或为符号链接".into());
            }
        } else if create {
            fs::create_dir(&path).map_err(|_| "无法创建移动事务目录")?;
        } else {
            return Ok(None);
        }
    }
    Ok(Some(path))
}
fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty()
        || Path::new(relative)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("移动事务路径无效".into());
    }
    let path = root.join(relative);
    let mut ancestor = path.as_path();
    while fs::symlink_metadata(ancestor).is_err() {
        ancestor = ancestor.parent().ok_or("移动事务路径无效")?;
    }
    let canonical = ancestor.canonicalize().map_err(|_| "移动事务路径不可读")?;
    if !canonical.starts_with(root)
        || canonical.to_string_lossy().to_lowercase() != ancestor.to_string_lossy().to_lowercase()
    {
        return Err("移动事务路径不能包含符号链接".into());
    }
    let mut checked = root.to_path_buf();
    for part in Path::new(relative).components() {
        checked.push(part);
        if fs::symlink_metadata(&checked).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return Err("移动事务路径不能包含符号链接".into());
        }
    }
    Ok(path)
}
fn write_durable(path: &Path, value: &str) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "无法创建移动恢复记录")?;
    file.write_all(value.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "无法保存移动恢复记录".into())
}
impl MoveJournal {
    pub(crate) fn prepare(
        root: &Path,
        source: &Path,
        destination: &Path,
        changes: &[FileChange],
    ) -> Result<Self, String> {
        let parent = journal_parent(root, true)?.unwrap();
        let ignore = parent.join(".gitignore");
        if !ignore.exists() {
            write_durable(&ignore, "*\n!.gitignore\n")?;
        } else if crate::graph::read_regular_document(&ignore, 1024, &mut 0)? != "*\n!.gitignore\n"
        {
            return Err(
                "移动恢复目录的 Git 忽略规则已改变，请检查 .markune/moves/.gitignore".into(),
            );
        }
        let id = uuid::Uuid::new_v4();
        let temporary = parent.join(format!(".prepare-{id}"));
        fs::create_dir(&temporary).map_err(|_| "无法准备移动事务")?;
        let result = (|| {
            let manifest = Manifest {
                version: 1,
                source: crate::document_links::relative(root, source),
                destination: crate::document_links::relative(root, destination),
                files: changes
                    .iter()
                    .map(|change| Record {
                        path: crate::document_links::relative(root, &change.path),
                        old_hash: hash(&change.old),
                        new_hash: hash(&change.new),
                    })
                    .collect(),
            };
            for (index, change) in changes.iter().enumerate() {
                write_durable(&temporary.join(format!("{index}.old")), &change.old)?;
            }
            write_durable(
                &temporary.join("manifest.json"),
                &serde_json::to_string(&manifest).map_err(|_| "无法生成移动恢复记录")?,
            )?;
            sync_directory(&temporary)?;
            let directory = parent.join(id.to_string());
            fs::rename(&temporary, &directory).map_err(|_| "无法提交移动恢复记录")?;
            sync_directory(&parent)?;
            Ok(Self { directory })
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(temporary);
        }
        result
    }
    pub(crate) fn discard(self) -> Result<(), String> {
        fs::remove_dir_all(&self.directory)
            .map_err(|_| "移动已处理，但恢复记录清理失败，请刷新重试")?;
        sync_directory(self.directory.parent().unwrap())
    }
}

// Called under the shared move lock before opening a workspace or beginning another move. author: refinex
pub(crate) fn recover(root: &Path) -> Result<(), String> {
    let Some(parent) = journal_parent(root, false)? else {
        return Ok(());
    };
    let entries = fs::read_dir(&parent)
        .map_err(|_| "无法读取移动恢复记录")?
        .take(65)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "移动恢复记录不可读")?;
    if entries.len() > 64 {
        return Err("待检查的移动恢复记录过多".into());
    }
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let pending = name.strip_prefix(".prepare-");
        if uuid::Uuid::parse_str(pending.unwrap_or(&name)).is_err() {
            continue;
        }
        let directory = entry.path();
        if directory.canonicalize().map_err(|_| "移动恢复目录不可读")? != directory
            || !entry.file_type().map_err(|_| "移动恢复目录无效")?.is_dir()
        {
            return Err("移动恢复目录不能为符号链接".into());
        }
        if pending.is_some() {
            fs::remove_dir_all(&directory).map_err(|_| "无法清理未开始的移动记录")?;
            continue;
        }
        let raw = crate::graph::read_regular_document(
            &directory.join("manifest.json"),
            32 * 1024 * 1024,
            &mut 0,
        )?;
        let manifest: Manifest =
            serde_json::from_str(&raw).map_err(|_| "移动恢复记录已损坏，已保留现场")?;
        if manifest.version != 1 || manifest.files.len() > 50_001 {
            return Err("移动恢复记录版本或大小无效".into());
        }
        let source = safe_path(root, &manifest.source)?;
        let destination = safe_path(root, &manifest.destination)?;
        let moved = source != destination
            && !crate::document_assets::has_exact_entry(&source)
            && crate::document_assets::has_exact_entry(&destination);
        if !moved && !source.exists() {
            return Err("移动中断后源路径又发生变化，已保留恢复记录，请检查 .markune/moves".into());
        }
        // Final rename is the commit point. Never roll back paths that have subsequently been edited. author: refinex
        if moved {
            MoveJournal { directory }.discard()?;
            continue;
        }
        let mut changes = Vec::new();
        let mut bytes = 0;
        let mut paths = std::collections::BTreeSet::new();
        for (index, record) in manifest.files.iter().enumerate() {
            if record.path != ".markune/workspace.json"
                && !crate::workspace::is_markdown_document_file(Path::new(&record.path))
            {
                return Err("移动恢复记录包含非文档路径".into());
            }
            let path = safe_path(root, &record.path)?;
            if !paths.insert(path.clone()) {
                return Err("移动恢复记录存在重复路径".into());
            }
            let limit = if record.path == ".markune/workspace.json" {
                32 * 1024 * 1024
            } else {
                4 * 1024 * 1024
            };
            let old = crate::graph::read_regular_document(
                &directory.join(format!("{index}.old")),
                limit,
                &mut bytes,
            )?;
            if bytes > 160 * 1024 * 1024 || hash(&old) != record.old_hash {
                return Err("移动恢复副本校验失败，已保留现场".into());
            }
            changes.push((path, old, record));
        }
        changes.sort_by(|left, right| left.0.cmp(&right.0));
        let locks = changes
            .iter()
            .map(|(path, _, _)| crate::workspace::document_save_lock(path))
            .collect::<Vec<_>>();
        let _guards = locks
            .iter()
            .map(|lock| lock.lock().map_err(|_| "移动恢复状态不可用"))
            .collect::<Result<Vec<_>, _>>()?;
        if source == destination
            && changes.iter().all(|(path, _, record)| {
                fs::read_to_string(path).is_ok_and(|current| hash(&current) == record.new_hash)
            })
        {
            MoveJournal { directory }.discard()?;
            continue;
        }
        let mut conflict = false;
        for (path, old, record) in changes.into_iter().rev() {
            let limit = if record.path == ".markune/workspace.json" {
                32 * 1024 * 1024
            } else {
                4 * 1024 * 1024
            };
            let current = crate::graph::read_regular_document(&path, limit, &mut 0);
            let Ok(current) = current else {
                conflict = true;
                continue;
            };
            if hash(&current) == record.old_hash {
                continue;
            }
            if hash(&current) != record.new_hash {
                conflict = true;
                continue;
            }
            if crate::workspace::write_text_atomic_guarded(&path, &old, || {
                if !fs::read_to_string(&path).is_ok_and(|value| value == current) {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::WouldBlock,
                        "document changed",
                    ));
                }
                Ok(())
            })
            .is_err()
            {
                conflict = true;
            }
        }
        if conflict {
            return Err("检测到未完成的移动，已恢复可确认的修改；外部改动保持原样，请检查 .markune/moves 后再移动文档".into());
        }
        MoveJournal { directory }.discard()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_recognizes_committed_case_only_moves() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let source = root.join("Case.md");
        let destination = root.join("case.md");
        let incoming = root.join("incoming.md");
        fs::write(&source, "# Case").unwrap();
        fs::write(&incoming, "old").unwrap();
        let journal = MoveJournal::prepare(
            &root,
            &source,
            &destination,
            &[FileChange {
                path: incoming.clone(),
                old: "old".into(),
                new: "new".into(),
            }],
        )
        .unwrap();
        fs::write(&incoming, "new").unwrap();
        crate::document_assets::move_path_no_replace(&source, &destination).unwrap();
        recover(&root).unwrap();
        assert_eq!(fs::read_to_string(&incoming).unwrap(), "new");
        assert!(!journal.directory.exists());
    }
    #[test]
    fn interrupted_writes_restore_only_our_content_and_keep_external_edits() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "old-a").unwrap();
        fs::write(&b, "old-b").unwrap();
        let changes = [
            FileChange {
                path: a.clone(),
                old: "old-a".into(),
                new: "new-a".into(),
            },
            FileChange {
                path: b.clone(),
                old: "old-b".into(),
                new: "new-b".into(),
            },
        ];
        let journal = MoveJournal::prepare(&root, &b, &root.join("renamed.md"), &changes).unwrap();
        fs::write(&a, "new-a").unwrap();
        recover(&root).unwrap();
        assert_eq!(fs::read_to_string(&a).unwrap(), "old-a");
        assert!(!journal.directory.exists());
        let journal = MoveJournal::prepare(&root, &b, &root.join("renamed.md"), &changes).unwrap();
        fs::write(&a, "external").unwrap();
        fs::write(&b, "new-b").unwrap();
        assert!(recover(&root).unwrap_err().contains("外部改动"));
        assert_eq!(fs::read_to_string(&a).unwrap(), "external");
        assert_eq!(fs::read_to_string(&b).unwrap(), "old-b");
        assert!(journal.directory.exists());
    }
    #[test]
    fn a_completed_rename_is_not_rolled_back_after_a_process_exit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let a = root.join("a.md");
        let b = root.join("b.md");
        let next = root.join("next.md");
        fs::write(&a, "[b](b.md)").unwrap();
        fs::write(&b, "B").unwrap();
        let changes = [FileChange {
            path: a.clone(),
            old: "[b](b.md)".into(),
            new: "[b](next.md)".into(),
        }];
        let journal = MoveJournal::prepare(&root, &b, &next, &changes).unwrap();
        fs::write(&a, &changes[0].new).unwrap();
        fs::rename(&b, &next).unwrap();
        recover(&root).unwrap();
        assert_eq!(fs::read_to_string(&a).unwrap(), "[b](next.md)");
        assert!(next.exists());
        assert!(!journal.directory.exists());
    }
    #[test]
    fn corrupt_backups_and_escaping_paths_never_write_to_notes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let a = root.join("a.md");
        fs::write(&a, "old").unwrap();
        let journal = MoveJournal::prepare(
            &root,
            &a,
            &root.join("new.md"),
            &[FileChange {
                path: a.clone(),
                old: "old".into(),
                new: "new".into(),
            }],
        )
        .unwrap();
        fs::write(journal.directory.join("0.old"), "corrupt").unwrap();
        fs::write(&a, "new").unwrap();
        assert!(recover(&root).is_err());
        assert_eq!(fs::read_to_string(&a).unwrap(), "new");
        assert!(safe_path(&root, "../outside.md").is_err());
    }
}

use pulldown_cmark::{Event, Options, Parser};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::Path};

pub(crate) fn write_new(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("文档目录无效")?;
    let temporary = parent.join(format!(".markune-new-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| "无法准备新文档")?;
        file.write_all(content.as_bytes())
            .map_err(|_| "无法写入新文档")?;
        file.sync_all().map_err(|_| "无法保存新文档")?;
        drop(file);
        crate::document_assets::move_path_no_replace(&temporary, path)
            .map_err(|_| "目标文件已存在或无法安全创建，请重试")?;
        crate::workspace_index::invalidate(path);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub async fn create_workspace_document_from_content(
    root_path: String,
    parent_path: String,
    title: String,
    content: String,
    source_path: Option<String>,
) -> Result<crate::workspace::CreatedMarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if content.len() > 4 * 1024 * 1024 || title.len() > 1024 {
            return Err("新文档超过大小上限".into());
        }
        if let Some(frontmatter) = crate::document_frontmatter::split(&content) {
            crate::graph_metadata::parse_fields(frontmatter.block)?;
        }
        crate::workspace::create_markdown_document_with_source(
            root_path,
            parent_path,
            title,
            content,
            source_path,
        )
    })
    .await
    .map_err(|_| "文档创建任务失败".to_string())?
}

#[tauri::command]
pub async fn set_workspace_task_checked(
    root_path: String,
    document_path: String,
    offset: usize,
    fingerprint: String,
    checked: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let document =
            crate::workspace::validate_existing_markdown_document_path(&root_path, &document_path)?;
        crate::workspace::validate_document_writable(&root, &document)?;
        let lock = crate::workspace::document_save_lock(&document);
        let _guard = lock.lock().map_err(|_| "文档保存状态不可用")?;
        let old = crate::graph::read_regular_document(&document, 4 * 1024 * 1024, &mut 0)?;
        if format!("{:x}", Sha256::digest(old.as_bytes())) != fingerprint {
            return Err("文档已更新，请刷新任务后重试".into());
        }
        let start = crate::document_frontmatter::split(&old)
            .map(|frontmatter| frontmatter.body_start)
            .unwrap_or(0);
        let task_body = crate::graph_parse::mask_obsidian_comments(&old[start..]);
        let valid = Parser::new_ext(&task_body, Options::ENABLE_TASKLISTS)
            .into_offset_iter()
            .any(|(event, range)| {
                matches!(event, Event::TaskListMarker(_)) && start + range.start == offset
            });
        if !valid
            || old.as_bytes().get(offset) != Some(&b'[')
            || old.as_bytes().get(offset + 2) != Some(&b']')
        {
            return Err("任务位置已改变，请刷新后重试".into());
        }
        let mut next = old.clone();
        next.replace_range(offset + 1..offset + 2, if checked { "x" } else { " " });
        crate::workspace::write_text_atomic_guarded(&document, &next, || {
            if fs::read_to_string(&document)? != old {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::WouldBlock,
                    "document changed",
                ));
            }
            Ok(())
        })
        .map_err(|_| "任务保存失败或文档已被外部修改")?;
        Ok(())
    })
    .await
    .map_err(|_| "任务更新失败".to_string())?
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedView {
    pub id: String,
    pub name: String,
    pub query: String,
    pub columns: Vec<String>,
    pub sort_by: String,
    pub descending: bool,
    pub group_by: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedViews {
    pub views: Vec<SavedView>,
    pub fingerprint: String,
}

fn validate_views(views: &[SavedView]) -> Result<(), String> {
    let mut ids = std::collections::BTreeSet::new();
    let valid_field = |field: &str| {
        !field.is_empty()
            && field.len() <= 256
            && (matches!(field, "title" | "path" | "modifiedAt" | "links" | "tasks")
                || field
                    .strip_prefix("prop:")
                    .is_some_and(|key| !key.is_empty()))
    };
    if views.len() > 64
        || views.iter().any(|view| {
            view.id.is_empty()
                || view.id.len() > 128
                || !ids.insert(&view.id)
                || view.name.trim().is_empty()
                || view.name.len() > 256
                || view.query.len() > 4096
                || view.columns.is_empty()
                || view.columns.len() > 32
                || view.columns.iter().any(|column| !valid_field(column))
                || view
                    .columns
                    .iter()
                    .collect::<std::collections::BTreeSet<_>>()
                    .len()
                    != view.columns.len()
                || !valid_field(&view.sort_by)
                || view
                    .group_by
                    .as_ref()
                    .is_some_and(|field| !valid_field(field))
        })
    {
        return Err("视图配置无效或超出上限".into());
    }
    Ok(())
}

fn views_directory(root: &Path, create: bool) -> Result<std::path::PathBuf, String> {
    let parent = root.join(".markune");
    if fs::symlink_metadata(&parent).is_ok()
        && parent.canonicalize().map_err(|_| "视图目录无效")? != parent
    {
        return Err("视图目录不能为符号链接".into());
    }
    if create {
        fs::create_dir_all(&parent).map_err(|_| "无法准备视图目录")?;
    }
    Ok(parent)
}

#[tauri::command]
pub async fn read_workspace_views(root_path: String) -> Result<SavedViews, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let path = views_directory(&root, false)?.join("views.json");
        if !path.exists() {
            return Ok(SavedViews {
                views: Vec::new(),
                fingerprint: String::new(),
            });
        }
        let raw = crate::graph::read_regular_document(&path, 256 * 1024, &mut 0)?;
        let views: Vec<SavedView> = serde_json::from_str(&raw).map_err(|_| "保存视图格式无效")?;
        validate_views(&views)?;
        Ok(SavedViews {
            views,
            fingerprint: format!("{:x}", Sha256::digest(raw.as_bytes())),
        })
    })
    .await
    .map_err(|_| "读取视图失败".to_string())?
}

#[tauri::command]
pub async fn save_workspace_views(
    root_path: String,
    views: Vec<SavedView>,
    fingerprint: String,
) -> Result<SavedViews, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_views(&views)?;
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let parent = views_directory(&root, true)?;
        let path = parent.join("views.json");
        let lock = crate::workspace::document_save_lock(&path);
        let _guard = lock.lock().map_err(|_| "视图保存状态不可用")?;
        let old = if path.exists() {
            Some(crate::graph::read_regular_document(
                &path,
                256 * 1024,
                &mut 0,
            )?)
        } else {
            None
        };
        let expected = old
            .as_ref()
            .map(|raw| format!("{:x}", Sha256::digest(raw.as_bytes())))
            .unwrap_or_default();
        if expected != fingerprint {
            return Err("视图已被其他窗口修改，请重新加载".into());
        }
        let raw = serde_json::to_string_pretty(&views).map_err(|_| "无法生成视图配置")?;
        if raw.len() > 256 * 1024 {
            return Err("视图配置过大".into());
        }
        if let Some(old) = old {
            crate::workspace::write_text_atomic_guarded(&path, &raw, || {
                if fs::read_to_string(&path)? != old {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::WouldBlock,
                        "views changed",
                    ));
                }
                Ok(())
            })
            .map_err(|_| "视图已改变或保存失败")?;
        } else {
            write_new(&path, &raw)?;
        }
        Ok(SavedViews {
            views,
            fingerprint: format!("{:x}", Sha256::digest(raw.as_bytes())),
        })
    })
    .await
    .map_err(|_| "保存视图失败".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn digest(raw: &str) -> String {
        format!("{:x}", Sha256::digest(raw.as_bytes()))
    }

    #[test]
    fn task_updates_only_the_verified_marker_and_keeps_frontmatter_and_line_endings() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("任务.md");
        let raw = "\u{feff}---\r\ncustom: {owner: team} # retain\r\n---\r\n- [ ] 核对来源\r\n```md\r\n- [ ] 示例\r\n```\r\n";
        fs::write(&path, raw).unwrap();
        let root_path = root.to_string_lossy().to_string();
        let document_path = path.to_string_lossy().to_string();
        let offset = raw.find("[ ]").unwrap();
        tauri::async_runtime::block_on(set_workspace_task_checked(
            root_path.clone(),
            document_path.clone(),
            offset,
            digest(raw),
            true,
        ))
        .unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            raw.replacen("[ ]", "[x]", 1)
        );
        assert!(tauri::async_runtime::block_on(set_workspace_task_checked(
            root_path.clone(),
            document_path.clone(),
            offset,
            digest(raw),
            false
        ))
        .unwrap_err()
        .contains("已更新"));
        let current = fs::read_to_string(&path).unwrap();
        let code_offset = current.rfind("[ ]").unwrap();
        assert!(tauri::async_runtime::block_on(set_workspace_task_checked(
            root_path,
            document_path,
            code_offset,
            digest(&current),
            true
        ))
        .is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), current);
    }

    #[test]
    fn task_updates_refuse_locked_notes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("locked.md");
        let raw = "- [ ] keep";
        fs::write(&path, raw).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        assert!(tauri::async_runtime::block_on(set_workspace_task_checked(
            root.to_string_lossy().into(),
            path.to_string_lossy().into(),
            2,
            digest(raw),
            true
        ))
        .is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), raw);
    }

    fn view() -> SavedView {
        SavedView {
            id: "view-1".into(),
            name: "研究中的文档".into(),
            query: "tag:research".into(),
            columns: vec!["title".into(), "prop:status".into()],
            sort_by: "modifiedAt".into(),
            descending: true,
            group_by: Some("prop:status".into()),
        }
    }

    #[test]
    fn views_round_trip_and_detect_competing_writers_without_touching_notes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.to_string_lossy().to_string();
        let before = tauri::async_runtime::block_on(read_workspace_views(path.clone())).unwrap();
        assert!(before.views.is_empty());
        let saved = tauri::async_runtime::block_on(save_workspace_views(
            path.clone(),
            vec![view()],
            before.fingerprint,
        ))
        .unwrap();
        let read = tauri::async_runtime::block_on(read_workspace_views(path.clone())).unwrap();
        assert_eq!(read.views[0].query, "tag:research");
        assert_eq!(read.fingerprint, saved.fingerprint);
        assert!(tauri::async_runtime::block_on(save_workspace_views(
            path.clone(),
            vec![],
            String::new()
        ))
        .unwrap_err()
        .contains("其他窗口"));
        let removed =
            tauri::async_runtime::block_on(save_workspace_views(path, vec![], saved.fingerprint))
                .unwrap();
        assert!(removed.views.is_empty());
        let mut empty = view();
        empty.columns.clear();
        assert!(validate_views(&[empty]).is_err());
        assert!(validate_views(&[view(), view()]).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn views_refuse_private_directory_symlinks_for_reads_and_writes() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join(".markune")).unwrap();
        let path = root.to_string_lossy().to_string();
        assert!(tauri::async_runtime::block_on(read_workspace_views(path.clone())).is_err());
        assert!(tauri::async_runtime::block_on(save_workspace_views(
            path,
            vec![view()],
            String::new()
        ))
        .is_err());
        assert!(!outside.path().join("views.json").exists());
    }

    #[test]
    fn template_copy_rebases_references_while_preserving_the_template_and_source_quote() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::create_dir(root.join("Templates")).unwrap();
        fs::create_dir(root.join("notes")).unwrap();
        fs::write(root.join("Templates/target.md"), "target").unwrap();
        fs::write(root.join("Templates/source.pdf"), b"%PDF-").unwrap();
        let raw = "---\ntitle: Copied\nrelated: '[[target]]' # retain\nsource:\n  quote: '[target](target.md)'\n  reference: '[PDF](source.pdf#page=2)'\n---\n[target](target.md#h)\n";
        let template = root.join("Templates/template.md");
        fs::write(&template, raw).unwrap();
        let created = tauri::async_runtime::block_on(create_workspace_document_from_content(
            root.to_string_lossy().into(),
            "notes".into(),
            "Copied".into(),
            raw.into(),
            Some(template.to_string_lossy().into()),
        ))
        .unwrap();
        assert!(created
            .content
            .content
            .contains("[target](../Templates/target.md#h)"));
        assert!(created
            .content
            .content
            .contains("quote: '[target](target.md)'"));
        assert!(created
            .content
            .content
            .contains("[PDF](../Templates/source.pdf#page=2)"));
        assert!(created.content.content.contains("# retain"));
        assert_eq!(fs::read_to_string(template).unwrap(), raw);
    }
}

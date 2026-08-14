use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use toml_edit::{value, DocumentMut, Item, Value};
use uuid::Uuid;

use crate::{codex, codex_provider, settings, workspace};

const LEGACY_PRIVATE_DIR: &str = ".madora";
const LEGACY_ASSET_SCHEME: &str = "madora-asset://";
const LEGACY_DRAWING_SCHEME: &str = "madora-drawing://";
const LEGACY_IMPORT_SCHEME: &str = "madora-import://";
const LEGACY_EXPORT_SCHEME: &str = "madora-export://";
const LEGACY_CAPTURE_MARKER: &str = "<!-- madora-capture:";
const LEGACY_PROVIDER_ID: &str = "madora_custom";
const LEGACY_PROVIDER_ENV_KEY: &str = "MADORA_CODEX_PROVIDER_API_KEY";
const CURRENT_PROVIDER_ENV_KEY: &str = "MARKUNE_CODEX_PROVIDER_API_KEY";
const LEGACY_KEYRING_SERVICE: &str = "madora.codex.custom-provider";
const LEGACY_APP_IDENTIFIER: &str = "com.madora.app";
const MAX_MIGRATION_TEXT_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceBrandState {
    New,
    Current,
    Legacy,
    Conflict,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBrandInspection {
    pub state: WorkspaceBrandState,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBrandMigrationReport {
    pub backup_path: String,
    pub migrated_files: usize,
    pub app_settings_migrated: bool,
    pub codex_provider_migrated: bool,
    pub credential_migrated: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationManifest {
    schema_version: u32,
    migration_id: String,
    created_at: String,
    status: String,
    files: Vec<MigrationManifestFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationManifestFile {
    path: String,
    backup_path: String,
    original_sha256: String,
}

#[derive(Debug)]
struct RewritePlan {
    target_path: PathBuf,
    backup_relative_path: PathBuf,
    display_path: String,
    original_bytes: Vec<u8>,
    replacement_bytes: Vec<u8>,
}

#[tauri::command]
pub fn inspect_workspace_brand(root_path: String) -> Result<WorkspaceBrandInspection, String> {
    let root = workspace::canonical_workspace_root(&root_path)?;
    inspect_workspace_brand_impl(&root)
}

#[tauri::command]
pub async fn migrate_legacy_workspace_brand(
    app: AppHandle,
    root_path: String,
) -> Result<WorkspaceBrandMigrationReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = workspace::canonical_workspace_root(&root_path)?;
        migrate_legacy_workspace_brand_impl(&app, &root)
    })
    .await
    .map_err(|_| "工作区品牌迁移任务失败".to_string())?
}

fn inspect_workspace_brand_impl(root: &Path) -> Result<WorkspaceBrandInspection, String> {
    let legacy = root.join(LEGACY_PRIVATE_DIR);
    let current = root.join(workspace::WORKSPACE_PRIVATE_DIR);
    let legacy_exists = legacy.exists();
    let current_exists = current.exists();

    if legacy_exists && !legacy.is_dir() {
        return Ok(WorkspaceBrandInspection {
            state: WorkspaceBrandState::Conflict,
        });
    }
    if current_exists && !current.is_dir() {
        return Ok(WorkspaceBrandInspection {
            state: WorkspaceBrandState::Conflict,
        });
    }

    let state = match (legacy_exists, current_exists) {
        (false, false) => WorkspaceBrandState::New,
        (false, true) => WorkspaceBrandState::Current,
        (true, false) => WorkspaceBrandState::Legacy,
        (true, true) => WorkspaceBrandState::Conflict,
    };

    Ok(WorkspaceBrandInspection { state })
}

fn migrate_legacy_workspace_brand_impl(
    app: &AppHandle,
    root: &Path,
) -> Result<WorkspaceBrandMigrationReport, String> {
    let (migrated_files, backup_dir) = migrate_legacy_workspace_files(root)?;

    let mut warnings = Vec::new();
    let app_settings_migrated = migrate_legacy_app_settings(app).unwrap_or_else(|error| {
        warnings.push(error);
        false
    });
    let codex_provider_migrated = migrate_legacy_codex_provider(app).unwrap_or_else(|error| {
        warnings.push(error);
        false
    });
    let credential_migrated = codex_provider::migrate_api_key_from_service(LEGACY_KEYRING_SERVICE)
        .unwrap_or_else(|error| {
            warnings.push(error);
            false
        });

    Ok(WorkspaceBrandMigrationReport {
        backup_path: backup_dir
            .strip_prefix(root)
            .unwrap_or(&backup_dir)
            .to_string_lossy()
            .to_string(),
        migrated_files,
        app_settings_migrated,
        codex_provider_migrated,
        credential_migrated,
        warnings,
    })
}

fn migrate_legacy_workspace_files(root: &Path) -> Result<(usize, PathBuf), String> {
    let inspection = inspect_workspace_brand_impl(root)?;
    if inspection.state != WorkspaceBrandState::Legacy {
        return Err(match inspection.state {
            WorkspaceBrandState::Current => "工作区已经使用 Markune 数据格式".to_string(),
            WorkspaceBrandState::Conflict => {
                "工作区同时存在 .madora 与 .markune，无法安全自动合并".to_string()
            }
            WorkspaceBrandState::New => "工作区中没有需要迁移的旧数据".to_string(),
            WorkspaceBrandState::Legacy => unreachable!(),
        });
    }

    let legacy_dir = root.join(LEGACY_PRIVATE_DIR);
    let current_dir = root.join(workspace::WORKSPACE_PRIVATE_DIR);
    reject_symlink(&legacy_dir, "旧工作区数据目录不能是符号链接")?;
    let mut plans = Vec::new();
    collect_workspace_rewrite_plans(root, &legacy_dir, &current_dir, &mut plans)?;

    let migration_id = format!("{}-{}", unix_timestamp_millis(), Uuid::new_v4().simple());
    let staging_dir = root.join(format!(".markune-migration-{migration_id}"));
    fs::create_dir(&staging_dir).map_err(|error| format!("无法创建迁移暂存目录: {error}"))?;

    (|| {
        prepare_backups(&staging_dir, &plans)?;
        write_manifest(&staging_dir, &migration_id, "prepared", &plans)?;

        fs::rename(&legacy_dir, &current_dir)
            .map_err(|error| format!("无法将 .madora 重命名为 .markune: {error}"))?;

        let mut applied = Vec::new();
        for (index, plan) in plans.iter().enumerate() {
            if let Err(error) = replace_file_recoverably(&plan.target_path, &plan.replacement_bytes)
            {
                let rollback_error = rollback_workspace_migration(
                    &legacy_dir,
                    &current_dir,
                    &staging_dir,
                    &plans,
                    &applied,
                )
                .err();
                return Err(match rollback_error {
                    Some(rollback) => format!(
                        "迁移文件 {} 失败: {error}；自动回滚也失败: {rollback}。备份保留在 {}",
                        plan.display_path,
                        staging_dir.display()
                    ),
                    None => format!(
                        "迁移文件 {} 失败: {error}；已恢复旧工作区。备份保留在 {}",
                        plan.display_path,
                        staging_dir.display()
                    ),
                });
            }
            applied.push(index);
        }

        if let Err(error) = write_manifest(&staging_dir, &migration_id, "completed", &plans) {
            let rollback_error = rollback_workspace_migration(
                &legacy_dir,
                &current_dir,
                &staging_dir,
                &plans,
                &applied,
            )
            .err();
            return Err(match rollback_error {
                Some(rollback) => format!(
                    "写入迁移完成清单失败: {error}；自动回滚也失败: {rollback}。备份保留在 {}",
                    staging_dir.display()
                ),
                None => format!(
                    "写入迁移完成清单失败: {error}；已恢复旧工作区。备份保留在 {}",
                    staging_dir.display()
                ),
            });
        }
        let backup_dir = current_dir
            .join("migrations")
            .join("brand-rename")
            .join(&migration_id);
        let saved_backup_dir = match backup_dir.parent() {
            Some(parent)
                if fs::create_dir_all(parent).is_ok()
                    && fs::rename(&staging_dir, &backup_dir).is_ok() =>
            {
                backup_dir
            }
            _ => staging_dir.clone(),
        };

        Ok((plans.len(), saved_backup_dir))
    })()
}

fn collect_workspace_rewrite_plans(
    root: &Path,
    legacy_dir: &Path,
    current_dir: &Path,
    plans: &mut Vec<RewritePlan>,
) -> Result<(), String> {
    collect_root_text_files(root, root, plans)?;
    collect_private_text_files(legacy_dir, legacy_dir, current_dir, plans)?;
    plans.sort_by(|left, right| left.display_path.cmp(&right.display_path));
    Ok(())
}

fn collect_root_text_files(
    root: &Path,
    directory: &Path,
    plans: &mut Vec<RewritePlan>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("无法扫描工作区 {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("无法读取工作区条目: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("无法检查工作区条目 {}: {error}", path.display()))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if should_skip_root_directory(&name) {
                continue;
            }
            collect_root_text_files(root, &path, plans)?;
        } else if metadata.is_file() && is_workspace_text_file(&path) {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "无法计算工作区文档相对路径".to_string())?;
            maybe_add_rewrite_plan(
                &path,
                &path,
                Path::new("workspace").join(relative),
                relative.to_string_lossy().to_string(),
                plans,
            )?;
        }
    }
    Ok(())
}

fn collect_private_text_files(
    legacy_root: &Path,
    directory: &Path,
    current_root: &Path,
    plans: &mut Vec<RewritePlan>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("无法扫描旧工作区数据 {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("无法读取旧工作区条目: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("无法检查旧工作区条目 {}: {error}", path.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "旧工作区数据包含符号链接，已停止迁移: {}",
                path.display()
            ));
        }
        if metadata.is_dir() {
            if path == legacy_root.join("migrations") {
                continue;
            }
            collect_private_text_files(legacy_root, &path, current_root, plans)?;
        } else if metadata.is_file() && is_private_text_file(&path) {
            let relative = path
                .strip_prefix(legacy_root)
                .map_err(|_| "无法计算旧数据相对路径".to_string())?;
            maybe_add_rewrite_plan(
                &path,
                &current_root.join(relative),
                Path::new("legacy-private").join(relative),
                format!("{LEGACY_PRIVATE_DIR}/{}", relative.to_string_lossy()),
                plans,
            )?;
        }
    }
    Ok(())
}

fn maybe_add_rewrite_plan(
    original_path: &Path,
    target_path: &Path,
    backup_relative_path: PathBuf,
    display_path: String,
    plans: &mut Vec<RewritePlan>,
) -> Result<(), String> {
    let metadata = fs::metadata(original_path)
        .map_err(|error| format!("无法检查迁移文件 {}: {error}", original_path.display()))?;
    if metadata.len() > MAX_MIGRATION_TEXT_BYTES {
        return Err(format!(
            "迁移文件超过 100 MiB 安全上限: {}",
            original_path.display()
        ));
    }
    let original_bytes = fs::read(original_path)
        .map_err(|error| format!("无法读取迁移文件 {}: {error}", original_path.display()))?;
    if !contains_legacy_marker(&original_bytes) {
        return Ok(());
    }
    let original_text = String::from_utf8(original_bytes.clone()).map_err(|_| {
        format!(
            "包含旧标识的文件不是有效 UTF-8，无法安全迁移: {}",
            original_path.display()
        )
    })?;
    let replacement = rewrite_legacy_markers(&original_text);
    if replacement == original_text {
        return Ok(());
    }
    plans.push(RewritePlan {
        target_path: target_path.to_path_buf(),
        backup_relative_path,
        display_path,
        original_bytes,
        replacement_bytes: replacement.into_bytes(),
    });
    Ok(())
}

fn contains_legacy_marker(bytes: &[u8]) -> bool {
    [
        LEGACY_ASSET_SCHEME,
        LEGACY_DRAWING_SCHEME,
        LEGACY_IMPORT_SCHEME,
        LEGACY_EXPORT_SCHEME,
        LEGACY_CAPTURE_MARKER,
        ".madora/",
        ".madora\\",
    ]
    .iter()
    .any(|marker| {
        bytes
            .windows(marker.len())
            .any(|window| window == marker.as_bytes())
    })
}

fn rewrite_legacy_markers(source: &str) -> String {
    source
        .replace(LEGACY_ASSET_SCHEME, "markune-asset://")
        .replace(LEGACY_DRAWING_SCHEME, "markune-drawing://")
        .replace(LEGACY_IMPORT_SCHEME, "markune-import://")
        .replace(LEGACY_EXPORT_SCHEME, "markune-export://")
        .replace(LEGACY_CAPTURE_MARKER, "<!-- markune-capture:")
        .replace(".madora/", ".markune/")
        .replace(".madora\\", ".markune\\")
}

fn prepare_backups(staging_dir: &Path, plans: &[RewritePlan]) -> Result<(), String> {
    for plan in plans {
        let backup = staging_dir.join("backup").join(&plan.backup_relative_path);
        if let Some(parent) = backup.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建迁移备份目录: {error}"))?;
        }
        fs::write(&backup, &plan.original_bytes)
            .map_err(|error| format!("无法写入迁移备份 {}: {error}", backup.display()))?;
    }
    Ok(())
}

fn write_manifest(
    staging_dir: &Path,
    migration_id: &str,
    status: &str,
    plans: &[RewritePlan],
) -> Result<(), String> {
    let manifest = MigrationManifest {
        schema_version: 1,
        migration_id: migration_id.to_string(),
        created_at: unix_timestamp_millis().to_string(),
        status: status.to_string(),
        files: plans
            .iter()
            .map(|plan| MigrationManifestFile {
                path: plan.display_path.clone(),
                backup_path: Path::new("backup")
                    .join(&plan.backup_relative_path)
                    .to_string_lossy()
                    .to_string(),
                original_sha256: sha256_hex(&plan.original_bytes),
            })
            .collect(),
    };
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("无法序列化迁移清单: {error}"))?;
    fs::write(staging_dir.join("migration.json"), format!("{json}\n"))
        .map_err(|error| format!("无法写入迁移清单: {error}"))
}

fn rollback_workspace_migration(
    legacy_dir: &Path,
    current_dir: &Path,
    staging_dir: &Path,
    plans: &[RewritePlan],
    applied: &[usize],
) -> Result<(), String> {
    let mut errors = Vec::new();
    for index in applied.iter().rev() {
        let plan = &plans[*index];
        let backup = staging_dir.join("backup").join(&plan.backup_relative_path);
        if let Err(error) = restore_file(&plan.target_path, &backup) {
            errors.push(format!("恢复 {} 失败: {error}", plan.display_path));
        }
    }
    if current_dir.exists() && !legacy_dir.exists() {
        if let Err(error) = fs::rename(current_dir, legacy_dir) {
            errors.push(format!("恢复 .madora 目录失败: {error}"));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

fn restore_file(target: &Path, backup: &Path) -> io::Result<()> {
    let bytes = fs::read(backup)?;
    replace_file_recoverably(target, &bytes)
}

fn replace_file_recoverably(path: &Path, content: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("migration-file");
    let unique = Uuid::new_v4().simple().to_string();
    let temp_path = parent.join(format!(".{file_name}.markune-{unique}.tmp"));
    let rollback_path = parent.join(format!(".{file_name}.markune-{unique}.rollback"));
    let permissions = fs::metadata(path)?.permissions();
    fs::write(&temp_path, content)?;
    fs::set_permissions(&temp_path, permissions)?;
    fs::rename(path, &rollback_path)?;
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::rename(&rollback_path, path);
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    let _ = fs::remove_file(rollback_path);
    Ok(())
}

fn migrate_legacy_app_settings(app: &AppHandle) -> Result<bool, String> {
    let target = settings::settings_path(app)?;
    if target.exists() {
        return Ok(false);
    }
    let identifier_dir = target
        .parent()
        .ok_or_else(|| "无法定位 Markune 设置目录".to_string())?;
    let app_config_root = identifier_dir
        .parent()
        .ok_or_else(|| "无法定位应用配置根目录".to_string())?;
    let legacy = app_config_root
        .join(LEGACY_APP_IDENTIFIER)
        .join("settings.json");
    if !legacy.is_file() {
        return Ok(false);
    }
    let raw =
        fs::read_to_string(&legacy).map_err(|error| format!("读取旧应用设置失败: {error}"))?;
    let parsed = serde_json::from_str::<settings::AppSettings>(&raw)
        .map_err(|error| format!("旧应用设置格式损坏: {error}"))?;
    settings::validate_app_settings(&parsed)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Markune 设置目录失败: {error}"))?;
    }
    fs::write(&target, raw).map_err(|error| format!("迁移应用设置失败: {error}"))?;
    Ok(true)
}

fn migrate_legacy_codex_provider(app: &AppHandle) -> Result<bool, String> {
    let storage = codex::resolve_codex_storage(app, None)?;
    let path = storage.root.join("config.toml");
    if !path.is_file() {
        return Ok(false);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("读取 Codex config.toml 失败: {error}"))?;
    let mut document = raw
        .parse::<DocumentMut>()
        .map_err(|error| format!("解析 Codex config.toml 失败: {error}"))?;

    let changed = migrate_codex_provider_document(&mut document)?;
    if !changed {
        return Ok(false);
    }

    let backup = path.with_extension(format!(
        "toml.markune-brand-backup-{}",
        Uuid::new_v4().simple()
    ));
    fs::copy(&path, &backup).map_err(|error| format!("备份 Codex config.toml 失败: {error}"))?;
    replace_file_recoverably(&path, document.to_string().as_bytes())
        .map_err(|error| format!("迁移 Codex 自定义 Provider 失败: {error}"))?;
    Ok(true)
}

fn migrate_codex_provider_document(document: &mut DocumentMut) -> Result<bool, String> {
    let target_provider = codex_provider::CUSTOM_PROVIDER_ID;
    let legacy_enabled =
        document.get("model_provider").and_then(Item::as_str) == Some(LEGACY_PROVIDER_ID);
    let providers = document
        .get_mut("model_providers")
        .and_then(Item::as_table_mut);
    let legacy_exists = providers
        .as_ref()
        .is_some_and(|table| table.contains_key(LEGACY_PROVIDER_ID));
    if !legacy_enabled && !legacy_exists {
        return Ok(false);
    }

    if let Some(table) = providers.as_ref() {
        if legacy_exists && table.contains_key(target_provider) {
            return Err("Codex 配置同时包含旧版和 Markune 自定义 Provider，未自动覆盖".to_string());
        }
    }

    if let Some(table) = document
        .get_mut("model_providers")
        .and_then(Item::as_table_mut)
    {
        if let Some(mut legacy) = table.remove(LEGACY_PROVIDER_ID) {
            if let Some(provider) = legacy.as_table_mut() {
                if provider.get("env_key").and_then(Item::as_str) == Some(LEGACY_PROVIDER_ENV_KEY) {
                    provider["env_key"] = value(CURRENT_PROVIDER_ENV_KEY);
                }
            } else if let Some(provider) = legacy.as_inline_table_mut() {
                if provider.get("env_key").and_then(Value::as_str) == Some(LEGACY_PROVIDER_ENV_KEY)
                {
                    provider.insert("env_key", Value::from(CURRENT_PROVIDER_ENV_KEY));
                }
            }
            table.insert(target_provider, legacy);
        }
    }
    if legacy_enabled {
        document["model_provider"] = value(target_provider);
    }

    Ok(true)
}

fn should_skip_root_directory(name: &str) -> bool {
    name == LEGACY_PRIVATE_DIR
        || name == workspace::WORKSPACE_PRIVATE_DIR
        || name == ".git"
        || name.starts_with(".markune-migration-")
        || matches!(name, "node_modules" | "target" | "dist" | "build" | "out")
}

fn is_workspace_text_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "mdx")
    )
}

fn is_private_text_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "mdx" | "json" | "excalidraw" | "excalidrawlib")
    )
}

fn reject_symlink(path: &Path, message: &str) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("无法检查旧工作区数据目录: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err(message.to_string());
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn inspects_new_current_legacy_and_conflicting_workspaces() {
        let root = tempdir().expect("create temp workspace");
        assert_eq!(
            inspect_workspace_brand_impl(root.path())
                .expect("inspect new workspace")
                .state,
            WorkspaceBrandState::New
        );

        fs::create_dir(root.path().join(LEGACY_PRIVATE_DIR)).expect("create legacy directory");
        assert_eq!(
            inspect_workspace_brand_impl(root.path())
                .expect("inspect legacy workspace")
                .state,
            WorkspaceBrandState::Legacy
        );

        fs::create_dir(root.path().join(workspace::WORKSPACE_PRIVATE_DIR))
            .expect("create current directory");
        assert_eq!(
            inspect_workspace_brand_impl(root.path())
                .expect("inspect conflict")
                .state,
            WorkspaceBrandState::Conflict
        );

        fs::remove_dir(root.path().join(LEGACY_PRIVATE_DIR)).expect("remove legacy directory");
        assert_eq!(
            inspect_workspace_brand_impl(root.path())
                .expect("inspect current workspace")
                .state,
            WorkspaceBrandState::Current
        );
    }

    #[test]
    fn rewrites_only_legacy_machine_markers() {
        let source = concat!(
            "Madora 品牌文字保留在用户正文。\n",
            "![图](madora-asset://abc)\n",
            "[画板](madora-drawing://123)\n",
            "<!-- madora-capture:capture-1 -->\n",
            ".madora/assets/files/a.png\n",
        );
        let rewritten = rewrite_legacy_markers(source);
        assert!(rewritten.contains("Madora 品牌文字保留在用户正文。"));
        assert!(rewritten.contains("markune-asset://abc"));
        assert!(rewritten.contains("markune-drawing://123"));
        assert!(rewritten.contains("<!-- markune-capture:capture-1 -->"));
        assert!(rewritten.contains(".markune/assets/files/a.png"));
    }

    #[test]
    fn plans_workspace_and_private_rewrites_without_touching_plain_brand_text() {
        let root = tempdir().expect("create temp workspace");
        let legacy = root.path().join(LEGACY_PRIVATE_DIR);
        let current = root.path().join(workspace::WORKSPACE_PRIVATE_DIR);
        fs::create_dir_all(legacy.join("inbox")).expect("create inbox");
        fs::write(
            root.path().join("Guide.md"),
            "Madora\n\n![asset](madora-asset://abc)\n",
        )
        .expect("write document");
        fs::write(root.path().join("Plain.md"), "Madora only\n").expect("write plain document");
        fs::write(
            legacy.join("inbox/capture.md"),
            "<!-- madora-capture:capture-1 -->\n",
        )
        .expect("write capture");

        let mut plans = Vec::new();
        collect_workspace_rewrite_plans(root.path(), &legacy, &current, &mut plans)
            .expect("collect rewrite plans");
        assert_eq!(plans.len(), 2);
        assert!(plans.iter().any(|plan| plan.display_path == "Guide.md"));
        assert!(!plans.iter().any(|plan| plan.display_path == "Plain.md"));
        assert!(plans
            .iter()
            .any(|plan| plan.target_path == current.join("inbox/capture.md")));
    }

    #[test]
    fn migrates_legacy_directory_links_and_backup_manifest() {
        let root = tempdir().expect("create temp workspace");
        let legacy = root.path().join(LEGACY_PRIVATE_DIR);
        fs::create_dir_all(legacy.join("inbox")).expect("create legacy inbox");
        fs::write(legacy.join("workspace.json"), "{\"schemaVersion\":1}\n")
            .expect("write workspace metadata");
        fs::write(
            legacy.join("inbox/capture.md"),
            "<!-- madora-capture:capture-1 -->\n",
        )
        .expect("write capture");
        fs::write(
            root.path().join("Guide.md"),
            "Madora\n\n![asset](madora-asset://abc)\n",
        )
        .expect("write document");

        let (migrated_files, backup_dir) =
            migrate_legacy_workspace_files(root.path()).expect("migrate workspace");

        assert_eq!(migrated_files, 2);
        assert!(!legacy.exists());
        assert!(root.path().join(".markune/workspace.json").is_file());
        assert_eq!(
            fs::read_to_string(root.path().join("Guide.md")).expect("read migrated document"),
            "Madora\n\n![asset](markune-asset://abc)\n"
        );
        assert_eq!(
            fs::read_to_string(root.path().join(".markune/inbox/capture.md"))
                .expect("read migrated capture"),
            "<!-- markune-capture:capture-1 -->\n"
        );
        assert!(backup_dir.join("migration.json").is_file());
        assert!(backup_dir.join("backup/workspace/Guide.md").is_file());
        assert!(backup_dir
            .join("backup/legacy-private/inbox/capture.md")
            .is_file());
    }

    #[test]
    fn migrates_legacy_codex_provider_id_and_environment_key() {
        let mut document = r#"
model_provider = "madora_custom"

[model_providers.madora_custom]
name = "Custom"
base_url = "https://example.com/v1"
env_key = "MADORA_CODEX_PROVIDER_API_KEY"
wire_api = "responses"
"#
        .parse::<DocumentMut>()
        .expect("parse legacy provider config");

        assert!(
            migrate_codex_provider_document(&mut document).expect("migrate legacy provider config")
        );

        assert_eq!(
            document.get("model_provider").and_then(Item::as_str),
            Some("markune_custom")
        );
        let provider = document["model_providers"]["markune_custom"]
            .as_table()
            .expect("current provider table");
        assert_eq!(
            provider.get("env_key").and_then(Item::as_str),
            Some("MARKUNE_CODEX_PROVIDER_API_KEY")
        );
        assert!(document["model_providers"]
            .as_table()
            .is_some_and(|table| !table.contains_key("madora_custom")));
    }

    #[test]
    fn refuses_to_overwrite_an_existing_markune_codex_provider() {
        let mut document = r#"
[model_providers.madora_custom]
env_key = "MADORA_CODEX_PROVIDER_API_KEY"

[model_providers.markune_custom]
env_key = "MARKUNE_CODEX_PROVIDER_API_KEY"
"#
        .parse::<DocumentMut>()
        .expect("parse conflicting provider config");

        let error = migrate_codex_provider_document(&mut document)
            .expect_err("existing Markune provider must not be overwritten");

        assert!(error.contains("未自动覆盖"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_inside_legacy_private_data() {
        use std::os::unix::fs::symlink;

        let root = tempdir().expect("create temp workspace");
        let legacy = root.path().join(LEGACY_PRIVATE_DIR);
        let current = root.path().join(workspace::WORKSPACE_PRIVATE_DIR);
        fs::create_dir(&legacy).expect("create legacy directory");
        fs::write(root.path().join("outside.json"), "{}\n").expect("write outside file");
        symlink(
            root.path().join("outside.json"),
            legacy.join("workspace.json"),
        )
        .expect("create symlink");

        let mut plans = Vec::new();
        let error = collect_workspace_rewrite_plans(root.path(), &legacy, &current, &mut plans)
            .expect_err("symlink must be rejected");
        assert!(error.contains("符号链接"));
    }
}

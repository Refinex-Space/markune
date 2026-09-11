use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Read};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionFile {
    path: String,
    fingerprint: String,
    bytes: usize,
}
#[tauri::command]
pub async fn read_codex_instruction_manifest(
    root_path: String,
) -> Result<Vec<InstructionFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let mut result = Vec::new();
        for directory in root.ancestors().take(16) {
            for name in ["AGENTS.override.md", "AGENTS.md"] {
                let path = directory.join(name);
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(meta) => meta,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                    Err(_) => return Err("无法读取指令文件信息".into()),
                };
                if !metadata.is_file()
                    || metadata.file_type().is_symlink()
                    || metadata.len() > 65536
                {
                    continue;
                }
                let mut bytes = Vec::new();
                fs::File::open(&path)
                    .map_err(|_| "无法读取指令清单")?
                    .take(65537)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "无法读取指令清单")?;
                if bytes.len() > 65536 {
                    continue;
                }
                result.push(InstructionFile {
                    path: path.to_string_lossy().into_owned(),
                    fingerprint: format!("{:x}", Sha256::digest(&bytes)),
                    bytes: bytes.len(),
                });
                break;
            }
        }
        result.reverse();
        Ok(result)
    })
    .await
    .map_err(|_| "指令检查任务失败".to_string())?
}

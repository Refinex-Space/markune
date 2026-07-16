use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};

const INITIALIZE_REQUEST_ID: u64 = 0;
const CODEX_EVENT_NAME: &str = "codex:event";

#[derive(Default)]
pub struct CodexState {
    session: Mutex<Option<CodexSession>>,
}

impl Drop for CodexState {
    fn drop(&mut self) {
        if let Ok(session) = self.session.get_mut() {
            if let Some(mut session) = session.take() {
                let _ = session.child.kill();
            }
        }
    }
}

struct CodexSession {
    root: PathBuf,
    binary_source: String,
    version: String,
    writer: Arc<Mutex<ChildStdin>>,
    child: Child,
    pending_server_requests: Arc<Mutex<HashMap<String, String>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeInfo {
    available: bool,
    running: bool,
    binary_source: Option<String>,
    version: Option<String>,
    message: Option<String>,
}

struct CodexBinary {
    path: PathBuf,
    source: String,
    version: String,
}

#[tauri::command]
pub fn codex_runtime_probe(app: AppHandle) -> CodexRuntimeInfo {
    match resolve_codex_binary(&app) {
        Ok(binary) => CodexRuntimeInfo {
            available: true,
            running: false,
            binary_source: Some(binary.source),
            version: Some(binary.version),
            message: None,
        },
        Err(message) => CodexRuntimeInfo {
            available: false,
            running: false,
            binary_source: None,
            version: None,
            message: Some(message),
        },
    }
}

#[tauri::command]
pub fn codex_runtime_start(
    app: AppHandle,
    state: State<'_, CodexState>,
    root_path: String,
) -> Result<CodexRuntimeInfo, String> {
    let root = validate_workspace_root(&root_path)?;
    let mut session_guard = state
        .session
        .lock()
        .map_err(|_| "Codex 运行时状态锁已损坏".to_string())?;

    if let Some(session) = session_guard.as_mut() {
        if session.root == root && session.child.try_wait().ok().flatten().is_none() {
            return Ok(runtime_info_for_session(session));
        }

        let _ = session.child.kill();
        *session_guard = None;
    }

    let binary = resolve_codex_binary(&app)?;
    let mut child = Command::new(&binary.path)
        .args(["app-server", "--listen", "stdio://"])
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Codex App Server 失败: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex App Server 标准输入不可用".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex App Server 标准输出不可用".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex App Server 标准错误不可用".to_string())?;
    let writer = Arc::new(Mutex::new(stdin));
    let pending_server_requests = Arc::new(Mutex::new(HashMap::new()));

    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut sink = String::new();

        while reader.read_line(&mut sink).unwrap_or(0) > 0 {
            sink.clear();
        }
    });

    let initialize = json!({
        "id": INITIALIZE_REQUEST_ID,
        "method": "initialize",
        "params": {
            "clientInfo": {
                "name": "madora",
                "title": "Madora AI",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true,
                "requestAttestation": false
            }
        }
    });
    write_json_line(&writer, &initialize)?;

    let mut stdout_reader = BufReader::new(stdout);
    let mut initialize_line = String::new();
    if let Err(error) = stdout_reader.read_line(&mut initialize_line) {
        let _ = child.kill();
        return Err(format!("读取 Codex 初始化响应失败: {error}"));
    }
    let initialize_response = match serde_json::from_str::<Value>(&initialize_line) {
        Ok(response) => response,
        Err(error) => {
            let _ = child.kill();
            return Err(format!("解析 Codex 初始化响应失败: {error}"));
        }
    };

    if initialize_response.get("id").and_then(Value::as_u64) != Some(INITIALIZE_REQUEST_ID)
        || initialize_response.get("result").is_none()
    {
        let _ = child.kill();
        return Err("Codex App Server 初始化失败".to_string());
    }

    let _ = app.emit(CODEX_EVENT_NAME, initialize_response);
    if let Err(error) = write_json_line(&writer, &json!({ "method": "initialized" })) {
        let _ = child.kill();
        return Err(error);
    }
    spawn_stdout_reader(
        app.clone(),
        stdout_reader,
        Arc::clone(&pending_server_requests),
    );

    let session = CodexSession {
        root,
        binary_source: binary.source,
        version: binary.version,
        writer,
        child,
        pending_server_requests,
    };
    let info = runtime_info_for_session(&session);
    *session_guard = Some(session);

    Ok(info)
}

#[tauri::command]
pub fn codex_runtime_stop(state: State<'_, CodexState>) -> Result<(), String> {
    let mut session_guard = state
        .session
        .lock()
        .map_err(|_| "Codex 运行时状态锁已损坏".to_string())?;

    if let Some(mut session) = session_guard.take() {
        session
            .child
            .kill()
            .map_err(|error| format!("关闭 Codex App Server 失败: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn codex_app_server_request(
    state: State<'_, CodexState>,
    request_id: u64,
    method: String,
    params: Value,
) -> Result<(), String> {
    if request_id == INITIALIZE_REQUEST_ID {
        return Err("请求标识 0 由初始化流程保留".to_string());
    }
    if !is_allowed_client_method(&method) {
        return Err(format!("不允许调用 Codex App Server 方法: {method}"));
    }

    let session_guard = state
        .session
        .lock()
        .map_err(|_| "Codex 运行时状态锁已损坏".to_string())?;
    let session = session_guard
        .as_ref()
        .ok_or_else(|| "Codex App Server 尚未启动".to_string())?;

    validate_request_params(&session.root, &method, &params)?;
    write_json_line(
        &session.writer,
        &json!({
            "id": request_id,
            "method": method,
            "params": params,
        }),
    )
}

#[tauri::command]
pub fn codex_app_server_respond(
    state: State<'_, CodexState>,
    request_id: Value,
    decision: String,
) -> Result<(), String> {
    if !matches!(
        decision.as_str(),
        "accept" | "acceptForSession" | "decline" | "cancel"
    ) {
        return Err("无效的 Codex 审批决定".to_string());
    }

    let session_guard = state
        .session
        .lock()
        .map_err(|_| "Codex 运行时状态锁已损坏".to_string())?;
    let session = session_guard
        .as_ref()
        .ok_or_else(|| "Codex App Server 尚未启动".to_string())?;
    let request_key = request_id_key(&request_id)?;
    let method = session
        .pending_server_requests
        .lock()
        .map_err(|_| "Codex 审批状态锁已损坏".to_string())?
        .remove(&request_key)
        .ok_or_else(|| "Codex 审批请求不存在或已处理".to_string())?;
    let protocol_decision = match method.as_str() {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            Value::String(decision)
        }
        "execCommandApproval" | "applyPatchApproval" => Value::String(
            match decision.as_str() {
                "accept" => "approved",
                "acceptForSession" => "approved_for_session",
                "decline" => "denied",
                _ => "abort",
            }
            .to_string(),
        ),
        _ => return Err("当前 Codex 请求不支持由审批按钮处理".to_string()),
    };

    write_json_line(
        &session.writer,
        &json!({
            "id": request_id,
            "result": { "decision": protocol_decision },
        }),
    )
}

fn spawn_stdout_reader(
    app: AppHandle,
    stdout: impl BufRead + Send + 'static,
    pending_server_requests: Arc<Mutex<HashMap<String, String>>>,
) {
    thread::spawn(move || {
        for line in stdout.lines() {
            let Ok(line) = line else {
                emit_runtime_event(&app, "madora/runtime/readError", "读取 Codex 输出失败");
                break;
            };
            let Ok(payload) = serde_json::from_str::<Value>(&line) else {
                emit_runtime_event(&app, "madora/runtime/protocolError", "Codex 返回了无效消息");
                continue;
            };

            if let (Some(request_id), Some(method)) = (
                payload.get("id"),
                payload.get("method").and_then(Value::as_str),
            ) {
                if is_supported_server_request(method) {
                    if let Ok(key) = request_id_key(request_id) {
                        if let Ok(mut pending) = pending_server_requests.lock() {
                            pending.insert(key, method.to_string());
                        }
                    }
                }
            }

            let _ = app.emit(CODEX_EVENT_NAME, payload);
        }

        emit_runtime_event(&app, "madora/runtime/exited", "Codex App Server 已停止");
    });
}

fn emit_runtime_event(app: &AppHandle, method: &str, message: &str) {
    let _ = app.emit(
        CODEX_EVENT_NAME,
        json!({
            "method": method,
            "params": { "message": message },
        }),
    );
}

fn write_json_line(writer: &Arc<Mutex<ChildStdin>>, payload: &Value) -> Result<(), String> {
    let mut writer = writer
        .lock()
        .map_err(|_| "Codex 输入锁已损坏".to_string())?;
    serde_json::to_writer(&mut *writer, payload)
        .map_err(|error| format!("编码 Codex 请求失败: {error}"))?;
    writer
        .write_all(b"\n")
        .and_then(|_| writer.flush())
        .map_err(|error| format!("写入 Codex App Server 失败: {error}"))
}

fn validate_workspace_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn validate_request_params(root: &Path, method: &str, params: &Value) -> Result<(), String> {
    if matches!(method, "thread/start" | "thread/resume" | "turn/start") {
        if let Some(cwd) = params.get("cwd").and_then(Value::as_str) {
            validate_path_within_root(root, cwd)?;
        }
    }

    if method == "thread/list" {
        if let Some(cwd) = params.get("cwd") {
            match cwd {
                Value::String(path) => validate_path_within_root(root, path)?,
                Value::Array(paths) => {
                    for path in paths.iter().filter_map(Value::as_str) {
                        validate_path_within_root(root, path)?;
                    }
                }
                Value::Null => {}
                _ => return Err("线程列表 cwd 参数无效".to_string()),
            }
        }
    }

    if method == "turn/start" {
        if let Some(inputs) = params.get("input").and_then(Value::as_array) {
            for input in inputs {
                let input_type = input.get("type").and_then(Value::as_str);

                if matches!(input_type, Some("mention" | "localImage")) {
                    let path = input
                        .get("path")
                        .and_then(Value::as_str)
                        .ok_or_else(|| "Codex 上下文文件缺少路径".to_string())?;
                    validate_path_within_root(root, path)?;
                }
            }
        }
    }

    Ok(())
}

fn validate_path_within_root(root: &Path, path: &str) -> Result<(), String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;
    let candidate = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("Codex 上下文路径不可用: {error}"))?;

    if candidate != root && !candidate.starts_with(&root) {
        return Err("Codex 请求路径超出当前工作区".to_string());
    }

    Ok(())
}

fn is_allowed_client_method(method: &str) -> bool {
    matches!(
        method,
        "account/read"
            | "account/login/start"
            | "account/logout"
            | "model/list"
            | "thread/start"
            | "thread/resume"
            | "thread/list"
            | "thread/read"
            | "thread/archive"
            | "thread/delete"
            | "thread/name/set"
            | "turn/start"
            | "turn/interrupt"
            | "mcpServerStatus/list"
            | "mcpServer/oauth/login"
            | "config/mcpServer/reload"
            | "skills/list"
    )
}

fn is_supported_server_request(method: &str) -> bool {
    matches!(
        method,
        "item/commandExecution/requestApproval"
            | "item/fileChange/requestApproval"
            | "execCommandApproval"
            | "applyPatchApproval"
    )
}

fn request_id_key(request_id: &Value) -> Result<String, String> {
    match request_id {
        Value::String(value) => Ok(format!("s:{value}")),
        Value::Number(value) => Ok(format!("n:{value}")),
        _ => Err("Codex 请求标识无效".to_string()),
    }
}

fn runtime_info_for_session(session: &CodexSession) -> CodexRuntimeInfo {
    CodexRuntimeInfo {
        available: true,
        running: true,
        binary_source: Some(session.binary_source.clone()),
        version: Some(session.version.clone()),
        message: None,
    }
}

fn resolve_codex_binary(app: &AppHandle) -> Result<CodexBinary, String> {
    if let Some(configured) = env::var_os("MADORA_CODEX_BIN") {
        let path = PathBuf::from(configured);
        return probe_binary(path, "configured")
            .ok_or_else(|| "MADORA_CODEX_BIN 指向的 Codex 不可执行".to_string());
    }

    let executable_name = if cfg!(windows) { "codex.exe" } else { "codex" };
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push((resource_dir.join(executable_name), "bundled"));
        candidates.push((
            resource_dir.join("binaries").join(executable_name),
            "bundled",
        ));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(executable_dir) = current_exe.parent() {
            candidates.push((executable_dir.join(executable_name), "bundled"));
        }
    }

    if let Some(path) = find_on_path(executable_name) {
        candidates.push((path, "path"));
    }

    if cfg!(target_os = "macos") {
        candidates.push((
            PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
            "chatgpt-app",
        ));
    }

    for (path, source) in candidates {
        if let Some(binary) = probe_binary(path, source) {
            return Ok(binary);
        }
    }

    Err("未找到可用的 Codex App Server；请安装 Codex 或配置 MADORA_CODEX_BIN".to_string())
}

fn probe_binary(path: PathBuf, source: &str) -> Option<CodexBinary> {
    if !path.is_file() {
        return None;
    }

    let output = Command::new(&path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();

    Some(CodexBinary {
        path,
        source: source.to_string(),
        version,
    })
}

fn find_on_path(executable_name: &str) -> Option<PathBuf> {
    env::var_os("PATH")?
        .to_string_lossy()
        .split(if cfg!(windows) { ';' } else { ':' })
        .map(Path::new)
        .map(|directory| directory.join(executable_name))
        .find(|candidate| fs::metadata(candidate).is_ok_and(|metadata| metadata.is_file()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn allowlist_rejects_generic_filesystem_and_shell_methods() {
        assert!(is_allowed_client_method("thread/start"));
        assert!(!is_allowed_client_method("fs/remove"));
        assert!(!is_allowed_client_method("thread/shellCommand"));
    }

    #[test]
    fn request_paths_must_stay_inside_workspace() {
        let root = tempdir().expect("create root");
        let document = root.path().join("note.md");
        fs::write(&document, "# Note").expect("write note");
        let params = json!({
            "threadId": "thread",
            "input": [{
                "type": "mention",
                "name": "note.md",
                "path": document,
            }]
        });

        assert!(validate_request_params(root.path(), "turn/start", &params).is_ok());
        assert!(validate_path_within_root(root.path(), "/").is_err());
    }

    #[test]
    fn server_request_ids_support_strings_and_numbers() {
        assert_eq!(request_id_key(&json!(4)).unwrap(), "n:4");
        assert_eq!(request_id_key(&json!("approval")).unwrap(), "s:approval");
        assert!(request_id_key(&Value::Null).is_err());
    }
}

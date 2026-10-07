mod catalog;
mod client_tools;
mod context;
mod history;
mod install_task;
use install_task::InstallTask;
pub mod mcp;
pub mod process;
pub use mcp::proxy_main;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use uuid::Uuid;

const MAX_FRAME: usize = 8 * 1024 * 1024;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProfile {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub secret_keys: Vec<String>,
    pub version: Option<String>,
    pub managed_path: Option<String>,
    #[serde(default)]
    pub mcp_enabled: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
}
fn yes() -> bool {
    true
}
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSettings {
    profiles: Vec<AgentProfile>,
    default_profile_id: Option<String>,
}
struct ProgramGrant {
    path: PathBuf,
    owner: String,
    created: std::time::Instant,
}
#[derive(Default)]
pub struct AgentHostState {
    operations: Mutex<()>,
    install_task: Mutex<Option<Arc<InstallTask>>>,
    leases: Arc<Mutex<HashMap<String, String>>>,
    connections: Mutex<HashMap<String, Arc<process::AgentProcess>>>,
    selected_programs: Mutex<HashMap<String, ProgramGrant>>,
    mcp_pending: Mutex<HashMap<String, mcp::PendingTool>>,
}
impl AgentHostState {
    pub fn shutdown_window(&self, label: &str) {
        if let Ok(job) = self.install_task.lock() {
            if let Some(task) = job.as_ref().filter(|task| {
                task.window
                    .as_ref()
                    .is_some_and(|window| window.label() == label)
            }) {
                task.cancel();
            }
        }
        if let Ok(mut all) = self.connections.lock() {
            all.retain(|_, process| {
                if process.owner == label {
                    process.stop();
                    false
                } else {
                    true
                }
            });
        }
    }
    pub fn shutdown(&self) {
        if let Ok(job) = self.install_task.lock() {
            if let Some(task) = job.as_ref() {
                task.cancel();
            }
        }
        if let Ok(mut all) = self.connections.lock() {
            for process in all.values() {
                process.stop();
            }
            all.clear();
        }
    }
}
impl Drop for AgentHostState {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn storage(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "无法定位智能体数据目录")?
        .join("agents");
    fs::create_dir_all(&root).map_err(|_| "无法创建智能体数据目录")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法保护智能体数据目录")?;
    }
    root.canonicalize()
        .map_err(|_| "智能体数据目录不可用".into())
}
fn read_json(path: &Path) -> Result<Value, String> {
    let mut bytes = Vec::new();
    let metadata = fs::symlink_metadata(path).map_err(|_| "记录不存在")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16 * 1024 * 1024
    {
        return Err("记录类型或大小无效".into());
    }
    fs::File::open(path)
        .map_err(|_| "无法读取记录")?
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取记录")?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("记录过大".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "记录内容损坏".into())
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建记录目录")?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|_| "无法编码记录")?;
    if text.len() > 16 * 1024 * 1024 {
        return Err("记录超过大小限制".into());
    }
    crate::workspace::write_text_atomic(path, &text).map_err(|_| "无法保存记录")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|_| "无法保护记录")?;
    }
    Ok(())
}
fn settings(root: &Path) -> Result<AgentSettings, String> {
    let path = root.join("profiles.json");
    if !path.exists() {
        return Ok(AgentSettings::default());
    }
    serde_json::from_value(read_json(&path)?).map_err(|_| "智能体配置损坏，请保留文件并检查".into())
}
fn save_settings(root: &Path, value: &AgentSettings) -> Result<(), String> {
    write_json(
        &root.join("profiles.json"),
        &serde_json::to_value(value).map_err(|_| "无法编码配置")?,
    )
}
fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn hash_json(value: &Value) -> String {
    sha256(serde_json::to_string(value).unwrap_or_default().as_bytes())
}
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn command(program: &Path, args: &[String]) -> Command {
    #[cfg(windows)]
    let mut process = {
        use std::os::windows::process::CommandExt;
        let mut p = Command::new(program);
        p.creation_flags(0x08000000 | 0x00000200);
        p
    };
    #[cfg(not(windows))]
    let mut process = Command::new(program);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        process.process_group(0);
    }
    let inherited = [
        "PATH",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "TERM",
        "COMSPEC",
        "SHELL",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "ALL_PROXY",
        "all_proxy",
        "NODE_EXTRA_CA_CERTS",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_RUNTIME_DIR",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
    ];
    process.env_clear();
    for key in inherited {
        if let Some(value) = std::env::var_os(key) {
            process.env(key, value);
        }
    }
    process.args(args);
    process
}
fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill.exe")
            .creation_flags(0x08000000)
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
fn profile(root: &Path, id: &str) -> Result<AgentProfile, String> {
    settings(root)?
        .profiles
        .into_iter()
        .find(|p| p.id == id && p.enabled)
        .ok_or("智能体未安装或已停用".into())
}
fn connection(
    state: &AgentHostState,
    window: &WebviewWindow,
    id: &str,
) -> Result<Arc<process::AgentProcess>, String> {
    state
        .connections
        .lock()
        .map_err(|_| "连接状态不可用")?
        .get(id)
        .filter(|p| p.owner == window.label())
        .cloned()
        .ok_or("智能体连接已关闭".into())
}

#[tauri::command]
pub async fn agent_catalog(app: AppHandle, refresh: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage(&app)?;
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let mut value = catalog::read_catalog(&root, refresh)?;
        let saved = settings(&root)?;
        value["profiles"] =
            serde_json::to_value(saved.profiles).map_err(|_| "无法编码智能体配置")?;
        value["defaultProfileId"] = json!(saved.default_profile_id);
        value["localAgents"] = json!(catalog::discover());
        Ok(value)
    })
    .await
    .map_err(|_| "读取智能体目录失败".to_string())?
}
#[tauri::command]
pub async fn agent_install(
    app: AppHandle,
    window: WebviewWindow,
    agent_id: String,
    catalog_digest: String,
) -> Result<AgentProfile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state
            .operations
            .try_lock()
            .map_err(|_| "已有安装或配置操作进行中，请稍后重试")?;
        let root = storage(&app)?;
        let task = Arc::new(InstallTask::new(window, agent_id.clone()));
        *state.install_task.lock().map_err(|_| "安装状态不可用")? = Some(task.clone());
        let outcome = catalog::install(&root, &agent_id, &catalog_digest, &task);
        task.finish_child();
        task.progress("finished");
        *state.install_task.lock().map_err(|_| "安装状态不可用")? = None;
        task.check()?;
        let installed = outcome?;
        let mut saved = settings(&root)?;
        saved.default_profile_id = Some(installed.id.clone());
        saved.profiles.push(installed.clone());
        save_settings(&root, &saved)?;
        Ok(installed)
    })
    .await
    .map_err(|_| "智能体安装任务失败".to_string())?
}
#[tauri::command]
pub async fn agent_use_local(app: AppHandle, agent_id: String) -> Result<AgentProfile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage(&app)?;
        let candidate = catalog::discover()
            .into_iter()
            .find(|item| item["agentId"] == agent_id)
            .ok_or("没有检测到此智能体，请先安装 CLI")?;
        let catalog = catalog::read_catalog(&root, false)?;
        let name = catalog["agents"]
            .as_array()
            .and_then(|items| items.iter().find(|item| item["id"] == agent_id))
            .and_then(|item| item["name"].as_str())
            .unwrap_or(&agent_id);
        let installed = AgentProfile {
            id: Uuid::new_v4().to_string(),
            agent_id: agent_id.clone(),
            name: name.into(),
            executable: candidate["executable"]
                .as_str()
                .ok_or("程序路径无效")?
                .into(),
            args: catalog::string_args(&candidate["args"])?,
            env: BTreeMap::new(),
            secret_keys: vec![],
            version: None,
            managed_path: None,
            mcp_enabled: true,
            enabled: true,
        };
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let mut saved = settings(&root)?;
        saved.default_profile_id = Some(installed.id.clone());
        saved.profiles.push(installed.clone());
        save_settings(&root, &saved)?;
        Ok(installed)
    })
    .await
    .map_err(|_| "添加本机智能体失败".to_string())?
}
#[tauri::command]
pub async fn agent_select_program(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let selected = app
        .dialog()
        .file()
        .set_title("选择 ACP 智能体启动程序")
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "请选择本地程序")?
        .canonicalize()
        .map_err(|_| "程序路径不可用")?;
    if !path.is_file() {
        return Err("请选择普通程序文件".into());
    }
    let token = Uuid::new_v4().to_string();
    app.state::<AgentHostState>()
        .selected_programs
        .lock()
        .map_err(|_| "程序选择状态不可用")?
        .insert(
            token.clone(),
            ProgramGrant {
                path: path.clone(),
                owner: window.label().into(),
                created: std::time::Instant::now(),
            },
        );
    Ok(Some(json!({"grantId":token,"path":path})))
}
#[tauri::command]
pub async fn agent_save_profile(
    app: AppHandle,
    window: WebviewWindow,
    mut value: AgentProfile,
    program_grant: Option<String>,
) -> Result<AgentProfile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let root = storage(&app)?;
        let mut saved = settings(&root)?;
        if value.name.trim().is_empty()
            || value.name.len() > 120
            || value.args.len() > 64
            || value.env.len() > 64
            || value.secret_keys.len() > 16
        {
            return Err("智能体配置大小无效".into());
        }
        catalog::string_args(&json!(value.args))?;
        for (key, val) in &value.env {
            if key.is_empty()
                || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                || val.len() > 8192
                || val.contains('\0')
                || ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL"]
                    .iter()
                    .any(|part| key.to_uppercase().contains(part))
            {
                return Err("敏感环境变量请使用凭据字段".into());
            }
        }
        if let Some(grant) = program_grant {
            value.executable = state
                .selected_programs
                .lock()
                .map_err(|_| "程序选择状态不可用")?
                .remove(&grant)
                .filter(|grant| {
                    grant.owner == window.label()
                        && grant.created.elapsed() < std::time::Duration::from_secs(300)
                })
                .ok_or("程序选择已失效")?
                .path
                .to_string_lossy()
                .into();
            value.managed_path = None;
            value.version = None;
        } else {
            let previous = saved
                .profiles
                .iter()
                .find(|p| p.id == value.id)
                .ok_or("请通过选择器授权启动程序")?;
            if previous.executable != value.executable
                || previous.managed_path != value.managed_path
            {
                return Err("不能通过配置替换受管程序路径".into());
            }
        }
        if !safe_id(&value.id) {
            value.id = Uuid::new_v4().to_string();
        }
        if !safe_id(&value.agent_id) {
            return Err("智能体标识无效".into());
        }
        saved.profiles.retain(|p| p.id != value.id);
        saved.profiles.push(value.clone());
        if saved.default_profile_id.is_none() {
            saved.default_profile_id = Some(value.id.clone());
        }
        save_settings(&root, &saved)?;
        Ok(value)
    })
    .await
    .map_err(|_| "保存智能体配置失败".to_string())?
}
#[tauri::command]
pub async fn agent_set_secret(
    app: AppHandle,
    profile_id: String,
    name: String,
    value: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if name.is_empty()
            || name.len() > 80
            || !name
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        {
            return Err("凭据变量名称无效".into());
        }
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let root = storage(&app)?;
        let mut saved = settings(&root)?;
        let p = saved
            .profiles
            .iter_mut()
            .find(|p| p.id == profile_id)
            .ok_or("智能体不存在")?;
        let entry = keyring::Entry::new("com.markune.agents", &format!("{profile_id}:{name}"))
            .map_err(|_| "系统凭据存储不可用")?;
        if let Some(value) = value {
            if value.len() > 16384 {
                return Err("凭据过长".into());
            }
            entry.set_password(&value).map_err(|_| "无法保存凭据")?;
            if !p.secret_keys.contains(&name) {
                p.secret_keys.push(name);
            }
        } else {
            let _ = entry.delete_credential();
            p.secret_keys.retain(|key| key != &name);
        }
        save_settings(&root, &saved)
    })
    .await
    .map_err(|_| "凭据存储任务失败".to_string())?
}
#[tauri::command]
pub async fn agent_uninstall(app: AppHandle, profile_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        if state
            .connections
            .lock()
            .map_err(|_| "连接状态不可用")?
            .values()
            .any(|p| {
                p.profile.id == profile_id && p.live.load(std::sync::atomic::Ordering::Acquire)
            })
        {
            return Err("请先断开此智能体的活动会话".into());
        }
        let root = storage(&app)?;
        let mut saved = settings(&root)?;
        let item = saved
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or("智能体不存在")?
            .clone();
        if let Some(path) = item.managed_path {
            let path = PathBuf::from(path);
            if path.is_dir() {
                let checked = path.canonicalize().map_err(|_| "安装目录不可用")?;
                if !checked.starts_with(root.join("installations")) {
                    return Err("安装目录越界".into());
                }
                fs::remove_dir_all(checked).map_err(|_| "无法移除安装目录")?;
            }
        }
        for name in item.secret_keys {
            if let Ok(entry) =
                keyring::Entry::new("com.markune.agents", &format!("{profile_id}:{name}"))
            {
                let _ = entry.delete_credential();
            }
        }
        saved.profiles.retain(|p| p.id != profile_id);
        if saved.default_profile_id.as_deref() == Some(&profile_id) {
            saved.default_profile_id = saved.profiles.last().map(|p| p.id.clone());
        }
        save_settings(&root, &saved)
    })
    .await
    .map_err(|_| "卸载智能体失败".to_string())?
}

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
    root_path: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        process::connect(&app, &window, &profile_id, &root_path)
    })
    .await
    .map_err(|_| "连接智能体失败".to_string())?
}
#[tauri::command]
pub fn agent_send(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    message: Value,
) -> Result<(), String> {
    connection(&state, &window, &connection_id)?.send(message)
}
#[tauri::command]
pub fn agent_disconnect(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
) -> Result<(), String> {
    let item = connection(&state, &window, &connection_id)?;
    item.stop();
    state
        .connections
        .lock()
        .map_err(|_| "连接状态不可用")?
        .remove(&connection_id);
    Ok(())
}
#[tauri::command]
pub async fn agent_client_operation(
    state: State<'_, AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let item = connection(&state, &window, &connection_id)?;
    {
        let mut requests = item.requests.lock().map_err(|_| "请求状态不可用")?;
        let request = requests
            .values_mut()
            .find(|request| {
                request.method == method && request.params == params && !request.executed
            })
            .ok_or("操作没有对应的智能体请求或已经执行")?;
        request.executed = true;
    }
    tauri::async_runtime::spawn_blocking(move || client_tools::execute(&item, &method, params))
        .await
        .map_err(|_| "智能体客户端操作失败".to_string())?
}

#[tauri::command]
pub async fn agent_history(app: AppHandle, root_path: String) -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        history::list(&storage(&app)?, &root)
    })
    .await
    .map_err(|_| "读取会话列表失败".to_string())?
}
#[tauri::command]
pub async fn agent_read_session(
    app: AppHandle,
    root_path: String,
    id: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !safe_id(&id) {
            return Err("会话标识无效".into());
        }
        let record = read_json(&storage(&app)?.join("sessions").join(format!("{id}.json")))?;
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        if record["rootPath"] != root.to_string_lossy().as_ref() {
            return Err("会话不属于当前工作区".into());
        }
        Ok(record)
    })
    .await
    .map_err(|_| "读取会话失败".to_string())?
}
#[tauri::command]
pub async fn agent_save_session(app: AppHandle, record: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || history::save(&storage(&app)?, &record))
        .await
        .map_err(|_| "保存会话失败".to_string())?
}

#[tauri::command]
pub async fn agent_auth_terminal(
    app: AppHandle,
    window: WebviewWindow,
    connection_id: String,
    method_id: String,
) -> Result<crate::terminal::TerminalSessionInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let process = connection(&state, &window, &connection_id)?;
        let capabilities = process
            .capabilities
            .lock()
            .map_err(|_| "认证信息不可用")?
            .clone();
        let method = capabilities["authMethods"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|method| method["id"] == method_id && method["type"] == "terminal")
            })
            .ok_or("智能体未提供此终端认证方式")?;
        let mut args = process.profile.args.clone();
        args.extend(catalog::string_args(&method["args"])?);
        let mut env = process.profile.env.clone();
        for name in &process.profile.secret_keys {
            let entry = keyring::Entry::new(
                "com.markune.agents",
                &format!("{}:{name}", process.profile.id),
            )
            .map_err(|_| "凭据存储不可用")?;
            env.insert(
                name.clone(),
                entry.get_password().map_err(|_| "凭据不可用")?,
            );
        }
        if let Some(overrides) = method["env"].as_object() {
            if overrides.len() > 64 {
                return Err("认证环境变量过多".into());
            }
            for (key, value) in overrides {
                let value = value.as_str().ok_or("认证环境变量无效")?;
                if key.is_empty()
                    || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                    || value.contains('\0')
                    || value.len() > 8192
                {
                    return Err("认证环境变量无效".into());
                }
                env.insert(key.clone(), value.into());
            }
        }
        crate::terminal::spawn_agent_login(
            app.clone(),
            window,
            &app.state::<crate::terminal::TerminalState>(),
            &process.root,
            Path::new(&process.profile.executable),
            &args,
            &env,
        )
    })
    .await
    .map_err(|_| "启动认证终端失败".to_string())?
}

#[tauri::command]
pub fn agent_cancel_install(
    state: State<AgentHostState>,
    window: WebviewWindow,
    agent_id: String,
) -> Result<(), String> {
    let jobs = state.install_task.lock().map_err(|_| "安装状态不可用")?;
    let task = jobs
        .as_ref()
        .filter(|task| {
            task.agent_id == agent_id
                && task
                    .window
                    .as_ref()
                    .is_some_and(|owner| owner.label() == window.label())
        })
        .ok_or("没有此窗口发起的安装任务")?;
    task.cancel();
    Ok(())
}

#[tauri::command]
pub fn agent_install_status(
    state: State<AgentHostState>,
    window: WebviewWindow,
) -> Result<Option<Value>, String> {
    let jobs = state.install_task.lock().map_err(|_| "安装状态不可用")?;
    jobs.as_ref().filter(|task|task.window.as_ref().is_some_and(|owner|owner.label()==window.label())).map(|task|Ok(json!({"agentId":task.agent_id,"phase":*task.phase.lock().map_err(|_|"安装状态不可用")?}))).transpose()
}

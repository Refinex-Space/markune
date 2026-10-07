use super::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};

pub(super) struct PendingServer {
    pub method: String,
    pub params: Value,
    pub executed: bool,
}
pub(super) struct AgentProcess {
    pub id: String,
    pub owner: String,
    pub root: PathBuf,
    pub data_root: PathBuf,
    pub profile: AgentProfile,
    child: Mutex<Option<Child>>,
    sender: SyncSender<Value>,
    pub live: AtomicBool,
    pub cancelled_turn: AtomicBool,
    pub sessions: Mutex<Vec<String>>,
    pub requests: Mutex<HashMap<String, PendingServer>>,
    outgoing: Mutex<HashMap<String, String>>,
    pub capabilities: Mutex<Value>,
    pub baselines: Mutex<HashMap<PathBuf, String>>,
    pub terminals: Mutex<HashMap<String, client_tools::AgentTerminal>>,
    pub mcp_context: Mutex<context::TurnContext>,
    leases: Arc<Mutex<HashMap<String, String>>>,
    pub mcp_config: Mutex<Vec<Value>>,
}
fn key(value: &Value) -> Option<String> {
    if value.is_string() || value.is_i64() || value.is_u64() {
        serde_json::to_string(value).ok()
    } else {
        None
    }
}
impl AgentProcess {
    pub fn stop(&self) {
        if !self.live.swap(false, Ordering::AcqRel) {
            return;
        }
        if let Ok(mut leases) = self.leases.lock() {
            leases.retain(|_, owner| owner != &self.id);
        }
        if let Ok(mut context) = self.mcp_context.lock() {
            *context = context::TurnContext::default();
        }
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut child) = child.take() {
                kill_tree(&mut child);
            }
        }
        if let Ok(mut terminals) = self.terminals.lock() {
            for terminal in terminals.values_mut() {
                terminal.stop();
            }
            terminals.clear();
        }
    }
    pub fn valid_session(&self, params: &Value) -> Result<(), String> {
        let session = params["sessionId"].as_str().ok_or("请求缺少会话身份")?;
        if !self
            .sessions
            .lock()
            .map_err(|_| "会话状态不可用")?
            .iter()
            .any(|id| id == session)
        {
            return Err("请求不属于当前智能体会话".into());
        }
        Ok(())
    }
    fn ownership(&self, session: &str) -> String {
        hash_json(&json!([self.profile.id, self.root, session]))
    }
    fn acquire_session(&self, session: &str) -> Result<(), String> {
        let key = self.ownership(session);
        let mut leases = self.leases.lock().map_err(|_| "会话占用状态不可用")?;
        if leases.get(&key).is_some_and(|owner| owner != &self.id) {
            return Err("此会话已由另一个 Markune 连接占用".into());
        }
        leases.insert(key, self.id.clone());
        Ok(())
    }
    pub fn send(&self, message: Value) -> Result<(), String> {
        if !self.live.load(Ordering::Acquire) {
            return Err("智能体进程已退出，请重新连接".into());
        }
        if message["jsonrpc"] != "2.0"
            || serde_json::to_vec(&message)
                .map_err(|_| "无法编码消息")?
                .len()
                > MAX_FRAME
        {
            return Err("ACP 消息格式或大小无效".into());
        }
        if let Some(method) = message["method"].as_str() {
            if ![
                "initialize",
                "authenticate",
                "logout",
                "session/new",
                "session/load",
                "session/resume",
                "session/close",
                "session/delete",
                "session/set_mode",
                "session/set_config_option",
                "session/prompt",
                "session/cancel",
                "$/cancel_request",
            ]
            .contains(&method)
            {
                return Err("不支持此 ACP 客户端方法".into());
            }
            let params = &message["params"];
            if method == "session/new"
                && (!self
                    .sessions
                    .lock()
                    .map_err(|_| "会话状态不可用")?
                    .is_empty()
                    || self
                        .outgoing
                        .lock()
                        .map_err(|_| "RPC 状态不可用")?
                        .values()
                        .any(|pending| pending == "session/new"))
            {
                return Err("每个连接只允许创建一个会话".into());
            }
            if method == "session/prompt" {
                self.cancelled_turn.store(false, Ordering::Release);
            }
            if method == "session/cancel" {
                self.cancelled_turn.store(true, Ordering::Release);
                if let Ok(mut terminals) = self.terminals.lock() {
                    for terminal in terminals.values_mut() {
                        terminal.stop();
                    }
                    terminals.clear();
                }
            }

            if method == "initialize" && params["protocolVersion"] != 1 {
                return Err("当前只支持稳定 ACP v1".into());
            }
            if ["session/new", "session/load", "session/resume"].contains(&method) {
                let root = crate::workspace::canonical_workspace_root(
                    params["cwd"].as_str().ok_or("会话缺少工作区")?,
                )?;
                if root != self.root
                    || params
                        .get("additionalDirectories")
                        .is_some_and(|v| v.as_array().is_none_or(|v| !v.is_empty()))
                {
                    return Err("会话目录超出授权工作区".into());
                }
                let servers = params["mcpServers"].as_array().ok_or("MCP 配置无效")?;
                if servers
                    != self
                        .mcp_config
                        .lock()
                        .map_err(|_| "MCP 状态不可用")?
                        .as_slice()
                {
                    return Err("MCP 配置未经当前连接授权".into());
                }
                if method != "session/new" {
                    let id = params["sessionId"].as_str().ok_or("缺少会话标识")?;
                    let ownership = self.ownership(id);
                    let record = read_json(
                        &self
                            .data_root
                            .join("ownership")
                            .join(format!("{ownership}.json")),
                    )
                    .map_err(|_| "只能恢复由 Markune 创建的会话")?;
                    if record["profileId"] != self.profile.id
                        || record["rootPath"] != self.root.to_string_lossy().as_ref()
                        || record["sessionId"] != id
                    {
                        return Err("会话归属无效".into());
                    }
                    self.acquire_session(id)?;
                    self.sessions
                        .lock()
                        .map_err(|_| "会话状态不可用")?
                        .push(id.to_string());
                }
            } else if method.starts_with("session/") {
                self.valid_session(params)?;
            }
            if let Some(id) = key(&message["id"]) {
                let mut outgoing = self.outgoing.lock().map_err(|_| "RPC 状态不可用")?;
                if matches!(method, "session/new" | "session/prompt")
                    && outgoing.values().any(|pending| pending == method)
                {
                    return Err("当前连接已有同类会话操作进行中".into());
                }
                if outgoing.len() >= 128 {
                    return Err("待处理 ACP 请求过多".into());
                }
                if outgoing.insert(id, method.into()).is_some() {
                    return Err("重复的 ACP 请求标识".into());
                }
            }
        } else {
            let id = key(&message["id"]).ok_or("ACP 响应缺少身份")?;
            let request = self
                .requests
                .lock()
                .map_err(|_| "请求状态不可用")?
                .remove(&id)
                .ok_or("请求已结束或不属于此连接")?;
            if request.method == "session/request_permission" && !message["error"].is_object() {
                let outcome = &message["result"]["outcome"];
                if outcome["outcome"] != "cancelled"
                    && !(outcome["outcome"] == "selected"
                        && request.params["options"].as_array().is_some_and(|items| {
                            items.iter().any(|v| v["optionId"] == outcome["optionId"])
                        }))
                {
                    return Err("无效的授权决定".into());
                }
            }
        }
        self.sender
            .try_send(message)
            .map_err(|_| "ACP 写入队列已满或连接已关闭".into())
    }
    fn receive(&self, message: &Value) -> Result<(), String> {
        if message["jsonrpc"] != "2.0" {
            return Err("智能体输出了无效 ACP 消息".into());
        }
        if message["method"].is_string() {
            if let Some(id) = key(&message["id"]) {
                let mut pending = self.requests.lock().map_err(|_| "请求状态不可用")?;
                if pending.len() >= 128 {
                    return Err("智能体请求过多".into());
                }
                if pending.contains_key(&id) {
                    return Err("智能体重复使用请求标识".into());
                }
                pending.insert(
                    id,
                    PendingServer {
                        method: message["method"].as_str().unwrap().into(),
                        params: message["params"].clone(),
                        executed: false,
                    },
                );
            }
        } else if let Some(id) = key(&message["id"]) {
            let method = self
                .outgoing
                .lock()
                .map_err(|_| "请求状态不可用")?
                .remove(&id);
            if method.as_deref() == Some("session/prompt") {
                *self.mcp_context.lock().map_err(|_| "上下文状态不可用")? =
                    context::TurnContext::default();
            }
            if method.as_deref() == Some("initialize") && message["result"].is_object() {
                if message["result"]["protocolVersion"] != 1 {
                    return Err("智能体不支持 ACP v1".into());
                }
                *self.capabilities.lock().map_err(|_| "能力状态不可用")? =
                    message["result"].clone();
            }
            if method.as_deref() == Some("session/new") {
                if let Some(id) = message["result"]["sessionId"].as_str() {
                    self.acquire_session(id)?;
                    write_json(
                        &self
                            .data_root
                            .join("ownership")
                            .join(format!("{}.json", self.ownership(id))),
                        &json!({"profileId":self.profile.id,"rootPath":self.root,"sessionId":id}),
                    )?;
                    self.sessions
                        .lock()
                        .map_err(|_| "会话状态不可用")?
                        .push(id.into());
                }
            }
        } else {
            return Err("ACP 消息缺少方法或标识".into());
        }
        Ok(())
    }
}
impl Drop for AgentProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(super) fn connect(
    app: &AppHandle,
    window: &WebviewWindow,
    profile_id: &str,
    root_path: &str,
) -> Result<Value, String> {
    let data_root = storage(app)?;
    let profile = profile(&data_root, profile_id)?;
    let root = crate::workspace::canonical_workspace_root(root_path)?;
    if data_root.starts_with(&root) || root.starts_with(&data_root) {
        return Err("请选择独立的工作区目录，不能将应用私有数据目录纳入智能体工作区".into());
    }
    let state = app.state::<AgentHostState>();
    {
        let mut connections = state.connections.lock().map_err(|_| "连接状态不可用")?;
        connections.retain(|_, p| p.live.load(Ordering::Acquire));
        if connections.len() >= 8 {
            return Err("活动智能体已达 8 个，请先断开空闲会话".into());
        }
    }
    let executable = PathBuf::from(&profile.executable)
        .canonicalize()
        .map_err(|_| "智能体程序不存在，请重新安装")?;
    let mut builder = command(&executable, &profile.args);
    builder
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in &profile.env {
        builder.env(key, value);
    }
    for name in &profile.secret_keys {
        let entry = keyring::Entry::new("com.markune.agents", &format!("{}:{name}", profile.id))
            .map_err(|_| "凭据存储不可用")?;
        let secret = entry
            .get_password()
            .map_err(|_| "智能体凭据不可用，请重新设置")?;
        builder.env(name, secret);
    }
    if let Some(parent) = executable.parent() {
        let mut paths = vec![parent.to_path_buf()];
        if let Some(path) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path));
        }
        if let Ok(path) = std::env::join_paths(paths) {
            builder.env("PATH", path);
        }
    }
    let mut child = builder
        .spawn()
        .map_err(|_| "智能体启动失败，请检查程序及依赖")?;
    let mut input = child.stdin.take().ok_or("智能体标准输入不可用")?;
    let mut output = child.stdout.take().ok_or("智能体标准输出不可用")?;
    let mut errors = child.stderr.take().ok_or("智能体错误输出不可用")?;
    let id = Uuid::new_v4().to_string();
    let (sender, receiver) = sync_channel::<Value>(32);
    let process = Arc::new(AgentProcess {
        id: id.clone(),
        owner: window.label().into(),
        root,
        data_root,
        profile,
        child: Mutex::new(Some(child)),
        sender,
        live: AtomicBool::new(true),
        cancelled_turn: AtomicBool::new(false),
        sessions: Mutex::new(vec![]),
        requests: Mutex::new(HashMap::new()),
        outgoing: Mutex::new(HashMap::new()),
        capabilities: Mutex::new(Value::Null),
        baselines: Mutex::new(HashMap::new()),
        terminals: Mutex::new(HashMap::new()),
        mcp_context: Mutex::new(context::TurnContext::default()),
        leases: state.leases.clone(),
        mcp_config: Mutex::new(vec![]),
    });
    if process.profile.mcp_enabled {
        let config = mcp::start(app, window, &process)?;
        process
            .mcp_config
            .lock()
            .map_err(|_| "MCP 状态不可用")?
            .push(config);
    }
    state
        .connections
        .lock()
        .map_err(|_| "连接状态不可用")?
        .insert(id.clone(), process.clone());
    let writer_process = Arc::downgrade(&process);
    std::thread::spawn(move || {
        while let Ok(message) = receiver.recv() {
            let Some(process) = writer_process.upgrade() else {
                break;
            };
            if !process.live.load(Ordering::Acquire) {
                break;
            }
            let Ok(mut bytes) = serde_json::to_vec(&message) else {
                break;
            };
            bytes.push(b'\n');
            if input.write_all(&bytes).and_then(|_| input.flush()).is_err() {
                process.stop();
                break;
            }
        }
    });
    std::thread::spawn(move || {
        let mut buffer = [0; 8192];
        while let Ok(count) = errors.read(&mut buffer) {
            if count == 0 {
                break;
            }
        }
    });
    let reader_process = Arc::downgrade(&process);
    let emitter = window.clone();
    let connection_id = id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0; 8192];
        let mut line = Vec::new();
        let mut failure = None;
        'reader: loop {
            match output.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    for byte in &buffer[..count] {
                        if *byte == b'\n' {
                            if line.is_empty() {
                                continue;
                            }
                            let Some(process) = reader_process.upgrade() else {
                                break 'reader;
                            };
                            let message = serde_json::from_slice::<Value>(&line);
                            line.clear();
                            match message {
                                Ok(message) => {
                                    if let Err(error) = process.receive(&message) {
                                        failure = Some(error);
                                        break 'reader;
                                    }
                                    if emitter.emit_to(emitter.label(),"markune:agent-event",json!({"connectionId":connection_id,"kind":"message","message":message})).is_err(){failure=Some("智能体窗口已关闭".into());break 'reader;}
                                }
                                Err(_) => {
                                    failure = Some("智能体 stdout 包含非 ACP 数据".into());
                                    break 'reader;
                                }
                            }
                        } else {
                            line.push(*byte);
                            if line.len() > MAX_FRAME {
                                failure = Some("智能体消息超过 8 MiB".into());
                                break 'reader;
                            }
                        }
                    }
                }
                Err(_) => {
                    failure = Some("智能体输出连接中断".into());
                    break;
                }
            }
        }
        if let Some(process) = reader_process.upgrade() {
            process.stop();
        }
        let _=emitter.emit_to(emitter.label(),"markune:agent-event",json!({"connectionId":connection_id,"kind":"closed","error":failure.unwrap_or_else(||"智能体连接已结束".into())}));
    });
    Ok(
        json!({"connectionId":id,"profile":process.profile,"rootPath":process.root,"mcpServers":*process.mcp_config.lock().map_err(|_|"MCP 状态不可用")?}),
    )
}

#[tauri::command]
pub fn agent_context(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    context: Value,
) -> Result<Value, String> {
    let process = connection(&state, &window, &connection_id)?;
    if serde_json::to_vec(&context)
        .map_err(|_| "上下文无效")?
        .len()
        > 128 * 1024
    {
        return Err("上下文过大".into());
    }
    if context.as_object().is_some_and(|value| !value.is_empty())
        && process
            .outgoing
            .lock()
            .map_err(|_| "请求状态不可用")?
            .values()
            .any(|method| method == "session/prompt")
    {
        return Err("运行中的任务上下文不能被替换".into());
    }
    let prepared = context::prepare(&process.root, context)?;
    let prompt = prepared.prompt.clone();
    *process.mcp_context.lock().map_err(|_| "上下文状态不可用")? = prepared;
    Ok(prompt)
}

#[cfg(test)]
pub(super) fn test_process(root: &Path, data: &Path) -> Arc<AgentProcess> {
    let (sender, _) = sync_channel(32);
    Arc::new(AgentProcess {
        id: Uuid::new_v4().to_string(),
        owner: "test".into(),
        root: root.canonicalize().unwrap(),
        data_root: data.into(),
        profile: AgentProfile {
            id: "profile".into(),
            agent_id: "fake".into(),
            name: "Fake".into(),
            executable: "fake".into(),
            args: vec![],
            env: BTreeMap::new(),
            secret_keys: vec![],
            version: None,
            managed_path: None,
            mcp_enabled: false,
            enabled: true,
        },
        child: Mutex::new(None),
        sender,
        live: AtomicBool::new(true),
        cancelled_turn: AtomicBool::new(false),
        sessions: Mutex::new(vec!["owned-session".into()]),
        requests: Mutex::new(HashMap::new()),
        outgoing: Mutex::new(HashMap::new()),
        capabilities: Mutex::new(Value::Null),
        baselines: Mutex::new(HashMap::new()),
        terminals: Mutex::new(HashMap::new()),
        mcp_context: Mutex::new(context::TurnContext::default()),
        mcp_config: Mutex::new(vec![]),
        leases: Arc::new(Mutex::new(HashMap::new())),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_foreign_session_and_unowned_history() {
        let dir = tempfile::tempdir().unwrap();
        let process = test_process(dir.path(), dir.path());
        assert!(process
            .valid_session(&json!({"sessionId":"foreign"}))
            .is_err());
        assert!(process.send(json!({"jsonrpc":"2.0","id":1,"method":"session/load","params":{"cwd":process.root,"sessionId":"foreign","mcpServers":[]}})).unwrap_err().contains("Markune"));
    }
    #[test]
    fn leases_are_exclusive_and_released_on_exit() {
        let dir = tempfile::tempdir().unwrap();
        let first = test_process(dir.path(), dir.path());
        let mut second = test_process(dir.path(), dir.path());
        Arc::get_mut(&mut second).unwrap().leases = first.leases.clone();
        first.acquire_session("session").unwrap();
        assert!(second.acquire_session("session").is_err());
        first.stop();
        assert!(second.acquire_session("session").is_ok());
    }
    #[test]
    fn protocol_response_registers_native_ownership() {
        let dir = tempfile::tempdir().unwrap();
        let process = test_process(dir.path(), dir.path());
        process
            .outgoing
            .lock()
            .unwrap()
            .insert("1".into(), "session/new".into());
        process
            .receive(&json!({"jsonrpc":"2.0","id":1,"result":{"sessionId":"new-owned"}}))
            .unwrap();
        assert!(process
            .valid_session(&json!({"sessionId":"new-owned"}))
            .is_ok());
        let proof = read_json(
            &dir.path()
                .join("ownership")
                .join(format!("{}.json", process.ownership("new-owned"))),
        )
        .unwrap();
        assert_eq!(proof["sessionId"], "new-owned");
    }
    #[test]
    fn approval_cannot_select_an_unoffered_option() {
        let dir = tempfile::tempdir().unwrap();
        let process = test_process(dir.path(), dir.path());
        process.receive(&json!({"jsonrpc":"2.0","id":"approval","method":"session/request_permission","params":{"sessionId":"owned-session","options":[{"optionId":"once"}]}})).unwrap();
        let error=process.send(json!({"jsonrpc":"2.0","id":"approval","result":{"outcome":{"outcome":"selected","optionId":"always"}}})).unwrap_err();
        assert_eq!(error, "无效的授权决定");
    }
    #[test]
    fn rejects_duplicate_server_request_ids() {
        let dir = tempfile::tempdir().unwrap();
        let process = test_process(dir.path(), dir.path());
        let request = json!({"jsonrpc":"2.0","id":2,"method":"fs/read_text_file","params":{"sessionId":"owned-session","path":"/tmp/note.md"}});
        process.receive(&request).unwrap();
        assert!(process.receive(&request).is_err());
    }
}

use super::*;
use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{channel, Sender};
use std::time::Duration;

pub(super) struct PendingTool {
    pub owner: String,
    pub connection_id: String,
    pub sender: Sender<Value>,
}
fn schemas() -> Vec<Value> {
    let object = |properties: Value, required: Vec<&str>| json!({"type":"object","properties":properties,"required":required,"additionalProperties":false});
    vec![
        json!({"name":"workspace_list_documents","description":"List Markune workspace documents by name and relative path. Does not expose private metadata directories.","inputSchema":object(json!({"query":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":200}}),vec![])}),
        json!({"name":"workspace_read_document","description":"Read a UTF-8 workspace document before editing it.","inputSchema":object(json!({"path":{"type":"string"}}),vec!["path"])}),
        json!({"name":"workspace_write_document","description":"Write a workspace document with conflict and lock checks. Existing files must have been read first.","inputSchema":object(json!({"path":{"type":"string"},"content":{"type":"string"}}),vec!["path","content"])}),
        json!({"name":"inspect_drawing","description":"Inspect the drawing explicitly bound to the current Markune turn.","inputSchema":{"type":"object","properties":{"drawingId":{"type":"string"}},"required":["drawingId"]}}),
        json!({"name":"preview_mindmap","description":"Prepare and validate a mind map before applying it in Markune.","inputSchema":{"type":"object","properties":{"title":{"type":"string"},"direction":{"type":"string","enum":["both","down","right"]},"root":{"type":"object"}},"required":["title","direction","root"]}}),
        json!({"name":"preview_mermaid","description":"Prepare and validate a diagram from Mermaid.","inputSchema":{"type":"object","properties":{"title":{"type":"string"},"definition":{"type":"string"},"profile":{"type":"string"}},"required":["title","definition","profile"]}}),
        json!({"name":"apply_preview_to_active","description":"Apply a previously validated opaque preview to the drawing bound to this turn.","inputSchema":{"type":"object","properties":{"previewId":{"type":"string"}},"required":["previewId"]}}),
        json!({"name":"create_from_preview","description":"Create a new Markune drawing from a validated opaque preview.","inputSchema":{"type":"object","properties":{"previewId":{"type":"string"}},"required":["previewId"]}}),
    ]
}
fn tool_result(value: Result<Value, String>) -> Value {
    match value {
        Ok(value) => {
            if let Some(text) = value["text"].as_str() {
                let mut content = vec![json!({"type":"text","text":text})];
                if let Some(image) = value["imageDataUrl"].as_str() {
                    if let Err(error) = context::validate_dynamic_tool_image_data_url(image) {
                        return tool_result(Err(error));
                    }
                    if let Some((prefix, data)) = image.split_once(",") {
                        content.push(json!({"type":"image","data":data,"mimeType":prefix.trim_start_matches("data:").trim_end_matches(";base64")}));
                    }
                }
                json!({"content":content,"isError":value["success"]==false})
            } else {
                json!({"content":[{"type":"text","text":serde_json::to_string(&value).unwrap_or_default()}],"isError":false})
            }
        }
        Err(error) => json!({"content":[{"type":"text","text":error}],"isError":true}),
    }
}
fn frontend_tool(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
    name: &str,
    arguments: Value,
    session: &str,
    turn_id: &str,
) -> Result<Value, String> {
    let request_id = Uuid::new_v4().to_string();
    let (sender, receiver) = channel();
    let state = app.state::<AgentHostState>();
    let mut pending = state.mcp_pending.lock().map_err(|_| "工具请求状态不可用")?;
    if pending.len() >= 32 {
        return Err("待处理工具请求过多".into());
    }
    pending.insert(
        request_id.clone(),
        PendingTool {
            owner: window.label().into(),
            connection_id: process.id.clone(),
            sender,
        },
    );
    drop(pending);
    let sent=window.emit_to(window.label(),"markune:agent-event",json!({"connectionId":process.id,"kind":"tool","requestId":request_id,"name":name,"arguments":arguments,"sessionId":session,"context":{"turnId":turn_id}}));
    let result = if sent.is_err() {
        Err("工具窗口已关闭".to_string())
    } else {
        receiver
            .recv_timeout(Duration::from_secs(45))
            .map_err(|_| "Markune 工具处理超时".to_string())
    };
    state
        .mcp_pending
        .lock()
        .map_err(|_| "工具请求状态不可用")?
        .remove(&request_id);
    result
}

fn handle(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
    body: &Value,
) -> Value {
    let id = body["id"].clone();
    let result = match body["method"].as_str().unwrap_or("") {
        "initialize" => Ok(
            json!({"protocolVersion":match body["params"]["protocolVersion"].as_str(){Some("2024-11-05")=>"2024-11-05",Some("2025-03-26")=>"2025-03-26",_=>"2025-06-18"},"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"markune","version":env!("CARGO_PKG_VERSION")}}),
        ),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools":schemas()})),
        "tools/call" => {
            let name = body["params"]["name"].as_str().unwrap_or("");
            let arguments = body["params"]["arguments"].clone();
            let result = (|| -> Result<Value, String> {
                let turn = process
                    .mcp_context
                    .lock()
                    .map_err(|_| "上下文不可用")?
                    .clone();
                if turn.turn_id.is_empty() {
                    return Err("Markune 工具仅在用户发起的任务中可用".into());
                }
                let session = process
                    .sessions
                    .lock()
                    .map_err(|_| "会话状态不可用")?
                    .last()
                    .cloned()
                    .ok_or("MCP 工具尚未绑定会话")?;
                match name {
                    "workspace_list_documents" => {
                        let tree = crate::workspace::build_workspace_snapshot(&process.root)
                            .map_err(|_| "无法读取工作区目录")?;
                        fn flatten(
                            nodes: &[crate::workspace::WorkspaceNode],
                            output: &mut Vec<Value>,
                        ) {
                            for node in nodes {
                                if node.kind == crate::workspace::WorkspaceNodeKind::Document {
                                    output
                                        .push(json!({"path":node.relative_path,"name":node.name}));
                                }
                                if let Some(children) = &node.children {
                                    flatten(children, output);
                                }
                            }
                        }
                        let mut items = Vec::new();
                        flatten(&tree.nodes, &mut items);
                        let query = arguments["query"].as_str().unwrap_or("").to_lowercase();
                        items.retain(|item| {
                            item["path"]
                                .as_str()
                                .unwrap_or("")
                                .to_lowercase()
                                .contains(&query)
                        });
                        let offset = arguments["offset"].as_u64().unwrap_or(0) as usize;
                        let limit =
                            arguments["limit"].as_u64().unwrap_or(100).clamp(1, 200) as usize;
                        let total = items.len();
                        Ok(
                            json!({"total":total,"offset":offset,"items":items.into_iter().skip(offset).take(limit).collect::<Vec<_>>()}),
                        )
                    }
                    "workspace_read_document" | "workspace_write_document" => {
                        if name == "workspace_write_document" {
                            let ready = frontend_tool(
                                app,
                                window,
                                process,
                                "__before_write",
                                json!({}),
                                &session,
                                &turn.turn_id,
                            )?;
                            if ready["success"] != true {
                                return Err("编辑器内容尚未安全保存".into());
                            }
                            if process
                                .mcp_context
                                .lock()
                                .map_err(|_| "上下文不可用")?
                                .turn_id
                                != turn.turn_id
                            {
                                return Err("工具授权已过期".into());
                            }
                        }
                        let raw = arguments["path"].as_str().ok_or("缺少文档路径")?;
                        let path = if Path::new(raw).is_absolute() {
                            PathBuf::from(raw)
                        } else {
                            process.root.join(raw)
                        };
                        client_tools::execute(
                            process,
                            if name == "workspace_read_document" {
                                "fs/read_text_file"
                            } else {
                                "fs/write_text_file"
                            },
                            json!({"sessionId":session,"path":path,"content":arguments["content"]}),
                        )
                    }
                    "inspect_drawing"
                    | "preview_mindmap"
                    | "preview_mermaid"
                    | "apply_preview_to_active"
                    | "create_from_preview" => {
                        let arguments = context::drawing_arguments(&turn, name, &arguments)?;
                        frontend_tool(
                            app,
                            window,
                            process,
                            name,
                            arguments,
                            &session,
                            &turn.turn_id,
                        )
                    }
                    _ => Err("不支持的 Markune 工具".into()),
                }
            })();
            Ok(tool_result(result))
        }
        _ => Err("Method not found".to_string()),
    };
    match result {
        Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
        Err(error) => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":error}}),
    }
}
pub(super) fn start(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
) -> Result<Value, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法创建 Markune MCP 桥")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "无法配置 MCP 桥")?;
    let port = listener
        .local_addr()
        .map_err(|_| "无法读取 MCP 地址")?
        .port();
    let token = Uuid::new_v4().to_string();
    let expected = token.clone();
    let owner = Arc::downgrade(process);
    let app = app.clone();
    let window = window.clone();
    std::thread::spawn(move || loop {
        let Some(process) = owner.upgrade() else {
            break;
        };
        if !process.live.load(std::sync::atomic::Ordering::Acquire) {
            break;
        }
        match listener.accept() {
            Ok((mut socket, _)) => {
                let _ = socket.set_read_timeout(Some(Duration::from_secs(5)));
                let _ = socket.set_write_timeout(Some(Duration::from_secs(5)));
                let mut line = Vec::new();
                let read = BufReader::new(&mut socket)
                    .take(MAX_FRAME as u64 + 1)
                    .read_until(b'\n', &mut line);
                if read.is_err() || line.len() > MAX_FRAME {
                    continue;
                }
                let Ok(request) = serde_json::from_slice::<Value>(&line) else {
                    continue;
                };
                if request["token"].as_str() != Some(&expected) {
                    continue;
                }
                if request["body"]["id"].is_null() {
                    let _ = socket.write_all(b"{}\n");
                    continue;
                }
                let response = handle(&app, &window, &process, &request["body"]);
                if let Ok(mut bytes) = serde_json::to_vec(&response) {
                    bytes.push(b'\n');
                    let _ = socket.write_all(&bytes);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(_) => break,
        }
    });
    let program = std::env::current_exe().map_err(|_| "无法定位 Markune MCP 程序")?;
    Ok(
        json!({"name":"markune_drawing","command":program,"args":["--agent-mcp-stdio"],"env":[{"name":"MARKUNE_AGENT_MCP_PORT","value":port.to_string()},{"name":"MARKUNE_AGENT_MCP_TOKEN","value":token}]}),
    )
}
pub fn proxy_main() -> Result<(), String> {
    let port = std::env::var("MARKUNE_AGENT_MCP_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .ok_or("MCP port missing")?;
    let token = std::env::var("MARKUNE_AGENT_MCP_TOKEN").map_err(|_| "MCP token missing")?;
    let input = std::io::stdin();
    let mut input = input.lock();
    let mut output = std::io::stdout().lock();
    loop {
        let mut line = Vec::new();
        let count = (&mut input)
            .take(MAX_FRAME as u64 + 1)
            .read_until(b'\n', &mut line)
            .map_err(|_| "MCP read failed")?;
        if count == 0 {
            break;
        }
        if line.len() > MAX_FRAME {
            return Err("MCP frame too large".into());
        }
        let body: Value = serde_json::from_slice(&line).map_err(|_| "Invalid MCP JSON")?;
        let mut socket =
            TcpStream::connect(("127.0.0.1", port)).map_err(|_| "Markune MCP bridge closed")?;
        socket
            .set_read_timeout(Some(Duration::from_secs(50)))
            .map_err(|_| "MCP socket unavailable")?;
        let mut request = serde_json::to_vec(&json!({"token":token,"body":body}))
            .map_err(|_| "Invalid MCP message")?;
        request.push(b'\n');
        socket.write_all(&request).map_err(|_| "MCP write failed")?;
        let mut response = Vec::new();
        BufReader::new(socket)
            .take(MAX_FRAME as u64 + 1)
            .read_until(b'\n', &mut response)
            .map_err(|_| "MCP response failed")?;
        if response.len() > MAX_FRAME {
            return Err("MCP response too large".into());
        }
        if !body["id"].is_null() {
            output
                .write_all(&response)
                .and_then(|_| output.flush())
                .map_err(|_| "MCP output failed")?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn agent_tool_respond(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    request_id: String,
    result: Value,
) -> Result<(), String> {
    connection(&state, &window, &connection_id)?;
    if serde_json::to_vec(&result)
        .map_err(|_| "工具结果无效")?
        .len()
        > MAX_FRAME
    {
        return Err("工具结果过大".into());
    }
    let mut pending = state.mcp_pending.lock().map_err(|_| "工具状态不可用")?;
    let request = pending
        .get(&request_id)
        .filter(|item| item.owner == window.label() && item.connection_id == connection_id)
        .ok_or("工具请求已失效")?;
    request.sender.send(result).map_err(|_| "工具请求已结束")?;
    pending.remove(&request_id);
    Ok(())
}

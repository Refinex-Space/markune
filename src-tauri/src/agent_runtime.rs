use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::io;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const CODEX_MODEL_CACHE_TTL: Duration = Duration::from_secs(300);
const CODEX_MODEL_LIST_TIMEOUT: Duration = Duration::from_secs(10);
const AI_SESSIONS_DIR: &str = "ai-sessions";

static CODEX_MODEL_CACHE: OnceLock<Mutex<Option<CachedCodexModels>>> = OnceLock::new();

#[derive(Clone)]
struct CachedCodexModels {
    command_path: PathBuf,
    loaded_at: Instant,
    models: Vec<AiDetectedModel>,
}

#[derive(Default)]
pub struct AgentRuntimeState {
    runtime: Mutex<AgentRuntime>,
}

#[derive(Default)]
struct AgentRuntime {
    sessions: HashMap<String, AiSessionInfo>,
    codex_actors: HashMap<String, CodexSessionActor>,
    claude_actors: HashMap<String, ClaudeSessionActor>,
    codex_login_sessions: HashMap<String, CodexLoginSessionHandle>,
}

#[derive(Clone)]
struct CodexSessionActor {
    sender: mpsc::Sender<CodexActorCommand>,
}

enum CodexActorCommand {
    SendPrompt { prompt: String },
    Interrupt,
    Stop,
}

#[derive(Clone)]
struct ClaudeSessionActor {
    sender: mpsc::Sender<ClaudeActorCommand>,
}

enum ClaudeActorCommand {
    SendPrompt {
        prompt: String,
    },
    Interrupt,
    RespondPermission {
        request_id: String,
        response: serde_json::Value,
    },
    Stop,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct AiSessionStartOptions {
    agent_mode: Option<String>,
    codex_thinking: Option<String>,
    extended_thinking: bool,
    model_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentCapabilities {
    pub read_workspace: bool,
    pub write_workspace: bool,
    pub shell: bool,
    pub diff: bool,
    pub models: bool,
    pub slash_commands: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentProfile {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub provider_id: String,
    pub provider_label: String,
    pub model_id: String,
    pub model_label: String,
    pub is_test_runtime: bool,
    pub capabilities: AiAgentCapabilities,
    pub detection: AiAgentDetection,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentDetection {
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiDetectedModel {
    pub id: String,
    pub label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub profile_id: String,
    pub available: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistantAccount {
    pub id: String,
    pub label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub status: String,
    pub command_path: Option<String>,
    pub version: Option<String>,
    pub transport: Option<String>,
    pub message: Option<String>,
    pub models: Vec<AiDetectedModel>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexLogoutResult {
    pub success: bool,
    pub state: String,
    pub is_connected: bool,
    pub logout_exit_code: Option<i32>,
    pub logout_output: String,
    pub status_output: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexIntegrationStatus {
    pub state: String,
    pub is_connected: bool,
    pub raw_output: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexLoginSessionSnapshot {
    pub session_id: String,
    pub state: String,
    pub url: Option<String>,
    pub output: String,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexLoginCancelResult {
    pub success: bool,
    pub found: bool,
    pub session: Option<CodexLoginSessionSnapshot>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexLoginOpenUrlResult {
    pub success: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CodexCliRunResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
}

#[derive(Clone)]
struct CodexLoginSessionHandle {
    record: Arc<Mutex<CodexLoginSessionRecord>>,
    process: Arc<Mutex<Option<Child>>>,
}

#[derive(Debug, Clone)]
struct CodexLoginSessionRecord {
    session_id: String,
    state: String,
    url: Option<String>,
    output: String,
    error: Option<String>,
    exit_code: Option<i32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CommandDetection {
    command_path: Option<PathBuf>,
    version: Option<String>,
    app_server_supported: bool,
    exec_supported: bool,
    stream_json_supported: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub root_path: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartAiSessionInput {
    pub root_path: String,
    pub profile_id: String,
    pub context: AiContextPack,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub codex_thinking: Option<String>,
    #[serde(default)]
    pub extended_thinking: Option<bool>,
    #[serde(default)]
    pub agent_mode: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAiPromptInput {
    pub session_id: String,
    pub prompt: String,
    pub context: AiContextPack,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RespondAiPermissionInput {
    pub session_id: String,
    pub request_id: String,
    pub behavior: String,
    pub updated_input: Option<serde_json::Value>,
    pub updated_permissions: Option<Vec<serde_json::Value>>,
    pub deny_message: Option<String>,
    pub interrupt: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextPack {
    pub workspace_root_path: String,
    pub intent: String,
    pub document: Option<AiContextDocument>,
    #[serde(default)]
    pub selection: Option<AiContextSelection>,
    #[serde(default)]
    pub images: Vec<AiContextImage>,
    #[serde(default)]
    pub references: Vec<AiContextReference>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextDocument {
    pub path: String,
    pub title: String,
    pub markdown: String,
    pub modified_at: Option<u128>,
    pub content_hash: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextSelection {
    pub markdown: String,
    pub from: usize,
    pub to: usize,
    #[serde(default)]
    pub document_path: Option<String>,
    #[serde(default)]
    pub document_title: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextImage {
    pub id: String,
    pub filename: String,
    pub media_type: String,
    pub base64_data: String,
    pub size: usize,
    pub content_hash: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextReference {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub markdown: String,
    pub modified_at: Option<u128>,
    pub content_hash: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
#[allow(dead_code)]
pub enum AiRuntimeEvent {
    SessionStarted {
        session: AiSessionInfo,
    },
    MessageDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        delta: String,
    },
    MessageCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
    },
    TurnCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        cancelled: bool,
    },
    RunState {
        #[serde(rename = "sessionId")]
        session_id: String,
        state: String,
        #[serde(rename = "exitCode", skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ThinkingDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        delta: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolStarted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        input: serde_json::Value,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolInputDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "partialJson")]
        partial_json: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        output: serde_json::Value,
        status: String,
        #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    PermissionPrompt {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
        reason: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        suggestions: Option<serde_json::Value>,
    },
    PermissionDenied {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
    },
    UsageUpdated {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "inputTokens")]
        input_tokens: u64,
        #[serde(rename = "outputTokens")]
        output_tokens: u64,
        #[serde(rename = "cacheReadTokens", skip_serializing_if = "Option::is_none")]
        cache_read_tokens: Option<u64>,
        #[serde(rename = "cacheWriteTokens", skip_serializing_if = "Option::is_none")]
        cache_write_tokens: Option<u64>,
        #[serde(rename = "totalCostUsd", skip_serializing_if = "Option::is_none")]
        total_cost_usd: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    SessionExited {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Error {
        #[serde(rename = "sessionId")]
        session_id: Option<String>,
        message: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConversationMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub references: Vec<AiContextReference>,
    #[serde(default)]
    pub images: Vec<AiContextImage>,
    #[serde(default)]
    pub selection: Option<AiContextSelection>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConversationRecord {
    pub id: String,
    pub title: String,
    pub profile_id: String,
    pub profile_label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub created_at: u128,
    pub updated_at: u128,
    pub document_path: Option<String>,
    pub document_title: Option<String>,
    #[serde(default)]
    pub references: Vec<AiContextReference>,
    #[serde(default)]
    pub images: Vec<AiContextImage>,
    pub messages: Vec<AiConversationMessage>,
    #[serde(default)]
    pub thinking: Vec<serde_json::Value>,
    #[serde(default)]
    pub tools: Vec<serde_json::Value>,
    #[serde(default)]
    pub permissions: Vec<serde_json::Value>,
    #[serde(default)]
    pub usage: Option<serde_json::Value>,
    #[serde(default)]
    pub run_state: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConversationSummary {
    pub id: String,
    pub title: String,
    pub profile_id: String,
    pub profile_label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub created_at: u128,
    pub updated_at: u128,
    pub document_path: Option<String>,
    pub document_title: Option<String>,
    pub message_count: usize,
}

#[tauri::command]
pub fn list_ai_agent_profiles(root_path: String) -> Result<Vec<AiAgentProfile>, String> {
    validate_agent_root(&root_path)?;

    let accounts = detect_ai_accounts_raw();
    let mut profiles = vec![fake_echo_profile()];

    profiles.extend(detected_model_profiles(&accounts));

    Ok(profiles)
}

#[tauri::command]
pub fn detect_ai_accounts() -> Result<Vec<AiAssistantAccount>, String> {
    Ok(detect_ai_accounts_raw())
}

#[tauri::command]
pub fn logout_codex_account() -> Result<CodexLogoutResult, String> {
    logout_codex_account_with_runner(run_codex_cli_for_account)
}

#[tauri::command]
pub fn get_codex_integration() -> Result<CodexIntegrationStatus, String> {
    get_codex_integration_with_runner(run_codex_cli_for_account)
}

#[tauri::command]
pub fn start_codex_login(
    state: State<'_, AgentRuntimeState>,
) -> Result<CodexLoginSessionSnapshot, String> {
    start_codex_login_with_state(&state)
}

#[tauri::command]
pub fn get_codex_login_session(
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<CodexLoginSessionSnapshot, String> {
    let handle = {
        let runtime = state
            .runtime
            .lock()
            .map_err(|_| "AI runtime 状态锁定失败".to_string())?;
        runtime.codex_login_sessions.get(&session_id).cloned()
    }
    .ok_or_else(|| "Codex login session not found".to_string())?;

    codex_login_session_snapshot(&handle)
}

#[tauri::command]
pub fn cancel_codex_login(
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<CodexLoginCancelResult, String> {
    let handle = {
        let runtime = state
            .runtime
            .lock()
            .map_err(|_| "AI runtime 状态锁定失败".to_string())?;
        runtime.codex_login_sessions.get(&session_id).cloned()
    };

    let Some(handle) = handle else {
        return Ok(CodexLoginCancelResult {
            success: true,
            found: false,
            session: None,
        });
    };

    {
        let mut record = handle
            .record
            .lock()
            .map_err(|_| "Codex login session 状态锁定失败".to_string())?;
        record.state = "cancelled".to_string();
        record.error = None;
    }

    if let Ok(mut process_guard) = handle.process.lock() {
        if let Some(child) = process_guard.as_mut() {
            let _ = child.kill();
        }
    }

    Ok(CodexLoginCancelResult {
        success: true,
        found: true,
        session: Some(codex_login_session_snapshot(&handle)?),
    })
}

#[tauri::command]
pub fn open_codex_login_url(url: String) -> Result<CodexLoginOpenUrlResult, String> {
    validate_external_login_url(&url, "Codex login URL")?;
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|_| "无法打开 Codex 登录 URL".to_string())?;

    Ok(CodexLoginOpenUrlResult { success: true })
}

#[tauri::command]
pub fn list_ai_agent_models(root_path: String) -> Result<Vec<AiDetectedModel>, String> {
    validate_agent_root(&root_path)?;

    let accounts = detect_ai_accounts_raw();
    let mut models = Vec::new();

    if let Some(codex) = accounts
        .iter()
        .find(|account| account.id == "codex" && account.status == "connected")
    {
        if let Some(command_path) = codex.command_path.as_deref() {
            models.extend(list_codex_models(Path::new(command_path))?);
        }
    }

    Ok(models)
}

#[tauri::command]
pub fn list_ai_conversations(root_path: String) -> Result<Vec<AiConversationSummary>, String> {
    let root = validate_agent_root(&root_path)?;
    let directory = ai_conversations_dir(&root);

    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|_| "无法读取 AI 会话历史".to_string())? {
        let entry = entry.map_err(|_| "无法读取 AI 会话历史".to_string())?;
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let record =
            read_ai_conversation_file(&path).map_err(|_| "无法解析 AI 会话历史".to_string())?;
        summaries.push(conversation_summary(&record));
    }

    summaries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(summaries)
}

#[tauri::command]
pub fn read_ai_conversation(
    root_path: String,
    conversation_id: String,
) -> Result<AiConversationRecord, String> {
    let root = validate_agent_root(&root_path)?;
    let id = validate_conversation_id(&conversation_id)?;
    let path = ai_conversation_path(&root, id);

    read_ai_conversation_file(&path).map_err(|_| "无法读取 AI 会话".to_string())
}

#[tauri::command]
pub fn save_ai_conversation(
    root_path: String,
    mut record: AiConversationRecord,
) -> Result<AiConversationSummary, String> {
    let root = validate_agent_root(&root_path)?;
    validate_conversation_id(&record.id)?;
    normalize_conversation_record(&mut record);

    let directory = ai_conversations_dir(&root);
    fs::create_dir_all(&directory).map_err(|_| "无法创建 AI 会话目录".to_string())?;
    write_json_pretty(&ai_conversation_path(&root, &record.id), &record)
        .map_err(|_| "无法保存 AI 会话".to_string())?;

    Ok(conversation_summary(&record))
}

#[tauri::command]
pub fn start_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: StartAiSessionInput,
) -> Result<AiSessionInfo, String> {
    let root = validate_agent_root(&input.root_path)?;

    if input.profile_id != "fake-echo" && !is_available_detected_profile(&input.profile_id) {
        return Err("AI agent profile 不可用".to_string());
    }

    let session = create_session_info(input.profile_id.clone(), root.clone());
    let options = session_start_options(&input);
    let codex_actor = if input.profile_id == "codex:local" {
        Some(start_codex_actor(
            &app,
            &root,
            &session.session_id,
            &options,
        )?)
    } else {
        None
    };
    let claude_actor = if input.profile_id == "claude:local" {
        Some(start_claude_actor(
            &app,
            &root,
            &session.session_id,
            &options,
        )?)
    } else {
        None
    };

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;
    runtime.insert_session(session.clone(), codex_actor, claude_actor);
    emit_ai_event(
        &app,
        AiRuntimeEvent::SessionStarted {
            session: session.clone(),
        },
    );

    Ok(session)
}

fn session_start_options(input: &StartAiSessionInput) -> AiSessionStartOptions {
    AiSessionStartOptions {
        agent_mode: input
            .agent_mode
            .as_deref()
            .and_then(normalize_agent_mode)
            .map(str::to_string),
        codex_thinking: input
            .codex_thinking
            .as_deref()
            .and_then(normalize_codex_thinking)
            .map(str::to_string),
        extended_thinking: input.extended_thinking.unwrap_or(false),
        model_id: input.model_id.as_deref().and_then(normalize_model_id),
    }
}

fn normalize_agent_mode(value: &str) -> Option<&'static str> {
    match value {
        "agent" => Some("agent"),
        "plan" => Some("plan"),
        _ => None,
    }
}

fn normalize_codex_thinking(value: &str) -> Option<&'static str> {
    match value {
        "low" => Some("low"),
        "medium" => Some("medium"),
        "high" => Some("high"),
        "xhigh" => Some("xhigh"),
        _ => None,
    }
}

fn normalize_model_id(value: &str) -> Option<String> {
    let trimmed = value.trim();

    if trimmed.is_empty()
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':' | '/'))
    {
        return None;
    }

    Some(trimmed.to_string())
}

#[tauri::command]
pub fn send_ai_prompt(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: SendAiPromptInput,
) -> Result<(), String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    let Some(session) = runtime.session(&input.session_id).cloned() else {
        emit_ai_event(
            &app,
            AiRuntimeEvent::Error {
                message: "AI 会话不存在".to_string(),
                session_id: Some(input.session_id),
            },
        );
        return Err("AI 会话不存在".to_string());
    };

    drop(runtime);

    if let Some(actor) = runtime_codex_actor_for_session(&state, &input.session_id)? {
        actor
            .sender
            .send(CodexActorCommand::SendPrompt {
                prompt: build_assistant_prompt(&input),
            })
            .map_err(|_| "Codex 会话已停止".to_string())?;
        return Ok(());
    }
    if let Some(actor) = runtime_claude_actor_for_session(&state, &input.session_id)? {
        actor
            .sender
            .send(ClaudeActorCommand::SendPrompt {
                prompt: build_assistant_prompt(&input),
            })
            .map_err(|_| "Claude Code 会话已停止".to_string())?;
        return Ok(());
    }

    let message_id = Uuid::new_v4().to_string();
    let response = build_runtime_response(&session, &input)?;

    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageDelta {
            delta: response,
            message_id: message_id.clone(),
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageCompleted {
            message_id,
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: false,
            session_id: input.session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn cancel_ai_turn(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<(), String> {
    if let Some(actor) = runtime_codex_actor_for_session(&state, &session_id)? {
        let _ = actor.sender.send(CodexActorCommand::Interrupt);
        return Ok(());
    }
    if let Some(actor) = runtime_claude_actor_for_session(&state, &session_id)? {
        let _ = actor.sender.send(ClaudeActorCommand::Interrupt);
        return Ok(());
    }

    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: true,
            session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn respond_ai_permission(
    state: State<'_, AgentRuntimeState>,
    input: RespondAiPermissionInput,
) -> Result<(), String> {
    let Some(actor) = runtime_claude_actor_for_session(&state, &input.session_id)? else {
        return Err("Claude Code 会话不存在或已停止".to_string());
    };
    let response = build_claude_permission_response(&input)?;

    actor
        .sender
        .send(ClaudeActorCommand::RespondPermission {
            request_id: input.request_id,
            response,
        })
        .map_err(|_| "Claude Code 会话已停止".to_string())
}

#[tauri::command]
pub fn stop_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<(), String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    runtime.stop_session(&session_id)?;
    emit_ai_event(&app, AiRuntimeEvent::SessionExited { session_id });

    Ok(())
}

impl AgentRuntime {
    fn insert_session(
        &mut self,
        session: AiSessionInfo,
        codex_actor: Option<CodexSessionActor>,
        claude_actor: Option<ClaudeSessionActor>,
    ) {
        if let Some(actor) = codex_actor {
            self.codex_actors.insert(session.session_id.clone(), actor);
        }
        if let Some(actor) = claude_actor {
            self.claude_actors.insert(session.session_id.clone(), actor);
        }
        self.sessions
            .insert(session.session_id.clone(), session.clone());
    }

    fn session(&self, session_id: &str) -> Option<&AiSessionInfo> {
        self.sessions.get(session_id)
    }

    fn stop_session(&mut self, session_id: &str) -> Result<(), String> {
        if let Some(actor) = self.codex_actors.remove(session_id) {
            let _ = actor.sender.send(CodexActorCommand::Stop);
        }
        if let Some(actor) = self.claude_actors.remove(session_id) {
            let _ = actor.sender.send(ClaudeActorCommand::Stop);
        }
        self.sessions
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| "AI 会话不存在".to_string())
    }
}

fn create_session_info(profile_id: String, root: PathBuf) -> AiSessionInfo {
    AiSessionInfo {
        profile_id,
        root_path: root.to_string_lossy().to_string(),
        session_id: Uuid::new_v4().to_string(),
        status: "running".to_string(),
    }
}

fn runtime_codex_actor_for_session(
    state: &State<'_, AgentRuntimeState>,
    session_id: &str,
) -> Result<Option<CodexSessionActor>, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    Ok(runtime.codex_actors.get(session_id).cloned())
}

fn runtime_claude_actor_for_session(
    state: &State<'_, AgentRuntimeState>,
    session_id: &str,
) -> Result<Option<ClaudeSessionActor>, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    Ok(runtime.claude_actors.get(session_id).cloned())
}

fn fake_echo_profile() -> AiAgentProfile {
    AiAgentProfile {
        capabilities: AiAgentCapabilities {
            diff: false,
            models: false,
            read_workspace: true,
            shell: false,
            slash_commands: false,
            write_workspace: false,
        },
        detection: AiAgentDetection {
            message: None,
            status: "available".to_string(),
        },
        id: "fake-echo".to_string(),
        is_test_runtime: true,
        kind: "fake".to_string(),
        label: "Fake Echo".to_string(),
        model_id: "fake-echo".to_string(),
        model_label: "fake-echo".to_string(),
        provider_id: "local".to_string(),
        provider_label: "Local".to_string(),
    }
}

fn detect_ai_accounts_raw() -> Vec<AiAssistantAccount> {
    build_detected_accounts(detect_codex_command(), detect_claude_command())
}

fn detect_codex_command() -> CommandDetection {
    let command_path = find_command_path("codex").or_else(|| {
        let bundled_path = PathBuf::from("/Applications/Codex.app/Contents/Resources/codex");

        bundled_path.exists().then_some(bundled_path)
    });
    let Some(path) = command_path else {
        return CommandDetection::default();
    };

    let version = run_command_output(&path, &["--version"]);
    let app_server_supported = run_command_output(&path, &["app-server", "--help"])
        .map(|output| output.contains("app-server"))
        .unwrap_or(false);
    let exec_supported = run_command_output(&path, &["exec", "--help"])
        .map(|output| output.contains("Run Codex non-interactively"))
        .unwrap_or(false);

    CommandDetection {
        app_server_supported,
        command_path: Some(path),
        exec_supported,
        stream_json_supported: false,
        version,
    }
}

fn detect_claude_command() -> CommandDetection {
    let Some(path) = find_command_path("claude") else {
        return CommandDetection::default();
    };

    let help = run_command_output(&path, &["--help"]).unwrap_or_default();

    CommandDetection {
        app_server_supported: false,
        command_path: Some(path.clone()),
        exec_supported: false,
        stream_json_supported: help.contains("--print")
            && help.contains("--output-format")
            && help.contains("stream-json"),
        version: run_command_output(&path, &["--version"]),
    }
}

fn build_detected_accounts(
    codex: CommandDetection,
    claude: CommandDetection,
) -> Vec<AiAssistantAccount> {
    vec![build_codex_account(codex), build_claude_account(claude)]
}

fn build_codex_account(detection: CommandDetection) -> AiAssistantAccount {
    let detected = detection.command_path.is_some();
    let connected = detected && detection.app_server_supported && detection.exec_supported;

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "codex".to_string(),
        label: "Codex".to_string(),
        message: Some(if connected {
            "Codex app-server 与非交互调用均可用；运行时将使用本地账号，不保存 API Key。"
                .to_string()
        } else if detected {
            "已检测到 Codex CLI，但 app-server 或 exec 能力不可用。".to_string()
        } else {
            "未在 PATH 中找到 Codex CLI。".to_string()
        }),
        models: Vec::new(),
        provider_id: "codex".to_string(),
        provider_label: "Codex".to_string(),
        status: if connected {
            "connected"
        } else if detected {
            "misconfigured"
        } else {
            "missing"
        }
        .to_string(),
        transport: connected.then(|| "app-server".to_string()),
        version: detection.version,
    }
}

fn logout_codex_account_with_runner(
    mut run: impl FnMut(&[&str]) -> Result<CodexCliRunResult, String>,
) -> Result<CodexLogoutResult, String> {
    let logout_result = run(&["logout"])?;
    let status_result = run(&["login", "status"])?;
    let status_output = combine_command_output(&status_result.stdout, &status_result.stderr);
    let state = normalize_codex_integration_state(&status_output);
    let is_connected = matches!(state.as_str(), "connected_chatgpt" | "connected_api_key");

    if is_connected {
        return Err("Failed to log out from Codex. Please try again.".to_string());
    }

    Ok(CodexLogoutResult {
        success: true,
        state,
        is_connected: false,
        logout_exit_code: logout_result.exit_code,
        logout_output: combine_command_output(&logout_result.stdout, &logout_result.stderr),
        status_output,
    })
}

fn get_codex_integration_with_runner(
    mut run: impl FnMut(&[&str]) -> Result<CodexCliRunResult, String>,
) -> Result<CodexIntegrationStatus, String> {
    let result = run(&["login", "status"])?;
    let raw_output = combine_command_output(&result.stdout, &result.stderr);
    let state = normalize_codex_integration_state(&raw_output);
    let is_connected = matches!(state.as_str(), "connected_chatgpt" | "connected_api_key");

    Ok(CodexIntegrationStatus {
        state,
        is_connected,
        raw_output,
        exit_code: result.exit_code,
    })
}

fn start_codex_login_with_state(
    state: &State<'_, AgentRuntimeState>,
) -> Result<CodexLoginSessionSnapshot, String> {
    {
        let runtime = state
            .runtime
            .lock()
            .map_err(|_| "AI runtime 状态锁定失败".to_string())?;
        if let Some(existing) = active_codex_login_session(&runtime) {
            return codex_login_session_snapshot(&existing);
        }
    }

    let Some(codex_path) = find_codex_cli_path() else {
        return Err("未在 PATH 中找到 Codex CLI。".to_string());
    };

    let mut child = Command::new(codex_path)
        .arg("login")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Codex 登录流程: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let session_id = Uuid::new_v4().to_string();
    let record = Arc::new(Mutex::new(CodexLoginSessionRecord {
        session_id: session_id.clone(),
        state: "running".to_string(),
        url: None,
        output: String::new(),
        error: None,
        exit_code: None,
    }));
    let process = Arc::new(Mutex::new(Some(child)));
    let handle = CodexLoginSessionHandle {
        process: Arc::clone(&process),
        record: Arc::clone(&record),
    };

    if let Some(stdout) = stdout {
        start_codex_login_output_reader(Arc::clone(&record), stdout);
    }
    if let Some(stderr) = stderr {
        start_codex_login_output_reader(Arc::clone(&record), stderr);
    }
    start_codex_login_waiter(Arc::clone(&record), Arc::clone(&process));

    {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "AI runtime 状态锁定失败".to_string())?;
        runtime
            .codex_login_sessions
            .insert(session_id, handle.clone());
    }

    codex_login_session_snapshot(&handle)
}

fn active_codex_login_session(runtime: &AgentRuntime) -> Option<CodexLoginSessionHandle> {
    runtime
        .codex_login_sessions
        .values()
        .find(|handle| {
            handle
                .record
                .lock()
                .map(|record| record.state == "running")
                .unwrap_or(false)
        })
        .cloned()
}

fn codex_login_session_snapshot(
    handle: &CodexLoginSessionHandle,
) -> Result<CodexLoginSessionSnapshot, String> {
    let record = handle
        .record
        .lock()
        .map_err(|_| "Codex login session 状态锁定失败".to_string())?;

    Ok(CodexLoginSessionSnapshot {
        session_id: record.session_id.clone(),
        state: record.state.clone(),
        url: record.url.clone(),
        output: record.output.clone(),
        error: record.error.clone(),
        exit_code: record.exit_code,
    })
}

fn start_codex_login_output_reader<R>(record: Arc<Mutex<CodexLoginSessionRecord>>, reader: R)
where
    R: io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buffer = Vec::new();

        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break,
                Ok(_) => {
                    let chunk = String::from_utf8_lossy(&buffer).to_string();
                    append_codex_login_output(&record, &chunk);
                }
                Err(_) => break,
            }
        }
    });
}

fn append_codex_login_output(record: &Arc<Mutex<CodexLoginSessionRecord>>, chunk: &str) {
    let clean_chunk = strip_ansi(chunk);
    if clean_chunk.is_empty() {
        return;
    }

    let Ok(mut record) = record.lock() else {
        return;
    };
    record.output.push_str(&clean_chunk);
    if record.url.is_none() {
        record.url = extract_first_non_localhost_url(&record.output);
    }
}

fn start_codex_login_waiter(
    record: Arc<Mutex<CodexLoginSessionRecord>>,
    process: Arc<Mutex<Option<Child>>>,
) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));

        let status = {
            let Ok(mut process_guard) = process.lock() else {
                return;
            };
            let Some(child) = process_guard.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(status)) => Some(Ok(status.code())),
                Ok(None) => None,
                Err(error) => Some(Err(error.to_string())),
            }
        };

        let Some(status) = status else {
            continue;
        };

        if let Ok(mut process_guard) = process.lock() {
            *process_guard = None;
        }

        let Ok(mut record) = record.lock() else {
            return;
        };

        match status {
            Ok(exit_code) => {
                record.exit_code = exit_code;
                if record.state == "cancelled" {
                    return;
                }
                if exit_code == Some(0) {
                    record.state = "success".to_string();
                    record.error = None;
                } else {
                    record.state = "error".to_string();
                    record.error = Some(format!(
                        "Codex login exited with code {}",
                        exit_code
                            .map(|code| code.to_string())
                            .unwrap_or_else(|| "unknown".to_string())
                    ));
                }
            }
            Err(error) => {
                record.state = "error".to_string();
                record.error = Some(format!("[codex] Failed to watch login flow: {error}"));
            }
        }

        return;
    });
}

fn run_codex_cli_for_account(args: &[&str]) -> Result<CodexCliRunResult, String> {
    let Some(path) = find_codex_cli_path() else {
        return Err("未在 PATH 中找到 Codex CLI。".to_string());
    };

    let output = Command::new(path)
        .args(args)
        .output()
        .map_err(|error| format!("无法执行 Codex CLI: {error}"))?;

    Ok(CodexCliRunResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

fn find_codex_cli_path() -> Option<PathBuf> {
    find_command_path("codex").or_else(|| {
        let bundled_path = PathBuf::from("/Applications/Codex.app/Contents/Resources/codex");

        bundled_path.exists().then_some(bundled_path)
    })
}

fn validate_external_login_url(url: &str, label: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| format!("{label} 无效"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("{label} 必须使用 http 或 https"));
    }
    if parsed.host_str().is_none() {
        return Err(format!("{label} 缺少 host"));
    }
    Ok(())
}

fn normalize_codex_integration_state(raw_output: &str) -> String {
    let normalized = raw_output.to_ascii_lowercase();

    if normalized.contains("logged in using chatgpt") {
        return "connected_chatgpt".to_string();
    }

    if normalized.contains("logged in using an api key")
        || normalized.contains("logged in using api key")
    {
        return "connected_api_key".to_string();
    }

    if normalized.contains("not logged in") {
        return "not_logged_in".to_string();
    }

    "unknown".to_string()
}

fn strip_ansi(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == 0x1b {
            index += 1;
            if index < bytes.len() && bytes[index] == b'[' {
                index += 1;
                while index < bytes.len() {
                    let byte = bytes[index];
                    index += 1;
                    if (0x40..=0x7e).contains(&byte) {
                        break;
                    }
                }
                continue;
            }
            if index < bytes.len() && bytes[index] == b']' {
                index += 1;
                while index < bytes.len() {
                    let byte = bytes[index];
                    index += 1;
                    if byte == 0x07 {
                        break;
                    }
                    if byte == 0x1b && index < bytes.len() && bytes[index] == b'\\' {
                        index += 1;
                        break;
                    }
                }
                continue;
            }
        }

        if let Some(character) = input[index..].chars().next() {
            output.push(character);
            index += character.len_utf8();
        } else {
            break;
        }
    }

    output
}

fn extract_first_non_localhost_url(output: &str) -> Option<String> {
    let clean = strip_ansi(output);

    for token in clean.split_whitespace() {
        let Some(start) = token.find("http://").or_else(|| token.find("https://")) else {
            continue;
        };
        let candidate = token[start..].trim_end_matches(|character: char| {
            matches!(character, ')' | ',' | '.' | ';' | '!' | '?')
        });
        let Ok(url) = reqwest::Url::parse(candidate) else {
            continue;
        };
        let Some(host) = url.host_str() else {
            continue;
        };
        let normalized_host = host.trim().to_ascii_lowercase();
        let is_localhost = matches!(normalized_host.as_str(), "localhost" | "127.0.0.1" | "::1")
            || normalized_host.ends_with(".localhost");

        if !is_localhost {
            return Some(url.to_string());
        }
    }

    None
}

fn combine_command_output(stdout: &str, stderr: &str) -> String {
    [stdout, stderr]
        .into_iter()
        .map(str::trim)
        .filter(|chunk| !chunk.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn build_claude_account(detection: CommandDetection) -> AiAssistantAccount {
    let detected = detection.command_path.is_some();
    let connected = detected && detection.stream_json_supported;

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "claude".to_string(),
        label: "Claude Code".to_string(),
        message: Some(if detected {
            if connected {
                "Claude Code stream-json 调用可用；运行时将使用本地账号，不保存 API Key。"
                    .to_string()
            } else {
                "已检测到 Claude Code，但当前版本未暴露 stream-json 非交互调用能力。".to_string()
            }
        } else {
            "未在 PATH 中找到 Claude Code。".to_string()
        }),
        models: Vec::new(),
        provider_id: "claude".to_string(),
        provider_label: "Claude".to_string(),
        status: if connected {
            "connected"
        } else if detected {
            "misconfigured"
        } else {
            "missing"
        }
        .to_string(),
        transport: connected.then(|| "stream-json".to_string()),
        version: detection.version,
    }
}

fn detected_model_profiles(accounts: &[AiAssistantAccount]) -> Vec<AiAgentProfile> {
    accounts
        .iter()
        .filter(|account| matches!(account.id.as_str(), "codex" | "claude"))
        .map(|account| {
            let available = account.status == "connected";
            AiAgentProfile {
                capabilities: AiAgentCapabilities {
                    diff: true,
                    models: true,
                    read_workspace: true,
                    shell: false,
                    slash_commands: true,
                    write_workspace: true,
                },
                detection: AiAgentDetection {
                    message: if available {
                        None
                    } else {
                        Some("本地助手已检测到，但当前调用能力不可用。".to_string())
                    },
                    status: if available {
                        "available"
                    } else {
                        "misconfigured"
                    }
                    .to_string(),
                },
                id: format!("{}:local", account.id),
                is_test_runtime: false,
                kind: match account.id.as_str() {
                    "codex" => "codex_app_server",
                    "claude" => "claude_cli",
                    _ => "provider",
                }
                .to_string(),
                label: account.label.clone(),
                model_id: format!("{}:local", account.id),
                model_label: account.label.clone(),
                provider_id: account.provider_id.clone(),
                provider_label: account.provider_label.clone(),
            }
        })
        .collect()
}

fn list_codex_models(command_path: &Path) -> Result<Vec<AiDetectedModel>, String> {
    if let Some(models) = read_cached_codex_models(command_path) {
        return Ok(models);
    }

    match list_codex_models_uncached(command_path) {
        Ok(models) => {
            write_cached_codex_models(command_path, &models);
            Ok(models)
        }
        Err(error) => Err(format!(
            "{error}{}",
            codex_model_list_diagnostic(command_path)
                .map(|diagnostic| format!("；诊断：{diagnostic}"))
                .unwrap_or_default()
        )),
    }
}

fn list_codex_models_uncached(command_path: &Path) -> Result<Vec<AiDetectedModel>, String> {
    let mut child = Command::new(command_path)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法启动 Codex app-server".to_string())?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Codex app-server".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Codex app-server".to_string())?;

    write_codex_model_list_requests(&mut stdin)?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let result = read_codex_model_list_response(BufReader::new(stdout));
        let _ = tx.send(result);
    });

    let result = rx
        .recv_timeout(CODEX_MODEL_LIST_TIMEOUT)
        .map_err(|_| "Codex app-server 模型列表请求超时".to_string());

    let _ = child.kill();
    let _ = child.wait();

    result?
}

fn read_cached_codex_models(command_path: &Path) -> Option<Vec<AiDetectedModel>> {
    let cache = CODEX_MODEL_CACHE.get_or_init(|| Mutex::new(None));
    let guard = cache.lock().ok()?;
    let cached = guard.as_ref()?;

    if cached.command_path == command_path && cached.loaded_at.elapsed() < CODEX_MODEL_CACHE_TTL {
        return Some(cached.models.clone());
    }

    None
}

fn write_cached_codex_models(command_path: &Path, models: &[AiDetectedModel]) {
    let cache = CODEX_MODEL_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(CachedCodexModels {
            command_path: command_path.to_path_buf(),
            loaded_at: Instant::now(),
            models: models.to_vec(),
        });
    }
}

fn write_codex_model_list_requests(stdin: &mut impl Write) -> Result<(), String> {
    writeln!(
        stdin,
        r#"{{"id":1,"method":"initialize","params":{{"clientInfo":{{"name":"madora","title":"Madora","version":"0.1.0"}},"capabilities":{{"experimentalApi":true,"optOutNotificationMethods":[]}}}}}}"#
    )
    .map_err(|_| "无法初始化 Codex app-server".to_string())?;
    writeln!(stdin, r#"{{"method":"initialized"}}"#)
        .map_err(|_| "无法初始化 Codex app-server".to_string())?;
    writeln!(stdin, r#"{{"id":2,"method":"model/list","params":{{}}}}"#)
        .map_err(|_| "无法请求 Codex 模型列表".to_string())?;
    stdin
        .flush()
        .map_err(|_| "无法刷新 Codex app-server 请求".to_string())
}

fn read_codex_model_list_response(reader: impl BufRead) -> Result<Vec<AiDetectedModel>, String> {
    let mut line_count = 0usize;

    for line in reader.lines() {
        let line = line.map_err(|_| "无法读取 Codex 模型列表".to_string())?;
        line_count += 1;
        let line = line.trim();

        if line.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        if value.get("id").and_then(|id| id.as_i64()) != Some(2) {
            continue;
        }

        if let Some(error) = value.get("error") {
            let message = error
                .get("message")
                .and_then(|message| message.as_str())
                .unwrap_or("未知 JSON-RPC 错误");
            return Err(format!("Codex 模型列表请求失败: {message}"));
        }

        let Some(data) = value
            .get("result")
            .and_then(|result| result.get("data"))
            .and_then(|data| data.as_array())
        else {
            return Err("Codex 模型列表响应格式无效".to_string());
        };

        return Ok(data
            .iter()
            .filter_map(|model| {
                if model
                    .get("hidden")
                    .and_then(|hidden| hidden.as_bool())
                    .unwrap_or(false)
                {
                    return None;
                }

                let id = model
                    .get("model")
                    .and_then(|id| id.as_str())
                    .or_else(|| model.get("id").and_then(|id| id.as_str()))?;
                let label = model
                    .get("displayName")
                    .and_then(|label| label.as_str())
                    .unwrap_or(id);

                Some(AiDetectedModel {
                    available: true,
                    id: id.to_string(),
                    label: label.to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                })
            })
            .collect());
    }

    Err(format!(
        "Codex 未返回模型列表，已读取 {line_count} 行 app-server 输出"
    ))
}

#[cfg(test)]
fn parse_codex_model_list_response(output: &str) -> Result<Vec<AiDetectedModel>, String> {
    read_codex_model_list_response(BufReader::new(output.as_bytes()))
}

fn codex_model_list_diagnostic(command_path: &Path) -> Option<String> {
    let version = run_command_output(command_path, &["--version"])
        .map(|output| format!("version={output}"))
        .unwrap_or_else(|| "version=unknown".to_string());
    let bundled_models = run_command_output(command_path, &["debug", "models", "--bundled"])
        .map(|output| {
            let count = output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count();
            format!("debug models --bundled 返回 {count} 行")
        })
        .unwrap_or_else(|| "debug models --bundled 不可用".to_string());

    Some(format!("{version}，{bundled_models}"))
}

fn build_codex_app_server_args(options: &AiSessionStartOptions) -> Vec<String> {
    let mut args = vec![
        "app-server".to_string(),
        "-c".to_string(),
        "service_tier=\"fast\"".to_string(),
    ];

    if let Some(model_id) = options.model_id.as_deref() {
        args.push("-c".to_string());
        args.push(format!("model={}", toml_string_literal(model_id)));
    }

    if let Some(thinking) = options.codex_thinking.as_deref() {
        args.push("-c".to_string());
        args.push(format!(
            "model_reasoning_effort={}",
            toml_string_literal(thinking)
        ));
    }

    args
}

fn toml_string_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn start_codex_actor(
    app: &AppHandle,
    root: &Path,
    session_id: &str,
    options: &AiSessionStartOptions,
) -> Result<CodexSessionActor, String> {
    let accounts = detect_ai_accounts_raw();
    let account = accounts
        .iter()
        .find(|account| account.id == "codex" && account.status == "connected")
        .ok_or_else(|| "Codex 本地助手不可用".to_string())?;
    let command_path = account
        .command_path
        .as_deref()
        .ok_or_else(|| "Codex 命令不可用".to_string())?;

    let args = build_codex_app_server_args(options);
    let mut child = Command::new(command_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Codex app-server: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Codex app-server".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Codex app-server".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 Codex app-server 诊断输出".to_string())?;
    let (sender, receiver) = mpsc::channel();
    let actor = CodexSessionActor {
        sender: sender.clone(),
    };
    let app = app.clone();
    let root_path = root.to_string_lossy().to_string();
    let session_id = session_id.to_string();

    std::thread::spawn(move || {
        run_codex_actor(
            app, session_id, root_path, child, stdin, stdout, stderr, receiver,
        );
    });

    Ok(actor)
}

fn run_codex_actor(
    app: AppHandle,
    session_id: String,
    root_path: String,
    mut child: Child,
    mut stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: ChildStderr,
    receiver: mpsc::Receiver<CodexActorCommand>,
) {
    let (message_sender, message_receiver) = mpsc::channel::<serde_json::Value>();
    start_codex_stdout_reader(stdout, message_sender);
    start_codex_stderr_reader(app.clone(), session_id.clone(), stderr);

    if let Err(error) = write_codex_startup(&mut stdin, &root_path) {
        emit_codex_actor_error(&app, &session_id, error);
        let _ = child.kill();
        let _ = child.wait();
        return;
    }

    let mut thread_id: Option<String> = None;
    let mut next_id = 3u64;
    let mut pending_prompts: VecDeque<String> = VecDeque::new();
    let mut running = true;

    while running {
        while let Ok(message) = message_receiver.try_recv() {
            handle_codex_actor_message(
                &app,
                &session_id,
                &mut stdin,
                &mut thread_id,
                &mut next_id,
                &mut pending_prompts,
                message,
            );
        }

        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(CodexActorCommand::SendPrompt { prompt }) => {
                if let Some(thread_id) = thread_id.as_deref() {
                    if let Err(error) =
                        write_codex_turn_start(&mut stdin, &mut next_id, thread_id, &prompt)
                    {
                        emit_codex_actor_error(&app, &session_id, error);
                    }
                } else {
                    pending_prompts.push_back(prompt);
                }
            }
            Ok(CodexActorCommand::Interrupt) => {
                if let Some(thread_id) = thread_id.as_deref() {
                    if let Err(error) =
                        write_codex_turn_interrupt(&mut stdin, &mut next_id, thread_id)
                    {
                        emit_codex_actor_error(&app, &session_id, error);
                    }
                }
            }
            Ok(CodexActorCommand::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                running = false;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn start_codex_stdout_reader(stdout: ChildStdout, sender: mpsc::Sender<serde_json::Value>) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else {
                break;
            };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            if sender.send(value).is_err() {
                break;
            }
        }
    });
}

fn start_codex_stderr_reader(app: AppHandle, session_id: String, stderr: ChildStderr) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else {
                break;
            };
            if line.contains("\"level\":\"ERROR\"") || line.contains("ERROR") {
                emit_codex_actor_error(&app, &session_id, line);
            }
        }
    });
}

fn handle_codex_actor_message(
    app: &AppHandle,
    session_id: &str,
    stdin: &mut ChildStdin,
    thread_id: &mut Option<String>,
    next_id: &mut u64,
    pending_prompts: &mut VecDeque<String>,
    message: serde_json::Value,
) {
    if message.get("id").and_then(|id| id.as_u64()) == Some(2) {
        if let Some(error) = message
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
        {
            emit_codex_actor_error(app, session_id, error.to_string());
            return;
        }

        if let Some(id) = message
            .get("result")
            .and_then(|result| result.get("thread"))
            .and_then(|thread| thread.get("id"))
            .and_then(|id| id.as_str())
        {
            *thread_id = Some(id.to_string());
            flush_pending_codex_prompts(
                app,
                session_id,
                stdin,
                thread_id,
                next_id,
                pending_prompts,
            );
        }
    }

    if message.get("method").and_then(|method| method.as_str()) == Some("thread/started") {
        if let Some(id) = message
            .get("params")
            .and_then(|params| params.get("thread"))
            .and_then(|thread| thread.get("id"))
            .and_then(|id| id.as_str())
        {
            *thread_id = Some(id.to_string());
            flush_pending_codex_prompts(
                app,
                session_id,
                stdin,
                thread_id,
                next_id,
                pending_prompts,
            );
        }
    }

    if let Some(error) = message
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
    {
        emit_codex_actor_error(app, session_id, error.to_string());
    }

    for event in map_codex_message_to_runtime_events(session_id, &message) {
        emit_ai_event(app, event);
    }
}

fn flush_pending_codex_prompts(
    app: &AppHandle,
    session_id: &str,
    stdin: &mut ChildStdin,
    thread_id: &Option<String>,
    next_id: &mut u64,
    pending_prompts: &mut VecDeque<String>,
) {
    let Some(thread_id) = thread_id.as_deref() else {
        return;
    };

    while let Some(prompt) = pending_prompts.pop_front() {
        if let Err(error) = write_codex_turn_start(stdin, next_id, thread_id, &prompt) {
            emit_codex_actor_error(app, session_id, error);
            break;
        }
    }
}

fn write_codex_startup(stdin: &mut ChildStdin, root_path: &str) -> Result<(), String> {
    write_json_line(
        stdin,
        serde_json::json!({
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "madora",
                    "title": "Madora",
                    "version": "0.1.0"
                },
                "capabilities": {
                    "experimentalApi": true,
                    "optOutNotificationMethods": []
                }
            }
        }),
    )?;
    write_json_line(stdin, serde_json::json!({ "method": "initialized" }))?;
    write_json_line(
        stdin,
        serde_json::json!({
            "id": 2,
            "method": "thread/start",
            "params": {
                "cwd": root_path,
                "approvalPolicy": "never",
                "sandbox": "read-only"
            }
        }),
    )
}

fn write_codex_turn_start(
    stdin: &mut ChildStdin,
    next_id: &mut u64,
    thread_id: &str,
    prompt: &str,
) -> Result<(), String> {
    let id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        serde_json::json!({
            "id": id,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "input": [
                    {
                        "type": "text",
                        "text": prompt,
                        "text_elements": []
                    }
                ],
                "approvalPolicy": "never",
                "sandboxPolicy": {
                    "type": "readOnly",
                    "networkAccess": false
                }
            }
        }),
    )
}

fn write_codex_turn_interrupt(
    stdin: &mut ChildStdin,
    next_id: &mut u64,
    thread_id: &str,
) -> Result<(), String> {
    let id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        serde_json::json!({
            "id": id,
            "method": "turn/interrupt",
            "params": {
                "threadId": thread_id
            }
        }),
    )
}

fn write_json_line(stdin: &mut impl Write, value: serde_json::Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&value).map_err(|error| error.to_string())?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .map_err(|_| "无法写入 Codex app-server".to_string())?;
    stdin
        .flush()
        .map_err(|_| "无法刷新 Codex app-server 请求".to_string())
}

fn emit_codex_actor_error(app: &AppHandle, session_id: &str, message: String) {
    emit_ai_event(
        app,
        AiRuntimeEvent::RunState {
            error: Some(message.clone()),
            exit_code: None,
            session_id: session_id.to_string(),
            state: "failed".to_string(),
        },
    );
    emit_ai_event(
        app,
        AiRuntimeEvent::Error {
            message,
            session_id: Some(session_id.to_string()),
        },
    );
}

fn build_claude_stream_args(root_arg: &str, options: &AiSessionStartOptions) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-prompt-tool".to_string(),
        "stdio".to_string(),
        "--add-dir".to_string(),
        root_arg.to_string(),
    ];

    if let Some(model_id) = options.model_id.as_deref() {
        args.push("--model".to_string());
        args.push(model_id.to_string());
    }

    if options.extended_thinking {
        args.push("--effort".to_string());
        args.push("high".to_string());
    }

    if options.agent_mode.as_deref() == Some("plan") {
        args.push("--permission-mode".to_string());
        args.push("plan".to_string());
    }

    args
}

fn start_claude_actor(
    app: &AppHandle,
    root: &Path,
    session_id: &str,
    options: &AiSessionStartOptions,
) -> Result<ClaudeSessionActor, String> {
    let accounts = detect_ai_accounts_raw();
    let account = accounts
        .iter()
        .find(|account| account.id == "claude" && account.status == "connected")
        .ok_or_else(|| "Claude Code 本地助手不可用".to_string())?;
    let command_path = account
        .command_path
        .as_deref()
        .ok_or_else(|| "Claude Code 命令不可用".to_string())?;
    let root_arg = root.to_string_lossy().to_string();
    let args = build_claude_stream_args(&root_arg, options);
    let active_anthropic_token = crate::ai_settings::read_active_anthropic_account_token()?;

    let mut command = Command::new(command_path);
    command
        .args(args)
        .current_dir(root)
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .env_remove("CLAUDECODE");
    if let Some((key, value)) = claude_auth_env_var(active_anthropic_token.as_deref()) {
        command.env(key, value);
    }

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Claude Code stream-json: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Claude Code".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Claude Code 输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 Claude Code 诊断输出".to_string())?;
    let (sender, receiver) = mpsc::channel();
    let actor = ClaudeSessionActor {
        sender: sender.clone(),
    };
    let app = app.clone();
    let session_id = session_id.to_string();

    std::thread::spawn(move || {
        run_claude_actor(app, session_id, child, stdin, stdout, stderr, receiver);
    });

    Ok(actor)
}

fn claude_auth_env_var(active_token: Option<&str>) -> Option<(&'static str, String)> {
    active_token
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(|token| ("ANTHROPIC_AUTH_TOKEN", token.to_string()))
}

fn run_claude_actor(
    app: AppHandle,
    session_id: String,
    mut child: Child,
    mut stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: ChildStderr,
    receiver: mpsc::Receiver<ClaudeActorCommand>,
) {
    let (message_sender, message_receiver) = mpsc::channel::<serde_json::Value>();
    start_claude_stdout_reader(stdout, message_sender);
    start_claude_stderr_reader(app.clone(), session_id.clone(), stderr);

    let mut running = true;
    while running {
        while let Ok(message) = message_receiver.try_recv() {
            handle_claude_actor_message(&app, &session_id, message);
        }

        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(ClaudeActorCommand::SendPrompt { prompt }) => {
                emit_ai_event(
                    &app,
                    AiRuntimeEvent::RunState {
                        error: None,
                        exit_code: None,
                        session_id: session_id.clone(),
                        state: "running".to_string(),
                    },
                );
                if let Err(error) = write_claude_user_prompt(&mut stdin, &prompt) {
                    emit_claude_actor_error(&app, &session_id, error);
                }
            }
            Ok(ClaudeActorCommand::Interrupt) => {
                if let Err(error) = write_claude_interrupt(&mut stdin) {
                    emit_claude_actor_error(&app, &session_id, error);
                    let _ = child.kill();
                    running = false;
                }
            }
            Ok(ClaudeActorCommand::RespondPermission {
                request_id,
                response,
            }) => {
                if let Err(error) = write_claude_control_response(&mut stdin, &request_id, response)
                {
                    emit_claude_actor_error(&app, &session_id, error);
                }
            }
            Ok(ClaudeActorCommand::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                running = false;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    emit_claude_actor_error(
                        &app,
                        &session_id,
                        format!(
                            "Claude Code 已退出{}",
                            status
                                .code()
                                .map(|code| format!("，exit code={code}"))
                                .unwrap_or_default()
                        ),
                    );
                }
                running = false;
            }
            Ok(None) => {}
            Err(error) => {
                emit_claude_actor_error(
                    &app,
                    &session_id,
                    format!("无法读取 Claude Code 进程状态: {error}"),
                );
                running = false;
            }
        }
    }

    while let Ok(message) = message_receiver.try_recv() {
        handle_claude_actor_message(&app, &session_id, message);
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn start_claude_stdout_reader(stdout: ChildStdout, sender: mpsc::Sender<serde_json::Value>) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else {
                break;
            };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            if sender.send(value).is_err() {
                break;
            }
        }
    });
}

fn start_claude_stderr_reader(app: AppHandle, session_id: String, stderr: ChildStderr) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else {
                break;
            };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if line.contains("error")
                || line.contains("Error")
                || line.contains("ERROR")
                || line.contains("ZodError")
            {
                emit_claude_actor_error(&app, &session_id, line.to_string());
            }
        }
    });
}

fn handle_claude_actor_message(app: &AppHandle, session_id: &str, message: serde_json::Value) {
    for event in map_claude_message_to_runtime_events(session_id, &message) {
        emit_ai_event(app, event);
    }
}

fn write_claude_user_prompt(stdin: &mut ChildStdin, prompt: &str) -> Result<(), String> {
    write_claude_json_line(stdin, build_claude_user_payload(prompt))
}

fn write_claude_interrupt(stdin: &mut ChildStdin) -> Result<(), String> {
    write_claude_json_line(
        stdin,
        serde_json::json!({
            "type": "control_request",
            "request_id": format!("madora_interrupt_{}", Uuid::new_v4()),
            "request": {
                "subtype": "interrupt"
            }
        }),
    )
}

fn write_claude_control_response(
    stdin: &mut ChildStdin,
    request_id: &str,
    response: serde_json::Value,
) -> Result<(), String> {
    write_claude_json_line(
        stdin,
        serde_json::json!({
            "type": "control_response",
            "response": {
                "subtype": "success",
                "request_id": request_id,
                "response": response,
            }
        }),
    )
}

fn write_claude_json_line(stdin: &mut ChildStdin, value: serde_json::Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&value).map_err(|error| error.to_string())?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .map_err(|error| format!("无法写入 Claude Code: {error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("无法刷新 Claude Code 请求: {error}"))
}

fn build_claude_user_payload(prompt: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "user",
        "uuid": Uuid::new_v4().to_string(),
        "message": {
            "role": "user",
            "content": prompt,
        }
    })
}

fn build_claude_permission_response(
    input: &RespondAiPermissionInput,
) -> Result<serde_json::Value, String> {
    match input.behavior.as_str() {
        "allow" => {
            let mut response = serde_json::json!({
                "behavior": "allow",
                "updatedInput": input
                    .updated_input
                    .clone()
                    .unwrap_or_else(|| serde_json::json!({})),
            });

            if let Some(permissions) = input
                .updated_permissions
                .as_ref()
                .filter(|permissions| !permissions.is_empty())
            {
                response["updatedPermissions"] = serde_json::Value::Array(permissions.clone());
            }

            Ok(response)
        }
        "deny" => {
            let mut response = serde_json::json!({
                "behavior": "deny",
                "message": input
                    .deny_message
                    .clone()
                    .unwrap_or_else(|| "User denied permission".to_string()),
            });

            if input.interrupt == Some(true) {
                response["interrupt"] = serde_json::json!(true);
            }

            Ok(response)
        }
        _ => Err("权限响应 behavior 仅支持 allow 或 deny".to_string()),
    }
}

fn emit_claude_actor_error(app: &AppHandle, session_id: &str, message: String) {
    emit_ai_event(
        app,
        AiRuntimeEvent::RunState {
            error: Some(message.clone()),
            exit_code: None,
            session_id: session_id.to_string(),
            state: "failed".to_string(),
        },
    );
    emit_ai_event(
        app,
        AiRuntimeEvent::Error {
            message,
            session_id: Some(session_id.to_string()),
        },
    );
}

fn map_codex_message_to_runtime_events(
    session_id: &str,
    value: &serde_json::Value,
) -> Vec<AiRuntimeEvent> {
    let Some(method) = value.get("method").and_then(|method| method.as_str()) else {
        return Vec::new();
    };
    let params = value.get("params").unwrap_or(&serde_json::Value::Null);

    match method {
        "item/agentMessage/delta" => {
            let message_id = params
                .get("itemId")
                .and_then(|id| id.as_str())
                .unwrap_or("assistant");
            let delta = params
                .get("delta")
                .and_then(|delta| delta.as_str())
                .unwrap_or_default();

            vec![AiRuntimeEvent::MessageDelta {
                delta: delta.to_string(),
                message_id: message_id.to_string(),
                session_id: session_id.to_string(),
            }]
        }
        "item/reasoning/textDelta" | "item/reasoning/summaryTextDelta" => {
            let message_id = params
                .get("itemId")
                .and_then(|id| id.as_str())
                .unwrap_or("reasoning");
            let delta = params
                .get("delta")
                .and_then(|delta| delta.as_str())
                .unwrap_or_default();

            vec![AiRuntimeEvent::ThinkingDelta {
                delta: delta.to_string(),
                message_id: message_id.to_string(),
                parent_tool_call_id: None,
                session_id: session_id.to_string(),
            }]
        }
        "turn/started" => vec![AiRuntimeEvent::RunState {
            error: None,
            exit_code: None,
            session_id: session_id.to_string(),
            state: "running".to_string(),
        }],
        "turn/completed" => vec![
            AiRuntimeEvent::RunState {
                error: None,
                exit_code: None,
                session_id: session_id.to_string(),
                state: "completed".to_string(),
            },
            AiRuntimeEvent::TurnCompleted {
                cancelled: false,
                session_id: session_id.to_string(),
            },
        ],
        "thread/tokenUsage/updated" => {
            let total = params
                .get("tokenUsage")
                .and_then(|usage| usage.get("total"))
                .unwrap_or(&serde_json::Value::Null);

            vec![AiRuntimeEvent::UsageUpdated {
                cache_read_tokens: total
                    .get("cachedInputTokens")
                    .and_then(|tokens| tokens.as_u64()),
                cache_write_tokens: None,
                input_tokens: total
                    .get("inputTokens")
                    .and_then(|tokens| tokens.as_u64())
                    .unwrap_or(0),
                model: None,
                output_tokens: total
                    .get("outputTokens")
                    .and_then(|tokens| tokens.as_u64())
                    .unwrap_or(0),
                session_id: session_id.to_string(),
                total_cost_usd: None,
            }]
        }
        "item/started" => params
            .get("item")
            .and_then(|item| codex_tool_started_event(session_id, item))
            .into_iter()
            .collect(),
        "item/completed" => params
            .get("item")
            .and_then(|item| codex_tool_completed_event(session_id, item))
            .into_iter()
            .collect(),
        "item/commandExecution/requestApproval" | "execCommandApproval" => {
            codex_permission_prompt_event(session_id, value, "Bash")
                .into_iter()
                .collect()
        }
        "item/fileChange/requestApproval" | "applyPatchApproval" => {
            codex_permission_prompt_event(session_id, value, "Edit")
                .into_iter()
                .collect()
        }
        "item/permissions/requestApproval" => {
            codex_permission_prompt_event(session_id, value, "Bash")
                .into_iter()
                .collect()
        }
        "error" => {
            let message = params
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(|message| message.as_str())
                .or_else(|| params.get("message").and_then(|message| message.as_str()))
                .unwrap_or("Codex app-server 错误");

            vec![
                AiRuntimeEvent::RunState {
                    error: Some(message.to_string()),
                    exit_code: None,
                    session_id: session_id.to_string(),
                    state: "failed".to_string(),
                },
                AiRuntimeEvent::Error {
                    message: message.to_string(),
                    session_id: Some(session_id.to_string()),
                },
            ]
        }
        _ => Vec::new(),
    }
}

fn codex_permission_prompt_event(
    session_id: &str,
    value: &serde_json::Value,
    tool_name: &str,
) -> Option<AiRuntimeEvent> {
    let params = value.get("params").unwrap_or(&serde_json::Value::Null);
    let request_id = codex_request_id(value)?;
    let tool_call_id = params
        .get("itemId")
        .and_then(|id| id.as_str())
        .unwrap_or(&request_id)
        .to_string();
    let reason = params
        .get("reason")
        .and_then(|reason| reason.as_str())
        .unwrap_or("需要用户确认")
        .to_string();
    let mut input = serde_json::Map::new();

    for key in [
        "command",
        "cwd",
        "changes",
        "grantRoot",
        "permissions",
        "environmentId",
        "commandActions",
        "proposedExecpolicyAmendment",
        "proposedNetworkPolicyAmendments",
    ] {
        if let Some(value) = params.get(key) {
            input.insert(key.to_string(), value.clone());
        }
    }

    if input.is_empty() {
        input.insert("request".to_string(), params.clone());
    }

    Some(AiRuntimeEvent::PermissionPrompt {
        parent_tool_call_id: None,
        reason,
        request_id,
        session_id: session_id.to_string(),
        suggestions: None,
        tool_call_id,
        tool_input: serde_json::Value::Object(input),
        tool_name: tool_name.to_string(),
    })
}

fn codex_request_id(value: &serde_json::Value) -> Option<String> {
    match value.get("id")? {
        serde_json::Value::String(id) => Some(id.clone()),
        serde_json::Value::Number(id) => Some(id.to_string()),
        other => Some(other.to_string()),
    }
}

fn codex_tool_started_event(session_id: &str, item: &serde_json::Value) -> Option<AiRuntimeEvent> {
    let tool_call_id = item.get("id").and_then(|id| id.as_str())?.to_string();
    let (tool_name, input) = codex_tool_name_and_input(item)?;

    Some(AiRuntimeEvent::ToolStarted {
        input,
        parent_tool_call_id: None,
        session_id: session_id.to_string(),
        tool_call_id,
        tool_name,
    })
}

fn codex_tool_completed_event(
    session_id: &str,
    item: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let tool_call_id = item.get("id").and_then(|id| id.as_str())?.to_string();
    let (tool_name, _) = codex_tool_name_and_input(item)?;
    let status = codex_tool_status(item);

    Some(AiRuntimeEvent::ToolCompleted {
        duration_ms: item
            .get("durationMs")
            .and_then(|duration| duration.as_u64()),
        output: codex_tool_output(item),
        parent_tool_call_id: None,
        session_id: session_id.to_string(),
        status,
        tool_call_id,
        tool_name,
    })
}

fn codex_tool_name_and_input(item: &serde_json::Value) -> Option<(String, serde_json::Value)> {
    match item.get("type").and_then(|kind| kind.as_str())? {
        "commandExecution" => Some((
            "Bash".to_string(),
            serde_json::json!({
                "command": item.get("command").cloned().unwrap_or(serde_json::Value::Null),
                "cwd": item.get("cwd").cloned().unwrap_or(serde_json::Value::Null),
            }),
        )),
        "fileChange" => Some((
            "Edit".to_string(),
            serde_json::json!({
                "changes": item.get("changes").cloned().unwrap_or(serde_json::Value::Null),
            }),
        )),
        "mcpToolCall" => {
            let server = item
                .get("server")
                .and_then(|value| value.as_str())
                .unwrap_or("mcp");
            let tool = item
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            Some((
                format!("{server}.{tool}"),
                item.get("arguments")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            ))
        }
        "dynamicToolCall" => {
            let namespace = item
                .get("namespace")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            let tool = item
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("call");
            Some((
                format!("{namespace}.{tool}"),
                item.get("arguments")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            ))
        }
        _ => None,
    }
}

fn codex_tool_status(item: &serde_json::Value) -> String {
    match item.get("status").and_then(|status| status.as_str()) {
        Some("completed") => "success",
        Some("failed") => "error",
        Some("declined") => "denied",
        Some("inProgress") => "running",
        Some("success") => "success",
        Some("error") => "error",
        Some("denied") => "denied",
        _ => "success",
    }
    .to_string()
}

fn codex_tool_output(item: &serde_json::Value) -> serde_json::Value {
    match item.get("type").and_then(|kind| kind.as_str()) {
        Some("commandExecution") => serde_json::json!({
            "aggregatedOutput": item.get("aggregatedOutput").cloned().unwrap_or(serde_json::Value::Null),
            "exitCode": item.get("exitCode").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("fileChange") => serde_json::json!({
            "changes": item.get("changes").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("mcpToolCall") => serde_json::json!({
            "result": item.get("result").cloned().unwrap_or(serde_json::Value::Null),
            "error": item.get("error").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("dynamicToolCall") => serde_json::json!({
            "contentItems": item.get("contentItems").cloned().unwrap_or(serde_json::Value::Null),
            "success": item.get("success").cloned().unwrap_or(serde_json::Value::Null),
        }),
        _ => item.clone(),
    }
}

fn map_claude_message_to_runtime_events(
    session_id: &str,
    value: &serde_json::Value,
) -> Vec<AiRuntimeEvent> {
    let value = if value.get("type").and_then(|kind| kind.as_str()) == Some("stream_event") {
        value.get("event").unwrap_or(value)
    } else {
        value
    };
    let Some(kind) = value.get("type").and_then(|kind| kind.as_str()) else {
        return Vec::new();
    };

    match kind {
        "system" => map_claude_system_event(session_id, value),
        "content_block_start" => claude_content_block_start_event(session_id, value)
            .into_iter()
            .collect(),
        "content_block_delta" => claude_content_block_delta_event(session_id, value)
            .into_iter()
            .collect(),
        "assistant" => map_claude_assistant_event(session_id, value),
        "user" => map_claude_user_event(session_id, value),
        "result" => map_claude_result_event(session_id, value),
        "control_request" => claude_permission_prompt_event(session_id, value)
            .into_iter()
            .collect(),
        _ => Vec::new(),
    }
}

fn map_claude_system_event(_session_id: &str, _value: &serde_json::Value) -> Vec<AiRuntimeEvent> {
    Vec::new()
}

fn claude_content_block_start_event(
    session_id: &str,
    value: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let block = value.get("content_block")?;

    match block.get("type").and_then(|kind| kind.as_str())? {
        "tool_use" => {
            let tool_call_id = block.get("id").and_then(|id| id.as_str())?.to_string();
            let tool_name = block
                .get("name")
                .and_then(|name| name.as_str())
                .unwrap_or("Tool")
                .to_string();

            Some(AiRuntimeEvent::ToolStarted {
                input: block
                    .get("input")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
                parent_tool_call_id: claude_parent_tool_call_id(value),
                session_id: session_id.to_string(),
                tool_call_id,
                tool_name,
            })
        }
        "thinking" => block
            .get("thinking")
            .and_then(|thinking| thinking.as_str())
            .filter(|thinking| !thinking.is_empty())
            .map(|delta| AiRuntimeEvent::ThinkingDelta {
                delta: delta.to_string(),
                message_id: claude_message_id(value, "reasoning"),
                parent_tool_call_id: claude_parent_tool_call_id(value),
                session_id: session_id.to_string(),
            }),
        _ => None,
    }
}

fn claude_content_block_delta_event(
    session_id: &str,
    value: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let delta = value.get("delta")?;

    match delta.get("type").and_then(|kind| kind.as_str())? {
        "text_delta" => {
            let text = delta.get("text").and_then(|text| text.as_str())?;

            Some(AiRuntimeEvent::MessageDelta {
                delta: text.to_string(),
                message_id: claude_message_id(value, "assistant"),
                session_id: session_id.to_string(),
            })
        }
        "thinking_delta" | "thinking" => {
            let text = delta
                .get("thinking")
                .and_then(|thinking| thinking.as_str())?;

            Some(AiRuntimeEvent::ThinkingDelta {
                delta: text.to_string(),
                message_id: claude_message_id(value, "reasoning"),
                parent_tool_call_id: claude_parent_tool_call_id(value),
                session_id: session_id.to_string(),
            })
        }
        "input_json_delta" => {
            let partial_json = delta
                .get("partial_json")
                .and_then(|partial| partial.as_str())?;
            let tool_call_id = value
                .get("tool_use_id")
                .or_else(|| value.get("content_block").and_then(|block| block.get("id")))
                .and_then(|id| id.as_str())
                .unwrap_or("tool")
                .to_string();

            Some(AiRuntimeEvent::ToolInputDelta {
                parent_tool_call_id: claude_parent_tool_call_id(value),
                partial_json: partial_json.to_string(),
                session_id: session_id.to_string(),
                tool_call_id,
            })
        }
        _ => None,
    }
}

fn map_claude_assistant_event(session_id: &str, value: &serde_json::Value) -> Vec<AiRuntimeEvent> {
    let message = value.get("message").unwrap_or(value);
    let message_id = message
        .get("id")
        .and_then(|id| id.as_str())
        .unwrap_or("assistant")
        .to_string();
    let mut events = Vec::new();
    let mut text = String::new();

    if let Some(content) = message
        .get("content")
        .and_then(|content| content.as_array())
    {
        for block in content {
            match block.get("type").and_then(|kind| kind.as_str()) {
                Some("text") => {
                    if let Some(block_text) = block.get("text").and_then(|text| text.as_str()) {
                        text.push_str(block_text);
                    }
                }
                Some("tool_use") => {
                    if let Some(event) = claude_tool_started_event(session_id, block) {
                        events.push(event);
                    }
                }
                _ => {}
            }
        }
    }

    if !text.is_empty() {
        events.insert(
            0,
            AiRuntimeEvent::MessageDelta {
                delta: text,
                message_id: message_id.clone(),
                session_id: session_id.to_string(),
            },
        );
        events.push(AiRuntimeEvent::MessageCompleted {
            message_id,
            session_id: session_id.to_string(),
        });
    }

    events
}

fn claude_tool_started_event(
    session_id: &str,
    block: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let tool_call_id = block.get("id").and_then(|id| id.as_str())?.to_string();
    let tool_name = block
        .get("name")
        .and_then(|name| name.as_str())
        .unwrap_or("Tool")
        .to_string();
    let input = block
        .get("input")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    Some(AiRuntimeEvent::ToolStarted {
        input,
        parent_tool_call_id: None,
        session_id: session_id.to_string(),
        tool_call_id,
        tool_name,
    })
}

fn map_claude_user_event(session_id: &str, value: &serde_json::Value) -> Vec<AiRuntimeEvent> {
    let message = value.get("message").unwrap_or(value);
    let Some(content) = message
        .get("content")
        .and_then(|content| content.as_array())
    else {
        return Vec::new();
    };

    content
        .iter()
        .filter_map(|block| {
            if block.get("type").and_then(|kind| kind.as_str()) != Some("tool_result") {
                return None;
            }

            let tool_call_id = block
                .get("tool_use_id")
                .and_then(|id| id.as_str())
                .unwrap_or("tool")
                .to_string();
            let status = if block
                .get("is_error")
                .and_then(|is_error| is_error.as_bool())
                .unwrap_or(false)
            {
                "error"
            } else {
                "success"
            };

            Some(AiRuntimeEvent::ToolCompleted {
                duration_ms: None,
                output: serde_json::json!({
                    "content": block.get("content").cloned().unwrap_or(serde_json::Value::Null),
                }),
                parent_tool_call_id: claude_parent_tool_call_id(value),
                session_id: session_id.to_string(),
                status: status.to_string(),
                tool_call_id,
                tool_name: "Tool".to_string(),
            })
        })
        .collect()
}

fn map_claude_result_event(session_id: &str, value: &serde_json::Value) -> Vec<AiRuntimeEvent> {
    let mut events = Vec::new();

    if let Some(usage) = value.get("usage") {
        events.push(AiRuntimeEvent::UsageUpdated {
            cache_read_tokens: usage
                .get("cache_read_input_tokens")
                .and_then(|tokens| tokens.as_u64()),
            cache_write_tokens: usage
                .get("cache_creation_input_tokens")
                .and_then(|tokens| tokens.as_u64()),
            input_tokens: usage
                .get("input_tokens")
                .and_then(|tokens| tokens.as_u64())
                .unwrap_or(0),
            model: value
                .get("model")
                .and_then(|model| model.as_str())
                .map(|model| model.to_string()),
            output_tokens: usage
                .get("output_tokens")
                .and_then(|tokens| tokens.as_u64())
                .unwrap_or(0),
            session_id: session_id.to_string(),
            total_cost_usd: value
                .get("total_cost_usd")
                .or_else(|| value.get("cost_usd"))
                .and_then(|cost| cost.as_f64()),
        });
    }

    if let Some(denials) = value
        .get("permission_denials")
        .and_then(|denials| denials.as_array())
    {
        for denial in denials {
            events.push(AiRuntimeEvent::PermissionDenied {
                session_id: session_id.to_string(),
                tool_call_id: denial
                    .get("tool_use_id")
                    .and_then(|id| id.as_str())
                    .unwrap_or("tool")
                    .to_string(),
                tool_input: denial
                    .get("tool_input")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
                tool_name: denial
                    .get("tool_name")
                    .and_then(|name| name.as_str())
                    .unwrap_or("Tool")
                    .to_string(),
            });
        }
    }

    let subtype = value
        .get("subtype")
        .and_then(|subtype| subtype.as_str())
        .unwrap_or("success");
    let error = subtype.starts_with("error").then(|| {
        value
            .get("error")
            .and_then(|error| error.as_str())
            .or_else(|| value.get("message").and_then(|message| message.as_str()))
            .unwrap_or("Claude Code 运行失败")
            .to_string()
    });

    events.push(AiRuntimeEvent::RunState {
        error: error.clone(),
        exit_code: None,
        session_id: session_id.to_string(),
        state: if error.is_some() {
            "failed".to_string()
        } else {
            "completed".to_string()
        },
    });
    events.push(AiRuntimeEvent::TurnCompleted {
        cancelled: false,
        session_id: session_id.to_string(),
    });

    events
}

fn claude_permission_prompt_event(
    session_id: &str,
    value: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let request = value.get("request").unwrap_or(value);
    let subtype = request
        .get("subtype")
        .and_then(|subtype| subtype.as_str())
        .unwrap_or_default();

    if !matches!(
        subtype,
        "permission_prompt" | "tool_permission" | "permission"
    ) {
        return None;
    }

    let request_id = value
        .get("request_id")
        .and_then(|id| id.as_str())
        .unwrap_or("permission")
        .to_string();
    let tool_call_id = request
        .get("tool_use_id")
        .and_then(|id| id.as_str())
        .unwrap_or(&request_id)
        .to_string();
    let tool_name = request
        .get("tool_name")
        .and_then(|name| name.as_str())
        .unwrap_or("Tool")
        .to_string();
    let tool_input = request
        .get("tool_input")
        .or_else(|| request.get("input"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    Some(AiRuntimeEvent::PermissionPrompt {
        parent_tool_call_id: claude_parent_tool_call_id(value),
        reason: request
            .get("reason")
            .and_then(|reason| reason.as_str())
            .unwrap_or("需要用户确认")
            .to_string(),
        request_id,
        session_id: session_id.to_string(),
        suggestions: None,
        tool_call_id,
        tool_input,
        tool_name,
    })
}

fn claude_parent_tool_call_id(value: &serde_json::Value) -> Option<String> {
    value
        .get("parent_tool_use_id")
        .and_then(|id| id.as_str())
        .filter(|id| !id.is_empty())
        .map(|id| id.to_string())
}

fn claude_message_id(value: &serde_json::Value, fallback: &str) -> String {
    value
        .get("message_id")
        .or_else(|| value.get("id"))
        .and_then(|id| id.as_str())
        .unwrap_or(fallback)
        .to_string()
}

fn is_available_detected_profile(profile_id: &str) -> bool {
    detected_model_profiles(&detect_ai_accounts_raw())
        .iter()
        .any(|profile| profile.id == profile_id && profile.detection.status == "available")
}

fn find_command_path(command: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;

    for directory in env::split_paths(&path_value) {
        let candidate = directory.join(command);

        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(windows)]
        {
            let exe_candidate = directory.join(format!("{command}.exe"));

            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }

    None
}

fn run_command_output(path: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(path).args(args).output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let text = if stdout.is_empty() { stderr } else { stdout };

    (!text.is_empty()).then_some(text)
}

fn ai_conversations_dir(root: &Path) -> PathBuf {
    root.join(".madora").join(AI_SESSIONS_DIR)
}

fn ai_conversation_path(root: &Path, conversation_id: &str) -> PathBuf {
    ai_conversations_dir(root).join(format!("{conversation_id}.json"))
}

fn read_ai_conversation_file(path: &Path) -> io::Result<AiConversationRecord> {
    let raw = fs::read_to_string(path)?;
    serde_json::from_str(&raw).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_json_pretty<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    fs::write(path, raw)
}

fn validate_conversation_id(conversation_id: &str) -> Result<&str, String> {
    let valid = !conversation_id.is_empty()
        && conversation_id.len() <= 120
        && conversation_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'));

    if valid {
        Ok(conversation_id)
    } else {
        Err("AI 会话 ID 无效".to_string())
    }
}

fn normalize_conversation_record(record: &mut AiConversationRecord) {
    let now = current_time_millis();

    if record.created_at == 0 {
        record.created_at = now;
    }

    if record.updated_at == 0 {
        record.updated_at = now;
    }

    if record.title.trim().is_empty() {
        record.title = record
            .messages
            .iter()
            .find(|message| message.role == "user")
            .map(|message| trim_conversation_title(&message.content))
            .unwrap_or_else(|| "New Chat".to_string());
    } else {
        record.title = trim_conversation_title(&record.title);
    }
}

fn conversation_summary(record: &AiConversationRecord) -> AiConversationSummary {
    AiConversationSummary {
        created_at: record.created_at,
        document_path: record.document_path.clone(),
        document_title: record.document_title.clone(),
        id: record.id.clone(),
        message_count: record.messages.len(),
        profile_id: record.profile_id.clone(),
        profile_label: record.profile_label.clone(),
        provider_id: record.provider_id.clone(),
        provider_label: record.provider_label.clone(),
        title: record.title.clone(),
        updated_at: record.updated_at,
    }
}

fn trim_conversation_title(value: &str) -> String {
    let trimmed = value.trim();
    let mut title = trimmed.chars().take(40).collect::<String>();

    if trimmed.chars().count() > 40 {
        title.push('…');
    }

    if title.is_empty() {
        "New Chat".to_string()
    } else {
        title
    }
}

fn current_time_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn build_fake_response(input: &SendAiPromptInput) -> String {
    match input.context.document.as_ref() {
        Some(document) => format!(
            "Echo: {}\n\nContext: {} ({})",
            input.prompt, document.title, document.content_hash
        ),
        None => format!("Echo: {}", input.prompt),
    }
}

fn build_runtime_response(
    session: &AiSessionInfo,
    input: &SendAiPromptInput,
) -> Result<String, String> {
    match session.profile_id.as_str() {
        "fake-echo" => Ok(build_fake_response(input)),
        "codex:local" => run_detected_assistant("codex", &session.root_path, input),
        "claude:local" => run_detected_assistant("claude", &session.root_path, input),
        _ => Err("AI agent profile 不可用".to_string()),
    }
}

fn run_detected_assistant(
    assistant_id: &str,
    root_path: &str,
    input: &SendAiPromptInput,
) -> Result<String, String> {
    let accounts = detect_ai_accounts_raw();
    let account = accounts
        .iter()
        .find(|account| account.id == assistant_id && account.status == "connected")
        .ok_or_else(|| "本地 AI 助手不可用".to_string())?;
    let command_path = account
        .command_path
        .as_deref()
        .ok_or_else(|| "本地 AI 助手命令不可用".to_string())?;
    let prompt = build_assistant_prompt(input);
    let root = validate_agent_root(root_path)?;
    let root_arg = root.to_string_lossy().to_string();

    match assistant_id {
        "codex" => run_command_text(
            Path::new(command_path),
            &[
                "exec",
                "--cd",
                &root_arg,
                "--sandbox",
                "read-only",
                "--ask-for-approval",
                "never",
                "--skip-git-repo-check",
                "--ephemeral",
                &prompt,
            ],
        ),
        "claude" => run_command_text(
            Path::new(command_path),
            &[
                "--print",
                "--output-format",
                "stream-json",
                "--permission-mode",
                "dontAsk",
                "--add-dir",
                &root_arg,
                &prompt,
            ],
        )
        .map(|output| parse_claude_stream_json_text(&output)),
        _ => Err("本地 AI 助手不可用".to_string()),
    }
}

fn build_assistant_prompt(input: &SendAiPromptInput) -> String {
    let mut prompt = input.prompt.clone();

    if let Some(document) = input.context.document.as_ref() {
        prompt.push_str(&format!(
            "\n\n当前 Markdown 文档：{}\n路径：{}\n\n```markdown\n{}\n```",
            document.title, document.path, document.markdown
        ));
    }

    if let Some(selection) = input.context.selection.as_ref() {
        prompt.push_str(&format!(
            "\n\n用户当前选中的 Markdown 片段{}{}：\n范围：{}..{}\n\n```markdown\n{}\n```",
            selection
                .document_title
                .as_deref()
                .map(|title| format!("：{}", title))
                .unwrap_or_default(),
            selection
                .document_path
                .as_deref()
                .map(|path| format!("\n路径：{}", path))
                .unwrap_or_default(),
            selection.from,
            selection.to,
            selection.markdown
        ));
    }

    if !input.context.images.is_empty() {
        prompt.push_str("\n\n用户附加的图片：");
        for image in &input.context.images {
            prompt.push_str(&format!(
                "\n\n图片：{}\n媒体类型：{}\n大小：{} bytes\n内容哈希：{}\n\n```base64\n{}\n```",
                image.filename,
                image.media_type,
                image.size,
                image.content_hash,
                image.base64_data
            ));
        }
    }

    if !input.context.references.is_empty() {
        prompt.push_str("\n\n用户通过 @ 明确引用的工作区文件：");
        for reference in &input.context.references {
            prompt.push_str(&format!(
                "\n\n引用：{}\n路径：{}\n\n```markdown\n{}\n```",
                reference.title, reference.path, reference.markdown
            ));
        }
    }

    prompt
}

fn run_command_text(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "无法启动本地 AI 助手".to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "本地 AI 助手调用失败".to_string()
        } else {
            stderr
        });
    }

    if stdout.is_empty() {
        Ok(stderr)
    } else {
        Ok(stdout)
    }
}

fn parse_claude_stream_json_text(output: &str) -> String {
    let mut text = String::new();

    for line in output.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        if let Some(content) = value.get("content").and_then(|content| content.as_str()) {
            text.push_str(content);
        }

        if let Some(message) = value.get("message") {
            if let Some(content) = message
                .get("content")
                .and_then(|content| content.as_array())
            {
                for block in content {
                    if let Some(block_text) = block.get("text").and_then(|text| text.as_str()) {
                        text.push_str(block_text);
                    }
                }
            }
        }
    }

    if text.trim().is_empty() {
        output.trim().to_string()
    } else {
        text
    }
}

fn validate_agent_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn emit_ai_event(app: &AppHandle, event: AiRuntimeEvent) {
    let _ = app.emit("ai:event", event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_context(root: &str) -> AiContextPack {
        AiContextPack {
            document: None,
            images: Vec::new(),
            intent: "chat".to_string(),
            references: Vec::new(),
            selection: None,
            workspace_root_path: root.to_string(),
        }
    }

    #[test]
    fn fake_profile_is_available_and_read_only() {
        let profile = fake_echo_profile();

        assert_eq!(profile.id, "fake-echo");
        assert_eq!(profile.detection.status, "available");
        assert!(profile.capabilities.read_workspace);
        assert!(!profile.capabilities.write_workspace);
        assert!(!profile.capabilities.shell);
    }

    #[test]
    fn fake_profile_exposes_provider_and_model_metadata() {
        let profile = fake_echo_profile();
        let value = serde_json::to_value(profile).expect("profile should serialize");

        assert_eq!(value["providerId"], "local");
        assert_eq!(value["providerLabel"], "Local");
        assert_eq!(value["modelId"], "fake-echo");
        assert_eq!(value["modelLabel"], "fake-echo");
        assert_eq!(value["isTestRuntime"], true);
    }

    #[test]
    fn account_detection_reports_codex_and_claude_metadata() {
        let accounts = build_detected_accounts(
            CommandDetection {
                app_server_supported: true,
                command_path: Some(PathBuf::from("/usr/local/bin/codex")),
                exec_supported: true,
                stream_json_supported: false,
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection {
                app_server_supported: false,
                command_path: Some(PathBuf::from("/usr/local/bin/claude")),
                exec_supported: false,
                stream_json_supported: true,
                version: Some("2.1.161 (Claude Code)".to_string()),
            },
        );

        let codex = accounts
            .iter()
            .find(|account| account.id == "codex")
            .expect("codex account should be reported");
        let claude = accounts
            .iter()
            .find(|account| account.id == "claude")
            .expect("claude account should be reported");

        assert_eq!(codex.status, "connected");
        assert_eq!(codex.transport.as_deref(), Some("app-server"));
        assert_eq!(codex.version.as_deref(), Some("codex-cli 0.130.0"));
        assert_eq!(codex.provider_id, "codex");
        assert_eq!(claude.status, "connected");
        assert_eq!(claude.transport.as_deref(), Some("stream-json"));
        assert!(codex.models.is_empty());
        assert!(claude.models.is_empty());
    }

    #[test]
    fn detected_model_profiles_are_available_when_call_bridge_exists() {
        let accounts = build_detected_accounts(
            CommandDetection {
                app_server_supported: true,
                command_path: Some(PathBuf::from("/usr/local/bin/codex")),
                exec_supported: true,
                stream_json_supported: false,
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection::default(),
        );
        let profiles = detected_model_profiles(&accounts);

        let profile = profiles
            .iter()
            .find(|profile| profile.id == "codex:local")
            .expect("codex model profile should be generated");

        assert_eq!(profile.kind, "codex_app_server");
        assert_eq!(profile.provider_label, "Codex");
        assert_eq!(profile.detection.status, "available");
        assert!(!profile.is_test_runtime);
    }

    #[test]
    fn parses_codex_model_list_response_without_hardcoded_names() {
        let output = r#"{"id":2,"result":{"data":[{"id":"gpt-5.4","model":"gpt-5.4","displayName":"GPT-5.4","hidden":false},{"id":"gpt-5.5","model":"gpt-5.5","displayName":"GPT-5.5","hidden":false}],"nextCursor":null}}"#;
        let models = parse_codex_model_list_response(output).expect("model list should parse");

        assert_eq!(
            models,
            vec![
                AiDetectedModel {
                    available: true,
                    id: "gpt-5.4".to_string(),
                    label: "GPT-5.4".to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                },
                AiDetectedModel {
                    available: true,
                    id: "gpt-5.5".to_string(),
                    label: "GPT-5.5".to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                },
            ]
        );
    }

    #[test]
    fn parses_codex_model_list_uses_model_field_and_filters_hidden() {
        let output = r#"{"method":"remoteControl/status/changed","params":{"status":"ready"}}
{"id":1,"result":{"userAgent":"codex-cli"}}
{"id":2,"result":{"data":[{"id":"alias-id","model":"callable-model","displayName":"Callable","hidden":false},{"id":"hidden-id","model":"hidden-model","displayName":"Hidden","hidden":true},{"id":"fallback-id","displayName":"Fallback","hidden":false}],"nextCursor":null}}"#;
        let models = parse_codex_model_list_response(output).expect("model list should parse");

        assert_eq!(
            models
                .iter()
                .map(|model| (model.id.as_str(), model.label.as_str()))
                .collect::<Vec<_>>(),
            vec![("callable-model", "Callable"), ("fallback-id", "Fallback")]
        );
    }

    #[test]
    fn reports_codex_model_list_json_rpc_error() {
        let output = r#"{"id":2,"error":{"code":-32601,"message":"Method not found"}}"#;
        let error = parse_codex_model_list_response(output).expect_err("error should surface");

        assert!(error.contains("Method not found"));
    }

    #[test]
    fn serializes_structured_runtime_events_for_frontend() {
        let tool_event = serde_json::to_value(AiRuntimeEvent::ToolStarted {
            input: serde_json::json!({"command": "pnpm test"}),
            parent_tool_call_id: None,
            session_id: "ai-1".to_string(),
            tool_call_id: "tool-1".to_string(),
            tool_name: "Bash".to_string(),
        })
        .expect("tool event should serialize");
        let usage_event = serde_json::to_value(AiRuntimeEvent::UsageUpdated {
            cache_read_tokens: Some(3),
            cache_write_tokens: Some(4),
            input_tokens: 10,
            model: Some("gpt-5.5".to_string()),
            output_tokens: 20,
            session_id: "ai-1".to_string(),
            total_cost_usd: Some(0.0),
        })
        .expect("usage event should serialize");

        assert_eq!(tool_event["type"], "toolStarted");
        assert_eq!(tool_event["sessionId"], "ai-1");
        assert_eq!(tool_event["toolCallId"], "tool-1");
        assert_eq!(tool_event["toolName"], "Bash");
        assert_eq!(tool_event["input"]["command"], "pnpm test");
        assert_eq!(usage_event["type"], "usageUpdated");
        assert_eq!(usage_event["inputTokens"], 10);
        assert_eq!(usage_event["cacheReadTokens"], 3);
        assert_eq!(usage_event["totalCostUsd"], 0.0);
    }

    #[test]
    fn maps_codex_notifications_to_runtime_events() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "item/agentMessage/delta",
                "params": {
                    "itemId": "msg-1",
                    "delta": "hello"
                }
            }),
        );
        let tool_events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "item/started",
                "params": {
                    "item": {
                        "type": "commandExecution",
                        "id": "cmd-1",
                        "command": "pnpm test",
                        "cwd": "/repo",
                        "status": "inProgress"
                    }
                }
            }),
        );
        let usage_events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "thread/tokenUsage/updated",
                "params": {
                    "tokenUsage": {
                        "total": {
                            "inputTokens": 10,
                            "outputTokens": 20,
                            "cachedInputTokens": 3
                        }
                    }
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::MessageDelta {
                session_id,
                message_id,
                delta
            }) if session_id == "ai-1" && message_id == "msg-1" && delta == "hello"
        ));
        assert!(matches!(
            tool_events.first(),
            Some(AiRuntimeEvent::ToolStarted {
                tool_call_id,
                tool_name,
                input,
                ..
            }) if tool_call_id == "cmd-1"
                && tool_name == "Bash"
                && input.get("command").and_then(|value| value.as_str()) == Some("pnpm test")
        ));
        assert!(matches!(
            usage_events.first(),
            Some(AiRuntimeEvent::UsageUpdated {
                input_tokens: 10,
                output_tokens: 20,
                cache_read_tokens: Some(3),
                ..
            })
        ));
    }

    #[test]
    fn maps_codex_approval_requests_to_permission_prompts() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "id": 42,
                "method": "item/commandExecution/requestApproval",
                "params": {
                    "itemId": "cmd-1",
                    "reason": "needs write access",
                    "command": "echo hi > out.txt",
                    "cwd": "/repo"
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::PermissionPrompt {
                request_id,
                tool_call_id,
                tool_name,
                tool_input,
                reason,
                ..
            }) if request_id == "42"
                && tool_call_id == "cmd-1"
                && tool_name == "Bash"
                && reason == "needs write access"
                && tool_input.get("command").and_then(|value| value.as_str()) == Some("echo hi > out.txt")
                && tool_input.get("cwd").and_then(|value| value.as_str()) == Some("/repo")
        ));
    }

    #[test]
    fn maps_codex_error_notification_nested_message() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "error",
                "params": {
                    "error": {
                        "message": "upstream failed"
                    },
                    "willRetry": false
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::RunState {
                state,
                error: Some(message),
                ..
            }) if state == "failed" && message == "upstream failed"
        ));
    }

    #[test]
    fn parses_claude_stream_json_text_blocks() {
        let output = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"你好"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"，世界"}]}}"#;

        assert_eq!(parse_claude_stream_json_text(output), "你好，世界");
    }

    #[test]
    fn maps_claude_stream_json_to_runtime_events() {
        let assistant_events = map_claude_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "type": "assistant",
                "message": {
                    "id": "msg-1",
                    "model": "claude-sonnet-4-5",
                    "content": [
                        {"type": "text", "text": "hello"},
                        {"type": "tool_use", "id": "tool-1", "name": "Read", "input": {"file_path": "README.md"}}
                    ]
                }
            }),
        );
        let tool_result_events = map_claude_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "type": "user",
                "message": {
                    "content": [
                        {"type": "tool_result", "tool_use_id": "tool-1", "content": "file text", "is_error": false}
                    ]
                }
            }),
        );
        let usage_events = map_claude_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "type": "result",
                "subtype": "success",
                "total_cost_usd": 0.01,
                "usage": {
                    "input_tokens": 11,
                    "output_tokens": 22,
                    "cache_read_input_tokens": 3,
                    "cache_creation_input_tokens": 4
                }
            }),
        );

        assert!(assistant_events.iter().any(|event| matches!(
            event,
            AiRuntimeEvent::MessageDelta {
                message_id,
                delta,
                ..
            } if message_id == "msg-1" && delta == "hello"
        )));
        assert!(assistant_events.iter().any(|event| matches!(
            event,
            AiRuntimeEvent::ToolStarted {
                tool_call_id,
                tool_name,
                input,
                ..
            } if tool_call_id == "tool-1"
                && tool_name == "Read"
                && input.get("file_path").and_then(|value| value.as_str()) == Some("README.md")
        )));
        assert!(tool_result_events.iter().any(|event| matches!(
            event,
            AiRuntimeEvent::ToolCompleted {
                tool_call_id,
                output,
                status,
                ..
            } if tool_call_id == "tool-1"
                && status == "success"
                && output.get("content").and_then(|value| value.as_str()) == Some("file text")
        )));
        assert!(usage_events.iter().any(|event| matches!(
            event,
            AiRuntimeEvent::UsageUpdated {
                input_tokens: 11,
                output_tokens: 22,
                cache_read_tokens: Some(3),
                cache_write_tokens: Some(4),
                total_cost_usd: Some(cost),
                ..
            } if (cost - 0.01).abs() < f64::EPSILON
        )));
        assert!(usage_events.iter().any(|event| matches!(
            event,
            AiRuntimeEvent::TurnCompleted {
                cancelled: false,
                ..
            }
        )));
    }

    #[test]
    fn maps_claude_partial_and_permission_events() {
        let partial_events = map_claude_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "type": "stream_event",
                "event": {
                    "type": "content_block_delta",
                    "delta": {
                        "type": "text_delta",
                        "text": "streamed"
                    }
                }
            }),
        );
        let permission_events = map_claude_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "type": "control_request",
                "request_id": "req-1",
                "request": {
                    "subtype": "permission_prompt",
                    "tool_use_id": "tool-2",
                    "tool_name": "Bash",
                    "tool_input": {"command": "rm file"},
                    "reason": "dangerous command"
                }
            }),
        );

        assert!(matches!(
            partial_events.first(),
            Some(AiRuntimeEvent::MessageDelta {
                delta,
                ..
            }) if delta == "streamed"
        ));
        assert!(matches!(
            permission_events.first(),
            Some(AiRuntimeEvent::PermissionPrompt {
                request_id,
                tool_call_id,
                tool_name,
                tool_input,
                reason,
                ..
            }) if request_id == "req-1"
                && tool_call_id == "tool-2"
                && tool_name == "Bash"
                && reason == "dangerous command"
                && tool_input.get("command").and_then(|value| value.as_str()) == Some("rm file")
        ));
    }

    #[test]
    fn builds_claude_stream_json_user_payload() {
        let payload = build_claude_user_payload("hello");

        assert_eq!(payload["type"], "user");
        assert!(payload["uuid"].as_str().is_some());
        assert_eq!(payload["message"]["role"], "user");
        assert_eq!(payload["message"]["content"], "hello");
    }

    #[test]
    fn builds_claude_permission_response_shapes() {
        let allow = build_claude_permission_response(&RespondAiPermissionInput {
            behavior: "allow".to_string(),
            deny_message: None,
            interrupt: None,
            request_id: "req-1".to_string(),
            session_id: "ai-1".to_string(),
            updated_input: Some(serde_json::json!({"command": "pwd"})),
            updated_permissions: Some(vec![serde_json::json!({"type": "allow"})]),
        })
        .expect("allow response should build");
        let deny = build_claude_permission_response(&RespondAiPermissionInput {
            behavior: "deny".to_string(),
            deny_message: Some("no".to_string()),
            interrupt: Some(true),
            request_id: "req-1".to_string(),
            session_id: "ai-1".to_string(),
            updated_input: None,
            updated_permissions: None,
        })
        .expect("deny response should build");

        assert_eq!(allow["behavior"], "allow");
        assert_eq!(allow["updatedInput"]["command"], "pwd");
        assert!(allow["updatedPermissions"].as_array().is_some());
        assert_eq!(deny["behavior"], "deny");
        assert_eq!(deny["message"], "no");
        assert_eq!(deny["interrupt"], true);
    }

    fn test_conversation_record(id: &str, title: &str, updated_at: u128) -> AiConversationRecord {
        AiConversationRecord {
            created_at: updated_at,
            document_path: None,
            document_title: None,
            id: id.to_string(),
            messages: vec![AiConversationMessage {
                content: title.to_string(),
                images: Vec::new(),
                id: format!("{id}-user"),
                references: Vec::new(),
                role: "user".to_string(),
                selection: None,
            }],
            permissions: Vec::new(),
            profile_id: "codex:local".to_string(),
            profile_label: "Codex".to_string(),
            provider_id: "codex".to_string(),
            provider_label: "Codex".to_string(),
            images: Vec::new(),
            references: Vec::new(),
            run_state: None,
            thinking: Vec::new(),
            title: title.to_string(),
            tools: Vec::new(),
            updated_at,
            usage: None,
        }
    }

    #[test]
    fn persists_ai_conversations_inside_workspace_private_directory() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let root_path = temp_dir.path().to_string_lossy().to_string();
        let record = AiConversationRecord {
            created_at: 100,
            document_path: Some("guide.md".to_string()),
            document_title: Some("指南".to_string()),
            id: "conversation-1".to_string(),
            messages: vec![
                AiConversationMessage {
                    content: "总结".to_string(),
                    images: vec![AiContextImage {
                        base64_data: "aW1hZ2UtYnl0ZXM=".to_string(),
                        content_hash: "fnv1a-image".to_string(),
                        filename: "diagram.png".to_string(),
                        id: "image-1".to_string(),
                        media_type: "image/png".to_string(),
                        size: 11,
                    }],
                    id: "user-1".to_string(),
                    references: Vec::new(),
                    role: "user".to_string(),
                    selection: Some(AiContextSelection {
                        document_path: Some("/repo/guide.md".to_string()),
                        document_title: Some("指南".to_string()),
                        from: 2,
                        markdown: "选区".to_string(),
                        to: 4,
                    }),
                },
                AiConversationMessage {
                    content: "好的".to_string(),
                    images: Vec::new(),
                    id: "assistant-1".to_string(),
                    references: Vec::new(),
                    role: "assistant".to_string(),
                    selection: None,
                },
            ],
            permissions: Vec::new(),
            profile_id: "claude:local".to_string(),
            profile_label: "Claude Code".to_string(),
            provider_id: "claude".to_string(),
            provider_label: "Claude".to_string(),
            images: vec![AiContextImage {
                base64_data: "aW1hZ2UtYnl0ZXM=".to_string(),
                content_hash: "fnv1a-image".to_string(),
                filename: "diagram.png".to_string(),
                id: "image-1".to_string(),
                media_type: "image/png".to_string(),
                size: 11,
            }],
            references: vec![AiContextReference {
                content_hash: "fnv1a-ref".to_string(),
                markdown: "# 研究记录".to_string(),
                modified_at: Some(10),
                path: "/repo/notes/research.md".to_string(),
                relative_path: "notes/research.md".to_string(),
                source: "mention".to_string(),
                title: "研究记录".to_string(),
            }],
            run_state: None,
            thinking: vec![serde_json::json!({
                "id": "thinking-1",
                "content": "先检查当前文档"
            })],
            title: "总结".to_string(),
            tools: Vec::new(),
            updated_at: 200,
            usage: Some(serde_json::json!({
                "inputTokens": 1,
                "outputTokens": 2
            })),
        };

        save_ai_conversation(root_path.clone(), record.clone()).expect("保存会话失败");

        let saved_path = temp_dir
            .path()
            .join(".madora")
            .join("ai-sessions")
            .join("conversation-1.json");
        assert!(saved_path.is_file());

        let history = list_ai_conversations(root_path.clone()).expect("读取历史失败");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, "conversation-1");
        assert_eq!(history[0].title, "总结");
        assert_eq!(history[0].message_count, 2);

        let restored =
            read_ai_conversation(root_path, "conversation-1".to_string()).expect("恢复会话失败");
        assert_eq!(restored, record);
    }

    #[test]
    fn lists_ai_conversations_by_recent_update_and_rejects_invalid_ids() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let root_path = temp_dir.path().to_string_lossy().to_string();
        let first = test_conversation_record("older", "Older", 100);
        let second = test_conversation_record("newer", "Newer", 200);

        save_ai_conversation(root_path.clone(), first).expect("保存旧会话失败");
        save_ai_conversation(root_path.clone(), second).expect("保存新会话失败");

        let history = list_ai_conversations(root_path.clone()).expect("读取历史失败");
        assert_eq!(
            history
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["newer", "older"]
        );

        let error = read_ai_conversation(root_path, "../outside".to_string())
            .expect_err("非法会话 ID 应失败");
        assert!(error.contains("会话 ID"));
    }

    #[test]
    fn validates_existing_directory_as_agent_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let root = validate_agent_root(&temp_dir.path().to_string_lossy()).expect("校验工作区失败");

        assert_eq!(root, temp_dir.path().canonicalize().unwrap());
    }

    #[test]
    fn rejects_missing_agent_root() {
        let error =
            validate_agent_root("/definitely/missing/refinex/wiki").expect_err("缺失路径应失败");

        assert!(error.contains("工作区路径不可用"));
    }

    #[test]
    fn starts_and_stops_session() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let mut runtime = AgentRuntime::default();
        let session = create_session_info(
            "fake-echo".to_string(),
            temp_dir.path().canonicalize().unwrap(),
        );
        runtime.insert_session(session.clone(), None, None);

        assert!(runtime.session(&session.session_id).is_some());
        runtime
            .stop_session(&session.session_id)
            .expect("停止 session 失败");
        assert!(runtime.session(&session.session_id).is_none());
    }

    #[test]
    fn fake_response_includes_document_context_when_available() {
        let input = SendAiPromptInput {
            context: AiContextPack {
                document: Some(AiContextDocument {
                    content_hash: "fnv1a-abc".to_string(),
                    dirty: false,
                    markdown: "# 指南".to_string(),
                    modified_at: None,
                    path: "/repo/guide.md".to_string(),
                    title: "指南".to_string(),
                }),
                images: Vec::new(),
                intent: "summarize-document".to_string(),
                references: vec![AiContextReference {
                    content_hash: "fnv1a-ref".to_string(),
                    markdown: "# 研究记录".to_string(),
                    modified_at: Some(10),
                    path: "/repo/notes/research.md".to_string(),
                    relative_path: "notes/research.md".to_string(),
                    source: "mention".to_string(),
                    title: "研究记录".to_string(),
                }],
                selection: None,
                workspace_root_path: "/repo".to_string(),
            },
            prompt: "总结此页面".to_string(),
            session_id: "ai-1".to_string(),
        };

        assert_eq!(
            build_fake_response(&input),
            "Echo: 总结此页面\n\nContext: 指南 (fnv1a-abc)"
        );
    }

    #[test]
    fn assistant_prompt_includes_mentioned_workspace_references() {
        let input = SendAiPromptInput {
            context: AiContextPack {
                document: Some(AiContextDocument {
                    content_hash: "fnv1a-abc".to_string(),
                    dirty: false,
                    markdown: "# 指南".to_string(),
                    modified_at: None,
                    path: "/repo/guide.md".to_string(),
                    title: "指南".to_string(),
                }),
                images: vec![AiContextImage {
                    base64_data: "aW1hZ2UtYnl0ZXM=".to_string(),
                    content_hash: "fnv1a-image".to_string(),
                    filename: "diagram.png".to_string(),
                    id: "image-1".to_string(),
                    media_type: "image/png".to_string(),
                    size: 11,
                }],
                intent: "chat".to_string(),
                references: vec![AiContextReference {
                    content_hash: "fnv1a-ref".to_string(),
                    markdown: "# 研究记录".to_string(),
                    modified_at: Some(10),
                    path: "/repo/notes/research.md".to_string(),
                    relative_path: "notes/research.md".to_string(),
                    source: "mention".to_string(),
                    title: "研究记录".to_string(),
                }],
                selection: Some(AiContextSelection {
                    document_path: Some("/repo/guide.md".to_string()),
                    document_title: Some("指南".to_string()),
                    from: 2,
                    markdown: "选中的段落".to_string(),
                    to: 8,
                }),
                workspace_root_path: "/repo".to_string(),
            },
            prompt: "结合资料改写".to_string(),
            session_id: "ai-1".to_string(),
        };
        let prompt = build_assistant_prompt(&input);

        assert!(prompt.contains("当前 Markdown 文档：指南"));
        assert!(prompt.contains("用户当前选中的 Markdown 片段：指南"));
        assert!(prompt.contains("选中的段落"));
        assert!(prompt.contains("用户附加的图片"));
        assert!(prompt.contains("图片：diagram.png"));
        assert!(prompt.contains("aW1hZ2UtYnl0ZXM="));
        assert!(prompt.contains("用户通过 @ 明确引用的工作区文件"));
        assert!(prompt.contains("引用：研究记录"));
        assert!(prompt.contains("# 研究记录"));
    }

    #[test]
    fn list_profiles_requires_valid_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let profiles = list_ai_agent_profiles(temp_dir.path().to_string_lossy().to_string())
            .expect("读取 profile 失败");

        assert!(profiles
            .iter()
            .any(|profile| profile == &fake_echo_profile()));
        assert!(profiles
            .iter()
            .all(|profile| !profile.provider_id.is_empty() && !profile.model_id.is_empty()));
    }

    #[test]
    fn normalizes_session_start_options_from_frontend_payload() {
        let input = StartAiSessionInput {
            agent_mode: Some("plan".to_string()),
            codex_thinking: Some("xhigh".to_string()),
            context: test_context("/repo"),
            extended_thinking: Some(true),
            model_id: Some("gpt-5.4-codex".to_string()),
            profile_id: "codex:local".to_string(),
            root_path: "/repo".to_string(),
        };

        assert_eq!(
            session_start_options(&input),
            AiSessionStartOptions {
                agent_mode: Some("plan".to_string()),
                codex_thinking: Some("xhigh".to_string()),
                extended_thinking: true,
                model_id: Some("gpt-5.4-codex".to_string()),
            }
        );
    }

    #[test]
    fn rejects_invalid_session_start_options() {
        let input = StartAiSessionInput {
            agent_mode: Some("delete-everything".to_string()),
            codex_thinking: Some("max".to_string()),
            context: test_context("/repo"),
            extended_thinking: Some(false),
            model_id: Some("bad model; rm -rf".to_string()),
            profile_id: "codex:local".to_string(),
            root_path: "/repo".to_string(),
        };

        assert_eq!(
            session_start_options(&input),
            AiSessionStartOptions {
                agent_mode: None,
                codex_thinking: None,
                extended_thinking: false,
                model_id: None,
            }
        );
    }

    #[test]
    fn builds_codex_app_server_args_with_model_and_reasoning() {
        let args = build_codex_app_server_args(&AiSessionStartOptions {
            agent_mode: Some("plan".to_string()),
            codex_thinking: Some("xhigh".to_string()),
            extended_thinking: false,
            model_id: Some("gpt-5.4-codex".to_string()),
        });

        assert_eq!(
            args,
            vec![
                "app-server",
                "-c",
                "service_tier=\"fast\"",
                "-c",
                "model=\"gpt-5.4-codex\"",
                "-c",
                "model_reasoning_effort=\"xhigh\"",
            ]
        );
    }

    #[test]
    fn builds_claude_stream_args_with_model_thinking_and_plan_mode() {
        let args = build_claude_stream_args(
            "/repo",
            &AiSessionStartOptions {
                agent_mode: Some("plan".to_string()),
                codex_thinking: None,
                extended_thinking: true,
                model_id: Some("opus".to_string()),
            },
        );

        assert!(args.windows(2).any(|pair| pair == ["--model", "opus"]));
        assert!(args.windows(2).any(|pair| pair == ["--effort", "high"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--permission-mode", "plan"]));
    }

    #[test]
    fn selects_active_anthropic_account_token_for_claude_env() {
        assert_eq!(
            claude_auth_env_var(Some(" oauth-token ")),
            Some(("ANTHROPIC_AUTH_TOKEN", "oauth-token".to_string())),
        );
        assert_eq!(claude_auth_env_var(Some(" ")), None);
        assert_eq!(claude_auth_env_var(None), None);
    }

    #[test]
    fn logs_out_codex_and_verifies_status_like_1code() {
        let mut calls = Vec::new();
        let result = logout_codex_account_with_runner(|args| {
            calls.push(args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>());
            match args {
                ["logout"] => Ok(CodexCliRunResult {
                    exit_code: Some(0),
                    stderr: String::new(),
                    stdout: "logged out".to_string(),
                }),
                ["login", "status"] => Ok(CodexCliRunResult {
                    exit_code: Some(0),
                    stderr: "not logged in".to_string(),
                    stdout: String::new(),
                }),
                _ => Err("unexpected args".to_string()),
            }
        })
        .expect("logout should succeed");

        assert_eq!(calls, vec![vec!["logout"], vec!["login", "status"]]);
        assert_eq!(result.state, "not_logged_in");
        assert!(!result.is_connected);
        assert_eq!(result.logout_exit_code, Some(0));
    }

    #[test]
    fn extracts_codex_login_url_like_1code() {
        assert_eq!(
            extract_first_non_localhost_url(
                "\u{1b}[32mOpen http://localhost:1455 then https://chatgpt.com/auth?code=abc).\u{1b}[0m",
            )
            .as_deref(),
            Some("https://chatgpt.com/auth?code=abc")
        );
        assert_eq!(
            extract_first_non_localhost_url("Open http://127.0.0.1:3000 only"),
            None
        );
    }

    #[test]
    fn context_helper_is_used_by_tests() {
        let context = test_context("/repo");

        assert_eq!(context.workspace_root_path, "/repo");
        assert_eq!(context.intent, "chat");
    }
}

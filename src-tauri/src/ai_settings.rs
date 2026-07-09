use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MCP_HTTP_DISCOVERY_TIMEOUT_SECS: u64 = 3;
const MCP_OAUTH_TIMEOUT_SECS: u64 = 300;
const MCP_OAUTH_CLIENT_NAME: &str = "1code";
const MCP_OAUTH_FALLBACK_CLIENT_NAME: &str = "Codex";
const MCP_GLOBAL_PROJECT_SENTINEL: &str = "__global__";
const ANTHROPIC_ACCOUNTS_PATH: &str = ".madora/anthropic-accounts.json";
const LEGACY_ANTHROPIC_ACCOUNT_ID: &str = "legacy-default";
const CLAUDE_CODE_AUTH_API_URL_ENV: &str = "MADORA_CLAUDE_CODE_AUTH_API_URL";
const CLAUDE_CODE_DESKTOP_TOKEN_ENV: &str = "MADORA_DESKTOP_AUTH_TOKEN";
const CLAUDE_CODE_AUTH_DEFAULT_API_URL: &str = "https://21st.dev";
const CLAUDE_CODE_AUTH_POLL_ATTEMPTS: usize = 10;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillItem {
    pub name: String,
    pub description: String,
    pub source: String,
    pub plugin_name: Option<String>,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCommandItem {
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
    pub source: String,
    pub plugin_name: Option<String>,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCustomAgentItem {
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub tools: Vec<String>,
    pub disallowed_tools: Vec<String>,
    pub model: Option<String>,
    pub source: String,
    pub plugin_name: Option<String>,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiPluginComponent {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiPluginComponents {
    pub commands: Vec<AiPluginComponent>,
    pub skills: Vec<AiPluginComponent>,
    pub agents: Vec<AiPluginComponent>,
    pub mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiPluginItem {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub path: String,
    pub source: String,
    pub marketplace: String,
    pub category: Option<String>,
    pub homepage: Option<String>,
    pub tags: Vec<String>,
    pub is_disabled: bool,
    pub components: AiPluginComponents,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiMcpServerItem {
    pub name: String,
    pub provider: String,
    pub group_name: String,
    pub project_path: Option<String>,
    pub source: String,
    pub status: String,
    pub enabled: bool,
    pub connection_type: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env_keys: Vec<String>,
    pub auth_type: Option<String>,
    pub auth_status: Option<String>,
    pub has_auth_header: bool,
    pub needs_auth: bool,
    pub plugin_name: Option<String>,
    pub error: Option<String>,
    pub tools: Vec<AiMcpToolInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiMcpToolInfo {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAnthropicAccountItem {
    pub id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub connected_at: Option<String>,
    pub last_used_at: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiClaudeCodeAuthStartResult {
    pub sandbox_id: String,
    pub sandbox_url: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiClaudeCodeAuthStatus {
    pub state: String,
    pub oauth_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiClaudeCodeAuthSuccessResult {
    pub success: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiAnthropicAccountsStore {
    active_account_id: Option<String>,
    accounts: Vec<StoredAnthropicAccount>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAnthropicAccount {
    id: String,
    email: Option<String>,
    display_name: Option<String>,
    connected_at: Option<String>,
    last_used_at: Option<String>,
}

trait AnthropicAccountSecretStore {
    fn delete(&self, account_id: &str) -> Result<(), String>;
    fn read(&self, account_id: &str) -> Result<Option<String>, String>;
    fn read_legacy_override_token(&self) -> Result<Option<String>, String>;
    fn save(&self, account_id: &str, token: &str) -> Result<(), String>;
}

struct KeyringAnthropicAccountSecretStore;

impl AnthropicAccountSecretStore for KeyringAnthropicAccountSecretStore {
    fn delete(&self, account_id: &str) -> Result<(), String> {
        crate::ai_secret::delete_ai_provider_secret(anthropic_account_secret_provider_id(
            account_id,
        )?)
        .map(|_| ())
    }

    fn read(&self, account_id: &str) -> Result<Option<String>, String> {
        crate::ai_secret::read_ai_provider_secret(&anthropic_account_secret_provider_id(
            account_id,
        )?)
    }

    fn read_legacy_override_token(&self) -> Result<Option<String>, String> {
        crate::ai_secret::read_ai_provider_secret("anthropic-override")
    }

    fn save(&self, account_id: &str, token: &str) -> Result<(), String> {
        crate::ai_secret::save_ai_provider_secret(
            anthropic_account_secret_provider_id(account_id)?,
            token.to_string(),
        )
        .map(|_| ())
    }
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryAnthropicAccountSecretStore {
    legacy_override_token: std::sync::Mutex<Option<String>>,
    tokens: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(test)]
impl AnthropicAccountSecretStore for InMemoryAnthropicAccountSecretStore {
    fn delete(&self, account_id: &str) -> Result<(), String> {
        self.tokens
            .lock()
            .map_err(|_| "Anthropic account secret store lock failed".to_string())?
            .remove(account_id);
        Ok(())
    }

    fn read(&self, account_id: &str) -> Result<Option<String>, String> {
        Ok(self
            .tokens
            .lock()
            .map_err(|_| "Anthropic account secret store lock failed".to_string())?
            .get(account_id)
            .cloned())
    }

    fn read_legacy_override_token(&self) -> Result<Option<String>, String> {
        Ok(self
            .legacy_override_token
            .lock()
            .map_err(|_| "Anthropic legacy secret store lock failed".to_string())?
            .clone())
    }

    fn save(&self, account_id: &str, token: &str) -> Result<(), String> {
        self.tokens
            .lock()
            .map_err(|_| "Anthropic account secret store lock failed".to_string())?
            .insert(account_id.to_string(), token.to_string());
        Ok(())
    }
}

#[cfg(test)]
impl InMemoryAnthropicAccountSecretStore {
    fn save_legacy_override_token(&self, token: &str) -> Result<(), String> {
        *self
            .legacy_override_token
            .lock()
            .map_err(|_| "Anthropic legacy secret store lock failed".to_string())? =
            Some(token.to_string());
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct InstalledPlugin {
    name: String,
    version: String,
    description: Option<String>,
    path: PathBuf,
    source: String,
    marketplace: String,
    category: Option<String>,
    homepage: Option<String>,
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct McpOAuthMetadata {
    authorization_endpoint: String,
    token_endpoint: String,
    registration_endpoint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McpOAuthClientRegistration {
    client_id: String,
    client_secret: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McpOAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Debug, Clone)]
struct ParsedMarkdown {
    frontmatter: BTreeMap<String, String>,
    body: String,
}

fn list_ai_skills_for_paths(
    home: &Path,
    project: Option<&Path>,
) -> Result<Vec<AiSkillItem>, String> {
    let mut skills = Vec::new();

    if let Some(project_path) = project {
        skills.extend(scan_skills_directory(
            &project_path.join(".claude/skills"),
            "project",
            None,
            Some(project_path),
            home,
        )?);
    }

    skills.extend(scan_skills_directory(
        &home.join(".claude/skills"),
        "user",
        None,
        None,
        home,
    )?);

    for plugin in enabled_plugins(home)? {
        let mut plugin_skills = scan_skills_directory(
            &plugin.path.join("skills"),
            "plugin",
            Some(plugin.source.as_str()),
            None,
            home,
        )?;
        skills.append(&mut plugin_skills);
    }

    Ok(skills)
}

fn list_ai_commands_for_paths(
    home: &Path,
    project: Option<&Path>,
) -> Result<Vec<AiCommandItem>, String> {
    let mut commands = Vec::new();

    if let Some(project_path) = project {
        commands.extend(scan_commands_directory(
            &project_path.join(".claude/commands"),
            "project",
            "",
            None,
            Some(project_path),
            home,
        )?);
    }

    commands.extend(scan_commands_directory(
        &home.join(".claude/commands"),
        "user",
        "",
        None,
        None,
        home,
    )?);

    for plugin in enabled_plugins(home)? {
        let mut plugin_commands = scan_commands_directory(
            &plugin.path.join("commands"),
            "plugin",
            "",
            Some(plugin.source.as_str()),
            None,
            home,
        )?;
        commands.append(&mut plugin_commands);
    }

    Ok(commands)
}

fn list_ai_custom_agents_for_paths(
    home: &Path,
    project: Option<&Path>,
) -> Result<Vec<AiCustomAgentItem>, String> {
    let mut agents = Vec::new();

    if let Some(project_path) = project {
        agents.extend(scan_agents_directory(
            &project_path.join(".claude/agents"),
            "project",
            None,
            Some(project_path),
            home,
        )?);
    }

    agents.extend(scan_agents_directory(
        &home.join(".claude/agents"),
        "user",
        None,
        None,
        home,
    )?);

    for plugin in enabled_plugins(home)? {
        let mut plugin_agents = scan_agents_directory(
            &plugin.path.join("agents"),
            "plugin",
            Some(plugin.source.as_str()),
            None,
            home,
        )?;
        agents.append(&mut plugin_agents);
    }

    Ok(agents)
}

fn list_ai_plugins_for_home(home: &Path) -> Result<Vec<AiPluginItem>, String> {
    let enabled = enabled_plugin_sources(home)?;
    let plugins = discover_installed_plugins(home)?;

    plugins
        .into_iter()
        .map(|plugin| {
            Ok(AiPluginItem {
                components: AiPluginComponents {
                    agents: scan_plugin_agents(&plugin.path.join("agents"))?,
                    commands: scan_plugin_commands(&plugin.path.join("commands"), "")?,
                    mcp_servers: discover_plugin_mcp_server_names(&plugin.path.join(".mcp.json"))?,
                    skills: scan_plugin_skills(&plugin.path.join("skills"))?,
                },
                is_disabled: !enabled.contains(&plugin.source),
                category: plugin.category,
                description: plugin.description,
                homepage: plugin.homepage,
                marketplace: plugin.marketplace,
                name: plugin.name,
                path: plugin.path.to_string_lossy().to_string(),
                source: plugin.source,
                tags: plugin.tags,
                version: plugin.version,
            })
        })
        .collect()
}

fn list_ai_mcp_servers_for_paths(
    home: &Path,
    project: Option<&Path>,
) -> Result<Vec<AiMcpServerItem>, String> {
    let mut servers = Vec::new();

    for path in [
        home.join(".claude.json"),
        home.join(".claude/.claude.json"),
        home.join(".claude/mcp.json"),
    ] {
        servers.extend(read_mcp_servers_from_config_file(
            &path, "Global", None, "global", None, None,
        )?);

        if let Some(project_path) = project {
            servers.extend(read_project_mcp_servers_from_config_file(
                &path,
                project_path,
            )?);
        }
    }

    if let Some(project_path) = project {
        let group_name = project_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Project");
        servers.extend(read_mcp_servers_from_config_file(
            &project_path.join(".mcp.json"),
            group_name,
            Some(project_path),
            "project",
            None,
            None,
        )?);
    }

    let approved_plugin_mcp_servers = approved_plugin_mcp_server_ids(home)?;
    for plugin in enabled_plugins(home)? {
        let mut plugin_servers = read_mcp_servers_from_config_file(
            &plugin.path.join(".mcp.json"),
            &format!("Plugin: {}", plugin.source),
            None,
            "plugin",
            Some(plugin.source.as_str()),
            Some(&approved_plugin_mcp_servers),
        )?;

        servers.append(&mut plugin_servers);
    }

    servers.extend(list_codex_mcp_servers());

    Ok(servers)
}

fn create_ai_skill_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    content: &str,
) -> Result<String, String> {
    let skill_name = safe_slug(name)?;
    let skill_path = writable_root(home, project, source, "skills")?
        .join(&skill_name)
        .join("SKILL.md");
    if skill_path.exists() {
        return Err("AI skill already exists".to_string());
    }

    write_text_file(
        &skill_path,
        &generate_markdown_with_frontmatter(&skill_name, description, content, None)?,
    )?;

    Ok(skill_path.to_string_lossy().to_string())
}

fn update_ai_skill_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    content: &str,
) -> Result<String, String> {
    let skill_name = safe_slug(name)?;
    let skill_path = writable_root(home, project, source, "skills")?
        .join(&skill_name)
        .join("SKILL.md");
    if !skill_path.is_file() {
        return Err("AI skill does not exist".to_string());
    }

    write_text_file(
        &skill_path,
        &generate_markdown_with_frontmatter(&skill_name, description, content, None)?,
    )?;

    Ok(skill_path.to_string_lossy().to_string())
}

fn delete_ai_skill_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
) -> Result<(), String> {
    let skill_name = safe_slug(name)?;
    let skill_dir = writable_root(home, project, source, "skills")?.join(&skill_name);
    let skill_path = skill_dir.join("SKILL.md");
    if !skill_path.is_file() {
        return Err("AI skill does not exist".to_string());
    }

    fs::remove_file(&skill_path).map_err(|_| "无法删除 AI skill".to_string())?;
    let _ = fs::remove_dir(&skill_dir);

    Ok(())
}

fn create_ai_command_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    content: &str,
    argument_hint: Option<&str>,
) -> Result<String, String> {
    let command_path = command_markdown_path(home, project, source, name)?;
    if command_path.exists() {
        return Err("AI command already exists".to_string());
    }
    let command_name = command_name_from_path(name)?;

    write_text_file(
        &command_path,
        &generate_markdown_with_frontmatter(&command_name, description, content, argument_hint)?,
    )?;

    Ok(command_path.to_string_lossy().to_string())
}

fn update_ai_command_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    content: &str,
    argument_hint: Option<&str>,
) -> Result<String, String> {
    let command_path = command_markdown_path(home, project, source, name)?;
    if !command_path.is_file() {
        return Err("AI command does not exist".to_string());
    }
    let command_name = command_name_from_path(name)?;

    write_text_file(
        &command_path,
        &generate_markdown_with_frontmatter(&command_name, description, content, argument_hint)?,
    )?;

    Ok(command_path.to_string_lossy().to_string())
}

fn delete_ai_command_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
) -> Result<(), String> {
    let command_path = command_markdown_path(home, project, source, name)?;
    if !command_path.is_file() {
        return Err("AI command does not exist".to_string());
    }

    fs::remove_file(&command_path).map_err(|_| "无法删除 AI command".to_string())?;
    remove_empty_parent_dirs(
        command_path.parent(),
        &writable_root(home, project, source, "commands")?,
    );

    Ok(())
}

fn create_ai_custom_agent_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    prompt: &str,
    tools: &[String],
    disallowed_tools: &[String],
    model: Option<&str>,
) -> Result<String, String> {
    let agent_name = safe_slug(name)?;
    let agent_path =
        writable_root(home, project, source, "agents")?.join(format!("{agent_name}.md"));
    if agent_path.exists() {
        return Err("AI custom agent already exists".to_string());
    }

    write_text_file(
        &agent_path,
        &generate_agent_markdown(
            &agent_name,
            description,
            prompt,
            tools,
            disallowed_tools,
            model,
        )?,
    )?;

    Ok(agent_path.to_string_lossy().to_string())
}

fn update_ai_custom_agent_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    description: &str,
    prompt: &str,
    tools: &[String],
    disallowed_tools: &[String],
    model: Option<&str>,
) -> Result<String, String> {
    let agent_name = safe_slug(name)?;
    let agent_path =
        writable_root(home, project, source, "agents")?.join(format!("{agent_name}.md"));
    if !agent_path.is_file() {
        return Err("AI custom agent does not exist".to_string());
    }

    write_text_file(
        &agent_path,
        &generate_agent_markdown(
            &agent_name,
            description,
            prompt,
            tools,
            disallowed_tools,
            model,
        )?,
    )?;

    Ok(agent_path.to_string_lossy().to_string())
}

fn delete_ai_custom_agent_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
) -> Result<(), String> {
    let agent_name = safe_slug(name)?;
    let agent_path =
        writable_root(home, project, source, "agents")?.join(format!("{agent_name}.md"));
    if !agent_path.is_file() {
        return Err("AI custom agent does not exist".to_string());
    }

    fs::remove_file(agent_path).map_err(|_| "无法删除 AI custom agent".to_string())
}

fn create_ai_mcp_server_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    connection_type: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
    env: &BTreeMap<String, String>,
    auth_type: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<String, String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(home, project, source)?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;

    if servers.contains_key(&server_name) {
        return Err("AI MCP server already exists".to_string());
    }

    servers.insert(
        server_name,
        build_mcp_server_config(
            connection_type,
            command,
            args,
            url,
            env,
            auth_type,
            bearer_token,
            None,
        )?,
    );
    write_json_file(&config_path, &config)?;

    Ok(config_path.to_string_lossy().to_string())
}

fn create_codex_mcp_server(
    name: &str,
    connection_type: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
) -> Result<String, String> {
    let server_name = safe_mcp_server_name(name)?;
    let mut cli_args = vec!["mcp".to_string(), "add".to_string(), server_name];

    match connection_type {
        "http" => {
            let url = url
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Codex HTTP MCP server 需要 url".to_string())?;
            ensure_single_line_frontmatter_value(url)?;
            cli_args.push("--url".to_string());
            cli_args.push(url.to_string());
        }
        "stdio" => {
            let command = command
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Codex stdio MCP server 需要 command".to_string())?;
            ensure_single_line_frontmatter_value(command)?;
            cli_args.push("--".to_string());
            cli_args.push(command.to_string());
            cli_args.extend(args.iter().cloned());
        }
        _ => return Err("Codex MCP server connection type 无效".to_string()),
    }

    run_codex_cli_checked(&cli_args, None)?;

    Ok("codex:global".to_string())
}

fn set_ai_mcp_server_enabled_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    enabled: bool,
) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(home, project, source)?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;
    let Some(server) = servers.get_mut(&server_name).and_then(Value::as_object_mut) else {
        return Err("AI MCP server does not exist".to_string());
    };

    server.insert("disabled".to_string(), Value::Bool(!enabled));
    server.remove("enabled");
    write_json_file(&config_path, &config)
}

fn update_ai_mcp_server_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
    connection_type: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
    env: &BTreeMap<String, String>,
    auth_type: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<String, String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(home, project, source)?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;
    let Some(existing_server) = servers.get(&server_name).and_then(Value::as_object) else {
        return Err("AI MCP server does not exist".to_string());
    };
    let disabled = existing_server.get("disabled").cloned();
    let enabled = existing_server.get("enabled").cloned();
    let existing_headers = extract_mcp_headers(existing_server);
    let existing_authorization = extract_mcp_authorization_header(&existing_headers);
    let mut next_server = build_mcp_server_config(
        connection_type,
        command,
        args,
        url,
        env,
        auth_type,
        bearer_token,
        existing_authorization.as_deref(),
    )?;

    if let Some(disabled) = disabled {
        if let Some(object) = next_server.as_object_mut() {
            object.insert("disabled".to_string(), disabled);
        }
    } else if let Some(enabled) = enabled {
        if let Some(object) = next_server.as_object_mut() {
            object.insert("enabled".to_string(), enabled);
        }
    }

    servers.insert(server_name, next_server);
    write_json_file(&config_path, &config)?;

    Ok(config_path.to_string_lossy().to_string())
}

fn delete_ai_mcp_server_for_paths(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(home, project, source)?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;

    if servers.remove(&server_name).is_none() {
        return Err("AI MCP server does not exist".to_string());
    }
    write_json_file(&config_path, &config)
}

fn save_claude_mcp_oauth_tokens_for_paths(
    home: &Path,
    project: Option<&Path>,
    name: &str,
    access_token: &str,
    refresh_token: Option<&str>,
    client_id: Option<&str>,
    expires_at: Option<u64>,
) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(
        home,
        project,
        if project.is_some() {
            "project"
        } else {
            "global"
        },
    )?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;
    let Some(server) = servers.get_mut(&server_name).and_then(Value::as_object_mut) else {
        return Err("AI MCP server does not exist".to_string());
    };
    let url = server
        .get("url")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "MCP OAuth server URL not configured".to_string())?;
    ensure_single_line_frontmatter_value(access_token)?;
    if let Some(refresh_token) = refresh_token {
        ensure_single_line_frontmatter_value(refresh_token)?;
    }
    if let Some(client_id) = client_id {
        ensure_single_line_frontmatter_value(client_id)?;
    }

    let mut headers = server
        .get("headers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    headers.insert(
        "Authorization".to_string(),
        Value::String(format!("Bearer {access_token}")),
    );

    let mut oauth = serde_json::Map::new();
    oauth.insert(
        "accessToken".to_string(),
        Value::String(access_token.to_string()),
    );
    if let Some(refresh_token) = refresh_token {
        oauth.insert(
            "refreshToken".to_string(),
            Value::String(refresh_token.to_string()),
        );
    }
    if let Some(client_id) = client_id {
        oauth.insert("clientId".to_string(), Value::String(client_id.to_string()));
    }
    if let Some(expires_at) = expires_at {
        oauth.insert("expiresAt".to_string(), Value::Number(expires_at.into()));
    }

    server.insert("authType".to_string(), Value::String("oauth".to_string()));
    server.insert(
        "type".to_string(),
        Value::String(
            if url.trim_end_matches('/').ends_with("/sse") {
                "sse"
            } else {
                "http"
            }
            .to_string(),
        ),
    );
    server.insert("headers".to_string(), Value::Object(headers));
    server.insert("_oauth".to_string(), Value::Object(oauth));

    write_json_file(&config_path, &config)
}

fn logout_claude_mcp_server_for_paths(
    home: &Path,
    project: Option<&Path>,
    name: &str,
) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    let config_path = mcp_config_path(
        home,
        project,
        if project.is_some() {
            "project"
        } else {
            "global"
        },
    )?;
    let mut config = read_mcp_config(&config_path)?;
    let servers = ensure_mcp_servers_object(&mut config)?;
    let Some(server) = servers.get_mut(&server_name).and_then(Value::as_object_mut) else {
        return Err("AI MCP server does not exist".to_string());
    };

    if let Some(headers) = server.get_mut("headers").and_then(Value::as_object_mut) {
        let authorization_key = headers
            .keys()
            .find(|key| key.eq_ignore_ascii_case("authorization"))
            .cloned();
        if let Some(key) = authorization_key {
            headers.remove(&key);
        }
        if headers.is_empty() {
            server.remove("headers");
        }
    }
    server.remove("_oauth");

    write_json_file(&config_path, &config)
}

fn delete_codex_mcp_server(name: &str) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    run_codex_cli_checked(
        &["mcp".to_string(), "remove".to_string(), server_name],
        None,
    )?;
    Ok(())
}

fn authenticate_codex_mcp_server(name: &str, project_path: Option<&str>) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    run_codex_cli_checked(
        &["mcp".to_string(), "login".to_string(), server_name],
        project_path,
    )?;
    Ok(())
}

fn logout_codex_mcp_server(name: &str, project_path: Option<&str>) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    run_codex_cli_checked(
        &["mcp".to_string(), "logout".to_string(), server_name],
        project_path,
    )?;
    Ok(())
}

fn authenticate_claude_mcp_server(
    home: &Path,
    project: Option<&Path>,
    name: &str,
) -> Result<(), String> {
    tauri::async_runtime::block_on(start_claude_mcp_oauth_for_paths(
        home,
        project,
        name,
        |auth_url| {
            tauri_plugin_opener::open_url(auth_url, None::<&str>)
                .map_err(|_| "无法打开 MCP OAuth 授权页面".to_string())
        },
    ))
}

async fn start_claude_mcp_oauth_for_paths(
    home: &Path,
    project: Option<&Path>,
    name: &str,
    opener: impl Fn(&str) -> Result<(), String>,
) -> Result<(), String> {
    let server_name = safe_mcp_server_name(name)?;
    let source = if project.is_some() {
        "project"
    } else {
        "global"
    };
    let config_path = mcp_config_path(home, project, source)?;
    let config = read_mcp_config(&config_path)?;
    let server = config
        .get("mcpServers")
        .and_then(Value::as_object)
        .and_then(|servers| servers.get(&server_name))
        .and_then(Value::as_object)
        .ok_or_else(|| "AI MCP server does not exist".to_string())?;
    let url = server
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| "MCP OAuth server URL not configured".to_string())?;
    let callback_listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "无法启动 MCP OAuth callback server".to_string())?;
    let callback_port = callback_listener
        .local_addr()
        .map_err(|_| "无法读取 MCP OAuth callback 端口".to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{callback_port}/callback");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(MCP_HTTP_DISCOVERY_TIMEOUT_SECS))
        .build()
        .map_err(|_| "MCP OAuth client failed".to_string())?;
    let metadata = fetch_mcp_oauth_metadata(&client, url).await?;
    let registration = register_mcp_oauth_client(&client, &metadata, &redirect_uri).await?;
    let code_verifier = generate_mcp_oauth_code_verifier();
    let code_challenge = generate_mcp_oauth_code_challenge(&code_verifier);
    let state = Uuid::new_v4().simple().to_string();
    let auth_url = build_mcp_oauth_authorization_url(
        &metadata.authorization_endpoint,
        &registration.client_id,
        &redirect_uri,
        &state,
        &code_challenge,
    )?;
    let (sender, receiver) = mpsc::channel();
    let expected_state = state.clone();
    std::thread::spawn(move || {
        wait_for_mcp_oauth_callback(callback_listener, expected_state, sender);
    });

    opener(auth_url.as_str())?;

    let code = receiver
        .recv_timeout(Duration::from_secs(MCP_OAUTH_TIMEOUT_SECS))
        .map_err(|_| "MCP OAuth timeout".to_string())??;
    let token = exchange_mcp_oauth_code(
        &client,
        &metadata.token_endpoint,
        &code,
        &code_verifier,
        &registration.client_id,
        registration.client_secret.as_deref(),
        &redirect_uri,
    )
    .await?;
    let expires_at = token
        .expires_in
        .map(|seconds| current_time_millis() + seconds * 1000);

    save_claude_mcp_oauth_tokens_for_paths(
        home,
        project,
        &server_name,
        &token.access_token,
        token.refresh_token.as_deref(),
        Some(&registration.client_id),
        expires_at,
    )
}

async fn fetch_mcp_oauth_metadata(
    client: &reqwest::Client,
    mcp_url: &str,
) -> Result<McpOAuthMetadata, String> {
    let metadata_url = format!(
        "{}/.well-known/oauth-authorization-server",
        get_mcp_base_url(mcp_url)?.trim_end_matches('/')
    );
    let response = client
        .get(metadata_url)
        .send()
        .await
        .map_err(|_| "无法读取 MCP OAuth metadata".to_string())?;
    if !response.status().is_success() {
        return Err("MCP server 未提供 OAuth metadata".to_string());
    }
    response
        .json::<McpOAuthMetadata>()
        .await
        .map_err(|_| "MCP OAuth metadata 格式无效".to_string())
}

async fn register_mcp_oauth_client(
    client: &reqwest::Client,
    metadata: &McpOAuthMetadata,
    redirect_uri: &str,
) -> Result<McpOAuthClientRegistration, String> {
    let Some(endpoint) = metadata.registration_endpoint.as_deref() else {
        return Ok(McpOAuthClientRegistration {
            client_id: MCP_OAUTH_CLIENT_NAME.to_string(),
            client_secret: None,
        });
    };

    match register_mcp_oauth_client_with_name(client, endpoint, redirect_uri, MCP_OAUTH_CLIENT_NAME)
        .await
    {
        Ok(registration) => Ok(registration),
        Err(_) => {
            register_mcp_oauth_client_with_name(
                client,
                endpoint,
                redirect_uri,
                MCP_OAUTH_FALLBACK_CLIENT_NAME,
            )
            .await
        }
    }
}

async fn register_mcp_oauth_client_with_name(
    client: &reqwest::Client,
    endpoint: &str,
    redirect_uri: &str,
    client_name: &str,
) -> Result<McpOAuthClientRegistration, String> {
    let response = client
        .post(endpoint)
        .json(&json!({
            "client_name": client_name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none"
        }))
        .send()
        .await
        .map_err(|_| "MCP OAuth client registration failed".to_string())?;
    if !response.status().is_success() {
        return Err("MCP OAuth client registration failed".to_string());
    }
    response
        .json::<McpOAuthClientRegistration>()
        .await
        .map_err(|_| "MCP OAuth client registration 格式无效".to_string())
}

fn build_mcp_oauth_authorization_url(
    endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(endpoint)
        .map_err(|_| "MCP OAuth authorization URL 无效".to_string())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(url)
}

async fn exchange_mcp_oauth_code(
    client: &reqwest::Client,
    token_endpoint: &str,
    code: &str,
    code_verifier: &str,
    client_id: &str,
    client_secret: Option<&str>,
    redirect_uri: &str,
) -> Result<McpOAuthTokenResponse, String> {
    let mut params = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
        ("client_id", client_id.to_string()),
        ("code_verifier", code_verifier.to_string()),
    ];
    if let Some(client_secret) = client_secret {
        params.push(("client_secret", client_secret.to_string()));
    }
    let response = client
        .post(token_endpoint)
        .form(&params)
        .send()
        .await
        .map_err(|_| "MCP OAuth token exchange failed".to_string())?;
    if !response.status().is_success() {
        return Err("MCP OAuth token exchange failed".to_string());
    }
    response
        .json::<McpOAuthTokenResponse>()
        .await
        .map_err(|_| "MCP OAuth token response 格式无效".to_string())
}

fn wait_for_mcp_oauth_callback(
    listener: TcpListener,
    expected_state: String,
    sender: mpsc::Sender<Result<String, String>>,
) {
    let _ = listener.set_nonblocking(true);
    let deadline = Instant::now() + Duration::from_secs(MCP_OAUTH_TIMEOUT_SECS);
    let result = loop {
        match listener.accept() {
            Ok((stream, _)) => match read_mcp_oauth_callback(stream, &expected_state) {
                Ok(code) => break Ok(code),
                Err(error) if error == "MCP OAuth callback failed" && Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                    continue;
                }
                Err(error) => break Err(error),
            },
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
                ) =>
            {
                if Instant::now() >= deadline {
                    break Err("MCP OAuth timeout".to_string());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => break Err("MCP OAuth callback failed".to_string()),
        }
    };
    let _ = sender.send(result);
}

fn read_mcp_oauth_callback(
    stream: std::net::TcpStream,
    expected_state: &str,
) -> Result<String, String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    loop {
        match reader.read_line(&mut request_line) {
            Ok(0) => return Err("MCP OAuth callback failed".to_string()),
            Ok(_) => break,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return Err("MCP OAuth callback failed".to_string()),
        }
    }
    let mut stream = reader.into_inner();
    let result = parse_mcp_oauth_callback_request(&request_line, expected_state);
    let response = if result.is_ok() {
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!doctype html><title>Madora MCP Authentication</title><p>Authentication successful. You can close this tab.</p>"
    } else {
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nAuthentication failed"
    };
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    result
}

fn parse_mcp_oauth_callback_request(
    request_line: &str,
    expected_state: &str,
) -> Result<String, String> {
    let target = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "MCP OAuth callback failed".to_string())?;
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "MCP OAuth callback URL 无效".to_string())?;
    if url.path() != "/callback" {
        return Err("MCP OAuth callback path 无效".to_string());
    }
    if let Some(error) = url
        .query_pairs()
        .find_map(|(key, value)| (key == "error").then(|| value.into_owned()))
    {
        return Err(format!("MCP OAuth failed: {error}"));
    }
    let state = url
        .query_pairs()
        .find_map(|(key, value)| (key == "state").then(|| value.into_owned()))
        .ok_or_else(|| "MCP OAuth callback 缺少 state".to_string())?;
    if state != expected_state {
        return Err("MCP OAuth state 无效".to_string());
    }
    url.query_pairs()
        .find_map(|(key, value)| (key == "code").then(|| value.into_owned()))
        .filter(|code| !code.trim().is_empty())
        .ok_or_else(|| "MCP OAuth callback 缺少 code".to_string())
}

fn get_mcp_base_url(mcp_url: &str) -> Result<String, String> {
    let parsed = validate_mcp_http_url(mcp_url)?;
    let mut value = parsed.to_string();
    for suffix in ["/mcp", "/mcp/", "/sse", "/sse/"] {
        if value.ends_with(suffix) {
            value.truncate(value.len() - suffix.len());
            break;
        }
    }
    Ok(value.trim_end_matches('/').to_string())
}

fn generate_mcp_oauth_code_verifier() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn generate_mcp_oauth_code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn current_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn writable_root(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    kind: &str,
) -> Result<PathBuf, String> {
    match source {
        "user" => Ok(home.join(".claude").join(kind)),
        "project" => project
            .map(|path| path.join(".claude").join(kind))
            .ok_or_else(|| "工作区根目录不存在".to_string()),
        _ => Err("AI 设置只能写入 user 或 project 来源".to_string()),
    }
}

fn safe_slug(name: &str) -> Result<String, String> {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for value in name.trim().chars().flat_map(char::to_lowercase) {
        if value.is_alphanumeric() {
            slug.push(value);
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() || slug == "." || slug == ".." || slug.contains("..") {
        Err("AI 设置名称无效".to_string())
    } else {
        Ok(slug)
    }
}

fn command_markdown_path(
    home: &Path,
    project: Option<&Path>,
    source: &str,
    name: &str,
) -> Result<PathBuf, String> {
    let segments = safe_command_segments(name)?;
    let mut path = writable_root(home, project, source, "commands")?;

    for segment in &segments[..segments.len() - 1] {
        path = path.join(segment);
    }

    Ok(path.join(format!("{}.md", segments.last().expect("command segment"))))
}

fn command_name_from_path(name: &str) -> Result<String, String> {
    Ok(safe_command_segments(name)?.join(":"))
}

fn safe_command_segments(name: &str) -> Result<Vec<String>, String> {
    let segments = name
        .split(['/', '\\', ':'])
        .map(safe_slug)
        .collect::<Result<Vec<_>, _>>()?;

    if segments.is_empty() {
        return Err("AI command 名称无效".to_string());
    }

    Ok(segments)
}

fn generate_markdown_with_frontmatter(
    name: &str,
    description: &str,
    content: &str,
    argument_hint: Option<&str>,
) -> Result<String, String> {
    ensure_single_line_frontmatter_value(name)?;
    ensure_single_line_frontmatter_value(description)?;
    if let Some(value) = argument_hint {
        ensure_single_line_frontmatter_value(value)?;
    }

    let mut output = format!("---\nname: {name}\ndescription: {}\n", description.trim());
    if let Some(argument_hint) = argument_hint
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        output.push_str(&format!("argument-hint: {argument_hint}\n"));
    }
    output.push_str("---\n\n");
    output.push_str(content.trim());
    output.push('\n');

    Ok(output)
}

fn generate_agent_markdown(
    name: &str,
    description: &str,
    prompt: &str,
    tools: &[String],
    disallowed_tools: &[String],
    model: Option<&str>,
) -> Result<String, String> {
    ensure_single_line_frontmatter_value(name)?;
    ensure_single_line_frontmatter_value(description)?;
    for value in tools.iter().chain(disallowed_tools.iter()) {
        ensure_single_line_frontmatter_value(value)?;
    }
    if let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) {
        if !matches!(model, "haiku" | "inherit" | "opus" | "sonnet") {
            return Err("AI custom agent model 无效".to_string());
        }
    }

    let mut output = format!("---\nname: {name}\ndescription: {}\n", description.trim());
    if !tools.is_empty() {
        output.push_str(&format!("tools: {}\n", tools.join(", ")));
    }
    if !disallowed_tools.is_empty() {
        output.push_str(&format!(
            "disallowedTools: {}\n",
            disallowed_tools.join(", ")
        ));
    }
    if let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) {
        output.push_str(&format!("model: {model}\n"));
    }
    output.push_str("---\n\n");
    output.push_str(prompt.trim());
    output.push('\n');

    Ok(output)
}

fn ensure_single_line_frontmatter_value(value: &str) -> Result<(), String> {
    if value.contains('\n') || value.contains('\r') {
        Err("AI 设置 frontmatter 不允许包含换行".to_string())
    } else {
        Ok(())
    }
}

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("AI 设置路径无效".to_string());
    };

    fs::create_dir_all(parent).map_err(|_| "无法创建 AI 设置目录".to_string())?;
    fs::write(path, content).map_err(|_| "无法写入 AI 设置文件".to_string())
}

fn mcp_config_path(home: &Path, project: Option<&Path>, source: &str) -> Result<PathBuf, String> {
    match source {
        "global" => Ok(home.join(".claude.json")),
        "project" => project
            .map(|path| path.join(".mcp.json"))
            .ok_or_else(|| "工作区根目录不存在".to_string()),
        _ => Err("AI MCP server 只能写入 global 或 project 来源".to_string()),
    }
}

fn resolve_mcp_workspace_root(root_path: &str) -> Result<Option<PathBuf>, String> {
    if root_path == MCP_GLOBAL_PROJECT_SENTINEL {
        Ok(None)
    } else {
        validate_project_root(root_path).map(Some)
    }
}

fn resolve_ai_settings_project_root(root_path: &str) -> Result<Option<PathBuf>, String> {
    if root_path == MCP_GLOBAL_PROJECT_SENTINEL {
        Ok(None)
    } else {
        validate_project_root(root_path).map(Some)
    }
}

fn normalize_mcp_project_path(project_path: Option<&str>) -> Option<&str> {
    match project_path {
        Some(value) if value == MCP_GLOBAL_PROJECT_SENTINEL => None,
        value => value,
    }
}

fn resolve_claude_mcp_auth_project(
    workspace_root: Option<&Path>,
    project_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let Some(project_path) = normalize_mcp_project_path(project_path) else {
        return Ok(None);
    };
    let Some(workspace_root) = workspace_root else {
        return Err("MCP projectPath 不属于当前工作区".to_string());
    };
    let requested = PathBuf::from(project_path);
    if requested != workspace_root {
        return Err("MCP projectPath 不属于当前工作区".to_string());
    }
    Ok(Some(workspace_root.to_path_buf()))
}

fn safe_mcp_server_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || !is_valid_entry_name(name) || name.contains('\n') || name.contains('\r') {
        Err("AI MCP server 名称无效".to_string())
    } else {
        Ok(name.to_string())
    }
}

fn read_mcp_config(path: &Path) -> Result<Value, String> {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(_) => return Err("无法读取 MCP 配置".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));

    Ok(if parsed.is_object() {
        parsed
    } else {
        json!({})
    })
}

fn ensure_mcp_servers_object(
    config: &mut Value,
) -> Result<&mut serde_json::Map<String, Value>, String> {
    let object = config
        .as_object_mut()
        .ok_or_else(|| "MCP 配置格式无效".to_string())?;
    if !object.get("mcpServers").is_some_and(Value::is_object) {
        object.insert("mcpServers".to_string(), json!({}));
    }

    object
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "MCP 配置格式无效".to_string())
}

fn build_mcp_server_config(
    connection_type: &str,
    command: Option<&str>,
    args: &[String],
    url: Option<&str>,
    env: &BTreeMap<String, String>,
    auth_type: Option<&str>,
    bearer_token: Option<&str>,
    existing_authorization: Option<&str>,
) -> Result<Value, String> {
    let mut config = serde_json::Map::new();
    match connection_type {
        "stdio" => {
            if auth_type
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "none")
                .is_some()
            {
                return Err("stdio MCP server 不支持 authType".to_string());
            }
            let command = command
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "stdio MCP server 需要 command".to_string())?;
            ensure_single_line_frontmatter_value(command)?;
            config.insert("command".to_string(), Value::String(command.to_string()));
            if !args.is_empty() {
                config.insert(
                    "args".to_string(),
                    Value::Array(args.iter().cloned().map(Value::String).collect()),
                );
            }
        }
        "http" => {
            let url = url
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "http MCP server 需要 url".to_string())?;
            ensure_single_line_frontmatter_value(url)?;
            config.insert("url".to_string(), Value::String(url.to_string()));
            apply_mcp_http_auth(&mut config, auth_type, bearer_token, existing_authorization)?;
        }
        _ => return Err("AI MCP server connection type 无效".to_string()),
    }

    if !env.is_empty() {
        config.insert(
            "env".to_string(),
            Value::Object(
                env.iter()
                    .map(|(key, value)| (key.clone(), Value::String(value.clone())))
                    .collect(),
            ),
        );
    }

    Ok(Value::Object(config))
}

fn apply_mcp_http_auth(
    config: &mut serde_json::Map<String, Value>,
    auth_type: Option<&str>,
    bearer_token: Option<&str>,
    existing_authorization: Option<&str>,
) -> Result<(), String> {
    let Some(auth_type) = normalize_mcp_auth_type(auth_type)? else {
        return Ok(());
    };

    config.insert("authType".to_string(), Value::String(auth_type.to_string()));

    if auth_type != "bearer" {
        return Ok(());
    }

    let authorization = match bearer_token
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(token) => {
            ensure_single_line_frontmatter_value(token)?;
            format!("Bearer {token}")
        }
        None => existing_authorization
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .ok_or_else(|| "bearer MCP server 需要 bearer token".to_string())?,
    };
    let mut headers = serde_json::Map::new();
    headers.insert("Authorization".to_string(), Value::String(authorization));
    config.insert("headers".to_string(), Value::Object(headers));

    Ok(())
}

fn normalize_mcp_auth_type(auth_type: Option<&str>) -> Result<Option<&'static str>, String> {
    let Some(auth_type) = auth_type.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    match auth_type.to_ascii_lowercase().as_str() {
        "none" => Ok(Some("none")),
        "oauth" => Ok(Some("oauth")),
        "bearer" => Ok(Some("bearer")),
        _ => Err("MCP authType 无效".to_string()),
    }
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let raw =
        serde_json::to_string_pretty(value).map_err(|_| "无法序列化 AI 设置文件".to_string())?;
    write_text_file(path, &format!("{raw}\n"))
}

fn list_ai_anthropic_accounts_for_home(home: &Path) -> Result<Vec<AiAnthropicAccountItem>, String> {
    let store = read_anthropic_accounts_store(home)?;
    let active_id = effective_active_anthropic_account_id(&store);

    Ok(store
        .accounts
        .into_iter()
        .map(|account| {
            let is_active = active_id.as_deref() == Some(account.id.as_str());

            AiAnthropicAccountItem {
                id: account.id,
                email: account.email,
                display_name: account.display_name,
                connected_at: account.connected_at,
                last_used_at: account.last_used_at,
                is_active,
            }
        })
        .collect())
}

fn list_ai_anthropic_accounts_for_home_with_secrets(
    home: &Path,
    secrets: &impl AnthropicAccountSecretStore,
) -> Result<Vec<AiAnthropicAccountItem>, String> {
    let accounts = list_ai_anthropic_accounts_for_home(home)?;

    if !accounts.is_empty() {
        return Ok(accounts);
    }

    if secrets.read_legacy_override_token()?.is_none() {
        return Ok(Vec::new());
    }

    Ok(vec![AiAnthropicAccountItem {
        id: LEGACY_ANTHROPIC_ACCOUNT_ID.to_string(),
        email: None,
        display_name: Some("Anthropic Account".to_string()),
        connected_at: None,
        last_used_at: None,
        is_active: true,
    }])
}

fn import_ai_anthropic_account_for_home(
    home: &Path,
    secrets: &impl AnthropicAccountSecretStore,
    token: &str,
    email: Option<&str>,
    display_name: Option<&str>,
) -> Result<AiAnthropicAccountItem, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Anthropic account token 不能为空".to_string());
    }

    let account_id = format!("acct-{}", Uuid::new_v4());
    let email = normalize_optional_text(email, 160);
    let display_name = normalize_optional_text(display_name, 120)
        .or_else(|| email.clone())
        .or_else(|| Some("Anthropic Account".to_string()));
    let timestamp = current_timestamp_millis();

    secrets.save(&account_id, token)?;

    let mut store = read_anthropic_accounts_store(home)?;
    store.accounts.push(StoredAnthropicAccount {
        id: account_id.clone(),
        email,
        display_name,
        connected_at: Some(timestamp.clone()),
        last_used_at: Some(timestamp),
    });
    store.active_account_id = Some(account_id.clone());

    if let Err(error) = write_anthropic_accounts_store(home, &store) {
        let _ = secrets.delete(&account_id);
        return Err(error);
    }

    let account = store
        .accounts
        .into_iter()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Anthropic account 导入失败".to_string())?;

    Ok(AiAnthropicAccountItem {
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        connected_at: account.connected_at,
        last_used_at: account.last_used_at,
        is_active: true,
    })
}

fn set_ai_anthropic_account_active_for_home(home: &Path, account_id: &str) -> Result<(), String> {
    validate_anthropic_account_id(account_id)?;
    let mut store = read_anthropic_accounts_store(home)?;
    let account = store
        .accounts
        .iter_mut()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Anthropic account 不存在".to_string())?;

    account.last_used_at = Some(current_timestamp_millis());
    store.active_account_id = Some(account_id.to_string());
    write_anthropic_accounts_store(home, &store)
}

fn rename_ai_anthropic_account_for_home(
    home: &Path,
    account_id: &str,
    display_name: &str,
) -> Result<(), String> {
    validate_anthropic_account_id(account_id)?;
    let next_name = display_name.trim();
    if next_name.is_empty() || next_name.len() > 120 {
        return Err("Anthropic account 名称不合法".to_string());
    }

    let mut store = read_anthropic_accounts_store(home)?;
    let account = store
        .accounts
        .iter_mut()
        .find(|account| account.id == account_id)
        .ok_or_else(|| "Anthropic account 不存在".to_string())?;

    account.display_name = Some(next_name.to_string());
    write_anthropic_accounts_store(home, &store)
}

fn delete_ai_anthropic_account_for_home(home: &Path, account_id: &str) -> Result<(), String> {
    validate_anthropic_account_id(account_id)?;
    let mut store = read_anthropic_accounts_store(home)?;
    let previous_len = store.accounts.len();
    store.accounts.retain(|account| account.id != account_id);

    if store.accounts.len() == previous_len {
        return Err("Anthropic account 不存在".to_string());
    }

    if store.active_account_id.as_deref() == Some(account_id) {
        store.active_account_id = store.accounts.first().map(|account| account.id.clone());
    }

    write_anthropic_accounts_store(home, &store)
}

fn read_active_anthropic_account_token_for_home(
    home: &Path,
    secrets: &impl AnthropicAccountSecretStore,
) -> Result<Option<String>, String> {
    let store = read_anthropic_accounts_store(home)?;
    let Some(account_id) = effective_active_anthropic_account_id(&store) else {
        return secrets.read_legacy_override_token();
    };

    secrets.read(&account_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCodeAuthErrorResponse {
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCodeSandboxStatus {
    state: String,
    oauth_url: Option<String>,
    oauth_token: Option<String>,
    error: Option<String>,
}

async fn start_ai_claude_code_auth_with_client(
    client: &reqwest::Client,
) -> Result<AiClaudeCodeAuthStartResult, String> {
    let desktop_token = std::env::var(CLAUDE_CODE_DESKTOP_TOKEN_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Not authenticated with 21st.dev".to_string())?;
    let api_url = std::env::var(CLAUDE_CODE_AUTH_API_URL_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| CLAUDE_CODE_AUTH_DEFAULT_API_URL.to_string());
    let start_url = join_claude_code_auth_url(&api_url, "/api/auth/claude-code/start")?;

    let response = client
        .post(start_url)
        .header("x-desktop-token", desktop_token)
        .send()
        .await
        .map_err(|_| "Failed to start Claude Code authentication".to_string())?;
    let status = response.status();

    if !status.is_success() {
        let error = response
            .json::<ClaudeCodeAuthErrorResponse>()
            .await
            .ok()
            .and_then(|body| body.error)
            .unwrap_or_else(|| format!("Start auth failed: {status}"));
        return Err(error);
    }

    response
        .json::<AiClaudeCodeAuthStartResult>()
        .await
        .map_err(|_| "Claude Code authentication response is invalid".to_string())
}

async fn submit_ai_claude_code_auth_code_with_secrets(
    client: &reqwest::Client,
    home: &Path,
    secrets: &impl AnthropicAccountSecretStore,
    sandbox_url: &str,
    session_id: &str,
    code: &str,
) -> Result<(), String> {
    let code = code.trim();
    if code.is_empty() {
        return Err("Claude Code authentication code 不能为空".to_string());
    }

    let code_url = claude_code_sandbox_endpoint(sandbox_url, session_id, "code")?;
    let response = client
        .post(code_url)
        .json(&json!({ "code": code }))
        .send()
        .await
        .map_err(|_| "Code submission failed".to_string())?;

    if !response.status().is_success() {
        return Err(format!("Code submission failed: {}", response.status()));
    }

    let mut oauth_token: Option<String> = None;

    for attempt in 0..CLAUDE_CODE_AUTH_POLL_ATTEMPTS {
        if attempt > 0 {
            std::thread::sleep(Duration::from_secs(1));
        }

        let status = fetch_claude_code_auth_status(client, sandbox_url, session_id).await?;

        if status.state == "success" {
            if let Some(token) = status
                .oauth_token
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
            {
                oauth_token = Some(token);
                break;
            }
        }

        if status.state == "error" {
            return Err(status
                .error
                .unwrap_or_else(|| "Authentication failed".to_string()));
        }
    }

    let token = oauth_token.ok_or_else(|| "Timeout waiting for OAuth token".to_string())?;
    import_ai_anthropic_account_for_home(home, secrets, &token, None, None)?;

    Ok(())
}

async fn fetch_claude_code_auth_status(
    client: &reqwest::Client,
    sandbox_url: &str,
    session_id: &str,
) -> Result<ClaudeCodeSandboxStatus, String> {
    let status_url = claude_code_sandbox_endpoint(sandbox_url, session_id, "status")?;
    let response = client
        .get(status_url)
        .send()
        .await
        .map_err(|_| "Connection failed".to_string())?;

    if !response.status().is_success() {
        return Ok(ClaudeCodeSandboxStatus {
            state: "error".to_string(),
            oauth_url: None,
            oauth_token: None,
            error: Some("Failed to poll status".to_string()),
        });
    }

    response
        .json::<ClaudeCodeSandboxStatus>()
        .await
        .map_err(|_| "Claude Code auth status response is invalid".to_string())
}

fn join_claude_code_auth_url(base_url: &str, path: &str) -> Result<String, String> {
    let mut url = validate_http_url(base_url, "Claude Code auth API URL")?;
    url.set_path(path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

fn claude_code_sandbox_endpoint(
    sandbox_url: &str,
    session_id: &str,
    action: &str,
) -> Result<String, String> {
    let mut url = validate_http_url(sandbox_url, "Claude Code sandbox URL")?;
    let session_id = safe_claude_code_session_id(session_id)?;
    url.set_path(&format!("/api/auth/{session_id}/{action}"));
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

fn validate_http_url(url: &str, label: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| format!("{label} 无效"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("{label} 必须使用 http 或 https"));
    }
    if parsed.host_str().is_none() {
        return Err(format!("{label} 缺少 host"));
    }
    Ok(parsed)
}

fn safe_claude_code_session_id(session_id: &str) -> Result<&str, String> {
    let session_id = session_id.trim();
    if session_id.is_empty()
        || !session_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Claude Code auth session id 不安全".to_string());
    }
    Ok(session_id)
}

fn delete_ai_anthropic_account_for_home_with_secrets(
    home: &Path,
    secrets: &impl AnthropicAccountSecretStore,
    account_id: &str,
) -> Result<(), String> {
    delete_ai_anthropic_account_for_home(home, account_id)?;
    secrets.delete(account_id)
}

fn read_anthropic_accounts_store(home: &Path) -> Result<AiAnthropicAccountsStore, String> {
    let path = anthropic_accounts_store_path(home);
    if !path.exists() {
        return Ok(AiAnthropicAccountsStore::default());
    }

    let raw = fs::read_to_string(path).map_err(|_| "无法读取 Anthropic accounts".to_string())?;
    let mut store: AiAnthropicAccountsStore =
        serde_json::from_str(&raw).map_err(|_| "Anthropic accounts 格式损坏".to_string())?;

    store
        .accounts
        .retain(|account| validate_anthropic_account_id(&account.id).is_ok());
    if let Some(active_id) = store.active_account_id.as_deref() {
        if !store.accounts.iter().any(|account| account.id == active_id) {
            store.active_account_id = store.accounts.first().map(|account| account.id.clone());
        }
    }

    Ok(store)
}

fn write_anthropic_accounts_store(
    home: &Path,
    store: &AiAnthropicAccountsStore,
) -> Result<(), String> {
    let path = anthropic_accounts_store_path(home);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建 Anthropic accounts 目录".to_string())?;
    }

    let raw = serde_json::to_string_pretty(store)
        .map_err(|_| "无法序列化 Anthropic accounts".to_string())?;
    fs::write(path, format!("{raw}\n")).map_err(|_| "无法保存 Anthropic accounts".to_string())
}

fn anthropic_accounts_store_path(home: &Path) -> PathBuf {
    home.join(ANTHROPIC_ACCOUNTS_PATH)
}

fn effective_active_anthropic_account_id(store: &AiAnthropicAccountsStore) -> Option<String> {
    if let Some(active_id) = store.active_account_id.as_deref() {
        if store.accounts.iter().any(|account| account.id == active_id) {
            return Some(active_id.to_string());
        }
    }

    store.accounts.first().map(|account| account.id.clone())
}

fn validate_anthropic_account_id(account_id: &str) -> Result<(), String> {
    let valid = !account_id.is_empty()
        && account_id.len() <= 96
        && account_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'));

    if valid {
        Ok(())
    } else {
        Err("Anthropic account id 不安全".to_string())
    }
}

fn anthropic_account_secret_provider_id(account_id: &str) -> Result<String, String> {
    validate_anthropic_account_id(account_id)?;
    Ok(format!("anthropic-account.{account_id}"))
}

fn normalize_optional_text(value: Option<&str>, max_len: usize) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }

    Some(value.chars().take(max_len).collect())
}

fn current_timestamp_millis() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    format!("{millis}")
}

fn remove_empty_parent_dirs(parent: Option<&Path>, stop: &Path) {
    let Some(parent) = parent else {
        return;
    };
    let mut current = parent.to_path_buf();

    while current.starts_with(stop) && current != stop {
        if fs::remove_dir(&current).is_err() {
            break;
        }

        let Some(next) = current.parent() else {
            break;
        };
        current = next.to_path_buf();
    }
}

#[tauri::command]
pub fn list_ai_skills(root_path: String) -> Result<Vec<AiSkillItem>, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    list_ai_skills_for_paths(&home, project.as_deref())
}

#[tauri::command]
pub fn list_ai_commands(root_path: String) -> Result<Vec<AiCommandItem>, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    list_ai_commands_for_paths(&home, project.as_deref())
}

#[tauri::command]
pub fn list_ai_custom_agents(root_path: String) -> Result<Vec<AiCustomAgentItem>, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    list_ai_custom_agents_for_paths(&home, project.as_deref())
}

#[tauri::command]
pub fn list_ai_plugins() -> Result<Vec<AiPluginItem>, String> {
    let home = home_dir()?;

    list_ai_plugins_for_home(&home)
}

#[tauri::command]
pub fn set_ai_claude_include_co_authored_by(enabled: bool) -> Result<(), String> {
    let home = home_dir()?;

    set_ai_claude_include_co_authored_by_for_home(&home, enabled)
}

#[tauri::command]
pub fn list_ai_anthropic_accounts() -> Result<Vec<AiAnthropicAccountItem>, String> {
    let home = home_dir()?;

    list_ai_anthropic_accounts_for_home_with_secrets(&home, &KeyringAnthropicAccountSecretStore)
}

#[tauri::command]
pub fn import_ai_anthropic_account_token(
    token: String,
    email: Option<String>,
    display_name: Option<String>,
) -> Result<AiAnthropicAccountItem, String> {
    let home = home_dir()?;

    import_ai_anthropic_account_for_home(
        &home,
        &KeyringAnthropicAccountSecretStore,
        &token,
        email.as_deref(),
        display_name.as_deref(),
    )
}

pub(crate) fn read_active_anthropic_account_token() -> Result<Option<String>, String> {
    let home = home_dir()?;

    read_active_anthropic_account_token_for_home(&home, &KeyringAnthropicAccountSecretStore)
}

#[tauri::command]
pub fn set_ai_anthropic_account_active(account_id: String) -> Result<(), String> {
    let home = home_dir()?;

    set_ai_anthropic_account_active_for_home(&home, &account_id)
}

#[tauri::command]
pub fn rename_ai_anthropic_account(account_id: String, display_name: String) -> Result<(), String> {
    let home = home_dir()?;

    rename_ai_anthropic_account_for_home(&home, &account_id, &display_name)
}

#[tauri::command]
pub fn delete_ai_anthropic_account(account_id: String) -> Result<(), String> {
    let home = home_dir()?;

    delete_ai_anthropic_account_for_home_with_secrets(
        &home,
        &KeyringAnthropicAccountSecretStore,
        &account_id,
    )
}

#[tauri::command]
pub async fn start_ai_claude_code_auth() -> Result<AiClaudeCodeAuthStartResult, String> {
    start_ai_claude_code_auth_with_client(&reqwest::Client::new()).await
}

#[tauri::command]
pub async fn poll_ai_claude_code_auth_status(
    sandbox_url: String,
    session_id: String,
) -> Result<AiClaudeCodeAuthStatus, String> {
    let status =
        fetch_claude_code_auth_status(&reqwest::Client::new(), &sandbox_url, &session_id).await?;

    Ok(AiClaudeCodeAuthStatus {
        state: status.state,
        oauth_url: status.oauth_url,
        error: status.error,
    })
}

#[tauri::command]
pub async fn submit_ai_claude_code_auth_code(
    sandbox_url: String,
    session_id: String,
    code: String,
) -> Result<AiClaudeCodeAuthSuccessResult, String> {
    submit_ai_claude_code_auth_code_with_secrets(
        &reqwest::Client::new(),
        &home_dir()?,
        &KeyringAnthropicAccountSecretStore,
        &sandbox_url,
        &session_id,
        &code,
    )
    .await?;

    Ok(AiClaudeCodeAuthSuccessResult { success: true })
}

#[tauri::command]
pub fn open_ai_claude_code_oauth_url(url: String) -> Result<AiClaudeCodeAuthSuccessResult, String> {
    validate_http_url(&url, "Claude Code OAuth URL")?;
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|_| "无法打开 Claude Code OAuth URL".to_string())?;

    Ok(AiClaudeCodeAuthSuccessResult { success: true })
}

#[tauri::command]
pub fn set_ai_plugin_enabled(source: String, enabled: bool) -> Result<(), String> {
    let home = home_dir()?;

    set_ai_plugin_enabled_for_home(&home, &source, enabled)
}

#[tauri::command]
pub fn set_ai_plugin_mcp_server_approved(
    plugin_source: String,
    server_name: String,
    approved: bool,
) -> Result<(), String> {
    let home = home_dir()?;

    set_ai_plugin_mcp_server_approved_for_home(&home, &plugin_source, &server_name, approved)
}

#[tauri::command]
pub fn set_ai_plugin_mcp_servers_approved(
    plugin_source: String,
    server_names: Vec<String>,
    approved: bool,
) -> Result<(), String> {
    let home = home_dir()?;

    set_ai_plugin_mcp_servers_approved_for_home(&home, &plugin_source, &server_names, approved)
}

#[tauri::command]
pub fn list_ai_mcp_servers(root_path: String) -> Result<Vec<AiMcpServerItem>, String> {
    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;

    list_ai_mcp_servers_for_paths(&home, project.as_deref())
}

#[tauri::command]
pub fn create_ai_skill(
    root_path: String,
    source: String,
    name: String,
    description: String,
    content: String,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    create_ai_skill_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &content,
    )
}

#[tauri::command]
pub fn update_ai_skill(
    root_path: String,
    source: String,
    name: String,
    description: String,
    content: String,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    update_ai_skill_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &content,
    )
}

#[tauri::command]
pub fn delete_ai_skill(root_path: String, source: String, name: String) -> Result<(), String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    delete_ai_skill_for_paths(&home, project.as_deref(), &source, &name)
}

#[tauri::command]
pub fn create_ai_command(
    root_path: String,
    source: String,
    name: String,
    description: String,
    content: String,
    argument_hint: Option<String>,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    create_ai_command_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &content,
        argument_hint.as_deref(),
    )
}

#[tauri::command]
pub fn update_ai_command(
    root_path: String,
    source: String,
    name: String,
    description: String,
    content: String,
    argument_hint: Option<String>,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    update_ai_command_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &content,
        argument_hint.as_deref(),
    )
}

#[tauri::command]
pub fn delete_ai_command(root_path: String, source: String, name: String) -> Result<(), String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    delete_ai_command_for_paths(&home, project.as_deref(), &source, &name)
}

#[tauri::command]
pub fn create_ai_custom_agent(
    root_path: String,
    source: String,
    name: String,
    description: String,
    prompt: String,
    tools: Vec<String>,
    disallowed_tools: Vec<String>,
    model: Option<String>,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    create_ai_custom_agent_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &prompt,
        &tools,
        &disallowed_tools,
        model.as_deref(),
    )
}

#[tauri::command]
pub fn update_ai_custom_agent(
    root_path: String,
    source: String,
    name: String,
    description: String,
    prompt: String,
    tools: Vec<String>,
    disallowed_tools: Vec<String>,
    model: Option<String>,
) -> Result<String, String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    update_ai_custom_agent_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &description,
        &prompt,
        &tools,
        &disallowed_tools,
        model.as_deref(),
    )
}

#[tauri::command]
pub fn delete_ai_custom_agent(
    root_path: String,
    source: String,
    name: String,
) -> Result<(), String> {
    let home = home_dir()?;
    let project = resolve_ai_settings_project_root(&root_path)?;

    delete_ai_custom_agent_for_paths(&home, project.as_deref(), &source, &name)
}

#[tauri::command]
pub fn create_ai_mcp_server(
    root_path: String,
    provider: Option<String>,
    source: String,
    name: String,
    connection_type: String,
    command: Option<String>,
    args: Vec<String>,
    url: Option<String>,
    env: BTreeMap<String, String>,
    auth_type: Option<String>,
    bearer_token: Option<String>,
) -> Result<String, String> {
    if provider.as_deref() == Some("codex") {
        if source != "global" {
            return Err("Codex MCP 目前只支持 global scope".to_string());
        }
        return create_codex_mcp_server(
            &name,
            &connection_type,
            command.as_deref(),
            &args,
            url.as_deref(),
        );
    }

    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;

    create_ai_mcp_server_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &connection_type,
        command.as_deref(),
        &args,
        url.as_deref(),
        &env,
        auth_type.as_deref(),
        bearer_token.as_deref(),
    )
}

#[tauri::command]
pub fn set_ai_mcp_server_enabled(
    root_path: String,
    provider: Option<String>,
    source: String,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    if provider.as_deref() == Some("codex") {
        return Err("Codex MCP enable/disable 暂未由设置页写入".to_string());
    }

    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;

    set_ai_mcp_server_enabled_for_paths(&home, project.as_deref(), &source, &name, enabled)
}

#[tauri::command]
pub fn update_ai_mcp_server(
    root_path: String,
    provider: Option<String>,
    source: String,
    name: String,
    connection_type: String,
    command: Option<String>,
    args: Vec<String>,
    url: Option<String>,
    env: BTreeMap<String, String>,
    auth_type: Option<String>,
    bearer_token: Option<String>,
) -> Result<String, String> {
    if provider.as_deref() == Some("codex") {
        return Err("Codex MCP 暂不支持编辑，请删除后重新添加".to_string());
    }

    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;

    update_ai_mcp_server_for_paths(
        &home,
        project.as_deref(),
        &source,
        &name,
        &connection_type,
        command.as_deref(),
        &args,
        url.as_deref(),
        &env,
        auth_type.as_deref(),
        bearer_token.as_deref(),
    )
}

#[tauri::command]
pub fn delete_ai_mcp_server(
    root_path: String,
    provider: Option<String>,
    source: String,
    name: String,
) -> Result<(), String> {
    if provider.as_deref() == Some("codex") {
        if source != "global" {
            return Err("Codex MCP 目前只支持 global scope".to_string());
        }
        return delete_codex_mcp_server(&name);
    }

    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;

    delete_ai_mcp_server_for_paths(&home, project.as_deref(), &source, &name)
}

#[tauri::command]
pub fn authenticate_ai_mcp_server(
    root_path: String,
    provider: String,
    name: String,
    project_path: Option<String>,
) -> Result<(), String> {
    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;
    let auth_project_path = normalize_mcp_project_path(project_path.as_deref());

    match provider.as_str() {
        "codex" => authenticate_codex_mcp_server(&name, auth_project_path),
        "claude-code" => {
            let auth_project =
                resolve_claude_mcp_auth_project(project.as_deref(), auth_project_path)?;
            authenticate_claude_mcp_server(&home, auth_project.as_deref(), &name)
        }
        _ => Err("当前 provider 暂不支持 MCP authenticate".to_string()),
    }
}

#[tauri::command]
pub fn logout_ai_mcp_server(
    root_path: String,
    provider: String,
    name: String,
    project_path: Option<String>,
) -> Result<(), String> {
    let home = home_dir()?;
    let project = resolve_mcp_workspace_root(&root_path)?;
    let auth_project_path = normalize_mcp_project_path(project_path.as_deref());

    match provider.as_str() {
        "codex" => logout_codex_mcp_server(&name, auth_project_path),
        "claude-code" => {
            let auth_project =
                resolve_claude_mcp_auth_project(project.as_deref(), auth_project_path)?;
            logout_claude_mcp_server_for_paths(&home, auth_project.as_deref(), &name)
        }
        _ => Err("当前 provider 暂不支持 MCP logout".to_string()),
    }
}

fn scan_skills_directory(
    dir: &Path,
    source: &str,
    plugin_name: Option<&str>,
    project_root: Option<&Path>,
    home: &Path,
) -> Result<Vec<AiSkillItem>, String> {
    let mut skills = Vec::new();

    for entry in read_sorted_dir(dir)? {
        if !entry.path().is_dir() || !is_valid_entry_name(&entry.file_name().to_string_lossy()) {
            continue;
        }

        let skill_path = entry.path().join("SKILL.md");
        if !skill_path.is_file() {
            continue;
        }

        let raw = fs::read_to_string(&skill_path).map_err(read_error)?;
        let parsed = parse_markdown_with_frontmatter(&raw);
        let fallback_name = entry.file_name().to_string_lossy().to_string();
        skills.push(AiSkillItem {
            name: parsed
                .frontmatter
                .get("name")
                .cloned()
                .unwrap_or(fallback_name),
            description: parsed
                .frontmatter
                .get("description")
                .cloned()
                .unwrap_or_default(),
            source: source.to_string(),
            plugin_name: plugin_name.map(ToOwned::to_owned),
            path: display_path(&skill_path, project_root, home),
            content: parsed.body.trim().to_string(),
        });
    }

    Ok(skills)
}

fn scan_commands_directory(
    dir: &Path,
    source: &str,
    prefix: &str,
    plugin_name: Option<&str>,
    project_root: Option<&Path>,
    home: &Path,
) -> Result<Vec<AiCommandItem>, String> {
    let mut commands = Vec::new();

    for entry in read_sorted_dir(dir)? {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if !is_valid_entry_name(&entry_name) {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            let nested_prefix = if prefix.is_empty() {
                entry_name
            } else {
                format!("{prefix}:{entry_name}")
            };
            commands.extend(scan_commands_directory(
                &path,
                source,
                &nested_prefix,
                plugin_name,
                project_root,
                home,
            )?);
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let raw = fs::read_to_string(&path).map_err(read_error)?;
        let parsed = parse_markdown_with_frontmatter(&raw);
        let base_name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let fallback_name = if prefix.is_empty() {
            base_name.to_string()
        } else {
            format!("{prefix}:{base_name}")
        };

        commands.push(AiCommandItem {
            name: parsed
                .frontmatter
                .get("name")
                .cloned()
                .unwrap_or(fallback_name),
            description: parsed
                .frontmatter
                .get("description")
                .cloned()
                .unwrap_or_default(),
            argument_hint: parsed.frontmatter.get("argument-hint").cloned(),
            source: source.to_string(),
            plugin_name: plugin_name.map(ToOwned::to_owned),
            path: display_path(&path, project_root, home),
            content: parsed.body.trim().to_string(),
        });
    }

    Ok(commands)
}

fn scan_agents_directory(
    dir: &Path,
    source: &str,
    plugin_name: Option<&str>,
    project_root: Option<&Path>,
    home: &Path,
) -> Result<Vec<AiCustomAgentItem>, String> {
    let mut agents = Vec::new();

    for entry in read_sorted_dir(dir)? {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if !is_valid_entry_name(&entry_name) {
            continue;
        }

        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let raw = fs::read_to_string(&path).map_err(read_error)?;
        let parsed = parse_markdown_with_frontmatter(&raw);
        let fallback_name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let description = parsed
            .frontmatter
            .get("description")
            .cloned()
            .unwrap_or_default();
        let prompt = parsed.body.trim().to_string();

        agents.push(AiCustomAgentItem {
            name: parsed
                .frontmatter
                .get("name")
                .cloned()
                .unwrap_or(fallback_name),
            description,
            prompt,
            tools: parse_string_list(parsed.frontmatter.get("tools")),
            disallowed_tools: parse_string_list(parsed.frontmatter.get("disallowedTools")),
            model: parsed.frontmatter.get("model").and_then(|model| {
                if matches!(model.as_str(), "sonnet" | "opus" | "haiku" | "inherit") {
                    Some(model.clone())
                } else {
                    None
                }
            }),
            source: source.to_string(),
            plugin_name: plugin_name.map(ToOwned::to_owned),
            path: display_path(&path, project_root, home),
        });
    }

    Ok(agents)
}

fn scan_plugin_commands(dir: &Path, prefix: &str) -> Result<Vec<AiPluginComponent>, String> {
    let mut components = Vec::new();

    for entry in read_sorted_dir(dir)? {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if !is_valid_entry_name(&entry_name) {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            let nested_prefix = if prefix.is_empty() {
                entry_name
            } else {
                format!("{prefix}:{entry_name}")
            };
            components.extend(scan_plugin_commands(&path, &nested_prefix)?);
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let raw = fs::read_to_string(&path).map_err(read_error)?;
        let parsed = parse_markdown_with_frontmatter(&raw);
        let base_name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let fallback_name = if prefix.is_empty() {
            base_name.to_string()
        } else {
            format!("{prefix}:{base_name}")
        };
        components.push(AiPluginComponent {
            name: parsed
                .frontmatter
                .get("name")
                .cloned()
                .unwrap_or(fallback_name),
            description: parsed.frontmatter.get("description").cloned(),
        });
    }

    Ok(components)
}

fn scan_plugin_skills(dir: &Path) -> Result<Vec<AiPluginComponent>, String> {
    Ok(
        scan_skills_directory(dir, "plugin", None, None, Path::new(""))?
            .into_iter()
            .map(|skill| AiPluginComponent {
                name: skill.name,
                description: Some(skill.description).filter(|value| !value.is_empty()),
            })
            .collect(),
    )
}

fn scan_plugin_agents(dir: &Path) -> Result<Vec<AiPluginComponent>, String> {
    Ok(
        scan_agents_directory(dir, "plugin", None, None, Path::new(""))?
            .into_iter()
            .map(|agent| AiPluginComponent {
                name: agent.name,
                description: Some(agent.description).filter(|value| !value.is_empty()),
            })
            .collect(),
    )
}

fn enabled_plugins(home: &Path) -> Result<Vec<InstalledPlugin>, String> {
    let enabled = enabled_plugin_sources(home)?;
    Ok(discover_installed_plugins(home)?
        .into_iter()
        .filter(|plugin| enabled.contains(&plugin.source))
        .collect())
}

fn enabled_plugin_sources(home: &Path) -> Result<BTreeSet<String>, String> {
    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeSet::new()),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let enabled_plugins = parsed
        .get("enabledPlugins")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect();

    Ok(enabled_plugins)
}

fn set_ai_plugin_enabled_for_home(home: &Path, source: &str, enabled: bool) -> Result<(), String> {
    let source = validate_plugin_source(source)?;

    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(&settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let mut parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if !parsed.is_object() {
        parsed = json!({});
    }

    let object = parsed.as_object_mut().expect("settings object");
    let mut enabled_plugins = object
        .get("enabledPlugins")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if enabled {
        if !enabled_plugins.iter().any(|value| value == source) {
            enabled_plugins.push(source.to_string());
        }
    } else {
        enabled_plugins.retain(|value| value != source);
    }

    object.insert(
        "enabledPlugins".to_string(),
        Value::Array(enabled_plugins.into_iter().map(Value::String).collect()),
    );

    let next_raw = serde_json::to_string_pretty(&parsed)
        .map_err(|_| "无法序列化 Claude settings".to_string())?;
    write_text_file(&settings_path, &format!("{next_raw}\n"))
}

fn set_ai_claude_include_co_authored_by_for_home(
    home: &Path,
    enabled: bool,
) -> Result<(), String> {
    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(&settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let mut parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if !parsed.is_object() {
        parsed = json!({});
    }

    let object = parsed.as_object_mut().expect("settings object");
    if enabled {
        object.remove("includeCoAuthoredBy");
    } else {
        object.insert("includeCoAuthoredBy".to_string(), Value::Bool(false));
    }

    let next_raw = serde_json::to_string_pretty(&parsed)
        .map_err(|_| "无法序列化 Claude settings".to_string())?;
    write_text_file(&settings_path, &format!("{next_raw}\n"))
}

fn set_ai_plugin_mcp_server_approved_for_home(
    home: &Path,
    plugin_source: &str,
    server_name: &str,
    approved: bool,
) -> Result<(), String> {
    let plugin_source = validate_plugin_source(plugin_source)?;
    let server_name = safe_mcp_server_name(server_name)?;
    let identifier = format!("{plugin_source}:{server_name}");
    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(&settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let mut parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if !parsed.is_object() {
        parsed = json!({});
    }

    let object = parsed.as_object_mut().expect("settings object");
    let mut approved_servers = object
        .get("approvedPluginMcpServers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if approved {
        if !approved_servers.iter().any(|value| value == &identifier) {
            approved_servers.push(identifier);
        }
    } else {
        approved_servers.retain(|value| value != &identifier);
    }

    object.insert(
        "approvedPluginMcpServers".to_string(),
        Value::Array(approved_servers.into_iter().map(Value::String).collect()),
    );

    let next_raw = serde_json::to_string_pretty(&parsed)
        .map_err(|_| "无法序列化 Claude settings".to_string())?;
    write_text_file(&settings_path, &format!("{next_raw}\n"))
}

fn set_ai_plugin_mcp_servers_approved_for_home(
    home: &Path,
    plugin_source: &str,
    server_names: &[String],
    approved: bool,
) -> Result<(), String> {
    let plugin_source = validate_plugin_source(plugin_source)?;
    let mut server_names_in_order = Vec::new();
    for server_name in server_names {
        let server_name = safe_mcp_server_name(server_name)?;
        if !server_names_in_order
            .iter()
            .any(|existing| existing == &server_name)
        {
            server_names_in_order.push(server_name);
        }
    }
    let plugin_prefix = format!("{plugin_source}:");
    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(&settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let mut parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    if !parsed.is_object() {
        parsed = json!({});
    }

    let object = parsed.as_object_mut().expect("settings object");
    let mut approved_servers = object
        .get("approvedPluginMcpServers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if approved {
        for server_name in server_names_in_order {
            let identifier = format!("{plugin_source}:{server_name}");
            if !approved_servers.iter().any(|value| value == &identifier) {
                approved_servers.push(identifier);
            }
        }
    } else {
        approved_servers.retain(|value| !value.starts_with(&plugin_prefix));
    }

    object.insert(
        "approvedPluginMcpServers".to_string(),
        Value::Array(approved_servers.into_iter().map(Value::String).collect()),
    );

    let next_raw = serde_json::to_string_pretty(&parsed)
        .map_err(|_| "无法序列化 Claude settings".to_string())?;
    write_text_file(&settings_path, &format!("{next_raw}\n"))
}

fn validate_plugin_source(source: &str) -> Result<&str, String> {
    let source = source.trim();
    if source.is_empty() || source.contains("..") || source.contains('\n') || source.contains('\r')
    {
        Err("AI plugin source 无效".to_string())
    } else {
        Ok(source)
    }
}

fn discover_installed_plugins(home: &Path) -> Result<Vec<InstalledPlugin>, String> {
    let marketplaces_dir = home.join(".claude/plugins/marketplaces");
    let mut plugins = Vec::new();

    for marketplace_entry in read_sorted_dir(&marketplaces_dir)? {
        let marketplace_path = marketplace_entry.path();
        if !marketplace_path.is_dir() {
            continue;
        }

        let marketplace_json_path = marketplace_path.join(".claude-plugin/marketplace.json");
        let raw = match fs::read_to_string(marketplace_json_path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
        let marketplace_name = parsed
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_else(|| {
                marketplace_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("marketplace")
            })
            .to_string();
        let Some(plugin_values) = parsed.get("plugins").and_then(Value::as_array) else {
            continue;
        };

        for plugin_value in plugin_values {
            let Some(plugin_name) = plugin_value.get("name").and_then(Value::as_str) else {
                continue;
            };
            let Some(source_path) = plugin_value.get("source").and_then(Value::as_str) else {
                continue;
            };
            if source_path.contains("..") {
                continue;
            }

            let plugin_path = marketplace_path.join(source_path);
            if !plugin_path.is_dir() {
                continue;
            }

            plugins.push(InstalledPlugin {
                name: plugin_name.to_string(),
                version: plugin_value
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or("0.0.0")
                    .to_string(),
                description: plugin_value
                    .get("description")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                path: plugin_path,
                source: format!("{marketplace_name}:{plugin_name}"),
                marketplace: marketplace_name.clone(),
                category: plugin_value
                    .get("category")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                homepage: plugin_value
                    .get("homepage")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                tags: plugin_value
                    .get("tags")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect(),
            });
        }
    }

    Ok(plugins)
}

fn read_mcp_servers_from_config_file(
    path: &Path,
    group_name: &str,
    project_path: Option<&Path>,
    source: &str,
    plugin_name: Option<&str>,
    approved_plugin_mcp_servers: Option<&BTreeSet<String>>,
) -> Result<Vec<AiMcpServerItem>, String> {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("无法读取 MCP 配置".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let servers = parsed
        .get("mcpServers")
        .and_then(Value::as_object)
        .or_else(|| parsed.as_object());
    let Some(servers) = servers else {
        return Ok(Vec::new());
    };

    servers_to_mcp_items(
        servers,
        group_name,
        project_path,
        source,
        plugin_name,
        approved_plugin_mcp_servers,
    )
}

fn read_project_mcp_servers_from_config_file(
    path: &Path,
    project_path: &Path,
) -> Result<Vec<AiMcpServerItem>, String> {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("无法读取 MCP 配置".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let Some(projects) = parsed.get("projects").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };
    let project_key = project_path.to_string_lossy();
    let Some(project_config) = projects.get(project_key.as_ref()) else {
        return Ok(Vec::new());
    };
    let Some(servers) = project_config.get("mcpServers").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };
    let group_name = project_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Project");

    servers_to_mcp_items(
        servers,
        group_name,
        Some(project_path),
        "project",
        None,
        None,
    )
}

fn servers_to_mcp_items(
    servers: &serde_json::Map<String, Value>,
    group_name: &str,
    project_path: Option<&Path>,
    source: &str,
    plugin_name: Option<&str>,
    approved_plugin_mcp_servers: Option<&BTreeSet<String>>,
) -> Result<Vec<AiMcpServerItem>, String> {
    let mut items = Vec::new();

    for (name, config) in servers {
        if name == "mcpServers" || name == "projects" || !is_valid_entry_name(name) {
            continue;
        }
        let Some(config) = config.as_object() else {
            continue;
        };
        let url = config
            .get("url")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let command = config
            .get("command")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let args = config
            .get("args")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        let env_values = config
            .get("env")
            .and_then(Value::as_object)
            .map(|env| {
                env.iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|value| (key.clone(), value.to_string()))
                    })
                    .collect::<BTreeMap<_, _>>()
            })
            .unwrap_or_default();
        let mut env_keys = env_values.keys().cloned().collect::<Vec<_>>();
        env_keys.sort();
        let disabled = config
            .get("disabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || config.get("enabled").and_then(Value::as_bool) == Some(false);
        let connection_type = if url.is_some() {
            "http"
        } else if command.is_some() {
            "stdio"
        } else {
            "unknown"
        };
        let plugin_mcp_identifier =
            plugin_name.map(|plugin_source| format!("{plugin_source}:{name}"));
        let is_pending_plugin_approval = source == "plugin"
            && plugin_mcp_identifier.as_ref().is_some_and(|identifier| {
                approved_plugin_mcp_servers.is_some_and(|approved| !approved.contains(identifier))
            });
        let headers = extract_mcp_headers(config);
        let auth_type = config
            .get("authType")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let has_auth_header = has_mcp_authorization_header(&headers);
        let needs_auth = connection_type == "http" && mcp_server_needs_auth(config, &headers);
        let discovery_result = if !disabled && !is_pending_plugin_approval {
            match connection_type {
                "stdio" => command
                    .as_deref()
                    .map(|command| discover_stdio_mcp_tools_result(command, &args, &env_values)),
                "http" => url
                    .as_deref()
                    .map(|url| {
                        tauri::async_runtime::block_on(discover_http_mcp_tools_result(
                            url, &headers,
                        ))
                    }),
                _ => None,
            }
        } else {
            None
        };
        let discovery_error = discovery_result
            .as_ref()
            .and_then(|result| result.as_ref().err())
            .cloned();
        let tools = discovery_result
            .and_then(Result::ok)
            .unwrap_or_default();
        let status = if disabled {
            "disabled"
        } else if is_pending_plugin_approval {
            "pending-approval"
        } else if needs_auth {
            "needs-auth"
        } else if discovery_error.is_some() {
            "failed"
        } else if connection_type == "stdio" || connection_type == "http" {
            "connected"
        } else {
            "configured"
        };

        items.push(AiMcpServerItem {
            name: name.clone(),
            provider: "claude-code".to_string(),
            group_name: group_name.to_string(),
            project_path: project_path.map(|path| path.to_string_lossy().to_string()),
            source: source.to_string(),
            status: status.to_string(),
            enabled: !disabled,
            connection_type: connection_type.to_string(),
            command,
            args,
            url,
            env_keys,
            auth_type,
            auth_status: None,
            has_auth_header,
            needs_auth,
            plugin_name: plugin_name.map(ToOwned::to_owned),
            error: discovery_error,
            tools,
        });
    }

    items.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(items)
}

fn discover_stdio_mcp_tools_result(
    command: &str,
    args: &[String],
    env_values: &BTreeMap<String, String>,
) -> Result<Vec<AiMcpToolInfo>, String> {
    let mut child = Command::new(command)
        .args(args)
        .env_clear()
        .envs(safe_mcp_stdio_environment())
        .envs(
            env_values
                .iter()
                .map(|(key, value)| (key.as_str(), value.as_str())),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法启动 MCP server".to_string())?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 MCP server".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 MCP server 输出".to_string())?;
    let (sender, receiver) = mpsc::channel();

    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);

        while let Ok(Some(message)) = read_mcp_stdio_message(&mut reader) {
            if sender.send(message).is_err() {
                break;
            }
        }
    });

    let initialize = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "madora",
                "version": "0.1.0"
            }
        }
    });
    write_mcp_stdio_message(&mut stdin, &initialize)?;
    wait_for_mcp_response(&receiver, 1)?;

    write_mcp_stdio_message(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }),
    )?;

    write_mcp_stdio_message(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )?;
    let response = wait_for_mcp_response(&receiver, 2)?;
    let _ = child.kill();
    let _ = child.wait();

    Ok(parse_mcp_tools_response(&response))
}

async fn discover_http_mcp_tools_result(
    url: &str,
    headers: &BTreeMap<String, String>,
) -> Result<Vec<AiMcpToolInfo>, String> {
    let url = validate_mcp_http_url(url)?;
    let headers = parse_mcp_http_headers(headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(MCP_HTTP_DISCOVERY_TIMEOUT_SECS))
        .build()
        .map_err(|_| "MCP HTTP client failed".to_string())?;

    send_mcp_http_message(
        &client,
        url.clone(),
        &headers,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "madora",
                    "version": "0.1.0"
                }
            }
        }),
    )
    .await?;

    let response = send_mcp_http_message(
        &client,
        url,
        &headers,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )
    .await?;

    Ok(parse_mcp_tools_response(&response))
}

async fn send_mcp_http_message(
    client: &reqwest::Client,
    url: reqwest::Url,
    headers: &reqwest::header::HeaderMap,
    message: &Value,
) -> Result<Value, String> {
    let response = client
        .post(url)
        .headers(headers.clone())
        .header(
            reqwest::header::ACCEPT,
            "application/json, text/event-stream",
        )
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(message)
        .send()
        .await
        .map_err(|_| "MCP HTTP request failed".to_string())?;

    if !response.status().is_success() {
        return Err("MCP HTTP request failed".to_string());
    }

    let body = response
        .text()
        .await
        .map_err(|_| "MCP HTTP response failed".to_string())?;

    parse_mcp_http_response_text(&body)
}

fn validate_mcp_http_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "MCP HTTP URL is invalid".to_string())?;

    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("MCP HTTP URL must use http or https".to_string()),
    }
}

fn parse_mcp_http_headers(
    headers: &BTreeMap<String, String>,
) -> Result<reqwest::header::HeaderMap, String> {
    let mut parsed = reqwest::header::HeaderMap::new();

    for (key, value) in headers {
        let header_name = reqwest::header::HeaderName::from_str(key)
            .map_err(|_| "MCP HTTP header name is invalid".to_string())?;
        let header_value = reqwest::header::HeaderValue::from_str(value)
            .map_err(|_| "MCP HTTP header value is invalid".to_string())?;

        parsed.insert(header_name, header_value);
    }

    Ok(parsed)
}

fn parse_mcp_http_response_text(body: &str) -> Result<Value, String> {
    let trimmed = body.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Ok(value);
    }

    let mut events = Vec::new();
    let mut current = String::new();
    for line in body.lines() {
        let line = line.trim_end();
        if let Some(data) = line.strip_prefix("data:") {
            if !current.is_empty() {
                current.push('\n');
            }
            current.push_str(data.trim_start());
        } else if line.is_empty() && !current.trim().is_empty() {
            events.push(std::mem::take(&mut current));
        }
    }
    if !current.trim().is_empty() {
        events.push(current);
    }

    for event in events {
        let event = event.trim();
        if event.is_empty() || event == "[DONE]" {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(event) {
            return Ok(value);
        }
    }

    Err("MCP HTTP response is not valid JSON".to_string())
}

fn extract_mcp_headers(config: &serde_json::Map<String, Value>) -> BTreeMap<String, String> {
    config
        .get("headers")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(key, value)| value.as_str().map(|value| (key.clone(), value.to_string())))
        .collect()
}

fn mcp_server_needs_auth(
    config: &serde_json::Map<String, Value>,
    headers: &BTreeMap<String, String>,
) -> bool {
    if has_mcp_authorization_header(headers) {
        return false;
    }

    let auth_type = config
        .get("authType")
        .and_then(Value::as_str)
        .map(|value| value.to_ascii_lowercase());
    if matches!(auth_type.as_deref(), Some("oauth" | "bearer")) {
        return true;
    }

    config
        .get("_oauth")
        .and_then(Value::as_object)
        .and_then(|oauth| oauth.get("accessToken"))
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
}

fn has_mcp_authorization_header(headers: &BTreeMap<String, String>) -> bool {
    headers
        .keys()
        .any(|key| key.eq_ignore_ascii_case("authorization"))
}

fn extract_mcp_authorization_header(headers: &BTreeMap<String, String>) -> Option<String> {
    headers.iter().find_map(|(key, value)| {
        if key.eq_ignore_ascii_case("authorization") {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn safe_mcp_stdio_environment() -> BTreeMap<String, String> {
    ["HOME", "PATH", "SHELL", "TMPDIR", "TEMP", "TMP", "USER"]
        .into_iter()
        .filter_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| (key.to_string(), value))
        })
        .collect()
}

fn write_mcp_stdio_message(stdin: &mut impl Write, message: &Value) -> Result<(), String> {
    let body = serde_json::to_string(message).map_err(|_| "无法序列化 MCP 请求".to_string())?;
    stdin
        .write_all(format!("Content-Length: {}\r\n\r\n{}", body.len(), body).as_bytes())
        .map_err(|_| "无法写入 MCP 请求".to_string())?;
    stdin.flush().map_err(|_| "无法写入 MCP 请求".to_string())
}

fn read_mcp_stdio_message(reader: &mut impl BufRead) -> Result<Option<Value>, String> {
    let mut first_line = String::new();
    if reader
        .read_line(&mut first_line)
        .map_err(|_| "无法读取 MCP 响应".to_string())?
        == 0
    {
        return Ok(None);
    }
    let first_line = first_line.trim_end_matches(['\r', '\n']);

    if first_line
        .to_ascii_lowercase()
        .starts_with("content-length:")
    {
        let length = first_line
            .split_once(':')
            .and_then(|(_, value)| value.trim().parse::<usize>().ok())
            .ok_or_else(|| "MCP 响应长度无效".to_string())?;

        loop {
            let mut header = String::new();
            reader
                .read_line(&mut header)
                .map_err(|_| "无法读取 MCP 响应".to_string())?;
            if header.trim_end_matches(['\r', '\n']).is_empty() {
                break;
            }
        }

        let mut body = vec![0_u8; length];
        reader
            .read_exact(&mut body)
            .map_err(|_| "无法读取 MCP 响应".to_string())?;
        let message: Value =
            serde_json::from_slice(&body).map_err(|_| "MCP 响应格式无效".to_string())?;
        return Ok(Some(message));
    }

    if first_line.trim().is_empty() {
        return Ok(None);
    }

    let message: Value =
        serde_json::from_str(first_line).map_err(|_| "MCP 响应格式无效".to_string())?;
    Ok(Some(message))
}

fn wait_for_mcp_response(receiver: &mpsc::Receiver<Value>, id: i64) -> Result<Value, String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(3);

    loop {
        let now = std::time::Instant::now();
        if now >= deadline {
            return Err("MCP tools discovery timed out".to_string());
        }

        let remaining = deadline.saturating_duration_since(now);
        let message = receiver
            .recv_timeout(remaining.min(Duration::from_millis(250)))
            .map_err(|_| "MCP tools discovery timed out".to_string())?;
        if message.get("id").and_then(Value::as_i64) == Some(id) {
            return Ok(message);
        }
    }
}

fn parse_mcp_tools_response(response: &Value) -> Vec<AiMcpToolInfo> {
    response
        .get("result")
        .and_then(|result| result.get("tools"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let name = tool.get("name").and_then(Value::as_str)?.trim();
            if name.is_empty() {
                return None;
            }

            Some(AiMcpToolInfo {
                name: name.to_string(),
                description: tool
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned),
            })
        })
        .collect()
}

fn list_codex_mcp_servers() -> Vec<AiMcpServerItem> {
    run_codex_cli_checked(
        &["mcp".to_string(), "list".to_string(), "--json".to_string()],
        None,
    )
    .and_then(|stdout| parse_codex_mcp_servers_with_tools(&stdout))
    .unwrap_or_default()
}

#[cfg(test)]
fn parse_codex_mcp_servers(raw: &str) -> Result<Vec<AiMcpServerItem>, String> {
    parse_codex_mcp_servers_inner(raw, false)
}

fn parse_codex_mcp_servers_with_tools(raw: &str) -> Result<Vec<AiMcpServerItem>, String> {
    parse_codex_mcp_servers_inner(raw, true)
}

fn parse_codex_mcp_servers_inner(
    raw: &str,
    include_tools: bool,
) -> Result<Vec<AiMcpServerItem>, String> {
    let parsed: Value = serde_json::from_str(raw).map_err(|_| "Codex MCP JSON 无效".to_string())?;
    let entries = parsed
        .as_array()
        .ok_or_else(|| "Codex MCP JSON 必须是数组".to_string())?;
    let mut servers = Vec::new();

    for entry in entries {
        let Some(entry) = entry.as_object() else {
            continue;
        };
        let Some(name) = entry.get("name").and_then(Value::as_str) else {
            continue;
        };
        if !is_valid_entry_name(name) {
            continue;
        }
        let enabled = entry
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let auth_status = entry
            .get("auth_status")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let Some(transport) = entry.get("transport").and_then(Value::as_object) else {
            continue;
        };
        let transport_type = transport
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_ascii_lowercase();
        let url = transport
            .get("url")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let command = transport
            .get("command")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let args = transport
            .get("args")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        let connection_type = match transport_type.as_str() {
            "http" | "sse" | "streamable_http" => "http",
            "stdio" => "stdio",
            _ => "unknown",
        };
        let mut env_keys = codex_mcp_env_keys(transport);
        env_keys.sort();
        env_keys.dedup();
        let needs_auth = codex_mcp_needs_auth(auth_status.as_deref());
        let auth_type = codex_mcp_auth_type(auth_status.as_deref()).map(ToOwned::to_owned);
        let has_auth_header = codex_mcp_has_auth_header(transport);
        let discovery_result = if include_tools && enabled && !needs_auth {
            discover_codex_mcp_tools(connection_type, transport, &command, &args)
        } else {
            None
        };
        let discovery_error = discovery_result
            .as_ref()
            .and_then(|result| result.as_ref().err())
            .cloned();
        let tools = discovery_result
            .and_then(Result::ok)
            .unwrap_or_default();
        let status = if !enabled {
            "disabled"
        } else if needs_auth {
            "needs-auth"
        } else if discovery_error.is_some() {
            "failed"
        } else if connection_type == "http" || connection_type == "stdio" {
            "connected"
        } else {
            "configured"
        };

        servers.push(AiMcpServerItem {
            name: name.to_string(),
            provider: "codex".to_string(),
            group_name: "Global".to_string(),
            project_path: None,
            source: "global".to_string(),
            status: status.to_string(),
            enabled,
            connection_type: connection_type.to_string(),
            command,
            args,
            url,
            env_keys,
            auth_type,
            auth_status,
            has_auth_header,
            needs_auth,
            plugin_name: None,
            error: discovery_error,
            tools,
        });
    }

    servers.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(servers)
}

fn discover_codex_mcp_tools(
    connection_type: &str,
    transport: &serde_json::Map<String, Value>,
    command: &Option<String>,
    args: &[String],
) -> Option<Result<Vec<AiMcpToolInfo>, String>> {
    match connection_type {
        "stdio" => Some(
            command
                .as_deref()
                .map(|command| {
                    discover_stdio_mcp_tools_result(
                        command,
                        args,
                        &codex_mcp_stdio_env(transport),
                    )
                })
                .unwrap_or_else(|| Err("MCP stdio command missing".to_string())),
        ),
        "http" => Some(
            transport
                .get("url")
                .and_then(Value::as_str)
                .map(|url| {
                    tauri::async_runtime::block_on(discover_http_mcp_tools_result(
                        url,
                        &codex_mcp_http_headers(transport),
                    ))
                })
                .unwrap_or_else(|| Err("MCP HTTP URL is invalid".to_string())),
        ),
        _ => None,
    }
}

fn codex_mcp_needs_auth(auth_status: Option<&str>) -> bool {
    auth_status
        .map(|value| value.eq_ignore_ascii_case("not_logged_in"))
        .unwrap_or(false)
}

fn codex_mcp_auth_type(auth_status: Option<&str>) -> Option<&'static str> {
    match auth_status
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "bearer_token" => Some("bearer"),
        "o_auth" => Some("oauth"),
        _ => None,
    }
}

fn codex_mcp_has_auth_header(transport: &serde_json::Map<String, Value>) -> bool {
    transport
        .get("http_headers")
        .and_then(Value::as_object)
        .is_some_and(|headers| {
            headers
                .keys()
                .any(|key| key.eq_ignore_ascii_case("authorization"))
        })
        || transport
            .get("env_http_headers")
            .and_then(Value::as_object)
            .is_some_and(|headers| {
                headers
                    .keys()
                    .any(|key| key.eq_ignore_ascii_case("authorization"))
            })
        || transport
            .get("bearer_token_env_var")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
}

fn codex_mcp_stdio_env(transport: &serde_json::Map<String, Value>) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();

    if let Some(values) = transport.get("env").and_then(Value::as_object) {
        for (key, value) in values {
            if let Some(value) = value.as_str() {
                env.insert(key.clone(), value.to_string());
            }
        }
    }

    if let Some(env_vars) = transport.get("env_vars").and_then(Value::as_array) {
        for key in env_vars.iter().filter_map(Value::as_str) {
            if env.contains_key(key) {
                continue;
            }
            if let Ok(value) = std::env::var(key) {
                if !value.is_empty() {
                    env.insert(key.to_string(), value);
                }
            }
        }
    }

    env
}

fn codex_mcp_http_headers(transport: &serde_json::Map<String, Value>) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();

    if let Some(values) = transport.get("http_headers").and_then(Value::as_object) {
        for (key, value) in values {
            if let Some(value) = value.as_str() {
                headers.insert(key.clone(), value.to_string());
            }
        }
    }

    if let Some(env_http_headers) = transport.get("env_http_headers").and_then(Value::as_object) {
        for (header_name, env_name) in env_http_headers {
            let Some(env_name) = env_name.as_str() else {
                continue;
            };
            if let Ok(value) = std::env::var(env_name) {
                if !value.is_empty() {
                    headers.insert(header_name.clone(), value);
                }
            }
        }
    }

    if !headers
        .keys()
        .any(|key| key.eq_ignore_ascii_case("authorization"))
    {
        if let Some(env_name) = transport
            .get("bearer_token_env_var")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if let Ok(value) = std::env::var(env_name) {
                let token = value.trim();
                if !token.is_empty() {
                    headers.insert("Authorization".to_string(), format!("Bearer {token}"));
                }
            }
        }
    }

    headers
}

fn codex_mcp_env_keys(transport: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut keys = Vec::new();

    if let Some(env) = transport.get("env").and_then(Value::as_object) {
        keys.extend(env.keys().cloned());
    }

    if let Some(env_vars) = transport.get("env_vars").and_then(Value::as_array) {
        keys.extend(
            env_vars
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned),
        );
    }

    if let Some(env_http_headers) = transport.get("env_http_headers").and_then(Value::as_object) {
        keys.extend(
            env_http_headers
                .values()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned),
        );
    }

    if let Some(bearer_env) = transport
        .get("bearer_token_env_var")
        .and_then(Value::as_str)
    {
        keys.push(bearer_env.to_string());
    }

    keys.into_iter()
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .collect()
}

fn run_codex_cli_checked(args: &[String], cwd: Option<&str>) -> Result<String, String> {
    let mut command = Command::new("codex");
    command.args(args);

    if let Some(cwd) = cwd.map(str::trim).filter(|value| !value.is_empty()) {
        command.current_dir(cwd);
    }

    let output = command
        .output()
        .map_err(|_| "无法启动 Codex CLI".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Codex CLI 执行失败".to_string()
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn approved_plugin_mcp_server_ids(home: &Path) -> Result<BTreeSet<String>, String> {
    let settings_path = home.join(".claude/settings.json");
    let raw = match fs::read_to_string(settings_path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeSet::new()),
        Err(_) => return Err("无法读取 Claude settings".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let approved = parsed
        .get("approvedPluginMcpServers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect();

    Ok(approved)
}

fn discover_plugin_mcp_server_names(path: &Path) -> Result<Vec<String>, String> {
    let raw = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("无法读取 plugin MCP 配置".to_string()),
    };
    let parsed: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let servers = parsed
        .get("mcpServers")
        .and_then(Value::as_object)
        .or_else(|| parsed.as_object());
    let Some(servers) = servers else {
        return Ok(Vec::new());
    };

    let mut names = servers
        .iter()
        .filter(|(name, value)| name.as_str() != "mcpServers" && value.is_object())
        .map(|(name, _)| name.clone())
        .collect::<Vec<_>>();
    names.sort();

    Ok(names)
}

fn parse_markdown_with_frontmatter(raw: &str) -> ParsedMarkdown {
    let normalized = raw.replace("\r\n", "\n");
    let Some(after_open) = normalized.strip_prefix("---\n") else {
        return ParsedMarkdown {
            frontmatter: BTreeMap::new(),
            body: normalized.trim_start().to_string(),
        };
    };
    let Some(close_index) = after_open.find("\n---") else {
        return ParsedMarkdown {
            frontmatter: BTreeMap::new(),
            body: normalized.trim_start().to_string(),
        };
    };

    let frontmatter_raw = &after_open[..close_index];
    let body_start = close_index + "\n---".len();
    let body = after_open[body_start..]
        .trim_start_matches('\n')
        .to_string();
    let mut frontmatter = BTreeMap::new();

    for line in frontmatter_raw.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        frontmatter.insert(key.trim().to_string(), unquote(value.trim()));
    }

    ParsedMarkdown { frontmatter, body }
}

fn parse_string_list(value: Option<&String>) -> Vec<String> {
    value
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn read_sorted_dir(dir: &Path) -> Result<Vec<fs::DirEntry>, String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("无法读取 AI 设置目录".to_string()),
    };
    let mut entries = entries
        .filter_map(Result::ok)
        .collect::<Vec<fs::DirEntry>>();
    entries.sort_by_key(|entry| entry.file_name());

    Ok(entries)
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .ok_or_else(|| "无法定位用户目录".to_string())
}

fn validate_project_root(root_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root_path);
    if path.is_dir() {
        Ok(path)
    } else {
        Err("工作区根目录不存在".to_string())
    }
}

fn is_valid_entry_name(name: &str) -> bool {
    !name.contains("..") && !name.contains('/') && !name.contains('\\')
}

fn display_path(path: &Path, project_root: Option<&Path>, home: &Path) -> String {
    if let Some(project_root) = project_root {
        if let Ok(relative) = path.strip_prefix(project_root) {
            return relative.to_string_lossy().to_string();
        }
    }

    if !home.as_os_str().is_empty() {
        if let Ok(relative) = path.strip_prefix(home) {
            return format!("~/{}", relative.to_string_lossy());
        }
    }

    path.to_string_lossy().to_string()
}

fn unquote(value: &str) -> String {
    value
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn read_error(_: std::io::Error) -> String {
    "无法读取 AI 设置文件".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read as _;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn resolves_global_mcp_sentinel_without_project_root() {
        assert_eq!(
            resolve_mcp_workspace_root(MCP_GLOBAL_PROJECT_SENTINEL).expect("global root sentinel"),
            None,
        );
        assert_eq!(
            normalize_mcp_project_path(Some(MCP_GLOBAL_PROJECT_SENTINEL)),
            None,
        );
        assert_eq!(
            resolve_claude_mcp_auth_project(None, Some(MCP_GLOBAL_PROJECT_SENTINEL))
                .expect("global auth project"),
            None,
        );
        assert!(resolve_claude_mcp_auth_project(None, Some("/tmp/project")).is_err());
    }

    #[test]
    fn lists_user_project_and_plugin_skills() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &home.join(".claude/skills/user-skill/SKILL.md"),
            "---\nname: user-skill\ndescription: User skill\n---\n\nUse user skill.",
        );
        write_text(
            &project.join(".claude/skills/project-skill/SKILL.md"),
            "---\nname: project-skill\ndescription: Project skill\n---\n\nUse project skill.",
        );
        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:plugin-one"]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/.claude-plugin/marketplace.json"),
            r#"{"name":"market","plugins":[{"name":"plugin-one","version":"1.2.3","description":"Plugin one","source":"plugin-one"}]}"#,
        );
        write_text(
            &home.join(
                ".claude/plugins/marketplaces/market/plugin-one/skills/plugin-skill/SKILL.md",
            ),
            "---\nname: plugin-skill\ndescription: Plugin skill\n---\n\nUse plugin skill.",
        );

        let skills = list_ai_skills_for_paths(&home, Some(&project)).expect("skills");

        assert_eq!(
            skills
                .iter()
                .map(|skill| (skill.name.as_str(), skill.source.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("project-skill", "project"),
                ("user-skill", "user"),
                ("plugin-skill", "plugin"),
            ],
        );
        assert_eq!(skills[2].plugin_name.as_deref(), Some("market:plugin-one"));
    }

    #[test]
    fn lists_commands_with_namespaces_and_frontmatter() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &home.join(".claude/commands/git/commit.md"),
            "---\ndescription: Commit changes\nargument-hint: <message>\n---\n\nRun commit.",
        );
        write_text(
            &project.join(".claude/commands/project-task.md"),
            "---\nname: project-task\ndescription: Project command\n---\n\nRun project command.",
        );

        let commands = list_ai_commands_for_paths(&home, Some(&project)).expect("commands");

        assert_eq!(
            commands
                .iter()
                .map(|command| (command.name.as_str(), command.source.as_str()))
                .collect::<Vec<_>>(),
            vec![("project-task", "project"), ("git:commit", "user")],
        );
        assert_eq!(commands[1].argument_hint.as_deref(), Some("<message>"));
    }

    #[test]
    fn lists_custom_agents_with_model_and_tools() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &home.join(".claude/agents/reviewer.md"),
            "---\nname: reviewer\ndescription: Reviews code\ntools: Read, Grep\ndisallowedTools: Bash\nmodel: sonnet\n---\n\nReview carefully.",
        );
        write_text(
            &project.join(".claude/agents/planner.md"),
            "---\nname: planner\ndescription: Plans work\nmodel: inherit\n---\n\nPlan carefully.",
        );

        let agents = list_ai_custom_agents_for_paths(&home, Some(&project)).expect("agents");

        assert_eq!(
            agents
                .iter()
                .map(|agent| (agent.name.as_str(), agent.source.as_str()))
                .collect::<Vec<_>>(),
            vec![("planner", "project"), ("reviewer", "user")],
        );
        assert_eq!(agents[1].tools, vec!["Read", "Grep"]);
        assert_eq!(agents[1].disallowed_tools, vec!["Bash"]);
        assert_eq!(agents[1].model.as_deref(), Some("sonnet"));
    }

    #[test]
    fn lists_plugins_with_component_inventory_and_disabled_state() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:enabled-plugin"]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/.claude-plugin/marketplace.json"),
            r#"{"name":"market","plugins":[{"name":"enabled-plugin","version":"1.0.0","description":"Enabled","source":"enabled-plugin"},{"name":"disabled-plugin","version":"2.0.0","description":"Disabled","source":"disabled-plugin","tags":["lsp"]}]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/enabled-plugin/commands/fix.md"),
            "---\ndescription: Fix things\n---\n\nFix.",
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/enabled-plugin/skills/doc/SKILL.md"),
            "---\nname: doc\ndescription: Write docs\n---\n\nDoc.",
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/enabled-plugin/agents/reviewer.md"),
            "---\nname: reviewer\ndescription: Review\n---\n\nReview.",
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/enabled-plugin/.mcp.json"),
            r#"{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7"]}}}"#,
        );
        fs::create_dir_all(home.join(".claude/plugins/marketplaces/market/disabled-plugin"))
            .expect("create disabled plugin dir");

        let plugins = list_ai_plugins_for_home(&home).expect("plugins");

        assert_eq!(plugins.len(), 2);
        assert_eq!(plugins[0].source, "market:enabled-plugin");
        assert!(!plugins[0].is_disabled);
        assert_eq!(plugins[0].components.commands[0].name, "fix");
        assert_eq!(plugins[0].components.skills[0].name, "doc");
        assert_eq!(plugins[0].components.agents[0].name, "reviewer");
        assert_eq!(plugins[0].components.mcp_servers, vec!["context7"]);
        assert_eq!(plugins[1].source, "market:disabled-plugin");
        assert!(plugins[1].is_disabled);
        assert_eq!(plugins[1].tags, vec!["lsp"]);
    }

    #[test]
    fn manages_1code_style_anthropic_account_metadata_without_secret_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".madora/anthropic-accounts.json"),
            r#"{"activeAccountId":"acct-work","accounts":[{"id":"acct-work","email":"work@example.com","displayName":"Work Claude","connectedAt":"2026-06-24T10:00:00.000Z","lastUsedAt":null},{"id":"acct-personal","email":"personal@example.com","displayName":"Personal Claude","connectedAt":"2026-06-24T11:00:00.000Z","lastUsedAt":null}]}"#,
        );

        let accounts = list_ai_anthropic_accounts_for_home(&home).expect("list accounts");
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].display_name.as_deref(), Some("Work Claude"));
        assert!(accounts[0].is_active);
        assert!(!accounts[1].is_active);
        assert!(!serde_json::to_string(&accounts)
            .expect("serialize accounts")
            .contains("oauth"));

        set_ai_anthropic_account_active_for_home(&home, "acct-personal")
            .expect("switch active account");
        rename_ai_anthropic_account_for_home(&home, "acct-personal", "Personal Renamed")
            .expect("rename account");
        delete_ai_anthropic_account_for_home(&home, "acct-work").expect("delete old account");

        let accounts = list_ai_anthropic_accounts_for_home(&home).expect("list updated accounts");
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, "acct-personal");
        assert_eq!(
            accounts[0].display_name.as_deref(),
            Some("Personal Renamed")
        );
        assert!(accounts[0].is_active);
        assert!(accounts[0].last_used_at.is_some());
    }

    #[test]
    fn imports_anthropic_account_token_to_secret_store_and_reads_active_token() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let secrets = InMemoryAnthropicAccountSecretStore::default();

        let account = import_ai_anthropic_account_for_home(
            &home,
            &secrets,
            "oauth-token",
            Some("work@example.com"),
            Some("Work Claude"),
        )
        .expect("import account");

        assert_eq!(account.display_name.as_deref(), Some("Work Claude"));
        assert!(account.is_active);
        assert_eq!(
            read_active_anthropic_account_token_for_home(&home, &secrets)
                .expect("read active token")
                .as_deref(),
            Some("oauth-token"),
        );

        let raw = fs::read_to_string(home.join(".madora/anthropic-accounts.json"))
            .expect("read account metadata");
        assert!(raw.contains("Work Claude"));
        assert!(!raw.contains("oauth-token"));

        delete_ai_anthropic_account_for_home_with_secrets(&home, &secrets, &account.id)
            .expect("delete account");
        assert_eq!(
            read_active_anthropic_account_token_for_home(&home, &secrets)
                .expect("read deleted active token"),
            None,
        );
    }

    #[test]
    fn lists_legacy_anthropic_override_secret_without_exposing_token() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let secrets = InMemoryAnthropicAccountSecretStore::default();
        secrets
            .save_legacy_override_token("legacy-oauth-token")
            .expect("save legacy token");

        let accounts = list_ai_anthropic_accounts_for_home_with_secrets(&home, &secrets)
            .expect("list legacy account");

        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, "legacy-default");
        assert_eq!(
            accounts[0].display_name.as_deref(),
            Some("Anthropic Account")
        );
        assert!(accounts[0].is_active);
        assert!(!serde_json::to_string(&accounts)
            .expect("serialize accounts")
            .contains("legacy-oauth-token"));
        assert_eq!(
            read_active_anthropic_account_token_for_home(&home, &secrets)
                .expect("read legacy active token")
                .as_deref(),
            Some("legacy-oauth-token"),
        );
    }

    #[test]
    fn builds_claude_code_auth_endpoints_with_safe_http_urls_only() {
        assert_eq!(
            join_claude_code_auth_url(
                "https://21st.dev/path?debug=1",
                "/api/auth/claude-code/start"
            )
            .expect("join start url"),
            "https://21st.dev/api/auth/claude-code/start"
        );
        assert_eq!(
            claude_code_sandbox_endpoint("https://sandbox.example/base", "session-1", "status")
                .expect("join sandbox url"),
            "https://sandbox.example/api/auth/session-1/status"
        );
        assert!(
            claude_code_sandbox_endpoint("https://sandbox.example", "../session", "status")
                .is_err()
        );
        assert!(
            join_claude_code_auth_url("file:///tmp/auth", "/api/auth/claude-code/start").is_err()
        );
    }

    #[test]
    fn lists_mcp_servers_without_secret_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &home.join(".claude.json"),
            r#"{"mcpServers":{"global-search":{"command":"/bin/false","args":[],"env":{"API_KEY":"secret-value"},"disabled":false}}}"#,
        );
        write_text(
            &project.join(".mcp.json"),
            r#"{"mcpServers":{"project-reader":{"url":"https://mcp.example.test/sse","enabled":true}}}"#,
        );
        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:plugin-one"],"approvedPluginMcpServers":["market:plugin-one:plugin-mcp"]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/.claude-plugin/marketplace.json"),
            r#"{"name":"market","plugins":[{"name":"plugin-one","version":"1.0.0","source":"plugin-one"}]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/plugin-one/.mcp.json"),
            r#"{"mcpServers":{"plugin-mcp":{"command":"/bin/false","args":[],"env":{"TOKEN":"hidden"}}}}"#,
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");

        assert_eq!(
            servers
                .iter()
                .map(|server| {
                    (
                        server.name.as_str(),
                        server.group_name.as_str(),
                        server.connection_type.as_str(),
                    )
                })
                .collect::<Vec<_>>(),
            vec![
                ("global-search", "Global", "stdio"),
                ("project-reader", "project", "http"),
                ("plugin-mcp", "Plugin: market:plugin-one", "stdio"),
            ],
        );
        assert_eq!(servers[0].env_keys, vec!["API_KEY"]);
        assert_eq!(servers[2].env_keys, vec!["TOKEN"]);
        assert!(!serde_json::to_string(&servers)
            .expect("serialize")
            .contains("secret-value"));
        assert!(!serde_json::to_string(&servers)
            .expect("serialize")
            .contains("hidden"));
    }

    #[test]
    fn lists_unapproved_plugin_mcp_server_as_pending_without_discovery() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        let marker = temp.path().join("plugin-mcp-started");
        let server_script = temp.path().join("plugin-mcp.sh");

        write_text(
            &server_script,
            &format!(
                "#!/bin/sh\nprintf started > {}\nexit 0\n",
                shell_quote_path(&marker),
            ),
        );
        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:plugin-one"]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/.claude-plugin/marketplace.json"),
            r#"{"name":"market","plugins":[{"name":"plugin-one","version":"1.0.0","source":"plugin-one"}]}"#,
        );
        write_text(
            &home.join(".claude/plugins/marketplaces/market/plugin-one/.mcp.json"),
            &format!(
                r#"{{"mcpServers":{{"plugin-mcp":{{"command":"/bin/sh","args":[{}]}}}}}}"#,
                serde_json::to_string(&server_script.to_string_lossy()).expect("json path"),
            ),
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");
        let plugin_server = servers
            .iter()
            .find(|server| server.name == "plugin-mcp")
            .expect("plugin mcp server");

        assert_eq!(plugin_server.status, "pending-approval");
        assert_eq!(
            plugin_server.plugin_name.as_deref(),
            Some("market:plugin-one")
        );
        assert!(plugin_server.tools.is_empty());
        assert!(!marker.exists());
    }

    #[test]
    fn approves_and_revokes_plugin_mcp_server_without_dropping_settings() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:plugin-one"],"theme":"dark"}"#,
        );

        set_ai_plugin_mcp_server_approved_for_home(&home, "market:plugin-one", "plugin-mcp", true)
            .expect("approve plugin mcp");
        set_ai_plugin_mcp_server_approved_for_home(&home, "market:plugin-one", "plugin-mcp", true)
            .expect("approve plugin mcp idempotently");

        let approved_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read approved");
        let approved: Value = serde_json::from_str(&approved_raw).expect("parse approved");
        assert_eq!(approved.get("theme").and_then(Value::as_str), Some("dark"));
        assert_eq!(
            approved
                .get("approvedPluginMcpServers")
                .and_then(Value::as_array)
                .expect("approved plugin mcp servers")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec!["market:plugin-one:plugin-mcp"],
        );

        set_ai_plugin_mcp_server_approved_for_home(&home, "market:plugin-one", "plugin-mcp", false)
            .expect("revoke plugin mcp");

        let revoked_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read revoked");
        let revoked: Value = serde_json::from_str(&revoked_raw).expect("parse revoked");
        assert_eq!(
            revoked
                .get("approvedPluginMcpServers")
                .and_then(Value::as_array)
                .expect("approved plugin mcp servers")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            Vec::<&str>::new(),
        );
        assert_eq!(revoked.get("theme").and_then(Value::as_str), Some("dark"));
    }

    #[test]
    fn toggles_claude_include_co_authored_by_without_dropping_settings() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:plugin-one"],"theme":"dark"}"#,
        );

        set_ai_claude_include_co_authored_by_for_home(&home, false)
            .expect("disable co-authored-by");
        let disabled_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read disabled");
        let disabled: Value = serde_json::from_str(&disabled_raw).expect("parse disabled");
        assert_eq!(disabled.get("theme").and_then(Value::as_str), Some("dark"));
        assert_eq!(
            disabled
                .get("enabledPlugins")
                .and_then(Value::as_array)
                .expect("enabled plugins")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec!["market:plugin-one"],
        );
        assert_eq!(
            disabled
                .get("includeCoAuthoredBy")
                .and_then(Value::as_bool),
            Some(false),
        );

        set_ai_claude_include_co_authored_by_for_home(&home, true)
            .expect("enable co-authored-by");
        let enabled_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read enabled");
        let enabled: Value = serde_json::from_str(&enabled_raw).expect("parse enabled");
        assert_eq!(enabled.get("theme").and_then(Value::as_str), Some("dark"));
        assert!(enabled.get("includeCoAuthoredBy").is_none());
    }

    #[test]
    fn approves_and_revokes_all_plugin_mcp_servers() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".claude/settings.json"),
            r#"{"approvedPluginMcpServers":["market:plugin-one:existing","other:plugin:server"]}"#,
        );

        set_ai_plugin_mcp_servers_approved_for_home(
            &home,
            "market:plugin-one",
            &[
                "context7".to_string(),
                "browser".to_string(),
                "context7".to_string(),
            ],
            true,
        )
        .expect("approve all plugin mcp servers");
        let approved_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read approved settings");
        let approved: Value = serde_json::from_str(&approved_raw).expect("parse approved");
        assert_eq!(
            approved
                .get("approvedPluginMcpServers")
                .and_then(Value::as_array)
                .expect("approved servers")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec![
                "market:plugin-one:existing",
                "other:plugin:server",
                "market:plugin-one:context7",
                "market:plugin-one:browser",
            ],
        );

        set_ai_plugin_mcp_servers_approved_for_home(
            &home,
            "market:plugin-one",
            &["context7".to_string(), "browser".to_string()],
            false,
        )
        .expect("revoke all plugin mcp servers");
        let revoked_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read revoked settings");
        let revoked: Value = serde_json::from_str(&revoked_raw).expect("parse revoked");
        assert_eq!(
            revoked
                .get("approvedPluginMcpServers")
                .and_then(Value::as_array)
                .expect("approved servers")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec!["other:plugin:server"],
        );
    }

    #[test]
    fn lists_stdio_mcp_server_tools_when_discovery_succeeds() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        let server_script = temp.path().join("mock-mcp.sh");

        write_text(
            &server_script,
            r#"#!/bin/sh
respond() {
  body="$1"
  bytes=$(printf '%s' "$body" | wc -c | tr -d ' ')
  printf 'Content-Length: %s\r\n\r\n%s' "$bytes" "$body"
}

length=""
while IFS= read -r header; do
  header=$(printf '%s' "$header" | tr -d '\r')
  case "$header" in
    Content-Length:*)
      length=$(printf '%s' "$header" | sed 's/Content-Length: //')
      ;;
    "")
      if [ -n "$length" ]; then
        body=$(dd bs=1 count="$length" 2>/dev/null)
        length=""
        case "$body" in
          *initialize*)
            respond '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"mock-mcp","version":"1.0.0"}}}'
            ;;
          *tools/list*)
            respond '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"read_note","description":"Read a note"},{"name":"search_notes"}]}}'
            exit 0
            ;;
        esac
      fi
      ;;
  esac
done
"#,
        );
        write_text(
            &home.join(".claude.json"),
            &format!(
                r#"{{"mcpServers":{{"mock-mcp":{{"command":"/bin/sh","args":[{}]}}}}}}"#,
                serde_json::to_string(&server_script.to_string_lossy()).expect("json path"),
            ),
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");
        let mock = servers
            .iter()
            .find(|server| server.name == "mock-mcp")
            .expect("mock server");

        assert_eq!(mock.status, "connected");
        assert_eq!(mock.tools.len(), 2);
        assert_eq!(mock.tools[0].name, "read_note");
        assert_eq!(mock.tools[0].description.as_deref(), Some("Read a note"));
        assert_eq!(mock.tools[1].name, "search_notes");
    }

    #[test]
    fn returns_mcp_discovery_error_when_stdio_server_fails_to_start() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &home.join(".claude.json"),
            r#"{"mcpServers":{"broken-mcp":{"command":"/definitely/missing/mcp-server","env":{"SECRET_TOKEN":"hidden"}}}}"#,
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");
        let broken = servers
            .iter()
            .find(|server| server.name == "broken-mcp")
            .expect("broken server");
        let serialized = serde_json::to_string(broken).expect("serialize broken server");

        assert_eq!(broken.status, "failed");
        assert_eq!(broken.error.as_deref(), Some("无法启动 MCP server"));
        assert!(broken.tools.is_empty());
        assert_eq!(broken.env_keys, vec!["SECRET_TOKEN"]);
        assert!(!serialized.contains("hidden"));
    }

    #[test]
    fn lists_http_mcp_server_tools_when_discovery_succeeds() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock mcp http");
        let url = format!(
            "http://{}/mcp",
            listener.local_addr().expect("listener address")
        );

        thread::spawn(move || {
            for stream in listener.incoming().take(2) {
                let mut stream = stream.expect("accept mock mcp http");
                let request = read_mock_http_request(&mut stream);
                let response = if request.contains(r#""method":"initialize""#) {
                    r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"mock-http","version":"1.0.0"}}}"#
                } else {
                    r#"{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"web_search","description":"Search the web"},{"name":"fetch_page"}]}}"#
                };
                write_mock_http_json(&mut stream, response);
            }
        });

        write_text(
            &project.join(".mcp.json"),
            &format!(
                r#"{{"mcpServers":{{"mock-http":{{"url":{}}}}}}}"#,
                serde_json::to_string(&url).expect("json url"),
            ),
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");
        let mock = servers
            .iter()
            .find(|server| server.name == "mock-http")
            .expect("mock http server");

        assert_eq!(mock.status, "connected");
        assert_eq!(mock.tools.len(), 2);
        assert_eq!(mock.tools[0].name, "web_search");
        assert_eq!(mock.tools[0].description.as_deref(), Some("Search the web"));
        assert_eq!(mock.tools[1].name, "fetch_page");
    }

    #[test]
    fn marks_http_mcp_server_as_needing_auth_without_authorization_header() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");

        write_text(
            &project.join(".mcp.json"),
            r#"{"mcpServers":{"private-http":{"url":"http://127.0.0.1:9/mcp","authType":"bearer"}}}"#,
        );

        let servers = list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("mcp servers");
        let private = servers
            .iter()
            .find(|server| server.name == "private-http")
            .expect("private http server");

        assert_eq!(private.status, "needs-auth");
        assert!(private.tools.is_empty());
    }

    #[test]
    fn creates_updates_and_deletes_user_and_project_skills_and_commands() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_skill_for_paths(
            &home,
            Some(&project),
            "user",
            "My Skill!",
            "Use for docs",
            "Write docs carefully.",
        )
        .expect("create user skill");
        create_ai_command_for_paths(
            &home,
            Some(&project),
            "project",
            "git/commit",
            "Commit changes",
            "Use commit message.",
            Some("<message>"),
        )
        .expect("create project command");

        let user_skill_path = home.join(".claude/skills/my-skill/SKILL.md");
        let project_command_path = project.join(".claude/commands/git/commit.md");
        assert!(user_skill_path.is_file());
        assert!(project_command_path.is_file());
        assert!(fs::read_to_string(&user_skill_path)
            .expect("read skill")
            .contains("description: Use for docs"));
        assert!(fs::read_to_string(&project_command_path)
            .expect("read command")
            .contains("argument-hint: <message>"));

        update_ai_skill_for_paths(
            &home,
            Some(&project),
            "user",
            "my-skill",
            "Updated docs",
            "Updated instructions.",
        )
        .expect("update skill");
        update_ai_command_for_paths(
            &home,
            Some(&project),
            "project",
            "git/commit",
            "Updated commit",
            "Updated command.",
            None,
        )
        .expect("update command");

        assert!(fs::read_to_string(&user_skill_path)
            .expect("read updated skill")
            .contains("Updated instructions."));
        assert!(!fs::read_to_string(&project_command_path)
            .expect("read updated command")
            .contains("argument-hint"));

        delete_ai_skill_for_paths(&home, Some(&project), "user", "my-skill").expect("delete skill");
        delete_ai_command_for_paths(&home, Some(&project), "project", "git/commit")
            .expect("delete command");

        assert!(!user_skill_path.exists());
        assert!(!project_command_path.exists());
    }

    #[test]
    fn creates_updates_and_deletes_user_and_project_custom_agents() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_custom_agent_for_paths(
            &home,
            Some(&project),
            "project",
            "Code Reviewer",
            "Reviews code",
            "Review carefully.",
            &["Read".to_string(), "Grep".to_string()],
            &["Bash".to_string()],
            Some("sonnet"),
        )
        .expect("create custom agent");

        let agent_path = project.join(".claude/agents/code-reviewer.md");
        let created = fs::read_to_string(&agent_path).expect("read created agent");
        assert!(created.contains("description: Reviews code"));
        assert!(created.contains("tools: Read, Grep"));
        assert!(created.contains("disallowedTools: Bash"));
        assert!(created.contains("model: sonnet"));

        update_ai_custom_agent_for_paths(
            &home,
            Some(&project),
            "project",
            "code-reviewer",
            "Reviews deeply",
            "Review even more carefully.",
            &["Read".to_string()],
            &[],
            None,
        )
        .expect("update custom agent");

        let updated = fs::read_to_string(&agent_path).expect("read updated agent");
        assert!(updated.contains("Reviews deeply"));
        assert!(updated.contains("tools: Read"));
        assert!(!updated.contains("disallowedTools"));
        assert!(!updated.contains("model:"));

        delete_ai_custom_agent_for_paths(&home, Some(&project), "project", "code-reviewer")
            .expect("delete custom agent");

        assert!(!agent_path.exists());
    }

    #[test]
    fn creates_and_lists_1code_style_minimal_authoring_files() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_skill_for_paths(&home, Some(&project), "user", "Minimal Skill", "", "")
            .expect("create minimal skill");
        create_ai_command_for_paths(
            &home,
            Some(&project),
            "user",
            "minimal-command",
            "",
            "",
            None,
        )
        .expect("create minimal command");
        create_ai_custom_agent_for_paths(
            &home,
            Some(&project),
            "user",
            "Minimal Agent",
            "",
            "",
            &[],
            &[],
            Some("inherit"),
        )
        .expect("create minimal custom agent");

        let skills = list_ai_skills_for_paths(&home, Some(&project)).expect("list skills");
        let commands = list_ai_commands_for_paths(&home, Some(&project)).expect("list commands");
        let agents =
            list_ai_custom_agents_for_paths(&home, Some(&project)).expect("list custom agents");

        let skill = skills
            .iter()
            .find(|item| item.name == "minimal-skill")
            .expect("minimal skill is listed");
        assert_eq!(skill.description, "");
        assert_eq!(skill.content, "");

        let command = commands
            .iter()
            .find(|item| item.name == "minimal-command")
            .expect("minimal command is listed");
        assert_eq!(command.description, "");
        assert_eq!(command.content, "");
        assert_eq!(command.argument_hint, None);

        let agent = agents
            .iter()
            .find(|item| item.name == "minimal-agent")
            .expect("minimal agent is listed");
        assert_eq!(agent.description, "");
        assert_eq!(agent.prompt, "");
        assert_eq!(agent.model.as_deref(), Some("inherit"));
    }

    #[test]
    fn creates_and_lists_user_authoring_files_without_project_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        assert_eq!(
            resolve_ai_settings_project_root(MCP_GLOBAL_PROJECT_SENTINEL)
                .expect("global settings root"),
            None,
        );

        create_ai_skill_for_paths(&home, None, "user", "Global Skill", "", "")
            .expect("create global user skill");
        create_ai_command_for_paths(
            &home,
            None,
            "user",
            "global-command",
            "",
            "",
            None,
        )
        .expect("create global user command");
        create_ai_custom_agent_for_paths(
            &home,
            None,
            "user",
            "Global Agent",
            "",
            "",
            &[],
            &[],
            Some("inherit"),
        )
        .expect("create global user custom agent");

        assert!(home.join(".claude/skills/global-skill/SKILL.md").is_file());
        assert!(home.join(".claude/commands/global-command.md").is_file());
        assert!(home.join(".claude/agents/global-agent.md").is_file());

        let skills = list_ai_skills_for_paths(&home, None).expect("list global skills");
        let commands = list_ai_commands_for_paths(&home, None).expect("list global commands");
        let agents = list_ai_custom_agents_for_paths(&home, None).expect("list global agents");

        assert!(skills.iter().any(|item| item.name == "global-skill"));
        assert!(commands.iter().any(|item| item.name == "global-command"));
        assert!(agents.iter().any(|item| item.name == "global-agent"));
        assert!(create_ai_skill_for_paths(&home, None, "project", "project-skill", "", "")
            .is_err());
        assert!(create_ai_custom_agent_for_paths(
            &home,
            None,
            "project",
            "Project Agent",
            "",
            "",
            &[],
            &[],
            None,
        )
        .is_err());
    }

    #[test]
    fn enables_and_disables_plugins_without_dropping_settings() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        write_text(
            &home.join(".claude/settings.json"),
            r#"{"enabledPlugins":["market:enabled"],"theme":"dark"}"#,
        );

        set_ai_plugin_enabled_for_home(&home, "market:new-plugin", true).expect("enable plugin");
        let enabled_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read enabled");
        let enabled: Value = serde_json::from_str(&enabled_raw).expect("parse enabled");
        assert_eq!(enabled.get("theme").and_then(Value::as_str), Some("dark"));
        assert_eq!(
            enabled
                .get("enabledPlugins")
                .and_then(Value::as_array)
                .expect("enabled plugins")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec!["market:enabled", "market:new-plugin"],
        );

        set_ai_plugin_enabled_for_home(&home, "market:enabled", false).expect("disable plugin");
        let disabled_raw =
            fs::read_to_string(home.join(".claude/settings.json")).expect("read disabled");
        let disabled: Value = serde_json::from_str(&disabled_raw).expect("parse disabled");
        assert_eq!(
            disabled
                .get("enabledPlugins")
                .and_then(Value::as_array)
                .expect("enabled plugins")
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec!["market:new-plugin"],
        );
    }

    #[test]
    fn creates_toggles_and_deletes_project_mcp_servers() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "context7",
            "stdio",
            Some("npx"),
            &["-y".to_string(), "@upstash/context7".to_string()],
            None,
            &BTreeMap::new(),
            None,
            None,
        )
        .expect("create mcp server");

        let config_path = project.join(".mcp.json");
        let created_raw = fs::read_to_string(&config_path).expect("read created mcp");
        let created: Value = serde_json::from_str(&created_raw).expect("parse created mcp");
        assert_eq!(
            created
                .pointer("/mcpServers/context7/command")
                .and_then(Value::as_str),
            Some("npx"),
        );

        set_ai_mcp_server_enabled_for_paths(&home, Some(&project), "project", "context7", false)
            .expect("disable mcp server");
        let disabled_raw = fs::read_to_string(&config_path).expect("read disabled mcp");
        let disabled: Value = serde_json::from_str(&disabled_raw).expect("parse disabled mcp");
        assert_eq!(
            disabled
                .pointer("/mcpServers/context7/disabled")
                .and_then(Value::as_bool),
            Some(true),
        );

        update_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "context7",
            "http",
            None,
            &[],
            Some("https://mcp.example.com"),
            &BTreeMap::new(),
            None,
            None,
        )
        .expect("update mcp server");
        let updated_raw = fs::read_to_string(&config_path).expect("read updated mcp");
        let updated: Value = serde_json::from_str(&updated_raw).expect("parse updated mcp");
        assert_eq!(
            updated
                .pointer("/mcpServers/context7/url")
                .and_then(Value::as_str),
            Some("https://mcp.example.com"),
        );
        assert!(updated.pointer("/mcpServers/context7/command").is_none());
        assert!(updated.pointer("/mcpServers/context7/args").is_none());

        delete_ai_mcp_server_for_paths(&home, Some(&project), "project", "context7")
            .expect("delete mcp server");
        let deleted_raw = fs::read_to_string(&config_path).expect("read deleted mcp");
        let deleted: Value = serde_json::from_str(&deleted_raw).expect("parse deleted mcp");
        assert!(deleted.pointer("/mcpServers/context7").is_none());
    }

    #[test]
    fn creates_toggles_updates_and_deletes_global_mcp_servers() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");

        create_ai_mcp_server_for_paths(
            &home,
            None,
            "global",
            "context7",
            "stdio",
            Some("npx"),
            &["-y".to_string(), "@upstash/context7".to_string()],
            None,
            &BTreeMap::new(),
            None,
            None,
        )
        .expect("create global mcp server");

        let config_path = home.join(".claude.json");
        let created_raw = fs::read_to_string(&config_path).expect("read created global mcp");
        let created: Value = serde_json::from_str(&created_raw).expect("parse created global mcp");
        assert_eq!(
            created
                .pointer("/mcpServers/context7/command")
                .and_then(Value::as_str),
            Some("npx"),
        );

        set_ai_mcp_server_enabled_for_paths(&home, None, "global", "context7", false)
            .expect("disable global mcp server");
        let disabled_raw = fs::read_to_string(&config_path).expect("read disabled global mcp");
        let disabled: Value =
            serde_json::from_str(&disabled_raw).expect("parse disabled global mcp");
        assert_eq!(
            disabled
                .pointer("/mcpServers/context7/disabled")
                .and_then(Value::as_bool),
            Some(true),
        );

        update_ai_mcp_server_for_paths(
            &home,
            None,
            "global",
            "context7",
            "http",
            None,
            &[],
            Some("https://mcp.example.com"),
            &BTreeMap::new(),
            None,
            None,
        )
        .expect("update global mcp server");
        let updated_raw = fs::read_to_string(&config_path).expect("read updated global mcp");
        let updated: Value = serde_json::from_str(&updated_raw).expect("parse updated global mcp");
        assert_eq!(
            updated
                .pointer("/mcpServers/context7/url")
                .and_then(Value::as_str),
            Some("https://mcp.example.com"),
        );
        assert_eq!(
            updated
                .pointer("/mcpServers/context7/disabled")
                .and_then(Value::as_bool),
            Some(true),
        );
        assert!(updated.pointer("/mcpServers/context7/command").is_none());

        delete_ai_mcp_server_for_paths(&home, None, "global", "context7")
            .expect("delete global mcp server");
        let deleted_raw = fs::read_to_string(&config_path).expect("read deleted global mcp");
        let deleted: Value = serde_json::from_str(&deleted_raw).expect("parse deleted global mcp");
        assert!(deleted.pointer("/mcpServers/context7").is_none());
    }

    #[test]
    fn creates_http_bearer_mcp_server_without_returning_token() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "search-prime",
            "http",
            None,
            &[],
            Some("https://mcp.example.com"),
            &BTreeMap::new(),
            Some("bearer"),
            Some("secret-token"),
        )
        .expect("create mcp server");

        let config_path = project.join(".mcp.json");
        let created_raw = fs::read_to_string(&config_path).expect("read created mcp");
        let created: Value = serde_json::from_str(&created_raw).expect("parse created mcp");
        assert_eq!(
            created
                .pointer("/mcpServers/search-prime/authType")
                .and_then(Value::as_str),
            Some("bearer"),
        );
        assert_eq!(
            created
                .pointer("/mcpServers/search-prime/headers/Authorization")
                .and_then(Value::as_str),
            Some("Bearer secret-token"),
        );

        let servers =
            list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("list mcp servers");
        let server = servers
            .iter()
            .find(|server| server.name == "search-prime")
            .expect("listed server");
        assert_eq!(server.auth_type.as_deref(), Some("bearer"));
        assert!(server.has_auth_header);
        assert!(!serde_json::to_string(server)
            .expect("serialize server")
            .contains("secret-token"));
    }

    #[test]
    fn updates_http_mcp_server_to_none_auth_and_clears_headers() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "search-prime",
            "http",
            None,
            &[],
            Some("https://mcp.example.com"),
            &BTreeMap::new(),
            Some("bearer"),
            Some("secret-token"),
        )
        .expect("create mcp server");

        update_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "search-prime",
            "http",
            None,
            &[],
            Some("https://mcp.example.com"),
            &BTreeMap::new(),
            Some("none"),
            None,
        )
        .expect("update mcp server");

        let config_path = project.join(".mcp.json");
        let updated_raw = fs::read_to_string(&config_path).expect("read updated mcp");
        let updated: Value = serde_json::from_str(&updated_raw).expect("parse updated mcp");
        assert_eq!(
            updated
                .pointer("/mcpServers/search-prime/authType")
                .and_then(Value::as_str),
            Some("none"),
        );
        assert!(updated
            .pointer("/mcpServers/search-prime/headers")
            .is_none());
    }

    #[test]
    fn saves_and_clears_claude_oauth_tokens_without_returning_secret_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");

        create_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "figma",
            "http",
            None,
            &[],
            Some("https://mcp.example.com/mcp"),
            &BTreeMap::new(),
            Some("oauth"),
            None,
        )
        .expect("create oauth mcp server");

        save_claude_mcp_oauth_tokens_for_paths(
            &home,
            Some(&project),
            "figma",
            "access-token",
            Some("refresh-token"),
            Some("client-id"),
            Some(1_800_000_000_000),
        )
        .expect("save oauth tokens");

        let config_path = project.join(".mcp.json");
        let saved_raw = fs::read_to_string(&config_path).expect("read saved mcp");
        let saved: Value = serde_json::from_str(&saved_raw).expect("parse saved mcp");
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/authType")
                .and_then(Value::as_str),
            Some("oauth"),
        );
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/type")
                .and_then(Value::as_str),
            Some("http"),
        );
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/headers/Authorization")
                .and_then(Value::as_str),
            Some("Bearer access-token"),
        );
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/_oauth/refreshToken")
                .and_then(Value::as_str),
            Some("refresh-token"),
        );

        let servers =
            list_ai_mcp_servers_for_paths(&home, Some(&project)).expect("list mcp servers");
        let server = servers
            .iter()
            .find(|server| server.name == "figma")
            .expect("listed server");
        assert_eq!(server.auth_type.as_deref(), Some("oauth"));
        assert!(server.has_auth_header);
        assert!(!server.needs_auth);
        assert!(!serde_json::to_string(server)
            .expect("serialize server")
            .contains("access-token"));

        logout_claude_mcp_server_for_paths(&home, Some(&project), "figma")
            .expect("logout oauth server");
        let cleared_raw = fs::read_to_string(&config_path).expect("read cleared mcp");
        let cleared: Value = serde_json::from_str(&cleared_raw).expect("parse cleared mcp");
        assert_eq!(
            cleared
                .pointer("/mcpServers/figma/authType")
                .and_then(Value::as_str),
            Some("oauth"),
        );
        assert!(cleared.pointer("/mcpServers/figma/headers").is_none());
        assert!(cleared.pointer("/mcpServers/figma/_oauth").is_none());
    }

    #[test]
    fn authenticates_claude_oauth_mcp_server_with_local_callback() {
        let temp = tempfile::tempdir().expect("tempdir");
        let home = temp.path().join("home");
        let project = temp.path().join("project");
        fs::create_dir_all(&project).expect("create project");
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock oauth server");
        let base_url = format!("http://{}", listener.local_addr().expect("oauth addr"));
        let mock_base_url = base_url.clone();
        let mock = thread::spawn(move || {
            listener
                .set_nonblocking(true)
                .expect("set mock oauth nonblocking");
            let mut handled = 0;
            let deadline = Instant::now() + Duration::from_secs(5);
            while handled < 3 && Instant::now() < deadline {
                let (mut stream, _) = match listener.accept() {
                    Ok(value) => value,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    Err(error) => panic!("accept oauth request: {error}"),
                };
                handled += 1;
                let request = read_mock_http_request(&mut stream);
                let request_line = request.lines().next().unwrap_or_default();
                if request_line.contains("/.well-known/oauth-authorization-server") {
                    write_mock_http_json(
                        &mut stream,
                        &format!(
                            r#"{{
                              "authorization_endpoint":"{mock_base_url}/authorize",
                              "token_endpoint":"{mock_base_url}/token",
                              "registration_endpoint":"{mock_base_url}/register"
                            }}"#
                        ),
                    );
                } else if request_line.contains("/register") {
                    assert!(request.contains("\"client_name\":\"1code\""));
                    write_mock_http_json(
                        &mut stream,
                        r#"{"client_id":"madora-client","client_secret":"client-secret"}"#,
                    );
                } else if request_line.contains("/token") {
                    assert!(request.contains("code=oauth-code"));
                    assert!(request.contains("client_id=madora-client"));
                    write_mock_http_json(
                        &mut stream,
                        r#"{"access_token":"oauth-access","refresh_token":"oauth-refresh","expires_in":3600,"token_type":"Bearer"}"#,
                    );
                } else {
                    panic!("unexpected oauth request: {request_line}");
                }
            }
            assert_eq!(handled, 3, "mock oauth server handled {handled} requests");
        });

        create_ai_mcp_server_for_paths(
            &home,
            Some(&project),
            "project",
            "figma",
            "http",
            None,
            &[],
            Some(&format!("{base_url}/mcp")),
            &BTreeMap::new(),
            Some("oauth"),
            None,
        )
        .expect("create oauth server");

        tauri::async_runtime::block_on(start_claude_mcp_oauth_for_paths(
            &home,
            Some(&project),
            "figma",
            |auth_url| {
                let auth_url = reqwest::Url::parse(auth_url).expect("parse auth url");
                assert_eq!(auth_url.path(), "/authorize");
                let redirect_uri = auth_url
                    .query_pairs()
                    .find_map(|(key, value)| (key == "redirect_uri").then(|| value.into_owned()))
                    .expect("redirect uri");
                let state = auth_url
                    .query_pairs()
                    .find_map(|(key, value)| (key == "state").then(|| value.into_owned()))
                    .expect("state");
                let callback_url =
                    reqwest::Url::parse(&format!("{redirect_uri}?code=oauth-code&state={state}"))
                        .expect("callback url");
                let host = callback_url.host_str().expect("callback host");
                let port = callback_url.port().expect("callback port");
                let mut stream = (0..20)
                    .find_map(|_| match std::net::TcpStream::connect((host, port)) {
                        Ok(stream) => Some(stream),
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(10));
                            None
                        }
                    })
                    .expect("connect callback");
                let path = callback_url
                    .path()
                    .to_string()
                    + "?"
                    + callback_url.query().expect("callback query");
                stream
                    .write_all(
                        format!(
                            "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n"
                        )
                        .as_bytes(),
                    )
                    .expect("write callback");
                stream.flush().expect("flush callback");
                std::thread::sleep(Duration::from_millis(20));
                Ok(())
            },
        ))
        .expect("authenticate oauth server");
        mock.join().expect("mock oauth server");

        let saved_raw = fs::read_to_string(project.join(".mcp.json")).expect("read mcp config");
        let saved: Value = serde_json::from_str(&saved_raw).expect("parse mcp config");
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/headers/Authorization")
                .and_then(Value::as_str),
            Some("Bearer oauth-access"),
        );
        assert_eq!(
            saved
                .pointer("/mcpServers/figma/_oauth/clientId")
                .and_then(Value::as_str),
            Some("madora-client"),
        );
    }

    #[test]
    fn parses_codex_mcp_list_json_without_secret_values() {
        let raw = r#"[
          {
            "name": "context7",
            "enabled": true,
            "transport": {
              "type": "streamable_http",
              "url": "https://mcp.example.com/mcp",
              "bearer_token_env_var": "CONTEXT7_TOKEN",
              "env_http_headers": {
                "Authorization": "CONTEXT7_TOKEN"
              }
            },
            "auth_status": "not_logged_in"
          },
          {
            "name": "local-tools",
            "enabled": true,
            "transport": {
              "type": "stdio",
              "command": "npx",
              "args": ["-y", "@example/mcp"],
              "env_vars": ["EXAMPLE_TOKEN"]
            },
            "auth_status": "unsupported"
          }
        ]"#;

        let servers = parse_codex_mcp_servers(raw).expect("parse codex mcp");

        assert_eq!(servers.len(), 2);
        let context7 = servers
            .iter()
            .find(|server| server.name == "context7")
            .expect("context7 server");
        assert_eq!(context7.provider, "codex");
        assert_eq!(context7.group_name, "Global");
        assert_eq!(context7.source, "global");
        assert_eq!(context7.connection_type, "http");
        assert_eq!(context7.status, "needs-auth");
        assert_eq!(context7.url.as_deref(), Some("https://mcp.example.com/mcp"));
        assert_eq!(context7.auth_status.as_deref(), Some("not_logged_in"));
        assert_eq!(context7.env_keys, vec!["CONTEXT7_TOKEN"]);
        assert!(!serde_json::to_string(context7)
            .expect("serialize codex server")
            .contains("Bearer"));

        let local = servers
            .iter()
            .find(|server| server.name == "local-tools")
            .expect("local-tools server");
        assert_eq!(local.connection_type, "stdio");
        assert_eq!(local.command.as_deref(), Some("npx"));
        assert_eq!(local.args, vec!["-y", "@example/mcp"]);
        assert_eq!(local.env_keys, vec!["EXAMPLE_TOKEN"]);
    }

    #[test]
    fn parses_codex_stdio_mcp_tools_when_discovery_succeeds() {
        let temp = tempfile::tempdir().expect("tempdir");
        let server_script = temp.path().join("codex-mcp.sh");

        write_text(
            &server_script,
            r#"#!/bin/sh
respond() {
  body="$1"
  bytes=$(printf '%s' "$body" | wc -c | tr -d ' ')
  printf 'Content-Length: %s\r\n\r\n%s' "$bytes" "$body"
}

length=""
while IFS= read -r header; do
  header=$(printf '%s' "$header" | tr -d '\r')
  case "$header" in
    Content-Length:*)
      length=$(printf '%s' "$header" | sed 's/Content-Length: //')
      ;;
    "")
      if [ -n "$length" ]; then
        body=$(dd bs=1 count="$length" 2>/dev/null)
        length=""
        case "$body" in
          *initialize*)
            respond '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"codex-mcp","version":"1.0.0"}}}'
            ;;
          *tools/list*)
            respond '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"codex_search","description":"Search with Codex MCP"},{"name":"codex_read"}]}}'
            exit 0
            ;;
        esac
      fi
      ;;
  esac
done
"#,
        );
        let raw = format!(
            r#"[{{
              "name": "codex-local",
              "enabled": true,
              "transport": {{
                "type": "stdio",
                "command": "/bin/sh",
                "args": [{}],
                "env": {{"CODEX_SECRET": "hidden-value"}}
              }},
              "auth_status": "unsupported"
            }}]"#,
            serde_json::to_string(&server_script.to_string_lossy()).expect("json path"),
        );

        let servers = parse_codex_mcp_servers_with_tools(&raw).expect("parse codex mcp with tools");
        let server = servers.first().expect("codex server");

        assert_eq!(server.status, "connected");
        assert_eq!(server.tools.len(), 2);
        assert_eq!(server.tools[0].name, "codex_search");
        assert_eq!(
            server.tools[0].description.as_deref(),
            Some("Search with Codex MCP"),
        );
        assert_eq!(server.env_keys, vec!["CODEX_SECRET"]);
        assert!(!serde_json::to_string(server)
            .expect("serialize codex server")
            .contains("hidden-value"));
    }

    #[test]
    fn returns_codex_mcp_discovery_error_when_stdio_server_fails_to_start() {
        let raw = r#"[{
          "name": "codex-broken",
          "enabled": true,
          "transport": {
            "type": "stdio",
            "command": "/definitely/missing/codex-mcp",
            "env": {"CODEX_SECRET": "hidden-value"}
          },
          "auth_status": "unsupported"
        }]"#;

        let servers =
            parse_codex_mcp_servers_with_tools(raw).expect("parse codex broken mcp");
        let server = servers.first().expect("codex broken server");
        let serialized = serde_json::to_string(server).expect("serialize codex broken server");

        assert_eq!(server.status, "failed");
        assert_eq!(server.error.as_deref(), Some("无法启动 MCP server"));
        assert!(server.tools.is_empty());
        assert_eq!(server.env_keys, vec!["CODEX_SECRET"]);
        assert!(!serialized.contains("hidden-value"));
    }

    #[test]
    fn parses_codex_http_mcp_tools_with_bearer_env_without_returning_token() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock codex mcp http");
        let url = format!(
            "http://{}/mcp",
            listener.local_addr().expect("listener address")
        );
        let (sender, receiver) = std::sync::mpsc::channel();

        thread::spawn(move || {
            for stream in listener.incoming().take(2) {
                let mut stream = stream.expect("accept mock codex mcp http");
                let request = read_mock_http_request(&mut stream);
                sender.send(request.clone()).expect("send request");
                let response = if request.contains(r#""method":"initialize""#) {
                    r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{},"serverInfo":{"name":"codex-http","version":"1.0.0"}}}"#
                } else {
                    r#"{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"codex_web","description":"Use Codex HTTP MCP"}]}}"#
                };
                write_mock_http_json(&mut stream, response);
            }
        });

        std::env::set_var("CODEX_HTTP_TOKEN", "secret-token");
        let raw = format!(
            r#"[{{
              "name": "codex-http",
              "enabled": true,
              "transport": {{
                "type": "streamable_http",
                "url": {},
                "bearer_token_env_var": "CODEX_HTTP_TOKEN"
              }},
              "auth_status": "bearer_token"
            }}]"#,
            serde_json::to_string(&url).expect("json url"),
        );

        let servers =
            parse_codex_mcp_servers_with_tools(&raw).expect("parse codex http with tools");
        std::env::remove_var("CODEX_HTTP_TOKEN");
        let requests = (0..2)
            .map(|_| {
                receiver
                    .recv_timeout(Duration::from_secs(1))
                    .expect("receive mock request")
            })
            .collect::<Vec<_>>();
        let serialized = serde_json::to_string(&servers).expect("serialize codex servers");
        let server = servers.first().expect("codex http server");

        assert_eq!(server.status, "connected");
        assert_eq!(server.auth_type.as_deref(), Some("bearer"));
        assert!(server.has_auth_header);
        assert_eq!(server.env_keys, vec!["CODEX_HTTP_TOKEN"]);
        assert_eq!(server.tools.len(), 1);
        assert_eq!(server.tools[0].name, "codex_web");
        assert!(requests.iter().any(|request| {
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer secret-token")
        }));
        assert!(!serialized.contains("secret-token"));
    }

    fn write_text(path: &std::path::Path, content: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        fs::write(path, content).expect("write file");
    }

    fn shell_quote_path(path: &std::path::Path) -> String {
        format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
    }

    fn read_mock_http_request(stream: &mut std::net::TcpStream) -> String {
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 1024];
        let deadline = Instant::now() + Duration::from_secs(2);

        loop {
            let read = match stream.read(&mut chunk) {
                Ok(read) => read,
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
                    ) && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Err(error) => panic!("read request: {error}"),
            };
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
            let Some(header_end) = find_header_end(&buffer) else {
                continue;
            };
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    if name.eq_ignore_ascii_case("content-length") {
                        value.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            if buffer.len() >= header_end + 4 + content_length {
                break;
            }
        }

        String::from_utf8_lossy(&buffer).to_string()
    }

    fn write_mock_http_json(stream: &mut std::net::TcpStream, body: &str) {
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body,
        );
        stream
            .write_all(response.as_bytes())
            .expect("write response");
    }

    fn find_header_end(buffer: &[u8]) -> Option<usize> {
        buffer.windows(4).position(|window| window == b"\r\n\r\n")
    }
}

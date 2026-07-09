use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub storage: StorageSettings,
    #[serde(default)]
    pub appearance: AppearanceSettings,
    #[serde(default)]
    pub ai: AiSettings,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub default_provider: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    #[serde(default)]
    pub fonts: AppearanceFontSettings,
    #[serde(default = "default_page_width_mode")]
    pub page_width_mode: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceFontSettings {
    pub code: String,
    pub document: String,
    pub ui: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default = "default_ai_analytics_opt_out")]
    pub analytics_opt_out: bool,
    #[serde(default = "default_ai_auto_advance_target")]
    pub auto_advance_target: String,
    #[serde(default)]
    pub custom_claude_config: AiCustomClaudeConfig,
    #[serde(default = "default_ai_ctrl_tab_target")]
    pub ctrl_tab_target: String,
    #[serde(default = "default_ai_default_agent_mode")]
    pub default_agent_mode: String,
    #[serde(default = "default_ai_desktop_notifications_enabled")]
    pub desktop_notifications_enabled: bool,
    pub enabled_profile_id: Option<String>,
    #[serde(default = "default_ai_extended_thinking_enabled")]
    pub extended_thinking_enabled: bool,
    #[serde(default = "default_ai_hidden_model_ids")]
    pub hidden_model_ids: Vec<String>,
    #[serde(default = "default_ai_include_co_authored_by")]
    pub include_co_authored_by: bool,
    #[serde(default = "default_ai_last_selected_codex_model_id")]
    pub last_selected_codex_model_id: String,
    #[serde(default = "default_ai_last_selected_codex_thinking")]
    pub last_selected_codex_thinking: String,
    #[serde(default = "default_ai_last_selected_model_id")]
    pub last_selected_model_id: String,
    #[serde(default = "default_ai_notify_when_focused")]
    pub notify_when_focused: bool,
    #[serde(default = "default_ai_preferred_editor")]
    pub preferred_editor: String,
    pub profiles: Vec<AiProfileSettings>,
    #[serde(default)]
    pub providers: AiProviderSettings,
    #[serde(default)]
    pub settings_sidebar_widths: AiSettingsSidebarWidths,
    #[serde(default = "default_ai_sound_notifications_enabled")]
    pub sound_notifications_enabled: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCustomClaudeConfig {
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsSidebarWidths {
    pub agents: u32,
    pub mcp: u32,
    pub plugins: u32,
    pub skills: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileSettings {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub provider_id: String,
    pub provider_label: String,
    pub model_id: String,
    pub model_label: String,
    pub enabled: bool,
    pub is_test_runtime: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    pub agent_default_model_id: Option<String>,
    pub agent_default_provider_id: Option<String>,
    pub default_model_id: Option<String>,
    pub default_provider_id: Option<String>,
    pub inline_default_model_id: Option<String>,
    pub inline_default_provider_id: Option<String>,
    pub providers: Vec<AiProviderConfigSettings>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfigSettings {
    pub api_style: String,
    pub base_url: String,
    pub custom_headers: Option<String>,
    pub default_model_id: String,
    pub enabled: bool,
    pub id: String,
    pub models: Vec<AiProviderModelSettings>,
    pub name: String,
    pub secret_status: String,
    pub r#type: String,
    #[serde(flatten, skip_serializing)]
    pub extra_fields: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderModelSettings {
    pub capabilities: Vec<String>,
    pub enabled: bool,
    pub id: String,
    pub name: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            fonts: AppearanceFontSettings::default(),
            page_width_mode: default_page_width_mode(),
        }
    }
}

impl Default for AppearanceFontSettings {
    fn default() -> Self {
        Self {
            code: "JetBrains Mono".to_string(),
            document: "Songti SC".to_string(),
            ui: "SF Pro Text".to_string(),
        }
    }
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            analytics_opt_out: default_ai_analytics_opt_out(),
            auto_advance_target: default_ai_auto_advance_target(),
            custom_claude_config: AiCustomClaudeConfig::default(),
            ctrl_tab_target: default_ai_ctrl_tab_target(),
            default_agent_mode: default_ai_default_agent_mode(),
            desktop_notifications_enabled: default_ai_desktop_notifications_enabled(),
            enabled_profile_id: Some("fake-echo".to_string()),
            extended_thinking_enabled: default_ai_extended_thinking_enabled(),
            hidden_model_ids: default_ai_hidden_model_ids(),
            include_co_authored_by: default_ai_include_co_authored_by(),
            last_selected_codex_model_id: default_ai_last_selected_codex_model_id(),
            last_selected_codex_thinking: default_ai_last_selected_codex_thinking(),
            last_selected_model_id: default_ai_last_selected_model_id(),
            notify_when_focused: default_ai_notify_when_focused(),
            preferred_editor: default_ai_preferred_editor(),
            profiles: vec![default_ai_profile_settings()],
            providers: AiProviderSettings::default(),
            settings_sidebar_widths: AiSettingsSidebarWidths::default(),
            sound_notifications_enabled: default_ai_sound_notifications_enabled(),
        }
    }
}

impl Default for AiSettingsSidebarWidths {
    fn default() -> Self {
        Self {
            agents: 240,
            mcp: 240,
            plugins: 240,
            skills: 240,
        }
    }
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        default_ai_provider_settings()
    }
}

#[tauri::command]
pub fn read_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(default_app_settings());
    }

    let raw = fs::read_to_string(path).map_err(|_| "无法读取应用设置".to_string())?;
    serde_json::from_str::<AppSettings>(&raw).map_err(|_| "应用设置格式损坏".to_string())
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    validate_app_settings(&settings)?;

    let path = settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建应用设置目录".to_string())?;
    }

    let json =
        serde_json::to_string_pretty(&settings).map_err(|_| "无法序列化应用设置".to_string())?;
    fs::write(&path, format!("{json}\n")).map_err(|_| "无法保存应用设置".to_string())?;

    Ok(settings)
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        schema_version: 1,
        storage: StorageSettings {
            default_provider: "local".to_string(),
        },
        appearance: AppearanceSettings::default(),
        ai: AiSettings::default(),
    }
}

fn default_page_width_mode() -> String {
    "wide".to_string()
}

fn default_ai_default_agent_mode() -> String {
    "agent".to_string()
}

fn default_ai_desktop_notifications_enabled() -> bool {
    true
}

fn default_ai_extended_thinking_enabled() -> bool {
    true
}

fn default_ai_hidden_model_ids() -> Vec<String> {
    vec![
        "gpt-5.1-codex-max".to_string(),
        "gpt-5.1-codex-mini".to_string(),
    ]
}

fn default_ai_include_co_authored_by() -> bool {
    true
}

fn default_ai_sound_notifications_enabled() -> bool {
    true
}

fn default_ai_notify_when_focused() -> bool {
    false
}

fn default_ai_ctrl_tab_target() -> String {
    "workspaces".to_string()
}

fn default_ai_auto_advance_target() -> String {
    "next".to_string()
}

fn default_ai_preferred_editor() -> String {
    "cursor".to_string()
}

fn default_ai_analytics_opt_out() -> bool {
    false
}

fn default_ai_last_selected_codex_model_id() -> String {
    "gpt-5.3-codex".to_string()
}

fn default_ai_last_selected_codex_thinking() -> String {
    "high".to_string()
}

fn default_ai_last_selected_model_id() -> String {
    "opus".to_string()
}

fn validate_app_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.schema_version != 1 {
        return Err("应用设置版本不支持".to_string());
    }

    if settings.storage.default_provider != "local" {
        return Err("当前仅支持本地存储".to_string());
    }

    if settings.appearance.page_width_mode != "standard"
        && settings.appearance.page_width_mode != "wide"
    {
        return Err("页面宽度模式不支持".to_string());
    }

    validate_font_settings(&settings.appearance.fonts)?;
    validate_ai_settings(&settings.ai)?;

    Ok(())
}

fn validate_font_settings(settings: &AppearanceFontSettings) -> Result<(), String> {
    validate_font_family(&settings.ui)?;
    validate_font_family(&settings.document)?;
    validate_font_family(&settings.code)?;

    Ok(())
}

fn validate_font_family(font_family: &str) -> Result<(), String> {
    let trimmed = font_family.trim();

    if trimmed.is_empty()
        || trimmed.len() > 120
        || trimmed
            .chars()
            .any(|character| character.is_control() || matches!(character, ';' | '{' | '}' | '\\'))
    {
        return Err("字体设置不支持".to_string());
    }

    Ok(())
}

fn validate_ai_settings(settings: &AiSettings) -> Result<(), String> {
    if !matches!(settings.default_agent_mode.as_str(), "agent" | "plan") {
        return Err("AI default mode 不支持".to_string());
    }

    if !matches!(settings.ctrl_tab_target.as_str(), "agents" | "workspaces") {
        return Err("AI quick switch target 不支持".to_string());
    }

    if !matches!(
        settings.auto_advance_target.as_str(),
        "close" | "next" | "previous"
    ) {
        return Err("AI auto advance target 不支持".to_string());
    }

    if !is_supported_preferred_editor(&settings.preferred_editor) {
        return Err("AI preferred editor 不支持".to_string());
    }

    validate_ai_custom_claude_config(&settings.custom_claude_config)?;

    if !matches!(
        settings.last_selected_codex_thinking.as_str(),
        "low" | "medium" | "high" | "xhigh"
    ) {
        return Err("Codex thinking 设置不支持".to_string());
    }

    validate_ai_model_preference(&settings.last_selected_model_id)?;
    validate_ai_model_preference(&settings.last_selected_codex_model_id)?;

    for model_id in &settings.hidden_model_ids {
        validate_ai_model_preference(model_id)?;
    }

    validate_ai_settings_sidebar_width(settings.settings_sidebar_widths.agents)?;
    validate_ai_settings_sidebar_width(settings.settings_sidebar_widths.mcp)?;
    validate_ai_settings_sidebar_width(settings.settings_sidebar_widths.plugins)?;
    validate_ai_settings_sidebar_width(settings.settings_sidebar_widths.skills)?;

    if settings.profiles.is_empty() {
        return Err("AI profile 列表不能为空".to_string());
    }

    for profile in &settings.profiles {
        if profile.id.trim().is_empty()
            || profile.label.trim().is_empty()
            || profile.provider_id.trim().is_empty()
            || profile.provider_label.trim().is_empty()
            || profile.model_id.trim().is_empty()
            || profile.model_label.trim().is_empty()
        {
            return Err("AI profile 配置不完整".to_string());
        }

        if !is_supported_ai_profile_kind(&profile.kind) {
            return Err("AI profile 类型不支持".to_string());
        }
    }

    validate_ai_provider_settings(&settings.providers)?;

    if let Some(enabled_profile_id) = &settings.enabled_profile_id {
        let profile = settings
            .profiles
            .iter()
            .find(|profile| &profile.id == enabled_profile_id)
            .ok_or_else(|| "启用的 AI profile 不存在".to_string())?;

        if !profile.enabled {
            return Err("启用的 AI profile 已被禁用".to_string());
        }
    }

    Ok(())
}

fn validate_ai_custom_claude_config(config: &AiCustomClaudeConfig) -> Result<(), String> {
    let model = config.model.trim();
    let base_url = config.base_url.trim();

    if !model.is_empty() {
        validate_ai_model_preference(model)?;
    }

    if !base_url.is_empty() {
        let parsed = reqwest::Url::parse(base_url)
            .map_err(|_| "Claude override base URL 无效".to_string())?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.username() != ""
            || parsed.password().is_some()
            || parsed.query().is_some()
        {
            return Err("Claude override base URL 无效".to_string());
        }

        let lower = base_url.to_ascii_lowercase();
        if lower.contains("token") || lower.contains("api_key") || lower.contains("apikey") {
            return Err("Claude override base URL 不能包含密钥".to_string());
        }
    }

    Ok(())
}

fn validate_ai_model_preference(value: &str) -> Result<(), String> {
    let trimmed = value.trim();

    if trimmed.is_empty()
        || trimmed.len() > 120
        || trimmed
            .chars()
            .any(|character| character.is_control() || matches!(character, ';' | '{' | '}'))
    {
        return Err("AI model preference 不支持".to_string());
    }

    Ok(())
}

fn is_supported_preferred_editor(editor: &str) -> bool {
    matches!(
        editor,
        "clion"
            | "cursor"
            | "fleet"
            | "ghostty"
            | "goland"
            | "intellij"
            | "iterm"
            | "phpstorm"
            | "pycharm"
            | "rider"
            | "rustrover"
            | "sublime"
            | "terminal"
            | "trae"
            | "vscode"
            | "vscode-insiders"
            | "warp"
            | "webstorm"
            | "windsurf"
            | "xcode"
            | "zed"
    )
}

fn validate_ai_provider_settings(settings: &AiProviderSettings) -> Result<(), String> {
    if settings.providers.is_empty() {
        return Err("AI provider 列表不能为空".to_string());
    }

    for provider in &settings.providers {
        validate_ai_provider_id(&provider.id)?;
        if provider.name.trim().is_empty()
            || provider.base_url.trim().is_empty()
            || provider.default_model_id.trim().is_empty()
        {
            return Err("AI provider 配置不完整".to_string());
        }
        if !is_supported_ai_provider_api_style(&provider.api_style)
            || !is_supported_ai_provider_api_style(&provider.r#type)
        {
            return Err("AI provider API style 不支持".to_string());
        }
        if !matches!(
            provider.secret_status.as_str(),
            "configured" | "missing" | "notRequired"
        ) {
            return Err("AI provider secret 状态不支持".to_string());
        }
        if provider_contains_secret_fields(provider) {
            return Err("AI provider settings must not contain secrets".to_string());
        }
        if custom_headers_contain_protected_auth_header(&provider.custom_headers)? {
            return Err("AI provider custom headers contain protected auth headers".to_string());
        }
        if provider.models.is_empty() {
            return Err("AI provider 模型列表不能为空".to_string());
        }
        for model in &provider.models {
            if model.id.trim().is_empty() || model.name.trim().is_empty() {
                return Err("AI provider 模型配置不完整".to_string());
            }
            if !model
                .capabilities
                .iter()
                .any(|capability| capability == "text")
            {
                return Err("AI provider 模型必须声明 text 能力".to_string());
            }
            for capability in &model.capabilities {
                if !is_supported_ai_model_capability(capability) {
                    return Err("AI provider 模型能力不支持".to_string());
                }
            }
        }
    }

    validate_provider_selection(
        settings.default_provider_id.as_deref(),
        settings.default_model_id.as_deref(),
        &settings.providers,
    )?;
    validate_provider_selection(
        settings.agent_default_provider_id.as_deref(),
        settings.agent_default_model_id.as_deref(),
        &settings.providers,
    )?;
    validate_provider_selection(
        settings.inline_default_provider_id.as_deref(),
        settings.inline_default_model_id.as_deref(),
        &settings.providers,
    )?;

    Ok(())
}

fn validate_ai_settings_sidebar_width(width: u32) -> Result<(), String> {
    if !(200..=400).contains(&width) {
        return Err("AI settings sidebar width 不支持".to_string());
    }

    Ok(())
}

fn is_supported_ai_profile_kind(kind: &str) -> bool {
    matches!(
        kind,
        "fake"
            | "codex_app_server"
            | "claude_cli"
            | "acp_stdio"
            | "acp_websocket"
            | "sdk_sidecar"
            | "provider"
    )
}

fn is_supported_ai_provider_api_style(api_style: &str) -> bool {
    matches!(
        api_style,
        "anthropic" | "google" | "ollama" | "openai" | "openai-compatible" | "openai-responses"
    )
}

fn is_supported_ai_model_capability(capability: &str) -> bool {
    matches!(
        capability,
        "image" | "reasoning" | "text" | "tools" | "vision" | "web"
    )
}

fn validate_ai_provider_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 96
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':')
        })
    {
        return Err("AI provider id 不合法".to_string());
    }

    Ok(())
}

fn validate_provider_selection(
    provider_id: Option<&str>,
    model_id: Option<&str>,
    providers: &[AiProviderConfigSettings],
) -> Result<(), String> {
    let Some(provider_id) = provider_id else {
        return Ok(());
    };
    let provider = providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| "AI provider 默认选择不存在".to_string())?;

    if let Some(model_id) = model_id {
        if !provider.models.iter().any(|model| model.id == model_id) {
            return Err("AI provider 默认模型不存在".to_string());
        }
    }

    Ok(())
}

fn provider_contains_secret_fields(provider: &AiProviderConfigSettings) -> bool {
    provider
        .extra_fields
        .keys()
        .any(|key| is_protected_auth_key(key))
}

fn custom_headers_contain_protected_auth_header(
    custom_headers: &Option<String>,
) -> Result<bool, String> {
    let Some(custom_headers) = custom_headers.as_deref() else {
        return Ok(false);
    };
    if custom_headers.trim().is_empty() {
        return Ok(false);
    }

    let value: Value = serde_json::from_str(custom_headers)
        .map_err(|_| "AI provider custom headers 格式不合法".to_string())?;
    let Some(headers) = value.as_object() else {
        return Err("AI provider custom headers 格式不合法".to_string());
    };

    Ok(headers.keys().any(|key| is_protected_auth_key(key)))
}

fn is_protected_auth_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "api-key"
            | "apikey"
            | "api_key"
            | "authorization"
            | "secret"
            | "token"
            | "x-api-key"
            | "x-goog-api-key"
    )
}

fn default_ai_profile_settings() -> AiProfileSettings {
    AiProfileSettings {
        enabled: true,
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

fn default_ai_provider_settings() -> AiProviderSettings {
    AiProviderSettings {
        agent_default_model_id: None,
        agent_default_provider_id: None,
        default_model_id: None,
        default_provider_id: None,
        inline_default_model_id: None,
        inline_default_provider_id: None,
        providers: vec![
            ai_provider(
                "openai",
                "OpenAI",
                "openai",
                "openai-responses",
                "https://api.openai.com/v1",
                "gpt-5.5",
                "missing",
                vec![
                    ai_model(
                        "gpt-5.5",
                        "GPT-5.5",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "gpt-5.4",
                        "GPT-5.4",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "gpt-5.4-mini",
                        "GPT-5.4 mini",
                        &["text", "vision", "reasoning", "tools"],
                    ),
                ],
            ),
            ai_provider(
                "anthropic",
                "Anthropic",
                "anthropic",
                "anthropic",
                "https://api.anthropic.com/v1",
                "claude-sonnet-4-6",
                "missing",
                vec![
                    ai_model(
                        "claude-opus-4-7",
                        "Claude Opus 4.7",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "claude-sonnet-4-6",
                        "Claude Sonnet 4.6",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "claude-haiku-4-5",
                        "Claude Haiku 4.5",
                        &["text", "vision", "tools"],
                    ),
                ],
            ),
            ai_provider(
                "openrouter",
                "OpenRouter",
                "openai-compatible",
                "openai-compatible",
                "https://openrouter.ai/api/v1",
                "openrouter/auto",
                "missing",
                vec![
                    ai_model(
                        "openrouter/auto",
                        "OpenRouter Auto",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "openai/gpt-5.5",
                        "GPT-5.5",
                        &["text", "vision", "reasoning", "tools"],
                    ),
                ],
            ),
            ai_provider(
                "google",
                "Google",
                "google",
                "google",
                "https://generativelanguage.googleapis.com/v1beta",
                "gemini-3.1-pro-preview",
                "missing",
                vec![
                    ai_model(
                        "gemini-3.1-pro-preview",
                        "Gemini 3.1 Pro Preview",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model(
                        "gemini-3-flash-preview",
                        "Gemini 3 Flash Preview",
                        &["text", "vision", "tools"],
                    ),
                ],
            ),
            ai_provider(
                "deepseek",
                "DeepSeek",
                "openai-compatible",
                "openai-compatible",
                "https://api.deepseek.com",
                "deepseek-v4-pro",
                "missing",
                vec![
                    ai_model(
                        "deepseek-v4-pro",
                        "DeepSeek V4 Pro",
                        &["text", "reasoning", "tools"],
                    ),
                    ai_model(
                        "deepseek-v4-flash",
                        "DeepSeek V4 Flash",
                        &["text", "reasoning", "tools"],
                    ),
                ],
            ),
            ai_provider(
                "qwen",
                "Qwen",
                "openai-compatible",
                "openai-compatible",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "qwen3.6-plus",
                "missing",
                vec![
                    ai_model(
                        "qwen3.6-plus",
                        "Qwen3.6 Plus",
                        &["text", "vision", "reasoning", "tools", "web"],
                    ),
                    ai_model("qwen3-coder-plus", "Qwen3 Coder Plus", &["text", "tools"]),
                ],
            ),
            ai_provider(
                "ollama",
                "Ollama",
                "ollama",
                "openai-compatible",
                "http://localhost:11434/v1",
                "llama3.3",
                "notRequired",
                vec![
                    ai_model("llama3.3", "Llama 3.3", &["text"]),
                    ai_model("qwen3:32b", "Qwen3 32B", &["text"]),
                ],
            ),
        ],
    }
}

fn ai_provider(
    id: &str,
    name: &str,
    provider_type: &str,
    api_style: &str,
    base_url: &str,
    default_model_id: &str,
    secret_status: &str,
    models: Vec<AiProviderModelSettings>,
) -> AiProviderConfigSettings {
    AiProviderConfigSettings {
        api_style: api_style.to_string(),
        base_url: base_url.to_string(),
        custom_headers: None,
        default_model_id: default_model_id.to_string(),
        enabled: false,
        id: id.to_string(),
        models,
        name: name.to_string(),
        secret_status: secret_status.to_string(),
        r#type: provider_type.to_string(),
        extra_fields: BTreeMap::new(),
    }
}

fn ai_model(id: &str, name: &str, capabilities: &[&str]) -> AiProviderModelSettings {
    AiProviderModelSettings {
        capabilities: capabilities
            .iter()
            .map(|capability| (*capability).to_string())
            .collect(),
        enabled: true,
        id: id.to_string(),
        name: name.to_string(),
    }
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|_| "无法定位应用设置目录".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_legacy_settings_without_appearance() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"schemaVersion":1,"storage":{"defaultProvider":"local"}}"#)
                .expect("legacy settings should deserialize");

        assert_eq!(settings.appearance.page_width_mode, "wide");
    }

    #[test]
    fn reads_partial_appearance_settings_with_defaults() {
        let settings: AppSettings = serde_json::from_str(
            r#"{"schemaVersion":1,"storage":{"defaultProvider":"local"},"appearance":{"fonts":{"ui":"PingFang SC","document":"Songti SC","code":"Menlo"}}}"#,
        )
        .expect("partial appearance settings should deserialize");

        assert_eq!(settings.appearance.page_width_mode, "wide");
        assert_eq!(settings.appearance.fonts.code, "Menlo");
    }

    #[test]
    fn reads_legacy_settings_with_default_ai_profile() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"schemaVersion":1,"storage":{"defaultProvider":"local"}}"#)
                .expect("legacy settings should deserialize");
        let value = serde_json::to_value(settings).expect("settings should serialize");

        assert_eq!(value["ai"]["enabledProfileId"], "fake-echo");
        assert_eq!(value["ai"]["profiles"][0]["providerLabel"], "Local");
        assert_eq!(value["ai"]["profiles"][0]["modelId"], "fake-echo");
        assert_eq!(value["ai"]["profiles"][0]["enabled"], true);
        assert!(value.get("apiKey").is_none());
    }

    #[test]
    fn rejects_invalid_page_width_mode() {
        let settings = AppSettings {
            schema_version: 1,
            storage: StorageSettings {
                default_provider: "local".to_string(),
            },
            appearance: AppearanceSettings {
                fonts: AppearanceFontSettings::default(),
                page_width_mode: "compact".to_string(),
            },
            ai: AiSettings::default(),
        };

        assert_eq!(
            validate_app_settings(&settings),
            Err("页面宽度模式不支持".to_string()),
        );
    }

    #[test]
    fn default_settings_include_wide_page_width() {
        let settings = default_app_settings();

        assert_eq!(settings.appearance.page_width_mode, "wide");
    }

    #[test]
    fn default_settings_include_font_preferences() {
        let settings = default_app_settings();

        assert_eq!(settings.appearance.fonts.ui, "SF Pro Text");
        assert_eq!(settings.appearance.fonts.document, "Songti SC");
        assert_eq!(settings.appearance.fonts.code, "JetBrains Mono");
    }

    #[test]
    fn rejects_invalid_font_preferences() {
        let mut settings = default_app_settings();
        settings.appearance.fonts.document = "\n".to_string();

        assert_eq!(
            validate_app_settings(&settings),
            Err("字体设置不支持".to_string()),
        );
    }

    #[test]
    fn default_settings_include_ai_profile_without_secrets() {
        let settings = default_app_settings();
        let json = serde_json::to_string(&settings).expect("settings should serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("settings should parse");

        assert_eq!(value["ai"]["enabledProfileId"], "fake-echo");
        assert_eq!(value["ai"]["profiles"][0]["label"], "Fake Echo");
        assert_eq!(value["ai"]["profiles"][0]["providerId"], "local");
        assert_eq!(value["ai"]["profiles"][0]["modelLabel"], "fake-echo");
        assert!(!json.contains("apiKey"));
    }

    #[test]
    fn default_settings_include_ai_provider_metadata_without_secrets() {
        let settings = default_app_settings();
        let json = serde_json::to_string(&settings).expect("settings should serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("settings should parse");

        assert_eq!(value["ai"]["providers"]["providers"][0]["id"], "openai");
        assert_eq!(
            value["ai"]["providers"]["providers"][0]["secretStatus"],
            "missing",
        );
        assert_eq!(
            value["ai"]["providers"]["providers"][6]["secretStatus"],
            "notRequired",
        );
        assert!(!json.contains("apiKey"));
        assert!(!json.contains("sk-"));
    }

    #[test]
    fn default_settings_include_1code_ai_preferences_without_secrets() {
        let settings = default_app_settings();
        let json = serde_json::to_string(&settings).expect("settings should serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("settings should parse");

        assert_eq!(value["ai"]["extendedThinkingEnabled"], true);
        assert_eq!(value["ai"]["defaultAgentMode"], "agent");
        assert_eq!(value["ai"]["includeCoAuthoredBy"], true);
        assert_eq!(value["ai"]["desktopNotificationsEnabled"], true);
        assert_eq!(value["ai"]["soundNotificationsEnabled"], true);
        assert_eq!(value["ai"]["notifyWhenFocused"], false);
        assert_eq!(value["ai"]["ctrlTabTarget"], "workspaces");
        assert_eq!(value["ai"]["autoAdvanceTarget"], "next");
        assert_eq!(value["ai"]["preferredEditor"], "cursor");
        assert_eq!(value["ai"]["analyticsOptOut"], false);
        assert_eq!(value["ai"]["lastSelectedModelId"], "opus");
        assert_eq!(value["ai"]["lastSelectedCodexModelId"], "gpt-5.3-codex");
        assert_eq!(value["ai"]["lastSelectedCodexThinking"], "high");
        assert_eq!(value["ai"]["customClaudeConfig"]["model"], "");
        assert_eq!(value["ai"]["customClaudeConfig"]["baseUrl"], "");
        assert_eq!(
            value["ai"]["hiddenModelIds"],
            serde_json::json!(["gpt-5.1-codex-max", "gpt-5.1-codex-mini"]),
        );
        assert!(!json.contains("apiKey"));
        assert!(!json.contains("sk-"));
    }

    #[test]
    fn rejects_ai_provider_secret_fields_in_settings_json() {
        let raw = r#"{
          "schemaVersion": 1,
          "storage": { "defaultProvider": "local" },
          "appearance": { "pageWidthMode": "wide" },
          "ai": {
            "enabledProfileId": "fake-echo",
            "profiles": [
              {
                "enabled": true,
                "id": "fake-echo",
                "isTestRuntime": true,
                "kind": "fake",
                "label": "Fake Echo",
                "modelId": "fake-echo",
                "modelLabel": "fake-echo",
                "providerId": "local",
                "providerLabel": "Local"
              }
            ],
            "providers": {
              "agentDefaultModelId": "gpt-5.4",
              "agentDefaultProviderId": "openai",
              "defaultModelId": "gpt-5.4",
              "defaultProviderId": "openai",
              "inlineDefaultModelId": null,
              "inlineDefaultProviderId": null,
              "providers": [
                {
                  "apiKey": "sk-leak",
                  "apiStyle": "openai-responses",
                  "baseUrl": "https://api.openai.com/v1",
                  "defaultModelId": "gpt-5.4",
                  "enabled": true,
                  "id": "openai",
                  "models": [
                    {
                      "capabilities": ["text"],
                      "enabled": true,
                      "id": "gpt-5.4",
                      "name": "GPT-5.4"
                    }
                  ],
                  "name": "OpenAI",
                  "secretStatus": "configured",
                  "type": "openai"
                }
              ]
            }
          }
        }"#;

        let parsed: serde_json::Value = serde_json::from_str(raw).expect("json should parse");
        let settings: AppSettings =
            serde_json::from_value(parsed).expect("settings shape should parse");

        assert_eq!(
            validate_app_settings(&settings),
            Err("AI provider settings must not contain secrets".to_string()),
        );
    }

    #[test]
    fn rejects_ai_provider_custom_auth_headers() {
        let mut settings = default_app_settings();
        settings.ai.providers.providers[0].custom_headers =
            Some(r#"{"Authorization":"Bearer leak","X-Trace-Id":"trace"}"#.to_string());

        assert_eq!(
            validate_app_settings(&settings),
            Err("AI provider custom headers contain protected auth headers".to_string()),
        );
    }

    #[test]
    fn accepts_detected_local_ai_profile_without_secrets() {
        let settings = AppSettings {
            ai: AiSettings {
                enabled_profile_id: Some("codex:gpt-5.4".to_string()),
                providers: AiProviderSettings::default(),
                profiles: vec![AiProfileSettings {
                    enabled: true,
                    id: "codex:gpt-5.4".to_string(),
                    is_test_runtime: false,
                    kind: "codex_app_server".to_string(),
                    label: "Codex / GPT-5.4".to_string(),
                    model_id: "gpt-5.4".to_string(),
                    model_label: "GPT-5.4".to_string(),
                    provider_id: "openai".to_string(),
                    provider_label: "OpenAI".to_string(),
                }],
                ..AiSettings::default()
            },
            appearance: AppearanceSettings::default(),
            schema_version: 1,
            storage: StorageSettings {
                default_provider: "local".to_string(),
            },
        };

        assert_eq!(validate_app_settings(&settings), Ok(()));
        assert!(!serde_json::to_string(&settings)
            .expect("settings should serialize")
            .contains("apiKey"));
    }
}

//! Controlled Codex custom provider (Responses-compatible) configuration.
//! API keys stay in the OS keyring and are injected only into the sidecar env.
//! Author: refinex

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};
use toml_edit::{value, DocumentMut, Item, Table};

use crate::codex::{
    resolve_codex_binary, resolve_codex_storage, unavailable_runtime_info, CodexRuntimeInfo,
    CodexState,
};

pub const CUSTOM_PROVIDER_ID: &str = "madora_custom";
pub const CUSTOM_PROVIDER_ENV_KEY: &str = "MADORA_CODEX_PROVIDER_API_KEY";
pub const DEFAULT_MODEL_PROVIDER: &str = "openai";

#[allow(dead_code)] // used by non-test keyring path
const KEYRING_SERVICE: &str = "madora.codex.custom-provider";
#[allow(dead_code)] // used by non-test keyring path
const KEYRING_ACCOUNT: &str = "api-key";
const PROVIDER_DISPLAY_NAME: &str = "Madora Custom";
const MAX_BASE_URL_LEN: usize = 2_048;
const MAX_MODEL_LEN: usize = 256;
const MAX_API_KEY_LEN: usize = 8_192;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCustomProviderInfo {
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub has_api_key: bool,
    pub enabled: bool,
    pub env_key: String,
    pub provider_id: String,
    pub wire_api: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConnectionStatus {
    pub runtime: CodexRuntimeInfo,
    pub auth_mode: String,
    pub custom_configured: bool,
    pub has_api_key: bool,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub running: bool,
    pub signed_in: bool,
    pub account_type: Option<String>,
    pub account_email: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
struct CustomProviderConfig {
    base_url: Option<String>,
    model: Option<String>,
    model_provider: Option<String>,
}

#[tauri::command]
pub fn codex_custom_provider_get(app: AppHandle) -> Result<CodexCustomProviderInfo, String> {
    let storage = resolve_codex_storage(&app, None)?;
    let config = read_custom_provider_config(&storage.root)?;
    let has_api_key = api_key_stored()?;
    Ok(CodexCustomProviderInfo {
        base_url: config.base_url,
        model: config.model,
        has_api_key,
        enabled: config.model_provider.as_deref() == Some(CUSTOM_PROVIDER_ID),
        env_key: CUSTOM_PROVIDER_ENV_KEY.to_string(),
        provider_id: CUSTOM_PROVIDER_ID.to_string(),
        wire_api: "responses".to_string(),
    })
}

#[tauri::command]
pub fn codex_custom_provider_set(
    app: AppHandle,
    base_url: String,
    model: String,
    api_key: Option<String>,
) -> Result<CodexCustomProviderInfo, String> {
    let storage = resolve_codex_storage(&app, None)?;
    let normalized_url = validate_base_url(&base_url)?;
    let normalized_model = validate_model(&model)?;

    if let Some(key) = api_key {
        let normalized_key = validate_api_key(&key)?;
        store_api_key(&normalized_key)?;
    } else if !api_key_stored()? {
        return Err("请提供 API Key".to_string());
    }

    patch_custom_provider_config(
        &storage.root,
        Some(&normalized_url),
        Some(&normalized_model),
        true,
    )?;

    codex_custom_provider_get(app)
}

#[tauri::command]
pub fn codex_custom_provider_clear(app: AppHandle) -> Result<CodexCustomProviderInfo, String> {
    let storage = resolve_codex_storage(&app, None)?;
    clear_api_key()?;
    patch_custom_provider_config(&storage.root, None, None, false)?;
    codex_custom_provider_get(app)
}

#[tauri::command]
pub fn codex_auth_mode_set(app: AppHandle, mode: String) -> Result<CodexCustomProviderInfo, String> {
    let storage = resolve_codex_storage(&app, None)?;
    let normalized = mode.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "chatgpt" | "openai" => {
            set_model_provider(&storage.root, DEFAULT_MODEL_PROVIDER)?;
        }
        "custom" => {
            let config = read_custom_provider_config(&storage.root)?;
            if config.base_url.as_ref().is_none_or(|value| value.trim().is_empty()) {
                return Err("请先配置自定义 Base URL".to_string());
            }
            if !api_key_stored()? {
                return Err("请先保存自定义 API Key".to_string());
            }
            set_model_provider(&storage.root, CUSTOM_PROVIDER_ID)?;
        }
        _ => return Err("不支持的认证模式，仅允许 chatgpt 或 custom".to_string()),
    }

    codex_custom_provider_get(app)
}

#[tauri::command]
pub fn codex_connection_status(
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectionStatus, String> {
    let storage = match resolve_codex_storage(&app, None) {
        Ok(storage) => storage,
        Err(message) => {
            return Ok(CodexConnectionStatus {
                runtime: unavailable_runtime_info(message.clone(), None),
                auth_mode: "unknown".to_string(),
                custom_configured: false,
                has_api_key: false,
                model: None,
                base_url: None,
                running: false,
                signed_in: false,
                account_type: None,
                account_email: None,
                error: Some(message),
            });
        }
    };

    // Fast path: filesystem + in-memory session flag only.
    // Do not talk to App Server here — settings must not hang on RPC.
    let mut runtime = match resolve_codex_binary(&app) {
        Ok(binary) => CodexRuntimeInfo {
            available: true,
            running: false,
            binary_source: Some(binary.source),
            version: Some(binary.version),
            storage_mode: "sharedCodexHome".to_string(),
            storage_root: Some(storage.root.display().to_string()),
            message: None,
        },
        Err(message) => unavailable_runtime_info(message, Some(&storage.root)),
    };

    let config = read_custom_provider_config(&storage.root).unwrap_or(CustomProviderConfig {
        base_url: None,
        model: None,
        model_provider: None,
    });
    let auth = read_auth_snapshot(&storage.root);
    let has_api_key = api_key_stored().unwrap_or(false);
    let enabled = config.model_provider.as_deref() == Some(CUSTOM_PROVIDER_ID);
    let custom_configured = config.base_url.is_some() && has_api_key;
    let auth_mode = if enabled {
        "custom".to_string()
    } else {
        "chatgpt".to_string()
    };

    let running = state.is_session_running();
    runtime.running = running;

    let error = if enabled && !has_api_key {
        Some("自定义 provider 已启用，但系统钥匙串中缺少 API Key".to_string())
    } else if enabled && config.base_url.is_none() {
        Some("自定义 provider 已启用，但缺少 Base URL".to_string())
    } else {
        runtime.message.clone()
    };

    Ok(CodexConnectionStatus {
        runtime,
        auth_mode,
        custom_configured,
        has_api_key,
        model: config.model,
        base_url: config.base_url,
        running,
        signed_in: auth.signed_in,
        account_type: auth.account_type,
        account_email: auth.account_email,
        error,
    })
}

/// Load the custom provider API key for sidecar env injection.
/// Returns `None` when custom mode is off or no key is stored.
pub fn load_sidecar_api_key(codex_home: &Path) -> Result<Option<String>, String> {
    let config = read_custom_provider_config(codex_home)?;
    if config.model_provider.as_deref() != Some(CUSTOM_PROVIDER_ID) {
        return Ok(None);
    }

    match read_api_key()? {
        Some(key) => Ok(Some(key)),
        None => Err(
            "自定义 Codex provider 已启用，但系统钥匙串中没有 API Key。请在设置中重新保存。"
                .to_string(),
        ),
    }
}

fn config_toml_path(codex_home: &Path) -> PathBuf {
    codex_home.join("config.toml")
}

#[derive(Clone, Debug, Default)]
struct AuthSnapshot {
    signed_in: bool,
    account_type: Option<String>,
    account_email: Option<String>,
}

/// Read non-secret login signals from CODEX_HOME/auth.json.
/// Never returns tokens or API keys.
fn read_auth_snapshot(codex_home: &Path) -> AuthSnapshot {
    let path = codex_home.join("auth.json");
    let Ok(raw) = fs::read_to_string(&path) else {
        return AuthSnapshot::default();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return AuthSnapshot::default();
    };

    let auth_mode = value
        .get("auth_mode")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let openai_api_key = value
        .get("OPENAI_API_KEY")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let tokens = value.get("tokens").and_then(|item| item.as_object());
    let has_chatgpt_tokens = tokens.is_some_and(|map| {
        ["access_token", "refresh_token", "id_token"]
            .iter()
            .any(|key| {
                map.get(*key)
                    .and_then(|item| item.as_str())
                    .is_some_and(|value| !value.trim().is_empty())
            })
    });

    let account_email = tokens
        .and_then(|map| map.get("id_token"))
        .and_then(|item| item.as_str())
        .and_then(email_from_jwt);

    if auth_mode == "chatgpt" || has_chatgpt_tokens {
        return AuthSnapshot {
            signed_in: has_chatgpt_tokens,
            account_type: Some("chatgpt".to_string()),
            account_email,
        };
    }

    if auth_mode == "apikey" || openai_api_key.is_some() {
        return AuthSnapshot {
            signed_in: openai_api_key.is_some(),
            account_type: Some("apiKey".to_string()),
            account_email: None,
        };
    }

    AuthSnapshot {
        signed_in: has_chatgpt_tokens || openai_api_key.is_some(),
        account_type: if has_chatgpt_tokens {
            Some("chatgpt".to_string())
        } else if openai_api_key.is_some() {
            Some("apiKey".to_string())
        } else {
            None
        },
        account_email,
    }
}

fn email_from_jwt(token: &str) -> Option<String> {
    use base64::Engine;

    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    let value = serde_json::from_slice::<serde_json::Value>(&decoded).ok()?;
    value
        .get("email")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|email| !email.is_empty() && email.contains('@'))
        .map(str::to_string)
}

fn read_custom_provider_config(codex_home: &Path) -> Result<CustomProviderConfig, String> {
    let path = config_toml_path(codex_home);
    if !path.exists() {
        return Ok(CustomProviderConfig {
            base_url: None,
            model: None,
            model_provider: None,
        });
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("读取 Codex config.toml 失败: {error}"))?;
    let document = raw
        .parse::<DocumentMut>()
        .map_err(|error| format!("解析 Codex config.toml 失败: {error}"))?;

    let model = document
        .get("model")
        .and_then(Item::as_str)
        .map(str::to_string);
    let model_provider = document
        .get("model_provider")
        .and_then(Item::as_str)
        .map(str::to_string);
    let base_url = document
        .get("model_providers")
        .and_then(Item::as_table)
        .and_then(|providers| providers.get(CUSTOM_PROVIDER_ID))
        .and_then(Item::as_table)
        .and_then(|provider| provider.get("base_url"))
        .and_then(Item::as_str)
        .map(str::to_string);

    Ok(CustomProviderConfig {
        base_url,
        model,
        model_provider,
    })
}

fn patch_custom_provider_config(
    codex_home: &Path,
    base_url: Option<&str>,
    model: Option<&str>,
    enable: bool,
) -> Result<(), String> {
    let path = config_toml_path(codex_home);
    let mut document = if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("读取 Codex config.toml 失败: {error}"))?;
        raw.parse::<DocumentMut>()
            .map_err(|error| format!("解析 Codex config.toml 失败: {error}"))?
    } else {
        DocumentMut::new()
    };

    if let Some(model) = model {
        document["model"] = value(model);
    }

    if enable {
        let base_url = base_url.ok_or_else(|| "缺少 Base URL".to_string())?;
        document["model_provider"] = value(CUSTOM_PROVIDER_ID);

        let providers = document["model_providers"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| "Codex config.toml 的 model_providers 必须是表".to_string())?;
        let provider = providers
            .entry(CUSTOM_PROVIDER_ID)
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| "无法写入 madora_custom provider".to_string())?;

        provider["name"] = value(PROVIDER_DISPLAY_NAME);
        provider["base_url"] = value(base_url);
        provider["env_key"] = value(CUSTOM_PROVIDER_ENV_KEY);
        provider["wire_api"] = value("responses");
        provider["requires_openai_auth"] = value(false);
    } else {
        if document
            .get("model_provider")
            .and_then(Item::as_str)
            == Some(CUSTOM_PROVIDER_ID)
        {
            document["model_provider"] = value(DEFAULT_MODEL_PROVIDER);
        }

        if let Some(providers) = document.get_mut("model_providers").and_then(Item::as_table_mut)
        {
            providers.remove(CUSTOM_PROVIDER_ID);
            if providers.is_empty() {
                document.remove("model_providers");
            }
        }
    }

    write_config_atomically(&path, &document)
}

fn set_model_provider(codex_home: &Path, provider: &str) -> Result<(), String> {
    let path = config_toml_path(codex_home);
    let mut document = if path.exists() {
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("读取 Codex config.toml 失败: {error}"))?;
        raw.parse::<DocumentMut>()
            .map_err(|error| format!("解析 Codex config.toml 失败: {error}"))?
    } else {
        DocumentMut::new()
    };

    document["model_provider"] = value(provider);
    write_config_atomically(&path, &document)
}

fn write_config_atomically(path: &Path, document: &DocumentMut) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Codex 配置目录失败: {error}"))?;
    }

    let temp_path = path.with_extension("toml.madora.tmp");
    let serialized = document.to_string();
    fs::write(&temp_path, serialized)
        .map_err(|error| format!("写入 Codex config.toml 临时文件失败: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("替换 Codex config.toml 失败: {error}"))?;
    Ok(())
}

#[cfg(not(test))]
fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("打开系统钥匙串失败: {error}"))
}

#[cfg(test)]
mod secret_store {
    use std::sync::Mutex;

    static TEST_API_KEY: Mutex<Option<String>> = Mutex::new(None);

    pub fn read_api_key() -> Result<Option<String>, String> {
        Ok(TEST_API_KEY
            .lock()
            .map_err(|_| "测试钥匙串锁已损坏".to_string())?
            .clone())
    }

    pub fn store_api_key(api_key: &str) -> Result<(), String> {
        *TEST_API_KEY
            .lock()
            .map_err(|_| "测试钥匙串锁已损坏".to_string())? = Some(api_key.to_string());
        Ok(())
    }

    pub fn clear_api_key() -> Result<(), String> {
        *TEST_API_KEY
            .lock()
            .map_err(|_| "测试钥匙串锁已损坏".to_string())? = None;
        Ok(())
    }
}

#[cfg(not(test))]
mod secret_store {
    use super::keyring_entry;

    pub fn read_api_key() -> Result<Option<String>, String> {
        match keyring_entry()?.get_password() {
            Ok(password) if !password.trim().is_empty() => Ok(Some(password)),
            Ok(_) => Ok(None),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("读取系统钥匙串失败: {error}")),
        }
    }

    pub fn store_api_key(api_key: &str) -> Result<(), String> {
        keyring_entry()?
            .set_password(api_key)
            .map_err(|error| format!("写入系统钥匙串失败: {error}"))
    }

    pub fn clear_api_key() -> Result<(), String> {
        match keyring_entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("清除系统钥匙串失败: {error}")),
        }
    }
}

fn api_key_stored() -> Result<bool, String> {
    Ok(secret_store::read_api_key()?.is_some())
}

fn read_api_key() -> Result<Option<String>, String> {
    secret_store::read_api_key()
}

fn store_api_key(api_key: &str) -> Result<(), String> {
    secret_store::store_api_key(api_key)
}

fn clear_api_key() -> Result<(), String> {
    secret_store::clear_api_key()
}

fn validate_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }
    if trimmed.len() > MAX_BASE_URL_LEN {
        return Err("Base URL 过长".to_string());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("Base URL 包含非法字符".to_string());
    }
    if trimmed.contains("..") {
        return Err("Base URL 不能包含相对路径片段".to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("Base URL 必须以 http:// 或 https:// 开头".to_string());
    }

    let after_scheme = trimmed
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or("");
    if after_scheme.is_empty() || after_scheme.starts_with('/') {
        return Err("Base URL 缺少主机名".to_string());
    }
    let authority = after_scheme.split('/').next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err("Base URL 主机无效，且不能包含用户名或密码".to_string());
    }

    Ok(trimmed.trim_end_matches('/').to_string())
}

fn validate_model(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Model 不能为空".to_string());
    }
    if trimmed.len() > MAX_MODEL_LEN {
        return Err("Model 过长".to_string());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("Model 包含非法字符".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_api_key(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("API Key 不能为空".to_string());
    }
    if trimmed.len() > MAX_API_KEY_LEN {
        return Err("API Key 过长".to_string());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("API Key 包含非法字符".to_string());
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn rejects_invalid_base_urls() {
        assert!(validate_base_url("").is_err());
        assert!(validate_base_url("/relative").is_err());
        assert!(validate_base_url("ftp://example.com").is_err());
        assert!(validate_base_url("https://user:pass@example.com/v1").is_err());
        assert!(validate_base_url("https://example.com/../escape").is_err());
        assert_eq!(
            validate_base_url("https://api.openai.com/v1/").unwrap(),
            "https://api.openai.com/v1"
        );
    }

    #[test]
    fn patches_config_idempotently_and_preserves_other_keys() {
        let home = tempdir().expect("temp codex home");
        let path = config_toml_path(home.path());
        fs::write(
            &path,
            r#"
notify = ["echo"]
model = "kept-model"

[mcp_servers.demo]
command = "demo"
"#,
        )
        .expect("seed config");

        patch_custom_provider_config(
            home.path(),
            Some("https://gateway.example.com/v1"),
            Some("gpt-test"),
            true,
        )
        .expect("enable custom");

        let first = fs::read_to_string(&path).expect("read config");
        assert!(first.contains("model_provider = \"madora_custom\""));
        assert!(first.contains("base_url = \"https://gateway.example.com/v1\""));
        assert!(first.contains("wire_api = \"responses\""));
        assert!(first.contains("env_key = \"MADORA_CODEX_PROVIDER_API_KEY\""));
        assert!(first.contains("notify = [\"echo\"]"));
        assert!(first.contains("[mcp_servers.demo]"));
        assert!(first.contains("model = \"gpt-test\""));

        patch_custom_provider_config(
            home.path(),
            Some("https://gateway.example.com/v1"),
            Some("gpt-test"),
            true,
        )
        .expect("enable again");
        let second = fs::read_to_string(&path).expect("read config again");
        assert_eq!(
            second.matches("[model_providers.madora_custom]").count(),
            1
        );

        patch_custom_provider_config(home.path(), None, None, false).expect("clear custom");
        let cleared = fs::read_to_string(&path).expect("read cleared");
        assert!(!cleared.contains("madora_custom"));
        assert!(cleared.contains("model_provider = \"openai\""));
        assert!(cleared.contains("notify = [\"echo\"]"));
        assert!(cleared.contains("[mcp_servers.demo]"));
    }

    #[test]
    fn keyring_roundtrip_and_sidecar_key_loading() {
        let _ = clear_api_key();

        let home = tempdir().expect("temp codex home");
        store_api_key("test-secret-key").expect("store key");
        assert!(api_key_stored().expect("has key"));

        patch_custom_provider_config(
            home.path(),
            Some("https://api.openai.com/v1"),
            Some("gpt-4.1"),
            true,
        )
        .expect("enable");

        let loaded = load_sidecar_api_key(home.path()).expect("load sidecar key");
        assert_eq!(loaded.as_deref(), Some("test-secret-key"));

        set_model_provider(home.path(), DEFAULT_MODEL_PROVIDER).expect("switch chatgpt");
        assert_eq!(
            load_sidecar_api_key(home.path()).expect("no inject when chatgpt"),
            None
        );

        clear_api_key().expect("clear");
        assert!(!api_key_stored().expect("cleared"));

        set_model_provider(home.path(), CUSTOM_PROVIDER_ID).expect("re-enable custom");
        let error = load_sidecar_api_key(home.path()).expect_err("missing key");
        assert!(error.contains("API Key"));
    }

    #[test]
    fn reads_chatgpt_auth_snapshot_without_exposing_tokens() {
        use base64::Engine;

        let home = tempdir().expect("temp codex home");
        // Synthetic JWT payload {"email":"user@example.com"} — not a real credential.
        let id_token = format!(
            "aaa.{}.ccc",
            base64::engine::general_purpose::URL_SAFE_NO_PAD
                .encode(br#"{"email":"user@example.com"}"#)
        );
        fs::write(
            home.path().join("auth.json"),
            serde_json::json!({
                "auth_mode": "chatgpt",
                "tokens": {
                    "access_token": "access-secret",
                    "id_token": id_token,
                    "refresh_token": "refresh-secret"
                }
            })
            .to_string(),
        )
        .expect("write auth");

        let snapshot = read_auth_snapshot(home.path());
        assert!(snapshot.signed_in);
        assert_eq!(snapshot.account_type.as_deref(), Some("chatgpt"));
        assert_eq!(snapshot.account_email.as_deref(), Some("user@example.com"));
    }

    #[test]
    fn missing_auth_file_means_signed_out() {
        let home = tempdir().expect("temp codex home");
        let snapshot = read_auth_snapshot(home.path());
        assert!(!snapshot.signed_in);
        assert!(snapshot.account_type.is_none());
    }
}

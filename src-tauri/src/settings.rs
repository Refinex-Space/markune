use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub storage: StorageSettings,
    #[serde(default)]
    pub appearance: AppearanceSettings,
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

    let json = serde_json::to_string_pretty(&settings).map_err(|_| "无法序列化应用设置".to_string())?;
    fs::write(&path, format!("{json}\n")).map_err(|_| "无法保存应用设置".to_string())?;
    Ok(settings)
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        schema_version: 1,
        storage: StorageSettings { default_provider: "local".to_string() },
        appearance: AppearanceSettings::default(),
    }
}

fn default_page_width_mode() -> String {
    "wide".to_string()
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|_| "无法定位应用设置目录".to_string())?;
    Ok(config_dir.join("settings.json"))
}

fn validate_app_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.schema_version != 1 {
        return Err("不支持的设置版本".to_string());
    }
    if settings.storage.default_provider != "local" {
        return Err("仅支持本地存储".to_string());
    }
    if !matches!(settings.appearance.page_width_mode.as_str(), "standard" | "wide") {
        return Err("页面宽度设置无效".to_string());
    }
    validate_font(&settings.appearance.fonts.ui, "UI 字体")?;
    validate_font(&settings.appearance.fonts.document, "文档字体")?;
    validate_font(&settings.appearance.fonts.code, "代码块字体")?;
    Ok(())
}

fn validate_font(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > 256 {
        return Err(format!("{label}设置无效"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        assert!(validate_app_settings(&default_app_settings()).is_ok());
    }

    #[test]
    fn unknown_legacy_field_is_ignored() {
        let parsed: AppSettings = serde_json::from_str(r#"{
          "schemaVersion": 1,
          "storage": { "defaultProvider": "local" },
          "appearance": { "pageWidthMode": "wide" },
          "legacy": { "enabledProfileId": "legacy" }
        }"#).expect("legacy settings should remain readable");

        assert_eq!(parsed.appearance.page_width_mode, "wide");
    }
}

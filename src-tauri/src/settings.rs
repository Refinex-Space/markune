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
    #[serde(default)]
    pub calendar: CalendarSettings,
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
    #[serde(default)]
    pub system_nav_collapsed: bool,
    #[serde(default = "default_system_nav_layout")]
    pub system_nav_layout: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSettings {
    #[serde(default = "default_calendar_expanded")]
    pub expanded: bool,
    #[serde(default = "default_calendar_week_starts_on")]
    pub week_starts_on: String,
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
            system_nav_collapsed: false,
            system_nav_layout: default_system_nav_layout(),
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

impl Default for CalendarSettings {
    fn default() -> Self {
        Self {
            expanded: default_calendar_expanded(),
            week_starts_on: default_calendar_week_starts_on(),
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
        calendar: CalendarSettings::default(),
    }
}

fn default_page_width_mode() -> String {
    "wide".to_string()
}

fn default_system_nav_layout() -> String {
    "vertical".to_string()
}

fn default_calendar_expanded() -> bool {
    true
}

fn default_calendar_week_starts_on() -> String {
    "monday".to_string()
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
    if !matches!(
        settings.appearance.system_nav_layout.as_str(),
        "vertical" | "horizontal"
    ) {
        return Err("系统入口排列设置无效".to_string());
    }
    if !matches!(
        settings.calendar.week_starts_on.as_str(),
        "monday" | "sunday"
    ) {
        return Err("每周起始日设置无效".to_string());
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
        assert_eq!(parsed.appearance.system_nav_layout, "vertical");
        assert!(!parsed.appearance.system_nav_collapsed);
        assert!(parsed.calendar.expanded);
        assert_eq!(parsed.calendar.week_starts_on, "monday");
    }

    #[test]
    fn missing_system_nav_fields_use_defaults() {
        let parsed: AppSettings = serde_json::from_str(
            r#"{
          "schemaVersion": 1,
          "storage": { "defaultProvider": "local" },
          "appearance": { "pageWidthMode": "standard" }
        }"#,
        )
        .expect("settings without system nav fields should remain readable");

        assert_eq!(parsed.appearance.system_nav_layout, "vertical");
        assert!(!parsed.appearance.system_nav_collapsed);
        assert!(validate_app_settings(&parsed).is_ok());
    }

    #[test]
    fn invalid_system_nav_layout_is_rejected() {
        let mut settings = default_app_settings();
        settings.appearance.system_nav_layout = "grid".to_string();
        assert_eq!(
            validate_app_settings(&settings).unwrap_err(),
            "系统入口排列设置无效"
        );
    }

    #[test]
    fn horizontal_collapsed_system_nav_is_valid() {
        let mut settings = default_app_settings();
        settings.appearance.system_nav_layout = "horizontal".to_string();
        settings.appearance.system_nav_collapsed = true;
        assert!(validate_app_settings(&settings).is_ok());
    }

    #[test]
    fn missing_calendar_settings_use_defaults() {
        let parsed: AppSettings = serde_json::from_str(
            r#"{
          "schemaVersion": 1,
          "storage": { "defaultProvider": "local" },
          "appearance": { "pageWidthMode": "wide" }
        }"#,
        )
        .expect("settings without calendar fields should remain readable");

        assert!(parsed.calendar.expanded);
        assert_eq!(parsed.calendar.week_starts_on, "monday");
        assert!(validate_app_settings(&parsed).is_ok());
    }

    #[test]
    fn sunday_calendar_start_is_valid() {
        let mut settings = default_app_settings();
        settings.calendar.expanded = false;
        settings.calendar.week_starts_on = "sunday".to_string();
        assert!(validate_app_settings(&settings).is_ok());
    }

    #[test]
    fn invalid_calendar_week_start_is_rejected() {
        let mut settings = default_app_settings();
        settings.calendar.week_starts_on = "friday".to_string();
        assert_eq!(
            validate_app_settings(&settings).unwrap_err(),
            "每周起始日设置无效"
        );
    }
}

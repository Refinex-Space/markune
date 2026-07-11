use crate::settings::AppearanceFontSettings;
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontOptions {
    pub code: Vec<String>,
    pub document: Vec<String>,
    pub recommendations: AppearanceFontSettings,
    pub ui: Vec<String>,
}

const UI_FONT_PRIORITIES: &[&str] = &[
    "SF Pro Text",
    "PingFang SC",
    "Segoe UI",
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "Arial",
];
const DOCUMENT_FONT_PRIORITIES: &[&str] = &[
    "Songti SC",
    "PingFang SC",
    "Noto Serif CJK SC",
    "Microsoft YaHei",
    "SimSun",
    "Georgia",
];
const CODE_FONT_PRIORITIES: &[&str] = &[
    "JetBrains Mono",
    "SF Mono",
    "Menlo",
    "Cascadia Code",
    "Consolas",
    "Monaco",
];

#[tauri::command]
pub async fn list_system_fonts() -> SystemFontOptions {
    tauri::async_runtime::spawn_blocking(detect_system_fonts)
        .await
        .unwrap_or_else(|_| fallback_system_font_options())
}

fn detect_system_fonts() -> SystemFontOptions {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let families = collect_font_families(&database);

    build_system_font_options(&families)
}

fn fallback_system_font_options() -> SystemFontOptions {
    build_system_font_options(&[])
}

fn collect_font_families(database: &fontdb::Database) -> Vec<String> {
    let mut families = BTreeSet::new();

    for face in database.faces() {
        for (family, _) in &face.families {
            let family = family.trim();

            if !family.is_empty() {
                families.insert(family.to_string());
            }
        }
    }

    families.into_iter().collect()
}

fn build_system_font_options(families: &[String]) -> SystemFontOptions {
    let recommendations = AppearanceFontSettings {
        code: recommend_font(families, CODE_FONT_PRIORITIES, "JetBrains Mono"),
        document: recommend_font(families, DOCUMENT_FONT_PRIORITIES, "Songti SC"),
        ui: recommend_font(families, UI_FONT_PRIORITIES, "SF Pro Text"),
    };
    let code = ensure_required_fonts(
        filter_code_fonts(families),
        &recommendations.code,
        CODE_FONT_PRIORITIES,
    );
    let document = ensure_required_fonts(
        families.to_vec(),
        &recommendations.document,
        DOCUMENT_FONT_PRIORITIES,
    );
    let ui = ensure_required_fonts(families.to_vec(), &recommendations.ui, UI_FONT_PRIORITIES);

    SystemFontOptions {
        code,
        document,
        recommendations,
        ui,
    }
}

fn recommend_font(families: &[String], priorities: &[&str], fallback: &str) -> String {
    priorities
        .iter()
        .find(|priority| {
            families
                .iter()
                .any(|family| family.eq_ignore_ascii_case(priority))
        })
        .unwrap_or(&fallback)
        .to_string()
}

fn filter_code_fonts(families: &[String]) -> Vec<String> {
    families
        .iter()
        .filter(|family| is_likely_code_font(family))
        .cloned()
        .collect()
}

fn is_likely_code_font(family: &str) -> bool {
    let lower = family.to_lowercase();

    [
        "mono",
        "monospace",
        "code",
        "console",
        "consolas",
        "courier",
        "menlo",
        "monaco",
        "cascadia",
        "jetbrains",
    ]
    .iter()
    .any(|keyword| lower.contains(keyword))
}

fn ensure_required_fonts(
    fonts: Vec<String>,
    recommended: &str,
    priorities: &[&str],
) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut next_fonts = Vec::new();

    for font in std::iter::once(recommended.to_string())
        .chain(priorities.iter().map(|font| (*font).to_string()))
        .chain(fonts.into_iter())
    {
        let trimmed = font.trim();

        if trimmed.is_empty() || seen.contains(trimmed) {
            continue;
        }

        seen.insert(trimmed.to_string());
        next_fonts.push(trimmed.to_string());
    }

    next_fonts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommends_first_available_font() {
        let families = vec![
            "Arial".to_string(),
            "PingFang SC".to_string(),
            "Menlo".to_string(),
        ];
        let options = build_system_font_options(&families);

        assert_eq!(options.recommendations.ui, "PingFang SC");
        assert_eq!(options.recommendations.document, "PingFang SC");
        assert_eq!(options.recommendations.code, "Menlo");
    }

    #[test]
    fn code_font_filter_keeps_monospace_family_names() {
        let families = vec![
            "Songti SC".to_string(),
            "Cascadia Code".to_string(),
            "JetBrains Mono".to_string(),
        ];
        let options = build_system_font_options(&families);

        assert!(options.code.contains(&"Cascadia Code".to_string()));
        assert!(options.code.contains(&"JetBrains Mono".to_string()));
        assert!(!options.code.contains(&"Songti SC".to_string()));
    }

    #[test]
    fn fallback_includes_recommended_font_families() {
        let options = fallback_system_font_options();

        assert!(options.ui.contains(&options.recommendations.ui));
        assert!(options.document.contains(&options.recommendations.document));
        assert!(options.code.contains(&options.recommendations.code));
    }
}

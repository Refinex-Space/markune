use std::collections::BTreeMap;
use yaml_rust2::{
    parser::{Event, Parser},
    Yaml, YamlLoader,
};

pub(crate) const MAX_FRONTMATTER_BYTES: usize = 64 * 1024;
const YAML_ERROR_PREFIX: &str = "元数据 YAML 无法解析";

#[derive(Clone, Copy, Default)]
struct Cost {
    nodes: usize,
    bytes: usize,
}

impl Cost {
    fn add(&mut self, other: Self) -> Result<(), String> {
        self.nodes = self.nodes.saturating_add(other.nodes);
        self.bytes = self.bytes.saturating_add(other.bytes);
        if self.nodes > 8192 || self.bytes > 256 * 1024 {
            return Err("元数据展开超过图谱解析上限".into());
        }
        Ok(())
    }
}

// Validate expanded allocation costs before the YAML loader materializes aliases. author: refinex
pub(crate) fn parse_fields(raw: &str) -> Result<BTreeMap<String, Vec<String>>, String> {
    let parsed = parse_fields_strict(raw);
    if let Err(error) = &parsed {
        if error.starts_with(YAML_ERROR_PREFIX) {
            if let Some(compatible) = quote_legacy_markune_title(raw) {
                return parse_fields_strict(&compatible);
            }
        }
    }
    parsed
}

pub(crate) fn parse_values(raw: &str) -> Result<serde_json::Value, String> {
    parse_fields(raw)?;
    if raw.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    let docs = match YamlLoader::load_from_str(raw) {
        Ok(docs) => docs,
        Err(_) => {
            YamlLoader::load_from_str(&quote_legacy_markune_title(raw).ok_or("无法读取元数据")?)
                .map_err(yaml_error)?
        }
    };
    fn convert(value: &Yaml) -> Result<serde_json::Value, String> {
        Ok(match value {
            Yaml::String(value) => value.clone().into(),
            Yaml::Integer(value) => (*value).into(),
            Yaml::Real(value) => value
                .parse::<f64>()
                .ok()
                .and_then(serde_json::Number::from_f64)
                .map(serde_json::Value::Number)
                .unwrap_or_else(|| value.clone().into()),
            Yaml::Boolean(value) => (*value).into(),
            Yaml::Null => serde_json::Value::Null,
            Yaml::Array(values) => values
                .iter()
                .map(convert)
                .collect::<Result<Vec<_>, _>>()?
                .into(),
            Yaml::Hash(values) => {
                let mut object = serde_json::Map::new();
                for (key, value) in values {
                    if let Some(key) = key.as_str() {
                        object.insert(key.to_string(), convert(value)?);
                    }
                }
                serde_json::Value::Object(object)
            }
            _ => return Err("无法解释元数据字段类型".into()),
        })
    }
    convert(docs.first().ok_or("元数据为空")?)
}

// Old Markune writers interpolated an unquoted title. Repair only that field in memory. author: refinex
fn quote_legacy_markune_title(raw: &str) -> Option<String> {
    if raw.len() > MAX_FRONTMATTER_BYTES
        || !raw
            .lines()
            .any(|line| line.trim_end() == "refinexDialect: 1")
    {
        return None;
    }
    let mut title_seen = false;
    let mut lines = Vec::new();
    for line in raw.lines() {
        if let Some(value) = line.strip_prefix("title:") {
            let value = value.trim();
            if title_seen || value.is_empty() || value.starts_with(['\'', '"']) {
                return None;
            }
            title_seen = true;
            lines.push(format!("title: {}", serde_json::to_string(value).ok()?));
        } else {
            lines.push(line.to_string());
        }
    }
    title_seen.then(|| lines.join("\n"))
}

fn yaml_error(error: yaml_rust2::ScanError) -> String {
    format!(
        "{YAML_ERROR_PREFIX}（frontmatter 第 {} 行，第 {} 列）",
        error.marker().line(),
        error.marker().col() + 1
    )
}

fn parse_fields_strict(raw: &str) -> Result<BTreeMap<String, Vec<String>>, String> {
    if raw.trim().is_empty() {
        return Ok(BTreeMap::new());
    }
    if raw.len() > MAX_FRONTMATTER_BYTES {
        return Err("元数据超过 64 KiB，已跳过".into());
    }
    let mut parser = Parser::new_from_str(raw);
    let mut anchors = BTreeMap::<usize, Cost>::new();
    let mut stack = Vec::<(usize, Cost)>::new();
    let mut total = Cost::default();
    let mut documents = 0;
    let mut completed = false;
    for _ in 0..16384 {
        let (event, _) = parser.next_token().map_err(yaml_error)?;
        let finished = match event {
            Event::StreamEnd => {
                completed = true;
                break;
            }
            Event::DocumentStart => {
                documents += 1;
                if documents > 1 {
                    return Err("元数据只能包含一个 YAML 文档".into());
                }
                None
            }
            Event::SequenceStart(anchor, _) | Event::MappingStart(anchor, _) => {
                if stack.len() >= 16 {
                    return Err("元数据嵌套超过图谱解析上限".into());
                }
                total.add(Cost { nodes: 1, bytes: 0 })?;
                stack.push((anchor, Cost { nodes: 1, bytes: 0 }));
                None
            }
            Event::Scalar(value, _, anchor, _) => {
                let cost = Cost {
                    nodes: 1,
                    bytes: value.len(),
                };
                total.add(cost)?;
                Some((anchor, cost))
            }
            Event::Alias(anchor) => {
                let cost = anchors
                    .get(&anchor)
                    .copied()
                    .ok_or("元数据包含循环或未定义的 YAML 引用")?;
                total.add(cost)?;
                Some((0, cost))
            }
            Event::SequenceEnd | Event::MappingEnd => Some(stack.pop().ok_or("元数据结构无效")?),
            _ => None,
        };
        if let Some((anchor, cost)) = finished {
            if anchor != 0 {
                total.add(cost)?;
                anchors.insert(anchor, cost);
            }
            if let Some((_, parent)) = stack.last_mut() {
                parent.add(cost)?;
            }
        }
    }
    if !completed {
        return Err("元数据事件超过图谱解析上限".into());
    }
    let docs = YamlLoader::load_from_str(raw).map_err(yaml_error)?;
    let Some(mapping) = docs.first().and_then(Yaml::as_hash) else {
        return Err("元数据必须是 YAML 字段映射".into());
    };
    let mut fields = BTreeMap::new();
    for (key, value) in mapping {
        let Some(key) = key.as_str() else {
            continue;
        };
        if key.len() > 256 {
            continue;
        }
        let values = match value {
            Yaml::Array(values) => values.iter().filter_map(scalar_text).collect(),
            _ => scalar_text(value).into_iter().collect(),
        };
        fields.insert(key.to_string(), values);
    }
    Ok(fields)
}

fn scalar_text(value: &Yaml) -> Option<String> {
    match value {
        Yaml::String(value) | Yaml::Real(value) => Some(value.clone()),
        Yaml::Integer(value) => Some(value.to_string()),
        Yaml::Boolean(value) => Some(value.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_legacy_markune_bold_titles_without_losing_other_metadata() {
        let fields = parse_fields("createdAt: 2026-08-03T07:28:24.088Z\nrefinexDialect: 1\ntitle: **通用 PDF 与 Word 转 Markdown 设计方案**\nupdatedAt: 2026-08-03T07:28:25.003Z\ntags: [pdf, word]\nrelated: '[[设计]]'\n").unwrap();
        assert_eq!(
            fields["title"],
            ["**通用 PDF 与 Word 转 Markdown 设计方案**"]
        );
        assert_eq!(fields["tags"], ["pdf", "word"]);
        assert_eq!(fields["related"], ["[[设计]]"]);
    }
    #[test]
    fn legacy_title_compatibility_does_not_hide_other_errors_or_override_valid_yaml() {
        assert!(
            parse_fields("refinexDialect: 1\ntitle: **Title**\ntags: [unfinished\n")
                .unwrap_err()
                .contains("frontmatter 第")
        );
        assert!(parse_fields("title: **external**\n").is_err());
        assert!(
            parse_fields("refinexDialect: 1\ntitle: **Title**\nloop: &loop [*loop]\n").is_err()
        );
        let fields =
            parse_fields("refinexDialect: 1\nname: &name 'Canonical'\ntitle: *name\n").unwrap();
        assert_eq!(fields["title"], ["Canonical"]);
        let fields = parse_fields("refinexDialect: 1\ntitle: Plan: review\ntags: [one]\n").unwrap();
        assert_eq!(fields["title"], ["Plan: review"]);
        assert_eq!(fields["tags"], ["one"]);
    }
    #[test]
    fn preserves_yaml_scalars_lists_comments_and_bounded_aliases() {
        let fields = parse_fields("tags:\n- 'alpha,beta'\n- topic/sub # comment\nshared: &items [one, two]\ncopy: *items\ntitle: 'Quoted: title'\n").unwrap();
        assert_eq!(fields["tags"], ["alpha,beta", "topic/sub"]);
        assert_eq!(fields["copy"], ["one", "two"]);
        assert_eq!(fields["title"], ["Quoted: title"]);
    }
    #[test]
    fn rejects_recursive_and_excessively_expanded_yaml() {
        assert!(parse_fields("tags: &loop [*loop]").is_err());
        let mut yaml = "a0: &a0 [one, two]\n".to_string();
        for i in 1..16 {
            yaml.push_str(&format!("a{i}: &a{i} [*a{}, *a{}]\n", i - 1, i - 1));
        }
        assert!(parse_fields(&yaml).is_err());
    }
}

use std::ops::Range;
use yaml_rust2::scanner::{Scanner, TScalarStyle, TokenType};

pub(crate) struct Frontmatter<'a> {
    pub block: &'a str,
    pub range: Range<usize>,
    pub body_start: usize,
}

pub(crate) fn split(raw: &str) -> Option<Frontmatter<'_>> {
    let bom = if raw.starts_with('\u{feff}') { 3 } else { 0 };
    let first = raw[bom..].split_inclusive('\n').next()?;
    if first.trim_end() != "---" || !first.ends_with('\n') {
        return None;
    }
    let start = bom + first.len();
    let mut offset = start;
    for line in raw[start..].split_inclusive('\n') {
        if matches!(line.trim_end(), "---" | "...") {
            return Some(Frontmatter {
                block: &raw[start..offset],
                range: start..offset,
                body_start: offset + line.len(),
            });
        }
        offset += line.len();
    }
    None
}

pub(crate) struct TextScalar {
    pub field: String,
    pub field_path: Vec<String>,
    pub value: String,
    pub range: Range<usize>,
    pub depth: usize,
    pub block: bool,
    pub comment: String,
}

pub(crate) fn text_scalars(block: &str) -> Result<Vec<TextScalar>, String> {
    crate::graph_metadata::parse_fields(block)?;
    let mut compatible = block.to_string();
    // Keep character offsets stable while scanning titles written by old versions. author: refinex
    if block
        .lines()
        .any(|line| line.trim_end() == "refinexDialect: 1")
    {
        if let Some((start, line)) = block
            .split_inclusive('\n')
            .scan(0, |offset, line| {
                let start = *offset;
                *offset += line.len();
                Some((start, line))
            })
            .find(|(_, line)| line.starts_with("title: **"))
        {
            let value_start = start + line.find("**").unwrap();
            let end = start + line.trim_end_matches(['\r', '\n']).len();
            compatible.replace_range(
                value_start..end,
                &"x".repeat(block[value_start..end].chars().count()),
            );
        }
    }
    let mut scanner = Scanner::new(compatible.chars());
    let tokens = scanner.by_ref().take(16384).collect::<Vec<_>>();
    if !scanner.stream_ended() {
        return Err("无法安全定位元数据字段".into());
    }
    let offsets = block
        .char_indices()
        .map(|(offset, _)| offset)
        .chain(std::iter::once(block.len()))
        .collect::<Vec<_>>();
    let byte = |index: usize| offsets.get(index).copied().unwrap_or(block.len());
    let mut stack = Vec::new();
    let mut keys: Vec<Option<String>> = Vec::new();
    let mut key = false;
    let mut field = String::new();
    let mut result = Vec::new();
    for (index, token) in tokens.iter().enumerate() {
        match &token.1 {
            TokenType::BlockMappingStart => {
                let indent = tokens[index + 1..]
                    .iter()
                    .find_map(|token| {
                        matches!(token.1, TokenType::Scalar(_, _)).then_some(token.0.col())
                    })
                    .unwrap_or(0);
                stack.push(indent);
                keys.push(None);
            }
            TokenType::BlockSequenceStart
            | TokenType::FlowMappingStart
            | TokenType::FlowSequenceStart => {
                stack.push(token.0.col());
                keys.push(None);
            }
            TokenType::BlockEnd | TokenType::FlowMappingEnd | TokenType::FlowSequenceEnd => {
                stack.pop();
                keys.pop();
            }
            TokenType::Key => key = true,
            TokenType::Value => key = false,
            TokenType::Scalar(_, value) if key => {
                if let Some(key) = keys.last_mut() {
                    *key = Some(value.clone());
                }
                if stack.len() == 1 {
                    field = value.clone();
                }
                key = false;
            }
            TokenType::Scalar(style, value) => {
                let marked_start = byte(token.0.index());
                let is_block = matches!(style, TScalarStyle::Literal | TScalarStyle::Folded);
                let start = if is_block {
                    let previous = tokens[..index]
                        .iter()
                        .rev()
                        .find(|token| matches!(token.1, TokenType::Value | TokenType::BlockEntry))
                        .map(|token| byte(token.0.index()) + 1)
                        .unwrap_or(0);
                    let indicator = if *style == TScalarStyle::Literal {
                        '|'
                    } else {
                        '>'
                    };
                    let mut offset = previous;
                    let mut found = None;
                    for line in block[previous..marked_start + 1].split_inclusive('\n') {
                        let content = line
                            .split_once('#')
                            .map(|(content, _)| content)
                            .unwrap_or(line);
                        if let Some((index, _)) =
                            content.char_indices().find(|(index, character)| {
                                *character == indicator
                                    && (*index == 0
                                        || content[..*index].ends_with(char::is_whitespace))
                            })
                        {
                            found = Some(offset + index);
                            break;
                        }
                        offset += line.len();
                    }
                    found.ok_or("无法安全定位多行元数据")?
                } else {
                    marked_start
                };
                let next = tokens[index + 1..]
                    .iter()
                    .map(|token| byte(token.0.index()))
                    .find(|offset| *offset > start)
                    .unwrap_or(block.len());
                let range = scalar_range(block, start, next, *style, *stack.last().unwrap_or(&0));
                let comment = if is_block {
                    block[start..]
                        .lines()
                        .next()
                        .and_then(|line| line.find('#').map(|index| line[index..].to_string()))
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                let value = if field == "title" && block[start..].starts_with("**") {
                    block[range.clone()].trim().to_string()
                } else {
                    value.clone()
                };
                result.push(TextScalar {
                    field: field.clone(),
                    field_path: keys.iter().flatten().cloned().collect(),
                    value,
                    range,
                    depth: stack.len(),
                    block: is_block,
                    comment,
                });
            }
            TokenType::Alias(name) if !key => {
                let start = byte(token.0.index());
                result.push(TextScalar {
                    field: field.clone(),
                    field_path: keys.iter().flatten().cloned().collect(),
                    value: String::new(),
                    range: start..start + 1 + name.len(),
                    depth: stack.len(),
                    block: false,
                    comment: String::new(),
                });
            }
            _ => {}
        }
    }
    Ok(result)
}

pub(crate) fn is_reference_text(field: &TextScalar) -> bool {
    !crate::graph_parse::is_system_field(&field.field)
        && (field.field != "source"
            || field
                .field_path
                .last()
                .is_some_and(|key| key == "reference"))
}

fn scalar_range(
    raw: &str,
    start: usize,
    next: usize,
    style: TScalarStyle,
    indent: usize,
) -> Range<usize> {
    if matches!(
        style,
        TScalarStyle::SingleQuoted | TScalarStyle::DoubleQuoted
    ) {
        let quote = raw.as_bytes()[start];
        let mut index = start + 1;
        while index < raw.len() {
            if quote == b'"' && raw.as_bytes()[index] == b'\\' {
                index += 2;
                continue;
            }
            if raw.as_bytes()[index] == quote {
                if quote == b'\'' && raw.as_bytes().get(index + 1) == Some(&quote) {
                    index += 2;
                    continue;
                }
                return start..index + 1;
            }
            index += 1;
        }
    }
    if matches!(style, TScalarStyle::Literal | TScalarStyle::Folded) {
        let mut end = start
            + raw[start..]
                .find('\n')
                .map(|offset| offset + 1)
                .unwrap_or(raw.len() - start);
        for line in raw[end..].split_inclusive('\n') {
            if !line.trim().is_empty()
                && line.chars().take_while(|c| matches!(c, ' ' | '\t')).count() <= indent
            {
                break;
            }
            end += line.len();
        }
        return start..end;
    }
    let mut end = next;
    let value = &raw[start..next];
    for (offset, character) in value.char_indices() {
        if character == '#' && (offset == 0 || value[..offset].ends_with(char::is_whitespace)) {
            end = start + offset;
            break;
        }
    }
    start..start + raw[start..end].trim_end().len()
}

pub(crate) fn replace_title(raw: &str, title: &str) -> Result<String, String> {
    let Some(frontmatter) = split(raw) else {
        return Ok(raw.to_string());
    };
    let fields = text_scalars(frontmatter.block)?;
    let titles = fields
        .iter()
        .filter(|field| field.field == "title" && field.depth == 1)
        .collect::<Vec<_>>();
    if titles.len() > 1 {
        return Err("元数据包含重复标题，无法安全重命名".into());
    }
    let Some(field) = titles.first() else {
        return Ok(raw.to_string());
    };
    let mut value = encode_string(title);
    if field.block {
        if !field.comment.is_empty() {
            value.push(' ');
            value.push_str(&field.comment);
        }
        value.push_str(if raw.contains("\r\n") { "\r\n" } else { "\n" });
    }
    let mut next = raw.to_string();
    next.replace_range(
        frontmatter.range.start + field.range.start..frontmatter.range.start + field.range.end,
        &value,
    );
    Ok(next)
}

pub(crate) fn encode_string(value: &str) -> String {
    let needs_quotes = value.is_empty()
        || value.trim() != value
        || value.contains([':', '#', '\\', '"', '\''])
        || value.chars().any(|character| {
            character.is_control() || matches!(character, '\u{0085}' | '\u{2028}' | '\u{2029}')
        })
        || value.chars().next().is_some_and(|character| {
            character.is_ascii_digit() || "!&*{}[],#|>@`\"'%?:+-.".contains(character)
        })
        || matches!(
            value.to_ascii_lowercase().as_str(),
            "null" | "true" | "false" | "yes" | "no" | "on" | "off" | "~"
        );
    if needs_quotes {
        serde_json::to_string(value)
            .expect("a frontmatter string serializes")
            .chars()
            .map(|character| {
                if ('\u{007f}'..='\u{009f}').contains(&character)
                    || matches!(character, '\u{2028}' | '\u{2029}')
                {
                    format!("\\u{:04x}", character as u32)
                } else {
                    character.to_string()
                }
            })
            .collect()
    } else {
        value.to_string()
    }
}

pub(crate) fn decode_string(value: &str) -> String {
    let value = value.trim();
    if let Ok(decoded) = serde_json::from_str::<String>(value) {
        return decoded;
    }
    if let Some(quoted) = value
        .strip_prefix('\'')
        .and_then(|value| value.strip_suffix('\''))
    {
        return quoted.replace("''", "'");
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_only_root_title_preserving_nested_fields_comments_and_line_endings() {
        for raw in ["---\ntitle: 'Old' # keep\ntags:\n - one\ncustom:\n title: nested\n---\nBody", "\u{feff}---\r\ntitle: |- # keep\r\n  Old\r\n  title\r\ncustom: {title: nested}\r\n...\r\nBody", "---\n{title: Old, tags: [one]}\n---\nBody"] {
            let next = replace_title(raw, "New: [title]").unwrap();
            let metadata = split(&next).unwrap();
            let fields = crate::graph_metadata::parse_fields(metadata.block).unwrap();
            assert_eq!(fields["title"], ["New: [title]"], "{next:?}");
            assert_eq!(&next[metadata.body_start..], "Body");
            assert_eq!(next.contains("# keep"), raw.contains("# keep"));
            assert_eq!(next.contains("title: nested"), raw.contains("title: nested"));
            assert_eq!(next.contains('\r'), raw.contains('\r'));
        }
    }
    #[test]
    fn preserves_markdown_brackets_in_plain_and_legacy_titles() {
        for raw in [
            "---\ntitle: Plan [draft]\ntags: [one]\n---\nBody",
            "---\nrefinexDialect: 1\ntitle: **旧标题**\ntags: [one]\n---\nBody",
        ] {
            let next = replace_title(raw, "New").unwrap();
            assert!(next.contains("title: New\ntags: [one]"), "{next}");
        }
    }
    #[test]
    fn encodes_special_titles_as_yaml_strings_without_changing_text() {
        for title in [
            "普通标题",
            "**PDF 与 Word**",
            "Plan: review",
            "# Heading",
            "[plan]",
            "*alias",
            "null",
            "TRUE",
            "123",
            "2026-09-05",
            "path\\note",
            "他说\"可以\"",
            "'quoted'",
            "one\ntags: [injected]",
            " leading ",
            "unicode\u{0085}line\u{2028}\u{009f}",
        ] {
            let encoded = encode_string(title);
            let yaml =
                yaml_rust2::YamlLoader::load_from_str(&format!("title: {encoded}\n")).unwrap();
            assert_eq!(yaml[0]["title"].as_str(), Some(title), "{title}");
            assert_eq!(decode_string(&encoded), title);
        }
        assert_eq!(encode_string("普通标题"), "普通标题");
        assert_eq!(decode_string("'It''s ready'"), "It's ready");
    }
}

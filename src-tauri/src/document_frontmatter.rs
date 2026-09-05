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

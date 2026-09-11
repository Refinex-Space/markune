use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::collections::{BTreeMap, BTreeSet};

const MAX_VALUES: usize = 8192;
const MAX_VALUE_BYTES: usize = 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Reference {
    pub value: String,
    pub wiki: bool,
}

#[derive(Default, Clone)]
pub(crate) struct Projection {
    pub title: Option<String>,
    pub references: Vec<Reference>,
    pub tags: BTreeSet<String>,
    pub properties: BTreeSet<String>,
    pub warnings: Vec<String>,
}

pub(crate) fn parse(raw: &str) -> Projection {
    let mut result = Projection::default();
    let (metadata, body) = split_frontmatter(raw.trim_start_matches('\u{feff}'));
    if let Some(metadata) = metadata {
        match crate::graph_metadata::parse_fields(metadata) {
            Ok(fields) => {
                project_fields(fields, &mut result);
                match crate::document_frontmatter::text_scalars(metadata) {
                    Ok(fields) => {
                        for field in fields {
                            if crate::document_frontmatter::is_reference_text(&field) {
                                parse_body(&field.value, &mut result, false);
                            }
                        }
                    }
                    Err(error) => result.warnings.push(error),
                }
            }
            Err(error) => result.warnings.push(error),
        }
    }
    parse_body(body, &mut result, true);
    result
}

fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let Some(first) = raw.lines().next() else {
        return (None, raw);
    };
    if first.trim_end() != "---" {
        return (None, raw);
    }
    let start = raw.find('\n').map(|index| index + 1).unwrap_or(raw.len());
    let mut offset = start;
    for line in raw[start..].split_inclusive('\n') {
        if matches!(line.trim_end(), "---" | "...") {
            return (Some(&raw[start..offset]), &raw[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, raw)
}

fn project_fields(fields: BTreeMap<String, Vec<String>>, result: &mut Projection) {
    for (key, values) in fields {
        match key.as_str() {
            "title" => {
                result.title = values
                    .first()
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| bounded_label(value))
            }
            "tags" => {
                for value in values {
                    add_tag(&value, result);
                }
            }
            "createdAt" | "updatedAt" | "refinexDialect" | "aliases" => {}
            _ => {
                result.properties.insert(key);
            }
        }
    }
}

pub(crate) fn is_system_field(key: &str) -> bool {
    matches!(
        key,
        "title" | "tags" | "aliases" | "createdAt" | "updatedAt" | "refinexDialect"
    )
}

fn parse_body(body: &str, result: &mut Projection, include_tags: bool) {
    let body = mask_obsidian_comments(body);
    match crate::document_links::body_references_masked(&body) {
        Ok(references) => {
            for located in references
                .into_iter()
                .filter(|reference| reference.occurrence)
            {
                if located.reference.value.len() > MAX_VALUE_BYTES
                    || result.references.len() >= MAX_VALUES
                {
                    if !result
                        .warnings
                        .iter()
                        .any(|warning| warning.contains("引用数量"))
                    {
                        result
                            .warnings
                            .push("单篇文档引用数量或长度超过图谱解析上限".into());
                    }
                    continue;
                }
                result.references.push(located.reference);
            }
        }
        Err(error) => result.warnings.push(error),
    }
    let options = Options::ENABLE_WIKILINKS
        | Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_MATH;
    let mut excluded = 0usize;
    let mut link_depth = 0usize;
    let mut html_code_depth = 0usize;
    let mut heading = None::<String>;
    for (event, range) in Parser::new_ext(&body, options).into_offset_iter() {
        match event {
            Event::Start(Tag::CodeBlock(_) | Tag::HtmlBlock) => excluded += 1,
            Event::End(TagEnd::CodeBlock | TagEnd::HtmlBlock) => {
                excluded = excluded.saturating_sub(1)
            }
            _ if excluded > 0 => {}
            Event::Start(Tag::Link { .. } | Tag::Image { .. }) => {
                link_depth += 1;
            }
            Event::End(TagEnd::Link | TagEnd::Image) => link_depth = link_depth.saturating_sub(1),
            Event::Start(Tag::Heading {
                level: HeadingLevel::H1,
                ..
            }) if include_tags && result.title.is_none() => heading = Some(String::new()),
            Event::End(TagEnd::Heading(_)) => {
                if let Some(value) = heading.take().filter(|value| !value.trim().is_empty()) {
                    result.title = Some(bounded_label(&value));
                }
            }
            Event::InlineHtml(html) => {
                let mut reader = quick_xml::Reader::from_str(&html);
                reader.config_mut().check_end_names = false;
                reader.config_mut().allow_unmatched_ends = true;
                loop {
                    use quick_xml::events::Event as XmlEvent;
                    match reader.read_event() {
                        Ok(XmlEvent::Start(element))
                            if [b"code".as_slice(), b"pre", b"script", b"style"]
                                .iter()
                                .any(|name| element.name().as_ref().eq_ignore_ascii_case(name)) =>
                        {
                            html_code_depth += 1
                        }
                        Ok(XmlEvent::End(element))
                            if [b"code".as_slice(), b"pre", b"script", b"style"]
                                .iter()
                                .any(|name| element.name().as_ref().eq_ignore_ascii_case(name)) =>
                        {
                            html_code_depth = html_code_depth.saturating_sub(1)
                        }
                        Ok(XmlEvent::Eof) | Err(_) => break,
                        _ => {}
                    }
                }
            }
            Event::Text(value) => {
                if let Some(heading) = heading
                    .as_mut()
                    .filter(|heading| heading.len() < MAX_VALUE_BYTES)
                {
                    heading.push_str(&value);
                }
                if include_tags && link_depth == 0 && html_code_depth == 0 {
                    extract_tags(&body, range, result);
                }
            }
            Event::Code(value) => {
                if let Some(heading) = heading
                    .as_mut()
                    .filter(|heading| heading.len() < MAX_VALUE_BYTES)
                {
                    heading.push_str(&value);
                }
            }
            _ => {}
        }
    }
}

fn bounded_label(value: &str) -> String {
    value.trim().chars().take(256).collect()
}

pub(crate) fn mask_obsidian_comments(raw: &str) -> String {
    let protected = Parser::new_ext(raw, Options::ENABLE_MATH | Options::ENABLE_WIKILINKS)
        .into_offset_iter()
        .filter_map(|(event, range)| {
            matches!(
                event,
                Event::Start(
                    Tag::CodeBlock(_) | Tag::HtmlBlock | Tag::Link { .. } | Tag::Image { .. }
                ) | Event::Code(_)
                    | Event::Html(_)
                    | Event::InlineHtml(_)
                    | Event::InlineMath(_)
                    | Event::DisplayMath(_)
            )
            .then_some(range)
        })
        .collect::<Vec<_>>();
    let mut bytes = raw.as_bytes().to_vec();
    let mut protected = protected.iter().peekable();
    let mut cursor = 0;
    while let Some(start) = raw[cursor..].find("%%") {
        let start = cursor + start;
        while protected.peek().is_some_and(|range| range.end <= start) {
            protected.next();
        }
        if protected.peek().is_some_and(|range| range.contains(&start))
            || raw[..start].ends_with('\\')
        {
            cursor = start + 2;
            continue;
        }
        let end = raw[start + 2..]
            .find("%%")
            .map(|offset| start + offset + 4)
            .unwrap_or(raw.len());
        for byte in &mut bytes[start..end] {
            if !matches!(*byte, b'\n' | b'\r') {
                *byte = b' ';
            }
        }
        cursor = end;
    }
    String::from_utf8(bytes).expect("comment masking preserves UTF-8")
}

fn extract_tags(body: &str, range: std::ops::Range<usize>, result: &mut Projection) {
    for (offset, character) in body[range.clone()].char_indices() {
        if character != '#' {
            continue;
        }
        let start = range.start + offset;
        let previous = body[..start].chars().next_back();
        if previous.is_some_and(|character| {
            character.is_alphanumeric() || matches!(character, '_' | '/' | '\\' | '#' | '&' | '=')
        }) {
            continue;
        }
        let value = body[start + 1..range.end]
            .split(|character: char| !is_tag_character(character))
            .next()
            .unwrap_or_default();
        if value.is_empty() || value.chars().all(char::is_numeric) {
            continue;
        }
        if value.split('/').any(str::is_empty) {
            continue;
        }
        add_tag(value, result);
    }
}

fn is_tag_character(character: char) -> bool {
    character.is_alphanumeric()
        || matches!(character, '_' | '-' | '/' | '\u{200d}' | '\u{fe0f}')
        || ('\u{0300}'..='\u{036f}').contains(&character)
        || ('\u{2600}'..='\u{27bf}').contains(&character)
        || ('\u{1f000}'..='\u{1faff}').contains(&character)
}

fn add_tag(value: &str, result: &mut Projection) {
    let value = value.trim().trim_start_matches('#').trim();
    if value.is_empty() {
        return;
    }
    if value.len() > MAX_VALUE_BYTES
        || (result.tags.len() >= MAX_VALUES && !result.tags.contains(&value.to_lowercase()))
    {
        if !result
            .warnings
            .iter()
            .any(|warning| warning.contains("标签数量或长度"))
        {
            result
                .warnings
                .push("标签数量或长度超过图谱解析上限".into());
        }
        return;
    }
    result.tags.insert(value.to_lowercase());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inline_html_code_does_not_create_tags_or_links() {
        let projection = parse("<code>#hidden [[missing]]</code> #real");
        assert_eq!(
            projection.tags.into_iter().collect::<Vec<_>>(),
            vec!["real"]
        );
        assert!(projection.references.is_empty());
    }
    #[test]
    fn accepts_markune_frontmatter_with_timestamps_and_chinese_title() {
        let raw = "---\ncreatedAt: 2026-07-13T08:59:16.273Z\nrefinexDialect: 1\ntitle: 通用 PDF 与 Word 转 Markdown 能力开发设计\nupdatedAt: 2026-07-17T01:04:39.834Z\n---\n";
        for raw in [
            raw.to_string(),
            raw.replace('\n', "\r\n"),
            format!("\u{feff}{raw}"),
        ] {
            let result = parse(&raw);
            assert!(result.warnings.is_empty(), "{:?}", result.warnings);
            assert_eq!(
                result.title.as_deref(),
                Some("通用 PDF 与 Word 转 Markdown 能力开发设计")
            );
        }
    }
    #[test]
    fn parses_markdown_syntax_without_code_comments_or_images() {
        let result = parse("```md\n[[fake]] #fake\n```\n`[[inline]]` <!-- [[comment]] -->\n%% [[hidden]] %%\n[real][ref] [paren](note(one).md) ![image](fake.md) ![[embed#heading|label]] [[wiki|shown]]\n\n[ref]: target.md \"title\"\n");
        assert_eq!(
            result
                .references
                .iter()
                .map(|reference| reference.value.as_str())
                .collect::<Vec<_>>(),
            ["target.md", "note(one).md", "embed#heading", "wiki"]
        );
        assert!(result.tags.is_empty());
    }
    #[test]
    fn projects_yaml_and_body_tags_without_collapsing_hierarchy() {
        let result = parse("---\ntitle: 'Title: here'\ntags:\n- 'alpha,beta'\n- topic/sub # comment\nrelated: ['[[target]]']\naliases: ['[[not-target]]']\n---\n# Real\n#Topic/Sub #topic-sub #中文 \\#escaped `#code` [#label](https://example.com/#fragment) #123\n");
        assert_eq!(result.title.as_deref(), Some("Title: here"));
        assert_eq!(
            result.tags.into_iter().collect::<Vec<_>>(),
            ["alpha,beta", "topic-sub", "topic/sub", "中文"]
        );
        assert!(result
            .references
            .iter()
            .any(|reference| reference.value == "target"));
        assert!(!result
            .references
            .iter()
            .any(|reference| reference.value == "not-target"));
        assert_eq!(
            result.properties.into_iter().collect::<Vec<_>>(),
            ["related"]
        );
    }
    #[test]
    fn code_comment_delimiters_do_not_hide_following_references() {
        let result = parse("`%%`\n\n```text\n%%\n```\n\n[[visible]] #🚀 #cafe\u{0301}");
        assert_eq!(
            result.references,
            [Reference {
                value: "visible".into(),
                wiki: true
            }]
        );
        assert!(result.tags.contains("🚀"));
        assert!(result.tags.contains("cafe\u{0301}"));
    }
    #[test]
    fn an_unclosed_frontmatter_delimiter_remains_markdown() {
        let result = parse("---\n# Title\n[real](real.md)");
        assert_eq!(result.title.as_deref(), Some("Title"));
        assert_eq!(
            result.references,
            [Reference {
                value: "real.md".into(),
                wiki: false
            }]
        );
    }
    #[test]
    fn delimiters_inside_link_destinations_do_not_mask_following_markdown() {
        let result = parse("[[100%%]]\n[real](real.md)");
        assert_eq!(result.references.len(), 2);
        assert_eq!(result.references[1].value, "real.md");
    }
    #[test]
    fn reports_per_document_projection_truncation() {
        let result = parse(
            &(0..8200)
                .map(|index| format!("#tag{index} "))
                .collect::<String>(),
        );
        assert_eq!(result.tags.len(), MAX_VALUES);
        assert!(!result.warnings.is_empty());
        let result = parse(&format!("[[{}]]", "a".repeat(1025)));
        assert!(result.references.is_empty());
        assert!(!result.warnings.is_empty());
    }
}

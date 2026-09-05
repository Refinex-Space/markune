use crate::graph_parse::Reference;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) struct Lookup {
    paths: BTreeSet<String>,
    folded: BTreeMap<String, BTreeSet<String>>,
    names: BTreeMap<String, BTreeSet<String>>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Resolution {
    Resolved(String),
    Unresolved { key: String, label: String },
    Ignore,
}

impl Lookup {
    pub(crate) fn new(paths: impl Iterator<Item = String>) -> Self {
        let mut lookup = Self {
            paths: BTreeSet::new(),
            folded: BTreeMap::new(),
            names: BTreeMap::new(),
        };
        for path in paths {
            lookup
                .folded
                .entry(path.to_lowercase())
                .or_default()
                .insert(path.clone());
            let name = path.rsplit('/').next().unwrap_or(&path);
            for name in [name, document_stem(name)] {
                lookup
                    .names
                    .entry(name.to_lowercase())
                    .or_default()
                    .insert(path.clone());
            }
            lookup.paths.insert(path);
        }
        lookup
    }

    pub(crate) fn resolve(&self, source: &str, reference: &Reference) -> Resolution {
        let value = reference.value.trim();
        let editor_reference =
            !reference.wiki && value.to_ascii_lowercase().starts_with("markweave://doc/");
        if value.starts_with("//") || (has_scheme(value) && !editor_reference) {
            return Resolution::Ignore;
        }
        if editor_reference {
            let Some(decoded) = percent_decode(&value["markweave://doc/".len()..]) else {
                return Resolution::Ignore;
            };
            let target = decoded.split('#').next().unwrap_or_default();
            // Internal editor links use the same document-relative path contract. author: refinex
            return self.resolve_target(source, target, false);
        }
        let target = value
            .split(if reference.wiki {
                &['#'][..]
            } else {
                &['#', '?'][..]
            })
            .next()
            .unwrap_or_default();
        let target = if reference.wiki {
            target.to_string()
        } else {
            let Some(decoded) = percent_decode(target) else {
                return Resolution::Ignore;
            };
            decoded
        };
        self.resolve_target(source, &target, reference.wiki)
    }

    fn resolve_target(&self, source: &str, target: &str, wiki: bool) -> Resolution {
        if target.is_empty()
            || target.ends_with('/')
            || target.contains(['\0', '\\'])
            || is_attachment(&target)
        {
            return Resolution::Ignore;
        }
        let parent = source
            .rsplit_once('/')
            .map(|(parent, _)| parent)
            .unwrap_or_default();
        let explicit_relative = target.starts_with("./") || target.starts_with("../");
        let qualified = target.contains('/');
        let rooted = target.starts_with('/') || (wiki && qualified && !explicit_relative);
        let Some(path) = normalize_path(if rooted {
            target.trim_start_matches('/').to_string()
        } else {
            format!("{parent}/{target}")
        }) else {
            return Resolution::Ignore;
        };
        if path.is_empty() {
            return Resolution::Ignore;
        }
        let candidates = self.candidates(&path, wiki);
        if candidates.len() == 1 {
            return Resolution::Resolved(candidates.into_iter().next().unwrap());
        }
        if candidates.is_empty() && wiki && !qualified {
            if let Some(paths) = self
                .names
                .get(&target.to_lowercase())
                .filter(|paths| paths.len() == 1)
            {
                return Resolution::Resolved(paths.iter().next().unwrap().clone());
            }
        }
        let key = if wiki && !qualified {
            format!("wiki:{}", target.to_lowercase())
        } else {
            format!("path:{path}")
        };
        Resolution::Unresolved {
            key,
            label: target.to_string(),
        }
    }

    fn candidates(&self, path: &str, wiki: bool) -> BTreeSet<String> {
        if self.paths.contains(path) {
            return BTreeSet::from([path.to_string()]);
        }
        let paths = if document_stem(path) != path {
            vec![path.to_string()]
        } else {
            vec![format!("{path}.md"), format!("{path}.mdx")]
        };
        let mut matches = paths
            .iter()
            .filter(|path| self.paths.contains(*path))
            .cloned()
            .collect::<BTreeSet<_>>();
        if matches.is_empty() && wiki {
            for path in paths {
                if let Some(values) = self.folded.get(&path.to_lowercase()) {
                    matches.extend(values.iter().cloned());
                }
            }
        }
        matches
    }
}

fn document_stem(path: &str) -> &str {
    if path.to_ascii_lowercase().ends_with(".mdx") {
        &path[..path.len() - 4]
    } else if path.to_ascii_lowercase().ends_with(".md") {
        &path[..path.len() - 3]
    } else {
        path
    }
}

fn has_scheme(value: &str) -> bool {
    value.split_once(':').is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme.starts_with(|character: char| character.is_ascii_alphabetic())
            && scheme.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
            })
    })
}

fn is_attachment(value: &str) -> bool {
    let extension = value
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "svg"
            | "avif"
            | "bmp"
            | "ico"
            | "pdf"
            | "mp3"
            | "mp4"
            | "mov"
            | "wav"
            | "ogg"
            | "webm"
            | "zip"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "ppt"
            | "pptx"
            | "csv"
            | "json"
            | "html"
            | "txt"
    )
}

fn normalize_path(value: String) -> Option<String> {
    let mut parts = Vec::new();
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

fn percent_decode(value: &str) -> Option<String> {
    let mut bytes = value.bytes();
    let mut decoded = Vec::with_capacity(value.len());
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let high = (bytes.next()? as char).to_digit(16)? as u8;
            let low = (bytes.next()? as char).to_digit(16)? as u8;
            decoded.push(high * 16 + low);
        } else {
            decoded.push(byte);
        }
    }
    String::from_utf8(decoded).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn lookup() -> Lookup {
        Lookup::new(
            [
                "root.md",
                "nested/local.md",
                "elsewhere/wiki.md",
                "v1.2.md",
                "中文 笔记.md",
                "other/dup.md",
                "another/dup.md",
                "100%.md",
                "nested/target.md",
                "target.md",
            ]
            .into_iter()
            .map(str::to_string),
        )
    }
    fn reference(value: &str, wiki: bool) -> Reference {
        Reference {
            value: value.into(),
            wiki,
        }
    }
    #[test]
    fn strict_paths_never_fall_back_to_unrelated_documents() {
        let lookup = lookup();
        assert!(matches!(
            lookup.resolve("nested/source.md", &reference("root.md", false)),
            Resolution::Unresolved { .. }
        ));
        assert!(matches!(
            lookup.resolve("source.md", &reference("missing/path/wiki", true)),
            Resolution::Unresolved { .. }
        ));
        assert_eq!(
            lookup.resolve("nested/source.md", &reference("../../../root.md", false)),
            Resolution::Ignore
        );
        assert_eq!(
            lookup.resolve("nested/source.md", &reference("../root.md", false)),
            Resolution::Resolved("root.md".into())
        );
        assert_eq!(
            lookup.resolve("nested/source.md", &reference("target", true)),
            Resolution::Resolved("nested/target.md".into())
        );
        assert_eq!(
            lookup.resolve("nested/source.md", &reference("elsewhere/wiki", true)),
            Resolution::Resolved("elsewhere/wiki.md".into())
        );
        assert!(matches!(
            lookup.resolve("source.md", &reference("dup", true)),
            Resolution::Unresolved { .. }
        ));
    }
    #[test]
    fn handles_extensions_encoding_anchors_and_unique_wiki_names() {
        let lookup = lookup();
        for (value, wiki, expected) in [
            ("v1.2", true, "v1.2.md"),
            (
                "%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0.md#h",
                false,
                "中文 笔记.md",
            ),
            ("100%.md", true, "100%.md"),
            ("wiki", true, "elsewhere/wiki.md"),
            ("root", false, "root.md"),
        ] {
            assert_eq!(
                lookup.resolve("source.md", &reference(value, wiki)),
                Resolution::Resolved(expected.into()),
                "{value}"
            );
        }
        for value in [
            "https://example.com/root.md",
            "file:///root.md",
            "mailto:user@example.com",
            "#heading",
            "bad%FF.md",
            "image.png",
        ] {
            assert_eq!(
                lookup.resolve("source.md", &reference(value, false)),
                Resolution::Ignore,
                "{value}"
            );
        }
    }
    #[test]
    fn attachment_and_directory_links_do_not_fall_back_to_markdown_names() {
        let lookup = Lookup::new(
            ["image.png.md", "folder.md"]
                .into_iter()
                .map(str::to_string),
        );
        for (value, wiki) in [
            ("image.png", false),
            ("image.png", true),
            ("folder/", false),
        ] {
            assert_eq!(
                lookup.resolve("source.md", &reference(value, wiki)),
                Resolution::Ignore
            );
        }
    }
    #[test]
    fn resolves_the_internal_links_persisted_by_the_editor() {
        let lookup = lookup();
        assert_eq!(
            lookup.resolve(
                "nested/source.md",
                &reference("markweave://doc/target", false)
            ),
            Resolution::Resolved("nested/target.md".into())
        );
        assert_eq!(
            lookup.resolve(
                "source.md",
                &reference(
                    "markweave://doc/%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0.md%23section",
                    false
                )
            ),
            Resolution::Resolved("中文 笔记.md".into())
        );
        assert_eq!(
            lookup.resolve("source.md", &reference("markweave://doc/100%25.md", false)),
            Resolution::Resolved("100%.md".into())
        );
    }
}

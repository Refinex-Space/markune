use crate::graph_parse::Reference;
use crate::graph_resolve::{Lookup, Resolution};
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag};
use std::collections::BTreeMap;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::{fs, sync::Mutex};

static MOVE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn recover_pending_moves(root: &Path) -> Result<(), String> {
    let _guard = MOVE_LOCK.lock().map_err(|_| "文档移动状态不可用")?;
    crate::document_move_journal::recover(root)
}

pub(crate) struct FileChange {
    pub path: PathBuf,
    pub old: String,
    pub new: String,
}

pub(crate) fn collect_documents(root: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(
        directory: &Path,
        depth: usize,
        entries: &mut usize,
        documents: &mut Vec<PathBuf>,
    ) -> Result<(), String> {
        if depth > 64 {
            return Err("目录层级超过安全扫描上限".into());
        }
        for entry in fs::read_dir(directory).map_err(|_| "无法扫描文档引用")? {
            let entry = entry.map_err(|_| "无法读取文档目录条目")?;
            *entries += 1;
            if *entries > 200_000 {
                return Err("目录条目超过安全扫描上限".into());
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || crate::workspace::should_skip_entry(&name) {
                continue;
            }
            let kind = entry.file_type().map_err(|_| "无法验证文档文件类型")?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                visit(&entry.path(), depth + 1, entries, documents)?;
            } else if kind.is_file() && crate::workspace::is_markdown_document_file(&entry.path()) {
                documents.push(entry.path());
                if documents.len() > 50_000 {
                    return Err("文档数量超过安全扫描上限".into());
                }
            }
        }
        Ok(())
    }
    let mut documents = Vec::new();
    visit(root, 0, &mut 0, &mut documents)?;
    documents.sort();
    Ok(documents)
}

pub(crate) fn move_documents(
    root: &Path,
    source: &Path,
    destination: &Path,
    title: Option<&str>,
    metadata: Option<FileChange>,
) -> Result<(), String> {
    let _move_guard = MOVE_LOCK.lock().map_err(|_| "文档移动状态不可用")?;
    crate::document_move_journal::recover(root)?;
    if source == root || !source.starts_with(root) || !destination.starts_with(root) {
        return Err("移动路径超出工作区".into());
    }
    if source != destination
        && fs::symlink_metadata(destination).is_ok()
        && !crate::document_assets::is_case_only_rename(source, destination)
    {
        return Err("目标位置已存在同名节点".into());
    }
    if source == destination && title.is_none() {
        return apply_changes(&metadata.into_iter().collect::<Vec<_>>(), || Ok(()));
    }
    let paths = collect_documents(root)?;
    let references = MoveReferences::new(root, &paths, source, destination);
    let mut lock_paths = paths.clone();
    if let Some(metadata) = &metadata {
        lock_paths.push(metadata.path.clone());
    }
    lock_paths.sort();
    lock_paths.dedup();
    let locks = lock_paths
        .iter()
        .map(|path| crate::workspace::document_save_lock(path))
        .collect::<Vec<_>>();
    let _guards = locks
        .iter()
        .map(|lock| lock.lock().map_err(|_| "文档保存状态不可用"))
        .collect::<Result<Vec<_>, _>>()?;
    let mut changes = Vec::new();
    let mut spent = 0u64;
    for path in &paths {
        let canonical = path.canonicalize().map_err(|_| "文档在扫描期间已改变")?;
        if canonical != *path || !canonical.starts_with(root) {
            return Err("文档路径在扫描期间已改变".into());
        }
        let limit = (128 * 1024 * 1024u64)
            .saturating_sub(spent)
            .min(4 * 1024 * 1024);
        let old = crate::graph::read_regular_document(path, limit, &mut spent)?;
        let mut new = references.rewrite(&old, path)?;
        if let Some(next) = references.moved.get(&relative(root, path)) {
            new = crate::document_assets::rebase_document_assets(
                &new,
                path,
                &root.join(next),
                source,
                destination,
            )?;
        }
        if path == source {
            if let Some(title) = title {
                new = crate::workspace::markdown_document_with_title(&new, title)?;
            }
        }
        if old != new {
            changes.push(FileChange {
                path: path.clone(),
                old,
                new,
            });
        }
    }
    let changed_paths = changes
        .iter()
        .map(|change| &change.path)
        .collect::<std::collections::BTreeSet<_>>();
    let affected = paths
        .iter()
        .filter(|path| path.starts_with(source) || changed_paths.contains(path))
        .map(PathBuf::as_path)
        .collect::<Vec<_>>();
    crate::workspace::validate_documents_writable(root, &affected)?;
    if let Some(metadata) = metadata {
        changes.push(metadata);
    }
    if collect_documents(root)? != paths {
        return Err("工作区文档列表在移动期间已改变，请重试".into());
    }
    let journal =
        crate::document_move_journal::MoveJournal::prepare(root, source, destination, &changes)?;
    let result = apply_changes(&changes, || {
        if source != destination {
            crate::document_assets::move_path_no_replace(source, destination)
                .map_err(|_| "无法安全移动：目标可能已存在或文件系统不支持".to_string())?;
        }
        Ok(())
    });
    if result.is_ok()
        || changes
            .iter()
            .all(|change| fs::read_to_string(&change.path).is_ok_and(|value| value == change.old))
    {
        // A cleanup failure must not report a completed rename as a failed rename. author: refinex
        let _ = journal.discard();
    }
    crate::workspace_index::invalidate(source);
    crate::workspace_index::invalidate(destination);
    result
}

fn apply_changes(
    changes: &[FileChange],
    finish: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    for change in changes {
        if fs::symlink_metadata(&change.path).map_or(true, |metadata| {
            !metadata.is_file() || metadata.file_type().is_symlink()
        }) || !fs::read_to_string(&change.path).is_ok_and(|value| value == change.old)
        {
            return Err("文档在移动期间已改变，请重试".into());
        }
    }
    let mut written = 0;
    let result = (|| {
        for change in changes {
            crate::workspace::write_text_atomic_guarded(&change.path, &change.new, || {
                if !fs::read_to_string(&change.path).is_ok_and(|value| value == change.old) {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::WouldBlock,
                        "document changed",
                    ));
                }
                Ok(())
            })
            .map_err(|_| "文档在移动期间已改变或无法写入，请重试")?;
            written += 1;
        }
        for change in changes {
            if !fs::read_to_string(&change.path).is_ok_and(|value| value == change.new) {
                return Err("文档在移动期间已改变，请重试".into());
            }
        }
        finish()
    })();
    if result.is_err() {
        let mut incomplete = false;
        for change in changes[..written].iter().rev() {
            if fs::read_to_string(&change.path).is_ok_and(|value| value == change.old) {
                continue;
            }
            if !fs::read_to_string(&change.path).is_ok_and(|value| value == change.new) {
                incomplete = true;
                continue;
            }
            if crate::workspace::write_text_atomic_guarded(&change.path, &change.old, || {
                if !fs::read_to_string(&change.path).is_ok_and(|value| value == change.new) {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::WouldBlock,
                        "document changed",
                    ));
                }
                Ok(())
            })
            .is_err()
            {
                incomplete = true;
            }
        }
        if incomplete {
            return Err(
                "移动未完成，部分文档已被外部修改，未覆盖这些内容；请检查引用后重试".into(),
            );
        }
    }
    result
}

#[derive(Debug)]
pub(crate) struct LocatedReference {
    pub reference: Reference,
    pub range: Option<Range<usize>>,
    pub span: Range<usize>,
    pub occurrence: bool,
    pub html: bool,
}

pub(crate) fn body_references(body: &str) -> Result<Vec<LocatedReference>, String> {
    let masked = crate::graph_parse::mask_obsidian_comments(body);
    body_references_masked(&masked)
}

pub(crate) fn body_references_masked(body: &str) -> Result<Vec<LocatedReference>, String> {
    let parser = Parser::new_ext(
        body,
        Options::ENABLE_WIKILINKS | Options::ENABLE_TABLES | Options::ENABLE_MATH,
    );
    let mut references = Vec::new();
    let mut code_depth = 0usize;
    for (_, definition) in parser.reference_definitions().iter() {
        if references.len() >= 100_000 {
            return Err("单篇文档引用超过安全处理上限".into());
        }
        if let Some(range) =
            crate::document_assets::destination_range(body, definition.span.clone(), true)
        {
            references.push(LocatedReference {
                reference: Reference {
                    value: definition.dest.to_string(),
                    wiki: false,
                },
                range: Some(range),
                span: definition.span.clone(),
                occurrence: false,
                html: false,
            });
        }
    }
    for (event, span) in parser.into_offset_iter() {
        if code_depth > 0 && !matches!(&event, Event::Html(_) | Event::InlineHtml(_)) {
            continue;
        }
        if references.len() >= 100_000 {
            return Err("单篇文档引用超过安全处理上限".into());
        }
        match event {
            Event::Start(
                Tag::Link {
                    dest_url,
                    link_type,
                    ..
                }
                | Tag::Image {
                    dest_url,
                    link_type,
                    ..
                },
            ) => {
                let wiki = matches!(link_type, LinkType::WikiLink { .. });
                if body[span.clone()].starts_with('!') && !wiki {
                    continue;
                }
                if matches!(link_type, LinkType::Autolink | LinkType::Email) {
                    continue;
                }
                let range = if wiki {
                    let text = &body[span.clone()];
                    text.find("[[").and_then(|start| {
                        let start = span.start + start + 2;
                        let end = body[start..span.end]
                            .find('|')
                            .or_else(|| body[start..span.end].find("]]"))?
                            + start;
                        let value = &body[start..end];
                        Some(
                            start + value.len() - value.trim_start().len()
                                ..end - (value.len() - value.trim_end().len()),
                        )
                    })
                } else if matches!(link_type, LinkType::Inline) {
                    crate::document_assets::destination_range(body, span.clone(), false)
                } else {
                    None
                };
                references.push(LocatedReference {
                    reference: Reference {
                        value: dest_url.to_string(),
                        wiki,
                    },
                    range,
                    span: span.clone(),
                    occurrence: true,
                    html: false,
                });
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                let mut reader = quick_xml::Reader::from_str(&html);
                reader.config_mut().check_end_names = false;
                reader.config_mut().allow_unmatched_ends = true;
                loop {
                    use quick_xml::events::Event as XmlEvent;
                    let event = reader.read_event();
                    let empty = matches!(&event, Ok(XmlEvent::Empty(_)));
                    match event {
                        Ok(XmlEvent::Start(element) | XmlEvent::Empty(element)) => {
                            if [b"pre".as_slice(), b"code", b"script", b"style"]
                                .iter()
                                .any(|name| element.name().as_ref().eq_ignore_ascii_case(name))
                            {
                                if !empty {
                                    code_depth += 1;
                                }
                            }
                            if code_depth > 0 || !element.name().as_ref().eq_ignore_ascii_case(b"a")
                            {
                                continue;
                            }
                            if element
                                .attributes()
                                .with_checks(false)
                                .flatten()
                                .any(|attribute| {
                                    attribute
                                        .key
                                        .as_ref()
                                        .eq_ignore_ascii_case(b"data-markweave-attachment")
                                })
                            {
                                continue;
                            }
                            for attribute in element.attributes().with_checks(false).flatten() {
                                if !attribute.key.as_ref().eq_ignore_ascii_case(b"href") {
                                    continue;
                                }
                                let address = attribute.value.as_ptr() as usize;
                                let base = html.as_ptr() as usize;
                                if address < base {
                                    continue;
                                }
                                let start = address - base;
                                if start + attribute.value.len() > html.len() {
                                    continue;
                                }
                                if let Ok(value) =
                                    attribute.decode_and_unescape_value(reader.decoder())
                                {
                                    references.push(LocatedReference {
                                        reference: Reference {
                                            value: value.into_owned(),
                                            wiki: false,
                                        },
                                        range: Some(
                                            span.start + start
                                                ..span.start + start + attribute.value.len(),
                                        ),
                                        span: span.clone(),
                                        occurrence: true,
                                        html: true,
                                    });
                                }
                            }
                        }
                        Ok(XmlEvent::End(element)) => {
                            if [b"pre".as_slice(), b"code", b"script", b"style"]
                                .iter()
                                .any(|name| element.name().as_ref().eq_ignore_ascii_case(name))
                            {
                                code_depth = code_depth.saturating_sub(1);
                            }
                        }
                        Ok(XmlEvent::Eof) | Err(_) => break,
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    Ok(references)
}

pub(crate) struct MoveReferences {
    pub root: PathBuf,
    pub before: Lookup,
    pub after: Lookup,
    pub moved: BTreeMap<String, String>,
    copied_source: Option<(String, String)>,
}

impl MoveReferences {
    pub(crate) fn new(root: &Path, paths: &[PathBuf], source: &Path, destination: &Path) -> Self {
        let moved = paths
            .iter()
            .filter_map(|path| {
                let suffix = path.strip_prefix(source).ok()?;
                let target = if suffix.as_os_str().is_empty() {
                    destination.to_path_buf()
                } else {
                    destination.join(suffix)
                };
                Some((relative(root, path), relative(root, &target)))
            })
            .collect::<BTreeMap<_, _>>();
        let before = Lookup::new(paths.iter().map(|path| relative(root, path)));
        let after = Lookup::new(paths.iter().map(|path| {
            let old = relative(root, path);
            moved.get(&old).cloned().unwrap_or(old)
        }));
        Self {
            root: root.to_path_buf(),
            before,
            after,
            moved,
            copied_source: None,
        }
    }

    pub(crate) fn for_copy(
        root: &Path,
        paths: &[PathBuf],
        source: &Path,
        destination: &Path,
    ) -> Self {
        let source = relative(root, source);
        let destination = relative(root, destination);
        Self {
            root: root.to_path_buf(),
            before: Lookup::new(paths.iter().map(|path| relative(root, path))),
            after: Lookup::new(
                paths
                    .iter()
                    .map(|path| relative(root, path))
                    .chain(std::iter::once(destination.clone())),
            ),
            moved: BTreeMap::new(),
            copied_source: Some((source, destination)),
        }
    }

    fn replacement(
        &self,
        source: &str,
        next_source: &str,
        reference: &Reference,
    ) -> Option<String> {
        let Resolution::Resolved(target) = self.before.resolve(source, reference) else {
            return None;
        };
        let next_target = self.moved.get(&target).unwrap_or(&target);
        let spelling_changed =
            target != *next_target && target.to_lowercase() == next_target.to_lowercase();
        if !spelling_changed
            && self.after.resolve(next_source, reference)
                == Resolution::Resolved(next_target.clone())
        {
            return None;
        }
        let editor_prefix = "markweave://doc/";
        let editor = reference
            .value
            .to_ascii_lowercase()
            .starts_with(editor_prefix);
        let value = if editor {
            decode(&reference.value[editor_prefix.len()..])?
        } else {
            reference.value.clone()
        };
        let split = value
            .find(if reference.wiki || editor {
                &['#'][..]
            } else {
                &['#', '?'][..]
            })
            .unwrap_or(value.len());
        let suffix = &value[split..];
        let path = if reference.wiki {
            let mut path = next_target.to_string();
            if !value[..split].to_ascii_lowercase().ends_with(".md")
                && !value[..split].to_ascii_lowercase().ends_with(".mdx")
            {
                path.truncate(path.rfind('.').unwrap_or(path.len()));
            }
            if !path.contains('/') {
                path.insert(0, '/');
            }
            path
        } else if value.starts_with('/') {
            format!("/{}", encode(next_target, true))
        } else {
            crate::document_assets::path_reference(
                &self.root.join(next_source),
                &self.root.join(next_target),
                true,
                value.starts_with("./"),
            )
            .ok()?
        };
        if editor {
            let path = decode(&path)?;
            Some(format!(
                "{editor_prefix}{}",
                encode(&format!("{path}{suffix}"), false)
            ))
        } else {
            Some(format!("{path}{suffix}"))
        }
    }

    fn rewrite_body(&self, body: &str, source: &str, next_source: &str) -> Result<String, String> {
        let mut edits = BTreeMap::new();
        for located in body_references(body)? {
            let Some(range) = located.range else {
                continue;
            };
            let Some(mut replacement) = self.replacement(source, next_source, &located.reference)
            else {
                continue;
            };
            if located.html {
                replacement = replacement
                    .replace('&', "&amp;")
                    .replace('"', "&quot;")
                    .replace('\'', "&#39;");
            }
            edits.insert(range.start, (range.end, replacement));
        }
        let mut result = body.to_string();
        for (start, (end, value)) in edits.into_iter().rev() {
            result.replace_range(start..end, &value);
        }
        Ok(result)
    }

    pub(crate) fn rewrite(&self, raw: &str, source_path: &Path) -> Result<String, String> {
        let source = relative(&self.root, source_path);
        let next_source = self
            .moved
            .get(&source)
            .or_else(|| {
                self.copied_source
                    .as_ref()
                    .filter(|(old, _)| old == &source)
                    .map(|(_, new)| new)
            })
            .unwrap_or(&source);
        let Some(frontmatter) = crate::document_frontmatter::split(raw) else {
            return self.rewrite_body(raw, &source, next_source);
        };
        let fields = match crate::document_frontmatter::text_scalars(frontmatter.block) {
            Ok(fields) => fields,
            Err(error)
                if frontmatter.block.contains("[[")
                    || frontmatter.block.contains("](")
                    || frontmatter.block.contains("href=") =>
            {
                return Err(error)
            }
            Err(_) => Vec::new(),
        };
        let mut metadata = frontmatter.block.to_string();
        for field in fields.into_iter().rev() {
            if !crate::document_frontmatter::is_reference_text(&field) {
                continue;
            }
            let value = self.rewrite_body(&field.value, &source, next_source)?;
            if value == field.value {
                continue;
            }
            let mut encoded = if frontmatter.block[field.range.clone()].starts_with('\'') {
                format!("'{}'", value.replace('\'', "''"))
            } else {
                crate::document_frontmatter::encode_string(&value)
            };
            if field.block {
                if !field.comment.is_empty() {
                    encoded.push(' ');
                    encoded.push_str(&field.comment);
                }
                encoded.push_str(if raw.contains("\r\n") { "\r\n" } else { "\n" });
            }
            metadata.replace_range(field.range, &encoded);
        }
        let body = self.rewrite_body(&raw[frontmatter.body_start..], &source, next_source)?;
        Ok(format!(
            "{}{}{}{}",
            &raw[..frontmatter.range.start],
            metadata,
            &raw[frontmatter.range.end..frontmatter.body_start],
            body
        ))
    }
}

pub(crate) fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn encode(value: &str, slash: bool) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) || slash && byte == b'/' {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}
fn decode(value: &str) -> Option<String> {
    let mut input = value.bytes();
    let mut bytes = Vec::new();
    while let Some(byte) = input.next() {
        if byte == b'%' {
            bytes.push(
                ((input.next()? as char).to_digit(16)? * 16
                    + (input.next()? as char).to_digit(16)?) as u8,
            );
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn case_only_renames_preserve_incoming_links_and_change_the_directory_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let source = root.join("Case.md");
        let destination = root.join("case.md");
        fs::write(&source, "# Case").unwrap();
        fs::write(root.join("incoming.md"), "[Case](Case.md) [[Case]]").unwrap();
        move_documents(&root, &source, &destination, Some("case"), None).unwrap();
        assert!(crate::document_assets::has_exact_entry(&destination));
        assert!(!crate::document_assets::has_exact_entry(&source));
        assert_eq!(
            fs::read_to_string(root.join("incoming.md")).unwrap(),
            "[Case](case.md) [[/case]]"
        );
        assert_eq!(fs::read_to_string(&destination).unwrap(), "# case");
    }
    #[test]
    fn ignores_links_in_html_code_and_attachment_cards() {
        let raw = "<code>[example](hidden.md)</code> [real](real.md)\n\n<pre>\n<a href=\"hidden.md\">hidden</a>\n</pre>\n<a data-markweave-attachment=\"true\" href=\"file.md\">file</a>";
        let refs = body_references(raw)
            .unwrap()
            .into_iter()
            .filter(|reference| reference.occurrence)
            .map(|reference| reference.reference.value)
            .collect::<Vec<_>>();
        assert_eq!(refs, vec!["real.md"]);
    }
    #[test]
    fn moves_real_documents_and_rewrites_other_notes_without_touching_code() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        fs::create_dir(root.join("folder")).unwrap();
        fs::write(root.join("a.md"), "[B](b.mdx#h) [[b]]\n`[B](b.mdx)`").unwrap();
        fs::write(
            root.join("b.mdx"),
            "---\ntitle: 'B' # retain\ntags:\n - one\n---\n# B\n[A](a.md)",
        )
        .unwrap();
        move_documents(
            &root,
            &root.join("b.mdx"),
            &root.join("folder/c.mdx"),
            Some("C"),
            None,
        )
        .unwrap();
        let incoming = fs::read_to_string(root.join("a.md")).unwrap();
        assert_eq!(incoming, "[B](folder/c.mdx#h) [[folder/c]]\n`[B](b.mdx)`");
        let moved = fs::read_to_string(root.join("folder/c.mdx")).unwrap();
        assert!(moved.contains("title: C # retain\ntags:\n - one"));
        assert!(moved.contains("[A](../a.md)"));
        assert!(!root.join("b.mdx").exists());
    }
    #[test]
    fn rolls_back_all_written_references_if_final_move_fails() {
        let directory = tempfile::tempdir().unwrap();
        let a = directory.path().join("a.md");
        let b = directory.path().join("b.md");
        fs::write(&a, "old-a").unwrap();
        fs::write(&b, "old-b").unwrap();
        let changes = [
            FileChange {
                path: a.clone(),
                old: "old-a".into(),
                new: "new-a".into(),
            },
            FileChange {
                path: b.clone(),
                old: "old-b".into(),
                new: "new-b".into(),
            },
        ];
        assert!(apply_changes(&changes, || Err("move failed".into())).is_err());
        assert_eq!(fs::read_to_string(&a).unwrap(), "old-a");
        assert_eq!(fs::read_to_string(&b).unwrap(), "old-b");
        let error = apply_changes(&changes, || {
            fs::write(&a, "external edit").unwrap();
            Err("move failed".into())
        })
        .unwrap_err();
        assert!(error.contains("外部修改"));
        assert_eq!(fs::read_to_string(&a).unwrap(), "external edit");
        assert_eq!(fs::read_to_string(&b).unwrap(), "old-b");
    }
    #[test]
    fn refuses_to_overwrite_a_new_destination_or_a_changed_baseline() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        fs::write(root.join("a.md"), "[[b]]").unwrap();
        fs::write(root.join("b.md"), "B").unwrap();
        fs::write(root.join("c.md"), "keep").unwrap();
        assert!(move_documents(&root, &root.join("b.md"), &root.join("c.md"), None, None).is_err());
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "[[b]]");
        assert_eq!(fs::read_to_string(root.join("c.md")).unwrap(), "keep");
        assert!(apply_changes(
            &[FileChange {
                path: root.join("a.md"),
                old: "old".into(),
                new: "replace".into()
            }],
            || Ok(())
        )
        .is_err());
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "[[b]]");
    }
    #[test]
    fn repairs_incoming_outgoing_wiki_markdown_definitions_and_metadata_links() {
        let root = Path::new("/vault");
        let paths = ["a.md", "folder/b.md", "folder/c.md"].map(|path| root.join(path));
        let context = MoveReferences::new(root, &paths, &root.join("folder"), &root.join("moved"));
        let raw = "---\nrelated: '[[folder/b#head|label]]' # retain\ncustom: {owner: team}\n---\n[a](folder/b.md#head) [[folder/b|别名]] ![[folder/b]] [ref][id]\n\n[id]: folder/c.md \"title\"\n\n`[[folder/b]]`\n%% [[folder/b]] %%\n";
        let next = context.rewrite(raw, &root.join("a.md")).unwrap();
        for expected in [
            "'[[moved/b#head|label]]' # retain",
            "(moved/b.md#head)",
            "[[moved/b|别名]]",
            "![[moved/b]]",
            "[id]: moved/c.md \"title\"",
            "`[[folder/b]]`",
            "%% [[folder/b]] %%",
            "custom: {owner: team}",
        ] {
            assert!(next.contains(expected), "missing {expected}: {next}");
        }
        assert_eq!(
            context
                .rewrite("[A](../a.md) [[c]]", &root.join("folder/b.md"))
                .unwrap(),
            "[A](../a.md) [[c]]"
        );
    }
    #[test]
    fn preserves_identity_when_a_move_changes_a_bare_wiki_resolution() {
        let root = Path::new("/vault");
        let paths = ["a.md", "b.md", "folder/b.md"].map(|path| root.join(path));
        let context =
            MoveReferences::new(root, &paths, &root.join("a.md"), &root.join("folder/a.md"));
        assert_eq!(
            context
                .rewrite(
                    "[[b]] [b](b.md) [b](markweave://doc/b.md%23head)",
                    &root.join("a.md")
                )
                .unwrap(),
            "[[/b]] [b](../b.md) [b](markweave://doc/..%2Fb.md%23head)"
        );
    }
}

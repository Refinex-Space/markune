use crate::graph_parse::Projection;
use crate::graph_resolve::{Lookup, Resolution};
use pulldown_cmark::{Event, Options, Parser};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Instant, UNIX_EPOCH};

static CACHE: Mutex<Option<WorkspaceIndex>> = Mutex::new(None);
static PAGES: Mutex<VecDeque<(PathBuf, PageSet)>> = Mutex::new(VecDeque::new());
static REVISION: AtomicU64 = AtomicU64::new(1);
const MAX_CONTENT: usize = 32 * 1024 * 1024;
const MAX_MODEL: usize = 128 * 1024 * 1024;
static DIRTY: Mutex<BTreeSet<PathBuf>> = Mutex::new(BTreeSet::new());
static INVALIDATE_ALL: AtomicBool = AtomicBool::new(false);
const PAGE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexedLink {
    pub target_path: Option<String>,
    pub unresolved: Option<String>,
    pub href: String,
    pub line: usize,
    pub context: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedTask {
    pub offset: usize,
    pub line: usize,
    pub checked: bool,
    pub text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedDocument {
    pub relative_path: String,
    pub name: String,
    pub title: String,
    #[serde(serialize_with = "serialize_text")]
    pub content: Arc<str>,
    pub fingerprint: String,
    pub modified_at: u128,
    pub properties: serde_json::Value,
    pub tags: Vec<String>,
    pub links: Vec<IndexedLink>,
    pub tasks: Vec<IndexedTask>,
    pub resources: Vec<String>,
    pub errors: Vec<String>,
    #[serde(skip)]
    pub projection: Arc<Projection>,
    #[serde(skip)]
    sources: Arc<Vec<(crate::graph_parse::Reference, usize, String)>>,
}

fn serialize_text<S: serde::Serializer>(text: &Arc<str>, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(text)
}

#[derive(Clone)]
struct Entry {
    stamp: String,
    document: Arc<IndexedDocument>,
    changed_at: u64,
    read_failed: bool,
    checked_at: Instant,
}
#[derive(Clone)]
struct PageSet {
    revision: u64,
    since: Option<u64>,
    reset: bool,
    documents: Vec<Arc<IndexedDocument>>,
    removed: Vec<String>,
    warnings: Vec<String>,
}
struct WorkspaceIndex {
    root: PathBuf,
    epoch: u64,
    revision: u64,
    entries: BTreeMap<String, Entry>,
    removed: VecDeque<(u64, String)>,
    dirty: BTreeSet<PathBuf>,
    last_scan: Instant,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndexPage {
    pub revision: u64,
    pub reset: bool,
    pub documents: Vec<IndexedDocument>,
    pub removed: Vec<String>,
    pub warnings: Vec<String>,
    pub next_cursor: Option<usize>,
    pub total: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMention {
    pub relative_path: String,
    pub line: usize,
    pub context: String,
}

#[tauri::command]
pub async fn find_workspace_mentions(
    root_path: String,
    target_path: String,
    candidate_paths: Vec<String>,
) -> Result<Vec<WorkspaceMention>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if candidate_paths.len() > 64 {
            return Err("单次最多检查 64 篇候选笔记".into());
        }
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let (target, candidates) = with_index(&root, false, &[], |index| {
            let target = index
                .entries
                .get(&target_path)
                .map(|entry| Arc::clone(&entry.document))
                .ok_or("目标笔记不在索引中")?;
            let candidates = candidate_paths
                .iter()
                .filter(|path| **path != target_path)
                .filter_map(|path| {
                    index
                        .entries
                        .get(path)
                        .map(|entry| Arc::clone(&entry.document))
                })
                .collect::<Vec<_>>();
            Ok((target, candidates))
        })?;
        let mut names = BTreeSet::from([Path::new(&target.name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()]);
        if let Some(aliases) = target
            .properties
            .get("aliases")
            .and_then(serde_json::Value::as_array)
        {
            for alias in aliases
                .iter()
                .filter_map(serde_json::Value::as_str)
                .take(15)
            {
                names.insert(alias.to_lowercase());
            }
        }
        names.retain(|name| name.chars().count() >= 2 && name.len() <= 1024);
        let mut mentions = Vec::new();
        let mut spent = 0;
        for document in candidates {
            let path = crate::workspace::validate_existing_markdown_document_path(
                &root_path,
                &root.join(&document.relative_path).to_string_lossy(),
            )?;
            let raw = crate::graph::read_regular_document(
                &path,
                (64 * 1024 * 1024u64)
                    .saturating_sub(spent)
                    .min(4 * 1024 * 1024),
                &mut spent,
            )?;
            let body_start = crate::document_frontmatter::split(&raw)
                .map(|frontmatter| frontmatter.body_start)
                .unwrap_or(0);
            let body = crate::graph_parse::mask_obsidian_comments(&raw[body_start..]);
            let starts = std::iter::once(0)
                .chain(raw.match_indices('\n').map(|(index, _)| index + 1))
                .collect::<Vec<_>>();
            let mut excluded = 0usize;
            let mut lines = BTreeSet::new();
            for (event, range) in Parser::new_ext(
                &body,
                Options::ENABLE_WIKILINKS | Options::ENABLE_MATH | Options::ENABLE_TABLES,
            )
            .into_offset_iter()
            {
                use pulldown_cmark::{Tag, TagEnd};
                match event {
                    Event::Start(
                        Tag::CodeBlock(_) | Tag::HtmlBlock | Tag::Link { .. } | Tag::Image { .. },
                    ) => excluded += 1,
                    Event::End(
                        TagEnd::CodeBlock | TagEnd::HtmlBlock | TagEnd::Link | TagEnd::Image,
                    ) => excluded = excluded.saturating_sub(1),
                    Event::Text(text) if excluded == 0 => {
                        let text = text.to_lowercase();
                        if names.iter().any(|name| {
                            text.match_indices(name).any(|(start, _)| {
                                !name.is_ascii()
                                    || (!text[..start]
                                        .chars()
                                        .next_back()
                                        .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
                                        && !text[start + name.len()..]
                                            .chars()
                                            .next()
                                            .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_'))
                            })
                        }) {
                            let (line, context) =
                                line_context(&raw, &starts, body_start + range.start);
                            if lines.insert(line) {
                                mentions.push(WorkspaceMention {
                                    relative_path: document.relative_path.clone(),
                                    line,
                                    context,
                                });
                            }
                            if mentions.len() >= 200 {
                                return Ok(mentions);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        Ok(mentions)
    })
    .await
    .map_err(|_| "提及检索任务失败".to_string())?
}

pub(crate) fn invalidate(path: &Path) {
    if let Ok(mut dirty) = DIRTY.lock() {
        if dirty.len() >= 2048 {
            dirty.clear();
            INVALIDATE_ALL.store(true, Ordering::Relaxed);
        }
        dirty.insert(path.to_path_buf());
    }
}

fn model_bytes(document: &IndexedDocument) -> usize {
    fn json_bytes(value: &serde_json::Value) -> usize {
        match value {
            serde_json::Value::String(value) => value.len() + 32,
            serde_json::Value::Array(values) => 32 + values.iter().map(json_bytes).sum::<usize>(),
            serde_json::Value::Object(values) => {
                64 + values
                    .iter()
                    .map(|(key, value)| key.len() + 96 + json_bytes(value))
                    .sum::<usize>()
            }
            _ => 32,
        }
    }
    json_bytes(&document.properties)
        + document
            .projection
            .tags
            .iter()
            .chain(&document.projection.properties)
            .map(|value| value.len() + 48)
            .sum::<usize>()
        + document
            .projection
            .references
            .iter()
            .map(|reference| reference.value.len() + 64)
            .sum::<usize>()
        + document
            .sources
            .iter()
            .map(|(reference, _, context)| reference.value.len() + context.len() + 96)
            .sum::<usize>()
        + document
            .links
            .iter()
            .map(|link| {
                link.href.len()
                    + link.context.len()
                    + link.target_path.as_ref().map_or(0, String::len)
                    + link.unresolved.as_ref().map_or(0, String::len)
                    + 160
            })
            .sum::<usize>()
        + document
            .tasks
            .iter()
            .map(|task| task.text.len() + 64)
            .sum::<usize>()
        + document
            .resources
            .iter()
            .map(|value| value.len() + 32)
            .sum::<usize>()
}

fn limit_model(document: &mut IndexedDocument) {
    document.sources = Arc::new(Vec::new());
    document.links.clear();
    document.tasks.clear();
    document.resources.clear();
    document.tags.clear();
    document.properties = serde_json::json!({});
    let mut projection = Projection::default();
    projection.title = Some(document.title.clone());
    projection
        .warnings
        .push("关系与属性超过索引预算，已保留正文检索".into());
    document
        .errors
        .push("关系与属性超过索引预算，已保留正文检索".into());
    document.projection = Arc::new(projection);
}

fn stamp(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_nanos())
        .unwrap_or(0);
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        format!(
            "{}:{modified}:{}:{}:{}",
            metadata.len(),
            metadata.ctime(),
            metadata.ctime_nsec(),
            metadata.ino()
        )
    }
    #[cfg(not(unix))]
    {
        format!(
            "{}:{modified}:{}",
            metadata.len(),
            metadata.permissions().readonly()
        )
    }
}

fn line_context(raw: &str, starts: &[usize], offset: usize) -> (usize, String) {
    let offset = offset.min(raw.len());
    let line = starts
        .partition_point(|start| *start <= offset)
        .saturating_sub(1);
    let start = starts[line];
    let end = starts
        .get(line + 1)
        .map(|next| next.saturating_sub(1))
        .unwrap_or(raw.len());
    let text: String = raw[start..end].trim_start().chars().take(200).collect();
    (line + 1, text.trim_end().to_string())
}

fn analyze(path: &str, content: String, modified_at: u128) -> IndexedDocument {
    let starts = std::iter::once(0)
        .chain(content.match_indices('\n').map(|(index, _)| index + 1))
        .collect::<Vec<_>>();
    let projection = crate::graph_parse::parse(&content);
    let mut errors = projection.warnings.clone();
    let frontmatter = crate::document_frontmatter::split(&content);
    let body_start = frontmatter
        .as_ref()
        .map(|frontmatter| frontmatter.body_start)
        .unwrap_or(0);
    let properties = frontmatter
        .as_ref()
        .and_then(|frontmatter| crate::graph_metadata::parse_values(frontmatter.block).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let body = &content[body_start..];
    let mut sources = Vec::new();
    if let Ok(references) = crate::document_links::body_references(body) {
        for located in references
            .into_iter()
            .filter(|located| located.occurrence)
            .take(8192)
        {
            let (line, context) = line_context(&content, &starts, body_start + located.span.start);
            if located.reference.value.len() <= 2048 {
                sources.push((located.reference, line, context));
            }
        }
    }
    if let Some(frontmatter) = &frontmatter {
        if let Ok(fields) = crate::document_frontmatter::text_scalars(frontmatter.block) {
            for field in fields
                .into_iter()
                .filter(crate::document_frontmatter::is_reference_text)
            {
                if let Ok(references) = crate::document_links::body_references(&field.value) {
                    for located in references.into_iter().filter(|located| located.occurrence) {
                        if sources.len() >= 8192 {
                            break;
                        }
                        let (line, context) = line_context(
                            &content,
                            &starts,
                            frontmatter.range.start + field.range.start,
                        );
                        sources.push((located.reference, line, context));
                    }
                }
            }
        }
    }
    let mut tasks = Vec::new();
    let task_body = crate::graph_parse::mask_obsidian_comments(body);
    for (event, range) in Parser::new_ext(&task_body, Options::ENABLE_TASKLISTS).into_offset_iter()
    {
        if let Event::TaskListMarker(checked) = event {
            if tasks.len() >= 4096 {
                errors.push("任务数量超过索引上限".into());
                break;
            }
            let offset = body_start + range.start;
            let (line, context) = line_context(&content, &starts, offset);
            let text = context
                .split_once(']')
                .map(|(_, text)| text.trim())
                .unwrap_or(&context)
                .to_string();
            tasks.push(IndexedTask {
                offset,
                line,
                checked,
                text,
            });
        }
    }
    let resources = crate::document_assets::markdown_destinations(body)
        .into_iter()
        .map(|(_, value)| value)
        .filter(|value| value.len() <= 2048)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .take(4096)
        .collect();
    let name = path.rsplit('/').next().unwrap_or(path).to_string();
    let title = projection.title.clone().unwrap_or_else(|| {
        Path::new(&name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let fingerprint = format!("{:x}", Sha256::digest(content.as_bytes()));
    IndexedDocument {
        relative_path: path.into(),
        name,
        title,
        content: Arc::from(content),
        fingerprint,
        modified_at,
        tags: projection.tags.iter().cloned().collect(),
        properties,
        links: Vec::new(),
        tasks,
        resources,
        errors,
        projection: Arc::new(projection),
        sources: Arc::new(sources),
    }
}

fn scan(index: &mut WorkspaceIndex, force: bool) -> Result<(), String> {
    let mut entries = index.entries.clone();
    let mut removed = index.removed.clone();
    let paths = crate::document_links::collect_documents(&index.root)?;
    let current = paths
        .iter()
        .map(|path| crate::document_links::relative(&index.root, path))
        .collect::<BTreeSet<_>>();
    let paths_changed = current != entries.keys().cloned().collect();
    let revision = REVISION.fetch_add(1, Ordering::Relaxed);
    let mut changed = false;
    let mut projected = entries
        .values()
        .map(|entry| model_bytes(&entry.document))
        .sum::<usize>();
    let mut bytes = entries
        .values()
        .map(|entry| entry.document.content.len())
        .sum::<usize>();
    let deleted = entries
        .keys()
        .filter(|path| !current.contains(*path))
        .cloned()
        .collect::<Vec<_>>();
    for path in deleted {
        if let Some(entry) = entries.remove(&path) {
            bytes = bytes.saturating_sub(entry.document.content.len());
            projected = projected.saturating_sub(model_bytes(&entry.document));
        }
        removed.push_back((revision, path));
        changed = true;
    }
    for path in paths {
        let relative = crate::document_links::relative(&index.root, &path);
        let metadata = fs::symlink_metadata(&path).map_err(|_| "文档在索引期间已改变，请重试")?;
        let stamp = stamp(&metadata);
        let forced = force || index.dirty.iter().any(|dirty| path.starts_with(dirty));
        if !forced
            && entries.get(&relative).is_some_and(|entry| {
                entry.stamp == stamp
                    && (!entry.read_failed || entry.checked_at.elapsed().as_secs() < 5)
            })
        {
            continue;
        }
        let old_size = entries
            .get(&relative)
            .map(|entry| entry.document.content.len())
            .unwrap_or(0);
        let old_model = entries
            .get(&relative)
            .map(|entry| model_bytes(&entry.document))
            .unwrap_or(0);
        let canonical = path.canonicalize().map_err(|_| "文档在索引期间已改变")?;
        if canonical != path || !canonical.starts_with(&index.root) {
            return Err("索引文件路径已改变".into());
        }
        let content = crate::graph::read_regular_document(&path, 4 * 1024 * 1024, &mut 0);
        let read_failed = content.is_err();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|time| time.as_millis())
            .unwrap_or(0);
        let mut document = match content {
            Ok(content) => {
                let fingerprint = format!("{:x}", Sha256::digest(content.as_bytes()));
                if let Some(entry) = entries.get_mut(&relative).filter(|entry| {
                    entry.document.fingerprint == fingerprint
                        && entry.document.modified_at == modified
                        && !entry.read_failed
                        && !force
                }) {
                    entry.stamp = stamp;
                    continue;
                }
                analyze(&relative, content, modified)
            }
            Err(error) => {
                let mut document = analyze(&relative, String::new(), modified);
                document.errors.push(error);
                document
            }
        };
        document.links.clear();
        if projected.saturating_sub(old_model) + model_bytes(&document) > MAX_MODEL {
            limit_model(&mut document);
        }
        projected = projected.saturating_sub(old_model) + model_bytes(&document);
        if bytes.saturating_sub(old_size) + document.content.len() > MAX_CONTENT {
            document.content = Arc::from("");
        }
        bytes = bytes.saturating_sub(old_size) + document.content.len();
        entries.insert(
            relative,
            Entry {
                stamp,
                document: Arc::new(document),
                changed_at: revision,
                read_failed,
                checked_at: Instant::now(),
            },
        );
        changed = true;
    }
    let lookup = Lookup::new(entries.keys().cloned());
    let mut model = 0usize;
    for entry in entries.values_mut() {
        if !paths_changed && entry.changed_at <= index.revision {
            model += model_bytes(&entry.document);
            continue;
        }
        let links = entry
            .document
            .sources
            .iter()
            .filter_map(|(reference, line, context)| {
                let (target_path, unresolved) =
                    match lookup.resolve(&entry.document.relative_path, reference) {
                        Resolution::Resolved(path) => (Some(path), None),
                        Resolution::Unresolved { key, .. } => (None, Some(key)),
                        Resolution::Ignore => return None,
                    };
                Some(IndexedLink {
                    target_path,
                    unresolved,
                    href: reference.value.clone(),
                    line: *line,
                    context: context.clone(),
                })
            })
            .collect::<Vec<_>>();
        if links != entry.document.links {
            let mut document = (*entry.document).clone();
            document.links = links;
            if model + model_bytes(&document) > MAX_MODEL {
                limit_model(&mut document);
            }
            entry.document = Arc::new(document);
            entry.changed_at = revision;
            changed = true;
        }
        if model + model_bytes(&entry.document) > MAX_MODEL {
            let mut document = (*entry.document).clone();
            limit_model(&mut document);
            entry.document = Arc::new(document);
            entry.changed_at = revision;
            changed = true;
        }
        model += model_bytes(&entry.document);
    }
    if changed {
        index.revision = revision;
    }
    while removed.len() > 10_000 {
        if let Some((revision, _)) = removed.pop_front() {
            index.epoch = index.epoch.max(revision + 1);
        }
    }
    index.entries = entries;
    index.removed = removed;
    index.dirty.clear();
    index.last_scan = Instant::now();
    Ok(())
}

fn with_index<T>(
    root: &Path,
    force: bool,
    dirty: &[String],
    run: impl FnOnce(&mut WorkspaceIndex) -> Result<T, String>,
) -> Result<T, String> {
    let mut cache = CACHE.lock().map_err(|_| "索引状态不可用")?;
    if cache.as_ref().map_or(true, |index| index.root != root) {
        let revision = REVISION.fetch_add(1, Ordering::Relaxed);
        *cache = Some(WorkspaceIndex {
            root: root.to_path_buf(),
            epoch: revision,
            revision,
            entries: BTreeMap::new(),
            removed: VecDeque::new(),
            dirty: BTreeSet::from([root.to_path_buf()]),
            last_scan: Instant::now(),
        });
    }
    let index = cache.as_mut().unwrap();
    if let Ok(mut queued) = DIRTY.lock() {
        for path in std::mem::take(&mut *queued) {
            if path.starts_with(root) {
                index.dirty.insert(path);
            }
        }
    }
    for path in dirty.iter().take(512) {
        let path = PathBuf::from(path);
        let path = if path.is_absolute() {
            path
        } else {
            root.join(path)
        };
        if path.starts_with(root) {
            index.dirty.insert(path);
        }
    }
    scan(
        index,
        force || INVALIDATE_ALL.swap(false, Ordering::Relaxed),
    )?;
    run(index)
}

pub(crate) fn documents(root: &Path) -> Result<(Vec<Arc<IndexedDocument>>, Vec<String>), String> {
    with_index(root, false, &[], |index| {
        let documents = index
            .entries
            .values()
            .map(|entry| Arc::clone(&entry.document))
            .collect();
        Ok((documents, warnings(index)))
    })
}

fn warnings(index: &WorkspaceIndex) -> Vec<String> {
    index
        .entries
        .values()
        .flat_map(|entry| {
            entry
                .document
                .errors
                .iter()
                .map(|error| format!("{}：{error}", entry.document.relative_path))
        })
        .take(20)
        .collect()
}

#[tauri::command]
pub async fn load_workspace_index(
    root_path: String,
    since_revision: Option<u64>,
    cursor: Option<usize>,
    snapshot_revision: Option<u64>,
    changed_paths: Option<Vec<String>>,
    force: Option<bool>,
) -> Result<WorkspaceIndexPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = crate::workspace::canonical_workspace_root(&root_path)?;
        let cursor = cursor.unwrap_or(0);
        if cursor > 50_000 {
            return Err("索引分页位置无效".into());
        }
        let page_set = if cursor > 0 {
            PAGES
                .lock()
                .map_err(|_| "索引分页状态不可用")?
                .iter()
                .rev()
                .find(|(path, page)| {
                    *path == root
                        && Some(page.revision) == snapshot_revision
                        && page.since == since_revision
                })
                .map(|(_, page)| page.clone())
                .ok_or("索引分页已过期，请重新加载")?
        } else {
            with_index(
                &root,
                force.unwrap_or(false),
                &changed_paths.unwrap_or_default(),
                |index| {
                    let reset = since_revision
                        .map_or(true, |since| since < index.epoch || since > index.revision);
                    let documents = index
                        .entries
                        .values()
                        .filter(|entry| reset || entry.changed_at > since_revision.unwrap_or(0))
                        .map(|entry| Arc::clone(&entry.document))
                        .collect();
                    let removed = if reset {
                        Vec::new()
                    } else {
                        index
                            .removed
                            .iter()
                            .filter(|(revision, _)| *revision > since_revision.unwrap_or(0))
                            .map(|(_, path)| path.clone())
                            .collect()
                    };
                    Ok(PageSet {
                        revision: index.revision,
                        since: since_revision,
                        reset,
                        documents,
                        removed,
                        warnings: warnings(index),
                    })
                },
            )?
        };
        let mut bytes = 0usize;
        let mut documents = Vec::new();
        let mut next = cursor;
        for document in page_set.documents.iter().skip(cursor).take(64) {
            let mut document = (**document).clone();
            if document.content.is_empty()
                && document.fingerprint != format!("{:x}", Sha256::digest([]))
            {
                let path = root.join(&document.relative_path);
                if path.canonicalize().map_err(|_| "索引文档已改变，请重试")? != path {
                    return Err("索引文档路径已改变".into());
                }
                let content = crate::graph::read_regular_document(&path, 4 * 1024 * 1024, &mut 0)?;
                if format!("{:x}", Sha256::digest(content.as_bytes())) != document.fingerprint {
                    return Err("索引文档已改变，请重新加载".into());
                }
                document.content = Arc::from(content);
            }
            let size = serde_json::to_vec(&document)
                .map_err(|_| "无法读取索引记录")?
                .len();
            if !documents.is_empty() && bytes + size > PAGE_BYTES {
                break;
            }
            if size > PAGE_BYTES {
                document.content = Arc::from("");
                document.links.truncate(1024);
                document.resources.truncate(1024);
                document.tasks.truncate(1024);
                document
                    .errors
                    .push("文档超过索引输出预算，正文未进入检索".into());
            }
            bytes += size;
            documents.push(document);
            next += 1;
        }
        let more = next < page_set.documents.len();
        let mut pages = PAGES.lock().map_err(|_| "索引分页状态不可用")?;
        pages.retain(|(path, page)| {
            !(*path == root && page.revision == page_set.revision && page.since == page_set.since)
        });
        if more {
            pages.push_back((root, page_set.clone()));
            while pages.len() > 4 {
                pages.pop_front();
            }
        }
        Ok(WorkspaceIndexPage {
            revision: page_set.revision,
            reset: page_set.reset,
            documents,
            removed: if cursor == 0 {
                page_set.removed
            } else {
                Vec::new()
            },
            warnings: page_set.warnings,
            next_cursor: more.then_some(next),
            total: page_set.documents.len(),
        })
    })
    .await
    .map_err(|_| "工作区索引任务失败".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn local_index(root: &Path) -> WorkspaceIndex {
        WorkspaceIndex {
            root: root.into(),
            epoch: 0,
            revision: 0,
            entries: BTreeMap::new(),
            removed: VecDeque::new(),
            dirty: BTreeSet::new(),
            last_scan: Instant::now(),
        }
    }

    #[test]
    #[ignore = "synthetic incremental index performance sample"]
    fn benchmarks_incremental_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        for i in 0..2000 {
            fs::write(root.join(format!("n{i}.md")), format!("---\ntitle: Note {i}\ntags: [research/pdf]\nstatus: active\n---\n# Note {i}\n[[n{}]]\n- [ ] Task\n{}", (i + 1) % 2000, "Evidence and source fidelity. ".repeat(100))).unwrap();
        }
        let mut index = local_index(&root);
        let start = Instant::now();
        scan(&mut index, false).unwrap();
        let cold = start.elapsed();
        let previous = index
            .entries
            .iter()
            .map(|(path, entry)| (path.clone(), Arc::clone(&entry.document)))
            .collect::<BTreeMap<_, _>>();
        let start = Instant::now();
        scan(&mut index, false).unwrap();
        let warm = start.elapsed();
        assert!(index
            .entries
            .iter()
            .all(|(path, entry)| Arc::ptr_eq(&previous[path], &entry.document)));
        fs::write(root.join("n100.md"), "# Changed\n[[n200]]\n- [x] Done").unwrap();
        let start = Instant::now();
        scan(&mut index, false).unwrap();
        let delta = start.elapsed();
        let replaced = index
            .entries
            .iter()
            .filter(|(path, entry)| !Arc::ptr_eq(&previous[*path], &entry.document))
            .count();
        assert_eq!(replaced, 1);
        println!("incremental index: 2000 documents, cold={} ms, unchanged={} ms, one-change={} ms, reparsed={}", cold.as_millis(), warm.as_millis(), delta.as_millis(), replaced);
    }
    #[test]
    fn tasks_and_resources_ignore_obsidian_and_html_code_examples() {
        let raw = "%%\n- [ ] hidden\n![hidden](hidden.png)\n%%\n- [ ] real\n\n<code>![example](code.png)</code>\n\n![real](real.png)";
        let document = analyze("note.md", raw.into(), 0);
        assert_eq!(document.tasks.len(), 1);
        assert_eq!(document.tasks[0].text, "real");
        assert_eq!(document.resources, vec!["real.png"]);
    }
    #[test]
    fn unchanged_documents_reuse_projections_and_file_changes_reconcile_link_identity() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("a.md"), "---\nrelated: '[[b]]'\nsource: {quote: '[[fake]]'}\n---\n[b](b.md)\n- [ ] task\n`[[fake]]`\n%% [[fake]] %%").unwrap();
        let mut index = local_index(&root);
        scan(&mut index, false).unwrap();
        let previous = Arc::clone(&index.entries["a.md"].document);
        let revision = index.revision;
        assert_eq!(previous.links.len(), 2);
        assert!(previous.links[0].unresolved.is_some());
        assert_eq!(previous.tasks.len(), 1);
        assert_eq!(previous.tasks[0].line, 6);
        scan(&mut index, false).unwrap();
        assert_eq!(index.revision, revision);
        assert!(Arc::ptr_eq(&previous, &index.entries["a.md"].document));
        fs::write(root.join("b.md"), "B").unwrap();
        scan(&mut index, false).unwrap();
        assert!(index.entries["a.md"]
            .document
            .links
            .iter()
            .all(|link| link.target_path.as_deref() == Some("b.md")));
        fs::remove_file(root.join("b.md")).unwrap();
        scan(&mut index, false).unwrap();
        assert!(index.removed.iter().any(|(_, path)| path == "b.md"));
        assert!(index.entries["a.md"].document.links[0].unresolved.is_some());
    }

    #[test]
    fn failed_reads_can_recover_to_empty_files_and_forced_scans_rebuild_models() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.join("a.md");
        fs::write(&path, [0xff, 0xfe]).unwrap();
        let mut index = local_index(&root);
        scan(&mut index, false).unwrap();
        assert!(index.entries["a.md"].read_failed);
        fs::write(&path, "").unwrap();
        scan(&mut index, true).unwrap();
        assert!(!index.entries["a.md"].read_failed);
        assert!(index.entries["a.md"].document.errors.is_empty());
        fs::write(&path, "---\ntags: [test]\n---\nBody").unwrap();
        scan(&mut index, false).unwrap();
        let entry = index.entries.get_mut("a.md").unwrap();
        limit_model(Arc::make_mut(&mut entry.document));
        assert!(entry.document.tags.is_empty());
        scan(&mut index, true).unwrap();
        assert_eq!(index.entries["a.md"].document.tags, vec!["test"]);
    }

    #[test]
    fn paged_snapshots_survive_another_root_and_delta_pages_report_removals() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let path = root.to_string_lossy().to_string();
        for i in 0..70 {
            fs::write(root.join(format!("note-{i:02}.md")), format!("Body {i}")).unwrap();
        }
        let first = tauri::async_runtime::block_on(load_workspace_index(
            path.clone(),
            None,
            None,
            None,
            None,
            None,
        ))
        .unwrap();
        assert_eq!(first.documents.len(), 64);
        assert_eq!(first.next_cursor, Some(64));
        let other = tempfile::tempdir().unwrap();
        let _ = tauri::async_runtime::block_on(load_workspace_index(
            other.path().to_string_lossy().into(),
            None,
            None,
            None,
            None,
            None,
        ))
        .unwrap();
        let last = tauri::async_runtime::block_on(load_workspace_index(
            path.clone(),
            None,
            first.next_cursor,
            Some(first.revision),
            None,
            None,
        ))
        .unwrap();
        assert_eq!(last.documents.len(), 6);
        assert!(last.next_cursor.is_none());
        let baseline = tauri::async_runtime::block_on(load_workspace_index(
            path.clone(),
            None,
            None,
            None,
            None,
            None,
        ))
        .unwrap();
        fs::write(root.join("note-00.md"), "new body").unwrap();
        fs::remove_file(root.join("note-01.md")).unwrap();
        let delta = tauri::async_runtime::block_on(load_workspace_index(
            path,
            Some(baseline.revision),
            None,
            None,
            None,
            None,
        ))
        .unwrap();
        // Other test roots may evict the single active cache; either reset or delta is valid. author: refinex
        if !delta.reset {
            assert_eq!(delta.documents.len(), 1);
            assert_eq!(delta.removed, vec!["note-01.md"]);
        }
        assert!(delta
            .documents
            .iter()
            .any(|document| document.relative_path == "note-00.md"
                && document.content.as_ref() == "new body"));
    }
}

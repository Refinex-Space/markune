use crate::graph_parse::{Projection, Reference};
use crate::graph_resolve::{Lookup, Resolution};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_DOCUMENT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_DOCUMENTS: usize = 50_000;
const MAX_EDGES: usize = 200_000;
const MAX_WARNINGS: usize = 20;
static GRAPH_LOAD_PERMITS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraphSnapshot {
    pub nodes: Vec<WorkspaceGraphNode>,
    pub edges: Vec<WorkspaceGraphEdge>,
    pub document_count: usize,
    pub warnings: Vec<String>,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraphNode {
    pub id: String,
    pub label: String,
    pub kind: WorkspaceGraphNodeKind,
    pub relative_path: Option<String>,
    pub degree: usize,
    pub in_degree: usize,
    pub out_degree: usize,
    pub content_indexed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceGraphNodeKind {
    Note,
    Daily,
    Weekly,
    Tag,
    Property,
    Unresolved,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: WorkspaceGraphEdgeKind,
    pub weight: usize,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceGraphEdgeKind {
    Link,
    Tag,
    Property,
}

pub(crate) struct ParsedDocument {
    pub path: String,
    pub projection: Projection,
    pub indexed: bool,
}

#[derive(Clone, Copy)]
struct Limits {
    document_bytes: u64,
    total_bytes: u64,
    documents: usize,
    entries: usize,
    edges: usize,
    hubs: usize,
    projection_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            document_bytes: MAX_DOCUMENT_BYTES,
            total_bytes: 128 * 1024 * 1024,
            documents: MAX_DOCUMENTS,
            entries: 200_000,
            edges: MAX_EDGES,
            hubs: 20_000,
            projection_bytes: 32 * 1024 * 1024,
        }
    }
}

struct Scan {
    documents: Vec<ParsedDocument>,
    warnings: Vec<String>,
    entries: usize,
    bytes: u64,
    projection_bytes: usize,
    limits: Limits,
}

#[derive(PartialEq, Eq, PartialOrd, Ord)]
struct EdgeKey {
    source: String,
    target: String,
    kind: WorkspaceGraphEdgeKind,
}

#[tauri::command]
pub async fn load_workspace_graph(root_path: String) -> Result<WorkspaceGraphSnapshot, String> {
    let permit = GRAPH_LOAD_PERMITS
        .acquire()
        .await
        .map_err(|_| "图谱读取服务不可用".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        load_workspace_graph_sync(&root_path)
    })
    .await
    .map_err(|_| "工作区图谱读取任务失败".to_string())?
}

fn load_workspace_graph_sync(root_path: &str) -> Result<WorkspaceGraphSnapshot, String> {
    let root = crate::workspace::canonical_workspace_root(root_path)?;
    let (indexed, warnings) = crate::workspace_index::documents(&root)?;
    let mut scan = Scan {
        documents: Vec::new(),
        warnings,
        entries: 0,
        bytes: 0,
        projection_bytes: 0,
        limits: Limits::default(),
    };
    for document in indexed {
        let mut projection = (*document.projection).clone();
        let mut truncated = false;
        projection
            .references
            .retain(|reference| retain_value(&reference.value, &mut scan, &mut truncated));
        projection
            .tags
            .retain(|value| retain_value(value, &mut scan, &mut truncated));
        projection
            .properties
            .retain(|value| retain_value(value, &mut scan, &mut truncated));
        if truncated {
            push_warning(
                &mut scan.warnings,
                "图谱关系投影超过内存预算，部分内容未索引".into(),
            );
        }
        scan.documents.push(ParsedDocument {
            path: document.relative_path.clone(),
            projection,
            indexed: document.errors.is_empty() && !truncated,
        });
    }
    build_graph(scan)
}

fn load_with_limits(root_path: &str, limits: Limits) -> Result<WorkspaceGraphSnapshot, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;
    if !root.is_dir() {
        return Err("工作区路径不是文件夹".into());
    }
    let mut scan = Scan {
        documents: Vec::new(),
        warnings: Vec::new(),
        entries: 0,
        bytes: 0,
        projection_bytes: 0,
        limits,
    };
    collect_documents(&root, &root, 0, &mut scan)?;
    build_graph(scan)
}

fn build_graph(mut scan: Scan) -> Result<WorkspaceGraphSnapshot, String> {
    let limits = scan.limits;
    let lookup = Lookup::new(scan.documents.iter().map(|document| document.path.clone()));
    let mut nodes = scan
        .documents
        .iter()
        .map(|document| {
            let mut node = graph_node(
                file_id(&document.path),
                document.projection.title.clone().unwrap_or_else(|| {
                    Path::new(&document.path)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .chars()
                        .take(256)
                        .collect()
                }),
                classify_document(&document.path),
            );
            node.relative_path = Some(document.path.clone());
            node.content_indexed = document.indexed;
            node
        })
        .collect::<Vec<_>>();
    let mut hubs = BTreeMap::<String, WorkspaceGraphNode>::new();
    let mut edges = BTreeMap::<EdgeKey, usize>::new();
    for document in &scan.documents {
        let source = file_id(&document.path);
        for reference in &document.projection.references {
            let target = match lookup.resolve(&document.path, reference) {
                Resolution::Resolved(path) => file_id(&path),
                Resolution::Unresolved { key, label } => {
                    let id = format!("unresolved:{key}");
                    if !add_hub(
                        &mut hubs,
                        &mut scan.warnings,
                        limits.hubs,
                        &id,
                        &label,
                        WorkspaceGraphNodeKind::Unresolved,
                    ) {
                        continue;
                    }
                    id
                }
                Resolution::Ignore => continue,
            };
            if source != target {
                add_edge(
                    &mut edges,
                    &mut scan.warnings,
                    limits.edges,
                    &source,
                    &target,
                    WorkspaceGraphEdgeKind::Link,
                );
            }
        }
        for (values, prefix, node_kind, edge_kind) in [
            (
                &document.projection.tags,
                "tag",
                WorkspaceGraphNodeKind::Tag,
                WorkspaceGraphEdgeKind::Tag,
            ),
            (
                &document.projection.properties,
                "property",
                WorkspaceGraphNodeKind::Property,
                WorkspaceGraphEdgeKind::Property,
            ),
        ] {
            for value in values {
                let id = format!(
                    "{prefix}:{}",
                    if node_kind == WorkspaceGraphNodeKind::Tag {
                        value.to_lowercase()
                    } else {
                        value.clone()
                    }
                );
                if add_hub(
                    &mut hubs,
                    &mut scan.warnings,
                    limits.hubs,
                    &id,
                    value,
                    node_kind,
                ) {
                    add_edge(
                        &mut edges,
                        &mut scan.warnings,
                        limits.edges,
                        &source,
                        &id,
                        edge_kind,
                    );
                }
            }
        }
    }
    let connected = edges
        .keys()
        .flat_map(|key| [&key.source, &key.target])
        .collect::<BTreeSet<_>>();
    nodes.extend(
        hubs.into_values()
            .filter(|node| connected.contains(&node.id)),
    );
    let mut neighbors = BTreeMap::<String, BTreeSet<String>>::new();
    let mut incoming = BTreeMap::<String, BTreeSet<String>>::new();
    let mut outgoing = BTreeMap::<String, BTreeSet<String>>::new();
    let edges = edges
        .into_iter()
        .map(|(key, weight)| {
            neighbors
                .entry(key.source.clone())
                .or_default()
                .insert(key.target.clone());
            neighbors
                .entry(key.target.clone())
                .or_default()
                .insert(key.source.clone());
            if key.kind == WorkspaceGraphEdgeKind::Link {
                outgoing
                    .entry(key.source.clone())
                    .or_default()
                    .insert(key.target.clone());
                incoming
                    .entry(key.target.clone())
                    .or_default()
                    .insert(key.source.clone());
            }
            WorkspaceGraphEdge {
                id: serde_json::to_string(&(key.kind, &key.source, &key.target))
                    .expect("graph identity serializes"),
                source: key.source,
                target: key.target,
                kind: key.kind,
                weight,
            }
        })
        .collect::<Vec<_>>();
    for node in &mut nodes {
        node.degree = neighbors.get(&node.id).map_or(0, BTreeSet::len);
        node.in_degree = incoming.get(&node.id).map_or(0, BTreeSet::len);
        node.out_degree = outgoing.get(&node.id).map_or(0, BTreeSet::len);
    }
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    let mut digest = Sha256::new();
    for node in &nodes {
        digest.update(serde_json::to_vec(node).expect("graph node serializes"));
    }
    for edge in &edges {
        digest.update(serde_json::to_vec(edge).expect("graph edge serializes"));
    }
    digest.update(serde_json::to_vec(&scan.warnings).expect("graph warnings serialize"));
    Ok(WorkspaceGraphSnapshot {
        nodes,
        edges,
        document_count: scan.documents.len(),
        warnings: scan.warnings,
        fingerprint: format!("{:x}", digest.finalize()),
    })
}

fn graph_node(id: String, label: String, kind: WorkspaceGraphNodeKind) -> WorkspaceGraphNode {
    WorkspaceGraphNode {
        id,
        label,
        kind,
        relative_path: None,
        degree: 0,
        in_degree: 0,
        out_degree: 0,
        content_indexed: true,
    }
}

fn file_id(path: &str) -> String {
    format!("file:{path}")
}

fn add_hub(
    hubs: &mut BTreeMap<String, WorkspaceGraphNode>,
    warnings: &mut Vec<String>,
    limit: usize,
    id: &str,
    label: &str,
    kind: WorkspaceGraphNodeKind,
) -> bool {
    if hubs.contains_key(id) {
        return true;
    }
    if hubs.len() >= limit {
        push_warning(warnings, "辅助节点数量超过图谱上限，部分关系未显示".into());
        return false;
    }
    hubs.insert(
        id.into(),
        graph_node(id.into(), label.chars().take(256).collect(), kind),
    );
    true
}

fn add_edge(
    edges: &mut BTreeMap<EdgeKey, usize>,
    warnings: &mut Vec<String>,
    limit: usize,
    source: &str,
    target: &str,
    kind: WorkspaceGraphEdgeKind,
) {
    let key = EdgeKey {
        source: source.into(),
        target: target.into(),
        kind,
    };
    if let Some(weight) = edges.get_mut(&key) {
        if kind == WorkspaceGraphEdgeKind::Link {
            *weight += 1;
        }
        return;
    }
    if edges.len() >= limit {
        push_warning(warnings, "关系数量超过图谱上限，部分关系未显示".into());
        return;
    }
    edges.insert(key, 1);
}

fn collect_documents(
    root: &Path,
    directory: &Path,
    depth: usize,
    scan: &mut Scan,
) -> Result<(), String> {
    if depth > 64 {
        push_warning(&mut scan.warnings, "目录层级超过图谱扫描上限".into());
        return Ok(());
    }
    let read_dir = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) if directory == root => return Err("无法读取工作区根目录".into()),
        Err(_) => {
            push_warning(
                &mut scan.warnings,
                format!("无法读取目录：{}", relative_path(root, directory)),
            );
            return Ok(());
        }
    };
    let remaining = scan.limits.entries.saturating_sub(scan.entries);
    let mut entries = read_dir
        .take(remaining + 1)
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    if entries.len() > remaining {
        push_warning(&mut scan.warnings, "目录条目超过图谱扫描上限".into());
        entries.truncate(remaining);
    }
    scan.entries += entries.len();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if scan.documents.len() >= scan.limits.documents {
            push_warning(&mut scan.warnings, "文档数量超过图谱扫描上限".into());
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || crate::workspace::should_skip_entry(&name) {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if !canonical.starts_with(root) {
            continue;
        }
        if kind.is_dir() {
            collect_documents(root, &canonical, depth + 1, scan)?;
            continue;
        }
        if !kind.is_file() || !crate::workspace::is_markdown_document_file(&path) {
            continue;
        }
        let relative = relative_path(root, &path);
        let available = scan
            .limits
            .total_bytes
            .saturating_sub(scan.bytes)
            .min(scan.limits.document_bytes);
        let raw = if available == 0 {
            Err("已达到图谱内容读取总量上限".to_string())
        } else {
            read_regular_document(&canonical, available, &mut scan.bytes)
        };
        let (mut projection, indexed) = match raw {
            Ok(raw) => {
                let projection = crate::graph_parse::parse(&raw);
                (projection, true)
            }
            Err(error) => {
                push_warning(&mut scan.warnings, format!("{error}：{relative}"));
                (Projection::default(), false)
            }
        };
        let indexed = indexed && projection.warnings.is_empty();
        for warning in projection.warnings.drain(..) {
            push_warning(&mut scan.warnings, format!("{warning}：{relative}"));
        }
        let mut truncated = false;
        projection
            .references
            .retain(|Reference { value, .. }| retain_value(value, scan, &mut truncated));
        projection
            .tags
            .retain(|value| retain_value(value, scan, &mut truncated));
        projection
            .properties
            .retain(|value| retain_value(value, scan, &mut truncated));
        if truncated {
            push_warning(
                &mut scan.warnings,
                "图谱关系投影超过内存预算，部分内容未索引".into(),
            );
        }
        scan.documents.push(ParsedDocument {
            path: relative,
            projection,
            indexed: indexed && !truncated,
        });
    }
    Ok(())
}

fn retain_value(value: &str, scan: &mut Scan, truncated: &mut bool) -> bool {
    let size = value.len() + 64;
    if scan.projection_bytes.saturating_add(size) > scan.limits.projection_bytes {
        *truncated = true;
        return false;
    }
    scan.projection_bytes += size;
    true
}

pub(crate) fn read_regular_document(
    path: &Path,
    limit: u64,
    spent: &mut u64,
) -> Result<String, String> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let file = options.open(path).map_err(|_| "无法读取文档".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "无法读取文档信息".to_string())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("不是普通文档文件".into());
    }
    if metadata.len() > limit {
        return Err("文档大小超过本次图谱读取预算".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    let read = file.take(limit + 1).read_to_end(&mut bytes);
    *spent = spent.saturating_add(bytes.len() as u64);
    read.map_err(|_| "文档读取失败".to_string())?;
    if bytes.len() as u64 > limit {
        return Err("文档增长超过本次图谱读取预算".into());
    }
    String::from_utf8(bytes).map_err(|_| "文档不是 UTF-8 文本".into())
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn push_warning(warnings: &mut Vec<String>, warning: String) {
    if warnings.len() < MAX_WARNINGS && !warnings.contains(&warning) {
        warnings.push(warning);
    }
}

fn classify_document(path: &str) -> WorkspaceGraphNodeKind {
    let path = path.to_lowercase();
    if path.starts_with("daily/") {
        WorkspaceGraphNodeKind::Daily
    } else if path.starts_with("weekly/") {
        WorkspaceGraphNodeKind::Weekly
    } else {
        WorkspaceGraphNodeKind::Note
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn write(root: &Path, path: &str, body: &str) {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }
    #[test]
    fn keeps_direction_occurrences_unique_degrees_and_stable_identity() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        write(
            root,
            "a.md",
            "[[b]] [[b#heading]] #topic/sub #Topic/Sub\n---\n",
        );
        write(root, "b.md", "[[a]]");
        let graph = load_workspace_graph_sync(root.to_str().unwrap()).unwrap();
        assert!(graph.edges.iter().any(|edge| edge.source == "file:a.md"
            && edge.target == "file:b.md"
            && edge.weight == 2));
        assert!(graph.edges.iter().any(|edge| edge.source == "file:b.md"
            && edge.target == "file:a.md"
            && edge.weight == 1));
        let a = graph
            .nodes
            .iter()
            .find(|node| node.id == "file:a.md")
            .unwrap();
        assert_eq!((a.degree, a.in_degree, a.out_degree), (2, 1, 1));
        assert_eq!(
            graph,
            load_workspace_graph_sync(root.to_str().unwrap()).unwrap()
        );
        write(root, "c.md", "# C");
        let next = load_workspace_graph_sync(root.to_str().unwrap()).unwrap();
        assert_eq!(graph.edges, next.edges);
        assert_ne!(graph.fingerprint, next.fingerprint);
    }
    #[test]
    fn preserves_namespaced_tags_metadata_and_unresolved_nodes() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        write(root, "Daily/today.md", "---\ntitle: Today\ntags:\n- topic/sub\n- topic-sub\n- 'alpha,beta'\nstatus: active\nrelated: '[[target]]'\n---\n[[missing]] [[missing#block]] [[wrong/path/target]]");
        write(
            root,
            "target.md",
            "---\ntitle: Shown title\naliases: [Alternate]\n---\n",
        );
        write(root, "source.md", "[[Shown title]] [[Alternate]]");
        write(root, ".obsidian/private.md", "[[target]]");
        let graph = load_workspace_graph_sync(root.to_str().unwrap()).unwrap();
        assert_eq!(graph.document_count, 3);
        for id in [
            "tag:topic/sub",
            "tag:topic-sub",
            "tag:alpha,beta",
            "property:status",
            "unresolved:wiki:missing",
            "unresolved:path:wrong/path/target",
            "unresolved:wiki:shown title",
            "unresolved:wiki:alternate",
        ] {
            assert!(graph.nodes.iter().any(|node| node.id == id), "{id}");
        }
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.kind == WorkspaceGraphNodeKind::Daily && node.label == "Today"));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.source == "file:Daily/today.md" && edge.target == "file:target.md"));
    }
    #[test]
    fn limits_are_enforced_before_allocation_and_keep_unindexed_files_visible() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        write(root, "a.md", "[[b]] [[c]] [[d]] #one #two");
        write(root, "b.md", &"x".repeat(100));
        let graph = load_with_limits(
            root.to_str().unwrap(),
            Limits {
                document_bytes: 50,
                edges: 2,
                hubs: 2,
                ..Limits::default()
            },
        )
        .unwrap();
        assert!(graph.edges.len() <= 2);
        assert!(graph.nodes.len() <= 4);
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "file:b.md" && !node.content_indexed));
        assert!(!graph.warnings.is_empty());
        let graph = load_with_limits(
            root.to_str().unwrap(),
            Limits {
                projection_bytes: 1,
                ..Limits::default()
            },
        )
        .unwrap();
        assert!(graph.edges.is_empty());
        assert!(graph.nodes.iter().any(|node| !node.content_indexed));
        let graph = load_with_limits(
            root.to_str().unwrap(),
            Limits {
                documents: 1,
                ..Limits::default()
            },
        )
        .unwrap();
        assert_eq!(graph.document_count, 1);
    }
    #[cfg(unix)]
    #[test]
    fn skips_symbolic_links_and_fifo_without_blocking() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        use std::os::unix::fs::symlink;
        let directory = tempdir().unwrap();
        let root = directory.path();
        write(root, "inside.md", "# Inside");
        symlink(root.join("inside.md"), root.join("linked.md")).unwrap();
        let fifo = root.join("pipe.md");
        let path = CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
        assert!(read_regular_document(&fifo, 100, &mut 0).is_err());
        let graph = load_workspace_graph_sync(root.to_str().unwrap()).unwrap();
        assert_eq!(graph.document_count, 1);
    }
    #[test]
    #[ignore = "synthetic graph performance sample"]
    fn benchmarks_synthetic_workspace() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        for index in 0..2000 {
            write(root, &format!("notes/n{index}.md"), &format!("---\ntags: [topic/group{}]\nstatus: active\n---\n# Note {index}\n[[n{}]] [[n{}]]\n{}", index % 20, (index + 1) % 2000, (index + 31) % 2000, "Plain text content. ".repeat(100)));
        }
        let start = std::time::Instant::now();
        let graph = load_workspace_graph_sync(root.to_str().unwrap()).unwrap();
        println!(
            "graph sample: {} documents, {} nodes, {} edges, {} ms",
            graph.document_count,
            graph.nodes.len(),
            graph.edges.len(),
            start.elapsed().as_millis()
        );
        assert_eq!(graph.document_count, 2000);
        assert_eq!(graph.edges.len(), 8000);
        assert!(graph.warnings.is_empty());
    }
    #[test]
    fn failed_utf8_decoding_still_consumes_the_total_read_budget() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        fs::write(root.join("a.md"), [0xff; 20]).unwrap();
        write(root, "b.md", "#tag [[missing]]");
        let graph = load_with_limits(
            root.to_str().unwrap(),
            Limits {
                total_bytes: 20,
                ..Limits::default()
            },
        )
        .unwrap();
        assert_eq!(graph.document_count, 2);
        assert!(graph.nodes.iter().all(|node| !node.content_indexed));
        assert!(graph.edges.is_empty());
    }
}

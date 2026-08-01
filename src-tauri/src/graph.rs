use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_DOCUMENT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_DOCUMENTS: usize = 50_000;
const MAX_EDGES: usize = 200_000;
const MAX_WARNINGS: usize = 20;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraphSnapshot {
    pub nodes: Vec<WorkspaceGraphNode>,
    pub edges: Vec<WorkspaceGraphEdge>,
    pub document_count: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGraphNode {
    pub id: String,
    pub label: String,
    pub kind: WorkspaceGraphNodeKind,
    pub relative_path: Option<String>,
    pub degree: usize,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceGraphNodeKind {
    Note,
    Daily,
    Weekly,
    Tag,
    Property,
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

#[derive(Debug)]
struct ParsedDocument {
    id: String,
    label: String,
    kind: WorkspaceGraphNodeKind,
    raw: String,
    tags: Vec<String>,
    properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct EdgeKey {
    source: String,
    target: String,
    kind: WorkspaceGraphEdgeKind,
}

#[tauri::command]
pub async fn load_workspace_graph(root_path: String) -> Result<WorkspaceGraphSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || load_workspace_graph_sync(&root_path))
        .await
        .map_err(|_| "工作区图谱读取任务失败".to_string())?
}

fn load_workspace_graph_sync(root_path: &str) -> Result<WorkspaceGraphSnapshot, String> {
    let root = canonical_workspace_root(root_path)?;
    let mut documents = Vec::new();
    let mut warnings = Vec::new();
    collect_documents(&root, &root, &mut documents, &mut warnings)
        .map_err(|error| format!("读取工作区图谱失败：{error}"))?;

    let document_count = documents.len();
    let id_lookup = build_unique_lookup(
        documents
            .iter()
            .map(|document| (document.id.to_lowercase(), document.id.as_str())),
    );
    let stem_lookup = build_unique_lookup(documents.iter().map(|document| {
        (
            Path::new(&document.id)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_lowercase(),
            document.id.as_str(),
        )
    }));
    let title_lookup = build_unique_lookup(
        documents
            .iter()
            .map(|document| (document.label.to_lowercase(), document.id.as_str())),
    );

    let mut nodes = documents
        .iter()
        .map(|document| WorkspaceGraphNode {
            id: document.id.clone(),
            label: document.label.clone(),
            kind: document.kind,
            relative_path: Some(document.id.clone()),
            degree: 0,
        })
        .collect::<Vec<_>>();
    let mut edges = BTreeMap::<EdgeKey, usize>::new();
    let mut tag_labels = BTreeMap::<String, String>::new();
    let mut property_labels = BTreeMap::<String, String>::new();

    for document in &documents {
        for reference in extract_document_references(&document.raw) {
            let Some(target) = resolve_reference(
                &document.id,
                &reference.value,
                reference.wiki,
                &id_lookup,
                &stem_lookup,
                &title_lookup,
            ) else {
                continue;
            };

            if target == document.id {
                continue;
            }

            let (source, target) = ordered_pair(&document.id, target);
            increment_edge(
                &mut edges,
                EdgeKey {
                    source,
                    target,
                    kind: WorkspaceGraphEdgeKind::Link,
                },
            );
        }

        for tag in &document.tags {
            let normalized = normalize_hub_value(tag);
            if normalized.is_empty() {
                continue;
            }
            let hub_id = format!("tag:{normalized}");
            tag_labels
                .entry(hub_id.clone())
                .or_insert_with(|| tag.clone());
            increment_edge(
                &mut edges,
                EdgeKey {
                    source: document.id.clone(),
                    target: hub_id,
                    kind: WorkspaceGraphEdgeKind::Tag,
                },
            );
        }

        for property in &document.properties {
            let normalized = normalize_hub_value(property);
            if normalized.is_empty() {
                continue;
            }
            let hub_id = format!("property:{normalized}");
            property_labels
                .entry(hub_id.clone())
                .or_insert_with(|| property.clone());
            increment_edge(
                &mut edges,
                EdgeKey {
                    source: document.id.clone(),
                    target: hub_id,
                    kind: WorkspaceGraphEdgeKind::Property,
                },
            );
        }
    }

    if edges.len() > MAX_EDGES {
        push_warning(
            &mut warnings,
            format!("关系数量超过 {MAX_EDGES}，仅保留前 {MAX_EDGES} 条"),
        );
        edges = edges.into_iter().take(MAX_EDGES).collect();
    }

    nodes.extend(
        tag_labels
            .into_iter()
            .map(|(id, label)| WorkspaceGraphNode {
                id,
                label,
                kind: WorkspaceGraphNodeKind::Tag,
                relative_path: None,
                degree: 0,
            }),
    );
    nodes.extend(
        property_labels
            .into_iter()
            .map(|(id, label)| WorkspaceGraphNode {
                id,
                label,
                kind: WorkspaceGraphNodeKind::Property,
                relative_path: None,
                degree: 0,
            }),
    );

    let mut degree = BTreeMap::<String, usize>::new();
    let graph_edges = edges
        .into_iter()
        .enumerate()
        .map(|(index, (key, weight))| {
            *degree.entry(key.source.clone()).or_default() += weight;
            *degree.entry(key.target.clone()).or_default() += weight;
            WorkspaceGraphEdge {
                id: format!("edge:{index}"),
                source: key.source,
                target: key.target,
                kind: key.kind,
                weight,
            }
        })
        .collect::<Vec<_>>();

    for node in &mut nodes {
        node.degree = degree.get(&node.id).copied().unwrap_or_default();
    }
    nodes.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| right.degree.cmp(&left.degree))
            .then_with(|| left.label.to_lowercase().cmp(&right.label.to_lowercase()))
    });

    Ok(WorkspaceGraphSnapshot {
        nodes,
        edges: graph_edges,
        document_count,
        warnings,
    })
}

fn canonical_workspace_root(root_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|_| "工作区路径不存在".to_string())?;
    if !root.is_dir() {
        return Err("工作区路径不是文件夹".to_string());
    }
    Ok(root)
}

fn collect_documents(
    root: &Path,
    directory: &Path,
    documents: &mut Vec<ParsedDocument>,
    warnings: &mut Vec<String>,
) -> std::io::Result<()> {
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if documents.len() >= MAX_DOCUMENTS {
            if !warnings
                .iter()
                .any(|warning| warning.contains("文档数量超过"))
            {
                push_warning(
                    warnings,
                    format!("文档数量超过 {MAX_DOCUMENTS}，仅索引前 {MAX_DOCUMENTS} 篇"),
                );
            }
            return Ok(());
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip_entry(&name) {
            continue;
        }
        if entry.file_type()?.is_symlink() {
            continue;
        }
        if path.is_dir() {
            collect_documents(root, &path, documents, warnings)?;
            continue;
        }
        if !is_markdown_document_file(&path) {
            continue;
        }

        let relative_path = to_relative_path(root, &path);
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => {
                push_warning(warnings, format!("无法读取文档信息：{relative_path}"));
                continue;
            }
        };
        if metadata.len() > MAX_DOCUMENT_BYTES {
            push_warning(
                warnings,
                format!("文档过大，已跳过图谱解析：{relative_path}"),
            );
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(_) => {
                push_warning(
                    warnings,
                    format!("非 UTF-8 文档，已跳过图谱解析：{relative_path}"),
                );
                continue;
            }
        };
        let frontmatter = parse_frontmatter(&raw);
        let label = frontmatter
            .as_ref()
            .and_then(|fields| fields.get("title"))
            .and_then(|values| values.first())
            .map(|value| unquote(value))
            .filter(|value| !value.is_empty())
            .or_else(|| markdown_heading_title(&raw))
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or("未命名文档")
                    .to_string()
            });
        let tags = frontmatter
            .as_ref()
            .and_then(|fields| fields.get("tags"))
            .cloned()
            .unwrap_or_default();
        let properties = frontmatter
            .as_ref()
            .map(|fields| {
                fields
                    .keys()
                    .filter(|key| !is_system_property(key))
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        documents.push(ParsedDocument {
            id: relative_path.clone(),
            label,
            kind: classify_document(&relative_path),
            raw,
            tags,
            properties,
        });
    }

    Ok(())
}

fn should_skip_entry(name: &str) -> bool {
    matches!(
        name,
        ".madora" | ".git" | "node_modules" | "target" | "dist" | "build"
    )
}

fn push_warning(warnings: &mut Vec<String>, warning: String) {
    if warnings.len() < MAX_WARNINGS {
        warnings.push(warning);
    }
}

fn is_markdown_document_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "mdx"))
        .unwrap_or(false)
}

fn to_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn classify_document(relative_path: &str) -> WorkspaceGraphNodeKind {
    let normalized = relative_path.to_lowercase();
    if normalized.starts_with("daily/") {
        WorkspaceGraphNodeKind::Daily
    } else if normalized.starts_with("weekly/") {
        WorkspaceGraphNodeKind::Weekly
    } else {
        WorkspaceGraphNodeKind::Note
    }
}

fn parse_frontmatter(raw: &str) -> Option<BTreeMap<String, Vec<String>>> {
    let mut lines = raw.lines();
    if lines.next()?.trim_end_matches('\r') != "---" {
        return None;
    }

    let mut fields = BTreeMap::<String, Vec<String>>::new();
    let mut current_list_key: Option<String> = None;
    for line in lines {
        let line = line.trim_end_matches('\r');
        if line == "---" {
            return Some(fields);
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            if let (Some(key), Some(value)) = (
                current_list_key.as_ref(),
                line.trim().strip_prefix('-').map(str::trim),
            ) {
                let value = unquote(value);
                if !value.is_empty() {
                    fields.entry(key.clone()).or_default().push(value);
                }
            }
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            current_list_key = None;
            continue;
        };
        let key = key.trim().to_string();
        if key.is_empty() {
            current_list_key = None;
            continue;
        }
        let value = value.trim();
        if value.is_empty() {
            fields.entry(key.clone()).or_default();
            current_list_key = Some(key);
            continue;
        }
        current_list_key = None;
        let values = parse_frontmatter_values(value);
        fields.entry(key).or_default().extend(values);
    }

    None
}

fn parse_frontmatter_values(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return trimmed[1..trimmed.len() - 1]
            .split(',')
            .map(unquote)
            .filter(|value| !value.is_empty())
            .collect();
    }
    let value = unquote(trimmed);
    (!value.is_empty()).then_some(value).into_iter().collect()
}

fn unquote(value: &str) -> String {
    value
        .trim()
        .trim_matches(|character| character == '"' || character == '\'')
        .trim()
        .to_string()
}

fn is_system_property(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "title" | "tags" | "createdat" | "updatedat" | "refinexdialect" | "aliases"
    )
}

fn markdown_heading_title(raw: &str) -> Option<String> {
    raw.lines()
        .take(120)
        .map(str::trim)
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|title| !title.is_empty())
        .map(ToString::to_string)
}

#[derive(Debug, PartialEq, Eq)]
struct DocumentReference {
    value: String,
    wiki: bool,
}

fn extract_document_references(raw: &str) -> Vec<DocumentReference> {
    let mut references = Vec::new();
    let mut cursor = 0;
    while let Some(offset) = raw[cursor..].find("](") {
        let start = cursor + offset + 2;
        let Some(end_offset) = raw[start..].find(')') else {
            break;
        };
        let end = start + end_offset;
        let destination = markdown_destination(&raw[start..end]);
        if !destination.is_empty() && is_markdown_reference(&destination) {
            references.push(DocumentReference {
                value: destination,
                wiki: false,
            });
        }
        cursor = end + 1;
    }

    cursor = 0;
    while let Some(offset) = raw[cursor..].find("[[") {
        let start = cursor + offset + 2;
        let Some(end_offset) = raw[start..].find("]]") else {
            break;
        };
        let end = start + end_offset;
        let target = raw[start..end].split('|').next().unwrap_or_default().trim();
        if !target.is_empty() {
            references.push(DocumentReference {
                value: target.to_string(),
                wiki: true,
            });
        }
        cursor = end + 2;
    }

    references
}

fn markdown_destination(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(rest) = trimmed.strip_prefix('<') {
        return rest
            .split_once('>')
            .map(|(destination, _)| destination)
            .unwrap_or(rest)
            .trim()
            .to_string();
    }
    trimmed
        .split_ascii_whitespace()
        .next()
        .unwrap_or_default()
        .to_string()
}

fn is_markdown_reference(value: &str) -> bool {
    let path = value
        .split(['#', '?'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    (path.ends_with(".md") || path.ends_with(".mdx"))
        && !path.contains("://")
        && !path.starts_with("mailto:")
}

fn build_unique_lookup<'a>(
    values: impl Iterator<Item = (String, &'a str)>,
) -> BTreeMap<String, Option<String>> {
    let mut lookup = BTreeMap::<String, Option<String>>::new();
    for (key, id) in values {
        lookup
            .entry(key)
            .and_modify(|existing| *existing = None)
            .or_insert_with(|| Some(id.to_string()));
    }
    lookup
}

fn resolve_reference(
    source_id: &str,
    raw_target: &str,
    wiki: bool,
    id_lookup: &BTreeMap<String, Option<String>>,
    stem_lookup: &BTreeMap<String, Option<String>>,
    title_lookup: &BTreeMap<String, Option<String>>,
) -> Option<String> {
    let target = percent_decode(
        raw_target
            .split(['#', '?'])
            .next()
            .unwrap_or_default()
            .trim()
            .trim_matches('<')
            .trim_matches('>'),
    );
    if target.is_empty() || target.contains("://") || target.starts_with("mailto:") {
        return None;
    }

    let source_parent = source_id
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let joined = if target.starts_with('/') {
        normalize_relative_path(target.trim_start_matches('/'))
    } else {
        normalize_relative_path(&format!("{source_parent}/{target}"))
    };
    let mut candidates = vec![joined, normalize_relative_path(&target)];
    if wiki && Path::new(&target).extension().is_none() {
        let current = candidates.clone();
        for candidate in current {
            candidates.push(format!("{candidate}.md"));
            candidates.push(format!("{candidate}.mdx"));
        }
    }
    for candidate in candidates {
        if let Some(Some(id)) = id_lookup.get(&candidate.to_lowercase()) {
            return Some(id.clone());
        }
    }
    if wiki {
        let lookup_key = Path::new(&target)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or(&target)
            .to_lowercase();
        if let Some(Some(id)) = stem_lookup.get(&lookup_key) {
            return Some(id.clone());
        }
        if let Some(Some(id)) = title_lookup.get(&target.to_lowercase()) {
            return Some(id.clone());
        }
    }
    None
}

fn normalize_relative_path(value: &str) -> String {
    let normalized = value.replace('\\', "/");
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    parts.join("/")
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                decoded.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn normalize_hub_value(value: &str) -> String {
    value
        .trim()
        .trim_start_matches('#')
        .to_lowercase()
        .replace([' ', '/'], "-")
}

fn ordered_pair(left: &str, right: String) -> (String, String) {
    if left <= right.as_str() {
        (left.to_string(), right)
    } else {
        (right, left.to_string())
    }
}

fn increment_edge(edges: &mut BTreeMap<EdgeKey, usize>, key: EdgeKey) {
    *edges.entry(key).or_default() += 1;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn builds_links_tags_properties_and_document_kinds() {
        let directory = tempdir().expect("创建临时目录失败");
        let root = directory.path();
        fs::create_dir_all(root.join("notes")).expect("创建笔记目录失败");
        fs::create_dir_all(root.join("Daily/2026/08")).expect("创建日记目录失败");
        fs::write(
            root.join("notes/alpha.md"),
            "---\ntitle: Alpha\ntags: [Rust, graph]\nstatus: active\ncreatedAt: 2026-08-01\nrefinexDialect: 1\n---\n\n[Beta](../beta.md) and [[Daily/2026/08/2026-08-01]]",
        )
        .expect("写入 Alpha 失败");
        fs::write(root.join("beta.md"), "# Beta\n\n[[Alpha]]").expect("写入 Beta 失败");
        fs::write(root.join("Daily/2026/08/2026-08-01.md"), "# Today").expect("写入日记失败");

        let graph = load_workspace_graph_sync(root.to_str().unwrap()).expect("构建图谱失败");

        assert_eq!(graph.document_count, 3);
        assert!(graph.nodes.iter().any(|node| {
            node.id == "notes/alpha.md"
                && node.label == "Alpha"
                && node.kind == WorkspaceGraphNodeKind::Note
        }));
        assert!(graph.nodes.iter().any(|node| {
            node.id == "Daily/2026/08/2026-08-01.md" && node.kind == WorkspaceGraphNodeKind::Daily
        }));
        assert!(graph.nodes.iter().any(|node| node.id == "tag:rust"));
        assert!(graph.nodes.iter().any(|node| node.id == "tag:graph"));
        assert!(graph.nodes.iter().any(|node| node.id == "property:status"));
        assert!(!graph
            .nodes
            .iter()
            .any(|node| node.id == "property:createdat"));
        assert!(!graph
            .nodes
            .iter()
            .any(|node| node.id == "property:refinexdialect"));
        assert!(graph.edges.iter().any(|edge| {
            edge.kind == WorkspaceGraphEdgeKind::Link
                && ((edge.source == "beta.md" && edge.target == "notes/alpha.md")
                    || (edge.source == "notes/alpha.md" && edge.target == "beta.md"))
        }));
        assert!(graph.edges.iter().any(|edge| {
            edge.kind == WorkspaceGraphEdgeKind::Link
                && edge.target == "notes/alpha.md"
                && edge.weight == 2
        }));
    }

    #[test]
    fn parses_multiline_tags_and_ignores_private_directories() {
        let directory = tempdir().expect("创建临时目录失败");
        let root = directory.path();
        fs::create_dir_all(root.join(".madora")).expect("创建私有目录失败");
        fs::write(
            root.join("note.md"),
            "---\ntags:\n  - Knowledge Base\n  - '中文'\nowner: refinex\n---\n# Note",
        )
        .expect("写入笔记失败");
        fs::write(root.join(".madora/private.md"), "# Private").expect("写入私有笔记失败");

        let graph = load_workspace_graph_sync(root.to_str().unwrap()).expect("构建图谱失败");

        assert_eq!(graph.document_count, 1);
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == "tag:knowledge-base"));
        assert!(graph.nodes.iter().any(|node| node.id == "tag:中文"));
        assert!(graph.nodes.iter().any(|node| node.id == "property:owner"));
    }

    #[test]
    fn resolves_percent_encoded_markdown_paths() {
        let directory = tempdir().expect("创建临时目录失败");
        let root = directory.path();
        fs::create_dir_all(root.join("folder")).expect("创建目录失败");
        fs::write(root.join("folder/中文 笔记.md"), "# 中文笔记").expect("写入目标笔记失败");
        fs::write(
            root.join("source.md"),
            "[target](folder/%E4%B8%AD%E6%96%87%20%E7%AC%94%E8%AE%B0.md)",
        )
        .expect("写入来源笔记失败");

        let graph = load_workspace_graph_sync(root.to_str().unwrap()).expect("构建图谱失败");
        assert_eq!(
            graph
                .edges
                .iter()
                .filter(|edge| edge.kind == WorkspaceGraphEdgeKind::Link)
                .count(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn skips_symlinks_that_could_leave_the_workspace() {
        use std::os::unix::fs::symlink;

        let directory = tempdir().expect("创建工作区失败");
        let external = tempdir().expect("创建外部目录失败");
        fs::write(directory.path().join("inside.md"), "# Inside").expect("写入工作区笔记失败");
        fs::write(external.path().join("outside.md"), "# Outside").expect("写入外部笔记失败");
        symlink(external.path(), directory.path().join("linked")).expect("创建目录软链接失败");

        let graph =
            load_workspace_graph_sync(directory.path().to_str().unwrap()).expect("构建图谱失败");

        assert_eq!(graph.document_count, 1);
        assert!(graph.nodes.iter().any(|node| node.id == "inside.md"));
        assert!(!graph.nodes.iter().any(|node| node.id.contains("outside")));
    }
}

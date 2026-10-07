use super::*;
use sha2::{Digest, Sha256};
use std::sync::MutexGuard;

static TREE_OPERATIONS: Mutex<()> = Mutex::new(());
static UNDO: OnceLock<Mutex<Vec<UndoMove>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TreeSortMode {
    #[default]
    Manual,
    NameAsc,
    NameDesc,
    CreatedAsc,
    CreatedDesc,
    ModifiedAsc,
    ModifiedDesc,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TreeSortPolicy {
    pub mode: TreeSortMode,
    pub folders_first: bool,
}
impl Default for TreeSortPolicy {
    fn default() -> Self {
        Self {
            mode: TreeSortMode::Manual,
            folders_first: true,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TreeSortPreferences {
    #[serde(default)]
    pub default: TreeSortPolicy,
    #[serde(default)]
    pub folders: BTreeMap<String, TreeSortPolicy>,
}
impl TreeSortPreferences {
    fn effective(&self, path: &str) -> &TreeSortPolicy {
        let mut scope = path;
        loop {
            if let Some(policy) = self.folders.get(scope) {
                return policy;
            }
            if scope.is_empty() {
                return &self.default;
            }
            scope = scope.rsplit_once('/').map_or("", |(parent, _)| parent);
        }
    }
}

pub(super) fn operation_guard() -> Result<MutexGuard<'static, ()>, String> {
    TREE_OPERATIONS
        .lock()
        .map_err(|_| "目录树操作状态不可用".into())
}

pub(super) fn new_workspace_sort_order() -> serde_json::Map<String, Value> {
    let mut order = WorkspaceSortOrder::default();
    order.preferences.default.mode = TreeSortMode::NameAsc;
    serde_json::to_value(order)
        .unwrap()
        .as_object()
        .unwrap()
        .clone()
}

pub(super) fn rewrite_preferences(preferences: &mut TreeSortPreferences, old: &str, new: &str) {
    preferences.folders = std::mem::take(&mut preferences.folders)
        .into_iter()
        .map(|(path, policy)| (rewrite_relative_prefix(&path, old, new), policy))
        .collect();
}

// Resolve both neighbors after removing the source; an anchor is not a rank boundary. author: refinex
pub(super) fn insertion_neighbors(
    root: &Path,
    parent: &Path,
    moved: &str,
    before: Option<&Path>,
    after: Option<&Path>,
    order: &WorkspaceSortOrder,
) -> Result<(Option<String>, Option<String>), String> {
    if before.is_some() && after.is_some() {
        return Err("只能指定一个插入位置".into());
    }
    let parent_path = to_relative_path(root, parent);
    let mut entries = read_sortable_child_entries(root, parent).map_err(|_| "无法读取目标目录")?;
    entries.retain(|entry| entry.relative_path != moved);
    entries.sort_by(|a, b| compare_sortable_child_entries(&parent_path, a, b, order));
    let index = if let Some(anchor) = before.or(after) {
        let anchor = to_relative_path(root, anchor);
        entries
            .iter()
            .position(|entry| entry.relative_path == anchor)
            .ok_or("目标位置已改变，请重新拖动")?
            + usize::from(after.is_some())
    } else {
        entries.len()
    };
    Ok((
        index
            .checked_sub(1)
            .map(|i| entries[i].relative_path.clone()),
        entries.get(index).map(|entry| entry.relative_path.clone()),
    ))
}

pub(super) fn set_sort(
    root_path: String,
    parent_path: String,
    policy: Option<TreeSortPolicy>,
    visible_orders: Vec<Vec<String>>,
) -> Result<WorkspaceSnapshot, String> {
    let _guard = operation_guard()?;
    let root = canonical_workspace_root(&root_path)?;
    let parent = resolve_workspace_directory_for_move(&root, &parent_path)?;
    let relative = to_relative_path(&root, &parent);
    let (mut metadata, old) = read_metadata_for_move(&root)?;
    let mut order = read_sort_order(&metadata);
    if relative.is_empty() {
        order.preferences.default = policy.ok_or("工作区必须有默认排序方式")?;
    } else if let Some(policy) = policy {
        order.preferences.folders.insert(relative.clone(), policy);
    } else {
        order.preferences.folders.remove(&relative);
    }
    if visible_orders.iter().map(Vec::len).sum::<usize>() > 50_000 {
        return Err("目录树过大，无法保存排序".into());
    }
    // Capture the displayed order only on the first transition to manual. author: refinex
    for paths in visible_orders.iter().filter(|paths| !paths.is_empty()) {
        let nodes = paths
            .iter()
            .map(|p| resolve_workspace_node_for_move(&root, p).map(|v| v.0))
            .collect::<Result<Vec<_>, _>>()?;
        let scope = nodes[0].parent().ok_or("无法读取父目录")?;
        if !scope.starts_with(&parent) || nodes.iter().any(|p| p.parent() != Some(scope)) {
            return Err("排序节点必须属于同一受影响目录".into());
        }
        let scope_relative = to_relative_path(&root, scope);
        if order.preferences.effective(&scope_relative).mode != TreeSortMode::Manual {
            continue;
        }
        let entries = read_sortable_child_entries(&root, scope).map_err(|_| "无法读取排序目录")?;
        let expected = entries
            .iter()
            .map(|e| e.relative_path.clone())
            .collect::<BTreeSet<_>>();
        let supplied = nodes
            .iter()
            .map(|p| to_relative_path(&root, p))
            .collect::<BTreeSet<_>>();
        if expected != supplied || supplied.len() != nodes.len() {
            return Err("目录内容已改变，请刷新后重试".into());
        }
        if entries.iter().any(|e| {
            order
                .nodes
                .get(&e.relative_path)
                .is_some_and(|r| r.parent_path == scope_relative)
        }) {
            continue;
        }
        for (index, node) in nodes.iter().enumerate() {
            order.nodes.insert(
                to_relative_path(&root, node),
                WorkspaceSortRecord {
                    parent_path: scope_relative.clone(),
                    rank: (index as i64 + 1) * SORT_ORDER_STEP,
                },
            );
        }
    }
    write_sort_order(&mut metadata, &order).map_err(|_| "无法生成排序设置")?;
    let change = metadata_move_change(&root, old, &metadata)?;
    crate::document_links::apply_metadata_change(change)?;
    build_workspace_snapshot(&root).map_err(|_| "排序已保存，但无法刷新目录树".into())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreePathChange {
    pub old_path: String,
    pub new_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeMoveResult {
    pub snapshot: WorkspaceSnapshot,
    pub changes: Vec<TreePathChange>,
    pub undo_token: Option<String>,
    pub error: Option<String>,
}
struct UndoMove {
    token: String,
    root: PathBuf,
    changes: Vec<TreePathChange>,
    before_sort: serde_json::Map<String, Value>,
    after_sort: serde_json::Map<String, Value>,
    fingerprints: Vec<String>,
}

// Fingerprint every moved entry without following links; keep the undo guard bounded. author: refinex
fn fingerprint(path: &Path) -> Result<String, String> {
    fn visit(
        path: &Path,
        hash: &mut Sha256,
        count: &mut usize,
        bytes: &mut u64,
        depth: usize,
    ) -> Result<(), String> {
        *count += 1;
        if *count > 100_000 || depth > 64 {
            return Err("目录过大，无法记录安全撤销".into());
        }
        let metadata = fs::symlink_metadata(path).map_err(|_| "移动的项目已不存在")?;
        hash.update(metadata.len().to_le_bytes());
        hash.update(
            metadata
                .modified()
                .map(system_time_to_millis)
                .unwrap_or(0)
                .to_le_bytes(),
        );
        if metadata.file_type().is_symlink() {
            hash.update(
                fs::read_link(path)
                    .map_err(|_| "无法验证符号链接")?
                    .to_string_lossy()
                    .as_bytes(),
            );
        } else if metadata.is_dir() {
            let mut entries = fs::read_dir(path)
                .map_err(|_| "无法验证移动目录")?
                .map(|entry| entry.map(|e| e.path()))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "无法验证移动目录")?;
            entries.sort();
            for entry in entries {
                hash.update(
                    entry
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .as_bytes(),
                );
                visit(&entry, hash, count, bytes, depth + 1)?;
            }
        } else if metadata.is_file() {
            *bytes = bytes.saturating_add(metadata.len());
            if *bytes > 128 * 1024 * 1024 {
                return Err("移动内容超过 128 MiB，无法记录安全撤销".into());
            }
            let mut file = fs::File::open(path).map_err(|_| "无法验证移动文件")?;
            let mut buffer = [0; 65536];
            loop {
                let read = file.read(&mut buffer).map_err(|_| "无法验证移动文件")?;
                if read == 0 {
                    break;
                }
                hash.update(&buffer[..read]);
            }
        }
        Ok(())
    }
    let mut hash = Sha256::new();
    visit(path, &mut hash, &mut 0, &mut 0, 0)?;
    Ok(format!("{:x}", hash.finalize()))
}

pub(super) fn move_nodes(
    root_path: String,
    node_paths: Vec<String>,
    target_parent_path: String,
    before_path: Option<String>,
    after_path: Option<String>,
) -> Result<WorkspaceTreeMoveResult, String> {
    let _guard = operation_guard()?;
    let root = canonical_workspace_root(&root_path)?;
    if node_paths.is_empty() || node_paths.len() > 100 {
        return Err("每次可移动 1 至 100 个项目".into());
    }
    if before_path.is_some() && after_path.is_some() {
        return Err("只能指定一个插入位置".into());
    }
    let parent = resolve_workspace_directory_for_move(&root, &target_parent_path)?;
    let resolved = node_paths
        .iter()
        .map(|p| resolve_workspace_node_for_move(&root, p).map(|v| v.0))
        .collect::<Result<Vec<_>, _>>()?;
    let mut sources = Vec::new();
    for source in &resolved {
        if !sources.contains(source)
            && !resolved
                .iter()
                .any(|p| p != source && source.starts_with(p))
        {
            sources.push(source.clone());
        }
    }
    let before = resolve_optional_workspace_node_for_move(&root, before_path.as_deref())?;
    let after = resolve_optional_workspace_node_for_move(&root, after_path.as_deref())?;
    for anchor in [&before, &after] {
        validate_move_sibling_parent(&parent, anchor.as_deref())?;
        if anchor.as_ref().is_some_and(|p| sources.contains(p)) {
            return Err("不能放置到所选项目自身".into());
        }
    }
    let (metadata, _) = read_metadata_for_move(&root)?;
    let order = read_sort_order(&metadata);
    if (before.is_some() || after.is_some())
        && order
            .preferences
            .effective(&to_relative_path(&root, &parent))
            .mode
            != TreeSortMode::Manual
    {
        return Err("此目录正在自动排序，请先切换为手动排序".into());
    }
    let mut destinations = BTreeSet::new();
    for source in &sources {
        if parent.starts_with(source) {
            return Err("不能将目录移动到自身或其子目录内".into());
        }
        let destination = parent.join(source.file_name().ok_or("无法读取名称")?);
        if !destinations.insert(destination.clone())
            || (destination.exists() && destination != *source)
        {
            return Err("目标位置已存在同名项目".into());
        }
        // Reordering only changes workspace metadata, including for locked documents. author: refinex
        if destination != *source {
            if source.is_dir() {
                let paths = crate::document_links::collect_documents(source)?;
                validate_documents_writable(
                    &root,
                    &paths.iter().map(PathBuf::as_path).collect::<Vec<_>>(),
                )?;
            } else {
                validate_documents_writable(&root, &[source.as_path()])?;
            }
        }
    }
    let before_sort = metadata.sort_order.clone();
    let mut changes = Vec::new();
    let mut error = None;
    let mut next_after = after_path;
    let mut next_before = before_path;
    for source in sources {
        let destination = parent.join(source.file_name().unwrap());
        match move_workspace_node_inner(
            root_path.clone(),
            source.to_string_lossy().into(),
            target_parent_path.clone(),
            next_before.clone(),
            next_after.clone(),
        ) {
            Ok(_) => {
                changes.push(TreePathChange {
                    old_path: source.to_string_lossy().into(),
                    new_path: destination.to_string_lossy().into(),
                });
                next_before = None;
                // In automatic mode use append for every item; only manual mode has relative positions. author: refinex
                next_after = if order
                    .preferences
                    .effective(&to_relative_path(&root, &parent))
                    .mode
                    == TreeSortMode::Manual
                {
                    Some(destination.to_string_lossy().into())
                } else {
                    None
                };
            }
            Err(message) => {
                error = Some(message);
                break;
            }
        }
    }
    let snapshot =
        build_workspace_snapshot(&root).map_err(|_| "移动后无法刷新目录树，请手动刷新")?;
    let after_sort = read_metadata_for_move(&root)?.0.sort_order;
    let mut undo_token = None;
    if !changes.is_empty() {
        match changes
            .iter()
            .map(|c| {
                if c.old_path == c.new_path {
                    Ok(String::new())
                } else {
                    fingerprint(Path::new(&c.new_path))
                }
            })
            .collect::<Result<Vec<_>, _>>()
        {
            Ok(fingerprints) => {
                let token = uuid::Uuid::new_v4().to_string();
                let mut history = UNDO
                    .get_or_init(|| Mutex::new(Vec::new()))
                    .lock()
                    .map_err(|_| "撤销状态不可用")?;
                history.retain(|entry| entry.root == root);
                if history.len() >= 20 {
                    history.remove(0);
                }
                history.push(UndoMove {
                    token: token.clone(),
                    root,
                    changes: changes.clone(),
                    before_sort,
                    after_sort,
                    fingerprints,
                });
                undo_token = Some(token);
            }
            Err(message) => error = Some(format!("项目已移动，但无法提供安全撤销：{message}")),
        }
    }
    Ok(WorkspaceTreeMoveResult {
        snapshot,
        changes,
        undo_token,
        error,
    })
}

pub(super) fn undo_move(
    root_path: String,
    token: String,
) -> Result<WorkspaceTreeMoveResult, String> {
    let _guard = operation_guard()?;
    let root = canonical_workspace_root(&root_path)?;
    let mut history = UNDO
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .map_err(|_| "撤销状态不可用")?;
    let entry = history
        .last()
        .filter(|e| e.root == root && e.token == token)
        .ok_or("此移动已不能撤销，请使用“移动到…”")?;
    let (mut metadata, _) = read_metadata_for_move(&root)?;
    if metadata.sort_order != entry.after_sort {
        return Err("目录顺序已改变，无法安全撤销，请手动移动".into());
    }
    for (change, expected) in entry.changes.iter().zip(&entry.fingerprints) {
        if change.old_path != change.new_path
            && fingerprint(Path::new(&change.new_path))? != *expected
        {
            return Err("移动后的内容已改变，无法安全撤销，请手动移动".into());
        }
        if change.new_path != change.old_path && Path::new(&change.old_path).exists() {
            return Err("原位置已存在同名项目，无法撤销".into());
        }
    }
    let mut changes = Vec::new();
    let mut error = None;
    for change in entry.changes.iter().rev() {
        let old = Path::new(&change.old_path);
        match move_workspace_node_inner(
            root_path.clone(),
            change.new_path.clone(),
            old.parent()
                .ok_or("原目录已不存在")?
                .to_string_lossy()
                .into(),
            None,
            None,
        ) {
            Ok(_) => changes.push(TreePathChange {
                old_path: change.new_path.clone(),
                new_path: change.old_path.clone(),
            }),
            Err(message) => {
                error = Some(format!("部分项目未能撤销：{message}"));
                break;
            }
        }
    }
    if error.is_none() {
        let (latest, raw) = read_metadata_for_move(&root)?;
        metadata = latest;
        metadata.sort_order = entry.before_sort.clone();
        if let Err(message) = crate::document_links::apply_metadata_change(metadata_move_change(
            &root, raw, &metadata,
        )?) {
            error = Some(format!("路径已恢复，但排序恢复失败：{message}"));
        }
    }
    history.pop();
    let snapshot = build_workspace_snapshot(&root).map_err(|_| "撤销后无法刷新目录树")?;
    Ok(WorkspaceTreeMoveResult {
        snapshot,
        changes,
        undo_token: None,
        error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    static SCENARIOS: Mutex<()> = Mutex::new(());
    fn setup(names: &[&str]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for name in names {
            fs::write(dir.path().join(name), format!("# {name}\n")).unwrap();
        }
        let mut metadata = ensure_workspace_metadata(dir.path()).unwrap();
        let mut order = WorkspaceSortOrder::default();
        for (index, name) in names.iter().enumerate() {
            order.nodes.insert(
                name.to_string(),
                WorkspaceSortRecord {
                    parent_path: String::new(),
                    rank: (index as i64 + 1) * SORT_ORDER_STEP,
                },
            );
        }
        write_sort_order(&mut metadata, &order).unwrap();
        write_workspace_metadata(dir.path(), &metadata).unwrap();
        dir
    }
    fn paths(snapshot: &WorkspaceSnapshot) -> Vec<String> {
        snapshot.nodes.iter().map(|n| n.name.clone()).collect()
    }
    #[test]
    fn every_middle_insertion_matches_a_reference_list() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let names = ["a.md", "b.md", "c.md", "d.md", "e.md"];
        for source in 0..names.len() {
            for anchor in 0..names.len() {
                for before in [true, false] {
                    if source == anchor {
                        continue;
                    }
                    let dir = setup(&names);
                    let root = dir.path().to_string_lossy().to_string();
                    let target = dir.path().join(names[anchor]).to_string_lossy().to_string();
                    let result = move_workspace_node_sync(
                        root.clone(),
                        dir.path().join(names[source]).to_string_lossy().to_string(),
                        root,
                        if before { Some(target.clone()) } else { None },
                        if before { None } else { Some(target) },
                    )
                    .unwrap();
                    let mut expected = names
                        .iter()
                        .filter(|n| **n != names[source])
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>();
                    let position = expected.iter().position(|n| n == names[anchor]).unwrap()
                        + usize::from(!before);
                    expected.insert(position, names[source].into());
                    assert_eq!(
                        paths(&result),
                        expected,
                        "source={source}, anchor={anchor}, before={before}"
                    );
                    assert_eq!(
                        paths(&build_workspace_snapshot(dir.path()).unwrap()),
                        expected
                    );
                }
            }
        }
    }
    #[test]
    fn batch_keeps_order_and_undo_restores_links_and_manual_order() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["a.md", "b.md", "c.md"]);
        let root = dir.path().to_string_lossy().to_string();
        fs::create_dir(dir.path().join("destination")).unwrap();
        fs::write(dir.path().join("c.md"), "[A](a.md)\n[B](b.md)\n").unwrap();
        let result = move_nodes(
            root.clone(),
            vec![
                dir.path().join("b.md").to_string_lossy().into(),
                dir.path().join("a.md").to_string_lossy().into(),
            ],
            dir.path().join("destination").to_string_lossy().into(),
            None,
            None,
        )
        .unwrap();
        assert!(result.error.is_none());
        let children = result
            .snapshot
            .nodes
            .iter()
            .find(|n| n.name == "destination")
            .unwrap()
            .children
            .as_ref()
            .unwrap();
        assert_eq!(
            children.iter().map(|n| n.name.as_str()).collect::<Vec<_>>(),
            ["b.md", "a.md"]
        );
        assert!(fs::read_to_string(dir.path().join("c.md"))
            .unwrap()
            .contains("destination/a.md"));
        let restored = undo_move(root, result.undo_token.unwrap()).unwrap();
        assert!(restored.error.is_none());
        assert_eq!(&paths(&restored.snapshot)[..3], ["a.md", "b.md", "c.md"]);
        assert_eq!(
            fs::read_to_string(dir.path().join("c.md")).unwrap(),
            "[A](a.md)\n[B](b.md)\n"
        );
    }
    #[test]
    fn preflight_conflicts_leave_entire_selection_untouched() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["a.md", "b.md"]);
        let root = dir.path().to_string_lossy().to_string();
        fs::create_dir(dir.path().join("destination")).unwrap();
        fs::write(dir.path().join("destination/b.md"), "existing").unwrap();
        assert!(move_nodes(
            root,
            vec![
                dir.path().join("a.md").to_string_lossy().into(),
                dir.path().join("b.md").to_string_lossy().into()
            ],
            dir.path().join("destination").to_string_lossy().into(),
            None,
            None
        )
        .is_err());
        assert!(dir.path().join("a.md").exists());
        assert!(!dir.path().join("destination/a.md").exists());
    }
    #[test]
    fn undo_refuses_changed_content_even_with_same_length() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["a.md"]);
        let root = dir.path().to_string_lossy().to_string();
        fs::create_dir(dir.path().join("destination")).unwrap();
        let result = move_nodes(
            root.clone(),
            vec![dir.path().join("a.md").to_string_lossy().into()],
            dir.path().join("destination").to_string_lossy().into(),
            None,
            None,
        )
        .unwrap();
        fs::write(dir.path().join("destination/a.md"), "edited\n").unwrap();
        assert!(undo_move(root, result.undo_token.unwrap())
            .unwrap_err()
            .contains("内容已改变"));
        assert_eq!(
            fs::read_to_string(dir.path().join("destination/a.md")).unwrap(),
            "edited\n"
        );
    }
    #[test]
    fn captures_first_manual_order_and_preserves_it_across_sort_changes() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "a").unwrap();
        fs::write(dir.path().join("b.md"), "b").unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let visible = vec![vec![
            dir.path().join("b.md").to_string_lossy().into(),
            dir.path().join("a.md").to_string_lossy().into(),
        ]];
        let first = set_sort(
            root.clone(),
            root.clone(),
            Some(TreeSortPolicy::default()),
            visible.clone(),
        )
        .unwrap();
        assert_eq!(paths(&first), ["b.md", "a.md"]);
        set_sort(
            root.clone(),
            root.clone(),
            Some(TreeSortPolicy {
                mode: TreeSortMode::NameAsc,
                folders_first: true,
            }),
            visible.clone(),
        )
        .unwrap();
        let again = set_sort(
            root.clone(),
            root,
            Some(TreeSortPolicy::default()),
            vec![visible[0].iter().rev().cloned().collect()],
        )
        .unwrap();
        assert_eq!(paths(&again), ["b.md", "a.md"]);
    }
    #[test]
    fn folder_rename_and_delete_migrate_sort_preferences_and_ranks() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["b.md", "a.md"]);
        fs::create_dir(dir.path().join("notes")).unwrap();
        fs::write(dir.path().join("notes/child.md"), "# child").unwrap();
        let mut metadata = ensure_workspace_metadata(dir.path()).unwrap();
        let mut order = read_sort_order(&metadata);
        order.nodes.insert(
            "notes".into(),
            WorkspaceSortRecord {
                parent_path: String::new(),
                rank: 3072,
            },
        );
        order.nodes.insert(
            "notes/child.md".into(),
            WorkspaceSortRecord {
                parent_path: "notes".into(),
                rank: 1024,
            },
        );
        order.preferences.folders.insert(
            "notes".into(),
            TreeSortPolicy {
                mode: TreeSortMode::NameDesc,
                folders_first: true,
            },
        );
        write_sort_order(&mut metadata, &order).unwrap();
        write_workspace_metadata(dir.path(), &metadata).unwrap();
        let root = dir.path().to_string_lossy().to_string();
        rename_workspace_node_impl(
            root.clone(),
            dir.path().join("notes").to_string_lossy().into(),
            "renamed".into(),
            true,
        )
        .unwrap();
        let updated = read_sort_order(&ensure_workspace_metadata(dir.path()).unwrap());
        assert_eq!(updated.nodes["renamed"].rank, 3072);
        assert_eq!(updated.nodes["renamed/child.md"].parent_path, "renamed");
        assert_eq!(
            updated.preferences.folders["renamed"].mode,
            TreeSortMode::NameDesc
        );
        assert!(!updated.preferences.folders.contains_key("notes"));
        delete_workspace_node(root, dir.path().join("renamed").to_string_lossy().into()).unwrap();
        let deleted = read_sort_order(&ensure_workspace_metadata(dir.path()).unwrap());
        assert!(!deleted.nodes.keys().any(|p| p.starts_with("renamed")));
        assert!(!deleted.preferences.folders.contains_key("renamed"));
    }

    #[test]
    fn order_only_undo_preserves_subsequent_document_edits() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["a.md", "b.md"]);
        let root = dir.path().to_string_lossy().to_string();
        let result = move_nodes(
            root.clone(),
            vec![dir.path().join("a.md").to_string_lossy().into()],
            root.clone(),
            None,
            Some(dir.path().join("b.md").to_string_lossy().into()),
        )
        .unwrap();
        fs::write(
            dir.path().join("a.md"),
            "# New content
",
        )
        .unwrap();
        let restored = undo_move(root, result.undo_token.unwrap()).unwrap();
        assert_eq!(paths(&restored.snapshot), ["a.md", "b.md"]);
        assert_eq!(
            fs::read_to_string(dir.path().join("a.md")).unwrap(),
            "# New content
"
        );
    }

    #[test]
    fn locked_documents_can_be_reordered_but_not_moved_to_another_directory() {
        let _guard = SCENARIOS.lock().unwrap_or_else(|error| error.into_inner());
        let dir = setup(&["a.md", "b.md"]);
        fs::create_dir(dir.path().join("destination")).unwrap();
        let mut metadata = ensure_workspace_metadata(dir.path()).unwrap();
        metadata.node_state.insert(
            "a.md".into(),
            WorkspaceNodeState {
                locked: true,
                ..WorkspaceNodeState::default()
            },
        );
        write_workspace_metadata(dir.path(), &metadata).unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let source = dir.path().join("a.md").to_string_lossy().to_string();
        let reordered = move_nodes(
            root.clone(),
            vec![source.clone()],
            root.clone(),
            None,
            Some(dir.path().join("b.md").to_string_lossy().into()),
        )
        .unwrap();
        assert_eq!(&paths(&reordered.snapshot)[..2], ["b.md", "a.md"]);
        assert!(move_nodes(
            root,
            vec![source],
            dir.path().join("destination").to_string_lossy().into(),
            None,
            None
        )
        .is_err());
        assert!(dir.path().join("a.md").exists());
    }

    #[test]
    fn appending_past_the_rank_limit_rebalances_without_overflow() {
        let mut order = WorkspaceSortOrder::default();
        order.nodes.insert(
            "a.md".into(),
            WorkspaceSortRecord {
                parent_path: String::new(),
                rank: i64::MAX,
            },
        );
        let rank = assign_rank_with_rebalance(&mut order, "b.md", "", Some("a.md"), None);
        assert_eq!(rank, 2048);
        assert_eq!(order.nodes["a.md"].rank, 1024);
    }

    #[test]
    fn legacy_metadata_remains_manual_and_new_workspaces_use_name_order() {
        assert_eq!(
            read_sort_order(
                &serde_json::from_value(
                    serde_json::json!({"schemaVersion":1,"expandedPaths":[],"sortOrder":{}})
                )
                .unwrap()
            )
            .preferences
            .default
            .mode,
            TreeSortMode::Manual
        );
        assert_eq!(
            read_sort_order(&default_workspace_metadata())
                .preferences
                .default
                .mode,
            TreeSortMode::NameAsc
        );
    }
}

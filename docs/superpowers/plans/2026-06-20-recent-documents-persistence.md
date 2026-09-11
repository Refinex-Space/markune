---
owner: refinex
updated: 2026-09-06
status: deprecated
referenced_by: docs/README.md
---

# 最近文档持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作区空状态的「最近文档」列表（上限 5）持久化到 `.refinex/workspace.json`，使重启应用后仍能恢复。

**Architecture:** 沿用现有 `WorkspaceMetadata` / `ensure_workspace_metadata` 基础设施。Rust 端新增 `recent_document_paths` 字段（`Vec<String>`）和 `record_recent_document` 命令（读-改-写）。前端在 `use-workspace` 加载时通过 `ensureWorkspace` 取初始列表，经 `useWorkspace` 返回值暴露；`workspace-layout` 在打开文档时 fire-and-forget 调用 `recordRecentDocument`。`schemaVersion` 保持 1，旧单数字段 `recent_document_path` 读后即弃。

**Tech Stack:** Rust + Tauri v2（`src-tauri/src/workspace.rs`、`src-tauri/src/lib.rs`）、React + TypeScript + Vitest（`components/workspace/*`）。

**Spec:** `docs/superpowers/specs/2026-06-20-recent-documents-persistence-design.md`

---

## File Structure

| 文件 | 职责 | 操作 |
|---|---|---|
| `src-tauri/src/workspace.rs` | `WorkspaceMetadata` 结构、`record_recent_document` 命令、迁移逻辑、单元测试 | 修改 |
| `src-tauri/src/lib.rs` | 注册新 Tauri 命令 | 修改 |
| `components/workspace/workspace-types.ts` | `WorkspaceMetadata` TS 类型新增 `recentDocumentPaths` | 修改 |
| `components/workspace/workspace-api.ts` | `recordRecentDocument` 封装 | 修改 |
| `components/workspace/use-workspace.ts` | 加载/暴露初始最近文档路径 | 修改 |
| `components/workspace/workspace-layout.tsx` | 启动加载 effect + 写入触发点 + `toRecentDocument` 工具 | 修改 |
| `components/workspace/editor-pane.tsx` | 无（`RecentWorkspaceDocument` 已存在，不变） | — |
| `components/workspace/__tests__/workspace-api.test.ts` | `recordRecentDocument` 调用测试 | 修改 |
| `components/workspace/__tests__/workspace-layout.test.tsx` | mock `ensureWorkspace`/`recordRecentDocument` + 启动加载测试 | 修改 |
| `docs/config/reference.md` | 补充 `recentDocumentPaths` 字段说明 | 修改 |

---

## Task 1: Rust — 扩展 WorkspaceMetadata 与迁移逻辑

**Files:**
- Modify: `src-tauri/src/workspace.rs:39-46`（`WorkspaceMetadata` 结构）
- Modify: `src-tauri/src/workspace.rs:1131-1138`（`default_workspace_metadata`）
- Modify: `src-tauri/src/workspace.rs:1159-1184`（`ensure_workspace_metadata`）

- [ ] **Step 1: 修改 `WorkspaceMetadata` 结构（写测试前的类型基础）**

把 `src-tauri/src/workspace.rs:39-46`：

```rust
#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMetadata {
    pub schema_version: u32,
    pub recent_document_path: Option<String>,
    pub expanded_paths: Vec<String>,
    pub sort_order: serde_json::Map<String, Value>,
}
```

改为：

```rust
#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMetadata {
    pub schema_version: u32,
    #[serde(default, skip_serializing)]
    pub recent_document_path: Option<String>,
    #[serde(default)]
    pub recent_document_paths: Vec<String>,
    pub expanded_paths: Vec<String>,
    pub sort_order: serde_json::Map<String, Value>,
}
```

说明：`recent_document_path` 加 `#[serde(default, skip_serializing)]`——旧文件能读（向后兼容），新写入不含该字段（淘汰）。`recent_document_paths` 用 `#[serde(default)]`，旧文件缺该字段时反序列化为空 `Vec`。

- [ ] **Step 2: 更新 `default_workspace_metadata`**

把 `src-tauri/src/workspace.rs:1131-1138`：

```rust
fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
    }
}
```

改为：

```rust
fn default_workspace_metadata() -> WorkspaceMetadata {
    WorkspaceMetadata {
        schema_version: 1,
        recent_document_path: None,
        recent_document_paths: Vec::new(),
        expanded_paths: Vec::new(),
        sort_order: serde_json::Map::new(),
    }
}
```

- [ ] **Step 3: 在 `ensure_workspace_metadata` 加入就地迁移逻辑**

把 `src-tauri/src/workspace.rs:1171-1183`：

```rust
    let raw = fs::read_to_string(&metadata_path)?;
    match serde_json::from_str::<WorkspaceMetadata>(&raw) {
        Ok(metadata) if metadata.schema_version == 1 => Ok(metadata),
        _ => {
            let backup_path = metadata_dir.join(format!(
                "workspace.corrupt.{}.json",
                unix_timestamp_millis()
            ));
            fs::rename(&metadata_path, backup_path)?;
            let metadata = default_workspace_metadata();
            write_json_pretty(&metadata_path, &metadata)?;
            Ok(metadata)
        }
    }
}
```

改为（在 `Ok(metadata)` 分支返回前做就地规范化）：

```rust
    let raw = fs::read_to_string(&metadata_path)?;
    match serde_json::from_str::<WorkspaceMetadata>(&raw) {
        Ok(mut metadata) if metadata.schema_version == 1 => {
            normalize_recent_document_paths(&mut metadata);
            Ok(metadata)
        }
        _ => {
            let backup_path = metadata_dir.join(format!(
                "workspace.corrupt.{}.json",
                unix_timestamp_millis()
            ));
            fs::rename(&metadata_path, backup_path)?;
            let metadata = default_workspace_metadata();
            write_json_pretty(&metadata_path, &metadata)?;
            Ok(metadata)
        }
    }
}

/// 把旧的 `recentDocumentPath`（单数）迁移进新的 `recentDocumentPaths`（复数）。
/// 仅在内存规范化，不写盘——保持 `ensure_workspace` 只读语义。
fn normalize_recent_document_paths(metadata: &mut WorkspaceMetadata) {
    if !metadata.recent_document_paths.is_empty() {
        return;
    }

    if let Some(single) = metadata.recent_document_path.take() {
        if !single.trim().is_empty() {
            metadata.recent_document_paths.push(single);
        }
    }
}
```

说明：`take()` 把旧字段取出，避免它在内存里残留；但因 `skip_serializing`，即使残留也不会写出。不写盘保持 `ensure_workspace` 只读语义。

- [ ] **Step 4: 编译验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功，无警告（`recent_document_path` 字段仍被读取故无 dead_code 警告）。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/workspace.rs
git commit -m "feat(workspace): 元数据新增 recentDocumentPaths 字段并迁移旧单值"
```

---

## Task 2: Rust — 新增 record_recent_document 命令与测试

**Files:**
- Modify: `src-tauri/src/workspace.rs`（新增命令函数 + 测试）
- Modify: `src-tauri/src/lib.rs:22-76`（注册命令）

- [ ] **Step 1: 写失败的 Rust 测试（新工作区记录）**

在 `src-tauri/src/workspace.rs` 的 `#[cfg(test)] mod tests` 内（例如紧跟 `ensure_workspace_creates_metadata_file` 测试之后，约 line 2019 后）追加：

```rust
    #[test]
    fn record_recent_document_creates_list_for_new_workspace() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let doc = root.join("note.md");
        fs::write(&doc, "# Note\n").expect("写入文档失败");

        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            doc.to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths, vec![doc.to_string_lossy().to_string()]);

        let raw = fs::read_to_string(root.join(".refinex/workspace.json"))
            .expect("读取 workspace.json 失败");
        let value: serde_json::Value =
            serde_json::from_str(&raw).expect("解析 workspace.json 失败");

        assert_eq!(
            value["recentDocumentPaths"],
            serde_json::json!([doc.to_string_lossy().to_string()])
        );
        assert!(value.get("recentDocumentPath").is_none());
    }
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml record_recent_document_creates_list_for_new_workspace`
Expected: 编译失败，错误信息包含 `cannot find function \`record_recent_document\``。

- [ ] **Step 3: 实现 record_recent_document 命令**

在 `src-tauri/src/workspace.rs` 的 `ensure_workspace` 命令之后（约 line 198 之后，即 `pub fn ensure_workspace(...)` 闭合 `}` 之后）插入：

```rust
#[tauri::command]
pub fn record_recent_document(
    root_path: String,
    document_path: String,
) -> Result<Vec<String>, String> {
    let root = canonical_workspace_root(&root_path)?;
    let document = validate_existing_markdown_document_path(&root_path, &document_path)?;
    let absolute_path = document.to_string_lossy().to_string();

    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;
    normalize_recent_document_paths(&mut metadata);

    let mut paths = metadata.recent_document_paths;
    paths.retain(|path| path != &absolute_path);
    paths.insert(0, absolute_path);
    paths.truncate(5);
    metadata.recent_document_paths = paths;

    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存最近文档失败：{error}"))?;

    Ok(metadata.recent_document_paths)
}
```

说明：复用 `validate_existing_markdown_document_path`（workspace.rs:1346）校验存在、工作区内、非 `.refinex`、Markdown。`normalize_recent_document_paths` 先消化旧单值。去重 + 置顶 + 截断 5。

- [ ] **Step 4: 运行测试验证通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml record_recent_document_creates_list_for_new_workspace`
Expected: PASS。

- [ ] **Step 5: 追加去重/置顶/截断测试**

在同一 `#[cfg(test)] mod tests` 内追加：

```rust
    #[test]
    fn record_recent_document_promotes_existing_and_truncates_to_five() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let docs: Vec<PathBuf> = (1..=6)
            .map(|index| root.join(format!("doc-{index}.md")))
            .collect();
        for doc in &docs {
            fs::write(doc, format!("# Doc {}\n", doc.file_name().unwrap().to_string_lossy()))
                .expect("写入文档失败");
        }

        // 先按 1..5 顺序记录，doc-5 最后（最新在前语义下 doc-5 在头部）
        for doc in &docs[0..5] {
            record_recent_document(
                root.to_string_lossy().to_string(),
                doc.to_string_lossy().to_string(),
            )
            .expect("记录最近文档失败");
        }

        // 再次记录 doc-1：应被置顶、去重，长度仍为 5
        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            docs[0].to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths.len(), 5);
        assert_eq!(paths[0], docs[0].to_string_lossy().to_string());
        assert_eq!(paths.iter().filter(|p| *p == &docs[0].to_string_lossy().to_string()).count(), 1);

        // 记录第 6 个不同文档：截断为 5，最旧的 doc-5 被淘汰
        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            docs[5].to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths.len(), 5);
        assert_eq!(paths[0], docs[5].to_string_lossy().to_string());
        assert!(!paths.contains(&docs[4].to_string_lossy().to_string()));
    }
```

- [ ] **Step 6: 运行测试验证通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml record_recent_document_promotes_existing_and_truncates_to_five`
Expected: PASS。

- [ ] **Step 7: 追加旧单值迁移测试**

```rust
    #[test]
    fn ensure_workspace_migrates_legacy_recent_document_path() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let metadata_dir = root.join(".refinex");
        fs::create_dir(&metadata_dir).expect("创建元数据目录失败");
        fs::write(
            metadata_dir.join("workspace.json"),
            r#"{
  "schemaVersion": 1,
  "recentDocumentPath": "/repo/legacy.md",
  "expandedPaths": [],
  "sortOrder": {}
}"#,
        )
        .expect("写入旧元数据失败");

        let metadata = ensure_workspace(temp_dir.path().to_string_lossy().to_string())
            .expect("读取工作区元数据失败");

        assert_eq!(metadata.recent_document_paths, vec!["/repo/legacy.md".to_string()]);
        assert_eq!(metadata.recent_document_path, None);
    }
```

- [ ] **Step 8: 运行测试验证通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ensure_workspace_migrates_legacy_recent_document_path`
Expected: PASS。

- [ ] **Step 9: 追加损坏 metadata 重建测试**

```rust
    #[test]
    fn record_recent_document_rebuilds_corrupt_metadata() {
        let temp_dir = tempfile::tempdir().expect("创建临时目录失败");
        let root = temp_dir.path();
        let metadata_dir = root.join(".refinex");
        fs::create_dir(&metadata_dir).expect("创建元数据目录失败");
        fs::write(metadata_dir.join("workspace.json"), "{ broken")
            .expect("写入损坏元数据失败");
        let doc = root.join("note.md");
        fs::write(&doc, "# Note\n").expect("写入文档失败");

        let paths = record_recent_document(
            root.to_string_lossy().to_string(),
            doc.to_string_lossy().to_string(),
        )
        .expect("记录最近文档失败");

        assert_eq!(paths, vec![doc.to_string_lossy().to_string()]);
    }
```

- [ ] **Step 10: 运行测试验证通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml record_recent_document_rebuilds_corrupt_metadata`
Expected: PASS。

- [ ] **Step 11: 在 lib.rs 注册命令**

把 `src-tauri/src/lib.rs:58` 的 `workspace::ensure_workspace,` 之后插入新行：

将：

```rust
            workspace::ensure_workspace,
            workspace::load_workspace_tree,
```

改为：

```rust
            workspace::ensure_workspace,
            workspace::record_recent_document,
            workspace::load_workspace_tree,
```

- [ ] **Step 12: 编译 + 全量 Rust 测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过（含原有测试，无回归）。

- [ ] **Step 13: Commit**

```bash
git add src-tauri/src/workspace.rs src-tauri/src/lib.rs
git commit -m "feat(workspace): 新增 record_recent_document 命令持久化最近文档"
```

---

## Task 3: 前端 — TS 类型与 API 封装

**Files:**
- Modify: `components/workspace/workspace-types.ts:42-47`（`WorkspaceMetadata`）
- Modify: `components/workspace/workspace-api.ts`（新增 `recordRecentDocument`）
- Test: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: 写失败的 API 测试**

在 `components/workspace/__tests__/workspace-api.test.ts` 顶部 import 区（约 line 55 之前的 import 列表内），把 `recordWorkspaceHistory,` 一行附近加入 `recordRecentDocument,`。

具体：在现有 import 块（line 5-55）中找到：

```ts
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
```

改为：

```ts
  readWorkspaceAssetData,
  recordRecentDocument,
  resolveWorkspaceAsset,
  recordWorkspaceHistory,
```

然后在文件末尾追加测试块：

```ts
describe('workspace-api recent documents', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('invokes record_recent_document with root and document path', async () => {
    invokeMock.mockResolvedValueOnce(['/repo/a.md']);

    const paths = await recordRecentDocument('/repo', '/repo/a.md');

    expect(paths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('record_recent_document', {
      rootPath: '/repo',
      documentPath: '/repo/a.md',
    });
  });

  it('invokes ensure_workspace with root path', async () => {
    invokeMock.mockResolvedValueOnce({
      schemaVersion: 1,
      recentDocumentPaths: ['/repo/a.md'],
      expandedPaths: [],
      sortOrder: {},
    });

    const metadata = await ensureWorkspace('/repo');

    expect(metadata.recentDocumentPaths).toEqual(['/repo/a.md']);
    expect(invokeMock).toHaveBeenLastCalledWith('ensure_workspace', {
      rootPath: '/repo',
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts`
Expected: FAIL，`recordRecentDocument` 未导出；且 `ensureWorkspace` 返回类型缺 `recentDocumentPaths`。

- [ ] **Step 3: 更新 WorkspaceMetadata TS 类型**

把 `components/workspace/workspace-types.ts:42-47`：

```ts
export interface WorkspaceMetadata {
  schemaVersion: 1;
  recentDocumentPath: string | null;
  expandedPaths: string[];
  sortOrder: Record<string, unknown>;
}
```

改为：

```ts
export interface WorkspaceMetadata {
  schemaVersion: 1;
  recentDocumentPaths: string[];
  expandedPaths: string[];
  sortOrder: Record<string, unknown>;
}
```

说明：TS 侧也淘汰单数字段，与 Rust 的 `skip_serializing` 对齐。`recentDocumentPaths` 设为必填——因 `ensureWorkspace` 实测总会返回（Rust 默认空数组）；旧 mock 若返回缺失字段会被 TS 拦截，符合预期。

- [ ] **Step 4: 新增 recordRecentDocument 封装**

在 `components/workspace/workspace-api.ts` 的 `ensureWorkspace` 函数之后（约 line 180 之后）插入：

```ts
export async function recordRecentDocument(
  rootPath: string,
  documentPath: string,
) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<string[]>('record_recent_document', {
    rootPath,
    documentPath,
  });
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts`
Expected: PASS（两个新测试 + 原有测试无回归）。

- [ ] **Step 6: Commit**

```bash
git add components/workspace/workspace-types.ts components/workspace/workspace-api.ts components/workspace/__tests__/workspace-api.test.ts
git commit -m "feat(workspace-api): 新增 recordRecentDocument 与 recentDocumentPaths 类型"
```

---

## Task 4: 前端 — use-workspace 加载并暴露初始最近文档路径

**Files:**
- Modify: `components/workspace/use-workspace.ts:5-24`（import）、`:141-159`（`loadWorkspace`）、`:663-690`（`createWorkspace`）、`:721-763`（返回值）

- [ ] **Step 1: 在 import 区加入 ensureWorkspace 与 recordRecentDocument**

把 `components/workspace/use-workspace.ts:5-24`：

```ts
import {
  createMarkdownDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  moveWorkspaceNode,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  readMarkdownSourceFiles,
  readMarkdownDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
} from './workspace-api';
```

改为（新增 `ensureWorkspace` 和 `recordRecentDocument`）：

```ts
import {
  createMarkdownDocument,
  createWorkspaceRoot,
  createWorkspaceDirectory,
  deleteWorkspaceNode,
  ensureWorkspace,
  getRecentWorkspacePath,
  getWorkspaceHistory,
  loadWorkspaceTree,
  moveWorkspaceNode,
  recordRecentDocument,
  recordWorkspaceHistory,
  removeWorkspaceHistory,
  readMarkdownSourceFiles,
  readMarkdownDocument,
  renameWorkspaceNode,
  saveRecentWorkspacePath,
  saveMarkdownDocument,
  selectMarkdownSourceFiles,
  selectWorkspaceParentDirectory,
  selectWorkspaceRoot,
} from './workspace-api';
```

- [ ] **Step 2: 新增 initialRecentDocumentPaths 状态与 loadWorkspace 加载逻辑**

把 `components/workspace/use-workspace.ts:141-159`：

```ts
  const loadWorkspace = React.useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSnapshot = await loadWorkspaceTree(rootPath);
      setSnapshot(nextSnapshot);
      resetDocumentState();
      saveRecentWorkspacePath(nextSnapshot.rootPath);
      setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
    } catch {
      setError({
        message: '无法读取工作区，请重新选择文件夹。',
        recoverable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [resetDocumentState]);
```

改为：

```ts
  const loadWorkspace = React.useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextSnapshot, metadata] = await Promise.all([
        loadWorkspaceTree(rootPath),
        ensureWorkspace(rootPath).catch(() => null),
      ]);
      setSnapshot(nextSnapshot);
      setInitialRecentDocumentPaths(
        metadata?.recentDocumentPaths ?? [],
      );
      resetDocumentState();
      saveRecentWorkspacePath(nextSnapshot.rootPath);
      setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
    } catch {
      setError({
        message: '无法读取工作区，请重新选择文件夹。',
        recoverable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [resetDocumentState]);
```

并在 `use-workspace.ts` 现有 state 声明区（约 line 76-78 的 `storedWorkspaceHistory` state 附近）追加：

```ts
  const [initialRecentDocumentPaths, setInitialRecentDocumentPaths] =
    React.useState<string[]>([]);
```

说明：`ensureWorkspace` 失败时 `.catch(() => null)` 降级为空列表，不阻塞工作区加载。用 `Promise.all` 并发，不拖慢首屏。

- [ ] **Step 3: createWorkspace 创建后也加载 metadata**

把 `components/workspace/use-workspace.ts:663-690`（`createWorkspace`）中的：

```ts
      try {
        const nextSnapshot = await createWorkspaceRoot(parentPath, workspaceName);

        setSnapshot(nextSnapshot);
        resetDocumentState();
        saveRecentWorkspacePath(nextSnapshot.rootPath);
        setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
      } catch (createWorkspaceError) {
```

改为：

```ts
      try {
        const nextSnapshot = await createWorkspaceRoot(parentPath, workspaceName);
        const metadata = await ensureWorkspace(nextSnapshot.rootPath).catch(
          () => null,
        );

        setSnapshot(nextSnapshot);
        setInitialRecentDocumentPaths(metadata?.recentDocumentPaths ?? []);
        resetDocumentState();
        saveRecentWorkspacePath(nextSnapshot.rootPath);
        setStoredWorkspaceHistory(recordWorkspaceHistory(nextSnapshot));
      } catch (createWorkspaceError) {
```

说明：新工作区 metadata 为空列表是正常的，这里仅为保持两条入口返回值一致。

- [ ] **Step 4: 在返回值中暴露 initialRecentDocumentPaths**

把 `components/workspace/use-workspace.ts:721-763` 的返回对象中找到 `importMarkdownDocuments,` 一行，在其后插入 `initialRecentDocumentPaths,`。

即在：

```ts
    importMarkdownDocuments,
    isLoading,
```

之间插入：

```ts
    importMarkdownDocuments,
    initialRecentDocumentPaths,
    isLoading,
```

- [ ] **Step 5: 运行现有前端测试验证无回归**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 可能因 mock 未提供 `ensureWorkspace`/`recordRecentDocument` 而部分失败——这是预期的，Task 5 会修复 mock。若失败仅限这两个函数相关，视为正常。

Run: `pnpm lint`
Expected: 通过（无未使用 import 警告）。

- [ ] **Step 6: Commit**

```bash
git add components/workspace/use-workspace.ts
git commit -m "feat(workspace): useWorkspace 加载并暴露 initialRecentDocumentPaths"
```

---

## Task 5: 前端 — workspace-layout 接线写入与初始加载

**Files:**
- Modify: `components/workspace/workspace-layout.tsx`（import、`toRecentDocument`、`rememberRecentDocument`、初始化 effect）
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`（mock 适配 + 新测试）

- [ ] **Step 1: 在 workspace-layout mock 列表加入新函数**

在 `components/workspace/__tests__/workspace-layout.test.tsx` 的 import 块（line 5-49）中找到：

```ts
  detectAiAccounts,
```

在其上方加入（按字母序，`detectAiAccounts` 之前）：

```ts
  ensureWorkspace,
  detectAiAccounts,
```

并在 import 块中找到：

```ts
  readAppSettings,
```

在 `readAppSettings` 之前加入：

```ts
  readAppSettings,
  recordRecentDocument,
```

同时，该测试文件目前**未 import** `recordWorkspaceHistory`，而 Step 8 冷启动测试需要它（注入工作区历史以触发冷启动 `loadWorkspace`）。注意：测试文件的 `vi.mock('../workspace-api', ...)` 用了 `...actual` 展开（line 106），未被显式 mock 的函数保留真实实现，所以 `recordWorkspaceHistory` 是真实函数、会真写 localStorage。需在 import 块中加入：

```ts
  recordRecentDocument,
  recordWorkspaceHistory,
```

（紧接 `recordRecentDocument` 之后，二者相邻。）

- [ ] **Step 2: 在 vi.mock('../workspace-api') 中注册 mock**

在 `components/workspace/__tests__/workspace-layout.test.tsx` 的 `vi.mock('../workspace-api', ...)` 块（约 line 102-152）内找到：

```ts
    detectAiAccounts: vi.fn(),
```

在其上方加入：

```ts
    ensureWorkspace: vi.fn(),
    detectAiAccounts: vi.fn(),
```

并找到：

```ts
    readAppSettings: vi.fn(),
```

改为：

```ts
    readAppSettings: vi.fn(),
    recordRecentDocument: vi.fn(),
```

- [ ] **Step 3: 在 mock 引用变量区声明并在全局 beforeEach 配置默认值**

**关键背景**：该测试文件有全局 `beforeEach`（约 line 400-476），且在 beforeEach 内执行 `delete (window as ...).__TAURI_INTERNALS__`（line 402-403），使默认 `isTauriRuntime === false`。因此 `rememberRecentDocument` 里的 `recordRecentDocument` 默认不触发——现有测试不受影响，但需保证一旦测试开启 Tauri runtime，`recordRecentDocument` 有默认返回值不抛错。

首先，在 mock 变量声明区（约 line 154-200，`const detectAiAccountsMock = vi.mocked(detectAiAccounts);` 附近）加入：

```ts
const ensureWorkspaceMock = vi.mocked(ensureWorkspace);
const recordRecentDocumentMock = vi.mocked(recordRecentDocument);
```

（`recordRecentDocumentMock` 放在 `readAppSettingsMock` 声明附近即可。）

然后，在该文件全局 `beforeEach`（line 400-476）的末尾（`saveAppSettingsMock.mockResolvedValue(defaultAppSettings);` 之后，闭合 `});` 之前）追加：

```ts
    ensureWorkspaceMock.mockResolvedValue({
      schemaVersion: 1,
      recentDocumentPaths: [],
      expandedPaths: [],
      sortOrder: {},
    });
    recordRecentDocumentMock.mockResolvedValue([]);
```

并在 beforeEach 的 mockReset 段（约 line 404-446）追加两行 reset：

```ts
    ensureWorkspaceMock.mockReset();
    recordRecentDocumentMock.mockReset();
```

说明：默认空 `recentDocumentPaths` 保证现有「打开→关闭→空状态展示」测试不被注入；默认 `recordRecentDocument` 返回 `[]` 防止启用 Tauri runtime 的测试因未 mock 而抛错。

- [ ] **Step 4: 运行现有布局测试验证 mock 适配**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 现有测试全部通过（含 line 1540 的 `shows a capped recent document list`）。若该测试因 `recordRecentDocument` 调用报错，说明 mock 未覆盖，回到 Step 2/3 检查。

- [ ] **Step 5: 在 workspace-layout 加 toRecentDocument 工具与写入逻辑**

在 `components/workspace/workspace-layout.tsx` 的 import 区（line 42 的 `import { EditorPane, type RecentWorkspaceDocument } from './editor-pane';`）之后，找到 import 块中 `workspace-api` 的引入（line 56-84），确认其中含 `recordRecentDocument`——若无则在该 import 列表中加入。

具体：把 `components/workspace/workspace-layout.tsx:75-76`：

```ts
  closeAppWindow,
  readAppSettings,
```

改为：

```ts
  closeAppWindow,
  readAppSettings,
  recordRecentDocument,
```

然后在该文件顶部常量区（`RECENT_DOCUMENT_LIMIT = 5`，约 line 179）之后，加入工具函数：

```ts
function toRecentDocument(node: WorkspaceNode): RecentWorkspaceDocument {
  return {
    absolutePath: node.absolutePath,
    relativePath: node.relativePath || node.name,
    title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
  };
}
```

- [ ] **Step 6: 改造 rememberRecentDocument 调用持久化**

把 `components/workspace/workspace-layout.tsx:1057-1072`（`rememberRecentDocument`）：

```ts
  const rememberRecentDocument = React.useCallback((node: WorkspaceNode) => {
    if (node.kind !== 'document') {
      return;
    }

    const entry: RecentWorkspaceDocument = {
      absolutePath: node.absolutePath,
      relativePath: node.relativePath || node.name,
      title: node.title || node.name.replace(/\.(md|mdx)$/i, ''),
    };

    setRecentDocuments((current) => [
      entry,
      ...current.filter((item) => item.absolutePath !== entry.absolutePath),
    ].slice(0, RECENT_DOCUMENT_LIMIT));
  }, []);
```

改为：

```ts
  const rememberRecentDocument = React.useCallback(
    (node: WorkspaceNode) => {
      if (node.kind !== 'document') {
        return;
      }

      const entry = toRecentDocument(node);

      setRecentDocuments((current) => [
        entry,
        ...current.filter((item) => item.absolutePath !== entry.absolutePath),
      ].slice(0, RECENT_DOCUMENT_LIMIT));

      if (isTauriRuntime && workspaceRootPath) {
        void recordRecentDocument(workspaceRootPath, node.absolutePath).catch(
          (error) => {
            // 持久化失败不阻断打开流程，仅记录
            // author: refinex
            console.warn('记录最近文档失败', error);
          },
        );
      }
    },
    [isTauriRuntime, workspaceRootPath],
  );
```

说明：内存先更新保证 UI 即时响应；持久化 fire-and-forget。`isTauriRuntime` 守卫使 web dev 不调用。

- [ ] **Step 7: 加入初始加载 effect**

在 `components/workspace/workspace-layout.tsx` 的 `visibleRecentDocuments` useMemo（约 line 266-275）之后加入：

```ts
  React.useEffect(() => {
    if (
      !workspace.initialRecentDocumentPaths.length ||
      !workspace.snapshot
    ) {
      return;
    }

    const docs = workspace.initialRecentDocumentPaths
      .map((path) =>
        findWorkspaceDocumentByPath(workspace.snapshot!.nodes, path),
      )
      .filter((node): node is WorkspaceNode => node?.kind === 'document')
      .map(toRecentDocument);

    setRecentDocuments((current) => {
      if (docs.length === 0) {
        return current;
      }

      // 合并：初始列表在前，补充本次会话内新打开但未持久化的条目
      const seen = new Set(docs.map((doc) => doc.absolutePath));
      const extras = current.filter((doc) => !seen.has(doc.absolutePath));

      return [...docs, ...extras].slice(0, RECENT_DOCUMENT_LIMIT);
    });
  }, [workspace.initialRecentDocumentPaths, workspace.snapshot]);
```

说明：用快照过滤天然忽略已删除路径（符合「仅过滤不清理」）。合并逻辑保留会话内新打开但尚未落盘（极端情况下落盘未完成）的条目，避免 UI 闪烁。

- [ ] **Step 8: 写初始加载测试**

**关键背景**：`useWorkspace` 只在 `snapshot` 为空且 `localStorage` 有 recent workspace path 时才调用 `loadWorkspace`（进而调 `ensureWorkspace`）。所以测试「启动恢复」必须模拟「冷启动」——`initialSnapshot` 不传 + localStorage 注入 rootPath + `loadWorkspaceTree`/`ensureWorkspace` mock。

在 `components/workspace/__tests__/workspace-layout.test.tsx` 的「shows a capped recent document list」测试附近追加：

```ts
  it('restores recent documents from persisted metadata on cold start', async () => {
    // getRecentWorkspacePath 优先读 workspace history（而非裸 localStorage key）
    recordWorkspaceHistory(manyDocumentSnapshot);
    loadWorkspaceTreeMock.mockResolvedValue(manyDocumentSnapshot);
    ensureWorkspaceMock.mockResolvedValue({
      schemaVersion: 1,
      recentDocumentPaths: ['/repo/doc-6.md', '/repo/doc-5.md'],
      expandedPaths: [],
      sortOrder: {},
    });

    render(<WorkspaceLayout initialSnapshot={null} />);

    const recentList = await screen.findByTestId(
      'workspace-recent-documents-list',
    );

    // metadata 的 doc-6、doc-5 被解析展示，验证初始加载 effect 生效
    expect(within(recentList).getByText('文档 6')).toBeTruthy();
    expect(within(recentList).getByText('文档 5')).toBeTruthy();
  });
```

说明：
- `recordWorkspaceHistory` 经 `...actual` 展开保留真实实现（见 mock line 106），会真写 localStorage；`getRecentWorkspacePath()` 优先读 history（见 `workspace-api.ts:48-57`），所以冷启动 `useWorkspace` 能拿到 rootPath 并触发 `loadWorkspace`。
- 不传 `initialSnapshot` 让 `useWorkspace` 走冷启动分支，从而调用被 mock 的 `loadWorkspaceTree` + `ensureWorkspace`。
- 断言聚焦「metadata 的两条被解析展示」，验证初始加载 effect 生效。
- 写入触发测试（验证 `recordRecentDocument` 被调用）需启用 Tauri runtime（设置 `window.__TAURI_INTERNALS__`），较脆弱；核心持久化正确性已由 Rust 单测 + api mock 测试覆盖，此处不额外增加 runtime 依赖测试。

- [ ] **Step 9: 运行布局测试验证通过**

Run: `pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx`
Expected: 全部通过，含新测试。

- [ ] **Step 10: Commit**

```bash
git add components/workspace/workspace-layout.tsx components/workspace/__tests__/workspace-layout.test.tsx
git commit -m "feat(workspace): 启动恢复最近文档并在打开时持久化"
```

---

## Task 6: 文档更新

**Files:**
- Modify: `docs/config/reference.md`

- [ ] **Step 1: 定位 workspace.json 相关段落**

Run（在仓库根用 Grep 工具）: 搜索 `workspace.json` 在 `docs/config/reference.md` 的位置。若无显式段落，在描述 `.refinex` 的上下文（该文件提到 `$HOME/**/.refinex/assets/files/**/*` 附近）补充。

- [ ] **Step 2: 补充 recentDocumentPaths 字段说明**

在 `docs/config/reference.md` 合适位置（`.refinex` 元数据相关上下文）追加段落，并更新该文件 frontmatter 的 `updated` 日期为 `2026-06-20`：

```markdown
### Workspace Metadata (`.refinex/workspace.json`)

每个工作区根目录下的 `.refinex/workspace.json` 存储工作区级元数据，字段：

- `schemaVersion`：固定为 `1`。
- `recentDocumentPaths`：最近打开文档的绝对路径列表，上限 5，最新在前；应用重启后用于恢复空状态的「最近文档」。
- `expandedPaths`：目录树展开状态（预留）。
- `sortOrder`：目录树拖拽排序记录。

打开文档时通过 `record_recent_document` 命令即时落盘；已删除/重命名的路径在展示层用工作区快照过滤，不从文件清理。
```

- [ ] **Step 3: Commit**

```bash
git add docs/config/reference.md
git commit -m "docs(config): 补充 workspace.json recentDocumentPaths 字段说明"
```

---

## Task 7: 全量验证

- [ ] **Step 1: Rust 全量测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。

- [ ] **Step 2: 前端全量测试**

Run: `pnpm test:run`
Expected: 全部通过，无回归。

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: 通过。

- [ ] **Step 4: 确认无关脏改动未被触碰**

Run: `git status`
Expected: 仅本功能相关文件被改动（`src-tauri/src/workspace.rs`、`src-tauri/src/lib.rs`、`components/workspace/*`、`docs/config/reference.md`）。dev 分支原有的 icon/二进制改动保持 unstaged。

- [ ] **Step 5: 手动验证（桌面端）**

Run: `pnpm desktop:dev`
验证：
1. 打开工作区，打开 5 个文档 → 关闭应用 → 重启 → 空状态仍显示 5 条。
2. 打开第 6 个 → 列表保持 5 条，最新置顶。
3. 删除其中一个文档 → 列表过滤掉它。
4. 检查工作区 `.refinex/workspace.json` 含 `recentDocumentPaths`、不含 `recentDocumentPath`。

---

## Self-Review 记录

计划完成后，对照 spec 逐项核对：

- **数据模型**（新增 `recent_document_paths`、`skip_serializing` 旧字段、不升 schemaVersion）→ Task 1 ✓
- **迁移时机**（`ensure_workspace_metadata` 就地规范化、不写盘）→ Task 1 Step 3 ✓
- **record_recent_document 命令**（校验、去重置顶截断 5、返回列表）→ Task 2 ✓
- **错误处理**（复用现有文案、读-改-写）→ Task 2 Step 3 ✓
- **Rust 测试矩阵 5 项** → Task 2 Step 1/5/7/9（新工作区、去重截断、迁移、损坏重建）+ Task 1 现有测试覆盖默认值 ✓
- **前端 api 封装** → Task 3 ✓
- **use-workspace 加载并暴露** → Task 4 ✓
- **layout 初始加载 effect + 写入触发点 + toRecentDocument** → Task 5 ✓
- **前端测试（api mock + 启动加载 + 写入触发）** → Task 3/5 ✓
- **文档更新** → Task 6 ✓
- **DoD（最小测试→广度→文档→脏改动保留）** → Task 7 ✓

类型一致性核对：`recordRecentDocument(rootPath, documentPath)` 在 Rust 命令、api 封装、layout 调用三处签名一致；`initialRecentDocumentPaths: string[]` 在 use-workspace 返回值与 layout 消费一致；`recentDocumentPaths` 在 Rust struct、TS interface、mock 返回值一致。无占位符。

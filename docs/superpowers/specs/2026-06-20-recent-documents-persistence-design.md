---
owner: refinex
updated: 2026-06-20
status: deprecated
referenced_by: docs/README.md
---
# 最近文档持久化设计

## 背景

工作区空状态文案为「从左侧选择文档，或继续最近打开的内容。」，其下方的「最近文档」列表最多展示 5 条。当前实现存在持久化缺口：

- `components/workspace/workspace-layout.tsx` 中 `recentDocuments` 仅保存在 `React.useState`，应用关闭即丢失。
- `rememberRecentDocument` 只更新内存，无任何落盘调用。
- 但 `.refinex/workspace.json` 的读写基础设施已完整存在于 `src-tauri/src/workspace.rs`，Tauri 命令 `ensure_workspace` 返回 `WorkspaceMetadata`，前端 `workspace-api.ts` 也已封装 `ensureWorkspace()`——只是 `use-workspace.ts` 从未调用它。
- `WorkspaceMetadata` 里已有单数字段 `recent_document_path: Option<String>`，但前端没有消费。

即：后端已铺好「持久化到 `.refinex`」的路，前端这层线未接上。

## 目标

- 「最近文档」列表（最多 5 条）持久化到 `.refinex/workspace.json`，重启应用后恢复。
- 每次打开文档立即落盘（fire-and-forget，失败不打断打开流程）。
- 沿用现有 `.refinex/workspace.json` 与 `ensure_workspace_metadata` 容错流程，不引入新的存储位置。
- 工作区内已删除/重命名的路径在展示层过滤掉，不主动从元数据清理。

## 非目标

- 不处理跨工作区的最近文档（按工作区隔离，已是当前语义）。
- 不为元数据并发写入加锁（已知边界，触发时机不冲突，见「风险」）。
- 不把 `expanded_paths` 等「预留未接线」字段一并接通，仅处理最近文档。
- 不变更 `RECENT_DOCUMENT_LIMIT`（仍为 5）。
- 不升 `schemaVersion`（向后兼容读取即可，见「数据模型」）。

## 数据模型

### `.refinex/workspace.json` 字段变更

| 字段 | 现状 | 变更后 |
|---|---|---|
| `schemaVersion` | `1` | 保持 `1` |
| `recentDocumentPath` | `string \| null`（单数） | 保留仅供旧文件兼容读取，不再写出（`skip_serializing`） |
| `recentDocumentPaths` | — | **新增** `string[]`，上限 5，最新在前，存储绝对路径 |
| `expandedPaths` | `string[]` | 不变 |
| `sortOrder` | `Record<string, unknown>` | 不变 |

### schemaVersion 不升级的理由

`ensure_workspace_metadata` 已是「读 → 解析失败则备份重建」的容错流程。新字段用 `#[serde(default)]`，旧文件缺该字段时反序列化仍成功（默认空数组）。旧 `recentDocumentPath` 若有值，读取后迁移进新数组头部，一次性消费即丢弃。无需 v1→v2 迁移器。

### Rust 结构变更

```rust
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

`skip_serializing` 使旧字段在下次写入的文件中消失，干净完成淘汰。`#[serde(default)]` 让旧文件（无新字段）能正常反序列化为空数组。

### 迁移时机

在 `ensure_workspace_metadata` 读取成功、返回前做就地规范化：若 `recent_document_paths` 为空且 `recent_document_path` 存在，构造 `paths = [oldPath]`。**不立即写盘**（保持 `ensure_workspace` 只读语义），随下次 `record_recent_document` 自然落盘。

## Rust 命令设计

### 新增命令

```rust
#[tauri::command]
pub fn record_recent_document(
    root_path: String,
    document_path: String,
) -> Result<Vec<String>, String>
```

**职责：** 读 metadata → 规范化（消化旧 `recent_document_path`）→ 更新 `recent_document_paths`（去重 + 置顶 + 截断 5）→ 写回 → 返回新列表。

**实现要点：**

- 复用 `canonical_workspace_root` 校验 root 存在。
- 校验文档路径在工作区内且非 `.refinex` 元数据（复用现有路径校验），并要求文档存在；失败返回中文错误。
- 存储绝对路径，与前端 `RecentWorkspaceDocument.absolutePath` 及 `recentDocumentPath` 历史语义一致。
- 更新算法：
  ```
  paths = normalized_paths              // 已迁移的旧单值
  paths = [doc] + paths.filter(!= doc)
  paths.truncate(5)
  ```
- 写入后旧字段因 `skip_serializing` 不再出现。

### 命令注册

`src-tauri/src/lib.rs` 的 `invoke_handler` 增加 `workspace::record_recent_document`。

### ensure_workspace 不变

仍返回 `WorkspaceMetadata`，现在带上了 `recent_document_paths`。前端启动时从它读取初始列表。

### 错误处理

- root 不存在/非目录 → `"工作区路径不存在"`（复用现有文案）。
- 文档路径越界（`.refinex` 或工作区外）→ 复用现有「不能操作工作区元数据」类文案。
- 读写盘失败 → `format!("...失败：{error}")`，与 `move_workspace_node` 风格一致。

### Rust 测试矩阵（`#[cfg(test)]`）

1. 新工作区调用命令 → `paths == [doc]`，文件落盘含 `recentDocumentPaths`、不含 `recentDocumentPath`。
2. 已有列表，记录已存在文档 → 置顶、去重、长度不变。
3. 记录第 6 个不同文档 → 截断为 5。
4. 旧文件只有 `recentDocumentPath` → `ensure_workspace` 返回 `recentDocumentPaths == [old]`；`record_recent_document` 后旧字段从文件消失。
5. 损坏 metadata → 命令走 `ensure_workspace_metadata` 重建分支，返回单元素列表。

## 前端接线

### workspace-api.ts 新增封装

```ts
export async function recordRecentDocument(
  rootPath: string,
  documentPath: string,
): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('record_recent_document', { rootPath, documentPath });
}
```

非 Tauri 环境不调用，靠 `isTauriRuntime` 守卫，与 `save_app_settings` 等一致。

### use-workspace.ts 改动

**加载初始列表（启动时）。** `loadWorkspace` 当前只 `loadWorkspaceTree`，改为并发获取 metadata：

```ts
const [nextSnapshot, metadata] = await Promise.all([
  loadWorkspaceTree(rootPath),
  ensureWorkspace(rootPath).catch(() => null),  // 失败不阻塞工作区加载
]);
```

把 metadata 的 `recentDocumentPaths` 经 `useWorkspace` 返回值暴露为 `initialRecentDocumentPaths: string[]`，使 `workspace-layout.tsx` 仍是纯消费层（测试更简单）。`createWorkspace` 同样在创建后并发拿一次 metadata，保持两条入口一致。

### workspace-layout.tsx 改动

**状态初始化：** 启动时用 metadata 的 paths + snapshot 解析出完整展示条目：

```ts
React.useEffect(() => {
  if (!workspace.initialRecentDocumentPaths || !workspace.snapshot) return;
  const docs = workspace.initialRecentDocumentPaths
    .map((p) => findWorkspaceDocumentByPath(workspace.snapshot!.nodes, p))
    .filter((n): n is WorkspaceNode => n?.kind === 'document')
    .map(toRecentDocument);
  setRecentDocuments(docs);
}, [workspace.initialRecentDocumentPaths, workspace.snapshot]);
```

复用现有 `visibleRecentDocuments` 的过滤思路——启动加载的列表也走快照过滤，天然忽略已删除路径（符合「仅过滤不清理」）。

**写入触发点：** 现有 `rememberRecentDocument`（layout 内）是唯一写入入口（已被 `openDocumentNode`、`openDocumentByPath`、`handleCreateDocument`、`rememberRecentDocumentByPath` 复用）。改为：内存更新后，若 `isTauriRuntime && workspaceRootPath`，调用 `recordRecentDocument(rootPath, node.absolutePath)`，fire-and-forget，失败仅 `console.warn`。

**构造工具：** 抽 `toRecentDocument(node)` 统一 `rememberRecentDocument` 内联构造与启动加载两处，避免字段拼装逻辑漂移。

### 不做的

- 不改 `RECENT_DOCUMENT_LIMIT` 位置（仍 5，前后端共享语义）。
- 不在 `createWorkspace` 预写空列表——`ensure_workspace_metadata` 已保证新工作区有合法 metadata。

### 前端测试（Vitest）

1. `workspace-api.test.ts`：`recordRecentDocument` 正确 invoke 命令名和参数。
2. layout 相关：启动时 metadata 的 paths 能解析成展示条目；打开文档触发 `recordRecentDocument`（mock 验证调用）；删除的路径不展示。

## 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| metadata 全量覆盖写的并发窗口 | `record_recent_document` 与 `move_workspace_node` 极端同时触发，后写覆盖先写的另一字段 | 触发时机不同毫秒，风险可接受；记录此假设，本期不加锁 |
| 旧文件迁移未落盘时被另一进程读 | 拿到含旧 `recentDocumentPath` 但无新字段的中间态 | `ensure_workspace_metadata` 读时即规范化到内存，语义一致；下次任意写淘汰旧字段 |
| `ensureWorkspace` 失败导致启动无列表 | 用户看到空最近文档 | `.catch(() => null)` 降级，不阻塞工作区加载；列表随后续打开逐步重建 |
| 非 Tauri（web dev）环境 | 命令不可用 | `isTauriRuntime` 守卫，回退纯内存行为，与现状一致 |
| 绝对路径跨机器不可移植 | 工作区拷贝到别处后路径失效 | 符合「仅过滤不清理」——展示层快照过滤天然忽略；与 `recentDocumentPath` 历史一致 |

## 回滚

- 纯增量改动，无破坏性 schema 变更（`schemaVersion` 未升）。
- 回滚 = revert 该提交。旧文件因 `recent_document_path` 仍可被旧代码读取（读取侧未删该字段定义，`skip_serializing` 只影响写出）。
- 新写入的文件缺 `recentDocumentPath` 字段，旧代码用 `Option<String>` + 读取容错能正常打开工作区，只是看不到列表。

## 完成标准（Definition of Done）

对齐 `AGENTS.md`：

1. 最小测试先行：Rust `record_recent_document` 单测 → 前端 `workspace-api` mock 测试 → layout 集成测试。
2. 广度验证：`cargo test --manifest-path src-tauri/Cargo.toml` + `pnpm test:run` + `pnpm lint`。
3. 文档：`docs/config/reference.md` 的 `.refinex`/workspace.json 段落补充 `recentDocumentPaths` 字段说明，更新 `updated` 日期。
4. 交付含：变更摘要、验证证据（测试输出）、风险、回滚、下一步。
5. 无关脏改动保留不动（当前 dev 分支有大量 icon/文件改动，不碰）。

### 手动验证场景

- 打开 5 个文档 → 重启应用 → 空状态仍显示这 5 条。
- 打开第 6 个 → 列表保持 5 条，最新置顶。
- 删除其中一个文档 → 列表过滤掉它（workspace.json 里保留，符合不清理）。
- 拖拽排序后立刻打开文档 → 两者落盘不互相破坏（抽查）。

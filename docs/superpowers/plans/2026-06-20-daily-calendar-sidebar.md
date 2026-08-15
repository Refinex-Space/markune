# Daily Calendar Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sidebar Daily calendar that opens date-specific Markdown notes in the existing editor and marks dates with real content.

**Architecture:** Daily note bodies are normal Markdown files under `Daily/YYYY/MM/YYYY-MM-DD.md`. `.markune/workspace.json` stores only a `dailyNotes` index for selected date, document paths, content markers, and update times. The frontend uses the existing `Calendar` wrapper and editor/tab flow; Rust owns file creation, path validation, month indexing, and metadata persistence.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tauri v2 Rust commands, `react-day-picker` through `components/ui/calendar.tsx`, Vitest, Cargo tests.

---

## File Structure

- Create `components/workspace/daily-notes.ts`: frontend date/month helpers and content marker helpers.
- Create `components/workspace/daily-note-calendar.tsx`: sidebar calendar UI, dots, today/selected states, month navigation.
- Modify `components/workspace/workspace-types.ts`: add `DailyNoteEntry`, `DailyNoteMonth`, `DailyNoteDocument`, `WorkspaceMetadata.dailyNotes`.
- Modify `components/workspace/workspace-api.ts`: add `openDailyNote` and `listDailyNotesForMonth`.
- Modify `components/workspace/workspace-sidebar.tsx`: render the Daily calendar above settings and expose an `onOpenDailyNote` callback.
- Modify `components/workspace/workspace-layout.tsx`: load month markers, open Daily Note tab, refresh workspace tree, update markers after saves.
- Modify `src-tauri/src/workspace.rs`: add Daily Note metadata structs, commands, path/template/content detection, index refresh.
- Modify `src-tauri/src/lib.rs`: register new Tauri commands.
- Modify `docs/config/reference.md`: document `dailyNotes`.
- Modify tests in `components/workspace/__tests__/workspace-api.test.ts`, `components/workspace/__tests__/workspace-layout.test.tsx`, and Rust tests inside `src-tauri/src/workspace.rs`.

## Task 1: Rust Daily Note Metadata And Date Helpers

**Files:**
- Modify: `src-tauri/src/workspace.rs`

- [ ] **Step 1: Write failing Rust tests for metadata defaults and date validation**

Add tests near existing workspace metadata tests:

```rust
#[test]
fn default_workspace_metadata_includes_empty_daily_notes() {
    let metadata = default_workspace_metadata();

    assert_eq!(metadata.daily_notes.selected_date, None);
    assert!(metadata.daily_notes.entries.is_empty());
}

#[test]
fn rejects_invalid_daily_note_date() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let error = open_daily_note(
        temp_dir.path().to_string_lossy().to_string(),
        "2026-6-2".to_string(),
    )
    .expect_err("invalid date should fail");

    assert!(error.contains("日期格式无效"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_note -- --nocapture
```

Expected: FAIL because `daily_notes` and `open_daily_note` do not exist.

- [ ] **Step 3: Add metadata structs and date helper skeletons**

Add to `src-tauri/src/workspace.rs`:

```rust
#[derive(Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDailyNotes {
    #[serde(default)]
    pub selected_date: Option<String>,
    #[serde(default)]
    pub entries: BTreeMap<String, DailyNoteEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteEntry {
    pub document_path: String,
    pub has_content: bool,
    pub updated_at: u128,
}
```

Extend `WorkspaceMetadata`:

```rust
#[serde(default)]
pub daily_notes: WorkspaceDailyNotes,
```

Add helper:

```rust
fn parse_daily_date(date: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "日期格式无效，请使用 YYYY-MM-DD".to_string())
}
```

Add a temporary `open_daily_note` command skeleton returning the validation error first.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_note -- --nocapture
```

Expected: PASS for metadata default and invalid date tests.

## Task 2: Rust Create/Open Daily Note

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests for creating and reopening a Daily Note**

Add tests:

```rust
#[test]
fn open_daily_note_creates_markdown_file_and_metadata_entry() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let root = temp_dir.path().to_string_lossy().to_string();

    let opened = open_daily_note(root.clone(), "2026-06-20".to_string()).expect("open daily");

    assert_eq!(opened.node.relative_path, "Daily/2026/06/2026-06-20.md");
    assert!(opened.content.content.contains("dailyDate: 2026-06-20"));
    assert!(temp_dir.path().join("Daily/2026/06/2026-06-20.md").is_file());

    let raw = fs::read_to_string(temp_dir.path().join(".markune/workspace.json"))
        .expect("metadata");
    let metadata: WorkspaceMetadata = serde_json::from_str(&raw).expect("metadata json");
    assert_eq!(metadata.daily_notes.selected_date.as_deref(), Some("2026-06-20"));
    assert!(metadata.daily_notes.entries.contains_key("2026-06-20"));
    assert!(!metadata.daily_notes.entries["2026-06-20"].has_content);
}

#[test]
fn open_daily_note_preserves_existing_content() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let root_path = temp_dir.path();
    let note_dir = root_path.join("Daily/2026/06");
    fs::create_dir_all(&note_dir).expect("daily dir");
    fs::write(note_dir.join("2026-06-20.md"), "# 2026-06-20\n\n真实内容\n")
        .expect("write note");

    let opened = open_daily_note(
        root_path.to_string_lossy().to_string(),
        "2026-06-20".to_string(),
    )
    .expect("open existing");

    assert!(opened.content.content.contains("真实内容"));
    assert!(opened.content.content.contains("# 2026-06-20"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml open_daily_note -- --nocapture
```

Expected: FAIL because `open_daily_note` does not create files/metadata yet.

- [ ] **Step 3: Implement `DailyNoteDocument`, path creation, template, and command registration**

Add:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteDocument {
    pub node: WorkspaceNode,
    pub content: MarkdownDocumentContent,
}
```

Implement:

```rust
#[tauri::command]
pub fn open_daily_note(root_path: String, date: String) -> Result<DailyNoteDocument, String> {
    let root = canonical_workspace_root(&root_path)?;
    let day = parse_daily_date(&date)?;
    let note_path = daily_note_path(&root, day);

    if let Some(parent) = note_path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建每日笔记目录".to_string())?;
    }

    if !note_path.exists() {
        write_text_atomic(&note_path, &daily_note_template(day))
            .map_err(|_| "无法创建每日笔记".to_string())?;
    }

    let content = fs::read_to_string(&note_path)
        .map_err(|_| "无法读取每日笔记内容，当前仅支持 UTF-8 文档".to_string())?;
    let modified_at = read_modified_at(&note_path)?;
    let mut metadata = ensure_workspace_metadata(&root)
        .map_err(|error| format!("读取工作区元数据失败：{error}"))?;

    metadata.daily_notes.selected_date = Some(date.clone());
    metadata.daily_notes.entries.insert(
        date.clone(),
        DailyNoteEntry {
            document_path: note_path.to_string_lossy().to_string(),
            has_content: daily_note_has_content(&content, &date),
            updated_at: modified_at,
        },
    );
    write_workspace_metadata(&root, &metadata)
        .map_err(|error| format!("保存每日笔记索引失败：{error}"))?;

    Ok(DailyNoteDocument {
        node: build_document_node(
            &root,
            &note_path,
            note_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("daily.md")
                .to_string(),
        )
        .map_err(|error| format!("读取每日笔记节点失败：{error}"))?,
        content: MarkdownDocumentContent {
            path: note_path.to_string_lossy().to_string(),
            content,
            modified_at,
        },
    })
}
```

Register `workspace::open_daily_note` in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml open_daily_note -- --nocapture
```

Expected: PASS.

## Task 3: Rust Month Index And Save Refresh

**Files:**
- Modify: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests for month markers and save refresh**

Add:

```rust
#[test]
fn list_daily_notes_for_month_reports_only_real_content_markers() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let root = temp_dir.path().to_string_lossy().to_string();

    open_daily_note(root.clone(), "2026-06-20".to_string()).expect("open blank");
    save_markdown_document(
        root.clone(),
        temp_dir
            .path()
            .join("Daily/2026/06/2026-06-20.md")
            .to_string_lossy()
            .to_string(),
        "---\ntitle: 2026-06-20\nrefinexDialect: 1\ndailyDate: 2026-06-20\n---\n\n# 2026-06-20\n\n- [ ] 写计划\n".to_string(),
        None,
    )
    .expect("save daily");

    let month = list_daily_notes_for_month(root, "2026-06".to_string()).expect("month");
    assert_eq!(month.month, "2026-06");
    assert_eq!(month.entries.len(), 1);
    assert_eq!(month.entries[0].date, "2026-06-20");
    assert!(month.entries[0].has_content);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_notes_for_month -- --nocapture
```

Expected: FAIL because `list_daily_notes_for_month` does not exist.

- [ ] **Step 3: Implement month API and save refresh**

Add:

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteMonth {
    pub month: String,
    pub entries: Vec<DailyNoteMonthEntry>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyNoteMonthEntry {
    pub date: String,
    pub document_path: String,
    pub has_content: bool,
    pub updated_at: u128,
}
```

Implement `parse_daily_month`, `list_daily_notes_for_month`, and `refresh_daily_note_index_for_path`. Call `refresh_daily_note_index_for_path(&root, &document, &content, meta.modified_at)` after `save_markdown_document` writes a Markdown file.

Register `workspace::list_daily_notes_for_month` in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_notes_for_month -- --nocapture
```

Expected: PASS.

## Task 4: Frontend API And Types

**Files:**
- Modify: `components/workspace/workspace-types.ts`
- Modify: `components/workspace/workspace-api.ts`
- Modify: `components/workspace/__tests__/workspace-api.test.ts`

- [ ] **Step 1: Write failing frontend API tests**

Add expectations in `workspace-api.test.ts`:

```ts
await openDailyNote('/repo', '2026-06-20');
expect(invokeMock).toHaveBeenCalledWith('open_daily_note', {
  rootPath: '/repo',
  date: '2026-06-20',
});

await listDailyNotesForMonth('/repo', '2026-06');
expect(invokeMock).toHaveBeenCalledWith('list_daily_notes_for_month', {
  rootPath: '/repo',
  month: '2026-06',
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: FAIL because the wrappers are missing.

- [ ] **Step 3: Add TS types and wrappers**

Add to `workspace-types.ts`:

```ts
export interface DailyNoteEntry {
  date: string;
  documentPath: string;
  hasContent: boolean;
  updatedAt: number;
}

export interface DailyNoteMonth {
  month: string;
  entries: DailyNoteEntry[];
}

export interface DailyNoteDocument {
  node: WorkspaceNode;
  content: MarkdownDocumentContent;
}
```

Add to `workspace-api.ts`:

```ts
export async function openDailyNote(rootPath: string, date: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DailyNoteDocument>('open_daily_note', { rootPath, date });
}

export async function listDailyNotesForMonth(rootPath: string, month: string) {
  const { invoke } = await import('@tauri-apps/api/core');

  return invoke<DailyNoteMonth>('list_daily_notes_for_month', {
    rootPath,
    month,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
```

Expected: PASS.

## Task 5: Sidebar Calendar Component

**Files:**
- Create: `components/workspace/daily-notes.ts`
- Create: `components/workspace/daily-note-calendar.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Write failing UI tests for dot markers and date click**

In `workspace-layout.test.tsx`, mock `openDailyNote` and `listDailyNotesForMonth`, then add:

```ts
it('opens a daily note from the sidebar calendar', async () => {
  const user = userEvent.setup();
  listDailyNotesForMonthMock.mockResolvedValue({
    month: '2026-06',
    entries: [],
  });
  openDailyNoteMock.mockResolvedValue({
    node: {
      id: 'Daily/2026/06/2026-06-20.md',
      name: '2026-06-20.md',
      kind: 'document',
      relativePath: 'Daily/2026/06/2026-06-20.md',
      absolutePath: '/repo/Daily/2026/06/2026-06-20.md',
      title: '2026-06-20',
    },
    content: markdownDocument({ path: '/repo/Daily/2026/06/2026-06-20.md' }),
  });

  render(<WorkspaceLayout initialSnapshot={snapshot} />);

  await user.click(await screen.findByRole('button', { name: /2026-06-20/ }));

  expect(openDailyNoteMock).toHaveBeenCalledWith('/repo', '2026-06-20');
  expect(screen.getByText('2026-06-20')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because the calendar UI is missing.

- [ ] **Step 3: Implement helper and component**

`daily-notes.ts`:

```ts
export function formatDailyDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatDailyMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}
```

`daily-note-calendar.tsx` renders `Calendar` with `mode="single"`, `selected`, `month`, `onMonthChange`, `onSelect`, and a custom day button or modifier class that displays a dot when `contentDates.has(formatDailyDate(day.date))`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

## Task 6: Layout Integration

**Files:**
- Modify: `components/workspace/workspace-sidebar.tsx`
- Modify: `components/workspace/workspace-layout.tsx`
- Modify: `components/workspace/__tests__/workspace-layout.test.tsx`

- [ ] **Step 1: Write failing tests for loading markers and opening editor tab**

Extend the Daily Note test to assert:

```ts
expect(listDailyNotesForMonthMock).toHaveBeenCalledWith('/repo', '2026-06');
expect(screen.getByTestId('daily-note-marker-2026-06-20')).toBeTruthy();
expect(readMarkdownDocumentMock).toHaveBeenCalledWith(
  '/repo',
  '/repo/Daily/2026/06/2026-06-20.md',
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: FAIL because layout does not call the new APIs.

- [ ] **Step 3: Wire callbacks**

In `workspace-layout.tsx`:

- Keep `dailyNoteMonth`, `dailyNoteEntries`, `dailyNoteError`, `selectedDailyDate` state.
- Load month markers when workspace root or calendar month changes.
- On date click call `openDailyNote(rootPath, date)`.
- Refresh workspace tree.
- Open returned node through the existing `openDocumentInGroup` and `workspace.openDocument` flow.

Pass calendar props into `WorkspaceSidebar`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx
```

Expected: PASS.

## Task 7: Documentation And Full Verification

**Files:**
- Modify: `docs/config/reference.md`

- [ ] **Step 1: Update config reference**

Add to Workspace Metadata:

```markdown
- `dailyNotes`：每日笔记索引，包含最近选中日期 `selectedDate` 以及 `entries` 日期映射。正文仍保存在工作区可见 Markdown 文件 `Daily/YYYY/MM/YYYY-MM-DD.md`，`.markune/workspace.json` 只保存路径和内容标记。
```

- [ ] **Step 2: Run smallest relevant checks**

Run:

```bash
pnpm test:run -- components/workspace/__tests__/workspace-api.test.ts
pnpm test:run -- components/workspace/__tests__/workspace-layout.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml daily_note -- --nocapture
```

Expected: PASS.

- [ ] **Step 3: Run broad checks**

Run:

```bash
pnpm test:run
pnpm lint
pnpm build:desktop:web
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: PASS. Existing lint warnings may remain if unrelated and already present.

## Self-Review

- Spec coverage: storage, UI, API, content markers, errors, and testing are covered by Tasks 1-7.
- Placeholder scan: no unresolved placeholders remain.
- Type consistency: Rust `DailyNote*` structs map to TypeScript `DailyNote*` interfaces through camelCase serialization.

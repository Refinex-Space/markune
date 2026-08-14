---
owner: refinex
updated: 2026-06-20
status: active
---

# Daily Calendar Sidebar Design

## Goal

在工作区左侧边栏增加一个紧凑日历组件。用户点击日期后，右侧编辑器区域打开该日期的 Markdown 页面，用于记录当天随笔、任务和工作日志；已有实际内容的日期在日历日期下方显示小圆点提示。

## Product Principles

- Daily Note 是普通 Markdown 文档，不是隐藏数据库记录。
- `.markune` 只保存工作区级索引和状态，不保存正文内容。
- 复用现有 Markdown 编辑器、tab、自动保存、Git、全局搜索、本地资源协议和页面宽度设置。
- 日历入口要像工作区的一部分，不做单独的重型应用面板。

## UI Design

### Placement

日历放在 `WorkspaceSidebar` 底部、设置入口上方，属于工作区导航的一部分。侧边栏高度不足时，文档树优先滚动，日历保持底部可见但高度紧凑。

### Calendar Behavior

- 使用项目现有 `components/ui/calendar.tsx`，它已基于 `react-day-picker` 封装，不新增日历依赖。
- 默认展示当前月份，选中日期默认为今天。
- 支持上月、下月、回到今天。
- 点击日期打开对应 Daily Note。
- 今天、选中日期、有内容日期使用不同视觉层级：
  - 今天：低对比描边或轻背景。
  - 选中：主色柔和背景。
  - 有内容：日期数字下方 4px 小圆点。
- 小圆点仅表示有实际正文，不因模板/frontmatter/标题存在而显示。

### Editor Behavior

- 点击日期后，右侧编辑器打开一个普通 Markdown tab。
- 如果文档不存在，创建默认模板并打开。
- 如果文档已存在，直接打开。
- Daily Note tab 标题建议使用 `6月20日` 或 `2026-06-20`，文件名保持稳定的 `YYYY-MM-DD.md`。
- 当前打开文档仍参与现有自动保存和修改状态展示。

## Storage Design

### Markdown Files

Daily Note 正文保存在工作区可见目录：

```text
Daily/YYYY/MM/YYYY-MM-DD.md
```

示例：

```text
Daily/2026/06/2026-06-20.md
```

新建文件内容：

```markdown
---
title: 2026-06-20
createdAt: 2026-06-20T00:00:00Z
updatedAt: 2026-06-20T00:00:00Z
refinexDialect: 1
dailyDate: 2026-06-20
---

# 2026-06-20
```

`dailyDate` 用于识别该文档是 Daily Note，不影响普通 Markdown 工具读取。

### Workspace Metadata

`.markune/workspace.json` 保持 `schemaVersion: 1`，新增可选字段：

```json
{
  "dailyNotes": {
    "selectedDate": "2026-06-20",
    "entries": {
      "2026-06-20": {
        "documentPath": "/workspace/Daily/2026/06/2026-06-20.md",
        "hasContent": true,
        "updatedAt": 1781894400000
      }
    }
  }
}
```

字段语义：

- `selectedDate`：最近在日历中选中的日期，ISO date，允许为空。
- `entries`：日期到 Daily Note 索引的映射。
- `documentPath`：对应 Markdown 文件绝对路径。
- `hasContent`：是否存在用户实际内容。
- `updatedAt`：最近索引更新时间，使用文件修改时间毫秒值。

## Content Detection

`hasContent` 的判断规则：

1. 去掉 YAML frontmatter。
2. 去掉首个等于日期或 title 的 H1。
3. 去掉空白行。
4. 剩余内容包含任意非空文本、任务项、列表项、图片或链接时视为有内容。

这避免新建模板立即显示小圆点。

## API Design

新增 Tauri 命令：

```rust
open_daily_note(root_path: String, date: String) -> Result<DailyNoteDocument, String>
list_daily_notes_for_month(root_path: String, month: String) -> Result<DailyNoteMonth, String>
```

TypeScript wrapper：

```ts
openDailyNote(rootPath: string, date: string): Promise<DailyNoteDocument>
listDailyNotesForMonth(rootPath: string, month: string): Promise<DailyNoteMonth>
```

类型：

```ts
interface DailyNoteEntry {
  date: string;
  documentPath: string;
  hasContent: boolean;
  updatedAt: number;
}

interface DailyNoteMonth {
  month: string;
  entries: DailyNoteEntry[];
}

interface DailyNoteDocument {
  node: WorkspaceNode;
  content: MarkdownDocumentContent;
}
```

`openDailyNote` 必须：

- 校验日期为 `YYYY-MM-DD`。
- 校验并限制文件路径在工作区内。
- 创建 `Daily/YYYY/MM` 目录。
- 创建不存在的文件。
- 写入/更新 `.markune/workspace.json.dailyNotes.entries[date]`。
- 返回可直接传给现有 editor/tab 流程的 `WorkspaceNode` 和 Markdown content。

`listDailyNotesForMonth` 必须：

- 校验月份为 `YYYY-MM`。
- 读取 `.markune/workspace.json` 的索引。
- 扫描 `Daily/YYYY/MM` 下的 Daily Note 文件并修正索引。
- 返回该月有文件或索引记录的日期状态。

`save_markdown_document` 保存 Daily Note 时应刷新对应 `hasContent`，确保小圆点在保存后更新。

## Frontend Design

新增文件：

- `components/workspace/daily-note-calendar.tsx`：侧边栏日历 UI 和日期状态展示。
- `components/workspace/daily-notes.ts`：日期格式化、月份 key、内容检测前端辅助函数。

修改文件：

- `components/workspace/workspace-sidebar.tsx`：插入日历组件，新增 `onOpenDailyNote` prop。
- `components/workspace/workspace-layout.tsx`：持有当前月份 Daily Note 状态，处理点击日期并打开 editor tab。
- `components/workspace/workspace-api.ts`：封装新增 Tauri 命令。
- `components/workspace/workspace-types.ts`：新增 Daily Note 类型。
- `src-tauri/src/workspace.rs`：实现 Daily Note 命令、metadata 字段、索引刷新。
- `src-tauri/src/lib.rs`：注册命令。
- `docs/config/reference.md`：补充 `dailyNotes` 字段说明。

## Error Handling

- 非法日期：返回 `日期格式无效`。
- 工作区不存在：沿用现有 `工作区路径不存在`。
- 创建目录或文件失败：返回 `无法创建每日笔记`。
- 元数据损坏：沿用现有 corrupt backup 流程重建默认 metadata。
- 前端打开失败：日历保留当前月份，展示非阻塞错误状态，不影响文档树和现有编辑器。

## Testing Strategy

Rust：

- `open_daily_note` 创建目录和模板文件。
- `open_daily_note` 打开已有文件且不覆盖内容。
- `list_daily_notes_for_month` 返回有内容日期。
- `save_markdown_document` 保存 Daily Note 后更新 `hasContent`。
- 非法日期、越界路径、损坏 metadata 容错。

Frontend：

- `workspace-api.test.ts` 覆盖新 wrapper invoke 参数。
- `workspace-layout.test.tsx` 覆盖点击日历日期打开 Daily Note tab。
- `workspace-layout.test.tsx` 覆盖有内容日期显示小圆点。
- `daily-note-calendar` 可访问名称、选中态、今天态。

## Non-Goals

- 不做提醒、周期任务、重复事件、跨日拖拽。
- 不做 iCal/系统日历同步。
- 不把任务抽取成独立数据库。
- 不隐藏 Daily Note 正文到 `.markune`。

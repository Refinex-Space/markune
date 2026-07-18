---
owner: refinex
updated: 2026-07-18
status: active
referenced_by: docs/README.md#validation-artifacts
---

# Codex AI Panel Design QA

## Evidence

- source visual truth path: `/Users/refinex/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_c2iwd8ogcmtn22_a03e/temp/RWTemp/2026-07/aa5b374aeb8a4aaf8738740f5ad46a81/cba17a68592fefd95214d653bf06c897.png`
- implementation screenshot path: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-context-final-pass-2.jpg`
- history screenshot path: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-history.png`
- full-view comparison evidence: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-comparison-pass-2.jpg`
- viewport: `1280 × 720`, light theme, AI panel measured at `359 × 646` within the workspace shell
- state: current Markdown document open; AI empty state ready; ChatGPT account、model catalog and three MCP Servers supplied by a development-only Tauri protocol stub

## Primary Interactions Tested

- 右上角 AI 入口展开面板，并与元信息面板保持互斥。
- 新任务返回空态，当前文档自动显示为上下文 chip。
- 历史记录显示搜索框、按日期分组的任务和任务菜单。
- `+` 菜单显示联网搜索、MCP inventory 和 Codex sidecar version。
- `@` 提及列表展示标题与工作区相对路径。
- 模型与推理强度来自 App Server 数据，不依赖前端硬编码目录。

## Required Fidelity Surfaces

- Fonts and typography: 继续使用 Madora 已有 UI 字体和字号层级；正文、12–13px 控件文字及 10–11px 辅助状态在 1280px 视口清晰可读。没有引入 Codex 品牌字体。
- Spacing and layout rhythm: 保留 Madora 的工作区三栏布局；AI 面板采用大面积留白、48px header、固定底部 composer、低密度历史列表，和参考图的信息节奏一致。面板在窄桌面视口收敛到 360px 最小宽度，没有遮挡持久控件。
- Colors and visual tokens: 全部使用 Madora 的 `background`、`foreground`、`muted`、`border`、`accent` 和语义色；Codex 风格通过克制的灰阶、弱分隔线和单一黑色主操作按钮表达，没有复制品牌配色。
- Image quality and asset fidelity: 目标界面没有需要复用的品牌插画、Logo 或位图资产；图标继续使用项目既有 Lucide 库，截图无拉伸、锯齿或占位图。
- Copy and content: “新任务”“历史记录”“工作区访问”“联网搜索已启用”“MCP Server 可用”与实际能力一致；当前文档和相对路径来自工作区数据。

## Findings

- No actionable P0/P1/P2 visual differences remain.
- [P3] 参考图是完整 Codex task 画布，Madora 是嵌入工作区的 360–640px 侧栏，两者内容行宽不同；这是产品容器约束，不应通过缩小编辑区或复制全屏任务页来消除。
- [P3] 开发协议桩首次加载时缺少 Tauri `metadata.currentWindow` / `unregisterListener`，浏览器日志保留了三条 title 设置错误和一条 HMR unlisten 错误；这些错误来自 QA 桩，不存在于真实 Tauri runtime。TypeScript、Vitest、Rust 测试和 App Server 协议冒烟测试未出现对应错误。

## Comparison History

1. Pass 1 found a P2 mismatch in the composer send affordance: implementation used a sparkle glyph while the Codex reference uses a direct upward send affordance.
2. Fix: replaced the send glyph with `ArrowUp`; the active-turn control remains a black circular stop button.
3. Post-fix evidence: `ai-panel-context-final-pass-2.jpg` and `ai-panel-comparison-pass-2.jpg`. The composer now preserves the reference hierarchy without copying its brand shell.

## Focused Region Comparison

Focused comparison was required because model、effort、permission and send controls are too small in the full canvas. `ai-panel-comparison-pass-2.jpg` includes a second row that aligns the bottom composer regions. It confirms compact inline controls, muted permission state, rounded composer container and black circular primary action.

## Residual Test Gaps

- Browser QA used structured protocol responses and did not execute a destructive file approval. Approval rendering and event normalization are covered by unit tests; real destructive actions remain intentionally outside visual QA.
- The Windows and Linux sidecar packages are selected by the staging script but were not rendered on this macOS run.

## Previous QA Archive: Settings Page

### Comparison Target

- Source regression evidence:
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-86bde421-b178-4945-9849-6740bd1cf849.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-6d82624a-4320-468c-b2d2-8aab0c22e7a4.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-1c897afc-28aa-4912-ad32-65cfd1b55ae6.png`
- Historical visual truth: `2a55144916fc60a5ef1568e89fbeae9cdb9a8cba^:components/workspace/workspace-settings-page.tsx`
- Implementation screenshots:
  - `C:/Users/ADMINI~1/AppData/Local/Temp/madora-settings-appearance-restored.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/madora-settings-storage-restored.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/madora-settings-git-restored.png`
- Viewport: 1914 x 1029
- State: desktop, light theme; appearance, storage and Git Sync default states

### Full-view Comparison Evidence

The regression screenshot shows the settings page ending around the first 655 pixels of a 1914-pixel window, with the remaining area detached from the settings surface. The restored implementation keeps the 280-pixel settings sidebar while the rounded main surface fills the remaining window. Its content is centered inside a responsive 1120-pixel column.

The appearance page again exposes visual theme previews, page-width previews, font purpose descriptions and live font samples. Storage and Git Sync use the same section rhythm, row alignment, muted cards, control sizing and status placement.

A separate focused crop was not needed: the full-resolution captures keep the typography, borders, selection states and field alignment readable. DOM inspection separately confirmed every label, role and selected/disabled state.

### Findings And Comparison History

- P1 fixed: the settings root had lost its flexible width and collapsed into a narrow content column.
- P1 fixed: theme, page width and font controls had lost visual previews and explanatory hierarchy.
- P2 fixed: storage and Git Sync fields had been compressed into loosely related controls with poor long-value handling.
- P2 fixed: search, keyboard focus treatment, live status announcements and persisted Git Sync details had been missing.

The prior implementation restored the full-width settings shell, resizable sidebar boundary, rounded main surface and 1120-pixel responsive content column; restored the historical non-AI theme, page-width and font presentation; restored structured storage and Git Sync rows; and kept automatic saving with consistent focus-visible and `aria-live` feedback behavior.

### Previous Required Fidelity Surfaces

- Fonts and typography: consistent section hierarchy, readable line height, existing project font tokens and live font samples are present.
- Spacing and layout rhythm: sidebar, main surface, cards, rows, radii and section gaps follow the historical settings implementation.
- Colors and visual tokens: existing `background`, `sidebar`, `muted`, `border`, `foreground` and semantic state tokens are used; no new palette was introduced.
- Image quality and assets: this settings flow contains no raster imagery. Existing Lucide icons and live UI preview components match the historical project source.
- Copy and content: non-AI descriptions, field labels, repository status and automatic-save feedback are restored and consistent.

previous final result: passed

final result: passed
## 2026-07-17 Collapsed Tool Activity And Conversation Navigation

### Evidence

- source visual truth path: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-17_08-54-52.png`
- completed-turn screenshot path: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-collapsed-tools-2026-07-17.jpg`
- completed-turn focused crop: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-collapsed-tools-2026-07-17-crop.jpg`
- scroll-to-latest screenshot path: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-scroll-to-latest-2026-07-17.jpg`
- scroll-to-latest focused crop: `/Users/refinex/.codex/visualizations/2026/07/15/019f6595-892a-7f82-8dcb-19a56f5d05db/ai-panel-scroll-to-latest-2026-07-17-crop.jpg`
- viewport: `1456 × 769`, light theme, right panel width `556px`
- state: latest debug bundle; completed tool turn and a long restored thread with the conversation intentionally scrolled away from the bottom

### Comparison History

1. The source shows successful tool summaries and technical details collapsed into compact disclosure rows, with a centered circular down-arrow appearing only while the reader is away from the latest content.
2. The implementation now keeps successful and running tool groups and nested technical details closed by default. Failed, declined and waiting-for-approval activities retain attention-first expansion.
3. The implementation keeps the conversation pinned only while the reader is already near the bottom. Scrolling a long thread upward reveals the circular `回到最新消息` control; activating it returned to the latest content and removed the control.
4. The composer editable region now starts at `56px`, grows with content, and becomes internally scrollable after `160px` instead of reserving the former `80px` minimum before any input.

### Verified Interactions

- A restored completed processing trace exposes a collapsed `aria-expanded=false` disclosure.
- Focused rendering tests confirm an open live trace still leaves its normal tool group and nested command detail collapsed.
- Manual disclosure choices survive in-progress to completed status updates.
- Scrolling a long restored task upward exposes the round down-arrow control in the rebuilt Tauri app.
- Clicking the down-arrow performs a smooth return to the latest message and removes the control once the viewport is near the bottom.
- Sending a new message explicitly restores follow-latest behavior, while incremental output does not steal the reader's position after manual upward scrolling.

### Findings

- No actionable P0/P1/P2 visual difference remains for the requested states.
- [P3] The source uses a full-width Codex task canvas while Madora renders inside a `556px` workspace side panel. The implementation preserves the source interaction hierarchy but continues using Madora typography, color tokens, spacing and compact side-panel density.
- Historical tool child items remain limited by sidecar `0.144.4`; a restored trace can be folded, but tool rows absent from App Server history cannot be visually replayed. Live projection and disclosure behavior remain covered by the focused state and rendering tests.

final result: passed

## 2026-07-16 Inline Mention Follow-up

### Evidence

- source regression path: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-16_10-43-05.png`
- source interaction target path: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-16_10-44-43.png`
- implementation screenshot path: unavailable; the in-app browser could not reach the local Tauri development runtime, and macOS exposed multiple Madora instances under the same application identity
- intended viewport: desktop, light theme, AI side panel open with a current Markdown document and an active inline `@` mention
- state under review: panel header without a duplicate collapse control; composer text containing a clickable document mention at the insertion position

### Verification Evidence

- Unit interaction coverage confirms the header no longer exposes “折叠 AI 面板”.
- Unit interaction coverage confirms selecting a document inserts an atomic link inside the editable content, clicking it emits the workspace document path, Backspace removes the whole mention, and IME composition Enter does not submit.
- `RightSidePanel` integration coverage confirms the mention path is forwarded to the workspace document-opening callback.
- Full-view and focused visual comparison could not be completed without a trustworthy screenshot of the updated desktop build.

### Required Fidelity Surfaces

- Fonts and typography: implementation reuses the existing 13px composer text and Madora UI font; visual comparison blocked.
- Spacing and layout rhythm: selected mentions no longer add a second top chip row and instead participate in the text flow; visual comparison blocked.
- Colors and visual tokens: inline mentions use the existing Madora blue interaction color and focus ring; visual comparison blocked.
- Image quality and asset fidelity: no new raster or custom icon assets were introduced.
- Copy and content: current-document context remains at the top, while explicit `@` mentions use the document title in the sentence and retain their absolute path only as internal interaction data.

### Findings

- No code-level P0/P1 issue remains in the covered interaction states.
- Visual severity cannot be classified reliably because the updated desktop state could not be captured.

### Comparison History

1. The regression source showed explicit mentions appended beside the current-document context chip.
2. The implementation moved explicit mentions into the editable text flow and removed the duplicated header collapse control.
3. Post-fix visual evidence is unavailable; no visual pass is claimed.

### Focused Region Comparison

Blocked. The composer and header are the required focused regions, but the updated Tauri window could not be isolated from the user's other running Madora instances.

final result: blocked
## 2026-07-16 Codex Tool Activity Follow-up

### Evidence

- source visual truth path: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-16_22-00-23.png`
- implementation screenshot path: `/tmp/madora-tool-activity-after-polish.png`
- focused comparison path: `/tmp/madora-tool-activity-after-polish-crop.png`
- dark-theme verification path: `/tmp/madora-tool-activity-dark.png`
- viewport: `1456 × 768`, light theme, right panel width `556px`
- state: completed read-only Codex turn with commentary, two command activities and a final answer

### Comparison History

1. Pass 1 exposed `/bin/zsh -c` in a command title and omitted the separating space in the group count.
2. Fix: shell wrappers now stay in technical details, `commandActions` generate semantic labels, and summaries use natural spacing.
3. Pass 2 compared the reference and implementation together. Both use a low-noise processing header, commentary before grouped tool activity, nested disclosure rows and a final answer outside the activity group.

### Verified Interactions

- The live processing disclosure exposes `aria-expanded` and stays open while the turn runs.
- The group disclosure summarizes two commands as a file-reading workflow.
- Each command is a nested disclosure with a semantic title.
- The final answer renders after the processing trace.
- Reopening a completed thread collapses the historical processing trace by default.
- The same completed trace remains readable in Madora's dark theme; the original follow-system preference was restored after verification.
- Madora retains its existing side-panel typography, colors, spacing, icons and composer treatment instead of copying Codex branding.

### Known Protocol Limit

- Codex App Server sidecar `0.144.4` does not return completed command items from `thread/read` or `thread/turns/list`, and does not implement `thread/items/list`. The live visual state passes QA; exact historical tool-detail replay remains limited by the fixed sidecar contract and is not replaced with direct JSONL access.

final result: passed

## 2026-07-17 File Change Hover Preview

### Evidence

- source visual truth path: `/Users/refinex/Library/Application Support/PixPin/Temp/PixPin_2026-07-17_19-57-03.png`
- implementation screenshot path: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/com.openai.sky.CUAService/Madora Screenshot 2026-07-17 at 8.29.31 PM.jpeg`
- viewport: `1455 × 774`
- state: Madora desktop with the AI history chooser open; no completed turn with replayable file-change diff

### Full-view Comparison Evidence

The source shows a hovered file-change row with a large diff preview above the summary card. The desktop build opened successfully, but the fixed Codex sidecar does not replay completed file-change items or turn diffs from history. Reproducing the target state would require modifying a real workspace document, which is outside this visual-verification pass.

### Focused Region Comparison

Blocked. The implementation capture does not contain a file-change summary row, so a trustworthy same-state crop cannot be produced. Component tests cover the hover trigger, accessible preview region, diff content, bounded long-output rendering, and click-to-open callback, but they are not a substitute for visual comparison.

### Verified Interactions

- Hovering a file row opens its diff preview in the rendering test.
- The preview exposes an accessible named region.
- Clicking a validated Markdown row calls the existing open-document callback.
- Long diffs render a bounded head/tail preview with an omitted-line marker.

### Findings

- [P1] Same-state desktop capture unavailable.
  - Location: AI panel completed-turn change summary.
  - Evidence: the reference contains a hovered diff card; the implementation capture only exposes the history chooser.
  - Impact: spacing, collision handling, scroll height, typography, and theme fidelity cannot be visually approved from real desktop evidence.
  - Fix: create a fresh disposable file-change turn in a user-approved test workspace, hover its summary row, and capture the same light-theme state.

### Comparison History

1. The current Madora desktop build and AI panel opened successfully.
2. The available restored thread did not contain historical tool or diff items, so the target state remained unavailable.

final result: blocked

## 2026-07-18 Composer Add Menu

### Evidence

- source visual truth path: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-02873a54-c8fa-4122-bf1a-6cb0805d04d5.png`
- initial menu screenshot path: `/Users/refinex/.codex/visualizations/2026/07/18/019f736a-151b-73d1-a98c-074251bcdc73/madora-add-menu-initial.png`
- detected-plugin screenshot path: `/Users/refinex/.codex/visualizations/2026/07/18/019f736a-151b-73d1-a98c-074251bcdc73/madora-add-menu-detected.png`
- viewport: `1280 × 720`, light theme, `556px` Codex composer
- state: initial add menu open; secondary evidence shows one detected plugin

### Full-view And Focused Comparison

The menu follows the composer width, opens directly above it, keeps the footer controls visible, and uses the reference's two-section hierarchy. Goal, plan and plugin descriptions stay inline. The requested Codex copy intentionally replaces ChatGPT's app and skill rows with file/folder selection, disabled goal and plan placeholders, and explicit plugin detection.

- Fonts and typography: existing Madora UI fonts and compact label/description hierarchy remain clear at the side-panel scale.
- Spacing and layout rhythm: full-width placement, edge alignment, row height, section spacing, radius, border and elevation match the reference composition.
- Colors and tokens: neutral foreground, muted placeholder text and disabled-state opacity use existing Madora tokens with sufficient contrast.
- Image quality and assets: this system menu requires no raster assets; icons come from the project's existing Lucide set.
- Copy and content: web-search, MCP-count, document-mention and runtime-version rows are absent; the approved capability labels are present.

### Interactions Tested

- Add menu opened from the composer.
- File/folder submenu exposed separate file and folder choices.
- Goal and plan rows remained disabled.
- Initial plugin action remained available without startup prefetch.
- Detected-plugin state preserved inline name and description.
- Browser console contained no errors.

### Findings And Comparison History

1. First pass found a P2 mismatch: the menu retained a narrow fixed width and stacked descriptions.
2. Fix: derive the popup width from the composer surface, align it to the surface edge, and render goal, plan and plugin descriptions inline.
3. Post-fix comparison found no actionable P0/P1/P2 differences.

### Residual Test Gaps

- The browser preview verifies the real composer component and menu interaction, while the native picker and live App Server plugin response remain covered by frontend and Rust contract tests rather than this visual state.

final result: passed

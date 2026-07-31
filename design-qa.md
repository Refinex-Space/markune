# Task Progress Density Design QA

- source visual truth path: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-0d303ae0-5789-4972-9b5b-48bd8c2f8c59.png`
- implementation screenshot path: `/tmp/madora-task-progress-compact.jpeg`
- focused source path: `/tmp/madora-task-progress-source-focus.png`
- focused implementation path: `/tmp/madora-task-progress-compact-focus.jpeg`
- viewport: `1456 × 769`
- state: 本地 `pnpm desktop:dev`、浅色主题、右侧 AI 面板约 330px、活跃 Default turn、第 2 / 3 步、点击后固定展开任务列表

## Full-view comparison evidence

源图和本地开发版实现截图已在同一次比较中打开。两者都把进度胶囊居中放在输入框正上方，并将任务列表向上展开。实现将胶囊与输入框的垂直间距从 `8px` 收紧为 `4px`，胶囊高度由 `36px` 收紧为 `32px`，没有遮挡输入框或挤压底栏操作。

## Focused region comparison evidence

源图与本地开发版实现均裁剪到“任务列表 + 进度胶囊 + 输入框顶部”区域并在同一次比较中检查。实现浮层最大宽度为 `400px`，外层内边距为 `6px`，步骤行采用 `32px` 最小高度、`6px` 纵向内边距和 `12px` 字号；相比修改前减少了无效留白，同时保留了三行任务的可读性和状态层级。

## Findings

- 没有发现可执行的 P0、P1 或 P2 差异。
- 字体和排版：沿用应用现有 UI 字体；列表文字从 `13px` 收紧到 `12px`，当前步骤仍使用轻量加粗，中文步骤可自然换行。
- 间距和布局：胶囊与输入框间距已压缩到 `4px`；浮层锚点间距由 `8px` 收紧到 `6px`，列表行和图标间距同步收紧。
- 颜色和令牌：继续使用现有 `background`、`border`、`muted`、`primary` 令牌，没有引入新的固定颜色。
- 图标和图像：继续使用项目已有 Lucide 图标，尺寸随行高同步缩小；没有新增位图、占位资源或自绘 SVG。
- 文案和交互：步骤内容仍由 App Server 提供；Hover 临时展开、点击固定、Escape 关闭和活动 turn 清理逻辑不变。

## Comparison history

- Pass 1: 用户截图指出胶囊与输入框顶部间距偏大，展开浮层横向和纵向密度偏松。
- Fix: 外层 `pb-2` 改为 `pb-1`，胶囊 `h-9` 改为 `h-8`；浮层最大宽度由 `440px` 改为 `400px`，并收紧内边距、行高、图标尺寸和锚点间距。
- Pass 2: 在本地 `src-tauri/target/debug/bundle/macos/Madora.app` 真实开发程序中启动三步任务，点击固定展开浮层并重新截图；胶囊与输入框间距稳定，三步列表完整可读，无 P0/P1/P2 问题。

## Primary interactions tested

- 本地开发版真实 `turn/plan/updated` 触发进度胶囊。
- 点击胶囊固定展开三步列表。
- 自动化测试覆盖 Hover 离开关闭、点击固定、Escape 关闭和密度样式回归。
- Computer Use 不暴露 WebKit console；以生产 TypeScript 构建、全量 Vitest 和本地开发程序真实运行替代本轮 console 检查。

## Follow-up polish

- 无阻塞项。带文件数与增删行统计的长胶囊仍由现有 `max-w-full + truncate` 约束，后续仅需在真实文件变更任务中补充窄面板截图。

final result: passed

# Daily calendar rendered-preview refinement QA

## Comparison target

- Source visual truth: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-4e2312bc-3e22-4480-a938-7e020a1c8443.png`
- Rendered implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-rendered-preview.png`
- Supplemental fade state: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-fade-preview.png`
- Focused source card: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/source-card-focus.png`
- Focused implementation card: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/implementation-card-focus.png`
- Focused source inspector: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/source-inspector-focus.png`
- Focused implementation inspector: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/implementation-inspector-focus.png`
- State: Madora desktop, light theme, July 2026 month view. The source shows a fixed-format empty-note inspector; the implementation intentionally selects real populated Daily entries to verify the requested complete rendered Markdown state.

## Viewport and normalization

- Source pixels: `5120 x 2694`; the supplied macOS capture is a high-density image corresponding to approximately `2048 x 1078` logical pixels.
- Implementation pixels: `1366 x 768`; Computer Use capture of the maximized Tauri debug bundle at density `1`.
- The source and implementation differ in viewport and real workspace content, so the review compares responsive composition and focused regions rather than claiming pixel equality. Both full views were opened together in one comparison input; focused card and inspector crops were then inspected at original captured resolution.

## Full-view comparison evidence

- The calendar keeps the source's flat month grid, compact toolbar, selected-day border, fixed right column, quiet dividers, and persistent bottom action.
- Calendar excerpts no longer end at a hard two-line clamp. The text remains naturally wrapped inside a bounded preview region and loses opacity toward the lower edge while the title and task ratio remain stable.
- The right column no longer reconstructs title, excerpt, progress, and update time as separate summary blocks. It renders the selected Markdown through the same read-only document renderer used elsewhere in Madora, including headings, paragraphs, task lists, inline code, and long-form scrolling.
- Empty dates retain the explicit non-mutating creation state; selecting a date alone does not create a file.

## Focused-region evidence

- Card comparison: the source establishes the desired small-text preview hierarchy. The implementation preserves that hierarchy and replaces the abrupt ellipsis treatment with a CSS mask gradient. The selected border, date chip, title, and task ratio remain sharp because the mask is scoped only to the excerpt.
- Inspector comparison: the source exposes the limitation of a fixed schema. The implementation crop shows real H1/H2 hierarchy, bullets, checkboxes, inline code, and the document scrollbar while keeping `打开详情` pinned outside the scrolling content.
- Live interaction: scrolling the rendered Markdown exposed `回到顶部` and changed the visible document position while the bottom `打开详情` action remained reachable.

## Required fidelity surfaces

- Fonts and typography: complete Markdown inherits Madora's document font, heading scale, 15 px body size, and line-height. The inspector-specific width override removes the prior narrow text column without changing renderer typography.
- Spacing and layout rhythm: the 320 px inspector remains aligned with the calendar header and grid. Its renderer uses `1.25rem` horizontal padding and full available content width; the pinned footer keeps a consistent 12 px action inset.
- Colors and visual tokens: borders, muted excerpts, brand selection, task checks, and Markdown foregrounds use existing tokens. The fade is alpha-only and does not introduce a new color.
- Image quality and asset fidelity: no new raster imagery, custom SVG, CSS illustration, or placeholder asset was introduced. Existing renderer asset resolution remains active through the workspace root path.
- Copy and content: fixed metadata labels were removed from existing-note preview. All visible body text now comes from the selected Markdown; product copy remains only for loading, error, empty, retry, create, and open actions.
- Accessibility and interaction: date cells preserve selected semantics; the full preview is read-only; loading/error/retry states are explicit; scrolling and the persistent open action were verified in the Tauri accessibility tree.

## Findings

- No actionable P0, P1, or P2 visual or interaction issue remains.
- Expected difference: source and implementation show different selected dates because a populated real Daily was required to verify complete rendering; the surrounding calendar composition remains equivalent.

## Comparison history

1. Initial implementation pass: complete Markdown rendered correctly, but the inherited wide-page `75%` max-width and `2rem` frame padding compressed text into an unnecessarily narrow column inside the 320 px inspector. Classified P2 for readability.
2. Fix applied: scoped `.daily-notes-rendered-preview` overrides now use full available editor width with `1.25rem` horizontal padding. The rebuilt Tauri capture shows substantially longer line lengths, intact renderer hierarchy, and no calendar-width regression.
3. Post-fix interaction pass: long task content scrolls independently, `回到顶部` appears after scrolling, `打开详情` remains pinned, and selecting an empty date remains non-mutating. No P0/P1/P2 issue remains.

final result: passed
---

# Windows 外层标题栏设计 QA

- source visual truth:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-5e9aaeed-85d5-491f-b8fc-1575c08cfc46.png`
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-14715a9e-a4f3-4210-96f0-ed99ae25a9ea.png`
- implementation screenshot: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-windows-outer-titlebar.png`
- full-view comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-windows-titlebar-full-comparison.png`
- focused comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-windows-titlebar-focus-comparison.png`
- viewport: implementation `1280 × 720` CSS px, `devicePixelRatio: 1`
- pixel dimensions: source baseline `1920 × 704`, source reference `1600 × 154`, implementation `1280 × 720`
- density normalization: full view preserves each screenshot's aspect ratio; focused comparison scales both titlebar regions to the same 1600 px width before comparison
- state: Windows layout simulation, light theme, empty workspace, expanded left sidebar

## Full-view comparison evidence

- The prior Madora screen placed window controls inside the rounded main panel and reserved a visibly empty strip after the custom tools.
- The implementation creates a dedicated `32px` outer titlebar. Window controls occupy the window's top-right edge while the rounded main panel begins at `y = 40`, preserving the existing `8px` panel gutter below the titlebar.
- The sidebar begins below the outer titlebar, while its collapse, pin, and refresh controls remain in the outer strip. The content panel and sidebar therefore read as one workspace below a single window-level chrome row.

## Focused comparison evidence

- The reference and implementation titlebar regions were placed in one comparison image. Both show the native window group on the highest outer row and product-specific controls on the lower content row.
- The implementation's custom header tools end at `x = 1259`; the main panel ends at `x = 1272`, leaving the existing 13 px optical inset without the former 136 px native-control reservation or divider.
- The outer titlebar spans `x = 0–1280`, and the window controls span `x = 1148–1280`, so minimize, maximize, and close retain the Windows top-right edge target.

## Required fidelity surfaces

- Fonts and typography: unchanged; no text styles, weights, line heights, or wrapping changed.
- Spacing and layout rhythm: the outer titlebar is 32 px high, the main panel starts 8 px below it, and custom tools align to the main panel's right padding.
- Colors and visual tokens: the titlebar uses the existing `bg-sidebar` and `border-sidebar-border` tokens; the main panel's background, border, radius, and shadow are unchanged.
- Image quality and asset fidelity: no raster assets, logos, or icons were added or replaced; existing Lucide controls are reused.
- Copy and content: no product copy changed.

## Primary interactions and runtime checks

- Browser layout measurements confirmed the outer titlebar, main content block, main panel, native-control group, sidebar controls, and custom-tool group do not overlap.
- Source tests confirm the Windows-only `pt-8` content offset, full-width outer titlebar, and removal of the old 136 px reservation and divider.
- The browser-rendered simulation displayed no runtime error overlay.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- The reference application's exact icon sizing differs slightly, but Madora intentionally keeps its established Windows control icons and hover behavior; this is not an actionable fidelity issue for the requested hierarchy change.

## Comparison history

- Iteration 1: the implementation moved the native control group to a full-width outer titlebar, moved workspace content below it, and allowed custom tools to use the main panel's full right edge. The combined full-view and focused comparisons showed no P0/P1/P2 issue, so no corrective visual iteration was required.

final result: passed

# Goal Mode Design QA

- source visual truth paths:
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-95ab7bc5-5fdc-4379-9ec7-a4bf62380ad1.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-ee79750f-388a-4117-8c7f-889c369d0696.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-3d029217-bf46-44c4-ad28-a708cdd9eb70.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-9f05a514-30c5-4491-b21a-077a5f05bf7a.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-9bb45bbf-4963-48f2-b559-b7bdf28d6cb4.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-a696d12d-eefa-43de-a286-52f581fdcf07.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-02ae3019-bf89-42bd-b0fe-a0ffd10b9333.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-1181359a-b0b5-4d0c-894e-61a423323f45.png`
- runtime: `pnpm desktop:dev`, fixed sidecar `codex-cli 0.144.4`
- implementation surface: `components/workspace/ai-panel.tsx`, `components/workspace/codex-app-server.ts`, `src-tauri/src/codex.rs`

## Reference-to-implementation mapping

- `+` 菜单：目标入口位于文件和文件夹之后、计划模式之前，复用现有紧凑菜单行、Goal 图标、标题、说明和选中勾选态。
- `/` 菜单：目标命令位于压缩与 Skill 分组之前，支持查询 `goal` / `目标`、键盘上下选择、Enter/Tab 确认和 Escape 关闭。
- 目标草稿：输入框底栏显示“Goal 图标 + 目标”，占位文案固定为“描述你的目标，定义可衡量的成果，以获得最佳效果”。
- 运行状态：目标条贴在输入框上方，单行展示生命周期、objective、实时运行时长以及编辑、暂停/恢复、清除操作；窄面板通过 objective 截断保持按钮可达。
- 编辑目标：居中 Dialog 使用 576px 最大宽度、大文本区、字符计数、取消和保存；保存直接更新 App Server objective，运行中由 Core 注入 steering。
- 既有消息：用户消息下方提供复制和“设为目标”，在已有线程中直接创建 active Goal。

## Interaction verification

- 前端测试覆盖加号入口、斜杠入口、目标占位、状态条、编辑、暂停、恢复、清除、既有消息设为目标以及首次 `turn/start -> thread/goal/set` 顺序。
- Rust 测试覆盖方法白名单、4,000 字符边界、非法状态、伪造字段、控制字符和 token budget 拒绝。
- 使用临时 Codex Home 启动真实固定 sidecar，完成 `initialize -> thread/start -> goal/set(paused) -> goal/get -> goal/set(objective) -> goal/clear`，所有响应与 Schema 一致且临时数据已清理。
- macOS 会话在本轮视觉验收时处于锁屏状态；Computer Use 无法解锁，窗口级截图也只返回受保护的黑色表面。未伪造实现截图，也未改用安装版 Madora。当前源码构建的 `pnpm desktop:dev` 已保持运行，解锁后可直接做最后的像素级复核。

## Findings

- 协议、生命周期、安全桥接和自动化渲染交互没有未解决的 P0/P1/P2 问题。
- 像素级对照仍有一个非代码阻塞：macOS 锁屏阻止读取本地开发窗口。该项不影响构建、测试或真实 App Server 协议验证，但不能被表述为已完成的截图比较。

final result: passed for protocol, interaction, and automated rendering; live pixel comparison pending macOS unlock

# Context Usage And Compaction Design QA

- source visual truth paths:
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-151a49d8-72c6-4354-bf49-e8f0c35f3fea.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-2526fe20-923c-4d7e-8a0d-e98e5d16d9f1.png`
  - `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-b3c1c019-bb07-4d22-96a0-343e09ab43da.png`
- implementation screenshot paths:
  - `/tmp/madora-context-dynamic-progress-focus.jpeg`
  - `/tmp/madora-context-compact-enabled-focus.jpeg`
- viewport: `1456 × 769`
- state: 当前源码构建的 `src-tauri/target/debug/bundle/macos/Madora.app`、浅色主题、右侧 AI 面板、恢复一条已有任务、上下文占用 `20.9k / 258.4k`（`8%`）、输入 `/` 展开命令与 Skill 菜单

## Full-view comparison evidence

参考图与当前本地调试程序截图已并排检查。实现把上下文圆环放在模型选择器左侧，提示卡从该圆环向上展开，信息层级与参考图一致：窗口标题、整数已用与剩余百分比、已用和总上下文标记数。输入 `/` 后，压缩入口位于 Skill 分组上方，不改变已有 Skill 列表结构。

## Focused region comparison evidence

实现截图已裁剪到“上下文提示 + 动态圆环 + 输入框底栏”和“压缩命令 + Skill 列表 + 输入框”区域检查。窄面板下提示卡没有溢出或遮挡模型、推理强度和发送按钮；三行居中布局、文字权重和圆角卡片与参考图保持同一层级。压缩命令保持单行并显示当前任务占用百分比，列表沿用既有圆角、边框、滚动条和选中态。

## Findings

- 没有发现可执行的 P0、P1 或 P2 视觉差异。
- 字体和排版：沿用现有 UI 字体和字号层级；百分比是提示卡主信息，标记数为次级说明。
- 间距和布局：上下文圆环紧邻模型选择器，不额外扩大底栏高度；命令区与 Skill 区共享现有菜单容器。
- 颜色和令牌：圆环、文字、浮层、禁用态均复用主题令牌，暗色主题无需独立硬编码颜色。
- 图标和图像：使用现有 Lucide `Circle` 叠加轨道与用量弧线，弧长由真实百分比驱动并平滑过渡；压缩时使用 `LoaderCircle` 旋转态，没有新增依赖、位图、自绘 SVG 或占位资源。
- 文案和交互：空任务显示“发送首条消息后显示”并呈现 0% 空环；已有任务显示真实 App Server 用量与剩余比例；活动 turn、审批、用户输入或压缩进行中均会给出明确禁用原因。

## Comparison history

- Pass 1: 在新任务中确认上下文圆环和 `/压缩` 入口可见；压缩因尚未建立上下文而正确禁用。
- Pass 2: 从本地历史记录只读恢复已有任务，收到 App Server `thread/tokenUsage/updated`，圆环显示 `8%`；点击圆环后提示卡显示 `20.9k / 258.4k`。
- Pass 3: 在同一任务输入 `/`，压缩命令位于 Skill 分组上方并处于可用状态；清理草稿后未执行压缩，避免改变真实任务历史。
- Pass 4: 参考最新截图改为三行提示卡，补充剩余百分比；使用当前源码重新构建本地 Debug App，恢复任务后显示 `8% 已用（剩余 92%）` 与 `20.9k / 258.4k`，圆环弧长对应 8%。

## Primary interactions tested

- 恢复历史任务后按 `threadId` 更新上下文用量。
- 自动化 rerender 验证用量从 `58%` 更新到 `77%` 时圆环弧线样式同步变化。
- 点击上下文圆环展示完整用量提示，键盘焦点可达。
- 输入 `/` 展开命令与 Skill 菜单，压缩入口优先展示。
- 新任务禁用压缩并展示原因；已有空闲任务允许选择。
- 本轮只使用当前源码构建的本地调试程序，未启动或验证 `/Applications/Madora.app`。

## Follow-up polish

- 无阻塞项。自动压缩由 Codex Core 的原生阈值负责，客户端没有重复倒计时或阈值，因此需在真实长任务达到阈值时做一次长期运行观察，而不是通过 UI 人工伪造。

final result: passed

# Sent Mention Baseline Design QA

- source visual truth path: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-72a8a26f-8d69-4354-9060-8540011dbd32.png`
- implementation screenshot path: unavailable
- viewport: source screenshot `2048 × 712`; local desktop viewport unavailable to automation
- state: 浅色主题、主工作区 Codex 会话、已发送用户消息同时包含普通文字和文档 mention

## Full-view comparison evidence

参考截图显示普通文字“总结”的基线低于文档 mention。当前本地开发程序使用原生 Tauri 窗口，桌面自动化只能解析安装版 `/Applications/Madora.app`，无法安全绑定正在运行的 `target/debug/madora`，因此本轮没有伪造或借用安装版实现截图。

## Focused region comparison evidence

代码和生成 CSS 已做聚焦验证：mention 从独立的 `inline-flex + items-center + font-sans` 改为普通 `inline` 文本，并显式使用 `font: inherit` 与继承行高；文件、插件和 Skill 图标移动到独立 `inline-flex` 图标槽，通过 `vertical-align: -0.125em` 做光学校正。浏览器读取本地 `pnpm desktop:dev` 的 CSS 输出，确认上述三条规则均已生成。

## Findings

- [P2] 缺少同状态的本地 Tauri 实现截图，无法完成源图与实现图的并排像素比较。
- 字体和排版：mention 文字不再使用独立字体族、字号或行高，理论上与同一文本节点共享基线。
- 间距和布局：文字不再参与 flex 垂直居中；只有 16px 图标保留 `6px` 右间距和 `-0.125em` 垂直校正。
- 颜色和令牌：链接颜色、Hover、焦点环和主题行为未改动。
- 图标和图像：继续使用现有文件、真实插件和 Skill 图标，没有新增或替换资源。
- 文案和内容：消息文本及 mention 区间保持不变。

## Comparison history

- Pass 1: `inline-flex + items-center + font-sans` 使 mention 形成独立字体度量与 flex 基线，截图中普通文字明显偏低。
- Fix: mention 改为普通行内文本并完整继承字体；图标从文字布局中拆出，单独下沉 `0.125em`。
- Post-fix evidence: 48 项定向渲染测试、87 项相关 AI 面板测试、396 项全量测试和桌面 Web 构建通过；本地生成 CSS 包含精确的 `display: inline`、`font: inherit` 与 `vertical-align: -0.125em` 规则。

## Implementation Checklist

- 在当前 `pnpm desktop:dev` 窗口发送同时包含普通文字和文档 mention 的消息。
- 截取同一消息行，确认中文、英文和 mention 链接共用同一文字基线。
- 若仍有图标光学偏差，只调整图标槽的 `vertical-align`，不要再次移动 mention 文字。

final result: blocked

# Workspace Menu And Global Search Shell Design QA

- source visual truth paths:
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-26cf02f7-17b3-4da5-ba87-05b506f7d41d.png`
  - `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-649c8d94-c9e1-46bc-9d35-01bf87b4ee4e.png`
- implementation screenshot paths:
  - `C:/Users/Administrator/.codex/visualizations/2026/07/22/019f875e-5809-7e80-ba25-ef1dcd229a0a/madora-workspace-menu-flat.png`
  - `C:/Users/Administrator/.codex/visualizations/2026/07/22/019f875e-5809-7e80-ba25-ef1dcd229a0a/madora-global-search-flat.png`
- viewport: implementation `1280 × 720` CSS px, `devicePixelRatio: 1`
- pixel dimensions: menu source `357 × 222`, search source `1897 × 726`, both implementation captures `1280 × 720`
- density normalization: source density is unavailable; comparison was normalized by matching the same open states and judging the component shells rather than absolute full-screen scale
- state: 浅色主题、未打开工作区、工作区菜单展开、全局搜索空查询弹窗展开

## Full-view comparison evidence

两张用户参考图与两张浏览器实现图已在同一次比较输入中打开。实现保留原有宽度、位置、边框、内边距、文案和遮罩，只把菜单与搜索弹窗外壳统一收紧为 `8px` 圆角，并移除外部高程阴影。两个浮层仍与现有侧栏和主题令牌保持一致。

## Focused region comparison evidence

菜单参考图本身就是组件聚焦裁切；实现同时通过浏览器计算样式确认菜单为 `218 × 80`、`border-radius: 8px` 且阴影完全透明。全局搜索实现通过浏览器计算样式确认弹窗为 `768 × 176`、`border-radius: 8px`，仅保留边界用的 `1px` ring，没有高程阴影。无需额外裁切即可判断本次只涉及的圆角与阴影表面。

## Findings

- 没有发现可执行的 P0、P1 或 P2 差异。
- 字体和排版：未修改，标题、操作项、输入占位和空状态文案保持原有层级。
- 间距和布局：未修改浮层宽高、定位、内边距与行高；圆角从较柔和卡片感收紧为统一 `8px`。
- 颜色和令牌：继续使用 `popover`、`border`、`ring` 和现有遮罩令牌，没有引入固定颜色。
- 图标和图像：继续使用项目已有 Lucide 图标，没有新增或替换资产。
- 文案和内容：工作区操作项与全局搜索文案完全不变。

## Comparison history

- Pass 1: 参考图中的菜单使用较大圆角和明显投影，全局搜索外壳同样偏圆润，形成独立上浮卡片感。
- Fix: 菜单由 `rounded-lg shadow-lg` 改为 `rounded-md shadow-none`；全局搜索由 `rounded-xl` 改为 `rounded-md shadow-none`。
- Pass 2: 浏览器重新打开两个浮层并截图；计算样式均为 `8px` 圆角且无高程阴影，未发现新的 P0/P1/P2 问题。

## Primary interactions tested

- 点击工作区标题展开菜单，两个操作项保持可见。
- 点击左侧全局搜索按钮打开弹窗，输入框自动获得焦点。
- 浏览器控制台错误检查：`0`。
- 自动化回归测试校验两个外壳不再包含旧圆角与旧阴影类名。

## Follow-up polish

- 无阻塞项。若后续希望更接近完全直角，可单独评估 `4px` 圆角，但本轮按“轻微一点点、偏矩形”采用 `8px`，兼顾现有控件体系的一致性。

final result: passed

---

# 主面板内嵌画布设计 QA

- source visual truth:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-96f7fb39-6561-481a-8062-9093419dd745.png`
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-2e0d131e-967f-4c8a-9b52-93824a05ed25.png`
- implementation screenshot: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-main-panel-inset.png`
- full-view comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-main-panel-comparison.png`
- focused comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-main-panel-focus-comparison.png`
- viewport: 1920 × 1032 CSS px
- pixel dimensions: source 1920 × 1032; implementation 1920 × 1032
- density normalization: source and implementation use matching dimensions; implementation `devicePixelRatio = 1`
- state: light theme, empty workspace, expanded left sidebar

## Full-view comparison evidence

- The source Madora panel was flush with the top, right, and bottom window edges. The implementation places the main panel at `y = 8`, `right = 1912`, and `bottom = 1024`, producing an even 8 px outer gutter.
- The expanded sidebar ends at `x = 280` and the main panel begins at `x = 288`, producing an 8 px left gutter that also contains the resize hit area.
- The main panel remains a single restrained surface. Existing radius, border, shadow, content alignment, and empty-state placement are unchanged.

## Focused comparison evidence

- The top-left crop confirms that the main panel no longer touches the top or sidebar edge.
- The bottom-right crop confirms a visible but restrained gutter without increasing shadow weight or corner radius.
- The browser-rendered capture does not include Tauri's native Windows controls. Their `top-2 right-2` alignment is covered by the source contract test; a native-window visual glance remains optional P3 polish.

## Required fidelity surfaces

- Fonts and typography: unchanged; empty-state hierarchy, weight, line height, and wrapping match the existing Madora screen.
- Spacing and layout rhythm: 8 px on all four main-panel edges; the same inset remains when the sidebar collapses. At 1366 × 768 there is no body overflow.
- Colors and visual tokens: existing `bg-sidebar`, `bg-background`, border opacity, and shadow tokens are preserved, so the gutter reads as shell depth instead of a new color block.
- Image quality and asset fidelity: no image, icon, logo, or generated asset changed.
- Copy and content: no product copy changed.

## Interaction and runtime checks

- Sidebar collapse and expansion were exercised. Collapsed state keeps the panel at `x = 8`; expanded state keeps an 8 px gap after the sidebar.
- 1920 × 1032 and 1366 × 768 layouts were measured with no horizontal or vertical document overflow.
- Browser console warnings/errors checked: none.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains.
- P3: native Windows control alignment was not available in the browser-rendered capture; static layout coverage confirms the intended inset.

## Comparison history

- Iteration 1: the first rendered comparison showed the requested uniform inset, retained the existing visual language, and produced no P0/P1/P2 finding. No corrective visual iteration was required.

final result: passed

---

# Windows 工作区标题与响应式文档 Tab 设计 QA

- source visual truth:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-ebdff35c-0ada-4814-b39a-23e6eb7ffccd.png`
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-c412fd5b-c2f0-4fd0-a4fe-bd3fce80a8ff.png`
- implementation screenshots:
  - `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-tab-overflow-closed.png`
  - `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-tab-overflow-open.png`
- full-view comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-tab-header-full-comparison.png`
- focused comparison: `C:\Users\Administrator\.codex\visualizations\2026\07\22\019f875e-5809-7e80-ba25-ef1dcd229a0a\madora-tab-header-focus-comparison.png`
- viewport: implementation `1280 × 720` CSS px, `devicePixelRatio: 1`
- pixel dimensions: full source `1920 × 1038`, focused source `1920 × 366`, implementation captures `1280 × 720`
- density normalization: the full source was proportionally reduced to 1280 px width; the focused header comparison uses the same 1280 px width for source, closed implementation, and open implementation
- state: Windows layout simulation, light theme, expanded sidebar, fourteen representative document tabs; preview-only mock tabs were removed before final verification

## Full-view comparison evidence

- The prior Windows screen left a 40 px sidebar spacer below the outer titlebar and placed document tabs on a separate row below the main header.
- The implementation reduces the Windows-only sidebar spacer to 8 px. The workspace title row begins at `y = 40`, matching the main panel header's `y = 41` optical edge.
- Document tabs and the custom header tools now share the same row. Tab centers and tool-button centers both sit at approximately `y = 57`, while the content surface gains the former tab-row height.

## Focused comparison evidence

- The combined header comparison shows the source empty band, the closed responsive tab row, and the expanded overflow menu in one image.
- At 1280 px viewport width, the tab bar receives 768 px, shows three 184 px representative tabs, and places the overflow trigger at `x = 1041–1069`; the custom tool group starts at `x = 1073`, leaving a consistent 4 px gap without overlap.
- The open menu is `256 × 288` px, contains eleven overflow items, aligns to the trigger's right edge, and uses internal vertical scrolling. The page remains exactly `1280 × 720` with no body overflow.
- Two short 16 px separators are visible between the three rendered tabs. Their transparent endpoints keep the division quieter than a full-height border.

## Required fidelity surfaces

- Fonts and typography: existing 14 px tab typography, truncation, active weight, and tool-icon sizing are preserved.
- Spacing and layout rhythm: workspace title, tabs, overflow trigger, and header tools share one horizontal rhythm; the main panel retains its existing 8 px outer inset.
- Colors and visual tokens: active and hover states continue using `muted`, `foreground`, `border`, and `popover` tokens; the separators use the existing border token with transparent endpoints.
- Image quality and asset fidelity: no raster assets or custom icons were introduced; the existing Lucide ChevronDown, close, and plan icons are reused.
- Copy and content: document titles remain unchanged and the overflow control keeps the accessible label `显示更多打开的文档`.

## Primary interactions and runtime checks

- Responsive measurement confirmed that the visible tab count contracts before the tool group and reserves 32 px for the overflow trigger.
- Clicking the overflow trigger opens the bounded menu directly below the header; eleven additional tabs remain reachable through its scrollbar.
- Automated interaction tests cover tab selection, tab closing, context-menu actions, overflow selection, active-tab promotion, responsive width calculation, and menu height/scroll classes.
- The browser-rendered simulation displayed no runtime error overlay.

## Findings

- No actionable P0, P1, or P2 visual or interaction issue remains.
- The focused source does not specify an overflow-menu treatment; the implementation follows Madora's existing popover surface, radius, shadow, and keyboard-accessible DropdownMenu behavior.

## Comparison history

- Iteration 1: the first combined comparison showed aligned workspace and main-header rows, a collision-free responsive tab limit, readable faded separators, and a bounded scroll menu. No P0/P1/P2 correction was required.

final result: passed

---

# 独立 AI 与元信息侧边面板设计 QA

- source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-b951e5cf-acd7-4428-b6e4-65182d85786e.png`
- implementation capture: 运行中的 Windows Tauri 桌面窗口，`1920 × 1032`，深色主题
- states: AI 紧凑面板、元信息紧凑面板

## Full-view comparison evidence

- 原界面把右侧内容包在主编辑面板内部，顶部与底部边界连续，无法形成独立的侧边层级。
- AI 状态下，主面板和右侧面板现在分别拥有完整四边圆角、边框与轻阴影；两者垂直边界同高，视觉间距约 8 px。
- 元信息状态复用同一独立面板外壳。主面板根据元信息面板宽度自然收缩，圆角、边框、阴影和外侧留白与 AI 状态保持一致。
- 面板间的拖拽热区位于间距内部，没有增加额外可见分割线或破坏留白。

## Required fidelity surfaces

- Spacing and layout rhythm: 主面板、侧边面板与窗口边缘继续使用既有 8 px 节奏；面板间距保持轻微且清晰。
- Colors and visual tokens: 两块面板共用 `bg-background`、`border-border/70` 和同一组阴影 token，没有引入新的色块或高浮阴影。
- Border and radius: AI 与元信息面板均使用 `rounded-xl`，四角完整可见；主面板原有圆角不再被右侧内容吞并。
- Interaction continuity: AI 面板继续保持持续挂载；切换元信息面板不会重建 AI 运行实例。现有宽度状态与拖拽限制保持不变。
- Copy and assets: 没有修改产品文字、图标或内容资源。

## Findings

- No actionable P0, P1, or P2 visual or interaction issue remains.
- P3: 本轮桌面实拍使用深色主题；浅色主题未单独实拍，但两种面板复用已覆盖的主题 token 与相同结构类。

## Comparison history

- Iteration 1: Windows 桌面实拍确认 AI 和元信息面板均成为与主面板同高的独立圆角卡片，约 8 px 间距稳定，没有双边框、重叠或窗口溢出，无需进一步视觉修正。

final result: passed

---

# Daily calendar design QA

## Comparison target

- Source visual truth: `/Users/refinex/.codex/generated_images/019fb787-37aa-77e2-a66a-374270d39045/exec-8410f7d6-2cd9-46c8-b49c-a9c31ae8c459.png`
- Rendered implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-implementation.jpeg`
- State: Madora desktop, light theme, expanded workspace sidebar, July 2026 month view, July 31 selected, inline date inspector visible, real workspace Daily data.

## Viewport and normalization

- Source pixels: `1717 x 916`; generated desktop artboard, density metadata unavailable.
- Implementation pixels: `1460 x 768`; Computer Use capture of the maximized Tauri window. The native window reported `2560 x 1347`; Computer Use normalized the captured image.
- CSS size/device density: WebKit inspector was not attached, so an exact CSS viewport and `deviceScaleFactor` were not available. Comparison therefore uses normalized full-view proportions rather than pixel-difference claims.
- Both original-resolution images were opened together in one comparison input. Dynamic note density and text differ intentionally because the source contains design-fixture content while the implementation renders the user's real Markdown Daily files.

## Full-view comparison evidence

- Information architecture matches the selected direction: persistent Madora sidebar, compact calendar toolbar, Monday-first month grid, selected-day treatment, and a fixed right-side context inspector.
- The header, grid boundaries, active blue state, low-contrast dividers, white surfaces, and restrained elevation preserve Madora's existing visual language rather than introducing a separate calendar theme.
- The implementation keeps the selected source's flat, quiet month canvas. Real content is sparser than the design fixture, but cell rhythm and hierarchy remain stable.
- The source and implementation screenshots were reviewed together at original resolution; no overlapping controls, clipped persistent actions, broken grid tracks, or hierarchy-changing proportion drift was visible.

## Focused-region evidence

A separate crop was not required: the original-resolution comparison kept the toolbar, month cells, selected state, and inspector legible. Interaction-specific detail was verified in the live Tauri accessibility tree and rendered states:

- Top sidebar `日程` opens the calendar overview.
- Selecting an empty date updates the inspector to `尚未创建每日笔记` without creating a file.
- Month/list switching, search filtering, and refresh preserve the selected month state.
- At the compact breakpoint the inline inspector is replaced by `查看所选日期`; activating it opens a right-side dialog with an explicit Chinese close control.

## Required fidelity surfaces

- Fonts and typography: existing Madora/Geist typography, weights, line heights, truncation, and small-control hierarchy are consistent with the surrounding workspace. No actionable mismatch.
- Spacing and layout rhythm: toolbar, weekday row, month cells, and 320 px inspector maintain the selected design's quiet rhythm. Container-query fallback prevents inspector compression. No actionable mismatch.
- Colors and visual tokens: implementation uses existing foreground, muted, border, sidebar, and brand tokens; selected and progress states preserve the source's restrained blue emphasis. No actionable mismatch.
- Image quality and asset fidelity: the target contains no raster product imagery. Existing Lucide icons are used consistently; no placeholder art, handcrafted SVG, CSS illustration, or substituted asset is present.
- Copy and content: Chinese labels are concise and product-specific. Empty-date copy explicitly explains that browsing does not write files, reducing accidental creation risk.
- Accessibility and interaction: semantic buttons/toggles, accessible names, selected states, search field, dialog title/description, and explicit close action are exposed in the live Tauri accessibility tree.

## Findings

- No actionable P0, P1, or P2 visual or interaction mismatches remain.
- Expected difference: the implementation's content density reflects real Markdown files rather than the source's synthetic populated month. This does not change layout or usability.

## Comparison history

1. First valid comparison: rebuilt debug bundle, July 2026 month view, July 31 selected. No P0/P1/P2 findings; no visual fix iteration was required.
2. Supplemental responsive pass: compact window hid the inline inspector and exposed the detail-drawer trigger; the drawer opened and closed correctly. No P0/P1/P2 findings.

## Implementation checklist

- [x] Full desktop month composition matches the selected visual direction.
- [x] Real Daily summaries render without changing Markdown persistence.
- [x] Empty-date browsing is non-mutating.
- [x] Month/list/search/refresh interactions work in the Tauri build.
- [x] Compact layout and detail drawer work without overlap or clipping.

final result: passed

---

# Daily calendar resizable-inspector refinement QA

## Comparison target

- Source visual truth: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-4e620f95-0fe1-45cb-8402-7839029203cf.png`
- Recommended 420 px implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-resizable-preview.png`
- Dragged implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-resized-preview.png`
- State: Madora desktop debug bundle, light theme, July 2026 month view, July 25 selected, complete rendered Markdown inspector visible.

## Viewport and comparison evidence

- Source pixels: `2048 x 1152`; implementation pixels: `1460 x 768` after Computer Use normalization.
- The source and recommended-width implementation were opened together at original resolution in one comparison input.
- Date labels and card summaries now begin at the upper-left of every month cell. The selected date keeps the same blue emphasis without moving content toward the vertical center.
- The inspector starts at 420 px, which gives headings, list items, and longer Chinese lines enough reading width while preserving a useful six-column calendar area at this viewport.

## Interaction evidence

- Live accessibility state reported `调整每日笔记预览宽度, Value: 420` on a fresh v2 preference key.
- A real pointer drag expanded the inspector to `595.3906` px, inside the enforced 360–640 px range, and the calendar tracks reflowed without overlap or clipping.
- Dragging the divider back restored exactly 420 px. The width continues to use the existing persistent panel-width store.
- The shared resize handle exposes splitter semantics and min/max/current values; unit coverage also verifies Arrow, Home, and End behavior.
- Below the 1180 px container breakpoint, the inline inspector remains replaced by the existing detail drawer instead of compressing the calendar.

## Findings and iteration history

1. Initial rebuilt bundle exposed 360 px instead of 420 px because `Number(null)` converted an absent local-storage value to zero and then clamped it to the minimum.
2. The storage reader now explicitly returns the fallback when the key is absent, and the Daily inspector preference uses a v2 key so the requested 420 px baseline is reliable.
3. Post-fix rebuild and live Tauri pass confirmed 420 px default, 595.3906 px pointer-drag state, exact restoration to 420 px, top-left date alignment, and unclipped rendered content.

## Implementation checklist

- [x] Cell date and summary content align to the upper-left.
- [x] Recommended inline inspector width is 420 px.
- [x] Pointer dragging works within 360–640 px.
- [x] Width persists through the existing workspace panel store.
- [x] Narrow layouts retain the drawer fallback.
- [x] No P0, P1, or P2 visual or interaction issue remains.

final result: passed

---

# Daily calendar date-badge and footer-divider refinement QA

## Comparison target

- Source visual truth: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-c6cd045a-ab5f-4fe7-8006-b552cff107e7.png`
- Rendered implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-date-badges-bottom-divider.png`
- State: Madora desktop debug bundle, light theme, July 2026 month view, July 25 selected, 521 px persisted inspector width.

## Comparison evidence

- Source pixels: `2048 x 1152`; implementation pixels: `1460 x 768` after Computer Use normalization.
- Both original-resolution images were opened together in one comparison input. The full view keeps the month-grid density, selected state, inspector content, and footer action visible, so no separate crop was required.
- Every regular date now uses the existing muted surface token in the same 24 px circular geometry as the selected date. The neutral circles remain subordinate to the blue selected state and do not compete with entry titles.
- The divider above `打开详情` is removed. A bottom divider now continues the month grid's final horizontal edge across the inspector at the same visual level.

## Required fidelity surfaces

- Fonts and typography: date numerals retain the existing size, weight, tabular alignment, and selected-state contrast.
- Spacing and layout rhythm: the date circle does not change card padding or summary placement; the footer remains 12 px padded and the new bottom edge aligns with the calendar.
- Colors and tokens: regular dates use `bg-muted`; selected dates continue to use the established brand blue and white text.
- Image quality and assets: no raster or icon asset is introduced or replaced.
- Copy and content: labels and Daily Markdown content are unchanged.

## Findings and comparison history

1. First implementation used `bg-muted/55`; live capture showed the circle was too faint at the normalized desktop scale.
2. The neutral fill was strengthened to the full `bg-muted` token. The rebuilt desktop capture shows readable circular badges without increasing overall visual noise.
3. No actionable P0, P1, or P2 visual or interaction issue remains.

## Implementation checklist

- [x] Regular dates have a visible neutral circular background.
- [x] Selected date remains visually dominant.
- [x] The action area's top divider is removed.
- [x] The inspector bottom divider aligns with the month grid.

final result: passed

---

# Daily calendar empty-state, dark-divider, and header-containment QA

## Comparison target

- Empty-card source: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-5acaf275-a375-4965-bf0b-0a0f4b2a082c.png`
- Dark-divider source: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-87b1cb31-c483-4300-9761-7cbde1a64c20.png`
- Header-overflow source: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-c05fbae8-4023-485c-8ef4-1691ce0b940b.png`
- Light implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-empty-top-fix-light.jpg`
- Dark implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-border-fix-dark.jpg`
- State: Madora desktop debug bundle, July 2026 month view, July 25 selected, 490 px persisted inspector width.

## Comparison evidence

- All three source captures and both rebuilt implementation captures were opened together at original resolution.
- Untitled or empty Daily entries no longer render the synthetic `空白每日笔记` label. Empty cells keep only their date badge; real excerpts and task progress remain available when present.
- Dark-mode calendar, weekday, inspector, list, and footer dividers now use `muted-foreground` at 25% opacity. The grid remains visually subordinate to content while its row and column structure is readable at the full-window scale.
- The Daily toolbar clamps a negative shared header offset to zero. The title, month controls, view toggle, search, and refresh actions remain inside the Daily content header instead of rising into the macOS/global toolbar area.

## Interaction and regression evidence

- Live accessibility state for both themes reported no `空白每日笔记` text and kept July 25 selected.
- Theme switching was exercised in the rebuilt Tauri bundle; the original light theme was restored after capturing dark-mode evidence.
- The inspector remained resizable and rendered the selected Markdown content; no overlap or clipping appeared around the calendar/header boundary.
- Automated coverage verifies an untitled content entry stays quiet, dark divider classes are applied, and a negative header offset produces `marginTop: 0px`.

## Findings and iteration history

1. The first fix suppressed summaries for `hasContent: false`, but live data exposed untitled entries with `hasContent: true` that still received the synthetic fallback. The fallback was removed from both month and list rendering.
2. The initial dark fix used the base 10% border token. Original-resolution comparison showed it was still marginal, so the dark divider token was raised to `muted-foreground/25` for a clear but restrained grid.
3. Post-fix desktop captures show quiet empty dates, readable dark dividers, and a contained top toolbar. No actionable P0, P1, or P2 issue remains.

## Implementation checklist

- [x] Empty and untitled entries do not display `空白每日笔记`.
- [x] Dark-mode structural dividers remain readable without becoming dominant.
- [x] The Daily toolbar does not overflow into the global top area.
- [x] Light and dark desktop states were captured from the rebuilt bundle.

final result: passed

---

# Daily calendar sidebar-tool-row alignment QA

## Comparison target

- Source visual truth: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-80a5a200-6f47-42a3-8348-b457db7d35a4.png`
- Rendered implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-sidebar-tool-row-aligned.jpg`
- Focused source: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-sidebar-tool-row-source-focus.png`
- Focused implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-sidebar-tool-row-aligned-focus.jpg`
- State: Madora desktop debug bundle, light theme, July 2026 month view, July 31 selected.

## Viewport and comparison evidence

- Source pixels: `2048 x 227`; implementation pixels: `1460 x 768` after Computer Use normalization.
- Source and implementation full views plus their top-region crops were opened together in one comparison input.
- The Daily title, month navigation, today action, month label, view switch, search, and refresh controls now share the same visual centerline as the sidebar workspace switcher, global search, and pinned-content controls.
- The existing 44 px Daily header height and 8 px bottom padding remain unchanged, so the header divider and weekday row keep their established vertical rhythm.

## Required fidelity surfaces

- Fonts and typography: existing compact toolbar sizes, weights, and tabular month label are unchanged.
- Spacing and layout rhythm: the runtime-provided `-6px` alignment offset is restored; unexpectedly larger negative values are bounded at `-8px` to keep the row inside panel chrome.
- Colors and visual tokens: no token, contrast, or selected-state change was introduced.
- Image quality and assets: no new image or icon assets were added.
- Copy and content: all toolbar labels and Daily content remain unchanged.

## Findings and comparison history

1. The previous containment fix clamped every negative offset to zero, leaving the Daily tool row approximately 6 px below the sidebar search/pinned row. Classified P2 because the shared workspace chrome lost its horizontal baseline.
2. The offset now preserves the measured `-6px` value while bounding extreme measurements at `-8px`.
3. The rebuilt desktop capture shows the left and right tool rows on one centerline without overlapping the global header. No actionable P0, P1, or P2 issue remains.

## Implementation checklist

- [x] Daily toolbar aligns with sidebar search and pinned controls.
- [x] The 44 px header geometry and bottom divider remain intact.
- [x] Extreme negative offsets remain bounded inside panel chrome.
- [x] Rebuilt Tauri desktop capture passes the visual comparison.

final result: passed

---

# Daily calendar non-overlapping chrome rows QA

## Comparison target

- Overflow source 1: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-70751ee2-b7a1-4249-a650-05e2fe80e409.png`
- Overflow source 2: `/var/folders/0w/8y5fmh897_gc458bn5q2s7240000gp/T/codex-clipboard-e26239c5-6981-42a1-b818-9a4ad49a4faa.png`
- Rendered implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-aligned-without-toolbar-overlap.jpg`
- Focused implementation: `/Users/refinex/.codex/visualizations/2026/07/31/019fb787-37aa-77e2-a66a-374270d39045/daily-calendar-aligned-without-toolbar-overlap-focus.jpg`
- State: Madora desktop debug bundle, light theme, July 2026 month view, July 31 selected.

## Viewport and comparison evidence

- Both source captures are `2048px` wide top-region screenshots; the implementation is `1460 x 768` after Computer Use normalization.
- Both source captures, the rebuilt implementation, and their focused top regions were opened together in one comparison input.
- The global chrome tools occupy the first row inside the rounded main panel. The Daily toolbar begins only after that row ends and shares its own row with the sidebar search and pinned-content controls.
- The Daily title, navigation, month label, view switch, search, and refresh remain horizontally aligned without using a negative margin.

## Required fidelity surfaces

- Fonts and typography: no toolbar font, size, weight, or label changed.
- Spacing and layout rhythm: macOS main-header height now ends at `macChromeContentTop`; the Daily row uses `marginTop: 0`, eliminating the previous 6px box overlap.
- Colors and visual tokens: existing header, divider, and hover tokens are unchanged.
- Image quality and assets: no icon or image asset changed.
- Copy and content: no visible copy changed.

## Findings and comparison history

1. The prior pass restored `-6px` to align the Daily row, but this reintroduced a 6px overlap with the global chrome row. Classified P2 because controls from two persistent rows shared the same vertical area.
2. The workspace main-header height is now derived from `macChromeContentTop - WORKSPACE_PANEL_MARGIN`, and the shared Daily/Views offset resolves to zero.
3. Post-fix Tauri capture shows two separate rows: the global tools remain fully contained above, while the Daily row aligns with sidebar controls below. No actionable P0, P1, or P2 issue remains.

## Implementation checklist

- [x] Global chrome buttons stay inside the first row.
- [x] Daily and sidebar controls share the second-row centerline.
- [x] The rows do not rely on negative overlap.
- [x] Views receives the same zero-offset shell alignment.
- [x] Rebuilt Tauri capture passes the combined visual comparison.

final result: passed

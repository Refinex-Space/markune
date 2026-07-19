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

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

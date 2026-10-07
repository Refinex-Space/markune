---
owner: refinex
updated: 2026-10-07
status: active
referenced_by: docs/architecture/agents.md#兼容性和验收边界
---

# ACP 迁移验收记录

代码、协议模拟、真实 CLI 初始化、安装与在线任务分别记证据。初次失败及复验结果均保留，未运行的认证和模型任务不计为通过。

## 已运行

- ACP 客户端与交互定向回归：14 项通过，覆盖初始化、动态配置、权限请求、取消不重发、历史保存/恢复、写前 flush 失败和初始化硬超时。
- 原生 Agent 定向回归：20 项通过，覆盖路径/链接拒绝、先读再写、外部冲突、停止后拒写、会话归属、独占租约、授权候选和绘图目标约束。
- 应用壳层及设置定向回归：41 项通过（含 ACP 定向测试），新的设置目录替代旧 Codex 配置，旧运行时未被启动。
- 前端全量：144 个文件、1082 项通过。测试环境中部分既有 Canvas 案例输出 jsdom 提示，不影响结果。
- 脚本测试：20 项通过，覆盖新分发边界与现有发布校验。
- Rust 全量：362 通过，5 忽略，其中 1 项是显式网络安装测试。历史 Codex 合成回归仍以测试模块保留。
- TypeScript：`pnpm exec tsc --noEmit` 通过。
- 构建：Tauri 静态前端导出与本机 Rust 可执行程序编译通过。没有制作、签名或发布安装包。
- Harness：0 错误、0 警告。
- ESLint：0 错误，4 个既有警告。
- 浏览器 UI：实际产品聊天/设置/审批组件在临时合成工作区预览，验证目录搜索、权限详情及拒绝、聊天排版。预览不调用原生进程，不视为桌面账户验收。
- 真实本机 CLI：见 [local-handshakes.json](local-handshakes.json)，三个 CLI 均完成 ACP v1 initialize，隔离 HOME、清除凭据环境、没有模型 prompt。
- 官方目录安装：11/11 通过，见 [catalog-summary.json](catalog-summary.json)。初次下载超时后扩大有界安装时间；Grok 原生 npm 入口改为直接执行；Codex canary 预先创建隔离 CODEX_HOME。原始失败、分项复验和最终摘要都保留。应用专属 npm 配置另经 GLM 安装握手复验，见 `isolated-npm-config.json`。

## 验证命令

```bash
pnpm exec vitest run components/workspace/__tests__/agent-runtime.test.ts components/workspace/__tests__/agent-session.test.ts
cargo test --manifest-path src-tauri/Cargo.toml agents:: --lib
pnpm test:run
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm build:desktop:web
pnpm harness:check
```

`test:run` 和 `build:desktop:web` 必须串行，后者会临时移动 API 目录。

显式供应商初始化探针：设置 `MARKUNE_ACP_PROBE_SPECS` 为包含 name、可执行文件绝对路径和 args 的 JSON 数组，再运行 `node scripts/probe-acp-agents.mjs`。可用 `MARKUNE_ACP_PROBE_REPORT` 指定报告。脚本不认证、不新建会话、不发送模型任务。

安装验证使用显式忽略测试 `agents::catalog::network_tests::install_selected_catalog_agents`，必须给 `MARKUNE_ACP_INSTALL_PROBE_IDS`（逗号分隔目录 ID）；可给 `MARKUNE_ACP_INSTALL_PROBE_REPORT`。它下载官方发布包，在临时安装目录和隔离认证目录做 initialize，结束删除临时安装，不写真实 Profile 或供应商账号配置。

## 尚未替代的验收

原生桌面界面访问尝试因 Computer Use 超时未完成，浏览器合成预览不替代此项。真实账户认证和收费模型任务未执行；Windows/Linux、macOS Intel 发布包及签名安装未验收。未创建 Git commit、推送或发布。当前旧 Codex 数据未迁移或改写。

## 图像证据与交付边界

聊天、目录及审批截图保存在本任务可视化目录，使用实际产品组件与合成会话。原始官方目录快照、安装收据/能力结果及探针输出都没有真实凭据或用户文档正文。

受管版本可以在设置里选择旧安装来回退；会话仍绑定原 Profile。应用代码回退可恢复旧入口，但本次不删除旧 Codex Home 或账户配置，也不让新 ACP 自动接管旧会话。没有修改签名、发布工作流或 Tauri capability/asset scope；打包变更仅移除 Codex 固定 sidecar，保留 Pandoc/Typst。

## 2026-10-07 界面反馈修正

- 安装状态和取消按钮移入对应 Agent 行，安装失败也在该行展示；重新打开管理界面可复用目录快照等待当前安装结束。
- 管理弹窗只滚动目录列表。浏览器合成预览中，列表 scrollTop 从 0 变为 325，搜索框顶部保持 138px，弹窗自身 scrollTop 保持 0。
- 欢迎区在聊天剩余区域垂直居中。预览测量两者中心均为 323.75px。
- slash 菜单独立浮于输入框上方，实测方向键与 Enter 填入命令、不发送任务；Escape 关闭，未匹配命令不显示空菜单。
- 11 个 theSVG 图标按指定映射接入，逐一检查浅色与深色，针对 TRAE、智谱与 Kimi 调整对比度。复用现有 React 包，不新增运行时依赖。
- 本轮新增 4 项交互回归，相关 28 项通过；全量前端 145 文件、1086 项通过，TypeScript 与相关文件 ESLint 通过，桌面静态前端导出通过。验证使用实际组件和合成数据，没有发起真实安装或模型任务。

## 2026-10-07 配置选择器与当前上下文修正

- 底部配置与 legacy Mode 统一为应用 Select；支持分组与空字符串默认 ID，协议值保持原样。浏览器验证 Model、Mode 在关闭菜单且 hover 时均呈现 accent 背景，移出后恢复透明。
- 系统页面不再把后台文档标签当成当前文档；面板入口另保证活跃图稿和当前文档互斥。新增回归验证从文档切到图稿时欢迎文案、当前标签、flush 参数和发送上下文一起更新，返回文档后恢复文档上下文。
- 新增 3 项回归，相关 9 项通过；全量前端 145 文件、1089 项通过，TypeScript 和相关文件 ESLint 通过。浏览器使用实际组件与合成数据验证了菜单样式、hover 和图稿上下文。

## 2026-10-07 单行配置工具栏与面板会话历史

- 配置工具栏固定单行，按可用宽度展示模型、模式、推理强度、协作模式，完整配置保留在更多设置。Codex Fast mode 以带状态的闪电切换，支持布尔和 on/off 协议值；未知扩展仍可编辑。
- 浏览器合成预览：300/420/720px 容器下工具栏均为 28px 高；300px 容器实测可用宽度与 scrollWidth 同为 274px，长模型名省略。验证闪电切换、更多设置中的协作模式修改及明暗主题。
- 会话历史取消弹窗，改为面板内搜索列表，显示智能体图标和当前会话。聊天组件在浏览历史时保持挂载；恢复历史使用原 Profile 和本地会话记录，移除的 Profile 保持只读。
- 新增回归覆盖搜索、草稿/组件保留、运行中当前会话返回与跨会话阻止、读取失败不丢失原会话、按原 Profile 恢复并连接、迟到读取不能覆盖返回后的聊天。恢复连接测试使用协议边界 mock，不自动发送 prompt。
- 历史列表浏览器预览在 300px 容器中 clientWidth/scrollWidth 均为 283px，在 420px 容器中均为 403px；列表滚到 1166px 后搜索框顶部仍为 129px。实际组件验证搜索、选择、明暗图标和标题省略，临时预览路由已移除。
- 全量前端 146 文件、1098 项通过；最后的焦点返回和卸载清理调整另跑相关 12 项通过。TypeScript、相关文件 ESLint、桌面静态前端导出及 Harness 均通过，diff 空白检查通过。本轮未执行真实账号认证、收费模型任务或原生桌面续聊验收。

## 2026-10-07 思考流与工具活动展示

- 研究覆盖 ACP v1 tool calls / 本机 SDK 1.7.0 schema、JetBrains AI Chat/ACP、Cursor Agent、ChatGPT deep research 官方资料，以及用户提供的 deepseek-harness 的 ReasoningRow、WebRow、GenericToolCard 与相关交互测试。具体证据和采用边界见架构文档“思考流与工具活动”；未声称已实机审计其他产品的登录后界面。
- 思考流默认展开次级色 Markdown，转入其他内容或轮次结束时默认折叠，用户手动选择优先；工具采用带类别图标、摘要和状态的紧凑活动行，失败默认展开。输入、原始结果、diff 和资源身份保留。只有实际收到的消息被展示，不补造思考、搜索来源或终端输出。
- 新增 8 项回归覆盖流式展开/结束折叠、手动选择、历史延迟渲染、分类边界、失败详情、false/0 结果、不完整历史状态、字面 diff，以及 ACP null 增量保留语义。相关 22 项通过，全量 147 文件、1106 项通过。
- 浏览器使用真实消息组件和合成数据，验证思考折叠、工具展开、明暗主题及 300px 容器（clientWidth/scrollWidth 同为 298px）。模拟 prefers-reduced-motion: reduce 后，思考区所有 SVG 的 animationName 为 none，折叠 transitionDuration 为 0s。媒体模拟已恢复，预览路由与临时标签页已删除。
- TypeScript、相关文件 ESLint、桌面静态前端导出、Harness 与 diff 空白检查均通过。未修改原生权限、ACP 版本或依赖；未发起真实账号/模型任务。终端只收到 terminalId 时仍只展示其身份，不以假输出填充。

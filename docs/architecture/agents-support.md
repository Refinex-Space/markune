---
owner: refinex
updated: 2026-10-07
status: active
referenced_by: docs/architecture/agents.md#兼容性和验收边界
---

# Agent 分发与能力矩阵

本表记录此次核实的接入方式。所有条目共用 ACP v1 Host；“已接入目录”不等于账号已登录或模型任务已验证。默认模型、模型列表、模式、恢复、图片与认证方式以安装版本的 initialize/session 响应为准。

Registry 快照提交：`a949fb7afffd1a40139c34ee7d236a0db8bcfd7c`，11 个条目的完整分发元数据保存在 `src-tauri/resources/agents/catalog.json`。目录有自己的发布节奏，不使用 `@latest` 在每次启动时下载，也不把截图中的未来模型名写入产品。

| 智能体 | 目录版本 | 安装与 ACP 启动 | 边界与来源 |
|---|---|---|---|
| Codex | 2.1.1 | `@agentclientprotocol/codex-acp@2.1.1`，运行包 bin | 共享适配器，内部使用 Codex App Server；[仓库](https://github.com/agentclientprotocol/codex-acp) |
| Cursor | 2026.10.01 | 原生平台包，`cursor-agent acp` | 支持自定义提问/计划扩展；快照没有发布者 SHA；[官方 ACP](https://cursor.com/docs/cli/acp) |
| Claude Agent | 0.86.0 | `@agentclientprotocol/claude-agent-acp@0.86.0` | 包装器许可与所依赖 Claude SDK/服务条款需分别看待；[仓库](https://github.com/agentclientprotocol/claude-agent-acp) |
| CodeBuddy Code | 2.161.4 | `@tencent-ai/codebuddy-code@2.161.4 --acp` | Tencent 官方 CLI；[官方文档](https://www.codebuddy.cn/docs/cli/acp) |
| GLM Agent | 1.14.0 | `glm-acp-agent@1.14.0` | Stefan de Vogelaere 社区适配器，不标为智谱官方；[仓库](https://github.com/stefandevo/glm-acp-agent) |
| GitHub Copilot | 1.0.92 | `@github/copilot@1.0.92 --acp` | 账号权限/订阅由 GitHub 管理；[官方 ACP](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server) |
| Grok Build | 1.0.50 | `@xai-official/grok@1.0.50 agent stdio` | xAI CLI；[官方介绍](https://docs.x.ai/build/overview) |
| Kimi CLI | 1.52.0 | 原生平台包，`kimi acp` | 当前快照没有 Intel macOS 包；允许配置本机 CLI；[官方 ACP](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html) |
| MiniMax Code | 0.2.7 | `@minimax-ai/code@0.2.7 acp` | npm 调研时已存在 0.6.3，但目录仍为 0.2.7，不越过目录静默改版本；[官方仓库](https://github.com/MiniMax-AI/minimax-code) |
| OpenCode | 1.18.35 | 原生平台包，`opencode acp` | 提供商配置由其 CLI 管理；[官方 ACP](https://opencode.ai/docs/acp/)、[配置](https://opencode.ai/docs/config/) |
| Qoder CLI | 0.2.14 | `@qoder-ai/qodercli@0.2.14 --acp` | 目录 npm 与本机原生版本号不可简单比较；Windows ARM64 不支持；[ACP](https://docs.qoder.com/cli/acp)、[安装](https://docs.qoder.com/cli/installation) |

## 产品能力

| 能力 | Markune 行为 |
|---|---|
| 新会话、流式响应、工具状态、计划 | 标准 ACP 消息投影，按工具 ID 合并增量 |
| 模型/模式/布尔配置 | configOptions 优先；旧 modes 回退；未知选项保留名称与 ID |
| 普通认证 | 仅调用 Agent 声明的 auth method，180 秒硬超时 |
| 终端认证 | 独立 PTY，按 descriptor 追加参数和覆盖环境，用户完成后重连 |
| 权限申请 | 显示原始候选，原生验证选中 ID，无自动同意 |
| 表单/URL 询问 | 接受、拒绝、取消；不把表单答案加入 Markune 消息历史 |
| Cursor 特有阻塞请求 | 多选问题、计划批准/拒绝；取消路径明确 |
| 文件和终端 | 根目录、会话、原始请求关联；读取基线和冲突保护；有界终端输出 |
| Markune 绘图 | inspect、preview、apply、create MCP，绑定当前任务与活跃图稿修订 |
| 恢复与历史 | 仅 Markune 原生登记的会话；load 不支持时保留只读历史 |
| 停止与崩溃 | 协作取消后 10 秒强制结束；不自动重发任务 |
| 更新与回退 | 新版本隔离安装、初始化 canary、旧版本保留、会话绑定 Profile |
| 图片输入 | 仅在 Agent 声明 image 能力时显示，显式选择且有界 |
| 额外供应商能力 | 以 Agent 配置/命令为准，不声明统一 Goal、插件商店或套餐接口 |

## 实测

- 本机 OpenCode 1.14.46、Qoder 1.1.17 和 GitHub Copilot（initialize 自报 1.0.36）已完成隔离 HOME 的 v1 握手，未发送模型 prompt。Copilot CLI `--version` 与 ACP agentInfo 可能不同，分别记录不相互覆盖。
- 11 个目录版本均已完成 macOS ARM64 安装和 ACP v1 初始化，最终结果见 [catalog-summary.json](../verification/acp/catalog-summary.json)。初次失败与修复后的复验记录一并保留；本机安装版本握手见 [local-handshakes.json](../verification/acp/local-handshakes.json)。
- 账号登录、套餐可用性、在线模型、Windows/Linux 安装和系统级沙箱仍需各自环境的实测；不能从 npm 包存在或一次 initialize 推断。

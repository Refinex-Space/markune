---
owner: refinex
updated: 2026-10-07
status: completed
referenced_by: docs/plans-index.md#active
---

# Markune ACP 智能体迁移

目标是将 Markune 从单一 Codex App Server 客户端改为 ACP Agent Host。用户已确认本轮实施完整产品迁移，并采用新会话边界：原 Codex 历史留在原工具，新系统不读取、接管或重写这些历史。

## 已确定的架构

- 协议以稳定 ACP v1 为基线，使用官方 SDK，v2 Draft 不进入默认产品路径。
- React 使用与厂商无关的 Agent、Session、Message、ToolCall、Interaction 与能力模型；模型、模式、推理参数来自会话返回的 configOptions。
- Tauri Rust 持有安装记录、版本、进程组、stdio、文件/终端授权边界和 Markune MCP 桥。渲染器不能通过聊天内容提供任意启动命令。
- Agent 独立安装、更新与回滚，运行中的会话绑定启动版本。Markune 不再强制捆绑固定 Codex CLI。
- 会话索引只记录 Markune 创建的 ACP 会话。Agent 切换创建新会话；仅在已协商 load/resume 能力时恢复对应 Agent 的会话。不得自动恢复共享 Codex Home 中最近的任务。
- 标准能力之外的 Cursor 阻塞请求独立处理；Codex/Claude 的可选 AIR 扩展未启用时使用标准回退，未知请求有明确响应，不能悬挂。
- 文件与 MCP 写入复用现有工作区边界、锁定与冲突保护；ACP 本身不是操作系统沙箱。

## 实施与验收

- [x] 官方资料、Registry 版本、分发与能力矩阵落盘。
- [x] 受管 Agent 安装、更新、卸载与本地 Agent 配置。
- [x] stdio 进程生命周期、窗口隔离、退出清理、流量限制。
- [x] 官方 ACP SDK 客户端、能力协商、取消、错误与权限/提问交互。
- [x] Markune 专属会话索引与历史展示、恢复和版本归属。
- [x] Agent 选择、模型/模式控件、设置页与上下文界面。
- [x] 文档、终端与 Markune MCP 工具接入。
- [x] 取消旧 Codex 默认启动、固定二进制分发和旧配置入口。
- [x] 合成协议测试、11 个目录版本安装握手、浏览器 UI、前端/Rust/构建/Harness 验证；原生 UI 与真实账号边界单独记录。

真实供应商账号登录和收费模型调用单独列证据；“注册表存在”“握手成功”“完成一次模型任务”是三个不同的验收等级，不能互相替代。

## 主要官方来源

- [JetBrains ACP 接入](https://www.jetbrains.com/help/ai-assistant/acp.html)
- [ACP v1 初始化](https://agentclientprotocol.com/protocol/v1/initialization)
- [ACP 会话配置](https://agentclientprotocol.com/protocol/v1/session-config-options)
- [ACP Registry](https://github.com/agentclientprotocol/registry)
- [Codex ACP 适配器](https://github.com/agentclientprotocol/codex-acp)
- [Cursor ACP](https://cursor.com/docs/cli/acp)
- [GitHub Copilot ACP](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)

完整架构见 [ACP Agent Host](../architecture/agents.md)，接入目录见 [支持矩阵](../architecture/agents-support.md)，实际检查见 [验收记录](../verification/acp/acceptance.md)。

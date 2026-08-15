# 贡献指南

感谢你参与 Markune。项目以本地 Markdown 数据的安全性、可迁移性和可维护性为优先目标。

## 开始之前

1. 搜索现有 [Issues](https://github.com/Refinex-Space/markune/issues)，确认问题尚未被记录。
2. Bug 请提供可复现步骤；较大的功能或架构调整请先创建 Feature Request 讨论边界。
3. 安全漏洞不要公开提交 Issue，请按 [安全策略](SECURITY.md) 私密报告。

## 开发环境

```bash
git clone git@github.com:Refinex-Space/markune.git
cd markune
pnpm install
pnpm desktop:dev
```

环境版本与平台依赖见 [README](README.md#环境要求)。项目架构、配置和安全边界位于 `docs/`，修改对应模块前应先阅读 [知识地图](docs/README.md)。

## 分支与提交

- 从最新 `dev` 创建短生命周期分支。
- 一次 Pull Request 只解决一个明确问题，避免无关格式化、依赖升级或重构。
- 提交信息使用 Conventional Commits：`<type>(<scope>): <中文摘要>`。
- 不提交密钥、Token、证书、真实用户工作区或构建产物。

常用类型包括 `feat`、`fix`、`refactor`、`docs`、`test`、`build`、`ci` 和 `chore`。

## 代码与数据边界

- 持久文档保持 `.md` / `.mdx`，不要引入专有文档投影。
- 工作区内部数据只写入 `.markune/`，并保持前端类型、Tauri 命令和 Rust 实现一致。
- 文件系统、终端、Git、资源协议、更新和凭据变更必须保持最小权限、路径规范化及明确错误上下文。
- 修改持久化格式、协议或环境变量时，必须同时考虑旧版本兼容、迁移、失败回滚与测试。
- 不要在未经讨论的情况下修改签名、安装器、发布权限或 GitHub Release 资产契约。

## 验证

先运行最小相关测试，再根据影响层扩大验证：

```bash
pnpm test:run -- <path-or-pattern>
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
pnpm harness:check
```

影响桌面静态导出时再运行 `pnpm build:desktop:web`。请勿并行运行全量前端测试与桌面静态构建，因为构建过程会临时调整 `app/api`。

## Pull Request 要求

PR 描述应说明：

- 变更目的与主要实现；
- 影响的模块、配置或持久化数据；
- 实际执行的测试及结果；
- 兼容性、安全和剩余风险；
- 必要的回滚或迁移方式。

维护者可能要求补充测试、缩小范围或调整数据迁移策略。所有检查与审查完成后再合并到 `dev`。

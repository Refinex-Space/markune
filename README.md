<div align="center">
  <img src="public/brand/markune-logo-dark-app.svg.svg" alt="Markune" width="112" />

  # Markune

  **以本地 Markdown 为核心的桌面知识工作区**

  将笔记、日程、画板、全文搜索、Git 与 Codex 协作放在同一个安静的工作环境中。

  [![Release](https://img.shields.io/github/v/release/Refinex-Space/markune?display_name=tag&sort=semver)](https://github.com/Refinex-Space/markune/releases/latest)
  [![Release workflow](https://github.com/Refinex-Space/markune/actions/workflows/release.yml/badge.svg?branch=dev)](https://github.com/Refinex-Space/markune/actions/workflows/release.yml)
  [![License](https://img.shields.io/github/license/Refinex-Space/markune)](LICENSE)
</div>

## 为什么选择 Markune

- **Markdown 优先**：正文以普通 `.md` 文件保存，可被其他编辑器、Git 和脚本直接读取。
- **本地工作区**：文档、资源、图稿和工作区元数据保存在用户选择的目录中，不依赖专有云端格式。
- **写作与组织一体化**：提供目录树、多标签编辑、日程、Inbox、全文搜索、图谱和多格式导入导出。
- **原生桌面能力**：通过 Tauri v2 集成文件系统、Git、终端、系统菜单和安全签名的应用更新。
- **可控的 AI 协作**：内置 Codex 工作区入口，文件变更仍落在可审查、可回滚的本地仓库中。

## 下载

前往 [GitHub Releases](https://github.com/Refinex-Space/markune/releases/latest) 下载：

| 平台 | 安装包 |
| --- | --- |
| macOS Apple Silicon | `Markune_aarch64.dmg` |
| macOS Intel | `Markune_x64.dmg` |
| Windows x64 | `Markune_x64-setup.exe` |

当前 macOS 构建尚未完成 Apple 公证，Windows 安装包尚未使用 Authenticode 签名，首次安装可能出现系统安全提示。请只从本仓库 Releases 下载，并核对版本与文件名。

## 工作区与数据

Markune 不改变 Markdown-first 的存储方式。应用级工作区数据统一保存在工作区根目录的 `.markune/` 中，资源与图稿引用使用 `markune-asset://`、`markune-drawing://` 等持久化协议。

从旧版 Madora 首次打开含 `.madora/` 的工作区时，Markune 会先显示品牌迁移说明。只有用户确认后才会迁移；迁移会创建带 SHA-256 清单的备份，发生错误时自动回滚。若 `.madora/` 与 `.markune/` 同时存在，应用会阻止自动合并，避免覆盖无法判断归属的数据。

## 本地开发

### 环境要求

- Node.js 24
- pnpm 11.16.0
- Rust stable（最低版本以 `src-tauri/Cargo.toml` 为准）
- macOS：Xcode Command Line Tools
- Windows：Microsoft C++ Build Tools 与 WebView2 Runtime

```bash
git clone git@github.com:Refinex-Space/markune.git
cd markune
pnpm install
pnpm desktop:dev
```

仅启动 Next.js 开发服务可运行 `pnpm dev`。桌面端开发会额外准备 Codex、Pandoc、Typst 与导入导出运行时。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Web 开发服务 |
| `pnpm desktop:dev` | 启动 Tauri 桌面开发模式 |
| `pnpm test:run` | 运行前端测试 |
| `pnpm lint` | 运行 ESLint |
| `pnpm build:desktop:web` | 构建 Tauri 使用的静态前端 |
| `pnpm desktop:build` | 构建当前平台的 Tauri 安装包 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 测试 |
| `pnpm harness:check` | 检查仓库知识与治理文档 |

本地诊断安装包可使用 `pnpm desktop:build --no-sign`，但无签名产物不得作为正式 Release 或自动更新资产发布。完整打包、签名和回滚流程见 [发布与更新手册](docs/guides/release-and-update.md)。

### Windows 打包与运行时下载超时

Windows x64 在仓库根目录执行：

```bash
pnpm desktop:build
```

构建前会依次准备 Codex、Pandoc 3.10.1、Typst 0.15.1 和静态前端。首次准备 Pandoc/Typst 时需要从 GitHub Releases 下载压缩包；`document-export:stage` 对单次下载设置了 120 秒超时。网络较慢时可能出现以下错误：

```text
DOMException [TimeoutError]: The operation was aborted due to timeout
beforeBuildCommand `pnpm codex:stage && pnpm document-export:stage && pnpm build:desktop:web` failed
```

这表示文档导出运行时下载超时，不是 Tauri 或 Rust 编译失败。可在 Git Bash 中先把固定版本压缩包下载到脚本缓存目录，再重新执行 staging 和打包：

```bash
mkdir -p .tauri-build/document-export-runtime

curl.exe -L --retry 5 --connect-timeout 30 --max-time 1800 \
  -o .tauri-build/document-export-runtime/pandoc-3.10.1-windows-x86_64.zip \
  https://github.com/jgm/pandoc/releases/download/3.10.1/pandoc-3.10.1-windows-x86_64.zip

curl.exe -L --retry 5 --connect-timeout 30 --max-time 1800 \
  -o .tauri-build/document-export-runtime/typst-x86_64-pc-windows-msvc.zip \
  https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-pc-windows-msvc.zip

pnpm document-export:stage
pnpm desktop:build
```

staging 脚本会校验固定 SHA-256 和工具版本，错误或不完整的文件不会进入安装包。成功缓存后重复构建会直接复用。Windows 安装包输出到：

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

## 技术架构

| 层 | 主要技术 | 职责 |
| --- | --- | --- |
| Web shell | Next.js App Router、React、TypeScript | 工作区界面与交互状态 |
| Editor | Markweave、CodeMirror | Markdown Live/Source 编辑 |
| Desktop | Tauri v2、Rust | 文件系统、Git、终端、更新与原生窗口 |
| Drawing | Excalidraw | 本地图稿与 Markdown 快照引用 |
| AI runtime | Codex App Server | 本地工作区内的可审查协作 |

更细的运行时和持久化边界见 [架构说明](docs/architecture/overview.md)，文档索引见 [项目知识地图](docs/README.md)。

## 参与贡献

提交 Issue 或 Pull Request 前，请阅读 [贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md) 与 [安全策略](SECURITY.md)。代码变更应保持 Markdown-first、本地优先和最小权限边界，并按变更层运行最小相关测试。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 发布。

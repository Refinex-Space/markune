---
owner: refinex
updated: 2026-09-01
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Markune 版本发布与自动更新手册

本文是 Markune Windows/macOS 桌面版本的发布操作标准。源码、版本 Tag、安装器、updater 签名与 `latest.json` 全部由 `Refinex-Space/markune` 管理。应用只从该仓库的 GitHub Releases 检查更新，不依赖 `markune-site`、OSS 或 GitHub Packages。

## 1. 发布边界

- 权威仓库：`git@github.com:Refinex-Space/markune.git`。
- 用户下载页：`https://github.com/Refinex-Space/markune/releases`。
- updater endpoint：`https://github.com/Refinex-Space/markune/releases/latest/download/latest.json`。
- 支持目标：macOS Apple Silicon、macOS Intel、Windows x64。
- 安装包命名：`Markune_[arch][setup][ext]`。
- GitHub Release 必须包含 9 个资产：两个 DMG、两个 macOS updater archive、对应两个签名、一个 Windows NSIS 安装器、对应签名和 `latest.json`。
- updater minisign 是自动更新的强制安全边界。当前 macOS ad-hoc 签名与 Windows 未签名状态不能替代 minisign，也不能通过关闭 updater 校验规避发布故障。

## 2. 一次性 GitHub 配置

在仓库 `Settings → Secrets and variables → Actions` 中配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `MARKUNE_UPDATER_PUBLIC_KEY` | Tauri updater `.key.pub` 文件的原始单行 Base64 内容 |
| Secret | `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater 私钥 |
| Secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | updater 私钥密码 |

工作流使用仓库内置 `GITHUB_TOKEN`，不需要跨仓库 PAT。Tag 构建的 `publish` job 与人工触发的 Draft 发布 job 才取得 `contents: write`，其他 job 保持 `contents: read`。

保留 GitHub Environment `production-release` 用于部署审计；真正的人工闸门由独立的 `Publish Markune release` `workflow_dispatch` 提供，不依赖 Environment 是否配置审批规则。Tag 工作流只创建 Draft，维护者没有手工触发发布工作流前不会正式发布。

GitHub 只会从默认分支加载可手工触发的工作流，因此 `.github/workflows/publish-release.yml` 必须先进入仓库默认分支，Actions 页面才会显示 **Run workflow**。

私钥只能保存在 GitHub Actions Secrets 或受控发布机密钥存储中，不得写入命令参数、仓库文件、日志、Release Notes 或安装包。公钥可以作为 Actions Variable 使用。

## 3. 版本与发布说明

发布前同步以下版本：

- `package.json` 的 `version`；
- `src-tauri/tauri.conf.json` 的 `version`。

两处必须为相同 SemVer。`src-tauri/Cargo.toml` 的 crate 版本属于内部 Rust 包版本，不作为桌面 Release 版本来源。

在创建 Tag 前准备用户可读的 Release Notes，至少包含本次更新、支持平台、升级提示和已知限制。不得包含密钥、Token、真实用户路径或用户文档。

## 4. 本地门禁

在仓库根目录顺序执行：

```bash
pnpm install --frozen-lockfile
node --test scripts/prepare-release-updater-config.test.mjs scripts/release-distribution.test.mjs scripts/verify-release-assets.test.mjs
pnpm test:run
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build:desktop:web
pnpm harness:check
```

不要并行运行 `pnpm test:run` 与 `pnpm build:desktop:web`，后者会临时调整 `app/api`。任何测试失败都应停止发布。

可在不打印配置内容的前提下验证 release override：

```bash
MARKUNE_UPDATER_PUBLIC_KEY="$(cat ~/.tauri/markune-updater.key.pub)" pnpm release:prepare
```

生成的 `.tauri-build/tauri.release.generated.json` 被 Git 忽略，应包含唯一 GitHub updater endpoint、Base64 公钥、`createUpdaterArtifacts: true`、macOS ad-hoc identity `-` 与 Windows passive 安装模式。不要把生成文件提交到 Git。

## 5. `dev` 预检

将版本与发布变更合并到 `dev` 后，release 关键路径的 push 会触发 `Release Markune desktop` 工作流中的 `Verify release source`。该 job 校验依赖安装、release 配置、脚本测试、更新前端测试、TypeScript 与 ESLint；分支预检不会创建安装包或 Release。

只有待发布提交对应的 `dev` 预检成功后才能创建 Tag。本地完整 Rust 测试和桌面静态构建仍是 Tag 前门禁，不能用工作流预检替代。

## 6. 创建 Tag

确认工作树干净、HEAD 与远端 `dev` 一致、版本 Tag 尚不存在：

```bash
git fetch origin dev --tags
git status --short
git rev-parse HEAD
git rev-parse origin/dev
git tag -l vX.Y.Z
git tag -a vX.Y.Z -m "Markune vX.Y.Z"
git push origin vX.Y.Z
```

Tag 必须与 `package.json` / Tauri 版本一致。失败或已发布的 Tag 不得移动、删除后重建或指向新提交；修复后提升补丁版本并创建新 Tag。

## 7. 构建、Draft 与发布

Tag 与人工发布工作流按以下顺序执行：

1. `verify` 重新运行源码门禁。
2. `publish` 在两个 macOS Runner 与一个 Windows Runner 上构建原生安装器和 updater 资产，以当前仓库内置 `GITHUB_TOKEN` 上传到同版本 Draft Release。
3. 维护者在 Actions 中打开 `Publish Markune release`，点击 **Run workflow** 并输入同一 `vX.Y.Z` Tag。
4. 人工发布工作流检出该 Tag，资产校验器检查 Draft、Tag 对应 commit、9 个资产、6 个 updater target、下载 URL 与三个 minisign 内容。
5. 全部校验通过后，`gh release edit --draft=false` 正式发布；`latest.json` 随 latest Release 直接成为客户端更新源。

手工发布前在 Draft 中检查：

- 文件名精确为 `Markune_aarch64.dmg`、`Markune_aarch64.app.tar.gz`、`Markune_aarch64.app.tar.gz.sig`、`Markune_x64.dmg`、`Markune_x64.app.tar.gz`、`Markune_x64.app.tar.gz.sig`、`Markune_x64-setup.exe`、`Markune_x64-setup.exe.sig`、`latest.json`；
- `latest.json` 版本与 Tag 一致，六个平台 URL 都指向本次 Release 的对应资产，签名与 `.sig` 内容一致；
- `tauri-action` 可能把平台 URL 写成对应资产的 GitHub Assets API URL。校验器只接受该命名资产的 `browser_download_url`，或 GitHub API 返回且资产 ID 精确匹配的 `url`；Tauri updater 下载资产时会发送 `Accept: application/octet-stream`，不得放宽为任意域名、重定向或其他资产 ID；
- Release Notes 是面向用户的实际内容，系统签名限制描述准确；
- 没有额外、重复或空资产。

若手工发布前修改了会影响 `latest.json` 更新说明的 Release Notes，应停止发布并使用更高版本重新构建，避免 Release 页面与应用内更新说明分叉。

## 8. 安装与 N-1 更新验收

正式发布前至少验证三个安装目标：

- Apple Silicon 与 Intel Mac 分别从 Draft 下载 DMG，验证启动、首次系统放行、工作区读写和覆盖安装；
- Windows x64 从 Draft 下载 NSIS，验证 SmartScreen 提示、安装、启动、覆盖升级与卸载；
- updater archive 与 `.sig` 由工作流校验，不能用系统安装包测试替代。

从第二个版本开始还必须在三个目标分别执行 N-1 → N：

1. 安装当前线上稳定版 N-1，打开专用测试工作区。
2. 保存 Markdown 与图稿修改，检查更新。
3. 确认应用只提示，不静默下载或安装。
4. 取消一次安装确认，再重新确认。
5. 验证下载、minisign 校验、安装与重启。
6. 确认版本号、设置、文档、图稿、Git 与 Codex 功能正常。

未完成真实安装版验证时，只能说明构建或发布管线通过，不能声明桌面安装或自动更新端到端通过。

## 9. 故障与回滚

- `dev` 预检失败：修复同一分支，不创建 Tag。
- Tag 构建失败：保留 Tag 与日志；修复后提升版本，不能复用失败 Tag。
- Draft 资产不完整或签名不匹配：不要触发人工发布，不手工替换单个二进制、签名或 `latest.json`。
- 最终校验失败：Release 保持 Draft；根据原因修复工作流并提升版本。网络瞬时故障可重跑失败 job，但不得让同一 Tag 对应不同源码。
- 已发布版本存在严重缺陷：在 Release Notes 标记风险，并尽快发布更高补丁版本。删除或改回 latest Release 不能修复已安装客户端，也可能使 endpoint 短暂不一致。
- updater 私钥疑似泄露：立即停止发布。旧客户端固定信任旧公钥，轮换必须设计由旧密钥签名的过渡版本；旧私钥不可用时只能要求用户手工安装新版本。
- 回滚本次工作流改动：恢复上一版 `.github/workflows/release.yml`、release 脚本与文档；已正式发布的 Release、Tag 和签名资产不属于代码回滚范围，不得随意删除。

## 10. 发布记录

每次发布保留：源码 commit 与 Tag、Actions run、最终 Release Notes、三平台安装结果、N-1 更新结果（首次发布注明不适用）和已知限制。不得在公开记录中粘贴 Secrets、私钥、用户工作区或不必要的本地绝对路径。

---
owner: refinex
updated: 2026-07-23
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Madora 版本更新、发布与上传标准手册

本文是 Madora Windows/macOS 桌面版本的唯一发布操作手册。应用源码保存在私有 `Refinex-Space/madora`，安装包和 Tauri 更新清单统一发布到公开 `Refinex-Space/madora-site` 的 GitHub Releases。GitHub Packages 只用于 npm、Maven、NuGet、容器镜像等包注册表场景，不用于桌面安装器分发。

## 1. 发布架构与边界

- 私有源码和构建工作流：`Refinex-Space/madora`。
- 公开安装包：`https://github.com/Refinex-Space/madora-site/releases`。
- 更新清单：`https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json`。
- 构建目标：macOS Apple Silicon、macOS Intel、Windows x64。
- 安装包：macOS DMG、Windows NSIS。由于 Codex、Pandoc、Typst sidecar 按架构打包，不生成 macOS universal DMG。
- 发布工作流：私有仓库的 `.github/workflows/release.yml` 只响应 `v*` Tag，先验证源码，再并行原生构建，最终在公开仓库创建 draft Release。
- 更新签名：Tauri updater minisign 密钥。它保证更新包未被替换，不等同于 Apple Developer ID 或 Windows Authenticode 代码签名。
- 当前系统签名阶段：macOS 使用 ad-hoc 签名且不公证；Windows 不做 Authenticode。两者均会产生系统信任警告，只适合当前早期分发阶段。
- 用户策略：应用自动检查，但不自动下载或强制安装；用户从左下角“更新”入口查看说明并明确选择安装。

`madora-site` 必须是有 `main` 分支和至少一个提交的公开仓库。Release Tag 会指向该仓库的 `main`，但 Release 正文必须记录私有源码 commit，确保二进制可追溯。安装包只作为 Release Assets 上传，不提交到网站 Git 历史或 `public/` 目录。

只有已发布且不是 prerelease 的 Release 才会成为 `/releases/latest`。draft 阶段可以安全检查资产，但生产客户端不会把它识别为新版本。

## 2. 一次性初始化更新签名密钥

在安全的本机终端生成 Tauri updater 密钥；路径必须在仓库之外：

```bash
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/madora-updater.key
```

命令会要求设置私钥密码，并生成私钥及对应公钥。执行后确认：

```bash
test -s ~/.tauri/madora-updater.key
test -s ~/.tauri/madora-updater.key.pub
```

必须遵守以下规则：

- 私钥和密码只进入密码管理器、离线备份和 GitHub Actions Secrets，绝不能写入仓库、Issue、Release、日志或聊天。
- 公钥可以公开，但必须保留完整两行 minisign 内容，包括 `untrusted comment:` 行。
- 私钥至少保留两份受控备份。私钥丢失后，已安装旧版本不能验证由新密钥签名的更新。
- 不要为每个版本生成新密钥。

## 3. 配置公开分发仓库与 GitHub Actions

### 3.1 初始化公开分发仓库

确认 `Refinex-Space/madora-site` 满足以下条件：

- 仓库可见性为 Public；
- 默认分支为 `main`；
- `main` 至少有一个提交；
- 普通访客可以打开仓库的 Releases 页面；
- 仓库中没有 Madora 应用源码、私钥或发布 Token。

### 3.2 创建最小权限跨仓库 Token

私有 `madora` 工作流自带的 `GITHUB_TOKEN` 只能操作私有源码仓库，不能写入 `madora-site`。创建一个 fine-grained personal access token：

1. GitHub `Settings → Developer settings → Personal access tokens → Fine-grained tokens`。
2. Resource owner 选择 `Refinex-Space`。
3. Repository access 只选择 `madora-site`。
4. Repository permissions 只授予 `Contents: Read and write`；其余保持默认只读或无权限。
5. 设置明确到期时间，并在发布记录中登记轮换日期。
6. 若组织要求审批，等待 Token 获批后再配置工作流。

不得把该 Token 写入代码、文档正文、命令历史或 `madora-site`。它只进入私有 `madora` 仓库的 Actions Secret。

### 3.3 配置私有源码仓库

进入私有 `Refinex-Space/madora` 的 `Settings → Secrets and variables → Actions`。

在 `Secrets` 新增：

| 名称 | 内容 | 必需性 |
| --- | --- | --- |
| `MADORA_RELEASES_TOKEN` | 仅可写 `Refinex-Space/madora-site` 的 fine-grained PAT | 跨仓库创建 Release 和上传资产必需 |
| `TAURI_SIGNING_PRIVATE_KEY` | `madora-updater.key` 的完整内容 | 更新发布必需 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成私钥时设置的密码 | 更新发布必需 |

在 `Variables` 新增：

| 名称 | 内容 |
| --- | --- |
| `MADORA_UPDATER_PUBLIC_KEY` | `madora-updater.key.pub` 的完整两行内容 |

工作流自身的默认 `GITHUB_TOKEN` 权限固定为 `contents: read`，只用于检出私有源码。`tauri-action` 的 `GITHUB_TOKEN` 环境变量实际接收 `MADORA_RELEASES_TOKEN`，并通过固定 `owner: Refinex-Space`、`repo: madora-site`、`releaseCommitish: main` 跨仓库创建 Release。不要把 Token 暴露给应用运行时或前端。

当前不配置任何 `APPLE_*`、Developer ID、Apple 公证或 Windows Authenticode Secret。release-only Tauri 配置把 macOS `signingIdentity` 固定为 `-`，生成 ad-hoc 签名；Windows 安装器保持系统层未签名。Tauri updater minisign 仍然强制启用，不能因为系统证书暂缓而删除。

当产品进入广泛公开分发阶段时，应单独批准并接入 Apple Developer ID + notarization 与 Windows Authenticode/Azure Artifact Signing。该升级会改变 CI/CD 凭据和验收门禁，不得只上传证书而跳过安全评审。

## 4. 每次发布前同步版本号

Madora 应用版本必须同时修改：

- `package.json` 的 `version`；
- `src-tauri/tauri.conf.json` 的 `version`。

`src-tauri/Cargo.toml` 是 Rust crate 的内部版本，不作为桌面应用版本，不要求与上述两处同步。使用 SemVer：

- 补丁修复：`0.1.6 → 0.1.7`；
- 向后兼容功能：`0.1.7 → 0.2.0`；
- 不兼容变化：稳定版后提升主版本。

Tag 必须精确为 `v<version>`，例如版本 `0.1.7` 只能使用 `v0.1.7`。发布脚本会拒绝版本不一致或 Tag 不匹配。

## 5. 本地发布前验证

在仓库根目录执行：

```bash
pnpm install
node --test scripts/prepare-release-updater-config.test.mjs
pnpm exec vitest run components/workspace/__tests__/use-app-update.test.tsx components/workspace/__tests__/workspace-sidebar-update.test.tsx components/workspace/__tests__/workspace-settings-page.test.tsx
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build:desktop:web
```

本地检查生成配置时只设置公钥，不设置私钥：

```bash
MADORA_UPDATER_PUBLIC_KEY="$(cat ~/.tauri/madora-updater.key.pub)" pnpm release:prepare
```

生成文件位于 `.tauri-build/tauri.release.generated.json`，已被 Git 忽略。检查它只包含 `madora-site` 的固定 HTTPS endpoint、公钥、`createUpdaterArtifacts: true`、macOS ad-hoc identity `-` 和 Windows passive 安装模式。不要提交该文件，也不要在终端打印私钥。

## 6. 创建发布 Tag

确认版本变更、发布说明和验证结果已经提交到目标分支后执行：

```bash
git status --short
git tag -a v0.1.7 -m "Madora v0.1.7"
git push origin v0.1.7
```

把示例版本替换为本次真实版本。推送 Tag 会启动 `Release Madora desktop` 工作流。不要在同一版本失败后反复删除并重建 Tag；先修复源码并提升版本，或在 draft 尚未公开且团队确认无外部消费时按组织流程处理。

## 7. 验收 draft Release

工作流完成后进入 `Refinex-Space/madora-site` 的 GitHub Releases，保持 draft，不要立即发布。必须检查：

- 三个构建任务均成功：macOS Apple Silicon、macOS Intel、Windows x64。
- Release Tag 和标题版本与源码一致。
- Release 正文记录了触发构建的私有源码 commit；把对应私有 workflow run URL 写入内部发布记录，不公开内部日志。
- 资产包含两个 DMG、一个 NSIS 安装器、各平台 updater artifact、对应 `.sig` 和 `latest.json`。
- `latest.json` 的版本、下载 URL、签名以及 macOS 两种架构和 Windows NSIS target 均完整。
- 安装包名称由 `Madora_[arch][setup][ext]` 固定模式生成。`[arch]` 的实际字符串由 Tauri Action 按平台替换；第一次发布后记录 draft 中的真实文件名，再把稳定的 `/releases/latest/download/<文件名>` 地址接入站点下载按钮。
- Release Notes 只包含本版本用户可感知变化、升级注意事项和已知限制，不写内部密钥或本地路径。

操作系统签名验收必须与 updater minisign 分开：

- macOS：`codesign -dv --verbose=4 Madora.app` 应显示 ad-hoc 签名；Gatekeeper 仍会拒绝或警告未验证开发者，这是当前已接受限制。分别在 Apple Silicon 与 Intel 真机从浏览器下载 DMG，按“系统设置 → 隐私与安全性 → 仍要打开”完成首次放行，再验证启动和覆盖安装。
- Windows：`Get-AuthenticodeSignature <installer.exe>` 应显示 `NotSigned`；SmartScreen 和“未知发布者”属于当前已接受限制。在干净的 Windows 11 x64 环境通过用户明确确认继续安装，再验证启动、卸载和覆盖升级。若系统策略不允许绕过，记录为该环境当前不支持，不得建议用户关闭企业安全策略。
- updater：对 `latest.json` 中每个平台 URL、签名和 target 做独立检查；系统层未签名不能成为跳过 updater 签名的理由。

任何目标缺失、签名不匹配或 `latest.json` URL 无法下载，都不得发布 draft。

## 8. N-1 到 N 自动更新验收

首次发布只能验证安装包；从第二个版本开始，每次都必须验证真实更新链路：

1. 安装当前线上稳定版 N-1。
2. 打开一个有未保存 Markdown 和图稿修改的测试工作区。
3. 发布版本 N 后，启动应用并等待自动检查，或在“设置 → 版本”点击“检查更新”。
4. 确认左下角只出现“更新”入口，不自动下载。
5. 查看版本号、发布日期、更新说明，点击“下载并安装”。
6. 在确认框取消一次，确认没有下载；再次执行并确认。
7. 验证文档与图稿先保存，下载进度可见，签名校验失败时不会安装。
8. macOS 安装完成后点击重启；Windows 按 NSIS 更新流程退出并重启应用。
9. 确认当前版本为 N，原工作区、设置、文档、图稿和 sidecar 功能正常。

macOS Apple Silicon、macOS Intel、Windows x64 必须分别验收，不能互相替代。未完成真实 N-1→N 验收时，只能声明“发布管线已验证”，不能声明“自动更新端到端已验证”。

## 9. 正式发布与 madora-site 接入

完成 draft 验收后，在 `madora-site` 的 GitHub Release 页面点击发布。发布后验证：

```text
https://github.com/Refinex-Space/madora-site/releases/latest
https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json
```

`madora-site` 页面应链接自身 GitHub Releases 的安装资产，不使用 GitHub Packages，也不把安装包复制进站点仓库。静态站点可使用第一次发布后确认的稳定文件名构造 `/releases/latest/download/<文件名>`；若以后修改 `releaseAssetNamePattern`，必须在同一次变更中更新站点下载配置并验证 302 跳转和最终下载。

站点只展示当前实际支持的三个目标，不提供 universal macOS 或 Windows ARM64 占位下载。网站发布属于独立仓库流程，本手册不授权从 Madora 仓库自动部署网站。

## 10. 故障、撤回与回滚

- draft 失败：保持 draft，不发布；修复后重新运行同一 workflow 之前先确认不会复用错误签名资产。
- `MADORA_RELEASES_TOKEN` 失效或权限不足：保持源码 Tag，不手工改用宽权限 Token；更新最小权限 Secret 后重新运行失败任务，并确认目标仍是 `madora-site`。
- 已发布版本存在严重缺陷：立即在 Release Notes 标记，停止站点推荐；发布更高 SemVer 的热修复版本。不要依赖降级，因为 updater 默认只接受更高版本。
- 删除或改回旧的 latest Release 不能修复已经安装坏版本的用户，也可能造成 endpoint 短暂不一致；优先发布更高版本热修复。
- 单个平台资产错误：不得只替换同名二进制而沿用旧 `.sig`/`latest.json`。必须重新生成匹配的 updater artifact、签名和清单，并重新完成三平台验收。
- 更新私钥疑似泄露：停止发布并按安全事件处理。密钥轮换不能直接替换，因为旧客户端固定信任旧公钥；需要先用旧密钥发布一个嵌入新公钥的过渡版本，确认覆盖率后才切换新私钥。旧私钥不可用时，无法通过原 updater 安全迁移，只能要求用户手工安装新版本。

## 11. 发布完成记录

每次发布至少保留以下证据：

- 版本、Tag、Release URL 和源码 commit；
- 三平台 workflow 结果；
- `latest.json` target 与签名检查结果；
- macOS ad-hoc/Gatekeeper 和 Windows `NotSigned`/SmartScreen 验收结果；
- 三平台安装验收；
- N-1→N 更新验收（首次发布注明不适用）；
- madora-site 下载链接验证结果；
- 已知限制和回滚负责人。

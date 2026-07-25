---
owner: refinex
updated: 2026-07-24
status: active
referenced_by: AGENTS.md#knowledge-map
---

# Madora 版本更新、发布与上传标准手册

本文是 Madora Windows/macOS 桌面版本的唯一发布操作手册。应用源码保存在私有 `Refinex-Space/madora`，安装包和 Tauri 更新清单统一发布到公开 `Refinex-Space/madora-site` 的 GitHub Releases。GitHub Packages 只用于 npm、Maven、NuGet、容器镜像等包注册表场景，不用于桌面安装器分发。

## 0. 执行位置约定

本手册中的动作只能在下表指定位置执行。后文所有命令都会再次写出 `cd` 或明确标注网页/系统环境，不依赖“当前目录”推断。

| 标识 | 执行位置 | 用途 |
| --- | --- | --- |
| `APP-LOCAL` | macOS 本机目录 `/Users/refinex/develop/project/madora` | 修改私有应用源码、同步版本、运行验证、生成 updater 配置、创建和推送源码 Tag |
| `SITE-LOCAL` | macOS 本机目录 `/Users/refinex/develop/project/madora-site` | 修改官网版本、下载链接和公开安装说明；不得在这里构建 Madora 安装包或手工创建应用发布 Tag |
| `GITHUB-ACCOUNT` | GitHub 个人设置网页 | 创建 fine-grained personal access token |
| `GITHUB-APP` | 私有仓库 `https://github.com/Refinex-Space/madora` 的 Settings/Actions 页面 | 配置构建 Secrets/Variables，查看私有源码 workflow run |
| `GITHUB-SITE` | 公开仓库 `https://github.com/Refinex-Space/madora-site` 的 Releases 页面 | 验收和发布 draft Release；用户从这里下载安装包 |
| `MAC-TEST` | Apple Silicon 或 Intel 测试机的 Terminal 与系统设置 | 验证 DMG、ad-hoc 签名、Gatekeeper 和更新安装 |
| `WINDOWS-TEST` | Windows 11 x64 测试机的 PowerShell 与系统界面 | 验证 NSIS、`NotSigned`、SmartScreen 和更新安装 |

关键边界：源码 Tag 在 `APP-LOCAL` 创建并推送到私有 `madora`；该 Tag 触发的工作流在公开 `madora-site` 创建带同名 `tag_name` 的 draft Release。Draft 阶段 GitHub 使用 `untagged-*` 管理地址，普通访客看不到 Release，`madora-site` 中也还没有对应的公开 Git Tag；只有维护者完成验收并发布 Draft 后，GitHub 才创建公开 Tag 并让 Release 进入公开列表。不要进入 `SITE-LOCAL` 手工执行 `git tag`，也不要把安装包复制进 `madora-site` Git 工作树。

## 1. 发布架构与边界

- 私有源码和构建工作流：`Refinex-Space/madora`。
- 公开安装包：`https://github.com/Refinex-Space/madora-site/releases`。
- 更新清单：`https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json`。
- 构建目标：macOS Apple Silicon、macOS Intel、Windows x64。
- 安装包：macOS DMG、Windows NSIS。由于 Codex、Pandoc、Typst sidecar 按架构打包，不生成 macOS universal DMG。
- 发布工作流：私有仓库的 `.github/workflows/release.yml` 在 release 关键文件推送到 `dev` 时只验证源码；`v*` Tag 才会在验证后并行原生构建，并在公开仓库创建 draft Release。macOS 必须构建 `app,dmg`，Windows 构建 `nsis`；三平台结束后 `verify_release` 会检查 Draft 的安装器、updater artifact、签名和 `latest.json`，缺少任一项都会让工作流失败。
- 更新签名：Tauri updater minisign 密钥。它保证更新包未被替换，不等同于 Apple Developer ID 或 Windows Authenticode 代码签名。
- 当前系统签名阶段：macOS 使用 ad-hoc 签名且不公证；Windows 不做 Authenticode。两者均会产生系统信任警告，只适合当前早期分发阶段。
- 用户策略：应用自动检查，但不自动下载或强制安装；用户从左下角“更新”入口查看说明并明确选择安装。

`madora-site` 必须是有 `main` 分支和至少一个提交的公开仓库。Draft 发布时创建的公开 Tag 会指向该仓库的 `main`。Release 正文及由其生成的应用内更新说明只能包含用户可见内容，不得出现私有源码仓库、Git commit SHA、私有 workflow 地址或内部验收指令。二进制可追溯性由同版本私有源码 Tag 和 `GITHUB-APP` 对应 workflow run 的 `headSha` 保证，这些信息只保留在内部发布记录。安装包只作为 Release Assets 上传，不提交到网站 Git 历史或 `public/` 目录。

只有已发布且不是 prerelease 的 Release 才会成为 `/releases/latest`。Draft 阶段可以由已登录且有权限的维护者通过其 `untagged-*` 地址安全检查资产，但普通访客、官网使用的公开 Releases API 和生产客户端都不会把它识别为新版本。

## 2. 一次性初始化更新签名密钥

执行位置：`APP-LOCAL`。在 macOS Terminal 执行；密钥写入仓库之外的 `~/.tauri`：

```bash
cd /Users/refinex/develop/project/madora
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/madora-updater.key
```

命令会要求设置私钥密码，并生成私钥及对应公钥。执行后确认：

```bash
cd /Users/refinex/develop/project/madora
test -s ~/.tauri/madora-updater.key
test -s ~/.tauri/madora-updater.key.pub
```

必须遵守以下规则：

- 私钥和密码只进入密码管理器、离线备份和 GitHub Actions Secrets，绝不能写入仓库、Issue、Release、日志或聊天。
- `madora-updater.key.pub` 是 Tauri CLI 生成的单行 Base64 公钥；它解码后才是两行 minisign 文本。公钥可以公开，但发布配置必须使用 `.pub` 文件中的原始单行内容，不要手工解码、换行或重新编码。
- 私钥至少保留两份受控备份。私钥丢失后，已安装旧版本不能验证由新密钥签名的更新。
- 不要为每个版本生成新密钥。

## 3. 配置公开分发仓库与 GitHub Actions

### 3.1 初始化公开分发仓库

执行位置：`GITHUB-SITE`。打开 `https://github.com/Refinex-Space/madora-site/settings` 和 `https://github.com/Refinex-Space/madora-site/releases` 检查，不在本机执行命令。

确认 `Refinex-Space/madora-site` 满足以下条件：

- 仓库可见性为 Public；
- 默认分支为 `main`；
- `main` 至少有一个提交；
- 普通访客可以打开仓库的 Releases 页面；
- 仓库中没有 Madora 应用源码、私钥或发布 Token。

### 3.2 创建最小权限跨仓库 Token

执行位置：`GITHUB-ACCOUNT`，打开 `https://github.com/settings/personal-access-tokens/new`。此步骤不是在任一 Git 仓库或 Terminal 中执行。

私有 `madora` 工作流自带的 `GITHUB_TOKEN` 只能操作私有源码仓库，不能写入 `madora-site`。创建一个 fine-grained personal access token：

1. GitHub `Settings → Developer settings → Personal access tokens → Fine-grained tokens`。
2. Resource owner 选择 `Refinex-Space`。
3. Repository access 只选择 `madora-site`。
4. Repository permissions 只授予 `Contents: Read and write`；其余保持默认只读或无权限。
5. 设置明确到期时间，并在发布记录中登记轮换日期。
6. 若组织要求审批，等待 Token 获批后再配置工作流。

不得把该 Token 写入代码、文档正文、命令历史或 `madora-site`。它只进入私有 `madora` 仓库的 Actions Secret。

### 3.3 配置私有源码仓库

执行位置：`GITHUB-APP`，打开 `https://github.com/Refinex-Space/madora/settings/secrets/actions`。不要把下列值配置到公开 `madora-site`。

在 `Secrets` 新增：

| 名称 | 内容 | 必需性 |
| --- | --- | --- |
| `MADORA_RELEASES_TOKEN` | 仅可写 `Refinex-Space/madora-site` 的 fine-grained PAT | 跨仓库创建 Release 和上传资产必需 |
| `TAURI_SIGNING_PRIVATE_KEY` | `madora-updater.key` 的完整内容 | 更新发布必需 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成私钥时设置的密码 | 更新发布必需 |

在 `Variables` 新增：

| 名称 | 内容 |
| --- | --- |
| `MADORA_UPDATER_PUBLIC_KEY` | `madora-updater.key.pub` 文件中的完整单行 Base64 内容；不要填解码后的两行文本 |

工作流自身的默认 `GITHUB_TOKEN` 权限固定为 `contents: read`，只用于检出私有源码。`tauri-action` 的 `GITHUB_TOKEN` 环境变量实际接收 `MADORA_RELEASES_TOKEN`，并通过固定 `owner: Refinex-Space`、`repo: madora-site`、`releaseCommitish: main` 跨仓库创建 Release。不要把 Token 暴露给应用运行时或前端。

当前不配置任何 `APPLE_*`、Developer ID、Apple 公证或 Windows Authenticode Secret。release-only Tauri 配置把 macOS `signingIdentity` 固定为 `-`，生成 ad-hoc 签名；Windows 安装器保持系统层未签名。Tauri updater minisign 仍然强制启用，不能因为系统证书暂缓而删除。

当产品进入广泛公开分发阶段时，应单独批准并接入 Apple Developer ID + notarization 与 Windows Authenticode/Azure Artifact Signing。该升级会改变 CI/CD 凭据和验收门禁，不得只上传证书而跳过安全评审。

## 4. 每次发布前同步版本号

执行位置：`APP-LOCAL`。只修改以下两个绝对路径：

Madora 应用版本必须同时修改：

- `/Users/refinex/develop/project/madora/package.json` 的 `version`；
- `/Users/refinex/develop/project/madora/src-tauri/tauri.conf.json` 的 `version`。

使用 SemVer：

- 补丁修复：`0.1.11 → 0.1.12`；
- 向后兼容功能：`0.1.12 → 0.2.0`；
- 不兼容变化：稳定版后提升主版本。

Tag 必须精确为 `v<version>`，例如版本 `0.1.12` 只能使用 `v0.1.12`。发布脚本会拒绝版本不一致或 Tag 不匹配。

`/Users/refinex/develop/project/madora/src-tauri/Cargo.toml` 是 Rust crate 的内部版本，不在此步骤修改。`/Users/refinex/develop/project/madora-site/site.config.ts` 的网站展示版本等 draft Release 资产确认后再按第 9 节更新，不能代替应用版本同步。

## 5. 本地发布前验证

执行位置：`APP-LOCAL`。在 macOS Terminal 完整执行以下命令：

```bash
cd /Users/refinex/develop/project/madora
pnpm install
node --test scripts/prepare-release-updater-config.test.mjs scripts/verify-release-assets.test.mjs
pnpm exec vitest run components/workspace/__tests__/use-app-update.test.tsx components/workspace/__tests__/workspace-sidebar-update.test.tsx components/workspace/__tests__/workspace-settings-page.test.tsx
pnpm exec tsc --noEmit
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build:desktop:web
```

本地检查生成配置时只设置公钥，不设置私钥：

```bash
cd /Users/refinex/develop/project/madora
MADORA_UPDATER_PUBLIC_KEY="$(cat ~/.tauri/madora-updater.key.pub)" pnpm release:prepare
```

该命令直接读取 Tauri 生成的 `.pub` 文件，不需要 `base64 --decode`。发布脚本会验证 Base64 解码后的 minisign 结构；为兼容旧配置，它也能接收完整两行 minisign 文本，但写入 Tauri 配置前仍会规范化为单行 Base64。GitHub Actions Variable 应始终使用 `.pub` 文件的原始单行内容。

生成文件位于 `/Users/refinex/develop/project/madora/.tauri-build/tauri.release.generated.json`，已被 Git 忽略。检查它只包含 `madora-site` 的固定 HTTPS endpoint、单行 Base64 公钥、`createUpdaterArtifacts: true`、macOS ad-hoc identity `-` 和 Windows passive 安装模式。不要提交该文件，也不要在终端打印私钥或完整生成配置。

完成本地验证后，先提交并推送到私有 `madora` 的 `dev` 分支，不要立即创建 Tag。release 关键文件的 `dev` push 会自动触发 `Release Madora desktop`：`Verify release source` 会使用 GitHub Actions Variable 中的公钥执行 `release:prepare`，校验应用版本、updater 配置、pnpm 安装、发布脚本、Release 资产校验器、更新前端测试、TypeScript 和 Lint；该 job 必须成功，`Build ...` 和 `Verify draft release assets` 在分支预检中显示 skipped 是预期行为。只有该次运行的 `headSha` 与准备创建 Tag 的提交一致时，才能进入第 6 节。

`Verify release source` 不安装 Rust toolchain 或 Linux Tauri 依赖，不准备 sidecar，也不执行 `cargo test`/`cargo check`。这是发布配置门禁，不是通用 Rust CI；标准私有 Linux runner 的 Tauri 冷编译曾超过 45 分钟并在取消期间失联，因此不得把完整 Rust 构建重新塞回该 job。本节开头的本机完整 `cargo test` 仍是创建 Tag 前的强制门禁，不能跳过或替换。Tag publish 使用 macOS/Windows 原生 Runner，`tauri build` 会通过 `beforeBuildCommand` 准备 Codex、Pandoc 和 Typst sidecar，并完成三个发布目标的生产编译。

## 6. 创建发布 Tag

执行位置：`APP-LOCAL`。确认版本变更、发布说明和验证结果已经提交到私有 `madora` 的目标分支后执行：

```bash
cd /Users/refinex/develop/project/madora
git fetch origin dev --tags
git status --short
git rev-parse HEAD
git rev-parse origin/dev
git tag -l v0.1.12
git tag -a v0.1.12 -m "Madora v0.1.12"
git push origin v0.1.12
```

创建 Tag 前，`git status --short` 必须无输出，两个 `git rev-parse` 必须输出同一 commit，`git tag -l v0.1.12` 必须无输出，而且第 5 节中该 commit 的 `dev` 预检必须成功；任一条件不满足都停止，尤其不得在预检仍为 queued、in progress、failure 或 cancelled 时创建 Tag。把示例版本替换为本次真实版本。推送 Tag 会在私有 `madora` 启动 `Release Madora desktop` 工作流，并由工作流在公开 `madora-site` 创建带同名 `tag_name` 的 draft Release；公开 Tag 会在维护者发布 Draft 时才创建。不要在 `/Users/refinex/develop/project/madora-site` 手工创建或推送这个 Tag。不要在同一版本失败后反复删除并重建 Tag；先修复源码并提升版本。

当前发布恢复基线：`v0.1.7` 因 Node.js 20 与 pnpm 11 不兼容而失败；`v0.1.8` 误指向同一旧提交；`v0.1.9` 因官方损坏的 pnpm 11.12.0 在 `action-setup` 自安装阶段失败；`v0.1.10` 在 `dev` 预检失败后仍被创建，且 verify 因没有预先生成 Tauri 所需的 Codex/Pandoc/Typst sidecar 而在 Cargo 构建脚本阶段失败。四个版本都没有在公开 `madora-site` 创建 Tag、draft Release 或资产。`v0.1.11` 的三个原生构建任务虽然成功，但 macOS 只构建了 DMG，Draft 缺少两个 `.app.tar.gz`、对应 `.sig` 和四个 Darwin updater target，因此必须保持未发布。以上源码 Tag 和 `v0.1.11` Draft 都是不可变审计记录，不得移动、删除后重建或重新推送；修复从 `0.1.12` / `v0.1.12` 继续。

## 7. 验收 draft Release

执行位置分为三处：

1. `GITHUB-APP`：打开 `https://github.com/Refinex-Space/madora/actions/workflows/release.yml`，确认私有构建工作流三平台和最终 `Verify draft release assets` 均成功。
2. `GITHUB-SITE`：从工作流输出的 Draft URL 进入本版本 `untagged-*` Draft，保持 Draft，不要立即发布。Draft 不会出现在普通访客的公开 Releases/Tags 页面。
3. `MAC-TEST` / `WINDOWS-TEST`：从该 draft 下载对应安装包并做系统验收。

必须检查：

- 三个构建任务均成功：macOS Apple Silicon、macOS Intel、Windows x64；最终 `Verify draft release assets` 也必须成功。
- Draft 的 `tag_name`、标题版本与私有源码 Tag 一致；公开 Git Tag 在 Draft 发布后再检查。
- 在 `GITHUB-APP` 核对私有源码 Tag、workflow run 的 `headSha` 和本次发布版本一致，并把 workflow run URL 保留在内部发布记录；不要复制到公开 Release Notes。
- 资产必须精确包含 9 个文件：`Madora_aarch64.dmg`、`Madora_aarch64.app.tar.gz`、`Madora_aarch64.app.tar.gz.sig`、`Madora_x64.dmg`、`Madora_x64.app.tar.gz`、`Madora_x64.app.tar.gz.sig`、`Madora_x64-setup.exe`、`Madora_x64-setup.exe.sig`、`latest.json`。
- `latest.json` 的版本必须与 Tag 一致；`darwin-aarch64`、`darwin-aarch64-app`、`darwin-x86_64`、`darwin-x86_64-app`、`windows-x86_64`、`windows-x86_64-nsis` 六个 target 必须完整，URL 必须指向当前 Draft 的对应 updater asset，签名必须与对应 `.sig` 内容一致。
- 安装包名称由 `Madora_[arch][setup][ext]` 固定模式生成；官网按公开 Releases API、架构别名和扩展名动态匹配，不为每个版本硬编码 `/releases/latest/download/<文件名>`。
- Release Notes 只包含本版本用户可感知变化、升级注意事项、支持平台和已知限制，不得写入私有仓库信息、Git commit SHA、私有 workflow 地址、内部验收指令、密钥、Token 或本地路径。应用会把该正文作为更新说明展示给用户。

操作系统签名验收必须与 updater minisign 分开：

- `MAC-TEST`：从 draft 下载 DMG，把应用拖到 `/Applications` 后在该 Mac 的 Terminal 执行 `codesign -dv --verbose=4 /Applications/Madora.app`，应显示 ad-hoc 签名；Gatekeeper 仍会拒绝或警告未验证开发者，这是当前已接受限制。分别在 Apple Silicon 与 Intel 真机按“系统设置 → 隐私与安全性 → 仍要打开”完成首次放行，再验证启动和覆盖安装。
- `WINDOWS-TEST`：从 draft 下载 NSIS 安装器，在下载目录打开 PowerShell，执行 `Get-AuthenticodeSignature .\<实际安装包文件名>.exe`，结果应为 `NotSigned`；SmartScreen 和“未知发布者”属于当前已接受限制。通过用户明确确认继续安装，再验证启动、卸载和覆盖升级。若系统策略不允许绕过，记录为该环境当前不支持，不得建议用户关闭企业安全策略。
- updater：对 `latest.json` 中每个平台 URL、签名和 target 做独立检查；系统层未签名不能成为跳过 updater 签名的理由。

任何目标缺失、签名不匹配或 `latest.json` URL 无法下载，都不得发布 draft。

## 8. N-1 到 N 自动更新验收

执行位置：`MAC-TEST` 和 `WINDOWS-TEST` 上已经安装的 Madora 应用。这里不在源码仓库执行命令，也不通过开发模式代替安装版验收。

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

### 9.1 发布 Release

执行位置：`GITHUB-SITE`。完成 draft 验收后，在 `https://github.com/Refinex-Space/madora-site/releases` 打开本版本 draft，按实际用户可感知变化补全 Release Notes，然后点击发布。工作流生成的默认正文是公开安全的兜底说明，不包含内部追溯信息；正式发布前仍应将“本次更新”改成本版本的真实内容。可使用以下公开模板，替换版本和条目后删除所有占位符：

```markdown
## Madora vX.Y.Z

### 本次更新

- <用户可感知的功能或体验改进>
- <本版本修复的问题>

### 支持平台

- macOS Apple Silicon
- macOS Intel
- Windows x64

### 升级提示

安装前请保存当前工作。Madora 不会静默下载或强制安装更新。

### 已知限制

- macOS 版本当前未进行 Apple 公证，首次启动可能需要在“系统设置 → 隐私与安全性”中手动允许。
- Windows 安装包当前未使用 Authenticode 签名，安装时可能出现 SmartScreen 或“未知发布者”提示。
```

发布后在浏览器验证：

```text
https://github.com/Refinex-Space/madora-site/releases/latest
https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json
```

### 9.2 修改网站下载入口

执行位置：`SITE-LOCAL`。Release Assets 是 GitHub 元数据，不会产生 `madora-site` Git commit；网站也不会展示 Draft。当前站点已经通过公开 Releases API 动态选择最新的非 Draft、非 Prerelease Release，并按 macOS arm64、macOS x64、Windows x64 三个目标解析实际资产，所以正常发版不再为每个版本硬编码下载 URL。

只有在第 7 节 Draft 资产验收通过后，才在 `/Users/refinex/develop/project/madora-site/site.config.ts` 把 `version` 更新为本次应用版本，用于页脚等静态展示；在 Draft 不完整或工作流失败时不得提前更新。随后检查：

- `/Users/refinex/develop/project/madora-site/site.config.ts` 的 `repositoryUrl`、`releasesUrl` 和 `releasesApiUrl` 仍指向公开 `Refinex-Space/madora-site`，`downloads` 仍只包含三个真实目标；
- `/Users/refinex/develop/project/madora-site/lib/downloads.ts` 继续排除 Draft/Prerelease，并能按 `aarch64`、`x64` 和 `x64-setup.exe` 解析本次真实资产；
- `/Users/refinex/develop/project/madora-site/content/docs/zh-CN/install.md`、`content/docs/en/install.md`、中英文 FAQ 继续说明 Gatekeeper/SmartScreen 限制，不出现私有 `madora` 下载地址；
- `/Users/refinex/develop/project/madora-site/tests/downloads.test.ts` 继续覆盖三个实际目标、Draft 排除和资产匹配。只有资产命名、支持平台或系统限制发生变化时，才同步修改这些逻辑、文档和测试。

完成修改后，在 macOS Terminal 执行：

```bash
cd /Users/refinex/develop/project/madora-site
npx --yes pnpm@11.16.0 test:run
npx --yes pnpm@11.16.0 lint
npx --yes pnpm@11.16.0 typecheck
npx --yes pnpm@11.16.0 build
npx --yes pnpm@11.16.0 check:static
```

`madora-site` 页面应解析自身 GitHub Releases 的安装资产，不使用 GitHub Packages，也不把安装包复制进站点仓库。若以后修改 `/Users/refinex/develop/project/madora/.github/workflows/release.yml` 的 `releaseAssetNamePattern`，必须在同一次发布中更新 `/Users/refinex/develop/project/madora-site` 的资产匹配规则和测试，并验证三个下载按钮的最终文件。

站点只展示当前实际支持的三个目标，不提供 universal macOS 或 Windows ARM64 占位下载。网站发布属于独立仓库流程，本手册不授权从 Madora 仓库自动部署网站。

## 10. 故障、撤回与回滚

- `GITHUB-APP` 的 `dev` 分支预检在创建 Tag 前失败：此时没有需要保留的发布 Tag。在 `APP-LOCAL` 修复源码或工作流，保持当前尚未使用的应用版本，提交并推送到 `dev`；只有同一 commit 的新预检成功后才创建 Tag。
- `GITHUB-APP` 的 `v*` Tag 工作流失败：保留失败的私有源码 Tag 作为审计记录；在 `APP-LOCAL` 修复源码与工作流、提升 SemVer、提交到目标分支，再创建更高版本 Tag。不要移动或复用失败 Tag。
- `APP-LOCAL` 的完整 Rust 测试失败：停止发布，不创建 Tag；修复 Rust 代码后重新执行第 5 节全部本地验证。不要把 Cargo 冷构建重新加入 release verify，也不要通过删除测试、关闭 updater 签名或跳过 publish 的 Tauri sidecar staging 来换取成功。
- `GITHUB-SITE` Draft 或最终资产门禁失败：保持 Draft，不发布。若只是同一源码 commit 的网络抖动，可以重新运行失败任务；若要修改源码或工作流，必须提升 SemVer、提交到目标分支并创建更高版本 Tag，不能让旧 Tag 指向新提交，也不能沿用错误签名资产。
- `GITHUB-APP` 中 `MADORA_RELEASES_TOKEN` 失效或权限不足：保持源码 Tag，不手工改用宽权限 Token；在 `GITHUB-ACCOUNT` 更新最小权限 Token，再回到 `GITHUB-APP` 更新 Secret 并重新运行失败任务。
- `SITE-LOCAL` 链接错误：先停止部署网站，不移动或复制安装包；按第 9.2 节修正 `site.config.ts` 并重新执行站点五项验证。
- `GITHUB-SITE` 已发布版本存在严重缺陷：立即在 Release Notes 标记并让 `SITE-LOCAL` 停止推荐；在 `APP-LOCAL` 提升 SemVer，按完整流程发布热修复。不要依赖降级，因为 updater 默认只接受更高版本。
- `GITHUB-SITE` 已发布版本的更新说明包含内部信息：编辑 GitHub Release 正文不会自动改写已经上传的 `latest.json.notes`，不能把只改正文视为修复完成。优先在 `APP-LOCAL` 使用已修正的工作流发布更高补丁版本，使生产 `/releases/latest/download/latest.json` 切换到公开安全的说明；同时编辑旧 Release 正文，清除公开页面中的内部信息。若组织要求连旧版本资产也彻底清理，必须在明确维护窗口内只替换该版本的 `latest.json`，除 `notes` 外保持版本、发布日期、六个平台 URL 和签名原样，并在替换后重新执行第 7 节资产校验；该操作会短暂移除更新清单，不得未经单独确认执行。
- 删除或改回旧的 latest Release 不能修复已经安装坏版本的用户，也可能造成 endpoint 短暂不一致；优先从 `APP-LOCAL` 发布更高版本热修复。
- 单个平台资产错误：不得在 `GITHUB-SITE` 手工替换同名二进制而沿用旧 `.sig`/`latest.json`。必须从 `APP-LOCAL` 修复并重新生成匹配的 updater artifact、签名和清单，再完成三平台验收。
- 更新私钥疑似泄露：立即停止 `GITHUB-APP` 发布并按安全事件处理。密钥轮换不能直接替换，因为旧客户端固定信任旧公钥；需要先用旧密钥从 `APP-LOCAL` 发布一个嵌入新公钥的过渡版本，确认覆盖率后才切换新私钥。旧私钥不可用时，无法通过原 updater 安全迁移，只能要求用户手工安装新版本。

## 11. 发布完成记录

证据保存位置必须明确，不使用未定义的“内部记录”：

| 证据 | 保存位置 |
| --- | --- |
| 用户可见版本、更新内容、已知限制、安装说明 | `GITHUB-SITE` 对应版本的 Release Notes |
| 私有源码 commit、源码 Tag、三平台构建结果和 workflow 日志 | 仅保存在 `GITHUB-APP` 对应 `Release Madora desktop` workflow run 和组织内部发布记录；不得复制到公开 Release Notes、`latest.json` 或应用更新说明 |
| `latest.json` target、URL、签名检查结果 | `GITHUB-SITE` 对应 Release Assets 及 `GITHUB-APP` 的 `Verify draft release assets` 结果；Release Notes 只写用户需要了解的兼容性或限制，不粘贴内部校验详情 |
| macOS ad-hoc/Gatekeeper、Windows `NotSigned`/SmartScreen、三平台安装结果 | `GITHUB-SITE` Release Notes 的“验收与已知限制”段；失败时不得发布 |
| N-1→N 更新结果 | `GITHUB-SITE` Release Notes 的“更新验收”段；首次发布明确写“不适用：无 N-1” |
| 官网下载链接和静态构建结果 | `SITE-LOCAL` 的提交记录，以及对应 `madora-site` GitHub Actions/部署记录（若该仓库尚未配置部署工作流，则保留本机五项验证结果并在提交说明中注明） |

不要把私钥、Token、完整本地路径、私有 workflow 日志或用户文档写入公开 Release Notes。

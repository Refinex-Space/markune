---
owner: refinex
updated: 2026-07-23
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

关键边界：源码 Tag 在 `APP-LOCAL` 创建并推送到私有 `madora`；公开 `madora-site` 的 Release 和同名 Tag 由该 Tag 触发的工作流自动创建。不要进入 `SITE-LOCAL` 手工执行 `git tag`，也不要把安装包复制进 `madora-site` Git 工作树。

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
- 公钥可以公开，但必须保留完整两行 minisign 内容，包括 `untrusted comment:` 行。
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
| `MADORA_UPDATER_PUBLIC_KEY` | `madora-updater.key.pub` 的完整两行内容 |

工作流自身的默认 `GITHUB_TOKEN` 权限固定为 `contents: read`，只用于检出私有源码。`tauri-action` 的 `GITHUB_TOKEN` 环境变量实际接收 `MADORA_RELEASES_TOKEN`，并通过固定 `owner: Refinex-Space`、`repo: madora-site`、`releaseCommitish: main` 跨仓库创建 Release。不要把 Token 暴露给应用运行时或前端。

当前不配置任何 `APPLE_*`、Developer ID、Apple 公证或 Windows Authenticode Secret。release-only Tauri 配置把 macOS `signingIdentity` 固定为 `-`，生成 ad-hoc 签名；Windows 安装器保持系统层未签名。Tauri updater minisign 仍然强制启用，不能因为系统证书暂缓而删除。

当产品进入广泛公开分发阶段时，应单独批准并接入 Apple Developer ID + notarization 与 Windows Authenticode/Azure Artifact Signing。该升级会改变 CI/CD 凭据和验收门禁，不得只上传证书而跳过安全评审。

## 4. 每次发布前同步版本号

执行位置：`APP-LOCAL`。只修改以下两个绝对路径：

Madora 应用版本必须同时修改：

- `/Users/refinex/develop/project/madora/package.json` 的 `version`；
- `/Users/refinex/develop/project/madora/src-tauri/tauri.conf.json` 的 `version`。

使用 SemVer：

- 补丁修复：`0.1.6 → 0.1.7`；
- 向后兼容功能：`0.1.7 → 0.2.0`；
- 不兼容变化：稳定版后提升主版本。

Tag 必须精确为 `v<version>`，例如版本 `0.1.7` 只能使用 `v0.1.7`。发布脚本会拒绝版本不一致或 Tag 不匹配。

`/Users/refinex/develop/project/madora/src-tauri/Cargo.toml` 是 Rust crate 的内部版本，不在此步骤修改。`/Users/refinex/develop/project/madora-site/site.config.ts` 的网站展示版本等 draft Release 资产确认后再按第 9 节更新，不能代替应用版本同步。

## 5. 本地发布前验证

执行位置：`APP-LOCAL`。在 macOS Terminal 完整执行以下命令：

```bash
cd /Users/refinex/develop/project/madora
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
cd /Users/refinex/develop/project/madora
MADORA_UPDATER_PUBLIC_KEY="$(cat ~/.tauri/madora-updater.key.pub)" pnpm release:prepare
```

生成文件位于 `/Users/refinex/develop/project/madora/.tauri-build/tauri.release.generated.json`，已被 Git 忽略。检查它只包含 `madora-site` 的固定 HTTPS endpoint、公钥、`createUpdaterArtifacts: true`、macOS ad-hoc identity `-` 和 Windows passive 安装模式。不要提交该文件，也不要在终端打印私钥。

## 6. 创建发布 Tag

执行位置：`APP-LOCAL`。确认版本变更、发布说明和验证结果已经提交到私有 `madora` 的目标分支后执行：

```bash
cd /Users/refinex/develop/project/madora
git status --short
git tag -a v0.1.7 -m "Madora v0.1.7"
git push origin v0.1.7
```

把示例版本替换为本次真实版本。推送 Tag 会在私有 `madora` 启动 `Release Madora desktop` 工作流，并由工作流在公开 `madora-site` 创建同名 Release Tag 和 draft Release。不要在 `/Users/refinex/develop/project/madora-site` 手工创建或推送这个 Tag。不要在同一版本失败后反复删除并重建 Tag；先修复源码并提升版本，或在 draft 尚未公开且团队确认无外部消费时按组织流程处理。

## 7. 验收 draft Release

执行位置分为三处：

1. `GITHUB-APP`：打开 `https://github.com/Refinex-Space/madora/actions/workflows/release.yml`，确认私有构建工作流三平台成功。
2. `GITHUB-SITE`：打开 `https://github.com/Refinex-Space/madora-site/releases`，进入本版本 draft，保持 draft，不要立即发布。
3. `MAC-TEST` / `WINDOWS-TEST`：从该 draft 下载对应安装包并做系统验收。

必须检查：

- 三个构建任务均成功：macOS Apple Silicon、macOS Intel、Windows x64。
- Release Tag 和标题版本与源码一致。
- Release 正文记录了触发构建的私有源码 commit；把对应私有 workflow run URL 写入内部发布记录，不公开内部日志。
- 资产包含两个 DMG、一个 NSIS 安装器、各平台 updater artifact、对应 `.sig` 和 `latest.json`。
- `latest.json` 的版本、下载 URL、签名以及 macOS 两种架构和 Windows NSIS target 均完整。
- 安装包名称由 `Madora_[arch][setup][ext]` 固定模式生成。`[arch]` 的实际字符串由 Tauri Action 按平台替换；第一次发布后记录 draft 中的真实文件名，再把稳定的 `/releases/latest/download/<文件名>` 地址接入站点下载按钮。
- Release Notes 只包含本版本用户可感知变化、升级注意事项和已知限制，不写内部密钥或本地路径。

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

执行位置：`GITHUB-SITE`。完成 draft 验收后，在 `https://github.com/Refinex-Space/madora-site/releases` 打开本版本 draft，补全用户可见 Release Notes，然后点击发布。发布后在浏览器验证：

```text
https://github.com/Refinex-Space/madora-site/releases/latest
https://github.com/Refinex-Space/madora-site/releases/latest/download/latest.json
```

### 9.2 修改网站下载入口

执行位置：`SITE-LOCAL`。只有在第 7 节已经看到 draft 中的实际资产文件名后，才修改网站。当前需要检查和修改的真实文件是：

- `/Users/refinex/develop/project/madora-site/site.config.ts`：
  - 删除 `placeholderDownloadUrl` 及其私有仓库占位值；
  - `repositoryUrl` 改为公开 `https://github.com/Refinex-Space/madora-site`；
  - `version` 改为本次应用版本；
  - `downloads` 只保留 macOS arm64、macOS x64、Windows x64；
  - 删除 `macos/universal` 项及不再需要的 `universal` 类型；
  - 每个 `url` 改为 `https://github.com/Refinex-Space/madora-site/releases/latest/download/<draft 中确认的实际文件名>`。
- `/Users/refinex/develop/project/madora-site/components/site-header.tsx`：把仍指向私有 `Refinex-Space/madora` 的 GitHub 链接改为公开站点仓库或 Releases 页面。
- `/Users/refinex/develop/project/madora-site/app/[locale]/download/page.tsx`：删除“当前链接仍是占位地址”的提示，改为当前无系统证书的 Gatekeeper/SmartScreen 说明。
- `/Users/refinex/develop/project/madora-site/content/docs/zh-CN/install.md` 和 `/Users/refinex/develop/project/madora-site/content/docs/en/install.md`：删除 Universal/占位下载描述，写明三种实际构建和系统放行步骤。
- `/Users/refinex/develop/project/madora-site/content/docs/zh-CN/faq.md` 和 `/Users/refinex/develop/project/madora-site/content/docs/en/faq.md`：不得继续引导普通用户访问私有 `madora` 仓库。
- `/Users/refinex/develop/project/madora-site/tests/downloads.test.ts`：同步删除 Universal 假设并覆盖三个实际目标。

完成修改后，在 macOS Terminal 执行：

```bash
cd /Users/refinex/develop/project/madora-site
npx --yes pnpm@11.12.0 test:run
npx --yes pnpm@11.12.0 lint
npx --yes pnpm@11.12.0 typecheck
npx --yes pnpm@11.12.0 build
npx --yes pnpm@11.12.0 check:static
```

`madora-site` 页面应链接自身 GitHub Releases 的安装资产，不使用 GitHub Packages，也不把安装包复制进站点仓库。若以后修改 `/Users/refinex/develop/project/madora/.github/workflows/release.yml` 的 `releaseAssetNamePattern`，必须在同一次发布中回到 `/Users/refinex/develop/project/madora-site/site.config.ts` 更新链接并验证 302 跳转和最终下载。

站点只展示当前实际支持的三个目标，不提供 universal macOS 或 Windows ARM64 占位下载。网站发布属于独立仓库流程，本手册不授权从 Madora 仓库自动部署网站。

## 10. 故障、撤回与回滚

- `GITHUB-SITE` draft 失败：保持 draft，不发布；回到 `GITHUB-APP` 查看失败任务，在 `APP-LOCAL` 修复源码后重新运行工作流，先确认不会复用错误签名资产。
- `GITHUB-APP` 中 `MADORA_RELEASES_TOKEN` 失效或权限不足：保持源码 Tag，不手工改用宽权限 Token；在 `GITHUB-ACCOUNT` 更新最小权限 Token，再回到 `GITHUB-APP` 更新 Secret 并重新运行失败任务。
- `SITE-LOCAL` 链接错误：先停止部署网站，不移动或复制安装包；按第 9.2 节修正 `site.config.ts` 并重新执行站点五项验证。
- `GITHUB-SITE` 已发布版本存在严重缺陷：立即在 Release Notes 标记并让 `SITE-LOCAL` 停止推荐；在 `APP-LOCAL` 提升 SemVer，按完整流程发布热修复。不要依赖降级，因为 updater 默认只接受更高版本。
- 删除或改回旧的 latest Release 不能修复已经安装坏版本的用户，也可能造成 endpoint 短暂不一致；优先从 `APP-LOCAL` 发布更高版本热修复。
- 单个平台资产错误：不得在 `GITHUB-SITE` 手工替换同名二进制而沿用旧 `.sig`/`latest.json`。必须从 `APP-LOCAL` 修复并重新生成匹配的 updater artifact、签名和清单，再完成三平台验收。
- 更新私钥疑似泄露：立即停止 `GITHUB-APP` 发布并按安全事件处理。密钥轮换不能直接替换，因为旧客户端固定信任旧公钥；需要先用旧密钥从 `APP-LOCAL` 发布一个嵌入新公钥的过渡版本，确认覆盖率后才切换新私钥。旧私钥不可用时，无法通过原 updater 安全迁移，只能要求用户手工安装新版本。

## 11. 发布完成记录

证据保存位置必须明确，不使用未定义的“内部记录”：

| 证据 | 保存位置 |
| --- | --- |
| 用户可见版本、更新内容、已知限制、安装说明 | `GITHUB-SITE` 对应版本的 Release Notes |
| 私有源码 commit、源码 Tag、三平台构建结果和 workflow 日志 | `GITHUB-APP` 对应 `Release Madora desktop` workflow run；Release Notes 同时保留工作流自动写入的源码 commit SHA |
| `latest.json` target、URL、签名检查结果 | `GITHUB-SITE` 对应 Release Assets；在 Release Notes 的维护者验收段记录结论，不粘贴私钥或敏感日志 |
| macOS ad-hoc/Gatekeeper、Windows `NotSigned`/SmartScreen、三平台安装结果 | `GITHUB-SITE` Release Notes 的“验收与已知限制”段；失败时不得发布 |
| N-1→N 更新结果 | `GITHUB-SITE` Release Notes 的“更新验收”段；首次发布明确写“不适用：无 N-1” |
| 官网下载链接和静态构建结果 | `SITE-LOCAL` 的提交记录，以及对应 `madora-site` GitHub Actions/部署记录（若该仓库尚未配置部署工作流，则保留本机五项验证结果并在提交说明中注明） |

不要把私钥、Token、完整本地路径、私有 workflow 日志或用户文档写入公开 Release Notes。

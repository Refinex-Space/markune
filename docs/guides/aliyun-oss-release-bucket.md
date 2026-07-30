---
owner: refinex
updated: 2026-07-26
status: active
referenced_by: docs/guides/release-and-update.md
---

# Madora 上海 OSS 发布 Bucket 从零配置手册

本文用于从空白阿里云账号配置 Madora 生产更新分发。完成后，GitHub Release 仍是版本、Release Notes、构建资产和审计权威；阿里云 OSS 只承担中国大陆优先下载。当前固定使用华东 2（上海），不接入 Gitee、CDN、自定义域名、传输加速或长期 AccessKey。

任何一步出现“停止操作”时，不要继续后续步骤。先保存截图或错误信息，恢复到该节的预期结果，再继续。

## 1. 准备事项与记录表

### 1.1 操作身份

使用能够管理 OSS、RAM、OIDC Provider、角色策略、云监控和费用告警的阿里云管理员身份登录控制台。日常发布不会使用该管理员身份，而是由 GitHub Actions 通过 OIDC 临时承担 RAM Role。

禁止：

- 创建 RAM 用户长期 AccessKey；
- 把主账号 AccessKey、STS Token、Cookie、证书或控制台导出的凭据写入仓库；
- 复用已有业务 Bucket；
- 在公开 Issue、Release Notes 或聊天中粘贴真实账号 UID。

### 1.2 先记录下列变量

在受控的内部记录中建立下表。尖括号是占位符，不能原样用于生产，也不能把真实值提交到 Git：

| 名称 | 固定值或待填写值 |
| --- | --- |
| `ALIYUN_ACCOUNT_UID` | `<ALIYUN_ACCOUNT_UID>`，仅用于控制台策略资源 ARN |
| `MADORA_OSS_REGION` | `cn-shanghai` |
| `MADORA_OSS_ENDPOINT` | `https://oss-cn-shanghai.aliyuncs.com` |
| `MADORA_OSS_BUCKET` | `<BUCKET_NAME>` |
| `MADORA_OSS_PUBLIC_BASE_URL` | `https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com` |
| `MADORA_OSS_ROLE_ARN` | `<RAM_ROLE_ARN>` |
| `MADORA_OSS_OIDC_PROVIDER_ARN` | `<OIDC_PROVIDER_ARN>` |

预期结果：当前只有 Region 和 Endpoint 是最终值，其余仍是占位符。

停止操作：若计划使用的地域不是“华东 2（上海）”，或 Endpoint 中出现其他 Region，先纠正设计，不创建 Bucket。

## 2. 新建 Madora 专用 Bucket

打开阿里云控制台，进入 `对象存储 OSS → Bucket 列表 → 创建 Bucket`。不要选择“快速创建静态网站”等带附加能力的入口。

### 2.1 创建页固定选项

| 控制台选项 | 固定选择 | 原因与预期结果 |
| --- | --- | --- |
| Bucket 名称 | `madora-releases-<唯一后缀>` | 只允许小写字母、数字和连字符；名称全局唯一，创建后不能修改 |
| 地域 | `华东 2（上海）` | 控制台或详情页最终显示 Region ID `cn-shanghai` |
| 存储类型 | `标准存储 Standard` | 安装包属于频繁读取对象，不选择低频、归档或冷归档 |
| 存储冗余 | `同城冗余 ZRS` | 生产更新主源跨上海多个可用区冗余；创建后不能降回 LRS |
| 读写权限 ACL | `私有 Private` | Bucket 不是全量公共读，匿名访问后续只通过指定前缀 Policy 开放 |
| 阻止公共访问 | `开启` | 创建阶段先保持安全默认，Policy 准备完成后只关闭该 Bucket 的开关 |
| 服务端加密 | `SSE-OSS / OSS 托管密钥` | 不引入自管 KMS 密钥和额外 KMS 权限 |
| 资源组 | `默认资源组` | 当前没有单独资源组治理要求 |
| OSS-HDFS | `不开通` | 发布对象不使用 HDFS 语义 |

创建前再次确认名称与地域。点击创建后，把最终 Bucket 名称回填到内部记录：

```text
MADORA_OSS_BUCKET=<BUCKET_NAME>
MADORA_OSS_PUBLIC_BASE_URL=https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com
```

预期结果：Bucket 详情显示 `cn-shanghai`、Standard、ZRS、Private、SSE-OSS，公共访问仍被阻止。

禁止：Public Read、Public Read/Write、LRS、KMS 自管密钥、复用现有 Bucket。

停止操作：

- 名称拼写错误；Bucket 名称不能改，应删除空 Bucket 后重新创建；
- 地域错误；对象不能原地迁区，应删除空 Bucket 后在上海重建；
- 误选 LRS；ZRS/LRS 转换受产品约束，不要边发布边调整，先重建正确 Bucket；
- Bucket 已有非 Madora 对象；说明复用了其他业务 Bucket，停止并新建专用 Bucket。

## 3. 创建后的功能配置

进入新 Bucket 详情页，按以下顺序配置。

### 3.1 版本控制

进入 `数据管理 → 版本控制`，选择`开启`并确认。

预期结果：状态为“开启”。后续覆盖 `updates/stable/latest.json` 或 `downloads/stable.json` 时保留旧版本，便于恢复。

禁止：发布后暂停版本控制；清空历史版本。

停止操作：版本控制无法开启时，不创建公开 Policy，不接入发布工作流。

### 3.2 Bucket 标签

进入 `基础设置 → Bucket 标签`，添加：

| Key | Value |
| --- | --- |
| `project` | `madora` |
| `purpose` | `release-distribution` |
| `environment` | `production` |

预期结果：三个标签均可在 Bucket 详情看到。

### 3.3 明确关闭或不启用的能力

逐项检查，保持下列状态：

- 定时备份：不开启；GitHub Release 是异地权威副本；
- 跨区域复制：不开启；
- 静态网站托管：不开启；
- 传输加速：不开启；
- 请求者付费：不开启，否则匿名更新请求无法正常工作；
- WORM/合规保留：不开启，否则会阻塞 stable 清单更新；
- 实时日志查询：初期不开启，避免自动创建 SLS 资源和费用；
- 防盗链/Referer 白名单：关闭；Tauri、命令行及部分桌面请求没有可靠 Referer；
- CDN 与自定义域名：不配置。

预期结果：Bucket 只提供标准 OSS 对象存储和 HTTPS 访问，没有隐藏的付费或请求限制能力。

停止操作：若组织级策略强制 WORM、请求者付费或 Referer 白名单，不要规避策略；先确认该账号是否适合公开软件分发。

### 3.4 CORS

进入 `数据安全 → 跨域设置 CORS → 创建规则`，填写：

| 字段 | 值 |
| --- | --- |
| Allowed Origins | `*` |
| Allowed Methods | `GET`、`HEAD` |
| Allowed Headers | `*` |
| Expose Headers | `ETag`、`Content-Length`、`Content-Range`、`Accept-Ranges` |
| Max Age | `600` |

预期结果：浏览器官网可读取 `downloads/stable.json`，但跨域写方法未开放。

禁止：在 Allowed Methods 中加入 `PUT`、`POST`、`DELETE`。

停止操作：若控制台自动加入写方法，删除该规则并重建，不要保存宽权限 CORS。

### 3.5 生命周期

进入 `数据管理 → 生命周期`，创建以下规则。规则只处理历史版本或未完成分片，不删除当前对象。

1. `abort-incomplete-multipart-7d`
   - 范围：整个 Bucket；
   - 动作：未完成的 Multipart Upload 在 7 天后终止；
   - 不配置当前对象过期。
2. `expire-stable-noncurrent-90d`
   - 前缀：`updates/stable/`；
   - 动作：非当前历史版本 90 天后删除；
   - 当前版本永不过期。
3. `expire-downloads-noncurrent-90d`
   - 前缀：`downloads/`；
   - 动作：非当前历史版本 90 天后删除；
   - 当前版本永不过期。

不要为 `releases/` 创建过期规则。`releases/vX.Y.Z/` 是不可覆盖、不可自动清理的版本证据。

预期结果：三个规则均启用；只有分片和 stable 历史版本会自动清理。

停止操作：规则预览显示会删除 `releases/`、当前 `latest.json` 或当前 `stable.json` 时，取消保存并重新配置。

## 4. 精细化匿名下载权限

### 4.1 先检查账号级“阻止公共访问”

进入 OSS 账号级安全设置，查看“阻止公共访问”。

- 若账号级开关关闭：继续 4.2；
- 若账号级开关开启：停止操作。先列出该账号内所有 Bucket、现有公共 Policy、业务所有者和合规要求。未经审计不得为 Madora 直接关闭账号级保护。

完成审计并得到明确批准后，才可以按组织流程调整账号级开关。该操作影响账号内其他 Bucket，不属于 Madora 仓库自动化范围。

### 4.2 只关闭新 Bucket 自身的保护

进入 `<BUCKET_NAME> → 权限控制 → 阻止公共访问`，只关闭这个 Bucket 的开关。Bucket ACL 继续保持 Private。

预期结果：Bucket 允许保存公共 Bucket Policy，但 ACL 仍显示 Private。

禁止：把 Bucket ACL 改为公共读或公共读写。

### 4.3 添加三个只读前缀

进入 `权限控制 → Bucket Policy`。按控制台可视化方式分别新增三条 Allow：

| 前缀 | 授权用户 | 操作 | 访问方式 |
| --- | --- | --- | --- |
| `releases/*` | 所有账号 `*` | 精确选择 `oss:GetObject` | 仅 HTTPS |
| `updates/*` | 所有账号 `*` | 精确选择 `oss:GetObject` | 仅 HTTPS |
| `downloads/*` | 所有账号 `*` | 精确选择 `oss:GetObject` | 仅 HTTPS |

不要选择控制台概括的“只读”组合，除非展开后确认只有 `oss:GetObject`；某些“只读”预设还包含 `ListObjects`。不授予 Bucket 根资源、不授予 `ListObjects`、`GetObjectVersion`、上传、覆盖或删除。

如需使用 JSON 编辑器，先替换 `<ALIYUN_ACCOUNT_UID>` 与 `<BUCKET_NAME>`，然后保存。此示例额外显式拒绝所有 HTTP 请求：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": ["*"],
      "Action": ["oss:GetObject"],
      "Resource": ["acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/releases/*"]
    },
    {
      "Effect": "Allow",
      "Principal": ["*"],
      "Action": ["oss:GetObject"],
      "Resource": ["acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/updates/*"]
    },
    {
      "Effect": "Allow",
      "Principal": ["*"],
      "Action": ["oss:GetObject"],
      "Resource": ["acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/downloads/*"]
    },
    {
      "Effect": "Deny",
      "Principal": ["*"],
      "Action": ["oss:*"] ,
      "Resource": [
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>",
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/*"
      ],
      "Condition": {
        "Bool": {
          "acs:SecureTransport": ["false"]
        }
      }
    }
  ]
}
```

预期结果：控制台公共访问检查只识别上述三个对象前缀；Bucket 根目录没有匿名权限；HTTP 被 Deny。

禁止：

- `Action: oss:*` 的 Allow；
- `Resource: ...:<BUCKET_NAME>/*` 的公共 Allow；
- 公共 `ListObjects`；
- 公共写入、覆盖、删除；
- 把账号 UID 或 Bucket 占位符原样保存。

停止操作：策略保存后显示“整个 Bucket 公共读”、出现 `ListObjects` 或写操作，立即恢复 Bucket 的“阻止公共访问”，删除错误 Policy，再重新配置。

## 5. GitHub Actions OIDC 与 RAM Role

### 5.1 创建 OIDC Provider

进入 `RAM → 身份管理 → SSO 管理 → OIDC → 创建身份提供商`，填写：

| 字段 | 固定值 |
| --- | --- |
| Provider 名称 | `github-actions` |
| Issuer URL | `https://token.actions.githubusercontent.com` |
| Client ID / Audience | `sts.aliyuncs.com` |
| 最早颁发时间限制 | `1 小时` |

证书指纹点击控制台“获取指纹”，不要从本文复制固定指纹。指纹可能随证书链轮换。

在本机做辅助复核：

```bash
openssl s_client \
  -connect token.actions.githubusercontent.com:443 \
  -servername token.actions.githubusercontent.com \
  </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -fingerprint -sha1
```

本机命令只显示当前连接使用的叶证书信息；最终仍以阿里云官方“获取指纹”流程和 GitHub OIDC 官方配置为准。若域名、Issuer、证书有效期或控制台结果无法对应，停止创建，排查代理/TLS 劫持或官方变更，不能手工忽略差异。

创建后记录 Provider ARN：

```text
MADORA_OSS_OIDC_PROVIDER_ARN=<OIDC_PROVIDER_ARN>
```

预期结果：Provider 名为 `github-actions`，Issuer 与 Audience 精确匹配，ARN 形如 `acs:ram::<账号UID>:oidc-provider/github-actions`。

### 5.2 创建 RAM Role

进入 `RAM → 身份管理 → 角色 → 创建角色`：

- 可信实体类型：身份提供商；
- 身份提供商类型：OIDC；
- Provider：`github-actions`；
- Role 名称：`madora-github-release`；
- 最大会话时长：`1 小时`。

创建后打开“信任策略”，切换 JSON 编辑器，使用下列策略。只替换 `<OIDC_PROVIDER_ARN>`：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "<OIDC_PROVIDER_ARN>"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "oidc:iss": ["https://token.actions.githubusercontent.com"],
          "oidc:aud": ["sts.aliyuncs.com"],
          "oidc:sub": [
            "repo:Refinex-Space/madora:environment:production-release"
          ]
        }
      }
    }
  ]
}
```

这里必须使用 GitHub Environment subject，不能改成分支通配符、Tag 通配符或 `repo:Refinex-Space/*`。Promotion 工作流固定运行在 `production-release` Environment，并可选输出经过校验的 `iss`、`aud`、`sub`；脚本绝不输出原始 JWT。

记录 Role ARN：

```text
MADORA_OSS_ROLE_ARN=<RAM_ROLE_ARN>
```

预期结果：只有 `Refinex-Space/madora` 中进入 `production-release` Environment 的工作流 Token 能承担该角色。

停止操作：信任策略出现 `StringLike` 通配符、其他仓库、其他 Environment、错误 Audience，或 Role 可被阿里云账号普通身份直接承担。

### 5.3 创建最小 OSS 权限策略

进入 `RAM → 权限管理 → 权限策略 → 创建权限策略 → JSON`。策略名称建议 `MadoraReleaseDistributionPolicy`。替换 `<ALIYUN_ACCOUNT_UID>` 与 `<BUCKET_NAME>`：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetBucketInfo",
        "oss:GetBucketLocation"
      ],
      "Resource": [
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject"
      ],
      "Resource": [
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/releases/*",
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/updates/*",
        "acs:oss:*:<ALIYUN_ACCOUNT_UID>:<BUCKET_NAME>/downloads/*"
      ]
    }
  ]
}
```

阿里云的 `oss:PutObject` 授权覆盖简单上传、分片上传、完成与终止本次分片所需的数据面操作；工作流不请求 `ListObjects`，也不需要单独的 Bucket 管理权限。

把该自定义策略只授予 `madora-github-release` Role。

预期结果：Role 只能查看目标 Bucket 的基本位置，只能读写三个前缀；不能删除对象、列举目录、创建 Bucket、改 ACL、改 Bucket Policy 或访问其他 Bucket。

禁止添加：

- `oss:DeleteObject`、`oss:DeleteObjectVersion`；
- `oss:ListObjects`、`oss:ListObjectVersions`；
- `oss:PutBucketAcl`、`oss:PutObjectAcl`、`oss:PutBucketPolicy`；
- `oss:PutBucket`、`oss:DeleteBucket`；
- `Resource: *` 或整个 Bucket 对象通配符；
- KMS 权限；当前使用 SSE-OSS，不需要 KMS。

停止操作：控制台提示策略需要管理员级 OSS 权限，或 ossutil 只能在加入 Delete/List 后工作。不要扩大权限，先核对命令是否误用了递归、同步或列举操作。

## 6. GitHub 仓库回填

### 6.1 创建受保护 Environment

打开私有 `Refinex-Space/madora → Settings → Environments → New environment`，名称必须为：

```text
production-release
```

建议启用 Required reviewers，至少一名发布负责人审核。不要配置允许任意分支自动进入的部署规则；Promotion 是手工 `workflow_dispatch`，仍需选择并审核具体 `vX.Y.Z`。

预期结果：Environment 名称与 OIDC `sub` 完全一致。

### 6.2 配置 GitHub Actions Variables

进入私有仓库 `Settings → Secrets and variables → Actions → Variables`，新增以下非敏感值：

```text
MADORA_OSS_REGION=cn-shanghai
MADORA_OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
MADORA_OSS_BUCKET=<实际 Bucket 名称>
MADORA_OSS_PUBLIC_BASE_URL=https://<实际 Bucket 名称>.oss-cn-shanghai.aliyuncs.com
MADORA_OSS_ROLE_ARN=<实际 RAM Role ARN>
MADORA_OSS_OIDC_PROVIDER_ARN=<实际 OIDC Provider ARN>
```

已有 `MADORA_UPDATER_PUBLIC_KEY` 继续保留。Bucket 名称和 ARN 是资源标识，不是凭据，使用 Variables；不要为了“隐藏”而改存 Secrets。

OIDC 不产生需要长期保存的 AccessKey Secret。现有 `MADORA_RELEASES_TOKEN`、`TAURI_SIGNING_PRIVATE_KEY` 与密码仍按发布手册保存在 Secrets；它们与 OSS OIDC 不是同一权限域。

### 6.3 配置官网环境变量

`madora-site` 是 Next.js 静态导出站点，`NEXT_PUBLIC_*` 会在 `pnpm build` 时固化到 `out/`，不存在部署后再由 Nginx 注入的运行时环境变量。仓库通过 `.env.production.example` 保存可审查的生产模板，本机 `.env.production` 被 Git 忽略。

当前生产 Bucket 已确认为 `madora-releases-2026`。在 `madora-site` 仓库根目录执行：

```bash
cp .env.production.example .env.production
```

检查 `.env.production` 包含：

```text
NEXT_PUBLIC_MADORA_DOWNLOAD_MANIFEST_URL=https://madora-releases-2026.oss-cn-shanghai.aliyuncs.com/downloads/stable.json
```

然后执行 `pnpm build` 和 `pnpm check:static`，部署新生成的 `out/`。只修改 `.env.production` 而不重新构建，不会改变线上静态文件。

当前 `downloads/stable.json` 尚未生成时，OSS 会返回 `NoSuchKey`，官网会回退 GitHub Releases API；这不需要把变量重新置空。首次 Promotion 成功并最后写入 stable 清单后，官网会自动使用 OSS 主源，无需再次改 URL。

停止操作：如果 URL 使用单数 `madora-release-2026`，立即纠正。该 Bucket 不存在，实际名称是复数 `madora-releases-2026`。

## 7. 初始化测试对象与匿名验证

不要用生产安装包做第一轮权限测试。先在本机创建无敏感内容的小文件：

```bash
printf 'madora-oss-read-test\n' > /tmp/madora-oss-read-test.txt
```

使用管理员控制台“上传文件”，只上传到：

```text
downloads/madora-oss-read-test.txt
```

上传完成后执行。把 `<BUCKET_NAME>` 换成实际名称：

```bash
curl --fail --silent --show-error \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/downloads/madora-oss-read-test.txt"

curl --silent --output /dev/null --write-out '%{http_code}\n' \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/"

curl --silent --output /dev/null --write-out '%{http_code}\n' \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/?prefix=downloads/"

curl --request PUT --data-binary @/tmp/madora-oss-read-test.txt \
  --silent --output /dev/null --write-out '%{http_code}\n' \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/downloads/anonymous-put-test.txt"

curl --request DELETE \
  --silent --output /dev/null --write-out '%{http_code}\n' \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/downloads/madora-oss-read-test.txt"
```

预期结果：

| 请求 | 预期 |
| --- | --- |
| 已知对象 HTTPS GET | `200`，正文为 `madora-oss-read-test` |
| Bucket 根目录 | `403` |
| 带 prefix 的列举 | `403` |
| 匿名 PUT | `403` |
| 匿名 DELETE | `403` |

再验证 HTTP 被拒绝：

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  "http://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/downloads/madora-oss-read-test.txt"
```

预期为 `403`。如果客户端或网络自动跳转，使用 `curl --max-redirs 0` 再检查，不能把跳转视为 Policy 已强制 HTTPS。

停止操作：已知对象不是 200，或根目录、列举、PUT、DELETE 任一返回 2xx。重新开启 Bucket 的“阻止公共访问”，修复 Policy 后再测试。

完成权限验证后，可在控制台删除测试对象；这一步使用管理员身份，不属于发布 Role。生产 Role 本身没有删除权限。

## 8. 首次 Promotion 验证

完成真实版本的 GitHub Draft 构建、三平台验收和最终 Release Notes 编辑后，打开私有仓库 `Actions → Promote Madora release → Run workflow`：

1. `tag` 填已存在的源码 Tag，例如 `vX.Y.Z`；
2. 首次联调可勾选 `print_oidc_claims`；它只输出 `iss`、`aud`、`sub`；
3. 等待 `production-release` reviewer 批准；
4. 确认工作流使用 OIDC 获取临时凭据，没有 AccessKey Secret；
5. 确认 8 个版本化对象上传到 `releases/vX.Y.Z/`；
6. 确认工作流从 OSS 公网回读并通过 SHA-256 与三个 minisign 校验；
7. 确认 GitHub Release 新增 `latest-github.json` 并正式发布；
8. 最后确认 OSS 出现 `updates/stable/latest.json` 和 `downloads/stable.json`。

Promotion 脚本拒绝默认兜底 Release Notes、占位符、错误 Region、错误 Bucket 域名、长期凭据缺失、资产不全或已发布版本对象内容不一致。任何失败都不会提前更新 OSS stable 清单。

## 9. 下载与更新端到端验证

### 9.1 清单检查

```bash
curl --fail --silent --show-error \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/updates/stable/latest.json"

curl --fail --silent --show-error \
  "https://<BUCKET_NAME>.oss-cn-shanghai.aliyuncs.com/downloads/stable.json"

curl --fail --silent --show-error \
  "https://github.com/Refinex-Space/madora-site/releases/latest/download/latest-github.json"
```

检查：

- OSS `latest.json` 的六个平台 URL 都指向上海 OSS 的 `releases/vX.Y.Z/`；
- GitHub `latest-github.json` 的六个平台 URL 都指向 GitHub Release；
- 两份 updater 清单的 `version`、`notes`、`pub_date`、签名一致；
- `downloads/stable.json` 只有 macOS arm64 DMG、macOS x64 DMG、Windows x64 EXE，并包含 size 与 SHA-256；
- GitHub `latest.json` 也指向 OSS，保证旧客户端直接下载上海对象。

### 9.2 中国大陆网络下载

在两条彼此独立的中国大陆网络各执行三次完整下载。每次使用清单中的真实 URL，下载后执行：

```bash
shasum -a 256 <下载文件>
```

结果必须与 `downloads/stable.json` 的 `sha256` 一致。记录每次总耗时、文件大小、HTTP 状态和哈希，不记录含凭据的请求头。

### 9.3 N-1 到 N 更新

分别完成：

- macOS Apple Silicon；
- macOS Intel；
- Windows x64。

每个平台从 N-1 已安装版本检查 N，验证 OSS 主清单可用；再通过临时阻断 OSS 域名或受控故障演练验证 GitHub `latest-github.json` 元数据回退。注意：Tauri updater 的多个 endpoint 只回退清单请求；一旦 OSS 清单成功返回但其中二进制 URL 下载失败，不会自动切换到 GitHub 二进制。此时应回滚 stable 清单或恢复 OSS，而不是宣称二进制具备透明双源重试。

## 10. 流量、费用与故障监控

### 10.1 云监控

在云监控为 `<BUCKET_NAME>` 建立告警，至少覆盖：

- 外网流出流量突增；
- GET 请求数突增；
- 4xx 比例持续升高；
- 5xx 比例大于正常基线；
- 存储量或对象数异常增长；
- 未完成 Multipart Upload 数量异常。

初始阈值应根据首个稳定版本的真实下载基线调整。没有历史数据时，可先用通知级告警，观察一周后设置分级阈值，不要直接配置会自动删除对象或关闭 Bucket 的动作。

### 10.2 费用中心

在费用与成本中心设置月度预算和实际费用告警，覆盖 OSS 存储、外网流量、请求次数。防盗链保持关闭，费用风险由只读前缀、不可列举、预算告警和流量监控控制。

预期结果：维护者能在流量或费用异常扩大前收到通知。

停止操作：尚未配置任何费用联系人或告警渠道时，不将官网和客户端切到 OSS 主源。

## 11. 回滚与误配置恢复

### 11.1 Policy 误开放

1. 立即开启该 Bucket 的“阻止公共访问”；
2. 删除或修复错误的公共 Allow；
3. 确认 Bucket ACL 仍为 Private；
4. 重复第 7 节匿名测试；
5. 通过后再只关闭 Bucket 级保护。

### 11.2 OIDC 或 Role 误配置

1. 在 GitHub 禁用 `production-release` Environment 或取消 reviewer 批准；
2. 删除 Role 上的 `MadoraReleaseDistributionPolicy` 授权，立即阻断新会话；
3. 修复信任策略的 `iss`、`aud`、`sub`；
4. 等待已有最长 1 小时 STS 会话过期；
5. 只用安全 claims 诊断重新联调。

不要创建长期 AccessKey 作为临时绕过。

### 11.3 stable 清单错误

1. 在 OSS 版本控制中定位 `updates/stable/latest.json` 或 `downloads/stable.json` 的上一有效版本；
2. 将上一版本恢复为当前版本；
3. 从公网重新下载并核对内容与 SHA-256；
4. 暂停 Promotion，调查失败步骤。

不要删除 GitHub Release、`releases/vX.Y.Z/` 历史对象或整个 Bucket。若二进制本身错误，发布更高补丁版本，禁止覆盖已发布版本对象。

### 11.4 OSS 故障

- OSS stable 清单不可用时，新客户端会尝试 GitHub `latest-github.json`；
- OSS stable 清单可用但版本对象异常时，立即恢复上一 stable 清单或临时让该清单请求失败，以触发元数据回退；
- 官网会在 `downloads/stable.json` 请求失败或校验失败时回退 GitHub Releases API；
- 恢复后重新做三平台 N-1 → N，不以单次 curl 代替桌面验收。

## 12. 完成清单与回填给仓库的信息

全部满足后，才算 Bucket 初始化完成：

- [ ] 专用 Bucket 位于华东 2（上海），Standard + ZRS + Private + SSE-OSS；
- [ ] 版本控制开启；
- [ ] 三个标签正确；
- [ ] 未启用备份、跨区复制、静态网站、加速、请求者付费、WORM、实时日志、防盗链；
- [ ] CORS 只有 GET/HEAD；
- [ ] 生命周期不影响 `releases/` 或当前 stable 对象；
- [ ] 账号级公共访问保护经过审计；
- [ ] Bucket 级公共访问仅开放三个 GetObject 前缀；
- [ ] 匿名 GET 200，List/PUT/DELETE 403，HTTP 被拒绝；
- [ ] OIDC Provider、Role、信任策略和最小 OSS 策略正确；
- [ ] GitHub `production-release` Environment 有审核；
- [ ] 流量与费用告警已生效；
- [ ] 首次 Promotion 与公网回读通过；
- [ ] 两条大陆网络下载与三个桌面平台更新通过。

最终只把以下非敏感值回填给 Madora 仓库维护者，不发送账号密码、Token、AccessKey、Cookie 或证书：

```text
MADORA_OSS_REGION=cn-shanghai
MADORA_OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
MADORA_OSS_BUCKET=<实际名称>
MADORA_OSS_PUBLIC_BASE_URL=https://<实际名称>.oss-cn-shanghai.aliyuncs.com
MADORA_OSS_ROLE_ARN=<RAM Role ARN>
MADORA_OSS_OIDC_PROVIDER_ARN=<OIDC Provider ARN>
```

## 官方参考

- [创建 OSS Bucket](https://help.aliyun.com/en/oss/user-guide/create-a-bucket-4)
- [阻止公共访问](https://help.aliyun.com/en/oss/user-guide/block-public-access)
- [OSS Bucket Policy](https://help.aliyun.com/en/oss/user-guide/oss-bucket-policy/)
- [强制 HTTPS](https://help.aliyun.com/en/oss/how-do-i-configure-an-https-request-and-an-ssl-certificate)
- [ossutil 2.0](https://help.aliyun.com/en/oss/developer-reference/ossutil-overview/)
- [管理 RAM OIDC Provider](https://help.aliyun.com/en/ram/manage-an-oidc-idp)
- [创建可信 OIDC Provider 的 RAM Role](https://help.aliyun.com/en/ram/user-guide/create-a-ram-role-for-a-trusted-idp)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [Tauri Updater](https://v2.tauri.app/plugin/updater/)

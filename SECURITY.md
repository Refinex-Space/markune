# 安全策略

## 支持范围

Markune 当前只为 [最新正式 Release](https://github.com/Refinex-Space/markune/releases/latest) 提供安全修复。旧版本用户应先升级到最新版本再确认问题是否仍然存在。

## 报告漏洞

仓库启用 GitHub Private Vulnerability Reporting 后，请通过 **Security → Report a vulnerability** 私密提交：

https://github.com/Refinex-Space/markune/security/advisories/new

若该入口暂不可用，请先创建一个不含漏洞细节的普通 Issue，仅请求维护者建立私密联系渠道；在私密渠道建立前不要公开复现方式、利用代码或敏感数据。

报告应尽量包含受影响版本、平台、复现条件、预期影响和最小验证材料。请勿包含真实用户文档、密钥、Token、Cookie、证书或其他不必要的敏感数据。

在维护者完成评估并提供修复或缓解措施前，请勿公开漏洞细节。一般产品缺陷和功能建议请使用 Issue 模板，不要通过安全渠道提交。

## 安全边界

- 只从本仓库 GitHub Releases 获取安装包与 `latest.json`。
- 自动更新必须通过 Tauri updater 签名校验，不能通过关闭校验处理发布故障。
- macOS 与 Windows 系统级代码签名状态以对应 Release Notes 为准；系统签名不能替代 updater 签名。
- Markune 默认处理本地文件。任何文件系统、终端、Git、资源协议和凭据问题都应按潜在本地数据风险评估。

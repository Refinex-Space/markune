---
owner: refinex
updated: 2026-07-13
status: active
referenced_by: AGENTS.md#knowledge-map
---

# API Standards

## Next.js API Routes

- `app/api/link-preview/route.ts` 为 Web/dev 环境解析链接元数据，必须保留 SSRF 防护、重定向验证、超时和响应大小上限。
- `app/api/uploadthing/route.ts` 暴露由 `lib/uploadthing.ts` 配置的 UploadThing handler。
- 不记录用户本地路径、上传 URL 或文档内容，除非任务明确需要经过脱敏的诊断信息。

## Tauri Command Bridge

- 前端调用必须经 `components/workspace/workspace-api.ts`。
- 命令注册位于 `src-tauri/src/lib.rs`。
- Git 命令必须在阻塞任务中执行，不得占用 Tauri 原生主线程；本地命令超时为 60 秒，网络及提交等长操作超时为 180 秒，超时后必须终止对应进程树。Windows 启动 Git 子进程时必须使用无窗口标志，前端命令名称、参数和返回结构保持不变。
- `system_fonts.rs` 仅可返回字体家族名称与推荐元数据，不得暴露字体文件路径或内容。
- 桌面端网络功能应走 Tauri 命令；生产桌面构建使用静态导出，不包含 Next API routes。

## Local Files And Assets

工作区文档 API 必须保留 Markdown 源文件。新资源写入工作区根相对 `.madora/assets/files/...` 路径；预览和清理仍需兼容旧 `madora-asset://{assetId}` 引用。

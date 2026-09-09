'use client';

import * as React from 'react';
import { Copy, FileText, FolderOpen, Blocks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { codexDiagnostics } from './codex-diagnostics';
import {
  codexAppServerClient,
  codexProtocolThreadId,
  type CodexProtocolMessage,
} from './codex-app-server';

interface InstructionFile {
  path: string;
  fingerprint: string;
  bytes: number;
}
interface Inspection {
  root: string;
  files: InstructionFile[];
  hooks: string[];
  errors: string[];
}

export function CodexContextInspector({
  root,
  model,
  mode,
  permission,
  documents,
  skills,
  runtimeVersion,
  threadId,
}: {
  root: string | null;
  model: string;
  mode: string;
  permission: string;
  documents: string[];
  skills: { name: string; path: string }[];
  runtimeVersion?: string | null;
  threadId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [inspection, setInspection] = React.useState<Inspection | null>(null);
  const [copyStatus, setCopyStatus] = React.useState('');
  const [compacted, setCompacted] = React.useState<{
    threadId: string;
    at: number;
  } | null>(null);
  const writing = mode === '写作与研究';
  const current = inspection?.root === root ? inspection : null;
  const uniqueDocuments = [...new Set(documents)];
  const relativePath = (path: string) =>
    root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path;

  React.useEffect(() => {
    const unsubscribe = codexAppServerClient.subscribe(
      (message: CodexProtocolMessage) => {
        const eventThreadId = codexProtocolThreadId(message);
        if (
          eventThreadId &&
          eventThreadId === threadId &&
          (message.method === 'thread/compacted' ||
            (message.method === 'item/completed' &&
              (message.params?.item as { type?: string })?.type ===
                'contextCompaction'))
        )
          setCompacted({ threadId: eventThreadId, at: Date.now() });
      },
    );
    return () => {
      unsubscribe();
    };
  }, [threadId]);

  React.useEffect(() => {
    if (!open || !root) return;
    let active = true;
    void (async () => {
      const [manifest, hookList] = await Promise.allSettled([
        import('@tauri-apps/api/core').then(({ invoke }) =>
          invoke<InstructionFile[]>('read_codex_instruction_manifest', {
            rootPath: root,
          }),
        ),
        codexAppServerClient.request<{
          data: {
            hooks?: { eventName?: string; name?: string; enabled?: boolean }[];
          }[];
        }>('hooks/list', { cwds: [root] }),
      ]);
      if (!active) return;
      setInspection({
        root,
        files: manifest.status === 'fulfilled' ? manifest.value : [],
        hooks:
          hookList.status === 'fulfilled'
            ? (hookList.value.data ?? [])
                .flatMap((entry) => entry.hooks ?? [])
                .map(
                  (hook) =>
                    `${hook.name ?? hook.eventName ?? 'Hook'}${hook.enabled === false ? '（停用）' : ''}`,
                )
            : [],
        errors: [
          ...(manifest.status === 'rejected' ? ['指令文件清单读取失败'] : []),
          ...(hookList.status === 'rejected'
            ? ['Hooks 清单读取失败，配置状态未知']
            : []),
        ],
      });
    })();
    return () => {
      active = false;
    };
  }, [open, root]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        上下文检查
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>上下文与执行范围</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              查看当前任务的权限、文档和指令来源。下列清单不代表模型已完整读取，实际装载与压缩由运行时决定。
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 space-y-5 overflow-y-auto p-5"
            data-testid="context-inspector-scroll"
          >
            <dl className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
              {[
                ['运行时', runtimeVersion ?? '等待连接'],
                ['模型', model || '默认'],
                ['工作模式', mode],
                ['文件权限', permission === ':read-only' ? '只读' : permission],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words text-sm">{value}</dd>
                </div>
              ))}
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">外部工具</dt>
                <dd className="text-sm">
                  {writing
                    ? 'Apps、插件、MCP 与 Hooks 已停用'
                    : '遵循当前任务权限和工具审批'}
                </dd>
              </div>
            </dl>
            <section aria-label="工作区" className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <FolderOpen className="size-4 text-muted-foreground" />
                工作区
              </h3>
              <p className="break-all rounded-md bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed">
                {root ?? '未打开工作区'}
              </p>
            </section>
            <section aria-label="显式文档范围" className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-muted-foreground" />
                显式文档范围{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {uniqueDocuments.length}
                </span>
              </h3>
              {uniqueDocuments.length ? (
                <ul className="divide-y rounded-lg border">
                  {uniqueDocuments.map((path) => (
                    <li
                      key={path}
                      title={path}
                      className="break-all px-3 py-2 text-xs leading-relaxed"
                    >
                      {relativePath(path)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">未附加文档</p>
              )}
            </section>
            <section aria-label="指令文件" className="space-y-2">
              <h3 className="text-sm font-medium">沿工作区路径发现的指令</h3>
              {current?.files.length ? (
                <ul className="divide-y rounded-lg border">
                  {current.files.map((file) => (
                    <li key={file.path} className="space-y-1 px-3 py-2">
                      <p className="break-all text-xs leading-relaxed">
                        {file.path}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {file.bytes} B · SHA256 {file.fingerprint.slice(0, 16)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {root && !current
                    ? '正在读取指令清单…'
                    : current?.errors.some((error) => error.startsWith('指令'))
                      ? '无法确认指令文件'
                      : '未发现指令文件'}
                </p>
              )}
            </section>
            <section aria-label="可用 Skills" className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Blocks className="size-4 text-muted-foreground" />
                可用 Skills{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {skills.length}
                </span>
              </h3>
              <ul className="flex flex-wrap gap-2">
                {skills.length ? (
                  skills.map((skill) => (
                    <li
                      key={skill.path}
                      title={skill.path}
                      className="max-w-full break-all rounded-md border bg-muted/20 px-2 py-1 text-xs"
                    >
                      {skill.name}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">
                    暂无可用 Skills
                  </li>
                )}
              </ul>
            </section>
            <section aria-label="Hooks" className="space-y-2">
              <h3 className="text-sm font-medium">
                Hooks{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {writing ? '本模式已停用' : '配置清单'}
                </span>
              </h3>
              <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {current?.hooks.length ? (
                  current.hooks.map((hook, index) => (
                    <li
                      key={index}
                      className="max-w-full break-all rounded-md bg-muted/40 px-2 py-1"
                    >
                      {hook}
                    </li>
                  ))
                ) : (
                  <li>
                    {root && !current ? '正在读取…' : '未返回 Hooks 配置'}
                  </li>
                )}
              </ul>
            </section>
            <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {compacted && compacted.threadId === threadId
                ? `最近压缩：${new Date(compacted.at).toLocaleTimeString()}。请重新确认长期约束与来源。`
                : '当前任务尚未观察到上下文压缩。'}
            </p>
            {current?.errors.length ? (
              <p role="status" className="text-xs text-destructive">
                {current.errors.join('；')}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            <p role="status" className="min-w-0 text-xs text-muted-foreground">
              {copyStatus || '诊断摘要不包含消息、路径或密钥'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(JSON.stringify(codexDiagnostics(), null, 2))
                  .then(() => setCopyStatus('已复制脱敏诊断摘要'))
                  .catch(() => setCopyStatus('无法写入剪贴板'))
              }
            >
              <Copy className="size-3.5" />
              复制诊断摘要
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

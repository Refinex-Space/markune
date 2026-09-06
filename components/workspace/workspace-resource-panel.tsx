'use client';
import * as React from 'react';
import {
  openPathInFileManager,
  openUrlInDefaultBrowser,
  resolveDocumentAssets,
  resolveWorkspaceAsset,
} from './workspace-api';
import { getWorkspaceAssetIdFromReference } from './workspace-local-assets';
import type {
  KnowledgeDocumentSummary,
  KnowledgeLocation,
} from './workspace-knowledge-types';

type ResourceDocument = Pick<
  KnowledgeDocumentSummary,
  'relativePath' | 'title' | 'resources' | 'links'
>;
interface ResourceRow {
  key: string;
  source: string;
  documents: ResourceDocument[];
}
interface ResourceStatus {
  state: 'available' | 'unavailable' | 'remote';
  path?: string;
  mediaType?: string;
  name?: string;
}

export function resourceGroups(documents: ResourceDocument[]) {
  const rows = new Map<string, ResourceRow>();
  for (const document of documents) {
    const documentLinks = new Set(document.links.map((link) => link.href));
    for (const source of document.resources) {
      if (
        !source ||
        documentLinks.has(source) ||
        /\.mdx?(?:[?#]|$)/i.test(source)
      )
        continue;
      if (
        /^[a-z][a-z0-9+.-]*:/i.test(source) &&
        !/^(https?:|file:|markune-asset:)/i.test(source)
      )
        continue;
      const base = source.split('#')[0];
      let key = base;
      if (
        !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(base) &&
        !getWorkspaceAssetIdFromReference(base)
      ) {
        const parent = document.relativePath.split('/').slice(0, -1);
        let path = base;
        try {
          path = decodeURIComponent(base.split('?')[0]);
        } catch {
          /* Keep invalid references inspectable. author: refinex */
        }
        for (const part of path.split('/')) {
          if (part === '..' && parent.length && parent.at(-1) !== '..')
            parent.pop();
          else if (part && part !== '.') parent.push(part);
        }
        key = `relative:${parent.join('/')}`;
      }
      const row = rows.get(key) ?? { key, source, documents: [] };
      if (
        !row.documents.some(
          (item) => item.relativePath === document.relativePath,
        )
      )
        row.documents.push(document);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

export function WorkspaceResourcePanel({
  rootPath,
  documents,
  onOpen,
  onReadPdf,
}: {
  rootPath: string;
  documents: ResourceDocument[];
  onOpen: (location: KnowledgeLocation) => void;
  onReadPdf?: (source: {
    documentPath: string;
    source: string;
    name: string;
  }) => void;
}) {
  const [statuses, setStatuses] = React.useState<
    Record<string, ResourceStatus>
  >({});
  const [query, setQuery] = React.useState('');
  const [onlyIssues, setOnlyIssues] = React.useState(false);
  const [limit, setLimit] = React.useState(100);
  const [check, setCheck] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const rows = React.useMemo(() => resourceGroups(documents), [documents]);
  const visible = rows
    .filter(
      (row) =>
        row.source.toLowerCase().includes(query.toLowerCase()) &&
        (!onlyIssues ||
          statuses[`${rootPath}:${row.key}`]?.state === 'unavailable'),
    )
    .slice(0, limit);
  React.useEffect(() => {
    let active = true;
    let cursor = 0;
    const updates: Record<string, ResourceStatus> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (active && Object.keys(updates).length) {
        const batch = { ...updates };
        Object.keys(updates).forEach((key) => delete updates[key]);
        setStatuses((current) => ({ ...current, ...batch }));
      }
      timer = undefined;
    };
    const inspect = async () => {
      while (active && cursor < rows.length) {
        const row = rows[cursor++];
        const key = `${rootPath}:${row.key}`;
        let status: ResourceStatus;
        if (/^https?:\/\//i.test(row.source)) status = { state: 'remote' };
        else {
          try {
            const source = row.source.split(/[?#]/)[0];
            const id = getWorkspaceAssetIdFromReference(source);
            if (id) {
              const asset = await resolveWorkspaceAsset(rootPath, id);
              status = {
                state: 'available',
                path: asset.absolutePath,
                mediaType: asset.mediaType,
                name: asset.name,
              };
            } else {
              const result = await resolveDocumentAssets(
                rootPath,
                `${rootPath}/${row.documents[0].relativePath}`,
                [row.source],
              );
              status = result[0]?.absolutePath
                ? { state: 'available', path: result[0].absolutePath }
                : { state: 'unavailable' };
            }
          } catch {
            status = { state: 'unavailable' };
          }
        }
        if (active) {
          updates[key] = status;
          timer ??= setTimeout(flush, 100);
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(4, rows.length) }, inspect),
    ).then(flush);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [rootPath, rows, check]);
  async function locate(path: string) {
    try {
      await openPathInFileManager(path);
      setError(null);
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col text-xs"
      data-testid="workspace-resource-panel"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
        <input
          aria-label="搜索附件引用"
          className="h-8 min-w-40 flex-1 rounded-md border border-border/60 bg-background px-2"
          placeholder="搜索附件路径"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(event) => setOnlyIssues(event.target.checked)}
          />
          仅看需检查项
        </label>
        <button
          type="button"
          className="rounded-md border px-2 py-1.5"
          onClick={() => setCheck((value) => value + 1)}
        >
          重新检查
        </button>
      </div>
      <p className="px-3 py-2 text-muted-foreground">
        共 {rows.length}{' '}
        个附件或外部地址。无法解析可能来自文件缺失或目录尚未授权；网络地址不自动下载检查。
      </p>
      {error ? (
        <p role="alert" className="px-3 text-destructive">
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-3">
        {visible.map((row) => {
          const status = statuses[`${rootPath}:${row.key}`];
          const pdf =
            status?.mediaType === 'application/pdf' ||
            /\.pdf(?:[?#]|$)/i.test(row.source);
          return (
            <section
              key={row.key}
              className="space-y-2 border-b border-border/40 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all">
                  {status?.name ?? row.source}
                </span>
                <span
                  className={
                    status?.state === 'unavailable'
                      ? 'text-amber-600'
                      : 'text-muted-foreground'
                  }
                >
                  {!status
                    ? '检查中'
                    : status.state === 'available'
                      ? '可用'
                      : status.state === 'remote'
                        ? '网络地址'
                        : '无法解析'}
                </span>
              </div>
              {status?.path ? (
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
                    title={status.path}
                  >
                    {status.path}
                  </code>
                  <button
                    type="button"
                    onClick={() => void locate(status.path!)}
                  >
                    定位
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(status.path!)
                        .catch((error) => setError(String(error)))
                    }
                  >
                    复制路径
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {pdf && status?.state === 'available' && onReadPdf ? (
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() =>
                      onReadPdf({
                        documentPath: `${rootPath}/${row.documents[0].relativePath}`,
                        source: row.source,
                        name:
                          status?.name ?? row.source.split('/').pop() ?? 'PDF',
                      })
                    }
                  >
                    阅读并摘录 PDF
                  </button>
                ) : null}
                {status?.state === 'remote' ? (
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() =>
                      void openUrlInDefaultBrowser(row.source).catch((error) =>
                        setError(String(error)),
                      )
                    }
                  >
                    打开网址
                  </button>
                ) : null}
              </div>
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  被 {row.documents.length} 篇笔记引用
                </summary>
                <div className="mt-1 space-y-1">
                  {row.documents.map((document) => (
                    <button
                      key={document.relativePath}
                      type="button"
                      className="block max-w-full truncate rounded px-2 py-1 text-left hover:bg-accent"
                      onClick={() =>
                        onOpen({ relativePath: document.relativePath })
                      }
                    >
                      {document.title} · {document.relativePath}
                    </button>
                  ))}
                </div>
              </details>
            </section>
          );
        })}
        {!visible.length ? (
          <p className="p-6 text-center text-muted-foreground">
            当前没有匹配的附件引用。
          </p>
        ) : null}
        {rows.length > limit ? (
          <button
            type="button"
            className="w-full py-3 text-muted-foreground"
            onClick={() => setLimit((limit) => limit + 100)}
          >
            显示更多
          </button>
        ) : null}
      </div>
    </div>
  );
}

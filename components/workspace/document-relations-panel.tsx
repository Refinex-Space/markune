'use client';
import * as React from 'react';
import { findWorkspaceMentions } from './workspace-api';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type { KnowledgeLocation } from './workspace-knowledge-types';

export function DocumentRelationsPanel({
  path,
  rootPath,
  knowledge,
  onOpen,
}: {
  path: string;
  rootPath: string;
  knowledge: WorkspaceKnowledge;
  onOpen: (location: KnowledgeLocation) => void;
}) {
  const [tab, setTab] = React.useState<'incoming' | 'outgoing' | 'mentions'>(
    'incoming',
  );
  const [mentions, setMentions] = React.useState<
    Array<{ relativePath: string; line: number; context: string }>
  >([]);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(100);
  const current = knowledge.documents.find(
    (document) => document.relativePath === path,
  );
  const incoming = React.useMemo(
    () =>
      knowledge.documents.flatMap((document) =>
        document.links
          .filter(
            (link) =>
              link.targetPath === path && document.relativePath !== path,
          )
          .map((link) => ({ document, link })),
      ),
    [knowledge.documents, path],
  );
  const outgoing =
    current?.links.filter((link) => link.targetPath !== path) ?? [];
  const request = React.useRef(0);

  async function findMentions() {
    if (!current) return;
    const id = ++request.current;
    setTab('mentions');
    setSearching(true);
    setError(null);
    try {
      const names = [
        current.name.replace(/\.mdx?$/i, ''),
        ...(Array.isArray(current.properties.aliases)
          ? current.properties.aliases.filter(
              (value): value is string => typeof value === 'string',
            )
          : []),
      ].slice(0, 16);
      const results = await Promise.all(
        names.map((name) => knowledge.search(JSON.stringify(name), 64)),
      );
      const candidates = [
        ...new Set(
          results
            .flat()
            .filter((result) => result.document.kind !== 'drawing')
            .map((result) => result.document.relativePath),
        ),
      ].slice(0, 64);
      const mentions = await findWorkspaceMentions(rootPath, path, candidates);
      if (request.current === id) setMentions(mentions);
    } catch (error) {
      if (request.current === id) setError(String(error));
    } finally {
      if (request.current === id) setSearching(false);
    }
  }
  React.useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  return (
    <div className="space-y-3 text-xs">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {(['incoming', 'outgoing', 'mentions'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`flex-1 rounded px-2 py-1.5 ${tab === value ? 'bg-background' : 'text-muted-foreground'}`}
            onClick={() =>
              value === 'mentions' ? void findMentions() : setTab(value)
            }
          >
            {value === 'incoming'
              ? `入链 ${incoming.length}`
              : value === 'outgoing'
                ? `出链 ${outgoing.length}`
                : '未链接提及'}
          </button>
        ))}
      </div>
      {knowledge.status === 'indexing' ? (
        <p role="status" className="text-muted-foreground">
          正在更新关联索引…
        </p>
      ) : null}
      {knowledge.error || error ? (
        <p role="alert" className="text-destructive">
          {error ?? knowledge.error}
        </p>
      ) : null}
      {tab === 'incoming'
        ? incoming.slice(0, limit).map(({ document, link }, index) => (
            <button
              key={`${document.relativePath}:${index}`}
              type="button"
              className="w-full rounded-md border border-border/50 p-2 text-left hover:bg-accent"
              onClick={() =>
                onOpen({ relativePath: document.relativePath, line: link.line })
              }
            >
              <span className="block truncate">{document.title}</span>
              <span className="mt-1 block break-words text-muted-foreground">
                {link.context}
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                第 {link.line} 行 · {document.relativePath}
              </span>
            </button>
          ))
        : null}
      {tab === 'incoming' && !incoming.length ? (
        <p className="text-muted-foreground">还没有其他笔记引用当前文档。</p>
      ) : null}
      {tab === 'outgoing'
        ? outgoing.slice(0, limit).map((link, index) => (
            <button
              key={index}
              type="button"
              className="w-full rounded-md border border-border/50 p-2 text-left hover:bg-accent"
              onClick={() =>
                onOpen(
                  link.targetPath
                    ? {
                        relativePath: link.targetPath,
                        hash: link.href.includes('#')
                          ? link.href.slice(link.href.indexOf('#') + 1)
                          : null,
                      }
                    : { relativePath: path, line: link.line },
                )
              }
            >
              <span className="block truncate">
                {link.targetPath ?? `未解析：${link.href}`}
              </span>
              <span className="mt-1 block text-muted-foreground">
                {link.context}
              </span>
            </button>
          ))
        : null}
      {tab === 'outgoing' && !outgoing.length ? (
        <p className="text-muted-foreground">
          当前文档还没有指向其他笔记的引用。
        </p>
      ) : null}
      {tab !== 'mentions' &&
      (tab === 'incoming' ? incoming.length : outgoing.length) > limit ? (
        <button
          type="button"
          className="w-full rounded border py-2 text-muted-foreground"
          onClick={() => setLimit((limit) => limit + 100)}
        >
          显示更多
        </button>
      ) : null}
      {tab === 'mentions' ? (
        <>
          <p className="text-muted-foreground">
            按文件名和别名查找正文中的提及，排除代码、注释和已有链接。候选提及不会自动建立关系。
          </p>
          {searching ? (
            <p role="status">正在检查候选笔记…</p>
          ) : mentions.length ? (
            mentions.map((mention, index) => (
              <button
                key={index}
                type="button"
                className="w-full rounded-md border border-border/50 p-2 text-left hover:bg-accent"
                onClick={() => onOpen(mention)}
              >
                <span className="block truncate">{mention.relativePath}</span>
                <span className="mt-1 block break-words text-muted-foreground">
                  {mention.context}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  第 {mention.line} 行
                </span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground">
              本次候选中未发现未链接提及。
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

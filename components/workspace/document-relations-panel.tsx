'use client';

import * as React from 'react';
import { Tabs } from 'radix-ui';
import { ChevronRight, FileText, Link2Off } from 'lucide-react';
import { findWorkspaceMentions } from './workspace-api';
import {
  relationDocumentName,
  relationExcerpt,
} from './document-relation-presentation';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type { KnowledgeLocation } from './workspace-knowledge-types';
import './document-relations-panel.css';

type RelationTab = 'incoming' | 'outgoing' | 'mentions';
type Mention = { relativePath: string; line: number; context: string };
interface RelationsProps {
  path: string;
  rootPath: string;
  knowledge: WorkspaceKnowledge;
  onOpen: (location: KnowledgeLocation) => void;
}
interface RelationEntry {
  key: string;
  title: string;
  context: string;
  detail: string;
  tooltip: string;
  unresolved?: boolean;
  location: KnowledgeLocation;
}

export function DocumentRelationsPanel(props: RelationsProps) {
  return (
    <RelationsContent key={`${props.rootPath}:${props.path}`} {...props} />
  );
}

function RelationsContent({
  path,
  rootPath,
  knowledge,
  onOpen,
}: RelationsProps) {
  const [tab, setTab] = React.useState<RelationTab>('incoming');
  const [mentions, setMentions] = React.useState<Mention[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [limit, setLimit] = React.useState(100);
  const request = React.useRef(0);
  const pending = React.useRef(false);
  const documents = React.useMemo(
    () =>
      new Map(
        knowledge.documents.map((document) => [
          document.relativePath,
          document,
        ]),
      ),
    [knowledge.documents],
  );
  const titles = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents.values()) {
      const title =
        document.title || relationDocumentName(document.relativePath);
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    return counts;
  }, [documents]);
  const current = documents.get(path);
  const incoming = React.useMemo(
    () =>
      knowledge.documents.flatMap((document) =>
        document.relativePath === path
          ? []
          : document.links
              .filter((link) => link.targetPath === path)
              .map((link) => ({ document, link })),
      ),
    [knowledge.documents, path],
  );
  const outgoing =
    current?.links.filter((link) => link.targetPath !== path) ?? [];

  React.useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  async function findMentions() {
    if (!current || pending.current) return;
    const id = ++request.current;
    pending.current = true;
    setSearching(true);
    setSearched(false);
    setMentions([]);
    setError(false);
    try {
      const names = [
        ...new Set(
          [
            current.name.replace(/\.mdx?$/i, ''),
            ...(Array.isArray(current.properties.aliases)
              ? current.properties.aliases.filter(
                  (value): value is string => typeof value === 'string',
                )
              : []),
          ].filter((name) => name.trim()),
        ),
      ].slice(0, 16);
      const results = await Promise.all(
        names.map((name) => knowledge.search(JSON.stringify(name), 64)),
      );
      if (request.current !== id) return;
      const candidates = [
        ...new Set(
          results
            .flat()
            .filter(
              (result) =>
                result.document.kind !== 'drawing' &&
                result.document.relativePath !== path,
            )
            .map((result) => result.document.relativePath),
        ),
      ].slice(0, 64);
      const next = candidates.length
        ? await findWorkspaceMentions(rootPath, path, candidates)
        : [];
      if (request.current === id) {
        setMentions(next);
        setSearched(true);
      }
    } catch {
      if (request.current === id) setError(true);
    } finally {
      if (request.current === id) {
        pending.current = false;
        setSearching(false);
      }
    }
  }

  function entry(
    relativePath: string,
    context: string,
    location: KnowledgeLocation,
    key: string,
  ): RelationEntry {
    const title =
      documents.get(relativePath)?.title || relationDocumentName(relativePath);
    const folder =
      (titles.get(title) ?? 0) > 1
        ? relativePath.split('/').slice(0, -1).at(-1) || '工作区'
        : '';
    return {
      key,
      title,
      context,
      location,
      detail: [location.line ? `第 ${location.line} 行` : '', folder]
        .filter(Boolean)
        .join(' · '),
      tooltip: `${title}\n${relativePath}`,
    };
  }
  const count =
    tab === 'incoming'
      ? incoming.length
      : tab === 'outgoing'
        ? outgoing.length
        : mentions.length;
  const entries: RelationEntry[] =
    tab === 'incoming'
      ? incoming
          .slice(0, limit)
          .map(({ document, link }, index) =>
            entry(
              document.relativePath,
              link.context,
              { relativePath: document.relativePath, line: link.line },
              `${document.relativePath}:${index}`,
            ),
          )
      : tab === 'outgoing'
        ? outgoing.slice(0, limit).map((link, index) => {
            const location = link.targetPath
              ? {
                  relativePath: link.targetPath,
                  hash: link.href.includes('#')
                    ? link.href.slice(link.href.indexOf('#') + 1)
                    : null,
                }
              : { relativePath: path, line: link.line };
            return {
              ...entry(
                link.targetPath ?? link.href,
                link.context,
                location,
                String(index),
              ),
              unresolved: !link.targetPath,
            };
          })
        : mentions
            .slice(0, limit)
            .map((mention, index) =>
              entry(
                mention.relativePath,
                mention.context,
                { relativePath: mention.relativePath, line: mention.line },
                `${mention.relativePath}:${index}`,
              ),
            );

  const empty =
    tab === 'incoming'
      ? '暂无笔记引用此文档'
      : tab === 'outgoing'
        ? '暂无指向其他笔记的链接'
        : '未发现未链接提及';
  const tabs = [
    { value: 'incoming', label: '入链', count: incoming.length },
    { value: 'outgoing', label: '出链', count: outgoing.length },
    {
      value: 'mentions',
      label: '未链接提及',
      count: searched && !searching ? mentions.length : undefined,
    },
  ] as const;

  return (
    <Tabs.Root
      className="relations-panel"
      value={tab}
      activationMode="manual"
      onValueChange={(value) => {
        setTab(value as RelationTab);
        setLimit(100);
        if (value === 'mentions') void findMentions();
      }}
    >
      <div className="relations-toolbar">
        <Tabs.List className="relations-tabs" aria-label="文档关联类型">
          {tabs.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="relations-tab"
              aria-label={[item.label, item.count]
                .filter((value) => value !== undefined)
                .join(' ')}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className="relations-count">{item.count}</span>
              ) : null}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      <Tabs.Content
        value={tab}
        className="relations-content"
        aria-busy={
          tab === 'mentions' ? searching : knowledge.status === 'indexing'
        }
      >
        {knowledge.status === 'indexing' ? (
          <p className="relations-status" role="status">
            正在更新关联…
          </p>
        ) : null}
        {knowledge.error ? (
          <p className="relations-status" role="alert">
            关联暂时无法更新
          </p>
        ) : null}
        {tab === 'mentions' && (searching || error || !current) ? (
          <p className="relations-status" role={error ? 'alert' : 'status'}>
            {searching
              ? '正在查找提及…'
              : error
                ? '提及查找失败'
                : '暂时无法查找提及'}
            {error && !searching ? (
              <button
                type="button"
                className="relations-retry"
                aria-label="重试查找提及"
                onClick={() => void findMentions()}
              >
                重试
              </button>
            ) : null}
          </p>
        ) : null}
        {tab !== 'mentions' || !searching ? (
          <ul className="relations-list">
            {entries.map((item) => (
              <RelationItem key={item.key} item={item} onOpen={onOpen} />
            ))}
          </ul>
        ) : null}
        {!entries.length &&
        !(tab === 'mentions' && (searching || error || !searched)) &&
        knowledge.status !== 'indexing' &&
        !knowledge.error ? (
          <div className="relations-empty">
            <Link2Off size={22} strokeWidth={1.5} aria-hidden="true" />
            <p>{empty}</p>
          </div>
        ) : null}
        {count > limit && !(tab === 'mentions' && searching) ? (
          <button
            type="button"
            className="relations-more"
            onClick={() => setLimit((value) => value + 100)}
          >
            显示更多
          </button>
        ) : null}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function RelationItem({
  item,
  onOpen,
}: {
  item: RelationEntry;
  onOpen: RelationsProps['onOpen'];
}) {
  const excerpt = React.useMemo(
    () => relationExcerpt(item.context),
    [item.context],
  );
  return (
    <li>
      <button
        type="button"
        className="relation-item"
        title={item.tooltip}
        aria-label={[
          item.title,
          excerpt !== item.title ? excerpt : '',
          item.unresolved ? '未解析引用' : '',
          item.detail,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onOpen(item.location)}
      >
        <FileText
          className="relation-icon"
          size={17}
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <span className="relation-copy">
          <span className="relation-title">{item.title}</span>
          {excerpt && excerpt !== item.title ? (
            <span className="relation-excerpt">{excerpt}</span>
          ) : null}
          {item.unresolved ? (
            <span className="relation-detail relation-unresolved">
              <Link2Off size={12} aria-hidden="true" />
              未解析引用
            </span>
          ) : null}
          {item.detail ? (
            <span className="relation-detail">{item.detail}</span>
          ) : null}
        </span>
        <ChevronRight
          className="relation-chevron"
          size={14}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

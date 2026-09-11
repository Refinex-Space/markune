'use client';
import * as React from 'react';
import { RefreshCw, Plus, Save, Columns3, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';
import {
  joinFrontmatterSource,
  patchFrontmatterSource,
  type MetadataValue,
} from '@/components/editor/markdown-frontmatter-source';
import {
  readMarkdownDocument,
  readWorkspaceViews,
  saveMarkdownDocument,
  saveWorkspaceViews,
  setWorkspaceTaskChecked,
  type SavedWorkspaceView,
} from './workspace-api';
import { matchesWorkspaceQuery, parseWorkspaceQuery } from './workspace-query';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type {
  KnowledgeDocumentSummary,
  KnowledgeLocation,
} from './workspace-knowledge-types';

export interface KnowledgeViewsProps {
  knowledge: WorkspaceKnowledge;
  rootPath: string;
  sidebarHeaderOffset?: number;
  onOpen: (location: KnowledgeLocation) => void;
  onRefresh: () => Promise<unknown> | void;
  isReadOnly: (path: string) => boolean;
  onCreateTemplate?: () => void;
  resources?: React.ReactNode;
  research?: React.ReactNode;
}

const DEFAULT_COLUMNS = ['title', 'path', 'modifiedAt', 'prop:tags'];
const SYSTEM_PROPERTIES = new Set([
  'title',
  'createdAt',
  'updatedAt',
  'refinexDialect',
]);
const label = (field: string) =>
  ({
    title: '标题',
    path: '路径',
    modifiedAt: '修改时间',
    links: '出链',
    tasks: '待办',
    'prop:tags': '标签',
    'prop:title': '元数据标题',
    'prop:status': '状态',
    'prop:createdAt': '创建时间',
    'prop:updatedAt': '更新时间',
  })[field] ?? field.replace(/^prop:/, '');
function valueOf(document: KnowledgeDocumentSummary, field: string): unknown {
  if (field === 'title') return document.title;
  if (field === 'path') return document.relativePath;
  if (field === 'modifiedAt') return document.modifiedAt;
  if (field === 'links')
    return new Set(
      document.links.map((link) => link.targetPath ?? link.unresolved),
    ).size;
  if (field === 'tasks')
    return document.tasks.filter((task) => !task.checked).length;
  const key = field.replace(/^prop:/, '');
  return Object.hasOwn(document.properties, key)
    ? document.properties[key]
    : null;
}
function display(value: unknown): string {
  return value === null || value === undefined
    ? ''
    : Array.isArray(value)
      ? value.map(display).join(' · ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
}

export function WorkspaceKnowledgeViews({
  knowledge,
  rootPath,
  sidebarHeaderOffset,
  onOpen,
  onRefresh,
  isReadOnly,
  onCreateTemplate,
  resources,
  research,
}: KnowledgeViewsProps) {
  const [mode, setMode] = React.useState('documents');
  const [query, setQuery] = React.useState('');
  const [columns, setColumns] = React.useState(DEFAULT_COLUMNS);
  const [sortBy, setSortBy] = React.useState('modifiedAt');
  const [descending, setDescending] = React.useState(true);
  const [groupBy, setGroupBy] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{
    views: SavedWorkspaceView[];
    fingerprint: string;
  }>({ views: [], fingerprint: '' });
  const [selected, setSelected] = React.useState('');
  const [viewName, setViewName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(100);
  const [taskState, setTaskState] = React.useState('open');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<{
    path: string;
    key: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'list';
    original: string;
    modifiedAt: number;
  } | null>(null);
  React.useEffect(() => {
    let active = true;
    void readWorkspaceViews(rootPath)
      .then((value) => {
        if (active) setSaved(value);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [rootPath]);
  const availableColumns = React.useMemo(
    () =>
      [
        'title',
        'path',
        'modifiedAt',
        'links',
        'tasks',
        ...new Set(
          knowledge.documents.flatMap((document) =>
            Object.keys(document.properties).map((key) => `prop:${key}`),
          ),
        ),
      ].slice(0, 80),
    [knowledge.documents],
  );
  const parsedQuery = React.useMemo(() => parseWorkspaceQuery(query), [query]);
  const documents = React.useMemo(
    () =>
      knowledge.documents
        .filter((document) => {
          const text =
            `${document.title}\n${document.relativePath}`.toLowerCase();
          return (
            matchesWorkspaceQuery({ ...document, content: '' }, parsedQuery) &&
            parsedQuery.text
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every((part) => text.includes(part))
          );
        })
        .sort((left, right) => {
          const a = valueOf(left, sortBy);
          const b = valueOf(right, sortBy);
          return (
            (typeof a === 'number' && typeof b === 'number'
              ? a - b
              : display(a).localeCompare(display(b), undefined, {
                  numeric: true,
                })) * (descending ? -1 : 1)
          );
        }),
    [knowledge.documents, parsedQuery, sortBy, descending],
  );
  const groups = React.useMemo(() => {
    const groups = new Map<string, KnowledgeDocumentSummary[]>();
    for (const document of documents.slice(0, limit)) {
      const key = groupBy
        ? display(valueOf(document, groupBy)) || '未设置'
        : '';
      const rows = groups.get(key) ?? [];
      rows.push(document);
      groups.set(key, rows);
    }
    return [...groups];
  }, [documents, groupBy, limit]);
  const tasks = documents
    .flatMap((document) => document.tasks.map((task) => ({ document, task })))
    .filter(
      ({ task }) =>
        taskState === 'all' || task.checked === (taskState === 'done'),
    );

  function apply(view: SavedWorkspaceView) {
    setSelected(view.id);
    setQuery(view.query);
    setColumns(view.columns);
    setSortBy(view.sortBy);
    setDescending(view.descending);
    setGroupBy(view.groupBy);
    setLimit(100);
  }
  async function saveView() {
    if (!viewName?.trim()) return;
    setBusy('view');
    setError(null);
    try {
      const view: SavedWorkspaceView = {
        id: selected || crypto.randomUUID(),
        name: viewName.trim(),
        query,
        columns,
        sortBy,
        descending,
        groupBy,
      };
      const views = [
        ...saved.views.filter((item) => item.id !== view.id),
        view,
      ];
      const next = await saveWorkspaceViews(rootPath, views, saved.fingerprint);
      setSaved(next);
      setSelected(view.id);
      setViewName(null);
      setError(null);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(null);
    }
  }
  async function removeView() {
    setBusy('view');
    try {
      setSaved(
        await saveWorkspaceViews(
          rootPath,
          saved.views.filter((view) => view.id !== selected),
          saved.fingerprint,
        ),
      );
      setSelected('');
      setError(null);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(null);
    }
  }
  async function editProperty(
    document: KnowledgeDocumentSummary,
    field: string,
  ) {
    const key = field.slice(5);
    if (SYSTEM_PROPERTIES.has(key) || isReadOnly(document.relativePath)) return;
    try {
      setError(null);
      const loaded = await readMarkdownDocument(
        rootPath,
        `${rootPath}/${document.relativePath}`,
      );
      const parsed = parseFrontmatter(loaded.content);
      const value = parsed.properties[key];
      if (parsed.errors.length) throw new Error(parsed.errors[0]);
      if (
        value &&
        typeof value === 'object' &&
        (!Array.isArray(value) ||
          value.some((item) => typeof item !== 'string'))
      ) {
        onOpen({ relativePath: document.relativePath, line: 1 });
        return;
      }
      const typeValue =
        value ??
        knowledge.documents.find(
          (document) => document.properties[key] !== undefined,
        )?.properties[key];
      const type = Array.isArray(typeValue)
        ? 'list'
        : typeof typeValue === 'boolean'
          ? 'boolean'
          : typeof typeValue === 'number'
            ? 'number'
            : 'string';
      setEdit({
        path: document.relativePath,
        key,
        value: Array.isArray(value)
          ? value.join('\n')
          : type === 'boolean'
            ? String(value ?? false)
            : display(value),
        type,
        original: loaded.content,
        modifiedAt: loaded.modifiedAt,
      });
    } catch (error) {
      setError(String(error));
    }
  }
  async function saveProperty() {
    if (!edit) return;
    setBusy('property');
    try {
      let parsed = parseFrontmatter(edit.original);
      if (!parsed.source)
        parsed = parseFrontmatter(
          edit.original.startsWith('\ufeff')
            ? '\ufeff---\n---\n' + edit.original.slice(1)
            : '---\n---\n' + edit.original,
        );
      if (!parsed.source) throw new Error('无法添加元数据字段');
      const value: MetadataValue =
        edit.type === 'list'
          ? edit.value
              .split(/\r?\n/)
              .map((value) => value.trim())
              .filter(Boolean)
          : edit.type === 'boolean'
            ? edit.value === 'true'
            : edit.type === 'number'
              ? edit.value.trim()
                ? Number(edit.value)
                : NaN
              : edit.value;
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('请输入有效数字');
      const block = patchFrontmatterSource(parsed.source, {
        [edit.key]: value,
      });
      await saveMarkdownDocument(
        rootPath,
        `${rootPath}/${edit.path}`,
        joinFrontmatterSource(parsed.source, block, parsed.body),
        edit.modifiedAt,
        edit.original,
      );
      setEdit(null);
      await onRefresh();
      await knowledge.refresh();
      setError(null);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(null);
    }
  }
  async function toggleTask(
    document: KnowledgeDocumentSummary,
    offset: number,
    checked: boolean,
  ) {
    setBusy(`${document.relativePath}:${offset}`);
    try {
      await setWorkspaceTaskChecked(
        rootPath,
        `${rootPath}/${document.relativePath}`,
        offset,
        document.fingerprint,
        checked,
      );
      await onRefresh();
      await knowledge.refresh();
      setError(null);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background text-xs"
      data-testid="workspace-knowledge-views"
    >
      <header
        className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border/50 px-3"
        style={
          sidebarHeaderOffset === undefined
            ? undefined
            : { marginTop: sidebarHeaderOffset }
        }
      >
        <span>视图</span>
        <div className="flex gap-1">
          {[
            ['documents', '文档'],
            ['tasks', '任务'],
            ...(resources ? [['resources', '附件']] : []),
            ...(research ? [['research', '研究']] : []),
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              className={`rounded-md px-2 py-1.5 ${mode === id ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
              onClick={() => {
                setMode(id);
                setLimit(100);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="ml-auto text-muted-foreground">
          {knowledge.status === 'indexing'
            ? '正在更新索引…'
            : `${knowledge.documents.length} 篇笔记`}
        </span>
        {onCreateTemplate ? (
          <button
            aria-label="从模板新建"
            type="button"
            className="rounded p-1.5 hover:bg-accent"
            onClick={onCreateTemplate}
          >
            <Plus size={15} />
          </button>
        ) : null}
        <button
          aria-label="刷新视图索引"
          type="button"
          className="rounded p-1.5 hover:bg-accent"
          onClick={() => void knowledge.refresh(true)}
        >
          <RefreshCw
            size={14}
            className={knowledge.status === 'indexing' ? 'animate-spin' : ''}
          />
        </button>
      </header>
      {error || knowledge.error ? (
        <p
          role="alert"
          className="border-b border-border/50 px-3 py-2 text-destructive"
        >
          {error ?? knowledge.error}
        </p>
      ) : null}
      {knowledge.warnings.length ? (
        <details className="px-3 py-2 text-muted-foreground">
          <summary>部分笔记未完整索引</summary>
          {knowledge.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      ) : null}
      {mode === 'resources' ? (
        resources
      ) : mode === 'research' ? (
        research
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 p-3">
            <input
              aria-label="筛选视图"
              className="h-8 min-w-48 flex-1 rounded-md border border-border/60 bg-background px-2"
              placeholder="名称、路径，或 tag: / prop: / after:"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(100);
              }}
            />
            <select
              aria-label="已保存视图"
              className="h-8 max-w-40 rounded-md border border-border/60 bg-background px-2"
              value={selected}
              onChange={(event) => {
                const view = saved.views.find(
                  (view) => view.id === event.target.value,
                );
                if (view) apply(view);
                else setSelected('');
              }}
            >
              <option value="">临时视图</option>
              {saved.views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <button
              aria-label="保存当前视图"
              type="button"
              className="rounded-md border border-border/60 p-2"
              onClick={() => {
                setError(null);
                setViewName(
                  saved.views.find((view) => view.id === selected)?.name ?? '',
                );
              }}
            >
              <Save size={14} />
            </button>
            {selected ? (
              <button
                aria-label="删除当前保存视图"
                type="button"
                disabled={busy !== null}
                className="rounded-md border border-border/60 p-2"
                onClick={() => void removeView()}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
            {mode === 'documents' ? (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      aria-label="选择视图列"
                      type="button"
                      className="rounded-md border border-border/60 p-2"
                    >
                      <Columns3 size={14} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="max-h-80 w-56 overflow-auto p-2">
                    {availableColumns.map((field) => (
                      <label
                        key={field}
                        className="flex gap-2 px-2 py-1.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={columns.includes(field)}
                          disabled={
                            columns.length === 1 && columns.includes(field)
                          }
                          onChange={(event) =>
                            setColumns((columns) =>
                              event.target.checked
                                ? [...columns, field]
                                : columns.filter((column) => column !== field),
                            )
                          }
                        />
                        {label(field)}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
                <select
                  aria-label="视图分组"
                  className="h-8 rounded-md border border-border/60 bg-background px-2"
                  value={groupBy ?? ''}
                  onChange={(event) => setGroupBy(event.target.value || null)}
                >
                  <option value="">不分组</option>
                  {availableColumns.map((field) => (
                    <option key={field} value={field}>
                      按{label(field)}分组
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <select
                aria-label="任务状态"
                className="h-8 rounded-md border border-border/60 bg-background px-2"
                value={taskState}
                onChange={(event) => setTaskState(event.target.value)}
              >
                <option value="open">未完成</option>
                <option value="done">已完成</option>
                <option value="all">全部任务</option>
              </select>
            )}
          </div>
          {parsedQuery.error ? (
            <p className="p-3 text-destructive">{parsedQuery.error}</p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            {mode === 'documents'
              ? groups.map(([group, rows]) => (
                  <section key={group}>
                    {groupBy ? (
                      <h2 className="sticky top-0 bg-muted px-3 py-2 text-xs font-normal">
                        {group}
                      </h2>
                    ) : null}
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          {columns.map((field) => (
                            <th
                              key={field}
                              className="border-b border-border/50 px-3 py-2 font-normal text-muted-foreground"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortBy === field)
                                    setDescending((value) => !value);
                                  else {
                                    setSortBy(field);
                                    setDescending(false);
                                  }
                                }}
                              >
                                {label(field)}
                                {sortBy === field
                                  ? descending
                                    ? ' ↓'
                                    : ' ↑'
                                  : ''}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((document) => (
                          <tr
                            key={document.relativePath}
                            className="border-b border-border/30 hover:bg-accent/40"
                          >
                            {columns.map((field) => (
                              <td
                                key={field}
                                className="max-w-72 truncate px-3 py-2"
                              >
                                <button
                                  type="button"
                                  className="max-w-full truncate text-left"
                                  onClick={() =>
                                    field.startsWith('prop:')
                                      ? void editProperty(document, field)
                                      : onOpen({
                                          relativePath: document.relativePath,
                                        })
                                  }
                                >
                                  {field === 'modifiedAt'
                                    ? new Date(
                                        document.modifiedAt,
                                      ).toLocaleString()
                                    : display(valueOf(document, field)) || '—'}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))
              : tasks.slice(0, limit).map(({ document, task }) => (
                  <div
                    key={`${document.relativePath}:${task.offset}`}
                    className="flex items-start gap-3 border-b border-border/40 px-4 py-3"
                  >
                    <input
                      aria-label={`完成任务 ${task.text}`}
                      type="checkbox"
                      checked={task.checked}
                      disabled={
                        busy !== null || isReadOnly(document.relativePath)
                      }
                      onChange={(event) =>
                        void toggleTask(
                          document,
                          task.offset,
                          event.target.checked,
                        )
                      }
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        onOpen({
                          relativePath: document.relativePath,
                          line: task.line,
                        })
                      }
                    >
                      <span
                        className={
                          task.checked
                            ? 'text-muted-foreground line-through'
                            : ''
                        }
                      >
                        {task.text}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {document.title} · 第 {task.line} 行
                      </span>
                    </button>
                  </div>
                ))}
            {(mode === 'documents' ? documents.length : tasks.length) === 0 ? (
              <p className="p-8 text-center text-muted-foreground">
                当前条件下没有匹配内容。
              </p>
            ) : null}
            {(mode === 'documents' ? documents.length : tasks.length) >
            limit ? (
              <button
                type="button"
                className="w-full p-3 text-muted-foreground hover:bg-accent"
                onClick={() => setLimit((limit) => limit + 100)}
              >
                显示更多
              </button>
            ) : null}
          </div>
        </>
      )}
      <Dialog
        open={viewName !== null}
        onOpenChange={(open) => {
          if (!open) setViewName(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>保存视图</DialogTitle>
            <DialogDescription>
              保存筛选、分组、排序和列设置。删除保存视图不会删除笔记。
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="视图名称"
            className="rounded-md border p-2 text-sm"
            value={viewName ?? ''}
            onChange={(event) => setViewName(event.target.value)}
          />
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            disabled={busy !== null || !viewName?.trim()}
            onClick={() => void saveView()}
          >
            保存
          </button>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑属性：{edit?.key}</DialogTitle>
            <DialogDescription>
              保存时会检查文档是否已被外部修改。
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {edit?.type === 'list'
              ? '每行一个值。'
              : '只更新此字段，其他字段保持原样。'}
          </p>
          {edit?.type === 'boolean' ? (
            <select
              aria-label="属性值"
              value={edit.value}
              onChange={(event) =>
                setEdit({ ...edit, value: event.target.value })
              }
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : (
            <textarea
              aria-label="属性值"
              className="min-h-20 rounded-md border bg-background p-2 text-sm"
              value={edit?.value ?? ''}
              onChange={(event) =>
                setEdit((edit) =>
                  edit ? { ...edit, value: event.target.value } : null,
                )
              }
            />
          )}
          <button
            type="button"
            disabled={busy !== null}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            onClick={() => void saveProperty()}
          >
            保存属性
          </button>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

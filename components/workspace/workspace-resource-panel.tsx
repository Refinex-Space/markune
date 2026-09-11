'use client';

import * as React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Copy,
  Download,
  ExternalLink,
  File,
  FileImage,
  FileText,
  FolderOpen,
  ImageIcon,
  Maximize2,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  isTauriRuntime,
  openPathInFileManager,
  openUrlInDefaultBrowser,
  readDocumentAssetData,
  readWorkspaceAssetData,
  resolveDocumentAssets,
  resolveWorkspaceAsset,
  selectWorkspaceAssetDownloadPath,
  writeExportFile,
} from './workspace-api';
import { getWorkspaceAssetIdFromReference } from './workspace-local-assets';
import type {
  KnowledgeDocumentSummary,
  KnowledgeLocation,
} from './workspace-knowledge-types';
import {
  WorkspaceResourcePreview,
  type ResourceImage,
} from './workspace-resource-preview';
import './workspace-resource-panel.css';

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
  size?: number;
  url?: string;
}
interface ResourcePanelProps {
  rootPath: string;
  documents: ResourceDocument[];
  imageSources?: string[];
  onOpen?: (location: KnowledgeLocation) => void;
  onReadPdf?: (source: {
    documentPath: string;
    source: string;
    name: string;
  }) => void;
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

export function WorkspaceResourcePanel(props: ResourcePanelProps) {
  return <ResourcePanelContent key={props.rootPath} {...props} />;
}

function ResourcePanelContent({
  rootPath,
  documents,
  imageSources = [],
  onOpen,
  onReadPdf,
}: ResourcePanelProps) {
  const [statuses, setStatuses] = React.useState<
    Record<string, ResourceStatus>
  >({});
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(100);
  const [loading, setLoading] = React.useState(true);
  const [feedback, setFeedback] = React.useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const savingRef = React.useRef(false);
  const mounted = React.useRef(true);
  const previewTrigger = React.useRef<HTMLElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const rows = React.useMemo(() => resourceGroups(documents), [documents]);
  const imageHints = new Set(imageSources);
  const isImage = (row: ResourceRow) =>
    imageHints.has(row.source) ||
    isImageResource(row.source, statuses[row.key]);
  const filtered = rows.filter((row) => {
    const status = statuses[row.key];
    const search = [
      row.source,
      status?.name,
      status?.path,
      ...row.documents.map((document) => document.title),
    ]
      .join(' ')
      .toLowerCase();
    return search.includes(query.trim().toLowerCase());
  });
  const visible = filtered.slice(0, limit);
  const images: ResourceImage[] = rows.flatMap((row) => {
    const status = statuses[row.key];
    if (!isImage(row) || !status || status.state === 'unavailable') return [];
    const url =
      status.url ?? (status.state === 'remote' ? row.source : undefined);
    return url
      ? [
          {
            key: row.key,
            name: resourceName(row.source, status),
            url,
            local: status.state === 'available',
          },
        ]
      : [];
  });
  const preview = images.find((image) => image.key === selected);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
                size: asset.size,
                url: convertFileSrc(asset.absolutePath),
              };
            } else {
              const result = await resolveDocumentAssets(
                rootPath,
                `${rootPath}/${row.documents[0].relativePath}`,
                [row.source],
              );
              const path = result.find(
                (item) => item.src === row.source,
              )?.absolutePath;
              status = path
                ? { state: 'available', path, url: convertFileSrc(path) }
                : { state: 'unavailable' };
            }
          } catch {
            status = { state: 'unavailable' };
          }
        }
        if (active) {
          updates[row.key] = status;
          timer ??= setTimeout(flush, 100);
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(4, rows.length) }, inspect),
    ).then(() => {
      flush();
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [rootPath, rows]);

  async function act(action: () => Promise<unknown>, success?: string) {
    setFeedback(null);
    try {
      await action();
      if (mounted.current && success) setFeedback({ text: success });
    } catch {
      if (mounted.current)
        setFeedback({ text: '操作未完成，请重试。', error: true });
    }
  }

  async function download(row: ResourceRow) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(row.key);
    setFeedback(null);
    try {
      const id = getWorkspaceAssetIdFromReference(row.source.split(/[?#]/)[0]);
      const data = id
        ? await readWorkspaceAssetData(rootPath, id)
        : await readDocumentAssetData(
            rootPath,
            `${rootPath}/${row.documents[0].relativePath}`,
            row.source,
          );
      if (!mounted.current) return;
      const target = await selectWorkspaceAssetDownloadPath(
        data.name,
        data.mediaType,
      );
      if (!target || !mounted.current) return;
      if (isTauriRuntime()) await writeExportFile(target, data.base64Data);
      else {
        const bytes = Uint8Array.from(atob(data.base64Data), (char) =>
          char.charCodeAt(0),
        );
        const url = URL.createObjectURL(
          new Blob([bytes], { type: data.mediaType }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = data.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (mounted.current) setFeedback({ text: `已保存 ${data.name}` });
    } catch {
      if (mounted.current)
        setFeedback({
          text: '保存失败，请检查文件是否可读取及目标文件夹是否可写。',
          error: true,
        });
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(null);
    }
  }

  return (
    <div
      className="resource-panel"
      data-testid="workspace-resource-panel"
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="resource-toolbar">
        <label className="resource-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="搜索资源"
            placeholder="搜索资源"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(100);
            }}
          />
        </label>
      </div>
      {feedback ? (
        <div
          className="resource-feedback"
          role={feedback.error ? 'alert' : 'status'}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            className="resource-icon-button"
            aria-label="关闭提示"
            onClick={() => setFeedback(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      <div className="resource-list" aria-label="资源列表" aria-busy={loading}>
        {visible.map((row) => {
          const status = statuses[row.key];
          const name = resourceName(row.source, status);
          const image = images.find((item) => item.key === row.key);
          return (
            <ResourceItem
              key={row.key}
              row={row}
              status={status}
              name={name}
              image={isImage(row)}
              saving={saving === row.key}
              downloadDisabled={saving !== null}
              onPreview={
                image
                  ? (element) => {
                      previewTrigger.current = element;
                      setSelected(row.key);
                    }
                  : undefined
              }
              onDownload={() => void download(row)}
              onCopy={() =>
                void act(
                  () =>
                    navigator.clipboard.writeText(status?.path ?? row.source),
                  status?.path ? '已复制路径' : '已复制引用地址',
                )
              }
              onLocate={() => {
                if (status?.path)
                  void act(() => openPathInFileManager(status.path!));
              }}
              onExternal={() =>
                void act(() => openUrlInDefaultBrowser(row.source))
              }
              onOpen={onOpen}
              onReadPdf={
                onReadPdf
                  ? () =>
                      onReadPdf({
                        documentPath: `${rootPath}/${row.documents[0].relativePath}`,
                        source: row.source,
                        name,
                      })
                  : undefined
              }
            />
          );
        })}
        {!visible.length ? (
          <div className="resource-empty">
            <ImageIcon size={28} strokeWidth={1.4} aria-hidden="true" />
            <strong>
              {!rows.length
                ? '暂无资源'
                : loading
                  ? '正在加载资源…'
                  : '未找到匹配资源'}
            </strong>
            <p className="resource-secondary">
              {!rows.length
                ? '文档中的图片和附件会显示在这里。'
                : query
                  ? '试试其他关键词，或清除搜索。'
                  : ''}
            </p>
            {rows.length > 0 && query ? (
              <button
                className="resource-button"
                type="button"
                onClick={() => {
                  setQuery('');
                  setLimit(100);
                }}
              >
                清除搜索
              </button>
            ) : null}
          </div>
        ) : null}
        {filtered.length > limit ? (
          <button
            type="button"
            className="resource-button resource-more"
            onClick={() => setLimit((value) => value + 100)}
          >
            显示更多（剩余 {filtered.length - limit}）
          </button>
        ) : null}
      </div>
      <WorkspaceResourcePreview
        image={preview}
        images={images}
        saving={saving !== null}
        feedback={feedback}
        onSelect={setSelected}
        onClose={() => setSelected(null)}
        onRestoreFocus={() => {
          (previewTrigger.current?.isConnected
            ? previewTrigger.current
            : panelRef.current
          )?.focus();
        }}
        onDownload={() => {
          const row = rows.find((item) => item.key === selected);
          if (row) void download(row);
        }}
      />
    </div>
  );
}

function ResourceItem({
  row,
  status,
  name,
  image,
  saving,
  downloadDisabled,
  onPreview,
  onDownload,
  onCopy,
  onLocate,
  onExternal,
  onOpen,
  onReadPdf,
}: {
  row: ResourceRow;
  status?: ResourceStatus;
  name: string;
  image: boolean;
  saving: boolean;
  downloadDisabled: boolean;
  onPreview?: (element: HTMLElement) => void;
  onDownload: () => void;
  onCopy: () => void;
  onLocate: () => void;
  onExternal: () => void;
  onOpen?: ResourcePanelProps['onOpen'];
  onReadPdf?: () => void;
}) {
  const [failed, setFailed] = React.useState(false);
  const [dimensions, setDimensions] = React.useState('');
  const local = status?.state === 'available';
  const pdf =
    status?.mediaType === 'application/pdf' ||
    /\.pdf(?:[?#]|$)/i.test(row.source);
  const issue =
    status?.state === 'unavailable' ? '无法读取' : failed ? '无法预览' : null;
  const thumbnail =
    image && local && status.url && !failed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={status.url}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const img = event.currentTarget;
          setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
        }}
        onError={() => {
          setFailed(true);
        }}
      />
    ) : image ? (
      <FileImage size={24} strokeWidth={1.5} aria-hidden="true" />
    ) : pdf ? (
      <FileText size={24} strokeWidth={1.5} aria-hidden="true" />
    ) : (
      <File size={24} strokeWidth={1.5} aria-hidden="true" />
    );
  const format =
    status?.mediaType?.split('/')[1]?.replace('svg+xml', 'svg').toUpperCase() ||
    name.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toUpperCase() ||
    (image ? '图片' : '附件');
  return (
    <section className="resource-row" aria-label={name}>
      <div className="resource-row-main">
        {onPreview ? (
          <button
            className="resource-thumbnail"
            type="button"
            aria-label={`查看大图 ${name}`}
            title="查看大图"
            onClick={(event) => onPreview(event.currentTarget)}
          >
            {thumbnail}
            <span className="resource-thumbnail-hint">
              <Maximize2 size={12} />
            </span>
          </button>
        ) : (
          <div className="resource-thumbnail">{thumbnail}</div>
        )}
        <div className="resource-row-content">
          {onPreview ? (
            <button
              className="resource-name"
              type="button"
              title={name}
              onClick={(event) => onPreview(event.currentTarget)}
            >
              {name}
            </button>
          ) : (
            <p className="resource-name" title={name}>
              {name}
            </p>
          )}
          <div className="resource-metadata">
            <span>{format}</span>
            {dimensions ? <span>· {dimensions}</span> : null}
            {status?.size != null ? (
              <span>· {formatResourceBytes(status.size)}</span>
            ) : null}
            {status?.state === 'remote' ? (
              <span>· {image ? '网络图片' : '网络附件'}</span>
            ) : null}
            {!status ? <span>· 加载中</span> : null}
          </div>
          {issue ? (
            <p className="resource-issue">
              <AlertCircle size={13} aria-hidden="true" />
              {issue}
            </p>
          ) : null}
          <div className="resource-row-footer">
            {onOpen ? (
              <details className="resource-references">
                <summary>{row.documents.length} 篇笔记引用</summary>
                {row.documents.map((document) => (
                  <button
                    key={document.relativePath}
                    type="button"
                    className="resource-reference-link"
                    title={document.relativePath}
                    onClick={() =>
                      onOpen({ relativePath: document.relativePath })
                    }
                  >
                    {document.title}
                  </button>
                ))}
              </details>
            ) : null}
            <div className="resource-actions resource-row-actions">
              {local ? (
                <button
                  className="resource-icon-button"
                  type="button"
                  title={saving ? '保存中…' : image ? '下载图片' : '下载附件'}
                  aria-busy={saving}
                  disabled={downloadDisabled}
                  onClick={onDownload}
                  aria-label={`下载${image ? '图片' : '附件'} ${name}`}
                >
                  <Download size={14} aria-hidden="true" />
                </button>
              ) : null}
              {pdf && local && onReadPdf ? (
                <button
                  className="resource-button"
                  type="button"
                  onClick={onReadPdf}
                >
                  阅读 PDF
                </button>
              ) : null}
              {status?.state === 'remote' ? (
                <button
                  className="resource-button"
                  type="button"
                  onClick={onExternal}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {image ? '打开原图' : '打开链接'}
                </button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="resource-icon-button"
                    type="button"
                    aria-label={`更多操作 ${name}`}
                    title="更多操作"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="resource-menu"
                  collisionPadding={8}
                >
                  {status?.path ? (
                    <DropdownMenuItem onSelect={onLocate}>
                      <FolderOpen size={15} />
                      在文件夹中显示
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={onCopy}>
                    <Copy size={15} />
                    {status?.path ? '复制路径' : '复制引用地址'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function resourceName(source: string, status?: ResourceStatus) {
  if (status?.name) return status.name;
  const path = (status?.path ?? source).replace(/\\/g, '/').split(/[?#]/)[0];
  const name = path.split('/').filter(Boolean).at(-1) || '未命名附件';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function isImageResource(source: string, status?: ResourceStatus) {
  return (
    status?.mediaType?.startsWith('image/') ||
    /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico|heic|heif)(?:[?#]|$)/i.test(
      status?.name ?? source,
    )
  );
}

function formatResourceBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

'use client';

import * as React from 'react';
import {
  Archive,
  Clock,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  Fullscreen,
  Hash,
  Eye,
  Image as ImageIcon,
  PenLine,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  readWorkspaceAssetData,
  resolveWorkspaceAsset,
  selectWorkspaceAssetDownloadPath,
  writeExportFile,
} from './workspace-api';
import {
  countMarkdownCharacters,
  countMarkdownLines,
  extractResourceReferencesFromMarkdown,
  type DocumentResourceReference,
} from './workspace-document-insights';
import type {
  ResolvedWorkspaceAsset,
  WorkspaceNode,
} from './workspace-types';
import type { DocumentPanelData } from './right-side-panel';

type MetaTab = 'meta' | 'resources';

interface DocumentMetaPanelProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  readOnly: boolean;
  workspaceRootPath: string | null;
  onToggleReadOnly?: () => void;
}

export function DocumentMetaPanel({
  currentDocument,
  documentPanelData,
  readOnly,
  workspaceRootPath,
  onToggleReadOnly,
}: DocumentMetaPanelProps) {
  const [activeTab, setActiveTab] = React.useState<MetaTab>('meta');
  const deferredMarkdown = React.useDeferredValue(documentPanelData?.markdown);
  const resources = React.useMemo(
    () => extractResourceReferencesFromMarkdown(deferredMarkdown),
    [deferredMarkdown],
  );
  const characterCount = React.useMemo(
    () => countMarkdownCharacters(deferredMarkdown),
    [deferredMarkdown],
  );
  const lineCount = React.useMemo(
    () => countMarkdownLines(deferredMarkdown),
    [deferredMarkdown],
  );

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => setActiveTab('meta'), 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentDocument?.absolutePath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center px-3 py-1">
        <div
          className="grid h-7 flex-1 rounded-full bg-muted p-0.5 text-xs"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          <MetaTabButton
            active={activeTab === 'meta'}
            label="元信息"
            onClick={() => setActiveTab('meta')}
          />
          <MetaTabButton
            active={activeTab === 'resources'}
            label={`资源 ${resources.length}`}
            onClick={() => setActiveTab('resources')}
          />
        </div>
      </div>

      <div className="git-panel-scroll min-h-0 flex-1 overflow-auto p-3">
        {!currentDocument ? (
          <DocumentMetaEmptyState text="选择文档后查看元信息和资源。" />
        ) : activeTab === 'meta' ? (
          <DocumentMetaDetails
            characterCount={characterCount}
            currentDocument={currentDocument}
            documentPanelData={documentPanelData}
            lineCount={lineCount}
            readOnly={readOnly}
            resourceCount={resources.length}
            onToggleReadOnly={onToggleReadOnly}
          />
        ) : (
          <DocumentResourceList
            references={resources}
            workspaceRootPath={workspaceRootPath}
          />
        )}
      </div>
    </div>
  );
}

function MetaTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'h-6 rounded-full px-3 text-muted-foreground transition-colors',
        active && 'bg-background text-foreground shadow-sm',
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DocumentMetaDetails({
  characterCount,
  currentDocument,
  documentPanelData,
  lineCount,
  readOnly,
  resourceCount,
  onToggleReadOnly,
}: {
  characterCount: number;
  currentDocument: WorkspaceNode;
  documentPanelData: DocumentPanelData | null;
  lineCount: number;
  readOnly: boolean;
  resourceCount: number;
  onToggleReadOnly?: () => void;
}) {
  const title =
    documentPanelData?.metadata.title ||
    currentDocument.title ||
    '未命名文档';

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted/25 px-4 py-3">
        <div className="pb-3">
          <p className="text-[11px] text-muted-foreground">标题</p>
          <p className="mt-1 break-words text-base font-medium leading-6">
            {title}
          </p>
        </div>

        <div className="divide-y divide-border/60">
          <MetaRow
            icon={<Clock size={14} />}
            label="创建时间"
            value={formatDocumentDate(documentPanelData?.metadata.createdAt)}
          />
          <MetaRow
            icon={<Clock size={14} />}
            label="修改时间"
            value={formatDocumentDate(documentPanelData?.metadata.updatedAt)}
          />
          <MetaRow
            icon={<Hash size={14} />}
            label="资源数"
            value={`${resourceCount.toLocaleString('zh-CN')} 个`}
          />
          <MetaRow
            icon={<Hash size={14} />}
            label="词数"
            value={characterCount.toLocaleString('zh-CN')}
          />
          <MetaRow
            icon={<FileText size={14} />}
            label="行数"
            value={lineCount.toLocaleString('zh-CN')}
          />
          <MetaRow
            icon={<Hash size={14} />}
            label="字符"
            value={characterCount.toLocaleString('zh-CN')}
          />
          <MetaRow
            icon={<FileText size={14} />}
            label="编码"
            value="UTF-8"
          />
          <DocumentModeRow
            readOnly={readOnly}
            onToggleReadOnly={onToggleReadOnly}
          />
        </div>
      </div>

      <FrontmatterDetails frontmatter={documentPanelData?.frontmatter ?? {}} />
    </div>
  );
}

function DocumentModeRow({
  readOnly,
  onToggleReadOnly,
}: {
  readOnly: boolean;
  onToggleReadOnly?: () => void;
}) {
  const Icon = readOnly ? Eye : PenLine;

  return (
    <div className="flex min-h-11 items-center gap-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/80">
        <Icon size={14} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        模式
      </span>
      <span className="flex max-w-[58%] justify-end">
        <button
            aria-label={readOnly ? '切换为编辑模式' : '切换为阅读模式'}
            className={cn(
              'grid h-7 w-[58px] shrink-0 grid-cols-2 rounded-lg border border-border/70 bg-background/80 p-0.5 text-muted-foreground shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] transition-colors',
              'hover:border-border hover:bg-background disabled:pointer-events-none disabled:opacity-50',
            )}
          disabled={!onToggleReadOnly}
          type="button"
          onClick={onToggleReadOnly}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-6 items-center justify-center rounded-md transition-colors',
              !readOnly && 'bg-sidebar-accent text-foreground shadow-sm',
            )}
          >
            <PenLine size={13} strokeWidth={1.8} />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'flex size-6 items-center justify-center rounded-md transition-colors',
              readOnly && 'bg-sidebar-accent text-foreground shadow-sm',
            )}
          >
            <Eye size={13} strokeWidth={1.8} />
          </span>
        </button>
      </span>
    </div>
  );
}

function FrontmatterDetails({
  frontmatter,
}: {
  frontmatter: Record<string, string>;
}) {
  const entries = Object.entries(frontmatter);

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl bg-muted/25 px-4 py-3">
      <h3 className="text-[11px] font-medium text-muted-foreground">
        Frontmatter
      </h3>
      <dl className="mt-2 divide-y divide-border/60">
        {entries.map(([key, value]) => (
          <div
            className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-3 py-2 text-xs"
            key={key}
          >
            <dt className="truncate text-muted-foreground" title={key}>
              {key}
            </dt>
            <dd
              className="break-words text-right font-medium text-foreground"
              title={value}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[58%] truncate text-right text-xs font-medium">
        {value}
      </span>
    </div>
  );
}

function DocumentResourceList({
  references,
  workspaceRootPath,
}: {
  references: DocumentResourceReference[];
  workspaceRootPath: string | null;
}) {
  const [assets, setAssets] = React.useState<
    Record<string, ResolvedWorkspaceAsset>
  >({});
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [previewResource, setPreviewResource] =
    React.useState<ResourcePreview | null>(null);

  React.useEffect(() => {
    const remotePreviews = Object.fromEntries(
      references
        .filter(
          (reference) =>
            reference.source === 'remote' && reference.nodeType === 'image',
        )
        .map((reference) => [reference.id, reference.url]),
    );
    const localReferences = references.filter(
      (reference) => reference.source === 'local',
    );

    if (!workspaceRootPath || localReferences.length === 0) {
      const timeoutId = window.setTimeout(() => {
        setAssets({});
        setPreviews(remotePreviews);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let cancelled = false;
    const rootPath = workspaceRootPath;

    async function loadAssets() {
      const nextAssets: Record<string, ResolvedWorkspaceAsset> = {};
      const nextPreviews: Record<string, string> = { ...remotePreviews };

      for (const reference of localReferences) {
        try {
          const asset = await resolveWorkspaceAsset(rootPath, reference.id);
          nextAssets[reference.id] = asset;

          if (asset.mediaType.startsWith('image/')) {
            const data = await readWorkspaceAssetData(
              rootPath,
              reference.id,
            );
            nextPreviews[reference.id] =
              `data:${data.mediaType};base64,${data.base64Data}`;
          }
        } catch {
          // 资源索引缺失时仍保留引用 ID，避免列表消失。
        }
      }

      if (!cancelled) {
        setAssets(nextAssets);
        setPreviews(nextPreviews);
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [references, workspaceRootPath]);

  const handleDownload = React.useCallback(
    async (reference: DocumentResourceReference) => {
      if (reference.source === 'local' && !workspaceRootPath) {
        setError('打开工作区后才能下载资源。');
        return;
      }

      setError(null);
      setDownloadingId(reference.id);

      try {
        const data =
          reference.source === 'local'
            ? await readWorkspaceAssetData(workspaceRootPath!, reference.id)
            : await readRemoteResourceData(reference);
        const targetPath = await selectWorkspaceAssetDownloadPath(
          data.name,
          data.mediaType,
        );

        if (targetPath) {
          await writeExportFile(targetPath, data.base64Data);
        }
      } catch (downloadError) {
        setError(formatUnknownError(downloadError));
      } finally {
        setDownloadingId(null);
      }
    },
    [workspaceRootPath],
  );

  if (references.length === 0) {
    return <DocumentMetaEmptyState text="当前文档没有引用资源。" />;
  }

  return (
    <>
      <div className="space-y-2">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {references.map((reference) => {
          const asset = assets[reference.id];
          const displayName = asset?.name ?? getResourceNameFromReference(reference);
          const previewUrl = previews[reference.id];

          return (
            <DocumentResourceItem
              asset={asset}
              downloading={downloadingId === reference.id}
              key={reference.id}
              previewUrl={previewUrl}
              reference={reference}
              onDownload={() => void handleDownload(reference)}
              onPreview={
                previewUrl
                  ? () => setPreviewResource({
                      name: displayName,
                      url: previewUrl,
                    })
                  : undefined
              }
            />
          );
        })}
      </div>

      <Dialog
        open={Boolean(previewResource)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewResource(null);
          }
        }}
      >
        <DialogContent className="max-h-[min(760px,calc(100vh-40px))] w-[min(920px,calc(100vw-40px))] max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="truncate text-sm">
              {previewResource ? `查看资源 ${previewResource.name}` : '查看资源'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              以大图方式预览当前资源。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 bg-muted/40 p-4">
            {previewResource ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={previewResource.name}
                className="mx-auto max-h-[min(640px,calc(100vh-160px))] max-w-full rounded-lg object-contain shadow-sm"
                src={previewResource.url}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ResourcePreview {
  name: string;
  url: string;
}

function DocumentResourceItem({
  asset,
  downloading,
  onPreview,
  previewUrl,
  reference,
  onDownload,
}: {
  asset?: ResolvedWorkspaceAsset;
  downloading: boolean;
  onPreview?: () => void;
  previewUrl?: string;
  reference: DocumentResourceReference;
  onDownload: () => void;
}) {
  const displayName = asset?.name ?? getResourceNameFromReference(reference);
  const mediaType = asset?.mediaType ?? getResourceTypeFromNode(reference.nodeType);
  const sourceLabel = reference.source === 'remote' ? '远程链接' : '本地资源';

  return (
    <div className="group relative flex gap-3 rounded-lg border bg-background p-2 transition-colors hover:border-[#3574f0]/40 hover:bg-muted/30 focus-within:border-[#3574f0]/40 focus-within:bg-muted/30">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={displayName} className="h-full w-full object-cover" src={previewUrl} />
        ) : (
          getResourceIcon(mediaType)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {getResourceLabel(mediaType)}
              {asset ? ` · ${formatBytes(asset.size)}` : ` · ${sourceLabel}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {onPreview ? (
              <button
                aria-label={`查看资源 ${displayName}`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground"
                title="查看"
                type="button"
                onClick={onPreview}
              >
                <Fullscreen size={15} />
              </button>
            ) : null}
            <button
              aria-label={`下载资源 ${displayName}`}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={downloading}
              title="下载"
              type="button"
              onClick={onDownload}
            >
              <Download size={15} />
            </button>
          </div>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground/80">
          {reference.url}
        </p>
      </div>
    </div>
  );
}

function getResourceNameFromReference(reference: DocumentResourceReference) {
  if (reference.source === 'local') {
    return reference.id;
  }

  try {
    const url = new URL(reference.url);
    const fileName = decodeURIComponent(
      url.pathname.split('/').filter(Boolean).at(-1) ?? '',
    );

    return fileName || url.hostname;
  } catch {
    return reference.id;
  }
}

async function readRemoteResourceData(reference: DocumentResourceReference) {
  const response = await fetch(reference.url);

  if (!response.ok) {
    throw new Error('远程资源下载失败。');
  }

  const mediaType =
    response.headers.get('Content-Type')?.split(';')[0]?.trim() ||
    getResourceTypeFromNode(reference.nodeType);
  const buffer = await response.arrayBuffer();

  return {
    base64Data: arrayBufferToBase64(buffer),
    id: reference.id,
    mediaType,
    name: getResourceNameFromReference(reference),
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

function DocumentMetaEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function getResourceIcon(mediaType: string) {
  if (mediaType.startsWith('image/')) {
    return <FileImage size={20} />;
  }

  if (mediaType.startsWith('audio/')) {
    return <FileAudio size={20} />;
  }

  if (
    mediaType === 'application/zip' ||
    mediaType === 'application/x-zip-compressed'
  ) {
    return <Archive size={20} />;
  }

  if (mediaType.startsWith('text/') || mediaType.includes('document')) {
    return <FileText size={20} />;
  }

  if (mediaType.startsWith('image')) {
    return <ImageIcon size={20} />;
  }

  return <File size={20} />;
}

function getResourceLabel(mediaType: string) {
  if (mediaType.startsWith('image/')) {
    return '图片';
  }

  if (mediaType.startsWith('audio/')) {
    return '录音';
  }

  if (mediaType.startsWith('video/')) {
    return '视频';
  }

  if (
    mediaType === 'application/zip' ||
    mediaType === 'application/x-zip-compressed'
  ) {
    return '压缩包';
  }

  return '附件';
}

function getResourceTypeFromNode(nodeType: string) {
  switch (nodeType) {
    case 'img':
    case 'image':
      return 'image/*';
    case 'audio':
      return 'audio/*';
    case 'video':
      return 'video/*';
    case 'file':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDocumentDate(value: string | undefined) {
  if (!value) {
    return '未读取';
  }

  const date = parseDocumentDate(value);

  if (Number.isNaN(date.getTime())) {
    return '未读取';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function parseDocumentDate(value: string) {
  const normalized = value.trim();
  const legacyEpochMillis = normalized.match(/^(\d+)Z?$/u);

  if (legacyEpochMillis) {
    return new Date(Number(legacyEpochMillis[1]));
  }

  return new Date(normalized);
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '资源下载失败。';
}

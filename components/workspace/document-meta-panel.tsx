'use client';

import * as React from 'react';
import { Tabs } from 'radix-ui';
import {
  Archive,
  Download,
  File,
  FileAudio,
  FileImage,
  FileText,
  Fullscreen,
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
  countMarkdownWords,
  extractResourceReferencesFromMarkdown,
  type DocumentResourceReference,
} from './workspace-document-insights';
import type {
  ResolvedWorkspaceAsset,
  WorkspaceNode,
} from './workspace-types';
import type { DocumentPanelData } from './right-side-panel';
import { WorkspaceResourcePanel } from './workspace-resource-panel';
import { DocumentSourcePanel } from './document-source-panel';
import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';
import { DocumentRelationsPanel } from './document-relations-panel';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type { KnowledgeLocation } from './workspace-knowledge-types';

type MetaTab = 'meta' | 'resources' | 'relations' | 'source';

interface DocumentMetaPanelProps {
  knowledge?: WorkspaceKnowledge;
  onOpenLocation?: (location: KnowledgeLocation) => void;
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  readOnly: boolean;
  workspaceRootPath: string | null;
  onToggleReadOnly?: () => void;
}

export function DocumentMetaPanel({
  knowledge,
  onOpenLocation,
  currentDocument,
  documentPanelData,
  readOnly,
  workspaceRootPath,
  onToggleReadOnly,
}: DocumentMetaPanelProps) {
  const [activeTab, setActiveTab] = React.useState<MetaTab>('meta');
  const deferredMarkdown = React.useDeferredValue(documentPanelData?.markdown);
  const sourceInfo = React.useMemo(() => activeTab === 'source' ? parseFrontmatter(deferredMarkdown ?? '').properties.source : undefined, [activeTab, deferredMarkdown]);
  const hasSource = Object.hasOwn(documentPanelData?.frontmatter ?? {}, 'source');
  const resources = React.useMemo(
    () => extractResourceReferencesFromMarkdown(deferredMarkdown),
    [deferredMarkdown],
  );
  const characterCount = React.useMemo(
    () => countMarkdownCharacters(deferredMarkdown),
    [deferredMarkdown],
  );
  const wordCount = React.useMemo(
    () => countMarkdownWords(deferredMarkdown),
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
    <Tabs.Root
      className="flex min-h-0 flex-1 flex-col"
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as MetaTab)}
    >
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <Tabs.List
          aria-label="文档面板"
          className="grid h-8 rounded-lg bg-muted/60 p-0.5 text-xs"
          style={{ gridTemplateColumns: `repeat(${(knowledge ? 3 : 2) + (hasSource ? 1 : 0)}, 1fr)` }}
        >
          <MetaTabButton value="meta" label="元信息" />
          <MetaTabButton
            value="resources"
            label={`资源 ${resources.length}`}
          />
          {knowledge ? <MetaTabButton value="relations" label="关联" /> : null}
          {hasSource ? <MetaTabButton value="source" label="来源" /> : null}
        </Tabs.List>
      </div>

      <Tabs.Content
        key={activeTab}
        value={activeTab}
        className={cn(
          'git-panel-scroll min-h-0 flex-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
          activeTab === 'resources' && knowledge && workspaceRootPath && onOpenLocation
            ? 'flex flex-col overflow-hidden'
            : 'overflow-auto px-4 py-5',
        )}
      >
        {!currentDocument ? (
          <DocumentMetaEmptyState text="选择文档后查看元信息和资源。" />
        ) : activeTab === 'source' ? (
          <DocumentSourcePanel source={sourceInfo} documentPath={currentDocument.absolutePath} />
        ) : activeTab === 'resources' && knowledge && workspaceRootPath && onOpenLocation ? (
          <WorkspaceResourcePanel
            key={currentDocument.absolutePath}
            rootPath={workspaceRootPath}
            documents={[{
              relativePath: currentDocument.relativePath,
              title: currentDocument.title ?? currentDocument.name,
              resources: resources.map((resource) => resource.url),
              links: knowledge.documents.find((document) => document.relativePath === currentDocument.relativePath)?.links ?? [],
            }]}
            imageSources={resources.filter((resource) => resource.nodeType === 'image').map((resource) => resource.url)}
            onOpen={onOpenLocation}
            onReadPdf={(request) => window.dispatchEvent(new CustomEvent('markune:read-pdf', { detail: request }))}
          />
        ) : activeTab === 'relations' && knowledge && workspaceRootPath && onOpenLocation ? (
          <DocumentRelationsPanel key={currentDocument.relativePath} path={currentDocument.relativePath} rootPath={workspaceRootPath} knowledge={knowledge} onOpen={onOpenLocation} />
        ) : activeTab === 'meta' ? (
          <DocumentMetaDetails
            characterCount={characterCount}
            documentPanelData={documentPanelData}
            lineCount={lineCount}
            readOnly={readOnly}
            resourceCount={resources.length}
            wordCount={wordCount}
            onToggleReadOnly={onToggleReadOnly}
          />
        ) : (
          <DocumentResourceList
            references={resources}
            workspaceRootPath={workspaceRootPath}
          />
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}

function MetaTabButton({ value, label }: { value: MetaTab; label: string }) {
  return (
    <Tabs.Trigger
      className="min-w-0 rounded-md px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
      value={value}
    >
      {label}
    </Tabs.Trigger>
  );
}

function DocumentMetaDetails({
  characterCount,
  documentPanelData,
  lineCount,
  readOnly,
  resourceCount,
  wordCount,
  onToggleReadOnly,
}: {
  characterCount: number;
  documentPanelData: DocumentPanelData | null;
  lineCount: number;
  readOnly: boolean;
  resourceCount: number;
  wordCount: number;
  onToggleReadOnly?: () => void;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <MetaSection title="文档信息">
        <dl className="divide-y divide-border/60">
          <MetaRow
            label="创建时间"
            value={formatDocumentDate(documentPanelData?.metadata.createdAt)}
          />
          <MetaRow
            label="修改时间"
            value={formatDocumentDate(documentPanelData?.metadata.updatedAt)}
          />
          <MetaRow label="编码" value="UTF-8" />
        </dl>
        <div className="border-t border-border/60">
          <DocumentModeRow readOnly={readOnly} onToggleReadOnly={onToggleReadOnly} />
        </div>
      </MetaSection>

      <MetaSection title="内容统计">
        <dl className="divide-y divide-border/60">
          <MetaRow label="词数" value={wordCount.toLocaleString('zh-CN')} />
          <MetaRow label="字符" value={characterCount.toLocaleString('zh-CN')} />
          <MetaRow label="行数" value={lineCount.toLocaleString('zh-CN')} />
          <MetaRow label="资源数" value={`${resourceCount.toLocaleString('zh-CN')} 个`} />
        </dl>
      </MetaSection>

      <FrontmatterDetails frontmatter={documentPanelData?.frontmatter ?? {}} />
    </div>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="rounded-xl border border-border/65 bg-background px-3.5">
        {children}
      </div>
    </section>
  );
}

function DocumentModeRow({
  readOnly,
  onToggleReadOnly,
}: {
  readOnly: boolean;
  onToggleReadOnly?: () => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2.5">
      <span className="text-xs text-muted-foreground">模式</span>
      <div role="group" aria-label="文档模式" className="flex shrink-0 gap-0.5 rounded-lg bg-muted/60 p-0.5">
        {[
          { label: '编辑', value: false, icon: PenLine },
          { label: '阅读', value: true, icon: Eye },
        ].map(({ label, value, icon: Icon }) => (
          <button
            key={label}
            aria-label={`切换为${label}模式`}
            aria-pressed={readOnly === value}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              readOnly === value && 'bg-background text-foreground shadow-sm',
            )}
            disabled={!onToggleReadOnly}
            type="button"
            onClick={() => {
              if (readOnly !== value) onToggleReadOnly?.();
            }}
          >
            <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FrontmatterDetails({ frontmatter }: { frontmatter: Record<string, string> }) {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return null;

  return (
    <MetaSection title="Frontmatter">
      <dl className="divide-y divide-border/60">
        {entries.map(([key, value]) => (
          <div className="grid grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)] items-start gap-3 py-3 text-xs leading-5" key={key}>
            <dt className="text-muted-foreground [overflow-wrap:anywhere]">{key}</dt>
            <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </MetaSection>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-3 text-xs leading-5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{value}</dd>
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

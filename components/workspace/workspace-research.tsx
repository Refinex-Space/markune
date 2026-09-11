'use client';
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createEvidenceRefs } from './research-evidence';
import { PdfResearchReader } from './pdf-research-reader';
import {
  assertResearchPdf,
  contentFingerprint,
  createResearchNote,
  createResearchPrompt,
  researchSourceReference,
  type ResearchDraftRequest,
  type ResearchEvidence,
} from './research-notes';
import {
  createWorkspaceDocumentFromContent,
  readDocumentAssetData,
  readMarkdownDocument,
  readWorkspaceAssetData,
  saveMarkdownDocument,
  storeDocumentAsset,
} from './workspace-api';
import { getWorkspaceAssetIdFromReference } from './workspace-local-assets';
import type { WorkspaceKnowledge } from './use-workspace-knowledge';
import type { KnowledgeLocation } from './workspace-knowledge-types';
import type { CreatedMarkdownDocument, WorkspaceNode } from './workspace-types';

export interface PdfSourceRequest {
  documentPath: string;
  source: string;
  name: string;
  page?: number;
  fingerprint?: string;
}

export function WorkspaceResearchPanel({
  rootPath,
  knowledge,
  onOpen,
  onCreated,
  onDraft,
  onReadPdf,
}: {
  rootPath: string;
  knowledge: WorkspaceKnowledge;
  onOpen: (location: KnowledgeLocation) => void;
  onCreated: (node: WorkspaceNode) => Promise<void> | void;
  onDraft: (request: ResearchDraftRequest) => void;
  onReadPdf: () => void;
}) {
  const [question, setQuestion] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [matches, setMatches] = React.useState<string[] | null>(null);
  const [evidence, setEvidence] = React.useState<ResearchEvidence[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [webOpen, setWebOpen] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('网页摘录');
  const [quote, setQuote] = React.useState('');
  const search = knowledge.search;
  React.useEffect(() => {
    let active = true;
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void search(query, 40).then((results) => {
        if (active)
          setMatches(
            results
              .filter((result) => result.document.kind !== 'drawing')
              .map((result) => result.document.relativePath),
          );
      });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, search, knowledge.revision]);
  const candidates = [...knowledge.documents]
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .filter(
      (document) => !query.trim() || matches?.includes(document.relativePath),
    )
    .slice(0, 40);
  async function prepare() {
    if (!question.trim() || !Object.keys(selected).length) {
      setError('请输入问题并选择 1～8 篇资料');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const evidence: ResearchEvidence[] = [];
      for (const path of Object.keys(selected)) {
        const document = knowledge.documents.find(
          (document) => document.relativePath === path,
        );
        if (!document) throw new Error('选定资料已移动或删除，请重新选择');
        const current = await readMarkdownDocument(
          rootPath,
          `${rootPath}/${path}`,
        );
        evidence.push(
          ...(await createEvidenceRefs(
            path,
            document.title,
            current.content,
            question,
          )),
        );
      }
      setEvidence(evidence);
      onDraft({
        id: crypto.randomUUID(),
        text: createResearchPrompt(question, evidence),
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function captureWeb() {
    setBusy(true);
    setError(null);
    try {
      const source = {
        type: 'web' as const,
        title,
        url: url.trim(),
        quote,
        capturedAt: new Date().toISOString(),
      };
      const created = await createWorkspaceDocumentFromContent(
        rootPath,
        '',
        title,
        createResearchNote(title, source),
      );
      setWebOpen(false);
      await knowledge.refresh();
      await onCreated(created.node);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-auto p-4 text-xs"
      data-testid="workspace-research-panel"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-2"
          onClick={() => setWebOpen(true)}
        >
          记录网页摘录
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-2"
          onClick={onReadPdf}
        >
          阅读 PDF 并摘录
        </button>
      </div>
      <p className="mb-3 text-muted-foreground">
        选择资料后准备研究问题。引用卡片保留本次读取的版本；资料更新后会提示重新核对。
      </p>
      <input
        aria-label="检索研究资料"
        className="mb-3 h-9 w-full rounded-md border bg-background px-3"
        placeholder="检索资料，可使用 path:、tag:、prop:"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setMatches(null);
        }}
      />
      <div className="mb-4 max-h-64 overflow-auto rounded-md border border-border/60">
        {candidates.map((document) => (
          <label
            key={document.relativePath}
            className="flex items-start gap-2 border-b border-border/30 px-3 py-2"
          >
            <input
              type="checkbox"
              checked={Object.hasOwn(selected, document.relativePath)}
              disabled={
                !Object.hasOwn(selected, document.relativePath) &&
                Object.keys(selected).length >= 8
              }
              onChange={(event) =>
                setSelected((selected) => {
                  const next = { ...selected };
                  if (event.target.checked)
                    next[document.relativePath] = document.fingerprint;
                  else delete next[document.relativePath];
                  return next;
                })
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{document.title}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {document.relativePath}
              </span>
            </span>
            {selected[document.relativePath] &&
            selected[document.relativePath] !== document.fingerprint ? (
              <span className="text-amber-600">已更新</span>
            ) : null}
          </label>
        ))}
      </div>
      <textarea
        aria-label="研究问题"
        className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
        placeholder="希望依据这些资料研究什么？"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-muted-foreground">
          已选 {Object.keys(selected).length} / 8 篇
        </span>
        <button
          type="button"
          disabled={busy || knowledge.status !== 'ready'}
          className="rounded-md bg-primary px-3 py-2 text-primary-foreground"
          onClick={() => void prepare()}
        >
          {busy ? '正在核对资料…' : '加入 AI 输入框'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      ) : null}
      {evidence.length ? (
        <section className="mt-5 space-y-2">
          <p>本次研究的来源</p>
          {evidence.map((source) => {
            const current = knowledge.documents.find(
              (document) => document.relativePath === source.relativePath,
            );
            return (
              <button
                key={source.evidenceId ?? source.relativePath}
                type="button"
                className="block w-full rounded-md border border-border/60 p-3 text-left"
                onClick={() =>
                  onOpen({
                    relativePath: source.relativePath,
                    line: source.line,
                    fingerprint: source.fingerprint,
                  })
                }
              >
                <span>{source.title}</span>
                {!current || current.fingerprint !== source.fingerprint ? (
                  <span className="ml-2 text-amber-600">
                    来源已变化，请重新核对
                  </span>
                ) : null}
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {source.relativePath} · L{source.line}
                  {source.endLine ? `–${source.endLine}` : ''} ·{' '}
                  {source.retrieval === 'no-match'
                    ? '未匹配问题，仅供浏览'
                    : '关键词匹配 · 事实待核实'}
                </span>
                <span className="mt-2 line-clamp-4 block whitespace-pre-wrap text-xs text-muted-foreground">
                  {source.excerpt}
                </span>
              </button>
            );
          })}
        </section>
      ) : null}
      <Dialog open={webOpen} onOpenChange={setWebOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>记录网页摘录</DialogTitle>
            <DialogDescription>
              粘贴原文及来源地址，保存后可从笔记返回网页。
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="来源网页地址"
            className="rounded-md border bg-background p-2 text-sm"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <input
            aria-label="摘录笔记标题"
            className="rounded-md border bg-background p-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            aria-label="网页原文摘录"
            className="min-h-40 rounded-md border bg-background p-2 text-sm"
            placeholder="粘贴需要保留的原文"
            value={quote}
            onChange={(event) => setQuote(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            onClick={() => void captureWeb()}
          >
            保存摘录笔记
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PdfResearchDialog({
  rootPath,
  request,
  onClose,
  onCreated,
}: {
  rootPath: string;
  request: PdfSourceRequest | 'file' | null;
  onClose: () => void;
  onCreated: (node: WorkspaceNode) => Promise<void> | void;
}) {
  const [loaded, setLoaded] = React.useState<{
    id: string;
    bytes: Uint8Array;
    name: string;
    file?: File;
  } | null>(null);
  const [quote, setQuote] = React.useState({ text: '', page: 1 });
  const [title, setTitle] = React.useState('阅读摘录');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const createdRef = React.useRef<CreatedMarkdownDocument | null>(null);
  const [hasCreated, setHasCreated] = React.useState(false);
  const [sourceChanged, setSourceChanged] = React.useState(false);
  React.useEffect(() => {
    if (!request || request === 'file') return;
    let active = true;
    void (async () => {
      try {
        const source = request.source.split(/[?#]/)[0];
        const id = getWorkspaceAssetIdFromReference(source);
        const asset = id
          ? await readWorkspaceAssetData(rootPath, id)
          : await readDocumentAssetData(rootPath, request.documentPath, source);
        const bytes = Uint8Array.from(atob(asset.base64Data), (character) =>
          character.charCodeAt(0),
        );
        assertResearchPdf(bytes);
        const changed = request.fingerprint
          ? request.fingerprint !== (await contentFingerprint(bytes))
          : false;
        if (active) {
          setSourceChanged(changed);
          setLoaded({ id: crypto.randomUUID(), bytes, name: asset.name });
          setTitle(`${asset.name.replace(/\.pdf$/i, '')} 摘录`);
        }
      } catch (error) {
        if (active) setError(String(error));
      }
    })();
    return () => {
      active = false;
    };
  }, [request, rootPath]);
  async function selectFile(file: File) {
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error('PDF 超过 50 MB 阅读上限');
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertResearchPdf(bytes);
      setLoaded({ id: crypto.randomUUID(), bytes, name: file.name, file });
      setQuote({ text: '', page: 1 });
      setTitle(`${file.name.replace(/\.pdf$/i, '')} 摘录`);
      setError(null);
    } catch (error) {
      setError(String(error));
    }
  }
  async function save() {
    if (!loaded || !quote.text.trim()) {
      setError('请先在 PDF 中选择文字，或填写摘录');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const capturedAt = new Date().toISOString();
      const fingerprint = await contentFingerprint(loaded.bytes);
      if (request && request !== 'file') {
        const reference = researchSourceReference(request.source, quote.page);
        const markdown = createResearchNote(title, {
          type: 'pdf',
          title: loaded.name,
          quote: quote.text,
          capturedAt,
          reference,
          page: quote.page,
          fingerprint,
        });
        const created = await createWorkspaceDocumentFromContent(
          rootPath,
          '',
          title,
          markdown,
          request.documentPath,
        );
        onClose();
        await onCreated(created.node);
      } else {
        if (!createdRef.current)
          createdRef.current = await createWorkspaceDocumentFromContent(
            rootPath,
            '',
            title,
            createResearchNote(title, {
              type: 'pdf',
              title: loaded.name,
              quote: quote.text,
              capturedAt,
              page: quote.page,
              fingerprint,
            }),
          );
        const created = createdRef.current;
        setHasCreated(true);
        const parts: string[] = [];
        for (let offset = 0; offset < loaded.bytes.length; offset += 32768)
          parts.push(
            String.fromCharCode(
              ...loaded.bytes.subarray(offset, offset + 32768),
            ),
          );
        const stored = await storeDocumentAsset(
          rootPath,
          created.node.absolutePath,
          {
            kind: 'file',
            sourceType: 'file',
            value: btoa(parts.join('')),
            fileName: loaded.name,
            mediaType: 'application/pdf',
          },
        );
        const markdown = createResearchNote(title, {
          type: 'pdf',
          title: loaded.name,
          quote: quote.text,
          capturedAt,
          page: quote.page,
          fingerprint,
          reference: researchSourceReference(stored.src, quote.page),
        });
        await saveMarkdownDocument(
          rootPath,
          created.node.absolutePath,
          markdown,
          created.content.modifiedAt,
          created.content.content,
        );
        onClose();
        await onCreated(created.node);
      }
    } catch (error) {
      setError(
        `${String(error)}${createdRef.current ? '；已创建的摘录仍保留，可重试保存附件。' : ''}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="flex h-[92vh] w-[calc(100vw-2rem)] max-w-none flex-col sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>PDF 阅读与摘录</DialogTitle>
          <DialogDescription>
            选择 PDF 文字后记录原文和页码，保存为可追溯的 Markdown 笔记。
          </DialogDescription>
        </DialogHeader>
        {sourceChanged ? (
          <p className="text-xs text-amber-600">
            来源 PDF 已变化，请重新核对页码与摘录。
          </p>
        ) : null}
        {request === 'file' ? (
          <input
            aria-label="选择研究 PDF"
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy || hasCreated}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void selectFile(file);
            }}
          />
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
          <div className="flex min-h-40 min-w-0 flex-1 overflow-hidden rounded-md border">
            {loaded ? (
              <PdfResearchReader
                key={loaded.id}
                bytes={loaded.bytes}
                initialPage={request && request !== 'file' ? request.page : 1}
                onQuote={setQuote}
              />
            ) : (
              <p className="m-auto text-sm text-muted-foreground">
                {request === 'file' ? '选择一个 PDF 开始阅读' : '正在读取 PDF…'}
              </p>
            )}
          </div>
          <div className="flex max-h-[45%] w-full shrink-0 flex-col gap-3 md:max-h-none md:w-72">
            <input
              aria-label="PDF 摘录标题"
              className="rounded-md border bg-background p-2 text-sm"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              摘录来自第 {quote.page} 页
            </p>
            <textarea
              aria-label="PDF 原文摘录"
              className="min-h-32 flex-1 rounded-md border bg-background p-2 text-sm"
              value={quote.text}
              onChange={(event) =>
                setQuote({ ...quote, text: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              扫描版 PDF 可先通过现有 PDF 导入执行 OCR，再整理为笔记。
            </p>
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !loaded}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              onClick={() => void save()}
            >
              {busy ? '正在保存…' : '保存摘录笔记'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

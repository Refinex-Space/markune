'use client';
import * as React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function PdfResearchReader({
  bytes,
  initialPage = 1,
  onQuote,
}: {
  bytes: Uint8Array;
  initialPage?: number;
  onQuote: (quote: { text: string; page: number }) => void;
}) {
  const [pdf, setPdf] = React.useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = React.useState(initialPage);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [passwordDraft, setPasswordDraft] = React.useState('');
  const [password, setPassword] = React.useState<string | undefined>();
  const [width, setWidth] = React.useState(800);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const renderedPageRef = React.useRef<number | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const textRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!scrollRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    renderedPageRef.current = null;
    let active = true;
    let destroy: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        if (bytes.length > 50 * 1024 * 1024)
          throw new Error('PDF 超过 50 MB 阅读上限');
        const pdfjs = await import('pdfjs-dist');
        if (!active) return;
        setPdf(null);
        setLoading(true);
        setError(null);
        const runtime = (path: string) =>
          new URL(`/import-runtime/${path}`, document.baseURI).toString();
        pdfjs.GlobalWorkerOptions.workerSrc = runtime('pdf.worker.min.mjs');
        const task = pdfjs.getDocument({
          data: bytes.slice(),
          password,
          cMapPacked: true,
          cMapUrl: runtime('cmaps/'),
          standardFontDataUrl: runtime('standard_fonts/'),
          wasmUrl: runtime('pdfjs-wasm/'),
          disableAutoFetch: true,
        });
        destroy = () => task.destroy();
        const pdf = await task.promise;
        if (pdf.numPages > 300) {
          await task.destroy();
          throw new Error('PDF 超过 300 页，请拆分后阅读');
        }
        if (active) {
          setPdf(pdf);
          setPage(Math.max(1, Math.min(initialPage, pdf.numPages)));
          setError(null);
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error && error.name === 'PasswordException'
              ? 'PDF 需要密码'
              : String(error),
          );
      }
    })();
    return () => {
      active = false;
      void destroy?.();
    };
  }, [bytes, password, initialPage]);
  React.useEffect(() => {
    if (!pdf) return;
    let active = true;
    let cancel: (() => void) | undefined;
    void (async () => {
      setLoading(true);
      renderedPageRef.current = null;
      try {
        const pdfjs = await import('pdfjs-dist');
        const current = await pdf.getPage(page);
        if (!active || !canvasRef.current || !textRef.current) return;
        const original = current.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          Math.max(200, width - 24) / original.width,
          1600 / original.height,
        );
        const viewport = current.getViewport({ scale });
        const canvas = canvasRef.current;
        const container = textRef.current;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * pixelRatio);
        canvas.height = Math.ceil(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        container.replaceChildren();
        container.style.setProperty(
          '--total-scale-factor',
          String(scale * current.userUnit),
        );
        const textContent = await current.getTextContent();
        if (!active) return;
        const render = current.render({
          canvas,
          viewport,
          transform:
            pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        const layer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container,
          viewport,
        });
        cancel = () => {
          render.cancel();
          layer.cancel();
        };
        await Promise.all([render.promise, layer.render()]);
        if (active) {
          renderedPageRef.current = page;
          setLoading(false);
          setError(null);
        }
      } catch (error) {
        if (active) {
          setLoading(false);
          setError(String(error));
        }
      }
    })();
    return () => {
      active = false;
      cancel?.();
    };
  }, [pdf, page, width]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-border/50 p-2 text-xs">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => {
            setPage((page) => page - 1);
          }}
        >
          上一页
        </button>
        <label>
          第{' '}
          <input
            aria-label="PDF 页码"
            className="w-14 rounded border bg-background px-1 py-0.5 text-center"
            type="number"
            min={1}
            max={pdf?.numPages ?? 1}
            value={page}
            onChange={(event) => {
              setPage(
                Math.max(
                  1,
                  Math.min(
                    Math.trunc(Number(event.target.value)) || 1,
                    pdf?.numPages ?? 1,
                  ),
                ),
              );
            }}
          />{' '}
          / {pdf?.numPages ?? '…'} 页
        </label>
        <button
          type="button"
          disabled={!pdf || page >= pdf.numPages}
          onClick={() => {
            setPage((page) => page + 1);
          }}
        >
          下一页
        </button>
      </div>
      {error ? (
        <div className="p-3 text-xs text-destructive">
          {error}
          {error === 'PDF 需要密码' ? (
            <div className="mt-2 flex gap-2">
              <input
                aria-label="PDF 密码"
                type="password"
                className="rounded border bg-background p-2"
                value={passwordDraft}
                onChange={(event) => setPasswordDraft(event.target.value)}
              />
              <button type="button" onClick={() => setPassword(passwordDraft)}>
                解锁
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3"
      >
        <div className="relative mx-auto w-fit bg-white shadow-sm">
          <canvas ref={canvasRef} className="block" />
          <div
            ref={textRef}
            className="markune-pdf-text-layer"
            style={{ pointerEvents: loading ? 'none' : undefined }}
            onMouseUp={() => {
              if (loading || renderedPageRef.current !== page) return;
              const selection = window.getSelection();
              if (
                selection?.rangeCount &&
                textRef.current?.contains(
                  selection.getRangeAt(0).commonAncestorContainer,
                )
              ) {
                const text = selection.toString().trim();
                if (text) onQuote({ text, page });
              }
            }}
          />
        </div>
        {loading && !error ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            正在渲染 PDF…
          </p>
        ) : null}
      </div>
      <style>{`.markune-pdf-text-layer{position:absolute;inset:0;overflow:hidden;line-height:1;text-align:initial;transform-origin:0 0;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size));text-size-adjust:none}.markune-pdf-text-layer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0;user-select:text}.markune-pdf-text-layer>:not(.markedContent),.markune-pdf-text-layer .markedContent span:not(.markedContent){--font-height:0;font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}.markune-pdf-text-layer .markedContent{display:contents}.markune-pdf-text-layer ::selection{background:rgba(250,204,21,.45)}`}</style>
    </div>
  );
}

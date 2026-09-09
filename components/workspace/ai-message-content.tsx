'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { AiMessageImage } from './ai-message-image';
import { AiCodeBlock } from './ai-code-block';
import { splitAiMarkdownStream } from './ai-markdown-stream';
import { openUrlInDefaultBrowser, readMarkdownDocument } from './workspace-api';
import { contentFingerprint } from './research-notes';
import { useAiContentContext } from './ai-content-context';
import { resolveAiReference, safeAiUrl } from './ai-citation-router';

const aiMarkdownComponents: Components = {
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={cn(
        'rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.9em]',
        className,
      )}
    >
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-base font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-[15px] font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold">{children}</h3>
  ),
  hr: () => <hr className="my-4 border-border/70" />,
  img: ({ src, alt }) => (
    <AiMessageImage src={typeof src === 'string' ? src : undefined} alt={alt} />
  ),
  li: ({ children, id }) => (
    <li id={id} className="my-0.5 pl-0.5">
      {children}
    </li>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="my-2 ml-5 list-decimal space-y-0.5">
      {children}
    </ol>
  ),
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  pre: ({ children }) => <AiCodeBlock>{children}</AiCodeBlock>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  td: ({ children }) => (
    <td className="border-t border-border/60 px-2 py-1.5">{children}</td>
  ),
  th: ({ children }) => (
    <th className="bg-muted/45 px-2 py-1.5 font-medium">{children}</th>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>
  ),
};

interface HtmlNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}
function prefixAnchors(options: { prefix: string }) {
  return (raw: unknown) => {
    const text = (node: HtmlNode): string =>
      node.value ?? node.children?.map(text).join('') ?? '';
    const ids = new Set<string>();
    const visit = (node: HtmlNode) => {
      const properties = node.properties ?? (node.properties = {});
      if (/^h[1-6]$/.test(node.tagName ?? '') && !properties.id) {
        const base =
          text(node)
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N} _-]/gu, '')
            .replace(/\s+/g, '-') || 'heading';
        let id = base;
        let n = 1;
        while (ids.has(id)) id = `${base}-${n++}`;
        ids.add(id);
        properties.id = id;
      }
      if (typeof properties.id === 'string')
        properties.id = options.prefix + properties.id;
      if (
        typeof properties.href === 'string' &&
        properties.href.startsWith('#')
      )
        properties.href = '#' + options.prefix + properties.href.slice(1);
      for (const key of ['ariaDescribedBy', 'ariaLabelledBy'])
        if (Array.isArray(properties[key]))
          properties[key] = (properties[key] as string[]).map(
            (id) => options.prefix + id,
          );
      node.children?.forEach(visit);
    };
    visit(raw as HtmlNode);
  };
}
export const AiMessageContent = React.memo(function AiMessageContent({
  markdown,
  streaming = false,
}: {
  markdown: string;
  streaming?: boolean;
}) {
  const context = useAiContentContext();
  const contextRef = React.useRef(context);
  React.useLayoutEffect(() => {
    contextRef.current = context;
  }, [context]);
  const prefix = React.useId().replace(/:/g, '') + '-';
  const [error, setError] = React.useState<string | null>(null);
  const components = React.useMemo<Components>(
    () => ({
      ...aiMarkdownComponents,
      pre: ({ children }) => (
        <AiCodeBlock streaming={streaming}>{children}</AiCodeBlock>
      ),
      h2: ({ children, id }) => (
        <h2 id={id} className="mb-2 mt-4 text-[15px] font-semibold">
          {id?.endsWith('footnote-label') ? '参考资料' : children}
        </h2>
      ),
      h1: ({ children, id }) => (
        <h1 id={id} className="mb-2 mt-4 text-base font-semibold">
          {children}
        </h1>
      ),
      h3: ({ children, id }) => (
        <h3 id={id} className="mb-1.5 mt-3 text-sm font-semibold">
          {children}
        </h3>
      ),
      a: ({ children, href, node: _node, ...props }) => {
        void _node;
        return (
          <a
            {...props}
            href={href}
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            onClick={(event) => {
              event.preventDefault();
              void (async () => {
                try {
                  const context = contextRef.current;
                  let warning: string | null = null;
                  const target = resolveAiReference(
                    href ?? '',
                    context.root,
                    context.sourceDocument,
                  );
                  if (target.kind === 'web')
                    await openUrlInDefaultBrowser(target.url);
                  else if (target.kind === 'anchor') {
                    const element = document.getElementById(target.hash);
                    if (!element) throw new Error('未找到这处引用位置');
                    element.scrollIntoView({ block: 'center' });
                    element.setAttribute('tabindex', '-1');
                    element.focus({ preventScroll: true });
                  } else if (target.kind === 'document') {
                    if (target.fingerprint && context.root) {
                      const source = await readMarkdownDocument(
                        context.root,
                        `${context.root}/${target.relativePath}`,
                      );
                      if (
                        (await contentFingerprint(source.content)) !==
                        target.fingerprint
                      )
                        warning =
                          '来源已变化，当前内容可能不再支持原结论，请重新核对';
                    }
                    if (!context.openDocument)
                      throw new Error('当前视图无法打开本地文档');
                    await context.openDocument(target);
                  } else {
                    if (!context.openResource)
                      throw new Error('当前视图无法预览该文件');
                    await context.openResource(target);
                  }
                  setError(warning);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              })();
            }}
          >
            {children}
          </a>
        );
      },
    }),
    [streaming],
  );
  const parts = streaming
    ? splitAiMarkdownStream(markdown)
    : { stable: markdown, tail: '' };
  return (
    <div className="ai-message-content min-w-0 break-words">
      <StableMarkdown
        markdown={parts.stable}
        components={components}
        prefix={prefix}
      />
      {parts.tail ? (
        <div
          className="whitespace-pre-wrap break-words"
          data-streaming-tail="true"
        >
          {parts.tail}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
});

function boundMath() {
  return (tree: unknown) => {
    const visit = (node: HtmlNode) => {
      if (
        (node.type === 'math' || node.type === 'inlineMath') &&
        (node.value?.length ?? 0) > 8192
      ) {
        node.type = 'code';
        (node as HtmlNode & { lang?: string }).lang = 'tex';
      }
      node.children?.forEach(visit);
    };
    visit(tree as HtmlNode);
  };
}

const StableMarkdown = React.memo(function StableMarkdown({
  markdown,
  components,
  prefix,
}: {
  markdown: string;
  components: Components;
  prefix: string;
}) {
  return (
    <ReactMarkdown
      remarkRehypeOptions={{
        footnoteLabel: '参考资料',
        footnoteBackLabel: '返回引用',
      }}
      components={components}
      remarkPlugins={[remarkGfm, remarkMath, boundMath]}
      rehypePlugins={[
        [
          rehypeKatex,
          { trust: false, strict: 'warn', maxExpand: 1000, maxSize: 20 },
        ],
        [prefixAnchors, { prefix }],
      ]}
      urlTransform={safeAiUrl}
      skipHtml
    >
      {markdown}
    </ReactMarkdown>
  );
});

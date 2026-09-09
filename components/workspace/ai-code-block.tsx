'use client';
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { BundledLanguage, ThemedToken } from 'shiki';
const LANGUAGES = new Set([
  'javascript',
  'typescript',
  'tsx',
  'jsx',
  'json',
  'jsonc',
  'python',
  'java',
  'bash',
  'shellscript',
  'sql',
  'markdown',
  'yaml',
  'rust',
  'html',
  'css',
  'xml',
  'go',
  'c',
  'cpp',
  'csharp',
  'diff',
  'toml',
]);
const aliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'shellscript',
  md: 'markdown',
  yml: 'yaml',
  rs: 'rust',
};
let mermaidQueue: Promise<unknown> = Promise.resolve();
function textOf(node: React.ReactNode): string {
  return typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : React.isValidElement<{ children?: React.ReactNode }>(node)
        ? textOf(node.props.children)
        : '';
}

export function AiCodeBlock({
  children,
  streaming = false,
}: {
  children?: React.ReactNode;
  streaming?: boolean;
}) {
  const text = textOf(children).replace(/\n$/, '');
  const className = React.isValidElement<{ className?: string }>(children)
    ? children.props.className
    : '';
  const rawLanguage =
    /language-([^\s]+)/.exec(className ?? '')?.[1]?.toLowerCase() ?? '';
  const language = aliases[rawLanguage] ?? rawLanguage;
  const [copied, setCopied] = React.useState(false);
  const [tokens, setTokens] = React.useState<{
    text: string;
    language: string;
    lines: ThemedToken[][];
  } | null>(null);
  const [near, setNear] = React.useState(false);
  const root = React.useRef<HTMLDivElement | null>(null);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  React.useEffect(() => {
    if (!root.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => () => clearTimeout(copyTimer.current), []);
  React.useEffect(() => {
    if (!near || !LANGUAGES.has(language) || text.length > 20_000) return;
    let active = true;
    const timer = setTimeout(
      () => {
        void import('shiki')
          .then((shiki) =>
            shiki.codeToTokens(text, {
              lang: language as BundledLanguage,
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: false,
            }),
          )
          .then((result) => {
            if (active) setTokens({ text, language, lines: result.tokens });
          })
          .catch(() => {});
      },
      streaming ? 120 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [language, near, streaming, text]);
  const colored =
    tokens?.text === text && tokens.language === language ? tokens.lines : null;
  return (
    <div
      ref={root}
      className="group/code relative my-3 rounded-lg border border-border/70 bg-muted/45"
    >
      <div className="flex min-h-8 items-center justify-between border-b border-border/40 px-3 text-[10px] text-muted-foreground">
        <span>{language || '文本'}</span>
        <button
          type="button"
          aria-label={copied ? '已复制代码' : '复制代码'}
          className="rounded p-1.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => {
                setCopied(true);
                clearTimeout(copyTimer.current);
                copyTimer.current = setTimeout(() => setCopied(false), 1200);
              })
              .catch(() => setCopied(false))
          }
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {language === 'mermaid' && near && !streaming ? (
        <AiMermaid definition={text} />
      ) : null}
      {language === 'mermaid' && !streaming ? (
        <details className="px-3 pb-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            图表源码
          </summary>
          <pre className="overflow-x-auto py-2 text-[11px] leading-5">
            <code>{text}</code>
          </pre>
        </details>
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-5">
          <code>
            {colored
              ? colored.map((line, index) => (
                  <React.Fragment key={index}>
                    {line.map((token, i) => (
                      <span
                        key={i}
                        className="ai-code-token"
                        style={token.htmlStyle as React.CSSProperties}
                      >
                        {token.content}
                      </span>
                    ))}
                    {index < colored.length - 1 ? '\n' : ''}
                  </React.Fragment>
                ))
              : text}
          </code>
        </pre>
      )}
    </div>
  );
}
function AiMermaid({ definition }: { definition: string }) {
  const { resolvedTheme } = useTheme();
  const id = 'ai-mermaid-' + React.useId().replace(/[^a-z0-9]/gi, '');
  const [result, setResult] = React.useState<{
    key: string;
    svg?: string;
    error?: string;
  } | null>(null);
  const key = `${resolvedTheme}:${definition}`;
  React.useEffect(() => {
    let active = true;
    const operation = mermaidQueue
      .catch(() => {})
      .then(async () => {
        try {
          if (
            definition.length > 30_000 ||
            definition.split(/[;\n]/).length > 240 ||
            /%%\s*\{|^\s*click\s|<\/?[A-Za-z]|\b(?:https?|file|data|javascript):|url\s*\(|@import|\b(?:img|icon)\s*:/im.test(
              definition,
            )
          )
            throw new Error('此图表包含不支持的指令或 HTML，请查看源码');
          const { default: mermaid } = await import('mermaid');
          if (!active) return;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            htmlLabels: false,
            theme: resolvedTheme === 'dark' ? 'dark' : 'default',
            maxTextSize: 30_000,
            maxEdges: 500,
            flowchart: { htmlLabels: false },
          });
          const rendered = await mermaid.render(id, definition);
          const parsed = new DOMParser().parseFromString(
            rendered.svg,
            'image/svg+xml',
          );
          if (
            parsed.querySelector(
              'parsererror,script,foreignObject,iframe,image,use[href^="http"]',
            )
          )
            throw new Error('图表内容不适合安全预览');
          for (const node of parsed.querySelectorAll('*'))
            for (const attribute of Array.from(node.attributes))
              if (
                /^on/i.test(attribute.name) ||
                (/href$/i.test(attribute.name) &&
                  !attribute.value.startsWith('#')) ||
                hasExternalCssUrl(attribute.value)
              )
                throw new Error('图表包含外部引用，已保留源码');
          for (const style of parsed.querySelectorAll('style'))
            if (
              /@import/i.test(style.textContent ?? '') ||
              hasExternalCssUrl(style.textContent ?? '')
            )
              throw new Error('图表包含外部样式，已保留源码');
          if (active) setResult({ key, svg: rendered.svg });
        } catch (error) {
          if (active)
            setResult({
              key,
              error:
                error instanceof Error &&
                [
                  '此图表包含不支持的指令或 HTML，请查看源码',
                  '图表内容不适合安全预览',
                  '图表包含外部引用，已保留源码',
                  '图表包含外部样式，已保留源码',
                ].includes(error.message)
                  ? error.message
                  : '无法安全渲染图表，请检查下方源码',
            });
        }
      });
    mermaidQueue = operation;
    return () => {
      active = false;
    };
  }, [definition, id, key, resolvedTheme]);
  return result?.key === key && result.svg ? (
    <div
      className="overflow-auto p-3 [&_svg]:h-auto [&_svg]:max-w-full"
      role="img"
      aria-label="Mermaid 图表"
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  ) : (
    <p className="px-3 py-2 text-xs text-muted-foreground">
      {result?.key === key ? result.error : '正在渲染图表…'}
    </p>
  );
}

function hasExternalCssUrl(value: string): boolean {
  return Array.from(value.matchAll(/url\(([^)]*)\)/gi)).some(
    (match) =>
      !match[1]
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .startsWith('#'),
  );
}

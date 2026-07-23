import type {
  DocumentExportFile,
  PageWidthMode,
  WorkspaceAssetData,
} from './workspace-types';
import { readWorkspaceAssetData } from './workspace-api';
import {
  extractWorkspaceAssetReferences,
  getWorkspaceAssetIdFromReference,
} from './workspace-local-assets';

export const EXPORT_STEM_PLACEHOLDER = '__MADORA_EXPORT_STEM__';

export interface PreparedDocumentAssets {
  allAssetFiles: DocumentExportFile[];
  htmlAssetFiles: DocumentExportFile[];
  portableMarkdown: string;
  renderMarkdown: string;
  warnings: string[];
}

export async function resolveDocumentExportMarkdown(options: {
  cachedMarkdown?: string;
  currentDocumentPath: string | null;
  documentPath: string;
  draftMarkdown?: string | null;
  readDisk: () => Promise<string>;
}) {
  if (
    options.documentPath === options.currentDocumentPath &&
    options.draftMarkdown !== null &&
    options.draftMarkdown !== undefined
  ) {
    return options.draftMarkdown;
  }

  if (options.cachedMarkdown !== undefined) {
    return options.cachedMarkdown;
  }

  return options.readDisk();
}

export function sanitizeExportFileStem(value: string, fallback: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim()
    .slice(0, 120);
  const fallbackStem = fallback.replace(/\.md$/iu, '').trim() || '未命名文档';
  const candidate = sanitized || fallbackStem;

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(candidate)
    ? `_${candidate}`
    : candidate;
}

export async function prepareDocumentAssets(
  rootPath: string,
  markdown: string,
  readAsset: (
    rootPath: string,
    assetId: string,
  ) => Promise<WorkspaceAssetData> = readWorkspaceAssetData,
): Promise<PreparedDocumentAssets> {
  const references = extractWorkspaceAssetReferences(markdown);
  const replacementsForMarkdown = new Map<string, string>();
  const replacementsForRender = new Map<string, string>();
  const allAssetFiles: DocumentExportFile[] = [];
  const htmlAssetFiles: DocumentExportFile[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();

  for (const reference of references) {
    const assetId = getWorkspaceAssetIdFromReference(reference);

    if (!assetId) {
      continue;
    }

    try {
      const asset = await readAsset(rootPath, assetId);
      const assetName = makeUniqueAssetName(asset.name || asset.id, usedNames);
      const relativeUrl = `./${EXPORT_STEM_PLACEHOLDER}.assets/${encodePathSegment(assetName)}`;
      const file: DocumentExportFile = {
        base64Data: asset.base64Data,
        relativePath: assetName,
        role: 'asset',
      };

      allAssetFiles.push(file);
      replacementsForMarkdown.set(reference, relativeUrl);

      if (asset.mediaType.startsWith('image/')) {
        replacementsForRender.set(
          reference,
          `data:${asset.mediaType};base64,${asset.base64Data}`,
        );
      } else {
        replacementsForRender.set(reference, relativeUrl);
        htmlAssetFiles.push(file);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      warnings.push(`资源 ${assetId} 未能导出：${reason}`);
    }
  }

  return {
    allAssetFiles,
    htmlAssetFiles,
    portableMarkdown: replaceMappedValues(markdown, replacementsForMarkdown),
    renderMarkdown: replaceMappedValues(markdown, replacementsForRender),
    warnings,
  };
}

export function createPrimaryExportFile(
  relativePath: string,
  value: string | Uint8Array,
): DocumentExportFile {
  return {
    base64Data:
      typeof value === 'string'
        ? utf8ToBase64(value)
        : bytesToBase64(value),
    relativePath,
    role: 'primary',
  };
}

export function sanitizeMarkweaveSnapshot(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;

  for (const checkbox of clone.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    const marker = document.createElement('span');

    marker.className = 'madora-export-task-marker';
    marker.textContent = checkbox.checked ? '☑' : '☐';
    checkbox.replaceWith(marker);
  }

  clone
    .querySelectorAll(
      [
        'script',
        'noscript',
        'template',
        'iframe',
        'input',
        'textarea',
        'select',
        '[role="toolbar"]',
        '[data-floating-ui-portal]',
        '[data-radix-popper-content-wrapper]',
        '[data-toc]',
        '.markweave-inner-toc',
        '.markweave-codeblock-overlay',
        '.markweave-mermaid-tabs',
        '.ProseMirror-menubar',
        '.tippy-box',
        'button',
      ].join(','),
    )
    .forEach((element) => element.remove());

  clone.removeAttribute('contenteditable');
  clone.removeAttribute('data-markweave-inner-toc');
  clone.removeAttribute('data-markweave-inner-toc-placement');
  clone.removeAttribute('data-markweave-large-document');
  clone.removeAttribute('data-markweave-large-document-loading');
  clone.style.removeProperty('--markweave-inner-toc-right');
  for (const element of clone.querySelectorAll<HTMLElement>('*')) {
    element.removeAttribute('contenteditable');
    element.removeAttribute('data-markweave-large-document');
    element.removeAttribute('data-markweave-large-document-loading');
    element.removeAttribute('draggable');
    element.removeAttribute('spellcheck');

    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.name.startsWith('data-editor-') ||
        attribute.name.startsWith('data-radix-') ||
        attribute.name.startsWith('on')
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const link of clone.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href')?.trim() ?? '';

    if (/^javascript:/iu.test(href)) {
      link.removeAttribute('href');
    } else if (/^https?:/iu.test(href)) {
      link.rel = 'noopener noreferrer';
    }
  }

  for (const image of clone.querySelectorAll<HTMLImageElement>('img')) {
    if (image.dataset.exportMissing === 'true') {
      const placeholder = document.createElement('span');

      placeholder.className = 'madora-export-missing-resource';
      placeholder.textContent = `[图片不可用：${
        image.getAttribute('alt') || image.getAttribute('src') || '未知图片'
      }]`;
      image.replaceWith(placeholder);
      continue;
    }

    if (!image.getAttribute('alt')) {
      image.alt = '文档图片';
    }

    image.removeAttribute('loading');
  }

  clone.classList.add('madora-export-document');
  return clone;
}

export async function createStaticExportHtml(options: {
  content: HTMLElement;
  pageWidthMode: PageWidthMode;
  theme: 'dark' | 'light';
  title: string;
  forPrint?: boolean;
}) {
  const warnings: string[] = [];
  const missingResourceCount = options.content.querySelectorAll(
    '.madora-export-missing-resource',
  ).length;
  if (missingResourceCount > 0) {
    warnings.push(`${missingResourceCount} 个图片资源不可用，已输出占位内容。`);
  }
  const css = await collectApplicationCss(warnings);
  const rootVariables = collectRootVariables();
  const printCss = options.forPrint ? PROFESSIONAL_PRINT_CSS : '';
  const html = `<!doctype html>
<html class="${options.theme}" data-page-width-mode="${options.pageWidthMode}" lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; media-src data: https: http:; font-src data:; style-src 'unsafe-inline'; connect-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(options.title)}</title>
<style>${css}\n:root{${rootVariables}}\n${BASE_EXPORT_CSS}\n${printCss}</style>
</head>
<body>${options.content.outerHTML}</body>
</html>`;

  return { html, warnings };
}

export async function waitForExportRender(
  root: HTMLElement,
  timeoutMs = 15_000,
) {
  const startedAt = performance.now();
  let timedOut = false;

  if ('fonts' in document) {
    await Promise.race([
      document.fonts.ready,
      delay(Math.max(0, timeoutMs - (performance.now() - startedAt))).then(
        () => {
          timedOut = true;
        },
      ),
    ]);
  }

  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (image) => {
      const sourceStatus = await waitForExportImageSource(
        image,
        Math.max(0, timeoutMs - (performance.now() - startedAt)),
      );
      if (sourceStatus === 'timeout') {
        timedOut = true;
      }
      if (sourceStatus !== 'ready') {
        return;
      }

      if (image.complete) {
        try {
          await image.decode?.();
        } catch {
          // Broken images are converted into recognizable placeholders below.
        }
        return;
      }

      await Promise.race([
        new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }),
        delay(Math.max(0, timeoutMs - (performance.now() - startedAt))).then(
          () => {
            timedOut = true;
          },
        ),
      ]);
    }),
  );

  for (const image of images) {
    if (
      !image.getAttribute('src') ||
      !image.complete ||
      image.naturalWidth === 0
    ) {
      image.dataset.exportMissing = 'true';
    }
  }

  const remainingMs = Math.max(0, timeoutMs - (performance.now() - startedAt));
  if (remainingMs === 0) {
    timedOut = true;
  } else {
    const stable = await waitForMutationQuietPeriod(root, 450, remainingMs);
    timedOut ||= !stable;
  }

  return timedOut;
}

type ExportImageSourceStatus = 'missing' | 'ready' | 'timeout';

function waitForExportImageSource(
  image: HTMLImageElement,
  timeoutMs: number,
): Promise<ExportImageSourceStatus> {
  const mediaNode = image.closest<HTMLElement>('[data-markweave-lightweight-image]');
  const currentStatus = readExportImageSourceStatus(image, mediaNode);

  if (currentStatus || timeoutMs <= 0) {
    return Promise.resolve(currentStatus ?? 'timeout');
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const status = readExportImageSourceStatus(image, mediaNode);

      if (status) {
        finish(status);
      }
    });
    const timeout = window.setTimeout(() => finish('timeout'), timeoutMs);

    observer.observe(image, { attributes: true, attributeFilter: ['src'] });
    if (mediaNode) {
      observer.observe(mediaNode, {
        attributes: true,
        attributeFilter: ['data-media-state'],
      });
    }

    function finish(status: ExportImageSourceStatus) {
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(status);
    }
  });
}

function readExportImageSourceStatus(
  image: HTMLImageElement,
  mediaNode: HTMLElement | null,
): ExportImageSourceStatus | null {
  if (image.getAttribute('src')) {
    return 'ready';
  }

  return mediaNode?.dataset.mediaState === 'missing' ||
    mediaNode?.dataset.mediaState === 'unreadable'
    ? 'missing'
    : null;
}

function makeUniqueAssetName(value: string, usedNames: Set<string>) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_')
    .replace(/[. ]+$/gu, '')
    .trim() || 'asset';
  const dotIndex = cleaned.lastIndexOf('.');
  const base = dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned;
  const extension = dotIndex > 0 ? cleaned.slice(dotIndex) : '';
  let candidate = `${base}${extension}`;
  let suffix = 1;

  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} (${suffix})${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

function replaceMappedValues(
  value: string,
  replacements: ReadonlyMap<string, string>,
) {
  let next = value;

  for (const [from, to] of Array.from(replacements.entries()).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    next = next.split(from).join(to);
  }

  return next;
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toLocaleUpperCase()}`,
  );
}

async function collectApplicationCss(warnings: string[]) {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');

      chunks.push(await inlineSameOriginCssResources(css, sheet.href, warnings));
    } catch {
      warnings.push(`样式表 ${sheet.href ?? 'inline'} 无法读取，已跳过。`);
    }
  }

  return chunks.join('\n');
}

async function inlineSameOriginCssResources(
  css: string,
  styleSheetUrl: string | null,
  warnings: string[],
) {
  const matches = Array.from(css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/gu));
  const replacements = new Map<string, string>();

  await Promise.all(
    matches.map(async (match) => {
      const source = match[2];

      if (!source || /^(?:data:|blob:|#)/iu.test(source)) {
        return;
      }

      try {
        const absoluteUrl = new URL(
          source,
          styleSheetUrl ?? document.baseURI,
        );

        if (absoluteUrl.origin !== window.location.origin) {
          return;
        }

        const response = await fetch(absoluteUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        replacements.set(source, await blobToDataUrl(blob));
      } catch (error) {
        warnings.push(
          `本地样式资源 ${source} 无法内联：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }),
  );

  return replaceMappedValues(css, replacements);
}

function collectRootVariables() {
  const computed = getComputedStyle(document.documentElement);
  const variables: string[] = [];

  for (const property of Array.from(computed)) {
    if (property.startsWith('--')) {
      variables.push(`${property}:${computed.getPropertyValue(property)};`);
    }
  }

  return `${variables.join('')}${document.documentElement.getAttribute('style') ?? ''}`;
}

function waitForMutationQuietPeriod(
  root: HTMLElement,
  quietMs: number,
  timeoutMs: number,
) {
  return new Promise<boolean>((resolve) => {
    let quietTimer = window.setTimeout(finishStable, quietMs);
    const timeoutTimer = window.setTimeout(finishTimeout, timeoutMs);
    const observer = new MutationObserver(() => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finishStable, quietMs);
    });

    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    function finishStable() {
      cleanup();
      resolve(true);
    }

    function finishTimeout() {
      cleanup();
      resolve(false);
    }

    function cleanup() {
      observer.disconnect();
      window.clearTimeout(quietTimer);
      window.clearTimeout(timeoutTimer);
    }
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function delay(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('资源编码失败。'));
    reader.onerror = () => reject(reader.error ?? new Error('资源读取失败。'));
    reader.readAsDataURL(blob);
  });
}

function utf8ToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function bytesToBase64(value: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

const BASE_EXPORT_CSS = `
html[data-page-width-mode="standard"]{--madora-export-content-max:64rem}
html[data-page-width-mode="wide"]{--madora-export-content-max:88rem}
html,body{margin:0;min-height:100%;background:var(--background);color:var(--foreground)}
body{font-family:var(--madora-document-font,var(--font-sans));line-height:1.75}
.madora-export-document{box-sizing:border-box;margin:0 auto;max-width:calc(var(--madora-export-content-max) + 128px);padding:48px 64px 80px}
.madora-export-document img,.madora-export-document svg{max-width:100%;height:auto}
.madora-export-document pre{overflow:auto}
.madora-export-document table{max-width:100%;border-collapse:collapse}
.madora-export-task-marker{display:inline-block;width:1.35em;color:var(--primary)}
@media(max-width:720px){.madora-export-document{padding:28px 22px 48px}}
`;

const PROFESSIONAL_PRINT_CSS = `
@page{size:A4;margin:18mm}
html,body{background:#fff!important;color:#171717!important}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5pt}
.madora-export-document{max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;color:#171717!important}
h1,h2,h3,h4,h5,h6{break-after:avoid-page;page-break-after:avoid;orphans:3;widows:3;color:#111!important}
p,li,blockquote{orphans:3;widows:3}
thead{display:table-header-group}
tr,img,figure,blockquote,.callout,[class*="callout"],[class*="admonition"]{break-inside:avoid;page-break-inside:avoid}
pre{white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid-page;border:1px solid #e5e7eb!important;background:#f7f7f8!important;color:#171717!important}
table{width:100%!important;table-layout:auto}
th,td{border-color:#d4d4d8!important}
a{color:#155eaa!important;text-decoration:none}
`;

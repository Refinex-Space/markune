const DRAWING_ID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ASSET_ID_SOURCE = '[0-9a-f]{64}';
const MARKWEAVE_CLIPBOARD_ASSET_PREFIX =
  'https://clipboard.markune.invalid/asset/';
const clipboardAssetPattern = new RegExp(
  `${MARKWEAVE_CLIPBOARD_ASSET_PREFIX.replaceAll('.', '\\.')}(${ASSET_ID_SOURCE})`,
  'gi',
);

const canonicalReferencePattern = new RegExp(
  `\\[!\\[((?:\\\\.|[^\\]])*)\\]\\((markune-asset:\\/\\/(${ASSET_ID_SOURCE}))\\)\\]\\((markune-drawing:\\/\\/(${DRAWING_ID_SOURCE}))\\)`,
  'gi',
);
const escapedReferencePattern = new RegExp(
  `\\\\\\[!\\\\\\[((?:\\\\.|[^\\]])*)\\\\\\]\\((markune-asset:\\/\\/(${ASSET_ID_SOURCE}))\\)\\\\\\]\\((markune-drawing:\\/\\/(${DRAWING_ID_SOURCE}))\\)`,
  'gi',
);
const projectedReferencePattern = new RegExp(
  `!\\[((?:\\\\.|[^\\]])*)\\]\\((markune-asset:\\/\\/${ASSET_ID_SOURCE})\\s+"(markune-drawing:\\/\\/(${DRAWING_ID_SOURCE}))"\\)`,
  'gi',
);

export interface DrawingMarkdownReferenceInput {
  assetId: string;
  drawingId: string;
  title: string;
}

interface ParsedDrawingMarkdownReference {
  alt: string;
  assetUrl: string;
  drawingUrl: string;
}

export function createDrawingMarkdownReference({
  assetId,
  drawingId,
  title,
}: DrawingMarkdownReferenceInput) {
  const normalizedAssetId = normalizeAssetId(assetId);
  const normalizedDrawingId = normalizeDrawingId(drawingId);
  const alt = escapeMarkdownImageAlt(title);

  return `[![${alt}](markune-asset://${normalizedAssetId})](markune-drawing://${normalizedDrawingId})`;
}

export function normalizeDrawingMarkdownReferences(markdown: string) {
  return markdown.replace(
    escapedReferencePattern,
    (_match, alt: string, assetUrl: string, _assetId: string, drawingUrl: string) =>
      `[![${alt}](${assetUrl})](${drawingUrl})`,
  );
}

export function projectDrawingMarkdownReferencesForEditor(markdown: string) {
  return normalizeDrawingMarkdownReferences(markdown).replace(
    canonicalReferencePattern,
    (_match, alt: string, assetUrl: string, _assetId: string, drawingUrl: string) =>
      `![${alt}](${assetUrl} "${drawingUrl}")`,
  );
}

export function restoreDrawingMarkdownReferencesFromEditor(markdown: string) {
  return markdown.replace(
    projectedReferencePattern,
    (_match, alt: string, assetUrl: string, drawingUrl: string) =>
      `[![${alt}](${assetUrl})](${drawingUrl})`,
  );
}

export function createDrawingMarkdownReferenceHtml(markdown: string) {
  const parsed = parseDrawingMarkdownReference(markdown);

  if (!parsed) {
    throw new Error('图稿 Markdown 引用格式无效。');
  }

  const assetId = parsed.assetUrl.slice('markune-asset://'.length);
  const clipboardAssetUrl = `${MARKWEAVE_CLIPBOARD_ASSET_PREFIX}${assetId}`;

  return `<a href="${escapeHtmlAttribute(parsed.drawingUrl)}"><img alt="${escapeHtmlAttribute(unescapeMarkdownImageAlt(parsed.alt))}" src="${clipboardAssetUrl}" title="${escapeHtmlAttribute(parsed.drawingUrl)}"></a>`;
}

export function normalizeDrawingClipboardAssetReferences(markdown: string) {
  return markdown.replace(
    clipboardAssetPattern,
    (_match, assetId: string) => `markune-asset://${assetId.toLowerCase()}`,
  );
}

export function getDrawingClipboardAssetReference(value: string) {
  const pattern = new RegExp(
    `^${MARKWEAVE_CLIPBOARD_ASSET_PREFIX.replaceAll('.', '\\.')}(${ASSET_ID_SOURCE})$`,
    'i',
  );
  const assetId = pattern.exec(value.trim())?.[1];

  return assetId ? `markune-asset://${assetId.toLowerCase()}` : null;
}

export function parseDrawingMarkdownUrl(value: string) {
  const pattern = new RegExp(
    `^markune-drawing:\\/\\/(${DRAWING_ID_SOURCE})$`,
    'i',
  );
  return pattern.exec(value)?.[1].toLowerCase() ?? null;
}

export async function writeDrawingMarkdownReferenceToClipboard(markdown: string) {
  const html = createDrawingMarkdownReferenceHtml(markdown);
  const clipboard = navigator.clipboard;

  if (clipboard.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
        }),
      ]);
      return;
    } catch {
      // Some desktop WebViews expose ClipboardItem but reject rich formats.
    }
  }

  await clipboard.writeText(markdown);
}

function parseDrawingMarkdownReference(
  markdown: string,
): ParsedDrawingMarkdownReference | null {
  const normalized = normalizeDrawingMarkdownReferences(markdown).trim();
  const exactPattern = new RegExp(`^(?:${canonicalReferencePattern.source})$`, 'i');
  const match = exactPattern.exec(normalized);

  if (!match) return null;

  return {
    alt: match[1],
    assetUrl: match[2],
    drawingUrl: match[4],
  };
}

function normalizeAssetId(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!new RegExp(`^${ASSET_ID_SOURCE}$`).test(normalized)) {
    throw new Error('图稿快照资产 ID 无效。');
  }

  return normalized;
}

function normalizeDrawingId(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!new RegExp(`^${DRAWING_ID_SOURCE}$`, 'i').test(normalized)) {
    throw new Error('图稿 ID 无效。');
  }

  return normalized;
}

function escapeMarkdownImageAlt(value: string) {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[[\]]/g, '\\$&');
}

function unescapeMarkdownImageAlt(value: string) {
  return value.replace(/\\([\\[\]])/g, '$1');
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

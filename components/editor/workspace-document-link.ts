// Resolves in-editor Markdown links that point at other workspace documents so
// the workspace shell can open them as tabs instead of letting Markweave fall
// back to window.open (which does nothing useful for a relative .md path inside
// the Tauri WebView). All helpers are pure and framework free. author: liyao

const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const MARKWEAVE_DOC_PREFIX = 'markweave://doc/';

export const OPEN_WORKSPACE_DOCUMENT_EVENT = 'markune:open-document';

export interface OpenWorkspaceDocumentDetail {
  relativePath: string;
  hash: string | null;
}

export interface ParsedInternalDocumentLink {
  /** Decoded link target; may be document-relative, root-absolute or a bare name. */
  target: string;
  hash: string | null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitHash(value: string): { path: string; hash: string | null } {
  const index = value.indexOf('#');

  if (index === -1) {
    return { path: value, hash: null };
  }

  const hash = value.slice(index + 1);

  return {
    path: value.slice(0, index),
    hash: hash.length > 0 ? safeDecode(hash) : null,
  };
}

/**
 * Classifies a raw href. Returns the internal document target, or `null` for
 * external links (http(s), mailto, custom protocols such as `markune-asset://`),
 * protocol-relative URLs and pure in-page anchors, none of which navigate to a
 * workspace document.
 */
export function parseInternalDocumentHref(
  rawHref: string,
): ParsedInternalDocumentLink | null {
  const href = rawHref.trim();

  if (!href) {
    return null;
  }

  // Markweave's [[wiki]] input rule stores links as markweave://doc/<encoded>.
  if (href.toLowerCase().startsWith(MARKWEAVE_DOC_PREFIX)) {
    const { path, hash } = splitHash(href.slice(MARKWEAVE_DOC_PREFIX.length));
    const target = safeDecode(path).trim();

    return target ? { target, hash } : null;
  }

  // Pure in-page anchor: stays in the current document.
  if (href.startsWith('#')) {
    return null;
  }

  // Protocol-relative URL (//host/...) is always external.
  if (href.startsWith('//')) {
    return null;
  }

  // Any explicit scheme (http:, https:, mailto:, tel:, data:, file:,
  // markune-asset:, markune-drawing:, ...) is not a workspace document link.
  if (EXPLICIT_SCHEME_PATTERN.test(href)) {
    return null;
  }

  const { path, hash } = splitHash(href);
  const target = safeDecode(path).trim();

  return target ? { target, hash } : null;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Converts a document's absolute path to a workspace-root-relative POSIX path,
 * mirroring the Rust `to_relative_path` normalization. Returns `null` when the
 * document is not inside the workspace root.
 */
export function toWorkspaceRootRelativePath(
  absolutePath: string,
  workspaceRootPath: string,
): string | null {
  const absolute = toPosix(absolutePath);
  const root = stripTrailingSlashes(toPosix(workspaceRootPath));

  if (!root) {
    return null;
  }

  const prefix = `${root}/`;

  if (absolute === root) {
    return '';
  }

  if (absolute.toLowerCase().startsWith(prefix.toLowerCase())) {
    return absolute.slice(prefix.length).replace(/^\/+/, '');
  }

  return null;
}

function posixDirname(value: string): string {
  const index = value.lastIndexOf('/');

  return index === -1 ? '' : value.slice(0, index);
}

/**
 * Normalizes a POSIX path, resolving `.` and `..` segments. Returns `null` when
 * the path escapes above the workspace root, which must never open a document.
 */
export function normalizeWorkspacePath(value: string): string | null {
  const segments = value.split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolved.length === 0) {
        return null;
      }

      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved.join('/');
}

function encodePosixPath(path: string): string {
  return path
    .split('/')
    .map((segment) => (segment === '..' ? '..' : encodeURIComponent(segment)))
    .join('/');
}

/**
 * Builds a Markdown link href pointing from the current document to a target
 * document, both given as workspace-root-relative POSIX paths. Produces a
 * document-relative href (e.g. `../notes/a.md`) so links stay portable when the
 * whole workspace moves; falls back to a root-absolute href (`/notes/a.md`) when
 * the current document location is unknown. Segments are percent-encoded so
 * spaces remain valid inside Markdown link targets. author: liyao
 */
export function buildWorkspaceDocumentHref(options: {
  fromDocumentRelativePath: string | null;
  targetRelativePath: string;
}): string {
  const target = normalizeWorkspacePath(toPosix(options.targetRelativePath));

  if (!target) {
    return '';
  }

  const from =
    options.fromDocumentRelativePath != null
      ? normalizeWorkspacePath(toPosix(options.fromDocumentRelativePath))
      : null;

  if (from == null) {
    return `/${encodePosixPath(target)}`;
  }

  const fromParts = posixDirname(from) ? posixDirname(from).split('/') : [];
  const toParts = target.split('/');

  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  ) {
    common += 1;
  }

  const relParts: string[] = [];

  for (let index = common; index < fromParts.length; index += 1) {
    relParts.push('..');
  }

  for (let index = common; index < toParts.length; index += 1) {
    relParts.push(toParts[index]!);
  }

  return encodePosixPath(relParts.join('/'));
}

/**
 * Resolves an in-editor link href to a workspace-root-relative document path.
 * Document-relative targets are joined against the current document directory,
 * root-absolute targets (`/foo/bar.md`) are taken from the workspace root.
 */
export function resolveWorkspaceDocumentTarget(options: {
  href: string;
  documentAbsolutePath: string | null | undefined;
  workspaceRootPath: string | null | undefined;
}): OpenWorkspaceDocumentDetail | null {
  const { href, documentAbsolutePath, workspaceRootPath } = options;

  if (!documentAbsolutePath || !workspaceRootPath) {
    return null;
  }

  const parsed = parseInternalDocumentHref(href);

  if (!parsed) {
    return null;
  }

  const documentRelative = toWorkspaceRootRelativePath(
    documentAbsolutePath,
    workspaceRootPath,
  );

  if (documentRelative === null) {
    return null;
  }

  const target = toPosix(parsed.target);
  const joined = target.startsWith('/')
    ? target.slice(1)
    : `${posixDirname(documentRelative)}/${target}`;

  const relativePath = normalizeWorkspacePath(joined);

  if (!relativePath) {
    return null;
  }

  return { relativePath, hash: parsed.hash };
}

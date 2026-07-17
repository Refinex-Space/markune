import { readWorkspaceAssetData } from './workspace-api';

export const LOCAL_ASSET_URL_PREFIX = 'madora-asset://';
export const LOCAL_ASSET_RELATIVE_PREFIX = '.madora/assets/files/';

const LOCAL_ASSET_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const LOCAL_ASSET_RELATIVE_PATTERN =
  /\.madora\/assets\/files\/[^\s"'()<>{}\[\]\\]+/gu;
const LOCAL_ASSET_URL_PATTERN = /madora-asset:\/\/[A-Za-z0-9._-]+/gu;

export async function localAssetUrlToImageDataUrl(
  url: string,
  rootPath: string,
) {
  const assetId = getWorkspaceAssetIdFromReference(url);

  if (!assetId) {
    return null;
  }

  const asset = await readWorkspaceAssetData(rootPath, assetId);

  if (!asset.mediaType.startsWith('image/')) {
    return null;
  }

  return `data:${asset.mediaType};base64,${asset.base64Data}`;
}

export function isLocalAssetUrl(url: string | undefined | null) {
  return Boolean(url?.startsWith(LOCAL_ASSET_URL_PREFIX));
}

export function isWorkspaceAssetRelativePath(
  value: string | undefined | null,
) {
  return Boolean(value?.trim().startsWith(LOCAL_ASSET_RELATIVE_PREFIX));
}

export function isWorkspaceAssetReference(
  value: string | undefined | null,
) {
  return isLocalAssetUrl(value) || isWorkspaceAssetRelativePath(value);
}

export function getWorkspaceAssetIdFromReference(
  reference: string | undefined | null,
) {
  const value = reference?.trim();

  if (!value) {
    return null;
  }

  if (!isLocalAssetUrl(value)) {
    return getWorkspaceAssetIdFromRelativePath(value);
  }

  const assetId = value.slice(LOCAL_ASSET_URL_PREFIX.length).trim();

  return LOCAL_ASSET_ID_PATTERN.test(assetId) ? assetId : null;
}

export function extractWorkspaceAssetReferences(markdown: string) {
  const references = new Set<string>();

  for (const match of markdown.matchAll(LOCAL_ASSET_URL_PATTERN)) {
    if (getWorkspaceAssetIdFromReference(match[0])) {
      references.add(match[0]);
    }
  }

  for (const match of markdown.matchAll(LOCAL_ASSET_RELATIVE_PATTERN)) {
    if (getWorkspaceAssetIdFromReference(match[0])) {
      references.add(match[0]);
    }
  }

  return Array.from(references);
}

function getWorkspaceAssetIdFromRelativePath(relativePath: string) {
  if (!isWorkspaceAssetRelativePath(relativePath)) {
    return null;
  }

  const withoutQuery = relativePath.split(/[?#]/u)[0] ?? '';
  const fileName = withoutQuery.split('/').filter(Boolean).at(-1) ?? '';

  if (!fileName) {
    return null;
  }

  const dotIndex = fileName.indexOf('.');
  const assetId = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);

  return LOCAL_ASSET_ID_PATTERN.test(assetId) ? assetId : null;
}

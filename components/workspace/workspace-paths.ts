export function toUserAbsolutePath(path: string) {
  const uncMatch = path.match(/^\\\\\?\\UNC\\(.*)$/i);
  if (uncMatch) {
    return `\\\\${uncMatch[1]}`;
  }

  const driveMatch = path.match(/^\\\\\?\\([A-Za-z]:)([\\/].*)?$/);
  if (driveMatch) {
    return `${driveMatch[1]}${driveMatch[2] ?? ''}`;
  }

  return path;
}

export function getParentPath(path: string) {
  const lastSeparatorIndex = getLastSeparatorIndex(path);

  return lastSeparatorIndex >= 0 ? path.slice(0, lastSeparatorIndex) : '';
}

export function getBaseName(path: string) {
  const lastSeparatorIndex = getLastSeparatorIndex(path);

  return lastSeparatorIndex >= 0
    ? path.slice(lastSeparatorIndex + 1)
    : path;
}

export function joinPath(parentPath: string, childPath: string) {
  if (!parentPath) {
    return childPath.replace(/^[/\\]+/, '');
  }

  const separator = parentPath.includes('\\') ? '\\' : '/';
  const parent = parentPath.replace(/[/\\]+$/, '');
  const child = childPath.replace(/^[/\\]+/, '');

  return `${parent}${separator}${child}`;
}

export function isDescendantPath(path: string, ancestorPath: string) {
  const comparablePath = toComparablePath(path);
  const comparableAncestor = toComparablePath(ancestorPath).replace(/\/+$/, '');

  if (!comparableAncestor) {
    return false;
  }

  return comparablePath.startsWith(`${comparableAncestor}/`);
}

function getLastSeparatorIndex(path: string) {
  return Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
}

function toComparablePath(path: string) {
  const normalized = path.replace(/\\/g, '/');

  return path.includes('\\') ? normalized.toLowerCase() : normalized;
}

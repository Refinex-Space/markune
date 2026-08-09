import type { DailyNoteEntry, WorkspaceNode } from './workspace-types';

function padDatePart(value: number) {
  return value.toString().padStart(2, '0');
}

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, '/');
}

export function formatDailyDate(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

export function formatDailyMonth(date: Date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1)].join('-');
}

export function createDailyMarkdownTemplate(date: string) {
  return `# ${date}\n`;
}

export function createDateFromDailyDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export function createMonthFromDailyMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);

  return new Date(year, monthNumber - 1, 1);
}

export function getDailyContentDates(entries: DailyNoteEntry[]) {
  return new Set(
    entries
      .filter((entry) => entry.hasContent)
      .map((entry) => entry.date),
  );
}

export function isDailyDocumentPath(path: string | null | undefined) {
  if (!path) {
    return false;
  }

  const normalized = normalizePathSeparators(path);
  return (
    normalized === 'Daily' ||
    normalized.startsWith('Daily/') ||
    normalized.includes('/Daily/')
  );
}

export function toDailyExportNode(
  entry: DailyNoteEntry,
  rootPath: string,
): WorkspaceNode {
  const fileName = `${entry.date}.md`;
  const [year, month] = entry.date.split('-');
  const fallbackRelativePath = `Daily/${year}/${month}/${fileName}`;

  return {
    id: entry.documentPath,
    name: fileName,
    kind: 'document',
    relativePath: resolveRelativeDocumentPath(
      entry.documentPath,
      rootPath,
      fallbackRelativePath,
    ),
    absolutePath: entry.documentPath,
    title: entry.date,
    updatedAt: entry.updatedAt,
  };
}

function resolveRelativeDocumentPath(
  absolutePath: string,
  rootPath: string,
  fallbackRelativePath: string,
) {
  const root = normalizePathSeparators(rootPath).replace(/\/+$/, '');
  const absolute = normalizePathSeparators(absolutePath);

  if (root.length > 0 && absolute.startsWith(`${root}/`)) {
    return absolute.slice(root.length + 1);
  }

  return fallbackRelativePath;
}

import type {
  InboxCapture,
  InboxCaptureSummary,
  InboxCaptureStatus,
} from './workspace-types';

export type InboxActiveLane = 'open' | 'processing' | 'later';

export function parseInboxTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[，,\s]+/u)
        .map((tag) => tag.trim().replace(/^#+/u, ''))
        .filter(Boolean)
        .map((tag) => tag.replace(/\s+/gu, '-').toLocaleLowerCase()),
    ),
  );
}

export function deriveInboxCaptureTitle(body: string) {
  const line = body
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .find(Boolean);
  const title =
    line
      ?.replace(/^[#>*+\-\[\]\s]+/u, '')
      .trim()
      .slice(0, 80) || '未命名捕获';
  return title;
}

export function getInboxActiveLane(
  capture: Pick<InboxCaptureSummary, 'snoozedUntil' | 'status'>,
  now = Date.now(),
): InboxActiveLane | null {
  if (!isInboxCaptureActive(capture.status)) {
    return null;
  }
  if (
    capture.snoozedUntil &&
    Number.isFinite(Date.parse(capture.snoozedUntil)) &&
    Date.parse(capture.snoozedUntil) > now
  ) {
    return 'later';
  }
  return capture.status;
}

export function isInboxCaptureActive(status: InboxCaptureStatus) {
  return status === 'open' || status === 'processing';
}

export function toInboxCaptureUpdate(capture: InboxCapture) {
  return {
    body: capture.body,
    priority: capture.priority,
    snoozedUntil: capture.snoozedUntil,
    status: capture.status,
    tags: capture.tags,
  };
}

export function formatInboxDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatInboxLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatInboxLocalTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

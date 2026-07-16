import type {
  CodexProtocolMessage,
  CodexThread,
  CodexThreadItem,
} from './codex-app-server';

export type AiTimelineKind =
  | 'command'
  | 'file'
  | 'mcp'
  | 'plan'
  | 'search'
  | 'status';

export interface AiChatMessage {
  id: string;
  mentions?: AiMessageMention[];
  role: 'assistant' | 'user';
  text: string;
}

export interface AiMessageMention {
  end: number;
  label: string;
  path: string;
  start: number;
}

export interface AiTimelineItem {
  id: string;
  kind: AiTimelineKind;
  label: string;
  detail: string | null;
  status: 'completed' | 'failed' | 'inProgress';
}

type AiMessageEntry = { type: 'message' } & AiChatMessage;
type AiTimelineEntry = { type: 'timeline' } & AiTimelineItem;

export type AiConversationEntry = AiMessageEntry | AiTimelineEntry;

export interface AiApprovalRequest {
  id: number | string;
  method: string;
  title: string;
  detail: string;
}

export interface AiConversationState {
  activeTurnId: string | null;
  approvals: AiApprovalRequest[];
  entries: AiConversationEntry[];
}

export function createEmptyConversation(): AiConversationState {
  return {
    activeTurnId: null,
    approvals: [],
    entries: [],
  };
}

export function conversationFromThread(thread: CodexThread) {
  const state = createEmptyConversation();

  for (const turn of thread.turns ?? []) {
    for (const item of turn.items ?? []) {
      appendCompletedItem(state, item);
    }
  }

  return state;
}

export function reduceCodexProtocolMessage(
  state: AiConversationState,
  message: CodexProtocolMessage,
): AiConversationState {
  const next: AiConversationState = {
    ...state,
    approvals: [...state.approvals],
    entries: state.entries.map((entry) => ({ ...entry })),
  };
  const params = message.params ?? {};

  if (message.method === 'turn/started') {
    next.activeTurnId = getNestedString(params, 'turn', 'id');
    return next;
  }

  if (message.method === 'turn/completed') {
    next.activeTurnId = null;
    return next;
  }

  if (message.method === 'item/agentMessage/delta') {
    const itemId = getString(params, 'itemId');
    const delta = getString(params, 'delta') ?? '';
    const existing = next.entries.find(
      (item): item is AiMessageEntry =>
        item.type === 'message' && item.id === itemId,
    );

    if (itemId && existing) {
      existing.text += delta;
    } else if (itemId) {
      next.entries.push({
        type: 'message',
        id: itemId,
        role: 'assistant',
        text: delta,
      });
    }
    return next;
  }

  if (message.method === 'item/started' || message.method === 'item/completed') {
    const item = params.item as CodexThreadItem | undefined;

    if (!item) {
      return next;
    }

    if (message.method === 'item/completed') {
      appendCompletedItem(next, item);
    } else {
      appendStartedItem(next, item);
    }
    return next;
  }

  if (message.method === 'turn/plan/updated') {
    const turnId = getString(params, 'turnId') ?? 'active';
    upsertTimeline(next, {
      id: `plan-${turnId}`,
      kind: 'plan',
      label: '正在整理执行计划',
      detail: null,
      status: 'inProgress',
    });
    return next;
  }

  if (isApprovalMethod(message.method) && message.id !== undefined) {
    const command = getString(params, 'command');
    const reason = getString(params, 'reason');
    next.approvals.push({
      id: message.id,
      method: message.method,
      title: message.method.includes('fileChange')
        ? '请求修改工作区文件'
        : '请求执行工具命令',
      detail: command || reason || 'Codex 需要你的确认后才能继续。',
    });
    return next;
  }

  if (message.method === 'serverRequest/resolved') {
    const requestId = params.requestId;
    next.approvals = next.approvals.filter(
      (approval) => String(approval.id) !== String(requestId),
    );
    return next;
  }

  if (message.method === 'madora/runtime/exited') {
    next.activeTurnId = null;
    next.entries.push({
      type: 'timeline',
      id: `runtime-${next.entries.length}`,
      kind: 'status',
      label: 'Codex App Server 已停止',
      detail: null,
      status: 'failed',
    });
  }

  return next;
}

function appendStartedItem(
  state: AiConversationState,
  item: CodexThreadItem,
) {
  const timeline = timelineFromItem(item, 'inProgress');

  if (timeline) {
    upsertTimeline(state, timeline);
  }
}

function appendCompletedItem(
  state: AiConversationState,
  item: CodexThreadItem,
) {
  const id = typeof item.id === 'string' ? item.id : `item-${state.entries.length}`;
  const type = item.type;

  if (type === 'userMessage') {
    const message = messageFromUserMessage(item);
    if (message.text) {
      upsertMessage(state, {
        id: typeof item.clientId === 'string' ? item.clientId : id,
        mentions: message.mentions,
        role: 'user',
        text: message.text,
      });
    }
    return;
  }

  if (type === 'agentMessage') {
    const text = typeof item.text === 'string' ? item.text : '';
    if (text) {
      upsertMessage(state, { id, role: 'assistant', text });
    }
    return;
  }

  const timeline = timelineFromItem(
    item,
    item.status === 'failed' ? 'failed' : 'completed',
  );

  if (timeline) {
    upsertTimeline(state, timeline);
  }
}

function timelineFromItem(
  item: CodexThreadItem,
  status: AiTimelineItem['status'],
): AiTimelineItem | null {
  const id = typeof item.id === 'string' ? item.id : `timeline-${item.type}`;

  switch (item.type) {
    case 'commandExecution':
      return {
        id,
        kind: 'command',
        label: status === 'inProgress' ? '正在运行命令' : '已运行命令',
        detail: typeof item.command === 'string' ? item.command : null,
        status,
      };
    case 'fileChange':
      return {
        id,
        kind: 'file',
        label: status === 'inProgress' ? '正在修改文件' : '已处理文件修改',
        detail: describeFileChanges(item.changes),
        status,
      };
    case 'mcpToolCall':
      return {
        id,
        kind: 'mcp',
        label: status === 'inProgress' ? '正在调用 MCP 工具' : '已调用 MCP 工具',
        detail: [item.server, item.tool].filter((value) => typeof value === 'string').join(' · ') || null,
        status,
      };
    case 'webSearch':
      return {
        id,
        kind: 'search',
        label: status === 'inProgress' ? '正在搜索网页' : '已搜索网页',
        detail: webSearchDetail(item),
        status,
      };
    case 'plan':
      return {
        id,
        kind: 'plan',
        label: status === 'inProgress' ? '正在更新计划' : '已更新计划',
        detail: typeof item.text === 'string' ? item.text : null,
        status,
      };
    default:
      return null;
  }
}

function upsertMessage(state: AiConversationState, message: AiChatMessage) {
  const existing = state.entries.find(
    (item): item is AiMessageEntry =>
      item.type === 'message' && item.id === message.id,
  );

  if (existing) {
    existing.text = message.text;
    existing.mentions = message.mentions;
  } else {
    state.entries.push({ type: 'message', ...message });
  }
}

function upsertTimeline(state: AiConversationState, item: AiTimelineItem) {
  const index = state.entries.findIndex(
    (candidate) =>
      candidate.type === 'timeline' && candidate.id === item.id,
  );

  if (index >= 0) {
    state.entries[index] = { type: 'timeline', ...item };
  } else {
    state.entries.push({ type: 'timeline', ...item });
  }
}

export function createThreadTitle(message: string) {
  const title = message.replace(/\s+/g, ' ').trim();
  return title.length > 36 ? `${title.slice(0, 36)}…` : title;
}

export function createMentionTextElements(
  text: string,
  mentions: AiMessageMention[],
) {
  return mentions
    .filter(
      (mention) =>
        mention.start >= 0 &&
        mention.end > mention.start &&
        mention.end <= text.length,
    )
    .sort((left, right) => left.start - right.start)
    .map((mention) => ({
      byteRange: {
        start: utf8ByteLength(text.slice(0, mention.start)),
        end: utf8ByteLength(text.slice(0, mention.end)),
      },
      placeholder: mention.label,
    }));
}

export function threadNameUpdateFromMessage(
  message: CodexProtocolMessage,
): { threadId: string; name: string } | null {
  if (message.method !== 'thread/name/updated') {
    return null;
  }

  const params = message.params ?? {};
  const threadId = getString(params, 'threadId');
  const name = getString(params, 'threadName');

  return threadId && name ? { threadId, name } : null;
}

function messageFromUserMessage(item: CodexThreadItem) {
  if (!Array.isArray(item.content)) {
    return { mentions: [], text: '' };
  }

  const inputs = item.content
    .filter(
      (content): content is Record<string, unknown> =>
        Boolean(content && typeof content === 'object'),
    );
  const mentionInputs = inputs
    .filter(
      (input) =>
        input.type === 'mention' &&
        typeof input.name === 'string' &&
        typeof input.path === 'string',
    )
    .map((input) => ({ name: input.name as string, path: input.path as string }));
  const usedMentionIndexes = new Set<number>();
  const mentions: AiMessageMention[] = [];
  let text = '';

  for (const input of inputs) {
    if (input.type !== 'text' || typeof input.text !== 'string') {
      continue;
    }

    const inputText = input.text;
    const baseOffset = text ? text.length + 1 : 0;
    text = text ? `${text}\n${inputText}` : inputText;

    if (!Array.isArray(input.text_elements)) {
      continue;
    }

    for (const element of input.text_elements) {
      if (!element || typeof element !== 'object') {
        continue;
      }

      const record = element as Record<string, unknown>;
      const byteRange = record.byteRange;
      if (!byteRange || typeof byteRange !== 'object') {
        continue;
      }

      const range = byteRange as Record<string, unknown>;
      if (typeof range.start !== 'number' || typeof range.end !== 'number') {
        continue;
      }

      const start = utf8ByteOffsetToStringIndex(inputText, range.start);
      const end = utf8ByteOffsetToStringIndex(inputText, range.end);
      if (end <= start) {
        continue;
      }

      const placeholder =
        typeof record.placeholder === 'string' ? record.placeholder : '';
      const label = inputText.slice(start, end) || placeholder;
      const mentionIndex = mentionInputs.findIndex(
        (mention, index) =>
          !usedMentionIndexes.has(index) &&
          (mention.name === placeholder || mention.name === label),
      );

      if (mentionIndex < 0) {
        continue;
      }

      usedMentionIndexes.add(mentionIndex);
      mentions.push({
        start: baseOffset + start,
        end: baseOffset + end,
        label,
        path: mentionInputs[mentionIndex].path,
      });
    }
  }

  return {
    text,
    mentions: mentions.sort((left, right) => left.start - right.start),
  };
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function utf8ByteOffsetToStringIndex(value: string, byteOffset: number) {
  if (byteOffset <= 0) {
    return 0;
  }

  let bytes = 0;
  let index = 0;
  for (const character of value) {
    const nextBytes = bytes + utf8ByteLength(character);
    if (byteOffset < nextBytes) {
      return index;
    }
    bytes = nextBytes;
    index += character.length;
    if (bytes === byteOffset) {
      return index;
    }
  }

  return value.length;
}

function describeFileChanges(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const paths = value
    .map((change) => {
      if (!change || typeof change !== 'object') {
        return null;
      }

      const record = change as Record<string, unknown>;
      return typeof record.path === 'string' ? record.path : null;
    })
    .filter((path): path is string => Boolean(path));

  if (paths.length === 0) {
    return `${value.length} 项变更`;
  }

  return paths.slice(0, 3).join('、');
}

function webSearchDetail(item: CodexThreadItem) {
  const query = item.query;

  if (typeof query === 'string') {
    return query;
  }

  if (item.action && typeof item.action === 'object') {
    const action = item.action as Record<string, unknown>;
    return typeof action.query === 'string' ? action.query : null;
  }

  return null;
}

function isApprovalMethod(method: string | undefined): method is string {
  return matches(method, [
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
    'execCommandApproval',
    'applyPatchApproval',
  ]);
}

function matches(value: string | undefined, candidates: string[]) {
  return value ? candidates.includes(value) : false;
}

function getString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'string' ? value[key] : null;
}

function getNestedString(
  value: Record<string, unknown>,
  parent: string,
  key: string,
) {
  const nested = value[parent];

  if (!nested || typeof nested !== 'object') {
    return null;
  }

  return getString(nested as Record<string, unknown>, key);
}

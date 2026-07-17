import type {
  CodexProtocolMessage,
  CodexThread,
  CodexThreadItem,
} from './codex-app-server';

export type AiTimelineKind =
  | 'collab'
  | 'command'
  | 'context'
  | 'dynamic'
  | 'file'
  | 'image'
  | 'mcp'
  | 'plan'
  | 'search'
  | 'status';

export type AiActivityStatus =
  | 'completed'
  | 'declined'
  | 'failed'
  | 'inProgress';

export type AiMessagePhase = 'commentary' | 'final_answer' | null;

export interface AiChatMessage {
  id: string;
  mentions?: AiMessageMention[];
  phase?: AiMessagePhase;
  role: 'assistant' | 'user';
  text: string;
  turnId?: string | null;
}

export interface AiMessageMention {
  end: number;
  label: string;
  path: string;
  start: number;
}

export interface AiDocumentInputMention extends AiMessageMention {
  relativePath: string;
}

interface AiActivityBase {
  completedAtMs: number | null;
  durationMs: number | null;
  id: string;
  kind: AiTimelineKind;
  label: string;
  startedAtMs: number | null;
  status: AiActivityStatus;
  turnId: string | null;
}

export type AiCommandAction =
  | {
      command: string;
      documentPath: string | null;
      name: string;
      path: string | null;
      type: 'read';
    }
  | { command: string; path: string | null; type: 'listFiles' }
  | {
      command: string;
      path: string | null;
      query: string | null;
      type: 'search';
    }
  | { command: string; type: 'unknown' };

export interface AiOutputPreview {
  head: string;
  tail: string;
  totalLines: number;
  truncated: boolean;
}

export interface AiFileChange {
  absolutePath: string | null;
  additions: number;
  deletions: number;
  diff: string;
  kind: 'add' | 'delete' | 'update';
  movePath: string | null;
  path: string;
}

export interface AiPlanStep {
  status: 'completed' | 'inProgress' | 'pending';
  step: string;
}

export type AiTimelineItem =
  | (AiActivityBase & {
      actions: AiCommandAction[];
      command: string;
      cwd: string | null;
      exitCode: number | null;
      kind: 'command';
      output: AiOutputPreview;
      terminalInputs: string[];
    })
  | (AiActivityBase & { changes: AiFileChange[]; kind: 'file' })
  | (AiActivityBase & {
      arguments: unknown;
      error: string | null;
      kind: 'dynamic' | 'mcp';
      progress: string | null;
      result: unknown;
      server: string | null;
      tool: string;
    })
  | (AiActivityBase & {
      action: string | null;
      detail: string | null;
      kind: 'search';
      query: string | null;
    })
  | (AiActivityBase & {
      explanation: string | null;
      kind: 'plan';
      steps: AiPlanStep[];
      text: string | null;
    })
  | (AiActivityBase & {
      detail: string | null;
      kind: 'collab' | 'context' | 'image' | 'status';
    });

type AiMessageEntry = { type: 'message' } & AiChatMessage;
type AiTimelineEntry = { type: 'timeline' } & AiTimelineItem;

export type AiConversationEntry = AiMessageEntry | AiTimelineEntry;

export type AiApprovalChoiceKind =
  | 'accept'
  | 'acceptForSession'
  | 'acceptWithExecpolicyAmendment'
  | 'applyNetworkPolicyAmendment'
  | 'cancel'
  | 'decline'
  | 'denyPermissions'
  | 'grantPermissionsForSession'
  | 'grantPermissionsForTurn'
  | 'grantPermissionsForTurnStrict';

export interface AiApprovalChoice {
  description: string | null;
  id: string;
  kind: AiApprovalChoiceKind;
  label: string;
}

export interface AiApprovalRequest {
  choices: AiApprovalChoice[];
  detail: string;
  id: number | string;
  itemId: string | null;
  method: string;
  title: string;
  turnId: string | null;
}

export interface AiTurnState {
  completedAtMs: number | null;
  durationMs: number | null;
  historical: boolean;
  id: string;
  startedAtMs: number | null;
  status: 'completed' | 'failed' | 'inProgress' | 'interrupted';
  diff: string | null;
}

export interface AiConversationState {
  activeTurnId: string | null;
  approvals: AiApprovalRequest[];
  entries: AiConversationEntry[];
  turns: Record<string, AiTurnState>;
}

export type AiWorkspaceChangeEvent =
  | {
      changes: AiFileChange[];
      turnId: string | null;
      type: 'fileChangesCompleted';
    }
  | { turnId: string | null; type: 'turnCompleted' };

export function createEmptyConversation(): AiConversationState {
  return {
    activeTurnId: null,
    approvals: [],
    entries: [],
    turns: {},
  };
}

export function conversationFromThread(
  thread: CodexThread,
  workspaceRootPath: string = thread.cwd,
) {
  const state = createEmptyConversation();

  for (const turn of thread.turns ?? []) {
    state.turns[turn.id] = turnStateFromRecord(turn, true);
    for (const item of turn.items ?? []) {
      appendCompletedItem(state, item, workspaceRootPath, turn.id);
    }
  }

  return state;
}

export function reduceCodexProtocolMessage(
  state: AiConversationState,
  message: CodexProtocolMessage,
  workspaceRootPath?: string | null,
): AiConversationState {
  const next: AiConversationState = {
    ...state,
    approvals: [...state.approvals],
    entries: [...state.entries],
    turns: { ...state.turns },
  };
  const params = message.params ?? {};

  if (message.method === 'turn/started') {
    const turn = getRecord(params, 'turn');
    const turnState = turn ? turnStateFromRecord(turn, false) : null;
    next.activeTurnId = turnState?.id ?? null;
    if (turnState) {
      next.turns[turnState.id] = turnState;
    }
    return next;
  }

  if (message.method === 'turn/completed') {
    const turn = getRecord(params, 'turn');
    const turnState = turn ? turnStateFromRecord(turn, false) : null;
    if (turnState) {
      next.turns[turnState.id] = {
        ...turnState,
        diff: next.turns[turnState.id]?.diff ?? turnState.diff,
      };
      if (next.activeTurnId === turnState.id) {
        next.activeTurnId = null;
      }
    } else {
      next.activeTurnId = null;
    }
    return next;
  }

  if (message.method === 'item/agentMessage/delta') {
    const itemId = getString(params, 'itemId');
    const turnId = getString(params, 'turnId');
    const delta = getString(params, 'delta') ?? '';
    const index = next.entries.findIndex(
      (item) => item.type === 'message' && item.id === itemId,
    );

    if (itemId && index >= 0) {
      const existing = next.entries[index] as AiMessageEntry;
      next.entries[index] = {
        ...existing,
        text: existing.text + delta,
        turnId: turnId ?? existing.turnId,
      };
    } else if (itemId) {
      next.entries.push({
        type: 'message',
        id: itemId,
        role: 'assistant',
        text: delta,
        ...(turnId ? { turnId } : {}),
      });
    }
    return next;
  }

  if (message.method === 'item/started' || message.method === 'item/completed') {
    const item = params.item as CodexThreadItem | undefined;

    if (!item) {
      return next;
    }

    const turnId = getString(params, 'turnId');
    if (message.method === 'item/completed') {
      appendCompletedItem(
        next,
        item,
        workspaceRootPath,
        turnId,
        getNumber(params, 'completedAtMs'),
      );
    } else {
      appendStartedItem(
        next,
        item,
        workspaceRootPath,
        turnId,
        getNumber(params, 'startedAtMs'),
      );
    }
    return next;
  }

  if (message.method === 'item/commandExecution/outputDelta') {
    const itemId = getString(params, 'itemId');
    const delta = getString(params, 'delta') ?? '';
    updateTimeline(next, itemId, (item) =>
      item.kind === 'command'
        ? { ...item, output: appendOutputPreview(item.output, delta) }
        : item,
    );
    return next;
  }

  if (message.method === 'item/commandExecution/terminalInteraction') {
    const itemId = getString(params, 'itemId');
    const stdin = getString(params, 'stdin');
    updateTimeline(next, itemId, (item) =>
      item.kind === 'command' && stdin
        ? { ...item, terminalInputs: [...item.terminalInputs, stdin] }
        : item,
    );
    return next;
  }

  if (message.method === 'item/fileChange/patchUpdated') {
    const itemId = getString(params, 'itemId');
    updateTimeline(next, itemId, (item) =>
      item.kind === 'file'
        ? {
            ...item,
            changes: parseFileChanges(params.changes, workspaceRootPath),
          }
        : item,
    );
    return next;
  }

  if (message.method === 'item/mcpToolCall/progress') {
    const itemId = getString(params, 'itemId');
    const progress = getString(params, 'message');
    updateTimeline(next, itemId, (item) =>
      item.kind === 'mcp' ? { ...item, progress } : item,
    );
    return next;
  }

  if (message.method === 'turn/plan/updated') {
    const turnId = getString(params, 'turnId') ?? 'active';
    upsertTimeline(next, {
      completedAtMs: null,
      durationMs: null,
      explanation: getString(params, 'explanation'),
      id: `plan-${turnId}`,
      kind: 'plan',
      label: '正在整理执行计划',
      startedAtMs: null,
      status: 'inProgress',
      steps: parsePlanSteps(params.plan),
      text: null,
      turnId,
    });
    return next;
  }

  if (message.method === 'turn/diff/updated') {
    const turnId = getString(params, 'turnId');
    if (turnId && next.turns[turnId]) {
      next.turns[turnId] = {
        ...next.turns[turnId],
        diff: getString(params, 'diff'),
      };
    }
    return next;
  }

  if (message.method === 'thread/compacted') {
    const turnId = getString(params, 'turnId');
    if (turnId) {
      upsertTimeline(next, contextActivity(turnId));
    }
    return next;
  }

  if (
    message.method === 'item/autoApprovalReview/started' ||
    message.method === 'item/autoApprovalReview/completed'
  ) {
    const reviewId = getString(params, 'reviewId');
    const review = getRecord(params, 'review');
    if (!reviewId || !review) {
      return next;
    }
    const completed = message.method.endsWith('/completed');
    const reviewStatus = getString(review, 'status');
    const riskLevel = getString(review, 'riskLevel');
    const rationale = getString(review, 'rationale');
    upsertTimeline(next, {
      completedAtMs: completed ? getNumber(params, 'completedAtMs') : null,
      detail: [riskLevel ? `风险：${approvalRiskLabel(riskLevel)}` : null, rationale]
        .filter(Boolean)
        .join(' · ') || null,
      durationMs:
        completed && getNumber(params, 'completedAtMs') !== null
          ? Math.max(
              0,
              (getNumber(params, 'completedAtMs') ?? 0) -
                (getNumber(params, 'startedAtMs') ?? 0),
            )
          : null,
      id: `auto-review-${reviewId}`,
      kind: 'status',
      label: completed
        ? reviewStatus === 'approved'
          ? '自动审查已批准操作'
          : reviewStatus === 'denied'
            ? '自动审查已拒绝操作'
            : '自动审查已结束'
        : '正在自动审查操作风险',
      startedAtMs: getNumber(params, 'startedAtMs'),
      status: completed
        ? reviewStatus === 'denied'
          ? 'declined'
          : matches(reviewStatus ?? undefined, ['timedOut', 'aborted'])
            ? 'failed'
            : 'completed'
        : 'inProgress',
      turnId: getString(params, 'turnId'),
    });
    return next;
  }

  if (isApprovalMethod(message.method) && message.id !== undefined) {
    const command = getString(params, 'command');
    const reason = getString(params, 'reason');
    const permissions = getRecord(params, 'permissions');
    const permissionDetail = permissions
      ? describePermissionRequest(permissions)
      : null;
    next.approvals.push({
      choices: supportedApprovalChoices(
        params.madoraApprovalChoices,
        params.availableDecisions,
        message.method,
      ),
      detail:
        command ||
        [reason, permissionDetail].filter(Boolean).join('\n') ||
        'Codex 需要你的确认后才能继续。',
      id: message.id,
      itemId: getString(params, 'itemId'),
      method: message.method,
      title: message.method.includes('permissions')
        ? '请求扩展操作权限'
        : message.method.includes('fileChange') || message.method === 'applyPatchApproval'
          ? '请求修改工作区文件'
          : '请求执行工具命令',
      turnId: getString(params, 'turnId'),
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
      completedAtMs: null,
      detail: null,
      durationMs: null,
      id: `runtime-${next.entries.length}`,
      kind: 'status',
      label: 'Codex App Server 已停止',
      startedAtMs: null,
      status: 'failed',
      turnId: null,
    });
  }

  return next;
}

export function workspaceChangeEventFromProtocolMessage(
  message: CodexProtocolMessage,
  workspaceRootPath?: string | null,
): AiWorkspaceChangeEvent | null {
  const params = message.params ?? {};
  if (message.method === 'turn/completed') {
    const turn = getRecord(params, 'turn');
    return {
      turnId: turn ? getString(turn, 'id') : getString(params, 'turnId'),
      type: 'turnCompleted',
    };
  }
  if (message.method !== 'item/completed') {
    return null;
  }

  const item = params.item as CodexThreadItem | undefined;
  if (
    !item ||
    item.type !== 'fileChange' ||
    parseActivityStatus(item.status, 'completed') !== 'completed'
  ) {
    return null;
  }

  return {
    changes: parseFileChanges(item.changes, workspaceRootPath),
    turnId: getString(params, 'turnId'),
    type: 'fileChangesCompleted',
  };
}

function appendStartedItem(
  state: AiConversationState,
  item: CodexThreadItem,
  workspaceRootPath?: string | null,
  turnId?: string | null,
  startedAtMs?: number | null,
) {
  const id = typeof item.id === 'string' ? item.id : `item-${state.entries.length}`;
  if (item.type === 'agentMessage') {
    upsertMessage(state, {
      id,
      phase: parseMessagePhase(item.phase),
      role: 'assistant',
      text: typeof item.text === 'string' ? item.text : '',
      turnId: turnId ?? null,
    });
    return;
  }

  const timeline = timelineFromItem(
    item,
    'inProgress',
    workspaceRootPath,
    turnId,
    startedAtMs,
  );

  if (timeline) {
    upsertTimeline(state, timeline);
  }
}

function appendCompletedItem(
  state: AiConversationState,
  item: CodexThreadItem,
  workspaceRootPath?: string | null,
  turnId?: string | null,
  completedAtMs?: number | null,
) {
  const id = typeof item.id === 'string' ? item.id : `item-${state.entries.length}`;
  const type = item.type;

  if (type === 'userMessage') {
    const message = messageFromUserMessage(item, workspaceRootPath);
    if (message.text) {
      upsertMessage(state, {
        id: typeof item.clientId === 'string' ? item.clientId : id,
        mentions: message.mentions,
        role: 'user',
        text: message.text,
        turnId: turnId ?? null,
      });
    }
    return;
  }

  if (type === 'agentMessage') {
    const text = typeof item.text === 'string' ? item.text : '';
    upsertMessage(state, {
      id,
      phase: parseMessagePhase(item.phase),
      role: 'assistant',
      text,
      turnId: turnId ?? null,
    });
    return;
  }

  const timeline = timelineFromItem(
    item,
    parseActivityStatus(item.status, 'completed'),
    workspaceRootPath,
    turnId,
    null,
    completedAtMs,
  );

  if (timeline) {
    upsertTimeline(state, timeline);
  }
}

function timelineFromItem(
  item: CodexThreadItem,
  status: AiActivityStatus,
  workspaceRootPath?: string | null,
  turnId?: string | null,
  startedAtMs?: number | null,
  completedAtMs?: number | null,
): AiTimelineItem | null {
  const id = typeof item.id === 'string' ? item.id : `timeline-${item.type}`;
  const common = {
    completedAtMs: completedAtMs ?? null,
    durationMs: getOptionalNumber(item.durationMs),
    id,
    startedAtMs: startedAtMs ?? null,
    status: parseActivityStatus(item.status, status),
    turnId: turnId ?? null,
  };

  switch (item.type) {
    case 'commandExecution': {
      const actions = parseCommandActions(item.commandActions, workspaceRootPath);
      const command = typeof item.command === 'string' ? item.command : '';
      return {
        ...common,
        actions,
        command,
        cwd: typeof item.cwd === 'string' ? item.cwd : null,
        exitCode: getOptionalNumber(item.exitCode),
        kind: 'command',
        label: commandLabel(actions, command),
        output: createOutputPreview(
          typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : '',
        ),
        terminalInputs: [],
      };
    }
    case 'fileChange':
      return {
        ...common,
        changes: parseFileChanges(item.changes, workspaceRootPath),
        kind: 'file',
        label: fileChangeLabel(item.changes),
      };
    case 'mcpToolCall':
      return {
        ...common,
        arguments: item.arguments,
        error: stringifyToolValue(item.error),
        kind: 'mcp',
        label: `调用 ${[item.server, item.tool].filter((value) => typeof value === 'string').join(' · ') || 'MCP 工具'}`,
        progress: null,
        result: item.result,
        server: typeof item.server === 'string' ? item.server : null,
        tool: typeof item.tool === 'string' ? item.tool : 'MCP 工具',
      };
    case 'dynamicToolCall':
      return {
        ...common,
        arguments: item.arguments,
        error: item.success === false ? '工具调用失败' : null,
        kind: 'dynamic',
        label: `调用 ${[item.namespace, item.tool].filter((value) => typeof value === 'string').join(' · ') || '工具'}`,
        progress: null,
        result: item.contentItems,
        server: typeof item.namespace === 'string' ? item.namespace : null,
        tool: typeof item.tool === 'string' ? item.tool : '工具',
      };
    case 'webSearch':
      return {
        ...common,
        action: webSearchAction(item),
        detail: webSearchDetail(item),
        kind: 'search',
        label: webSearchLabel(item),
        query: typeof item.query === 'string' ? item.query : null,
      };
    case 'plan':
      return {
        ...common,
        explanation: null,
        id: `plan-${turnId ?? id}`,
        kind: 'plan',
        label: common.status === 'inProgress' ? '正在更新计划' : '已更新计划',
        steps: [],
        text: typeof item.text === 'string' ? item.text : null,
      };
    case 'collabAgentToolCall':
    case 'subAgentActivity':
      return {
        ...common,
        detail: stringifyToolValue(item.prompt ?? item.agentsStates ?? item.agentPath),
        kind: 'collab',
        label: collabLabel(item),
      };
    case 'imageView':
    case 'imageGeneration':
      return {
        ...common,
        detail: stringifyToolValue(item.path ?? item.result),
        kind: 'image',
        label: item.type === 'imageView' ? '查看了图像' : '生成了图像',
      };
    case 'contextCompaction':
      return {
        ...common,
        detail: null,
        id: `context-${turnId ?? 'unknown'}`,
        kind: 'context',
        label: '上下文已自动压缩',
      };
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return {
        ...common,
        detail: typeof item.review === 'string' ? item.review : null,
        kind: 'status',
        label: item.type === 'enteredReviewMode' ? '进入审查模式' : '退出审查模式',
      };
    case 'reasoning':
    case 'hookPrompt':
    case 'userMessage':
    case 'agentMessage':
      return null;
    default:
      return typeof item.type === 'string'
        ? {
            ...common,
            detail: null,
            kind: 'status',
            label: `执行了 ${item.type}`,
          }
        : null;
  }
}

function upsertMessage(state: AiConversationState, message: AiChatMessage) {
  const existing = state.entries.find(
    (item): item is AiMessageEntry =>
      item.type === 'message' && item.id === message.id,
  );

  if (existing) {
    const index = state.entries.indexOf(existing);
    state.entries[index] = {
      ...existing,
      ...message,
      mentions: message.mentions ?? existing.mentions,
      phase: message.phase ?? existing.phase,
      text: message.text || existing.text,
      turnId: message.turnId ?? existing.turnId,
    };
  } else {
    state.entries.push({ type: 'message', ...message });
  }
}

function updateTimeline(
  state: AiConversationState,
  itemId: string | null,
  update: (item: AiTimelineItem) => AiTimelineItem,
) {
  if (!itemId) {
    return;
  }
  const index = state.entries.findIndex(
    (candidate) => candidate.type === 'timeline' && candidate.id === itemId,
  );
  if (index >= 0) {
    state.entries[index] = {
      type: 'timeline',
      ...update(state.entries[index] as AiTimelineEntry),
    };
  }
}

const MAX_OUTPUT_CHARACTERS = 65_536;

export function createOutputPreview(value: string): AiOutputPreview {
  const totalLines = countOutputLines(value);
  if (value.length <= MAX_OUTPUT_CHARACTERS) {
    return { head: value, tail: '', totalLines, truncated: false };
  }
  const half = MAX_OUTPUT_CHARACTERS / 2;
  return {
    head: value.slice(0, half),
    tail: value.slice(-half),
    totalLines,
    truncated: true,
  };
}

function appendOutputPreview(
  preview: AiOutputPreview,
  delta: string,
): AiOutputPreview {
  if (!delta) {
    return preview;
  }
  if (!preview.truncated) {
    return createOutputPreview(preview.head + delta);
  }
  const half = MAX_OUTPUT_CHARACTERS / 2;
  return {
    ...preview,
    tail: (preview.tail + delta).slice(-half),
    totalLines:
      preview.totalLines + countNewlines(delta) + (preview.totalLines === 0 ? 1 : 0),
  };
}

export function getOutputPreviewLines(
  preview: AiOutputPreview,
  maxLines = 5,
) {
  const headLines = preview.head.split(/\r?\n/);
  const tailLines = preview.tail ? preview.tail.split(/\r?\n/) : [];
  const allLines = preview.truncated ? [...headLines, ...tailLines] : headLines;
  if (!preview.head && !preview.tail) {
    return { head: [], omittedLines: 0, tail: [] };
  }
  if (!preview.truncated && allLines.length <= maxLines) {
    return { head: allLines, omittedLines: 0, tail: [] };
  }
  const headCount = Math.max(1, Math.floor((maxLines - 1) / 2));
  const tailCount = Math.max(1, maxLines - headCount - 1);
  return {
    head: headLines.slice(0, headCount),
    omittedLines: Math.max(preview.totalLines - headCount - tailCount, 1),
    tail: (preview.truncated ? tailLines : allLines).slice(-tailCount),
  };
}

function countOutputLines(value: string) {
  return value ? countNewlines(value) + 1 : 0;
}

function countNewlines(value: string) {
  return (value.match(/\n/g) ?? []).length;
}

export interface AiActivityGroup {
  activities: AiTimelineItem[];
  durationMs: number | null;
  id: string;
  status: AiActivityStatus | 'waitingApproval';
  summary: string;
}

export type AiTraceSegment =
  | { message: AiMessageEntry; type: 'commentary' }
  | ({ type: 'group' } & AiActivityGroup);

export interface AiTraceBlock {
  approvals: AiApprovalRequest[];
  durationMs: number | null;
  historical: boolean;
  id: string;
  segments: AiTraceSegment[];
  startedAtMs: number | null;
  status: AiActivityStatus | 'interrupted' | 'waitingApproval';
  turnId: string | null;
  type: 'trace';
}

export interface AiChangeSummaryBlock {
  additions: number;
  changes: AiFileChange[];
  deletions: number;
  id: string;
  turnId: string;
  type: 'changes';
}

export type AiConversationBlock =
  | AiMessageEntry
  | AiTraceBlock
  | AiChangeSummaryBlock;

export function buildConversationBlocks(
  state: AiConversationState,
): AiConversationBlock[] {
  const blocks: AiConversationBlock[] = [];
  const consumedApprovals = new Set<string>();
  const consumedChangeSummaries = new Set<string>();
  let index = 0;

  while (index < state.entries.length) {
    const entry = state.entries[index];
    if (!isTraceEntry(entry)) {
      if (entry.type === 'message' && entry.text) {
        blocks.push(entry);
        const turnId = entry.turnId ?? null;
        if (
          entry.role === 'assistant' &&
          turnId &&
          (entry.phase === 'final_answer' ||
            isLastAssistantMessageForTurn(state.entries, index, turnId))
        ) {
          const summary = createChangeSummaryBlock(state, turnId);
          if (summary) {
            blocks.push(summary);
            consumedChangeSummaries.add(turnId);
          }
        }
      }
      index += 1;
      continue;
    }

    const traceEntries: AiConversationEntry[] = [];
    const traceTurnId = entry.turnId ?? null;
    while (
      index < state.entries.length &&
      isTraceEntry(state.entries[index]) &&
      (state.entries[index].turnId ?? null) === traceTurnId
    ) {
      traceEntries.push(state.entries[index]);
      index += 1;
    }
    const turnId = traceTurnId;
    const activityIds = new Set(
      traceEntries
        .filter((item): item is AiTimelineEntry => item.type === 'timeline')
        .map((item) => item.id),
    );
    const approvals = state.approvals.filter((approval) => {
      const matches = approval.itemId
        ? activityIds.has(approval.itemId)
        : approval.turnId
          ? approval.turnId === turnId
          : turnId === state.activeTurnId;
      if (matches) {
        consumedApprovals.add(String(approval.id));
      }
      return matches;
    });
    blocks.push(createTraceBlock(traceEntries, approvals, state.turns, turnId));
  }

  const orphanApprovals = state.approvals.filter(
    (approval) => !consumedApprovals.has(String(approval.id)),
  );
  if (orphanApprovals.length > 0) {
    blocks.push(
      createTraceBlock([], orphanApprovals, state.turns, state.activeTurnId),
    );
  }
  for (const turnId of Object.keys(state.turns)) {
    if (consumedChangeSummaries.has(turnId)) continue;
    const summary = createChangeSummaryBlock(state, turnId);
    if (summary) blocks.push(summary);
  }
  return blocks;
}

function isLastAssistantMessageForTurn(
  entries: AiConversationEntry[],
  index: number,
  turnId: string,
) {
  return !entries.slice(index + 1).some(
    (entry) =>
      entry.type === 'message' &&
      entry.role === 'assistant' &&
      entry.phase !== 'commentary' &&
      entry.turnId === turnId,
  );
}

function createChangeSummaryBlock(
  state: AiConversationState,
  turnId: string,
): AiChangeSummaryBlock | null {
  const turn = state.turns[turnId];
  if (!turn || turn.status !== 'completed') {
    return null;
  }

  const timelineChanges = state.entries.flatMap((entry) =>
    entry.type === 'timeline' &&
    entry.kind === 'file' &&
    entry.status === 'completed' &&
    entry.turnId === turnId
      ? entry.changes
      : [],
  );
  const diffChanges = turn.diff
    ? parseUnifiedDiffFileChanges(
        turn.diff,
        timelineChanges.find((change) => change.absolutePath)?.absolutePath
          ? inferWorkspaceRoot(timelineChanges)
          : null,
      )
    : [];
  const changes = mergeChangeSummaries(timelineChanges, diffChanges);
  if (changes.length === 0) {
    return null;
  }

  return {
    additions: changes.reduce((total, change) => total + change.additions, 0),
    changes,
    deletions: changes.reduce((total, change) => total + change.deletions, 0),
    id: `changes-${turnId}`,
    turnId,
    type: 'changes',
  };
}

function inferWorkspaceRoot(changes: AiFileChange[]) {
  for (const change of changes) {
    if (!change.absolutePath) continue;
    const normalizedAbsolute = change.absolutePath.replaceAll('\\', '/');
    const normalizedRelative = change.path.replaceAll('\\', '/');
    if (normalizedAbsolute.endsWith(`/${normalizedRelative}`)) {
      return normalizedAbsolute.slice(0, -normalizedRelative.length - 1);
    }
  }
  return null;
}

function mergeChangeSummaries(
  timelineChanges: AiFileChange[],
  diffChanges: AiFileChange[],
) {
  const merged = new Map<string, AiFileChange>();
  for (const change of [...timelineChanges, ...diffChanges]) {
    const matchingKeys = [...merged.entries()]
      .filter(([, previous]) => changeSummariesReferToSameFile(previous, change))
      .map(([key]) => key);
    const key =
      matchingKeys.length === 1
        ? matchingKeys[0]
        : normalizeChangeSummaryPath(change.absolutePath ?? change.path);
    const previous = merged.get(key);
    merged.set(key, {
      ...previous,
      ...change,
      absolutePath: change.absolutePath ?? previous?.absolutePath ?? null,
      movePath: change.movePath ?? previous?.movePath ?? null,
      path: preferredChangeSummaryPath(previous?.path, change.path),
    });
  }
  return [...merged.values()];
}

function changeSummariesReferToSameFile(
  left: AiFileChange,
  right: AiFileChange,
) {
  const leftPaths = [left.absolutePath, left.path].filter(
    (value): value is string => Boolean(value),
  );
  const rightPaths = [right.absolutePath, right.path].filter(
    (value): value is string => Boolean(value),
  );
  return leftPaths.some((leftPath) =>
    rightPaths.some((rightPath) => changeSummaryPathsMatch(leftPath, rightPath)),
  );
}

function changeSummaryPathsMatch(left: string, right: string) {
  const normalizedLeft = normalizeChangeSummaryPath(left);
  const normalizedRight = normalizeChangeSummaryPath(right);
  const windows =
    /^[A-Za-z]:\//.test(normalizedLeft) ||
    /^[A-Za-z]:\//.test(normalizedRight);
  const comparableLeft = windows
    ? normalizedLeft.toLocaleLowerCase()
    : normalizedLeft;
  const comparableRight = windows
    ? normalizedRight.toLocaleLowerCase()
    : normalizedRight;
  if (comparableLeft === comparableRight) {
    return true;
  }
  const leftAbsolute = isAbsoluteChangeSummaryPath(normalizedLeft);
  const rightAbsolute = isAbsoluteChangeSummaryPath(normalizedRight);
  if (leftAbsolute === rightAbsolute) {
    return false;
  }
  const absolutePath = leftAbsolute ? comparableLeft : comparableRight;
  const relativePath = leftAbsolute ? comparableRight : comparableLeft;
  return absolutePath.endsWith(`/${relativePath}`);
}

function preferredChangeSummaryPath(
  previousPath: string | undefined,
  nextPath: string,
) {
  if (
    previousPath &&
    isAbsoluteChangeSummaryPath(nextPath) &&
    !isAbsoluteChangeSummaryPath(previousPath)
  ) {
    return previousPath;
  }
  return nextPath;
}

function normalizeChangeSummaryPath(value: string) {
  const normalized = value.replaceAll('\\', '/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function isAbsoluteChangeSummaryPath(value: string) {
  const normalized = normalizeChangeSummaryPath(value);
  return normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized);
}

function createTraceBlock(
  entries: AiConversationEntry[],
  approvals: AiApprovalRequest[],
  turns: Record<string, AiTurnState>,
  turnId: string | null,
): AiTraceBlock {
  const segments: AiTraceSegment[] = [];
  let pendingActivities: AiTimelineItem[] = [];
  const flushActivities = () => {
    if (pendingActivities.length > 0) {
      segments.push(createActivityGroup(pendingActivities, approvals));
      pendingActivities = [];
    }
  };

  for (const entry of entries) {
    if (entry.type === 'message') {
      flushActivities();
      if (entry.text) {
        segments.push({ message: entry, type: 'commentary' });
      }
      continue;
    }
    if (isStandaloneActivity(entry)) {
      flushActivities();
      segments.push(createActivityGroup([entry], approvals));
    } else {
      pendingActivities.push(entry);
    }
  }
  flushActivities();

  const turn = turnId ? turns[turnId] : undefined;
  const activities = entries.filter(
    (entry): entry is AiTimelineEntry => entry.type === 'timeline',
  );
  return {
    approvals,
    durationMs: turn?.durationMs ?? groupDuration(activities),
    historical: turn?.historical ?? false,
    id: `trace-${turnId ?? 'orphan'}-${entries[0]?.id ?? approvals[0]?.id ?? 'active'}`,
    segments,
    startedAtMs: turn?.startedAtMs ?? minimumStartedAt(activities),
    status: traceStatus(activities, approvals, turn),
    turnId,
    type: 'trace',
  };
}

function createActivityGroup(
  activities: AiTimelineItem[],
  approvals: AiApprovalRequest[],
): AiTraceSegment {
  const hasApproval = approvals.some((approval) =>
    activities.some((activity) => activity.id === approval.itemId),
  );
  return {
    activities,
    durationMs: groupDuration(activities),
    id: `group-${activities[0]?.id ?? 'approval'}`,
    status: hasApproval ? 'waitingApproval' : activityStatus(activities),
    summary: summarizeActivityGroup(activities),
    type: 'group',
  };
}

export function summarizeActivityGroup(activities: AiTimelineItem[]) {
  const parts: string[] = [];
  const files = activities.filter((activity) => activity.kind === 'file');
  const commands = activities.filter((activity) => activity.kind === 'command');
  const mcp = activities.filter(
    (activity) => activity.kind === 'mcp' || activity.kind === 'dynamic',
  );
  const searches = activities.filter((activity) => activity.kind === 'search');
  const collab = activities.filter((activity) => activity.kind === 'collab');
  const images = activities.filter((activity) => activity.kind === 'image');

  if (files.length > 0) {
    parts.push(`编辑了${files.length > 1 ? ` ${files.length} 个` : ''}文件`);
  }
  if (commands.length > 0) {
    const readActions = commands.flatMap((activity) =>
      activity.kind === 'command'
        ? activity.actions.filter((action) => action.type === 'read')
        : [],
    );
    const exploratory = commands.every(
      (activity) =>
        activity.kind === 'command' &&
        activity.actions.length > 0 &&
        activity.actions.every((action) => action.type !== 'unknown'),
    );
    if (exploratory && readActions.length > 0) {
      parts.push(
        `读取了${readActions.length > 1 ? ` ${readActions.length} 个` : ''}文件`,
      );
    } else if (exploratory) {
      parts.push('检查了工作区');
    } else {
      parts.push(`运行了${commands.length > 1 ? ` ${commands.length} 个` : ''}命令`);
    }
  }
  if (mcp.length > 0) {
    parts.push(`调用了${mcp.length > 1 ? ` ${mcp.length} 个` : ''}工具`);
  }
  if (searches.length > 0) {
    parts.push(`搜索了${searches.length > 1 ? ` ${searches.length} 次` : ''}网页`);
  }
  if (collab.length > 0) {
    parts.push('协调了子任务');
  }
  if (images.length > 0) {
    parts.push('处理了图像');
  }
  if (parts.length === 0) {
    return activities[0]?.label ?? '处理了任务';
  }
  return parts.join('并');
}

function isTraceEntry(entry: AiConversationEntry) {
  return (
    entry.type === 'timeline' ||
    (entry.type === 'message' &&
      entry.role === 'assistant' &&
      entry.phase === 'commentary')
  );
}

function isStandaloneActivity(activity: AiTimelineItem) {
  return ['context', 'plan', 'status'].includes(activity.kind);
}

function activityStatus(activities: AiTimelineItem[]): AiActivityStatus {
  if (activities.some((activity) => activity.status === 'failed')) return 'failed';
  if (activities.some((activity) => activity.status === 'declined')) return 'declined';
  if (activities.some((activity) => activity.status === 'inProgress')) return 'inProgress';
  return 'completed';
}

function traceStatus(
  activities: AiTimelineItem[],
  approvals: AiApprovalRequest[],
  turn?: AiTurnState,
): AiTraceBlock['status'] {
  if (approvals.length > 0) return 'waitingApproval';
  const status = activityStatus(activities);
  if (status !== 'completed') return status;
  return turn?.status ?? 'completed';
}

function groupDuration(activities: AiTimelineItem[]) {
  const durations = activities
    .map((activity) => activity.durationMs)
    .filter((value): value is number => typeof value === 'number');
  return durations.length > 0
    ? durations.reduce((total, duration) => total + duration, 0)
    : null;
}

function minimumStartedAt(activities: AiTimelineItem[]) {
  const values = activities
    .map((activity) => activity.startedAtMs)
    .filter((value): value is number => typeof value === 'number');
  return values.length > 0 ? Math.min(...values) : null;
}

function upsertTimeline(state: AiConversationState, item: AiTimelineItem) {
  const index = state.entries.findIndex(
    (candidate) =>
      candidate.type === 'timeline' && candidate.id === item.id,
  );

  if (index >= 0) {
    state.entries[index] = {
      type: 'timeline',
      ...mergeTimelineItem(state.entries[index] as AiTimelineEntry, item),
    };
  } else {
    state.entries.push({ type: 'timeline', ...item });
  }
}

function mergeTimelineItem(
  previous: AiTimelineItem,
  item: AiTimelineItem,
): AiTimelineItem {
  if (previous.kind !== item.kind) {
    return item;
  }

  const common = {
    completedAtMs: item.completedAtMs ?? previous.completedAtMs,
    durationMs: item.durationMs ?? previous.durationMs,
    startedAtMs: item.startedAtMs ?? previous.startedAtMs,
    turnId: item.turnId ?? previous.turnId,
  };

  if (previous.kind === 'command' && item.kind === 'command') {
    const hasOutput = Boolean(item.output.head || item.output.tail);
    return {
      ...item,
      ...common,
      actions: item.actions.length > 0 ? item.actions : previous.actions,
      command: item.command || previous.command,
      cwd: item.cwd ?? previous.cwd,
      label: item.actions.length > 0 ? item.label : previous.label,
      output: hasOutput ? item.output : previous.output,
      terminalInputs:
        item.terminalInputs.length > 0
          ? item.terminalInputs
          : previous.terminalInputs,
    };
  }

  if (previous.kind === 'file' && item.kind === 'file') {
    return {
      ...item,
      ...common,
      changes: item.changes.length > 0 ? item.changes : previous.changes,
      label: item.changes.length > 0 ? item.label : previous.label,
    };
  }

  if (
    (previous.kind === 'mcp' || previous.kind === 'dynamic') &&
    previous.kind === item.kind &&
    (item.kind === 'mcp' || item.kind === 'dynamic')
  ) {
    return {
      ...item,
      ...common,
      arguments: item.arguments ?? previous.arguments,
      error: item.error ?? previous.error,
      progress: item.progress ?? previous.progress,
      result: item.result ?? previous.result,
      server: item.server ?? previous.server,
      tool: item.tool || previous.tool,
    };
  }

  if (previous.kind === 'plan' && item.kind === 'plan') {
    return {
      ...item,
      ...common,
      explanation: item.explanation ?? previous.explanation,
      steps: item.steps.length > 0 ? item.steps : previous.steps,
      text: item.text ?? previous.text,
    };
  }

  return { ...item, ...common };
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

export function createDocumentAwareUserInput(
  text: string,
  mentions: AiDocumentInputMention[],
) {
  const textElements: Array<{
    byteRange: { end: number; start: number };
    placeholder: string;
  }> = [];
  let inputCursor = 0;
  let modelText = '';

  for (const mention of [...mentions].sort(
    (left, right) => left.start - right.start,
  )) {
    const relativePath = normalizeWorkspaceRelativePath(mention.relativePath);
    if (
      !relativePath ||
      mention.start < inputCursor ||
      mention.start < 0 ||
      mention.end <= mention.start ||
      mention.end > text.length
    ) {
      continue;
    }

    modelText += text.slice(inputCursor, mention.start);
    const reference = JSON.stringify(relativePath);
    const start = utf8ByteLength(modelText);
    modelText += reference;
    textElements.push({
      byteRange: {
        start,
        end: utf8ByteLength(modelText),
      },
      placeholder: mention.label,
    });
    inputCursor = mention.end;
  }

  modelText += text.slice(inputCursor);
  return { text: modelText, textElements };
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

function messageFromUserMessage(
  item: CodexThreadItem,
  workspaceRootPath?: string | null,
) {
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
      const referencedText = inputText.slice(start, end);
      const label = placeholder || referencedText;
      const mentionIndex = mentionInputs.findIndex(
        (mention, index) =>
          !usedMentionIndexes.has(index) &&
          (mention.name === placeholder || mention.name === referencedText),
      );

      if (mentionIndex >= 0) {
        usedMentionIndexes.add(mentionIndex);
        mentions.push({
          start: baseOffset + start,
          end: baseOffset + end,
          label,
          path: mentionInputs[mentionIndex].path,
        });
        continue;
      }

      const relativePath = parseHistoricalDocumentReference(referencedText);
      const absolutePath =
        relativePath && workspaceRootPath
          ? joinWorkspacePath(workspaceRootPath, relativePath)
          : null;
      if (!absolutePath) {
        continue;
      }

      mentions.push({
        start: baseOffset + start,
        end: baseOffset + end,
        label,
        path: absolutePath,
      });
    }
  }

  return {
    text,
    mentions: mentions.sort((left, right) => left.start - right.start),
  };
}

function parseHistoricalDocumentReference(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'string'
      ? normalizeWorkspaceRelativePath(parsed)
      : null;
  } catch {
    return null;
  }
}

function normalizeWorkspaceRelativePath(value: string) {
  const normalized = value.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..',
    )
  ) {
    return null;
  }

  return segments.join('/');
}

function joinWorkspacePath(root: string, relativePath: string) {
  if (!root) {
    return null;
  }

  const windowsRoot = /^[A-Za-z]:[\\/]/.test(root);
  const separator = windowsRoot ? '\\' : '/';
  const normalizedRoot = root.replace(/[\\/]+$/, '');
  const normalizedRelative = windowsRoot
    ? relativePath.replaceAll('/', '\\')
    : relativePath;

  if (!normalizedRoot && separator === '/') {
    return `/${normalizedRelative}`;
  }

  return `${normalizedRoot}${separator}${normalizedRelative}`;
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

function turnStateFromRecord(value: unknown, historical: boolean): AiTurnState {
  const record = isRecord(value) ? value : {};
  const id = getString(record, 'id') ?? 'unknown-turn';
  return {
    completedAtMs: secondsToMilliseconds(getNumber(record, 'completedAt')),
    diff: getString(record, 'diff'),
    durationMs: getNumber(record, 'durationMs'),
    historical,
    id,
    startedAtMs: secondsToMilliseconds(getNumber(record, 'startedAt')),
    status: parseTurnStatus(record.status),
  };
}

function secondsToMilliseconds(value: number | null) {
  return value === null ? null : value * 1_000;
}

function parseTurnStatus(value: unknown): AiTurnState['status'] {
  return matches(String(value), ['completed', 'failed', 'inProgress', 'interrupted'])
    ? (value as AiTurnState['status'])
    : 'completed';
}

function parseMessagePhase(value: unknown): AiMessagePhase {
  return value === 'commentary' || value === 'final_answer' ? value : null;
}

function parseActivityStatus(
  value: unknown,
  fallback: AiActivityStatus,
): AiActivityStatus {
  return matches(String(value), ['completed', 'declined', 'failed', 'inProgress'])
    ? (value as AiActivityStatus)
    : fallback;
}

function parseCommandActions(
  value: unknown,
  workspaceRootPath?: string | null,
): AiCommandAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate): AiCommandAction[] => {
    if (!isRecord(candidate)) {
      return [];
    }
    const command = getString(candidate, 'command') ?? '';
    if (candidate.type === 'read') {
      const path = getString(candidate, 'path');
      return [
        {
          command,
          documentPath: resolveWorkspaceItemPath(path, workspaceRootPath),
          name: getString(candidate, 'name') ?? path ?? '文件',
          path,
          type: 'read',
        },
      ];
    }
    if (candidate.type === 'listFiles') {
      return [{ command, path: getString(candidate, 'path'), type: 'listFiles' }];
    }
    if (candidate.type === 'search') {
      return [
        {
          command,
          path: getString(candidate, 'path'),
          query: getString(candidate, 'query'),
          type: 'search',
        },
      ];
    }
    return [{ command, type: 'unknown' }];
  });
}

function commandLabel(actions: AiCommandAction[], command: string) {
  if (actions.length === 1) {
    const [action] = actions;
    if (action.type === 'read') return `读取 ${action.name}`;
    if (action.type === 'listFiles') return `列出 ${action.path || '工作区文件'}`;
    if (action.type === 'search') {
      return `搜索 ${action.query || action.path || stripShellWrapper(action.command)}`;
    }
  }
  if (actions.length > 1 && actions.every((action) => action.type === 'read')) {
    return `读取 ${actions.length} 个文件`;
  }
  return `运行 ${stripShellWrapper(command) || '命令'}`;
}

export function stripShellWrapper(command: string) {
  const trimmed = command.trim();
  const match = trimmed.match(
    /^(?:\/bin\/)?(?:zsh|bash|sh)\s+(?:-lc|-c)\s+(["'])([\s\S]*)\1$/,
  );
  return match?.[2] ?? trimmed;
}

function parseFileChanges(
  value: unknown,
  workspaceRootPath?: string | null,
): AiFileChange[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate): AiFileChange[] => {
    if (!isRecord(candidate)) {
      return [];
    }
    const path = getString(candidate, 'path');
    if (!path) {
      return [];
    }
    const kindRecord = isRecord(candidate.kind) ? candidate.kind : {};
    const kind = matches(String(kindRecord.type), ['add', 'delete', 'update'])
      ? (kindRecord.type as AiFileChange['kind'])
      : 'update';
    const diff = getString(candidate, 'diff') ?? '';
    const { additions, deletions } = countDiffLines(diff);
    return [
      {
        absolutePath: resolveWorkspaceItemPath(path, workspaceRootPath),
        additions,
        deletions,
        diff,
        kind,
        movePath: getString(kindRecord, 'move_path'),
        path,
      },
    ];
  });
}

function countDiffLines(diff: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

function parseUnifiedDiffFileChanges(
  diff: string,
  workspaceRootPath?: string | null,
): AiFileChange[] {
  const sections: string[][] = [];
  let section: string[] = [];
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ') && section.length > 0) {
      sections.push(section);
      section = [];
    }
    section.push(line);
  }
  if (section.length > 0) sections.push(section);

  return sections.flatMap((lines): AiFileChange[] => {
    const oldPath = diffHeaderPath(
      lines.find((line) => line.startsWith('--- '))?.slice(4) ?? null,
    );
    const newPath = diffHeaderPath(
      lines.find((line) => line.startsWith('+++ '))?.slice(4) ?? null,
    );
    const path = newPath === '/dev/null' ? oldPath : newPath;
    if (!path || path === '/dev/null') return [];

    const sectionDiff = lines.join('\n');
    const { additions, deletions } = countDiffLines(sectionDiff);
    return [
      {
        absolutePath: resolveWorkspaceItemPath(path, workspaceRootPath),
        additions,
        deletions,
        diff: sectionDiff,
        kind:
          oldPath === '/dev/null'
            ? 'add'
            : newPath === '/dev/null'
              ? 'delete'
              : 'update',
        movePath: null,
        path,
      },
    ];
  });
}

function diffHeaderPath(value: string | null) {
  if (!value) return null;
  const withoutTimestamp = value.replace(/\t.*$/, '').trim();
  let decoded = withoutTimestamp;
  if (withoutTimestamp.startsWith('"')) {
    try {
      decoded = JSON.parse(withoutTimestamp) as string;
    } catch {
      return null;
    }
  }
  if (decoded === '/dev/null') return decoded;
  return decoded.replace(/^[ab]\//, '');
}

function fileChangeLabel(value: unknown) {
  const changes = Array.isArray(value) ? value : [];
  if (changes.length === 0) return '修改文件';
  if (changes.length > 1) return `修改 ${changes.length} 个文件`;
  const change = isRecord(changes[0]) ? changes[0] : {};
  return `修改 ${getString(change, 'path') ?? '文件'}`;
}

function resolveWorkspaceItemPath(
  path: string | null,
  workspaceRootPath?: string | null,
) {
  if (!path || !workspaceRootPath) {
    return null;
  }
  const windows = /^[A-Za-z]:[\\/]/.test(workspaceRootPath);
  const normalizedRoot = workspaceRootPath.replaceAll('\\', '/').replace(/\/$/, '');
  const normalizedPath = path.replaceAll('\\', '/');
  const absolute = normalizedPath.startsWith('/') || /^[A-Za-z]:\//.test(normalizedPath);
  if (absolute) {
    const comparableRoot = windows ? normalizedRoot.toLocaleLowerCase() : normalizedRoot;
    const comparablePath = windows ? normalizedPath.toLocaleLowerCase() : normalizedPath;
    if (
      comparablePath !== comparableRoot &&
      !comparablePath.startsWith(`${comparableRoot}/`)
    ) {
      return null;
    }
    return windows ? normalizedPath.replaceAll('/', '\\') : normalizedPath;
  }
  const relative = normalizeWorkspaceRelativePath(normalizedPath);
  return relative ? joinWorkspacePath(workspaceRootPath, relative) : null;
}

function parsePlanSteps(value: unknown): AiPlanStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate): AiPlanStep[] => {
    if (!isRecord(candidate)) return [];
    const step = getString(candidate, 'step');
    if (!step) return [];
    const status = matches(String(candidate.status), [
      'completed',
      'inProgress',
      'pending',
    ])
      ? (candidate.status as AiPlanStep['status'])
      : 'pending';
    return [{ status, step }];
  });
}

function contextActivity(turnId: string): AiTimelineItem {
  return {
    completedAtMs: null,
    detail: null,
    durationMs: null,
    id: `context-${turnId}`,
    kind: 'context',
    label: '上下文已自动压缩',
    startedAtMs: null,
    status: 'completed',
    turnId,
  };
}

function collabLabel(item: CodexThreadItem) {
  if (item.type === 'subAgentActivity') return '子任务正在处理';
  const tool = typeof item.tool === 'string' ? item.tool : '协作工具';
  return `调用 ${tool}`;
}

function stringifyToolValue(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function supportedApprovalChoices(
  bridgeChoices: unknown,
  availableDecisions: unknown,
  method: string,
): AiApprovalChoice[] {
  if (Array.isArray(bridgeChoices)) {
    return bridgeChoices.flatMap(parseBridgeApprovalChoice);
  }

  if (method === 'item/permissions/requestApproval') {
    return [];
  }

  if (!Array.isArray(availableDecisions)) {
    return [];
  }

  return availableDecisions.flatMap((decision, index) => {
    if (typeof decision === 'string') {
      return approvalChoiceForKind(decision, decision);
    }
    if (!isRecord(decision)) return [];
    if (isRecord(decision.acceptWithExecpolicyAmendment)) {
      return approvalChoiceForKind(
        `candidate:${index}`,
        'acceptWithExecpolicyAmendment',
      );
    }
    if (isRecord(decision.applyNetworkPolicyAmendment)) {
      return approvalChoiceForKind(
        `candidate:${index}`,
        'applyNetworkPolicyAmendment',
      );
    }
    return [];
  });
}

function parseBridgeApprovalChoice(value: unknown): AiApprovalChoice[] {
  if (!isRecord(value)) return [];
  const id = getString(value, 'id');
  const kind = getString(value, 'kind');
  const label = getString(value, 'label');
  if (!id || !kind || !label || !isApprovalChoiceKind(kind)) return [];
  return [{
    description: getString(value, 'description'),
    id,
    kind,
    label,
  }];
}

function approvalChoiceForKind(id: string, kind: string): AiApprovalChoice[] {
  const labels: Partial<Record<AiApprovalChoiceKind, [string, string | null]>> = {
    accept: ['允许一次', null],
    acceptForSession: ['本次任务允许', '同类操作在当前任务中不再询问'],
    acceptWithExecpolicyAmendment: ['允许并记住命令规则', '仅允许服务端建议的命令规则'],
    applyNetworkPolicyAmendment: ['应用联网规则', '仅应用服务端建议的主机访问规则'],
    cancel: ['拒绝并停止', '拒绝操作并中断当前任务'],
    decline: ['拒绝并继续', '拒绝操作，但允许 Codex 尝试其他方案'],
  };
  if (!isApprovalChoiceKind(kind) || !labels[kind]) return [];
  return [{ description: labels[kind]![1], id, kind, label: labels[kind]![0] }];
}

function isApprovalChoiceKind(value: string): value is AiApprovalChoiceKind {
  return matches(value, [
    'accept',
    'acceptForSession',
    'acceptWithExecpolicyAmendment',
    'applyNetworkPolicyAmendment',
    'cancel',
    'decline',
    'denyPermissions',
    'grantPermissionsForSession',
    'grantPermissionsForTurn',
    'grantPermissionsForTurnStrict',
  ]);
}

function describePermissionRequest(permissions: Record<string, unknown>) {
  const parts: string[] = [];
  if (isRecord(permissions.network)) {
    const enabled = permissions.network.enabled;
    if (enabled === true) parts.push('访问互联网');
  }
  if (isRecord(permissions.fileSystem)) {
    const entries = permissions.fileSystem.entries;
    if (Array.isArray(entries)) {
      for (const entry of entries.slice(0, 8)) {
        if (!isRecord(entry)) continue;
        const access = getString(entry, 'access');
        const path = permissionPathLabel(entry.path);
        if (!access || !path) continue;
        const accessLabel =
          access === 'read' ? '读取' : access === 'write' ? '写入' : '禁止';
        parts.push(`${accessLabel}：${path}`);
      }
      if (entries.length > 8) {
        parts.push(`另有 ${entries.length - 8} 个路径范围`);
      }
    }
  }
  return parts.length > 0
    ? parts.join('\n')
    : '请求临时扩展文件或网络访问范围';
}

function permissionPathLabel(value: unknown) {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return null;
  if (value.type === 'path') return getString(value, 'path');
  if (value.type === 'glob_pattern') return getString(value, 'pattern');
  if (value.type === 'special') return getString(value, 'value');
  return null;
}

function approvalRiskLabel(value: string) {
  if (value === 'low') return '低';
  if (value === 'medium') return '中';
  if (value === 'high') return '高';
  if (value === 'critical') return '严重';
  return value;
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

function webSearchAction(item: CodexThreadItem) {
  if (!isRecord(item.action)) return null;
  return getString(item.action, 'type');
}

function webSearchLabel(item: CodexThreadItem) {
  const action = webSearchAction(item);
  if (action === 'open_page') return '打开网页';
  if (action === 'find_in_page') return '在网页中查找';
  return '搜索网页';
}

function isApprovalMethod(method: string | undefined): method is string {
  return matches(method, [
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
    'item/permissions/requestApproval',
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

function getNumber(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'number' && Number.isFinite(value[key])
    ? value[key]
    : null;
}

function getOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecord(value: Record<string, unknown>, key: string) {
  return isRecord(value[key]) ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

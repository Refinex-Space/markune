import type {
  AiPanelAction,
  AiPanelState,
  AiRuntimeEvent,
} from './ai-types';

export function createInitialAiPanelState(): AiPanelState {
  return {
    error: null,
    messages: [],
    permissions: [],
    profiles: [],
    runState: null,
    selectedProfileId: null,
    session: null,
    status: 'idle',
    thinking: [],
    tools: [],
    usage: null,
  };
}

export function reduceAiPanelState(
  state: AiPanelState,
  action: AiPanelAction,
): AiPanelState {
  switch (action.type) {
    case 'profilesLoaded': {
      const explicitSelectedProfileId = Object.prototype.hasOwnProperty.call(
        action,
        'selectedProfileId',
      );
      const selectedProfileId =
        explicitSelectedProfileId
          ? (action.selectedProfileId ?? null)
          : (state.selectedProfileId ??
            action.profiles.find(
              (profile) => profile.detection.status === 'available',
            )?.id ??
            action.profiles[0]?.id ??
            null);

      return {
        ...state,
        profiles: action.profiles,
        selectedProfileId,
      };
    }
    case 'profileSelected':
      return {
        ...state,
        selectedProfileId: action.profileId,
      };
    case 'connectRequested':
      return {
        ...state,
        error: null,
        status: 'connecting',
      };
    case 'userMessageSubmitted':
      return {
        ...state,
        error: null,
        messages: [
          ...state.messages,
          {
            content: action.content,
            id: action.id,
            images: action.images,
            references: action.references,
            role: 'user',
            selection: action.selection,
          },
        ],
        status: 'streaming',
      };
    case 'conversationRestored':
      return {
        ...state,
        error: null,
        messages: action.conversation.messages,
        permissions: action.conversation.permissions,
        runState: action.conversation.runState ?? null,
        session: null,
        status: 'idle',
        thinking: action.conversation.thinking ?? [],
        tools: action.conversation.tools,
        usage: action.conversation.usage ?? null,
      };
    case 'runtimeEventReceived':
      return applyRuntimeEvent(state, action.event);
    case 'errorRaised':
      return {
        ...state,
        error: action.message,
        status: 'error',
      };
    case 'sessionCleared':
      return {
        ...state,
        error: null,
        messages: [],
        permissions: [],
        runState: null,
        session: null,
        status: 'idle',
        thinking: [],
        tools: [],
        usage: null,
      };
    case 'cleared':
      return createInitialAiPanelState();
  }
}

function applyRuntimeEvent(
  state: AiPanelState,
  event: AiRuntimeEvent,
): AiPanelState {
  switch (event.type) {
    case 'sessionStarted':
      return {
        ...state,
        error: null,
        session: event.session,
        status: 'idle',
      };
    case 'messageDelta':
      return {
        ...state,
        messages: appendAssistantDelta(
          state.messages,
          event.messageId,
          event.delta,
        ),
        status: 'streaming',
      };
    case 'messageCompleted':
      return {
        ...state,
        status: 'idle',
      };
    case 'runState':
      return applyRunState(state, event);
    case 'thinkingDelta':
      return {
        ...state,
        status: 'streaming',
        thinking: appendThinkingDelta(
          state.thinking,
          event.messageId,
          event.delta,
          event.parentToolCallId,
        ),
      };
    case 'toolStarted':
      return {
        ...state,
        tools: upsertTool(state.tools, {
          id: event.toolCallId,
          input: event.input,
          name: event.toolName,
          parentToolCallId: event.parentToolCallId,
          status: 'running',
        }),
        status: 'streaming',
      };
    case 'toolInputDelta':
      return {
        ...state,
        tools: state.tools.map((tool) =>
          tool.id === event.toolCallId
            ? {
                ...tool,
                partialJson: `${tool.partialJson ?? ''}${event.partialJson}`,
              }
            : tool,
        ),
      };
    case 'toolCompleted':
      return {
        ...state,
        tools: upsertTool(state.tools, {
          durationMs: event.durationMs,
          id: event.toolCallId,
          input:
            state.tools.find((tool) => tool.id === event.toolCallId)?.input ??
            {},
          name: event.toolName,
          output: event.output,
          parentToolCallId: event.parentToolCallId,
          permissionRequestId: state.tools.find(
            (tool) => tool.id === event.toolCallId,
          )?.permissionRequestId,
          status: event.status,
        }),
      };
    case 'permissionPrompt':
      return {
        ...state,
        permissions: upsertPermission(state.permissions, {
          parentToolCallId: event.parentToolCallId,
          reason: event.reason,
          requestId: event.requestId,
          suggestions: event.suggestions,
          toolCallId: event.toolCallId,
          toolInput: event.toolInput,
          toolName: event.toolName,
        }),
        tools: upsertTool(state.tools, {
          id: event.toolCallId,
          input: event.toolInput,
          name: event.toolName,
          parentToolCallId: event.parentToolCallId,
          permissionRequestId: event.requestId,
          status: 'permissionPrompt',
        }),
        status: 'streaming',
      };
    case 'permissionDenied':
      return {
        ...state,
        tools: upsertTool(state.tools, {
          id: event.toolCallId,
          input: event.toolInput,
          name: event.toolName,
          status: 'denied',
        }),
      };
    case 'usageUpdated':
      return {
        ...state,
        usage: {
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
          inputTokens: event.inputTokens,
          model: event.model,
          outputTokens: event.outputTokens,
          totalCostUsd: event.totalCostUsd,
        },
      };
    case 'turnCompleted':
      return {
        ...state,
        status: event.cancelled ? 'stopped' : 'idle',
      };
    case 'sessionExited':
      return {
        ...state,
        session: null,
        status: 'stopped',
      };
    case 'error':
      return {
        ...state,
        error: event.message,
        status: 'error',
      };
  }
}

function applyRunState(
  state: AiPanelState,
  event: Extract<AiRuntimeEvent, { type: 'runState' }>,
): AiPanelState {
  const runState = {
    error: event.error,
    exitCode: event.exitCode,
    state: event.state,
  };

  if (event.state === 'running') {
    return { ...state, error: null, runState, status: 'streaming' };
  }

  if (event.state === 'failed') {
    return {
      ...state,
      error: event.error ?? 'AI 运行失败',
      runState,
      status: 'error',
    };
  }

  if (event.state === 'cancelled' || event.state === 'stopped') {
    return { ...state, runState, status: 'stopped' };
  }

  return { ...state, runState, status: 'idle' };
}

function appendAssistantDelta(
  messages: AiPanelState['messages'],
  messageId: string,
  delta: string,
) {
  const existing = messages.find((message) => message.id === messageId);

  if (!existing) {
    return [
      ...messages,
      {
        content: delta,
        id: messageId,
        role: 'assistant' as const,
      },
    ];
  }

  return messages.map((message) =>
    message.id === messageId
      ? { ...message, content: `${message.content}${delta}` }
      : message,
  );
}

function appendThinkingDelta(
  thinking: AiPanelState['thinking'],
  blockId: string,
  delta: string,
  parentToolCallId?: string,
) {
  const existing = thinking.find((block) => block.id === blockId);

  if (!existing) {
    return [
      ...thinking,
      {
        content: delta,
        id: blockId,
        parentToolCallId,
      },
    ];
  }

  return thinking.map((block) =>
    block.id === blockId
      ? {
          ...block,
          content: `${block.content}${delta}`,
          parentToolCallId: block.parentToolCallId ?? parentToolCallId,
        }
      : block,
  );
}

function upsertTool(
  tools: AiPanelState['tools'],
  nextTool: AiPanelState['tools'][number],
) {
  if (!tools.some((tool) => tool.id === nextTool.id)) {
    return [...tools, nextTool];
  }

  return tools.map((tool) =>
    tool.id === nextTool.id ? { ...tool, ...nextTool } : tool,
  );
}

function upsertPermission(
  permissions: AiPanelState['permissions'],
  nextPermission: AiPanelState['permissions'][number],
) {
  if (
    !permissions.some(
      (permission) => permission.requestId === nextPermission.requestId,
    )
  ) {
    return [...permissions, nextPermission];
  }

  return permissions.map((permission) =>
    permission.requestId === nextPermission.requestId
      ? { ...permission, ...nextPermission }
      : permission,
  );
}

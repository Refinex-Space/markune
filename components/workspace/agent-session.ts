import type {
  AuthMethod,
  InitializeResponse,
  SessionConfigOption,
  SessionModeState,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type { AgentProfile } from './agent-api';

import { inlineAgentImage, type AgentImageData } from './agent-image';

export interface AgentMessage {
  images?: AgentImageData[];
  references?: string[];
  id: string;
  role: 'user' | 'assistant' | 'thought' | 'tool' | 'plan' | 'notice';
  text: string;
  tool?: Record<string, unknown>;
  turnId?: string;
}
export interface AgentSessionRecord {
  id: string;
  profileId: string;
  agentId: string;
  agentName: string;
  agentVersion: string | null;
  rootPath: string;
  providerSessionId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
}
export interface AgentInteraction {
  id: string;
  kind: 'permission' | 'form' | 'url' | 'question' | 'plan';
  params: Record<string, unknown>;
  resolve: (value: unknown) => void;
  cancel: () => void;
}
export interface AgentView {
  record: AgentSessionRecord;
  phase:
    | 'idle'
    | 'connecting'
    | 'auth'
    | 'ready'
    | 'running'
    | 'cancelling'
    | 'disconnected'
    | 'error';
  error: string | null;
  capabilities: InitializeResponse['agentCapabilities'];
  authMethods: AuthMethod[];
  configOptions: SessionConfigOption[];
  modes: SessionModeState | null;
  interactions: AgentInteraction[];
  commands: { name: string; description: string; input?: unknown }[];
  usage: Record<string, unknown> | null;
}
export function newAgentRecord(
  rootPath: string,
  profile: AgentProfile,
): AgentSessionRecord {
  const time = Date.now();
  return {
    id: crypto.randomUUID(),
    profileId: profile.id,
    agentId: profile.agentId,
    agentName: profile.name,
    agentVersion: profile.version,
    rootPath,
    providerSessionId: null,
    title: '新会话',
    createdAt: time,
    updatedAt: time,
    messages: [],
  };
}
export function reduceAgentUpdate(
  messages: AgentMessage[],
  notification: SessionNotification,
  turnId: string,
): AgentMessage[] {
  const update = notification.update;
  const kind = update.sessionUpdate;
  if (
    kind === 'agent_message_chunk' ||
    kind === 'agent_thought_chunk' ||
    kind === 'user_message_chunk'
  ) {
    const role =
      kind === 'agent_message_chunk'
        ? 'assistant'
        : kind === 'user_message_chunk'
          ? 'user'
          : 'thought';
    const content = update.content;
    const image = inlineAgentImage(content);
    const text =
      content.type === 'text'
        ? content.text
        : content.type === 'resource_link'
          ? `[${content.name}](${content.uri})`
          : content.type === 'image'
            ? image
              ? ''
              : '[不支持的图片]'
            : content.type === 'resource' && 'text' in content.resource
              ? content.resource.text
              : '[资源]';
    const messageId =
      'messageId' in update && typeof update.messageId === 'string'
        ? update.messageId
        : null;
    const previous = messages.at(-1);
    if (
      previous &&
      previous.role === role &&
      previous.turnId === turnId &&
      (!messageId || previous.id === messageId)
    )
      return [
        ...messages.slice(0, -1),
        {
          ...previous,
          text: previous.text + text,
          images: image
            ? [...(previous.images ?? []), image]
            : previous.images,
        },
      ];
    return [
      ...messages,
      {
        id: messageId ?? crypto.randomUUID(),
        role,
        text,
        turnId,
        ...(image ? { images: [image] } : {}),
      },
    ];
  }
  if (kind === 'tool_call' || kind === 'tool_call_update') {
    const index = messages.findIndex(
      (item) => item.role === 'tool' && item.id === update.toolCallId,
    );
    const tool = {
      ...(index >= 0 ? messages[index].tool : {}),
      ...Object.fromEntries(
        Object.entries(update).filter(([, value]) => value != null),
      ),
    } as Record<string, unknown>;
    const next: AgentMessage = {
      id: update.toolCallId,
      role: 'tool',
      text: typeof tool.title === 'string' ? tool.title : '工具操作',
      tool,
      images: Array.isArray(tool.content)
        ? tool.content
            .map((entry) =>
              inlineAgentImage((entry as Record<string, unknown>).content),
            )
            .filter((image): image is AgentImageData => image !== null)
        : undefined,
      turnId,
    };
    return index >= 0
      ? messages.map((item, i) => (i === index ? next : item))
      : [...messages, next];
  }
  if (kind === 'plan') {
    const text = update.entries
      .map(
        (entry) =>
          `- ${entry.status === 'completed' ? '✓' : entry.status === 'in_progress' ? '→' : '○'} ${entry.content}`,
      )
      .join('\n');
    const id = `plan:${turnId}`;
    return [
      ...messages.filter((item) => item.id !== id),
      { id, role: 'plan', text, turnId },
    ];
  }
  return messages;
}

export function agentReferenceLabels(
  context: Record<string, unknown>,
): string[] {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(
        String((context[key] as { value?: unknown })?.value ?? 'null'),
      );
    } catch {
      return null;
    }
  };
  const active = read('markune_active_document'),
    explicit = read('markune_explicit_document_references');
  const drawing = read('markune_active_drawing') as { title?: string } | null,
    drawings = read('markune_explicit_drawing_references');
  return [
    typeof active === 'string' ? `当前文档：${active}` : null,
    ...(Array.isArray(explicit)
      ? explicit
          .filter((value): value is string => typeof value === 'string')
          .map((path) => `引用：${path}`)
      : []),
    drawing?.title ? `当前图稿：${drawing.title}` : null,
    ...(Array.isArray(drawings)
      ? drawings
          .filter((value) => value && typeof value.title === 'string')
          .map((value) => `引用图稿：${value.title}`)
      : []),
  ].filter((value): value is string => value !== null);
}

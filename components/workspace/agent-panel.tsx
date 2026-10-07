'use client';

import * as React from 'react';
import {
  Bot,
  ChevronDown,
  History,
  LoaderCircle,
  Paperclip,
  Plus,
  Send,
  Settings2,
  Square,
  X,
} from 'lucide-react';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { AgentConfigToolbar } from './agent-config-toolbar';
import { AgentHistory } from './agent-history';
import { cn } from '@/lib/utils';
import { AgentSettings } from './agent-settings';
import { AgentIcon } from './agent-icon';
import {
  agentError,
  agentInvoke,
  loadAgentCatalog,
  type AgentCatalog,
  type AgentProfile,
} from './agent-api';
import {
  activeAgentRuntimes,
  AgentRuntime,
  findAgentRuntime,
} from './agent-runtime';
import type { AgentSessionRecord } from './agent-session';
import { AgentInteractionCard } from './agent-interaction';
import { AgentLogin } from './agent-login';
import { AgentMessageView } from './agent-message';
import activityStyles from './agent-activity.module.css';
import type {
  CodexDynamicToolRequest,
  CodexDynamicToolResponse,
} from './codex-app-server';
import type {
  AiProposedPlan,
  AiWorkspaceChangeEvent,
} from './ai-panel-state';
import type {
  AiDrawingReference,
  WorkspaceNode,
  WorkspaceSearchResult,
} from './workspace-types';
import { isTauriRuntime } from './workspace-api';

interface AgentPanelProps {
  workspaceRootPath: string | null;
  currentDocument: WorkspaceNode | null;
  currentDocumentPath: string | null;
  documents: WorkspaceSearchResult[];
  drawings?: AiDrawingReference[];
  activeDrawing?: AiDrawingReference | null;
  visible?: boolean;
  presentation?: 'panel' | 'workspace';
  researchDraft?: { id: string; text: string } | null;
  onResearchDraftConsumed?: () => void;
  onOpenCodexSettings?: () => void;
  onBeforeTurnStart: (
    documentPath: string | null,
    drawingId: string | null,
  ) => Promise<boolean>;
  onDrawingToolCall?: (
    request: CodexDynamicToolRequest,
  ) => Promise<CodexDynamicToolResponse>;
  onWorkspaceChanged: (event: AiWorkspaceChangeEvent) => void | Promise<void>;
  onOpenDocument: (path: string) => void;
  onOpenPlanPreview: (plan: AiProposedPlan, threadId: string) => void;
}
export function AgentPanel(props: AgentPanelProps) {
  return (
    <AgentWorkspace
      key={props.workspaceRootPath ?? 'none'}
      {...props}
      currentDocument={props.activeDrawing ? null : props.currentDocument}
      currentDocumentPath={
        props.activeDrawing ? null : props.currentDocumentPath
      }
    />
  );
}
function AgentWorkspace(props: AgentPanelProps) {
  const root = props.workspaceRootPath;
  const selectionGeneration = React.useRef(0);
  const [catalog, setCatalog] = React.useState<AgentCatalog | null>(null);
  const [runtime, setRuntime] = React.useState<AgentRuntime | null>(() =>
    root ? (activeAgentRuntimes(root).at(-1) ?? null) : null,
  );
  const [settings, setSettings] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState<AgentSessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState('');
  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const historyRequest = React.useRef(0);
  const historyButton = React.useRef<HTMLButtonElement>(null);
  const openingSession = React.useRef(false);
  const [archived, setArchived] = React.useState<AgentSessionRecord | null>(
    null,
  );
  const [error, setError] = React.useState('');
  const { researchDraft, onResearchDraftConsumed } = props;
  const [draft, setDraft] = React.useState(researchDraft?.text ?? '');
  const [draftId, setDraftId] = React.useState(researchDraft?.id);
  if (researchDraft && researchDraft.id !== draftId) {
    setDraftId(researchDraft.id);
    setDraft(researchDraft.text);
  }
  const reload = React.useCallback(async () => {
    try {
      setCatalog(await loadAgentCatalog());
    } catch (error) {
      setError(agentError(error));
    }
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(() => reload());
    window.addEventListener('markune:agents-changed', reload);
    return () => window.removeEventListener('markune:agents-changed', reload);
  }, [reload]);
  React.useEffect(
    () => () => {
      ++selectionGeneration.current;
      ++historyRequest.current;
      if (root)
        for (const runtime of activeAgentRuntimes(root))
          void runtime.disconnect();
    },
    [root],
  );
  React.useEffect(() => {
    if (researchDraft) onResearchDraftConsumed?.();
  }, [researchDraft, onResearchDraftConsumed]);
  const select = (profile: AgentProfile) => {
    if (
      runtime &&
      ['running', 'cancelling'].includes(runtime.getSnapshot().phase)
    ) {
      setError('请先停止当前任务，再切换智能体或新建会话');
      return;
    }
    if (!root) {
      setError('请先打开工作区');
      return;
    }
    if (!profile.enabled) {
      setError('请先启用此智能体');
      return;
    }
    if (
      runtime &&
      !['running', 'cancelling'].includes(runtime.getSnapshot().phase)
    )
      void runtime.disconnect();
    setArchived(null);
    const next = new AgentRuntime(profile, root);
    setRuntime(next);
    const selection = ++selectionGeneration.current;
    void next.connect().catch((error) => {
      if (selectionGeneration.current === selection)
        setError(agentError(error));
    });
    setSettings(false);
    setHistoryOpen(false);
    setError('');
  };
  const openHistory = async () => {
    if (!root) return;
    const request = ++historyRequest.current;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const saved = await agentInvoke<AgentSessionRecord[]>('agent_history', {
        rootPath: root,
      });
      if (request !== historyRequest.current) return;
      const active = activeAgentRuntimes(root)
        .map((runtime) => runtime.getSnapshot().record)
        .filter((record) => record.messages.length);
      setHistory(
        [
          ...active,
          ...saved.filter(
            (item) => !active.some((record) => record.id === item.id),
          ),
        ].sort((a, b) => b.updatedAt - a.updatedAt),
      );
    } catch (error) {
      if (request === historyRequest.current)
        setHistoryError(agentError(error));
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  };
  const loadHistory = async (record: AgentSessionRecord) => {
    if (openingSession.current || !root) return;
    if (runtime?.getSnapshot().record.id === record.id) {
      setHistoryOpen(false);
      return;
    }
    if (
      runtime &&
      ['running', 'cancelling'].includes(runtime.getSnapshot().phase)
    ) {
      setHistoryError('请先停止当前任务，再打开其他会话');
      return;
    }
    openingSession.current = true;
    setOpeningId(record.id);
    setHistoryError('');
    const selection = ++selectionGeneration.current;
    try {
      const existing = findAgentRuntime(record.id);
      const saved =
        existing?.getSnapshot().record ??
        (await agentInvoke<AgentSessionRecord>('agent_read_session', {
          rootPath: root,
          id: record.id,
        }));
      if (selectionGeneration.current !== selection) return;
      const profile = catalog?.profiles.find(
        (profile) => profile.id === saved.profileId && profile.enabled,
      );
      if (runtime) await runtime.disconnect();
      if (selectionGeneration.current !== selection) return;
      const next =
        existing ?? (profile ? new AgentRuntime(profile, root, saved) : null);
      setRuntime(next);
      setArchived(next ? null : saved);
      setError('');
      setHistoryOpen(false);
      if (next)
        void next.connect().catch((error) => {
          if (selectionGeneration.current === selection)
            setError(agentError(error));
        });
    } catch (error) {
      if (selectionGeneration.current === selection)
        setHistoryError(agentError(error));
    } finally {
      openingSession.current = false;
      setOpeningId(null);
    }
  };
  const enabled =
    catalog?.profiles.filter((profile) => profile.enabled) ?? [];
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="agent-panel"
      data-presentation={props.presentation}
    >
      <div
        className={cn(
          'min-h-0 flex-1 flex-col',
          historyOpen ? 'hidden' : 'flex',
        )}
        aria-hidden={historyOpen || undefined}
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent"
                aria-label="选择智能体"
              >
                <AgentIcon
                  agentId={runtime?.profile.agentId ?? archived?.agentId}
                  size={16}
                />
                <span className="truncate">
                  {runtime?.profile.name ?? archived?.agentName ?? '智能体'}
                </span>
                <ChevronDown size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1.5">
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                切换智能体将新建会话
              </p>
              {enabled.map((profile) => (
                <button
                  key={profile.id}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => select(profile)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <AgentIcon agentId={profile.agentId} size={16} />
                    <span className="truncate">{profile.name}</span>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {profile.version ?? '本机'}
                  </span>
                </button>
              ))}
              <Button
                className="mt-1 w-full justify-start"
                size="sm"
                variant="ghost"
                onClick={() => setSettings(true)}
              >
                <Plus size={14} />
                管理智能体…
              </Button>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="新建会话"
              disabled={!root || !enabled.length}
              onClick={() => {
                const profile =
                  runtime?.profile ??
                  enabled.find(
                    (profile) => profile.id === catalog?.defaultProfileId,
                  ) ??
                  enabled[0];
                if (profile) select(profile);
              }}
            >
              <Plus size={15} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              ref={historyButton}
              aria-label="会话历史"
              disabled={!root}
              onClick={() => void openHistory()}
            >
              <History size={15} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="智能体设置"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={15} />
            </Button>
          </div>
        </header>
        {error && (
          <p
            role="alert"
            className="m-3 rounded-lg border border-destructive/30 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        {runtime ? (
          <AgentConversation
            key={runtime.getSnapshot().record.id}
            runtime={runtime}
            {...props}
            draft={draft}
            setDraft={setDraft}
            onManage={() => setSettings(true)}
          />
        ) : archived ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <p className="mb-4 rounded-lg bg-muted p-3 text-xs">
              此会话使用的安装版本已移除或停用，历史仍可查看。
            </p>
            {archived.messages.map((message) => (
              <AgentMessageView key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
            <div className="max-w-sm space-y-5 text-center">
              <Bot className="mx-auto text-muted-foreground/60" size={30} />
              <div>
                <h2 className="text-base font-medium">
                  在工作区里与智能体协作
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  阅读文档、整理知识、改写内容或创作图稿。选择智能体后开始新会话。
                </p>
              </div>
              {enabled.length ? (
                <div className="grid gap-2">
                  {enabled.map((profile) => (
                    <Button
                      key={profile.id}
                      variant="outline"
                      onClick={() => select(profile)}
                    >
                      {profile.name}
                      <span className="text-xs text-muted-foreground">
                        {profile.version ?? '本机'}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Button onClick={() => setSettings(true)}>添加智能体</Button>
              )}
            </div>
          </div>
        )}
      </div>
      {historyOpen && (
        <AgentHistory
          records={history}
          loading={historyLoading}
          error={historyError}
          openingId={openingId}
          currentId={runtime?.getSnapshot().record.id ?? archived?.id}
          onBack={() => {
            ++selectionGeneration.current;
            setHistoryOpen(false);
            requestAnimationFrame(() => historyButton.current?.focus());
          }}
          onRefresh={() => void openHistory()}
          onSelect={(record) => void loadHistory(record)}
        />
      )}
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent
          className="flex h-[min(85dvh,52rem)] min-h-0 flex-col overflow-hidden sm:max-w-3xl"
          data-testid="agent-manager-dialog"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>智能体设置</DialogTitle>
            <DialogDescription>安装和管理 ACP 智能体</DialogDescription>
          </DialogHeader>
          <AgentSettings
            scrollable
            onSelect={(profile) => {
              void reload();
              select(profile);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function AgentConversation({
  runtime,
  draft,
  setDraft,
  onManage,
  ...props
}: AgentPanelProps & {
  runtime: AgentRuntime;
  draft: string;
  setDraft: (value: string) => void;
  onManage: () => void;
}) {
  const view = React.useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const [error, setError] = React.useState('');
  const [login, setLogin] = React.useState<string | null>(null);
  const [refs, setRefs] = React.useState<
    { kind: 'document' | 'drawing'; id: string; title: string }[]
  >([]);
  const [referenceSearch, setReferenceSearch] = React.useState('');
  const [referencesOpen, setReferencesOpen] = React.useState(false);
  const [attachments, setAttachments] = React.useState<
    { name: string; block: ContentBlock }[]
  >([]);
  const [sending, setSending] = React.useState(false);
  const [commandIndex, setCommandIndex] = React.useState(0);
  const [dismissedCommand, setDismissedCommand] = React.useState<
    string | null
  >(null);
  const commandMenuId = React.useId();
  const matchingCommands = /^\/[^\s]*$/.test(draft)
    ? view.commands.filter((command) =>
        `/${command.name}`.toLowerCase().startsWith(draft.toLowerCase()),
      )
    : [];
  const showCommands =
    matchingCommands.length > 0 && dismissedCommand !== draft;
  const selectedCommand = Math.min(
    commandIndex,
    Math.max(0, matchingCommands.length - 1),
  );
  const commandMenu = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (showCommands)
      commandMenu.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedCommand, showCommands]);
  const end = React.useRef<HTMLDivElement>(null),
    scroll = React.useRef<HTMLDivElement>(null),
    transcript = React.useRef<HTMLDivElement>(null),
    stick = React.useRef(true),
    input = React.useRef<HTMLTextAreaElement>(null);
  const callbacks = React.useRef(props);
  React.useEffect(() => {
    callbacks.current = props;
  }, [props]);
  React.useEffect(() => {
    const release = runtime.setCallbacks({
      beforeWrite: () =>
        callbacks.current.onBeforeTurnStart(
          callbacks.current.currentDocumentPath,
          callbacks.current.activeDrawing?.id ?? null,
        ),
      onChanged: () =>
        callbacks.current.onWorkspaceChanged({
          type: 'turnCompleted',
          turnId: null,
        }),
      onTool: async (event) => {
        if (!callbacks.current.onDrawingToolCall)
          throw new Error('图稿工具尚未就绪');
        return callbacks.current.onDrawingToolCall({
          arguments: event.arguments,
          callId: event.requestId,
          namespace: 'markune_drawing',
          threadId: runtime.getSnapshot().record.id,
          turnId: String(event.context.turnId),
          tool: event.name as CodexDynamicToolRequest['tool'],
        });
      },
    });
    return release;
  }, [runtime]);
  React.useEffect(() => {
    if (stick.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [view.record.messages, view.interactions]);
  React.useEffect(() => {
    if (!transcript.current) return;
    const observer = new ResizeObserver(() => {
      if (stick.current && scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    });
    observer.observe(transcript.current);
    return () => observer.disconnect();
  }, []);
  const busy =
    sending || ['connecting', 'running', 'cancelling'].includes(view.phase);
  const act = async (operation: () => Promise<unknown>) => {
    setError('');
    try {
      await operation();
    } catch (error) {
      setError(agentError(error));
    }
  };
  const send = async () => {
    if (!draft.trim() || busy) return;
    setSending(true);
    setError('');
    try {
      if (
        !(await props.onBeforeTurnStart(
          props.currentDocumentPath,
          props.activeDrawing?.id ?? null,
        ))
      )
        throw new Error('当前内容未能安全保存，请处理后再发送');
      await runtime.connect();
      if (runtime.getSnapshot().phase !== 'ready') return;
      const text = draft.trim();
      const context = {
        documents: [
          ...(props.currentDocumentPath
            ? [{ path: props.currentDocumentPath, role: 'active' }]
            : []),
          ...refs
            .filter(
              (ref) =>
                ref.kind === 'document' &&
                ref.id !== props.currentDocumentPath,
            )
            .map((ref) => ({ path: ref.id, role: 'mention' })),
        ],
        drawings: [
          ...(props.activeDrawing
            ? [{ drawingId: props.activeDrawing.id, role: 'active' }]
            : []),
          ...refs
            .filter(
              (ref) =>
                ref.kind === 'drawing' && ref.id !== props.activeDrawing?.id,
            )
            .map((ref) => ({ drawingId: ref.id, role: 'mention' })),
        ],
      };
      setDraft('');
      setRefs([]);
      setAttachments([]);
      stick.current = true;
      await runtime.prompt(
        text,
        attachments.map((item) => item.block),
        context,
      );
    } catch (error) {
      if (
        runtime.getSnapshot().record.messages.at(-1)?.text !== draft.trim()
      ) {
        setDraft(draft);
        setRefs(refs);
        setAttachments(attachments);
      }
      setError(agentError(error));
    } finally {
      setSending(false);
    }
  };
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    await act(async () => {
      const next = [...attachments];
      for (const file of Array.from(files)) {
        if (
          !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
          file.size > 3 * 1024 * 1024
        )
          throw new Error(
            '仅支持不超过 3 MiB 的 PNG、JPEG、WebP 或 GIF 图片',
          );
        if (!view.capabilities?.promptCapabilities?.image)
          throw new Error('此智能体未声明图片输入能力');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        next.push({
          name: file.name,
          block: {
            type: 'image',
            mimeType: file.type,
            data: btoa(binary),
          },
        });
      }
      if (JSON.stringify(next).length > 6 * 1024 * 1024 || next.length > 8)
        throw new Error('本轮图片总量超过限制，请减少附件');
      setAttachments(next);
    });
  };
  return (
    <>
      <div
        ref={scroll}
        onPointerDownCapture={(event) => {
          if ((event.target as HTMLElement).closest('button, summary'))
            stick.current = false;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        onScroll={() => {
          const node = scroll.current;
          if (node)
            stick.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        }}
      >
        <div
          ref={transcript}
          className={cn(
            'mx-auto',
            view.record.messages.length
              ? activityStyles.transcript
              : 'flex min-h-full flex-col gap-5',
            props.presentation === 'workspace' && 'max-w-3xl',
          )}
        >
          {!view.record.messages.length && (
            <div
              data-testid="agent-welcome"
              className="my-auto shrink-0 py-8 text-center"
            >
              <AgentIcon
                agentId={runtime.profile.agentId}
                className="mx-auto mb-4"
                size={28}
              />
              <h2 className="text-base font-medium">想在工作区里做什么？</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {props.currentDocument
                  ? `当前文档：${props.currentDocument.title ?? props.currentDocument.name}`
                  : props.activeDrawing
                    ? `当前图稿：${props.activeDrawing.title}`
                    : '输入任务，或使用 @ 引用文档与图稿。'}
              </p>
              <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-2">
                {[
                  '阅读并梳理当前内容',
                  '检查遗漏与矛盾',
                  '整理工作区知识结构',
                  '绘制主题思维导图',
                ].map((text) => (
                  <button
                    key={text}
                    className="rounded-xl border p-3 text-left text-xs leading-5 transition-colors hover:bg-accent"
                    onClick={() => {
                      setDraft(text);
                      input.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {view.record.messages.map((message) => (
            <AgentMessageView
              key={message.id}
              message={message}
              active={
                ['running', 'cancelling'].includes(view.phase) &&
                Boolean(message.turnId) &&
                message.turnId === view.record.messages.at(-1)?.turnId
              }
              streaming={
                view.phase === 'running' &&
                message.id === view.record.messages.at(-1)?.id
              }
            />
          ))}
          {view.phase === 'connecting' && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <LoaderCircle className="animate-spin" size={14} />
              正在连接 {runtime.profile.name}…
            </p>
          )}
          {(view.error || error) && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"
            >
              <p className="break-words text-destructive">
                {error || view.error}
              </p>
              {['error', 'disconnected'].includes(view.phase) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(() => runtime.reconnect())}
                >
                  重新连接
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onManage}>
                智能体设置
              </Button>
            </div>
          )}
          {view.phase === 'auth' && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm">登录 {runtime.profile.name}</p>
              {view.authMethods.map((method) => (
                <Button
                  key={method.id}
                  size="sm"
                  className="mr-2"
                  variant="outline"
                  onClick={() => {
                    if ('type' in method && method.type === 'terminal')
                      setLogin(method.id);
                    else void act(() => runtime.authenticate(method.id));
                  }}
                >
                  {method.name}
                </Button>
              ))}
              {!view.authMethods.length && (
                <p className="text-xs text-muted-foreground">
                  请先使用此智能体的 CLI 登录，或在设置中配置凭据。
                </p>
              )}
            </div>
          )}
          {view.interactions.map((interaction) => (
            <AgentInteractionCard
              key={interaction.id}
              interaction={interaction}
            />
          ))}
          <div
            ref={end}
            className={view.record.messages.length ? undefined : 'hidden'}
          />
        </div>
      </div>
      <div
        className={cn(
          'mx-auto w-full shrink-0 p-3 pt-1',
          props.presentation === 'workspace' && 'max-w-3xl',
        )}
      >
        <div className="relative">
          {showCommands && (
            <div
              ref={commandMenu}
              id={commandMenuId}
              role="listbox"
              aria-label="智能体命令"
              data-testid="agent-command-menu"
              className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
              {matchingCommands.map((command, index) => (
                <button
                  key={command.name}
                  id={`${commandMenuId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selectedCommand}
                  className={cn(
                    'block w-full rounded-md px-2 py-2 text-left text-xs hover:bg-accent',
                    index === selectedCommand && 'bg-accent',
                  )}
                  onClick={() => {
                    setDraft(`/${command.name} `);
                    input.current?.focus();
                  }}
                >
                  <span className="font-medium">/{command.name}</span>
                  <span className="mt-0.5 block line-clamp-2 text-muted-foreground">
                    {command.description}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div
            data-testid="agent-composer"
            className="rounded-xl border bg-background p-2.5 shadow-sm focus-within:ring-1 focus-within:ring-ring/50"
          >
            <div className="flex flex-wrap gap-1">
              {props.currentDocument && (
                <span
                  className="max-w-full truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                  title={props.currentDocument.relativePath}
                >
                  当前：
                  {props.currentDocument.title ?? props.currentDocument.name}
                </span>
              )}
              {props.activeDrawing && (
                <span className="max-w-full truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  当前：{props.activeDrawing.title}
                </span>
              )}
              {refs.map((ref) => (
                <button
                  key={ref.id}
                  className="flex max-w-full items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]"
                  title="移除引用"
                  onClick={() =>
                    setRefs((items) =>
                      items.filter((item) => item.id !== ref.id),
                    )
                  }
                >
                  <span className="truncate">@{ref.title}</span>
                  <X size={10} />
                </button>
              ))}
              {attachments.map((item, index) => (
                <button
                  key={`${item.name}:${index}`}
                  className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]"
                  onClick={() =>
                    setAttachments((items) =>
                      items.filter((_, i) => i !== index),
                    )
                  }
                >
                  {item.name}
                  <X size={10} />
                </button>
              ))}
            </div>
            <textarea
              ref={input}
              aria-label="发送给智能体的任务"
              aria-autocomplete="list"
              aria-controls={showCommands ? commandMenuId : undefined}
              aria-activedescendant={
                showCommands
                  ? `${commandMenuId}-${selectedCommand}`
                  : undefined
              }
              className="max-h-48 min-h-20 w-full resize-y bg-transparent px-1 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
              value={draft}
              placeholder="输入任务，使用 @ 引用文档或图稿，/ 查看可用命令"
              onChange={(event) => {
                setDraft(event.target.value);
                setCommandIndex(0);
                setDismissedCommand(null);
                if (event.target.value.endsWith('@')) setReferencesOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (showCommands) {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandIndex(
                      (selectedCommand +
                        (event.key === 'ArrowDown'
                          ? 1
                          : matchingCommands.length - 1)) %
                        matchingCommands.length,
                    );
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setDismissedCommand(draft);
                    return;
                  }
                  if (
                    (event.key === 'Enter' && !event.shiftKey) ||
                    (event.key === 'Tab' && !event.shiftKey)
                  ) {
                    event.preventDefault();
                    setDraft(`/${matchingCommands[selectedCommand].name} `);
                    return;
                  }
                }
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Popover
                  open={referencesOpen}
                  onOpenChange={setReferencesOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="引用文档或图稿"
                    >
                      @
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-2">
                    <Input
                      aria-label="搜索引用"
                      placeholder="搜索文档或图稿…"
                      value={referenceSearch}
                      onChange={(event) =>
                        setReferenceSearch(event.target.value)
                      }
                    />
                    <div className="mt-2 max-h-64 overflow-auto">
                      {[
                        ...props.documents.map((item) => ({
                          kind: 'document' as const,
                          id: item.absolutePath,
                          title: item.title ?? item.name,
                          detail: item.relativePath,
                        })),
                        ...(props.drawings ?? []).map((item) => ({
                          kind: 'drawing' as const,
                          id: item.id,
                          title: item.title,
                          detail: '图稿',
                        })),
                      ]
                        .filter((item) =>
                          `${item.title} ${item.detail}`
                            .toLowerCase()
                            .includes(referenceSearch.toLowerCase()),
                        )
                        .slice(0, 60)
                        .map((item) => (
                          <button
                            key={item.id}
                            className="block w-full rounded p-2 text-left hover:bg-accent"
                            onClick={() => {
                              if (refs.length >= 30) {
                                setError('最多引用 30 项');
                                return;
                              }
                              setRefs((items) => [
                                ...items.filter((ref) => ref.id !== item.id),
                                item,
                              ]);
                              setReferencesOpen(false);
                              setReferenceSearch('');
                              setDraft(
                                draft.endsWith('@')
                                  ? draft.slice(0, -1)
                                  : draft,
                              );
                              input.current?.focus();
                            }}
                          >
                            <p className="truncate text-xs">{item.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {item.detail}
                            </p>
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <label
                  className={cn(
                    'flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent',
                    !view.capabilities?.promptCapabilities?.image && 'hidden',
                  )}
                  title="添加图片"
                >
                  <Paperclip size={14} />
                  <input
                    aria-label="添加图片"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {view.phase === 'idle' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void act(() => runtime.connect())}
                  >
                    连接
                  </Button>
                )}
              </div>
              {['running', 'cancelling'].includes(view.phase) ? (
                <Button
                  aria-label="停止任务"
                  size="icon"
                  className="size-8"
                  variant="outline"
                  disabled={view.phase === 'cancelling'}
                  onClick={() => void act(() => runtime.cancel())}
                >
                  <Square size={13} fill="currentColor" />
                </Button>
              ) : (
                <Button
                  aria-label="发送任务"
                  size="icon"
                  className="size-8"
                  disabled={!draft.trim() || busy || !isTauriRuntime()}
                  onClick={() => void send()}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={15} />
                  ) : (
                    <Send size={15} />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        <AgentConfigToolbar
          agentId={runtime.profile.agentId}
          options={view.configOptions}
          modes={view.modes}
          phase={view.phase}
          usage={view.usage}
          disabled={busy}
          onConfigure={(id, value) => act(() => runtime.configure(id, value))}
          onMode={(id) => act(() => runtime.mode(id))}
        />
      </div>
      {login && (
        <AgentLogin
          runtime={runtime}
          methodId={login}
          onClose={() => setLogin(null)}
        />
      )}
    </>
  );
}

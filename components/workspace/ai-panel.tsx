'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Collapsible } from 'radix-ui';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleX,
  FilePenLine,
  FileText,
  Globe2,
  History,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  SearchCode,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Square,
  SquarePen,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import {
  codexAppServerClient,
  listenCodexEventsUntilDisposed,
  respondToCodexApproval,
  startCodexRuntime,
  type CodexAccountResponse,
  type CodexModel,
  type CodexModelListResponse,
  type CodexReasoningEffort,
  type CodexThread,
  type CodexThreadListResponse,
} from './codex-app-server';
import {
  conversationFromThread,
  buildConversationBlocks,
  createDocumentAwareUserInput,
  createThreadTitle,
  createEmptyConversation,
  getOutputPreviewLines,
  reduceCodexProtocolMessage,
  threadNameUpdateFromMessage,
  type AiActivityGroup,
  type AiApprovalRequest,
  type AiConversationBlock,
  type AiConversationEntry,
  type AiConversationState,
  type AiMessageMention,
  type AiTraceBlock,
  type AiTimelineItem,
} from './ai-panel-state';
import {
  isTauriRuntime,
  openUrlInDefaultBrowser,
} from './workspace-api';
import type { WorkspaceNode } from './workspace-types';

interface AiPanelProps {
  currentDocument: WorkspaceNode | null;
  documents: AiDocumentReference[];
  workspaceRootPath: string | null;
  onOpenDocument: (documentPath: string) => void;
  onWorkspaceChanged: () => void | Promise<void>;
}

type AiDocumentReference = Pick<
  WorkspaceNode,
  'absolutePath' | 'id' | 'name' | 'relativePath' | 'title'
>;

type AiComposerMention = AiDocumentReference & AiMessageMention;

const mentionLinkClassName =
  'mx-0.5 inline cursor-pointer select-none rounded-sm border-0 bg-transparent p-0 align-baseline font-[inherit] text-[#3574f0] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3574f0]/35';

type PanelView = 'chat' | 'history';
type RuntimeStatus = 'error' | 'loading' | 'ready' | 'web';

interface ThreadStartResponse {
  thread: CodexThread;
  model: string;
  reasoningEffort: CodexReasoningEffort | null;
}

interface ThreadReadResponse {
  thread: CodexThread;
}

interface TurnStartResponse {
  turn: { id: string };
}

interface LoginResponse {
  type: string;
  authUrl?: string;
  verificationUrl?: string;
}

interface McpListResponse {
  data: Array<{ name: string }>;
}

const STARTER_PROMPTS = [
  '总结当前文档并指出信息缺口',
  '把当前文档改写得更清晰、专业',
  '基于当前内容新建一篇关联文档',
];

const SCROLL_BOTTOM_THRESHOLD = 64;

const DEVELOPER_INSTRUCTIONS = `你运行在 Madora 的工作区级 AI 面板中。只可在当前工作区内读取和修改文件。Madora 以 Markdown 为唯一持久化文档格式，请保持现有 frontmatter 和目录约定。收到 Madora 文档引用且用户请求依赖其内容时，必须先使用工作区工具读取相关文件，并让读取动作通过正常工具事件返回；不得在尝试读取前声称缺少路径。所有命令与文件修改都必须经过客户端审批。删除文档前必须明确说明将删除的路径和影响，并等待用户确认。不要读取、输出或记录密钥、Token、Cookie、连接串或其他敏感信息。完成文件变更后简要列出实际修改和验证结果。`;

export function AiPanel({
  currentDocument,
  documents,
  workspaceRootPath,
  onOpenDocument,
  onWorkspaceChanged,
}: AiPanelProps) {
  const [view, setView] = React.useState<PanelView>('chat');
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<RuntimeStatus>('loading');
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [runtimeVersion, setRuntimeVersion] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<CodexAccountResponse['account']>(null);
  const [authRequired, setAuthRequired] = React.useState(false);
  const [models, setModels] = React.useState<CodexModel[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>('');
  const [effort, setEffort] = React.useState<CodexReasoningEffort>('medium');
  const [threads, setThreads] = React.useState<CodexThread[]>([]);
  const [activeThread, setActiveThread] = React.useState<CodexThread | null>(null);
  const [conversation, setConversation] = React.useState<AiConversationState>(
    createEmptyConversation,
  );
  const [mcpServerCount, setMcpServerCount] = React.useState(0);
  const [composerValue, setComposerValue] = React.useState('');
  const [selectedMentions, setSelectedMentions] = React.useState<
    AiComposerMention[]
  >([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [signingIn, setSigningIn] = React.useState(false);
  const [followLatestRequest, setFollowLatestRequest] = React.useState(0);
  const modelSelectionInitializedRef = React.useRef(false);

  const applyThreadName = React.useCallback((threadId: string, name: string) => {
    setActiveThread((current) =>
      current?.id === threadId ? { ...current, name } : current,
    );
    setThreads((current) =>
      current.map((thread) =>
        thread.id === threadId ? { ...thread, name } : thread,
      ),
    );
  }, []);

  const filteredMentionDocuments = React.useMemo(() => {
    const query = mentionQuery?.trim().toLocaleLowerCase() ?? '';
    return documents
      .filter(
        (document) =>
          !selectedMentions.some(
            (selected) => selected.absolutePath === document.absolutePath,
          ),
      )
      .filter((document) => {
        if (!query) {
          return true;
        }
        return `${document.title ?? ''} ${document.name} ${document.relativePath}`
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }, [documents, mentionQuery, selectedMentions]);

  const visibleThreads = React.useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase();

    if (!query) {
      return threads;
    }

    return threads.filter((thread) =>
      `${thread.name ?? ''} ${thread.preview}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [historyQuery, threads]);

  const selectedModelInfo = React.useMemo(
    () => models.find((model) => model.model === selectedModel) ?? null,
    [models, selectedModel],
  );

  const loadControlData = React.useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    const [accountResponse, modelResponse, threadResponse, mcpResponse] =
      await Promise.all([
        codexAppServerClient.request<CodexAccountResponse>('account/read', {
          refreshToken: false,
        }),
        codexAppServerClient.request<CodexModelListResponse>('model/list', {
          includeHidden: false,
          limit: 100,
        }),
        codexAppServerClient.request<CodexThreadListResponse>('thread/list', {
          cwd: workspaceRootPath,
          limit: 100,
          sortKey: 'updated_at',
          sortDirection: 'desc',
        }),
        codexAppServerClient
          .request<McpListResponse>('mcpServerStatus/list', {
            detail: 'toolsAndAuthOnly',
            limit: 100,
          })
          .catch(() => ({ data: [] })),
      ]);

    setAccount(accountResponse.account);
    setAuthRequired(
      accountResponse.requiresOpenaiAuth && !accountResponse.account,
    );
    setModels(modelResponse.data);
    setThreads(threadResponse.data);
    setMcpServerCount(mcpResponse.data.length);

    const defaultModel =
      modelResponse.data.find((model) => model.isDefault) ??
      modelResponse.data[0];
    if (defaultModel && !modelSelectionInitializedRef.current) {
      modelSelectionInitializedRef.current = true;
      setSelectedModel(defaultModel.model);
      setEffort(defaultModel.defaultReasoningEffort);
    }
  }, [workspaceRootPath]);

  React.useEffect(() => {
    if (!workspaceRootPath) {
      queueMicrotask(() => {
        setRuntimeStatus('error');
        setRuntimeError('请先打开一个工作区。');
      });
      return;
    }

    if (!isTauriRuntime()) {
      queueMicrotask(() => {
        setRuntimeStatus('web');
        setRuntimeError(null);
      });
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const unsubscribe = codexAppServerClient.subscribe((message) => {
      if (disposed) {
        return;
      }

      setConversation((current) =>
        reduceCodexProtocolMessage(current, message, workspaceRootPath),
      );

      const threadNameUpdate = threadNameUpdateFromMessage(message);
      if (threadNameUpdate) {
        applyThreadName(threadNameUpdate.threadId, threadNameUpdate.name);
      }

      if (message.method === 'madora/runtime/exited') {
        codexAppServerClient.rejectPending(
          new Error('Codex App Server 已停止'),
        );
        setRuntimeStatus('error');
        setRuntimeError('Codex App Server 已停止，请关闭并重新打开 AI 面板。');
      }

      if (
        message.method === 'account/login/completed' ||
        message.method === 'account/updated'
      ) {
        void loadControlData().catch(() => undefined);
      }

      if (
        message.method === 'item/completed' &&
        (message.params?.item as { type?: string } | undefined)?.type ===
          'fileChange'
      ) {
        void onWorkspaceChanged();
      }
    });

    void (async () => {
      try {
        const activeUnlisten = await listenCodexEventsUntilDisposed(
          (message) => codexAppServerClient.handleMessage(message),
          () => disposed,
        );
        if (!activeUnlisten) {
          return;
        }
        unlisten = activeUnlisten;
        const runtime = await startCodexRuntime(workspaceRootPath);
        if (disposed) {
          return;
        }
        setRuntimeVersion(runtime.version);
        await loadControlData();
        if (!disposed) {
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!disposed) {
          setRuntimeStatus('error');
          setRuntimeError(getErrorMessage(error));
        }
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
      unsubscribe();
    };
  }, [applyThreadName, loadControlData, onWorkspaceChanged, workspaceRootPath]);

  const startNewChat = React.useCallback(() => {
    setActiveThread(null);
    setConversation(createEmptyConversation());
    setSelectedMentions([]);
    setComposerValue('');
    setView('chat');
  }, []);

  const openThread = React.useCallback(async (thread: CodexThread) => {
    setRuntimeError(null);
    setView('chat');
    try {
      const response = await codexAppServerClient.request<ThreadReadResponse>(
        'thread/read',
        { threadId: thread.id, includeTurns: true },
      );
      await codexAppServerClient.request('thread/resume', {
        threadId: thread.id,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
      });
      setActiveThread(response.thread);
      setConversation(
        conversationFromThread(response.thread, workspaceRootPath ?? undefined),
      );
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
    }
  }, [workspaceRootPath]);

  const removeThread = React.useCallback(
    async (thread: CodexThread, action: 'archive' | 'delete') => {
      if (
        action === 'delete' &&
        !window.confirm('确定永久删除这条 Codex 历史记录吗？')
      ) {
        return;
      }
      const method = action === 'archive' ? 'thread/archive' : 'thread/delete';
      await codexAppServerClient.request(method, { threadId: thread.id });
      setThreads((current) =>
        current.filter((candidate) => candidate.id !== thread.id),
      );
      if (activeThread?.id === thread.id) {
        startNewChat();
      }
    },
    [activeThread?.id, startNewChat],
  );

  const sendMessage = React.useCallback(
    async (messageOverride?: string) => {
      const text = (messageOverride ?? composerValue).trim();
      if (
        !text ||
        !workspaceRootPath ||
        runtimeStatus !== 'ready' ||
        authRequired ||
        submitting
      ) {
        return;
      }

      setSubmitting(true);
      setRuntimeError(null);
      const contextDocuments = uniqueDocuments([
        ...(currentDocument ? [currentDocument] : []),
        ...selectedMentions,
      ]);
      const userInput = createDocumentAwareUserInput(text, selectedMentions);
      setComposerValue('');
      setSelectedMentions([]);
      setMentionQuery(null);
      setFollowLatestRequest((current) => current + 1);
      const clientMessageId = `madora-${Date.now()}`;
      setConversation((current) => ({
        ...current,
        entries: [
          ...current.entries,
          {
            type: 'message',
            id: clientMessageId,
            mentions: selectedMentions.map(({ end, label, path, start }) => ({
              end,
              label,
              path,
              start,
            })),
            role: 'user',
            text,
          },
        ],
      }));

      try {
        let thread = activeThread;
        if (!thread) {
          const response =
            await codexAppServerClient.request<ThreadStartResponse>(
              'thread/start',
              {
                approvalPolicy: 'on-request',
                config: { web_search: 'live' },
                cwd: workspaceRootPath,
                developerInstructions: DEVELOPER_INSTRUCTIONS,
                model: selectedModel || null,
                sandbox: 'workspace-write',
              },
            );
          const threadTitle = createThreadTitle(text);
          thread = { ...response.thread, name: threadTitle };
          setActiveThread(thread);
          setThreads((current) => [thread!, ...current]);
          void codexAppServerClient
            .request('thread/name/set', {
              threadId: thread.id,
              name: threadTitle,
            })
            .catch(() => undefined);
        }

        const response = await codexAppServerClient.request<TurnStartResponse>(
          'turn/start',
          {
            threadId: thread.id,
            clientUserMessageId: clientMessageId,
            input: [
              {
                type: 'text',
                text: userInput.text,
                text_elements: userInput.textElements,
              },
            ],
            madoraDocumentReferences: contextDocuments.map((document) => ({
              path: document.absolutePath,
            })),
            cwd: workspaceRootPath,
            approvalPolicy: 'on-request',
            sandboxPolicy: {
              type: 'workspaceWrite',
              writableRoots: [workspaceRootPath],
              networkAccess: true,
              excludeTmpdirEnvVar: true,
              excludeSlashTmp: true,
            },
            model: selectedModel || null,
            effort,
            summary: 'concise',
          },
        );
        setConversation((current) => ({
          ...current,
          activeTurnId: response.turn.id,
        }));
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [
      activeThread,
      authRequired,
      composerValue,
      currentDocument,
      effort,
      runtimeStatus,
      selectedMentions,
      selectedModel,
      submitting,
      workspaceRootPath,
    ],
  );

  const interruptTurn = React.useCallback(async () => {
    if (!activeThread || !conversation.activeTurnId) {
      return;
    }

    try {
      await codexAppServerClient.request('turn/interrupt', {
        threadId: activeThread.id,
        turnId: conversation.activeTurnId,
      });
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
    }
  }, [activeThread, conversation.activeTurnId]);

  const signIn = React.useCallback(async () => {
    setSigningIn(true);
    setRuntimeError(null);
    try {
      const response = await codexAppServerClient.request<LoginResponse>(
        'account/login/start',
        {
          type: 'chatgpt',
          codexStreamlinedLogin: true,
          useHostedLoginSuccessPage: true,
        },
      );
      const authUrl = response.authUrl ?? response.verificationUrl;
      if (authUrl) {
        await openUrlInDefaultBrowser(authUrl);
      }
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const approve = React.useCallback(
    async (
      approval: AiApprovalRequest,
      decision: 'accept' | 'acceptForSession' | 'decline',
    ) => {
      try {
        await respondToCodexApproval(approval.id, decision);
        setConversation((current) => ({
          ...current,
          approvals: current.approvals.filter(
            (candidate) => candidate.id !== approval.id,
          ),
        }));
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      }
    },
    [],
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" data-testid="ai-panel">
      <AiPanelHeader
        activeThread={activeThread}
        view={view}
        onHistory={() => setView('history')}
        onNewChat={startNewChat}
      />

      {view === 'history' ? (
        <ThreadHistory
          query={historyQuery}
          threads={visibleThreads}
          onArchive={(thread) => void removeThread(thread, 'archive')}
          onDelete={(thread) => void removeThread(thread, 'delete')}
          onOpen={(thread) => void openThread(thread)}
          onQueryChange={setHistoryQuery}
        />
      ) : (
        <>
          <AiConversationViewport
            followLatestRequest={followLatestRequest}
            key={activeThread?.id ?? 'new-task'}
          >
            <PanelContent
              account={account}
              authRequired={authRequired}
              conversation={conversation}
              currentDocument={currentDocument}
              runtimeError={runtimeError}
              runtimeStatus={runtimeStatus}
              signingIn={signingIn}
              onApprove={approve}
              onOpenDocument={onOpenDocument}
              onPrompt={(prompt) => void sendMessage(prompt)}
              onSignIn={() => void signIn()}
            />
          </AiConversationViewport>

          <AiComposer
            active={Boolean(conversation.activeTurnId)}
            currentDocument={currentDocument}
            effort={effort}
            mentionDocuments={filteredMentionDocuments}
            mentionQuery={mentionQuery}
            mcpServerCount={mcpServerCount}
            models={models}
            runtimeStatus={runtimeStatus}
            selectedModel={selectedModel}
            selectedModelInfo={selectedModelInfo}
            submitting={submitting}
            value={composerValue}
            version={runtimeVersion}
            onEffortChange={setEffort}
            onInterrupt={() => void interruptTurn()}
            onMentionQueryChange={setMentionQuery}
            onMentionsChange={setSelectedMentions}
            onModelChange={(model) => {
              setSelectedModel(model);
              const next = models.find((candidate) => candidate.model === model);
              if (next) {
                setEffort(next.defaultReasoningEffort);
              }
            }}
            onOpenMention={onOpenDocument}
            onSend={() => void sendMessage()}
            onValueChange={(value) => {
              setComposerValue(value);
              const match = value.match(/@([^\s@]*)$/);
              setMentionQuery(match ? match[1] : null);
            }}
          />
        </>
      )}
    </section>
  );
}

export function AiConversationViewport({
  children,
  followLatestRequest,
}: React.PropsWithChildren<{ followLatestRequest: number }>) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const shouldFollowLatestRef = React.useRef(true);
  const previousFollowRequestRef = React.useRef(followLatestRequest);
  const [showScrollToLatest, setShowScrollToLatest] = React.useState(false);

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    shouldFollowLatestRef.current = true;
    setShowScrollToLatest(false);
    viewport.scrollTo({ behavior, top: viewport.scrollHeight });
  }, []);

  const updateScrollState = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const nearBottom = isViewportNearBottom(viewport);
    shouldFollowLatestRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom);
  }, []);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    if (shouldFollowLatestRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
      setShowScrollToLatest(false);
      return;
    }
    setShowScrollToLatest(!isViewportNearBottom(viewport));
  }, [children]);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') {
      return;
    }
    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
          return;
        }
        if (shouldFollowLatestRef.current) {
          viewport.scrollTop = viewport.scrollHeight;
          setShowScrollToLatest(false);
          return;
        }
        setShowScrollToLatest(!isViewportNearBottom(viewport));
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);

  React.useEffect(() => {
    if (previousFollowRequestRef.current === followLatestRequest) {
      return;
    }
    previousFollowRequestRef.current = followLatestRequest;
    scrollToLatest('smooth');
  }, [followLatestRequest, scrollToLatest]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="scrollbar-thin h-full min-h-0 overflow-y-auto"
        data-testid="ai-conversation-viewport"
        ref={viewportRef}
        onScroll={updateScrollState}
      >
        <div className="min-h-full" ref={contentRef}>
          {children}
        </div>
      </div>
      {showScrollToLatest ? (
        <button
          aria-label="回到最新消息"
          className="absolute bottom-3 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground shadow-[0_1px_4px_rgba(15,23,42,0.08)] outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          type="button"
          onClick={() => scrollToLatest('smooth')}
        >
          <ArrowDown size={16} strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

function isViewportNearBottom(viewport: HTMLElement) {
  const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  return distance <= SCROLL_BOTTOM_THRESHOLD;
}

export function AiPanelHeader({
  activeThread,
  view,
  onHistory,
  onNewChat,
}: {
  activeThread: CodexThread | null;
  view: PanelView;
  onHistory: () => void;
  onNewChat: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          {view === 'history'
            ? '历史记录'
            : activeThread?.name || activeThread?.preview || '新任务'}
        </div>
      </div>
      <HeaderButton label="新任务" onClick={onNewChat}>
        <SquarePen size={16} />
      </HeaderButton>
      <HeaderButton label="历史记录" onClick={onHistory}>
        <History size={16} />
      </HeaderButton>
    </header>
  );
}

function HeaderButton({
  children,
  label,
  onClick,
}: React.PropsWithChildren<{ label: string; onClick: () => void }>) {
  return (
    <button
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PanelContent({
  account,
  authRequired,
  conversation,
  currentDocument,
  runtimeError,
  runtimeStatus,
  signingIn,
  onApprove,
  onOpenDocument,
  onPrompt,
  onSignIn,
}: {
  account: CodexAccountResponse['account'];
  authRequired: boolean;
  conversation: AiConversationState;
  currentDocument: WorkspaceNode | null;
  runtimeError: string | null;
  runtimeStatus: RuntimeStatus;
  signingIn: boolean;
  onApprove: (
    approval: AiApprovalRequest,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => void;
  onOpenDocument: (documentPath: string) => void;
  onPrompt: (prompt: string) => void;
  onSignIn: () => void;
}) {
  if (runtimeStatus === 'loading') {
    return (
      <EmptyPanel icon={<LoaderCircle className="animate-spin" size={20} />} title="正在连接 Codex">
        <p>启动本地 App Server 并读取账户、模型与历史记录。</p>
      </EmptyPanel>
    );
  }

  if (runtimeStatus === 'web') {
    return (
      <EmptyPanel icon={<Bot size={20} />} title="AI 面板已就绪">
        <p>Codex App Server 只在 Madora 桌面端运行，Web 预览不会启动本地进程。</p>
      </EmptyPanel>
    );
  }

  if (
    runtimeStatus === 'error' &&
    conversation.entries.length === 0 &&
    conversation.approvals.length === 0
  ) {
    return (
      <EmptyPanel icon={<Circle size={18} />} title="无法连接 Codex">
        <p>{runtimeError || 'Codex 运行时不可用。'}</p>
      </EmptyPanel>
    );
  }

  if (authRequired && !account) {
    return (
      <EmptyPanel icon={<Sparkles size={20} />} title="连接你的 ChatGPT 账户">
        <p>登录由 Codex App Server 管理，Madora 不接触或保存账户 Token。</p>
        <button
          className="mt-3 inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
          disabled={signingIn}
          type="button"
          onClick={onSignIn}
        >
          {signingIn ? '正在打开登录…' : '使用 ChatGPT 登录'}
        </button>
      </EmptyPanel>
    );
  }

  if (
    conversation.entries.length === 0 &&
    conversation.approvals.length === 0
  ) {
    return (
      <div className="flex min-h-full flex-col justify-end px-5 pb-7 pt-16">
        <div className="mb-auto flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 flex size-9 items-center justify-center rounded-full border border-border/80 bg-muted/35">
            <MessageSquareText size={17} />
          </div>
          <h2 className="text-sm font-medium">和你的工作区对话</h2>
          <p className="mt-2 max-w-[280px] text-xs leading-5 text-muted-foreground">
            {currentDocument
              ? `当前已关联「${currentDocument.title || currentDocument.name}」，也可以用 @ 提及其他文档。`
              : '提问、搜索或让 Codex 在审批后修改工作区文件。'}
          </p>
        </div>
        <div className="space-y-1.5">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              className="flex w-full items-center rounded-lg border border-border/70 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/70"
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const blocks = buildConversationBlocks(conversation);

  return (
    <div className="mx-auto w-full max-w-[680px] px-5 py-5">
      <div>
        {blocks.map((block, index) =>
          block.type === 'trace' ? (
            <ProcessingTrace
              key={block.id}
              trace={block}
              onApprove={onApprove}
              onOpenDocument={onOpenDocument}
            />
          ) : (
            <ConversationEntryRow
              entry={block}
              key={`${block.type}-${block.id}`}
              onOpenDocument={onOpenDocument}
              previous={previousConversationEntry(blocks[index - 1])}
            />
          ),
        )}

        {runtimeError ? (
          <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {runtimeError}
          </div>
        ) : null}
      </div>

    </div>
  );
}

function previousConversationEntry(block: AiConversationBlock | undefined) {
  return block?.type === 'message' ? block : null;
}

export function ConversationEntryRow({
  entry,
  onOpenDocument,
  previous,
}: {
  entry: AiConversationEntry;
  onOpenDocument: (documentPath: string) => void;
  previous: AiConversationEntry | null;
}) {
  if (entry.type === 'timeline') {
    return (
      <div className={cn(previous ? 'mt-3' : null)}>
        <ActivityItemRow
          activity={entry}
          approvals={[]}
          onApprove={() => undefined}
          onOpenDocument={onOpenDocument}
        />
      </div>
    );
  }

  return (
    <article
      className={cn(
        'text-[13px] leading-6',
        previous && 'mt-5',
        entry.role === 'user' && 'flex justify-end',
      )}
    >
      {entry.role === 'assistant' ? (
        <AiMessageContent markdown={entry.text} />
      ) : (
        <div className="w-max max-w-[88%] break-words rounded-xl bg-muted/70 px-3 py-2">
          <UserMessageContent
            mentions={entry.mentions ?? []}
            text={entry.text}
            onOpenMention={onOpenDocument}
          />
        </div>
      )}
    </article>
  );
}

export function UserMessageContent({
  mentions,
  text,
  onOpenMention,
}: {
  mentions: AiMessageMention[];
  text: string;
  onOpenMention: (path: string) => void;
}) {
  const content: React.ReactNode[] = [];
  let cursor = 0;

  for (const mention of [...mentions].sort(
    (left, right) => left.start - right.start,
  )) {
    if (
      mention.start < cursor ||
      mention.start < 0 ||
      mention.end <= mention.start ||
      mention.end > text.length
    ) {
      continue;
    }

    if (mention.start > cursor) {
      content.push(text.slice(cursor, mention.start));
    }

    const label = mention.label || text.slice(mention.start, mention.end);
    content.push(
      <button
        aria-label={label}
        className={mentionLinkClassName}
        key={`${mention.path}-${mention.start}-${mention.end}`}
        role="link"
        type="button"
        onClick={() => onOpenMention(mention.path)}
      >
        {label}
      </button>,
    );
    cursor = mention.end;
  }

  if (cursor < text.length) {
    content.push(text.slice(cursor));
  }

  return (
    <div className="whitespace-pre-wrap break-words">
      {content.length > 0 ? content : text}
    </div>
  );
}

const aiMarkdownComponents: Components = {
  a: ({ children, href }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));

    return (
      <a
        className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        href={href}
        rel={external ? 'noreferrer' : undefined}
        target={external ? '_blank' : undefined}
        onClick={(event) => {
          event.preventDefault();
          if (external && href) {
            void openUrlInDefaultBrowser(href);
          }
        }}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={cn(
        'rounded bg-muted/70 px-1 py-0.5 font-mono text-[0.9em]',
        className,
      )}
    >
      {children}
    </code>
  ),
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-[15px] font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold">{children}</h3>,
  hr: () => <hr className="my-4 border-border/70" />,
  img: ({ alt }) => (
    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {alt ? `图片：${alt}` : '图片'}
    </span>
  ),
  li: ({ children }) => <li className="my-0.5 pl-0.5">{children}</li>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-0.5">{children}</ol>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border/70 bg-muted/45 p-3 font-mono text-[11px] leading-5 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  td: ({ children }) => <td className="border-t border-border/60 px-2 py-1.5">{children}</td>,
  th: ({ children }) => <th className="bg-muted/45 px-2 py-1.5 font-medium">{children}</th>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>,
};

export function AiMessageContent({ markdown }: { markdown: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown
        components={aiMarkdownComponents}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function EmptyPanel({
  children,
  icon,
  title,
}: React.PropsWithChildren<{ icon: React.ReactNode; title: string }>) {
  return (
    <div className="flex min-h-full items-center justify-center px-8 py-16 text-center">
      <div className="max-w-[300px]">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-border/80 bg-muted/30">
          {icon}
        </div>
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function ProcessingTrace({
  trace,
  onApprove,
  onOpenDocument,
}: {
  trace: AiTraceBlock;
  onApprove: (
    approval: AiApprovalRequest,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
  const [open, setOpen] = React.useState(
    !trace.historical || trace.status !== 'completed',
  );
  const elapsedMs = useTraceElapsedMs(trace);
  const active = trace.status === 'inProgress';
  const activityIds = new Set(
    trace.segments.flatMap((segment) =>
      segment.type === 'group'
        ? segment.activities.map((activity) => activity.id)
        : [],
    ),
  );
  const orphanApprovals = trace.approvals.filter(
    (approval) => !approval.itemId || !activityIds.has(approval.itemId),
  );

  return (
    <Collapsible.Root
      className="mt-5 border-t border-border/60 pt-3"
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger asChild>
        <button
          aria-label={`${active ? '正在处理' : '已处理'}，${open ? '收起' : '展开'}处理过程`}
          className="group flex w-full items-center gap-2 rounded-md py-1 text-left text-[13px] font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          type="button"
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {traceStatusIcon(trace.status)}
          </span>
          <span>{active ? '正在处理' : '已处理'}</span>
          {elapsedMs !== null ? (
            <span className="font-normal tabular-nums text-muted-foreground">
              {formatDuration(elapsedMs)}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              'ml-0.5 size-3.5 text-muted-foreground transition-transform duration-150',
              !open && '-rotate-90',
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="mt-3 space-y-3">
          {trace.segments.map((segment) =>
            segment.type === 'commentary' ? (
              <div
                className="text-[13px] leading-6 text-foreground"
                key={segment.message.id}
              >
                <AiMessageContent markdown={segment.message.text} />
              </div>
            ) : (
              <ActivityGroupRow
                approvals={trace.approvals}
                group={segment}
                key={segment.id}
                onApprove={onApprove}
                onOpenDocument={onOpenDocument}
              />
            ),
          )}

          {orphanApprovals.map((approval) => (
            <ApprovalCard
              approval={approval}
              key={String(approval.id)}
              onApprove={onApprove}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function useTraceElapsedMs(trace: AiTraceBlock) {
  const active = trace.status === 'inProgress';
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active || trace.startedAtMs === null) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active, trace.startedAtMs]);

  if (trace.durationMs !== null) {
    return trace.durationMs;
  }
  return active && trace.startedAtMs !== null
    ? Math.max(0, now - trace.startedAtMs)
    : null;
}

function ActivityGroupRow({
  approvals,
  group,
  onApprove,
  onOpenDocument,
}: {
  approvals: AiApprovalRequest[];
  group: AiActivityGroup;
  onApprove: (
    approval: AiApprovalRequest,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
  const forceOpen = ['declined', 'failed', 'waitingApproval'].includes(
    group.status,
  );
  const [open, onOpenChange] = useAttentionDisclosure(forceOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger asChild>
        <button
          aria-label={`${group.summary}，${open ? '收起' : '展开'}工具活动`}
          className="group flex max-w-full items-center gap-2 rounded-md py-0.5 text-left text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          type="button"
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {groupStatusIcon(group)}
          </span>
          <span className="min-w-0 truncate text-foreground/75">
            {group.summary}
          </span>
          {group.durationMs !== null ? (
            <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/75">
              {formatDuration(group.durationMs)}
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground/75 transition-transform duration-150',
              open && 'rotate-90',
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="ml-2 mt-1 space-y-0.5 border-l border-border/60 pl-4">
          {group.activities.map((activity) => (
            <ActivityItemRow
              activity={activity}
              approvals={approvals.filter(
                (approval) => approval.itemId === activity.id,
              )}
              key={activity.id}
              onApprove={onApprove}
              onOpenDocument={onOpenDocument}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ActivityItemRow({
  activity,
  approvals,
  onApprove,
  onOpenDocument,
}: {
  activity: AiTimelineItem;
  approvals: AiApprovalRequest[];
  onApprove: (
    approval: AiApprovalRequest,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
  const forceOpen =
    activity.status === 'failed' ||
    activity.status === 'declined' ||
    approvals.length > 0;
  const [open, onOpenChange] = useAttentionDisclosure(forceOpen);
  const expandable = activityHasDetails(activity) || approvals.length > 0;

  if (!expandable) {
    return (
      <div className="flex min-h-7 items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {activityIcon(activity)}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground/70">
          {activity.label}
        </span>
        <ActivityMeta activity={activity} />
      </div>
    );
  }

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger asChild>
        <button
          aria-label={`${activity.label}，${open ? '收起' : '展开'}详情`}
          className="flex min-h-7 w-full items-center gap-2 rounded-sm text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          type="button"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {activityIcon(activity)}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground/70">
            {activity.label}
          </span>
          <ActivityMeta activity={activity} />
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150',
              open && 'rotate-90',
            )}
          />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ActivityDetails
          activity={activity}
          onOpenDocument={onOpenDocument}
        />
        {approvals.map((approval) => (
          <ApprovalCard
            approval={approval}
            key={String(approval.id)}
            onApprove={onApprove}
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function useAttentionDisclosure(forceOpen: boolean) {
  const [open, setOpen] = React.useState(forceOpen);
  const previousForceOpenRef = React.useRef(forceOpen);
  const userChangedRef = React.useRef(false);

  React.useEffect(() => {
    const wasForcedOpen = previousForceOpenRef.current;
    previousForceOpenRef.current = forceOpen;
    if (forceOpen && !wasForcedOpen) {
      setOpen(true);
      return;
    }
    if (!forceOpen && wasForcedOpen && !userChangedRef.current) {
      setOpen(false);
    }
  }, [forceOpen]);

  const onOpenChange = React.useCallback((nextOpen: boolean) => {
    userChangedRef.current = true;
    setOpen(nextOpen);
  }, []);

  return [open, onOpenChange] as const;
}

function ActivityMeta({ activity }: { activity: AiTimelineItem }) {
  if (activity.status === 'failed') {
    return <span className="shrink-0 text-[10px] text-destructive">失败</span>;
  }
  if (activity.status === 'declined') {
    return <span className="shrink-0 text-[10px] text-amber-600">已拒绝</span>;
  }
  if (activity.durationMs !== null) {
    return (
      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/70">
        {formatDuration(activity.durationMs)}
      </span>
    );
  }
  return null;
}

function ActivityDetails({
  activity,
  onOpenDocument,
}: {
  activity: AiTimelineItem;
  onOpenDocument: (documentPath: string) => void;
}) {
  if (activity.kind === 'command') {
    const output = getOutputPreviewLines(activity.output);
    return (
      <div className="mb-2 mt-1 space-y-2 rounded-lg bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
        <DetailLabel label="命令" />
        <pre className="whitespace-pre-wrap break-all font-mono leading-4 text-foreground/75">
          {activity.command}
        </pre>
        {activity.cwd ? (
          <div className="truncate font-mono text-[10px]" title={activity.cwd}>
            {activity.cwd}
          </div>
        ) : null}
        {activity.actions.some(
          (action) => action.type === 'read' && action.documentPath,
        ) ? (
          <div className="flex flex-wrap gap-1.5">
            {activity.actions.map((action, index) =>
              action.type === 'read' && action.documentPath ? (
                <button
                  className="rounded-md bg-background/80 px-2 py-1 text-left text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  key={`${action.path}-${index}`}
                  type="button"
                  onClick={() => onOpenDocument(action.documentPath!)}
                >
                  {action.name}
                </button>
              ) : null,
            )}
          </div>
        ) : null}
        {output.head.length > 0 || output.tail.length > 0 ? (
          <div>
            <DetailLabel label="输出" />
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono leading-4 text-foreground/70">
              {[...output.head, ...(output.omittedLines > 0 ? [`… 省略 ${output.omittedLines} 行`] : []), ...output.tail].join('\n')}
            </pre>
          </div>
        ) : null}
        {activity.exitCode !== null ? (
          <div className={activity.exitCode === 0 ? 'text-muted-foreground' : 'text-destructive'}>
            退出码 {activity.exitCode}
          </div>
        ) : null}
      </div>
    );
  }

  if (activity.kind === 'file') {
    return (
      <div className="mb-2 mt-1 space-y-2 rounded-lg bg-muted/25 px-3 py-2 text-[11px]">
        {activity.changes.map((change) => (
          <div className="min-w-0" key={`${change.path}-${change.kind}`}>
            <div className="flex items-center gap-2">
              {change.absolutePath ? (
                <button
                  className="min-w-0 flex-1 truncate text-left text-foreground/75 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  title={change.path}
                  type="button"
                  onClick={() => onOpenDocument(change.absolutePath!)}
                >
                  {change.path}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-foreground/75">
                  {change.path}
                </span>
              )}
              <span className="text-emerald-600">+{change.additions}</span>
              <span className="text-destructive">-{change.deletions}</span>
            </div>
            {change.diff ? (
              <pre className="mt-1.5 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/70 px-2 py-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                {change.diff}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (activity.kind === 'mcp' || activity.kind === 'dynamic') {
    return (
      <div className="mb-2 mt-1 space-y-2 rounded-lg bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
        {activity.progress ? <div>{activity.progress}</div> : null}
        <JsonDetail label="参数" value={activity.arguments} />
        <JsonDetail label="结果" value={activity.result} />
        {activity.error ? (
          <div className="whitespace-pre-wrap text-destructive">{activity.error}</div>
        ) : null}
      </div>
    );
  }

  if (activity.kind === 'plan') {
    return (
      <div className="mb-2 mt-1 space-y-1 rounded-lg bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
        {activity.explanation ? <p>{activity.explanation}</p> : null}
        {activity.steps.map((step) => (
          <div className="flex items-start gap-2" key={step.step}>
            <span className="mt-0.5">{step.status === 'completed' ? <Check size={12} /> : step.status === 'inProgress' ? <LoaderCircle className="animate-spin" size={12} /> : <Circle size={10} />}</span>
            <span>{step.step}</span>
          </div>
        ))}
        {activity.text ? <p className="whitespace-pre-wrap">{activity.text}</p> : null}
      </div>
    );
  }

  const detail = 'detail' in activity ? activity.detail : null;
  return detail ? (
    <div className="mb-2 mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted/25 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
      {detail}
    </div>
  ) : null;
}

function JsonDetail({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  let content: string;
  try {
    content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    content = String(value);
  }
  if (!content || content === '{}' || content === '[]') return null;
  return (
    <div>
      <DetailLabel label={label} />
      <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/70 px-2 py-1.5 font-mono text-[10px] leading-4 text-foreground/70">
        {content}
      </pre>
    </div>
  );
}

function DetailLabel({ label }: { label: string }) {
  return <div className="text-[10px] font-medium text-muted-foreground/80">{label}</div>;
}

function activityHasDetails(activity: AiTimelineItem) {
  if (activity.kind === 'command') {
    return Boolean(
      activity.command ||
        activity.output.head ||
        activity.output.tail ||
        activity.exitCode !== null,
    );
  }
  if (activity.kind === 'file') return activity.changes.length > 0;
  if (activity.kind === 'mcp' || activity.kind === 'dynamic') return true;
  if (activity.kind === 'plan') {
    return Boolean(activity.explanation || activity.text || activity.steps.length);
  }
  return 'detail' in activity && Boolean(activity.detail);
}

function traceStatusIcon(status: AiTraceBlock['status']) {
  if (status === 'inProgress') {
    return <LoaderCircle className="animate-spin" size={13} />;
  }
  if (status === 'failed') return <CircleX className="text-destructive" size={13} />;
  if (status === 'declined') return <ShieldX className="text-amber-600" size={13} />;
  if (status === 'waitingApproval') return <ShieldCheck className="text-amber-600" size={13} />;
  if (status === 'interrupted') return <AlertCircle size={13} />;
  return <Check size={13} />;
}

function groupStatusIcon(group: AiActivityGroup) {
  if (group.status === 'inProgress') {
    return <LoaderCircle className="animate-spin" size={13} />;
  }
  if (group.status === 'failed') return <CircleX className="text-destructive" size={13} />;
  if (group.status === 'declined') return <ShieldX className="text-amber-600" size={13} />;
  if (group.status === 'waitingApproval') return <ShieldCheck className="text-amber-600" size={13} />;
  return group.activities.length === 1
    ? activityIcon(group.activities[0])
    : <Blocks size={13} />;
}

function activityIcon(item: AiTimelineItem) {
  if (item.status === 'inProgress') {
    return <LoaderCircle className="animate-spin" size={13} />;
  }
  if (item.status === 'failed') return <CircleX className="text-destructive" size={13} />;
  if (item.status === 'declined') return <ShieldX className="text-amber-600" size={13} />;
  if (item.kind === 'file') return <FilePenLine size={13} />;
  if (item.kind === 'command') {
    return item.actions.length > 0 && item.actions.every((action) => action.type !== 'unknown')
      ? <SearchCode size={13} />
      : <TerminalSquare size={13} />;
  }
  if (item.kind === 'mcp' || item.kind === 'dynamic') return <Blocks size={13} />;
  if (item.kind === 'search') return <Globe2 size={13} />;
  if (item.kind === 'plan') return <Check size={13} />;
  return <Circle size={10} />;
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return '<1 秒';
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

function ApprovalCard({
  approval,
  onApprove,
}: {
  approval: AiApprovalRequest;
  onApprove: (
    approval: AiApprovalRequest,
    decision: 'accept' | 'acceptForSession' | 'decline',
  ) => void;
}) {
  return (
    <section className="mb-2 mt-1 border-l-2 border-amber-500/45 bg-amber-500/[0.035] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 text-amber-600" size={15} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{approval.title}</div>
          <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-4 text-muted-foreground">
            {approval.detail}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
        {approval.decisions.length === 0 ? (
          <p className="mr-auto text-[10px] leading-4 text-muted-foreground">
            当前客户端不支持服务端要求的审批方式。
          </p>
        ) : null}
        {approval.decisions.includes('decline') ? (
          <button
            className="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent"
            type="button"
            onClick={() => onApprove(approval, 'decline')}
          >
            拒绝
          </button>
        ) : null}
        {approval.decisions.includes('acceptForSession') ? (
          <button
            className="h-7 rounded-md border border-border bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
            onClick={() => onApprove(approval, 'acceptForSession')}
          >
            本次任务允许
          </button>
        ) : null}
        {approval.decisions.includes('accept') ? (
          <button
            className="h-7 rounded-md bg-foreground px-2 text-[11px] text-background"
            type="button"
            onClick={() => onApprove(approval, 'accept')}
          >
            允许
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ThreadHistory({
  query,
  threads,
  onArchive,
  onDelete,
  onOpen,
  onQueryChange,
}: {
  query: string;
  threads: CodexThread[];
  onArchive: (thread: CodexThread) => void;
  onDelete: (thread: CodexThread) => void;
  onOpen: (thread: CodexThread) => void;
  onQueryChange: (query: string) => void;
}) {
  const grouped = groupThreadsByDate(threads);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <label className="mb-3 flex h-8 items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5">
        <Search size={14} className="text-muted-foreground" />
        <input
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/65"
          placeholder="搜索历史任务"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      {grouped.length === 0 ? (
        <div className="px-3 py-16 text-center text-xs text-muted-foreground">
          暂无历史任务
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-0.5">
                {group.threads.map((thread) => (
                  <div
                    className="group flex items-center rounded-lg hover:bg-accent/70"
                    key={thread.id}
                  >
                    <button
                      className="min-w-0 flex-1 px-2 py-2 text-left"
                      type="button"
                      onClick={() => onOpen(thread)}
                    >
                      <div className="truncate text-xs font-medium">
                        {thread.name || thread.preview || '未命名任务'}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {thread.preview || 'Codex 任务'}
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="任务菜单"
                          className="mr-1 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100"
                          type="button"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onSelect={() => onArchive(thread)}>
                          <Archive size={14} />
                          归档
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => onDelete(thread)}
                        >
                          <Trash2 size={14} />
                          删除记录
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiComposer({
  active,
  currentDocument,
  effort,
  mentionDocuments,
  mentionQuery,
  mcpServerCount,
  models,
  runtimeStatus,
  selectedModel,
  selectedModelInfo,
  submitting,
  value,
  version,
  onEffortChange,
  onInterrupt,
  onMentionQueryChange,
  onMentionsChange,
  onModelChange,
  onOpenMention,
  onSend,
  onValueChange,
}: {
  active: boolean;
  currentDocument: WorkspaceNode | null;
  effort: CodexReasoningEffort;
  mentionDocuments: AiDocumentReference[];
  mentionQuery: string | null;
  mcpServerCount: number;
  models: CodexModel[];
  runtimeStatus: RuntimeStatus;
  selectedModel: string;
  selectedModelInfo: CodexModel | null;
  submitting: boolean;
  value: string;
  version: string | null;
  onEffortChange: (effort: CodexReasoningEffort) => void;
  onInterrupt: () => void;
  onMentionQueryChange: (query: string | null) => void;
  onMentionsChange: (documents: AiComposerMention[]) => void;
  onModelChange: (model: string) => void;
  onOpenMention: (path: string) => void;
  onSend: () => void;
  onValueChange: (value: string) => void;
}) {
  const disabled = runtimeStatus !== 'ready';
  const effortOptions = selectedModelInfo?.supportedReasoningEfforts ?? [];
  const editorRef = React.useRef<HTMLDivElement>(null);
  const initializedRef = React.useRef(false);
  const savedRangeRef = React.useRef<Range | null>(null);
  const mentionPathsRef = React.useRef<string[]>([]);
  const placeholder = disabled
    ? '桌面端连接 Codex 后可用'
    : '要求后续变更，使用 @ 提及文档';

  const saveSelection = React.useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();

    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    savedRangeRef.current = range.cloneRange();
  }, []);

  const syncEditorState = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const snapshot = readComposerSnapshot(editor);
    const nextValue = snapshot.value;
    if (!nextValue) {
      editor.replaceChildren();
    }
    onValueChange(nextValue);

    const nextMentions = snapshot.mentions;
    const nextPaths = nextMentions.map((document) => document.absolutePath);
    if (!sameStringArray(mentionPathsRef.current, nextPaths)) {
      mentionPathsRef.current = nextPaths;
      onMentionsChange(nextMentions);
    }
  }, [onMentionsChange, onValueChange]);

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (value) {
        editor.textContent = value;
      }
      return;
    }

    if (!value && editor.hasChildNodes()) {
      editor.replaceChildren();
      savedRangeRef.current = null;
      mentionPathsRef.current = [];
    }
  }, [value]);

  const insertMention = React.useCallback(
    (document: AiDocumentReference) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.focus();
      const range = getComposerRange(editor, savedRangeRef.current);
      removeMentionQuery(editor, range, `@${mentionQuery ?? ''}`);
      range.deleteContents();

      const mention = createMentionElement(document);
      const trailingSpace = window.document.createTextNode('\u00a0');
      range.insertNode(mention);
      mention.after(trailingSpace);

      const selection = window.getSelection();
      range.setStart(trailingSpace, trailingSpace.data.length);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();

      onMentionQueryChange(null);
      syncEditorState();
    },
    [mentionQuery, onMentionQueryChange, syncEditorState],
  );

  return (
    <div className="shrink-0 px-3 pb-3 pt-2">
      <div className="relative rounded-2xl border border-border/80 bg-background shadow-[0_1px_4px_rgba(15,23,42,0.06)] focus-within:border-foreground/20">
        {mentionQuery !== null ? (
          <MentionMenu
            documents={mentionDocuments}
            query={mentionQuery}
            onClose={() => onMentionQueryChange(null)}
            onSelect={insertMention}
          />
        ) : null}

        {currentDocument ? (
          <div className="flex flex-wrap gap-1 px-3 pt-2.5">
            <ContextChip label={currentDocument.title || currentDocument.name} />
          </div>
        ) : null}

        <div
          aria-label="向 Codex 提问"
          aria-multiline="true"
          className="scrollbar-thin block min-h-14 max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 pb-2 pt-3 text-[13px] leading-5 outline-none data-[disabled=true]:cursor-not-allowed data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground/60 data-[empty=true]:before:content-[attr(data-placeholder)]"
          contentEditable={!disabled}
          data-disabled={disabled}
          data-empty={!value}
          data-placeholder={placeholder}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
          onBlur={saveSelection}
          onClick={(event) => {
            const mention = findMentionElement(event.target);
            if (mention) {
              event.preventDefault();
              onOpenMention(mention.dataset.mentionPath ?? '');
              return;
            }
            saveSelection();
          }}
          onInput={() => {
            saveSelection();
            syncEditorState();
          }}
          onKeyDown={(event) => {
            const mention = findMentionElement(event.target);
            if (mention && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onOpenMention(mention.dataset.mentionPath ?? '');
              return;
            }

            if (
              (event.key === 'Backspace' || event.key === 'Delete') &&
              deleteAdjacentMention(
                editorRef.current,
                event.key === 'Backspace' ? 'backward' : 'forward',
              )
            ) {
              event.preventDefault();
              saveSelection();
              syncEditorState();
              return;
            }

            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              mentionQuery === null &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          onKeyUp={saveSelection}
          onPaste={(event) => {
            event.preventDefault();
            insertPlainTextAtSelection(
              editorRef.current,
              event.clipboardData.getData('text/plain'),
              savedRangeRef,
            );
            syncEditorState();
          }}
        />

        <div className="flex h-10 items-center gap-1 px-2 pb-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="添加上下文与工具"
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                disabled={disabled}
                type="button"
              >
                <Plus size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56" side="top">
              <DropdownMenuItem onSelect={() => onMentionQueryChange('')}>
                <FileText size={14} />
                提及工作区文档
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Globe2 size={14} />
                联网搜索已启用
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Blocks size={14} />
                {mcpServerCount > 0
                  ? `${mcpServerCount} 个 MCP Server 可用`
                  : '暂无 MCP Server'}
              </DropdownMenuItem>
              {version ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-normal text-[10px] text-muted-foreground">
                    {version}
                  </DropdownMenuLabel>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <ShieldCheck size={13} />
            工作区访问
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 max-w-32 items-center gap-1 truncate rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  disabled={disabled || models.length === 0}
                  type="button"
                >
                  <span className="truncate">
                    {selectedModelInfo?.displayName || 'Codex'}
                  </span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto" side="top">
                <DropdownMenuLabel>模型</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={selectedModel} onValueChange={onModelChange}>
                  {models.map((model) => (
                    <DropdownMenuRadioItem key={model.model} value={model.model}>
                      <div className="min-w-0">
                        <div className="text-xs">{model.displayName}</div>
                        <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                          {model.description}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  disabled={disabled || effortOptions.length === 0}
                  type="button"
                >
                  {formatEffort(effort)}
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48" side="top">
                <DropdownMenuLabel>推理强度</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={effort} onValueChange={(value) => onEffortChange(value as CodexReasoningEffort)}>
                  {effortOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.reasoningEffort}
                      value={option.reasoningEffort}
                    >
                      <div>
                        <div className="text-xs">
                          {formatEffort(option.reasoningEffort)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {option.description}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {active ? (
              <button
                aria-label="停止生成"
                className="ml-1 flex size-8 items-center justify-center rounded-full bg-foreground text-background"
                type="button"
                onClick={onInterrupt}
              >
                <Square fill="currentColor" size={10} />
              </button>
            ) : (
              <button
                aria-label="发送"
                className="ml-1 flex size-8 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
                disabled={disabled || submitting || !value.trim()}
                type="button"
                onClick={onSend}
              >
                {submitting ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <ArrowUp size={15} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MentionMenu({
  documents,
  query,
  onClose,
  onSelect,
}: {
  documents: AiDocumentReference[];
  query: string;
  onClose: () => void;
  onSelect: (document: AiDocumentReference) => void;
}) {
  return (
    <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>@ 提及文档{query ? ` · ${query}` : ''}</span>
        <button aria-label="关闭提及列表" type="button" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {documents.length === 0 ? (
          <div className="px-2 py-5 text-center text-xs text-muted-foreground">
            没有匹配的文档
          </div>
        ) : (
          documents.map((document) => (
            <button
              aria-label={`提及 ${document.title || document.name}`}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent"
              key={document.absolutePath}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(document)}
            >
              <FileText className="shrink-0 text-muted-foreground" size={14} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">
                  {document.title || document.name}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {document.relativePath}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ContextChip({
  dismissible = false,
  label,
  onDismiss,
}: {
  dismissible?: boolean;
  label: string;
  onDismiss?: () => void;
}) {
  return (
    <span className="inline-flex h-6 max-w-52 items-center gap-1 rounded-md border border-border/70 bg-muted/35 px-1.5 text-[10px] text-muted-foreground">
      <FileText size={11} />
      <span className="truncate">{label}</span>
      {dismissible ? (
        <button aria-label={`移除 ${label}`} type="button" onClick={onDismiss}>
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}

function createMentionElement(document: AiDocumentReference) {
  const mention = window.document.createElement('span');
  const label = document.title || document.name;

  mention.className = mentionLinkClassName;
  mention.contentEditable = 'false';
  mention.dataset.mentionId = document.id;
  mention.dataset.mentionName = document.name;
  mention.dataset.mentionPath = document.absolutePath;
  mention.dataset.mentionRelativePath = document.relativePath;
  mention.dataset.mentionTitle = document.title || '';
  mention.dataset.mentionLabel = label;
  mention.setAttribute('aria-label', label);
  mention.setAttribute('role', 'link');
  mention.tabIndex = 0;
  mention.textContent = label;

  return mention;
}

function findMentionElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>('[data-mention-path]');
}

function getComposerRange(editor: HTMLElement, savedRange: Range | null) {
  if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
    return savedRange.cloneRange();
  }

  const range = window.document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

function removeMentionQuery(
  editor: HTMLElement,
  range: Range,
  expectedQuery: string,
) {
  if (!expectedQuery) {
    return;
  }

  const prefixRange = window.document.createRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const prefix = prefixRange.toString();

  if (!prefix.endsWith(expectedQuery)) {
    return;
  }

  const start = findTextPosition(editor, prefix.length - expectedQuery.length);
  if (!start) {
    return;
  }

  range.setStart(start.node, start.offset);
  range.deleteContents();
}

function findTextPosition(root: HTMLElement, targetOffset: number) {
  const walker = window.document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  let consumed = 0;
  let current = walker.nextNode();

  while (current) {
    const length = current.textContent?.length ?? 0;
    if (consumed + length >= targetOffset) {
      return {
        node: current,
        offset: Math.max(0, targetOffset - consumed),
      };
    }
    consumed += length;
    current = walker.nextNode();
  }

  return null;
}

function readComposerSnapshot(editor: HTMLElement) {
  let value = '';
  const mentions: AiComposerMention[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += (node.textContent ?? '').replaceAll('\u00a0', ' ');
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    if (node.dataset.mentionPath) {
      const label = node.dataset.mentionLabel ?? node.textContent ?? '';
      const start = value.length;
      value += label;
      mentions.push({
        absolutePath: node.dataset.mentionPath,
        end: value.length,
        id: node.dataset.mentionId ?? '',
        label,
        name: node.dataset.mentionName ?? '',
        path: node.dataset.mentionPath,
        relativePath: node.dataset.mentionRelativePath ?? '',
        start,
        title: node.dataset.mentionTitle || undefined,
      });
      return;
    }

    if (node.tagName === 'BR') {
      value += '\n';
      return;
    }

    const isBlock = node !== editor && ['DIV', 'P'].includes(node.tagName);
    if (isBlock && value && !value.endsWith('\n')) {
      value += '\n';
    }
    node.childNodes.forEach(visit);
    if (isBlock && !value.endsWith('\n')) {
      value += '\n';
    }
  };

  editor.childNodes.forEach(visit);
  return {
    mentions,
    value: value.replace(/\n$/, ''),
  };
}

function insertPlainTextAtSelection(
  editor: HTMLElement | null,
  text: string,
  savedRangeRef: React.MutableRefObject<Range | null>,
) {
  if (!editor || !text) {
    return;
  }

  editor.focus();
  const range = getComposerRange(editor, savedRangeRef.current);
  const textNode = window.document.createTextNode(text);
  range.deleteContents();
  range.insertNode(textNode);
  range.setStart(textNode, textNode.data.length);
  range.collapse(true);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedRangeRef.current = range.cloneRange();
}

function deleteAdjacentMention(
  editor: HTMLElement | null,
  direction: 'backward' | 'forward',
) {
  const selection = window.getSelection();
  if (
    !editor ||
    !selection ||
    selection.rangeCount === 0 ||
    !selection.isCollapsed
  ) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return false;
  }

  const adjacent = findAdjacentMention(range, direction);
  if (!adjacent) {
    return false;
  }

  const parent = adjacent.mention.parentNode;
  if (!parent) {
    return false;
  }

  const mentionIndex = Array.from(parent.childNodes).indexOf(adjacent.mention);
  if (adjacent.spacer?.parentNode) {
    adjacent.spacer.parentNode.removeChild(adjacent.spacer);
  }
  adjacent.mention.remove();
  range.setStart(parent, Math.max(0, mentionIndex));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function findAdjacentMention(
  range: Range,
  direction: 'backward' | 'forward',
) {
  const container = range.startContainer;
  const offset = range.startOffset;

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent ?? '';
    if (
      direction === 'backward' &&
      offset <= 1 &&
      /^\s?$/.test(text.slice(0, offset))
    ) {
      const mention = asMentionElement(container.previousSibling);
      return mention ? { mention, spacer: container } : null;
    }
    if (
      direction === 'forward' &&
      offset >= text.length - 1 &&
      /^\s?$/.test(text.slice(offset))
    ) {
      const mention = asMentionElement(container.nextSibling);
      return mention ? { mention, spacer: container } : null;
    }
    return null;
  }

  const children = container.childNodes;
  const candidate =
    direction === 'backward' ? children[offset - 1] : children[offset];
  const directMention = asMentionElement(candidate);
  if (directMention) {
    return { mention: directMention, spacer: null };
  }

  if (candidate?.nodeType === Node.TEXT_NODE && /^\s?$/.test(candidate.textContent ?? '')) {
    const mention = asMentionElement(
      direction === 'backward'
        ? candidate.previousSibling
        : candidate.nextSibling,
    );
    return mention ? { mention, spacer: candidate } : null;
  }

  return null;
}

function asMentionElement(node: Node | null | undefined) {
  return node instanceof HTMLElement && node.dataset.mentionPath ? node : null;
}

function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function uniqueDocuments(documents: AiDocumentReference[]) {
  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.absolutePath)) {
      return false;
    }
    seen.add(document.absolutePath);
    return true;
  });
}

function groupThreadsByDate(threads: CodexThread[]) {
  const groups = new Map<string, CodexThread[]>();

  for (const thread of threads) {
    const label = dateGroupLabel(thread.updatedAt * 1000);
    groups.set(label, [...(groups.get(label) ?? []), thread]);
  }

  return [...groups.entries()].map(([label, items]) => ({
    label,
    threads: items,
  }));
}

function dateGroupLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((todayStart - dateStart) / 86_400_000);

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatEffort(effort: CodexReasoningEffort) {
  const labels: Record<string, string> = {
    none: '关闭',
    minimal: '极速',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '极高',
  };
  return labels[effort] ?? effort;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Codex 请求失败';
}

'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  CircleCheck,
  Download,
  FileText,
  Globe,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';

import type { DocumentPanelData } from '@/components/workspace/ai-side-panel';
import { Button } from '@/components/ui/button';
import {
  cancelAiTurn,
  isTauriRuntime,
  listAiAgentModels,
  listAiAgentProfiles,
  listAiCommands,
  listAiConversations,
  listAiCustomAgents,
  listAiMcpServers,
  listAiSkills,
  loadWorkspaceTree,
  listenAiEvents,
  readAppSettings,
  readMarkdownDocument,
  readAiConversation,
  respondAiPermission,
  saveAiConversation,
  sendAiPrompt,
  startAiSession,
} from '@/components/workspace/workspace-api';
import {
  DEFAULT_APP_SETTINGS,
  withDefaultAppSettings,
} from '@/components/workspace/workspace-settings';
import type {
  AiCommandItem,
  AiCustomAgentItem,
  AiMcpServerItem,
  AiSkillItem,
} from '@/components/workspace/ai-settings/ai-settings-types';
import type {
  AppSettings,
  WorkspaceNode,
} from '@/components/workspace/workspace-types';
import { cn } from '@/lib/utils';

import { buildAiContextPack } from './ai-context';
import { createStableContentHash } from './ai-context';
import {
  createInitialAiPanelState,
  reduceAiPanelState,
} from './ai-reducer';
import type {
  AiConversationRecord,
  AiConversationSummary,
  AiContextReference,
  AiDetectedModel,
  AiIntent,
  AiPanelPermissionRequest,
  AiPanelThinkingBlock,
  AiPanelToolCall,
  AiPanelUsage,
} from './ai-types';

interface AiPanelContentProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  settingsVersion?: number;
  workspaceRootPath: string | null;
  onOpenSettings?: () => void;
}

type AiMentionKind = 'agent' | 'command' | 'file' | 'mcp-tool' | 'skill';

interface AiMentionReference {
  detail: string;
  id: string;
  kind: AiMentionKind;
  label: string;
  node?: WorkspaceNode;
  reference?: AiContextReference;
}

export function AiPanelContent({
  currentDocument,
  documentPanelData,
  settingsVersion = 0,
  workspaceRootPath,
  onOpenSettings,
}: AiPanelContentProps) {
  const [state, dispatch] = React.useReducer(
    reduceAiPanelState,
    undefined,
    createInitialAiPanelState,
  );
  const [appSettings, setAppSettings] =
    React.useState(DEFAULT_APP_SETTINGS);
  const [prompt, setPrompt] = React.useState('');
  const [activePopover, setActivePopover] = React.useState<
    'actions' | 'history' | 'models' | null
  >(null);
  const [models, setModels] = React.useState<AiDetectedModel[]>([]);
  const [modelsLoadedForRoot, setModelsLoadedForRoot] = React.useState<
    string | null
  >(null);
  const [modelSearch, setModelSearch] = React.useState('');
  const [historySearch, setHistorySearch] = React.useState('');
  const [conversationHistory, setConversationHistory] = React.useState<
    AiConversationSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [activeConversationId, setActiveConversationId] = React.useState<
    string | null
  >(null);
  const [conversationCreatedAt, setConversationCreatedAt] = React.useState<
    number | null
  >(null);
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(
    null,
  );
  const [mentionInventoryLoadedForRoot, setMentionInventoryLoadedForRoot] = React.useState<
    string | null
  >(null);
  const [selectedReferences, setSelectedReferences] = React.useState<
    AiMentionReference[]
  >([]);
  const [mentionInventory, setMentionInventory] = React.useState<
    AiMentionReference[]
  >([]);
  const [conversationReferences, setConversationReferences] = React.useState<
    AiContextReference[]
  >([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionLoading, setMentionLoading] = React.useState(false);
  const [sessionNotice, setSessionNotice] = React.useState<string | null>(null);
  const notifiedPermissionIdsRef = React.useRef<Set<string>>(new Set());
  const notifiedRunStateRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!workspaceRootPath) {
      return;
    }

    let cancelled = false;
    const rootPath = workspaceRootPath;

    async function loadAiConfiguration() {
      try {
        const [profiles, settings] = await Promise.all([
          listAiAgentProfiles(rootPath),
          loadAppSettings(),
        ]);

        if (!cancelled) {
          const normalizedSettings = withDefaultAppSettings(settings);
          const selectedProfileId = selectInitialProfileId(
            profiles,
            normalizedSettings.ai.enabledProfileId,
          );

          setAppSettings(normalizedSettings);
          dispatch({
            profiles,
            selectedProfileId,
            type: 'profilesLoaded',
          });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            message:
              error instanceof Error ? error.message : '无法读取 AI agent 列表',
            type: 'errorRaised',
          });
        }
      }
    }

    void loadAiConfiguration();

    return () => {
      cancelled = true;
    };
  }, [settingsVersion, workspaceRootPath]);

  React.useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    listenAiEvents((event) => {
      if (!disposed) {
        dispatch({ event, type: 'runtimeEventReceived' });
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const selectedProfile = state.profiles.find(
    (profile) => profile.id === state.selectedProfileId,
  );
  const selectedSettingsProfile =
    appSettings.ai.profiles.find(
      (profile) => profile.id === appSettings.ai.enabledProfileId,
    ) ?? null;
  const profileReady =
    Boolean(workspaceRootPath) &&
    Boolean(state.selectedProfileId) &&
    Boolean(selectedProfile) &&
    selectedProfile?.detection.status === 'available';
  const runtimeReady = profileReady;
  const profileMetadata = selectedProfile ?? selectedSettingsProfile;
  const effectiveSelectedModelId =
    selectedModelId ??
    getPreferredModelId({
      models: [],
      profile: profileMetadata,
      settings: appSettings,
    });
  const visibleModels = React.useMemo(
    () =>
      models.filter((model) => !appSettings.ai.hiddenModelIds.includes(model.id)),
    [appSettings.ai.hiddenModelIds, models],
  );
  const modelOptions = React.useMemo(
    () => buildModelOptions(visibleModels, state.profiles),
    [state.profiles, visibleModels],
  );
  const selectedModel =
    modelOptions.find((model) => model.id === effectiveSelectedModelId) ??
    null;
  const sessionStartOptions = React.useMemo(
    () =>
      buildSessionStartOptions({
        modelId: effectiveSelectedModelId,
        profile: profileMetadata,
        settings: appSettings,
      }),
    [appSettings, effectiveSelectedModelId, profileMetadata],
  );
  const settingsDisabled =
    Boolean(workspaceRootPath) &&
    !profileReady;
  const hasRuntimeActivity =
    state.messages.length > 0 ||
    state.thinking.length > 0 ||
    state.tools.length > 0 ||
    state.permissions.length > 0 ||
    Boolean(state.usage) ||
    Boolean(state.runState);
  const currentDocumentReference = React.useMemo(
    () =>
      currentDocument && documentPanelData
        ? buildCurrentDocumentReference(currentDocument, documentPanelData)
        : null,
    [currentDocument, documentPanelData],
  );
  const mentionOptions = React.useMemo(
    () =>
      buildMentionOptions({
        inventory: mentionInventory,
        query: mentionQuery,
        selectedReferences,
      }),
    [mentionInventory, mentionQuery, selectedReferences],
  );

  React.useEffect(() => {
    for (const permission of state.permissions) {
      if (notifiedPermissionIdsRef.current.has(permission.requestId)) {
        continue;
      }

      notifiedPermissionIdsRef.current.add(permission.requestId);
      showAiDesktopNotification(appSettings, {
        body: `${permission.toolName} needs approval`,
        title: 'AI Assistant needs input',
      });
    }
  }, [appSettings, state.permissions]);

  React.useEffect(() => {
    if (state.runState?.state !== 'completed') {
      return;
    }

    const notificationKey = `${state.session?.sessionId ?? activeConversationId ?? 'session'}:completed`;
    if (notifiedRunStateRef.current === notificationKey) {
      return;
    }

    notifiedRunStateRef.current = notificationKey;
    showAiDesktopNotification(appSettings, {
      body: `${profileMetadata?.label ?? 'AI Assistant'} completed the task`,
      playSound: true,
      title: 'AI Assistant completed',
    });
  }, [
    activeConversationId,
    appSettings,
    profileMetadata?.label,
    state.runState?.state,
    state.session?.sessionId,
  ]);

  const loadModels = React.useCallback(async () => {
    if (!workspaceRootPath || modelsLoadedForRoot === workspaceRootPath) {
      return;
    }

    try {
      const runtimeModels = await listAiAgentModels(workspaceRootPath);
      const visibleRuntimeModels = runtimeModels.filter(
        (model) => !appSettings.ai.hiddenModelIds.includes(model.id),
      );

      setModels(runtimeModels);
      setModelsLoadedForRoot(workspaceRootPath);
      setSelectedModelId((current) => {
        const visibleModelIds = new Set(
          visibleRuntimeModels.map((model) => model.id),
        );

        if (current && visibleModelIds.has(current)) {
          return current;
        }

        return getPreferredModelId({
          models: visibleRuntimeModels,
          profile: profileMetadata,
          settings: appSettings,
        });
      });
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : '无法读取本地模型列表',
        type: 'errorRaised',
      });
    }
  }, [appSettings, modelsLoadedForRoot, profileMetadata, workspaceRootPath]);

  const loadConversationHistory = React.useCallback(async () => {
    if (!workspaceRootPath) {
      return;
    }

    setHistoryLoading(true);
    try {
      setConversationHistory(await listAiConversations(workspaceRootPath));
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : '无法读取 AI 会话历史',
        type: 'errorRaised',
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [workspaceRootPath]);

  const loadMentionInventory = React.useCallback(async () => {
    if (
      !workspaceRootPath ||
      mentionInventoryLoadedForRoot === workspaceRootPath
    ) {
      return;
    }

    setMentionLoading(true);
    try {
      const [snapshot, skills, commands, agents, mcpServers] =
        await Promise.all([
          loadWorkspaceTree(workspaceRootPath),
          listAiSkills(workspaceRootPath),
          listAiCommands(workspaceRootPath),
          listAiCustomAgents(workspaceRootPath),
          listAiMcpServers(workspaceRootPath),
        ]);
      const documents = flattenWorkspaceDocuments(snapshot.nodes);

      setMentionInventory(
        buildMentionInventory({
          agents,
          commands,
          documents,
          mcpServers,
          skills,
        }),
      );
      setMentionInventoryLoadedForRoot(workspaceRootPath);
    } catch (error) {
      dispatch({
        message:
          error instanceof Error ? error.message : '无法读取工作区引用列表',
        type: 'errorRaised',
      });
    } finally {
      setMentionLoading(false);
    }
  }, [mentionInventoryLoadedForRoot, workspaceRootPath]);

  React.useEffect(() => {
    if (
      !workspaceRootPath ||
      !activeConversationId ||
      !profileMetadata ||
      !hasRuntimeActivity
    ) {
      return;
    }

    const handle = window.setTimeout(() => {
      const record = buildConversationRecord({
        activeConversationId,
        conversationCreatedAt,
        conversationReferences,
        currentDocument,
        profileMetadata,
        state,
      });

      void saveAiConversation(workspaceRootPath, record)
        .then((summary) => {
          setConversationHistory((current) =>
            upsertConversationSummary(current, summary),
          );
        })
        .catch((error) => {
          dispatch({
            message:
              error instanceof Error ? error.message : '无法保存 AI 会话',
            type: 'errorRaised',
          });
        });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [
    activeConversationId,
    conversationReferences,
    conversationCreatedAt,
    currentDocument,
    hasRuntimeActivity,
    profileMetadata,
    state,
    workspaceRootPath,
  ]);

  const submitPrompt = React.useCallback(
    async (content: string, intent: AiIntent = 'chat') => {
      const trimmed = content.trim();

      if (!workspaceRootPath || !runtimeReady || !trimmed) {
        return;
      }

      const context = buildAiContextPack({
        currentDocument,
        documentPanelData,
        intent,
        references: await resolveMentionReferences({
          references: selectedReferences,
          workspaceRootPath,
        }),
        workspaceRootPath,
      });
      const userMessageId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `user-${Date.now()}`;

      dispatch({ type: 'connectRequested' });

      try {
        if (!state.selectedProfileId || !selectedProfile) {
          return;
        }

        const session =
          state.session ??
          (await startAiSession({
            ...sessionStartOptions,
            context,
            profileId: state.selectedProfileId,
            rootPath: workspaceRootPath,
          }));

        if (!state.session) {
          setActiveConversationId((current) => current ?? session.sessionId);
          setConversationCreatedAt((current) => current ?? Date.now());
          dispatch({
            event: { session, type: 'sessionStarted' },
            type: 'runtimeEventReceived',
          });
        }
        setConversationReferences(context.references ?? []);

        dispatch({
          content: trimmed,
          id: userMessageId,
          type: 'userMessageSubmitted',
        });

        await sendAiPrompt({
          context,
          prompt: stripMentionTokens(trimmed),
          sessionId: session.sessionId,
        });
        setPrompt('');
        setMentionQuery(null);
      } catch (error) {
        dispatch({
          message: error instanceof Error ? error.message : 'AI 请求失败',
          type: 'errorRaised',
        });
      }
    },
    [
      currentDocument,
      documentPanelData,
      runtimeReady,
      selectedProfile,
      selectedReferences,
      sessionStartOptions,
      state.selectedProfileId,
      state.session,
      workspaceRootPath,
    ],
  );
  const canSend =
    Boolean(workspaceRootPath) &&
    runtimeReady &&
    Boolean(prompt.trim()) &&
    state.status !== 'streaming' &&
    state.status !== 'connecting';

  const handlePromptChange = React.useCallback(
    (value: string) => {
      setPrompt(value);
      const query = getActiveMentionQuery(value);
      setMentionQuery(query);

      if (query !== null) {
        void loadMentionInventory();
      }
    },
    [loadMentionInventory],
  );

  const handleSelectReference = React.useCallback(
    (reference: AiMentionReference) => {
      setSelectedReferences((current) =>
        current.some((item) => item.id === reference.id)
          ? current
          : [...current, reference],
      );
      setPrompt((current) => removeActiveMentionToken(current));
      setMentionQuery(null);
    },
    [],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex min-h-12 items-center justify-end gap-1 border-b px-2">
        <IconToolButton
          active={activePopover === 'actions'}
          ariaLabel="快捷动作"
          onClick={() =>
            setActivePopover(activePopover === 'actions' ? null : 'actions')
          }
        >
          <Sparkles size={16} />
        </IconToolButton>
        <IconToolButton
          ariaLabel="新会话"
          onClick={() => {
            dispatch({ type: 'sessionCleared' });
            setActiveConversationId(null);
            setConversationCreatedAt(null);
            setConversationReferences([]);
            setSelectedReferences([]);
            setSessionNotice('New session');
            setActivePopover(null);
          }}
        >
          <Plus size={17} />
        </IconToolButton>
        <IconToolButton
          active={activePopover === 'history'}
          ariaLabel="历史会话"
          onClick={() => {
            const nextPopover = activePopover === 'history' ? null : 'history';
            setActivePopover(nextPopover);

            if (nextPopover === 'history') {
              void loadConversationHistory();
            }
          }}
        >
          <History size={17} />
        </IconToolButton>
        <IconToolButton ariaLabel="关闭 AI 面板" onClick={() => setActivePopover(null)}>
          <X size={17} />
        </IconToolButton>
      </header>

      {activePopover === 'actions' ? (
        <FloatingPanel className="right-3 top-14 w-[220px] p-3">
          <Button
            disabled={!profileReady || !documentPanelData}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setActivePopover(null);
              submitPrompt('Generate Title', 'summarize-document');
            }}
          >
            Generate Title
          </Button>
        </FloatingPanel>
      ) : null}

      {activePopover === 'history' ? (
        <FloatingPanel className="right-3 top-14 w-[320px] overflow-hidden p-0">
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search..."
              value={historySearch}
              onChange={(event) => setHistorySearch(event.currentTarget.value)}
            />
            <Search size={17} />
            <Download size={16} />
          </div>
          <div className="grid gap-1 p-2 text-sm">
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {historyLoading ? 'Loading...' : 'Recent'}
            </p>
            {conversationHistory.filter((item) =>
              item.title.toLowerCase().includes(historySearch.toLowerCase()),
            ).map((item) => (
              <button
                aria-label={`恢复会话 ${item.title}`}
                className={cn(
                  'grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md px-2 py-1 text-left hover:bg-muted',
                  activeConversationId === item.id && 'bg-muted',
                )}
                key={item.id}
                type="button"
                onClick={async () => {
                  if (!workspaceRootPath) {
                    return;
                  }

                  try {
                    const conversation = await readAiConversation(
                      workspaceRootPath,
                      item.id,
                    );

                    setActiveConversationId(conversation.id);
                    setConversationCreatedAt(conversation.createdAt);
                    if (
                      state.profiles.some(
                        (profile) => profile.id === conversation.profileId,
                      )
                    ) {
                      dispatch({
                        profileId: conversation.profileId,
                        type: 'profileSelected',
                      });
                    }
                    dispatch({
                      conversation,
                      type: 'conversationRestored',
                    });
                    setConversationReferences(conversation.references ?? []);
                    setSelectedReferences([]);
                    setActivePopover(null);
                    setSessionNotice(null);
                  } catch (error) {
                    dispatch({
                      message:
                        error instanceof Error
                          ? error.message
                          : '无法恢复 AI 会话',
                      type: 'errorRaised',
                    });
                  }
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.profileLabel}
                    {item.documentTitle ? ` · ${item.documentTitle}` : ''}
                  </span>
                </span>
                {activeConversationId === item.id ? <Check size={16} /> : null}
              </button>
            ))}
            {!historyLoading && conversationHistory.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                暂无真实会话历史。
              </p>
            ) : null}
          </div>
        </FloatingPanel>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mb-3 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <FileText size={15} />
          <span className="truncate">
            {currentDocument?.title || currentDocument?.name || '未选择文档'}
          </span>
          {documentPanelData?.markdown ? (
            <span className="shrink-0">
              {documentPanelData.markdown.length} ch
            </span>
          ) : null}
        </div>
        <ContextReferenceStrip
          currentDocumentReference={currentDocumentReference}
          references={
            conversationReferences.length > 0
              ? conversationReferences
              : selectedReferences.map((reference) =>
                  buildPendingMentionReference(reference),
                )
          }
          onRemoveReference={(relativePath) => {
            setSelectedReferences((current) =>
              current.filter(
                (item) => mentionReferenceRelativePath(item) !== relativePath,
              ),
            );
            setConversationReferences((current) =>
              current.filter((item) => item.relativePath !== relativePath),
            );
          }}
        />

        {settingsDisabled ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <h3 className="text-sm font-medium">未启用 AI 模型</h3>
            <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
              需要先在 AI Account 中连接本地 Codex 或 Claude Code。
            </p>
            <Button
              className="mt-3"
              disabled={!onOpenSettings}
              size="sm"
              type="button"
              variant="outline"
              onClick={onOpenSettings}
            >
              <Settings size={14} />
              打开 AI 设置
            </Button>
          </div>
        ) : !hasRuntimeActivity ? (
          <div className="flex min-h-[260px] flex-col justify-center text-sm text-muted-foreground">
            <p>{sessionNotice ?? '选择一个操作，或直接输入问题。'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <RuntimeSummary
              runState={state.runState}
              status={state.status}
              usage={state.usage}
            />
            <ThinkingActivity
              status={state.status}
              thinking={state.thinking}
            />
            <MessageList messages={state.messages} />
            <RuntimeActivity
              permissions={state.permissions}
              sessionId={state.session?.sessionId ?? null}
              tools={state.tools}
            />
          </div>
        )}
      </div>

      {activePopover === 'models' ? (
        <FloatingPanel
          className="bottom-[92px] left-3 right-3 max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:right-auto sm:w-[320px]"
          testId="ai-model-popover"
        >
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search models..."
              value={modelSearch}
              onChange={(event) => setModelSearch(event.currentTarget.value)}
            />
            <Search size={16} />
          </div>
          <ModelList
            models={modelOptions}
            query={modelSearch}
            selectedModelId={effectiveSelectedModelId}
            onSelect={(model) => {
              setSelectedModelId(model.id);
              dispatch({ profileId: model.profileId, type: 'profileSelected' });
              setActivePopover(null);
            }}
          />
        </FloatingPanel>
      ) : null}

      {state.error ? (
        <p className="border-t px-3 py-2 text-xs text-destructive">{state.error}</p>
      ) : null}

      <form
        className="border-t bg-background p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitPrompt(prompt);
        }}
      >
        <div
          className="rounded-xl border bg-background p-3 shadow-sm"
          data-testid="ai-composer"
        >
          <textarea
            className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!workspaceRootPath || !runtimeReady}
            placeholder="向 AI 询问当前工作区..."
            value={prompt}
            onChange={(event) => handlePromptChange(event.currentTarget.value)}
          />
          {mentionQuery !== null ? (
            <MentionPicker
              loading={mentionLoading}
              options={mentionOptions}
              onSelect={handleSelectReference}
            />
          ) : null}
          <div
            className="mt-2 flex items-center justify-between gap-2"
            data-testid="ai-composer-footer"
          >
            <div className="relative flex min-w-0 items-center gap-2">
              <Button
                aria-label="选择模型"
                className="max-w-[160px] justify-start truncate px-2 text-xs"
                disabled={!workspaceRootPath}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  const nextOpen = activePopover !== 'models';
                  setActivePopover(nextOpen ? 'models' : null);
                  if (nextOpen) {
                    void loadModels();
                  }
                }}
              >
                <Sparkles size={14} />
                <span className="truncate">
                  {selectedModel?.label ??
                    (isModelFirstProvider(profileMetadata?.providerId)
                      ? effectiveSelectedModelId
                      : null) ??
                    profileMetadata?.label ??
                    '选择模型'}
                </span>
                <ChevronDown className="ml-auto" size={13} />
              </Button>
              <span className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                Current Note {documentPanelData?.markdown?.length ?? 0} ch
              </span>
              {selectedReferences.length > 0 ? (
                <span className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  +{selectedReferences.length} referenced
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                aria-label="停止"
                disabled={!state.session || state.status !== 'streaming'}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => {
                  if (state.session) {
                    cancelAiTurn(state.session.sessionId);
                  }
                }}
              >
                <Square size={15} />
              </Button>
              <Button
                aria-label="发送"
                disabled={!canSend}
                size="icon"
                type="submit"
              >
                <Send size={15} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

async function loadAppSettings() {
  if (!isTauriRuntime()) {
    return DEFAULT_APP_SETTINGS;
  }

  return readAppSettings();
}

function selectInitialProfileId(
  profiles: Array<{
    detection: { status: string };
    id: string;
    isTestRuntime: boolean;
  }>,
  persistedProfileId: string | null,
) {
  const persistedProfile = profiles.find(
    (profile) => profile.id === persistedProfileId,
  );

  if (
    persistedProfile &&
    !persistedProfile.isTestRuntime &&
    persistedProfile.detection.status === 'available'
  ) {
    return persistedProfile.id;
  }

  return (
    profiles.find(
      (profile) =>
        !profile.isTestRuntime && profile.detection.status === 'available',
    )?.id ??
    profiles.find((profile) => profile.detection.status === 'available')?.id ??
    null
  );
}

function buildConversationRecord({
  activeConversationId,
  conversationReferences,
  conversationCreatedAt,
  currentDocument,
  profileMetadata,
  state,
}: {
  activeConversationId: string;
  conversationReferences: AiContextReference[];
  conversationCreatedAt: number | null;
  currentDocument: WorkspaceNode | null;
  profileMetadata: {
    id: string;
    label: string;
    providerId: string;
    providerLabel: string;
  };
  state: ReturnType<typeof createInitialAiPanelState>;
}): AiConversationRecord {
  const now = Date.now();
  const firstUserMessage = state.messages.find(
    (message) => message.role === 'user',
  );

  const record: AiConversationRecord = {
    createdAt: conversationCreatedAt ?? now,
    id: activeConversationId,
    messages: state.messages,
    permissions: state.permissions,
    profileId: profileMetadata.id,
    profileLabel: profileMetadata.label,
    providerId: profileMetadata.providerId,
    providerLabel: profileMetadata.providerLabel,
    references: conversationReferences,
    runState: state.runState,
    thinking: state.thinking,
    title: buildConversationTitle(
      firstUserMessage?.content ??
        currentDocument?.title ??
        currentDocument?.name ??
        'New Chat',
    ),
    tools: state.tools,
    updatedAt: now,
    usage: state.usage,
  };

  if (currentDocument?.relativePath) {
    record.documentPath = currentDocument.relativePath;
  }

  const documentTitle = currentDocument?.title ?? currentDocument?.name;
  if (documentTitle) {
    record.documentTitle = documentTitle;
  }

  return record;
}

function buildConversationTitle(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'New Chat';
  }

  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function upsertConversationSummary(
  summaries: AiConversationSummary[],
  nextSummary: AiConversationSummary,
) {
  return [
    nextSummary,
    ...summaries.filter((summary) => summary.id !== nextSummary.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

function showAiDesktopNotification(
  settings: AppSettings,
  notification: {
    body: string;
    playSound?: boolean;
    title: string;
  },
) {
  if (shouldSuppressAiNotification(settings)) {
    return;
  }

  if (notification.playSound) {
    playAiNotificationSound(settings);
  }

  const NotificationConstructor =
    typeof window !== 'undefined' ? window.Notification : undefined;
  if (!NotificationConstructor) {
    return;
  }

  const showNotification = () => {
    try {
      new NotificationConstructor(notification.title, {
        body: notification.body,
      });
    } catch {
      return;
    }
  };

  if (NotificationConstructor.permission === 'granted') {
    showNotification();
    return;
  }

  if (
    NotificationConstructor.permission === 'default' &&
    typeof NotificationConstructor.requestPermission === 'function'
  ) {
    void NotificationConstructor.requestPermission().then((permission) => {
      if (permission === 'granted') {
        showNotification();
      }
    });
  }
}

function shouldSuppressAiNotification(settings: AppSettings) {
  if (!settings.ai.desktopNotificationsEnabled) {
    return true;
  }

  return (
    !settings.ai.notifyWhenFocused &&
    typeof document !== 'undefined' &&
    typeof document.hasFocus === 'function' &&
    document.hasFocus()
  );
}

function playAiNotificationSound(settings: AppSettings) {
  if (!settings.ai.soundNotificationsEnabled) {
    return;
  }

  const AudioContextConstructor =
    typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    const audioContext = new AudioContextConstructor();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      void audioContext.close();
    }, 120);
  } catch {
    return;
  }
}

function ContextReferenceStrip({
  currentDocumentReference,
  references,
  onRemoveReference,
}: {
  currentDocumentReference: AiContextReference | null;
  references: AiContextReference[];
  onRemoveReference: (relativePath: string) => void;
}) {
  if (!currentDocumentReference && references.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5"
      data-testid="ai-context-reference-strip"
    >
      {currentDocumentReference ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <FileText size={12} />
          <span className="truncate">{currentDocumentReference.title}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide">
            当前
          </span>
        </span>
      ) : null}
      {references.map((reference) => (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
          key={reference.relativePath}
        >
          <FileText size={12} />
          <span className="truncate">{reference.title}</span>
          <button
            aria-label={`移除引用 ${reference.title}`}
            className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
            type="button"
            onClick={() => onRemoveReference(reference.relativePath)}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

function MentionPicker({
  loading,
  options,
  onSelect,
}: {
  loading: boolean;
  options: AiMentionReference[];
  onSelect: (reference: AiMentionReference) => void;
}) {
  return (
    <div
      aria-label="工作区文件提及"
      className="mb-2 max-h-52 overflow-auto rounded-md border bg-background p-1 shadow-sm"
      role="listbox"
    >
      {loading ? (
        <div className="flex h-9 items-center gap-2 px-2 text-xs text-muted-foreground">
          <LoaderCircle className="animate-spin" size={13} />
          正在读取工作区文件...
        </div>
      ) : null}
      {!loading && options.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">
          没有匹配的 Markdown 文件。
        </div>
      ) : null}
      {options.map((option) => (
        <button
          aria-label={`${option.label} ${option.detail}`}
          aria-selected={false}
          className="grid h-10 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
          key={option.id}
          role="option"
          type="button"
          onClick={() => onSelect(option)}
        >
          <FileText className="text-muted-foreground" size={14} />
          <span className="min-w-0">
            <span className="block truncate text-sm">{option.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {formatMentionKind(option.kind)} · {option.detail}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function FloatingPanel({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'absolute z-20 rounded-md border bg-background shadow-lg',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function IconToolButton({
  active = false,
  ariaLabel,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      className={cn(active && 'bg-muted text-foreground')}
      size="icon"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function RuntimeSummary({
  runState,
  status,
  usage,
}: {
  runState: { error?: string; state: string } | null;
  status: string;
  usage: AiPanelUsage | null;
}) {
  if (!runState && !usage) {
    return null;
  }

  const running = runState?.state === 'running' || status === 'streaming';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {runState ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1',
            running && 'border-amber-200 bg-amber-50 text-amber-700',
            runState.state === 'failed' &&
              'border-destructive/30 bg-destructive/10 text-destructive',
            runState.state === 'completed' &&
              'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
        >
          {running ? (
            <LoaderCircle className="animate-spin" size={13} />
          ) : runState.state === 'failed' ? (
            <AlertTriangle size={13} />
          ) : (
            <CircleCheck size={13} />
          )}
          {formatRunState(runState.state)}
        </span>
      ) : null}
      {usage ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
          {usage.model ? `${usage.model} · ` : null}
          {usage.inputTokens + usage.outputTokens} tokens
          {typeof usage.totalCostUsd === 'number'
            ? ` · $${usage.totalCostUsd.toFixed(4)}`
            : null}
        </span>
      ) : null}
    </div>
  );
}

function ThinkingActivity({
  status,
  thinking,
}: {
  status: string;
  thinking: AiPanelThinkingBlock[];
}) {
  if (thinking.length === 0) {
    return null;
  }

  const streaming = status === 'streaming' || status === 'connecting';

  return (
    <div className="space-y-2" data-testid="ai-thinking-activity">
      {thinking.map((block) => (
        <ThinkingCard block={block} key={block.id} streaming={streaming} />
      ))}
    </div>
  );
}

function ThinkingCard({
  block,
  streaming,
}: {
  block: AiPanelThinkingBlock;
  streaming: boolean;
}) {
  const [expanded, setExpanded] = React.useState(streaming);
  const wasStreamingRef = React.useRef(streaming);
  const preview = block.content.replace(/\s+/g, ' ').slice(0, 80);

  React.useEffect(() => {
    if (wasStreamingRef.current && !streaming) {
      setExpanded(false);
    }

    wasStreamingRef.current = streaming;
  }, [streaming]);

  return (
    <div className="rounded-md border bg-muted/20" data-testid="ai-thinking-card">
      <button
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <Brain size={14} />
        <span className="font-medium">{streaming ? '思考中' : '思考'}</span>
        {!expanded && preview ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground/70">
            {preview}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <ChevronDown
          className={cn(
            'shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
          size={14}
        />
      </button>
      {expanded && block.content ? (
        <div className="whitespace-pre-wrap border-t px-3 py-2 text-xs leading-5 text-muted-foreground">
          {block.content}
        </div>
      ) : null}
    </div>
  );
}

function MessageList({
  messages,
}: {
  messages: Array<{ content: string; id: string; role: 'user' | 'assistant' }>;
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          className={cn(
            'whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6',
            message.role === 'user'
              ? 'ml-auto max-w-[88%] bg-primary text-primary-foreground'
              : 'mr-auto max-w-[92%] border bg-muted/20',
          )}
          key={message.id}
        >
          {message.content}
        </div>
      ))}
    </div>
  );
}

function RuntimeActivity({
  permissions,
  sessionId,
  tools,
}: {
  permissions: AiPanelPermissionRequest[];
  sessionId: string | null;
  tools: AiPanelToolCall[];
}) {
  if (tools.length === 0 && permissions.length === 0) {
    return null;
  }

  const permissionByToolId = new Map(
    permissions.map((permission) => [permission.toolCallId, permission]),
  );
  const standalonePermissions = permissions.filter(
    (permission) => !tools.some((tool) => tool.id === permission.toolCallId),
  );
  const groups = buildRuntimeToolGroups(tools);

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <RuntimeActivityGroup
          group={group}
          key={group.kind}
          permissionByToolId={permissionByToolId}
          sessionId={sessionId}
        />
      ))}
      {standalonePermissions.map((permission) => (
        <PermissionCard
          key={permission.requestId}
          permission={permission}
          sessionId={sessionId}
        />
      ))}
    </div>
  );
}

type RuntimeToolGroupKind = 'exploration' | 'web' | 'edit' | 'other';

interface RuntimeToolGroup {
  kind: RuntimeToolGroupKind;
  runningLabel: string;
  completedLabel: string;
  tools: AiPanelToolCall[];
}

const runtimeToolGroupOrder: RuntimeToolGroupKind[] = [
  'exploration',
  'web',
  'edit',
  'other',
];

function RuntimeActivityGroup({
  group,
  permissionByToolId,
  sessionId,
}: {
  group: RuntimeToolGroup;
  permissionByToolId: Map<string, AiPanelPermissionRequest>;
  sessionId: string | null;
}) {
  const hasRunningTool = group.tools.some((tool) => tool.status === 'running');
  const [expanded, setExpanded] = React.useState(true);
  const title = hasRunningTool ? group.runningLabel : group.completedLabel;

  return (
    <div
      className="overflow-hidden rounded-md border bg-background"
      data-testid={`ai-tool-group-${group.kind}`}
    >
      <button
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-2 border-b bg-muted/30 px-3 py-2 text-left"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        {renderRuntimeGroupIcon(group.kind)}
        <span className="text-sm font-medium">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {formatRuntimeGroupSummary(group)}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
          size={14}
        />
      </button>
      {expanded ? (
        <div className="divide-y">
          {group.tools.map((tool) => (
            <RuntimeToolItem
              groupKind={group.kind}
              key={tool.id}
              permission={permissionByToolId.get(tool.id) ?? null}
              sessionId={sessionId}
              tool={tool}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeToolItem({
  groupKind,
  permission,
  sessionId,
  tool,
}: {
  groupKind: RuntimeToolGroupKind;
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  if (groupKind === 'edit') {
    return (
      <EditToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  if (groupKind === 'web') {
    return (
      <WebToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  return (
    <BasicToolActivity
      permission={permission}
      sessionId={sessionId}
      tool={tool}
    />
  );
}

function BasicToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const meta = getRuntimeToolMeta(tool);

  return (
    <div className="px-3 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {tool.name.toLowerCase().includes('bash') ? (
              <Terminal className="shrink-0 text-muted-foreground" size={14} />
            ) : (
              <Wrench className="shrink-0 text-muted-foreground" size={14} />
            )}
            <span className="truncate text-sm font-medium">{tool.name}</span>
          </div>
          {meta.subtitle ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {meta.subtitle}
            </div>
          ) : null}
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>
      <ToolDetailPreview
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    </div>
  );
}

function WebToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const query = getStringRecordValue(tool.input, 'query');
  const url = getStringRecordValue(tool.input, 'url');
  const resultCount = countWebResults(tool.output);
  const subtitle = query || formatHostname(url) || getRuntimeToolMeta(tool).subtitle;

  return (
    <div className="px-3 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Globe className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">{tool.name}</span>
          </div>
          {subtitle ? (
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {subtitle}
              {resultCount > 0 ? ` · ${resultCount} result${resultCount === 1 ? '' : 's'}` : ''}
            </div>
          ) : null}
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>
      <ToolDetailPreview
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    </div>
  );
}

function EditToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const diff = extractDiffText(tool.output) ?? extractDiffText(tool.input);
  const stats = calculateToolDiffStats(tool, diff);
  const filePath = getToolFilePath(tool);
  const displayPath = filePath ? compactWorkspacePath(filePath) : tool.name;

  return (
    <div className="px-3 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Pencil className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">{tool.name}</span>
            <span className="truncate text-sm text-muted-foreground">
              {displayPath}
            </span>
          </div>
          {stats ? (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="font-medium text-emerald-700">
                +{stats.added}
              </span>
              <span className="font-medium text-red-700">
                -{stats.removed}
              </span>
            </div>
          ) : null}
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>
      <ToolDetailPreview
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    </div>
  );
}

function ToolDetailPreview({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const diff = extractDiffText(tool.output) ?? extractDiffText(tool.input);
  const hasOutput = Boolean(tool.output && !diff);

  if (!diff && !tool.partialJson && !hasOutput && !permission) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {diff ? <DiffPreview diff={diff} /> : null}
      {tool.partialJson ? (
        <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 text-xs leading-5 text-muted-foreground">
          {tool.partialJson}
        </pre>
      ) : null}
      {hasOutput && tool.output ? (
        <JsonPreview label="Output" value={tool.output} />
      ) : null}
      {permission ? (
        <PermissionCard permission={permission} sessionId={sessionId} />
      ) : null}
    </div>
  );
}

function buildRuntimeToolGroups(tools: AiPanelToolCall[]) {
  const byKind = new Map<RuntimeToolGroupKind, AiPanelToolCall[]>();

  for (const tool of tools) {
    const kind = getRuntimeToolGroupKind(tool);
    byKind.set(kind, [...(byKind.get(kind) ?? []), tool]);
  }

  return runtimeToolGroupOrder.flatMap((kind) => {
    const groupTools = byKind.get(kind) ?? [];

    if (groupTools.length === 0) {
      return [];
    }

    return [
      {
        ...getRuntimeGroupLabels(kind),
        kind,
        tools: groupTools,
      },
    ];
  });
}

function getRuntimeToolGroupKind(tool: AiPanelToolCall): RuntimeToolGroupKind {
  const name = normalizeToolName(tool.name);

  if (
    [
      'read',
      'grep',
      'glob',
      'ls',
      'list',
      'find',
      'search',
    ].includes(name)
  ) {
    return 'exploration';
  }

  if (name.includes('websearch') || name.includes('webfetch')) {
    return 'web';
  }

  if (
    ['edit', 'write', 'multiedit', 'notebookedit'].includes(name) ||
    Boolean(extractDiffText(tool.input)) ||
    Boolean(extractDiffText(tool.output))
  ) {
    return 'edit';
  }

  return 'other';
}

function getRuntimeGroupLabels(kind: RuntimeToolGroupKind) {
  switch (kind) {
    case 'exploration':
      return { completedLabel: '已探索', runningLabel: '正在探索' };
    case 'web':
      return { completedLabel: '已联网', runningLabel: '正在联网' };
    case 'edit':
      return { completedLabel: '已编辑', runningLabel: '正在编辑' };
    case 'other':
      return { completedLabel: '已调用工具', runningLabel: '正在调用工具' };
  }
}

function renderRuntimeGroupIcon(kind: RuntimeToolGroupKind) {
  const className = 'shrink-0 text-muted-foreground';
  const size = 15;

  switch (kind) {
    case 'exploration':
      return <Search className={className} size={size} />;
    case 'web':
      return <Globe className={className} size={size} />;
    case 'edit':
      return <Pencil className={className} size={size} />;
    case 'other':
      return <Wrench className={className} size={size} />;
  }
}

function formatRuntimeGroupSummary(group: RuntimeToolGroup) {
  const runningCount = group.tools.filter((tool) => tool.status === 'running').length;

  if (runningCount > 0) {
    return `${runningCount}/${group.tools.length} running`;
  }

  return `${group.tools.length} item${group.tools.length === 1 ? '' : 's'}`;
}

function getRuntimeToolMeta(tool: AiPanelToolCall) {
  const name = normalizeToolName(tool.name);

  if (name === 'bash') {
    return {
      subtitle: getStringRecordValue(tool.input, 'command'),
    };
  }

  if (name === 'read') {
    return {
      subtitle: compactWorkspacePath(getToolFilePath(tool) ?? ''),
    };
  }

  if (name === 'grep') {
    return {
      subtitle: getStringRecordValue(tool.input, 'pattern'),
    };
  }

  if (name === 'glob') {
    return {
      subtitle: getStringRecordValue(tool.input, 'pattern'),
    };
  }

  return {
    subtitle:
      compactWorkspacePath(getToolFilePath(tool) ?? '') ||
      getStringRecordValue(tool.input, 'description') ||
      getStringRecordValue(tool.input, 'query') ||
      getStringRecordValue(tool.input, 'url'),
  };
}

function normalizeToolName(name: string) {
  return name.replace(/^tool-/i, '').replace(/\s.+$/, '').toLowerCase();
}

function getToolFilePath(tool: AiPanelToolCall) {
  return (
    getStringRecordValue(tool.input, 'file_path') ||
    getStringRecordValue(tool.input, 'filePath') ||
    getStringRecordValue(tool.input, 'path') ||
    getStringRecordValue(tool.output, 'file_path') ||
    getStringRecordValue(tool.output, 'filePath') ||
    getStringRecordValue(tool.output, 'path')
  );
}

function compactWorkspacePath(path: string) {
  if (!path) {
    return '';
  }

  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (normalized.startsWith('/') && segments.length <= 2) {
    return segments.at(-1) ?? normalized;
  }

  if (segments.length <= 2) {
    return normalized;
  }

  const rootIndex = segments.findIndex((segment) =>
    ['app', 'components', 'docs', 'packages', 'src', 'src-tauri'].includes(segment),
  );

  if (rootIndex >= 0) {
    return segments.slice(rootIndex).join('/');
  }

  return segments.slice(-1).join('/');
}

function getStringRecordValue(
  value: Record<string, unknown> | undefined,
  key: string,
) {
  const entry = value?.[key];

  return typeof entry === 'string' ? entry : '';
}

function formatHostname(url: string) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function countWebResults(output: Record<string, unknown> | undefined) {
  const results = output?.results;

  if (!Array.isArray(results)) {
    return 0;
  }

  return results.reduce((count, result) => {
    if (!result || typeof result !== 'object') {
      return count;
    }

    const content = (result as Record<string, unknown>).content;

    if (Array.isArray(content)) {
      return count + content.filter((item) => item && typeof item === 'object').length;
    }

    return count + 1;
  }, 0);
}

function calculateToolDiffStats(tool: AiPanelToolCall, diff: string | null) {
  if (diff) {
    return calculateUnifiedDiffStats(diff);
  }

  const oldString = getStringRecordValue(tool.input, 'old_string');
  const newString = getStringRecordValue(tool.input, 'new_string');

  if (!oldString && !newString) {
    return null;
  }

  return {
    added: newString ? newString.split('\n').length : 0,
    removed: oldString ? oldString.split('\n').length : 0,
  };
}

function calculateUnifiedDiffStats(diff: string) {
  let added = 0;
  let removed = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      added += 1;
    } else if (line.startsWith('-')) {
      removed += 1;
    }
  }

  return { added, removed };
}

interface ParsedUnifiedDiffLine {
  content: string;
  type: 'added' | 'context' | 'hunk' | 'removed';
}

interface ParsedUnifiedDiff {
  displayPath: string | null;
  lines: ParsedUnifiedDiffLine[];
}

const collapsedDiffLineLimit = 12;

function DiffPreview({ diff }: { diff: string }) {
  const parsedDiff = React.useMemo(() => parseUnifiedDiff(diff), [diff]);
  const canCollapse = parsedDiff.lines.length > collapsedDiffLineLimit;
  const [expanded, setExpanded] = React.useState(!canCollapse);
  const visibleLines =
    !canCollapse || expanded
      ? parsedDiff.lines
      : parsedDiff.lines.slice(0, collapsedDiffLineLimit);

  if (parsedDiff.lines.length === 0) {
    return (
      <div className="overflow-hidden rounded-md border bg-background">
        <div className="border-b bg-muted/50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Diff
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words px-2 py-2 font-mono text-xs leading-5">
          {diff}
        </pre>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Diff</span>
        {parsedDiff.displayPath ? (
          <span className="min-w-0 truncate normal-case tracking-normal">
            {parsedDiff.displayPath}
          </span>
        ) : null}
      </div>
      <div className="max-h-56 overflow-auto font-mono text-xs leading-5">
        {visibleLines.map((line, index) => (
          <DiffPreviewLine key={`${line.type}-${index}`} line={line} />
        ))}
      </div>
      {canCollapse ? (
        <button
          className="w-full border-t px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted/50"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? '收起 diff'
            : `展开完整 diff（还有 ${parsedDiff.lines.length - visibleLines.length} 行）`}
        </button>
      ) : null}
    </div>
  );
}

function DiffPreviewLine({ line }: { line: ParsedUnifiedDiffLine }) {
  const prefix =
    line.type === 'added'
      ? '+'
      : line.type === 'removed'
        ? '-'
        : line.type === 'hunk'
          ? '@'
          : ' ';
  const testId =
    line.type === 'added'
      ? 'ai-diff-line-added'
      : line.type === 'removed'
        ? 'ai-diff-line-removed'
        : line.type === 'hunk'
          ? 'ai-diff-line-hunk'
          : 'ai-diff-line-context';

  return (
    <div
      className={cn(
        'grid grid-cols-[20px_minmax(0,1fr)] border-l-2 px-2 py-0.5',
        line.type === 'added' &&
          'border-emerald-500/50 bg-emerald-50 text-emerald-900',
        line.type === 'removed' &&
          'border-red-500/50 bg-red-50 text-red-900',
        line.type === 'hunk' &&
          'border-sky-500/30 bg-sky-50 text-sky-800',
        line.type === 'context' &&
          'border-transparent text-muted-foreground',
      )}
      data-testid={testId}
    >
      <span className="select-none text-muted-foreground">{prefix}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">
        {line.content || ' '}
      </span>
    </div>
  );
}

function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  let oldPath = '';
  let newPath = '';
  const lines: ParsedUnifiedDiffLine[] = [];

  for (const rawLine of diff.split('\n')) {
    if (rawLine.startsWith('--- ')) {
      oldPath = rawLine.slice(4).trim();
      continue;
    }

    if (rawLine.startsWith('+++ ')) {
      newPath = rawLine.slice(4).trim();
      continue;
    }

    if (rawLine.startsWith('@@')) {
      lines.push({ content: rawLine, type: 'hunk' });
      continue;
    }

    if (rawLine.startsWith('+')) {
      lines.push({ content: rawLine.slice(1), type: 'added' });
      continue;
    }

    if (rawLine.startsWith('-')) {
      lines.push({ content: rawLine.slice(1), type: 'removed' });
      continue;
    }

    if (rawLine.startsWith(' ')) {
      lines.push({ content: rawLine.slice(1), type: 'context' });
      continue;
    }

    if (rawLine.trim()) {
      lines.push({ content: rawLine, type: 'context' });
    }
  }

  return {
    displayPath: compactDiffPath(newPath || oldPath),
    lines,
  };
}

function compactDiffPath(path: string) {
  const normalized = path.replace(/^[ab]\//, '').trim();

  return normalized ? compactWorkspacePath(normalized) : null;
}

function PermissionCard({
  permission,
  sessionId,
}: {
  permission: AiPanelPermissionRequest;
  sessionId: string | null;
}) {
  const disabled = !sessionId;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        <ShieldAlert className="mt-0.5 text-amber-700" size={16} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-amber-900">
            {permission.toolName} 需要确认
          </div>
          <div className="mt-1 text-xs leading-5 text-amber-800">
            {permission.reason}
          </div>
          <JsonPreview className="mt-2 bg-background/70" value={permission.toolInput} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              aria-label={`拒绝 ${permission.toolName}`}
              disabled={disabled}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                if (!sessionId) {
                  return;
                }

                void respondAiPermission({
                  behavior: 'deny',
                  denyMessage: 'User denied permission',
                  interrupt: true,
                  requestId: permission.requestId,
                  sessionId,
                });
              }}
            >
              拒绝
            </Button>
            <Button
              aria-label={`允许 ${permission.toolName}`}
              disabled={disabled}
              size="sm"
              type="button"
              onClick={() => {
                if (!sessionId) {
                  return;
                }

                void respondAiPermission({
                  behavior: 'allow',
                  requestId: permission.requestId,
                  sessionId,
                  updatedInput: permission.toolInput,
                });
              }}
            >
              允许
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolStatusBadge({ status }: { status: AiPanelToolCall['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs',
        status === 'running' && 'bg-amber-50 text-amber-700',
        status === 'success' && 'bg-emerald-50 text-emerald-700',
        status === 'error' && 'bg-destructive/10 text-destructive',
        status === 'denied' && 'bg-muted text-muted-foreground',
        status === 'permissionPrompt' && 'bg-amber-100 text-amber-800',
      )}
    >
      {status === 'running' ? <LoaderCircle className="animate-spin" size={12} /> : null}
      {formatToolStatus(status)}
    </span>
  );
}

function JsonPreview({
  className,
  label = 'Input',
  value,
}: {
  className?: string;
  label?: string;
  value: Record<string, unknown>;
}) {
  return (
    <div className={cn('rounded-md bg-muted p-2', className)}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function ModelList({
  models,
  query,
  selectedModelId,
  onSelect,
}: {
  models: AiDetectedModel[];
  query: string;
  selectedModelId: string | null;
  onSelect: (model: AiDetectedModel) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredModels = models.filter((model) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      model.label.toLowerCase().includes(normalizedQuery) ||
      model.id.toLowerCase().includes(normalizedQuery) ||
      model.providerLabel.toLowerCase().includes(normalizedQuery)
    );
  });
  const providerGroups = filteredModels.reduce<
    Array<{ providerId: string; providerLabel: string; models: AiDetectedModel[] }>
  >((groups, model) => {
    const group = groups.find((item) => item.providerId === model.providerId);

    if (group) {
      group.models.push(model);
    } else {
      groups.push({
        models: [model],
        providerId: model.providerId,
        providerLabel: model.providerLabel,
      });
    }

    return groups;
  }, []);

  if (models.length === 0) {
    return (
      <div className="p-4 text-sm leading-6 text-muted-foreground">
        当前本地助手没有返回可选择模型。
      </div>
    );
  }

  return (
    <div className="max-h-[360px] overflow-auto p-2">
      {providerGroups.map((group) => (
        <div className="grid gap-1 border-b py-2 last:border-b-0" key={group.providerId}>
          <div className="px-2 text-xs font-medium text-muted-foreground">
            {group.providerLabel} Models
          </div>
          {group.models.map((model) => (
            <button
              className="grid h-9 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md px-2 text-left text-sm hover:bg-muted"
              key={model.id}
              type="button"
              onClick={() => onSelect(model)}
            >
              <span className="truncate">{model.label}</span>
              {selectedModelId === model.id ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ))}
      {providerGroups.length === 0 ? (
        <div className="p-2 text-sm text-muted-foreground">没有匹配模型。</div>
      ) : null}
    </div>
  );
}

function getPreferredModelId({
  models,
  profile,
  settings,
}: {
  models: AiDetectedModel[];
  profile:
    | {
        modelId: string;
        providerId: string;
      }
    | null
    | undefined;
  settings: AppSettings;
}) {
  const preferredId =
    profile?.providerId === 'codex'
      ? settings.ai.lastSelectedCodexModelId
      : profile?.providerId === 'claude'
        ? settings.ai.lastSelectedModelId
        : profile?.modelId;

  const visibleModels = models.filter(
    (model) => !settings.ai.hiddenModelIds.includes(model.id),
  );

  if (
    preferredId &&
    !settings.ai.hiddenModelIds.includes(preferredId) &&
    (visibleModels.length === 0 ||
      visibleModels.some((model) => model.id === preferredId))
  ) {
    return preferredId;
  }

  return visibleModels[0]?.id ?? profile?.modelId ?? null;
}

function buildSessionStartOptions({
  modelId,
  profile,
  settings,
}: {
  modelId: string | null;
  profile:
    | {
        providerId: string;
      }
    | null
    | undefined;
  settings: AppSettings;
}) {
  return {
    agentMode: settings.ai.defaultAgentMode,
    codexThinking:
      profile?.providerId === 'codex'
        ? settings.ai.lastSelectedCodexThinking
        : undefined,
    extendedThinking: settings.ai.extendedThinkingEnabled,
    modelId: modelId ?? undefined,
  };
}

function isModelFirstProvider(providerId: string | undefined) {
  return providerId === 'codex' || providerId === 'claude';
}

function buildModelOptions(
  models: AiDetectedModel[],
  profiles: Array<{
    detection: { status: string };
    id: string;
    isTestRuntime: boolean;
    label: string;
    modelId: string;
    modelLabel: string;
    providerId: string;
    providerLabel: string;
  }>,
) {
  const providersWithModels = new Set(models.map((model) => model.providerId));
  const fallbackModels = profiles
    .filter(
      (profile) =>
        !profile.isTestRuntime &&
        profile.detection.status === 'available' &&
        !providersWithModels.has(profile.providerId),
    )
    .map<AiDetectedModel>((profile) => ({
      available: true,
      id: profile.modelId || profile.id,
      label: profile.modelLabel || profile.label,
      profileId: profile.id,
      providerId: profile.providerId,
      providerLabel: profile.providerLabel,
    }));

  return [...models, ...fallbackModels];
}

function flattenWorkspaceDocuments(nodes: WorkspaceNode[]) {
  const documents: WorkspaceNode[] = [];
  const visit = (node: WorkspaceNode) => {
    if (node.kind === 'document') {
      documents.push(node);
    }

    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return documents.sort((left, right) =>
    (left.title ?? left.name).localeCompare(right.title ?? right.name),
  );
}

function buildMentionInventory({
  agents,
  commands,
  documents,
  mcpServers,
  skills,
}: {
  agents: AiCustomAgentItem[];
  commands: AiCommandItem[];
  documents: WorkspaceNode[];
  mcpServers: AiMcpServerItem[];
  skills: AiSkillItem[];
}): AiMentionReference[] {
  return [
    ...documents.map(fileMentionReference),
    ...skills.map(skillMentionReference),
    ...commands.map(commandMentionReference),
    ...agents.map(agentMentionReference),
    ...mcpServers.flatMap(mcpToolMentionReferences),
  ];
}

function buildMentionOptions({
  inventory,
  query,
  selectedReferences,
}: {
  inventory: AiMentionReference[];
  query: string | null;
  selectedReferences: AiMentionReference[];
}) {
  if (query === null) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  const selectedPaths = new Set(
    selectedReferences.map((reference) => reference.id),
  );

  return inventory
    .filter((reference) => !selectedPaths.has(reference.id))
    .filter((reference) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        reference.label.toLowerCase().includes(normalizedQuery) ||
        reference.detail.toLowerCase().includes(normalizedQuery) ||
        reference.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 8);
}

function fileMentionReference(node: WorkspaceNode): AiMentionReference {
  return {
    detail: node.relativePath,
    id: `file:${node.relativePath}`,
    kind: 'file',
    label: node.title ?? node.name,
    node,
  };
}

function skillMentionReference(skill: AiSkillItem): AiMentionReference {
  return {
    detail: `${formatSourceLabel(skill.source)} · ${skill.description}`,
    id: `skill:${skill.source}:${skill.name}`,
    kind: 'skill',
    label: skill.name,
    reference: {
      contentHash: createStableContentHash(skill.content),
      markdown: [
        `# Skill: ${skill.name}`,
        skill.description,
        '',
        skill.content,
      ].join('\n'),
      modifiedAt: null,
      path: skill.path,
      relativePath: `skill:${skill.name}`,
      source: 'skill',
      title: skill.name,
    },
  };
}

function commandMentionReference(command: AiCommandItem): AiMentionReference {
  return {
    detail: `${formatSourceLabel(command.source)} · ${command.description}`,
    id: `command:${command.source}:${command.name}`,
    kind: 'command',
    label: `/${command.name}`,
    reference: {
      contentHash: createStableContentHash(command.content),
      markdown: [
        `# Slash Command: /${command.name}`,
        command.description,
        command.argumentHint ? `Arguments: ${command.argumentHint}` : '',
        '',
        command.content,
      ]
        .filter(Boolean)
        .join('\n'),
      modifiedAt: null,
      path: command.path,
      relativePath: `command:${command.name}`,
      source: 'command',
      title: `/${command.name}`,
    },
  };
}

function agentMentionReference(agent: AiCustomAgentItem): AiMentionReference {
  return {
    detail: `${formatSourceLabel(agent.source)} · ${agent.description}`,
    id: `agent:${agent.source}:${agent.name}`,
    kind: 'agent',
    label: agent.name,
    reference: {
      contentHash: createStableContentHash(agent.prompt),
      markdown: [
        `# Agent: ${agent.name}`,
        agent.description,
        agent.model ? `Model: ${agent.model}` : '',
        agent.tools.length > 0 ? `Tools: ${agent.tools.join(', ')}` : '',
        agent.disallowedTools.length > 0
          ? `Disallowed tools: ${agent.disallowedTools.join(', ')}`
          : '',
        '',
        agent.prompt,
      ]
        .filter(Boolean)
        .join('\n'),
      modifiedAt: null,
      path: agent.path,
      relativePath: `agent:${agent.name}`,
      source: 'agent',
      title: agent.name,
    },
  };
}

function mcpToolMentionReferences(server: AiMcpServerItem): AiMentionReference[] {
  return (server.tools ?? []).map((tool) => ({
    detail: `${server.name} · ${tool.description ?? server.status}`,
    id: `mcp-tool:${server.provider}:${server.name}:${tool.name}`,
    kind: 'mcp-tool' as const,
    label: tool.name,
    reference: {
      contentHash: createStableContentHash(
        `${server.provider}:${server.name}:${tool.name}:${tool.description ?? ''}`,
      ),
      markdown: [
        `# MCP Tool: ${tool.name}`,
        tool.description ?? '',
        `Server: ${server.name}`,
        `Provider: ${server.provider}`,
        `Status: ${server.status}`,
      ]
        .filter(Boolean)
        .join('\n'),
      modifiedAt: null,
      path: server.url ?? server.command ?? server.name,
      relativePath: `mcp-tool:${server.name}:${tool.name}`,
      source: 'mcp-tool',
      title: tool.name,
    },
  }));
}

function getActiveMentionQuery(value: string) {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/u);

  return match ? match[1] : null;
}

function removeActiveMentionToken(value: string) {
  return value.replace(/(?:^|\s)@[^\s@]*$/u, (match) =>
    match.startsWith(' ') ? ' ' : '',
  );
}

function stripMentionTokens(value: string) {
  return value.replace(/@\[[^\]]+\]/gu, '').trim();
}

function buildCurrentDocumentReference(
  currentDocument: WorkspaceNode,
  documentPanelData: DocumentPanelData,
): AiContextReference {
  return {
    contentHash: createStableContentHash(documentPanelData.markdown),
    markdown: documentPanelData.markdown,
    modifiedAt: null,
    path: currentDocument.absolutePath,
    relativePath: currentDocument.relativePath,
    source: 'current-document',
    title:
      documentPanelData.metadata.title ||
      currentDocument.title ||
      currentDocument.name,
  };
}

function buildPendingMentionReference(reference: AiMentionReference): AiContextReference {
  if (reference.reference) {
    return reference.reference;
  }

  const node = reference.node;
  if (!node) {
    return {
      contentHash: '',
      markdown: '',
      modifiedAt: null,
      path: reference.id,
      relativePath: reference.id,
      source: reference.kind,
      title: reference.label,
    };
  }

  return {
    contentHash: '',
    markdown: '',
    modifiedAt: null,
    path: node.absolutePath,
    relativePath: node.relativePath,
    source: 'file',
    title: reference.label,
  };
}

async function resolveMentionReferences({
  references,
  workspaceRootPath,
}: {
  references: AiMentionReference[];
  workspaceRootPath: string;
}) {
  const resolvedReferences: AiContextReference[] = [];

  for (const reference of references) {
    if (reference.reference) {
      resolvedReferences.push(reference.reference);
      continue;
    }

    if (!reference.node) {
      continue;
    }

    const content = await readMarkdownDocument(
      workspaceRootPath,
      reference.node.relativePath,
    );

    resolvedReferences.push({
      contentHash: createStableContentHash(content.content),
      markdown: content.content,
      modifiedAt: content.modifiedAt,
      path: reference.node.absolutePath,
      relativePath: reference.node.relativePath,
      source: 'file',
      title: reference.label,
    });
  }

  return resolvedReferences;
}

function mentionReferenceRelativePath(reference: AiMentionReference) {
  return (
    reference.reference?.relativePath ??
    reference.node?.relativePath ??
    reference.id
  );
}

function formatMentionKind(kind: AiMentionKind) {
  switch (kind) {
    case 'agent':
      return 'Agent';
    case 'command':
      return 'Command';
    case 'file':
      return 'File';
    case 'mcp-tool':
      return 'MCP';
    case 'skill':
      return 'Skill';
  }
}

function formatSourceLabel(source: string) {
  switch (source) {
    case 'plugin':
      return 'Plugin';
    case 'project':
      return 'Project';
    case 'user':
      return 'User';
    default:
      return source;
  }
}

function formatJson(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractDiffText(value: Record<string, unknown> | undefined) {
  if (!value) {
    return null;
  }

  for (const key of ['diff', 'patch', 'changes']) {
    const entry = value[key];

    if (typeof entry === 'string' && entry.trim()) {
      return entry;
    }

    if (Array.isArray(entry) && entry.length > 0) {
      return entry
        .map((item) =>
          typeof item === 'string' ? item : JSON.stringify(item, null, 2),
        )
        .join('\n');
    }

    if (entry && typeof entry === 'object') {
      return JSON.stringify(entry, null, 2);
    }
  }

  return null;
}

function formatRunState(state: string) {
  switch (state) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'stopped':
      return 'Stopped';
    default:
      return state;
  }
}

function formatToolStatus(status: AiPanelToolCall['status']) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'success':
      return 'Done';
    case 'error':
      return 'Error';
    case 'denied':
      return 'Denied';
    case 'permissionPrompt':
      return 'Waiting';
  }
}

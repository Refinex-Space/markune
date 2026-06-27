'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  Download,
  FileCode2,
  FileText,
  Globe,
  History,
  ListChecks,
  LoaderCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Square,
  SkipForward,
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
  saveMarkdownDocument,
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
  AiContextImage,
  AiIntent,
  AiPanelMessage,
  AiPanelPermissionRequest,
  AiSelectionContext,
  AiPanelThinkingBlock,
  AiPanelToolCall,
  AiPanelUsage,
} from './ai-types';

interface AiPanelContentProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  selectedTextContext?: AiSelectionContext | null;
  settingsVersion?: number;
  workspaceRootPath: string | null;
  onClearSelectedTextContext?: () => void;
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  onOpenSettings?: () => void;
}

interface AiAppliedMarkdownDocument {
  content: string;
  modifiedAt: number | null;
  path: string;
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

interface AiComposerContextAttachment {
  id: string;
  reference: AiContextReference;
  size: number;
}

interface AiComposerImageAttachment {
  id: string;
  image: AiContextImage;
  previewUrl: string;
}

export function AiPanelContent({
  currentDocument,
  documentPanelData,
  selectedTextContext = null,
  settingsVersion = 0,
  workspaceRootPath,
  onClearSelectedTextContext,
  onMarkdownDocumentApplied,
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
  const [contextAttachments, setContextAttachments] = React.useState<
    AiComposerContextAttachment[]
  >([]);
  const [imageAttachments, setImageAttachments] = React.useState<
    AiComposerImageAttachment[]
  >([]);
  const [mentionInventory, setMentionInventory] = React.useState<
    AiMentionReference[]
  >([]);
  const [conversationReferences, setConversationReferences] = React.useState<
    AiContextReference[]
  >([]);
  const [conversationImages, setConversationImages] = React.useState<
    AiContextImage[]
  >([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionLoading, setMentionLoading] = React.useState(false);
  const [sessionNotice, setSessionNotice] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
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
  const activeSelectionContext = selectedTextContext;

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
        conversationImages,
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
    conversationImages,
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

      const resolvedReferences = await resolveMentionReferences({
        references: selectedReferences,
        workspaceRootPath,
      });
      const contextReferences = mergeAiContextReferences([
        ...conversationReferences,
        ...resolvedReferences,
        ...contextAttachments.map((attachment) => attachment.reference),
      ]);
      const contextImages = mergeAiContextImages([
        ...conversationImages,
        ...imageAttachments.map((attachment) => attachment.image),
      ]);
      const context = buildAiContextPack({
        currentDocument,
        documentPanelData,
        images: contextImages,
        intent,
        references: contextReferences,
        selection: activeSelectionContext,
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
        setConversationImages(context.images ?? []);

        dispatch({
          content: trimmed,
          id: userMessageId,
          images: context.images,
          references: context.references,
          selection: context.selection ?? null,
          type: 'userMessageSubmitted',
        });

        await sendAiPrompt({
          context,
          prompt: stripMentionTokens(trimmed),
          sessionId: session.sessionId,
        });
        setPrompt('');
        setContextAttachments([]);
        setImageAttachments([]);
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
      contextAttachments,
      imageAttachments,
      conversationReferences,
      conversationImages,
      activeSelectionContext,
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

  const addTextContextAttachment = React.useCallback(
    (
      text: string,
      options: {
        source: 'attached-file' | 'pasted-text';
        title: string;
      },
    ) => {
      const markdown = text.trim();

      if (!workspaceRootPath || !markdown) {
        return;
      }

      const reference = buildComposerContextReference({
        markdown,
        source: options.source,
        title: options.title,
        workspaceRootPath,
      });

      setContextAttachments((current) => {
        if (
          current.some(
            (attachment) =>
              attachment.reference.contentHash === reference.contentHash,
          )
        ) {
          return current;
        }

        return [
          ...current,
          {
            id: reference.relativePath,
            reference,
            size: markdown.length,
          },
        ];
      });
    },
    [workspaceRootPath],
  );

  const handleAttachFiles = React.useCallback(
    async (files: Iterable<File>) => {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          try {
            const attachment = await buildImageContextAttachment(file);

            setImageAttachments((current) =>
              current.some(
                (item) =>
                  item.image.contentHash === attachment.image.contentHash,
              )
                ? current
                : [...current, attachment],
            );
          } catch (error) {
            dispatch({
              message:
                error instanceof Error ? error.message : '无法读取图片附件',
              type: 'errorRaised',
            });
          }
          continue;
        }

        if (!isTextContextFile(file)) {
          continue;
        }

        try {
          addTextContextAttachment(await file.text(), {
            source: 'attached-file',
            title: file.name || 'Attached file',
          });
        } catch (error) {
          dispatch({
            message:
              error instanceof Error ? error.message : '无法读取上下文文件',
            type: 'errorRaised',
          });
        }
      }
    },
    [addTextContextAttachment],
  );

  const handleComposerPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = event.clipboardData.getData('text/plain');

      if (!shouldCapturePastedTextContext(text)) {
        return;
      }

      event.preventDefault();
      addTextContextAttachment(text, {
        source: 'pasted-text',
        title: 'Pasted text',
      });
    },
    [addTextContextAttachment],
  );

  const handleComposerDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (event.dataTransfer.files.length === 0) {
        return;
      }

      event.preventDefault();
      void handleAttachFiles(Array.from(event.dataTransfer.files));
    },
    [handleAttachFiles],
  );

  const referenceCount = selectedReferences.length + contextAttachments.length;
  const imageCount = imageAttachments.length + conversationImages.length;

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
            setConversationImages([]);
            setContextAttachments([]);
            setImageAttachments([]);
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
                    setConversationImages(conversation.images ?? []);
                    setContextAttachments([]);
                    setImageAttachments([]);
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
          selectionContext={activeSelectionContext}
          onRemoveReference={(relativePath) => {
            setSelectedReferences((current) =>
              current.filter(
                (item) => mentionReferenceRelativePath(item) !== relativePath,
              ),
            );
            setContextAttachments((current) =>
              current.filter(
                (attachment) =>
                  attachment.reference.relativePath !== relativePath,
              ),
            );
            setConversationReferences((current) =>
              current.filter((item) => item.relativePath !== relativePath),
            );
          }}
          onRemoveSelection={() => {
            onClearSelectedTextContext?.();
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
              onMarkdownDocumentApplied={onMarkdownDocumentApplied}
              permissions={state.permissions}
              sessionId={state.session?.sessionId ?? null}
              tools={state.tools}
              workspaceRootPath={workspaceRootPath}
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
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
            }
          }}
          onDrop={handleComposerDrop}
        >
          <ComposerContextAttachments
            attachments={contextAttachments}
            onRemove={(relativePath) => {
              setContextAttachments((current) =>
                current.filter(
                  (attachment) =>
                    attachment.reference.relativePath !== relativePath,
                ),
              );
            }}
          />
          <ComposerImageAttachments
            attachments={imageAttachments}
            onRemove={(id) => {
              setImageAttachments((current) =>
                current.filter((attachment) => attachment.id !== id),
              );
            }}
          />
          <textarea
            className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!workspaceRootPath || !runtimeReady}
            placeholder="向 AI 询问当前工作区..."
            value={prompt}
            onChange={(event) => handlePromptChange(event.currentTarget.value)}
            onPaste={handleComposerPaste}
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
              {referenceCount > 0 ? (
                <span className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  +{referenceCount} referenced
                </span>
              ) : null}
              {imageCount > 0 ? (
                <span className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {imageCount} image{imageCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                accept="image/*,.md,.markdown,.mdx,.txt,.csv,.json,.yaml,.yml,.toml,.xml,.html,.css,.ts,.tsx,.js,.jsx"
                className="hidden"
                multiple
                type="file"
                onChange={(event) => {
                  const { files } = event.currentTarget;

                  if (files) {
                    void handleAttachFiles(Array.from(files));
                  }

                  event.currentTarget.value = '';
                }}
              />
              <Button
                aria-label="添加上下文文件"
                disabled={!workspaceRootPath || !runtimeReady}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={15} />
              </Button>
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
  conversationImages,
  conversationCreatedAt,
  currentDocument,
  profileMetadata,
  state,
}: {
  activeConversationId: string;
  conversationReferences: AiContextReference[];
  conversationImages: AiContextImage[];
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
    images: conversationImages,
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
  selectionContext,
  references,
  onRemoveReference,
  onRemoveSelection,
}: {
  currentDocumentReference: AiContextReference | null;
  selectionContext: AiSelectionContext | null;
  references: AiContextReference[];
  onRemoveReference: (relativePath: string) => void;
  onRemoveSelection: () => void;
}) {
  if (!currentDocumentReference && !selectionContext && references.length === 0) {
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
      {selectionContext ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
          <Pencil size={12} />
          <span className="truncate">
            Selection
            {selectionContext.documentTitle
              ? ` · ${selectionContext.documentTitle}`
              : ''}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {formatCharacterCount(selectionContext.markdown.length)}
          </span>
          <button
            aria-label="移除选中文本上下文"
            className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
            type="button"
            onClick={onRemoveSelection}
          >
            <X size={12} />
          </button>
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

function ComposerContextAttachments({
  attachments,
  onRemove,
}: {
  attachments: AiComposerContextAttachment[];
  onRemove: (relativePath: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5"
      data-testid="ai-composer-context-attachments"
    >
      {attachments.map((attachment) => (
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
          key={attachment.reference.relativePath}
        >
          <Paperclip size={12} />
          <span className="min-w-0 truncate">
            {attachment.reference.title}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {formatCharacterCount(attachment.size)}
          </span>
          <button
            aria-label={`移除上下文 ${attachment.reference.title}`}
            className="rounded-sm text-muted-foreground hover:text-foreground"
            type="button"
            onClick={() => onRemove(attachment.reference.relativePath)}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

function ComposerImageAttachments({
  attachments,
  onRemove,
}: {
  attachments: AiComposerImageAttachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-2 flex min-w-0 flex-wrap items-center gap-2"
      data-testid="ai-composer-image-attachments"
    >
      {attachments.map((attachment) => (
        <span
          className="group relative inline-flex max-w-[180px] items-center gap-2 rounded-md border bg-muted/30 p-1.5 pr-2 text-xs"
          key={attachment.id}
        >
          <span
            aria-label={attachment.image.filename}
            className="size-9 shrink-0 rounded bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url(${attachment.previewUrl})` }}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {attachment.image.filename}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {attachment.image.mediaType} · {formatFileSize(attachment.image.size)}
            </span>
          </span>
          <button
            aria-label={`移除图片 ${attachment.image.filename}`}
            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
            type="button"
            onClick={() => onRemove(attachment.id)}
          >
            <X size={11} />
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
  messages: AiPanelMessage[];
}) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          className={cn(
            'rounded-md px-3 py-2 text-sm leading-6',
            message.role === 'user'
              ? 'ml-auto max-w-[88%] bg-primary text-primary-foreground'
              : 'mr-auto max-w-[92%] border bg-muted/20',
          )}
          key={message.id}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
          <MessageContextSummary message={message} />
        </div>
      ))}
    </div>
  );
}

function MessageContextSummary({ message }: { message: AiPanelMessage }) {
  if (
    message.role !== 'user' ||
    (!message.selection &&
      (!message.references || message.references.length === 0) &&
      (!message.images || message.images.length === 0))
  ) {
    return null;
  }

  return (
    <div
      className="mt-2 flex min-w-0 flex-wrap gap-1.5 border-t border-primary-foreground/20 pt-2"
      data-testid="ai-message-context-summary"
    >
      {message.selection ? (
        <MessageContextChip icon={<Pencil size={11} />}>
          Selection
          {message.selection.documentTitle
            ? ` · ${message.selection.documentTitle}`
            : ''}
        </MessageContextChip>
      ) : null}
      {(message.references ?? []).map((reference) => (
        <MessageContextChip
          icon={<FileText size={11} />}
          key={reference.relativePath}
        >
          {reference.title}
        </MessageContextChip>
      ))}
      {(message.images ?? []).map((image) => (
        <MessageContextImageChip image={image} key={image.contentHash} />
      ))}
    </div>
  );
}

function MessageContextChip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px] text-primary-foreground/90">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function MessageContextImageChip({ image }: { image: AiContextImage }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary-foreground/15 px-1.5 py-0.5 text-[11px] text-primary-foreground/90">
      <span
        aria-label={image.filename}
        className="size-4 shrink-0 rounded bg-cover bg-center"
        role="img"
        style={{
          backgroundImage: `url(data:${image.mediaType};base64,${image.base64Data})`,
        }}
      />
      <span className="truncate">{image.filename}</span>
    </span>
  );
}

function RuntimeActivity({
  onMarkdownDocumentApplied,
  permissions,
  sessionId,
  tools,
  workspaceRootPath,
}: {
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  permissions: AiPanelPermissionRequest[];
  sessionId: string | null;
  tools: AiPanelToolCall[];
  workspaceRootPath: string | null;
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
          onMarkdownDocumentApplied={onMarkdownDocumentApplied}
          permissionByToolId={permissionByToolId}
          sessionId={sessionId}
          workspaceRootPath={workspaceRootPath}
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

type RuntimeToolGroupKind =
  | 'exploration'
  | 'planning'
  | 'mcp'
  | 'web'
  | 'edit'
  | 'other';

interface RuntimeToolGroup {
  kind: RuntimeToolGroupKind;
  runningLabel: string;
  completedLabel: string;
  tools: AiPanelToolCall[];
}

const runtimeToolGroupOrder: RuntimeToolGroupKind[] = [
  'exploration',
  'planning',
  'mcp',
  'web',
  'edit',
  'other',
];

function RuntimeActivityGroup({
  group,
  onMarkdownDocumentApplied,
  permissionByToolId,
  sessionId,
  workspaceRootPath,
}: {
  group: RuntimeToolGroup;
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  permissionByToolId: Map<string, AiPanelPermissionRequest>;
  sessionId: string | null;
  workspaceRootPath: string | null;
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
              onMarkdownDocumentApplied={onMarkdownDocumentApplied}
              permission={permissionByToolId.get(tool.id) ?? null}
              sessionId={sessionId}
              tool={tool}
              workspaceRootPath={workspaceRootPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RuntimeToolItem({
  groupKind,
  onMarkdownDocumentApplied,
  permission,
  sessionId,
  tool,
  workspaceRootPath,
}: {
  groupKind: RuntimeToolGroupKind;
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
  workspaceRootPath: string | null;
}) {
  if (groupKind === 'edit') {
    return (
      <EditToolActivity
        onMarkdownDocumentApplied={onMarkdownDocumentApplied}
        permission={permission}
        sessionId={sessionId}
        tool={tool}
        workspaceRootPath={workspaceRootPath}
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

  if (groupKind === 'mcp') {
    return (
      <McpToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  if (groupKind === 'planning') {
    return (
      <PlanningToolActivity
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

function PlanningToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const name = normalizeToolName(tool.name);

  if (name === 'todowrite') {
    return (
      <TodoToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  if (name === 'planwrite') {
    return (
      <PlanToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  if (name.startsWith('task')) {
    return (
      <TaskToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  if (name === 'exitplanmode') {
    return (
      <div className="px-3 py-2" data-testid="ai-planning-tool">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="shrink-0 text-muted-foreground" size={14} />
              <span className="truncate text-sm font-medium">ExitPlanMode</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              计划已确认，准备执行
            </div>
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

  return (
    <BasicToolActivity
      permission={permission}
      sessionId={sessionId}
      tool={tool}
    />
  );
}

function TodoToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const todos = extractToolTodos(tool);
  const completed = todos.filter((todo) => todo.status === 'completed').length;
  const inProgress = todos.filter((todo) => todo.status === 'in_progress').length;
  const meta = getRuntimeToolMeta(tool);

  return (
    <div className="px-3 py-2" data-testid="ai-planning-tool">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecks className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">{tool.name}</span>
            {meta.subtitle ? (
              <span className="truncate text-sm text-muted-foreground">
                {meta.subtitle}
              </span>
            ) : null}
          </div>
          {todos.length > 0 ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {completed}/{todos.length} completed
              {inProgress > 0 ? ` · ${inProgress} in progress` : ''}
            </div>
          ) : null}
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>
      {todos.length > 0 ? (
        <div className="mt-2 space-y-1 rounded-md border bg-muted/20 p-2">
          {todos.map((todo, index) => (
            <TodoRow
              key={`${todo.content}-${index}`}
              running={tool.status === 'running'}
              todo={todo}
            />
          ))}
        </div>
      ) : (
        <ToolDetailPreview
          permission={permission}
          sessionId={sessionId}
          tool={tool}
        />
      )}
      {todos.length > 0 && permission ? (
        <div className="mt-2">
          <PermissionCard permission={permission} sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}

function TodoRow({
  running,
  todo,
}: {
  running: boolean;
  todo: PlanningTodoItem;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs">
      <PlanningStatusIcon running={running} status={todo.status} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate font-medium',
            todo.status === 'completed' && 'text-muted-foreground line-through',
          )}
        >
          {todo.activeForm || todo.content}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {formatPlanningStatus(todo.status)}
        </div>
      </div>
    </div>
  );
}

function PlanToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const plan = extractToolPlan(tool);

  if (!plan) {
    return (
      <BasicToolActivity
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    );
  }

  const steps = plan.steps;
  const completed = steps.filter((step) => step.status === 'completed').length;
  const progress = steps.length > 0 ? `${completed}/${steps.length}` : '';

  return (
    <div className="px-3 py-2" data-testid="ai-planning-tool">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">{tool.name}</span>
            <span className="truncate text-sm text-muted-foreground">
              {plan.title}
              {progress ? ` (${progress})` : ''}
            </span>
          </div>
          {plan.summary ? (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {plan.summary}
            </div>
          ) : null}
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>
      {steps.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-md border bg-muted/20">
          <div className="border-b px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{formatPlanStatus(plan.status)}</span>
              <span>{progress}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-muted-foreground/50 transition-all"
                style={{
                  width: `${Math.round((completed / steps.length) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="divide-y">
            {steps.map((step, index) => (
              <PlanStepRow
                key={`${step.title || step.description}-${index}`}
                running={tool.status === 'running'}
                step={step}
              />
            ))}
          </div>
        </div>
      ) : (
        <ToolDetailPreview
          permission={permission}
          sessionId={sessionId}
          tool={tool}
        />
      )}
      {steps.length > 0 && permission ? (
        <div className="mt-2">
          <PermissionCard permission={permission} sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}

function PlanStepRow({
  running,
  step,
}: {
  running: boolean;
  step: PlanningPlanStep;
}) {
  return (
    <div className="px-2 py-2">
      <div className="flex min-w-0 items-start gap-2">
        <PlanningStatusIcon running={running} status={step.status} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'text-xs font-medium',
              step.status === 'completed' && 'text-muted-foreground line-through',
              step.status === 'skipped' && 'text-muted-foreground/70 line-through',
            )}
          >
            {step.title || step.description || 'Untitled step'}
          </div>
          {step.description && step.title ? (
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
              {step.description}
            </div>
          ) : null}
          {step.files.length > 0 ? (
            <div className="mt-1 flex min-w-0 flex-wrap gap-1">
              {step.files.map((file) => (
                <span
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  key={file}
                >
                  <FileCode2 size={10} />
                  <span className="truncate">{basename(file)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const description =
    getStringRecordValue(tool.input, 'description') ||
    getStringRecordValue(tool.input, 'subject') ||
    getStringRecordValue(tool.output, 'summary');
  const durationMs =
    getNumberRecordValue(tool.output, 'totalDurationMs') ??
    getNumberRecordValue(tool.output, 'durationMs') ??
    getNumberRecordValue(tool.output, 'duration_ms');

  return (
    <div className="px-3 py-2" data-testid="ai-planning-tool">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">
              {tool.status === 'running' ? 'Running Subagent' : 'Completed Subagent'}
            </span>
            {durationMs ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDuration(durationMs)}
              </span>
            ) : null}
          </div>
          {description ? (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {description}
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

function McpToolActivity({
  permission,
  sessionId,
  tool,
}: {
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const info = parseRuntimeMcpTool(tool.name);
  const meta = getRuntimeToolMeta(tool);

  return (
    <div className="px-3 py-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Wrench className="shrink-0 text-muted-foreground" size={14} />
            <span className="truncate text-sm font-medium">
              {info?.serverName ?? 'MCP'}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {info?.displayName ?? tool.name}
            </span>
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
  const normalizedName = normalizeToolName(tool.name);
  const searchResults = extractWebSearchResults(tool.output);
  const fetchContent = extractWebFetchContent(tool.output);
  const hasStructuredPreview =
    searchResults.length > 0 || Boolean(fetchContent?.content);

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
      {normalizedName.includes('websearch') && searchResults.length > 0 ? (
        <WebSearchResultsPreview
          results={searchResults}
          toolName={tool.name}
        />
      ) : null}
      {normalizedName.includes('webfetch') && fetchContent ? (
        <WebFetchContentPreview
          content={fetchContent.content}
          meta={fetchContent.meta}
          toolName={tool.name}
        />
      ) : null}
      <ToolDetailPreview
        hideOutput={hasStructuredPreview}
        permission={permission}
        sessionId={sessionId}
        tool={tool}
      />
    </div>
  );
}

function EditToolActivity({
  onMarkdownDocumentApplied,
  permission,
  sessionId,
  tool,
  workspaceRootPath,
}: {
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
  workspaceRootPath: string | null;
}) {
  const [applyState, setApplyState] = React.useState<
    'idle' | 'applying' | 'applied' | 'error'
  >('idle');
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [batchApplyState, setBatchApplyState] = React.useState<
    'idle' | 'applying' | 'applied' | 'error'
  >('idle');
  const [batchApplyError, setBatchApplyError] = React.useState<string | null>(
    null,
  );
  const diff = extractDiffText(tool.output) ?? extractDiffText(tool.input);
  const fileChanges = extractToolFileChanges(tool);
  const applicableEdit = getApplicableMarkdownEdit(tool, fileChanges);
  const batchApplicableEdits = fileChanges.flatMap((change) =>
    change.applicableEdit ? [change.applicableEdit] : [],
  );
  const stats = calculateEditToolStats(tool, diff, fileChanges);
  const filePath = getToolFilePath(tool);
  const displayPath =
    fileChanges.length > 1
      ? `${fileChanges.length} files`
      : fileChanges[0]?.path ??
        (filePath ? compactWorkspacePath(filePath) : tool.name);

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
      {fileChanges.length > 0 ? (
        <>
          {batchApplicableEdits.length > 1 ? (
            <div className="mt-2 rounded-md border bg-muted/20 p-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    可批量应用
                  </span>
                  <span className="ml-1">
                    {batchApplicableEdits.length} 项 Markdown 修改
                  </span>
                </div>
                <Button
                  aria-label={
                    batchApplyState === 'applied'
                      ? '全部已应用'
                      : `应用全部 ${batchApplicableEdits.length} 项到文档`
                  }
                  disabled={
                    !workspaceRootPath ||
                    batchApplyState === 'applying' ||
                    batchApplyState === 'applied'
                  }
                  size="sm"
                  type="button"
                  variant={batchApplyState === 'applied' ? 'outline' : 'default'}
                  onClick={() => {
                    if (!workspaceRootPath) {
                      return;
                    }

                    void applyMarkdownEditBatchSuggestion({
                      edits: batchApplicableEdits,
                      onApplied: onMarkdownDocumentApplied,
                      rootPath: workspaceRootPath,
                      setError: setBatchApplyError,
                      setState: setBatchApplyState,
                    });
                  }}
                >
                  {batchApplyState === 'applying' ? (
                    <LoaderCircle className="animate-spin" size={13} />
                  ) : batchApplyState === 'applied' ? (
                    <Check size={13} />
                  ) : null}
                  {batchApplyState === 'applied' ? '全部已应用' : '应用全部'}
                </Button>
              </div>
              {batchApplyError ? (
                <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {batchApplyError}
                </div>
              ) : null}
            </div>
          ) : null}
          <FileChangesPreview
            batchApplyState={batchApplyState}
            changes={fileChanges}
            onMarkdownDocumentApplied={onMarkdownDocumentApplied}
            workspaceRootPath={workspaceRootPath}
          />
        </>
      ) : (
        <ToolDetailPreview
          permission={permission}
          sessionId={sessionId}
          tool={tool}
        />
      )}
      {applicableEdit ? (
        <div className="mt-2 rounded-md border bg-muted/20 p-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">可应用修改</span>
              <span className="ml-1">
                {compactWorkspacePath(applicableEdit.path)}
              </span>
            </div>
            <Button
              aria-label="应用到文档"
              disabled={
                !workspaceRootPath ||
                applyState === 'applying' ||
                applyState === 'applied'
              }
              size="sm"
              type="button"
              variant={applyState === 'applied' ? 'outline' : 'default'}
              onClick={() => {
                if (!workspaceRootPath) {
                  return;
                }

                void applyMarkdownEditSuggestion({
                  edit: applicableEdit,
                  onApplied: onMarkdownDocumentApplied,
                  rootPath: workspaceRootPath,
                  setError: setApplyError,
                  setState: setApplyState,
                });
              }}
            >
              {applyState === 'applying' ? (
                <LoaderCircle className="animate-spin" size={13} />
              ) : applyState === 'applied' ? (
                <Check size={13} />
              ) : null}
              {applyState === 'applied' ? '已应用' : '应用到文档'}
            </Button>
          </div>
          {applyError ? (
            <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {applyError}
            </div>
          ) : null}
        </div>
      ) : null}
      {fileChanges.length > 0 && permission ? (
        <div className="mt-2">
          <PermissionCard permission={permission} sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}

function ToolDetailPreview({
  hideOutput = false,
  permission,
  sessionId,
  tool,
}: {
  hideOutput?: boolean;
  permission: AiPanelPermissionRequest | null;
  sessionId: string | null;
  tool: AiPanelToolCall;
}) {
  const diff = extractDiffText(tool.output) ?? extractDiffText(tool.input);
  const hasOutput = Boolean(tool.output && !diff && !hideOutput);

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

interface WebSearchResultPreview {
  title: string;
  url: string;
  snippet?: string;
}

function WebSearchResultsPreview({
  results,
  toolName,
}: {
  results: WebSearchResultPreview[];
  toolName: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-muted/20">
      <button
        aria-expanded={expanded}
        aria-label={`${expanded ? '收起' : '展开'} ${toolName} 结果`}
        className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="font-medium">搜索结果</span>
        <span className="min-w-0 flex-1 truncate">
          {results.length} result{results.length === 1 ? '' : 's'}
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
          size={14}
        />
      </button>
      {expanded ? (
        <div className="space-y-1 border-t p-2">
          {results.map((result) => (
            <a
              className="block rounded-md px-2 py-1 text-xs hover:bg-background"
              href={result.url}
              key={`${result.title}:${result.url}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="block truncate font-medium text-foreground">
                {result.title}
              </span>
              <span className="block truncate text-muted-foreground">
                {result.url}
              </span>
              {result.snippet ? (
                <span className="mt-1 line-clamp-2 block text-muted-foreground">
                  {result.snippet}
                </span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WebFetchContentPreview({
  content,
  meta,
  toolName,
}: {
  content: string;
  meta: string;
  toolName: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-muted/20">
      <button
        aria-expanded={expanded}
        aria-label={`${expanded ? '收起' : '展开'} ${toolName} 内容`}
        className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="font-medium">网页内容</span>
        {meta ? <span className="min-w-0 flex-1 truncate">{meta}</span> : <span className="min-w-0 flex-1" />}
        <ChevronDown
          className={cn(
            'shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
          size={14}
        />
      </button>
      {expanded ? (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t px-2 py-2 text-xs leading-5">
          {content}
        </pre>
      ) : null}
    </div>
  );
}

interface AiFileChangePreview {
  applicableEdit?: ApplicableMarkdownEdit;
  diff: string;
  path: string;
  stats: { added: number; removed: number };
}

function FileChangesPreview({
  batchApplyState,
  changes,
  onMarkdownDocumentApplied,
  workspaceRootPath,
}: {
  batchApplyState?: 'idle' | 'applying' | 'applied' | 'error';
  changes: AiFileChangePreview[];
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  workspaceRootPath: string | null;
}) {
  return (
    <div className="mt-2 space-y-2">
      {changes.map((change, index) => (
        <FileChangePreviewItem
          batchApplyState={batchApplyState}
          change={change}
          key={`${change.path}:${index}`}
          onMarkdownDocumentApplied={onMarkdownDocumentApplied}
          workspaceRootPath={workspaceRootPath}
        />
      ))}
    </div>
  );
}

function FileChangePreviewItem({
  batchApplyState,
  change,
  onMarkdownDocumentApplied,
  workspaceRootPath,
}: {
  batchApplyState?: 'idle' | 'applying' | 'applied' | 'error';
  change: AiFileChangePreview;
  onMarkdownDocumentApplied?: (document: AiAppliedMarkdownDocument) => void;
  workspaceRootPath: string | null;
}) {
  const [applyState, setApplyState] = React.useState<
    'idle' | 'applying' | 'applied' | 'error'
  >('idle');
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const effectiveApplyState =
    batchApplyState === 'applying' || batchApplyState === 'applied'
      ? batchApplyState
      : applyState;
  const canApply = Boolean(change.applicableEdit && workspaceRootPath);

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20">
      <div className="flex min-w-0 items-center gap-2 border-b px-2 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium">
          {change.path}
        </span>
        <span className="font-medium text-emerald-700">
          +{change.stats.added}
        </span>
        <span className="font-medium text-red-700">
          -{change.stats.removed}
        </span>
        {change.applicableEdit ? (
          <Button
            aria-label={
              effectiveApplyState === 'applied'
                ? `已应用 ${change.path}`
                : `应用 ${change.path} 到文档`
            }
            disabled={
              !canApply ||
              effectiveApplyState === 'applying' ||
              effectiveApplyState === 'applied'
            }
            size="sm"
            type="button"
            variant={effectiveApplyState === 'applied' ? 'outline' : 'secondary'}
            onClick={() => {
              if (!workspaceRootPath || !change.applicableEdit) {
                return;
              }

              void applyMarkdownEditSuggestion({
                edit: change.applicableEdit,
                onApplied: onMarkdownDocumentApplied,
                rootPath: workspaceRootPath,
                setError: setApplyError,
                setState: setApplyState,
              });
            }}
          >
            {effectiveApplyState === 'applying' ? (
              <LoaderCircle className="animate-spin" size={12} />
            ) : effectiveApplyState === 'applied' ? (
              <Check size={12} />
            ) : null}
            {effectiveApplyState === 'applied' ? '已应用' : '应用'}
          </Button>
        ) : null}
      </div>
      <DiffPreview diff={change.diff} />
      {applyError ? (
        <div className="border-t bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {applyError}
        </div>
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

  if (isPlanningToolName(name)) {
    return 'planning';
  }

  if (parseRuntimeMcpTool(tool.name)) {
    return 'mcp';
  }

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
    case 'planning':
      return { completedLabel: '已规划', runningLabel: '正在规划' };
    case 'mcp':
      return { completedLabel: '已调用 MCP', runningLabel: '正在调用 MCP' };
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
    case 'planning':
      return <Sparkles className={className} size={size} />;
    case 'mcp':
      return <Wrench className={className} size={size} />;
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
  const mcpInfo = parseRuntimeMcpTool(tool.name);

  if (mcpInfo) {
    return {
      subtitle:
        getStringRecordValue(tool.input, 'query') ||
        getStringRecordValue(tool.input, 'library') ||
        getStringRecordValue(tool.input, 'id') ||
        mcpInfo.category,
    };
  }

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

  if (name === 'todowrite') {
    const todos = tool.input.todos;

    return {
      subtitle: Array.isArray(todos)
        ? `${todos.length} item${todos.length === 1 ? '' : 's'}`
        : '',
    };
  }

  if (name === 'planwrite') {
    const plan = isRecord(tool.input.plan) ? tool.input.plan : null;
    const title = plan ? getStringRecordValue(plan, 'title') : '';
    const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
    const completed = steps.filter(
      (step) => isRecord(step) && step.status === 'completed',
    ).length;

    return {
      subtitle: title
        ? `${title}${steps.length > 0 ? ` (${completed}/${steps.length})` : ''}`
        : steps.length > 0
          ? `${completed}/${steps.length} steps`
          : '',
    };
  }

  if (name.startsWith('task')) {
    return {
      subtitle:
        getStringRecordValue(tool.input, 'subject') ||
        getStringRecordValue(tool.input, 'description') ||
        getStringRecordValue(tool.input, 'taskId'),
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

function isPlanningToolName(name: string) {
  return (
    name === 'todowrite' ||
    name === 'planwrite' ||
    name === 'exitplanmode' ||
    name.startsWith('task')
  );
}

interface PlanningTodoItem {
  activeForm?: string;
  content: string;
  status: string;
}

interface PlanningPlanStep {
  description: string;
  files: string[];
  status: string;
  title: string;
}

interface PlanningPlan {
  status: string;
  steps: PlanningPlanStep[];
  summary: string;
  title: string;
}

interface ApplicableMarkdownEdit {
  diffPatch?: string;
  fullContent?: string;
  newString?: string;
  oldString?: string;
  path: string;
}

interface ApplyMarkdownEditInput {
  edit: ApplicableMarkdownEdit;
  onApplied?: (document: AiAppliedMarkdownDocument) => void;
  rootPath: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setState: React.Dispatch<
    React.SetStateAction<'idle' | 'applying' | 'applied' | 'error'>
  >;
}

interface ApplyMarkdownEditBatchInput {
  edits: ApplicableMarkdownEdit[];
  onApplied?: (document: AiAppliedMarkdownDocument) => void;
  rootPath: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setState: React.Dispatch<
    React.SetStateAction<'idle' | 'applying' | 'applied' | 'error'>
  >;
}

interface PreparedMarkdownEdit {
  edit: ApplicableMarkdownEdit;
  expectedModifiedAt: number | null;
  nextContent: string;
}

function extractToolTodos(tool: AiPanelToolCall): PlanningTodoItem[] {
  return (
    extractTodosFromValue(tool.output?.newTodos) ||
    extractTodosFromValue(tool.output?.todos) ||
    extractTodosFromValue(tool.input.todos) ||
    []
  );
}

function extractTodosFromValue(value: unknown): PlanningTodoItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const content =
      getStringRecordValue(entry, 'content') ||
      getStringRecordValue(entry, 'title') ||
      getStringRecordValue(entry, 'text');

    if (!content) {
      return [];
    }

    return [
      {
        activeForm: getStringRecordValue(entry, 'activeForm') || undefined,
        content,
        status: getStringRecordValue(entry, 'status') || 'pending',
      },
    ];
  });
}

function extractToolPlan(tool: AiPanelToolCall): PlanningPlan | null {
  const planValue = isRecord(tool.output?.plan)
    ? tool.output.plan
    : isRecord(tool.input.plan)
      ? tool.input.plan
      : null;

  if (!planValue) {
    return null;
  }

  const title =
    getStringRecordValue(planValue, 'title') ||
    getStringRecordValue(planValue, 'name') ||
    'Plan';
  const stepsValue = planValue.steps;
  const steps = Array.isArray(stepsValue)
    ? stepsValue.flatMap((step) => extractPlanStep(step))
    : [];

  return {
    status: getStringRecordValue(planValue, 'status'),
    steps,
    summary:
      getStringRecordValue(planValue, 'summary') ||
      getStringRecordValue(planValue, 'description'),
    title,
  };
}

function extractPlanStep(value: unknown): PlanningPlanStep[] {
  if (!isRecord(value)) {
    return [];
  }

  const title =
    getStringRecordValue(value, 'title') ||
    getStringRecordValue(value, 'name') ||
    getStringRecordValue(value, 'content');
  const description = getStringRecordValue(value, 'description');
  const filesValue = value.files;
  const files = Array.isArray(filesValue)
    ? filesValue.filter((file): file is string => typeof file === 'string')
    : [];

  if (!title && !description && files.length === 0) {
    return [];
  }

  return [
    {
      description,
      files,
      status: getStringRecordValue(value, 'status') || 'pending',
      title,
    },
  ];
}

function PlanningStatusIcon({
  running,
  status,
}: {
  running: boolean;
  status: string;
}) {
  const className = 'mt-0.5 shrink-0 text-muted-foreground';

  if (running && status === 'in_progress') {
    return <LoaderCircle className={cn(className, 'animate-spin')} size={14} />;
  }

  if (status === 'completed') {
    return <Check className={className} size={14} />;
  }

  if (status === 'in_progress') {
    return <LoaderCircle className={className} size={14} />;
  }

  if (status === 'skipped') {
    return <SkipForward className={className} size={14} />;
  }

  return <Circle className={className} size={14} />;
}

function formatPlanningStatus(status: string) {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'in_progress':
      return '进行中';
    case 'skipped':
      return '已跳过';
    case 'pending':
      return '待处理';
    default:
      return status || '待处理';
  }
}

function formatPlanStatus(status: string) {
  switch (status) {
    case 'awaiting_approval':
      return '等待确认';
    case 'approved':
      return '已确认';
    case 'completed':
      return '计划完成';
    case 'in_progress':
      return '执行中';
    case 'draft':
      return '草稿';
    default:
      return status || '计划';
  }
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, '/');

  return normalized.split('/').filter(Boolean).at(-1) ?? path;
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return '';
  }

  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function getApplicableMarkdownEdit(
  tool: AiPanelToolCall,
  fileChanges: AiFileChangePreview[],
): ApplicableMarkdownEdit | null {
  if (fileChanges.length > 1) {
    return null;
  }

  const path = getToolFilePath(tool);

  if (!path || !isMarkdownDocumentPath(path)) {
    return null;
  }

  const fullContent =
    getStringRecordValue(tool.output, 'content') ||
    getStringRecordValue(tool.output, 'markdown') ||
    getStringRecordValue(tool.output, 'newContent') ||
    getStringRecordValue(tool.output, 'new_content');

  if (fullContent) {
    return { fullContent, path };
  }

  const oldString = getStringRecordValue(tool.input, 'old_string');
  const newString = getStringRecordValue(tool.input, 'new_string');

  if (oldString || newString) {
    return {
      newString,
      oldString,
      path,
    };
  }

  const diffPatch = extractDiffText(tool.output) ?? extractDiffText(tool.input);

  return diffPatch ? { diffPatch, path } : null;
}

function getApplicableMarkdownEditFromRecord(
  value: Record<string, unknown>,
  path: string,
): ApplicableMarkdownEdit | undefined {
  if (!path || !isMarkdownDocumentPath(path)) {
    return undefined;
  }

  const fullContent =
    getStringRecordValue(value, 'content') ||
    getStringRecordValue(value, 'markdown') ||
    getStringRecordValue(value, 'newContent') ||
    getStringRecordValue(value, 'new_content');

  if (fullContent) {
    return { fullContent, path };
  }

  const oldString =
    getStringRecordValue(value, 'old_string') ||
    getStringRecordValue(value, 'oldString');
  const newString =
    getStringRecordValue(value, 'new_string') ||
    getStringRecordValue(value, 'newString');

  if (oldString || newString) {
    return {
      newString,
      oldString,
      path,
    };
  }

  const diffPatch =
    getStringRecordValue(value, 'diff') ||
    getStringRecordValue(value, 'patch');

  return diffPatch ? { diffPatch, path } : undefined;
}

async function applyMarkdownEditSuggestion({
  edit,
  onApplied,
  rootPath,
  setError,
  setState,
}: ApplyMarkdownEditInput) {
  setState('applying');
  setError(null);

  try {
    const current = await readMarkdownDocument(rootPath, edit.path);
    const nextContent = buildAppliedMarkdownEditContent(
      current.content,
      edit,
    );
    const meta = await saveMarkdownDocument(
      rootPath,
      edit.path,
      nextContent,
      current.modifiedAt ?? null,
    );

    onApplied?.({
      content: nextContent,
      modifiedAt: meta.modifiedAt,
      path: meta.path,
    });
    setState('applied');
  } catch (error) {
    setState('error');
    setError(
      error instanceof Error
        ? error.message
        : '无法应用 AI 生成的文档修改',
    );
  }
}

async function applyMarkdownEditBatchSuggestion({
  edits,
  onApplied,
  rootPath,
  setError,
  setState,
}: ApplyMarkdownEditBatchInput) {
  setState('applying');
  setError(null);

  let prepared: PreparedMarkdownEdit[];

  try {
    prepared = await prepareMarkdownEditBatch(rootPath, edits);
  } catch (error) {
    setState('error');
    setError(
      `批量预检失败，未写入任何文件：${
        error instanceof Error ? error.message : '无法应用 AI 生成的文档修改'
      }`,
    );
    return;
  }

  try {
    for (const item of prepared) {
      const meta = await saveMarkdownDocument(
        rootPath,
        item.edit.path,
        item.nextContent,
        item.expectedModifiedAt,
      );

      onApplied?.({
        content: item.nextContent,
        modifiedAt: meta.modifiedAt,
        path: meta.path,
      });
    }

    setState('applied');
  } catch (error) {
    setState('error');
    setError(
      `批量保存失败，部分文件可能已保存：${
        error instanceof Error ? error.message : '无法保存 AI 生成的文档修改'
      }`,
    );
  }
}

async function prepareMarkdownEditBatch(
  rootPath: string,
  edits: ApplicableMarkdownEdit[],
): Promise<PreparedMarkdownEdit[]> {
  const prepared: PreparedMarkdownEdit[] = [];

  for (const edit of edits) {
    const current = await readMarkdownDocument(rootPath, edit.path);

    prepared.push({
      edit,
      expectedModifiedAt: current.modifiedAt ?? null,
      nextContent: buildAppliedMarkdownEditContent(current.content, edit),
    });
  }

  return prepared;
}

function buildAppliedMarkdownEditContent(
  currentContent: string,
  edit: ApplicableMarkdownEdit,
) {
  if (typeof edit.fullContent === 'string') {
    return edit.fullContent;
  }

  if (edit.diffPatch) {
    return applyUnifiedDiffPatch(currentContent, edit.diffPatch);
  }

  const oldString = edit.oldString ?? '';
  const newString = edit.newString ?? '';

  if (!oldString) {
    throw new Error('缺少可匹配的原文片段，无法安全应用修改');
  }

  if (!currentContent.includes(oldString)) {
    throw new Error('当前文档已变化，找不到 AI 修改对应的原文片段');
  }

  return currentContent.replace(oldString, newString);
}

function applyUnifiedDiffPatch(currentContent: string, diffPatch: string) {
  const hunks = parseApplicableUnifiedDiffHunks(diffPatch);

  if (hunks.length === 0) {
    throw new Error('无法识别可应用的 unified diff');
  }

  let nextContent = currentContent;

  for (const hunk of hunks) {
    const oldBlock = hunk.oldLines.join('\n');
    const newBlock = hunk.newLines.join('\n');

    if (!oldBlock) {
      throw new Error('diff 缺少可匹配的上下文，无法安全应用');
    }

    const firstIndex = nextContent.indexOf(oldBlock);

    if (firstIndex < 0) {
      throw new Error('当前文档已变化，无法安全应用 AI 生成的 diff');
    }

    if (nextContent.indexOf(oldBlock, firstIndex + oldBlock.length) >= 0) {
      throw new Error('diff 上下文不唯一，无法安全应用');
    }

    nextContent =
      nextContent.slice(0, firstIndex) +
      newBlock +
      nextContent.slice(firstIndex + oldBlock.length);
  }

  return nextContent;
}

interface ApplicableUnifiedDiffHunk {
  newLines: string[];
  oldLines: string[];
}

function parseApplicableUnifiedDiffHunks(
  diffPatch: string,
): ApplicableUnifiedDiffHunk[] {
  const hunks: ApplicableUnifiedDiffHunk[] = [];
  let currentHunk: ApplicableUnifiedDiffHunk | null = null;

  for (const rawLine of diffPatch.split('\n')) {
    if (rawLine.startsWith('@@')) {
      currentHunk = { newLines: [], oldLines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (
      rawLine.startsWith('--- ') ||
      rawLine.startsWith('+++ ') ||
      rawLine.startsWith('diff --git ') ||
      rawLine.startsWith('index ') ||
      rawLine.startsWith('\\ No newline')
    ) {
      continue;
    }

    if (rawLine.startsWith('+')) {
      currentHunk.newLines.push(rawLine.slice(1));
      continue;
    }

    if (rawLine.startsWith('-')) {
      currentHunk.oldLines.push(rawLine.slice(1));
      continue;
    }

    const contextLine = rawLine.startsWith(' ')
      ? rawLine.slice(1)
      : rawLine;
    currentHunk.oldLines.push(contextLine);
    currentHunk.newLines.push(contextLine);
  }

  return hunks.filter(
    (hunk) => hunk.oldLines.length > 0 || hunk.newLines.length > 0,
  );
}

function isMarkdownDocumentPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

interface RuntimeMcpToolInfo {
  category: string;
  displayName: string;
  serverName: string;
}

function parseRuntimeMcpTool(name: string): RuntimeMcpToolInfo | null {
  const normalized = name.replace(/^tool-/i, '');
  const lower = normalized.toLowerCase();

  if (
    lower === 'listmcpresources' ||
    lower === 'listmcpresourcestool'
  ) {
    return {
      category: 'list',
      displayName: 'List Resources',
      serverName: 'mcp',
    };
  }

  if (
    lower === 'readmcpresource' ||
    lower === 'readmcpresourcetool'
  ) {
    return {
      category: 'get',
      displayName: 'Read Resource',
      serverName: 'mcp',
    };
  }

  const separatorIndex = normalized.indexOf('.');

  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null;
  }

  const serverName = normalized.slice(0, separatorIndex);
  const toolName = normalized.slice(separatorIndex + 1);

  return {
    category: categorizeRuntimeMcpTool(toolName),
    displayName: formatRuntimeMcpToolName(toolName),
    serverName,
  };
}

function formatRuntimeMcpToolName(name: string) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function categorizeRuntimeMcpTool(name: string) {
  const lower = name.toLowerCase();

  if (lower.startsWith('search') || lower.startsWith('query')) {
    return 'search';
  }

  if (lower.startsWith('list')) {
    return 'list';
  }

  if (
    lower.startsWith('get') ||
    lower.startsWith('fetch') ||
    lower.startsWith('retrieve') ||
    lower.startsWith('resolve')
  ) {
    return 'get';
  }

  if (lower.startsWith('create') || lower.startsWith('add')) {
    return 'create';
  }

  if (lower.startsWith('update') || lower.startsWith('modify')) {
    return 'update';
  }

  if (lower.startsWith('delete') || lower.startsWith('remove')) {
    return 'delete';
  }

  return 'other';
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
  return extractWebSearchResults(output).length;
}

function extractWebSearchResults(
  output: Record<string, unknown> | undefined,
): WebSearchResultPreview[] {
  const results = output?.results;

  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((result) => {
    if (!isRecord(result)) {
      return [];
    }

    const content = result.content;

    if (Array.isArray(content)) {
      return content.flatMap((item) => extractWebSearchResultItem(item));
    }

    return extractWebSearchResultItem(result);
  });
}

function extractWebSearchResultItem(
  value: unknown,
): WebSearchResultPreview[] {
  if (!isRecord(value)) {
    return [];
  }

  const title = getStringRecordValue(value, 'title');
  const url = getStringRecordValue(value, 'url');

  if (!title || !url) {
    return [];
  }

  return [
    {
      snippet:
        getStringRecordValue(value, 'snippet') ||
        getStringRecordValue(value, 'description') ||
        getStringRecordValue(value, 'text'),
      title,
      url,
    },
  ];
}

function extractWebFetchContent(output: Record<string, unknown> | undefined) {
  const content =
    getStringRecordValue(output, 'result') ||
    getStringRecordValue(output, 'content') ||
    getStringRecordValue(output, 'text') ||
    getStringRecordValue(output, 'markdown');

  if (!content) {
    return null;
  }

  const bytes = getNumberRecordValue(output, 'bytes');
  const code = getNumberRecordValue(output, 'code');
  const meta = [
    code ? `${code}` : '',
    bytes ? formatBytes(bytes) : '',
  ].filter(Boolean).join(' · ');

  return { content, meta };
}

function getNumberRecordValue(
  value: Record<string, unknown> | undefined,
  key: string,
) {
  const entry = value?.[key];

  return typeof entry === 'number' ? entry : null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function calculateEditToolStats(
  tool: AiPanelToolCall,
  diff: string | null,
  changes: AiFileChangePreview[],
) {
  if (changes.length > 0) {
    return changes.reduce(
      (total, change) => ({
        added: total.added + change.stats.added,
        removed: total.removed + change.stats.removed,
      }),
      { added: 0, removed: 0 },
    );
  }

  return calculateToolDiffStats(tool, diff);
}

function extractToolFileChanges(tool: AiPanelToolCall): AiFileChangePreview[] {
  const changes = [
    ...extractFileChangesFromRecord(tool.output),
    ...extractFileChangesFromRecord(tool.input),
  ];
  const seen = new Set<string>();

  return changes.filter((change) => {
    const key = `${change.path}\n${change.diff}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractFileChangesFromRecord(
  value: Record<string, unknown> | undefined,
): AiFileChangePreview[] {
  const changes = value?.changes;

  if (!Array.isArray(changes)) {
    return [];
  }

  return changes.flatMap((change, index) => {
    if (!isRecord(change)) {
      return [];
    }

    const diff =
      getStringRecordValue(change, 'diff') ||
      getStringRecordValue(change, 'patch');

    if (!diff) {
      return [];
    }

    const path =
      getStringRecordValue(change, 'path') ||
      getStringRecordValue(change, 'filePath') ||
      getStringRecordValue(change, 'file_path') ||
      parseUnifiedDiff(diff).displayPath ||
      `change-${index + 1}`;
    const displayPath = compactWorkspacePath(path);

    return [
      {
        applicableEdit: getApplicableMarkdownEditFromRecord(change, path),
        diff,
        path: displayPath,
        stats: calculateUnifiedDiffStats(diff),
      },
    ];
  });
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

function buildComposerContextReference({
  markdown,
  source,
  title,
  workspaceRootPath,
}: {
  markdown: string;
  source: 'attached-file' | 'pasted-text';
  title: string;
  workspaceRootPath: string;
}): AiContextReference {
  const contentHash = createStableContentHash(markdown);
  const slug = slugifyContextTitle(title);
  const relativePath = `${source}/${slug}-${contentHash}.md`;

  return {
    contentHash,
    markdown,
    modifiedAt: null,
    path: `${workspaceRootPath}/.madora/ai-context/${relativePath}`,
    relativePath,
    source,
    title,
  };
}

function mergeAiContextReferences(references: AiContextReference[]) {
  const merged: AiContextReference[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    const key = reference.relativePath || reference.contentHash;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(reference);
  }

  return merged;
}

function mergeAiContextImages(images: AiContextImage[]) {
  const merged: AiContextImage[] = [];
  const seen = new Set<string>();

  for (const image of images) {
    if (seen.has(image.contentHash)) {
      continue;
    }

    seen.add(image.contentHash);
    merged.push(image);
  }

  return merged;
}

async function buildImageContextAttachment(
  file: File,
): Promise<AiComposerImageAttachment> {
  const dataUrl = await readFileAsDataUrl(file);
  const [header, base64Data = ''] = dataUrl.split(',');
  const mediaType =
    header.match(/^data:([^;]+);base64$/u)?.[1] || file.type || 'image/png';
  const filename = file.name || `image-${Date.now()}.png`;
  const contentHash = createStableContentHash(
    `${filename}:${mediaType}:${base64Data}`,
  );
  const image: AiContextImage = {
    base64Data,
    contentHash,
    filename,
    id: contentHash,
    mediaType,
    size: file.size,
  };

  return {
    id: contentHash,
    image,
    previewUrl: dataUrl,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('无法读取文件内容'));
    };
    reader.onerror = () => reject(new Error('无法读取文件内容'));
    reader.readAsDataURL(file);
  });
}

function shouldCapturePastedTextContext(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return false;
  }

  const meaningfulLines = trimmed
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  return trimmed.length >= 500 || meaningfulLines.length >= 4;
}

function isTextContextFile(file: File) {
  if (file.type.startsWith('text/')) {
    return true;
  }

  return /\.(csv|css|html|json|jsx|md|mdx|ts|tsx|txt|toml|xml|ya?ml)$/iu.test(
    file.name,
  );
}

function slugifyContextTitle(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);

  return normalized || 'context';
}

function formatCharacterCount(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k ch`;
  }

  return `${value} ch`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

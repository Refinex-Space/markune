'use client';

import * as React from 'react';
import type {
  MarkweaveAiEditController,
  MarkweaveAskAiHandler,
} from '@markweave/react';
import { Openai } from '@thesvg/react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Collapsible } from 'radix-ui';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleX,
  Copy,
  Eye,
  File,
  FolderOpen,
  FilePenLine,
  FileText,
  Globe2,
  Goal,
  Hand,
  History,
  ImageIcon,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  Puzzle,
  Search,
  SearchCode,
  ShieldCheck,
  ShieldAlert,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import {
  ConfirmationDialog,
  useConfirmationDialog,
} from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import {
  codexAppServerClient,
  codexProtocolThreadId,
  listenCodexEventsUntilDisposed,
  pasteCodexContextAttachments,
  readCodexContextAttachmentPreview,
  readCodexPluginIcon,
  releaseCodexContextAttachments,
  respondToCodexApproval,
  respondToCodexDynamicTool,
  respondToCodexUserInput,
  selectCodexContextAttachments,
  startCodexRuntime,
  threadGoalUpdateFromMessage,
  threadTokenUsageUpdateFromMessage,
  type CodexAccountResponse,
  type CodexApprovalPolicy,
  type CodexApprovalsReviewer,
  type CodexConfigRequirementsResponse,
  type CodexCollaborationMode,
  type CodexCollaborationModeKind,
  type CodexCollaborationModeListResponse,
  type CodexCollaborationModeMask,
  type CodexContextAttachment,
  type CodexDynamicToolRequest,
  type CodexDynamicToolResponse,
  type CodexExperimentalFeatureListResponse,
  type CodexModel,
  type CodexModelListResponse,
  type CodexPermissionProfileListResponse,
  type CodexPermissionProfileSummary,
  type CodexPluginInstalledResponse,
  type CodexReasoningEffort,
  type CodexSkillScope,
  type CodexSkillsListResponse,
  type CodexThread,
  type CodexThreadGoal,
  type CodexThreadGoalClearResponse,
  type CodexThreadGoalGetResponse,
  type CodexThreadGoalSetResponse,
  type CodexThreadListResponse,
  type CodexThreadPermissionSettings,
  type CodexThreadTokenUsage,
  type CodexUserInputAnswer,
} from './codex-app-server';
import {
  CodexInlineAiRunner,
  shouldRouteCodexMessageToVisibleThread,
  streamCodexInlineAiProposal,
} from './codex-inline-ai';
import {
  conversationFromThread,
  buildConversationBlocks,
  createComposerAwareUserInput,
  createDrawingMentionPath,
  createThreadTitle,
  createEmptyConversation,
  getOutputPreviewLines,
  reduceCodexProtocolMessage,
  selectActiveTaskProgress,
  threadNameUpdateFromMessage,
  workspaceChangeEventFromProtocolMessage,
  parseDrawingMentionPath,
  type AiActivityGroup,
  type AiApprovalRequest,
  type AiChangeSummaryBlock,
  type AiConversationBlock,
  type AiConversationEntry,
  type AiConversationState,
  type AiFileChange,
  type AiDrawingInputMention,
  type AiMessageAttachment,
  type AiMessageMention,
  type AiPluginInputMention,
  type AiProposedPlan,
  type AiSkillInputMention,
  type AiTraceBlock,
  type AiTimelineItem,
  type AiTaskProgress,
  type AiTurnError,
  type AiTurnErrorBlock,
  type AiUserInputRequest,
  type AiWorkspaceChangeEvent,
} from './ai-panel-state';
import {
  findMentionToken,
  findSkillToken,
  mentionMatchIndices,
  rankMentionDocuments,
} from './ai-mention-search';
import {
  isTauriRuntime,
  openUrlInDefaultBrowser,
} from './workspace-api';
import type { AiDrawingReference, WorkspaceNode } from './workspace-types';

interface AiPanelProps {
  activeDrawing?: AiDrawingReference | null;
  currentDocument: WorkspaceNode | null;
  currentDocumentPath: string | null;
  documents: AiDocumentReference[];
  drawings?: AiDrawingReference[];
  workspaceRootPath: string | null;
  getActiveEditorAiEditController?: () => MarkweaveAiEditController | null;
  onBeforeTurnStart: (
    documentPath: string | null,
    drawingId: string | null,
  ) => Promise<boolean>;
  onDrawingToolCall?: (
    request: CodexDynamicToolRequest,
  ) => Promise<CodexDynamicToolResponse>;
  onAskAiHandlerChange?: (handler: MarkweaveAskAiHandler | null) => void;
  onOpenDocument: (documentPath: string) => void;
  onOpenPlanPreview: (plan: AiProposedPlan, threadId: string) => void;
  onOpenCodexSettings?: () => void;
  onWorkspaceChanged: (
    event: AiWorkspaceChangeEvent,
  ) => void | Promise<void>;
  presentation?: 'panel' | 'workspace';
  visible?: boolean;
}

type AiDocumentReference = Pick<
  WorkspaceNode,
  'absolutePath' | 'id' | 'name' | 'relativePath' | 'title'
>;

type AiComposerDocumentMention = AiDocumentReference &
  AiMessageMention & { kind: 'document' };

type AiComposerDrawingMention = AiDrawingReference & AiDrawingInputMention;

type AiComposerPluginMention = AiPluginInputMention & {
  description: string | null;
  id: string;
};

type AiComposerSkillMention = AiSkillInputMention & {
  description: string;
  displayName: string;
  scope: CodexSkillScope;
};

type AiComposerMention =
  | AiComposerDocumentMention
  | AiComposerDrawingMention
  | AiComposerPluginMention
  | AiComposerSkillMention;

interface AiPluginMentionOption {
  description: string | null;
  darkIconUrl?: string | null;
  displayName: string;
  id: string;
  iconUrl?: string | null;
  mentionPath: string;
}

interface AiSkillMentionOption {
  description: string;
  displayName: string;
  name: string;
  path: string;
  scope: CodexSkillScope;
}

interface ComposerSkillInsertRequest {
  id: number;
  skill: AiSkillMentionOption;
}

type CodexPluginInterface = NonNullable<
  CodexPluginInstalledResponse['marketplaces'][number]['plugins'][number]['interface']
>;

interface ComposerMentionTarget {
  kind: 'document' | 'skill';
  key: string;
  query: string;
  range: Range;
}

const mentionLinkClassName =
  'mx-0.5 inline cursor-pointer select-none rounded-sm border-0 bg-transparent p-0 [font:inherit] leading-[inherit] text-left text-[#3574f0] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3574f0]/35';
const composerMentionClassName = cn(
  mentionLinkClassName,
  'inline-flex items-center gap-1 whitespace-nowrap align-middle',
);
const GOAL_COMMAND_SELECTION = 'markune:goal-mode';
const COMPACT_COMMAND_SELECTION = 'markune:compact-context';
const GOAL_OBJECTIVE_MAX_LENGTH = 4_000;

type PanelView = 'chat' | 'history';
type RuntimeStatus = 'error' | 'loading' | 'ready' | 'web';
type ControlLoadStatus = 'error' | 'idle' | 'loading' | 'ready';

interface ThreadStartResponse extends CodexThreadPermissionSettings {
  thread: CodexThread;
  model: string;
  reasoningEffort: CodexReasoningEffort | null;
}

interface ThreadReadResponse {
  thread: CodexThread;
}

type ThreadResumeResponse = ThreadStartResponse;

interface TurnStartResponse {
  turn: { id: string };
}

interface LoginResponse {
  type: string;
  authUrl?: string;
  verificationUrl?: string;
}

interface SendMessageOptions {
  forceNewThread?: boolean;
  mode?: CodexCollaborationModeKind;
  planAction?: boolean;
  restorePlan?: AiProposedPlan;
}

interface StarterAction {
  description: string;
  icon: React.ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
  }>;
  iconClassName: string;
  prompt: string;
  title: string;
}

const DOCUMENT_STARTER_ACTIONS: StarterAction[] = [
  {
    description: '梳理重点、摘要与信息缺口',
    icon: SearchCode,
    iconClassName: 'text-blue-500 dark:text-blue-400',
    prompt: '总结当前文档并指出信息缺口',
    title: '阅读并理解',
  },
  {
    description: '优化结构、表达与专业度',
    icon: FilePenLine,
    iconClassName: 'text-violet-500 dark:text-violet-400',
    prompt: '把当前文档改写得更清晰、专业',
    title: '改写和完善',
  },
  {
    description: '基于当前主题创建关联文档',
    icon: Blocks,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    prompt: '基于当前内容新建一篇关联文档',
    title: '扩展关联内容',
  },
  {
    description: '查找矛盾、遗漏与可改进之处',
    icon: AlertCircle,
    iconClassName: 'text-orange-500 dark:text-orange-400',
    prompt: '检查当前文档中的事实矛盾、结构问题和表达缺陷，并给出修改建议',
    title: '检查潜在问题',
  },
];

const WORKSPACE_STARTER_ACTIONS: StarterAction[] = [
  {
    description: '梳理目录、主题与关键文档',
    icon: SearchCode,
    iconClassName: 'text-blue-500 dark:text-blue-400',
    prompt: '梳理当前工作区的文档结构，并指出最值得先了解的内容',
    title: '了解工作区',
  },
  {
    description: '从想法生成清晰的文档框架',
    icon: FilePenLine,
    iconClassName: 'text-violet-500 dark:text-violet-400',
    prompt: '根据当前工作区的主题，规划并起草一篇新文档',
    title: '起草新文档',
  },
  {
    description: '发现关联并提出组织建议',
    icon: Blocks,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    prompt: '分析当前工作区的知识结构，找出可以建立的文档关联和整理建议',
    title: '整理知识结构',
  },
  {
    description: '检查缺口、冲突与过时信息',
    icon: AlertCircle,
    iconClassName: 'text-orange-500 dark:text-orange-400',
    prompt: '检查当前工作区中可能存在的信息缺口、内容冲突和过时内容，并给出处理建议',
    title: '查找内容问题',
  },
];

const SCROLL_BOTTOM_THRESHOLD = 64;

const DEVELOPER_INSTRUCTIONS = `你运行在 Markune 的工作区级 AI 面板中。默认只在当前工作区内读取和修改文件；仅当当前命名权限配置明确允许、且用户请求确实需要时，才可访问工作区外路径。Markune 以 Markdown 为唯一持久化文档格式，请保持现有 frontmatter 和目录约定。Markune 会为每个 turn 提供编辑器活跃文档和显式文档引用；“当前文档”“本文”“这篇文档”等表述只指向该 turn 的 markune_active_document，不得根据日期、最近文件或工作区惯例猜测。请求依赖文档内容时，必须先使用工作区工具读取相关文件，并让读取动作通过正常工具事件返回；不得在尝试读取前声称缺少路径。与文档无关的请求不必读取活跃文档。AI 画图必须使用 Markune 提供的 markune_drawing 工具，禁止直接读写 .markune/drawings 或生成待导入文件。严格遵循当前线程的 Codex 权限配置和审批结果，不得绕过权限边界。删除文档前必须明确说明将删除的路径和影响，并等待用户确认。不要读取、输出或记录密钥、Token、Cookie、连接串或其他敏感信息。完成文件变更后简要列出实际修改和验证结果。`;

const PLAN_IMPLEMENTATION_MESSAGE = 'Implement the plan.';
const PLAN_IMPLEMENTATION_FRESH_PREFIX =
  "A previous agent produced the plan below to accomplish the user's task. " +
  'Implement the plan in a fresh context. Treat the plan as the source of ' +
  'user intent, re-read files as needed, and carry the work through ' +
  'implementation and verification.';

type PermissionModeId = 'ask' | 'auto' | 'full' | 'readOnly' | `profile:${string}`;

interface PermissionSettings {
  approvalPolicy: CodexApprovalPolicy;
  approvalsReviewer: CodexApprovalsReviewer;
  profileId: string;
}

const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  approvalPolicy: 'on-request',
  approvalsReviewer: 'user',
  profileId: ':workspace',
};

function permissionSettingsFromResponse(
  response: Pick<
    ThreadStartResponse,
    'activePermissionProfile' | 'approvalPolicy' | 'approvalsReviewer'
  >,
): PermissionSettings {
  return {
    approvalPolicy: response.approvalPolicy,
    approvalsReviewer:
      response.approvalsReviewer === 'guardian_subagent'
        ? 'auto_review'
        : response.approvalsReviewer,
    profileId:
      response.activePermissionProfile?.id ??
      DEFAULT_PERMISSION_SETTINGS.profileId,
  };
}

function permissionSettingsFromProtocol(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const settings = value as Record<string, unknown>;
  const activeProfile = settings.activePermissionProfile;
  const profileId =
    activeProfile && typeof activeProfile === 'object' && !Array.isArray(activeProfile)
      ? (activeProfile as Record<string, unknown>).id
      : null;
  const approvalPolicy = settings.approvalPolicy;
  const approvalsReviewer = settings.approvalsReviewer;
  if (
    typeof profileId !== 'string' ||
    !['never', 'on-request', 'untrusted'].includes(String(approvalPolicy)) ||
    !['auto_review', 'guardian_subagent', 'user'].includes(
      String(approvalsReviewer),
    )
  ) {
    return null;
  }
  return permissionSettingsFromResponse({
    activePermissionProfile: { extends: null, id: profileId },
    approvalPolicy: approvalPolicy as CodexApprovalPolicy,
    approvalsReviewer: approvalsReviewer as CodexApprovalsReviewer,
  });
}

function permissionSettingsForMode(mode: PermissionModeId): PermissionSettings {
  if (mode === 'auto') {
    return {
      approvalPolicy: 'on-request',
      approvalsReviewer: 'auto_review',
      profileId: ':workspace',
    };
  }
  if (mode === 'full') {
    return {
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      profileId: ':danger-full-access',
    };
  }
  if (mode === 'readOnly') {
    return {
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      profileId: ':read-only',
    };
  }
  if (mode.startsWith('profile:')) {
    return {
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      profileId: mode.slice('profile:'.length),
    };
  }
  return DEFAULT_PERMISSION_SETTINGS;
}

function permissionModeFromSettings(settings: PermissionSettings): PermissionModeId {
  if (settings.profileId === ':danger-full-access') return 'full';
  if (settings.profileId === ':read-only') return 'readOnly';
  if (
    settings.profileId === ':workspace' &&
    settings.approvalsReviewer === 'auto_review'
  ) {
    return 'auto';
  }
  if (settings.profileId === ':workspace') return 'ask';
  return `profile:${settings.profileId}`;
}

function permissionModeLabel(mode: PermissionModeId) {
  if (mode === 'ask') return '请求审批';
  if (mode === 'auto') return '替我审批';
  if (mode === 'full') return '完全访问';
  if (mode === 'readOnly') return '只读访问';
  return mode.slice('profile:'.length);
}

function collaborationModeForTurn(
  mode: CodexCollaborationModeKind,
  model: string,
  effort: CodexReasoningEffort,
  availableModes: CodexCollaborationModeMask[],
): CodexCollaborationMode | null {
  if (
    !model ||
    !availableModes.some((candidate) => candidate.mode === mode)
  ) {
    return null;
  }
  return {
    mode,
    settings: {
      developer_instructions: null,
      model,
      reasoning_effort: mode === 'plan' ? 'medium' : effort,
    },
  };
}

export function AiPanel({
  activeDrawing = null,
  currentDocument,
  currentDocumentPath,
  documents,
  drawings = [],
  workspaceRootPath,
  getActiveEditorAiEditController = () => null,
  onBeforeTurnStart,
  onDrawingToolCall,
  onAskAiHandlerChange = () => undefined,
  onOpenDocument,
  onOpenPlanPreview,
  onOpenCodexSettings,
  onWorkspaceChanged,
  presentation = 'panel',
}: AiPanelProps) {
  const {
    confirm: confirmAction,
    request: confirmationRequest,
    resolve: resolveConfirmation,
  } = useConfirmationDialog();
  const [view, setView] = React.useState<PanelView>('chat');
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<RuntimeStatus>('loading');
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<CodexAccountResponse['account']>(null);
  const [authRequired, setAuthRequired] = React.useState(false);
  const [models, setModels] = React.useState<CodexModel[]>([]);
  const [modelCatalogStatus, setModelCatalogStatus] =
    React.useState<ControlLoadStatus>('idle');
  const [selectedModel, setSelectedModel] = React.useState<string>('');
  const [effort, setEffort] = React.useState<CodexReasoningEffort>('medium');
  const [collaborationModeStatus, setCollaborationModeStatus] =
    React.useState<ControlLoadStatus>('idle');
  const [collaborationModes, setCollaborationModes] = React.useState<
    CodexCollaborationModeMask[]
  >([]);
  const [collaborationMode, setCollaborationMode] =
    React.useState<CodexCollaborationModeKind>('default');
  const [planImplementation, setPlanImplementation] =
    React.useState<AiProposedPlan | null>(null);
  const [goalFeatureAvailable, setGoalFeatureAvailable] = React.useState(false);
  const [goalDraftMode, setGoalDraftMode] = React.useState(false);
  const [threadGoals, setThreadGoals] = React.useState<
    Record<string, CodexThreadGoal>
  >({});
  const [goalObservedAt, setGoalObservedAt] = React.useState<
    Record<string, number>
  >({});
  const [goalUpdating, setGoalUpdating] = React.useState(false);
  const [threads, setThreads] = React.useState<CodexThread[]>([]);
  const [threadListStatus, setThreadListStatus] =
    React.useState<ControlLoadStatus>('idle');
  const [activeThread, setActiveThread] = React.useState<CodexThread | null>(null);
  const [activeThreadSupportsDrawing, setActiveThreadSupportsDrawing] =
    React.useState(true);
  const [conversation, setConversation] = React.useState<AiConversationState>(
    createEmptyConversation,
  );
  const [permissionProfiles, setPermissionProfiles] = React.useState<
    CodexPermissionProfileSummary[]
  >([]);
  const [permissionSettings, setPermissionSettings] = React.useState<PermissionSettings>(
    DEFAULT_PERMISSION_SETTINGS,
  );
  const [permissionUpdating, setPermissionUpdating] = React.useState(false);
  const [autoReviewAvailable, setAutoReviewAvailable] = React.useState(false);
  const [approvalPolicyAvailability, setApprovalPolicyAvailability] = React.useState({
    never: true,
    onRequest: true,
  });
  const [composerValue, setComposerValue] = React.useState('');
  const [selectedMentions, setSelectedMentions] = React.useState<
    AiComposerMention[]
  >([]);
  const [selectedAttachments, setSelectedAttachments] = React.useState<
    CodexContextAttachment[]
  >([]);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = React.useState<
    Record<string, string>
  >({});
  const [pluginStatus, setPluginStatus] =
    React.useState<ControlLoadStatus>('idle');
  const [pluginOptions, setPluginOptions] = React.useState<
    AiPluginMentionOption[]
  >([]);
  const [pluginLoadWarning, setPluginLoadWarning] = React.useState<string | null>(
    null,
  );
  const [skillStatus, setSkillStatus] =
    React.useState<ControlLoadStatus>('idle');
  const [skillOptions, setSkillOptions] = React.useState<
    AiSkillMentionOption[]
  >([]);
  const [composerSkillInsertRequest, setComposerSkillInsertRequest] =
    React.useState<ComposerSkillInsertRequest | null>(null);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [inlineAiRunning, setInlineAiRunning] = React.useState(false);
  const [threadTokenUsage, setThreadTokenUsage] = React.useState<
    Record<string, CodexThreadTokenUsage>
  >({});
  const [compactingThreadId, setCompactingThreadId] = React.useState<
    string | null
  >(null);
  const [signingIn, setSigningIn] = React.useState(false);
  const [followLatestRequest, setFollowLatestRequest] = React.useState(0);
  const [composerFocusRequest, setComposerFocusRequest] = React.useState(0);
  const modelSelectionInitializedRef = React.useRef(false);
  const activeThreadIdRef = React.useRef<string | null>(null);
  const onWorkspaceChangedRef = React.useRef(onWorkspaceChanged);
  const onDrawingToolCallRef = React.useRef(onDrawingToolCall);
  const runtimeReadyPromiseRef = React.useRef<Promise<void> | null>(null);
  const runtimeStatusRef = React.useRef<RuntimeStatus>('loading');
  const authRequiredRef = React.useRef(false);
  const selectedModelRef = React.useRef('');
  const effortRef = React.useRef<CodexReasoningEffort>('medium');
  const collaborationModeRef =
    React.useRef<CodexCollaborationModeKind>('default');
  const collaborationModesRef = React.useRef<CodexCollaborationModeMask[]>([]);
  const previousDefaultEffortRef = React.useRef<CodexReasoningEffort>('medium');
  const turnModesRef = React.useRef(new Map<string, CodexCollaborationModeKind>());
  const completedPlansRef = React.useRef(new Map<string, AiProposedPlan>());
  const conversationRef = React.useRef<AiConversationState>(createEmptyConversation());
  const permissionSettingsRef = React.useRef(DEFAULT_PERMISSION_SETTINGS);
  const submittingRef = React.useRef(false);
  const runtimeGenerationRef = React.useRef(0);
  const pluginLoadGenerationRef = React.useRef<number | null>(null);
  const skillRootRegistrationRef = React.useRef<{
    generation: number;
    promise: Promise<void>;
  } | null>(null);
  const skillLoadRequestRef = React.useRef(0);
  const composerSkillInsertRequestIdRef = React.useRef(0);
  const selectedAttachmentsRef = React.useRef<CodexContextAttachment[]>([]);
  const attachmentPreviewUrlsRef = React.useRef<Record<string, string>>({});
  const loadingAttachmentPreviewsRef = React.useRef(new Set<string>());
  const attachmentPreviewMountedRef = React.useRef(true);
  const threadTokenUsageRef = React.useRef<
    Record<string, CodexThreadTokenUsage>
  >({});
  const compactingThreadIdRef = React.useRef<string | null>(null);
  const preferNewChatRef = React.useRef(false);
  const autoResumeInFlightRef = React.useRef(false);
  const goalDraftModeRef = React.useRef(false);
  const threadGoalsRef = React.useRef<Record<string, CodexThreadGoal>>({});
  const dynamicToolRequestsRef = React.useRef(new Set<string>());
  const inlineAiRunnerRef = React.useRef<CodexInlineAiRunner | null>(null);
  const getInlineAiRuntime = React.useCallback(
    () => {
      if (runtimeStatusRef.current !== 'ready' || authRequiredRef.current) {
        throw new Error('Codex 运行时当前不可用。');
      }
      if (!workspaceRootPath) {
        throw new Error('请先打开一个工作区。');
      }
      return {
        effort:
          collaborationModeRef.current === 'plan'
            ? previousDefaultEffortRef.current
            : effortRef.current,
        model: selectedModelRef.current,
        workspaceRootPath,
      };
    },
    [workspaceRootPath],
  );

  React.useEffect(() => {
    const runner = new CodexInlineAiRunner({
      getRuntime: getInlineAiRuntime,
      onBusyChange: setInlineAiRunning,
      onDiagnostic: setRuntimeError,
    });
    inlineAiRunnerRef.current = runner;
    return () => {
      if (inlineAiRunnerRef.current === runner) {
        inlineAiRunnerRef.current = null;
      }
      runner.dispose();
    };
  }, [getInlineAiRuntime]);

  const runMarkweaveAskAi = React.useCallback<MarkweaveAskAiHandler>(
    (request) => {
      const runner = inlineAiRunnerRef.current;
      if (!runner) {
        throw new Error('Codex 内联预编辑尚未就绪。');
      }
      return runner.runAskAi(request);
    },
    [],
  );
  const inlinePermissionAvailable =
    approvalPolicyAvailability.onRequest &&
    permissionProfiles.some(
      (profile) => profile.id === ':read-only' && profile.allowed,
    );

  React.useEffect(() => {
    const handler =
      runtimeStatus === 'ready' &&
      !authRequired &&
      workspaceRootPath &&
      inlinePermissionAvailable
        ? runMarkweaveAskAi
        : null;
    onAskAiHandlerChange(handler);
    return () => onAskAiHandlerChange(null);
  }, [
    authRequired,
    inlinePermissionAvailable,
    onAskAiHandlerChange,
    runMarkweaveAskAi,
    runtimeStatus,
    workspaceRootPath,
  ]);

  React.useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? null;
  }, [activeThread?.id]);

  React.useEffect(() => {
    onWorkspaceChangedRef.current = onWorkspaceChanged;
  }, [onWorkspaceChanged]);

  React.useEffect(() => {
    onDrawingToolCallRef.current = onDrawingToolCall;
  }, [onDrawingToolCall]);

  React.useEffect(() => {
    authRequiredRef.current = authRequired;
  }, [authRequired]);

  React.useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  React.useEffect(() => {
    effortRef.current = effort;
  }, [effort]);

  React.useEffect(() => {
    collaborationModeRef.current = collaborationMode;
  }, [collaborationMode]);

  React.useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  React.useEffect(() => {
    attachmentPreviewUrlsRef.current = attachmentPreviewUrls;
  }, [attachmentPreviewUrls]);

  React.useEffect(() => {
    attachmentPreviewMountedRef.current = true;
    return () => {
      attachmentPreviewMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const previewAttachments = selectedAttachments.filter(
      (attachment) => attachment.previewAvailable,
    );
    for (const attachment of previewAttachments) {
      if (
        attachmentPreviewUrlsRef.current[attachment.attachmentId] ||
        loadingAttachmentPreviewsRef.current.has(attachment.attachmentId)
      ) {
        continue;
      }
      loadingAttachmentPreviewsRef.current.add(attachment.attachmentId);
      void readCodexContextAttachmentPreview(attachment.attachmentId)
        .then((bytes) => {
          if (
            !attachmentPreviewMountedRef.current ||
            !selectedAttachmentsRef.current.some(
              (candidate) => candidate.attachmentId === attachment.attachmentId,
            )
          ) {
            return;
          }
          const previewUrl = bytesToDataUrl(
            bytes,
            attachment.previewMediaType ?? 'image/png',
          );
          setAttachmentPreviewUrls((current) => ({
            ...current,
            [attachment.attachmentId]: previewUrl,
          }));
        })
        .catch((error) => {
          if (
            attachmentPreviewMountedRef.current &&
            selectedAttachmentsRef.current.some(
              (candidate) => candidate.attachmentId === attachment.attachmentId,
            )
          ) {
            setRuntimeError(getErrorMessage(error));
          }
        })
        .finally(() => {
          loadingAttachmentPreviewsRef.current.delete(attachment.attachmentId);
        });
    }
  }, [selectedAttachments]);

  React.useEffect(() => {
    permissionSettingsRef.current = permissionSettings;
  }, [permissionSettings]);

  React.useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  React.useEffect(() => {
    goalDraftModeRef.current = goalDraftMode;
  }, [goalDraftMode]);

  const updateThreadGoal = React.useCallback(
    (threadId: string, goal: CodexThreadGoal | null) => {
      const next = { ...threadGoalsRef.current };
      if (goal) {
        next[threadId] = goal;
      } else {
        delete next[threadId];
      }
      threadGoalsRef.current = next;
      setThreadGoals(next);
      setGoalObservedAt((current) => {
        const observed = { ...current };
        if (goal) {
          observed[threadId] = Date.now();
        } else {
          delete observed[threadId];
        }
        return observed;
      });
    },
    [],
  );

  const updateThreadTokenUsage = React.useCallback(
    (
      update: (
        current: Record<string, CodexThreadTokenUsage>,
      ) => Record<string, CodexThreadTokenUsage>,
    ) => {
      const next = update(threadTokenUsageRef.current);
      threadTokenUsageRef.current = next;
      setThreadTokenUsage(next);
    },
    [],
  );

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
    const excludedPaths = new Set(
      selectedMentions
        .filter(isDocumentComposerMention)
        .map((document) => document.absolutePath),
    );
    return rankMentionDocuments(documents, mentionQuery ?? '', {
      excludedPaths,
      preferredPath: currentDocument?.absolutePath,
    });
  }, [currentDocument, documents, mentionQuery, selectedMentions]);

  const filteredMentionDrawings = React.useMemo(() => {
    const excludedPaths = new Set(
      selectedMentions
        .filter(isDrawingComposerMention)
        .map((drawing) => drawing.path),
    );
    return rankMentionDocuments(
      drawings.map((drawing) => ({
        ...drawing,
        absolutePath: createDrawingMentionPath(drawing.id),
        name: drawing.title,
        relativePath: drawing.albumPath || '未归类',
      })),
      mentionQuery ?? '',
      {
        excludedPaths,
        preferredPath: activeDrawing
          ? createDrawingMentionPath(activeDrawing.id)
          : null,
      },
    ).map((drawing) => ({
      albumPath: drawing.albumPath,
      drawingKind: drawing.drawingKind,
      itemCount: drawing.itemCount,
      hasPreview: drawing.hasPreview,
      id: drawing.id,
      revision: drawing.revision,
      title: drawing.title,
    }));
  }, [activeDrawing, drawings, mentionQuery, selectedMentions]);

  const openMention = React.useCallback(
    (path: string) => {
      const drawingId = parseDrawingMentionPath(path);
      if (drawingId) {
        window.dispatchEvent(
          new CustomEvent('markune:open-drawing', { detail: { drawingId } }),
        );
        return;
      }
      onOpenDocument(path);
    },
    [onOpenDocument],
  );

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
  const activeTaskProgress = React.useMemo(
    () => selectActiveTaskProgress(conversation, workspaceRootPath),
    [conversation, workspaceRootPath],
  );
  const planModeAvailable = React.useMemo(
    () =>
      collaborationModeStatus === 'ready' &&
      collaborationModes.some((mode) => mode.mode === 'plan') &&
      collaborationModes.some((mode) => mode.mode === 'default') &&
      Boolean(
        selectedModelInfo?.supportedReasoningEfforts.some(
          (option) => option.reasoningEffort === 'medium',
        ),
      ),
    [collaborationModeStatus, collaborationModes, selectedModelInfo],
  );
  const planModeUnavailableReason =
    collaborationModeStatus === 'loading'
      ? '正在加载计划模式'
      : collaborationModeStatus === 'error' ||
          !collaborationModes.some((mode) => mode.mode === 'plan') ||
          !collaborationModes.some((mode) => mode.mode === 'default')
        ? '当前 Codex 不支持计划模式'
        : modelCatalogStatus === 'loading'
          ? '正在加载模型'
          : !selectedModelInfo?.supportedReasoningEfforts.some(
                (option) => option.reasoningEffort === 'medium',
              )
            ? '当前模型不支持中等推理'
            : null;
  const modeSwitchDisabled =
    Boolean(conversation.activeTurnId) ||
    conversation.approvals.length > 0 ||
    conversation.userInputRequests.length > 0 ||
    submitting;
  const activeThreadTokenUsage = activeThread
    ? threadTokenUsage[activeThread.id] ?? null
    : null;
  const activeGoal = activeThread ? threadGoals[activeThread.id] ?? null : null;
  const activeGoalObservedAt = activeThread
    ? goalObservedAt[activeThread.id] ?? (activeGoal?.updatedAt ?? 0) * 1_000
    : 0;
  const goalEntryUnavailableReason =
    runtimeStatus !== 'ready'
      ? 'Codex 运行时尚未就绪'
      : !goalFeatureAvailable
        ? '当前 Codex 不支持目标模式'
        : modeSwitchDisabled && !activeGoal
          ? '当前任务运行中'
          : null;
  const compactUnavailableReason = !activeThread
    ? '当前任务尚未建立上下文'
    : runtimeStatus !== 'ready'
      ? 'Codex 运行时尚未就绪'
      : authRequired
        ? '请先登录 ChatGPT'
        : compactingThreadId === activeThread.id
          ? '正在压缩上下文'
          : conversation.activeTurnId
            ? '当前任务运行中'
            : conversation.approvals.length > 0
              ? '请先处理审批请求'
              : conversation.userInputRequests.length > 0
                ? '请先回答 Codex 的问题'
                : submitting
                  ? '正在提交消息'
                  : null;
  const inlinePreeditUnavailableReason = inlineAiRunning
    ? '已有 AI 预编辑任务正在运行'
    : runtimeStatus !== 'ready'
      ? 'Codex 运行时尚未就绪'
      : authRequired
        ? '请先登录 ChatGPT'
        : !inlinePermissionAvailable
          ? '当前 Codex 策略不允许只读预编辑'
          : !workspaceRootPath
            ? '请先打开一个工作区'
            : !currentDocument || !currentDocumentPath
              ? '请先打开可编辑的 Markdown 文档'
              : collaborationMode === 'plan'
                ? '计划模式不支持选区预编辑'
                : goalDraftMode || Boolean(activeGoal)
                  ? '目标模式不支持选区预编辑'
                  : selectedAttachments.length > 0
                    ? '选区预编辑不接受附件'
                    : selectedMentions.length > 0
                      ? '选区预编辑不接受 mention、Plugin 或 Skill'
                      : !composerValue.trim()
                        ? '请先输入修改指令'
                        : null;

  const setGoalStatus = React.useCallback(
    async (status: 'active' | 'paused') => {
      const goal = activeThreadIdRef.current
        ? threadGoalsRef.current[activeThreadIdRef.current]
        : null;
      if (!goal || goalUpdating) return;
      setGoalUpdating(true);
      setRuntimeError(null);
      try {
        const response =
          await codexAppServerClient.request<CodexThreadGoalSetResponse>(
            'thread/goal/set',
            { status, threadId: goal.threadId },
          );
        updateThreadGoal(goal.threadId, response.goal);
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      } finally {
        setGoalUpdating(false);
      }
    },
    [goalUpdating, updateThreadGoal],
  );

  const updateGoalObjective = React.useCallback(
    async (objective: string) => {
      const goal = activeThreadIdRef.current
        ? threadGoalsRef.current[activeThreadIdRef.current]
        : null;
      const trimmed = objective.trim();
      if (
        !goal ||
        goalUpdating ||
        !trimmed ||
        Array.from(trimmed).length > GOAL_OBJECTIVE_MAX_LENGTH
      ) {
        return false;
      }
      setGoalUpdating(true);
      setRuntimeError(null);
      try {
        const shouldReactivate =
          goal.status === 'complete' || goal.status === 'budgetLimited';
        const response =
          await codexAppServerClient.request<CodexThreadGoalSetResponse>(
            'thread/goal/set',
            {
              objective: trimmed,
              ...(shouldReactivate ? { status: 'active' } : {}),
              threadId: goal.threadId,
            },
          );
        updateThreadGoal(goal.threadId, response.goal);
        return true;
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
        return false;
      } finally {
        setGoalUpdating(false);
      }
    },
    [goalUpdating, updateThreadGoal],
  );

  const clearGoal = React.useCallback(async () => {
    const goal = activeThreadIdRef.current
      ? threadGoalsRef.current[activeThreadIdRef.current]
      : null;
    if (!goal || goalUpdating) return;
    setGoalUpdating(true);
    setRuntimeError(null);
    try {
      const response =
        await codexAppServerClient.request<CodexThreadGoalClearResponse>(
          'thread/goal/clear',
          { threadId: goal.threadId },
        );
      if (response.cleared) {
        updateThreadGoal(goal.threadId, null);
      }
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
    } finally {
      setGoalUpdating(false);
    }
  }, [goalUpdating, updateThreadGoal]);

  const changeCollaborationMode = React.useCallback(
    (nextMode: CodexCollaborationModeKind) => {
      if (modeSwitchDisabled || nextMode === collaborationModeRef.current) return;
      if (nextMode === 'plan') {
        if (!planModeAvailable) return;
        previousDefaultEffortRef.current = effortRef.current;
        effortRef.current = 'medium';
        setEffort('medium');
      } else {
        const selected = models.find(
          (model) => model.model === selectedModelRef.current,
        );
        const previous = previousDefaultEffortRef.current;
        const restored = selected?.supportedReasoningEfforts.some(
          (option) => option.reasoningEffort === previous,
        )
          ? previous
          : selected?.defaultReasoningEffort ?? 'medium';
        effortRef.current = restored;
        setEffort(restored);
        setPlanImplementation(null);
      }
      collaborationModeRef.current = nextMode;
      setCollaborationMode(nextMode);
    }, [modeSwitchDisabled, models, planModeAvailable],
  );

  const changeGoalMode = React.useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        if (!activeGoal) {
          goalDraftModeRef.current = false;
          setGoalDraftMode(false);
        }
        return;
      }
      if (activeGoal) {
        setComposerFocusRequest((current) => current + 1);
        return;
      }
      if (!goalFeatureAvailable || modeSwitchDisabled) return;
      if (collaborationModeRef.current === 'plan') {
        changeCollaborationMode('default');
      }
      goalDraftModeRef.current = true;
      setGoalDraftMode(true);
      setComposerFocusRequest((current) => current + 1);
    },
    [activeGoal, changeCollaborationMode, goalFeatureAvailable, modeSwitchDisabled],
  );

  const resetToDefaultMode = React.useCallback(() => {
    if (collaborationModeRef.current === 'plan') {
      const selected = models.find(
        (model) => model.model === selectedModelRef.current,
      );
      const previous = previousDefaultEffortRef.current;
      const restored = selected?.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === previous,
      )
        ? previous
        : selected?.defaultReasoningEffort ?? 'medium';
      effortRef.current = restored;
      setEffort(restored);
    }
    collaborationModeRef.current = 'default';
    setCollaborationMode('default');
    setPlanImplementation(null);
    turnModesRef.current.clear();
    completedPlansRef.current.clear();
  }, [models]);

  const loadCoreControlData = React.useCallback(async (
    generation = runtimeGenerationRef.current,
  ) => {
    if (!workspaceRootPath) {
      return;
    }

    const [
      accountResponse,
      permissionResponse,
      requirementsResponse,
      featureResponse,
    ] =
      await Promise.all([
        codexAppServerClient.request<CodexAccountResponse>('account/read', {
          refreshToken: false,
        }),
        codexAppServerClient
          .request<CodexPermissionProfileListResponse>('permissionProfile/list', {
            cwd: workspaceRootPath,
            limit: 100,
          })
          .catch(() => ({ data: [], nextCursor: null })),
        codexAppServerClient
          .request<CodexConfigRequirementsResponse>('configRequirements/read')
          .catch(() => ({ requirements: null })),
        codexAppServerClient
          .request<CodexExperimentalFeatureListResponse>('experimentalFeature/list', {
            limit: 100,
          })
          .catch(() => ({ data: [], nextCursor: null })),
      ]);

    if (generation !== runtimeGenerationRef.current) return;

    setAccount(accountResponse.account);
    const requiresAuth =
      accountResponse.requiresOpenaiAuth && !accountResponse.account;
    authRequiredRef.current = requiresAuth;
    setAuthRequired(requiresAuth);
    const profileRequirements =
      requirementsResponse.requirements?.allowedPermissionProfiles;
    const profiles = permissionResponse.data.map((profile) => ({
      ...profile,
      allowed:
        profile.allowed && profileRequirements?.[profile.id] !== false,
    }));
    if (profileRequirements) {
      for (const [id, allowed] of Object.entries(profileRequirements)) {
        if (!profiles.some((profile) => profile.id === id)) {
          profiles.push({ allowed, description: null, id });
        }
      }
    }
    setPermissionProfiles(profiles);
    const allowedPolicies =
      requirementsResponse.requirements?.allowedApprovalPolicies?.filter(
        (policy): policy is string => typeof policy === 'string',
      );
    setApprovalPolicyAvailability({
      never: !allowedPolicies || allowedPolicies.includes('never'),
      onRequest: !allowedPolicies || allowedPolicies.includes('on-request'),
    });
    const guardianEnabled = featureResponse.data.some(
      (feature) => feature.name === 'guardian_approval' && feature.enabled,
    );
    const allowedReviewers =
      requirementsResponse.requirements?.allowedApprovalsReviewers;
    setAutoReviewAvailable(
      guardianEnabled &&
        (!allowedReviewers || allowedReviewers.includes('auto_review')),
    );
    setGoalFeatureAvailable(
      featureResponse.data.some(
        (feature) => feature.name === 'goals' && feature.enabled,
      ),
    );

  }, [workspaceRootPath]);

  const loadModelCatalog = React.useCallback(async (
    generation = runtimeGenerationRef.current,
  ) => {
    if (generation !== runtimeGenerationRef.current) return;
    setModelCatalogStatus('loading');
    try {
      const response = await codexAppServerClient.request<CodexModelListResponse>(
        'model/list',
        { includeHidden: false, limit: 100 },
      );
      if (generation !== runtimeGenerationRef.current) return;
      setModels(response.data);
      const defaultModel =
        response.data.find((model) => model.isDefault) ?? response.data[0];
      if (defaultModel && !modelSelectionInitializedRef.current) {
        modelSelectionInitializedRef.current = true;
        selectedModelRef.current = defaultModel.model;
        effortRef.current = defaultModel.defaultReasoningEffort;
        setSelectedModel(defaultModel.model);
        setEffort(defaultModel.defaultReasoningEffort);
      }
      setModelCatalogStatus('ready');
    } catch {
      if (generation !== runtimeGenerationRef.current) return;
      setModelCatalogStatus('error');
    }
  }, []);

  const loadCollaborationModes = React.useCallback(async (
    generation = runtimeGenerationRef.current,
  ) => {
    if (generation !== runtimeGenerationRef.current) return;
    setCollaborationModeStatus('loading');
    try {
      const response =
        await codexAppServerClient.request<CodexCollaborationModeListResponse>(
          'collaborationMode/list',
        );
      if (generation !== runtimeGenerationRef.current) return;
      collaborationModesRef.current = response.data.filter(
        (mode) => mode.mode === 'default' || mode.mode === 'plan',
      );
      setCollaborationModes(collaborationModesRef.current);
      setCollaborationModeStatus('ready');
    } catch {
      if (generation !== runtimeGenerationRef.current) return;
      collaborationModesRef.current = [];
      setCollaborationModes([]);
      setCollaborationModeStatus('error');
    }
  }, []);

  const loadThreadHistory = React.useCallback(async (
    generation = runtimeGenerationRef.current,
  ) => {
    if (!workspaceRootPath) return;
    if (generation !== runtimeGenerationRef.current) return;
    setThreadListStatus('loading');
    try {
      const response = await codexAppServerClient.request<CodexThreadListResponse>(
        'thread/list',
        {
          cwd: workspaceRootPath,
          limit: 100,
          sortKey: 'updated_at',
          sortDirection: 'desc',
        },
      );
      if (generation !== runtimeGenerationRef.current) return;
      setThreads(response.data);
      setThreadListStatus('ready');
    } catch {
      if (generation !== runtimeGenerationRef.current) return;
      setThreadListStatus('error');
    }
  }, [workspaceRootPath]);

  const detectInstalledPlugins = React.useCallback(async (
    generation = runtimeGenerationRef.current,
  ) => {
    if (
      !workspaceRootPath ||
      runtimeStatusRef.current !== 'ready' ||
      generation !== runtimeGenerationRef.current ||
      pluginLoadGenerationRef.current === generation
    ) {
      return;
    }
    pluginLoadGenerationRef.current = generation;
    setPluginStatus('loading');
    setPluginLoadWarning(null);
    try {
      const response =
        await codexAppServerClient.request<CodexPluginInstalledResponse>(
          'plugin/installed',
          {
            cwds: [workspaceRootPath],
            installSuggestionPluginNames: [],
          },
        );
      if (generation !== runtimeGenerationRef.current) return;
      const localIconCache = new Map<string, Promise<string | null>>();
      const options = await Promise.all(
        response.marketplaces.flatMap((marketplace) =>
          marketplace.plugins
            .filter(
              (plugin) =>
                plugin.installed &&
                plugin.enabled &&
                plugin.availability !== 'DISABLED_BY_ADMIN',
            )
            .map(async (plugin) => {
              const [iconUrl, darkIconUrl] = await Promise.all([
                resolvePluginIconUrl(plugin.interface, 'light', localIconCache),
                resolvePluginIconUrl(plugin.interface, 'dark', localIconCache),
              ]);
              return {
                darkIconUrl,
                description:
                  plugin.interface?.shortDescription?.trim() || marketplace.name,
                displayName:
                  plugin.interface?.displayName?.trim() || plugin.name,
                iconUrl,
                id: plugin.id,
                mentionPath: `plugin://${plugin.id}`,
              };
            }),
        ),
      );
      if (generation !== runtimeGenerationRef.current) return;
      setPluginOptions(uniquePluginOptions(options));
      setPluginLoadWarning(
        response.marketplaceLoadErrors.length > 0
          ? '部分插件来源暂时无法读取。'
          : null,
      );
      setPluginStatus('ready');
    } catch {
      if (generation !== runtimeGenerationRef.current) return;
      pluginLoadGenerationRef.current = null;
      setPluginStatus('error');
    }
  }, [workspaceRootPath]);

  const loadSkills = React.useCallback(async (
    generation = runtimeGenerationRef.current,
    forceReload = false,
  ) => {
    if (
      !workspaceRootPath ||
      runtimeStatusRef.current !== 'ready' ||
      generation !== runtimeGenerationRef.current
    ) {
      return null;
    }
    const requestId = skillLoadRequestRef.current + 1;
    skillLoadRequestRef.current = requestId;
    setSkillStatus('loading');
    try {
      let registration = skillRootRegistrationRef.current;
      if (!registration || registration.generation !== generation) {
        const promise = Promise.resolve()
          .then(() => codexAppServerClient.request('skills/extraRoots/set', {}))
          .then(() => undefined);
        const nextRegistration = { generation, promise };
        skillRootRegistrationRef.current = nextRegistration;
        void promise.catch(() => {
          if (skillRootRegistrationRef.current === nextRegistration) {
            skillRootRegistrationRef.current = null;
          }
        });
        registration = nextRegistration;
      }
      await registration.promise;
      const response = await codexAppServerClient.request<CodexSkillsListResponse>(
        'skills/list',
        { cwds: [workspaceRootPath], forceReload },
      );
      if (
        generation !== runtimeGenerationRef.current ||
        requestId !== skillLoadRequestRef.current
      ) {
        return null;
      }
      const options = uniqueSkillOptions(
        response.data.flatMap((entry) =>
          entry.skills
            .filter((skill) => skill.enabled)
            .map((skill) => ({
              description:
                skill.interface?.shortDescription?.trim() ||
                skill.shortDescription?.trim() ||
                skill.description,
              displayName:
                skill.interface?.displayName?.trim() ||
                formatSkillDisplayName(skill.name),
              name: skill.name,
              path: skill.path,
              scope: skill.scope,
            })),
        ),
      );
      setSkillOptions(options);
      setSkillStatus('ready');
      return options;
    } catch {
      if (
        generation !== runtimeGenerationRef.current ||
        requestId !== skillLoadRequestRef.current
      ) {
        return;
      }
      setSkillStatus('error');
      return null;
    }
  }, [workspaceRootPath]);

  const selectContextAttachments = React.useCallback(
    async (kind: CodexContextAttachment['kind']) => {
      const remaining = 20 - selectedAttachments.length;
      if (remaining <= 0) {
        setRuntimeError('最多附加 20 个文件或文件夹。');
        return;
      }
      try {
        const selected = await selectCodexContextAttachments(kind, remaining);
        if (!selected) return;
        setSelectedAttachments((current) => {
          const next = uniqueContextAttachments([
            ...current,
            ...selected,
          ]).slice(0, 20);
          selectedAttachmentsRef.current = next;
          return next;
        });
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      }
    },
    [selectedAttachments.length],
  );

  const pasteContextAttachments = React.useCallback(async () => {
    const current = selectedAttachmentsRef.current;
    try {
      const selected = await pasteCodexContextAttachments(
        Math.max(1, 20 - current.length),
      );
      if (!selected) return false;

      const next = uniqueContextAttachments([...current, ...selected]);
      if (next.length > 20) {
        const retainedIds = new Set(current.map((item) => item.attachmentId));
        const overflowIds = selected
          .filter((item) => !retainedIds.has(item.attachmentId))
          .map((item) => item.attachmentId);
        void releaseCodexContextAttachments(overflowIds).catch(() => undefined);
        setRuntimeError('最多附加 20 个文件、文件夹或图片。');
        return true;
      }

      selectedAttachmentsRef.current = next;
      setSelectedAttachments(next);
      if (
        selected.some((attachment) => attachment.isImage) &&
        !modelSupportsImages(selectedModelInfo)
      ) {
        setRuntimeError('当前模型不支持图片输入；请选择支持图片的模型后发送。');
      } else {
        setRuntimeError(null);
      }
      return true;
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
      return true;
    }
  }, [selectedModelInfo]);

  const removeContextAttachment = React.useCallback((attachmentId: string) => {
    setSelectedAttachments((current) => {
      const next = current.filter(
        (attachment) => attachment.attachmentId !== attachmentId,
      );
      selectedAttachmentsRef.current = next;
      return next;
    });
    setAttachmentPreviewUrls((current) => {
      if (!current[attachmentId]) return current;
      const next = { ...current };
      delete next[attachmentId];
      return next;
    });
    void releaseCodexContextAttachments([attachmentId]).catch(() => undefined);
  }, []);

  const compactContext = React.useCallback(async () => {
    const threadId = activeThreadIdRef.current;
    if (
      !threadId ||
      runtimeStatusRef.current !== 'ready' ||
      authRequiredRef.current ||
      conversationRef.current.activeTurnId ||
      conversationRef.current.approvals.length > 0 ||
      conversationRef.current.userInputRequests.length > 0 ||
      submittingRef.current ||
      compactingThreadIdRef.current
    ) {
      return;
    }

    const previousUsage = threadTokenUsageRef.current[threadId] ?? null;
    compactingThreadIdRef.current = threadId;
    setCompactingThreadId(threadId);
    updateThreadTokenUsage((current) => {
      const next = { ...current };
      delete next[threadId];
      return next;
    });
    setRuntimeError(null);

    try {
      await codexAppServerClient.request('thread/compact/start', { threadId });
    } catch (error) {
      if (previousUsage) {
        updateThreadTokenUsage((current) => ({
          ...current,
          [threadId]: previousUsage,
        }));
      }
      if (compactingThreadIdRef.current === threadId) {
        compactingThreadIdRef.current = null;
        setCompactingThreadId(null);
      }
      setRuntimeError(getErrorMessage(error));
    }
  }, [updateThreadTokenUsage]);

  React.useEffect(() => {
    const generation = runtimeGenerationRef.current + 1;
    runtimeGenerationRef.current = generation;
    pluginLoadGenerationRef.current = null;
    skillRootRegistrationRef.current = null;
    skillLoadRequestRef.current += 1;
    const nextRuntimeStatus: RuntimeStatus = !workspaceRootPath
      ? 'error'
      : !isTauriRuntime()
        ? 'web'
        : 'loading';
    runtimeStatusRef.current = nextRuntimeStatus;
    queueMicrotask(() => {
      if (generation !== runtimeGenerationRef.current) return;
      setRuntimeStatus(nextRuntimeStatus);
      setRuntimeError(
        workspaceRootPath ? null : '请先打开一个工作区。',
      );
      setThreads([]);
      setActiveThread(null);
      activeThreadIdRef.current = null;
      preferNewChatRef.current = false;
      autoResumeInFlightRef.current = false;
      setConversation(createEmptyConversation());
      setSelectedMentions([]);
      void releaseCodexContextAttachments(
        selectedAttachmentsRef.current.map(
          (attachment) => attachment.attachmentId,
        ),
      ).catch(() => undefined);
      selectedAttachmentsRef.current = [];
      setSelectedAttachments([]);
      setAttachmentPreviewUrls({});
      setComposerValue('');
      setComposerSkillInsertRequest(null);
      permissionSettingsRef.current = DEFAULT_PERMISSION_SETTINGS;
      setPermissionSettings(DEFAULT_PERMISSION_SETTINGS);
      setModelCatalogStatus('idle');
      collaborationModesRef.current = [];
      setCollaborationModes([]);
      setCollaborationModeStatus('idle');
      collaborationModeRef.current = 'default';
      setCollaborationMode('default');
      setPlanImplementation(null);
      setGoalFeatureAvailable(false);
      goalDraftModeRef.current = false;
      setGoalDraftMode(false);
      threadGoalsRef.current = {};
      setThreadGoals({});
      setGoalObservedAt({});
      setGoalUpdating(false);
      turnModesRef.current.clear();
      completedPlansRef.current.clear();
      setThreadListStatus('idle');
      setPluginStatus('idle');
      setPluginOptions([]);
      setPluginLoadWarning(null);
      setSkillStatus('idle');
      setSkillOptions([]);
      threadTokenUsageRef.current = {};
      setThreadTokenUsage({});
      compactingThreadIdRef.current = null;
      setCompactingThreadId(null);
    });
    if (!workspaceRootPath) {
      return;
    }

    if (nextRuntimeStatus === 'web') return;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const unsubscribe = codexAppServerClient.subscribe((message) => {
      if (disposed) {
        return;
      }

      if (
        !shouldRouteCodexMessageToVisibleThread(
          message,
          activeThreadIdRef.current,
        )
      ) {
        return;
      }
      const eventThreadId = codexProtocolThreadId(message);

      const tokenUsageUpdate = threadTokenUsageUpdateFromMessage(message);
      if (tokenUsageUpdate) {
        updateThreadTokenUsage((current) => ({
          ...current,
          [tokenUsageUpdate.threadId]: tokenUsageUpdate.tokenUsage,
        }));
      }

      const goalUpdate = threadGoalUpdateFromMessage(message);
      if (goalUpdate?.type === 'updated') {
        updateThreadGoal(goalUpdate.threadId, goalUpdate.goal);
        goalDraftModeRef.current = false;
        setGoalDraftMode(false);
      } else if (goalUpdate?.type === 'cleared') {
        updateThreadGoal(goalUpdate.threadId, null);
      }

      const item = message.params?.item;
      const itemRecord =
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      if (
        message.method === 'item/started' &&
        itemRecord?.type === 'contextCompaction' &&
        eventThreadId
      ) {
        updateThreadTokenUsage((current) => {
          const next = { ...current };
          delete next[eventThreadId];
          return next;
        });
      }
      if (
        ((message.method === 'item/completed' &&
          itemRecord?.type === 'contextCompaction') ||
          message.method === 'thread/compacted') &&
        eventThreadId &&
        compactingThreadIdRef.current === eventThreadId
      ) {
        compactingThreadIdRef.current = null;
        setCompactingThreadId(null);
      }

      if (message.method === 'item/completed') {
        const turnId = message.params?.turnId;
        if (
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          (item as Record<string, unknown>).type === 'plan' &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).text === 'string' &&
          typeof turnId === 'string'
        ) {
          completedPlansRef.current.set(turnId, {
            historical: false,
            id: (item as Record<string, unknown>).id as string,
            status: 'completed',
            text: (item as Record<string, unknown>).text as string,
            turnId,
          });
        }
      }

      if (message.method === 'turn/completed') {
        const turn = message.params?.turn;
        const turnId =
          turn && typeof turn === 'object' && !Array.isArray(turn)
            ? (turn as Record<string, unknown>).id
            : message.params?.turnId;
        const turnStatus =
          turn && typeof turn === 'object' && !Array.isArray(turn)
            ? (turn as Record<string, unknown>).status
            : null;
        if (typeof turnId === 'string') {
          const plan = completedPlansRef.current.get(turnId);
          if (
            turnStatus === 'completed' &&
            turnModesRef.current.get(turnId) === 'plan' &&
            plan
          ) {
            setPlanImplementation(plan);
            setFollowLatestRequest((current) => current + 1);
          }
          turnModesRef.current.delete(turnId);
        }
        if (
          eventThreadId &&
          compactingThreadIdRef.current === eventThreadId
        ) {
          compactingThreadIdRef.current = null;
          setCompactingThreadId(null);
        }
      }

      setConversation((current) =>
        reduceCodexProtocolMessage(current, message, workspaceRootPath),
      );

      const threadNameUpdate = threadNameUpdateFromMessage(message);
      if (threadNameUpdate) {
        applyThreadName(threadNameUpdate.threadId, threadNameUpdate.name);
      }

      if (message.method === 'markune/runtime/exited') {
        window.dispatchEvent(new Event('markune:codex-runtime-stopped'));
        setPlanImplementation(null);
        goalDraftModeRef.current = false;
        setGoalDraftMode(false);
        threadGoalsRef.current = {};
        setThreadGoals({});
        setGoalObservedAt({});
        setGoalUpdating(false);
        compactingThreadIdRef.current = null;
        setCompactingThreadId(null);
        codexAppServerClient.rejectPending(
          new Error('Codex App Server 已停止'),
        );
        runtimeStatusRef.current = 'error';
        setRuntimeStatus('error');
        setRuntimeError('Codex App Server 已停止，请关闭并重新打开 AI 面板。');
      }

      if (
        message.method === 'account/login/completed' ||
        message.method === 'account/updated'
      ) {
        void loadCoreControlData(generation)
          .then(() =>
            Promise.allSettled([
              loadModelCatalog(generation),
              loadCollaborationModes(generation),
              loadThreadHistory(generation),
              detectInstalledPlugins(generation),
              loadSkills(generation),
            ]),
          )
          .catch(() => undefined);
      }

      if (message.method === 'skills/changed') {
        void loadSkills(generation, true);
      }

      if (message.method === 'item/tool/call' && message.id !== undefined) {
        const requestKey = String(message.id);
        if (!dynamicToolRequestsRef.current.has(requestKey)) {
          dynamicToolRequestsRef.current.add(requestKey);
          const request = message.params as unknown as CodexDynamicToolRequest;
          void (async () => {
            try {
              const response = onDrawingToolCallRef.current
                ? await onDrawingToolCallRef.current(request)
                : {
                    success: false,
                    text: '当前 Markune 窗口未启用 AI 画图工具。请在新任务中重试。',
                  };
              await respondToCodexDynamicTool(message.id!, response);
            } catch (error) {
              await respondToCodexDynamicTool(message.id!, {
                success: false,
                text: getErrorMessage(error),
              }).catch(() => undefined);
            } finally {
              dynamicToolRequestsRef.current.delete(requestKey);
            }
          })();
        }
      }

      const workspaceChange = workspaceChangeEventFromProtocolMessage(
        message,
        workspaceRootPath,
      );
      if (workspaceChange) {
        void onWorkspaceChangedRef.current(workspaceChange);
      }

      if (
        message.method === 'thread/settings/updated' &&
        message.params?.threadId === activeThreadIdRef.current
      ) {
        const settings = permissionSettingsFromProtocol(
          message.params.threadSettings,
        );
        if (settings) {
          permissionSettingsRef.current = settings;
          setPermissionSettings(settings);
        }
      }
    });

    const bootstrap = (async () => {
      const activeUnlisten = await listenCodexEventsUntilDisposed(
        (message) => codexAppServerClient.handleMessage(message),
        () => disposed,
      );
      if (!activeUnlisten) return;
      unlisten = activeUnlisten;
      await startCodexRuntime(workspaceRootPath);
      if (disposed) return;
      await loadCoreControlData(generation);
      if (disposed) return;
      runtimeStatusRef.current = 'ready';
      setRuntimeStatus('ready');
      void loadModelCatalog(generation);
      void loadCollaborationModes(generation);
      void loadThreadHistory(generation);
      void detectInstalledPlugins(generation);
      void loadSkills(generation);
    })();
    runtimeReadyPromiseRef.current = bootstrap;

    void (async () => {
      try {
        await bootstrap;
      } catch (error) {
        if (!disposed) {
          runtimeStatusRef.current = 'error';
          setRuntimeStatus('error');
          setRuntimeError(getErrorMessage(error));
        }
      }
    })();

    return () => {
      disposed = true;
      if (runtimeReadyPromiseRef.current === bootstrap) {
        runtimeReadyPromiseRef.current = null;
      }
      unlisten?.();
      unsubscribe();
    };
  }, [
    applyThreadName,
    detectInstalledPlugins,
    loadCollaborationModes,
    loadCoreControlData,
    loadModelCatalog,
    loadSkills,
    loadThreadHistory,
    updateThreadGoal,
    updateThreadTokenUsage,
    workspaceRootPath,
  ]);

  const resetActiveConversation = React.useCallback(() => {
    void releaseCodexContextAttachments(
      selectedAttachmentsRef.current.map(
        (attachment) => attachment.attachmentId,
      ),
    ).catch(() => undefined);
    selectedAttachmentsRef.current = [];
    setSelectedAttachments([]);
    setAttachmentPreviewUrls({});
    setActiveThread(null);
    setActiveThreadSupportsDrawing(true);
    activeThreadIdRef.current = null;
    compactingThreadIdRef.current = null;
    setCompactingThreadId(null);
    setConversation(createEmptyConversation());
    setSelectedMentions([]);
    setComposerValue('');
    composerSkillInsertRequestIdRef.current += 1;
    setComposerSkillInsertRequest(null);
    goalDraftModeRef.current = false;
    setGoalDraftMode(false);
    permissionSettingsRef.current = DEFAULT_PERMISSION_SETTINGS;
    setPermissionSettings(DEFAULT_PERMISSION_SETTINGS);
    resetToDefaultMode();
  }, [resetToDefaultMode]);

  const startNewChat = React.useCallback(() => {
    // Explicit "新任务" should stay empty until the user opens history again.
    // author: refinex
    preferNewChatRef.current = true;
    resetActiveConversation();
    setView('chat');
  }, [resetActiveConversation]);

  const startNewDiagram = React.useCallback(() => {
    startNewChat();
    setRuntimeError(null);
    const requestId = composerSkillInsertRequestIdRef.current;
    void (async () => {
      let skill = skillOptions.find(
        (candidate) => candidate.name === 'markune-diagram',
      );
      if (!skill) {
        try {
          await runtimeReadyPromiseRef.current;
        } catch (error) {
          if (requestId === composerSkillInsertRequestIdRef.current) {
            setRuntimeError(getErrorMessage(error));
          }
          return;
        }
        const options = await loadSkills(runtimeGenerationRef.current, true);
        skill = options?.find(
          (candidate) => candidate.name === 'markune-diagram',
        );
      }
      if (requestId !== composerSkillInsertRequestIdRef.current) {
        return;
      }
      if (!skill) {
        setRuntimeError('AI 画图 Skill 加载失败，请重试或重启 Markune。');
        return;
      }
      setComposerSkillInsertRequest({ id: requestId, skill });
      setComposerFocusRequest((current) => current + 1);
    })();
  }, [loadSkills, skillOptions, startNewChat]);

  const startNewMindMap = React.useCallback(() => {
    startNewChat();
    setRuntimeError(null);
    const requestId = composerSkillInsertRequestIdRef.current;
    void (async () => {
      let skill = skillOptions.find(
        (candidate) => candidate.name === 'markune-mindmap',
      );
      if (!skill) {
        try {
          await runtimeReadyPromiseRef.current;
        } catch (error) {
          if (requestId === composerSkillInsertRequestIdRef.current) {
            setRuntimeError(getErrorMessage(error));
          }
          return;
        }
        const options = await loadSkills(runtimeGenerationRef.current, true);
        skill = options?.find(
          (candidate) => candidate.name === 'markune-mindmap',
        );
      }
      if (requestId !== composerSkillInsertRequestIdRef.current) return;
      if (!skill) {
        setRuntimeError('AI 脑图 Skill 加载失败，请重试或重启 Markune。');
        return;
      }
      setComposerSkillInsertRequest({ id: requestId, skill });
      setComposerFocusRequest((current) => current + 1);
    })();
  }, [loadSkills, skillOptions, startNewChat]);

  React.useEffect(() => {
    const startPendingMindMap = () => {
      const targetAlbum = window.sessionStorage.getItem('markune:pending-ai-mindmap');
      if (targetAlbum === null) {
        return;
      }
      window.sessionStorage.removeItem('markune:pending-ai-mindmap');
      window.sessionStorage.setItem('markune:ai-mindmap-target-album', targetAlbum);
      startNewMindMap();
    };
    window.addEventListener('markune:start-ai-mindmap', startPendingMindMap);
    startPendingMindMap();
    return () =>
      window.removeEventListener('markune:start-ai-mindmap', startPendingMindMap);
  }, [startNewMindMap]);

  const openThread = React.useCallback(async (thread: CodexThread) => {
    void releaseCodexContextAttachments(
      selectedAttachmentsRef.current.map(
        (attachment) => attachment.attachmentId,
      ),
    ).catch(() => undefined);
    selectedAttachmentsRef.current = [];
    setSelectedAttachments([]);
    setAttachmentPreviewUrls({});
    setSelectedMentions([]);
    setComposerValue('');
    goalDraftModeRef.current = false;
    setGoalDraftMode(false);
    preferNewChatRef.current = false;
    setRuntimeError(null);
    compactingThreadIdRef.current = null;
    setCompactingThreadId(null);
    resetToDefaultMode();
    setView('chat');
    try {
      const [response, goalResponse] = await Promise.all([
        codexAppServerClient.request<ThreadReadResponse>('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        }),
        goalFeatureAvailable
          ? codexAppServerClient
              .request<CodexThreadGoalGetResponse>('thread/goal/get', {
                threadId: thread.id,
              })
              .catch(() => ({ goal: null }))
          : Promise.resolve({ goal: null }),
      ]);
      updateThreadGoal(thread.id, goalResponse.goal);
      const resumed = await codexAppServerClient.request<ThreadResumeResponse>(
        'thread/resume',
        { threadId: thread.id },
      );
      setActiveThread(response.thread);
      setActiveThreadSupportsDrawing(false);
      activeThreadIdRef.current = response.thread.id;
      const nextPermissionSettings = permissionSettingsFromResponse(resumed);
      permissionSettingsRef.current = nextPermissionSettings;
      setPermissionSettings(nextPermissionSettings);
      setConversation(
        conversationFromThread(response.thread, workspaceRootPath ?? undefined),
      );
    } catch (error) {
      setRuntimeError(getErrorMessage(error));
    }
  }, [goalFeatureAvailable, resetToDefaultMode, updateThreadGoal, workspaceRootPath]);

  React.useEffect(() => {
    if (threadListStatus !== 'ready') {
      return;
    }
    if (preferNewChatRef.current || activeThreadIdRef.current) {
      return;
    }
    if (autoResumeInFlightRef.current) {
      return;
    }
    const latestThread = threads[0];
    if (!latestThread) {
      return;
    }

    // Resume the most recently updated workspace thread on panel/workspace boot.
    // author: refinex
    const timer = window.setTimeout(() => {
      autoResumeInFlightRef.current = true;
      void openThread(latestThread).finally(() => {
        autoResumeInFlightRef.current = false;
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [openThread, threadListStatus, threads]);

  const removeThread = React.useCallback(
    async (thread: CodexThread, action: 'archive' | 'delete') => {
      if (
        action === 'delete' &&
        !(await confirmAction({
          confirmLabel: '永久删除',
          description: '删除后无法恢复这条 Codex 历史记录。',
          title: '永久删除历史记录？',
          variant: 'destructive',
        }))
      ) {
        return;
      }
      const method = action === 'archive' ? 'thread/archive' : 'thread/delete';
      await codexAppServerClient.request(method, { threadId: thread.id });
      setThreads((current) =>
        current.filter((candidate) => candidate.id !== thread.id),
      );
      if (activeThread?.id === thread.id) {
        preferNewChatRef.current = false;
        resetActiveConversation();
        setView('chat');
      }
    },
    [activeThread?.id, confirmAction, resetActiveConversation],
  );

  const sendMessage = React.useCallback(
    async (messageOverride?: string, options: SendMessageOptions = {}) => {
      const composerSnapshot = messageOverride ?? composerValue;
      const text = composerSnapshot.trim();
      const activeDocument = currentDocument;
      const activeDocumentPath = currentDocumentPath;
      const currentDrawing = activeDrawing;
      const attachments = options.planAction
        ? []
        : selectedAttachmentsRef.current;
      const composerMentions = options.planAction ? [] : selectedMentions;
      const needsDrawingTools =
        Boolean(currentDrawing) ||
        composerMentions.some(isDrawingComposerMention);
      const forceNewThread =
        Boolean(options.forceNewThread) ||
        composerMentions.some(
          (mention) =>
            isSkillComposerMention(mention) && mention.name === 'markune-diagram',
        ) ||
        (needsDrawingTools && Boolean(activeThread) && !activeThreadSupportsDrawing);
      const previousConversation = conversationRef.current;
      const previousThread = activeThread;
      const startingGoal =
        !options.planAction &&
        goalDraftModeRef.current &&
        !(
          activeThreadIdRef.current &&
          threadGoalsRef.current[activeThreadIdRef.current]
        );
      let attachmentGrantsDetached = false;
      let turnAccepted = false;
      let createdThread: CodexThread | null = null;
      let createdThreadTitle: string | null = null;
      if (
        (!text && attachments.length === 0) ||
        !workspaceRootPath ||
        submittingRef.current
      ) {
        return;
      }
      if (startingGoal && !text) {
        setRuntimeError('目标不能为空。');
        return;
      }
      if (
        attachments.some((attachment) => attachment.isImage) &&
        !modelSupportsImages(selectedModelInfo)
      ) {
        setRuntimeError('当前模型不支持图片输入；附件和草稿已保留。');
        return;
      }
      if (
        startingGoal &&
        Array.from(text).length > GOAL_OBJECTIVE_MAX_LENGTH
      ) {
        setRuntimeError(`目标不能超过 ${GOAL_OBJECTIVE_MAX_LENGTH} 个字符。`);
        return;
      }

      const clientMessageId = `markune-${Date.now()}`;
      const deliveryStartedAtMs = Date.now();
      const optimisticAttachments = attachments.map((attachment) => ({
        kind: attachment.isImage ? ('image' as const) : attachment.kind,
        mediaType: attachment.mediaType,
        name: attachment.name,
        previewUrl:
          attachmentPreviewUrlsRef.current[attachment.attachmentId] ?? null,
      }));
      const optimisticMentions = composerMentions.map(
        ({ end, kind, label, path, start }) => ({
          end,
          kind,
          label,
          path,
          start,
        }),
      );

      submittingRef.current = true;
      setSubmitting(true);
      setRuntimeError(null);
      setPlanImplementation(null);
      setFollowLatestRequest((current) => current + 1);
      setConversation((current) => {
        const base = forceNewThread ? createEmptyConversation() : current;
        return {
          ...base,
          entries: [
            ...base.entries,
            {
              attachments: optimisticAttachments,
              createdAtMs: deliveryStartedAtMs,
              deliveryError: null,
              deliveryStatus: 'sending',
              type: 'message',
              id: clientMessageId,
              mentions: optimisticMentions,
              role: 'user',
              text,
            },
          ],
        };
      });
      if (!options.planAction) {
        setComposerValue('');
        setSelectedMentions([]);
        selectedAttachmentsRef.current = [];
        setSelectedAttachments([]);
        setMentionQuery(null);
      }
      try {
        if (runtimeStatusRef.current === 'loading') {
          const runtimeReady = runtimeReadyPromiseRef.current;
          if (!runtimeReady) {
            throw new Error('Codex 正在准备，请稍后重试。');
          }
          await runtimeReady;
        }
        if (runtimeStatusRef.current !== 'ready') {
          throw new Error('Codex 运行时当前不可用。');
        }
        if (authRequiredRef.current) {
          throw new Error('请先完成 ChatGPT 登录。');
        }

        if (
          activeDocumentPath &&
          activeDocument?.absolutePath !== activeDocumentPath
        ) {
          throw new Error(
            '当前标签页尚未完成加载，无法安全发送给 Codex。请稍后重试。',
          );
        }

        const ready = await onBeforeTurnStart(
          activeDocumentPath,
          currentDrawing?.id ?? null,
        );
        if (!ready) {
          throw new Error('当前内容保存失败，未发送消息。请先处理保存错误。');
        }

        const documentMentions = composerMentions.filter(
          isDocumentComposerMention,
        );
        const pluginMentions = composerMentions.filter(
          isPluginComposerMention,
        );
        const skillMentions = composerMentions.filter(
          isSkillComposerMention,
        );
        const drawingMentions = composerMentions.filter(
          isDrawingComposerMention,
        );
        const explicitDocuments = uniqueDocuments(documentMentions).filter(
          (document) =>
            document.absolutePath !== activeDocumentPath,
        );
        const explicitDrawings = uniqueDrawings(drawingMentions).filter(
          (drawing) => drawing.id !== currentDrawing?.id,
        );
        const userInput = createComposerAwareUserInput(
          text,
          documentMentions,
          pluginMentions,
          skillMentions,
          drawingMentions,
        );
        const currentPermissionSettings = permissionSettingsRef.current;
        const currentModel = selectedModelRef.current;
        const requestedMode = startingGoal
          ? 'default'
          : options.mode ?? collaborationModeRef.current;
        const selectedModelRecord = models.find(
          (model) => model.model === currentModel,
        );
        const previousEffort = previousDefaultEffortRef.current;
        const restoredDefaultEffort =
          selectedModelRecord?.supportedReasoningEfforts.some(
            (option) => option.reasoningEffort === previousEffort,
          )
            ? previousEffort
            : selectedModelRecord?.defaultReasoningEffort ?? effortRef.current;
        const currentEffort =
          requestedMode === 'plan'
            ? 'medium'
            : collaborationModeRef.current === 'plan'
              ? restoredDefaultEffort
              : effortRef.current;
        let thread = forceNewThread ? null : activeThread;
        if (!thread) {
          const response =
            await codexAppServerClient.request<ThreadStartResponse>(
              'thread/start',
              {
                approvalPolicy: currentPermissionSettings.approvalPolicy,
                approvalsReviewer: currentPermissionSettings.approvalsReviewer,
                config: { web_search: 'live' },
                cwd: workspaceRootPath,
                developerInstructions: DEVELOPER_INSTRUCTIONS,
                ...(currentModel ? { model: currentModel } : {}),
                permissions: currentPermissionSettings.profileId,
                runtimeWorkspaceRoots: [workspaceRootPath],
              },
            );
          const threadTitle = createThreadTitle(
            text || attachments.map((attachment) => attachment.name).join('、'),
          );
          thread = { ...response.thread, name: threadTitle };
          setActiveThreadSupportsDrawing(true);
          createdThread = thread;
          createdThreadTitle = threadTitle;
          const nextPermissionSettings = permissionSettingsFromResponse(response);
          permissionSettingsRef.current = nextPermissionSettings;
          setPermissionSettings(nextPermissionSettings);
          if (!options.forceNewThread) {
            setActiveThread(thread);
            activeThreadIdRef.current = thread.id;
            setThreads((current) => [thread!, ...current]);
            void codexAppServerClient
              .request('thread/name/set', {
                threadId: thread.id,
                name: threadTitle,
              })
              .catch(() => undefined);
          }
        }

        const requestedCollaborationMode = collaborationModeForTurn(
          requestedMode,
          currentModel,
          currentEffort,
          collaborationModesRef.current,
        );
        const response = await codexAppServerClient.request<TurnStartResponse>(
          'turn/start',
          {
            threadId: thread.id,
            clientUserMessageId: clientMessageId,
            input: [
              ...(userInput.text || userInput.textElements.length > 0
                ? [
                    {
                      type: 'text',
                      text: userInput.text,
                      text_elements: userInput.textElements,
                    },
                  ]
                : []),
              ...pluginMentions.map((plugin) => ({
                type: 'mention',
                name: plugin.name,
                path: plugin.path,
              })),
              ...skillMentions.map((skill) => ({
                type: 'skill',
                name: skill.name,
                path: skill.path,
              })),
            ],
            markuneFileAttachments: attachments.map(
              (attachment) => attachment.attachmentId,
            ),
            markuneDocumentReferences: [
              ...(activeDocumentPath
                ? [
                    {
                      path: activeDocumentPath,
                      role: 'active',
                    },
                  ]
                : []),
              ...explicitDocuments.map((document) => ({
                path: document.absolutePath,
                role: 'mention',
              })),
            ],
            markuneDrawingReferences: [
              ...(currentDrawing
                ? [{ drawingId: currentDrawing.id, role: 'active' }]
                : []),
              ...explicitDrawings.map((drawing) => ({
                drawingId: drawing.id,
                role: 'mention',
              })),
            ],
            cwd: workspaceRootPath,
            ...(requestedCollaborationMode
              ? { collaborationMode: requestedCollaborationMode }
              : currentModel
                ? { effort: currentEffort, model: currentModel }
                : {}),
            summary: 'concise',
          },
        );
        turnAccepted = true;
        if (!options.planAction) {
          setAttachmentPreviewUrls({});
          attachmentGrantsDetached = true;
        }
        turnModesRef.current.set(response.turn.id, requestedMode);
        if (options.forceNewThread && createdThread && createdThreadTitle) {
          setActiveThread(createdThread);
          activeThreadIdRef.current = createdThread.id;
          setThreads((current) => [createdThread!, ...current]);
          void codexAppServerClient
            .request('thread/name/set', {
              threadId: createdThread.id,
              name: createdThreadTitle,
            })
            .catch(() => undefined);
        }
        if (options.mode) {
          collaborationModeRef.current = requestedMode;
          setCollaborationMode(requestedMode);
          effortRef.current = currentEffort;
          setEffort(currentEffort);
        }
        setConversation((current) => {
          const acceptedTurn = current.turns[response.turn.id] ?? {
            completedAtMs: null,
            diff: null,
            durationMs: null,
            error: null,
            historical: false,
            id: response.turn.id,
            startedAtMs: Date.now(),
            status: 'inProgress',
          };
          return {
            ...current,
            activeTurnId:
              acceptedTurn.status === 'inProgress'
                ? response.turn.id
                : current.activeTurnId === response.turn.id
                  ? null
                  : current.activeTurnId,
            entries: current.entries.map((entry) =>
              entry.type === 'message' && entry.id === clientMessageId
                ? {
                    ...entry,
                    deliveryError: null,
                    deliveryStatus: 'sent',
                    turnId: response.turn.id,
                  }
                : entry,
            ),
            turns: {
              ...current.turns,
              [response.turn.id]: acceptedTurn,
            },
          };
        });
        if (startingGoal) {
          goalDraftModeRef.current = false;
          setGoalDraftMode(false);
          try {
            const goalResponse =
              await codexAppServerClient.request<CodexThreadGoalSetResponse>(
                'thread/goal/set',
                {
                  objective: text,
                  status: 'active',
                  threadId: thread.id,
                },
              );
            updateThreadGoal(thread.id, goalResponse.goal);
          } catch (goalError) {
            setRuntimeError(
              `消息已发送，但目标未能启动：${getErrorMessage(goalError)}`,
            );
          }
        }
      } catch (error) {
        if (!turnAccepted) {
          if (createdThread) {
            await codexAppServerClient
              .request('thread/delete', { threadId: createdThread.id })
              .catch(() => undefined);
            setThreads((current) =>
              current.filter((thread) => thread.id !== createdThread?.id),
            );
          }
          const deliveryError: AiTurnError = {
            additionalDetails: null,
            codexErrorInfo: null,
            message: getErrorMessage(error),
            willRetry: false,
          };
          setConversation((current) => {
            const failedMessage = current.entries.find(
              (entry) =>
                entry.type === 'message' && entry.id === clientMessageId,
            );
            const base = forceNewThread ? previousConversation : current;
            return {
              ...base,
              activeTurnId: previousConversation.activeTurnId,
              entries: forceNewThread
                ? [
                    ...previousConversation.entries,
                    ...(failedMessage
                      ? [
                          {
                            ...failedMessage,
                            deliveryError,
                            deliveryStatus: 'failed' as const,
                          },
                        ]
                      : []),
                  ]
                : current.entries.map((entry) =>
                    entry.type === 'message' && entry.id === clientMessageId
                      ? {
                          ...entry,
                          deliveryError,
                          deliveryStatus: 'failed',
                        }
                      : entry,
                  ),
            };
          });
          setActiveThread(previousThread);
          activeThreadIdRef.current = previousThread?.id ?? null;
          if (!options.planAction) {
            setComposerValue(composerSnapshot);
            setSelectedMentions(composerMentions);
            selectedAttachmentsRef.current = attachments;
            setSelectedAttachments(attachments);
            setMentionQuery(null);
          }
          if (options.planAction) {
            setPlanImplementation(options.restorePlan ?? null);
          }
        }
      } finally {
        if (attachmentGrantsDetached) {
          void releaseCodexContextAttachments(
            attachments.map((attachment) => attachment.attachmentId),
          ).catch(() => undefined);
        }
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [
      activeThread,
      activeThreadSupportsDrawing,
      composerValue,
      currentDocument,
      currentDocumentPath,
      activeDrawing,
      models,
      onBeforeTurnStart,
      selectedModelInfo,
      selectedMentions,
      updateThreadGoal,
      workspaceRootPath,
    ],
  );

  const runSelectionPreedit = React.useCallback(async () => {
    const instruction = composerValue.trim();
    if (inlinePreeditUnavailableReason) {
      setRuntimeError(inlinePreeditUnavailableReason);
      return;
    }

    const controller = getActiveEditorAiEditController();
    if (!controller) {
      setRuntimeError('当前标签不是可编辑的 Live Markdown 文档。');
      return;
    }
    const captured = controller.captureSelection({
      controls: 'default',
      metadata: {
        documentPath: currentDocumentPath,
        source: 'markune-ai-panel',
      },
    });
    if (!captured.ok) {
      setRuntimeError(formatInlineSelectionError(captured.code, captured.message));
      return;
    }

    const composerSnapshot = composerValue;
    const context = captured.value;
    setRuntimeError(null);

    try {
      const runner = inlineAiRunnerRef.current;
      if (!runner) {
        throw new Error('Codex 内联预编辑尚未就绪。');
      }
      const chunks = runner.runSelection(
        context,
        instruction,
        {
          onStarted: () => {
            setComposerValue((current) =>
              current === composerSnapshot ? '' : current,
            );
          },
        },
      );
      const completed = await streamCodexInlineAiProposal(
        controller,
        context,
        chunks,
      );
      if (completed && !completed.ok) {
        setRuntimeError(
          formatInlineSelectionError(completed.code, completed.message),
        );
      }
    } catch (error) {
      if (context.signal.aborted || isAbortError(error)) return;
      const message = getErrorMessage(error);
      controller.failProposal(context.id, message);
      setRuntimeError(message);
    }
  }, [
    composerValue,
    currentDocumentPath,
    getActiveEditorAiEditController,
    inlinePreeditUnavailableReason,
  ]);

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
      choiceId: string,
    ) => {
      try {
        await respondToCodexApproval(approval.id, choiceId);
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

  const answerUserInput = React.useCallback(
    async (request: AiUserInputRequest, answers: CodexUserInputAnswer[]) => {
      try {
        await respondToCodexUserInput(request.id, answers);
        setConversation((current) => ({
          ...current,
          userInputRequests: current.userInputRequests.filter(
            (candidate) => String(candidate.id) !== String(request.id),
          ),
        }));
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      }
    },
    [],
  );

  const implementPlan = React.useCallback(
    (freshContext: boolean) => {
      if (!planImplementation) return;
      const message = freshContext
        ? `${PLAN_IMPLEMENTATION_FRESH_PREFIX}\n\n${planImplementation.text}`
        : PLAN_IMPLEMENTATION_MESSAGE;
      void sendMessage(message, {
        forceNewThread: freshContext,
        mode: 'default',
        planAction: true,
        restorePlan: planImplementation,
      });
    }, [planImplementation, sendMessage]);

  const changePermissionMode = React.useCallback(
    async (modeId: PermissionModeId) => {
      if (
        conversation.activeTurnId ||
        conversation.approvals.length > 0 ||
        permissionUpdating
      ) {
        return;
      }
      const next = permissionSettingsForMode(modeId);
      if (
        next.profileId === ':danger-full-access' &&
        !(await confirmAction({
          confirmLabel: '切换到完全访问',
          description:
            '完全访问权限允许 Codex 不受工作区边界限制地访问本机文件和互联网，并且不会再请求审批。',
          title: '启用完全访问？',
          variant: 'destructive',
        }))
      ) {
        return;
      }

      setPermissionUpdating(true);
      setRuntimeError(null);
      try {
        if (activeThread) {
          await codexAppServerClient.request('thread/settings/update', {
            threadId: activeThread.id,
            permissions: next.profileId,
            approvalPolicy: next.approvalPolicy,
            approvalsReviewer: next.approvalsReviewer,
          });
        }
        permissionSettingsRef.current = next;
        setPermissionSettings(next);
      } catch (error) {
        setRuntimeError(getErrorMessage(error));
      } finally {
        setPermissionUpdating(false);
      }
    },
    [
      activeThread,
      confirmAction,
      conversation.activeTurnId,
      conversation.approvals.length,
      permissionUpdating,
    ],
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      data-presentation={presentation}
      data-testid="ai-panel"
    >
      <AiPanelHeader
        activeThread={activeThread}
        presentation={presentation}
        view={view}
        onHistory={() => setView('history')}
        onNewDiagram={startNewDiagram}
        onNewChat={startNewChat}
      />

      {view === 'history' ? (
        <ThreadHistory
          query={historyQuery}
          status={threadListStatus}
          threads={visibleThreads}
          onArchive={(thread) => void removeThread(thread, 'archive')}
          onDelete={(thread) => void removeThread(thread, 'delete')}
          onOpen={(thread) => void openThread(thread)}
          onQueryChange={setHistoryQuery}
          onRetry={() => void loadThreadHistory()}
        />
      ) : (
        <>
          {activeThread && !activeThreadSupportsDrawing ? (
            <button
              className="mx-3 mb-1 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              type="button"
              onClick={startNewDiagram}
            >
              该历史任务可能没有 Markune 画图工具。在新任务中使用 AI 画图
            </button>
          ) : null}
          <AiConversationViewport
            followLatestRequest={followLatestRequest}
            key={activeThread?.id ?? 'new-task'}
          >
            <PanelContent
              account={account}
              authRequired={authRequired}
              conversation={conversation}
              currentDocument={currentDocument}
              pluginOptions={pluginOptions}
              presentation={presentation}
              runtimeError={runtimeError}
              runtimeStatus={runtimeStatus}
              signingIn={signingIn}
              onApprove={approve}
              onOpenCodexSettings={onOpenCodexSettings}
              onOpenDocument={openMention}
              onOpenPlanPreview={(plan) =>
                onOpenPlanPreview(
                  plan,
                  activeThread?.id ?? plan.turnId ?? 'unscoped',
                )
              }
              onPrompt={(prompt) => void sendMessage(prompt)}
              onSignIn={() => void signIn()}
            />
          </AiConversationViewport>

          <div
            className={cn(
              'shrink-0',
              presentation === 'workspace' &&
                'mx-auto w-full max-w-[920px]',
            )}
          >
            {conversation.userInputRequests[0] ? (
              <UserInputDecisionCard
                key={String(conversation.userInputRequests[0].id)}
                request={conversation.userInputRequests[0]}
                onSubmit={(answers) =>
                  answerUserInput(conversation.userInputRequests[0], answers)
                }
              />
            ) : planImplementation ? (
              <PlanImplementationCard
                plan={planImplementation}
                submitting={submitting}
                onFreshContext={() => implementPlan(true)}
                onImplement={() => implementPlan(false)}
                onStay={() => {
                  setPlanImplementation(null);
                  setComposerFocusRequest((current) => current + 1);
                }}
              />
            ) : null}

            {activeTaskProgress ? (
              <TaskProgressIndicator
                key={activeTaskProgress.turnId}
                progress={activeTaskProgress}
              />
            ) : null}

            {activeGoal ? (
              <GoalStatusBar
                goal={activeGoal}
                observedAt={activeGoalObservedAt}
                updating={goalUpdating}
                onClear={() => void clearGoal()}
                onSave={updateGoalObjective}
                onStatusChange={(status) => void setGoalStatus(status)}
              />
            ) : null}

            <AiComposer
              active={Boolean(conversation.activeTurnId)}
              currentDrawing={activeDrawing}
              collaborationMode={collaborationMode}
              compacting={compactingThreadId === activeThread?.id}
              compactUnavailableReason={compactUnavailableReason}
              contextUsage={activeThreadTokenUsage}
              currentDocument={currentDocument}
              effort={effort}
              focusRequest={composerFocusRequest}
              skillInsertRequest={composerSkillInsertRequest}
              goalActive={Boolean(activeGoal)}
              goalDraftMode={goalDraftMode}
              goalUnavailableReason={goalEntryUnavailableReason}
              attachments={selectedAttachments}
              attachmentPreviewUrls={attachmentPreviewUrls}
              mentionDocuments={filteredMentionDocuments}
              mentionDrawings={filteredMentionDrawings}
              mentionQuery={mentionQuery}
              modelCatalogStatus={modelCatalogStatus}
              models={models}
              authRequired={authRequired}
              runtimeStatus={runtimeStatus}
              selectedModel={selectedModel}
              selectedModelInfo={selectedModelInfo}
              skillOptions={skillOptions}
              skillStatus={skillStatus}
              submitting={submitting}
              pluginLoadWarning={pluginLoadWarning}
              pluginOptions={pluginOptions}
              pluginStatus={pluginStatus}
              autoReviewAvailable={autoReviewAvailable}
              approvalPolicyAvailability={approvalPolicyAvailability}
              permissionMode={permissionModeFromSettings(permissionSettings)}
              permissionProfiles={permissionProfiles}
              permissionSwitchDisabled={
                Boolean(conversation.activeTurnId) ||
                conversation.approvals.length > 0 ||
                permissionUpdating
              }
              inputBlocked={conversation.userInputRequests.length > 0}
              inlineAiRunning={inlineAiRunning}
              inlineAiUnavailableReason={inlinePreeditUnavailableReason}
              modeSwitchDisabled={modeSwitchDisabled}
              planModeAvailable={planModeAvailable}
              planModeUnavailableReason={planModeUnavailableReason}
              value={composerValue}
              onAttachmentRemove={removeContextAttachment}
              onAttachmentPaste={pasteContextAttachments}
              onAttachmentSelect={(kind) => void selectContextAttachments(kind)}
              onDetectPlugins={() => void detectInstalledPlugins()}
              onEffortChange={setEffort}
              onGoalModeChange={changeGoalMode}
              onInterrupt={() => void interruptTurn()}
              onInlineAi={() => void runSelectionPreedit()}
              onCollaborationModeChange={changeCollaborationMode}
              onCompact={() => void compactContext()}
              onMentionQueryChange={setMentionQuery}
              onMentionsChange={setSelectedMentions}
              onModelChange={(model) => {
                const next = models.find((candidate) => candidate.model === model);
                if (
                  collaborationModeRef.current === 'plan' &&
                  !next?.supportedReasoningEfforts.some(
                    (option) => option.reasoningEffort === 'medium',
                  )
                ) {
                  return;
                }
                setSelectedModel(model);
                if (next) {
                  const nextEffort =
                    collaborationModeRef.current === 'plan'
                      ? 'medium'
                      : next.defaultReasoningEffort;
                  effortRef.current = nextEffort;
                  setEffort(nextEffort);
                }
              }}
              onPermissionModeChange={(mode) => void changePermissionMode(mode)}
              onOpenMention={openMention}
              onSend={() => void sendMessage()}
              onValueChange={(value) => {
                setComposerValue(value);
              }}
            />
          </div>
        </>
      )}
      <ConfirmationDialog
        request={confirmationRequest}
        onResolve={resolveConfirmation}
      />
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
        <div className="flex min-h-full flex-col" ref={contentRef}>
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
  presentation = 'panel',
  view,
  onHistory,
  onNewDiagram,
  onNewChat,
}: {
  activeThread: CodexThread | null;
  presentation?: 'panel' | 'workspace';
  view: PanelView;
  onHistory: () => void;
  onNewDiagram?: () => void;
  onNewChat: () => void;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-2 px-3',
        presentation === 'workspace'
          ? '-mt-1 h-9'
          : 'h-[var(--workspace-main-header-height)]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">
          {view === 'history'
            ? '历史记录'
            : activeThread?.name || activeThread?.preview || '新任务'}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5"
        data-testid="ai-header-actions"
      >
        <TooltipProvider delayDuration={250}>
          {onNewDiagram ? (
            <HeaderButton label="AI 画图" onClick={onNewDiagram}>
              <Blocks size={16} />
            </HeaderButton>
          ) : null}
          <HeaderButton label="新任务" onClick={onNewChat}>
            <SquarePen size={16} />
          </HeaderButton>
          <HeaderButton label="历史记录" onClick={onHistory}>
            <History size={16} />
          </HeaderButton>
        </TooltipProvider>
      </div>
    </header>
  );
}

function HeaderButton({
  children,
  label,
  onClick,
}: React.PropsWithChildren<{ label: string; onClick: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          type="button"
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function PanelContent({
  account,
  authRequired,
  conversation,
  currentDocument,
  pluginOptions = [],
  presentation = 'panel',
  runtimeError,
  runtimeStatus,
  signingIn,
  onApprove,
  onOpenCodexSettings,
  onOpenDocument,
  onOpenPlanPreview,
  onPrompt,
  onSignIn,
}: {
  account: CodexAccountResponse['account'];
  authRequired: boolean;
  conversation: AiConversationState;
  currentDocument: WorkspaceNode | null;
  pluginOptions?: AiPluginMentionOption[];
  presentation?: 'panel' | 'workspace';
  runtimeError: string | null;
  runtimeStatus: RuntimeStatus;
  signingIn: boolean;
  onApprove: (
    approval: AiApprovalRequest,
    choiceId: string,
  ) => void;
  onOpenCodexSettings?: () => void;
  onOpenDocument: (documentPath: string) => void;
  onOpenPlanPreview: (plan: AiProposedPlan) => void;
  onPrompt: (prompt: string) => void;
  onSignIn: () => void;
}) {
  if (runtimeStatus === 'web') {
    return (
      <EmptyPanel icon={<Bot size={20} />} title="AI 面板已就绪">
        <p>Codex App Server 只在 Markune 桌面端运行，Web 预览不会启动本地进程。</p>
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
        {onOpenCodexSettings ? (
          <button
            className="mt-3 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            data-testid="open-codex-settings-from-error"
            type="button"
            onClick={onOpenCodexSettings}
          >
            打开 Codex 设置
          </button>
        ) : null}
      </EmptyPanel>
    );
  }

  if (authRequired && !account) {
    return (
      <EmptyPanel icon={<Sparkles size={20} />} title="连接你的 ChatGPT 账户">
        <p>登录由 Codex App Server 管理，Markune 不接触或保存账户 Token。</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            className="inline-flex h-8 items-center justify-center rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-50"
            disabled={signingIn}
            type="button"
            onClick={onSignIn}
          >
            {signingIn ? '正在打开登录…' : '使用 ChatGPT 登录'}
          </button>
          {onOpenCodexSettings ? (
            <button
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
              data-testid="open-codex-settings-from-auth"
              type="button"
              onClick={onOpenCodexSettings}
            >
              配置自定义 API
            </button>
          ) : null}
        </div>
      </EmptyPanel>
    );
  }

  if (
    conversation.entries.length === 0 &&
    conversation.approvals.length === 0
  ) {
    const currentDocumentLabel = currentDocument
      ? getDocumentContextLabel(currentDocument)
      : null;
    const starterActions = currentDocument
      ? DOCUMENT_STARTER_ACTIONS
      : WORKSPACE_STARTER_ACTIONS;

    return (
      <div className="flex flex-1 items-center px-5 py-10">
        <div className="mx-auto w-full max-w-[560px]">
          <div className="flex flex-col items-center text-center">
            <Openai
              aria-hidden="true"
              className="size-7 text-muted-foreground/45"
              variant="light"
            />
            <h2
              className="mt-5 max-w-full text-[17px] font-medium leading-6 tracking-[-0.01em]"
              title={currentDocumentLabel ?? undefined}
            >
              {currentDocumentLabel ? (
                <>
                  想如何处理
                  <span className="break-all underline decoration-border underline-offset-4">
                    「{currentDocumentLabel}」
                  </span>
                  ？
                </>
              ) : (
                '今天想在工作区里做什么？'
              )}
            </h2>
            <p className="mt-2 max-w-[360px] text-xs leading-5 text-muted-foreground">
              {currentDocumentLabel
                ? '当前文档已关联，也可以在输入框中用 @ 提及其他文档。'
                : '从下面的任务开始，或直接告诉 Codex 你想完成什么。'}
            </p>
          </div>

          {runtimeError ? (
            <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {runtimeError}
            </div>
          ) : null}

          <div className="mt-7 grid grid-cols-2 gap-2.5">
            {starterActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  aria-label={action.title}
                  className="group flex min-h-28 min-w-0 flex-col justify-between rounded-xl border border-border/70 bg-background px-3 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] outline-none transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-accent/35 hover:shadow-[0_5px_16px_-12px_rgba(15,23,42,0.32)] focus-visible:ring-2 focus-visible:ring-ring/35 dark:shadow-none"
                  key={action.title}
                  title={action.description}
                  type="button"
                  onClick={() => onPrompt(action.prompt)}
                >
                  <Icon
                    className={cn('shrink-0', action.iconClassName)}
                    size={17}
                    strokeWidth={1.9}
                  />
                  <span className="mt-5 min-w-0">
                    <span className="block text-[13px] font-medium leading-5 text-foreground">
                      {action.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const blocks = buildConversationBlocks(conversation);

  return (
    <div
      className={cn(
        'mx-auto w-full py-5',
        presentation === 'workspace'
          ? 'max-w-[920px] px-3'
          : 'max-w-[680px] px-5',
      )}
      data-testid="ai-conversation-content"
    >
      <div>
        {blocks.map((block, index) =>
          block.type === 'trace' ? (
            <ProcessingTrace
              key={block.id}
              trace={block}
              onApprove={onApprove}
              onOpenDocument={onOpenDocument}
            />
          ) : block.type === 'changes' ? (
            <ChangeSummaryCard
              key={block.id}
              summary={block}
              onOpenDocument={onOpenDocument}
            />
          ) : block.type === 'proposedPlan' ? (
            <ProposedPlanCard
              key={block.id}
              plan={block}
              onOpen={onOpenPlanPreview}
            />
          ) : block.type === 'turnError' ? (
            <TurnErrorCard
              error={block}
              key={block.id}
              status={block.status}
            />
          ) : (
            <ConversationEntryRow
              entry={block}
              key={`${block.type}-${block.id}`}
              onOpenDocument={onOpenDocument}
              onOpenPlanPreview={onOpenPlanPreview}
              pluginOptions={pluginOptions}
              previous={previousConversationEntry(blocks[index - 1])}
              timestampMs={messageTimestampMs(block, conversation.turns)}
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

function messageTimestampMs(
  entry: AiConversationEntry,
  turns: AiConversationState['turns'],
) {
  if (entry.type !== 'message') return null;
  if (entry.createdAtMs !== undefined && entry.createdAtMs !== null) {
    return entry.createdAtMs;
  }
  const turn = entry.turnId ? turns[entry.turnId] : null;
  if (!turn) return null;
  return entry.role === 'user'
    ? turn.startedAtMs
    : (turn.completedAtMs ?? turn.startedAtMs);
}

export function ProposedPlanCard({
  plan,
  onOpen = () => undefined,
}: {
  plan: AiProposedPlan;
  onOpen?: (plan: AiProposedPlan) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const canOpen = plan.status === 'completed' && Boolean(plan.text.trim());

  const copyPlan = async () => {
    if (!plan.text.trim()) return;
    try {
      await navigator.clipboard.writeText(plan.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch (error) {
      console.warn('复制计划失败', error);
    }
  };

  const openPlan = () => {
    if (canOpen) onOpen(plan);
  };

  return (
    <section
      className="my-4 overflow-hidden rounded-xl border border-border/70 bg-background"
      data-testid="proposed-plan"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-muted/45 text-muted-foreground">
          <Lightbulb size={15} />
        </span>
        <div className="min-w-0 flex-1 text-[13px] font-medium">
          {plan.status === 'inProgress' ? '正在生成计划' : '计划'}
        </div>
        {plan.status === 'inProgress' ? (
          <LoaderCircle className="animate-spin text-muted-foreground" size={14} />
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              aria-label={copied ? '已复制计划' : '复制计划'}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
              disabled={!plan.text.trim()}
              title={copied ? '已复制' : '复制'}
              type="button"
              onClick={() => void copyPlan()}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button
              aria-label="在编辑器中查看完整计划"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground"
              disabled={!plan.text.trim()}
              title="查看完整计划"
              type="button"
              onClick={openPlan}
            >
              <Maximize2 size={14} />
            </button>
          </div>
        )}
      </header>
      <div
        aria-label="查看完整计划"
        className={cn(
          'group relative max-h-56 overflow-hidden px-3 py-3 text-[13px] leading-6',
          canOpen && 'cursor-pointer',
        )}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={openPlan}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPlan();
          }
        }}
      >
        {plan.text ? (
          <AiMessageContent markdown={plan.text} />
        ) : (
          <span className="text-muted-foreground">正在整理完整方案…</span>
        )}
        {plan.text ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent via-background/85 to-background"
          />
        ) : null}
      </div>
    </section>
  );
}

export function TaskProgressIndicator({
  progress,
}: {
  progress: AiTaskProgress;
}) {
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const showPreview = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 120);
  }, [cancelClose, pinned]);

  React.useEffect(
    () => () => {
      cancelClose();
    },
    [cancelClose],
  );

  const hasFileChanges = progress.fileCount > 0;
  const summaryLabel = [
    `第 ${progress.currentStepNumber} / ${progress.totalSteps} 步`,
    hasFileChanges ? `${progress.fileCount} 个文件已更改` : null,
    hasFileChanges ? `新增 ${progress.additions} 行` : null,
    hasFileChanges ? `删除 ${progress.deletions} 行` : null,
  ]
    .filter(Boolean)
    .join('，');

  return (
    <div
      className="flex shrink-0 justify-center px-3 pb-1 pt-0.5"
      data-testid="task-progress"
    >
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setPinned(false);
        }}
      >
        <PopoverAnchor asChild>
          <button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={summaryLabel}
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 text-xs text-muted-foreground shadow-[0_1px_3px_rgba(15,23,42,0.06)] outline-none transition-colors hover:bg-muted/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            type="button"
            onBlur={scheduleClose}
            onClick={() => {
              cancelClose();
              setPinned((current) => {
                const next = !current;
                setOpen(next);
                return next;
              });
            }}
            onFocus={showPreview}
            onPointerEnter={showPreview}
            onPointerLeave={scheduleClose}
          >
            <LoaderCircle
              aria-hidden="true"
              className="shrink-0 animate-spin text-primary/70"
              size={14}
            />
            <span className="truncate font-medium tabular-nums">
              第 {progress.currentStepNumber} / {progress.totalSteps} 步
            </span>
            {hasFileChanges ? (
              <>
                <span aria-hidden="true" className="text-border">
                  ·
                </span>
                <span className="truncate">
                  {progress.fileCount} 个文件已更改
                </span>
                <span className="shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{progress.additions}
                </span>
                <span className="shrink-0 tabular-nums text-red-600 dark:text-red-400">
                  -{progress.deletions}
                </span>
              </>
            ) : null}
          </button>
        </PopoverAnchor>
        <PopoverContent
          align="center"
          aria-label="任务列表"
          className="w-[min(400px,calc(100vw-2rem))] gap-0 rounded-xl p-1.5 shadow-lg"
          collisionPadding={12}
          role="region"
          side="top"
          sideOffset={6}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          <ol aria-label="任务步骤" className="space-y-px">
            {progress.steps.map((step, index) => {
              const completed = step.status === 'completed';
              const current = step.status === 'inProgress';
              return (
                <li
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex min-h-8 items-start gap-2 rounded-md px-2 py-1.5 text-[12px] leading-5',
                    current && 'text-foreground',
                    !current && 'text-muted-foreground',
                  )}
                  key={`${index}-${step.step}`}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-3.5 shrink-0 items-center justify-center',
                      completed && 'text-muted-foreground/80',
                      current && 'text-primary',
                      !completed && !current && 'text-muted-foreground/65',
                    )}
                  >
                    {completed ? (
                      <Check aria-hidden="true" size={13} strokeWidth={2.2} />
                    ) : (
                      <Circle
                        aria-hidden="true"
                        size={12}
                        strokeWidth={current ? 2.1 : 1.8}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 break-words',
                      completed && 'line-through decoration-border',
                      current && 'font-medium',
                    )}
                  >
                    {step.step}
                  </span>
                </li>
              );
            })}
          </ol>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ChangeSummaryCard({
  summary,
  onOpenDocument,
}: {
  summary: AiChangeSummaryBlock;
  onOpenDocument: (documentPath: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const visibleChanges = expanded
    ? summary.changes
    : summary.changes.slice(0, 3);
  const remaining = Math.max(0, summary.changes.length - visibleChanges.length);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/45 text-muted-foreground">
          <FilePenLine size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">
            已编辑 {summary.changes.length} 个文件
          </div>
          <div className="mt-0.5 flex gap-2 text-[11px] tabular-nums">
            <span className="text-emerald-600">+{summary.additions}</span>
            <span className="text-red-500">-{summary.deletions}</span>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        {visibleChanges.map((change) => (
          <ChangeSummaryRow
            change={change}
            key={change.absolutePath ?? change.path}
            onOpenDocument={onOpenDocument}
          />
        ))}
      </div>
      {remaining > 0 || (expanded && summary.changes.length > 3) ? (
        <button
          aria-label={expanded ? '收起文件列表' : `再显示 ${remaining} 个文件`}
          className="flex w-full items-center justify-center gap-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起文件列表' : `再显示 ${remaining} 个文件`}
          <ChevronDown
            className={cn('size-3 transition-transform', expanded && 'rotate-180')}
          />
        </button>
      ) : null}
    </section>
  );
}

function ChangeSummaryRow({
  change,
  onOpenDocument,
}: {
  change: AiFileChange;
  onOpenDocument: (documentPath: string) => void;
}) {
  const clickable =
    Boolean(change.absolutePath) &&
    change.path.toLocaleLowerCase().endsWith('.md') &&
    change.kind !== 'delete';
  const hasPreview = Boolean(change.diff.trim());
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{change.path}</span>
      <span className="flex shrink-0 gap-1.5 text-[10px] tabular-nums">
        {change.additions > 0 ? (
          <span className="text-emerald-600">+{change.additions}</span>
        ) : null}
        {change.deletions > 0 ? (
          <span className="text-red-500">-{change.deletions}</span>
        ) : null}
      </span>
    </>
  );
  const row = clickable ? (
    <button
      aria-label={change.path}
      className="flex w-full items-center gap-3 border-b border-border/45 px-3 py-2 text-left text-xs text-foreground/75 outline-none transition-colors last:border-b-0 hover:bg-muted/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
      type="button"
      onClick={() => onOpenDocument(change.absolutePath!)}
    >
      {content}
    </button>
  ) : (
    <div
      aria-label={hasPreview ? `${change.path}，查看变更预览` : undefined}
      className="flex items-center gap-3 border-b border-border/45 px-3 py-2 text-xs text-foreground/75 outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
      tabIndex={hasPreview ? 0 : undefined}
    >
      {content}
    </div>
  );

  if (!hasPreview) {
    return row;
  }

  return (
    <HoverCard closeDelay={100} openDelay={250}>
      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        aria-label={`${change.path} 变更预览`}
        className="w-[min(680px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-lg"
        collisionPadding={16}
        role="region"
        side="top"
        sideOffset={8}
      >
        <ChangeDiffPreview change={change} />
      </HoverCardContent>
    </HoverCard>
  );
}

type DiffPreviewLine = {
  content: string;
  kind: 'addition' | 'context' | 'deletion' | 'meta' | 'omitted';
  lineNumber: number | null;
};

const MAX_DIFF_PREVIEW_LINES = 240;
const DIFF_PREVIEW_HEAD_LINES = 180;
const DIFF_PREVIEW_TAIL_LINES = 59;

function ChangeDiffPreview({ change }: { change: AiFileChange }) {
  const lines = React.useMemo(
    () => createDiffPreviewLines(change.diff),
    [change.diff],
  );

  return (
    <div className="bg-popover text-popover-foreground">
      <header className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium" title={change.path}>
          {change.path}
        </div>
        <div className="flex shrink-0 gap-2 text-[11px] tabular-nums">
          <span className="text-emerald-600">+{change.additions}</span>
          <span className="text-red-500">-{change.deletions}</span>
        </div>
      </header>
      <div className="markune-thin-scrollarea max-h-[min(420px,65vh)] overflow-auto overscroll-contain py-1 font-mono text-[11px] leading-5">
        {lines.map((line, index) =>
          line.kind === 'omitted' ? (
            <div
              className="border-y border-border/50 bg-muted/30 px-3 py-1 text-center font-sans text-[10px] text-muted-foreground"
              key={`omitted-${index}`}
            >
              {line.content}
            </div>
          ) : (
            <div
              className={cn(
                'grid min-w-max grid-cols-[3rem_1rem_minmax(0,1fr)] border-l-2 border-transparent pr-4',
                line.kind === 'addition' &&
                  'border-l-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                line.kind === 'deletion' &&
                  'border-l-red-500 bg-red-500/10 text-red-800 dark:text-red-200',
                line.kind === 'meta' && 'text-muted-foreground',
              )}
              key={`${index}:${line.kind}:${line.content}`}
            >
              <span className="select-none border-r border-border/45 pr-2 text-right text-muted-foreground/70 tabular-nums">
                {line.lineNumber ?? ''}
              </span>
              <span className="select-none text-center text-muted-foreground/70">
                {line.kind === 'addition'
                  ? '+'
                  : line.kind === 'deletion'
                    ? '-'
                    : ' '}
              </span>
              <span className="whitespace-pre">{line.content || ' '}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function createDiffPreviewLines(diff: string): DiffPreviewLine[] {
  const lines: DiffPreviewLine[] = [];
  let oldLineNumber: number | null = null;
  let newLineNumber: number | null = null;

  for (const line of diff.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLineNumber = Number(hunk[1]);
      newLineNumber = Number(hunk[2]);
      continue;
    }
    if (isDiffHeaderLine(line)) {
      continue;
    }
    if (line.startsWith('\\ No newline at end of file')) {
      lines.push({ content: line, kind: 'meta', lineNumber: null });
      continue;
    }
    if (line.startsWith('+')) {
      lines.push({
        content: line.slice(1),
        kind: 'addition',
        lineNumber: newLineNumber,
      });
      if (newLineNumber !== null) newLineNumber += 1;
      continue;
    }
    if (line.startsWith('-')) {
      lines.push({
        content: line.slice(1),
        kind: 'deletion',
        lineNumber: oldLineNumber,
      });
      if (oldLineNumber !== null) oldLineNumber += 1;
      continue;
    }

    const content = line.startsWith(' ') ? line.slice(1) : line;
    lines.push({
      content,
      kind: 'context',
      lineNumber: newLineNumber ?? oldLineNumber,
    });
    if (oldLineNumber !== null) oldLineNumber += 1;
    if (newLineNumber !== null) newLineNumber += 1;
  }

  if (lines.length <= MAX_DIFF_PREVIEW_LINES) {
    return lines;
  }
  const omitted = lines.length - DIFF_PREVIEW_HEAD_LINES - DIFF_PREVIEW_TAIL_LINES;
  return [
    ...lines.slice(0, DIFF_PREVIEW_HEAD_LINES),
    {
      content: `已省略 ${omitted} 行`,
      kind: 'omitted',
      lineNumber: null,
    },
    ...lines.slice(-DIFF_PREVIEW_TAIL_LINES),
  ];
}

function isDiffHeaderLine(line: string) {
  return /^(diff --git |index |--- |\+\+\+ |new file mode |deleted file mode |similarity index |rename from |rename to )/.test(
    line,
  );
}

export function ConversationEntryRow({
  entry,
  onOpenDocument,
  onOpenPlanPreview = () => undefined,
  pluginOptions = [],
  previous,
  timestampMs,
}: {
  entry: AiConversationEntry;
  onOpenDocument: (documentPath: string) => void;
  onOpenPlanPreview?: (plan: AiProposedPlan) => void;
  pluginOptions?: AiPluginMentionOption[];
  previous: AiConversationEntry | null;
  timestampMs?: number | null;
}) {
  if (entry.type === 'proposedPlan') {
    return <ProposedPlanCard plan={entry} onOpen={onOpenPlanPreview} />;
  }
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

  const resolvedTimestampMs =
    timestampMs === undefined ? (entry.createdAtMs ?? null) : timestampMs;

  return (
    <article
      className={cn(
        'ai-message-entry text-[13px] leading-6 outline-none',
        previous && 'mt-5',
        entry.role === 'user' && 'flex justify-end',
      )}
      tabIndex={0}
    >
      {entry.role === 'assistant' ? (
        <div className="min-w-0">
          <AiMessageContent markdown={entry.text} />
          <MessageMetadata
            role="assistant"
            text={entry.text}
            timestampMs={resolvedTimestampMs}
          />
        </div>
      ) : (
        <UserMessageBubble
          attachments={entry.attachments ?? []}
          deliveryError={entry.deliveryError ?? null}
          deliveryStatus={entry.deliveryStatus}
          mentions={entry.mentions ?? []}
          pluginOptions={pluginOptions}
          text={entry.text}
          timestampMs={resolvedTimestampMs}
          onOpenMention={onOpenDocument}
        />
      )}
    </article>
  );
}

function UserMessageBubble({
  attachments,
  deliveryError,
  deliveryStatus,
  mentions,
  pluginOptions,
  text,
  timestampMs,
  onOpenMention,
}: {
  attachments: AiMessageAttachment[];
  deliveryError: AiTurnError | null;
  deliveryStatus: 'failed' | 'sending' | 'sent' | undefined;
  mentions: AiMessageMention[];
  pluginOptions: AiPluginMentionOption[];
  text: string;
  timestampMs: number | null;
  onOpenMention: (path: string) => void;
}) {
  const hasText = Boolean(text.trim());

  return (
    <div className="flex max-w-[96%] flex-col items-end">
      {attachments.length > 0 ? (
        <div
          className={cn('flex max-w-full justify-end', hasText && 'mb-2')}
          data-testid="user-message-attachments"
        >
          <AttachmentCards
            attachments={attachments.map((attachment, index) => ({
              id: `${attachment.kind}:${attachment.name}:${index}`,
              kind: attachment.kind,
              mediaType: attachment.mediaType,
              name: attachment.name,
              previewUrl: attachment.previewUrl,
            }))}
            variant="message"
          />
        </div>
      ) : null}
      {hasText ? (
        <div
          className="w-max max-w-full break-words rounded-xl bg-muted/70 px-3 py-2"
          data-testid="user-message-bubble"
        >
          <UserMessageContent
            mentions={mentions}
            pluginOptions={pluginOptions}
            text={text}
            onOpenMention={onOpenMention}
          />
        </div>
      ) : null}
      <MessageMetadata
        deliveryStatus={deliveryStatus}
        role="user"
        text={text}
        timestampMs={timestampMs}
      />
      {deliveryStatus === 'failed' && deliveryError ? (
        <TurnErrorCard
          error={deliveryError}
          status="failed"
          variant="delivery"
        />
      ) : null}
    </div>
  );
}

function MessageMetadata({
  deliveryStatus,
  role,
  text,
  timestampMs,
}: {
  deliveryStatus?: 'failed' | 'sending' | 'sent';
  role: 'assistant' | 'user';
  text: string;
  timestampMs: number | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const formattedTime = formatMessageTimestamp(timestampMs);
  const hasCopyableText = Boolean(text.trim());

  if (!hasCopyableText && !formattedTime && !deliveryStatus) return null;

  const deliveryState =
    deliveryStatus === 'sending' ? (
      <span
        className="mr-1 inline-flex items-center gap-1 text-[11px] leading-none"
        role="status"
      >
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        正在发送
      </span>
    ) : deliveryStatus === 'failed' ? (
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] leading-none text-destructive">
        <CircleX className="size-3" aria-hidden="true" />
        发送失败
      </span>
    ) : null;

  const copyButton = hasCopyableText ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={copied ? '已复制消息' : '复制消息'}
          className="inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_200);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {copied ? '已复制' : '复制'}
      </TooltipContent>
    </Tooltip>
  ) : null;
  const time = formattedTime ? (
    <time
      className="px-1 text-[11px] leading-none tabular-nums"
      dateTime={new Date(timestampMs as number).toISOString()}
    >
      {formattedTime}
    </time>
  ) : null;

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          'ai-message-metadata mt-1 flex min-h-6 items-center gap-0.5 text-muted-foreground transition-opacity duration-150',
          role === 'user' ? 'justify-end' : 'justify-start',
        )}
        data-testid={`${role}-message-metadata`}
      >
        {deliveryState}
        {role === 'assistant' ? copyButton : time}
        {role === 'assistant' ? time : copyButton}
      </div>
    </TooltipProvider>
  );
}

function serializeTurnErrorDetails(error: AiTurnError) {
  const details = [error.message];
  if (error.additionalDetails) {
    details.push(error.additionalDetails);
  }
  if (error.codexErrorInfo !== null && error.codexErrorInfo !== undefined) {
    details.push(
      typeof error.codexErrorInfo === 'string'
        ? error.codexErrorInfo
        : JSON.stringify(error.codexErrorInfo, null, 2),
    );
  }
  return details.join('\n\n');
}

function localizedTurnErrorSummary(error: AiTurnError) {
  const errorInfo =
    typeof error.codexErrorInfo === 'string'
      ? error.codexErrorInfo
      : JSON.stringify(error.codexErrorInfo ?? '');
  const searchable = `${errorInfo} ${error.message}`.toLowerCase();

  if (
    searchable.includes('usagelimitexceeded') ||
    searchable.includes('sessionbudgetexceeded') ||
    searchable.includes('usage limit')
  ) {
    return '当前账户的 Codex 使用额度已达到限制，请稍后重试或检查账户额度。';
  }
  if (searchable.includes('contextwindowexceeded')) {
    return '当前任务上下文过长，请新建任务或精简上下文后重试。';
  }
  if (
    searchable.includes('serveroverloaded') ||
    searchable.includes('overloaded')
  ) {
    return 'Codex 服务当前繁忙，请稍后重试。';
  }
  if (
    searchable.includes('unauthorized') ||
    searchable.includes('authentication')
  ) {
    return 'Codex 登录状态已失效，请重新登录后再试。';
  }
  if (
    searchable.includes('responsestreamdisconnected') ||
    searchable.includes('httpconnectionfailed') ||
    searchable.includes('stream disconnected')
  ) {
    return '与 Codex 的连接已中断，请检查网络后重新发送。';
  }
  if (searchable.includes('badrequest')) {
    return 'Codex 无法处理当前请求，请调整内容后重新发送。';
  }
  if (searchable.includes('sandboxerror')) {
    return 'Codex 执行环境发生错误，请检查任务权限或稍后重试。';
  }
  if (searchable.includes('internalservererror')) {
    return 'Codex 服务发生内部错误，请稍后重试。';
  }
  return 'Codex 未能完成本次响应。';
}

export function TurnErrorCard({
  error,
  status,
  variant = 'turn',
}: {
  error: AiTurnError;
  status: AiTurnErrorBlock['status'];
  variant?: 'delivery' | 'turn';
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const retrying = status === 'retrying';
  const details = serializeTurnErrorDetails(error);
  const summary =
    variant === 'delivery' ? error.message : localizedTurnErrorSummary(error);

  return (
    <div
      className={cn(
        'mt-3 w-full rounded-lg border px-3 py-2.5 text-left text-xs',
        retrying
          ? 'border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-200'
          : 'border-destructive/25 bg-destructive/5 text-destructive',
      )}
      role={retrying ? 'status' : 'alert'}
    >
      <div className="flex items-start gap-2">
        {retrying ? (
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 animate-spin"
          />
        ) : (
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {retrying
              ? '连接中断，Codex 正在自动重试'
              : variant === 'delivery'
                ? '消息未发送'
                : 'Codex 响应失败'}
          </div>
          <div className="mt-1 break-words leading-5 opacity-90">{summary}</div>
          {variant === 'turn' && !retrying ? (
            <>
              <button
                aria-label={detailsOpen ? '收起错误详情' : '查看错误详情'}
                className="mt-1.5 inline-flex items-center gap-1 rounded py-0.5 font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                type="button"
                onClick={() => setDetailsOpen((current) => !current)}
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    'size-3 transition-transform',
                    detailsOpen && 'rotate-90',
                  )}
                />
                技术详情
              </button>
              {detailsOpen ? (
                <div className="mt-2 rounded-md border border-current/15 bg-background/60 p-2 text-foreground">
                  <div className="space-y-2 font-mono text-[11px] leading-5">
                    <div className="whitespace-pre-wrap break-words">
                      {error.message}
                    </div>
                    {error.additionalDetails ? (
                      <div className="whitespace-pre-wrap break-words">
                        {error.additionalDetails}
                      </div>
                    ) : null}
                    {error.codexErrorInfo !== null &&
                    error.codexErrorInfo !== undefined ? (
                      <pre className="whitespace-pre-wrap break-words">
                        {typeof error.codexErrorInfo === 'string'
                          ? error.codexErrorInfo
                          : JSON.stringify(error.codexErrorInfo, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <button
                    aria-label="复制错误详情"
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(details)
                        .then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1_200);
                        })
                        .catch(() => undefined);
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? '已复制' : '复制详情'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatMessageTimestamp(timestampMs: number | null) {
  if (timestampMs === null || !Number.isFinite(timestampMs)) return null;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

interface DisplayAttachment {
  id: string;
  kind: 'file' | 'folder' | 'image';
  mediaType?: string | null;
  name: string;
  previewUrl?: string | null;
  sizeBytes?: number | null;
}

function AttachmentCards({
  attachments,
  onRemove,
  variant = 'composer',
}: {
  attachments: DisplayAttachment[];
  onRemove?: (attachmentId: string) => void;
  variant?: 'composer' | 'message';
}) {
  const previewable = attachments.filter(
    (attachment) => attachment.kind === 'image' && attachment.previewUrl,
  );
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const previewIndex = previewable.findIndex(
    (attachment) => attachment.id === previewId,
  );
  const preview = previewIndex >= 0 ? previewable[previewIndex] : null;

  const movePreview = (direction: -1 | 1) => {
    if (previewable.length < 2 || previewIndex < 0) return;
    const index =
      (previewIndex + direction + previewable.length) % previewable.length;
    setPreviewId(previewable[index]?.id ?? null);
  };

  return (
    <>
      <div
        className={cn(
          'flex gap-2',
          variant === 'message'
            ? 'max-w-full flex-wrap justify-end'
            : 'w-max min-w-full pb-1',
        )}
      >
        {attachments.map((attachment) =>
          attachment.kind === 'image' ? (
            <div
              className="relative size-16 shrink-0"
              data-attachment-kind="image"
              data-attachment-variant={variant}
              key={attachment.id}
            >
              <button
                aria-label={
                  attachment.previewUrl
                    ? `预览图片 ${attachment.name}`
                    : `图片 ${attachment.name} 暂无安全预览`
                }
                className={cn(
                  'flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border/80 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                  variant === 'message'
                    ? 'bg-background shadow-sm'
                    : 'bg-muted/60',
                )}
                disabled={!attachment.previewUrl}
                type="button"
                onClick={() => setPreviewId(attachment.id)}
              >
                {attachment.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={attachment.name}
                    className="size-full object-cover"
                    src={attachment.previewUrl}
                  />
                ) : (
                  <ImageIcon className="text-muted-foreground" size={21} />
                )}
              </button>
              {onRemove ? (
                <button
                  aria-label={`移除 ${attachment.name}`}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                  type="button"
                  onClick={() => onRemove(attachment.id)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                'relative flex shrink-0 items-center border border-border/80',
                variant === 'message'
                  ? 'h-9 max-w-56 gap-1.5 rounded-full bg-background px-3 shadow-sm'
                  : 'h-16 w-44 gap-2.5 rounded-xl bg-muted/30 px-3',
              )}
              data-attachment-kind={attachment.kind}
              data-attachment-variant={variant}
              key={attachment.id}
              title={attachment.name}
            >
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center text-muted-foreground',
                  variant === 'composer' &&
                    'size-9 rounded-lg bg-background shadow-sm ring-1 ring-border/70',
                )}
              >
                {attachment.kind === 'folder' ? (
                  <FolderOpen size={variant === 'message' ? 14 : 18} />
                ) : (
                  <FileText size={variant === 'message' ? 14 : 18} />
                )}
              </span>
              <span
                className={cn('min-w-0', variant === 'composer' && 'pr-4')}
              >
                <span
                  className={cn(
                    'block truncate font-medium',
                    variant === 'message' ? 'text-[13px]' : 'text-xs',
                  )}
                >
                  {attachment.name}
                </span>
                {variant === 'composer' ? (
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {attachment.kind === 'folder'
                      ? '文件夹'
                      : attachmentSecondaryLabel(attachment)}
                  </span>
                ) : null}
              </span>
              {onRemove ? (
                <button
                  aria-label={`移除 ${attachment.name}`}
                  className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                  type="button"
                  onClick={() => onRemove(attachment.id)}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ),
        )}
      </div>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      >
        <DialogContent
          className="max-w-[min(92vw,72rem)] border-border/30 bg-black/95 p-4 text-white"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') movePreview(-1);
            if (event.key === 'ArrowRight') movePreview(1);
          }}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="truncate text-sm text-white">
              {preview?.name ?? '图片预览'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              附件图片大图预览
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex min-h-64 items-center justify-center">
            {preview?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={preview.name}
                className="max-h-[78vh] max-w-full object-contain"
                src={preview.previewUrl}
              />
            ) : null}
            {previewable.length > 1 ? (
              <>
                <button
                  aria-label="上一张图片"
                  className="absolute left-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
                  type="button"
                  onClick={() => movePreview(-1)}
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  aria-label="下一张图片"
                  className="absolute right-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white"
                  type="button"
                  onClick={() => movePreview(1)}
                >
                  <ArrowRight size={18} />
                </button>
              </>
            ) : null}
          </div>
          {previewable.length > 1 ? (
            <p className="text-center text-xs text-white/65">
              {previewIndex + 1} / {previewable.length}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UserMessageContent({
  mentions,
  pluginOptions = [],
  text,
  onOpenMention,
}: {
  mentions: AiMessageMention[];
  pluginOptions?: AiPluginMentionOption[];
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
      mention.kind === 'plugin' ||
      mention.kind === 'skill' ||
      mention.path.startsWith('plugin://') ? (
        <span
          aria-label={label}
          className={cn(mentionLinkClassName, 'cursor-default no-underline')}
          key={`${mention.path}-${mention.start}-${mention.end}`}
          role="note"
        >
          <MessageMentionIcon
            mention={mention}
            pluginOptions={pluginOptions}
          />
          {label}
        </span>
      ) : (
        <a
          aria-label={label}
          className={mentionLinkClassName}
          href={mention.path}
          key={`${mention.path}-${mention.start}-${mention.end}`}
          onClick={(event) => {
            event.preventDefault();
            onOpenMention(mention.path);
          }}
        >
          <MessageMentionIcon
            mention={mention}
            pluginOptions={pluginOptions}
          />
          {label}
        </a>
      ),
    );
    cursor = mention.end;
  }

  if (cursor < text.length) {
    content.push(text.slice(cursor));
  }

  if (!text) return null;

  return (
    <div className="whitespace-pre-wrap break-words">
      {content.length > 0 ? content : text}
    </div>
  );
}

function MessageMentionIcon({
  mention,
  pluginOptions,
}: {
  mention: AiMessageMention;
  pluginOptions: AiPluginMentionOption[];
}) {
  let icon: React.ReactNode;

  if (mention.kind === 'plugin' || mention.path.startsWith('plugin://')) {
    const plugin = pluginOptions.find(
      (option) => option.mentionPath === mention.path,
    );
    icon = plugin ? (
      <PluginIcon plugin={plugin} />
    ) : (
      <StaticMentionIcon src="/icons/mentions/puzzle.svg" />
    );
  } else {
    icon = (
      <StaticMentionIcon
        src={
          mention.kind === 'skill'
            ? '/icons/mentions/box.svg'
            : mention.kind === 'drawing'
              ? '/icons/mentions/box.svg'
            : '/icons/mentions/file-text.svg'
        }
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-flex size-4 align-[-0.125em]"
    >
      {icon}
    </span>
  );
}

function StaticMentionIcon({ src }: { src: string }) {
  return (
    // Mention 图标来自 Markune 自带静态资源，不需要 Next 图片优化。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className="size-4 shrink-0 object-contain"
      draggable={false}
      src={src}
    />
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
  pre: ({ children }) => <AiCodeBlock>{children}</AiCodeBlock>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  td: ({ children }) => <td className="border-t border-border/60 px-2 py-1.5">{children}</td>,
  th: ({ children }) => <th className="bg-muted/45 px-2 py-1.5 font-medium">{children}</th>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>,
};

function AiCodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const text = React.useMemo(
    () => extractMarkdownTextContent(children).replace(/\n$/, ''),
    [children],
  );

  React.useEffect(
    () => () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  return (
    <div className="group/code relative my-3">
      <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/45 p-3 font-mono text-[11px] leading-5 [&>code]:bg-transparent [&>code]:p-0">
        {children}
      </pre>
      {text ? (
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={copied ? '已复制代码' : '复制代码'}
                className={cn(
                  'absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-border/70 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  copied
                    ? 'opacity-100 text-foreground'
                    : 'opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100',
                )}
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    if (resetTimerRef.current) {
                      clearTimeout(resetTimerRef.current);
                    }
                    resetTimerRef.current = setTimeout(() => {
                      setCopied(false);
                      resetTimerRef.current = null;
                    }, 1_200);
                  });
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={6}>
              {copied ? '已复制' : '复制'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

function extractMarkdownTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractMarkdownTextContent).join('');
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractMarkdownTextContent(node.props.children);
  }
  return '';
}

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
    choiceId: string,
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
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
  const hasDetails =
    trace.segments.length > 0 || orphanApprovals.length > 0;
  const [open, setOpen] = React.useState(
    () =>
      hasDetails &&
      (!trace.historical || trace.status !== 'completed'),
  );
  const statusLabel = getTraceStatusLabel(trace, active);

  // Keep disclosure open when the first real details arrive mid-turn, without
  // forcing an empty expandable body while still waiting on Codex.
  // author: refinex
  if (
    hasDetails &&
    active &&
    (!trace.historical || trace.status !== 'completed') &&
    !open
  ) {
    setOpen(true);
  }

  if (!hasDetails) {
    return (
      <div
        className="mt-4 flex items-center gap-2 py-1 text-[13px] text-muted-foreground"
        role={active ? 'status' : undefined}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {traceStatusIcon(trace.status)}
        </span>
        <span className="font-medium text-foreground/80">{statusLabel}</span>
        {elapsedMs !== null ? (
          <span className="tabular-nums text-muted-foreground/80">
            {formatDuration(elapsedMs)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Collapsible.Root
      className="mt-4"
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger asChild>
        <button
          aria-label={`${statusLabel}，${open ? '收起' : '展开'}处理过程`}
          className={cn(
            'group flex w-full items-center gap-2 rounded-md py-1 text-left text-[13px] font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30',
            active &&
              'sticky top-0 z-[1] -mx-1 bg-background/95 px-1 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80',
          )}
          type="button"
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {traceStatusIcon(trace.status)}
          </span>
          <span className="min-w-0 truncate text-foreground/80">
            {statusLabel}
          </span>
          {elapsedMs !== null ? (
            <span className="shrink-0 font-normal tabular-nums text-muted-foreground">
              {formatDuration(elapsedMs)}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              'ml-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              !open && '-rotate-90',
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="mt-2 space-y-3 border-l border-border/50 py-0.5 pl-4 ml-1.5">
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

export function getTraceStatusLabel(trace: AiTraceBlock, active: boolean) {
  if (!active) {
    if (trace.status === 'failed') return '处理失败';
    if (trace.status === 'interrupted') return '已中断';
    if (trace.status === 'declined') return '已拒绝';
    if (trace.status === 'waitingApproval') return '等待审批';
    return '已处理';
  }

  for (let index = trace.segments.length - 1; index >= 0; index -= 1) {
    const segment = trace.segments[index];
    if (segment?.type === 'group' && segment.status === 'inProgress') {
      return segment.summary;
    }
  }

  for (let index = trace.segments.length - 1; index >= 0; index -= 1) {
    const segment = trace.segments[index];
    if (segment?.type === 'group') {
      return segment.summary;
    }
  }

  if (trace.segments.some((segment) => segment.type === 'commentary')) {
    return '正在处理';
  }

  return '正在思考';
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
    choiceId: string,
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
  const forceOpen = ['declined', 'waitingApproval'].includes(group.status);
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
    choiceId: string,
  ) => void;
  onOpenDocument: (documentPath: string) => void;
}) {
  const forceOpen =
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

export function ActivityDetails({
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
    const resultImages =
      activity.kind === 'dynamic'
        ? dynamicToolResultImages(activity.result)
        : [];
    const detailResult =
      activity.kind === 'dynamic'
        ? dynamicToolResultWithoutImages(activity.result)
        : activity.result;
    return (
      <div className="mb-2 mt-1 space-y-2 rounded-lg bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
        {activity.progress ? <div>{activity.progress}</div> : null}
        <JsonDetail label="参数" value={activity.arguments} />
        {resultImages.map((imageUrl) => (
          // Markune-generated Data URLs are already bounded and cannot use the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="AI 图稿预览"
            className="max-h-72 w-full rounded-md border border-border/70 bg-white object-contain"
            data-testid="ai-drawing-preview-image"
            key={imageUrl.slice(0, 96)}
            src={imageUrl}
          />
        ))}
        <JsonDetail label="结果" value={detailResult} />
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

function dynamicToolResultImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const imageUrl = record.imageUrl;
    if (
      record.type !== 'inputImage' ||
      typeof imageUrl !== 'string' ||
      !/^data:image\/(?:png|webp);base64,/i.test(imageUrl)
    ) {
      return [];
    }
    return [imageUrl];
  });
}

function dynamicToolResultWithoutImages(value: unknown) {
  if (!Array.isArray(value)) return value;
  const filtered = value.filter(
    (item) =>
      !item ||
      typeof item !== 'object' ||
      (item as Record<string, unknown>).type !== 'inputImage',
  );
  return filtered.length > 0 ? filtered : null;
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
    choiceId: string,
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
        {approval.choices.length === 0 ? (
          <p className="mr-auto text-[10px] leading-4 text-muted-foreground">
            当前客户端不支持服务端要求的审批方式。
          </p>
        ) : null}
        {approval.choices.map((choice) => (
          <button
            className={cn(
              'h-7 rounded-md px-2 text-[11px] transition-colors',
              approvalChoiceClassName(choice.kind),
            )}
            key={choice.id}
            title={choice.description ?? undefined}
            type="button"
            onClick={() => onApprove(approval, choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function approvalChoiceClassName(kind: AiApprovalRequest['choices'][number]['kind']) {
  if (kind === 'accept' || kind === 'grantPermissionsForTurn') {
    return 'bg-foreground text-background hover:bg-foreground/90';
  }
  if (
    kind === 'decline' ||
    kind === 'denyPermissions'
  ) {
    return 'text-muted-foreground hover:bg-accent hover:text-foreground';
  }
  if (kind === 'cancel') {
    return 'text-destructive hover:bg-destructive/10';
  }
  return 'border border-border bg-background hover:bg-accent';
}

function ThreadHistory({
  query,
  status,
  threads,
  onArchive,
  onDelete,
  onOpen,
  onQueryChange,
  onRetry,
}: {
  query: string;
  status: ControlLoadStatus;
  threads: CodexThread[];
  onArchive: (thread: CodexThread) => void;
  onDelete: (thread: CodexThread) => void;
  onOpen: (thread: CodexThread) => void;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
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

      {status === 'loading' && grouped.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-3 py-16 text-xs text-muted-foreground">
          <LoaderCircle className="animate-spin" size={14} />
          正在读取历史任务
        </div>
      ) : status === 'error' && grouped.length === 0 ? (
        <div className="px-3 py-16 text-center text-xs text-muted-foreground">
          <p>历史任务暂时无法读取</p>
          <button
            className="mt-3 rounded-md border border-border/70 px-2.5 py-1.5 text-foreground hover:bg-accent"
            type="button"
            onClick={onRetry}
          >
            重试
          </button>
        </div>
      ) : grouped.length === 0 ? (
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

function PermissionModeItem({
  description,
  disabled,
  icon,
  label,
  value,
}: {
  description: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  value: PermissionModeId;
}) {
  return (
    <DropdownMenuRadioItem
      className="items-start py-1.5"
      disabled={disabled}
      value={value}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}

function PluginIcon({ plugin }: { plugin: AiPluginMentionOption }) {
  const [failedIconUrls, setFailedIconUrls] = React.useState<Set<string>>(
    () => new Set(),
  );
  const lightIcon = plugin.iconUrl ?? null;
  const darkIcon = plugin.darkIconUrl ?? lightIcon;
  const hasDistinctDarkIcon = Boolean(darkIcon && darkIcon !== lightIcon);
  const lightFailed = lightIcon ? failedIconUrls.has(lightIcon) : false;
  const darkFailed = darkIcon ? failedIconUrls.has(darkIcon) : false;
  const markFailed = (url: string) => {
    setFailedIconUrls((current) => new Set(current).add(url));
  };

  return (
    <span aria-hidden="true" className="relative size-4 shrink-0">
      {lightIcon && !lightFailed ? (
        // 插件图标来自受限本地数据或运行时 URL，不能交给 Next 图片优化器重写。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={cn(
            'size-4 shrink-0 object-contain',
            hasDistinctDarkIcon && 'dark:hidden',
          )}
          draggable={false}
          referrerPolicy="no-referrer"
          src={lightIcon}
          onError={() => markFailed(lightIcon)}
        />
      ) : (
        <Puzzle
          className={cn(
            'size-4 text-muted-foreground',
            hasDistinctDarkIcon && 'dark:hidden',
          )}
          data-plugin-icon-fallback="light"
        />
      )}
      {hasDistinctDarkIcon ? (
        darkIcon && !darkFailed ? (
          // 插件图标来自受限本地数据或运行时 URL，不能交给 Next 图片优化器重写。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="hidden size-4 shrink-0 object-contain dark:block"
            draggable={false}
            referrerPolicy="no-referrer"
            src={darkIcon}
            onError={() => markFailed(darkIcon)}
          />
        ) : (
          <Puzzle
            className="hidden size-4 text-muted-foreground dark:block"
            data-plugin-icon-fallback="dark"
          />
        )
      ) : null}
    </span>
  );
}

export function UserInputDecisionCard({
  request,
  onSubmit,
}: {
  request: AiUserInputRequest;
  onSubmit: (answers: CodexUserInputAnswer[]) => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<
    Record<string, { note: string; optionId: string | null }>
  >({});
  const [submitting, setSubmitting] = React.useState(false);

  const question = request.questions[activeIndex];
  const answer = answers[question.id] ?? { note: '', optionId: null };
  const selectedOption = question.options.find(
    (option) => option.id === answer.optionId,
  );
  const freeform = question.options.length === 0;
  const answered = freeform
    ? Boolean(answer.note.trim())
    : Boolean(
        answer.optionId && (!selectedOption?.isOther || answer.note.trim()),
      );
  const allAnswered = request.questions.every((candidate) => {
    const candidateAnswer = answers[candidate.id];
    if (candidate.options.length === 0) {
      return Boolean(candidateAnswer?.note.trim());
    }
    const candidateOption = candidate.options.find(
      (option) => option.id === candidateAnswer?.optionId,
    );
    return Boolean(
      candidateAnswer?.optionId &&
        (!candidateOption?.isOther || candidateAnswer.note.trim()),
    );
  });
  const selectOption = (optionId: string) => {
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        note: current[question.id]?.note ?? '',
        optionId,
      },
    }));
  };

  const submit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(
        request.questions.map((candidate) => ({
          note: answers[candidate.id]?.note.trim() || null,
          optionId: answers[candidate.id]?.optionId ?? null,
          questionId: candidate.id,
        })),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-3 mb-2 shrink-0 rounded-xl border border-border/70 bg-background p-3 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Lightbulb className="shrink-0" size={13} />
            <span className="truncate">{question.header}</span>
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {activeIndex + 1}/{request.questions.length}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-5">{question.question}</p>
        <div className="mt-2 space-y-1">
          {question.options.map((option, optionIndex) => (
            <button
              aria-pressed={answer.optionId === option.id}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                answer.optionId === option.id
                  ? 'border-foreground/25 bg-muted/60'
                  : 'border-transparent hover:bg-muted/40',
              )}
              disabled={submitting}
              data-option-index={optionIndex}
              key={option.id}
              type="button"
              onClick={() => selectOption(option.id)}
              onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  return;
                }
                event.preventDefault();
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? question.options.length - 1
                      : (optionIndex +
                          (event.key === 'ArrowDown' ? 1 : -1) +
                          question.options.length) %
                        question.options.length;
                selectOption(question.options[nextIndex].id);
                const next = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                  `[data-option-index="${nextIndex}"]`,
                );
                next?.focus();
              }}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  answer.optionId === option.id &&
                    'border-foreground bg-foreground text-background',
                )}
              >
                {answer.optionId === option.id ? <Check size={10} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">{option.label}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          ))}
        </div>
        {answer.optionId || freeform ? (
          <input
            aria-label={
              freeform
                ? '回答'
                : selectedOption?.isOther
                  ? '其他答案'
                  : '补充说明'
            }
            autoComplete="off"
            className="mt-2 h-8 w-full rounded-lg border border-border/70 bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring"
            disabled={submitting}
            placeholder={
              freeform
                ? '请输入回答'
                : selectedOption?.isOther
                  ? '请输入其他答案'
                  : '补充说明（可选）'
            }
            type={question.isSecret ? 'password' : 'text'}
            value={answer.note}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                [question.id]: {
                  note: event.target.value,
                  optionId: freeform ? null : answer.optionId,
                },
              }))
            }
          />
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            className="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40"
            disabled={activeIndex === 0 || submitting}
            type="button"
            onClick={() => setActiveIndex((current) => current - 1)}
          >
            上一步
          </button>
          {activeIndex < request.questions.length - 1 ? (
            <button
              className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background disabled:opacity-40"
              disabled={!answered || submitting}
              type="button"
              onClick={() => setActiveIndex((current) => current + 1)}
            >
              下一步
            </button>
          ) : (
            <button
              className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background disabled:opacity-40"
              disabled={!allAnswered || submitting}
              type="button"
              onClick={() => void submit()}
            >
              {submitting ? '正在提交…' : '提交回答'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function PlanImplementationCard({
  plan,
  submitting,
  onFreshContext,
  onImplement,
  onStay,
}: {
  plan: AiProposedPlan;
  submitting: boolean;
  onFreshContext: () => void;
  onImplement: () => void;
  onStay: () => void;
}) {
  return (
    <section className="mx-3 mb-2 shrink-0 rounded-xl border border-border/70 bg-background p-3 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Lightbulb size={15} />
        是否实施这份计划？
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        计划已保存到当前 Codex 任务。可在原上下文实施，也可创建干净任务。
      </p>
      <div className="mt-2 grid gap-1 sm:grid-cols-3">
        <button
          className="rounded-lg bg-foreground px-2 py-2 text-[11px] font-medium text-background disabled:opacity-40"
          disabled={submitting || !plan.text.trim()}
          type="button"
          onClick={onImplement}
        >
          实施此计划
        </button>
        <button
          className="rounded-lg border border-border/70 px-2 py-2 text-[11px] hover:bg-accent disabled:opacity-40"
          disabled={submitting || !plan.text.trim()}
          type="button"
          onClick={onFreshContext}
        >
          清空上下文后实施
        </button>
        <button
          className="rounded-lg px-2 py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={submitting}
          type="button"
          onClick={onStay}
        >
          留在计划模式
        </button>
      </div>
    </section>
  );
}

export function GoalStatusBar({
  goal,
  observedAt,
  updating,
  onClear,
  onSave,
  onStatusChange,
}: {
  goal: CodexThreadGoal;
  observedAt: number;
  updating: boolean;
  onClear: () => void;
  onSave: (objective: string) => Promise<boolean>;
  onStatusChange: (status: 'active' | 'paused') => void;
}) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [objective, setObjective] = React.useState('');
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (goal.status !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [goal.status, observedAt]);

  const elapsedSeconds =
    goal.timeUsedSeconds +
    (goal.status === 'active'
      ? Math.max(0, Math.floor((now - observedAt) / 1_000))
      : 0);
  const trimmedObjective = objective.trim();
  const objectiveLength = Array.from(trimmedObjective).length;
  const saveDisabled =
    updating ||
    !trimmedObjective ||
    objectiveLength > GOAL_OBJECTIVE_MAX_LENGTH ||
    trimmedObjective === goal.objective;
  const canResume =
    goal.status === 'paused' ||
    goal.status === 'blocked' ||
    goal.status === 'usageLimited';

  return (
    <TooltipProvider>
      <section
        aria-label="目标状态"
        className="relative z-0 mx-6 -mb-2 flex min-h-11 items-center gap-2 rounded-t-2xl border border-border/75 bg-muted/35 px-3 pb-2.5 pt-2 text-xs"
      >
        <Goal className="shrink-0 text-muted-foreground" size={15} />
        <span className="shrink-0 font-semibold text-foreground">
          {goalStatusLabel(goal.status)}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {goal.objective}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground/80">
          · {formatElapsedTime(elapsedSeconds)}
        </span>
        <div className="ml-1 flex shrink-0 items-center gap-0.5">
          <GoalActionButton
            label="编辑目标"
            onClick={() => {
              setObjective(goal.objective);
              setEditorOpen(true);
            }}
          >
            <Pencil size={14} />
          </GoalActionButton>
          {goal.status === 'active' ? (
            <GoalActionButton
              disabled={updating}
              label="暂停目标"
              onClick={() => onStatusChange('paused')}
            >
              <Pause size={14} />
            </GoalActionButton>
          ) : canResume ? (
            <GoalActionButton
              disabled={updating}
              label="恢复目标"
              onClick={() => onStatusChange('active')}
            >
              <Play size={14} />
            </GoalActionButton>
          ) : null}
          <GoalActionButton
            disabled={updating}
            label="清除目标"
            onClick={onClear}
          >
            <Trash2 size={14} />
          </GoalActionButton>
        </div>
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="gap-4 p-5 sm:max-w-xl">
          <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
            <Goal size={18} />
          </div>
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">编辑目标</DialogTitle>
            <DialogDescription className="text-xs">
              保存后，运行中的 Codex 会立即收到目标更新。
            </DialogDescription>
          </DialogHeader>
          <textarea
            aria-label="目标内容"
            autoFocus
            className="scrollbar-thin min-h-72 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            maxLength={GOAL_OBJECTIVE_MAX_LENGTH + 1}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
          <div className="-mt-2 text-right text-[10px] tabular-nums text-muted-foreground">
            {objectiveLength}/{GOAL_OBJECTIVE_MAX_LENGTH}
          </div>
          <DialogFooter className="-mx-5 -mb-5 bg-muted/30 px-5 py-3">
            <button
              className="h-8 rounded-lg px-3 text-xs font-medium hover:bg-accent"
              disabled={updating}
              type="button"
              onClick={() => setEditorOpen(false)}
            >
              取消
            </button>
            <button
              className="h-8 rounded-lg bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"
              disabled={saveDisabled}
              type="button"
              onClick={() => {
                void onSave(trimmedObjective).then((saved) => {
                  if (saved) setEditorOpen(false);
                });
              }}
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function GoalActionButton({
  children,
  disabled = false,
  label,
  onClick,
}: React.PropsWithChildren<{
  disabled?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          disabled={disabled}
          type="button"
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={5}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function goalStatusLabel(status: CodexThreadGoal['status']) {
  switch (status) {
    case 'active':
      return '进行中的目标';
    case 'paused':
      return '已暂停的目标';
    case 'blocked':
      return '已阻塞的目标';
    case 'usageLimited':
      return '已因用量暂停的目标';
    case 'budgetLimited':
      return '已达预算的目标';
    case 'complete':
      return '已完成的目标';
  }
}

function formatElapsedTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

export function AiComposer({
  active,
  approvalPolicyAvailability,
  attachments = [],
  attachmentPreviewUrls = {},
  authRequired = false,
  autoReviewAvailable,
  collaborationMode = 'default',
  compacting = false,
  compactUnavailableReason = null,
  contextUsage = null,
  currentDocument,
  currentDrawing = null,
  effort,
  focusRequest = 0,
  goalActive = false,
  goalDraftMode = false,
  goalUnavailableReason = null,
  inlineAiRunning = false,
  inlineAiUnavailableReason = null,
  mentionDocuments,
  mentionDrawings = [],
  mentionQuery,
  modeSwitchDisabled = false,
  modelCatalogStatus = 'ready',
  models,
  permissionMode,
  permissionProfiles,
  permissionSwitchDisabled,
  inputBlocked = false,
  planModeAvailable = false,
  planModeUnavailableReason = null,
  pluginLoadWarning = null,
  pluginOptions = [],
  pluginStatus = 'idle',
  runtimeStatus,
  selectedModel,
  selectedModelInfo,
  skillInsertRequest = null,
  skillOptions = [],
  skillStatus = 'idle',
  submitting,
  value,
  onAttachmentRemove = () => undefined,
  onAttachmentPaste = async () => false,
  onAttachmentSelect = () => undefined,
  onDetectPlugins = () => undefined,
  onCollaborationModeChange = () => undefined,
  onCompact = () => undefined,
  onEffortChange,
  onGoalModeChange = () => undefined,
  onInlineAi = () => undefined,
  onInterrupt,
  onMentionQueryChange,
  onMentionsChange,
  onModelChange,
  onPermissionModeChange,
  onOpenMention,
  onSend,
  onValueChange,
}: {
  active: boolean;
  approvalPolicyAvailability: { never: boolean; onRequest: boolean };
  attachments?: CodexContextAttachment[];
  attachmentPreviewUrls?: Record<string, string>;
  authRequired?: boolean;
  autoReviewAvailable: boolean;
  collaborationMode?: CodexCollaborationModeKind;
  compacting?: boolean;
  compactUnavailableReason?: string | null;
  contextUsage?: CodexThreadTokenUsage | null;
  currentDocument: WorkspaceNode | null;
  currentDrawing?: AiDrawingReference | null;
  effort: CodexReasoningEffort;
  focusRequest?: number;
  goalActive?: boolean;
  goalDraftMode?: boolean;
  goalUnavailableReason?: string | null;
  inlineAiRunning?: boolean;
  inlineAiUnavailableReason?: string | null;
  mentionDocuments: AiDocumentReference[];
  mentionDrawings?: AiDrawingReference[];
  mentionQuery: string | null;
  modeSwitchDisabled?: boolean;
  modelCatalogStatus?: ControlLoadStatus;
  models: CodexModel[];
  permissionMode: PermissionModeId;
  permissionProfiles: CodexPermissionProfileSummary[];
  permissionSwitchDisabled: boolean;
  inputBlocked?: boolean;
  planModeAvailable?: boolean;
  planModeUnavailableReason?: string | null;
  pluginLoadWarning?: string | null;
  pluginOptions?: AiPluginMentionOption[];
  pluginStatus?: ControlLoadStatus;
  runtimeStatus: RuntimeStatus;
  selectedModel: string;
  selectedModelInfo: CodexModel | null;
  skillInsertRequest?: ComposerSkillInsertRequest | null;
  skillOptions?: AiSkillMentionOption[];
  skillStatus?: ControlLoadStatus;
  submitting: boolean;
  value: string;
  onAttachmentRemove?: (attachmentId: string) => void;
  onAttachmentPaste?: () => Promise<boolean>;
  onAttachmentSelect?: (kind: CodexContextAttachment['kind']) => void;
  onDetectPlugins?: () => void;
  onCollaborationModeChange?: (mode: CodexCollaborationModeKind) => void;
  onCompact?: () => void;
  onEffortChange: (effort: CodexReasoningEffort) => void;
  onGoalModeChange?: (enabled: boolean) => void;
  onInlineAi?: () => void;
  onInterrupt: () => void;
  onMentionQueryChange: (query: string | null) => void;
  onMentionsChange: (documents: AiComposerMention[]) => void;
  onModelChange: (model: string) => void;
  onPermissionModeChange: (mode: PermissionModeId) => void;
  onOpenMention: (path: string) => void;
  onSend: () => void;
  onValueChange: (value: string) => void;
}) {
  const runtimeUnavailable = runtimeStatus === 'error' || runtimeStatus === 'web';
  const preparing = runtimeStatus === 'loading';
  const editorDisabled =
    runtimeUnavailable || authRequired || submitting || inputBlocked;
  const controlsDisabled =
    runtimeStatus !== 'ready' || authRequired || submitting || inputBlocked;
  const effortOptions = selectedModelInfo?.supportedReasoningEfforts ?? [];
  const profileAllowed = (profileId: string) =>
    permissionProfiles.find((profile) => profile.id === profileId)?.allowed ?? true;
  const editorRef = React.useRef<HTMLDivElement>(null);
  const composerSurfaceRef = React.useRef<HTMLDivElement>(null);
  const addMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const initializedRef = React.useRef(false);
  const savedRangeRef = React.useRef<Range | null>(null);
  const mentionTargetRef = React.useRef<ComposerMentionTarget | null>(null);
  const dismissedMentionKeyRef = React.useRef<string | null>(null);
  const mentionPathsRef = React.useRef<string[]>([]);
  const appliedSkillInsertRequestIdRef = React.useRef<number | null>(null);
  const pasteQueueRef = React.useRef(Promise.resolve());
  const clearedComposerSnapshotRef = React.useRef<{
    fragment: DocumentFragment;
    value: string;
  } | null>(null);
  const [composerMentionPaths, setComposerMentionPaths] = React.useState<
    string[]
  >([]);
  const mentionListboxId = React.useId();
  const skillListboxId = React.useId();
  const [mentionSelection, setMentionSelection] = React.useState<{
    path: string | null;
    query: string | null;
  }>({ path: null, query: null });
  const [skillQuery, setSkillQuery] = React.useState<string | null>(null);
  const [skillSelection, setSkillSelection] = React.useState<{
    path: string | null;
    query: string | null;
  }>({ path: null, query: null });
  const [addMenuLayout, setAddMenuLayout] = React.useState<{
    sideOffset: number;
    width: number;
  } | null>(null);
  const placeholder = inputBlocked
    ? '请先回答 Codex 的问题'
    : authRequired
    ? '登录 ChatGPT 后可用'
    : runtimeUnavailable
    ? '桌面端连接 Codex 后可用'
    : goalDraftMode
    ? '描述你的目标，定义可衡量的成果，以获得最佳效果'
    : '要求后续变更，使用 @ 提及文档或图稿，/ 选择 Skill';

  React.useEffect(() => {
    if (focusRequest > 0 && !editorDisabled) {
      editorRef.current?.focus();
    }
  }, [editorDisabled, focusRequest]);

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

  const syncMentionTarget = React.useCallback(() => {
    const target = getComposerMentionTarget(editorRef.current);
    if (!target || target.key === dismissedMentionKeyRef.current) {
      mentionTargetRef.current = null;
      onMentionQueryChange(null);
      setSkillQuery(null);
      return;
    }

    mentionTargetRef.current = target;
    if (target.kind === 'document') {
      onMentionQueryChange(target.query);
      setSkillQuery(null);
    } else {
      onMentionQueryChange(null);
      setSkillQuery(target.query);
    }
  }, [onMentionQueryChange]);

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
    const nextPaths = nextMentions.map((mention) => mention.path);
    if (!sameStringArray(mentionPathsRef.current, nextPaths)) {
      mentionPathsRef.current = nextPaths;
      setComposerMentionPaths(nextPaths);
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
      const fragment = window.document.createDocumentFragment();
      for (const child of Array.from(editor.childNodes)) {
        fragment.append(child.cloneNode(true));
      }
      clearedComposerSnapshotRef.current = {
        fragment,
        value: readComposerSnapshot(editor).value,
      };
      editor.replaceChildren();
      savedRangeRef.current = null;
      mentionPathsRef.current = [];
      setComposerMentionPaths([]);
      return;
    }

    if (value && !editor.hasChildNodes()) {
      const snapshot = clearedComposerSnapshotRef.current;
      if (snapshot?.value === value) {
        editor.append(snapshot.fragment.cloneNode(true));
        mentionPathsRef.current = Array.from(
          editor.querySelectorAll<HTMLElement>('[data-mention-path]'),
        )
          .map((mention) => mention.dataset.mentionPath ?? '')
          .filter(Boolean);
        setComposerMentionPaths(mentionPathsRef.current);
      } else {
        editor.textContent = value;
        mentionPathsRef.current = [];
        setComposerMentionPaths([]);
      }
    }
  }, [value]);

  React.useEffect(() => {
    if (!submitting && !value) {
      clearedComposerSnapshotRef.current = null;
    }
  }, [submitting, value]);

  const insertMention = React.useCallback(
    (reference: AiDocumentReference | AiDrawingReference) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.focus();
      const targetRange = mentionTargetRef.current?.range;
      const range =
        targetRange && editor.contains(targetRange.commonAncestorContainer)
          ? targetRange.cloneRange()
          : getComposerRange(editor, savedRangeRef.current);
      range.deleteContents();

      const mention = isDrawingReference(reference)
        ? createDrawingMentionElement(reference)
        : createDocumentMentionElement(reference);
      const trailingSpace = window.document.createTextNode('\u00a0');
      range.insertNode(mention);
      mention.after(trailingSpace);

      const selection = window.getSelection();
      range.setStart(trailingSpace, trailingSpace.data.length);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();

      mentionTargetRef.current = null;
      dismissedMentionKeyRef.current = null;
      setMentionSelection({ path: null, query: null });
      onMentionQueryChange(null);
      setSkillQuery(null);
      syncEditorState();
    },
    [onMentionQueryChange, syncEditorState],
  );

  const insertPluginMention = React.useCallback(
    (plugin: AiPluginMentionOption) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const range = getComposerRange(editor, savedRangeRef.current);
      const mention = createPluginMentionElement(plugin);
      const trailingSpace = window.document.createTextNode('\u00a0');
      range.deleteContents();
      range.insertNode(mention);
      mention.after(trailingSpace);

      const selection = window.getSelection();
      range.setStart(trailingSpace, trailingSpace.data.length);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();
      syncEditorState();
    },
    [syncEditorState],
  );

  const insertSkillMention = React.useCallback(
    (skill: AiSkillMentionOption) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const targetRange = mentionTargetRef.current?.range;
      const range =
        targetRange && editor.contains(targetRange.commonAncestorContainer)
          ? targetRange.cloneRange()
          : getComposerRange(editor, savedRangeRef.current);
      const mention = createSkillMentionElement(skill);
      const trailingSpace = window.document.createTextNode('\u00a0');
      range.deleteContents();
      range.insertNode(mention);
      mention.after(trailingSpace);

      const selection = window.getSelection();
      range.setStart(trailingSpace, trailingSpace.data.length);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();

      mentionTargetRef.current = null;
      dismissedMentionKeyRef.current = null;
      setSkillSelection({ path: null, query: null });
      setSkillQuery(null);
      onMentionQueryChange(null);
      syncEditorState();
    },
    [onMentionQueryChange, syncEditorState],
  );

  React.useLayoutEffect(() => {
    const editor = editorRef.current;
    if (
      !editor ||
      !skillInsertRequest ||
      appliedSkillInsertRequestIdRef.current === skillInsertRequest.id
    ) {
      return;
    }
    appliedSkillInsertRequestIdRef.current = skillInsertRequest.id;
    editor.replaceChildren();
    savedRangeRef.current = null;
    mentionTargetRef.current = null;
    dismissedMentionKeyRef.current = null;
    mentionPathsRef.current = [];
    setComposerMentionPaths([]);
    insertSkillMention(skillInsertRequest.skill);
  }, [insertSkillMention, skillInsertRequest]);

  const runCompactCommand = React.useCallback(() => {
    if (compactUnavailableReason) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const targetRange = mentionTargetRef.current?.range;
    const range =
      targetRange && editor.contains(targetRange.commonAncestorContainer)
        ? targetRange.cloneRange()
        : getComposerRange(editor, savedRangeRef.current);
    range.deleteContents();
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();

    mentionTargetRef.current = null;
    dismissedMentionKeyRef.current = null;
    setSkillSelection({ path: null, query: null });
    setSkillQuery(null);
    onMentionQueryChange(null);
    syncEditorState();
    onCompact();
  }, [compactUnavailableReason, onCompact, onMentionQueryChange, syncEditorState]);

  const runGoalCommand = React.useCallback(() => {
    if (goalUnavailableReason && !goalActive) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const targetRange = mentionTargetRef.current?.range;
    const range =
      targetRange && editor.contains(targetRange.commonAncestorContainer)
        ? targetRange.cloneRange()
        : getComposerRange(editor, savedRangeRef.current);
    range.deleteContents();
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();

    mentionTargetRef.current = null;
    dismissedMentionKeyRef.current = null;
    setSkillSelection({ path: null, query: null });
    setSkillQuery(null);
    onMentionQueryChange(null);
    syncEditorState();
    onGoalModeChange(true);
  }, [goalActive, goalUnavailableReason, onGoalModeChange, onMentionQueryChange, syncEditorState]);

  const closeMentionMenu = React.useCallback(() => {
    dismissedMentionKeyRef.current = mentionTargetRef.current?.key ?? null;
    mentionTargetRef.current = null;
    setMentionSelection({ path: null, query: null });
    setSkillSelection({ path: null, query: null });
    onMentionQueryChange(null);
    setSkillQuery(null);
  }, [onMentionQueryChange]);

  const mentionOptions = React.useMemo(
    () => [
      ...mentionDocuments.map((reference) => ({
        kind: 'document' as const,
        path: reference.absolutePath,
        reference,
      })),
      ...mentionDrawings.map((reference) => ({
        kind: 'drawing' as const,
        path: createDrawingMentionPath(reference.id),
        reference,
      })),
    ],
    [mentionDocuments, mentionDrawings],
  );
  const selectedMentionIndex =
    mentionSelection.query === mentionQuery
      ? mentionOptions.findIndex(
          (option) => option.path === mentionSelection.path,
        )
      : -1;
  const activeMentionIndex =
    mentionOptions.length === 0 ? -1 : Math.max(0, selectedMentionIndex);
  const activeMention =
    activeMentionIndex >= 0
      ? (mentionOptions[activeMentionIndex]?.reference ?? null)
      : null;
  const selectMentionIndex = React.useCallback(
    (index: number) => {
      setMentionSelection({
        path: mentionOptions[index]?.path ?? null,
        query: mentionQuery,
      });
    },
    [mentionOptions, mentionQuery],
  );
  const visibleSkills = React.useMemo(
    () =>
      rankSkillOptions(
        skillOptions,
        skillQuery ?? '',
        new Set(
          composerMentionPaths.filter((path) =>
            skillOptions.some((skill) => skill.path === path),
          ),
        ),
      ),
    [composerMentionPaths, skillOptions, skillQuery],
  );
  const showGoalCommand = skillQuery !== null && goalCommandMatches(skillQuery);
  const showCompactCommand =
    skillQuery !== null && compactCommandMatches(skillQuery);
  const goalCommandOffset = showGoalCommand ? 1 : 0;
  const compactCommandIndex = showCompactCommand ? goalCommandOffset : -1;
  const commandOffset = goalCommandOffset + (showCompactCommand ? 1 : 0);
  const selectedMenuIndex =
    skillSelection.query === skillQuery
      ? skillSelection.path === GOAL_COMMAND_SELECTION && showGoalCommand
        ? 0
        : skillSelection.path === COMPACT_COMMAND_SELECTION &&
            showCompactCommand
          ? compactCommandIndex
        : (() => {
            const skillIndex = visibleSkills.findIndex(
              (skill) => skill.path === skillSelection.path,
            );
            return skillIndex < 0 ? -1 : skillIndex + commandOffset;
          })()
      : -1;
  const menuOptionCount = visibleSkills.length + commandOffset;
  const activeMenuIndex =
    menuOptionCount === 0 ? -1 : Math.max(0, selectedMenuIndex);
  const activeSkill =
    activeMenuIndex >= commandOffset
      ? (visibleSkills[activeMenuIndex - commandOffset] ?? null)
      : null;
  const activeGoalCommand = showGoalCommand && activeMenuIndex === 0;
  const activeCompactCommand =
    showCompactCommand && activeMenuIndex === compactCommandIndex;
  const selectSkillIndex = React.useCallback(
    (index: number) => {
      setSkillSelection({
        path:
          showGoalCommand && index === 0
            ? GOAL_COMMAND_SELECTION
            : showCompactCommand && index === compactCommandIndex
            ? COMPACT_COMMAND_SELECTION
            : visibleSkills[index - commandOffset]?.path ?? null,
        query: skillQuery,
      });
    },
    [commandOffset, compactCommandIndex, showCompactCommand, showGoalCommand, skillQuery, visibleSkills],
  );

  return (
    <div className="relative z-10 shrink-0 px-3 pb-3 pt-2">
      <div
        className="relative rounded-2xl border border-border/80 bg-background shadow-[0_1px_4px_rgba(15,23,42,0.06)] focus-within:border-foreground/20"
        ref={composerSurfaceRef}
      >
        {skillQuery !== null ? (
          <SkillMenu
            activeIndex={activeMenuIndex}
            compacting={compacting}
            compactUnavailableReason={compactUnavailableReason}
            contextUsage={contextUsage}
            goalActive={goalActive}
            goalUnavailableReason={goalUnavailableReason}
            listboxId={skillListboxId}
            query={skillQuery}
            showGoalCommand={showGoalCommand}
            showCompactCommand={showCompactCommand}
            skills={visibleSkills}
            status={skillStatus}
            onActiveIndexChange={selectSkillIndex}
            onSelectCompact={runCompactCommand}
            onSelectGoal={runGoalCommand}
            onSelect={insertSkillMention}
          />
        ) : mentionQuery !== null ? (
          <MentionMenu
            activeIndex={activeMentionIndex}
            currentDocumentPath={currentDocument?.absolutePath ?? null}
            currentDrawingId={currentDrawing?.id ?? null}
            documents={mentionDocuments}
            drawings={mentionDrawings}
            listboxId={mentionListboxId}
            query={mentionQuery}
            onActiveIndexChange={selectMentionIndex}
            onClose={closeMentionMenu}
            onSelect={insertMention}
          />
        ) : null}

        {attachments.length > 0 ? (
          <div className="scrollbar-thin overflow-x-auto px-3 pt-2.5">
            <AttachmentCards
              attachments={attachments.map((attachment) => ({
                id: attachment.attachmentId,
                kind: attachment.isImage ? 'image' : attachment.kind,
                mediaType: attachment.mediaType,
                name: attachment.name,
                previewUrl:
                  attachmentPreviewUrls[attachment.attachmentId] ?? null,
                sizeBytes: attachment.sizeBytes,
              }))}
              onRemove={onAttachmentRemove}
            />
          </div>
        ) : null}

        {currentDocument || currentDrawing ? (
          <div className="flex flex-wrap gap-1 px-3 pt-2.5">
            {currentDocument ? (
              <ContextChip
                label={getDocumentContextLabel(currentDocument)}
                title={getDocumentContextTitle(currentDocument)}
              />
            ) : null}
            {currentDrawing ? (
              <ContextChip
                icon={<Blocks size={11} />}
                label={currentDrawing.title}
                title={
                  currentDrawing.albumPath
                    ? `${currentDrawing.title} · ${currentDrawing.albumPath}`
                    : currentDrawing.title
                }
              />
            ) : null}
          </div>
        ) : null}

        <div
          aria-label="向 Codex 提问"
          aria-activedescendant={
            skillQuery !== null && activeMenuIndex >= 0
              ? mentionOptionId(skillListboxId, activeMenuIndex)
              : mentionQuery !== null && activeMention
              ? mentionOptionId(mentionListboxId, activeMentionIndex)
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={
            skillQuery !== null
              ? skillListboxId
              : mentionQuery !== null
                ? mentionListboxId
                : undefined
          }
          aria-multiline="true"
          className="scrollbar-thin block min-h-14 max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 pb-2 pt-3 text-[13px] leading-5 outline-none data-[disabled=true]:cursor-not-allowed data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground/60 data-[empty=true]:before:content-[attr(data-placeholder)]"
          contentEditable={!editorDisabled}
          data-disabled={editorDisabled}
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
              if (
                mention.dataset.mentionKind === 'document' ||
                mention.dataset.mentionKind === 'drawing'
              ) {
                onOpenMention(mention.dataset.mentionPath ?? '');
              }
              return;
            }
            saveSelection();
            syncMentionTarget();
          }}
          onInput={() => {
            dismissedMentionKeyRef.current = null;
            saveSelection();
            syncEditorState();
            syncMentionTarget();
          }}
          onKeyDown={(event) => {
            const mention = findMentionElement(event.target);
            if (mention && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              if (
                mention.dataset.mentionKind === 'document' ||
                mention.dataset.mentionKind === 'drawing'
              ) {
                onOpenMention(mention.dataset.mentionPath ?? '');
              }
              return;
            }

            if (
              (mentionQuery !== null || skillQuery !== null) &&
              !event.nativeEvent.isComposing
            ) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                if (skillQuery !== null && menuOptionCount > 0) {
                  selectSkillIndex(
                    (activeMenuIndex + direction + menuOptionCount) %
                      menuOptionCount,
                  );
                } else if (mentionOptions.length > 0) {
                  selectMentionIndex(
                    (activeMentionIndex +
                      direction +
                      mentionOptions.length) %
                      mentionOptions.length,
                  );
                }
                return;
              }

              if (
                (event.key === 'Enter' && !event.shiftKey) ||
                event.key === 'Tab'
              ) {
                event.preventDefault();
                if (skillQuery !== null && activeGoalCommand) {
                  runGoalCommand();
                } else if (skillQuery !== null && activeCompactCommand) {
                  runCompactCommand();
                } else if (skillQuery !== null && activeSkill) {
                  insertSkillMention(activeSkill);
                } else if (activeMention) {
                  insertMention(activeMention);
                } else {
                  closeMentionMenu();
                  if (event.key === 'Enter') {
                    onSend();
                  }
                }
                return;
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                closeMentionMenu();
                return;
              }
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
              skillQuery === null &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          onKeyUp={(event) => {
            saveSelection();
            if (
              !['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(
                event.key,
              )
            ) {
              syncMentionTarget();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            saveSelection();
            const pastedText = event.clipboardData.getData('text/plain');
            const pasteRange = savedRangeRef.current?.cloneRange() ?? null;
            pasteQueueRef.current = pasteQueueRef.current.then(async () => {
              const handled = await onAttachmentPaste();
              if (!handled) {
                if (pasteRange) savedRangeRef.current = pasteRange;
                insertPlainTextAtSelection(
                  editorRef.current,
                  pastedText,
                  savedRangeRef,
                );
                syncEditorState();
              }
              editorRef.current?.focus();
            });
          }}
        />

        <div className="flex h-10 items-center gap-1 px-2 pb-1.5">
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) {
                const surfaceRect =
                  composerSurfaceRef.current?.getBoundingClientRect();
                const triggerRect =
                  addMenuTriggerRef.current?.getBoundingClientRect();
                setAddMenuLayout(
                  surfaceRect && triggerRect
                    ? {
                        sideOffset: Math.max(
                          8,
                          triggerRect.top - surfaceRect.top + 8,
                        ),
                        width: surfaceRect.width,
                      }
                    : null,
                );
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                aria-label="添加上下文与工具"
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                disabled={controlsDisabled}
                ref={addMenuTriggerRef}
                type="button"
              >
                <Plus size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              alignOffset={-8}
              className="max-h-[min(32rem,70vh)] overflow-y-auto rounded-xl p-1"
              data-composer-clearance={addMenuLayout?.sideOffset ?? 8}
              side="top"
              sideOffset={addMenuLayout?.sideOffset ?? 8}
              style={addMenuLayout ? { width: addMenuLayout.width } : undefined}
            >
              <DropdownMenuLabel className="px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                添加
              </DropdownMenuLabel>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="min-h-9 gap-2 rounded-lg px-2 py-1.5 text-[13px]">
                  <Paperclip size={16} />
                  <span>文件和文件夹</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40 rounded-xl p-1">
                  <DropdownMenuItem
                    className="min-h-8 gap-2 rounded-lg px-2 text-xs"
                    onSelect={() => onAttachmentSelect('file')}
                  >
                    <File size={15} />
                    选择文件
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-8 gap-2 rounded-lg px-2 text-xs"
                    onSelect={() => onAttachmentSelect('folder')}
                  >
                    <FolderOpen size={15} />
                    选择文件夹
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                disabled={Boolean(goalUnavailableReason) && !goalActive}
                className="min-h-9 gap-2 rounded-lg px-2 py-1.5 data-[disabled]:opacity-60"
                title={goalUnavailableReason ?? undefined}
                onSelect={() => onGoalModeChange(true)}
              >
                <Goal className="text-muted-foreground" size={16} />
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-[13px] font-medium">目标</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {goalActive
                      ? '当前任务已有持续目标'
                      : goalDraftMode
                        ? '正在定义目标'
                        : goalUnavailableReason || '设置要持续追求的目标'}
                  </span>
                </span>
                {goalActive || goalDraftMode ? (
                  <Check className="ml-auto" size={14} />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  modeSwitchDisabled ||
                  !planModeAvailable ||
                  goalActive ||
                  goalDraftMode
                }
                className="min-h-9 gap-2 rounded-lg px-2 py-1.5 data-[disabled]:opacity-60"
                onSelect={() =>
                  onCollaborationModeChange(
                    collaborationMode === 'plan' ? 'default' : 'plan',
                  )
                }
              >
                <Lightbulb className="text-muted-foreground" size={16} />
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-[13px] font-medium">计划模式</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {collaborationMode === 'plan'
                      ? '已开启计划模式'
                      : goalActive || goalDraftMode
                        ? '请先清除目标'
                      : planModeAvailable
                        ? '开启计划模式'
                        : planModeUnavailableReason || '当前模型不可用'}
                  </span>
                </span>
                {collaborationMode === 'plan' ? (
                  <Check className="ml-auto" size={14} />
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-0.5" />
              <DropdownMenuLabel className="px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                插件
              </DropdownMenuLabel>
              {pluginOptions.map((plugin) => (
                <DropdownMenuItem
                  className="min-h-9 gap-2 rounded-lg px-2 py-1.5"
                  key={plugin.id}
                  onSelect={() => insertPluginMention(plugin)}
                >
                  <PluginIcon plugin={plugin} />
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-[13px] font-medium">
                      {plugin.displayName}
                    </span>
                    {plugin.description ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {plugin.description}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))}
              {pluginStatus === 'ready' && pluginOptions.length === 0 ? (
                <DropdownMenuItem disabled className="min-h-8 gap-2 rounded-lg px-2 text-xs">
                  <Puzzle size={15} />
                  未检测到已安装插件
                </DropdownMenuItem>
              ) : null}
              {pluginStatus === 'idle' || pluginStatus === 'loading' ? (
                <DropdownMenuItem
                  disabled
                  className="min-h-8 gap-2 rounded-lg px-2 text-xs"
                >
                  <LoaderCircle className="animate-spin" size={15} />
                  正在加载插件…
                </DropdownMenuItem>
              ) : null}
              {pluginStatus === 'error' ? (
                <DropdownMenuItem
                  className="min-h-8 gap-2 rounded-lg px-2 text-xs"
                  onSelect={(event) => {
                    event.preventDefault();
                    onDetectPlugins();
                  }}
                >
                  <Puzzle size={15} />
                  插件加载失败，重试
                </DropdownMenuItem>
              ) : null}
              {pluginLoadWarning ? (
                <DropdownMenuLabel className="px-2 py-0.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                  {pluginLoadWarning}
                </DropdownMenuLabel>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`权限模式：${permissionModeLabel(permissionMode)}`}
                className={cn(
                  'inline-flex h-7 max-w-32 items-center gap-1 truncate rounded-md px-1.5 text-[11px] transition-colors hover:bg-accent',
                  permissionMode === 'full'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-amber-600 dark:text-amber-400',
                )}
                disabled={controlsDisabled}
                type="button"
              >
                {permissionMode === 'full' ? (
                  <ShieldAlert size={13} />
                ) : permissionMode === 'readOnly' ? (
                  <Eye size={13} />
                ) : (
                  <ShieldCheck size={13} />
                )}
                <span className="truncate">{permissionModeLabel(permissionMode)}</span>
                <ChevronDown size={11} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72" side="top">
              <DropdownMenuLabel>Codex 权限</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={permissionMode}
                onValueChange={(value) =>
                  onPermissionModeChange(value as PermissionModeId)
                }
              >
                <PermissionModeItem
                  description="编辑工作区外文件或使用互联网时询问"
                  icon={<Hand size={15} />}
                  label="请求审批"
                  disabled={
                    permissionSwitchDisabled ||
                    !approvalPolicyAvailability.onRequest ||
                    !profileAllowed(':workspace')
                  }
                  value="ask"
                />
                <PermissionModeItem
                  description="仅对检测到的风险操作自动评估"
                  disabled={
                    !autoReviewAvailable ||
                    permissionSwitchDisabled ||
                    !approvalPolicyAvailability.onRequest ||
                    !profileAllowed(':workspace')
                  }
                  icon={<ShieldCheck size={15} />}
                  label="替我审批"
                  value="auto"
                />
                <PermissionModeItem
                  description="不受限制地访问本机文件和互联网"
                  icon={<ShieldAlert size={15} />}
                  label="完全访问权限"
                  disabled={
                    permissionSwitchDisabled ||
                    !approvalPolicyAvailability.never ||
                    !profileAllowed(':danger-full-access')
                  }
                  value="full"
                />
                <PermissionModeItem
                  description="默认只读，修改前必须请求授权"
                  icon={<Eye size={15} />}
                  label="只读访问"
                  disabled={
                    permissionSwitchDisabled ||
                    !approvalPolicyAvailability.onRequest ||
                    !profileAllowed(':read-only')
                  }
                  value="readOnly"
                />
                {permissionProfiles.some(
                  (profile) => !profile.id.startsWith(':'),
                ) ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>自定义（config.toml）</DropdownMenuLabel>
                    {permissionProfiles
                      .filter((profile) => !profile.id.startsWith(':'))
                      .map((profile) => (
                        <PermissionModeItem
                          description={
                            profile.description || '使用 Codex 配置中的命名权限配置'
                          }
                          disabled={
                            !profile.allowed ||
                            permissionSwitchDisabled ||
                            !approvalPolicyAvailability.onRequest
                          }
                          icon={<ShieldCheck size={15} />}
                          key={profile.id}
                          label={profile.id}
                          value={`profile:${profile.id}`}
                        />
                      ))}
                  </>
                ) : null}
              </DropdownMenuRadioGroup>
              {permissionSwitchDisabled ? (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-1.5 py-1 text-[10px] leading-4 text-muted-foreground">
                    当前任务运行中或等待审批，完成后可切换权限。
                  </p>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {goalActive || goalDraftMode ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <button
                aria-label={goalDraftMode ? '退出目标模式' : '当前目标'}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                type="button"
                onClick={() => onGoalModeChange(goalActive)}
              >
                <Goal size={14} />
                目标
              </button>
            </>
          ) : null}

          {collaborationMode === 'plan' && !goalActive && !goalDraftMode ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <button
                aria-label="退出计划模式"
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
                disabled={modeSwitchDisabled}
                title="退出计划模式"
                type="button"
                onClick={() => onCollaborationModeChange('default')}
              >
                <Lightbulb size={14} />
                计划
              </button>
            </>
          ) : null}

          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            {preparing ? (
              <span
                aria-live="polite"
                className="mr-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              >
                <LoaderCircle className="animate-spin" size={12} />
                正在准备
              </span>
            ) : null}
            <ContextUsageIndicator
              compacting={compacting}
              usage={contextUsage}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 max-w-32 items-center gap-1 truncate rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  disabled={controlsDisabled || models.length === 0}
                  type="button"
                >
                  <span className="truncate">
                    {selectedModelInfo?.displayName ||
                      (modelCatalogStatus === 'loading'
                        ? '正在加载模型'
                        : 'Codex 默认模型')}
                  </span>
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto" side="top">
                <DropdownMenuLabel>模型</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={selectedModel} onValueChange={onModelChange}>
                  {models.map((model) => (
                    <DropdownMenuRadioItem
                      disabled={
                        collaborationMode === 'plan' &&
                        !model.supportedReasoningEfforts.some(
                          (option) => option.reasoningEffort === 'medium',
                        )
                      }
                      key={model.model}
                      value={model.model}
                    >
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
                  disabled={
                    controlsDisabled ||
                    collaborationMode === 'plan' ||
                    effortOptions.length === 0
                  }
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

            <button
              aria-label="预编辑选区"
              className="ml-1 flex size-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              disabled={Boolean(inlineAiUnavailableReason)}
              title={
                inlineAiUnavailableReason ??
                '使用当前指令预编辑选中的普通文本'
              }
              type="button"
              onClick={onInlineAi}
            >
              {inlineAiRunning ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <FilePenLine size={14} />
              )}
            </button>

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
                disabled={
                  runtimeUnavailable ||
                  submitting ||
                  inputBlocked ||
                  (!value.trim() && attachments.length === 0)
                }
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

function ContextUsageIndicator({
  compacting,
  usage,
}: {
  compacting: boolean;
  usage: CodexThreadTokenUsage | null;
}) {
  const percent = contextUsagePercent(usage);
  const remainingPercent = percent === null ? null : 100 - percent;
  const label = compacting
    ? '背景信息窗口：正在压缩'
    : percent === null
      ? '背景信息窗口：发送首条消息后显示'
      : `背景信息窗口：${percent}% 已用`;

  return (
    <HoverCard openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          aria-label={label}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <ContextUsageProgress compacting={compacting} percent={percent} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="center"
        className="w-auto min-w-[190px] rounded-xl px-4 py-2.5 text-center"
        side="top"
        sideOffset={8}
      >
        <div aria-label="上下文用量" role="status">
          <div className="text-[13px] leading-5 text-muted-foreground">
            背景信息窗口：
          </div>
          <div className="mt-0.5 text-[15px] font-medium leading-5">
            {compacting
              ? '正在压缩'
              : percent === null
                ? '发送首条消息后显示'
                : `${percent}% 已用（剩余 ${remainingPercent}%）`}
          </div>
          {usage?.modelContextWindow ? (
            <div className="mt-0.5 whitespace-nowrap text-[15px] font-medium leading-5">
              已用 {formatTokenCount(usage.last.totalTokens)} 标记，共{' '}
              {formatTokenCount(usage.modelContextWindow)}
            </div>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

const CONTEXT_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 10;

function ContextUsageProgress({
  compacting,
  percent,
}: {
  compacting: boolean;
  percent: number | null;
}) {
  const normalizedPercent = percent ?? 0;
  const progressLength =
    (CONTEXT_PROGRESS_CIRCUMFERENCE * normalizedPercent) / 100;

  return (
    <span
      aria-hidden="true"
      className="relative flex size-[15px] items-center justify-center"
      data-context-percent={normalizedPercent}
      data-testid="context-usage-progress"
    >
      <Circle
        className="absolute inset-0 text-muted-foreground/25"
        size={15}
        strokeWidth={3}
      />
      {compacting ? (
        <LoaderCircle className="animate-spin" size={15} strokeWidth={3} />
      ) : (
        <Circle
          className="absolute inset-0 text-muted-foreground"
          data-testid="context-usage-progress-arc"
          size={15}
          strokeWidth={3}
          style={{
            strokeDasharray: `${progressLength} ${CONTEXT_PROGRESS_CIRCUMFERENCE}`,
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            transition: 'stroke-dasharray 180ms ease-out',
          }}
        />
      )}
    </span>
  );
}

function MentionMenu({
  activeIndex,
  currentDocumentPath,
  currentDrawingId,
  documents,
  drawings,
  listboxId,
  query,
  onActiveIndexChange,
  onClose,
  onSelect,
}: {
  activeIndex: number;
  currentDocumentPath: string | null;
  currentDrawingId: string | null;
  documents: AiDocumentReference[];
  drawings: AiDrawingReference[];
  listboxId: string;
  query: string;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  onSelect: (reference: AiDocumentReference | AiDrawingReference) => void;
}) {
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  React.useLayoutEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-30 overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 font-sans shadow-none"
      data-mention-menu
    >
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>@ 提及文档或图稿{query ? ` · ${query}` : ''}</span>
        <button
          aria-label="关闭提及列表"
          className="rounded-sm p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      <div
        aria-label="提及工作区文档或图稿"
        className="scrollbar-thin max-h-56 overflow-y-auto"
        id={listboxId}
        role="listbox"
      >
        {documents.length === 0 && drawings.length === 0 ? (
          <div className="px-2 py-5 text-center text-xs text-muted-foreground">
            没有匹配的文档或图稿
          </div>
        ) : (
          <>
            {documents.length > 0 ? (
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium text-muted-foreground">
                文档
              </div>
            ) : null}
            {documents.map((document, index) => {
              const isCurrentDocument =
                document.absolutePath === currentDocumentPath;
              return (
                <button
                  aria-label={`提及 ${document.title || document.name}${isCurrentDocument ? '，当前文档' : ''}`}
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left outline-none',
                    index === activeIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60',
                  )}
                  id={mentionOptionId(listboxId, index)}
                  key={document.absolutePath}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => onActiveIndexChange(index)}
                  onClick={() => onSelect(document)}
                >
                  <FileText className="shrink-0 text-muted-foreground" size={14} />
                  <MentionOptionText
                    badge={isCurrentDocument ? '当前文档' : null}
                    detail={document.relativePath}
                    label={document.title || document.name}
                    query={query}
                  />
                </button>
              );
            })}
            {drawings.length > 0 ? (
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground">
                图稿
              </div>
            ) : null}
            {drawings.map((drawing, drawingIndex) => {
              const index = documents.length + drawingIndex;
              const isCurrentDrawing = drawing.id === currentDrawingId;
              return (
                <button
                  aria-label={`提及 ${drawing.title}${isCurrentDrawing ? '，当前图稿' : ''}`}
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left outline-none',
                    index === activeIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60',
                  )}
                  id={mentionOptionId(listboxId, index)}
                  key={drawing.id}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => onActiveIndexChange(index)}
                  onClick={() => onSelect(drawing)}
                >
                  <Blocks className="shrink-0 text-muted-foreground" size={14} />
                  <MentionOptionText
                    badge={isCurrentDrawing ? '当前图稿' : null}
                    detail={drawing.albumPath || '未归类'}
                    label={drawing.title}
                    query={query}
                  />
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function MentionOptionText({
  badge,
  detail,
  label,
  query,
}: {
  badge: string | null;
  detail: string;
  label: string;
  query: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        <span className="truncate">
          <MentionMatchedText query={query} text={label} />
        </span>
        {badge ? (
          <span className="shrink-0 rounded border border-border/70 bg-muted/45 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        <MentionMatchedText query={query} text={detail} />
      </div>
    </div>
  );
}

function SkillMenu({
  activeIndex,
  compacting,
  compactUnavailableReason,
  contextUsage,
  goalActive,
  goalUnavailableReason,
  listboxId,
  query,
  showGoalCommand,
  showCompactCommand,
  skills,
  status,
  onActiveIndexChange,
  onSelectCompact,
  onSelectGoal,
  onSelect,
}: {
  activeIndex: number;
  compacting: boolean;
  compactUnavailableReason: string | null;
  contextUsage: CodexThreadTokenUsage | null;
  goalActive: boolean;
  goalUnavailableReason: string | null;
  listboxId: string;
  query: string;
  showGoalCommand: boolean;
  showCompactCommand: boolean;
  skills: AiSkillMentionOption[];
  status: ControlLoadStatus;
  onActiveIndexChange: (index: number) => void;
  onSelectCompact: () => void;
  onSelectGoal: () => void;
  onSelect: (skill: AiSkillMentionOption) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const goalOffset = showGoalCommand ? 1 : 0;
  const compactIndex = showCompactCommand ? goalOffset : -1;
  const commandOffset = goalOffset + (showCompactCommand ? 1 : 0);
  const usagePercent = contextUsagePercent(contextUsage);

  React.useLayoutEffect(() => {
    if (activeIndex < 0) return;
    const list = listRef.current;
    const option = optionRefs.current[activeIndex];
    if (!list || !option) return;

    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < listRect.top) {
      list.scrollTop -= listRect.top - optionRect.top;
    } else if (optionRect.bottom > listRect.bottom) {
      list.scrollTop += optionRect.bottom - listRect.bottom;
    }
  }, [activeIndex]);

  return (
    <div
      className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-30 overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 shadow-none"
      data-skill-menu
    >
      <div
        aria-label="选择命令或 Skill"
        className="scrollbar-thin max-h-72 overflow-y-auto"
        id={listboxId}
        ref={listRef}
        role="listbox"
      >
        {showGoalCommand ? (
          <button
            aria-disabled={Boolean(goalUnavailableReason) && !goalActive}
            aria-label="目标"
            aria-selected={activeIndex === 0}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
              activeIndex === 0
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60',
              goalUnavailableReason && !goalActive &&
                'cursor-not-allowed opacity-55',
            )}
            disabled={Boolean(goalUnavailableReason) && !goalActive}
            id={mentionOptionId(listboxId, 0)}
            ref={(element) => {
              optionRefs.current[0] = element;
            }}
            role="option"
            title={goalUnavailableReason ?? undefined}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => onActiveIndexChange(0)}
            onClick={onSelectGoal}
          >
            <Goal className="shrink-0 text-muted-foreground" size={15} />
            <span className="shrink-0 text-xs font-medium">目标</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {goalActive
                ? '当前任务已有持续目标'
                : goalUnavailableReason || '设置要持续追求的目标'}
            </span>
          </button>
        ) : null}
        {showCompactCommand ? (
          <button
            aria-disabled={Boolean(compactUnavailableReason)}
            aria-label={compacting ? '正在压缩上下文' : '压缩上下文'}
            aria-selected={activeIndex === compactIndex}
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
              activeIndex === compactIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60',
              compactUnavailableReason && 'cursor-not-allowed opacity-55',
            )}
            disabled={Boolean(compactUnavailableReason)}
            id={mentionOptionId(listboxId, compactIndex)}
            ref={(element) => {
              optionRefs.current[compactIndex] = element;
            }}
            role="option"
            title={compactUnavailableReason ?? undefined}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => onActiveIndexChange(compactIndex)}
            onClick={onSelectCompact}
          >
            <LoaderCircle
              className={cn(
                'shrink-0 text-muted-foreground',
                compacting && 'animate-spin',
              )}
              size={15}
            />
            <span className="shrink-0 text-xs font-medium">
              {compacting ? '正在压缩' : '压缩'}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {compactUnavailableReason ||
                (usagePercent === null
                  ? '压缩此任务的上下文'
                  : `压缩此任务的上下文（已占用 ${usagePercent}%）`)}
            </span>
          </button>
        ) : null}
        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          技能
        </div>
        {status === 'loading' || status === 'idle' ? (
          <div className="flex items-center justify-center gap-2 px-2 py-5 text-xs text-muted-foreground">
            <LoaderCircle className="animate-spin" size={14} />
            正在加载技能…
          </div>
        ) : status === 'error' ? (
          <div className="px-2 py-5 text-center text-xs text-muted-foreground">
            技能暂时无法读取
          </div>
        ) : skills.length === 0 ? (
          <div className="px-2 py-5 text-center text-xs text-muted-foreground">
            {query ? '没有匹配的技能' : '没有可用的技能'}
          </div>
        ) : (
          skills.map((skill, skillIndex) => {
            const index = skillIndex + commandOffset;
            return (
            <button
              aria-label={`选择 ${skill.displayName}`}
              aria-selected={index === activeIndex}
              className={cn(
                'flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
                index === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/60',
              )}
              id={mentionOptionId(listboxId, index)}
              key={skill.path}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => onActiveIndexChange(index)}
              onClick={() => onSelect(skill)}
            >
              <Box className="shrink-0 text-muted-foreground" size={15} />
              <span className="shrink-0 truncate text-xs font-medium">
                <MentionMatchedText query={query} text={skill.displayName} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {skill.description}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground/70">
                {skillScopeLabel(skill.scope)}
              </span>
            </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MentionMatchedText({ query, text }: { query: string; text: string }) {
  const matchedIndices = new Set(mentionMatchIndices(text, query));
  if (matchedIndices.size === 0) {
    return text;
  }

  return Array.from(text).map((character, index) =>
    matchedIndices.has(index) ? (
      <span className="font-medium text-foreground" key={`${index}-${character}`}>
        {character}
      </span>
    ) : (
      character
    ),
  );
}

function mentionOptionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`;
}

function compactCommandMatches(query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    normalized.length === 0 ||
    'compact'.includes(normalized) ||
    '压缩'.includes(normalized)
  );
}

function goalCommandMatches(query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return (
    normalized.length === 0 ||
    'goal'.includes(normalized) ||
    '目标'.includes(normalized)
  );
}

function contextUsagePercent(usage: CodexThreadTokenUsage | null) {
  if (!usage?.modelContextWindow) return null;
  return Math.min(
    100,
    Math.max(
      0,
      Math.floor((usage.last.totalTokens / usage.modelContextWindow) * 100),
    ),
  );
}

function formatTokenCount(value: number) {
  if (value < 1_000) return String(value);
  const divisor = value >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000 ? 'm' : 'k';
  const scaled = value / divisor;
  return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}

function ContextChip({
  dismissible = false,
  icon,
  label,
  onDismiss,
  title,
}: {
  dismissible?: boolean;
  icon?: React.ReactNode;
  label: string;
  onDismiss?: () => void;
  title?: string;
}) {
  return (
    <span
      className="inline-flex h-6 max-w-52 items-center gap-1 rounded-md border border-border/70 bg-muted/35 px-1.5 text-[10px] text-muted-foreground"
      title={title}
    >
      {icon ?? <FileText size={11} />}
      <span className="truncate">{label}</span>
      {dismissible ? (
        <button aria-label={`移除 ${label}`} type="button" onClick={onDismiss}>
          <X size={10} />
        </button>
      ) : null}
    </span>
  );
}

function createDocumentMentionElement(document: AiDocumentReference) {
  const mention = window.document.createElement('span');
  const label = getDocumentContextLabel(document);

  mention.className = composerMentionClassName;
  mention.contentEditable = 'false';
  mention.dataset.mentionId = document.id;
  mention.dataset.mentionKind = 'document';
  mention.dataset.mentionName = document.name;
  mention.dataset.mentionPath = document.absolutePath;
  mention.dataset.mentionRelativePath = document.relativePath;
  mention.dataset.mentionTitle = document.title || '';
  mention.dataset.mentionLabel = label;
  mention.setAttribute('aria-label', label);
  mention.setAttribute('role', 'link');
  mention.title = getDocumentContextTitle(document);
  mention.tabIndex = 0;
  appendMentionImage(mention, '/icons/mentions/file-text.svg');
  mention.append(window.document.createTextNode(label));

  return mention;
}

function createDrawingMentionElement(drawing: AiDrawingReference) {
  const mention = window.document.createElement('span');

  mention.className = composerMentionClassName;
  mention.contentEditable = 'false';
  mention.dataset.mentionAlbumPath = drawing.albumPath;
  mention.dataset.mentionDrawingKind = drawing.drawingKind;
  mention.dataset.mentionItemCount = String(drawing.itemCount);
  mention.dataset.mentionHasPreview = String(drawing.hasPreview);
  mention.dataset.mentionId = drawing.id;
  mention.dataset.mentionKind = 'drawing';
  mention.dataset.mentionLabel = drawing.title;
  mention.dataset.mentionName = drawing.title;
  mention.dataset.mentionPath = createDrawingMentionPath(drawing.id);
  mention.dataset.mentionRevision = String(drawing.revision);
  mention.setAttribute('aria-label', drawing.title);
  mention.setAttribute('role', 'link');
  mention.title = drawing.albumPath
    ? `${drawing.title} · ${drawing.albumPath}`
    : drawing.title;
  mention.tabIndex = 0;
  appendMentionImage(mention, '/icons/mentions/box.svg');
  mention.append(window.document.createTextNode(drawing.title));

  return mention;
}

function getDocumentContextLabel(document: AiDocumentReference) {
  return document.relativePath || document.name;
}

function getDocumentContextTitle(document: AiDocumentReference) {
  const label = getDocumentContextLabel(document);
  return document.title && document.title !== label
    ? `${document.title} · ${label}`
    : label;
}

function createPluginMentionElement(plugin: AiPluginMentionOption) {
  const mention = window.document.createElement('span');
  const label = plugin.displayName;

  mention.className = cn(composerMentionClassName, 'cursor-default no-underline');
  mention.contentEditable = 'false';
  mention.dataset.mentionDescription = plugin.description ?? '';
  mention.dataset.mentionId = plugin.id;
  mention.dataset.mentionKind = 'plugin';
  mention.dataset.mentionLabel = label;
  mention.dataset.mentionName = plugin.displayName;
  mention.dataset.mentionPath = plugin.mentionPath;
  mention.setAttribute('aria-label', label);
  mention.setAttribute('role', 'note');
  mention.tabIndex = 0;
  const lightIcon = plugin.iconUrl ?? '/icons/mentions/puzzle.svg';
  const darkIcon = plugin.darkIconUrl ?? lightIcon;
  const hasDistinctDarkIcon = darkIcon !== lightIcon;
  appendMentionImage(
    mention,
    lightIcon,
    hasDistinctDarkIcon ? 'dark:hidden' : '',
    '/icons/mentions/puzzle.svg',
  );
  if (hasDistinctDarkIcon) {
    appendMentionImage(
      mention,
      darkIcon,
      'hidden dark:block',
      '/icons/mentions/puzzle.svg',
    );
  }
  mention.append(window.document.createTextNode(label));

  return mention;
}

function createSkillMentionElement(skill: AiSkillMentionOption) {
  const mention = window.document.createElement('span');

  mention.className = cn(composerMentionClassName, 'cursor-default no-underline');
  mention.contentEditable = 'false';
  mention.dataset.mentionDescription = skill.description;
  mention.dataset.mentionKind = 'skill';
  mention.dataset.mentionLabel = skill.displayName;
  mention.dataset.mentionName = skill.name;
  mention.dataset.mentionPath = skill.path;
  mention.dataset.mentionScope = skill.scope;
  mention.setAttribute('aria-label', skill.displayName);
  mention.setAttribute('role', 'note');
  mention.tabIndex = 0;
  appendMentionImage(mention, '/icons/mentions/box.svg');
  mention.append(window.document.createTextNode(skill.displayName));

  return mention;
}

function appendMentionImage(
  parent: HTMLElement,
  src: string,
  extraClassName = '',
  fallbackSrc?: string,
) {
  const image = window.document.createElement('img');
  image.alt = '';
  image.ariaHidden = 'true';
  image.className = cn('size-4 shrink-0 object-contain', extraClassName);
  image.draggable = false;
  image.referrerPolicy = 'no-referrer';
  image.src = src;
  image.dataset.mentionIcon = '';
  if (fallbackSrc && fallbackSrc !== src) {
    image.addEventListener('error', () => {
      image.dataset.mentionIconFallback = '';
      image.src = fallbackSrc;
    }, { once: true });
  }
  parent.append(image);
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

function getComposerMentionTarget(editor: HTMLElement | null) {
  const selection = window.getSelection();
  if (
    !editor ||
    !selection ||
    selection.rangeCount === 0 ||
    !selection.isCollapsed
  ) {
    return null;
  }

  const selectionRange = selection.getRangeAt(0);
  if (!editor.contains(selectionRange.commonAncestorContainer)) {
    return null;
  }

  const selectionElement =
    selectionRange.startContainer instanceof Element
      ? selectionRange.startContainer
      : selectionRange.startContainer.parentElement;
  if (selectionElement?.closest('[data-mention-path]')) {
    return null;
  }

  const prefixRange = window.document.createRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(
    selectionRange.startContainer,
    selectionRange.startOffset,
  );
  const suffixRange = window.document.createRange();
  suffixRange.selectNodeContents(editor);
  suffixRange.setStart(
    selectionRange.endContainer,
    selectionRange.endOffset,
  );

  const prefix = prefixRange.toString();
  const text = `${prefix}${suffixRange.toString()}`;
  const documentToken = findMentionToken(text, prefix.length);
  const skillToken = findSkillToken(text, prefix.length);
  const token = documentToken ?? skillToken;
  if (!token) {
    return null;
  }

  const start = findTextPosition(editor, token.start);
  const end = findTextPosition(editor, token.end);
  if (!start || !end) {
    return null;
  }

  const range = window.document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return {
    kind: documentToken ? 'document' : 'skill',
    key: `${documentToken ? 'document' : 'skill'}:${token.start}:${token.end}:${prefix.length}:${text}`,
    query: token.query,
    range,
  } satisfies ComposerMentionTarget;
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
      if (node.dataset.mentionKind === 'drawing') {
        const drawingId = parseDrawingMentionPath(node.dataset.mentionPath);
        if (drawingId) {
          mentions.push({
            albumPath: node.dataset.mentionAlbumPath ?? '',
            drawingKind:
              node.dataset.mentionDrawingKind === 'mindmap'
                ? 'mindmap'
                : 'whiteboard',
            drawingId,
            itemCount: Number(node.dataset.mentionItemCount ?? 0),
            end: value.length,
            hasPreview: node.dataset.mentionHasPreview === 'true',
            id: drawingId,
            kind: 'drawing',
            label,
            path: node.dataset.mentionPath,
            revision: Number(node.dataset.mentionRevision ?? 0),
            start,
            title: node.dataset.mentionName || label,
          });
        }
      } else if (node.dataset.mentionKind === 'plugin') {
        mentions.push({
          description: node.dataset.mentionDescription || null,
          end: value.length,
          id: node.dataset.mentionId ?? '',
          kind: 'plugin',
          label,
          name: node.dataset.mentionName ?? '',
          path: node.dataset.mentionPath,
          start,
        });
      } else if (node.dataset.mentionKind === 'skill') {
        mentions.push({
          description: node.dataset.mentionDescription ?? '',
          displayName: label,
          end: value.length,
          kind: 'skill',
          label,
          name: node.dataset.mentionName ?? '',
          path: node.dataset.mentionPath,
          scope: (node.dataset.mentionScope ?? 'user') as CodexSkillScope,
          start,
        });
      } else {
        mentions.push({
          absolutePath: node.dataset.mentionPath,
          end: value.length,
          id: node.dataset.mentionId ?? '',
          kind: 'document',
          label,
          name: node.dataset.mentionName ?? '',
          path: node.dataset.mentionPath,
          relativePath: node.dataset.mentionRelativePath ?? '',
          start,
          title: node.dataset.mentionTitle || undefined,
        });
      }
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

function uniqueDrawings(drawings: AiComposerDrawingMention[]) {
  const seen = new Set<string>();
  return drawings.filter((drawing) => {
    if (seen.has(drawing.id)) return false;
    seen.add(drawing.id);
    return true;
  });
}

function isDrawingReference(
  reference: AiDocumentReference | AiDrawingReference,
): reference is AiDrawingReference {
  return 'albumPath' in reference && !('absolutePath' in reference);
}

function isDocumentComposerMention(
  mention: AiComposerMention,
): mention is AiComposerDocumentMention {
  return mention.kind === 'document';
}

function isPluginComposerMention(
  mention: AiComposerMention,
): mention is AiComposerPluginMention {
  return mention.kind === 'plugin';
}

function isDrawingComposerMention(
  mention: AiComposerMention,
): mention is AiComposerDrawingMention {
  return mention.kind === 'drawing';
}

function isSkillComposerMention(
  mention: AiComposerMention,
): mention is AiComposerSkillMention {
  return mention.kind === 'skill';
}

function modelSupportsImages(model: CodexModel | null) {
  return model?.inputModalities?.includes('image') ?? true;
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${globalThis.btoa(binary)}`;
}

function attachmentSecondaryLabel(attachment: DisplayAttachment) {
  const extension = attachment.name.includes('.')
    ? attachment.name.split('.').at(-1)?.toLocaleUpperCase()
    : null;
  const size = formatAttachmentSize(attachment.sizeBytes);
  return [extension || '文件', size].filter(Boolean).join(' · ');
}

function formatAttachmentSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes < 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KiB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function uniqueContextAttachments(attachments: CodexContextAttachment[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    if (seen.has(attachment.attachmentId)) return false;
    seen.add(attachment.attachmentId);
    return true;
  });
}

function uniquePluginOptions(options: AiPluginMentionOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function uniqueSkillOptions(options: AiSkillMentionOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.path)) return false;
    seen.add(option.path);
    return true;
  });
}

function rankSkillOptions(
  options: AiSkillMentionOption[],
  query: string,
  excludedPaths: ReadonlySet<string>,
) {
  const normalizedQuery = query.trim().normalize('NFKC').toLocaleLowerCase();
  return options
    .flatMap((skill, order) => {
      if (excludedPaths.has(skill.path)) return [];
      if (!normalizedQuery) return [{ order, score: 0, skill }];
      const fields = [skill.displayName, skill.name, skill.description];
      const score = fields.reduce((best, field, index) => {
        const normalized = field.normalize('NFKC').toLocaleLowerCase();
        const exactIndex = normalized.indexOf(normalizedQuery);
        if (exactIndex >= 0) {
          return Math.max(best, 10_000 - index * 1_000 - exactIndex);
        }
        return mentionMatchIndices(field, normalizedQuery).length > 0
          ? Math.max(best, 1_000 - index * 100)
          : best;
      }, -1);
      return score < 0 ? [] : [{ order, score, skill }];
    })
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ skill }) => skill);
}

function skillScopeLabel(scope: CodexSkillScope) {
  if (scope === 'repo') return '工作区';
  if (scope === 'system') return '系统';
  if (scope === 'admin') return '管理员';
  return '个人';
}

function formatSkillDisplayName(name: string) {
  return name
    .split(':')
    .map((part) =>
      part
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
        .join(' '),
    )
    .join(': ');
}

async function resolvePluginIconUrl(
  pluginInterface: CodexPluginInterface | null,
  theme: 'dark' | 'light',
  localIconCache: Map<string, Promise<string | null>>,
) {
  if (!pluginInterface) return null;

  const candidates: Array<{ kind: 'local' | 'remote'; value?: string | null }> = [
    { kind: 'local', value: pluginInterface.composerIcon },
    { kind: 'remote', value: pluginInterface.composerIconUrl },
    ...(theme === 'dark'
      ? [
          { kind: 'local' as const, value: pluginInterface.logoDark },
          { kind: 'local' as const, value: pluginInterface.logo },
          { kind: 'remote' as const, value: pluginInterface.logoUrlDark },
          { kind: 'remote' as const, value: pluginInterface.logoUrl },
        ]
      : [
          { kind: 'local' as const, value: pluginInterface.logo },
          { kind: 'remote' as const, value: pluginInterface.logoUrl },
        ]),
  ];

  for (const candidate of candidates) {
    const value = candidate.value?.trim();
    if (!value) continue;
    if (candidate.kind === 'remote') {
      const remoteUrl = safeHttpsPluginIconUrl(value);
      if (remoteUrl) return remoteUrl;
      continue;
    }

    let pending = localIconCache.get(value);
    if (!pending) {
      pending = readCodexPluginIcon(value)
        .then(({ base64Data, mediaType }) =>
          `data:${mediaType};base64,${base64Data}`,
        )
        .catch(() => null);
      localIconCache.set(value, pending);
    }
    const localUrl = await pending;
    if (localUrl) return localUrl;
  }

  return null;
}

function safeHttpsPluginIconUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
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
    max: '最高',
    ultra: '超级',
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

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'AI 预编辑已取消。')
  );
}

function formatInlineSelectionError(code: string, fallback: string) {
  if (code === 'no-selection') {
    return '请先在编辑器中选择要预编辑的普通文本。';
  }
  if (code === 'unsupported-selection') {
    return '宿主预编辑仅支持普通文本选区；表格请使用编辑器内置 Ask AI，代码块和媒体暂不支持。';
  }
  if (code === 'readonly') {
    return '当前文档为只读或 View 模式，无法预编辑。';
  }
  if (code === 'active-review') {
    return '请先接受或舍弃当前预编辑结果。';
  }
  if (code === 'stale-context' || code === 'conflict') {
    return '选区内容已变化，预编辑已停止，请重新选择后再试。';
  }
  return fallback;
}

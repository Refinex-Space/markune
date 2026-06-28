'use client';

// @author refinex
// AI 侧边面板整合组件：组装 A-J 子项目的渲染层为完整可用面板。
// 替换旧 AiPanelContent（4400 行单体），用新的 parts 纵向流架构。
// 接收与旧组件相同的核心 props（workspaceRootPath/currentDocument/selectedTextContext），
// 内部用 useConversationManager + useAiChat + AiConversationView + AiComposer。
// 工作区感知：buildAiContextPack 把当前文档作为引用自动附加。

import * as React from 'react';

import { buildAiContextPack } from './ai-context';
import { useConversationManager } from './ai-conversation-manager';
import { createDefaultAiChatTransport, type AiChatTransport } from './ai-chat-transport';
import { listAiAgentProfiles } from '../workspace-api';
import type { AiAgentProfile } from './ai-types';
import type { AiContextPack, AiSelectionContext } from './ai-types';
import type { PermissionRequestChunk } from './ai-contracts';
import type { WorkspaceNode } from '../workspace-types';
import type { DocumentPanelData } from '../ai-side-panel';
import { AiConversationView } from './rendering/ai-conversation-view';
import { AiComposer } from './rendering/ai-composer';
import { AiModeSelector, type AiMode } from './rendering/ai-mode-selector';
import { AiPermissionPrompt } from './rendering/ai-permission-prompt';
import type { MentionOption } from './rendering/ai-mention-serializer';

export interface AiSidePanelContentProps {
  currentDocument: WorkspaceNode | null;
  documentPanelData: DocumentPanelData | null;
  selectedTextContext?: AiSelectionContext | null;
  settingsVersion?: number;
  workspaceRootPath: string | null;
  onClearSelectedTextContext?: () => void;
  onMarkdownDocumentApplied?: (path: string, markdown: string) => void;
  onOpenSettings?: () => void;
}

export function AiSidePanelContent({
  currentDocument,
  documentPanelData,
  selectedTextContext,
  settingsVersion = 0,
  workspaceRootPath,
  onOpenSettings,
}: AiSidePanelContentProps) {
  const [profiles, setProfiles] = React.useState<AiAgentProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<AiMode>('agent');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [transport, setTransport] = React.useState<AiChatTransport | null>(null);
  const [pendingPermission, setPendingPermission] = React.useState<PermissionRequestChunk | null>(null);

  // 加载 profiles
  React.useEffect(() => {
    if (!workspaceRootPath) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        const list = await listAiAgentProfiles(workspaceRootPath);
        if (cancelled) return;
        setProfiles(list);
        setSelectedProfileId((prev) => prev ?? list[0]?.id ?? null);
      } catch {
        // 加载失败静默
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath, settingsVersion]);

  // 对话管理
  const conv = useConversationManager(workspaceRootPath ?? '');

  // 自动新建首个对话（当有 profile 且无当前对话时）
  React.useEffect(() => {
    if (!workspaceRootPath || !selectedProfileId) return;
    if (conv.currentId || conv.loading) return;
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      await conv.createConversation({
        profileId: selectedProfileId,
        providerId: profile.providerId,
        documentPath: currentDocument?.absolutePath,
        documentTitle: currentDocument?.title ?? currentDocument?.name,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRootPath, selectedProfileId, profiles, conv.currentId, conv.loading]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  // 构建 context pack（自动附加当前文档作为引用）
  const contextPack: AiContextPack | null = React.useMemo(() => {
    if (!workspaceRootPath || !currentDocument || !documentPanelData) return null;
    return buildAiContextPack({
      workspaceRootPath,
      currentDocument,
      documentPanelData,
      selection: selectedTextContext ?? null,
      intent: selectedTextContext ? 'explain-selection' : 'chat',
    });
  }, [workspaceRootPath, currentDocument, documentPanelData, selectedTextContext]);

  // mention 选项（当前文档作为 file mention 候选）
  const mentionOptions: MentionOption[] = React.useMemo(() => {
    if (!currentDocument) return [];
    return [
      {
        id: `file:${currentDocument.absolutePath}`,
        label: currentDocument.title || currentDocument.name,
        type: 'file' as const,
        path: currentDocument.relativePath || currentDocument.absolutePath,
      },
    ];
  }, [currentDocument]);

  // 发送消息
  const handleSend = React.useCallback(
    async (text: string) => {
      if (!selectedProfile || !contextPack || !transport) return;
      setIsStreaming(true);
      try {
        const stream = await transport.sendMessages({
          prompt: text,
          context: contextPack,
        });
        const reader = stream.getReader();
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
        }
      } catch {
        // 错误处理
      } finally {
        setIsStreaming(false);
      }
    },
    [selectedProfile, contextPack, transport],
  );

  const handleStop = React.useCallback(() => {
    void transport?.stop();
    setIsStreaming(false);
  }, [transport]);

  // 权限确认：允许/拒绝调用 transport.respondPermission
  const handleAllowPermission = React.useCallback(
    (requestId: string) => {
      void transport?.respondPermission(requestId, 'allow');
      setPendingPermission(null);
    },
    [transport],
  );
  const handleDenyPermission = React.useCallback(
    (requestId: string) => {
      void transport?.respondPermission(requestId, 'deny');
      setPendingPermission(null);
    },
    [transport],
  );

  // transport 创建/重建（profile/mode 变化时）。microtask 延迟避免 effect 内同步 setState。
  React.useEffect(() => {
    if (!selectedProfile || !workspaceRootPath) return;
    void Promise.resolve().then(() => {
      setTransport(
        createDefaultAiChatTransport({
          rootPath: workspaceRootPath,
          profileId: selectedProfile.id,
          mode,
          modelId: selectedProfile.modelId,
          onPermissionRequest: (chunk) => setPendingPermission(chunk),
        }),
      );
    });
  }, [selectedProfile, workspaceRootPath, mode]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：profile 选择 + 模式 + 设置 */}
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <select
          value={selectedProfileId ?? ''}
          onChange={(e) => setSelectedProfileId(e.target.value)}
          className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-xs outline-none"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <AiModeSelector mode={mode} onChange={setMode} />
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            title="AI 设置"
          >
            ⚙
          </button>
        )}
      </div>

      {/* 对话视图 */}
      <div className="min-h-0 flex-1">
        {transport ? (
          <AiConversationView
            transport={transport}
            rootPath={workspaceRootPath ?? ''}
            profileId={selectedProfileId ?? ''}
            mode={mode}
            modelId={selectedProfile?.modelId}
            isStreaming={isStreaming}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {workspaceRootPath ? '准备就绪…' : '请先打开工作区'}
          </div>
        )}
      </div>

      {/* 权限确认提示（agent 执行需授权工具时） */}
      {pendingPermission && (
        <div className="border-t px-2 py-1.5">
          <AiPermissionPrompt
            request={pendingPermission}
            onAllow={handleAllowPermission}
            onDeny={handleDenyPermission}
          />
        </div>
      )}

      {/* 输入区 */}
      <AiComposer
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
        mentionOptions={mentionOptions}
        contextAttached={!!currentDocument}
        placeholder={selectedTextContext ? '解释选中的内容…' : '输入消息，@ 提及文件…'}
      />
    </div>
  );
}

'use client';

// @author refinex
// 对话管理 hook：加载历史列表、切换、新建、搜索、Fork。
// 复用 A 子项目的 v2 存储 API（listConversationSummaries/loadConversationRecord/saveConversationRecord）。

import { useCallback, useEffect, useState } from 'react';

import {
  createEmptyConversationRecord,
  listConversationSummaries,
  loadConversationRecord,
  saveConversationRecord,
  type AiConversationRecord,
  type AiConversationSummaryV2,
} from './ai-session-store';

export interface UseConversationManagerResult {
  summaries: AiConversationSummaryV2[];
  currentId: string | null;
  currentRecord: AiConversationRecord | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  filteredSummaries: AiConversationSummaryV2[];
  refresh: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (input: {
    profileId: string;
    providerId: string;
    documentPath?: string;
    documentTitle?: string;
  }) => Promise<string>;
  forkConversation: (fromId: string) => Promise<string | null>;
}

export function useConversationManager(
  workspaceRoot: string,
): UseConversationManagerResult {
  const [summaries, setSummaries] = useState<AiConversationSummaryV2[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<AiConversationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listConversationSummaries(workspaceRoot);
      setSummaries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载对话列表失败');
    } finally {
      setLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectConversation = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const record = await loadConversationRecord(workspaceRoot, id);
        if (record) {
          setCurrentId(id);
          setCurrentRecord(record);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载对话失败');
      } finally {
        setLoading(false);
      }
    },
    [workspaceRoot],
  );

  const createConversation = useCallback(
    async (input: {
      profileId: string;
      providerId: string;
      documentPath?: string;
      documentTitle?: string;
    }) => {
      const id = `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const record = createEmptyConversationRecord({
        id,
        profileId: input.profileId,
        providerId: input.providerId,
        documentPath: input.documentPath,
        documentTitle: input.documentTitle,
      });
      await saveConversationRecord(workspaceRoot, record);
      setCurrentId(id);
      setCurrentRecord(record);
      void refresh();
      return id;
    },
    [workspaceRoot, refresh],
  );

  const forkConversation = useCallback(
    async (fromId: string): Promise<string | null> => {
      const source = await loadConversationRecord(workspaceRoot, fromId);
      if (!source) return null;
      const forkId = `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const forked: AiConversationRecord = {
        ...source,
        id: forkId,
        title: `${source.title}（副本）`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveConversationRecord(workspaceRoot, forked);
      setCurrentId(forkId);
      setCurrentRecord(forked);
      void refresh();
      return forkId;
    },
    [workspaceRoot, refresh],
  );

  // 搜索过滤（标题/documentTitle 包含 query）
  const filteredSummaries = searchQuery
    ? summaries.filter((s) => {
        const q = searchQuery.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          (s.documentTitle?.toLowerCase().includes(q) ?? false)
        );
      })
    : summaries;

  return {
    summaries,
    currentId,
    currentRecord,
    loading,
    error,
    searchQuery,
    filteredSummaries,
    refresh,
    setSearchQuery,
    selectConversation,
    createConversation,
    forkConversation,
  };
}

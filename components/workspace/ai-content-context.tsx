'use client';
import * as React from 'react';
import type { AiReference } from './ai-citation-router';
import type { KnowledgeLocation } from './workspace-knowledge-types';
export interface AiContentContextValue {
  root: string | null;
  sourceDocument?: string | null;
  openDocument?: (location: KnowledgeLocation) => void | Promise<void>;
  openResource?: (
    reference: Extract<AiReference, { kind: 'resource' | 'managed' }>,
  ) => void | Promise<void>;
}
const Context = React.createContext<AiContentContextValue>({ root: null });
export const AiContentProvider = Context.Provider;
export const useAiContentContext = () => React.useContext(Context);

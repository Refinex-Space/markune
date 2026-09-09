import type { MetadataValue } from '@/components/editor/markdown-frontmatter';

export interface KnowledgeLink {
  targetPath: string | null;
  unresolved: string | null;
  href: string;
  line: number;
  context: string;
}
export interface KnowledgeTask {
  offset: number;
  line: number;
  checked: boolean;
  text: string;
}
export interface KnowledgeDocument {
  relativePath: string;
  name: string;
  title: string;
  content: string;
  fingerprint: string;
  modifiedAt: number;
  properties: Record<string, MetadataValue>;
  tags: string[];
  links: KnowledgeLink[];
  tasks: KnowledgeTask[];
  resources: string[];
  errors: string[];
}
export type KnowledgeDocumentSummary = Omit<KnowledgeDocument, 'content'>;
export interface WorkspaceIndexPage {
  revision: number;
  reset: boolean;
  documents: KnowledgeDocument[];
  removed: string[];
  warnings: string[];
  nextCursor: number | null;
  total: number;
}

export interface KnowledgeLocation {
  fingerprint?: string;
  relativePath: string;
  line?: number;
  hash?: string | null;
}

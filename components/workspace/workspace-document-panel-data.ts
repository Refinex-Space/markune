import { parseFrontmatter } from '@/components/editor/markdown-frontmatter';

import type { DocumentPanelData } from './ai-side-panel';
import type {
  MarkdownDraft,
  RightPanelMode,
} from './workspace-types';

export function createDocumentPanelData(
  draftDocument: MarkdownDraft | null,
  rightPanelMode: RightPanelMode,
): DocumentPanelData | null {
  if (!draftDocument || !rightPanelMode) {
    return null;
  }

  const frontmatter = parseFrontmatter(draftDocument.markdown).metadata;

  return {
    frontmatter,
    markdown: draftDocument.markdown,
    metadata: {
      title: draftDocument.metadata.title,
      createdAt: draftDocument.metadata.createdAt ?? '',
      updatedAt: draftDocument.metadata.updatedAt ?? '',
    },
  };
}

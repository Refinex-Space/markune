import { parseMarkdownMetadata } from '@/components/editor/markdown-frontmatter';

import type { MarkdownDraft } from './workspace-types';

export function createSourceMarkdownDraft(
  draft: MarkdownDraft,
  markdown: string,
  fileName: string,
): MarkdownDraft {
  return {
    ...draft,
    markdown,
    metadata: parseMarkdownMetadata(markdown, fileName).metadata,
  };
}

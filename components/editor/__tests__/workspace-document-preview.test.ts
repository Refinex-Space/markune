import { describe, expect, it } from 'vitest';

import { extractDocumentPreviewText } from '@/components/editor/workspace-document-preview';

describe('extractDocumentPreviewText', () => {
  it('skips frontmatter and returns the first body paragraph', () => {
    const markdown = `---
title: Demo
updatedAt: 2026-01-01
---

# Heading

First real paragraph with enough detail for the card.

Second paragraph should be ignored.
`;

    expect(extractDocumentPreviewText(markdown)).toBe(
      'First real paragraph with enough detail for the card.',
    );
  });

  it('strips lightweight Markdown chrome from the preview', () => {
    expect(
      extractDocumentPreviewText(
        'See [Agent](./a.md) and **bold** with `code` in one line.\n',
      ),
    ).toBe('See Agent and bold with code in one line.');
  });

  it('truncates long paragraphs without a hard ellipsis glyph', () => {
    const long = `A${'b'.repeat(200)}`;
    const preview = extractDocumentPreviewText(long, 40);
    expect(preview.endsWith('…')).toBe(false);
    expect(preview.length).toBeLessThanOrEqual(40);
  });
});

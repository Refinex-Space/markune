import { describe, expect, it } from 'vitest';

import {
  findLivePositionForLocation,
  resolveRevealLine,
  visibleMarkdownLineText,
  type LiveRevealDocument,
} from '@/components/editor/markdown-editor-reveal';

function documentWithBlocks(
  blocks: Array<{ text: string; type?: string }>,
): LiveRevealDocument {
  return {
    descendants(visitor) {
      let pos = 1;
      for (const block of blocks) {
        const result = visitor(
          {
            isTextblock: true,
            textContent: block.text,
            type: { name: block.type ?? 'paragraph' },
          },
          pos,
        );
        if (result === false) {
          return;
        }
        pos += block.text.length + 2;
      }
    },
  };
}

describe('markdown-editor-reveal', () => {
  it('resolves markdown line numbers from explicit lines and L hashes', () => {
    expect(
      resolveRevealLine({ hash: '', line: 4, markdown: '# Title\n\nBody\n' }),
    ).toBe(4);
    expect(
      resolveRevealLine({ hash: 'L12', markdown: '# Title\n' }),
    ).toBe(12);
    expect(
      resolveRevealLine({
        hash: 'Agent 工程实践',
        markdown: '# Title\n\n## Agent 工程实践\n',
      }),
    ).toBe(3);
    expect(resolveRevealLine({ hash: '', markdown: '# Title\n' })).toBeUndefined();
  });

  it('strips markdown markers before matching a source line in live blocks', () => {
    expect(visibleMarkdownLineText('## Agent 工程实践')).toBe('Agent 工程实践');
    expect(visibleMarkdownLineText('- 部署拓扑和运维治理设计')).toBe(
      '部署拓扑和运维治理设计',
    );
    expect(visibleMarkdownLineText('---')).toBe('');
  });

  it('maps a search hit line onto the matching live textblock', () => {
    const position = findLivePositionForLocation({
      doc: documentWithBlocks([
        { text: 'Title', type: 'heading' },
        { text: 'Agent 工程实践' },
      ]),
      hash: '',
      headings: [{ id: 'title', text: 'Title', pos: 1 }],
      line: 3,
      markdown: '# Title\n\nAgent 工程实践\n',
    });

    expect(position).toBe(8);
  });

  it('prefers heading anchors over line mapping', () => {
    const position = findLivePositionForLocation({
      doc: documentWithBlocks([{ text: 'Source Heading', type: 'heading' }]),
      hash: 'source-heading',
      headings: [{ id: 'source-heading', text: 'Source Heading', pos: 12 }],
      line: 9,
      markdown: '# Source Heading\n',
    });

    expect(position).toBe(12);
  });

  it('maps YAML title lines onto the live heading instead of leaving them unmapped', () => {
    const position = findLivePositionForLocation({
      doc: documentWithBlocks([
        { text: '应用型AI Agent 实践', type: 'heading' },
        { text: '正文' },
      ]),
      hash: '',
      headings: [
        { id: 'ying-yong-xing-ai-agent-shi-jian', text: '应用型AI Agent 实践', pos: 1 },
      ],
      line: 3,
      markdown:
        '---\ncreatedAt: 2026-09-11\ntitle: 应用型AI Agent 实践\n---\n\n# 应用型AI Agent 实践\n',
    });

    expect(position).toBe(1);
  });

  it('lands frontmatter-only hits on the first live heading', () => {
    const position = findLivePositionForLocation({
      doc: documentWithBlocks([{ text: '应用型AI Agent 实践', type: 'heading' }]),
      hash: '',
      headings: [{ id: 'title', text: '应用型AI Agent 实践', pos: 1 }],
      line: 2,
      markdown:
        '---\ncreatedAt: 2026-09-11T21:34:37Z\ntitle: 应用型AI Agent 实践\n---\n\n# 应用型AI Agent 实践\n',
    });

    expect(position).toBe(1);
  });
});

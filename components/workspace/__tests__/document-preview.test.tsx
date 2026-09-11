import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createDocumentPreview,
  DocumentPreviewCard,
  extractPlainText,
  extractPreviewMarkdown,
} from '../document-preview';

const emptyMeta = {
  createdAt: null,
  modifiedAt: null,
  updatedAt: null,
};

describe('extractPreviewMarkdown', () => {
  it('keeps markdown structure and skips the leading heading', () => {
    const excerpt = extractPreviewMarkdown(
      [
        '# Markweave: 开源 Markdown-first WYSIWYG 编辑器',
        '',
        '**作者**: refinex',
        '',
        '**项目**: [GitHub](https://github.com/Refinex-Space/markweave)',
        '',
        '1. markweave',
        '2. @markweave/react',
      ].join('\n'),
    );

    expect(excerpt).not.toContain('# Markweave');
    expect(excerpt).toContain('**作者**: refinex');
    expect(excerpt).toContain('1. markweave');
    expect(excerpt).toContain('[GitHub]');
  });

  it('skips fenced code, mermaid, and image-only lines', () => {
    const excerpt = extractPreviewMarkdown(
      [
        '# 标题',
        '',
        '正文第一段',
        '',
        '```ts',
        'const secret = 1;',
        '```',
        '',
        '![封面](markune-asset://abc)',
        '',
        '正文第二段',
      ].join('\n'),
    );

    expect(excerpt).toBe('正文第一段\n\n正文第二段');
  });
});

describe('createDocumentPreview', () => {
  it('stores rendered markdown separately from searchable plain text', () => {
    const preview = createDocumentPreview(
      '# 手册\n\n**作者**: refinex\n\n1. markweave\n',
      emptyMeta,
    );

    expect(preview.markdown).toContain('**作者**: refinex');
    expect(preview.text).toContain('作者: refinex');
    expect(preview.text).not.toContain('**');
    expect(extractPlainText(preview.markdown)).toContain('markweave');
  });
});

describe('DocumentPreviewCard', () => {
  it('renders markdown instead of raw emphasis markers', () => {
    render(
      <DocumentPreviewCard
        preview={createDocumentPreview(
          '# 手册\n\n**作者**: refinex\n\n1. markweave\n2. @markweave/react\n',
          emptyMeta,
        )}
        title="手册"
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByTestId('document-preview-markdown')).toBeTruthy();
    expect(screen.getByText('作者')).toBeTruthy();
    expect(screen.getByText(/refinex/)).toBeTruthy();
    expect(screen.getByText('markweave')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
    expect(screen.queryByText('**作者**: refinex')).toBeNull();
    expect(screen.queryByText('# 手册')).toBeNull();

    const excerpt = screen.getByTestId('document-preview-excerpt');
    expect(excerpt.className).toContain('markune-document-preview-excerpt');
    expect(screen.getByTestId('document-preview-fade').className).toContain(
      'markune-document-preview-fade',
    );
  });

  it('treats a cached preview without markdown as still loading', () => {
    render(
      <DocumentPreviewCard
        preview={
          {
            createdAt: null,
            modifiedAt: null,
            text: '* 个性: 务实',
            updatedAt: null,
          } as never
        }
        title="Codex 配置"
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('正在提取文档摘要...')).toBeTruthy();
    expect(screen.queryByText('* 个性: 务实')).toBeNull();
    expect(screen.queryByTestId('document-preview-markdown')).toBeNull();
  });
});

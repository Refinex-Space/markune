import { describe, expect, it } from 'vitest';

import {
  extractH1FromMarkdown,
  parseMarkdownMetadata,
  parseFrontmatter,
  sanitizeTitleForFileName,
  serializeFrontmatter,
} from '@/components/editor/markdown-frontmatter';

describe('parseFrontmatter', () => {
  it('解析带 frontmatter 的文档', () => {
    const raw = '---\ntitle: 标题\ncreatedAt: 2026-01-01\n---\n\n# 正文';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata.title).toBe('标题');
    expect(body).toBe('# 正文');
  });

  it('解析 Windows CRLF 换行的 frontmatter 文档', () => {
    const raw = [
      '---',
      'title: 标题',
      'createdAt: 2026-01-01',
      '---',
      '',
      '# 正文',
    ].join('\r\n');

    const { metadata, body } = parseFrontmatter(raw);

    expect(metadata.title).toBe('标题');
    expect(metadata.createdAt).toBe('2026-01-01');
    expect(body).toBe('# 正文');
  });

  it('无 frontmatter 时 metadata 为空对象，body 为原文 trimStart', () => {
    const raw = '# 正文';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata).toEqual({});
    expect(body).toBe('# 正文');
  });

  it('不完整的 frontmatter 分隔符不当作 frontmatter', () => {
    const raw = '---\ntitle: 标题';
    const { metadata, body } = parseFrontmatter(raw);
    expect(metadata).toEqual({});
    expect(body).toBe(raw.trimStart());
  });

  it('去引号 frontmatter 值', () => {
    const { metadata } = parseFrontmatter('---\ntitle: "带引号"\n---\nx');
    expect(metadata.title).toBe('带引号');
  });
});

describe('serializeFrontmatter', () => {
  it('序列化带 metadata 的文档', () => {
    const out = serializeFrontmatter({
      body: '# 正文',
      metadata: { title: '标题', createdAt: '2026-01-01' },
    });
    expect(out).toBe('---\ntitle: 标题\ncreatedAt: 2026-01-01\n---\n\n# 正文\n');
  });

  it('空 metadata 时不输出 frontmatter', () => {
    const out = serializeFrontmatter({ body: '# 正文', metadata: {} });
    expect(out).toBe('# 正文\n');
  });

  it('省略值为空的字段', () => {
    const out = serializeFrontmatter({
      body: 'x',
      metadata: { title: 't', createdAt: '', updatedAt: '' },
    });
    expect(out).toBe('---\ntitle: t\n---\n\nx\n');
  });

  it('保留正文末行具有 Markdown 语义的尾随空格', () => {
    expect(
      serializeFrontmatter({
        body: '# 正文\n\n- [ ] \n\n',
        metadata: { title: '标题' },
      }),
    ).toBe('---\ntitle: 标题\n---\n\n# 正文\n\n- [ ] \n');

    expect(
      serializeFrontmatter({
        body: '# 正文\n\n- [ ] \n\n',
        metadata: {},
      }),
    ).toBe('# 正文\n\n- [ ] \n');
  });
});

describe('parseMarkdownMetadata', () => {
  it('title 优先级：frontmatter > H1 > 文件名', () => {
    expect(
      parseMarkdownMetadata('---\ntitle: F\n---\n\n# H1', 'file.md').metadata
        .title,
    ).toBe('F');
    expect(
      parseMarkdownMetadata('---\r\ntitle: F\r\n---\r\n\r\n# H1', 'file.md')
        .metadata.title,
    ).toBe('F');
    expect(parseMarkdownMetadata('# H1', 'file.md').metadata.title).toBe('H1');
    expect(parseMarkdownMetadata('正文', 'file.md').metadata.title).toBe('file');
  });

  it('refinexDialect 默认为 1', () => {
    expect(
      parseMarkdownMetadata('# x', 'f.md').metadata.refinexDialect,
    ).toBe(1);
  });

  it('refinexDialect 从 frontmatter 读取', () => {
    const { metadata } = parseMarkdownMetadata(
      '---\nrefinexDialect: 2\n---\n\n# x',
      'f.md',
    );
    expect(metadata.refinexDialect).toBe(2);
  });

  it('createdAt/updatedAt 默认 null', () => {
    const { metadata } = parseMarkdownMetadata('# x', 'f.md');
    expect(metadata.createdAt).toBeNull();
    expect(metadata.updatedAt).toBeNull();
  });
});

describe('extractH1FromMarkdown', () => {
  it('提取第一个 H1 文本并 trim', () => {
    expect(extractH1FromMarkdown('#  标题  \n## 子标题')).toBe('标题');
  });

  it('无 H1 返回 null', () => {
    expect(extractH1FromMarkdown('## 子标题\n正文')).toBeNull();
  });

  it('不误匹配代码块内的 H1', () => {
    expect(
      extractH1FromMarkdown('正文\n```\n# 代码里的标题\n```\n'),
    ).toBeNull();
  });

  it('跳过代码块后仍能识别真实 H1', () => {
    expect(extractH1FromMarkdown('```\n# code\n```\n\n# 真实标题')).toBe(
      '真实标题',
    );
  });

  it('处理 ~~~ 围栏代码块', () => {
    expect(
      extractH1FromMarkdown('~~~\n# code\n~~~\n\n# 真实'),
    ).toBe('真实');
  });
});

describe('sanitizeTitleForFileName', () => {
  it('替换文件系统非法字符', () => {
    expect(sanitizeTitleForFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
      'a-b-c-d-e-f-g-h-i-j',
    );
  });

  it('去除首尾点号', () => {
    expect(sanitizeTitleForFileName('...title...')).toBe('title');
  });

  it('空标题返回默认值', () => {
    expect(sanitizeTitleForFileName('   ')).toBe('未命名文档');
  });
});

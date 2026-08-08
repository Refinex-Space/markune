import { describe, expect, it } from 'vitest';

import {
  countMarkdownCharacters,
  countMarkdownLines,
  countMarkdownWords,
  extractResourceReferencesFromMarkdown,
} from '@/components/workspace/workspace-document-insights';

describe('countMarkdownCharacters', () => {
  it('统计去空白后的字符数（含 markdown 语法字符）', () => {
    expect(countMarkdownCharacters('# 标题\n\n正文 空格')).toBe(
      '#标题正文空格'.length,
    );
  });

  it('空字符串返回 0', () => {
    expect(countMarkdownCharacters('')).toBe(0);
  });

  it('undefined 返回 0', () => {
    expect(countMarkdownCharacters(undefined)).toBe(0);
  });

  it('全是空白返回 0', () => {
    expect(countMarkdownCharacters('   \n\t  ')).toBe(0);
  });
});

describe('countMarkdownWords', () => {
  it('中文按字计词，英文按单词计', () => {
    expect(countMarkdownWords('Hello 世界, this is a test')).toBe(7);
  });

  it('与字符数区分：中文文档词数不等于去空白字符数', () => {
    const markdown = '# 标题\n\n正文 空格';
    expect(countMarkdownWords(markdown)).toBe(6);
    expect(countMarkdownCharacters(markdown)).toBe(7);
  });

  it('连字符英文视为一个词', () => {
    expect(countMarkdownWords('state-of-the-art design')).toBe(2);
  });

  it('空字符串与 undefined 返回 0', () => {
    expect(countMarkdownWords('')).toBe(0);
    expect(countMarkdownWords(undefined)).toBe(0);
  });
});

describe('countMarkdownLines', () => {
  it('统计 Markdown 行数', () => {
    expect(countMarkdownLines('# 标题\n\n正文')).toBe(3);
  });

  it('空文档返回 0', () => {
    expect(countMarkdownLines('')).toBe(0);
  });
});

describe('extractResourceReferencesFromMarkdown', () => {
  it('提取 madora-asset:// 图片引用', () => {
    const markdown =
      '![图](madora-asset://abc123)\n![图2](madora-asset://def456)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      id: 'abc123',
      nodeType: 'image',
      source: 'local',
      url: 'madora-asset://abc123',
    });
    expect(refs[1]).toEqual({
      id: 'def456',
      nodeType: 'image',
      source: 'local',
      url: 'madora-asset://def456',
    });
  });

  it('提取 .madora/assets/files 相对路径图片引用', () => {
    const markdown =
      '![图](.madora/assets/files/ab/hash-a.png)\n![图2](.madora/assets/files/cd/hash-b.webp)';
    const refs = extractResourceReferencesFromMarkdown(markdown);

    expect(refs).toEqual([
      {
        id: 'hash-a',
        nodeType: 'image',
        source: 'local',
        url: '.madora/assets/files/ab/hash-a.png',
      },
      {
        id: 'hash-b',
        nodeType: 'image',
        source: 'local',
        url: '.madora/assets/files/cd/hash-b.webp',
      },
    ]);
  });

  it('不提取旧 refinex-asset:// 图片引用', () => {
    expect(
      extractResourceReferencesFromMarkdown('![图](refinex-asset://legacy)'),
    ).toEqual([]);
  });

  it('去重相同 id', () => {
    const markdown = '![图](madora-asset://abc)\n[](madora-asset://abc)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs).toHaveLength(1);
  });

  it('无引用返回空数组', () => {
    expect(extractResourceReferencesFromMarkdown('# 标题\n正文')).toEqual([]);
  });

  it('undefined 返回空数组', () => {
    expect(extractResourceReferencesFromMarkdown(undefined)).toEqual([]);
  });

  it('识别图片 vs 文件链接的 nodeType', () => {
    const markdown =
      '![图](madora-asset://img1)\n[文件](.madora/assets/files/aa/file1.pdf)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs.find((r) => r.id === 'img1')?.nodeType).toBe('image');
    expect(refs.find((r) => r.id === 'file1')?.nodeType).toBe('file');
  });

  it('提取 HTML 本地媒体引用', () => {
    const refs = extractResourceReferencesFromMarkdown(
      '<video src=".madora/assets/files/ab/video1.mp4"></video>',
    );

    expect(refs).toEqual([
      {
        id: 'video1',
        nodeType: 'video',
        source: 'local',
        url: '.madora/assets/files/ab/video1.mp4',
      },
    ]);
  });

  it('保留引用出现顺序', () => {
    const markdown =
      '[b](madora-asset://second)\n![a](madora-asset://first)';
    const refs = extractResourceReferencesFromMarkdown(markdown);
    expect(refs.map((r) => r.id)).toEqual(['second', 'first']);
  });

  it('提取 Markdown 远程图片 URL', () => {
    const refs = extractResourceReferencesFromMarkdown(
      '![Octarine](https://octarine.app/img/og/base.png)',
    );

    expect(refs).toEqual([
      {
        id: 'https://octarine.app/img/og/base.png',
        nodeType: 'image',
        source: 'remote',
        url: 'https://octarine.app/img/og/base.png',
      },
    ]);
  });

  it('提取 HTML img 远程图片 URL', () => {
    const refs = extractResourceReferencesFromMarkdown(
      '<img src="https://example.com/cover.webp" alt="cover">',
    );

    expect(refs).toEqual([
      {
        id: 'https://example.com/cover.webp',
        nodeType: 'image',
        source: 'remote',
        url: 'https://example.com/cover.webp',
      },
    ]);
  });

  it('提取 octarine-link-preview 注释中的远程图片 URL', () => {
    const refs = extractResourceReferencesFromMarkdown(
      '<!--octarine-link-preview:{"image":"https://octarine.app/img/og/base.png"}-->',
    );

    expect(refs).toEqual([
      {
        id: 'https://octarine.app/img/og/base.png',
        nodeType: 'image',
        source: 'remote',
        url: 'https://octarine.app/img/og/base.png',
      },
    ]);
  });
});

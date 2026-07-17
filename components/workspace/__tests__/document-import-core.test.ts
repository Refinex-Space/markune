import { describe, expect, it } from 'vitest';

import {
  decodeTextSource,
  prepareHtmlImport,
  prepareMarkdownImport,
} from '../document-import-core';

const markdownSource = {
  fileName: '说明.markdown',
  format: 'markdown' as const,
  size: 1,
  sourceId: 'source-markdown',
};

describe('document import core', () => {
  it('normalizes frontmatter and rewrites portable local images without touching remote URLs', async () => {
    const prepared = await prepareMarkdownImport(
      markdownSource,
      new TextEncoder().encode(
        [
          '---',
          'title: 跨平台说明',
          'createdAt: 2026-07-17T00:00:00.000Z',
          '---',
          '',
          '# 跨平台说明',
          '',
          '![本地图](images\\示例.png)',
          '',
          '![远程图](https://example.com/a.png)',
        ].join('\r\n'),
      ),
    );

    expect(prepared.title).toBe('跨平台说明');
    expect(prepared.markdown).not.toContain('\r');
    expect(prepared.markdown).toContain('# 跨平台说明');
    expect(prepared.markdown).toContain('madora-import://asset/');
    expect(prepared.markdown).toContain('https://example.com/a.png');
    expect(prepared.assets).toEqual([
      expect.objectContaining({
        fileName: '示例.png',
        kind: 'source',
        mediaType: 'image/png',
        reference: 'images\\示例.png',
      }),
    ]);
    expect(prepared.warnings).toContain(
      '远程图片未本地化，已保留原链接：https://example.com/a.png',
    );
  });

  it('sanitizes HTML, preserves semantic GFM, and extracts data URI images', async () => {
    const prepared = await prepareHtmlImport({
      html: [
        '<html><head><title> HTML\n标题 </title><style>p{color:red}</style></head>',
        '<body onload="steal()"><script>steal()</script>',
        '<h1>正文标题</h1><p onclick="steal()">正文 <a href="javascript:steal()">危险链接</a></p>',
        '<pre><code class="language-ts">const value = 1;</code></pre>',
        '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>',
        '<img alt="像素" src="data:image/png;base64,iVBORw0KGgo=">',
        '</body></html>',
      ].join(''),
      source: {
        fileName: 'page.html',
        format: 'html',
        size: 1,
        sourceId: 'source-html',
      },
    });

    expect(prepared.title).toBe('HTML 标题');
    expect(prepared.markdown).toContain('# HTML 标题');
    expect(prepared.markdown).toContain('```ts');
    expect(prepared.markdown).toContain('| A |');
    expect(prepared.markdown).not.toContain('steal()');
    expect(prepared.markdown).not.toContain('javascript:');
    expect(prepared.markdown).toContain('madora-import://asset/');
    expect(prepared.assets).toEqual([
      expect.objectContaining({ kind: 'inline', mediaType: 'image/png', size: 8 }),
    ]);
  });

  it('decodes UTF-16 BOM and rejects non-Unicode Markdown', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x23, 0x00, 0x20, 0x00, 0x41, 0x00]);
    expect(decodeTextSource(utf16, 'markdown').text).toBe('# A');
    expect(() =>
      decodeTextSource(new Uint8Array([0x81, 0x81, 0x81]), 'markdown'),
    ).toThrow('Markdown 不是有效 UTF-8/UTF-16 文本');
  });
});

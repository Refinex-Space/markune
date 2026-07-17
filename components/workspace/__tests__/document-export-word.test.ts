import { describe, expect, it } from 'vitest';

import {
  buildWordSemanticDocument,
  packWordDocument,
} from '../document-export-word';

describe('document export Word model', () => {
  it('maps headings, nested lists, code, quotes, merged tables, tasks, and SVG', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <article>
        <h1 id="intro">标题</h1>
        <p><strong>粗体</strong>与<a href="https://example.com">链接</a></p>
        <ul><li>一级<ul><li>二级</li></ul></li></ul>
        <ul><li><span class="madora-export-task-marker">☑</span> 完成</li></ul>
        <blockquote><p>引用</p></blockquote>
        <pre><code>const value = 1;</code></pre>
        <table><thead><tr><th colspan="2">表头</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>
        <div class="mermaid"><svg viewBox="0 0 200 100"><text x="10" y="20">A → B</text></svg></div>
        <div class="tiptap-mathematics-render" data-latex="E = mc^2" data-type="block-math"><span class="katex">E = mc²</span></div>
      </article>
    `;

    const semantic = buildWordSemanticDocument(root);

    expect(semantic.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ headingLevel: 1, bookmark: 'intro' }),
        expect.objectContaining({
          list: expect.objectContaining({ kind: 'bullet', level: 1 }),
        }),
        expect.objectContaining({
          list: expect.objectContaining({ kind: 'task', checked: true }),
        }),
        expect.objectContaining({ quote: true }),
        expect.objectContaining({ type: 'code' }),
        expect.objectContaining({
          type: 'table',
          rows: expect.arrayContaining([
            expect.objectContaining({
              cells: expect.arrayContaining([
                expect.objectContaining({ columnSpan: 2 }),
              ]),
            }),
          ]),
        }),
        expect.objectContaining({ type: 'image', svg: expect.any(String) }),
        expect.objectContaining({
          type: 'image',
          alt: 'E = mc^2',
          svg: expect.stringContaining('foreignObject'),
        }),
      ]),
    );
  });

  it('packs a semantic document into a DOCX zip', async () => {
    const packed = await packWordDocument(
      {
        warnings: [],
        blocks: [
          {
            type: 'paragraph',
            headingLevel: 1,
            runs: [{ text: '专业导出' }],
          },
          {
            type: 'table',
            rows: [
              {
                cells: [
                  {
                    columnSpan: 1,
                    header: true,
                    rowSpan: 1,
                    runs: [{ text: '字段' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      '专业导出',
    );

    expect(Array.from(packed.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    expect(packed.warnings).toEqual([]);
  });
});

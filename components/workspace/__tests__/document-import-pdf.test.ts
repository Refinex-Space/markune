import { describe, expect, it } from 'vitest';

import {
  reconstructPdfLines,
  reconstructStructuredPdfMarkdown,
} from '../document-import-pdf';

describe('PDF import layout recovery', () => {
  it('recovers line order, spaces Latin words, and promotes large headings', () => {
    const lines = reconstructPdfLines(
      [
        { str: '正文', transform: [1, 0, 0, 12, 20, 80], width: 24 },
        { str: 'World', transform: [1, 0, 0, 12, 70, 60], width: 30 },
        { str: 'Hello', transform: [1, 0, 0, 12, 20, 60], width: 30 },
        { str: '标题', transform: [1, 0, 0, 28, 20, 110], width: 56 },
      ],
      400,
    );

    expect(lines.map((line) => line.markdown)).toEqual([
      '## 标题',
      '正文',
      'Hello World',
    ]);
  });

  it('reads a stable two-column page from the left column before the right', () => {
    const items = Array.from({ length: 6 }, (_, index) => [
      {
        str: `L${index + 1}`,
        transform: [1, 0, 0, 12, 20, 180 - index * 20],
        width: 20,
      },
      {
        str: `R${index + 1}`,
        transform: [1, 0, 0, 12, 240, 180 - index * 20],
        width: 20,
      },
    ]).flat();

    expect(reconstructPdfLines(items, 400).map((line) => line.text)).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'L6',
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'R6',
    ]);
  });

  it('prefers tagged structure order for headings, lists, quotes, and tables', () => {
    const text = (id: string, value: string) => [
      { id, type: 'beginMarkedContentProps' },
      { str: value, transform: [1, 0, 0, 12, 20, 100], width: 40 },
      { type: 'endMarkedContent' },
    ];
    const items = [
      ...text('paragraph', '正文'),
      ...text('heading', '标题'),
      ...text('item', '项目'),
      ...text('quote', '引用'),
      ...text('header', '列名'),
      ...text('cell', '内容'),
    ];
    const content = (id: string) => ({ id, type: 'content' });

    expect(
      reconstructStructuredPdfMarkdown(
        items,
        {
          role: 'Root',
          children: [
            { role: 'H1', children: [content('heading')] },
            { role: 'P', children: [content('paragraph')] },
            {
              role: 'L',
              children: [{ role: 'LI', children: [content('item')] }],
            },
            { role: 'BlockQuote', children: [content('quote')] },
            {
              role: 'Table',
              children: [
                {
                  role: 'TR',
                  children: [{ role: 'TH', children: [content('header')] }],
                },
                {
                  role: 'TR',
                  children: [{ role: 'TD', children: [content('cell')] }],
                },
              ],
            },
          ],
        },
        400,
      ),
    ).toBe(
      [
        '# 标题',
        '',
        '正文',
        '',
        '- 项目',
        '',
        '> 引用',
        '',
        '| 列名 |',
        '| --- |',
        '| 内容 |',
      ].join('\n'),
    );
  });
});

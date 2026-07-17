import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
} from 'docx';
import { describe, expect, it } from 'vitest';

import { prepareWordImport } from '../document-import-word';

describe('Word document import', () => {
  it('converts a real DOCX heading, list, table, and embedded image to Markdown', async () => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      ),
      (value) => value.charCodeAt(0),
    );
    const docx = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: '专业导入', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: '第一项', bullet: { level: 0 } }),
            new Table({
              rows: [
                new TableRow({
                  children: [new TableCell({ children: [new Paragraph('字段')] })],
                }),
                new TableRow({
                  children: [new TableCell({ children: [new Paragraph('内容')] })],
                }),
              ],
            }),
            new Paragraph({
              children: [
                new ImageRun({
                  data: png,
                  transformation: { height: 1, width: 1 },
                  type: 'png',
                }),
              ],
            }),
          ],
        },
      ],
    });
    const bytes = new Uint8Array(await Packer.toBuffer(docx));

    const prepared = await prepareWordImport(
      {
        fileName: 'professional.docx',
        format: 'word',
        size: bytes.byteLength,
        sourceId: 'source-word',
      },
      bytes,
    );

    expect(prepared.title).toBe('专业导入');
    expect(prepared.markdown).toContain('# 专业导入');
    expect(prepared.markdown).toContain('- 第一项');
    expect(prepared.markdown).toContain('| 字段 |');
    expect(prepared.markdown).toContain('| 内容 |');
    expect(prepared.markdown).toContain('madora-import://asset/');
    expect(prepared.assets).toEqual([
      expect.objectContaining({ kind: 'inline', mediaType: 'image/png' }),
    ]);
  });
});
